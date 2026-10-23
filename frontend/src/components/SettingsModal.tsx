import React, { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SUPPORTED_LANGUAGES, SupportedLanguage, getCurrentLanguage, setLanguage } from '../i18n'
import { DefaultDockPreset, getDefaultDockPreset, setDefaultDockPreset } from '../utils/defaultDock'
import { AI_ENGINE_LABEL, ALL_AI_ENGINES, type AiEngine } from '../utils/aiEngines'
import { isAiEngineEnabled, setAiEngineEnabled } from '../utils/aiClientSettings'

interface Props {
  onClose: () => void
}

type SectionId = 'language' | 'dockLayout' | 'aiClients'

const DOCK_PRESETS: DefaultDockPreset[] = ['terminal-bottom-chat-right', 'terminal-right-chat-bottom']

// Modal de configurações — lista de seções à esquerda, conteúdo ao centro
// (estilo VS Code settings). Só "Idioma" por enquanto; a estrutura (array de
// seções) já comporta novas sem redesenho. Ver
// .specs/tasks/window-menu-and-settings-modal.md.
export default function SettingsModal({ onClose }: Props) {
  const { t } = useTranslation('shell')
  const [activeSection, setActiveSection] = useState<SectionId>('language')
  const [currentLang, setCurrentLang] = useState<SupportedLanguage>(getCurrentLanguage())
  const [currentDockPreset, setCurrentDockPreset] = useState<DefaultDockPreset>(getDefaultDockPreset())
  const [enabledEngines, setEnabledEngines] = useState<Record<AiEngine, boolean>>(() => {
    const entries = ALL_AI_ENGINES.map(e => [e, isAiEngineEnabled(e)] as const)
    return Object.fromEntries(entries) as Record<AiEngine, boolean>
  })

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const sections: { id: SectionId; label: string }[] = [
    { id: 'language', label: t('settings.sections.language') },
    { id: 'dockLayout', label: t('settings.sections.dockLayout') },
    { id: 'aiClients', label: t('settings.sections.aiClients') },
  ]

  const handleSelectLanguage = (lang: SupportedLanguage) => {
    setLanguage(lang)
    setCurrentLang(lang)
  }

  const handleSelectDockPreset = (preset: DefaultDockPreset) => {
    setDefaultDockPreset(preset)
    setCurrentDockPreset(preset)
  }

  const handleToggleEngine = (engine: AiEngine) => {
    const next = !enabledEngines[engine]
    setAiEngineEnabled(engine, next)
    setEnabledEngines(prev => ({ ...prev, [engine]: next }))
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
            {activeSection === 'dockLayout' && (
              <>
                <div className="settings-modal-section-title">{t('settings.sections.dockLayout')}</div>
                {DOCK_PRESETS.map(preset => (
                  <div
                    key={preset}
                    className={`settings-modal-option ${currentDockPreset === preset ? 'selected' : ''}`}
                    onClick={() => handleSelectDockPreset(preset)}
                  >
                    <span className="settings-modal-option-radio" />
                    {t(`settings.dockLayout.${preset === 'terminal-bottom-chat-right' ? 'terminalBottomChatRight' : 'terminalRightChatBottom'}`)}
                  </div>
                ))}
              </>
            )}
            {activeSection === 'aiClients' && (
              <>
                <div className="settings-modal-section-title">{t('settings.sections.aiClients')}</div>
                <div className="settings-modal-section-description">{t('settings.aiClients.description')}</div>
                {ALL_AI_ENGINES.map(engine => (
                  <div
                    key={engine}
                    className={`settings-modal-option ${enabledEngines[engine] ? 'selected' : ''}`}
                    onClick={() => handleToggleEngine(engine)}
                  >
                    <span className="settings-modal-option-checkbox" />
                    {AI_ENGINE_LABEL[engine]}
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
