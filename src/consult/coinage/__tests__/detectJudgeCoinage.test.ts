/**
 * AUDIT-06 (Phase 20) — detectJudgeCoinage contract (RED phase).
 *
 * This test suite pins the tokenization + grounding rules for judge coinage
 * detection. The implementation does not yet exist — Plan 20-03 creates
 * `src/consult/coinage/detectJudgeCoinage.ts`. Until then, ALL tests in this
 * file fail at load time with a module-not-found error, which is the
 * intentional RED state committed by Plan 20-02.
 *
 * Contract pinned by these tests:
 *   - Phrase candidates are 1-3 contiguous Title-Case tokens OR ALL-CAPS tokens
 *     (ALL-CAPS runs require >= 2 chars).
 *   - Sentence-initial single-capitalized English stopwords (The, And, But, A,
 *     An, This, That, It, He, She, We, They, I, You) are skipped as candidates.
 *   - Matching against agent turns is CASE-INSENSITIVE substring matching.
 *   - Deduplication: each coined phrase appears at most once, in order of first
 *     appearance in the synthesis.
 *   - Agent turns passed in must already be filtered to exclude Judge/System
 *     turns — the caller (Plan 20-03) is responsible for that filtering.
 */
import * as fs from 'fs';
import * as path from 'path';
// Intentionally importing from a not-yet-existent module. Plan 20-03 creates it.
import { detectJudgeCoinage } from '../detectJudgeCoinage';

describe('AUDIT-06 detectJudgeCoinage tokenization + grounding (Phase 20)', () => {
  describe('pure extraction', () => {
    it('Test 1: empty synthesis returns empty array', () => {
      expect(
        detectJudgeCoinage('', [{ speaker: 'A', content: 'hello' }])
      ).toEqual([]);
    });

    it('Test 2: empty agent turns returns all proper-noun phrases from synthesis', () => {
      expect(
        detectJudgeCoinage('The Benthic Protocol governs deep-sea mining.', [])
      ).toEqual(['Benthic Protocol']);
    });

    it('Test 3: fully grounded synthesis returns empty array', () => {
      expect(
        detectJudgeCoinage('Adopt the Apollo Framework now.', [
          { speaker: 'A', content: 'I recommend the Apollo Framework' },
        ])
      ).toEqual([]);
    });

    it('Test 4: two coined phrases detected in order of appearance', () => {
      expect(
        detectJudgeCoinage('Use the Benthic Protocol with Operation Clearsky.', [
          { speaker: 'A', content: 'We should mine the seabed.' },
        ])
      ).toEqual(['Benthic Protocol', 'Operation Clearsky']);
    });

    it('Test 5: case-insensitive grounding — ALL-CAPS synthesis matched by lowercase turn', () => {
      expect(
        detectJudgeCoinage('Adopt the APOLLO FRAMEWORK.', [
          { speaker: 'A', content: 'use the apollo framework' },
        ])
      ).toEqual([]);
    });

    it('Test 6: lowercase synthesis words are NOT proper-noun candidates', () => {
      // "cobra system" is lowercase in synthesis — not a proper-noun candidate, so no extraction happens.
      expect(
        detectJudgeCoinage('Use the cobra system.', [
          { speaker: 'A', content: 'I propose the Cobra System' },
        ])
      ).toEqual([]);
    });

    it('Test 7: sentence-initial single capitalized stopwords are filtered', () => {
      expect(
        detectJudgeCoinage(
          'The approach is sound. And this works. But be careful.',
          [{ speaker: 'A', content: 'fine' }]
        )
      ).toEqual([]);
    });

    it('Test 8: phrase length capped at 3 tokens — longer runs truncate to first 3', () => {
      expect(
        detectJudgeCoinage('Deploy the Red Blue Green Yellow Framework.', [
          { speaker: 'A', content: 'nothing' },
        ])
      ).toEqual(['Red Blue Green']);
    });

    it('Test 9: deduplication — repeated coinage appears once', () => {
      expect(
        detectJudgeCoinage(
          'The Benthic Protocol. Again, Benthic Protocol. And Benthic Protocol.',
          []
        )
      ).toEqual(['Benthic Protocol']);
    });

    it('Test 10: mixed grounded + coined — only coined returned', () => {
      expect(
        detectJudgeCoinage('Use Apollo Framework with Benthic Protocol.', [
          { speaker: 'A', content: 'apollo framework is fine' },
        ])
      ).toEqual(['Benthic Protocol']);
    });

    it('Test 11: ALL-CAPS single token (>=2 chars) counts as proper noun', () => {
      expect(
        detectJudgeCoinage('Deploy NATO rules.', [
          { speaker: 'A', content: 'nothing' },
        ])
      ).toEqual(['NATO']);
    });

    it('Test 12: ALL-CAPS grounded by lowercase turn', () => {
      expect(
        detectJudgeCoinage('Deploy NATO rules.', [
          { speaker: 'A', content: 'nato works' },
        ])
      ).toEqual([]);
    });

    it('Test 13: markdown syntax (headings, bold, bullets) does not contaminate extraction', () => {
      expect(
        detectJudgeCoinage(
          '## Decision\n- **Adopt the Benthic Protocol**\n* Key point',
          [{ speaker: 'A', content: 'nothing relevant' }]
        )
      ).toEqual(['Benthic Protocol']);
    });
  });

  describe('fixture-driven', () => {
    it('Test 14: grounded fixture returns empty array', () => {
      const fixture = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, 'fixtures', 'grounded-synthesis.json'),
          'utf-8'
        )
      );
      expect(detectJudgeCoinage(fixture.synthesis, fixture.turns)).toEqual([]);
    });

    it('Test 15: coined fixture flags Benthic Protocol and Operation Clearsky, not Apollo Framework', () => {
      const fixture = JSON.parse(
        fs.readFileSync(
          path.join(__dirname, 'fixtures', 'coined-synthesis.json'),
          'utf-8'
        )
      );
      const result = detectJudgeCoinage(fixture.synthesis, fixture.turns);
      for (const expected of fixture.expectedContains) {
        expect(result).toContain(expected);
      }
      for (const notExpected of fixture.expectedDoesNotContain) {
        expect(result).not.toContain(notExpected);
      }
    });
  });
});
