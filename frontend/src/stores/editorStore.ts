import { create } from 'zustand'
import { EditorTab, ViewMode } from '../types'

interface WsSnapshot {
  tabs: EditorTab[]
  activeTabId: string | null
}

interface EditorState {
  tabs: EditorTab[]
  activeTabId: string | null
  activeWsId: string | null
  viewMode: ViewMode
  fontSize: number

  // Cache em memória: wsId → snapshot de tabs
  _cache: Record<string, WsSnapshot>

  // Troca de workspace — instantânea, sem async
  switchWorkspace: (newWsId: string) => void

  // Preenche tabs de um workspace (vindo do disco) e atualiza o display se for o ativo
  loadWorkspaceTabs: (wsId: string, tabs: EditorTab[], activeTabId: string | null) => void

  // Retorna snapshot do workspace ativo (para persistir no disco)
  snapshotCurrentWs: () => WsSnapshot

  reorderTabs: (fromIdx: number, toIdx: number) => void

  // Ações de tabs
  addTab:            (tab: EditorTab) => void
  closeTab:          (id: string) => void
  closeOtherTabs:    (id: string) => void
  closeAllTabs:      () => void
  setActiveTab:      (id: string) => void
  cycleTab:          (direction: 1 | -1) => void
  updateTabContent:  (id: string, content: string) => void
  renameTab:         (id: string, name: string) => void
  markTabSaved:      (id: string) => void
  setViewMode:       (mode: ViewMode) => void
  setFontSize:       (size: number) => void
  getActiveTab:      () => EditorTab | null
  openOrFocusTab:    (tab: Omit<EditorTab, 'id'>) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs:       [],
  activeTabId: null,
  activeWsId:  null,
  viewMode:   'code',
  fontSize:   13,
  _cache:     {},

  // ── Troca de workspace ────────────────────────────────────────────────────
  switchWorkspace: (newWsId) => set(s => {
    const cache = { ...s._cache }
    // Salva estado atual no cache antes de trocar
    if (s.activeWsId) {
      cache[s.activeWsId] = { tabs: s.tabs, activeTabId: s.activeTabId }
    }
    // Carrega novo workspace do cache (vazio se nunca carregado)
    const snap = cache[newWsId] ?? { tabs: [], activeTabId: null }
    return {
      _cache:      cache,
      activeWsId:  newWsId,
      tabs:        snap.tabs,
      activeTabId: snap.activeTabId,
    }
  }),

  // ── Preenche workspace com tabs vindas do disco ───────────────────────────
  loadWorkspaceTabs: (wsId, tabs, activeTabId) => set(s => {
    const cache = { ...s._cache, [wsId]: { tabs, activeTabId } }
    // Só atualiza o display se este workspace for o ativo
    if (s.activeWsId === wsId) return { _cache: cache, tabs, activeTabId }
    return { _cache: cache }
  }),

  snapshotCurrentWs: () => {
    const { tabs, activeTabId } = get()
    return { tabs, activeTabId }
  },

  reorderTabs: (from, to) => set(s => {
    if (from === to) return {}
    const arr = [...s.tabs]
    const [tab] = arr.splice(from, 1)
    arr.splice(to, 0, tab)
    return { tabs: arr }
  }),

  // ── Ações de tabs ─────────────────────────────────────────────────────────
  addTab: (tab) => set(s => {
    if (s.tabs.find(t => t.id === tab.id)) return { activeTabId: tab.id }
    return { tabs: [...s.tabs, tab], activeTabId: tab.id }
  }),

  closeTab: (id) => set(s => {
    const idx     = s.tabs.findIndex(t => t.id === id)
    const newTabs = s.tabs.filter(t => t.id !== id)
    let newActive = s.activeTabId
    if (s.activeTabId === id) {
      if (!newTabs.length)           newActive = null
      else if (idx >= newTabs.length) newActive = newTabs[newTabs.length - 1].id
      else                           newActive = newTabs[idx]?.id ?? newTabs[0].id
    }
    return { tabs: newTabs, activeTabId: newActive }
  }),

  closeOtherTabs: (id) => set(s => ({
    tabs:        s.tabs.filter(t => t.id === id),
    activeTabId: id,
  })),

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

  setActiveTab: (id) => set({ activeTabId: id }),

  cycleTab: (direction) => set(s => {
    if (s.tabs.length === 0) return {}
    const idx = s.tabs.findIndex(t => t.id === s.activeTabId)
    const nextIdx = idx === -1
      ? 0
      : (idx + direction + s.tabs.length) % s.tabs.length
    return { activeTabId: s.tabs[nextIdx].id }
  }),

  updateTabContent: (id, content) => set(s => ({
    tabs: s.tabs.map(t =>
      t.id === id ? { ...t, content, isModified: content !== t.originalContent } : t
    )
  })),

  markTabSaved: (id) => set(s => ({
    tabs: s.tabs.map(t =>
      t.id === id ? { ...t, originalContent: t.content, isModified: false } : t
    )
  })),

  renameTab: (id, name) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t)
  })),

  setViewMode:  (mode) => set({ viewMode: mode }),
  setFontSize:  (size) => set({ fontSize: Math.max(8, Math.min(32, size)) }),
  getActiveTab: ()     => {
    const { tabs, activeTabId } = get()
    return tabs.find(t => t.id === activeTabId) ?? null
  },

  openOrFocusTab: (tabData) => {
    const { tabs } = get()
    if (tabData.isGraphTab) {
      const existing = tabs.find(t => t.isGraphTab)
      if (existing) { set({ activeTabId: existing.id }); return }
      get().addTab({ ...tabData, id: 'git-graph' })
      return
    }
    if (tabData.isUsageTab) {
      const existing = tabs.find(t => t.isUsageTab)
      if (existing) { set({ activeTabId: existing.id }); return }
      get().addTab({ ...tabData, id: 'usage-tab' })
      return
    }
    if (tabData.isQueryTab) {
      // Não é singleton (várias abas de query coexistem) — só foca uma já
      // aberta se ela vier da mesma query salva (savedQueryId), senão sempre
      // cria uma nova aba.
      if (tabData.savedQueryId) {
        const existing = tabs.find(t => t.isQueryTab && t.savedQueryId === tabData.savedQueryId)
        if (existing) { set({ activeTabId: existing.id }); return }
      }
      get().addTab({ ...tabData, id: `query-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` })
      return
    }
    if (!tabData.isCommitTab) {
      const existing = tabs.find(t => t.path === tabData.path && !t.isCommitTab)
      if (existing) { set({ activeTabId: existing.id }); return }
    }
    const id = tabData.isCommitTab
      ? `commit-${tabData.commitHash}`
      : `file-${tabData.path}`
    get().addTab({ ...tabData, id })
  },
}))
