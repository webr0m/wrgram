import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { Archive, ArrowDown, ArrowRight, BellOff, Bookmark, Bot, ChevronDown, LoaderCircle, LockKeyhole, MessageCircle, Pencil, Pin, Search } from 'lucide-react';
import type { Chat } from './contract';
import { request } from './bridge';
import { dayKey, endOfLocalDate, filterChats, inboxTime, visibleRows } from './inboxModel';
import { MediaView } from './MediaView';
import { PremiumMark } from './PremiumMark';

export function InboxPane({owner,tab,index,waiting,children}:{
  owner:string; tab:string; index:number; waiting:boolean; children:ReactNode;
}) {
  const host=useRef<HTMLDivElement>(null);
  const previous=useRef({owner,tab,index,waiting});
  useLayoutEffect(()=>{
    const before=previous.current;
    previous.current={owner,tab,index,waiting};
    if(before.owner!==owner||(before.tab===tab&&before.waiting===waiting))return;
    const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    if(motion.matches)return;
    const distance=before.tab===tab?0:Math.sign(index-before.index)*8;
    const animation=host.current?.animate?.([
      {opacity:.7,transform:`translateX(${distance}px)`},
      {opacity:1,transform:'translateX(0)'},
    ],{duration:165,easing:'cubic-bezier(.2,.75,.25,1)'});
    const respectMotion=()=>{if(motion.matches)animation?.cancel();};
    motion.addEventListener('change',respectMotion);
    return ()=>{motion.removeEventListener('change',respectMotion);animation?.cancel();};
  },[owner,tab,index,waiting]);
  return <div ref={host} className="inbox-pane">{children}</div>;
}

export function InboxLoading({failed,retry}:{failed:boolean;retry():void}) {
  if(failed)return <div className="inbox-empty">
    <p role="alert">No se pudo cargar esta pestaña.</p>
    <button type="button" className="secondary" onClick={retry}>Reintentar</button>
  </div>;
  return <div className="inbox-loading" role="status" aria-label="Cargando la pestaña">
    <div className="inbox-placeholder" aria-hidden="true">
      {[0,1,2,3,4,5].map(row=><div className="inbox-placeholder-row" key={row}>
        <span className="inbox-placeholder-avatar"/><span className="inbox-placeholder-lines"/>
      </div>)}
    </div>
  </div>;
}

export function InboxEmpty({busy,query,archived,search}:{busy:boolean;query:string;archived:boolean;search?:()=>void}) {
  return <div className="inbox-empty">
    {busy?<LoaderCircle className="spin" size={26}/>:archived?<Archive size={26}/>:<MessageCircle size={26}/>}
    <h3>{busy?'Cargando chats…':query?'Sin coincidencias':archived?'Tu archivo está vacío':'No hay chats en esta vista'}</h3>
    <p>{query?'Prueba con otro nombre, usuario o texto.':'Cambia de filtro para ver otras conversaciones.'}</p>
    {search&&<button type="button" className="secondary" onClick={search}>Buscar en Telegram</button>}
  </div>;
}

export function Avatar({ chat, large = false }: { chat: Pick<Chat, 'id' | 'title' | 'photo' | 'bot'>; large?: boolean }) {
  const initials = chat.bot ? <Bot size={24}/> : chat.title.trim().split(/\s+/).slice(0, 2).map(word => [...word][0]).join('').toUpperCase();
  const hue = (Number(chat.id.replace(/\D/g, '').slice(-5)) * 43) % 360;
  return <span className={`avatar ${large ? 'large' : ''}`} aria-hidden="true" style={{ '--avatar-hue': hue } as CSSProperties}>
    {chat.photo ? <MediaView media={chat.photo} auto eager passive fallback={initials}/> : initials}
  </span>;
}

export function VirtualChats({ chats, active, resetKey, rowHeight, select, menu }: {
  chats: Chat[]; active: string; resetKey: string; rowHeight: number; select(chat: Chat): void; menu(chat: Chat): void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const height = useRef(0);
  const [range, setRange] = useState(() => visibleRows(chats.length, 0, 0, rowHeight));
  const rendered = useRef(range);
  const updateWindow = useCallback((top: number) => {
    const next = visibleRows(chats.length, height.current, top, rowHeight);
    if (next.start === rendered.current.start && next.end === rendered.current.end) return;
    rendered.current = next;
    setRange(next);
  }, [chats.length, rowHeight]);
  useLayoutEffect(() => {
    if (host.current) host.current.scrollTop = 0;
  }, [resetKey]);
  useLayoutEffect(() => {
    const element = host.current!;
    const measure = () => {
      height.current = element.clientHeight;
      updateWindow(element.scrollTop);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [resetKey, updateWindow]);

  const { start, end } = range;
  const now = new Date();
  return <div className="chats-scroll" ref={host} onScroll={event => updateWindow(event.currentTarget.scrollTop)} aria-label="Conversaciones">
    <div style={{ height: chats.length * rowHeight, position: 'relative' }}>
      {chats.slice(start, end).map((chat, index) => <div className={`chat-row ${chat.id === active ? 'active' : ''}`} style={{ top: (start + index) * rowHeight, height: rowHeight }} key={chat.id}>
        <button type="button" className="chat-row-main" aria-current={chat.id === active ? 'true' : undefined} aria-label={`Abrir chat con ${chat.title}${chat.unread>0?`, ${chat.unread} sin leer`:''}`} onClick={() => select(chat)} onContextMenu={event => { event.preventDefault(); menu(chat); }}>
          <Avatar chat={chat}/>
          <span className="chat-row-content">
            <span className="chat-title"><strong>{chat.title}</strong><PremiumMark premium={chat.premium} status={chat.emojiStatus} size={15}/>{chat.type === 'secret' && <LockKeyhole size={12} aria-label="Chat secreto"/>}{chat.muted && <BellOff size={12} aria-label="Silenciado"/>}<time>{inboxTime(chat.date, now)}</time></span>
            <span className="chat-preview">
              <span>{chat.draft ? <><strong className="draft-label">Borrador</strong> {chat.draft}</> : chat.preview || 'Sin mensajes'}</span>
              {chat.pinned && <Pin size={12} aria-label="Fijado"/>}
              {chat.unread > 0 ? <b className={chat.muted ? 'muted-badge' : ''} aria-label={`${chat.unread} sin leer`}>{chat.unread > 99 ? '99+' : chat.unread}</b> : chat.marked ? <b className="unread-dot" aria-label="Marcado como no leído"/> : null}
            </span>
          </span>
        </button>
        <button className="row-options" aria-label={`Opciones de ${chat.title}`} onClick={() => menu(chat)}><ChevronDown size={15}/></button>
      </div>)}
    </div>
  </div>;
}

type Shortcut = { id: string; title: string; icon?: typeof Bookmark; chat?: Chat; source?: string; open(): void };

function useChatLookup(query: string, scope: 'account' | 'public', enabled: boolean) {
  const [state, setState] = useState<{ query: string; chats: Chat[]; error: string }>();
  const [attempt, retry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => {
      void request<Chat[]>('chats.search', { query, scope }).then(chats => {
        if (active) setState({ query, chats, error: '' });
      }).catch(error => {
        if (active) setState({ query, chats: [], error: error instanceof Error ? error.message : 'No se pudo buscar en Telegram.' });
      });
    }, 320);
    return () => { active = false; clearTimeout(timer); };
  }, [query, scope, enabled, attempt]);
  const current = enabled && state?.query === query ? state : undefined;
  return { chats: current?.chats ?? [], busy: enabled && !current, error: current?.error, retry: () => { setState(undefined); retry(value => value + 1); } };
}

export function QuickChats({ chats, initialQuery, saved, archive, open }: { chats: Chat[]; initialQuery: string; saved(): void; archive(): void; open(chat: Chat): void }) {
  const [query, setQuery] = useState(initialQuery.slice(0, 80));
  const [includePublic, setIncludePublic] = useState(false);
  const [cursor, setCursor] = useState(0);
  const listId = useId();
  const active = useRef<HTMLDivElement>(null);
  const matches = useMemo(() => filterChats(chats, 'loaded', query, false), [chats, query]);
  const term = query.trim().replace(/^@/, '');
  const account = useChatLookup(term, 'account', term.length >= 2);
  const publicLookup = useChatLookup(term, 'public', includePublic && term.length >= 3);
  const shortcuts: Shortcut[] = query.trim() ? [] : [
    { id: 'saved', title: 'Mensajes guardados', icon: Bookmark, open: saved },
    { id: 'archive', title: 'Archivados', icon: Archive, open: archive },
  ];
  const choices = [...shortcuts];
  const seen = new Set<string>();
  function add(items: Chat[], source?: string) {
    for (const chat of items.slice(0, 30)) {
      if (seen.has(chat.id) || chat.supported === false) continue;
      seen.add(chat.id);
      choices.push({ id: chat.id, title: chat.title, chat, source, open: () => open(chat) });
    }
  }
  add(matches);
  add(account.chats, 'De tu cuenta');
  add(publicLookup.chats, 'Público');
  const current = Math.min(cursor, choices.length - 1);
  useLayoutEffect(() => { active.current?.scrollIntoView({ block: 'nearest' }); }, [current, query]);

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter' && choices[current]) {
      event.preventDefault();
      choices[current].open();
    }
    if (!choices.length || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
    event.preventDefault();
    setCursor((current + (event.key === 'ArrowDown' ? 1 : choices.length - 1)) % choices.length);
  }

  return <div className="quick-chats">
    <label className="chat-search"><Search size={18}/><input data-dialog-autofocus role="combobox" aria-label="Buscar chats en Telegram" aria-controls={listId} aria-expanded="true" aria-autocomplete="list" aria-activedescendant={choices[current] ? `${listId}-${current}` : undefined} placeholder="Nombre o @usuario" maxLength={80} value={query} onChange={event => { setQuery(event.target.value); setCursor(0); }} onKeyDown={onKeyDown}/></label>
    {term.length >= 3 && <label className="quick-public-toggle"><input type="checkbox" checked={includePublic} onChange={event => { setIncludePublic(event.target.checked); setCursor(0); }}/> Incluir resultados públicos</label>}
    <div id={listId} className="quick-results" role="listbox" aria-label="Chats y accesos">
      {choices.map((choice, index) => <div className="quick-result" ref={index === current ? active : undefined} id={`${listId}-${index}`} key={choice.id} role="option" aria-selected={index === current} onMouseDown={event => event.preventDefault()} onClick={choice.open}>
        {choice.chat ? <Avatar chat={choice.chat}/> : choice.icon && <span className="quick-icon"><choice.icon size={18}/></span>}
        <span><strong>{choice.title}</strong>{choice.chat && <small>{choice.chat.username ? '@' + choice.chat.username : choice.chat.preview || 'Conversación de Telegram'}{choice.source && <span className="quick-source"> · {choice.source}</span>}</small>}</span>
        <ArrowRight size={16}/>
      </div>)}
    </div>
    {(account.error || publicLookup.error) && <div className="collection-status" role="status">
      <span>{account.error || publicLookup.error}</span>
      <button type="button" className="text-button" onClick={account.error ? account.retry : publicLookup.retry}>Reintentar</button>
    </div>}
    <p className="quick-help" role="status">{account.busy || publicLookup.busy ? 'Buscando en Telegram…' : choices.length ? 'Usa ↑ y ↓ para elegir y Enter para abrir.' : term.length < 2 ? 'Escribe al menos dos caracteres para buscar en Telegram.' : 'No encontramos conversaciones con ese texto.'}</p>
  </div>;
}

export function InboxFooter({ count, busy, end, more, create }: { count: number; busy: boolean; end: boolean; more(): void; create?(): void }) {
  return <footer className="inbox-footer">
    <span>{count === 1 ? '1 chat visible' : `${count} chats visibles`}</span>
    <div className="inbox-footer-actions">
      {!end && <button type="button" className="quiet-button" disabled={busy} onClick={more}>{busy ? <LoaderCircle size={14} className="spin"/> : <ArrowDown size={14}/>} {busy ? 'Cargando…' : 'Cargar más'}</button>}
      {create && <button type="button" className="inbox-create" aria-label="Nueva conversación" title="Nueva conversación" onClick={create}><Pencil size={17}/></button>}
    </div>
  </footer>;
}

export function HistoryDateForm({ find }: { find(timestamp: number): Promise<boolean> }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <form className="history-date-form" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    const date = new FormData(event.currentTarget).get('date');
    const timestamp = typeof date === 'string' ? endOfLocalDate(date) : 0;
    if (!timestamp) { setError('Elige una fecha válida.'); return; }
    setError('');
    setBusy(true);
    void find(timestamp).then(ok => { if (!ok) setError('No se pudo abrir el historial en esa fecha.'); }).catch(error => {
      setError(error instanceof Error ? error.message : 'No se pudo consultar esta fecha.');
    }).finally(() => setBusy(false));
  }}>
    <p>Abre el último mensaje enviado hasta el final del día que elijas, según la hora de este dispositivo.</p>
    <label>Fecha <input type="date" name="date" required max={dayKey(new Date())} onInput={() => setError('')}/></label>
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="primary" disabled={busy}>{busy ? 'Buscando…' : 'Ir al historial'}</button>
  </form>;
}
