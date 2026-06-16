/**
 * DeliberationRecordFormatter
 *
 * Renders a DeliberationRecordSource into a compliance-grade markdown audit artifact
 * containing the 8 locked fields in their required order.
 *
 * Locked strings are defined in deliberationRecordConstants.ts and imported here
 * so that both the markdown and PDF renderers share a single source of truth.
 * Phase 21-01 — Plan 01: no LLM calls, no side effects.
 */

import type { DeliberationRecordSource, OperatorInputs } from '../../types/deliberationRecord.js';
import {
  TITLE,
  HEADERS,
  DISCLAIMER,
  FIELD6_INTRO,
  FIELD6_NONE_SURFACED,
  FIELD6_NOT_PERSISTED,
  FIELD6_UNKNOWN,
  MITIGATION_PLACEHOLDER,
  sanitizeFraming,
} from './deliberationRecordConstants.js';

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
    } else if (source.sourceMode === 'discuss') {
      // CR-01: discuss path with NO persisted dissent signal (legacy pre-Phase-11
      // sessions). Presence of dissent is unknown — never assert "genuine consensus".
      lines.push(
        '_(No dissent signal was persisted in this stored session; dissent presence is unknown — operator to confirm.)_'
      );
    } else {
      // Genuine clean consensus — consult path with no attributed dissent
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
    } else if (source.sourceMode === 'discuss') {
      // CR-01: discuss path with no persisted dissent signal — do NOT claim
      // "none surfaced"; risk presence is unknown (consistent with field 4).
      lines.push(FIELD6_UNKNOWN);
    } else {
      // Genuine clean consensus — consult path
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

    // WR-01: enforce the framing gate on the fully-assembled record.
    return sanitizeFraming(lines.join('\n'));
  }
}
