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

interface Props {
  // Só uma entrada hoje ("Configurações") — sem dropdown intermediário, ver
  // .specs/tasks/window-menu-and-settings-modal.md. Botão customizado em vez
  // de menu nativo do SO, pra manter a aparência igual em todo sistema
  // (ADR-0007), 2026-10-12.
  onOpenSettings: () => void
}

// One title bar for all systems (ADR-0007).
// macOS: native traffic lights sit in the left inset, no window buttons drawn here.
// Linux and Windows: frameless window, buttons drawn on the right.
export default function TitleBar({ onOpenSettings }: Props) {
  const { t } = useTranslation('shell')
  const platform = usePlatform()
  const showButtons = platform === 'linux' || platform === 'windows'
  const [maximised, setMaximised] = useState(false)

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
      <button
        className="app-titlebar-btn app-titlebar-menu"
        title={t('settings.title')}
        aria-label={t('settings.title')}
        onClick={onOpenSettings}
      >
        <Settings size={14} />
      </button>
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
