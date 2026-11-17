import { validateAssistantRequest, type AssistantStatus } from '@wrgram/assistant';
import { GroqProvider, ProviderError } from '@wrgram/ai-providers';
import { BUILTIN_PLUGINS } from '@wrgram/plugin-sdk';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  WRGRAM_AI_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  WRGRAM_GIF_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  GROQ_API_KEY?: string;
  WRGRAM_GROQ_MODEL?: string;
  WRGRAM_AI_ENABLED?: string;
  GIPHY_API_KEY?: string;
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}

async function readBody(request: Request): Promise<unknown> {
  const max = 192 * 1024;
  if (Number(request.headers.get('content-length') ?? 0) > max) throw new ProviderError('La solicitud es demasiado grande.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new ProviderError('La solicitud no contiene datos.', 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new ProviderError('La solicitud es demasiado grande.', 413); }
    chunks.push(value);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); }
  catch { throw new ProviderError('El cuerpo JSON no es válido.', 400); }
}

const GIF_MEDIA = '/api/v1/gifs/media/';
const GIF_RESULTS = 25;
const GIF_MAX_BYTES = 12 * 1024 * 1024;
const GIF_TYPES = new Set(['image/gif', 'image/webp', 'image/png']);
// Solo los hosts de archivos de Giphy; nada de esto llega al teléfono: el cliente ve únicamente nuestras rutas.
const GIF_HOST = /^https:\/\/(?:media\d*|i)\.giphy\.com\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+$/;

function encodeToken(url: string): string {
  return btoa(encodeURIComponent(url)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeToken(token: string): string | null {
  try {
    const url = decodeURIComponent(atob(token.replace(/-/g, '+').replace(/_/g, '/')));
    return GIF_HOST.test(url) ? url : null;
  } catch { return null; }
}

function measure(value: unknown, maximum: number): number {
  const number = Math.round(Number(value));
  return Number.isFinite(number) && number > 0 ? Math.min(number, maximum) : 0;
}

function clip(images: Record<string, unknown>, key: string): { url: string; width: number; height: number; duration: number } | null {
  const variant = images[key] as { url?: unknown; width?: unknown; height?: unknown; frames?: unknown } | undefined;
  if (typeof variant?.url !== 'string' || !GIF_HOST.test(variant.url)) return null;
  const frames = measure(variant.frames, 1500);
  return { url: variant.url, width: measure(variant.width, 2000), height: measure(variant.height, 2000), duration: frames ? Math.max(1, Math.min(60, Math.round(frames / 25))) : 0 };
}

async function gifSearch(request: Request, url: URL, env: Env): Promise<Response> {
  if (!env.GIPHY_API_KEY) return json({ message: 'Giphy aún no está habilitado en esta instalación.' }, 503);
  const { success } = await env.WRGRAM_GIF_LIMITER.limit({ key: `wrgram-gif:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` });
  if (!success) return json({ message: 'Demasiadas búsquedas de GIF. Espera un minuto antes de reintentar.' }, 429);
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 100);
  const upstream = new URL(`https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}`);
  upstream.searchParams.set('api_key', env.GIPHY_API_KEY);
  upstream.searchParams.set('limit', String(GIF_RESULTS));
  upstream.searchParams.set('offset', '0');
  upstream.searchParams.set('rating', 'pg-13');
  if (query) upstream.searchParams.set('q', query);
  const answer = await fetch(upstream, { headers: { accept: 'application/json' } });
  if (!answer.ok) return json({ message: 'Giphy no respondió. Vuelve a intentarlo.' }, 502);
  const body = await answer.json() as { data?: unknown };
  const items: Record<string, unknown>[] = [];
  for (const entry of Array.isArray(body.data) ? body.data : []) {
    const media = (entry as { images?: unknown }).images as Record<string, unknown> | undefined;
    const gif = media && clip(media, 'fixed_width');
    const still = media && (clip(media, 'fixed_width_small_still') ?? clip(media, 'fixed_width_still'));
    const id = (entry as { id?: unknown }).id;
    if (!gif || !still || typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) continue;
    items.push({
      id,
      preview: `${url.origin}${GIF_MEDIA}${encodeToken(still.url)}`,
      animation: `${url.origin}${GIF_MEDIA}${encodeToken(gif.url)}`,
      width: gif.width, height: gif.height, duration: gif.duration,
    });
    if (items.length >= GIF_RESULTS) break;
  }
  return json({ items });
}

async function gifMedia(url: URL): Promise<Response> {
  const target = decodeToken(decodeURIComponent(url.pathname.slice(GIF_MEDIA.length)));
  if (!target) return json({ message: 'Recurso no disponible.' }, 404);
  const answer = await fetch(target, { redirect: 'manual' });
  const type = answer.headers.get('content-type')?.split(';')[0].trim().toLowerCase() ?? '';
  if (answer.status !== 200 || !GIF_TYPES.has(type) || Number(answer.headers.get('content-length') ?? 0) > GIF_MAX_BYTES) return json({ message: 'Recurso no disponible.' }, 404);
  return new Response(answer.body, { headers: { 'Content-Type': type, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'cross-origin' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (path === '/api/health' && request.method === 'GET') return json({ status: 'ok', service: 'wrgram-edge', version: '0.1.0', telegram: 'demo' });
    if (path === '/api/v1/plugins' && request.method === 'GET') return json({ plugins: BUILTIN_PLUGINS });
    // Giphy se consulta desde aquí: la clave y el origen de Giphy nunca aparecen en el cliente.
    if (path === '/api/v1/gifs/search') return request.method === 'GET' ? await gifSearch(request, url, env) : json({ message: 'Método no permitido.' }, 405);
    if (path.startsWith(GIF_MEDIA)) return request.method === 'GET' ? await gifMedia(url) : json({ message: 'Método no permitido.' }, 405);
    if (!['/api/v1/assistant/status', '/api/v1/assistant/chat'].includes(path)) return json({ message: 'Ruta no disponible.' }, 404);

    const provider = new GroqProvider({ apiKey: env.GROQ_API_KEY ?? '', model: env.WRGRAM_GROQ_MODEL ?? 'openai/gpt-oss-20b' });
    const enabled = env.WRGRAM_AI_ENABLED === 'true' && Boolean(env.GROQ_API_KEY);
    if (path.endsWith('/status') && request.method === 'GET') {
      if (!enabled) return json({ state: 'not-configured', provider: 'groq', model: provider.model, pricing: 'free-tier', deployment: 'public-alpha' } satisfies AssistantStatus);
      return json({ ...await provider.status(), deployment: 'public-alpha' });
    }
    if (!path.endsWith('/chat') || request.method !== 'POST') return json({ message: 'Método no permitido.' }, 405);
    if (!enabled) return json({ message: 'WR IA está integrada, pero aún no habilitada en esta instalación pública. Falta configurar el acceso seguro y la clave de Groq.' }, 503);
    // Protección inicial por IP; aproximada por ubicación. No sustituye autenticación ni un presupuesto global.
    const { success } = await env.WRGRAM_AI_LIMITER.limit({ key: `wrgram:${request.headers.get('cf-connecting-ip') ?? 'unknown'}` });
    if (!success) return json({ message: 'Demasiadas solicitudes. Espera un minuto antes de reintentar.' }, 429);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ message: 'Origen no permitido.' }, 403);
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return json({ message: 'Se requiere application/json.' }, 415);
    try {
      const data = await readBody(request);
      if (!validateAssistantRequest(data)) return json({ message: 'Revisa el consentimiento y la instrucción propia.' }, 400);
      if (data.provider !== 'groq') return json({ message: 'Esta instalación usa Groq. Actualiza el estado y acepta el aviso del proveedor.' }, 409);
      return json(await provider.chat(data, request.signal));
    } catch (error) {
      if (error instanceof ProviderError) return json({ message: error.message }, error.statusCode);
      return json({ message: 'No se pudo completar la solicitud de IA.' }, 503);
    }
  },
};
