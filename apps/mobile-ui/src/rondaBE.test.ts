import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { GROUP_PERMISSION_KEYS, GROUP_PERMISSION_REFUSALS, type GroupPermissionsFixture } from './groupPermissions';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const tdapi = text('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopGroupPermissions.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopGroupPermissionsFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const mirror = text('./groupPermissions.ts');
const contract = text('./contract.ts');

const lines = java.split('\n');

/** Una línea del puente, contada desde 1. Sin aguja no hay prueba: se falla. */
function javaLine(number: number): string {
  const line = lines[number - 1];
  if (!line) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return line;
}

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** Si la línea lleva esa frase escrita como literal entero. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);

const count = (needle: string, from: string) => from.split(needle).length - 1;

/** El cuerpo de un método, cortado por el siguiente bloque de documento. */
function body(needle: string, from: string, stop = '\n    /// <summary>'): string {
  const at = from.indexOf(needle);
  if (at < 0) throw new Error(`Falta ${needle}`);
  const rest = from.slice(at);
  const next = rest.indexOf(stop, 1);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Orden de apariciones dentro de un cuerpo: la prueba del cortafuegos es la posición, no una afirmación. */
function ordered(from: string, ...needles: string[]): void {
  const positions = needles.map(needle => {
    const at = from.indexOf(needle);
    if (at < 0) throw new Error(`Falta la aguja "${needle}"`);
    return at;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

/** La rama de escritorio del menú de conversación, cortada antes de la rama de Android. */
function desktopSheet(): string {
  const start = app.indexOf('function chatMenu(chat:Chat){');
  const end = app.indexOf('const action=(method:string,value:boolean)', start);
  if (start < 0 || end < 0) throw new Error('Falta la hoja de opciones de escritorio');
  return app.slice(start, end);
}

const READ = body('private async Task<object?> GroupPermissionsAsync', cable);
const WRITE = body('private async Task<object?> SetGroupPermissionsAsync', cable);

/** La fila de la tabla de banderas de C#: la clave y sus dos columnas, escritas juntas. */
function tableRow(key: string): string {
  const row = new RegExp(`\\("${key}",[\\s\\S]{0,220}?\\),`).exec(rules);
  if (!row) throw new Error(`Falta la fila de ${key} en la tabla`);
  return row[0].replace(/\s+/g, ' ');
}

describe('ronda BE · las tres capas dicen las mismas frases de los permisos', () => {
  it('el despacho de las dos órdenes está en las tres capas', () => {
    expect(javaLine(576)).toContain('case "groups.permissions.get":groupPermissions(p,a);break;');
    expect(javaLine(577)).toContain('case "groups.permissions.set":setGroupPermissions(p,a);break;');
    expect(service).toContain('"groups.permissions.get" => await GroupPermissionsAsync(args),');
    expect(service).toContain('"groups.permissions.set" => await SetGroupPermissionsAsync(args),');
    expect(service).not.toContain('groups.permissions.get" => throw');
    expect(service).not.toContain('groups.permissions.set" => throw');
    expect(policy).toContain('"groups.permissions.get"');
    expect(policy).toContain('"groups.permissions.set"');
    // La escritura es de las que esperan lo que la persona tarde en confirmar.
    expect(text('./bridge.ts')).toContain("'groups.permissions.set',");
  });

  it('las seis negaciones viven una vez por capa, con la cadena de Java delante', () => {
    expect(says(javaLine(1868), GROUP_PERMISSION_REFUSALS.unsupported)).toBe(true);
    expect(says(javaLine(1868), GROUP_PERMISSION_REFUSALS.noRight)).toBe(true);
    expect(says(javaLine(1868), GROUP_PERMISSION_REFUSALS.unreadable)).toBe(true);
    expect(says(javaLine(2376), GROUP_PERMISSION_REFUSALS.required)).toBe(true);
    expect(says(javaLine(2376), GROUP_PERMISSION_REFUSALS.noRight)).toBe(true);
    expect(says(javaLine(2376), GROUP_PERMISSION_REFUSALS.changedAccount)).toBe(true);
    expect(csSentence('Unsupported')).toBe(GROUP_PERMISSION_REFUSALS.unsupported);
    expect(csSentence('Required')).toBe(GROUP_PERMISSION_REFUSALS.required);
    expect(csSentence('NoRight')).toBe(GROUP_PERMISSION_REFUSALS.noRight);
    expect(csSentence('Unreadable')).toBe(GROUP_PERMISSION_REFUSALS.unreadable);
    expect(csSentence('Incomplete')).toBe(GROUP_PERMISSION_REFUSALS.incomplete);
    expect(csSentence('ChangedAccount')).toBe(GROUP_PERMISSION_REFUSALS.changedAccount);
    // Las cinco negaciones que Android también dice en español están medidas en Java; la sexta es la causa en
    // español de un `throw` inglés, y por eso se comprueba aparte.
    for (const [name, phrase] of Object.entries(GROUP_PERMISSION_REFUSALS)) {
      expect(count(phrase, java), name).toBe(name === 'incomplete' ? 0 : name === 'noRight' ? 2 : 1);
      expect(count(phrase, rules), name).toBeLessThanOrEqual(1);
      expect(count(phrase, mirror), name).toBe(1);
      // El cable pide la constante; no repite la cadena.
      expect(count(phrase, cable), name).toBe(0);
      expect(count(phrase, preview), name).toBe(0);
    }
    // Las dos frases de la forma son distintas a propósito: `answer.fail` de la lectura y `IllegalArgumentException`
    // de la escritura, y la pantalla los traduce por caminos separados.
    expect(GROUP_PERMISSION_REFUSALS.required).not.toBe(GROUP_PERMISSION_REFUSALS.unsupported);
  });

  it('el cuadro de confirmar dice las tres palabras de Android y reutiliza la ventana del host', () => {
    const dialogBody = 'Se aplicarán a los miembros del grupo. No cambian los permisos de administradores ni se enviarán mensajes.';
    expect(says(javaLine(2376), 'Cambiar permisos predeterminados')).toBe(true);
    expect(says(javaLine(2376), dialogBody)).toBe(true);
    expect(says(javaLine(2376), 'Guardar permisos')).toBe(true);
    expect(csSentence('DialogTitle')).toBe('Cambiar permisos predeterminados');
    expect(csSentence('DialogBody')).toBe(dialogBody);
    expect(csSentence('DialogAccept')).toBe('Guardar permisos');
    // La ventana es la de la foto y la de la ficha: `ConfirmPhoto` con su preview nulo, no una segunda ventana.
    expect(cable).toContain('ConfirmPhoto(DesktopGroupPermissions.DialogTitle, DesktopGroupPermissions.DialogBody,');
    expect(cable).toContain('DesktopGroupPermissions.DialogAccept, null);');
    expect(count('private static bool ConfirmPermissions()', cable)).toBe(1);
    expect(count('new Window', cable)).toBe(0);
    expect(count('MessageBox.Show', cable)).toBe(0);
  });

  it('las dieciséis claves son las de Android, en el orden del constructor de TDLib', () => {
    const constructor = tdapi.split('\n')[17750];
    expect(GROUP_PERMISSION_KEYS).toHaveLength(16);
    for (const key of GROUP_PERMISSION_KEYS) {
      expect(javaLine(1868)).toContain(`"${key}",value.${key}`);
      expect(javaLine(2376)).toContain(`requiredBool(p,"${key}")`);
      expect(constructor).toContain(`boolean ${key}`);
      expect(tableRow(key)).toContain('ChatBannedRights.Flags.');
      expect(contract).toContain(`${key}:boolean`);
    }
    // El orden del `object(...)` de la lectura es el de la tabla, uno por uno.
    const dto = [...javaLine(1868).matchAll(/"([A-Za-z]+)",value\./g)].map(found => found[1]);
    expect(dto).toEqual(GROUP_PERMISSION_KEYS);
    const built = [...javaLine(2376).matchAll(/requiredBool\(p,"([A-Za-z]+)"\)/g)].map(found => found[1]);
    expect(built).toEqual(GROUP_PERMISSION_KEYS);
    const constructed = [...constructor.matchAll(/boolean (can[A-Za-z]+)/g)].map(found => found[1]);
    expect(constructed).toEqual(GROUP_PERMISSION_KEYS);
    const table = [...rules.matchAll(/\("(can[A-Za-z]+)"/g)].map(found => found[1]);
    expect(table).toEqual(GROUP_PERMISSION_KEYS);
    // El `requiredBool` de Android está en inglés y el despacho genérico (`:152`) lo disfraza; aquí la causa se dice
    // en español. La cadena inglesa queda citada en el documento, nunca lanzada.
    expect(javaLine(2757)).toContain('throw new IllegalArgumentException("Missing permission: "+key)');
    expect(rules).not.toContain('throw new BridgeException("Missing permission');
    expect(cable).not.toContain('Missing permission');
  });

  it('lo que se midió por reflexión sobre la librería, escrito donde se lee', () => {
    // La inversión: la bandera puesta es la prohibición, y eso está en los dos sentidos.
    expect(rules).toContain('flags = values[field.Key] ? rights.flags & ~field.Denied : rights.flags | field.Denied');
    expect(rules).toContain('(rights.flags & (field.Denied | field.Covers)) == 0');
    // Las banderas por las que Telegram prohíbe escribir, medidas sobre `TL.ChatBannedRights+Flags`.
    for (const flag of ['send_plain', 'send_audios', 'send_docs', 'send_photos', 'send_videos', 'send_roundvideos',
      'send_voices', 'send_polls', 'send_stickers', 'send_gifs', 'send_games', 'send_inline', 'embed_links',
      'send_reactions', 'edit_rank', 'change_info', 'invite_users', 'pin_messages', 'manage_topics']) {
      expect(rules).toContain(`ChatBannedRights.Flags.${flag}`);
    }
    // Los dos paraguas se leen y no se escriben: levantarlos sería cambiar casillas que nadie tocó.
    expect(rules).toContain('private const ChatBannedRights.Flags Messages = ChatBannedRights.Flags.send_messages;');
    expect(rules).toContain('private const ChatBannedRights.Flags Media = ChatBannedRights.Flags.send_media;');
    expect(count('Messages | Media', rules)).toBe(7);
    expect(count('flags & ~field.Denied', rules)).toBe(1);
    expect(count('flags | field.Denied', rules)).toBe(1);
    expect(rules).not.toContain('~Messages');
    expect(rules).not.toContain('| Messages,');
    // La marca del peer que dice si la tabla viene, y la petición exacta de la escritura.
    expect(rules).toContain('Channel.Flags.has_default_banned_rights');
    expect(cable).toContain('await client.Messages_EditChatDefaultBannedRights(entry.Input, rights);');
    expect(cable).not.toMatch(/=\s*await client\.Messages_EditChatDefaultBannedRights/);
    expect(cable).toContain('DesktopGroupPermissions.Apply(_chats.GetValueOrDefault(id), rights);');
  });

  it('los cortafuegos del cable están en el orden del puente, línea por línea', () => {
    ordered(READ,
      'DesktopGroupPermissions.Supported(kind)',
      'SelfParticipantAsync(client, ChannelInput(entry))',
      'if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);',
      'if (!actor.CanRestrict) throw new BridgeException(DesktopGroupPermissions.NoRight);',
      'DesktopGroupPermissions.Stored(_chats.GetValueOrDefault(id))',
      'await ReadFullAsync(client, entry, kind)',
      'DesktopGroupPermissions.Dto(rights)');
    ordered(WRITE,
      'DesktopGroupPermissions.Supported(kind)',
      'PermissionValues(args)',
      'DesktopGroupPermissions.Complete(values)',
      'SelfParticipantAsync(client, ChannelInput(entry))',
      'if (!actor.CanRestrict) throw new BridgeException(DesktopGroupPermissions.NoRight);',
      'if (!ConfirmPermissions()) return false;',
      'DesktopGroupPermissions.Written(',
      'client.Messages_EditChatDefaultBannedRights(entry.Input, rights)',
      'DesktopGroupPermissions.Apply(');
    // El derecho se mira después de la forma: si no, un grupo básico oiría «no tienes permiso».
    expect(WRITE.indexOf('Supported(kind)')).toBeLessThan(WRITE.indexOf('CanRestrict'));
    // Y la ventana va delante de la escritura, igual que el botón positivo de `:2376`.
    expect(WRITE.indexOf('ConfirmPermissions()')).toBeLessThan(WRITE.indexOf('EditChatDefaultBannedRights'));
  });

  it('el cable reutiliza lo que ya estaba medido y no vuelve a escribirlo', () => {
    // La pregunta por el propio participante, la lectura del `full info` y la clave del canal son de las rondas AX,
    // AW y AZ: esta no declara ni su `channels.getFullChannel` ni su `getParticipant`.
    expect(cable).toContain('SelfParticipantAsync(client, ChannelInput(entry))');
    expect(cable).toContain('await ReadFullAsync(client, entry, kind)');
    expect(cable).toContain('MergePeers(page?.users?.Values, page?.chats?.Values)');
    expect(cable).toContain('Renewed(page, entry)');
    expect(count('Channels_GetFullChannel', cable)).toBe(0);
    expect(count('Channels_GetParticipant', cable)).toBe(0);
    expect(count('InputChannel(', cable)).toBe(0);
    // El testigo del derecho es el mismo de la lista de miembros: `ban_users` lo sabe `DesktopGroupMembers.Actor`,
    // esta ronda solo pregunta `CanRestrict`.
    expect(cable).toContain('actor.CanRestrict');
    expect(cable).not.toContain('ban_users');
    expect(count('DesktopProfilePhoto.Cancel', cable)).toBe(0);
  });

  it('la hoja de opciones de escritorio tiene la puerta, con la guarda de la forma correcta', () => {
    const sheet = desktopSheet();
    expect(sheet).toContain('(chat.supergroup===true||chat.type===\'channel\')&&<MenuItem icon={<ShieldQuestion/>} label="Permisos predeterminados" onClick={()=>{setDialog(undefined);openGroupPermissions(chat);}}/>');
    // Dos puertas, un solo flujo: la del panel lateral de Android y esta de escritorio.
    expect(count('label="Permisos predeterminados"', app)).toBe(2);
    expect(app).toContain('onClick={()=>openGroupPermissions(active)}');
    // `community(chat)` sería la guarda equivocada: mete el grupo básico, que no tiene tabla que editar.
    expect(sheet).not.toMatch(/community\(chat\)&&<MenuItem icon=\{<ShieldQuestion\/>\} label="Permisos predeterminados"/);
  });

  it('el andamio modela el flujo en lugar de prometer un vacío', () => {
    expect(preview).not.toContain(`if (method === 'groups.permissions.get') return {};`);
    expect(preview).not.toContain(`if (method === 'groups.permissions.set') return true;`);
    expect(count(`method === 'groups.permissions.get'`, preview)).toBe(1);
    expect(count(`method === 'groups.permissions.set'`, preview)).toBe(1);
    expect(preview).toContain('groupPermissionFixtures');
    expect(preview).toContain('applyPermissions(groupPermissionsEntry(id), values)');
    expect(count('groupPermissionsEntry', preview)).toBe(3);
    // El testigo del derecho es el de la ronda AZ: la misma `availableRights` que filtra el panel de miembros.
    expect(count('availableRights(chat.type === \'channel\', chat.isForum === true).canRestrictMembers', preview)).toBe(2);
  });

  it('las citas de archivo y línea del documento C# existen', () => {
    for (const file of [rules, cable]) {
      for (const [, start] of file.matchAll(/NativeBridge\.java:(\d+)/g)) {
        expect(lines.length).toBeGreaterThan(Number(start));
      }
      for (const [, start] of file.matchAll(/TdApi\.java:(\d+)/g)) {
        expect(tdapi.split('\n').length).toBeGreaterThan(Number(start));
      }
    }
    expect(rules).toContain('NativeBridge.java:1868');
    expect(rules).toContain('TdApi.java:17751');
    expect(cable).toContain('NativeBridge.java:576');
    // La orden lleva en la lista del puente desde la ronda A y la pantalla la pide desde la Q: las dos citas que
    // explican por qué en Windows esto era un «falta el cable» y no un «falta la petición».
    expect(cable).toContain('BridgePolicy.java:25');
    // La cita de la pantalla también está viva, y se comprueba a partir del número que el propio cable escribe: la
    // puerta del panel lateral de Android se movió seis líneas cuando la ronda BQ abrió la de crear enlace, y una
    // aguja con el índice copiado a mano habría quedado verde sobre otra línea.
    const cited = Number(/App\.tsx:(\d+)/.exec(cable)?.[1] ?? -1);
    expect(cited).toBe(1164);
    expect(app.split('\n')[cited - 1], `App.tsx:${cited}`).toContain('onClick={()=>openGroupPermissions(active)}');
  });
});

type Permissions = GroupPermissionsFixture['rights'];
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BE · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  });

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);
  const read = async (id: string) => await ask('groups.permissions.get', { id }) as Permissions;
  const full = (changes: Partial<Permissions> = {}): Permissions =>
    GROUP_PERMISSION_KEYS.reduce(
      (value, key) => ({ ...value, [key]: changes[key] ?? true }),
      {} as Permissions,
    );

  it('leer trae las dieciséis claves de Android, en su orden', async () => {
    const value = await read('12');
    expect(Object.keys(value)).toEqual(GROUP_PERMISSION_KEYS);
    expect(GROUP_PERMISSION_KEYS.every(key => value[key])).toBe(true);
  });

  it('cada fila enseña el estado del puente que le toca', async () => {
    const mixed = await read('14');
    expect(mixed.canSendOtherMessages).toBe(false);
    expect(mixed.canInviteUsers).toBe(false);
    expect(mixed.canSendBasicMessages).toBe(true);
    const channel = await read('22');
    expect(GROUP_PERMISSION_KEYS.every(key => channel[key] === false)).toBe(true);
  });

  it('la tabla que Telegram aún no cargó se dice, no se pinta encendida', async () => {
    expect(await ask('groups.permissions.get', { id: '24' })).toBe(GROUP_PERMISSION_REFUSALS.unreadable);
  });

  it('las cuatro negaciones se distinguen entre sí', async () => {
    expect(await ask('groups.permissions.get', { id: '18' })).toBe(GROUP_PERMISSION_REFUSALS.unsupported);
    expect(await ask('groups.permissions.get', { id: '11' })).toBe(GROUP_PERMISSION_REFUSALS.unsupported);
    expect(await ask('groups.permissions.get', { id: '999' })).toBe('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
    // La escritura del mismo básico oye su propia frase: son los dos literales de Java, no una generalización.
    expect(await ask('groups.permissions.set', { id: '18', permissions: full() })).toBe(GROUP_PERMISSION_REFUSALS.required);
  });

  it('una casilla que no llega como booleano es el mensaje mal formado, antes que el permiso', async () => {
    const missing = { ...full() } as Record<string, unknown>;
    delete missing.canSendPhotos;
    expect(await ask('groups.permissions.set', { id: '12', permissions: missing }))
      .toBe(GROUP_PERMISSION_REFUSALS.incomplete);
    expect(await ask('groups.permissions.set', { id: '12', permissions: { ...full(), canSendPolls: 'sí' as unknown as boolean } }))
      .toBe(GROUP_PERMISSION_REFUSALS.incomplete);
    expect(await ask('groups.permissions.set', { id: '12' })).toBe(GROUP_PERMISSION_REFUSALS.incomplete);
    // Y con la tabla incompleta no se escribió nada: la lectura sigue en su sitio.
    expect((await read('12')).canSendPhotos).toBe(true);
  });

  it('lo que se guarda es lo que se vuelve a leer, sin recargar la ficha', async () => {
    expect(await ask('groups.permissions.set', { id: '12', permissions: full({ canSendPhotos: false, canInviteUsers: false }) }))
      .toBe(true);
    const after = await read('12');
    expect(after.canSendPhotos).toBe(false);
    expect(after.canInviteUsers).toBe(false);
    expect(after.canSendAudios).toBe(true);
    expect(Object.keys(after)).toEqual(GROUP_PERMISSION_KEYS);
  });

  it('las claves que el panel no ofrece viajan ignoradas, no inventan una casilla', async () => {
    const asked = { ...full(), canViewMessages: false, untilDate: 0 } as Record<string, unknown>;
    expect(await ask('groups.permissions.set', { id: '22', permissions: asked })).toBe(true);
    expect(Object.keys(await read('22'))).toEqual(GROUP_PERMISSION_KEYS);
  });

  it('escribir sobre una tabla que no estaba cargada la carga, y la lectura deja de negarse', async () => {
    // Es la coherencia del `Written(null, values)` de Windows: sin tabla anterior se parte de cero, y el espejo
    // local pasa a saberla después del `true`.
    expect(await ask('groups.permissions.set', { id: '24', permissions: full({ canSendVideos: false }) })).toBe(true);
    const value = await read('24');
    expect(value.canSendVideos).toBe(false);
    expect(value.canSendBasicMessages).toBe(true);
  });

  it('un canal deja de estar apagado cuando la persona enciende las casillas', async () => {
    expect(await read('22')).toMatchObject({ canSendBasicMessages: false, canPinMessages: false });
    expect(await ask('groups.permissions.set', { id: '22', permissions: full() })).toBe(true);
    expect(await read('22')).toMatchObject({ canSendBasicMessages: true, canPinMessages: true });
  });

  it('la pantalla manda siempre la tabla entera, así que la casilla que se apaga es la que la persona tocó', () => {
    expect(app).toContain('const [value,setValue]=useState(initial)');
    expect(app).toContain("save={permissions=>void run<boolean>('groups.permissions.set',{id:chat.id,permissions})");
    expect(app).toContain("run<GroupPermissions>('groups.permissions.get',{id:chat.id})");
  });
});
