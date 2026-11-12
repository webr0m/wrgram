import { fileURLToPath } from 'node:url';

export const TELEGRAM_SESSION_COOKIE = 'wrgram_tg';

export interface TelegramWebConfig {
  apiId: number;
  apiHash: string;
  dataDir: string;
  webOrigin?: string;
  secureCookies: boolean;
  sessionTtlMs: number;
  authTtlMs: number;
  maxSessions: number;
  maxSessionsPerIp: number;
}

export interface TelegramWebConfigResult {
  config: TelegramWebConfig | null;
  reason?: string;
}

const DEFAULT_DATA_DIR = fileURLToPath(new URL('../../.tdlib', import.meta.url));
const DEFAULT_SESSION_TTL_MINUTES = 24 * 60;
const DEFAULT_AUTH_TTL_MINUTES = 15;

function enabled(value: string | undefined): boolean {
  return value === '1' || value?.toLocaleLowerCase('en') === 'true';
}

function positiveInteger(value: string | undefined, fallback: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback;
}

function optionalOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.origin === value.replace(/\/$/, '') ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * El modo web TDLib solo se activa explícitamente. Sin la bandera, la API no
 * importa TDLib, no acepta teléfonos y no crea bases de datos de sesión.
 */
export function readTelegramWebConfig(env: NodeJS.ProcessEnv = process.env): TelegramWebConfigResult {
  if (!enabled(env.WRGRAM_TELEGRAM_WEB)) {
    return { config: null, reason: 'El cliente web TDLib está desactivado en este servidor.' };
  }

  const apiId = Number(env.TELEGRAM_API_ID);
  const apiHash = (env.TELEGRAM_API_HASH ?? '').trim();
  if (!Number.isSafeInteger(apiId) || apiId <= 0 || !/^[a-f0-9]{32}$/i.test(apiHash)) {
    return {
      config: null,
      reason: 'Faltan TELEGRAM_API_ID y TELEGRAM_API_HASH válidos en el servidor. El cliente web no se abrirá.',
    };
  }

  return {
    config: {
      apiId,
      apiHash,
      dataDir: env.WRGRAM_TELEGRAM_DATA_DIR?.trim() || DEFAULT_DATA_DIR,
      webOrigin: optionalOrigin(env.WRGRAM_WEB_ORIGIN),
      secureCookies: env.WRGRAM_TELEGRAM_SECURE_COOKIES
        ? enabled(env.WRGRAM_TELEGRAM_SECURE_COOKIES)
        : env.NODE_ENV === 'production',
      sessionTtlMs: positiveInteger(env.WRGRAM_TELEGRAM_SESSION_TTL_MINUTES, DEFAULT_SESSION_TTL_MINUTES, 7 * 24 * 60) * 60_000,
      authTtlMs: positiveInteger(env.WRGRAM_TELEGRAM_AUTH_TTL_MINUTES, DEFAULT_AUTH_TTL_MINUTES, 120) * 60_000,
      maxSessions: positiveInteger(env.WRGRAM_TELEGRAM_MAX_SESSIONS, 20, 500),
      maxSessionsPerIp: positiveInteger(env.WRGRAM_TELEGRAM_MAX_SESSIONS_PER_IP, 3, 20),
    },
  };
}
