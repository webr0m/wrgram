import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopSessions.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopAccountSessions.cs');
const profileRules = text('../../desktop/src/WRGram.Desktop/DesktopAccountProfile.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const contract = text('./contract.ts');
const bridge = text('./bridge.ts');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

const lines = java.split('\n');

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

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** La última línea de Android que cita el bloque de documentación de una constante. */
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

/** Las ocho claves del DTO, en el orden en que aparecen en una de las tres capas (línea medida: 1787). */
const ANDROID_KEYS = [...javaLine(1810).matchAll(/"([a-zA-Z]+)",/g)].map(match => match[1]);

describe('ronda AV · las sesiones de la cuenta, cruzadas con las tres capas', () => {
  it('las dos frases que la persona lee están letra por letra donde las dice Android', () => {
    // `NotRead` es el `answer.fail` del `accountSessions`; `NoDevice` es el respaldo con el que la misma línea
    // titleda una fila sin modelo. Copiadas, no parafraseadas: son la pantalla, no un comentario.
    expect(javaLine(cited('NotRead'))).toContain('answer.fail("No se pudieron consultar las sesiones.")');
    expect(csSentence('NotRead')).toBe('No se pudieron consultar las sesiones.');
    expect(javaLine(cited('NoDevice'))).toContain('"Dispositivo"');
    expect(csSentence('NoDevice')).toBe('Dispositivo');
  });

  it('la frase del identificador malo es la guarda de Android, dicha en español', () => {
    // Medido en el archivo de hoy: la guarda vive en la línea 59. El `envelope` ocupa la 58 desde que la fila
    // `account.phone.change`/`check`/`resend` de A02 abrió sitio delante, del mismo modo que antes se lo abrieron
    // `message.readDate`/`message.viewers` en CT y, más atrás, `calls.list` y `message.edit.media`.
    const idLine = policy.split('\n')[58] ?? '';
    expect(idLine).toContain('static long id(JSONObject params,String key)');
    expect(idLine).toContain('throw new IllegalArgumentException("Invalid identifier")');
    // Como en AT y en AU: un código de biblioteca en inglés no explica qué arreglar.
    expect(csSentence('BadId')).not.toContain('Invalid identifier');
    expect(csSentence('BadId')).toBe('El identificador de la sesión no es un identificador válido.');
    expect(preview).toContain(`badId: '${csSentence('BadId')}'`);
  });

  it('el patrón de identificador es el mismo en las tres capas y está anclado como en Java', () => {
    const pattern = '-?(0|[1-9][0-9]{0,18})';
    expect(policy).toContain(`matches("${pattern}")`);
    expect(rules).toContain(`@"\\A${pattern}\\z"`);
    // El `$` de .NET deja pasar un salto de línea final y `matches` de Java no; la lección la dejó escrita la AT.
    expect(rules).toContain('\\A');
    expect(rules).toContain('\\z');
    expect(preview).toContain(`const SESSION_ID = /^${pattern}$/;`);
  });

  it('el DTO tiene las ocho claves de Android, en el mismo orden, en las tres capas', () => {
    expect(ANDROID_KEYS).toEqual(['id', 'current', 'device', 'platform', 'version', 'location', 'ip', 'lastActive']);
    const keys = [...csBody('SessionsAsync').matchAll(/^\s{16}([a-zA-Z]+) = /gm)].map(match => match[1]);
    expect(keys).toEqual(ANDROID_KEYS);
    expect(contract).toContain('export interface AccountSession { id:string;current:boolean;device:string;platform:string;version:string;location:string;ip:string;lastActive:number }');
  });

  it('las cuatro traducciones que TDLib no necesita viven en la clase pura', () => {
    // Que el cable las llame y no las reimprima es lo que hace revisable la diferencia de protocolo.
    expect(cable).toContain('DesktopSessions.Device(session.device_model)');
    expect(cable).toContain('DesktopSessions.Version(session.app_name, session.app_version)');
    expect(cable).toContain('DesktopSessions.Location(session.country, session.region)');
    expect(cable).toContain('(session.flags & TL.Authorization.Flags.current) != 0');
    expect(rules).toContain('name + " " + (version ?? "")');
    expect(rules).toContain('place + ", " + nation');
  });

  it('el espejo pinta las tres filas que ejercitan las tres traducciones', () => {
    const rows = preview.slice(at('let previewSessions', preview), at('const SESSION_REFUSALS = { badId', preview));
    expect(count("  { id: '", rows)).toBe(3);
    // Fila actual, fila sin `device_model` (el respaldo) y fila sin `app_version` ni procedencia.
    expect(rows).toContain('current: true');
    expect(rows).toContain("device: 'Dispositivo'");
    expect(rows).toContain("version: 'WRGram '");
    expect(rows).toContain("location: ''");
    // La fila actual se rellena según el aparato desde el que se mira el andamio.
    expect(rows).toContain("desktop: { device: 'WRGram Desktop', platform: 'Windows 11' }");
    expect(rows).toContain("android: { device: 'POCO X5 Pro', platform: 'Android 13' }");
  });

  it('las dos órdenes tienen brazo, manejador y espejo', () => {
    for (const [method, name, withArgs] of [
      ['account.sessions', 'SessionsAsync', ''], ['account.session.revoke', 'RevokeSessionAsync', 'args'],
    ] as const) {
      expect(count(`"${method}" => await ${name}(${withArgs}),`, service)).toBe(1);
      expect(count(`private async Task<object?> ${name}(`, cable)).toBe(1);
      expect(count(`method === '${method}'`, preview)).toBe(1);
      expect(java).toContain(`case "${method}":`);
      expect(policy).toContain(`"${method}"`);
    }
  });

  it('el guardaje del cierre sigue el orden del case de Android', () => {
    // `requireAccount(); long id=BridgePolicy.id(p,"id"); perform(...)` —sesión, forma, y recién entonces la
    // escritura. Cambiar el orden es que una llamada sin sesión montada reciba un mensaje de formato.
    const body = csBody('RevokeSessionAsync');
    expect(body.indexOf('CollectionClient()')).toBeLessThan(body.indexOf('Raw(args, "id")'));
    expect(body.indexOf('DesktopSessions.ValidId(raw)')).toBeLessThan(body.indexOf('Account_ResetAuthorization'));
    expect(body).toContain('throw new BridgeException(DesktopSessions.BadId)');
    expect(body).toContain('Account_ResetAuthorization(DesktopSessions.HashOf(raw))');
  });

  it('la lectura no guarda la lista: el hash solo vale hasta la siguiente lectura', () => {
    const body = csBody('SessionsAsync');
    expect(body).toContain('await client.Account_GetAuthorizations()');
    expect(body).toContain('page.authorizations ?? throw new BridgeException(DesktopSessions.NotRead)');
    expect(body).toContain('foreach (var session in sessions)');
    // Sin caché en el servicio: una lista guardada devolvería identificadores ya muertos, y en Windows el
    // identificador es un `hash` de la sesión viva, no un número que Telegram conserve para siempre.
    expect(service).not.toContain('_sessions');
    expect(cable).not.toContain('_state.');
  });

  it('la negativa del menú de cuenta se fue con la ronda', () => {
    expect(service).not.toContain('NoSessions');
    expect(profileRules).not.toContain('NoSessions');
    expect(app).not.toContain('Las sesiones todavía no se gestionan en Windows');
    expect(app).toContain('<MenuItem icon={<ShieldCheck/>} label="Administrar sesiones" onClick={openSessions}/>');
  });

  it('la pantalla ofrece la lista en las dos plataformas y solo cierra las filas ajenas', () => {
    expect(app).toContain("void run<AccountSession[]>('account.sessions')");
    expect(app).toContain('Consultando las sesiones de Telegram…');
    expect(app).toContain('{items.map(item=><div className="session-item" key={item.id}>');
    expect(app).toContain("{[item.version,item.platform,item.location].filter(Boolean).join(' · ')}");
    expect(app).toContain('{item.ip&&<small>IP: {item.ip}</small>}');
    expect(app).toContain("!item.current&&<button className=\"text-button\"");
    expect(app).toContain("void run('account.session.revoke',{id:item.id}).then(result=>result!==undefined&&openSessions())");
  });

  it('ninguna de las dos espera a una persona con un diálogo nativo abierto', () => {
    // La lista se lee y el cierre se confirma en la propia interfaz, como en Android: no hay `Dialogs` ni selector
    // del sistema que deje la petición en vuelo, así que el plazo corto de siempre es el correcto.
    expect(bridge).not.toContain("'account.sessions'");
    expect(bridge).not.toContain("'account.session.revoke'");
  });

  it('las citas de Android en la regla pura y en el cable dicen eso mismo en la línea citada', () => {
    expect(javaLine(551)).toContain('case "account.sessions":accountSessions(a);break;');
    expect(javaLine(569)).toContain('case "account.session.revoke"');
    expect(javaLine(569)).toContain('BridgePolicy.id(p,"id")');
    expect(javaLine(569)).toContain('new TdApi.TerminateSession(id)');
    expect(javaLine(1810)).toContain('new TdApi.GetActiveSessions()');
    for (const citation of [...cable.matchAll(/NativeBridge\.java:(\d+)/g)].map(match => Number(match[1]))) {
      expect(lines[citation - 1]).toBeTruthy();
    }
  });
});

type Session = { id: string; current: boolean; device: string; platform: string; version: string; location: string; ip: string; lastActive: number };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AV · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  });

  const sessions = async () => (await call('account.sessions')) as Session[];
  const revoke = async (id?: unknown) => call('account.session.revoke', { id } as Record<string, unknown>).catch((caught: Error) => caught.message);

  it('leer sesiones trae las tres filas con las claves que la pantalla consume', async () => {
    const rows = await sessions();
    expect(rows).toHaveLength(3);
    expect(rows[0].current).toBe(true);
    expect(rows[0].device).toBe('WRGram Desktop');
    expect(rows[0].location).toBe('Madrid, España');
    expect(rows[1].device).toBe('Dispositivo');
    expect(rows[2].version).toBe('WRGram ');
    expect(rows[2].location).toBe('');
    expect(rows[2].ip).toBe('');
    expect(rows.filter(row => row.current)).toHaveLength(1);
    for (const row of rows) expect(typeof row.lastActive).toBe('number');
  });

  it('cerrar una sesión remota la quita de la lista que la pantalla vuelve a leer', async () => {
    const gone = await revoke('7400000000000000002');
    expect(gone).toBe(true);
    const rows = await sessions();
    expect(rows).toHaveLength(2);
    expect(rows.some(row => row.id === '7400000000000000002')).toBe(false);
  });

  it('el identificador con forma inválida se niega con la frase del puente', async () => {
    const phrase = 'El identificador de la sesión no es un identificador válido.';
    for (const bad of [undefined, '', 'abc', '007', '1_2', '12 34', '1'.repeat(20), '-']) {
      expect(await revoke(bad)).toBe(phrase);
    }
    expect(await sessions()).toHaveLength(3);
  });

  it('un identificador de entero sesenta y cuatro desborda y se niega como en C#', async () => {
    // El patrón de Java acepta diecinueve nueves; `long.TryParse` no, y la respuesta es la misma frase propia,
    // no el texto de una excepción de la máquina.
    expect(await revoke('9'.repeat(19))).toBe('El identificador de la sesión no es un identificador válido.');
    expect(await revoke('7400000000000000001')).not.toBe('El identificador de la sesión no es un identificador válido.');
  });

  it('cerrar una fila que no está no inventa ni borra nada', async () => {
    expect(await revoke('7399999999999999999')).toBe(true);
    expect(await sessions()).toHaveLength(3);
  });

  it('en Android la guarda de forma no la pone el espejo, y la fila actual es la del teléfono', async () => {
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'android', ready: true });
    const android = designRequest as DesignCall;
    const rows = (await android('account.sessions')) as Session[];
    // Ver lo contrario en la pantalla del teléfono era costumbre falsa: «WRGram Desktop · Este dispositivo» es la
    // fila que produce Windows, no la que produce un aparato con TDLib.
    expect(rows[0].current).toBe(true);
    expect(rows[0].device).toBe('POCO X5 Pro');
    expect(rows[0].platform).toBe('Android 13');
    // La forma la comprueba `BridgePolicy.id` (`BridgePolicy.java:59`) dentro del puente, con su frase en inglés de
    // biblioteca; el andamio no emula TDLib, así que aquí la orden pasa y la fila se busca igual.
    expect(await android('account.session.revoke', { id: '9'.repeat(20) })).toBe(true);
    expect((await android('account.sessions')) as Session[]).toHaveLength(3);
  });
});
