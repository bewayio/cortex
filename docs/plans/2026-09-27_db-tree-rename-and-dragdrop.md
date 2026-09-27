# Plan: Inline rename, drag-and-drop into folders, folder-row alignment fix

- Task: `.specs/tasks/db-tree-rename-and-dragdrop.md`
- Modules: `database.md`, `files.md`
- ADR: none
- Execution model: **single agent**, phases in sequence
- Status: in-progress (implementation done, phases 1-6 + 8 docs complete; phase 8's `bsdd finish` pending, phase 7 blocked on manual `wails dev` testing this assistant cannot perform)

## Goal

Rename connections, saved queries, and both folder kinds via context menu "Rename" + plain Enter on a focused row. Drag-and-drop connections/queries into folders in `DatabasePanel.tsx`, and files/folders into other folders in `FileExplorer.tsx`. Fix the folder-row icon/title vertical alignment bug from the user's screenshot.

## Definition of Ready

- [x] Spec, criteria and decisions are current (task's "Decisions Already Made")
- [x] Touches `database` (`DatabasePanel.tsx`, `database.go`), `files` (`FileExplorer.tsx`, no backend change — reuses `RenameFile`)
- [x] No ADR needed

## Phases

| # | Phase | Size | Depends on |
|---|-------|------|------------|
| 1 | Backend: folder rename methods | S | none |
| 2 | Folder-row alignment fix | S | none |
| 3 | DatabasePanel: rename infrastructure (state, inline input) | M | 1 |
| 4 | DatabasePanel: context menu "Rename" + plain-Enter wiring | M | 3 |
| 5 | DatabasePanel: drag-and-drop into folders | M | none |
| 6 | FileExplorer: drag-and-drop move | M | none |
| 7 | Verify | M | 1–6 |
| 8 | Docs and finish | S | 7 |

### Phase 1: backend folder rename methods

- [x] `database.go`: add `RenameDBConnectionFolder(oldName, newName string) error` — reassign `Folder` on every stored connection matching `oldName` to `newName` (same read/mutate/write pattern as `DeleteDBConnectionFolder`), then update `connection_folders.json` (`removeFolder` old + `addFolder` new, or a direct rename-in-place in the list preserving position — either is fine, no ordering guarantee exists today).
- [x] Add `RenameQueryFolder(oldName, newName string) error` — same shape using `ListSavedQueries`/`SaveQueryTab` (mirrors `DeleteQueryFolder`), then update `queries/folders.json`.
- [x] Both: no-op (or explicit error) if `newName` is empty or unchanged; if `newName` already exists as a different folder, merge into it (existing connections/queries pointing at `oldName` just get reassigned to the pre-existing `newName`, and `oldName` is removed from the folder list) rather than erroring — matches how folders are just names, not unique-checked entities elsewhere in this file.
- [x] `wails generate module`.
- [x] Small Go test (temp `HOME`, disposable, same pattern as prior sessions) covering: rename moves all members, rename into an existing folder name merges, renaming a folder with no members just updates the list.

### Phase 2: folder-row alignment fix

- [x] Inspect the rendered folder row (`db-folder-row` class, `DatabasePanel.tsx`) against a normal connection/table row to find the actual mismatch — likely something specific to that row (icon size, an extra wrapper, `font-weight: 500` affecting line box height) rather than the shared `.file-tree-item`/`.file-tree-item-icon` rules, since every other row using those same classes renders correctly per the screenshot.
- [x] Fix in CSS (`frontend/src/styles/components.css`, `.db-folder-row` / `.file-tree-item-icon` area) or in the folder row's JSX structure, whichever is the actual cause.
- [x] Cannot be visually confirmed by this assistant — flag explicitly for the user to check against the original screenshot in `wails dev`.

### Phase 3: rename infrastructure

- [x] `DatabasePanel.tsx`: add `renaming: { kind: 'connection' | 'query' | 'connection-folder' | 'query-folder'; id: string; value: string } | null` state (id = folder name for the two folder kinds) and a `renameInputRef`, mirroring `FileExplorer.tsx`'s `Renaming` pattern (inline `<input>` replacing `.file-tree-item-name`, autofocus + select on mount, Enter commits, Escape cancels, blur commits).
- [x] Extend the existing `focusedNode` (`connection`/`database`, added for Ctrl+Enter) into a broader focus concept that also covers query rows and both folder kinds, OR add a second lightweight `focusedRow` used only for rename — pick whichever is less disruptive to the existing Ctrl+Enter code path and its tests; note the choice made in the code comment. **Chosen: the separate `focusedRow` option** — `focusedNode` is untouched, zero risk to the existing Ctrl+Enter feature; `focusedRow` is set alongside it on every rename-able row's click handler.
- [x] Commit-rename functions: connection → spread the existing `DBConnection` from `connections` state, set `name`, call `SaveDBConnection`, reload. Query → spread the existing `SavedQuery`, set `name`, call `SaveQueryTab`, reload. Folder → call the new `RenameDBConnectionFolder`/`RenameQueryFolder` from phase 1, reload both the folder list and the connections/queries list (membership may have changed on merge).

### Phase 4: context menu + Enter wiring

- [x] Add a "Rename" entry to the existing context menu for connections and saved queries (alongside "Move to folder", "New Folder…", delete).
- [x] Add right-click support (a context menu) on folder rows themselves if they don't already have one — check current folder row markup; today folders only expose a trash-icon button, no right-click menu — with "Rename" and (if easy to keep consistent) "Delete" moved in from the button, or the button can stay and just gain a sibling context menu with "Rename" only, whichever is the smaller diff. **Implemented as a new `folderCtxMenu` state**, separate from the existing `ctxMenu` (which is item-specific and drives "Move to folder", not applicable to a folder itself) — right-click on a folder row now shows "Rename" + "Delete Folder"; the trash-icon button on the row still works too (unchanged).
- [x] Plain Enter (no modifier) on a focused connection, query, connection-folder, or query-folder row starts rename — added to the same keydown handler that already handles Ctrl/Cmd+Enter (`handleTreeKeyDown`), branching on whether a modifier is held so the two behaviors stay independent.

### Phase 5: DatabasePanel drag-and-drop

- [x] Add `draggable` to connection rows, query rows, and folder rows (both kinds); `onDragStart` sets `e.dataTransfer.setData('application/x-bcode-connection', id)` or `'application/x-bcode-query', id` as appropriate.
- [x] `onDragOver` on connection-folder rows and the Connections section container: `e.preventDefault()` only if `e.dataTransfer.types` includes the connection MIME type (reject query drags); same for query-folder rows / Saved Queries section with the query MIME type.
- [x] `onDrop` calls the existing `moveToFolder('connection'|'query', id, folderNameOrEmpty)` (already used by the context menu) — no new move logic, just a new trigger path.
- [x] Visual: a `.drag-over` class (border/background highlight) added on a valid `dragenter`/removed on `dragleave`/`drop`.

### Phase 6: FileExplorer drag-and-drop

- [x] `draggable` on every file-tree row; `onDragStart` sets `e.dataTransfer.setData('application/x-bcode-file', node.path)`.
- [x] `onDragOver`/`onDrop` on directory rows and the tree's empty background (root): compute `newPath = targetDir + '/' + basename(draggedPath)`, reject if `targetDir === parentOf(draggedPath)` (no-op, already there), reject if `targetDir` is `draggedPath` itself or one of its descendants (adapt `ancestorPaths`), otherwise call `RenameFile(draggedPath, newPath)` and refresh the tree the same way the existing rename-in-place does.
- [x] Same `.drag-over` highlight treatment as phase 5, reusing the class if the CSS is identical.

### Phase 7: verify

- [x] `go build ./...`, `npm run build` (tsc + vite) both pass clean.
- [x] Go test from phase 1 passed (rename-moves-members, merge-into-existing-folder, no-member rename), then deleted (disposable, per this project's established practice).
- [ ] `wails dev`, by hand: **not verified** — rename via context menu and via Enter for all four kinds, drag-and-drop in both trees (including cross-kind rejection and the self/descendant guard), and the folder-row alignment fix all require clicking through a running window, which this assistant cannot do. Everything is code-verified (compiles, type-checks) but not exercised live.
- [x] Recorded explicitly above which parts are code-verified only vs. actually clicked through (none of the latter yet), per this project's established honesty practice on GUI-only criteria.

### Phase 8: docs and finish

- [x] `database.md`, `files.md` updated from "Planned" to shipped shape, including the final choice on `focusedNode` vs `focusedRow` and the folder-rename merge behavior.
- [ ] `bsdd finish`. Ask before `bsdd sync`.

## Risks

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Broadening `focusedNode` breaks the existing Ctrl+Enter database-tree behavior from the previous task | Regression in a just-shipped feature | Keep Ctrl+Enter's own test/manual-check in phase 7; consider the separate `focusedRow` option if the union type gets awkward |
| HTML5 drag-and-drop's native drag image / ghost looks broken inside a Wails webview | Confusing UX even if the move itself works | Acceptable for v1 — a custom drag image is out of scope unless testing shows it's actually broken, not just plain-looking |
| Folder rename merging into an existing folder silently combines two groups the user meant to keep separate | Unexpected data grouping change | This is a deliberate, documented choice (folders are just names, not unique entities); acceptable, and reversible via "Move to folder" |
| Dragging a file onto its own parent directory (already where it is) triggers a no-op `RenameFile` that could still touch mtime or fail oddly | Minor, cosmetic | Explicit `targetDir === parentOf(draggedPath)` early-return before calling `RenameFile` |

## Definition of Done

Per `.specs/tasks/db-tree-rename-and-dragdrop.md`.
