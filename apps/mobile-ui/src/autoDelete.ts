/**
 * El espejo de `DesktopAutoDelete.cs` (ronda BN): las frases con las que las dos capas niegan el borrado automático,
 * la regla de la duración y las dos claves del DTO. Son las cadenas que el puente devuelve —`AccountSafetyPolicy.java:11`,
 * `:15` y `:17`, más los `answer.fail` de `NativeBridge.java:1404`, `:1373`, `:1381` y `:1392`, todas copiadas
 * carácter a carácter en C#—, y `rondaBN.test.ts` las compara con el Java y con el C# para que el andamio de diseño
 * no enseñe nunca una palabra que Android o Windows no dirían.
 *
 * Lo que no está aquí a propósito: las etiquetas del panel. `AutoDeleteSettings.tsx` ya pinta los cuatro botones
 * (Desactivado / 24 horas / 7 días / 30 días) y la caja de 0 a 365, que son la tabla de la interfaz; esta es la orden
 * del puente. Son dos cosas distintas y por eso viven separadas.
 */

/** El paso único que Telegram admite en este ajuste: días, medidos en segundos. */
export const AUTO_DELETE_DAY = 86400;

/** `AccountSafetyPolicy.java:17`: 365 días, y ni una hora más. */
export const AUTO_DELETE_MAX_DAYS = 365;

/** El `777000` de `NativeBridge.java:1381` y `:1370`: el usuario con el que Telegram habla solo. */
export const AUTO_DELETE_TELEGRAM_NOTICES = 777000;

/**
 * Las nueve frases con las que el puente niega algo de esta familia. `wrongAccount` es la primera que se comprueba en
 * las cuatro órdenes (`AccountSafetyPolicy.java:11`); `badDuration` y `outOfRange` salen de `:15` y `:17`;
 * `notAllowedHere` y `noRight` son las dos ramas de `:1370` y `:1373`, que se distinguen por la forma del chat y no
 * por el deseo de la pantalla; `changed` y `defaultChanged` son las dos guardas contra el otro dispositivo (`:1381` y
 * `:1359`); `changedAccount` es la del botón positivo (`:1392`). La novena, `unreadable`, no tiene litera en Android:
 * es la que el host de Windows pronuncia cuando una de sus lecturas no devuelve el número, y cambia el sustantivo de
 * la frase con la que la ronda AW nombró el mismo silencio —allá era la descripción de la comunidad, aquí es el
 * temporizador de la conversación—, así que no reutiliza aquella cadena.
 */
export const AUTO_DELETE_REFUSALS = {
  wrongAccount: 'La cuenta cambió. Vuelve a abrir este ajuste.',
  badDuration: 'Duración no válida.',
  outOfRange: 'Elige de 0 a 365 días completos.',
  notAllowedHere: 'Telegram no permite borrado automático en este chat.',
  noRight: 'Necesitas permiso para cambiar la información del chat.',
  changed: 'El temporizador cambió. Actualiza el estado antes de modificarlo.',
  defaultChanged: 'El ajuste cambió en otro dispositivo. Actualiza el estado.',
  changedAccount: 'La cuenta cambió. No se modificó el temporizador.',
  unreadable: 'Telegram no devolvió la información actual de la conversación. Vuelve a intentarlo.',
} as const;

/** El rótulo del botón positivo (`NativeBridge.java:1425`); el negativo es «Cancelar» y los dos responden sin tocar Telegram. */
export const AUTO_DELETE_ACCEPT = 'Aplicar en Telegram';

/** El título del modo predeterminado, que en Android es literal (`:1357`) porque no hay comunidad que nombrar. */
export const AUTO_DELETE_NEW_CHATS = 'Chats nuevos';

/** `DesktopAutoDelete.DialogTitle`: «Borrado automático · » más el nombre recortado a 100 con la elipsis de `DesktopContact.Limit`. */
export function autoDeleteTitle(title: string): string {
  return 'Borrado automático · ' + (title.length > 100 ? title.slice(0, 100) + '…' : title);
}

/** El cuerpo de `:1388`. El cero no borra nada ahora: apaga el temporizador de los mensajes futuros, y el texto lo dice. */
export function autoDeleteBody(seconds: number): string {
  return seconds === 0
    ? 'Se desactivará el temporizador para los mensajes futuros. Esto no recupera mensajes ya borrados.'
    : 'Los mensajes futuros se eliminarán automáticamente para todos después de ' + Math.floor(seconds / AUTO_DELETE_DAY) +
      ' días. No es una limpieza del historial existente.';
}

/**
 * `AccountSafetyPolicy.autoDeleteSeconds` (`:13-19`): primero la forma del campo y luego su valor, con las dos frases
 * en ese orden. Devuelve el problema en vez de lanzarlo porque el andamio pinta la frase, no la corta.
 */
export function autoDeleteProblem(seconds: unknown): string | null {
  if (typeof seconds !== 'number' || !Number.isInteger(seconds)) return AUTO_DELETE_REFUSALS.badDuration;
  if (seconds < 0 || seconds > AUTO_DELETE_MAX_DAYS * AUTO_DELETE_DAY || seconds % AUTO_DELETE_DAY !== 0)
    return AUTO_DELETE_REFUSALS.outOfRange;
  return null;
}

/**
 * `DesktopAutoDelete.Owns`, que es la lectura del `accountId` que hace `AccountSafetyPolicy.owner` (`:11`) sin librería:
 * sin clave se responde la sesión que el host ya tiene —el mismo criterio con el que convivieron las rondas BF y BL—,
 * y con clave tiene que ser esta. Android es más estricto: `BridgePolicy.id` devuelve `0` cuando la clave falta, así
 * que un `accountId` ausente ya es un cambio de cuenta. Ninguna pantalla llega a esa diferencia: las dos capas mandan
 * siempre el `selfId` que leyeron al montar (`AutoDeleteSettings.tsx:12` y `AutoDeleteSettings.tsx:21`), y el panel
 * se remonta con `key` cuando la cuenta cambia.
 */
export function autoDeleteOwned(accountId: unknown, selfId: string): boolean {
  return typeof accountId !== 'string' || accountId === selfId;
}

/**
 * `userId!=session.selfId&&userId!=777000` (`:1347`): en un particular no hay derecho que leer, hay dos chats que no
 * admiten temporizador —la propia cuenta, que es «Mensajes guardados», y el usuario de avisos—.
 */
export function canChangeAutoDelete(userId: number, selfId: number): boolean {
  return userId !== selfId && userId !== AUTO_DELETE_TELEGRAM_NOTICES;
}

/** La ficha sintética del andamio: lo que Telegram tendría guardado para esa conversación. */
export interface AutoDeleteFixture { seconds: number; canChange: boolean }
