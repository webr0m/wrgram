import { validateAssistantRequest, type AssistantStatus } from '@wrgram/assistant';
import { GroqProvider, ProviderError } from '@wrgram/ai-providers';
import { BUILTIN_PLUGINS } from '@wrgram/plugin-sdk';

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  WRGRAM_AI_LIMITER: { limit(options: { key: string }): Promise<{ success: boolean }> };
  GROQ_API_KEY?: string;
  WRGRAM_GROQ_MODEL?: string;
  WRGRAM_AI_ENABLED?: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (path === '/api/health' && request.method === 'GET') return json({ status: 'ok', service: 'wrgram-edge', version: '0.1.0', telegram: 'demo' });
    if (path === '/api/v1/plugins' && request.method === 'GET') return json({ plugins: BUILTIN_PLUGINS });
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
