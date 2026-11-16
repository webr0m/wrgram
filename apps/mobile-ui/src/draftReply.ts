import type { Message, TextEntity } from './contract';

/**
 * Lo que `draft.set` guarda y devuelve. La cita de un borrador es **un id**, no un mensaje: el
 * mensaje puede estar fuera de la ventana cargada y el borrador sigue existiendo en la nube de la
 * cuenta, así que la interfaz nunca tira la cita por no verla —dice que no la puede mostrar—.
 */
export interface DraftSaved { reply?: string; note?: string }

/** Las tres claves que el puente entiende; el id viaja en texto, como todo id de 64 bits. */
export function draftPayload(text: string, entities: TextEntity[], replyId: string) {
  return { text, entities, reply: replyId || '0' };
}

/** La cita que Telegram ya tiene guardada para este chat o tema. */
export const remoteReply = (source?: { draftReply?: string }): string => source?.draftReply ?? '';

/** Lo que el puente confirma que quedó en el borrador: `''` cuando no hay borrador o se cayó la cita. */
export const keptReply = (answer: DraftSaved | undefined): string => answer?.reply ?? '';

/** El aviso con el que el puente explica por qué la cita no está en lo que Telegram guardó. */
export const lostReplyNotice = (answer: DraftSaved): string => answer.note ?? '';

/** El mensaje citado, solo si está cargado; sin él no hay burbuja que inventar. */
export const citedMessage = (replyId: string, messages: Message[]): Message | undefined =>
  replyId === '' ? undefined : messages.find(message => message.id === replyId);

/** La chapa sin mensaje cargado: se dice lo que se sabe, que es solo el identificador. */
export const unloadedCitation = 'Respondías a un mensaje que ya no está cargado en esta conversación';

export const chipTitle = (message: Message | undefined): string =>
  message === undefined ? unloadedCitation : `Responder a ${message.sender}`;

/**
 * Comparación de las tres partes del borrador para decidir si la copia local ya está confirmada por
 * Telegram. Si la cita se quedara fuera, una respuesta vieja seguiría mandándose para siempre.
 */
export function sameDraft(local: { text: string; format: string; reply: string }, remote: { text: string; format: string; reply: string }): boolean {
  return local.text === remote.text && local.format === remote.format && local.reply === remote.reply;
}

/** El texto que hay que guardar cuando la cita se cae: el borrador no se borra por eso. */
export const keepsText = (text: string): boolean => text.trim().length > 0;
