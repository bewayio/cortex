import React, { useEffect, useState } from 'react'
import {
  Quit,
  WindowIsMaximised,
  WindowMinimise,
  WindowToggleMaximise,
} from '../../wailsjs/runtime/runtime'
import { usePlatform } from '../utils/platform'

// One title bar for all systems (ADR-0007).
// macOS: native traffic lights sit in the left inset, no window buttons drawn here.
// Linux and Windows: frameless window, buttons drawn on the right.
export default function TitleBar() {
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
      <span className="app-titlebar-title">BCode</span>
      {showButtons && (
        <div className="app-titlebar-controls" onDoubleClick={e => e.stopPropagation()}>
          <button className="app-titlebar-btn" title="Minimizar" aria-label="Minimizar" onClick={() => WindowMinimise()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 5h10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
          <button
            className="app-titlebar-btn"
            title={maximised ? 'Restaurar' : 'Maximizar'}
            aria-label={maximised ? 'Restaurar' : 'Maximizar'}
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
          <button className="app-titlebar-btn app-titlebar-close" title="Fechar" aria-label="Fechar" onClick={() => Quit()}>
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M0 0l10 10M10 0L0 10" stroke="currentColor" strokeWidth="1" fill="none" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
