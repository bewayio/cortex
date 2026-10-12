import i18n from '../i18n'

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
  const t = i18n.t.bind(i18n)
  return [
    { id: 'new-terminal', label: t('commandPalette:commands.newTerminal'), run: ctx.onNewTerminal },
    { id: 'new-query', label: t('commandPalette:commands.newQuery'), run: ctx.onNewQuery },
    { id: 'open-folder', label: t('commandPalette:commands.openFolder'), run: ctx.onOpenFolder },
    { id: 'go-to-file', label: t('commandPalette:commands.goToFile'), run: ctx.onGoToFile },
    { id: 'toggle-explorer', label: t('commandPalette:commands.toggleExplorer'), run: () => ctx.onTogglePanel('explorer') },
    { id: 'toggle-git', label: t('commandPalette:commands.toggleGit'), run: () => ctx.onTogglePanel('git') },
    { id: 'toggle-database', label: t('commandPalette:commands.toggleDatabase'), run: () => ctx.onTogglePanel('database') },
    { id: 'go-home', label: t('commandPalette:commands.goHome'), run: ctx.onGoHome },
    { id: 'close-tab', label: t('commandPalette:commands.closeTab'), run: ctx.onCloseTab },
    { id: 'close-all-tabs', label: t('commandPalette:commands.closeAllTabs'), run: ctx.onCloseAllTabs },
  ]
}
