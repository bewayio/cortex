---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-21
version: 4
connections:
  parent: .specs/modules/ai-sessions.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Acceptance criteria changes
---

# Task: Settings — enable/disable AI clients

## Status

`implemented` 2026-10-21, corrected same day — see `.specs/tasks/ai-client-enable-toggle-plan.md`. Verified: `tsc --noEmit`, `vite build`, `go build`/`go vet`/`gofmt` clean (also re-checked `go build -tags webkit2_41`, see Correction below). Manual GUI verification (toggle Claude/Codex off/on, confirm panel/menu reaction and restart persistence) still pending the user.

### Correction, 2026-10-21, same day, user report

First cut (described below in Goal/Enforcement) gated on **installed-on-PATH (`GetInstalledAiEngines`) AND enabled**. The user tested on a real build and reported the menu stuck at the single "Abrir chat" item with no Claude/Codex choice — root cause confirmed by this assistant: `codex` genuinely isn't installed anywhere on that machine (and `GetInstalledAiEngines`'s PATH-based detection is separately already flagged as unreliable for GUI-launched builds, see `ai-sessions.md`'s 2026-10-18 note), so the AND-intersection could never show both regardless of the new config.

**User's explicit correction, overriding the original Enforcement design**: the enabled-set config **replaces** the installed-on-PATH check entirely for both surfaces — it is no longer an intersection. `AiSessionsPanel.tsx`'s new-session buttons and the `shell` "Chats com IA" menu now render one entry per **enabled** engine from the full registry (`ALL_AI_ENGINES`, `aiEngines.ts`), whether or not it's actually installed. Clicking an enabled-but-not-installed engine opens a terminal that fails with "command not found" — same outcome as a user typing the wrong command by hand, not a new failure mode. `GetInstalledAiEngines` is no longer called by either frontend call site (Go method itself untouched, now unused — left in place, not deleted, out of scope for this correction). Session **scanning** (`ListClaudeSessions`/`ListCodexSessions`) was already gated on enabled-only, not installed — unaffected by this correction.

### Second correction, 2026-10-21, same day, user report — menu depth

With the first correction live, the user pointed out the "Chats com IA" dropdown had gone 3 levels deep when 2+ engines are enabled: dropdown → submenu "Nova sessão" → engine item (Claude/Codex). **Expected: 2 levels** (1 if only one engine enabled, unchanged) — the engines should be direct action items inside the "Chats com IA" dropdown itself, no "Nova sessão" submenu in between. Fixed in `TitleBar.tsx`'s `aiMenuItems`: the per-engine items are now top-level entries in the dropdown (followed by a separator and the already-open AI tabs list, same as before). The now-unused `menuBar.newSession` i18n key was removed from all three `shell.json` locales.

## Goal

Add a new "Clientes de IA" section to `SettingsModal.tsx` listing known AI CLI engines (at least Claude and Codex, built from an extensible registry so a future third engine needs no settings redesign) with a per-engine enable/disable toggle.

- **Default when no saved config exists**: Claude and Codex both enabled.
- **Once the user has touched the setting**: the saved per-engine value wins, including after an app restart. A brand-new engine key not yet present in a user's saved config still defaults to enabled (same "no config → on" rule applied per-key, not just on first-ever save).
- **Enforcement (superseded — see Correction below)**: the enabled set **replaces**, not intersects with, `GetInstalledAiEngines` (installed-on-PATH) for:
  - `AiSessionsPanel.tsx`'s session list and its "new session" buttons (`ai-sessions` module) — a disabled engine must not be scanned at all (no `ListClaudeSessions`/`ListCodexSessions` call for it), not merely hidden after fetching. Buttons render one per enabled engine in the full registry, regardless of actual install.
  - `shell` module's "Chats com IA" title-bar menu and its "Abrir chat"/submenu logic (`TitleBar.tsx`/`MenuDropdown.tsx`), same rule — menu item count reflects enabled engines, not detected-installed ones.
- A disabled engine must behave as if it didn't exist in the registry: no scan, no button, no menu entry. An **enabled** engine always gets a button/menu entry, even if not actually installed on this machine (the previous installed-check is gone for this purpose).

## Acceptance Criteria

- [x] `SettingsModal.tsx` has a new section listing every known AI engine (registry-driven, not two hardcoded branches) with a toggle per engine.
- [x] Persisted enabled-set survives app restart; missing/never-saved keys default to `true`.
- [x] `AiSessionsPanel.tsx` does not call the list function for a disabled engine.
- [x] `ai-sessions` module's "new session" buttons show every **enabled** engine, regardless of installed-on-PATH detection (corrected 2026-10-21).
- [x] `shell` module's "Chats com IA" menu shows every **enabled** engine, regardless of installed-on-PATH detection — including the 1-vs-2-enabled "Abrir chat" direct-item vs. submenu branching (corrected 2026-10-21).
- [x] i18n: new section follows the existing `shell` namespace pattern (pt-BR, es, en-US).
- [x] `tsc --noEmit`, `vite build`, `go build`/`go vet`/`gofmt` clean.
- [ ] Manual verification by the user (toggle off Claude and/or Codex, confirm panel/menu/new-session buttons react, confirm persistence across restart).

## Decisions (resolved during `bsdd plan`)

- **Storage**: `localStorage`, same pattern as `defaultDock.ts` (`frontend/src/utils/aiClientSettings.ts`, new file). No backend/`~/.bcode` JSON round-trip — this is a pure UI preference, not session data, and nothing outside the frontend needs it.
- **Live resumed tabs**: a terminal tab already running `claude`/`codex` keeps running unaffected when its engine is later disabled — disabling only blocks future discovery/new-session, never kills a process. Same spirit as the existing "Excluir" behavior in `ai-sessions.md`'s Notes. Explicitly out of scope to change.
- **Execution model**: single agent (sequential phases), confirmed with the user — scope is frontend-only, ~4-5 files, no orchestration overhead justified.

## Affected Modules

- `.specs/modules/ai-sessions.md` — session discovery/new-session gating by enabled set.
- `.specs/modules/shell.md` — new Settings section; "Chats com IA" menu gating.
