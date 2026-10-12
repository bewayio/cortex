import React, { useMemo } from 'react'
import { marked } from 'marked'
import { useTranslation } from 'react-i18next'

interface Props {
  content: string
}

export default function MarkdownPreview({ content }: Props) {
  const { t } = useTranslation('editor')
  const html = useMemo(() => {
    try {
      return marked.parse(content, { async: false }) as string
    } catch {
      return `<p>${t('markdownPreview.renderFailed')}</p>`
    }
  }, [content, t])

  return (
    <div
      className="markdown-preview"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
