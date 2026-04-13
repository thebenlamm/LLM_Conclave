import { PersonaSystem } from '../PersonaSystem';

// These tests verify the Phase 15.1 anti-impersonation clause is present in
// the PARTICIPATION_REQUIREMENT constant and is auto-propagated to every
// persona via buildPromptSuffix() (used by personasToAgents and
// resolveConsultPanel).

describe('PARTICIPATION_REQUIREMENT (Phase 15.1)', () => {
  // PARTICIPATION_REQUIREMENT is not exported directly. We assert via the
  // assembled systemPrompt on any built-in persona, which is equivalent:
  // personasToAgents appends buildPromptSuffix() which contains
  // PARTICIPATION_REQUIREMENT verbatim.
  const security = PersonaSystem.getPersona('security');
  const agents = PersonaSystem.personasToAgents(security ? [security] : []);
  const assembled = agents['Security Expert']?.systemPrompt ?? '';

  it('assembled persona prompt contains "Speak only as yourself"', () => {
    expect(assembled).toContain('Speak only as yourself');
  });

  it('assembled persona prompt contains "never invent additional advisor personas"', () => {
    expect(assembled).toContain('never invent additional advisor personas');
  });

  it('assembled persona prompt contains plain-prose example "Security Expert argued"', () => {
    expect(assembled).toContain('Security Expert argued');
  });
});

describe('buildPromptSuffix (Phase 15.1)', () => {
  it('built-in "security" persona suffix contains anti-impersonation clause', () => {
    const security = PersonaSystem.getPersona('security');
    expect(security).toBeDefined();
    const agents = PersonaSystem.personasToAgents([security!]);
    const prompt = agents['Security Expert']?.systemPrompt ?? '';
    expect(prompt).toContain('Speak only as yourself');
  });

  it('synthetic custom persona suffix also contains anti-impersonation clause', () => {
    const custom = {
      name: 'Test Advisor',
      description: 'Synthetic test persona',
      model: 'claude-sonnet-4-5',
      provider: 'anthropic',
      systemPrompt: 'You are a test advisor.',
      preferredFor: []
    };
    const agents = PersonaSystem.personasToAgents([custom]);
    const prompt = agents['Test Advisor']?.systemPrompt ?? '';
    expect(prompt).toContain('Speak only as yourself');
    expect(prompt).toContain('never invent additional advisor personas');
  });
});
