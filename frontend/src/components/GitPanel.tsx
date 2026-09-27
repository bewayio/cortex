import React, { useState, useEffect } from 'react'
import { ChevronRight, GitGraph } from 'lucide-react'
import { useGitStore } from '../stores/gitStore'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useEditorStore } from '../stores/editorStore'
import { GitLog, GitDiff, GitOriginalContent, GitGraphLog } from '../../wailsjs/go/main/App'
import { GitCommit as GitCommitType } from '../types'
import CommitGraphRow from './CommitGraph'
import { computeGraph, LaneRow, GraphCommit } from '../utils/graphLayout'

export default function GitPanel() {
  const { changedFiles, commits, commitsLoading, hasMoreCommits, commitPageSize } = useGitStore()
  const { appendCommits, setCommitsLoading, setHasMoreCommits } = useGitStore()
  const { currentWorkspace } = useWorkspaceStore()
  const { openOrFocusTab, setViewMode } = useEditorStore()

  const [changesCollapsed, setChangesCollapsed] = useState(false)
  const [commitsCollapsed, setCommitsCollapsed] = useState(false)
  const [graphRows, setGraphRows]     = useState<LaneRow[]>([])
  const [graphLimit, setGraphLimit]   = useState(50)
  const [graphLoading, setGraphLoading] = useState(false)
  const [graphHasMore, setGraphHasMore] = useState(false)

  const openGraphTab = () => {
    openOrFocusTab({
      path: '__git_graph__',
      name: 'Git Graph',
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isGraphTab: true,
    })
  }

  const handleFileClick = async (path: string) => {
    if (!currentWorkspace) return
    try {
      const [original, diff] = await Promise.all([
        GitOriginalContent(currentWorkspace.path, path),
        GitDiff(currentWorkspace.path, path),
      ])
      const ext = path.split('.').pop() || ''
      openOrFocusTab({
        path: currentWorkspace.path + '/' + path,
        name: path.split('/').pop() || path,
        ext,
        content: diff,
        originalContent: original,
        isModified: false,
        isCommitTab: false,
      })
      setViewMode('diff')
    } catch (err) {
      console.error(err)
    }
  }

  const handleCommitClick = (commit: GitCommitType) => {
    const shortMsg = commit.message.length > 28
      ? commit.message.slice(0, 28) + '…'
      : commit.message
    openOrFocusTab({
      path: `__commit__${commit.hash}`,
      name: `${commit.hash.slice(0, 7)} ${shortMsg}`,
      ext: '',
      content: '',
      originalContent: '',
      isModified: false,
      isCommitTab: true,
      commitHash: commit.hash,
      commitMessage: commit.message,
      commitWorkspaceRoot: currentWorkspace?.path ?? '',
    })
  }

  const loadMoreCommits = async () => {
    if (!currentWorkspace || commitsLoading) return
    setCommitsLoading(true)
    try {
      const more = await GitLog(currentWorkspace.path, commitPageSize)
      appendCommits(more)
      setHasMoreCommits(more.length === commitPageSize)
    } catch (err) {
      console.error(err)
    } finally {
      setCommitsLoading(false)
    }
  }

  // Carrega o grafo de commits
  const loadGraph = async (limit: number) => {
    if (!currentWorkspace) return
    setGraphLoading(true)
    try {
      const raw = await GitGraphLog(currentWorkspace.path, limit) as GraphCommit[]
      setGraphRows(computeGraph(raw))
      setGraphHasMore(raw.length === limit)
    } catch (err) {
      console.error(err)
    } finally {
      setGraphLoading(false)
    }
  }

  useEffect(() => {
    if (currentWorkspace && !commitsCollapsed) loadGraph(graphLimit)
  }, [currentWorkspace, commitsCollapsed]) // eslint-disable-line

  const loadMoreGraph = () => {
    const next = graphLimit + 60
    setGraphLimit(next)
    loadGraph(next)
  }

  return (
    <div className="git-panel">
      {/* CHANGES section */}
      <div className="git-section" style={{ flex: changesCollapsed ? '0 0 28px' : '0 0 auto', maxHeight: changesCollapsed ? 28 : 250 }}>
        <div className="git-section-header" onClick={() => setChangesCollapsed(v => !v)}>
          <ChevronRight
            size={12}
            className={`git-section-chevron ${changesCollapsed ? 'collapsed' : ''}`}
            style={{ transform: changesCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
          />
          Changes
          {changedFiles.length > 0 && (
            <span style={{ marginLeft: 4, color: '#e5c07b' }}>{changedFiles.length}</span>
          )}
        </div>
        {!changesCollapsed && (
          <div className="git-section-content">
            {changedFiles.length === 0 ? (
              <div style={{ padding: '8px 12px', color: 'var(--fg-dim)', fontSize: 12 }}>
                No changes
              </div>
            ) : (
              changedFiles.map(f => (
                <div
                  key={f.path}
                  className="git-file-item"
                  onClick={() => handleFileClick(f.path)}
                >
                  <span className="git-file-name">
                    {(() => {
                      const parts = f.path.split('/')
                      const name  = parts[parts.length - 1] || f.path
                      const dir   = parts.length > 1 ? parts.slice(0, -1).join('/') : ''
                      return <>
                        <span>{name}</span>
                        {dir && <span className="git-file-dir">&nbsp;{dir}</span>}
                      </>
                    })()}
                  </span>
                  <span
                    className="git-file-status"
                    style={{ color: f.statusColor }}
                  >
                    {f.statusLabel}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* COMMITS section */}
      <div className="git-section" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div className="git-section-header" onClick={() => setCommitsCollapsed(v => !v)}>
          <ChevronRight
            size={12}
            className={`git-section-chevron ${commitsCollapsed ? 'collapsed' : ''}`}
            style={{ transform: commitsCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}
          />
          <span style={{ flex: 1 }}>Commits</span>
          <button
            className="sidebar-header-btn"
            title="Open full graph in tab"
            style={{ marginLeft: 'auto', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            onClick={e => { e.stopPropagation(); openGraphTab() }}
          >
            <GitGraph size={13} />
          </button>
        </div>
        {!commitsCollapsed && (
          <div className="git-section-content" style={{ flex: 1 }}>
            {graphRows.length === 0 && !graphLoading && (
              <div style={{ padding: '8px 12px', color: 'var(--fg-dim)', fontSize: 12 }}>
                No commits found
              </div>
            )}
            {graphRows.map(row => (
              <CommitGraphRow
                key={row.commit.hash}
                row={row}
                onClick={() => handleCommitClick({
                  hash: row.commit.hash,
                  message: row.commit.message,
                  author: row.commit.author,
                  relativeDate: row.commit.relativeDate,
                })}
              />
            ))}
            {graphHasMore && (
              <button className="git-load-more" onClick={loadMoreGraph} disabled={graphLoading}>
                {graphLoading ? 'Loading…' : 'Load 60 more…'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
