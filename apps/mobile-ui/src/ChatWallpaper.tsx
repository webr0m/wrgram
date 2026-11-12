import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { Image, Video } from 'lucide-react';
import { useLanguage } from './language';

const patterns = [['none', 'Liso'], ['dots', 'Puntos'], ['grid', 'Cuadrícula'], ['aurora', 'Aurora']] as const;
type Pattern = typeof patterns[number][0];
type Wallpaper = { kind: 'pattern'; pattern: Pattern } | { kind: 'image' | 'video'; file: Blob };
const listeners = new Set<() => void>();
let revision = 0;
let database: Promise<IDBDatabase> | undefined;
const globalKey = (owner: string) => owner + ':all';
const chatKey = (owner: string, chat: string) => owner + ':chat:' + chat;

function openDatabase() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('wrgram-wallpapers', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('wallpapers');
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); database = undefined; };
        resolve(db);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error('Wallpaper storage is busy'));
    }).catch(error => { database = undefined; throw error; });
  }
  return database;
}

async function read(key: string) {
  const db = await openDatabase();
  return new Promise<Wallpaper | undefined>((resolve, reject) => {
    const request = db.transaction('wallpapers').objectStore('wallpapers').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function save(key: string, value?: Wallpaper) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction('wallpapers', 'readwrite');
    const store = transaction.objectStore('wallpapers');
    if (value) store.put(value, key);
    else store.delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
  });
  revision++;
  listeners.forEach(listener => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const getRevision = () => revision;

function useWallpaper(owner: string, chat?: string, inherit = false) {
  const version = useSyncExternalStore(subscribe, getRevision);
  const key = chat ? chatKey(owner, chat) : globalKey(owner);
  const [loaded, setLoaded] = useState<{ key: string; value?: Wallpaper }>();
  useEffect(() => {
    let current = true;
    void read(key).then(async value => value ?? (chat && inherit ? await read(globalKey(owner)) : undefined))
      .then(value => { if (current) setLoaded({ key, value }); }).catch(() => {
        if (current) setLoaded({ key });
      });
    return () => { current = false; };
  }, [key, owner, chat, inherit, version]);
  return loaded?.key === key ? loaded.value : undefined;
}

function useMediaUrl(value?: Wallpaper) {
  const file = value && value.kind !== 'pattern' ? value.file : undefined;
  const [media, setMedia] = useState<{ file: Blob; url: string }>();
  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setMedia({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return media && media.file === file ? media.url : undefined;
}

export function useChatWallpaper(owner: string, chat?: string) {
  const value = useWallpaper(owner, chat, true);
  const url = useMediaUrl(value);
  return { pattern: value?.kind === 'pattern' ? value.pattern : undefined, kind: value?.kind, url };
}

export function WallpaperVideo({ url }: { url: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const node = video.current;
    if (!node) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      if (document.hidden || motion.matches) node.pause();
      else void node.play().catch(() => {});
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    motion.addEventListener('change', sync);
    return () => {
      node.pause();
      document.removeEventListener('visibilitychange', sync);
      motion.removeEventListener('change', sync);
    };
  }, [url]);
  return <video className="chat-wallpaper-video" ref={video} src={url} muted loop playsInline preload="metadata" aria-hidden="true" />;
}

const fileTypes = {
  image: { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' },
  video: { mp4: 'video/mp4', webm: 'video/webm' },
};

async function canDisplay(file: Blob, kind: 'image' | 'video') {
  const url = URL.createObjectURL(file);
  const node = document.createElement(kind === 'image' ? 'img' : 'video');
  try {
    return await new Promise<boolean>(resolve => {
      const timer = window.setTimeout(() => resolve(false), 8000);
      const finish = (valid: boolean) => { clearTimeout(timer); resolve(valid); };
      node.addEventListener(kind === 'image' ? 'load' : 'loadedmetadata', () => finish(true), { once: true });
      node.addEventListener('error', () => finish(false), { once: true });
      node.src = url;
    });
  } finally {
    node.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}

export function WallpaperSettings({ owner, chat, pattern = 'none' }: { owner: string; chat?: string; pattern?: string }) {
  const { t } = useLanguage();
  const value = useWallpaper(owner, chat);
  const url = useMediaUrl(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const key = chat ? chatKey(owner, chat) : globalKey(owner);
  const selected = value?.kind === 'pattern' ? value.pattern : value?.kind ?? (chat ? 'inherit' : pattern);

  async function change(value?: Wallpaper) {
    setError('');
    setBusy(true);
    try { await save(key, value); }
    catch { setError('No se pudo guardar el fondo en este dispositivo.'); }
    finally { setBusy(false); }
  }

  async function pick(event: ChangeEvent<HTMLInputElement>, kind: 'image' | 'video') {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const types: Record<string, string> = fileTypes[kind];
    const mime = types[file.name.split('.').pop()?.toLowerCase() ?? ''];
    if (!mime || !file.size || file.size > 32 * 1024 * 1024) {
      setError(kind === 'image' ? 'Elige una foto JPG, PNG, WebP o AVIF de hasta 32 MB.' : 'Elige un vídeo MP4 o WebM de hasta 32 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const blob = file.slice(0, file.size, mime);
      if (!await canDisplay(blob, kind)) {
        setError('Este dispositivo no puede abrir el archivo seleccionado.');
        return;
      }
      await save(key, { kind, file: blob });
    } catch { setError('No se pudo guardar el fondo en este dispositivo.'); }
    finally { setBusy(false); }
  }

  return <section className="wallpaper-settings">
    <h3>{t(chat ? 'Fondo de esta conversación' : 'Fondo para todos los chats')}</h3>
    <div className="wallpaper-options" role="group" aria-label={t('Fondo del chat')}>
      {chat && <button type="button" className="secondary" disabled={busy} aria-pressed={selected === 'inherit'} onClick={() => void change()}>{t('Usar fondo general')}</button>}
      {patterns.map(([id, label]) => <button type="button" className="wallpaper-option" data-chat-wallpaper={id} key={id} disabled={busy}
        aria-pressed={id === selected} onClick={() => void change({ kind: 'pattern', pattern: id })}><span>{t(label)}</span></button>)}
    </div>
    {url && <div className="wallpaper-preview">{value?.kind === 'image' ? <img src={url} alt={t('Fondo del chat')} /> : <WallpaperVideo url={url} />}</div>}
    <div className="settings-actions wallpaper-files">
      <label className="secondary"><Image size={17}/>{t('Elegir foto')}<input type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={busy} onChange={event => void pick(event, 'image')} /></label>
      <label className="secondary"><Video size={17}/>{t('Elegir vídeo')}<input type="file" accept="video/mp4,video/webm" disabled={busy} onChange={event => void pick(event, 'video')} /></label>
    </div>
    {value?.kind === 'video' && <p className="settings-note">{t('El vídeo se reproduce sin sonido.')}</p>}
    {error && <p className="settings-note settings-error" role="alert">{t(error)}</p>}
  </section>;
}
