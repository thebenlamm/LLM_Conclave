#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

require('dotenv').config({
  path: path.resolve(__dirname, '..', '.env'),
  quiet: true,
});

const serverEntry = path.resolve(__dirname, '..', 'dist', 'src', 'mcp', 'server.js');

if (!fs.existsSync(serverEntry)) {
  console.error('LLM Conclave MCP server is not built yet.');
  console.error('Run `npm install` (or `npm run build`) in the repository root, then start a fresh Claude Code session.');
  process.exit(1);
}

require(serverEntry);
