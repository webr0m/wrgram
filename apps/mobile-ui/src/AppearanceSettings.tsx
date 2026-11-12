import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { Check, Copy, Crown, Link2, Palette, Pencil, Plus, RefreshCw, Share2, Trash2, Upload, X } from 'lucide-react';
import type { State } from './contract';
import { useDialog } from './dialogs';
import {
  DEFAULT_THEME_STYLE, MAX_CUSTOM_THEMES, THEME_FONTS, THEME_GROUPS, THEME_PRESETS, THEME_PREMIUM,
  THEME_WALLPAPERS, buildCustomTheme, encodeCustomTheme, encodeThemeLink, paletteCssVars, presetById,
  resolvePreset, resolveTheme, themeContrastWarnings,
  type CustomTheme, type CustomThemeDraft, type ThemePalette, type ThemeStyle,
} from './themes';
import { parseThemeFile } from './theme-files';
import { WallpaperSettings } from './ChatWallpaper';
import { useLanguage } from './language';
import './theme-manager.css';

type Run = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;
type Tab = 'presets' | 'wallpapers' | 'create' | 'community' | 'saved';

const QUICK_THEMES = ['gold', 'day', 'night', 'telegram', 'telegram-night', 'tgx', 'nekogram', 'plus'];
const TYPEFACES: [string, string][] = [['system', 'Sistema'], ['serif', 'Serif'], ['mono', 'Mono'], ['rounded', 'Redonda']];
const GESTURE_ACTIONS: [string, string][] = [['none', 'Nada'], ['reply', 'Responder'], ['copy', 'Copiar texto'], ['forward', 'Reenviar'], ['select', 'Seleccionar']];
const NAVIGATIONS: ['bar' | 'side', string][] = [['bar', 'Barra inferior'], ['side', 'Lateral']];
type SystemPalette = { scheme: 'dark' | 'light'; accent: string; canvas: string; text: string; outgoing: string };

function vars(palette: ThemePalette): CSSProperties {
  return paletteCssVars(palette) as CSSProperties;
}

function swatch(palette: ThemePalette) {
  return { background: palette.canvas, borderColor: palette.accent };
}

function upsert(list: CustomTheme[], theme: CustomTheme): CustomTheme[] {
  const next = [...list];
  const index = next.findIndex((item) => item.id === theme.id);
  if (index >= 0) next[index] = theme;
  else next.unshift(theme);
  return next.slice(0, MAX_CUSTOM_THEMES);
}

function draftFromTheme(theme: CustomTheme): CustomThemeDraft {
  const base = presetById(theme.base)?.id ?? (theme.scheme === 'light' ? 'day' : 'gold');
  return {
    id: theme.id,
    name: theme.name,
    base,
    accent: theme.palette.accent,
    canvas: theme.palette.canvas,
    text: theme.palette.text,
    outgoing: theme.palette.outgoing,
    ...(theme.style ? { style: theme.style } : {}),
  };
}

function draftFromCurrent(state: State): CustomThemeDraft {
  const active = resolveTheme(state.appearance.theme, state.appearance.custom);
  const style: ThemeStyle = active.style ?? {
    ...DEFAULT_THEME_STYLE,
    fontFamily: state.appearance.fontFamily === 'serif' || state.appearance.fontFamily === 'mono' || state.appearance.fontFamily === 'rounded' ? state.appearance.fontFamily : 'system',
    fontSize: state.appearance.font,
    wallpaper: state.appearance.wallpaper === 'dots' || state.appearance.wallpaper === 'grid' || state.appearance.wallpaper === 'aurora' ? state.appearance.wallpaper : 'none',
  };
  if (state.appearance.theme === 'custom' && state.appearance.custom) return { ...draftFromTheme(state.appearance.custom), style: state.appearance.custom.style ?? style };
  return {
    name: `Copia de ${active.name}`,
    base: active.id,
    accent: active.palette.accent,
    canvas: active.palette.canvas,
    text: active.palette.text,
    outgoing: active.palette.outgoing,
    style,
  };
}

function styleParams(style: ThemeStyle | undefined) {
  return style ? { font: style.fontSize, fontFamily: style.fontFamily, wallpaper: style.wallpaper } : {};
}

export function AppearanceSettings({ state, run }: { state: State; run: Run }) {
  const { t } = useLanguage();
  const [manager, setManager] = useState(false);
  const [paletteNotice, setPaletteNotice] = useState('');
  const active = resolveTheme(state.appearance.theme, state.appearance.custom);
  const customThemes = state.appearance.customThemes ?? [];
  function applySystemPalette() {
    setPaletteNotice('');
    void run<SystemPalette>('appearance.systemPalette').then((palette) => {
      if (!palette) return;
      const theme = buildCustomTheme({ name: 'Sistema · Material You', base: palette.scheme === 'dark' ? 'night' : 'day', accent: palette.accent, canvas: palette.canvas, text: palette.text, outgoing: palette.outgoing });
      void run('appearance', { theme: 'custom', custom: theme, auto: false, ...styleParams(theme.style) }).then((done) => { if (done !== undefined) setPaletteNotice(`Paleta dinámica aplicada como “${theme.name}”. Vuelve a aplicarla si cambias el fondo de pantalla o el modo oscuro.`); });
    });
  }
  return <>
    <div className="theme-current-row">
      <div className="theme-current">
        <span className="theme-current-swatch" style={swatch(active.palette)}><i style={{ background: active.palette.accent }} /><i style={{ background: active.palette.outgoing }} /></span>
        <span><strong>{active.name}</strong><small>{active.custom ? 'Tema personalizado' : active.scheme === 'dark' ? 'Oscuro' : 'Claro'}{customThemes.length ? ` · ${customThemes.length} guardado${customThemes.length === 1 ? '' : 's'}` : ''}</small></span>
      </div>
      <button type="button" className="primary" onClick={() => setManager(true)}><Crown size={16} />{t('Administrador de temas')}</button>
    </div>
    <div className="theme-grid theme-grid-quick">{QUICK_THEMES.map((id) => {
      const item = presetById(id);
      if (!item) return null;
      const palette = resolvePreset(item);
      return <button key={id} aria-pressed={state.appearance.theme === id && !state.appearance.auto} onClick={() => void run('appearance', { theme: id, auto: false })}><span style={{ background: palette.canvas, borderColor: palette.accent }}>{state.appearance.theme === id && !state.appearance.auto && <Check size={15} style={{ color: palette.accent }} />}</span>{item.name}</button>;
    })}</div>
    <div className="setting-row"><span>Color dinámico del sistema</span><button type="button" className="secondary" onClick={applySystemPalette}><Palette size={16} />Aplicar paleta</button></div>
    {paletteNotice && <p className="settings-note" role="status">{paletteNotice}</p>}
    <p className="settings-note">Toma la paleta Material You de tu fondo de pantalla (Android 12 o superior) y la aplica como tema personalizado «Sistema · Material You», sin tocar tu cuenta de Telegram. Si cambias el fondo o el modo oscuro, vuelve a aplicar la paleta.</p>
    <Toggle label="Seguir al sistema" description="Usa Día u Noche según el modo oscuro de Android o Windows" checked={state.appearance.auto === true} change={(auto) => void run('appearance', { auto })} />
    <div className="setting-row"><span>Tamaño del texto</span><div className="segmented" role="group" aria-label="Tamaño del texto">{[14, 16, 18, 21].map((font) => <button type="button" aria-pressed={state.appearance.font === font} className={state.appearance.font === font ? 'selected' : ''} key={font} onClick={() => void run('appearance', { font })}>{font === 14 ? 'Pequeño' : font === 16 ? 'Normal' : font === 18 ? 'Grande' : 'Enorme'}</button>)}</div></div>
    <p className="font-preview" style={{ fontSize: 'var(--font-size)' }}>Aa · Así se verán tus chats, menús y ajustes.</p>
    <div className="setting-row"><span>Tipografía</span><div className="segmented" role="group" aria-label="Tipografía">{TYPEFACES.map(([id, label]) => <button type="button" aria-pressed={(state.appearance.fontFamily || 'system') === id} className={(state.appearance.fontFamily || 'system') === id ? 'selected' : ''} key={id} onClick={() => void run('appearance', { fontFamily: id })}>{label}</button>)}</div></div>
    <WallpaperSettings owner={state.selfId} pattern={active.style?.wallpaper ?? state.appearance.wallpaper}/>
    <div className="setting-row"><span>Navegación</span><div className="segmented" role="group" aria-label="Navegación">{NAVIGATIONS.map(([id, label]) => <button type="button" aria-pressed={(state.appearance.navigation || 'bar') === id} className={(state.appearance.navigation || 'bar') === id ? 'selected' : ''} key={id} onClick={() => void run('appearance', { navigation: id })}>{label}</button>)}</div></div>
    <p className="settings-note">La navegación lateral mueve el menú inferior a una columna en el borde izquierdo de la pantalla; el resto de la interfaz se adapta. Independiente del tema activo.</p>
    <Toggle label="Listas compactas" description="Más conversaciones de un vistazo" checked={state.appearance.compact} change={(compact) => void run('appearance', { compact })} />
    <Toggle label="Mostrar que estoy escribiendo" description="Comparte el estado de escritura con Telegram" checked={state.appearance.typing} change={(typing) => void run('appearance', { typing })} />
    <Toggle label="Enter para enviar" description="Si está desactivado, usa Ctrl + Enter" checked={state.appearance.enter} change={(enter) => void run('appearance', { enter })} />
    <div className="setting-row"><span>Gesto al deslizar una burbuja</span><div className="gesture-selects">
      <label className="field-label">Hacia la derecha<select aria-label="Acción del gesto hacia la derecha" value={state.appearance.gestures?.right || 'none'} onChange={(event) => void run('appearance', { gestures: { left: state.appearance.gestures?.left || 'none', right: event.target.value } })}>{GESTURE_ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label className="field-label">Hacia la izquierda<select aria-label="Acción del gesto hacia la izquierda" value={state.appearance.gestures?.left || 'none'} onChange={(event) => void run('appearance', { gestures: { left: event.target.value, right: state.appearance.gestures?.right || 'none' } })}>{GESTURE_ACTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
    </div></div>
    <p className="settings-note">Los gestos se ejecutan deslizando una burbuja unos 70 px en horizontal, en pantallas táctiles.</p>
    <p className="settings-note">Los cambios se aplican al instante y se guardan en este dispositivo; no modifican tu cuenta de Telegram.</p>
    {manager && <ThemeManager state={state} run={run} close={() => setManager(false)} />}
  </>;
}

function Toggle({ label, description, checked, change }: { label: string; description: string; checked: boolean; change(value: boolean): void }) {
  return <label className="toggle-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" checked={checked} onChange={(event) => change(event.target.checked)} /><span className="switch" aria-hidden="true" /></label>;
}

function ThemeManager({ state, run, close }: { state: State; run: Run; close(): void }) {
  const { t } = useLanguage();
  const dialogRef = useRef<HTMLElement>(null);
  useDialog(dialogRef, close);
  const customThemes = state.appearance.customThemes ?? [];
  const active = resolveTheme(state.appearance.theme, state.appearance.custom);
  const [tab, setTab] = useState<Tab>('presets');
  const [draft, setDraft] = useState<CustomThemeDraft>(() => draftFromCurrent(state));
  const [code, setCode] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const draftPalette = buildCustomTheme(draft).palette;
  const preview = tab === 'create' ? draftPalette : active.palette;
  const draftStyle = draft.style ?? DEFAULT_THEME_STYLE;
  const draftWarnings = themeContrastWarnings(draftPalette);

  function clean() { setNotice(''); setError(''); setWarnings([]); }

  function applyPreset(id: string) {
    clean();
    void run('appearance', { theme: id, auto: false }).then((done) => { if (done !== undefined) setNotice(`${presetById(id)?.name ?? 'Tema'} aplicado.`); });
  }

  function applyDraft(save: boolean) {
    clean();
    const theme = buildCustomTheme(draft);
    const list = save ? upsert(customThemes, theme) : customThemes;
    setDraft({ ...draft, id: theme.id });
    setWarnings(themeContrastWarnings(theme.palette));
    void run('appearance', { theme: 'custom', custom: theme, customThemes: list, auto: false, ...styleParams(theme.style) }).then((done) => {
      if (done !== undefined) setNotice(save ? 'Tema guardado y aplicado en este dispositivo.' : 'Vista previa aplicada. Guarda el tema para conservarlo.');
    });
  }

  function applySaved(theme: CustomTheme) {
    clean();
    void run('appearance', { theme: 'custom', custom: theme, auto: false, ...styleParams(theme.style) }).then((done) => {
      if (done !== undefined) setNotice(`Tema “${theme.name}” aplicado.`);
    });
  }

  function editTheme(theme: CustomTheme) {
    clean();
    setDraft(draftFromTheme(theme));
    setTab('create');
  }

  async function copyCode(theme: CustomTheme) {
    clean();
    try {
      const text = encodeCustomTheme(theme);
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
      await navigator.clipboard.writeText(text);
      setNotice('Código copiado. Compártelo para que otra persona importe el tema.');
    } catch {
      setError('No se pudo copiar el código en este dispositivo.');
    }
  }

  async function copyLink(theme: CustomTheme) {
    clean();
    try {
      const text = encodeThemeLink(theme);
      if (!navigator.clipboard?.writeText) throw new Error('sin portapapeles');
      await navigator.clipboard.writeText(text);
      setNotice('Enlace copiado. Al abrirlo en WRGram se ofrece aplicar el tema.');
    } catch {
      setError('No se pudo copiar el enlace en este dispositivo.');
    }
  }

  async function shareTheme(theme: CustomTheme) {
    clean();
    try {
      const text = encodeThemeLink(theme);
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `Tema ${theme.name} · WRGram`, text });
        return;
      }
    } catch {
      // Sharing can be cancelled or unavailable in the WebView; copying still works.
    }
    await copyCode(theme);
  }

  function themeForShare(): CustomTheme | null {
    if (active.custom && state.appearance.custom) return state.appearance.custom;
    const item = presetById(active.id);
    if (!item) return null;
    return { id: 'ct-shared-preset-0000', name: item.name, scheme: item.scheme, palette: resolvePreset(item), base: item.id, ...(item.source ? { author: item.source } : {}) };
  }

  function applyImported(imported: CustomTheme) {
    const list = upsert(customThemes, imported);
    setCode('');
    setDraft(draftFromTheme(imported));
    setWarnings(themeContrastWarnings(imported.palette));
    void run('appearance', { theme: 'custom', custom: imported, customThemes: list, auto: false, ...styleParams(imported.style) }).then((done) => {
      if (done !== undefined) setNotice(`Tema “${imported.name}” importado y aplicado.`);
    });
  }

  function importTheme() {
    clean();
    const parsed = parseThemeFile(code);
    if (!parsed.ok) { setError(parsed.error); return; }
    applyImported(parsed.theme);
  }

  async function importFile(file: File | undefined) {
    clean();
    if (!file) return;
    if (file.size > 131072) { setError('El archivo del tema es demasiado grande.'); return; }
    try {
      const parsed = parseThemeFile(await file.text(), file.name);
      if (!parsed.ok) { setError(parsed.error); return; }
      applyImported(parsed.theme);
    } catch {
      setError('No se pudo leer el archivo del tema.');
    }
  }

  function removeTheme(theme: CustomTheme) {
    clean();
    const list = customThemes.filter((item) => item.id !== theme.id);
    const deletingActive = state.appearance.theme === 'custom' && state.appearance.custom?.id === theme.id;
    void run('appearance', { customThemes: list, ...(deletingActive ? { theme: 'gold', custom: null } : {}) }).then((done) => {
      if (done === undefined) return;
      if (deletingActive) setDraft(draftFromCurrent({ ...state, appearance: { ...state.appearance, theme: 'gold', custom: undefined } }));
      setNotice('Tema eliminado de este dispositivo.');
    });
  }

  return <div className="theme-manager-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section ref={dialogRef} tabIndex={-1} className="theme-manager" role="dialog" aria-modal="true" aria-label="Gestor de temas">
      <header className="theme-manager-head">
        <div><span className="eyebrow">GESTOR DE TEMAS</span><h2>Tu interfaz, tu firma.</h2><p>{THEME_PRESETS.length} paletas base, temas propios e importación de la comunidad.</p></div>
        <button type="button" className="icon-button" aria-label="Cerrar gestor de temas" onClick={close}><X size={19} /></button>
      </header>
      <div className="theme-preview" style={vars(preview)} aria-label="Vista previa local del tema">
        <div className="theme-preview-head"><span className="theme-preview-avatar" /><div><strong>WRGram</strong><small>Vista previa local · sin cuenta</small></div><i /></div>
        <div className="theme-preview-body">
          <span className="theme-preview-in">Hola, así se ve tu estilo.</span>
          <span className="theme-preview-out">Con tu acento y tus burbujas.<small>10:42</small></span>
        </div>
        <div className="theme-preview-foot"><span>Escribe un mensaje…</span><i /></div>
      </div>
      <div className="theme-manager-tabs" role="tablist" aria-label="Secciones del gestor">
        {([['presets', 'Temas'], ['wallpapers', 'Fondos'], ['create', 'Crear'], ['community', 'Comunidad'], ['saved', 'Mis temas']] as [Tab, string][]).map(([id, label]) => <button type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'selected' : ''} key={id} onClick={() => { clean(); setTab(id); }}>{t(label)}{id === 'saved' && customThemes.length > 0 && ` (${customThemes.length})`}</button>)}
      </div>
      <div className="theme-manager-body">
        {tab === 'presets' && <>
          {THEME_GROUPS.map((group) => <section className="theme-group" key={group.id}>
            <header><strong>{group.label}</strong><small>{group.description}</small></header>
            <div className="theme-preset-grid">{THEME_PRESETS.filter((item) => item.group === group.id).map((item) => {
              const palette = resolvePreset(item);
              const selected = state.appearance.theme === item.id;
              return <button type="button" key={item.id} className={`theme-preset ${selected ? 'selected' : ''}`} aria-pressed={selected} onClick={() => applyPreset(item.id)}>
                <span className="theme-preset-swatch" style={swatch(palette)}><i style={{ background: palette.accent }} /><i style={{ background: palette.outgoing }} /><i style={{ background: palette.surface }} /></span>
                <span><strong>{item.name}</strong><small>{item.description}</small></span>
                {selected ? <Check size={16} /> : <span className="theme-preset-scheme">{item.scheme === 'dark' ? 'Oscuro' : 'Claro'}</span>}
              </button>;
            })}</div>
          </section>)}
          <p className="theme-disclaimer">Paletas originales inspiradas en el estilo de otros clientes. WRGram no está afiliado a Telegram, TGX, Nekogram, Plus Messenger ni al resto, y no incluye su código ni sus recursos.</p>
        </>}
        {tab === 'wallpapers' && <WallpaperSettings owner={state.selfId} pattern={active.style?.wallpaper ?? state.appearance.wallpaper}/>}
        {tab === 'create' && <div className="theme-editor">
          <label className="field-label">Nombre del tema<input maxLength={40} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="Mi tema" /></label>
          <label className="field-label">Paleta base<select value={draft.base} onChange={(event) => {
            const base = presetById(event.target.value);
            if (!base) return;
            const palette = resolvePreset(base);
            setDraft({ ...draft, base: base.id, accent: palette.accent, canvas: palette.canvas, text: palette.text, outgoing: palette.outgoing });
          }}>{THEME_PRESETS.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.scheme === 'dark' ? 'oscuro' : 'claro'}</option>)}</select></label>
          <div className="theme-colors">
            {([['accent', 'Acento'], ['canvas', 'Fondo'], ['text', 'Texto'], ['outgoing', 'Burbuja propia']] as [keyof Pick<CustomThemeDraft, 'accent' | 'canvas' | 'text' | 'outgoing'>, string][]).map(([key, label]) => <label className="theme-color" key={key}><span>{label}</span><input type="color" value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })} /><code>{draft[key]}</code></label>)}
          </div>
          <div className="theme-style-grid">
            <label className="field-label">Tipografía<select value={draftStyle.fontFamily} onChange={(event) => setDraft({ ...draft, style: { ...draftStyle, fontFamily: event.target.value as ThemeStyle['fontFamily'] } })}>{THEME_FONTS.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</select></label>
            <label className="field-label">Fondo del chat<select value={draftStyle.wallpaper} onChange={(event) => setDraft({ ...draft, style: { ...draftStyle, wallpaper: event.target.value as ThemeStyle['wallpaper'] } })}>{THEME_WALLPAPERS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
            <label className="field-label">Tamaño del texto · {draftStyle.fontSize}px<input type="range" min={12} max={24} step={1} value={draftStyle.fontSize} onChange={(event) => setDraft({ ...draft, style: { ...draftStyle, fontSize: Number(event.target.value) } })} /></label>
            <label className="field-label">Radio de burbujas · {draftStyle.radius}px<input type="range" min={0} max={22} step={1} value={draftStyle.radius} onChange={(event) => setDraft({ ...draft, style: { ...draftStyle, radius: Number(event.target.value) } })} /></label>
            <label className="field-label">Desenfoque · {draftStyle.blur}px<input type="range" min={0} max={20} step={1} value={draftStyle.blur} onChange={(event) => setDraft({ ...draft, style: { ...draftStyle, blur: Number(event.target.value) } })} /></label>
          </div>
          <div className="theme-color-sample" style={vars(draftPalette)}><span>Así se verá tu paleta</span><strong>Mensaje recibido</strong><em>Mensaje propio con tu acento</em></div>
          {draftWarnings.length > 0 && <ul className="theme-warnings">{draftWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <div className="settings-actions">
            <button type="button" className="primary" onClick={() => applyDraft(true)}><Plus size={16} />Guardar en mis temas</button>
            <button type="button" className="secondary" onClick={() => applyDraft(false)}><RefreshCw size={16} />Aplicar vista previa</button>
            <button type="button" className="text-button" onClick={() => { const current = draftFromCurrent(state); setDraft({ ...current, id: draft.id, name: draft.name }); }}>Restablecer colores</button>
          </div>
          <p className="settings-note">El editor guarda colores, tipografía, fondo y nombre en este dispositivo. No envía el tema a Telegram ni a servidores de WRGram.</p>
        </div>}
        {tab === 'community' && <div className="theme-community">
          <div className="premium-inline"><Crown size={20} /><div><strong>{THEME_PREMIUM.badge}</strong><p>{THEME_PREMIUM.note}</p></div></div>
          <label className="field-label">Importar un tema<textarea className="theme-code" rows={5} maxLength={8192} value={code} onChange={(event) => setCode(event.target.value)} placeholder="Pega un código de WRGram, un enlace wrgram://theme/… o colores de un tema .attheme…" /></label>
          <label className="secondary theme-file-button"><Upload size={16} />Importar archivo .attheme, .tdesktop-theme o .json<input type="file" accept=".attheme,.tdesktop-theme,.palette,.json,.txt" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <div className="settings-actions"><button type="button" className="primary" disabled={!code.trim()} onClick={importTheme}><Upload size={16} />Importar y aplicar</button><button type="button" className="secondary" disabled={!code.trim()} onClick={() => { setCode(''); clean(); }}>Limpiar</button></div>
          {warnings.length > 0 && <ul className="theme-warnings">{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
          <section className="theme-share">
            <strong>Compartir un tema</strong>
            <p className="settings-note">“{active.name}” se comparte como código o enlace. Solo contiene nombre, esquema, colores y estilo; nunca mensajes, cuenta ni tokens.</p>
            <div className="settings-actions">
              <button type="button" className="secondary" onClick={() => { const item = themeForShare(); if (item) void copyCode(item); }}><Copy size={16} />Copiar código</button>
              <button type="button" className="secondary" onClick={() => { const item = themeForShare(); if (item) void copyLink(item); }}><Link2 size={16} />Copiar enlace</button>
              <button type="button" className="secondary" onClick={() => { const item = themeForShare(); if (item) void shareTheme(item); }}><Share2 size={16} />Compartir</button>
              {active.custom && state.appearance.custom && <button type="button" className="text-button" onClick={() => editTheme(state.appearance.custom!)}><Pencil size={16} />Editar</button>}
              {!active.custom && <button type="button" className="text-button" onClick={() => { setDraft(draftFromCurrent(state)); setTab('create'); }}><Plus size={16} />Personalizar copia</button>}
            </div>
          </section>
          <p className="settings-note">Los códigos, enlaces y archivos se validan antes de aplicarse. Se guardan hasta {MAX_CUSTOM_THEMES} temas propios; el resto se descarta.</p>
        </div>}
        {tab === 'saved' && <div className="theme-saved">
          {customThemes.length === 0 ? <div className="theme-empty"><Crown size={26} /><strong>Aún no tienes temas propios</strong><p>Crea uno desde “Crear” o importa un código desde “Comunidad”.</p><button type="button" className="secondary" onClick={() => { setDraft(draftFromCurrent(state)); setTab('create'); }}><Plus size={16} />Crear tema</button></div> : customThemes.map((theme) => {
            const selected = state.appearance.theme === 'custom' && state.appearance.custom?.id === theme.id;
            return <article className={`theme-saved-row ${selected ? 'selected' : ''}`} key={theme.id}>
              <span className="theme-preset-swatch" style={swatch(theme.palette)}><i style={{ background: theme.palette.accent }} /><i style={{ background: theme.palette.outgoing }} /><i style={{ background: theme.palette.surface }} /></span>
              <div><strong>{theme.name}{selected && <em> · activo</em>}</strong><small>{theme.scheme === 'dark' ? 'Oscuro' : 'Claro'}{theme.base ? ` · base ${presetById(theme.base)?.name ?? theme.base}` : ''}{theme.author ? ` · ${theme.author}` : ''}</small></div>
              <div className="theme-saved-actions">
                <button type="button" className="text-button" onClick={() => applySaved(theme)}>Aplicar</button>
                <button type="button" className="text-button" onClick={() => editTheme(theme)}>Editar</button>
                <button type="button" className="text-button" aria-label={`Copiar ${theme.name}`} onClick={() => void copyCode(theme)}><Copy size={14} /></button>
                <button type="button" className="text-button" aria-label={`Copiar enlace de ${theme.name}`} onClick={() => void copyLink(theme)}><Link2 size={14} /></button>
                <button type="button" className="text-button" aria-label={`Compartir ${theme.name}`} onClick={() => void shareTheme(theme)}><Share2 size={14} /></button>
                <button type="button" className="text-button text-danger" aria-label={`Eliminar ${theme.name}`} onClick={() => removeTheme(theme)}><Trash2 size={14} /></button>
              </div>
            </article>;
          })}
          <p className="theme-disclaimer">Los temas propios son archivos de apariencia locales. No incluyen mensajes, cuentas, tokens ni datos de Telegram.</p>
        </div>}
      </div>
      <footer className="theme-manager-foot">
        {notice && <p className="theme-feedback" role="status"><Check size={15} />{notice}</p>}
        {error && <p className="theme-feedback is-error" role="alert">{error}</p>}
        <button type="button" className="secondary" onClick={close}>Cerrar</button>
      </footer>
    </section>
  </div>;
}
