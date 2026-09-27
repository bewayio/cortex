import React, { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronRight, ChevronDown, Search, X, FileText, GitBranch } from 'lucide-react'
import { EditorTab, CommitMeta, FileDiff, DiffLine } from '../types'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { GitCommitMeta, GitCommitFileDiffs } from '../../wailsjs/go/main/App'

interface SideBySideRow {
  left: DiffLine | null
  right: DiffLine | null
  leftNum: number | null
  rightNum: number | null
  kind: string
}

function buildSideBySide(lines: DiffLine[]): SideBySideRow[] {
  const rows: SideBySideRow[] = []
  let leftLine = 1
  let rightLine = 1
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line.kind === 'hunk') {
      const m = line.text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) { leftLine = parseInt(m[1]); rightLine = parseInt(m[2]) }
      rows.push({ left: line, right: line, leftNum: null, rightNum: null, kind: 'hunk' })
      i++; continue
    }
    if (line.kind === 'context') {
      rows.push({ left: line, right: line, leftNum: leftLine, rightNum: rightLine, kind: 'context' })
      leftLine++; rightLine++; i++; continue
    }
    const removes: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i].kind === 'remove') removes.push(lines[i++])
    while (i < lines.length && lines[i].kind === 'add') adds.push(lines[i++])
    const maxLen = Math.max(removes.length, adds.length)
    for (let j = 0; j < maxLen; j++) {
      const rem = removes[j] ?? null
      const add = adds[j] ?? null
      rows.push({
        left: rem, right: add,
        leftNum: rem ? leftLine : null,
        rightNum: add ? rightLine : null,
        kind: rem && add ? 'change' : rem ? 'remove' : 'add',
      })
      if (rem) leftLine++
      if (add) rightLine++
    }
  }
  return rows
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightSearch(text: string, query: string): string {
  if (!query) return escapeHtml(text)
  const escaped = escapeHtml(text)
  const escapedQuery = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escaped.replace(new RegExp(escapedQuery, 'gi'), m => `<mark class="search-highlight">${m}</mark>`)
}

interface FileSectionProps {
  diff: FileDiff
  expanded: boolean
  onToggle: () => void
  searchQuery: string
}

function FileSection({ diff, expanded, onToggle, searchQuery }: FileSectionProps) {
  const rows = buildSideBySide(diff.lines)

  const getBadge = () => {
    if (diff.kind === 'deleted') return <span className="commit-file-badge badge-deleted">DELETED</span>
    if (diff.kind === 'added') return <span className="commit-file-badge badge-new">NEW</span>
    return null
  }

  const getPathColor = () => {
    if (diff.kind === 'deleted') return '#e06c75'
    if (diff.kind === 'added') return '#98c379'
    return 'var(--fg)'
  }

  return (
    <div className="commit-file-section">
      <div className="commit-file-header" onClick={onToggle}>
        {expanded
          ? <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--fg-dim)' }} />
          : <ChevronRight size={14} style={{ flexShrink: 0, color: 'var(--fg-dim)' }} />
        }
        <FileText size={14} style={{ flexShrink: 0, color: getPathColor() }} />
        <span
          className={`commit-file-path ${diff.kind === 'deleted' ? 'deleted' : ''}`}
          style={{ color: getPathColor() }}
          dangerouslySetInnerHTML={{ __html: highlightSearch(diff.path, searchQuery) }}
        />
        {getBadge()}
        <div className="commit-file-stats">
          {diff.additions > 0 && <span className="stat-add">+{diff.additions}</span>}
          {diff.deletions > 0 && <span className="stat-del">-{diff.deletions}</span>}
        </div>
      </div>

      {expanded && (
        <div className="commit-file-diff">
          {diff.kind === 'deleted' && (
            <div style={{ display: 'flex', fontFamily: "'SF Mono',monospace", fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="diff-column-header">antes</div>
                {rows.map((row, i) => (
                  <div key={i} className={`commit-diff-row ${row.kind === 'remove' ? 'remove' : row.kind === 'hunk' ? 'hunk' : ''}`}>
                    <div className="commit-diff-half" style={{ borderRight: 'none' }}>
                      <span className="commit-diff-linenum">{row.leftNum ?? ''}</span>
                      <span
                        className="commit-diff-text"
                        dangerouslySetInnerHTML={{ __html: highlightSearch(row.left?.text ?? '', searchQuery) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="diff-divider" />
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div className="diff-column-header">— arquivo removido —</div>
              </div>
            </div>
          )}

          {diff.kind === 'added' && (
            <div style={{ display: 'flex', fontFamily: "'SF Mono',monospace", fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                <div style={{ width: '100%' }}>
                  <div className="diff-column-header">New file</div>
                </div>
              </div>
              <div className="diff-divider" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="diff-column-header">depois</div>
                {rows.map((row, i) => (
                  <div key={i} className={`commit-diff-row ${row.kind === 'add' ? 'add' : row.kind === 'hunk' ? 'hunk' : ''}`}>
                    <div className="commit-diff-half" style={{ borderRight: 'none' }}>
                      <span className="commit-diff-linenum">{row.rightNum ?? ''}</span>
                      <span
                        className="commit-diff-text"
                        dangerouslySetInnerHTML={{ __html: highlightSearch(row.right?.text ?? '', searchQuery) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {diff.kind === 'modified' && (
            <div style={{ display: 'flex', fontFamily: "'SF Mono',monospace", fontSize: 12 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="diff-column-header">antes</div>
                {rows.map((row, i) => (
                  <div key={i} className={`commit-diff-row ${row.kind === 'remove' || row.kind === 'change' ? 'remove' : row.kind === 'hunk' ? 'hunk' : ''}`}>
                    <div className="commit-diff-half">
                      <span className="commit-diff-linenum">{row.leftNum ?? ''}</span>
                      <span
                        className="commit-diff-text"
                        dangerouslySetInnerHTML={{ __html: highlightSearch(row.left?.text ?? '', searchQuery) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="diff-divider" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="diff-column-header">depois</div>
                {rows.map((row, i) => (
                  <div key={i} className={`commit-diff-row ${row.kind === 'add' || row.kind === 'change' ? 'add' : row.kind === 'hunk' ? 'hunk' : ''}`}>
                    <div className="commit-diff-half" style={{ borderRight: 'none' }}>
                      <span className="commit-diff-linenum">{row.rightNum ?? ''}</span>
                      <span
                        className="commit-diff-text"
                        dangerouslySetInnerHTML={{ __html: highlightSearch(row.right?.text ?? '', searchQuery) }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface Props {
  tab: EditorTab
}

export default function CommitDiffView({ tab }: Props) {
  const { currentWorkspace } = useWorkspaceStore()
  // Usa o root guardado no tab para evitar race condition com currentWorkspace
  const workspaceRoot = tab.commitWorkspaceRoot
    || currentWorkspace?.path
    || useWorkspaceStore.getState().currentWorkspace?.path
    || ''

  const [meta, setMeta] = useState<CommitMeta | null>(null)
  const [diffs, setDiffs] = useState<FileDiff[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [allExpanded, setAllExpanded] = useState(true)
  const searchRef = useRef<HTMLInputElement>(null)

  const hash = tab.commitHash || ''

  useEffect(() => {
    if (!workspaceRoot || !hash) {
      setLoading(false)
      return
    }
    setLoading(true)
    setMeta(null)
    setDiffs([])
    Promise.all([
      GitCommitMeta(workspaceRoot, hash),
      GitCommitFileDiffs(workspaceRoot, hash),
    ]).then(([m, d]) => {
      setMeta(m)
      setDiffs(d as FileDiff[])
      setExpandedFiles(new Set((d as FileDiff[]).map(f => f.path)))
      setLoading(false)
    }).catch(err => {
      console.error('Failed to load commit:', err)
      setLoading(false)
    })
  }, [hash, workspaceRoot]) // workspaceRoot é estável (vem do tab)

  // Cmd+F to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'f' && e.metaKey) {
        e.preventDefault()
        setShowSearch(v => !v)
        setTimeout(() => searchRef.current?.focus(), 50)
      }
      if (e.key === 'Escape' && showSearch) {
        setShowSearch(false)
        setSearchQuery('')
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [showSearch])

  const toggleAll = () => {
    if (allExpanded) {
      setExpandedFiles(new Set())
    } else {
      setExpandedFiles(new Set(diffs.map(f => f.path)))
    }
    setAllExpanded(v => !v)
  }

  const toggleFile = (path: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const filteredDiffs = searchQuery
    ? diffs.filter(d => {
        const q = searchQuery.toLowerCase()
        if (d.path.toLowerCase().includes(q)) return true
        return d.lines.some(l => l.text.toLowerCase().includes(q))
      })
    : diffs

  const matchCount = searchQuery
    ? filteredDiffs.reduce((acc, d) => {
        let n = 0
        if (d.path.toLowerCase().includes(searchQuery.toLowerCase())) n++
        d.lines.forEach(l => {
          const lower = l.text.toLowerCase()
          const q = searchQuery.toLowerCase()
          let idx = 0
          while ((idx = lower.indexOf(q, idx)) !== -1) { n++; idx += q.length }
        })
        return acc + n
      }, 0)
    : 0

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--fg-dim)', fontSize: 13 }}>
        Loading commit…
      </div>
    )
  }

  if (!hash || (!meta && diffs.length === 0)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--fg-dim)', fontSize: 13 }}>
        {!hash ? 'No commit selected' : 'Could not load commit data'}
      </div>
    )
  }

  return (
    <div className="commit-diff-view">
      {/* Toolbar */}
      <div className="commit-diff-toolbar">
        <button className="commit-diff-toolbar-btn" onClick={toggleAll}>
          {allExpanded ? 'Collapse All' : 'Expand All'}
        </button>
        <span className="commit-diff-file-count">
          {filteredDiffs.length} file{filteredDiffs.length !== 1 ? 's' : ''}
        </span>
        <button
          className="commit-diff-toolbar-btn"
          onClick={() => { setShowSearch(v => !v); setTimeout(() => searchRef.current?.focus(), 50) }}
          title="Search (⌘+F)"
        >
          <Search size={14} />
        </button>
      </div>

      {/* Search bar */}
      {showSearch && (
        <div className="commit-diff-search-bar">
          <Search size={13} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
          <input
            ref={searchRef}
            className="commit-diff-search-input"
            placeholder="Search files or content…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <span className="commit-diff-search-count">{matchCount} match{matchCount !== 1 ? 'es' : ''}</span>
          )}
          <button onClick={() => { setShowSearch(false); setSearchQuery('') }}>
            <X size={14} style={{ color: 'var(--fg-dim)' }} />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="commit-diff-body">
        {meta && (
          <div className="commit-meta">
            <div className="commit-meta-hash">
              {meta.hash.slice(0, 12)} · {meta.author} · {meta.relativeDate}
            </div>
            <div className="commit-meta-message">{meta.message}</div>
          </div>
        )}

        {filteredDiffs.map(diff => (
          <FileSection
            key={diff.path}
            diff={diff}
            expanded={expandedFiles.has(diff.path)}
            onToggle={() => toggleFile(diff.path)}
            searchQuery={searchQuery}
          />
        ))}

        {filteredDiffs.length === 0 && (
          <div style={{ padding: 24, color: 'var(--fg-dim)', textAlign: 'center' }}>
            No files match your search.
          </div>
        )}
      </div>
    </div>
  )
}
