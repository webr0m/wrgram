import type {
  LiveChat,
  LiveConnectionState,
  LiveMessage,
  Page,
  TelegramAdapter,
  TelegramEvent,
  TelegramWebAuth,
  TelegramWebEvent,
} from '@wrgram/telegram';

export type TelegramSessionSnapshot = {
  enabled: boolean;
  active: boolean;
  auth?: TelegramWebAuth;
};

const API_ROOT = `${(import.meta.env.VITE_WRGRAM_API_URL || '/api').replace(/\/$/, '')}/v1/telegram`;

export class TelegramApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'TelegramApiError';
  }
}

/** Mensajes seguros del backend; nunca se muestra el error de red original. */
export function tdlibErrorMessage(error: unknown): string {
  if (error instanceof TelegramApiError) return error.message;
  return 'No se pudo completar la operación con el servidor de Telegram. Revisa la conexión; si el envío pudo llegar, compruébalo antes de repetirlo.';
}

function headers(hasBody: boolean): HeadersInit {
  return {
    Accept: 'application/json',
    'X-WRGram-Client': 'web',
    ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { ...headers(init.body !== undefined), ...(init.headers ?? {}) },
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === 'object' && typeof (body as { message?: unknown }).message === 'string'
      ? (body as { message: string }).message
      : 'No se pudo completar la operación con el servidor de WRGram.';
    throw new TelegramApiError(response.status, message);
  }
  return body as T;
}

export async function telegramStatus(signal?: AbortSignal) {
  return request<{ enabled: boolean; reason?: string }>('/status', { signal });
}

export async function telegramSession(signal?: AbortSignal) {
  return request<TelegramSessionSnapshot>('/session', { signal });
}

export async function createTelegramSession() {
  return request<TelegramSessionSnapshot>('/session', { method: 'POST' });
}

export async function closeTelegramSession() {
  return request<{ ok: boolean }>('/session/logout', { method: 'POST' });
}

export async function loginPhone(phone: string) {
  return request<{ auth: TelegramWebAuth }>('/login/phone', { method: 'POST', body: JSON.stringify({ phone }) });
}

export async function loginCode(code: string) {
  return request<{ auth: TelegramWebAuth }>('/login/code', { method: 'POST', body: JSON.stringify({ code }) });
}

export async function loginPassword(password: string) {
  return request<{ auth: TelegramWebAuth }>('/login/password', { method: 'POST', body: JSON.stringify({ password }) });
}

export function updatesUrl(): string {
  return `${API_ROOT}/updates`;
}

function clientTime(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
  return new Date(timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function normalizeChat(chat: LiveChat): LiveChat {
  return { ...chat, time: clientTime(chat.lastMessageAt) };
}

function normalizeMessage(message: LiveMessage): LiveMessage {
  return { ...message, time: clientTime(message.sentAt) };
}

/** Adaptador del navegador: todo pasa por /api/v1/telegram, nunca por TDLib directo. */
export class TdlibWebAdapter implements TelegramAdapter {
  readonly engine = 'tdlib' as const;
  private readonly listeners = new Set<(event: TelegramEvent) => void>();
  private source: EventSource | null = null;
  private state: LiveConnectionState = 'connecting';
  private disposed = false;

  constructor(readonly accountId: string) {}

  getConnectionState(): LiveConnectionState { return this.state; }

  private emit(event: TelegramEvent) {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Una vista rota no debe cerrar el flujo. */ }
    }
  }

  private setState(state: LiveConnectionState) {
    if (this.state === state) return;
    this.state = state;
    this.emit({ type: 'connection', state });
  }

  subscribe(listener: (event: TelegramEvent) => void): () => void {
    this.disposed = false;
    this.listeners.add(listener);
    this.openStream();
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) {
        this.source?.close();
        this.source = null;
        this.state = 'connecting';
      }
    };
  }

  private openStream() {
    if (this.source || this.disposed) return;
    const source = new EventSource(updatesUrl(), { withCredentials: true });
    // El servidor envía el estado real de TDLib al conectar; no se asume conectado
    // solo porque el transporte SSE esté abierto.
    source.onopen = () => { if (this.state === 'offline') this.setState('connecting'); };
    source.onerror = () => this.setState('offline');
    source.onmessage = (event) => this.handleEvent(event.data);
    this.source = source;
  }

  private handleEvent(raw: string) {
    let parsed: TelegramWebEvent;
    try { parsed = JSON.parse(raw) as TelegramWebEvent; } catch { return; }
    if (!parsed || typeof parsed.type !== 'string') return;
    if (parsed.type === 'auth') {
      if (!parsed.auth) return;
      if (parsed.auth.step === 'closed') {
        this.setState('offline');
        this.emit({ type: 'error', message: 'La sesión de Telegram se cerró. Vuelve a iniciar sesión para continuar.' });
      } else if (parsed.auth.step === 'unsupported') {
        this.setState('offline');
        this.emit({ type: 'error', message: parsed.auth.unsupportedReason ?? 'La sesión de Telegram necesita atención. Cierra sesión y vuelve a iniciarla.' });
      }
      return;
    }
    if (parsed.type === 'connection') {
      this.setState(parsed.state);
      return;
    }
    if (parsed.type === 'message') {
      if (!parsed.message || !parsed.chat) return;
      if (parsed.message.accountId !== this.accountId || parsed.chat.accountId !== this.accountId) return;
      this.emit({ type: 'message', message: normalizeMessage(parsed.message), chat: normalizeChat(parsed.chat), edited: parsed.edited });
      return;
    }
    if (parsed.type === 'deleted') {
      if (parsed.accountId !== this.accountId) return;
      this.emit(parsed);
      return;
    }
    if (parsed.type === 'read') {
      this.emit(parsed);
      return;
    }
    if (parsed.type === 'error') this.emit({ type: 'error', message: parsed.message });
  }

  async getChats(cursor?: string, signal?: AbortSignal): Promise<Page<LiveChat>> {
    const page = await request<Page<LiveChat>>(`/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
    return { items: page.items.filter((chat) => chat.accountId === this.accountId).map(normalizeChat), nextCursor: page.nextCursor };
  }

  async getMessages(chatId: string, cursor?: string, signal?: AbortSignal): Promise<Page<LiveMessage>> {
    const page = await request<Page<LiveMessage>>(`/chats/${encodeURIComponent(chatId)}/messages${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, { signal });
    return { items: page.items.filter((message) => message.accountId === this.accountId && message.chatId === chatId).map(normalizeMessage), nextCursor: page.nextCursor };
  }

  async sendMessage(chatId: string, text: string): Promise<LiveMessage> {
    const result = await request<{ message: LiveMessage }>(`/chats/${encodeURIComponent(chatId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    });
    return normalizeMessage(result.message);
  }

  async markRead(chatId: string, maxId: number): Promise<void> {
    await request<{ ok: boolean }>(`/chats/${encodeURIComponent(chatId)}/read`, {
      method: 'POST',
      body: JSON.stringify({ maxId }),
    });
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    await request<{ ok: boolean }>(`/chats/${encodeURIComponent(chatId)}/typing`, {
      method: 'POST',
      body: JSON.stringify({ active }),
    });
  }

  dispose() {
    this.disposed = true;
    this.source?.close();
    this.source = null;
    this.listeners.clear();
    this.state = 'connecting';
  }
}
