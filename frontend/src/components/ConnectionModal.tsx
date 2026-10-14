import React, { useEffect, useState } from 'react'
import { PlugZap, Plus, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GetDefaultExtraParams } from '../../wailsjs/go/main/App'

export interface ConnectionFormState {
  id: string
  name: string
  host: string
  port: string
  user: string
  password: string
  database: string
  folder: string
  useSSHTunnel: boolean
  sshHost: string
  sshPort: string
  sshUser: string
  sshPassword: string
  extraParams: Record<string, string>
}

export const emptyConnectionForm: ConnectionFormState = {
  id: '', name: '', host: '', port: '3306', user: '', password: '', database: '', folder: '',
  useSSHTunnel: false, sshHost: '', sshPort: '22', sshUser: '', sshPassword: '',
  extraParams: {},
}

type Tab = 'general' | 'ssh' | 'extra'

interface Props {
  form: ConnectionFormState
  onChange: (form: ConnectionFormState) => void
  connectionFolders: string[]
  testMsg: { id: string; ok: boolean; msg: string } | null
  onSave: () => void
  onTest: () => void
  onClose: () => void
}

// Modal com abas pro form de criar/editar conexão — antes inline na árvore
// da sidebar. Pedido do usuário, 2026-10-14 (layout inspirado no DBeaver,
// imagem de referência — só o layout, não os nomes de parâmetro, que são do
// MySQL Connector/J, driver diferente do go-sql-driver/mysql usado aqui).
// Ver .specs/tasks/mysql-ssh-tunnel-and-connection-modal.md.
export default function ConnectionModal({ form, onChange, connectionFolders, testMsg, onSave, onTest, onClose }: Props) {
  const { t } = useTranslation('database')
  const [tab, setTab] = useState<Tab>('general')

  // Extra Params editados como uma lista (não direto o Record) — uma chave
  // sendo renomeada no meio da edição não pode colidir/sumir silenciosamente
  // até o usuário terminar de digitar. Sincroniza pra form.extraParams a
  // cada mudança (fonte de verdade pro save continua sendo o form).
  const [paramRows, setParamRows] = useState<{ key: string; value: string }[]>(
    () => Object.entries(form.extraParams).map(([key, value]) => ({ key, value }))
  )

  useEffect(() => {
    // Nova conexão (sem id ainda) e Extra Params ainda vazios: pré-preenche
    // com o default global — não sobrescreve se o usuário já digitou algo
    // (ex: reabrindo esta mesma sessão do modal depois de testar).
    if (!form.id && Object.keys(form.extraParams).length === 0) {
      GetDefaultExtraParams().then(defaults => {
        const rows = Object.entries(defaults).map(([key, value]) => ({ key, value }))
        setParamRows(rows)
        onChange({ ...form, extraParams: Object.fromEntries(rows.map(r => [r.key, r.value])) })
      }).catch(() => {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const syncParamRows = (rows: { key: string; value: string }[]) => {
    setParamRows(rows)
    const next: Record<string, string> = {}
    for (const r of rows) if (r.key.trim()) next[r.key.trim()] = r.value
    onChange({ ...form, extraParams: next })
  }

  const updateParamRow = (idx: number, field: 'key' | 'value', value: string) => {
    syncParamRows(paramRows.map((r, i) => i === idx ? { ...r, [field]: value } : r))
  }
  const addParamRow = () => syncParamRows([...paramRows, { key: '', value: '' }])
  const removeParamRow = (idx: number) => syncParamRows(paramRows.filter((_, i) => i !== idx))

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog-wide" onClick={e => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="modal-dialog-title">{form.id ? t('panel.edit') : t('panel.newConnection')}</div>
          <button className="settings-modal-close" aria-label={t('common:close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="connection-modal-tabs">
          <button className={`connection-modal-tab ${tab === 'general' ? 'active' : ''}`} onClick={() => setTab('general')}>
            {t('connectionModal.tabGeneral')}
          </button>
          <button className={`connection-modal-tab ${tab === 'ssh' ? 'active' : ''}`} onClick={() => setTab('ssh')}>
            {t('connectionModal.tabSSH')}
          </button>
          <button className={`connection-modal-tab ${tab === 'extra' ? 'active' : ''}`} onClick={() => setTab('extra')}>
            {t('connectionModal.tabExtraParams')}
          </button>
        </div>

        <div className="connection-modal-body">
          {tab === 'general' && (
            <div className="cc-settings db-conn-form">
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('panel.form.name')} value={form.name}
                  onChange={e => onChange({ ...form, name: e.target.value })} autoFocus />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('panel.form.host')} value={form.host}
                  onChange={e => onChange({ ...form, host: e.target.value })} style={{ flex: 2 }} />
                <input className="cc-settings-input" placeholder={t('panel.form.port')} value={form.port}
                  onChange={e => onChange({ ...form, port: e.target.value })} style={{ flex: 1 }} />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('panel.form.user')} value={form.user}
                  onChange={e => onChange({ ...form, user: e.target.value })} />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" type="password"
                  placeholder={form.id ? t('panel.form.passwordKeepCurrent') : t('panel.form.password')}
                  value={form.password} onChange={e => onChange({ ...form, password: e.target.value })} />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('panel.form.databaseOptional')}
                  value={form.database} onChange={e => onChange({ ...form, database: e.target.value })} />
              </div>
              <div className="cc-settings-row">
                <select className="query-select db-form-select" value={form.folder} onChange={e => onChange({ ...form, folder: e.target.value })}>
                  <option value="">{t('panel.noFolder')}</option>
                  {connectionFolders.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
            </div>
          )}

          {tab === 'ssh' && (
            <div className="cc-settings db-conn-form">
              <label className="connection-modal-toggle-row">
                <input type="checkbox" checked={form.useSSHTunnel}
                  onChange={e => onChange({ ...form, useSSHTunnel: e.target.checked })} />
                {t('connectionModal.useSSHTunnel')}
              </label>
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('connectionModal.sshHost')} value={form.sshHost}
                  disabled={!form.useSSHTunnel}
                  onChange={e => onChange({ ...form, sshHost: e.target.value })} style={{ flex: 2 }} />
                <input className="cc-settings-input" placeholder={t('connectionModal.sshPort')} value={form.sshPort}
                  disabled={!form.useSSHTunnel}
                  onChange={e => onChange({ ...form, sshPort: e.target.value })} style={{ flex: 1 }} />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" placeholder={t('connectionModal.sshUser')} value={form.sshUser}
                  disabled={!form.useSSHTunnel}
                  onChange={e => onChange({ ...form, sshUser: e.target.value })} />
              </div>
              <div className="cc-settings-row">
                <input className="cc-settings-input" type="password" placeholder={t('connectionModal.sshPassword')}
                  value={form.sshPassword} disabled={!form.useSSHTunnel}
                  onChange={e => onChange({ ...form, sshPassword: e.target.value })} />
              </div>
              {form.useSSHTunnel && (
                <div className="connection-modal-hint">{t('connectionModal.sshHint')}</div>
              )}
            </div>
          )}

          {tab === 'extra' && (
            <div className="connection-modal-params">
              <table className="connection-modal-params-table">
                <thead>
                  <tr>
                    <th>{t('connectionModal.paramName')}</th>
                    <th>{t('connectionModal.paramValue')}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {paramRows.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <input className="cc-settings-input" value={row.key}
                          onChange={e => updateParamRow(idx, 'key', e.target.value)} />
                      </td>
                      <td>
                        <input className="cc-settings-input" value={row.value}
                          onChange={e => updateParamRow(idx, 'value', e.target.value)} />
                      </td>
                      <td>
                        <button className="db-row-btn" title={t('common:delete')} onClick={() => removeParamRow(idx)}>
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="connection-modal-add-param" onClick={addParamRow}>
                <Plus size={12} /> {t('connectionModal.addParam')}
              </button>
            </div>
          )}
        </div>

        {testMsg && (form.id === testMsg.id || (!form.id && testMsg.id === 'new')) && (
          <div className={`db-test-msg ${testMsg.ok ? 'ok' : 'err'}`}>{testMsg.msg}</div>
        )}

        <div className="cc-settings-actions connection-modal-actions">
          <button className="cc-settings-save" onClick={onSave}>{t('common:save')}</button>
          <button className="cc-settings-cancel" onClick={onTest}><PlugZap size={11} /> {t('panel.test')}</button>
          <button className="cc-settings-cancel" onClick={onClose}>{t('common:cancel')}</button>
        </div>
      </div>
    </div>
  )
}
