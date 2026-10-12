import React, { useState, useEffect, useRef, useMemo } from 'react'
import { Search } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { FileNode } from '../types'

interface Props {
  onClose: () => void
  onSelect: (path: string, name: string, ext: string) => void
}

function flattenTree(node: FileNode, result: FileNode[] = []): FileNode[] {
  if (!node.isDir) result.push(node)
  node.children?.forEach(c => flattenTree(c, result))
  return result
}

function score(file: FileNode, q: string): number {
  const name = file.name.toLowerCase()
  const path = file.path.toLowerCase()
  if (name === q)            return 100
  if (name.startsWith(q))   return 80
  if (name.includes(q))     return 60
  if (path.includes(q))     return 40
  return 0
}

export default function FileSearch({ onClose, onSelect }: Props) {
  const { t } = useTranslation('explorer')
  const { fileTree } = useWorkspaceStore()
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef     = useRef<HTMLInputElement>(null)
  const listRef      = useRef<HTMLDivElement>(null)

  const allFiles = useMemo(() =>
    fileTree ? flattenTree(fileTree) : [],
    [fileTree]
  )

  const results = useMemo(() => {
    if (!query.trim()) return allFiles.slice(0, 50)
    const q = query.toLowerCase()
    return allFiles
      .map(f => ({ f, s: score(f, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 50)
      .map(x => x.f)
  }, [query, allFiles])

  useEffect(() => { setActiveIdx(0) }, [query])
  useEffect(() => { inputRef.current?.focus() }, [])

  // Scroll para o item ativo
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
      const f = results[activeIdx]
      if (f) onSelect(f.path, f.name, f.ext)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  const highlight = (text: string) => {
    if (!query) return text
    const idx = text.toLowerCase().indexOf(query.toLowerCase())
    if (idx < 0) return text
    return <>
      {text.slice(0, idx)}
      <mark className="file-search-highlight">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  }

  return (
    <div className="file-search-overlay" onMouseDown={onClose}>
      <div className="file-search-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="file-search-input-row">
          <Search size={14} className="file-search-icon" />
          <input
            ref={inputRef}
            className="file-search-input"
            placeholder={t('fileSearch.placeholder')}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {results.length > 0 && (
          <div className="file-search-list" ref={listRef}>
            {results.map((f, i) => (
              <div
                key={f.path}
                className={`file-search-item ${i === activeIdx ? 'active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onMouseDown={() => onSelect(f.path, f.name, f.ext)}
              >
                <span className="file-search-name">{highlight(f.name)}</span>
                <span className="file-search-path">{f.path}</span>
              </div>
            ))}
          </div>
        )}

        {results.length === 0 && query && (
          <div className="file-search-empty">
            <Trans t={t} i18nKey="fileSearch.noMatch" values={{ query }} />
          </div>
        )}
      </div>
    </div>
  )
}
