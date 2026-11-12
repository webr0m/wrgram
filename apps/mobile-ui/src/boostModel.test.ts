import { describe, expect, it } from 'vitest';
import type { BoostFeatures, BoostLevelFeatures, BoostSlot, BoostStatus } from './contract';
import {
  boostCountLabel, boostDate, boostLevelLabel, boostNumber, boostProgress, canBoostWith, giveawayLabel,
  levelFeatureRows, MINIMUM_FEATURE_LABEL, minimumFeatures, slotState, SLOT_STATE_LABEL,
} from './boostModel';

const NOW = 1_700_000_000;

const status = (over: Partial<BoostStatus> = {}): BoostStatus => ({
  level: 3, boostCount: 42, currentLevelBoostCount: 30, nextLevelBoostCount: 60,
  giftCodeBoostCount: 0, premiumMemberCount: 0, premiumMemberPercentage: 0, appliedSlotIds: [], ...over,
});

const slot = (over: Partial<BoostSlot> = {}): BoostSlot => ({
  slotId: 0, chatId: '0', startDate: NOW - 1000, expirationDate: NOW + 2_000_000,
  cooldownUntilDate: NOW - 1, inUse: false, available: true, ...over,
});

const level = (over: Partial<BoostLevelFeatures> = {}): BoostLevelFeatures => ({
  level: 1, storyPerDayCount: 0, customEmojiReactionCount: 0, titleColorCount: 0, profileAccentColorCount: 0,
  accentColorCount: 0, chatThemeBackgroundCount: 0, canSetProfileBackgroundCustomEmoji: false,
  canSetBackgroundCustomEmoji: false, canSetEmojiStatus: false, canSetCustomBackground: false,
  canSetCustomEmojiStickerSet: false, canEnableAutomaticTranslation: false, canRecognizeSpeech: false,
  canDisableSponsoredMessages: false, ...over,
});

describe('progreso de nivel de los impulsos', () => {
  it('mide entre los dos umbrales absolutos que envía Telegram', () => {
    expect(boostProgress(status())).toEqual({ percent: 40, remaining: 18, next: 60 });
    expect(boostProgress(status({ boostCount: 30 }))).toEqual({ percent: 0, remaining: 30, next: 60 });
    expect(boostProgress(status({ boostCount: 59 }))).toEqual({ percent: 97, remaining: 1, next: 60 });
  });

  it('no se pasa del 100 % ni devuelve negativos cuando el chat ya superó el umbral', () => {
    expect(boostProgress(status({ boostCount: 60 }))).toEqual({ percent: 100, remaining: 0, next: 60 });
    expect(boostProgress(status({ boostCount: 75 }))).toEqual({ percent: 100, remaining: 0, next: 60 });
    expect(boostProgress(status({ boostCount: 5 }))).toEqual({ percent: 0, remaining: 55, next: 60 });
  });

  it('trata el último nivel como techo y no como una barra infinita', () => {
    expect(boostProgress(status({ nextLevelBoostCount: 0 }))).toEqual({ percent: 100, remaining: 0, next: 0 });
    expect(boostProgress(status({ currentLevelBoostCount: 0, nextLevelBoostCount: 0, boostCount: 0 }))).toEqual({ percent: 100, remaining: 0, next: 0 });
    expect(boostProgress(status({ currentLevelBoostCount: 60, nextLevelBoostCount: 60 }))).toEqual({ percent: 100, remaining: 0, next: 0 });
    expect(boostProgress(status({ currentLevelBoostCount: -4, nextLevelBoostCount: 10, boostCount: 5 }))).toEqual({ percent: 50, remaining: 5, next: 10 });
  });
});

describe('estado de cada espacio de impulso', () => {
  it('distingue libre, en uso, descansando y vencido', () => {
    expect(slotState(slot(), NOW)).toBe('free');
    expect(slotState(slot({ inUse: true, chatId: '-1001' }), NOW)).toBe('boosting');
    expect(slotState(slot({ available: false, cooldownUntilDate: NOW + 500 }), NOW)).toBe('cooldown');
    expect(slotState(slot({ inUse: true, chatId: '-1001', expirationDate: NOW - 1 }), NOW)).toBe('expired');
    expect(slotState(slot({ inUse: true, chatId: '-1001', expirationDate: 0 }), NOW)).toBe('boosting');
  });

  it('solo deja impulsar un espacio libre', () => {
    expect(canBoostWith(slot(), NOW)).toBe(true);
    expect(canBoostWith(slot({ inUse: true, chatId: '-1001' }), NOW)).toBe(false);
    expect(canBoostWith(slot({ available: false, cooldownUntilDate: NOW + 1 }), NOW)).toBe(false);
  });

  it('etiqueta los cuatro estados sin dejar huecos', () => {
    expect(Object.keys(SLOT_STATE_LABEL).sort()).toEqual(['boosting', 'cooldown', 'expired', 'free']);
    expect(SLOT_STATE_LABEL.expired).toBe('Vencido');
  });
});

describe('números, fechas y etiquetas de impulsos', () => {
  it('agrupa en español y concuerda en singular', () => {
    expect(boostNumber(1234567)).toBe('1.234.567');
    expect(boostCountLabel(1)).toBe('1 impulso');
    expect(boostCountLabel(12)).toBe('12 impulsos');
    expect(boostLevelLabel(4)).toBe('Nivel 4');
    expect(boostLevelLabel(0)).toBe('Sin nivel de impulso');
  });

  it('no inventa una fecha cuando Telegram manda cero', () => {
    expect(boostDate(0)).toBe('Sin fecha');
    expect(boostDate(1_700_000_000)).not.toBe('Sin fecha');
  });

  it('dice qué premio da un sorteo preparado', () => {
    expect(giveawayLabel(3)).toBe('3 meses de Telegram Premium');
    expect(giveawayLabel(1)).toBe('1 mes de Telegram Premium');
    expect(giveawayLabel(0, 5000)).toBe('5000 Stars');
    expect(giveawayLabel(0, 25000)).toBe('25.000 Stars');
    expect(giveawayLabel(undefined, 1)).toBe('1 Stars');
    expect(giveawayLabel()).toBe('Premio no identificado por esta versión');
    expect(giveawayLabel(0, 0)).toBe('Premio no identificado por esta versión');
  });
});

describe('tabla de niveles que publica Telegram', () => {
  it('omite las ventajas sin nivel mínimo y ordena por nivel', () => {
    const features: BoostFeatures = {
      levels: [],
      minimum: { emojiStatus: 4, customBackground: 8, customEmojiStickerSet: 2, chatThemeBackground: 0 },
    };
    expect(minimumFeatures(features)).toEqual([
      { key: 'customEmojiStickerSet', level: 2, label: MINIMUM_FEATURE_LABEL.customEmojiStickerSet },
      { key: 'emojiStatus', level: 4, label: MINIMUM_FEATURE_LABEL.emojiStatus },
      { key: 'customBackground', level: 8, label: MINIMUM_FEATURE_LABEL.customBackground },
    ]);
  });

  it('no traduce una ventaja que esta versión todavía no conoce', () => {
    const features: BoostFeatures = { levels: [], minimum: { nuevaVentajaDeTelegram: 6 } };
    expect(minimumFeatures(features)).toEqual([{ key: 'nuevaVentajaDeTelegram', level: 6, label: 'Ventaja que esta versión no reconoce' }]);
  });

  it('cubre cada clave que serializa BoostsPolicy.features', () => {
    const keys = ['profileBackgroundCustomEmoji', 'backgroundCustomEmoji', 'emojiStatus', 'chatThemeBackground',
      'customBackground', 'customEmojiStickerSet', 'automaticTranslation', 'speechRecognition', 'sponsoredMessageDisable'];
    for (const key of keys) expect(MINIMUM_FEATURE_LABEL[key], key).toBeTruthy();
    expect(Object.keys(MINIMUM_FEATURE_LABEL).length).toBe(keys.length);
  });

  it('solo lista las ventajas activas de un nivel, con su cantidad', () => {
    expect(levelFeatureRows(level())).toEqual([]);
    expect(levelFeatureRows(level({ storyPerDayCount: 1, canSetEmojiStatus: true }))).toEqual(['1 historia diaria', 'Estado emoji del canal']);
    expect(levelFeatureRows(level({ storyPerDayCount: 3, titleColorCount: 2 }))).toEqual(['3 historias diarias', '2 colores de nombre']);
    expect(levelFeatureRows(level({ accentColorCount: 1, chatThemeBackgroundCount: 4, customEmojiReactionCount: 5 })))
      .toEqual(['5 reacciones con emoji personalizado', '1 color de acento', '4 temas de chat']);
    expect(levelFeatureRows(level({ profileAccentColorCount: 3, canRecognizeSpeech: true, canDisableSponsoredMessages: true })))
      .toEqual(['3 colores de perfil', 'Transcripción de notas de voz', 'Ocultar mensajes patrocinados']);
  });
});
