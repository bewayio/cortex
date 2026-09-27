import type * as MonacoNS from 'monaco-editor'
import { useEditorStore } from '../stores/editorStore'

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
  monaco.editor.addKeybindingRules([
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyCode.Tab, command: 'bcode.cycleTabNext' },
    { keybinding: monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Tab, command: 'bcode.cycleTabPrev' },
  ])
}
