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

# Task: Fix Ctrl+Shift+Tab losing focus after one use, and open files not surviving an app restart

## Status

implemented, pending manual verification — both fixes coded and building clean (`go build ./...`, `npm run build`); interactive `wails dev` verification (keyboard-only tab cycling, a real close-and-relaunch) not yet done (assistant cannot click through a running window)

## Goal

Two bugs reported together, both about editor-tab state not being reliable: (1) Ctrl/Cmd+Shift+Tab (and likely the forward direction too) only works once — a second press does nothing until the user clicks inside an open file — and (2) files left open when the app is closed are not there anymore on the next launch.

## Linked Knowledge

- Module specs: `.specs/modules/shell.md` (tab-cycling shortcut, just shipped in the previous task), `.specs/modules/workspace.md` (`SaveWorkspaceState`/`LoadWorkspaceState`, `openFiles` persistence)
- Related tasks: `.specs/tasks/quick-navigation-and-shortcuts.md` (introduced Ctrl/Cmd+Tab cycling and the global Monaco keybinding rule fix for it), `.specs/tasks/db-tree-rename-and-dragdrop.md` (most recent DatabasePanel/FileExplorer work, unrelated but touched the same session)
- ADRs: none new — this doesn't change `main.go`'s window/lifecycle architecture in a way ADR-0001/0007 already cover, it fills a gap they left (no `OnBeforeClose` hook existed)

## Definition Of Ready

- [x] Specification exists and is current
- [x] Acceptance criteria are clear
- [x] Module boundaries known (`shell` frontend keyboard handling, `workspace` backend lifecycle + frontend save timing)
- [x] Related ADRs reviewed (none block this)
- [x] Security implications identified (none — same local-only persistence, no new data)

## Root Cause Analysis (from reading the code, not yet confirmed by running the app)

### Bug A — Ctrl/Cmd+Shift+Tab stops working after one press

The previous task fixed Ctrl/Cmd+Shift+Tab not firing at all by adding a **global Monaco keybinding rule** (`frontend/src/utils/globalEditorShortcuts.ts`) that intercepts the key before Monaco's own indent/outdent binding swallows it, calling `cycleTab` directly on the store. That fix works for the *first* press because a Monaco editor is focused at that moment. But `cycleTab` then changes `activeTabId`, which unmounts the old `MonacoEditor` instance and mounts a new one for whatever tab is now active — and if that new tab isn't a code file (Home, a query tab, the git graph tab — none of which render `MonacoEditor`), **nothing in the DOM ends up with focus**. The most likely explanation for "only a click fixes it" is that this Linux/GTK-hosted webview (per this project's existing "Verified on Linux only" notes) stops delivering keydown events to the web content once no element holds DOM focus — a known class of issue for WebKitGTK-hosted webviews, where keyboard focus can fall back to the native window chrome instead of the page. A click anywhere in the page forces focus back into the DOM, which is exactly the reported workaround.

This is a hypothesis from reading the code and this project's own prior notes about GTK-specific quirks (see `.specs/modules/shell.md`'s unified-window-chrome entry) — **not confirmed by running the app**, since this assistant cannot click through a window. The fix in the Implementation Notes below is written to be correct regardless of the exact underlying cause (it guarantees *something* always holds focus after any tab switch), so it should resolve the symptom even if the precise GTK explanation isn't 100% it.

### Bug B — open files don't survive an app restart

`SaveWorkspaceState` is only ever triggered by a `beforeunload` window event handler in `App.tsx`, which calls the async `persistCurrentWs` **without awaiting it** (a `beforeunload` handler can't usefully await anyway — the point of no return for navigation/close happens synchronously right after the handler returns). On the Go side, `main.go` wires `OnShutdown` (in `app.go`) but not `OnBeforeClose` — `OnShutdown` runs during/after teardown and offers no way to delay the actual process exit until the frontend's async `SaveWorkspaceState` call (a Wails-bound method invocation, itself asynchronous over the runtime bridge) has actually completed and been written to disk. In practice this means the write very plausibly loses the race against the window/process actually closing, so `~/.bcode/workspaces/{id}.json` ends up stale or never updated for the final session.

## Acceptance Criteria

### Bug A

1. Pressing Ctrl/Cmd+Shift+Tab (or Ctrl/Cmd+Tab) repeatedly, in a row, with no intervening click, keeps cycling through tabs every time — including when the cycle lands on a tab type that doesn't render a Monaco editor (Home, a query tab, the git graph tab, a commit diff tab) and then continues from there.
2. This holds whether the shortcut is pressed while focus started inside a Monaco editor or anywhere else in the app (sidebar, terminal, etc. — the existing window-level listener already covers non-Monaco starting points; this criterion is about it *continuing* to work after landing on a non-Monaco tab).

### Bug B

3. Opening files in a workspace, then closing the app entirely (window close, not just switching workspace), then relaunching, restores the same open tabs and the same active tab — not just "sometimes," reliably, matching what `openFiles`/`activeFile` in `WorkspaceState` said at close time.
4. This must hold for a normal window-close (clicking the OS close button / using the window manager), not only for an in-app "switch workspace" action (which already calls `persistCurrentWs` directly and isn't in question here).

## Implementation Notes

- **Bug A fix**: after any tab switch (`cycleTab`, `setActiveTab`, `openOrFocusTab`, closing the active tab, etc. — wherever `activeTabId` changes), ensure something in the DOM ends up focused. Concretely: give the Monaco editor a way to focus itself on mount for the newly active tab (`@monaco-editor/react`'s `onMount` gives the editor instance — call `editor.focus()` there when this tab is the active one), **and**, for tab types with no Monaco instance at all (Home, query tab, git graph tab, commit diff), focus a stable always-mounted element instead — e.g. a `tabIndex={-1}` ref on the main app container in `App.tsx`, called via `.focus()` right after the tab switch. The safest approach is probably: whenever the active tab changes, focus the container by default, and let a mounting Monaco editor "steal" focus a tick later via its own `onMount`/`useEffect` if it's the active one — so there's always *some* fallback even for non-Monaco tabs.
- **Bug A verification note**: this is a GUI/focus behavior this assistant cannot click-test. Frame the fix as best-effort based on the root-cause analysis above, and ask the user to specifically retest: cycle through several tabs of mixed types (file → Home → query → file) with the keyboard alone, no clicks, and confirm it never gets stuck.
- **Bug B fix**: add an `OnBeforeClose` hook in `main.go`'s `options.App` (Wails v2 supports this: return `true` from the callback to prevent the immediate close). In it, emit a Wails runtime event (e.g. `runtime.EventsEmit(ctx, "app:before-close")`) to the frontend. In `App.tsx`, listen for that event (`EventsOn` from `wailsjs/runtime/runtime`), call the existing `persistCurrentWs` for the current workspace, **await it fully**, then call a new bound Go method (e.g. `a.ConfirmQuit()`, which calls `runtime.Quit(ctx)`) to actually close the window — this guarantees the save finishes before the process exits, instead of racing it. Handle the case where there's no `currentWorkspace` (call `ConfirmQuit` immediately, no save needed) and add a short safety timeout on the frontend (e.g. 2s) that calls `ConfirmQuit` anyway if the save hangs, so the window can never become permanently unclosable.
- **Small cleanup while touching this code**: `persistCurrentWs`'s `openFiles` filter (`!t.isCommitTab && !t.isGraphTab && !!t.path`) doesn't exclude `isUsageTab`/`isQueryTab` tabs, so it currently includes their fake paths (`__usage__`, `__query_...__`) in the saved `openFiles` list — harmless today (restore just does a `ReadFile` that fails and gets silently caught), but wasteful and worth excluding explicitly while this function is being edited anyway for the `OnBeforeClose` wiring.
- Do not touch `frontend/wailsjs` by hand; `wails generate module` after adding `ConfirmQuit` (or whatever the new bound method is named).
- Out of scope: the two-list workspace *history* (`recent.json`/`ever_opened.json`) is unaffected — this task is only about a single workspace's own open-tabs snapshot (`~/.bcode/workspaces/{id}.json`).

- Plan: `docs/plans/2026-09-27_tab-focus-and-persistence-fixes.md`. Next command: `bsdd start`.

## Definition Of Done

- [ ] Acceptance criteria 1–4 verified by hand — **not done**: criteria 1–2 need a running window and real keyboard-only interaction; criteria 3–4 need an actual app close-and-relaunch cycle. Both fixes are implemented and pass `go build ./...` / `npm run build`, but neither is exercised live yet.
- [x] `shell.md`, `files.md` and `workspace.md` updated from "Planned" to the shipped shape.
- [ ] Sync Review completed if source docs changed — pending `bsdd sync`, to be run only with user confirmation.
