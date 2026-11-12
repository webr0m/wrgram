import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const origin = 'https://wrgram.webrom.cc';
const payload = { messages: [{ role: 'user', content: 'Una idea propia.' }], consent: true, provider: 'groq' };

function environment(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('WRGram web')) },
    WRGRAM_AI_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    WRGRAM_AI_ENABLED: 'false',
    ...overrides,
  };
}

function post(body: unknown = payload, headers: Record<string, string> = {}) {
  return new Request(`${origin}/api/v1/assistant/chat`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('alpha pública en Cloudflare', () => {
  it('sirve los archivos web y la salud por separado', async () => {
    const env = environment();
    expect(await (await worker.fetch(new Request(origin), env)).text()).toBe('WRGram web');
    const response = await worker.fetch(new Request(`${origin}/api/health`), env);
    expect(await response.json()).toMatchObject({ service: 'wrgram-edge', telegram: 'demo' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  it('deshabilita IA de forma segura sin llamar a Groq ni exponer secretos', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    const env = environment({ GROQ_API_KEY: 'test-not-a-real-secret' });
    const status = await worker.fetch(new Request(`${origin}/api/v1/assistant/status`), env);
    expect(await status.json()).toMatchObject({ state: 'not-configured', deployment: 'public-alpha' });
    const response = await worker.fetch(post(), env);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('test-not-a-real-secret');
    expect(transport).not.toHaveBeenCalled();
  });
  it('no habilita generación aunque se active la bandera sin clave', async () => {
    expect((await worker.fetch(post(), environment({ WRGRAM_AI_ENABLED: 'true' }))).status).toBe(503);
  });
  it('valida cuota, origen, proveedor y consentimiento antes de contactar la IA', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    const env = environment({ WRGRAM_AI_ENABLED: 'true', GROQ_API_KEY: 'test' });
    expect((await worker.fetch(post(payload, { origin: 'https://other.example' }), env)).status).toBe(403);
    expect((await worker.fetch(post({ ...payload, consent: false }), env)).status).toBe(400);
    expect((await worker.fetch(post({ ...payload, provider: 'ollama' }), env)).status).toBe(409);
    expect((await worker.fetch(post(), { ...env, WRGRAM_AI_LIMITER: { limit: async () => ({ success: false }) } })).status).toBe(429);
    expect(transport).not.toHaveBeenCalled();
  });
  it('rechaza rutas, métodos y cuerpos no admitidos', async () => {
    const env = environment({ WRGRAM_AI_ENABLED: 'true', GROQ_API_KEY: 'test' });
    expect((await worker.fetch(new Request(`${origin}/api/not-found`), env)).status).toBe(404);
    expect((await worker.fetch(new Request(`${origin}/api/v1/assistant/chat`), env)).status).toBe(405);
    expect((await worker.fetch(new Request(`${origin}/api/v1/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'hello' }), env)).status).toBe(415);
    expect((await worker.fetch(new Request(`${origin}/api/v1/assistant/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'invalid' }), env)).status).toBe(400);
    expect((await worker.fetch(post({ messages: 'x'.repeat(200_000) }), env)).status).toBe(413);
  });
  it('devuelve texto y propuestas, sin ejecutar las herramientas de Groq', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: 'Una respuesta real del proveedor simulado en esta prueba.' } }] })));
    const response = await worker.fetch(post(), environment({ WRGRAM_AI_ENABLED: 'true', GROQ_API_KEY: 'test' }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ provider: 'groq', proposals: [] });
    expect(transport).toHaveBeenCalledTimes(1);
  });
});
