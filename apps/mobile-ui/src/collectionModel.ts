import { dayKey } from './inboxModel';

export interface CollectionPage<T> {
  items: T[];
  next: string;
}

export interface SavedSource {
  id: string;
  title: string;
  preview: string;
  date: number;
  pinned: boolean;
}

export const GALLERY_FILTERS = [
  ['photoVideo', 'Fotos y vídeos'], ['photos', 'Fotos'], ['videos', 'Vídeos'],
  ['documents', 'Archivos'], ['links', 'Enlaces'], ['audio', 'Música'], ['voice', 'Voz'],
] as const;

export function dayBounds(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return;
  const start = new Date(value + 'T00:00:00');
  if (!Number.isFinite(start.getTime()) || dayKey(start) !== value) return;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { from: Math.floor(start.getTime() / 1000), until: Math.floor(end.getTime() / 1000) };
}

export function calendarDays(month: Date) {
  const year = month.getFullYear(), index = month.getMonth();
  const first = new Date(year, index, 1);
  const padding = (first.getDay() + 6) % 7;
  return {
    padding,
    days: Array.from({ length: new Date(year, index + 1, 0).getDate() }, (_, i) => dayKey(new Date(year, index, i + 1))),
  };
}

export function appendCollection<T extends {id:string}>(before: T[], incoming: T[]) {
  return [...new Map([...before, ...incoming].map(item => [item.id, item])).values()];
}
