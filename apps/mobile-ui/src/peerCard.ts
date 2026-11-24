/**
 * El espejo de `DesktopPeerProfile.cs` y de `DesktopSenderProfile.cs`, y de `chatProfile`/`profileRelated`/
 * `senderProfile` de Android (`NativeBridge.java:1241-1288`, `:1555-1594` y `:1595-1613`). Una frase, una vez: el
 * andamio no escribe español propio, pregunta aquí.
 */

/** `profileRelated` pide treinta filas en los tres caminos (`:1560`, `:1574`, `:1577`). */
export const PEER_PAGE = 30;

/** `Math.max(0, Math.min(5000, offset))` de `:1552`. */
export const PEER_MAX_OFFSET = 5000;

export const PEER_REFUSALS = {
  /** `NativeBridge.java:1619`, carácter a carácter. */
  noList: 'No hay una lista de participantes para este chat.',
  /** `NativeBridge.java:1644`, la misma negación del chat secreto. */
  secret: 'Este perfil no está disponible.',
  /** `NativeBridge.java:1270` y `:1271`. */
  loadFailed: 'No se pudo cargar el perfil público.',
  /** `NativeBridge.java:1669`, la otra negación de `senderProfile`: la fila no trae autor. */
  noSender: 'Telegram no identificó al remitente.',
  /** Sin gemelo en Java: es el `access_hash` de MTProto, que TDLib guarda en casa. */
  noHash: 'Telegram no dio los datos necesarios para abrir esta ficha. Vuelve a abrirla desde la conversación e inténtalo de nuevo.',
} as const;

export const PEER_PRESENCE = {
  /** `presence` (`NativeBridge.java:1588`). */
  online: 'En línea',
  /** El prefijo de `:1567`; detrás va la fecha, cuyo molde sí difiere entre capas. */
  offline: 'Última vez ',
  /** `:1549`. */
  recently: 'Últ. vez recientemente',
  /** `:1546`. */
  week: 'Últ. vez esta semana',
  /** `:1547`. */
  month: 'Últ. vez este mes',
} as const;

export const PEER_ROLE = { creator: 'Creador', admin: 'Administrador', none: '' } as const;

export type PeerStatus = { kind: 'online'; expires: number } | { kind: 'offline'; was: number } | { kind: 'recently' } | { kind: 'week' } | { kind: 'month' };

/** Las cinco cadenas de `presence`, con la misma doble condición: en línea solo si no caducó, fuera solo si hay marca. */
export function peerPresence(status: PeerStatus | undefined, now: number): string {
  if (!status) return '';
  if (status.kind === 'online') return status.expires > now ? PEER_PRESENCE.online : '';
  if (status.kind === 'offline') return status.was > 0 ? PEER_PRESENCE.offline + new Date(status.was * 1000).toLocaleString('es', { timeZone: 'UTC' }) : '';
  if (status.kind === 'recently') return PEER_PRESENCE.recently;
  if (status.kind === 'week') return PEER_PRESENCE.week;
  return PEER_PRESENCE.month;
}

/** `profileMembers` (`:1583`): creador, administrador o nada. Los bots se cuelan igual que allá. */
export function peerRole(status: string): string {
  return status === PEER_ROLE.creator ? PEER_ROLE.creator : status === PEER_ROLE.admin ? PEER_ROLE.admin : PEER_ROLE.none;
}

/** El desplazamiento recortado de `:1552`, entero y dentro de la ventana. */
export function peerOffset(value: number): number {
  const raw = Number.isFinite(value) ? Math.floor(value) : 0;
  return Math.max(0, Math.min(PEER_MAX_OFFSET, raw));
}

/** `nextCursor` de `:1563`: el identificador del último chat solo cuando la página vino llena. */
export function peerCursor(ids: string[], count: number): string {
  return count === PEER_PAGE ? ids[ids.length - 1] ?? '0' : '0';
}

/** La fila de `profileMembers` (`:1584`): cuatro claves, sin miniatura en Windows. */
export function peerMemberRow(id: string, name: string, role: string) {
  return { id, name, role };
}

/** La fila de `respondProfilePeer` (`:1609-1612` → `dto.chat`), que es lo que la pestaña abre al tocar. */
export function peerRow(chat: { id: string; title: string; type: string; username?: string; bot?: boolean }) {
  return { id: chat.id, title: chat.title, type: chat.type, username: chat.username ?? '', bot: !!chat.bot, supported: true };
}

/** `activeUsernames` (`:1207` y `:1250`): solo los activos, y el primero es el primario. */
export function activeUsernames(values: { username: string; active: boolean }[]): string[] {
  return values.filter(value => value.active && value.username.length > 0).map(value => value.username);
}
