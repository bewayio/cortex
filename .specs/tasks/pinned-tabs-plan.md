---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 2
connections:
  parent: .specs/tasks/pinned-tabs.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Home tab always pinned + general "pin tab" feature

## Linked Task

`.specs/tasks/pinned-tabs.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Sequential dependency chain (store shape change → tab-bar rendering → persistence) within `editorStore.ts`/`EditorTabBar.tsx`/`App.tsx`/`app.go`.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/shell.md`, `.specs/modules/workspace.md` read.
- Task already has detailed "Decisions Already Made" (2026-09-27) and "Implementation Notes" from its original spec — reused directly below instead of re-deriving.
- Root cause confirmed by reading `editorStore.ts`: `tabs` (including Home, `isUsageTab`) is swapped wholesale per workspace by `switchWorkspace`'s `_cache` — exactly why Home disappears on switch.
- No blocking tasks.

## Phases

### Phase 1 — Home becomes a global, workspace-independent tab (M)

- `editorStore.ts`: add `globalTabs: EditorTab[]` state, never touched by `switchWorkspace`'s cache-swap logic.
- `openOrFocusTab`'s `isUsageTab` branch operates on `globalTabs` instead of `tabs` (add/focus there).
- `getActiveTab`/`setActiveTab`/`cycleTab`/`closeTab` updated to check both `globalTabs` and the current workspace's `tabs` — the active tab can be in either.
- Dependency: none (first phase).

### Phase 2 — Render Home in a fixed-left area (S)

- `EditorTabBar.tsx`: render `globalTabs` (Home) in a non-scrolling fixed-left group, before the pinned/scrollable per-workspace tabs.
- Keep existing icon-only treatment and undraggable behavior for `isUsageTab` (already shipped 2026-09-27) — just source it from `globalTabs` now.
- Dependency: Phase 1.

### Phase 3 — Verify startup/workspace-switch behavior for Home (S)

- `App.tsx`'s "always open Home on launch" and any other code assuming Home lives in the per-workspace `tabs` array (e.g. `persistCurrentWs`'s tab-filtering logic) updated to account for `globalTabs`.
- Dependency: Phases 1–2.

### Phase 4 — Generalize pin (non-Home tabs) (M)

- `types.ts`: add `pinned?: boolean` to `EditorTab`.
- `editorStore.ts`: new `pinTab(id)`/`unpinTab(id)` actions (or one `setPinned(id, pinned)`), operating within the current workspace's `tabs` array (pinned tabs stay in `tabs`, not `globalTabs` — only Home is global; per-workspace pinned tabs still need to swap with their workspace).
- `EditorTabBar.tsx`: partition `tabs` into `tabs.filter(t => t.pinned)` (rendered after `globalTabs`, before the scrollable group) and the rest; add "Pin Tab"/"Unpin Tab" context-menu entries (commit/diff/graph tabs excluded if pinning doesn't make sense — implementer's call, note the choice made).
- Dependency: Phases 1–3 (reuses the fixed-left rendering area Home introduced).

### Phase 5 — Persist per-workspace pinned tabs (S)

- `app.go`: add `PinnedFiles []string` to `WorkspaceState`; `wails generate module` after.
- `App.tsx`'s `persistCurrentWs` collects `tabs.filter(t => t.pinned && t.path).map(t => t.path)` into the new field; the init/restore effect sets `pinned: state.pinnedFiles?.includes(filePath)` when building `tabsToLoad`.
- Dependency: Phase 4.

### Phase 6 — Constrain drag-reorder to stay within pinned/unpinned groups (S)

- `EditorTabBar.tsx`'s existing drag-to-reorder (`handleTabMouseDown`/`reorderTabs`): a dragged tab cannot cross from the pinned group into the scrollable group or vice versa without going through the explicit Pin/Unpin action — simplest is clamping the drop index to stay within the same group.
- Dependency: Phase 4.

### Phase 7 — Verification (S)

- `tsc --noEmit`, `vite build`, `go build ./...`.
- Manual GUI verification flagged as needed from the user (Home surviving a workspace switch, pin/unpin, drag-reorder within groups, pin state surviving a restart) — almost entirely interactive tab-bar behavior, no GUI-automation tool available here.
- Dependency: Phases 1–6.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Home becomes global (`globalTabs`) | M |
| 2. Render Home fixed-left | S |
| 3. Verify startup/switch behavior | S |
| 4. Generalize pin (non-Home) | M |
| 5. Persist per-workspace pinned tabs | S |
| 6. Constrain drag-reorder to groups | S |
| 7. Verification | S |

## Out of Scope

Unchanged from the linked task: pinning tabs in the terminal or database query-tab lists, a maximum pinned-tabs count.

## Status

All 7 phases implemented 2026-10-11. See `.specs/tasks/pinned-tabs.md` for verified vs. not-yet-verified acceptance criteria — automated checks (`tsc`, `vite build`, `go build`/`vet`/`fmt`, `wails build`) passed; interactive GUI verification in `wails dev` still needs the user.

## Next Step

Run `bsdd finish` once the user confirms the interactive behavior in `wails dev`.
