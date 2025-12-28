# Technology Stack (Quick Scan)

Part: core (CLI)

- Language: TypeScript (tsconfig.json)
- CLI framework: commander + chalk (src/commands/*)
- LLM providers: @anthropic-ai/sdk, openai, @google/genai, gemini, grok, mistral (src/providers/* via ProviderFactory)
- Server (optional web UI): Express + socket.io (src/server/Server.ts)
- Tooling: ts-node, typescript; build: tsc → dist/index.js
- Runtime: Node >=14 (package.json engines)

Architecture pattern: CLI-first tool with modular command handlers; optional Express/socket.io server for UI/events. Multi-provider LLM abstraction via ProviderFactory.
