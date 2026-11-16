import type { ForwardOrigin } from './contract';

export type JumpTarget = { chatId:string; messageId?:string };

/**
 * Telegram only identifies an addressable original for chat and channel origins, and ids travel as
 * text because they exceed Number.MAX_SAFE_INTEGER.
 */
export function forwardTarget(origin:ForwardOrigin):JumpTarget|undefined {
  if (!origin.chatId || origin.chatId === '0') return undefined;
  const messageId = origin.messageId && origin.messageId !== '0' ? origin.messageId : undefined;
  return messageId ? { chatId: origin.chatId, messageId } : { chatId: origin.chatId };
}

export function forwardLabel(origin:ForwardOrigin):string {
  const name = origin.name?.trim() || (origin.kind === 'hidden' ? 'un usuario anónimo' : 'un origen desconocido');
  const signature = origin.signature?.trim();
  return signature ? `Reenviado de ${name} · ${signature}` : `Reenviado de ${name}`;
}

export function replyTarget(to?:{chatId:string;messageId:string}):JumpTarget|undefined {
  if (!to?.chatId || !to.messageId || to.chatId === '0' || to.messageId === '0') return undefined;
  return { chatId: to.chatId, messageId: to.messageId };
}

/** Fecha del texto: la original cuando Telegram la conserva en un reenvío. */
export function bubbleDate(message:{date:number;forward?:ForwardOrigin}):number {
  return message.forward?.date && message.forward.date > 0 ? message.forward.date : message.date;
}
