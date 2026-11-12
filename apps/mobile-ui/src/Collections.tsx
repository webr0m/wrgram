import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, ChevronLeft, ChevronRight, File, Film, Image, Link, LoaderCircle, Pin } from 'lucide-react';
import { request } from './bridge';
import type { Chat, Media, Message, SavedTag } from './contract';
import { appendCollection, calendarDays, dayBounds, GALLERY_FILTERS, type CollectionPage, type SavedSource } from './collectionModel';
import { dayKey, historyDate, inboxTime } from './inboxModel';
import { FormattedText } from './formatting';
import { MediaView } from './MediaView';
import { pickImageVariant } from './mediaSizes';
import './collections.css';

type Jump = (message: Message) => void;
type OpenUrl = (url: string) => void;
type PageState<T> = CollectionPage<T> & { busy: boolean; error: string };

function usePages<T extends {id:string}>(method: string, params: Record<string, unknown>) {
  const [state, setState] = useState<PageState<T>>({ items: [], next: '', busy: true, error: '' });
  const generation = useRef(0);
  const running = useRef(false);
  const failedCursor = useRef('');
  function load(cursor: string) {
    if (running.current) return;
    const current = ++generation.current;
    running.current = true;
    setState(previous => ({ ...previous, busy: true, error: '' }));
    void request<CollectionPage<T>>(method, { ...params, cursor }).then(page => {
      if (generation.current !== current) return;
      setState(previous => ({
        items: appendCollection(cursor ? previous.items : [], page.items),
        next: page.next === cursor ? '' : page.next,
        busy: false,
        error: '',
      }));
    }).catch(error => {
      if (generation.current !== current) return;
      failedCursor.current = cursor;
      setState(previous => ({ ...previous, busy: false, error: error instanceof Error ? error.message : 'No se pudo cargar.' }));
    }).finally(() => { if (generation.current === current) running.current = false; });
  }
  // Each collection is keyed by its account, chat, filter and date at its entry point.
  useEffect(() => {
    load('');
    return () => { generation.current++; running.current = false; };
  }, []);
  return { ...state, more: () => load(state.next), retry: () => load(failedCursor.current) };
}

function CollectionStatus({ page, empty }: { page: PageState<unknown> & { more(): void; retry(): void }; empty: string }) {
  return <>
    {page.error && <div className="collection-status"><p role="alert">{page.error}</p><button type="button" className="secondary" onClick={page.retry}>Reintentar</button></div>}
    {page.busy && <p className="collection-status" role="status"><LoaderCircle size={16} className="spin"/> Cargando…</p>}
    {!page.busy && !page.error && (page.next
      ? <button type="button" className="secondary collection-more" onClick={page.more}>Cargar más</button>
      : !page.items.length && <p className="collection-status" role="status">{empty}</p>)}
  </>;
}

export function SavedBrowser({ openAll, jump, openUrl }: { openAll(): void; jump: Jump; openUrl: OpenUrl }) {
  const [source, setSource] = useState<SavedSource>();
  return <div className="collection">
    <div className="collection-toolbar">
      {source
        ? <button type="button" className="secondary" onClick={() => setSource(undefined)}><ArrowLeft size={15}/> Orígenes</button>
        : <p>Por conversación de origen</p>}
      <button type="button" className="secondary" onClick={openAll}>Ver todos</button>
    </div>
    {source ? <SavedHistory key={source.id} source={source} jump={jump} openUrl={openUrl}/> : <SavedSources open={setSource}/>}
  </div>;
}

function SavedSources({ open }: { open(item: SavedSource): void }) {
  const [version, setVersion] = useState(0);
  function pin(item: SavedSource) {
    void request('saved.topics.pin', { id: item.id, pin: !item.pinned }).then(() => setVersion(value => value + 1));
  }
  return <SavedSourcesList key={version} open={open} pin={pin}/>;
}

function SavedSourcesList({ open, pin }: { open(item: SavedSource): void; pin(item: SavedSource): void }) {
  const page = usePages<SavedSource>('saved.sources', {});
  return <>
    <div className="source-list">
      {page.items.map(item => <div className="collection-row" key={item.id}>
        <button type="button" className="collection-row-open" onClick={() => open(item)}>
          <span className="source-icon" aria-hidden="true">{item.title.trim().slice(0, 2).toUpperCase()}</span>
          <span><strong>{item.title}{item.pinned && <Pin size={13} aria-label="Fijado"/>}</strong><small>{item.preview || 'Mensaje guardado'}</small></span>
          {item.date > 0 && <time>{inboxTime(item.date, new Date())}</time>}
          <ArrowRight size={15} aria-hidden="true"/>
        </button>
        <button type="button" className="collection-row-pin" aria-label={item.pinned ? `Quitar fijado de ${item.title}` : `Fijar ${item.title}`} aria-pressed={item.pinned} onClick={() => pin(item)}><Pin size={15}/></button>
      </div>)}
    </div>
    <CollectionStatus page={page} empty="Todavía no hay mensajes guardados."/>
  </>;
}

const savedTagKey = (tag: SavedTag) => `${tag.kind}:${tag.customEmojiId || tag.emoji || ''}`;

function SavedHistory({ source, jump, openUrl }: { source: SavedSource; jump: Jump; openUrl: OpenUrl }) {
  const [tags, setTags] = useState<{ tags?: SavedTag[]; error?: string }>({});
  const [tag, setTag] = useState('');
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    void request<SavedTag[]>('saved.tags', { topic: source.id })
      .then(value => value && setTags({ tags: value }))
      .catch(error => setTags({ error: error instanceof Error ? error.message : 'No se pudieron leer las etiquetas.' }));
  }, [source.id]);
  const selected = tags.tags?.find(item => savedTagKey(item) === tag);
  function saveLabel() {
    if (!selected) return;
    setSaving(true);
    void request('saved.tag.label', { tag: { kind: selected.kind, emoji: selected.emoji, customEmojiId: selected.customEmojiId }, label: label.trim() }).then(() => {
      setTags(current => ({ tags: current.tags?.map(item => savedTagKey(item) === tag ? { ...item, label: label.trim() } : item) }));
    }).catch(() => {}).finally(() => setSaving(false));
  }
  return <>
    <h3 className="collection-origin">{source.title}</h3>
    {tags.error && <p className="collection-status" role="status">{tags.error}</p>}
    {tags.tags && tags.tags.length > 0 && <div className="saved-tags" role="group" aria-label="Etiquetas de Guardados">
      {tags.tags.map(item => { const key = savedTagKey(item); return <button key={key} type="button" className={tag === key ? 'saved-tag selected' : 'saved-tag'} aria-pressed={tag === key} onClick={() => { setTag(tag === key ? '' : key); setLabel(''); }}>{item.kind === 'custom' ? '🏷️' : item.emoji} {item.label || `×${item.count}`}</button>; })}
      <p className="settings-note">Toca una etiqueta para ver solo esos mensajes guardados; buscar por etiquetas es una función de Telegram Premium.</p>
    </div>}
    {selected && <div className="saved-tag-rename">
      <input aria-label="Etiqueta para esta marca" placeholder={selected.label || 'Etiqueta (12 caracteres)'} maxLength={12} value={label} onChange={event => setLabel(event.target.value)}/>
      <button type="button" className="text-button" disabled={saving} onClick={saveLabel}>Guardar etiqueta</button>
      <small>Vacío restaura el nombre por defecto.</small>
    </div>}
    {selected
      ? <TagMessages key={tag} source={source} tag={selected} jump={jump} openUrl={openUrl}/>
      : <SavedTopicHistory source={source} jump={jump} openUrl={openUrl}/>}
  </>;
}

function SavedTopicHistory({ source, jump, openUrl }: { source: SavedSource; jump: Jump; openUrl: OpenUrl }) {
  const page = usePages<Message>('saved.history', { id: source.id });
  return <>
    <div className="source-list">
      {page.items.map(item => <div className="collection-message" key={item.id}><CollectionMessage item={item} openUrl={openUrl}/><button type="button" className="text-button" onClick={() => jump(item)}>Ir al mensaje <ArrowRight size={14}/></button></div>)}
    </div>
    <CollectionStatus page={page} empty="Este origen ya no tiene mensajes guardados."/>
  </>;
}

function TagMessages({ source, tag, jump, openUrl }: { source: SavedSource; tag: SavedTag; jump: Jump; openUrl: OpenUrl }) {
  const page = usePages<Message>('saved.search', { topic: source.id, tag: { kind: tag.kind, emoji: tag.emoji, customEmojiId: tag.customEmojiId } });
  return <>
    <div className="source-list">
      {page.items.map(item => <div className="collection-message" key={item.id}><CollectionMessage item={item} openUrl={openUrl}/><button type="button" className="text-button" onClick={() => jump(item)}>Ir al mensaje <ArrowRight size={14}/></button></div>)}
    </div>
    <CollectionStatus page={page} empty="No hay mensajes guardados con esta etiqueta en este origen."/>
  </>;
}

const monthTitle = new Intl.DateTimeFormat('es', { month: 'long', year: 'numeric' });
const week = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

function GalleryCalendar({ date, select }: { date: string; select(value: string): void }) {
  const [month, setMonth] = useState(() => date ? new Date(date + 'T12:00:00') : new Date());
  const now = dayKey(new Date());
  const key = dayKey(month).slice(0, 7);
  const { days, padding } = calendarDays(month);
  function shift(by: number) { setMonth(new Date(month.getFullYear(), month.getMonth() + by, 1)); }
  return <div className="gallery-calendar">
    <div className="gallery-month">
      <button type="button" className="icon-button" aria-label="Mes anterior" disabled={key <= '1970-01'} onClick={() => shift(-1)}><ChevronLeft size={18}/></button>
      <label><strong aria-live="polite">{monthTitle.format(month)}</strong>
        <input aria-label="Cambiar mes del calendario" type="month" min="1970-01" max={now.slice(0, 7)} value={key} onInput={event => {
          const value = event.currentTarget.value;
          if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= '1970-01' && value <= now.slice(0, 7)) setMonth(new Date(value + '-01T12:00:00'));
        }}/></label>
      <button type="button" className="icon-button" aria-label="Mes siguiente" disabled={key >= now.slice(0, 7)} onClick={() => shift(1)}><ChevronRight size={18}/></button>
    </div>
    <div className="gallery-days" role="group" aria-label="Días del mes">
      {week.map(letter => <span key={letter} aria-hidden="true">{letter}</span>)}
      {Array.from({ length: padding }, (_, i) => <span key={'pad' + i}/>)}
      {days.map(day => <button type="button" key={day} disabled={day > now} aria-pressed={day === date} aria-label={historyDate(dayBounds(day)!.from)} onClick={() => select(day)}>{Number(day.slice(-2))}</button>)}
    </div>
  </div>;
}

export function SharedGallery({ chat, jump, openUrl }: { chat: Chat; jump: Jump; openUrl: OpenUrl }) {
  const [filter, setFilter] = useState<string>('photoVideo');
  const [date, setDate] = useState('');
  const [calendar, setCalendar] = useState(false);
  return <div className="collection">
    <div className="collection-toolbar">
      <label>Tipo <select aria-label="Tipo de multimedia" value={filter} onChange={event => setFilter(event.target.value)}>{GALLERY_FILTERS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <button type="button" className="secondary" aria-expanded={calendar} onClick={() => setCalendar(!calendar)}><CalendarDays size={16}/> Calendario</button>
    </div>
    {calendar && <GalleryCalendar date={date} select={day => { setDate(day); setCalendar(false); }}/>}
    {date && <div className="collection-toolbar"><span>{historyDate(dayBounds(date)!.from)}</span><button type="button" className="text-button" onClick={() => setDate('')}>Quitar fecha</button></div>}
    <GalleryResults key={filter + ':' + date} chat={chat} filter={filter} date={date} jump={jump} openUrl={openUrl}/>
  </div>;
}

function GalleryResults({ chat, filter, date, jump, openUrl }: { chat: Chat; filter: string; date: string; jump: Jump; openUrl: OpenUrl }) {
  const page = usePages<Message>('gallery.list', { id: chat.id, filter, ...dayBounds(date) });
  const [item, setItem] = useState<Message>();
  const grid = ['photoVideo', 'photos', 'videos'].includes(filter);
  return <>
    {item ? <div className="collection-message gallery-preview">
      <button type="button" className="secondary" onClick={() => setItem(undefined)}><ArrowLeft size={15}/> Volver a la galería</button>
      <CollectionMessage item={item} openUrl={openUrl}/>
      <button type="button" className="text-button" onClick={() => jump(item)}>Ir al mensaje <ArrowRight size={14}/></button>
    </div> : <>
      <div className={grid ? 'gallery-grid' : 'source-list'}>
        {page.items.map(message => <button type="button" className={grid ? 'gallery-tile' : 'collection-row'} key={message.id} onClick={() => setItem(message)}>
          <GalleryThumb item={message} photo={grid}/>
          <span><strong>{message.media?.name || message.preview?.title || message.text || 'Elemento compartido'}</strong><small>{historyDate(message.date)}</small></span>
        </button>)}
      </div>
      <CollectionStatus page={page} empty={date ? 'No hay elementos de este tipo en ese día.' : 'No hay elementos de este tipo en la conversación.'}/>
    </>}
  </>;
}

function GalleryThumb({ item, photo }: { item: Message; photo: boolean }) {
  const media = item.media;
  let preview: Media | undefined;
  if (photo && media) {
    if (media.thumbnail?.mime.startsWith('image/')) preview = media.thumbnail;
    else if (media.kind === 'image') {
      const variant = media.variants?.length ? pickImageVariant(media.variants, 200) : undefined;
      preview = { ...media, ...(variant ? { id: variant.id, size: variant.size, ready: false } : {}), variants: undefined };
    } else if (media.minithumbnail) preview = { ...media, id: 0, kind: 'image', ready: false };
  }
  return <span className="gallery-thumb" aria-hidden="true">{preview
    ? <MediaView media={preview} auto passive/>
    : media?.kind === 'video' ? <Film size={22}/> : photo ? <Image size={22}/> : !media ? <Link size={18}/> : <File size={18}/>}
    {photo && media?.kind === 'video' && <Film className="gallery-video-badge" size={15}/>}
  </span>;
}

function CollectionMessage({ item, openUrl }: { item: Message; openUrl: OpenUrl }) {
  return <>
    <small>{historyDate(item.date)}</small>
    {item.media && <MediaView media={item.media} fileControls auto={item.media.kind === 'image'}/>}
    {item.text && <p><FormattedText text={item.text} entities={item.entities} openUrl={openUrl}/></p>}
    {!item.media && !item.text && <p>Mensaje de Telegram</p>}
  </>;
}
