import type { TextEntity, TextEntityType } from './contract';

/**
 * La cita de texto de M02 (ronda CS): el trozo seleccionado al responder viaja en `send.text` como
 * `quote` (texto + posición UTF-16) y las capas nativas lo validan contra el original. Aquí vive el
 * espejo de las reglas puras —las mismas frases de ReplyQuote.java y DesktopReplyQuote.cs— y la
 * conversión de la selección del navegador en cita. Una selección que no vive dentro del texto del
 * mensaje no es cita: se responde al mensaje entero.
 */
export const QUOTE_NOT_TEXT = 'Solo se puede citar el texto de un mensaje.';
export const QUOTE_EMPTY = 'La cita no puede estar vacía.';
export const QUOTE_MISMATCH = 'La cita no coincide con el texto del mensaje.';

const ALLOWED: readonly TextEntityType[] = ['bold', 'italic', 'underline', 'strikethrough', 'spoiler', 'customEmoji', 'dateTime'];

export function quoteProblem(original: string, quote: string, position: number): string | undefined {
  if (!quote) return QUOTE_EMPTY;
  if (position < 0 || position + quote.length > original.length || original.slice(position, position + quote.length) !== quote) return QUOTE_MISMATCH;
  return undefined;
}

export function clipEntities(entities: readonly TextEntity[] | undefined, position: number, length: number): TextEntity[] {
  const kept: TextEntity[] = [];
  for (const entity of entities ?? []) {
    if (!ALLOWED.includes(entity.type)) continue;
    const from = Math.max(entity.offset, position), to = Math.min(entity.offset + entity.length, position + length);
    if (to <= from) continue;
    kept.push({ ...entity, offset: from - position, length: to - from });
  }
  return kept;
}

export function selectionQuote(text: string, selection: Selection | null): { text: string; position: number } | undefined {
  const chosen = selection?.toString() ?? '';
  if (!chosen || !text) return undefined;
  const position = text.indexOf(chosen);
  if (position < 0 || quoteProblem(text, chosen, position)) return undefined;
  return { text: chosen, position };
}