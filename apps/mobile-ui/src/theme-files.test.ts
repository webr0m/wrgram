import { describe, expect, it } from 'vitest';
import { parseThemeFile } from './theme-files';

describe('importación de archivos de tema de Telegram', () => {
  it('lee un .attheme de Android con colores ARGB', () => {
    const text = [
      'name=Luna azul',
      'actionBarColor=0xff17212b',
      'chat_inBubble=0xff182533',
      'chat_outBubble=0xff2b5278',
      'chat_messageTextIn=0xffffffff',
      'chat_messageTextOut=0xffffffff',
      'chat_messageLinkIn=0xff5288c1',
      'chat_inTimeText=0xff7f91a4',
    ].join('\n');
    const result = parseThemeFile(text, 'luna.attheme');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.name).toBe('Luna azul');
    expect(result.theme.scheme).toBe('dark');
    expect(result.theme.palette.canvas).toBe('#17212b');
    expect(result.theme.palette.outgoing).toBe('#2b5278');
    expect(result.theme.palette.text).toBe('#ffffff');
    expect(result.theme.palette.accent).toBe('#5288c1');
  });

  it('lee un tema de escritorio con clave y valor separados por dos puntos', () => {
    const text = 'windowBg: #f4f4f4;\nwindowFg: #202020;\nmsgOutBg: #d7f0c4;\nmsgInBg: #ffffff;\nactiveButtonBg: #3390ec;\nactiveButtonFg: #ffffff;\n';
    const result = parseThemeFile(text, 'claro.tdesktop-theme');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.theme.scheme).toBe('light');
    expect(result.theme.palette.canvas).toBe('#f4f4f4');
    expect(result.theme.palette.outgoing).toBe('#d7f0c4');
    expect(result.theme.palette.accent).toBe('#3390ec');
  });

  it('usa el nombre del archivo y rechaza archivos sin colores reconocibles', () => {
    const result = parseThemeFile('windowBg=#101010', 'mi_tema.attheme');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.theme.name).toBe('mi tema');
    expect(parseThemeFile('solo texto', 'x.attheme')).toMatchObject({ ok: false });
    expect(parseThemeFile('x'.repeat(70000), 'x.attheme')).toMatchObject({ ok: false });
    expect(parseThemeFile('', 'x.attheme')).toMatchObject({ ok: false });
  });

  it('acepta códigos y enlaces de WRGram dentro de un archivo', () => {
    const code = JSON.stringify({ format: 'wrgram-theme', version: 1, name: 'Código', scheme: 'dark', palette: { canvas: '#101113', surface: '#191a1e', text: '#ecece9', accent: '#dfbd78', outgoing: '#353021' } });
    expect(parseThemeFile(`  ${code}  `)).toMatchObject({ ok: true });
    expect(parseThemeFile('wrgram://theme/no-es-un-tema')).toMatchObject({ ok: false });
  });
});
