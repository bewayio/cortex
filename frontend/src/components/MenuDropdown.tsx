import React, { useEffect, useRef, useState } from 'react'
import { ChevronRight } from 'lucide-react'

// Dropdown genérico pra title bar: lista plana de ações, separador, e um
// nível de submenu (expande inline, sem flyout — mais simples de acertar em
// WebKitGTK do que posicionamento flutuante aninhado). Primeiro menu
// dropdown/submenu deste app (antes só existia o botão direto de
// Configurações) — composto pelos menus "Terminal" e "Chats com IA" da
// title bar. Ver .specs/tasks/system-menu-terminal-and-ai-chats.md.
export type MenuItem =
  | { id: string; type: 'action'; label: string; onClick: () => void }
  | { id: string; type: 'separator' }
  | { id: string; type: 'submenu'; label: string; items: MenuItem[] }

interface Props {
  label: string
  items: MenuItem[]
}

export default function MenuDropdown({ label, items }: Props) {
  const [open, setOpen] = useState(false)
  const [openSubmenuId, setOpenSubmenuId] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const close = () => { setOpen(false); setOpenSubmenuId(null) }

  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const renderItems = (list: MenuItem[]) => list.map(item => {
    if (item.type === 'separator') return <div key={item.id} className="menubar-separator" />
    if (item.type === 'submenu') {
      const expanded = openSubmenuId === item.id
      return (
        <div key={item.id} className="menubar-submenu">
          <div
            className="menubar-row menubar-submenu-trigger"
            onClick={() => setOpenSubmenuId(expanded ? null : item.id)}
          >
            <span>{item.label}</span>
            <ChevronRight size={12} style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
          </div>
          {expanded && (
            <div className="menubar-submenu-items">
              {renderItems(item.items)}
            </div>
          )}
        </div>
      )
    }
    return (
      <div key={item.id} className="menubar-row" onClick={() => { item.onClick(); close() }}>
        {item.label}
      </div>
    )
  })

  return (
    <div className="menubar-item" ref={containerRef}>
      <button
        className={`app-titlebar-menu-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        {label}
      </button>
      {open && (
        <div className="menubar-dropdown">
          {items.length === 0 ? (
            <div className="menubar-empty">—</div>
          ) : renderItems(items)}
        </div>
      )}
    </div>
  )
}
