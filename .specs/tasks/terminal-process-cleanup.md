---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-22
version: 3
connections:
  parent: .specs/modules/terminal.md
  children: [.specs/tasks/terminal-process-cleanup-plan.md]
  related_adrs: []
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Terminal process cleanup — no orphaned shells/children

## Status

`implemented` 2026-10-22 — see `.specs/tasks/terminal-process-cleanup-plan.md` (single agent, 4 sequential phases, all code phases done). All AC checked except the final manual GUI verification, which needs the user (no display/GUI available in this environment to drive `wails dev`). Next: user tests, then `bsdd finish`.

## Goal

Guarantee that no terminal-spawned OS process (the shell itself, or anything it started — `claude`, `codex`, `npm run dev`, a background `&` job, a compiler, etc.) is ever left running after the user closes it, through any of these triggers:

1. Closing a single terminal/chat tab (`CloseTerminal`).
2. Closing a project ("Fechar" on an "Open Projects" entry, `CloseWorkspace` — including when that entry is the **currently active** workspace in the window, not just another one cached in memory). Closing the active one also moves the window to the next remaining open project, or to no workspace at all if none is left.
3. Closing the app window (`OnShutdown`/`beforeClose` → `ConfirmQuit` flow).

## Root Causes (confirmed by reading the code, 2026-10-21)

- **Process-tree leak (affects all 3 triggers today).** `CloseTerminal` and `shutdown()` (`app.go`) both just call `term.cancel()` (→ Go's default `cmd.Cancel`, `cmd.Process.Kill()`) and `term.ptmx.Close()` — this only targets the **shell process itself**. Any child the shell spawned (foreground job, or a detached `&` background job) keeps running, reparented to init once the shell dies — a real orphan, reproducible today by running e.g. `sleep 999 &` in an integrated terminal, closing that tab, and checking `ps` afterward. **Confirmed during implementation (2026-10-22) that this is not a process-group problem**: `pty.Start` already runs the shell in its own session (`Setsid`/`Setctty`, inside `creack/pty` itself) — but an interactive shell's own job control still puts each background `&` job in a **separate process group** within that same session, so even a correct process-group kill (`syscall.Kill(-pid, ...)`) provably does not reach it (verified with a standalone repro before writing the real fix). The actual fix needed is a recursive process-**tree** kill (walk `ps`'s pid/ppid columns from the shell down, kill every descendant), not a process-group signal.
- **Project-close gap (trigger 2 has no cleanup at all today).** `CloseWorkspace`/`RemoveWorkspace` (`app.go`) only rewrite `recent.json`/`ever_opened.json` — pure list metadata, confirmed by reading both functions. Nothing calls `CloseTerminal` for that workspace's terminal tabs. On the frontend, switching away from a workspace (`Terminal.tsx`'s workspace-switch effect, ~line 380-393) intentionally **keeps** the workspace's PTYs alive in an in-memory `wsCache` so a quick switch-back is instant (confirmed working-as-intended design, see `terminal.md`'s 2026-10-01 note) — but there is no separate path that tells the backend "this workspace is actually closed, not just hidden," so the same caching silently applies even when the user explicitly clicks "Fechar" on it. Those terminals (and everything running inside them) stay alive, invisibly, for the rest of the app's lifetime (or until trigger 3).
- **Trigger 3 (window close) already attempts cleanup** — `shutdown()` iterates every live `a.terminals` entry — so it is not "missing" today, but it inherits the process-tree leak above (only the shells die cleanly; their children don't).

## Decisions (confirmed with the user, 2026-10-21)

- Scope includes **both** fixes: the process-tree kill (root fix, benefits all 3 triggers) and wiring real cleanup into the project-close action.
- Closing a project that is the **currently active** workspace in the window also kills its terminals immediately (treated as if the project stopped existing for the app, even though the window itself stays open) — not deferred until the user switches away or closes the window.
- **Follow-up, same day, user request**: closing the currently active project must also navigate the window away from it — to the next remaining "Open Projects" entry if there's at least one left, or to no workspace (Home/empty state) if the list becomes empty. The app must never keep showing the editor/terminal/explorer of a workspace that was just closed and had its terminals killed.
- **Follow-up, 2026-10-22, user request**: closing a project kills its *live* processes/cache only — the saved per-workspace tab config (dock, `engine`, `sessionId`) is **not** erased. Reopening that project later must resume exactly like a normal app restart already does (`terminal.md`'s 2026-10-17 feature): same dock layout, AI tabs re-send their resume command to a fresh process. See the plan's "Reopening a closed project resumes it" decision.

## Acceptance Criteria

- [x] `CloseTerminal` and `shutdown()` kill the **whole process tree** (recursive, via `ps`'s pid/ppid columns — not a process-group signal, which doesn't reach a background `&` job's own group), not just the direct shell process. Algorithm verified with a standalone repro outside the Wails runtime (`sleep 999 &` killed every time); Windows stays a no-op, same pre-existing gap already documented in `terminal.md`. **Still pending**: the user confirming this live in `wails dev`/a real build across the 3 triggers — no GUI available in this environment to drive that end-to-end.
- [x] Closing a project from "Open Projects" (`App.tsx`'s new `closeOrRemoveWorkspace`, called from `WorkspaceList.tsx`) kills every terminal tab belonging to that workspace via `Terminal.tsx`'s new `closeWorkspaceTerminals` — whether it's the currently active workspace or one cached in memory from an earlier switch — and removes it from `wsCache` (the live/in-memory side only, per the decision below).
- [x] Switching away from a workspace (not closing it) keeps behaving exactly as today — unchanged code path, `closeWorkspaceTerminals` is only called from the new close/remove flow. This task does not regress that.
- [x] "Ever opened" removal (`RemoveWorkspace`) goes through the same `closeOrRemoveWorkspace(ws, permanent: true)` as "Open Projects" close — same cleanup either way.
- [x] Closing the **currently active** workspace from "Open Projects" switches the window to index 0 of the refreshed "Open Projects" list if one exists, or to the empty/no-workspace state if the list is now empty — implemented in `App.tsx`'s `closeOrRemoveWorkspace`.
- [x] Closing a project never erases its saved tab config (`bcode.termtabs.{workspaceId}`) — `closeWorkspaceTerminals` only tears down live processes/`wsCache`, never touches `localStorage`. Reopening recreates the same dock layout and re-resumes any AI (`claude`/`codex`) tab, same behavior as a full app restart already has today.
- [x] `go build`/`go vet`/`gofmt` clean (Linux native + `GOOS=windows`/`GOOS=darwin` cross-compile) and `tsc --noEmit`/`vite build` clean.
- [ ] Manual verification by the user: background job in a terminal survives nothing after tab close, project close, or window close; closing/reopening a project resumes its layout; switching workspaces still caches instantly. No GUI available in this environment to drive `wails dev` end-to-end — this is the one remaining item.

## Affected Modules

- `.specs/modules/terminal.md` — `CloseTerminal`/`shutdown()` process-tree kill semantics.
- `.specs/modules/workspace.md` — `CloseWorkspace` gains a real side effect beyond list metadata.
