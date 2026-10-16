import React, { useEffect, useRef, useState, useCallback } from 'react'
import ActivityBar from './components/ActivityBar'
import Sidebar from './components/Sidebar'
import { FileExplorerHandle } from './components/FileExplorer'
import { DatabasePanelHandle } from './components/DatabasePanel'
import EditorPane from './components/EditorPane'
import Terminal, { TerminalHandle } from './components/Terminal'
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
import ProjectSwitcher from './components/ProjectSwitcher'
import SettingsModal from './components/SettingsModal'
import { registerNewItemShortcut } from './utils/newItemShortcut'
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
  WatchWorkspace,
  ListSavedQueries,
  ConfirmQuit,
} from '../wailsjs/go/main/App'
import { buildCommands } from './utils/commands'
import { Workspace, EditorTab, ViewMode } from './types'

type Panel = 'explorer' | 'git' | 'database' | 'aiSessions'

function lsInt(key: string, def: number) {
  const v = localStorage.getItem(key)
  return v ? parseInt(v, 10) || def : def
}
export default function App() {
  const [activePanel, setActivePanel]       = useState<Panel>('explorer')
  const [showTerminal, setShowTerminal]     = useState(false)
  const [terminalHeight, setTerminalHeight] = useState(() => lsInt('bcode.terminalHeight', 220))
  const [sidebarWidth, setSidebarWidth]     = useState(() => lsInt('bcode.sidebarWidth', 240))
  const [terminalInitialCount, setTerminalInitialCount] = useState(1)
  const [terminalWidth, setTerminalWidth] = useState(() => lsInt('bcode.terminalWidth', 420))
  const [terminalMounted, setTerminalMounted] = useState(false)
  // Cada dock mostra/esconde terminais independentemente — nenhum dos dois é
  // mais "o" dock do terminal; um terminal arrastado pra qualquer um dos dois
  // fica lá até ser arrastado de volta ou fechado.
  const [bottomContainerEl, setBottomContainerEl] = useState<HTMLDivElement | null>(null)
  const [rightContainerEl,  setRightContainerEl]  = useState<HTMLDivElement | null>(null)
  const [bottomTermCount, setBottomTermCount] = useState(0)
  const [rightTermCount,  setRightTermCount]  = useState(0)
  // Enquanto um terminal está sendo arrastado, revela o dock oposto mesmo
  // vazio — senão não haveria onde soltar pra popular um dock vazio.
  const [isDraggingTerminal, setIsDraggingTerminal] = useState(false)
  const [showFileSearch, setShowFileSearch]   = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showQuerySearch, setShowQuerySearch] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // Overlay de troca de projeto (Ctrl/Cmd+↑/↓, segura-e-solta) — vive no
  // workspaceStore, não como useState local (ver o comentário lá): precisa
  // ser alcançável por um comando global do Monaco também, não só pelo
  // listener de window abaixo.
  const switcherIndex = useWorkspaceStore(s => s.switcherIndex)
  const platform = usePlatform()

  const { recentWorkspaces, setRecentWorkspaces, setEverOpenedWorkspaces, currentWorkspace, setCurrentWorkspace, setFileTree } =
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

  // Ações de "criar novo item" expostas pela sidebar (Explorer/Database) —
  // vivem aqui, não dentro de Sidebar.tsx, porque o atalho global
  // Ctrl/Cmd+N / Ctrl/Cmd+Shift+N (abaixo) precisa acioná-las de fora,
  // dependendo de qual painel está ativo.
  const explorerActionsRef = useRef<FileExplorerHandle | null>(null)
  const dbActionsRef = useRef<DatabasePanelHandle | null>(null)
  // Mesmo motivo — AiSessionsPanel.tsx precisa abrir um terminal novo já
  // rodando um comando (resume de sessão) de fora do componente Terminal.
  const terminalActionsRef = useRef<TerminalHandle | null>(null)

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
          pinned:          !!state.pinnedFiles?.includes(filePath),
        })
      } catch { /* arquivo pode ter sido deletado */ }
    }
    // editorStore mantém as fixadas como prefixo contíguo de `tabs` — sort
    // estável preserva a ordem salva dentro de cada grupo.
    tabsToLoad.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))

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
    const pinnedFiles = snap.tabs.filter(t => isRealFileTab(t) && t.pinned).map(t => t.path!)
    const activeTab = snap.tabs.find(t => t.id === snap.activeTabId && isRealFileTab(t))
    await SaveWorkspaceState(ws.id, {
      openFiles,
      pinnedFiles,
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
    // WatchWorkspace já fecha o watcher do workspace anterior sozinho —
    // não precisa de uma chamada de "parar" separada aqui.
    WatchWorkspace(path).catch(console.error)

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
      WatchWorkspace(lastWs.path).catch(console.error)

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
              pinned: !!state.pinnedFiles?.includes(filePath),
            })
          } catch {}
        }
        tabsToLoad.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
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

  // Persiste visibilidade do terminal em localStorage (síncrono — beforeunload não espera async)
  useEffect(() => {
    localStorage.setItem('bcode.terminalVisible', showTerminal ? '1' : '0')
  }, [showTerminal])

  // Monta o terminal na primeira vez que for aberto
  useEffect(() => { if (showTerminal && !terminalMounted) setTerminalMounted(true) }, [showTerminal]) // eslint-disable-line

  // AiSessionsPanel.tsx pede um terminal novo já rodando um comando de resume
  // (ver Terminal.tsx's TerminalHandle). Se o terminal já está montado, só
  // chama direto; senão, guarda o comando e dispara o mount (setShowTerminal),
  // consumido pelo efeito logo abaixo assim que `terminalMounted` vira true —
  // só então o actionRef do Terminal (populado pelo próprio efeito dele, que
  // roda antes deste por ser filho) existe de verdade.
  const pendingTerminalCommandRef = useRef<string | null>(null)
  const openSessionTerminal = useCallback((command: string) => {
    if (terminalMounted) {
      terminalActionsRef.current?.openWithCommand(command)
    } else {
      pendingTerminalCommandRef.current = command
      setShowTerminal(true)
    }
  }, [terminalMounted])
  useEffect(() => {
    if (terminalMounted && pendingTerminalCommandRef.current) {
      const cmd = pendingTerminalCommandRef.current
      pendingTerminalCommandRef.current = null
      terminalActionsRef.current?.openWithCommand(cmd)
    }
  }, [terminalMounted])

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

  // ── Mudanças externas no disco (fora do app) ──────────────────────────────
  // WatchWorkspace (backend) publica "files:changed" (lista de paths,
  // debounced) sempre que algo muda no workspace observado — outro editor,
  // git checkout, um script. Dois efeitos:
  // 1. Árvore do explorer: reconsulta GetFileTree por completo (simples pra
  //    v1 — otimizar por diretório só se isso se provar lento na prática).
  // 2. Abas abertas cujo path está entre os alterados: se não têm alteração
  //    local não salva, recarregam sozinhas (reloadTabContent). Se têm,
  //    não mexe no conteúdo — só marca externallyChanged pra um indicador
  //    discreto (EditorTabBar.tsx), decisão do usuário (2026-10-11): nunca
  //    descartar o que foi digitado sem salvar.
  useEffect(() => {
    const unsub = EventsOn('files:changed', async (paths: string[]) => {
      const ws = useWorkspaceStore.getState().currentWorkspace
      if (ws) {
        const tree = await GetFileTree(ws.path).catch(() => null)
        if (tree) setFileTree(tree)
      }

      const changedSet = new Set(paths)
      const { tabs, reloadTabContent, markExternallyChanged } = useEditorStore.getState()
      for (const tab of tabs) {
        if (!tab.path || !changedSet.has(tab.path)) continue
        if (tab.isModified) {
          markExternallyChanged(tab.id)
          continue
        }
        const content = await ReadFile(tab.path).catch(() => null)
        if (content !== null) reloadTabContent(tab.id, content)
      }
    })
    return unsub
  }, [setFileTree])

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

  // ── Ctrl/Cmd+N e Ctrl/Cmd+Shift+N (novo item, contextual ao painel ativo) ─
  // Explorer → arquivo/pasta (mesmo alvo do botão, ver FileExplorer.tsx);
  // Database → conexão/pasta de conexões. Outro painel: não faz nada.
  // Registrado também como comando global do Monaco (globalEditorShortcuts.ts)
  // pelo mesmo motivo do Ctrl/Cmd+Tab e do project switcher — sem isso, não
  // dispara com o foco dentro de um arquivo aberto.
  const handleNewItemShortcut = useCallback((isFolder: boolean) => {
    if (activePanel === 'explorer') {
      if (isFolder) explorerActionsRef.current?.addFolder()
      else explorerActionsRef.current?.addFile()
    } else if (activePanel === 'database') {
      if (isFolder) dbActionsRef.current?.newConnectionFolder()
      else dbActionsRef.current?.newConnection()
    }
  }, [activePanel])

  useEffect(() => {
    registerNewItemShortcut(handleNewItemShortcut)
  }, [handleNewItemShortcut])

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
      if (e.key.toLowerCase() === 'n' && mod) { e.preventDefault(); handleNewItemShortcut(e.shiftKey) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [fontSize, setFontSize, platform, cycleTab, openOrFocusTab, openLastUsedQuery, handleNewItemShortcut])

  // ── Project switcher (Ctrl/Cmd+↑/↓, segura-e-solta) ──────────────────────
  // Separado do efeito de atalhos acima porque precisa de um listener de
  // keyup próprio (soltar o modificador confirma a troca) — os outros
  // atalhos daqui são só keydown. Cada seta move o destaque (via
  // cycleProjectSwitcher, no workspaceStore — ver o motivo lá); só confirma
  // a troca de workspace de verdade ao soltar Ctrl/Cmd, pra não disparar uma
  // troca real (reload da árvore, restauração de abas etc.) a cada tecla
  // enquanto o usuário ainda está navegando pela lista.
  //
  // Bug relatado (2026-10-11): com o foco dentro do Monaco (um arquivo
  // aberto), o ↑/↓ nunca chegava aqui — Monaco intercepta essas teclas antes
  // de borbulhar pro window, mesma classe de bug já corrigida pro Ctrl/Cmd+Tab
  // (ver globalEditorShortcuts.ts). O keyup do modificador sozinho (sem
  // combinação) não é uma keybinding do Monaco, então continua chegando
  // normalmente — só a parte de abrir/mover precisa do caminho duplicado via
  // comando global do Monaco, não a de confirmar.
  useEffect(() => {
    const isMac = platform === 'darwin'
    const modKey = isMac ? 'Meta' : 'Control'

    const onKeyDown = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (!mod || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
      e.preventDefault()
      useWorkspaceStore.getState().cycleProjectSwitcher(e.key === 'ArrowDown' ? 1 : -1)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== modKey) return
      const { switcherIndex, recentWorkspaces, closeProjectSwitcher } = useWorkspaceStore.getState()
      if (switcherIndex !== null) {
        const target = recentWorkspaces[switcherIndex]
        if (target) handleOpenWorkspace(target.path)
      }
      closeProjectSwitcher()
    }

    const onKeyDownEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useWorkspaceStore.getState().closeProjectSwitcher()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keydown', onKeyDownEscape)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keydown', onKeyDownEscape)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [platform, handleOpenWorkspace])

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
      <TitleBar onOpenSettings={() => setSettingsOpen(true)} />
      <div className="app-main">
        <ActivityBar
          activePanel={activePanel}
          onPanelChange={setActivePanel}
          onToggleTerminal={() => setShowTerminal(v => !v)}
        />
        <div className="app-content">
          <div className="sidebar" style={{ width: sidebarWidth }}>
            <Sidebar
              activePanel={activePanel}
              onOpenWorkspace={handleOpenWorkspace}
              explorerActionsRef={explorerActionsRef}
              dbActionsRef={dbActionsRef}
              onOpenSessionTerminal={openSessionTerminal}
            />
            <div className="sidebar-resize-handle" onMouseDown={handleSidebarResize} />
          </div>

          <div className="editor-area">
            <EditorPane onOpenWorkspace={handleOpenWorkspace} />

            {showTerminal && bottomTermCount > 0 && (
              <div className="terminal-resize-h" onMouseDown={handleTerminalResize} />
            )}
            {/* Sempre montado (não só quando há abas) — é o alvo do portal de
                Terminal, precisa existir antes da 1ª aba ser arrastada pra cá.
                Vira zona de soltura "fantasma" (altura mínima) durante um
                arrasto, mesmo com 0 abas — senão não haveria onde soltar. */}
            <div
              ref={setBottomContainerEl}
              style={{
                display: showTerminal && (bottomTermCount > 0 || isDraggingTerminal) ? 'flex' : 'none',
                flexDirection: 'column',
                height: bottomTermCount > 0 ? terminalHeight : 100,
                width: '100%', flexShrink: 0,
              }}
            />
          </div>

          {showTerminal && rightTermCount > 0 && (
            <div className="terminal-resize-v" onMouseDown={handleTerminalWidthResize} />
          )}
          <div
            ref={setRightContainerEl}
            style={{
              display: showTerminal && (rightTermCount > 0 || isDraggingTerminal) ? 'flex' : 'none',
              flexDirection: 'column',
              width: rightTermCount > 0 ? terminalWidth : 160,
              flexShrink: 0, alignSelf: 'stretch', minHeight: 0,
              borderLeft: '1px solid var(--divider)',
            }}
          />
        </div>
      </div>
      <StatusBar />

      {/* Terminal: montado uma vez e mantido vivo (portais nos dois containers acima)
          para preservar nomes e histórico mesmo com o painel escondido. */}
      {terminalMounted && (
        <Terminal
          bottomContainer={bottomContainerEl}
          rightContainer={rightContainerEl}
          bottomHeight={terminalHeight}
          rightWidth={terminalWidth}
          visible={showTerminal}
          workspaceId={currentWorkspace?.id ?? ''}
          workdir={currentWorkspace?.path ?? '~'}
          initialCount={terminalInitialCount}
          onDraggingChange={setIsDraggingTerminal}
          actionRef={terminalActionsRef}
          onTabCountChange={(dock, n) => {
            if (dock === 'bottom') setBottomTermCount(n)
            else setRightTermCount(n)
            terminalCountRef.current = (dock === 'bottom' ? n : bottomTermCount) + (dock === 'right' ? n : rightTermCount)
            const ws = useWorkspaceStore.getState().currentWorkspace
            if (ws) persistCurrentWs(ws)
          }}
          onAllClosed={() => {
            setShowTerminal(false)
            terminalCountRef.current = 0
            const ws = useWorkspaceStore.getState().currentWorkspace
            if (ws) persistCurrentWs(ws)
          }}
        />
      )}

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

      {switcherIndex !== null && (
        <ProjectSwitcher
          projects={recentWorkspaces}
          highlightedIndex={switcherIndex}
          onSelect={(ws) => { useWorkspaceStore.getState().closeProjectSwitcher(); handleOpenWorkspace(ws.path) }}
        />
      )}

      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}
