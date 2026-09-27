import React from 'react'
import { FolderOpen, GitBranch, Terminal, Home, Database } from 'lucide-react'
import { useGitStore } from '../stores/gitStore'
import { useEditorStore } from '../stores/editorStore'

type Panel = 'explorer' | 'git' | 'database'

interface Props {
  activePanel: Panel
  onPanelChange: (p: Panel) => void
  onToggleTerminal: () => void
}

export default function ActivityBar({ activePanel, onPanelChange, onToggleTerminal }: Props) {
  const { changedFiles } = useGitStore()
  const { getActiveTab, openOrFocusTab } = useEditorStore()
  // Identificador interno (isUsageTab) mantido como está — renomear só o
  // rótulo visível evita mexer em editorStore/EditorTabBar sem necessidade.
  const homeTabActive = !!getActiveTab()?.isUsageTab

  const openHomeTab = () => {
    openOrFocusTab({
      path: '__usage__',
      name: 'Home',
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isUsageTab: true,
    })
  }

  return (
    <div className="activity-bar">
      {/* Não é um painel da sidebar — abre/foca a aba "Home" no editor,
          no mesmo estilo do Git Graph. Primeiro ícone da barra. */}
      <button
        className={`activity-bar-btn ${homeTabActive ? 'active' : ''}`}
        title="Home"
        onClick={openHomeTab}
      >
        <Home size={20} />
      </button>

      <button
        className={`activity-bar-btn ${activePanel === 'explorer' ? 'active' : ''}`}
        title="Explorer (⌘+Shift+E)"
        onClick={() => onPanelChange('explorer')}
      >
        <FolderOpen size={20} />
      </button>

      <button
        className={`activity-bar-btn ${activePanel === 'git' ? 'active' : ''}`}
        title="Source Control"
        onClick={() => onPanelChange('git')}
      >
        <GitBranch size={20} />
        {(changedFiles?.length ?? 0) > 0 && (
          <span className="activity-bar-badge">
            {changedFiles.length > 99 ? '99+' : changedFiles.length}
          </span>
        )}
      </button>

      <button
        className={`activity-bar-btn ${activePanel === 'database' ? 'active' : ''}`}
        title="Database"
        onClick={() => onPanelChange('database')}
      >
        <Database size={20} />
      </button>

      <button
        className="activity-bar-btn"
        title="Toggle Terminal (Ctrl+`)"
        onClick={onToggleTerminal}
      >
        <Terminal size={20} />
      </button>
    </div>
  )
}
