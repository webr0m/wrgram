import { ASSISTANT_LIMITS, type AssistantProvider, type AssistantRequest, type AssistantResponse, type AssistantStatus } from '@wrgram/assistant';
import { NOTE_TOOL, parseToolProposals, ProviderError, SYSTEM_PROMPT } from './protocol';

const GROQ_ORIGIN = 'https://api.groq.com/openai/v1';

export class GroqProvider implements AssistantProvider {
  readonly id = 'groq' as const;
  readonly model: string;
  private readonly apiKey: string;
  private readonly transport: typeof fetch;

  constructor(options: { apiKey?: string; model?: string; transport?: typeof fetch } = {}) {
    this.apiKey = options.apiKey ?? process.env.GROQ_API_KEY ?? '';
    this.model = options.model ?? process.env.WRGRAM_GROQ_MODEL ?? 'openai/gpt-oss-20b';
    if (!/^[a-zA-Z0-9_.\/-]+$/.test(this.model) || this.model.length > 100) throw new Error('WRGRAM_GROQ_MODEL no es válido.');
    this.transport = options.transport ?? fetch;
  }

  async status(): Promise<AssistantStatus> {
    const base = { provider: this.id, model: this.model, pricing: 'free-tier' } as const;
    if (!this.apiKey) return { ...base, state: 'not-configured' };
    try {
      const response = await this.transport(`${GROQ_ORIGIN}/models/${encodeURIComponent(this.model)}`, {
        headers: { Authorization: `Bearer ${this.apiKey}` }, signal: AbortSignal.timeout(5000),
      });
      if (response.status === 401 || response.status === 403) return { ...base, state: 'not-configured' };
      if (response.status === 404) return { ...base, state: 'model-missing' };
      return { ...base, state: response.ok ? 'ready' : 'offline' };
    } catch { return { ...base, state: 'offline' }; }
  }

  async chat(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse> {
    if (!this.apiKey) throw new ProviderError('Configura GROQ_API_KEY en el servidor de WRGram. Nunca en la aplicación ni en el chat.');
    const timeout = AbortSignal.timeout(60_000);
    try {
      const response = await this.transport(`${GROQ_ORIGIN}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        body: JSON.stringify({
          model: this.model, stream: false,
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...request.messages],
          tools: [NOTE_TOOL], tool_choice: 'auto', parallel_tool_calls: false,
          temperature: 0.5, max_completion_tokens: 1200,
        }),
      });
      if (response.status === 429) throw new ProviderError('Se alcanzó una cuota de Groq. Espera antes de reintentar. No cambiaremos de proveedor ni activaremos pagos.', 429);
      if (response.status === 401 || response.status === 403) throw new ProviderError('Groq rechazó la clave o el acceso al modelo. Revisa la configuración del servidor.');
      if (response.status === 404) throw new ProviderError('El modelo configurado no está disponible en Groq. Revisa WRGRAM_GROQ_MODEL.');
      if (!response.ok) throw new ProviderError('Groq no pudo completar la solicitud. Comprueba el modelo, las cuotas y el estado del servicio.', 502);
      const body: unknown = await response.json();
      const choices = body && typeof body === 'object' ? (body as { choices?: unknown }).choices : null;
      const message: unknown = Array.isArray(choices) ? choices[0]?.message : null;
      if (!message || typeof message !== 'object') throw new ProviderError('Groq devolvió una respuesta inválida.', 502);
      const data = message as { content?: unknown; tool_calls?: unknown };
      const content = typeof data.content === 'string' ? data.content.trim().slice(0, ASSISTANT_LIMITS.response) : '';
      const proposals = parseToolProposals(data.tool_calls);
      if (!content && !proposals.length) throw new ProviderError('El modelo no devolvió texto ni una propuesta válida.', 502);
      return { message: content || 'He preparado esta propuesta de nota. Revísala antes de guardarla.', proposals, model: this.model, provider: this.id };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (signal?.aborted) throw new ProviderError('Solicitud cancelada.', 499);
      if (timeout.aborted) throw new ProviderError('Groq tardó demasiado en responder. Inténtalo más tarde.', 504);
      throw new ProviderError('No se pudo contactar con Groq. Revisa la conexión del servidor.');
    }
  }
}
