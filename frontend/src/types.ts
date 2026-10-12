// Mirror of Go structs

export interface FileNode {
  name: string
  path: string
  isDir: boolean
  ext: string
  children?: FileNode[]
}

export interface FileInfo {
  name: string
  path: string
  size: number
  modTime: string
  isDir: boolean
}

export interface GitFileStatus {
  path: string
  status: string
  statusLabel: string
  statusColor: string
}

export interface GitCommit {
  hash: string
  message: string
  author: string
  relativeDate: string
}

export interface CommitMeta {
  hash: string
  author: string
  relativeDate: string
  message: string
}

export interface DiffLine {
  text: string
  kind: string   // "add" | "remove" | "hunk" | "context"
}

export interface FileDiff {
  path: string
  kind: string   // "modified" | "added" | "deleted"
  lines: DiffLine[]
  additions: number
  deletions: number
}

export interface Workspace {
  id: string
  name: string
  path: string
}

export interface WorkspaceState {
  openFiles: string[]
  activeFile: string
  viewMode: string
}

// Editor Tab types
export type ViewMode = 'code' | 'preview' | 'diff'

export interface EditorTab {
  id: string
  path: string
  name: string
  ext: string
  content: string
  originalContent: string
  isModified: boolean
  isCommitTab: boolean
  commitHash?: string
  commitMessage?: string
  commitWorkspaceRoot?: string
  isGraphTab?: boolean
  isUsageTab?: boolean
  isQueryTab?: boolean
  dbConnectionId?: string
  dbDatabase?: string
  savedQueryId?: string
  pinned?: boolean
  // Arquivo mudou no disco por fora enquanto a aba tinha alteração local não
  // salva (não foi recarregado sozinho, pra não descartar o que o usuário
  // digitou) — indicador discreto na aba. Ver .specs/tasks/file-watching-auto-reload.md.
  externallyChanged?: boolean
  isTableTab?: boolean
  isDbTablesTab?: boolean
  dbTable?: string
}
