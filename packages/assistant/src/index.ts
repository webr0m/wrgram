/** Contrato portable: sin DOM de interfaz, Telegram ni acceso a sus sesiones. */
export const ASSISTANT_LIMITS = { prompt: 4000, history: 10, response: 12000, notes: 50 } as const;
export type AssistantProviderId = 'groq' | 'ollama';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantRequest {
  messages: AssistantMessage[];
  consent: true;
  provider: AssistantProviderId;
}

export interface NoteProposal {
  type: 'prepare_personal_note';
  title: string;
  text: string;
}

export interface AssistantResponse {
  message: string;
  proposals: NoteProposal[];
  model: string;
  provider: AssistantProviderId;
}

export interface AssistantStatus {
  state: 'ready' | 'not-configured' | 'model-missing' | 'offline';
  provider: AssistantProviderId;
  model: string;
  pricing: 'free-tier' | 'local';
  deployment?: 'public-alpha';
}

export interface PersonalNote {
  id: string;
  title: string;
  text: string;
  createdAt: string;
}

export interface AssistantProvider {
  readonly id: AssistantProviderId;
  status(): Promise<AssistantStatus>;
  chat(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse>;
}

export function parseNoteProposal(value: unknown): NoteProposal | null {
  if (!value || typeof value !== 'object') return null;
  const proposal = value as Record<string, unknown>;
  if (proposal.type !== 'prepare_personal_note' || typeof proposal.title !== 'string' || typeof proposal.text !== 'string') return null;
  const title = proposal.title.trim();
  const text = proposal.text.trim();
  if (!title || title.length > 80 || !text || text.length > 5000) return null;
  return { type: 'prepare_personal_note', title, text };
}

export function parsePersonalNotes(value: unknown): PersonalNote[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, ASSISTANT_LIMITS.notes).flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const note = item as Record<string, unknown>;
    const proposal = parseNoteProposal({ ...note, type: 'prepare_personal_note' });
    if (!proposal || typeof note.id !== 'string' || note.id.length > 100 ||
      typeof note.createdAt !== 'string' || !Number.isFinite(Date.parse(note.createdAt))) return [];
    return [{ id: note.id, title: proposal.title, text: proposal.text, createdAt: note.createdAt }];
  });
}

export function validateAssistantRequest(value: unknown): value is AssistantRequest {
  if (!value || typeof value !== 'object') return false;
  const request = value as Record<string, unknown>;
  if (request.consent !== true || !Array.isArray(request.messages) || !request.messages.length || request.messages.length > ASSISTANT_LIMITS.history) return false;
  if (request.provider !== 'groq' && request.provider !== 'ollama') return false;
  if (Object.keys(request).some((key) => !['messages', 'consent', 'provider'].includes(key))) return false;
  if (!request.messages.every((item: unknown) => {
    if (!item || typeof item !== 'object') return false;
    const message = item as Record<string, unknown>;
    return Object.keys(message).every((key) => ['role', 'content'].includes(key)) &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' && message.content.trim().length > 0 &&
      message.content.length <= (message.role === 'user' ? ASSISTANT_LIMITS.prompt : ASSISTANT_LIMITS.response);
  })) return false;
  return request.messages.at(-1)?.role === 'user';
}

export class AssistantClientError extends Error {
  constructor(message: string, readonly status: number) { super(message); this.name = 'AssistantClientError'; }
}

/** Web: baseURL '/api'. Android/iOS: URL HTTPS de la misma API propia. */
export function createAssistantClient(baseURL: string, transport: typeof fetch = fetch) {
  const base = baseURL.replace(/\/$/, '');

  async function call(path: string, init: RequestInit = {}): Promise<unknown> {
    let response: Response;
    try { response = await transport(`${base}/v1/assistant${path}`, init); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      throw new AssistantClientError('No se pudo conectar con la API de WRGram. Inicia el servicio de IA.', 0);
    }
    let data: unknown;
    try { data = await response.json(); }
    catch { throw new AssistantClientError('La API de WRGram no está disponible o devolvió una respuesta inválida.', response.status); }
    if (!response.ok) {
      const detail = data && typeof data === 'object' ? (data as Record<string, unknown>).message : undefined;
      throw new AssistantClientError(typeof detail === 'string' ? detail.slice(0, 250) : 'No se pudo completar la solicitud.', response.status);
    }
    return data;
  }

  return {
    async status(signal?: AbortSignal): Promise<AssistantStatus> {
      const data = await call('/status', { signal });
      if (!data || typeof data !== 'object') throw new AssistantClientError('Estado de IA inválido.', 502);
      const status = data as Record<string, unknown>;
      if (!['ready', 'not-configured', 'model-missing', 'offline'].includes(String(status.state)) ||
        !['ollama', 'groq'].includes(String(status.provider)) || typeof status.model !== 'string' ||
        !['free-tier', 'local'].includes(String(status.pricing)) ||
        (status.deployment !== undefined && status.deployment !== 'public-alpha')) {
        throw new AssistantClientError('Estado de IA inválido.', 502);
      }
      return status as unknown as AssistantStatus;
    },
    async chat(request: AssistantRequest, signal?: AbortSignal): Promise<AssistantResponse> {
      if (!validateAssistantRequest(request)) throw new AssistantClientError('Revisa el texto y el consentimiento de IA.', 400);
      const data = await call('/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request), signal,
      });
      if (!data || typeof data !== 'object') throw new AssistantClientError('Respuesta de IA inválida.', 502);
      const result = data as Record<string, unknown>;
      if (typeof result.message !== 'string' || result.message.length > ASSISTANT_LIMITS.response || typeof result.model !== 'string' ||
        result.provider !== request.provider || !Array.isArray(result.proposals)) {
        throw new AssistantClientError('Respuesta de IA inválida.', 502);
      }
      const proposals = result.proposals.slice(0, 3).flatMap((item) => { const proposal = parseNoteProposal(item); return proposal ? [proposal] : []; });
      if (!result.message.trim() && !proposals.length) throw new AssistantClientError('El modelo no devolvió una respuesta.', 502);
      return { message: result.message, proposals, model: result.model, provider: request.provider };
    },
  };
}
