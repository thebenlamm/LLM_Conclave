# Session Continuation Design

This document is a design-oriented companion to the current continuation feature. It has been updated to reflect what exists today versus what remains aspirational.

## Current Status

Implemented today:

- Session persistence under `~/.llm-conclave/sessions/`
- `llm_conclave_continue` for follow-up discussion
- `llm_conclave_sessions` for listing recent sessions
- Parent-session linking for continuations
- `reset` mode to continue from a prior summary instead of full history

Not implemented today:

- Checkpoint-based resume for interrupted discussions
- Branching from arbitrary points in history
- Delete/show/cleanup actions through the MCP tool surface
- Checkpoint IDs or agent-state restoration

## Current MCP Interface

### `llm_conclave_continue`

```json
{
  "session_id": "session_2026-02-13T07-27-18_abc1",
  "task": "Can you go deeper on the scalability trade-offs?",
  "reset": false
}
```

Notes:

- `task` is the required follow-up field
- `session_id` is optional; if omitted, the most recent session is used
- `reset: true` reuses the prior summary without replaying the full history

### `llm_conclave_sessions`

```json
{
  "limit": 5,
  "mode": "consensus"
}
```

Current scope is intentionally narrow: list recent sessions, optionally filtered by mode.

## What the Current Implementation Persists

Each saved session includes:

- Session identity and timestamp
- Mode, task, round counts, and status
- Agent definitions and judge metadata
- Conversation history
- Optional project context reference
- Cost and token metadata
- Parent session linkage for continuations

Primary implementation points:

- `src/core/SessionManager.ts`
- `src/core/ContinuationHandler.ts`
- `src/mcp/server.ts`

## Storage Layout

Current storage root:

```text
~/.llm-conclave/sessions/
```

Current shape:

```text
~/.llm-conclave/
  sessions/
    manifest.json
    session_<timestamp>_<id>/
      session.json
```

This is simpler than the earlier checkpoint-oriented design and matches the code that exists now.

## Current Flow

1. A discussion completes through `llm_conclave_discuss`.
2. The session is serialized and indexed by `SessionManager`.
3. `llm_conclave_sessions` lists saved sessions for discovery.
4. `llm_conclave_continue` loads either the selected or most recent session.
5. `ContinuationHandler` reconstructs the runtime config and starts a new persisted child session.

## Design Direction

The original design goals are still reasonable, but they should be treated as future work:

- Checkpoint restore for interrupted long-running work
- Explicit branch creation
- Session cleanup and richer inspection commands
- More granular partial-history reuse

If that work resumes, it should build on the current persisted session format instead of assuming the older broader MCP action model.
