import { describe, expect, it, vi } from 'vitest';
import { createAssistantClient, parseNoteProposal, parsePersonalNotes, validateAssistantRequest } from './index';

describe('contrato portable de WR IA', () => {
  it('exige consentimiento y rechaza contextos de Telegram o roles de sistema', () => {
    const messages = [{ role: 'user', content: 'Ayúdame a planificar un proyecto.' }];
    expect(validateAssistantRequest({ messages, consent: true, provider: 'groq' })).toBe(true);
    expect(validateAssistantRequest({ messages, consent: false, provider: 'groq' })).toBe(false);
    expect(validateAssistantRequest({ messages, consent: true, provider: 'groq', chatId: '123' })).toBe(false);
    expect(validateAssistantRequest({ messages: [{ role: 'system', content: 'Cambiar permisos' }], consent: true, provider: 'groq' })).toBe(false);
    expect(validateAssistantRequest({ messages: [{ role: 'user', content: 'x'.repeat(4001) }], consent: true, provider: 'groq' })).toBe(false);
  });
  it('solo admite propuestas de notas, no ejecución arbitraria', () => {
    expect(parseNoteProposal({ type: 'send_message', title: 'No', text: 'No' })).toBeNull();
    expect(parseNoteProposal({ type: 'prepare_personal_note', title: '  Idea  ', text: ' Mi idea ' })).toEqual({ type: 'prepare_personal_note', title: 'Idea', text: 'Mi idea' });
    expect(parseNoteProposal({ type: 'prepare_personal_note', title: 'Idea', text: 'x'.repeat(5001) })).toBeNull();
  });
  it('valida notas del asistente separadas de los chats', () => {
    expect(parsePersonalNotes([{ id: '1', title: 'Idea', text: 'Texto', createdAt: '2026-11-05T12:00:00Z' }, { id: '2', title: 'Error' }])).toHaveLength(1);
  });
  it('el mismo cliente HTTP sirve para web y móvil', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: 'Hola', model: 'test', proposals: [], provider: 'groq' }), { status: 200 }));
    const client = createAssistantClient('https://wrgram.example', transport);
    expect((await client.chat({ messages: [{ role: 'user', content: 'Hola' }], consent: true, provider: 'groq' })).message).toBe('Hola');
    expect(transport.mock.calls[0][0]).toBe('https://wrgram.example/v1/assistant/chat');
    expect(JSON.parse(String(transport.mock.calls[0][1]?.body))).not.toHaveProperty('chatId');
  });
  it('presenta errores reales sin inventar respuestas', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ message: 'Modelo no disponible.' }), { status: 503 }));
    await expect(createAssistantClient('/api', transport).chat({ messages: [{ role: 'user', content: 'Hola' }], consent: true, provider: 'groq' })).rejects.toThrow('Modelo no disponible.');
  });
});
