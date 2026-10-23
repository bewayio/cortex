import React, { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/runtime/runtime'
import { usePlatform } from '../utils/platform'
import MenuDropdown, { type MenuItem } from './MenuDropdown'
import { AI_ENGINE_LABEL, type AiEngine } from '../utils/aiEngines'
import type { Dock } from '../utils/dock'

interface Props {
  // Botão direto (sem dropdown) — ver .specs/tasks/window-menu-and-settings-modal.md.
  onOpenSettings: () => void
  // Menus "Terminal" e "Chats com IA" — ver
  // .specs/tasks/system-menu-terminal-and-ai-chats.md. Botões customizados em
  // vez de menu nativo do SO, pra manter a aparência igual em todo sistema
  // (ADR-0007), mesma decisão já tomada pro botão de Configurações, 2026-10-12.
  onNewTerminal: () => void
  getTerminalTabs: () => Array<{ id: string; title: string; dock: Dock; engine?: AiEngine; lastUsedAt?: number }>
  onFocusTerminal: (id: string) => void
  installedAiEngines: AiEngine[]
  onNewAiChat: (engine: AiEngine) => void
}

// One title bar for all systems (ADR-0007).
// macOS: native traffic lights sit in the left inset, no window buttons drawn here.
// Linux and Windows: frameless window, buttons drawn on the right.
export default function TitleBar({
  onOpenSettings, onNewTerminal, getTerminalTabs, onFocusTerminal, installedAiEngines, onNewAiChat,
}: Props) {
  const { t } = useTranslation('shell')
  const platform = usePlatform()
  const showButtons = platform === 'linux' || platform === 'windows'
  const [maximised, setMaximised] = useState(false)

  // Recalculado a cada abertura do dropdown (MenuDropdown's own render),
  // não espelhado num segundo estado aqui — Terminal.tsx continua sendo a
  // única fonte de verdade da lista de abas.
  const terminalTabs = getTerminalTabs()
  const terminalMenuItems: MenuItem[] = [
    { id: 'new-terminal', type: 'action', label: t('menuBar.newTerminal'), onClick: onNewTerminal },
    ...(terminalTabs.length > 0 ? [
      { id: 'sep', type: 'separator' } as MenuItem,
      ...terminalTabs.map((tab): MenuItem => ({
        id: tab.id, type: 'action', label: tab.title, onClick: () => onFocusTerminal(tab.id),
      })),
    ] : []),
  ]

  // Com 1 engine só, "Chats com IA" não existe como dropdown — vira um botão
  // direto "Abrir chat" (1 clique, mesmo nível/estilo da engrenagem), sem
  // lista de chats abertos ali (não há onde mostrar sem reabrir um dropdown,
  // trade-off confirmado com o usuário, 2026-10-18 — a lista de chats de IA
  // continua acessível pelo menu Terminal, que já lista toda aba inclusive
  // as de IA). Com 2+ engines, dropdown "Chats com IA" com 2 níveis no
  // total (raiz do dropdown + itens) — cada engine já é um item de ação
  // direto (Claude, Codex…), sem um submenu "Nova sessão" no meio. **Fix
  // 2026-10-21, pedido do usuário**: a versão anterior tinha um submenu
  // "Nova sessão" aninhado, criando 3 níveis (Chats com IA > Nova sessão >
  // engine) quando só 2 eram esperados.
  const aiTabs = terminalTabs.filter(tab => tab.engine)
  // Texto do item de abertura traz o nome da engine ("Abrir Claude Chat"),
  // não um rótulo genérico — pedido do usuário, 2026-10-21. Abas já abertas
  // mostram quando tiveram o último uso (input do usuário ou foco), mesmo
  // formato de data/hora já usado em AiSessionsPanel.tsx.
  const formatLastUsed = (ts?: number) => ts
    ? new Date(ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
    : undefined
  const aiMenuItems: MenuItem[] = [
    ...installedAiEngines.map((engine): MenuItem => ({
      id: `new-${engine}`, type: 'action',
      label: t('menuBar.openEngineChat', { engine: AI_ENGINE_LABEL[engine] }),
      onClick: () => onNewAiChat(engine),
    })),
    ...(aiTabs.length > 0 ? [
      { id: 'sep', type: 'separator' } as MenuItem,
      ...aiTabs.map((tab): MenuItem => {
        const lastUsed = formatLastUsed(tab.lastUsedAt)
        return {
          id: tab.id, type: 'action',
          label: lastUsed ? t('menuBar.aiTabLastUsed', { title: tab.title, lastUsed }) : tab.title,
          onClick: () => onFocusTerminal(tab.id),
        }
      }),
    ] : []),
  ]

  useEffect(() => {
    if (!showButtons) return
    let alive = true
    const sync = () => {
      WindowIsMaximised().then(v => { if (alive) setMaximised(v) }).catch(() => {})
    }
    sync()
    window.addEventListener('resize', sync)
    return () => { alive = false; window.removeEventListener('resize', sync) }
  }, [showButtons])

  return (
    <div className="app-titlebar" onDoubleClick={() => WindowToggleMaximise()}>
      <div className="app-titlebar-menu" onDoubleClick={e => e.stopPropagation()}>
        <button
          className="app-titlebar-btn"
          title={t('settings.title')}
          aria-label={t('settings.title')}
          onClick={onOpenSettings}
        >
          <Settings size={14} />
        </button>
        <MenuDropdown label={t('menuBar.terminal')} items={terminalMenuItems} />
        {installedAiEngines.length === 1 && (
          <button
            className="app-titlebar-menu-btn"
            onClick={() => onNewAiChat(installedAiEngines[0])}
          >
            {t('menuBar.openEngineChat', { engine: AI_ENGINE_LABEL[installedAiEngines[0]] })}
          </button>
        )}
        {installedAiEngines.length > 1 && (
          <MenuDropdown label={t('menuBar.aiChats')} items={aiMenuItems} />
        )}
      </div>
      <span className="app-titlebar-title">Cortex</span>
      {showButtons && (
        <div className="app-titlebar-controls" onDoubleClick={e => e.stopPropagation()}>
          <button className="app-titlebar-btn" title={t('titleBar.minimize')} aria-label={t('titleBar.minimize')} onClick={() => WindowMinimise()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
          <button
            className="app-titlebar-btn"
            title={maximised ? t('titleBar.restore') : t('titleBar.maximize')}
            aria-label={maximised ? t('titleBar.restore') : t('titleBar.maximize')}
            onClick={() => WindowToggleMaximise()}
          >
            {maximised ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="2.5" width="7" height="7" />
                <path d="M2.5 2.5v-2h7v7h-2" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1">
                <rect x="0.5" y="0.5" width="9" height="9" />
              </svg>
            )}
          </button>
          <button className="app-titlebar-btn app-titlebar-close" title={t('titleBar.close')} aria-label={t('titleBar.close')} onClick={() => Quit()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
