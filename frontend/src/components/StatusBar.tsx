import React from 'react'
import { GitBranch } from 'lucide-react'
import { useGitStore } from '../stores/gitStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useEditorStore } from '../stores/editorStore'

export default function StatusBar() {
  const { branch } = useGitStore()
  const { currentWorkspace } = useWorkspaceStore()
  const { getActiveTab } = useEditorStore()
  const activeTab = getActiveTab()

  return (
    <div className="status-bar">
      {currentWorkspace && branch && (
        <div className="status-bar-item">
          <GitBranch size={12} />
          <span>{branch}</span>
        </div>
      )}

      {activeTab && !activeTab.isCommitTab && (
        <>
          <div className="status-bar-item" style={{ marginLeft: 'auto' }}>
            <span>{activeTab.ext.toUpperCase() || 'TEXT'}</span>
          </div>
          {activeTab.isModified && (
            <div className="status-bar-item" style={{ color: '#e5c07b' }}>
              Modified
            </div>
          )}
        </>
      )}

      {!activeTab && currentWorkspace && (
        <div style={{ marginLeft: 'auto', color: 'var(--fg-dim)' }}>
          {currentWorkspace.name}
        </div>
      )}
    </div>
  )
}
