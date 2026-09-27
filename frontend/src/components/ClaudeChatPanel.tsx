import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from 'react'
import { Settings, Trash2, Square, Send, X, Paperclip, KeyRound } from 'lucide-react'
import { marked } from 'marked'
import { useEditorStore } from '../stores/editorStore'
import { StartChatStream, StopChatStream, TestClaudeChat, TestImageStream, SaveChatMessages, LoadChatMessages, DeleteChatMessages } from '../../wailsjs/go/main/App'
import { renderMermaid, renderPlantUML } from '../utils/diagrams'
import { EventsOn, EventsOff } from '../../wailsjs/runtime/runtime'

// Threshold para compactação automática (~50K chars ≈ 12K tokens)
const COMPACT_THRESHOLD = 50_000

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  attachments?: ChatAttachment[]
  isCompactSummary?: boolean  // true quando é o resumo de compactação
}

export interface ChatAttachment {
  id: string
  name: string
  mimeType: string
  data: string           // base64
  previewUrl?: string    // blob URL para imagens
}

interface Props {
  tabId: string             // usado como chave de persistência
  workspaceId: string
  initialMessages?: ChatMessage[]
  onMessagesChange?: (msgs: ChatMessage[]) => void
}

// Mensagens persistidas no filesystem via Go — sem limite de tamanho
// Mantém localStorage apenas para preferências pequenas (modelo, API key, etc.)

function prepareForSave(msgs: ChatMessage[]) {
  return msgs.map(m => ({
    ...m,
    previewUrl: undefined,                                     // reconstruída do data
    attachments: m.attachments?.map(a => ({ ...a, previewUrl: undefined })),
    streaming: false,
  }))
}

async function loadMessages(workspaceId: string, tabId: string): Promise<ChatMessage[]> {
  try {
    const raw = await LoadChatMessages(workspaceId, tabId)
    return raw && raw !== '[]' ? JSON.parse(raw) : []
  } catch { return [] }
}

async function saveMessages(workspaceId: string, tabId: string, msgs: ChatMessage[]) {
  if (!workspaceId || !tabId) return
  try {
    await SaveChatMessages(workspaceId, tabId, JSON.stringify(prepareForSave(msgs)))
  } catch (e) { console.warn('Failed to save chat messages:', e) }
}

const MODELS = [
  { id: 'claude-sonnet-4-6',         label: 'Sonnet 4.6' },
  { id: 'claude-opus-4-7',           label: 'Opus 4.7' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5' },
]

function uid() { return Math.random().toString(36).slice(2) }

// Redimensiona imagem para max 1024px e converte para JPEG 0.82 — reduz de ~2MB para ~100KB
async function resizeImage(file: File): Promise<{ base64: string; mimeType: string }> {
  const MAX = 1024
  const QUALITY = 0.82

  const objectUrl = URL.createObjectURL(file)
  const img = new Image()
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = objectUrl })
  URL.revokeObjectURL(objectUrl)

  let { naturalWidth: w, naturalHeight: h } = img
  if (w > MAX || h > MAX) {
    const r = Math.min(MAX / w, MAX / h)
    w = Math.round(w * r); h = Math.round(h * r)
  }

  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)

  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY)
  return { base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' }
}

async function fileToAttachment(file: File): Promise<ChatAttachment> {
  if (file.type.startsWith('image/')) {
    const { base64, mimeType } = await resizeImage(file)
    return {
      id: uid(), name: file.name || 'image.jpg',
      mimeType, data: base64,
      previewUrl: `data:${mimeType};base64,${base64}`,
    }
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const base64 = result.includes(',') ? result.split(',')[1] : result
      resolve({ id: uid(), name: file.name, mimeType: file.type, data: base64 })
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// Renderer customizado que transforma blocos de código em placeholders para diagramas
function buildHtml(content: string): string {
  const renderer = new marked.Renderer()
  // marked v12: code(code, lang, escaped)
  ;(renderer as any).code = (code: string, lang: string | undefined) => {
    const l = (lang || '').toLowerCase()
    if (l === 'mermaid') {
      return `<div class="diagram-block" data-type="mermaid" data-code="${encodeURIComponent(code)}"></div>`
    }
    if (l === 'plantuml' || l === 'puml') {
      return `<div class="diagram-block" data-type="plantuml" data-code="${encodeURIComponent(code)}"></div>`
    }
    const escaped = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    return `<pre><code class="language-${l}">${escaped}</code></pre>`
  }
  try {
    return marked.parse(content, { async: false, renderer }) as string
  } catch { return content }
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  const containerRef = useRef<HTMLDivElement>(null)

  const html = useMemo(
    () => buildHtml(msg.content + (msg.streaming ? ' ▋' : '')),
    [msg.content, msg.streaming]
  )

  // Renderiza diagramas após o HTML ser inserido no DOM
  useLayoutEffect(() => {
    if (!containerRef.current || msg.streaming) return
    const blocks = containerRef.current.querySelectorAll<HTMLElement>('.diagram-block')
    blocks.forEach(el => {
      const type = el.dataset.type
      const code = decodeURIComponent(el.dataset.code ?? '')
      if (!code || el.dataset.rendered) return
      el.dataset.rendered = '1'
      if (type === 'mermaid')  renderMermaid(el, code)
      if (type === 'plantuml') renderPlantUML(el, code)
    })
  }, [html, msg.streaming])

  if (msg.isCompactSummary) {
    return (
      <div className="cc-compact-banner">
        <span className="cc-compact-icon">⚡</span>
        <div>
          <div className="cc-compact-label">Context compacted</div>
          <div className="cc-compact-body" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    )
  }

  return (
    <div className={msg.role === 'user' ? 'cc-msg-user-wrap' : ''}>
      {msg.role === 'user' && msg.attachments && msg.attachments.length > 0 && (
        <div className="cc-msg-attachments">
          {msg.attachments.map(att => {
            // Usa previewUrl (blob) se disponível, senão constrói data URL a partir do base64 salvo
            const imgSrc = att.previewUrl
              ?? (att.mimeType?.startsWith('image/') && att.data
                  ? `data:${att.mimeType};base64,${att.data}`
                  : null)
            return imgSrc
              ? <img key={att.id} src={imgSrc} className="cc-msg-img-thumb" alt={att.name} />
              : <span key={att.id} className="cc-msg-file-pill">📄 {att.name}</span>
          })}
        </div>
      )}
      {msg.role === 'user' ? (
        msg.content && <div className="cc-msg-user"><div className="cc-msg-user-text">{msg.content}</div></div>
      ) : (
        <div
          ref={containerRef}
          className={`cc-msg-assistant ${msg.streaming ? 'streaming' : ''}`}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  )
}

export default function ClaudeChatPanel({ tabId, workspaceId, initialMessages, onMessagesChange }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages ?? [])

  // Carrega do filesystem ao montar
  useEffect(() => {
    if (!workspaceId || !tabId) return
    loadMessages(workspaceId, tabId).then(saved => {
      if (saved.length > 0) setMessages(saved)
    })
  }, [workspaceId, tabId]) // eslint-disable-line
  const [input,        setInput]        = useState('')
  const [attachments,  setAttachments]  = useState<ChatAttachment[]>([])
  const [dragging,     setDragging]     = useState(false)
  const [apiKey,       setApiKey]       = useState(() => localStorage.getItem('bcode.claudeApiKey') ?? '')
  const [model,        setModel]        = useState(() => localStorage.getItem('bcode.claudeModel') ?? 'claude-sonnet-4-6')
  const [showSettings, setShowSettings] = useState(false)
  const [settingsKey,  setSettingsKey]  = useState(() => localStorage.getItem('bcode.claudeApiKey') ?? '')
  const [isStreaming,  setIsStreaming]  = useState(false)
  const [error,        setError]        = useState<string | null>(null)

  const sessionRef  = useRef<string | null>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  const { tabs, activeTabId } = useEditorStore()
  const activeFile = tabs.find(t => t.id === activeTabId && !t.isCommitTab && !t.isGraphTab)

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  useEffect(() => {
    if (!isStreaming) {
      onMessagesChange?.(messages)
      saveMessages(workspaceId, tabId, messages)  // async, sem await — fire-and-forget
    }
  }, [messages, isStreaming]) // eslint-disable-line

  // ── Processar ficheiros ────────────────────────────────────────────────────
  const processFiles = useCallback(async (files: File[]) => {
    const supported = files.filter(f =>
      f.type.startsWith('image/') ||
      f.type.startsWith('text/') ||
      /\.(md|json|ts|tsx|js|jsx|go|py|rs|swift|java|kt|cs|cpp|c|h|sh|yaml|yml|toml|ini|sql)$/i.test(f.name)
    )
    const atts = await Promise.all(supported.map(fileToAttachment))
    setAttachments(prev => [...prev, ...atts])
  }, [])

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current++; setDragging(true)
  }
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current--; if (dragCounter.current === 0) setDragging(false)
  }
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault() }
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) await processFiles(files)
  }

  // ── Paste (screenshot / clipboard) ────────────────────────────────────────
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(item => item.type.startsWith('image/'))
    if (imageItem) {
      const file = imageItem.getAsFile()
      if (file) { e.preventDefault(); await processFiles([file]) }
    }
  }, [processFiles])

  const removeAttachment = (id: string) => {
    setAttachments(prev => {
      const att = prev.find(a => a.id === id)
      if (att?.previewUrl) URL.revokeObjectURL(att.previewUrl)
      return prev.filter(a => a.id !== id)
    })
  }

  // ── Settings ───────────────────────────────────────────────────────────────
  const saveSettings = () => {
    const k = settingsKey.trim()
    localStorage.setItem('bcode.claudeApiKey', k)
    setApiKey(k); setShowSettings(false)
    textareaRef.current?.focus()
  }

  const systemPrompt = activeFile
    ? `You are a helpful coding assistant in BCode.\n\nFile open:\n${activeFile.name}\n\`\`\`${activeFile.ext}\n${activeFile.content.slice(0, 8000)}\n\`\`\``
    : 'You are a helpful coding assistant embedded in BCode.'

  // ── Compactação automática do contexto ────────────────────────────────────
  const compactContext = useCallback(async (currentMessages: ChatMessage[]): Promise<ChatMessage[]> => {
    const totalChars = currentMessages.reduce((acc, m) => acc + m.content.length, 0)
    if (totalChars < COMPACT_THRESHOLD) return currentMessages

    // Monta prompt pedindo resumo
    const historyText = currentMessages
      .map(m => `${m.role === 'user' ? 'Human' : 'Assistant'}: ${m.content}`)
      .join('\n\n')

    const compactPrompt = `Please provide a comprehensive summary of this conversation that preserves all important context, decisions, code snippets, and information discussed. The summary will replace the full conversation history to manage context limits.\n\nConversation to summarize:\n\n${historyText}`

    return new Promise(resolve => {
      const sessionID = uid()
      let summary = ''

      EventsOn(`chat:token:${sessionID}`, (t: string) => { summary += t })
      EventsOn(`chat:done:${sessionID}`, () => {
        EventsOff(`chat:token:${sessionID}`)
        EventsOff(`chat:done:${sessionID}`)
        EventsOff(`chat:error:${sessionID}`)
        const summaryMsg: ChatMessage = {
          id: uid(),
          role: 'assistant',
          content: `**[Context compacted — conversation summary]**\n\n${summary}`,
          isCompactSummary: true,
        }
        resolve([summaryMsg])
      })
      EventsOn(`chat:error:${sessionID}`, () => {
        EventsOff(`chat:token:${sessionID}`)
        EventsOff(`chat:done:${sessionID}`)
        EventsOff(`chat:error:${sessionID}`)
        resolve(currentMessages) // fallback: mantém original
      })

      StartChatStream(
        sessionID, apiKey,
        [{ role: 'user', content: compactPrompt }],
        [], '', model,
      ).catch(() => resolve(currentMessages))
    })
  }, [apiKey, model])

  // ── Enviar mensagem ────────────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if ((!input.trim() && !attachments.length) || isStreaming) return

    setError(null)

    // Compacta o contexto se estiver muito longo (antes de adicionar nova mensagem)
    const baseMessages = await compactContext(messages)
    if (baseMessages !== messages) {
      setMessages(baseMessages) // atualiza UI com o resumo
    }

    const sessionID = uid()
    sessionRef.current = sessionID

    const userMsg: ChatMessage = {
      id: uid(), role: 'user', content: input,
      attachments: attachments.length ? [...attachments] : undefined,
    }
    const assistantMsg: ChatMessage = { id: uid(), role: 'assistant', content: '', streaming: true }
    const assistantId = assistantMsg.id

    const history = [...baseMessages, userMsg]
    setMessages([...history, assistantMsg])
    setInput('')
    setAttachments([])
    setIsStreaming(true)

    const cleanup = (sid: string) => {
      EventsOff(`chat:token:${sid}`)
      EventsOff(`chat:done:${sid}`)
      EventsOff(`chat:error:${sid}`)
    }

    EventsOn(`chat:token:${sessionID}`, (token: string) => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: m.content + token } : m
      ))
    })
    EventsOn(`chat:done:${sessionID}`, () => {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, streaming: false } : m
      ))
      setIsStreaming(false); cleanup(sessionID)
    })
    EventsOn(`chat:error:${sessionID}`, (errMsg: string) => {
      setError(errMsg)
      setMessages(prev => prev.filter(m => m.id !== assistantId))
      setIsStreaming(false); cleanup(sessionID)
    })

    // Passa apenas texto no campo content — anexos separados
    const apiMessages = history.map(m => ({ role: m.role, content: m.content }))
    // Anexos da mensagem atual (última)
    const apiAttachments = userMsg.attachments?.map(a => ({
      id: a.id, name: a.name, mimeType: a.mimeType, data: a.data,
    })) ?? []

    try {
      await StartChatStream(
        sessionID, apiKey, apiMessages, apiAttachments, systemPrompt, model,
      )
    } catch (err) {
      setError(String(err))
      setMessages(prev => prev.filter(m => m.id !== assistantId))
      setIsStreaming(false); cleanup(sessionID)
    }
  }, [input, attachments, apiKey, model, isStreaming, messages, systemPrompt])

  const stopStream = () => {
    if (sessionRef.current) { StopChatStream(sessionRef.current).catch(console.error); sessionRef.current = null }
    setMessages(prev => prev.map(m => m.streaming ? { ...m, streaming: false } : m))
    setIsStreaming(false)
  }

  const clearChat = () => {
    stopStream(); setMessages([]); setError(null)
    DeleteChatMessages(workspaceId, tabId).catch(() => {})
  }

  const runDiagnostic = async () => {
    setError(null)
    const result = await TestClaudeChat().catch(e => `Exception: ${e}`)
    setError(`Diagnostic: ${result}`)
  }

  const runImageDiagnostic = async () => {
    // Usa a última imagem do último attachment como teste
    const lastImg = [...attachments].reverse().find((a: ChatAttachment) => a.mimeType.startsWith('image/'))
    if (!lastImg) { setError('Diagnostic: no image attached — attach an image first'); return }
    setError('Running image stream test...')
    const result = await TestImageStream(lastImg.data, lastImg.mimeType, 'What do you see in this image? One sentence.').catch(e => `Exception: ${e}`)
    setError(`Image stream test:\n${result}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const canSend = (input.trim().length > 0 || attachments.length > 0) && !isStreaming

  return (
    <div
      className={`cc-root ${dragging ? 'cc-dragging' : ''}`}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Overlay de drag */}
      {dragging && (
        <div className="cc-drop-overlay">
          <div className="cc-drop-hint">Drop files here</div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,text/*,.md,.json,.ts,.tsx,.js,.jsx,.go,.py,.rs,.swift,.java,.kt,.cs,.cpp,.c,.h,.sh,.yaml,.yml,.toml,.sql"
        style={{ display: 'none' }}
        onChange={e => processFiles(Array.from(e.target.files ?? []))}
        onClick={e => { (e.target as HTMLInputElement).value = '' }}
      />

      {/* Mensagens */}
      <div className="cc-messages" ref={messagesRef}>
        {messages.length === 0 && (
          <div className="cc-empty">
            <div className="cc-empty-icon">✦</div>
            <div>Ask Claude about your code</div>
            <div className="cc-empty-hint">
              {apiKey ? 'Using your API key' : 'Using Claude Code authentication'}
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              <button className="cc-settings-cancel" style={{ fontSize: 10 }} onClick={runDiagnostic}>
                Run diagnostic
              </button>
              <button className="cc-settings-cancel" style={{ fontSize: 10 }} onClick={runImageDiagnostic}>
                Test image stream
              </button>
            </div>
          </div>
        )}
        {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
        {error && <div className="cc-error"><X size={12} /> {error}</div>}
      </div>

      {/* Settings */}
      {showSettings && (
        <div className="cc-settings">
          <div className="cc-settings-row">
            <KeyRound size={13} style={{ color: 'var(--fg-dim)', flexShrink: 0 }} />
            <input
              className="cc-settings-input" type="password"
              placeholder="sk-ant-… (leave empty to use Claude Code auth)"
              value={settingsKey}
              onChange={e => setSettingsKey(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveSettings(); if (e.key === 'Escape') setShowSettings(false) }}
              autoFocus
            />
          </div>
          <div className="cc-settings-actions">
            <button className="cc-settings-save" onClick={saveSettings}>Save</button>
            <button className="cc-settings-cancel" onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </div>
      )}

      {/* Context badge */}
      {activeFile && (
        <div className="cc-context-badge">
          <span>📄</span><span>{activeFile.name}</span>
          <span className="cc-context-lines">{activeFile.content.split('\n').length} lines</span>
        </div>
      )}

      {/* Pré-visualização dos anexos */}
      {attachments.length > 0 && (
        <div className="cc-attachment-bar">
          {attachments.map(att => (
            <div key={att.id} className="cc-att-pill">
              {att.previewUrl
                ? <img src={att.previewUrl} className="cc-att-thumb" alt={att.name} />
                : <span className="cc-att-icon">📄</span>
              }
              <span className="cc-att-name">{att.name}</span>
              <button className="cc-att-remove" onClick={() => removeAttachment(att.id)}>
                <X size={10} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="cc-input-area">
        <div className="cc-input-row">
          <button
            className="cc-attach-btn"
            onClick={() => fileInputRef.current?.click()}
            title="Attach file (or drag & drop / paste)"
          >
            <Paperclip size={14} />
          </button>
          <textarea
            ref={textareaRef}
            className="cc-textarea"
            placeholder="Ask about your code… (drag, paste or attach files)"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="cc-stop-btn" onClick={stopStream} title="Stop"><Square size={14} /></button>
          ) : (
            <button className="cc-send-btn" onClick={sendMessage} disabled={!canSend} title="Send (Enter)">
              <Send size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="cc-footer">
        <select className="cc-model-select" value={model}
          onChange={e => { setModel(e.target.value); localStorage.setItem('bcode.claudeModel', e.target.value) }}>
          {MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <button className="cgt-icon-btn" title="API Key" onClick={() => setShowSettings(v => !v)}>
          <Settings size={13} />
        </button>
        <button className="cgt-icon-btn" title="Clear chat" onClick={clearChat}>
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}
