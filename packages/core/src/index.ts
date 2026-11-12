export type ChatKind = 'private' | 'group' | 'channel' | 'bot';

export interface Chat {
  id: string;
  title: string;
  initials: string;
  color: 'violet' | 'blue' | 'coral' | 'mint' | 'amber';
  kind: ChatKind;
  preview: string;
  time: string;
  unread: number;
  pinned?: boolean;
  verified?: boolean;
  members?: string;
  /** URL de la miniatura de perfil. Los chats sin foto usan las iniciales. */
  photo?: string;
}

export interface Message {
  id: string;
  chatId: string;
  text: string;
  sender: string;
  outgoing: boolean;
  time: string;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'ready';

export function createOutgoingMessage(chatId: string, text: string, id: string, time: string): Message {
  const normalized = text.trim();
  if (!normalized) throw new Error('El mensaje no puede estar vacío.');
  if (normalized.length > 4096) throw new Error('El mensaje supera los 4096 caracteres.');
  return { id, chatId, text: normalized, sender: 'Tú', outgoing: true, time };
}
