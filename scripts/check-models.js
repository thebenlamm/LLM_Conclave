#!/usr/bin/env node
/**
 * check-models.js
 * Fetches live model lists from each provider API and compares against
 * the defaults hardcoded in src/config/ConfigCascade.ts.
 *
 * Source URLs (official model listing endpoints):
 *   Anthropic  https://api.anthropic.com/v1/models
 *              https://platform.claude.com/docs/en/about-claude/models/overview
 *   OpenAI     https://api.openai.com/v1/models
 *              https://developers.openai.com/api/docs/models
 *   Google     https://generativelanguage.googleapis.com/v1beta/models
 *              https://ai.google.dev/gemini-api/docs/models
 *   xAI        https://api.x.ai/v1/models
 *              https://docs.x.ai/developers/models
 *   Mistral    https://api.mistral.ai/v1/models
 *              https://docs.mistral.ai/models
 *
 * Cross-reference resources:
 *   LiteLLM model DB  https://github.com/BerriAI/litellm (model_prices_and_context_window.json)
 *   Benchmark ranks   https://artificialanalysis.ai/models
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// Load .env manually (avoid adding dotenv dependency)
function loadEnv() {
  try {
    const env = readFileSync(join(ROOT, '.env'), 'utf8');
    for (const line of env.split('\n')) {
      const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) process.env[match[1]] ??= match[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* .env optional */ }
}

// Return key only if it looks real (not a placeholder)
function key(name, ...fallbacks) {
  for (const k of [name, ...fallbacks]) {
    const v = process.env[k];
    if (v && !v.startsWith('your_')) return v;
  }
  return null;
}

// Extract model strings currently configured in ConfigCascade.ts
function getConfiguredModels() {
  const src = readFileSync(join(ROOT, 'src/config/ConfigCascade.ts'), 'utf8');
  const models = new Set();
  for (const match of src.matchAll(/model:\s*['"]([^'"]+)['"]/g)) {
    models.add(match[1]);
  }
  return models;
}

// Extract model keys from CostTracker.ts pricing table
function getPricedModels() {
  const src = readFileSync(join(ROOT, 'src/core/CostTracker.ts'), 'utf8');
  const models = new Set();
  for (const match of src.matchAll(/'([^']+)':\s*\{\s*input:/g)) {
    models.add(match[1]);
  }
  return models;
}

async function fetchModels(provider, apiKey, url, headers, extractIds) {
  if (!apiKey) return { provider, error: 'no API key' };
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { provider, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { provider, models: extractIds(data) };
  } catch (e) {
    return { provider, error: e.message };
  }
}

// True if configured model matches a live ID exactly or as a prefix alias
// (e.g. "claude-haiku-4-5" matches "claude-haiku-4-5-20251001")
function matchesLive(model, liveSet) {
  if (liveSet.has(model)) return true;
  for (const live of liveSet) {
    if (live.startsWith(model + '-') || live.startsWith(model + '@')) return true;
  }
  return false;
}

function sortedIds(ids) {
  return [...ids].sort((a, b) => b.localeCompare(a));
}

async function main() {
  loadEnv();
  const configured = getConfiguredModels();
  const priced = getPricedModels();

  const googleKey = key('GOOGLE_API_KEY', 'GEMINI_API_KEY');
  const providers = [
    fetchModels(
      'anthropic',
      key('ANTHROPIC_API_KEY'),
      'https://api.anthropic.com/v1/models?limit=100',
      { 'x-api-key': key('ANTHROPIC_API_KEY') ?? '', 'anthropic-version': '2023-06-01' },
      d => d.data?.map(m => m.id) ?? []
    ),
    fetchModels(
      'openai',
      key('OPENAI_API_KEY'),
      'https://api.openai.com/v1/models',
      { Authorization: `Bearer ${key('OPENAI_API_KEY') ?? ''}` },
      d => d.data?.map(m => m.id).filter(id => id.startsWith('gpt-') || id.startsWith('o')) ?? []
    ),
    fetchModels(
      'google',
      googleKey,
      `https://generativelanguage.googleapis.com/v1beta/models?key=${googleKey ?? ''}`,
      {},
      d => d.models?.map(m => m.name.replace('models/', '')).filter(id => id.startsWith('gemini')) ?? []
    ),
    fetchModels(
      'xai',
      key('XAI_API_KEY'),
      'https://api.x.ai/v1/models',
      { Authorization: `Bearer ${key('XAI_API_KEY') ?? ''}` },
      d => d.data?.map(m => m.id) ?? []
    ),
    fetchModels(
      'mistral',
      key('MISTRAL_API_KEY'),
      'https://api.mistral.ai/v1/models',
      { Authorization: `Bearer ${key('MISTRAL_API_KEY') ?? ''}` },
      d => d.data?.map(m => m.id) ?? []
    ),
  ];

  const results = await Promise.all(providers);

  // Provider → set of live model IDs
  const liveByProvider = {};
  for (const r of results) {
    liveByProvider[r.provider] = r.error ? null : new Set(r.models);
  }

  console.log('\n=== Configured models (ConfigCascade.ts) ===\n');
  for (const model of [...configured].sort()) {
    let status = '  (no API key to verify)';
    for (const [provider, live] of Object.entries(liveByProvider)) {
      if (!live) continue;
      if (matchesLive(model, live)) { status = `  ✓  live on ${provider}`; break; }
    }
    const anyLive = Object.values(liveByProvider).some(Boolean);
    const found = Object.entries(liveByProvider).some(([, live]) => live && matchesLive(model, live));
    if (!found && anyLive) {
      status = '  ✗  NOT found in any live model list (may be deprecated)';
    }
    console.log(`  ${model}${status}`);
  }

  console.log('\n=== Pricing coverage (CostTracker.ts) ===\n');
  for (const model of [...configured].sort()) {
    const covered = priced.has(model) || [...priced].some(p => model.startsWith(p + '-') || p.startsWith(model + '-'));
    const mark = covered ? '✓' : '✗  MISSING — cost estimates will be $0';
    console.log(`  ${mark}  ${model}`);
  }

  console.log('\n=== Live model lists by provider ===\n');
  for (const r of results) {
    if (r.error) {
      console.log(`  ${r.provider}: error — ${r.error}`);
      continue;
    }
    const sorted = sortedIds(r.models);
    const top = sorted.slice(0, 10);
    console.log(`  ${r.provider} (${r.models.length} models, newest first):`);
    for (const id of top) {
      const inConfig = configured.has(id) ? ' ← configured' : '';
      console.log(`    ${id}${inConfig}`);
    }
    if (sorted.length > 10) console.log(`    ... and ${sorted.length - 10} more`);
    console.log();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
