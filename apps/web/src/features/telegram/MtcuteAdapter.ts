import type { TelegramClient, Dialog, Message, DeleteMessageUpdate, HistoryReadUpdate, ConnectionState } from '@mtcute/web';
import type { LiveChat, Page, LiveMessage, TelegramAdapter, TelegramEvent } from '@wrgram/telegram';
import { createOutgoingMessage } from '@wrgram/core';
import { mapDialog, mapMessage, mapPeer } from './mapping';
import { telegramError } from './errors';

type PhotoLocation = Parameters<TelegramClient['downloadAsBuffer']>[0];

const PHOTO_CACHE_LIMIT = 300;
const PHOTO_CONCURRENCY = 3;

export class MtcuteAdapter implements TelegramAdapter {
  readonly engine = 'mtcute' as const;
  private readonly listeners = new Set<(event: TelegramEvent) => void>();
  private knownChats = new Map<string, LiveChat>();
  private iterator: AsyncIterator<Dialog> | null = null;
  private chatCursor = 0;
  private chatQueue: Promise<void> = Promise.resolve();
  private attached = false;
  private state: ConnectionState;
  private readonly seenNewMessages = new Set<string>();
  private readonly photoUrls = new Map<string, string>();
  private readonly photoPending = new Set<string>();
  private photoTasks: Array<() => Promise<void>> = [];
  private photoActive = 0;
  private disposed = false;

  constructor(private readonly client: TelegramClient, readonly accountId: string) {
    // El propietario solo crea este adaptador tras una autenticación confirmada.
    this.state = 'connected';
  }

  private queuePhoto(chat: LiveChat, location: PhotoLocation | null | undefined) {
    const key = chat.photoKey;
    if (!key || !location) return;
    const cached = this.photoUrls.get(key);
    if (cached) { if (chat.photo !== cached) chat.photo = cached; return; }
    if (this.photoPending.has(key)) return;
    this.photoPending.add(key);
    this.photoTasks.push(async () => {
      try {
        const data = await this.client.downloadAsBuffer(location);
        if (this.disposed) return;
        const url = URL.createObjectURL(new Blob([new Uint8Array(data)], { type: 'image/jpeg' }));
        if (this.photoUrls.size >= PHOTO_CACHE_LIMIT) {
          const oldest = this.photoUrls.keys().next().value;
          if (oldest !== undefined) { URL.revokeObjectURL(this.photoUrls.get(oldest)!); this.photoUrls.delete(oldest); }
        }
        this.photoUrls.set(key, url);
        for (const known of this.knownChats.values()) {
          if (known.photoKey !== key || known.photo === url) continue;
          known.photo = url;
          this.emit({ type: 'chat', chat: known });
        }
      } catch {
        // La foto es opcional: si falla, el avatar conserva las iniciales.
      } finally { this.photoPending.delete(key); }
    });
    void this.pumpPhotos();
  }

  private async pumpPhotos() {
    while (this.photoActive < PHOTO_CONCURRENCY && this.photoTasks.length) {
      const task = this.photoTasks.shift()!;
      this.photoActive++;
      try { await task(); } finally { this.photoActive--; }
    }
  }

  getConnectionState() { return this.state; }

  private emit(event: TelegramEvent) { for (const listener of this.listeners) listener(event); }

  private onConnection = (state: ConnectionState) => { this.state = state; this.emit({ type: 'connection', state }); };
  private onError = (error: Error) => { this.emit({ type: 'error', message: telegramError(error) }); };
  private onNew = (message: Message) => { this.handleMessage(message, false); };
  private onEdit = (message: Message) => { this.handleMessage(message, true); };
  private onDelete = (update: DeleteMessageUpdate) => {
    const chatId = update.channelId === null ? null : String(update.channelId);
    for (const chat of this.knownChats.values()) {
      if ((chatId === null ? chat.messageScope === 'global' : chat.id === chatId) && update.messageIds.includes(chat.lastMessageId)) chat.preview = 'Mensaje eliminado.';
    }
    this.emit({ type: 'deleted', accountId: this.accountId, chatId, messageIds: update.messageIds });
  };
  private onRead = (update: HistoryReadUpdate) => {
    if (update.isDiscussion || update.isMonoForum) return;
    const chatId = String(update.chatId);
    const chat = this.knownChats.get(chatId);
    if (chat) { if (update.isOutbox) chat.readOutgoingId = Math.max(chat.readOutgoingId, update.maxReadId); else chat.unread = update.unreadCount; }
    this.emit({ type: 'read', chatId, outbox: update.isOutbox, maxId: update.maxReadId, unread: update.unreadCount });
  };

  private handleMessage(message: Message, edited: boolean) {
    if (message.isScheduled) return;
    const mapped = mapMessage(message, this.accountId);
    if (!edited && this.seenNewMessages.has(mapped.id)) return;
    if (!edited) {
      this.seenNewMessages.add(mapped.id);
      if (this.seenNewMessages.size > 5000) this.seenNewMessages.delete(this.seenNewMessages.values().next().value!);
    }
    const previous = this.knownChats.get(mapped.chatId);
    const mappedPeer = mapPeer(message.chat, this.accountId, message);
    const chat = { ...mappedPeer, ...previous };
    if (previous && mappedPeer.photoKey !== previous.photoKey) { chat.photo = undefined; chat.photoKey = mappedPeer.photoKey; }
    if (!previous || (!edited && mapped.sentAt >= previous.lastMessageAt) || (edited && previous.lastMessageId === mapped.messageId)) {
      chat.preview = mapped.text; chat.time = mapped.time; chat.lastMessageAt = mapped.sentAt; chat.lastMessageId = mapped.messageId;
    }
    if (!edited && !mapped.outgoing) chat.unread++;
    this.knownChats.set(chat.id, chat);
    this.queuePhoto(chat, message.chat.photo?.small);
    this.emit({ type: 'message', message: mapped, chat, edited });
  }

  subscribe(listener: (event: TelegramEvent) => void): () => void {
    this.listeners.add(listener);
    if (!this.attached) {
      this.attached = true;
      this.client.onNewMessage.add(this.onNew);
      this.client.onEditMessage.add(this.onEdit);
      this.client.onDeleteMessage.add(this.onDelete);
      this.client.onHistoryRead.add(this.onRead);
      this.client.onConnectionState.add(this.onConnection);
      this.client.onError.add(this.onError);
    }
    return () => { this.listeners.delete(listener); if (!this.listeners.size) this.detach(); };
  }

  private detach() {
    if (!this.attached) return;
    this.client.onNewMessage.remove(this.onNew);
    this.client.onEditMessage.remove(this.onEdit);
    this.client.onDeleteMessage.remove(this.onDelete);
    this.client.onHistoryRead.remove(this.onRead);
    this.client.onConnectionState.remove(this.onConnection);
    this.client.onError.remove(this.onError);
    this.attached = false;
  }

  async getChats(cursor?: string, signal?: AbortSignal): Promise<Page<LiveChat>> {
    const previous = this.chatQueue;
    let release!: () => void;
    this.chatQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      signal?.throwIfAborted();
      if (cursor && cursor !== String(this.chatCursor)) throw new Error('La página de conversaciones ya no es válida.');
      if (!cursor || !this.iterator) {
        this.iterator = this.client.withParams({ abortSignal: signal }).iterDialogs({ chunkSize: 30, archived: 'keep' })[Symbol.asyncIterator]();
        this.chatCursor = 0;
      }
      const items: LiveChat[] = [];
      let done = false;
      while (items.length < 30) {
        signal?.throwIfAborted();
        const entry = await this.iterator.next();
        signal?.throwIfAborted();
        if (entry.done) { done = true; break; }
        const chat = mapDialog(entry.value, this.accountId);
        this.knownChats.set(chat.id, chat);
        this.queuePhoto(chat, entry.value.peer.photo?.small);
        items.push(chat);
      }
      this.chatCursor++;
      return { items, nextCursor: done ? null : String(this.chatCursor) };
    } finally { release(); }
  }

  private peer(chatId: string) {
    if (!this.knownChats.has(chatId)) throw new Error('Conversación no cargada en esta cuenta.');
    const id = Number(chatId);
    if (!Number.isSafeInteger(id)) throw new Error('Identificador de conversación no válido.');
    return id;
  }

  async getMessages(chatId: string, cursor?: string, signal?: AbortSignal): Promise<Page<LiveMessage>> {
    const offsetId = cursor ? Number(cursor) : 0;
    if (!Number.isSafeInteger(offsetId) || offsetId < 0) throw new Error('Página de historial no válida.');
    const result = await this.client.withParams({ abortSignal: signal }).getHistory(this.peer(chatId), { limit: 40, ...(offsetId ? { offset: { id: offsetId, date: 0 } } : {}) });
    signal?.throwIfAborted();
    const items = result.filter((message) => !message.isScheduled).map((message) => mapMessage(message, this.accountId));
    const oldest = result.length ? Math.min(...result.map((message) => message.id)) : 0;
    return { items, nextCursor: result.length === 40 && oldest > 0 && (!offsetId || oldest < offsetId) ? String(oldest) : null };
  }

  async sendMessage(chatId: string, text: string): Promise<LiveMessage> {
    if (!this.knownChats.get(chatId)?.canSendText) throw new Error('Envío no disponible en esta conversación.');
    const validated = createOutgoingMessage(chatId, text, 'validation', '');
    const result = await this.client.sendText(this.peer(chatId), validated.text);
    return mapMessage(result, this.accountId);
  }

  async markRead(chatId: string, maxId: number) {
    if (!Number.isSafeInteger(maxId) || maxId <= 0) return;
    await this.client.readHistory(this.peer(chatId), { maxId, shouldDispatch: true });
    const chat = this.knownChats.get(chatId);
    if (chat && chat.lastMessageId <= maxId) chat.unread = 0;
  }

  async setTyping(chatId: string, active: boolean) {
    if (!this.knownChats.get(chatId)?.canSendText) return;
    await this.client.sendTyping(this.peer(chatId), active ? 'typing' : 'cancel');
  }

  dispose() {
    this.disposed = true;
    this.detach(); this.listeners.clear(); this.knownChats.clear(); this.seenNewMessages.clear(); this.iterator = null;
    this.photoTasks = []; this.photoPending.clear();
    for (const url of this.photoUrls.values()) URL.revokeObjectURL(url);
    this.photoUrls.clear();
  }
}
