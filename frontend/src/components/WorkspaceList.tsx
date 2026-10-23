import React, { useRef, useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { OpenDirectoryDialog, ReorderRecentWorkspaces } from '../../wailsjs/go/main/App'
import type { Workspace } from '../types'

interface Props {
  onOpenWorkspace: (path: string) => void
  // Fecha ("open") ou remove permanentemente ("everOpened") um workspace —
  // mata os terminais dele e chama o backend certo (CloseWorkspace/
  // RemoveWorkspace); App.tsx é quem decide qual, já que só ele tem acesso
  // ao terminalActionsRef e ao currentWorkspace pra navegação. Ver
  // .specs/tasks/terminal-process-cleanup.md. Opcional: 'everOpened' sem
  // callback (não deveria acontecer, mas não quebra — só não remove nada).
  onCloseWorkspace?: (ws: Workspace) => void
  onRemoveWorkspace?: (ws: Workspace) => void
  // 'open' (default): "Open projects", capped 8, above the file explorer.
  // 'everOpened': "Ever opened", capped 15, on the Home tab. Same component,
  // different data source and label — see .specs/modules/workspace.md.
  source?: 'open' | 'everOpened'
}

export default function WorkspaceList({ onOpenWorkspace, onCloseWorkspace, onRemoveWorkspace, source = 'open' }: Props) {
  const { t } = useTranslation('shell')
  const {
    recentWorkspaces, setRecentWorkspaces,
    everOpenedWorkspaces,
    currentWorkspace,
  } = useWorkspaceStore()
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null)
  // Arrastar pra reordenar — só em "Open projects" (sidebar). "Ever opened"
  // (Home) continua uma lista de histórico, mais-recente-primeiro, sem
  // reordenação manual. Mesma convenção de arrasto por mouse usada em
  // EditorTabBar.tsx/Terminal.tsx (não HTML5 DnD).
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dropGap,     setDropGap]     = useState<number | null>(null)
  const listContainerRef = useRef<HTMLDivElement>(null)

  const list = source === 'everOpened' ? everOpenedWorkspaces : recentWorkspaces
  const label = source === 'everOpened' ? t('workspaceList.everOpened') : t('workspaceList.openProjects')

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

  const handleItemMouseDown = (e: React.MouseEvent, fromIdx: number) => {
    if (source !== 'open' || e.button !== 0) return
    e.preventDefault()
    const startY = e.clientY
    let moved = false
    let curGap = fromIdx

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < 5) return
      moved = true
      const container = listContainerRef.current
      if (!container) return
      const items = Array.from(container.children).filter(c => c.classList.contains('workspace-item')) as HTMLElement[]
      curGap = items.length
      for (let i = 0; i < items.length; i++) {
        const r = items[i].getBoundingClientRect()
        if (ev.clientY < r.top + r.height / 2) { curGap = i; break }
      }
      setDragFromIdx(fromIdx)
      setDropGap(curGap)
    }

    const onUp = () => {
      if (moved && curGap !== fromIdx && curGap !== fromIdx + 1) {
        const toIdx = curGap > fromIdx ? curGap - 1 : curGap
        const reordered = [...recentWorkspaces]
        const [w] = reordered.splice(fromIdx, 1)
        reordered.splice(toIdx, 0, w)
        setRecentWorkspaces(reordered)
        ReorderRecentWorkspaces(reordered.map(w => w.id)).catch(console.error)
      }
      setDragFromIdx(null)
      setDropGap(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Em "Open projects" (sidebar), remover só tira da lista rápida — o
  // histórico em "Ever opened" continua intacto. Em "Ever opened" (Home),
  // remover é esquecer o projeto de vez, então some das duas listas.
  // Antes as duas ações usavam RemoveWorkspace (as duas listas juntas), o
  // que fazia "fechar" um projeto rápido apagar ele do histórico também —
  // bug relatado pelo usuário (2026-09-27): parecia que as duas listas eram
  // uma coisa só.
  const handleRemove = async (id: string) => {
    const ws = list.find(w => w.id === id)
    setContextMenu(null)
    if (!ws) return
    try {
      if (source === 'everOpened') await onRemoveWorkspace?.(ws)
      else await onCloseWorkspace?.(ws)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div className="workspace-list">
      {source === 'open' && (
        <button className="workspace-open-btn" onClick={handleOpen}>
          <FolderOpen size={14} />
          {t('workspaceList.openFolder')}
        </button>
      )}

      {list.length > 0 && (
        <>
          <div className="section-label">{label}</div>
          {source === 'everOpened' && (
            <div className="section-sublabel">{t('workspaceList.everOpenedSublabel')}</div>
          )}
          <div ref={listContainerRef} style={{ userSelect: dragFromIdx !== null ? 'none' : undefined }}>
            {list.map((ws, idx) => (
              <React.Fragment key={ws.id}>
                {dropGap === idx && dragFromIdx !== idx && dragFromIdx !== idx - 1 && (
                  <div className="workspace-drop-indicator" />
                )}
                <div
                  className={`workspace-item ${currentWorkspace?.path === ws.path ? 'active' : ''} ${dragFromIdx === idx ? 'dragging' : ''}`}
                  onClick={() => handleSelect(ws.path)}
                  onMouseDown={(e) => handleItemMouseDown(e, idx)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    setContextMenu({ x: e.clientX, y: e.clientY, id: ws.id })
                  }}
                  style={source === 'open' ? { cursor: dragFromIdx !== null ? 'grabbing' : 'grab' } : undefined}
                >
                  <FolderOpen size={13} style={{ color: '#e5c07b', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="workspace-item-name">{ws.name}</div>
                    <div className="workspace-item-path">{ws.path}</div>
                  </div>
                  <button
                    className="workspace-remove-btn"
                    onClick={(e) => { e.stopPropagation(); handleRemove(ws.id) }}
                    onMouseDown={(e) => e.stopPropagation()}
                    title={source === 'everOpened' ? t('workspaceList.removeFromHistory') : t('workspaceList.closeKeepHistory')}
                  >
                    <X size={12} />
                  </button>
                </div>
              </React.Fragment>
            ))}
            {dropGap === list.length && dragFromIdx !== list.length - 1 && (
              <div className="workspace-drop-indicator" />
            )}
          </div>
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
              <X size={14} /> {source === 'everOpened' ? t('workspaceList.removeFromHistoryShort') : t('common:close')}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
