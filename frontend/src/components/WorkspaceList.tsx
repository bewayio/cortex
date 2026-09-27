import React, { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useWorkspaceStore } from '../stores/workspaceStore'
import {
  OpenDirectoryDialog, RemoveWorkspace, CloseWorkspace,
  GetRecentWorkspaces, GetEverOpenedWorkspaces,
} from '../../wailsjs/go/main/App'

interface Props {
  onOpenWorkspace: (path: string) => void
  // 'open' (default): "Open projects", capped 8, above the file explorer.
  // 'everOpened': "Ever opened", capped 15, on the Home tab. Same component,
  // different data source and label — see .specs/modules/workspace.md.
  source?: 'open' | 'everOpened'
}

export default function WorkspaceList({ onOpenWorkspace, source = 'open' }: Props) {
  const {
    recentWorkspaces, setRecentWorkspaces,
    everOpenedWorkspaces, setEverOpenedWorkspaces,
    currentWorkspace,
  } = useWorkspaceStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)

  const list = source === 'everOpened' ? everOpenedWorkspaces : recentWorkspaces
  const label = source === 'everOpened' ? 'Ever Opened' : 'Open Projects'

  const refreshLists = async () => {
    const [recent, everOpened] = await Promise.all([
      GetRecentWorkspaces().catch(() => []),
      GetEverOpenedWorkspaces().catch(() => []),
    ])
    setRecentWorkspaces(recent)
    setEverOpenedWorkspaces(everOpened)
  }

  const handleOpen = async () => {
    try {
      const dir = await OpenDirectoryDialog()
      if (dir) onOpenWorkspace(dir)
    } catch (err) {
      console.error(err)
    }
  }

  const handleSelect = async (path: string) => {
    onOpenWorkspace(path)
  }

  // Em "Open projects" (sidebar), remover só tira da lista rápida — o
  // histórico em "Ever opened" continua intacto. Em "Ever opened" (Home),
  // remover é esquecer o projeto de vez, então some das duas listas.
  // Antes as duas ações usavam RemoveWorkspace (as duas listas juntas), o
  // que fazia "fechar" um projeto rápido apagar ele do histórico também —
  // bug relatado pelo usuário (2026-09-27): parecia que as duas listas eram
  // uma coisa só.
  const handleRemove = async (id: string) => {
    try {
      if (source === 'everOpened') await RemoveWorkspace(id)
      else await CloseWorkspace(id)
      await refreshLists()
    } catch (err) {
      console.error(err)
    }
    setContextMenu(null)
  }

  return (
    <div className="workspace-list">
      {source === 'open' && (
        <button className="workspace-open-btn" onClick={handleOpen}>
          <FolderOpen size={14} />
          Open Folder…
        </button>
      )}

      {list.length > 0 && (
        <>
          <div className="section-label">{label}</div>
          {source === 'everOpened' && (
            <div className="section-sublabel">Projects you've opened recently — click to reopen</div>
          )}
          {list.map(ws => (
            <div
              key={ws.id}
              className={`workspace-item ${currentWorkspace?.path === ws.path ? 'active' : ''}`}
              onClick={() => handleSelect(ws.path)}
              onContextMenu={(e) => {
                e.preventDefault()
                setContextMenu({ x: e.clientX, y: e.clientY, id: ws.id })
              }}
            >
              <FolderOpen size={13} style={{ color: '#e5c07b', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="workspace-item-name">{ws.name}</div>
                <div className="workspace-item-path">{ws.path}</div>
              </div>
              <button
                className="workspace-remove-btn"
                onClick={(e) => { e.stopPropagation(); handleRemove(ws.id) }}
                title={source === 'everOpened' ? 'Remove from history permanently' : 'Close (stays in Ever Opened history)'}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </>
      )}

      {contextMenu && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setContextMenu(null)}
          />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x, zIndex: 9999 }}>
            <div className="context-menu-item danger" onClick={() => handleRemove(contextMenu.id)}>
              <X size={14} /> {source === 'everOpened' ? 'Remove from history' : 'Close'}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
