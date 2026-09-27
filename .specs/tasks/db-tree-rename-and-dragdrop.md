---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: []
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Inline rename, drag-and-drop into folders, and a folder-row alignment fix

## Status

implemented, pending manual verification — all 10 acceptance criteria coded and building clean (`go build ./...`, `npm run build`); interactive `wails dev` walkthrough not yet done (assistant cannot click through a running window)

## Goal

In `DatabasePanel.tsx`: rename connections, saved queries, and both kinds of folder via the right-click context menu or the Enter key, and drag connections/queries into folders instead of only using the "Move to folder" menu. In `FileExplorer.tsx`: drag files/folders into other folders to move them. Also fix a real visual bug — the folder icon and folder title are not vertically aligned in the current build (user-supplied screenshot).

## Linked Knowledge

- Module specs: `.specs/modules/database.md` (rename + drag-and-drop + alignment fix), `.specs/modules/files.md` (drag-and-drop move)
- Related tasks: `.specs/tasks/mysql-query-tabs.md` (original `DatabasePanel.tsx`, folders, context menu), `.specs/tasks/quick-navigation-and-shortcuts.md` (added `focusedNode` click-to-focus and Ctrl+Enter on the database tree — the plain-Enter rename in this task extends the same focus concept)
- ADRs: none new

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (`database` and `files` frontend, no backend interface changes)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (none — same local data, no new persistence format)

## Decisions Already Made (2026-09-27, with the user)

1. **Rename scope is symmetric**: connections, saved queries, connection folders, and query folders all get the same two rename entry points (context menu "Rename", plain Enter on a focused row) — not connections only, per the user's explicit follow-up answer.
2. Connection rename via this path is **name-only** — a lighter/faster path than the existing pencil-icon full edit form (host/user/password/etc.), which is unchanged and still the way to edit connection details.
3. Drag-and-drop is **additive**, not a replacement for the existing right-click "Move to folder" menu — both remain available.
4. Drag-and-drop is **kind-scoped**: a connection can only drop on a connection folder or the Connections section (to ungroup); a saved query only on a query folder or the Saved Queries section; a file/folder in the explorer only on a directory or the tree's empty background (workspace root). No cross-kind drops anywhere.

## Acceptance Criteria

### Rename

1. Right-clicking a connection, saved query, connection folder, or query folder shows a "Rename" entry in the context menu (in addition to the existing "Move to folder" / "New Folder" / delete entries already there for connections and queries).
2. With a connection, saved query, or folder row focused (clicked, matching the existing `focusedNode` click-to-focus behavior from the quick-navigation task, extended to folders and to query rows), pressing plain **Enter** (no modifier — distinct from the existing Ctrl/Cmd+Enter behavior, which must keep working unchanged) starts the same inline rename.
3. Renaming shows an inline text input in place of the label (same visual pattern as `FileExplorer.tsx`'s F2/Enter rename), pre-filled with the current name; Enter commits, Escape cancels, blur commits.
4. Renaming a connection updates only its `name` field (`SaveDBConnection` with the rest of the existing connection data unchanged). Renaming a saved query updates its `name` field (`SaveQueryTab`). Renaming a folder updates the folder's name across every connection/query currently assigned to it (no orphaned references to the old folder name).

### Drag-and-drop

5. In `DatabasePanel.tsx`, dragging a connection row onto a connection-folder row moves it into that folder (`MoveDBConnectionToFolder`); dragging it onto the "CONNECTIONS" section (outside any folder) clears its folder. Same for saved queries against query folders / the "SAVED QUERIES" section, using `MoveQueryToFolder`.
6. Cross-kind drops are rejected (a connection dragged onto a query folder, or vice versa, does nothing) — no error dialog needed, just no-op.
7. In `FileExplorer.tsx`, dragging a file or folder row onto a directory row moves it there (`RenameFile(oldPath, newDirPath + '/' + basename)`); dragging onto the tree's empty background moves it to the workspace root. A directory cannot be dropped into itself or one of its own descendants (validated client-side before calling `RenameFile`, using the existing `ancestorPaths` helper).
8. Existing click-to-expand/collapse, click-to-focus, and context-menu behavior in both trees is unaffected by adding `draggable` — drag only engages on an actual drag gesture, not a plain click.
9. A dragged-over valid drop target shows a visible highlight (border or background change) so the drop zone is discoverable; dragging over an invalid target (wrong kind, or a file's own descendant) shows no highlight / a "not-allowed" cursor.

### Visual fix

10. In `DatabasePanel.tsx`'s folder rows (both connection and query folders), the folder icon and the folder title are vertically centered on the same line — matching every other row in the tree (connection rows, table rows, saved-query rows already look correct per the screenshot; only the folder row is off).

## Implementation Notes

- **Rename infrastructure**: `DatabasePanel.tsx` needs a `renaming: { kind: 'connection' | 'query' | 'connection-folder' | 'query-folder'; id: string; value: string } | null` state (id is the folder name for the two folder kinds, since folders have no separate id), mirroring `FileExplorer.tsx`'s `Renaming` interface. The existing `focusedNode` state (added in the quick-navigation task, currently `{kind:'connection'|'database', connectionId, database?}`) covers connection/database focus for Ctrl+Enter — for plain-Enter rename, a focus concept is also needed for folders and for saved-query rows, which `focusedNode` doesn't cover today; either broaden `focusedNode` to a shared discriminated union covering all rename-able row kinds, or add a second, simpler `focusedRow` used only for rename. Whichever is less disruptive to the existing Ctrl+Enter code is fine — implementer's call, note which was chosen.
- **Rename commit**: connection → `SaveDBConnection` with the existing connection's other fields spread in, only `name` changed (needs the full `DBConnection`, not just id+name — read it from the current `connections` state before calling). Query → `SaveQueryTab` with the existing `SavedQuery` spread, only `name` changed. Folder → new frontend-only logic, since there's no backend "rename folder" method: call `MoveDBConnectionToFolder`/`MoveQueryToFolder` for every item currently in the old folder name to the new one, then `DeleteDBConnectionFolder`/`DeleteQueryFolder` (old name) and `CreateDBConnectionFolder`/`CreateQueryFolder` (new name) to keep the empty-folder-persists behavior consistent — or add a proper `RenameDBConnectionFolder`/`RenameQueryFolder` backend method if the multi-call frontend approach proves flaky in testing (implementer's call; a real backend rename is cleaner and avoids a partial-failure window between the move calls and the folder-list update, so it's the better default unless there's a reason not to touch `app.go`).
- **Drag-and-drop mechanics**: plain HTML5 drag-and-drop (`draggable`, `onDragStart` storing `{kind, id}` via `e.dataTransfer.setData` with a custom MIME type per kind, e.g. `application/x-bcode-connection`, `application/x-bcode-query`, `application/x-bcode-file`), `onDragOver` with `e.preventDefault()` only on a matching-kind target (checking `e.dataTransfer.types`), `onDrop` reading the data and calling the same move function the context menu's "Move to folder" already uses. No new library needed.
- **File explorer move validation**: before calling `RenameFile`, check the dragged path is not equal to and not an ancestor of the target directory (reuse/adapt `ancestorPaths`). After a successful move, refresh the tree the same way other file mutations already do (`GetFileTree` re-fetch or existing local tree update logic — check which `CreateFile`/`DeleteFile` already use and match it).
- **Folder alignment fix**: inspect `db-folder-row` / `.file-tree-item-icon` in `frontend/src/styles/components.css` (around line 2298) and the folder row JSX in `DatabasePanel.tsx` — likely a flex/line-height mismatch specific to that row (every other row using `.file-tree-item-icon` renders correctly per the screenshot). Fix in CSS if it's a shared-class issue, or in the folder row's JSX if it's a structural difference from the other rows; verify visually against the screenshot pattern (folder icon and "LOCAL"-style title on the same baseline) — this assistant cannot screenshot the running app itself, so note this as visually unverified until the user confirms in `wails dev`.
- Do not touch `frontend/wailsjs` unless a new backend method (e.g. a folder-rename method) is added, in which case `wails generate module` after.
- Out of scope: reordering items *within* the same folder (drag-and-drop here is about moving between folders/root, not manual sort order); renaming a saved query's *tab* (already exists via double-click on the open tab, per `database.md`) is unaffected — this task adds a second entry point (sidebar list item), not a replacement.

- Plan: `docs/plans/2026-09-27_db-tree-rename-and-dragdrop.md`. Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria 1–10 verified by hand in `wails dev` (context-menu rename, Enter-to-rename, drag-and-drop in both trees including the kind-scoping and self/descendant guard, the folder alignment fix against the original screenshot) — **not done**: implemented and passing `go build ./...` / `npm run build`, plus a disposable Go test for the folder-rename backend methods, but this assistant cannot click through a running window. All 10 criteria are code-complete but not exercised live.
- [x] `database.md` and `files.md` updated from "Planned" to the shipped shape.
- [ ] Sync Review completed if source docs changed — pending `bsdd sync`, to be run only with user confirmation.
