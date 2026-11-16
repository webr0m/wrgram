import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, UserPlus, X } from 'lucide-react';
import { Modal } from './dialogs';
import { request } from './bridge';
import { useLanguage } from './language';
import { advanceCursor, cursorFor, mergeRequests, requestCountLabel, requestedAgo } from './joinRequestModel';
import type { Chat, JoinRequest, JoinRequestPage } from './contract';
import './join-requests.css';

/**
 * Cola de solicitudes de ingreso de un grupo. Telegram decide quién puede verla y quién puede
 * responderla: el nativo pide el permiso antes de listar y lo vuelve a validar al decidir.
 * Aprobar o rechazar pasa siempre por una confirmación nativa y nunca se reintenta a ciegas.
 */
export function JoinRequestsPanel({ chat, accountId, close }: {
  chat: Chat;
  accountId: string;
  close(): void;
}) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<JoinRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(true);
  const [deciding, setDeciding] = useState('');
  const ticket = useRef(0);

  // `t` cambia en cada render: fuera de las dependencias para no relanzar la carga en bucle.
  const load = useCallback(async (marker: string) => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const page = await request<JoinRequestPage>('chat.requests', marker ? { id: chat.id, cursor: marker } : { id: chat.id });
      if (current !== ticket.current) return;
      if (!page || !Array.isArray(page.requests)) throw new Error('No se pudieron cargar las solicitudes de ingreso.');
      setRows(previous => marker ? mergeRequests(previous, page.requests) : page.requests);
      setTotal(page.total);
      setCursor(marker ? advanceCursor(marker, page) : cursorFor(page));
    } catch (reason) {
      if (current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudieron cargar las solicitudes de ingreso.');
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }, [chat.id]);

  useEffect(() => { void load(''); }, [load]);

  async function decide(item: JoinRequest, approve: boolean) {
    if (deciding) return;
    setDeciding(item.userId);
    setError('');
    setNotice('');
    try {
      const done = await request<boolean>('chat.request.answer', { id: chat.id, userId: item.userId, approve, accountId });
      // false llega al cancelar la confirmación nativa: no se ha tocado nada en Telegram.
      if (!done) return;
      setNotice(approve
        ? `${item.name || t('Usuario de Telegram')} entrará en el grupo cuando Telegram lo confirme.`
        : `${item.name || t('Usuario de Telegram')} ya no aparecerá en esta cola.`);
      // Al retirar una entrada la cola cambia de orden: se vuelve a pedir desde el principio, sin reutilizar el marcador.
      await load('');
    } catch (reason) {
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudo responder a la solicitud.');
    } finally {
      setDeciding('');
    }
  }

  return <Modal title={`${t('Solicitudes de ingreso')} · ${chat.title}`} close={close} className="join-requests">
    <p className="settings-note">{t('Personas que pidieron entrar en este chat. Telegram vuelve a comprobar tus permisos al aprobar o rechazar.')}</p>
    <p className="join-total">{requestCountLabel(total, rows.length)}</p>
    {error ? <div className="join-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load(cursor)}>{t('Reintentar')}</button>
    </div> : <div className="join-list">
      {busy && !rows.length ? <p className="join-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Consultando las solicitudes en Telegram…')}</span></p> : null}
      {!busy && !rows.length ? <p className="join-state">{t('No hay solicitudes pendientes en este chat.')}</p> : null}
      {rows.map(item => <div className="join-row" key={`${item.userId}:${item.date}`}>
        <span className="join-who">
          <strong dir="auto">{item.name || t('Usuario de Telegram')}</strong>
          <small>{requestedAgo(item.date, Date.now() / 1000)}{item.bio ? ` · ${item.bio}` : ''}</small>
        </span>
        <span className="join-actions">
          <button type="button" className="join-approve" disabled={!!deciding} aria-label={`${t('Aprobar')} ${item.name}`} onClick={() => void decide(item, true)}>
            {deciding === item.userId ? <LoaderCircle size={14} className="spin"/> : <Check size={14}/>}<span>{t('Aprobar')}</span>
          </button>
          <button type="button" className="join-decline" disabled={!!deciding} aria-label={`${t('Rechazar')} ${item.name}`} onClick={() => void decide(item, false)}>
            {deciding === item.userId ? <LoaderCircle size={14} className="spin"/> : <X size={14}/>}<span>{t('Rechazar')}</span>
          </button>
        </span>
      </div>)}
      {notice ? <p className="join-state" role="status">{notice}</p> : null}
      {cursor ? <button type="button" className="join-more" disabled={busy || !!deciding} onClick={() => void load(cursor)}><UserPlus size={14}/><span>{t('Cargar más solicitudes')}</span></button> : null}
    </div>}
    <p className="settings-note">{t('Aprobar añade la persona al grupo en Telegram; rechazar descarta solo su solicitud. Ninguna acción borra el historial.')}</p>
  </Modal>;
}
