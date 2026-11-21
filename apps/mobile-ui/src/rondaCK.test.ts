import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda CK — sustituir el medio de un mensaje que ya salió.
 *
 * TDLib cambia el contenido de un mensaje con `EditMessageMedia` (`TdApi.java:120729`) y admite **cinco** tipos:
 * animación, audio, documento, foto y vídeo (`TdApi.java:120743`). Las otras dos funciones que editan medio —
 * `EditBusinessMessageMedia` (`TdApi.java:119451`) y `EditInlineMessageMedia` (`TdApi.java:120385`)— repiten la misma
 * lista, así que la nota de voz y el videomensaje no se pueden ni meter ni sacar editando: no es un recorte de esta
 * ronda, es lo que hay. Si el mensaje admite el cambio lo decide Telegram con `MessageProperties.canEditMedia`
 * (`TdApi.java:54711`, campo en `TdApi.java:54713`), y dentro de un álbum solo caben los cambios de foto a vídeo y
 * vice versa, frase que la propia librería escribe en `TdApi.java:120725`.
 *
 * **Dónde vive cada regla.** Las tres reglas están dichas una sola vez, en `MessageMediaEdit.java`: los tipos
 * (`MessageMediaEdit.java:53` y `MessageMediaEdit.java:67`), el orden en que se niega
 * (`MessageMediaEdit.java:81`) y la pareja que puede cambiarse en un álbum (`MessageMediaEdit.java:89`). Las cuatro
 * frases con las que el puente niega son constantes de esa clase (`MessageMediaEdit.java:41`,
 * `MessageMediaEdit.java:43`, `MessageMediaEdit.java:45` y `MessageMediaEdit.java:47`), y en el puente no se repite
 * ninguna: `NativeBridge.java` las oye por referencia. Lo que sí hace el puente es armar el contenido
 * (`NativeBridge.java:4636-4651`) conservando el pie y las dos banderas del contenido viejo, porque
 * `EditMessageMedia` edita «including message caption» (`TdApi.java:120725`) y mandarlo vacío borraría un texto que
 * nadie pidió borrar.
 *
 * **El orden del brazo, que es lo que esta vez se midió.** `message.edit.media` entra justo detrás de la familia de
 * editar (`NativeBridge.java:831`) y su cuerpo (`NativeBridge.java:4616-4634`) mira primero el vale del archivo, luego
 * clasifica los dos tipos, arma el contenido **en el hilo del puente** y solo entonces pregunta a Telegram con
 * `GetMessageProperties`; la escritura va dentro de la respuesta. Armar antes de preguntar no es un atajo: los avisos
 * de TDLib llegan al hilo principal, y decodificar una foto o medir un vídeo delante de ellos congelaría la pantalla.
 *
 * **Windows, por su nombre.** La ronda CK dejó un hueco dicho con nombre: la clave estaba declarada pendiente y el
 * ítem se cortaba con la puerta del escritorio (`App.tsx:1074`), porque en MTProto `messages.editMessage` sí tiene
 * parámetro `media`. El hueco era una ronda sin hacer, no un límite de la librería, y la CK-B la hizo: brazo, subida
 * y negativas sobre los objetos de Telegram. Hoy la clave está en la lista de disponibles (`desktopScope.ts:28`) y la
 * pantalla pinta el ítem sin distinguir capa.
 * El andamio sigue publicando la bandera con la forma de la fila (`preview.ts:401`) y la negación pendiente ya no toca
 * esta clave: lo que no está en `DESKTOP_PENDING` pasa al cable. La otra cara —lo que el host afirma, niega y manda—
 * la mide `rondaCKB.test.ts`.
 *
 * Como en CF, CM, CN, CI y CJ: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda tiene que estar
 * en la tabla y señalar hoy la línea que su frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const jvmDir = '../../mobile/android/app/src/test/java/cc/webrom/wrgram/';
const tdlibPath = '../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java';

const bridge = rows(`${javaDir}NativeBridge.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const pure = rows(`${javaDir}MessageMediaEdit.java`);
const jvm = rows(`${jvmDir}MessageMediaEditTest.java`);
const app = rows('./App.tsx');
const contract = text('./contract.ts');
const scope = rows('./desktopScope.ts');
const preview = rows('./preview.ts');
const tdlib = rows(tdlibPath);

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const atJava = (n: string) => en(n, bridge, 'NativeBridge.java');
const atPure = (n: string) => en(n, pure, 'MessageMediaEdit.java');
const atApp = (n: string) => en(n, app, 'App.tsx');
const count = (needle: string, cuerpo: string | string[]) => (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;

/** El cuerpo de un método, recortado por balance de llaves a partir de su firma. */
function body(lines: string[], signature: string, where: string): string {
  const start = lines.findIndex(row => row.includes(signature));
  if (start < 0) throw new Error(`Falta ${signature} en ${where}`);
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index]) {
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return lines.slice(start, index + 1).join('\n');
    }
  }
  throw new Error(`${signature} no cierra su llave en ${where}`);
}

const KEY = 'message.edit.media';
const ARM = `case "${KEY}":`;

describe('ronda CK · el puente de Android', () => {
  it('la clave está declarada y su brazo entra con la familia de editar', () => {
    expect(policy).toContain(`static { METHODS.add("${KEY}"); }`);
    const arm = atJava(ARM);
    expect(bridge[arm - 1]).toContain('editMessageMedia(p,a);break;');
    // El sitio no es decorativo: la línea de arriba es la que enruta `message.edit`, `message.edit.caption`,
    // `message.delete`, `message.copy` y `message.forward` a `messageAction`.
    expect(bridge[arm - 2]).toContain('case "message.edit":case "message.edit.caption":');
    expect(count(ARM, bridge)).toBe(1);
  });

  it('el cuerpo mira el vale, clasifica, arma el contenido y pregunta a Telegram antes de escribir', () => {
    const escrita = body(bridge, 'private void editMessageMedia(', 'NativeBridge.java');
    const orden = [
      'if(item==null||item.account!=session.selfId||item.chat!=message.chatId)throw new IllegalArgumentException(MessageMediaEdit.CHANGED);',
      'String current=MessageMediaEdit.currentKind(message.content),wanted=MessageMediaEdit.wantedKind(item.mime);',
      'TdApi.InputMessageContent content=mediaContent(item,wanted,message.content);',
      'perform(new TdApi.GetMessageProperties(chatId,messageId),a,props->{',
      'String problem=MessageMediaEdit.problem(props.canEditMedia,current,wanted,albumId);',
      'perform(new TdApi.EditMessageMedia(chatId,messageId,null,content),a,edited->{',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = escrita.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // Lo último que se escribe es el archivo local, y solo después de que TDLib confirme la edición.
    const confirmada = escrita.indexOf('perform(new TdApi.EditMessageMedia');
    expect(escrita.slice(confirmada).indexOf('attachments.remove(token)')).toBeGreaterThan(-1);
    expect(escrita.slice(confirmada).indexOf('schedule();a.ok(true);')).toBeGreaterThan(-1);
  });

  it('el contenido nuevo conserva el pie y las dos banderas del contenido viejo', () => {
    const arma = body(bridge, 'private TdApi.InputMessageContent mediaContent(', 'NativeBridge.java');
    expect(count('MessageMediaEdit.captionOf(current)', bridge)).toBe(1);
    expect(count('MessageMediaEdit.showsCaptionAboveMedia(current)', bridge)).toBe(1);
    expect(count('MessageMediaEdit.hasSpoiler(current)', bridge)).toBe(1);
    for (const tipo of ['PHOTO', 'ANIMATION', 'VIDEO', 'AUDIO']) {
      expect(arma, `falta ${tipo}`).toContain(`MessageMediaEdit.${tipo}`);
    }
    expect(arma).toContain('else built=documentContent(item);');
    // El pie se aplica en los cinco contenidos, no en los tres que llevan banderas.
    expect(count('value.caption=caption;value.showCaptionAboveMedia=above;value.hasSpoiler=spoiler;', arma)).toBe(3);
    expect(arma).toContain('((TdApi.InputMessageAudio)built).caption=caption;');
    expect(arma).toContain('((TdApi.InputMessageDocument)built).caption=caption;');
  });

  it('los tres constructores nuevos miden lo que la librería pide y nada más', () => {
    const video = body(bridge, 'private TdApi.InputMessageContent videoContent(', 'NativeBridge.java');
    expect(video).toContain('int[] box=animationBox(item.path.getPath());');
    expect(video).toContain('video.width=box[0];video.height=box[1];video.duration=box[2];');
    expect(video).toContain('video.supportsStreaming=MessageMediaEdit.streams(item.mime);');
    const audio = body(bridge, 'private TdApi.InputMessageContent audioContent(', 'NativeBridge.java');
    expect(audio).toContain('audio.duration=mediaSeconds(item.path.getPath());');
    // Título e intérprete quedan vacíos a propósito: la librería dice «may be replaced by the server».
    expect(audio).toContain('new TdApi.InputMessageAudio(audio,new TdApi.FormattedText("",new TdApi.TextEntity[0]))');
    expect(body(bridge, 'private TdApi.InputMessageContent documentContent(', 'NativeBridge.java'))
      .toContain('return new TdApi.InputMessageDocument(document,new TdApi.FormattedText("",new TdApi.TextEntity[0]));');
    // El documento está dicho una sola vez: el envío suelto dejó de escribirlo a mano.
    expect(count('new TdApi.InputMessageDocument(document,new TdApi.FormattedText("",new TdApi.TextEntity[0]));', bridge)).toBe(1);
    expect(count('documentContent(', bridge)).toBe(3);
    expect(bridge[atJava('else{if(permissions!=null&&!permissions.canSendDocuments)throw new IllegalArgumentException();content=documentContent(item);}') - 1])
      .toContain('content=documentContent(item);');
  });

  it('la bandera de la pantalla sale de canEditMedia y de los cinco tipos, no de la fantasía del cliente', () => {
    const fila = atJava('"editMedia",props.canEditMedia');
    expect(bridge[fila - 1]).toContain('"editMedia",props.canEditMedia&&!MessageMediaEdit.currentKind(message.content).isEmpty()');
    // La otra cara de la misma línea: `editCaption` sigue pidiendo `canBeEdited`, así que las tres banderas
    // conviven sin pisarse.
    expect(bridge[fila - 1]).toContain('"editCaption",props.canBeEdited&&hasCaption(message)');
    expect(count('"editMedia"', bridge)).toBe(1);
  });
});

describe('ronda CK · la clase pura y su prueba JVM', () => {
  it('las cuatro frases se dicen una sola vez en la capa y el puente no las repite', () => {
    const frases = [
      'Telegram no permite cambiar el medio de este mensaje.',
      'Este mensaje no tiene un medio que se pueda sustituir.',
      'Dentro de un álbum solo se puede cambiar una foto por un vídeo, o un vídeo por una foto.',
      'La conversación cambió. Vuelve a elegir el archivo.',
    ];
    for (const frase of frases) {
      expect(count(frase, pure), frase).toBe(1);
      expect(count(frase, bridge), `${frase} duplicada en el puente`).toBe(0);
    }
    expect(count('Telegram no permite cambiar el medio de este mensaje.', jvm)).toBe(0);
  });

  it('el orden de las negativas está medido dentro del cuerpo de problem', () => {
    const regla = body(pure, 'static String problem(', 'MessageMediaEdit.java');
    const forma = regla.indexOf('if (current.equals(NONE)) return NOT_MEDIA;');
    const permiso = regla.indexOf('if (!canEditMedia) return REFUSED;');
    const album = regla.indexOf('if (mediaAlbumId != 0 && !exchangeableInAlbum(current, wanted)) return ALBUM_TYPE;');
    expect(forma).toBeGreaterThan(-1);
    expect(permiso).toBeGreaterThan(forma);
    expect(album).toBeGreaterThan(permiso);
    expect(regla.indexOf('return null;')).toBeGreaterThan(album);
  });

  it('la clasificación del archivo es la misma que ya usaba el envío suelto', () => {
    const wanted = body(pure, 'static String wantedKind(', 'MessageMediaEdit.java');
    for (const mime of ['image/gif', 'image/jpeg', 'image/png', 'image/webp']) {
      expect(wanted, mime).toContain(`"${mime}"`);
      // La misma cadena, sin cambiar de sitio, es la que decide el envío en Android.
      expect(bridge.join('\n'), `${mime} en el envío`).toContain(`"${mime}"`);
    }
    expect(wanted).toContain('if (value.startsWith("video/")) return VIDEO;');
    expect(wanted).toContain('if (value.startsWith("audio/")) return AUDIO;');
    expect(wanted).toContain('return DOCUMENT;');
    // Ningún archivo se queda sin tipo: el documento es el final de la cadena, no un caso perdido.
    expect(wanted.trim().split('\n').at(-1)?.trim()).toBe('}');
  });

  it('los cinco tipos y el vacío son las únicas palabras que conoce la regla del álbum', () => {
    for (const nombre of ['PHOTO', 'VIDEO', 'ANIMATION', 'AUDIO', 'DOCUMENT']) {
      expect(count(`static final String ${nombre} =`, pure), nombre).toBe(1);
    }
    expect(pure[atPure('static final String NONE =') - 1]).toContain('static final String NONE = "";');
    const album = body(pure, 'static boolean exchangeableInAlbum(', 'MessageMediaEdit.java');
    expect(count('PHOTO', album)).toBe(2);
    expect(count('VIDEO', album)).toBe(2);
  });

  it('la prueba JVM existe, cubre las reglas y no deja caracteres CJK en los archivos nuevos', () => {
    expect(count('@Test', jvm)).toBe(9);
    expect(jvm[en('public class MessageMediaEditTest', jvm, 'MessageMediaEditTest.java') - 1]).toContain('public class MessageMediaEditTest {');
    for (const archivo of [pure, jvm]) {
      const cuerpo = archivo.join('\n');
      expect(/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(cuerpo), 'caracteres CJK en la capa nueva').toBe(false);
    }
    // La librería, medida en la fuente vendada: cinco tipos en las tres funciones que editan medio.
    const cinco = 'inputMessageAnimation, inputMessageAudio, inputMessageDocument, inputMessagePhoto, or inputMessageVideo.';
    expect(tdlib.join('\n').split(cinco).length - 1).toBeGreaterThanOrEqual(3);
  });
});

describe('ronda CK · la pantalla y el aviso', () => {
  it('la entrada del menú solo se ofrece donde hay brazo y pide revisión antes de escribir', () => {
    const fila = atApp('props.editMedia&&<MenuItem');
    expect(app[fila - 1]).toContain('label="Cambiar el archivo del mensaje"');
    expect(app[fila - 1]).toContain('onClick={()=>replaceMessageMedia(message,props)}');
    // Las tres caras de editar están juntas, y la de texto sigue pidiendo `props.edit`.
    expect(app[fila - 5]).toContain('props.edit&&<MenuItem icon={<Pencil/>} label="Editar texto"');
    expect(app[fila - 4]).toContain('props.editCaption&&<MenuItem icon={<Pencil/>}');
    const flujo = atApp('function replaceMessageMedia(message:Message,props:Properties)');
    const linea = app[flujo - 1];
    expect(count('Cambiar el archivo del mensaje', app)).toBe(2);
    expect(linea).toContain("run<PickedAttachment>('attachment.pick',{})");
    expect(linea).toContain(`run<boolean>('${KEY}',{id:message.id,token:item.token})`);
    expect(linea).toContain('Se conservará el texto');
    expect(linea).toContain('El archivo se sustituye solo al confirmar');
    expect(linea).toContain('Telegram no deja cambiarlo por otro tipo que no sea foto o vídeo');
  });

  it('el vale se descarta al cerrar y la pantalla no escribe si cambió la conversación', () => {
    const linea = app[atApp('function replaceMessageMedia(message:Message,props:Properties)') - 1];
    expect(linea).toContain('if(!same()){discard();return;}');
    expect(linea).toContain('onClose:()=>{if(!saving)discard();}');
    expect(linea).toContain("const discard=()=>void request('attachment.discard',{token:item.token}).catch(()=>{});");
    // `saving` solo impide el descarte cuando la orden ya salió: si Telegram niega, el archivo se sigue pudiendo tirar.
    expect(count('let saving=false;', linea)).toBe(1);
  });

  it('la bandera viaja en el contrato y el andamio la publica con la forma de la fila', () => {
    expect(contract).toContain('editCaption: boolean; editMedia?: boolean; caption: string;');
    const linea = preview[en('editMedia: own && !!message?.media,', preview, 'preview.ts') - 1];
    expect(linea.trim()).toBe('editMedia: own && !!message?.media,');
    // El espejo no tiene `canEditMedia` detrás, así que lo que afirma es la forma; lo que niega lo niega el puente.
    expect(preview.join('\n')).toContain('La tercera —`editMedia`— es en Android');
  });

  it('Windows ya tiene brazo: el aviso lo declara disponible y la pantalla lo ofrece ahí igual', () => {
    const fila = en("'message.edit.media'", scope, 'desktopScope.ts');
    expect(scope[fila - 1]).toContain("label: 'editar, borrar y reenviar mensajes'");
    expect(count(`'${KEY}'`, scope)).toBe(1);
    // Está en la lista que afirma, no en la que se promete para después: la prueba es el orden del archivo.
    expect(scope.slice(0, fila).join('\n')).toContain('DESKTOP_AVAILABLE');
    expect(scope.slice(0, fila).join('\n')).not.toContain('DESKTOP_PENDING');
    expect(desktopGapRefusal(KEY)).toBeUndefined();
    // Y la puerta de escritorio del menú cayó: la única negación que queda sobre esta orden es la del puente.
    expect(app[atApp('props.editMedia&&<MenuItem') - 1]).not.toContain('!desktop');
  });
});

describe('ronda CK · las citas', () => {
  /** Lo que tiene que decir hoy la primera línea de cada cita. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    'TdApi.java:120729': 'public static class EditMessageMedia extends Function<Message> {',
    'TdApi.java:120743': 'New content of the message. Must be one of the following types:',
    'TdApi.java:119451': 'New content of the message. Must be one of the following types:',
    'TdApi.java:120385': 'New content of the message. Must be one of the following types:',
    'TdApi.java:120725': "The type of message content in an album can't be changed with exception",
    'TdApi.java:54711': 'True, if the message can be edited using the method editMessageMedia.',
    'TdApi.java:54713': 'public boolean canEditMedia;',
    'BridgePolicy.java:53': 'static { METHODS.add("message.edit.media"); }',
    'NativeBridge.java:831': 'case "message.edit.media":editMessageMedia(p,a);break;',
    'NativeBridge.java:4326': '"editMedia",props.canEditMedia&&!MessageMediaEdit.currentKind(message.content).isEmpty()',
    'NativeBridge.java:4616': 'private void editMessageMedia(JSONObject p,Answer a)throws Exception{',
    'NativeBridge.java:4636': 'private TdApi.InputMessageContent mediaContent(Attachment item,String kind,TdApi.MessageContent current){',
    'NativeBridge.java:4653': 'private TdApi.InputMessageContent videoContent(Attachment item){',
    'NativeBridge.java:4662': 'private TdApi.InputMessageContent audioContent(Attachment item){',
    'NativeBridge.java:4669': 'private TdApi.InputMessageContent documentContent(Attachment item){',
    'NativeBridge.java:4675': 'private static int mediaSeconds(String path){',
    'MessageMediaEdit.java:41': 'Telegram no permite cambiar el medio de este mensaje.',
    'MessageMediaEdit.java:43': 'Este mensaje no tiene un medio que se pueda sustituir.',
    'MessageMediaEdit.java:45': 'Dentro de un álbum solo se puede cambiar una foto por un vídeo, o un vídeo por una foto.',
    'MessageMediaEdit.java:47': 'La conversación cambió. Vuelve a elegir el archivo.',
    'MessageMediaEdit.java:53': 'static String currentKind(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:67': 'static String wantedKind(String mime) {',
    'MessageMediaEdit.java:81': 'static String problem(boolean canEditMedia, String current, String wanted, long mediaAlbumId) {',
    'MessageMediaEdit.java:89': 'static boolean exchangeableInAlbum(String current, String wanted) {',
    'MessageMediaEdit.java:97': 'static TdApi.FormattedText captionOf(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:111': 'static boolean showsCaptionAboveMedia(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:119': 'static boolean hasSpoiler(TdApi.MessageContent content) {',
    'MessageMediaEdit.java:131': 'static boolean streams(String mime) {',
    'App.tsx:1074': '{props.editMedia&&<MenuItem icon={<FileText/>} label="Cambiar el archivo del mensaje"',
    'App.tsx:1138': 'function replaceMessageMedia(message:Message,props:Properties)',
    'contract.ts:213': 'export interface Properties {',
    'desktopScope.ts:28': "'message.edit', 'message.edit.caption', 'message.edit.media',",
    'preview.ts:401': 'editMedia: own && !!message?.media,',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'NativeBridge.java:4616': [4634, '}'],
    'NativeBridge.java:4636': [4651, '}'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'App.tsx' ? app
        : file === 'preview.ts' ? preview
          : file === 'contract.ts' ? text('./contract.ts').split('\n')
            : file === 'desktopScope.ts' ? scope
              : file === 'MessageMediaEdit.java' ? pure
                : file === 'MessageMediaEditTest.java' ? jvm
                  : rows(`${javaDir}${file}`);
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const files = [
    `${javaDir}MessageMediaEdit.java`,
    `${jvmDir}MessageMediaEditTest.java`,
    './rondaCK.test.ts',
  ];
  const written = new Map<string, number>();
  for (const path of files) for (const row of rows(path)) {
    for (const match of row.matchAll(/([A-Za-z][\w.]*\.(?:java|cs|tsx|ts)):(\d+)(?:-(\d+))?/g)) {
      const start = `${match[1]}:${match[2]}`;
      written.set(start, Math.max(written.get(start) ?? 0, Number(match[3] ?? 0)));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [at, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(at);
      const [file] = citation.split(':');
      expect(lineOf(file, at), `${citation} termina en ${at}`).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    for (const path of files) rows(path).forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${path.split('/').pop()}:${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
