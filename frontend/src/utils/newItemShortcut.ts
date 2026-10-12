// Ponte pro atalho Ctrl/Cmd+N / Ctrl/Cmd+Shift+N (criar arquivo/pasta ou
// conexão/pasta de conexões, dependendo do painel ativo) chegar até o
// comando global do Monaco (globalEditorShortcuts.ts). A lógica de
// roteamento mora em App.tsx (fecha sobre activePanel + os actionRefs da
// sidebar), mas o comando do Monaco é registrado uma vez, fora de qualquer
// componente — essa função mutável é o jeito mais simples dos dois lados se
// encontrarem, mesmo espírito de cycleProjectSwitcher no workspaceStore,
// só que aqui a lógica não cabe bem numa store (depende de refs de DOM).
type Handler = (isFolder: boolean) => void

let handler: Handler | null = null

export function registerNewItemShortcut(fn: Handler) {
  handler = fn
}

export function triggerNewItemShortcut(isFolder: boolean) {
  handler?.(isFolder)
}
