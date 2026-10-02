---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 4
connections:
  parent: .specs/modules/database.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Database tree — surface errors at every level + "Reconnect" action

## Status

`in-progress` — all 4 implementation phases done; kept out of `done` only because live-MySQL interactive verification in `wails dev` needs the user (no GUI-automation tool available here).

## Goal

When expanding a MySQL connection or database in the sidebar tree fails to list databases/tables, show the actual error instead of silently rendering an empty list. Add a "Reconnect" item to a connection's right-click context menu that forces a fresh fetch (clearing any stale cached state) and re-expands.

## Background

User report, 2026-10-01: expanding a connection sometimes shows no databases/tables with no explanation. Root cause (read from `frontend/src/components/DatabasePanel.tsx` and `database.go`):

1. `toggleConn` surfaces a `ListDatabases` error via the existing `testMsg` banner — but `toggleDb`'s `ListTables` call, and the auto-expand-single-database path inside `toggleConn`, both swallow errors with `.catch(() => [])`. A failed table listing is indistinguishable from a genuinely empty database.
2. On any `ListDatabases` failure, `databasesByConn[conn.id]` is set to `[]`, and the guard that decides whether to re-fetch (`!databasesByConn[conn.id]`) treats that cached empty array as "already loaded" — collapsing/re-expanding never retries, even after the server becomes reachable again.
3. Confirmed no backend change is needed: `database.go`'s `openConn` opens a fresh `*sql.DB` per call, closed (`defer db.Close()`) at the end of every method (`ListDatabases`, `ListTables`, etc.) — there is no backend-side connection pool to actually "reconnect"; this is purely a frontend cache/error-surfacing problem.

See `.specs/modules/database.md` Notes (2026-10-01 entries) for the full rationale.

## Acceptance Criteria

- [x] Expanding a database whose `ListTables` call fails shows an error message in the tree, in the same visual style as the existing connection-level `testMsg` error banner (not a silently-empty list).
- [x] The auto-expand-single-database path inside `toggleConn` (for a connection locked to one database) also surfaces a `ListTables` failure instead of swallowing it.
- [x] A failed `ListDatabases`/`ListTables` fetch no longer poisons the cache permanently: collapsing and re-expanding the same connection/database retries the fetch (fixed by no longer writing an empty-array sentinel on failure — the "already loaded" guard stays false, so a plain re-expand retries for real).
- [x] A connection's right-click context menu (`ctxMenu`) gains a "Reconnect" item, alongside the existing Rename/Move to folder items.
- [x] Clicking "Reconnect": clears that connection's cached databases, all its cached tables, and any stored error state; re-fetches `ListDatabases` (and `ListTables` for a locked single-database connection); expands the row if it was collapsed; surfaces success (fresh tree) or failure (error banner) the same way a first-time expand does.
- [x] No backend changes — confirmed each relevant Go method already opens/closes a fresh connection per call; `go build ./...` diff-free in `database.go`.

**Verified:** `tsc --noEmit`, `vite build`, `go build ./...` all clean.
**Not verified by the assistant** (no GUI-automation tool available — needs the user's own pass in `wails dev`): actually stopping/starting a real MySQL server to confirm the tree shows the live error at both levels, confirm Reconnect re-fetches correctly, confirm a plain collapse/re-expand retries per the cache fix.

## Affected Modules

- `database` (only — frontend-only change in `DatabasePanel.tsx`)

## Out of Scope

- Any change to `RunQuery`, saved queries, or connection folders.
- Backend connection pooling (none exists today, none is needed for this fix).
- Auto-retry/polling without user action (reconnect is user-triggered, not automatic background retry).

## Next Step

Run `bsdd plan` to turn this into an ordered implementation plan.
