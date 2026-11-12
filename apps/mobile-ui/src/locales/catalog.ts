import en from './en.json';
import pt from './pt.json';
import fr from './fr.json';
import de from './de.json';
import it from './it.json';
import ca from './ca.json';
import gl from './gl.json';
import nl from './nl.json';
import ro from './ro.json';
import pl from './pl.json';
import sv from './sv.json';
import da from './da.json';
import nb from './nb.json';
import fi from './fi.json';
import cs from './cs.json';
import tr from './tr.json';
import id from './id.json';
import ja from './ja.json';
import zhCN from './zh-CN.json';

type Catalog = Readonly<Record<string, string>>;
type Locale = { name: string; messages: Catalog };

const locales = {
  es: { name: 'Español', messages: {} },
  en: { name: 'English', messages: en },
  pt: { name: 'Português', messages: pt },
  fr: { name: 'Français', messages: fr },
  de: { name: 'Deutsch', messages: de },
  it: { name: 'Italiano', messages: it },
  ca: { name: 'Català', messages: ca },
  gl: { name: 'Galego', messages: gl },
  nl: { name: 'Nederlands', messages: nl },
  ro: { name: 'Română', messages: ro },
  pl: { name: 'Polski', messages: pl },
  sv: { name: 'Svenska', messages: sv },
  da: { name: 'Dansk', messages: da },
  nb: { name: 'Norsk bokmål', messages: nb },
  fi: { name: 'Suomi', messages: fi },
  cs: { name: 'Čeština', messages: cs },
  tr: { name: 'Türkçe', messages: tr },
  id: { name: 'Bahasa Indonesia', messages: id },
  ja: { name: '日本語', messages: ja },
  'zh-CN': { name: '简体中文', messages: zhCN },
} satisfies Record<string, Locale>;

export type Language = keyof typeof locales;

export const LANGUAGES = Object.entries(locales).map(
  ([id, { name }]) => [id as Language, name] as const,
);

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && Object.hasOwn(locales, value);
}

export function resolveSystemLanguage(preferredLocales: readonly string[]): Language {
  for (const locale of preferredLocales) {
    const [language, ...subtags] = locale.toLowerCase().split('-');
    if (language === 'zh') {
      if (subtags.includes('hant')) continue;
      if (subtags.includes('hans') || !subtags.some(part => ['tw', 'hk', 'mo'].includes(part))) return 'zh-CN';
    }
    if (language === 'no') return 'nb';
    if (isLanguage(language)) return language;
  }
  return 'es';
}

export function translateLabel(language: Language, text: string): string {
  const messages: Catalog = locales[language].messages;
  return Object.hasOwn(messages, text) ? messages[text] : text;
}
