export type ThemeScheme = 'light' | 'dark';
export type ThemeGroup = 'wrgram' | 'telegram' | 'clients';
export type ThemeFontFamily = 'system' | 'serif' | 'mono' | 'rounded';
export type ThemeWallpaper = 'none' | 'dots' | 'grid' | 'aurora';

export interface ThemeStyle {
  fontFamily: ThemeFontFamily;
  fontSize: number;
  wallpaper: ThemeWallpaper;
  radius: number;
  blur: number;
}

export const THEME_FONTS: { id: ThemeFontFamily; label: string }[] = [
  { id: 'system', label: 'Sistema' },
  { id: 'serif', label: 'Serif' },
  { id: 'mono', label: 'Mono' },
  { id: 'rounded', label: 'Redonda' },
];

export const THEME_WALLPAPERS: { id: ThemeWallpaper; label: string }[] = [
  { id: 'none', label: 'Liso' },
  { id: 'dots', label: 'Puntos' },
  { id: 'grid', label: 'Cuadrícula' },
  { id: 'aurora', label: 'Aurora' },
];

export const DEFAULT_THEME_STYLE: ThemeStyle = { fontFamily: 'system', fontSize: 16, wallpaper: 'none', radius: 11, blur: 0 };

export const PALETTE_KEYS = [
  'canvas', 'rail', 'surface', 'elevated', 'chat', 'text', 'muted', 'faint',
  'accent', 'onAccent', 'line', 'goldLine', 'soft', 'hover', 'input', 'selected',
  'outgoing', 'outgoingMeta', 'bubble', 'bubbleLine', 'messageMeta', 'date',
  'premium', 'pattern', 'wallDot', 'wallAuroraA', 'wallAuroraB', 'danger',
] as const;

export type PaletteKey = typeof PALETTE_KEYS[number];
export type ThemePalette = Record<PaletteKey, string>;

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  group: ThemeGroup;
  scheme: ThemeScheme;
  source?: string;
  overrides: Partial<ThemePalette>;
}

export interface CustomTheme {
  id: string;
  name: string;
  scheme: ThemeScheme;
  palette: ThemePalette;
  base?: string;
  author?: string;
  style?: ThemeStyle;
}

export interface ResolvedTheme {
  id: string;
  name: string;
  scheme: ThemeScheme;
  palette: ThemePalette;
  custom: boolean;
  source?: string;
  style?: ThemeStyle;
}

export interface CustomThemeDraft {
  id?: string;
  name: string;
  base: string;
  accent: string;
  canvas: string;
  text: string;
  outgoing: string;
  style?: ThemeStyle;
}

export const DARK_BASE: ThemePalette = {
  canvas: '#101113', rail: '#121316', surface: '#191a1e', elevated: '#202126', chat: '#111315',
  text: '#ecece9', muted: '#9d9eaa', faint: '#757784', accent: '#dfbd78', onAccent: '#241d10',
  line: '#ffffff0e', goldLine: '#dfbd781e', soft: '#dfbd7810', hover: '#ffffff07', input: '#141518',
  selected: '#dfbd7810', outgoing: '#353021', outgoingMeta: '#bca773', bubble: '#22242a',
  bubbleLine: '#ffffff05', messageMeta: '#92939f', date: '#ffffff07', premium: '#1b1a17',
  pattern: '#a5a7ae', wallDot: '#a5a7ae3d', wallAuroraA: '#dfbd7847', wallAuroraB: '#dfbd782b',
  danger: '#e58b8b',
};

export const LIGHT_BASE: ThemePalette = {
  canvas: '#f6f7f9', rail: '#fcfcfd', surface: '#ffffff', elevated: '#ffffff', chat: '#edf0f3',
  text: '#242831', muted: '#606977', faint: '#727c89', accent: '#426fae', onAccent: '#ffffff',
  line: '#18243312', goldLine: '#426fae25', soft: '#426fae0c', hover: '#16243306', input: '#f5f6f8',
  selected: '#426fae0d', outgoing: '#dfebfa', outgoingMeta: '#5e7b9f', bubble: '#ffffff',
  bubbleLine: '#192e4210', messageMeta: '#778493', date: '#ffffff98', premium: '#eef2f9',
  pattern: '#7c8996', wallDot: '#7c899633', wallAuroraA: '#426fae38', wallAuroraB: '#426fae24',
  danger: '#ab4141',
};

function preset(id: string, name: string, description: string, group: ThemeGroup, scheme: ThemeScheme, overrides: Partial<ThemePalette>, source?: string): ThemePreset {
  return { id, name, description, group, scheme, overrides, ...(source ? { source } : {}) };
}

export const THEME_PRESETS: ThemePreset[] = [
  preset('gold', 'WR Gold', 'Negro y dorado, la identidad de WRGram', 'wrgram', 'dark', {}),
  preset('violet', 'Violeta', 'El estilo original de WRGram', 'wrgram', 'light', {
    accent: '#7761ba', soft: '#7761ba0f', goldLine: '#7761ba25', selected: '#7761ba0e',
    outgoing: '#ede6f8', outgoingMeta: '#8c76ab', premium: '#f0edf8',
    wallAuroraA: '#7761ba40', wallAuroraB: '#7761ba29',
  }),
  preset('day', 'Día', 'Claro, limpio y de alto contraste', 'wrgram', 'light', {}),
  preset('night', 'Noche', 'Azul profundo y brillo reducido', 'wrgram', 'dark', {
    canvas: '#111522', rail: '#141927', surface: '#1c2232', elevated: '#252b3e', chat: '#141927',
    accent: '#b8a5f0', soft: '#b8a5f014', goldLine: '#b8a5f020', outgoing: '#353046',
    bubble: '#232c3d', input: '#151c2b', onAccent: '#211a33', premium: '#1e1c2b',
    selected: '#b8a5f013', wallDot: '#b8a5f040', wallAuroraA: '#b8a5f052', wallAuroraB: '#b8a5f033',
  }),
  preset('ocean', 'Océano', 'Azules frescos y tonos marinos', 'wrgram', 'light', {
    accent: '#27768e', soft: '#27768e0c', goldLine: '#27768e25', selected: '#27768e0e',
    outgoing: '#dbedf2', outgoingMeta: '#477c8d', premium: '#e9f3f6',
    wallAuroraA: '#27768e40', wallAuroraB: '#27768e29',
  }),
  preset('forest', 'Bosque', 'Verdes suaves y naturales', 'wrgram', 'light', {
    accent: '#3e7756', soft: '#3e77560c', goldLine: '#3e775625', selected: '#3e77560e',
    outgoing: '#e1eddf', outgoingMeta: '#5d7d5e', premium: '#eef4ec',
    wallAuroraA: '#3e775640', wallAuroraB: '#3e775629',
  }),
  preset('sunset', 'Terracota', 'Cálido, con acentos de arcilla', 'wrgram', 'light', {
    accent: '#aa6047', soft: '#aa60470c', goldLine: '#aa604725', selected: '#aa60470e',
    outgoing: '#f3e5db', outgoingMeta: '#967259', premium: '#f9f0e9',
    wallAuroraA: '#aa604740', wallAuroraB: '#aa604729',
  }),
  preset('graphite', 'Grafito', 'Grises oscuros y acento ámbar', 'wrgram', 'dark', {
    accent: '#c4c5cc', soft: '#c4c5cc10', goldLine: '#c4c5cc22', outgoing: '#34353b',
    outgoingMeta: '#b6b7c2', selected: '#c4c5cc10', premium: '#1e1f24', onAccent: '#1b1c22',
    wallDot: '#c4c5cc3d', wallAuroraA: '#c4c5cc42', wallAuroraB: '#c4c5cc26',
  }),

  preset('telegram', 'Telegram claro', 'Azul y burbujas verdes del cliente oficial', 'telegram', 'light', {
    canvas: '#ffffff', rail: '#ffffff', surface: '#ffffff', elevated: '#ffffff', chat: '#e7ebf0',
    accent: '#3390ec', onAccent: '#ffffff', input: '#f2f4f6', bubble: '#ffffff',
    outgoing: '#effdde', outgoingMeta: '#62a54c', premium: '#f4f8fd', line: '#1c273312',
    hover: '#18243308', soft: '#3390ec14', goldLine: '#3390ec2b', selected: '#3390ec12',
    wallDot: '#7a8a9a38', wallAuroraA: '#3390ec30', wallAuroraB: '#3390ec1f',
  }, 'Telegram'),
  preset('telegram-night', 'Telegram oscuro', 'Azul nocturno y burbujas del cliente oficial', 'telegram', 'dark', {
    canvas: '#0e1621', rail: '#17212b', surface: '#17212b', elevated: '#232e3c', chat: '#0e1621',
    text: '#f5f5f5', muted: '#7f91a4', faint: '#5f7386', accent: '#5288c1', onAccent: '#ffffff',
    input: '#17212b', bubble: '#182533', outgoing: '#2b5278', outgoingMeta: '#7da8d3',
    premium: '#17212b', line: '#ffffff12', bubbleLine: '#ffffff08', date: '#ffffff0a',
    soft: '#5288c118', goldLine: '#5288c12e', selected: '#5288c118', wallDot: '#7f91a440',
    wallAuroraA: '#5288c147', wallAuroraB: '#5288c12b', danger: '#e57373',
  }, 'Telegram'),

  preset('tgx', 'TGX', 'Turquesa nocturno inspirado en TGX', 'clients', 'dark', {
    canvas: '#0b1412', rail: '#0f1a18', surface: '#142320', elevated: '#1b2e2a', chat: '#0a1210',
    text: '#e7f4f0', muted: '#86a8a0', faint: '#66837c', accent: '#4dd0c4', onAccent: '#04201c',
    input: '#16241f', bubble: '#16241f', outgoing: '#173b35', outgoingMeta: '#79bfb4',
    premium: '#12211e', soft: '#4dd0c414', goldLine: '#4dd0c42e', selected: '#4dd0c414',
    wallDot: '#7fc9bf3d', wallAuroraA: '#4dd0c447', wallAuroraB: '#4dd0c42b', danger: '#ef8f8f',
  }, 'TGX'),
  preset('nekogram', 'Nekogram', 'Índigo y lavanda inspirados en Nekogram', 'clients', 'dark', {
    canvas: '#14121b', rail: '#181522', surface: '#1e1a2b', elevated: '#272135', chat: '#131019',
    text: '#efe9f7', muted: '#a79bb8', faint: '#7d7290', accent: '#c792ea', onAccent: '#201631',
    input: '#171322', bubble: '#221d30', outgoing: '#342a49', outgoingMeta: '#b29ac9',
    premium: '#1a1626', soft: '#c792ea14', goldLine: '#c792ea2e', selected: '#c792ea14',
    wallDot: '#b9a6c93d', wallAuroraA: '#c792ea47', wallAuroraB: '#c792ea2b',
  }, 'Nekogram'),
  preset('plus', 'Plus Messenger', 'Ámbar cálido inspirado en Plus Messenger', 'clients', 'dark', {
    canvas: '#131211', rail: '#181513', surface: '#211d19', elevated: '#2b251f', chat: '#12100e',
    text: '#f4ede5', muted: '#b3a393', faint: '#85786a', accent: '#ff8a3d', onAccent: '#241304',
    input: '#1a1714', bubble: '#241f1a', outgoing: '#3a2a1c', outgoingMeta: '#c9a07d',
    premium: '#1c1814', soft: '#ff8a3d14', goldLine: '#ff8a3d2e', selected: '#ff8a3d14',
    wallDot: '#c9a07d3d', wallAuroraA: '#ff8a3d47', wallAuroraB: '#ff8a3d2b',
  }, 'Plus Messenger'),
  preset('ayu', 'AyuGram', 'Cian eléctrico inspirado en AyuGram', 'clients', 'dark', {
    canvas: '#0b0f14', rail: '#0f141b', surface: '#101720', elevated: '#16202b', chat: '#0a0e13',
    text: '#e8f1f8', muted: '#92a6b8', faint: '#6b7f91', accent: '#59c2ff', onAccent: '#041820',
    input: '#111821', bubble: '#131b24', outgoing: '#14324a', outgoingMeta: '#7fb4d6',
    premium: '#0f161e', soft: '#59c2ff14', goldLine: '#59c2ff2e', selected: '#59c2ff14',
    wallDot: '#89aec83d', wallAuroraA: '#59c2ff47', wallAuroraB: '#59c2ff2b',
  }, 'AyuGram'),
  preset('catogram', 'Catogram', 'Rosa pastel inspirado en Catogram', 'clients', 'light', {
    canvas: '#fff7fa', rail: '#ffffff', surface: '#ffffff', elevated: '#ffffff', chat: '#fde9f1',
    text: '#3a2430', muted: '#8a6476', faint: '#a07e8f', accent: '#d94f86', onAccent: '#ffffff',
    input: '#f9eef3', bubble: '#ffffff', outgoing: '#ffe1ec', outgoingMeta: '#b57690',
    premium: '#fdeef4', soft: '#d94f8614', goldLine: '#d94f862b', selected: '#d94f8612',
    wallDot: '#a07e8f33', wallAuroraA: '#d94f8638', wallAuroraB: '#d94f8624',
  }, 'Catogram'),
  preset('ime', 'iMe', 'Azul luminoso inspirado en iMe', 'clients', 'light', {
    canvas: '#f5f8ff', rail: '#ffffff', surface: '#ffffff', elevated: '#ffffff', chat: '#eaf0fb',
    text: '#1d2a3d', muted: '#5c6f88', faint: '#74869c', accent: '#2f6fed', onAccent: '#ffffff',
    input: '#f0f4fc', bubble: '#ffffff', outgoing: '#dce9ff', outgoingMeta: '#5d7fae',
    premium: '#eef4ff', soft: '#2f6fed0f', goldLine: '#2f6fed25', selected: '#2f6fed0f',
    wallDot: '#74869c33', wallAuroraA: '#2f6fed38', wallAuroraB: '#2f6fed24',
  }, 'iMe'),
  preset('unigram', 'Unigram', 'Azul Fluent inspirado en Unigram', 'clients', 'dark', {
    canvas: '#1b1b1f', rail: '#202024', surface: '#252529', elevated: '#2d2d33', chat: '#151519',
    text: '#f0f0f4', muted: '#a0a0aa', faint: '#7c7c86', accent: '#4cc2ff', onAccent: '#001e28',
    input: '#1f1f24', bubble: '#2a2a30', outgoing: '#23323d', outgoingMeta: '#8fb7c9',
    premium: '#202025', soft: '#4cc2ff14', goldLine: '#4cc2ff2e', selected: '#4cc2ff14',
    wallDot: '#9fb6c23d', wallAuroraA: '#4cc2ff47', wallAuroraB: '#4cc2ff2b',
  }, 'Unigram'),
  preset('material', 'Materialgram', 'Violeta dinámico inspirado en Materialgram', 'clients', 'dark', {
    canvas: '#141218', rail: '#1d1b20', surface: '#211f26', elevated: '#2b2930', chat: '#0f0d13',
    text: '#e6e0e9', muted: '#cac4d0', faint: '#938f99', accent: '#d0bcff', onAccent: '#381e72',
    input: '#211f26', bubble: '#2b2930', outgoing: '#4a4458', outgoingMeta: '#c5b9de',
    premium: '#1d1b20', soft: '#d0bcff18', goldLine: '#d0bcff2e', selected: '#d0bcff18',
    wallDot: '#cac4d03d', wallAuroraA: '#d0bcff47', wallAuroraB: '#d0bcff2b',
  }, 'Materialgram'),
  preset('sixtyfour', '64Gram', 'Azul profundo inspirado en 64Gram', 'clients', 'dark', {
    canvas: '#0f1115', rail: '#141821', surface: '#171a21', elevated: '#1f2530', chat: '#0d0f13',
    text: '#e9eef5', muted: '#96a3b5', faint: '#6d7b8f', accent: '#4d9fff', onAccent: '#001a33',
    input: '#171b23', bubble: '#1b202a', outgoing: '#1f3a5f', outgoingMeta: '#8cb4dc',
    premium: '#151922', soft: '#4d9fff14', goldLine: '#4d9fff2e', selected: '#4d9fff14',
    wallDot: '#93a9c33d', wallAuroraA: '#4d9fff47', wallAuroraB: '#4d9fff2b',
  }, '64Gram'),
];

export const THEME_GROUPS: { id: ThemeGroup; label: string; description: string }[] = [
  { id: 'wrgram', label: 'WRGram', description: 'La identidad original y sus variantes' },
  { id: 'telegram', label: 'Telegram', description: 'Paletas inspiradas en el cliente oficial' },
  { id: 'clients', label: 'Otros clientes', description: 'Homenajes a clientes no oficiales, con paletas propias' },
];

export const DEFAULT_THEME_ID = 'gold';
export const MAX_CUSTOM_THEMES = 20;
export const THEME_NAME_MAX = 40;
export const THEME_CODE_MAX = 8192;
const ID_PATTERN = /^ct-[a-z0-9-]{4,48}$/;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;

export const THEME_PREMIUM = {
  enforced: false,
  badge: 'WRGRAM PREMIUM · INCLUIDO EN BETA',
  note: 'El gestor de temas y los temas de la comunidad formarán parte de WRGram Premium, un producto propio distinto de Telegram Premium. Mientras WRGram Premium no se venda, se incluyen sin costo: no hay cobro, suscripción ni activación simulada. Tu Telegram Premium real se consulta y se canjea en Ajustes · Telegram Premium.',
};
// No WRGram entitlement or billing exists yet, so the feature stays available and
// only this label reserves it for Premium. Do not turn this into a fake purchase gate,
// and do not tie it to the real Telegram Premium subscription shown in PremiumPanels.

export function presetById(id: unknown): ThemePreset | undefined {
  return typeof id === 'string' ? THEME_PRESETS.find((theme) => theme.id === id) : undefined;
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_PATTERN.test(value);
}

export function isValidPalette(value: unknown): value is ThemePalette {
  if (!value || typeof value !== 'object') return false;
  const palette = value as Record<string, unknown>;
  return PALETTE_KEYS.every((key) => isHexColor(palette[key]));
}

export function resolvePreset(themePreset: ThemePreset): ThemePalette {
  return { ...(themePreset.scheme === 'dark' ? DARK_BASE : LIGHT_BASE), ...themePreset.overrides };
}

export function resolveTheme(theme: unknown, custom: unknown): ResolvedTheme {
  const selected = presetById(theme);
  if (selected) {
    return { id: selected.id, name: selected.name, scheme: selected.scheme, palette: resolvePreset(selected), custom: false, ...(selected.source ? { source: selected.source } : {}) };
  }
  if (theme === 'custom') {
    const own = sanitizeCustomTheme(custom);
    if (own) return { id: 'custom', name: own.name, scheme: own.scheme, palette: own.palette, custom: true, ...(own.author ? { source: own.author } : {}), ...(own.style ? { style: own.style } : {}) };
  }
  const fallback = THEME_PRESETS[0];
  return { id: fallback.id, name: fallback.name, scheme: fallback.scheme, palette: resolvePreset(fallback), custom: false };
}

export function resolveThemeById(id: string, customThemes: CustomTheme[] = [], activeCustom?: unknown): ResolvedTheme | null {
  if (id === 'custom') return sanitizeCustomTheme(activeCustom) ? resolveTheme('custom', activeCustom) : null;
  const saved = customThemes.find((theme) => theme.id === id);
  if (saved) {
    const own = sanitizeCustomTheme(saved);
    if (own) return { id: own.id, name: own.name, scheme: own.scheme, palette: own.palette, custom: true, ...(own.author ? { source: own.author } : {}), ...(own.style ? { style: own.style } : {}) };
  }
  const selected = presetById(id);
  return selected ? resolveTheme(selected.id, null) : null;
}

export function makeCustomId(_name: string): string {
  const stamp = Date.now().toString(36);
  const noise = Math.random().toString(36).slice(2, 8);
  return `ct-${stamp}-${noise}`;
}

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
}

export function sanitizeThemeStyle(value: unknown): ThemeStyle | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const style = { ...DEFAULT_THEME_STYLE };
  let valid = false;
  if (THEME_FONTS.some((font) => font.id === record.fontFamily)) { style.fontFamily = record.fontFamily as ThemeFontFamily; valid = true; }
  if (THEME_WALLPAPERS.some((item) => item.id === record.wallpaper)) { style.wallpaper = record.wallpaper as ThemeWallpaper; valid = true; }
  if (typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)) { style.fontSize = Math.round(record.fontSize); valid = true; }
  if (typeof record.radius === 'number' && Number.isFinite(record.radius)) { style.radius = Math.round(record.radius); valid = true; }
  if (typeof record.blur === 'number' && Number.isFinite(record.blur)) { style.blur = Math.round(record.blur); valid = true; }
  if (!valid) return undefined;
  style.fontSize = Math.max(12, Math.min(24, style.fontSize));
  style.radius = Math.max(0, Math.min(22, style.radius));
  style.blur = Math.max(0, Math.min(20, style.blur));
  return style;
}

export function sanitizeCustomTheme(value: unknown, options: { newId?: boolean } = {}): CustomTheme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const name = cleanText(record.name, THEME_NAME_MAX);
  if (!name) return null;
  const scheme: ThemeScheme = record.scheme === 'light' ? 'light' : record.scheme === 'dark' ? 'dark' : 'dark';
  const base = presetById(record.base)?.id;
  const rawPalette = record.palette;
  if (!rawPalette || typeof rawPalette !== 'object' || Array.isArray(rawPalette)) return null;
  const fields = rawPalette as Record<string, unknown>;
  for (const key of ['canvas', 'surface', 'text', 'accent', 'outgoing'] as const) if (!isHexColor(fields[key])) return null;
  const seed = presetById(base) ?? presetById(scheme === 'light' ? 'day' : 'gold') ?? THEME_PRESETS[0];
  const palette = { ...resolvePreset(seed) };
  for (const key of PALETTE_KEYS) if (isHexColor(fields[key])) palette[key] = fields[key].toLowerCase();
  const id = !options.newId && typeof record.id === 'string' && ID_PATTERN.test(record.id) ? record.id : makeCustomId(name);
  const author = cleanText(record.author, 40);
  const style = sanitizeThemeStyle(record.style);
  return { id, name, scheme, palette, ...(base ? { base } : {}), ...(author ? { author } : {}), ...(style ? { style } : {}) };
}

export function encodeCustomTheme(theme: CustomTheme): string {
  const own = sanitizeCustomTheme(theme);
  if (!own) throw new Error('El tema no tiene datos válidos.');
  return JSON.stringify({
    format: 'wrgram-theme',
    version: 2,
    name: own.name,
    scheme: own.scheme,
    ...(own.author ? { author: own.author } : {}),
    palette: own.palette,
    ...(own.style ? { style: own.style } : {}),
  });
}

export function encodePresetTheme(id: string, style?: ThemeStyle): string | null {
  const preset = presetById(id);
  if (!preset) return null;
  return encodeCustomTheme({ id: 'ct-shared-preset-0000', name: preset.name, scheme: preset.scheme, palette: resolvePreset(preset), base: preset.id, ...(preset.source ? { author: preset.source } : {}), ...(style ? { style } : {}) });
}

function toBase64Url(text: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const base = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base + '='.repeat((4 - (base.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function encodeThemeLink(theme: CustomTheme): string {
  return `wrgram://theme/${toBase64Url(encodeCustomTheme(theme))}`;
}

export function decodeThemeLink(text: string): DecodeThemeResult {
  const raw = typeof text === 'string' ? text.trim() : '';
  const match = raw.match(/^wrgram:\/\/theme\/([A-Za-z0-9_-]{8,})$/);
  if (!match) return { ok: false, error: 'El enlace no es un enlace de tema de WRGram.' };
  if (raw.length > THEME_CODE_MAX * 2) return { ok: false, error: 'El enlace del tema es demasiado grande.' };
  try {
    return decodeCustomTheme(fromBase64Url(match[1]));
  } catch {
    return { ok: false, error: 'El enlace del tema está dañado o incompleto.' };
  }
}

export type DecodeThemeResult = { ok: true; theme: CustomTheme } | { ok: false; error: string };

export function decodeCustomTheme(text: string): DecodeThemeResult {
  const raw = typeof text === 'string' ? text.trim() : '';
  if (!raw) return { ok: false, error: 'Pega el código de un tema para importarlo.' };
  if (raw.length > THEME_CODE_MAX) return { ok: false, error: 'El código del tema es demasiado grande.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'El código no es un tema de WRGram válido.' };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: 'El código no es un tema de WRGram válido.' };
  const record = parsed as Record<string, unknown>;
  if (record.format !== undefined && record.format !== 'wrgram-theme') return { ok: false, error: 'Este código pertenece a otro formato de tema.' };
  if (record.version !== undefined && record.version !== 1 && record.version !== 2) return { ok: false, error: 'La versión del tema no es compatible con esta app.' };
  const theme = sanitizeCustomTheme(record, { newId: true });
  if (!theme) return { ok: false, error: 'Faltan colores válidos o el nombre del tema.' };
  return { ok: true, theme };
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '').slice(0, 6);
  return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
}

function channel(value: number): string {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex);
  return `#${channel(r)}${channel(g)}${channel(b)}${channel(alpha * 255)}`;
}

export function blend(first: string, second: string, amount: number): string {
  const [r1, g1, b1] = rgb(first);
  const [r2, g2, b2] = rgb(second);
  const ratio = Math.max(0, Math.min(1, amount));
  return `#${channel(r1 + (r2 - r1) * ratio)}${channel(g1 + (g2 - g1) * ratio)}${channel(b1 + (b2 - b1) * ratio)}`;
}

function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((value) => {
    const unit = value / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastOn(hex: string): string {
  return luminance(hex) > 0.45 ? '#1b1409' : '#ffffff';
}

export function buildCustomTheme(draft: CustomThemeDraft): CustomTheme {
  const base = presetById(draft.base) ?? THEME_PRESETS[0];
  const palette = { ...resolvePreset(base) };
  const accent = isHexColor(draft.accent) ? draft.accent : palette.accent;
  const canvas = isHexColor(draft.canvas) ? draft.canvas : palette.canvas;
  const text = isHexColor(draft.text) ? draft.text : palette.text;
  const outgoing = isHexColor(draft.outgoing) ? draft.outgoing : palette.outgoing;
  palette.canvas = canvas;
  palette.rail = blend(canvas, palette.surface, base.scheme === 'dark' ? 0.18 : 0.45);
  palette.chat = blend(canvas, palette.surface, 0.1);
  palette.input = blend(canvas, palette.surface, base.scheme === 'dark' ? 0.22 : 0.3);
  palette.text = text;
  palette.muted = blend(text, canvas, base.scheme === 'dark' ? 0.42 : 0.5);
  palette.faint = blend(text, canvas, base.scheme === 'dark' ? 0.58 : 0.62);
  palette.messageMeta = palette.muted;
  palette.pattern = palette.muted;
  palette.accent = accent;
  palette.soft = withAlpha(accent, 0.07);
  palette.goldLine = withAlpha(accent, 0.15);
  palette.selected = withAlpha(accent, 0.07);
  palette.wallAuroraA = withAlpha(accent, 0.28);
  palette.wallAuroraB = withAlpha(accent, 0.17);
  palette.onAccent = contrastOn(accent);
  palette.outgoing = outgoing;
  palette.outgoingMeta = blend(accent, outgoing, 0.45);
  const name = cleanText(draft.name, THEME_NAME_MAX) || 'Tema personalizado';
  const id = draft.id && ID_PATTERN.test(draft.id) ? draft.id : makeCustomId(name);
  const style = sanitizeThemeStyle(draft.style);
  return { id, name, scheme: base.scheme, palette, base: base.id, ...(style ? { style } : {}) };
}

const CSS_NAMES: Record<PaletteKey, string> = {
  canvas: '--canvas', rail: '--rail', surface: '--surface', elevated: '--elevated', chat: '--chat',
  text: '--text', muted: '--muted', faint: '--faint', accent: '--accent', onAccent: '--on-accent',
  line: '--line', goldLine: '--gold-line', soft: '--soft', hover: '--hover', input: '--input',
  selected: '--selected', outgoing: '--outgoing', outgoingMeta: '--outgoing-meta', bubble: '--bubble',
  bubbleLine: '--bubble-line', messageMeta: '--message-meta', date: '--date', premium: '--premium',
  pattern: '--pattern', wallDot: '--wall-dot', wallAuroraA: '--wall-aurora-a', wallAuroraB: '--wall-aurora-b',
  danger: '--danger',
};

export function paletteCssVars(palette: ThemePalette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of PALETTE_KEYS) vars[CSS_NAMES[key]] = palette[key];
  return vars;
}

export function contrastRatio(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

export function themeContrastWarnings(palette: ThemePalette): string[] {
  const warnings: string[] = [];
  const text = contrastRatio(palette.text, palette.canvas);
  if (text < 4.5) warnings.push(`El texto y el fondo tienen un contraste de ${text.toFixed(1)}:1; se recomienda 4.5:1.`);
  const bubble = contrastRatio(palette.text, palette.outgoing);
  if (bubble < 4.5) warnings.push(`El texto sobre tu burbuja tiene un contraste de ${bubble.toFixed(1)}:1; se recomienda 4.5:1.`);
  const button = contrastRatio(palette.onAccent, palette.accent);
  if (button < 3) warnings.push(`El texto del acento tiene un contraste de ${button.toFixed(1)}:1; se recomienda 3:1.`);
  return warnings;
}

export function styleCssVars(style: ThemeStyle): Record<string, string> {
  return { '--bubble-radius': `${style.radius}px`, '--theme-blur': `${style.blur}px` };
}
