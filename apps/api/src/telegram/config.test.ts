import { describe, expect, it } from 'vitest';
import { readTelegramWebConfig } from './config';

const base = {
  WRGRAM_TELEGRAM_WEB: '1',
  TELEGRAM_API_ID: '123456',
  TELEGRAM_API_HASH: 'a'.repeat(32),
};

describe('configuración del cliente web TDLib', () => {
  it('permanece desactivado sin la bandera explícita', () => {
    const result = readTelegramWebConfig({ ...base, WRGRAM_TELEGRAM_WEB: '0' });
    expect(result.config).toBeNull();
    expect(result.reason).toContain('desactivado');
  });

  it('no arranca con credenciales de aplicación inválidas', () => {
    expect(readTelegramWebConfig({ ...base, TELEGRAM_API_HASH: 'no-es-un-hash' }).config).toBeNull();
    expect(readTelegramWebConfig({ ...base, TELEGRAM_API_ID: '0' }).config).toBeNull();
  });

  it('aplica valores seguros y límites', () => {
    const result = readTelegramWebConfig({
      ...base,
      WRGRAM_TELEGRAM_DATA_DIR: '/tmp/wrgram-test',
      WRGRAM_TELEGRAM_SECURE_COOKIES: '1',
      WRGRAM_TELEGRAM_SESSION_TTL_MINUTES: '60',
      WRGRAM_TELEGRAM_MAX_SESSIONS: '4',
      WRGRAM_TELEGRAM_MAX_SESSIONS_PER_IP: '2',
      WRGRAM_WEB_ORIGIN: 'https://wrgram.webrom.cc',
    });
    expect(result.config).toMatchObject({
      apiId: 123456,
      dataDir: '/tmp/wrgram-test',
      secureCookies: true,
      sessionTtlMs: 60 * 60_000,
      maxSessions: 4,
      maxSessionsPerIp: 2,
      webOrigin: 'https://wrgram.webrom.cc',
    });
  });

  it('ignora orígenes mal formados', () => {
    const result = readTelegramWebConfig({ ...base, WRGRAM_WEB_ORIGIN: 'no es una url' });
    expect(result.config?.webOrigin).toBeUndefined();
  });
});
