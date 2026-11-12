import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  messageKey,
  type LiveChat,
  type LiveConnectionState,
  type LiveMessage,
  type Page,
  type TelegramWebAuth,
  type TelegramWebEvent,
} from '@wrgram/telegram';
import type { TelegramWebConfig } from './config';

type TdObject = Record<string, any>;

interface TdClient {
  invoke(query: Record<string, unknown>): Promise<TdObject>;
  on(event: string, listener: (...args: any[]) => void): unknown;
  off(event: string, listener: (...args: any[]) => void): unknown;
  close(): Promise<void>;
  isClosed(): boolean;
}

interface TdlibModules {
  createClient(options: Record<string, unknown>): TdClient;
}

let modules: Promise<TdlibModules> | null = null;

/** Carga perezosa: sin WRGRAM_TELEGRAM_WEB=1 el proceso ni siquiera abre tdjson. */
async function loadTdlib(): Promise<TdlibModules> {
  if (modules) return modules;
  modules = (async () => {
    const tdl: any = await import('tdl');
    const prebuilt: any = await import('prebuilt-tdlib');
    const configure = tdl.configure ?? tdl.default?.configure;
    const createClient = tdl.createClient ?? tdl.default?.createClient;
    const getTdjson = prebuilt.getTdjson ?? prebuilt.default?.getTdjson;
    if (typeof configure !== 'function' || typeof createClient !== 'function' || typeof getTdjson !== 'function') {
      throw new Error('TDLIB_UNAVAILABLE');
    }
    configure({ tdjson: getTdjson(), verbosityLevel: 0 });
    const setLogMessageCallback = tdl.setLogMessageCallback ?? tdl.default?.setLogMessageCallback;
    if (typeof setLogMessageCallback === 'function') setLogMessageCallback(0, null);
    return { createClient };
  })();
  return modules;
}

export class TelegramGatewayError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
    this.name = 'TelegramGatewayError';
  }
}

export function idString(value: unknown): string {
  if (typeof value === 'string' && /^-?\d{1,20}$/.test(value)) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new TelegramGatewayError(400, 'Telegram devolvió un identificador no válido.');
}

export function toSafeNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    throw new TelegramGatewayError(400, 'Telegram devolvió un identificador no válido.');
  }
  return parsed;
}

function positiveNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

function displayName(user: TdObject | undefined): string {
  if (!user) return '';
  const name = [user.first_name, user.last_name].filter((part) => typeof part === 'string' && part.trim()).join(' ').trim();
  if (name) return name;
  const username = user.usernames?.editable_username ?? user.usernames?.active_usernames?.[0];
  return typeof username === 'string' && username ? username : '';
}

function safeUsername(user: TdObject | undefined): string {
  return displayName(user) || 'Cuenta de Telegram';
}

function verified(user: TdObject | undefined, supergroup: TdObject | undefined): boolean {
  return Boolean(user?.verification_status?.is_verified || supergroup?.verification_status?.is_verified);
}

function formatTime(seconds: number): string {
  const date = new Date(seconds * 1000);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
}

function previewText(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(compact);
  return characters.length > 180 ? `${characters.slice(0, 177).join('')}…` : compact;
}

const SERVICE_CONTENT = /^message(?:Chat|BasicGroupChat|SupergroupChat|PinMessage|CustomServiceAction|GameScore|PaymentSuccessful|PaymentRefunded|PaymentSuccessfulBot|GiftedPremium|GiftedStars|Giveaway|PremiumGiftCode|ScreenshotTaken)/;

function media(label: string, caption: TdObject | undefined): { text: string; kind: LiveMessage['kind'] } {
  const text = typeof caption?.text?.text === 'string' ? caption.text.text.trim() : '';
  return {
    text: text ? `${text}\n[${label}]` : `${label}: visualización pendiente en este cliente web.`,
    kind: 'unsupported',
  };
}

export function extractContent(content: TdObject | undefined): { text: string; kind: LiveMessage['kind'] } {
  if (!content || typeof content._ !== 'string') return { text: 'Contenido no compatible todavía.', kind: 'unsupported' };
  switch (content._) {
    case 'messageText': {
      const text = typeof content.text?.text === 'string' ? content.text.text : '';
      return { text: text || 'Mensaje vacío.', kind: 'text' };
    }
    case 'messagePhoto': return media('Foto', content.caption);
    case 'messageVideo': return media('Video', content.caption);
    case 'messageAnimation': return media('GIF o animación', content.caption);
    case 'messageDocument': return media('Documento', content.caption);
    case 'messageAudio': return media('Audio', content.caption);
    case 'messageVoiceNote': return media('Nota de voz', content.caption);
    case 'messageVideoNote': return { text: 'Vídeo circular: visualización pendiente.', kind: 'unsupported' };
    case 'messageSticker': return { text: 'Sticker: visualización pendiente.', kind: 'unsupported' };
    case 'messageLocation': return { text: 'Ubicación compartida.', kind: 'unsupported' };
    case 'messageVenue': return { text: 'Lugar compartido.', kind: 'unsupported' };
    case 'messageContact': return { text: 'Contacto compartido.', kind: 'unsupported' };
    case 'messagePoll': return { text: 'Encuesta: visualización pendiente.', kind: 'unsupported' };
    case 'messageDice': return { text: 'Dado o animación de Telegram.', kind: 'unsupported' };
    case 'messageGame': return { text: 'Juego de Telegram.', kind: 'unsupported' };
    case 'messageInvoice': return { text: 'Factura de Telegram.', kind: 'unsupported' };
    case 'messageCall': return { text: 'Llamada de Telegram.', kind: 'service' };
    case 'messageExpiredPhoto': return { text: 'Foto temporal expirada.', kind: 'temporary' };
    case 'messageExpiredVideo': return { text: 'Vídeo temporal expirado.', kind: 'temporary' };
    case 'messageExpiredVideoNote': return { text: 'Vídeo circular temporal expirado.', kind: 'temporary' };
    case 'messageExpiredVoiceNote': return { text: 'Nota de voz temporal expirada.', kind: 'temporary' };
    case 'messageUnsupported': return { text: 'Contenido no compatible todavía.', kind: 'unsupported' };
    default:
      if (SERVICE_CONTENT.test(content._)) return { text: 'Mensaje de servicio de Telegram.', kind: 'service' };
      return { text: 'Contenido no compatible todavía.', kind: 'unsupported' };
  }
}

export function mapTdMessage(message: TdObject, accountId: string, sender: string): LiveMessage {
  const chatId = idString(message.chat_id);
  const messageId = toSafeNumber(message.id);
  const sentAt = positiveNumber(message.date);
  const editedAt = positiveNumber(message.edit_date);
  const temporal = positiveNumber(message.self_destruct_in) > 0;
  const content = temporal
    ? { text: 'Contenido temporal: ábrelo en el cliente oficial.', kind: 'temporary' as const }
    : extractContent(message.content);
  const outgoing = Boolean(message.is_outgoing);
  return {
    id: messageKey(accountId, chatId, messageId),
    accountId,
    chatId,
    messageId,
    sender: outgoing ? 'Tú' : sender,
    outgoing,
    text: content.text,
    time: formatTime(sentAt),
    sentAt: sentAt * 1000,
    editedAt: editedAt * 1000,
    kind: content.kind,
  };
}

export interface TdChatLookup {
  user(id: string): TdObject | undefined;
  supergroup(id: string): TdObject | undefined;
  basicGroup(id: string): TdObject | undefined;
}

function memberStatus(status: TdObject | undefined): 'member' | 'admin' | 'left' | 'restricted' {
  if (!status || typeof status._ !== 'string') return 'member';
  if (status._ === 'chatMemberStatusAdministrator' || status._ === 'chatMemberStatusCreator') return 'admin';
  if (status._ === 'chatMemberStatusLeft' || status._ === 'chatMemberStatusBanned') return 'left';
  if (status._ === 'chatMemberStatusRestricted') return status.is_member ? 'restricted' : 'left';
  return 'member';
}

export function mapTdChat(chat: TdObject, accountId: string, lookup: TdChatLookup): LiveChat {
  const type = chat.type ?? {};
  const typeId = String(type._ ?? '');
  const supergroupId = typeId === 'chatTypeSupergroup' ? idString(type.supergroup_id) : '';
  const userId = typeId === 'chatTypePrivate' || typeId === 'chatTypeSecret' ? idString(type.user_id) : '';
  const basicGroupId = typeId === 'chatTypeBasicGroup' ? idString(type.basic_group_id) : '';
  const supergroup = supergroupId ? lookup.supergroup(supergroupId) : undefined;
  const user = userId ? lookup.user(userId) : undefined;
  const basicGroup = basicGroupId ? lookup.basicGroup(basicGroupId) : undefined;
  const isPrivate = Boolean(userId);
  const isSecret = typeId === 'chatTypeSecret';
  const isSelf = isPrivate && userId === accountId;
  const isChannel = Boolean(type.is_channel || supergroup?.is_channel);
  const kind: LiveChat['kind'] = isPrivate
    ? user?.type?._ === 'userTypeBot' ? 'bot' : 'private'
    : isChannel ? 'channel' : 'group';
  const status = memberStatus(isPrivate ? undefined : supergroup?.status ?? basicGroup?.status);
  const unavailable = Boolean(
    isSecret ||
    (user?.type?._ === 'userTypeDeleted') ||
    (supergroup && !isChannel && status === 'left') ||
    (basicGroup && (!basicGroup.is_active || status === 'left')),
  );
  const forum = Boolean(supergroup?.is_forum);
  const special = Boolean(supergroup?.is_direct_messages_group || supergroup?.is_administered_direct_messages_group || supergroup?.is_broadcast_group);
  const permissions = supergroup && status === 'restricted' ? supergroup.status?.permissions : chat.permissions;
  const canSendPermission = permissions ? Boolean(permissions.can_send_basic_messages) : status !== 'left';
  const canSendText = !unavailable && !isChannel && !forum && !special && status !== 'left' && (status === 'admin' || canSendPermission);
  const readOnlyReason = unavailable ? 'Esta conversación no está disponible para tu cuenta.'
    : isSecret ? 'Los chats secretos no están disponibles en este cliente web.'
    : isChannel ? 'Los canales son de solo lectura en esta etapa.'
    : forum ? 'El envío a temas de foro aún no está disponible.'
    : special ? 'El envío a conversaciones especiales aún no está disponible.'
    : !canSendText ? 'Telegram no permite escribir en esta conversación.' : undefined;
  const last = chat.last_message && typeof chat.last_message === 'object' ? chat.last_message : null;
  const lastText = last ? (positiveNumber(last.self_destruct_in) > 0
    ? 'Contenido temporal: ábrelo en el cliente oficial.'
    : extractContent(last.content).text) : '';
  const lastAt = last ? positiveNumber(last.date) : 0;
  const unread = Number.isSafeInteger(chat.unread_count) && chat.unread_count > 0 ? chat.unread_count : 0;
  const title = isSelf ? 'Mensajes guardados' : (typeof chat.title === 'string' && chat.title.trim()) || safeUsername(user);
  const initials = isSelf ? 'MG' : title.split(/\s+/).slice(0, 2).map((part) => Array.from(part)[0] ?? '').join('').toUpperCase() || 'TG';
  const memberCount = supergroup?.member_count ?? basicGroup?.member_count;
  const members = isSelf ? 'Tu espacio personal en Telegram'
    : kind === 'channel' ? 'Canal de Telegram · solo lectura'
    : kind === 'group' ? (memberCount ? `${memberCount} miembros` : 'Grupo de Telegram')
    : kind === 'bot' ? 'Bot de Telegram' : 'Conversación privada de Telegram';
  const pinned = Array.isArray(chat.positions) && chat.positions.some((position: TdObject) =>
    position?.list?._ === 'chatListMain' && position.is_pinned === true);
  // TDLib includes the blurred minithumbnail with the chat, so avatars work without
  // a download endpoint or extra round trips.
  const photoInfo = chat.photo && typeof chat.photo === 'object' ? chat.photo : null;
  const smallPhoto = photoInfo?.small && typeof photoInfo.small === 'object' ? photoInfo.small : null;
  const mini = photoInfo?.minithumbnail?.data;
  const photo = typeof mini === 'string' && mini.length > 0 && mini.length <= 22000 ? `data:image/jpeg;base64,${mini}` : undefined;
  const photoKey = smallPhoto && smallPhoto.id !== undefined && smallPhoto.id !== null ? String(smallPhoto.id) : undefined;
  return {
    ...(photo ? { photo } : {}),
    ...(photoKey ? { photoKey } : {}),
    id: idString(chat.id),
    accountId,
    title,
    initials,
    color: kind === 'bot' ? 'amber' : kind === 'group' ? 'mint' : kind === 'channel' ? 'violet' : 'blue',
    kind,
    preview: previewText(lastText) || 'Sin mensajes recientes',
    time: lastAt ? formatTime(lastAt) : '',
    unread,
    pinned,
    verified: verified(user, supergroup),
    members,
    messageScope: supergroupId ? 'channel' : 'global',
    lastMessageAt: lastAt * 1000,
    lastMessageId: last ? toSafeNumber(last.id) : 0,
    isSelf,
    canSendText,
    readOnlyReason,
    readOutgoingId: positiveNumber(chat.last_read_outbox_message_id),
  };
}

export function safeTdlibError(error: unknown): { statusCode: number; message: string } {
  if (error instanceof TelegramGatewayError) return { statusCode: error.statusCode, message: error.message };
  const raw = error as { code?: unknown; message?: unknown } | null;
  const text = typeof raw?.message === 'string' ? raw.message : '';
  const flood = /(?:FLOOD_WAIT_|SLOWMODE_WAIT_|retry after\s+)(\d+)/i.exec(text);
  if (flood) return { statusCode: 429, message: `Telegram pide esperar ${flood[1]} segundos. No se reintentará automáticamente.` };
  const code = text.split(':')[0].trim().toUpperCase();
  const known: Record<string, string> = {
    PHONE_NUMBER_INVALID: 'Revisa el número con prefijo internacional.',
    PHONE_NUMBER_BANNED: 'Telegram ha rechazado este número. Consulta su soporte oficial.',
    PHONE_CODE_INVALID: 'El código no es correcto. Introdúcelo de nuevo.',
    PHONE_CODE_EXPIRED: 'El código ha caducado. Cancela y vuelve a iniciar sesión.',
    PASSWORD_HASH_INVALID: 'La contraseña 2FA no es correcta.',
    AUTH_RESTART: 'Telegram solicita reiniciar la autenticación. Vuelve a empezar.',
    API_ID_INVALID: 'Telegram ha rechazado las credenciales de aplicación del servidor.',
    CHAT_WRITE_FORBIDDEN: 'No tienes permiso para escribir en esta conversación.',
    USER_BANNED_IN_CHANNEL: 'No puedes escribir en este grupo o canal.',
    CHANNEL_PRIVATE: 'Telegram no permite acceder a este grupo o canal.',
    CHAT_ADMIN_REQUIRED: 'Esta operación requiere permisos de administración.',
    SESSION_REVOKED: 'La sesión fue revocada. Cierra sesión e inicia de nuevo.',
    AUTH_KEY_UNREGISTERED: 'La sesión ya no está autorizada. Vuelve a iniciar sesión.',
    MESSAGE_ID_INVALID: 'El mensaje ya no está disponible.',
    MESSAGE_DELETE_FORBIDDEN: 'No se puede eliminar ese mensaje.',
    MESSAGE_TOO_LONG: 'El mensaje es demasiado largo para Telegram.',
    MESSAGE_TEXT_EMPTY: 'El mensaje no puede estar vacío.',
    CHAT_NOT_FOUND: 'La conversación ya no está disponible.',
    CHAT_RESTRICTED: 'No puedes escribir en esta conversación.',
    USER_IS_BLOCKED: 'No puedes escribir a este usuario porque te ha bloqueado o lo has bloqueado.',
  };
  if (known[code]) return { statusCode: 400, message: known[code] };
  return { statusCode: 502, message: 'Telegram no pudo completar la operación. No se muestran datos privados del error.' };
}

function codeTypeLabel(type: TdObject | undefined): string {
  switch (type?._) {
    case 'authenticationCodeTypeSms': return 'SMS';
    case 'authenticationCodeTypeCall': return 'llamada de voz';
    case 'authenticationCodeTypeFlashCall': return 'llamada flash';
    case 'authenticationCodeTypeMissedCall': return 'llamada perdida';
    case 'authenticationCodeTypeFragment': return 'Fragment';
    case 'authenticationCodeTypeFirebaseAndroid':
    case 'authenticationCodeTypeFirebaseIos': return 'notificación push';
    case 'authenticationCodeTypeTelegramMessage': return 'mensaje de Telegram';
    default: return 'Telegram';
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => { setTimeout(() => resolve(), ms).unref?.(); });
}

export async function mapWithLimit<T, R>(items: readonly T[], limit: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const result = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      result[index] = await mapper(items[index]);
    }
  });
  await Promise.all(workers);
  return result;
}

export class TdlibSession {
  readonly id: string;
  readonly createdAt = Date.now();
  lastSeen = Date.now();
  private readonly dir: string;
  private readonly encryptionKey = randomBytes(32).toString('base64');
  private client: TdClient | null = null;
  private auth: TelegramWebAuth = { enabled: true, active: true, step: 'starting' };
  private connection: LiveConnectionState = 'connecting';
  private listeners = new Set<(event: TelegramWebEvent) => void>();
  private authWaiters = new Set<() => void>();
  private readonly chats = new Map<string, TdObject>();
  private readonly users = new Map<string, TdObject>();
  private readonly supergroups = new Map<string, TdObject>();
  private readonly basicGroups = new Map<string, TdObject>();
  private meId = '';
  private chatExhausted = false;
  private chatLock: Promise<void> = Promise.resolve();
  private mappingQueue: Promise<void> = Promise.resolve();
  private disposed = false;

  constructor(private readonly config: TelegramWebConfig, readonly tokenHash: string, id = randomUUID()) {
    this.id = id;
    this.dir = join(config.dataDir, 'sessions', id);
  }

  async open(): Promise<void> {
    try {
      await mkdir(this.dir, { recursive: true, mode: 0o700 });
    } catch {
      throw new TelegramGatewayError(503, 'No se pudo preparar el directorio privado de TDLib en el servidor. Revisa WRGRAM_TELEGRAM_DATA_DIR y sus permisos.');
    }
    let createClient: TdlibModules['createClient'];
    try {
      ({ createClient } = await loadTdlib());
    } catch {
      await this.cleanupDirectory();
      throw new TelegramGatewayError(503, 'TDLib no pudo cargarse en el servidor. Revisa la instalación de la biblioteca nativa y vuelve a intentarlo.');
    }
    try {
      this.client = createClient({
        apiId: this.config.apiId,
        apiHash: this.config.apiHash,
        databaseDirectory: join(this.dir, 'database'),
        filesDirectory: join(this.dir, 'files'),
        databaseEncryptionKey: this.encryptionKey,
        useTestDc: false,
        tdlibParameters: {
          use_message_database: true,
          use_secret_chats: false,
          use_chat_info_database: true,
          use_file_database: false,
          system_language_code: 'es',
          application_version: '0.1.0-web',
          device_model: 'WRGram Web',
          system_version: process.platform,
        },
      });
    } catch {
      await this.cleanupDirectory();
      throw new TelegramGatewayError(503, 'TDLib no pudo iniciarse en el servidor. Revisa la instalación de la biblioteca nativa.');
    }
    this.client.on('update', this.onUpdate);
    this.client.on('error', this.onClientError);
  }

  authSnapshot(): TelegramWebAuth { return { ...this.auth }; }
  getConnectionState(): LiveConnectionState { return this.connection; }
  get streamCount(): number { return this.listeners.size; }
  get accountId(): string { return this.meId; }

  private emit(event: TelegramWebEvent) {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Un flujo SSE roto no debe afectar a la sesión. */ }
    }
  }

  subscribe(listener: (event: TelegramWebEvent) => void): () => void {
    this.listeners.add(listener);
    this.lastSeen = Date.now();
    return () => { this.listeners.delete(listener); };
  }

  private setAuth(patch: Partial<TelegramWebAuth>) {
    const next = { ...this.auth, ...patch };
    if (patch.step && patch.step !== 'ready') {
      delete next.displayName;
      delete next.accountId;
    }
    if (patch.step && patch.step !== 'code') {
      delete next.codeLength;
      delete next.codeType;
      delete next.codeTimeout;
    }
    if (patch.step && patch.step !== 'password') delete next.passwordHint;
    this.auth = next;
    const event: TelegramWebEvent = { type: 'auth', auth: this.authSnapshot() };
    this.emit(event);
    for (const waiter of [...this.authWaiters]) waiter();
  }

  private setConnection(state: LiveConnectionState) {
    if (this.connection === state) return;
    this.connection = state;
    this.emit({ type: 'connection', state });
  }

  private requireReady() {
    if (this.disposed || !this.client) throw new TelegramGatewayError(503, 'La sesión TDLib no está disponible.');
    if (this.auth.step !== 'ready') throw new TelegramGatewayError(409, 'La cuenta aún no ha iniciado sesión en Telegram.');
  }

  private async invoke(query: Record<string, unknown>): Promise<TdObject> {
    if (!this.client || this.disposed) throw new TelegramGatewayError(503, 'La sesión TDLib no está disponible.');
    const result = await withTimeout(this.client.invoke(query), 45_000);
    if (result === null) {
      throw new TelegramGatewayError(504, 'Telegram no respondió a tiempo. Comprueba la conexión e inténtalo de nuevo.');
    }
    return result;
  }

  private onClientError = (error: Error) => {
    if (this.disposed) return;
    if (this.auth.step === 'ready') {
      // Una actualización fallida no debe cerrar una cuenta ya autorizada ni simular
      // una desconexión que TDLib no ha notificado.
      this.emit({ type: 'error', message: 'Una actualización de Telegram no se pudo procesar. La sesión sigue activa; actualiza la conversación si falta algún cambio.' });
    } else {
      this.setAuth({ step: 'unsupported', unsupportedReason: safeTdlibError(error).message });
      this.setConnection('offline');
    }
    // No se registra el mensaje original: puede contener contexto interno de TDLib.
    void error;
  };

  private onUpdate = (update: TdObject) => {
    if (this.disposed || !update || typeof update._ !== 'string') return;
    // lastSeen refleja actividad del navegador/API, no el tráfico continuo de Telegram:
    // una pestaña cerrada no debe mantener la autorización indefinidamente.
    switch (update._) {
      case 'updateAuthorizationState':
        this.handleAuthorizationState(update.authorization_state ?? {});
        break;
      case 'updateConnectionState':
        this.handleConnectionState(update.state ?? {});
        break;
      case 'updateNewChat':
        if (update.chat?.id != null) this.chats.set(idString(update.chat.id), update.chat);
        break;
      case 'updateChatTitle':
        this.patchChat(update.chat_id, { title: update.title });
        break;
      case 'updateChatLastMessage':
        this.patchChat(update.chat_id, {
          ...(update.last_message ? { last_message: update.last_message } : { last_message: undefined }),
          ...(Array.isArray(update.positions) ? { positions: update.positions } : {}),
        });
        break;
      case 'updateChatReadInbox': {
        const chatId = idString(update.chat_id);
        this.patchChat(chatId, {
          last_read_inbox_message_id: update.last_read_inbox_message_id,
          unread_count: update.unread_count,
        });
        this.emit({
          type: 'read',
          chatId,
          outbox: false,
          maxId: positiveNumber(update.last_read_inbox_message_id),
          unread: positiveNumber(update.unread_count),
        });
        break;
      }
      case 'updateChatReadOutbox': {
        const chatId = idString(update.chat_id);
        this.patchChat(chatId, { last_read_outbox_message_id: update.last_read_outbox_message_id });
        this.emit({ type: 'read', chatId, outbox: true, maxId: positiveNumber(update.last_read_outbox_message_id), unread: 0 });
        break;
      }
      case 'updateChatPosition': {
        const chatId = idString(update.chat_id);
        const current = this.chats.get(chatId);
        const position = update.position;
        if (!current || !position || typeof position !== 'object') break;
        const listKey = JSON.stringify(position.list ?? null);
        const positions = (Array.isArray(current.positions) ? current.positions : [])
          .filter((item: TdObject) => JSON.stringify(item?.list ?? null) !== listKey);
        if (Number(position.order) !== 0) positions.push(position);
        this.chats.set(chatId, { ...current, positions });
        break;
      }
      case 'updateChatPermissions':
        this.patchChat(update.chat_id, { permissions: update.permissions });
        break;
      case 'updateUser':
        if (update.user?.id != null) this.users.set(idString(update.user.id), update.user);
        break;
      case 'updateBasicGroup':
        if (update.basic_group?.id != null) this.basicGroups.set(idString(update.basic_group.id), update.basic_group);
        break;
      case 'updateSupergroup':
        if (update.supergroup?.id != null) this.supergroups.set(idString(update.supergroup.id), update.supergroup);
        break;
      case 'updateNewMessage':
        this.enqueueMapping(() => this.handleNewMessage(update.message));
        break;
      case 'updateMessageContent':
      case 'updateMessageEdited':
        this.enqueueMapping(() => this.handleEdited(update.chat_id, update.message_id));
        break;
      case 'updateDeleteMessages': {
        const chatId = idString(update.chat_id);
        const messageIds = Array.isArray(update.message_ids) ? update.message_ids.map(toSafeNumber) : [];
        if (messageIds.length) this.emit({ type: 'deleted', accountId: this.meId, chatId, messageIds });
        break;
      }
      case 'updateChatAction':
        // El contrato actual no muestra indicadores de escritura remotos.
        break;
      default:
        break;
    }
  };

  private patchChat(chatIdValue: unknown, patch: TdObject) {
    const chatId = idString(chatIdValue);
    const current = this.chats.get(chatId);
    if (!current) return;
    this.chats.set(chatId, { ...current, ...patch });
  }

  private handleConnectionState(state: TdObject) {
    switch (state._) {
      case 'connectionStateReady': this.setConnection('connected'); break;
      case 'connectionStateUpdating': this.setConnection('updating'); break;
      case 'connectionStateConnecting':
      case 'connectionStateConnectingToProxy': this.setConnection('connecting'); break;
      case 'connectionStateWaitingForNetwork': this.setConnection('offline'); break;
      default: break;
    }
  }

  private handleAuthorizationState(state: TdObject) {
    switch (state._) {
      case 'authorizationStateWaitTdlibParameters':
      case 'authorizationStateWaitEncryptionKey':
        this.setAuth({ step: 'starting' });
        break;
      case 'authorizationStateWaitPhoneNumber':
        this.setAuth({ step: 'phone' });
        break;
      case 'authorizationStateWaitCode': {
        const info = state.code_info ?? {};
        this.setAuth({
          step: 'code',
          codeLength: positiveNumber(info.type?.length) || positiveNumber(info.length) || undefined,
          codeType: codeTypeLabel(info.type),
          codeTimeout: positiveNumber(info.timeout) || undefined,
        });
        break;
      }
      case 'authorizationStateWaitPassword':
        this.setAuth({ step: 'password', passwordHint: typeof state.password_hint === 'string' ? state.password_hint : undefined });
        break;
      case 'authorizationStateWaitEmailAddress':
      case 'authorizationStateWaitEmailCode':
        this.setAuth({
          step: 'unsupported',
          unsupportedReason: 'Telegram solicita verificar un correo. Este flujo aún no está disponible en la web; usa el cliente oficial o la app de Android.',
        });
        break;
      case 'authorizationStateWaitRegistration':
        this.setAuth({
          step: 'unsupported',
          unsupportedReason: 'La cuenta necesita completar un registro nuevo. Regístrate en el cliente oficial y vuelve a intentarlo.',
        });
        break;
      case 'authorizationStateWaitOtherDeviceConfirmation':
        this.setAuth({
          step: 'unsupported',
          unsupportedReason: 'La confirmación por QR todavía no está disponible en este cliente web. Usa el código de acceso o la app de Android.',
        });
        break;
      case 'authorizationStateWaitPremiumPurchase':
        this.setAuth({
          step: 'unsupported',
          unsupportedReason: 'Telegram solicita una compra premium en el inicio de sesión. Este flujo no está disponible.',
        });
        break;
      case 'authorizationStateReady':
        // No se anuncia "ready" hasta tener el perfil: el navegador necesita accountId.
        this.setConnection('connected');
        void this.loadMe();
        break;
      case 'authorizationStateLoggingOut':
        this.setAuth({ step: 'closed' });
        break;
      case 'authorizationStateClosing':
      case 'authorizationStateClosed':
        this.setAuth({ step: 'closed' });
        this.setConnection('offline');
        break;
      default:
        break;
    }
  }

  private async loadMe() {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const user = await this.invoke({ _: 'getMe' });
        this.meId = idString(user.id);
        this.users.set(this.meId, user);
        this.setAuth({ step: 'ready', accountId: this.meId, displayName: safeUsername(user) });
        return;
      } catch {
        await delay(400);
      }
    }
    this.setAuth({
      step: 'unsupported',
      unsupportedReason: 'Telegram autorizó la cuenta, pero no se pudo leer el perfil. Cierra la sesión y vuelve a intentarlo.',
    });
  }

  private enqueueMapping(task: () => Promise<void>) {
    this.mappingQueue = this.mappingQueue.then(task).catch(() => undefined);
  }

  private async handleNewMessage(message: TdObject) {
    if (!message || message.is_scheduled) return;
    const chatId = idString(message.chat_id);
    const chat = await this.ensureChat(chatId);
    if (!chat) return;
    await this.ensureSender(message.sender_id);
    const liveMessage = mapTdMessage(message, this.meId, this.senderName(message.sender_id, chat));
    const last = chat.last_message;
    const newer = !last || positiveNumber(message.date) >= positiveNumber(last.date);
    // TDLib mantiene unread_count mediante updateChatReadInbox; no se duplica aquí.
    const nextChat = newer ? { ...chat, last_message: message } : chat;
    this.chats.set(chatId, nextChat);
    const liveChat = mapTdChat(nextChat, this.meId, this.lookup());
    this.emit({ type: 'message', message: liveMessage, chat: liveChat, edited: false });
  }

  private async handleEdited(chatIdValue: unknown, messageIdValue: unknown) {
    try {
      const chatId = idString(chatIdValue);
      const messageId = toSafeNumber(messageIdValue);
      const message = await this.invoke({ _: 'getMessage', chat_id: chatId, message_id: messageId });
      if (!message || message._ !== 'message') return;
      const chat = await this.ensureChat(chatId);
      if (!chat) return;
      await this.ensureSender(message.sender_id);
      const liveMessage = mapTdMessage(message, this.meId, this.senderName(message.sender_id, chat));
      const liveChat = mapTdChat(chat, this.meId, this.lookup());
      this.emit({ type: 'message', message: liveMessage, chat: liveChat, edited: true });
    } catch {
      // Un mensaje editado puede haberse borrado antes de la consulta.
    }
  }

  private async ensureChat(chatId: string): Promise<TdObject | undefined> {
    const cached = this.chats.get(chatId);
    if (cached) return cached;
    try {
      const chat = await this.invoke({ _: 'getChat', chat_id: chatId });
      if (chat?._ === 'chat') {
        this.chats.set(chatId, chat);
        return chat;
      }
    } catch {
      // La conversación puede haber sido eliminada o no ser accesible.
    }
    return undefined;
  }

  private async ensureUser(userIdValue: unknown): Promise<TdObject | undefined> {
    const userId = idString(userIdValue);
    const cached = this.users.get(userId);
    if (cached) return cached;
    try {
      const user = await this.invoke({ _: 'getUser', user_id: userId });
      if (user?._ === 'user') {
        this.users.set(userId, user);
        return user;
      }
    } catch {
      // Sin acceso al perfil.
    }
    return undefined;
  }

  private async ensureSender(sender: TdObject | undefined) {
    if (!sender || typeof sender._ !== 'string') return;
    if (sender._ === 'messageSenderUser') await this.ensureUser(sender.user_id);
    else if (sender._ === 'messageSenderChat') await this.ensureChat(idString(sender.chat_id));
  }

  private senderName(sender: TdObject | undefined, chat: TdObject | undefined): string {
    if (!sender) return 'Usuario de Telegram';
    try {
      if (sender._ === 'messageSenderUser') {
        const user = this.users.get(idString(sender.user_id));
        return user?.type?._ === 'userTypeDeleted' ? 'Cuenta eliminada' : (displayName(user) || 'Usuario de Telegram');
      }
      if (sender._ === 'messageSenderChat') {
        const chatId = idString(sender.chat_id);
        const found = this.chats.get(chatId);
        return typeof found?.title === 'string' && found.title.trim() ? found.title : 'Canal de Telegram';
      }
    } catch {
      // Identificador no válido: se usa el texto genérico.
    }
    return chat && typeof chat.title === 'string' && chat.title ? chat.title : 'Usuario de Telegram';
  }

  private lookup(): TdChatLookup {
    return {
      user: (id) => this.users.get(id),
      supergroup: (id) => this.supergroups.get(id),
      basicGroup: (id) => this.basicGroups.get(id),
    };
  }

  private async enrichChat(chat: TdObject) {
    const type = chat.type ?? {};
    try {
      if (type._ === 'chatTypePrivate' || type._ === 'chatTypeSecret') await this.ensureUser(type.user_id);
      else if (type._ === 'chatTypeBasicGroup') {
        const id = idString(type.basic_group_id);
        if (!this.basicGroups.has(id)) {
          const group = await this.invoke({ _: 'getBasicGroup', basic_group_id: id });
          if (group?._ === 'basicGroup') this.basicGroups.set(id, group);
        }
      } else if (type._ === 'chatTypeSupergroup') {
        const id = idString(type.supergroup_id);
        if (!this.supergroups.has(id)) {
          const group = await this.invoke({ _: 'getSupergroup', supergroup_id: id });
          if (group?._ === 'supergroup') this.supergroups.set(id, group);
        }
      }
    } catch {
      // La información del par puede no estar disponible; el chat sigue siendo utilizable.
    }
  }

  private async withChatLock<T>(task: () => Promise<T>): Promise<T> {
    const previous = this.chatLock;
    let release!: () => void;
    this.chatLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await task(); } finally { release(); }
  }

  async getChats(cursor?: string, signal?: AbortSignal): Promise<Page<LiveChat>> {
    this.requireReady();
    const PAGE = 30;
    const MAX = 500;
    return this.withChatLock(async () => {
      signal?.throwIfAborted();
      const offset = cursor ? Number(cursor) : 0;
      if (!Number.isSafeInteger(offset) || offset < 0) {
        throw new TelegramGatewayError(400, 'Página de conversaciones no válida.');
      }
      if (offset >= MAX) return { items: [], nextCursor: null };
      const requested = Math.min(offset + PAGE + 1, MAX);
      let ids: string[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        if (!this.chatExhausted) {
          try {
            await this.invoke({ _: 'loadChats', limit: requested });
          } catch (error) {
            if ((error as { code?: number })?.code === 404) this.chatExhausted = true;
            else throw error;
          }
        }
        signal?.throwIfAborted();
        const list = await this.invoke({ _: 'getChats', limit: requested });
        ids = Array.isArray(list.chat_ids) ? list.chat_ids.map(idString) : [];
        if (ids.length > offset || this.chatExhausted) break;
      }
      const newIds = ids.slice(offset, offset + PAGE);
      const moreLoaded = ids.length > offset + newIds.length;
      const moreRemote = !this.chatExhausted && newIds.length === PAGE;
      const nextOffset = offset + newIds.length;
      const items = await mapWithLimit(newIds, 6, async (id) => {
        signal?.throwIfAborted();
        const chat = await this.ensureChat(id);
        if (!chat) return null;
        await this.enrichChat(chat);
        return mapTdChat(chat, this.meId, this.lookup());
      });
      signal?.throwIfAborted();
      const nextCursor = newIds.length > 0 && (moreLoaded || moreRemote) && nextOffset < MAX
        ? String(nextOffset)
        : null;
      return { items: items.filter((chat): chat is LiveChat => Boolean(chat)), nextCursor };
    });
  }

  async getMessages(chatId: string, cursor?: string, signal?: AbortSignal): Promise<Page<LiveMessage>> {
    this.requireReady();
    const from = cursor ? Number(cursor) : 0;
    if (cursor && (!Number.isSafeInteger(from) || from <= 0)) throw new TelegramGatewayError(400, 'Página de historial no válida.');
    const response = await this.invoke({
      _: 'getChatHistory',
      chat_id: chatId,
      from_message_id: from,
      offset: 0,
      limit: 40,
      only_local: false,
    });
    signal?.throwIfAborted();
    const messages = (Array.isArray(response.messages) ? response.messages : []).filter((message: TdObject | null): message is TdObject => Boolean(message && message._ === 'message'));
    const chat = await this.ensureChat(chatId);
    if (chat) await this.enrichChat(chat);
    await Promise.all([...new Set(messages.map((message: TdObject) => message.sender_id).filter(Boolean).map((sender: TdObject) => JSON.stringify(sender)))].map(async (serialized) => {
      await this.ensureSender(JSON.parse(serialized));
    }));
    signal?.throwIfAborted();
    const items = messages.map((message: TdObject) => mapTdMessage(message, this.meId, this.senderName(message.sender_id, chat)));
    const ids = messages.map((message: TdObject) => toSafeNumber(message.id)).filter((id: number) => id > 0);
    const oldest = ids.length ? Math.min(...ids) : 0;
    // TDLib puede devolver menos de 40 aunque haya más historial; el cursor sigue siendo
    // válido hasta que una página llegue vacía.
    const nextCursor = messages.length > 0 && oldest > 0 && (!from || oldest < from) ? String(oldest) : null;
    return { items, nextCursor };
  }

  async sendMessage(chatId: string, text: string): Promise<LiveMessage> {
    this.requireReady();
    const chat = await this.ensureChat(chatId);
    if (!chat) throw new TelegramGatewayError(404, 'La conversación ya no está disponible.');
    await this.enrichChat(chat);
    const liveChat = mapTdChat(chat, this.meId, this.lookup());
    if (!liveChat.canSendText) throw new TelegramGatewayError(403, liveChat.readOnlyReason ?? 'No puedes enviar mensajes a esta conversación.');
    const sent = await this.invoke({
      _: 'sendMessage',
      chat_id: chatId,
      input_message_content: {
        _: 'inputMessageText',
        text: { _: 'formattedText', text },
        link_preview_options: { _: 'linkPreviewOptions', is_disabled: true },
        clear_draft: false,
      },
    });
    if (!sent || sent._ !== 'message') throw new TelegramGatewayError(502, 'Telegram no confirmó el envío.');
    await this.ensureSender(sent.sender_id);
    return mapTdMessage(sent, this.meId, this.senderName(sent.sender_id, chat));
  }

  async markRead(chatId: string, maxId: number): Promise<void> {
    this.requireReady();
    if (!Number.isSafeInteger(maxId) || maxId <= 0) return;
    await this.invoke({ _: 'viewMessages', chat_id: chatId, message_ids: [maxId], force_read: true });
    const chat = this.chats.get(chatId);
    if (chat && positiveNumber(chat.last_message?.id) <= maxId) {
      this.chats.set(chatId, { ...chat, unread_count: 0, last_read_inbox_message_id: maxId });
    }
  }

  async setTyping(chatId: string, active: boolean): Promise<void> {
    this.requireReady();
    const chat = this.chats.get(chatId);
    if (!chat) return;
    await this.enrichChat(chat);
    if (!mapTdChat(chat, this.meId, this.lookup()).canSendText) return;
    await this.invoke({ _: 'sendChatAction', chat_id: chatId, action: active ? { _: 'chatActionTyping' } : { _: 'chatActionCancel' } });
  }

  async loginPhone(phone: string): Promise<TelegramWebAuth> {
    if (this.auth.step !== 'phone') throw new TelegramGatewayError(409, 'La sesión no está esperando un número de teléfono.');
    await this.invoke({ _: 'setAuthenticationPhoneNumber', phone_number: phone });
    return this.waitForStepChange('phone');
  }

  async loginCode(code: string): Promise<TelegramWebAuth> {
    if (this.auth.step !== 'code') throw new TelegramGatewayError(409, 'La sesión no está esperando un código.');
    await this.invoke({ _: 'checkAuthenticationCode', code });
    return this.waitForStepChange('code');
  }

  async loginPassword(password: string): Promise<TelegramWebAuth> {
    if (this.auth.step !== 'password') throw new TelegramGatewayError(409, 'La sesión no está esperando una contraseña 2FA.');
    await this.invoke({ _: 'checkAuthenticationPassword', password });
    return this.waitForStepChange('password');
  }

  private async waitForStepChange(step: TelegramWebAuth['step']): Promise<TelegramWebAuth> {
    if (this.auth.step !== step) return this.authSnapshot();
    await new Promise<void>((resolve) => {
      const finish = () => { clearTimeout(timer); this.authWaiters.delete(finish); resolve(); };
      const timer = setTimeout(finish, 6000);
      timer.unref?.();
      this.authWaiters.add(finish);
    });
    return this.authSnapshot();
  }

  private async cleanupDirectory() {
    try {
      await rm(this.dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch { /* Mejor esfuerzo: Windows puede retener la base unos instantes. */ }
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    this.setAuth({ step: 'closed' });
    this.listeners.clear();
    this.authWaiters.clear();
    const client = this.client;
    this.client = null;
    if (client && !client.isClosed()) {
      try {
        if (this.meId) await withTimeout(client.invoke({ _: 'logOut' }).catch(() => undefined), 8000);
      } catch { /* La revocación puede fallar sin red. */ }
      try {
        // close espera a authorizationStateClosed y libera los descriptores de la base.
        await withTimeout(client.close().catch(() => undefined), 8000);
      } catch { /* Se intenta destroy a continuación. */ }
      if (!client.isClosed()) {
        try {
          await withTimeout(client.invoke({ _: 'destroy' }).catch(() => undefined), 4000);
        } catch { /* La carpeta se intenta borrar igualmente. */ }
      }
    }
    await this.cleanupDirectory();
  }
}
