import { dayBounds } from './collectionModel';

// Espejo exacto de `MessageSearch.java`: el puente es quien rechaza, aquí solo se adelanta el motivo
// para no pintar una búsqueda que Telegram no va a aceptar. Las frases están pinadas prueba a prueba.
export const CHAT_SENDER = 'chat';
export const MAX_WINDOW = 31_622_400;
const INT_LIMIT = 2_147_483_646;

export const REJECTIONS = {
  badSender: 'El autor del filtro no es un identificador de Telegram válido.',
  chatSenderOnly: 'Solo los canales publican a su nombre; en un grupo o conversación privada elige a una persona.',
  reversedBand: 'El rango de fechas termina antes de empezar.',
  futureBand: 'El filtro apunta a una fecha futura.',
  wideBand: 'El rango de fechas es demasiado amplio; Telegram busca en periodos de hasta un año.',
  badDate: 'La fecha del filtro no es válida.',
  secretBand: 'En un chat secreto Telegram solo busca texto: no filtra por autor ni por fechas.',
  globalBand: 'Buscar por autor o por fechas solo vale dentro de una conversación; la búsqueda global no admite esos filtros.',
} as const;

export type SearchableChat = { type?: string; secret?: boolean } | null | undefined;

export const isSecret = (chat: SearchableChat): boolean => chat?.type === 'secret';

export const hasBand = (sender: string, from: number, until: number): boolean =>
  sender.trim() !== '' || from !== 0 || until !== 0;

const positive = (value: string): boolean => /^[1-9][0-9]{0,18}$/.test(value);

/**
 * La otra forma que admite un identificador de autor: el escritorio no habla TDLib, así que sus peers
 * llegan como `u123` / `c456` —los mismos que `MessageDto.AuthorId`— y un `123` a secas sería ambiguo
 * entre usuario y canal. Android rechaza ese token y Windows rechaza el número suelto; la frase es la
 * misma en los dos, porque es el mismo error visto desde dos transportes.
 */
export type SenderShape = 'numeric' | 'peer';
const peerToken = (value: string): boolean => /^[uc][1-9][0-9]{0,18}$/.test(value);

/** Null cuando Telegram admite la combinación en este chat; si no, el motivo con sus palabras. */
export function problem(sender: string, from: number, until: number, chat: SearchableChat, now = Math.floor(Date.now() / 1000), shape: SenderShape = 'numeric'): string | null {
  const who = sender.trim();
  if (isSecret(chat)) return hasBand(who, from, until) ? REJECTIONS.secretBand : null;
  if (from < 0 || until < 0 || from > INT_LIMIT || until > INT_LIMIT) return REJECTIONS.badDate;
  if (until > 0 && from > 0 && until <= from) return REJECTIONS.reversedBand;
  if (from > now) return REJECTIONS.futureBand;
  if (from > 0 && until > 0 && until - from > MAX_WINDOW) return REJECTIONS.wideBand;
  if (who === '') return null;
  if (who === CHAT_SENDER) return chat?.type === 'channel' ? null : REJECTIONS.chatSenderOnly;
  if (shape === 'peer') return peerToken(who) ? null : REJECTIONS.badSender;
  return positive(who) ? null : REJECTIONS.badSender;
}

/**
 * Las dos casillas de calendario. `dayBounds` ya devuelve la medianoche del día **siguiente**, que es
 * justo el tope exclusivo que el puente espera, así que «hoy» sigue siendo buscable aunque ese instante
 * esté en el futuro.
 */
export function bandOf(since: string, until: string): { from: number; to: number; notice: string } {
  const bad = { from: 0, to: 0, notice: REJECTIONS.badDate };
  if (since && !dayBounds(since)) return bad;
  if (until && !dayBounds(until)) return bad;
  return { from: since ? dayBounds(since)!.from : 0, to: until ? dayBounds(until)!.until : 0, notice: '' };
}

export type AuthorChip = { id: string; label: string; kind: 'user' | 'chat' };

/**
 * Los autores con los que Telegram ya filtró en esta conversación: los que aparecen en los resultados
 * que se están leyendo. No se inventa una lista de miembros —en un canal la lista completa solo la ven
 * los administradores—, así que la puerta que se pinta es la que el puente admite de verdad.
 */
export function authors(messages: { sender: string; authorId?: string; authorKind?: 'user' | 'chat'; outgoing?: boolean }[], selfId: string): AuthorChip[] {
  const seen = new Map<string, AuthorChip>();
  if (selfId) seen.set(selfId, { id: selfId, label: 'Tú', kind: 'user' });
  for (const message of messages) {
    if (!message.authorId || message.authorKind === 'chat') continue;
    if (message.authorId === selfId) continue;
    if (!seen.has(message.authorId)) seen.set(message.authorId, { id: message.authorId, label: message.sender || 'Autor', kind: message.authorKind ?? 'user' });
  }
  return [...seen.values()];
}

const day = (epoch: number): string => new Date(epoch * 1000).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

/** Resumen legible de lo que se está filtrando, para que la chapa no prometa más de lo que hay. */
export function bandNotice(sender: string, from: number, until: number, chat: SearchableChat, names: AuthorChip[] = []): string {
  const parts: string[] = [];
  if (sender === CHAT_SENDER && chat?.type === 'channel') parts.push('solo publicaciones del canal');
  else if (sender) parts.push(`solo de ${names.find(chip => chip.id === sender)?.label ?? 'ese autor'}`);
  if (from && until) parts.push(`entre el ${day(from)} y el ${day(until - 1)}`);
  else if (from) parts.push(`desde el ${day(from)}`);
  else if (until) parts.push(`hasta el ${day(until - 1)}`);
  return parts.join(' · ');
}
