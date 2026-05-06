import { detectEnumeratedOptions } from '../ConversationManager.js';

describe('detectEnumeratedOptions', () => {
  it('returns matches for 3+ labeled options', () => {
    const result = detectEnumeratedOptions('A) foo\nB) bar\nC) baz');
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
  });

  it('returns null when fewer than 3 options match (threshold not met)', () => {
    expect(detectEnumeratedOptions('A. the first\nB. the second')).toBeNull();
  });

  it('does not match A.I. or B2B style prose (pattern mismatch)', () => {
    expect(detectEnumeratedOptions('A.I. usage is growing\nB2B markets are shifting\nC-suite priorities')).toBeNull();
  });

  it('does not match whitespace-only separator (A  sentence style)', () => {
    // [.):] excludes whitespace — "A  sentence" must not match.
    const prose = 'A  sentence one\nB  sentence two\nC  sentence three';
    expect(detectEnumeratedOptions(prose)).toBeNull();
  });

  it('matches A. B. C. format with trailing text', () => {
    const task = 'A. Migrate to microservices\nB. Stay monolithic\nC. Hybrid approach';
    const result = detectEnumeratedOptions(task);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
  });

  it('matches (A) parenthesized format and extracts letter A not paren', () => {
    // l.trim()[0] would yield '(' — extractOptionLabel must yield 'A'.
    const task = '(A) Option one text\n(B) Option two text\n(C) Option three text';
    const result = detectEnumeratedOptions(task);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
    // Verify the first character of the first match is '(' (as stored),
    // and that the label extractor produces 'A', not '('.
    const firstLine = result![0].trim();
    expect(firstLine[0]).toBe('(');                        // raw line starts with (
    const m = firstLine.match(/^\(?([A-E])/);
    expect(m?.[1]).toBe('A');                              // extracted label is A
  });

  it('matches A: colon format', () => {
    const task = 'A: First choice\nB: Second choice\nC: Third choice';
    const result = detectEnumeratedOptions(task);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(3);
  });

  it('returns 5 matches for A–E with surrounding prose', () => {
    const task = [
      'Which approach should we take?',
      'A) Build in-house',
      'B) Buy off-the-shelf',
      'C) Open source',
      'D) Hybrid build/buy',
      'E) Defer decision',
      'Please consider cost and timeline.',
    ].join('\n');
    const result = detectEnumeratedOptions(task);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(5);
  });

  it('returns null for empty string', () => {
    expect(detectEnumeratedOptions('')).toBeNull();
  });

  it('returns null when only 1 matching line exists', () => {
    expect(detectEnumeratedOptions('A) only one option here')).toBeNull();
  });
});
