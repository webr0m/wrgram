import { Check, Moon, Sun } from 'lucide-react';
import { THEMES } from '@wrgram/design-tokens';
import { useTheme } from './ThemeProvider';

export function ThemePicker() {
  const { theme, setTheme, persisted } = useTheme();
  return <section className="settings-section theme-settings" aria-labelledby="theme-heading">
    <h3 id="theme-heading">Tu estilo, tu espacio <span className="pill">{THEMES.length} temas</span></h3>
    <p>Incluye Día y Noche. El tema se aplica a toda la interfaz y se recuerda en este navegador.</p>
    <div className="theme-grid" role="radiogroup" aria-label="Tema visual de WRGram" onKeyDown={(event) => {
      if (!['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const current = THEMES.findIndex((item) => item.id === theme);
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? THEMES.length - 1 : (current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + THEMES.length) % THEMES.length;
      setTheme(THEMES[index].id);
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
    }}>
      {THEMES.map((item) => <button type="button" key={item.id} className={`theme-option ${theme === item.id ? 'theme-option-active' : ''}`} data-theme-choice={item.id} role="radio" aria-checked={theme === item.id} tabIndex={theme === item.id ? 0 : -1} onClick={() => setTheme(item.id)}>
        <span className="theme-preview" aria-hidden="true"><span className="theme-preview-rail" /><span className="theme-preview-list"><i /><i /><i /></span><span className="theme-preview-chat"><i /><i /></span></span>
        <span className="theme-option-name">{item.scheme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}{item.name}{theme === item.id && <Check size={13} />}</span>
        <span className="theme-option-description">{item.description}</span>
      </button>)}
    </div>
    {!persisted && <p role="status">El tema está activo, pero no se pudo guardar en este navegador.</p>}
  </section>;
}
