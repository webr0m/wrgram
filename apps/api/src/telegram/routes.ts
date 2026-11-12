import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { TelegramWebSessionResponse, TelegramWebStatus } from '@wrgram/telegram';
import { readTelegramWebConfig, type TelegramWebConfig } from './config';
import { clearSessionCookie, readCookie, sessionCookie, TelegramSessionManager } from './sessions';
import { safeTdlibError, TelegramGatewayError, TdlibSession } from './tdlib';

export interface TelegramWebGateway {
  enabled: boolean;
  reason?: string;
  config: TelegramWebConfig | null;
  manager: TelegramSessionManager | null;
  close(): Promise<void>;
}

export function createTelegramWebGateway(env: NodeJS.ProcessEnv = process.env): TelegramWebGateway {
  const result = readTelegramWebConfig(env);
  if (!result.config) {
    return { enabled: false, reason: result.reason, config: null, manager: null, close: async () => undefined };
  }
  const manager = new TelegramSessionManager(result.config);
  return {
    enabled: true,
    config: result.config,
    manager,
    close: () => manager.close(),
  };
}

function bodyObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new TelegramGatewayError(400, 'Solicitud inválida.');
  }
  return body as Record<string, unknown>;
}

export function normalizePhone(value: unknown): string {
  if (typeof value !== 'string') throw new TelegramGatewayError(400, 'Escribe el número con prefijo internacional.');
  const phone = value.replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
    throw new TelegramGatewayError(400, 'Usa el formato internacional, por ejemplo +34 seguido de tu número.');
  }
  return phone;
}

export function requireText(value: unknown, max = 4096): string {
  if (typeof value !== 'string') throw new TelegramGatewayError(400, 'El mensaje no es válido.');
  const text = value.trim();
  if (!text) throw new TelegramGatewayError(400, 'El mensaje no puede estar vacío.');
  if (text.length > max) throw new TelegramGatewayError(400, `El mensaje supera los ${max} caracteres.`);
  return text;
}

function requireCode(value: unknown): string {
  if (typeof value !== 'string') throw new TelegramGatewayError(400, 'Escribe el código que envió Telegram.');
  const code = value.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9-]{3,32}$/.test(code)) throw new TelegramGatewayError(400, 'El código no tiene un formato válido.');
  return code;
}

function requirePassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) {
    throw new TelegramGatewayError(400, 'Escribe tu contraseña de verificación en dos pasos.');
  }
  return value;
}

function requireChatId(value: unknown): string {
  if (typeof value !== 'string' || !/^-?\d{1,20}$/.test(value)) throw new TelegramGatewayError(400, 'Conversación no válida.');
  return value;
}

function optionalCursor(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d{1,20}$/.test(value)) throw new TelegramGatewayError(400, 'Página no válida.');
  return value;
}

function sameOrigin(request: FastifyRequest, config: TelegramWebConfig): boolean {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (config.webOrigin && url.origin === config.webOrigin) return true;
    return Boolean(request.headers.host) && url.host === request.headers.host;
  } catch {
    return false;
  }
}

function requireBrowserWrite(request: FastifyRequest, reply: FastifyReply, config: TelegramWebConfig): boolean {
  if (!sameOrigin(request, config)) {
    reply.code(403).send({ message: 'El origen de la solicitud no está permitido.' });
    return false;
  }
  if (request.headers['x-wrgram-client'] !== 'web') {
    reply.code(403).send({ message: 'La solicitud no procede del cliente web de WRGram.' });
    return false;
  }
  return true;
}

function sessionFrom(request: FastifyRequest, manager: TelegramSessionManager, reply: FastifyReply): TdlibSession | null {
  const token = readCookie(request.headers.cookie);
  const session = manager.get(token);
  if (!session) {
    reply.code(401).send({ message: 'No hay una sesión web activa. Crea una nueva para continuar.' });
    return null;
  }
  return session;
}

function failure(reply: FastifyReply, error: unknown) {
  const safe = safeTdlibError(error);
  return reply.code(safe.statusCode).send({ message: safe.message });
}

export async function registerTelegramWebRoutes(app: FastifyInstance, gateway: TelegramWebGateway): Promise<void> {
  const manager = gateway.manager;
  const config = gateway.config;
  if (manager) await manager.init();
  app.addHook('onClose', async () => { await gateway.close(); });

  app.get('/v1/telegram/status', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const body: TelegramWebStatus = gateway.enabled ? { enabled: true } : { enabled: false, ...(gateway.reason ? { reason: gateway.reason } : {}) };
    return body;
  });

  if (!manager || !config) {
    app.all('/v1/telegram/*', async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return reply.code(503).send({ message: gateway.reason ?? 'El cliente web TDLib está desactivado en este servidor.' });
    });
    return;
  }

  app.get('/v1/telegram/session', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const token = readCookie(request.headers.cookie);
    const session = manager.get(token);
    if (!session) {
      if (token) reply.header('Set-Cookie', clearSessionCookie(config));
      const body: TelegramWebSessionResponse = { enabled: true, active: false };
      return body;
    }
    if (token) reply.header('Set-Cookie', sessionCookie(token, config, Math.floor(config.sessionTtlMs / 1000)));
    const body: TelegramWebSessionResponse = { enabled: true, active: true, auth: session.authSnapshot() };
    return body;
  });

  app.post('/v1/telegram/session', { config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    try {
      const existingToken = readCookie(request.headers.cookie);
      const existing = manager.get(existingToken);
      if (existing) {
        if (existingToken) reply.header('Set-Cookie', sessionCookie(existingToken, config, Math.floor(config.sessionTtlMs / 1000)));
        const body: TelegramWebSessionResponse = { enabled: true, active: true, auth: existing.authSnapshot() };
        return body;
      }
      const { token, session } = await manager.create(request.ip);
      reply.header('Set-Cookie', sessionCookie(token, config, Math.floor(config.sessionTtlMs / 1000)));
      const body: TelegramWebSessionResponse = { enabled: true, active: true, auth: session.authSnapshot() };
      return body;
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/session/logout', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    try {
      await manager.destroy(readCookie(request.headers.cookie));
      reply.header('Set-Cookie', clearSessionCookie(config));
      return { ok: true };
    } catch (error) {
      return failure(reply, error);
    }
  });

  const loginOptions = { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } };

  app.post('/v1/telegram/login/phone', loginOptions, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const phone = normalizePhone(bodyObject(request.body).phone);
      return { auth: await session.loginPhone(phone) };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/login/code', loginOptions, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const code = requireCode(bodyObject(request.body).code);
      return { auth: await session.loginCode(code) };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/login/password', loginOptions, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const password = requirePassword(bodyObject(request.body).password);
      return { auth: await session.loginPassword(password) };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.get('/v1/telegram/chats', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const cursor = optionalCursor((request.query as Record<string, unknown> | undefined)?.cursor);
      const abort = new AbortController();
      const onClose = () => abort.abort();
      reply.raw.once('close', onClose);
      try {
        return await session.getChats(cursor, abort.signal);
      } finally {
        reply.raw.off('close', onClose);
      }
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.get('/v1/telegram/chats/:chatId/messages', { config: { rateLimit: { max: 180, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const chatId = requireChatId((request.params as Record<string, unknown>).chatId);
      const cursor = optionalCursor((request.query as Record<string, unknown> | undefined)?.cursor);
      return await session.getMessages(chatId, cursor);
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/chats/:chatId/messages', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const chatId = requireChatId((request.params as Record<string, unknown>).chatId);
      const text = requireText(bodyObject(request.body).text);
      return { message: await session.sendMessage(chatId, text) };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/chats/:chatId/read', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const chatId = requireChatId((request.params as Record<string, unknown>).chatId);
      const maxId = bodyObject(request.body).maxId;
      if (typeof maxId !== 'number' || !Number.isSafeInteger(maxId) || maxId <= 0) {
        throw new TelegramGatewayError(400, 'Identificador de lectura no válido.');
      }
      await session.markRead(chatId, maxId);
      return { ok: true };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.post('/v1/telegram/chats/:chatId/typing', { config: { rateLimit: { max: 90, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!requireBrowserWrite(request, reply, config)) return;
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    try {
      const chatId = requireChatId((request.params as Record<string, unknown>).chatId);
      const active = bodyObject(request.body).active;
      if (typeof active !== 'boolean') throw new TelegramGatewayError(400, 'Estado de escritura no válido.');
      await session.setTyping(chatId, active);
      return { ok: true };
    } catch (error) {
      return failure(reply, error);
    }
  });

  app.get('/v1/telegram/updates', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!sameOrigin(request, config)) return reply.code(403).send({ message: 'El origen de la solicitud no está permitido.' });
    const session = sessionFrom(request, manager, reply);
    if (!session) return;
    if (session.streamCount >= 4) return reply.code(429).send({ message: 'Hay demasiadas conexiones de actualización para esta sesión.' });

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    raw.flushHeaders?.();
    raw.write('retry: 5000\n\n');
    const send = (payload: unknown) => {
      if (raw.writableEnded || raw.destroyed) return;
      raw.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send({ type: 'auth', auth: session.authSnapshot() });
    send({ type: 'connection', state: session.getConnectionState() });
    const unsubscribe = session.subscribe(send);
    const keepAlive = setInterval(() => {
      session.lastSeen = Date.now();
      if (!raw.writableEnded && !raw.destroyed) raw.write(': keep-alive\n\n');
    }, 15_000);
    keepAlive.unref();
    const close = () => {
      clearInterval(keepAlive);
      unsubscribe();
      if (!raw.writableEnded) raw.end();
    };
    raw.once('close', close);
    return reply;
  });
}
