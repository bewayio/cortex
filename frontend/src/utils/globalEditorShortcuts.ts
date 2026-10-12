import type * as MonacoNS from 'monaco-editor'
import { useEditorStore } from '../stores/editorStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { triggerNewItemShortcut } from './newItemShortcut'

let registered = false

// Monaco's own keybinding service intercepts Tab/Shift+Tab (indent/outdent)
// inside its text area before the key event ever reaches the window-level
// keydown handler in App.tsx — the same class of bug already documented for
// the SQL Run shortcut (see .specs/modules/database.md: "a plain DOM
// listener does not reliably see the key, since Monaco consumes it first").
// A global Monaco keybinding rule is the fix: it's registered once, applies
// to every editor instance (current and future), and runs through Monaco's
// own dispatch instead of racing it. The window-level listener in App.tsx
// stays as-is for when focus is outside any editor (sidebar, terminal, etc).
export function registerGlobalEditorShortcuts(monaco: typeof MonacoNS) {
  if (registered) return
  registered = true

  monaco.editor.registerCommand('bcode.cycleTabNext', () => {
    useEditorStore.getState().cycleTab(1)
  })
  monaco.editor.registerCommand('bcode.cycleTabPrev', () => {
    useEditorStore.getState().cycleTab(-1)
  })
  // Mesmo motivo do Ctrl/Cmd+Tab acima: o atalho do project switcher
  // (App.tsx) nunca chegava com o foco dentro do Monaco — Ctrl/Cmd+↑/↓
  // intercepta antes de borbulhar. Só a parte de abrir/mover o destaque
  // precisa do caminho duplicado aqui; confirmar (soltar o modificador) é
  // um keyup sem combinação, que não é uma keybinding do Monaco e já chega
  // normal no listener de window em App.tsx.
  monaco.editor.registerCommand('bcode.projectSwitcherNext', () => {
    useWorkspaceStore.getState().cycleProjectSwitcher(1)
  })
  monaco.editor.registerCommand('bcode.projectSwitcherPrev', () => {
    useWorkspaceStore.getState().cycleProjectSwitcher(-1)
  })
  // Idem: Ctrl/Cmd+N e Ctrl/Cmd+Shift+N (novo arquivo/pasta ou nova
  // conexão/pasta, dependendo do painel ativo — ver newItemShortcut.ts e
  // App.tsx) também nunca chegavam com o foco dentro do Monaco.
  monaco.editor.registerCommand('bcode.newItem', () => {
    triggerNewItemShortcut(false)
  })
  monaco.editor.registerCommand('bcode.newItemFolder', () => {
    triggerNewItemShortcut(true)
  })
  monaco.editor.addKeybindingRules([
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, command: 'bcode.cycleTabNext' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, command: 'bcode.cycleTabPrev' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.DownArrow, command: 'bcode.projectSwitcherNext' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.UpArrow, command: 'bcode.projectSwitcherPrev' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyN, command: 'bcode.newItem' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyN, command: 'bcode.newItemFolder' },
  ])
}
