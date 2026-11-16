import type { JoinRequest, JoinRequestPage } from './contract';

/** La clave coincide con el marcador opaco del nativo: identificador más fecha de la solicitud. */
export const keyOf = (request: JoinRequest) => `${request.userId}:${request.date}`;

/** Un marcador solo sirve si Telegram anunció más páginas; nunca se inventa ni se reutiliza. */
export function cursorFor(page: JoinRequestPage | undefined): string {
  if (!page || page.next !== true) return '';
  return typeof page.cursor === 'string' && /^\d+:\d+$/.test(page.cursor) ? page.cursor : '';
}

/** Páginas sucesivas llegan en orden decreciente: se añaden al final sin duplicar la fila. */
export function mergeRequests(current: JoinRequest[], incoming: JoinRequest[]): JoinRequest[] {
  const seen = new Set(current.map(keyOf));
  const extra = incoming.filter(request => !seen.has(keyOf(request)));
  return extra.length ? [...current, ...extra] : current;
}

/** Un marcador que no avanza repetiría la misma página: se descarta en lugar de ofrecerlo otra vez. */
export function advanceCursor(previous: string, page: JoinRequestPage): string {
  const next = cursorFor(page);
  return next && next !== previous ? next : '';
}

const MINUTE = 60, HOUR = 3600, DAY = 86400, MONTH = 2592000, YEAR = 31536000;

/** Antedad aproximada de la solicitud; una fecha futura o inválida nunca cuenta hacia atrás. */
export function requestedAgo(date: number, now: number): string {
  const seconds = Math.max(0, Math.floor(now) - Math.max(0, Math.floor(date)));
  if (seconds < MINUTE) return 'hace un momento';
  if (seconds < HOUR) return `hace ${Math.floor(seconds / MINUTE)} min`;
  if (seconds < DAY) return `hace ${Math.floor(seconds / HOUR)} h`;
  if (seconds < MONTH) return `hace ${Math.floor(seconds / DAY)} d`;
  if (seconds < YEAR) return `hace ${Math.floor(seconds / MONTH)} mes${seconds < 2 * MONTH ? '' : 'es'}`;
  return `hace ${Math.floor(seconds / YEAR)} año${seconds < 2 * YEAR ? '' : 's'}`;
}

/** El total de Telegram es aproximado: se anuncia como tal y nunca se infiere de la longitud de una página. */
export function requestCountLabel(total: number, shown: number): string {
  const value = Math.max(0, Math.floor(total));
  if (value > 0) return `≈ ${value} solicitante${value === 1 ? '' : 's'} pendiente${value === 1 ? '' : 's'}`;
  return shown === 1 ? '1 solicitud pendiente' : `${shown} solicitudes pendientes`;
}
