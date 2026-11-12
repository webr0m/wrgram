import { describe, expect, it } from 'vitest';
import { createOutgoingMessage } from './index';

describe('mensajes salientes', () => {
  it('normaliza el texto y conserva la conversación', () => {
    expect(createOutgoingMessage('chat-1', '  Hola  ', 'msg-1', '10:30')).toEqual({
      id: 'msg-1', chatId: 'chat-1', text: 'Hola', sender: 'Tú', outgoing: true, time: '10:30',
    });
  });
  it('rechaza mensajes vacíos', () => {
    expect(() => createOutgoingMessage('a', '  ', '1', '10:30')).toThrow();
  });
  it('rechaza mensajes demasiado largos', () => {
    expect(() => createOutgoingMessage('a', 'x'.repeat(4097), '1', '10:30')).toThrow();
  });
});
