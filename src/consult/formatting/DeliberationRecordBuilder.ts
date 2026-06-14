/**
 * DeliberationRecordBuilder
 *
 * Normalizes either a ConsultationResult (consult path) or a SessionManifest
 * (discuss path) into a DeliberationRecordSource for rendering.
 *
 * Phase 12 — Plan 01: read-only consumer; no LLM calls, no side effects.
 */

import type { ConsultationResult } from '../../types/consult.js';
import type { SessionManifest } from '../../types/index.js';
import type { DeliberationRecordSource, OperatorInputs } from '../../types/deliberationRecord.js';

export class DeliberationRecordBuilder {
  /**
   * Build a DeliberationRecordSource from a ConsultationResult (consult mode).
   *
   * Named dissents come from result.dissent (attributed Dissent[]). Per-agent
   * positions come from result.perspectives[].opinion.
   */
  static fromConsultation(
    result: ConsultationResult,
    operator: OperatorInputs
  ): DeliberationRecordSource {
    const panel = result.agents.map((a) => ({
      name: a.name,
      provider: a.provider,
      model: a.model,
    }));

    const positions = result.perspectives.map((p) => ({
      agent: p.agent,
      provider: result.agents.find((a) => a.name === p.agent)?.provider ?? '',
      model: p.model,
      stance: p.opinion ?? '',
    }));

    const dissents = result.dissent.map((d) => ({
      agent: d.agent,
      severity: d.severity,
      concern: d.concern,
    }));

    return {
      decision: {
        question: result.question,
        context: result.context || undefined,
      },
      panel,
      positions,
      dissents,
      // consult path has attributed dissents; dissentQuality stays undefined
      dissentQuality: undefined,
      synthesis: result.recommendation || result.consensus || '',
      provenance: {
        date: result.timestamp,
        operator: operator.operatorName,
        agents: result.agents.map((a) => ({
          name: a.name,
          provider: a.provider,
          model: a.model,
        })),
      },
      sourceMode: 'consult',
    };
  }

  /**
   * Build a DeliberationRecordSource from a SessionManifest (discuss mode).
   *
   * SessionManifest does not persist attributed Dissent[]. Set dissents = [] and
   * forward dissent_quality so the formatter can surface it honestly under field 4
   * instead of silently claiming "none surfaced".
   */
  static fromSession(
    manifest: SessionManifest,
    operator: OperatorInputs
  ): DeliberationRecordSource {
    const panel = manifest.agents.map((a) => ({
      name: a.name,
      provider: a.provider,
      model: a.model,
    }));

    // Discuss path: no per-agent position text persisted in the manifest
    const positions = manifest.agents.map((a) => ({
      agent: a.name,
      provider: a.provider,
      model: a.model,
      stance: '',
    }));

    return {
      decision: {
        question: manifest.task,
      },
      panel,
      positions,
      // No attributed dissents in discuss sessions
      dissents: [],
      dissentQuality: manifest.dissent_quality,
      synthesis: manifest.finalSolution ?? '',
      provenance: {
        date: manifest.timestamp,
        operator: operator.operatorName,
        agents: manifest.agents.map((a) => ({
          name: a.name,
          provider: a.provider,
          model: a.model,
        })),
      },
      sourceMode: 'discuss',
    };
  }
}
