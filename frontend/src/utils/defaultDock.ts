// Preset de dock padrão pra um terminal/chat NOVO — decide só onde uma aba
// nasce, nunca move abas já abertas (arrastar manual continua funcionando
// normalmente). Mesmo padrão de leitura/escrita do i18n.ts (localStorage +
// getter/setter simples, sem reload). Ver
// .specs/tasks/settings-default-terminal-chat-location.md.
import type { Dock } from './dock'

export type DefaultDockPreset = 'terminal-bottom-chat-right' | 'terminal-right-chat-bottom'

const STORAGE_KEY = 'bcode.defaultDockPreset'
const DEFAULT_PRESET: DefaultDockPreset = 'terminal-bottom-chat-right'

function isValidPreset(v: string | null): v is DefaultDockPreset {
  return v === 'terminal-bottom-chat-right' || v === 'terminal-right-chat-bottom'
}

export function getDefaultDockPreset(): DefaultDockPreset {
  const saved = localStorage.getItem(STORAGE_KEY)
  return isValidPreset(saved) ? saved : DEFAULT_PRESET
}

export function setDefaultDockPreset(preset: DefaultDockPreset) {
  localStorage.setItem(STORAGE_KEY, preset)
}

export function getDefaultTerminalDock(): Dock {
  return getDefaultDockPreset() === 'terminal-bottom-chat-right' ? 'bottom' : 'right'
}

export function getDefaultChatDock(): Dock {
  return getDefaultDockPreset() === 'terminal-bottom-chat-right' ? 'right' : 'bottom'
}
