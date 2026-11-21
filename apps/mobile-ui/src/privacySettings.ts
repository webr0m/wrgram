import type { PrivacySetting } from './contract';

/**
 * El espejo de `PrivacyRules.java` y de `DesktopPrivacy.cs` (ronda BH): las diez claves de la privacidad de la
 * cuenta, los doce tipos de regla que devuelven TDLib y MTProto —medidos por reflexión sobre `WTelegramClient`
 * 4.4.10—, la proyección que la pantalla pinta y la reconstrucción que se envía. Son las cadenas que el puente
 * devuelve, copiadas carácter a carácter de `NativeBridge.java:3847-3893` y de `PrivacyRules.java`;
 * `rondaBH.test.ts` las compara con el Java, con el C# y con las etiquetas del panel para que la vista de diseño no
 * enseñe nunca una palabra que Android o Windows no dirían.
 *
 * Lo que no cabe en el espejo es el `access_hash`: TDLib escribe identificadores sueltos y MTProto escribe
 * `InputUser`, así que `MissingUser` es una negativa que solo existe en la capa de Windows y aquí no hay estado que
 * la provoque. Se lista en `PRIVACY_REFUSALS` con esa marca, no para que el andamio la tire.
 */

/** Las diez de `PRIVACY_KEYS` (`NativeBridge.java:3847`), en el orden del array que la pantalla recorre. */
export const PRIVACY_KEYS = [
  'status', 'profilePhoto', 'phone', 'bio', 'birthdate', 'forwards', 'calls', 'voiceMessages', 'invites', 'findPhone',
] as const;

/** Las tres bases que la pantalla sabe elegir (`SettingsPage.tsx:123`) y que `validate` acepta (`PrivacyRules.java:89`). */
export const PRIVACY_BASES = ['everyone', 'contacts', 'nobody'] as const;

/** El `custom` de `PrivacyRules.java:47`: dos bases en la lista de Telegram, o ninguna. */
export const PRIVACY_CUSTOM = 'custom';

/** `BridgePolicy.text(p,"key",20)` y `("value",12)` (`NativeBridge.java:3895`). */
export const PRIVACY_MAX_KEY = 20;
export const PRIVACY_MAX_VALUE = 12;

/** El tope por lista de `optionalIds(…, 100)` (`:3863`, `:3875`). */
export const PRIVACY_MAX_PER_LIST = 100;

/** El tope conjunto de `PrivacyRules.MAX_USER_EXCEPTIONS` (`PrivacyRules.java:20`). */
export const PRIVACY_MAX_EXCEPTIONS = 200;

/** Las negaciones, con su fuente al lado. Son las que el puente dice, no las que la pantalla inventa. */
export const PRIVACY_REFUSALS = {
  /** El `default` de `privacySetting` (`NativeBridge.java:3875`). */
  unknownSetting: 'Ajuste de privacidad no válido.',
  /** El `default` de `BridgePolicy.text` sobre la clave o el valor (`BridgePolicy.java:59`). */
  badText: 'El ajuste y el valor de privacidad tienen que llegar como texto corto.',
  /** El `default` de `BridgePolicy.ids` sobre las dos listas (`BridgePolicy.java:58`). */
  badList: 'La lista de excepciones de privacidad no está bien formada.',
  /** El primer `throw` de `validate` (`PrivacyRules.java:90`). */
  badValue: 'Valor de privacidad no válido.',
  /** El segundo (`:92`), con el número dentro de la frase. Con el tope de cien por lista delante, por el puente no
   * se alcanza: cien permitidas más cien restringidas son doscientas y la negación pide más de doscientas. Se
   * conserva porque es la norma de Java y la promesa de la pantalla. */
  tooMany: 'Máximo 200 excepciones por ajuste.',
  /** El tercero (`:94`). */
  duplicated: 'Hay usuarios duplicados en las excepciones.',
  /** El cuarto (`:95`). */
  bothWays: 'Un usuario no puede estar permitido y restringido a la vez.',
  /** La guarda de `:3871`, entre la lectura y la escritura. Allá la dice Java; aquí la repite C#. */
  changedAccount: 'La cuenta cambió; no se modificó la privacidad.',
  /** Sin gemelo en Android: TDLib no pide `access_hash` al escribir. Solo lo diría Windows. */
  missingUser: 'Telegram no dio los datos necesarios para incluir a esa persona en la lista. Vuelve a abrir la lista de contactos e inténtalo de nuevo.',
  /** Solo lo diría Windows: una regla que `DesktopPrivacy.Carried` aún no sepa reconvertir. */
  untranslatable: 'Hay una regla de Telegram que WRGram no sabe reescribir. El ajuste queda intacto.',
} as const;

/**
 * Los doce tipos de regla que las dos capas devuelven, escritos como unión cerrada. Los siete que la interfaz no
 * sabe expresar son los de `PrivacyRules.label` (`PrivacyRules.java:99-107`) más `allowCloseFriends`, que TDLib no
 * tiene y MTProto sí.
 */
export type PrivacyRule =
  | { kind: 'allowAll' }
  | { kind: 'allowContacts' }
  | { kind: 'disallowAll' }
  | { kind: 'allowUsers'; users: string[] }
  | { kind: 'disallowUsers'; users: string[] }
  | { kind: 'allowBots' }
  | { kind: 'disallowBots' }
  | { kind: 'allowPremium' }
  | { kind: 'disallowContacts' }
  | { kind: 'allowChatMembers'; chats: string[] }
  | { kind: 'disallowChatMembers'; chats: string[] }
  | { kind: 'allowCloseFriends' };

/** Las cinco que la pantalla sabe reescribir: las tres bases y las dos listas de personas (`PrivacyRules.java:25-31`). */
const MODELED = new Set(['allowAll', 'allowContacts', 'disallowAll', 'allowUsers', 'disallowUsers']);
export const isModeledRule = (rule: PrivacyRule): boolean => MODELED.has(rule.kind);

/** Las siete etiquetas de lo que se conserva, en el orden de `PrivacyRules.java:100-105` más la de MTProto. */
export const PRIVACY_RULE_LABELS: Record<string, string> = {
  allowBots: 'bots permitidos',
  disallowBots: 'bots restringidos',
  allowPremium: 'suscriptores de Premium permitidos',
  disallowContacts: 'contactos restringidos',
  allowChatMembers: 'miembros de chats permitidos',
  disallowChatMembers: 'miembros de chats restringidos',
  allowCloseFriends: 'amigos cercanos permitidos',
};

/** El `default` de `PrivacyRules.label` (`:106`), inalcanzable con la unión cerrada y conservado por paridad. */
export const PRIVACY_OTHER_RULES = 'otras reglas de Telegram';

/**
 * `PrivacyRules.project` (`:33-49`). La base solo vale si hay **exactamente una** en la lista (`:47`); con dos o con
 * ninguna el estado se llama `custom` y la pantalla lo deja intacto. Las etiquetas se deduplican como allá (`:44`).
 */
export function projectPrivacy(key: string, rules: PrivacyRule[]): PrivacySetting {
  const allow: string[] = [], restrict: string[] = [], preserved: string[] = [], bases: string[] = [];
  for (const rule of rules) {
    if (rule.kind === 'allowAll') bases.push('everyone');
    else if (rule.kind === 'disallowAll') bases.push('nobody');
    else if (rule.kind === 'allowContacts') bases.push('contacts');
    else if (rule.kind === 'allowUsers') allow.push(...rule.users);
    else if (rule.kind === 'disallowUsers') restrict.push(...rule.users);
    else {
      const label = PRIVACY_RULE_LABELS[rule.kind] ?? PRIVACY_OTHER_RULES;
      if (!preserved.includes(label)) preserved.push(label);
    }
  }
  return { key, value: bases.length === 1 ? bases[0] : PRIVACY_CUSTOM, allowUsers: allow, restrictUsers: restrict, preserved };
}

/** La forma de `BridgePolicy.text` (`BridgePolicy.java:59`): cadena, ni ausente ni de otro tipo, y dentro del tope. */
export const shapedText = (raw: unknown, maximum: number): boolean =>
  typeof raw === 'string' && raw.length <= maximum;

/**
 * La forma de `optionalIds` (`NativeBridge.java:3908`) con `BridgePolicy.ids` (`BridgePolicy.java:57`) dentro:
 * ausencia o array vacío es la lista vacía; lo demás, como mucho cien elementos y todos con la pinta de un entero
 * firmado. La expresión de Java ancla los dos extremos sola con `matches`; en JS `$` tampoco deja pasar un salto de
 * línea final, así que las dos capas rechazan exactamente lo mismo.
 */
export function shapedIds(raw: unknown): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  if (raw.length > PRIVACY_MAX_PER_LIST) return false;
  return raw.every(item => typeof item === 'string' && /^-?(0|[1-9][0-9]{0,18})$/.test(item));
}

export const privacyIds = (raw: unknown): string[] => (Array.isArray(raw) ? raw.map(String) : []);

/**
 * `PrivacyRules.validate` (`:88-96`) en el mismo orden: la base, la suma de las dos listas y luego los duplicados
 * sobre un mismo conjunto —de ahí que «permitido y restringido a la vez» sea otra frase y no la misma—.
 */
export function privacyProblem(value: string, allow: string[], restrict: string[]): string | null {
  if (!PRIVACY_BASES.includes(value as (typeof PRIVACY_BASES)[number])) return PRIVACY_REFUSALS.badValue;
  if (allow.length + restrict.length > PRIVACY_MAX_EXCEPTIONS) return PRIVACY_REFUSALS.tooMany;
  // `Set.add` de JS devuelve el propio conjunto, no un booleano como `HashSet.add` de Java, así que la duplicación
  // se mira con `has` y el conjunto se sigue compartiendo entre las dos listas.
  const seen = new Set<string>();
  for (const id of allow) {
    if (seen.has(id)) return PRIVACY_REFUSALS.duplicated;
    seen.add(id);
  }
  for (const id of restrict) {
    if (seen.has(id)) return PRIVACY_REFUSALS.bothWays;
    seen.add(id);
  }
  return null;
}

/** `PrivacyRules.base` (`:72-86`): el orden interno del bloque que se reescribe. */
function baseRules(value: string, allow: string[], restrict: string[]): PrivacyRule[] {
  const rules: PrivacyRule[] = [];
  if (value === 'everyone') {
    rules.push({ kind: 'allowAll' });
    if (restrict.length > 0) rules.push({ kind: 'disallowUsers', users: restrict });
  } else if (value === 'contacts') {
    rules.push({ kind: 'allowContacts' });
    if (allow.length > 0) rules.push({ kind: 'allowUsers', users: allow });
    if (restrict.length > 0) rules.push({ kind: 'disallowUsers', users: restrict });
  } else {
    rules.push({ kind: 'disallowAll' });
    if (allow.length > 0) rules.push({ kind: 'allowUsers', users: allow });
  }
  return rules;
}

/**
 * `PrivacyRules.merge` (`:56-70`), que es donde está la norma de la ronda B: las reglas que la interfaz no sabe
 * expresar siguen en su hueco —las de antes, antes; las de después, después—, así que su prioridad relativa no
 * cambia. Antes de llamar hay que comprobar la forma; aquí solo se reconstruye.
 */
export function mergePrivacy(previous: PrivacyRule[], value: string, allow: string[], restrict: string[]): PrivacyRule[] {
  const before: PrivacyRule[] = [], after: PrivacyRule[] = [];
  let inBlock = false;
  for (const rule of previous) {
    if (isModeledRule(rule)) { inBlock = true; continue; }
    (inBlock ? after : before).push(rule);
  }
  return [...before, ...baseRules(value, allow, restrict), ...after];
}
