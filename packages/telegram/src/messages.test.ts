import { describe, expect, it } from 'vitest';
import { deleteMessages, deletionAffectsChat, emptyMessageCache, mergeMessages, messageKey } from './messages';
import type { LiveChat, LiveMessage } from './live';

function message(id: number, editedAt = 0, chatId = '123', accountId = 'test'): LiveMessage {
  return { id: messageKey(accountId, chatId, id), messageId: id, accountId, chatId, sentAt: id * 1000, editedAt, kind: 'text', text: 'Texto de prueba', sender: 'Ejemplo', outgoing: false, time: '12:00' };
}

describe('historial real aislado por cuenta y conversación', () => {
  it('deduplica la confirmación de envío y la actualización en directo', () => {
    const cache = mergeMessages(emptyMessageCache(), [message(1), message(1)], 'test', '123');
    expect(cache.items).toHaveLength(1);
  });
  it('ordena páginas antiguas y no mezcla otras cuentas ni chats', () => {
    const cache = mergeMessages(emptyMessageCache(), [message(10), message(2), message(3, 0, 'other'), message(4, 0, '123', 'other')], 'test', '123');
    expect(cache.items.map((item) => item.messageId)).toEqual([2, 10]);
  });
  it('no resucita un mensaje borrado mientras se cargaba el historial', () => {
    const cache = deleteMessages(emptyMessageCache(), [7]);
    expect(mergeMessages(cache, [message(7)], 'test', '123').items).toEqual([]);
  });
  it('no reemplaza una edición reciente por una página obsoleta', () => {
    const cache = mergeMessages(emptyMessageCache(), [{ ...message(1, 100), text: 'Editado' }], 'test', '123');
    expect(mergeMessages(cache, [message(1, 0)], 'test', '123').items[0].text).toBe('Editado');
  });
  it('no borra mensajes con el mismo número en canales diferentes', () => {
    const global = { id: '123', accountId: 'test', messageScope: 'global' } as LiveChat;
    const channel = { ...global, id: '-100123', messageScope: 'channel' } as LiveChat;
    expect(deletionAffectsChat(global, 'test', null)).toBe(true);
    expect(deletionAffectsChat(channel, 'test', null)).toBe(false);
    expect(deletionAffectsChat(channel, 'test', '-100123')).toBe(true);
    expect(deletionAffectsChat(channel, 'other', '-100123')).toBe(false);
  });
});
