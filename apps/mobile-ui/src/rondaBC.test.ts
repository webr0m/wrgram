import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { CHAT_USERNAME_REFUSALS, type ChatUsernameFixture } from './chatUsernames';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopChatUsernames.cs');
const accountRules = text('../../desktop/src/WRGram.Desktop/DesktopAccountProfile.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopChatUsernameFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const mirror = text('./chatUsernames.ts');
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
  return match[1].replace(/\\"/g, '"');
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

const READ = body('private async Task<object?> ChatUsernameAsync', cable);
const WRITE = body('private async Task<object?> SetChatUsernameAsync', cable);

describe('ronda BC · las tres capas dicen las mismas frases del nombre público', () => {
  it('el despacho de las dos órdenes está en las tres capas', () => {
    expect(javaLine(595)).toContain('case "chat.username":chatUsername(p,a);break;');
    expect(javaLine(596)).toContain('case "chat.username.set":setChatUsername(p,a);break;');
    expect(service).toContain('"chat.username" => await ChatUsernameAsync(args),');
    expect(service).toContain('"chat.username.set" => await SetChatUsernameAsync(args),');
    expect(service).not.toContain('chat.username" => throw');
    expect(service).not.toContain('chat.username.set" => throw');
  });

  it('la negación de forma la dicen los dos métodos de Android y vale una sola constante en C#', () => {
    expect(says(javaLine(1890), CHAT_USERNAME_REFUSALS.unsupported)).toBe(true);
    expect(says(javaLine(1892), CHAT_USERNAME_REFUSALS.unsupported)).toBe(true);
    expect(csSentence('Unsupported')).toBe(CHAT_USERNAME_REFUSALS.unsupported);
    // Dos sitios en Android, uno por capa en Windows y en el espejo: la norma no se declara tres veces.
    expect(count(CHAT_USERNAME_REFUSALS.unsupported, java)).toBe(2);
    expect(count(CHAT_USERNAME_REFUSALS.unsupported, rules)).toBe(1);
    expect(count(CHAT_USERNAME_REFUSALS.unsupported, cable)).toBe(0);
    expect(count(CHAT_USERNAME_REFUSALS.unsupported, mirror)).toBe(1);
    expect(count(CHAT_USERNAME_REFUSALS.unsupported, preview)).toBe(0);
  });

  it('el derecho es `canChangeInfo`, y su ausencia se dice con la frase de `answer.fail`', () => {
    expect(says(javaLine(1892), CHAT_USERNAME_REFUSALS.noRight)).toBe(true);
    expect(csSentence('NoRight')).toBe(CHAT_USERNAME_REFUSALS.noRight);
    expect(count(CHAT_USERNAME_REFUSALS.noRight, rules)).toBe(1);
    expect(count(CHAT_USERNAME_REFUSALS.noRight, mirror)).toBe(1);
    // La pregunta es la misma que ya hacen los otros cuatro flujos de administración: nada de derechos propios.
    expect(rules).toContain('actor.Granted("change_info")');
    expect(rules).toContain('grantedAdminRight(actor,"canChangeInfo")');
  });

  it('la guarda de cuenta es la del `perform` genérico de Android, no una inventada', () => {
    const changed = csSentence('ChangedAccount');
    expect(says(javaLine(488), changed)).toBe(true);
    expect(changed).toBe('La cuenta cambió. Vuelve a abrir la conversación.');
    // `setChatUsername` no escribe ninguna guarda de cuenta: las que hay en el cable son las pasadas del `perform`
    // que envuelve cada respuesta —una en la lectura, dos en la escritura—, y eso se prueba contándolas.
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);', cable)).toBe(3);
  });

  it('el tope, el patrón y los rechazos de Telegram son los de `account.username`, reutilizados', () => {
    // `BridgePolicy.text(p,"username",32)` es una sola función para los dos flujos; copiarla aquí sería otra capa.
    expect(policy).toContain('static String text(JSONObject params,String key,int maximum)');
    expect(javaLine(1892)).toContain('BridgePolicy.text(params,"username",32).trim()');
    expect(javaLine(1892)).toContain('username.matches("[A-Za-z][A-Za-z0-9_]{4,31}")');
    expect(accountRules).toContain('UsernamePattern = @"\\A[A-Za-z][A-Za-z0-9_]{4,31}\\z"');
    // El espejo de C# de esta ronda no vuelve a declarar el tope ni los cuatro códigos de rechazo de Telegram.
    expect(count('MaxUsername', rules)).toBe(0);
    expect(count('USERNAME_OCCUPIED', rules)).toBe(0);
    expect(count('USERNAME_OCCUPIED', accountRules)).toBe(1);
    expect(rules).toContain('DesktopAccountProfile.UsernameRefusal(error)');
    expect(cable).toContain('DesktopAccountProfile.UsernameProblem(raw)');
    expect(cable).toContain('DesktopAccountProfile.Username(raw!)');
    // Y en el andamio tampoco: `profileUsernameProblem` es la misma regla que ya midió la ronda AT.
    expect(count('function profileUsernameProblem', preview)).toBe(1);
    expect(count('El nombre público debe tener de 5 a 32 caracteres y empezar con una letra.', preview)).toBe(1);
  });

  it('el DTO son las dos claves de `sendChatUsername`, en su orden', () => {
    expect(javaLine(1891)).toContain('answer.ok(object("editable",names==null||names.editableUsername==null?"":names.editableUsername,"active",active))');
    expect(contract).toContain('export interface ChatUsername {editable:string;active:string[]}');
    expect(rules).toContain('editable = Editable(peer),');
    expect(rules).toContain('active = Active(peer)');
    expect(ordered(body('public static object Dto', rules), 'editable = Editable(peer)', 'active = Active(peer)'));
  });

  it('lo que se midió por reflexión, escrito donde se lee', () => {
    // Las dos marcas que deciden si el peer sabe nombres y cuál de los dos caminos hay que seguir.
    expect(rules).toContain('Channel.Flags2.has_usernames');
    expect(rules).toContain('Username.Flags.editable');
    expect(rules).toContain('Channel.Flags.has_username');
    // La ausencia que obliga al espejo local: la respuesta de `channels.updateUsername` es un `Bool`, así que el
    // nombre nuevo no lo aprende nadie más que este host.
    expect(cable).toContain('await client.Channels_UpdateUsername(input, username);');
    expect(cable).not.toMatch(/=\s*await client\.Channels_UpdateUsername/);
    expect(cable).toContain('DesktopChatUsernames.Apply(');
    // La petición existe como helper; no hace falta armar el `TL.Methods` a mano, como sí pasó en la ronda BB.
    expect(cable).not.toContain('TL.Methods');
    expect(cable).toContain('client.Channels_GetChannels(new InputChannelBase[] { ChannelInput(entry) })');
  });

  it('los cortafuegos del cable están en el orden del puente, línea por línea', () => {
    ordered(WRITE,
      'DesktopChatUsernames.Supported(kind)',
      'DesktopAccountProfile.UsernameProblem(raw)',
      'DesktopAccountProfile.Username(raw!)',
      'SelfParticipantAsync(client, input)',
      'DesktopChatUsernames.CanChange(actor)',
      'client.Channels_UpdateUsername(input, username)',
      'DesktopChatUsernames.Apply(');
    ordered(READ,
      'DesktopChatUsernames.Supported(kind)',
      'DesktopChatUsernames.Known(cached)',
      'client.Channels_GetChannels(new InputChannelBase[] { ChannelInput(entry) })',
      'MergePeers(null, answer.chats?.Values)',
      'DesktopChatUsernames.Dto(_chats.GetValueOrDefault(id))');
    // El permiso se mira después del texto: si no, un nombre largo en un chat ajeno oiría «no tienes permiso».
    expect(WRITE.indexOf('UsernameProblem')).toBeLessThan(WRITE.indexOf('CanChange'));
  });

  it('la hoja de opciones de escritorio tiene la puerta, con la guarda de la forma correcta', () => {
    const sheet = desktopSheet();
    expect(sheet).toContain('label="Nombre público del chat"');
    expect(sheet).toContain('(chat.supergroup===true||chat.type===\'channel\')&&<MenuItem icon={<Link2/>} label="Nombre público del chat" onClick={()=>{setDialog(undefined);openChatUsername(chat.id,chat.title);}}/>');
    // La misma etiqueta vive en el panel lateral de Android y en esta hoja: dos puertas, un solo flujo.
    expect(count('label="Nombre público del chat"', app)).toBe(2);
    // `community()` sería la guarda equivocada: incluye el grupo básico, que aquí no tiene nombre público.
    expect(sheet).not.toMatch(/community\(chat\)&&<MenuItem icon=\{<Link2\/>\} label="Nombre público del chat"/);
  });

  it('el andamio modela el flujo en lugar de prometer un vacío', () => {
    expect(preview).not.toContain(`if (method === 'chat.username') return { editable: '', active: [] };`);
    expect(preview).not.toContain(`if (method === 'chat.username.set') return true;`);
    expect(count(`method === 'chat.username'`, preview)).toBe(1);
    expect(count(`method === 'chat.username.set'`, preview)).toBe(1);
    expect(preview).toContain('chatUsernameFixtures');
    expect(preview).toContain('applyChatUsername');
    // El espejo reutiliza la guarda de `BridgePolicy.text` de la ronda AT: una norma, un sitio.
    expect(preview).toContain('profileUsernameProblem(params.username)');
  });

  it('las citas de archivo y línea del documento C# existen', () => {
    for (const [, start] of rules.matchAll(/NativeBridge\.java:(\d+)/g)) {
      expect(lines.length).toBeGreaterThan(Number(start));
    }
    for (const [, start] of cable.matchAll(/NativeBridge\.java:(\d+)/g)) {
      expect(lines.length).toBeGreaterThan(Number(start));
    }
    expect(rules).toContain('TdApi.java:155940');
  });
});

type Usernames = ChatUsernameFixture;
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BC · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let tray: () => { id: string; username?: string }[] = () => [];

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    tray = () => transport.snapshot().chats as { id: string; username?: string }[];
  });

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);
  const read = async (id: string) => await call('chat.username', { id }) as Usernames;
  const row = (id: string) => tray().find(item => item.id === id)?.username;
  // Las tres frases de formato las declaró la ronda AT para `account.username`; el andamio las reutiliza, así que
  // la prueba las lee del C# en lugar de volver a escribirlas.
  const missing = csSentence('Missing', accountRules);
  const bad = csSentence('BadUsername', accountRules);

  it('leer trae las dos claves de Android y deja ver el nombre secundario del vector', async () => {
    const names = await read('14');
    expect(Object.keys(names)).toEqual(['editable', 'active']);
    expect(names.editable).toBe('wrgram_community');
    expect(names.active).toEqual(['wrgram_community', 'wrgram_comunidad']);
    expect((await read('12')).editable).toBe('wrgram_equipo');
  });

  it('un chat sin enlace público se dice vacío, no se inventa', async () => {
    const names = await read('24');
    expect(names.editable).toBe('');
    expect(names.active).toEqual([]);
  });

  it('las tres negaciones se distinguen entre sí', async () => {
    expect(await ask('chat.username', { id: '18' })).toBe(CHAT_USERNAME_REFUSALS.unsupported);
    expect(await ask('chat.username', { id: '11' })).toBe(CHAT_USERNAME_REFUSALS.unsupported);
    expect(await ask('chat.username', { id: '999' })).toBe('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
    expect(await ask('chat.username.set', { id: '18', username: 'nuevo_nombre' })).toBe(CHAT_USERNAME_REFUSALS.unsupported);
  });

  it('el formato se corta antes que el permiso, y cada causa tiene su frase', async () => {
    expect(await ask('chat.username.set', { id: '12' })).toBe(missing);
    expect(await ask('chat.username.set', { id: '12', username: 'x'.repeat(33) }))
      .toBe('El texto supera los 32 caracteres que acepta Telegram.');
    expect(await ask('chat.username.set', { id: '12', username: '2nombre' })).toBe(bad);
    expect(await ask('chat.username.set', { id: '12', username: 'abc' })).toBe(bad);
    expect(await ask('chat.username.set', { id: '12', username: '@wrgram_equipo' })).toBe(bad);
    expect((await read('12')).editable).toBe('wrgram_equipo');
  });

  it('la forma manda sobre el formato: un básico con un nombre imposible oye lo que es básico', async () => {
    expect(await ask('chat.username.set', { id: '18', username: 'x'.repeat(60) })).toBe(CHAT_USERNAME_REFUSALS.unsupported);
  });

  it('escribir guarda el nombre recortado, y la ficha y la bandeja lo leen sin recargar', async () => {
    expect(await ask('chat.username.set', { id: '12', username: '  nuevo_equipo  ' })).toBe(true);
    expect(await read('12')).toEqual({ editable: 'nuevo_equipo', active: ['nuevo_equipo'] });
    expect(row('12')).toBe('nuevo_equipo');
    // La tarjeta de la comunidad se arma con la fila que esta orden acaba de mover: la incoherencia de la ronda AE.
    const card = await call('chat.profile', { id: '12' }) as { username: string };
    expect(card.username).toBe('nuevo_equipo');
  });

  it('quitar el nombre deja los secundarios donde estaban', async () => {
    const before = await read('14');
    expect(await ask('chat.username.set', { id: '14', username: '' })).toBe(true);
    expect(await read('14')).toEqual({ editable: '', active: ['wrgram_comunidad'] });
    expect(row('14')).toBe('');
    expect(before.active).toHaveLength(2);
  });

  it('renombrar mueve el editable al frente y no duplica el nombre', async () => {
    expect(await ask('chat.username.set', { id: '14', username: 'otro_comunidad' })).toBe(true);
    const names = await read('14');
    expect(names.editable).toBe('otro_comunidad');
    expect(names.active[0]).toBe('otro_comunidad');
    expect(names.active.filter(name => name === 'otro_comunidad')).toHaveLength(1);
    // El secundario no se toca: `channels.updateUsername` mueve el principal y nada más.
    expect(names.active).toContain('wrgram_comunidad');
  });

  it('un chat que no tenía enlace lo gana, y la lectura lo enseña como activo', async () => {
    expect(await ask('chat.username.set', { id: '24', username: 'wrgram_colabora' })).toBe(true);
    expect(await read('24')).toEqual({ editable: 'wrgram_colabora', active: ['wrgram_colabora'] });
    expect(row('24')).toBe('wrgram_colabora');
  });

  it('lo que el puente rechaza aquí también lo rechaza la caja de la pantalla', () => {
    // `openChatUsername` quita la `@` antes de llamar; por eso el puente puede ser estricto sin más.
    expect(app).toContain("const username=raw.trim().replace(/^@/,'')");
    expect(app).toContain("maximum={32}");
  });
});
