import type { BoostFeatures, BoostLevelFeatures, BoostSlot, BoostStatus } from './contract';

export const boostNumber = (value: number) => value.toLocaleString('es');

export const boostDate = (seconds: number) => seconds > 0 ? new Date(seconds * 1000).toLocaleDateString('es', { dateStyle: 'medium' }) : 'Sin fecha';

export const boostLevelLabel = (level: number) => level > 0 ? `Nivel ${level}` : 'Sin nivel de impulso';

export const boostCountLabel = (count: number) => `${boostNumber(count)} ${count === 1 ? 'impulso' : 'impulsos'}`;

export type BoostProgress = { percent: number; remaining: number; next: number };

/**
 * TDLib informa currentLevelBoostCount y nextLevelBoostCount como umbrales absolutos de impulsos,
 * así que el progreso de un nivel se mide en la franja entre ambos, no sobre el total.
 */
export function boostProgress(status: BoostStatus): BoostProgress {
  const next = status.nextLevelBoostCount;
  const from = Math.max(0, status.currentLevelBoostCount);
  if (!(next > from)) return { percent: 100, remaining: 0, next: 0 };
  const done = Math.min(Math.max(status.boostCount - from, 0), next - from);
  return { percent: Math.round((done * 100) / (next - from)), remaining: Math.max(next - status.boostCount, 0), next };
}

export type SlotState = 'free' | 'boosting' | 'cooldown' | 'expired';
export const SLOT_STATE_LABEL: Record<SlotState, string> = { free: 'Libre', boosting: 'Impulsando', cooldown: 'En descanso', expired: 'Vencido' };

export function slotState(slot: BoostSlot, now = Math.floor(Date.now() / 1000)): SlotState {
  if (slot.inUse) return slot.expirationDate > 0 && slot.expirationDate <= now ? 'expired' : 'boosting';
  return slot.available ? 'free' : 'cooldown';
}

export const canBoostWith = (slot: BoostSlot, now = Math.floor(Date.now() / 1000)) => slotState(slot, now) === 'free';

export const MINIMUM_FEATURE_LABEL: Record<string, string> = {
  profileBackgroundCustomEmoji: 'Emoji personalizado en el fondo del perfil',
  backgroundCustomEmoji: 'Emoji personalizado en el fondo del chat',
  emojiStatus: 'Estado emoji del canal',
  chatThemeBackground: 'Temas y fondos de chat',
  customBackground: 'Fondo personalizado del chat',
  customEmojiStickerSet: 'Colección de stickers con emoji personalizado',
  automaticTranslation: 'Traducción automática',
  speechRecognition: 'Transcripción de notas de voz',
  sponsoredMessageDisable: 'Ocultar mensajes patrocinados',
};

export type MinimumFeature = { key: string; label: string; level: number };

export function minimumFeatures(value: BoostFeatures): MinimumFeature[] {
  return Object.entries(value.minimum)
    .filter(([, level]) => level > 0)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([key, level]) => ({ key, level, label: MINIMUM_FEATURE_LABEL[key] || 'Ventaja que esta versión no reconoce' }));
}

export function levelFeatureRows(level: BoostLevelFeatures): string[] {
  const rows: string[] = [];
  if (level.storyPerDayCount > 0) rows.push(`${boostNumber(level.storyPerDayCount)} ${level.storyPerDayCount === 1 ? 'historia diaria' : 'historias diarias'}`);
  if (level.customEmojiReactionCount > 0) rows.push(`${boostNumber(level.customEmojiReactionCount)} reacciones con emoji personalizado`);
  if (level.titleColorCount > 0) rows.push(`${boostNumber(level.titleColorCount)} ${level.titleColorCount === 1 ? 'color de nombre' : 'colores de nombre'}`);
  if (level.accentColorCount > 0) rows.push(`${boostNumber(level.accentColorCount)} ${level.accentColorCount === 1 ? 'color de acento' : 'colores de acento'}`);
  if (level.profileAccentColorCount > 0) rows.push(`${boostNumber(level.profileAccentColorCount)} colores de perfil`);
  if (level.chatThemeBackgroundCount > 0) rows.push(`${boostNumber(level.chatThemeBackgroundCount)} ${level.chatThemeBackgroundCount === 1 ? 'tema de chat' : 'temas de chat'}`);
  if (level.canSetProfileBackgroundCustomEmoji) rows.push('Emoji personalizado en el fondo del perfil');
  if (level.canSetBackgroundCustomEmoji) rows.push('Emoji personalizado en el fondo del chat');
  if (level.canSetEmojiStatus) rows.push('Estado emoji del canal');
  if (level.canSetCustomBackground) rows.push('Fondo personalizado del chat');
  if (level.canSetCustomEmojiStickerSet) rows.push('Colección de stickers con emoji personalizado');
  if (level.canEnableAutomaticTranslation) rows.push('Traducción automática');
  if (level.canRecognizeSpeech) rows.push('Transcripción de notas de voz');
  if (level.canDisableSponsoredMessages) rows.push('Ocultar mensajes patrocinados');
  return rows;
}

export function giveawayLabel(monthCount?: number, starCount?: number): string {
  if (monthCount && monthCount > 0) return `${monthCount} ${monthCount === 1 ? 'mes de Telegram Premium' : 'meses de Telegram Premium'}`;
  if (starCount && starCount > 0) return `${boostNumber(starCount)} Stars`;
  return 'Premio no identificado por esta versión';
}
