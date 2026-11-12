import { LANGUAGES, setLanguage, useLanguage } from './language';
import { setTranslationMode, TRANSLATION_MODES, useTranslationMode } from './messageTranslation';

export function LanguageSettings() {
  const { selected, t } = useLanguage();
  return <label className="field-label">
    {t('Idioma de la aplicación')}
    <select value={selected} onChange={event => setLanguage(event.target.value)}>
      <option value="system">{t('Usar idioma del sistema')}</option>
      {LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
    </select>
  </label>;
}

export function TranslationSettings() {
  const { t } = useLanguage();
  const mode = useTranslationMode();
  return <label className="field-label">
    {t('Traducción de mensajes')}
    <select value={mode} onChange={event => setTranslationMode(event.target.value)}>
      {TRANSLATION_MODES.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
    </select>
  </label>;
}
