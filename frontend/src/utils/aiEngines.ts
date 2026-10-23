// Shared helpers for AI terminals (Claude Code / Codex), used by the AI
// sessions sidebar panel (new session + resume) and by Terminal.tsx's own
// relaunch restore. Keeps the "how do I start/resume this engine" string
// building in one place instead of duplicated per call site.
// See .specs/tasks/ai-terminal-session-persistence-and-new-session-buttons.md.

export type AiEngine = 'claude' | 'codex'

export const AI_ENGINE_LABEL: Record<AiEngine, string> = {
  claude: 'Claude',
  codex: 'Codex',
}

// Registry of every AI client this app knows about, regardless of whether
// it's actually installed on this machine. Single source of truth for the
// Settings "Clientes de IA" list, the AI Sessions new-session buttons, and
// the "Chats com IA" title-bar menu — all three now gate purely on the
// user's enabled/disabled config (aiClientSettings.ts), not on PATH
// detection (GetInstalledAiEngines), which proved unreliable for GUI-launched
// builds. Decision confirmed by the user 2026-10-21: the config replaces
// that check entirely for these three surfaces. See
// .specs/tasks/ai-client-enable-toggle.md.
export const ALL_AI_ENGINES: AiEngine[] = ['claude', 'codex']

export function buildAiCommand(engine: AiEngine, sessionId?: string): string {
  if (!sessionId) return engine
  return engine === 'claude' ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`
}
