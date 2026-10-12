import { create } from 'zustand'
import { EditorTab, ViewMode } from '../types'

interface WsSnapshot {
  tabs: EditorTab[]
  activeTabId: string | null
}

interface EditorState {
  tabs: EditorTab[]
  // Abas globais, independentes de workspace — nunca trocadas pelo cache de
  // switchWorkspace. Hoje só a Home (isUsageTab); é por isso que ela sumia
  // ao trocar de projeto antes desta mudança (vivia dentro de `tabs`, que É
  // trocado por workspace). Ver .specs/tasks/pinned-tabs.md.
  globalTabs: EditorTab[]
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

  // Fixa/desfixa uma aba (não-Home) — fica num grupo fixo à esquerda, igual
  // em espírito à Home, mas por-workspace (persiste com o resto de `tabs`,
  // não vira globalTab). Ver .specs/tasks/pinned-tabs.md critérios 5-8.
  setPinned: (id: string, pinned: boolean) => void

  // Ações de tabs
  addTab:            (tab: EditorTab) => void
  closeTab:          (id: string) => void
  closeOtherTabs:    (id: string) => void
  closeAllTabs:      () => void
  setActiveTab:      (id: string) => void
  cycleTab:          (direction: 1 | -1) => void
  updateTabContent:  (id: string, content: string) => void
  // Conteúdo veio do disco (arquivo mudou por fora), não de digitação —
  // atualiza originalContent junto, diferente de updateTabContent (que
  // sempre marca modificado). Ver .specs/tasks/file-watching-auto-reload.md.
  reloadTabContent:  (id: string, content: string) => void
  markExternallyChanged: (id: string) => void
  renameTab:         (id: string, name: string) => void
  markTabSaved:      (id: string) => void
  setViewMode:       (mode: ViewMode) => void
  setFontSize:       (size: number) => void
  getActiveTab:      () => EditorTab | null
  openOrFocusTab:    (tab: Omit<EditorTab, 'id'>) => void
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs:       [],
  globalTabs: [],
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

  // Mantém `tabs` sempre com as fixadas como prefixo contíguo e as não
  // fixadas como sufixo — EditorTabBar.tsx conta com isso pra mapear índice
  // local (dentro de cada grupo renderizado) pra índice real no array sem
  // precisar de uma segunda estrutura de dados só pra isso.
  setPinned: (id, pinned) => set(s => {
    const tab = s.tabs.find(t => t.id === id)
    if (!tab || !!tab.pinned === pinned) return {}
    const without = s.tabs.filter(t => t.id !== id)
    const updated = { ...tab, pinned }
    if (pinned) {
      const firstUnpinnedIdx = without.findIndex(t => !t.pinned)
      const insertAt = firstUnpinnedIdx === -1 ? without.length : firstUnpinnedIdx
      const arr = [...without]
      arr.splice(insertAt, 0, updated)
      return { tabs: arr }
    }
    return { tabs: [...without, updated] }
  }),

  // ── Ações de tabs ─────────────────────────────────────────────────────────
  addTab: (tab) => set(s => {
    if (s.tabs.find(t => t.id === tab.id)) return { activeTabId: tab.id }
    return { tabs: [...s.tabs, tab], activeTabId: tab.id }
  }),

  closeTab: (id) => set(s => {
    // Home (e qualquer outra globalTab) pode ser fechada como qualquer aba
    // (critério 4 de pinned-tabs.md) — checa lá primeiro, já que não vive em `tabs`.
    if (s.globalTabs.find(t => t.id === id)) {
      const newGlobal = s.globalTabs.filter(t => t.id !== id)
      const newActive = s.activeTabId === id ? (s.tabs[0]?.id ?? null) : s.activeTabId
      return { globalTabs: newGlobal, activeTabId: newActive }
    }
    const idx     = s.tabs.findIndex(t => t.id === id)
    const newTabs = s.tabs.filter(t => t.id !== id)
    let newActive = s.activeTabId
    if (s.activeTabId === id) {
      if (!newTabs.length)           newActive = s.globalTabs[0]?.id ?? null
      else if (idx >= newTabs.length) newActive = newTabs[newTabs.length - 1].id
      else                           newActive = newTabs[idx]?.id ?? newTabs[0].id
    }
    return { tabs: newTabs, activeTabId: newActive }
  }),

  closeOtherTabs: (id) => set(s => ({
    tabs:        s.tabs.filter(t => t.id === id),
    activeTabId: id,
  })),

  closeAllTabs: () => set(s => ({ tabs: [], activeTabId: s.globalTabs[0]?.id ?? null })),

  setActiveTab: (id) => set({ activeTabId: id }),

  // Home (globalTabs) continua alcançável pelo Ctrl/Cmd+Tab — ela já era
  // sempre a primeira aba antes desta mudança, só mudou de array.
  cycleTab: (direction) => set(s => {
    const all = [...s.globalTabs, ...s.tabs]
    if (all.length === 0) return {}
    const idx = all.findIndex(t => t.id === s.activeTabId)
    const nextIdx = idx === -1
      ? 0
      : (idx + direction + all.length) % all.length
    return { activeTabId: all[nextIdx].id }
  }),

  updateTabContent: (id, content) => set(s => ({
    tabs: s.tabs.map(t =>
      t.id === id ? { ...t, content, isModified: content !== t.originalContent } : t
    )
  })),

  reloadTabContent: (id, content) => set(s => ({
    tabs: s.tabs.map(t =>
      t.id === id ? { ...t, content, originalContent: content, isModified: false, externallyChanged: false } : t
    )
  })),

  markExternallyChanged: (id) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, externallyChanged: true } : t)
  })),

  // Salvar sobrescreve o disco — qualquer conflito externo pendente deixa de
  // existir.
  markTabSaved: (id) => set(s => ({
    tabs: s.tabs.map(t =>
      t.id === id ? { ...t, originalContent: t.content, isModified: false, externallyChanged: false } : t
    )
  })),

  renameTab: (id, name) => set(s => ({
    tabs: s.tabs.map(t => t.id === id ? { ...t, name } : t)
  })),

  setViewMode:  (mode) => set({ viewMode: mode }),
  setFontSize:  (size) => set({ fontSize: Math.max(8, Math.min(32, size)) }),
  getActiveTab: ()     => {
    const { tabs, globalTabs, activeTabId } = get()
    return globalTabs.find(t => t.id === activeTabId) ?? tabs.find(t => t.id === activeTabId) ?? null
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
      // Home é global (globalTabs), não por-workspace — sobrevive a
      // switchWorkspace, que só troca `tabs`. Ver nota no topo do arquivo.
      const { globalTabs } = get()
      const existing = globalTabs.find(t => t.isUsageTab)
      if (existing) { set({ activeTabId: existing.id }); return }
      set(s => ({
        globalTabs: [...s.globalTabs, { ...tabData, id: 'usage-tab' } as EditorTab],
        activeTabId: 'usage-tab',
      }))
      return
    }
    if (tabData.isTableTab) {
      // Singleton por (conexão, database, tabela) — reabrir a mesma tabela
      // foca a aba já aberta em vez de duplicar, diferente de isQueryTab (que
      // permite várias abas da mesma query coexistindo).
      const id = `table-${tabData.dbConnectionId}-${tabData.dbDatabase}-${tabData.dbTable}`
      const existing = tabs.find(t => t.id === id)
      if (existing) { set({ activeTabId: existing.id }); return }
      get().addTab({ ...tabData, id })
      return
    }
    if (tabData.isDbTablesTab) {
      const id = `db-tables-${tabData.dbConnectionId}-${tabData.dbDatabase}`
      const existing = tabs.find(t => t.id === id)
      if (existing) { set({ activeTabId: existing.id }); return }
      get().addTab({ ...tabData, id })
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
