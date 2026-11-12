import { describe, expect, it } from 'vitest';
import {
  DEFAULT_THEME_ID, MAX_CUSTOM_THEMES, PALETTE_KEYS, THEME_CODE_MAX, THEME_GROUPS, THEME_PREMIUM,
  THEME_PRESETS, buildCustomTheme, contrastRatio, decodeCustomTheme, decodeThemeLink, encodeCustomTheme,
  encodeThemeLink, isHexColor, isValidPalette, paletteCssVars, presetById, resolvePreset, resolveTheme,
  resolveThemeById, sanitizeCustomTheme, themeContrastWarnings,
  type CustomTheme, type ThemePalette,
} from './themes';
import { EMPTY } from './contract';

const draft = { name: 'Mi cobalto', base: 'gold', accent: '#4d8dff', canvas: '#101522', text: '#eef2ff', outgoing: '#243a63' };

describe('catálogo de temas de WRGram', () => {
  it('reúne diecinueve paletas únicas y conserva la identidad dorada por defecto', () => {
    expect(THEME_PRESETS).toHaveLength(19);
    expect(new Set(THEME_PRESETS.map((theme) => theme.id)).size).toBe(19);
    expect(DEFAULT_THEME_ID).toBe('gold');
    expect(presetById(DEFAULT_THEME_ID)?.scheme).toBe('dark');
    expect(THEME_GROUPS.map((group) => group.id)).toEqual(['wrgram', 'telegram', 'clients']);
  });

  it('incluye el cliente oficial y homenajes a clientes no oficiales con paletas válidas', () => {
    expect(THEME_PRESETS.filter((theme) => theme.group === 'telegram').map((theme) => theme.id)).toEqual(['telegram', 'telegram-night']);
    for (const id of ['tgx', 'nekogram', 'plus']) expect(presetById(id)).toBeTruthy();
    for (const theme of THEME_PRESETS) {
      const palette = resolvePreset(theme);
      expect(isValidPalette(palette)).toBe(true);
      expect(Object.keys(palette).sort()).toEqual([...PALETTE_KEYS].sort());
      for (const key of PALETTE_KEYS) expect(isHexColor(palette[key])).toBe(true);
    }
  });

  it('no afirma afiliación con otros clientes ni cobra por el gestor', () => {
    for (const theme of THEME_PRESETS.filter((item) => item.group !== 'wrgram')) expect(theme.overrides).toBeTruthy();
    expect(THEME_PREMIUM.enforced).toBe(false);
    expect(THEME_PREMIUM.badge).toContain('INCLUIDO EN BETA');
    expect(THEME_PREMIUM.note).toContain('no hay cobro');
  });

  it('resuelve temas desconocidos al dorado y expone su paleta en variables CSS completas', () => {
    expect(resolveTheme('unknown', undefined).id).toBe('gold');
    expect(resolveTheme('custom', {})).toMatchObject({ id: 'gold', custom: false });
    const vars = paletteCssVars(resolvePreset(THEME_PRESETS[0]));
    expect(vars['--canvas']).toBe('#101113');
    expect(vars['--on-accent']).toBe('#241d10');
    expect(vars['--wall-aurora-a']).toBeDefined();
    expect(Object.keys(vars)).toHaveLength(PALETTE_KEYS.length);
  });
});

describe('temas personalizados y comunidad', () => {
  it('deriva burbujas, metadatos y contraste desde cuatro colores', () => {
    const theme = buildCustomTheme(draft);
    expect(theme).toMatchObject({ name: 'Mi cobalto', scheme: 'dark', base: 'gold' });
    expect(isValidPalette(theme.palette)).toBe(true);
    expect(theme.palette.accent).toBe('#4d8dff');
    expect(theme.palette.canvas).toBe('#101522');
    expect(theme.palette.outgoing).toBe('#243a63');
    expect(theme.palette.outgoingMeta).not.toBe(theme.palette.outgoing);
    expect(theme.palette.soft).toMatch(/^#4d8dff[0-9a-f]{2}$/);
    expect(theme.id).toMatch(/^ct-[a-z0-9-]+$/);
  });

  it('conserva un identificador válido al editar y genera uno nuevo al importar', () => {
    const first = buildCustomTheme(draft);
    const edited = buildCustomTheme({ ...draft, id: first.id, accent: '#ff8844' });
    expect(edited.id).toBe(first.id);
    const code = encodeCustomTheme(edited);
    const decoded = decodeCustomTheme(code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.theme.id).not.toBe(first.id);
    expect(decoded.theme.palette).toEqual(edited.palette);
    expect(decoded.theme.name).toBe('Mi cobalto');
  });

  it('rechaza códigos corruptos, de otra versión, gigantes o sin colores', () => {
    expect(decodeCustomTheme('')).toMatchObject({ ok: false });
    expect(decodeCustomTheme('no es json')).toMatchObject({ ok: false });
    expect(decodeCustomTheme(JSON.stringify({ format: 'otro', name: 'X', palette: {} }))).toMatchObject({ ok: false });
    expect(decodeCustomTheme(JSON.stringify({ format: 'wrgram-theme', version: 3, name: 'X', palette: {} }))).toMatchObject({ ok: false });
    expect(decodeCustomTheme(JSON.stringify({ format: 'wrgram-theme', version: 1, name: '', palette: {} }))).toMatchObject({ ok: false });
    expect(decodeCustomTheme('x'.repeat(THEME_CODE_MAX + 1))).toMatchObject({ ok: false });
    expect(decodeCustomTheme(JSON.stringify({ name: 'Sin colores', palette: { accent: '#ffffff' } }))).toMatchObject({ ok: false });
  });

  it('sanea paletas parciales, nombres y campos inyectados', () => {
    const sanitized = sanitizeCustomTheme({ name: '  Tema\x00 raro  ', scheme: 'light', palette: { canvas: '#ffffff', surface: '#ffffff', text: '#111111', accent: '#3366ff', outgoing: '#e0ecff', extra: '#000000', __proto__: { polluted: true } } });
    expect(sanitized?.name).toBe('Tema raro');
    expect(sanitized?.scheme).toBe('light');
    expect(sanitized?.palette.canvas).toBe('#ffffff');
    expect(sanitized?.palette).not.toHaveProperty('extra');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(sanitizeCustomTheme({ name: 'x'.repeat(200), palette: { canvas: '#ffffff', surface: '#ffffff', text: '#111111', accent: '#3366ff', outgoing: '#e0ecff' } })?.name).toHaveLength(40);
    expect(sanitizeCustomTheme(null)).toBeNull();
  });

  it('no acepta paletas con colores fuera del formato hexadecimal', () => {
    const palette = resolvePreset(THEME_PRESETS[0]) as ThemePalette;
    const broken = { ...palette, accent: 'url(javascript:alert(1))' };
    expect(isValidPalette(broken)).toBe(false);
    expect(sanitizeCustomTheme({ name: 'Roto', palette: broken })).toBeNull();
  });

  it('mantiene el límite de temas guardados y la forma esperada del contrato', () => {
    expect(MAX_CUSTOM_THEMES).toBe(20);
    expect(EMPTY.appearance.customThemes).toEqual([]);
    const custom: CustomTheme = buildCustomTheme(draft);
    expect(resolveTheme('custom', custom)).toMatchObject({ id: 'custom', name: 'Mi cobalto', custom: true });
  });

  it('viaja con estilo, se comparte como enlace y se resuelve por identificador guardado', () => {
    const custom = buildCustomTheme({ ...draft, style: { fontFamily: 'serif', fontSize: 32, wallpaper: 'aurora', radius: 99, blur: 4 } });
    expect(custom.style).toEqual({ fontFamily: 'serif', fontSize: 24, wallpaper: 'aurora', radius: 22, blur: 4 });
    const code = encodeCustomTheme(custom);
    const decoded = decodeCustomTheme(code);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(JSON.parse(code).version).toBe(2);
    expect(decoded.theme.style).toEqual(custom.style);
    const link = encodeThemeLink(custom);
    expect(link.startsWith('wrgram://theme/')).toBe(true);
    const fromLink = decodeThemeLink(link);
    expect(fromLink.ok).toBe(true);
    if (fromLink.ok) expect(fromLink.theme.style?.fontFamily).toBe('serif');
    expect(decodeThemeLink('https://example.com/tema')).toMatchObject({ ok: false });
    expect(resolveThemeById(custom.id, [custom])?.name).toBe('Mi cobalto');
    expect(resolveThemeById('unknown', [custom])).toBeNull();
  });

  it('mide el contraste real y avisa de combinaciones poco legibles', () => {
    const readable = resolvePreset(THEME_PRESETS[0]);
    expect(contrastRatio(readable.text, readable.canvas)).toBeGreaterThan(4.5);
    expect(themeContrastWarnings(readable)).toEqual([]);
    const broken = { ...readable, text: '#777777', canvas: '#7a7a7a', outgoing: '#7a7a7a', accent: '#888888', onAccent: '#999999' };
    expect(themeContrastWarnings(broken).length).toBeGreaterThan(0);
  });
});
