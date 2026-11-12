import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, parseTheme, THEMES, toggleDayNight } from './index';

describe('temas compartidos de WRGram', () => {
  it('ofrece ocho temas únicos, incluido negro/dorado, día y noche', () => {
    expect(THEMES).toHaveLength(8);
    expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(8);
    expect(DEFAULT_THEME).toBe('gold');
    expect(THEMES.find((theme) => theme.id === 'day')?.scheme).toBe('light');
    expect(THEMES.find((theme) => theme.id === 'night')?.scheme).toBe('dark');
  });
  it('no acepta temas inyectados o preferencias corruptas', () => {
    expect(parseTheme('night')).toBe('night');
    for (const value of [null, {}, 'unknown', '__proto__', 'night something']) expect(parseTheme(value)).toBe(DEFAULT_THEME);
  });
  it('alterna a noche desde un tema claro y a día desde uno oscuro', () => {
    expect(toggleDayNight('forest')).toBe('night');
    expect(toggleDayNight('night')).toBe('day');
    expect(toggleDayNight('graphite')).toBe('day');
  });
});
