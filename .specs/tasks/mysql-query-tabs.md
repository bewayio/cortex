---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-26
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: [0009]
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: MySQL client — connections, tree, query tabs

## Status

done (2026-09-26), with GUI click-through not performed by the assistant — see the honest verification breakdown below.

## Goal

Configure MySQL connections (global, encrypted password); browse them as a Connection → Database → Tables tree in the sidebar (Connection → Tables when the connection is locked to one database); open SQL query tabs with a split editor/results view, CSV download, copy-as-TSV, Monaco autocomplete, save/rename/reopen.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Module spec: `.specs/modules/database.md` (new)
- ADR: `.specs/adrs/0009-mysql-client.md`
- Related patterns: `.specs/modules/terminal.md` (tab persistence precedent), `.specs/modules/workspace.md` (existing `~/.bcode` JSON conventions)

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries are known (new `database` module; sidebar/editor-tab touch `shell`)
- [x] Related ADRs reviewed (ADR-0009, decisions confirmed with the user 2026-09-26)
- [x] Security implications identified (encrypted-at-rest password, stated limits; no SQL statement restrictions — see `database.md` Security)

## Decisions Already Made (2026-09-26, with the user)

1. **Connections are global**, not per-workspace.
2. **Password encrypted at rest** in `~/.bcode/db/connections.json`, AES-256-GCM, key in `~/.bcode/db/key` (`0600`). Not a defense against another process running as the same OS user — documented limit, not a gap to silently fix later without a new ADR.
3. **MySQL only for now.** Other engines are a future ADR, not built speculatively.
4. **No statement restrictions** on `RunQuery` — the user's own database.

## Acceptance Criteria

### Connections

1. A settings surface (dialog or panel — implementer's choice, follow the app's existing dialog/panel conventions) lets the user add, edit, delete, and test a MySQL connection: name, host, port, user, password, and an optional "lock to database" field.
2. Saved connections list on next launch (`ListDBConnections`), password never sent to the frontend after save.
3. Deleting a connection removes it from the list and does not affect other connections' saved queries that reference a *different* connection.

### Sidebar tree

4. New sidebar entry (new `ActivityBar` icon + `Panel` value, e.g. `'database'`), showing all configured connections as a tree.
5. A connection with no database lock expands to its databases (`ListDatabases`), each expands to its tables (`ListTables`).
6. A connection locked to one database skips the database level: Connection → Tables directly.
7. Tree visuals reuse the existing file-tree pattern (chevrons, indent, row height) rather than a new tree component from scratch.

### Query tabs

8. Clicking a table (or a "New Query" action) opens a query tab in the main editor area, alongside file tabs — same tab bar, closable, reorderable, like existing tabs.
9. The tab is split into a SQL editor (Monaco, SQL syntax) on top and a results area below.
10. Running the query (a run button and/or a keyboard shortcut) executes the SQL against the tab's selected connection + database and shows columns/rows in the results area, or the error message if the query fails.
11. A subheader in the tab lets the user change which connection and which database this tab targets, independent of how the tab was opened.
12. Monaco autocomplete in the SQL editor suggests table and column names from the tab's currently selected database (via `DescribeTable`/`ListTables`), not only generic SQL keywords.
13. "Download CSV" produces a valid CSV of the current result set (proper quoting for commas/quotes/newlines in cell values).
14. "Copy" places the current result set on the clipboard as tab-separated values (header row included), pasteable into a spreadsheet.
15. The tab can be renamed (double-click or a rename action, matching the existing terminal-tab rename pattern) so the user can tell tabs apart.
16. The tab's SQL text, name, connection id and database persist (`SaveQueryTab`) so that closing it and reopening it (from a "saved queries" list, analogous to the recent-workspaces list) restores everything exactly, not just a blank editor.
17. Closing a query tab does not delete its saved copy — only an explicit delete removes it from `~/.bcode/queries/`.

## Implementation Notes

- **Backend** (`app.go` or a new `database.go`, same package): types `DBConnection`, `DBConnectionInput`, `QueryResult`, `SavedQuery`, `ColumnInfo`; methods per `.specs/modules/database.md`. Use `database/sql` + `github.com/go-sql-driver/mysql`; `go get` it and run `go mod tidy`. Encrypt/decrypt helpers live next to the connection-storage code, not scattered.
- **Frontend — sidebar**: new `components/DatabasePanel.tsx` (or similar), new `Panel` value, reuse `.file-tree-item`/`.file-tree-item-chevron` classes from `components.css` rather than writing new tree CSS. Lazy-load databases/tables per node expand, same UX as `FileExplorer`.
- **Frontend — query tab**: new `EditorTab.isQueryTab?: boolean` plus fields for `dbConnectionId`, `dbDatabase`, and the SQL text (reuse `content`, same field file tabs use, to avoid a parallel content-storage path). `EditorPane` renders a new `QueryTab.tsx` when `activeTab.isQueryTab`, following the `isGraphTab`/`isUsageTab` singleton-vs-multi-instance pattern — query tabs are **not** singleton (the user can have several open at once, unlike the usage tab), so `openOrFocusTab` needs a new branch that always creates a new tab (or focuses one already open for the same saved-query id, if reopening from the saved list).
- **Split view**: vertical split (editor top, results bottom) inside the tab, resizable like the existing terminal dock resize handle (`terminal-resize-h` pattern) rather than a fixed ratio.
- **Autocomplete**: Monaco's `languages.registerCompletionItemProvider('sql', ...)`, scoped to query-tab editor instances only (do not affect the file-editing Monaco instances). Refresh the suggestion list when the tab's connection/database changes.
- **CSV/TSV**: pure frontend, from the `QueryResult` already held in the tab's state — no new backend method needed for either (per `database.md` Notes).
- **Persistence timing**: autosave the SQL text on change (debounced, same spirit as the existing 400ms debounce pattern used for sidebar width/terminal height in `App.tsx`) rather than only on tab close, so a crash doesn't lose work.
- **Rename**: mirror `Terminal.tsx`'s existing tab-rename implementation (`renamingId`/`renameValue`/`commitRename`) rather than inventing a new pattern.
- Do not touch `frontend/wailsjs` by hand; `wails generate module` after backend methods exist.
- Out of scope for this task: non-MySQL engines, streaming very large result sets, a full schema/ER diagram view, transactions/multi-statement scripts as a single run.

## Follow-up (2026-09-26, same day, user feedback after first delivery)

1. **Select colors**: the connection/database `<select>` dropdowns looked bad against the dark theme (flat, no visible border, native arrow). Restyled with `appearance: none`, a custom SVG chevron, visible border, hover/focus states in the accent color.
2. **Split sidebar into two sections**: Connections and Saved Queries were one flat list; now two independently collapsible sections (same pattern as `GitPanel.tsx`), each with its own header actions.
3. **Grouping folders**: added for both connections and saved queries. `Folder` field on `DBConnection`/`SavedQuery`; a separate persisted folder-name list per kind (`connection_folders.json`, `queries/folders.json`) so an empty folder still exists; right-click an item to move it to a folder or create a new one; deleting a folder ungroups its contents rather than deleting them. Verified against real data via a Go test (create, idempotent re-create, move, delete-ungroups) for both kinds.

- Plan: `docs/plans/2026-09-26_mysql-query-tabs.md`. Next command: `bsdd start`.

## Follow-up 2 (2026-09-26, same day, second round of user feedback)

1. **Bug: queries were saved without being asked.** The original `QueryTab.tsx` had a 400ms-debounced effect that called `SaveQueryTab` on every keystroke (content, connection, database or name change), creating a brand new `~/.bcode/queries/{id}.json` file for every edit to an unsaved tab — the sidebar's "Saved Queries" list filled up with entries the user never asked to save. **Fixed**: removed the automatic effect entirely. Saving is now only an explicit user action — the "Save" button in the subheader, or Cmd/Ctrl+S while the SQL editor is focused. A tab's modified indicator (`EditorTab.isModified`, the same dot already used for file tabs) shows whether there are unsaved changes; saving calls `markTabSaved` to clear it. `DatabasePanel.tsx`'s saved-queries list refreshes via a small `window` custom event (`bcode:saved-queries-changed`) dispatched on save, since the sidebar and the tab are separate components with no shared store for this.
2. **Second bug found while fixing the above**: `SaveQueryTab` returned only `error`, never the id it generates for a brand-new query — the frontend had no way to learn that id to update the same entry on a later save (would have kept minting a new file every save, not just every keystroke). Fixed: `SaveQueryTab` now returns `(string, error)`, same shape as `SaveDBConnection`. `DeleteQueryFolder` and `MoveQueryToFolder` (which also call it internally) updated for the new signature.
3. **Cross-platform run shortcut**: Cmd+Enter (macOS) / Ctrl+Enter (Linux, Windows) runs the query. Implemented via Monaco's own `editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, ...)` — `KeyMod.CtrlCmd` is Monaco's own cross-platform convention (Cmd on macOS, Ctrl elsewhere), and registering directly on the editor instance is the reliable way to catch the key: a plain DOM `keydown` listener on an ancestor element does not reliably see it, since Monaco's own textarea intercepts/consumes many key combinations before they would bubble up. Cmd/Ctrl+S (save) uses the same mechanism.
4. **Run only the statement under the cursor, or the selection.** New `frontend/src/utils/sqlStatements.ts`: splits SQL text on top-level `;` (no real parser — same documented limitation as the rest of the v1 SQL handling) and finds which statement's range contains a given cursor offset, falling back to the nearest one if the cursor sits in whitespace between two statements. Behavior: a non-empty editor selection runs exactly what's selected, split into statements only to run them sequentially if it contains more than one (this is the *only* way two statements run together — an unselected Cmd/Ctrl+Enter always runs exactly one); with no selection, the statement containing the cursor runs (or the closest one). Verified with a Node script covering: cursor mid-statement, cursor in a blank line between two statements (falls to the nearest), cursor at the very start, a selection covering exactly one statement, and a selection covering two statements joined by `;`.

## Follow-up 3 (2026-09-26, same day, third round of user feedback)

**"quando for executar uma query e não estiver conectado, faça a conexão antes"**: the Run button was `disabled` whenever the subheader's connection/database dropdowns were empty, and Cmd/Ctrl+Enter silently did nothing in that state — no error, no feedback, just nothing happening. Fixed with `ensureConnected()` in `QueryTab.tsx`, called before every run: if no connection is selected and exactly one is configured, it's used automatically; if no database is selected and the connection isn't locked to one, `ListDatabases` is checked and the single result (if there's exactly one) is used automatically. When it genuinely can't be guessed (more than one connection or database exist, or none are configured at all), running now shows a clear message in the results pane explaining what to pick, instead of the button being disabled or the shortcut doing nothing. The Run button is enabled unconditionally now (only `running` disables it).

The `Error 1146 (42S02): Table 'bsite.users' doesn't exist` the user pasted alongside this request is a real MySQL error — that table genuinely does not exist in that schema — not a BCode bug; nothing in this fix changes or could change that outcome. Flagged explicitly so the auto-connect fix isn't mistaken for having also "fixed" a data problem it has no bearing on.

## Definition Of Done

- [x] Backend acceptance criteria (1–3, 5–6, 10, 13–14 formatting, 16–17 persistence) verified against a real MySQL 8.0.46 server (Docker container) via a Go test exercising every bound method directly: connection save/edit/delete, password encryption (0600 key file, no plaintext leak), TestDBConnection, ListDatabases (system-schema filtering), ListTables, DescribeTable, SELECT with a comma-containing value, INSERT with correct RowsAffected (after fixing a real bug — see database.md), a deliberately-bad query's error surfacing, saved-query CRUD. CSV/TSV formatting (13–14) also verified directly via a Node script against the exact frontend functions, including RFC 4180 quoting on real MySQL data.
- [ ] GUI-only acceptance criteria (4, 7–9, 11–12, 15) — new sidebar icon/tree rendering, split-view drag handle, autocomplete suggestions appearing in Monaco, tab rename UI, opening a tab by clicking a table — **not verified**, the assistant cannot click through the running Wails window. `go build`, `npm run build` (tsc, no errors) and a full `wails build` all pass, which confirms the code compiles and type-checks, not that the interactions behave correctly. Recommend the user verify these in `wails dev` before treating the task as fully done.
- [x] `database.md` updated from "Planned" to the shipped shape, including the RunQuery bug and its fix
- [x] `project-dna.md` Technology Stack updated (Database row, and the Go 1.22→1.24 bump that `go-sql-driver/mysql` pulled in via `go mod tidy`, not anticipated in planning)
- [x] `architecture/overview.md` modules table gets the `database` row
- [x] `areas/desktop-window.md` capabilities table gets the new capability
- [ ] Sync Review completed if source docs changed (pending `bsdd sync`)
