import React, { useEffect, useRef, useState } from 'react'
import {
  ChevronRight, Database as DatabaseIcon, Table2, Plus, Pencil, Trash2,
  PlugZap, FileText, Folder, FolderPlus, FolderOpen, History, RefreshCw,
} from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { useEditorStore } from '../stores/editorStore'
import { usePlatform } from '../utils/platform'
import {
  ListDBConnections, SaveDBConnection, DeleteDBConnection, TestDBConnection,
  ListDatabases, ListTables, ListSavedQueries, SaveQueryTab,
  ListDBConnectionFolders, CreateDBConnectionFolder, DeleteDBConnectionFolder, MoveDBConnectionToFolder, RenameDBConnectionFolder,
  ListQueryFolders, CreateQueryFolder, DeleteQueryFolder, MoveQueryToFolder, RenameQueryFolder, DeleteQueryTab,
} from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type DBConnection = main.DBConnection
type SavedQuery = main.SavedQuery

interface FormState {
  id: string
  name: string
  host: string
  port: string
  user: string
  password: string
  database: string
  folder: string
}

const emptyForm: FormState = { id: '', name: '', host: '', port: '3306', user: '', password: '', database: '', folder: '' }

type ItemKind = 'connection' | 'query'
type RowKind = ItemKind | 'connection-folder' | 'query-folder'
interface CtxMenu { x: number; y: number; kind: ItemKind; id: string; currentFolder: string }
interface FolderCtxMenu { x: number; y: number; kind: ItemKind; name: string }
interface NewFolderPrompt { kind: ItemKind }
// id = connection.id / query.id, or the folder name for the two folder kinds
// (folders have no separate id — they're just a name other items reference).
interface Renaming { kind: RowKind; id: string; value: string }

export interface DatabasePanelHandle {
  newConnection: () => void
  newConnectionFolder: () => void
}

interface Props {
  actionRef?: React.MutableRefObject<DatabasePanelHandle | null>
}

export default function DatabasePanel({ actionRef }: Props) {
  const { t } = useTranslation('database')
  const { openOrFocusTab } = useEditorStore()

  const [connectionsCollapsed, setConnectionsCollapsed] = useState(false)
  const [queriesCollapsed, setQueriesCollapsed] = useState(false)

  const [connections, setConnections] = useState<DBConnection[]>([])
  const [connectionFolders, setConnectionFolders] = useState<string[]>([])
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([])
  const [queryFolders, setQueryFolders] = useState<string[]>([])

  const [expandedConn, setExpandedConn] = useState<Set<string>>(new Set())
  const [expandedDb, setExpandedDb] = useState<Set<string>>(new Set()) // key: connId/db
  const [expandedFolder, setExpandedFolder] = useState<Set<string>>(new Set()) // key: "connection:Name" | "query:Name"
  const [databasesByConn, setDatabasesByConn] = useState<Record<string, string[]>>({})
  const [tablesByDb, setTablesByDb] = useState<Record<string, string[]>>({})
  // Erro ao listar tabelas de UMA database (key igual a tablesByDb) — não
  // engolido por `.catch(() => [])`, indistinguível de uma database vazia.
  const [dbError, setDbError] = useState<Record<string, string>>({})
  // Foco de UMA tabela (dentro da árvore expandida) — igual em espírito a
  // focusedNode, mas separado porque tabela nunca é alvo de Ctrl+Enter hoje.
  const [focusedTable, setFocusedTable] = useState<string | null>(null) // key: connId/db/table

  const [form, setForm] = useState<FormState | null>(null)
  const [testMsg, setTestMsg] = useState<{ id: string; ok: boolean; msg: string } | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ kind: ItemKind; name: string } | null>(null)

  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)
  const [folderCtxMenu, setFolderCtxMenu] = useState<FolderCtxMenu | null>(null)
  // Drag-and-drop entre pastas: chave do alvo (nome da pasta, ou '__root__'
  // para a seção sem pasta) atualmente sob o cursor — só para o destaque
  // visual, o move em si acontece no drop via moveToFolder (mesma função do
  // menu de contexto "Move to folder", que continua existindo).
  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [newFolderPrompt, setNewFolderPrompt] = useState<NewFolderPrompt | null>(null)
  const [newFolderName, setNewFolderName] = useState('')

  const platform = usePlatform()
  // Nó com foco de teclado na árvore — não substitui o expand/collapse por
  // clique existente, só adiciona um alvo para Ctrl/Cmd+Enter.
  const [focusedNode, setFocusedNode] = useState<
    { kind: 'connection'; connectionId: string } | { kind: 'database'; connectionId: string; database: string } | null
  >(null)
  // Separado de focusedNode: cobre toda linha renomeável (conexão, query,
  // pasta de conexão, pasta de query) para o Enter simples renomear — não
  // reaproveita focusedNode porque esse é usado pelo Ctrl+Enter existente e
  // não cobre queries/pastas.
  const [focusedRow, setFocusedRow] = useState<{ kind: RowKind; id: string } | null>(null)
  const [renaming, setRenaming] = useState<Renaming | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (renaming) { renameInputRef.current?.focus(); renameInputRef.current?.select() }
  }, [renaming])

  const startRename = (kind: RowKind, id: string, currentValue: string) => {
    setRenaming({ kind, id, value: currentValue })
  }

  const startRenameFromFocusedRow = () => {
    if (!focusedRow) return
    if (focusedRow.kind === 'connection') {
      const c = connections.find(c => c.id === focusedRow.id)
      if (c) startRename('connection', c.id, c.name)
    } else if (focusedRow.kind === 'query') {
      const q = savedQueries.find(q => q.id === focusedRow.id)
      if (q) startRename('query', q.id, q.name || '')
    } else {
      startRename(focusedRow.kind, focusedRow.id, focusedRow.id)
    }
  }

  const commitRename = async () => {
    if (!renaming) return
    const value = renaming.value.trim()
    setRenaming(null)
    if (!value) return
    try {
      if (renaming.kind === 'connection') {
        const c = connections.find(c => c.id === renaming.id)
        if (c && value !== c.name) {
          await SaveDBConnection({
            id: c.id, name: value, host: c.host, port: c.port, user: c.user,
            password: '', database: c.database, folder: c.folder,
          } as any)
          loadConnections()
        }
      } else if (renaming.kind === 'query') {
        const q = savedQueries.find(q => q.id === renaming.id)
        if (q && value !== q.name) {
          await SaveQueryTab({ ...q, name: value } as any)
          loadSavedQueries()
        }
      } else if (renaming.kind === 'connection-folder') {
        if (value !== renaming.id) {
          await RenameDBConnectionFolder(renaming.id, value)
          loadConnections()
        }
      } else if (renaming.kind === 'query-folder') {
        if (value !== renaming.id) {
          await RenameQueryFolder(renaming.id, value)
          loadSavedQueries()
        }
      }
    } catch (err) {
      console.error(err)
    }
  }

  const loadConnections = () => {
    ListDBConnections().then(setConnections).catch(() => setConnections([]))
    ListDBConnectionFolders().then(setConnectionFolders).catch(() => setConnectionFolders([]))
  }
  const loadSavedQueries = () => {
    ListSavedQueries().then(setSavedQueries).catch(() => setSavedQueries([]))
    ListQueryFolders().then(setQueryFolders).catch(() => setQueryFolders([]))
  }

  useEffect(() => {
    loadConnections()
    loadSavedQueries()
    // QueryTab dispara isso quando o usuário salva uma query explicitamente
    // (botão/Cmd+Ctrl+S) — a lista não tem outro jeito de saber que mudou.
    const onSaved = () => loadSavedQueries()
    window.addEventListener('bcode:saved-queries-changed', onSaved)
    return () => window.removeEventListener('bcode:saved-queries-changed', onSaved)
  }, [])

  // Busca as tabelas de UMA database. Sucesso limpa qualquer erro anterior;
  // falha NÃO grava `tablesByDb[key]` (nada de cache de lista vazia-por-erro
  // — deixa a chave ausente pra uma próxima tentativa de expandir poder
  // reconsultar de verdade) e grava a mensagem em `dbError[key]`.
  const fetchDbTables = async (connId: string, database: string) => {
    const key = `${connId}/${database}`
    try {
      const tables = await ListTables(connId, database)
      setTablesByDb(prev => ({ ...prev, [key]: tables }))
      setDbError(prev => { const n = { ...prev }; delete n[key]; return n })
    } catch (err) {
      setDbError(prev => ({ ...prev, [key]: err instanceof Error ? err.message : String(err) }))
    }
  }

  // Busca as databases de UMA conexão (e, se travada numa única database,
  // as tabelas dela também — ela própria representa esse nível, ver
  // renderConnectionRow). Falha NÃO grava `databasesByConn[conn.id]` — deixa
  // a chave ausente pra uma próxima tentativa de expandir poder reconsultar
  // de verdade, em vez de cachear um resultado vazio-por-erro.
  const fetchConnDatabases = async (conn: DBConnection) => {
    try {
      const dbs = await ListDatabases(conn.id)
      setDatabasesByConn(prev => ({ ...prev, [conn.id]: dbs }))
      setTestMsg(prev => (prev?.id === conn.id ? null : prev))
      if (conn.database && dbs.length === 1) {
        const key = `${conn.id}/${dbs[0]}`
        await fetchDbTables(conn.id, dbs[0])
        setExpandedDb(prev => new Set(prev).add(key))
      }
    } catch (err) {
      setTestMsg({ id: conn.id, ok: false, msg: err instanceof Error ? err.message : String(err) })
    }
  }

  const toggleConn = async (conn: DBConnection) => {
    const next = new Set(expandedConn)
    if (next.has(conn.id)) {
      next.delete(conn.id)
    } else {
      next.add(conn.id)
      if (!databasesByConn[conn.id]) await fetchConnDatabases(conn)
    }
    setExpandedConn(next)
  }

  const toggleDb = async (connId: string, database: string) => {
    const key = `${connId}/${database}`
    const next = new Set(expandedDb)
    if (next.has(key)) {
      next.delete(key)
    } else {
      next.add(key)
      if (!tablesByDb[key]) await fetchDbTables(connId, database)
    }
    setExpandedDb(next)
  }

  // Força reconectar: limpa databases/tabelas/erros cacheados desta conexão
  // e reconsulta do zero, expandindo a linha caso estivesse colapsada.
  const reconnectConnection = async (conn: DBConnection) => {
    setDatabasesByConn(prev => { const n = { ...prev }; delete n[conn.id]; return n })
    const prefix = `${conn.id}/`
    setTablesByDb(prev => {
      const n = { ...prev }
      Object.keys(n).forEach(k => { if (k.startsWith(prefix)) delete n[k] })
      return n
    })
    setDbError(prev => {
      const n = { ...prev }
      Object.keys(n).forEach(k => { if (k.startsWith(prefix)) delete n[k] })
      return n
    })
    setTestMsg(prev => (prev?.id === conn.id ? null : prev))
    setExpandedConn(prev => new Set(prev).add(conn.id))
    await fetchConnDatabases(conn)
  }

  const toggleFolder = (kind: ItemKind, name: string) => {
    const key = `${kind}:${name}`
    setExpandedFolder(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const openQueryTab = (connId: string, database: string, table?: string) => {
    const sql = table ? `SELECT * FROM ${table} LIMIT 100;` : ''
    openOrFocusTab({
      path: `__query_new_${Date.now()}__`,
      name: table ? table : 'New Query',
      ext: 'sql', content: sql, originalContent: sql,
      isModified: false, isCommitTab: false, isQueryTab: true,
      dbConnectionId: connId, dbDatabase: database,
    } as any)
  }

  const openTableTab = (connId: string, database: string, table: string) => {
    openOrFocusTab({
      path: `__table_${connId}_${database}_${table}__`,
      name: table,
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isTableTab: true,
      dbConnectionId: connId, dbDatabase: database, dbTable: table,
    } as any)
  }

  const openDbTablesTab = (connId: string, database: string) => {
    openOrFocusTab({
      path: `__db_tables_${connId}_${database}__`,
      name: database,
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isDbTablesTab: true,
      dbConnectionId: connId, dbDatabase: database,
    } as any)
  }

  const openSavedQuery = (sq: SavedQuery) => {
    openOrFocusTab({
      path: `__query_${sq.id}__`,
      name: sq.name || 'Query',
      ext: 'sql', content: sq.sql, originalContent: sq.sql,
      isModified: false, isCommitTab: false, isQueryTab: true,
      dbConnectionId: sq.connectionId, dbDatabase: sq.database,
      savedQueryId: sq.id,
    } as any)
  }

  // Reabre a query salva mais recente no escopo (database específico, ou
  // qualquer database da conexão se o escopo for a conexão inteira) — ou
  // cria uma nova em branco nesse mesmo escopo, se não houver nenhuma.
  // Decisão do usuário (2026-09-27): escopo de conexão fica restrito às
  // bases daquela conexão, nunca o app inteiro. Usado tanto pelo Ctrl+Enter
  // no nó focado (sem argumento, cai no focusedNode) quanto pelo botão de
  // ícone "Open Last Used" em cada linha (com o escopo explícito da linha).
  const openLatestOrNewQuery = (scope?: { kind: 'connection' | 'database'; connectionId: string; database?: string }) => {
    const target = scope ?? focusedNode
    if (!target) return
    const candidates = savedQueries.filter(q => {
      if (q.connectionId !== target.connectionId) return false
      if (target.kind === 'database') return q.database === target.database
      return true
    })
    if (candidates.length > 0) {
      const latest = candidates.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
      openSavedQuery(latest)
    } else {
      const db = target.kind === 'database' ? (target.database ?? '') : ''
      openQueryTab(target.connectionId, db)
    }
  }

  const handleTreeKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return
    const mod = platform === 'darwin' ? e.metaKey : e.ctrlKey
    if (e.key === 'Enter' && mod) {
      e.preventDefault()
      openLatestOrNewQuery()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      startRenameFromFocusedRow()
    }
  }

  // Seção "Saved Queries" não tem Ctrl+Enter (só a de conexões tem, por
  // decisão da task anterior) — aqui só o Enter simples de rename importa.
  const handleQueriesTreeKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return
    if (e.key === 'Enter') {
      e.preventDefault()
      startRenameFromFocusedRow()
    }
  }

  const startCreate = () => { setForm({ ...emptyForm }); setTestMsg(null) }
  const startEdit = (c: DBConnection) => {
    setForm({ id: c.id, name: c.name, host: c.host, port: String(c.port || 3306), user: c.user, password: '', database: c.database || '', folder: c.folder || '' })
    setTestMsg(null)
  }

  const saveForm = async () => {
    if (!form) return
    try {
      await SaveDBConnection({
        id: form.id, name: form.name, host: form.host,
        port: parseInt(form.port, 10) || 3306, user: form.user,
        password: form.password, database: form.database, folder: form.folder,
      } as any)
      setForm(null)
      setDatabasesByConn({})
      setTablesByDb({})
      loadConnections()
    } catch (err) {
      setTestMsg({ id: form.id || 'new', ok: false, msg: err instanceof Error ? err.message : String(err) })
    }
  }

  const testForm = async () => {
    if (!form) return
    if (!form.id) {
      try {
        const id = await SaveDBConnection({
          name: form.name || '(test)', host: form.host, port: parseInt(form.port, 10) || 3306,
          user: form.user, password: form.password, database: form.database, folder: form.folder,
        } as any)
        await TestDBConnection(id)
        setTestMsg({ id, ok: true, msg: t('panel.connectedSuccessfully') })
        setForm({ ...form, id })
        loadConnections()
      } catch (err) {
        setTestMsg({ id: 'new', ok: false, msg: err instanceof Error ? err.message : String(err) })
      }
      return
    }
    try {
      await TestDBConnection(form.id)
      setTestMsg({ id: form.id, ok: true, msg: t('panel.connectedSuccessfully') })
    } catch (err) {
      setTestMsg({ id: form.id, ok: false, msg: err instanceof Error ? err.message : String(err) })
    }
  }

  const executeDelete = async (id: string) => {
    await DeleteDBConnection(id).catch(() => {})
    setConfirmDeleteId(null)
    setDatabasesByConn({})
    setTablesByDb({})
    loadConnections()
  }

  const deleteSavedQuery = async (id: string) => {
    await DeleteQueryTab(id).catch(() => {})
    setConfirmDeleteId(null)
    loadSavedQueries()
  }

  // ── Pastas ──────────────────────────────────────────────────────────────
  const openNewFolderPrompt = (kind: ItemKind) => { setNewFolderPrompt({ kind }); setNewFolderName('') }

  // Expõe ações ao pai via actionRef — mesmo padrão de FileExplorerHandle,
  // pro atalho global Ctrl/Cmd+N / Ctrl/Cmd+Shift+N (App.tsx) poder acionar
  // "Nova Conexão"/"Nova Pasta" quando o painel de Database está ativo.
  useEffect(() => {
    if (!actionRef) return
    actionRef.current = {
      newConnection: startCreate,
      newConnectionFolder: () => openNewFolderPrompt('connection'),
    }
  })
  const createFolder = async () => {
    if (!newFolderPrompt || !newFolderName.trim()) { setNewFolderPrompt(null); return }
    if (newFolderPrompt.kind === 'connection') {
      await CreateDBConnectionFolder(newFolderName.trim()).catch(() => {})
      loadConnections()
    } else {
      await CreateQueryFolder(newFolderName.trim()).catch(() => {})
      loadSavedQueries()
    }
    setNewFolderPrompt(null)
  }
  const deleteFolder = async (kind: ItemKind, name: string) => {
    if (kind === 'connection') { await DeleteDBConnectionFolder(name).catch(() => {}); loadConnections() }
    else { await DeleteQueryFolder(name).catch(() => {}); loadSavedQueries() }
    setConfirmDeleteFolder(null)
  }
  const moveToFolder = async (kind: ItemKind, id: string, folder: string) => {
    if (kind === 'connection') { await MoveDBConnectionToFolder(id, folder).catch(() => {}); loadConnections() }
    else { await MoveQueryToFolder(id, folder).catch(() => {}); loadSavedQueries() }
    setCtxMenu(null)
  }

  // ── Drag-and-drop entre pastas ──────────────────────────────────────────
  // MIME type por kind garante que uma conexão só solta em pasta de conexão
  // e uma query só em pasta de query — sem drop cruzado.
  const dndMime = (kind: ItemKind) => `application/x-bcode-${kind}`

  const handleDragStart = (kind: ItemKind, id: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData(dndMime(kind), id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverTarget = (kind: ItemKind, key: string) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(dndMime(kind))) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverKey !== key) setDragOverKey(key)
  }

  const handleDragLeaveTarget = (key: string) => (e: React.DragEvent) => {
    if (dragOverKey === key) setDragOverKey(null)
  }

  const handleDropOnFolder = (kind: ItemKind, folder: string, key: string) => (e: React.DragEvent) => {
    e.preventDefault()
    setDragOverKey(null)
    const id = e.dataTransfer.getData(dndMime(kind))
    if (id) moveToFolder(kind, id, folder)
  }

  const connByFolder = (folder: string) => connections.filter(c => (c.folder || '') === folder)
  const queriesByFolder = (folder: string) => savedQueries.filter(q => (q.folder || '') === folder)

  const renderConnectionRow = (conn: DBConnection, indent: number) => (
    <div key={conn.id}>
      <div
        className={`file-tree-item db-tree-item ${(focusedNode?.kind === 'connection' && focusedNode.connectionId === conn.id) || (focusedRow?.kind === 'connection' && focusedRow.id === conn.id) ? 'focused' : ''}`}
        style={{ paddingLeft: indent }}
        draggable={!(renaming?.kind === 'connection' && renaming.id === conn.id)}
        onDragStart={handleDragStart('connection', conn.id)}
        onClick={() => { setFocusedNode({ kind: 'connection', connectionId: conn.id }); setFocusedRow({ kind: 'connection', id: conn.id }); toggleConn(conn) }}
        onDoubleClick={() => { if (conn.database) openDbTablesTab(conn.id, conn.database) }}
        onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'connection', id: conn.id, currentFolder: conn.folder || '' }) }}
      >
        <span className={`file-tree-item-chevron ${expandedConn.has(conn.id) ? 'expanded' : ''}`}>
          <ChevronRight size={12} />
        </span>
        <span className="file-tree-item-icon"><DatabaseIcon size={14} style={{ color: '#61afef' }} /></span>
        {renaming?.kind === 'connection' && renaming.id === conn.id ? (
          <input
            ref={renameInputRef}
            className="file-tree-inline-input"
            value={renaming.value}
            onChange={e => setRenaming({ ...renaming, value: e.target.value })}
            onKeyDown={e => {
              e.stopPropagation()
              if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
            }}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="file-tree-item-name">{conn.name}</span>
        )}
        <button className="db-row-btn" title={t('panel.newQuery')} onClick={e => { e.stopPropagation(); openQueryTab(conn.id, conn.database || '') }}>
          <FileText size={12} />
        </button>
        <button className="db-row-btn" title={t('panel.openLastUsedQuery')} onClick={e => { e.stopPropagation(); openLatestOrNewQuery({ kind: 'connection', connectionId: conn.id }) }}>
          <History size={12} />
        </button>
        <button className="db-row-btn" title={t('panel.edit')} onClick={e => { e.stopPropagation(); startEdit(conn) }}>
          <Pencil size={12} />
        </button>
        <button className="db-row-btn" title={t('common:delete')} onClick={e => { e.stopPropagation(); setConfirmDeleteId(conn.id) }}>
          <Trash2 size={12} />
        </button>
      </div>

      {confirmDeleteId === conn.id && (
        <div className="ft-confirm-overlay">
          <div className="ft-confirm-dialog">
            <div className="ft-confirm-msg"><Trans t={t} i18nKey="panel.deleteConnectionConfirm" values={{ name: conn.name }} components={{ b: <strong /> }} /></div>
            <div className="ft-confirm-actions">
              <button className="ft-confirm-btn cancel" onClick={() => setConfirmDeleteId(null)}>{t('common:cancel')}</button>
              <button className="ft-confirm-btn danger" onClick={() => executeDelete(conn.id)}>{t('common:delete')}</button>
            </div>
          </div>
        </div>
      )}

      {expandedConn.has(conn.id) && testMsg?.id === conn.id && !testMsg.ok && (
        <div className="db-test-msg err" style={{ marginLeft: indent + 20 }}>{testMsg.msg}</div>
      )}

      {expandedConn.has(conn.id) && (databasesByConn[conn.id] || []).map(dbName => {
        const skipDbLevel = !!conn.database
        const key = `${conn.id}/${dbName}`
        const tableRow = (table: string, pad: number) => {
          const tKey = `${key}/${table}`
          return (
            <div
              key={table}
              className={`file-tree-item ${focusedTable === tKey ? 'focused' : ''}`}
              style={{ paddingLeft: pad }}
              onClick={() => setFocusedTable(tKey)}
              onDoubleClick={() => openTableTab(conn.id, dbName, table)}
            >
              <span className="file-tree-item-icon"><Table2 size={13} style={{ color: '#98c379' }} /></span>
              <span className="file-tree-item-name">{table}</span>
            </div>
          )
        }
        if (skipDbLevel) {
          if (dbError[key]) {
            return (
              <div key={`${dbName}-err`} className="db-test-msg err" style={{ marginLeft: indent + 20 }}>
                {dbError[key]}
              </div>
            )
          }
          return (tablesByDb[key] || []).map(table => tableRow(table, indent + 16))
        }
        return (
          <div key={dbName}>
            <div
              className={`file-tree-item ${focusedNode?.kind === 'database' && focusedNode.connectionId === conn.id && focusedNode.database === dbName ? 'focused' : ''}`}
              style={{ paddingLeft: indent + 16 }}
              onClick={() => { setFocusedNode({ kind: 'database', connectionId: conn.id, database: dbName }); toggleDb(conn.id, dbName) }}
              onDoubleClick={() => openDbTablesTab(conn.id, dbName)}
            >
              <span className={`file-tree-item-chevron ${expandedDb.has(key) ? 'expanded' : ''}`}>
                <ChevronRight size={12} />
              </span>
              <span className="file-tree-item-icon"><DatabaseIcon size={13} style={{ color: '#e5c07b' }} /></span>
              <span className="file-tree-item-name">{dbName}</span>
              <button className="db-row-btn" title={t('panel.newQuery')} onClick={e => { e.stopPropagation(); openQueryTab(conn.id, dbName) }}>
                <FileText size={12} />
              </button>
              <button className="db-row-btn" title={t('panel.openLastUsedQuery')} onClick={e => { e.stopPropagation(); openLatestOrNewQuery({ kind: 'database', connectionId: conn.id, database: dbName }) }}>
                <History size={12} />
              </button>
            </div>
            {expandedDb.has(key) && dbError[key] && (
              <div className="db-test-msg err" style={{ marginLeft: indent + 36 }}>{dbError[key]}</div>
            )}
            {expandedDb.has(key) && !dbError[key] && (tablesByDb[key] || []).map(table => tableRow(table, indent + 32))}
          </div>
        )
      })}
    </div>
  )

  const renderQueryRow = (sq: SavedQuery, indent: number) => (
    <div key={sq.id}
      className={`file-tree-item ${focusedRow?.kind === 'query' && focusedRow.id === sq.id ? 'focused' : ''}`}
      style={{ paddingLeft: indent }}
      draggable={!(renaming?.kind === 'query' && renaming.id === sq.id)}
      onDragStart={handleDragStart('query', sq.id)}
      onClick={() => { setFocusedRow({ kind: 'query', id: sq.id }); openSavedQuery(sq) }}
      onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, kind: 'query', id: sq.id, currentFolder: sq.folder || '' }) }}
    >
      <span className="file-tree-item-icon"><FileText size={13} style={{ color: '#e5c07b' }} /></span>
      {renaming?.kind === 'query' && renaming.id === sq.id ? (
        <input
          ref={renameInputRef}
          className="file-tree-inline-input"
          value={renaming.value}
          onChange={e => setRenaming({ ...renaming, value: e.target.value })}
          onKeyDown={e => {
            e.stopPropagation()
            if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
            if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
          }}
          onBlur={commitRename}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <span className="file-tree-item-name">{sq.name || t('panel.untitledQuery')}</span>
      )}
      <button className="db-row-btn" title={t('common:delete')} onClick={e => { e.stopPropagation(); setConfirmDeleteId(sq.id) }}>
        <Trash2 size={12} />
      </button>
      {confirmDeleteId === sq.id && (
        <div className="ft-confirm-overlay" onClick={e => e.stopPropagation()}>
          <div className="ft-confirm-dialog">
            <div className="ft-confirm-msg"><Trans t={t} i18nKey="panel.deleteQueryConfirm" values={{ name: sq.name || t('panel.untitled') }} components={{ b: <strong /> }} /></div>
            <div className="ft-confirm-actions">
              <button className="ft-confirm-btn cancel" onClick={() => setConfirmDeleteId(null)}>{t('common:cancel')}</button>
              <button className="ft-confirm-btn danger" onClick={() => deleteSavedQuery(sq.id)}>{t('common:delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )

  const allFoldersFor = (kind: ItemKind) => kind === 'connection' ? connectionFolders : queryFolders

  const renderFolderRow = (kind: ItemKind, folderName: string, count: number) => {
    const rowKind: RowKind = kind === 'connection' ? 'connection-folder' : 'query-folder'
    const key = `${kind}:${folderName}`
    const noun = kind === 'connection' ? t('panel.connectionsNoun') : t('panel.queriesNoun')
    return (
      <div key={folderName}>
        <div
          className={`file-tree-item db-folder-row ${focusedRow?.kind === rowKind && focusedRow.id === folderName ? 'focused' : ''} ${dragOverKey === key ? 'drag-over' : ''}`}
          style={{ paddingLeft: 4 }}
          onClick={() => { setFocusedRow({ kind: rowKind, id: folderName }); toggleFolder(kind, folderName) }}
          onContextMenu={e => { e.preventDefault(); setFolderCtxMenu({ x: e.clientX, y: e.clientY, kind, name: folderName }) }}
          onDragOver={handleDragOverTarget(kind, key)}
          onDragLeave={handleDragLeaveTarget(key)}
          onDrop={handleDropOnFolder(kind, folderName, key)}
        >
          <span className={`file-tree-item-chevron ${expandedFolder.has(key) ? 'expanded' : ''}`}>
            <ChevronRight size={12} />
          </span>
          <span className="file-tree-item-icon">
            {expandedFolder.has(key) ? <FolderOpen size={14} style={{ color: '#e5c07b' }} /> : <Folder size={14} style={{ color: '#e5c07b' }} />}
          </span>
          {renaming?.kind === rowKind && renaming.id === folderName ? (
            <input
              ref={renameInputRef}
              className="file-tree-inline-input"
              value={renaming.value}
              onChange={e => setRenaming({ ...renaming, value: e.target.value })}
              onKeyDown={e => {
                e.stopPropagation()
                if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
                if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
              }}
              onBlur={commitRename}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            <span className="file-tree-item-name">{folderName}</span>
          )}
          <span className="db-folder-count">{count}</span>
          <button className="db-row-btn" title={t('panel.deleteFolder')} onClick={e => { e.stopPropagation(); setConfirmDeleteFolder({ kind, name: folderName }) }}>
            <Trash2 size={12} />
          </button>
        </div>
        {confirmDeleteFolder?.kind === kind && confirmDeleteFolder.name === folderName && (
          <div className="ft-confirm-overlay">
            <div className="ft-confirm-dialog">
              <div className="ft-confirm-msg"><Trans t={t} i18nKey="panel.deleteFolderConfirm" values={{ name: folderName, noun }} components={{ b: <strong /> }} /></div>
              <div className="ft-confirm-actions">
                <button className="ft-confirm-btn cancel" onClick={() => setConfirmDeleteFolder(null)}>{t('common:cancel')}</button>
                <button className="ft-confirm-btn danger" onClick={() => deleteFolder(kind, folderName)}>{t('common:delete')}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="database-panel">
      <div className="sidebar-panel-header">
        <span>{t('panel.title')}</span>
      </div>

      <div className="sidebar-panel-content">
        {/* ── Conexões ── */}
        <div className="git-section" style={{ flex: connectionsCollapsed ? '0 0 28px' : '1 1 auto', minHeight: connectionsCollapsed ? 28 : 80 }}>
          <div
            className={`git-section-header ${dragOverKey === 'connection:__root__' ? 'drag-over' : ''}`}
            onClick={() => setConnectionsCollapsed(v => !v)}
            onDragOver={handleDragOverTarget('connection', 'connection:__root__')}
            onDragLeave={handleDragLeaveTarget('connection:__root__')}
            onDrop={handleDropOnFolder('connection', '', 'connection:__root__')}
          >
            <span className={`git-section-chevron ${connectionsCollapsed ? 'collapsed' : ''}`} style={{ transform: connectionsCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              <ChevronRight size={12} />
            </span>
            <span style={{ flex: 1 }}>{t('panel.connections')}</span>
            <button className="db-row-btn db-section-btn" title={t('panel.newFolder')} onClick={e => { e.stopPropagation(); openNewFolderPrompt('connection') }}>
              <FolderPlus size={13} />
            </button>
            <button className="db-row-btn db-section-btn" title={t('panel.newConnection')} onClick={e => { e.stopPropagation(); startCreate() }}>
              <Plus size={13} />
            </button>
          </div>

          {!connectionsCollapsed && (
            <div className="git-section-content" tabIndex={0} onKeyDown={handleTreeKeyDown}>
              {newFolderPrompt?.kind === 'connection' && (
                <div className="db-new-folder-row">
                  <input
                    className="cc-settings-input" autoFocus placeholder={t('panel.folderNamePlaceholder')}
                    value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderPrompt(null) }}
                    onBlur={createFolder}
                  />
                </div>
              )}

              {form && (
                <div className="cc-settings db-conn-form">
                  <div className="cc-settings-row">
                    <input className="cc-settings-input" placeholder={t('panel.form.name')} value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })} autoFocus />
                  </div>
                  <div className="cc-settings-row">
                    <input className="cc-settings-input" placeholder={t('panel.form.host')} value={form.host}
                      onChange={e => setForm({ ...form, host: e.target.value })} style={{ flex: 2 }} />
                    <input className="cc-settings-input" placeholder={t('panel.form.port')} value={form.port}
                      onChange={e => setForm({ ...form, port: e.target.value })} style={{ flex: 1 }} />
                  </div>
                  <div className="cc-settings-row">
                    <input className="cc-settings-input" placeholder={t('panel.form.user')} value={form.user}
                      onChange={e => setForm({ ...form, user: e.target.value })} />
                  </div>
                  <div className="cc-settings-row">
                    <input className="cc-settings-input" type="password"
                      placeholder={form.id ? t('panel.form.passwordKeepCurrent') : t('panel.form.password')}
                      value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
                  </div>
                  <div className="cc-settings-row">
                    <input className="cc-settings-input" placeholder={t('panel.form.databaseOptional')}
                      value={form.database} onChange={e => setForm({ ...form, database: e.target.value })} />
                  </div>
                  <div className="cc-settings-row">
                    <select className="query-select db-form-select" value={form.folder} onChange={e => setForm({ ...form, folder: e.target.value })}>
                      <option value="">{t('panel.noFolder')}</option>
                      {connectionFolders.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  {testMsg && (form.id === testMsg.id || (!form.id && testMsg.id === 'new')) && (
                    <div className={`db-test-msg ${testMsg.ok ? 'ok' : 'err'}`}>{testMsg.msg}</div>
                  )}
                  <div className="cc-settings-actions">
                    <button className="cc-settings-save" onClick={saveForm}>{t('common:save')}</button>
                    <button className="cc-settings-cancel" onClick={testForm}><PlugZap size={11} /> {t('panel.test')}</button>
                    <button className="cc-settings-cancel" onClick={() => setForm(null)}>{t('common:cancel')}</button>
                  </div>
                </div>
              )}

              {connections.length === 0 && !form && (
                <div className="no-workspace-text" style={{ padding: 16 }}>
                  {t('panel.noConnectionsYet')}
                </div>
              )}

              {connectionFolders.map(folderName => {
                const key = `connection:${folderName}`
                const items = connByFolder(folderName)
                return (
                  <React.Fragment key={folderName}>
                    {renderFolderRow('connection', folderName, items.length)}
                    {expandedFolder.has(key) && items.map(c => renderConnectionRow(c, 24))}
                  </React.Fragment>
                )
              })}

              {connByFolder('').map(c => renderConnectionRow(c, 4))}
            </div>
          )}
        </div>

        <div className="sidebar-divider" />

        {/* ── Queries salvas ── */}
        <div className="git-section" style={{ flex: queriesCollapsed ? '0 0 28px' : '1 1 auto', minHeight: queriesCollapsed ? 28 : 60 }}>
          <div
            className={`git-section-header ${dragOverKey === 'query:__root__' ? 'drag-over' : ''}`}
            onClick={() => setQueriesCollapsed(v => !v)}
            onDragOver={handleDragOverTarget('query', 'query:__root__')}
            onDragLeave={handleDragLeaveTarget('query:__root__')}
            onDrop={handleDropOnFolder('query', '', 'query:__root__')}
          >
            <span className={`git-section-chevron ${queriesCollapsed ? 'collapsed' : ''}`} style={{ transform: queriesCollapsed ? 'rotate(0deg)' : 'rotate(90deg)' }}>
              <ChevronRight size={12} />
            </span>
            <span style={{ flex: 1 }}>{t('panel.savedQueries')}</span>
            <button className="db-row-btn db-section-btn" title={t('panel.newFolder')} onClick={e => { e.stopPropagation(); openNewFolderPrompt('query') }}>
              <FolderPlus size={13} />
            </button>
          </div>

          {!queriesCollapsed && (
            <div className="git-section-content" tabIndex={0} onKeyDown={handleQueriesTreeKeyDown}>
              {newFolderPrompt?.kind === 'query' && (
                <div className="db-new-folder-row">
                  <input
                    className="cc-settings-input" autoFocus placeholder={t('panel.folderNamePlaceholder')}
                    value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setNewFolderPrompt(null) }}
                    onBlur={createFolder}
                  />
                </div>
              )}

              {savedQueries.length === 0 && (
                <div className="no-workspace-text" style={{ padding: 16 }}>
                  {t('panel.noSavedQueriesYet')}
                </div>
              )}

              {queryFolders.map(folderName => {
                const key = `query:${folderName}`
                const items = queriesByFolder(folderName)
                return (
                  <React.Fragment key={folderName}>
                    {renderFolderRow('query', folderName, items.length)}
                    {expandedFolder.has(key) && items.map(sq => renderQueryRow(sq, 24))}
                  </React.Fragment>
                )
              })}

              {queriesByFolder('').map(sq => renderQueryRow(sq, 4))}
            </div>
          )}
        </div>
      </div>

      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setCtxMenu(null)} />
          <div className="context-menu" style={{ top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999 }}>
            <div className="context-menu-item" onClick={() => {
              const current = ctxMenu.kind === 'connection'
                ? connections.find(c => c.id === ctxMenu.id)?.name
                : savedQueries.find(q => q.id === ctxMenu.id)?.name
              setCtxMenu(null)
              startRename(ctxMenu.kind, ctxMenu.id, current || '')
            }}>
              <Pencil size={13} /> {t('panel.rename')}
            </div>
            {ctxMenu.kind === 'connection' && (
              <div className="context-menu-item" onClick={() => {
                const conn = connections.find(c => c.id === ctxMenu.id)
                setCtxMenu(null)
                if (conn) reconnectConnection(conn)
              }}>
                <RefreshCw size={13} /> {t('panel.reconnect')}
              </div>
            )}
            <div className="context-menu-separator" />
            <div className="context-menu-label">{t('panel.moveToFolder')}</div>
            {ctxMenu.currentFolder && (
              <div className="context-menu-item" onClick={() => moveToFolder(ctxMenu.kind, ctxMenu.id, '')}>
                <Folder size={13} /> {t('panel.noFolder')}
              </div>
            )}
            {allFoldersFor(ctxMenu.kind).filter(f => f !== ctxMenu.currentFolder).map(f => (
              <div key={f} className="context-menu-item" onClick={() => moveToFolder(ctxMenu.kind, ctxMenu.id, f)}>
                <Folder size={13} /> {f}
              </div>
            ))}
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={() => { setCtxMenu(null); openNewFolderPrompt(ctxMenu.kind) }}>
              <FolderPlus size={13} /> {t('panel.newFolderEllipsis')}
            </div>
          </div>
        </>
      )}

      {folderCtxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setFolderCtxMenu(null)} />
          <div className="context-menu" style={{ top: folderCtxMenu.y, left: folderCtxMenu.x, zIndex: 9999 }}>
            <div className="context-menu-item" onClick={() => {
              const rowKind: RowKind = folderCtxMenu.kind === 'connection' ? 'connection-folder' : 'query-folder'
              const name = folderCtxMenu.name
              setFolderCtxMenu(null)
              startRename(rowKind, name, name)
            }}>
              <Pencil size={13} /> {t('panel.rename')}
            </div>
            <div className="context-menu-separator" />
            <div className="context-menu-item danger" onClick={() => {
              setConfirmDeleteFolder({ kind: folderCtxMenu.kind, name: folderCtxMenu.name })
              setFolderCtxMenu(null)
            }}>
              <Trash2 size={13} /> {t('panel.deleteFolder')}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
