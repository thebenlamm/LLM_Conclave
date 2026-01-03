import { ArtifactExtractor } from '../ArtifactExtractor';

describe('ArtifactExtractor', () => {
  describe('extractJSON', () => {
    // We access the private method via 'any' casting for direct testing, 
    // or we can test it indirectly via public methods. 
    // Testing via public methods is better practice.
    
    it('extracts JSON from markdown code blocks', () => {
      const markdown = 'Here is the response:\n```json\n{\n  "key": "value"\n}\n```';
      const result = (ArtifactExtractor as any).extractJSON(markdown);
      expect(result).toEqual({ key: 'value' });
    });

    it('extracts JSON from raw JSON string', () => {
      const json = '{"key": "value"}';
      const result = (ArtifactExtractor as any).extractJSON(json);
      expect(result).toEqual({ key: 'value' });
    });

    it('extracts JSON when no code blocks but braces exist', () => {
      const text = 'Some text { "key": "value" } trailing text';
      const result = (ArtifactExtractor as any).extractJSON(text);
      expect(result).toEqual({ key: 'value' });
    });

    it('throws error for invalid JSON', () => {
      const invalid = '{ "key": "value" '; // missing brace
      expect(() => (ArtifactExtractor as any).extractJSON(invalid)).toThrow();
    });
  });

  describe('extractIndependentArtifact', () => {
    const validJson = {
      position: 'Test Position',
      key_points: ['Point 1', 'Point 2'],
      rationale: 'Because...', 
      confidence: 0.9,
      prose_excerpt: 'Excerpt'
    };

    it('extracts valid independent artifact', () => {
      const text = JSON.stringify(validJson);
      const result = ArtifactExtractor.extractIndependentArtifact(text, 'agent-1');
      
      expect(result.artifactType).toBe('independent');
      expect(result.agentId).toBe('agent-1');
      expect(result.position).toBe('Test Position');
      expect(result.confidence).toBe(0.9);
    });

    it('handles camelCase input if provided', () => {
      const camelJson = {
        position: 'Test Position',
        keyPoints: ['Point 1', 'Point 2'],
        rationale: 'Because...', 
        confidence: 0.9,
        proseExcerpt: 'Excerpt'
      };
      const text = JSON.stringify(camelJson);
      const result = ArtifactExtractor.extractIndependentArtifact(text, 'agent-1');
      expect(result.keyPoints).toHaveLength(2);
    });

    it('throws if required fields are missing', () => {
      const invalidJson = { position: 'Only Position' };
      const text = JSON.stringify(invalidJson);
      expect(() => ArtifactExtractor.extractIndependentArtifact(text, 'agent-1')).toThrow();
    });
  });

  describe('extractSynthesisArtifact', () => {
    const validJson = {
      consensus_points: [
        { point: 'C1', supporting_agents: ['a1'], confidence: 0.8 }
      ],
      tensions: [
        { topic: 'T1', viewpoints: [{ agent: 'a1', viewpoint: 'v1' }, { agent: 'a2', viewpoint: 'v2' }] }
      ],
      priority_order: ['C1']
    };

    it('extracts valid synthesis artifact', () => {
      const text = JSON.stringify(validJson);
      const result = ArtifactExtractor.extractSynthesisArtifact(text);

      expect(result.artifactType).toBe('synthesis');
      expect(result.consensusPoints).toHaveLength(1);
      expect(result.tensions).toHaveLength(1);
    });
  });

  describe('extractVerdictArtifactWithMode', () => {
    const validJson = {
      recommendation: 'Do X',
      recommendations: [{ option: 'Do X', description: 'Desc' }],
      confidence: 0.95,
      evidence: ['E1'],
      dissent: [],
      synergies: [],
      summary: 'Summary'
    };

    it('extracts valid verdict artifact', () => {
      const text = JSON.stringify(validJson);
      const result = ArtifactExtractor.extractVerdictArtifactWithMode(text, 'converge');
      
      expect(result.artifactType).toBe('verdict');
      expect(result.recommendation).toBe('Do X');
    });
  });
});
