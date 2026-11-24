import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AUTO_DELETE_DAY, AUTO_DELETE_MAX_DAYS, AUTO_DELETE_REFUSALS, AUTO_DELETE_ACCEPT, AUTO_DELETE_NEW_CHATS,
  autoDeleteBody, autoDeleteTitle, autoDeleteProblem, canChangeAutoDelete,
} from './autoDelete';

/**
 * La ronda BN conecta el borrado automático de Windows. Lo que esta prueba vigila es lo que esa conexión promete:
 * que las nueve negaciones de las cuatro órdenes son las de Android —carácter a carácter, en su línea medida—, que el
 * orden de guardas del cable es el de `autoDeleteGet` y `autoDeleteSet` y no otro, que cada frase vive una sola vez
 * por capa, que el andamio de diseño dice esas frases en lugar de inventarse unas propias, y que la pantalla abre el
 * ajuste por la misma puerta en las dos capas. Las seis pruebas del final no leen texto: arrancan el módulo real y
 * llaman, que es la única forma de saber si el andamio enseña lo que el puente contestaría.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const safety = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AccountSafetyPolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopAutoDelete.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopAutoDeleteFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const settings = text('./SettingsPage.tsx');
const panel = text('./AutoDeleteSettings.tsx');
const preview = text('./preview.ts');
const mirror = text('./autoDelete.ts');
const scope = text('./desktopScope.ts');
const transport = text('./bridge.ts');
const contract = text('./contract.ts');

const lines = java.split('\n');
const safetyLines = safety.split('\n');

/** Una línea del puente, contada desde 1. Sin aguja no hay prueba: se falla. */
function javaLine(number: number): string {
  const row = lines[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return row;
}

/** Una línea de la clase de reglas de Android. */
function safetyLine(number: number): string {
  const row = safetyLines[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de AccountSafetyPolicy`);
  return row;
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

/** El cuerpo de un método del cable, cortado por el siguiente bloque de documento. */
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

/** La rama de escritorio del menú de conversación, cortada antes de la de Android. */
function desktopSheet(): string {
  const start = app.indexOf('function chatMenu(chat:Chat){');
  const end = app.indexOf('const action=(method:string,value:boolean)', start);
  if (start < 0 || end < 0) throw new Error('Falta la hoja de opciones de escritorio');
  return app.slice(start, end);
}

/** El bloque del andamio que modela el borrado automático: del fixture a su última función. */
function scaffoldBlock(): string {
  const start = preview.indexOf('const autoDeleteFixtures');
  const end = preview.indexOf('Las tablas de permisos predeterminados', start);
  if (start < 0 || end < 0) throw new Error('Falta el bloque de borrado automático del andamio');
  return preview.slice(start, end);
}

/** El método de Android que corresponde, cortado por el siguiente. */
function javaMethod(name: string, next: string): string {
  const start = java.indexOf(`private void ${name}(`);
  const end = java.indexOf(`private void ${next}(`, start);
  if (start < 0 || end < 0) throw new Error(`Falta ${name} en NativeBridge`);
  return java.slice(start, end);
}

const READ = body('private async Task<object?> AutoDeleteReadAsync', cable);
const WRITE = body('private async Task<object?> AutoDeleteWriteAsync', cable);
const STATE = body('private async Task<(int Seconds, bool CanChange)> AutoDeleteStateAsync', cable);
/** Los dos modos de `autoDeleteSet` tienen sus propias guardas, y cada una se mide por separado. */
const WRITE_DEFAULT = WRITE.slice(0, WRITE.indexOf('var entry = RequireEntry'));
const WRITE_CHAT = WRITE.slice(WRITE.indexOf('var entry = RequireEntry'));

/** Las claves del espejo TS con su litera de Android: la línea que la dice y la constante C# que la copia. */
const PHRASES: [keyof typeof AUTO_DELETE_REFUSALS, string, number, string][] = [
  ['wrongAccount', 'AccountSafetyPolicy', 11, 'WrongAccount'],
  ['badDuration', 'AccountSafetyPolicy', 15, 'BadDuration'],
  ['outOfRange', 'AccountSafetyPolicy', 17, 'OutOfRange'],
  ['notAllowedHere', 'NativeBridge', 1414, 'NotAllowedHere'],
  ['noRight', 'NativeBridge', 1417, 'NoRight'],
  ['defaultChanged', 'NativeBridge', 1403, 'DefaultChanged'],
  ['changed', 'NativeBridge', 1425, 'Changed'],
  ['changedAccount', 'NativeBridge', 1436, 'ChangedAccount'],
];

describe('ronda BN · las tres capas dicen lo mismo del borrado automático', () => {
  it('las cuatro claves están en el puente, en el despacho de Android y en el de Windows', () => {
    expect(safetyLine(10)).toContain('static void owner(JSONObject params,long selfId)');
    expect(javaLine(562)).toContain('case "privacy.autoDelete":autoDeleteGet(p,a,false);break;');
    expect(javaLine(563)).toContain('case "chat.autoDelete":autoDeleteGet(p,a,true);break;');
    expect(javaLine(564)).toContain('case "privacy.autoDelete.set":autoDeleteSet(p,a,false);break;');
    expect(javaLine(565)).toContain('case "chat.autoDelete.set":autoDeleteSet(p,a,true);break;');
    for (const key of ['privacy.autoDelete', 'privacy.autoDelete.set', 'chat.autoDelete', 'chat.autoDelete.set']) {
      expect(policy.split('\n')[43], `BridgePolicy.java:44`).toContain(`"${key}"`);
      expect(service).toContain(`"${key}" => await AutoDelete${key.endsWith('.set') ? 'Write' : 'Read'}Async(args, ${key.startsWith('chat.') ? 'true' : 'false'}),`);
    }
    // Delante del rechazo genérico, o las cuatro seguirían contestando la frase del beta con brazo escrito.
    expect(service.indexOf('"privacy.autoDelete" =>')).toBeLessThan(service.indexOf('_ => throw new BridgeException'));
  });

  it('ocho de las nueve frases son literales de Android, copiados carácter a carácter', () => {
    for (const [key, file, at, constant] of PHRASES) {
      const row = file === 'NativeBridge' ? javaLine(at) : safetyLine(at);
      expect(says(row, AUTO_DELETE_REFUSALS[key]), `${file}.java:${at}`).toBe(true);
      expect(csSentence(constant)).toBe(AUTO_DELETE_REFUSALS[key]);
      expect(mirror).toContain(`${key}: '${AUTO_DELETE_REFUSALS[key]}',`);
      // Y en el cable no se vuelven a escribir: el cable llama a la constante.
      expect(count(`"${AUTO_DELETE_REFUSALS[key]}"`, cable)).toBe(0);
    }
  });

  it('la novena es de este host, no una copia: el temporizador que no vino', () => {
    expect(java).not.toContain(AUTO_DELETE_REFUSALS.unreadable);
    expect(count(AUTO_DELETE_REFUSALS.unreadable, rules)).toBe(1);
    expect(count(AUTO_DELETE_REFUSALS.unreadable, mirror)).toBe(1);
    // Sale de los dos silencios medidos: la lectura llena que no trajo ficha y la que no trajo `ChatFullBase`.
    expect(STATE).toContain('answer.full_user is null) throw new BridgeException(DesktopAutoDelete.Unreadable)');
    expect(STATE).toContain('DesktopAutoDelete.Period(page.full_chat) ?? throw new BridgeException(DesktopAutoDelete.Unreadable)');
    // Y no es la frase de la ronda AW: aquella habla de la descripción, esta del estado de la conversación.
    expect(csSentence('Unreadable', text('../../desktop/src/WRGram.Desktop/DesktopCommunityInfo.cs')))
      .not.toBe(AUTO_DELETE_REFUSALS.unreadable);
    expect(mirror).not.toContain(csSentence('Unreadable', text('../../desktop/src/WRGram.Desktop/DesktopCommunityInfo.cs')));
  });

  it('la duración se mide en días completos, con la fórmula de Android escrita como fórmula', () => {
    expect(safetyLine(17)).toContain('seconds<0||seconds>365L*86400||seconds%86400!=0');
    expect(rules).toContain('value < 0 || value > (long)MaxDays * Day || value % Day != 0');
    expect(rules).toContain('public const int Day = 86400');
    expect(rules).toContain('public const int MaxDays = 365');
    expect(AUTO_DELETE_DAY).toBe(86400);
    expect(AUTO_DELETE_MAX_DAYS).toBe(365);
    // El panel ya no escribe el paso ni el techo a mano: los llama en el espejo, que es lo que prueba el cruce.
    expect(panel).toContain('count>=0&&count<=AUTO_DELETE_MAX_DAYS');
    expect(panel).toContain('load(count*AUTO_DELETE_DAY)');
    expect(count('86400', panel)).toBe(0);
    expect(count('365', panel)).toBe(0);
    expect(count('86400', mirror)).toBe(1);
    expect(count('= 86400', rules)).toBe(1);
    expect(count('AUTO_DELETE_DAY', mirror)).toBe(4);
    // Dentro del bloque nuevo del andamio no hay un solo segundo escrito a mano: los tres vienen de la constante.
    expect(count('86400', scaffoldBlock())).toBe(0);
    expect(count('AUTO_DELETE_DAY', scaffoldBlock())).toBe(3);
  });

  it('el 777000 es el de Android, y la regla de los dos chats sin temporizador es la suya', () => {
    expect(javaLine(1391)).toContain('userId!=session.selfId&&userId!=777000');
    expect(javaLine(1414)).toContain('if(id==session.selfId||id==777000)');
    expect(rules).toContain('public const long TelegramNotices = 777000');
    expect(rules).toContain('userId != selfId && userId != TelegramNotices');
    expect(canChangeAutoDelete(777000, 1)).toBe(false);
    expect(canChangeAutoDelete(1, 1)).toBe(false);
    expect(canChangeAutoDelete(11, 1)).toBe(true);
    // En una comunidad el derecho no se compara: se lee, y se lee en la misma casa que lo lee el rename.
    expect(STATE).toContain('DesktopCommunityInfo.CanChange(Renewed(page, entry)');
    expect(count('canChangeInfo', cable)).toBe(0);
  });

  it('el cuadro de confirmar es el de `confirmAutoDelete`, con sus cuatro rótulos y su recorte', () => {
    expect(javaLine(1433)).toContain('"Borrado automático · "+NativeSnapshot.limit(title,100)');
    expect(javaLine(1434)).toContain('setNegativeButton("Cancelar"');
    expect(javaLine(1435)).toContain('setPositiveButton("Aplicar en Telegram"');
    expect(javaLine(1438)).toContain('setOnCancelListener(dialog->answer.ok(false))');
    expect(csSentence('Accept')).toBe(AUTO_DELETE_ACCEPT);
    expect(mirror).toContain(`AUTO_DELETE_ACCEPT = '${AUTO_DELETE_ACCEPT}'`);
    expect(rules).toContain('DesktopContact.Limit(title, 100)');
    expect(autoDeleteTitle('x'.repeat(105))).toBe('Borrado automático · ' + 'x'.repeat(100) + '…');
    // El recorte no se vuelve a implementar: la casa que lo tiene se llama desde las dos orillas nuevas.
    expect(count('DesktopContact.Limit(title, 100)', rules)).toBe(1);
    expect(count('DesktopContact.Limit', cable)).toBe(0);
    expect(count('Substring', rules + cable)).toBe(0);
    expect(count('Borrado automático · ', rules)).toBe(1);
    expect(count('Borrado automático · ', cable)).toBe(0);
    // Las dos frases del cuerpo son las de `:1406`, en los dos sentidos y con la división por el paso.
    expect(javaLine(1432)).toContain(`"${autoDeleteBody(0)}"`);
    expect(javaLine(1432)).toContain('después de \"+(seconds/86400)+\" días. No es una limpieza del historial existente.');
    expect(rules).toContain(`"${autoDeleteBody(0)}"`);
    expect(rules).toContain('después de " + (seconds / Day) +');
    expect(autoDeleteBody(7 * AUTO_DELETE_DAY)).toBe(autoDeleteBody(7 * 86400));
    expect(autoDeleteBody(0)).toContain('no recupera mensajes ya borrados');
    // La ventana es la WPF que ya levantan la foto y el rename: ninguna ronda nueva abre su propia ventana.
    expect(cable).toContain('ConfirmPhoto(title, DesktopAutoDelete.Body(seconds), DesktopAutoDelete.Accept, null)');
    expect(count('new Window', cable)).toBe(0);
  });

  it('el orden de guardas del cable es el de Java, medido por posición', () => {
    ordered(READ,
      'RequireAutoDeleteAccount(args, client)',
      'if (!chatMode) return DesktopAutoDelete.Dto((await client.Messages_GetDefaultHistoryTTL()).period, true)',
      'await AutoDeleteStateAsync(client, RequireEntry(Str(args, "id")))',
      'return DesktopAutoDelete.Dto(seconds, canChange)');
    // Las mismas tres posiciones en Android: cuenta, modo y solo entonces la fila.
    ordered(javaMethod('autoDeleteGet', 'autoDeleteSet'),
      'AccountSafetyPolicy.owner(params,session.selfId)',
      'if(!chatMode)',
      'TdApi.Chat selected=target(params)');
    ordered(WRITE,
      'RequireAutoDeleteAccount(args, client)',
      'var seconds = DesktopAutoDelete.Seconds(args)',
      'RequireEntry(Str(args, "id"))',
      'await AutoDeleteStateAsync(client, entry)',
      'if (!canChange)',
      'ConfirmAutoDelete(DesktopAutoDelete.DialogTitle(entry.Title), seconds)');
    // Las cuatro guardas que el modo por conversación comparte con el predeterminado, medidas dentro de su rama:
    // la segunda mirada a la cuenta, la segunda lectura, la escritura y la lectura que responde.
    ordered(WRITE_CHAT,
      'if (client.User?.id != owner) throw new BridgeException(DesktopAutoDelete.ChangedAccount)',
      'if (now != previous) throw new BridgeException(DesktopAutoDelete.Changed)',
      'await client.Messages_SetHistoryTTL(entry.Input, seconds)',
      'return DesktopAutoDelete.Dto(applied, true)');
    // El orden copiado, medido en el original: cuenta, duración, fila y derecho antes de la ventana, en las dos ramas.
    ordered(javaMethod('autoDeleteSet', 'confirmChatAutoDelete'),
      'AccountSafetyPolicy.owner(params,session.selfId)',
      'int seconds=AccountSafetyPolicy.autoDeleteSeconds(params)',
      'TdApi.Chat selected=target(params)',
      'if(id==session.selfId||id==777000)',
      'confirmChatAutoDelete(chat,seconds,answer)');
    // La rama de comunidad: primero el derecho (`:1391`) y después la ventana (`:1392`), como arriba.
    expect(javaLine(1417)).toContain('grantedAdminRight(actor,"canChangeInfo")');
    expect(javaLine(1418)).toContain('confirmChatAutoDelete(chat,seconds,answer)');
    // La duración delante de la forma: si no, un «400 días» escrito en un chat ajeno oiría el permiso.
    expect(WRITE.indexOf('Seconds(args)')).toBeLessThan(WRITE.indexOf('RequireEntry'));
    // El derecho delante de la ventana: un cuadro que no se puede cumplir es peor que un aviso (norma BI).
    expect(WRITE_CHAT.indexOf('if (!canChange)')).toBeLessThan(WRITE_CHAT.indexOf('ConfirmAutoDelete'));
    // Y la ventana delante de la escritura, como el botón positivo de `:1409`.
    expect(WRITE_CHAT.indexOf('ConfirmAutoDelete')).toBeLessThan(WRITE_CHAT.indexOf('SetHistoryTTL'));
    // El modo predeterminado tiene su propia pareja de guardas, en el mismo orden relativo.
    expect(WRITE.indexOf('var entry = RequireEntry')).toBeGreaterThan(0);
    ordered(WRITE_DEFAULT,
      'var before = await client.Messages_GetDefaultHistoryTTL()',
      'ConfirmAutoDelete(DesktopAutoDelete.DialogTitle(DesktopAutoDelete.NewChats), seconds)',
      'if (client.User?.id != owner) throw new BridgeException(DesktopAutoDelete.ChangedAccount)',
      'if (current.period != before.period) throw new BridgeException(DesktopAutoDelete.DefaultChanged)',
      'await client.Messages_SetDefaultHistoryTTL(seconds)');
    // Después de escribir, las dos capas devuelven lo que Telegram guarda y `canChange:true` fijo.
    expect(javaLine(1427)).toContain('answer.ok(object("seconds",updated.messageAutoDeleteTime,"canChange",true))');
    expect(WRITE).toContain('var (applied, _) = await AutoDeleteStateAsync(client, entry)');
  });

  it('ninguna frase de la familia se dice dos veces en la misma capa', () => {
    const keys = Object.keys(AUTO_DELETE_REFUSALS) as (keyof typeof AUTO_DELETE_REFUSALS)[];
    expect(keys).toHaveLength(9);
    // Nueve frases distintas: si dos se igualaran, la pantalla no sabría cuál de las dos guardas habló.
    expect(new Set(Object.values(AUTO_DELETE_REFUSALS)).size).toBe(9);
    for (const key of keys) {
      const phrase = AUTO_DELETE_REFUSALS[key];
      // En la clase de reglas la frase puede salir citada en el documento XML; lo que no puede es asignarse dos veces.
      expect(count(`= "${phrase}"`, rules), `rules.${key}`).toBe(1);
      expect(count(phrase, mirror), `mirror.${key}`).toBe(1);
      // Ni el cable ni el andamio las vuelven a escribir: los dos llaman a su casa.
      expect(count(phrase, cable), `cable.${key}`).toBe(0);
      expect(count(phrase, preview), `preview.${key}`).toBe(0);
    }
    expect(count(AUTO_DELETE_NEW_CHATS, rules)).toBe(1);
    expect(count(AUTO_DELETE_NEW_CHATS, mirror)).toBe(1);
    expect(count(AUTO_DELETE_NEW_CHATS, preview)).toBe(0);
    // El andamio llama al espejo; no copia ni una literal de negación.
    expect(preview).toContain(`from './autoDelete'`);
    expect(count('AUTO_DELETE_REFUSALS.', preview)).toBe(4);
  });

  it('la familia cruzó de pendiente a disponible y el andamio dejó de negarla', () => {
    const claim = `{ label: 'autodestrucción por chat y predeterminada', methods: ['chat.autoDelete', 'chat.autoDelete.set', 'privacy.autoDelete', 'privacy.autoDelete.set'] },`;
    expect(count(claim, scope)).toBe(1);
    expect(scope.indexOf(claim)).toBeGreaterThan(scope.indexOf('export const DESKTOP_AVAILABLE'));
    expect(scope.indexOf(claim)).toBeLessThan(scope.indexOf('export const DESKTOP_PENDING'));
    // El aviso se compone solo desde las listas (ronda BJ) y la puerta del andamio se deriva de la pendiente (BK).
    const pending = scope.slice(scope.indexOf('export const DESKTOP_PENDING'));
    expect(pending.includes('autoDelete')).toBe(false);
    for (const key of ['privacy.autoDelete', 'privacy.autoDelete.set', 'chat.autoDelete', 'chat.autoDelete.set']) {
      expect(scope).toContain(`'${key}'`);
    }
    // Las dos escribientes abren una ventana nativa: son de las que esperan a la persona.
    expect(transport).toContain("'privacy.autoDelete.set', 'chat.autoDelete.set',");
    expect(contract).toContain('export interface AutoDeleteSettings { seconds:number; canChange:boolean }');
  });

  it('la pantalla abre el ajuste por la misma puerta en las dos capas', () => {
    const door = `{chat.type!=='secret'&&<MenuItem icon={<Clock/>} label="Borrado automático" onClick={()=>setDialog({title:'Borrado automático · '+chat.title,body:<AutoDeleteSettings key={state.selfId+':'+chat.id} chatId={chat.id} run={run} ready={state.ready}/>})}/>`;
    expect(desktopSheet()).toContain(door);
    expect(app).toContain(door);
    expect(count(door, app)).toBe(2);
    // La sección de Ajustes es una constante compartida: una frase, una casa.
    expect(count('Borrado automático en chats nuevos', settings)).toBe(1);
    expect(settings).toContain('{visibilitySection}{blockedSection}{autoDeleteSection}');
    // La promesa del panel ya no atribuye el cuadro a una sola capa: los dos hosts lo levantan.
    expect(panel).toContain('Se pedirá confirmar antes de aplicar el cambio.');
    expect(panel).not.toContain('Android pedirá confirmar');
    expect(text('./CommunityInfoPanel.tsx')).not.toContain('Android pedirá confirmar');
  });

  it('las dos frases de los chats secretos son de Android y el andamio no las alcanza', () => {
    const secret = ['El temporizador de chats secretos requiere un flujo distinto.',
      'No se modifica la autodestrucción de chats secretos desde este ajuste.'];
    expect(says(javaLine(1387), secret[0])).toBe(true);
    expect(says(javaLine(1411), secret[1])).toBe(true);
    // MTProto no tiene la forma `ChatTypeSecret` que las dispara: se declaran fuera en vez de imitarse, y no se
    // escriben en ninguna de las capas nuevas.
    for (const phrase of secret) {
      expect(rules).not.toContain(phrase);
      expect(cable).not.toContain(phrase);
      expect(mirror).not.toContain(phrase);
      expect(preview).not.toContain(phrase);
    }
    expect(count('ChatTypeSecret', rules + cable)).toBe(0);
    // Y ninguna de las dos ramas de la pantalla las necesita: la puerta no se abre sobre un secreto.
    expect(count("chat.type!=='secret'&&<MenuItem icon={<Clock/>} label=\"Borrado automático\"", app)).toBe(2);
  });
});

type Answer = { seconds: number; canChange: boolean };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BN · medido con las manos en el andamio', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const scaffold = await import('./preview');
    const bridge = await import('./bridge');
    bridge.acceptState({ ...scaffold.fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = scaffold.designRequest as DesignCall;
  });

  const ask = async (method: string, params: Record<string, unknown> = {}) =>
    call(method, params).catch((caught: Error) => caught.message);
  const readChat = async (id: string) => await ask('chat.autoDelete', { id }) as Answer;
  const readDefault = async () => await ask('privacy.autoDelete') as Answer;

  it('el predeterminado se lee, se escribe y se vuelve a leer igual', async () => {
    expect(await readDefault()).toEqual({ seconds: 0, canChange: true });
    const seconds = 7 * AUTO_DELETE_DAY;
    expect(await ask('privacy.autoDelete.set', { seconds })).toEqual({ seconds, canChange: true });
    expect(await readDefault()).toEqual({ seconds, canChange: true });
    expect(await ask('privacy.autoDelete.set', { seconds: 0 })).toEqual({ seconds: 0, canChange: true });
    expect(await readDefault()).toEqual({ seconds: 0, canChange: true });
  });

  it('cada fila enseña el estado del puente que le toca', async () => {
    expect(await readChat('11')).toEqual({ seconds: 0, canChange: true });
    expect(await readChat('12')).toEqual({ seconds: AUTO_DELETE_DAY, canChange: true });
    expect(await readChat('14')).toEqual({ seconds: 7 * AUTO_DELETE_DAY, canChange: true });
    // La comunidad administrada por otra persona y «Mensajes guardados»: dos `canChange:false` de ramas distintas.
    expect(await readChat('18')).toEqual({ seconds: 30 * AUTO_DELETE_DAY, canChange: false });
    expect(await readChat('1')).toEqual({ seconds: 0, canChange: false });
  });

  it('escribir en una fila apagada oye la frase de su forma, y no escribe', async () => {
    expect(await ask('chat.autoDelete.set', { id: '18', seconds: AUTO_DELETE_DAY })).toBe(AUTO_DELETE_REFUSALS.noRight);
    expect(await ask('chat.autoDelete.set', { id: '1', seconds: AUTO_DELETE_DAY })).toBe(AUTO_DELETE_REFUSALS.notAllowedHere);
    expect(await readChat('18')).toEqual({ seconds: 30 * AUTO_DELETE_DAY, canChange: false });
    expect(await readChat('1')).toEqual({ seconds: 0, canChange: false });
    // Y el mismo testigo que apaga el temporizador apaga el rename: una marca, dos flujos.
    expect(await ask('chat.info.set', { id: '18', field: 'title', value: 'Otro nombre', previous: 'Ideas & café' }))
      .toBe('Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.');
  });

  it('la duración manda sobre la fila: primero la fórmula de Android, luego Telegram', async () => {
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: 366 * AUTO_DELETE_DAY })).toBe(AUTO_DELETE_REFUSALS.outOfRange);
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: 3600 })).toBe(AUTO_DELETE_REFUSALS.outOfRange);
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: -AUTO_DELETE_DAY })).toBe(AUTO_DELETE_REFUSALS.outOfRange);
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: 1.5 })).toBe(AUTO_DELETE_REFUSALS.badDuration);
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: '86400' })).toBe(AUTO_DELETE_REFUSALS.badDuration);
    expect(await ask('chat.autoDelete.set', { id: '999' })).toBe(AUTO_DELETE_REFUSALS.badDuration);
    // Con la duración bien formada es la fila la que habla, con la frase del puente de siempre.
    expect(await ask('chat.autoDelete.set', { id: '999', seconds: AUTO_DELETE_DAY }))
      .toBe('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
    expect(await autoDeleteProblem(366 * AUTO_DELETE_DAY)).toBe(AUTO_DELETE_REFUSALS.outOfRange);
  });

  it('escribir de verdad mueve el temporizador, y la lectura lo confirma', async () => {
    const seconds = 30 * AUTO_DELETE_DAY;
    expect(await ask('chat.autoDelete.set', { id: '11', seconds })).toEqual({ seconds, canChange: true });
    expect(await readChat('11')).toEqual({ seconds, canChange: true });
    expect(await ask('chat.autoDelete.set', { id: '12', seconds: 0 })).toEqual({ seconds: 0, canChange: true });
    expect(await readChat('12')).toEqual({ seconds: 0, canChange: true });
  });

  it('la cuenta que cambió corta las cuatro órdenes antes que nada', async () => {
    for (const [method, params] of [
      ['privacy.autoDelete', {}],
      ['privacy.autoDelete.set', { seconds: AUTO_DELETE_DAY }],
      ['chat.autoDelete', { id: '11' }],
      ['chat.autoDelete.set', { id: '11', seconds: AUTO_DELETE_DAY }],
    ] as [string, Record<string, unknown>][]) {
      expect(await ask(method, { ...params, accountId: '999' }), method).toBe(AUTO_DELETE_REFUSALS.wrongAccount);
    }
    // Y el rechazo no escribió nada: ni el predeterminado se movió.
    expect(await readDefault()).toEqual({ seconds: 0, canChange: true });
  });

  it('en escritorio ya no se niega la familia, y Android contesta igual', async () => {
    const beta = 'No disponible en escritorio (beta): chat.autoDelete';
    expect(await ask('chat.autoDelete', { id: '11' })).not.toBe(beta);
    vi.resetModules();
    const scaffold = await import('./preview');
    const bridge = await import('./bridge');
    bridge.acceptState({ ...scaffold.fixture, platform: 'android', ready: true });
    const android = scaffold.designRequest as DesignCall;
    expect(await android('chat.autoDelete', { id: '14' })).toEqual({ seconds: 7 * AUTO_DELETE_DAY, canChange: true });
    expect(await android('privacy.autoDelete.set', { seconds: AUTO_DELETE_DAY })).toEqual({ seconds: AUTO_DELETE_DAY, canChange: true });
  });
});
