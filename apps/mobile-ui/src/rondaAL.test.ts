import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const albumRules = text('../../desktop/src/WRGram.Desktop/DesktopAlbum.cs');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopAttachment.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que una capa asigna a una constante de C#. */
function csSentence(name: string, from = albumRules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El número con el que la clase de reglas corta el lote. */
function csNumber(name: string): number {
  const match = new RegExp(`public const int ${name} = (\\d+);`).exec(albumRules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return Number(match[1]);
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
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

const albumRefusals = /const ALBUM_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

describe('ronda AL · las reglas del álbum viven fuera del puente', () => {
  it('las dos orillas están en la clase de reglas y el puente no las reescribe', () => {
    expect(albumRules).toContain('public const int Min = 2;');
    expect(albumRules).toContain('public const int Max = 10;');
    // El puente pregunta; si volviera a escribir los números en su sitio, las dos puntas se desfasarían.
    expect(albumRules).toContain('public static string? CountError(int count) => count < Min ? TooFew : count > Max ? TooMany : null;');
    expect(albumRules).toContain('public static bool Fits(int count) => count >= Min && count <= Max;');
    expect(count('DesktopAlbum.CountError', service)).toBe(1);
    expect(count('DesktopAlbum.Fits', service)).toBe(1);
    for (const body of [csBody('AttachmentAlbumAsync'), csBody('SendAlbumAsync')]) {
      expect(body).not.toContain('DesktopAlbum.Min');
      expect(body).not.toContain('DesktopAlbum.Max');
    }
    // Los cuatro cortes son los mismos que los de Android, y el espejo lleva los mismos números.
    expect(java).toContain('uris.size()<2');
    expect(java).toContain('uris.size()>10');
    expect(java).toContain('values.length()<2||values.length()>10');
    expect(preview).toContain(`const ALBUM_MIN = ${csNumber('Min')};`);
    expect(preview).toContain(`const ALBUM_MAX = ${csNumber('Max')};`);
  });

  it('las ocho frases del lote son literales de Android y la de las fotos es la única de Windows', () => {
    for (const name of ['NoPicker', 'TooFew', 'TooMany', 'ImportFailed', 'Prepare', 'Batch', 'Uncertain', 'ChangedPieces']) {
      expect(java).toContain(`"${csSentence(name)}"`);
    }
    // La terna de fotos la decide aquí el puente; Android no puede volver con otra cosa que `image/*`.
    expect(java).not.toContain(csSentence('NotPhoto'));
  });

  it('la clase de reglas no guarda la frase de cuenta cambiada que aquí no puede pasar', () => {
    // Android la necesita porque su selector copia en un hilo de fondo y comprueba al volver. Aquí cada vale se
    // sella con la conversación en la que se abrió el selector, así que un salto de pestaña a media copia lo nota
    // el envío con la frase del lote —y no tira las fotos por el camino.
    expect(java).toContain('answer.fail("La cuenta o conversación cambió.")');
    expect(count('public const string Changed =', albumRules)).toBe(0);
    expect(csBody('AttachmentAlbumAsync')).not.toContain('Changed');
    expect(csBody('SendAlbumAsync')).toContain('file.Chat != _active');
  });

  it('la frase de importación lleva el tope escrito dentro, como en Android', () => {
    // Allá el `catch` de `pickedAlbum` mete en una sola negativa el archivo que no se lee y el que pasa de 32 MB,
    // porque desde la pantalla las dos se ven igual: el álbum no se preparó.
    expect(csSentence('ImportFailed')).toContain('10 imágenes de 32 MB');
    expect(rules).toContain('public const long MaxBytes = 32L * 1024 * 1024;');
    expect(csSentence('ImportFailed')).not.toBe(csSentence('TooBig', rules));
  });
});

describe('ronda AL · elegir y mandar un lote en Windows', () => {
  it('los dos brazos entran antes que la negativa genérica y el puente Android los conocía', () => {
    const generic = at('_ => throw new BridgeException($"No disponible en escritorio (beta)', service);
    for (const arm of ['"attachment.album" => await AttachmentAlbumAsync(),', '"send.album" => await SendAlbumAsync(args),']) {
      expect(count(arm, service)).toBe(1);
      expect(at(arm, service)).toBeLessThan(generic);
    }
    for (const method of ['attachment.album', 'send.album']) {
      expect(policy).toContain(`"${method}"`);
      expect(java).toContain(`case "${method}":`);
    }
  });

  it('el selector de Windows deja elegir varias fotos a la vez', () => {
    const body = csBody('AttachmentAlbumAsync');
    expect(body).toContain('Microsoft.Win32.OpenFileDialog');
    expect(body).toContain('Application.Current.Dispatcher.Invoke');
    // Sin esta línea el diálogo devuelve una sola ruta y el álbum sería imposible.
    expect(body).toContain('Multiselect = true');
    expect(body).toContain('Title = "Enviar un álbum de fotos",');
    expect(body).toContain('Filter = "Imágenes|*.jpg;*.jpeg;*.png;*.webp|Todos los archivos|*.*",');
  });

  it('cancelar el selector no es un error: responde vacío, como Android', () => {
    const body = csBody('AttachmentAlbumAsync');
    expect(body).toContain('return dialog.ShowDialog() == true ? dialog.FileNames : Array.Empty<string>();');
    expect(at('if (chosen.Length == 0) return null;', body)).toBeLessThan(at('DesktopAlbum.CountError', body));
    expect(java).toContain('if(uris==null||uris.isEmpty()){answer.ok(null);return;}');
  });

  it('el recorte corta primero por abajo y después por arriba, con dos frases distintas', () => {
    const body = csBody('AttachmentAlbumAsync');
    expect(at('var refusal = DesktopAlbum.CountError(chosen.Length);', body))
      .toBeLessThan(at('var planned = new List<(string Source, string Name, string Mime)>(chosen.Length);', body));
    const mirror = tsBody('albumCountError');
    expect(at('if (count < ALBUM_MIN) return ALBUM_REFUSALS.tooFew;', mirror))
      .toBeLessThan(at('if (count > ALBUM_MAX) return ALBUM_REFUSALS.tooMany;', mirror));
    expect(java).toContain('if(uris.size()<2){answer.fail("Elige al menos 2 fotos para crear un álbum.");return;}');
  });

  it('el tipo de cada foto se comprueba antes de escribir nada en el disco', () => {
    const body = csBody('AttachmentAlbumAsync');
    // El lote se planifica entero —nombre, MIME y negativa incluida— antes de la primera copia.
    expect(at('if (!DesktopAttachment.IsPhoto(mime)) throw new BridgeException(DesktopAlbum.NotPhoto);', body))
      .toBeLessThan(at('planned.Add((source, name, mime));', body));
    expect(at('planned.Add((source, name, mime));', body)).toBeLessThan(at('Directory.CreateDirectory(folder);', body));
    expect(count('DesktopAlbum.NotPhoto', service)).toBe(2);
  });

  it('cada foto va a su propia carpeta, para que descartar una no borre a sus hermanas', () => {
    const body = csBody('AttachmentAlbumAsync');
    expect(body).toContain('var folder = Path.Combine(_store.OutboxDirectory, Guid.NewGuid().ToString("N"));');
    // Carpeta y vale: dos GUID por foto, donde Android usa una carpeta y un UUID por foto.
    expect(count('Guid.NewGuid().ToString("N")', body)).toBe(2);
    expect(body).toContain('_outbox[token] = new OutboxFile(target, name, mime, account, chat);');
    expect(java).toContain('outbox/"+UUID.randomUUID()');
  });

  it('la copia que falla no deja un lote a medias', () => {
    const body = csBody('AttachmentAlbumAsync');
    expect(body).toContain('size = await ImportCopyAsync(target, source);');
    expect(body).toContain('throw new BridgeException(DesktopAlbum.ImportFailed, ex);');
    expect(count('DeleteFolder(folder);', body)).toBe(1);
    // Y lo que ya estaba copiado de las fotos anteriores se tira antes de decir que no.
    expect(count('foreach (var token in issued) DropOutbox(token);', service)).toBe(1);
  });

  it('el envío niega en el orden de Android y no sube nada antes', () => {
    const body = csBody('SendAlbumAsync');
    const order = [
      'var tokens = Arr(args, "tokens");',
      'if (!DesktopAlbum.Fits(tokens.Length)) throw new BridgeException(DesktopAlbum.Batch);',
      'if (_state.Uncertain) throw new BridgeException(DesktopAlbum.Uncertain);',
      'var entry = RequireEntry(_active);',
      'throw new BridgeException(DesktopAlbum.ChangedPieces);',
      'if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);',
      'if (!DesktopAttachment.IsPhoto(file.Mime)) throw new BridgeException(DesktopAlbum.NotPhoto);',
      'await client.UploadFileAsync(files[i].Path, null)',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
    // La única limpieza de vales es la del envío cuajado: una negativa no tira el trabajo de la persona.
    expect(count('DropOutbox(token);', body)).toBe(1);
    expect(at('foreach (var token in tokens) DropOutbox(token);', body))
      .toBeGreaterThan(at('await client.Messages_SendMultiMedia(entry.Input, media,', body));
  });

  it('el álbum es una sola petición con su random_id por foto', () => {
    const body = csBody('SendAlbumAsync');
    expect(body).toContain('var media = new InputSingleMedia[files.Count];');
    expect(body).toContain('media = new InputMediaUploadedPhoto { file = uploaded },');
    expect(body).toContain('random_id = Random.Shared.NextInt64(1, long.MaxValue)');
    expect(body).toContain('await client.Messages_SendMultiMedia(entry.Input, media,');
    expect(body).toContain('silent: silent, clear_draft: true);');
    // La miniatura no va: ninguna de las dos capas sabe decodificar la imagen para recortarla.
    expect(body).not.toContain('thumb =');
    expect(count('Messages_SendMultiMedia', service)).toBe(1);
    // Y una foto suelta sigue saliendo por la petición de siempre.
    expect(csBody('SendAttachmentAsync')).toContain('client.Messages_SendMedia(entry.Input, media, "",');
  });
});

describe('ronda AL · el espejo del andamio', () => {
  it('las dos puertas del espejo entran por la de la plataforma', () => {
    expect(count("if (method === 'attachment.album' && state.platform === 'desktop') return desktopAttachmentAlbum(params, state);", preview)).toBe(1);
    expect(count("if (method === 'send.album' && state.platform === 'desktop') return desktopAlbumSend(params, state);", preview)).toBe(1);
  });

  it('las doce frases del espejo son idénticas carácter a carácter a las del puente', () => {
    const pairs: [string, string][] = [
      ['picker', 'NoPicker'], ['tooFew', 'TooFew'], ['tooMany', 'TooMany'], ['importFailed', 'ImportFailed'],
      ['prepare', 'Prepare'], ['batch', 'Batch'], ['uncertain', 'Uncertain'], ['changedPieces', 'ChangedPieces'],
      ['notPhoto', 'NotPhoto'], ['gone', 'Gone'], ['noAlbum', 'NoAlbum'], ['noItems', 'NoItems'],
    ];
    // Doce claves, ni una más: la de cuenta cambiada la absorbe la frase del lote, y una copia suelta de esa
    // frase sería una negativa que el puente no pronuncia nunca.
    expect([...albumRefusals.matchAll(/^\s{2}(\w+):/gm)].map(match => match[1]).sort())
      .toEqual(pairs.map(pair => pair[0]).sort());
    for (const [key, name] of pairs) {
      expect(tsProperty(key, albumRefusals)).toBe(csSentence(name));
      // Y ninguna escrita dos veces: una copia suelta es una frase que se va a desfasar.
      expect(count(tsProperty(key, albumRefusals), preview)).toBe(1);
    }
  });

  it('el espejo niega en el mismo orden que el puente', () => {
    const body = tsBody('desktopAlbumSend');
    const order = [
      'if (tokens.length < ALBUM_MIN || tokens.length > ALBUM_MAX) throw new Error(ALBUM_REFUSALS.batch);',
      'if (state.uncertain) throw new Error(ALBUM_REFUSALS.uncertain);',
      'if (!state.chats.some(chat => chat.id === state.active)) throw new Error(FOLDER_REFUSALS.loaded);',
      'if (!file || file.account !== state.selfId || file.chat !== state.active) throw new Error(ALBUM_REFUSALS.changedPieces);',
      "if (files.some(file => !attachmentIsPhoto(file.mime))) throw new Error(ALBUM_REFUSALS.notPhoto);",
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
    // La única salida de vales es la del envío cuajado.
    expect(count('desktopOutbox.splice', body)).toBe(1);
  });

  it('el nombre de respaldo del álbum es «foto», como en Android', () => {
    expect(tsBody('desktopAttachmentAlbum')).toContain("attachmentNameOf(name, 'foto')");
    expect(csBody('AttachmentAlbumAsync')).toContain('DesktopAttachment.NameOf(Path.GetFileName(source), "foto")');
    expect(rules).toContain('public static string NameOf(string raw, string fallback = "archivo")');
    expect(java).toContain('String mime=activity.getContentResolver().getType(uri);String name="foto";');
    expect(java).toContain('if(name.isBlank()||name.startsWith("."))name="foto";');
  });
});

describe('ronda AL · la pantalla de Windows puede pedir el álbum', () => {
  it('el álbum deja de estar escondido detrás de la plataforma', () => {
    const item = '<MenuItem icon={<Image/>} label="Álbum de fotos (2–10)" onClick={()=>{setDialog(undefined);attachAlbum();}}/>';
    expect(count(item, app)).toBe(1);
    expect(count(`{!desktop&&${item}`, app)).toBe(0);
  });

  it('la pantalla pide el lote, lo pinta y descarta cada pieza al cerrar', () => {
    const body = app.slice(at('function attachAlbum', app), at('function attachAlbum', app) + 1600);
    expect(body).toContain("run<{token:string;name:string;size:number}[]>('attachment.album')");
    expect(body).toContain("run<boolean>('send.album',{tokens:items.map(item=>item.token),reply:replyId||'0',silent})");
    expect(body).toContain('className="album-preview"');
    expect(body).toContain("const discard=()=>items.forEach(item=>void run('attachment.discard',{token:item.token}))");
    expect(body).toContain('onClose:discard');
    expect(body).toContain('Se enviarán como un solo álbum de Telegram');
    // Un lote no se puede mandar dos veces mientras el primero está en el aire.
    expect(body).toContain('disabled={state.sending}');
    expect(body).toContain('if(!items?.length)return;');
    expect(body).toContain('Enviar álbum de ${items.length} fotos');
  });

  it('las burbujas del álbum se agrupan con su contador', () => {
    expect(app).toContain('className="album-badge"');
    expect(app).toContain('albumSizes');
    // Desde la ronda AM el host también lee las piezas, así que la entrada del menú dejó de ser de Android.
    expect(app).toContain('{message.albumId&&<MenuItem icon={<Image/>} label="Editar textos del álbum"');
    expect(count('"message.album" => await AlbumItemsAsync(args),', service)).toBe(1);
  });

  it('los tres brazos del espejo del archivo suelto siguen en su sitio', () => {
    // El álbum comparte cola de vales con la foto suelta; si la pareja de brazos se perdiera, la ronda AK se
    // apagaría sin que ninguna de sus pruebas lo notara.
    expect(count("if (method === 'attachment.pick' && state.platform === 'desktop') return desktopAttachmentPick(params, state);", preview)).toBe(1);
    expect(count("if (method === 'send.attachment' && state.platform === 'desktop') return desktopAttachmentSend(params, state);", preview)).toBe(1);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Piece = { kind: string; name: string; mime: string; size: number; ready: boolean };
type Row = { id: string; text: string; outgoing: boolean; date: number; albumId?: string; media?: Piece };
type Snap = { active: string; selfId: string; uncertain: boolean; messages: Row[]; chats: { id: string }[] };
type Vale = { token: string; name: string; size: number };

describe('ronda AL · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', uncertain: false, messages: [], chats: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);
  const album = async (params: Record<string, unknown> = {}) =>
    await call('attachment.album', params) as Vale[] | undefined;
  const tokensOf = (items: Vale[] | undefined) => (items ?? []).map(item => item.token);
  const many = (n: number, ext = 'jpg') => Array.from({ length: n }, (_, index) => `foto-${index + 1}.${ext}`);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('elegir tres fotos devuelve tres vales y no escribe nada en el historial', async () => {
    const before = snap().messages.length;
    const items = await album();
    expect(items?.map(item => item.name)).toEqual(['verano-01.jpg', 'verano-02.png', 'verano-03.webp']);
    expect(tokensOf(items)).toEqual(['a1', 'a2', 'a3']);
    expect(items?.every(item => item.size === 640 * 1024)).toBe(true);
    expect(snap().messages.length).toBe(before);
  });

  it('el lote cuaja en tres fotos agrupadas, con un solo contador y la misma fecha', async () => {
    const items = await album();
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
    const rows = snap().messages.slice(-3);
    expect(rows.every(row => row.outgoing && row.media?.kind === 'image' && row.media.name === 'Foto')).toBe(true);
    expect(rows.map(row => row.media?.mime)).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(new Set(rows.map(row => row.albumId))).toEqual(new Set(['al1']));
    expect(new Set(rows.map(row => row.date)).size).toBe(1);
    const ids = rows.map(row => Number(row.id));
    expect(ids[1] - ids[0]).toBe(1);
    expect(ids[2] - ids[1]).toBe(1);
  });

  it('una sola foto se niega con la frase del mínimo y once con la del máximo', async () => {
    await expect(call('attachment.album', { names: ['una-sola.jpg'] })).rejects.toThrow(tsProperty('tooFew', albumRefusals));
    await expect(call('attachment.album', { names: many(11) })).rejects.toThrow(tsProperty('tooMany', albumRefusals));
    expect(await call('attachment.album', { names: many(10) })).toHaveLength(10);
  });

  it('volver sin fotos es cancelar: responde nada y no reserva vales', async () => {
    const before = snap().messages.length;
    expect(await call('attachment.album', { names: [] })).toBeUndefined();
    expect(snap().messages.length).toBe(before);
    expect(tokensOf(await album())).toEqual(['a1', 'a2', 'a3']);
  });

  it('un archivo que no es foto se niega con nombre antes de reservar nada', async () => {
    const before = snap().messages.length;
    await expect(call('attachment.album', { names: ['playa.jpg', 'factura.pdf'] }))
      .rejects.toThrow(tsProperty('notPhoto', albumRefusals));
    expect(snap().messages.length).toBe(before);
    expect(tokensOf(await album())).toEqual(['a1', 'a2', 'a3']);
  });

  it('una foto que pasa del tope tira el lote entero', async () => {
    await expect(call('attachment.album', { names: many(3), size: 33 * 1024 * 1024 }))
      .rejects.toThrow(tsProperty('importFailed', albumRefusals));
    // La siguiente selección vuelve a empezar en el primer vale: la negativa no deja nada por el medio.
    expect(tokensOf(await album())).toEqual(['a1', 'a2', 'a3']);
  });

  it('el lote comparte la cola con el archivo suelto y no le pisa el vale', async () => {
    const single = await call('attachment.pick', { name: 'planos.svg' }) as Vale;
    const items = await album({ names: ['x.jpg', 'y.png'] });
    expect(single.token).toBe('a1');
    expect(tokensOf(items)).toEqual(['a2', 'a3']);
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
    expect(await call('send.attachment', { token: single.token })).toBe(true);
    expect(snap().messages.at(-1)?.media).toMatchObject({ mime: 'image/svg+xml', name: 'planos.svg' });
  });

  it('un vale de documento suelto no cuela un archivo en el álbum', async () => {
    // En Android no hace falta comprobarlo: TDLib recibe la ruta y decide sola. Aquí el tipo lo elige el puente,
    // y dejarlo pasar sería subir el archivo entero para que Telegram lo rechazara después.
    const single = await call('attachment.pick', { name: 'informe.pdf' }) as Vale;
    const items = await album({ names: ['a.jpg', 'b.jpg'] });
    const before = snap().messages.length;
    await expect(call('send.album', { tokens: [single.token, tokensOf(items)[0]] }))
      .rejects.toThrow(tsProperty('notPhoto', albumRefusals));
    expect(snap().messages.length).toBe(before);
    expect(await call('send.attachment', { token: single.token })).toBe(true);
  });

  it('un vale que falta niega el álbum entero y no borra a sus hermanas', async () => {
    const items = await album();
    const before = snap().messages.length;
    await call('attachment.discard', { token: tokensOf(items)[1] });
    await expect(call('send.album', { tokens: tokensOf(items) })).rejects.toThrow(tsProperty('changedPieces', albumRefusals));
    expect(snap().messages.length).toBe(before);
    // Y las dos que siguen vivas forman un álbum legal.
    expect(await call('send.album', { tokens: [tokensOf(items)[0], tokensOf(items)[2]] })).toBe(true);
    expect(snap().messages.slice(-2).every(row => row.albumId)).toBe(true);
  });

  it('cambiar de conversación entre elegir y confirmar deja el álbum intacto', async () => {
    const items = await album({ names: ['a.jpg', 'b.jpg', 'c.jpg'] });
    const before = snap().messages.length;
    set({ active: '13' });
    await expect(call('send.album', { tokens: tokensOf(items) })).rejects.toThrow(tsProperty('changedPieces', albumRefusals));
    expect(snap().messages.length).toBe(before);
    // Volver a la conversación de origen recupera el lote: los vales se sellaron con ella.
    await call('chat.open', { id: '11' });
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
    expect(snap().messages.slice(-3).every(row => row.albumId === 'al1')).toBe(true);
  });

  it('con un envío sin confirmar se niega el lote y se conservan los vales', async () => {
    const items = await album({ names: ['a.jpg', 'b.png'] });
    const before = snap().messages.length;
    set({ uncertain: true });
    await expect(call('send.album', { tokens: tokensOf(items) })).rejects.toThrow(tsProperty('uncertain', albumRefusals));
    expect(snap().messages.length).toBe(before);
    set({ uncertain: false });
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
  });

  it('un lote de uno o de once vales se niega con la frase del envío', async () => {
    const items = await album();
    const before = snap().messages.length;
    await expect(call('send.album', { tokens: [tokensOf(items)[0]] })).rejects.toThrow(tsProperty('batch', albumRefusals));
    await expect(call('send.album', { tokens: many(11, 'jpg') })).rejects.toThrow(tsProperty('batch', albumRefusals));
    await expect(call('send.album', {})).rejects.toThrow(tsProperty('batch', albumRefusals));
    expect(snap().messages.length).toBe(before);
    // Nada se consumió: el lote de tres sigue estando completo.
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
  });

  it('el mismo lote enviado dos veces se niega: los vales del álbum cuajado dejan de existir', async () => {
    const items = await album({ names: ['a.jpg', 'b.jpg'] });
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
    const after = snap().messages.length;
    await expect(call('send.album', { tokens: tokensOf(items) })).rejects.toThrow(tsProperty('changedPieces', albumRefusals));
    // La segunda negativa no duplica la burbuja.
    expect(snap().messages).toHaveLength(after);
  });

  it('los dos contadores de álbum se siguen uno detrás de otro', async () => {
    const first = await album({ names: ['a.jpg', 'b.jpg'] });
    await call('send.album', { tokens: tokensOf(first) });
    const second = await album({ names: ['c.png', 'd.webp'] });
    expect(tokensOf(second)).toEqual(['a3', 'a4']);
    await call('send.album', { tokens: tokensOf(second) });
    expect(snap().messages.slice(-4).map(row => row.albumId)).toEqual(['al1', 'al1', 'al2', 'al2']);
  });

  it('el álbum enviado sigue agrupado cuando la conversación se vuelve a abrir', async () => {
    const items = await album();
    await call('send.album', { tokens: tokensOf(items) });
    const ids = snap().messages.slice(-3).map(row => row.id);
    await call('chat.open', { id: '13' });
    await call('chat.open', { id: '11' });
    const rows = snap().messages.filter(row => ids.includes(row.id));
    expect(rows).toHaveLength(3);
    expect(new Set(rows.map(row => row.albumId))).toEqual(new Set(['al1']));
  });

  it('fuera de Windows las dos órdenes del álbum caen en la negativa de siempre', async () => {
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    const before = snap().messages.length;
    for (const method of ['attachment.album', 'send.album']) {
      await expect(call(method, { tokens: ['a1', 'a2'] })).rejects.toThrow(
        'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
      );
    }
    expect(snap().messages.length).toBe(before);
  });
});
