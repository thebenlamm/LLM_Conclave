import { SpeakerSelector, AgentInfo } from '../SpeakerSelector';
import { EventBus } from '../EventBus';
import ProviderFactory from '../../providers/ProviderFactory';

// Mock ProviderFactory
jest.mock('../../providers/ProviderFactory', () => ({
  createProvider: jest.fn()
}));

describe('SpeakerSelector', () => {
  let selector: SpeakerSelector;
  let eventBus: EventBus;
  let mockProvider: { chat: jest.Mock };

  const agentInfos: AgentInfo[] = [
    { name: 'ChiefArchitect', model: 'gpt-4', expertise: 'High-level design' },
    { name: 'Architect', model: 'gpt-4', expertise: 'System design' },
    { name: 'gpt-4', model: 'gpt-4', expertise: 'General' },
    { name: 'gpt-4o', model: 'gpt-4o', expertise: 'Advanced' },
    { name: 'security-expert', model: 'claude-3', expertise: 'Security' },
    { name: 'security', model: 'gpt-4', expertise: 'Basic security' }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus = EventBus.getInstance();
    // Dummy error listener to prevent Node from crashing on 'error' emit
    eventBus.on('error', () => {});
    
    mockProvider = {
      chat: jest.fn()
    };
    (ProviderFactory.createProvider as jest.Mock).mockReturnValue(mockProvider);

    selector = new SpeakerSelector(agentInfos, 'gpt-4o-mini', eventBus);
  });

  describe('detectHandoff', () => {
    test('should detect @mention syntax', () => {
      expect(selector.detectHandoff('I agree with @Architect')).toBe('Architect');
      expect(selector.detectHandoff('Please ask @security-expert')).toBe('security-expert');
      expect(selector.detectHandoff('Pass to @gpt-4')).toBe('gpt-4');
    });

    test('should detect natural language patterns', () => {
      expect(selector.detectHandoff("I'd like to hear from Architect")).toBe('Architect');
      expect(selector.detectHandoff('What does Architect think?')).toBe('Architect');
      expect(selector.detectHandoff('Architect should weigh in')).toBe('Architect');
    });

    test('should be case insensitive', () => {
      expect(selector.detectHandoff('@ARCHITECT please')).toBe('Architect');
      expect(selector.detectHandoff('@architect please')).toBe('Architect');
    });

    test('should handle ambiguity correctly (priority matching)', () => {
      // "Architect" should match "Architect", not "ChiefArchitect"
      expect(selector.detectHandoff('@Architect')).toBe('Architect');
      
      // "gpt-4" should match "gpt-4", not "gpt-4o"
      expect(selector.detectHandoff('@gpt-4')).toBe('gpt-4');
    });

    test('should return null for no match', () => {
      expect(selector.detectHandoff('@UnknownAgent')).toBeNull();
      expect(selector.detectHandoff('I think this is good.')).toBeNull();
    });

    test('should handle agents with hyphens and numbers', () => {
      expect(selector.detectHandoff('@gpt-4o')).toBe('gpt-4o');
      expect(selector.detectHandoff('@security-expert')).toBe('security-expert');
    });

    test('should ignore negated handoff requests', () => {
      expect(selector.detectHandoff("I don't think we should pass to Architect")).toBeNull();
      expect(selector.detectHandoff("We shouldn't hear from Security yet")).toBeNull();
      expect(selector.detectHandoff("I do not want to pass to gpt-4")).toBeNull();
      expect(selector.detectHandoff("Avoid asking Architect right now")).toBeNull();
    });

    test('should ignore quoted handoff requests', () => {
      expect(selector.detectHandoff("The user said 'pass to Architect'")).toBeNull();
      expect(selector.detectHandoff('He asked "what does Architect think" earlier')).toBeNull();
    });

    test('should still detect positive handoffs after negative ones', () => {
      // Negated then positive
      expect(selector.detectHandoff("I don't think we should pass to Architect, but over to Security")).toBe('security');
    });

    test('should NOT trigger false positives on common phrases (stricter matching)', () => {
      // These should NOT trigger handoffs because they're common phrases, not agent mentions
      expect(selector.detectHandoff('I will check the security logs')).toBeNull();
      expect(selector.detectHandoff('We need to review the security policy')).toBeNull();
      expect(selector.detectHandoff('The architecture looks good')).toBeNull();
      expect(selector.detectHandoff('This is a security-critical feature')).toBeNull();
    });

    test('should match agent names at word boundaries only', () => {
      // "security" should match agent "security" or "security-expert"
      expect(selector.detectHandoff('@security')).toBe('security');
      expect(selector.detectHandoff('@security-expert')).toBe('security-expert');
      // But NOT random text that happens to contain the word
      expect(selector.detectHandoff('The security-policy needs updating')).toBeNull();
    });
  });

  describe('extractExpertise', () => {
    test('should extract expertise from patterns', () => {
      expect(SpeakerSelector.extractExpertise('You are a security expert.', 'Agent')).toBe('security expert');
      expect(SpeakerSelector.extractExpertise('You specialize in performance optimization.', 'Agent')).toBe('performance optimization');
      // Regex captures until period, so "database design is key" is correct behavior for this pattern
      expect(SpeakerSelector.extractExpertise('Your focus on database design is key.', 'Agent')).toBe('database design is key');
    });

    test('should fallback to first sentence or name if no pattern matches', () => {
      expect(SpeakerSelector.extractExpertise('Just a general assistant.', 'Helper')).toBe('Just a general assistant');
      expect(SpeakerSelector.extractExpertise('', 'Helper')).toBe('Helper');
    });
  });

  describe('selectNextSpeaker', () => {
    test('should optimize binary choice (skip LLM)', async () => {
      const smallInfos = [
        { name: 'A', model: 'gpt-4', expertise: 'A' },
        { name: 'B', model: 'gpt-4', expertise: 'B' }
      ];
      const smallSelector = new SpeakerSelector(smallInfos, 'gpt-4o-mini', eventBus);

      // If A just spoke, only B is valid (no repeats). 1 candidate -> Auto-select B.
      const result = await smallSelector.selectNextSpeaker([], 'A', 'msg', 1, 'task');
      
      expect(result.nextSpeaker).toBe('B');
      expect(result.reason).toBe('Only valid alternative candidate');
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    test('should call LLM when multiple candidates exist', async () => {
      // Must return a valid candidate that isn't 'gpt-4' (the last speaker)
      const resultData = { nextSpeaker: 'Architect', reason: 'Best fit', confidence: 0.9 };
      mockProvider.chat.mockResolvedValue(JSON.stringify(resultData));

      // 3 agents total. 'gpt-4' spoke. Candidates: ChiefArchitect, Architect, gpt-4o, security...
      const result = await selector.selectNextSpeaker([], 'gpt-4', 'msg', 1, 'task');

      expect(mockProvider.chat).toHaveBeenCalled();
      expect(result.nextSpeaker).toBe('Architect');
    });

    test('should honor explicit handoff', async () => {
      const result = await selector.selectNextSpeaker([], 'Architect', 'I handoff to @security-expert', 1, 'task');

      expect(result.nextSpeaker).toBe('security-expert');
      expect(result.handoffRequested).toBe(true);
      expect(mockProvider.chat).not.toHaveBeenCalled();
    });

    test('should ignore handoff to non-existent agent', async () => {
      // Return a VALID candidate (security-expert) so we don't hit the fallback logic
      const resultData = { nextSpeaker: 'security-expert', reason: 'Best fit', confidence: 0.8 };
      mockProvider.chat.mockResolvedValue(JSON.stringify(resultData));

      const result = await selector.selectNextSpeaker([], 'Architect', 'Handoff to @Ghost', 1, 'task');

      // Should fall through to LLM selection because @Ghost doesn't exist
      expect(mockProvider.chat).toHaveBeenCalled();
      expect(result.nextSpeaker).toBe('security-expert');
    });

    test('should allow LLM to end round', async () => {
      mockProvider.chat.mockResolvedValue(JSON.stringify({ shouldContinue: false }));

      const result = await selector.selectNextSpeaker([], 'Architect', 'msg', 1, 'task');

      expect(result.shouldContinue).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should end round on invalid JSON (prevent zombie round)', async () => {
      mockProvider.chat.mockResolvedValue('Invalid JSON Response');

      const result = await selector.selectNextSpeaker([], 'Architect', 'msg', 1, 'task');

      // Should end round instead of continuing randomly (prevents "zombie round")
      expect(result.reason).toContain('ending round');
      expect(result.shouldContinue).toBe(false);
      expect(result.confidence).toBe(0.0);
      expect(result.nextSpeaker).toBe('');
    });

    test('should end round if LLM selects non-existent agent', async () => {
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'Ghost', shouldContinue: true }));

      const result = await selector.selectNextSpeaker([], 'Architect', 'msg', 1, 'task');

      // Should end round when LLM returns invalid agent
      expect(result.reason).toContain('ending round');
      expect(result.shouldContinue).toBe(false);
    });

    test('should end round and emit error on provider failure', async () => {
      mockProvider.chat.mockRejectedValue(new Error('API Failure'));
      const emitSpy = jest.spyOn(eventBus, 'emitEvent');

      const result = await selector.selectNextSpeaker([], 'Architect', 'msg', 1, 'task');

      expect(result.reason).toContain('ending round');
      expect(result.shouldContinue).toBe(false);
      expect(emitSpy).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('API Failure')
      }));
    });

    test('should trigger circuit breaker after max consecutive failures', async () => {
      // 1. Fail 3 times
      mockProvider.chat.mockRejectedValue(new Error('API Failure'));
      
      // Call 1
      await selector.selectNextSpeaker([], 'A', 'msg', 1, 'task');
      // Call 2
      await selector.selectNextSpeaker([], 'A', 'msg', 1, 'task');
      // Call 3
      await selector.selectNextSpeaker([], 'A', 'msg', 1, 'task');
      
      expect(mockProvider.chat).toHaveBeenCalledTimes(3);
      
      // 2. 4th call should use circuit breaker (no LLM call)
      mockProvider.chat.mockClear();
      const result = await selector.selectNextSpeaker([], 'A', 'msg', 1, 'task');
      
      expect(mockProvider.chat).not.toHaveBeenCalled();
      expect(result.reason).toContain('Circuit breaker');
      
      // 3. Reset
      selector.startNewRound();
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'B', shouldContinue: true }));
      
      await selector.selectNextSpeaker([], 'A', 'msg', 2, 'task');
      expect(mockProvider.chat).toHaveBeenCalled();
    });
  });

  describe('handoff loop prevention', () => {
    test('should prevent A->B->A ping-pong loops', async () => {
      // 1. ChiefArchitect hands to Architect (allowed)
      let result = await selector.selectNextSpeaker([], 'ChiefArchitect', 'over to @Architect', 1, 'task');
      expect(result.nextSpeaker).toBe('Architect');
      expect(result.handoffRequested).toBe(true);

      // 2. Architect hands back to ChiefArchitect (denied - loop detected)
      // Mock LLM to pick 'security-expert' to prove fallback occurred
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'security-expert' }));
      
      result = await selector.selectNextSpeaker([], 'Architect', 'back to @ChiefArchitect', 1, 'task');
      
      expect(result.nextSpeaker).toBe('security-expert'); 
    });

    test('should limit handoff chain depth', async () => {
      selector.startNewRound();
      // 1. Chief -> Architect
      await selector.selectNextSpeaker([], 'ChiefArchitect', 'to @Architect', 1, 'task');
      
      // 2. Architect -> security-expert
      await selector.selectNextSpeaker([], 'Architect', 'to @security-expert', 1, 'task');
      
      // 3. security-expert -> gpt-4
      // Current implementation allows depth 0, 1, 2. This is request at depth 2. Allowed.
      await selector.selectNextSpeaker([], 'security-expert', 'to @gpt-4', 1, 'task');

      // 4. gpt-4 -> gpt-4o (Request at depth 3. Should be blocked if limit is > 2)
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'security' }));
      
      const result = await selector.selectNextSpeaker([], 'gpt-4', 'to @gpt-4o', 1, 'task');
      
      expect(result.nextSpeaker).toBe('security');
      expect(result.handoffRequested).toBe(false);
    });
  });

  describe('failed agent handling', () => {
    test('should exclude failed agents from selection and end round if LLM picks excluded agent', async () => {
      const excludeSet = new Set(['ChiefArchitect']);

      // Mock LLM to return an excluded agent
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'ChiefArchitect' }));

      const result = await selector.selectNextSpeaker(
        [], 'gpt-4', 'msg', 1, 'task', excludeSet
      );

      // ChiefArchitect is excluded, so LLM selection fails validation
      // New behavior: end round instead of random selection (prevents zombie rounds)
      expect(result.nextSpeaker).not.toBe('ChiefArchitect');
      expect(result.shouldContinue).toBe(false);
      expect(result.reason).toContain('ending round');
    });

    test('should successfully select non-excluded agent when LLM returns valid choice', async () => {
      const excludeSet = new Set(['ChiefArchitect']);

      // Mock LLM to return a valid (non-excluded) agent
      mockProvider.chat.mockResolvedValue(JSON.stringify({ nextSpeaker: 'Architect', shouldContinue: true }));

      const result = await selector.selectNextSpeaker(
        [], 'gpt-4', 'msg', 1, 'task', excludeSet
      );

      expect(result.nextSpeaker).toBe('Architect');
      expect(result.shouldContinue).toBe(true);
    });

    test('should return empty result if all agents excluded', async () => {
      const allNames = agentInfos.map(a => a.name);
      const excludeSet = new Set(allNames);
      
      const result = await selector.selectNextSpeaker(
        [], 'gpt-4', 'msg', 1, 'task', excludeSet
      );
      
      expect(result.nextSpeaker).toBe('');
      expect(result.shouldContinue).toBe(false);
    });
  });
});