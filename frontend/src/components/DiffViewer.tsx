import React, { useMemo } from 'react'
import { DiffLine } from '../types'

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
      // Parse hunk header for line numbers
      const m = line.text.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        leftLine = parseInt(m[1])
        rightLine = parseInt(m[2])
      }
      rows.push({ left: line, right: line, leftNum: null, rightNum: null, kind: 'hunk' })
      i++
      continue
    }

    if (line.kind === 'context') {
      rows.push({
        left: line, right: line,
        leftNum: leftLine, rightNum: rightLine,
        kind: 'context',
      })
      leftLine++
      rightLine++
      i++
      continue
    }

    // Collect a block of removes and adds
    const removes: DiffLine[] = []
    const adds: DiffLine[] = []
    while (i < lines.length && lines[i].kind === 'remove') {
      removes.push(lines[i++])
    }
    while (i < lines.length && lines[i].kind === 'add') {
      adds.push(lines[i++])
    }

    const maxLen = Math.max(removes.length, adds.length)
    for (let j = 0; j < maxLen; j++) {
      const rem = removes[j] ?? null
      const add = adds[j] ?? null
      rows.push({
        left: rem,
        right: add,
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

function parseDiffLines(unified: string): DiffLine[] {
  const lines: DiffLine[] = []
  for (const raw of unified.split('\n')) {
    if (raw.startsWith('@@')) {
      lines.push({ text: raw, kind: 'hunk' })
    } else if (raw.startsWith('+') && !raw.startsWith('+++')) {
      lines.push({ text: raw.slice(1), kind: 'add' })
    } else if (raw.startsWith('-') && !raw.startsWith('---')) {
      lines.push({ text: raw.slice(1), kind: 'remove' })
    } else if (raw.startsWith(' ')) {
      lines.push({ text: raw.slice(1), kind: 'context' })
    }
  }
  return lines
}

interface Props {
  path: string
  content: string        // unified diff or new content
  originalContent: string
}

export default function DiffViewer({ path, content, originalContent }: Props) {
  const rows = useMemo(() => {
    // If content looks like a unified diff, parse it
    if (content.includes('@@') || content.includes('---') || content.includes('+++')) {
      const lines = parseDiffLines(content)
      return buildSideBySide(lines)
    }
    // Otherwise build a simple add diff
    const newLines = content.split('\n')
    const oldLines = originalContent.split('\n')
    const diffLines: DiffLine[] = []
    const maxLen = Math.max(oldLines.length, newLines.length)
    for (let i = 0; i < maxLen; i++) {
      const old = oldLines[i]
      const nw = newLines[i]
      if (old !== undefined) diffLines.push({ text: old, kind: 'remove' })
      if (nw !== undefined) diffLines.push({ text: nw, kind: 'add' })
    }
    return buildSideBySide(diffLines)
  }, [content, originalContent])

  const filename = path.split('/').pop() || path

  return (
    <div className="diff-viewer" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', flex: 1, fontFamily: "'SF Mono','Fira Code',monospace", fontSize: 12 }}>
        {/* Left column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="diff-column-header">antes — {filename}</div>
          {rows.map((row, i) => (
            <div
              key={i}
              className={`diff-row ${row.kind === 'remove' || row.kind === 'change' ? 'remove' : row.kind === 'hunk' ? 'hunk' : ''}`}
            >
              <span className="diff-line-num">{row.leftNum ?? ''}</span>
              <span className="diff-line-content">
                {row.left?.text ?? ''}
              </span>
            </div>
          ))}
        </div>
        <div className="diff-divider" />
        {/* Right column */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="diff-column-header">depois — {filename}</div>
          {rows.map((row, i) => (
            <div
              key={i}
              className={`diff-row ${row.kind === 'add' || row.kind === 'change' ? 'add' : row.kind === 'hunk' ? 'hunk' : ''}`}
            >
              <span className="diff-line-num">{row.rightNum ?? ''}</span>
              <span className="diff-line-content">
                {row.right?.text ?? ''}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
