import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Play, Download, Copy, AlertCircle, Save, Plus } from 'lucide-react'
import type { editor as MonacoEditorNS } from 'monaco-editor'
import { EditorTab } from '../types'
import { useEditorStore } from '../stores/editorStore'
import MonacoEditor from './MonacoEditor'
import { setActiveQueryContext, registerSqlCompletionProvider } from '../utils/sqlAutocomplete'
import { registerGlobalEditorShortcuts } from '../utils/globalEditorShortcuts'
import { splitSqlStatements, statementAtOffset } from '../utils/sqlStatements'
import {
  ListDBConnections, ListDatabases, RunQuery, SaveQueryTab,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type DBConnection = main.DBConnection
type QueryResult = main.QueryResult

interface Props {
  tab: EditorTab
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

export default function QueryTab({ tab }: Props) {
  const { updateTabContent, markTabSaved, openOrFocusTab } = useEditorStore()

  const [connections, setConnections] = useState<DBConnection[]>([])
  const [connectionId, setConnectionId] = useState(tab.dbConnectionId || '')
  const [database, setDatabase] = useState(tab.dbDatabase || '')
  const [databases, setDatabases] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [ranCount, setRanCount] = useState(1)
  const [splitPct, setSplitPct] = useState(55) // % da altura para o editor
  const [savedQueryId, setSavedQueryId] = useState(tab.savedQueryId)
  const [copyFeedback, setCopyFeedback] = useState(false)
  const [saveFeedback, setSaveFeedback] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null)

  // Refs para os valores atuais — os comandos do Monaco (addCommand) são
  // registrados uma vez no mount e, sem isso, ficariam presos aos valores da
  // primeira renderização.
  const stateRef = useRef({ connectionId, database, tabId: tab.id, tabContent: tab.content, tabName: tab.name, savedQueryId })
  stateRef.current = { connectionId, database, tabId: tab.id, tabContent: tab.content, tabName: tab.name, savedQueryId }

  useEffect(() => { ListDBConnections().then(setConnections).catch(() => setConnections([])) }, [])

  // Monaco (@monaco-editor/react) não remonta o <Editor> ao trocar de uma
  // query tab pra outra (sem key por tab), então o onMount não dispara de
  // novo — sem isso, o foco fica preso na aba antiga e o teclado para de
  // responder até um clique manual (mesmo bug do EditorPane.tsx, cenário
  // "aba sem MonacoEditor próprio" não se aplica aqui, mas o de "instância
  // reaproveitada sem remount" sim).
  useEffect(() => { editorRef.current?.focus() }, [tab.id])

  useEffect(() => {
    if (!connectionId) { setDatabases([]); return }
    ListDatabases(connectionId).then(dbs => {
      setDatabases(dbs)
      if (!database && dbs.length === 1) setDatabase(dbs[0])
    }).catch(() => setDatabases([]))
  }, [connectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Autocomplete lê o contexto da aba focada — atualiza sempre que ela é a
  // aba ativa e sua conexão/base mudam.
  const { activeTabId } = useEditorStore()
  useEffect(() => {
    if (activeTabId === tab.id) setActiveQueryContext(connectionId, database)
  }, [activeTabId, tab.id, connectionId, database])

  // Salvar é uma ação explícita do usuário (botão ou Cmd/Ctrl+S) — nunca
  // automático. Salvar em excesso sem pedir criava uma query nova na lista a
  // cada tecla digitada; corrigido a pedido do usuário (2026-09-26).
  const saveQuery = async () => {
    const s = stateRef.current
    try {
      const id = await SaveQueryTab({
        id: s.savedQueryId || '',
        name: s.tabName,
        connectionId: s.connectionId, database: s.database, sql: s.tabContent,
      } as any)
      if (id && !s.savedQueryId) setSavedQueryId(id)
      markTabSaved(s.tabId)
      setSaveFeedback(true)
      setTimeout(() => setSaveFeedback(false), 1200)
      // Avisa a sidebar (DatabasePanel) para recarregar a lista de queries salvas.
      window.dispatchEvent(new Event('bcode:saved-queries-changed'))
    } catch (err) {
      console.error('Failed to save query:', err)
    }
  }

  // Nova aba de query em branco, herdando a conexão/base atual desta aba
  // (se houver) — mais conveniente do que sempre abrir totalmente vazia
  // quando o usuário já está trabalhando numa base específica.
  const newQueryTab = () => {
    const s = stateRef.current
    openOrFocusTab({
      path: `__query_new_${Date.now()}__`,
      name: 'New Query',
      ext: 'sql', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isQueryTab: true,
      dbConnectionId: s.connectionId, dbDatabase: s.database,
    } as any)
  }

  // Se a aba ainda não tem conexão/base escolhida, tenta resolver sozinha em
  // vez de simplesmente não fazer nada: só existindo uma conexão configurada,
  // usa ela; se a conexão trava numa base, usa essa; se só existir uma base
  // na conexão, usa ela. Quando não dá pra adivinhar (mais de uma opção),
  // devolve uma mensagem clara em vez de escolher errado.
  const ensureConnected = async (): Promise<{ connectionId: string; database: string } | { error: string }> => {
    let connId = stateRef.current.connectionId
    let db = stateRef.current.database

    if (!connId) {
      if (connections.length === 1) {
        connId = connections[0].id
        setConnectionId(connId)
      } else if (connections.length === 0) {
        return { error: 'No database connection configured yet. Add one in the Database sidebar.' }
      } else {
        return { error: 'Select a connection above before running — more than one is configured, so it can\'t be guessed.' }
      }
    }

    if (!db) {
      const conn = connections.find(c => c.id === connId)
      if (conn?.database) {
        db = conn.database
        setDatabase(db)
      } else {
        try {
          const dbs = await ListDatabases(connId)
          if (dbs.length === 1) {
            db = dbs[0]
            setDatabase(db)
          } else if (dbs.length === 0) {
            return { error: 'That connection has no databases to run against.' }
          } else {
            return { error: 'Select a database above before running — more than one is available, so it can\'t be guessed.' }
          }
        } catch (err) {
          return { error: `Could not connect to list databases: ${err instanceof Error ? err.message : String(err)}` }
        }
      }
    }

    return { connectionId: connId, database: db }
  }

  const runStatements = async (sqls: string[]) => {
    if (sqls.length === 0) return
    setRunning(true)
    setRanCount(sqls.length)
    try {
      const resolved = await ensureConnected()
      if ('error' in resolved) {
        setResult({ columns: [], rows: [], rowCount: 0, rowsAffected: 0, durationMs: 0, truncated: false, error: resolved.error } as any)
        return
      }
      let last: QueryResult | null = null
      for (const sql of sqls) {
        last = await RunQuery(resolved.connectionId, resolved.database, sql)
        if (last.error) break
      }
      setResult(last)
    } catch (err) {
      setResult({ columns: [], rows: [], rowCount: 0, rowsAffected: 0, durationMs: 0, truncated: false, error: err instanceof Error ? err.message : String(err) } as any)
    } finally {
      setRunning(false)
    }
  }

  // Roda só o statement selecionado, ou o statement sob o cursor (ou o mais
  // próximo) se nada estiver selecionado. Duas queries só rodam juntas quando
  // as duas estão selecionadas e separadas por ';'.
  const runCurrent = () => {
    const ed = editorRef.current
    if (!ed) return
    const model = ed.getModel()
    const selection = ed.getSelection()
    if (!model) return

    if (selection && !selection.isEmpty()) {
      const selectedText = model.getValueInRange(selection)
      const statements = splitSqlStatements(selectedText).map(s => s.sql)
      runStatements(statements.length > 0 ? statements : [selectedText.trim()])
      return
    }

    const offset = model.getOffsetAt(ed.getPosition() ?? { lineNumber: 1, column: 1 })
    const stmt = statementAtOffset(model.getValue(), offset)
    if (stmt) runStatements([stmt.sql])
  }

  const runQuery = () => runCurrent()

  const downloadCSV = () => {
    if (!result) return
    const blob = new Blob([toCSV(result)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(tab.name || 'query').replace(/[^a-z0-9-_]+/gi, '_')}.csv`
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

  const handleSplitDrag = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      const pct = ((ev.clientY - rect.top) / rect.height) * 100
      setSplitPct(Math.max(15, Math.min(85, pct)))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Atalhos ligados direto no editor Monaco (monaco.KeyMod.CtrlCmd = Ctrl no
  // Linux/Windows, Cmd no mac — convenção do próprio Monaco). Ligar num
  // listener de DOM externo não é confiável: o Monaco intercepta/consome boa
  // parte dos eventos de teclado antes de eles borbulharem para fora.
  const handleEditorMount = (ed: MonacoEditorNS.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = ed
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => runCurrent())
    ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveQuery())
  }

  const activeConn = useMemo(() => connections.find(c => c.id === connectionId), [connections, connectionId])
  const dbLocked = !!activeConn?.database

  return (
    <div className="query-tab" ref={containerRef} tabIndex={-1}>
      <div className="query-subheader">
        <select
          className="query-select"
          value={connectionId}
          onChange={e => { setConnectionId(e.target.value); setDatabase('') }}
        >
          <option value="">Select connection…</option>
          {connections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          className="query-select"
          value={database}
          onChange={e => setDatabase(e.target.value)}
          disabled={!connectionId || dbLocked}
        >
          <option value="">Select database…</option>
          {databases.map(d => <option key={d} value={d}>{d}</option>)}
        </select>

        <div className="query-subheader-spacer" />

        <button className="query-toolbar-btn" onClick={newQueryTab} title="New query">
          <Plus size={12} /> New
        </button>
        <button className="query-toolbar-btn" onClick={saveQuery} title="Save query (Cmd/Ctrl+S)">
          <Save size={12} /> {saveFeedback ? 'Saved!' : tab.isModified || !savedQueryId ? 'Save' : 'Saved'}
        </button>
        <button className="query-run-btn" onClick={runQuery} disabled={running} title="Run selection, or statement under cursor (Cmd/Ctrl+Enter) — connects automatically if only one connection/database is available">
          <Play size={13} /> {running ? 'Running…' : 'Run'}
        </button>
      </div>

      <div className="query-split" style={{ gridTemplateRows: `${splitPct}% 6px 1fr` }}>
        <div className="query-editor-pane">
          <MonacoEditor
            path={`${tab.id}.sql`}
            ext="sql"
            content={tab.content}
            onChange={v => updateTabContent(tab.id, v)}
            onMonacoReady={monaco => { registerSqlCompletionProvider(monaco); registerGlobalEditorShortcuts(monaco) }}
            onEditorMount={handleEditorMount}
          />
        </div>

        <div className="query-split-handle" onMouseDown={handleSplitDrag} />

        <div className="query-results-pane">
          {!result ? (
            <div className="query-empty">Place the cursor on a statement (or select one/more, separated by ';') and run it — Cmd/Ctrl+Enter.</div>
          ) : result.error ? (
            <div className="query-error"><AlertCircle size={13} /> {result.error}</div>
          ) : (
            <>
              <div className="query-results-toolbar">
                <span className="query-results-meta">
                  {ranCount > 1 ? `Ran ${ranCount} statements, showing the last · ` : ''}
                  {result.rows.length > 0
                    ? `${result.rowCount} row${result.rowCount === 1 ? '' : 's'}${result.truncated ? ` (truncated at ${result.rowCount})` : ''} · ${result.durationMs}ms`
                    : `${result.rowsAffected} row(s) affected · ${result.durationMs}ms`}
                </span>
                <div className="query-subheader-spacer" />
                {result.rows.length > 0 && (
                  <>
                    <button className="query-toolbar-btn" onClick={downloadCSV} title="Download CSV">
                      <Download size={12} /> CSV
                    </button>
                    <button className="query-toolbar-btn" onClick={copyTSV} title="Copy as TSV">
                      <Copy size={12} /> {copyFeedback ? 'Copied!' : 'Copy'}
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
          )}
        </div>
      </div>
    </div>
  )
}
