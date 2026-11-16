import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const folders = text('../../desktop/src/WRGram.Desktop/DesktopChatFolders.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const model = text('./inboxModel.ts');

/** El literal que una capa asigna a una constante de C#. */
function csSentence(name: string, from = folders): string {
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

/** El bloque de las dos frases del espejo, para no confundirlas con las homónimas de `DELETE_REFUSALS`. */
const folderRefusals = /const FOLDER_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

describe('ronda AI · las dos marcas de lista dejan de ser cosa de un teléfono', () => {
  it('el id del archivo es un nombre, no un número repetido', () => {
    expect(folders).toContain('public const int Main = 0;');
    expect(folders).toContain('public const int Archive = 1;');
    expect(folders).toContain('public static int FolderOf(bool archived) => archived ? Archive : Main;');
    // Las dos cargas de la lista comparaban el uno a mano; ahora preguntan a la misma regla.
    expect(service).not.toContain('folder == 1 || dialog.folder_id == 1');
    expect(count('DesktopChatFolders.IsArchived(folder, dialog.folder_id)', service)).toBe(2);
  });

  it('la marca de no leído sale de la bandera una sola vez', () => {
    expect(folders).toContain('(dialog.flags & Dialog.Flags.unread_mark) != 0');
    expect(count('DesktopChatFolders.IsMarked(dialog)', service)).toBe(2);
    // Y la fila la guarda: sin el campo en la entrada, la marca se perdía al reconstruir la lista.
    expect(service).toMatch(/public bool Marked;/);
    expect(service).toContain('Marked = entry.Marked,');
    expect(count('Marked = (dialog.flags & TL.Dialog.Flags.unread_mark) != 0,', service)).toBe(0);
  });

  it('las dos órdenes entran por su brazo, antes del genérico', () => {
    for (const arm of ['"chat.archive" => await ArchiveDialogAsync(args),', '"chat.unread" => await MarkUnreadAsync(args),']) {
      expect(count(arm, service)).toBe(1);
      expect(service.indexOf(arm)).toBeLessThan(service.indexOf('_ => throw new BridgeException($"No disponible en escritorio (beta)'));
    }
  });

  it('son métodos que el puente ya conoce, así que no nacen huérfanos', () => {
    for (const method of ['chat.archive', 'chat.unread']) {
      expect(policy).toContain(`"${method}"`);
    }
    // Y son las dos líneas de Android que esta ronda copia: valor nuevo, no orden.
    expect(java).toContain('case "chat.archive":');
    expect(java).toContain('case "chat.unread":');
    expect(java).toContain('TdApi.ChatListArchive()');
    expect(java).toContain('TdApi.ToggleChatIsMarkedAsUnread()');
  });

  it('cada escritura usa la petición que la librería publicó', () => {
    expect(csBody('ArchiveDialogAsync')).toContain('Folders_EditPeerFolders');
    expect(csBody('ArchiveDialogAsync')).toContain('folder_id = DesktopChatFolders.FolderOf(value)');
    expect(csBody('MarkUnreadAsync')).toContain('Messages_MarkDialogUnread(new InputDialogPeer { peer = entry.Input }, unread: value)');
    // `unread` va nombrado porque delante hay otro opcional: `parent_peer`, el tema de un monoforo.
    expect(csDoc('MarkUnreadAsync')).toContain('parent_peer');
  });

  it('la pareja sin resolver se niega antes de llamar a nada', () => {
    for (const [name, request] of [['ArchiveDialogAsync', 'Folders_EditPeerFolders'], ['MarkUnreadAsync', 'Messages_MarkDialogUnread']] as const) {
      const body = csBody(name);
      const guard = body.indexOf('entry.Input == null');
      expect(guard).toBeGreaterThan(-1);
      expect(guard).toBeLessThan(body.indexOf(request));
    }
  });

  it('confirmar escribe en la fila cargada, que es lo que lee la pantalla', () => {
    expect(csBody('ArchiveDialogAsync')).toContain('entry.Archived = value;');
    expect(csBody('ArchiveDialogAsync')).toContain('chat.Archived = value;');
    expect(csBody('ArchiveDialogAsync')).toContain('_dialogsDirty = true;');
    expect(csBody('MarkUnreadAsync')).toContain('entry.Marked = value;');
    expect(csBody('MarkUnreadAsync')).toContain('chat.Marked = value;');
  });
});

describe('ronda AI · lo que hace otro dispositivo también se ve', () => {
  it('los dos avisos entran en el despacho de actualizaciones', () => {
    expect(service).toContain('case UpdateFolderPeers folders:');
    expect(service).toContain('OnFolderPeers(folders);');
    expect(service).toContain('case UpdateDialogUnreadMark mark:');
    expect(service).toContain('OnUnreadMark(mark);');
  });

  it('archivar desde otro lado mueve la fila y ensucia la lista', () => {
    const body = csBody('OnFolderPeers');
    expect(body).toContain('pair.folder_id == DesktopChatFolders.Archive');
    expect(body).toContain('entry.Archived = archived;');
    expect(body).toContain('_dialogsDirty = true;');
    // La prosa tiene que decir lo que el número no dice: una carpeta creada por la persona no es el archivo.
    expect(csDoc('OnFolderPeers')).toContain('distinto de');
  });

  it('la marca no mueve la fila de pestaña, y eso está escrito', () => {
    const body = csBody('OnUnreadMark');
    expect(body).toContain('DesktopChatFolders.PeerOf(update.peer)');
    expect(body).toContain('UpdateDialogUnreadMark.Flags.unread');
    expect(body).toContain('chat.Marked = value;');
    expect(body).not.toContain('_dialogsDirty');
    expect(csDoc('OnUnreadMark')).toContain('unread_count');
  });

  it('el unón del aviso se recorta en la regla, no en el despacho', () => {
    const peerOf = csBody('PeerOf', folders);
    expect(peerOf).toContain('DialogPeer dialog => dialog.peer,');
    expect(peerOf).toContain('_ => null,');
  });
});

describe('ronda AI · la pantalla y el espejo dicen lo mismo', () => {
  it('el menú de Windows por fin ofrece las dos, con la etiqueta de Android', () => {
    const desktop = app.slice(app.indexOf('function chatMenu'), app.indexOf('const action=(method:string,value:boolean)'));
    expect(desktop).toContain("act('chat.archive',!chat.archived)");
    expect(desktop).toContain("act('chat.unread',!chat.marked)");
    expect(count("{chat.archived?'Desarchivar':'Archivar conversación'}", app)).toBe(2);
    expect(count("{chat.marked?'Quitar marca de no leído':'Marcar como no leído'}", app)).toBe(2);
  });

  it('las dos ramas del espejo entran por la puerta de la plataforma', () => {
    expect(count("if (method === 'chat.archive' && state.platform === 'desktop') return desktopList(params, state, 'archived');", preview)).toBe(1);
    expect(count("if (method === 'chat.unread' && state.platform === 'desktop') return desktopList(params, state, 'marked');", preview)).toBe(1);
  });

  it('las dos frases del espejo son idénticas carácter a carácter a las del puente', () => {
    expect(tsProperty('resolved', folderRefusals)).toBe(csSentence('NotResolved'));
    // La otra no es una constante del host sino la guarda con la que las dos órdenes empiezan.
    const requireEntry = service.split('\n').find(line => line.includes('RequireEntry(string id)')) ?? '';
    expect(tsProperty('loaded', folderRefusals)).toBe(/"((?:[^"\\]|\\.)*)"/.exec(requireEntry)?.[1]);
  });

  it('el efecto escrito es el que la pantalla filtra', () => {
    expect(preview).toContain("{ ...chat, [field]: value }");
    // `archived` saca la fila de cualquier pestaña que no sea la de archivo: es lo que hace desaparecer el chat
    // al archivarlo, sin que el espejo tenga que mover la lista a mano.
    expect(model).toContain("chat.archived");
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string; archived: boolean; marked: boolean; unread: number; inList?: boolean };
type Snap = { chats: Row[] };

describe('ronda AI · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let snap: () => Snap = () => ({ chats: [] });

  const row = (id: string) => snap().chats.find(item => item.id === id)!;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('archivar escribe la marca en la fila', async () => {
    expect(row('11').archived).toBe(false);
    expect(await call('chat.archive', { id: '11', value: true })).toBe(true);
    expect(row('11').archived).toBe(true);
  });

  it('desarchivar hace exactamente lo contrario, sobre la fila que ya estaba archivada', async () => {
    expect(row('19').archived).toBe(true);
    await call('chat.archive', { id: '19', value: false });
    expect(row('19').archived).toBe(false);
  });

  it('marcar como no leído no toca el contador', async () => {
    const before = row('11').unread;
    expect(await call('chat.unread', { id: '11', value: true })).toBe(true);
    expect(row('11').marked).toBe(true);
    expect(row('11').unread).toBe(before);
    await call('chat.unread', { id: '11', value: false });
    expect(row('11').marked).toBe(false);
  });

  it('una conversación que no está en la lista se niega con la frase del puente y no escribe', async () => {
    const before = JSON.stringify(row('11'));
    await expect(call('chat.archive', { id: '999', value: true })).rejects.toThrow(tsProperty('loaded', folderRefusals));
    await expect(call('chat.unread', { id: '999', value: true })).rejects.toThrow(tsProperty('loaded', folderRefusals));
    expect(JSON.stringify(row('11'))).toBe(before);
  });

  it('fuera de Windows las dos órdenes caen en la negativa de siempre', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    for (const method of ['chat.archive', 'chat.unread']) {
      await expect(call(method, { id: '11', value: true })).rejects.toThrow(
        'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
      );
    }
    // Que TDLib sí hace en el dispositivo, y aquí no se finge.
    expect(row('11').archived).toBe(false);
    expect(row('11').marked).toBe(false);
  });

  it('la marca escrita sobrevive a cambiar de pestaña, que es cuando la lista se vuelve a pedir', async () => {
    // Sin esto, el andamio reconstruye la lista desde el fixture y la fila archivada desaparece de las dos
    // vistas: se va de «Todos» por el filtro y no entra en «Archivados» porque la recarga borró la marca.
    await call('chat.archive', { id: '11', value: true });
    await call('chat.unread', { id: '11', value: true });
    expect(await call('chats.list', { list: 'archive' })).toBe(true);
    expect(row('11')).toMatchObject({ archived: true, marked: true, inList: true });
    expect(row('19').inList).toBe(true);
    expect(row('13').inList).toBe(false);
    expect(await call('chats.list', { list: 'main' })).toBe(true);
    expect(row('11').archived).toBe(true);
    expect(row('11').inList).toBe(false);
    expect(row('13').inList).toBe(true);
  });
});
