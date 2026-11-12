import { describe, expect, it, vi } from 'vitest';
import type { AssistantProvider } from '@wrgram/assistant';
import { buildApp } from '../app';

function provider(): AssistantProvider {
  return {
    id: 'groq',
    status: vi.fn().mockResolvedValue({ state: 'ready', provider: 'groq', model: 'test', pricing: 'free-tier' }),
    chat: vi.fn().mockResolvedValue({ message: 'Una idea original.', proposals: [], model: 'test', provider: 'groq' }),
  };
}

describe('API de WR IA', () => {
  it('comparte el contrato entre plataformas y exige consentimiento', async () => {
    const assistant = provider();
    const app = buildApp({ assistant, logger: false, telegram: false });
    try {
      expect((await app.inject({ method: 'GET', url: '/v1/assistant/status' })).json().state).toBe('ready');
      const request = { messages: [{ role: 'user', content: 'Ayúdame con una idea propia.' }], consent: true, provider: 'groq' };
      const valid = await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: request });
      expect(valid.statusCode).toBe(200);
      expect(valid.headers['cache-control']).toBe('no-store');
      expect((await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: { ...request, consent: false } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: { ...request, telegramContext: 'No permitido' } })).statusCode).toBe(400);
      expect((await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: { ...request, provider: 'ollama' } })).statusCode).toBe(409);
      expect(assistant.chat).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });
  it('limita las solicitudes de generación', async () => {
    const app = buildApp({ assistant: provider(), logger: false, telegram: false });
    try {
      for (let index = 0; index < 10; index++) {
        await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: { messages: [{ role: 'user', content: 'Hola' }], consent: true, provider: 'groq' } });
      }
      expect((await app.inject({ method: 'POST', url: '/v1/assistant/chat', payload: { messages: [{ role: 'user', content: 'Hola' }], consent: true, provider: 'groq' } })).statusCode).toBe(429);
    } finally { await app.close(); }
  });
});
