import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CN — la imagen dentro de cada opción de una encuesta, en las dos direcciones.
 *
 * CF trajo las doce opciones y el cierre; CM trajo la descripción. Lo que seguía faltando era el medio por opción,
 * que las dos librerías sí conocen: TDLib lo pide en `TdApi.InputPollOption.media` y MTProto en
 * `TL.InputPollAnswer.media`. En Android la subida monta `TdApi.InputPollMediaPhoto` sobre el mismo `photoInput` que
 * usa el adjunto suelto (`NativeBridge.java:4976`), así que no hay un camino nuevo que inventar: el token sale del
 * selector de fotos de siempre y entra en el array que se declara en `NativeBridge.java:4695`.
 *
 * Las guardas van en el orden en que Android las escribió: primero el recuento de opciones
 * (`NativeBridge.java:4692`), después la validación del token —cuenta, chat y tipo de archivo— en
 * `NativeBridge.java:4693`, luego la regla de todo o nada en `NativeBridge.java:4694` y solo entonces el montaje opción por opción en `NativeBridge.java:4696`. El
 * todo o nada no es un capricho: Telegram no admite una encuesta con fotos en tres opciones y la cuarta vacía, así
 * que la pantalla dice la misma frase carácter a carácter (`BatchPanels.tsx:92`) antes de mandar nada
 * (`NativeBridge.java:4694`). Y como el token señala un archivo temporal, `NativeBridge.java:4703` lo borra después
 * del envío, no antes: si el mensaje no salió, la foto sigue sirviendo para reintentar.
 *
 * Al leer, `NativeSnapshot.java:213` serializa `option.media` con el mismo nombre que la pantalla espera, y
 * `NativeSnapshot.java:434` reparte el reparto por clases: foto, vídeo, animación, documento, sticker y audio tienen
 * camino; enlazar, ubicación y punto de interés no, y el propio archivo lo declara en vez de taparlo. La foto se
 * pinta en el tamaño que cabe en la burbuja, regla que vive sola en `NativeSnapshot.java:433` y que miden cuatro
 * pruebas JVM (`PollOptionMediaPolicyTest.java:14`); sin esa regla la opción se pintaría con el original de megas.
 * Cuando Telegram todavía no descargó ningún tamaño queda la miniatura, que es lo que
 * `NativeSnapshot.java:443` decide con su tope de 16 KB.
 *
 * En la pantalla la imagen es un token, nunca una ruta (`BatchPanels.tsx:72`), se cambia sin dejar la anterior suelta
 * (`BatchPanels.tsx:82`), se descarta al cerrar sin enviar (`BatchPanels.tsx:81`) y viaja en un array paralelo con
 * huecos vacíos (`BatchPanels.tsx:94`) para que el puente sepa en qué opción cae cada foto. El botón es el mismo de
 * siempre (`BatchPanels.tsx:99`), la fila leída la pinta el visor de toda la app (`BatchPanels.tsx:49`), la caja la
 * recorta el CSS (`batch.css:8`) y `contract.ts:119` declara el medio como opcional, que es lo que permite seguir
 * pintando encuestas sin imágenes.
 *
 * Windows ya puede, desde la ronda CN-B: el brazo de escritorio guarda las respuestas en un `PollAnswerBase[]`
 * (`TelegramService.cs:2528`) y, si hay fotos, sube cada archivo con `messages.uploadMedia`
 * (`TelegramService.cs:2580`) y engancha el `inputPhoto` al `InputPollAnswer` de su opción. Al leer, la fila del DTO
 * lleva el medio que saca `DesktopPoll.PhotoOf` (`TelegramService.cs:2974`), y `DesktopPoll.cs:423` sigue filtrando
 * `PollAnswer` porque es el único de los dos constructores que declara campo `option`. El andamio copia esa realidad
 * —la fila espejo de `preview.ts:1124` ya escribe su `media`— y `App.tsx:1142` dejó de apagar el botón en
 * escritorio: lo que sigue fuera es el chat sin abrir y el que no es comunidad. Los tres rechazos nuevos, el orden de
 * las guardas y las dos banderas los mide su propia ronda en `rondaCNB.test.ts`. Tampoco lleva medio la encuesta que
 * se crea desde el teclado de un bot (`NativeBridge.java:1201`), que es el otro brazo que monta opciones.
 *
 * Como en CF, CB, CM, BM, BY y BZ: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda tiene que
 * estar en la tabla y señalar hoy la línea que la frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const jvmDir = '../../mobile/android/app/src/test/java/cc/webrom/wrgram/';
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const jvm = rows(`${jvmDir}PollOptionMediaPolicyTest.java`);
const tdlib = rows('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const batch = rows('./BatchPanels.tsx');
const app = rows('./App.tsx');
const contract = rows('./contract.ts');
const css = rows('./batch.css');
const service = rows(`${host}TelegramService.cs`);
const pollCs = rows(`${host}DesktopPoll.cs`);
const preview = rows('./preview.ts');

/** La primera línea de un cuerpo que dice algo, en número de línea (1-based). */
function en(needle: string, body: string[], where: string) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const donde = (needle: string, body: string[]) => body.map((row, i) => (row.includes(needle) ? i + 1 : 0)).filter(Boolean);
const atJava = (n: string) => en(n, java, 'NativeBridge.java');
const atSnap = (n: string) => en(n, snapshot, 'NativeSnapshot.java');
const atJvm = (n: string) => en(n, jvm, 'PollOptionMediaPolicyTest.java');
const atTd = (n: string) => en(n, tdlib, 'TdApi.java');
const atUi = (n: string) => en(n, batch, 'BatchPanels.tsx');
const atApp = (n: string) => en(n, app, 'App.tsx');
const atDoc = (n: string) => en(n, contract, 'contract.ts');
const atCss = (n: string) => en(n, css, 'batch.css');
const atServ = (n: string) => en(n, service, 'TelegramService.cs');
const atPoll = (n: string) => en(n, pollCs, 'DesktopPoll.cs');
const atPv = (n: string) => en(n, preview, 'preview.ts');

const jrow = (n: number) => java[n - 1] ?? '';
const srow = (n: number) => snapshot[n - 1] ?? '';
const krow = (n: number) => jvm[n - 1] ?? '';
const trow = (n: number) => tdlib[n - 1] ?? '';
const brow = (n: number) => batch[n - 1] ?? '';
const arow = (n: number) => app[n - 1] ?? '';
const drow = (n: number) => contract[n - 1] ?? '';
const crow = (n: number) => css[n - 1] ?? '';
const servrow = (n: number) => service[n - 1] ?? '';
const prow = (n: number) => pollCs[n - 1] ?? '';
const pvrow = (n: number) => preview[n - 1] ?? '';

/** El entero que viene justo detrás de un trozo literal de la línea, para no copiar la cifra de memoria. */
function capOf(row: string, after: string) {
  const at = row.indexOf(after);
  if (at < 0) throw new Error(`${after} no aparece en ${row.trim()}`);
  const match = /(\d+)/.exec(row.slice(at + after.length));
  if (!match) throw new Error(`${after} no va seguida de un número en ${row.trim()}`);
  return Number(match[1]);
}

/** El literal entrecomiladado que contiene una frase, para comparar orillas carácter a carácter. */
function dichoJava(row: string, needle: string) {
  const at = row.indexOf(needle);
  if (at < 0) throw new Error(`${needle} no está en ${row.trim()}`);
  return row.slice(row.lastIndexOf('"', at) + 1, row.indexOf('"', at + needle.length));
}
function dichoTs(row: string, needle: string) {
  const at = row.indexOf(needle);
  if (at < 0) throw new Error(`${needle} no está en ${row.trim()}`);
  return row.slice(row.lastIndexOf("'", at) + 1, row.indexOf("'", at + needle.length));
}

const NADIR = 'Una encuesta con imágenes lleva una imagen en cada opción.';
const CAMBIO = 'La conversación cambió. Vuelve a elegir las imágenes de las opciones.';
const TIPO = 'Cada opción admite una foto JPG, PNG o WebP.';

const subida = atJava('JSONArray media=p.optJSONArray("media")');
const montaje = atJava('options[i]=new TdApi.InputPollOption(new TdApi.FormattedText(text,new TdApi.TextEntity[0]),images.isEmpty()?null:');
const lectura = atSnap('JSONObject image=pollMedia(option.media)');
const reparto = atSnap('JSONObject pollMedia(TdApi.PollMedia value)throws Exception{');
const salida = snapshot.findIndex((row, index) => index >= reparto - 1 && row.trim() === 'return null;') + 1;

describe('ronda CN · la subida en Android', () => {
  it('el recuento de opciones va antes que el medio, y el medio antes de montar nada', () => {
    expect(atJava('JSONArray values=p.getJSONArray("options")')).toBeLessThan(subida);
    expect(subida).toBeLessThan(atJava(NADIR));
    expect(atJava(NADIR)).toBeLessThan(montaje);
  });

  it('la foto de una opción usa el mismo InputPhoto que el adjunto suelto', () => {
    expect(jrow(montaje)).toContain('new TdApi.InputPollMediaPhoto(photoInput(attachments.get(images.get(i))))');
    const definido = atJava('private TdApi.InputPhoto photoInput(Attachment item)');
    expect(donde('photoInput(', java)).toHaveLength(3);
    expect(donde('photoInput(', java)).toContain(definido);
    expect(jrow(definido + 1)).toContain('private TdApi.InputMessageContent photoContent(Attachment item)');
    expect(jrow(definido + 1)).toContain('photoInput(item)');
  });

  it('el token solo vale si es de esta cuenta y de este chat', () => {
    expect(jrow(subida)).toContain(CAMBIO);
    expect(jrow(subida).indexOf('item.account!=session.selfId')).toBeLessThan(jrow(subida).indexOf(CAMBIO));
    expect(jrow(subida).indexOf('item.chat!=session.activeChat')).toBeLessThan(jrow(subida).indexOf(CAMBIO));
  });

  it('la opción admite foto, y se dice con las tres familias que TDLib descarga', () => {
    expect(jrow(subida)).toContain(TIPO);
    for (const mime of ['image/jpeg', 'image/png', 'image/webp']) expect(jrow(subida)).toContain(mime);
    expect(jrow(subida).indexOf('image/jpeg')).toBeLessThan(jrow(subida).indexOf(TIPO));
  });

  it('todo o nada: o una foto en cada opción, o ninguna', () => {
    expect(jrow(atJava(NADIR))).toContain('!images.isEmpty()&&images.size()!=values.length()');
    expect(dichoJava(jrow(atJava(NADIR)), NADIR)).toBe(NADIR);
  });

  it('la subida escribe una sola clase de medio, y eso es lo que se declara', () => {
    expect(donde('new TdApi.InputPollMedia', java)).toHaveLength(1);
    expect(donde('extends InputPollMedia {', tdlib)).toHaveLength(9);
    for (const otra of ['InputPollMediaVideo', 'InputPollMediaAnimation', 'InputPollMediaDocument',
      'InputPollMediaSticker', 'InputPollMediaAudio', 'InputPollMediaLink', 'InputPollMediaLocation', 'InputPollMediaVenue'])
      expect(jrow(montaje) + jrow(subida), `${otra} no está escrito`).not.toContain(`new TdApi.${otra}`);
    // El otro brazo que monta opciones —el teclado de un bot— sigue sin medio: ahí TDLib recibe `null`.
    expect(jrow(atJava('private void createPollForBot('))).toContain('new TdApi.InputPollOption(');
    expect(jrow(atJava('private void createPollForBot('))).not.toContain('InputPollMedia');
  });

  it('el archivo temporal se borra después del envío, no antes', () => {
    const enviar = atJava('session.sendContent(poll,BridgePolicy.id(p,"reply")');
    expect(jrow(enviar).indexOf('session.sendContent(poll,')).toBeLessThan(jrow(enviar).indexOf('attachments.remove(token)'));
    expect(jrow(enviar).indexOf('attachments.remove(token)')).toBeLessThan(jrow(enviar).indexOf('Files.deleteIfExists(item.path.toPath())'));
    expect(jrow(enviar).indexOf('Files.deleteIfExists(item.path.toPath())')).toBeLessThan(jrow(enviar).indexOf('a.ok(sent)'));
  });
});

describe('ronda CN · la lectura en Android', () => {
  it('cada opción serializa su medio con el nombre que la pantalla espera', () => {
    expect(srow(lectura)).toContain('item.put("media",image)');
    expect(jrow(subida)).toContain('p.optJSONArray("media")');
  });

  it('seis clases de medio tienen camino y son las que esta pantalla sabe pintar', () => {
    const cuerpo = snapshot.slice(reparto - 1, salida).join('\n');
    for (const kind of ['PollMediaPhoto', 'PollMediaVideo', 'PollMediaAnimation', 'PollMediaDocument', 'PollMediaSticker', 'PollMediaAudio'])
      expect(cuerpo, `${kind} sin rama`).toContain(`TdApi.${kind}`);
    expect(donde('extends PollMedia {', tdlib)).toHaveLength(9);
  });

  it('lo que no tiene camino se declara en el propio archivo, no se calla', () => {
    const comentario = snapshot.slice(reparto - 5, reparto - 1).join('\n');
    expect(comentario).toContain('Enlazar, ubicación y punto de interés');
    for (const sin of ['PollMediaLink', 'PollMediaLocation', 'PollMediaVenue'])
      expect(snapshot.slice(reparto - 1, salida).join('\n'), `${sin} sí tendría que estar sin estarlo`).not.toContain(sin);
    expect(trow(atTd('public static class PollMediaLink extends PollMedia {'))).toContain('PollMediaLink');
  });

  it('el tamaño que se pinta lo decide una regla aparte', () => {
    expect(srow(atSnap('static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)'))).toContain('size.width<=1280');
    expect(capOf(srow(atSnap('static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)')), 'size.width<=')).toBe(1280);
    expect(donde('pollPhotoSize(', snapshot)).toHaveLength(2);
    expect(srow(atSnap('static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)'))).toContain('size.width>0');
  });

  it('sin tamaño descargado queda la miniatura, con su tope', () => {
    const mini = atSnap('JSONObject miniOnly(TdApi.Minithumbnail mini,String name)');
    expect(capOf(srow(mini), 'data.length<=')).toBe(16384);
    expect(srow(reparto + 1)).toContain('pollPhotoSize');
  });

  it('la regla del tamaño tiene cuatro pruebas en la JVM', () => {
    expect(donde('@Test', jvm)).toHaveLength(4);
    expect(donde('NativeSnapshot.pollPhotoSize(', jvm)).toHaveLength(6);
    expect(krow(atJvm('public class PollOptionMediaPolicyTest {'))).toContain('public class PollOptionMediaPolicyTest {');
    for (const nombre of ['theWidestSizeThatStillFitsTheBubbleIsTheOnePainted', 'aSizeWithoutWidthIsAPhotoTelegramHasNotMeasuredYet',
      'aPhotoBiggerThanTheBubbleIsNotPaintedAndADeletedOneIsNotEither', 'aPhotoWithoutAnySizeListStillReachesTheRule'])
      expect(jvm.join('\n'), `${nombre} no se prueba`).toContain(`public void ${nombre}()`);
    expect(capOf(krow(atJvm('TdApi.Photo value = photo(size(90), size(320), wide, size(1600));')), 'wide, size(')).toBe(1600);
    expect(capOf(krow(atJvm('TdApi.PhotoSize wide = size(1280);')), 'wide = size(')).toBe(1280);
    expect(krow(atJvm('assertSame(wide, NativeSnapshot.pollPhotoSize(value));'))).toContain('assertSame(wide,');
  });
});

describe('ronda CN · la pantalla', () => {
  it('la pantalla guarda tokens, nunca rutas', () => {
    expect(brow(atUi('const [pictures,setPictures]=useState<(string|null)[]>([null,null]);'))).toContain('(string|null)[]');
    expect(brow(atUi('function updateMedia(index:number,value:string|null)'))).toContain('position===index?value:item');
    expect(brow(atUi('export function PollComposer'))).toContain('pick:()=>Promise<string|null>');
  });

  it('cambiar la foto de una opción suelta la que ya no está', () => {
    expect(brow(atUi('async function choose(index:number)'))).toContain('if(before&&before!==token)drop(before)');
    expect(brow(atUi('async function choose(index:number)')).indexOf('const before=pictures[index]'))
      .toBeLessThan(brow(atUi('async function choose(index:number)')).indexOf('drop(before)'));
  });

  it('cerrar sin enviar descarta lo que quedó', () => {
    expect(brow(atUi('const leftovers=useRef(pictures)'))).toContain('leftovers.current=pictures');
    expect(brow(atUi('leftovers.current.forEach(token=>{if(token)drop(token);})'))).toContain('useEffect(()=>()=>');
  });

  it('añadir y quitar opciones mueve el array paralelo con ellas', () => {
    const fila = brow(atUi('<fieldset><legend>Opciones ({options.length}/12)'));
    expect(donde('setPictures(previous=>previous.filter((_,position)=>position!==index))', batch)).toHaveLength(1);
    expect(donde('setPictures(previous=>[...previous,null])', batch)).toHaveLength(1);
    expect(fila.indexOf('setPictures(previous=>previous.filter')).toBeLessThan(fila.indexOf('setPictures(previous=>[...previous,null])'));
  });

  it('la frase del todo o nada es idéntica en las dos orillas', () => {
    expect(dichoTs(brow(atUi(NADIR)), NADIR)).toBe(dichoJava(jrow(atJava(NADIR)), NADIR));
    expect(dichoTs(brow(atUi(NADIR)), NADIR)).toBe(NADIR);
  });

  it('el payload manda un array paralelo, con huecos vacíos donde no hay foto', () => {
    expect(brow(atUi("media:pictures.map(item=>item||'')"))).toContain("media:pictures.map(item=>item||'')");
    expect(brow(atUi('export interface PollDraft'))).toContain('media:string[]');
  });

  it('la fila pinta el medio con el visor de siempre', () => {
    expect(brow(atUi('{option.media&&<span className="poll-option-media">'))).toContain('<MediaView media={option.media} eager/>');
    expect(crow(atCss('.poll-option-media{flex:none;width:46px'))).toContain('object-fit:cover');
    expect(capOf(crow(8), 'width:')).toBe(46);
    expect(capOf(crow(8), 'height:')).toBe(46);
  });

  it('el contrato lleva el medio como opcional, que es lo que deja pintar encuestas sin fotos', () => {
    expect(drow(atDoc('export interface PollOption'))).toContain('media?:Media');
    expect(pvrow(atPv('media: files.length === 0 ? undefined'))).toContain('name: OPTION_PHOTO_NAME');
  });
});

describe('ronda CN · lo que ya llega en las dos orillas y dónde se queda fuera', () => {
  it('el botón solo aparece donde hay puente detrás', () => {
    const abierta = arow(atApp("openPoll(){setDialog({title:'Crear encuesta'"));
    expect(abierta).toContain('images={active!==undefined&&community(active)}');
    expect(brow(atUi('export function PollComposer'))).toContain('images=false');
    expect(donde('<PollComposer', app)).toHaveLength(1);
  });

  it('la foto se pide por el camino real del adjunto, con su descarte', () => {
    const abierta = arow(atApp("openPoll(){setDialog({title:'Crear encuesta'"));
    expect(abierta).toContain("run<PickedAttachment>('attachment.pick',{kind:'photo'})");
    expect(abierta).toContain("request('attachment.discard',{token})");
    expect(abierta.indexOf('attachment.pick')).toBeLessThan(abierta.indexOf('attachment.discard'));
  });

  it('Windows escribe el medio por opción y lo lee', () => {
    const escribir = atServ('answers[position] = DesktopPoll.Answer(options[position], keys?[position]);');
    const cuerpo = service.slice(escribir - 4, escribir + 1).join('\n');
    expect(cuerpo).toContain('var keys = pictures.Length > 0 ? null : DesktopPoll.OptionKeys(options.Length);');
    expect(cuerpo).toContain('var answers = new PollAnswerBase[options.Length];');
    // La subida y el pegado caen en el mismo `for` de los vales: primero `messages.uploadMedia`, luego la bandera
    // puesta con su campo, y el `inputPhoto` va a la opción por posición, no por búsqueda.
    const bucle = atServ('for (var position = 0; position < photos.Length; position++)');
    const trecho = service.slice(bucle - 1, bucle + 17).join('\n');
    expect(trecho).toContain('var stored = await client.Messages_UploadMedia(');
    expect(trecho).toContain('answer.flags |= InputPollAnswer.Flags.has_media;');
    expect(trecho).toContain('answer.media = new InputMediaPhoto');
    expect(trecho.indexOf('Messages_UploadMedia')).toBeLessThan(trecho.indexOf('answer.flags |= InputPollAnswer'));
    const leer = atServ('dto.Options.Add(new PollOptionDto');
    const fila = service.slice(leer - 1, leer + 10).join('\n');
    expect(fila).toContain('Percentage = DesktopPoll.Percentage(votes, total)');
    expect(fila).toContain('Media = DesktopPoll.PhotoOf(answers[position]) is { } picture');
    expect(prow(atPoll('public static PollAnswer[] Options(TL.Poll poll)'))).toContain('poll.answers.OfType<PollAnswer>().ToArray()');
  });

  it('el andamio copia la realidad de escritorio en vez de fingirla', () => {
    const espejo = pvrow(atPv('options: options.map((text, index) => ({ index,'));
    expect(espejo).toContain('votes: 0, percentage: 0, chosen: false, choosing: false');
    expect(preview.slice(atPv('options: options.map((text, index) => ({ index,') - 1, atPv('options: options.map((text, index) => ({ index,') + 3).join('\n'))
      .toContain("media: files.length === 0 ? undefined : { id: 0, ready: false, kind: 'image', mime: files[index].mime, name: OPTION_PHOTO_NAME, size: files[index].size }");
  });

  it('la subida de Windows usa el constructor que declara campo de medio', () => {
    const respuestas = atServ('var answers = new PollAnswerBase[options.Length];');
    expect(servrow(respuestas)).toContain('new PollAnswerBase[options.Length]');
    expect(service.slice(respuestas - 1, respuestas + 62).join('\n')).toContain('InputPollAnswer');
    expect(prow(atPoll('public static PollAnswerBase Answer(string option, string? key)'))).toContain('key == null');
  });
});

describe('ronda CN · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'NativeBridge.java:4692': 'JSONArray values=p.getJSONArray("options")',
    'NativeBridge.java:4693': CAMBIO,
    'NativeBridge.java:4694': NADIR,
    'NativeBridge.java:4695': 'TdApi.InputPollOption[] options=new TdApi.InputPollOption[values.length()];',
    'NativeBridge.java:4696': 'new TdApi.InputPollMediaPhoto(photoInput(attachments.get(images.get(i))))',
    'NativeBridge.java:4703': 'attachments.remove(token)',
    'NativeBridge.java:1201': 'private void createPollForBot(',
    'NativeBridge.java:4976': 'private TdApi.InputPhoto photoInput(Attachment item)',
    'NativeSnapshot.java:213': 'JSONObject image=pollMedia(option.media)',
    'NativeSnapshot.java:433': 'static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)',
    'NativeSnapshot.java:434': 'JSONObject pollMedia(TdApi.PollMedia value)throws Exception{',
    'NativeSnapshot.java:443': 'JSONObject miniOnly(TdApi.Minithumbnail mini,String name)',
    'PollOptionMediaPolicyTest.java:14': 'public class PollOptionMediaPolicyTest {',
    'BatchPanels.tsx:49': '{option.media&&<span className="poll-option-media">',
    'BatchPanels.tsx:72': 'const [pictures,setPictures]=useState<(string|null)[]>([null,null]);',
    'BatchPanels.tsx:81': 'leftovers.current.forEach(token=>{if(token)drop(token);})',
    'BatchPanels.tsx:82': 'async function choose(index:number)',
    'BatchPanels.tsx:92': NADIR,
    'BatchPanels.tsx:94': "media:pictures.map(item=>item||'')",
    'BatchPanels.tsx:99': 'Imagen de la opción',
    'contract.ts:119': 'choosing:boolean;media?:Media',
    'batch.css:8': '.poll-option-media{flex:none;width:46px',
    'App.tsx:1142': 'images={active!==undefined&&community(active)}',
    'TelegramService.cs:2528': 'var answers = new PollAnswerBase[options.Length];',
    'TelegramService.cs:2580': 'var stored = await client.Messages_UploadMedia(',
    'TelegramService.cs:2974': 'Media = DesktopPoll.PhotoOf(answers[position]) is { } picture',
    'DesktopPoll.cs:423': 'public static PollAnswer[] Options(TL.Poll poll)',
    'preview.ts:1124': 'options: options.map((text, index) => ({ index,',
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CF, CB, CM, BM y BY. */
  const watched: [string, string][] = [
    ['rondaCN.test.ts', text('./rondaCN.test.ts').split('const text =')[0]],
    ['NativeBridge.java opciones', java.slice(atJava('JSONArray values=p.getJSONArray("options")') - 1, atJava('session.sendContent(poll,BridgePolicy.id(p,"reply")') + 1).join('\n')],
    ['NativeBridge.java photoInput', java.slice(atJava('private TdApi.InputPhoto photoInput(Attachment item)'), atJava('private TdApi.InputMessageContent photoContent(Attachment item)')).join('\n')],
    ['NativeSnapshot.java opciones', snapshot.slice(lectura - 3, lectura + 1).join('\n')],
    ['NativeSnapshot.java pollMedia', snapshot.slice(atSnap('static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)') - 4, salida).join('\n')],
    ['PollOptionMediaPolicyTest.java', jvm.join('\n')],
    ['BatchPanels.tsx fila', brow(atUi('{option.media&&<span className="poll-option-media">'))],
    ['BatchPanels.tsx composer', batch.slice(atUi('const [pictures,setPictures]=useState<(string|null)[]>([null,null]);') - 1, atUi('async function submit(){')).join('\n')],
    ['BatchPanels.tsx opciones', brow(atUi('<fieldset><legend>Opciones ({options.length}/12)'))],
    ['App.tsx CN', arow(atApp("openPoll(){setDialog({title:'Crear encuesta'"))],
    ['contract.ts PollOption', drow(atDoc('export interface PollOption'))],
    ['batch.css', crow(atCss('.poll-option-media{flex:none;width:46px'))],
    ['TelegramService.cs envío', service.slice(atServ('var answers = new PollAnswerBase[options.Length];') - 1, atServ('answers[position] = DesktopPoll.Answer(options[position], keys?[position]);') + 2).join('\n')],
    ['TelegramService.cs fotos', service.slice(atServ('var uploaded = await client.UploadFileAsync(photos[position].Path, null);') - 1, atServ('id = picture.id, access_hash = picture.access_hash, file_reference = picture.file_reference') + 2).join('\n')],
    ['TelegramService.cs lectura', service.slice(atServ('dto.Options.Add(new PollOptionDto'), atServ('dto.Options.Add(new PollOptionDto') + 10).join('\n')],
    ['DesktopPoll.cs opciones', pollCs.slice(atPoll('public static PollAnswer[] Options(TL.Poll poll)') - 4, atPoll('public static PollAnswer[] Options(TL.Poll poll)')).join('\n')],
    ['preview.ts espejo', preview.slice(atPv('options: options.map((text, index) => ({ index,') - 1, atPv('options: options.map((text, index) => ({ index,') + 3).join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' ? java
      : file === 'NativeSnapshot.java' ? snapshot
        : file === 'PollOptionMediaPolicyTest.java' ? jvm
          : file === 'TelegramService.cs' ? service
            : file === 'DesktopPoll.cs' ? pollCs
              : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Set<string>();
  for (const [, body] of watched)
    for (const match of body.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj|css)):(\d+)(?:-(\d+))?/g))
      written.add(`${match[1]}:${match[2]}`);

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('ninguna ancla se cita dos veces con cifras que no coinciden, y ninguna cifra se cita sin ancla', () => {
    for (const citation of written) expect(anchors[citation], `${citation} no está en la tabla de anclas`).toBeTypeOf('string');
    for (const citation of Object.keys(anchors)) expect(written.has(citation), `${citation} no lo cita nadie`).toBe(true);
  });

  it('el andamio ya no cita las cifras de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    const medidas: [string, number][] = [
      ['NativeBridge.java', atJava('JSONArray values=p.getJSONArray("options")')],
      ['NativeBridge.java', atJava(CAMBIO)],
      ['NativeBridge.java', atJava(NADIR)],
      ['NativeBridge.java', atJava('TdApi.InputPollOption[] options=new TdApi.InputPollOption[values.length()]')],
      ['NativeBridge.java', atJava('new TdApi.InputPollMediaPhoto(photoInput(attachments.get(images.get(i))))')],
      // Medido por contenido, no por orden: la CK añadió un `attachments.remove(token)` suelto dentro de
      // `editMessageMedia` (línea 4626) que es el primero del archivo. La línea que afirma esta hoja es la que borra
      // los temporales después del `sendContent`, así que se busca la que lleva los dos literales.
      ['NativeBridge.java', atJava('session.sendContent(poll,BridgePolicy.id(p,"reply"),p.optBoolean("silent"),sent->{for(String token:images){Attachment item=attachments.remove(token);')],
      ['NativeBridge.java', atJava('private void createPollForBot(')],
      ['NativeBridge.java', atJava('private TdApi.InputPhoto photoInput(Attachment item)')],
      ['NativeSnapshot.java', lectura],
      ['NativeSnapshot.java', atSnap('static TdApi.PhotoSize pollPhotoSize(TdApi.Photo photo)')],
      ['NativeSnapshot.java', reparto],
      ['NativeSnapshot.java', atSnap('JSONObject miniOnly(TdApi.Minithumbnail mini,String name)')],
      ['PollOptionMediaPolicyTest.java', atJvm('public class PollOptionMediaPolicyTest {')],
      ['BatchPanels.tsx', atUi('{option.media&&<span className="poll-option-media">')],
      ['BatchPanels.tsx', atUi('const [pictures,setPictures]=useState<(string|null)[]>([null,null]);')],
      ['BatchPanels.tsx', atUi('useEffect(()=>()=>{leftovers.current.forEach')],
      ['BatchPanels.tsx', atUi('async function choose(index:number)')],
      ['BatchPanels.tsx', atUi(NADIR)],
      ['BatchPanels.tsx', atUi("media:pictures.map(item=>item||'')")],
      ['BatchPanels.tsx', atUi('aria-label={`Imagen de la opción')],
      ['contract.ts', atDoc('choosing:boolean;media?:Media')],
      ['batch.css', atCss('.poll-option-media{flex:none;width:46px')],
      ['App.tsx', atApp('images={active!==undefined&&community(active)}')],
      ['TelegramService.cs', atServ('var answers = new PollAnswerBase[options.Length];')],
      ['TelegramService.cs', atServ('var stored = await client.Messages_UploadMedia(')],
      ['TelegramService.cs', atServ('Media = DesktopPoll.PhotoOf(answers[position])')],
      ['DesktopPoll.cs', atPoll('public static PollAnswer[] Options(TL.Poll poll)')],
      ['preview.ts', atPv('options: options.map((text, index) => ({ index,')],
    ];
    for (const [file, n] of medidas) expect(written.has(`${file}:${n}`), `${file}:${n} no salió de la medición`).toBe(true);
  });

  it('las agujas de la ronda siguen midiendo lo que mide el disco', () => {
    // Medido hoy con `split(/\r?\n/).length`: la tanda CK dejó una línea de caso y su bloque de métodos en
    // `NativeBridge.java`, y cuatro líneas en `App.tsx` (tres del menú y la función nueva). La ronda CL sumó otra
    // línea de caso con su bloque en el puente y cuatro en `contract.ts`. Las restantes no las tocó ninguna. Después, la
    // ronda CH-A puso el bloque de los fondos al final del puente y la CH-A2 le sumó el aviso: veinticuatro entre las
    // dos; cuatro más en la instantánea por el `appearance` que publica los dos huecos.
    expect(java).toHaveLength(5425);
    expect(snapshot).toHaveLength(554);
    expect(jvm).toHaveLength(58);
    expect(batch).toHaveLength(351);
    expect(app).toHaveLength(1557);
    expect(contract).toHaveLength(250);
    expect(css).toHaveLength(125);
  });
});
