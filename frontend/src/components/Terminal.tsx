import React, { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { Plus, X } from 'lucide-react'
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

type Dock = 'bottom' | 'right'

interface TermTab {
  id: string
  type: 'terminal'
  title: string
  dock: Dock
  xterm?: XTerm
  fitAddon?: FitAddon
}

interface WsSnapshot {
  tabs: TermTab[]
  activeBottomId: string | null
  activeRightId: string | null
}

interface Props {
  // Nó DOM onde o painel de cada dock é portado (ver App.tsx) — null enquanto
  // o container ainda não montou, ou quando o dock está colapsado (vazio).
  bottomContainer: HTMLElement | null
  rightContainer: HTMLElement | null
  bottomHeight: number
  rightWidth: number
  visible: boolean
  workspaceId: string
  workdir: string
  initialCount?: number
  // n de abas no dock, usado pelo chamador para abrir/colapsar cada região independentemente
  onTabCountChange?: (dock: Dock, n: number) => void
  // Disparado quando a última aba de QUALQUER dock fecha (nenhum terminal aberto)
  onAllClosed: () => void
  // Enquanto true, o chamador mantém ambos os containers visíveis (mesmo o
  // dock vazio) como zona de soltura durante um arrasto entre docks.
  onDraggingChange?: (dragging: boolean) => void
}

export default function Terminal({
  bottomContainer, rightContainer, bottomHeight, rightWidth, visible,
  workspaceId, workdir, initialCount = 1, onTabCountChange, onAllClosed, onDraggingChange,
}: Props) {
  const [tabs, setTabs] = useState<TermTab[]>([])
  const [activeBottomId, setActiveBottomId] = useState<string | null>(null)
  const [activeRightId,  setActiveRightId]  = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  // Drag: dock de origem + índice local de origem + gap de destino (reorder
  // dentro do mesmo dock) + dock atualmente sob o cursor (igual a dragDock
  // durante reorder normal, o dock oposto quando cruzando pra lá)
  const [dragDock,    setDragDock]    = useState<Dock | null>(null)
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null)
  const [dropGap,     setDropGap]     = useState<number | null>(null)
  const [hoverDock,   setHoverDock]   = useState<Dock | null>(null)

  const renameInputRef = useRef<HTMLInputElement>(null)
  const bottomTabsRef  = useRef<HTMLDivElement>(null)
  const rightTabsRef   = useRef<HTMLDivElement>(null)
  const bottomPanelRef = useRef<HTMLDivElement>(null)
  const rightPanelRef  = useRef<HTMLDivElement>(null)

  // Um wrapper físico por dock — a div do xterm de uma aba vive em um dos dois,
  // e é movida de wrapper (não recriada) quando a aba muda de dock.
  const wrapperBottomRef = useRef<HTMLDivElement>(null)
  const wrapperRightRef  = useRef<HTMLDivElement>(null)
  const termDivs = useRef<Map<string, HTMLDivElement>>(new Map())
  const tabCount = useRef(0)

  const tabsRef = useRef<TermTab[]>([])
  const activeBottomIdRef = useRef<string | null>(null)
  const activeRightIdRef  = useRef<string | null>(null)
  useEffect(() => {
    tabsRef.current = tabs
    if (workspaceId && tabs.length > 0) saveTabConfig(workspaceId, tabs, activeBottomIdRef.current, activeRightIdRef.current)
  }, [tabs]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    activeBottomIdRef.current = activeBottomId
    if (workspaceId && tabsRef.current.length > 0) saveTabConfig(workspaceId, tabsRef.current, activeBottomId, activeRightIdRef.current)
  }, [activeBottomId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    activeRightIdRef.current = activeRightId
    if (workspaceId && tabsRef.current.length > 0) saveTabConfig(workspaceId, tabsRef.current, activeBottomIdRef.current, activeRightId)
  }, [activeRightId]) // eslint-disable-line react-hooks/exhaustive-deps

  const wsCache     = useRef<Map<string, WsSnapshot>>(new Map())
  const prevWsIdRef = useRef<string>('')
  const workdirRef  = useRef(workdir)
  useEffect(() => { workdirRef.current = workdir }, [workdir])

  const reportCounts = useCallback((tabList: TermTab[]) => {
    onTabCountChange?.('bottom', tabList.filter(t => t.dock === 'bottom').length)
    onTabCountChange?.('right',  tabList.filter(t => t.dock === 'right').length)
  }, [onTabCountChange])

  // ── Cria terminal PTY ─────────────────────────────────────────────────────
  const createTerminal = useCallback(async (tabDock: Dock = 'bottom'): Promise<TermTab | null> => {
    const wrapper = tabDock === 'bottom' ? wrapperBottomRef.current : wrapperRightRef.current
    if (!wrapper) return null

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
    wrapper.appendChild(div)
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
    return { id, type: 'terminal', title: `Terminal ${tabCount.current}`, dock: tabDock, xterm, fitAddon }
  }, [])

  const scheduleFit = useCallback((tab: TermTab) => {
    if (!tab.fitAddon) return
    for (const delay of [30, 120, 350]) {
      setTimeout(() => { try { tab.fitAddon!.fit() } catch {} }, delay)
    }
  }, [])

  // Mostra só a aba ativa DE UM dock — ignora completamente as abas do outro
  // dock, já que cada uma vive fisicamente num wrapper diferente.
  const showOnlyInDock = useCallback((dock: Dock, activeIdForDock: string | null, allTabs: TermTab[]) => {
    allTabs.filter(t => t.dock === dock).forEach(t => {
      const div = termDivs.current.get(t.id)
      if (div) div.style.display = t.id === activeIdForDock ? 'block' : 'none'
    })
    if (activeIdForDock) {
      const tab = allTabs.find(t => t.id === activeIdForDock)
      if (tab) scheduleFit(tab)
    }
  }, [scheduleFit])

  // ── Persiste configuração de abas no localStorage ────────────────────────
  const saveTabConfig = useCallback((wsId: string, tabList: TermTab[], activeBottom: string | null, activeRight: string | null) => {
    const config = tabList.map(t => ({ id: t.id, type: t.type, title: t.title, dock: t.dock }))
    localStorage.setItem(`bcode.termtabs.${wsId}`, JSON.stringify({ tabs: config, activeBottomId: activeBottom, activeRightId: activeRight }))
  }, [])

  // `dock` ausente em configs salvas antes do suporte a drag-to-dock vira 'bottom' na leitura.
  // `activeId` (formato antigo, dock único) vira activeBottomId se a aba apontada ainda existir.
  const loadTabConfig = useCallback((wsId: string): {
    tabs: Array<{id:string;type:string;title:string;dock?:Dock}>
    activeBottomId: string | null
    activeRightId: string | null
  } | null => {
    try {
      const raw = localStorage.getItem(`bcode.termtabs.${wsId}`)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      if ('activeId' in parsed) {
        return { tabs: parsed.tabs, activeBottomId: parsed.activeId, activeRightId: null }
      }
      return parsed
    } catch { return null }
  }, [])

  // ── Workspace switch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!workspaceId) return
    const prevId = prevWsIdRef.current
    if (prevId === workspaceId) return
    prevWsIdRef.current = workspaceId

    if (prevId && tabsRef.current.length > 0) {
      wsCache.current.set(prevId, { tabs: tabsRef.current, activeBottomId: activeBottomIdRef.current, activeRightId: activeRightIdRef.current })
      saveTabConfig(prevId, tabsRef.current, activeBottomIdRef.current, activeRightIdRef.current)
      tabsRef.current.forEach(t => {
        const div = termDivs.current.get(t.id)
        if (div) div.style.display = 'none'
      })
    }

    const cached = wsCache.current.get(workspaceId)
    if (cached && cached.tabs.length > 0) {
      // Restaura do cache em memória (mesma sessão)
      setTabs(cached.tabs)
      setActiveBottomId(cached.activeBottomId)
      setActiveRightId(cached.activeRightId)
      reportCounts(cached.tabs)
      showOnlyInDock('bottom', cached.activeBottomId, cached.tabs)
      showOnlyInDock('right',  cached.activeRightId,  cached.tabs)
    } else {
      // Restaura do localStorage (nova sessão / reinício)
      const savedConfig = loadTabConfig(workspaceId)
      setTabs([])
      setActiveBottomId(null)
      setActiveRightId(null);
      (async () => {
        const created: TermTab[] = []

        if (savedConfig && savedConfig.tabs.length > 0) {
          for (const saved of savedConfig.tabs) {
            // Abas de chat salvas por versões antigas são ignoradas
            if (saved.type === 'chat') continue
            const tab = await createTerminal(saved.dock ?? 'bottom')
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
        const bottomTabs = created.filter(t => t.dock === 'bottom')
        const rightTabs  = created.filter(t => t.dock === 'right')
        const targetBottomId = savedConfig?.activeBottomId && bottomTabs.find(t => t.id === savedConfig.activeBottomId)
          ? savedConfig.activeBottomId
          : bottomTabs[bottomTabs.length - 1]?.id ?? null
        const targetRightId = savedConfig?.activeRightId && rightTabs.find(t => t.id === savedConfig.activeRightId)
          ? savedConfig.activeRightId
          : rightTabs[rightTabs.length - 1]?.id ?? null
        setTabs(created)
        setActiveBottomId(targetBottomId)
        setActiveRightId(targetRightId)
        reportCounts(created)
        showOnlyInDock('bottom', targetBottomId, created)
        showOnlyInDock('right',  targetRightId,  created)
        // Salva explicitamente com o workspaceId correto (evita race condition do useEffect)
        saveTabConfig(workspaceId, created, targetBottomId, targetRightId)
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
    if (activeBottomId) showOnlyInDock('bottom', activeBottomId, tabs)
  }, [activeBottomId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeRightId) showOnlyInDock('right', activeRightId, tabs)
  }, [activeRightId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (activeBottomId) { const t = tabs.find(x => x.id === activeBottomId); if (t) scheduleFit(t) }
  }, [bottomHeight]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (activeRightId) { const t = tabs.find(x => x.id === activeRightId); if (t) scheduleFit(t) }
  }, [rightWidth]) // eslint-disable-line react-hooks/exhaustive-deps

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
          const tab = await createTerminal(s.dock ?? 'bottom')
          if (tab) { tab.title = s.title; created.push(tab) }
        }
      }
      if (!created.length) {
        const tab = await createTerminal()
        if (tab) created.push(tab)
      }
      if (!created.length) return
      const bottomTabs = created.filter(t => t.dock === 'bottom')
      const rightTabs  = created.filter(t => t.dock === 'right')
      const targetBottomId = saved?.activeBottomId && bottomTabs.find(t => t.id === saved.activeBottomId)
        ? saved.activeBottomId
        : bottomTabs[bottomTabs.length - 1]?.id ?? null
      const targetRightId = saved?.activeRightId && rightTabs.find(t => t.id === saved.activeRightId)
        ? saved.activeRightId
        : rightTabs[rightTabs.length - 1]?.id ?? null
      setTabs(created)
      setActiveBottomId(targetBottomId)
      setActiveRightId(targetRightId)
      reportCounts(created)
      showOnlyInDock('bottom', targetBottomId, created)
      showOnlyInDock('right',  targetRightId,  created)
      saveTabConfig(workspaceId, created, targetBottomId, targetRightId)
    })()
  }, [visible, workspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Adicionar terminal ────────────────────────────────────────────────────
  const addTerminalTab = async (dock: Dock) => {
    const tab = await createTerminal(dock)
    if (!tab) return
    const next = [...tabsRef.current, tab]
    setTabs(next)
    if (dock === 'bottom') setActiveBottomId(tab.id)
    else setActiveRightId(tab.id)
    reportCounts(next)
    showOnlyInDock(dock, tab.id, next)
  }

  // ── Fecha aba ─────────────────────────────────────────────────────────────
  const closeTab = async (id: string) => {
    const tab = tabs.find(t => t.id === id)
    if (!tab) return
    const dock = tab.dock

    EventsOff(`terminal:data:${id}`)
    EventsOff(`terminal:exit:${id}`)
    await CloseTerminal(id).catch(console.error)
    tab.xterm?.dispose()
    termDivs.current.get(id)?.remove()
    termDivs.current.delete(id)

    const newTabs = tabs.filter(t => t.id !== id)
    setTabs(newTabs)
    reportCounts(newTabs)

    const isActive = dock === 'bottom' ? activeBottomId === id : activeRightId === id
    if (isActive) {
      const remainingInDock = newTabs.filter(t => t.dock === dock)
      const next = remainingInDock[remainingInDock.length - 1]?.id ?? null
      if (dock === 'bottom') setActiveBottomId(next)
      else setActiveRightId(next)
      if (next) showOnlyInDock(dock, next, newTabs)
    }

    if (newTabs.length === 0) onAllClosed()
  }

  // ── Drag reorder (dentro do mesmo dock) ──────────────────────────────────
  // Reordena só a sublista do dock arrastado, preservando a posição relativa
  // das abas do outro dock dentro do array compartilhado.
  const reorderWithinDock = (dock: Dock, fromLocalIdx: number, toLocalIdx: number) => {
    setTabs(prev => {
      const sub = prev.filter(t => t.dock === dock)
      const arr = [...sub]
      const [moved] = arr.splice(fromLocalIdx, 1)
      arr.splice(toLocalIdx, 0, moved)
      let i = 0
      return prev.map(t => t.dock === dock ? arr[i++] : t)
    })
  }

  // ── Mover aba pro outro dock (soltar sobre a região de destino) ──────────
  // Move a div do xterm pro wrapper do dock novo (sem recriar o terminal) e
  // reposiciona a aba no fim do array compartilhado — suficiente pra ela
  // aparecer por último dentro de QUALQUER lista filtrada por dock, já que
  // nada depois dela, no array inteiro, pertence a esse dock.
  const moveTabToDock = (id: string, newDock: Dock) => {
    const tab = tabsRef.current.find(t => t.id === id)
    if (!tab || tab.dock === newDock) return
    const oldDock = tab.dock

    const div = termDivs.current.get(id)
    const targetWrapper = newDock === 'bottom' ? wrapperBottomRef.current : wrapperRightRef.current
    if (div && targetWrapper) targetWrapper.appendChild(div)

    const newTabs = [...tabsRef.current.filter(t => t.id !== id), { ...tab, dock: newDock }]
    setTabs(newTabs)
    reportCounts(newTabs)

    if (oldDock === 'bottom' && activeBottomIdRef.current === id) {
      const remaining = newTabs.filter(t => t.dock === 'bottom')
      setActiveBottomId(remaining[remaining.length - 1]?.id ?? null)
    }
    if (oldDock === 'right' && activeRightIdRef.current === id) {
      const remaining = newTabs.filter(t => t.dock === 'right')
      setActiveRightId(remaining[remaining.length - 1]?.id ?? null)
    }
    if (newDock === 'bottom') setActiveBottomId(id)
    else setActiveRightId(id)
  }

  const handleTabMouseDown = (dock: Dock, e: React.MouseEvent, fromIdx: number) => {
    if (e.button !== 0) return
    e.preventDefault()
    const startX = e.clientX, startY = e.clientY
    const dockTabs = dock === 'bottom' ? bottomTabs : rightTabs
    const tabId = dockTabs[fromIdx]?.id
    if (!tabId) return

    let moved = false, curGap = fromIdx, curHoverDock: Dock = dock

    const onMove = (ev: MouseEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 5) return
      if (!moved) { moved = true; onDraggingChange?.(true) }

      const otherDock: Dock = dock === 'bottom' ? 'right' : 'bottom'
      const otherPanelEl = otherDock === 'bottom' ? bottomPanelRef.current : rightPanelRef.current
      const otherRect = otherPanelEl?.getBoundingClientRect()
      const overOther = !!otherRect && otherRect.width > 0 && otherRect.height > 0 &&
        ev.clientX >= otherRect.left && ev.clientX <= otherRect.right &&
        ev.clientY >= otherRect.top  && ev.clientY <= otherRect.bottom

      if (overOther) {
        curHoverDock = otherDock
        setDropGap(null)
      } else {
        curHoverDock = dock
        const container = dock === 'bottom' ? bottomTabsRef.current : rightTabsRef.current
        if (container) {
          const tabEls = Array.from(container.children).filter(c => c.classList.contains('terminal-tab')) as HTMLElement[]
          curGap = tabEls.length
          for (let i = 0; i < tabEls.length; i++) {
            const r = tabEls[i].getBoundingClientRect()
            if (ev.clientX < r.left + r.width / 2) { curGap = i; break }
          }
          setDropGap(curGap)
        }
      }
      setDragDock(dock)
      setDragFromIdx(fromIdx)
      setHoverDock(curHoverDock)
    }
    const onUp = () => {
      if (moved) {
        if (curHoverDock !== dock) {
          moveTabToDock(tabId, curHoverDock)
        } else if (curGap !== fromIdx && curGap !== fromIdx + 1) {
          const toIdx = curGap > fromIdx ? curGap - 1 : curGap
          reorderWithinDock(dock, fromIdx, toIdx)
        }
      }
      onDraggingChange?.(false)
      setDragDock(null); setDragFromIdx(null); setDropGap(null); setHoverDock(null)
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

  // ── Painel de um dock (barra de abas + área de conteúdo) ─────────────────
  const renderDockPanel = (
    dock: Dock,
    dockTabs: TermTab[],
    activeId: string | null,
    setActiveId: (id: string) => void,
    tabsContainerRef: React.RefObject<HTMLDivElement>,
    contentWrapperRef: React.RefObject<HTMLDivElement>,
    panelRef: React.RefObject<HTMLDivElement>,
    panelStyle: React.CSSProperties,
  ) => (
    <div
      ref={panelRef}
      className={`terminal-panel ${dragDock !== null && dragDock !== dock && hoverDock === dock ? 'terminal-drop-target' : ''}`}
      style={panelStyle}
    >
      {/* ── Tab bar ── */}
      <div className="terminal-tabs-bar">
        <div className="terminal-tabs-list" ref={tabsContainerRef}
          style={{ userSelect: dragFromIdx !== null ? 'none' : undefined }}>
          {dockTabs.map((t, idx) => (
            <React.Fragment key={t.id}>
              {dragDock === dock && hoverDock === dock && dropGap === idx && dragFromIdx !== idx && dragFromIdx !== idx - 1 && (
                <div className="tab-drop-indicator" />
              )}
              <div
                className={`terminal-tab ${activeId === t.id ? 'active' : ''} ${dragDock === dock && dragFromIdx === idx ? 'dragging' : ''}`}
                onClick={() => setActiveId(t.id)}
                onMouseDown={e => handleTabMouseDown(dock, e, idx)}
                style={{ cursor: dragDock === dock ? 'grabbing' : 'grab' }}
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
          {dragDock === dock && hoverDock === dock && dropGap === dockTabs.length && dragFromIdx !== dockTabs.length - 1 && (
            <div className="tab-drop-indicator" />
          )}
        </div>

        <div className="terminal-tabs-spacer" />

        <button className="terminal-add-btn" onClick={() => addTerminalTab(dock)} title="New Terminal">
          <Plus size={14} />
        </button>
      </div>

      {/* ── Content area ── */}
      <div style={{ position: 'relative', flex: 1, overflow: 'hidden' }}>
        {/* Xterm divs gerenciados via ref — terminais PTY */}
        <div ref={contentWrapperRef} style={{ position: 'absolute', inset: 0 }} />
        {/* Só aparece durante um arrasto: o dock está sendo mostrado como
            "ghost" (vazio) pelo App.tsx como zona de soltura. */}
        {dockTabs.length === 0 && (
          <div className="terminal-drop-placeholder">Solte aqui para mover o terminal</div>
        )}
      </div>
    </div>
  )

  const bottomTabs = tabs.filter(t => t.dock === 'bottom')
  const rightTabs  = tabs.filter(t => t.dock === 'right')

  const bottomPanel = bottomContainer && createPortal(
    renderDockPanel(
      'bottom', bottomTabs, activeBottomId, setActiveBottomId,
      bottomTabsRef, wrapperBottomRef, bottomPanelRef,
      { height: '100%', flexShrink: 0, display: 'flex', flexDirection: 'column' },
    ),
    bottomContainer,
  )

  const rightPanel = rightContainer && createPortal(
    renderDockPanel(
      'right', rightTabs, activeRightId, setActiveRightId,
      rightTabsRef, wrapperRightRef, rightPanelRef,
      { width: '100%', height: '100%', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' },
    ),
    rightContainer,
  )

  return (
    <>
      {bottomPanel}
      {rightPanel}
    </>
  )
}
