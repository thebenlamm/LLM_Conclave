#!/usr/bin/env node

// One-off recovery tool: backfill discuss/continue runs into the analytics DB
// from the session store (sessions/manifest.json + session.json). Safe to re-run
// — it fills only gaps and never overwrites a live-recorded row.
//
// Usage:
//   node scripts/backfill-discuss-analytics.js            # import
//   node scripts/backfill-discuss-analytics.js --dry-run  # classify only, no writes

const fs = require('fs');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
  quiet: true,
});

const entry = path.resolve(__dirname, '..', 'dist', 'src', 'consult', 'analytics', 'backfillDiscussAnalytics.js');

if (!fs.existsSync(entry)) {
  console.error('LLM Conclave is not built yet. Run `npm run build` first, then retry.');
  process.exit(1);
}

// Drive the import via the exported function. (The module also self-executes when
// run directly as `node dist/.../backfillDiscussAnalytics.js`, but loading it via
// require() here means require.main is this wrapper, not the module — so we call
// the function explicitly rather than relying on the module's self-exec block.)
const { backfillDiscussAnalytics } = require(entry);
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
    console.error('Backfill failed:', err && err.message ? err.message : err);
    process.exit(1);
  });
