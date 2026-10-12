---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-11
version: 5
connections:
  parent: .specs/project/project-dna.md
  children: []
  related_adrs: []
  sync_triggers:
    - Task scope changes
    - Acceptance criteria changes
    - Linked spec changes
---

# Task: Home tab always pinned first, plus a general "pin tab" feature

## Status

`in-progress` — all 7 implementation phases done (see `.specs/tasks/pinned-tabs-plan.md`); kept out of `done` only because interactive GUI verification in `wails dev` needs the user (no GUI-automation tool available here). Re-activated 2026-10-11 (user bug report: Home currently does disappear on workspace switch, exactly as predicted below; this was never implemented after being specified 2026-09-27).

## Goal

The Home tab should be a permanent, icon-only, fixed-first-position tab that survives switching workspaces and is only ever removed by the user explicitly closing it (reopened via the existing Home button in `ActivityBar.tsx`, still pinned first). Generalize this into a real feature: the user can pin any open tab so it sits fixed at the left of the tab bar, right after Home, instead of scrolling with the rest.

## Linked Knowledge

- Module specs: `.specs/modules/files.md` (`editorStore`, `EditorTabBar.tsx` — tab bar rendering, reordering, context menu), `.specs/modules/shell.md` (Home tab / `ActivityBar.tsx`'s Home button, "always open Home on launch" from the previous task), `.specs/modules/workspace.md` (per-workspace tab caching in `switchWorkspace`, `WorkspaceState` persistence)
- Related tasks: `.specs/tasks/quick-navigation-and-shortcuts.md` (made Home a singleton editor tab, always-open-on-launch), `.specs/tasks/tab-focus-and-persistence-fixes.md` (sibling bug-fix task from the same request, touches the same `openFiles`/`WorkspaceState` save path this task's pin-state persistence also needs)
- ADRs: none new

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (`files` frontend — `editorStore.ts`, `EditorTabBar.tsx`; `workspace` for pin-state persistence; `shell` for the Home button)
- [x] Related ADRs reviewed (none apply)
- [x] Security implications identified (none)

## Decisions Already Made (2026-09-27, with the user)

1. **Home is always pinned, never unpinnable** — no "Unpin" option for it specifically. It can only be closed (removing it entirely until reopened via the Home button) or left open (pinned, first position).
2. **Pin state on other tabs persists per workspace** — saved alongside `openFiles`/`activeFile` in `WorkspaceState`, restored on reopening that workspace. Session-only pinning was explicitly rejected.

## Acceptance Criteria

1. [x] ~~The Home tab renders icon-only (no text label) in the tab bar~~ — **shipped early, 2026-09-27** (`EditorTabBar.tsx`, scoped to `isUsageTab`), ahead of the rest of this task. Now also always the first position, in a visually distinct fixed-left area (`.tab-bar-pinned`) that does not scroll with the rest of the tabs.
2. [x] Opening a file (or any other tab) while Home is open never removes or replaces Home — it stays exactly where it is, just no longer the active tab. (Home lives in `editorStore`'s new `globalTabs`, untouched by any tab-opening logic that only ever touches `tabs`.)
3. [x] Switching to a different workspace does not remove Home from view — fixed: Home moved out of the per-workspace `tabs` array (swapped by `switchWorkspace`'s cache) into a separate `globalTabs` state that `switchWorkspace` never touches.
4. [x] Home can be closed like any tab (context-menu "Close" — no close button, consistent with its icon-only treatment), and reappears pinned-first when the user clicks the Home button again (`openOrFocusTab`'s `isUsageTab` branch re-adds it to `globalTabs`).
5. [x] Right-clicking a non-Home, non-commit/graph tab shows "Pin Tab" (commit/diff/graph tabs excluded — implementer's call: pinning a commit diff view doesn't carry meaning). Choosing it moves the tab into the fixed-left area, after Home.
6. [x] A pinned tab's context menu shows "Unpin Tab" instead, moving it back to the end of the normal scrollable area.
7. [x] Pinned tabs (excluding Home) are remembered per workspace via a new `WorkspaceState.PinnedFiles` field, restored on reopening that workspace or relaunching the app.
8. [x] Pinned tabs can still be closed normally — `closeTab` wasn't changed for this, pinned tabs are closed exactly like any other.

**Verified:** `tsc --noEmit`, `vite build`, `go build ./...`, `go vet ./...`, `gofmt`, `wails build` all clean.
**Not verified by the assistant** (no GUI-automation tool available — needs the user's own pass in `wails dev`): actually dragging/pinning/unpinning in the real UI, Home surviving a real workspace switch, pin state surviving an app restart.

## Implementation Notes

- **Home as a global, workspace-independent tab**: today `isUsageTab` lives inside `editorStore`'s per-workspace `tabs` array, cached and swapped by `switchWorkspace` per `activeWsId` (see `_cache: Record<string, WsSnapshot>`). To satisfy criterion 3, Home needs to stop being workspace-scoped. The cleanest approach (recommended, but implementer's call if a better one emerges during implementation): add a new, separate piece of state in `editorStore` — e.g. `globalTabs: EditorTab[]` — that is never touched by `switchWorkspace`'s cache swap, holding Home (and, per criterion 7's design, *not* the per-workspace pinned tabs — those still need to swap with their workspace). `EditorTabBar.tsx` renders `globalTabs` concatenated before the current workspace's pinned tabs, before its scrollable tabs. `getActiveTab()`/`setActiveTab()` need to check both `globalTabs` and `tabs` since the active tab can be either.
- **Generalizing pin (non-Home)**: add a `pinned?: boolean` field to `EditorTab` (`types.ts`). `EditorTabBar.tsx` partitions the current workspace's `tabs` into `tabs.filter(t => t.pinned)` (rendered in the fixed-left area, after `globalTabs`) and `tabs.filter(t => !t.pinned)` (the existing scrollable/reorderable area) — pinned tabs stay in the *same* `tabs` array (so `switchWorkspace`'s existing per-workspace caching keeps working for them unmodified, satisfying criterion 7 for free once `pinned` is part of the persisted `EditorTab` shape), just rendered in a different visual group. New `pinTab(id)`/`unpinTab(id)` actions in `editorStore.ts` (or one `setPinned(id, pinned: boolean)`).
- **Persistence**: `WorkspaceState` (`app.go`) needs a new field for which paths are pinned (e.g. `pinnedFiles: []string`, mirroring `openFiles`'s shape) — `persistCurrentWs` in `App.tsx` (touched by the sibling task `.specs/tasks/tab-focus-and-persistence-fixes.md` for the `OnBeforeClose` fix — coordinate so both changes land cleanly in the same function) collects `tabs.filter(t => t.pinned && t.path).map(t => t.path)`, and the restore path in `App.tsx`'s init effect sets `pinned: state.pinnedFiles?.includes(filePath)` when building `tabsToLoad`. `wails generate module` after the `WorkspaceState` struct change.
- **Reordering**: the existing drag-to-reorder (`reorderTabs`) should keep working within each group (don't let a drag move a normal tab into the pinned group or vice versa without going through the explicit Pin/Unpin action — simplest is to just constrain `reorderTabs`'s drop index to stay within the same group, or disable cross-group drag entirely for v1 and note it as a follow-up if it turns out to be needed).
- **Home-specific rendering**: `EditorTabBar.tsx`'s existing icon-selection logic (`if (tab.isUsageTab) return <Home .../>`) already exists — the icon-only-no-label treatment is new and should be scoped to `isUsageTab` specifically (not applied to other pinned tabs, which keep their normal name + icon), per the user's request.
- Out of scope: pinning tabs in the terminal or database query-tab lists (those aren't part of the main editor tab bar); a maximum pinned-tabs count (no limit requested).

- Plan: `docs/plans/2026-09-27_pinned-tabs.md` (depends on `docs/plans/2026-09-27_tab-focus-and-persistence-fixes.md` landing first). Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria 1–8 verified by hand in `wails dev` — this is almost entirely interactive tab-bar behavior (pin/unpin, drag reordering within groups, Home surviving a workspace switch, pin state surviving a restart) that cannot be verified by this assistant; be explicit about what was and wasn't clicked through.
- [x] `shell.md`, `workspace.md` updated from "Planned" to the shipped shape (`files` module doesn't have its own spec file in this project — tab-bar behavior lives under `shell.md`).
- [ ] Sync Review completed if source docs changed.
