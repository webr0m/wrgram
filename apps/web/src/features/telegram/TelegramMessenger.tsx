import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowDown, ArrowLeft, BadgeCheck, Check, CheckCheck, Info, LoaderCircle, LogOut, MessageSquareText, RefreshCw, Search, Send, ShieldCheck, X } from 'lucide-react';
import { LiveTelegramStore, type TelegramAdapter } from '@wrgram/telegram';
import { Avatar } from '../../components/Avatar';
import { Modal } from '../../components/Modal';

const CONNECTION_LABELS = { connected: 'Conectado a Telegram', connecting: 'Reconectando con Telegram…', updating: 'Sincronizando actualizaciones…', offline: 'Sin conexión con Telegram' };

export function TelegramMessenger({ adapter, displayName, onExit, exiting, exitError, variant = 'local', formatError }: {
  adapter: TelegramAdapter; displayName: string; onExit: () => void; exiting: boolean; exitError: string; variant?: 'local' | 'server'; formatError: (error: unknown) => string;
}) {
  const store = useMemo(() => new LiveTelegramStore(adapter, formatError), [adapter, formatError]);
  const server = variant === 'server';
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const [query, setQuery] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [mobileConversation, setMobileConversation] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [atBottom, setAtBottom] = useState(true);
  const [documentActive, setDocumentActive] = useState(() => document.visibilityState === 'visible' && document.hasFocus());
  const [showInfo, setShowInfo] = useState(false);
  const [typingError, setTypingError] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const initialScrollChat = useRef<string | null>(null);
  const anchorRef = useRef<{ id: string; top: number } | null>(null);
  const typingRef = useRef<{ chatId: string; time: number; timer: number } | null>(null);
  const active = state.chats.find((chat) => chat.id === state.activeId);
  const history = active ? state.histories[active.id] : undefined;
  const messages = history?.cache.items ?? [];
  const lastMessageId = messages.at(-1)?.id;
  const ready = state.connection === 'connected';
  const sending = active ? Boolean(state.sending[active.id]) : false;
  const anySending = Object.values(state.sending).some(Boolean);
  const draft = active ? drafts[active.id] ?? '' : '';
  const filtered = state.chats.filter((chat) => chat.title.toLocaleLowerCase('es').includes(query.trim().toLocaleLowerCase('es')) && (!unreadOnly || chat.unread > 0));

  useEffect(() => {
    store.start();
    return () => { store.stop(); };
  }, [store]);

  useEffect(() => {
    const update = () => setDocumentActive(document.visibilityState === 'visible' && document.hasFocus());
    window.addEventListener('focus', update); window.addEventListener('blur', update); document.addEventListener('visibilitychange', update);
    return () => { window.removeEventListener('focus', update); window.removeEventListener('blur', update); document.removeEventListener('visibilitychange', update); };
  }, []);

  useEffect(() => {
    return () => {
      const typing = typingRef.current;
      if (typing) { window.clearTimeout(typing.timer); void adapter.setTyping(typing.chatId, false).catch(() => undefined); typingRef.current = null; }
    };
  }, [active?.id, adapter]);

  useLayoutEffect(() => {
    const node = scrollRef.current;
    if (!node || !active || !history?.loaded) return;
    if (anchorRef.current) {
      if (history.loading) return;
      const anchor = Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find((element) => element.dataset.messageId === anchorRef.current!.id);
      if (anchor) node.scrollTop += anchor.getBoundingClientRect().top - anchorRef.current.top;
      anchorRef.current = null;
      return;
    }
    if (initialScrollChat.current !== active.id || atBottom) {
      node.scrollTop = node.scrollHeight;
      initialScrollChat.current = active.id;
      setAtBottom(true);
    }
  }, [active?.id, messages.length, lastMessageId, history?.loaded, history?.loading, atBottom]);

  useEffect(() => {
    if (!ready || !active || !history?.loaded || history.loading || !atBottom || !documentActive) return;
    if (window.matchMedia('(max-width: 740px)').matches && !mobileConversation) return;
    const maxId = Math.max(0, ...messages.map((message) => message.messageId));
    if (maxId) void store.markRead(active.id, maxId);
  }, [active?.id, history?.loaded, history?.loading, lastMessageId, ready, atBottom, documentActive, mobileConversation, state.chats, store]);

  function stopTyping() {
    const typing = typingRef.current;
    if (!typing) return;
    window.clearTimeout(typing.timer); typingRef.current = null;
    void adapter.setTyping(typing.chatId, false).catch(() => undefined);
  }

  function changeDraft(value: string) {
    if (!active) return;
    setDrafts((current) => ({ ...current, [active.id]: value }));
    if (!ready || !active.canSendText || !value.trim()) { stopTyping(); return; }
    const previous = typingRef.current;
    if (previous) window.clearTimeout(previous.timer);
    const now = Date.now();
    const chatId = active.id;
    if (!previous || previous.chatId !== chatId || now - previous.time >= 4000) {
      void adapter.setTyping(chatId, true).then(() => setTypingError('')).catch(() => setTypingError('Telegram no pudo confirmar el estado de escritura.'));
    }
    typingRef.current = { chatId, time: previous && previous.chatId === chatId && now - previous.time < 4000 ? previous.time : now, timer: window.setTimeout(stopTyping, 5000) };
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!active || !ready || !active.canSendText || !draft.trim() || sending || exiting) return;
    const chatId = active.id;
    const text = draft;
    stopTyping();
    if (await store.send(chatId, text)) {
      setDrafts((current) => current[chatId] === text ? { ...current, [chatId]: '' } : current);
      setAtBottom(true);
    }
  }

  function older() {
    if (!active || !history?.nextCursor || history.loading) return;
    const node = scrollRef.current;
    if (node) {
      const top = node.getBoundingClientRect().top;
      const anchor = Array.from(node.querySelectorAll<HTMLElement>('[data-message-id]')).find((element) => element.getBoundingClientRect().bottom > top + 6);
      if (anchor?.dataset.messageId) anchorRef.current = { id: anchor.dataset.messageId, top: anchor.getBoundingClientRect().top };
    }
    setAtBottom(false);
    void store.loadHistory(active.id, true);
  }

  return <section className="live-workspace" aria-label={server ? 'Cliente web de Telegram con TDLib' : 'Cliente local de Telegram real'}>
    <div className={`live-status-bar ${ready ? '' : 'live-offline'}`}><span><span className="live-status-dot" />{CONNECTION_LABELS[state.connection]}</span><span className="live-account-name">{displayName}</span><button className="text-button" onClick={() => setShowInfo(true)}><Info size={13} /> Límites de esta prueba</button><button className="text-button" disabled={exiting || anySending} onClick={onExit}><LogOut size={13} />{exiting ? 'Cerrando sesión…' : 'Cerrar sesión'}</button></div>
    {(state.error || exitError || typingError) && <div className="live-error" role="alert">{exitError || state.error || typingError}</div>}
    <div className={`messenger live-messenger ${mobileConversation ? 'mobile-conversation' : ''}`}>
      <aside className="chat-sidebar" aria-label="Conversaciones reales de Telegram">
        <div className="sidebar-title"><h1>Telegram <span>{state.chats.length}</span></h1><button className="icon-button" aria-label="Actualizar conversaciones reales" title="Actualizar conversaciones" disabled={state.loadingChats || !ready} onClick={() => { void store.loadChats(); }}><RefreshCw size={17} className={state.loadingChats ? 'spin' : ''} /></button></div>
        <div className="search-field"><Search size={16} /><input id="live-chat-search" aria-label="Buscar entre conversaciones cargadas" placeholder="Buscar entre chats cargados" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button aria-label="Limpiar búsqueda de chats" onClick={() => setQuery('')}><X size={13} /></button>}</div>
        <div className="chat-filters" role="group" aria-label="Filtrar chats reales"><button className={!unreadOnly ? 'selected' : ''} aria-pressed={!unreadOnly} onClick={() => setUnreadOnly(false)}>Todos</button><button className={unreadOnly ? 'selected' : ''} aria-pressed={unreadOnly} onClick={() => setUnreadOnly(true)}>No leídos</button></div>
        <div className="chat-section-label"><span>{server ? 'CUENTA REAL · SESIÓN DEL SERVIDOR' : 'CUENTA REAL · SOLO EN MEMORIA'}</span></div>
        <div className="chat-list">{filtered.map((chat) => <button className={`chat-item ${active?.id === chat.id ? 'chat-active' : ''}`} key={chat.id} aria-current={active?.id === chat.id ? 'true' : undefined} onClick={() => { stopTyping(); anchorRef.current = null; store.selectChat(chat.id); setMobileConversation(true); setAtBottom(true); }}>
          <Avatar chat={chat} /><span className="chat-item-content"><span className="chat-item-top"><span className="chat-name"><span className="chat-name-text">{chat.title}</span>{chat.verified && <BadgeCheck size={13} className="verified" />}</span><span className="chat-time">{chat.time}</span></span><span className="chat-item-bottom"><span className="chat-preview">{ready ? chat.preview || 'Sin mensajes recientes' : 'Esperando reconexión…'}</span>{chat.unread > 0 && <span className="unread-count">{chat.unread}</span>}</span></span>
        </button>)}
          {state.loadingChats && <p className="live-loading" role="status"><LoaderCircle size={16} className="spin" /> Cargando conversaciones…</p>}
          {!filtered.length && !state.loadingChats && <div className="list-empty"><MessageSquareText size={26} /><h3>{query || unreadOnly ? 'Sin coincidencias en los chats cargados' : 'No hay conversaciones cargadas'}</h3><p>Puedes cargar más conversaciones o actualizar la lista.</p></div>}
          {state.chatsCursor && <button className="secondary-button live-load-more" disabled={state.loadingChats || !ready} onClick={() => { void store.loadChats(true); }}>Cargar más conversaciones</button>}
        </div>
        <div className="sidebar-footer"><ShieldCheck size={12} /><span>{server ? 'TDLib en el servidor · Sin acceso de WR IA' : 'Telegram directo · Sin acceso de WR IA'}</span></div>
      </aside>
      <section className="conversation" aria-label={active ? `Conversación real: ${active.title}` : 'Selecciona una conversación real'}>
        {active ? <>
          <header className="conversation-header"><button className="icon-button mobile-back" aria-label="Volver a mis chats reales" onClick={() => { stopTyping(); setMobileConversation(false); }}><ArrowLeft size={20} /></button><Avatar chat={active} small /><div className="conversation-heading"><h2><span className="conversation-title">{active.title}</span>{active.verified && <BadgeCheck size={14} className="verified" />}</h2><p>{active.members}</p></div><button className="icon-button" aria-label="Actualizar historial de esta conversación" disabled={history?.loading || !ready} onClick={() => { void store.loadHistory(active.id); }}><RefreshCw size={17} /></button></header>
          <div className="message-scroll live-message-scroll" ref={scrollRef} onScroll={() => { const node = scrollRef.current; if (node) setAtBottom(node.scrollHeight - node.scrollTop - node.clientHeight < 64); }}>
            {!ready ? <div className="messages-empty"><LoaderCircle size={25} className="spin" /><p>El historial se volverá a cargar al reconectar. Si había un envío en curso, comprueba si llegó antes de repetirlo.</p></div> : <>
              {history?.nextCursor && <button className="secondary-button live-history-more" disabled={history.loading} onClick={older}>Cargar mensajes anteriores</button>}
              {history?.loading && <p className="live-loading" role="status"><LoaderCircle size={16} className="spin" /> Cargando historial…</p>}
              {history?.error && <div className="live-history-error" role="alert"><p>{history.error}</p><button className="text-button" disabled={history.loading} onClick={() => { void store.loadHistory(active.id, Boolean(history.loaded && history.nextCursor)); }}>Volver a intentar la lectura</button></div>}
              <div className="messages" role="log" aria-label="Mensajes reales de Telegram" aria-live="polite" aria-relevant="additions text">{messages.map((message, index) => {
                const date = new Date(message.sentAt).toLocaleDateString('es', { day: 'numeric', month: 'long', year: 'numeric' });
                const newDate = !index || new Date(messages[index - 1].sentAt).toDateString() !== new Date(message.sentAt).toDateString();
                const read = message.outgoing && active.kind === 'private' && !active.isSelf && message.messageId <= active.readOutgoingId;
                return <div key={message.id} data-message-id={message.id}>{newDate && <div className="date-divider"><span />{date}<span /></div>}<div className={`message-row ${message.outgoing ? 'message-outgoing' : ''}`}><div className={`message-bubble ${message.kind !== 'text' ? 'live-unsupported-message' : ''}`}>
                  {!message.outgoing && <span className="message-author">{message.sender}</span>}<p>{message.text}</p><span className="message-meta">{message.editedAt > 0 && <span>Editado</span>}<time dateTime={new Date(message.sentAt).toISOString()}>{message.time}</time>{message.outgoing && (read ? <CheckCheck size={14} aria-label="Telegram notificó la lectura" /> : <Check size={14} aria-label="Confirmado por Telegram" />)}</span>
                </div></div></div>;
              })}</div>
              {history?.loaded && !history.loading && !messages.length && <div className="messages-empty"><MessageSquareText size={28} /><p>No hay mensajes en esta conversación.</p></div>}
            </>}
          </div>
          {!atBottom && messages.length > 0 && <button className="live-jump-bottom secondary-button" onClick={() => { const node = scrollRef.current; if (node) node.scrollTop = node.scrollHeight; setAtBottom(true); }}><ArrowDown size={14} /> Ir al último mensaje</button>}
          <div className="composer-area">{!active.canSendText && <p className="live-readonly">{active.readOnlyReason}</p>}<form className="composer" onSubmit={(event) => { void send(event); }}><textarea aria-label={`Mensaje real para ${active.title}`} placeholder={active.canSendText ? 'Escribe un mensaje para enviar a Telegram…' : 'Conversación de solo lectura'} rows={1} maxLength={4096} value={draft} disabled={!ready || !active.canSendText || sending || exiting} onChange={(event) => changeDraft(event.target.value)} onBlur={stopTyping} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} /><button className="send-button" type="submit" aria-label={`Enviar mensaje real a ${active.title}`} disabled={!ready || !active.canSendText || !draft.trim() || sending || exiting}>{sending ? <LoaderCircle size={17} className="spin" /> : <Send size={17} />}</button></form><div className="composer-footer"><span>Cuenta real: este mensaje sí se envía a Telegram.</span><span>Enter enviar · Shift + Enter nueva línea</span></div></div>
        </> : <div className="live-empty-conversation"><span className="assistant-icon"><MessageSquareText size={25} /></span><h2>Tus conversaciones, en WRGram.</h2><p>Elige un chat para cargar su historial real.<br />Nada de esta cuenta se comparte con WR IA o los complementos.</p><button className="text-button" onClick={() => setShowInfo(true)}>Conocer los límites de esta versión <Info size={14} /></button></div>}
      </section>
    </div>
    {showInfo && <Modal title={server ? 'Telegram real, con sesión en el servidor.' : 'Telegram real, todavía en pruebas.'} eyebrow={server ? 'SESIÓN AISLADA EN EL SERVIDOR DE WRGRAM' : 'SOLO EN ESTE NAVEGADOR LOCAL'} onClose={() => setShowInfo(false)}>
      <p className="modal-description">{server
        ? 'Conversaciones, historial paginado y texto mediante TDLib. La sesión se ejecuta en el backend de WRGram; el navegador solo habla con nuestro servidor y nunca recibe el api_hash ni las claves de la base de datos.'
        : 'Conversaciones, historial paginado y texto mediante MTProto. La sesión y los borradores viven solo en memoria. Al salir usa Cerrar sesión; si se pierde la red, revisa Dispositivos en Telegram.'}</p>
      <div className="privacy-notice"><ShieldCheck size={18} /><p>{server
        ? 'La base TDLib de esta sesión usa una clave aleatoria y se elimina al cerrar sesión. El servidor puede procesar los mensajes mientras la sesión esté activa; ciérrala al terminar y no la uses en equipos compartidos.'
        : 'Los mensajes visibles al final del chat se marcan como leídos cuando esta ventana está activa. Se envía el estado de escritura. No hay modo fantasma.'}</p></div>
      <p className="modal-description">{server
        ? 'El servidor no escribe teléfono, códigos, contraseñas ni textos de mensajes en sus registros. Si el proceso se reinicia, las sesiones se destruyen y la autorización debe revocarse desde Dispositivos en Telegram si no se pudo cerrar antes.'
        : 'El contenido temporal se muestra como marcador y no se descarga. Los mensajes eliminados se retiran al recibir la actualización; al reconectar se descarta la caché del historial para no mostrar versiones obsoletas.'}</p>
      <p className="modal-description">Los canales son de solo lectura. Multimedia, temas de foros, llamadas, chats secretos, mensajes patrocinados y funciones completas siguen pendientes. WR IA y los plugins no reciben estos datos. Esta interfaz sigue excluida de la publicación pública y no debe ser todavía tu cliente habitual.</p>
    </Modal>}
  </section>;
}
