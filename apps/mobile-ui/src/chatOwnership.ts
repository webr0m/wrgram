/**
 * Espejo literal de `ChatOwnership.java`. Las cuatro condenas están copiadas carácter a carácter porque
 * las pronuncian dos sitios distintos —el puente al escribir y la vista de diseño al simularlo— y
 * `rondaY.test.ts` las compara; lo que solo lee la persona en Android, el texto del `Dialogs` nativo,
 * no se copia aquí porque en la vista de diseño no se pinta ningún diálogo nativo.
 */
export const UNSUPPORTED
  = 'La propiedad solo existe en comunidades: en un chat privado o secreto no hay nada que transferir ni heredar.';
export const BAD_RECIPIENT
  = 'Telegram no entrega la propiedad a un bot ni a una cuenta eliminada: elige a una persona.';
export const SELF_RECIPIENT = 'Elige a otra persona para recibir la propiedad.';
export const NO_SUCCESSOR = 'Telegram no devolvió a quién pasaría la propiedad si sales.';

/** Las dos claves que el puente manda en `when`, y la respuesta que pide elegir heredero. */
export const MOMENTS = { immediate: 'immediate', sevenDays: 'seven_days' } as const;
export const TRANSFER_STATE = 'transfer';

/** `TransferChatOwnership` y `GetChatOwnerAfterLeaving` se documentan para básico, supergrupo y canal. */
export const community = (chat: { type?: string }): boolean => chat.type === 'group' || chat.type === 'channel';

/** La lista de un básico no la da `GetSupergroupMembers`: sale de `groups.members.basic`. */
export const rosterMethod = (chat: { type?: string; supergroup?: boolean }): 'groups.members' | 'groups.members.basic' =>
  chat.type === 'group' && chat.supergroup !== true ? 'groups.members.basic' : 'groups.members';

/**
 * Dos formas de lista, una regla: «The ownership can't be transferred to a bot or to a deleted user»,
 * y a una misma tampoco —entregarse el chat no es un traspaso. No se exige estar dentro: la schema no
 * lo dice, así que aquí tampoco se inventa.
 */
export const eligible = (member: { bot?: boolean; deleted?: boolean; self?: boolean }): boolean =>
  !member.bot && !member.deleted && member.self !== true;

/** `groups.members` responde la lista entera; `groups.members.basic` la envuelve con sus cifras. */
export type Recipient = { id: string; name: string; status?: string; bot?: boolean; deleted?: boolean; self?: boolean };
export const candidates = (method: 'groups.members' | 'groups.members.basic', payload: unknown): Recipient[] => {
  if (method === 'groups.members') return (payload ?? []) as Recipient[];
  return (payload as { members?: Recipient[] })?.members ?? [];
};

/**
 * Lo que la persona se lleva en el aviso después de salir siendo propietaria: no es un «ya no estás»,
 * es la herencia que Telegram ya decidió. El plazo es distinto en un básico y en un supergrupo porque
 * la schema lo dice, y sin heredero se dice que no lo hay en lugar de callarse.
 */
export const exitNotice = (when: string | undefined, successor: string | undefined): string => {
  const who = (successor ?? '').trim();
  if (!who) return `Saliste de la comunidad. ${NO_SUCCESSOR}`;
  return when === MOMENTS.immediate
    ? `Saliste de la comunidad: en un grupo básico la propiedad pasa a ${who} en cuanto sales.`
    : `Saliste de la comunidad: la propiedad seguirá siendo tuya 7 días y, si no vuelves, Telegram se la entregará a ${who}.`;
};
