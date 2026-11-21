import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda CK-B — cambiar el archivo de un mensaje que ya salió, también en Windows.
 *
 * La ronda CK escribió las reglas en `MessageMediaEdit.java` y dejó dicho el hueco del escritorio con las líneas que
 * lo probaban: en MTProto `messages.editMessage` sí recibe `media`, así que no había un límite de biblioteca que
 * negar, sino una ronda sin hacer. Esta es esa ronda, y la hace con las dos peticiones que el cable pide —
 * `upload.saveFilePart` para el archivo nuevo y `messages.editMessage` para reescribir la fila—, no con una
 * simulación.
 *
 * **Lo primero que se midió fue la forma del cable, campo a campo sobre el ensamblado empaquetado de
 * `WTelegramClient` 4.4.10.** Dos consecuencias mandan el resto. La primera: no existe `GetMessageProperties` que
 * consulte `canEditMedia`, así que el derecho lo decide el host con las mismas dos miradas que ya usan `message.edit`
 * y `message.edit.caption` —autoría de la fila y `edit_messages` en un canal—, y para saberlas tiene que releer el
 * mensaje (`TelegramService.cs:1832`), igual que obliga la propia petición: `messages.editMessage` reemplaza, no
 * parchea. La segunda: ningún `InputMedia` de esta versión tiene campo de pie, así que el texto conserva su camino
 * por el argumento `message` de la petición (`TelegramService.cs:1856`) con sus entidades (`TelegramService.cs:1858`)
 * y con la bandera de ponerlo encima del medio (`TelegramService.cs:1859`). Cambiar el archivo no es borrar lo
 * escrito, y editarlo por aquí no pisa `message.edit.caption`.
 *
 * **El orden es el de Android, con una adaptación que obliga el coste.** Allí se arma el contenido antes de preguntar
 * porque preguntar cuesta un viaje; aquí negar es gratis y subir cuesta, así que todas las negativas que no necesitan
 * la red caen antes de la subida (`TelegramService.cs:1852`): el vale y su cuenta, la conversación cargada, la fila
 * leída, el archivo preparado y, ya con la fila fresca, `DesktopMessageEditMedia.Problem` (`TelegramService.cs:1846`).
 * Detrás de la confirmación se tira la copia local y se releé el historial, porque la fila vieja apunta al archivo que
 * ya no está.
 *
 * **Las reglas no se vuelven a inventar: se copian.** Las cuatro negativas son las cuatro constantes de
 * `MessageMediaEdit.java:41`, `MessageMediaEdit.java:43`, `MessageMediaEdit.java:45` y `MessageMediaEdit.java:47`,
 * carácter a carácter, en `DesktopMessageEditMedia.cs:48`, `DesktopMessageEditMedia.cs:49`,
 * `DesktopMessageEditMedia.cs:50` y `DesktopMessageEditMedia.cs:51`. Los cinco tipos son las cinco palabras de
 * `MessageMediaEdit.java:32-36`, que aquí lee `DesktopMessageEditMedia.cs:58`. El orden de negar es el de
 * `MessageMediaEdit.java:81`, la pareja del álbum la de
 * `MessageMediaEdit.java:89`, y la entrada que ofrece la pantalla es la misma conjunción de
 * `NativeBridge.java:4326` —derecho **y** un medio de los cinco—. Las tres exclusiones que Android decide por clase
 * de contenido —sticker, videomensaje redondo y nota de voz— se miden aquí por atributo del documento, en
 * `DesktopMessageEditMedia.cs:65` y en el mismo orden, antes de los tipos que sí admiten el cambio. Lo que Android
 * mide y este host no puede medir —el contenedor que admite emisión continua, `MessageMediaEdit.java:131`— se queda
 * dicho en el archivo, no imitado.
 *
 * **Dónde vive cada regla del espejo.** `DesktopMessageEditMedia.cs:58` dice qué medio guarda la fila y
 * `DesktopMessageEditMedia.cs:83` qué tipo saldrá del archivo recién elegido; `DesktopMessageEditMedia.cs:96` pone el
 * orden de las negativas y `DesktopMessageEditMedia.cs:105` la única pareja canjeable del álbum;
 * `DesktopMessageEditMedia.cs:115` y `DesktopMessageEditMedia.cs:122` deciden el derecho y la entrada del menú;
 * `DesktopMessageEditMedia.cs:128`, `DesktopMessageEditMedia.cs:134` y `DesktopMessageEditMedia.cs:139` conservan el
 * pie, su puesto encima del medio y el aviso de contenido sensible, y `DesktopMessageEditMedia.cs:149` arma el medio
 * nuevo. El brazo del despacho está en `TelegramService.cs:325`, en la misma visera que su par de Android,
 * `NativeBridge.java:831`.
 *
 * **Las negativas del brazo, en el orden en que caen.** `TelegramService.cs:1812` la cuenta conectada,
 * `TelegramService.cs:1818` el vale del archivo con su cuenta y su conversación, `TelegramService.cs:1825` el archivo
 * todavía preparado y `TelegramService.cs:1846` la forma, el derecho y el álbum juntos, ya con la fila recién leída
 * en `TelegramService.cs:1832`. Cobrar y pedir viene después: `TelegramService.cs:1852` sube el archivo y
 * `TelegramService.cs:1855` escribe la fila. Si la petición no cuaja, `TelegramService.cs:1865` deja la copia local
 * donde estaba; si cuaja, `TelegramService.cs:1867` la tira porque la fila ya apunta a otro archivo.
 *
 * **Cómo sabe Windows de qué tipo es el adjunto sin preguntar la red cada vez.** La conversión de la fila anota la
 * clase real del objeto de Telegram en `TelegramService.cs:3440` y la guarda en `DesktopState.cs:191`, y la anota por
 * el mismo motivo que `HasCaption`: es la única mirada que ve la clase. La marca no viaja —`[JsonIgnore]`—, así que el
 * cable entre el host y la pantalla es
 * exactamente el de antes; lo que se añade es una respuesta dentro del host (`TelegramService.cs:3196`) y su bandera
 * en `message.properties` (`TelegramService.cs:3218`).
 *
 * **La pantalla ya no distingue capa.** `App.tsx:1074` pinta la entrada sin el `!desktop` que dejó la CK y la clave
 * está en la fila afirmada de `desktopScope.ts:28`. El andamio sigue publicando la bandera con la forma de la fila
 * (`preview.ts:401`) y no modela la orden en ninguna capa, ni aquí ni en Android: eso está dicho en la hoja, no
 * tapado.
 *
 * Como en CF, CM, CN, CI, CJ, CK y CN-B: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda
 * tiene que estar en la tabla y señalar hoy la línea que su frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';

const bodies: Record<string, string[]> = {
  'TelegramService.cs': rows(`${host}TelegramService.cs`),
  'DesktopMessageEditMedia.cs': rows(`${host}DesktopMessageEditMedia.cs`),
  'DesktopState.cs': rows(`${host}DesktopState.cs`),
  'NativeBridge.java': rows(`${javaDir}NativeBridge.java`),
  'MessageMediaEdit.java': rows(`${javaDir}MessageMediaEdit.java`),
  'App.tsx': rows('./App.tsx'),
  'desktopScope.ts': rows('./desktopScope.ts'),
  'preview.ts': rows('./preview.ts'),
  'contract.ts': rows('./contract.ts'),
};
const service = bodies['TelegramService.cs'];
const mirror = bodies['DesktopMessageEditMedia.cs'];
const stateCs = bodies['DesktopState.cs'];
const java = bodies['NativeBridge.java'];
const pure = bodies['MessageMediaEdit.java'];
const app = bodies['App.tsx'];
const scope = bodies['desktopScope.ts'];
const preview = bodies['preview.ts'];
const contract = bodies['contract.ts'];

const mirrorText = text(`${host}DesktopMessageEditMedia.cs`);

/** La línea —1-based— de la primera fila que dice la aguja. */
function en(needle: string, body: string[], where: string) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
/** La única línea que dice la aguja dentro del trecho que la ronda tocó: fuera de él la frase se repite en otro brazo. */
function sola(needle: string, file: string, desde = 0, hasta = Number.POSITIVE_INFINITY) {
  const hits = bodies[file].map((row, i) => (i + 1 > desde && i + 1 < hasta && row.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${file} dice ${needle} en ${hits.join(',') || 'ninguna'} entre ${desde} y ${hasta}`);
  return hits[0];
}
const atServ = (n: string) => en(n, service, 'TelegramService.cs');
const atMirror = (n: string) => en(n, mirror, 'DesktopMessageEditMedia.cs');
const atApp = (n: string) => en(n, app, 'App.tsx');
const atPv = (n: string) => en(n, preview, 'preview.ts');

const servrow = (n: number) => service[n - 1] ?? '';
const mrow = (n: number) => mirror[n - 1] ?? '';
const prow = (n: number) => pure[n - 1] ?? '';
const jrow = (n: number) => java[n - 1] ?? '';
const strow = (n: number) => stateCs[n - 1] ?? '';
const arow = (n: number) => app[n - 1] ?? '';
const scrow = (n: number) => scope[n - 1] ?? '';
const pvrow = (n: number) => preview[n - 1] ?? '';

/** El cuerpo de un método, recortado por balance de llaves a partir de su firma. */
function cuerpo(lines: string[], signature: string, where: string) {
  return span(lines, signature, where).join('\n');
}
/** Las líneas del método, de su firma a la llave que lo cierra. */
function span(lines: string[], signature: string, where: string) {
  const start = lines.findIndex(row => row.includes(signature));
  if (start < 0) throw new Error(`Falta ${signature} en ${where}`);
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index]) {
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return lines.slice(start, index + 1);
    }
  }
  throw new Error(`${signature} no cierra su llave en ${where}`);
}
const count = (needle: string, cuerpo: string | string[]) => (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;

/** El literal entrecomiladeado que contiene una frase, para comparar orillas carácter a carácter. */
function dichoDobles(row: string, needle: string) {
  const at = row.indexOf(needle);
  if (at < 0) throw new Error(`${needle} no está en ${row.trim()}`);
  return row.slice(row.lastIndexOf('"', at) + 1, row.indexOf('"', at + needle.length));
}
/** El literal de una constante de cadena, en las dos lenguas. */
function literal(row: string) {
  const match = /= "([^"]*)";/.exec(row);
  if (!match) throw new Error(`No hay literal de cadena en ${row.trim()}`);
  return match[1];
}

const KEY = 'message.edit.media';
const REFUSED = 'Telegram no permite cambiar el medio de este mensaje.';
const NOT_MEDIA = 'Este mensaje no tiene un medio que se pueda sustituir.';
const ALBUM_TYPE = 'Dentro de un álbum solo se puede cambiar una foto por un vídeo, o un vídeo por una foto.';
const CHANGED = 'La conversación cambió. Vuelve a elegir el archivo.';

// El brazo y su cuerpo, medidos por firma: todo lo de dentro se busca entre la firma y la llave que cierra.
const CS_HEAD = sola('object? result = method switch', 'TelegramService.cs');
// La ronda CE escribió otra negativa genérica en el parseo de entidades, así que la aguja nombra la frase del beta.
const CS_GENERIC = sola('_ => throw new BridgeException($"No disponible en escritorio (beta)', 'TelegramService.cs');
const CS_ARM = sola(`"${KEY}" => await EditMessageMediaAsync(args),`, 'TelegramService.cs');
const [CS_BODY, CS_END] = (() => {
  const lines = span(service, 'private async Task<object?> EditMessageMediaAsync(', 'TelegramService.cs');
  return [atServ('private async Task<object?> EditMessageMediaAsync(JsonElement args)'), atServ('private async Task<object?> EditMessageMediaAsync(JsonElement args)') + lines.length - 1];
})();
const CS_METODO = cuerpo(service, 'private async Task<object?> EditMessageMediaAsync(', 'TelegramService.cs');
const CS_VAL = sola('throw new BridgeException(DesktopMessageEditMedia.Changed);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_PREPARO = sola('if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_CLASE = sola('var wanted = DesktopMessageEditMedia.WantedKind(file.Mime);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_DERECHO = sola('var channelAllowed = kind == DesktopMessageDelete.Kind.Channel && DesktopMessageEdit.ChannelRightsToEdit(ChannelOf(entry));', 'TelegramService.cs', CS_BODY, CS_END);
const CS_LEER = sola('var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });', 'TelegramService.cs', CS_BODY, CS_END);
const CS_IDA = sola('var problem = DesktopMessageEditMedia.Problem(DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed),', 'TelegramService.cs', CS_BODY, CS_END);
const CS_NEGADA = sola('if (problem != null) throw new BridgeException(problem);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_SUBIDA = sola('var uploaded = await client.UploadFileAsync(file.Path, null);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_MEDIO = sola('var media = DesktopMessageEditMedia.MediaFor(wanted, file.Name, file.Mime, uploaded,', 'TelegramService.cs', CS_BODY, CS_END);
const CS_EDIT = sola('await client.Messages_EditMessage(entry.Input, ids[0],', 'TelegramService.cs', CS_BODY, CS_END);
const CS_FALLA = sola('throw new BridgeException("No se confirmó la edición en Telegram. " + message, ex);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_TIRA = sola('DropOutbox(token);', 'TelegramService.cs', CS_BODY, CS_END);
const CS_REFRESCA = sola('await RefreshHistoryLocked();', 'TelegramService.cs', CS_BODY, CS_END);

// La visera del derecho que pregunta la pantalla y la anotación que la alimenta.
const CS_PROP = sola('var canEditMedia = DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,', 'TelegramService.cs');
const CS_FLAG = sola('editMedia = canEditMedia,', 'TelegramService.cs');
const CS_ANOTA = sola('dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);', 'TelegramService.cs');
const CS_MARK = sola('public string MediaKind { get; set; } = "";', 'DesktopState.cs');

// La clase espejo, por firma.
const M_TYPES = sola('public const string Photo = "photo";', 'DesktopMessageEditMedia.cs');
const M_NONE = sola('public const string None = "";', 'DesktopMessageEditMedia.cs');
const M_PHRASES = [sola('public const string Refused =', 'DesktopMessageEditMedia.cs'), sola('public const string NotMedia =', 'DesktopMessageEditMedia.cs'),
  sola('public const string AlbumType =', 'DesktopMessageEditMedia.cs'), sola('public const string Changed =', 'DesktopMessageEditMedia.cs')];
const M_CURRENT = sola('public static string CurrentKind(MessageMedia? media) => media switch', 'DesktopMessageEditMedia.cs');
const M_KINDOF = atMirror('private static string KindOf(Document document)');
const M_WANTED = sola('public static string WantedKind(string? mime)', 'DesktopMessageEditMedia.cs');
const M_PROBLEM = sola('public static string? Problem(bool canEditMedia, string current, string wanted, long groupedId)', 'DesktopMessageEditMedia.cs');
const M_ALBUM = sola('public static bool ExchangeableInAlbum(string current, string wanted) =>', 'DesktopMessageEditMedia.cs');
const M_GROUPED = sola('public static long GroupedId(Message message) =>', 'DesktopMessageEditMedia.cs');
const M_CAN = sola('public static bool CanEditMedia(Message fresh, bool channelAllowed) =>', 'DesktopMessageEditMedia.cs');
const M_OFFERED = sola('public static bool Offered(bool outgoing, bool channelAllowed, string current) =>', 'DesktopMessageEditMedia.cs');
const M_CAPTION = sola('public static string CaptionOf(Message message) => message.message ?? "";', 'DesktopMessageEditMedia.cs');
const M_ENTITIES = sola('public static MessageEntity[] CaptionEntitiesOf(Message message) => message.entities ?? [];', 'DesktopMessageEditMedia.cs');
const M_INVERT = sola('public static bool ShowsCaptionAboveMedia(Message message) =>', 'DesktopMessageEditMedia.cs');
const M_SPOILER = sola('public static bool HasSpoiler(MessageMedia? media) => media switch', 'DesktopMessageEditMedia.cs');
const M_MEDIAFOR = sola('public static InputMedia MediaFor(string wanted, string name, string mime, InputFileBase file, bool spoiler)', 'DesktopMessageEditMedia.cs');

// La orilla de Android, con las mismas firmas.
const J_TYPES = sola('static final String PHOTO = "photo";', 'MessageMediaEdit.java');
const J_NONE = sola('static final String NONE = "";', 'MessageMediaEdit.java');
const J_PHRASES = [sola('static final String REFUSED =', 'MessageMediaEdit.java'), sola('static final String NOT_MEDIA =', 'MessageMediaEdit.java'),
  sola('static final String ALBUM_TYPE =', 'MessageMediaEdit.java'), sola('static final String CHANGED =', 'MessageMediaEdit.java')];
const J_CURRENT = sola('static String currentKind(TdApi.MessageContent content) {', 'MessageMediaEdit.java');
const J_WANTED = sola('static String wantedKind(String mime) {', 'MessageMediaEdit.java');
const J_PROBLEM = sola('static String problem(boolean canEditMedia, String current, String wanted, long mediaAlbumId) {', 'MessageMediaEdit.java');
const J_ALBUM = sola('static boolean exchangeableInAlbum(String current, String wanted) {', 'MessageMediaEdit.java');
const J_CAPTION = sola('static TdApi.FormattedText captionOf(TdApi.MessageContent content) {', 'MessageMediaEdit.java');
const J_INVERT = sola('static boolean showsCaptionAboveMedia(TdApi.MessageContent content) {', 'MessageMediaEdit.java');
const J_SPOILER = sola('static boolean hasSpoiler(TdApi.MessageContent content) {', 'MessageMediaEdit.java');
const J_STREAMS = sola('static boolean streams(String mime) {', 'MessageMediaEdit.java');
const J_BRZO = sola('case "message.edit.media":editMessageMedia(p,a);break;', 'NativeBridge.java');
const J_FLAG = sola('"editMedia",props.canEditMedia&&!MessageMediaEdit.currentKind(message.content).isEmpty()', 'NativeBridge.java');

// El contrato y la pantalla, por la línea que la ronda tocó.
const C_CONTRACT = sola('editMedia?: boolean;', 'contract.ts');
const C_MENU = atApp('props.editMedia&&<MenuItem');
const C_FILA = en("'message.edit.media'", scope, 'desktopScope.ts');
const C_BANDERA = atPv('editMedia: own && !!message?.media,');

describe('ronda CK-B · el brazo del despacho', () => {
  it('la clave entra en la visera del `switch`, una sola vez y pegada a las otras dos caras de editar', () => {
    expect(CS_ARM).toBeGreaterThan(CS_HEAD);
    expect(CS_ARM).toBeLessThan(CS_GENERIC);
    expect(servrow(CS_ARM - 4)).toContain('"message.edit.caption" => await EditMessageAsync(args, caption: true),');
    expect(count(`"${KEY}" =>`, service)).toBe(1);
    expect(count('EditMessageMediaAsync', service)).toBe(2);
  });

  it('niega todo lo que puede decidir sin escribir, antes de pagar la subida', () => {
    const pasos = [
      'if (_client == null) throw new BridgeException("La cuenta no está conectada.");',
      'var ids = DesktopMessageDelete.Ids(new[] { Str(args, "id") }) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);',
      'if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)',
      'var entry = RequireEntry(_active);',
      'if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);',
      'if (DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids).Count != 1)',
      'if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);',
      'var wanted = DesktopMessageEditMedia.WantedKind(file.Mime);',
      'if (problem != null) throw new BridgeException(problem);',
    ];
    let anterior = -1;
    for (const paso of pasos) {
      const posicion = CS_METODO.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    const cobro = CS_METODO.indexOf('UploadFileAsync');
    expect(cobro).toBeGreaterThan(anterior);
    expect(CS_METODO.slice(0, CS_METODO.indexOf('if (problem != null)')).indexOf('UploadFileAsync')).toBe(-1);
    expect(CS_SUBIDA).toBeGreaterThan(CS_NEGADA);
    // Y las mismas negativas, medidas por número de línea: antes de leer la fila y mucho antes de cobrar.
    expect(CS_VAL).toBeLessThan(CS_LEER);
    expect(CS_PREPARO).toBeLessThan(CS_LEER);
    expect(CS_CLASE).toBeLessThan(CS_LEER);
    expect(CS_NEGADA).toBeLessThan(CS_SUBIDA);
  });

  it('el derecho no lo pregunta una propiedad de la red: lo decide el host sobre la fila recién leída', () => {
    expect(CS_METODO).not.toContain('GetMessageProperties');
    expect(CS_LEER).toBeLessThan(CS_IDA);
    expect(CS_DERECHO).toBeLessThan(CS_LEER);
    expect(servrow(CS_IDA)).toContain('DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed)');
    expect(servrow(CS_IDA + 1)).toContain('current, wanted, DesktopMessageEditMedia.GroupedId(fresh));');
    expect(servrow(CS_IDA - 1)).toContain('var current = DesktopMessageEditMedia.CurrentKind(fresh.media);');
    expect(mrow(M_CAN + 1)).toContain('(fresh.flags & Message.Flags.out_) != 0 || channelAllowed');
    expect(mrow(M_GROUPED + 1)).toContain('(message.flags & Message.Flags.has_grouped_id) != 0 ? message.grouped_id : 0L');
  });

  it('el pie viaja de vuelta tal cual, con sus entidades y con su bandera de encima del medio', () => {
    expect(servrow(CS_EDIT + 1)).toContain('message: DesktopMessageEditMedia.CaptionOf(fresh),');
    expect(servrow(CS_EDIT + 2)).toContain('media: media,');
    expect(servrow(CS_EDIT + 3)).toContain('entities: DesktopMessageEditMedia.CaptionEntitiesOf(fresh),');
    expect(servrow(CS_EDIT + 4)).toContain('invert_media: DesktopMessageEditMedia.ShowsCaptionAboveMedia(fresh));');
    expect(mrow(M_CAPTION)).toContain('=> message.message ?? "";');
    expect(mrow(M_ENTITIES)).toContain('=> message.entities ?? [];');
    expect(mrow(M_INVERT + 1)).toContain('(message.flags & Message.Flags.invert_media) != 0');
    // Aquí el pie no viaja dentro del medio: en esta versión ningún `InputMedia` tiene campo donde escribirlo.
    expect(cuerpo(mirror, 'public static InputMedia MediaFor(', 'DesktopMessageEditMedia.cs')).not.toContain('caption');
  });

  it('si la petición no cuaja no se tira nada; si cuaja se tira la copia y se releé el historial', () => {
    expect(CS_FALLA).toBeGreaterThan(CS_EDIT);
    expect(CS_TIRA).toBeGreaterThan(CS_EDIT);
    expect(service.slice(CS_EDIT - 1, CS_TIRA).join('\n')).toContain('catch (Exception ex)');
    expect(service.slice(CS_FALLA, CS_TIRA - 1).join('\n')).not.toContain('DropOutbox(token);');
    expect(CS_REFRESCA - CS_TIRA).toBe(3);
    expect(servrow(CS_TIRA + 1)).toContain('_historyDirty = true;');
    expect(servrow(CS_TIRA + 2)).toContain('_dialogsDirty = true;');
    expect(servrow(CS_END - 1)).toContain('return true;');
  });

  it('la subida y el envío van dentro de un solo `try`, con el medio armado antes de la petición', () => {
    expect(CS_MEDIO - CS_SUBIDA).toBe(1);
    expect(servrow(CS_MEDIO + 1)).toContain('DesktopMessageEditMedia.HasSpoiler(fresh.media));');
    expect(CS_EDIT - CS_MEDIO).toBe(2);
    expect(servrow(CS_SUBIDA - 2)).toBe('        try');
    expect(servrow(CS_SUBIDA - 1)).toBe('        {');
    expect(servrow(CS_SUBIDA + 8)).toBe('        }');
    expect(jrow(J_BRZO)).toContain('editMessageMedia(p,a);break;');
    expect(count('case "message.edit.media"', java)).toBe(1);
  });
});

describe('ronda CK-B · el espejo dice lo mismo que Android', () => {
  it('las cuatro negativas son idénticas carácter a carácter en las dos capas', () => {
    const frases = [REFUSED, NOT_MEDIA, ALBUM_TYPE, CHANGED];
    for (let i = 0; i < frases.length; i++) {
      expect(dichoDobles(mrow(M_PHRASES[i]), frases[i]), `DesktopMessageEditMedia.cs:${M_PHRASES[i]}`).toBe(frases[i]);
      expect(dichoDobles(prow(J_PHRASES[i]), frases[i]), `MessageMediaEdit.java:${J_PHRASES[i]}`).toBe(frases[i]);
    }
  });

  it('los cinco tipos se llaman igual en las dos capas, y el vacío también', () => {
    for (let i = 0; i < 5; i++) {
      expect(literal(mrow(M_TYPES + i)), `el tipo ${i} en Windows`).toBe(literal(prow(J_TYPES + i)));
    }
    expect(literal(mrow(M_NONE))).toBe(literal(prow(J_NONE)));
    expect(J_PHRASES[0] - J_NONE).toBe(3);
    expect(M_PHRASES[0] - M_NONE).toBe(2);
  });

  it('la clasificación por MIME sigue el mismo orden y ningún archivo se queda sin tipo', () => {
    const cs = cuerpo(mirror, 'public static string WantedKind(', 'DesktopMessageEditMedia.cs');
    const jv = cuerpo(pure, 'static String wantedKind(String mime)', 'MessageMediaEdit.java');
    const pares: [string, string][] = [
      ['return Animation;', 'return ANIMATION;'],
      ['return Photo;', 'return PHOTO;'],
      ['return Video;', 'return VIDEO;'],
      ['return Audio;', 'return AUDIO;'],
      ['return Document;', 'return DOCUMENT;'],
    ];
    let anteriorC = -1;
    let anteriorJ = -1;
    for (const [enC, enJ] of pares) {
      expect(cs.indexOf(enC), `${enC} falta o está fuera de orden en el espejo`).toBeGreaterThan(anteriorC);
      expect(jv.indexOf(enJ), `${enJ} falta o está fuera de orden en Android`).toBeGreaterThan(anteriorJ);
      expect(count(enC, cs), `${enC} se nombra dos veces en Windows`).toBe(1);
      expect(count(enJ, jv), `${enJ} se nombra dos veces en Android`).toBe(1);
      anteriorC = cs.indexOf(enC);
      anteriorJ = jv.indexOf(enJ);
    }
    expect(cs).not.toContain('return null');
    expect(count('return ', cs)).toBe(5);
    expect(count('return ', jv)).toBe(5);
  });

  it('el orden de negar es el de `problem`: primero la forma, luego el derecho, al final el álbum', () => {
    const cs = cuerpo(mirror, 'public static string? Problem(', 'DesktopMessageEditMedia.cs');
    const jv = cuerpo(pure, 'static String problem(boolean canEditMedia', 'MessageMediaEdit.java');
    expect(cs.indexOf('NotMedia')).toBeLessThan(cs.indexOf('Refused'));
    expect(cs.indexOf('Refused')).toBeLessThan(cs.indexOf('AlbumType'));
    expect(jv.indexOf('NOT_MEDIA')).toBeLessThan(jv.indexOf('REFUSED'));
    expect(jv.indexOf('REFUSED')).toBeLessThan(jv.indexOf('ALBUM_TYPE'));
    expect(cs).toContain('if (groupedId != 0 && !ExchangeableInAlbum(current, wanted)) return AlbumType;');
    expect(jv).toContain('if (mediaAlbumId != 0 && !exchangeableInAlbum(current, wanted)) return ALBUM_TYPE;');
    expect(count('return ', cs)).toBe(count('return ', jv));
  });

  it('dentro de un álbum la única pareja canjeable es foto y vídeo, en los dos sentidos', () => {
    expect(mrow(M_ALBUM + 1)).toContain('(current == Photo || current == Video) && (wanted == Photo || wanted == Video)');
    expect(prow(J_ALBUM + 1)).toContain('(current.equals(PHOTO) || current.equals(VIDEO)) && (wanted.equals(PHOTO) || wanted.equals(VIDEO))');
  });

  it('la lista de tipos admitidos es la misma en las dos capas y lo demás sale vacío', () => {
    // Los cinco nombres salen del mismo sitio en las dos capas: la foto es clase propia y los otros cuatro,
    // atributos del documento.
    expect(mrow(M_CURRENT + 2)).toContain('MessageMediaPhoto => Photo,');
    expect(mrow(M_CURRENT + 3)).toContain('MessageMediaDocument { document: Document document } => KindOf(document),');
    expect(mrow(M_CURRENT + 4)).toContain('_ => None,');
    const kind = cuerpo(mirror, 'private static string KindOf(', 'DesktopMessageEditMedia.cs');
    for (const tipo of ['Video', 'Audio', 'Animation', 'Document']) expect(count(`return ${tipo};`, kind), tipo).toBe(1);
    const jv = cuerpo(pure, 'static String currentKind(', 'MessageMediaEdit.java');
    for (const tipo of ['PHOTO', 'VIDEO', 'ANIMATION', 'AUDIO', 'DOCUMENT']) expect(count(`return ${tipo};`, jv), tipo).toBe(1);
    // Un sticker, una nota de voz y un videomensaje llegan como documento y salen vacíos, que es lo que hace
    // Android por clase de contenido: aquí se miden por atributo y en el mismo orden de exclusión.
    expect(kind.indexOf('DocumentAttributeSticker')).toBeLessThan(kind.indexOf('round_message'));
    expect(kind.indexOf('round_message')).toBeLessThan(kind.indexOf('Flags.voice'));
    expect(kind.indexOf('Flags.voice')).toBeLessThan(kind.indexOf('DocumentAttributeAnimated'));
    expect(count('return None;', kind)).toBe(3);
    expect(count('return NONE;', jv)).toBe(1);
  });

  it('la entrada del menú pide las dos cosas de siempre: derecho y un medio de los cinco', () => {
    expect(mrow(M_OFFERED + 1)).toContain('(outgoing || channelAllowed) && current != None');
    expect(jrow(J_FLAG)).toContain('props.canEditMedia&&!MessageMediaEdit.currentKind(message.content).isEmpty()');
    expect(M_OFFERED).toBeGreaterThan(M_CAN);
    expect(count('Offered(', service)).toBe(1);
  });

  it('las banderas que en TDLib viven dentro del contenido son aquí banderas del mensaje y del medio', () => {
    expect(mrow(M_INVERT + 1)).toContain('Message.Flags.invert_media');
    expect(prow(J_INVERT + 1)).toContain('showCaptionAboveMedia');
    expect(cuerpo(mirror, 'public static bool HasSpoiler(', 'DesktopMessageEditMedia.cs')).toContain('MessageMediaPhoto.Flags.spoiler');
    expect(cuerpo(pure, 'static boolean hasSpoiler(', 'MessageMediaEdit.java')).toContain('hasSpoiler');
    const media = cuerpo(mirror, 'public static InputMedia MediaFor(', 'DesktopMessageEditMedia.cs');
    expect(mrow(M_MEDIAFOR)).toContain('InputFileBase file, bool spoiler)');
    expect(mrow(M_MEDIAFOR + 2)).toContain('if (wanted == Photo)');
    expect(media.indexOf('InputMediaUploadedPhoto')).toBeLessThan(media.indexOf('InputMediaUploadedDocument'));
    expect(media).toContain('DesktopAttachment.AttributesFor(name, mime)');
    expect(media).toContain('flags = spoiler ? InputMediaUploadedDocument.Flags.spoiler : default');
  });

  it('lo que Android mide y este host no puede medir está dicho en el archivo, no imitado', () => {
    expect(prow(J_STREAMS + 2)).toContain('video/mp4');
    expect(mirrorText).not.toContain('streams(');
    expect(mirrorText).toContain('supportsStreaming');
    expect(mirrorText).toContain('se queda dicho, no imitado');
    expect(J_STREAMS).toBeGreaterThan(J_SPOILER);
  });
});

describe('ronda CK-B · la bandera que pregunta la pantalla', () => {
  it('`message.properties` publica `editMedia` sin preguntar la red', () => {
    expect(servrow(CS_PROP)).toContain('DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,');
    expect(servrow(CS_PROP + 1)).toContain('kind == DesktopMessageDelete.Kind.Channel && DesktopMessageEdit.ChannelRightsToEdit(channel)');
    expect(servrow(CS_PROP + 2)).toContain('message?.MediaKind ?? DesktopMessageEditMedia.None);');
    expect(servrow(CS_FLAG)).toContain('editMedia = canEditMedia,');
    expect(CS_FLAG).toBeGreaterThan(CS_PROP);
    expect(contract.join('\n')).toContain('editCaption: boolean; editMedia?: boolean; caption: string;');
  });

  it('la clase del adjunto la anota la conversión y no viaja en el cable', () => {
    expect(servrow(CS_ANOTA)).toContain('dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);');
    expect(strow(CS_MARK)).toContain('public string MediaKind { get; set; } = "";');
    expect(strow(CS_MARK - 1)).toContain('[JsonIgnore]');
    expect(count('MediaKind', service)).toBe(2);
    expect(CS_ANOTA).toBeGreaterThan(CS_FLAG);
  });
});

describe('ronda CK-B · la pantalla y el aviso de alcance', () => {
  it('la clave salió de la fila pendiente y entró en la afirmada, dicha una sola vez', () => {
    const fila = en("'message.edit.media'", scope, 'desktopScope.ts');
    expect(scrow(fila)).toContain("label: 'editar, borrar y reenviar mensajes'");
    expect(count("'message.edit.media'", scope)).toBe(1);
    expect(scope.slice(0, fila).join('\n')).toContain('DESKTOP_AVAILABLE');
    expect(scope.slice(0, fila).join('\n')).not.toContain('DESKTOP_PENDING');
    expect(desktopGapRefusal(KEY)).toBeUndefined();
  });

  it('la pantalla ofrece la entrada en las dos capas', () => {
    const fila = atApp('props.editMedia&&<MenuItem');
    expect(arow(fila)).toContain('label="Cambiar el archivo del mensaje"');
    expect(arow(fila)).not.toContain('!desktop');
    expect(arow(fila)).toContain('onClick={()=>replaceMessageMedia(message,props)}');
    expect(fila).toBeLessThan(atApp('function replaceMessageMedia('));
  });

  it('el andamio publica la bandera con la forma de la fila y no modela la orden en ninguna capa', () => {
    const fila = atPv('editMedia: own && !!message?.media,');
    expect(pvrow(fila)).toContain('editMedia: own && !!message?.media,');
    expect(count('message.edit.media', preview)).toBe(0);
    expect(pvrow(fila - 9)).toContain('La tercera —`editMedia`— es en Android');
  });
});

describe('ronda CK-B · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'MessageMediaEdit.java:32': 'static final String PHOTO = "photo";',
    'MessageMediaEdit.java:38': 'static final String NONE = "";',
    'MessageMediaEdit.java:41': 'static final String REFUSED =',
    'MessageMediaEdit.java:43': 'static final String NOT_MEDIA =',
    'MessageMediaEdit.java:45': 'static final String ALBUM_TYPE =',
    'MessageMediaEdit.java:47': 'static final String CHANGED =',
    'MessageMediaEdit.java:53': 'static String currentKind(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:67': 'static String wantedKind(String mime) {',
    'MessageMediaEdit.java:81': 'static String problem(boolean canEditMedia, String current, String wanted, long mediaAlbumId) {',
    'MessageMediaEdit.java:89': 'static boolean exchangeableInAlbum(String current, String wanted) {',
    'MessageMediaEdit.java:119': 'static boolean hasSpoiler(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:131': 'static boolean streams(String mime) {',
    'DesktopMessageEditMedia.cs:48': 'public const string Refused =',
    'DesktopMessageEditMedia.cs:49': 'public const string NotMedia =',
    'DesktopMessageEditMedia.cs:50': 'public const string AlbumType =',
    'DesktopMessageEditMedia.cs:51': 'public const string Changed =',
    'DesktopMessageEditMedia.cs:58': 'public static string CurrentKind(MessageMedia? media) => media switch',
    'DesktopMessageEditMedia.cs:65': 'private static string KindOf(Document document)',
    'DesktopMessageEditMedia.cs:83': 'public static string WantedKind(string? mime)',
    'DesktopMessageEditMedia.cs:96': 'public static string? Problem(bool canEditMedia, string current, string wanted, long groupedId)',
    'DesktopMessageEditMedia.cs:105': 'public static bool ExchangeableInAlbum(string current, string wanted) =>',
    'DesktopMessageEditMedia.cs:115': 'public static bool CanEditMedia(Message fresh, bool channelAllowed) =>',
    'DesktopMessageEditMedia.cs:122': 'public static bool Offered(bool outgoing, bool channelAllowed, string current) =>',
    'DesktopMessageEditMedia.cs:128': 'public static string CaptionOf(Message message) => message.message ?? "";',
    'DesktopMessageEditMedia.cs:134': 'public static bool ShowsCaptionAboveMedia(Message message) =>',
    'DesktopMessageEditMedia.cs:139': 'public static bool HasSpoiler(MessageMedia? media) => media switch',
    'DesktopMessageEditMedia.cs:149': 'public static InputMedia MediaFor(string wanted, string name, string mime, InputFileBase file, bool spoiler)',
    'TelegramService.cs:325': '"message.edit.media" => await EditMessageMediaAsync(args),',
    'TelegramService.cs:1812': 'if (_client == null) throw new BridgeException("La cuenta no está conectada.");',
    'TelegramService.cs:1818': 'if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)',
    'TelegramService.cs:1825': 'if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);',
    'TelegramService.cs:1832': 'var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });',
    'TelegramService.cs:1846': 'var problem = DesktopMessageEditMedia.Problem(DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed),',
    'TelegramService.cs:1852': 'var uploaded = await client.UploadFileAsync(file.Path, null);',
    'TelegramService.cs:1855': 'await client.Messages_EditMessage(entry.Input, ids[0],',
    'TelegramService.cs:1856': 'message: DesktopMessageEditMedia.CaptionOf(fresh),',
    'TelegramService.cs:1858': 'entities: DesktopMessageEditMedia.CaptionEntitiesOf(fresh),',
    'TelegramService.cs:1859': 'invert_media: DesktopMessageEditMedia.ShowsCaptionAboveMedia(fresh));',
    'TelegramService.cs:1865': 'throw new BridgeException("No se confirmó la edición en Telegram. " + message, ex);',
    'TelegramService.cs:1867': 'DropOutbox(token);',
    'TelegramService.cs:3196': 'var canEditMedia = DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,',
    'TelegramService.cs:3218': 'editMedia = canEditMedia,',
    'TelegramService.cs:3440': 'dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);',
    'NativeBridge.java:831': 'case "message.edit.media":editMessageMedia(p,a);break;',
    'NativeBridge.java:4326': '"editMedia",props.canEditMedia&&!MessageMediaEdit.currentKind(message.content).isEmpty()',
    // La cita la escribió la ronda CD en el comentario de `PropertiesAsync`, dentro del archivo que esta ronda vigila.
    'NativeBridge.java:4329': 'result.put("allowCustom",value.allowCustomEmoji)',
    'DesktopState.cs:191': 'public string MediaKind { get; set; } = "";',
    'App.tsx:1074': '{props.editMedia&&<MenuItem icon={<FileText/>} label="Cambiar el archivo del mensaje"',
    'desktopScope.ts:28': "'message.edit', 'message.edit.caption', 'message.edit.media',",
    'preview.ts:401': 'editMedia: own && !!message?.media,',
  };

  /** Las anclas que solo son únicas dentro del cuerpo de su método, con el cuerpo medido por balance de llaves. */
  const dentro: Record<string, [number, number]> = {
    'TelegramService.cs:1812': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1818': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1825': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1832': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1846': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1852': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1855': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1856': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1858': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1859': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1865': [CS_BODY - 1, CS_END + 1],
    'TelegramService.cs:1867': [CS_BODY - 1, CS_END + 1],
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CF, CM, CN, CI, CJ, CK y CN-B. */
  const watched: [string, string][] = [
    ['rondaCKB.test.ts', text('./rondaCKB.test.ts').split('const text =')[0]],
    ['TelegramService.cs brazo', service.slice(CS_ARM - 4, CS_ARM).join('\n')],
    ['TelegramService.cs cuerpo', service.slice(CS_BODY - 1, CS_END).join('\n')],
    ['TelegramService.cs propiedades', service.slice(CS_PROP - 4, CS_FLAG).join('\n')],
    ['TelegramService.cs conversión', service.slice(CS_ANOTA - 2, CS_ANOTA + 1).join('\n')],
    ['DesktopMessageEditMedia.cs tipos y frases', mirror.slice(M_TYPES - 2, M_PHRASES[3]).join('\n')],
    ['DesktopMessageEditMedia.cs CurrentKind', mirror.slice(M_CURRENT - 5, M_CURRENT + 5).join('\n')],
    ['DesktopMessageEditMedia.cs KindOf', mirror.slice(M_KINDOF - 1, M_KINDOF + 12).join('\n')],
    ['DesktopMessageEditMedia.cs WantedKind', mirror.slice(M_WANTED - 5, M_WANTED + 8).join('\n')],
    ['DesktopMessageEditMedia.cs Problem', mirror.slice(M_PROBLEM - 4, M_PROBLEM + 6).join('\n')],
    ['DesktopMessageEditMedia.cs Offered', mirror.slice(M_CAN - 4, M_OFFERED + 1).join('\n')],
    ['DesktopMessageEditMedia.cs Spoiler', mirror.slice(M_SPOILER - 2, M_SPOILER + 5).join('\n')],
    ['MessageMediaEdit.java tipos', pure.slice(J_TYPES - 1, J_TYPES + 4).join('\n')],
    ['MessageMediaEdit.java frases', [prow(J_PHRASES[0]), prow(J_PHRASES[1]), prow(J_PHRASES[2]), prow(J_PHRASES[3])].join('\n')],
    ['MessageMediaEdit.java kinds', pure.slice(J_CURRENT - 1, J_CURRENT + 5).join('\n')],
    ['MessageMediaEdit.java wanted', pure.slice(J_WANTED - 1, J_WANTED + 6).join('\n')],
    ['MessageMediaEdit.java problem', pure.slice(J_PROBLEM - 1, J_PROBLEM + 4).join('\n')],
    ['MessageMediaEdit.java album', pure.slice(J_ALBUM - 1, J_ALBUM + 1).join('\n')],
    ['MessageMediaEdit.java caption', pure.slice(J_CAPTION, J_CAPTION + 6).join('\n')],
    ['MessageMediaEdit.java banderas', pure.slice(J_INVERT - 1, J_INVERT + 3).join('\n')],
    ['MessageMediaEdit.java streams', pure.slice(J_STREAMS, J_STREAMS + 3).join('\n')],
    ['NativeBridge.java brazo', jrow(J_BRZO)],
    ['NativeBridge.java bandera', jrow(J_FLAG)],
    ['DesktopState.cs marca', stateCs.slice(CS_MARK - 5, CS_MARK + 1).join('\n')],
    ['App.tsx menú', arow(C_MENU)],
    ['desktopScope.ts fila', scrow(C_FILA)],
    ['preview.ts bandera', preview.slice(C_BANDERA - 5, C_BANDERA).join('\n')],
    ['contract.ts bandera', contract.slice(C_CONTRACT - 1, C_CONTRACT).join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const row = bodies[file]?.[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const [, body] of watched)
    for (const match of body.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj|css)):(\d+)(?:-(\d+))?/g))
      written.set(`${match[1]}:${match[2]}`, Math.max(written.get(`${match[1]}:${match[2]}`) ?? 0, Number(match[3] ?? 0)));

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('ninguna ancla se cita dos veces con cifras que no coinciden, y ninguna cifra se cita sin ancla', () => {
    for (const citation of written.keys()) expect(anchors[citation], `${citation} no está en la tabla de anclas`).toBeTypeOf('string');
    for (const citation of Object.keys(anchors)) expect(written.has(citation), `${citation} no lo cita nadie`).toBe(true);
  });

  it('ninguna cifra se escribe de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      const [desde = 0, hasta = Number.POSITIVE_INFINITY] = dentro[citation] ?? [];
      expect(sola(needle, file, desde, hasta), `${citation} medido`).toBe(Number(n));
    }
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    // Medido hoy con `split(/\r?\n/).length`: la CK-B escribió el brazo y su método en el despacho —noventa y siete
    // líneas sobre lo que dejó la CN-B—, la marca `MediaKind` en el estado —ocho— y sacó dos líneas del aviso de
    // alcance. `MessageMediaEdit.java`, `NativeBridge.java` y `App.tsx` son los que dejó la tanda CK y la CL. La
    // ronda CD sumó diez líneas al despacho —el brazo de `premium.state` con su comentario, la bandera `customReaction`
    // con el suyo y el comentario que dice las dos caras de `allowCustom`— y seis al alcance: la fila de la marca con
    // su comentario, sin quitar ninguna de las pendientes. La ronda CE sumó treinta y siete líneas al despacho —el
    // `ParseEntities` reescrito con el techo de cien y sus dos ayudantes de negativa, la vuelta de la entidad con la
    // cifra del emoji y la dirección materializada, y el parseo por delante de la marca de envío— y tres al estado con
    // la `CustomEmojiId` del DTO y su comentario; doce más, los dos ayudantes de la ronda CW-D.
    // Veinticuatro más, repartidas entre los fondos de la CH-A y el aviso `UpdateDefaultBackground` de la CH-A2.
    expect(service).toHaveLength(4301);
    expect(mirror).toHaveLength(166);
    expect(stateCs).toHaveLength(691);
    expect(pure).toHaveLength(136);
    expect(java).toHaveLength(5425);
    expect(app).toHaveLength(1557);
    expect(scope).toHaveLength(113);
    expect(preview).toHaveLength(3252);
    expect(contract).toHaveLength(250);
  });
});
