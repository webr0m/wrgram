/**
 * El espejo de `DesktopChatUsernames.cs` (ronda BC): las dos negaciones que el puente de Windows dice con nombre
 * propio sobre el nombre público de una comunidad. No son frases de la interfaz —`App.tsx` solo muestra lo que el
 * puente respondió—, son las cadenas que el host devuelve, copiadas carácter a carácter, y `rondaBC.test.ts` las
 * compara con el C# y con la litera de Java para que el andamio de diseño no enseñe nunca una palabra que Windows
 * o Android no dirían.
 *
 * Lo que no está aquí a propósito: el tope y el patrón del nombre. `BridgePolicy.text(p,"username",32)` más
 * `[A-Za-z][A-Za-z0-9_]{4,31}` son exactamente los de `account.username`, así que siguen viviendo en
 * `ACCOUNT_MAX`, `ACCOUNT_USERNAME` y `profileUsernameProblem` de `preview.ts`, y esta ronda los reutiliza en lugar
 * de volver a declararlos. Una norma, un sitio por capa.
 */

/**
 * `DesktopChatUsernames.Unsupported` (`NativeBridge.java:1890` y `:1889` —los dos métodos dicen la misma cadena—)
 * y `DesktopChatUsernames.NoRight` (`answer.fail` de `:1889`).
 */
export const CHAT_USERNAME_REFUSALS = {
  unsupported: 'Los nombres públicos solo están disponibles en supergrupos y canales.',
  noRight: 'Telegram no concede a esta cuenta permiso para cambiar el nombre público.',
} as const;

/**
 * Las dos claves del DTO de `sendChatUsername` (`:1891`), en su orden. `editable` es el nombre que la cuenta puede
 * cambiar —el que la caja de texto prellena—, y `active` la lista entera de los encendidos, que es lo que la
 * pantalla muestra como `@a, @b` antes de la caja.
 */
export interface ChatUsernameFixture { editable: string; active: string[] }
