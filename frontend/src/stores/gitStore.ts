import { create } from 'zustand'
import { GitFileStatus, GitCommit } from '../types'

interface GitState {
  branch: string
  changedFiles: GitFileStatus[]
  commits: GitCommit[]
  commitsLoading: boolean
  hasMoreCommits: boolean
  commitPageSize: number

  setBranch: (b: string) => void
  setChangedFiles: (files: GitFileStatus[]) => void
  setCommits: (commits: GitCommit[]) => void
  appendCommits: (commits: GitCommit[]) => void
  setCommitsLoading: (v: boolean) => void
  setHasMoreCommits: (v: boolean) => void
}

export const useGitStore = create<GitState>((set) => ({
  branch: '',
  changedFiles: [],
  commits: [],
  commitsLoading: false,
  hasMoreCommits: false,
  commitPageSize: 20,

  setBranch: (b) => set({ branch: b }),
  setChangedFiles: (files) => set({ changedFiles: files }),
  setCommits: (commits) => set({ commits }),
  appendCommits: (commits) => set((s) => ({ commits: [...s.commits, ...commits] })),
  setCommitsLoading: (v) => set({ commitsLoading: v }),
  setHasMoreCommits: (v) => set({ hasMoreCommits: v }),
}))
