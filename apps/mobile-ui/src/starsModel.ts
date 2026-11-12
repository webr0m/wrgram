import type { StarAmount, StarSubscription, StarTransaction } from './contract';

export const starCount = (value: number) => value.toLocaleString('es');
export const starDate = (seconds: number) => seconds > 0 ? new Date(seconds * 1000).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' }) : 'Sin fecha';

export const starPeriod = (seconds: number) => {
  if (!(seconds > 0)) return 'el periodo indicado por Telegram';
  if (seconds % 86400 === 0) { const days = seconds / 86400; return days === 1 ? '1 día' : `${days} días`; }
  if (seconds % 3600 === 0) { const hours = seconds / 3600; return hours === 1 ? '1 hora' : `${hours} horas`; }
  if (seconds % 60 === 0) { const minutes = seconds / 60; return minutes === 1 ? '1 minuto' : `${minutes} minutos`; }
  return `${seconds} segundos`;
};

export const starAmountText = (amount: StarAmount | null) => amount ? starCount(amount.starCount) : 'Sin datos';

/** TDLib entrega los importes en la unidad mínima de la moneda (céntimos), no en euros. */
export function money(amount: number, currency: string): string {
  if (!currency) return amount.toLocaleString('es');
  try {
    const digits = new Intl.NumberFormat('es', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    return (amount / 10 ** digits).toLocaleString('es', { style: 'currency', currency });
  } catch {
    return `${(amount / 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  }
}

export const revenueUsd = (amount: StarAmount | null, usdRate: number) => amount && usdRate > 0
  ? (amount.starCount * usdRate).toLocaleString('es', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
  : '';

export const transactionAmount = (item: StarTransaction) => `${item.starCount > 0 ? '+' : ''}${starCount(item.starCount)}`;

export type SubscriptionAction = 'cancel' | 'resume' | 'reuse' | 'renew';

/** TDLib: canReuse solo es true con la suscripción activa; inviteLink renueva una ya vencida. */
export function subscriptionActions(item: StarSubscription, now = Math.floor(Date.now() / 1000)): SubscriptionAction[] {
  const expired = item.expirationDate > 0 && item.expirationDate <= now;
  const actions: SubscriptionAction[] = [];
  if (!expired) actions.push(item.canceled ? 'resume' : 'cancel');
  if (item.kind === 'channel' && item.canReuse) actions.push('reuse');
  if (expired && item.kind === 'channel' && item.inviteLink) actions.push('renew');
  return actions;
}

export function mergeTransactions(current: StarTransaction[], incoming: StarTransaction[]): StarTransaction[] {
  if (!current.length) return incoming;
  const seen = new Set(current.map(item => item.id).filter(Boolean));
  return [...current, ...incoming.filter(item => !item.id || !seen.has(item.id))];
}