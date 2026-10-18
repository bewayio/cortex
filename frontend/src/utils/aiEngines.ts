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

export function buildAiCommand(engine: AiEngine, sessionId?: string): string {
  if (!sessionId) return engine
  return engine === 'claude' ? `claude --resume ${sessionId}` : `codex resume ${sessionId}`
}
