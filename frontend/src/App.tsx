import React, { useEffect, useRef, useState, useCallback } from 'react'
import ActivityBar from './components/ActivityBar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import Terminal from './components/Terminal'
import StatusBar from './components/StatusBar'
import TitleBar from './components/TitleBar'
import { useWorkspaceStore } from './stores/workspaceStore'
import { useEditorStore } from './stores/editorStore'
import { useGitStore } from './stores/gitStore'
import {
  WindowGetSize, WindowSetSize,
  WindowGetPosition, WindowSetPosition,
  EventsOn,
} from '../wailsjs/runtime/runtime'
import FileSearch from './components/FileSearch'
import CommandPalette from './components/CommandPalette'
import QuerySearch from './components/QuerySearch'
import { usePlatform } from './utils/platform'
import {
  GetRecentWorkspaces,
  GetEverOpenedWorkspaces,
  SaveWorkspace,
  GetFileTree,
  GitCurrentBranch,
  GitStatus,
  GitLog,
  SaveWorkspaceState,
  LoadWorkspaceState,
  GetLastWorkspaceID,
  ReadFile,
  OpenDirectoryDialog,
  ListSavedQueries,
  ConfirmQuit,
} from '../wailsjs/go/main/App'
import { buildCommands } from './utils/commands'
import { Workspace, EditorTab, ViewMode } from './types'

type Panel = 'explorer' | 'git' | 'database'

function lsInt(key: string, def: number) {
  const v = localStorage.getItem(key)
  return v ? parseInt(v, 10) || def : def
}
function lsStr<T extends string>(key: string, def: T): T {
  return (localStorage.getItem(key) as T) ?? def
}

export default function App() {
  const [activePanel, setActivePanel]       = useState<Panel>('explorer')
  const [showTerminal, setShowTerminal]     = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(() => lsInt('bcode.terminalHeight', 220))
  const [sidebarWidth, setSidebarWidth]     = useState(() => lsInt('bcode.sidebarWidth', 240))
  const [terminalInitialCount, setTerminalInitialCount] = useState(1)
  const [terminalDock, setTerminalDock]   = useState<'bottom' | 'right'>(() => lsStr('bcode.terminalDock', 'bottom'))
  const [terminalWidth, setTerminalWidth] = useState(() => lsInt('bcode.terminalWidth', 420))
  const [terminalMounted, setTerminalMounted] = useState(false)
  const [showFileSearch, setShowFileSearch]   = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showQuerySearch, setShowQuerySearch] = useState(false)
  const platform = usePlatform()

  const { setRecentWorkspaces, setEverOpenedWorkspaces, currentWorkspace, setCurrentWorkspace, setFileTree } =
    useWorkspaceStore()
  const {
    setFontSize, fontSize, setViewMode, switchWorkspace, loadWorkspaceTabs, snapshotCurrentWs, cycleTab,
    openOrFocusTab, closeTab, closeAllTabs, getActiveTab,
  } = useEditorStore()
  const { setBranch, setChangedFiles, setCommits, setHasMoreCommits, commitPageSize } =
    useGitStore()

  // Terminais são globais — contagem global persiste independente do workspace
  const terminalCountRef = useRef(1)

  // Workspaces já carregados do disco nesta sessão (evita re-leitura ao trocar de volta)
  const loadedWs = useRef<Set<string>>(new Set())

  // ── Carrega os tabs de um workspace do disco ──────────────────────────────
  const loadTabsFromDisk = useCallback(async (ws: Workspace) => {
    if (loadedWs.current.has(ws.id)) return  // já carregado nesta sessão
    loadedWs.current.add(ws.id)

    const state = await LoadWorkspaceState(ws.id).catch(() => null)
    if (!state?.openFiles?.length) return

    const tabsToLoad: EditorTab[] = []
    for (const filePath of state.openFiles) {
      try {
        const content = await ReadFile(filePath)
        const name = filePath.split('/').pop() || filePath
        const ext  = name.includes('.') ? name.split('.').pop() || '' : ''
        tabsToLoad.push({
          id:              `file-${filePath}`,
          path:            filePath,
          name,
          ext,
          content,
          originalContent: content,
          isModified:      false,
          isCommitTab:     false,
        })
      } catch { /* arquivo pode ter sido deletado */ }
    }

    const activeId = tabsToLoad.find(t => t.path === state.activeFile)?.id ?? tabsToLoad[0]?.id ?? null
    loadWorkspaceTabs(ws.id, tabsToLoad, activeId)
    setViewMode((state.viewMode as ViewMode) || 'code')
  }, [loadWorkspaceTabs, setViewMode])

  // ── Persiste workspace atual no disco ─────────────────────────────────────
  const persistCurrentWs = useCallback(async (ws: Workspace) => {
    const snap = snapshotCurrentWs()
    // Home/query/git-graph/commit tabs têm "paths" falsos (__usage__,
    // __query_xxx__, ids de commit) — nunca pertencem à lista de arquivos
    // restauráveis nem podem ser "o arquivo ativo" persistido.
    const isRealFileTab = (t: EditorTab) => !t.isCommitTab && !t.isGraphTab && !t.isUsageTab && !t.isQueryTab && !!t.path
    const openFiles = snap.tabs.filter(isRealFileTab).map(t => t.path!)
    const activeTab = snap.tabs.find(t => t.id === snap.activeTabId && isRealFileTab(t))
    await SaveWorkspaceState(ws.id, {
      openFiles,
      activeFile:    activeTab?.path ?? '',
      viewMode:      useEditorStore.getState().viewMode,
      terminalCount: terminalCountRef.current,
    }).catch(console.error)
  }, [snapshotCurrentWs])

  // ── Atualiza info de Git ───────────────────────────────────────────────────
  const refreshGit = useCallback((path: string) => {
    GitCurrentBranch(path).then(setBranch).catch(() => setBranch(''))
    GitStatus(path).then(setChangedFiles).catch(() => setChangedFiles([]))
    GitLog(path, commitPageSize).then(c => {
      setCommits(c); setHasMoreCommits(c.length === commitPageSize)
    }).catch(() => setCommits([]))
  }, [setBranch, setChangedFiles, setCommits, setHasMoreCommits, commitPageSize])

  // ── Abre / troca workspace ────────────────────────────────────────────────
  const handleOpenWorkspace = useCallback(async (path: string) => {
    // Lê do store direto — evita closure stale do currentWorkspace
    const prev = useWorkspaceStore.getState().currentWorkspace
    if (prev) await persistCurrentWs(prev)

    const id = await SaveWorkspace(path).catch(() => String(Date.now()))
    const ws: Workspace = { id, name: path.split('/').pop() || path, path }

    switchWorkspace(id)
    setCurrentWorkspace(ws)

    // 4. Carrega do disco se ainda não foi carregado nesta sessão
    const [tree, recent, everOpened] = await Promise.all([
      GetFileTree(path).catch(() => null),
      GetRecentWorkspaces().catch(() => []),
      GetEverOpenedWorkspaces().catch(() => []),
    ])
    if (tree) setFileTree(tree)
    setRecentWorkspaces(recent)
    setEverOpenedWorkspaces(everOpened)

    await loadTabsFromDisk(ws)
    refreshGit(path)
  }, [currentWorkspace, persistCurrentWs, switchWorkspace, setCurrentWorkspace,
      setFileTree, setRecentWorkspaces, setEverOpenedWorkspaces, loadTabsFromDisk, refreshGit])

  // ── Inicialização: restaura último workspace ──────────────────────────────
  useEffect(() => {
    const init = async () => {
      const [lastId, recent, everOpened] = await Promise.all([
        GetLastWorkspaceID().catch(() => ''),
        GetRecentWorkspaces().catch(() => []),
        GetEverOpenedWorkspaces().catch(() => []),
      ])
      setRecentWorkspaces(recent)
      setEverOpenedWorkspaces(everOpened)

      const lastWs = recent.find(w => w.id === lastId) ?? recent[0]
      if (!lastWs) return

      setCurrentWorkspace(lastWs)
      switchWorkspace(lastWs.id)

      const [tree, state] = await Promise.all([
        GetFileTree(lastWs.path).catch(() => null),
        LoadWorkspaceState(lastWs.id).catch(() => null),
      ])
      if (tree) setFileTree(tree)

      // Terminais — usa localStorage como fonte primária (síncrono, sempre atualizado)
      const savedTabsRaw = localStorage.getItem(`bcode.termtabs.${lastWs.id}`)
      const hasSavedTabs = (() => {
        if (!savedTabsRaw) return false
        try { return JSON.parse(savedTabsRaw).tabs?.length > 0 } catch { return false }
      })()
      // Fallback: WorkspaceState do Go (pode estar desatualizado se app fechou abruptamente)
      const termCount = state?.terminalCount ?? 0
      const shouldShowTerminal = hasSavedTabs || termCount > 0
      terminalCountRef.current = shouldShowTerminal ? 1 : 0
      setTerminalInitialCount(1)
      if (shouldShowTerminal) setShowTerminal(true)

      // Tabs do workspace
      if (state?.openFiles?.length) {
        loadedWs.current.add(lastWs.id)
        const tabsToLoad: EditorTab[] = []
        for (const filePath of state.openFiles) {
          try {
            const content = await ReadFile(filePath)
            const name = filePath.split('/').pop() || filePath
            const ext  = name.includes('.') ? name.split('.').pop() || '' : ''
            tabsToLoad.push({
              id: `file-${filePath}`, path: filePath, name, ext,
              content, originalContent: content, isModified: false, isCommitTab: false,
            })
          } catch {}
        }
        const activeId = tabsToLoad.find(t => t.path === state.activeFile)?.id
          ?? tabsToLoad[0]?.id ?? null
        loadWorkspaceTabs(lastWs.id, tabsToLoad, activeId)
        setViewMode((state.viewMode as ViewMode) || 'code')
      }

      refreshGit(lastWs.path)
    }
    init().finally(() => {
      // Sempre abre mostrando a Home, mesmo com abas restauradas do disco
      // (pedido explícito do usuário, 2026-09-27) — roda por último, depois
      // que loadWorkspaceTabs já pode ter definido outra aba como ativa.
      openOrFocusTab({
        path: '__usage__',
        name: 'Home',
        ext: '', content: '', originalContent: '',
        isModified: false, isCommitTab: false, isUsageTab: true,
      } as any)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Restaura e persiste tamanho/posição da janela ────────────────────────
  useEffect(() => {
    // Restaura na inicialização
    const w = lsInt('bcode.winW', 0)
    const h = lsInt('bcode.winH', 0)
    const x = lsInt('bcode.winX', -1)
    const y = lsInt('bcode.winY', -1)
    if (w >= 900 && h >= 600) WindowSetSize(w, h)
    if (x >= 0 && y >= 0)     WindowSetPosition(x, y)

    // Salva ao redimensionar/mover (debounce 600ms)
    let timer: ReturnType<typeof setTimeout>
    const save = async () => {
      clearTimeout(timer)
      timer = setTimeout(async () => {
        const size = await WindowGetSize().catch(() => null)
        const pos  = await WindowGetPosition().catch(() => null)
        if (size) { localStorage.setItem('bcode.winW', String(size.w)); localStorage.setItem('bcode.winH', String(size.h)) }
        if (pos)  { localStorage.setItem('bcode.winX', String(pos.x));  localStorage.setItem('bcode.winY', String(pos.y)) }
      }, 600)
    }
    window.addEventListener('resize', save)
    return () => { window.removeEventListener('resize', save); clearTimeout(timer) }
  }, [])

  // ── Persiste tamanhos e posição dos painéis ───────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('bcode.sidebarWidth',   String(sidebarWidth)),   400)
    return () => clearTimeout(t)
  }, [sidebarWidth])

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('bcode.terminalHeight', String(terminalHeight)), 400)
    return () => clearTimeout(t)
  }, [terminalHeight])

  useEffect(() => {
    const t = setTimeout(() => localStorage.setItem('bcode.terminalWidth',  String(terminalWidth)),  400)
    return () => clearTimeout(t)
  }, [terminalWidth])

  useEffect(() => {
    localStorage.setItem('bcode.terminalDock', terminalDock)
  }, [terminalDock])

  // Persiste visibilidade do terminal em localStorage (síncrono — beforeunload não espera async)
  useEffect(() => {
    localStorage.setItem('bcode.terminalVisible', showTerminal ? '1' : '0')
  }, [showTerminal])

  // Monta o terminal na primeira vez que for aberto
  useEffect(() => { if (showTerminal && !terminalMounted) setTerminalMounted(true) }, [showTerminal]) // eslint-disable-line

  // ── Salva ao fechar ───────────────────────────────────────────────────────
  // `beforeunload` não dá pra confiar: é fire-and-forget (não há como esperar
  // o SaveWorkspaceState assíncrono antes do processo realmente encerrar), o
  // que explicava arquivos abertos não sendo restaurados (bug relatado
  // 2026-09-27). `OnBeforeClose` no Go intercepta o fechamento nativo da
  // janela e espera este evento confirmar antes de sair de verdade —
  // ConfirmQuit só roda depois que o save termina (ou depois do timeout de
  // segurança, pra nunca deixar a janela impossível de fechar).
  useEffect(() => {
    const unsub = EventsOn('app:before-close', async () => {
      const ws = useWorkspaceStore.getState().currentWorkspace
      const save = ws ? persistCurrentWs(ws) : Promise.resolve()
      const timeout = new Promise<void>(resolve => setTimeout(resolve, 2000))
      await Promise.race([save, timeout])
      ConfirmQuit()
    })
    return unsub
  }, [persistCurrentWs])

  // Ctrl/Cmd+Q: reabre a última query usada (maior updatedAt entre todas as
  // salvas, de qualquer conexão) — se já estiver aberta, openOrFocusTab só
  // foca (dedupe por savedQueryId em editorStore.ts). Sem nenhuma query
  // salva ainda, cai para uma aba em branco, como antes. Pedido do usuário
  // (2026-09-27): Ctrl+Q não deve sempre criar uma aba nova.
  const openLastUsedQuery = useCallback(async () => {
    const queries = await ListSavedQueries().catch(() => [])
    if (queries.length === 0) {
      openOrFocusTab({
        path: `__query_new_${Date.now()}__`,
        name: 'New Query',
        ext: 'sql', content: '', originalContent: '',
        isModified: false, isCommitTab: false, isQueryTab: true,
      } as any)
      return
    }
    const latest = queries.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
    openOrFocusTab({
      path: `__query_${latest.id}__`,
      name: latest.name || 'Query',
      ext: 'sql', content: latest.sql, originalContent: latest.sql,
      isModified: false, isCommitTab: false, isQueryTab: true,
      dbConnectionId: latest.connectionId, dbDatabase: latest.database,
      savedQueryId: latest.id,
    } as any)
  }, [openOrFocusTab])

  // ── Atalhos de teclado ────────────────────────────────────────────────────
  useEffect(() => {
    const isMac = platform === 'darwin'
    const handler = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.key === '`' && e.ctrlKey) { e.preventDefault(); setShowTerminal(v => !v) }
      if (e.key === '=' && mod) { e.preventDefault(); setFontSize(fontSize + 1) }
      if (e.key === '-' && mod) { e.preventDefault(); setFontSize(fontSize - 1) }
      if (e.key === '0' && mod) { e.preventDefault(); setFontSize(13) }
      if (e.key.toLowerCase() === 'p' && mod && e.shiftKey) { e.preventDefault(); setShowCommandPalette(true) }
      else if (e.key.toLowerCase() === 'p' && mod) { e.preventDefault(); setShowFileSearch(true) }
      if (e.key === 'Tab' && mod) {
        e.preventDefault()
        cycleTab(e.shiftKey ? -1 : 1)
      }
      if (e.key.toLowerCase() === 'q' && mod && e.shiftKey) { e.preventDefault(); setShowQuerySearch(true) }
      else if (e.key.toLowerCase() === 'q' && mod) { e.preventDefault(); openLastUsedQuery() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fontSize, setFontSize, platform, cycleTab, openOrFocusTab, openLastUsedQuery])

  // ── Resize sidebar ────────────────────────────────────────────────────────
  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX, startW = sidebarWidth
    const onMove = (ev: MouseEvent) =>
      setSidebarWidth(Math.max(160, Math.min(500, startW + ev.clientX - startX)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  // ── Resize terminal ───────────────────────────────────────────────────────
  const handleTerminalResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startY = e.clientY, startH = terminalHeight
    const onMove = (ev: MouseEvent) =>
      setTerminalHeight(Math.max(80, Math.min(600, startH + startY - ev.clientY)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [terminalHeight])

  const handleTerminalWidthResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX, startW = terminalWidth
    const onMove = (ev: MouseEvent) =>
      setTerminalWidth(Math.max(200, Math.min(window.innerWidth - 300, startW + startX - ev.clientX)))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [terminalWidth])

  return (
    <div className="app-layout">
      <TitleBar />
      <div className="app-main">
        <ActivityBar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          onToggleTerminal={() => setShowTerminal(v => !v)}
        />
        <div className="app-content">
          <div className="sidebar" style={{ width: sidebarWidth }}>
            <Sidebar activePanel={activePanel} onOpenWorkspace={handleOpenWorkspace} />
            <div className="sidebar-resize-handle" onMouseDown={handleSidebarResize} />
          </div>

          <div
            className="editor-area"
            style={{ flexDirection: terminalDock === 'right' ? 'row' : 'column' }}
          >
            <EditorPane onOpenWorkspace={handleOpenWorkspace} />

            {/* Resize handle — só visível quando terminal está aberto */}
            {showTerminal && terminalMounted && (
              <div
                className={terminalDock === 'bottom' ? 'terminal-resize-h' : 'terminal-resize-v'}
                onMouseDown={terminalDock === 'bottom'
                  ? handleTerminalResize
                  : handleTerminalWidthResize}
              />
            )}
            {/* Terminal: montado uma vez e mantido vivo (display:none) para preservar nomes e histórico */}
            {terminalMounted && (
              <div style={{
                display: showTerminal ? 'flex' : 'none',
                flexDirection: 'column',
                // Bottom: altura fixa; Right: largura fixa (flex:1 seria ignorar width)
                ...(terminalDock === 'bottom'
                  ? { height: terminalHeight, width: '100%', flexShrink: 0 }
                  : { width: terminalWidth, flexShrink: 0, alignSelf: 'stretch', minHeight: 0 }),
              }}>
                <Terminal
                  height={terminalDock === 'bottom' ? terminalHeight : undefined}
                  width={terminalDock === 'right'  ? terminalWidth  : undefined}
                  dock={terminalDock}
                  visible={showTerminal}
                  onToggleDock={() => setTerminalDock(d => d === 'bottom' ? 'right' : 'bottom')}
                  workspaceId={currentWorkspace?.id ?? ''}
                  workdir={currentWorkspace?.path ?? '~'}
                  initialCount={terminalInitialCount}
                  onTabsChange={n => {
                    terminalCountRef.current = n
                    const ws = useWorkspaceStore.getState().currentWorkspace
                    if (ws) persistCurrentWs(ws)
                  }}
                  onClose={() => {
                    setShowTerminal(false)
                    terminalCountRef.current = 0
                    const ws = useWorkspaceStore.getState().currentWorkspace
                    if (ws) persistCurrentWs(ws)
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
      <StatusBar />

      {showFileSearch && (
        <FileSearch
          onClose={() => setShowFileSearch(false)}
          onSelect={async (path, name, ext) => {
            setShowFileSearch(false)
            try {
              const { ReadFile } = await import('../wailsjs/go/main/App')
              const content = await ReadFile(path)
              useEditorStore.getState().openOrFocusTab({
                path, name, ext, content, originalContent: content,
                isModified: false, isCommitTab: false,
              })
            } catch (err) { console.error(err) }
          }}
        />
      )}

      {showCommandPalette && (
        <CommandPalette
          onClose={() => setShowCommandPalette(false)}
          commands={buildCommands({
            onNewTerminal: () => setShowTerminal(true),
            onNewQuery: () => openOrFocusTab({
              path: `__query_new_${Date.now()}__`,
              name: 'New Query',
              ext: 'sql', content: '', originalContent: '',
              isModified: false, isCommitTab: false, isQueryTab: true,
            } as any),
            onOpenFolder: async () => {
              const dir = await OpenDirectoryDialog().catch(() => '')
              if (dir) handleOpenWorkspace(dir)
            },
            onGoToFile: () => setShowFileSearch(true),
            onTogglePanel: (panel) => setActivePanel(panel),
            onGoHome: () => openOrFocusTab({
              path: '__usage__',
              name: 'Home',
              ext: '', content: '', originalContent: '',
              isModified: false, isCommitTab: false, isUsageTab: true,
            } as any),
            onCloseTab: () => {
              const active = getActiveTab()
              if (active) closeTab(active.id)
            },
            onCloseAllTabs: () => closeAllTabs(),
          })}
        />
      )}

      {showQuerySearch && (
        <QuerySearch
          onClose={() => setShowQuerySearch(false)}
          onSelect={sq => {
            setShowQuerySearch(false)
            openOrFocusTab({
              path: `__query_${sq.id}__`,
              name: sq.name || 'Query',
              ext: 'sql', content: sq.sql, originalContent: sq.sql,
              isModified: false, isCommitTab: false, isQueryTab: true,
              dbConnectionId: sq.connectionId, dbDatabase: sq.database,
              savedQueryId: sq.id,
            } as any)
          }}
        />
      )}
    </div>
  )
}
