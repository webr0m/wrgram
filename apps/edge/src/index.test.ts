import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Env } from './index';

const origin = 'https://wrgram.webrom.cc';
const payload = { messages: [{ role: 'user', content: 'Una idea propia.' }], consent: true, provider: 'groq' };

function environment(overrides: Partial<Env> = {}): Env {
  return {
    ASSETS: { fetch: vi.fn().mockResolvedValue(new Response('WRGram web')) },
    WRGRAM_AI_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
    WRGRAM_GIF_LIMITER: { limit: vi.fn().mockResolvedValue({ success: true }) },
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

const giphyAnswer = JSON.stringify({
  data: [
    { id: 'Saludo3x', title: 'Saludo', images: {
      fixed_width: { url: 'https://media0.giphy.com/media/Saludo3x/giphy.gif?cid=api', width: '200', height: '120', frames: '50' },
      fixed_width_small_still: { url: 'https://media1.giphy.com/media/Saludo3x/giphy_s.gif?cid=api', width: '100', height: '60' },
    } },
    { id: 'Fuga9x', title: 'Fuga', images: {
      fixed_width: { url: 'https://suplantacion.example.net/x.gif', width: '200', height: '120', frames: '50' },
      fixed_width_small_still: { url: 'https://media1.giphy.com/media/Fuga9x/giphy_s.gif', width: '100', height: '60' },
    } },
  ],
});

function tokenOf(url: string): string {
  return btoa(encodeURIComponent(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

describe('búsqueda de GIF por Giphy a través del edge', () => {
  it('no consulta Giphy ni filtra la clave cuando falta', async () => {
    const transport = vi.spyOn(globalThis, 'fetch');
    const response = await worker.fetch(new Request(`${origin}/api/v1/gifs/search?q=hola`), environment());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('giphy.com');
    expect(transport).not.toHaveBeenCalled();
  });
  it('traduce los resultados a rutas propias y descarta archivos de otro host', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(giphyAnswer));
    const env = environment({ GIPHY_API_KEY: 'clave-de-prueba' });
    const body = await (await worker.fetch(new Request(`${origin}/api/v1/gifs/search?q=saludo`), env)).json() as { items: Record<string, unknown>[] };
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][0]).toBeInstanceOf(URL);
    expect(String(transport.mock.calls[0][0])).toContain('api_key=clave-de-prueba');
    expect(String(transport.mock.calls[0][0])).toContain('q=saludo');
    expect(body.items).toHaveLength(1);
    expect(Object.keys(body.items[0]).join()).toBe('id,preview,animation,width,height,duration');
    expect(body.items[0]).toMatchObject({ id: 'Saludo3x', width: 200, height: 120, duration: 2 });
    expect(JSON.stringify(body)).not.toContain('giphy.com');
    expect(JSON.stringify(body)).not.toContain('clave-de-prueba');
    expect(String(body.items[0].preview)).toMatch(new RegExp(`^${origin}/api/v1/gifs/media/[A-Za-z0-9_-]+$`));
  });
  it('usa la lista en tendencia sin término y corta al exceder la cuota', async () => {
    const transport = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(giphyAnswer));
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/search`), environment({ GIPHY_API_KEY: 'clave' }))).status).toBe(200);
    expect(String(transport.mock.calls[0][0])).toContain('/gifs/trending');
    expect(String(transport.mock.calls[0][0])).not.toContain('q=');
    const limited = environment({ GIPHY_API_KEY: 'clave', WRGRAM_GIF_LIMITER: { limit: async () => ({ success: false }) } });
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/search?q=saludo`), limited)).status).toBe(429);
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/search`), environment({ GIPHY_API_KEY: 'clave' }))).status).toBe(200);
  });
  it('sirve el archivo proxy solo para hosts de Giphy y como imagen inmutable', async () => {
    const env = environment({ GIPHY_API_KEY: 'clave' });
    const gif = 'https://media0.giphy.com/media/Saludo3x/giphy.gif?cid=api';
    const transport = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(Uint8Array.from([71, 73, 70]), { headers: { 'content-type': 'image/gif' } }));
    const served = await worker.fetch(new Request(`${origin}/api/v1/gifs/media/${tokenOf(gif)}`), env);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toBe('image/gif');
    expect(served.headers.get('cache-control')).toContain('immutable');
    expect(String(transport.mock.calls[0][0])).toBe(gif);
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/media/${tokenOf('https://suplantacion.example.net/x.gif')}`), env)).status).toBe(404);
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/media/no-es-un-token`), env)).status).toBe(404);
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it('rechaza el proxy cuando el origen no responde o no es una imagen', async () => {
    const env = environment({ GIPHY_API_KEY: 'clave' });
    const target = tokenOf('https://media0.giphy.com/media/Saludo3x/giphy.gif');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('hola', { status: 500 }));
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/media/${target}`), env)).status).toBe(404);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html/>', { headers: { 'content-type': 'text/html' } }));
    expect((await worker.fetch(new Request(`${origin}/api/v1/gifs/media/${target}`), env)).status).toBe(404);
  });
});
