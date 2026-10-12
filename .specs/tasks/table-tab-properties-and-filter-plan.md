---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 2
connections:
  parent: .specs/tasks/table-tab-properties-and-filter.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Table tab (Data + Properties), database tables tab, EXPLAIN-gated filter

## Linked Task

`.specs/tasks/table-tab-properties-and-filter.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Backend (Go) must exist before the frontend can consume it — a real sequential dependency, not something orchestration would parallelize usefully.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/database.md` read.
- Task linked to the module spec; acceptance criteria testable.
- Two plan-time decisions from the task resolved below (API shape, EXPLAIN threshold).
- No blocking tasks; no cross-module boundary (all within `database`).

## Plan-Time Decisions

- **EXPLAIN gate needs no new backend method.** `RunQuery` already executes arbitrary SQL and returns a generic `QueryResult` (`columns`, `rows`), and `database.go`'s `statementReturnsRows` already treats `EXPLAIN` as a row-returning statement. The frontend can call the existing `RunQuery(connId, db, "EXPLAIN " + filterSQL)`, find the `rows` column's index in the result, and take the max value across returned plan rows — no `ExplainQuery` method needed. Simpler than the task's tentative API and zero new backend surface for this half of the feature.
- **Properties sub-tab: one combined `GetTableDetails` call**, not one method per section — a single opened connection, several sequential `information_schema` queries (and one `SHOW CREATE TABLE`), returned as one struct. Matches `DescribeTable`'s existing one-round-trip-per-view precedent and avoids 8 separate Wails-bound round trips for data that's always viewed together.
- **Heavy-query threshold**: 50,000 estimated rows, a hardcoded frontend constant for v1 (not user-configurable) — simplest option that satisfies the acceptance criteria; revisit if the user asks for a setting later.

## Phases

### Phase 1 — Backend: `GetTableDetails` (M)

- New `database.go` structs: `ConstraintInfo`, `ForeignKeyInfo` (reused for both outbound FKs and inbound references), `TriggerInfo`, `IndexInfo`, `PartitionInfo`, `TableStatistics`, and a wrapping `TableDetails`.
- New method `GetTableDetails(connectionID, database, table string) (TableDetails, error)`: opens one connection (`openConn`, same pattern as `DescribeTable`), runs these queries in sequence, closes at the end:
  - Constraints: `information_schema.table_constraints` joined to `key_column_usage` (PK, UNIQUE, CHECK).
  - Foreign keys (outbound): `information_schema.key_column_usage` where `referenced_table_name` is not null and `table_name = ?`.
  - References (inbound): same table, filtered by `referenced_table_name = ?` instead — tables that point *at* this one.
  - Triggers: `information_schema.triggers` where `event_object_table = ?`.
  - Index: `information_schema.statistics` (index name, columns, uniqueness, type).
  - Partitions: `information_schema.partitions` where `partition_name IS NOT NULL` (empty slice for a non-partitioned table — not an error).
  - Statistics: row count estimate, data length, index length, avg row length, auto_increment, engine, collation from `information_schema.tables`.
  - DDL: `SHOW CREATE TABLE` (quote the identifier the same way the rest of `database.go` already does, not string-interpolated SQL text).
- Dependency: none (first phase).

### Phase 2 — Frontend: shared results grid extraction (S)

- Extract `QueryTab.tsx`'s inline results `<table>` (header, rows, row-count/duration footer, CSV/TSV export helpers `toCSV`/`toTSV`) into a new `components/QueryResultsGrid.tsx`, parameterized by a `QueryResult`. `QueryTab.tsx` switches to use it; no behavior change there.
- Dependency: none — can run in parallel with Phase 1, both land before Phase 4 needs the shared grid.

### Phase 3 — Frontend: new tab types wired into the editor (S)

- `types.ts`: add `isTableTab?: boolean` (+ `dbConnectionId`, `dbDatabase`, `dbTable`) and `isDbTablesTab?: boolean` (+ `dbConnectionId`, `dbDatabase`) to `EditorTab`, following the existing `isQueryTab` shape.
- `editorStore.ts`'s `openOrFocusTab`: dedupe a table tab by `(dbConnectionId, dbDatabase, dbTable)` and a db-tables tab by `(dbConnectionId, dbDatabase)` — same spirit as `isQueryTab`'s `savedQueryId` dedupe, singleton-per-target rather than singleton-per-app.
- `EditorPane.tsx`: render `<TableTab tab={activeTab} />` / `<DatabaseTablesTab tab={activeTab} />` for the respective flags, alongside the existing `isQueryTab`/`isCommitTab`/etc. branches.
- Dependency: none structurally, but trivial without Phases 4–6's actual tab content — do this first since 4–6 all need it.

### Phase 4 — Frontend: `TableTab.tsx` — Data sub-tab + EXPLAIN gate (M)

- New `components/TableTab.tsx`: a Data/Properties sub-tab switcher (simple two-button header, not a new generic tab-bar abstraction) over the tab's `dbConnectionId`/`dbDatabase`/`dbTable`.
- Data sub-tab: filter input at top is a `WHERE`-clause fragment (user-confirmed) — the app builds `SELECT * FROM table WHERE <input> LIMIT N`, not a full editable query. Results via `QueryResultsGrid` from Phase 2.
- On filter submit: call `RunQuery(connId, db, "EXPLAIN " + builtQuery)`, extract the `rows` column's max value across the result's rows; if it exceeds 50,000, show a confirmation modal (reuse the existing `ft-confirm-overlay`/`ft-confirm-dialog` pattern already used for delete confirmations in `DatabasePanel.tsx`) before running the real `RunQuery`; otherwise run it immediately.
- Dependency: Phase 2 (grid), Phase 3 (tab wiring).

### Phase 5 — Frontend: `TableTab.tsx` — Properties sub-tab (M)

- Properties sub-tab fetches `GetTableDetails` once (on first view, cached for the tab's lifetime — same spirit as autocomplete's per-connection+database cache) and renders its 8 sections (constraints, foreign keys, references, triggers, index, partitions, statistics, DDL) as a secondary, horizontal sub-tab strip (user-confirmed — same visual pattern as the outer Data/Properties switcher), one section visible at a time. DDL rendered in a read-only Monaco instance (consistent with the rest of the app's SQL display), the rest as simple tables.
- Dependency: Phase 1 (backend method), Phase 3 (tab wiring).

### Phase 6 — Frontend: `DatabaseTablesTab.tsx` (S)

- New `components/DatabaseTablesTab.tsx`: lists a database's tables (`ListTables`, already exists), each row double-click opens the Phase 3/4/5 table tab for that table — same `openOrFocusTab` shape used everywhere else.
- Dependency: Phase 3.

### Phase 7 — Frontend: `DatabasePanel.tsx` click-semantics change (M)

- Table rows (both under a database node and under a locked single-database connection): remove the existing `onClick={() => openQueryTab(...)}`; add `onDoubleClick` to open the Phase 3 table tab; add single-click focus tracking (extend `focusedRow` or a new state — implementation-time call) with visual focus styling, no other side effect.
- Database nodes (and a locked connection acting as the database level): remove the `toggleDb`-driven inline expansion (stop rendering tables nested under the database row); add `onDoubleClick` to open the Phase 6 database-tables tab; single click sets focus only. A connection node's own expand-to-show-its-databases (`toggleConn`) is unchanged.
- Audit `focusedNode`-dependent features (Ctrl+Enter "open last used query", per `quick-navigation-and-shortcuts.md`) and `focusedRow`-dependent features (inline rename, per `db-tree-rename-and-dragdrop.md`) to confirm neither assumed the removed inline-expand-on-click behavior still happening — they operate on click-set focus state, which still gets set, so should be unaffected, but this needs an explicit check given how central `toggleDb` was.
- Dependency: Phases 3–6 (all new tabs must exist to open).

### Phase 8 — Verification (S)

- `tsc --noEmit`, `vite build`, `go build ./...`.
- A disposable Go test against a real MySQL (Docker), same precedent as this module's existing verification style: `GetTableDetails` against a table with at least one FK, one inbound reference, one trigger, one index, and (if feasible) a partitioned table — confirms the queries are correct, not just that they compile.
- Manual GUI verification flagged as needed from the user in `wails dev` (double-click behaviors, the EXPLAIN modal actually appearing for a heavy query, Properties rendering) — same standing caveat as every other UI change in this module, no GUI-automation tool available here.
- Dependency: Phases 1–7.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Backend `GetTableDetails` | M |
| 2. Shared results grid extraction | S |
| 3. New tab types wired into editor | S |
| 4. Data sub-tab + EXPLAIN gate | M |
| 5. Properties sub-tab | M |
| 6. `DatabaseTablesTab.tsx` | S |
| 7. `DatabasePanel.tsx` click-semantics change | M |
| 8. Verification | S |

## Out of Scope

Unchanged from the linked task: editing data/DDL/constraints, changing `QueryTab.tsx`'s own behavior, a configurable EXPLAIN threshold.

## Status

All 8 phases implemented 2026-10-11. See `.specs/tasks/table-tab-properties-and-filter.md` for verified vs. not-yet-verified acceptance criteria — automated checks (backend MySQL test, `tsc`, `vite build`, `go build`/`vet`, a packaged smoke-launch) passed; interactive GUI verification in `wails dev` still needs the user.

## Next Step

Run `bsdd finish` once the user confirms the interactive behavior in `wails dev`.
