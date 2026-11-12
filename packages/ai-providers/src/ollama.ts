import {
  ASSISTANT_LIMITS,
  type AssistantProvider, type AssistantRequest, type AssistantResponse, type AssistantStatus,
} from '@wrgram/assistant';
import { NOTE_TOOL, parseToolProposals, ProviderError, SYSTEM_PROMPT } from './protocol';

export class OllamaProvider implements AssistantProvider {
  readonly id = 'ollama' as const;
  private readonly baseURL: string;
  readonly model: string;
  private readonly transport: typeof fetch;

  constructor(options: { baseURL?: string; model?: string; transport?: typeof fetch } = {}) {
    const url = new URL(options.baseURL ?? process.env.WRGRAM_OLLAMA_URL ?? 'http://127.0.0.1:11434');
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('WRGRAM_OLLAMA_URL debe ser un origen HTTP/HTTPS sin credenciales, ruta ni parámetros.');
    }
    this.baseURL = url.origin;
    this.model = options.model ?? process.env.WRGRAM_AI_MODEL ?? 'qwen3:1.7b';
    // Solo modelos locales: no enviar prompts a las variantes cloud de Ollama.
    if (!/^[a-zA-Z0-9_.\/-]+(?::[a-zA-Z0-9_.-]+)?$/.test(this.model) || this.model.length > 100 || /cloud/i.test(this.model)) {
      throw new Error('WRGRAM_AI_MODEL debe identificar un modelo local válido.');
    }
    this.transport = options.transport ?? fetch;
  }

  async status(): Promise<AssistantStatus> {
    const base = { provider: this.id, model: this.model, pricing: 'local' } as const;
    try {
      const response = await this.transport(`${this.baseURL}/api/tags`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) return { ...base, state: 'offline' };
      const body: unknown = await response.json();
      const models = body && typeof body === 'object' ? (body as { models?: unknown }).models : null;
      const found = Array.isArray(models) && models.some((entry: unknown) => {
        if (!entry || typeof entry !== 'object') return false;
        const model = entry as { name?: unknown; model?: unknown };
        return [model.name, model.model].some((name) => name === this.model || name === `${this.model}:latest`);
      });
      return { ...base, state: found ? 'ready' : 'model-missing' };
    } catch { return { ...base, state: 'offline' }; }
  }

  async chat(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse> {
    const timeout = AbortSignal.timeout(120_000);
    try {
      const response = await this.transport(`${this.baseURL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        body: JSON.stringify({
          model: this.model, stream: false,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...request.messages],
          tools: [NOTE_TOOL],
          ...(this.model.startsWith('qwen3') ? { think: false } : {}),
          options: { temperature: 0.5, num_ctx: 8192, num_predict: 1200 },
          keep_alive: '5m',
        }),
      });
      if (response.status === 404) throw new ProviderError('El modelo no está instalado en Ollama. Revisa la configuración y descárgalo manualmente.');
      if (!response.ok) throw new ProviderError('Ollama no pudo generar la respuesta. Comprueba que el modelo admite herramientas y que hay memoria disponible.');
      const body: unknown = await response.json();
      const message = body && typeof body === 'object' ? (body as { message?: unknown }).message : null;
      if (!message || typeof message !== 'object') throw new ProviderError('Ollama devolvió una respuesta inválida.', 502);
      const data = message as { content?: unknown; tool_calls?: unknown };
      const content = typeof data.content === 'string' ? data.content.trim().slice(0, ASSISTANT_LIMITS.response) : '';
      const proposals = parseToolProposals(data.tool_calls);
      if (!content && !proposals.length) throw new ProviderError('El modelo no devolvió texto ni una propuesta válida. Prueba a reformular la solicitud.', 502);
      return { message: content || 'He preparado esta propuesta de nota. Revísala antes de guardarla.', proposals, model: this.model, provider: this.id };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal?.aborted) throw new ProviderError('Solicitud cancelada.', 499);
      if (timeout.aborted) throw new ProviderError('El modelo ha tardado demasiado. Prueba uno más pequeño o una instrucción más corta.', 504);
      throw new ProviderError('No se pudo conectar con Ollama. Comprueba que está iniciado en el equipo del servidor.');
    }
  }
}
