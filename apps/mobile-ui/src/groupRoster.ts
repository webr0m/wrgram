import type { RosterMember } from './contract';

/**
 * Un grupo básico conserva a quien se fue, y Telegram no dice en qué orden llega la lista. Estas reglas
 * están copiadas literalmente de `BasicGroupRoster.java` y `rondaW.test.ts` exige que las dos versiones
 * coincidan carácter a carácter: si la interfaz suaviza el «Salió» o reinventa el orden, la persona leería
 * una lista que el puente nunca le envió.
 */
export const ROSTER_NOTES = {
  unsupported: 'La lista entera de un chat solo la da Telegram en los grupos básicos; en supergrupos y canales se pide por páginas.',
  empty: 'Telegram no devolvió ninguna persona en la lista de este grupo básico.',
  noCreator: 'Telegram no dice quién creó este grupo.',
  order: 'Primero van quien creó el grupo y la administración; el resto se ordena por identificador, no por actividad reciente.',
  tooLong: 'La búsqueda de miembros admite hasta 80 caracteres.',
} as const;

export const ROSTER_STATUS = {
  creator: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
  restricted: 'Restringido',
  left: 'Salió',
  banned: 'Baneado',
  unknown: 'Sin estado',
} as const;

export const ROSTER_LIMITS = { group: 200, query: 80 } as const;

/**
 * El respaldo con el que una persona se nombra a sí misma cuando Telegram ya no la describe. Es una sola
 * palabra en las tres capas —`rosterName` en Java, `DesktopGroupMembers.UnknownPerson` en C#—, así que vive
 * aquí y no repetida en cada fila del andamio.
 */
export const ROSTER_UNKNOWN_NAME = 'Usuario de Telegram';

/** Espejo de `BasicGroupRoster.remaining(int)`: nunca un negativo, aunque la lista sorprenda. */
export function rosterRemaining(inside: number): number {
  return Math.max(0, ROSTER_LIMITS.group - inside);
}

/** Espejo de `BasicGroupRoster.note(long,int,int)`: total devuelto y gente dentro son cifras distintas. */
export function rosterNote(creator: string, listed: number, inside: number): string {
  if (listed <= 0) return ROSTER_NOTES.empty;
  const head = listed === 1
    ? 'Telegram devolvió 1 persona de la lista completa del grupo; '
    : `Telegram devolvió ${listed} personas de la lista completa del grupo; `;
  let rest: string;
  if (inside === listed) rest = inside === 1 ? 'sigue dentro.' : 'todas siguen dentro.';
  else if (inside === 0) rest = 'ninguna sigue dentro: los demás se fueron o fueron expulsados.';
  else rest = `${inside} siguen dentro y ${listed - inside}${listed - inside === 1 ? ' se fue o fue expulsada.' : ' se fueron o fueron expulsados.'}`;
  return head + rest + (creator === '0' ? ` ${ROSTER_NOTES.noCreator}` : '');
}

/** Espejo de `BasicGroupRoster.matches(String,String,String)`: minúsculas sobre nombre o usuario. */
export function rosterMatches(query: string, name: string, username: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (name.toLowerCase().includes(needle)) return true;
  return username.toLowerCase().includes(needle);
}

/** Espejo de `BasicGroupRoster.tooLong(String)`. */
export function rosterQueryProblem(query: string): string {
  return query.trim().length > ROSTER_LIMITS.query ? ROSTER_NOTES.tooLong : '';
}

/** Espejo de `BasicGroupRoster.invitedName`: sin invitador no hay firma que decir. */
export function rosterInvitedName(invitedBy: string, name: string): string {
  return invitedBy === '0' ? '' : name;
}

export function rosterJoined(member: RosterMember): string {
  return member.since > 0 ? new Date(member.since * 1000).toLocaleDateString('es') : '';
}

/** La línea que ve la persona: el nombre, lo que Telegram dijo de su estado y si sigue dentro. */
export function rosterLine(member: RosterMember): string {
  const joined = rosterJoined(member);
  const who = member.self ? `${member.name} (tú)` : member.name;
  const kind = member.bot ? ' · Bot' : '';
  const seat = member.inside ? '' : ' · ya no está dentro';
  return `${who}${kind} · ${member.status}${joined ? ` · desde ${joined}` : ''}${seat}`;
}

/** Cuántos de lo mostrado siguen dentro, dicho por la lista y no por la memoria de quien mira. */
export function rosterInsideCount(members: RosterMember[]): number {
  return members.filter(member => member.inside).length;
}

/**
 * Lo que un grupo básico admite hacer con una fila de su lista. Copiado literalmente de
 * `BasicGroupMemberAction.java`, y `rondaX.test.ts` exige que las dos versiones coincidan: la persona no
 * puede recibir dos explicaciones distintas del mismo «aquí no se puede restringir ni repartir permisos».
 */
export const BAN_ACTIONS = {
  noRight: 'Telegram no concede a esta cuenta permiso para expulsar personas del grupo.',
  self: 'No te expulses a ti mismo desde la lista: para salir usa «Salir del grupo».',
  creator: 'Al creador del grupo no se le expulsa: solo puede salir él.',
  outside: 'Esta persona ya no está dentro del grupo: no hay nada que expulsar.',
  noRestrict: 'En un grupo básico Telegram no admite restricciones parciales: o expulsa o no hace nada.',
  noPromote: 'En un grupo básico la administración no se reparte en permisos: Telegram solo permite elegirlos en supergrupos y canales.',
  noDuration: 'La expulsión de un grupo básico no tiene plazo: siempre es definitiva.',
  revokeOn: 'También se borrarán los mensajes que esta persona envió en el grupo.',
  revokeOff: 'Sus mensajes se quedan en el grupo.',
  scope: 'En un grupo básico Telegram solo permite expulsar o invitar: no hay permisos parciales ni administración a la carta.',
  unban: 'Para que vuelva, invítalo de nuevo desde la tanda: en un grupo básico no hay baneo que levantar.',
} as const;

/** Espejo del descarte de `banProblem` que se puede hacer con la lista en la mano: sin pedir nada. */
export function banishable(member: RosterMember): boolean {
  return member.inside && !member.self && member.status !== ROSTER_STATUS.creator;
}

/**
 * Espejo de `BasicGroupMemberAction.mayRemove`: en un básico manda quien creó el grupo y mientras siga
 * dentro (`ChatMemberStatusCreator.isMember`), y la administración, que en un básico trae todos los
 * derechos aplicables. Sin ese derecho la lista no ofrece ningún botón, porque el puente rechazaría igual.
 */
export function rosterManage(members: RosterMember[]): boolean {
  return members.some(member => member.self &&
    (member.status === ROSTER_STATUS.creator ? member.inside : member.status === ROSTER_STATUS.admin));
}

/** Por qué una fila no ofrece acción: la frase del puente, la misma que oiría si la pidiera. */
export function banishProblem(member: RosterMember): string {
  if (member.self) return BAN_ACTIONS.self;
  if (member.status === ROSTER_STATUS.creator) return BAN_ACTIONS.creator;
  if (!member.inside) return BAN_ACTIONS.outside;
  return '';
}

/** Espejo de `BasicGroupMemberAction.confirm(String,boolean)`: el diálogo nativo dirá exactamente esto. */
export function banishConfirm(name: string, revoke: boolean): string {
  return `Se expulsará a ${name} del grupo de forma definitiva. ${revoke ? BAN_ACTIONS.revokeOn : BAN_ACTIONS.revokeOff}`;
}
