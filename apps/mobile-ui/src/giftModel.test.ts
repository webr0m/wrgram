import { describe, expect, it } from 'vitest';
import type { CatalogGift, CanSendGiftResult, GiftUpgradePreview, ReceivedGiftItem } from './contract';
import {
  currentUpgradePrice, giftPrice, giftSubtitle, GIFT_VIEWS, MAX_PINNED, mergeReceived, perMilleLabel,
  pinnedIds, rarityLabel, sendBlockedReason, sendCost, togglePin, uniqueNumber, upcomingUpgradePrices,
} from './giftModel';

const NOW = 1_700_000_000;

const catalogGift = (over: Partial<CatalogGift> = {}): CatalogGift => ({
  id: '9007199254740993', starCount: 50, defaultSellStarCount: 30, upgradeStarCount: 25, upgradeVariantCount: 6,
  hasColors: true, isPremium: false, isForBirthday: false, nextSendDate: 0, publisherChatId: '-1001234',
  resaleCount: 0, minResaleStarCount: 0, upgradedTitle: 'Oso', ...over,
});

const received = (over: Partial<ReceivedGiftItem> = {}): ReceivedGiftItem => ({
  id: 'aB3_-xyz', date: NOW, private: false, saved: false, pinned: false, canUpgrade: false, canTransfer: false,
  canDelete: true, refunded: false, number: 0, sellStarCount: 0, prepaidUpgradeStarCount: 0, upgradeSeparate: false,
  transferStarCount: 0, dropOriginalDetailsStarCount: 0, nextTransferDate: 0, nextResaleDate: 0, exportDate: 0,
  collections: [], kind: 'regular', ...over,
});

const preview = (over: Partial<GiftUpgradePreview> = {}): GiftUpgradePreview => ({
  models: [], symbols: [], backdrops: [], prices: [], nextPrices: [], ...over,
});

describe('lista de filtros de regalos', () => {
  it('ofrece exactamente los seis filtros que TDLib puede responder', () => {
    expect(GIFT_VIEWS.map(([key]) => key)).toEqual(['all', 'saved', 'unsaved', 'upgradable', 'upgraded', 'colors']);
    expect(GIFT_VIEWS.map(([, label]) => label)).toEqual(['Todos', 'Guardados', 'Sin guardar', 'Mejorables', 'Únicos', 'Con color']);
  });
});

describe('etiquetas de rareza y frecuencia', () => {
  it('traduce las rarezas que conoce y avisa de las que no', () => {
    expect(rarityLabel('common')).toBe('Común');
    expect(rarityLabel('uncommon')).toBe('Poco común');
    expect(rarityLabel('rare')).toBe('Raro');
    expect(rarityLabel('epic')).toBe('Épico');
    expect(rarityLabel('legendary')).toBe('Legendario');
    expect(rarityLabel('mythic')).toBe('Raresta que esta versión no reconoce');
    expect(rarityLabel('')).toBe('Raresta que esta versión no reconoce');
  });

  it('pasa las milésimas de TDLib a un porcentaje comparable', () => {
    expect(perMilleLabel(25)).toBe('2,5 % de los regalos');
    expect(perMilleLabel(1000)).toBe('100 % de los regalos');
    expect(perMilleLabel(3)).toBe('0,3 % de los regalos');
    expect(perMilleLabel(0)).toBe('Frecuencia no publicada por Telegram');
    expect(perMilleLabel(-10)).toBe('Frecuencia no publicada por Telegram');
  });

  it('agrupa los precios con los separadores de miles españoles', () => {
    expect(giftPrice(0)).toBe('0 Stars');
    expect(giftPrice(12345)).toBe('12.345 Stars');
  });
});

describe('coste y bloqueo del envío de un regalo', () => {
  it('suma la mejora solo cuando la pagas tú', () => {
    expect(sendCost(catalogGift(), false)).toBe(50);
    expect(sendCost(catalogGift(), true)).toBe(75);
    expect(sendCost(catalogGift({ upgradeStarCount: 0 }), true)).toBe(50);
  });

  it('antepone el motivo real de Telegram al límite de fecha', () => {
    const blocked: CanSendGiftResult = { allowed: false, reason: 'Esta cuenta ya ha enviado el máximo diario.' };
    expect(sendBlockedReason(catalogGift({ nextSendDate: NOW + 99_999 }), blocked, NOW)).toBe('Esta cuenta ya ha enviado el máximo diario.');
    expect(sendBlockedReason(catalogGift(), { allowed: false, reason: '' }, NOW)).toBe('Telegram no permite enviar este regalo ahora.');
  });

  it('usa nextSendDate como límite y no como verdad absoluta', () => {
    expect(sendBlockedReason(catalogGift({ nextSendDate: NOW + 3600 }), undefined, NOW)).toContain('Podrás enviarlo de nuevo el ');
    expect(sendBlockedReason(catalogGift({ nextSendDate: NOW - 10 }), undefined, NOW)).toBe('');
    expect(sendBlockedReason(catalogGift({ nextSendDate: 0 }), undefined, NOW)).toBe('');
    expect(sendBlockedReason(catalogGift(), { allowed: true, reason: '' }, NOW)).toBe('');
  });
});

describe('escalera de precios de la mejora', () => {
  it('toma el precio vigente más bajo cuando Telegram publica varios', () => {
    const value = preview({ prices: [{ date: NOW + 86_400, starCount: 90 }, { date: NOW + 172_800, starCount: 40 }, { date: NOW + 3_600, starCount: 70 }] });
    expect(currentUpgradePrice(value, NOW)?.starCount).toBe(40);
  });

  it('ignora los tramos ya vencidos pero conserva el último cuando todos caducaron', () => {
    expect(currentUpgradePrice(preview({ prices: [{ date: NOW - 100, starCount: 90 }, { date: NOW - 50, starCount: 40 }] }), NOW)?.starCount).toBe(40);
    expect(currentUpgradePrice(preview({ prices: [{ date: NOW - 1, starCount: 90 }, { date: NOW + 10, starCount: 40 }] }), NOW)?.starCount).toBe(40);
    expect(currentUpgradePrice(preview(), NOW)).toBeUndefined();
    expect(currentUpgradePrice(undefined, NOW)).toBeUndefined();
  });

  it('ordena los precios futuros por coste y luego por fecha', () => {
    const value = preview({
      nextPrices: [
        { date: NOW + 900, starCount: 60 },
        { date: NOW + 100, starCount: 25 },
        { date: NOW + 50, starCount: 25 },
        { date: NOW - 10, starCount: 5 },
      ],
    });
    expect(upcomingUpgradePrices(value, NOW)).toEqual([
      { date: NOW + 50, starCount: 25 },
      { date: NOW + 100, starCount: 25 },
      { date: NOW + 900, starCount: 60 },
    ]);
    expect(upcomingUpgradePrices(undefined, NOW)).toEqual([]);
  });
});

describe('unión de páginas de regalos recibidos', () => {
  it('no repite un regalo cuando Telegram devuelve el mismo identificador', () => {
    expect(mergeReceived([], [received({ id: 'a' }), received({ id: 'b' })]).map(item => item.id)).toEqual(['a', 'b']);
    expect(mergeReceived([received({ id: 'a' })], [received({ id: 'a' }), received({ id: 'c' })]).map(item => item.id)).toEqual(['a', 'c']);
  });

  it('conserva los regalos sin identificador en vez de descartarlos', () => {
    const merged = mergeReceived([received({ id: '' })], [received({ id: '' }), received({ id: 'x' })]);
    expect(merged).toHaveLength(3);
  });
});

describe('regalos fijados en el perfil', () => {
  it('lee los fijados en el orden que devolvió Telegram', () => {
    expect(pinnedIds([received({ id: 'a', pinned: true }), received({ id: 'b' }), received({ id: 'c', pinned: true })])).toEqual(['a', 'c']);
    expect(pinnedIds([])).toEqual([]);
  });

  it('reenvía la lista entera porque SetPinnedGifts sustituye', () => {
    expect(togglePin(['a', 'b'], 'c')).toEqual(['a', 'b', 'c']);
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
    expect(togglePin([], 'a')).toEqual(['a']);
  });

  it('avisa antes de superar el máximo de Telegram en lugar de perder los fijados', () => {
    const full = Array.from({ length: MAX_PINNED }, (_, index) => `gift${index}`);
    expect(togglePin(full, 'otro')).toBeUndefined();
    expect(togglePin(full, 'gift0')).toHaveLength(MAX_PINNED - 1);
  });
});

describe('número de serie y subtítulo de un regalo', () => {
  const unique = {
    title: 'Oso único', name: 'OsO', number: 3, totalUpgradedCount: 250, maxUpgradedCount: 1000,
    isPremium: true, isCrafted: false, isBurned: false, publisherChatId: '-10099',
  };

  it('prioriza el número del regalo único y calla cuando Telegram no lo da', () => {
    expect(uniqueNumber(received({ unique: { ...unique, number: 7 } }))).toBe('#7');
    expect(uniqueNumber(received({ number: 12 }))).toBe('#12');
    expect(uniqueNumber(received())).toBe('');
  });

  it('une fondo, mensaje y remitente sin soltar separadores sueltos', () => {
    expect(giftSubtitle(received({ kind: 'upgraded', unique: { ...unique, backdrop: { id: 4, name: 'Dorado', rarity: 'legendary', perMille: 0 } }, text: 'ánimo', sender: 'Ana' })))
      .toBe('Oso único · Legendario · «ánimo» · de Ana');
    expect(giftSubtitle(received({ text: 'ánimo' }))).toBe('«ánimo»');
    expect(giftSubtitle(received({ sender: 'Ana' }))).toBe('de Ana');
    expect(giftSubtitle(received())).toBe('');
  });

  it('etiqueta la rareza desconocida en vez de inventarla', () => {
    expect(giftSubtitle(received({ kind: 'upgraded', unique: { ...unique, backdrop: { id: 9, name: 'Raro', rarity: 'mythic', perMille: 0 } } })))
      .toBe('Oso único · Raresta que esta versión no reconoce');
  });
});
