---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-09-21
version: 1
connections:
  parent: .specs/architecture/overview.md
  children: []
  related_adrs: [0001, 0007]
  sync_triggers:
    - Changes to public interface
    - New or removed events
    - Changes to dependencies
---

# Module: shell

## Purpose

Window chrome and workbench layout: title bar, activity bar, sidebar, panes, status bar, persisted UI prefs.

## Boundaries

- Owns: layout state and prefs in `localStorage` (`bcode.sidebarWidth`, `terminalHeight`, `terminalWidth`, `terminalDock`, window size and position)
- Does NOT own: business data of other modules

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| Wails runtime (frontend) | WindowToggleMaximise, size and position | none | Window control from `App.tsx` |
| Window options (`main.go`, `window_options.go`) | Title, size, min size, background, `Frameless` per OS, `mac.TitleBarHiddenInset` | none | Native window setup |

## Events Published

None.

## Events Consumed

None.

## Dependencies

| Dependency | Type | Interface |
|-----------|------|-----------|
| All other modules | public-service | Mounted as panels |

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- None specific.

## Notes

- Shipped 2026-09-25, corrected 2026-09-26: the `ActivityBar`'s first button ("Home", `Home` icon — was labeled "Usage" with a `BarChart2` icon, and was third, until the 2026-09-26 rename/reorder) does **not** add a sidebar panel — `Panel` stays `'explorer' | 'git'`, unchanged. It opens/focuses a singleton editor tab (internal identifier still `isUsageTab`, kept as-is, like the existing `isGraphTab` git-graph tab), rendered by `EditorPane` as `components/UsageTab.tsx` in the main editor area — a VS Code-"Welcome tab"-style page (Claude Code token usage chart, then recent projects — the "Ever opened" list, see `workspace.md`; the "Recently Closed" section mentioned here in an earlier revision was removed 2026-09-27), not a sidebar view. The first version put this in the sidebar; the user asked for it to open where files open instead. Tasks: `.specs/tasks/sidebar-usage-panel.md` (original tab), `.specs/tasks/home-icon-and-closed-projects.md` (rename/reorder + closed-projects list).
- One shared title bar (`components/TitleBar.tsx`, class `app-titlebar`, height token `--titlebar-height` 44px) on all systems (ADR-0007). Linux and Windows run a frameless window (`useFramelessWindow()` in `window_options.go`) and the bar draws minimize, maximize/restore and close on the right. macOS keeps `TitleBarHiddenInset`, the bar leaves 80px for the traffic lights. Drag uses `--wails-draggable`. Platform is read once in `utils/platform.ts` from the Wails runtime and set as `data-platform` on `<html>`. Task: `.specs/tasks/unified-window-chrome.md`. Verified on Linux only.
- `WindowMaximise` runs on startup.
- **Shipped 2026-09-27, user request — global keyboard shortcuts and a command palette.** All of these use the same cross-platform convention already established for the SQL editor's Run/Save shortcuts (`.specs/modules/database.md`): **Ctrl on Linux/Windows, Cmd on macOS** (Monaco's own `KeyMod.CtrlCmd` idea, applied by hand outside Monaco via `usePlatform()`), not a literal "Ctrl" on every OS — macOS reserves plain Ctrl+P for a native Cocoa text-navigation shortcut (move up a line) in text fields, so binding literal Ctrl+P there would be a real, if minor, conflict. This also **fixed a pre-existing bug**: the file-search shortcut and the font-size shortcuts in `App.tsx` used to check `e.metaKey` only, so they silently did nothing on Linux and Windows — restriction 5 (same behavior on every OS) was being violated before this task touched the area.
  - **Ctrl/Cmd+Tab** and **Ctrl/Cmd+Shift+Tab**: cycle to the next/previous editor tab (wrap around). **Fixed 2026-09-27, same day, user bug report**: Ctrl/Cmd+Shift+Tab didn't work when focus was inside a Monaco editor — Monaco's own keybinding service intercepts Tab/Shift+Tab (indent/outdent) before the key event reaches the window-level listener in `App.tsx`, the same class of bug already documented for the SQL Run shortcut. Fixed with a global Monaco keybinding rule (`frontend/src/utils/globalEditorShortcuts.ts`, `monaco.editor.addKeybindingRules`, registered once via `onMonacoReady` in both `MonacoEditor.tsx` call sites — `EditorPane.tsx` and `QueryTab.tsx`) that calls `cycleTab` directly on the store; the window-level listener stays for when focus is outside any editor. **Fixed 2026-09-27, same day, follow-up user report**: this only fixed the first press — cycling onto a tab with no Monaco instance (Home, a query tab, the git graph tab) left nothing focused in the DOM, and subsequent presses did nothing until the user clicked somewhere. Fixed in `EditorPane.tsx` with a `tabIndex={-1}`-focusable container (`containerRef`) that receives `.focus()` whenever the newly active tab doesn't render a Monaco instance, and by explicitly focusing the Monaco editor on mount (`onEditorMount={(editor) => editor.focus()}`, safe because file-tab Monaco instances are `key={activeTab.id}`-remounted every switch) or on tab-id change (`QueryTab.tsx`'s own `useEffect(() => editorRef.current?.focus(), [tab.id])`, needed because `@monaco-editor/react` does **not** remount its `<Editor>` between two query tabs, so `onMount` alone wouldn't refire). Details/root-cause analysis: `.specs/tasks/tab-focus-and-persistence-fixes.md`. **Not visually/interactively confirmed by this assistant** — needs the user's retest with keyboard-only tab cycling across mixed tab types in `wails dev`.
  - **Ctrl/Cmd+P**: go-to-file (existing `FileSearch.tsx`, today wired to `metaKey` only — fixed here to also work on Linux/Windows).
  - **Ctrl/Cmd+Shift+P**: command palette (new `components/CommandPalette.tsx`, modeled on `FileSearch.tsx`'s overlay/fuzzy-list — a v1 command registry: New Terminal, New Query, Open Folder, Go to File, toggle each sidebar panel, Go Home, Close Tab, Close All Tabs; extensible later without a spec change).
  - **Ctrl/Cmd+Q**: reopens/focuses the last-used saved query (highest `SavedQuery.updatedAt` across every connection) — `openOrFocusTab`'s existing `savedQueryId` dedupe means it just focuses the tab if it's already open, rather than opening a duplicate. Falls back to a new blank query tab if no saved query exists yet. **Changed 2026-09-27, same day, user follow-up**: the original version of this task always opened a fresh blank tab; the user asked for "last used, focus if open" instead — a distinct "New Query" blank-tab action still exists (Database panel's own button, and the command palette).
  - **Ctrl/Cmd+Shift+Q** (added 2026-09-27, user request): opens a new `components/QuerySearch.tsx` overlay — modeled on `FileSearch.tsx`/`CommandPalette.tsx`'s shared overlay markup — listing every saved query (name, connection, database), most-recently-updated first, filterable by typing; Enter opens the highlighted one via the same `openOrFocusTab` shape `openSavedQuery` uses elsewhere (focuses it if already open, via the existing `savedQueryId` dedupe).
  - **Ctrl/Cmd+Enter** in the file explorer: opens the currently keyboard-focused item (`FileExplorer.tsx` already tracks `focusedPath` and has arrow-key navigation — this is one more key on its existing `onKeyDown` handler, not a new mechanism).
  - **Ctrl/Cmd+Enter** in the database tree, on a table/database node: opens that database's most recently updated saved query (`SavedQuery.updatedAt`), or a new blank query bound to it if none exists yet. On a *connection* node (not a specific database): same idea, scoped to the most recently updated saved query across *that connection's* databases (not the whole app) — user's explicit choice, to avoid surfacing a query from an unrelated server.
  - **Always open showing Home** on launch: after the existing startup restore of the last workspace/tabs, explicitly focus the Home tab last, regardless of what was cached — a one-line addition to the startup sequence, not a change to how workspace/tab restore itself works.
  - All of the above are shown on the Home tab (`UsageTab.tsx`) as a shortcuts reference, per the user's explicit request — not left undiscoverable.
  - Task: `.specs/tasks/quick-navigation-and-shortcuts.md`.
- **Fixed 2026-09-27, user request — Ctrl/Cmd+W to close the active tab**: `EditorPane.tsx` already had a close-tab shortcut, but it checked `e.metaKey` only (macOS-only), same class of bug as the other shortcuts already fixed in this file. Now uses the same `usePlatform()`-based `mod` check as everywhere else (Ctrl on Linux/Windows, Cmd on macOS); the adjacent Cmd+S-to-save handler in the same effect had the identical bug and was fixed alongside it, since it's the same code path.
- **Planned 2026-09-27, user follow-up**: the Home tab currently lives inside the same per-workspace tab cache as regular file tabs (see `workspace.md`'s `switchWorkspace` note in `files.md`), so switching workspaces can make it disappear from view even though nothing "closed" it. The user wants Home to be a global, always-pinned, fixed-first-position tab that survives workspace switches and is only removed by an explicit close — generalized into a real "pin any tab" feature. Full design: `.specs/tasks/pinned-tabs.md`. **Icon-only rendering shipped early, same day, refined on user feedback**: `EditorTabBar.tsx` no longer renders a `tab-name` label for `isUsageTab` — small enough to not need the rest of the pinned-tabs work to land first. First pass still looked full-width because the shared `.tab` rule's `min-width: 80px` applied regardless; fixed with a `.tab-icon-only` class (`min-width: 0`, tighter padding, hides the close `X` — Home still closes via its context menu's "Close" entry). Also made Home undraggable in `EditorTabBar.tsx`'s reorder logic (`handleTabMouseDown` returns early if the dragged tab `isUsageTab`) and clamped the drop-gap so no other tab can be reordered in front of it — a stopgap ahead of `pinned-tabs.md`'s full `globalTabs` design, since Home is still just index 0 of the same array today.
