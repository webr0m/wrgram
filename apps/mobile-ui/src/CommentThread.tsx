import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, MessageSquareText, Mic, Image as ImageIcon, Video } from 'lucide-react';
import { Modal } from './dialogs';
import { request } from './bridge';
import { useLanguage } from './language';
import { chronological, mediaLabel, mergeThread } from './commentThreadModel';
import type { Message, ThreadPage } from './contract';

/**
 * Índice del hilo de comentarios de un post. El chat de discusión lo elige Telegram en
 * `GetMessageThread`; cada fila abre ese mensaje exacto, donde ya existen el compositor,
 * los medios y las citas. Abrir comentarios nunca escribe nada en la cuenta.
 */
export function CommentThread({ root, close, openMessage }: {
  root: Message;
  close(): void;
  openMessage(chatId: string, messageId: string): void;
}) {
  const { t } = useLanguage();
  const [items, setItems] = useState<Message[]>([]);
  const [head, setHead] = useState<ThreadPage>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [more, setMore] = useState(false);
  const ticket = useRef(0);

  // `t` cambia en cada render: fuera de las dependencias para no relanzar la carga en bucle.
  const load = useCallback(async (before: string) => {
    const current = ++ticket.current;
    setBusy(true);
    setError('');
    try {
      const page = await request<ThreadPage>('thread.load', { id: root.chatId, messageId: root.id, before });
      if (current !== ticket.current) return;
      if (!page || !Array.isArray(page.messages) || !page.chatId) throw new Error('Telegram no devolvió los comentarios de este mensaje.');
      setHead(page);
      setItems(previous => before === '0' ? chronological(page.messages) : mergeThread(previous, page.messages));
      setMore(page.next === true);
    } catch (reason) {
      if (current !== ticket.current) return;
      setError(reason instanceof Error && reason.message ? reason.message : 'No se pudieron cargar los comentarios.');
    } finally {
      if (current === ticket.current) setBusy(false);
    }
  }, [root.chatId, root.id]);

  useEffect(() => { void load('0'); }, [load]);

  const newest = items.length ? items[items.length - 1] : undefined;
  const total = head?.comments ?? root.thread?.comments ?? 0;
  return <Modal title={`${t('Comentarios')} · ${total}`} close={close} className="comment-thread">
    <div className="thread-root">
      <strong>{root.sender}</strong>
      <p>{root.text || mediaLabel(root.media)}</p>
    </div>
    {error ? <div className="thread-state" role="status">
      <span>{error}</span>
      <button type="button" onClick={() => void load('0')}>{t('Reintentar')}</button>
    </div> : <div className="thread-list">
      {more ? <button type="button" className="thread-more" onClick={() => void load(items[0]?.id ?? '0')} disabled={busy}>{t('Cargar comentarios anteriores')}</button> : null}
      {busy && !items.length ? <p className="thread-state" role="status"><span>{t('Consultando los comentarios en Telegram…')}</span></p> : null}
      {!busy && !items.length ? <p className="thread-state"><span>{t('Todavía no hay comentarios.')}</span></p> : null}
      {items.map(item => <button type="button" key={item.id} className="thread-row" onClick={() => openMessage(item.chatId, item.id)}>
        <span className="thread-author">{item.sender}</span>
        {item.reply ? <span className="thread-quote"><MessageSquareText size={12}/>{item.reply}</span> : null}
        {item.text ? <span className="thread-text">{item.text}</span> : null}
        {item.media ? <span className="thread-media"><Icon media={item.media}/>{mediaLabel(item.media)}</span> : null}
        <time>{new Date(item.date * 1000).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</time>
      </button>)}
      {head ? <button type="button" className="thread-open" onClick={() => openMessage(head.chatId, (newest ?? head.messages[0])?.id ?? root.id)}>
        <MessageSquareText size={14}/><span>{t('Abrir la discusión')}</span>
      </button> : null}
    </div>}
  </Modal>;
}

function Icon({ media }: { media?: Message['media'] }) {
  if (media?.kind === 'video') return <Video size={13}/>;
  if (media?.kind === 'audio') return <Mic size={13}/>;
  if (media?.kind === 'file') return <FileText size={13}/>;
  return media ? <ImageIcon size={13}/> : null;
}
