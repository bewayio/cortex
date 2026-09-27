---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0009]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: database

## Purpose

Configure MySQL connections, browse their databases and tables in a sidebar tree, and run SQL in editor tabs with results, CSV export, clipboard copy and autocomplete. BCode acts as a client to the user's own external databases — this is unrelated to ADR-0002 (BCode's own storage stays local JSON, no change there).

## Boundaries

- Owns: `~/.bcode/db/connections.json` (connection metadata, encrypted password field, folder), `~/.bcode/db/key` (local encryption key, `0600`), `~/.bcode/db/connection_folders.json` (connection folder names), `~/.bcode/queries/{id}.json` (saved query-tab content: SQL text, connection id, database, custom name, folder), `~/.bcode/queries/folders.json` (query folder names)
- Does NOT own: the user's actual MySQL data (read/write only at the user's request, never cached beyond one query's result set in memory), workspace state, chat/terminal history

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| ListDBConnections | none | `DBConnection[]` (id, name, host, port, user, database — password never included) | Global list, connections.json |
| SaveDBConnection | `DBConnectionInput` (includes plaintext password only on create/edit, never returned) | id | Encrypts password, writes connections.json |
| DeleteDBConnection | id | error | Removes from connections.json |
| TestDBConnection | id | error | Opens and pings (5s timeout), does not keep the connection |
| ListDatabases | connectionID | string[] | `SHOW DATABASES`, system schemas (`information_schema`, `performance_schema`, `mysql`, `sys`) filtered out; skipped (returns the one locked database directly, no network call) if the connection is locked |
| ListTables | connectionID, database | string[] | `information_schema.tables`, not `USE`+`SHOW TABLES` — a pooled `*sql.DB` can reuse connections across calls, and `USE` would leak selected-database state between callers |
| DescribeTable | connectionID, database, table | `ColumnInfo[]` | For autocomplete and a future "columns" view |
| RunQuery | connectionID, database, sql | `QueryResult` (columns, rows, rowCount, rowsAffected, durationMs, truncated, error) | One statement, read or write; no query-type restriction — the user's own database, their risk. Rows capped at 5,000 (`truncated: true` beyond that) |
| ListSavedQueries | none | `SavedQuery[]` (id, name, connectionID, database, sql, folder) | Global, `~/.bcode/queries/` |
| SaveQueryTab | `SavedQuery` | id, error | Upsert by id (generates one on first save — returned, since the frontend has no other way to learn it) |
| DeleteQueryTab | id | error | Remove a saved query tab permanently (user closes it and does not want it back) |
| ListDBConnectionFolders / CreateDBConnectionFolder / DeleteDBConnectionFolder | none / name / name | string[] / error / error | Grouping folders for connections. Deleting a folder ungroups its connections, does not delete them |
| MoveDBConnectionToFolder | id, folder | error | Assign (or clear, with `folder: ""`) a connection's group |
| RenameDBConnectionFolder | oldName, newName | error | Renames a folder everywhere it's referenced; merges into `newName` if it already exists |
| ListQueryFolders / CreateQueryFolder / DeleteQueryFolder | none / name / name | string[] / error / error | Same, for saved queries |
| MoveQueryToFolder | id, folder | error | Assign (or clear) a saved query's group |
| RenameQueryFolder | oldName, newName | error | Same rename/merge behavior as `RenameDBConnectionFolder`, for query folders |

## Events Published

None. `RunQuery` is request/response, not streamed — result sets are expected to be small enough (a manual SQL client use case) that streaming is not needed for v1; revisit if large result sets prove otherwise.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| `github.com/go-sql-driver/mysql` | Go library | `database/sql` driver, pure Go, no cgo |
| User's MySQL server(s) | network, user-configured | MySQL wire protocol |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local; network access to whatever hosts the user configures |

## Security

- Password encrypted at rest (AES-256-GCM, key in `~/.bcode/db/key`, `0600`) — see ADR-0009 for the explicit limits of this approach (not safe against another process running as the same OS user).
- `RunQuery` executes exactly the SQL text the user wrote, no statement-type allowlist/blocklist — a DB client that refuses `DROP TABLE` on the user's own database is not useful; this is the same trust model as any SQL client (DBeaver, TablePlus, mysql CLI).
- Connections are global (ADR-0009): every workspace can see and use every configured connection. No per-connection access control beyond the OS user running BCode.
- Query text and results are not sent anywhere outside the configured MySQL host and the local UI.

## Notes

- Shipped 2026-09-26. Sidebar tree is Connection → Database → Tables (`components/DatabasePanel.tsx`), one level shorter (Connection → Tables) when a connection is locked to a specific database. Fifth `ActivityBar` icon (`Database`), new `Panel` value `'database'` — unlike Explorer/Git it does **not** show the shared recent-workspaces section above it (connections are global, not tied to a workspace).
- Revised same day, on user feedback: the sidebar is two separate collapsible sections ("Connections", "Saved Queries" — same collapse pattern as `GitPanel.tsx`'s two sections), not one flat list. Both connections and saved queries can be grouped into folders (right-click an item → "Move to folder" → an existing folder or "New Folder…"; each section header also has its own "new folder" button). A folder is just a name connections/queries reference (`Folder` field) — deleting a folder ungroups its contents rather than deleting them, and an empty folder still persists (`connection_folders.json` / `queries/folders.json`) so a user can create one ahead of assigning anything into it. Verified against real data (Go test: create/idempotent-recreate/move/delete-ungroups, for both connection and query folders).
- The connection/database `<select>` dropdowns (query tab subheader, and the folder picker in the connection form) were restyled on user feedback ("cores dos seletores tem de ser melhores") — visible border, custom SVG chevron (`appearance: none` + background-image, since native select arrows read poorly against this dark theme), hover/focus states using the app's accent color.
- Query tabs are an `EditorTab` variant (`isQueryTab`, non-singleton — several can be open at once, deduplicated only by `savedQueryId` when reopened from the saved-queries list). `components/QueryTab.tsx`: a subheader to pick connection + database, a resizable vertical split (Monaco SQL editor on top, results grid below, drag handle same spirit as the terminal dock resize handle), a run button and Cmd/Ctrl+Enter. Rename via double-click, same pattern as terminal tab rename. SQL text + connection + database + name autosave (400ms debounce) to `~/.bcode/queries/{id}.json`; closing a tab never deletes its saved copy, only an explicit delete does.
- Autocomplete (`frontend/src/utils/sqlAutocomplete.ts`): one Monaco completion provider registered at module scope (not per tab instance, to avoid duplicate registrations), reading the currently *focused* query tab's connection/database at suggestion time. Suggests SQL keywords always, plus table names (`ListTables`) and column names (`DescribeTable`, first 20 tables) once a connection and database are selected, cached per connection+database pair for the session.
- CSV download and "copy as TSV" run entirely in the frontend from the in-memory `QueryResult` — no extra backend round trip. CSV follows RFC 4180 quoting (a value with a comma, quote or newline gets wrapped in quotes, internal quotes doubled) — verified against a real MySQL row containing a comma (`"Carol, Inc."`).
- **Bug found and fixed during manual verification against a real MySQL 8.0 server (Docker, 2026-09-26)**: the original `RunQuery` tried `Query` first and fell back to `Exec` only if `Query` returned an error. `go-sql-driver/mysql`'s `Query` does **not** error on `INSERT`/`UPDATE`/`DELETE` (MySQL's wire protocol allows any statement via `COM_QUERY`), so the fallback path was never reached and `RowsAffected` stayed 0 even though the statement executed. Worse, a true try-then-fallback would have risked running the statement twice for a driver that *did* error first. Fixed by deciding `Query` vs `Exec` upfront from the statement's leading keyword (`statementReturnsRows`, `database.go`) instead of by trying and catching. All backend methods (connection CRUD, encryption round-trip incl. file permission `0600` and no-plaintext-leak, `ListDatabases`/`ListTables`/`DescribeTable`, `SELECT`, `INSERT` with correct `RowsAffected`, an intentionally-bad query's error surfacing, saved-query CRUD, edit-keeping-existing-password) were re-verified against the real server after the fix and passed.
- **Not verified**: the actual running GUI (clicking a table to open a tab, the split-view drag handle, autocomplete suggestions appearing, the CSV file opening correctly in a spreadsheet app, a real clipboard paste of the TSV output, Codex/other engines). The backend and the CSV/TSV formatting logic were verified directly (a Go test against live MySQL, a Node script against the exact frontend functions); the assistant cannot click through the Wails window. Recommend the user run through `wails dev` before treating this as fully done.
- **Second-round fixes (2026-09-26, user feedback on the first delivery)**: (1) saving was accidentally automatic (debounced autosave on every keystroke, creating an unwanted saved-query file per edit) — now explicit only, via a Save button or Cmd/Ctrl+S; (2) `SaveQueryTab` didn't return the id it generates on first save, which the explicit-save fix exposed as a real gap — now returns `(string, error)`; (3) run shortcut is Cmd+Enter on macOS / Ctrl+Enter on Linux and Windows, via Monaco's own `KeyMod.CtrlCmd` convention bound directly on the editor instance (a plain DOM listener does not reliably see the key, since Monaco consumes it first); (4) running now executes only the statement under the cursor (or the nearest one, if the cursor sits between statements) when nothing is selected, or exactly the selected text — split into multiple statements to run sequentially only when the selection itself spans more than one, separated by `;` (`frontend/src/utils/sqlStatements.ts`, verified with a Node script covering cursor-mid-statement, cursor-in-blank-line, selection-of-one, selection-of-two).
- **Shipped 2026-09-27, user request (behavior corrected same day)**: Ctrl/Cmd+Q reopens/focuses the last-used saved query from anywhere in the app (not scoped to the Database panel being open) — falls back to a new blank tab only if no saved query exists yet. Ctrl/Cmd+Enter on a tree node in `DatabasePanel.tsx` opens that database's (or, on a connection node, that connection's) most recently updated saved query, or a fresh one if none exists yet — `DatabasePanel.tsx` now tracks a `focusedNode` (connection or database) set on click, independent of the existing expand/collapse behavior. Full detail and the cross-platform key convention: `.specs/modules/shell.md`, task `.specs/tasks/quick-navigation-and-shortcuts.md`.
- **Shipped 2026-09-27, user request**: `DatabasePanel.tsx` gained three UI improvements. No backend interface changes for two of the three (`MoveDBConnectionToFolder`/`MoveQueryToFolder` cover drag-and-drop's writes); folder rename needed two new methods:
  1. **Inline rename** for connections, saved queries, and both kinds of folder, reachable two ways: a "Rename" entry in the context menu (connections/queries use the existing `ctxMenu`; folders got a new, separate `folderCtxMenu`, since a folder's own menu — "Rename" + "Delete Folder" — has nothing to do with `ctxMenu`'s "Move to folder" list), and pressing plain Enter on a focused row. Focus tracking for this is a **new, separate `focusedRow` state** (`{kind: 'connection'|'query'|'connection-folder'|'query-folder', id}`), deliberately *not* a widening of the existing `focusedNode` (added for Ctrl+Enter in the previous task) — keeping them apart meant zero risk to the already-shipped Ctrl+Enter behavior. Connection rename here is name-only (`SaveDBConnection` with an empty password, which the backend already treats as "keep existing" — the same rule the pencil-icon full edit form relies on). Folder rename required two new backend methods, `RenameDBConnectionFolder(oldName, newName)` and `RenameQueryFolder(oldName, newName)` (`database.go`): reassigns every connection/query in `oldName` to `newName`, then updates the folder list — if `newName` already names a different existing folder, this **merges** into it rather than erroring (folders are just names here, not unique-checked entities, consistent with the rest of this file). Verified with a disposable Go test (rename-moves-members, merge-into-existing, no-op cases).
  2. **Drag-and-drop** to move connections and saved queries between folders (and to/from "no folder" by dropping on the section header), in addition to the existing right-click "Move to folder" menu, which stays as the non-drag fallback. Plain HTML5 drag-and-drop with a MIME type per kind (`application/x-bcode-connection`, `application/x-bcode-query`) checked in `onDragOver`, so a connection can only land on a connection folder/section and a query only on a query folder/section — no cross-kind drops, enforced by simply not calling `preventDefault()` on a mismatched drag.
  3. **Folder-row alignment fix**: the folder icon and title looked vertically off in a user-supplied screenshot. Applied two changes: `.file-tree-item-icon` now has `line-height: 0` (removes any inherited text line-height from affecting the icon span's box — a known cross-browser cause of icon/text baseline drift), and the folder icon size went from 13 to 14 to match the connection row's icon convention. **Not visually confirmed by this assistant** — no way to render the app to check the fix against the original screenshot; needs the user's confirmation in `wails dev`.
  - Task: `.specs/tasks/db-tree-rename-and-dragdrop.md`.
- **Shipped 2026-09-27, user request**: three more small `DatabasePanel.tsx`/`QueryTab.tsx` additions, no backend changes:
  1. `QueryTab.tsx`'s toolbar gained a "New" button next to Save — opens a new blank query tab, inheriting the current tab's connection/database (not fully blank), same `openOrFocusTab` shape used everywhere else for a new query tab.
  2. Database rows in `DatabasePanel.tsx` (previously button-less) now have the same "New Query" icon button connection rows already had, plus a second new one — "Open Last Used Query" (`History` icon) — that reuses `openLatestOrNewQuery` (previously only reachable via Ctrl+Enter on a focused node) with an explicit scope argument instead of reading `focusedNode`, so a click doesn't require a prior click-to-focus step. Connection rows gained the same "Open Last Used Query" button alongside their existing "New Query" one.
  3. New `components/QuerySearch.tsx` (Ctrl/Cmd+Shift+Q) — see `.specs/modules/shell.md`.
- Task: `.specs/tasks/mysql-query-tabs.md`.
