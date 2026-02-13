import { getToolRestrictionInstruction } from '../ToolPruningInstructions';

describe('getToolRestrictionInstruction', () => {
  // Orchestrated mode
  describe('orchestrated mode', () => {
    it('returns empty string for primary phase', () => {
      expect(getToolRestrictionInstruction('orchestrated', 'primary')).toBe('');
    });

    it('returns empty string for critique phase', () => {
      expect(getToolRestrictionInstruction('orchestrated', 'critique')).toBe('');
    });

    it('returns empty string for revision phase', () => {
      expect(getToolRestrictionInstruction('orchestrated', 'revision')).toBe('');
    });

    it('returns read-only restriction for validation phase', () => {
      const result = getToolRestrictionInstruction('orchestrated', 'validation');
      expect(result).toContain('read_file');
      expect(result).toContain('list_files');
      expect(result).toContain('expand_artifact');
      expect(result).toContain('Do not modify files');
    });
  });

  // Iterative mode
  describe('iterative mode', () => {
    it('returns tool restriction for agent phase', () => {
      const result = getToolRestrictionInstruction('iterative', 'agent');
      expect(result).toContain('read_file');
      expect(result).toContain('list_files');
      expect(result).toContain('Do not use write_file');
      expect(result).toContain('judge handles output');
    });

    it('returns empty string for judge phase', () => {
      expect(getToolRestrictionInstruction('iterative', 'judge')).toBe('');
    });
  });

  // Unknown mode/phase
  describe('unknown mode', () => {
    it('returns empty string for unknown mode', () => {
      expect(getToolRestrictionInstruction('unknown' as any, 'agent')).toBe('');
    });

    it('returns empty string for unknown phase in known mode', () => {
      expect(getToolRestrictionInstruction('orchestrated', 'unknown')).toBe('');
    });
  });
});
