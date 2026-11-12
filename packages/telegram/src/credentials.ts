export interface TelegramAppCredentials {
  apiId: number;
  apiHash: string;
}

/** No incluye los valores recibidos en errores o diagnósticos. */
export function parseTelegramAppCredentials(apiId: unknown, apiHash: unknown): TelegramAppCredentials {
  const id = typeof apiId === 'string' && /^\d+$/.test(apiId) ? Number(apiId) : apiId;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 || id > 2_147_483_647 ||
    typeof apiHash !== 'string' || !/^[a-fA-F0-9]{32}$/.test(apiHash)) {
    throw new Error('Las credenciales de aplicación de Telegram no tienen un formato válido. Revisa el archivo .env local.');
  }
  return { apiId: id, apiHash };
}
