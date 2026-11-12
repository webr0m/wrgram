import type { Chat } from './contract';

const alphabet = new Intl.Collator('es', { sensitivity: 'base', numeric: true });
const clock = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long', year: 'numeric' });

export function normalizeSearch(value: string) {
  return value.trim().normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('es');
}

export function filterChats(chats: Chat[], filter: string, query: string, alphabetic: boolean) {
  const terms = normalizeSearch(query).split(/\s+/).filter(Boolean);
  const matches = chats.filter(chat => {
    if (filter === 'archive' && !chat.archived) return false;
    if (filter !== 'archive' && filter !== 'loaded' && !filter.startsWith('folder:') && chat.archived) return false;
    if (filter === 'unread' && !chat.unread && !chat.marked) return false;
    if (filter === 'bots' && !chat.bot) return false;
    if (filter === 'groups' && chat.type !== 'group') return false;
    if (filter === 'channels' && chat.type !== 'channel') return false;
    if (filter === 'secret' && chat.type !== 'secret') return false;
    if (!terms.length) return true;
    const haystack = normalizeSearch(`${chat.title} ${chat.username ? `@${chat.username}` : ''} ${chat.preview}`);
    return terms.every(term => haystack.includes(term));
  });
  return alphabetic ? matches.sort((a, b) => alphabet.compare(a.title, b.title)) : matches;
}

export function visibleRows(count: number, height: number, top: number, rowHeight: number) {
  const maxTop = Math.max(0, count * rowHeight - height);
  const offset = Math.min(top, maxTop);
  return {
    start: Math.max(0, Math.floor(offset / rowHeight) - 3),
    end: Math.min(count, Math.ceil((offset + height) / rowHeight) + 3),
  };
}

export const messageTime = (timestamp: number) => timestamp > 0 ? clock.format(timestamp * 1000) : '';

export function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function inboxTime(timestamp: number, now: Date) {
  if (timestamp <= 0) return '';
  const date = new Date(timestamp * 1000);
  if (dayKey(date) === dayKey(now)) return messageTime(timestamp);
  return (date.getFullYear() === now.getFullYear() ? shortDate : longDate).format(date);
}

export const historyDate = (timestamp: number) => longDate.format(timestamp * 1000);

export function endOfLocalDate(value: string, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;
  const date = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(date.getTime()) || dayKey(date) !== value || value > dayKey(now)) return 0;
  // Advance by a calendar day so DST changes do not shift the requested boundary.
  date.setDate(date.getDate() + 1);
  date.setHours(0, 0, 0, 0);
  const end = Math.min(date.getTime() - 1000, now.getTime());
  const seconds = Math.floor(end / 1000);
  return seconds > 0 && seconds <= 2147483647 ? seconds : 0;
}
