import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import ptBRCommon from './locales/pt-BR/common.json'
import ptBRShell from './locales/pt-BR/shell.json'
import ptBREditor from './locales/pt-BR/editor.json'
import ptBRExplorer from './locales/pt-BR/explorer.json'
import ptBRGit from './locales/pt-BR/git.json'
import ptBRDatabase from './locales/pt-BR/database.json'
import ptBRTerminal from './locales/pt-BR/terminal.json'
import ptBRUsage from './locales/pt-BR/usage.json'
import ptBRCommandPalette from './locales/pt-BR/commandPalette.json'
import ptBRAiSessions from './locales/pt-BR/aiSessions.json'
import esCommon from './locales/es/common.json'
import esShell from './locales/es/shell.json'
import esEditor from './locales/es/editor.json'
import esExplorer from './locales/es/explorer.json'
import esGit from './locales/es/git.json'
import esDatabase from './locales/es/database.json'
import esTerminal from './locales/es/terminal.json'
import esUsage from './locales/es/usage.json'
import esCommandPalette from './locales/es/commandPalette.json'
import esAiSessions from './locales/es/aiSessions.json'
import enUSCommon from './locales/en-US/common.json'
import enUSShell from './locales/en-US/shell.json'
import enUSEditor from './locales/en-US/editor.json'
import enUSExplorer from './locales/en-US/explorer.json'
import enUSGit from './locales/en-US/git.json'
import enUSDatabase from './locales/en-US/database.json'
import enUSTerminal from './locales/en-US/terminal.json'
import enUSUsage from './locales/en-US/usage.json'
import enUSCommandPalette from './locales/en-US/commandPalette.json'
import enUSAiSessions from './locales/en-US/aiSessions.json'

export type SupportedLanguage = 'pt-BR' | 'es' | 'en-US'
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['pt-BR', 'es', 'en-US']

const STORAGE_KEY = 'bcode.language'

function isSupported(lang: string | null): lang is SupportedLanguage {
  return lang === 'pt-BR' || lang === 'es' || lang === 'en-US'
}

// Preferência salva sempre vence. Sem preferência salva (primeira abertura),
// detecta do navigator.language do WebView (reflete o locale do SO) e cai
// pra en-US sem match — decisão confirmada com o usuário, 2026-10-12.
function detectLanguage(): SupportedLanguage {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (isSupported(saved)) return saved

  const nav = (navigator.language || 'en-US').toLowerCase()
  if (nav.startsWith('pt')) return 'pt-BR'
  if (nav.startsWith('es')) return 'es'
  return 'en-US'
}

export function setLanguage(lang: SupportedLanguage) {
  localStorage.setItem(STORAGE_KEY, lang)
  i18n.changeLanguage(lang)
}

export function getCurrentLanguage(): SupportedLanguage {
  return isSupported(i18n.language) ? i18n.language : 'en-US'
}

i18n.use(initReactI18next).init({
  resources: {
    'pt-BR': { common: ptBRCommon, shell: ptBRShell, editor: ptBREditor, explorer: ptBRExplorer, git: ptBRGit, database: ptBRDatabase, terminal: ptBRTerminal, usage: ptBRUsage, commandPalette: ptBRCommandPalette, aiSessions: ptBRAiSessions },
    es: { common: esCommon, shell: esShell, editor: esEditor, explorer: esExplorer, git: esGit, database: esDatabase, terminal: esTerminal, usage: esUsage, commandPalette: esCommandPalette, aiSessions: esAiSessions },
    'en-US': { common: enUSCommon, shell: enUSShell, editor: enUSEditor, explorer: enUSExplorer, git: enUSGit, database: enUSDatabase, terminal: enUSTerminal, usage: enUSUsage, commandPalette: enUSCommandPalette, aiSessions: enUSAiSessions },
  },
  lng: detectLanguage(),
  fallbackLng: 'en-US',
  ns: ['common', 'shell', 'editor', 'explorer', 'git', 'database', 'terminal', 'usage', 'commandPalette', 'aiSessions'],
  defaultNS: 'common',
  interpolation: { escapeValue: false },
})

export default i18n
