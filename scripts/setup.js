#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const envExamplePath = path.join(repoRoot, '.env.example');
const envPath = path.join(repoRoot, '.env');
const mcpConfigPath = path.join(repoRoot, '.mcp.json');
const launcherPath = path.join(repoRoot, 'scripts', 'mcp-stdio.js');

function log(message = '') {
  process.stdout.write(`${message}\n`);
}

function ensureEnvFile() {
  if (fs.existsSync(envPath)) {
    log('Using existing .env');
    return;
  }

  if (!fs.existsSync(envExamplePath)) {
    throw new Error('Missing .env.example; cannot create .env automatically.');
  }

  fs.copyFileSync(envExamplePath, envPath);
  log('Created .env from .env.example');
}

function readEnvFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function detectConfiguredProviders(envContent) {
  const providers = [
    { env: 'ANTHROPIC_API_KEY', placeholder: 'your_anthropic_api_key_here', label: 'Anthropic' },
    { env: 'OPENAI_API_KEY', placeholder: 'your_openai_api_key_here', label: 'OpenAI' },
    { env: 'GOOGLE_API_KEY', placeholder: 'your_google_api_key_here', label: 'Google' },
    { env: 'GEMINI_API_KEY', placeholder: 'your_google_api_key_here', label: 'Gemini alias' },
    { env: 'XAI_API_KEY', placeholder: 'your_xai_api_key_here', label: 'xAI' },
    { env: 'MISTRAL_API_KEY', placeholder: 'your_mistral_api_key_here', label: 'Mistral' },
  ];

  return providers.filter(({ env, placeholder }) => {
    const match = envContent.match(new RegExp(`^${env}=(.*)$`, 'm'));
    if (!match) return false;
    const value = match[1].trim().replace(/^"|"$/g, '');
    return value !== '' && value !== placeholder;
  });
}

function validateMcpConfig() {
  if (!fs.existsSync(mcpConfigPath)) {
    throw new Error('Missing .mcp.json; Claude Code will not auto-discover the MCP server.');
  }

  const parsed = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
  const serverConfig = parsed?.mcpServers?.['llm-conclave'];

  if (!serverConfig) {
    throw new Error('.mcp.json is missing mcpServers.llm-conclave.');
  }
  if (serverConfig.command !== 'node') {
    throw new Error(`.mcp.json must launch llm-conclave with "node", found "${serverConfig.command || 'undefined'}".`);
  }
  if (!Array.isArray(serverConfig.args) || serverConfig.args.length === 0) {
    throw new Error('.mcp.json must include args for llm-conclave.');
  }

  const resolvedLauncher = path.resolve(repoRoot, serverConfig.args[0]);
  if (resolvedLauncher !== launcherPath) {
    throw new Error(`.mcp.json should point to scripts/mcp-stdio.js, found "${serverConfig.args[0]}".`);
  }
  if (!fs.existsSync(launcherPath)) {
    throw new Error('Missing scripts/mcp-stdio.js; cannot launch MCP server.');
  }

  log('Validated project-local .mcp.json');
}

function buildServer() {
  log('Building MCP server...');
  const result = spawnSync('npm', ['run', 'build'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function smokeTestLauncher() {
  log('Smoke testing MCP launcher...');
  const initializeRequest = `${JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'setup', version: '1.0' }
    }
  })}\n`;

  const result = spawnSync(process.execPath, [launcherPath], {
    cwd: repoRoot,
    input: initializeRequest,
    encoding: 'utf8',
    timeout: 5000,
  });

  if (result.status !== 0) {
    throw new Error(`MCP launcher smoke test failed${result.stderr ? `: ${result.stderr.trim()}` : '.'}`);
  }

  if (!result.stdout.includes('"jsonrpc":"2.0"') || !result.stdout.includes('"serverInfo"')) {
    throw new Error('MCP launcher smoke test did not return a valid initialize response.');
  }
}

function printNextSteps(configuredProviders) {
  log('');
  log('Setup complete.');
  log('');
  log(`Configured providers: ${configuredProviders.length > 0 ? configuredProviders.map((p) => p.label).join(', ') : 'none detected yet'}`);
  log('');
  log('Next steps for Claude Code:');
  log('1. If needed, edit .env and add at least one real API key.');
  log('2. Start a fresh Claude Code session from this repo.');
  log('3. Approve the llm-conclave MCP server if Claude Code prompts you.');
  log('4. Ask Claude Code to use llm_conclave_consult or llm_conclave_discuss.');
  log('');
  if (configuredProviders.length === 0) {
    log('Warning: .env still appears to contain placeholder values, so model calls will fail until you add a real key.');
    log('');
  }
  log('Repo-local MCP config: .mcp.json -> node scripts/mcp-stdio.js');
}

function main() {
  ensureEnvFile();
  validateMcpConfig();
  const envContent = readEnvFile(envPath);
  const configuredProviders = detectConfiguredProviders(envContent);
  buildServer();
  smokeTestLauncher();
  printNextSteps(configuredProviders);
}

try {
  main();
} catch (error) {
  log(`Setup failed: ${error.message}`);
  process.exit(1);
}
