import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ChevronRight, Folder, FolderOpen, FileText, Code, FileJson } from 'lucide-react'
import { Trans, useTranslation } from 'react-i18next'
import { FileNode } from '../types'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { useEditorStore } from '../stores/editorStore'
import { usePlatform } from '../utils/platform'
import {
  ReadFile, RevealInFinder, GetFileTree,
  CreateFile, CreateDirectory, RenameFile, DeleteFile,
} from '../../wailsjs/go/main/App'

export interface FileExplorerHandle {
  addFile: () => void
  addFolder: () => void
  collapseAll: () => void
}

interface Props {
  actionRef?: React.MutableRefObject<FileExplorerHandle | null>
}

function getFileIcon(ext: string, name: string) {
  const e = ext.toLowerCase(), n = name.toLowerCase()
  if (['ts','tsx','js','jsx'].includes(e)) return <Code size={14} style={{ color: '#61afef' }} />
  if (e === 'go')    return <Code size={14} style={{ color: '#79c0ff' }} />
  if (e === 'py')    return <Code size={14} style={{ color: '#ffd700' }} />
  if (e === 'rs')    return <Code size={14} style={{ color: '#e8834d' }} />
  if (e === 'swift') return <Code size={14} style={{ color: '#e06c75' }} />
  if (['java','kt'].includes(e)) return <Code size={14} style={{ color: '#f89820' }} />
  if (['json','yaml','yml','toml','ini'].includes(e)) return <FileJson size={14} style={{ color: '#e5c07b' }} />
  if (e === 'md')  return <FileText size={14} style={{ color: '#98c379' }} />
  if (['html','css','scss','less','vue','svelte'].includes(e)) return <Code size={14} style={{ color: '#e06c75' }} />
  if (['sh','zsh','bash'].includes(e)) return <Code size={14} style={{ color: '#98c379' }} />
  if (['.gitignore','.env','dockerfile'].includes(n)) return <FileText size={14} style={{ color: '#858585' }} />
  return <FileText size={14} style={{ color: '#858585' }} />
}

function ancestorPaths(path: string): string[] {
  const parts = path.split('/')
  const r: string[] = []
  for (let i = 2; i < parts.length; i++) r.push(parts.slice(0, i).join('/'))
  return r
}

// Busca em toda a árvore, não só nos nós visíveis — ao contrário de
// flatList (que exclui filhos de pastas colapsadas), triggerCreate precisa
// achar a pasta selecionada mesmo que um ancestral dela esteja colapsado.
function findNodeByPath(nodes: FileNode[], path: string): FileNode | undefined {
  for (const n of nodes) {
    if (n.path === path) return n
    if (n.isDir && n.children) {
      const found = findNodeByPath(n.children, path)
      if (found) return found
    }
  }
  return undefined
}

function flattenVisible(nodes: FileNode[], expanded: Set<string>): FileNode[] {
  const r: FileNode[] = []
  for (const n of nodes) {
    r.push(n)
    if (n.isDir && expanded.has(n.path) && n.children)
      r.push(...flattenVisible(n.children, expanded))
  }
  return r
}

interface Creating  { parentDir: string; isDir: boolean; name: string }
interface Renaming  { path: string; name: string }
interface CtxMenu   { x: number; y: number; node: FileNode }
interface ConfirmDelete { paths: string[]; names: string[] }

const FILE_DND_MIME = 'application/x-bcode-file'
const DND_ROOT_KEY = '__root__'

// true if `path` is `maybeAncestor` itself or lives somewhere inside it —
// used to reject dropping a folder into itself or one of its own children.
function isPathInsideOrEqual(path: string, maybeAncestor: string): boolean {
  return path === maybeAncestor || path.startsWith(maybeAncestor + '/')
}

export default function FileExplorer({ actionRef }: Props) {
  const { t } = useTranslation('explorer')
  const { currentWorkspace, fileTree, setFileTree } = useWorkspaceStore()
  const { openOrFocusTab, tabs, activeTabId } = useEditorStore()

  const activeTab  = tabs.find(t => t.id === activeTabId)
  const activePath = activeTab?.isCommitTab ? null : (activeTab?.path ?? null)

  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
    const s = new Set<string>()
    fileTree?.children?.filter(n => n.isDir).forEach(n => s.add(n.path))
    return s
  })
  const platform = usePlatform()
  const [focusedPath,   setFocusedPath]   = useState<string | null>(null)
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [ctxMenu,       setCtxMenu]       = useState<CtxMenu | null>(null)
  const [creating,      setCreating]      = useState<Creating | null>(null)
  const [renaming,      setRenaming]      = useState<Renaming | null>(null)
  const [confirmDel,    setConfirmDel]    = useState<ConfirmDelete | null>(null)
  const [dragOverPath,  setDragOverPath]  = useState<string | null>(null)
  const lastClickedPath = useRef<string | null>(null)

  const containerRef   = useRef<HTMLDivElement>(null)
  const createInputRef = useRef<HTMLInputElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const lastRevealRef  = useRef<string | null>(null)

  // ── Refresh tree ───────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    if (!currentWorkspace) return
    const tree = await GetFileTree(currentWorkspace.path).catch(() => null)
    if (tree) setFileTree(tree)
  }, [currentWorkspace, setFileTree])

  // Auto-expande as pastas de primeiro nível só na primeira carga de CADA
  // workspace — não a cada refresh da árvore. Sem essa guarda, qualquer
  // atualização (ex: o watcher de arquivos reconsultando a árvore quando
  // algo muda por fora) reexpandia tudo, desfazendo um collapse manual do
  // usuário (bug relatado pelo usuário, 2026-10-12).
  const expandedWorkspaceRef = useRef<string | null>(null)
  useEffect(() => {
    if (!fileTree || !currentWorkspace) return
    if (expandedWorkspaceRef.current === currentWorkspace.path) return
    expandedWorkspaceRef.current = currentWorkspace.path
    setExpandedPaths(prev => {
      const n = new Set(prev)
      fileTree.children?.filter(c => c.isDir).forEach(c => n.add(c.path))
      return n
    })
  }, [fileTree, currentWorkspace])

  const toggleDir = useCallback((path: string) => {
    setExpandedPaths(prev => { const n = new Set(prev); n.has(path) ? n.delete(path) : n.add(path); return n })
  }, [])

  // ── Auto-reveal active file ────────────────────────────────────────────
  useEffect(() => {
    if (!activePath || activePath === lastRevealRef.current) return
    lastRevealRef.current = activePath
    const ancs = ancestorPaths(activePath)
    if (ancs.length) setExpandedPaths(prev => { const n = new Set(prev); ancs.forEach(a => n.add(a)); return n })
    setTimeout(() => document.getElementById(`ft-${activePath}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 80)
  }, [activePath])

  const flatList = useMemo(
    () => fileTree?.children ? flattenVisible(fileTree.children, expandedPaths) : [],
    [fileTree, expandedPaths]
  )

  useEffect(() => {
    if (!focusedPath) return
    document.getElementById(`ft-${focusedPath}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [focusedPath])

  // ── Internal actions (lidos via actionsRef — sem stale closure) ─────────
  // O ref é atualizado a cada render para capturar o estado mais recente
  const internalRef = useRef({ focusedPath, activePath, currentWorkspace, fileTree })
  internalRef.current = { focusedPath, activePath, currentWorkspace, fileTree }

  // ── Expõe ações ao pai via actionRef ─────────────────────────────────
  useEffect(() => {
    if (!actionRef) return
    actionRef.current = {
      addFile:    () => triggerCreate(false),
      addFolder:  () => triggerCreate(true),
      collapseAll: () => { setExpandedPaths(new Set()); setFocusedPath(null) },
    }
  })

  function triggerCreate(isDir: boolean) {
    const { focusedPath: fp, activePath: ap, currentWorkspace: ws, fileTree: ft } = internalRef.current
    const base = fp ?? ap
    let parentDir = ws?.path ?? ''
    if (base) {
      // Busca na árvore inteira, não só em flatList (nós visíveis) — uma
      // pasta selecionada cujo ancestral está colapsado não aparece em
      // flatList, o que fazia cair no `else` e criar como irmã em vez de
      // dentro dela (bug relatado pelo usuário, 2026-10-12).
      const node = ft?.children ? findNodeByPath(ft.children, base) : undefined
      // Pasta selecionada: cria DENTRO dela, esteja expandida ou não — antes
      // só considerava o alvo se já estivesse expandida, criando como irmã
      // em vez de dentro quando colapsada (bug relatado pelo usuário,
      // 2026-10-11). commitCreate já expande o parentDir depois de criar.
      if (node?.isDir) parentDir = node.path
      else parentDir = base.split('/').slice(0, -1).join('/')
    }
    setCreating({ parentDir, isDir, name: '' })
    // Expande a pasta-alvo já na hora de abrir o input, não só depois de criar
    // — senão a linha de criação (agora posicionada dentro da pasta, não mais
    // fixa no topo) ficaria escondida se a pasta estivesse colapsada.
    setExpandedPaths(prev => new Set([...prev, parentDir]))
    setTimeout(() => createInputRef.current?.focus(), 0)
  }

  // ── Keyboard navigation ───────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (creating || renaming) return
    const idx = flatList.findIndex(n => n.path === focusedPath)

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedPath(flatList[Math.min(idx + 1, flatList.length - 1)]?.path ?? focusedPath)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedPath(flatList[Math.max(idx - 1, 0)]?.path ?? focusedPath)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      const node = flatList[idx]
      if (!node) return
      if (node.isDir && !expandedPaths.has(node.path)) toggleDir(node.path)
      else if (node.isDir && expandedPaths.has(node.path) && node.children?.length)
        setFocusedPath(node.children[0].path)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const node = flatList[idx]
      if (!node) return
      if (node.isDir && expandedPaths.has(node.path)) toggleDir(node.path)
      else {
        const parentPath = node.path.split('/').slice(0, -1).join('/')
        if (flatList.find(n => n.path === parentPath)) setFocusedPath(parentPath)
      }
    } else if (e.key === 'Enter' && (platform === 'darwin' ? e.metaKey : e.ctrlKey)) {
      e.preventDefault()
      const node = flatList[idx]
      if (node && !node.isDir) openFile(node)
    } else if (e.key === 'Enter' || e.key === 'F2') {
      e.preventDefault()
      const node = flatList[idx]
      if (node) { setRenaming({ path: node.path, name: node.name }); setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() }, 0) }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      const toDelete = selectedPaths.size > 0
        ? { paths: [...selectedPaths], names: [...selectedPaths].map(p => p.split('/').pop() ?? p) }
        : focusedPath
          ? { paths: [focusedPath], names: [focusedPath.split('/').pop() ?? focusedPath] }
          : null
      if (toDelete) setConfirmDel(toDelete)
    } else if (e.key === 'Escape') {
      setFocusedPath(null)
      setSelectedPaths(new Set())
      containerRef.current?.blur()
    }
  }

  // ── Multi-select click ─────────────────────────────────────────────────
  const handleItemClick = (e: React.MouseEvent, node: FileNode) => {
    if (e.metaKey || e.ctrlKey) {
      // Cmd+Click: toggle
      setSelectedPaths(prev => {
        const n = new Set(prev)
        n.has(node.path) ? n.delete(node.path) : n.add(node.path)
        return n
      })
      setFocusedPath(node.path)
    } else if (e.shiftKey && lastClickedPath.current) {
      // Shift+Click: range
      const from = flatList.findIndex(n => n.path === lastClickedPath.current)
      const to   = flatList.findIndex(n => n.path === node.path)
      const [lo, hi] = from < to ? [from, to] : [to, from]
      const range = flatList.slice(lo, hi + 1).map(n => n.path)
      setSelectedPaths(new Set(range))
      setFocusedPath(node.path)
    } else {
      // Click normal
      setSelectedPaths(new Set([node.path]))
      setFocusedPath(node.path)
      lastClickedPath.current = node.path
    }
  }

  // ── Executa delete ─────────────────────────────────────────────────────
  const executeDelete = async () => {
    if (!confirmDel) return
    for (const p of confirmDel.paths) {
      await DeleteFile(p).catch(console.error)
    }
    setConfirmDel(null)
    setSelectedPaths(new Set())
    await refresh()
  }

  // ── Open file ────────────────────────────────────────────────────────
  const openFile = useCallback(async (node: FileNode) => {
    const content = await ReadFile(node.path).catch(() => '')
    openOrFocusTab({ path: node.path, name: node.name, ext: node.ext, content, originalContent: content, isModified: false, isCommitTab: false })
  }, [openOrFocusTab])

  // ── Commit rename ───────────────────────────────────────────────────
  const commitRename = async () => {
    if (!renaming) return
    const newName = renaming.name.trim()
    const oldName = renaming.path.split('/').pop() ?? ''
    if (!newName || newName === oldName) { setRenaming(null); return }
    const dir = renaming.path.split('/').slice(0, -1).join('/')
    await RenameFile(renaming.path, `${dir}/${newName}`).catch(console.error)
    setRenaming(null)
    await refresh()
  }

  // ── Drag-and-drop move ──────────────────────────────────────────────
  // Reusa RenameFile (mesma chamada que o rename-em-linha já faz) com um
  // destino em outro diretório — não é uma operação nova no backend.
  const movePath = async (draggedPath: string, targetDir: string) => {
    const base = draggedPath.split('/').pop() ?? ''
    const currentDir = draggedPath.split('/').slice(0, -1).join('/')
    if (targetDir === currentDir) return // já está lá, no-op
    if (isPathInsideOrEqual(targetDir, draggedPath)) return // dropar numa pasta dentro dela mesma
    await RenameFile(draggedPath, `${targetDir}/${base}`).catch(console.error)
    await refresh()
  }

  const handleDragStart = (node: FileNode) => (e: React.DragEvent) => {
    e.dataTransfer.setData(FILE_DND_MIME, node.path)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOverDir = (targetPath: string) => (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes(FILE_DND_MIME)) return
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverPath !== targetPath) setDragOverPath(targetPath)
  }

  const handleDragLeaveDir = (targetPath: string) => (e: React.DragEvent) => {
    if (dragOverPath === targetPath) setDragOverPath(null)
  }

  const handleDropOnDir = (targetPath: string) => (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPath(null)
    const draggedPath = e.dataTransfer.getData(FILE_DND_MIME)
    if (draggedPath) movePath(draggedPath, targetPath)
  }

  // ── Commit create ────────────────────────────────────────────────────
  const commitCreate = async () => {
    if (!creating) return
    const name = creating.name.trim()
    if (!name) { setCreating(null); return }
    const fullPath = `${creating.parentDir}/${name}`
    if (creating.isDir) await CreateDirectory(fullPath).catch(console.error)
    else await CreateFile(fullPath).catch(console.error)
    setCreating(null)
    setExpandedPaths(prev => new Set([...prev, creating.parentDir]))
    await refresh()
    setFocusedPath(fullPath)
  }

  if (!fileTree) return null

  return (
    <div
      ref={containerRef}
      className={`file-tree ${dragOverPath === DND_ROOT_KEY ? 'drag-over' : ''}`}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={() => containerRef.current?.focus()}
      onDragOver={currentWorkspace ? handleDragOverDir(DND_ROOT_KEY) : undefined}
      onDragLeave={handleDragLeaveDir(DND_ROOT_KEY)}
      onDrop={currentWorkspace ? handleDropOnDir(currentWorkspace.path) : undefined}
    >
      {/* Dialog de confirmação inline — sem window.confirm */}
      {confirmDel && (
        <div className="ft-confirm-overlay">
          <div className="ft-confirm-dialog">
            <div className="ft-confirm-msg">
              {confirmDel.paths.length === 1
                ? <Trans t={t} i18nKey="confirmDelete.one" values={{ name: confirmDel.names[0] }} components={{ b: <strong /> }} />
                : <Trans t={t} i18nKey="confirmDelete.many" values={{ count: confirmDel.paths.length }} components={{ b: <strong /> }} />
              }
            </div>
            <div className="ft-confirm-actions">
              <button className="ft-confirm-btn cancel" onClick={() => setConfirmDel(null)}>{t('common:cancel')}</button>
              <button className="ft-confirm-btn danger" onClick={executeDelete}>{t('common:delete')}</button>
            </div>
          </div>
        </div>
      )}
      {creating && creating.parentDir === currentWorkspace?.path && renderCreatingRow(0)}

      {renderNodes(fileTree.children ?? [], 0)}

      {ctxMenu && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 9998 }} onClick={() => setCtxMenu(null)} />
          <div className="context-menu" style={{ top: ctxMenu.y, left: ctxMenu.x }}>
            {!ctxMenu.node.isDir && <div className="context-menu-item" onClick={() => { openFile(ctxMenu.node); setCtxMenu(null) }}>{t('contextMenu.open')}</div>}
            <div className="context-menu-item" onClick={() => { setRenaming({ path: ctxMenu.node.path, name: ctxMenu.node.name }); setTimeout(() => { renameInputRef.current?.focus(); renameInputRef.current?.select() }, 0); setCtxMenu(null) }}>{t('contextMenu.rename')}</div>
            <div className="context-menu-item" onClick={() => { navigator.clipboard.writeText(ctxMenu.node.path); setCtxMenu(null) }}>{t('contextMenu.copyPath')}</div>
            <div className="context-menu-separator" />
            <div className="context-menu-item" onClick={async () => { await RevealInFinder(ctxMenu.node.path).catch(console.error); setCtxMenu(null) }}>{t('contextMenu.revealInFinder')}</div>
            <div className="context-menu-separator" />
            <div className="context-menu-item danger" onClick={() => {
              const paths = selectedPaths.size > 1 && selectedPaths.has(ctxMenu.node.path)
                ? { paths: [...selectedPaths], names: [...selectedPaths].map(p => p.split('/').pop() ?? p) }
                : { paths: [ctxMenu.node.path], names: [ctxMenu.node.name] }
              setCtxMenu(null)
              setConfirmDel(paths)
            }}>
              {selectedPaths.size > 1 && selectedPaths.has(ctxMenu.node.path)
                ? t('contextMenu.deleteCount', { count: selectedPaths.size }) : t('common:delete')}
            </div>
          </div>
        </>
      )}
    </div>
  )

  // Linha de criação inline — renderizada na posição real dentro da pasta
  // alvo (raiz ou uma subpasta), não fixa no topo da árvore, pra não
  // confundir o usuário sobre onde o item vai ser criado (bug relatado
  // pelo usuário, 2026-10-12).
  function renderCreatingRow(depth: number) {
    if (!creating) return null
    return (
      <div className="file-tree-create-row" style={{ paddingLeft: depth * 12 + 4 + (creating.isDir ? 0 : 16) }}>
        {creating.isDir ? <Folder size={14} style={{ color: '#e5c07b', flexShrink: 0 }} /> : <FileText size={14} style={{ color: '#858585', flexShrink: 0 }} />}
        <input
          ref={createInputRef}
          className="file-tree-inline-input"
          value={creating.name}
          placeholder={creating.isDir ? t('create.folderNamePlaceholder') : t('create.fileNamePlaceholder')}
          onChange={e => setCreating({ ...creating, name: e.target.value })}
          onKeyDown={e => {
            if (e.key === 'Enter')  { e.preventDefault(); commitCreate() }
            if (e.key === 'Escape') { e.preventDefault(); setCreating(null) }
          }}
          onBlur={commitCreate}
        />
      </div>
    )
  }

  function renderNodes(nodes: FileNode[], depth: number): React.ReactNode {
    return nodes.map(node => (
      <React.Fragment key={node.path}>
        {node.isDir ? renderDir(node, depth) : renderFile(node, depth)}
      </React.Fragment>
    ))
  }

  function renderDir(node: FileNode, depth: number) {
    const expanded = expandedPaths.has(node.path)
    return (
      <div>
        <div id={`ft-${node.path}`}
          className={`file-tree-item ${focusedPath === node.path ? 'focused' : ''} ${dragOverPath === node.path ? 'drag-over' : ''}`}
          style={{ paddingLeft: depth * 12 + 4 }}
          draggable
          onDragStart={handleDragStart(node)}
          onDragOver={handleDragOverDir(node.path)}
          onDragLeave={handleDragLeaveDir(node.path)}
          onDrop={handleDropOnDir(node.path)}
          onClick={() => { toggleDir(node.path); setFocusedPath(node.path) }}
          onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, node }) }}
        >
          <span className={`file-tree-item-chevron ${expanded ? 'expanded' : ''}`}><ChevronRight size={12} /></span>
          <span className="file-tree-item-icon">
            {expanded ? <FolderOpen size={14} style={{ color: '#e5c07b' }} /> : <Folder size={14} style={{ color: '#e5c07b' }} />}
          </span>
          <span className="file-tree-item-name">{node.name}</span>
        </div>
        {expanded && (
          <>
            {creating && creating.parentDir === node.path && renderCreatingRow(depth + 1)}
            {node.children && renderNodes(node.children, depth + 1)}
          </>
        )}
      </div>
    )
  }

  function renderFile(node: FileNode, depth: number) {
    const isRenaming = renaming?.path === node.path
    const isSelected = selectedPaths.has(node.path)
    return (
      <div id={`ft-${node.path}`}
        className={`file-tree-item ${activePath === node.path ? 'active' : ''} ${focusedPath === node.path ? 'focused' : ''} ${isSelected ? 'selected' : ''}`}
        style={{ paddingLeft: depth * 12 + 4 + 16 }}
        draggable={!isRenaming}
        onDragStart={handleDragStart(node)}
        onClick={e => { handleItemClick(e, node); if (!e.metaKey && !e.ctrlKey && !e.shiftKey) openFile(node) }}
        onContextMenu={e => { e.preventDefault(); if (!selectedPaths.has(node.path)) setSelectedPaths(new Set([node.path])); setCtxMenu({ x: e.clientX, y: e.clientY, node }) }}
      >
        <span className="file-tree-item-icon">{getFileIcon(node.ext, node.name)}</span>
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="file-tree-inline-input"
            value={renaming!.name}
            onChange={e => setRenaming({ ...renaming!, name: e.target.value })}
            onKeyDown={e => {
              if (e.key === 'Enter')  { e.preventDefault(); commitRename() }
              if (e.key === 'Escape') { e.preventDefault(); setRenaming(null) }
              if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation()
            }}
            onBlur={commitRename}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <span className="file-tree-item-name">{node.name}</span>
        )}
      </div>
    )
  }
}
