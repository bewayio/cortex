---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
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

# Task: "Abrir chat" button missing, likely a Claude CLI detection gap

## Status

planned

## Goal

The title bar's "Abrir chat" button (`TitleBar.tsx`, shown when exactly one AI engine is detected) is not appearing for the user, even though `claude` is installed. Likely cause: `GetInstalledAiEngines` (`ai_sessions.go:534`) detects engines with a bare `exec.LookPath("claude")`/`exec.LookPath("codex")` — no fallback paths — while the chat-streaming code path (`findClaudeCLI` in `app.go:606`) already has a broader candidate-path fallback (`~/.local/bin`, `/usr/local/bin`, etc.) for exactly this kind of PATH gap. A GUI-launched app (desktop launcher, AppImage) commonly does not inherit the full interactive-shell `PATH` (nvm-managed installs, `~/.local/bin`, etc.), so `exec.LookPath` alone under-detects compared to a login shell.

The user also asked that this kind of detection never block app startup — it should only affect whether the button/menu shows, validated after the window opens. Confirmed current behavior already matches this: `GetInstalledAiEngines` is called from a `useEffect` with `.then/.catch` in `App.tsx:75-77`, non-blocking. This part needs no fix, only confirmation it stays that way.

## Linked Knowledge

- Project DNA: `.specs/project/project-dna.md`
- Architecture: `.specs/architecture/overview.md`
- Module specs: `.specs/modules/ai-sessions.md`, `.specs/modules/chat.md`
- Area: `.specs/areas/desktop-window.md`
- ADRs: `.specs/adrs/0003-claude-cli-with-sdk-fallback.md`

## Definition Of Ready

- [x] Specification exists and is current
- [ ] Acceptance criteria are clear
- [x] Module boundaries are known (ai-sessions owns `GetInstalledAiEngines`; chat owns `findClaudeCLI`)
- [x] Related ADRs reviewed
- [x] Security implications identified (none)

## Acceptance Criteria

1. Confirm root cause on the user's machine: does `claude` resolve via plain `PATH` when Cortex is launched from the desktop (not from a terminal)? Compare against `findClaudeCLI`'s candidate list.
2. `GetInstalledAiEngines` detects `claude` (and `codex`, if it has the same class of gap) using the same robustness as `findClaudeCLI` — either by sharing one detection helper or by applying the same fallback candidate paths to both engines.
3. `findClaudeCLI`'s existing gap — Unix-only paths, no Windows candidates (`.specs/modules/chat.md` Notes) — stays tracked separately; do not silently fold Windows support into this task unless it's trivial to share.
4. Startup stays non-blocking: detection remains async (`useEffect` + `.then/.catch`), confirmed not to gate window render or any other startup path.
5. After the fix, "Abrir chat" (or the "Chats com IA" dropdown, for 2+ engines) appears whenever the corresponding CLI is actually installed, regardless of how Cortex was launched.

## Implementation Notes

- Consider extracting one shared Go helper (candidate-path detection) used by both `findClaudeCLI` (app.go, chat module) and `GetInstalledAiEngines` (ai_sessions.go, ai-sessions module), to avoid the two detection paths drifting again.
- Touch points: `ai_sessions.go:531-542`, `app.go:605-627`.
- No Inbox/Outbox, no migrations.

## Definition Of Done

- [ ] Acceptance criteria met
- [ ] Tests or verification completed
- [ ] Knowledge documents updated
- [ ] ADRs created/updated if needed
- [ ] Sync Review completed if source docs changed
