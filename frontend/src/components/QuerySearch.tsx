import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search, FileText } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { ListSavedQueries, ListDBConnections } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type SavedQuery = main.SavedQuery

interface Props {
  onClose: () => void
  onSelect: (sq: SavedQuery) => void
}

function score(sq: SavedQuery, connName: string, q: string): number {
  const name = (sq.name || '').toLowerCase()
  const db = (sq.database || '').toLowerCase()
  const conn = connName.toLowerCase()
  if (name === q) return 100
  if (name.startsWith(q)) return 80
  if (name.includes(q)) return 60
  if (db.includes(q) || conn.includes(q)) return 40
  return 0
}

export default function QuerySearch({ onClose, onSelect }: Props) {
  const { t } = useTranslation('database')
  const [queries, setQueries] = useState<SavedQuery[]>([])
  const [connNames, setConnNames] = useState<Record<string, string>>({})
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ListSavedQueries().then(setQueries).catch(() => setQueries([]))
    ListDBConnections().then(conns => {
      const map: Record<string, string> = {}
      conns.forEach(c => { map[c.id] = c.name })
      setConnNames(map)
    }).catch(() => setConnNames({}))
  }, [])

  const sorted = useMemo(
    () => [...queries].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [queries]
  )

  const results = useMemo(() => {
    if (!query.trim()) return sorted.slice(0, 50)
    const q = query.toLowerCase()
    return sorted
      .map(sq => ({ sq, s: score(sq, connNames[sq.connectionId] || '', q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map(x => x.sq)
  }, [query, sorted, connNames])

  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(v => Math.min(v + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(v => Math.max(v - 1, 0))
    } else if (e.key === 'Enter') {
      const sq = results[activeIdx]
      if (sq) onSelect(sq)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="file-search-overlay" onMouseDown={onClose}>
      <div className="file-search-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="file-search-input-row">
          <Search size={14} className="file-search-icon" />
          <input
            ref={inputRef}
            className="file-search-input"
            placeholder={t('querySearch.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {results.length > 0 && (
          <div className="file-search-list" ref={listRef}>
            {results.map((sq, i) => (
              <div
                key={sq.id}
                className={`file-search-item ${i === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={() => onSelect(sq)}
              >
                <FileText size={13} style={{ color: '#e5c07b', flexShrink: 0, marginRight: 6 }} />
                <span className="file-search-name">{sq.name || t('querySearch.untitledQuery')}</span>
                <span className="file-search-path">{connNames[sq.connectionId] || sq.connectionId}{sq.database ? ` / ${sq.database}` : ''}</span>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && (
          <div className="file-search-empty">
            {queries.length === 0
              ? t('querySearch.noSavedQueriesYet')
              : <Trans t={t} i18nKey="querySearch.noMatch" values={{ query }} />}
          </div>
        )}
      </div>
    </div>
  )
}
