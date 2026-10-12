import React, { useEffect, useState } from 'react'
import { Table2 } from 'lucide-react'
import { EditorTab } from '../types'
import { useEditorStore } from '../stores/editorStore'
import { ListTables } from '../../wailsjs/go/main/App'

interface Props {
  tab: EditorTab
}

export default function DatabaseTablesTab({ tab }: Props) {
  const { openOrFocusTab } = useEditorStore()
  const [tables, setTables] = useState<string[]>([])
  const [error, setError] = useState('')
  const [focusedTable, setFocusedTable] = useState<string | null>(null)

  const connectionId = tab.dbConnectionId || ''
  const database = tab.dbDatabase || ''

  useEffect(() => {
    ListTables(connectionId, database)
      .then(setTables)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
  }, [connectionId, database])

  const openTable = (table: string) => {
    openOrFocusTab({
      path: `__table_${connectionId}_${database}_${table}__`,
      name: table,
      ext: '', content: '', originalContent: '',
      isModified: false, isCommitTab: false, isTableTab: true,
      dbConnectionId: connectionId, dbDatabase: database, dbTable: table,
    } as any)
  }

  return (
    <div className="db-tables-tab">
      <div className="db-tables-tab-header">{database}</div>
      {error && <div className="query-error">{error}</div>}
      <div className="db-tables-list">
        {tables.map(t => (
          <div
            key={t}
            className={`db-tables-list-item ${focusedTable === t ? 'focused' : ''}`}
            onClick={() => setFocusedTable(t)}
            onDoubleClick={() => openTable(t)}
          >
            <Table2 size={13} style={{ color: '#98c379' }} />
            <span>{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
