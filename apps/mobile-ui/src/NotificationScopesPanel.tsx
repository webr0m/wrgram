import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, LoaderCircle, RefreshCw, Undo2 } from 'lucide-react';
import { Modal } from './dialogs';
import { request, snapshot } from './bridge';
import { useLanguage } from './language';
import type { NotificationScopes, NotificationSound, ScopePatch, ScopeSettings } from './contract';
import {
  DEFAULT_SOUND, MUTE_CHOICES, SCOPE_IDS, SCOPE_TITLES, SILENT_SOUND, emptyPatch, keepOption, missingScopes, muteKeepLabel,
  patchProblem, pendingChanges, scopeMap, soundLabel, storyCaveat, summaryOf, unset,
} from './scopeSettings';
import './notification-scopes.css';

type PatchKey = keyof ScopePatch;

/** Un alcance: sus controles, su resumen y su única escritura. Así el diálogo nativo describe una sola cosa. */
function ScopeCard({ settings, sounds, patch, title, working, onEdit, onKeep, onSave }: {
  settings: ScopeSettings;
  sounds: NotificationSound[];
  patch: ScopePatch;
  title: string;
  working: boolean;
  onEdit(key: PatchKey, value: string | number | boolean): void;
  onKeep(key: PatchKey): void;
  onSave(): void;
}) {
  const { t } = useLanguage();
  const mute = patch.muteFor !== undefined ? String(patch.muteFor) : 'keep';
  const sound = patch.sound ?? 'keep';
  const storySound = patch.storySound ?? 'keep';
  const changes = pendingChanges(settings, patch, sounds);
  const problem = patchProblem(patch, sounds);
  const caveat = storyCaveat(settings);

  return <section className="scope-card">
    <header>
      <strong>{t(title)}</strong>
      <span>{summaryOf(settings, sounds)}</span>
    </header>

    <label className="scope-field">
      <span>{t('Silencio')}</span>
      <select value={mute} disabled={working} onChange={event => {
        if (event.target.value === 'keep') { onKeep('muteFor'); onKeep('muted'); return; }
        const seconds = Number(event.target.value);
        onEdit('muteFor', seconds);
        onEdit('muted', seconds > 0);
      }}>
        <option value="keep">{t(keepOption(muteKeepLabel(settings.muteFor)))}</option>
        {MUTE_CHOICES.map(choice => <option key={choice.seconds} value={choice.seconds}>{t(choice.label)}</option>)}
      </select>
    </label>

    <label className="scope-field">
      <span>{t('Sonido')}</span>
      <select value={sound} disabled={working} onChange={event => {
        if (event.target.value === 'keep') { onKeep('sound'); return; }
        onEdit('sound', event.target.value);
      }}>
        <option value="keep">{t(keepOption(soundLabel(settings.sound, sounds)))}</option>
        <option value={DEFAULT_SOUND}>{t('El sonido de la aplicación')}</option>
        <option value={SILENT_SOUND}>{t('Sin sonido')}</option>
        {sounds.map(item => <option key={item.id} value={item.id}>{item.title || t('Sonido guardado')}</option>)}
      </select>
    </label>

    <label className={'toggle-row' + (working ? ' is-disabled' : '')}>
      <span><strong>{t('Mostrar el contenido del mensaje')}</strong><small>{t('Si se oculta, el aviso solo dice quién escribió.')}</small></span>
      <input type="checkbox" checked={patch.preview ?? settings.preview} disabled={working}
        onChange={event => onEdit('preview', event.target.checked)}/><span className="switch" aria-hidden="true"/>
    </label>

    <label className={'toggle-row' + (working ? ' is-disabled' : '')}>
      <span><strong>{t('Avisar aparte los mensajes fijados')}</strong><small>{t('Si se quita, un mensaje fijado entra como cualquier no leído.')}</small></span>
      <input type="checkbox" checked={!(patch.quietPinned ?? settings.quietPinned)} disabled={working}
        onChange={event => onEdit('quietPinned', !event.target.checked)}/><span className="switch" aria-hidden="true"/>
    </label>

    <label className={'toggle-row' + (working ? ' is-disabled' : '')}>
      <span><strong>{t('Avisar aparte cuando te mencionan')}</strong><small>{t('Si se quita, una mención entra como cualquier no leído.')}</small></span>
      <input type="checkbox" checked={!(patch.quietMentions ?? settings.quietMentions)} disabled={working}
        onChange={event => onEdit('quietMentions', !event.target.checked)}/><span className="switch" aria-hidden="true"/>
    </label>

    <label className={'toggle-row' + (working ? ' is-disabled' : '')}>
      <span><strong>{t('Silenciar las historias')}</strong><small>{caveat || t('Las historias avisan igual que los mensajes de este tipo de chat.')}</small></span>
      <input type="checkbox" checked={patch.muteStories ?? settings.muteStories} disabled={working || settings.storyDefault}
        onChange={event => onEdit('muteStories', event.target.checked)}/><span className="switch" aria-hidden="true"/>
    </label>

    {caveat ? <p className="settings-note settings-warn">{t(caveat)}</p> : <>
      <label className="scope-field">
        <span>{t('Sonido de las historias')}</span>
        <select value={storySound} disabled={working} onChange={event => {
          if (event.target.value === 'keep') { onKeep('storySound'); return; }
          onEdit('storySound', event.target.value);
        }}>
          <option value="keep">{t(keepOption(soundLabel(settings.storySound, sounds)))}</option>
          <option value={DEFAULT_SOUND}>{t('El sonido de la aplicación')}</option>
          <option value={SILENT_SOUND}>{t('Sin sonido')}</option>
          {sounds.map(item => <option key={item.id} value={item.id}>{item.title || t('Sonido guardado')}</option>)}
        </select>
      </label>
      <label className={'toggle-row' + (working ? ' is-disabled' : '')}>
        <span><strong>{t('Mostrar quién publica la historia')}</strong><small>{t('Si se oculta, el aviso no nombra al chat.')}</small></span>
        <input type="checkbox" checked={patch.storyPoster ?? settings.storyPoster} disabled={working}
          onChange={event => onEdit('storyPoster', event.target.checked)}/><span className="switch" aria-hidden="true"/>
      </label>
    </>}

    {changes.length > 0 && <div className="scope-pending">
      <p>{t('Cambiará')}: {changes.map(item => t(item)).join(', ')}.</p>
      {problem && <p className="settings-error" role="alert">{t(problem)}</p>}
      <div className="scope-actions">
        <button type="button" className="primary" disabled={working || !!problem} onClick={onSave}>
          {working ? <LoaderCircle size={15} className="spin"/> : <Bell size={15}/>}<span>{t('Aplicar en Telegram')}</span>
        </button>
        <button type="button" className="text-button" disabled={working} onClick={() => {
          (['muteFor', 'muted', 'sound', 'storySound', 'preview', 'muteStories', 'storyPoster', 'quietPinned', 'quietMentions'] as PatchKey[]).forEach(key => onKeep(key));
        }}><Undo2 size={14}/><span>{t('Deshacer cambios')}</span></button>
      </div>
    </div>}
  </section>;
}

/**
 * Ajustes de notificación que Telegram guarda por tipo de chat. La pantalla no decide valores por
 * defecto: cada control parte de lo que Telegram devolvió y solo viaja lo que se tocó, porque
 * `SetScopeNotificationSettings` sustituye el objeto completo. Los chats con ajuste propio no cambian.
 */
export function NotificationScopesPanel({ close }: { close(): void }) {
  const { t } = useLanguage();
  const [data, setData] = useState<NotificationScopes>();
  const [patches, setPatches] = useState<Record<string, ScopePatch>>({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState('');
  const ticket = useRef(0);
  const alive = useRef(true);
  const owner = useRef(snapshot().selfId);

  const load = useCallback(async () => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const result = await request<NotificationScopes>('notify.scopes', { accountId: owner.current });
      if (!alive.current || current !== ticket.current) return;
      if (!result || !Array.isArray(result.scopes) || !result.scopes.length) throw new Error('No se pudieron leer los ajustes de notificación de Telegram.');
      setData(result);
      const absent = missingScopes(result);
      if (absent.length) setError(`Telegram no devolvió los ajustes de ${absent.map(id => SCOPE_TITLES[id]).join(', ')}.`);
    } catch (reason) {
      if (!alive.current || current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudieron leer los ajustes de notificación de Telegram.');
    } finally {
      if (alive.current && current === ticket.current) setBusy(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  /** Una sola escritura por alcance: el diálogo nativo describe justo lo que va a cambiar. */
  async function save(scope: ScopeSettings, patch: ScopePatch) {
    if (working || busy) return;
    const problem = patchProblem(patch, data?.sounds ?? []);
    if (problem) { setError(problem); return; }
    if (snapshot().selfId !== owner.current) { setError('La cuenta cambió. Vuelve a abrir los ajustes de notificación.'); return; }
    setWorking(scope.scope);
    setError('');
    setNotice('');
    try {
      const applied = await request<ScopeSettings | false>('notify.scope.save', { scope: scope.scope, patch, accountId: owner.current });
      // false llega al cancelar la confirmación nativa: en Telegram no ha cambiado nada.
      if (applied === false) { setNotice('Cancelado. En Telegram no ha cambiado ningún ajuste.'); return; }
      if (!applied || typeof applied !== 'object' || applied.scope !== scope.scope) throw new Error('Telegram no confirmó el ajuste de notificación.');
      setData(current => ({ scopes: (current?.scopes ?? []).map(item => item.scope === applied.scope ? applied : item), sounds: current?.sounds ?? [] }));
      setPatches(current => ({ ...current, [applied.scope]: emptyPatch() }));
      setNotice(`Telegram guardó los ajustes de ${SCOPE_TITLES[applied.scope]}.`);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Telegram no confirmó el ajuste de notificación.');
    } finally {
      setWorking('');
    }
  }

  const { scopes, sounds } = scopeMap(data);
  // Refrescar no borra lo que se está editando: el borrador viaja igual, y el puente vuelve a leer
  // Telegram antes de escribir, así que un valor que ya cambió se detecta en vez de pisarse.
  const first = busy && !data;

  return <Modal title={t('Notificaciones por tipo de chat')} close={close} className="notification-scopes">
    <p className="settings-note">{t('Son los ajustes que Telegram guarda para los chats sin preferencia propia. Silenciar un chat concreto no se toca aquí, y nada se aplica a la inversa.')}</p>

    {first && <p className="scope-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Consultando los ajustes en Telegram…')}</span></p>}
    {busy && data && <p className="scope-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Actualizando desde Telegram…')}</span></p>}

    {!first && SCOPE_IDS.map(id => scopes[id] && <ScopeCard
      key={id}
      title={SCOPE_TITLES[id]}
      settings={scopes[id]}
      sounds={sounds}
      patch={patches[id] ?? emptyPatch()}
      working={working === id || busy}
      onEdit={(key, value) => { setNotice(''); setPatches(current => ({ ...current, [id]: { ...current[id], ...({ [key]: value }) } })); }}
      onKeep={key => { setNotice(''); setPatches(current => ({ ...current, [id]: unset(current[id] ?? emptyPatch(), key) })); }}
      onSave={() => { const patch = patches[id] ?? emptyPatch(); void save(scopes[id], patch); }}
    />)}

    {!first && error && <div className="scope-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load()}>{t('Reintentar')}</button>
    </div>}

    {notice && <p className="scope-state" role="status">{t(notice)}</p>}

    {!busy && missingScopes(data).length > 0 && <p className="settings-note settings-warn">
      {t('Faltan ajustes devueltos por Telegram; no se rellenan con valores de WRGram.')}
    </p>}

    <p className="settings-note">{t('El silencio «indefinido» lo administra Telegram: si alguien desilencia el alcance desde otro dispositivo, aquí aparece al actualizar.')}</p>

    <div className="scope-actions">
      <button type="button" className="text-button" disabled={busy} onClick={() => void load()}>
        <RefreshCw size={14}/><span>{t('Actualizar de Telegram')}</span>
      </button>
    </div>
  </Modal>;
}
