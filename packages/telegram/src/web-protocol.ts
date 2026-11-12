import type { LiveChat, LiveConnectionState, LiveMessage } from './live';

/** Estado de autenticación que el backend TDLib comparte con el navegador. */
export type TelegramWebStep =
  | 'starting'
  | 'phone'
  | 'code'
  | 'password'
  | 'ready'
  | 'closed'
  | 'unsupported';

export interface TelegramWebAuth {
  enabled: boolean;
  active: boolean;
  step: TelegramWebStep;
  displayName?: string;
  accountId?: string;
  codeLength?: number;
  codeType?: string;
  codeTimeout?: number;
  passwordHint?: string;
  unsupportedReason?: string;
}

export interface TelegramWebStatus {
  enabled: boolean;
  reason?: string;
}

export interface TelegramWebSessionResponse {
  enabled: boolean;
  active: boolean;
  auth?: TelegramWebAuth;
}

/** Eventos que el gateway envía por SSE; nunca incluyen credenciales ni secretos. */
export type TelegramWebEvent =
  | { type: 'auth'; auth: TelegramWebAuth }
  | { type: 'connection'; state: LiveConnectionState }
  | { type: 'message'; message: LiveMessage; chat: LiveChat; edited: boolean }
  | { type: 'deleted'; accountId: string; chatId: string | null; messageIds: number[] }
  | { type: 'read'; chatId: string; outbox: boolean; maxId: number; unread: number }
  | { type: 'error'; message: string };
