import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Command } from '../utils/commands'

interface Props {
  commands: Command[]
  onClose: () => void
}

export default function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const results = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c => c.label.toLowerCase().includes(q))
  }, [query, commands])

  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  useEffect(() => {
    const el = listRef.current?.children[activeIdx] as HTMLElement
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const run = (c: Command) => {
    onClose()
    c.run()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(v => Math.min(v + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(v => Math.max(v - 1, 0))
    } else if (e.key === 'Enter') {
      const c = results[activeIdx]
      if (c) run(c)
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
            placeholder="Type a command…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {results.length > 0 && (
          <div className="file-search-list" ref={listRef}>
            {results.map((c, i) => (
              <div
                key={c.id}
                className={`file-search-item ${i === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={() => run(c)}
              >
                <span className="file-search-name">{c.label}</span>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && (
          <div className="file-search-empty">No commands match "{query}"</div>
        )}
      </div>
    </div>
  )
}
