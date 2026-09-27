import React, { useMemo } from 'react'
import { marked } from 'marked'

interface Props {
  content: string
}

export default function MarkdownPreview({ content }: Props) {
  const html = useMemo(() => {
    try {
      return marked.parse(content, { async: false }) as string
    } catch {
      return '<p>Failed to render markdown.</p>'
    }
  }, [content])

  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
