---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 5
connections:
  parent: .specs/modules/database.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Task: Table tab (Data + Properties), database tables tab, EXPLAIN-gated filter

## Status

`in-progress` — all 8 implementation phases done (see `.specs/tasks/table-tab-properties-and-filter-plan.md`); kept out of `done` only because interactive GUI verification in `wails dev` needs the user (no GUI-automation tool available here).

## Goal

Double-clicking a table opens a tab with two sub-tabs: **Data** (rows, with a filter input gated by an `EXPLAIN` row-count check) and **Properties** (constraints, foreign keys, references, triggers, index, partitions, statistics, DDL). Double-clicking a database (or a locked single-database connection) opens a tab listing that database's tables. Single-click on either now only focuses/selects — it no longer expands the tree inline (database level) or opens the old quick query tab (table rows).

## Background

User request, 2026-10-03. Confirmed interaction model (see `.specs/modules/database.md` Notes, 2026-10-03 entry, and the clarifying questions asked during `bsdd new`):
- Single-click on a table row: focus only (today it opens a `SELECT * FROM table LIMIT 100` query tab — that shortcut goes away).
- Single-click on a database node (or a locked connection acting as the database level): focus only (today it expands the tree inline to show tables — that inline expansion goes away for this level only; a connection's own expand-to-show-databases is untouched).
- Double-click is the only way to open either new tab.
- The Data sub-tab's filter input always runs `EXPLAIN` first; if the estimated row count (not scan type) exceeds a threshold, a confirmation modal asks "filter anyway, or cancel?" before running the real filtered query.

## Acceptance Criteria

- [x] Double-clicking a table (under a database node, or directly under a locked single-database connection, **in the sidebar tree** — user feedback 2026-10-11 restored inline tree browsing alongside the tab, see `.specs/modules/database.md` Notes) opens a new tab type with **Data** and **Properties** sub-tabs.
- [x] **Data** sub-tab shows the table's rows (replaces the removed single-click quick-query shortcut's purpose) and has a filter input at the top.
- [x] The filter input, before running the real filtered query, runs `EXPLAIN` on it and reads the estimated row count — implemented by reusing the existing `RunQuery` with an `EXPLAIN `-prefixed statement, **not** a new `ExplainQuery` method (simpler, zero new backend surface for this half — see the plan's "Plan-Time Decisions").
- [x] If the estimated row count exceeds a threshold (50,000, hardcoded), a modal appears asking whether to run the filter anyway or cancel; the filtered query only runs on explicit confirmation (or immediately, without a modal, if under the threshold). Applies to every Data-tab query, including the initial unfiltered load, not just user-typed filters.
- [x] **Properties** sub-tab exposes all required sections (constraints, foreign keys, references, triggers, index, partitions, statistics, DDL) as a horizontal sub-tab strip, backed by one combined `GetTableDetails` call — verified against a real MySQL 8.0 server (disposable Docker schema with a cross-table FK, a trigger, and a RANGE-partitioned table) in Phase 1.
- [x] Double-clicking a database node (or a locked connection) opens a tab listing that database's tables.
- [x] Single-click on a table row no longer opens a query tab — it only focuses/selects the row (new `focusedTable` state), whether the row is inline in the sidebar tree or inside the database-tables tab.
- [x] Single-click on a database node (or a locked connection) still expands/collapses the tree inline to show tables, exactly as before this task — the user asked for this restored (2026-10-11) after an initial version removed it; only the *action* on single-click changed (no more opening a quick query tab), not whether it expands.
- [x] Existing shortcuts that depend on `focusedNode`/`focusedRow` (Ctrl+Enter "open last used query", rename, move-to-folder) keep working — audited: `focusedNode` is still set on every click of a connection/database row exactly as before (just no longer also triggers `toggleDb`), and `focusedRow` never covered database/table rows in the first place, so neither was affected by removing inline tree expansion.

**Verified:** `tsc --noEmit`, `vite build`, `go build ./...`, `go vet ./...`, `gofmt` all clean; a disposable Go test against a real MySQL 8.0 server (Docker) confirmed `GetTableDetails`' every section against real FK/trigger/index/partition data; `wails build` + a smoke-launch of the packaged binary ran cleanly (no crash, no new console errors). **Post-ship fixes (2026-10-11, user feedback)**: restored inline tree expansion (see Acceptance Criteria above) and fixed a `null`-vs-`[]` crash in `GetTableDetails`'s empty sections, re-verified with a second disposable Go test against a table with zero FKs/triggers/partitions.
**Not verified by the assistant** (no GUI-automation tool available — needs the user's own pass in `wails dev`): actually double-clicking a table/database in the tree, the EXPLAIN modal appearing for a real heavy query, the Properties sub-tabs rendering correctly, the DDL Monaco view.

## Affected Modules

- `database` (primary — new tab components, new backend methods, changed click semantics in `DatabasePanel.tsx`)

## Out of Scope

- Editing data from the Data sub-tab (read-only rows + filter, no inline cell editing) unless explicitly requested later.
- Editing constraints/indexes/triggers from the Properties sub-tab (read-only display of existing schema, no DDL editor).
- Changing how saved queries or the existing `QueryTab.tsx` quick-SQL workflow behaves — that tab type is untouched; this task only removes the single-click *shortcut* that used to open one from the tree.
- The exact `GetTableDetails` API shape (one combined call vs. one method per section) and the EXPLAIN row-count threshold value — both plan-time decisions.

## Next Step

Run `bsdd plan` to turn this into an ordered implementation plan.
