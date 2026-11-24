import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CN-B — la foto de cada opción de una encuesta también en Windows.
 *
 * CN escribió el medio por opción en Android y dejó dicho el hueco del escritorio con las líneas que lo
 * demostraban. Esta ronda lo cierra, y lo cierra con las dos peticiones que la librería pide, no con una simulación.
 *
 * Lo primero que se midió fue la forma del cable, campo a campo sobre el ensamblado empaquetado de `WTelegramClient`
 * 4.4.10 con la sonda `.tools/cnbprobe`: `TL.PollAnswer` declara `text`, `option`, `media`, `added_by` y `date`,
 * mientras `TL.InputPollAnswer` —el constructor de ida, el que se manda— solo declara `text` y `media`, **sin campo
 * `option`**. De ahí salen las dos consecuencias que mandan el resto: con fotos no hay clave que inventar en el
 * cliente (`TelegramService.cs:2532`), porque la opaca la pone Telegram en la fila que devuelve, y la foto no puede
 * viajar como archivo suelto: tiene que convertirse en medio de conversación con `messages.uploadMedia`
 * (`TelegramService.cs:2585`), que es la que devuelve el `photo` con su `access_hash` y su `file_reference` —los tres
 * campos del `inputPhoto` que la encuesta cita en `TelegramService.cs:2595`—.
 *
 * Las negativas nuevas van en el orden en que Android las escribió, medido por posición y no de memoria: el recuento
 * de opciones corta antes (`TelegramService.cs:2500`), luego caducidad del vale (`TelegramService.cs:2511`) con su
 * tipo de archivo (la línea siguiente), luego el todo o nada y solo después el texto de cada opción y las repetidas. Ese orden es el del brazo de Android, medido hoy: la validación del vale —cuenta, chat y tipo de archivo— en `NativeBridge.java:4760`, el todo o nada en `NativeBridge.java:4761` y el montaje con la foto en `NativeBridge.java:4763`.
 * El todo o nada no es un capricho de esta capa: Telegram no admite una encuesta con fotos en tres opciones y la
 * cuarta vacía, y la frase es la misma carácter a carácter en Java, C# y el espejo (`preview.ts:1111`). Las dos
 * subidas —`upload.saveFilePart` dentro de `UploadFileAsync` y ese mismo archivo vuelta a `messages.uploadMedia`— van
 * dentro del `try` y detrás de la última negativa, para no pagar una subida por una encuesta ya rechazada: el mismo
 * orden que el álbum de la ronda AL.
 *
 * Al leer manda la bandera: `DesktopPoll.cs:427` solo da por hecha una foto si `has_media` está puesta, y
 * `DesktopPoll.cs:437` devuelve el `photo` cuando el medio es una foto y `null` en cualquier otro caso. Los demás
 * tipos que la librería declara para su `PollMedia` se quedan sin pintar y no se disfraza ninguno, que es justo lo
 * que hace Android en `NativeSnapshot.java:441`. La fila del DTO (`DesktopState.cs:299`) lleva la foto registrada
 * con el nombre de la opción (`TelegramService.cs:2980`), la misma palabra que pone Android en
 * `NativeSnapshot.java:435`.
 *
 * En la pantalla el botón ya no se apaga en escritorio (`App.tsx:1177`): lo que queda fuera es el chat sin abrir y
 * el que no es comunidad. El andamio copia la decisión entera —las tres negativas nuevas, su orden, y la fila espejo
 * que deja el medio sin escribir cuando no hay vale (`preview.ts:1145`)—, y el nombre con el que se pinta la foto
 * está escrito una sola vez en cada capa. Lo que manda la pantalla es un array paralelo con huecos vacíos\n * (`BatchPanels.tsx:94`), que es lo que las dos capas leen por posición. Lo que sigue sin medio es la encuesta que monta el\n * teclado de un bot: ese
 * brazo no recibe adjuntos y esta compuerta lo comprueba para que no se cueza como si estuviera hecho.
 *
 * Dos cosas dichas en voz alta. No hay prueba JVM nueva: las guardas de Windows viven dentro del brazo del puente,
 * como en CF y CM, y las defienden esta compuerta y el espejo, no `testDebugUnitTest`. Y nada de esto se ha ejercido
 * contra una cuenta real —escribir en Telegram está fuera de la tanda—, así que lo probado es que las tres capas
 * cuadran, no que el mensaje salga.
 *
 * Como en CF, CB, CM, CN, BM, BY, BZ y CI: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda
 * tiene que estar en la tabla y señalar hoy la línea que la frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const bodies: Record<string, string[]> = {
  'TelegramService.cs': rows(`${host}TelegramService.cs`),
  'DesktopPoll.cs': rows(`${host}DesktopPoll.cs`),
  'DesktopState.cs': rows(`${host}DesktopState.cs`),
  'MediaRegistry.cs': rows(`${host}MediaRegistry.cs`),
  'NativeBridge.java': rows(`${javaDir}NativeBridge.java`),
  'NativeSnapshot.java': rows(`${javaDir}NativeSnapshot.java`),
  'preview.ts': rows('./preview.ts'),
  'BatchPanels.tsx': rows('./BatchPanels.tsx'),
  'App.tsx': rows('./App.tsx'),
  'contract.ts': rows('./contract.ts'),
};
const service = bodies['TelegramService.cs'];
const pollCs = bodies['DesktopPoll.cs'];
const stateCs = bodies['DesktopState.cs'];
const registry = bodies['MediaRegistry.cs'];
const java = bodies['NativeBridge.java'];
const snapshot = bodies['NativeSnapshot.java'];
const preview = bodies['preview.ts'];
const batch = bodies['BatchPanels.tsx'];
const app = bodies['App.tsx'];
const contract = bodies['contract.ts'];

function en(needle: string, body: string[], where: string) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
/**
 * La línea de una frase, contada de verdad sobre el archivo. `desde` y `hasta` encierran el trecho que la ronda
 * tocó: fuera de él la misma frase puede salir en otro brazo, y entonces la cifra citada no diría nada.
 */
function sola(needle: string, file: string, desde = 0, hasta = Number.POSITIVE_INFINITY) {
  const hits = bodies[file].map((row, i) => (i + 1 > desde && i + 1 < hasta && row.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${file} dice ${needle} en ${hits.join(',') || 'ninguna'} entre ${desde} y ${hasta}`);
  return hits[0];
}
const donde = (needle: string, body: string[]) => body.map((row, i) => (row.includes(needle) ? i + 1 : 0)).filter(Boolean);
const atServ = (n: string) => en(n, service, 'TelegramService.cs');
const atState = (n: string) => en(n, stateCs, 'DesktopState.cs');
const atJava = (n: string) => en(n, java, 'NativeBridge.java');
const atSnap = (n: string) => en(n, snapshot, 'NativeSnapshot.java');
const atPv = (n: string) => en(n, preview, 'preview.ts');

const servrow = (n: number) => service[n - 1] ?? '';
const prow = (n: number) => pollCs[n - 1] ?? '';
const strow = (n: number) => stateCs[n - 1] ?? '';
const rrow = (n: number) => registry[n - 1] ?? '';
const jrow = (n: number) => java[n - 1] ?? '';
const srow = (n: number) => snapshot[n - 1] ?? '';
const pvrow = (n: number) => preview[n - 1] ?? '';
const brow = (n: number) => batch[n - 1] ?? '';
const arow = (n: number) => app[n - 1] ?? '';
const drow = (n: number) => contract[n - 1] ?? '';

/** El literal entrecomiladado que contiene una frase, para comparar orillas carácter a carácter. */
function dichoDobles(row: string, needle: string) {
  const at = row.indexOf(needle);
  if (at < 0) throw new Error(`${needle} no está en ${row.trim()}`);
  return row.slice(row.lastIndexOf('"', at) + 1, row.indexOf('"', at + needle.length));
}
function dichoSimples(row: string, needle: string) {
  const at = row.indexOf(needle);
  if (at < 0) throw new Error(`${needle} no está en ${row.trim()}`);
  return row.slice(row.lastIndexOf("'", at) + 1, row.indexOf("'", at + needle.length));
}

const NADIR = 'Una encuesta con imágenes lleva una imagen en cada opción.';
const CAMBIO = 'La conversación cambió. Vuelve a elegir las imágenes de las opciones.';
const TIPO = 'Cada opción admite una foto JPG, PNG o WebP.';
const NOMBRE = 'Foto de la opción';

// Los dos brazos que montan opciones de encuesta, medidos por su cabecera: todo lo de dentro se busca entre ellas.
const CS_BRAZO = atServ('private async Task<object?> SendPollAsync(');
const CS_PICTURAS = sola('var pictures = DesktopPoll.Photos(Arr(args, "media"));', 'TelegramService.cs', CS_BRAZO);
const CS_ULTIMA = sola('if (DesktopPoll.HasDescription(Str(args, "description")))', 'TelegramService.cs', CS_BRAZO);
const CS_MONTAJE = sola('var poll = new TL.Poll', 'TelegramService.cs', CS_BRAZO);
const CS_SUBIDA = sola('var uploaded = await client.UploadFileAsync(photos[position].Path, null);', 'TelegramService.cs', CS_BRAZO);
const CS_ENVIO = sola('await client.Messages_SendMedia(entry.Input, media, "", Random.Shared.NextInt64(1, long.MaxValue),', 'TelegramService.cs', CS_SUBIDA, CS_SUBIDA + 20);
const CS_TIRADA = sola('foreach (var token in pictures) DropOutbox(token);', 'TelegramService.cs', CS_ENVIO, CS_ENVIO + 10);
const CS_PEGADA = sola('id = picture.id, access_hash = picture.access_hash, file_reference = picture.file_reference', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
const CS_LEER = sola('Media = DesktopPoll.PhotoOf(answers[position]) is { } picture', 'TelegramService.cs', CS_ENVIO);

const JAVA_BRAZO = atJava('void sendPoll(JSONObject p,Answer a)throws Exception{');
const JAVA_CIERRE = sola('TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();', 'NativeBridge.java', JAVA_BRAZO, JAVA_BRAZO + 20);
const JAVA_OPCIONES = sola('TdApi.InputPollOption[] options=new TdApi.InputPollOption[values.length()]', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE);
const JAVA_ENVIO = sola('session.sendContent(poll,BridgePolicy.id(p,"reply")', 'NativeBridge.java', JAVA_BRAZO);
const BOT_BRAZO = atJava('private void createPollForBot(TdApi.Message message,TdApi.KeyboardButtonTypeRequestPoll requested,Answer answer){');
const BOT_OPCION = sola('poll.options[i]=new TdApi.InputPollOption(new TdApi.FormattedText(values.get(i),new TdApi.TextEntity[0]),null)', 'NativeBridge.java', BOT_BRAZO - 1);

const PV_BRAZO = atPv('function desktopPollSend(params: Record<string, unknown>, state: State) {');
const PV_FILA = sola('options: options.map((text, index) => ({ index,', 'preview.ts', PV_BRAZO);

const SNAP_REPARTO = atSnap('JSONObject pollMedia(TdApi.PollMedia value)throws Exception{');
const SNAP_SALIDA = atSnap('JSONObject miniOnly(TdApi.Minithumbnail mini,String name)throws Exception{');
const STATE_CLASE = atState('public sealed class PollOptionDto');
const STATE_MARCA = sola('public MediaDto? Media { get; set; }', 'DesktopState.cs', STATE_CLASE);

describe('ronda CN-B · Windows sube la foto por opción', () => {
  it('la foto viaja por `messages.uploadMedia`, pegada a la subida del archivo', () => {
    const conversor = sola('var stored = await client.Messages_UploadMedia(', 'TelegramService.cs', CS_BRAZO);
    expect(conversor - CS_SUBIDA).toBe(1);
    expect(service.slice(conversor - 1, conversor + 1).join('\n')).toContain('new InputMediaUploadedPhoto { file = uploaded }');
    expect(servrow(CS_SUBIDA - 2)).toContain('for (var position = 0; position < photos.Length; position++)');
  });

  it('el medio se engancha por posición, con la bandera puesta junto a su campo', () => {
    const cast = sola('var answer = (InputPollAnswer)answers[position];', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
    const bandera = sola('answer.flags |= InputPollAnswer.Flags.has_media;', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
    const campo = sola('answer.media = new InputMediaPhoto', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
    expect(bandera - cast).toBe(1);
    expect(campo - bandera).toBe(1);
    expect(CS_PEGADA - campo).toBe(4);
  });

  it('el `inputPhoto` lleva los tres campos que devuelve la conversión', () => {
    expect(servrow(CS_PEGADA)).toContain('id = picture.id');
    expect(servrow(CS_PEGADA)).toContain('access_hash = picture.access_hash');
    expect(servrow(CS_PEGADA)).toContain('file_reference = picture.file_reference');
    const foto = sola('if (stored is not MessageMediaPhoto { photo: Photo picture })', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
    expect(foto).toBeLessThan(CS_PEGADA);
    expect(servrow(foto + 1)).toContain('throw new BridgeException(DesktopPoll.NotPhoto);');
  });

  it('si la conversión no devuelve una foto, se niega con la misma frase que Android', () => {
    const negar = sola('if (stored is not MessageMediaPhoto { photo: Photo picture })', 'TelegramService.cs', CS_SUBIDA, CS_ENVIO);
    expect(servrow(negar + 1)).toContain('throw new BridgeException(DesktopPoll.NotPhoto);');
    expect(dichoDobles(prow(sola('public const string NotPhoto =', 'DesktopPoll.cs')), TIPO)).toBe(TIPO);
    expect(dichoDobles(jrow(sola('JSONArray media=p.optJSONArray("media")', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE)), TIPO)).toBe(TIPO);
  });

  it('las dos subidas van detrás de la última negativa, para no pagar una encuesta rechazada', () => {
    expect(CS_SUBIDA).toBeGreaterThan(CS_ULTIMA);
    expect(CS_ENVIO).toBeGreaterThan(CS_SUBIDA);
    expect(service.slice(CS_ULTIMA, CS_SUBIDA - 1).some(row => row.trim() === 'try')).toBe(true);
  });

  it('el vale se tira después del envío, igual que en Android', () => {
    expect(CS_TIRADA).toBeGreaterThan(CS_ENVIO);
    expect(jrow(JAVA_ENVIO)).toContain('attachments.remove(token)');
    expect(jrow(JAVA_ENVIO)).toContain('Files.deleteIfExists(item.path.toPath())');
  });

  it('con fotos no se sortea clave: la opaca la pone Telegram en la fila que devuelve', () => {
    const claves = sola('var keys = pictures.Length > 0 ? null : DesktopPoll.OptionKeys(options.Length);', 'TelegramService.cs', CS_BRAZO);
    expect(servrow(claves)).toContain('pictures.Length > 0 ? null');
    expect(prow(sola('public static PollAnswerBase Answer(string option, string? key)', 'DesktopPoll.cs'))).toContain('=> key == null');
    expect(prow(sola('? new InputPollAnswer { text = new TextWithEntities', 'DesktopPoll.cs'))).not.toContain('option =');
    expect(prow(sola(': new PollAnswer { option = key, text = new TextWithEntities', 'DesktopPoll.cs'))).toContain('option = key');
  });

  it('el brazo de escritorio guarda las dos clases de respuesta en el mismo array', () => {
    const array = sola('var answers = new PollAnswerBase[options.Length];', 'TelegramService.cs', CS_BRAZO);
    expect(servrow(array + 2)).toContain('answers[position] = DesktopPoll.Answer(options[position], keys?[position]);');
    expect(prow(sola('public static PollAnswer[] Options(TL.Poll poll)', 'DesktopPoll.cs'))).toContain('poll.answers.OfType<PollAnswer>().ToArray()');
  });

  it('los vales se leen sin inventarse un camino nuevo: salen del mismo selector del adjunto', () => {
    expect(servrow(CS_PICTURAS)).toContain('Arr(args, "media")');
    expect(prow(sola('public static string[] Photos(string[] raw)', 'DesktopPoll.cs'))).toContain('raw.Where(token => token.Length > 0)');
    expect(sola('if (!_outbox.TryGetValue(pictures[position], out var picked) ||', 'TelegramService.cs', CS_BRAZO, CS_ULTIMA)).toBeGreaterThan(CS_PICTURAS);
  });

  it('el teclado de un bot sigue montando la encuesta sin medio por opción', () => {
    expect(jrow(BOT_OPCION)).toContain(',null)');
    expect(jrow(BOT_OPCION)).not.toContain('InputPollMediaPhoto');
    expect(jrow(BOT_OPCION)).toContain('TdApi.FormattedText(values.get(i),new TdApi.TextEntity[0])');
  });
});

describe('ronda CN-B · Windows lee la foto por opción', () => {
  it('la bandera manda antes de mirar el campo', () => {
    expect(prow(sola('public static bool HasPhoto(PollAnswer answer)', 'DesktopPoll.cs'))).toContain('(answer.flags & PollAnswer.Flags.has_media) != 0');
    expect(prow(sola('public static Photo? PhotoOf(PollAnswer answer) =>', 'DesktopPoll.cs') + 1)).toContain('HasPhoto(answer) && answer.media is MessageMediaPhoto');
  });

  it('lo que no es foto se queda sin pintar, en las dos capas, y no se disfraza', () => {
    expect(prow(sola('public static Photo? PhotoOf(PollAnswer answer) =>', 'DesktopPoll.cs') + 1)).toContain('? photo : null');
    expect(srow(SNAP_REPARTO + 7)).toBe('        return null;');
    expect(donde('return null;', snapshot).length).toBeGreaterThan(1);
  });

  it('la fila del DTO saca la foto por la misma posición que el texto', () => {
    expect(servrow(CS_LEER + 1)).toContain('_media.RegisterPhoto(picture, DesktopPoll.OptionPhotoName, exportable)');
    expect(servrow(CS_LEER - 2)).toContain('Percentage = DesktopPoll.Percentage(votes, total)');
    expect(servrow(CS_LEER + 2)).toBe('                    : null');
    expect(rrow(sola('public MediaDto? RegisterPhoto(Photo photo, string name = "Foto", bool exportable = true)', 'MediaRegistry.cs'))).toContain('string name');
  });

  it('la marca del medio vive dentro de la clase de la opción', () => {
    expect(strow(STATE_CLASE)).toBe('public sealed class PollOptionDto');
    expect(STATE_MARCA).toBeGreaterThan(STATE_CLASE);
    expect(stateCs.slice(STATE_CLASE, STATE_MARCA - 1).every(row => row.trim() !== '}')).toBe(true);
    expect(donde('public MediaDto? Media { get; set; }', stateCs).length).toBeGreaterThan(1);
  });

  it('la misma palabra en las cuatro orillas que pintan la foto leída', () => {
    expect(dichoDobles(prow(sola('public const string OptionPhotoName =', 'DesktopPoll.cs')), NOMBRE)).toBe(NOMBRE);
    expect(dichoDobles(srow(sola('if(value instanceof TdApi.PollMediaPhoto)', 'NativeSnapshot.java')), NOMBRE)).toBe(NOMBRE);
    expect(dichoSimples(pvrow(sola('const OPTION_PHOTO_NAME =', 'preview.ts')), NOMBRE)).toBe(NOMBRE);
    expect(drow(sola('export interface PollOption', 'contract.ts'))).toContain('media?:Media');
  });

  it('el espejo del andamio pinta la foto por posición y deja el medio sin escribir cuando no hay vale', () => {
    expect(preview.slice(PV_FILA - 1, PV_FILA + 3).join('\n')).toContain('media: files.length === 0 ? undefined');
    expect(pvrow(PV_FILA + 3)).toContain('name: OPTION_PHOTO_NAME');
    expect(pvrow(PV_FILA + 3)).toContain('files[index].mime');
    expect(pvrow(PV_FILA + 3)).toContain('files[index].size');
  });
});

describe('ronda CN-B · el orden y las frases en las tres capas', () => {
  it('el recuento de fotos se decide con la misma regla en las tres capas', () => {
    expect(prow(sola('public static bool PhotosMatch(int photos, int options)', 'DesktopPoll.cs'))).toContain('photos == 0 || photos == options');
    expect(servrow(sola('if (!DesktopPoll.PhotosMatch(pictures.Length, options.Length))', 'TelegramService.cs', CS_BRAZO, CS_ULTIMA))).toContain('DesktopPoll.PhotosMatch');
    expect(jrow(sola('if(!images.isEmpty()&&images.size()!=values.length())', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE))).toContain('images.size()!=values.length()');
    expect(pvrow(sola('if (files.length > 0 && files.length !== options.length)', 'preview.ts', PV_BRAZO, PV_FILA))).toContain('files.length !== options.length');
  });

  it('las guardas de las fotos caen en el mismo sitio en C#, Java y el andamio', () => {
    const enCs = [
      sola('if (!DesktopPoll.Fits(options.Length))', 'TelegramService.cs', CS_BRAZO, CS_PICTURAS),
      sola('throw new BridgeException(DesktopPoll.ChangedPhotos);', 'TelegramService.cs', CS_PICTURAS, CS_ULTIMA),
      sola('if (!DesktopAttachment.IsPhoto(picked.Mime))', 'TelegramService.cs', CS_PICTURAS, CS_ULTIMA),
      sola('if (!DesktopPoll.PhotosMatch(pictures.Length, options.Length))', 'TelegramService.cs', CS_PICTURAS, CS_ULTIMA),
      sola('if (options.Any(option => !DesktopPoll.FitsOption(option)))', 'TelegramService.cs', CS_ULTIMA - 12, CS_ULTIMA),
      sola('if (DesktopPoll.Repeats(options))', 'TelegramService.cs', CS_ULTIMA - 12, CS_ULTIMA),
    ];
    expect(enCs[2] - enCs[1]).toBe(1);
    for (let position = 1; position < enCs.length; position++) expect(enCs[position]).toBeGreaterThan(enCs[position - 1]);
    const enJava = [
      sola('if(values.length()<2||values.length()>12)', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE),
      sola('JSONArray media=p.optJSONArray("media")', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE),
      sola('if(!images.isEmpty()&&images.size()!=values.length())', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE),
      sola('if(text.isEmpty()||text.length()>100)', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE),
    ];
    for (let position = 1; position < enJava.length; position++) expect(enJava[position]).toBeGreaterThan(enJava[position - 1]);
    const enAndamio = [
      sola('if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS)', 'preview.ts', PV_BRAZO, PV_FILA),
      sola('if (!file || file.account !== state.selfId || file.chat !== state.active)', 'preview.ts', PV_BRAZO, PV_FILA),
      sola('if (!attachmentIsPhoto(file.mime))', 'preview.ts', PV_BRAZO, PV_FILA),
      sola('if (files.length > 0 && files.length !== options.length)', 'preview.ts', PV_BRAZO, PV_FILA),
      sola('if (options.some(option => option.length === 0 || option.length > POLL_MAX_OPTION))', 'preview.ts', PV_BRAZO, PV_FILA),
    ];
    for (let position = 1; position < enAndamio.length; position++) expect(enAndamio[position]).toBeGreaterThan(enAndamio[position - 1]);
  });

  it('las tres frases nuevas son iguales carácter a carácter en las tres capas', () => {
    const frases: [string, string, string][] = [
      [CAMBIO, 'public const string ChangedPhotos =', 'changedPhotos'],
      [TIPO, 'public const string NotPhoto =', 'notPhoto'],
      [NADIR, 'public const string UnevenPhotos =', 'unevenPhotos'],
    ];
    for (const [frase, literal, clave] of frases) {
      expect(dichoDobles(prow(sola(literal, 'DesktopPoll.cs')), frase), literal).toBe(frase);
      expect(dichoDobles(jrow(sola(frase, 'NativeBridge.java', JAVA_BRAZO, JAVA_OPCIONES)), frase), frase).toBe(frase);
      expect(dichoSimples(pvrow(sola(`${clave}: '${frase}'`, 'preview.ts')), frase), clave).toBe(frase);
    }
  });

  it('el botón de la foto por opción ya no se apaga en escritorio', () => {
    const fila = sola('images={active!==undefined&&community(active)}', 'App.tsx');
    expect(arow(fila)).toContain('images={active!==undefined&&community(active)}');
    expect(arow(fila)).not.toContain('!desktop');
    expect(brow(sola('images=false', 'BatchPanels.tsx'))).toContain('images=false');
    expect(brow(sola('images&&<button', 'BatchPanels.tsx'))).toContain('Imagen de la opción');
    expect(brow(sola('!desktop&&<label className="field-label">Descripción', 'BatchPanels.tsx'))).toContain('!desktop');
  });

  it('la subida vive dentro del brazo que monta las opciones, no en un camino aparte', () => {
    expect(CS_SUBIDA).toBeGreaterThan(CS_BRAZO);
    expect(CS_SUBIDA).toBeGreaterThan(CS_MONTAJE);
    expect(JAVA_OPCIONES).toBeGreaterThan(JAVA_BRAZO);
    expect(jrow(JAVA_CIERRE)).toContain('poll.description=pollDescription(p)');
  });
});

describe('ronda CN-B · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'TelegramService.cs:2500': 'if (!DesktopPoll.Fits(options.Length))',
    'TelegramService.cs:2511': 'throw new BridgeException(DesktopPoll.ChangedPhotos);',
    'TelegramService.cs:2532': 'var keys = pictures.Length > 0 ? null : DesktopPoll.OptionKeys(options.Length);',
    'TelegramService.cs:2585': 'var stored = await client.Messages_UploadMedia(',
    'TelegramService.cs:2595': 'id = picture.id, access_hash = picture.access_hash, file_reference = picture.file_reference',
    'TelegramService.cs:2980': '? _media.RegisterPhoto(picture, DesktopPoll.OptionPhotoName, exportable)',
    'DesktopPoll.cs:427': 'public static bool HasPhoto(PollAnswer answer)',
    'DesktopPoll.cs:437': 'public static Photo? PhotoOf(PollAnswer answer) =>',
    'DesktopState.cs:299': 'public MediaDto? Media { get; set; }',
    'NativeSnapshot.java:435': 'if(value instanceof TdApi.PollMediaPhoto)',
    'NativeSnapshot.java:441': '        return null;',
    'NativeBridge.java:4760': 'JSONArray media=p.optJSONArray("media")',
    'NativeBridge.java:4761': 'if(!images.isEmpty()&&images.size()!=values.length())',
    'NativeBridge.java:4763': 'images.isEmpty()?null:new TdApi.InputPollMediaPhoto',
    'BatchPanels.tsx:94': "media:pictures.map(item=>item||'')",
    'preview.ts:1111': 'if (files.length > 0 && files.length !== options.length)',
    'preview.ts:1145': 'media: files.length === 0 ? undefined',
    'App.tsx:1177': 'images={active!==undefined&&community(active)}',
  };

  /** Las citas que solo son únicas dentro de su bloque, con el bloque medido por contenido. */
  const dentro: Record<string, [number, number]> = {
    'DesktopState.cs:299': [STATE_CLASE, Number.POSITIVE_INFINITY],
    'NativeSnapshot.java:441': [SNAP_REPARTO, SNAP_SALIDA],
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CF, CB, CM, CN, BM y BY. */
  const watched: [string, string][] = [
    ['rondaCNB.test.ts', text('./rondaCNB.test.ts').split('const text =')[0]],
    ['TelegramService.cs negativas', service.slice(CS_PICTURAS - 7, CS_ULTIMA).join('\n')],
    ['TelegramService.cs clave', service.slice(CS_ULTIMA, CS_MONTAJE).join('\n')],
    ['TelegramService.cs subida', service.slice(CS_ENVIO - 26, CS_TIRADA + 1).join('\n')],
    ['TelegramService.cs lectura', service.slice(CS_LEER - 8, CS_LEER + 3).join('\n')],
    ['DesktopPoll.cs frases', pollCs.slice(sola('public const string Batch =', 'DesktopPoll.cs'), sola('public const string OptionPhotoName =', 'DesktopPoll.cs') + 1).join('\n')],
    ['DesktopPoll.cs Photos', pollCs.slice(sola('public static string[] Photos(string[] raw)', 'DesktopPoll.cs') - 4, sola('public static bool PhotosMatch(int photos, int options)', 'DesktopPoll.cs')).join('\n')],
    ['DesktopPoll.cs Answer', pollCs.slice(sola('public static PollAnswerBase Answer(string option, string? key)', 'DesktopPoll.cs') - 11, sola(': new PollAnswer { option = key, text = new TextWithEntities', 'DesktopPoll.cs')).join('\n')],
    ['DesktopPoll.cs PhotoOf', pollCs.slice(sola('public static bool HasPhoto(PollAnswer answer)', 'DesktopPoll.cs') - 3, sola('HasPhoto(answer) && answer.media is MessageMediaPhoto', 'DesktopPoll.cs')).join('\n')],
    ['DesktopState.cs marca', stateCs.slice(STATE_MARCA - 7, STATE_MARCA + 1).join('\n')],
    ['NativeBridge.java fotos', java.slice(sola('JSONArray values=p.getJSONArray("options")', 'NativeBridge.java', JAVA_BRAZO, JAVA_CIERRE) - 1, JAVA_OPCIONES + 1).join('\n')],
    ['NativeBridge.java envio', java.slice(JAVA_ENVIO - 1, JAVA_ENVIO).join('\n')],
    ['NativeSnapshot.java pollMedia', snapshot.slice(SNAP_REPARTO - 5, SNAP_REPARTO + 8).join('\n')],
    ['preview.ts negativas', preview.slice(sola('// Las tres negativas de las fotos, en el orden del puente', 'preview.ts', PV_BRAZO, PV_FILA) - 1, sola('if (new Set(options.map(option => option.toLowerCase())).size !== options.length)', 'preview.ts', PV_BRAZO, PV_FILA)).join('\n')],
    ['preview.ts espejo', preview.slice(PV_FILA - 1, PV_FILA + 3).join('\n')],
    ['BatchPanels.tsx payload', brow(sola("media:pictures.map(item=>item||'')", 'BatchPanels.tsx'))],
    ['App.tsx botón', arow(sola('images={active!==undefined&&community(active)}', 'App.tsx'))],
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

  it('el andamio ya no cita las cifras de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      const [desde = 0, hasta = Number.POSITIVE_INFINITY] = dentro[citation] ?? [];
      expect(sola(needle, file, desde, hasta), `${citation} medido`).toBe(Number(n));
    }
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    // Medido hoy con `split(/\r?\n/).length`: la tanda CK sumó líneas a `NativeBridge.java` (el caso nuevo y su bloque
    // de métodos), a `App.tsx` (cuatro) y a `preview.ts` (tres); la ronda CL sumó a esas dos últimas su caso de
    // `calls.list` con su bloque y las cincuenta líneas de la pantalla del registro, más las cuatro de `contract.ts`.
    // La CK-B escribió el brazo de `message.edit.media` en el despacho —noventa y siete líneas— y la marca `MediaKind`
    // en el estado —ocho—. La ronda CD sumó diez líneas al despacho —el brazo de `premium.state` con su comentario,
    // la bandera `customReaction` con el suyo y el comentario que dice las dos caras de `allowCustom`—. La ronda CE
    // sumó treinta y siete líneas al despacho —el `ParseEntities` reescrito con el techo de cien y sus dos ayudantes de
    // negativa, la vuelta de la entidad con la cifra del emoji y la dirección materializada, y el parseo por delante de
    // la marca de envío— y tres al estado con la `CustomEmojiId` del DTO y su comentario. Las demás
    // cifras las midió la CN-B; desde entonces el despacho subió doce líneas con los dos ayudantes de la ronda CW-D y
    // veinticuatro más con los fondos de la CH-A y su aviso `UpdateDefaultBackground` de la CH-A2; cuatro, la instantánea
    // con el `appearance` que publica los dos huecos de modo; once, las dos ramas `backgrounds.list`/`background.set`
    // que la CH-B cableó en el despacho con su comentario y la lectura de los dos huecos al entrar. Las inserciones
    // posteriores a la CT dejaron el puente en 5579 líneas, el despacho en 4307 y `App.tsx` en 1592.
    expect(service).toHaveLength(4307);
    expect(pollCs).toHaveLength(500);
    expect(stateCs).toHaveLength(760);
    expect(registry).toHaveLength(281);
    expect(java).toHaveLength(5579);
    expect(snapshot).toHaveLength(554);
    expect(preview).toHaveLength(3395);
    expect(batch).toHaveLength(351);
    expect(app).toHaveLength(1592);
    expect(contract).toHaveLength(250);
  });
});
