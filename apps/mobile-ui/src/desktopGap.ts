/**
 * La puerta que hace que el andamio de diseño calle lo que el cable de Windows calla (ronda BK).
 *
 * `preview.ts` reparte una sola tabla de respuestas para las dos plataformas: modela el contrato, no el transporte.
 * Eso está bien para lo que ambas capas atienden y es mentira para lo que solo atiende Android, porque con
 * `?preview=1&platform=desktop` la pantalla enseñaba —con datos falsos— familias que el aviso «ALCANCE DE ESTA BETA»
 * acaba de poner en «Pendiente en escritorio». BJ midió el despacho de `TelegramService.cs` y dejó escrito qué claves
 * tienen brazo y cuáles no; esta puerta convierte esa medida en comportamiento: en el andamio, bajo escritorio, una
 * clave pendiente se niega con la frase que el host usaría, no con un dato inventado.
 *
 * La lista de negadas **no se escribe a mano aquí**: sale de `DESKTOP_PENDING` en `desktopScope.ts`, que a su vez la
 * prueba de BJ cruza contra el despacho real. Añadir una familia al aviso sin cable la pone fuera de alcance en las
 * tres capas de golpe; quitarle la guarda al andamio no puede volver a fingirla sin tocar el aviso.
 *
 * Cinco claves se quedan fuera a propósito, y no por comodidad: `message.react.paid`, `poll.stop`, `pinned.list`,
 * `chat.photo.delete` y `location.live.start` ya se niegan dentro del andamio con la frase **con nombre** que el host
 * pronuncia (`DesktopMessageReact.PaidRefused`, `DesktopPoll.NoStop`, `DesktopMessagePin.NoList`,
 * `DesktopChatPhoto.NoDelete` y `DesktopLiveLocation.NoSensor`), que explica por qué falta el brazo —la librería no
 * tiene la petición, gasta dinero sin cartera conectada o el equipo no tiene un sensor del que fiar una coordenada—
 * y no solo que falta. Una puerta genérica delante de ellas las bajaría a un «no está disponible» peor informado.
 * `rondaBK.test.ts` lo comprueba llamando de verdad: si a esas cinco les sale la genérica en vez de la suya, la lista está podrida.
 *
 * La ronda BX bajó de esta lista `message.react` y `message.react.custom`: dejaron de negarse en las dos capas, así
 * que la puerta ya no tiene nada que proteger ahí. Siguen negándose por la puerta genérica las tres claves de
 * historia que la BZ dejó sin cable —`story.reactions`, `story.react`, `story.interactions`—, que no tienen frase con
 * nombre, y `message.retry`, que en el andamio sí se representa pero en el host no tiene brazo.
 */
import { DESKTOP_PENDING } from './desktopScope';

/** La línea `TelegramService.cs:513`, copiada carácter a carácter: `No disponible en escritorio (beta): {method}`. */
export function desktopGenericRefusal(method: string): string {
  return `No disponible en escritorio (beta): ${method}`;
}

/** Las claves que el andamio ya niega por su nombre, y por eso no pasan por la puerta genérica. */
export const DESKTOP_NAMED_IN_SCAFFOLD: readonly string[] = [
  'message.react.paid', 'poll.stop', 'pinned.list', 'chat.photo.delete', 'location.live.start',
];

const PENDING = new Set(DESKTOP_PENDING.flatMap(claim => claim.methods));

/** La frase con la que el andamio debe negarse bajo escritorio, o `undefined` si el host sí atiende la clave. */
export function desktopGapRefusal(method: string): string | undefined {
  if (!PENDING.has(method) || DESKTOP_NAMED_IN_SCAFFOLD.includes(method)) return undefined;
  return desktopGenericRefusal(method);
}
