import React, { useState, useRef } from 'react'
import { X, Code, Eye, GitBranch, Home, Database } from 'lucide-react'
import { useEditorStore } from '../stores/editorStore'
import { EditorTab } from '../types'

function getTabIcon(tab: EditorTab) {
  if (tab.isUsageTab) return <Home size={13} style={{ color: 'var(--accent)' }} />
  if (tab.isQueryTab) return <Database size={13} style={{ color: 'var(--accent)' }} />
  if (tab.isCommitTab || tab.isGraphTab) return <GitBranch size={13} style={{ color: 'var(--accent)' }} />
  const color = getExtColor(tab.ext.toLowerCase())
  return <Code size={13} style={{ color }} />
}

function getExtColor(ext: string): string {
  if (['ts','tsx'].includes(ext)) return '#61afef'
  if (['js','jsx'].includes(ext)) return '#e5c07b'
  if (ext === 'go')               return '#79c0ff'
  if (ext === 'py')               return '#ffd700'
  if (ext === 'rs')               return '#e8834d'
  if (ext === 'swift')            return '#e06c75'
  if (ext === 'md')               return '#98c379'
  if (['json','yaml','yml'].includes(ext)) return '#e5c07b'
  return '#858585'
}

export default function EditorTabBar() {
  const {
    tabs, activeTabId, setActiveTab, closeTab,
    closeOtherTabs, closeAllTabs, reorderTabs, renameTab,
    viewMode, setViewMode, getActiveTab,
  } = useEditorStore()

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  // dragFromIdx: aba sendo arrastada; dropGap: índice do gap (0=antes da 1ª, n=após a última)
  const [dragFromIdx,  setDragFromIdx]  = useState<number | null>(null)
  const [dropGap,      setDropGap]      = useState<number | null>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // Renomear aba — só para abas de query (mesmo espírito do rename de aba de terminal)
  const [renamingId,   setRenamingId]   = useState<string | null>(null)
  const [renameValue,  setRenameValue]  = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const activeTab = getActiveTab()
  const showModeButtons = activeTab && !activeTab.isCommitTab && !activeTab.isGraphTab && !activeTab.isUsageTab && !activeTab.isQueryTab
  const isMarkdown = activeTab?.ext === 'md'

  const startRename = (tab: EditorTab, e: React.MouseEvent) => {
    if (!tab.isQueryTab) return
    e.stopPropagation()
    setRenamingId(tab.id)
    setRenameValue(tab.name)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }
  const commitRename = (id: string) => {
    const name = renameValue.trim()
    if (name) renameTab(id, name)
    setRenamingId(null)
  }

  const handleTabMouseDown = (e: React.MouseEvent, fromIdx: number) => {
    if (e.button !== 0) return
    // Home é fixa, sempre a primeira — não pode ser arrastada nem receber
    // outra aba solta antes dela (pedido do usuário, 2026-09-27).
    if (tabs[fromIdx]?.isUsageTab) return
    const homePinned = tabs[0]?.isUsageTab
    const minGap = homePinned ? 1 : 0
    e.preventDefault()
    const startX = e.clientX
    let moved = false
    let curGap = fromIdx

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5) return
      moved = true
      const container = tabsContainerRef.current
      if (!container) return
      const children = Array.from(container.children) as HTMLElement[]
      // Filtra apenas as abas reais (exclui indicadores .tab-drop-indicator)
      const tabEls = children.filter(c => c.classList.contains('tab')) as HTMLElement[]
      curGap = tabEls.length
      for (let i = 0; i < tabEls.length; i++) {
        const r = tabEls[i].getBoundingClientRect()
        if (ev.clientX < r.left + r.width / 2) { curGap = i; break }
      }
      curGap = Math.max(curGap, minGap)
      setDragFromIdx(fromIdx)
      setDropGap(curGap)
    }

    const onUp = () => {
      if (moved && curGap !== fromIdx && curGap !== fromIdx + 1) {
        const toIdx = curGap > fromIdx ? curGap - 1 : curGap
        reorderTabs(fromIdx, toIdx)
      }
      setDragFromIdx(null)
      setDropGap(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const handleContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, tabId })
  }

  const handleCopyPath = () => {
    const tab = tabs.find(t => t.id === contextMenu?.tabId)
    if (tab) navigator.clipboard.writeText(tab.path)
    setContextMenu(null)
  }

  return (
    <div className="tab-bar">
      <div className="tab-bar-tabs" ref={tabsContainerRef} style={{ userSelect: dragFromIdx !== null ? 'none' : undefined }}>
        {tabs.map((tab, idx) => (
          <React.Fragment key={tab.id}>
            {/* Linha indicadora de destino antes desta aba */}
            {dropGap === idx && dragFromIdx !== idx && dragFromIdx !== idx - 1 && (
              <div className="tab-drop-indicator" />
            )}
            <div
              className={`tab ${tab.isUsageTab ? 'tab-icon-only' : ''} ${activeTabId === tab.id ? 'active' : ''} ${dragFromIdx === idx ? 'dragging' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onMouseDown={(e) => handleTabMouseDown(e, idx)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              title={tab.isCommitTab ? `Commit ${tab.commitHash ?? ''}` : tab.isUsageTab || tab.isGraphTab || tab.isQueryTab ? tab.name : tab.path}
              style={{ cursor: dragFromIdx !== null ? 'grabbing' : 'grab' }}
            >
              <span className="tab-icon">{getTabIcon(tab)}</span>
              {renamingId === tab.id ? (
                <input
                  ref={renameInputRef}
                  className="terminal-tab-rename"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(tab.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { e.preventDefault(); commitRename(tab.id) }
                    if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null) }
                  }}
                  onClick={e => e.stopPropagation()}
                  onMouseDown={e => e.stopPropagation()}
                  style={{ width: Math.max(60, renameValue.length * 8) }}
                />
              ) : (
                // Home é ícone só, sem rótulo — pedido do usuário (2026-09-27).
                !tab.isUsageTab && (
                  <span className="tab-name" onDoubleClick={e => startRename(tab, e)}>{tab.name}</span>
                )
              )}
              {tab.isModified && <span className="tab-modified">●</span>}
              <button
                className="tab-close"
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Close"
              >
                <X size={12} />
              </button>
            </div>
          </React.Fragment>
        ))}
        {/* Linha indicadora após a última aba */}
        {dropGap === tabs.length && dragFromIdx !== tabs.length - 1 && (
          <div className="tab-drop-indicator" />
        )}
      </div>

      {showModeButtons && (
        <div className="tab-mode-buttons">
          <button
            className={`tab-mode-btn ${viewMode === 'code' || (viewMode === 'preview' && !isMarkdown) ? 'active' : ''}`}
            title="Code (⌘+1)"
            onClick={() => setViewMode('code')}
          >
            <Code size={15} />
          </button>
          {isMarkdown && (
            <button
              className={`tab-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              title="Preview"
              onClick={() => setViewMode('preview')}
            >
              <Eye size={15} />
            </button>
          )}
          <button
            className={`tab-mode-btn ${viewMode === 'diff' ? 'active' : ''}`}
            title="Diff (⌘+2)"
            onClick={() => setViewMode('diff')}
          >
            <GitBranch size={15} />
          </button>
        </div>
      )}

      {contextMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            <div className="context-menu-item" onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null) }}>Close</div>
            <div className="context-menu-item" onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null) }}>Close Others</div>
            <div className="context-menu-item" onClick={() => { closeAllTabs(); setContextMenu(null) }}>Close All</div>
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={handleCopyPath}>Copy Path</div>
          </div>
        </>
      )}
    </div>
  )
}
