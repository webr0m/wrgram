import { useCallback, useEffect, useRef, useState } from 'react';
import { LoaderCircle, ShieldCheck, ShieldQuestion, X } from 'lucide-react';
import { Modal } from './dialogs';
import { request, snapshot } from './bridge';
import { useLanguage } from './language';
import { ReportAction } from './ReportAction';
import { noticeActions, noticeCopy, safetyDigest, signalList } from './safetySignals';
import type { Chat, SafetyInfo, SafetyNotice } from './contract';
import './safety-signals.css';

type Run = <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;

/** El aviso que Telegram pidió mostrar, traducido sin añadir ninguna opinión sobre la otra parte. */
export function SafetyBar({ chat, open }: { chat: Chat; open(): void }) {
  const { t } = useLanguage();
  const notice = chat.notice;
  if (!notice) return null;
  return <aside className={`safety-bar ${notice.tone}`} aria-label={t('Aviso de Telegram sobre este chat')}>
    {notice.tone === 'warn' ? <ShieldQuestion size={17}/> : <ShieldCheck size={17}/>}
    <span dir="auto">{noticeCopy(notice)}</span>
    <button type="button" onClick={open}>{t('Señales de seguridad')}</button>
  </aside>;
}

/**
 * Todo lo que Telegram ya dijo de este chat: su barra de acciones, la verificación, las
 * restricciones y los matices del perfil. WRGram no puntúa reputación ni decide si alguien
 * es de fiar; se limita a mostrar los datos del servidor y a ofrecer la acción que ese mismo
 * dato autoriza. Descartar el aviso es el único write y siempre pasa por la confirmación nativa.
 */
export function SafetyPanel({ chat, accountId, run, close }: { chat: Chat; accountId: string; run: Run; close(): void }) {
  const { t } = useLanguage();
  const [info, setInfo] = useState<SafetyInfo>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [working, setWorking] = useState(false);
  const [dismissed, setDismissed] = useState('');
  const ticket = useRef(0);
  const alive = useRef(true);
  const account = useRef(accountId);

  // `t` cambia en cada render: fuera de las dependencias para no relanzar la lectura en bucle.
  const load = useCallback(async () => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const data = await request<SafetyInfo>('chat.safety', { id: chat.id, accountId: account.current });
      if (!alive.current || current !== ticket.current) return;
      if (!data || !Array.isArray(data.signals)) throw new Error('No se pudieron leer las señales de seguridad.');
      setInfo(data);
    } catch (reason) {
      if (!alive.current || current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudieron leer las señales de seguridad.');
    } finally {
      if (alive.current && current === ticket.current) setBusy(false);
    }
  }, [chat.id]);

  useEffect(() => {
    alive.current = true;
    void load();
    return () => { alive.current = false; };
  }, [load]);

  async function dismiss() {
    if (working) return;
    if (snapshot().selfId !== account.current) { setError('La cuenta cambió. Vuelve a abrir las señales.'); return; }
    setWorking(true);
    setError('');
    setDismissed('');
    try {
      // false es «Cancelar» en el diálogo nativo: en Telegram no se ha descartado nada.
      const applied = await request<boolean>('chat.safety.dismiss', { id: chat.id, accountId: account.current });
      if (!alive.current || !applied) return;
      setDismissed('El aviso de Telegram dejó de mostrarse en esta conversación.');
      await load();
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error && reason.message ? reason.message : 'No se pudo descartar el aviso.');
    } finally {
      if (alive.current) setWorking(false);
    }
  }

  // Antes de la respuesta se pinta el aviso que ya traía el chat; después manda Telegram,
  // porque descartar deja el chat sin aviso y el objeto `chat` es el que se abrió.
  const notice: SafetyNotice | undefined = info ? info.notice : chat.notice;
  const actions = noticeActions(notice, info?.dismissible);
  const canReport = info?.canReport === true && chat.type !== 'secret';
  const signals = signalList(info?.signals);

  return <Modal title={`${t('Señales de seguridad')} · ${chat.title}`} close={close} className="safety-panel">
    <p className="settings-note">{t('WRGram no calcula reputación: traduce las señales que Telegram ya informó de este chat. La decisión de confiar es tuya.')}</p>

    {error && <div className="safety-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load()}>{t('Reintentar')}</button>
    </div>}

    {busy && !info && !error && <p className="safety-state" role="status"><LoaderCircle size={14} className="spin"/><span>{t('Consultando a Telegram…')}</span></p>}

    {notice && <div className={`safety-notice ${notice.tone}`}>
      <span className="safety-notice-head">{notice.tone === 'warn' ? <ShieldQuestion size={16}/> : <ShieldCheck size={16}/>}<strong>{t('Aviso de Telegram')}</strong></span>
      <p dir="auto">{noticeCopy(notice)}</p>
    </div>}

    {!notice && info && !busy && <p className="safety-quiet">{t('Telegram no muestra ningún aviso en este chat.')}</p>}

    {signals.length > 0 && <ul className="safety-list">
      {signals.map(signal => <li key={signal.id} className={`safety-signal ${signal.tone}`}>
        <i aria-hidden="true"/><span dir="auto">{signal.text}</span>
      </li>)}
    </ul>}

    {info && !busy && <p className="safety-digest">{safetyDigest(info)}</p>}

    {(canReport || actions.dismiss) && <div className="safety-actions">
      {canReport && <ReportAction id={chat.id} run={run}/>}
      {actions.dismiss && <button type="button" className="safety-dismiss" disabled={working} onClick={() => void dismiss()}>
        {working ? <LoaderCircle size={16} className="spin"/> : <X size={16}/>}<span>{t('Descartar este aviso')}</span>
      </button>}
    </div>}

    {dismissed && <p className="settings-note" role="status">{dismissed}</p>}
    {actions.unarchive && <p className="settings-note">{t('Telegram archivó este chat automáticamente: sacarlo del archivado vuelve a mostrarlo en la lista principal.')}</p>}
    <p className="settings-note">{t('Las señales viajan cifradas desde Telegram y no se envían a ningún servidor de WRGram. Un chat puede tener todas las insignias y aun así convenir revisar lo que dice.')}</p>
  </Modal>;
}
