export type CloudBackground = {
  id: string;
  name: string;
  dark: boolean;
  stock: boolean;
  selected: boolean;
  kind: 'fill' | 'pattern' | 'wallpaper' | 'chatTheme' | '';
  css?: string | null;
};

/**
 * Lo que el nativo responde por cada fondo de la cuenta y lo que la pantalla puede prometer con él. Un
 * relleno llega con su CSS y se pinta; lo demás se pone en la cuenta pero aquí no se dibuja, y eso se dice
 * en la fila en vez de ocultarla: si solo se ofrecieran los pintables, quien tenga su fondo de serie
 * puesto no podría recuperarlo.
 */
export const CLOUD_KIND_NOTES: Record<CloudBackground['kind'], string> = {
  fill: '',
  pattern: 'Solo se pinta su relleno; el estampado no se descarga en WRGram.',
  wallpaper: 'Su imagen no se baja todavía: se pone en la cuenta, pero la pantalla sigue con el fondo del tema.',
  chatTheme: 'Lo decide el tema de emoji de cada conversación; no se puede pintar desde aquí.',
  '': 'Telegram no ha dicho qué tipo de fondo es.',
};

export function cloudBackgroundNotice(row: CloudBackground): string {
  return CLOUD_KIND_NOTES[row.kind] ?? CLOUD_KIND_NOTES[''];
}

export function isPaintable(row: CloudBackground): boolean {
  return typeof row.css === 'string' && row.css.length > 0;
}

/** El CSS que la pantalla pone de fondo, o la cadena vacía si el fondo no tiene relleno que pintar. */
export function cloudBackgroundCss(background?: CloudBackground | null): string {
  return background && isPaintable(background) ? String(background.css) : '';
}

/** El orden del listado: primero lo que se puede pintar, y dentro de cada grupo los de serie antes. */
export function sortCloudBackgrounds(rows: CloudBackground[]): CloudBackground[] {
  return [...rows].sort((a, b) => (Number(isPaintable(b)) - Number(isPaintable(a)))
    || (Number(b.stock) - Number(a.stock)) || (Number(b.selected) - Number(a.selected))
    || a.name.localeCompare(b.name, 'es'));
}

export const BACKGROUND_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Los dos fondos que la cuenta tiene puestos, uno por modo; el nativo solo publica los que conoce. */
export type CloudBackgroundSlots = { light?: CloudBackground; dark?: CloudBackground };

/**
 * El hueco del modo activo y solo ese. Un fondo puesto para claro no pinta en oscuro: Telegram los guarda
 * separados, y cruzarlos haría que cambiar el tema del sistema cambase el fondo de la cuenta.
 */
export function cloudBackgroundFor(slots: CloudBackgroundSlots | undefined, dark: boolean): CloudBackground | undefined {
  return dark ? slots?.dark : slots?.light;
}

/** Los colores que acepta el puente: hex de seis u ocho dígitos; cualquier otra cosa no se envía. */
export function isBackgroundHex(value: string): boolean {
  return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);
}

export type CloudBackgroundDraft = { top: string; bottom: string; angle: number; gradient: boolean };

/** Lo que se manda para crear un relleno nuevo; sin degradado el segundo color no viaja. */
export function cloudBackgroundParams(draft: CloudBackgroundDraft, dark: boolean): Record<string, unknown> | undefined {
  if (!isBackgroundHex(draft.top)) return undefined;
  if (!draft.gradient) return { top: draft.top, dark };
  if (!isBackgroundHex(draft.bottom)) return undefined;
  return { top: draft.top, bottom: draft.bottom, angle: draft.angle, dark };
}
