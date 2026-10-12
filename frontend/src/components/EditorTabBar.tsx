import React, { useState, useRef } from 'react'
import { X, Code, Eye, GitBranch, Home, Database, Table2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEditorStore } from '../stores/editorStore'
import { EditorTab } from '../types'

function getTabIcon(tab: EditorTab) {
  if (tab.isUsageTab) return <Home size={13} style={{ color: 'var(--accent)' }} />
  if (tab.isQueryTab) return <Database size={13} style={{ color: 'var(--accent)' }} />
  if (tab.isTableTab) return <Table2 size={13} style={{ color: 'var(--accent)' }} />
  if (tab.isDbTablesTab) return <Database size={13} style={{ color: 'var(--accent)' }} />
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

type TabGroup = 'pinned' | 'scroll'

export default function EditorTabBar() {
  const { t } = useTranslation('editor')
  const {
    tabs, globalTabs, activeTabId, setActiveTab, closeTab,
    closeOtherTabs, closeAllTabs, reorderTabs, renameTab, setPinned,
    viewMode, setViewMode, getActiveTab,
  } = useEditorStore()

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; tabId: string } | null>(null)
  // `tabs` mantém as fixadas como prefixo contíguo (garantido por
  // setPinned) — dá pra fatiar em vez de guardar índice real em cada aba.
  const pinnedTabs = tabs.filter(t => t.pinned)
  const scrollTabs = tabs.filter(t => !t.pinned)

  // Arrastar não cruza o grupo fixado/rolável (só Pin/Unpin move entre eles)
  // — por isso o gap do drop é sempre um índice LOCAL ao próprio grupo, não
  // ao array `tabs` inteiro.
  const [drag, setDrag] = useState<{ group: TabGroup; fromIdx: number; gap: number | null } | null>(null)
  const pinnedContainerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // Renomear aba — só para abas de query (mesmo espírito do rename de aba de terminal)
  const [renamingId,   setRenamingId]   = useState<string | null>(null)
  const [renameValue,  setRenameValue]  = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  const activeTab = getActiveTab()
  const showModeButtons = activeTab && !activeTab.isCommitTab && !activeTab.isGraphTab && !activeTab.isUsageTab && !activeTab.isQueryTab
    && !activeTab.isTableTab && !activeTab.isDbTablesTab
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

  // `fromIdx`/toIdx são locais ao grupo (pinned ou scroll); convertidos pro
  // índice real em `tabs` só na hora de chamar reorderTabs, somando o offset
  // do grupo scroll (pinnedTabs.length não muda num reorder intra-grupo).
  const handleTabMouseDown = (e: React.MouseEvent, fromIdx: number, group: TabGroup) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    let moved = false
    let curGap = fromIdx
    const containerRef = group === 'pinned' ? pinnedContainerRef : scrollContainerRef

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5) return
      moved = true
      const container = containerRef.current
      if (!container) return
      const children = Array.from(container.children) as HTMLElement[]
      // Filtra apenas as abas reais (exclui indicadores .tab-drop-indicator)
      const tabEls = children.filter(c => c.classList.contains('tab')) as HTMLElement[]
      curGap = tabEls.length
      for (let i = 0; i < tabEls.length; i++) {
        const r = tabEls[i].getBoundingClientRect()
        if (ev.clientX < r.left + r.width / 2) { curGap = i; break }
      }
      setDrag({ group, fromIdx, gap: curGap })
    }

    const onUp = () => {
      if (moved && curGap !== fromIdx && curGap !== fromIdx + 1) {
        const toLocalIdx = curGap > fromIdx ? curGap - 1 : curGap
        const offset = group === 'scroll' ? pinnedTabs.length : 0
        reorderTabs(offset + fromIdx, offset + toLocalIdx)
      }
      setDrag(null)
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
    const tab = tabs.find(t => t.id === contextMenu?.tabId) ?? globalTabs.find(t => t.id === contextMenu?.tabId)
    if (tab) navigator.clipboard.writeText(tab.path)
    setContextMenu(null)
  }

  // Compartilhado entre o grupo fixado e o rolável — só muda o grupo (pro
  // mapeamento de índice do drag) e a ref do container (pro hit-test).
  const renderTabItem = (tab: EditorTab, localIdx: number, group: TabGroup) => {
    const dragging = drag?.group === group && drag.fromIdx === localIdx
    const showGapBefore = drag?.group === group && drag.gap === localIdx && drag.fromIdx !== localIdx && drag.fromIdx !== localIdx - 1
    return (
      <React.Fragment key={tab.id}>
        {showGapBefore && <div className="tab-drop-indicator" />}
        <div
          className={`tab ${activeTabId === tab.id ? 'active' : ''} ${dragging ? 'dragging' : ''}`}
          onClick={() => setActiveTab(tab.id)}
          onMouseDown={(e) => handleTabMouseDown(e, localIdx, group)}
          onContextMenu={(e) => handleContextMenu(e, tab.id)}
          title={tab.isCommitTab ? t('tabBar.commitTitle', { hash: tab.commitHash ?? '' }) : tab.isGraphTab || tab.isQueryTab || tab.isTableTab || tab.isDbTablesTab ? tab.name : tab.path}
          style={{ cursor: drag ? 'grabbing' : 'grab' }}
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
            <span className="tab-name" onDoubleClick={e => startRename(tab, e)}>{tab.name}</span>
          )}
          {tab.isModified && <span className="tab-modified">●</span>}
          {tab.externallyChanged && (
            <span className="tab-externally-changed" title={t('tabBar.externallyChanged')}>⟳</span>
          )}
          <button
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
            onMouseDown={(e) => e.stopPropagation()}
            title={t('common:close')}
          >
            <X size={12} />
          </button>
        </div>
      </React.Fragment>
    )
  }

  return (
    <div className="tab-bar">
      {/* Fixas à esquerda, não rolam: Home (globalTabs, ícone só, sem X —
          fecha via "Close" do menu de contexto) seguida das abas fixadas
          pelo usuário (pin, com nome/ícone normais). Nenhuma das duas é
          afetada por switchWorkspace nem pelo scroll do grupo rolável. */}
      {(globalTabs.length > 0 || pinnedTabs.length > 0) && (
        <div className="tab-bar-pinned" ref={pinnedContainerRef} style={{ userSelect: drag ? 'none' : undefined }}>
          {globalTabs.map(tab => (
            <div
              key={tab.id}
              className={`tab tab-icon-only ${activeTabId === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
              title={tab.name}
            >
              <span className="tab-icon">{getTabIcon(tab)}</span>
            </div>
          ))}
          {pinnedTabs.map((tab, idx) => renderTabItem(tab, idx, 'pinned'))}
          {drag?.group === 'pinned' && drag.gap === pinnedTabs.length && drag.fromIdx !== pinnedTabs.length - 1 && (
            <div className="tab-drop-indicator" />
          )}
        </div>
      )}
      <div className="tab-bar-tabs" ref={scrollContainerRef} style={{ userSelect: drag ? 'none' : undefined }}>
        {scrollTabs.map((tab, idx) => renderTabItem(tab, idx, 'scroll'))}
        {drag?.group === 'scroll' && drag.gap === scrollTabs.length && drag.fromIdx !== scrollTabs.length - 1 && (
          <div className="tab-drop-indicator" />
        )}
      </div>

      {showModeButtons && (
        <div className="tab-mode-buttons">
          <button
            className={`tab-mode-btn ${viewMode === 'code' || (viewMode === 'preview' && !isMarkdown) ? 'active' : ''}`}
            title={t('tabBar.modeCode')}
            onClick={() => setViewMode('code')}
          >
            <Code size={15} />
          </button>
          {isMarkdown && (
            <button
              className={`tab-mode-btn ${viewMode === 'preview' ? 'active' : ''}`}
              title={t('tabBar.modePreview')}
              onClick={() => setViewMode('preview')}
            >
              <Eye size={15} />
            </button>
          )}
          <button
            className={`tab-mode-btn ${viewMode === 'diff' ? 'active' : ''}`}
            title={t('tabBar.modeDiff')}
            onClick={() => setViewMode('diff')}
          >
            <GitBranch size={15} />
          </button>
        </div>
      )}

      {contextMenu && (() => {
        // Pin/Unpin não se aplica à Home (sempre fixa, não é uma escolha) nem
        // a commit/diff/graph tabs (fixar um diff de commit não faz sentido
        // — implementer's call, ver pinned-tabs.md).
        const menuTab = tabs.find(t => t.id === contextMenu.tabId)
        const canPin = !!menuTab && !menuTab.isCommitTab && !menuTab.isGraphTab
        return (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setContextMenu(null)} />
          <div className="context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
            {canPin && (
              <div className="context-menu-item" onClick={() => { setPinned(contextMenu.tabId, !menuTab!.pinned); setContextMenu(null) }}>
                {menuTab!.pinned ? t('tabBar.unpinTab') : t('tabBar.pinTab')}
              </div>
            )}
            {canPin && <div className="context-menu-separator" />}
            <div className="context-menu-item" onClick={() => { closeTab(contextMenu.tabId); setContextMenu(null) }}>{t('common:close')}</div>
            <div className="context-menu-item" onClick={() => { closeOtherTabs(contextMenu.tabId); setContextMenu(null) }}>{t('tabBar.closeOthers')}</div>
            <div className="context-menu-item" onClick={() => { closeAllTabs(); setContextMenu(null) }}>{t('tabBar.closeAll')}</div>
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={handleCopyPath}>{t('tabBar.copyPath')}</div>
          </div>
        </>
        )
      })()}
    </div>
  )
}
