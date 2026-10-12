import i18n from '../i18n'

// ── Mermaid ───────────────────────────────────────────────────────────────────

let mermaidReady = false

async function getMermaid() {
  const m = (await import('mermaid')).default
  if (!mermaidReady) {
    m.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        background: '#1e1e1e',
        primaryColor: '#007acc',
        primaryTextColor: '#d4d4d4',
        lineColor: '#858585',
        secondaryColor: '#252526',
        tertiaryColor: '#2d2d2d',
      },
    })
    mermaidReady = true
  }
  return m
}

let mermaidSeq = 0

function openLightbox(svgContent: string) {
  const overlay = document.createElement('div')
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:99999',
    'background:rgba(0,0,0,0.88)',
    'display:flex;align-items:center;justify-content:center;padding:40px',
    'cursor:zoom-out',
  ].join(';')

  const box = document.createElement('div')
  box.style.cssText = [
    'background:#1e1e1e;border:1px solid #3a3a3a;border-radius:10px',
    'padding:24px;overflow:auto;cursor:default',
    // Ocupa até 90% da viewport, mas cresce para preencher
    'max-width:90vw;max-height:88vh;',
    'display:flex;align-items:center;justify-content:center;',
    'min-width:min(600px,80vw)',
  ].join(';')
  box.innerHTML = svgContent

  // Faz o SVG preencher o espaço disponível no lightbox
  const svgEl = box.querySelector('svg')
  if (svgEl) {
    svgEl.style.width = '100%'
    svgEl.style.height = 'auto'
    svgEl.style.minWidth = 'min(500px, 70vw)'
    svgEl.removeAttribute('width')
    svgEl.removeAttribute('height')
  }

  // Também faz imagens (PlantUML) preencherem
  const imgEl = box.querySelector('img')
  if (imgEl) {
    imgEl.style.maxWidth = '80vw'
    imgEl.style.maxHeight = '80vh'
    imgEl.style.width = 'auto'
    imgEl.style.height = 'auto'
  }

  const closeBtn = document.createElement('button')
  closeBtn.textContent = '✕'
  closeBtn.style.cssText = [
    'position:fixed;top:16px;right:20px',
    'background:rgba(255,255,255,0.12);border:none;color:#d4d4d4',
    'width:32px;height:32px;border-radius:50%;cursor:pointer;font-size:16px',
    'display:flex;align-items:center;justify-content:center;z-index:100000',
  ].join(';')

  overlay.appendChild(box)
  overlay.appendChild(closeBtn)
  document.body.appendChild(overlay)

  const close = () => overlay.remove()
  overlay.addEventListener('click', e => { if (e.target === overlay) close() })
  closeBtn.addEventListener('click', close)
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc) }
  })
}

export async function renderMermaid(container: HTMLElement, code: string): Promise<void> {
  container.innerHTML = `<span style="color:var(--fg-dim);font-size:11px">${i18n.t('editor:diagrams.rendering')}</span>`
  try {
    const m = await getMermaid()
    const id = `mmd-${++mermaidSeq}-${Date.now()}`
    const { svg } = await m.render(id, code)

    container.innerHTML = ''
    container.classList.add('diagram-thumbnail')

    // Thumbnail: SVG completo mas escalado
    const thumb = document.createElement('div')
    thumb.className = 'diagram-thumb-inner'
    thumb.innerHTML = svg
    const svgEl = thumb.querySelector('svg')
    if (svgEl) {
      svgEl.style.maxWidth = '100%'
      svgEl.style.height = 'auto'
      svgEl.removeAttribute('height')
    }

    const hint = document.createElement('div')
    hint.className = 'diagram-hint'
    hint.textContent = `🔍 ${i18n.t('editor:diagrams.clickToExpand')}`

    container.appendChild(thumb)
    container.appendChild(hint)
    container.style.cursor = 'zoom-in'
    container.addEventListener('click', () => openLightbox(svg))
  } catch (e) {
    container.innerHTML = `<pre style="color:#e06c75;font-size:11px">${i18n.t('editor:diagrams.mermaidError', { error: e })}</pre>`
  }
}

// ── PlantUML ──────────────────────────────────────────────────────────────────

const PLANTUML_SERVER = 'https://www.plantuml.com/plantuml/svg/'

function encode6bit(b: number): string {
  if (b < 10) return String.fromCharCode(48 + b)
  b -= 10
  if (b < 26) return String.fromCharCode(65 + b)
  b -= 26
  if (b < 26) return String.fromCharCode(97 + b)
  b -= 26
  if (b === 0) return '-'
  if (b === 1) return '_'
  return '?'
}

function append3bytes(b1: number, b2: number, b3: number): string {
  return (
    encode6bit(b1 >> 2) +
    encode6bit(((b1 & 0x3) << 4) | (b2 >> 4)) +
    encode6bit(((b2 & 0xf) << 2) | (b3 >> 6)) +
    encode6bit(b3 & 0x3f)
  )
}

async function encodePlantUML(text: string): Promise<string> {
  const data = new TextEncoder().encode(text)
  const cs = new CompressionStream('deflate-raw')
  const writer = cs.writable.getWriter()
  writer.write(data)
  writer.close()
  const compressed = await new Response(cs.readable).arrayBuffer()
  const bytes = new Uint8Array(compressed)
  let result = ''
  for (let i = 0; i < bytes.length; i += 3) {
    result += append3bytes(bytes[i] ?? 0, bytes[i + 1] ?? 0, bytes[i + 2] ?? 0)
  }
  return result
}

export async function renderPlantUML(container: HTMLElement, code: string): Promise<void> {
  container.innerHTML = `<span style="color:var(--fg-dim);font-size:11px">${i18n.t('editor:diagrams.rendering')}</span>`
  try {
    const wrapped = code.trimStart().startsWith('@')
      ? code
      : `@startuml\n${code}\n@enduml`
    const encoded = await encodePlantUML(wrapped)
    const url = PLANTUML_SERVER + encoded

    container.innerHTML = ''
    container.classList.add('diagram-thumbnail')
    container.style.cursor = 'zoom-in'

    const img = document.createElement('img')
    img.src = url
    img.alt = i18n.t('editor:diagrams.plantumlAlt')
    img.style.cssText = 'max-width:100%;max-height:200px;border-radius:4px;object-fit:contain;'

    const hint = document.createElement('div')
    hint.className = 'diagram-hint'
    hint.textContent = `🔍 ${i18n.t('editor:diagrams.clickToExpand')}`

    container.appendChild(img)
    container.appendChild(hint)

    container.addEventListener('click', () => {
      openLightbox(`<img src="${url}" alt="${i18n.t('editor:diagrams.plantumlAlt')}" style="max-width:85vw;max-height:80vh;" />`)
    })
  } catch (e) {
    container.innerHTML = `<pre style="color:#e06c75;font-size:11px">${i18n.t('editor:diagrams.plantumlError', { error: e })}</pre>`
  }
}
