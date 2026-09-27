import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus, X, PanelBottom, PanelRight } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'
import { StartTerminal, TerminalInput, TerminalResize, CloseTerminal } from '../../wailsjs/go/main/App'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

// Shift+Enter envia LF (Ctrl+J): Claude Code e Codex tratam como nova linha no prompt.
// Num shell comum equivale a Enter.
const SHIFT_ENTER_INPUT = '\n'
// Ctrl+V como byte de controle cru (SYN), não como paste de texto do xterm.
// claude/codex leem a área de transferência do SO por conta própria ao ver esse
// byte, do mesmo jeito que fazem num terminal nativo (ADR-0008). Cmd+V no macOS
// fica de fora por enquanto — decisão separada.

interface TermTab {
  id: string
  type: 'terminal'
  title: string
  xterm?: XTerm
  fitAddon?: FitAddon
}

interface WsSnapshot {
  tabs: TermTab[]
  activeId: string | null
}

interface Props {
  height?: number
  width?: number
  dock: 'bottom' | 'right'
  visible: boolean
  onToggleDock: () => void
  workspaceId: string
  workdir: string
  initialCount?: number
  onTabsChange?: (n: number) => void
  onClose: () => void
}

export default function Terminal({
  height, width, dock, visible, onToggleDock, workspaceId, workdir,
  initialCount = 1, onTabsChange, onClose,
}: Props) {
  const [tabs, setTabs]             = useState<TermTab[]>([])
  const [activeId, setActiveId]     = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dropGap,     setDropGap]     = useState<number | null>(null)

  const renameInputRef   = useRef<HTMLInputElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  const wrapperRef = useRef<HTMLDivElement>(null)
  const termDivs   = useRef<Map<string, HTMLDivElement>>(new Map())
  const tabCount   = useRef(0)

  const tabsRef     = useRef<TermTab[]>([])
  const activeIdRef = useRef<string | null>(null)
  useEffect(() => {
    tabsRef.current = tabs
    if (workspaceId && tabs.length > 0) saveTabConfig(workspaceId, tabs, activeIdRef.current)
  }, [tabs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    activeIdRef.current = activeId
    if (workspaceId && tabsRef.current.length > 0) saveTabConfig(workspaceId, tabsRef.current, activeId)
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const wsCache      = useRef<Map<string, WsSnapshot>>(new Map())
  const prevWsIdRef  = useRef<string>('')
  const workdirRef   = useRef(workdir)
  useEffect(() => { workdirRef.current = workdir }, [workdir])

  // ── Cria terminal PTY ─────────────────────────────────────────────────────
  const createTerminal = useCallback(async (): Promise<TermTab | null> => {
    if (!wrapperRef.current) return null

    const xterm = new XTerm({
      theme: {
        background: '#1a1a1a', foreground: '#d4d4d4',
        cursor: '#aeafad',     selectionBackground: '#264f78',
        black: '#1e1e1e',   red: '#f44747',   green: '#4ec9b0',
        yellow: '#e5c07b',  blue: '#007acc',  magenta: '#c678dd',
        cyan: '#56b6c2',    white: '#d4d4d4',
        brightBlack: '#858585', brightRed: '#e06c75',   brightGreen: '#98c379',
        brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',   brightWhite: '#ffffff',
      },
      fontFamily: "'SF Mono','Fira Code','Cascadia Code',Menlo,monospace",
      fontSize: 13, lineHeight: 1.4, cursorBlink: true, scrollback: 5000,
    })
    const fitAddon = new FitAddon()
    xterm.loadAddon(fitAddon)

    let id: string
    try {
      id = await StartTerminal(workdirRef.current || '~')
    } catch (err) {
      xterm.dispose(); return null
    }

    const div = document.createElement('div')
    div.style.cssText = 'position:absolute;inset:0;display:none;overflow:hidden'
    wrapperRef.current.appendChild(div)
    xterm.open(div)
    termDivs.current.set(id, div)

    // O xterm repassa keydown, keypress e keyup ao handler. Retornar false só no keydown
    // deixa o keypress enviar um '\r' extra, e o CLI enviaria a mensagem. Bloqueia todos.
    xterm.attachCustomKeyEventHandler((e: KeyboardEvent) => {
      const isShiftEnter = e.key === 'Enter' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      if (isShiftEnter) {
        if (e.type === 'keydown') {
          e.preventDefault()
          TerminalInput(id, SHIFT_ENTER_INPUT).catch(console.error)
        }
        return false
      }

      return true
    })

    EventsOn(`terminal:data:${id}`, (b64: string) => {
      try {
        const bin = atob(b64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        xterm.write(bytes)
      } catch { xterm.write(b64) }
    })
    EventsOn(`terminal:exit:${id}`, () => xterm.write('\r\n[Process exited]\r\n'))
    xterm.onData(data => TerminalInput(id, data).catch(console.error))
    xterm.onResize(({ rows, cols }) => TerminalResize(id, rows, cols).catch(console.error))

    tabCount.current += 1
    return { id, type: 'terminal', title: `Terminal ${tabCount.current}`, xterm, fitAddon }
  }, [])

  const scheduleFit = useCallback((tab: TermTab) => {
    if (!tab.fitAddon) return
    for (const delay of [30, 120, 350]) {
      setTimeout(() => { try { tab.fitAddon!.fit() } catch {} }, delay)
    }
  }, [])

  const showOnly = useCallback((id: string | null, allTabs: TermTab[]) => {
    termDivs.current.forEach((div, tid) => {
      div.style.display = tid === id ? 'block' : 'none'
    })
    if (id) {
      const tab = allTabs.find(t => t.id === id)
      if (tab) scheduleFit(tab)
    }
  }, [scheduleFit])

  // ── Persiste configuração de abas no localStorage ────────────────────────
  const saveTabConfig = useCallback((wsId: string, tabList: TermTab[], active: string | null) => {
    const config = tabList.map(t => ({ id: t.id, type: t.type, title: t.title }))
    localStorage.setItem(`bcode.termtabs.${wsId}`, JSON.stringify({ tabs: config, activeId: active }))
  }, [])

  const loadTabConfig = useCallback((wsId: string): { tabs: Array<{id:string;type:string;title:string}>; activeId: string | null } | null => {
    try {
      const raw = localStorage.getItem(`bcode.termtabs.${wsId}`)
      return raw ? JSON.parse(raw) : null
    } catch { return null }
  }, [])

  // ── Workspace switch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const prevId = prevWsIdRef.current
    if (prevId === workspaceId) return
    prevWsIdRef.current = workspaceId

    if (prevId && tabsRef.current.length > 0) {
      wsCache.current.set(prevId, { tabs: tabsRef.current, activeId: activeIdRef.current })
      saveTabConfig(prevId, tabsRef.current, activeIdRef.current)
      tabsRef.current.forEach(t => {
        const div = termDivs.current.get(t.id)
        if (div) div.style.display = 'none'
      })
    }

    const cached = wsCache.current.get(workspaceId)
    if (cached && cached.tabs.length > 0) {
      // Restaura do cache em memória (mesma sessão)
      setTabs(cached.tabs)
      setActiveId(cached.activeId)
      onTabsChange?.(cached.tabs.length)
      showOnly(cached.activeId, cached.tabs)
    } else {
      // Restaura do localStorage (nova sessão / reinício)
      const savedConfig = loadTabConfig(workspaceId)
      setTabs([])
      setActiveId(null);
      (async () => {
        const created: TermTab[] = []

        if (savedConfig && savedConfig.tabs.length > 0) {
          for (const saved of savedConfig.tabs) {
            // Abas de chat salvas por versões antigas são ignoradas
            if (saved.type === 'chat') continue
            const tab = await createTerminal()
            if (tab) { tab.title = saved.title; created.push(tab) }
          }
        }
        if (!created.length) {
          // Nenhuma config salva — cria terminais padrão
          const count = Math.max(1, initialCount)
          for (let i = 0; i < count; i++) {
            const tab = await createTerminal()
            if (tab) created.push(tab)
          }
        }

        if (!created.length) return
        const targetId = savedConfig?.activeId && created.find(t => t.id === savedConfig.activeId)
          ? savedConfig.activeId
          : created[created.length - 1].id
        setTabs(created)
        setActiveId(targetId)
        onTabsChange?.(created.length)
        showOnly(targetId, created)
        // Salva explicitamente com o workspaceId correto (evita race condition do useEffect)
        saveTabConfig(workspaceId, created, targetId)
      })()
    }
  }, [workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      termDivs.current.forEach((div, id) => {
        EventsOff(`terminal:data:${id}`)
        EventsOff(`terminal:exit:${id}`)
        CloseTerminal(id).catch(() => {})
        div.remove()
      })
      termDivs.current.clear()
    }
  }, [])

  useEffect(() => {
    if (activeId) showOnly(activeId, tabs)
  }, [activeId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeId) return
    const tab = tabs.find(t => t.id === activeId)
    if (tab) scheduleFit(tab)
  }, [height, width, dock]) // eslint-disable-line react-hooks/exhaustive-deps

  // Ao ficar visível + workspaceId disponível sem abas — inicializa a partir do localStorage ou cria novo terminal.
  // Resolve o problema de timing onde Terminal monta com workspaceId='' e o useEffect([workspaceId]) não re-dispara.
  const initDoneRef = useRef(false)
  useEffect(() => {
    if (!visible || !workspaceId || initDoneRef.current) return
    if (tabsRef.current.length > 0) { initDoneRef.current = true; return }

    initDoneRef.current = true
    const saved = loadTabConfig(workspaceId)

    ;(async () => {
      const created: TermTab[] = []
      if (saved && saved.tabs.length > 0) {
        for (const s of saved.tabs) {
          // Abas de chat salvas por versões antigas são ignoradas
          if (s.type === 'chat') continue
          const tab = await createTerminal()
          if (tab) { tab.title = s.title; created.push(tab) }
        }
      }
      if (!created.length) {
        const tab = await createTerminal()
        if (tab) created.push(tab)
      }
      if (!created.length) return
      const targetId = saved?.activeId && created.find(t => t.id === saved.activeId)
        ? saved.activeId
        : created[created.length - 1].id
      setTabs(created)
      setActiveId(targetId)
      onTabsChange?.(created.length)
      showOnly(targetId, created)
      saveTabConfig(workspaceId, created, targetId)
    })()
  }, [visible, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Adicionar terminal ────────────────────────────────────────────────────
  const addTerminalTab = async () => {
    const tab = await createTerminal()
    if (!tab) return
    const next = [...tabsRef.current, tab]
    setTabs(next)
    setActiveId(tab.id)
    onTabsChange?.(next.length)
    showOnly(tab.id, next)
  }

  // ── Fecha aba ─────────────────────────────────────────────────────────────
  const closeTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id)

    EventsOff(`terminal:data:${id}`)
    EventsOff(`terminal:exit:${id}`)
    await CloseTerminal(id).catch(console.error)
    tab?.xterm?.dispose()
    termDivs.current.get(id)?.remove()
    termDivs.current.delete(id)

    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    onTabsChange?.(newTabs.length)

    if (activeId === id) {
      const next = newTabs[newTabs.length - 1]?.id ?? null
      setActiveId(next)
      if (!next) onClose()
      else showOnly(next, newTabs)
    }
  }

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const handleTabMouseDown = (e: React.MouseEvent, fromIdx: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX
    let moved = false, curGap = fromIdx

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.abs(ev.clientX - startX) < 5) return
      moved = true
      const container = tabsContainerRef.current
      if (!container) return
      const tabEls = Array.from(container.children).filter(c => c.classList.contains('terminal-tab')) as HTMLElement[]
      curGap = tabEls.length
      for (let i = 0; i < tabEls.length; i++) {
        const r = tabEls[i].getBoundingClientRect()
        if (ev.clientX < r.left + r.width / 2) { curGap = i; break }
      }
      setDragFromIdx(fromIdx)
      setDropGap(curGap)
    }
    const onUp = () => {
      if (moved && curGap !== fromIdx && curGap !== fromIdx + 1) {
        const toIdx = curGap > fromIdx ? curGap - 1 : curGap
        setTabs(prev => { const arr = [...prev]; const [t] = arr.splice(fromIdx, 1); arr.splice(toIdx, 0, t); return arr })
      }
      setDragFromIdx(null); setDropGap(null)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const startRename = (t: TermTab, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(t.id)
    setRenameValue(t.title)
    setTimeout(() => renameInputRef.current?.select(), 0)
  }
  const commitRename = (id: string) => {
    const name = renameValue.trim()
    if (name) {
      setTabs(prev => prev.map(t => t.id === id ? { ...t, title: name } : t))
    }
    setRenamingId(null)
  }

  const panelStyle: React.CSSProperties = dock === 'bottom'
    ? { height: height ?? 220, flexShrink: 0, display: 'flex', flexDirection: 'column' }
    : { width: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }

  return (
    <div className="terminal-panel" style={panelStyle}>
      {/* ── Tab bar ── */}
      <div className="terminal-tabs-bar">
        <div className="terminal-tabs-list" ref={tabsContainerRef}
          style={{ userSelect: dragFromIdx !== null ? 'none' : undefined }}>
          {tabs.map((t, idx) => (
            <React.Fragment key={t.id}>
              {dropGap === idx && dragFromIdx !== idx && dragFromIdx !== idx - 1 && (
                <div className="tab-drop-indicator" />
              )}
              <div
                className={`terminal-tab ${activeId === t.id ? 'active' : ''} ${dragFromIdx === idx ? 'dragging' : ''}`}
                onClick={() => setActiveId(t.id)}
                onMouseDown={e => handleTabMouseDown(e, idx)}
                style={{ cursor: dragFromIdx !== null ? 'grabbing' : 'grab' }}
              >
                {renamingId === t.id ? (
                  <input
                    ref={renameInputRef}
                    className="terminal-tab-rename"
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => commitRename(t.id)}
                    onKeyDown={e => {
                      if (e.key === 'Enter')  { e.preventDefault(); commitRename(t.id) }
                      if (e.key === 'Escape') { e.preventDefault(); setRenamingId(null) }
                    }}
                    onClick={e => e.stopPropagation()}
                    style={{ width: Math.max(60, renameValue.length * 8) }}
                  />
                ) : (
                  <span onDoubleClick={e => startRename(t, e)}>{t.title}</span>
                )}
                <button
                  className="terminal-tab-close"
                  onClick={e => { e.stopPropagation(); closeTab(t.id) }}
                  onMouseDown={e => e.stopPropagation()}
                >
                  <X size={10} />
                </button>
              </div>
            </React.Fragment>
          ))}
          {dropGap === tabs.length && dragFromIdx !== tabs.length - 1 && (
            <div className="tab-drop-indicator" />
          )}
        </div>

        <div className="terminal-tabs-spacer" />

        <button className="terminal-add-btn" onClick={addTerminalTab} title="New Terminal">
          <Plus size={14} />
        </button>

        <button className="terminal-dock-btn" onClick={onToggleDock}
          title={dock === 'bottom' ? 'Move to Right' : 'Move to Bottom'}>
          {dock === 'bottom' ? <PanelRight size={14} /> : <PanelBottom size={14} />}
        </button>
        <button className="terminal-close-btn" onClick={onClose} title="Close terminal">
          <X size={14} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Xterm divs gerenciados via ref — terminais PTY */}
        <div ref={wrapperRef} style={{ position: 'absolute', inset: 0 }} />
      </div>
    </div>
  )
}
