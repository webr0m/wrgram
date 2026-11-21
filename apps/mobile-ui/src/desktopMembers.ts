/**
 * El espejo de las dos clases de reglas del puente de Windows para las listas de miembros
 * (`DesktopGroupMembers.cs` y `DesktopGroupRoster.cs`, ronda AX). No son frases de la interfaz: son las cadenas
 * que el host devuelve, copiadas carácter a carácter, y `rondaAX.test.ts` las compara con el C# para que el
 * andamio de diseño no enseñe nunca una palabra que Windows no diría.
 *
 * Aquí viven tres cosas: los seis filtros que la pantalla puede pedir (y que el host valida), los topes con los
 * que aprieta sus argumentos, y las negaciones con nombre de la lectura. Desde la ronda AZ las escrituras sobre una
 * fila también están conectadas en Windows, así que sus botones se pintan y sus frases viven en
 * `memberSanctions.ts`; lo que se niega aquí es lo que el puente niega al leer.
 */

/** `DesktopGroupMembers.FilterKeys`: las seis teclas que `App.tsx` manda y el host sabe traducir. */
export const DESKTOP_MEMBER_FILTERS = ['recent', 'administrators', 'restricted', 'banned', 'bots', 'contacts'] as const;

/**
 * Los tres apretones de `DesktopGroupMembers` (`MaxQuery`, `MaxOffset`, `MaxLimit`/`MinLimit`), que son los de
 * `NativeBridge.groupMembers` (`NativeBridge.java:2811-2812`). El de la lista del básico es otro camino: allí el
 * largo se mide recortado y no hay desplazamiento.
 */
export const DESKTOP_MEMBER_LIMITS = { query: 80, offset: 5000, page: 50, minPage: 1 } as const;

/**
 * Las cinco negaciones de la *lectura* de una lista de supergrupo o canal (`DesktopGroupMembers.cs:67-71`) más la
 * que solo existe en Windows: el hash que no llegó (`DesktopGroupRoster.NoHash`), intraducible en el andamio porque
 * aquí no hay `access_hash`. Las escrituras tienen su propio espejo en `memberSanctions.ts` desde la ronda AZ, y
 * las frases que antes vivían aquí (`sanctions`) se fueron con el brazo que conectó esa ronda.
 */
export const DESKTOP_MEMBER_REFUSALS = {
  notCommunity: 'La administración solo está disponible en supergrupos y canales.',
  longQuery: 'La búsqueda de miembros admite hasta 80 caracteres.',
  noRight: 'Telegram no concede a esta cuenta permisos para administrar miembros.',
  badFilter: 'Filtro de miembros no válido.',
  unreadable: 'No se pudo preparar la lista de miembros.',
  noHash: 'Telegram no dio los datos necesarios para expulsar a esta persona. Vuelve a abrir la lista e inténtalo de nuevo.',
} as const;

/** Espejo de `DesktopGroupMembers.TooLong`: el largo se mide sin recortar, que es lo que hace Android (`:2691`). */
export function desktopMemberQueryProblem(query: string): string {
  return query.length > DESKTOP_MEMBER_LIMITS.query ? DESKTOP_MEMBER_REFUSALS.longQuery : '';
}

/** Espejo de `DesktopGroupMembers.Request`: una tecla que no está en las seis es un `BridgeException(BadFilter)`. */
export function desktopMemberFilterProblem(filter: string): string {
  return (DESKTOP_MEMBER_FILTERS as readonly string[]).includes(filter) ? '' : DESKTOP_MEMBER_REFUSALS.badFilter;
}

/**
 * Espejo de `DesktopGroupMembers.Supported` sobre la forma de la fila: la clave de una comunidad en Windows
 * lleva `c` o `g`, y el Android del andamio no usa prefijos, así que la comprobación se hace con `type` y
 * `supergroup`, que es como los decide la pantalla.
 */
export function isSupergroupOrChannel(chat?: { type?: string; supergroup?: boolean }): boolean {
  if (!chat) return false;
  return chat.type === 'channel' || (chat.type === 'group' && chat.supergroup === true);
}
