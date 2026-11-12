import { describe, expect, it } from 'vitest';
import { LANGUAGES, isLanguage, resolveSystemLanguage, translateLabel } from './catalog';
import english from './en.json';

describe('interface languages', () => {
  it('provides at least 20 unique languages with every label covered', () => {
    const codes = LANGUAGES.map(([code]) => code);
    expect(codes.length).toBeGreaterThanOrEqual(20);
    expect(new Set(codes).size).toBe(codes.length);

    const files = import.meta.glob<Record<string, string>>('./*.json', { eager: true, import: 'default' });
    expect(Object.keys(files).sort()).toEqual(codes.filter(code => code !== 'es').map(code => './' + code + '.json').sort());
    const labels = Object.keys(english).sort();
    for (const code of codes.filter(code => code !== 'es')) {
      const messages = files['./' + code + '.json'];
      expect(Object.keys(messages).sort(), code).toEqual(labels);
      expect(Object.values(messages).every(value => typeof value === 'string' && value.trim()), code).toBe(true);
      expect(translateLabel(code, 'Idioma'), code).toBe(messages.Idioma);
    }
  });

  it('keeps source text for Spanish and missing labels', () => {
    expect(translateLabel('es', 'Idioma')).toBe('Idioma');
    expect(translateLabel('ja', 'Idioma')).toBe('\u8a00\u8a9e');
    expect(translateLabel('ja', 'constructor')).toBe('constructor');
    expect(isLanguage('constructor')).toBe(false);
  });

  it('resolves regional variants and prioritizes supported system languages', () => {
    expect(resolveSystemLanguage(['ko-KR', 'fr-CA', 'en-US'])).toBe('fr');
    expect(resolveSystemLanguage(['pt-BR'])).toBe('pt');
    expect(resolveSystemLanguage(['no-NO'])).toBe('nb');
    expect(resolveSystemLanguage(['zh-Hans-SG'])).toBe('zh-CN');
    expect(resolveSystemLanguage(['zh-TW', 'ja-JP'])).toBe('ja');
    expect(resolveSystemLanguage(['zh-Hant', 'en-GB'])).toBe('en');
    expect(resolveSystemLanguage(['ko-KR'])).toBe('es');
    expect(resolveSystemLanguage([])).toBe('es');
  });
});
