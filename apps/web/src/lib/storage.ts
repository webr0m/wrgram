export const STORAGE_KEYS = {
  notes: 'wrgram.demo.notes.v1',
  grants: 'wrgram.demo.grants.v1',
} as const;

export type Notes = Record<string, string>;

export function parseNotes(value: unknown): Notes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, note]) =>
    key.length <= 100 && typeof note === 'string' && note.length <= 5000,
  ));
}

export function readLocal(key: string): { value: unknown; unavailable: boolean } {
  try {
    const raw = window.localStorage.getItem(key);
    return { value: raw ? JSON.parse(raw) : undefined, unavailable: false };
  } catch {
    return { value: undefined, unavailable: true };
  }
}

export function writeLocal(key: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}
