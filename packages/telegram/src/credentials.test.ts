import { describe, expect, it } from 'vitest';
import { parseTelegramAppCredentials } from './credentials';

describe('credenciales de aplicación de Telegram', () => {
  it('valida el formato sin conectar a Telegram', () => {
    expect(parseTelegramAppCredentials('123456', 'a'.repeat(32))).toEqual({ apiId: 123456, apiHash: 'a'.repeat(32) });
  });
  it('rechaza entradas inválidas sin mostrarlas en el error', () => {
    for (const id of [0, -1, '123abc', Number.MAX_SAFE_INTEGER]) {
      expect(() => parseTelegramAppCredentials(id, 'a'.repeat(32))).toThrow('no tienen un formato válido');
    }
    expect(() => parseTelegramAppCredentials(123, 'secret-value')).toThrow('no tienen un formato válido');
    try { parseTelegramAppCredentials(123, 'secret-value'); } catch (error) {
      expect(String(error)).not.toContain('secret-value');
    }
  });
});
