import type { CallLogEntry, CallLogPage } from './contract';

/**
 * El espejo de `CallLog.java` (ronda CL): el tamaño de página, el techo del cursor, las dos negaciones y el recorte
 * de nombres que hace Android. Son las palabras copiadas carácter a carácter de `CallLog.java:20-24` y de
 * `ServiceMessages.java:125-126`; `rondaCL.test.ts` las compara con el Java para que el andamio no enseñe nunca una
 * frase que el puente no diría.
 *
 * La asimetría que hay que dejar escrita es el filtro por nombre: `SearchCallMessages` no tiene `query`, así que el
 * texto que se escribe aquí solo recorta lo que ya bajó. `onlyMissed` sí viaja al servidor, y por eso el andamio lo
 * aplica antes de paginar y el nombre después —el orden es la semántica, no un detalle de implementación.
 */

/** El `LIMIT` de `CallLog.java:20`; TDLib admite hasta cien por página y aquí se piden cincuenta. */
export const CALL_LOG_LIMIT = 50;

/** El `MAX_OFFSET` de `CallLog.java:22`: un cursor opaco no debería pasar de sesenta y cuatro caracteres. */
export const CALL_LOG_MAX_OFFSET = 64;

/** Las dos negaciones de `CallLog.java:23-24`, y la que arma el puente cuando el cursor ya no es de esta pantalla. */
export const CALL_LOG_REFUSALS = {
  /** `CallLog.java:23`, la que lanza `CallLog.offset` al pasar el techo. */
  badOffset: 'El cursor del registro de llamadas no es válido.',
  /** `CallLog.java:24`, la que devuelve el puente cuando el cursor no sigue a lo que la sesión ya recorrió. */
  staleCursor: 'Vuelve a abrir el registro de llamadas para continuar.',
} as const;

/**
 * Las frases que `ServiceMessages` ya usa para la misma llamada, para que el registro no invente otra manera de
 * decirla. `finished`, `videoFinished` y `voiceFinished` reciben el detalle (`' · 2 min 5 s'` o la cadena vacía), que
 * es exactamente la forma de `ServiceMessages.java:125-126`: sin duración no va ni el punto medio.
 */
export const CALL_LOG_LABELS = {
  missed: 'Llamada perdida',
  declined: 'Llamada rechazada',
  disconnected: 'Llamada interrumpida',
  finished: (detail: string) => 'Llamada finalizada' + detail,
  videoMissed: 'Videollamada perdida',
  videoDeclined: 'Videollamada rechazada',
  videoDisconnected: 'Videollamada interrumpida',
  videoInProgress: 'Videollamada en curso',
  videoFinished: (detail: string) => 'Videollamada finalizada' + detail,
  voiceMissed: 'Llamada de voz perdida',
  voiceInProgress: 'Llamada de voz en curso',
  voiceFinished: (detail: string) => 'Llamada de voz finalizada' + detail,
} as const;

/** Las cuatro terminaciones que `CallDiscardReason` distingue, más la de un grupo que sigue abierto. */
export type CallReason = 'missed' | 'declined' | 'disconnected' | 'ended';

/** El `missed(CallDiscardReason)` de `CallLog.java:34-36`: el servidor cuenta las rechazadas como no contestadas. */
export const isMissedReason = (reason: CallReason): boolean => reason === 'missed' || reason === 'declined';

/**
 * La frase que `ServiceMessages` escribiría en la burbuja de esa llamada, copiada de `ServiceMessages.java:125-126`
 * con sus tres detalles: el sustantivo lo decide `isVideo` en las dos familias —un chat de grupo sin vídeo es una
 * «Llamada de voz», no una videollamada—, una llamada de grupo no tiene motivo suelto, porque perdidas y rechazadas
 * son la misma bandera, y una en curso se nombra con su propia frase, sin duración.
 */
export function callRowLabel(reason: CallReason, video: boolean, group: boolean, duration: number, ongoing = false): string {
  const detail = duration > 0 ? ' · ' + callDurationText(duration) : '';
  if (group) {
    if (ongoing) return video ? CALL_LOG_LABELS.videoInProgress : CALL_LOG_LABELS.voiceInProgress;
    if (isMissedReason(reason)) return video ? CALL_LOG_LABELS.videoMissed : CALL_LOG_LABELS.voiceMissed;
    return video ? CALL_LOG_LABELS.videoFinished(detail) : CALL_LOG_LABELS.voiceFinished(detail);
  }
  if (reason === 'missed') return video ? CALL_LOG_LABELS.videoMissed : CALL_LOG_LABELS.missed;
  if (reason === 'declined') return video ? CALL_LOG_LABELS.videoDeclined : CALL_LOG_LABELS.declined;
  if (reason === 'disconnected') return video ? CALL_LOG_LABELS.videoDisconnected : CALL_LOG_LABELS.disconnected;
  return video ? CALL_LOG_LABELS.videoFinished(detail) : CALL_LOG_LABELS.finished(detail);
}

/** El `duration(int)` de `ServiceMessages.java:186-191`, con sus tres formas. */
export function callDurationText(seconds: number): string {
  const total = Math.max(0, seconds), hours = Math.floor(total / 3600), minutes = Math.floor((total % 3600) / 60), secs = total % 60;
  if (hours > 0) return `${hours} h ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${secs} s`;
  return `${secs} s`;
}

/** El `normalize` de `CallLog.java:80-83`: sin acentos, en minúsculas y con los espacios de golpe. */
export function normalizeCallName(value: string | null | undefined): string {
  const text = (value ?? '').normalize('NFD').replace(/\p{Mn}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
  return text;
}

/** El `matches` de `CallLog.java:86-90`: la consulta vacía deja pasar todo; lo demás se compara como substring. */
export function matchesCallName(title: string, query: string): boolean {
  const needle = normalizeCallName(query);
  if (needle === '') return true;
  return normalizeCallName(title).includes(needle);
}

/** El `offset` de `CallLog.java:63-67`: lo que no es texto no es cursor, y uno demasiado largo se rechaza. */
export function callLogOffsetProblem(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return CALL_LOG_REFUSALS.badOffset;
  return raw.length > CALL_LOG_MAX_OFFSET ? CALL_LOG_REFUSALS.badOffset : null;
}

/** El `more` de `CallLog.java:70-72`: solo el cursor siguiente prueba que queda registro, aunque la página venga corta. */
export const callLogMore = (nextOffset: string): boolean => nextOffset !== '';

/** El `total` de `CallLog.java:75-77`: `totalCount` vale -1 cuando Telegram no lo sabe, y un negativo nunca se pinta. */
export const callLogTotal = (raw: number): number => (raw < 0 ? 0 : raw);

/**
 * La página que armaría el puente con las filas que ya tiene: `fetched` es lo que la página traía antes del filtro
 * local y `shown` lo que sobrevive a él, que es la diferencia que la pantalla tiene que poder decir. `onlyMissed`
 * recorta antes de paginar porque eso hace el servidor; el nombre recorta después porque eso hace el teléfono. El
 * `limit` se pasa por escrito para que el andamio pueda usar una página corta y ver trabajar al marcador.
 */
export function callLogPage(pool: CallLogEntry[], start: number, query: string, onlyMissed: boolean, total: number, limit = CALL_LOG_LIMIT): CallLogPage {
  const serverSide = onlyMissed ? pool.filter(row => row.missed) : pool;
  const page = serverSide.slice(start, start + limit);
  const nextOffset = start + page.length < serverSide.length ? String(start + page.length) : '';
  const rows = page.filter(row => matchesCallName(row.title, query));
  return { rows, fetched: page.length, shown: rows.length, total, nextOffset, more: callLogMore(nextOffset) } satisfies CallLogPage;
}
