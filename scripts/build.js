#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const tscPath = require.resolve('typescript/bin/tsc');
const serverEntry = path.join(repoRoot, 'dist', 'src', 'mcp', 'server.js');

const result = spawnSync(process.execPath, [tscPath], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (result.status !== 0) {
  process.exit(result.status || 1);
}

if (process.platform !== 'win32' && fs.existsSync(serverEntry)) {
  const currentMode = fs.statSync(serverEntry).mode;
  fs.chmodSync(serverEntry, currentMode | 0o111);
}
