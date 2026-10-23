---
bsdd_version: "1.0"
document_type: source
domain: tasks
last_updated: 2026-10-21
version: 1
connections:
  parent: .specs/tasks/ai-client-enable-toggle.md
  children: []
  related_adrs: []
  sync_triggers:
    - Status change
    - Phase completion
---

# Plan: Settings — enable/disable AI clients

## Execution Model

**Single agent**, sequential phases. Confirmed with the user — scope is frontend-only (~4-5 files), no cross-cutting backend/security/test specialization that would justify an orchestrator.

## Definition of Ready — verified

- [x] Project DNA read (`.specs/project/project-dna.md`)
- [x] Relevant module specs read and current: `.specs/modules/ai-sessions.md`, `.specs/modules/shell.md`
- [x] Related ADRs reviewed: none apply (no new ADR needed — UI preference + gating, same pattern as existing `defaultDock.ts`)
- [x] Task linked to spec: `.specs/tasks/ai-client-enable-toggle.md`
- [x] Feature behavior clearly described; acceptance criteria defined and testable (task file)
- [x] Edge cases identified: no saved config → default on; new engine key appearing later → default on; live resumed tab on a now-disabled engine keeps running
- [x] Error handling: none new — toggles are synchronous `localStorage` reads/writes, same risk class as `defaultDock.ts` (can throw in private-mode browsers; existing codebase does not guard that case either, so no new guard introduced here)
- [x] Security: none — local UI preference only, no secrets, no network
- [x] Module boundaries respected: gating logic documented under `ai-sessions.md` (owns session discovery), Settings UI + menu wiring under `shell.md` (owns `SettingsModal.tsx`/`TitleBar.tsx`) — matches both module specs' Boundaries sections
- [x] Communication pattern: public-service (direct function calls), no new events
- [x] No cross-module repository access required
- [x] No database/entity changes (no DB in this app, ADR-0002)
- [x] No backend API changes (confirmed decision: pure frontend `localStorage`, no new bound Go method)
- [x] Dependencies: none blocking — builds on existing `AI_ENGINE_LABEL`/`AiEngine` (`aiEngines.ts`), `defaultDock.ts` pattern, `GetInstalledAiEngines`, `SettingsModal.tsx`, `TitleBar.tsx`, `AiSessionsPanel.tsx`, all already shipped
- [x] Test strategy: manual verification only (toggle each engine off/on, confirm panel/menu reaction and restart persistence) — matches this app's existing practice (no frontend test runner in this repo; verification is `tsc`/`vite build`/`go vet` clean + manual GUI check by the user, same as every other `shell`/`ai-sessions` task to date)
- [x] Sync status of related documents current: `ai-sessions.md` v6 and `shell.md` v24 already carry `planned` notes for this exact task

**DoR: PASSED.** Ready for implementation.

## Phases

### Phase 1 — Shared engine-settings util (S)

- New `frontend/src/utils/aiClientSettings.ts`:
  - Registry: reuse `AiEngine` from `aiEngines.ts` (today `'claude' | 'codex'` — extensible later without touching call sites below, since everything here iterates/looks up by key rather than branching per literal).
  - `STORAGE_KEY = 'bcode.aiClientEnabled'`, stored as `Record<string, boolean>` (JSON).
  - `isAiEngineEnabled(engine: AiEngine): boolean` — returns the saved value if the key exists, else `true` (default-on rule, applies per-key so a future engine added to the registry with no saved entry also defaults on).
  - `setAiEngineEnabled(engine: AiEngine, enabled: boolean): void`.
  - `getEnabledAiEngines(candidates: AiEngine[]): AiEngine[]` — filters a candidate list (e.g. installed engines) down to the enabled ones; convenience used by every call site in Phases 2-3 instead of each one re-implementing the filter.
- No dependencies. Can be written and typechecked standalone.

### Phase 2 — Settings UI (S)

- `SettingsModal.tsx`: new `SectionId` value `'aiClients'`, new nav entry, new content block listing every `AiEngine` (iterate a small local constant array, same shape as existing `DOCK_PRESETS`) with a toggle reflecting `isAiEngineEnabled`/calling `setAiEngineEnabled` on click — same selected/radio visual language already used for the Language and Layout sections is fine, or a checkbox-style toggle if that reads more naturally for on/off (implementer's call, not a new visual pattern needed either way).
- i18n: add `settings.sections.aiClients` and a small `settings.aiClients.*` block (per-engine label can reuse `AI_ENGINE_LABEL` directly, no new translation key needed per engine) to `frontend/src/locales/{pt-BR,es,en-US}/shell.json`.
- Depends on Phase 1.

### Phase 3 — Gate `ai-sessions` discovery and buttons (M)

- `AiSessionsPanel.tsx`:
  - `load()`: only call `ListClaudeSessions`/`ListCodexSessions` for an engine when `isAiEngineEnabled(engine)` is true — skip the call entirely (not just filter the result) for a disabled one, per the task's explicit "nem busca" requirement.
  - `installedEngines` (state already fetched via `GetInstalledAiEngines`): derive the buttons actually rendered from `getEnabledAiEngines(installedEngines)` instead of `installedEngines` directly.
  - Re-run `load`/button derivation when the enabled-set changes while the panel is mounted (toggling in Settings should reflect without requiring a full app restart) — cheapest approach: re-read on a window `storage` event or on panel focus/mount; exact mechanism is an implementation detail, not a spec decision, as long as the acceptance criterion ("toggle off, confirm panel reacts") holds without requiring the user to restart the app.
- Depends on Phase 1.

### Phase 4 — Gate `shell`'s "Chats com IA" menu (M)

- `App.tsx`: wherever `installedAiEngines` is computed/consumed before being passed to `TitleBar.tsx`, apply the same `getEnabledAiEngines` filter so the menu only ever sees installed-and-enabled engines — `TitleBar.tsx`'s existing `installedAiEngines.length === 1` vs. `> 1` branching (direct "Abrir chat" item vs. submenu) needs no change itself, since it already just reacts to the length of whatever list it's given.
- Same live-update consideration as Phase 3 (toggling in Settings should update the menu without an app restart).
- Depends on Phase 1. Independent of Phase 3 (different component tree), can be done in either order.

### Phase 5 — Verification (S)

- `tsc --noEmit`, `vite build`, `go build`/`go vet`/`gofmt` (no Go files touched, but keep the project's standing habit of checking it wasn't accidentally broken).
- Manual: toggle Claude off → panel stops scanning/showing it and its new-session button, menu stops showing it (falls back to the other engine's direct item, or disappears entirely if both disabled and neither installed-and-enabled); same for Codex; re-enable and confirm it comes back; restart the app and confirm the choice persisted. Leave this to the user, same as every other GUI-only task in this project (no GUI automation tool available in this environment).

## Dependency Graph

```
Phase 1 (util)
   ├── Phase 2 (Settings UI)
   ├── Phase 3 (ai-sessions gating)
   └── Phase 4 (shell menu gating)
Phase 5 (verification) — after 2, 3, 4
```

## Complexity

S overall (4 phases S/S/M/M + S verification) — single agent, no phase individually warrants a sub-agent.

## Next Step

Run **`bsdd start`** (or **`bsdd run`**) on `.specs/tasks/ai-client-enable-toggle.md` to begin implementation.
