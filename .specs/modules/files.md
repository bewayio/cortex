---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-27
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0002]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: files

## Purpose

Read, write and manage files and folders inside a workspace, and show them in the editor.

## Boundaries

- Owns: files on disk, editor tabs state (frontend)
- Does NOT own: workspace list, git state

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| GetFileTree | root | FileNode | Recursive tree |
| ReadFile / WriteFile | path, content | string / error | Content access |
| GetFileInfo | path | FileInfo | Size, mtime |
| CreateFile / CreateDirectory / RenameFile / DeleteFile | paths | error | Mutations |
| RevealInFinder | path | error | Runs `open -R`, macOS only (gap) |

## Events Published

None.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| git | public-service | diff views ask git for original content |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Full user filesystem access. DeleteFile is destructive and needs UI confirmation (needs verification).

## Notes

- Frontend: `FileExplorer`, `FileSearch`, `EditorPane`, `EditorTabBar`, `MonacoEditor`, `MarkdownPreview`, `editorStore`. Mermaid via `utils/diagrams.ts`.
- Gap: reveal-in-file-manager needs Linux (`xdg-open`) and Windows (`explorer /select`) branches.
- **Shipped 2026-09-27, user request**: drag-and-drop move in `FileExplorer.tsx` — dragging a file or folder row onto a directory row, or onto the tree's empty background (the workspace root, via a `min-height: 100%` on `.file-tree` so the empty space below the last row is actually reachable), moves it there. No new backend method: this is the existing `RenameFile(oldPath, newPath)` with a new destination path, same as the existing inline-rename path. A dedicated `isPathInsideOrEqual` helper (not the existing `ancestorPaths`, which serves a different purpose — auto-expanding ancestors of the active file, not descendant-checking against an arbitrary target) rejects dropping a folder into itself or one of its own children; dropping onto its current parent is a silent no-op. Row-level drop handlers call `stopPropagation()` so a drop on a nested directory row doesn't also trigger the root-level handler. Task: `.specs/tasks/db-tree-rename-and-dragdrop.md` (covers the file-tree side of this drag-and-drop work alongside the database-panel side).
- **Shipped 2026-09-27, user follow-up — Ctrl/Cmd+Shift+Tab losing focus after one press**: see `.specs/modules/shell.md`'s shortcuts entry and `.specs/tasks/tab-focus-and-persistence-fixes.md` for the fix (a tab switch could leave nothing focused in the DOM when the new tab isn't a Monaco instance).
- **Planned 2026-09-27, user follow-up — pinned tabs**: `editorStore.ts` gains a `pinned?: boolean` field on `EditorTab` and `pinTab`/`unpinTab` actions; `EditorTabBar.tsx` renders pinned tabs in a fixed-left group (plus a new, workspace-independent `globalTabs` for Home specifically, which is always pinned and never part of any per-workspace cache). Full design, including why Home needs to be pulled out of the existing per-workspace `switchWorkspace` cache instead of just adding `pinned: true` to it: `.specs/tasks/pinned-tabs.md`.
