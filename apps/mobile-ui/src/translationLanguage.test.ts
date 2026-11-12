import { describe, expect, it } from 'vitest';
import { identifyLanguage } from './translationLanguage';
import { translationLanguageFamily } from './messageTranslation';

describe('local message language detection', () => {
  it.each([
    ['Hola, ¿cómo estás?', 'es'],
    ['This message was written in English for testing.', 'en'],
    ['Bonjour, comment allez-vous ?', 'fr'],
    ['Olá, como você está hoje?', 'pt'],
    ['Grazas pola túa axuda, vémonos mañá pola tarde.', 'gl'],
    ['Vi sees i morgen etter jobb, takk for hjelpen.', 'no'],
    ['明日午後に会議があります。', 'ja'],
    ['明天下午我们一起开会。', 'zh'],
  ])('identifies %s', async (message, code) => {
    expect(await identifyLanguage(message)).toBe(code);
  });

  it.each(['Hola', 'Hola amigo', '👍 https://t.me/webrom @webrom #WRGram', '1234'])(
    'leaves ambiguous or non-linguistic input undetermined (%s)',
    async message => { expect(await identifyLanguage(message)).toBeUndefined(); },
  );

  it('groups language aliases and region tags for comparison with the UI', () => {
    expect(translationLanguageFamily('nb')).toBe(translationLanguageFamily('no'));
    expect(translationLanguageFamily('zh-CN')).toBe(translationLanguageFamily('zh'));
    expect(translationLanguageFamily('pt-BR')).toBe(translationLanguageFamily('pt'));
  });
});
