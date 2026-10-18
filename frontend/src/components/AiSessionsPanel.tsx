import React, { useEffect, useMemo, useState } from 'react'
import { Play, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ListClaudeSessions, ListCodexSessions, DeleteClaudeSession, DeleteCodexSession, GetInstalledAiEngines } from '../../wailsjs/go/main/App'
import { main } from '../../wailsjs/go/models'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { AI_ENGINE_LABEL, type AiEngine } from '../utils/aiEngines'

type AiSession = main.AiSession

interface Props {
  onOpenSessionTerminal: (engine: AiEngine, sessionId?: string) => void
}

const PAGE_SIZE = 5

// Painel da sidebar (não mais uma aba — pedido do usuário, 2026-10-16) que
// lista só as sessões do Claude Code/Codex do projeto ABERTO no momento,
// mais recentes primeiro, com paginação simples (5 por vez, "carregar
// mais"). Ver .specs/modules/ai-sessions.md e .specs/tasks/ai-sessions-tab.md.
export default function AiSessionsPanel({ onOpenSessionTerminal }: Props) {
  const { t } = useTranslation('aiSessions')
  const { currentWorkspace } = useWorkspaceStore()
  const [sessions, setSessions] = useState<AiSession[]>([])
  const [loading, setLoading] = useState(true)
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [confirmDelete, setConfirmDelete] = useState<AiSession | null>(null)
  // Engines instalados nesta máquina (claude/codex no PATH) — só mostra um
  // botão de "nova sessão" pra cada um que realmente existir. Carregado uma
  // vez (não depende do workspace).
  const [installedEngines, setInstalledEngines] = useState<AiEngine[]>([])

  const cwd = currentWorkspace?.path ?? ''

  useEffect(() => {
    GetInstalledAiEngines().then(list => setInstalledEngines(list as AiEngine[])).catch(() => setInstalledEngines([]))
  }, [])

  const load = async (path: string) => {
    setLoading(true)
    setVisibleCount(PAGE_SIZE)
    const [claude, codex] = await Promise.all([
      ListClaudeSessions(path, true).catch(() => []),
      ListCodexSessions(path, true).catch(() => []),
    ])
    setSessions([...claude, ...codex].sort((a, b) => b.updatedAt - a.updatedAt))
    setLoading(false)
  }

  useEffect(() => {
    if (cwd) load(cwd)
    else { setSessions([]); setLoading(false) }
  }, [cwd]) // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => sessions.slice(0, visibleCount), [sessions, visibleCount])

  const formatDate = (unixSeconds: number) => {
    if (!unixSeconds) return '—'
    return new Date(unixSeconds * 1000).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
  }

  const handleOpen = (session: AiSession) => {
    onOpenSessionTerminal(session.engine as AiEngine, session.id)
  }

  const handleNewSession = (engine: AiEngine) => {
    onOpenSessionTerminal(engine)
  }

  const handleDelete = async () => {
    if (!confirmDelete) return
    if (confirmDelete.engine === 'claude') await DeleteClaudeSession(confirmDelete.id).catch(console.error)
    else await DeleteCodexSession(confirmDelete.id).catch(console.error)
    setConfirmDelete(null)
    load(cwd)
  }

  if (!cwd) {
    return (
      <div className="no-workspace">
        <div className="no-workspace-text">{t('openProjectToSee')}</div>
      </div>
    )
  }

  return (
    <div className="ai-sessions-panel">
      {installedEngines.length > 0 && (
        <div className="ai-sessions-new-session-row">
          {installedEngines.map(engine => (
            <button
              key={engine}
              className="ai-sessions-new-session-btn"
              onClick={() => handleNewSession(engine)}
            >
              <Plus size={12} /> {AI_ENGINE_LABEL[engine]}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <div className="ai-sessions-panel-empty">{t('loading')}</div>
      ) : sessions.length === 0 ? (
        <div className="ai-sessions-panel-empty">{t('noSessions')}</div>
      ) : (
        <>
          <div className="ai-sessions-panel-list">
            {visible.map(session => (
              <div key={`${session.engine}-${session.id}`} className="ai-session-panel-card">
                <div className="ai-session-card-header">
                  <span className={`ai-session-engine-badge ${session.engine}`}>
                    {session.engine === 'claude' ? 'Claude' : 'Codex'}
                  </span>
                  {session.isRunning && <span className="ai-session-running-dot" title={t('running')} />}
                </div>
                <div className="ai-session-card-title">{session.title}</div>
                <div className="ai-session-card-dates">
                  <span>{t('createdLabel')}: {formatDate(session.createdAt)}</span>
                  <span>{t('updatedLabel')}: {formatDate(session.updatedAt)}</span>
                </div>
                <div className="ai-session-card-actions">
                  <button className="ai-session-card-btn" onClick={() => handleOpen(session)}>
                    <Play size={12} /> {t('open')}
                  </button>
                  <button className="ai-session-card-btn danger" onClick={() => setConfirmDelete(session)}>
                    <Trash2 size={12} /> {t('delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>

          {visibleCount < sessions.length && (
            <button className="ai-sessions-load-more" onClick={() => setVisibleCount(v => v + PAGE_SIZE)}>
              {t('loadMore')}
            </button>
          )}
        </>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div className="modal-dialog-title">{t('deleteConfirmTitle')}</div>
            <div className="modal-dialog-msg">{t('deleteConfirmMsg', { title: confirmDelete.title })}</div>
            <div className="modal-dialog-actions">
              <button className="modal-dialog-btn cancel" onClick={() => setConfirmDelete(null)}>{t('common:cancel')}</button>
              <button className="modal-dialog-btn danger" onClick={handleDelete}>{t('common:delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
