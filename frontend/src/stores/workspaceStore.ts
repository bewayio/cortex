import { create } from 'zustand'
import { Workspace, FileNode } from '../types'

interface WorkspaceState {
  currentWorkspace: Workspace | null
  recentWorkspaces: Workspace[]   // "Open projects" — quick-switch, capped 8, sidebar
  everOpenedWorkspaces: Workspace[] // "Ever opened" — longer history, capped 15, Home
  fileTree: FileNode | null
  isLoading: boolean
  // Overlay de troca de projeto (Ctrl/Cmd+↑/↓) — null = fechado. Vive aqui
  // (não em useState local no App.tsx) porque precisa ser lido/escrito tanto
  // pelo listener de teclado em nível de window quanto por um comando global
  // do Monaco (globalEditorShortcuts.ts) — Monaco intercepta ↑/↓ com foco no
  // editor antes do evento chegar no window, mesma classe de bug já corrigida
  // ali pra Ctrl/Cmd+Tab. Uma ação de store, chamável dos dois lugares sem
  // depender de closures de componente, resolve igual.
  switcherIndex: number | null

  setCurrentWorkspace: (ws: Workspace | null) => void
  setRecentWorkspaces: (list: Workspace[]) => void
  setEverOpenedWorkspaces: (list: Workspace[]) => void
  setFileTree: (tree: FileNode | null) => void
  setLoading: (v: boolean) => void
  cycleProjectSwitcher: (direction: 1 | -1) => void
  closeProjectSwitcher: () => void
}

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentWorkspace: null,
  recentWorkspaces: [],
  everOpenedWorkspaces: [],
  fileTree: null,
  isLoading: false,
  switcherIndex: null,

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
  setRecentWorkspaces: (list) => set({ recentWorkspaces: list }),
  setEverOpenedWorkspaces: (list) => set({ everOpenedWorkspaces: list }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setLoading: (v) => set({ isLoading: v }),

  // Abre o overlay (se fechado, destaca o workspace atual) ou move o
  // destaque ±1 com wraparound (se já aberto) — nunca troca de workspace
  // sozinho, isso só acontece ao soltar o modificador (ver App.tsx).
  cycleProjectSwitcher: (direction) => {
    const { recentWorkspaces, currentWorkspace, switcherIndex } = get()
    if (recentWorkspaces.length === 0) return
    if (switcherIndex === null) {
      const curIdx = recentWorkspaces.findIndex(w => w.id === currentWorkspace?.id)
      set({ switcherIndex: curIdx === -1 ? 0 : curIdx })
      return
    }
    set({ switcherIndex: (switcherIndex + direction + recentWorkspaces.length) % recentWorkspaces.length })
  },

  closeProjectSwitcher: () => set({ switcherIndex: null }),
}))
