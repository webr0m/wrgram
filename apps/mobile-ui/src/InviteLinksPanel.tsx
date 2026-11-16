import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Link2, LoaderCircle, Pencil, Plus, X } from 'lucide-react';
import { Modal } from './dialogs';
import { request } from './bridge';
import { useLanguage } from './language';
import type { Chat, InviteLink, InviteLinkPage, LinkForm } from './contract';
import {
  DURATIONS, advanceCursor, canEdit, canRevoke, cursorFor, emptyForm, formOf, formProblem,
  linkCountLabel, linkSummary, linkTitle, mergeLinks,
} from './inviteLinkModel';
import './invite-links.css';

type Draft = { mode: 'create'; form: LinkForm } | { mode: 'edit'; link: InviteLink; form: LinkForm };

/**
 * Enlaces de invitación propios de un grupo o canal. Telegram decide quién los ve y quién los cambia:
 * el nativo pide el permiso antes de listar y lo revalida al crear, editar o revocar, siempre con
 * confirmación en pantalla. Revocar no expulsa a nadie: solo deja sin efecto el enlace.
 */
export function InviteLinksPanel({ chat, accountId, close }: { chat: Chat; accountId: string; close(): void }) {
  const { t } = useLanguage();
  const [revoked, setRevoked] = useState(false);
  const [rows, setRows] = useState<InviteLink[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState('');
  const [draft, setDraft] = useState<Draft>();
  const ticket = useRef(0);

  // `t` cambia en cada render: fuera de las dependencias para no relanzar la carga en bucle.
  const load = useCallback(async (marker: string, showing: boolean) => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const page = await request<InviteLinkPage>('chat.invitelinks', marker ? { id: chat.id, revoked: showing, cursor: marker } : { id: chat.id, revoked: showing });
      if (current !== ticket.current) return;
      if (!page || !Array.isArray(page.links)) throw new Error('No se pudieron cargar los enlaces de invitación.');
      setRows(previous => marker ? mergeLinks(previous, page.links) : page.links);
      setTotal(page.total);
      setCursor(marker ? advanceCursor(marker, page) : cursorFor(page));
    } catch (reason) {
      if (current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudieron cargar los enlaces de invitación.');
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }, [chat.id]);

  useEffect(() => { void load('', revoked); }, [load, revoked]);

  /** Un solo viaje de escritura: `link` vacío crea y los ajustes del formulario viajan tal cual. */
  async function send(method: string, params: Record<string, unknown>, busyKey: string, done: string) {
    if (working) return;
    setWorking(busyKey);
    setError('');
    setNotice('');
    try {
      const applied = await request<boolean>(method, { id: chat.id, accountId, ...params });
      // false llega al cancelar la confirmación nativa: en Telegram no ha cambiado nada.
      if (!applied) return;
      setNotice(done);
      setDraft(undefined);
      // Crear, editar o revocar cambia el orden de la lista: se vuelve a pedir desde el principio.
      await load('', revoked);
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'Telegram no confirmó el cambio.');
    } finally {
      setWorking('');
    }
  }

  function submit(form: LinkForm, mode: 'create' | 'edit', link?: string) {
    const problem = formProblem(form);
    if (problem) { setError(problem); return; }
    void send(mode === 'create' ? 'chat.invitelink.create' : 'chat.invitelink.edit',
      { link, name: form.name, expiresIn: form.expiresIn, memberLimit: form.approval ? 0 : form.memberLimit, approval: form.approval },
      link ?? 'crear',
      'Telegram ha aplicado los ajustes del enlace.');
  }

  async function copy(link: string) {
    const done = await request<boolean>('clipboard.copy', { text: link });
    if (done) setNotice('Enlace copiado al portapapeles.');
  }

  const form = draft?.form;
  const invalid = form ? formProblem(form) : '';

  return <Modal title={`${t('Enlaces de invitación')} · ${chat.title}`} close={close} className="invite-links">
    <p className="settings-note">{t('Enlaces creados por esta cuenta. Cualquier persona con uno válido puede entrar salvo que exija aprobación; revocar no expulsa a quien ya está dentro.')}</p>
    <div className="invite-tabs">
      <button type="button" className={revoked ? '' : 'is-on'} disabled={busy} onClick={() => { setDraft(undefined); setRevoked(false); }}>{t('Activos')}</button>
      <button type="button" className={revoked ? 'is-on' : ''} disabled={busy} onClick={() => { setDraft(undefined); setRevoked(true); }}>{t('Revocados')}</button>
    </div>
    <p className="invite-total">{linkCountLabel(total, rows.length, revoked)}</p>

    {!revoked && !draft && <button type="button" className="invite-new" disabled={busy || !!working} onClick={() => setDraft({ mode: 'create', form: emptyForm() })}>
      <Plus size={14}/><span>{t('Crear enlace con opciones')}</span>
    </button>}

    {draft && form && <form className="invite-form" onSubmit={event => {
      event.preventDefault();
      submit(form, draft.mode, draft.mode === 'edit' ? draft.link.link : undefined);
    }}>
      <strong>{draft.mode === 'create' ? t('Nuevo enlace') : t('Cambiar enlace')}</strong>
      <label>{t('Nombre')}<input value={form.name} maxLength={32} dir="auto" disabled={!!working}
        placeholder={t('Opcional, hasta 32 caracteres')} onChange={event => setDraft({ ...draft, form: { ...form, name: event.target.value } })}/></label>
      <label>{t('Caduca en')}<select value={form.expiresIn} disabled={!!working}
        onChange={event => setDraft({ ...draft, form: { ...form, expiresIn: Number(event.target.value) } })}>
        {DURATIONS.map(option => <option key={option.seconds} value={option.seconds}>{t(option.label)}</option>)}
      </select></label>
      <label>{t('Límite de miembros a la vez')}<input type="number" min={0} max={99999} step={1} value={form.memberLimit} disabled={!!working || form.approval}
        onChange={event => setDraft({ ...draft, form: { ...form, memberLimit: Math.max(0, Math.floor(Number(event.target.value) || 0)) } })}/></label>
      <label className="invite-check"><input type="checkbox" checked={form.approval} disabled={!!working}
        onChange={event => setDraft({ ...draft, form: { ...form, approval: event.target.checked, memberLimit: event.target.checked ? 0 : form.memberLimit } })}/>
        <span>{t('Pedir aprobación antes de dejar entrar')}</span></label>
      {invalid && <p className="settings-note settings-error" role="alert">{invalid}</p>}
      <div className="invite-form-actions">
        <button type="submit" className="invite-save" disabled={!!working || !!invalid}>
          {working ? <LoaderCircle size={14} className="spin"/> : <Link2 size={14}/>}<span>{draft.mode === 'create' ? t('Crear enlace') : t('Guardar cambios')}</span>
        </button>
        <button type="button" className="invite-cancel" disabled={!!working} onClick={() => setDraft(undefined)}>{t('Cancelar')}</button>
      </div>
      <p className="settings-note">{t('La confirmación definitiva la da Telegram en pantalla antes de escribir nada.')}</p>
    </form>}

    {error ? <div className="invite-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load(cursor, revoked)}>{t('Reintentar')}</button>
    </div> : <div className="invite-list">
      {busy && !rows.length ? <p className="invite-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Consultando los enlaces en Telegram…')}</span></p> : null}
      {!busy && !rows.length ? <p className="invite-state">{revoked ? t('No tienes enlaces revocados en este chat.') : t('Todavía no has creado enlaces en este chat.')}</p> : null}
      {rows.map(item => <div className="invite-row" key={item.link}>
        <span className="invite-who">
          <strong dir="auto">{linkTitle(item)}</strong>
          <input readOnly dir="ltr" value={item.link} onFocus={event => event.currentTarget.select()} aria-label={t('Enlace de invitación')}/>
          <small>{linkSummary(item, Date.now() / 1000)}</small>
        </span>
        <span className="invite-actions">
          <button type="button" className="invite-copy" disabled={!!working} aria-label={`${t('Copiar')} ${linkTitle(item)}`} onClick={() => void copy(item.link)}>
            <Copy size={14}/><span>{t('Copiar')}</span>
          </button>
          {canEdit(item) && <button type="button" className="invite-edit" disabled={!!working} aria-label={`${t('Editar')} ${linkTitle(item)}`}
            onClick={() => { setError(''); setDraft({ mode: 'edit', link: item, form: formOf(item, Date.now() / 1000) }); }}>
            <Pencil size={14}/><span>{t('Editar')}</span>
          </button>}
          {canRevoke(item) && <button type="button" className="invite-revoke" disabled={!!working} aria-label={`${t('Revocar')} ${linkTitle(item)}`}
            onClick={() => void send('chat.invitelink.revoke', { link: item.link }, item.link, 'El enlace ha quedado revocado en Telegram.')}>
            {working === item.link ? <LoaderCircle size={14} className="spin"/> : <X size={14}/>}<span>{t('Revocar')}</span>
          </button>}
        </span>
      </div>)}
      {notice ? <p className="invite-state" role="status">{notice}</p> : null}
      {cursor ? <button type="button" className="invite-more" disabled={busy || !!working} onClick={() => void load(cursor, revoked)}>
        <Link2 size={14}/><span>{t('Cargar más enlaces')}</span>
      </button> : null}
    </div>}
    <p className="settings-note">{t('WRGram solo lista los enlaces creados por esta cuenta; los de otros administradores los administra Telegram desde su propio perfil.')}</p>
  </Modal>;
}
