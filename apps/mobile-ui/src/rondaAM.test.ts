import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const albumRules = text('../../desktop/src/WRGram.Desktop/DesktopAlbum.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const bridge = text('../../desktop/src/WRGram.Desktop/DesktopBridge.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que la clase de reglas asigna a una constante de C#. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(albumRules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript, dentro del bloque de negaciones del álbum. */
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

/** El trozo de `NativeBridge.java` que es un método, desde su firma hasta la llave que lo cierra. */
function javaBody(name: string): string {
  const start = java.search(new RegExp(`private [^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = java.indexOf('{', start); i < java.length; i++) {
    if (java[i] === '{') depth++;
    else if (java[i] === '}' && --depth === 0) return java.slice(start, i + 1);
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

describe('ronda AM · las tres negativas del navegador vienen de Android', () => {
  it('las tres frases del navegador son literales del puente y el espejo las copia igual', () => {
    for (const [key, name] of [['gone', 'Gone'], ['noAlbum', 'NoAlbum'], ['noItems', 'NoItems']] as [string, string][]) {
      expect(java).toContain(`"${csSentence(name)}"`);
      expect(tsProperty(key, albumRefusals)).toBe(csSentence(name));
      // Y escrita una sola vez en el espejo: una copia suelta es una frase que se va a desfasar.
      expect(count(tsProperty(key, albumRefusals), preview)).toBe(1);
    }
  });

  it('el puente de Android las pronuncia en ese orden', () => {
    const body = javaBody('album');
    const order = [
      'if(message==null){a.fail("El mensaje ya no está disponible.");return;}',
      'if(message.mediaAlbumId==0){a.fail("Este mensaje no pertenece a un álbum.");return;}',
      'if(items.length()<2){a.fail("No se encontraron los elementos del álbum.");return;}',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
  });

  it('la cuarta frase de Android está documentada y no copiada, que es la diferencia', () => {
    // Allá el `catch` que monta el JSON a mano tiene su propia negativa; este puente devuelve objetos y la
    // conversión la hace el serializador, así que la frase no tiene a quién negarle nada.
    expect(java).toContain('catch(Exception ignored){a.fail("No se pudo consultar el álbum.");}');
    expect(albumRules).toContain('«No se pudo consultar el álbum.»');
    for (const source of [albumRules, service, preview]) {
      // Documentada con comillas angulares: si aparece entre comillas rectas es una constante viva.
      expect(count('"No se pudo consultar el álbum."', source)).toBe(0);
      expect(count("'No se pudo consultar el álbum.'", source)).toBe(0);
    }
  });

  it('la regla del álbum compartido está en un solo sitio de las dos capas', () => {
    // `ConvertMessage` publicaba su propia expresión de `grouped_id` y el navegador otra: dos maneras de
    // entender qué es un álbum, que es exactamente como se separan dos capas.
    expect(count('DesktopAlbum.AlbumIdOf', service)).toBe(3);
    expect(count('grouped_id', service)).toBe(0);
    expect(service).toContain('AlbumId = DesktopAlbum.AlbumIdOf(message),');
    expect(csBody('AlbumIdOf', albumRules)).toContain('Message.Flags.has_grouped_id');
    // Un `grouped_id` cero es la ausencia de álbum, no el álbum cero.
    expect(csBody('AlbumIdOf', albumRules)).toContain('return grouped > 0 ? grouped.ToString() : null;');
  });

  it('la anchura de la banda la pone la clase de reglas y el puente no la reescribe', () => {
    expect(albumRules).toContain('public const int Window = 10;');
    const body = csBody('AlbumItemsAsync');
    expect(body).toContain('add_offset: -DesktopAlbum.Window, limit: DesktopAlbum.Window * 3);');
    expect(count('DesktopAlbum.Window', body)).toBe(2);
    expect(body).not.toMatch(/offset_id: \(int\)id,\s*\n\s*add_offset: -\d/);
    expect(body).not.toMatch(/limit: \d/);
    // Y la ventana de Android, leída de la fuente: dos lecturas de diez ancladas en el mensaje tocado.
    expect(javaBody('album')).toContain('new TdApi.GetChatHistory(chat,message.id,-9,10,false)');
    expect(javaBody('album')).toContain('new TdApi.GetChatHistory(chat,message.id,0,10,false)');
  });
});

describe('ronda AM · el puente lee la banda y responde una fila por pieza', () => {
  const body = () => csBody('AlbumItemsAsync');

  it('el brazo entra antes que la negativa genérica y el puente Android lo conocía', () => {
    const arm = '"message.album" => await AlbumItemsAsync(args),';
    expect(count(arm, service)).toBe(1);
    expect(at(arm, service)).toBeLessThan(at('_ => throw new BridgeException($"No disponible en escritorio (beta)', service));
    expect(policy).toContain('"message.album"');
    expect(java).toContain('case "message.album":');
  });

  it('mira la cuenta y la conversación antes de pedir nada', () => {
    const order = ['CollectionClient();', 'RequireEntry(_active);', 'var id = Long(args, "id");', 'Messages_GetHistory'];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, body())).toBeGreaterThan(at(order[index - 1], body()));
    }
  });

  it('las tres negativas salen de la clase de reglas y en el orden del puente', () => {
    const code = body();
    const order = [
      'if (id <= 0) throw new BridgeException(DesktopAlbum.Gone);',
      'if (anchor == null) throw new BridgeException(DesktopAlbum.Gone);',
      'if (grouped == null) throw new BridgeException(DesktopAlbum.NoAlbum);',
      'if (items.Length < DesktopAlbum.Min) throw new BridgeException(DesktopAlbum.NoItems);',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
      expect(code).toContain(needle);
    }
    // Ninguna escrita a mano en el puente: si la frase se va, se va de las tres capas a la vez.
    for (const name of ['Gone', 'NoAlbum', 'NoItems']) {
      expect(code).not.toContain(`"${csSentence(name)}"`);
    }
  });

  it('primero descarta las filas que no son mensajes y luego busca el ancla', () => {
    const code = body();
    expect(at('OfType<TL.Message>()', code)).toBeLessThan(at('var anchor = rows.FirstOrDefault', code));
    expect(code).toContain('.Where(message => message.ID > 0)');
    expect(code).toContain('var anchor = rows.FirstOrDefault(message => message.ID == id);');
  });

  it('recoloca las piezas por id y se queda con las del mismo álbum', () => {
    const code = body();
    expect(code).toContain('.Where(message => DesktopAlbum.AlbumIdOf(message) == grouped)');
    expect(at('.Where(message => DesktopAlbum.AlbumIdOf(message) == grouped)', code))
      .toBeLessThan(at('.OrderBy(message => message.ID)', code));
    // El mínimo es el del lote: la misma orilla, no un número repetido.
    expect(code).toContain('if (items.Length < DesktopAlbum.Min)');
  });

  it('responde objetos, no un texto montado a mano', () => {
    const code = body();
    expect(count('new AlbumCaptionDto { Id = message.ID.ToString(), Text = message.message ?? "" }', code)).toBe(1);
    expect(code).not.toContain('StringBuilder');
    expect(state).toContain('public string Id { get; set; } = "";');
    expect(state).toContain('public string Text { get; set; } = "";');
    // Y el serializador los escribe en minúscula, que es la forma que la pantalla espera: `id` y `text`.
    expect(bridge).toContain('PropertyNamingPolicy = JsonNamingPolicy.CamelCase');
    expect(javaBody('album')).toContain('items.put(object("id",String.valueOf(item.id),"text",dto.caption(item)))');
  });

  it('es una lectura: no marca leído, no sube nada y no deja nada que deshacer', () => {
    const code = body();
    for (const forbidden of ['ReadHistory', 'UploadFileAsync', 'SendMultiMedia', 'SendMedia', 'DropOutbox',
      'DeleteFolder', '_historyDirty', '_dialogsDirty', '_state.Sending', '_state.Uncertain']) {
      expect(code).not.toContain(forbidden);
    }
    expect(code).toContain('await client.Messages_GetHistory');
  });
});

describe('ronda AM · el espejo del andamio', () => {
  it('la tercera puerta del álbum entra por la de la plataforma', () => {
    const arm = "if (method === 'message.album' && state.platform === 'desktop') return desktopMessageAlbum(params, state);";
    expect(count(arm, preview)).toBe(1);
    expect(at(arm, preview)).toBeLessThan(at("throw new Error('Vista sintética", preview));
    // Y las otras dos siguen donde estaban.
    expect(count("if (method === 'attachment.album' && state.platform === 'desktop') return desktopAttachmentAlbum(params, state);", preview)).toBe(1);
    expect(count("if (method === 'send.album' && state.platform === 'desktop') return desktopAlbumSend(params, state);", preview)).toBe(1);
  });

  it('el espejo niega en el mismo orden que el puente', () => {
    const code = tsBody('desktopMessageAlbum');
    const order = [
      'if (!anchor) throw new Error(ALBUM_REFUSALS.gone);',
      'if (!album) throw new Error(ALBUM_REFUSALS.noAlbum);',
      'if (items.length < ALBUM_MIN) throw new Error(ALBUM_REFUSALS.noItems);',
    ];
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
    }
    expect(code).not.toContain('ALBUM_REFUSALS.batch');
  });

  it('el espejo ordena por número y solo devuelve id y texto', () => {
    const code = tsBody('desktopMessageAlbum');
    expect(code).toContain('.sort((a, b) => Number(a.id) - Number(b.id))');
    expect(at('.sort(', code)).toBeLessThan(at('const anchor = rows.find', code));
    expect(code).toContain('.map(message => ({ id: message.id, text: message.text }))');
    // El pie viaja plano: las entidades se reinterpretan al leer y se recomponen al guardar.
    expect(code).not.toContain('entities');
  });

  it('la conversación se filtra por la activa, que es lo que hace `RequireEntry` arriba', () => {
    expect(tsBody('desktopMessageAlbum')).toContain('.filter(message => message.chatId === state.active)');
    expect(tsBody('desktopMessageAlbum')).not.toMatch(/fixture\.messages|poolOf\(/);
  });
});

describe('ronda AM · la pantalla de Windows ya entra al navegador', () => {
  it('las dos ramas del menú tienen la entrada, y ninguna cuelga de la plataforma', () => {
    // `messageMenu` son dos listas: la de Windows (945) se escribió recortada sobre la de Android, y dejar la
    // entrada solo en la de Android era tener el puente atendido y la pantalla sin por dónde entrar.
    const item = '<MenuItem icon={<Image/>} label="Editar textos del álbum" onClick={()=>openAlbumCaptions(message)}/>';
    expect(count(item, app)).toBe(2);
    expect(count(`{message.albumId&&!desktop&&${item}`, app)).toBe(0);
    const desktop = app.slice(at('{props.reactions.length>0&&reactionBar(props,act)}', app),
      at('const owner=state.selfId,topic=', app));
    const android = app.slice(at('{reactionBar(props,act)}', app));
    for (const branch of [desktop, android]) {
      expect(branch).toContain(`{message.albumId&&${item}}`);
      // En las dos, justo después de las entradas de editar: el pie se escribe con la misma orden.
      expect(at(`{message.albumId&&${item}}`, branch)).toBeGreaterThan(at('{editEntries(props)}', branch));
    }
  });

  it('la lista exige dos piezas y se cierra en silencio si el puente niega', () => {
    const code = app.slice(at('function openAlbumCaptions', app), at('function openAlbumCaptions', app) + 900);
    expect(code).toContain("run<{id:string;text:string}[]>('message.album',{id:message.id})");
    expect(code).toContain('if(!items||items.length<2){setDialog(undefined);return;}');
    expect(code).toContain('Textos del álbum (${items.length})');
    expect(code).toContain('item.text||`Elemento ${index+1} sin texto`');
    // El aviso de que se está leyendo ya está puesto antes de esperar la respuesta.
    expect(at('Consultando los elementos del álbum en Telegram…', code))
      .toBeLessThan(at("run<{id:string;text:string}[]>('message.album'", code));
  });

  it('el guardado escribe en la pieza, no en el ancla', () => {
    const code = app.slice(at('function editAlbumCaption', app), at('function editAlbumCaption', app) + 900);
    expect(code).toContain("run<boolean>('message.edit.caption',{id:item.id,caption:value.text,entities:value.entities})");
    expect(code).not.toContain("message.edit.caption',{id:message.id");
    expect(code).toContain('if(saved)openAlbumCaptions(message);');
    expect(code).toContain('maximum={1024}');
    // Y la orden con la que se guarda es la que el puente de Windows atiende desde la ronda AH.
    expect(service).toContain('"message.edit.caption" =>');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string; text: string; chatId: string; albumId?: string };
type Snap = { active: string; selfId: string; messages: Row[]; chats: { id: string }[] };
type Vale = { token: string; name: string; size: number };
type Piece = { id: string; text: string };

describe('ronda AM · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', messages: [], chats: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);
  const album = async (params: Record<string, unknown> = {}) =>
    await call('attachment.album', params) as Vale[] | undefined;
  const tokensOf = (items: Vale[] | undefined) => (items ?? []).map(item => item.token);
  /** Manda un lote de fotos y devuelve las filas que dejó en el historial. */
  const sent = async (names: string[]) => {
    const items = await album({ names });
    expect(await call('send.album', { tokens: tokensOf(items) })).toBe(true);
    return snap().messages.slice(-names.length);
  };

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('leer el álbum devuelve las tres piezas con su id y su texto vacío', async () => {
    const rows = await sent(['verano-01.jpg', 'verano-02.png', 'verano-03.webp']);
    const items = await call('message.album', { id: rows[0].id }) as Piece[];
    expect(items.map(item => item.id)).toEqual(rows.map(row => row.id));
    expect(items.every(item => item.text === '')).toBe(true);
  });

  it('da igual la pieza que se toque: las tres salen en el mismo orden', async () => {
    const rows = await sent(['a.jpg', 'b.jpg', 'c.jpg']);
    const expected = rows.map(row => row.id);
    for (const row of rows) {
      expect(((await call('message.album', { id: row.id })) as Piece[]).map(item => item.id)).toEqual(expected);
    }
  });

  it('el orden es numérico, no el que salió del selector', async () => {
    const rows = await sent(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    const ids = rows.map(row => row.id).reverse();
    expect(ids.map(Number).sort((a, b) => a - b)).toEqual(rows.map(row => Number(row.id)));
    const items = await call('message.album', { id: ids[0] }) as Piece[];
    expect(items.map(item => item.id)).toEqual(rows.map(row => row.id));
  });

  it('lo que se guarda en una pieza vuelve en la siguiente lectura', async () => {
    const rows = await sent(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(await call('message.edit.caption', { id: rows[1].id, caption: 'Segundo plano', entities: [] })).toBe(true);
    const items = await call('message.album', { id: rows[0].id }) as Piece[];
    expect(items.map(item => item.text)).toEqual(['', 'Segundo plano', '']);
    expect(items.map(item => item.id)).toEqual(rows.map(row => row.id));
  });

  it('la lectura es plana: el texto se ve sin los marcadores de formato', async () => {
    const rows = await sent(['a.jpg', 'b.jpg']);
    expect(await call('message.edit.caption', {
      id: rows[0].id, caption: 'Puesta de sol', entities: [{ type: 'bold', offset: 0, length: 7 }],
    })).toBe(true);
    const items = await call('message.album', { id: rows[1].id }) as Piece[];
    expect(items[0].text).toBe('Puesta de sol');
    expect(items[0]).not.toHaveProperty('entities');
  });

  it('un texto más largo que el tope de pie no entra, y la lectura no cambia', async () => {
    const rows = await sent(['a.jpg', 'b.jpg']);
    const before = await call('message.album', { id: rows[0].id });
    await expect(call('message.edit.caption', { id: rows[0].id, caption: 'x'.repeat(1025), entities: [] }))
      .rejects.toThrow(/supera los 1024 caracteres/);
    expect(await call('message.album', { id: rows[0].id })).toEqual(before);
  });

  it('un mensaje suelto se niega con la frase de que no es álbum', async () => {
    await sent(['a.jpg', 'b.jpg']);
    const suelto = snap().messages.find(row => row.chatId === '11' && !row.albumId && row.text) as Row;
    await expect(call('message.album', { id: suelto.id }))
      .rejects.toThrow(tsProperty('noAlbum', albumRefusals));
  });

  it('un id que no está en la conversación se niega con la frase de que ya no está', async () => {
    await sent(['a.jpg', 'b.jpg']);
    await expect(call('message.album', { id: '999999' })).rejects.toThrow(tsProperty('gone', albumRefusals));
    await expect(call('message.album', {})).rejects.toThrow(tsProperty('gone', albumRefusals));
    await expect(call('message.album', { id: '0' })).rejects.toThrow(tsProperty('gone', albumRefusals));
  });

  it('la lectura mira la conversación activa: fuera de ella el álbum no existe', async () => {
    const rows = await sent(['a.jpg', 'b.jpg']);
    const before = snap().messages.length;
    set({ active: '13' });
    await expect(call('message.album', { id: rows[0].id })).rejects.toThrow(tsProperty('gone', albumRefusals));
    expect(snap().messages.length).toBe(before);
    set({ active: '11' });
    expect(await call('message.album', { id: rows[0].id })).toHaveLength(2);
  });

  it('dos álbumes en la misma conversación no se mezclan', async () => {
    const first = await sent(['a.jpg', 'b.jpg']);
    const second = await sent(['c.png', 'd.webp']);
    expect(new Set(first.map(row => row.albumId))).toEqual(new Set(['al1']));
    expect(new Set(second.map(row => row.albumId))).toEqual(new Set(['al2']));
    expect(((await call('message.album', { id: second[0].id })) as Piece[]).map(item => item.id))
      .toEqual(second.map(row => row.id));
    await call('message.edit.caption', { id: second[1].id, caption: 'Duna', entities: [] });
    const texts = await call('message.album', { id: first[0].id }) as Piece[];
    expect(texts.every(piece => piece.text === '')).toBe(true);
  });

  it('quedarse con una sola pieza niega el navegador, como en Android', async () => {
    const rows = await sent(['a.jpg', 'b.jpg']);
    expect(await call('messages.delete', { ids: [rows[1].id], revoke: false })).toBe(true);
    await expect(call('message.album', { id: rows[0].id })).rejects.toThrow(tsProperty('noItems', albumRefusals));
  });

  it('leer el álbum no gasta vales ni toca el estado del envío', async () => {
    const items = await album({ names: ['a.jpg', 'b.jpg', 'c.jpg'] });
    const pending = tokensOf(items);
    const lote = await sent(['x.png', 'y.png']);
    expect(await call('message.album', { id: lote[0].id })).toHaveLength(2);
    // El lote pendiente sigue pudiendo enviarse después de la lectura.
    expect(await call('send.album', { tokens: pending })).toBe(true);
    expect(snap().messages.filter(row => row.albumId === 'al2')).toHaveLength(3);
  });

  it('la lectura sobrevive a cerrar y reabrir la conversación', async () => {
    const rows = await sent(['a.jpg', 'b.jpg', 'c.jpg']);
    await call('message.edit.caption', { id: rows[2].id, caption: 'Última', entities: [] });
    await call('chat.open', { id: '13' });
    await call('chat.open', { id: '11' });
    const items = await call('message.album', { id: rows[0].id }) as Piece[];
    expect(items.map(piece => piece.text)).toEqual(['', '', 'Última']);
  });

  it('fuera de Windows la lectura cae en la negativa de siempre', async () => {
    const rows = await sent(['a.jpg', 'b.jpg']);
    set({ platform: 'android' } as never);
    await expect(call('message.album', { id: rows[0].id }))
      .rejects.toThrow('Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.');
  });
});
