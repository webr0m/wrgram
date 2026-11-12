import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../app';
import type { TelegramWebConfig } from './config';
import { TelegramSessionManager } from './sessions';
import type { TdlibSession } from './tdlib';
import type { TelegramWebGateway } from './routes';

const config: TelegramWebConfig = {
  apiId: 1,
  apiHash: 'a'.repeat(32),
  dataDir: join(tmpdir(), 'wrgram-routes-test'),
  secureCookies: false,
  sessionTtlMs: 60_000,
  authTtlMs: 10_000,
  maxSessions: 4,
  maxSessionsPerIp: 4,
};

function fakeSession() {
  const auth = { enabled: true, active: true, step: 'phone' as const };
  const session = {
    lastSeen: Date.now(),
    authSnapshot: () => auth,
    open: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
    loginPhone: vi.fn(async () => ({ ...auth, step: 'code' as const, codeType: 'SMS', codeLength: 5 })),
    loginCode: vi.fn(async () => ({ ...auth, step: 'password' as const })),
    loginPassword: vi.fn(async () => ({ ...auth, step: 'ready' as const, accountId: '42', displayName: 'Ana' })),
    getChats: vi.fn(async () => ({ items: [], nextCursor: null })),
    getMessages: vi.fn(async () => ({ items: [], nextCursor: null })),
    sendMessage: vi.fn(async () => ({ id: '42/1/1' })),
    markRead: vi.fn(async () => undefined),
    setTyping: vi.fn(async () => undefined),
    streamCount: 0,
  };
  return session as unknown as TdlibSession & typeof session;
}

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

async function enabledApp() {
  const directory = await mkdtemp(join(tmpdir(), 'wrgram-routes-'));
  directories.push(directory);
  const session = fakeSession();
  const manager = new TelegramSessionManager({ ...config, dataDir: directory }, {
    cleanupOrphans: true,
    factory: () => session,
  });
  const gateway: TelegramWebGateway = { enabled: true, config: { ...config, dataDir: directory }, manager, close: () => manager.close() };
  const app = buildApp({ logger: false, telegram: gateway });
  return { app, session };
}

async function createCookie(app: Awaited<ReturnType<typeof enabledApp>>['app']): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/v1/telegram/session',
    headers: { 'x-wrgram-client': 'web' },
  });
  expect(response.statusCode).toBe(200);
  const setCookie = response.headers['set-cookie'];
  expect(setCookie).toBeDefined();
  return String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];
}

describe('rutas web de Telegram', () => {
  it('mantiene el modo desactivado sin abrir sesiones', async () => {
    const app = buildApp({ logger: false, telegram: false });
    const status = await app.inject({ method: 'GET', url: '/v1/telegram/status' });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toMatchObject({ enabled: false });
    const session = await app.inject({ method: 'POST', url: '/v1/telegram/session', headers: { 'x-wrgram-client': 'web' } });
    expect(session.statusCode).toBe(503);
    await app.close();
  });

  it('exige el cliente web y crea una cookie HttpOnly', async () => {
    const { app } = await enabledApp();
    expect((await app.inject({ method: 'POST', url: '/v1/telegram/session' })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'POST', url: '/v1/telegram/session',
      headers: { 'x-wrgram-client': 'web', origin: 'https://evil.example' },
    })).statusCode).toBe(403);
    const cookie = await createCookie(app);
    expect(cookie).toMatch(/^wrgram_tg=/);
    await app.close();
  });

  it('mantiene la sesión, valida el teléfono y permite cerrar', async () => {
    const { app, session } = await enabledApp();
    const cookie = await createCookie(app);
    const active = await app.inject({ method: 'GET', url: '/v1/telegram/session', headers: { cookie } });
    expect(active.json()).toMatchObject({ active: true, auth: { step: 'phone' } });

    const invalid = await app.inject({
      method: 'POST', url: '/v1/telegram/login/phone',
      headers: { cookie, 'x-wrgram-client': 'web' },
      payload: { phone: '12345' },
    });
    expect(invalid.statusCode).toBe(400);

    const valid = await app.inject({
      method: 'POST', url: '/v1/telegram/login/phone',
      headers: { cookie, 'x-wrgram-client': 'web' },
      payload: { phone: '+34 600 111 222' },
    });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().auth.step).toBe('code');
    expect(session.loginPhone).toHaveBeenCalledWith('+34600111222');

    const logout = await app.inject({
      method: 'POST', url: '/v1/telegram/session/logout',
      headers: { cookie, 'x-wrgram-client': 'web' },
    });
    expect(logout.json()).toEqual({ ok: true });
    expect(session.dispose).toHaveBeenCalledOnce();
    const closed = await app.inject({ method: 'GET', url: '/v1/telegram/session', headers: { cookie } });
    expect(closed.json().active).toBe(false);
    await app.close();
  });

  it('valida mensajes y no acepta chat IDs arbitrarios', async () => {
    const { app } = await enabledApp();
    const cookie = await createCookie(app);
    const empty = await app.inject({
      method: 'POST', url: '/v1/telegram/chats/123/messages',
      headers: { cookie, 'x-wrgram-client': 'web' },
      payload: { text: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    const invalid = await app.inject({
      method: 'POST', url: '/v1/telegram/chats/abc/messages',
      headers: { cookie, 'x-wrgram-client': 'web' },
      payload: { text: 'Hola' },
    });
    expect(invalid.statusCode).toBe(400);
    await app.close();
  });
});
