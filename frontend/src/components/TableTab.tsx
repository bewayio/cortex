import React, { useEffect, useRef, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { EditorTab } from '../types'
import QueryResultsGrid from './QueryResultsGrid'
import TableProperties from './TableProperties'
import { RunQuery } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type QueryResult = main.QueryResult

interface Props {
  tab: EditorTab
}

// Acima disso, o EXPLAIN gate pede confirmação antes de rodar o filtro de
// verdade. Fixo por ora (não configurável) — ver .specs/tasks/table-tab-properties-and-filter-plan.md.
const HEAVY_QUERY_ROW_THRESHOLD = 50000

function quoteIdent(s: string): string {
  return '`' + s.replace(/`/g, '``') + '`'
}

// Lê a coluna `rows` do resultado de um EXPLAIN e devolve o maior valor entre
// as linhas do plano (uma junção pode ter mais de uma linha de plano).
function maxExplainRows(result: QueryResult): number {
  const idx = result.columns.findIndex(c => c.toLowerCase() === 'rows')
  if (idx === -1) return 0
  let max = 0
  for (const row of result.rows) {
    const n = Number(row[idx])
    if (!Number.isNaN(n) && n > max) max = n
  }
  return max
}

export default function TableTab({ tab }: Props) {
  const { t } = useTranslation('database')
  const [subTab, setSubTab] = useState<'data' | 'properties'>('data')
  const [filterInput, setFilterInput] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [running, setRunning] = useState(false)
  const [pendingQuery, setPendingQuery] = useState<string | null>(null)
  const [pendingEstimate, setPendingEstimate] = useState(0)

  const connectionId = tab.dbConnectionId || ''
  const database = tab.dbDatabase || ''
  const table = tab.dbTable || ''

  const buildQuery = (filter: string) => {
    const base = `SELECT * FROM ${quoteIdent(database)}.${quoteIdent(table)}`
    return filter.trim() ? `${base} WHERE ${filter.trim()}` : base
  }

  // Toda execução da aba Data passa por aqui primeiro — inclusive a carga
  // inicial sem filtro (pedido do usuário: "este input sempre valide o
  // explain antes" é tratado como "toda consulta desta aba", não só quando
  // o usuário digita algo).
  const runGated = async (filter: string) => {
    setRunning(true)
    try {
      const query = buildQuery(filter)
      const explainResult = await RunQuery(connectionId, database, `EXPLAIN ${query}`)
      if (explainResult.error) {
        setResult(explainResult)
        return
      }
      const estimate = maxExplainRows(explainResult)
      if (estimate > HEAVY_QUERY_ROW_THRESHOLD) {
        setPendingQuery(query)
        setPendingEstimate(estimate)
        return
      }
      setResult(await RunQuery(connectionId, database, query))
    } catch (err) {
      setResult({ columns: [], rows: [], rowCount: 0, rowsAffected: 0, durationMs: 0, truncated: false, error: err instanceof Error ? err.message : String(err) } as any)
    } finally {
      setRunning(false)
    }
  }

  const confirmPendingQuery = async () => {
    const query = pendingQuery
    setPendingQuery(null)
    if (!query) return
    setRunning(true)
    try {
      setResult(await RunQuery(connectionId, database, query))
    } finally {
      setRunning(false)
    }
  }

  // Carga inicial (sem filtro) ao abrir a aba.
  const initDoneRef = useRef(false)
  useEffect(() => {
    if (initDoneRef.current) return
    initDoneRef.current = true
    runGated('')
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="table-tab">
      <div className="table-tab-subheader">
        <button
          className={`table-subtab-btn ${subTab === 'data' ? 'active' : ''}`}
          onClick={() => setSubTab('data')}
        >
          {t('tableTab.data')}
        </button>
        <button
          className={`table-subtab-btn ${subTab === 'properties' ? 'active' : ''}`}
          onClick={() => setSubTab('properties')}
        >
          {t('tableTab.properties')}
        </button>
      </div>

      {subTab === 'data' ? (
        <div className="table-data-pane">
          <div className="table-filter-bar">
            <Search size={13} className="table-filter-icon" />
            <input
              className="table-filter-input"
              placeholder={t('tableTab.filterPlaceholder')}
              value={filterInput}
              onChange={e => setFilterInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') runGated(filterInput) }}
            />
            <button className="table-filter-btn" onClick={() => runGated(filterInput)} disabled={running}>
              {running ? t('tableTab.running') : t('tableTab.filter')}
            </button>
          </div>

          <div className="table-data-results">
            <QueryResultsGrid
              result={result}
              emptyMessage={t('loading')}
              downloadFilename={table || 'table'}
            />
          </div>
        </div>
      ) : (
        <TableProperties connectionId={connectionId} database={database} table={table} />
      )}

      {pendingQuery && (
        <div className="ft-confirm-overlay">
          <div className="ft-confirm-dialog">
            <div className="ft-confirm-msg">
              <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 6, color: 'var(--accent)' }} />
              <Trans t={t} i18nKey="tableTab.heavyQueryWarning" values={{ estimate: pendingEstimate.toLocaleString() }} components={{ code: <code /> }} />
            </div>
            <div className="ft-confirm-actions">
              <button className="ft-confirm-btn cancel" onClick={() => setPendingQuery(null)}>{t('common:cancel')}</button>
              <button className="ft-confirm-btn danger" onClick={confirmPendingQuery}>{t('tableTab.filterAnyway')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
