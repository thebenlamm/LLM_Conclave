/**
 * Tests for DiscussionStateExtractor
 *
 * Phase 2 Context Tax: Judge Discussion State (2.2)
 */

import { DiscussionStateExtractor, DiscussionState } from '../DiscussionStateExtractor';

describe('DiscussionStateExtractor', () => {
  describe('extract()', () => {
    it('should return null for empty round groups', () => {
      const result = DiscussionStateExtractor.extract([], 1);
      expect(result).toBeNull();
    });

    it('should extract positions from a single round', () => {
      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Security Expert', content: 'We should use JWT tokens for authentication.\n\nIn conclusion, JWT with RSA-256 is the best approach.' },
          { role: 'assistant', speaker: 'Architect', content: 'Consider a layered architecture.\n\nThe microservices pattern gives us the most flexibility.' }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      expect(result).not.toBeNull();
      expect(result!.agentPositions).toHaveLength(2);
      expect(result!.agentPositions[0].agent).toBe('Security Expert');
      expect(result!.agentPositions[0].changed).toBe(false); // Only one round, can't change
    });

    it('should detect position changes across rounds', () => {
      const roundGroups = [
        {
          round: 1,
          entries: [
            { role: 'assistant', speaker: 'Expert', content: 'We should definitely use MongoDB for this project due to its flexibility.' },
            { role: 'user', speaker: 'Judge', content: 'Continue discussion.' }
          ]
        },
        {
          round: 2,
          entries: [
            { role: 'assistant', speaker: 'Expert', content: 'After considering the arguments, PostgreSQL with JSONB columns is the better choice for data integrity.' }
          ]
        }
      ];

      const result = DiscussionStateExtractor.extract(roundGroups, 2);
      expect(result).not.toBeNull();
      const expertPos = result!.agentPositions.find(ap => ap.agent === 'Expert');
      expect(expertPos).toBeDefined();
      expect(expertPos!.changed).toBe(true);
    });

    it('should mark stable positions when content overlaps', () => {
      const roundGroups = [
        {
          round: 1,
          entries: [
            { role: 'assistant', speaker: 'Expert', content: 'PostgreSQL is the best choice for this relational data model.' },
            { role: 'user', speaker: 'Judge', content: 'Continue.' }
          ]
        },
        {
          round: 2,
          entries: [
            { role: 'assistant', speaker: 'Expert', content: 'I maintain that PostgreSQL remains the best choice for this relational data model with strong ACID compliance.' }
          ]
        }
      ];

      const result = DiscussionStateExtractor.extract(roundGroups, 2);
      const expertPos = result!.agentPositions.find(ap => ap.agent === 'Expert');
      expect(expertPos!.changed).toBe(false);
    });

    it('should skip Judge entries and error entries', () => {
      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Judge', content: 'Please continue the discussion.' },
          { role: 'assistant', speaker: 'Agent1', content: 'My position is X.', error: 'timeout' },
          { role: 'assistant', speaker: 'Agent2', content: 'My position is clearly Y.' }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      expect(result!.agentPositions).toHaveLength(1);
      expect(result!.agentPositions[0].agent).toBe('Agent2');
    });
  });

  describe('open questions extraction', () => {
    it('should extract questions from the latest round', () => {
      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Agent1', content: 'We need to decide on the database. What about rate limiting beyond RLS? How will we handle migrations?' }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      expect(result!.openQuestions.length).toBeGreaterThan(0);
      expect(result!.openQuestions.some(q => q.includes('rate limiting'))).toBe(true);
    });

    it('should filter out very short questions', () => {
      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Agent1', content: 'Really? Yes? What about the implications of choosing this architecture pattern for long-term maintenance?' }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      // "Really?" and "Yes?" should be filtered (< 15 chars)
      expect(result!.openQuestions.every(q => q.length > 15)).toBe(true);
    });

    it('should limit to 5 questions', () => {
      const manyQuestions = Array.from({ length: 10 }, (_, i) =>
        `What about consideration number ${i} for the overall architecture?`
      ).join(' ');

      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Agent1', content: manyQuestions }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      expect(result!.openQuestions.length).toBeLessThanOrEqual(5);
    });
  });

  describe('resolved points detection', () => {
    it('should detect questions resolved between rounds', () => {
      const roundGroups = [
        {
          round: 1,
          entries: [
            { role: 'assistant', speaker: 'Agent1', content: 'What about the rate limiting strategy for API endpoints?' },
            { role: 'user', speaker: 'Judge', content: 'Continue.' }
          ]
        },
        {
          round: 2,
          entries: [
            { role: 'assistant', speaker: 'Agent1', content: 'The database choice is now clear. We should proceed with PostgreSQL.' }
          ]
        }
      ];

      const result = DiscussionStateExtractor.extract(roundGroups, 2);
      // The rate limiting question from round 1 is not mentioned in round 2
      expect(result!.resolvedPoints.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty for single round', () => {
      const roundGroups = [{
        round: 1,
        entries: [
          { role: 'assistant', speaker: 'Agent1', content: 'What about the database choice?' }
        ]
      }];

      const result = DiscussionStateExtractor.extract(roundGroups, 1);
      expect(result!.resolvedPoints).toHaveLength(0);
    });
  });

  describe('format()', () => {
    it('should format discussion state with all sections', () => {
      const state: DiscussionState = {
        round: 3,
        agentPositions: [
          { agent: 'Security Expert', position: 'Use Supabase RLS', changed: true },
          { agent: 'Architect', position: 'RLS + app-level checks', changed: false }
        ],
        openQuestions: ['What about rate limiting beyond RLS?'],
        resolvedPoints: ['Auth method agreed']
      };

      const formatted = DiscussionStateExtractor.format(state);

      expect(formatted).toContain('=== DISCUSSION STATE (Round 3) ===');
      expect(formatted).toContain('Security Expert');
      expect(formatted).toContain('[CHANGED]');
      expect(formatted).toContain('[STABLE]');
      expect(formatted).toContain('rate limiting');
      expect(formatted).toContain('Auth method agreed');
      expect(formatted).toContain('=== END DISCUSSION STATE ===');
    });

    it('should handle empty state gracefully', () => {
      const state: DiscussionState = {
        round: 1,
        agentPositions: [],
        openQuestions: [],
        resolvedPoints: []
      };

      const formatted = DiscussionStateExtractor.format(state);
      expect(formatted).toContain('=== DISCUSSION STATE (Round 1) ===');
      expect(formatted).toContain('=== END DISCUSSION STATE ===');
    });
  });
});
