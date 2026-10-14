import React, { useEffect, useCallback, useRef, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import EditorTabBar from './EditorTabBar'
import MonacoEditor from './MonacoEditor'
import MarkdownPreview from './MarkdownPreview'
import DiffViewer from './DiffViewer'
import CommitDiffView from './CommitDiffView'
import CommitGraphTab from './CommitGraphTab'
import UsageTab from './UsageTab'
import QueryTab from './QueryTab'
import TableTab from './TableTab'
import DatabaseTablesTab from './DatabaseTablesTab'
import { useEditorStore } from '../stores/editorStore'
import { WriteFile } from '../../wailsjs/go/main/App'
import { registerGlobalEditorShortcuts } from '../utils/globalEditorShortcuts'
import { usePlatform } from '../utils/platform'

interface Props {
  onOpenWorkspace: (path: string) => void
}

export default function EditorPane({ onOpenWorkspace }: Props) {
  const { t } = useTranslation('editor')
  const { getActiveTab, viewMode, markTabSaved, updateTabContent, closeTab } = useEditorStore()
  const activeTabId = useEditorStore(s => s.activeTabId)
  const platform = usePlatform()
  const activeTab = getActiveTab()
  const containerRef = useRef<HTMLDivElement>(null)
  // Confirmação antes de salvar por cima de uma mudança externa não vista
  // ainda (`tab.externallyChanged` — ver `files.md`, watcher de arquivos).
  // Guarda path/name só pra exibir no modal; o conteúdo a salvar é sempre
  // relido da store no momento da confirmação (não um snapshot capturado na
  // hora do Ctrl+S), caso o usuário continue digitando com o modal aberto.
  const [overwriteConfirm, setOverwriteConfirm] = useState<{ tabId: string; name: string } | null>(null)

  const isMarkdownTab = !!activeTab && activeTab.ext === 'md'
  const effectiveViewMode = (viewMode === 'preview' && !isMarkdownTab) ? 'code' : viewMode
  // Só o modo 'code' de uma aba de arquivo normal monta um MonacoEditor
  // diretamente aqui (QueryTab tem o seu próprio, tratado à parte em
  // QueryTab.tsx). Todo o resto (Home, git graph, commit diff, query,
  // preview, diff) não tem nenhum elemento de edição para focar sozinho.
  const showsInlineMonaco = !!activeTab
    && !activeTab.isGraphTab && !activeTab.isUsageTab && !activeTab.isQueryTab && !activeTab.isCommitTab
    && !activeTab.isTableTab && !activeTab.isDbTablesTab
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

  // Grava de fato no disco — usado tanto pelo Cmd+S direto quanto pela
  // confirmação do modal de sobrescrita (abaixo). Relê a aba da store pelo
  // id (não um parâmetro fechado sobre um estado antigo) pra sempre salvar
  // o conteúdo mais recente.
  const performSave = useCallback(async (tabId: string) => {
    const tab = useEditorStore.getState().tabs.find(t => t.id === tabId)
      ?? useEditorStore.getState().globalTabs.find(t => t.id === tabId)
    if (!tab) return
    try {
      await WriteFile(tab.path, tab.content)
      markTabSaved(tab.id)
    } catch (err) {
      console.error('Failed to save:', err)
    }
  }, [markTabSaved])

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
        if (!tab || tab.isCommitTab || tab.isGraphTab || tab.isUsageTab || tab.isQueryTab || tab.isTableTab || tab.isDbTablesTab) return
        // Arquivo mudou por fora enquanto a aba tinha alteração local não
        // salva (ver files.md) — avisa antes de sobrescrever a mudança
        // externa, em vez de salvar direto por cima dela sem avisar
        // (pedido do usuário, 2026-10-12).
        if (tab.externallyChanged) { setOverwriteConfirm({ tabId: tab.id, name: tab.name }); return }
        await performSave(tab.id)
      }
      if (e.key === 'w' && mod) {
        e.preventDefault()
        const tab = getActiveTab()
        if (tab) closeTab(tab.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [getActiveTab, performSave, closeTab, platform])

  const handleContentChange = useCallback((id: string, content: string) => {
    updateTabContent(id, content)
  }, [updateTabContent])

  const renderContent = () => {
    if (!activeTab) {
      return (
        <div className="editor-empty">
          <div className="editor-empty-logo">{'<>'}</div>
          <div style={{ fontSize: 16, color: 'var(--fg-dim)' }}>Cortex</div>
          <div style={{ fontSize: 13, color: 'var(--fg-dim)', opacity: 0.6 }}>
            {t('empty.openFileToStart')}
          </div>
        </div>
      )
    }

    if (activeTab.isGraphTab)     return <CommitGraphTab />
    if (activeTab.isUsageTab)     return <UsageTab onOpenWorkspace={onOpenWorkspace} />
    if (activeTab.isQueryTab)     return <QueryTab tab={activeTab} />
    if (activeTab.isCommitTab)    return <CommitDiffView tab={activeTab} />
    if (activeTab.isTableTab)     return <TableTab key={activeTab.id} tab={activeTab} />
    if (activeTab.isDbTablesTab)  return <DatabaseTablesTab tab={activeTab} />

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
      {overwriteConfirm && (
        <div className="modal-overlay">
          <div className="modal-dialog">
            <div className="modal-dialog-title">{t('overwrite.title')}</div>
            <div className="modal-dialog-msg">
              <Trans t={t} i18nKey="overwrite.message" values={{ name: overwriteConfirm.name }} components={{ b: <strong /> }} />
            </div>
            <div className="modal-dialog-actions">
              <button className="modal-dialog-btn cancel" onClick={() => setOverwriteConfirm(null)}>{t('common:cancel')}</button>
              <button className="modal-dialog-btn danger" onClick={() => { performSave(overwriteConfirm.tabId); setOverwriteConfirm(null) }}>{t('overwrite.saveAnyway')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
