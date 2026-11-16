import type { Message } from './contract';

/** Comparación exacta de ids: viajan en texto porque superan 2^53. */
function byId(a: string, b: string) { return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0); }

/** TDLib devuelve el hilo del más nuevo al más antiguo; la lista se lee al revés. */
export function chronological(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => a.date - b.date || byId(a.id, b.id));
}

/** Une una página más antigua con lo ya mostrado sin repetir mensajes. */
export function mergeThread(current: Message[], older: Message[]): Message[] {
  const seen = new Set(current.map(item => item.id));
  return chronological([...current, ...older.filter(item => !seen.has(item.id))]);
}

const KIND_LABEL: Record<string, string> = { image: 'Foto', video: 'Vídeo', audio: 'Audio', file: 'Archivo', sticker: 'Sticker' };
export function mediaLabel(media?: Message['media']) { return media ? KIND_LABEL[media.kind] || 'Adjunto' : ''; }
