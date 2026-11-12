import { createContext, useContext, useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { DEFAULT_THEME, isThemeId, parseTheme, toggleDayNight, type ThemeId } from '@wrgram/design-tokens';

const STORAGE_KEY = 'wrgram.preferences.theme.v2';
const ThemeContext = createContext<{ theme: ThemeId; setTheme: (theme: ThemeId) => void; toggle: () => void; persisted: boolean } | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, updateTheme] = useState<ThemeId>(() => {
    try { return parseTheme(window.localStorage.getItem(STORAGE_KEY)); } catch { return DEFAULT_THEME; }
  });
  const [persisted, setPersisted] = useState(true);
  useLayoutEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) updateTheme(parseTheme(event.newValue));
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);

  function setTheme(next: ThemeId) {
    if (!isThemeId(next)) return;
    updateTheme(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); setPersisted(true); }
    catch { setPersisted(false); }
  }

  return <ThemeContext value={{ theme, setTheme, persisted, toggle: () => setTheme(toggleDayNight(theme)) }}>{children}</ThemeContext>;
}

export function useTheme() {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('El selector de temas requiere ThemeProvider.');
  return value;
}
