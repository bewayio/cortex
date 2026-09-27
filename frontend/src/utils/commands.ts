export interface Command {
  id: string
  label: string
  run: () => void
}

export interface CommandContext {
  onNewTerminal: () => void
  onNewQuery: () => void
  onOpenFolder: () => void
  onGoToFile: () => void
  onTogglePanel: (panel: 'explorer' | 'git' | 'database') => void
  onGoHome: () => void
  onCloseTab: () => void
  onCloseAllTabs: () => void
}

// Small, flat registry — extend here as new commands are added, no other
// file needs to change (CommandPalette.tsx just filters/renders this list).
export function buildCommands(ctx: CommandContext): Command[] {
  return [
    { id: 'new-terminal', label: 'New Terminal', run: ctx.onNewTerminal },
    { id: 'new-query', label: 'New Query', run: ctx.onNewQuery },
    { id: 'open-folder', label: 'Open Folder', run: ctx.onOpenFolder },
    { id: 'go-to-file', label: 'Go to File', run: ctx.onGoToFile },
    { id: 'toggle-explorer', label: 'Toggle Explorer Panel', run: () => ctx.onTogglePanel('explorer') },
    { id: 'toggle-git', label: 'Toggle Git Panel', run: () => ctx.onTogglePanel('git') },
    { id: 'toggle-database', label: 'Toggle Database Panel', run: () => ctx.onTogglePanel('database') },
    { id: 'go-home', label: 'Go Home', run: ctx.onGoHome },
    { id: 'close-tab', label: 'Close Tab', run: ctx.onCloseTab },
    { id: 'close-all-tabs', label: 'Close All Tabs', run: ctx.onCloseAllTabs },
  ]
}
