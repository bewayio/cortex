import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import MonacoEditor from './MonacoEditor'
import { GetTableDetails } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'

type TableDetails = main.TableDetails

interface Props {
  connectionId: string
  database: string
  table: string
}

type Section = 'constraints' | 'foreignKeys' | 'references' | 'triggers' | 'indexes' | 'partitions' | 'statistics' | 'ddl'

function EmptySection({ text }: { text: string }) {
  return <div className="table-properties-empty">{text}</div>
}

function SimpleTable({ columns, rows, noRowsText }: { columns: string[]; rows: (string | number)[][]; noRowsText: string }) {
  if (rows.length === 0) return <EmptySection text={noRowsText} />
  return (
    <table className="query-results-grid">
      <thead><tr>{columns.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>{row.map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
        ))}
      </tbody>
    </table>
  )
}

// GetTableDetails fica em cache por aba (connectionId+database+table não
// muda durante a vida da aba) — mesma ideia do cache de autocomplete em
// sqlAutocomplete.ts, evita reconsultar sempre que o usuário troca de seção.
export default function TableProperties({ connectionId, database, table }: Props) {
  const { t } = useTranslation('database')
  const [section, setSection] = useState<Section>('constraints')
  const [details, setDetails] = useState<TableDetails | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    GetTableDetails(connectionId, database, table)
      .then(setDetails)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
  }, [connectionId, database, table])

  const SECTIONS: { key: Section; label: string }[] = [
    { key: 'constraints', label: t('tableProperties.sections.constraints') },
    { key: 'foreignKeys',  label: t('tableProperties.sections.foreignKeys') },
    { key: 'references',  label: t('tableProperties.sections.references') },
    { key: 'triggers',    label: t('tableProperties.sections.triggers') },
    { key: 'indexes',     label: t('tableProperties.sections.indexes') },
    { key: 'partitions',  label: t('tableProperties.sections.partitions') },
    { key: 'statistics',  label: t('tableProperties.sections.statistics') },
    { key: 'ddl',         label: t('tableProperties.sections.ddl') },
  ]

  if (error) return <div className="query-error">{error}</div>
  if (!details) return <div className="table-properties-empty">{t('loading')}</div>

  const yesNo = (v: boolean) => v ? t('tableProperties.yes') : t('tableProperties.no')

  return (
    <div className="table-properties-pane">
      <div className="table-tab-subheader table-properties-subheader">
        {SECTIONS.map(s => (
          <button
            key={s.key}
            className={`table-subtab-btn ${section === s.key ? 'active' : ''}`}
            onClick={() => setSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="table-properties-content">
        {section === 'constraints' && (
          details.constraints.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.type'), t('tableProperties.columns.columns')]}
                rows={details.constraints.map(c => [c.name, c.type, c.columns.join(', ')])}
                noRowsText={t('tableProperties.empty.constraints')} />
            : <EmptySection text={t('tableProperties.empty.constraints')} />
        )}
        {section === 'foreignKeys' && (
          details.foreignKeys.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.column'), t('tableProperties.columns.references')]}
                rows={details.foreignKeys.map(fk => [fk.name, fk.column, `${fk.referencedSchema}.${fk.referencedTable}.${fk.referencedColumn} (ON UPDATE ${fk.onUpdate}, ON DELETE ${fk.onDelete})`])}
                noRowsText={t('tableProperties.empty.foreignKeys')} />
            : <EmptySection text={t('tableProperties.empty.foreignKeys')} />
        )}
        {section === 'references' && (
          details.references.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.from'), t('tableProperties.columns.column')]}
                rows={details.references.map(fk => [fk.name, `${fk.referencedSchema}.${fk.referencedTable}`, `${fk.column} → ${fk.referencedColumn}`])}
                noRowsText={t('tableProperties.empty.references')} />
            : <EmptySection text={t('tableProperties.empty.references')} />
        )}
        {section === 'triggers' && (
          details.triggers.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.timing'), t('tableProperties.columns.event'), t('tableProperties.columns.statement')]}
                rows={details.triggers.map(tr => [tr.name, tr.timing, tr.event, tr.statement])}
                noRowsText={t('tableProperties.empty.triggers')} />
            : <EmptySection text={t('tableProperties.empty.triggers')} />
        )}
        {section === 'indexes' && (
          details.indexes.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.unique'), t('tableProperties.columns.type'), t('tableProperties.columns.columns')]}
                rows={details.indexes.map(ix => [ix.name, yesNo(ix.unique), ix.type, ix.columns.join(', ')])}
                noRowsText={t('tableProperties.empty.indexes')} />
            : <EmptySection text={t('tableProperties.empty.indexes')} />
        )}
        {section === 'partitions' && (
          details.partitions.length
            ? <SimpleTable
                columns={[t('tableProperties.columns.name'), t('tableProperties.columns.method'), t('tableProperties.columns.expression'), t('tableProperties.columns.description'), t('tableProperties.columns.rows')]}
                rows={details.partitions.map(p => [p.name, p.method, p.expression, p.description, p.rows])}
                noRowsText={t('tableProperties.empty.partitions')} />
            : <EmptySection text={t('tableProperties.empty.partitions')} />
        )}
        {section === 'statistics' && (
          <SimpleTable
            columns={[t('tableProperties.columns.metric'), t('tableProperties.columns.value')]}
            noRowsText={t('tableProperties.empty.statistics')}
            rows={[
              [t('tableProperties.stats.engine'), details.statistics.engine],
              [t('tableProperties.stats.rowsEstimate'), details.statistics.rowsEstimate],
              [t('tableProperties.stats.dataLength'), details.statistics.dataLength],
              [t('tableProperties.stats.indexLength'), details.statistics.indexLength],
              [t('tableProperties.stats.avgRowLength'), details.statistics.avgRowLength],
              [t('tableProperties.stats.autoIncrement'), details.statistics.autoIncrement],
              [t('tableProperties.stats.collation'), details.statistics.collation],
              [t('tableProperties.stats.created'), details.statistics.createdAt],
              [t('tableProperties.stats.updated'), details.statistics.updatedAt],
            ]} />
        )}
        {section === 'ddl' && (
          <div className="table-properties-ddl">
            <MonacoEditor path={`${table}-ddl.sql`} ext="sql" content={details.ddl} onChange={() => {}} readOnly />
          </div>
        )}
      </div>
    </div>
  )
}
