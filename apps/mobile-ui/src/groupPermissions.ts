import type { GroupPermissions } from './contract';

/**
 * El espejo de `DesktopGroupPermissions.cs` (ronda BE): las cinco negaciones que las dos capas dicen sobre los
 * permisos predeterminados de una comunidad, las dieciséis claves del DTO con su orden y el paso de la tabla. Son las
 * cadenas que el puente devuelve —`NativeBridge.java:1868` y `:2376` los dos `answer.fail`, `DesktopGroupPermissions`
 * las mismas en C#—, copiadas carácter a carácter; `rondaBE.test.ts` las compara con el Java y con el C# para que la
 * vista de diseño no enseñe nunca una palabra que Android o Windows no dirían.
 *
 * Lo que no está aquí a propósito: las etiquetas del panel. `GROUP_PERMISSION_FIELDS` (`App.tsx:1407`) ya es la tabla
 * que la pantalla pinta, con su orden de lectura para una persona, y esta es la orden del puente. Son dos cosas
 * distintas y por eso viven separadas: la interfaz agrupa por tema, el contrato por la posición del constructor de
 * `TdApi.ChatPermissions` (`TdApi.java:17751`).
 */
export const GROUP_PERMISSION_REFUSALS = {
  /** El `answer.fail` de la forma en `groupPermissions` (`:1868`). */
  unsupported: 'La edición de permisos solo está disponible en supergrupos y canales.',
  /** El `IllegalArgumentException` de la forma en `setGroupPermissions` (`:2376`). */
  required: 'Se requiere un supergrupo o canal.',
  /** Las dos veces que se niega el derecho, en `:1868` y en `:2376`. */
  noRight: 'Telegram no concede a esta cuenta el permiso para cambiar permisos del grupo.',
  /** El `answer.fail` de `:1868` cuando TDLib aún no traía la tabla. */
  unreadable: 'Telegram aún no cargó los permisos predeterminados.',
  /** Lo que en Android provoca `requiredBool` (`:2757`) y aquí es la causa dicha en español. */
  incomplete: 'Algún permiso no llegó marcado como verdadero o falso. Vuelve a abrir el panel y guárdalos otra vez.',
  /** La guarda de cuenta del botón positivo de `:2376`. */
  changedAccount: 'La cuenta cambió. No se cambiaron permisos.',
} as const;

/**
 * Las dieciséis claves en el orden del `object(...)` de `:1868`, que es el del constructor de
 * `TdApi.ChatPermissions` (`TdApi.java:17751`) y el de los dieciséis `requiredBool` de `:2376`. El orden no es
 * cosmético: es lo que el test compara con las dos capas, porque una tabla escrita en otro orden se lee igual y
 * desordena el DTO que Android fabrica.
 */
export const GROUP_PERMISSION_KEYS: (keyof GroupPermissions)[] = [
  'canSendBasicMessages', 'canSendAudios', 'canSendDocuments', 'canSendPhotos', 'canSendVideos',
  'canSendVideoNotes', 'canSendVoiceNotes', 'canSendPolls', 'canSendOtherMessages', 'canAddLinkPreviews',
  'canReactToMessages', 'canEditTag', 'canChangeInfo', 'canInviteUsers', 'canPinMessages', 'canCreateTopics',
];

/** La ficha sintética: la tabla que Telegram tendría guardada y si la llegó a cargar. */
export interface GroupPermissionsFixture { rights: GroupPermissions; known: boolean }

/** Todas las casillas en el mismo estado: `false` es el canal donde los miembros no pueden hacer nada. */
export function fixedPermissions(value: boolean): GroupPermissions {
  return GROUP_PERMISSION_KEYS.reduce((rights, key) => ({ ...rights, [key]: value }), {} as GroupPermissions);
}

/** Sin prohibiciones: lo que MTProto escribe como `chatBannedRights` con todas las banderas apagadas. */
export function allowedPermissions(): GroupPermissions {
  return fixedPermissions(true);
}

/**
 * El `requiredBool` de `:2376` y el `PermissionValues` de `DesktopGroupPermissionsFlow` hechos una sola pasada: las
 * dieciséis claves tienen que llegar como booleanos, y lo que sobre se ignora. `null` es el mensaje mal formado, que
 * la pantalla no produce nunca —el panel siempre manda la tabla entera—, así que esta negativa solo la provoca una
 * llamada fuera de lo que la interfaz ofrece.
 */
export function completePermissions(values: Record<string, unknown>): GroupPermissions | null {
  if (!GROUP_PERMISSION_KEYS.every(key => typeof values[key] === 'boolean')) return null;
  return GROUP_PERMISSION_KEYS.reduce(
    (rights, key) => ({ ...rights, [key]: values[key] as boolean }),
    {} as GroupPermissions,
  );
}

/** El DTO de `:1868` leído sobre la ficha. */
export function permissionsDto(entry: GroupPermissionsFixture): GroupPermissions | null {
  return entry.known ? GROUP_PERMISSION_KEYS.reduce(
    (value, key) => ({ ...value, [key]: entry.rights[key] }),
    {} as GroupPermissions,
  ) : null;
}

/**
 * El espejo local después del `true`, que es lo que en Windows hace `DesktopGroupPermissions.Apply` sobre el
 * `TL.Channel`: la respuesta de Telegram no devuelve la tabla nueva, así que la mueve la propia capa para que reabrir
 * el panel enseñe lo que se acaba de guardar.
 */
export function applyPermissions(entry: GroupPermissionsFixture, values: GroupPermissions): void {
  entry.rights = { ...values };
  entry.known = true;
}
