import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopCommunityInfo.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopCommunityEditing.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const contract = text('./contract.ts');
const bridge = text('./bridge.ts');
const communityUi = text('./communityInfo.ts');
const panel = text('./CommunityInfoPanel.tsx');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const editing = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ChatEditing.java');

const lines = java.split('\n');
const editLines = editing.split('\n');

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

/** Una línea de `ChatEditing`, contada desde 1. */
function editingLine(number: number): string {
  const line = editLines[number - 1];
  if (!line) throw new Error(`Falta la línea ${number} de ChatEditing`);
  return line;
}

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string): string {
  const match = new RegExp(`public const string ${name} =\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El bloque de documentación que precede a una declaración de la clase de reglas. */
function docOf(declaration: string): string {
  const list = rules.split('\n');
  const index = list.findIndex(line => line.includes(declaration));
  if (index < 0) throw new Error(`Falta la declaración ${declaration}`);
  let start = index;
  while (start > 0 && (list[start - 1].trim().startsWith('///') || list[start - 1] === '')) start--;
  return list.slice(start, index).join('\n');
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

const MAX_TITLE = Number(/MAX_TITLE\s*=\s*(\d+)/.exec(editing)![1]);
const MAX_DESCRIPTION = Number(/MAX_DESCRIPTION\s*=\s*(\d+)/.exec(editing)![1]);

/** Las seis claves del DTO, en el orden en que las escribe `sendCommunity`. */
const ANDROID_KEYS = [...[javaLine(1908), javaLine(1909)].join(' ').matchAll(/"([a-zA-Z]+)",/g)].map(match => match[1]);

describe('ronda AW · la ficha de la comunidad, cruzada con las tres capas', () => {
  it('las cuatro frases del puente están letra por letra en las cuatro líneas que cita la regla pura', () => {
    for (const [name, javaName, line] of [
      ['Unsupported', 'COMMUNITY_UNSUPPORTED', 1873], ['NoRight', 'COMMUNITY_NO_RIGHT', 1874],
      ['Changed', 'COMMUNITY_CHANGED', 1875], ['Unreadable', 'COMMUNITY_UNREADABLE', 1876],
    ] as const) {
      expect(javaLine(line)).toContain(`${javaName} = "${csSentence(name)}"`);
      // La cita del bloque es lo que hace revisable la frase: sin número, la siguiente ronda no sabe dónde mirar.
      expect(docOf(`public const string ${name} =`)).toContain(String(line));
    }
  });

  it('la frase del texto desbordado es el `catch` de Android, y la de la cuenta cambiada está en los dos guardadores', () => {
    expect(javaLine(1925)).toContain(`a.fail("${csSentence('TooLong')}")`);
    expect(docOf('public const string TooLong =')).toContain('1925');
    // `BridgePolicy.text` cubre las dos causas con la misma cadena —que el texto no quepa y que la clave no sea una
    // cadena—, así que aquí tampoco se separan en dos frases.
    expect(policy).toContain('throw new IllegalArgumentException("Invalid text")');
    expect(csSentence('TooLong')).not.toContain('Invalid text');
    for (const line of [1962, 1978]) {
      expect(javaLine(line)).toContain(`a.fail("${csSentence('ChangedAccount')}")`);
    }
    expect(docOf('public const string ChangedAccount =')).toContain('1978');
  });

  it('las cuatro reglas de longitud dicen en C# lo que dicen en `ChatEditing.problem`', () => {
    expect(editingLine(68)).toContain(`"${csSentence('EmptyTitle')}"`);
    expect(editingLine(76)).toContain(`"${csSentence('UnknownField')}"`);
    expect(csSentence('TitleTooLong')).toBe(`Telegram admite nombres de hasta ${MAX_TITLE} caracteres.`);
    expect(csSentence('DescriptionTooLong')).toBe(`Telegram admite descripciones de hasta ${MAX_DESCRIPTION} caracteres.`);
    expect(editing).toContain(`static final int MAX_TITLE = ${MAX_TITLE};`);
    expect(editing).toContain(`static final int MAX_DESCRIPTION = ${MAX_DESCRIPTION};`);
    expect(rules).toContain(`public const int MaxTitle = ${MAX_TITLE};`);
    expect(rules).toContain(`public const int MaxDescription = ${MAX_DESCRIPTION};`);
    // Los topes de Telegram y los del puente son números distintos, y el del puente se comprueba antes.
    expect(communityUi).toContain(`title: { min: 1, max: ${MAX_TITLE} }`);
    expect(communityUi).toContain(`description: { min: 0, max: ${MAX_DESCRIPTION} }`);
    expect(rules).toContain('public const int BridgeMaximum = 1024;');
    expect(javaLine(1924)).toContain('BridgePolicy.text(params, "value", 1024)');
    expect(javaLine(1926)).toContain('BridgePolicy.text(params, "previous", 1024)');
  });

  it('recortar y contar son las reglas de Java, no las de la biblioteca de cada idioma', () => {
    // `String.trim()` solo quita códigos menores o iguales que el espacio; `string.Trim()` de C# y `trim()` de JS
    // quitan además los espacios Unicode, y eso parte el texto en dos versiones según la capa.
    expect(editingLine(81)).toContain('return value == null ? "" : value.trim();');
    expect(rules).toContain("while (start < end && value[start] <= ' ') start++;");
    expect(rules).toContain("while (end > start && value[end - 1] <= ' ') end--;");
    expect(rules).not.toContain('value.Trim()');
    expect(communityUi).toContain("value.replace(/^[\\x00-\\x20]+/, '').replace(/[\\x00-\\x20]+$/, '')");
    // Un emoji vale uno para Telegram, dos unidades UTF-16 en Java y C#, y dos en el array de JS.
    expect(editingLine(66)).toContain('text.codePointCount(0, text.length())');
    expect(rules).toContain('value.EnumerateRunes().Count()');
    expect(communityUi).toContain('export const characters = (value: string): number => [...value].length;');
  });

  it('el DTO tiene las seis claves de Android, en el mismo orden, en las tres capas', () => {
    expect(ANDROID_KEYS).toEqual(['title', 'description', 'descriptionKnown', 'canChange', 'maxTitle', 'maxDescription']);
    const keys = [...csBody('CommunityInfoAsync').matchAll(/^\s{12}([a-zA-Z]+) = /gm)].map(match => match[1]);
    expect(keys).toEqual(ANDROID_KEYS);
    expect(contract).toContain('export interface CommunityInfo {title:string;description:string;descriptionKnown:boolean;canChange:boolean;maxTitle:number;maxDescription:number}');
  });

  it('la descripción está donde la medida dijo que estaba: en el `full info`, con sus tres formas', () => {
    // Medido sobre `TL.ChatFullBase`: las tres clases derivadas traen `about`, y la más común —el canal y el
    // supergrupo— es `TL.ChannelFull`, no `TL.CommunityFull`. Sin ese brazo, la ficha de un supergrupo se cerraba.
    expect(rules).toContain('ChatFull basic => basic.about ?? "",');
    expect(rules).toContain('ChannelFull channel => channel.about ?? "",');
    expect(rules).toContain('CommunityFull forum => forum.about ?? "",');
    // La lectura que falla degrada el campo a ilegible en vez de ofrecer un vacío, como `sendCommunity` con `known`.
    expect(rules).toContain('public static bool Readable(ChatFullBase? full) => full is ChatFull or ChannelFull or CommunityFull;');
    expect(javaLine(1897)).toContain('sendCommunity(chat, can, "", false, a)');
    expect(javaLine(1903)).toContain('sendCommunity(chat, can, "", false, a)');
    expect(cable).toContain('descriptionKnown = DesktopCommunityInfo.Readable(page?.full_chat)');
    expect(cable).toContain('title = entry.Title,');
  });

  it('los tres caminos del permiso están traducidos a las banderas de MTProto, dicho donde no hay traducción', () => {
    expect(editingLine(37)).toContain('if (status instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) status).isMember;');
    expect(rules).toContain('(channel.flags & Channel.Flags.left) == 0');
    expect(rules).toContain('(channel.flags & Channel.Flags.creator) != 0');
    expect(rules).toContain('(rights.flags & ChatAdminRights.Flags.change_info) != 0');
    expect(rules).toContain('HasRights(basic.flags, Chat.Flags.has_admin_rights)');
    // El tercer camino de Android mira el permiso de un miembro restringido; en un básico de MTProto el dato de la
    // restricción por persona no existe —`TL.Chat` no trae derechos prohibidos por fila— y eso está escrito, no imitado.
    expect(editingLine(48)).toContain('TdApi.ChatPermissions override = restricted.permissions;');
    expect(rules).toContain('no trae <c>banned_rights</c>');
    expect(rules).toContain('(basic.default_banned_rights.flags & ChatBannedRights.Flags.change_info) != 0');
    expect(rules).toContain('(basic.flags & Chat.Flags.deactivated) != 0');
  });

  it('el diálogo de confirmar dice en Windows las mismas cuatro cadenas del `AlertDialog`', () => {
    expect(javaLine(1974)).toContain(`setTitle("${csSentence('DialogTitle')}")`);
    expect(javaLine(1975)).toContain(`setMessage(message + "${csSentence('DialogSuffix')}")`);
    expect(javaLine(1976)).toContain(`setNegativeButton("${csSentence('DialogCancel')}"`);
    expect(javaLine(1977)).toContain(`setPositiveButton("${csSentence('DialogAccept')}"`);
    // Los dos topes del `NativeSnapshot.limit` que Android aplica a los cuerpos.
    expect(javaLine(1970)).toContain('NativeSnapshot.limit(current, 64)');
    expect(javaLine(1970)).toContain('NativeSnapshot.limit(prepared, 64)');
    expect(javaLine(1973)).toContain('NativeSnapshot.limit(prepared, 96)');
    expect(rules).toContain('public const int TitleShown = 64;');
    expect(rules).toContain('public const int DescriptionShown = 96;');
    expect(rules).toContain('«{DesktopContact.Limit(current, TitleShown)}»');
    expect(rules).toContain('Se quitará la descripción que Telegram muestra en la información de la comunidad.');
    // La ventana es la que ya levantaba el cambio de foto de perfil, no una segunda copia.
    expect(cable).toContain('ConfirmPhoto(DesktopCommunityInfo.DialogTitle, body, DesktopCommunityInfo.DialogAccept, null)');
  });

  it('el guardaje del guardado sigue el orden de `setChatInfo`, palabra por palabra', () => {
    const body = csBody('SetCommunityInfoAsync');
    for (const [before, after] of [
      ['DesktopCommunityInfo.Supported(kind)', 'Raw(args, "value")'],
      ['DesktopCommunityInfo.BridgeMaximum)\n            throw new BridgeException(DesktopCommunityInfo.TooLong)', 'Raw(args, "previous")'],
      ['throw new BridgeException(DesktopCommunityInfo.Changed);\n        var prepared', 'DesktopCommunityInfo.Problem('],
      ['DesktopCommunityInfo.Problem(Str(args, "field"), prepared)', 'DesktopCommunityInfo.CanChange('],
      ['throw new BridgeException(DesktopCommunityInfo.NoRight)', 'ConfirmCommunity('],
      ['ConfirmCommunity(DesktopCommunityInfo.TitleBody', 'WriteTitleAsync('],
    ] as const) {
      expect(at(before, body)).toBeLessThan(at(after, body));
    }
    // El permiso se comprueba antes de comparar: primero «puedes», después «esto ya no es lo que veías».
    expect(at('DesktopCommunityInfo.CanChange(', body)).toBeLessThan(at('Prepared(previous) != current', body));
  });

  it('el camino de escribir son dos peticiones para el nombre y una para la descripción', () => {
    // TDLib tiene un único `SetChatTitle`; MTProto lo parte según la forma del peer. Es lo único que el cable decide.
    expect(javaLine(1936)).toContain('new TdApi.SetChatTitle(chat.id, prepared)');
    expect(javaLine(1965)).toContain('new TdApi.SetChatDescription(chat.id, prepared)');
    expect(cable).toContain('await client.Messages_EditChatTitle(basic.chat_id, title);');
    expect(cable).toContain('await client.Channels_EditTitle(new InputChannel(peer.channel_id, peer.access_hash), title);');
    expect(cable).toContain('await client.Messages_EditChatAbout(entry.Input, prepared);');
    expect(count('Messages_EditChatTitle', cable)).toBe(1);
    expect(count('Channels_EditTitle(', cable)).toBe(1);
    expect(count('Channels_GetFullChannel(new InputChannel', cable)).toBe(1);
    expect(count('Messages_GetFullChat(basic.chat_id)', cable)).toBe(1);
    expect(count('Messages_EditChatAbout', cable)).toBe(1);
  });

  it('el `false` es el «Cancelar» y la cuenta cambiada se comprueba en los dos caminos', () => {
    expect(javaLine(1976)).toContain('a.ok(false)');
    expect(javaLine(1980)).toContain('setOnCancelListener(d -> a.ok(false))');
    const body = csBody('SetCommunityInfoAsync');
    expect(count('if (!ConfirmCommunity(', body)).toBe(2);
    expect(count('return false;', body)).toBe(2);
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopCommunityInfo.ChangedAccount)', body)).toBe(2);
    // Después de confirmar y antes de escribir: la ventana puede durar lo que la persona tarde en decidir.
    expect(at('ConfirmCommunity(DesktopCommunityInfo.TitleBody', body)).toBeLessThan(at('if (client.User?.id != owner)', body));
  });

  it('renombrar mueve también la fila de la bandeja, que es donde Android refresca con `schedule()`', () => {
    expect(javaLine(1936)).toContain('schedule(); a.ok(true)');
    const body = csBody('SetCommunityInfoAsync');
    expect(body).toContain('entry.Title = prepared;');
    expect(body).toContain('foreach (var row in _state.Chats) if (row.Id == entry.Id) row.Title = prepared;');
    expect(at('await WriteTitleAsync(client, entry, kind, prepared);', body)).toBeLessThan(at('entry.Title = prepared;', body));
    expect(panel).toContain('if(applied===false){setNotice(cancelledNotice)');
    expect(panel).toContain('setDraft(entry=>({...entry,[current]:current===\'title\'?info.title:info.description}))');
  });

  it('las dos órdenes tienen brazo, manejador y espejo, y ningún brazo se quedó en negativa', () => {
    for (const [method, name] of [['chat.info', 'CommunityInfoAsync'], ['chat.info.set', 'SetCommunityInfoAsync']] as const) {
      expect(count(`"${method}" => await ${name}(args),`, service)).toBe(1);
      expect(count(`private async Task<object?> ${name}(JsonElement args)`, cable)).toBe(1);
      expect(count(`method === '${method}'`, preview)).toBe(1);
      expect(java).toContain(`case "${method}":`);
      expect(policy).toContain(`"${method}"`);
    }
    expect(service).not.toContain('chat.info" => throw');
    expect(service).not.toContain('chat.info.set" => throw');
  });

  it('el espejo copia los dos topes del puente y el orden de las negativas', () => {
    const block = preview.slice(at("method === 'chat.info.set'", preview), at("if (method === 'chat.join')", preview));
    expect(preview).toContain('const COMMUNITY_BRIDGE_MAXIMUM = 1024;');
    expect(preview).toContain(`tooLong: '${csSentence('TooLong')}'`);
    expect(preview).toContain(`unknownField: '${csSentence('UnknownField')}'`);
    expect(count('if (chat && !community(chat)) throw new Error(unsupportedNotice);', block)).toBe(1);
    expect(count('params.value.length > COMMUNITY_BRIDGE_MAXIMUM', block)).toBe(1);
    expect(count('params.previous.length > COMMUNITY_BRIDGE_MAXIMUM', block)).toBe(1);
    for (const [before, after] of [
      ['COMMUNITY_BRIDGE_MAXIMUM)', "field !== 'title'"],
      ['COMMUNITY_REFUSALS.unknownField', 'communityProblem('],
      ['if (reason) throw new Error(reason);', 'if (!entry.canChange)'],
      ['throw new Error(noRightNotice);', "if (field === 'description' && !entry.descriptionKnown)"],
      ['throw new Error(unreadableNotice);', 'if (previous !== entry[field])'],
      ['if (previous !== entry[field]) throw new Error(changedNotice);', 'entry[field] = value;'],
    ] as const) {
      expect(at(before, block)).toBeLessThan(at(after, block));
    }
    // La negación por tipo de chat también está en la lectura, con la misma frase de las tres capas.
    expect(preview.slice(at("method === 'chat.info'", preview), at("method === 'chat.info.set'", preview)))
      .toContain('if (chat && !community(chat)) throw new Error(unsupportedNotice);');
    expect(communityUi).toContain(`export const unsupportedNotice = '${csSentence('Unsupported')}'`);
    expect(communityUi).toContain(`export const noRightNotice = '${csSentence('NoRight')}'`);
    expect(communityUi).toContain(`export const changedNotice = '${csSentence('Changed')}'`);
    expect(communityUi).toContain(`export const unreadableNotice = '${csSentence('Unreadable')}'`);
  });

  it('el menú de conversación ofrece la ficha en las dos ramas, con la misma guarda y el mismo título', () => {
    const start = at('function chatMenu(chat:Chat){', app);
    const divider = at('const action=(method:string,value:boolean)=>{void run(method,{id:chat.id,value})', app);
    const end = start + at('</div>});\n  }', app.slice(start));
    const windows = app.slice(start, divider);
    const android = app.slice(divider, end);
    const item = `label="Nombre y descripción" onClick={()=>setDialog({title:'Información · '+chat.title`;
    expect(count(item, windows)).toBe(1);
    expect(count(item, android)).toBe(1);
    // La rama de Android ya filtraba por la forma del chat; la de Windows no puede ofrecer un campo que su host
    // negaría, y `community` es la misma pregunta que hace la fila de salir del grupo.
    expect(windows).toContain(`community(chat)&&<MenuItem icon={<Pencil/>} ${item}`);
    for (const branch of [windows, android]) {
      expect(branch).toContain('<CommunityInfoPanel key={state.selfId+\':\'+chat.id} chatId={chat.id} run={run} ready={state.ready}/>');
      expect(branch).not.toContain('todavía no se gestiona en Windows');
    }
  });

  it('la escritura espera a la persona, así que lleva el plazo largo del puente', () => {
    // La ventana de confirmar es nativa y puede durar lo que la persona tarde en decidir; la lectura no.
    expect(bridge).toContain("'chat.info.set'");
    expect(bridge).not.toContain("'chat.info'");
  });

  it('las citas de Android en la regla pura y en el cable dicen eso mismo en la línea citada', () => {
    expect(javaLine(584)).toContain('case "chat.info":chatInfo(p,a);break;');
    expect(javaLine(585)).toContain('case "chat.info.set":setChatInfo(p,a);break;');
    for (const file of [rules, cable]) {
      for (const [, start, end] of file.matchAll(/NativeBridge\.java:(\d+)(?:-(\d+))?/g)) {
        expect(lines.length).toBeGreaterThan(Number(start) - 1);
        if (end) expect(lines.length).toBeGreaterThan(Number(end) - 1);
      }
    }
    for (const [, start, end] of rules.matchAll(/ChatEditing\.java:(\d+)(?:-(\d+))?/g)) {
      expect(editLines.length).toBeGreaterThan(Number(start) - 1);
      if (end) expect(editLines.length).toBeGreaterThan(Number(end) - 1);
    }
    const snapshot = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java').split('\n');
    for (const [, start] of rules.matchAll(/NativeSnapshot\.java:(\d+)/g)) {
      expect(snapshot.length).toBeGreaterThan(Number(start) - 1);
    }
  });
});

type Info = { title: string; description: string; descriptionKnown: boolean; canChange: boolean; maxTitle: number; maxDescription: number };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AW · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let tray: () => { id: string; title: string }[] = () => [];

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    tray = () => transport.snapshot().chats as { id: string; title: string }[];
  });

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);
  const read = async (id: string) => (await call('chat.info', { id })) as Info;
  const save = async (id: string, field: string, value: string, previous?: string) =>
    ask('chat.info.set', { id, field, value, previous });

  it('leer la ficha trae las seis claves en el orden de Android y sus topes', async () => {
    const info = await read('14');
    expect(Object.keys(info)).toEqual(ANDROID_KEYS);
    expect(info.title).toBe('WRGram · Comunidad');
    expect(info.description).toContain('https://wrgram.app');
    expect(info.descriptionKnown).toBe(true);
    expect(info.canChange).toBe(true);
    expect(info.maxTitle).toBe(MAX_TITLE);
    expect(info.maxDescription).toBe(MAX_DESCRIPTION);
  });

  it('renombrar deja la ficha y la bandeja con el mismo título, que es lo que lee la persona al cerrar', async () => {
    const before = await read('12');
    expect(await save('12', 'title', '  Equipo de diseño 2026  ', before.title)).toBe(true);
    expect((await read('12')).title).toBe('Equipo de diseño 2026');
    expect(tray().find(row => row.id === '12')?.title).toBe('Equipo de diseño 2026');
  });

  it('la descripción se guarda y se vuelve a leer; un vacío también es una descripción válida', async () => {
    const before = await read('23');
    expect(before.description).toBe('');
    expect(await save('23', 'description', 'Avisos y comentarios de cada versión.', before.description)).toBe(true);
    expect((await read('23')).description).toBe('Avisos y comentarios de cada versión.');
    expect(await save('23', 'description', '   ', 'Avisos y comentarios de cada versión.')).toBe(true);
    expect((await read('23')).description).toBe('');
  });

  it('lo que la pantalla creía que había ya no es lo que guarda Telegram: el guardado se detiene', async () => {
    const info = await read('14');
    expect(await save('14', 'title', 'Otro nombre', `${info.title} añadido`)).toBe('La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.');
    expect(await save('14', 'description', 'Otra descripción', 'nunca existió')).toBe('La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.');
    expect((await read('14')).title).toBe('WRGram · Comunidad');
  });

  it('un título vacío o larguísimo se niega antes de mirar el permiso, como en el puente', async () => {
    const info = await read('22');
    expect(await save('22', 'title', '   ', info.title)).toBe('Telegram no guarda comunidades sin nombre: escribe un título de al menos un carácter.');
    expect(await save('22', 'title', 'x'.repeat(MAX_TITLE), info.title)).toBe(true);
    expect(await save('22', 'title', 'x'.repeat(MAX_TITLE + 1), 'x'.repeat(MAX_TITLE))).toBe(`Telegram admite nombres de hasta ${MAX_TITLE} caracteres.`);
    expect(await save('22', 'description', 'y'.repeat(MAX_DESCRIPTION + 1), 'x'.repeat(MAX_TITLE))).toBe(`Telegram admite descripciones de hasta ${MAX_DESCRIPTION} caracteres.`);
  });

  it('los caracteres se cuentan como los cuenta Telegram, no como los guarda UTF-16', async () => {
    const locked = await read('18');
    const emoji = '👍'.repeat(MAX_TITLE);
    expect(emoji.length).toBe(MAX_TITLE * 2);
    // El exceso se comprueba antes que el permiso; si llegara la frase equivocada, la prueba lo diría.
    expect(await save('18', 'title', 'x'.repeat(MAX_TITLE + 1), locked.title)).toBe(`Telegram admite nombres de hasta ${MAX_TITLE} caracteres.`);
    expect(await save('18', 'title', emoji, locked.title)).toBe('Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.');
    const ok = await read('22');
    expect(await save('22', 'title', emoji, ok.title)).toBe(true);
    expect((await read('22')).title).toBe(emoji);
  });

  it('el tope del puente es menor que el de Telegram y se nota en la frase', async () => {
    const info = await read('14');
    expect(await save('14', 'title', 'x'.repeat(1025), info.title)).toBe('Ese texto es demasiado largo para enviarlo a Telegram.');
    expect(await save('14', 'title', 'Un nombre normal', 'x'.repeat(1025))).toBe('La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.');
    expect(await save('14', 'title', 'Un nombre normal', undefined)).toBe('La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.');
    expect((await read('14')).title).toBe('WRGram · Comunidad');
  });

  it('un campo que no es nombre ni descripción se niega con la frase de la regla pura', async () => {
    const info = await read('14');
    expect(await save('14', 'photo', 'x', info.title)).toBe('Ese campo no se puede cambiar desde WRGram.');
    expect(await save('14', '', 'x', info.title)).toBe('Ese campo no se puede cambiar desde WRGram.');
  });

  it('sin permiso no hay guardado, y sin descripción leída el campo de descripción se cierra', async () => {
    const locked = await read('18');
    expect(locked.canChange).toBe(false);
    expect(await save('18', 'title', 'Ideas & café & más', locked.title)).toBe('Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.');
    expect(await save('18', 'description', 'Cualquier cosa', locked.description)).toBe('Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.');
    const unreadable = await read('24');
    expect(unreadable.descriptionKnown).toBe(false);
    expect(unreadable.canChange).toBe(true);
    expect(await save('24', 'description', 'Lo que sea', unreadable.description)).toBe('Telegram no devolvió la descripción actual de la comunidad. Vuelve a intentarlo.');
    expect(await save('24', 'title', 'WRGram · Colaboración y más', unreadable.title)).toBe(true);
  });

  it('un privado no es una comunidad, y lo dicen las dos órdenes con la frase del puente', async () => {
    const phrase = 'El nombre y la descripción solo se editan en grupos, supergrupos y canales.';
    expect(await ask('chat.info', { id: '11' })).toBe(phrase);
    expect(await save('11', 'title', 'Renombrar a María', 'María Fernández')).toBe(phrase);
    expect(await save('11', 'description', 'x', '')).toBe(phrase);
  });

  it('el separador de no salto no es un borde: lo que guarda la ficha es lo que cuenta Telegram', async () => {
    // La regla de Java (`String.trim`, `ChatEditing.java:81`) solo quita códigos hasta el espacio, así que un U+00A0
    // por delante forma parte del nombre. El `trim()` de JavaScript lo borraba: la pantalla mostraba un título
    // distinto del que Android y Windows escribían en el servidor, y esa diferencia ya está cerrada.
    const info = await read('12');
    const withNbsp = '\u00A0' + info.title;
    expect(withNbsp.length).toBe(info.title.length + 1);
    expect(await save('12', 'title', withNbsp, info.title)).toBe(true);
    expect((await read('12')).title).toBe(withNbsp);
    // El borde ASCII, en cambio, sí sobra: los dos lados lo quitan.
    expect(await save('12', 'title', '  ' + info.title + '  ', withNbsp)).toBe(true);
    expect((await read('12')).title).toBe(info.title);
  });
});
