import { describe, expect, it } from 'vitest';
import type { StarSubscription, StarTransaction } from './contract';
import { mergeTransactions, money, revenueUsd, starAmountText, starCount, starDate, starPeriod, subscriptionActions, transactionAmount } from './starsModel';

const transaction = (over: Partial<StarTransaction> = {}): StarTransaction => ({
  id: 't1', date: 1700000000, refund: false, starCount: 250, nanostarCount: 0,
  kind: 'userDeposit', label: 'Recarga de Stars', ...over,
});
const subscription = (over: Partial<StarSubscription> = {}): StarSubscription => ({
  id: 's1', chatId: '-100123', title: 'Canal', expirationDate: 0, canceled: false, expiring: false,
  period: 2592000, starCount: 300, kind: 'channel', ...over,
});

describe('importes y fechas de Stars', () => {
  it('agrupa miles en español y no inventa decimales para el saldo', () => {
    expect(starCount(0)).toBe('0');
    expect(starCount(12345)).toBe('12.345');
    expect(starCount(1000000)).toBe('1.000.000');
    expect(starAmountText({ starCount: 1500, nanostarCount: 0 })).toBe('1500');
    expect(starAmountText(null)).toBe('Sin datos');
  });

  it('marca las salidas con su signo y las entradas con un más explícito', () => {
    expect(transactionAmount(transaction({ starCount: -250 }))).toBe('-250');
    expect(transactionAmount(transaction({ starCount: 250 }))).toBe('+250');
    expect(transactionAmount(transaction({ starCount: 0 }))).toBe('0');
    expect(transactionAmount(transaction({ starCount: -12345 }))).toBe('-12.345');
  });

  it('traduce el precio a dólares solo cuando Telegram da una tasa', () => {
    expect(revenueUsd({ starCount: 900, nanostarCount: 0 }, 0.013)).toMatch(/^11,70\sUS\$$/);
    expect(revenueUsd({ starCount: 900, nanostarCount: 0 }, 0)).toBe('');
    expect(revenueUsd(null, 0.013)).toBe('');
  });

  it('no muestra una fecha falsa para movimientos sin fecha', () => {
    expect(starDate(0)).toBe('Sin fecha');
    expect(starDate(-1)).toBe('Sin fecha');
    expect(starDate(1700000000)).toContain('2023');
  });
});

describe('precios en la unidad mínima de la moneda', () => {
  it('divide por el exponente ISO 4217 antes de formatear', () => {
    expect(money(199, 'EUR')).toMatch(/^1,99\s€$/);
    expect(money(199, 'USD')).toMatch(/^1,99\sUS\$$/);
    expect(money(0, 'EUR')).toMatch(/^0,00\s€$/);
    expect(money(129900, 'CLP')).toMatch(/^129\.900\sCLP$/);
    expect(money(500, 'JPY')).toMatch(/^500\s/);
  });

  it('no inventa una moneda cuando Telegram no la informa', () => {
    expect(money(1234, '')).toBe('1234');
    expect(money(12345, '')).toBe('12.345');
  });

  it('conserva el código recibido si Intl no reconoce la moneda', () => {
    expect(money(199, 'EURO')).toBe('1,99 EURO');
  });
});

describe('periodos de suscripción', () => {
  it('prefiere la unidad más grande exacta y no divide en unidades absurdas', () => {
    expect(starPeriod(86400)).toBe('1 día');
    expect(starPeriod(2592000)).toBe('30 días');
    expect(starPeriod(3600)).toBe('1 hora');
    expect(starPeriod(18000)).toBe('5 horas');
    expect(starPeriod(60)).toBe('1 minuto');
    expect(starPeriod(90)).toBe('90 segundos');
    expect(starPeriod(3660)).toBe('61 minutos');
  });

  it('admite no conocer el periodo en vez de afirmar uno inventado', () => {
    expect(starPeriod(0)).toBe('el periodo indicado por Telegram');
    expect(starPeriod(-1)).toBe('el periodo indicado por Telegram');
  });
});

describe('acciones disponibles sobre una suscripción', () => {
  const now = 1800000000;

  it('ofrece cancelar o reanudar según la renovación, nunca las dos', () => {
    expect(subscriptionActions(subscription({ expirationDate: now + 86400 }), now)).toEqual(['cancel']);
    expect(subscriptionActions(subscription({ expirationDate: now + 86400, canceled: true }), now)).toEqual(['resume']);
  });

  it('no ofrece cancelar una suscripción ya vencida', () => {
    expect(subscriptionActions(subscription({ expirationDate: now - 1 }), now)).toEqual([]);
  });

  it('permite volver a unirse sin cargo solo mientras TDLib marca canReuse', () => {
    expect(subscriptionActions(subscription({ expirationDate: now + 86400, canReuse: true }), now)).toEqual(['cancel', 'reuse']);
    expect(subscriptionActions(subscription({ expirationDate: now + 86400, canReuse: false }), now)).toEqual(['cancel']);
    expect(subscriptionActions(subscription({ expirationDate: now + 86400, canReuse: true, kind: 'bot' }), now)).toEqual(['cancel']);
  });

  it('renueva una vencida por su enlace de invitación y no antes', () => {
    const expired = subscription({ expirationDate: now - 1, inviteLink: 'https://t.me/+abc' });
    expect(subscriptionActions(expired, now)).toEqual(['renew']);
    expect(subscriptionActions(subscription({ expirationDate: now + 86400, inviteLink: 'https://t.me/+abc' }), now)).toEqual(['cancel']);
    expect(subscriptionActions(subscription({ expirationDate: now - 1 }), now)).toEqual([]);
    expect(subscriptionActions(subscription({ expirationDate: now - 1, inviteLink: 'https://t.me/+abc', kind: 'bot' }), now)).toEqual([]);
  });

  it('trata la fecha cero como desconocida, no como vencida en 1970', () => {
    expect(subscriptionActions(subscription({ expirationDate: 0 }), now)).toEqual(['cancel']);
  });
});

describe('paginación del historial', () => {
  it('devuelve la primera página tal cual y concatena las siguientes', () => {
    const page = [transaction({ id: 'a' }), transaction({ id: 'b' })];
    expect(mergeTransactions([], page)).toBe(page);
    expect(mergeTransactions(page, [transaction({ id: 'c' })])).toEqual([...page, transaction({ id: 'c' })]);
  });

  it('descarta los solapados y conserva los movimientos sin identificador', () => {
    const current = [transaction({ id: 'a' }), transaction({ id: '' })];
    const incoming = [transaction({ id: 'a', label: 'Solapado' }), transaction({ id: '' }), transaction({ id: 'b' })];
    const merged = mergeTransactions(current, incoming);
    expect(merged.map(item => item.id)).toEqual(['a', '', '', 'b']);
    expect(merged[0].label).toBe('Recarga de Stars');
  });

  it('no pierde movimientos al paginar en vacío', () => {
    const current = [transaction()];
    expect(mergeTransactions(current, [])).toEqual(current);
  });
});