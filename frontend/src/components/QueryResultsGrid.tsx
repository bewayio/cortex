import React, { useState } from 'react'
import { Download, Copy, AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { main } from '../../wailsjs/go/models'

type QueryResult = main.QueryResult

interface Props {
  result: QueryResult | null
  // Mais de um statement rodou (QueryTab's "selection com ';'") — mostra
  // "Ran N statements, showing the last". Omitido (ou 1) em contextos que
  // sempre rodam um único statement (ex: o filtro da aba de tabela).
  ranCount?: number
  emptyMessage: React.ReactNode
  downloadFilename: string
}

// CSV (RFC 4180): aspas se o valor tem vírgula, aspas ou quebra de linha;
// aspas internas viram duas aspas.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

function toCSV(result: QueryResult): string {
  const lines = [result.columns.map(csvCell).join(',')]
  for (const row of result.rows) lines.push(row.map(csvCell).join(','))
  return lines.join('\r\n')
}

function toTSV(result: QueryResult): string {
  const esc = (v: unknown) => (v === null || v === undefined ? '' : String(v).replace(/\t/g, ' ').replace(/\n/g, ' '))
  const lines = [result.columns.map(esc).join('\t')]
  for (const row of result.rows) lines.push(row.map(esc).join('\t'))
  return lines.join('\n')
}

// Grid de resultados compartilhado por QueryTab.tsx e pela sub-aba Data da
// aba de tabela — mesmo cabeçalho (meta + CSV/TSV), mesma grade, mesmos
// estados vazio/erro. Extraído de QueryTab.tsx (2026-10-11) pra evitar
// duplicar essa lógica entre os dois lugares que agora a usam.
export default function QueryResultsGrid({ result, ranCount = 1, emptyMessage, downloadFilename }: Props) {
  const { t } = useTranslation('database')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const downloadCSV = () => {
    if (!result) return
    const blob = new Blob([toCSV(result)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${downloadFilename.replace(/[^a-z0-9-_]+/gi, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyTSV = async () => {
    if (!result) return
    try {
      await navigator.clipboard.writeText(toTSV(result))
      setCopyFeedback(true)
      setTimeout(() => setCopyFeedback(false), 1500)
    } catch (err) {
      console.error('Clipboard copy failed:', err)
    }
  }

  if (!result) {
    return <div className="query-empty">{emptyMessage}</div>
  }
  if (result.error) {
    return <div className="query-error"><AlertCircle size={13} /> {result.error}</div>
  }

  return (
    <>
      <div className="query-results-toolbar">
        <span className="query-results-meta">
          {ranCount > 1 ? `${t('resultsGrid.ranCount', { count: ranCount })} · ` : ''}
          {result.rows.length > 0
            ? `${t('resultsGrid.rowCount', { count: result.rowCount })}${result.truncated ? ` (${t('resultsGrid.truncatedAt', { count: result.rowCount })})` : ''} · ${result.durationMs}ms`
            : `${t('resultsGrid.rowsAffected', { count: result.rowsAffected })} · ${result.durationMs}ms`}
        </span>
        <div className="query-subheader-spacer" />
        {result.rows.length > 0 && (
          <>
            <button className="query-toolbar-btn" onClick={downloadCSV} title={t('resultsGrid.downloadCSV')}>
              <Download size={12} /> CSV
            </button>
            <button className="query-toolbar-btn" onClick={copyTSV} title={t('resultsGrid.copyAsTSV')}>
              <Copy size={12} /> {copyFeedback ? t('resultsGrid.copied') : t('resultsGrid.copy')}
            </button>
          </>
        )}
      </div>
      {result.rows.length > 0 && (
        <div className="query-results-grid-wrap">
          <table className="query-results-grid">
            <thead>
              <tr>{result.columns.map(c => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {result.rows.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>{cell === null || cell === undefined ? <span className="query-null">NULL</span> : String(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
