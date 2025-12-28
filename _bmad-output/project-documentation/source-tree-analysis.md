# Source Tree Analysis (Quick Scan)

Project root: /Users/benlamm/Workspace/llm_conclave

```
.
├── index.ts               # CLI entry; registers commands
├── src/
│   ├── commands/          # CLI commands (consult, consult-stats, discuss, review, iterate, etc.)
│   ├── orchestration/     # Orchestrators (Consult, Iterative, etc.)
│   ├── core/              # Shared core services (ConversationManager, OutputHandler, EventBus, CostTracker)
│   ├── providers/         # LLM provider adapters (OpenAI, Anthropic, Gemini, Grok, Mistral) via ProviderFactory
│   ├── utils/             # Utilities (ProjectContext, ConsultLogger, TokenCounter)
│   ├── cli/               # CLI helpers (ConfigCascade, ModeDetector, PersonaSystem)
│   ├── interactive/       # Interactive session UI/Status
│   ├── init/              # Init/config scaffolding and API key detection
│   ├── memory/            # Memory managers
│   ├── server/            # Optional Express/socket.io server endpoints and session manager
│   ├── tools/             # Tool registry
│   └── types/             # Shared TypeScript types
├── public/                # Static assets for optional server UI
├── docs/                  # Feature/design docs (planned features, resume design)
├── _bmad/                 # BMad modules/workflows
└── _bmad-output/          # Generated planning and scan artifacts
```

Critical folders summary:
- `src/commands`: command handlers (CLI surface)
- `src/orchestration`: orchestration engines
- `src/core`: shared runtime services/events/costs
- `src/providers`: pluggable LLM providers
- `src/utils`: helpers and logging
- `src/server`: optional web/socket server
- `src/types`: type definitions

Scan level: quick (structure only; no file reads)
