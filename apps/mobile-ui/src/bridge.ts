import { EMPTY, type State } from './contract';
type NativePort = { postMessage(message: string): void; onmessage: ((event: { data: string }) => void) | null };
declare global { interface Window { WRGramNative?: NativePort; WRGRAM_MEDIA_BASE?: string } }
let state = EMPTY;
let stateRevision = 0;
let initialRequest: Promise<void> | undefined;
const listeners = new Set<() => void>();
let serial = 0;
const pending = new Map<string, { resolve(value: unknown): void; reject(error: Error): void; timer: ReturnType<typeof setTimeout> }>();
export const native = !!window.WRGramNative;
let designTransport: ((method: string, params: Record<string, unknown>) => Promise<unknown>) | undefined;
export function installDesignTransport(transport: typeof designTransport) { if (import.meta.env.DEV) designTransport = transport; }
export function acceptState(next: State) { state = next; for (const listener of listeners) listener(); }
export const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const snapshot = () => state;
// El nativo deja la respuesta pendiente mientras la persona está en un selector del sistema,
// la cámara, un permiso de Android o un diálogo de confirmación: 35 s no es un plazo real.
const USER_DRIVEN = new Set([
  'attachment.pick', 'attachment.camera', 'attachment.album', 'attachment.videoNote', 'attachment.videoNote.record',
  'account.photo.pick', 'account.photo.delete', 'media.export',
  'story.create.photo', 'story.create.video',
  'contacts.import', 'contacts.add', 'contacts.sync.set', 'contacts.sync.now',
  'share.location', 'voice.start', 'bot.button', 'security.lock',
  'folders.link', 'folders.join', 'folders.links.edit',
  'chat.invite', 'chat.subscription.create', 'chat.transfer', 'groups.member.ban', 'groups.member.unban', 'groups.member.restrict',
  'groups.member.promote', 'groups.member.demote', 'groups.permissions.set',
  'chat.bot.add', 'chat.bot.remove', 'bot.delete',
  'message.react.paid', 'payments.stars.confirm', 'link.open', 'message.link', 'telegram.link',
  'stars.subscription.cancel', 'stars.subscription.resume', 'stars.subscription.reuse', 'stars.withdraw', 'stars.ads.url',
  'premium.gift.apply', 'chat.boost.apply',
  'gifts.send', 'gifts.sell', 'gifts.delete', 'gifts.upgrade', 'gifts.transfer',
]);
const STORAGE_SCAN = new Set(['storage.details', 'storage.optimize']);
export const requestTimeoutMs = (method: string) => USER_DRIVEN.has(method) ? 300000 : STORAGE_SCAN.has(method) ? 130000 : 35000;
export function request<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  return sendRequest(method, params, requestTimeoutMs(method));
}

function sendRequest<T>(method: string, params: Record<string, unknown>, timeout: number): Promise<T> {
  const port = window.WRGramNative;
  if (!port && import.meta.env.DEV && designTransport) return designTransport(method, params) as Promise<T>;
  if (!port) return Promise.reject(new Error('Disponible en la aplicación Android. Esta vista no conecta una cuenta.'));
  const id = String(++serial);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('No se confirmó la operación. Comprueba su estado antes de repetirla.')); }, timeout);
    pending.set(id, { resolve: value => resolve(value as T), reject, timer });
    try {
      port.postMessage(JSON.stringify({ id, method, params }));
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error);
    }
  });
}

function applyNativeState(next: Partial<State>, full = false) {
  stateRevision++;
  if (next.access?.checked && !next.access.allowed) {
    acceptState({
      ...EMPTY, auth: 'age', access: next.access,
      appearance: next.appearance ?? state.appearance,
      security: next.security ?? EMPTY.security,
      version: next.version ?? state.version,
      platform: next.platform ?? state.platform,
    });
    return;
  }
  const accountChanged = next.selfId !== undefined && next.selfId !== state.selfId;
  acceptState({ ...(full || accountChanged ? EMPTY : state), ...next, startupError: undefined });
}

export function refreshInitialState(): Promise<void> {
  if (initialRequest) return initialRequest;
  const revision = stateRevision;
  if (!state.access.checked && state.startupError) acceptState({ ...state, startupError: undefined });
  initialRequest = sendRequest<State>('state', {}, 8_000).then(next => {
    if (next?.access?.checked !== true) throw new Error('Estado inicial incompleto');
    if (stateRevision === revision || !state.access.checked) applyNativeState(next, true);
  }).catch(() => {
    if (!state.access.checked) acceptState({ ...state, startupError: 'No se pudo iniciar WRGram. Vuelve a intentarlo.' });
  }).finally(() => { initialRequest = undefined; });
  return initialRequest;
}

if (window.WRGramNative) {
  window.WRGramNative.onmessage = event => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'state' && data.state && typeof data.state === 'object') { applyNativeState(data.state); return; }
      const item = pending.get(data.id); if (!item) return;
      clearTimeout(item.timer); pending.delete(data.id);
      if (data.error) item.reject(new Error(data.error)); else item.resolve(data.result);
    } catch { /* Reject malformed native data without executing it. */ }
  };
  void refreshInitialState();
}
export const mediaUrl = (id: number) => `${window.WRGRAM_MEDIA_BASE || 'https://appassets.androidplatform.net'}/media/${id}`;
