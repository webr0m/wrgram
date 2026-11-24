import type { BlockedSender, BlockedSenders } from './contract';

/**
 * El espejo de `BlockedSendersPolicy.java` y de `DesktopBlocked.cs` (ronda BI): la página de remitentes bloqueados,
 * su marcador, las dos palabras de `kind`, los tres techos y las negaciones que dicen las dos capas. Son las cadenas
 * que el puente devuelve, copiadas carácter a carácter de `NativeBridge.java:1565-1600` y de
 * `BlockedSendersPolicy.java:9-36`; `rondaBI.test.ts` las compara con el Java, con el C# y con los rótulos del panel
 * para que la vista de diseño no enseñe nunca una palabra que Android o Windows no dirían.
 *
 * Lo que no cabe en el espejo es el `access_hash`: TDLib desbloquea un remitente por su id suelto y MTProto exige un
 * `InputPeer` con hash, así que `needsHash`, `noProfileHash`, `notInList` y `changedAccount` son negativas que solo
 * dirá Windows. Se listan con esa marca, igual que hizo la ronda BH con `missingUser`, no para que el andamio las tire.
 */

/** El `PAGE_SIZE` de `BlockedSendersPolicy.java:7`, el de la lectura de `:1510` y el divisor del techo de marcador. */
export const BLOCKED_PAGE_SIZE = 50;

/** `Integer.MAX_VALUE - PAGE_SIZE` (`BlockedSendersPolicy.java:14`), escrito como resta porque eso es lo que es. */
export const BLOCKED_MAX_OFFSET = 2_147_483_647 - BLOCKED_PAGE_SIZE;

/** El recorte de `:1517` (la fila) y de `:1534` (el cuadro de confirmar), la misma cifra en los dos sitios. */
export const BLOCKED_NAME_SHOWN = 120;

/** Las dos palabras de `BlockedSendersPolicy.kind` (`:27-28`): persona o bot, y chat o canal. */
export const BLOCKED_KINDS = ['user', 'chat'] as const;

/** Las negaciones, con su fuente al lado. Son las que el puente dice, no las que la pantalla inventa. */
export const BLOCKED_REFUSALS = {
  /** Los dos `throw` de `BlockedSendersPolicy.offset` (`:12` y `:14`): que el marcador no sea entero y que se salga. */
  badOffset: 'Paginación no válida.',
  /** El `throw` de `sender` (`:23`): `kind` desconocido, id con otra pinta, persona cero o uno mismo, chat cero. */
  badSender: 'Remitente no válido.',
  /** El de `kind`/`id` (`:29` y `:35`) sobre un remitente que ninguna de las dos capas sabe nombrar. */
  incompatiblePeer: 'Remitente no compatible.',
  /** El `catch` de `blockedSenders` (`:1526`), que allá envuelve también la fila que no se puede armar. */
  listFailed: 'No se pudo preparar la lista de bloqueados.',
  /** La guarda de `:1539`, entre el cuadro de confirmar y la escritura. */
  changedAccount: 'La cuenta cambió. No se modificó el bloqueo.',
  /** Solo lo diría Windows: la relectura ya no trae al remitente que la pantalla nombró. */
  notInList: 'Ese remitente ya no está en la lista de bloqueados. Vuelve a abrirla antes de repetirlo.',
  /** Solo lo diría Windows: sin `access_hash` no hay `InputPeer` que mandar. */
  needsHash: 'Telegram no dio los datos necesarios para desbloquear a este remitente. Vuelve a abrir la lista de bloqueados e inténtalo de nuevo.',
  /** Solo lo diría Windows, y por la misma falta de hash, pero desde la ficha de la persona. */
  noProfileHash: 'Telegram no dio los datos necesarios para cambiar el bloqueo de esta persona. Vuelve a abrir su ficha desde la conversación e inténtalo de nuevo.',
  /** El primer `throw` de `profileBlock` (`NativeBridge.java:1306`). */
  notPrivate: 'Esta acción solo está disponible para usuarios y bots.',
  /** El segundo (`:1304`). */
  selfBlock: 'Esta es tu propia cuenta.',
  /** Solo lo diría Windows: el `getBoolean("value")` de `:1305` allá lanza sin mensaje propio. */
  missingValue: 'Falta el valor de bloqueo. Vuelve a intentarlo desde la ficha de la persona.',
  /** Solo lo diría Windows, el mismo caso con un valor que no es verdadero ni falso. */
  badValue: 'El valor de bloqueo no es verdadero ni falso.',
} as const;

/** Los cuatro rótulos del cuadro de `:1555-1558`. Lo de «no se envía ningún mensaje» es la parte que el botón no dice. */
export const BLOCKED_DIALOG = {
  title: (name: string) => 'Desbloquear a ' + name,
  body: 'Se quitará el bloqueo de esta cuenta de Telegram. Podrá volver a contactarte según tus ajustes de privacidad. No se envía ningún mensaje ni se añade a contactos.',
  accept: 'Desbloquear',
} as const;

/**
 * Copia de `NativeSnapshot.limit` (`NativeSnapshot.java:552`) y de `DesktopContact.Limit` (`DesktopContact.cs:83`):
 * se corta y se marca con punto suspensivo, no se corta a secas. El andamio lo necesita porque el recorte lo hace el
 * puente, y una fila de diseño más ancha que la real engaña al que está mirando la pantalla.
 */
export const blockedLimit = (text: string, maximum = BLOCKED_NAME_SHOWN): string =>
  text.length > maximum ? text.slice(0, maximum) + '…' : text;

/** El `offset` de `BlockedSendersPolicy.java:9-16`: ausencia vale cero; lo demás tiene que ser entero dentro del hueco. */
export const blockedOffsetProblem = (raw: unknown): string | null => {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'number' || !Number.isInteger(raw)) return BLOCKED_REFUSALS.badOffset;
  return raw < 0 || raw > BLOCKED_MAX_OFFSET ? BLOCKED_REFUSALS.badOffset : null;
};

export const blockedOffset = (raw: unknown): number => (typeof raw === 'number' && Number.isInteger(raw) ? raw : 0);

/** La litera de `BridgePolicy.id` (`BridgePolicy.java:59`): cadena con forma de entero firmado de hasta diecinueve dígitos. */
const IDENTIFIER = /^-?(0|[1-9][0-9]{0,18})$/;

/**
 * El `sender(params,selfId)` de `BlockedSendersPolicy.java:18-24`: primero el identificador y luego la clase, con las
 * dos guardas de cada tipo. Devuelve `null` en vez de lanzar, que es la forma en que el andamio de la ronda BH ya
 * encadenaba sus negaciones; el orden de las comprobaciones sí es el de Java.
 */
export function blockedSender(raw: { kind?: unknown; id?: unknown }, selfId: string): { kind: BlockedSender['kind']; id: string } | null {
  const id = raw.id, kind = raw.kind;
  if (typeof id !== 'string' || !IDENTIFIER.test(id)) return null;
  // Java compara `long` (`:20-22`), así que el signo y los ceros a la izquierda se miran como número y la cadena se
  // devuelve tal cual, que es lo que la pantalla volvió a mandar.
  const value = BigInt(id);
  if (kind === 'user' && value > 0n && value !== BigInt(selfId)) return { kind: 'user', id };
  if (kind === 'chat' && value !== 0n) return { kind: 'chat', id };
  return null;
}

/**
 * `result.totalCount` de `:1528`, que en MTProto solo existe en la página corta (`Contacts_BlockedSlice.count`); sin
 * cifra, el total de la página es lo que hay. La diferencia entre las dos capas está documentada en
 * `DesktopBlocked.Total`.
 */
export const blockedTotal = (count: number | null, rows: number): number => (count === null ? rows : count);

/** La fórmula de `:1528`, sin tocar: `count>0 && (count>=PAGE_SIZE || offset+count<total)`. */
export const blockedHasMore = (rows: number, offset: number, total: number): boolean =>
  rows > 0 && (rows >= BLOCKED_PAGE_SIZE || offset + rows < total);

/** La página de `:1528` con sus cuatro claves y en su orden. */
export function blockedPage(items: BlockedSender[], offset: number, total: number): BlockedSenders {
  return { items, total, nextOffset: offset + items.length, hasMore: blockedHasMore(items.length, offset, total) };
}
