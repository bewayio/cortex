# ADR-0002: Local JSON files in ~/.bcode, no database

## Status

Accepted (as-implemented, documented by `bsdd init` on 2026-09-21)

## Date

2026-09-21

## Context

Single-user local app with small data: recent workspaces, per-workspace UI state, chat history.

## Decision

We persist JSON and text files under `~/.bcode` (`recent.json`, `last_workspace.txt`, `workspaces/{id}.json`, `chats/{ws}/{tab}.json`). UI preferences stay in WebView `localStorage`. There is no database and no migration tool. File formats are backward compatible by user constraint.

## Consequences

### Positive

- No setup, easy to inspect and back up

### Negative

- No schema versioning, no atomic writes (needs verification)
- `localStorage` is per WebView profile and is lost if the profile is reset

### Neutral

- Any format change needs a compatibility step

## Alternatives Considered

| Alternative | Pros | Cons | Why Not Chosen |
|-------------|------|------|----------------|
| SQLite | Queries, atomic | New dependency and migrations | Not needed at current scale |

## References

- `app.go` workspace and chat sections
