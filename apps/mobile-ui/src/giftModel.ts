import type { CanSendGiftResult, CatalogGift, GiftUpgradePreview, GiftUpgradePrice, GiftView, ReceivedGiftItem } from './contract';
import { starCount, starDate } from './starsModel';

export const GIFT_VIEWS: [GiftView, string][] = [
  ['all', 'Todos'],
  ['saved', 'Guardados'],
  ['unsaved', 'Sin guardar'],
  ['upgradable', 'Mejorables'],
  ['upgraded', 'Únicos'],
  ['colors', 'Con color'],
];

const RARITY_LABEL: Record<string, string> = { common: 'Común', uncommon: 'Poco común', rare: 'Raro', epic: 'Épico', legendary: 'Legendario' };
export const rarityLabel = (rarity: string) => RARITY_LABEL[rarity] || 'Raresta que esta versión no reconoce';

/** TDLib da la probabilidad en milésimas, así que se muestra como porcentaje para poder compararla. */
export const perMilleLabel = (perMille: number) => perMille > 0 ? `${(perMille / 10).toLocaleString('es', { maximumFractionDigits: 2 })} % de los regalos` : 'Frecuencia no publicada por Telegram';

export const giftPrice = (value: number) => `${starCount(value)} Stars`;

/** SendGift cobra starCount y, si pagas tú la mejora, también upgradeStarCount. */
export const sendCost = (gift: CatalogGift, upgrade: boolean) => gift.starCount + (upgrade ? gift.upgradeStarCount : 0);

/** nextSendDate solo se usa como límite: Telegram no lo publica para todos los regalos. */
export const sendBlockedReason = (gift: CatalogGift, canSend?: CanSendGiftResult, now = Math.floor(Date.now() / 1000)): string => {
  if (canSend && !canSend.allowed) return canSend.reason || 'Telegram no permite enviar este regalo ahora.';
  if (gift.nextSendDate > now) return `Podrás enviarlo de nuevo el ${starDate(gift.nextSendDate)}.`;
  return '';
};

/** Telegram publica prices de máximo a mínimo; el coste real hoy es el más bajo que aún no ha vencido. */
export function currentUpgradePrice(preview?: GiftUpgradePreview, now = Math.floor(Date.now() / 1000)): GiftUpgradePrice | undefined {
  const live = (preview?.prices || []).filter(price => price.date > now);
  if (!live.length) return preview?.prices?.length ? preview.prices[preview.prices.length - 1] : undefined;
  return live.reduce((best, price) => (price.starCount < best.starCount ? price : best), live[0]);
}

export function upcomingUpgradePrices(preview?: GiftUpgradePreview, now = Math.floor(Date.now() / 1000)): GiftUpgradePrice[] {
  return (preview?.nextPrices || []).filter(price => price.date > now).sort((a, b) => a.starCount - b.starCount || a.date - b.date);
}

export function mergeReceived(current: ReceivedGiftItem[], incoming: ReceivedGiftItem[]): ReceivedGiftItem[] {
  if (!current.length) return incoming;
  const seen = new Set(current.map(item => item.id).filter(Boolean));
  return [...current, ...incoming.filter(item => !item.id || !seen.has(item.id))];
}

export const MAX_PINNED = 64;
export const pinnedIds = (gifts: ReceivedGiftItem[]) => gifts.filter(item => item.pinned).map(item => item.id);

/** SetPinnedGifts sustituye la lista entera, así que fijar uno exige reenviar los ya fijados. */
export function togglePin(ids: string[], id: string): string[] | undefined {
  if (ids.includes(id)) return ids.filter(item => item !== id);
  if (ids.length >= MAX_PINNED) return undefined;
  return [...ids, id];
}

export const uniqueNumber = (item: ReceivedGiftItem) => item.unique ? `#${item.unique.number}` : item.number > 0 ? `#${item.number}` : '';

export function giftSubtitle(item: ReceivedGiftItem): string {
  const parts = [item.unique?.title, item.kind === 'upgraded' ? rarityLabel(item.unique?.backdrop?.rarity || '') : ''];
  if (item.text) parts.push(`«${item.text}»`);
  if (item.sender) parts.push(`de ${item.sender}`);
  return parts.filter(Boolean).join(' · ');
}
