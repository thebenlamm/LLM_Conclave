# Conditional Analysis (Quick Scan)

Part: core (CLI)

- API surfaces: src/server/Server.ts (Express/socket.io), command handlers under src/commands/*
- Data models: none detected (no ORM/migrations in quick scan)
- Config: .env, .env.example (env-based configuration)
- Entry points: index.ts (CLI), src/server/Server.ts (optional server)
- Shared code: src/utils, src/core, src/providers
- Async/event: EventBus (src/core/EventBus.ts) for internal pub/sub
- CI/CD: none detected (no .github/workflows or pipeline files)
- Security/auth: Config command manages API keys/env setup (src/commands/config.ts)

Notes:
- Quick scan only: filenames/directories inspected; source content not read.
