---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 1
connections:
  parent: .specs/tasks/open-chat-button-claude-detection.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: "Abrir chat" button missing — Claude CLI detection gap

## Linked Task

`.specs/tasks/open-chat-button-claude-detection.md` → status set to `planned` by this plan.

## Execution Model

**Single agent.** Scope is two small Go functions (`ai_sessions.go`, `app.go`) plus a verification pass. No parallelizable surface that would justify orchestrator overhead.

## Definition of Ready — confirmed

- Project DNA, architecture overview, `.specs/modules/ai-sessions.md`, `.specs/modules/chat.md` read.
- Task linked to both module specs; acceptance criteria are testable (run the built app from the desktop launcher, not a terminal).
- Crosses one module boundary (ai-sessions reusing a chat-module detection helper) — acceptable per Project DNA's "interfaces between backend modules" direction, kept to a shared internal helper, no public-interface change.
- No blocking tasks pending.

## Phases

### Phase 1 — Confirm the PATH gap on the user's machine (S)

- Launch Cortex from the desktop/AppImage (not a terminal) and log/inspect the process's actual `PATH` and whatever `exec.LookPath("claude")` resolves to.
- Compare against `findClaudeCLI`'s candidate list (`app.go:610-617`) to confirm whether one of those candidates would have found it.
- Dependency: none (first phase).

### Phase 2 — Extract a shared detection helper (S)

- Factor `findClaudeCLI`'s `LookPath` + candidate-path fallback logic into one helper usable by both `app.go` (chat module) and `ai_sessions.go` (ai-sessions module) — e.g. a small shared function taking the binary name (`"claude"` / `"codex"`) and returning the resolved path or `""`.
- Keep the existing Unix-only gap as is (tracked separately per `.specs/modules/chat.md` Notes) — do not expand to Windows in this task.
- Dependency: Phase 1.

### Phase 3 — Wire `GetInstalledAiEngines` to the shared helper (S)

- Replace the bare `exec.LookPath` calls in `GetInstalledAiEngines` with the shared helper for both `claude` and `codex`.
- Dependency: Phase 2.

### Phase 4 — Verify non-blocking startup is preserved (S)

- Confirm `App.tsx`'s `useEffect`/`.then().catch()` call pattern is untouched — detection failure must still resolve to an empty list, never throw into render or block the window from opening.
- Dependency: Phase 3.

### Phase 5 — Verify end-to-end and document (M)

- Build and launch from the desktop launcher on the user's machine (or an equivalent GUI-launch repro) and confirm "Abrir chat" (or the "Chats com IA" dropdown) now appears.
- Update `.specs/modules/ai-sessions.md` Notes with the resolved outcome, replacing the 2026-10-18 "reported" entry.
- Mark `.specs/tasks/open-chat-button-claude-detection.md` `done`.
- Dependency: Phase 4.

## Complexity Summary

| Phase | Complexity |
|-------|-----------|
| 1. Confirm PATH gap | S |
| 2. Extract shared helper | S |
| 3. Wire ai-sessions detection | S |
| 4. Verify non-blocking startup | S |
| 5. Verify end-to-end + document | M |

## Out of Scope

Windows-path support for `findClaudeCLI`/the shared helper (tracked separately, `.specs/modules/chat.md` Notes); any change to the chat module's public interface or streaming behavior.

## Next Step

Run `bsdd start` (or `bsdd run`) to begin Phase 1.
