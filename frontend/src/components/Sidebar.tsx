import React from 'react'
import { FilePlus, FolderPlus, ChevronsUpDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import WorkspaceList from './WorkspaceList'
import FileExplorer, { FileExplorerHandle } from './FileExplorer'
import GitPanel from './GitPanel'
import DatabasePanel, { DatabasePanelHandle } from './DatabasePanel'
import { useWorkspaceStore } from '../stores/workspaceStore'

type Panel = 'explorer' | 'git' | 'database'

interface Props {
  activePanel: Panel
  onOpenWorkspace: (path: string) => void
  // Criados em App.tsx (não aqui) — o atalho global Ctrl/Cmd+N /
  // Ctrl/Cmd+Shift+N precisa chamar essas ações de fora da sidebar,
  // dependendo de qual painel está ativo.
  explorerActionsRef: React.MutableRefObject<FileExplorerHandle | null>
  dbActionsRef: React.MutableRefObject<DatabasePanelHandle | null>
}

export default function Sidebar({ activePanel, onOpenWorkspace, explorerActionsRef, dbActionsRef }: Props) {
  const { t } = useTranslation('shell')
  const { currentWorkspace } = useWorkspaceStore()

  // O painel de banco de dados é autônomo (conexões são globais, não ligadas
  // a um workspace) — não usa a seção de WorkspaceList compartilhada.
  if (activePanel === 'database') {
    return (
      <div className="sidebar-inner">
        <DatabasePanel actionRef={dbActionsRef} />
      </div>
    )
  }

  return (
    <div className="sidebar-inner">
      <div className="sidebar-workspace-section">
        <WorkspaceList onOpenWorkspace={onOpenWorkspace} />
      </div>

      <div className="sidebar-divider" />

      {/* Cabeçalho do painel com botões de ação à direita */}
      <div className="sidebar-panel-header">
        <span>{activePanel === 'explorer' ? t('sidebar.explorer') : t('sidebar.sourceControl')}</span>
        {activePanel === 'explorer' && currentWorkspace && (
          <div className="sidebar-header-actions">
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.addFile()}
              title={t('sidebar.newFile')}
            >
              <FilePlus size={14} />
            </button>
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.addFolder()}
              title={t('sidebar.newFolder')}
            >
              <FolderPlus size={14} />
            </button>
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.collapseAll()}
              title={t('sidebar.collapseAll')}
            >
              <ChevronsUpDown size={14} />
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-panel-content">
        {activePanel === 'explorer' ? (
          currentWorkspace ? (
            <FileExplorer actionRef={explorerActionsRef} />
          ) : (
            <div className="no-workspace">
              <div className="no-workspace-text">{t('sidebar.openFolderToStart')}</div>
            </div>
          )
        ) : (
          <GitPanel />
        )}
      </div>
    </div>
  )
}
