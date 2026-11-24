import type { PhoneCodeInfo } from './contract';

/**
 * Lo que la pantalla del cambio de número (A02) puede decir con el `AuthenticationCodeInfo` que devuelve Telegram.
 *
 * Las cuatro reglas salen de la forma del objeto nativo, medida en `PhoneChange.java`: `describe` (`:29-40`) pone el
 * medio por el que llegó el código, `length` (`:43-51`) solo lo tiene quien lo recibe, `hint` (`:54-61`) es la pista
 * del patrón, del prefijo de la llamada perdida, de la frase del SMS o del enlace de Fragment, y `canResend`
 * (`:64-66`) exige un medio siguiente porque `ResendPhoneNumberCode` (TdApi.java:144644) solo funciona «if the
 * previously received authenticationCodeInfo.nextType was not null and the server-specified timeout has passed».
 * El texto va por capas: primero por dónde, después cuánto o qué pista, y al final la promesa del medio alternativo
 * — que se omite cuando el alternativo es el mismo medio, porque no ofrece nada nuevo.
 */
export function codeSentence(info: PhoneCodeInfo): string {
  const detail = info.length > 0 ? ` Son ${info.length} caracteres.` : info.hint ? ` La pista que da Telegram es «${info.hint}».` : ' Escribe el código que recibas.';
  const next = info.next && info.next !== info.sent ? ` Si no te llega, Telegram puede enviarlo por ${info.next}.` : '';
  return `Telegram te envía el código por ${info.sent}.${detail}${next}`;
}

/** El `timeout` de Telegram (`PhoneChange.java:74-81`); nunca cuenta hacia atrás desde un número negativo. */
export function countdownFrom(info: PhoneCodeInfo): number {
  return Math.max(0, info.timeout);
}

/** Reenviar solo cuando el medio siguiente existe y la cuenta atrás se agotó (`PhoneChange.java:64-67`). */
export function canResend(info: PhoneCodeInfo, secondsLeft: number): boolean {
  return !!info.next && secondsLeft <= 0;
}

/** «1:30», «0:45», y vacío cuando no hay nada que esperar. */
export function waitLabel(seconds: number): string {
  if (seconds <= 0) return '';
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
