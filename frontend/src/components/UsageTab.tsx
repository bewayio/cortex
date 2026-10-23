import React, { useEffect, useMemo, useState } from 'react'
import { Home, Keyboard } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GetClaudeTokenUsage } from '../../wailsjs/go/main/App'
import WorkspaceList from './WorkspaceList'
import { usePlatform } from '../utils/platform'
import type { Workspace } from '../types'

type Grouping = 'day' | 'week' | 'month'

interface DailyUsage {
  date: string // YYYY-MM-DD, UTC
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
}

interface Bucket {
  key: string
  label: string
  inputTokens: number
  outputTokens: number
  cacheCreationTokens: number
  cacheReadTokens: number
  total: number
}

interface Props {
  onOpenWorkspace: (path: string) => void
  onRemoveWorkspace: (ws: Workspace) => void
}

// Semana ISO (segunda a domingo), em UTC — mesma base de data usada pelo backend.
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const dayNum = (date.getUTCDay() + 6) % 7 // 0 = segunda
  date.setUTCDate(date.getUTCDate() - dayNum + 3) // quinta da mesma semana
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week = 1 + Math.round(
    ((date.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  )
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function groupUsage(days: DailyUsage[], grouping: Grouping): Bucket[] {
  const map = new Map<string, Bucket>()
  for (const d of days) {
    const dt = new Date(d.date + 'T00:00:00Z')
    let key: string
    let label: string
    if (grouping === 'day') {
      key = d.date
      label = d.date.slice(5) // MM-DD
    } else if (grouping === 'week') {
      key = isoWeekKey(dt)
      label = key.slice(5)
    } else {
      key = d.date.slice(0, 7) // YYYY-MM
      label = key.slice(5)
    }
    let b = map.get(key)
    if (!b) {
      b = { key, label, inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0, total: 0 }
      map.set(key, b)
    }
    b.inputTokens += d.inputTokens
    b.outputTokens += d.outputTokens
    b.cacheCreationTokens += d.cacheCreationTokens
    b.cacheReadTokens += d.cacheReadTokens
    b.total = b.inputTokens + b.outputTokens + b.cacheCreationTokens + b.cacheReadTokens
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key))
}

function formatTokens(n: number): string {
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'b'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'm'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

// Aba de boas-vindas de uso: gráfico de tokens do Claude Code no topo, projetos
// recentes embaixo. Abre no editor (estilo "Welcome" do VS Code), não na
// sidebar — veja ADR/spec em .specs/modules/usage.md.
const SHORTCUTS: { combo: string; descKey: string }[] = [
  { combo: 'Mod+Tab', descKey: 'nextTab' },
  { combo: 'Mod+Shift+Tab', descKey: 'previousTab' },
  { combo: 'Mod+↑/↓', descKey: 'switchProject' },
  { combo: 'Mod+P', descKey: 'goToFile' },
  { combo: 'Mod+Shift+P', descKey: 'commandPalette' },
  { combo: 'Mod+Q', descKey: 'lastUsedQuery' },
  { combo: 'Mod+Enter', descKey: 'explorerOpenFocused' },
  { combo: 'Mod+Enter', descKey: 'databaseOpenLatest' },
  { combo: 'Mod+=/-/0', descKey: 'zoom' },
  { combo: 'Ctrl+`', descKey: 'toggleTerminal' },
]

export default function UsageTab({ onOpenWorkspace, onRemoveWorkspace }: Props) {
  const { t } = useTranslation('usage')
  const platform = usePlatform()
  const modLabel = platform === 'darwin' ? 'Cmd' : 'Ctrl'
  const [days, setDays] = useState<DailyUsage[] | null>(null)
  const [error, setError] = useState(false)
  const [grouping, setGrouping] = useState<Grouping>('day')
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    GetClaudeTokenUsage()
      .then(res => { if (alive) setDays(res as DailyUsage[]) })
      .catch(() => { if (alive) { setDays([]); setError(true) } })
    return () => { alive = false }
  }, [])

  const buckets = useMemo(() => groupUsage(days ?? [], grouping), [days, grouping])
  const max = useMemo(() => Math.max(1, ...buckets.map(b => b.total)), [buckets])
  const totalAll = useMemo(() => buckets.reduce((s, b) => s + b.total, 0), [buckets])

  return (
    <div className="usage-tab">
      <div className="usage-tab-inner">
        <div className="usage-tab-header">
          <Home size={22} style={{ color: 'var(--accent)' }} />
          <div>
            <div className="usage-tab-title">{t('title')}</div>
            <div className="usage-tab-subtitle">{t('subtitle')}</div>
          </div>
        </div>

        <div className="usage-tab-chart-card">
          <div className="usage-chart-header">
            <span className="usage-chart-title">{t('tokens')}</span>
            <div className="usage-grouping">
              {(['day', 'week', 'month'] as Grouping[]).map(g => (
                <button
                  key={g}
                  className={`usage-grouping-btn ${grouping === g ? 'active' : ''}`}
                  onClick={() => setGrouping(g)}
                >
                  {t(`grouping.${g}`)}
                </button>
              ))}
            </div>
          </div>

          {days === null ? (
            <div className="usage-empty">{t('loading')}</div>
          ) : error ? (
            <div className="usage-empty">{t('couldNotReadUsage')}</div>
          ) : buckets.length === 0 ? (
            <div className="usage-empty">{t('noUsageFound')}</div>
          ) : (
            <>
              {/* Área de detalhe com altura fixa: total geral parado, ou o
                  detalhe do bucket sob o mouse — nunca sobrepõe as barras. */}
              {hoverIdx !== null && buckets[hoverIdx] ? (
                <div className="usage-detail usage-detail-wide">
                  <div className="usage-detail-title">{buckets[hoverIdx].key}</div>
                  <div className="usage-detail-grid">
                    <div className="usage-detail-row"><span>{t('detail.input')}</span><span>{formatTokens(buckets[hoverIdx].inputTokens)}</span></div>
                    <div className="usage-detail-row"><span>{t('detail.output')}</span><span>{formatTokens(buckets[hoverIdx].outputTokens)}</span></div>
                    <div className="usage-detail-row"><span>{t('detail.cacheWrite')}</span><span>{formatTokens(buckets[hoverIdx].cacheCreationTokens)}</span></div>
                    <div className="usage-detail-row"><span>{t('detail.cacheRead')}</span><span>{formatTokens(buckets[hoverIdx].cacheReadTokens)}</span></div>
                  </div>
                  <div className="usage-detail-row usage-detail-total"><span>{t('detail.total')}</span><span>{formatTokens(buckets[hoverIdx].total)}</span></div>
                </div>
              ) : (
                <div className="usage-detail usage-detail-wide usage-detail-idle">
                  <div className="usage-detail-total-only">{formatTokens(totalAll)}</div>
                  <div className="usage-detail-hint">{t('detail.hoverHint')}</div>
                </div>
              )}
              <div className="usage-chart usage-chart-wide" onMouseLeave={() => setHoverIdx(null)}>
                {buckets.map((b, i) => (
                  <div
                    key={b.key}
                    className="usage-bar-col"
                    onMouseEnter={() => setHoverIdx(i)}
                  >
                    <div className="usage-bar-track">
                      <div
                        className="usage-bar-fill"
                        style={{ height: `${Math.max(2, (b.total / max) * 100)}%` }}
                      />
                    </div>
                    <span className="usage-bar-label">{b.label}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="usage-tab-chart-card">
          <div className="usage-chart-header">
            <span className="usage-chart-title"><Keyboard size={12} /> {t('shortcutsTitle')}</span>
          </div>
          <div className="usage-shortcuts-grid">
            {SHORTCUTS.map((s, i) => (
              <div className="usage-shortcut-row" key={i}>
                <span>{t(`shortcuts.${s.descKey}`)}</span>
                <span className="usage-shortcut-key">{s.combo.replace('Mod', modLabel)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="usage-tab-recent">
          <WorkspaceList onOpenWorkspace={onOpenWorkspace} onRemoveWorkspace={onRemoveWorkspace} source="everOpened" />
        </div>
      </div>
    </div>
  )
}
