/**
 * Tests for ContextOptimizer
 *
 * Validates cascading extraction of structured output sections
 * and compression of agent responses for inter-agent consumption.
 */

import { ContextOptimizer } from '../ContextOptimizer';

describe('ContextOptimizer', () => {
  describe('extractPosition()', () => {
    it('should extract position from XML tags', () => {
      const content = `<reasoning>
I've analyzed the options carefully. JWT has several advantages over session-based auth.
</reasoning>

<position>
JWT with RSA-256 is the best approach for this microservices architecture. It enables stateless auth across services without shared session storage. The main trade-off is token size, which is acceptable for our use case.
</position>`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toContain('JWT with RSA-256');
      expect(result).toContain('stateless auth');
      expect(result).not.toContain('analyzed the options');
    });

    it('should extract position from markdown heading', () => {
      const content = `## Reasoning
I think we should consider the performance implications.

## Position
We should use PostgreSQL with proper indexing. The relational model fits our query patterns better than NoSQL.`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toContain('PostgreSQL');
      expect(result).not.toContain('performance implications');
    });

    it('should extract position from bold statement', () => {
      const content = `After considering all the trade-offs, here is my stance.

**My position: We should adopt a microservices architecture with event-driven communication between services.**

This would allow independent scaling.`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toContain('microservices architecture');
    });

    it('should fall back to last paragraph when no structured output', () => {
      const content = `There are many things to consider about this architecture.

The performance characteristics vary widely.

We should use a monolithic architecture initially and extract services as needed based on actual scaling requirements.`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toContain('monolithic architecture');
    });

    it('should handle short last paragraph by taking last 2', () => {
      const content = `First paragraph with lots of context about the problem.

The recommended approach is to use caching extensively with Redis.

I agree.`;

      const result = ContextOptimizer.extractPosition(content);
      // Short last paragraph should extend to include previous one
      expect(result).toContain('caching');
    });

    it('should cap extraction at 300 chars', () => {
      const longParagraph = 'A'.repeat(400);
      const content = `First paragraph.\n\n${longParagraph}`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result!.length).toBeLessThanOrEqual(300);
      expect(result).toContain('...');
    });

    it('should return null for empty content', () => {
      expect(ContextOptimizer.extractPosition('')).toBeNull();
      expect(ContextOptimizer.extractPosition('   ')).toBeNull();
    });

    it('should return null for null/undefined', () => {
      expect(ContextOptimizer.extractPosition(null as any)).toBeNull();
      expect(ContextOptimizer.extractPosition(undefined as any)).toBeNull();
    });

    it('should handle position tags with whitespace', () => {
      const content = `Some reasoning.

<position>
  We should use TypeScript for type safety.
</position>`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toBe('We should use TypeScript for type safety.');
    });

    it('should prefer XML tags over other formats', () => {
      const content = `**My position: This is the bold position.**

<position>This is the XML position.</position>`;

      const result = ContextOptimizer.extractPosition(content);
      expect(result).toBe('This is the XML position.');
    });
  });

  describe('extractReasoning()', () => {
    it('should extract reasoning from XML tags', () => {
      const content = `<reasoning>
The key factors are cost, scalability, and team familiarity.
</reasoning>

<position>Use AWS Lambda for the API layer.</position>`;

      const result = ContextOptimizer.extractReasoning(content);
      expect(result).toContain('cost, scalability');
      expect(result).not.toContain('AWS Lambda');
    });

    it('should extract reasoning from markdown heading', () => {
      const content = `## Reasoning
We need to consider the team's expertise with different databases.

## Position
Use PostgreSQL.`;

      const result = ContextOptimizer.extractReasoning(content);
      expect(result).toContain("team's expertise");
    });

    it('should return null when no reasoning section', () => {
      const content = 'Just a plain response with no structured format.';
      expect(ContextOptimizer.extractReasoning(content)).toBeNull();
    });

    it('should return null for empty content', () => {
      expect(ContextOptimizer.extractReasoning('')).toBeNull();
    });
  });

  describe('hasStructuredOutput()', () => {
    it('should detect XML position tags', () => {
      expect(ContextOptimizer.hasStructuredOutput(
        '<reasoning>analysis</reasoning>\n<position>my stance</position>'
      )).toBe(true);
    });

    it('should detect markdown position heading', () => {
      expect(ContextOptimizer.hasStructuredOutput(
        '## Reasoning\nanalysis\n## Position\nmy stance'
      )).toBe(true);
    });

    it('should return false for unstructured content', () => {
      expect(ContextOptimizer.hasStructuredOutput(
        'Just a normal response without any special formatting.'
      )).toBe(false);
    });

    it('should return false for bold position (not structured enough)', () => {
      // Bold position is a fallback extraction method but doesn't count as "structured output"
      expect(ContextOptimizer.hasStructuredOutput(
        '**My position: some stance**'
      )).toBe(false);
    });

    it('should return false for empty/null', () => {
      expect(ContextOptimizer.hasStructuredOutput('')).toBe(false);
      expect(ContextOptimizer.hasStructuredOutput(null as any)).toBe(false);
    });
  });

  describe('compressEntryForAgent()', () => {
    it('should use pre-extracted positionSummary when available', () => {
      const entry = {
        speaker: 'Security Expert',
        content: '<reasoning>Long analysis...</reasoning>\n<position>Use JWT.</position>',
        positionSummary: 'Use JWT.',
        hasStructuredOutput: true,
      };

      const result = ContextOptimizer.compressEntryForAgent(entry);
      expect(result).toBe('Use JWT.');
    });

    it('should extract position at runtime when no pre-extracted summary', () => {
      const entry = {
        speaker: 'Architect',
        content: '<reasoning>Detailed analysis of patterns.</reasoning>\n<position>Use event-driven architecture.</position>',
      };

      const result = ContextOptimizer.compressEntryForAgent(entry);
      expect(result).toBe('Use event-driven architecture.');
    });

    it('should use last-paragraph extraction for unstructured content', () => {
      const entry = {
        speaker: 'Pragmatic',
        content: 'We should ship the MVP first. Then iterate based on user feedback.\n\nThere are many other things we could do but the MVP approach minimizes risk and gets us to market fastest.',
      };

      const result = ContextOptimizer.compressEntryForAgent(entry);
      // extractPosition returns last paragraph for unstructured content
      expect(result).toContain('MVP approach minimizes risk');
    });

    it('should handle content without sentence terminators', () => {
      const entry = {
        speaker: 'Expert',
        content: 'A long response without any period or exclamation marks that just keeps going and going',
      };

      const result = ContextOptimizer.compressEntryForAgent(entry);
      // Should fall back to substring(0, 200)
      expect(result.length).toBeLessThanOrEqual(200);
    });

    it('should handle empty content gracefully', () => {
      const entry = {
        speaker: 'Expert',
        content: '',
      };

      const result = ContextOptimizer.compressEntryForAgent(entry);
      expect(result).toBe('');
    });
  });
});
