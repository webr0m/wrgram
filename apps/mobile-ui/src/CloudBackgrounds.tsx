import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { snapshot, subscribe } from './bridge';
import { Info, RefreshCw } from 'lucide-react';
import { useLanguage } from './language';
import {
  BACKGROUND_ANGLES, cloudBackgroundCss, cloudBackgroundLabel, cloudBackgroundNotice, cloudBackgroundParams,
  isPaintable, sortCloudBackgrounds, type CloudBackground, type CloudBackgroundDraft,
} from './cloud-backgrounds';
import './cloud-backgrounds.css';

type Run = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;

export function CloudBackgroundSettings({ dark, accent, canvas, platform, run }: {
  dark: boolean;
  accent: string;
  canvas: string;
  platform?: string;
  run: Run;
}) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<CloudBackground[] | undefined>(undefined);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<CloudBackgroundDraft>({ top: canvas, bottom: accent, angle: 0, gradient: false });
  const owner = useSyncExternalStore(subscribe, () => snapshot().selfId);
  const scope = owner + ':' + dark;
  const currentScope = useRef(scope);
  const request = useRef(0);
  currentScope.current = scope;

  async function load(message = '') {
    const token = ++request.current;
    const current = () => currentScope.current === scope && request.current === token;
    setError('');
    setBusy(true);
    try {
      const answer = await run<{ rows?: CloudBackground[] }>('backgrounds.list', { dark });
      if (!current()) return;
      if (answer?.rows) setRows(answer.rows); else setError('No se han podido leer los fondos de la cuenta.');
      setNotice(message);
    } catch {
      if (current()) setError('No se han podido leer los fondos de la cuenta.');
    } finally {
      if (current()) setBusy(false);
    }
  }

  useEffect(() => {
    setRows(undefined);
    setNotice('');
    void load();
    return () => { request.current++; };
  }, [dark, owner]);

  async function apply(row: CloudBackground) {
    const token = ++request.current;
    const current = () => currentScope.current === scope && request.current === token;
    setError('');
    setBusy(true);
    try {
      const answer = await run<CloudBackground>('background.set', { id: row.id, dark });
      if (!current()) return;
      if (answer === undefined) { setError('La cuenta no ha aceptado el fondo.'); return; }
      await load(isPaintable(answer)
        ? `Fondo «${cloudBackgroundLabel(answer)}» puesto y pintado.`
        : `Fondo «${cloudBackgroundLabel(answer)}» puesto en la cuenta, pero sigue sin pintarse en WRGram.`);
    } catch {
      if (current()) setError('La cuenta no ha aceptado el fondo.');
    } finally {
      if (current()) setBusy(false);
    }
  }

  async function create() {
    const params = cloudBackgroundParams(draft, dark);
    if (!params) { setError('Los colores tienen que estar en el formato de Telegram.'); return; }
    const token = ++request.current;
    const current = () => currentScope.current === scope && request.current === token;
    setError('');
    setBusy(true);
    try {
      const answer = await run<CloudBackground>('background.set', { ...params });
      if (!current()) return;
      if (answer === undefined) { setError('La cuenta no ha aceptado el fondo.'); return; }
      await load(`Fondo «${cloudBackgroundLabel(answer)}» creado en la cuenta y pintado.`);
    } catch {
      if (current()) setError('La cuenta no ha aceptado el fondo.');
    } finally {
      if (current()) setBusy(false);
    }
  }

  // Windows escribe el puesto con el bit `default_` de la propia lista, así que su marca no depende de ningún aviso;
  // Android no lo recibe en `GetInstalledBackgrounds` y lo saca del `UpdateDefaultBackground` que guardó.
  const chosen = platform === 'desktop'
    ? 'La marca de elegido la pone Telegram en la lista que se lee: cada lectura la trae fresca, también si el fondo se cambió en otro aparato o con WRGram cerrado.'
    : 'La marca de elegido la pone Telegram cuando la cuenta avisa un cambio; si el fondo se cambió con WRGram cerrado, la marca no se entera hasta el siguiente aviso o hasta el siguiente puesto desde aquí.';

  return <section className="cloud-backgrounds">
    <h3>{t('Fondos de tu cuenta')}</h3>
    <p className="settings-note">{t('A diferencia del fondo del chat, estos se guardan en tu cuenta de Telegram y los cambia solo aquí. Se ponen para el modo ' + (dark ? 'oscuro' : 'claro') + ' activo. ' + chosen)}</p>
    <div className="settings-actions">
      <button type="button" className="secondary" disabled={busy} onClick={() => load()}><RefreshCw size={16}/>{t('Leer fondos')}</button>
    </div>
    {rows === undefined && !busy && <p className="settings-note">{t('Sin leer todavía. Pulsa «Leer fondos» con la cuenta abierta.')}</p>}
    {rows !== undefined && rows.length === 0 && <p className="settings-note">{t('La cuenta no tiene ningún fondo instalado.')}</p>}
    {rows && rows.length > 0 && <div className="cloud-background-list" role="group" aria-label={t('Fondos de la cuenta')}>
      {sortCloudBackgrounds(rows).map(row => {
        const paint = cloudBackgroundCss(row);
        // La marca de serie solo se escribe donde la capa la sabe: MTProto no la manda y adivinarla sería afirmar.
        const marks = [row.dark ? t('Oscuro') : t('Claro')];
        if (row.stock !== null) marks.push(row.stock ? t('de serie') : t('de la cuenta'));
        marks.push(isPaintable(row) ? t('se pinta') : t('no se pinta'));
        return <button type="button" className="cloud-background-option" key={row.id}
        disabled={busy} aria-pressed={row.selected} onClick={() => apply(row)}>
        <span className="cloud-background-swatch" style={paint ? { background: paint } : undefined}
          data-cloud-kind={row.kind || 'unknown'}>{row.selected && <span className="cloud-background-check">✓</span>}</span>
        <strong>{t(cloudBackgroundLabel(row))}</strong>
        <small>{marks.join(' · ')}</small>
        {!isPaintable(row) && <small className="cloud-background-note"><Info size={13}/>{t(cloudBackgroundNotice(row))}</small>}
      </button>; })}
    </div>}
    {platform === 'android' && <>
      <div className="cloud-background-create">
        <label className="field-label">{t('Color arriba')}<input type="color" disabled={busy} value={draft.top}
          onChange={event => setDraft({ ...draft, top: event.target.value })}/></label>
        <label className="field-label cloud-background-toggle"><input type="checkbox" disabled={busy} checked={draft.gradient}
          onChange={event => setDraft({ ...draft, gradient: event.target.checked })}/>{t('Degradado')}</label>
        {draft.gradient && <label className="field-label">{t('Color abajo')}<input type="color" disabled={busy} value={draft.bottom}
          onChange={event => setDraft({ ...draft, bottom: event.target.value })}/></label>}
        {draft.gradient && <label className="field-label">{t('Giro')}<select disabled={busy} value={draft.angle}
          onChange={event => setDraft({ ...draft, angle: Number(event.target.value) })}>{BACKGROUND_ANGLES.map(angle => <option key={angle} value={angle}>{angle}°</option>)}</select></label>}
        <button type="button" className="primary" disabled={busy} onClick={create}>{t('Ponerlo en la cuenta')}</button>
      </div>
      <p className="settings-note">{t('Sin degradado se crea un fondo de un solo color; con él, el giro que Telegram admite: múltiplos de 45 grados.')}</p>
    </>}
    {/* La rama de colores del `background.set` de Windows se niega por su nombre, así que el formulario no se ofrece. */}
    {platform === 'desktop' && <p className="settings-note">{t('Windows solo pone fondos que la cuenta ya tiene: escribir uno nuevo por color exige subir una imagen, y ese paso no existe aquí. Elige uno de la lista.')}</p>}
    {notice && <p className="settings-note" role="status">{t(notice)}</p>}
    {error && <p className="settings-note settings-error" role="alert">{t(error)}</p>}
  </section>;
}
