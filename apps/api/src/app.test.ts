import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app';

describe('API propia de WRGram', () => {
  const app = buildApp({ logger: false, telegram: false });
  afterEach(async () => { await app.close(); });
  it('expone salud y catálogo, sin recibir sesiones de Telegram', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.json().service).toBe('wrgram-api');
    const catalog = await app.inject({ method: 'GET', url: '/v1/plugins' });
    expect(catalog.json().plugins).toHaveLength(3);
    expect((await app.inject({ method: 'POST', url: '/sessions', payload: {} })).statusCode).toBe(404);
    const telegram = await app.inject({ method: 'GET', url: '/v1/telegram/status' });
    expect(telegram.json()).toMatchObject({ enabled: false });
  });
});
