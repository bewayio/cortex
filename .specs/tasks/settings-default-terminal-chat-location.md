---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-18
version: 2
connections:
  parent: .specs/modules/shell.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Settings — default dock for new terminals vs. new AI chats

## Status

`in-progress` — implementado; falta só verificação manual do usuário (sem ferramenta de automação de GUI nesta sessão).

## Goal

Add a new section to `SettingsModal.tsx` where the user picks one of two presets for where a **new** plain terminal vs. a **new** AI chat (claude/codex session) opens by default:

- **A) Terminal bottom / Chat right** (today's implicit behavior for plain terminals opening at the bottom; AI chats already default to `right` since `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md`)
- **B) Terminal right / Chat bottom** (swapped)

**Confirmed with the user**: this preference only decides the dock a *new* tab is born into. It never moves already-open tabs, and the user's existing per-tab drag-to-dock gesture (`.specs/tasks/terminal-drag-to-dock.md`) still overrides it freely afterward.

## Background

User request, 2026-10-18, filed together with `.specs/tasks/system-menu-terminal-and-ai-chats.md` and `.specs/tasks/activity-bar-terminal-icon-footer.md`. Today the default dock is hardcoded per call site: the terminal panel's own "+" button and the Terminal menu's "Novo terminal" (new, see the sibling task) default to `'bottom'`; the AI sessions panel's new-session buttons and "Abrir" default to `'right'` (set in `.specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md`). This task makes both of those defaults configurable together as one named preset, instead of two independent hardcoded docks.

## Acceptance Criteria

- [x] `SettingsModal.tsx` gains a new nav section (alongside the existing "Idioma" section — same `{id, label}` list, no redesign of the two-column layout).
- [x] Section shows the two presets (A/B above) as a single choice (radio-style, same interaction pattern as the Idioma section's language picker), with the current value marked on open.
- [x] Selecting a preset persists immediately (same `localStorage`-backed, no-reload pattern as `bcode.language`) and takes effect for the **next** terminal/chat opened — no restart needed.
- [x] Every call site that currently hardcoded a default dock reads this one preference instead: `Terminal.tsx`'s own fallback-terminal creation (used when a workspace has no saved tab config — both the workspace-switch and initial-mount restore paths), the new `TerminalHandle.newTerminal()` (used by the Terminal title bar menu's "Novo terminal"), and `App.tsx`'s `openSessionTerminal` (used by both the AI sessions sidebar's new-session/"Abrir" buttons and the Chats com IA title bar menu). The terminal panel's own per-dock "+" button is **unaffected by design** — it explicitly creates a tab in the dock bar it's drawn in, not a "default", so it was left reading that explicit dock as before.
- [x] Verified: `tsc --noEmit`, `vite build` clean. **Manual verification in `wails dev` pending the user.**

## Implementation Notes

- Storage key `bcode.defaultDockPreset` (`DefaultDockPreset = 'terminal-bottom-chat-right' | 'terminal-right-chat-bottom'`), default `'terminal-bottom-chat-right'` (matches the old de-facto behavior). New `frontend/src/utils/defaultDock.ts`: `getDefaultDockPreset`/`setDefaultDockPreset` (same shape as `i18n.ts`'s language getter/setter) plus two derived helpers, `getDefaultTerminalDock()`/`getDefaultChatDock()`, so call sites never need to know the preset encoding, just "what dock does my kind of tab default to."
- The shared `Dock` type was extracted from `Terminal.tsx` into `frontend/src/utils/dock.ts` so `defaultDock.ts` could reference it without a circular import back into `Terminal.tsx`.
- Sequencing played out as anticipated: this task's helper landed first, then `.specs/tasks/system-menu-terminal-and-ai-chats.md`'s "Novo terminal"/"Abrir chat" actions read it from the start — no second pass needed.
- `SettingsModal.tsx`'s new section and i18n keys use "Chat" to match the sibling task's "Chats com IA" menu wording, in all three locales (`pt-BR`, `es`, `en-US`).
- Verified clean: `tsc --noEmit`, `vite build`.
- **Not verified by this assistant**: actually switching the preset in `wails dev` and confirming new terminals/chats land in the right dock, and that already-open tabs/manual drag are unaffected. No GUI-automation tool available in this session.

## Affected Modules

- `shell` (primary — `SettingsModal.tsx` new section, the preference's storage)
- `terminal` (consumes the preference for its own default-dock call sites)
- `ai-sessions` (consumes the preference for the sidebar's new-session/"Abrir" default dock, replacing the hardcoded `'right'` just shipped)

## Out of Scope

- Any per-project or per-tab override of the preset (global preference only, same scope as language).
- More than two presets.

## Next Step

Run `bsdd plan` — consider bundling with `.specs/tasks/system-menu-terminal-and-ai-chats.md` given the shared "default dock" surface (see Implementation Notes on sequencing).
