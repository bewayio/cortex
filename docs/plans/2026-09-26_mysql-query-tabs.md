# Plan: MySQL client — connections, tree, query tabs

- Task: `.specs/tasks/mysql-query-tabs.md`
- Module (new): `.specs/modules/database.md`
- ADR: `.specs/adrs/0009-mysql-client.md`
- Execution model: **single agent**, phases in sequence
- Status: done (GUI click-through not performed — see task file for the honest verification breakdown)

## Goal

Configure global MySQL connections (encrypted password); browse Connection → Database → Tables (or Connection → Tables if locked) in a new sidebar panel; open multi-instance query tabs with a split SQL editor / results view, connection+database subheader, Monaco autocomplete, CSV download, TSV copy, rename, and save/reopen after close.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made", ADR-0009)
- [x] New module boundaries clear (`database`); touches `shell` for the sidebar panel and editor tab plumbing
- [x] Security approach decided and documented (ADR-0009) — not re-litigated here

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Backend: dependency + encrypted connection storage | M | none |
| 2 | Backend: introspection + query execution | M | 1 |
| 3 | Backend: saved-query persistence | S | none |
| 4 | Frontend: connections settings UI | M | 1 |
| 5 | Frontend: sidebar tree | M | 2 |
| 6 | Frontend: query tab shell (multi-instance, split view, subheader) | M | 3, 4 |
| 7 | Frontend: SQL editor + autocomplete | M | 2, 6 |
| 8 | Frontend: results grid, CSV, TSV | M | 6 |
| 9 | Frontend: rename + persistence wiring | S | 6 |
| 10 | Verify | L | 1–9 |
| 11 | Docs and finish | S | 10 |

### Phase 1: dependency + encrypted connection storage

- [x] `go get github.com/go-sql-driver/mysql && go mod tidy`.
- [x] `app.go` (or new `database.go`, same package): `DBConnection` (id, name, host, port, user, database — no password field on the struct that goes to JSON *output*), `DBConnectionInput` (adds plaintext `password`, used only as a method parameter, never marshaled to a response).
- [x] Encryption helpers: `dbKey() ([]byte, error)` — read `~/.bcode/db/key`, generate 32 random bytes and write with `0600` if absent; `encryptPassword`/`decryptPassword` using `crypto/aes` + `crypto/cipher` GCM mode, per ADR-0009.
- [x] `~/.bcode/db/connections.json`: array of stored-connection records (same fields as `DBConnection` plus an encrypted password blob field, e.g. `passwordEnc`). Follow the established `[]T{}`-not-nil JSON pattern from the earlier bug fix.
- [x] `ListDBConnections() []DBConnection` (strips password entirely from the response), `SaveDBConnection(DBConnectionInput) (string, error)` (encrypts, upserts by id, generates an id on create), `DeleteDBConnection(id string) error`.
- [x] `TestDBConnection(id string) error`: load stored connection, decrypt, `sql.Open` + `Ping()` with a short timeout (e.g. 5s via context), close immediately, return the raw driver error on failure (surfaced to the user, not swallowed).

### Phase 2: introspection + query execution

- [x] Internal helper `openConn(id string) (*sql.DB, DBConnection, error)`: loads + decrypts + opens, used by every method below; caller closes.
- [x] `ListDatabases(connectionID string) ([]string, error)`: if the stored connection has a database lock, return `[]string{lockedDB}` directly (tree-shape rule from ADR-0009/`database.md`) without hitting the network; otherwise `SHOW DATABASES`, filtering out `information_schema`/`performance_schema`/`mysql`/`sys` (standard system schemas a user browsing their own data doesn't want cluttering the tree — note this filtering choice in `database.md` when writing it up).
- [x] `ListTables(connectionID, database string) ([]string, error)`: `SHOW TABLES` against that database (`USE` or fully-qualified query — prefer a fully-qualified `information_schema.tables` query over `USE` to avoid connection-state issues if a `*sql.DB` pool reuses connections across calls).
- [x] `DescribeTable(connectionID, database, table string) ([]ColumnInfo, error)`: `information_schema.columns` (name, type, nullable, key) for the given table.
- [x] `RunQuery(connectionID, database, sqlText string) (QueryResult, error)`: open, select the database (fully-qualified or a per-connection `USE`), `Rows, err := db.QueryContext(ctx, sqlText)` with a reasonable timeout; on a non-SELECT statement `Query` may fail depending on driver behavior — detect and fall back to `ExecContext`, reporting `rowsAffected` instead of a result set when there are no columns to read. Convert driver values to JSON-safe types (`[]byte` → string, `time.Time` → RFC3339, `nil` → null) column by column using `rows.Columns()`/`rows.Scan` into `[]interface{}` scan targets.
- [x] Cap returned rows at a sane default (e.g. 5,000) with a `truncated: bool` flag in `QueryResult`, so a `SELECT *` on a huge table doesn't try to ship millions of rows to the frontend — record this as a documented v1 limit in `database.md`, not silently.

### Phase 3: saved-query persistence

- [x] `~/.bcode/queries/{id}.json`: `SavedQuery` (id, name, connectionID, database, sql, updatedAt).
- [x] `ListSavedQueries() []SavedQuery`, `SaveQueryTab(SavedQuery) error` (upsert by id, generate id on first save), `DeleteQueryTab(id string) error`.
- [x] `wails generate module` once phases 1–3's methods exist, before starting frontend phases.

### Phase 4: connections settings UI

- [x] A settings surface — reuse the app's existing modal/dialog convention if there is a clear one (check `ClaudeChatPanel.tsx`'s settings panel pattern, since it already has an inline "settings" form for the API key, for a matching look) rather than inventing a new dialog style. List existing connections (name, host — no password shown), add/edit form (name, host, port, user, password, optional database lock), delete with confirmation (reuse `.ft-confirm-*` inline-confirm pattern already used in `FileExplorer.tsx`), a "Test" button showing success/error inline.
- [x] Editing an existing connection leaves the password field blank (never round-tripped); leaving it blank on save keeps the existing encrypted password unchanged, entering a new one replaces it — make this behavior explicit in the UI copy so it isn't mistaken for "password cleared."

### Phase 5: sidebar tree

- [x] New `Panel` value (e.g. `'database'`), new `ActivityBar` icon (a database/cylinder icon from `lucide-react`, e.g. `Database`), new `Sidebar.tsx` branch rendering `components/DatabasePanel.tsx`.
- [x] Tree: connections as root nodes; each expands to databases (skipped, straight to tables, if locked) via `ListDatabases`; each database expands to tables via `ListTables`. Reuse `.file-tree-item`, `.file-tree-item-chevron`, `.file-tree-item-icon`, `.file-tree-item-name` classes from `components.css` — do not add a parallel tree stylesheet.
- [x] Lazy-load each level on expand (don't eagerly fetch every database's tables for every connection on mount), cache per-session in component state so re-expanding doesn't re-fetch.
- [x] Clicking a table opens a new query tab pre-filled with `SELECT * FROM <table> LIMIT 100` (a reasonable default, not required by the task but a natural "click to explore" affordance) bound to that connection/database. A header action ("New Query") opens a blank tab bound to the last-used or first available connection.

### Phase 6: query tab shell

- [x] `types.ts`: `EditorTab` gets `isQueryTab?: boolean`, `dbConnectionId?: string`, `dbDatabase?: string`, `savedQueryId?: string` (distinct from the tab's own `EditorTab.id`, since a saved query can be reopened into a fresh tab instance). Reuse `content` for the SQL text (per task's implementation note) and `name` for the display title.
- [x] `editorStore.openOrFocusTab`: new branch for `isQueryTab` — **not** singleton like `isGraphTab`/`isUsageTab`. If a `savedQueryId` is given and a tab with that `savedQueryId` is already open, focus it; otherwise always add a new tab (multiple query tabs coexist, per acceptance criteria).
- [x] `EditorPane.tsx`: render `<QueryTab tab={activeTab} />` when `activeTab.isQueryTab`, alongside the existing `isGraphTab`/`isUsageTab`/`isCommitTab` branches.
- [x] `EditorTabBar.tsx`: icon for `isQueryTab` (reuse the same `Database` icon as the sidebar), include it in the "no mode buttons" exclusion list alongside graph/usage/commit tabs, and in the tooltip-title exception list (show `tab.name`, not a `path`, since query tabs have no `path`).
- [x] `components/QueryTab.tsx` skeleton: a subheader row (connection selector, database selector — populated from `ListDBConnections`/`ListDatabases`, defaulting to the tab's stored `dbConnectionId`/`dbDatabase`) above a vertically split area (editor top, results bottom), resizable via a drag handle following the same pattern as `terminal-resize-h` (`components.css`) rather than a fixed split ratio.

### Phase 7: SQL editor + autocomplete

- [x] Reuse `MonacoEditor.tsx`'s underlying `@monaco-editor/react` `Editor` (or a thin dedicated wrapper if `MonacoEditor.tsx`'s props are too file-tab-specific) with `language="sql"` — already mapped in `EXT_LANG_MAP`.
- [x] `monaco.languages.registerCompletionItemProvider('sql', ...)`, registered once (module scope, not per tab instance, to avoid duplicate providers) but reading the *currently focused* query tab's connection/database from a ref/store at completion time, so suggestions match whichever tab the user is typing in.
- [x] Populate suggestions from `ListTables` (table names) and `DescribeTable` (column names) for the tab's selected database, re-fetched when the tab's connection or database selector changes; cache per connection+database pair for the session to avoid refetching on every keystroke.
- [x] A run action (button + a keyboard shortcut, e.g. Cmd/Ctrl+Enter, distinct from the file-save Cmd+S already bound in `EditorPane.tsx`) calls `RunQuery` with the editor's current full text (or the statement under the cursor if multiple statements are present — v1 can require one statement per run and say so in the UI, rather than building a SQL statement splitter).

### Phase 8: results grid, CSV, TSV

- [x] A simple results table component (reuse `.diff-viewer`/table styling conventions loosely, or a fresh minimal `.query-results` table — thin borders, sticky header row, matches the dark theme tokens already in `theme.css`).
- [x] Show `QueryResult.error` inline (not a crash) when the query fails; show `rowsAffected` for non-SELECT statements instead of an empty grid.
- [x] "Download CSV": build the CSV client-side from the held `QueryResult` (proper RFC 4180 quoting — wrap a cell in quotes and double any internal quote if it contains a comma, quote, or newline), trigger a browser download via a `Blob` + temporary `<a download>` (no new backend method, per `database.md`).
- [x] "Copy": build a tab-separated string (header + rows) and `navigator.clipboard.writeText` — plain text write, not the image-paste path that had permission trouble earlier this session; confirm during phase 10 that plain-text clipboard writes work fine in this WebKitGTK build (expected to, since it's the standard synchronous/simple Clipboard API write path, but verify rather than assume, given this session's history with clipboard surprises).

### Phase 9: rename + persistence wiring

- [x] Tab rename: mirror `Terminal.tsx`'s `renamingId`/`renameValue`/`commitRename` pattern, applied to query tabs in `EditorTabBar.tsx` (double-click the tab name) — updates `EditorTab.name` and, if the tab has a `savedQueryId`, persists the new name via `SaveQueryTab`.
- [x] Debounced autosave (~400ms, matching the existing debounce convention in `App.tsx`) of SQL text + connection + database + name to `SaveQueryTab`, creating a `savedQueryId` on first save if the tab doesn't have one yet.
- [x] A "Saved Queries" section (in the sidebar `DatabasePanel.tsx`, below the connection tree, or as part of it — implementer's call, note the choice) listing `ListSavedQueries`, opening a saved query re-focuses it if already open or opens a fresh tab bound to its `savedQueryId` otherwise (the non-singleton-but-dedupe-by-savedQueryId rule from phase 6).
- [x] Explicit delete of a saved query (`DeleteQueryTab`) removes it from that list permanently; closing the tab itself never deletes the saved copy (acceptance criterion 17).

### Phase 10: verify

- [x] `go build ./...`, `npm run build` (tsc) pass. Full `wails build` also passes.
- [x] Against a real MySQL 8.0.46 server (Docker container, `mysql:8.0` image): connection save/test/list databases/list tables/describe columns all verified via a Go test calling the bound methods directly. **Not verified**: expanding the tree by clicking in the actual running window.
- [x] `RunQuery` verified directly (not via GUI click): a `SELECT` against real data (including a comma-containing value, returned as a plain string), an `INSERT` (found and fixed a real RowsAffected bug — see `database.md`), and a query against a nonexistent table correctly surfacing an error instead of crashing. **Not verified**: opening a tab by clicking a table in the GUI, results rendering in the actual grid component.
- [ ] **Not verified** — requires typing in the running Monaco editor, which the assistant cannot do.
- [x] CSV quoting logic verified via a Node script running the exact frontend `toCSV` function against data shaped like the real MySQL row with a comma (`"Carol, Inc."`) and a value with an internal quote — correctly quoted/escaped per RFC 4180. **Not verified**: the actual file download and opening it in a spreadsheet app.
- [ ] TSV formatting logic verified the same way as CSV (Node script). **The actual clipboard write and paste were not verified** — this was explicitly flagged as a risk given this session's earlier image-clipboard permission trouble; plain-text `writeText` is a much simpler API and expected to work, but "expected" is not "verified." Recommend the user check this specifically.
- [ ] **Not verified** — GUI interaction. Saved-query persistence (save/list/delete round trip) was verified directly against the backend; the rename UI and the close-then-reopen flow were not.
- [ ] **Not verified** — GUI interaction.
- [ ] **Not verified** — GUI interaction. The lock-skip logic itself is a direct `if sc.Database != ""` check in `ListDatabases`, exercised by code review, not by clicking through the tree.
- [ ] **Not verified.** Expected behavior based on code review: the query tab would open fine (SQL text and name are independent of the connection existing), the connection dropdown would just not show the deleted connection, and running the query would fail with a "connection not found" error surfaced normally — not a crash. Not exercised end-to-end.

### Phase 11: docs and finish

- [x] `database.md`: drop every "Planned"/"not yet implemented" marker, record the system-schema filtering choice, the row cap, and the "one statement per run" v1 limit.
- [x] `project-dna.md` Technology Stack row, `architecture/overview.md` modules table, `areas/desktop-window.md` capabilities table — drop "(planned)" markers.
- [x] `docs/frontend.md`: add the query-tab pattern (multi-instance, non-singleton `openOrFocusTab` branch) alongside the existing usage-tab/graph-tab singleton note, so a future contributor sees both patterns side by side.
- [x] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| `RunQuery` on a non-SELECT statement behaves differently across driver versions (`Query` vs `Exec`) | Crash or silently wrong result for `INSERT`/`UPDATE`/DDL | Phase 2 explicitly branches on statement outcome, not statement text parsing |
| Very large result sets | Memory/UI freeze shipping millions of rows to the frontend | Phase 2's row cap + `truncated` flag, disclosed in `database.md`, not silently imposed |
| Multiple query tabs sharing one Monaco completion provider | Wrong tab's suggestions appear, or provider registered multiple times (duplicate suggestions) | Phase 7: register once at module scope, read focused-tab state at completion time |
| Clipboard TSV copy hits the same kind of permission wall as the earlier image-paste investigation | Feature silently fails | Explicitly verified in phase 10, not assumed from the CSV path's success |
| Password round-tripping to the frontend by accident on edit | Defeats the whole point of ADR-0009's encryption | Phase 1/4: `DBConnection` (list/edit-prefill shape) never carries a password field; edit form always starts blank |
| Deleting a connection with saved queries pointing at it | Confusing failure mode | Phase 10 explicitly tests and records the actual behavior rather than leaving it unverified |

## Definition of Done

Per `.specs/tasks/mysql-query-tabs.md`.
