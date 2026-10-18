---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-17
version: 1
connections:
  parent: .specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Restore AI terminals on relaunch + "new session" buttons in the AI sidebar

## Linked Task

`.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Confirmed with the user. Scope is concentrated in three already-understood modules (`ai-sessions`, `terminal`, `workspace`) with a known, narrow set of files — no independent parallel surface worth splitting across specialized agents.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/ai-sessions.md`, `.specs/modules/terminal.md`, `.specs/modules/workspace.md` read.
- Task linked to all three module specs; acceptance criteria testable.
- Two open decisions resolved with the user before planning: restore-on-relaunch covers **all** AI terminals that were open (not just the last-used one); the sidebar's "new session" buttons **always** start fresh, never resume.
- No blocking tasks pending.

## Current State (read from code)

- `app.go:1302` `StartTerminal(workdir string) (string, error)` always runs `$SHELL` (fallback `/bin/zsh`) — no startup-command or tab-name parameter exists on the backend at all. Resume today is a **frontend-only trick**: `Terminal.tsx`'s `addTerminalTab(dock, startupCommand?)` starts a plain shell via `StartTerminal`, then — if a `startupCommand` was given — calls `TerminalInput(tab.id, startupCommand + '\n')` right after, i.e. "types" `claude --resume <id>` / `codex resume <id>` into the freshly-opened shell as if the user had.
- `AiSessionsPanel.tsx`'s `handleOpen` builds that command string and calls `onOpenSessionTerminal(command)`, wired in `App.tsx:332` to `terminalActionsRef.current?.openWithCommand(command)` — **dock defaults to `'bottom'`** (`Terminal.tsx:534`, `openWithCommand: (command, dock = 'bottom') => ...`), not `'right'`.
- `Terminal.tsx:293`'s `createTerminal` always names a new tab `Terminal ${tabCount.current}` (a plain incrementing counter) — there is no path today that names a tab "Claude"/"Codex", including the existing resume flow.
- `WorkspaceState` (`app.go:85-93`) has `TerminalCount int` only — no per-terminal data, so there is nothing today to persist "this terminal was running `claude --resume X`" across a restart. Terminal tab config itself (`id`, `type`, `title`, `dock`) is persisted separately, client-side only, in `localStorage` under `bcode.termtabs.{workspaceId}` (`Terminal.tsx`'s `saveTabConfig`/`loadTabConfig`) — not in the Go-side `WorkspaceState` at all.
- Relaunch today (`Terminal.tsx`'s mount effect around line ~480-512) reads that `localStorage` snapshot and recreates **plain shells** for every saved tab (`createTerminal` takes no command) — it has no concept of "this tab should resume something."

## Phases

### Phase 1 — Backend: engine detection + startup command on `StartTerminal` (S)

- Add a Go helper to detect `claude` / `codex` on `PATH` (`exec.LookPath`), exposed as a bound method (e.g. `GetInstalledAiEngines() []string`) for the sidebar's conditional buttons.
- Decide and implement how a terminal's startup command reaches the PTY: either (a) keep the existing frontend `TerminalInput`-after-start trick (simplest, zero backend change, already proven in production) for both resume and fresh-start, or (b) have the backend accept and run the command directly in `StartTerminal`. **Recommendation: keep (a)** — it already works, is already used by the panel's "Abrir", and avoids shell-quoting/escaping risk of composing a command server-side. This phase only adds (a)'s missing piece: a way to tag a terminal's *engine* (`'claude' | 'codex' | none`) and *session/thread id* on the frontend side so later phases can persist it — no backend change needed for the command itself.
- Dependency: none (first phase).

### Phase 2 — Frontend: tab naming for AI terminals, both new and resumed (S)

- `addTerminalTab` (and/or `createTerminal`) gains an optional `tabName` override; when a `startupCommand` implies an engine (`claude ...` / `codex ...`), the created tab is named `"Claude"` / `"Codex"` instead of `Terminal ${n}`.
- Covers both paths that already exist: the sidebar's "Abrir" (resume) and the brand-new "new session" buttons from Phase 3 — both go through the same `addTerminalTab`, so one change covers both.
- Dependency: Phase 1 (needs the engine tag to decide the name — can share the same small "parse engine from command" helper).

### Phase 3 — Sidebar: "new session" buttons, docked right (S/M)

- `AiSessionsPanel.tsx` calls `GetInstalledAiEngines` on mount (alongside the existing session list load) and renders a "Claude" / "Codex" button per installed engine, above or alongside the existing list.
- Clicking a button calls `onOpenSessionTerminal('claude')` / `onOpenSessionTerminal('codex')` — same callback plumbing already wired through `Sidebar.tsx` → `App.tsx` → `terminalActionsRef.current.openWithCommand`, but this call site must pass **`dock: 'right'`** explicitly (today's call at `App.tsx:332` relies on the `'bottom'` default — needs its own call site or a parameter threaded through `openSessionTerminal`, since the *existing* resume flow's dock is out of scope to change here... **see Phase 3b**).
- **Phase 3b (same phase, decide while implementing):** confirm whether the *existing* "Abrir" (resume) should also move to the right dock for consistency — the task's acceptance criteria only mandates "right dock" for the new buttons, but having resume open in `bottom` and fresh-start open in `right` would be a confusing inconsistency. Default to moving both to `'right'` unless this contradicts something the user flags during review.
- Dependency: Phase 1 (engine list), Phase 2 (naming).

### Phase 4 — Backend + frontend: persist AI terminal state in `WorkspaceState` (M)

- Add a new field to `WorkspaceState` (Go) and its frontend mirror, e.g. `AiTerminals []AiTerminalState` where `AiTerminalState { TabID, Engine, SessionID, Dock string }` — only entries for terminals that are tagged with an engine (Phase 1/2's tag), not every terminal.
- Wire population: whenever `Terminal.tsx` creates or closes an AI-tagged tab, update an in-memory list that feeds into the existing `persistCurrentWs`/`SaveWorkspaceState` path (`workspace.md`'s existing save-on-close pipeline via `OnBeforeClose` → `app:before-close` → `ConfirmQuit`) — no new save trigger needed, piggyback on the existing one.
- `LoadWorkspaceState` returns the new field; `App.tsx`/`Terminal.tsx`'s relaunch path reads it alongside the existing `localStorage` tab-config snapshot.
- Dependency: Phase 2 (needs the engine/session tag to exist on a tab before it can be persisted).

### Phase 5 — Frontend: resume AI terminals automatically on relaunch (M)

- On workspace load, after the existing plain-shell tab restore (`Terminal.tsx`'s mount effect), for each `AiTerminalState` entry call `addTerminalTab(dock, buildResumeCommand(engine, sessionID))` instead of a blank shell — reusing Phase 2's naming and the existing resume-command builder already in `AiSessionsPanel.tsx` (move/share that `claude --resume <id>` / `codex resume <id>` string-building so it isn't duplicated).
- Failure handling: if `claude`/`codex` exits immediately or the session id no longer resolves, the terminal still opens (shows the CLI's own error in-pane) — per the task's acceptance criteria, this must not crash or block the rest of workspace restore. No special backend detection needed beyond what the CLI itself prints; verify this behavior manually in Phase 6.
- Confirm the explicitly out-of-scope case from the task stays out-of-scope: a terminal where the user manually typed `claude`/`codex` in a plain shell (no Cortex-provided engine tag) is never in `AiTerminals` and is therefore never auto-resumed — it restores as a plain shell like today, losing the running CLI, which is expected/accepted per the task.
- Dependency: Phase 4 (needs the persisted list to read from).

### Phase 6 — Manual verification (S)

- No automated UI test harness in this project (desktop Wails app) — verify by hand in `wails dev`:
  - Sidebar shows "Claude"/"Codex" buttons only for installed engines; clicking each opens a new right-docked terminal named correctly, running a fresh session, alongside any already-open AI terminal in the right dock.
  - Existing "Abrir" (resume) from the sessions list still works and is named correctly.
  - Open two AI terminals (e.g. one Claude, one Codex, or two Claude resumes), close and relaunch the app: both come back, each resuming its own session, correctly named and docked.
  - A plain shell with `claude` typed manually by hand does **not** get auto-resumed on relaunch (confirms the documented out-of-scope boundary).
  - A terminal resuming a deleted/invalid session id opens without crashing the app or blocking the rest of the workspace restore.
- Dependency: Phases 1–5.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1 — Engine detection + command tagging | S |
| 2 — Tab naming | S |
| 3 — New session buttons, right dock | S/M |
| 4 — Persist AI terminal state | M |
| 5 — Auto-resume on relaunch | M |
| 6 — Manual verification | S |

## Execution Log

- Phases 1–5 implemented 2026-10-17 (single agent, as planned). Phase 4 deviated from this plan's text — see the task file's Implementation Notes for why (`WorkspaceState` left untouched; AI terminal state persisted in the existing per-workspace `localStorage` tab config instead). Phase 3b's open question was resolved: the existing resume flow was moved to the right dock alongside the new buttons, for consistency.
- Phase 6 (manual verification in `wails dev`) not run by this assistant — no GUI-automation tool available. `gofmt`, `go vet`, `tsc --noEmit`, and `vite build` all pass clean. Needs the user's own pass before the task can move to `done`.

## Risks / Open Items Carried Into Implementation

- Phase 3b (moving existing resume flow to the right dock) is a scope judgment call flagged for confirmation during implementation, not resolved here — the task's acceptance criteria don't explicitly require it, but leaving it inconsistent is worse.
- No automated test harness exists for this desktop app; all UI-level verification in Phase 6 is manual, same limitation already documented on every other UI task in this project (e.g. `terminal-drag-to-dock.md`).
