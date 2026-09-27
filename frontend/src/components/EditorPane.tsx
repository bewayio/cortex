import React, { useEffect, useCallback, useRef } from 'react'
import EditorTabBar from './EditorTabBar'
import MonacoEditor from './MonacoEditor'
import MarkdownPreview from './MarkdownPreview'
import DiffViewer from './DiffViewer'
import CommitDiffView from './CommitDiffView'
import CommitGraphTab from './CommitGraphTab'
import UsageTab from './UsageTab'
import QueryTab from './QueryTab'
import { useEditorStore } from '../stores/editorStore'
import { WriteFile } from '../../wailsjs/go/main/App'
import { registerGlobalEditorShortcuts } from '../utils/globalEditorShortcuts'
import { usePlatform } from '../utils/platform'

interface Props {
  onOpenWorkspace: (path: string) => void
}

export default function EditorPane({ onOpenWorkspace }: Props) {
  const { getActiveTab, viewMode, markTabSaved, updateTabContent, closeTab } = useEditorStore()
  const activeTabId = useEditorStore(s => s.activeTabId)
  const platform = usePlatform()
  const activeTab = getActiveTab()
  const containerRef = useRef<HTMLDivElement>(null)

  const isMarkdownTab = !!activeTab && activeTab.ext === 'md'
  const effectiveViewMode = (viewMode === 'preview' && !isMarkdownTab) ? 'code' : viewMode
  // Só o modo 'code' de uma aba de arquivo normal monta um MonacoEditor
  // diretamente aqui (QueryTab tem o seu próprio, tratado à parte em
  // QueryTab.tsx). Todo o resto (Home, git graph, commit diff, query,
  // preview, diff) não tem nenhum elemento de edição para focar sozinho.
  const showsInlineMonaco = !!activeTab
    && !activeTab.isGraphTab && !activeTab.isUsageTab && !activeTab.isQueryTab && !activeTab.isCommitTab
    && effectiveViewMode === 'code'

  // Depois de qualquer troca de aba, garante que algo no DOM fique focado —
  // sem isso, ao cair numa aba sem MonacoEditor (Home, query, git graph...)
  // nada retém o foco e o teclado para de responder até um clique manual
  // (bug relatado 2026-09-27: Ctrl+Shift+Tab só funcionava uma vez). Quando
  // a aba nova tem MonacoEditor próprio, o próprio editor foca sozinho no
  // mount (veja onEditorMount abaixo e o efeito equivalente em
  // QueryTab.tsx); aqui só cobre os casos sem editor nenhum.
  useEffect(() => {
    if (!showsInlineMonaco) containerRef.current?.focus()
  }, [activeTabId, showsInlineMonaco])

  // Cmd+S salva, Cmd+W fecha a aba — Ctrl no Linux/Windows, Cmd no macOS
  // (mesma convenção usada em todo o resto do app; corrigido 2026-09-27,
  // pedido do usuário: Ctrl+W não fechava nada fora do macOS).
  useEffect(() => {
    const isMac = platform === 'darwin'
    const handler = async (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.key === 's' && mod) {
        e.preventDefault()
        const tab = getActiveTab()
        if (!tab || tab.isCommitTab || tab.isGraphTab || tab.isUsageTab || tab.isQueryTab) return
        try {
          await WriteFile(tab.path, tab.content)
          markTabSaved(tab.id)
        } catch (err) {
          console.error('Failed to save:', err)
        }
      }
      if (e.key === 'w' && mod) {
        e.preventDefault()
        const tab = getActiveTab()
        if (tab) closeTab(tab.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [getActiveTab, markTabSaved, closeTab, platform])

  const handleContentChange = useCallback((id: string, content: string) => {
    updateTabContent(id, content)
  }, [updateTabContent])

  const renderContent = () => {
    if (!activeTab) {
      return (
        <div className="editor-empty">
          <div className="editor-empty-logo">{'<>'}</div>
          <div style={{ fontSize: 16, color: 'var(--fg-dim)' }}>BCode</div>
          <div style={{ fontSize: 13, color: 'var(--fg-dim)', opacity: 0.6 }}>
            Open a file to start editing
          </div>
        </div>
      )
    }

    if (activeTab.isGraphTab)   return <CommitGraphTab />
    if (activeTab.isUsageTab)   return <UsageTab onOpenWorkspace={onOpenWorkspace} />
    if (activeTab.isQueryTab)   return <QueryTab tab={activeTab} />
    if (activeTab.isCommitTab)  return <CommitDiffView tab={activeTab} />

    switch (effectiveViewMode) {
      case 'preview':
        return <MarkdownPreview content={activeTab.content} />
      case 'diff':
        return (
          <DiffViewer
            path={activeTab.path}
            content={activeTab.content}
            originalContent={activeTab.originalContent}
          />
        )
      case 'code':
      default:
        return (
          <MonacoEditor
            key={activeTab.id}
            path={activeTab.path}
            content={activeTab.content}
            ext={activeTab.ext}
            onChange={(v) => handleContentChange(activeTab.id, v)}
            onMonacoReady={registerGlobalEditorShortcuts}
            onEditorMount={(editor) => editor.focus()}
          />
        )
    }
  }

  return (
    <div
      ref={containerRef}
      tabIndex={-1}
      className="editor-pane-container"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}
    >
      <EditorTabBar />
      <div className="editor-container">
        {renderContent()}
      </div>
    </div>
  )
}
