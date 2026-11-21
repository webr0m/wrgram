import type { ChatStatCard } from './contract';

/**
 * Lo que la pantalla sabe decir de las estadísticas de una comunidad (ronda CA).
 *
 * Las dos capas nativas llaman de otra manera al mismo número: TDLib lo llama `viewerCount`, MTProto `viewers`, y
 * cada una lo envuelve en su propio objeto. Para no depender de que las dos coincidan a ojo, el puente manda la ficha
 * con un `id` del catálogo de abajo y la etiqueta en español vive **solo aquí**. Así, si una capa traduce mal un
 * número, la otra lo dice igual de mal o de bien: la pantalla no puede inventar una tercera versión.
 *
 * Segunda regla: una ficha cuyo `id` no está en el catálogo se descarta. Es la parte visible de «lo que Telegram no
 * contesta no se afirma» —un número sin nombre conocido es un número que nadie sabe qué significa, y ponerle una
 * etiqueta adivinada sería peor que no enseñarlo—.
 */
export const STATS_LABELS: Record<string, string> = {
  members: 'Miembros',
  messages: 'Mensajes enviados',
  viewers: 'Leyeron los mensajes',
  senders: 'Escribieron en el grupo',
  viewsPerPost: 'Visitas por publicación',
  sharesPerPost: 'Veces compartida por publicación',
  reactionsPerPost: 'Reacciones por publicación',
  viewsPerStory: 'Visitas por historia',
  sharesPerStory: 'Veces compartida por historia',
  reactionsPerStory: 'Reacciones por historia',
  notifications: 'Con las notificaciones activadas',
};

/** Las fichas que Telegram contesta para un canal: las ocho, y ninguna de grupo. */
export const CHANNEL_STAT_IDS = ['members', 'viewsPerPost', 'sharesPerPost', 'reactionsPerPost', 'viewsPerStory', 'sharesPerStory', 'reactionsPerStory', 'notifications'];

/** Las cuatro de un supergrupo, más la tabla de los que más escriben. */
export const GROUP_STAT_IDS = ['members', 'messages', 'viewers', 'senders'];

/** Las dos frases que el puente de Android y el de Windows reparten carácter a carácter. */
export const STATS_REFUSALS = {
  notCommunity: 'Las estadísticas solo existen en supergrupos y canales.',
  noRight: 'Telegram no concede a esta cuenta el permiso para ver las estadísticas de la comunidad.',
};

const whole = new Intl.NumberFormat('es', { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat('es', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Porcentaje aparte: es la única ficha que no es una cuenta. */
export function isPercent(card: ChatStatCard) {
  return card.id === 'notifications';
}

export function statValue(card: ChatStatCard) {
  return isPercent(card) ? `${oneDecimal.format(card.value)} %` : whole.format(card.value);
}

/**
 * El crecimiento se calcula aquí y no en el puente: las dos bibliotecas dan el periodo anterior de otra manera —TDLib
 * lo trae ya convertido en porcentaje, WTelegramClient solo da la cifra anterior—, y una resta repetida en dos idiomas
 * es la única forma de que el mismo periodo dé el mismo número en las dos pantallas. Sin periodo anterior no hay
 * flecha: `previous` ausente significa que la biblioteca no lo sabe, no que valiera cero.
 */
export function statGrowth(card: ChatStatCard): number | undefined {
  if (typeof card.previous !== 'number' || !Number.isFinite(card.previous) || card.previous <= 0) return undefined;
  return ((card.value - card.previous) / card.previous) * 100;
}

export function statGrowthLabel(growth: number) {
  const rounded = oneDecimal.format(Math.abs(growth));
  if (Math.abs(growth) < 0.05) return 'sin cambio';
  return `${growth > 0 ? '▲' : '▼'} ${rounded} %`;
}

/** `2026-10-20` → `20/10/2026`; lo que el puente no mandó no se fecha. */
export function statDate(iso?: string) {
  if (!iso) return '';
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!parts) return '';
  return `${parts[3]}/${parts[2]}/${parts[1]}`;
}

/** Lo que la pantalla sabe nombrar, en el orden en que la biblioteca lo mandó: el catálogo filtra, no reordena. */
export function readableStats(values: ChatStatCard[], kind: 'channel' | 'group') {
  const order = kind === 'channel' ? CHANNEL_STAT_IDS : GROUP_STAT_IDS;
  return values.filter(card => order.includes(card.id) && Number.isFinite(card.value));
}
