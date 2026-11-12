import type { LiveChat, LiveMessage } from './live';

export function messageKey(accountId: string, chatId: string, messageId: number): string {
  return `${accountId}/${chatId}/${messageId}`;
}

export interface MessageCache {
  items: LiveMessage[];
  deleted: ReadonlySet<number>;
}

export function emptyMessageCache(): MessageCache { return { items: [], deleted: new Set() }; }

/** Un resultado antiguo de historial no debe resucitar borrados ni sustituir una edición nueva. */
export function mergeMessages(cache: MessageCache, incoming: readonly LiveMessage[], accountId: string, chatId: string): MessageCache {
  const byId = new Map(cache.items.map((message) => [message.id, message]));
  for (const message of incoming) {
    if (message.accountId !== accountId || message.chatId !== chatId || cache.deleted.has(message.messageId)) continue;
    const previous = byId.get(message.id);
    if (!previous || message.editedAt >= previous.editedAt) byId.set(message.id, message);
  }
  return { ...cache, items: [...byId.values()].sort((a, b) => a.sentAt - b.sentAt || a.messageId - b.messageId) };
}

export function deleteMessages(cache: MessageCache, ids: readonly number[]): MessageCache {
  const deleted = new Set([...cache.deleted, ...ids]);
  return { deleted, items: cache.items.filter((message) => !deleted.has(message.messageId)) };
}

export function deletionAffectsChat(chat: LiveChat, accountId: string, chatId: string | null): boolean {
  return chat.accountId === accountId && (chatId === null ? chat.messageScope === 'global' : chat.id === chatId);
}

export function sortChats(chats: readonly LiveChat[]): LiveChat[] {
  return [...chats].sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.lastMessageAt - a.lastMessageAt || a.id.localeCompare(b.id));
}
