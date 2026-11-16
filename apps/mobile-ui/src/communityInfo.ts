import type { CommunityInfo } from './contract';

export type CommunityField = 'title' | 'description';

/**
 * Las reglas de `setChatTitle` (1-128) y `setChatDescription` (0-255), dichas en el idioma del
 * puente. El nativo valida primero: si aquí y allí se separan, la persona lee una promesa de
 * guardar que Telegram iba a rechazar.
 */
export const LIMITS: Record<CommunityField, { min: number; max: number }> = {
  title: { min: 1, max: 128 },
  description: { min: 0, max: 255 },
};

export const unsupportedNotice = 'El nombre y la descripción solo se editan en grupos, supergrupos y canales.';
export const noRightNotice = 'Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.';
export const changedNotice = 'La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.';
export const unreadableNotice = 'Telegram no devolvió la descripción actual de la comunidad. Vuelve a intentarlo.';
const emptyTitleNotice = 'Telegram no guarda comunidades sin nombre: escribe un título de al menos un carácter.';

/**
 * Lo que realmente llega a Telegram: sin bordes, y vacío solo donde vacío está permitido. Es la regla de
 * `String.trim()` de Java (`ChatEditing.java:81`), que recorta solo los códigos menores o iguales que el espacio.
 * El `trim()` de JavaScript recorta además los espacios Unicode, y eso convertiría un nombre con un separador de no
 * salto por delante en dos textos distintos según la capa: Android lo guardaría y Windows también, la pantalla lo
 * mostraría recortado y mandaría la versión corta.
 */
export const prepared = (value: string): string => value.replace(/^[\x00-\x20]+/, '').replace(/[\x00-\x20]+$/, '');

/** Telegram cuenta caracteres, no unidades UTF-16: un emoji ocupa dos y vale uno. */
export const characters = (value: string): number => [...value].length;

/** Cadena vacía cuando Telegram lo aceptaría; si no, la frase con la que el puente lo rechaza. */
export function problem(field: CommunityField, value: string): string {
  const text = prepared(value);
  const limit = LIMITS[field];
  if (characters(text) < limit.min) return emptyTitleNotice;
  if (characters(text) > limit.max) {
    return `Telegram admite ${field === 'title' ? 'nombres' : 'descripciones'} de hasta ${limit.max} caracteres.`;
  }
  return '';
}

/** Un texto igual al que ya está no es un cambio: escribirlo sería molestar a Telegram y a la persona. */
export const unchanged = (value: string, previous: string): boolean => prepared(value) === prepared(previous);

/** Por qué el campo está cerrado, o `''` cuando se puede editar. */
export function lock(info: CommunityInfo | undefined, field: CommunityField): string {
  if (!info) return '';
  if (!info.canChange) return noRightNotice;
  if (field === 'description' && !info.descriptionKnown) return unreadableNotice;
  return '';
}

export const savedNotice = (field: CommunityField): string =>
  `Telegram actualizó ${field === 'title' ? 'el nombre' : 'la descripción'} de la comunidad.`;

export const cancelledNotice = 'Cancelado. En Telegram no ha cambiado nada.';
