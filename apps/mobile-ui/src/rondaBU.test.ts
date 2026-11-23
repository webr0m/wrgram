import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda BU: un GIF que ya está en el dispositivo deja de viajar como documento.
 *
 * Las frases y los literales de abajo se copian carácter a carácter de las cuatro capas; si alguna cambia, la
 * prueba que falla dice en cuál. No se comprueban comportamientos de red: lo que se puede vigilar sin cuenta son
 * las normas, y esas son las que separan una animación de una ficha más del chat.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopAttachment.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');
const picker = text('./ExpressionPicker.tsx');

const count = (needle: string, source: string) => source.split(needle).length - 1;

function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta «${needle}»`);
  return index;
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

describe('ronda BU · Android: el GIF del teléfono sale por la vía de animación', () => {
  const gifBranch = 'else if("image/gif".equals(item.mime)){if(permissions!=null&&!permissions.canSendOtherMessages)throw new IllegalArgumentException("Este chat no permite enviar GIF o stickers.");content=animationContent(item);}';

  it('el selector se filtra solo cuando la pantalla pide un GIF', () => {
    expect(count('activity.picker.launch("gif".equals(p.optString("kind"))?new String[]{"image/gif"}:"photo".equals(p.optString("kind"))?new String[]{"image/*"}:new String[]{"*/*"});', java)).toBe(1);
    // La negativa del selector sigue siendo la misma frase que la constante de Windows.
    expect(java).toContain('picking=null;throw new IllegalArgumentException("No hay un selector de archivos disponible.");');
    // Lo que se lee del parámetro es la palabra del botón, no el MIME: el MIME manda al enviar, como en Windows.
    expect(count('p.optString("kind")', java)).toBe(2);
  });

  it('la rama de GIF va entre la foto y el documento, que es el orden que decide el resultado', () => {
    expect(count(gifBranch, java)).toBe(1);
    // Antes: la terna de MIMEs de foto. Después: el documento genérico con `canSendDocuments`.
    expect(at('item.mime.equals("image/jpeg")||item.mime.equals("image/png")||item.mime.equals("image/webp")', java))
      .toBeLessThan(at(gifBranch, java));
    expect(at(gifBranch, java))
      .toBeLessThan(at('else{if(permissions!=null&&!permissions.canSendDocuments)', java));
  });

  it('el chat que no permite GIF lo niega con la frase que ya decía el catálogo', () => {
    const refusal = 'Este chat no permite enviar GIF o stickers.';
    expect(count(`"${refusal}"`, java)).toBe(1);
    expect(picker).toContain(`'${refusal}'`);
    // TDLib no tiene un bit para GIF: el que cubre stickers y animaciones es `canSendOtherMessages`, y el de
    // los GIF sueltos no existe en ningún chat.
    expect(count('canSendGifs', java)).toBe(0);
    expect(gifBranch).toContain('!permissions.canSendOtherMessages');
  });

  it('animationContent es la única vía de animación del puente de archivos', () => {
    // La terna construida a mano sigue viviendo dentro de `animationContent`.
    expect(count('new TdApi.InputMessageAnimation(animation,new TdApi.FormattedText("",new TdApi.TextEntity[0]),false,false);', java)).toBe(1);
    // Definición, llamada desde el envío de archivos y llamada desde `mediaContent` (ronda CK): ningún otro sitio
    // cuela un archivo del teléfono como animación.
    expect(count('animationContent(', java)).toBe(3);
    // La tercera llamada es la nueva rama de `mediaContent`, que reusa la pieza en vez de armar otra vía.
    expect(tsRegion('private TdApi.InputMessageContent mediaContent(Attachment item,String kind,TdApi.MessageContent current)').includes('animationContent')).toBe(true);
    // El catálogo (ronda BS) arma su propia terna; aquí la pieza local entra por `InputFileLocal`.
    expect(count('animation.animation=new TdApi.InputFileLocal(item.path.getPath());', java)).toBe(1);
    expect(tsRegion('private TdApi.InputMessageContent animationContent(Attachment item)')).toContain('int[] box=animationBox(item.path.getPath());');
  });

  it('las medidas se piden al contenedor y, si no las da, al mapa de bits', () => {
    const body = tsRegion('private static int[] animationBox(String path)');
    expect(body).toContain('METADATA_KEY_VIDEO_WIDTH');
    expect(body).toContain('METADATA_KEY_VIDEO_HEIGHT');
    expect(body).toContain('METADATA_KEY_DURATION');
    // La duración llega en milisegundos y TDLib la quiere en segundos.
    expect(body).toContain('/1000.0');
    // Un fallo leyendo no deja medidas a medias: vuelven las tres a cero.
    expect(body).toContain('catch(Exception ignored){width=0;height=0;duration=0;}');
    expect(body).toContain('finally{try{probe.release();}catch(Exception ignored){}}');
    expect(body).toContain('if(width<=0||height<=0){');
    expect(body).toContain('bounds.inJustDecodeBounds=true;');
    expect(body).toContain('return new int[]{width,height,duration};');
    // El hueco que no devuelve el contenedor se escribe «0», que es como TDLib entiende «sin medir».
    expect(line('private static String zero(String value)', java)).toContain('return value==null||value.isEmpty()?"0":value;');
  });

  it('un vídeo no se cuela por la vía de animación', () => {
    // Ruta descartada a propósito: un `.mp4` del álbum familiar enviado como GIF dejaría de ser vídeo.
    expect(count('"video/mp4".equals(item.mime)', java)).toBe(0);
    expect(tsRegion('private void sendAttachment(JSONObject p,Answer a)').includes('animationContent')).toBe(true);
    // La única MIME que abre la rama es la del GIF.
    expect(count('"image/gif".equals(item.mime)', tsRegion('private void sendAttachment(JSONObject p,Answer a)'))).toBe(1);
  });
});

describe('ronda BU · Windows: la misma norma escrita dos veces menos', () => {
  it('las cinco reglas del GIF viven en la clase de normas', () => {
    expect(rules).toContain('public static string PickerTitle(string? kind) => Gif(kind) ? "Enviar un GIF" : "Enviar un archivo";');
    expect(rules).toContain('public static string PickerFilter(string? kind) => Gif(kind) ? "GIF|*.gif" : "Todos los archivos|*.*";');
    expect(rules).toContain('private static bool Gif(string? kind) => string.Equals(kind, "gif", StringComparison.Ordinal);');
    expect(rules).toContain('public static bool IsAnimation(string? mime) => string.Equals(mime, "image/gif", StringComparison.Ordinal);');
    expect(rules).toContain('? [new DocumentAttributeFilename { file_name = name }, new DocumentAttributeAnimated()]');
    expect(rules).toContain(': [new DocumentAttributeFilename { file_name = name }];');
  });

  it('el host pasa el kind del botón al diálogo y la regla al cable', () => {
    expect(count('"attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),', service)).toBe(1);
    expect(count('private async Task<object?> AttachmentPickAsync(string kind)', service)).toBe(1);
    expect(count('Title = DesktopAttachment.PickerTitle(kind),', service)).toBe(1);
    expect(count('Filter = DesktopAttachment.PickerFilter(kind),', service)).toBe(1);
    expect(count('attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)', service)).toBe(1);
    // El host no vuelve a escribir la palabra «gif» ni el tipo: se pregunta a la regla.
    const body = csBody('AttachmentPickAsync');
    expect(count('"gif"', body)).toBe(0);
    expect(count('"image/gif"', csBody('SendAttachmentAsync'))).toBe(0);
  });

  it('el GIF no es foto: la terna de siempre sigue siendo de tres', () => {
    const photoRule = line('public static bool IsPhoto', rules);
    expect(photoRule).toBe('public static bool IsPhoto(string? mime) => mime is "image/jpeg" or "image/png" or "image/webp";');
    expect(count('image/gif', photoRule)).toBe(0);
    // Y el tipo sí está en la tabla, que es lo que hace que salga con el MIME correcto.
    expect(count('["gif"] = "image/gif"', rules)).toBe(1);
    expect(count('gif: \'image/gif\'', preview)).toBe(1);
  });

  it('lo que Windows todavía no hace, escrito está para no prometerlo', () => {
    // El host no consulta los permisos del chat antes de enviar: la negativa de «este chat no permite GIF»
    // solo la dice Android. Telegram rechazará el envío y el puente lo contará como error de envío.
    expect(count('canSend', csBody('SendAttachmentAsync'))).toBe(0);
  });
});

describe('ronda BU · la pantalla', () => {
  const row = '<MenuItem icon={<Film/>} label="GIF del dispositivo" onClick={()=>{setDialog(undefined);attach(\'attachment.pick\',\'gif\');}}/>';

  it('la fila nueva está al lado de la de archivo y no escondida por la plataforma', () => {
    expect(count(row, app)).toBe(1);
    expect(at('label="Archivo o foto"', app)).toBeLessThan(at(row, app));
    expect(count('{!desktop&&<MenuItem icon={<Film/>}', app)).toBe(0);
    expect(count('Film', app)).toBeGreaterThan(1);
    expect(app).toMatch(/import \{[^}]*\bFilm\b[^}]*\} from 'lucide-react';/);
  });

  it('el botón manda el kind y la clasificación mira el kind o la extensión', () => {
    expect(count('function attach(method:\'attachment.pick\'|\'attachment.camera\'=\'attachment.pick\',kind=\'\'){', app)).toBe(1);
    expect(count('run<PickedAttachment>(method,kind?{kind}:{})', app)).toBe(1);
    expect(app).toContain("const gif=kind==='gif'||item.mime==='image/gif'||item.name.toLowerCase().endsWith('.gif');");
    // Sin kind la llamada es la de siempre: «Archivo o foto» no puede volverse GIF por accidente.
    expect(count('onClick={()=>{setDialog(undefined);attach();}}/>', app)).toBe(1);
  });

  it('la confirmación dice GIF cuando lo es, y lo que eso significa en Telegram', () => {
    expect(count('gif?\'Enviar GIF\':photo?\'Enviar foto\':\'Enviar archivo\'', app)).toBe(1);
    expect(count('Telegram lo guarda como animación y lo reproduce dentro de la burbuja, no como un archivo que hay que abrir.', app)).toBe(1);
    expect(count('>Enviar {gif?\'GIF\':photo?\'foto\':\'archivo\'}<Send size={18}/>', app)).toBe(1);
    // La frase del límite es la misma en las dos ventanas: la de enviar y la de «Cambiar el archivo del mensaje»
    // (ronda CK), que copia el texto carácter a carácter. Dos apariciones, ninguna nueva redactada.
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", app)).toBe(2);
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", appBody('function previewAttachment'))).toBe(1);
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", appBody('function replaceMessageMedia'))).toBe(1);
  });

  it('el selector sigue siendo una orden con plazo de persona', () => {
    expect(bridge).toContain("'attachment.pick'");
    expect(count('USER_DRIVEN.has(method) ? 300000', bridge)).toBe(1);
    // La ronda CP le dio plazo de copia porque copiar gigas puede pasar de los 300 s del diálogo; la ronda CO
    // añadió `share.import`, que también copia. El selector sigue en la lista de las que esperan a la persona.
    expect(bridge).toContain("const IMPORT_COPY = new Set(['attachment.pick', 'attachment.album', 'share.import']);");
    expect(count('IMPORT_COPY.has(method) ? 900000', bridge)).toBe(1);
  });

  it('el andamio de escritorio reproduce el filtro', () => {
    expect(tsBody('desktopAttachmentPick')).toContain('String(params.kind ?? \'\') === \'gif\'');
    expect(tsBody('desktopAttachmentPick')).toContain('\'Animacion de la barra.gif\'');
    expect(count("if (method === 'attachment.pick' && state.platform === 'desktop') return desktopAttachmentPick(params, state);", preview)).toBe(1);
  });
});

describe('ronda BU · no hay puente nuevo que vigilar', () => {
  it('la orden sigue siendo la de siempre, con un parámetro más', () => {
    for (const method of ['attachment.pick', 'attachment.discard', 'send.attachment']) expect(policy).toContain(`"${method}"`);
    expect(count('"attachment.gif"', policy)).toBe(0);
    expect(count('"send.gif"', policy)).toBe(0);
    expect(count('"attachment.deviceGif"', policy)).toBe(0);
  });
});

/** Cuerpo de un bloque de Java que empieza en la firma dada y cierra a su misma sangría. */
function tsRegion(signature: string): string {
  const start = at(signature, java);
  const end = java.indexOf('\n    }', start);
  if (end < 0) throw new Error(`Sin cierre para ${signature}`);
  return java.slice(start, end);
}

/** Cuerpo de una función de App.tsx, desde su firma hasta la llave que la cierra. */
function appBody(signature: string): string {
  const start = at(signature, app);
  let depth = 0;
  for (let i = app.indexOf('{', start); i < app.length; i++) {
    if (app[i] === '{') depth++;
    else if (app[i] === '}' && --depth === 0) return app.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${signature}`);
}

/** La línea, sin la sangría, en la que aparece por primera vez el texto dado. */
function line(needle: string, source: string): string {
  const found = source.split('\n').find(entry => entry.includes(needle));
  if (!found) throw new Error(`Falta la línea «${needle}»`);
  return found.trim();
}
