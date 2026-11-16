import { useState } from 'react';
import { LoaderCircle, RotateCcw, Trash2 } from 'lucide-react';
import { request, snapshot } from './bridge';
import { useLanguage } from './language';
import { canDelete, canRetry, noticeOf, retryProblem, waiting } from './unsentMessages';
import type { Message } from './contract';
import './unsent-message.css';

/**
 * Lo que se puede hacer con un mensaje propio que Telegram todavía no tiene. No hay estados
 * inventados: el botón de reintentar solo aparece cuando `MessageSendingStateFailed.canRetry` lo
 * autoriza y los otros cuatro campos del fallo no lo condicionan; quitar el mensaje siempre pasa
 * por el diálogo nativo y por el `GetMessageProperties` que TDLib exige. Un botón que el puente
 * rechazaría se sustituye por la frase con la que lo rechaza, para no prometer dos veces lo mismo.
 */
export function UnsentActions({ message, accountId }: { message: Message; accountId: string }) {
  const { t } = useLanguage();
  const [working, setWorking] = useState<'retry' | 'delete' | ''>('');
  const [note, setNote] = useState('');
  const pending = message.unsent?.pending === true;

  async function act(kind: 'retry' | 'delete') {
    if (working) return;
    if (snapshot().selfId !== accountId) { setNote('La cuenta cambió. Vuelve a abrir la conversación.'); return; }
    setWorking(kind);
    setNote('');
    try {
      // `false` es el «Cancelar» del diálogo nativo: en Telegram no se ha tocado nada y no hay aviso.
      const applied = await request<boolean>(kind === 'retry' ? 'message.retry' : 'message.unsent.delete', { id: message.id, accountId });
      if (applied === true) setNote(kind === 'retry' ? 'Telegram volvió a aceptar el mensaje.' : 'El mensaje quedó fuera de esta conversación.');
    } catch (reason) {
      setNote(reason instanceof Error && reason.message ? reason.message : 'Telegram no respondió. Comprueba el estado del mensaje antes de repetirlo.');
    } finally {
      setWorking('');
    }
  }

  if (!waiting(message) || !message.unsent) return null;
  const blocked = retryProblem(message);
  return <div className="unsent-actions" role="group" aria-label={t('Mensaje sin enviar')}>
    <p className="unsent-notice" dir="auto">{t(noticeOf(message))}</p>
    <div className="unsent-buttons">
      {!pending && canRetry(message) && <button type="button" disabled={working !== ''} onClick={() => void act('retry')}>
        {working === 'retry' ? <LoaderCircle size={13} className="spin"/> : <RotateCcw size={13}/>}<span>{t('Reintentar envío')}</span>
      </button>}
      {!pending && blocked && <p className="unsent-blocked" dir="auto">{t(blocked)}</p>}
      {canDelete(message) && <button type="button" className="unsent-remove" disabled={working !== ''} onClick={() => void act('delete')}>
        {working === 'delete' ? <LoaderCircle size={13} className="spin"/> : <Trash2 size={13}/>}<span>{t(pending ? 'Descartar envío' : 'Quitar mensaje')}</span>
      </button>}
    </div>
    {note && <p className="unsent-note" role="status">{t(note)}</p>}
  </div>;
}
