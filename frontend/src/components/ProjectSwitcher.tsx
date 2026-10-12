import React from 'react'
import { FolderOpen } from 'lucide-react'
import { Workspace } from '../types'

interface Props {
  projects: Workspace[]
  highlightedIndex: number
  onSelect: (ws: Workspace) => void
}

// App-switcher-style overlay (macOS Cmd+Tab / Ubuntu Alt+Tab in spirit) for
// cycling "Open projects" via Ctrl/Cmd+↑/↓ — one implementation, same look
// on every OS, not a native per-OS switcher. App.tsx owns the hold/release
// keyboard logic; this component only renders the current state.
export default function ProjectSwitcher({ projects, highlightedIndex, onSelect }: Props) {
  return (
    <div className="project-switcher-overlay">
      <div className="project-switcher-card">
        {projects.map((ws, idx) => (
          <div
            key={ws.id}
            className={`project-switcher-row ${idx === highlightedIndex ? 'highlighted' : ''}`}
            onClick={() => onSelect(ws)}
          >
            <FolderOpen size={14} style={{ color: '#e5c07b', flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="project-switcher-row-name">{ws.name}</div>
              <div className="project-switcher-row-path">{ws.path}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
