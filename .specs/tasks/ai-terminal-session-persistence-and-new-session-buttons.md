---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 3
connections:
  parent: .specs/modules/ai-sessions.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Restore AI terminals on relaunch + "new session" buttons in the AI sidebar

## Status

`in-progress` — all 5 implementation phases done (see `-plan.md`); kept out of `done` because Phase 6 (manual verification in `wails dev`: clicking the buttons, a real close/reopen cycle) needs the user — no GUI-automation tool available in this session.

## Goal

1. When the app is closed while one or more terminal tabs are running `claude` or `codex` (whether started via a plain shell, via the AI sessions panel's "Abrir", or via the new buttons below), relaunching the app automatically reopens a terminal for each of them, resuming the same session (`claude --resume <id>` / `codex resume <id>`) — not a blank shell.
2. The AI sidebar panel (`AiSessionsPanel.tsx`) gains one button per installed engine ("Claude" / "Codex" — only shown if that CLI is found on `PATH`) to start a brand-new session (no `--resume`), opened as a new terminal tab docked to the **right** sidebar, alongside any `claude`/`codex` terminal(s) already docked there.
3. Any terminal tab running `claude` or `codex` (new-session button, panel "Abrir"/resume, or restored on relaunch) gets its tab name set to "Claude" or "Codex" instead of the default shell tab name.

## Background

User request, 2026-10-17 (garbled dictation, clarified by the assistant from context + two confirmed decisions):

- Restore-on-relaunch must cover **every** AI terminal that was open at close time, not just the last-used one (confirmed).
- The new "open new session" buttons always start a **new** session, never resume (confirmed) — distinct from the AI sessions panel's existing "Abrir" action on a listed session, which already resumes (see `.specs/modules/ai-sessions.md`).

This sits across three existing modules — no new module:

- `workspace` (`.specs/modules/workspace.md`): `WorkspaceState` needs to remember, per workspace, which terminal tabs were running an AI engine and with which session/thread id, so relaunch can recreate them. Today `WorkspaceState` only tracks open/pinned files and terminal *count*, not per-terminal startup command.
- `terminal` (`.specs/modules/terminal.md`): `StartTerminal` only takes a `workdir`; it has no notion of a startup command or a tab name set by the backend. Needs a way to start a terminal that runs `claude --resume <id>` / `codex resume <id>` / `claude` / `codex` instead of `$SHELL`, and to pre-set that tab's displayed name and right-dock placement.
- `ai-sessions` (`.specs/modules/ai-sessions.md`): already owns "open a terminal with a specific startup command" for the resume case (`ListClaudeSessions`/`ListCodexSessions` + "Abrir"); needs the new "start fresh" buttons, engine-installed detection, and (for restore) a way to report back to `workspace` which terminals are AI terminals and their ids while the app is running, so there's something to persist on close.

## Acceptance Criteria

- [x] Backend can detect whether `claude` and/or `codex` binaries are on `PATH`; AI sidebar only shows a given engine's "new session" button if that engine is installed. (`GetInstalledAiEngines`, `ai_sessions.go`)
- [x] Clicking "Claude" / "Codex" in the AI sidebar opens a new terminal tab docked to the **right** sidebar, running a fresh (non-resumed) `claude` / `codex` session, tab named "Claude" / "Codex".
- [x] New terminal docks alongside any `claude`/`codex` terminal(s) already in the right dock, without displacing them — unchanged per-tab dock model (`terminal.md`), only the request's own dock changed, not how docks interact.
- [x] Opening a session from the AI sessions panel's "Abrir" (existing resume flow) also results in a tab named "Claude"/"Codex" — fixed; it previously inherited the default `Terminal N` name. Also moved to the right dock for consistency with the new buttons (see Implementation Notes / Phase 3b).
- [x] While the app runs, the set of "this terminal tab is running engine X with session/thread id Y" is tracked and persisted per workspace — **implementation deviation from the plan**: kept in the existing per-workspace `localStorage` tab config (`bcode.termtabs.{workspaceId}`) instead of adding a field to Go's `WorkspaceState`, since that config already is the single source of truth for tab `id`/`title`/`dock` and already survives a restart. See Implementation Notes.
- [x] On relaunch, for the restored workspace, every terminal tab that was an AI terminal at last close is recreated automatically, each resuming its own session id, named "Claude"/"Codex", in its last-known dock (bottom/right).
- [x] A terminal tab that was running `claude`/`codex` via a plain shell (user typed the command manually, not through a Cortex-provided button/panel) is **out of scope** for restore — confirmed acceptable, no backend change attempts to detect this case.
- [x] If a session id no longer exists/resumes successfully (deleted, expired) on relaunch, fails gracefully — the resume command is sent the same way the existing "Abrir" flow always has (`TerminalInput`, fire-and-forget into the PTY); the CLI's own error prints inside that terminal, the rest of the workspace restore loop is unaffected (not gated on this call). Not interactively reproduced with an actually-invalid session id — logically follows from the existing, already-shipped "Abrir" resume path behaving the same way.

## Implementation Notes

- Backend: `GetInstalledAiEngines` added to `ai_sessions.go` (`exec.LookPath`); bindings regenerated with `wails generate module`.
- Frontend: new shared `frontend/src/utils/aiEngines.ts` (`buildAiCommand`, `AI_ENGINE_LABEL`, `AiEngine` type) — used by `AiSessionsPanel.tsx`, `App.tsx`, and `Terminal.tsx` so the resume/new-session command string and engine label aren't duplicated per call site.
- `Terminal.tsx`: `TermTab` gained `engine?`/`sessionId?`; `createTerminal`/`addTerminalTab`/`openWithCommand` thread an optional `{engine, sessionId}` through; `saveTabConfig`/`loadTabConfig` persist/restore those two fields; both relaunch-restore code paths (workspace-switch effect and initial-mount effect) now send the resume command via `TerminalInput` for any restored tab that has `engine` set.
- `AiSessionsPanel.tsx`: loads `GetInstalledAiEngines` on mount, renders a "new session" button row, `onOpenSessionTerminal` callback signature changed from `(command: string)` to `(engine, sessionId?)` — callers (`Sidebar.tsx`, `App.tsx`) updated accordingly.
- **Phase 3b resolved**: moved the existing "Abrir" (resume) flow to the right dock too (`openWithCommand`'s default `dock` changed from `'bottom'` to `'right'`), so both the new buttons and the pre-existing resume action behave consistently — this changes previously-shipped behavior slightly (resume used to open at the bottom), judged acceptable since it was never a documented/relied-upon default, just whatever the parameter defaulted to.
- **Deviation from the written plan's Phase 4**: persisted AI terminal state in the existing `localStorage` tab config instead of extending Go's `WorkspaceState`, after reading the actual code — `WorkspaceState` doesn't track terminals beyond a count today, while the tab config already does and already survives a restart on its own. Avoids a second, redundant source of truth. `workspace.md` is unaffected by this task.
- Verified clean: `gofmt -l .` (no output), `go vet ./...`, `npx tsc --noEmit`, `npm run build` (vite).
- **Not verified by this assistant** (no GUI-automation tool for this desktop Wails app): actually clicking the new buttons, confirming visual placement/naming in `wails dev`, and confirming resume survives a real app close/reopen cycle. Needs the user's own pass per Phase 6 of the plan.
- **Root cause found 2026-10-18, after the user reported "a sessão do Claude não parece ser retomada ao reabrir":** unrelated to this task's own logic (which was correct) — `App.tsx`'s `showTerminal` state always initialized to `false` and never read the `bcode.terminalVisible` flag it had been writing to `localStorage` since the project's first commit. `Terminal.tsx` only mounts once `showTerminal` becomes `true`, so on every fresh app launch it never mounted at all — meaning the restore-on-relaunch logic this task built (auto-resuming AI terminals) never got a chance to run, regardless of how correct it was, until the user manually opened the terminal panel after each launch. Fixed in `.specs/tasks/system-menu-terminal-and-ai-chats.md`'s implementation pass (`App.tsx`'s `showTerminal` now initializes from that persisted flag) — see `.specs/modules/shell.md`'s 2026-10-18 Notes. This task's own acceptance criteria and code are unchanged; the fix lived one layer up, in whether `Terminal.tsx` ever got mounted automatically at all.

## Affected Modules

- `ai-sessions` (primary — new-session buttons, `GetInstalledAiEngines`, tab naming for both new and resumed sessions)
- `terminal` (primary — `TermTab`/tab-config persistence gained `engine`/`sessionId`, relaunch restore now resumes AI terminals; `StartTerminal` itself unchanged — resume still goes through the existing `TerminalInput`-after-start trick, not a backend startup-command parameter)
- `workspace` — **not touched**, by design (see Implementation Notes: AI terminal state lives in the existing terminal-tab `localStorage` config, not `WorkspaceState`)

## Out of Scope

- Restoring plain (non-AI) terminal tabs' shell state/history — unaffected, already out of scope elsewhere.
- Detecting or resuming a `claude`/`codex` process started outside Cortex entirely (e.g., in a different terminal app).
- Changing the AI sessions panel's existing list/resume/delete behavior (`ai-sessions.md`) beyond the tab-naming fix above.

## Next Step

Run `bsdd plan` to turn this into an ordered implementation plan.
