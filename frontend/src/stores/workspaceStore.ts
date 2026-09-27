import { create } from 'zustand'
import { Workspace, FileNode } from '../types'

interface WorkspaceState {
  currentWorkspace: Workspace | null
  recentWorkspaces: Workspace[]   // "Open projects" — quick-switch, capped 8, sidebar
  everOpenedWorkspaces: Workspace[] // "Ever opened" — longer history, capped 15, Home
  fileTree: FileNode | null
  isLoading: boolean

  setCurrentWorkspace: (ws: Workspace | null) => void
  setRecentWorkspaces: (list: Workspace[]) => void
  setEverOpenedWorkspaces: (list: Workspace[]) => void
  setFileTree: (tree: FileNode | null) => void
  setLoading: (v: boolean) => void
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  currentWorkspace: null,
  recentWorkspaces: [],
  everOpenedWorkspaces: [],
  fileTree: null,
  isLoading: false,

  setCurrentWorkspace: (ws) => set({ currentWorkspace: ws }),
  setRecentWorkspaces: (list) => set({ recentWorkspaces: list }),
  setEverOpenedWorkspaces: (list) => set({ everOpenedWorkspaces: list }),
  setFileTree: (tree) => set({ fileTree: tree }),
  setLoading: (v) => set({ isLoading: v }),
}))
