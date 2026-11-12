import {
  buildCustomTheme, decodeCustomTheme, decodeThemeLink, isHexColor,
  type CustomTheme, type PaletteKey, type ThemePalette, type ThemeScheme, THEME_NAME_MAX,
} from './themes';

export type ThemeFileResult = { ok: true; theme: CustomTheme } | { ok: false; error: string };

const MAX_FILE_CHARS = 65536;

const KEY_MAP: Record<string, PaletteKey> = {
  windowBg: 'canvas', sideBarBg: 'rail', windowBgOver: 'hover',
  windowFg: 'text', windowSubTextFg: 'muted', sideBarFg: 'text',
  activeButtonBg: 'accent', activeButtonFg: 'onAccent',
  msgInBg: 'bubble', msgOutBg: 'outgoing',
  msgInFg: 'text', msgOutFg: 'text',
  msgInDateFg: 'messageMeta', msgOutDateFg: 'messageMeta',
  actionBarColor: 'surface', actionBarTitleColor: 'text', chat_wallpaper: 'canvas',
  chat_inBubble: 'bubble', chat_outBubble: 'outgoing',
  chat_messageTextIn: 'text', chat_messageTextOut: 'text',
  chat_inTimeText: 'messageMeta', chat_outTimeText: 'messageMeta',
  chat_serviceText: 'muted', chat_serviceLink: 'accent',
  chat_messageLinkIn: 'accent', chat_messageLinkOut: 'accent',
  switchTrackChecked: 'accent', checkbox: 'accent', profile_title: 'text',
  chat_inBubbleSelected: 'selected', chat_outBubbleSelected: 'outgoing',
};

function parseColor(value: string): string | null {
  const raw = value.trim().replace(/^["']|["']$/g, '').replace(/;+$/, '');
  if (/^#[0-9a-f]{6}$/i.test(raw) || /^#[0-9a-f]{8}$/i.test(raw)) return raw.toLowerCase();
  const argb = raw.match(/^0x([0-9a-f]{8})$/i);
  if (argb) return `#${argb[1].slice(2).toLowerCase()}`;
  const rgb = raw.match(/^0x([0-9a-f]{6})$/i);
  if (rgb) return `#${rgb[1].toLowerCase()}`;
  return null;
}

function channelLuminance(value: number): number {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
}

function schemeFor(hex: string): ThemeScheme {
  const value = hex.replace('#', '').slice(0, 6);
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b) > 0.35 ? 'light' : 'dark';
}

function cleanName(value: string, fallback: string): string {
  const name = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, THEME_NAME_MAX);
  return name || fallback;
}

export function parseThemeFile(text: string, fileName = ''): ThemeFileResult {
  const raw = typeof text === 'string' ? text.trim() : '';
  const fallbackName = cleanName(fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' '), 'Tema importado');
  if (!raw) return { ok: false, error: 'El archivo está vacío.' };
  if (raw.length > MAX_FILE_CHARS) return { ok: false, error: 'El archivo del tema es demasiado grande.' };
  if (raw.startsWith('{')) return decodeCustomTheme(raw);
  if (/^wrgram:\/\/theme\//i.test(raw)) return decodeThemeLink(raw);

  const fields = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('///') || trimmed.startsWith('#') || trimmed.startsWith(';') || trimmed.startsWith('[')) continue;
    const separator = trimmed.includes('=') ? '=' : trimmed.includes(':') ? ':' : '';
    if (!separator) continue;
    const index = trimmed.indexOf(separator);
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim();
    if (key && value) fields.set(key, value);
  }

  const paletteOverrides: Partial<ThemePalette> = {};
  for (const [key, mapped] of Object.entries(KEY_MAP)) {
    const value = fields.get(key);
    if (!value) continue;
    const color = parseColor(value);
    if (color && isHexColor(color)) paletteOverrides[mapped] = color;
  }

  const canvas = paletteOverrides.canvas ?? paletteOverrides.surface;
  const accent = paletteOverrides.accent;
  if (!canvas && !accent) return { ok: false, error: 'No encontramos colores de Telegram reconocibles en el archivo.' };
  if (!paletteOverrides.canvas && canvas) paletteOverrides.canvas = canvas;

  const scheme = schemeFor(canvas ?? accent ?? '#101113');
  const base = scheme === 'light' ? 'day' : 'gold';
  const seed = buildCustomTheme({ name: fallbackName, base, accent: accent ?? '', canvas: canvas ?? '', text: '', outgoing: '' });
  const palette = { ...seed.palette, ...paletteOverrides };
  const name = cleanName(fields.get('name') ?? '', fallbackName);
  return { ok: true, theme: { ...seed, name, scheme, palette } };
}
