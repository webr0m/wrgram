import type { InviteLink, InviteLinkPage, LinkForm } from './contract';
import { requestedAgo } from './joinRequestModel';

export const MAX_NAME = 32;
export const MAX_MEMBERS = 99_999;
export const MAX_SPAN = 31_536_000;

/** Opciones que Telegram admite de verdad: un enlace no caduca «cuando WRGram lo decida». */
export const DURATIONS: { seconds: number; label: string }[] = [
  { seconds: 0, label: 'sin caducidad' },
  { seconds: 86_400, label: '1 día' },
  { seconds: 604_800, label: '7 días' },
  { seconds: 2_592_000, label: '30 días' },
  { seconds: MAX_SPAN, label: '1 año' },
];

export const emptyForm = (): LinkForm => ({ name: '', expiresIn: 604_800, memberLimit: 0, approval: false });

/** La clave es el propio enlace: Telegram no da identificador numérico para los enlaces de invitación. */
export const keyOf = (link: InviteLink) => link.link;

/** Un marcador solo vale si Telegram anunció más páginas; la parte final puede llevar dos puntos (la url). */
export function cursorFor(page: InviteLinkPage | undefined): string {
  if (!page || page.next !== true) return '';
  return typeof page.cursor === 'string' && /^\d+:\S+$/.test(page.cursor) ? page.cursor : '';
}

export function mergeLinks(current: InviteLink[], incoming: InviteLink[]): InviteLink[] {
  const seen = new Set(current.map(keyOf));
  const extra = incoming.filter(link => !seen.has(keyOf(link)));
  return extra.length ? [...current, ...extra] : current;
}

/** Un marcador que no avanza repetiría la misma página: se descarta en lugar de ofrecerlo otra vez. */
export function advanceCursor(previous: string, page: InviteLinkPage): string {
  const next = cursorFor(page);
  return next && next !== previous ? next : '';
}

/** `EditChatInviteLink` sustituye todos los ajustes: al editar se parte de lo que Telegram dice ahora mismo. */
export function formOf(link: InviteLink, now: number): LinkForm {
  return { name: link.name, expiresIn: durationFor(link.expires, now), memberLimit: link.memberLimit, approval: link.approval };
}

/** Duración ofrecida más parecida a lo que queda vivo al enlace (nunca «sin caducidad» si sí caduca). */
export function durationFor(expires: number, now: number): number {
  if (expires <= 0) return 0;
  const remaining = expires - Math.floor(now);
  if (remaining <= 0) return 86_400;
  let best = MAX_SPAN;
  let delta = Number.POSITIVE_INFINITY;
  for (const option of DURATIONS) {
    if (!option.seconds) continue;
    const distance = Math.abs(option.seconds - remaining);
    if (distance < delta) { delta = distance; best = option.seconds; }
  }
  return best;
}

/** Mismos mensajes que valida el nativo, para que el formulario no prometa algo que Telegram va a rechazar. */
export function formProblem(form: LinkForm): string {
  if (form.name.length > MAX_NAME) return 'El nombre del enlace no puede superar 32 caracteres.';
  if (!Number.isInteger(form.expiresIn) || form.expiresIn < 0) return 'La caducidad del enlace no es válida.';
  if (form.expiresIn > MAX_SPAN) return 'Telegram no permite enlaces que caduquen más allá de un año.';
  if (!Number.isInteger(form.memberLimit) || form.memberLimit < 0 || form.memberLimit > MAX_MEMBERS) return 'El límite de miembros debe estar entre 0 y 99.999.';
  if (form.approval && form.memberLimit > 0) return 'Un enlace que exige aprobación no puede limitar además el número de miembros.';
  return '';
}

export const linkTitle = (link: InviteLink) => link.name || (link.primary ? 'Enlace principal' : 'Enlace sin nombre');

/** Solo un enlace normal admite nombre, caducidad y límite: principal, de pago y revocado quedan fuera. */
export const canEdit = (link: InviteLink) => !link.primary && !link.paid && !link.revoked;
export const canRevoke = (link: InviteLink) => !link.revoked;

export function expiryLabel(expires: number, now: number): string {
  if (expires <= 0) return 'sin caducidad';
  const seconds = Math.floor(expires) - Math.floor(now);
  if (seconds <= 0) return 'caducado';
  if (seconds < 3_600) return `caduca en ${Math.max(1, Math.floor(seconds / 60))} min`;
  if (seconds < 86_400) return `caduca en ${Math.floor(seconds / 3_600)} h`;
  if (seconds < 2_592_000) return `caduca en ${Math.floor(seconds / 86_400)} d`;
  const months = Math.floor(seconds / 2_592_000);
  return `caduca en ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

/** Resumen honesto de una fila: uso real, caducidad y solicitudes pendientes que genera ese enlace. */
export function linkSummary(link: InviteLink, now: number): string {
  const parts = [link.paid ? 'enlace de suscripción' : `${link.memberCount}${link.memberLimit ? `/${link.memberLimit}` : ''} miembros`];
  if (link.primary) parts.push('principal');
  if (link.approval) parts.push('exige aprobación');
  parts.push(expiryLabel(link.expires, now));
  if (link.pending > 0) parts.push(`${link.pending} solicitud${link.pending === 1 ? '' : 'es'} pendiente${link.pending === 1 ? '' : 's'}`);
  parts.push(`creado ${requestedAgo(link.created, now)}`);
  return parts.join(' · ');
}

export function linkCountLabel(total: number, shown: number, revoked: boolean): string {
  const kind = revoked ? 'revocado' : 'activo';
  const plural = (value: number) => (value === 1 ? `1 enlace ${kind}` : `${value} enlaces ${kind}s`);
  const value = Math.max(0, Math.floor(total));
  // El total de Telegram es aproximado: se anuncia como tal y nunca se infiere de la longitud de una página.
  if (value > 0) return `≈ ${plural(value)}${shown > value ? ` · ${shown} cargados` : ''}`;
  return plural(Math.max(0, Math.floor(shown)));
}
