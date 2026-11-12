import { tl } from '@mtcute/web';

/** Nunca mostrar el objeto RPC completo: puede contener contexto privado. */
export function telegramError(error: unknown): string {
  if (tl.RpcError.is(error)) {
    const wait = /^(?:FLOOD_WAIT|SLOWMODE_WAIT)_(\d+)$/.exec(error.text);
    if (wait) return `Telegram pide esperar ${wait[1]} segundos. No reintentaremos automáticamente.`;
    const known: Record<string, string> = {
      PHONE_NUMBER_INVALID: 'Revisa el número con prefijo internacional.',
      PHONE_CODE_INVALID: 'El código no es correcto. Introdúcelo de nuevo en esta pantalla.',
      PHONE_CODE_EXPIRED: 'El código ha caducado. Cancela y vuelve a iniciar sesión.',
      PASSWORD_HASH_INVALID: 'La contraseña 2FA no es correcta.',
      PHONE_NUMBER_BANNED: 'Telegram ha rechazado este número. Consulta su soporte oficial.',
      API_ID_INVALID: 'Telegram ha rechazado las credenciales de aplicación. Revisa el .env local.',
      AUTH_RESTART: 'Telegram solicita reiniciar la autenticación. Cancela y vuelve a intentarlo.',
      CHAT_WRITE_FORBIDDEN: 'No tienes permiso para escribir en esta conversación.',
      USER_BANNED_IN_CHANNEL: 'No puedes escribir en este grupo o canal.',
      CHANNEL_PRIVATE: 'Telegram no permite acceder a este grupo o canal.',
      CHAT_ADMIN_REQUIRED: 'Esta operación requiere permisos de administración.',
      SESSION_REVOKED: 'La sesión fue revocada. Cierra esta prueba e inicia sesión de nuevo.',
      AUTH_KEY_UNREGISTERED: 'La sesión ya no está autorizada. Vuelve a iniciar sesión.',
    };
    return known[error.text] ?? 'Telegram no pudo completar la operación. No se mostrarán datos privados del error.';
  }
  return 'No se pudo completar la operación. Revisa la conexión. No reintentes un envío sin comprobar antes si llegó a Telegram.';
}
