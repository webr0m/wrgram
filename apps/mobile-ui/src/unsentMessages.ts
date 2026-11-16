import type { Message } from './contract';

/**
 * Espejo de las reglas de `UnsentMessages.java`. La interfaz no decide nada sobre un envío fallido:
 * traduce los campos que Telegram mandó y reproduce las mismas frases con las que el puente rechaza
 * la operación, para que un botón nunca prometa lo que el nativo va a negar. La explicación larga
 * del reintento y del descartado vive solo en Java, porque es el texto del diálogo nativo.
 */

/** Un mensaje solo está sin enviar si es propio y Telegram todavía no lo dio por bueno. */
export const waiting = (message: Message): boolean => message.outgoing && (message.status === 'pending' || message.status === 'failed');

export function retryProblem(message: Message): string | undefined {
  if (!message.outgoing) return 'Solo puedes reintentar mensajes que enviaste tú.';
  const info = message.unsent;
  if (!info) return 'Este mensaje ya está en Telegram.';
  if (info.pending) return 'Telegram sigue intentando enviar este mensaje. Espera a que termine antes de repetirlo.';
  if (!info.canRetry) return 'Telegram no admite reintentar este mensaje.';
  if (Number(info.stars) > 0) return `Telegram pide ${info.stars} Stars para enviar este mensaje otra vez; hazlo desde el propio mensaje, donde puedes revisar el coste.`;
  if (info.anotherSender) return 'Telegram solo permite enviarlo otra vez a nombre de otro remitente del chat.';
  if (info.otherQuote) return 'Telegram solo permite enviarlo otra vez con una cita distinta, y la cita todavía no se edita desde WRGram.';
  return undefined;
}

export function deleteProblem(message: Message): string | undefined {
  if (!message.outgoing) return 'Solo puedes quitar mensajes que enviaste tú.';
  if (!message.unsent) return 'Este mensaje ya está en Telegram; usa sus opciones para borrarlo.';
  return undefined;
}

export const canRetry = (message: Message): boolean => retryProblem(message) === undefined;
export const canDelete = (message: Message): boolean => deleteProblem(message) === undefined;

/** La línea corta bajo la burbuja: lo que dijo Telegram, sin añadir ningún juicio propio. */
export function noticeOf(message: Message): string {
  const info = message.unsent;
  if (!info) return '';
  if (info.pending) return 'Enviando a Telegram…';
  return info.telegram ? `Telegram dijo: «${info.telegram}»` : 'Telegram no aceptó el mensaje.';
}

/** `true` es «hecho»; `false` es el Cancelar del diálogo nativo, que no es un error. */
export const wasApplied = (answer: unknown): boolean => answer === true;
