// Per-engine enable/disable preference for AI clients (Claude/Codex/future
// engines), consulted by the AI Sessions panel (discovery + new-session
// buttons) and the shell's "Chats com IA" menu, on top of (not instead of)
// whether the engine is actually installed. Same localStorage, no-reload
// pattern as defaultDock.ts. See
// .specs/tasks/ai-client-enable-toggle.md.
import type { AiEngine } from './aiEngines'

const STORAGE_KEY = 'bcode.aiClientEnabled'
// localStorage's own `storage` event only fires in OTHER windows/tabs, never
// the one that made the change — Settings and the panels that react to it
// (AiSessionsPanel, App.tsx's menu wiring) live in the same window, so a
// custom event is needed for same-tab live updates.
const CHANGE_EVENT = 'ai-client-settings-changed'

function readStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

// No saved entry for an engine (first run, or a future engine added to the
// registry after the user already saved a config) defaults to enabled.
export function isAiEngineEnabled(engine: AiEngine): boolean {
  const store = readStore()
  return store[engine] !== false
}

export function setAiEngineEnabled(engine: AiEngine, enabled: boolean) {
  const store = readStore()
  store[engine] = enabled
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function getEnabledAiEngines(candidates: AiEngine[]): AiEngine[] {
  return candidates.filter(isAiEngineEnabled)
}

// Subscribe to live changes made via setAiEngineEnabled, anywhere in this
// window (e.g. Settings toggled while the AI Sessions panel or the "Chats
// com IA" menu is already mounted). Returns an unsubscribe function.
export function onAiClientSettingsChanged(callback: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, callback)
  return () => window.removeEventListener(CHANGE_EVENT, callback)
}
