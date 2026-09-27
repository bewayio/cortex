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

# Module: workspace

## Purpose

Remember opened folders (two lists, different scope) and restore per-workspace state.

## Boundaries

- Owns: `~/.bcode/recent.json` ("Open projects" — quick-switch list), `~/.bcode/ever_opened.json` ("Ever opened" — longer history), `last_workspace.txt`, `workspaces/{id}.json`
- Does NOT own: file contents, chat history

## Public Interface

| Method | Input | Output | Description |
|--------|-------|--------|-------------|
| GetRecentWorkspaces | none | Workspace[] | "Open projects": quick-switch list, capped (planned: 8), most-recently-used first. Shown above the file explorer. |
| GetEverOpenedWorkspaces | none | Workspace[] | "Ever opened": longer history, capped at 15, most-recently-used first. Shown on the Home tab. |
| SaveWorkspace | path | id | Opens/switches to a workspace: moves it to the front of *both* lists (creating it if new), marks it as last-active |
| RemoveWorkspace | id | error | Permanently removes from both lists |
| GetLastWorkspaceID | none | id | Last opened |
| SaveWorkspaceState / LoadWorkspaceState | id, WorkspaceState | state | Open files, active file, view mode, terminal count |
| ConfirmQuit | none | none | Called by the frontend after it finishes saving state in response to the `"app:before-close"` event; actually exits the app (`runtime.Quit`) |
| OpenDirectoryDialog | none | path | Native folder picker |

## Events Published

- `app:before-close` — emitted from `OnBeforeClose` when the user tries to close the window; the frontend must save state and then call `ConfirmQuit`.

## Events Consumed

None.

## Dependencies

None.

## Areas

| Area | Permission Level |
|------|-----------------|
| desktop-window | local |

## Security

- Paths come from the local user. IDs used in file names must be sanitized.

## Notes

- JSON formats are a user-confirmed compatibility constraint.
- Frontend: `WorkspaceList.tsx` (now split into two sections, see below), `workspaceStore.ts`.
- **Redesigned 2026-09-27 (supersedes the 2026-09-26 "recently closed" design), user request.** The explicit "close" action (`Archive` icon), `~/.bcode/recent_closed.json`, `GetRecentClosedWorkspaces` and `CloseWorkspace` are **removed** — replaced by a simpler two-list model requested directly:
  1. **"Open projects"** (`recent.json`, `GetRecentWorkspaces`) — shown above the file explorer in the sidebar (`WorkspaceList.tsx`'s existing always-visible section, restyled as its own labeled block), for fast switching between projects worked on recently. **Persists across app restarts** (user's explicit choice — not session-only). Capped at **8** (planned default, not specified by the user — smaller than the Home list on purpose, since it's meant for quick switching in a constrained sidebar area, not a full history; easy to change if it doesn't feel right in use).
  2. **"Ever opened"** (`ever_opened.json`, new `GetEverOpenedWorkspaces`) — shown on the Home tab (`components/UsageTab.tsx`), capped at **15** (user-specified). One click reopens.
  - Both lists are maintained the same way `recent.json` already worked: `SaveWorkspace` moves the entry to the front of each list (inserting if new), so both are most-recently-used-first.
  - **Corrected 2026-09-27 (same day, user bug report)**: the initial version of this redesign had a single `X` removal action calling `RemoveWorkspace`, which deleted from *both* lists — so closing a project from the sidebar's "Open projects" quick list also erased it from "Ever opened" history, making the two lists behave as one in practice. Fixed by reintroducing a `CloseWorkspace(id)` backend method (name reused from the removed 2026-09-26 design, different behavior: it now only strips the entry from `recent.json`, leaving `ever_opened.json` untouched) for the **sidebar's** `X` button. The **Home tab's** `X` button still calls `RemoveWorkspace` (both lists), since removing something from the full history should also drop it from the quick list. `WorkspaceList.tsx`'s `source` prop selects which call `X` makes.
  - Task: `.specs/tasks/quick-navigation-and-shortcuts.md`.
- Fixed 2026-09-26 (superseded by the above, kept for history): `recent.json`'s old 20-entry cap was removed entirely on a "show everything I've opened" request; the 2026-09-27 redesign reintroduces a cap, but on the *new*, purpose-split lists — "open projects" (8) and "ever opened" (15) — not on a single undifferentiated list.
- **Shipped 2026-09-27, user bug report**: open files were not reliably restored after a full app restart. `SaveWorkspaceState` used to only be triggered from a `beforeunload` handler that fired-and-forgot the async save — there was no `OnBeforeClose` hook in `main.go` to actually delay process exit until that save (a Wails-bound async call) completed, so it plausibly lost the race against the window/process closing. Fixed: `main.go` now wires `OnBeforeClose: app.beforeClose`, which emits an `"app:before-close"` runtime event and returns `true` (preventing the immediate close); `App.tsx` listens for that event, awaits `persistCurrentWs` for the current workspace (raced against a 2s safety timeout so a hung save can never make the window unclosable), then calls the new `ConfirmQuit()` bound method (`runtime.Quit`) to actually exit. The old `beforeunload` handler was removed — this is the only save-on-close path now. Also tightened while touching this code: `persistCurrentWs`'s `openFiles`/`activeFile` collection now excludes `isUsageTab`/`isQueryTab` tabs too (previously only `isCommitTab`/`isGraphTab` were excluded), since their fake paths (`__usage__`, `__query_...__`) don't belong in a file-restore list. **Not interactively confirmed by this assistant** — needs the user to actually close and relaunch the app with files open. Details: `.specs/tasks/tab-focus-and-persistence-fixes.md`.
- **Regression found and fixed same day (2026-09-27, user bug report)**: the `beforeClose` above unconditionally returned `true`, which broke window closing entirely — not just the native OS chrome but the custom frameless-window close button in `TitleBar.tsx` too, since both go through the frontend's `runtime.Quit()`, and (confirmed by reading the vendored Wails v2.12.0 Linux frontend source) that function itself re-checks `OnBeforeClose` on *every* call, including the one `ConfirmQuit` makes — so `ConfirmQuit` was re-triggering its own prevention, forever. Fixed with a `quitConfirmed` flag on `*App`: `beforeClose` returns `false` (allow) once `ConfirmQuit` has set it, `true` (prevent, emit the event) otherwise. This is the standard pattern Wails' own `OnBeforeClose` hook is designed around — it's expected to be called more than once per actual quit attempt.
- **Fixed 2026-09-27, user request**: `WorkspaceList.tsx`'s "Ever Opened" section (Home tab) gained a small subtitle ("Projects you've opened recently — click to reopen", new `.section-sublabel` style) — the label alone wasn't self-explanatory.
- **Planned 2026-09-27, user follow-up**: `WorkspaceState` will gain a `pinnedFiles: []string` field (alongside `openFiles`/`activeFile`) so per-workspace pinned tabs (not Home, which becomes a global, workspace-independent singleton — see `shell.md`) survive an app restart. Full design: `.specs/tasks/pinned-tabs.md`.
