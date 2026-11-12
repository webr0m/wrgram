import type { Chat, Message } from '@wrgram/core';

export type LiveConnectionState = 'offline' | 'connecting' | 'updating' | 'connected';

export interface LiveChat extends Chat {
  accountId: string;
  /** Identificador de la foto vigente; permite detectar cambios sin descargarla. */
  photoKey?: string;
  messageScope: 'global' | 'channel';
  lastMessageAt: number;
  lastMessageId: number;
  isSelf: boolean;
  canSendText: boolean;
  readOnlyReason?: string;
  readOutgoingId: number;
}

export interface LiveMessage extends Message {
  accountId: string;
  messageId: number;
  sentAt: number;
  editedAt: number;
  kind: 'text' | 'unsupported' | 'service' | 'temporary';
}

export interface Page<T> { items: T[]; nextCursor: string | null }

export type TelegramEvent =
  | { type: 'connection'; state: LiveConnectionState }
  | { type: 'message'; message: LiveMessage; chat: LiveChat; edited: boolean }
  | { type: 'deleted'; accountId: string; chatId: string | null; messageIds: number[] }
  | { type: 'chat'; chat: LiveChat }
  | { type: 'read'; chatId: string; outbox: boolean; maxId: number; unread: number }
  | { type: 'error'; message: string };

/** Contrato de datos de una cuenta YA autenticada. La sesión pertenece a su propietario. */
export interface TelegramAdapter {
  readonly engine: 'mtcute' | 'tdlib';
  readonly accountId: string;
  getConnectionState(): LiveConnectionState;
  getChats(cursor?: string, signal?: AbortSignal): Promise<Page<LiveChat>>;
  getMessages(chatId: string, cursor?: string, signal?: AbortSignal): Promise<Page<LiveMessage>>;
  sendMessage(chatId: string, text: string): Promise<LiveMessage>;
  markRead(chatId: string, maxId: number): Promise<void>;
  setTyping(chatId: string, active: boolean): Promise<void>;
  subscribe(listener: (event: TelegramEvent) => void): () => void;
  dispose(): void;
}
