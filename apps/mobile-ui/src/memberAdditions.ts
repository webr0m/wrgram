import type { AddBatch, AddResult, AddState } from './contract';

/**
 * Añadir gente a un grupo tiene dos voces y deben decir lo mismo: el puente (TDLib) y la interfaz
 * (vista de diseño y avisos). Las frases viven aquí, copiadas literalmente de `MemberAdditions.java`,
 * y `rondaV.test.ts` exige que las dos listas coincidan carácter a carácter —si Java cambia una y
 * TypeScript no, el usuario leería dos explicaciones distintas para el mismo rechazo—.
 */
export const ADD_REJECTIONS = {
  unsupported: 'Solo en grupos se añade a otras personas; en un privado o un secreto Telegram decide quién está.',
  migrated: 'Ese grupo se convirtió en supergrupo; añade a las personas desde el chat nuevo.',
  banned: 'Telegram tiene bloqueada esta cuenta en el grupo: no puede invitar a nadie.',
  outside: 'Primero tienes que estar dentro del grupo para invitar a alguien.',
  noRight: 'Telegram no concede a esta cuenta permiso para invitar en este grupo.',
  full: 'Un grupo básico llega hasta 200 miembros y ya está lleno; Telegram lo convierte en supergrupo antes de admitir más.',
  empty: 'Elige al menos una persona para añadir.',
  tooMany: 'Telegram añade de una en una: selecciona hasta 20 personas por vez.',
  badId: 'Alguna de las personas elegidas no tiene un identificador de Telegram válido.',
  badForward: 'Los mensajes que ve al entrar tienen que ser entre 0 y 100.',
  premiumWouldAllow: 'Telegram solo permite invitar a esta persona con una cuenta con Telegram Premium.',
  premiumRequired: 'Este chat exige Telegram Premium para enviar el enlace a esta persona.',
  failed: 'Telegram no añadió a esta persona.',
  unconfirmed: 'Telegram respondió pero no confirmó la membresía; revisa la lista antes de repetir.',
  cancelled: 'Cancelado: nadie fue añadido.',
} as const;

/** Marcador que el puente manda cuando la persona cerró el diálogo nativo. */
export const ADD_CANCELLED = 'cancelled';

export const ADD_LIMITS = { basic: 200, batch: 20, forward: 100 } as const;

export const STATE_LABELS: Record<AddState, string> = {
  added: 'Añadido',
  rejected: 'No añadido',
  unclear: 'Sin confirmar',
};

/** El puente manda cadenas; una desconocida no se traduce en «añadido» por las dudas. */
export function readState(value: unknown): AddState {
  return value === 'added' || value === 'rejected' || value === 'unclear' ? value : 'unclear';
}

/** Espejo de `MemberAdditions.batch(int)`: cadena vacía significa «el lote cabe». */
export function batchProblem(count: number): string {
  if (count <= 0) return ADD_REJECTIONS.empty;
  if (count > ADD_LIMITS.batch) return ADD_REJECTIONS.tooMany;
  return '';
}

/** Espejo de `MemberAdditions.forwardProblem(int)`: la schema acota `forward_limit` a 100. */
export function forwardProblem(limit: number): string {
  return !Number.isInteger(limit) || limit < 0 || limit > ADD_LIMITS.forward ? ADD_REJECTIONS.badForward : '';
}

/** Espejo de `MemberAdditions.positive(String)`: dígitos sueltos y mayores que cero. */
export function positiveId(value: string): boolean {
  return /^[1-9][0-9]{0,18}$/.test(value);
}

/**
 * Espejo del `Long.parseLong` de `addMembers` (`NativeBridge.java:2183`): diecinueve dígitos no caben
 * todos y el puente lo cuenta como identificador inválido, no como persona inexistente. Java lo comprueba
 * tras `positive`, con su mismo mensaje, así que vive aparte y no dentro del regex.
 */
export function fitsLong(value: string): boolean {
  return value.length < 19 || value <= '9223372036854775807';
}

export function forwardNotice(limit: number): string {
  if (limit <= 0) return '';
  return `Verá los ${Math.min(limit, ADD_LIMITS.forward)} mensajes anteriores.`;
}

/**
 * Resumen de una tanda. Se cuenta lo que Telegram confirmó, lo que rechazó y lo que quedó sin
 * confirmar por separado: mezclarlos sería decir «3 añadidos» cuando dos pueden seguir fuera.
 */
export function batchNotice(batch: AddBatch): string {
  // Cerrar el diálogo nativo no es una tanda con cero añadidos: no se preguntó a nadie.
  if (batch.stopped === ADD_CANCELLED) return ADD_REJECTIONS.cancelled;
  const counted = (state: AddState) => batch.results.filter(item => readState(item.state) === state).length;
  const added = counted('added'), rejected = counted('rejected'), unclear = counted('unclear');
  const parts: string[] = [];
  if (added) parts.push(`${added} ${added === 1 ? 'persona añadida' : 'personas añadidas'}`);
  if (rejected) parts.push(`${rejected} ${rejected === 1 ? 'persona quedó fuera' : 'personas quedaron fuera'}`);
  if (unclear) parts.push(`${unclear} sin confirmar`);
  if (!parts.length) parts.push('Nadie fue añadido');
  const tail = batch.stopped ? ` Telegram cortó la tanda: ${batch.stopped}` : '';
  return `Resultado en Telegram: ${parts.join(', ')}.${tail}`;
}

/** Línea por persona: el nombre y, si Telegram dijo algo, su motivo exacto. */
export function outcomeLine(item: AddResult): string {
  const state = readState(item.state);
  const reason = state === 'added' ? '' : item.reason.trim();
  return `${item.name} · ${STATE_LABELS[state]}${reason ? ` · ${reason}` : ''}`;
}

/**
 * Lo que se muestra antes de preguntar: quién puede entrar y por qué la acción está o no disponible.
 * El motivo lo escribió el puente; aquí solo se añade la promesa honesta de lo que pasará.
 */
export function permissionLine(reason: string, remaining: number): string {
  if (reason) return reason;
  if (remaining < 0) return 'Telegram decide persona por persona: puede añadir, invitar o negarse sin explicación.';
  return `Quedan ${Math.max(remaining, 0)} huecos de los ${ADD_LIMITS.basic} que Telegram admite en un grupo básico.`;
}
