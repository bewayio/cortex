import React, { useState, useEffect, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CommitGraphRow from './CommitGraph'
import { computeGraph, LaneRow, GraphCommit } from '../utils/graphLayout'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useEditorStore } from '../stores/editorStore'
import { GitGraphLog } from '../../wailsjs/go/main/App'

const PAGE = 100

export default function CommitGraphTab() {
  const { t } = useTranslation('git')
  const { currentWorkspace } = useWorkspaceStore()
  const { openOrFocusTab }   = useEditorStore()

  const [raw,     setRaw]     = useState<GraphCommit[]>([])
  const [limit,   setLimit]   = useState(PAGE)
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(false)
  const [query,   setQuery]   = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const load = async (lim: number) => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const data = await GitGraphLog(currentWorkspace.path, lim) as GraphCommit[]
      setRaw(data)
      setHasMore(data.length === lim)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(limit) }, [currentWorkspace]) // eslint-disable-line

  const rows: LaneRow[] = useMemo(() => computeGraph(raw), [raw])

  const filtered = useMemo(() => {
    if (!query) return rows
    const q = query.toLowerCase()
    return rows.filter(r =>
      r.commit.message.toLowerCase().includes(q) ||
      r.commit.hash.toLowerCase().startsWith(q) ||
      r.commit.author.toLowerCase().includes(q) ||
      r.commit.refs.some(ref => ref.toLowerCase().includes(q))
    )
  }, [rows, query])

  const openCommit = (row: LaneRow) => {
    const ws = currentWorkspace?.path ?? ''
    const shortMsg = row.commit.message.length > 28
      ? row.commit.message.slice(0, 28) + '…'
      : row.commit.message
    openOrFocusTab({
      path: `__commit__${row.commit.hash}`,
      name: `${row.commit.hash.slice(0, 7)} ${shortMsg}`,
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: true,
      commitHash: row.commit.hash,
      commitMessage: row.commit.message,
      commitWorkspaceRoot: ws,
    })
  }

  return (
    <div className="cgt-root">
      {/* Header */}
      <div className="cgt-header">
        <span className="cgt-title">{t('graphTab.title')}</span>
        {showSearch && (
          <div className="cgt-search-bar">
            <Search size={12} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            <input
              autoFocus
              className="cgt-search-input"
              placeholder={t('graphTab.filterPlaceholder')}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Escape' && (setShowSearch(false), setQuery(''))}
            />
            {query && (
              <span className="cgt-match-count">{filtered.length}</span>
            )}
            <button className="cgt-icon-btn" onClick={() => { setShowSearch(false); setQuery('') }}>
              <X size={12} />
            </button>
          </div>
        )}
        <button className="cgt-icon-btn" title={t('graphTab.searchTitle')}
          onClick={() => setShowSearch(v => !v)} style={{ marginLeft: 'auto' }}>
          <Search size={13} />
        </button>
      </div>

      {/* Graph list */}
      <div className="cgt-list">
        {loading && filtered.length === 0 && (
          <div className="cgt-empty">{t('loading')}</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="cgt-empty">{t('graphTab.noCommitsMatch')}</div>
        )}
        {filtered.map(row => (
          <CommitGraphRow key={row.commit.hash} row={row} onClick={() => openCommit(row)} />
        ))}
        {hasMore && !query && (
          <button className="git-load-more" disabled={loading}
            onClick={() => { const n = limit + PAGE; setLimit(n); load(n) }}>
            {loading ? t('loading') : t('loadMore', { count: PAGE })}
          </button>
        )}
      </div>
    </div>
  )
}
