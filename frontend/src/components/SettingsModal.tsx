import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, SupportedLanguage, getCurrentLanguage, setLanguage } from '../i18n'

interface Props {
  onClose: () => void
}

type SectionId = 'language'

// Modal de configurações — lista de seções à esquerda, conteúdo ao centro
// (estilo VS Code settings). Só "Idioma" por enquanto; a estrutura (array de
// seções) já comporta novas sem redesenho. Ver
// .specs/tasks/window-menu-and-settings-modal.md.
export default function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation('shell')
  const [activeSection, setActiveSection] = useState<SectionId>('language')
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage())

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sections: { id: SectionId; label: string }[] = [
    { id: 'language', label: t('settings.sections.language') },
  ]

  const handleSelectLanguage = (lang: SupportedLanguage) => {
    setLanguage(lang)
    setCurrentLang(lang)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog modal-dialog-wide" onClick={e => e.stopPropagation()}>
        <div className="settings-modal-header">
          <div className="modal-dialog-title">{t('settings.title')}</div>
          <button className="settings-modal-close" aria-label={t('common:close')} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <div className="settings-modal-body">
          <div className="settings-modal-nav">
            {sections.map(s => (
              <div
                key={s.id}
                className={`settings-modal-nav-item ${activeSection === s.id ? 'active' : ''}`}
                onClick={() => setActiveSection(s.id)}
              >
                {s.label}
              </div>
            ))}
          </div>
          <div className="settings-modal-content">
            {activeSection === 'language' && (
              <>
                <div className="settings-modal-section-title">{t('settings.sections.language')}</div>
                {SUPPORTED_LANGUAGES.map(lang => (
                  <div
                    key={lang}
                    className={`settings-modal-option ${currentLang === lang ? 'selected' : ''}`}
                    onClick={() => handleSelectLanguage(lang)}
                  >
                    <span className="settings-modal-option-radio" />
                    {t(`language.${lang}`)}
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
