/**
 * Telegram contesta a un ingreso de cuatro maneras distintas y WRGram tiene que decirlas todas con
 * las mismas palabras desde el menú del chat y desde el enlace de invitación, que son los dos
 * caminos posibles. Las claves las fija `ChatMembership.java`; aquí viven solo las frases.
 */
export const membershipNotice = (state: string, opened = false): string => {
  switch (state) {
    case 'joined': return 'Telegram añadió esta cuenta a la comunidad.';
    case 'request': return 'Quedó enviada la solicitud de ingreso: los administradores de la comunidad deben aprobarla.';
    case 'guard': return opened
      ? 'La comunidad exige la aprobación de un bot de seguridad. Se abrió su chat en Telegram: sigue su indicación para terminar el ingreso.'
      : 'La comunidad exige la aprobación de un bot de seguridad y WRGram no pudo abrir su chat. Termina el ingreso desde el chat del bot.';
    case 'declined': return 'El bot de seguridad de la comunidad rechazó el ingreso: Telegram no añadió esta cuenta.';
    case 'left': return 'La cuenta dejó de ser miembro de la comunidad en Telegram.';
    case 'cancelled': return '';
    // La interfaz abre el selector de traspaso antes de llegar aquí; la frase vacía existe para que
    // esta respuesta no caiga en el «no sé interpretarlo» de abajo si alguien la manda directo al aviso.
    case 'transfer': return '';
    default: return 'Telegram contestó algo que WRGram no sabe interpretar; no se dio por hecho que entraste.';
  }
};

/**
 * `JoinChat` y `LeaveChat` dicen en la schema «Private and secret chats can't be joined/left using this
 * method», así que ofrecer la acción en un uno a uno es prometer un método que Telegram no admite. La
 * pronuncian los dos puentes con las mismas palabras: `NativeBridge.MEMBERSHIP_UNSUPPORTED` en Android y
 * `DesktopMembership.Unsupported` en Windows, y `rondaZ.test.ts` las compara carácter a carácter.
 */
export const MEMBERSHIP_UNSUPPORTED = 'Unirse y salir solo existen para grupos, supergrupos y canales.';

/**
 * Un chat que no está en la lista de la cuenta es el único caso real en el que «unirse» es la acción:
 * Telegram solo deja fuera de la lista un chat del que no se es miembro, y al abrirlo por su usuario
 * público la ficha llega sin lista.
 */
export const joinable = (chat: { inList?: boolean }): boolean => chat.inList === false;
