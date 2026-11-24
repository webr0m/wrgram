import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopChatPhoto.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopChatPhotoFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const accountRules = text('../../desktop/src/WRGram.Desktop/DesktopProfilePhoto.cs');
const communityRules = text('../../desktop/src/WRGram.Desktop/DesktopCommunityInfo.cs');
const registry = text('../../desktop/src/WRGram.Desktop/MediaRegistry.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const bridge = text('./bridge.ts');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const editing = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ChatEditing.java');
const shell = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ShellActivity.java');

const lines = java.split('\n');
const shellLines = shell.split('\n');

function at(needle: string, from: string): number {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
}

const count = (needle: string, from: string) => from.split(needle).length - 1;

/** Una línea de Android, contada desde 1. */
function javaLine(number: number): string {
  const line = lines[number - 1];
  if (!line) throw new Error(`Falta la línea ${number} de Android`);
  return line;
}

/** Una línea de `ShellActivity`, contada desde 1. */
function shellLine(number: number): string {
  const line = shellLines[number - 1];
  if (!line) throw new Error(`Falta la línea ${number} de ShellActivity`);
  return line;
}

/** La cadena que Android declara en la constante de la línea dada. */
function javaConst(number: number, name: string): string {
  const match = new RegExp(`${name} = "((?:[^"\\\\]|\\\\.)*)"`).exec(javaLine(number));
  if (!match) throw new Error(`La línea ${number} de Android no declara ${name}`);
  return match[1];
}

/** La cadena que Android pasa a un constructor de diálogo en una línea dada. */
function javaDialog(number: number, setter: string): string {
  const match = new RegExp(`${setter}\\("((?:[^"\\\\]|\\\\.)*)"`).exec(javaLine(number));
  if (!match) throw new Error(`${javaLine(number).slice(0, 40)}… no tiene ${setter}`);
  return match[1];
}

/** El literal que una clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El bloque de documentación que precede a una declaración de la clase de reglas. */
function docOf(declaration: string, from = rules): string {
  const list = from.split('\n');
  const index = list.findIndex(line => line.includes(declaration));
  if (index < 0) throw new Error(`Falta la declaración ${declaration}`);
  let start = index;
  while (start > 0 && (list[start - 1].trim().startsWith('///') || list[start - 1] === '')) start--;
  return list.slice(start, index).join('\n');
}

/** La última línea de Android que cita la documentación de una constante. */
function cited(name: string): number {
  const declaration = at(`public const string ${name} =`, rules);
  const previous = rules.lastIndexOf('public const string', declaration - 1);
  const block = rules.slice(previous < 0 ? 0 : previous, declaration);
  const matches = [...block.matchAll(/NativeBridge\.java:(\d+)(?!-)/g)];
  if (matches.length === 0) throw new Error(`${name} no cita la línea de Android donde nace su frase`);
  return Number(matches.at(-1)![1]);
}

/** Cuerpo de un método del puente de C#, con las llaves balanceadas. */
function csBody(name: string, from = cable): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La documentación XML que precede a un miembro del cable. */
function csDoc(name: string, from = cable): string {
  const match = new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`).exec(from);
  if (!match) throw new Error(`Falta ${name}`);
  const opening = from.lastIndexOf('<summary>', match.index);
  if (opening < 0) throw new Error(`Falta la documentación de ${name}`);
  return from.slice(opening, match.index);
}

/** Cuerpo de un método de Android, con las llaves balanceadas. */
function javaBody(name: string): string {
  const start = at(`void ${name}(`, java);
  let depth = 0;
  for (let i = java.indexOf('{', start); i < java.length; i++) {
    if (java[i] === '{') depth++;
    else if (java[i] === '}' && --depth === 0) return java.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** El bloque de literales del espejo, desde su declaración hasta la llave que lo cierra. */
function tsBlock(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  return preview.slice(start, preview.indexOf('};', start));
}

/** Cuerpo de una función del espejo. */
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

/** Las citas de Android que un archivo de C# hace con el número suelto (`<c>:1731</c>`). */
function bareCitations(from: string): number[] {
  return [...from.matchAll(/(?<![\w.]):(\d{3,4})(?:-(\d{3,4}))?/g)].flatMap(match =>
    match.slice(1, 3).filter((value): value is string => Boolean(value)).map(Number));
}

describe('ronda BD · la foto de la comunidad, cruzada con las tres capas', () => {
  it('las ocho frases que Android dice están letra por letra en la línea que cita la regla pura', () => {
    for (const [name, javaName, line] of [
      ['Unsupported', 'CHAT_PHOTO_UNSUPPORTED', 1723], ['ChangedAccount', 'CHAT_PHOTO_CHANGED', 1724],
      ['PickTitle', 'CHAT_PHOTO_PICK_TITLE', 1725], ['PickBody', 'CHAT_PHOTO_PICK_BODY', 1726],
      ['DeleteTitle', 'CHAT_PHOTO_DELETE_TITLE', 1727], ['DeleteBody', 'CHAT_PHOTO_DELETE_BODY', 1728],
    ] as const) {
      expect(javaConst(line, javaName)).toBe(csSentence(name));
      // La cita es lo que hace revisable la frase: sin número, la siguiente ronda no sabe dónde mirar.
      expect(docOf(`public const string ${name} =`)).toContain(String(line));
      expect(cited(name)).toBe(line);
    }
    // Los dos botones afirmativos no son constantes en Android: se leen donde el `AlertDialog` los escribe.
    expect(javaDialog(1757, 'setPositiveButton')).toBe(csSentence('PickAccept'));
    expect(javaDialog(1781, 'setPositiveButton')).toBe(csSentence('DeleteAccept'));
    expect(cited('PickAccept')).toBe(1757);
    expect(cited('DeleteAccept')).toBe(1781);
  });

  it('las dos normas que ya existían no se vuelven a declarar', () => {
    // El permiso y el descarte de la imagen son las mismas dos cadenas con las que la ronda AW cambia el nombre y
    // la AU sube el avatar; Android también las comparte (`ChatEditing`, `preparePhoto`) y aquí pasa igual.
    expect(csSentence('NoRight', communityRules)).toBe(javaConst(1895, 'COMMUNITY_NO_RIGHT'));
    expect(javaBody('chatPhotoPick')).toContain('answer.fail(COMMUNITY_NO_RIGHT)');
    expect(javaBody('deleteChatPhoto')).toContain('answer.fail(COMMUNITY_NO_RIGHT)');
    expect(count(csSentence('NoRight', communityRules), rules)).toBe(0);
    expect(count(csSentence('NoImage', accountRules), rules)).toBe(0);
    // Y el «Cancelar» del cuadro de confirmar es el de la foto de perfil, no una segunda copia.
    expect(javaDialog(1757, 'setNegativeButton')).toBe(csSentence('Cancel', accountRules));
    expect(rules).not.toContain('public const string Cancel');
    // Las negativas de forma y de derecho se dicen con las mismas reglas puras que miden el nombre y la descripción.
    expect(cable).toContain('DesktopCommunityInfo.Supported(kind)');
    expect(cable).toContain('DesktopCommunityInfo.CanChange(');
    expect(cable).toContain('throw new BridgeException(DesktopCommunityInfo.NoRight)');
    expect(rules).toContain('<see cref="DesktopCommunityInfo.Supported"/>');
    expect(rules).toContain('<see cref="DesktopProfilePhoto.NoImage"/>');
  });

  it('Android pregunta forma y derecho antes de abrir la galería, y descarta la imagen después', () => {
    const body = javaBody('chatPhotoPick');
    for (const [before, after] of [
      ['if(!ChatEditing.supported(chat))', 'if(chatPhotoPicking!=null)'],
      ['if(chatPhotoPicking!=null){answer.fail(PHOTO_BUSY);return;}', 'new TdApi.GetChatMember'],
      ['if(!ChatEditing.canChange(chat,member.status))', 'activity.chooseChatPhoto()'],
    ] as const) {
      expect(at(before, body)).toBeLessThan(at(after, body));
    }
    // La continuación: sin archivo no hay diálogo ni error, y el descarte se oye desde `preparePhoto`.
    const picked = javaBody('pickedChatPhoto');
    expect(at('if(uri==null){chatPhotoPicking=null;answer.ok(false);return;}', picked)).toBeLessThan(at('preparePhoto(uri,"chat")', picked));
    expect(at('session.selfId!=owner', picked)).toBeLessThan(at('showChatPhotoConfirmation(', picked));
    expect(picked).toContain('answer.fail(CHAT_PHOTO_CHANGED)');
    expect(picked).toContain('catch(IllegalArgumentException invalid)');
    expect(picked).toContain('answer.fail(invalid.getMessage())');
    expect(count('answer.fail("No se pudo preparar', picked)).toBe(0);
  });

  it('el cuadro de confirmar revisa la cuenta otra vez antes de escribir, en las dos capas', () => {
    const dialog = javaBody('showChatPhotoConfirmation');
    for (const [before, after] of [
      ['setTitle(CHAT_PHOTO_PICK_TITLE)', 'setMessage(CHAT_PHOTO_PICK_BODY)'],
      ['setView(view)', 'setNegativeButton("Cancelar"'],
      ['setEnabled(false);', 'new TdApi.SetChatPhoto'],
    ] as const) {
      expect(at(before, dialog)).toBeLessThan(at(after, dialog));
    }
    expect(at('session.selfId!=owner', dialog)).toBeLessThan(at('finishChatPhoto(photo,image,answer,false,CHAT_PHOTO_CHANGED)', dialog));
    const pick = csBody('ChatPhotoPickAsync');
    for (const [before, after] of [
      ['DesktopCommunityInfo.Supported(kind)', 'DesktopCommunityInfo.CanChange('],
      ['DesktopCommunityInfo.NoRight)', 'ChoosePhoto(DesktopChatPhoto.PickFile)'],
      ['ChoosePhoto(DesktopChatPhoto.PickFile)', 'PreparePhoto(chosen)'],
      ['PreparePhoto(chosen)', 'if (CollectionClient().User!.id != owner)'],
      ['throw new BridgeException(DesktopChatPhoto.ChangedAccount);\n        if (!ConfirmPhoto(', 'UploadFileAsync'],
    ] as const) {
      expect(at(before, pick)).toBeLessThan(at(after, pick));
    }
    // Las dos miradas de cuenta de Android (`:1749` y `:1758`): una al volver del selector, otra al pulsar el botón.
    expect(count('if (CollectionClient().User!.id != owner) throw new BridgeException(DesktopChatPhoto.ChangedAccount);', pick)).toBe(2);
    expect(count('return false;', pick)).toBe(2);
  });

  it('en Android borrar es el mismo `SetChatPhoto` con la foto vacía; en Windows no hay objeto que mandar', () => {
    const body = javaBody('deleteChatPhoto');
    expect(at('if(!ChatEditing.supported(chat))', body)).toBeLessThan(at('if(chat.photo==null){answer.ok(false);return;}', body));
    expect(at('if(chat.photo==null){answer.ok(false);return;}', body)).toBeLessThan(at('if(!ChatEditing.canChange(chat,member.status))', body));
    expect(at('setTitle(CHAT_PHOTO_DELETE_TITLE)', body)).toBeLessThan(at('new TdApi.SetChatPhoto(chat.id,null)', body));
    expect(at('answer.owner!=session.selfId', body)).toBeLessThan(at('new TdApi.SetChatPhoto(chat.id,null)', body));
    // Los tres «Cancelar» de Android: el botón, el gesto de salir y el chat que ya estaba sin imagen.
    expect(count('answer.ok(false)', body)).toBe(3);
    expect(javaLine(1783)).toContain('TdApi.SetChatPhoto(chat.id,null)');
    // La medida, dicha en la regla: la librería no genera el vacío, así que no hay a dónde llegar. La frase cae hoy
    // partida por el salto de línea del comentario, así que se exige con su continuación `///` por medio.
    expect(rules).toMatch(/medido por reflexión sobre\s*\/\/\/\s*WTelegramClient 4\.4\.10/);
    expect(rules).toContain('<c>inputChatPhotoEmpty</c> no está generado');
    expect(rules).toContain('<c>photo_id</c>,');
    expect(service).toContain('"chat.photo.delete" => throw new BridgeException(DesktopChatPhoto.NoDelete),');
    expect(service).not.toContain('ChatPhotoDeleteAsync');
    expect(cable).not.toContain('ChatPhotoDeleteAsync');
    expect(count('private async Task', cable)).toBe(2);
  });

  it('la negativa de Windows dice la causa concreta y no un «todavía no»', () => {
    const refusal = csSentence('NoDelete');
    expect(refusal).toContain('la librería no trae el vacío');
    expect(refusal).toContain('Hazlo desde Telegram.');
    expect(refusal).not.toMatch(/todavía|aún|no está disponible en escritorio/);
    // La frase solo existe en Windows: Android no la necesita porque sí puede borrar.
    expect(count(refusal, java)).toBe(0);
    expect(count(refusal, rules)).toBe(1);
    expect(count(refusal, cable)).toBe(0);
  });

  it('el título del selector es distinto en cada flujo, porque la ventana lo dice', () => {
    // En Android el título lo pone el sistema (`GetContent`), así que la cadena no existe en el puente; en Windows
    // la ventana modal sí lo muestra, y dos flujos que piden dos imágenes distintas no pueden abrir la misma frase.
    expect(count(csSentence('PickFile'), java)).toBe(0);
    expect(csSentence('PickFile')).not.toBe(csSentence('PickFile', accountRules));
    expect(cable).toContain('ChoosePhoto(DesktopChatPhoto.PickFile)');
    // La firma con título es la que ya usaba la foto de perfil: un solo selector para los dos flujos.
    expect(count('private static string? ChoosePhoto(string title)', text('../../desktop/src/WRGram.Desktop/DesktopAccountPhoto.cs'))).toBe(1);
    expect(shellLine(117)).toContain('chatPhotoPicker');
    expect(shellLine(117)).toContain('bridge.pickedChatPhoto(uri)');
    expect(shellLine(128)).toContain('void chooseChatPhoto(){chatPhotoPicker.launch("image/*");}');
    // Dos apariciones y las dos suyas: la declaración del lanzador y su único `launch`, sin cables cruzados con el
    // lanzador del avatar, que es el otro `GetContent` de la misma pantalla.
    expect(count('chatPhotoPicker', shell)).toBe(2);
    expect(count('profilePhotoPicker', shell)).toBe(2);
  });

  it('la escritura por MTProto es la que la forma del peer decide, y el refresco no confía en el `Updates`', () => {
    const pick = csBody('ChatPhotoPickAsync');
    expect(pick).toContain('if (kind == DesktopMembership.Kind.Basic)');
    expect(pick).toContain('TL.Methods.Messages_EditChatPhoto { chat_id = BasicId(entry), photo = photo }');
    expect(pick).toContain('TL.Methods.Channels_EditPhoto { channel = ChannelInput(entry), photo = photo }');
    expect(count('await client.Invoke(new TL.Methods', pick)).toBe(2);
    expect(pick).toContain('new InputChatUploadedPhoto { flags = InputChatUploadedPhoto.Flags.has_file, file = uploaded }');
    const refresh = csBody('RefreshChatPhotoAsync');
    expect(csDoc('RefreshChatPhotoAsync')).toContain('updateShort');
    expect(at('_media.Forget(entry.Id)', refresh)).toBeLessThan(at('_media.RegisterProfile(peer, peer.Photo != null', refresh));
    expect(refresh).toContain('Push();');
    expect(count('await ReadFullAsync(client, entry, kind)', refresh)).toBe(1);
    expect(csBody('Forget', registry)).toContain('StableId("photo:" + ownerKey)');
  });

  it('las dos órdenes tienen brazo y espejo, y cada una donde la capa lo puede cumplir', () => {
    for (const [method, arm, line] of [
      ['chat.photo.pick', '"chat.photo.pick" => await ChatPhotoPickAsync(args),', 546],
      ['chat.photo.delete', '"chat.photo.delete" => throw new BridgeException(DesktopChatPhoto.NoDelete),', 547],
    ] as const) {
      expect(count(arm, service)).toBe(1);
      expect(count(`method === '${method}'`, preview)).toBe(1);
      expect(javaLine(line)).toContain(`case "${method}":`);
      expect(policy).toContain(`"${method}"`);
      // Las dos dejan la petición abierta mientras la persona está en un selector o en un diálogo nativo.
      expect(bridge).toContain(`'${method}'`);
    }
    expect(count('private async Task<object?> ChatPhotoPickAsync(JsonElement args)', cable)).toBe(1);
    expect(javaLine(546)).toContain('chatPhotoPick(p,a)');
    expect(javaLine(547)).toContain('deleteChatPhoto(p,a)');
  });

  it('el espejo copia las frases propias, calla las que no puede alcanzar y repite el orden del puente', () => {
    const mirror = tsBlock('CHAT_PHOTO');
    expect(mirror).toContain(`unsupported: '${csSentence('Unsupported')}'`);
    expect(mirror).toContain(`noDelete: '${csSentence('NoDelete')}'`);
    // La cuenta cambiada no tiene dónde ocurrir sin ventana modal: se queda en las dos capas que sí la abren.
    expect(mirror).not.toContain('changedAccount');
    expect(count(csSentence('ChangedAccount'), preview)).toBe(0);
    const pick = tsBody('designChatPhotoPick');
    expect(at("if (chat && !community(chat)) throw new Error(CHAT_PHOTO.unsupported);", pick)).toBeLessThan(at('communityEntry(id, snapshot().chats).canChange', pick));
    expect(at('if (!communityEntry(id, snapshot().chats).canChange) throw new Error(noRightNotice);', pick)).toBeLessThan(at('profilePhotoProblem(', pick));
    expect(at('if (problem) throw new Error(problem);', pick)).toBeLessThan(at('acceptState(', pick));
    expect(pick).not.toContain('CHAT_PHOTO.changedAccount');
    const drop = tsBody('designChatPhotoDelete');
    expect(at("if (platform === 'desktop') throw new Error(CHAT_PHOTO.noDelete);", drop)).toBeLessThan(at('if (chat && !community(chat))', drop));
    expect(at('if (!chat?.photo) return false;', drop)).toBeLessThan(at('communityEntry(id, state.chats).canChange', drop));
    expect(at('if (!communityEntry(id, state.chats).canChange) throw new Error(noRightNotice);', drop)).toBeLessThan(at('photo: undefined', drop));
    // El andamio no añade métodos: las dos órdenes, escritas una vez cada una, más los tres comentarios que las nombran.
    expect(count('chat.photo.', preview)).toBe(5);
    expect(preview).toContain("if (method === 'chat.photo.pick') return designChatPhotoPick(params);");
    expect(preview).toContain("if (method === 'chat.photo.delete') return designChatPhotoDelete(params, state.platform);");
  });

  it('la pantalla ofrece en cada plataforma lo que su puente acepta, y nada más', () => {
    const start = at('function chatMenu(chat:Chat){', app);
    const divider = at("const action=(method:string,value:boolean)=>{void run(method,{id:chat.id,value});setDialog(undefined);};", app);
    const windows = app.slice(start, divider);
    const android = app.slice(divider, start + at('</div>});\n  }', app.slice(start)));
    const pick = 'Cambiar foto de la comunidad';
    const drop = 'Quitar foto de la comunidad';
    expect(count(pick, windows)).toBe(1);
    expect(count(pick, android)).toBe(1);
    // Windows no puede quitar la foto, así que no ofrece el botón: la entrada de borrar es solo de la rama de Android.
    expect(windows).not.toContain(drop);
    expect(android).toContain(drop);
    expect(windows).toContain(`community(chat)&&<MenuItem icon={<Image/>} label="${pick}"`);
    // Y en Android la segunda entrada aparece solo donde hay imagen que quitar, que es la guarda de `:1776`.
    expect(android).toContain(`community(chat)&&chat.photo&&<MenuItem icon={<Trash2/>} label="${drop}"`);
    for (const branch of [windows, android]) {
      expect(branch).toContain("void run<boolean>('chat.photo.pick',{id:chat.id})");
    }
    expect(android).toContain("void run<boolean>('chat.photo.delete',{id:chat.id})");
  });

  it('las citas de Android en la regla pura y en el cable dicen eso mismo en la línea citada', () => {
    // Un número de línea es una promesa que se pudre: la ronda AS lo aprendió cuando dos líneas de comentario
    // movieron tres citas y las agujas viejas siguieron en verde sobre un archivo mentiroso.
    for (const file of [rules, cable]) {
      for (const [, start, end] of file.matchAll(/NativeBridge\.java:(\d+)(?:-(\d+))?/g)) {
        expect(lines.length).toBeGreaterThan(Number(start) - 1);
        if (end) expect(lines.length).toBeGreaterThan(Number(end) - 1);
      }
      for (const line of bareCitations(file)) expect(lines.length).toBeGreaterThan(line - 1);
    }
    // Las seis líneas que dan nombre a una frase tienen que seguir siendo esa frase.
    for (const [name, javaName] of [
      ['Unsupported', 'CHAT_PHOTO_UNSUPPORTED'], ['ChangedAccount', 'CHAT_PHOTO_CHANGED'],
      ['PickTitle', 'CHAT_PHOTO_PICK_TITLE'], ['PickBody', 'CHAT_PHOTO_PICK_BODY'],
      ['DeleteTitle', 'CHAT_PHOTO_DELETE_TITLE'], ['DeleteBody', 'CHAT_PHOTO_DELETE_BODY'],
    ] as const) {
      expect(javaConst(cited(name), javaName)).toBe(csSentence(name));
    }
    expect(javaLine(cited('PickAccept'))).toContain('setPositiveButton(');
    expect(javaLine(cited('DeleteAccept'))).toContain('setPositiveButton(');
    expect(editing).toContain('static boolean supported(TdApi.Chat chat)');
    expect(editing).toContain('static boolean canChange(TdApi.Chat chat, TdApi.ChatMemberStatus status)');
    expect(javaBody('chatPhotoPick')).toContain('ChatEditing.supported(chat)');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Snap = {
  active?: string;
  messages?: unknown;
  chats: { id: string; title: string; photo?: { name: string; ready: boolean } }[];
};

describe('ronda BD · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ chats: [] });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  const ask = async (method: string, params: Record<string, unknown> = {}) =>
    call(method, params).catch((caught: Error) => caught.message);
  const pick = async (id: string, params: Record<string, unknown> = {}) => ask('chat.photo.pick', { id, ...params });
  const drop = async (id: string) => ask('chat.photo.delete', { id });
  const row = (id: string) => snap().chats.find(item => item.id === id);
  const onAndroid = () => transport.acceptState({ ...transport.snapshot(), platform: 'android' });

  it('cambiar la foto de una comunidad la publica en la fila con la forma en que la deja el puente', async () => {
    expect(await pick('12', { name: 'Portada del equipo.png' })).toBe(true);
    // `RefreshChatPhotoAsync` registra la imagen nueva sin haberla bajado todavía: `ready:false`.
    expect(row('12')?.photo).toMatchObject({ name: 'Portada del equipo.png', ready: false });
    // Escribir la foto no mueve nada más: el título y la conversación abierta siguen donde estaban.
    expect((await ask('chat.info', { id: '12' }) as { title: string }).title).toBe('Equipo de diseño');
  });

  it('las cuatro formas de archivo se descartan con la frase única de la foto de perfil', async () => {
    const refusal = csSentence('NoImage', accountRules);
    expect(await pick('14', { name: 'logo.webp' })).toBe(refusal);
    expect(await pick('14', { name: 'sin-extension' })).toBe(refusal);
    expect(await pick('14', { size: 20 * 1024 * 1024 + 1 })).toBe(refusal);
    expect(await pick('14', { width: 12001 })).toBe(refusal);
    expect(row('14')?.photo).toMatchObject({ name: 'Logo de WRGram' });
    // Los topes se miden crudos: 20 MiB y 12000 píxeles entran justos.
    expect(await pick('14', { size: 20 * 1024 * 1024, width: 12000, height: 12000 })).toBe(true);
    expect(await pick('14', { name: 'LOGO.PNG' })).toBe(true);
  });

  it('un privado no es una comunidad, y las dos órdenes lo dicen con la frase del puente', async () => {
    const phrase = csSentence('Unsupported');
    expect(await pick('11')).toBe(phrase);
    expect(await pick('15')).toBe(phrase);
    expect(await pick('16')).toBe(phrase);
    onAndroid();
    expect(await drop('11')).toBe(phrase);
    expect(await drop('16')).toBe(phrase);
  });

  it('sin permiso no se abre el selector: la negativa llega antes que el descarte de la imagen', async () => {
    // El orden de `:1737` y `:1740` contra el descarte de `:1703`. Si aquí se adelantara el archivo, una cuenta sin
    // derechos oiría «no se pudo preparar la imagen» en lugar del permiso que le falta.
    const noRight = csSentence('NoRight', communityRules);
    expect(await pick('18', { name: 'cartel.webp' })).toBe(noRight);
    expect(await pick('18', { size: 40 * 1024 * 1024 })).toBe(noRight);
    expect(await pick('18')).toBe(noRight);
    expect(row('18')?.photo).toBeUndefined();
  });

  it('quitar la foto en Android limpia la fila, y la segunda vez no hay nada que quitar', async () => {
    onAndroid();
    expect(await pick('14', { name: 'Nuevo logo.jpg' })).toBe(true);
    expect(await drop('14')).toBe(true);
    expect(row('14')?.photo).toBeUndefined();
    // `:1776`: sin imagen no se abre el diálogo y se responde `false`, que la pantalla lee «no ha cambiado nada».
    expect(await drop('14')).toBe(false);
    expect(await drop('22')).toBe(false);
  });

  it('una comunidad con imagen y sin permiso no puede quitar lo que no puso', async () => {
    onAndroid();
    // El estado que Telegram puede tener y esta cuenta no puede tocar: foto puesta, derecho ausente. El andamio solo
    // pinta imagen en «WRGram · Comunidad», así que aquí se la pone a «Ideas & café», que es la fila sin permiso.
    transport.acceptState({
      ...transport.snapshot(),
      chats: transport.snapshot().chats.map(item => item.id === '18'
        ? { ...item, photo: { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name: 'Cartel del café', size: 0, minithumbnail: '/bots/snake.jpg' } }
        : item),
    });
    expect(await drop('18')).toBe(csSentence('NoRight', communityRules));
    expect(row('18')?.photo).toMatchObject({ name: 'Cartel del café' });
    // Y la misma fila con una imagen válida: la negativa llega por el permiso, no por el archivo.
    expect(await pick('18', { name: 'Cartel nuevo.png' })).toBe(csSentence('NoRight', communityRules));
  });

  it('en Windows la negativa dice la causa concreta antes de mirar el chat pedido', async () => {
    const refusal = csSentence('NoDelete');
    expect(await drop('14')).toBe(refusal);
    // El brazo del despacho lanza sin leer el identificador, así que ni un privado llega a la frase de forma.
    expect(await drop('11')).toBe(refusal);
    expect(await drop('999999')).toBe(refusal);
    expect(row('14')?.photo).toMatchObject({ name: 'Logo de WRGram' });
    // Y en la misma fila, escribir sí se puede: lo que falta es el vacío, no la escritura.
    expect(await pick('14', { name: 'Logo nuevo.jpg' })).toBe(true);
  });

  it('la foto de la comunidad no toca la foto de la cuenta ni la conversación abierta', async () => {
    const before = transport.snapshot();
    onAndroid();
    expect(await pick('14', { name: 'Logo de la comunidad.png' })).toBe(true);
    expect(await drop('14')).toBe(true);
    const after = transport.snapshot();
    expect(after.active).toBe(before.active);
    expect(after.messages).toBe(before.messages);
    expect(after.name).toBe(before.name);
    expect(after.profilePhoto).toBe(before.profilePhoto);
    // La fila de la conversación abierta ('11') no es una comunidad: ninguna de sus dos fotos se mueve.
    expect(after.chats.find(item => item.id === '11')?.photo).toBeUndefined();
  });
});
