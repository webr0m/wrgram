/**
 * El espejo de `DesktopMemberSanctions.cs` (ronda AZ): las reglas y las frases con las que el puente de Windows
 * administra una fila de supergrupo o canal —`groups.member.ban`, `restrict`, `promote`, `demote` y `unban`—. No son
 * palabras de la interfaz: son las cadenas que el host devuelve, copiadas carácter a carácter de
 * `NativeBridge.java:2880`, `:2851`, `:2852`, `:2853` y `:2879`, y `rondaAZ.test.ts` las compara con el C# letra por
 * letra para que el andamio no enseñe nunca una frase que Windows no diría.
 *
 * Cada regla está escrita una sola vez aquí, en tres fases, igual que en el puente: `…Pre` es lo que se sabe sin
 * mirar a Telegram, `…Right` lo que manda leer la fila propia y `…Target` lo que manda leer la ajena. La pantalla
 * también llama a estas funciones (`App.tsx`), así que el cuadro de confirmación y el puente dicen lo mismo porque
 * son la misma cadena, no dos copiadas.
 */

import type { GroupAdminRights } from './contract';

/** Las cuatro claves de `DesktopMemberSanctions` que no son sanción: la forma, el plazo y el canal. */
export const SANCTION_REFUSALS = {
  requiresSupergroup: 'Esta acción requiere un supergrupo o canal.',
  badDuration: 'La duración debe ser permanente o estar entre 1 minuto y 366 días.',
  channelNoRestrict: 'Los canales no admiten restricciones de miembros; usa Banear para expulsar del canal.',
  noRestrictRight: 'Telegram no concede permiso para restringir miembros.',
  noDeleteRight: 'Telegram no permite borrar mensajes de un miembro desde este tipo de chat o tu cuenta no tiene ese permiso.',
  noLiftRight: 'Telegram no concede permiso para quitar restricciones.',
  noPromoteRight: 'Telegram no concede a esta cuenta permiso para administrar roles.',
  noDemoteRight: 'Telegram no concede a esta cuenta permiso para quitar roles de administrador.',
  selfMenu: 'No puedes cambiar tu propio estado desde este menú.',
  selfList: 'No puedes cambiar tu propio estado desde esta lista.',
  selfRole: 'No puedes cambiar tu propio rol desde aquí.',
  selfDemote: 'No puedes quitarte el rol desde este menú.',
  notSanctionable: 'Telegram solo permite aplicar esta acción a un miembro normal o ya restringido. Los administradores deben perder su rol primero.',
  notLiftable: 'Este usuario ya no figura como baneado o restringido.',
  notPromotable: 'Telegram solo permite promover a un miembro normal o editar un administrador que puedas modificar.',
  notEditableAdmin: 'Telegram no permite editar este rol de administrador.',
  noDelegation: 'No puedes delegar un permiso que no tienes en Telegram.',
  incompatibleRight: 'Uno de los permisos no es compatible con este tipo de chat.',
  noRightSelected: 'Selecciona al menos un permiso administrativo.',
  revokeFailed: 'La restricción se aplicó, pero Telegram no permitió borrar los mensajes: ',
  needsHash: 'Telegram no dio los datos necesarios para cambiar el estado de esta persona. Vuelve a abrir la lista e inténtalo de nuevo.',
} as const;

/** Los diez rótulos de los cuatro cuadros, que en Windows salen del propio puente (`ConfirmPhoto`). */
export const SANCTION_LABELS = {
  restrict: 'Restringir',
  ban: 'Banear',
  liftBan: 'Quitar baneo',
  liftRestriction: 'Quitar restricción',
  promote: 'Promover',
  saveRights: 'Guardar permisos',
  nameAdmin: 'Promover a administrador',
  editRights: 'Editar permisos de administrador',
  demote: 'Quitar administración',
  removeRole: 'Quitar rol',
} as const;

/** El `optLong("duration",3600)` de `:2793` y sus dos bordes, incluido el cero de «permanente». */
export const SANCTION_DURATION = { default: 3600, min: 60, max: 366 * 86400 } as const;

/**
 * Las dieciséis claves en el orden de `:2763`, cada una con la puerta de tipo de chat que `DesktopGroupMembers.Actor`
 * llama `Gate`. `any` viaja en cualquier comunidad, `channel` solo tiene sentido en un canal, `community` solo fuera
 * de él y `forum` está reservada a los foros. La guarda de la ronda AZ compara esta tabla con la del C#.
 */
export const ADMIN_RIGHT_RULES: { key: keyof GroupAdminRights; gate: 'any' | 'channel' | 'community' | 'forum' }[] = [
  { key: 'canChangeInfo', gate: 'any' },
  { key: 'canPostMessages', gate: 'channel' },
  { key: 'canEditMessages', gate: 'channel' },
  { key: 'canDeleteMessages', gate: 'any' },
  { key: 'canInviteUsers', gate: 'any' },
  { key: 'canRestrictMembers', gate: 'any' },
  { key: 'canPinMessages', gate: 'community' },
  { key: 'canManageTopics', gate: 'forum' },
  { key: 'canPromoteMembers', gate: 'any' },
  { key: 'canManageVideoChats', gate: 'any' },
  { key: 'canPostStories', gate: 'any' },
  { key: 'canEditStories', gate: 'any' },
  { key: 'canDeleteStories', gate: 'any' },
  { key: 'canManageDirectMessages', gate: 'channel' },
  { key: 'canManageTags', gate: 'community' },
  { key: 'canSendWelcomeMessages', gate: 'any' },
];

/** Las dieciséis etiquetas de `adminRightsSummary` (`:2664`), en minúsculas, unidas con coma en el cuadro. */
export const ADMIN_RIGHT_SUMMARY: Record<keyof GroupAdminRights, string> = {
  canChangeInfo: 'editar información',
  canPostMessages: 'publicar en canales',
  canEditMessages: 'editar mensajes',
  canDeleteMessages: 'borrar mensajes',
  canInviteUsers: 'invitar miembros',
  canRestrictMembers: 'restringir miembros',
  canPinMessages: 'fijar mensajes',
  canManageTopics: 'gestionar temas',
  canPromoteMembers: 'promover administradores',
  canManageVideoChats: 'gestionar videollamadas',
  canPostStories: 'publicar historias',
  canEditStories: 'editar historias',
  canDeleteStories: 'eliminar historias',
  canManageDirectMessages: 'gestionar mensajes directos',
  canManageTags: 'gestionar etiquetas',
  canSendWelcomeMessages: 'enviar bienvenidas',
};

/**
 * El `NoRights()` del cable (`DesktopMemberSanctionFlow.DemoteMemberAsync`): las dieciséis banderas existentes,
 * todas a `false`, que es como `ChatAdminRights` nace en C# y como arranca el cuadro de permisos de la pantalla.
 */
export const NO_ADMIN_RIGHTS: GroupAdminRights = {
  canChangeInfo: false, canPostMessages: false, canEditMessages: false, canDeleteMessages: false,
  canInviteUsers: false, canRestrictMembers: false, canPinMessages: false, canManageTopics: false,
  canPromoteMembers: false, canManageVideoChats: false, canPostStories: false, canEditStories: false,
  canDeleteStories: false, canManageDirectMessages: false, canManageTags: false, canSendWelcomeMessages: false,
};

/** `banDurationLabel` (`:2767`): primero el cero, luego días, luego horas y al final minutos, sin pluralizar. */
export function sanctionDurationLabel(seconds: number): string {
  if (seconds === 0) return 'de forma permanente';
  if (seconds % 86400 === 0) return `durante ${Math.floor(seconds / 86400)} día(s)`;
  if (seconds % 3600 === 0) return `durante ${Math.floor(seconds / 3600)} hora(s)`;
  return `durante ${Math.floor(seconds / 60)} minuto(s)`;
}

/** El título de `:2793`: la acción y el nombre, con el espacio de `action+" a "+name`. */
export function sanctionTitle(restrict: boolean, name: string): string {
  return `${sanctionAction(restrict)} a ${name}`;
}

export function sanctionAction(restrict: boolean): string {
  return restrict ? SANCTION_LABELS.restrict : SANCTION_LABELS.ban;
}

/** El cuerpo de `:2793`, con sus cuatro piezas en el orden exacto. */
export function sanctionBody(restrict: boolean, name: string, duration: number, deleteMessages: boolean): string {
  return `${restrict ? 'Se quitarán los permisos de envío a ' : 'Se expulsará a '}${name} ${sanctionDurationLabel(duration)}. ${deleteMessages ? 'También se borrarán todos los mensajes que envió en este chat. ' : 'No se borrarán mensajes. '}Telegram validará el cambio en la cuenta.`;
}

/** El título y el botón de `:2760`, que son la misma cadena. */
export function liftTitle(banned: boolean): string {
  return banned ? SANCTION_LABELS.liftBan : SANCTION_LABELS.liftRestriction;
}

/** El cuerpo de `:2760` —también el de la pantalla antes de llamar al puente, porque es la misma frase—. */
export function liftBody(name: string): string {
  return `Se restaurará el acceso completo de ${name} a este grupo o canal. No se enviará una invitación.`;
}

export function promoteTitle(editing: boolean): string {
  return editing ? SANCTION_LABELS.editRights : SANCTION_LABELS.nameAdmin;
}

export function promoteAction(editing: boolean): string {
  return editing ? SANCTION_LABELS.saveRights : SANCTION_LABELS.promote;
}

/** El cuerpo de `:2765`: a quién, con qué palabras y qué permisos concretos. */
export function promoteBody(editing: boolean, name: string, rights: Partial<GroupAdminRights>): string {
  return `${editing ? 'Se actualizarán los permisos de ' : 'Se otorgarán a '}${name}: ${adminRightsSummary(rights)}. Telegram volverá a validar tu autoridad.`;
}

export function demoteBody(name: string): string {
  return `${name} dejará de ser administrador y conservará su membresía normal.`;
}

/** El `String.join(", ",labels)` de `:2664`, en el orden de la tabla y solo con lo concedido. */
export function adminRightsSummary(rights: Partial<GroupAdminRights>): string {
  return ADMIN_RIGHT_RULES.filter(entry => rights[entry.key]).map(entry => ADMIN_RIGHT_SUMMARY[entry.key]).join(', ');
}

/** La fase sin red de `:2793`: cuenta propia, plazo y canal. */
export function sanctionPreProblem(self: boolean, duration: number, restrict: boolean, channel: boolean): string {
  if (self) return SANCTION_REFUSALS.selfMenu;
  if (duration !== 0 && (duration < SANCTION_DURATION.min || duration > SANCTION_DURATION.max)) return SANCTION_REFUSALS.badDuration;
  if (restrict && channel) return SANCTION_REFUSALS.channelNoRestrict;
  return '';
}

/** La fase con la fila propia leída: el derecho de sancionar y el de borrar mensajes, que no vale en un canal. */
export function sanctionRightProblem(canRestrict: boolean, canDeleteMessages: boolean, channel: boolean, deleteMessages: boolean): string {
  if (!canRestrict) return SANCTION_REFUSALS.noRestrictRight;
  if (deleteMessages && (!canDeleteMessages || channel)) return SANCTION_REFUSALS.noDeleteRight;
  return '';
}

/** La fase con la fila ajena: solo un miembro normal o ya restringido se sanciona. */
export function sanctionTargetProblem(normal: boolean, restricted: boolean): string {
  return normal || restricted ? '' : SANCTION_REFUSALS.notSanctionable;
}

export function liftPreProblem(self: boolean): string {
  return self ? SANCTION_REFUSALS.selfList : '';
}

export function liftRightProblem(canRestrict: boolean): string {
  return canRestrict ? '' : SANCTION_REFUSALS.noLiftRight;
}

export function liftTargetProblem(banned: boolean, restricted: boolean): string {
  return banned || restricted ? '' : SANCTION_REFUSALS.notLiftable;
}

export function promotePreProblem(self: boolean): string {
  return self ? SANCTION_REFUSALS.selfRole : '';
}

export function promoteRightProblem(canPromote: boolean): string {
  return canPromote ? '' : SANCTION_REFUSALS.noPromoteRight;
}

export function promoteTargetProblem(normal: boolean, editable: boolean): string {
  return normal || editable ? '' : SANCTION_REFUSALS.notPromotable;
}

export function demotePreProblem(self: boolean): string {
  return self ? SANCTION_REFUSALS.selfDemote : '';
}

export function demoteRightProblem(canPromote: boolean): string {
  return canPromote ? '' : SANCTION_REFUSALS.noDemoteRight;
}

export function demoteTargetProblem(editable: boolean): string {
  return editable ? '' : SANCTION_REFUSALS.notEditableAdmin;
}

/**
 * `requestedAdminRights` (`:2763`): las dieciséis casillas pasadas por la delegación y por la puerta del tipo de
 * chat, y el veto a la administración vacía. `granted` es lo que la propia cuenta tiene y `current` lo que Telegram
 * ya tenía escrito en la fila cuando se edita; sin `current`, quitar una casilla que la pantalla no enseñaba
 * borraría un permiso.
 *
 * Devuelve el conjunto que se escribe o la frase con la que se niega, nunca las dos. La bandera `ok` es la que
 * elige el llamador: sin ella, TypeScript no sabe que un problema vacío implica un conjunto ya construido.
 */
export function requestedRights(
  requested: Partial<GroupAdminRights>,
  granted: Partial<GroupAdminRights>,
  current: Partial<GroupAdminRights> | null,
  channel: boolean,
  forum: boolean,
): { ok: true; rights: GroupAdminRights } | { ok: false; problem: string } {
  const chosen: GroupAdminRights = { ...NO_ADMIN_RIGHTS };
  let any = false;
  for (const { key, gate } of ADMIN_RIGHT_RULES) {
    const asked = requested[key] === true;
    let picked: boolean;
    if (granted[key]) picked = asked;
    else if (current) picked = current[key] === true;
    else if (asked) return { ok: false, problem: SANCTION_REFUSALS.noDelegation };
    else picked = false;
    if (!picked) continue;
    const allowed = gate === 'any' ? true : gate === 'channel' ? channel : gate === 'community' ? !channel : forum;
    if (!allowed) return { ok: false, problem: SANCTION_REFUSALS.incompatibleRight };
    chosen[key] = true;
    any = true;
  }
  if (!any) return { ok: false, problem: SANCTION_REFUSALS.noRightSelected };
  return { ok: true, rights: chosen };
}
