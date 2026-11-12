import { createHash, randomBytes } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { TELEGRAM_SESSION_COOKIE, type TelegramWebConfig } from './config';
import { TelegramGatewayError, TdlibSession } from './tdlib';

export interface ManagedTelegramSession {
  session: TdlibSession;
  ip: string;
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function readCookie(header: string | undefined, name = TELEGRAM_SESSION_COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const key = part.slice(0, index).trim();
    if (key !== name) continue;
    const value = part.slice(index + 1).trim();
    if (/^[A-Za-z0-9_-]{20,200}$/.test(value)) return value;
  }
  return null;
}

export function sessionCookie(token: string, config: TelegramWebConfig, maxAgeSeconds: number): string {
  return [
    `${TELEGRAM_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    ...(config.secureCookies ? ['Secure'] : []),
  ].join('; ');
}

export function clearSessionCookie(config: TelegramWebConfig): string {
  return sessionCookie('', config, 0);
}

interface SessionFactory {
  (tokenHash: string): TdlibSession;
}

const realFactory = (config: TelegramWebConfig): SessionFactory => (tokenHash) => new TdlibSession(config, tokenHash);

export class TelegramSessionManager {
  private readonly sessions = new Map<string, ManagedTelegramSession>();
  private readonly factory: SessionFactory;
  private timer: NodeJS.Timeout | null = null;
  private closed = false;
  private createLock: Promise<void> = Promise.resolve();

  constructor(
    private readonly config: TelegramWebConfig,
    options: { factory?: SessionFactory; cleanupOrphans?: boolean } = {},
  ) {
    this.factory = options.factory ?? realFactory(config);
    this.cleanupOrphans = options.cleanupOrphans ?? true;
  }

  private readonly cleanupOrphans: boolean;

  async init(): Promise<void> {
    if (this.timer || this.closed) return;
    if (this.cleanupOrphans) {
      // Las claves de cifrado viven solo en memoria: una base de un proceso anterior
      // no se puede abrir y debe eliminarse. La autorización remota se revoca en Telegram.
      await rm(join(this.config.dataDir, 'sessions'), { recursive: true, force: true }).catch(() => undefined);
    }
    await mkdir(join(this.config.dataDir, 'sessions'), { recursive: true, mode: 0o700 });
    this.timer = setInterval(() => { void this.sweep(); }, 60_000);
    this.timer.unref();
  }

  private total(): number {
    return this.sessions.size;
  }

  private countIp(ip: string): number {
    let count = 0;
    for (const entry of this.sessions.values()) if (entry.ip === ip) count++;
    return count;
  }

  async create(ip: string): Promise<{ token: string; session: TdlibSession }> {
    const previous = this.createLock;
    let release!: () => void;
    this.createLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      if (this.closed) throw new TelegramGatewayError(503, 'El servicio TDLib se está cerrando.');
      await this.sweep();
      if (this.total() >= this.config.maxSessions) {
        throw new TelegramGatewayError(429, 'Hay demasiadas sesiones web activas en este servidor. Espera a que caduquen o cierra sesión en otro dispositivo.');
      }
      if (this.countIp(ip) >= this.config.maxSessionsPerIp) {
        throw new TelegramGatewayError(429, 'Hay demasiadas sesiones web activas desde esta conexión. Cierra una antes de crear otra.');
      }
      const token = randomBytes(32).toString('base64url');
      const tokenHash = hashSessionToken(token);
      const session = this.factory(tokenHash);
      try {
        await session.open();
      } catch (error) {
        await session.dispose().catch(() => undefined);
        throw error;
      }
      this.sessions.set(tokenHash, { session, ip });
      return { token, session };
    } finally {
      release();
    }
  }

  get(token: string | null | undefined): TdlibSession | null {
    if (!token) return null;
    const entry = this.sessions.get(hashSessionToken(token));
    if (!entry) return null;
    entry.session.lastSeen = Date.now();
    return entry.session;
  }

  async destroy(token: string | null | undefined): Promise<boolean> {
    if (!token) return false;
    const hash = hashSessionToken(token);
    const entry = this.sessions.get(hash);
    if (!entry) return false;
    this.sessions.delete(hash);
    await entry.session.dispose();
    return true;
  }

  async sweep(): Promise<void> {
    const now = Date.now();
    for (const [hash, entry] of [...this.sessions]) {
      const authenticated = entry.session.authSnapshot().step === 'ready';
      const ttl = authenticated ? this.config.sessionTtlMs : this.config.authTtlMs;
      if (now - entry.session.lastSeen <= ttl) continue;
      this.sessions.delete(hash);
      await entry.session.dispose().catch(() => undefined);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const entries = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(entries.map((entry) => entry.session.dispose()));
  }

  snapshot(): { sessions: number; ips: number } {
    return { sessions: this.sessions.size, ips: new Set([...this.sessions.values()].map((entry) => entry.ip)).size };
  }
}
