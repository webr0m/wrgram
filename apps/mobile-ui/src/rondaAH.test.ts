import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Message } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const editRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageEdit.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const dto = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que una capa asigna a una constante en C# (`const string`). */
function csSentence(name: string, from = editRules): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript (`name: '...'`). */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La prosa que precede a un método del host, fuera del cuerpo. */
function csDoc(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  return from.slice(from.lastIndexOf('/// <summary>', start), start);
}

const count = (needle: string, source: string) => source.split(needle).length - 1;

describe('ronda AH · la edición deja de ser un `false` a secas', () => {
  it('las dos banderas las decide una regla, no una constante', () => {
    const props = csBody('Properties');
    expect(props).toContain('edit = canEdit,');
    expect(props).toContain('editCaption = canEditCaption,');
    expect(props).toContain('var canEdit = DesktopMessageEdit.CanEditText(message, kind, channel);');
    expect(props).toContain('var canEditCaption = DesktopMessageEdit.CanEditCaption(message, kind, channel);');
    expect(props).not.toContain('edit = false');
    expect(props).not.toContain('editCaption = false');
  });

  it('el pie viaja en `caption`, que es de donde la pantalla rellena la casilla', () => {
    expect(csBody('Properties')).toContain('caption = canEditCaption ? message?.Text ?? "" : "",');
    // En Android sale de `dto.caption(message)`; aquí el pie de un adjunto vive en el mismo campo que el texto.
    expect(java).toContain('"caption",dto.caption(message)');
  });

  it('el derecho es el de siempre: autoría, o los permisos que Telegram dio en el canal', () => {
    const rules = csBody('ChannelRightsToEdit', editRules);
    expect(rules).toContain('ChatAdminRights.Flags.edit_messages');
    // Un miembro que ya se fue o una fila recortada (`min`) no prometen nada que el servidor vaya a rechazar.
    expect(rules).toContain('Channel.Flags.left');
    expect(rules).toContain('Channel.Flags.min');
    expect(rules).toContain('Channel.Flags.creator');
  });

  it('el texto se niega sobre un aviso del sistema y sobre un mensaje con adjunto', () => {
    const body = csBody('CanEditText', editRules);
    expect(body).toContain('row.ServiceNotice || row.Media != null');
    // Y el pie, sobre una fila que no lo tenga. La clase real del adjunto solo la ve la conversión.
    expect(csBody('CanEditCaption', editRules)).toContain('!row.HasCaption');
    expect(dto).toMatch(/HasCaption\s*\{\s*get;\s*set;\s*\}/);
    expect(service).toContain('dto.HasCaption = DesktopMessageEdit.HasCaption(message.media);');
  });

  it('un sticker y una nota de voz no llevan pie, aunque lleguen como documento', () => {
    const body = csBody('Uncaptioned', editRules);
    expect(body).toContain('DocumentAttributeSticker');
    expect(body).toContain('DocumentAttributeAudio.Flags.voice');
    expect(body).toContain('DocumentAttributeVideo.Flags.round_message');
  });

  it('las dos órdenes entran en el despacho antes del genérico de escritorio', () => {
    expect(count('"message.edit" => await EditMessageAsync(args, caption: false),', service)).toBe(1);
    expect(count('"message.edit.caption" => await EditMessageAsync(args, caption: true),', service)).toBe(1);
    expect(service.indexOf('"message.edit" =>')).toBeLessThan(
      service.indexOf('_ => throw new BridgeException($"No disponible en escritorio (beta)'),
    );
  });

  it('y son métodos que el puente ya conocía, así que no nacen huérfanos', () => {
    for (const method of ['message.edit', 'message.edit.caption']) {
      expect(policy).toContain(`"${method}"`);
      expect(java).toContain(`"${method}"`);
    }
    // Los dos topes vienen de `BridgePolicy.text`, que es lo que Android impone sobre el mismo parámetro.
    expect(java).toContain('BridgePolicy.text(p,"text",4096)');
    expect(java).toContain('BridgePolicy.text(p,"caption",1024)');
    expect(editRules).toContain('public const int MaxText = 4096;');
    expect(editRules).toContain('public const int MaxCaption = 1024;');
  });

  it('la negativa es la frase de Android, copiada y no inventada', () => {
    expect(csSentence('Refused')).toBe('Telegram no permite esta acción sobre el mensaje.');
    expect(java).toContain(`"${csSentence('Refused')}"`);
  });
});

describe('ronda AH · escribir obliga a leer, porque la petición reemplaza', () => {
  it('primero se pide la fila, y solo después se manda la escritura', () => {
    const body = csBody('EditMessageAsync');
    expect(body.indexOf('GetMessages')).toBeLessThan(body.indexOf('Messages_EditMessage'));
    expect(body).toContain('new InputMessageID { id = ids[0] }');
  });

  it('el archivo se reconstruye con lo que Telegram acaba de devolver', () => {
    const body = csBody('EditMessageAsync');
    expect(body).toContain('DesktopMessageEdit.MediaOf(fresh.media)');
    expect(body).toContain('media: media');
    expect(body).toContain('message: value');
    // El pie viaja en `message`: las clases `InputMedia*` de esta versión no tienen campo de caption, y así lo
    // dice la prosa del método junto con la petición hermana que lo recibe igual.
    expect(csDoc('EditMessageAsync')).toContain('messages.sendMedia');
  });

  it('las tres faltas que solo se ven leyendo están dichas con su nombre', () => {
    const body = csBody('EditMessageAsync');
    expect(body).toContain('DesktopMessageEdit.Gone');
    expect(body).toContain('DesktopMessageEdit.NotRead');
    expect(body).toContain('DesktopMessageEdit.Changed');
    // Dos por el pie —la clase cambió y no hay archivo que reconstruir— y una por el texto.
    expect(count('DesktopMessageEdit.Changed', body)).toBe(3);
  });

  it('el formato se parsea una vez y se convierte para la fila', () => {
    const body = csBody('EditMessageAsync');
    expect(body).toContain('var entities = ParseEntities(args);');
    expect(body).toContain('entities: entities');
    expect(body).toContain('row.Entities = ConvertEntities(entities);');
  });

  it('confirmado el cambio, la ventana se actualiza sin esperar al aviso', () => {
    const body = csBody('EditMessageAsync');
    expect(body).toContain('row.Text = value;');
    expect(body).toContain('row.Edited = true;');
    expect(body).toContain('texts[ids[0]] = value;');
    // El `updateEditMessage` también sabe aplicar el host, así que las dos rutas coinciden.
    expect(service).toContain('case UpdateEditMessage edit:');
  });

  it('el porqué está escrito junto al método, no solo en la cabeza', () => {
    const doc = csDoc('EditMessageAsync');
    expect(doc).toContain('messages.editMessage');
    expect(doc).toContain('access_hash');
    expect(doc).toContain('reemplaza');
  });

  it('el vacío se corta aquí, porque el campo multilínea de la pantalla no lo corta', () => {
    const body = csBody('EditMessageAsync');
    expect(body).toContain('!DesktopMessageEdit.AllowsBlank(caption)');
    expect(editRules).toContain('public static bool AllowsBlank(bool caption) => caption;');
    // El pie sí admite quedarse limpio; el texto de un mensaje, no.
    expect(app).toContain('initial={props.caption} maximum={1024} allowEmpty');
  });
});

describe('ronda AH · el espejo dice lo mismo que el puente', () => {
  it('las cinco frases, carácter a carácter', () => {
    expect(tsProperty('rights')).toBe(csSentence('Refused'));
    expect(tsProperty('blank')).toBe(csSentence('Blank'));
    expect(tsProperty('gone')).toBe(csSentence('Gone'));
    expect(tsProperty('notRead')).toBe(csSentence('NotRead'));
    expect(tsProperty('changed')).toBe(csSentence('Changed'));
  });

  it('y el tope largo se escribe con la misma plantilla', () => {
    const cs = /TooLong\(int maximum\) => \$"([^"]+)"/.exec(editRules);
    const ts = /tooLong: \(maximum: number\) => `([^`]+)`/.exec(preview);
    expect(cs).not.toBeNull();
    expect(ts).not.toBeNull();
    expect(ts![1].replace('${maximum}', '{maximum}')).toBe(cs![1]);
    expect(preview).toContain('EDIT_MAX = { text: 4096, caption: 1024 }');
  });

  it('las dos ramas entran por la puerta de la plataforma', () => {
    expect(count("if (method === 'message.edit' && state.platform === 'desktop') return desktopEdit(params, state, false);", preview)).toBe(1);
    expect(count("if (method === 'message.edit.caption' && state.platform === 'desktop') return desktopEdit(params, state, true);", preview)).toBe(1);
  });

  it('las dos entradas del menú son las mismas en Android y en Windows', () => {
    // Antes solo las pintaba la rama de Android: el puente podía estar conectado y la pantalla seguir sin ofrecerlo.
    expect(count('{editEntries(props)}', app)).toBe(2);
    const desktop = app.split('async function messageMenu')[1].split('});return;')[0];
    expect(desktop).toContain('if(desktop){');
    expect(desktop).toContain('{editEntries(props)}');
    // Las dos etiquetas viven una sola vez en el menú del mensaje; la segunda «Editar texto» que cuenta el
    // fichero es la del visor de historias, que escribe por `story.edit.caption` y no por `message.edit`.
    expect(count('label="Editar texto"', app)).toBe(2);
    expect(count('label="Editar texto del archivo"', app)).toBe(1);
    expect(count('message.edit.caption', app)).toBe(2);
  });

  it('el andamio tiene una fila propia con foto, que es la única forma de tocar el pie', () => {
    expect(preview).toContain("const BOOT_PHOTO: Message['media'] = {");
    expect(preview).toContain("...(String(id)==='104'?{media:BOOT_PHOTO}:{})");
    // Y sigue habiendo una fila propia sin adjunto, para la otra cara.
    expect(preview).toContain("['102',true,");
  });

  it('la regla del espejo nombra a la del puente', () => {
    for (const name of ['desktopEditable', 'desktopCaptionable', 'editRights', 'captionable']) {
      expect(preview).toContain(`function ${name}(`);
    }
    expect(preview).toContain('DesktopMessageEdit.CanEditText');
    expect(preview).toContain('DesktopMessageEdit.HasCaption');
    // El sticker queda fuera; la nota de voz no se puede distinguir aquí, y así está escrito.
    expect(preview).toContain("return kind === 'image' || kind === 'video' || kind === 'file' || kind === 'audio';");
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string; text: string; edited: boolean; entities?: unknown[]; media?: { kind: string } };
type Snap = { messages: Row[] };

describe('ronda AH · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let snap: () => Snap = () => ({ messages: [] });

  const row = (id: string) => snap().messages.find(item => item.id === id)!;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('un texto propio ofrece edición, y no la ofrece sobre el adjunto', async () => {
    expect(await call('message.properties', { id: '102' })).toMatchObject({ edit: true, editCaption: false, caption: '' });
    expect(await call('message.properties', { id: '104' })).toMatchObject({ edit: false, editCaption: true });
  });

  it('lo recibido no se edita: la ventana no promete lo que Telegram va a rechazar', async () => {
    expect(await call('message.properties', { id: '101' })).toMatchObject({ edit: false, editCaption: false });
    await expect(call('message.edit', { id: '101', text: 'Ahora lo firma María' })).rejects.toThrow(tsProperty('rights'));
  });

  it('escribir texto cambia la fila y le pone la etiqueta de editado', async () => {
    const before = row('102').text;
    expect(row('102').edited).toBe(false);
    expect(await call('message.edit', { id: '102', text: 'Queda listo hoy', entities: [{ type: 'bold', offset: 0, length: 6 }] })).toBe(true);
    expect(row('102').text).toBe('Queda listo hoy');
    expect(row('102').text).not.toBe(before);
    expect(row('102').edited).toBe(true);
    expect(row('102').entities).toHaveLength(1);
  });

  it('el pie se ve antes de tocarlo y se puede dejar limpio', async () => {
    const properties = await call('message.properties', { id: '104' });
    expect((properties as { caption: string }).caption).toBe(row('104').text);
    expect(await call('message.edit.caption', { id: '104', caption: '' })).toBe(true);
    expect(row('104').text).toBe('');
    expect(row('104').media?.kind).toBe('image');
  });

  it('el texto vacío se niega con su frase, y el exceso con la del tope', async () => {
    await expect(call('message.edit', { id: '102', text: '' })).rejects.toThrow(tsProperty('blank'));
    await expect(call('message.edit', { id: '102', text: 'x'.repeat(4097) })).rejects.toThrow(
      'El texto supera los 4096 caracteres que acepta Telegram.',
    );
    await expect(call('message.edit.caption', { id: '104', caption: 'x'.repeat(1025) })).rejects.toThrow(
      'El texto supera los 1024 caracteres que acepta Telegram.',
    );
  });

  it('negar no escribe: la fila se queda tal cual estaba', async () => {
    const before = JSON.stringify(row('102'));
    await expect(call('message.edit', { id: '102', text: '' })).rejects.toThrow(tsProperty('blank'));
    expect(JSON.stringify(row('102'))).toBe(before);
  });

  it('en un supergrupo, los permisos de administrador abren la ajena', async () => {
    const { fixture } = await import('./preview');
    const transport = await import('./bridge');
    const foreign: Message = {
      id: '611', chatId: '14', sender: 'Vista de diseño', text: 'Nota de otra voz',
      date: 0, outgoing: false, status: '', edited: false, reactions: [],
    };
    transport.acceptState({ ...fixture, platform: 'desktop', active: '14', messages: [...fixture.messages, foreign] });
    expect(await call('message.properties', { id: '611' })).toMatchObject({ edit: true });
    expect(await call('message.edit', { id: '611', text: 'Corregido por quien modera' })).toBe(true);
    expect(row('611').text).toBe('Corregido por quien modera');
  });

  it('fuera de Windows la orden sigue cayendo en su negativa de siempre', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    // TDLib pide `content instanceof MessageText` para la cara de texto y `hasCaption` para la del pie: sobre la
    // fila con foto solo existe la segunda, aquí y en un teléfono.
    expect(await call('message.properties', { id: '104' })).toMatchObject({ edit: false, editCaption: true });
    expect(await call('message.properties', { id: '101' })).toMatchObject({ editCaption: false, reactions: ['👍', '❤️', '🔥', '👏', '🎉', '✅', '👀', '🙏'] });
    await expect(call('message.edit', { id: '102', text: 'Cualquier cosa' })).rejects.toThrow(
      'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
    );
  });
});
