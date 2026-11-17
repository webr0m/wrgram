import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopAttachment.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const store = text('../../desktop/src/WRGram.Desktop/DesktopStore.cs');
const registry = text('../../desktop/src/WRGram.Desktop/MediaRegistry.cs');
const stateFile = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que una capa asigna a una constante de C#. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El literal de una constante de TypeScript que no es propiedad de ningún objeto. */
function tsConst(name: string, from = preview): string {
  const match = new RegExp(`const ${name} = '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
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

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** Lo que una capa hace antes que la otra: si el orden se pierde, la prueba dice cuál iba primero. */
function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta «${needle}»`);
  return index;
}

/** Las parejas `["ext"] = "mime"` de la tabla de C#. */
function csTable(): [string, string][] {
  return [...rules.matchAll(/\["([^"]+)"\]\s*=\s*"([^"]+)"/g)].map(match => [match[1], match[2]] as [string, string]);
}

/** Las mismas parejas en el espejo, sacadas del objeto `ATTACH_TYPES`. */
function tsTable(): [string, string][] {
  const block = /const ATTACH_TYPES: Record<string, string> = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';
  return [...block.matchAll(/'?([a-z0-9]+)'?: '([^']+)'/g)].map(match => [match[1], match[2]] as [string, string]);
}

const attachRefusals = /const ATTACH_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

describe('ronda AK · elegir un archivo deja de ser cosa de un teléfono', () => {
  it('el tope y el búfer son los números con los que Android corta la copia', () => {
    expect(rules).toContain('public const long MaxBytes = 32L * 1024 * 1024;');
    expect(java).toContain('size>32L*1024*1024');
    expect(rules).toContain('public const int BufferBytes = 32768;');
    expect(java).toContain('byte[] buffer=new byte[32768]');
    // El puente no vuelve a escribir el tope: lo pregunta a la regla.
    expect(rules).toContain('public static bool Exceeds(long transmitted) => transmitted > MaxBytes;');
    expect(count('DesktopAttachment.MaxBytes', service)).toBe(0);
  });

  it('la norma del nombre es la misma clase de caracteres en las tres capas', () => {
    // Java dobla la barra porque la escribe dentro de un literal de string; C# la deja suelta en su cadena
    // textual y TypeScript en su expresión regular. Desdoblada la de Java, las tres son el mismo conjunto.
    const javaClass = '[^\\\\p{L}\\\\p{N}._ -]';
    const plainClass = '[^\\p{L}\\p{N}._ -]';
    expect(javaClass.split('\\\\').join('\\')).toBe(plainClass);
    expect(java).toContain(`name.replaceAll("${javaClass}"`);
    expect(rules).toContain(`Regex.Replace(raw, @"${plainClass}", "_")`);
    expect(preview).toContain(`raw.replace(/${plainClass}/gu, '_')`);
    // Los últimos 90, no los primeros: los del final son los que distinguen un informe de otro.
    expect(rules).toContain('if (name.Length > 90) name = name.Substring(name.Length - 90);');
    expect(java).toContain('if(name.length()>90)name=name.substring(name.length()-90)');
    // El respaldo lo dice quien llama: «archivo» para una pieza suelta, y en Android son las dos palabras que
    // usan `picked` e `importPhoto` por separado. La ronda AL añadió el parámetro; la clase y el recorte son los mismos.
    expect(rules).toContain('public static string NameOf(string raw, string fallback = "archivo")');
    expect(rules).toContain('name = fallback');
    expect(java).toContain('name="archivo"');
  });

  it('foto o archivo se decide con la terna de MIMEs de Android', () => {
    expect(rules).toContain('public static bool IsPhoto(string? mime) => mime is "image/jpeg" or "image/png" or "image/webp";');
    expect(java).toContain('item.mime.equals("image/jpeg")||item.mime.equals("image/png")||item.mime.equals("image/webp")');
    expect(tsBody('attachmentIsPhoto')).toContain("mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp'");
  });

  it('las cuatro frases que ya están en Android se copian, no se reescriben', () => {
    for (const name of ['NoPicker', 'TooBig', 'ChangedChat', 'Uncertain']) {
      expect(java).toContain(`"${csSentence(name)}"`);
    }
    // La quinta no la dice Android: allí un vale que no está en el mapa lanza una excepción sin mensaje.
    expect(java).not.toContain(csSentence('NotPrepared'));
  });

  it('la carpeta de salida la conoce el almacén, como la de multimedia', () => {
    expect(store).toContain('OutboxDirectory = Path.Combine(Root, "outbox");');
    expect(java).toContain('"outbox/"+UUID.randomUUID()');
    // Dos usuarios de la carpeta desde la ronda AL: la foto suelta y cada pieza del álbum.
    expect(count('_store.OutboxDirectory', service)).toBe(2);
  });

  it('los tres brazos entran antes que la negativa genérica', () => {
    const generic = at('_ => throw new BridgeException($"No disponible en escritorio (beta)', service);
    for (const arm of [
      // La ronda BU añadió el `kind` con el que la fila «GIF del dispositivo» filtra el selector; el brazo sigue
      // siendo el mismo que ya existía.
      '"attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),',
      '"attachment.discard" => AttachmentDiscardAsync(args),',
      '"send.attachment" => await SendAttachmentAsync(args),',
    ]) {
      expect(count(arm, service)).toBe(1);
      expect(at(arm, service)).toBeLessThan(generic);
    }
    // Y el puente Android ya los conocía: si alguno cayera de la lista, la pantalla colgaría un timeout.
    for (const method of ['attachment.pick', 'attachment.discard', 'send.attachment']) {
      expect(policy).toContain(`"${method}"`);
      expect(java).toContain(`case "${method}":`);
    }
  });

  it('las tres peticiones que la librería publicó son las que se usan', () => {
    expect(csBody('AttachmentPickAsync')).toContain('Microsoft.Win32.OpenFileDialog');
    expect(csBody('AttachmentPickAsync')).toContain('Application.Current.Dispatcher.Invoke');
    expect(csBody('SendAttachmentAsync')).toContain('client.UploadFileAsync(file.Path, null)');
    expect(csBody('SendAttachmentAsync')).toContain('client.Messages_SendMedia(entry.Input, media, "",');
    expect(csBody('SendAttachmentAsync')).toContain('new InputMediaUploadedPhoto { file = uploaded }');
    // Desde la ronda BU la atribución ya no se escribe en el método: la manda la regla, que es la que decide
    // si el GIF lleva además la marca de animación. La pareja ficha-nombre sigue yendo al cable.
    expect(csBody('SendAttachmentAsync')).toContain('attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)');
    expect(rules).toContain('new DocumentAttributeFilename { file_name = name }');
    // La miniatura no va: el puente no la genera, y prometerla en el `flags` sería mandar un archivo roto.
    expect(csBody('SendAttachmentAsync')).not.toContain('thumb =');
  });

  it('cancelar el selector no es un error: responde vacío, como Android', () => {
    const body = csBody('AttachmentPickAsync');
    expect(body).toContain('return dialog.ShowDialog() == true ? dialog.FileName : null;');
    expect(at('if (chosen == null) return null;', body)).toBeLessThan(at('DesktopAttachment.NameOf', body));
    expect(java).toContain('if(uri==null){answer.ok(null);return;}');
  });

  it('el tope se corta mientras se copia, antes de escribir el bloque que lo pasa', () => {
    const body = csBody('ImportCopyAsync');
    expect(at('if (DesktopAttachment.Exceeds(written)) throw new BridgeException(DesktopAttachment.TooBig);', body))
      .toBeLessThan(at('await output.WriteAsync(buffer.AsMemory(0, read));', body));
    // Y se tira lo que llevaba copiado: un archivo que no cabe no deja media copia en el disco de la persona.
    expect(count('DeleteFolder(folder);', csBody('AttachmentPickAsync'))).toBe(2);
  });

  it('el vale apunta la cuenta y la conversación con las que se eligió', () => {
    expect(csBody('AttachmentPickAsync'))
      .toContain('_outbox[token] = new OutboxFile(target, name, DesktopAttachment.MimeOf(name), client.User!.id, _active);');
    expect(java).toContain('item.account=user;item.chat=chat;');
  });

  it('lo que devuelve el vale son los tres campos que la pantalla pinta', () => {
    expect(stateFile).toMatch(/public sealed class AttachmentDto/);
    expect(csBody('AttachmentPickAsync')).toContain('return new AttachmentDto { Token = token, Name = name, Size = size };');
    expect(java).toContain('answer.ok(object("token",token,"name",item.name,"size",item.size))');
    const dto = /public sealed class AttachmentDto[\s\S]*?\n\}/.exec(stateFile)?.[0] ?? '';
    for (const field of ['Token', 'Name', 'Size']) expect(dto).toMatch(new RegExp(`public \\S+ ${field} \\{ get; set; \\}`));
  });

  it('el envío niega en el orden de Android y no sube nada antes', () => {
    const body = csBody('SendAttachmentAsync');
    const order = [
      'if (!_outbox.TryGetValue(token, out var file)) throw new BridgeException(DesktopAttachment.NotPrepared);',
      'if (file.Account != client.User!.id || file.Chat != _active)',
      'if (_state.Uncertain) throw new BridgeException(DesktopAttachment.Uncertain);',
      'var entry = RequireEntry(_active);',
      'if (!File.Exists(file.Path))',
      'await client.UploadFileAsync(file.Path, null)',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
  });

  it('al cuajar el envío el vale deja de existir, y al cerrar la sesión se tira todo', () => {
    const body = csBody('SendAttachmentAsync');
    const sent = at('await client.Messages_SendMedia(entry.Input, media, "",', body);
    // El descarte del envío cuajado va después de la petición; los otros dos son las negativas que tiran lo
    // que ya no se va a poder usar.
    expect(body.slice(sent).indexOf('DropOutbox(token);')).toBeGreaterThan(0);
    expect(count('DropOutbox(token);', body)).toBe(3);
    expect(csBody('DisposeClientLocked')).toContain('ClearOutbox();');
    expect(count('ClearOutbox();', service)).toBe(1);
    expect(java).toContain('if(sent){attachments.remove(token);');
  });

  it('descartar no tiene nada que negar', () => {
    expect(csBody('AttachmentDiscardAsync')).toContain('DropOutbox(Str(args, "token"));');
    expect(csBody('AttachmentDiscardAsync')).toContain('return true;');
    expect(java).toContain('case "attachment.discard":{Attachment item=attachments.remove(BridgePolicy.text(p,"token",80));if(item!=null)Files.deleteIfExists(item.path.toPath());a.ok(true);break;}');
  });
});

describe('ronda AK · la tabla de tipos es una sola para las dos capas', () => {
  it('las parejas extensión → MIME coinciden, a ninguna le falta la otra', () => {
    const mine = csTable().sort();
    expect(mine.length).toBeGreaterThan(30);
    expect(tsTable().sort()).toEqual(mine);
  });

  it('el flujo por defecto y el recorte de la extensión están escritos en las dos', () => {
    expect(csSentence('Fallback')).toBe(tsConst('ATTACH_FALLBACK'));
    expect(rules).toContain("var dot = name.LastIndexOf('.');");
    expect(tsBody('attachmentMimeOf')).toContain("name.lastIndexOf('.')");
    expect(rules).toContain('if (dot < 0 || dot == name.Length - 1) return Fallback;');
    expect(tsBody('attachmentMimeOf')).toContain('if (dot < 0 || dot === name.length - 1) return ATTACH_FALLBACK;');
    expect(rules).toContain('.ToLowerInvariant()');
    expect(tsBody('attachmentMimeOf')).toContain('.toLowerCase()');
  });

  it('el icono con el que se pinta la pieza sale del MIME, igual que en el registro de descarga', () => {
    for (const prefix of ['image/', 'video/', 'audio/']) {
      expect(registry).toContain(`mime.StartsWith("${prefix}")`);
      expect(tsBody('attachmentKindOf')).toContain(`mime.startsWith('${prefix}')`);
    }
    expect(registry).toContain('return "file";');
    expect(tsBody('attachmentKindOf')).toContain("return 'file'");
  });
});

describe('ronda AK · el acceso de Windows y lo que hay detrás', () => {
  it('en Windows el clip está al alcance y promete lo que el menú de verdad trae', () => {
    // Los tres brazos del puente no servían de nada mientras el único botón que los llamaba estuviera
    // escondido por `!desktop`. La aguja se sacó de ahí. El rótulo volvió a ser el de siempre en la ronda AL,
    // cuando el álbum dejó de ser cosa de un teléfono; lo que no puede volver a pasar es que el botón dependa
    // de la plataforma.
    const clip = '<IconButton label="Adjuntar archivo, foto o álbum" disabled={!state.canSend} onClick={openAttachments}><Paperclip/></IconButton>';
    expect(count(clip, app)).toBe(1);
    expect(count(`{!desktop&&${clip}`, app)).toBe(0);
  });

  it('el menú de Windows solo deja lo que el puente atiende', () => {
    const menu = app.slice(at('function openAttachments', app), at('function openAttachments', app) + 2400);
    // Ninguna de estas órdenes tiene brazo en el host: `attachment.camera`, `send.paidMedia`, `voice.start`,
    // `attachment.videoNote*`, `checklist.send`, `share.location`. El álbum estaba en esta lista hasta la ronda AL,
    // que lo conectó y lo sacó; `rondaAL.test.ts` responde de él. La encuesta corrió igual en la ronda AN, y
    // `rondaAN.test.ts` es la que vigila que su entrada no vuelva a esconderse. Compartir un contacto se fue con la
    // ronda AP, que le puso brazo al puente y aguja nueva a `rondaAP.test.ts`.
    for (const needle of [
      '{!desktop&&<MenuItem icon={<Camera/>} label="Tomar foto"',
      `{!desktop&&active?.type==='channel'&&<MenuItem icon={<LockKeyhole/>} label="Publicar contenido de pago"`,
      '{!desktop&&<MenuItem icon={<Mic/>} label="Nota de voz"',
      '{!desktop&&<MenuItem icon={<Camera/>} label="Grabar videomensaje"',
      '{!desktop&&<MenuItem icon={<Camera/>} label="Videomensaje desde archivo"',
      '{!desktop&&<MenuItem icon={<ListChecks/>} label="Crear lista de tareas"',
      '{!desktop&&<MenuItem icon={<MapPin/>} label="Compartir ubicación"',
    ]) {
      expect(count(needle, app)).toBe(1);
      expect(at(needle, menu)).toBeGreaterThan(0);
    }
    // Y la que sí atiende el puente no puede volver a esconderse detrás de la plataforma.
    expect(count('{!desktop&&<MenuItem icon={<FileText/>} label="Archivo o foto"', app)).toBe(0);
    // Lo mismo con la tarjeta de contacto desde la ronda AP: el botón existe en las dos plataformas.
    expect(count('{!desktop&&<MenuItem icon={<UserRound/>} label="Compartir contacto"', app)).toBe(0);
  });

  it('el botón de archivo sigue siendo el mismo que siempre pidió el puente', () => {
    const menu = app.slice(at('function openAttachments', app), at('function openAttachments', app) + 1200);
    expect(menu).toContain('label="Archivo o foto"');
    // La misma petición con el argumento opcional que la ronda BU añadió para la fila de GIF: sin `kind` sigue
    // siendo la llamada de siempre.
    expect(app).toContain("run<{token:string;name:string;size:number}>(method,kind?{kind}:{})");
    // La pantalla ya avisaba del tope que ahora cumple el host.
    expect(app).toContain('Límite de esta versión: 32 MB.');
  });

  it('los tres brazos del espejo entran por la puerta de la plataforma', () => {
    expect(count("if (method === 'attachment.pick' && state.platform === 'desktop') return desktopAttachmentPick(params, state);", preview)).toBe(1);
    expect(count("if (method === 'attachment.discard' && state.platform === 'desktop') return desktopAttachmentDiscard(params);", preview)).toBe(1);
    expect(count("if (method === 'send.attachment' && state.platform === 'desktop') return desktopAttachmentSend(params, state);", preview)).toBe(1);
  });

  it('las cinco frases del espejo son idénticas carácter a carácter a las del puente', () => {
    expect(tsProperty('picker', attachRefusals)).toBe(csSentence('NoPicker'));
    expect(tsProperty('tooBig', attachRefusals)).toBe(csSentence('TooBig'));
    expect(tsProperty('changed', attachRefusals)).toBe(csSentence('ChangedChat'));
    expect(tsProperty('uncertain', attachRefusals)).toBe(csSentence('Uncertain'));
    expect(tsProperty('notPrepared', attachRefusals)).toBe(csSentence('NotPrepared'));
    // Y ninguna está escrita dos veces en el espejo: una copia suelta es una frase que se va a desfasar.
    for (const name of ['picker', 'tooBig', 'changed', 'uncertain', 'notPrepared']) {
      expect(count(tsProperty(name, attachRefusals), preview)).toBe(1);
    }
  });

  it('el espejo niega en el mismo orden que el puente', () => {
    const body = tsBody('desktopAttachmentSend');
    const order = [
      'if (index < 0) throw new Error(ATTACH_REFUSALS.notPrepared);',
      'throw new Error(ATTACH_REFUSALS.changed);',
      'if (state.uncertain) throw new Error(ATTACH_REFUSALS.uncertain);',
      'if (!state.chats.some(chat => chat.id === state.active)) throw new Error(FOLDER_REFUSALS.loaded);',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
  });

  it('el nombre solo sobrevive cuando la pieza viaja como documento', () => {
    // Es lo que hace el registro: `RegisterPhoto` no recibe nombre y se queda con el «Foto» con el que está
    // declarado; `RegisterDocument` lo saca del `DocumentAttributeFilename` que manda el puente.
    expect(registry).toContain('string name = "Foto"');
    expect(registry).toContain('document.Filename!');
    expect(tsBody('desktopAttachmentSend')).toContain("name: photo ? 'Foto' : file.name");
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Piece = { kind: string; name: string; mime: string; size: number; ready: boolean };
type Row = { id: string; text: string; outgoing: boolean; media?: Piece };
type Snap = { active: string; selfId: string; uncertain: boolean; messages: Row[]; chats: { id: string }[] };

describe('ronda AK · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', uncertain: false, messages: [], chats: [] });
  const last = () => snap().messages.at(-1)!;
  const pick = async (params: Record<string, unknown> = {}) =>
    await call('attachment.pick', params) as { token: string; name: string; size: number };
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('elegir devuelve el vale con el nombre sano y no escribe nada en el historial', async () => {
    const before = snap().messages.length;
    const item = await pick({ name: 'foto del campo (1).jpg' });
    expect(item.name).toBe('foto del campo _1_.jpg');
    expect(item.size).toBe(512 * 1024);
    expect(item.token).toBe('a1');
    expect(snap().messages.length).toBe(before);
  });

  it('una foto sale como imagen y sin el nombre del archivo', async () => {
    const item = await pick({ name: 'Reunión de la barra.jpeg' });
    expect(await call('send.attachment', { token: item.token })).toBe(true);
    expect(last().media).toMatchObject({ kind: 'image', mime: 'image/jpeg', name: 'Foto' });
    expect(last().outgoing).toBe(true);
  });

  it('un documento conserva su nombre y un GIF viaja como documento aunque se pinte como imagen', async () => {
    const pdf = await pick({ name: 'Guía del proyecto.pdf' });
    await call('send.attachment', { token: pdf.token });
    expect(last().media).toMatchObject({ kind: 'file', mime: 'application/pdf', name: 'Guía del proyecto.pdf' });
    const gif = await pick({ name: 'animacion.gif' });
    await call('send.attachment', { token: gif.token });
    expect(last().media).toMatchObject({ kind: 'image', mime: 'image/gif', name: 'animacion.gif' });
  });

  it('lo que pasa del tope se niega con la frase de Android y no deja vale por el medio', async () => {
    await expect(call('attachment.pick', { name: 'vídeo de la reunión.mp4', size: 33 * 1024 * 1024 }))
      .rejects.toThrow(tsProperty('tooBig', attachRefusals));
    // El siguiente vale vuelve a ser el primero: la negativa no reserva nada que haya que limpiar.
    expect((await pick()).token).toBe('a1');
  });

  it('un vale que no existe se niega con nombre propio y no escribe', async () => {
    const before = snap().messages.length;
    await expect(call('send.attachment', { token: 'no-existe' })).rejects.toThrow(tsProperty('notPrepared', attachRefusals));
    expect(snap().messages.length).toBe(before);
  });

  it('cambiar de conversación entre elegir y confirmar tira el vale', async () => {
    const item = await pick({ name: 'planos.svg' });
    const before = snap().messages.length;
    set({ active: '13' });
    await expect(call('send.attachment', { token: item.token })).rejects.toThrow(tsProperty('changed', attachRefusals));
    expect(snap().messages.length).toBe(before);
    // Y se tira de verdad: volver a la conversación de origen ya no lo recupera.
    await call('chat.open', { id: '11' });
    await expect(call('send.attachment', { token: item.token })).rejects.toThrow(tsProperty('notPrepared', attachRefusals));
  });

  it('con un envío sin confirmar se niega y el vale se conserva para poder reintentar', async () => {
    const item = await pick({ name: 'notas.md' });
    const before = snap().messages.length;
    set({ uncertain: true });
    await expect(call('send.attachment', { token: item.token })).rejects.toThrow(tsProperty('uncertain', attachRefusals));
    expect(snap().messages.length).toBe(before);
    set({ uncertain: false });
    expect(await call('send.attachment', { token: item.token })).toBe(true);
    expect(last().media).toMatchObject({ mime: 'text/markdown', name: 'notas.md' });
  });

  it('descartar quita el vale y no molesta si ya no estaba', async () => {
    const item = await pick({ name: 'pendiente.txt' });
    expect(await call('attachment.discard', { token: item.token })).toBe(true);
    await expect(call('send.attachment', { token: item.token })).rejects.toThrow(tsProperty('notPrepared', attachRefusals));
    expect(await call('attachment.discard', { token: 'nadie-lo-eligio' })).toBe(true);
  });

  it('lo enviado se queda en el historial cuando la conversación se vuelve a abrir', async () => {
    const item = await pick({ name: 'calendario.csv' });
    await call('send.attachment', { token: item.token });
    const id = last().id;
    await call('chat.open', { id: '13' });
    await call('chat.open', { id: '11' });
    expect(snap().messages.some(message => message.id === id)).toBe(true);
    expect(last().id).toBe(id);
  });

  it('el segundo archivo elegido no pisa al primero: cada vale tiene su token', async () => {
    const uno = await pick({ name: 'primero.pdf' });
    const dos = await pick({ name: 'segundo.pdf' });
    expect(dos.token).toBe('a2');
    await call('send.attachment', { token: uno.token });
    await call('send.attachment', { token: dos.token });
    expect(snap().messages.slice(-2).map(message => message.media?.name)).toEqual(['primero.pdf', 'segundo.pdf']);
  });

  it('fuera de Windows las tres órdenes caen en la negativa de siempre', async () => {
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    const before = snap().messages.length;
    for (const method of ['attachment.pick', 'send.attachment', 'attachment.discard']) {
      await expect(call(method, { token: 'a1' })).rejects.toThrow(
        'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
      );
    }
    // Que TDLib y el selector del sistema sí hacen en el dispositivo, y aquí no se finge.
    expect(snap().messages.length).toBe(before);
  });
});
