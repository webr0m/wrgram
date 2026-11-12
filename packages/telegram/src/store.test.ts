import { describe, expect, it, vi } from 'vitest';
import { LiveTelegramStore } from './store';
import { messageKey } from './messages';
import type { LiveChat, LiveMessage, Page, TelegramAdapter, TelegramEvent } from './live';

const chat: LiveChat = { id: '123', accountId: 'test', title: 'Chat de prueba', initials: 'CP', color: 'blue', kind: 'private', preview: '', time: '', unread: 1, messageScope: 'global', lastMessageAt: 1, lastMessageId: 1, isSelf: false, canSendText: true, readOutgoingId: 0 };
function message(id: number): LiveMessage { return { id: messageKey('test', '123', id), accountId: 'test', chatId: '123', messageId: id, text: 'Mensaje de prueba', sender: 'Ejemplo', outgoing: false, time: '12:00', sentAt: id, editedAt: 0, kind: 'text' }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

function fixture() {
  let receiver: ((event: TelegramEvent) => void) | undefined;
  const adapter: TelegramAdapter = {
    engine: 'mtcute', accountId: 'test', getConnectionState: () => 'connected',
    getChats: vi.fn().mockResolvedValue({ items: [chat], nextCursor: null }),
    getMessages: vi.fn().mockResolvedValue({ items: [message(1)], nextCursor: '1' }),
    sendMessage: vi.fn().mockResolvedValue({ ...message(2), outgoing: true }),
    markRead: vi.fn().mockResolvedValue(undefined), setTyping: vi.fn().mockResolvedValue(undefined), dispose: vi.fn(),
    subscribe: (listener) => { receiver = listener; return () => { receiver = undefined; }; },
  };
  const store = new LiveTelegramStore(adapter);
  return { adapter, store, emit: (event: TelegramEvent) => receiver?.(event) };
}

describe('estado de mensajería real', () => {
  it('carga chats sin abrir ni marcar como leído ninguno automáticamente', async () => {
    const { store, adapter } = fixture(); store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    expect(store.getSnapshot().activeId).toBeNull();
    expect(adapter.getMessages).not.toHaveBeenCalled(); expect(adapter.markRead).not.toHaveBeenCalled(); store.stop();
  });
  it('combina historial paginado con actualizaciones sin duplicarlas', async () => {
    const { store, emit } = fixture(); store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    store.selectChat('123');
    await vi.waitFor(() => expect(store.getSnapshot().histories['123'].loaded).toBe(true));
    emit({ type: 'message', message: message(2), chat: { ...chat, lastMessageId: 2 }, edited: false });
    emit({ type: 'message', message: message(2), chat: { ...chat, lastMessageId: 2 }, edited: false });
    expect(store.getSnapshot().histories['123'].cache.items.map((item) => item.messageId)).toEqual([1, 2]); store.stop();
  });
  it('no resucita un borrado recibido durante una petición de historial', async () => {
    const { adapter, store, emit } = fixture(); const page = deferred<Page<LiveMessage>>();
    adapter.getMessages = () => page.promise; store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    store.selectChat('123');
    emit({ type: 'deleted', accountId: 'test', chatId: null, messageIds: [1] });
    page.resolve({ items: [message(1)], nextCursor: null });
    await vi.waitFor(() => expect(store.getSnapshot().histories['123'].loaded).toBe(true));
    expect(store.getSnapshot().histories['123'].cache.items).toEqual([]); store.stop();
  });
  it('no confirma ni duplica envíos hasta la respuesta del servidor', async () => {
    const { adapter, store } = fixture(); const pending = deferred<LiveMessage>();
    adapter.sendMessage = vi.fn(() => pending.promise); store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    const first = store.send('123', 'Hola');
    expect(await store.send('123', 'Hola')).toBe(false);
    expect(store.getSnapshot().histories['123']).toBeUndefined();
    pending.resolve(message(2)); expect(await first).toBe(true);
    expect(adapter.sendMessage).toHaveBeenCalledTimes(1); store.stop();
  });
  it('vacía el historial al perder conexión y descarta respuestas antiguas', async () => {
    const { adapter, store, emit } = fixture(); const page = deferred<Page<LiveMessage>>();
    adapter.getMessages = () => page.promise; store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    store.selectChat('123'); emit({ type: 'connection', state: 'offline' });
    page.resolve({ items: [message(1)], nextCursor: null });
    await Promise.resolve(); await Promise.resolve();
    expect(store.getSnapshot().histories).toEqual({}); store.stop();
  });
  it('no marca como leídos mensajes llegados después de la confirmación solicitada', async () => {
    const { adapter, store, emit } = fixture(); const pending = deferred<void>(); adapter.markRead = () => pending.promise;
    store.start(); await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    const read = store.markRead('123', 1);
    emit({ type: 'message', message: message(2), chat: { ...chat, unread: 2, lastMessageId: 2 }, edited: false });
    pending.resolve(); await read;
    expect(store.getSnapshot().chats[0].unread).toBe(2); store.stop();
  });
  it('una edición tardía no resucita contenido ya eliminado en el historial ni su vista previa', async () => {
    const { store, emit } = fixture(); store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    store.selectChat('123');
    await vi.waitFor(() => expect(store.getSnapshot().histories['123'].loaded).toBe(true));
    emit({ type: 'deleted', accountId: 'test', chatId: null, messageIds: [1] });
    emit({ type: 'message', message: { ...message(1), editedAt: 10 }, chat: { ...chat, preview: 'Contenido eliminado' }, edited: true });
    expect(store.getSnapshot().histories['123'].cache.items).toEqual([]);
    expect(store.getSnapshot().chats[0].preview).toBe('Mensaje eliminado.'); store.stop();
  });
  it('una confirmación de envío tardía no conserva un mensaje borrado mientras llegaba', async () => {
    const { adapter, store, emit } = fixture(); const pending = deferred<LiveMessage>();
    adapter.sendMessage = () => pending.promise; store.start();
    await vi.waitFor(() => expect(store.getSnapshot().chats).toHaveLength(1));
    const sent = store.send('123', 'Hola');
    emit({ type: 'deleted', accountId: 'test', chatId: null, messageIds: [2] });
    pending.resolve(message(2)); expect(await sent).toBe(true);
    expect(store.getSnapshot().histories['123']).toBeUndefined();
    expect(store.getSnapshot().chats[0].preview).not.toBe('Mensaje de prueba'); store.stop();
  });
});
