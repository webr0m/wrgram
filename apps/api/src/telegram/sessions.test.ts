import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelegramWebConfig } from './config';
import {
  clearSessionCookie,
  hashSessionToken,
  readCookie,
  sessionCookie,
  TelegramSessionManager,
} from './sessions';
import type { TdlibSession } from './tdlib';

const config: TelegramWebConfig = {
  apiId: 1,
  apiHash: 'a'.repeat(32),
  dataDir: join(tmpdir(), 'wrgram-tg-test'),
  secureCookies: true,
  sessionTtlMs: 60_000,
  authTtlMs: 10_000,
  maxSessions: 2,
  maxSessionsPerIp: 1,
};

function fakeSession(auth = { enabled: true, active: true, step: 'phone' as const }) {
  const session = {
    lastSeen: Date.now(),
    authSnapshot: () => auth,
    open: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  };
  return session as unknown as TdlibSession & typeof session;
}

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('sesiones web aisladas', () => {
  it('hashea los tokens y no los guarda en la cookie como identificador de sesión', () => {
    const a = hashSessionToken('token-de-prueba');
    expect(a).toBe(hashSessionToken('token-de-prueba'));
    expect(a).not.toBe('token-de-prueba');
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('lee solo la cookie esperada y con formato seguro', () => {
    expect(readCookie('otra=1; wrgram_tg=abcdefghijklmnopqrstuvwxyz012345; x=2')).toBe('abcdefghijklmnopqrstuvwxyz012345');
    expect(readCookie('wrgram_tg=corto')).toBeNull();
    expect(readCookie('otra=1')).toBeNull();
  });

  it('emite cookies HttpOnly, SameSite y Secure cuando corresponde', () => {
    const value = sessionCookie('token', config, 600);
    expect(value).toContain('HttpOnly');
    expect(value).toContain('SameSite=Strict');
    expect(value).toContain('Secure');
    expect(clearSessionCookie(config)).toContain('Max-Age=0');
  });

  it('limita sesiones por IP y globales', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrgram-sessions-'));
    directories.push(dir);
    const manager = new TelegramSessionManager({ ...config, dataDir: dir }, {
      cleanupOrphans: true,
      factory: () => fakeSession(),
    });
    await manager.init();
    const first = await manager.create('127.0.0.1');
    expect(manager.get(first.token)).not.toBeNull();
    await expect(manager.create('127.0.0.1')).rejects.toMatchObject({ statusCode: 429 });
    const second = await manager.create('127.0.0.2');
    expect(second.token).not.toBe(first.token);
    await expect(manager.create('127.0.0.3')).rejects.toMatchObject({ statusCode: 429 });
    await manager.close();
  });

  it('destruye y elimina la sesión al cerrar', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrgram-sessions-'));
    directories.push(dir);
    const session = fakeSession();
    const manager = new TelegramSessionManager({ ...config, dataDir: dir, maxSessionsPerIp: 3 }, {
      cleanupOrphans: true,
      factory: () => session,
    });
    await manager.init();
    const { token } = await manager.create('127.0.0.1');
    expect(manager.snapshot().sessions).toBe(1);
    await manager.destroy(token);
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(manager.get(token)).toBeNull();
    await manager.close();
  });

  it('barre sesiones caducadas según su estado de autenticación', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'wrgram-sessions-'));
    directories.push(dir);
    const session = fakeSession();
    const manager = new TelegramSessionManager({ ...config, dataDir: dir, maxSessionsPerIp: 3 }, {
      cleanupOrphans: true,
      factory: () => session,
    });
    await manager.init();
    await manager.create('127.0.0.1');
    session.lastSeen = Date.now() - config.authTtlMs - 1;
    await manager.sweep();
    expect(session.dispose).toHaveBeenCalledOnce();
    await manager.close();
  });
});
