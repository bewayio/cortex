import React, { useRef } from 'react'
import { FilePlus, FolderPlus, ChevronsUpDown } from 'lucide-react'
import WorkspaceList from './WorkspaceList'
import FileExplorer, { FileExplorerHandle } from './FileExplorer'
import GitPanel from './GitPanel'
import DatabasePanel from './DatabasePanel'
import { useWorkspaceStore } from '../stores/workspaceStore'

type Panel = 'explorer' | 'git' | 'database'

interface Props {
  activePanel: Panel
  onOpenWorkspace: (path: string) => void
}

export default function Sidebar({ activePanel, onOpenWorkspace }: Props) {
  const { currentWorkspace } = useWorkspaceStore()
  const explorerActionsRef = useRef<FileExplorerHandle | null>(null)

  // O painel de banco de dados é autônomo (conexões são globais, não ligadas
  // a um workspace) — não usa a seção de WorkspaceList compartilhada.
  if (activePanel === 'database') {
    return (
      <div className="sidebar-inner">
        <DatabasePanel />
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
        <span>{activePanel === 'explorer' ? 'EXPLORER' : 'SOURCE CONTROL'}</span>
        {activePanel === 'explorer' && currentWorkspace && (
          <div className="sidebar-header-actions">
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.addFile()}
              title="New File"
            >
              <FilePlus size={14} />
            </button>
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.addFolder()}
              title="New Folder"
            >
              <FolderPlus size={14} />
            </button>
            <button
              className="sidebar-header-btn"
              onClick={() => explorerActionsRef.current?.collapseAll()}
              title="Collapse All"
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
              <div className="no-workspace-text">Open a folder to start editing</div>
            </div>
          )
        ) : (
          <GitPanel />
        )}
      </div>
    </div>
  )
}
