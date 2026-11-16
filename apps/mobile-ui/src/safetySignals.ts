import type { SafetyInfo, SafetyNotice, SafetySignal } from './contract';

/**
 * Copia de las señales que Telegram ya informó. Los ids desconocidos se descartan en vez de
 * describirlos: una señal que WRGram no entiende no puede traducirse con otra palabra.
 */
const SIGNAL_COPY: Record<string, (value: string) => string> = {
  scam: () => 'Telegram marca esta cuenta como estafa.',
  fake: () => 'Telegram marca esta cuenta como suplantación de identidad.',
  verified: () => 'Cuenta verificada por Telegram.',
  restricted: value => `Telegram restringe parte de su contenido: ${value}.`,
  deleted: () => 'La cuenta fue eliminada de Telegram.',
  restrictsNewChats: () => 'Telegram limita los chats nuevos que puede iniciar esta cuenta.',
  notContact: () => 'No está entre tus contactos de Telegram.',
  unofficialApp: () => 'Esta persona usa una aplicación no oficial de Telegram.',
  privateForwards: () => 'Los reenvíos desde su cuenta salen sin enlace a su perfil.',
  commonGroups: value => `Tienen ${value} grupos y canales en común.`,
  anonymousSenders: () => 'Los mensajes salen firmados por el canal, no por quien los escribe.',
  signMessages: () => 'Los administradores firman con su nombre los mensajes.',
  joinByRequest: () => 'Para entrar hay que solicitarlo y un administrador debe aprobarlo.',
  joinToSend: () => 'Hay que unirse al chat antes de poder escribir.',
  protectedContent: () => 'Telegram protege este chat: sus mensajes no se pueden reenviar ni guardar.',
};

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export const toneRank = (tone: SafetySignal['tone']) => ({ bad: 0, warn: 1, good: 2, info: 3 })[tone] ?? 4;

export function knownSignal(signal: SafetySignal | undefined): SafetySignal | undefined {
  if (!signal || !SIGNAL_COPY[signal.id]) return undefined;
  return signal;
}

/** Señales legibles, ordenadas por gravedad y sin repetir las que Telegram ya contó dos veces. */
export function signalList(signals: SafetySignal[] | undefined): { id: string; text: string; tone: SafetySignal['tone'] }[] {
  const seen = new Set<string>();
  return (signals ?? [])
    .filter(signal => knownSignal(signal) && !seen.has(signal.id) && !!seen.add(signal.id))
    .slice()
    .sort((a, b) => toneRank(a.tone) - toneRank(b.tone))
    .map(signal => ({ id: signal.id, tone: signal.tone, text: SIGNAL_COPY[signal.id](signal.value ?? '') }));
}

export function noticeCopy(notice: SafetyNotice): string {
  const where = notice.channel ? 'el canal' : 'el grupo';
  switch (notice.kind) {
    case 'spam': return 'Telegram permite denunciar este chat si te parece spam. La denuncia llega a Telegram, no a la otra persona.';
    case 'unknown': {
      const when = registeredLabel(notice.registered);
      return when
        ? `Esta cuenta no está entre tus contactos; Telegram la registró en ${when}.`
        : 'Esta cuenta no está entre tus contactos de Telegram.';
    }
    case 'invite': return 'El chat se creó hace poco: todavía puedes invitar a más personas.';
    case 'contact': return 'Puedes guardar a esta persona en tus contactos de Telegram.';
    case 'phone': return 'Es un contacto mutuo: Telegram puede compartir tu número con esta persona si tú lo decides.';
    case 'join': return `Pediste unirte a «${notice.title || where}»${requestAgo(notice.date)} y un administrador tiene que aprobarlo.`;
    default: return '';
  }
}

/** «2024-03» solo se lee si Telegram mandó un año y un mes reales. */
export function registeredLabel(value: string | undefined): string {
  if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return '';
  const [year, month] = value.split('-');
  return `${MONTHS[Number(month) - 1]} de ${year}`;
}

export function requestAgo(date: number | undefined, now = Date.now() / 1000): string {
  if (!date || date <= 0) return '';
  const seconds = Math.max(0, Math.floor(now) - Math.floor(date));
  if (seconds < 3_600) return ' hace menos de una hora';
  if (seconds < 86_400) return ` hace ${Math.floor(seconds / 3_600)} h`;
  if (seconds < 2_592_000) return ` hace ${Math.floor(seconds / 86_400)} d`;
  return ` hace ${Math.floor(seconds / 2_592_000)} meses`;
}

/** Acciones que la propia barra autoriza: el permiso de denuncia vive en el chat, no en el aviso. */
export function noticeActions(notice: SafetyNotice | undefined, dismissible: boolean | undefined) {
  const warning = notice?.kind === 'spam' || notice?.kind === 'unknown';
  return {
    dismiss: warning && dismissible === true,
    unarchive: warning && notice?.canUnarchive === true,
  };
}

export function safetyDigest(info: SafetyInfo) {
  const list = signalList(info.signals);
  const risky = list.filter(signal => signal.tone === 'bad' || signal.tone === 'warn').length;
  if (!list.length) return 'Telegram no ha añadido ninguna señal sobre este chat.';
  const head = list.length === 1 ? '1 señal de Telegram' : `${list.length} señales de Telegram`;
  return risky ? `${head} · ${risky} para revisar` : head;
}
