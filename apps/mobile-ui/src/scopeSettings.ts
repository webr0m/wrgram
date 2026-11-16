import type { NotificationScopes, NotificationSound, ScopePatch, ScopeSettings, NotificationScopeId } from './contract';

export const INDEFINITE = 2_147_483_647;
export const DEFAULT_SOUND = '-1';
export const SILENT_SOUND = '0';

export const SCOPE_IDS: NotificationScopeId[] = ['private', 'group', 'channel'];
export const SCOPE_TITLES: Record<NotificationScopeId, string> = { private: 'Chats privados', group: 'Grupos', channel: 'Canales' };

/** Bandas que Telegram admite de verdad; «indefinido» es el mismo tope que usa el puente nativo. */
export const MUTE_CHOICES: { seconds: number; label: string }[] = [
  { seconds: 0, label: 'Sin silencio' },
  { seconds: 3_600, label: '1 hora' },
  { seconds: 28_800, label: '8 horas' },
  { seconds: 172_800, label: '2 días' },
  { seconds: INDEFINITE, label: 'Indefinidamente' },
];

export const emptyPatch = (): ScopePatch => ({});

/** Las nueve claves que acepta `ScopeSettings.known` en Java; `storyDefault` queda fuera a propósito. */
export const PATCH_KEYS = ['muted', 'muteFor', 'sound', 'preview', 'muteStories', 'storySound', 'storyPoster', 'quietPinned', 'quietMentions'];

/** Ningún alcance se rellena de fábrica: si Telegram no lo devolvió, falta y se anuncia. */
export function scopeMap(data: NotificationScopes | undefined): { scopes: Record<string, ScopeSettings>; sounds: NotificationSound[] } {
  const scopes: Record<string, ScopeSettings> = {};
  for (const item of Array.isArray(data?.scopes) ? data!.scopes : []) {
    if (!item || !SCOPE_IDS.includes(item.scope)) continue;
    if (!scopes[item.scope]) scopes[item.scope] = item;
  }
  return { scopes, sounds: Array.isArray(data?.sounds) ? data!.sounds : [] };
}

export function missingScopes(data: NotificationScopes | undefined): NotificationScopeId[] {
  const list = Array.isArray(data?.scopes) ? data.scopes : [];
  const seen = new Set(list.filter(item => item && SCOPE_IDS.includes(item.scope)).map(item => item.scope));
  return SCOPE_IDS.filter(id => !seen.has(id));
}

export const knownSound = (id: string, sounds: NotificationSound[]): boolean =>
  id === DEFAULT_SOUND || id === SILENT_SOUND || sounds.some(sound => sound.id === id);

/** Qué queda realmente de un silencio: Telegram devuelve segundos restantes, no una fecha. */
export function span(seconds: number): string {
  if (!(seconds > 0)) return 'sin silencio';
  if (seconds >= INDEFINITE) return 'indefinido';
  if (seconds < 3_600) return seconds < 60 ? 'unos segundos' : `${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86_400) return hours(Math.floor(seconds / 3_600));
  if (seconds < 2_592_000) return days(Math.floor(seconds / 86_400));
  return months(Math.floor(seconds / 2_592_000));
}

export const hours = (value: number) => (Math.max(1, value) === 1 ? '1 h' : `${Math.max(1, value)} h`);
export const days = (value: number) => (Math.max(1, value) === 1 ? '1 día' : `${Math.max(1, value)} días`);
export const months = (value: number) => (Math.max(1, value) === 1 ? '1 mes' : `${Math.max(1, value)} meses`);

/** Un id desconocido se describe como lo que es; la lista de sonidos puede no haber llegado. */
export function soundLabel(id: string | undefined, sounds: NotificationSound[]): string {
  if (id === undefined || id === '') return 'sin confirmar';
  if (id === DEFAULT_SOUND) return 'el sonido de la aplicación';
  if (id === SILENT_SOUND) return 'sin sonido';
  const saved = sounds.find(sound => sound.id === id);
  if (saved) return saved.title ? `«${saved.title}»` : 'un sonido guardado';
  return /^-?\d{1,19}$/.test(id) ? 'un sonido guardado en Telegram' : 'sin confirmar';
}

/** Lo que la pantalla muestra: el valor de Telegram, salvo que el borrador lo cambie. */
export function effective(settings: ScopeSettings, patch: ScopePatch): ScopeSettings {
  const next = { ...settings };
  if (patch.muteFor !== undefined) { next.muteFor = patch.muteFor; next.muted = patch.muteFor > 0; }
  else if (patch.muted !== undefined) { next.muted = patch.muted; next.muteFor = patch.muted ? INDEFINITE : 0; }
  if (patch.sound !== undefined) next.sound = patch.sound;
  if (patch.storySound !== undefined) next.storySound = patch.storySound;
  for (const key of ['preview', 'muteStories', 'storyPoster', 'quietPinned', 'quietMentions'] as const) {
    if (patch[key] !== undefined) (next[key] as boolean) = patch[key] as boolean;
  }
  return next;
}

/** Qué cambiará, con las mismas bandas que escribirá Telegram: si nada difiere, no hay nada que guardar. */
export function pendingChanges(settings: ScopeSettings, patch: ScopePatch, sounds: NotificationSound[] = []): string[] {
  const before = settings;
  const after = effective(settings, patch);
  const list: string[] = [];
  if (before.muteFor !== after.muteFor) {
    list.push(after.muteFor > 0
      ? (before.muteFor > 0 ? `silencio: ${span(before.muteFor)} → ${span(after.muteFor)}` : `silencio: ${span(after.muteFor)}`)
      : 'sin silencio');
  }
  if (before.sound !== after.sound) list.push(`sonido: ${soundLabel(after.sound, sounds)}`);
  if (before.storySound !== after.storySound) list.push(`sonido de historias: ${soundLabel(after.storySound, sounds)}`);
  if (before.preview !== after.preview) list.push(after.preview ? 'mostrar el contenido en el aviso' : 'ocultar el contenido en el aviso');
  if (before.muteStories !== after.muteStories) list.push(after.muteStories ? 'historias silenciadas' : 'historias con aviso');
  if (before.storyPoster !== after.storyPoster) list.push(after.storyPoster ? 'mostrar quién publica la historia' : 'ocultar quién publica la historia');
  if (before.quietPinned !== after.quietPinned) list.push(after.quietPinned ? 'los mensajes fijados avisarán como cualquiera' : 'los mensajes fijados volverán a avisar aparte');
  if (before.quietMentions !== after.quietMentions) list.push(after.quietMentions ? 'las menciones avisarán como cualquier mensaje' : 'las menciones volverán a destacar');
  return list;
}

/** Los mismos mensajes que rechaza el puente: el formulario no puede prometer un ajuste Telegram no va a aceptar. */
export function patchProblem(patch: ScopePatch, sounds: NotificationSound[]): string {
  for (const key of Object.keys(patch)) if (!PATCH_KEYS.includes(key)) return 'Ese ajuste no corresponde a ninguno de Telegram.';
  if (patch.muteFor !== undefined) {
    if (!Number.isInteger(patch.muteFor) || patch.muteFor < 0 || patch.muteFor > INDEFINITE) return 'La duración del silencio no es válida.';
    if (patch.muted !== undefined && patch.muted !== (patch.muteFor > 0)) return 'El silencio y su duración no coinciden.';
  }
  for (const key of ['sound', 'storySound'] as const) {
    const id = patch[key];
    if (id === undefined) continue;
    if (!/^-?\d{1,19}$/.test(id)) return `El identificador del ${key === 'sound' ? 'sonido de los mensajes' : 'sonido de las historias'} no es válido.`;
    // Con la lista vacía no se puede afirmar nada: lo decide el nativo contra su propia lectura.
    if (sounds.length && !knownSound(id, sounds)) return 'Ese sonido no está entre los que Telegram guarda en esta cuenta.';
  }
  const BOOLEAN_KEYS = ['preview', 'muteStories', 'storyPoster', 'quietPinned', 'quietMentions', 'muted'] as const;
  if (BOOLEAN_KEYS.some(key => patch[key] !== undefined && typeof patch[key] !== 'boolean')) {
    return 'Alguno de los ajustes de notificación solo admite un sí o un no.';
  }
  return '';
}

/** Mientras Telegram decida las historias por su cuenta, el ajuste propio no se aplica: hay que decirlo. */
export const storyCaveat = (settings: ScopeSettings): string =>
  settings.storyDefault ? 'Telegram decide ahora las historias por sus propios criterios: el ajuste de historias no se aplicará mientras lo mantenga así.' : '';

/** Opción neutra de los selectores: «no tocar esto» es un estado real, no un valor por defecto. */
export const keepOption = (label: string) => `Mantener: ${label}`;

/** «8 h restantes» tiene sentido mientras el reloj corre; un silencio indefinido no está contando nada. */
export const muteKeepLabel = (seconds: number): string =>
  seconds >= INDEFINITE ? 'indefinido' : seconds > 0 ? `${span(seconds)} restantes` : 'sin silencio';

const soundPhrase = (id: string, sounds: NotificationSound[]): string => {
  if (id === DEFAULT_SOUND) return 'sonido el de la aplicación';
  if (id === SILENT_SOUND) return 'sonido sin sonido';
  const saved = sounds.find(sound => sound.id === id);
  return saved ? (saved.title ? `sonido «${saved.title}»` : 'sonido guardado') : 'un sonido de Telegram';
};

export function summaryOf(settings: ScopeSettings, sounds: NotificationSound[]): string {
  const parts = [settings.muteFor > 0 ? `silenciado ${span(settings.muteFor)}` : 'con aviso'];
  parts.push(soundPhrase(settings.sound, sounds));
  parts.push(settings.preview ? 'contenido visible' : 'contenido oculto');
  if (settings.quietPinned) parts.push('fijados sin aviso aparte');
  if (settings.quietMentions) parts.push('menciones sin aviso aparte');
  parts.push(settings.storyDefault ? 'historias: decide Telegram' : settings.muteStories ? 'historias silenciadas' : 'historias con aviso');
  return parts.join(' · ');
}

/** Quitar una clave del borrador significa «no tocar esto»: el valor se conserva tal como lo dio Telegram. */
export function unset(patch: ScopePatch, key: keyof ScopePatch): ScopePatch {
  const next: ScopePatch = { ...patch };
  delete next[key];
  return next;
}
