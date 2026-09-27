// Autocomplete de tabelas/colunas para abas de query (SQL). Registrado uma
// única vez no Monaco (module scope) — não por instância de aba — e lê o
// contexto (conexão + base) da aba de query focada no momento da sugestão,
// per .specs/tasks/mysql-query-tabs.md fase 7.
import type * as MonacoNS from 'monaco-editor'
import { ListTables, DescribeTable } from '../../wailsjs/go/main/App'

let activeConnectionId = ''
let activeDatabase = ''
let registered = false

export function setActiveQueryContext(connectionId: string, database: string) {
  activeConnectionId = connectionId
  activeDatabase = database
}

// Cache por "connectionId/database" — evita refetch a cada tecla.
const tableCache = new Map<string, string[]>()
const columnCache = new Map<string, string[]>() // key: connId/db/table

async function getTables(connId: string, db: string): Promise<string[]> {
  const key = `${connId}/${db}`
  if (tableCache.has(key)) return tableCache.get(key)!
  try {
    const tables = await ListTables(connId, db)
    tableCache.set(key, tables)
    return tables
  } catch {
    return []
  }
}

async function getColumns(connId: string, db: string, table: string): Promise<string[]> {
  const key = `${connId}/${db}/${table}`
  if (columnCache.has(key)) return columnCache.get(key)!
  try {
    const cols = await DescribeTable(connId, db, table)
    const names = cols.map(c => c.name)
    columnCache.set(key, names)
    return names
  } catch {
    return []
  }
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN',
  'ORDER BY', 'GROUP BY', 'HAVING', 'LIMIT', 'OFFSET', 'JOIN', 'LEFT JOIN',
  'RIGHT JOIN', 'INNER JOIN', 'ON', 'AS', 'DISTINCT', 'INSERT INTO', 'VALUES',
  'UPDATE', 'SET', 'DELETE FROM', 'CREATE TABLE', 'ALTER TABLE', 'DROP TABLE',
  'COUNT', 'SUM', 'AVG', 'MIN', 'MAX', 'NULL', 'IS NULL', 'IS NOT NULL',
]

export function registerSqlCompletionProvider(monaco: typeof MonacoNS) {
  if (registered) return
  registered = true

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' '],
    provideCompletionItems: async (model, position) => {
      const connId = activeConnectionId
      const db = activeDatabase
      const word = model.getWordUntilPosition(position)
      const range = {
        startLineNumber: position.lineNumber, endLineNumber: position.lineNumber,
        startColumn: word.startColumn, endColumn: word.endColumn,
      }

      const suggestions: MonacoNS.languages.CompletionItem[] = SQL_KEYWORDS.map(kw => ({
        label: kw, kind: monaco.languages.CompletionItemKind.Keyword,
        insertText: kw, range,
      }))

      if (!connId || !db) return { suggestions }

      const tables = await getTables(connId, db)
      for (const t of tables) {
        suggestions.push({
          label: t, kind: monaco.languages.CompletionItemKind.Class,
          insertText: t, detail: 'table', range,
        })
      }

      // Colunas de todas as tabelas já vistas — simples e suficiente para v1
      // (sem resolver qual tabela está no FROM da consulta atual).
      for (const t of tables.slice(0, 20)) {
        const cols = await getColumns(connId, db, t)
        for (const c of cols) {
          suggestions.push({
            label: c, kind: monaco.languages.CompletionItemKind.Field,
            insertText: c, detail: `${t}.${c}`, range,
          })
        }
      }

      return { suggestions }
    },
  })
}
