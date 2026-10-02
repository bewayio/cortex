---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-01
version: 1
connections:
  parent: .specs/tasks/db-connection-errors-and-reconnect.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Database tree errors + Reconnect

## Linked Task

`.specs/tasks/db-connection-errors-and-reconnect.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Entire change is scoped to `frontend/src/components/DatabasePanel.tsx` — one coherent cache/error-handling fix, no parallelizable surface.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/database.md` read.
- Task linked to the module spec; acceptance criteria testable.
- Root cause already isolated by reading `DatabasePanel.tsx` and `database.go` — no open unknowns about backend behavior (confirmed no pooling, each call opens/closes its own connection).
- No blocking tasks; no cross-module boundary (frontend-only, single component).

## Current State (read from code)

- `toggleConn` (expand a connection): fetches `ListDatabases`, catches failure into the shared `testMsg` slot (`{id, ok, msg}` — also reused by the connection-form's "Test" button). On failure, still writes `databasesByConn[conn.id] = []`, which permanently satisfies the `!databasesByConn[conn.id]` "already loaded" guard — a later re-expand never retries.
- `toggleConn`'s auto-expand-single-database branch, and `toggleDb` (expand a database): both call `ListTables(...).catch(() => [])` — failures are fully swallowed, rendered identically to a genuinely empty database.
- Connection row already has a right-click `ctxMenu` (Rename, Move to folder, New Folder…) — the natural place to add Reconnect.

## Phases

### Phase 1 — Per-database error state + stop swallowing `ListTables` failures (S)

- Add `dbError: Record<string, string>` state, keyed identically to `tablesByDb` (`` `${connId}/${database}` ``).
- Extract a `fetchDbTables(connId, database)` helper: on success, writes `tablesByDb[key]` and clears `dbError[key]`; on failure, clears `tablesByDb[key]` (does **not** cache an empty array) and sets `dbError[key]` to the error message.
- Replace both existing `ListTables(...).catch(() => [])` call sites (inside `toggleConn`'s single-database auto-expand branch, and inside `toggleDb`) with this helper.
- Render a `db-test-msg err` banner under the relevant database row when `dbError[key]` is set — same class/visual treatment as the existing connection-level banner.

### Phase 2 — Stop permanently caching an empty result on `ListDatabases` failure (S)

- Extract a `fetchConnDatabases(conn)` helper from `toggleConn`'s expand branch (the `ListDatabases` call + the single-database auto-expand call into `fetchDbTables` from Phase 1).
- On failure: do **not** write `databasesByConn[conn.id] = []`; only set the error (`testMsg`, unchanged slot/shape). Leaving the key absent means the `!databasesByConn[conn.id]` guard still returns true next time, so a plain collapse-then-re-expand already retries instead of reusing stale empty state — this alone fixes the "stuck empty forever" bug even before Reconnect is added.
- Dependency: Phase 1 (reuses `fetchDbTables`).

### Phase 3 — "Reconnect" context-menu action (S)

- Add a "Reconnect" item (e.g. `RefreshCw` icon from `lucide-react`, consistent with the file's icon-per-item convention) to the connection's `ctxMenu`, above or below Rename.
- Handler: clear `databasesByConn[conn.id]`, every `tablesByDb`/`dbError` key prefixed `` `${conn.id}/` ``, and any `testMsg` for this connection; ensure `expandedConn` includes this connection's id; call `fetchConnDatabases(conn)` (from Phase 2) to re-fetch immediately, regardless of whether the row was already expanded or collapsed.
- Dependency: Phase 2.

### Phase 4 — Verification (S)

- `tsc --noEmit`, `vite build`, `go build ./...` (expect no backend changes — confirms nothing was accidentally touched there).
- Manual verification in `wails dev` still needed from the user: stop a MySQL server mid-session, confirm the tree shows the error (not a blank list) at both connection and database level, confirm Reconnect re-fetches once the server is back up, confirm a plain collapse/re-expand also retries per Phase 2's fix.
- Dependency: Phases 1–3.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Per-database error state | S |
| 2. Stop caching empty result on failure | S |
| 3. "Reconnect" context-menu action | S |
| 4. Verification | S |

## Out of Scope

Unchanged from the linked task: `RunQuery`, saved queries, connection folders, backend connection pooling.

## Next Step

Run `bsdd start` (or `bsdd run`) to begin Phase 1.
