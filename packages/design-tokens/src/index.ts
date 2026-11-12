export const THEMES = [
  { id: 'gold', name: 'WR Gold', description: 'La nueva identidad: negro y dorado', scheme: 'dark' },
  { id: 'violet', name: 'Violeta', description: 'El estilo original de WRGram', scheme: 'light' },
  { id: 'day', name: 'Día', description: 'Claro, limpio y de alto contraste', scheme: 'light' },
  { id: 'night', name: 'Noche', description: 'Azul profundo y brillo reducido', scheme: 'dark' },
  { id: 'ocean', name: 'Océano', description: 'Azules frescos y tonos marinos', scheme: 'light' },
  { id: 'forest', name: 'Bosque', description: 'Verdes suaves y naturales', scheme: 'light' },
  { id: 'sunset', name: 'Terracota', description: 'Cálido, con acentos de arcilla', scheme: 'light' },
  { id: 'graphite', name: 'Grafito', description: 'Grises oscuros y acento ámbar', scheme: 'dark' },
] as const;

export type ThemeId = typeof THEMES[number]['id'];
export const DEFAULT_THEME: ThemeId = 'gold';

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === 'string' && THEMES.some((theme) => theme.id === value);
}

export function parseTheme(value: unknown): ThemeId {
  return isThemeId(value) ? value : DEFAULT_THEME;
}

export function toggleDayNight(current: ThemeId): ThemeId {
  return THEMES.find((theme) => theme.id === current)?.scheme === 'dark' ? 'day' : 'night';
}
