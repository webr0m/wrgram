import type { LiveChat, LiveConnectionState, TelegramAdapter, TelegramEvent } from './live';
import { deleteMessages, deletionAffectsChat, emptyMessageCache, mergeMessages, sortChats, type MessageCache } from './messages';

export interface HistoryState {
  cache: MessageCache;
  nextCursor: string | null;
  loaded: boolean;
  loading: boolean;
  error: string;
}

export interface LiveState {
  chats: LiveChat[];
  chatsCursor: string | null;
  loadingChats: boolean;
  activeId: string | null;
  histories: Record<string, HistoryState>;
  connection: LiveConnectionState;
  sending: Record<string, boolean>;
  error: string;
}

function emptyHistory(): HistoryState { return { cache: emptyMessageCache(), nextCursor: null, loaded: false, loading: false, error: '' }; }

/** Estado en memoria, sin dependencia de React, navegador, backend ni IA. */
export class LiveTelegramStore {
  private state: LiveState;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private epoch = 0;
  private active = false;
  private chatRequest: AbortController | null = null;
  private historyRequests = new Map<string, AbortController>();
  private reading = new Set<string>();
  private readUpTo = new Map<string, number>();
  private deletions = new Map<string, Set<number>>();

  constructor(private readonly adapter: TelegramAdapter, private readonly formatError: (error: unknown) => string = () => 'No se pudo completar la operación con Telegram.') {
    this.state = this.initialState();
  }

  private initialState(): LiveState {
    return { chats: [], chatsCursor: null, loadingChats: false, activeId: null, histories: {}, connection: this.adapter.getConnectionState(), sending: {}, error: '' };
  }

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(next: Partial<LiveState>) { this.state = { ...this.state, ...next }; for (const listener of this.listeners) listener(); }

  start() {
    if (this.active) return;
    this.active = true;
    this.epoch++;
    this.unsubscribe = this.adapter.subscribe(this.receive);
    this.update({ connection: this.adapter.getConnectionState() });
    const epoch = this.epoch;
    queueMicrotask(() => { if (this.active && epoch === this.epoch && this.state.connection === 'connected') void this.loadChats(); });
  }

  stop() {
    this.active = false; this.epoch++;
    this.unsubscribe?.(); this.unsubscribe = null;
    this.abortRequests(); this.reading.clear(); this.readUpTo.clear(); this.deletions.clear();
    this.state = this.initialState();
  }

  private abortRequests() {
    this.chatRequest?.abort(); this.chatRequest = null;
    for (const controller of this.historyRequests.values()) controller.abort();
    this.historyRequests.clear();
  }

  private receive = (event: TelegramEvent) => {
    if (!this.active) return;
    if (event.type === 'connection') {
      const previous = this.state.connection;
      if (event.state !== 'connected') {
        this.epoch++; this.abortRequests(); this.reading.clear(); this.readUpTo.clear(); this.deletions.clear();
        this.update({ connection: event.state, histories: {}, loadingChats: false, sending: {}, chats: this.state.chats.map((chat) => ({ ...chat, preview: '' })) });
      } else {
        this.update({ connection: event.state });
        if (previous !== 'connected') { void this.loadChats(); if (this.state.activeId) void this.loadHistory(this.state.activeId); }
      }
      return;
    }
    if (event.type === 'error') { this.update({ error: event.message }); return; }
    if (event.type === 'chat') {
      if (event.chat.accountId !== this.adapter.accountId) return;
      const current = this.state.chats.find((chat) => chat.id === event.chat.id);
      if (!current) { this.update({ chats: sortChats([...this.state.chats, event.chat]) }); return; }
      const next: LiveChat = {
        ...current,
        title: event.chat.title,
        initials: event.chat.initials,
        verified: event.chat.verified,
        members: event.chat.members,
        photo: event.chat.photo ?? current.photo,
        photoKey: event.chat.photoKey ?? current.photoKey,
      };
      this.update({ chats: this.state.chats.map((chat) => chat.id === next.id ? next : chat) });
      return;
    }
    if (event.type === 'read') {
      this.update({ chats: this.state.chats.map((chat) => chat.id !== event.chatId ? chat : event.outbox ?
        { ...chat, readOutgoingId: Math.max(chat.readOutgoingId, event.maxId) } : { ...chat, unread: event.unread }) });
      return;
    }
    if (event.type === 'deleted') {
      if (event.accountId !== this.adapter.accountId) return;
      const scope = event.chatId ?? 'global';
      const deleted = new Set([...(this.deletions.get(scope) ?? []), ...event.messageIds]);
      this.deletions.set(scope, deleted);
      const histories = { ...this.state.histories };
      const chats = this.state.chats.map((chat) => {
        if (!deletionAffectsChat(chat, event.accountId, event.chatId)) return chat;
        if (histories[chat.id]) histories[chat.id] = { ...histories[chat.id], cache: deleteMessages(histories[chat.id].cache, event.messageIds) };
        return event.messageIds.includes(chat.lastMessageId) ? { ...chat, preview: 'Mensaje eliminado.' } : chat;
      });
      this.update({ chats, histories });
      return;
    }
    if (event.message.accountId !== this.adapter.accountId) return;
    if (this.deletions.get(event.chat.messageScope === 'global' ? 'global' : event.chat.id)?.has(event.message.messageId)) return;
    const oldChat = this.state.chats.find((chat) => chat.id === event.chat.id);
    const chat = { ...event.chat, readOutgoingId: Math.max(event.chat.readOutgoingId, oldChat?.readOutgoingId ?? 0) };
    const chats = sortChats([...this.state.chats.filter((item) => item.id !== chat.id), chat]);
    const history = this.state.histories[chat.id];
    const shouldMerge = history && (!event.edited || history.loading || history.cache.items.some((message) => message.id === event.message.id));
    this.update({ chats, ...(shouldMerge ? { histories: { ...this.state.histories, [chat.id]: { ...history, cache: mergeMessages(history.cache, [event.message], this.adapter.accountId, chat.id) } } } : {}) });
  };

  async loadChats(more = false) {
    if (!this.active || this.state.connection !== 'connected' || this.chatRequest || (more && !this.state.chatsCursor)) return;
    const epoch = this.epoch;
    const controller = new AbortController(); this.chatRequest = controller;
    this.update({ loadingChats: true, error: '' });
    try {
      const page = await this.adapter.getChats(more ? this.state.chatsCursor! : undefined, controller.signal);
      if (!this.active || epoch !== this.epoch || controller.signal.aborted) return;
      const merged = new Map(this.state.chats.map((chat) => [chat.id, chat]));
      for (const chat of page.items) {
        if (chat.accountId !== this.adapter.accountId) continue;
        if (this.deletions.get(chat.messageScope === 'global' ? 'global' : chat.id)?.has(chat.lastMessageId)) chat.preview = 'Mensaje eliminado.';
        const current = merged.get(chat.id);
        // Una actualización en directo más reciente gana frente a una página en vuelo.
        merged.set(chat.id, current && current.lastMessageAt > chat.lastMessageAt ? current : chat);
      }
      this.update({ chats: sortChats([...merged.values()]), chatsCursor: page.nextCursor });
    } catch (error) { if (this.active && epoch === this.epoch && !controller.signal.aborted) this.update({ error: this.formatError(error) }); }
    finally {
      if (this.chatRequest === controller) { this.chatRequest = null; if (this.active) this.update({ loadingChats: false }); }
    }
  }

  selectChat(chatId: string) {
    if (!this.state.chats.some((chat) => chat.id === chatId)) return;
    this.update({ activeId: chatId, error: '' });
    if (!this.state.histories[chatId]?.loaded) void this.loadHistory(chatId);
  }

  async loadHistory(chatId: string, older = false) {
    if (!this.active || this.state.connection !== 'connected' || this.historyRequests.has(chatId)) return;
    const existing = this.state.histories[chatId] ?? emptyHistory();
    const chat = this.state.chats.find((item) => item.id === chatId);
    const tombstones = this.deletions.get(chat?.messageScope === 'global' ? 'global' : chatId);
    const history = tombstones ? { ...existing, cache: deleteMessages(existing.cache, [...tombstones]) } : existing;
    if (older && !history.nextCursor) return;
    const epoch = this.epoch;
    const controller = new AbortController(); this.historyRequests.set(chatId, controller);
    this.update({ histories: { ...this.state.histories, [chatId]: { ...history, loading: true, error: '' } } });
    try {
      const page = await this.adapter.getMessages(chatId, older ? history.nextCursor! : undefined, controller.signal);
      if (!this.active || epoch !== this.epoch || controller.signal.aborted) return;
      const current = this.state.histories[chatId] ?? emptyHistory();
      this.update({ histories: { ...this.state.histories, [chatId]: { ...current, cache: mergeMessages(current.cache, page.items, this.adapter.accountId, chatId), nextCursor: page.nextCursor, loaded: true, error: '' } } });
    } catch (error) {
      if (this.active && epoch === this.epoch && !controller.signal.aborted) {
        const current = this.state.histories[chatId] ?? emptyHistory();
        this.update({ histories: { ...this.state.histories, [chatId]: { ...current, error: this.formatError(error) } } });
      }
    } finally {
      if (this.historyRequests.get(chatId) === controller) {
        this.historyRequests.delete(chatId);
        if (this.active && this.state.histories[chatId]) this.update({ histories: { ...this.state.histories, [chatId]: { ...this.state.histories[chatId], loading: false } } });
      }
    }
  }

  async send(chatId: string, text: string): Promise<boolean> {
    if (!this.active || this.state.sending[chatId] || this.state.connection !== 'connected') return false;
    const epoch = this.epoch;
    this.update({ sending: { ...this.state.sending, [chatId]: true }, error: '' });
    try {
      const message = await this.adapter.sendMessage(chatId, text);
      if (!this.active || epoch !== this.epoch) return false;
      const scope = this.state.chats.find((chat) => chat.id === chatId)?.messageScope === 'global' ? 'global' : chatId;
      if (this.deletions.get(scope)?.has(message.messageId)) return true;
      const current = this.state.histories[chatId] ?? emptyHistory();
      this.update({ histories: { ...this.state.histories, [chatId]: { ...current, cache: mergeMessages(current.cache, [message], this.adapter.accountId, chatId) } },
        chats: sortChats(this.state.chats.map((chat) => chat.id === chatId && message.sentAt >= chat.lastMessageAt ?
          { ...chat, preview: message.text, time: message.time, lastMessageAt: message.sentAt, lastMessageId: message.messageId } : chat)) });
      return true;
    } catch (error) {
      if (this.active && epoch === this.epoch) this.update({ error: `${this.formatError(error)} El envío podría haber llegado; comprueba Telegram antes de repetirlo.` });
      return false;
    } finally { if (this.active && epoch === this.epoch) this.update({ sending: { ...this.state.sending, [chatId]: false } }); }
  }

  async markRead(chatId: string, maxId: number) {
    if (!this.active || this.state.connection !== 'connected' || maxId <= (this.readUpTo.get(chatId) ?? 0) || this.reading.has(chatId)) return;
    this.reading.add(chatId);
    const epoch = this.epoch;
    try {
      await this.adapter.markRead(chatId, maxId);
      if (this.active && epoch === this.epoch) {
        this.readUpTo.set(chatId, maxId);
        this.update({ chats: this.state.chats.map((chat) => chat.id === chatId && chat.lastMessageId <= maxId ? { ...chat, unread: 0 } : chat) });
      }
    } catch (error) { if (this.active && epoch === this.epoch) this.update({ error: `No se pudo confirmar la lectura. ${this.formatError(error)}` }); }
    finally { this.reading.delete(chatId); }
  }
}
