---
bsdd_version: "1.0"
document_type: source
domain: modules
last_updated: 2026-10-22
version: 6
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
| GetRecentWorkspaces | none | Workspace[] | "Open projects": quick-switch list, capped (planned: 8). Shown above the file explorer. Order is user-controlled (drag-to-reorder, see Notes 2026-10-11) — no longer most-recently-used-first |
| GetEverOpenedWorkspaces | none | Workspace[] | "Ever opened": longer history, capped at 15, most-recently-used first. Shown on the Home tab. |
| SaveWorkspace | path | id | Opens/switches to a workspace: creates the entry if new (appended, not moved to front — see Notes 2026-10-11), marks it as last-active. "Ever opened" (Home tab) stays most-recently-used-first; "Open projects" (sidebar) stops reordering on select |
| ReorderRecentWorkspaces | id[] (full ordered list) | error | Persists the sidebar's user-dragged order for "Open projects" |
| RemoveWorkspace | id | error | Permanently removes from both lists |
| GetLastWorkspaceID | none | id | Last opened |
| SaveWorkspaceState / LoadWorkspaceState | id, WorkspaceState | state | Open files, pinned files, active file, view mode, terminal count |
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

- **Implementado 2026-10-22, pedido do usuário — fechar/remover um workspace agora mata os terminais dele.** Antes, `CloseWorkspace`/`RemoveWorkspace` só reescreviam `recent.json`/`ever_opened.json` (metadado de lista) — nenhum terminal era encerrado, mesmo em cache (`wsCache`, `terminal.md`) ou sendo o workspace **atualmente aberto** na janela. Nova orquestração vive em `App.tsx`'s `closeOrRemoveWorkspace(ws, permanent)`: chama `terminalActionsRef.current.closeWorkspaceTerminals(ws.id)` (novo em `Terminal.tsx`, mata processo + `wsCache`, nunca a config salva — ver `terminal.md`) **antes** de `CloseWorkspace`/`RemoveWorkspace`; `WorkspaceList.tsx` não chama mais essas duas funções do Wails diretamente, só o callback (`onCloseWorkspace`/`onRemoveWorkspace`, roteado por `source`, threaded por `Sidebar.tsx`/`EditorPane.tsx`/`UsageTab.tsx`). Se `ws.id` for o workspace ativo: navega pro índice 0 da lista "Open Projects" já atualizada, ou limpa pro estado vazio (`currentWorkspace = null`, já um estado real e tratado hoje — é o que a tela mostra antes do primeiro folder aberto) se não sobrar nenhum. Trocar de workspace (não fechar) continua intocado — `closeWorkspaceTerminals` só é chamado desse fluxo novo. Task: `.specs/tasks/terminal-process-cleanup.md` (dono principal: `terminal.md`, já que a correção de fundo do kill vive lá). **Verificação manual pendente do usuário.**
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
- **Planned 2026-09-27, shipped 2026-10-11** (re-confirmed via a user bug report — Home did disappear on workspace switch exactly as predicted here; this was never implemented until then): `WorkspaceState` gained a `PinnedFiles []string` field (alongside `OpenFiles`/`ActiveFile`) so per-workspace pinned tabs (not Home, which is now a global, workspace-independent tab — see `shell.md`) survive an app restart. `SaveWorkspaceState`'s shape is otherwise unchanged; `App.tsx` collects/restores the new field the same way it already did for `OpenFiles`. Full design: `.specs/tasks/pinned-tabs.md`.
- **Shipped 2026-10-11, user request (and a follow-up bug report when the first pass under-delivered) — stop reordering "Open projects" on select; drag to reorder instead.** `SaveWorkspace` used to move an entry to the front of *both* `recent.json` ("Open projects", sidebar) and `ever_opened.json` ("Ever opened", Home tab) on every open/switch — both most-recently-used-first. Now **"Open projects" stops reordering itself**: `stableUpsertCapped` (replacing `frontInsertCapped` for this one list) leaves an existing entry exactly where it is, only appending a genuinely new one at the end (evicting the front entry if that pushes it over the cap — the only "oldest" signal left once there's no more MRU reordering). **"Ever opened" is unaffected** — still `frontInsertCapped`, most-recently-used-first, since it's a history view, not a quick-switch list the user arranges by hand. New `ReorderRecentWorkspaces(ids []string)` persists a drag-reordered list to `recent.json` wholesale (any id missing from the given order is defensively appended at the end rather than dropped) — called from `WorkspaceList.tsx`'s new mouse-based drag-and-drop (same convention as `EditorTabBar.tsx`), scoped to `source === 'open'` only. This same stable, user-controlled order is also what the planned Ctrl/Cmd+↑/↓ project switcher will cycle through — one order, two places it's used. Task: `.specs/tasks/project-switcher-and-stable-order.md`.
- **Planned 2026-10-11, user request — Ctrl/Cmd+↑/↓ project switcher overlay.** A new global shortcut, analogous in spirit to the existing Ctrl/Cmd+Tab editor-tab cycling (`shell.md`) but scoped to projects and using ↑/↓ instead of Tab/Shift+Tab to avoid colliding with it. Holding Ctrl (Linux/Windows) or Cmd (macOS) and pressing ↑/↓ shows a full-screen-style overlay (macOS Cmd+Tab / Ubuntu Alt+Tab app-switcher look, built once, used identically on every OS — not a native per-OS switcher) listing "Open projects" in their stable sidebar order (see above), moving the highlighted selection up/down on each arrow press; releasing the modifier key commits the highlighted project as the new current workspace (a `SaveWorkspace` call) and dismisses the overlay — pressing an arrow only moves the highlight, it does not switch workspaces until release, so tapping through several projects quickly doesn't trigger a real workspace switch (file tree reload, tab restore, etc.) for each one. Clicking a project in the overlay with the mouse commits immediately. Selection wraps around at both ends. Task: `.specs/tasks/project-switcher-and-stable-order.md`.
