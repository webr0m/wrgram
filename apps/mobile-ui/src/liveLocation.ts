/**
 * Las duraciones que la pantalla ofrece al compartir una ubicación en directo (ronda CB).
 *
 * No son una preferencia de diseño: son las cuatro que Android acepta, medidas en el puente.
 * `LiveLocationPolicy.DURATIONS` (`LiveLocationPolicy.java:29`) es la lista con la que el diálogo nativo arma su
 * botón, y cada rótulo sale de `LiveLocationPolicy.label` (`:100-111`), que escribe «minutos» por debajo de la hora,
 * «hora/horas» hasta el máximo y «sin límite» cuando el periodo vale `Integer.MAX_VALUE`. Aquí la lista va escrita en
 * claro porque es la que se lee en el menú, y `rondaCB.test.ts` la coteja carácter a carácter con las dos cifras
 * java: si el puente cambia una cota sin cambiar el menú, la pantalla ofrecería una duración que el nativo rechaza
 * con «Elige una duración entre 1 minuto y 24 horas.».
 */
export type LiveDuration = { readonly period: number; readonly label: string };

/** Las cuatro opciones del menú, en el orden en que se pintan. */
export const LIVE_DURATIONS: readonly LiveDuration[] = [
  { period: 900, label: '15 minutos' },
  { period: 3600, label: '1 hora' },
  { period: 28800, label: '8 horas' },
  { period: 86400, label: '24 horas' },
];

/** Lo que el puente respondió a `location.live.start`: la fila escrita y hasta cuándo la va a renovar el teléfono. */
export type LiveStart = { id: string; chatId: string; expiresAt: number };

/**
 * Las cinco negativas de la familia, copiadas carácter a carácter de quien las pronuncia:
 * `LiveLocationPolicy.ALREADY` (`LiveLocationPolicy.java:48`), `LiveLocationPolicy.BAD_PERIOD`
 * (`LiveLocationPolicy.java:52`), `LiveLocationPolicy.NOT_SHARING` (`LiveLocationPolicy.java:50`) y el
 * «La ubicación ya no está disponible.» de `NativeBridge.java:4920` en Android, y
 * `DesktopLiveLocation.NoSensor` y `DesktopLiveLocation.NotSharing` en Windows. `rondaCB.test.ts` las vuelve a medir
 * contra las dos fuentes: la pantalla y el andamio no pueden contar una historia distinta de la del cable.
 */
export const LIVE_REFUSALS = {
  already: 'Ya estás compartiendo una ubicación en directo. Detenla antes de empezar otra.',
  notSharing: 'No estás compartiendo ninguna ubicación en directo en este chat.',
  badPeriod: 'Elige una duración entre 1 minuto y 24 horas.',
  gone: 'La ubicación ya no está disponible.',
  noSensor: 'Windows no puede leer una ubicación. No se envió ninguna ubicación en directo.',
};
