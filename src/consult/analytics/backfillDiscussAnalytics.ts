import SessionManager from '../../core/SessionManager.js';
import { AnalyticsIndexer, DiscussionAnalyticsInput } from './AnalyticsIndexer.js';
import { normalizeAnalyticsProvider } from './providerVocab.js';
import { SessionManifest } from '../../types/index.js';

/**
 * Backfill importer for discuss/continue analytics.
 *
 * Discuss/consensus runs were never written to the analytics DB before the
 * indexDiscussion wiring landed, so historical sessions are missing from
 * cross-mode analytics (field feedback: ~18 sessions). Those runs DO survive in
 * the session store (sessions/<id>/session.json + manifest.json). This walks the
 * session store and writes a `consultations` row + agent panel for each, filling
 * the gap.
 *
 * Safe to re-run: it skips ids that already exist (gap-fill only, never
 * overwriting a live-recorded row), and indexDiscussion is itself idempotent.
 */

/** Map a session-store status to the analytics `state` column. */
function mapState(status: SessionManifest['status']): string {
  switch (status) {
    case 'completed': return 'complete';
    case 'completed_degraded': return 'degraded';
    case 'interrupted': return 'interrupted';
    case 'error': return 'error';
    default: return status; // 'in_progress' is filtered out before this
  }
}

/**
 * Map a persisted SessionManifest to the analytics input. Returns null for runs
 * that should not be recorded (still in progress). Pure — no I/O.
 *
 * Notes on fidelity vs the live path:
 * - confidence: the session store never persisted a confidence band, so it is
 *   recorded as null (unknown), which AVG(confidence) ignores.
 * - durationMs: wall-clock was not persisted historically, so it is 0.
 * - provider: derived from the model via the shared analytics vocabulary so
 *   backfilled rows bucket identically to live discuss/consult rows (the stored
 *   provider field can be a legacy class name).
 */
export function sessionToAnalyticsInput(session: SessionManifest): DiscussionAnalyticsInput | null {
  if (!session || !session.id) return null;
  if (session.status === 'in_progress') return null; // incomplete — nothing to record

  const agents = (session.agents ?? []).map(a => ({
    name: a.name,
    model: a.model,
    provider: normalizeAnalyticsProvider(a.model),
  }));

  const totalTokens =
    (session.cost?.totalTokens?.input ?? 0) + (session.cost?.totalTokens?.output ?? 0);

  return {
    id: session.id,
    question: session.task ?? '',
    // Continuations carry a parentSessionId; everything else is a fresh discuss run.
    mode: session.parentSessionId ? 'continue' : 'discuss',
    recommendation: session.finalSolution ?? null,
    confidence: null, // band not persisted historically
    totalCost: session.cost?.totalCost ?? 0,
    totalTokens,
    durationMs: 0, // wall-clock not persisted historically
    timestamp: session.timestamp,
    state: mapState(session.status),
    hasDissent: session.dissent_quality === 'captured',
    agents,
  };
}

export interface BackfillResult {
  scanned: number;
  imported: number;
  skippedExisting: number;
  skippedUnmappable: number;
}

export interface BackfillOptions {
  sessionManager?: SessionManager;
  indexer?: AnalyticsIndexer;
  /** When true, classify everything but write nothing. */
  dryRun?: boolean;
  log?: (msg: string) => void;
}

/**
 * Walk the session store and backfill missing discuss/continue analytics rows.
 */
export async function backfillDiscussAnalytics(opts: BackfillOptions = {}): Promise<BackfillResult> {
  const sessionManager = opts.sessionManager ?? new SessionManager();
  const indexer = opts.indexer ?? new AnalyticsIndexer();
  const log = opts.log ?? (() => {});

  const summaries = await sessionManager.listSessions(); // no filters → all sessions
  let imported = 0;
  let skippedExisting = 0;
  let skippedUnmappable = 0;

  for (const summary of summaries) {
    const session = await sessionManager.loadSession(summary.id);
    const input = session ? sessionToAnalyticsInput(session) : null;
    if (!input) {
      skippedUnmappable++;
      log(`skip (unmappable/in-progress): ${summary.id}`);
      continue;
    }
    // Gap-fill only: never clobber a row already written (live runs carry more
    // accurate data such as wall-clock duration).
    if (indexer.hasConsultation(input.id)) {
      skippedExisting++;
      continue;
    }
    if (!opts.dryRun) {
      indexer.indexDiscussion(input);
    }
    imported++;
    log(`${opts.dryRun ? 'would import' : 'imported'} (${input.mode}): ${input.id}`);
  }

  return {
    scanned: summaries.length,
    imported,
    skippedExisting,
    skippedUnmappable,
  };
}

// CLI entry: `node dist/src/consult/analytics/backfillDiscussAnalytics.js [--dry-run]`
// (invoked via scripts/backfill-discuss-analytics.js, which loads .env first).
if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');
  backfillDiscussAnalytics({ dryRun, log: msg => console.log(`  ${msg}`) })
    .then(r => {
      console.log(
        `\nBackfill ${dryRun ? '(dry run) ' : ''}complete — scanned ${r.scanned}, ` +
        `${dryRun ? 'would import' : 'imported'} ${r.imported}, ` +
        `skipped ${r.skippedExisting} already-recorded, ${r.skippedUnmappable} unmappable.`
      );
      process.exit(0);
    })
    .catch(err => {
      console.error('Backfill failed:', err?.message ?? err);
      process.exit(1);
    });
}
