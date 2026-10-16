import React from 'react'
import { FolderOpen, GitBranch, Terminal, Database, Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useGitStore } from '../stores/gitStore'

type Panel = 'explorer' | 'git' | 'database' | 'aiSessions'

interface Props {
  activePanel: Panel
  onPanelChange: (p: Panel) => void
  onToggleTerminal: () => void
}

export default function ActivityBar({ activePanel, onPanelChange, onToggleTerminal }: Props) {
  const { t } = useTranslation('shell')
  const { changedFiles } = useGitStore()

  return (
    <div className="activity-bar">
      <button
        className={`activity-bar-btn ${activePanel === 'aiSessions' ? 'active' : ''}`}
        title={t('activityBar.aiSessions')}
        onClick={() => onPanelChange('aiSessions')}
      >
        <Bot size={20} />
      </button>

      <button
        className={`activity-bar-btn ${activePanel === 'explorer' ? 'active' : ''}`}
        title={t('activityBar.explorer')}
        onClick={() => onPanelChange('explorer')}
      >
        <FolderOpen size={20} />
      </button>

      <button
        className={`activity-bar-btn ${activePanel === 'git' ? 'active' : ''}`}
        title={t('activityBar.sourceControl')}
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
        title={t('activityBar.database')}
        onClick={() => onPanelChange('database')}
      >
        <Database size={20} />
      </button>

      <button
        className="activity-bar-btn"
        title={t('activityBar.toggleTerminal')}
        onClick={onToggleTerminal}
      >
        <Terminal size={20} />
      </button>
    </div>
  )
}
