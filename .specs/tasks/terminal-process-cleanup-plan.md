---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-22
version: 2
connections:
  parent: .specs/tasks/terminal-process-cleanup.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
---

# Plan: Terminal process cleanup — no orphaned shells/children

## Execution Model

**Single agent** (confirmed with the user, 2026-10-21) — scope is concentrated (`app.go` + 2 small new platform files, `Terminal.tsx`, `App.tsx`, `WorkspaceList.tsx`, `Sidebar.tsx`, `UsageTab.tsx`), phases are sequential with no parallelizable sub-tracks that would justify orchestration overhead.

## Definition of Ready — verified

- [x] Project DNA / architecture overview read.
- [x] Relevant module specs current: `terminal.md` (v10), `workspace.md` (v5) — both updated with Notes pointing at this task during `bsdd new`.
- [x] Related ADRs reviewed: ADR-0004 (PTY terminal — Unix-targeted, Windows unverified/gap, consistent with this plan's platform split below).
- [x] Task linked to spec (`terminal-process-cleanup.md`), goal/acceptance criteria defined, edge cases identified (active-vs-cached workspace, switch-away-must-not-regress, "Ever opened" permanent delete).
- [x] No cross-module repository access required — `terminal` owns the PTY/process lifecycle, `workspace` only gains a call-out to it, no shared storage.
- [x] Dependencies: no blocking tasks; `creack/pty`, Go `syscall`/`os/exec` already in use.
- [x] Test strategy: manual background-job survival check (`sleep 999 &`) across all 3 triggers, standard `go build`/`go vet`/`gofmt` + `tsc`/`vite build` gates.

## Decisions made during this plan (resolving the task's open items)

- **Process-group kill (the original idea here) does not work — corrected during implementation, 2026-10-22.** `pty.Start` already calls `Setsid`/`Setctty` internally (confirmed by reading the vendored `creack/pty@v1.1.21` source, `start.go`), so there was never a missing `Setsid` to add. The real reason children survive: an **interactive shell's job control puts each background `&` job in its own process group**, inside the same session — so a `syscall.Kill(-pid, SIGKILL)` process-group signal (which only reaches the shell's *own* group) provably does not reach it. Verified empirically with a standalone repro (bare `pty.Start` + `sleep 999 &`): process-group kill left `sleep` running; a **recursive process-tree kill** (walk `ps -A -o pid,ppid` from the shell's pid down, SIGKILL every descendant bottom-up, then the shell itself) killed it every time, including the detached background job. **Fix: `killProcessTree(pid int)`, not a process-group kill.**
- **Platform split**: `syscall.Kill` is POSIX-only (no equivalent on Windows' `syscall` package), and CI builds natively for `windows-latest` (see `release.md`), so this can't be a single `runtime.GOOS` branch inside `app.go`. Build-tag-guarded files, same pattern already established for `webkit2_41.go`:
  - `terminal_unix.go` (`//go:build !windows`): `killProcessTree(pid int)` — walks `ps -A -o pid,ppid` (same column format on Linux and macOS, unlike `/proc` parsing which is Linux-only) to find live children, recurses, then `syscall.Kill`s each pid bottom-up.
  - `terminal_windows.go` (`//go:build windows`): `killProcessTree` is a no-op — the existing single-process `cmd.Process.Kill()` call stays the only kill on Windows, same as before this task (Windows PTY support is already an open gap in `terminal.md`/ADR-0004, not something this task fixes).
  - No `configureProcessGroup`/`StartTerminal` change needed at all — the bug was never in how the process starts, only in how it's killed.
- **Reopening a closed project resumes it, same as an app restart** (clarified with the user, 2026-10-22): closing a project kills its *live* processes and in-memory state (`wsCache`, Go's `a.terminals`), but must **not** erase the saved per-workspace tab config (`bcode.termtabs.{workspaceId}` — dock, `engine`, `sessionId`). Reopening that project later goes through the exact same "restore from `localStorage`, nothing cached" path `Terminal.tsx` already has for a cold app restart (shipped 2026-10-17, `terminal.md`'s "terminais de IA sobrevivem a um fechar/reabrir"): plain terminals reappear empty in their old docks, and `engine`-tagged tabs re-send their resume command (`claude --resume <id>`/equivalent) to a **brand-new** process — the CLI's own session resume (reading its on-disk session log), not the OS process, is what makes that feel continuous. This changes Phase 2 below from the original "clear the saved config" idea to "leave it untouched, only tear down the live/cached side."
- **"Next workspace" rule** (task's open AC item): after the closed workspace is removed from `recent.json` and the list is re-fetched, activate **index 0** of the refreshed "Open Projects" list if it's non-empty (the user's own drag-ordered top entry — simplest deterministic rule, no extra "which one was adjacent" bookkeeping needed). If the list is empty, clear to the existing no-workspace state (`currentWorkspace = null` — already a real, handled state per `App.tsx` line ~686-687's `?? ''`/`?? '~'` fallbacks, exercised today on first run before any folder is opened).
- **Where the orchestration lives**: `WorkspaceList.tsx` currently calls `CloseWorkspace`/`RemoveWorkspace` directly and does its own `refreshLists()`. That's moved up to `App.tsx` (the only place that already holds `terminalActionsRef`, `currentWorkspace`, and `handleOpenWorkspace`), via two new callbacks threaded down through `Sidebar.tsx` (`source='open'`) and `UsageTab.tsx` (`source='everOpened'`): `onCloseWorkspace(ws)` / `onRemoveWorkspace(ws)`. `WorkspaceList.tsx`'s `handleRemove` calls the passed-in callback instead of the Wails-bound functions directly.
- **No new Go method for "close a whole workspace's terminals"**: `a.terminals` (Go) is purely in-memory, never persisted — so a workspace from a past app session that was never reopened this session has zero live terminals already (confirmed by reading `app.go`: no terminal state is written to disk). The frontend already knows every live terminal id for a given workspace (either in `tabsRef.current`, if it's the active one, or in `Terminal.tsx`'s own `wsCache`, if cached from an earlier in-session switch) — cleanup is a loop of the existing `CloseTerminal(id)` Wails call, driven from the frontend, not a new backend endpoint.

## Phases

### Phase 1 — Go: process-tree kill primitive (S) — DONE, 2026-10-22

- Added `terminal_unix.go` / `terminal_windows.go` as described above (`killProcessTree`, not the originally-planned process-group kill — see correction above).
- `StartTerminal` is unchanged — the fix is entirely on the kill side.
- `CloseTerminal` and `shutdown()` (`app.go`): after `term.cancel()`, call `killProcessTree(term.cmd.Process.Pid)` (guarded by `term.cmd.Process != nil`), then `term.ptmx.Close()` as today.
- No new `Terminal` struct fields needed — `cmd *exec.Cmd` already stored, `.Process.Pid` is enough.
- Verified: `go build`/`go vet`/`gofmt` clean on Linux (native) + `GOOS=windows`/`GOOS=darwin` cross-compile clean. Standalone repro (outside the Wails runtime, since `app.go`'s `StartTerminal` calls `runtime.EventsEmit` unconditionally on first output and that panics without a real Wails-initialized context — confirmed by trying an in-process `go test` against the real `App` struct) proved the exact algorithm kills a `sleep 999 &` left running inside the shell; the real `app.go` wiring was then reviewed by hand against that same algorithm.
- Dependencies: none (first phase).

### Phase 2 — Frontend: `Terminal.tsx` gains `closeWorkspaceTerminals` (S) — DONE, 2026-10-22

- New `TerminalHandle` member: `closeWorkspaceTerminals: (workspaceId: string) => Promise<void>`.
- If `workspaceId` is the one currently mounted (matches the live `workspaceId` prop): for every tab in `tabsRef.current`, call `CloseTerminal(id)` (same backend call `closeTab` already makes), dispose each `xterm`, remove each terminal div, then `setTabs([])` — mirrors `closeTab`'s per-tab cleanup, just batched and without the "pick next active tab" dance (there's nothing left to activate). **Does not touch `bcode.termtabs.{workspaceId}`** — see "Reopening a closed project resumes it" above; the saved dock/engine/sessionId config must survive so a later reopen recreates the same layout.
- Else, look up `wsCache.current.get(workspaceId)`: call `CloseTerminal(id)` for each cached tab (still dispose their divs/xterm instances, since they exist in the DOM, hidden, from the last time this workspace was active), then `wsCache.current.delete(workspaceId)` so a later reopen doesn't try to restore dead xterm instances from the in-memory cache and instead falls through to the from-`localStorage` restore path. **`bcode.termtabs.{workspaceId}` is left untouched here too.**
- If neither (never touched this session): no-op — nothing live to kill, and the saved config (if any, from a previous app run) is already exactly what a normal reopen would read.
- Dependencies: Phase 1 (so the calls this makes actually kill full process trees, not just shells).

### Phase 3 — Frontend: wire project-close to cleanup + redirect (M) — DONE, 2026-10-22

- `App.tsx`: new `closeWorkspace(ws: Workspace, { permanent }: { permanent: boolean })`:
  1. `await terminalActionsRef.current?.closeWorkspaceTerminals(ws.id)`.
  2. `await (permanent ? RemoveWorkspace(ws.id) : CloseWorkspace(ws.id))`.
  3. Re-fetch `recent`/`everOpened` (same calls `refreshLists()` in `WorkspaceList.tsx` made before), update the store.
  4. If `ws.id === currentWorkspace?.id`: pick the refreshed "Open Projects" list's index 0 and `await handleOpenWorkspace(next.path)` if it exists, else clear state — `setCurrentWorkspace(null)`, `setFileTree(null)`, stop the file watcher for the closed path (confirm `WatchWorkspace`'s existing "closes the previous watcher automatically" behavior, noted in `handleOpenWorkspace`, covers this or needs an explicit stop call when there's no new path to pass it).
- `WorkspaceList.tsx`: `handleRemove` calls the new prop (`onCloseWorkspace`/`onRemoveWorkspace`, selected by `source`) instead of importing/calling `CloseWorkspace`/`RemoveWorkspace` and `refreshLists()` directly; those two Wails imports and the inline list-refresh move to `App.tsx`.
- `Sidebar.tsx` / `UsageTab.tsx`: thread the new callback prop through to `WorkspaceList`.
- Dependencies: Phase 2.

### Phase 4 — Verification (S)

- `go build`/`go vet`/`gofmt -l .` clean (on this machine, Linux — Windows-specific file only checked by reading, not compiled here, same limitation as every other cross-platform note in this codebase's specs).
- `tsc --noEmit`, `vite build` clean.
- Manual check (this assistant, in `wails dev`): open a terminal, run `sleep 999 &`, then for each of the 3 triggers (close tab, close the project from "Open Projects", close the window) confirm via `ps`/`pgrep sleep` that no `sleep` process survives.
- Manual check: close the **active** project with 2+ "Open Projects" entries → window redirects to the new index-0 entry, its files/terminals load normally. Close the active project with it being the **only** entry → window returns to the empty/no-workspace state cleanly (no crash, no stale file tree).
- Manual check: switching workspace (not closing) still instantly restores cached terminals — regression check for the `wsCache` fast-path.
- Manual check: close a project with a plain terminal and an AI (`claude`/`codex`) tab open, confirm their process(es) die (`ps`), then reopen that same project — same dock layout comes back, the plain terminal reappears empty (new shell, expected), the AI tab re-sends its resume command to a new process and the CLI itself picks the conversation back up.
- Remaining: user's own hands-on confirmation in the real built app (no GUI automation available here), same caveat as every other UI task in this project's specs.

## Dependency Graph

```
Phase 1 (Go kill primitive)
   └──> Phase 2 (Terminal.tsx closeWorkspaceTerminals)
          └──> Phase 3 (App.tsx/WorkspaceList.tsx wiring + redirect)
                 └──> Phase 4 (verification)
```

## Status

Plan complete. Linked task (`terminal-process-cleanup.md`) moved to `planned`. Do not implement until this plan is approved.
