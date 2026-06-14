/**
 * DeliberationRecordFormatter
 *
 * Renders a DeliberationRecordSource into a compliance-grade markdown audit artifact
 * containing the 8 locked fields in their required order.
 *
 * Locked strings are defined in-class to ensure test and implementation agree verbatim.
 * Phase 12 — Plan 01: no LLM calls, no side effects.
 */

import type { DeliberationRecordSource, OperatorInputs } from '../../types/deliberationRecord.js';

// ============================================================================
// Locked constants — MUST match plan <locked_strings> verbatim
// ============================================================================

const TITLE = '# Deliberation Record';

const HEADERS = {
  field1: '## 1. Decision Framed',
  field2: '## 2. Panel Composition & Rationale',
  field3: '## 3. Positions Summarized',
  field4: '## 4. Dissent (Attributed)',
  field5: '## 5. Synthesis & Recommendation',
  field6: '## 6. Risks Surfaced & Human Mitigation',
  field7: '## 7. Decision-Support Disclaimer',
  field8: '## 8. Provenance',
} as const;

const DISCLAIMER =
  'This Deliberation Record is decision-support documentation, not a substitute for professional judgment. The deliberation was one input into a human-owned decision process.';

const FIELD6_INTRO =
  'Each item below records a risk surfaced during deliberation and the human decider\'s mitigation.';

const FIELD6_NONE_SURFACED = '- Risk: none surfaced during deliberation.';

const FIELD6_NOT_PERSISTED = (dissentQuality: string): string =>
  `- Attributed risks were not persisted in the stored session (dissent quality: ${dissentQuality}). Operator to enumerate the surfaced risks and record mitigations.`;

const MITIGATION_PLACEHOLDER = '_[operator to complete]_';

export class DeliberationRecordFormatter {
  /**
   * Render the 8-field Deliberation Record from a normalized source.
   */
  render(source: DeliberationRecordSource, operator: OperatorInputs): string {
    const lines: string[] = [];

    lines.push(TITLE);
    lines.push('');

    // Field 1: Decision Framed
    lines.push(HEADERS.field1);
    lines.push('');
    lines.push(source.decision.question);
    if (source.decision.context) {
      lines.push('');
      lines.push(`**Context:** ${source.decision.context}`);
    }
    if (source.decision.constraints && source.decision.constraints.length > 0) {
      lines.push('');
      lines.push('**Constraints:**');
      for (const c of source.decision.constraints) {
        lines.push(`- ${c}`);
      }
    }
    lines.push('');

    // Field 2: Panel Composition & Rationale
    lines.push(HEADERS.field2);
    lines.push('');
    if (operator.panelRationale) {
      lines.push(`**Rationale:** ${operator.panelRationale}`);
      lines.push('');
    }
    lines.push('**Panel members:**');
    for (const member of source.panel) {
      const persona = member.persona ? ` — ${member.persona}` : '';
      lines.push(`- ${member.name}: ${member.provider} / ${member.model}${persona}`);
    }
    lines.push('');

    // Field 3: Positions Summarized
    lines.push(HEADERS.field3);
    lines.push('');
    if (source.positions.length > 0) {
      for (const pos of source.positions) {
        if (pos.stance) {
          lines.push(`- **${pos.agent}**: ${pos.stance}`);
        } else {
          lines.push(`- **${pos.agent}**: _(position not individually persisted in stored session)_`);
        }
      }
    } else {
      lines.push('_(No individual positions recorded.)_');
    }
    lines.push('');

    // Field 4: Dissent (Attributed)
    lines.push(HEADERS.field4);
    lines.push('');
    if (source.dissents.length > 0) {
      // Attributed dissents available (consult path)
      for (const d of source.dissents) {
        const severityStr = d.severity ? ` (${d.severity})` : '';
        lines.push(`- **${d.agent}**${severityStr}: ${d.concern}`);
      }
    } else if (source.dissentQuality !== undefined) {
      // Discuss path: dissent_quality set but no individual dissents persisted
      lines.push(
        `Dissent quality: ${source.dissentQuality} — no individually attributed dissent persisted in the stored session; operator to confirm.`
      );
    } else {
      // Genuine clean consensus — no dissent signalled
      lines.push('_(No dissent recorded — genuine consensus reached.)_');
    }
    lines.push('');

    // Field 5: Synthesis & Recommendation
    lines.push(HEADERS.field5);
    lines.push('');
    lines.push(source.synthesis || '_(No synthesis recorded.)_');
    lines.push('');

    // Field 6: Risks Surfaced & Human Mitigation
    lines.push(HEADERS.field6);
    lines.push('');
    lines.push(FIELD6_INTRO);
    lines.push('');
    if (source.dissents.length > 0) {
      // Render one risk+mitigation entry per attributed dissent
      for (const d of source.dissents) {
        const mitigations = operator.mitigations ?? {};
        const mitigation = mitigations[d.concern] ?? MITIGATION_PLACEHOLDER;
        lines.push(`- Risk: ${d.concern}`);
        lines.push(`  Mitigation: ${mitigation}`);
      }
    } else if (source.dissentQuality !== undefined) {
      // Discuss path: dissent_quality set → must be consistent with field 4 (N1)
      lines.push(FIELD6_NOT_PERSISTED(source.dissentQuality));
    } else {
      // Genuine clean consensus
      lines.push(FIELD6_NONE_SURFACED);
    }
    lines.push('');

    // Field 7: Decision-Support Disclaimer (locked — present in every record)
    lines.push(HEADERS.field7);
    lines.push('');
    lines.push(DISCLAIMER);
    lines.push('');

    // Field 8: Provenance
    lines.push(HEADERS.field8);
    lines.push('');
    lines.push(`**Run by:** ${operator.operatorName}`);
    lines.push(`**Date:** ${source.provenance.date}`);
    lines.push('**Panel:**');
    for (const agent of source.provenance.agents) {
      lines.push(`- ${agent.name}: ${agent.provider} / ${agent.model}`);
    }
    lines.push('');

    return lines.join('\n');
  }
}
