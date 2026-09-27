import React, { useCallback } from 'react'
import Editor, { BeforeMount, OnMount } from '@monaco-editor/react'
import { useEditorStore } from '../stores/editorStore'

const EXT_LANG_MAP: Record<string, string> = {
  swift: 'swift', js: 'javascript', jsx: 'javascript',
  ts: 'typescript', tsx: 'typescript', py: 'python', go: 'go',
  java: 'java', kt: 'kotlin', cs: 'csharp', cpp: 'cpp', c: 'c',
  rs: 'rust', php: 'php', lua: 'lua', r: 'r', dart: 'dart',
  ex: 'elixir', sh: 'shell', zsh: 'shell', ps1: 'powershell',
  html: 'html', css: 'css', scss: 'scss', less: 'less',
  json: 'json', xml: 'xml', yaml: 'yaml', yml: 'yaml',
  toml: 'ini', ini: 'ini', md: 'markdown', sql: 'sql',
  graphql: 'graphql', tf: 'hcl', tex: 'latex',
  vue: 'html', svelte: 'html', groovy: 'groovy', gradle: 'groovy',
}

const FILENAME_LANG_MAP: Record<string, string> = {
  dockerfile: 'dockerfile', makefile: 'makefile', gemfile: 'ruby',
  rakefile: 'ruby', podfile: 'ruby', brewfile: 'ruby',
  vagrantfile: 'ruby', fastfile: 'ruby', 'go.mod': 'go',
  '.env': 'ini', '.gitignore': 'ini', '.editorconfig': 'ini',
  '.babelrc': 'json', '.eslintrc': 'json', '.prettierrc': 'json',
  jenkinsfile: 'groovy',
}

function detectLanguage(path: string, ext: string): string {
  const name = path.split('/').pop()?.toLowerCase() || ''
  if (FILENAME_LANG_MAP[name]) return FILENAME_LANG_MAP[name]
  return EXT_LANG_MAP[ext.toLowerCase()] || 'plaintext'
}

const handleBeforeMount: BeforeMount = (monaco) => {
  // Define bcode-dark theme
  monaco.editor.defineTheme('bcode-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6A9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'string', foreground: 'CE9178' },
      { token: 'number', foreground: 'B5CEA8' },
      { token: 'regexp', foreground: 'D16969' },
      { token: 'type', foreground: '4EC9B0' },
      { token: 'class', foreground: '4EC9B0' },
      { token: 'function', foreground: 'DCDCAA' },
      { token: 'variable', foreground: '9CDCFE' },
      { token: 'variable.predefined', foreground: '4FC1FF' },
      { token: 'constant', foreground: '4FC1FF' },
      { token: 'entity', foreground: 'DCDCAA' },
      // Markdown
      { token: 'markup.heading', foreground: '569CD6', fontStyle: 'bold' },
      { token: 'markup.bold', foreground: 'DCDCAA', fontStyle: 'bold' },
      { token: 'markup.italic', foreground: '9CDCFE', fontStyle: 'italic' },
      { token: 'markup.underline.link', foreground: '4EC9B0' },
      // YAML
      { token: 'type.yaml', foreground: '569CD6' },
      { token: 'string.yaml', foreground: 'CE9178' },
      // JSON
      { token: 'string.key.json', foreground: '9CDCFE' },
      { token: 'string.value.json', foreground: 'CE9178' },
      // SQL
      { token: 'keyword.sql', foreground: '569CD6', fontStyle: 'bold' },
      // Shell
      { token: 'keyword.shell', foreground: '569CD6' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editorCursor.foreground': '#aeafad',
      'editor.lineHighlightBackground': '#2a2a2a',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editorWhitespace.foreground': '#3b3b3b',
      'editorBracketMatch.background': '#0d3a58',
      'editorBracketMatch.border': '#888',
      'tab.activeBackground': '#1e1e1e',
      'tab.inactiveBackground': '#2d2d2d',
      'editorWidget.background': '#252526',
      'input.background': '#3c3c3c',
      'input.border': '#3c3c3c',
      'focusBorder': '#007ACC',
    },
  })
}

interface Props {
  path: string
  content: string
  ext: string
  onChange: (value: string) => void
  onMonacoReady?: (monaco: Parameters<BeforeMount>[0]) => void
  onEditorMount?: OnMount
}

export default function MonacoEditor({ path, content, ext, onChange, onMonacoReady, onEditorMount }: Props) {
  const { fontSize } = useEditorStore()
  const language = detectLanguage(path, ext)

  const handleChange = useCallback((value: string | undefined) => {
    onChange(value ?? '')
  }, [onChange])

  const handleBeforeMountCombined: BeforeMount = useCallback((monaco) => {
    handleBeforeMount(monaco)
    onMonacoReady?.(monaco)
  }, [onMonacoReady])

  return (
    <Editor
      height="100%"
      theme="bcode-dark"
      language={language}
      value={content}
      beforeMount={handleBeforeMountCombined}
      onMount={onEditorMount}
      onChange={handleChange}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Menlo, monospace",
        fontSize,
        fontLigatures: true,
        lineHeight: 20,
        folding: true,
        padding: { top: 8, bottom: 8 },
        renderWhitespace: 'none',
        wordWrap: 'off',
        tabSize: 2,
        insertSpaces: true,
        automaticLayout: true,
        smoothScrolling: true,
        cursorBlinking: 'blink',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'line',
        bracketPairColorization: { enabled: true },
        guides: { indentation: true },
        suggest: { snippetsPreventQuickSuggestions: false },
        overviewRulerLanes: 0,
      }}
    />
  )
}
