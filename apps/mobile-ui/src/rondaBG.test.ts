import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const model = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/JoinRequests.java');
const snapshot = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopJoinRequests.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopJoinRequestsFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const sanctions = text('../../desktop/src/WRGram.Desktop/DesktopMemberSanctions.cs');
const app = text('./App.tsx');
const panel = text('./JoinRequestsPanel.tsx');
const shared = text('./joinRequestModel.ts');
const contract = text('./contract.ts');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');

const javaLines = java.split('\n');
const modelLines = model.split('\n');

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const bridgeLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const modelLine = (number: number) => line(modelLines, number, 'JoinRequests.java');

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** El entero que C# asigna a un techo, y sus dos equivalentes en las capas de Android. */
function csNumber(name: string): number {
  const match = new RegExp(`public const int ${name} = ([0-9_]+)`).exec(rules);
  if (!match) throw new Error(`Falta el techo ${name}`);
  return Number(match[1].replace(/_/g, ''));
}
function javaNumber(name: string): number {
  const match = new RegExp(`static final int ${name} = ([0-9_]+)`).exec(model);
  if (!match) throw new Error(`Falta el techo ${name} de JoinRequests`);
  return Number(match[1].replace(/_/g, ''));
}

/** Si la línea lleva esa frase escrita como literal entero. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);
const count = (needle: string, from: string) => from.split(needle).length - 1;

/** El número que Android pasa a `limit` en una línea concreta: el techo, medido donde se usa. */
function limitAt(row: string, call: string): number {
  const safe = call.replace(/[^A-Za-z0-9]/g, character => `\\${character}`);
  const match = new RegExp(`${safe}[^;]*?,\\s*([0-9]+)[);]`).exec(row);
  if (!match) throw new Error(`Falta ${call} con su techo`);
  return Number(match[1]);
}

/** El cuerpo de un método, cortado por el siguiente bloque de documento. */
function body(needle: string, from: string): string {
  const at = from.indexOf(needle);
  if (at < 0) throw new Error(`Falta ${needle}`);
  const rest = from.slice(at);
  const next = rest.indexOf('\n    /// <summary>', 1);
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

const READ = body('private async Task<object?> JoinRequestsAsync', cable);
const ANSWER = body('private async Task<object?> AnswerJoinRequestAsync', cable);

/** Las claves de una fila, en el orden en que se escriben. */
const keys = (from: string, pattern: RegExp) => [...from.matchAll(pattern)].map(found => found[1]);

/** Las seis frases del andamio, leídas de su tabla para no copiarlas aquí una vez más. */
function scaffoldSentence(key: string): string {
  const at = preview.indexOf('const JOIN_REFUSALS = {');
  if (at < 0) throw new Error('Falta la tabla JOIN_REFUSALS del andamio');
  const match = new RegExp(`  ${key}: '((?:[^'\\\\]|\\\\.)*)',`).exec(preview.slice(at, preview.indexOf('};', at)));
  if (!match) throw new Error(`Falta JOIN_REFUSALS.${key} en el andamio`);
  return match[1];
}

describe('ronda BG · las cuatro capas dicen lo mismo de la cola de ingreso', () => {
  it('el despacho de las dos órdenes está en las tres capas', () => {
    expect(bridgeLine(757)).toContain('case "chat.requests":joinRequests(p,a);break;');
    expect(bridgeLine(764)).toContain('case "chat.request.answer":answerJoinRequest(p,a);break;');
    expect(policy).toContain('static { METHODS.addAll(Arrays.asList("chat.requests","chat.request.answer")); }');
    for (const arm of [
      '"chat.requests" => await JoinRequestsAsync(args),',
      '"chat.request.answer" => await AnswerJoinRequestAsync(args),',
    ]) expect(service).toContain(arm);
    for (const dead of ['chat.requests" => throw', 'chat.request.answer" => throw'])
      expect(service).not.toContain(dead);
    // Responder espera a la persona porque abre un cuadro de confirmación: sin esto, el plazo corto lo abandona.
    expect(bridge).toContain("'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke', 'chat.request.answer',");
  });

  it('los cuatro techos son el mismo número en las dos capas', () => {
    expect(csNumber('PageSize')).toBe(javaNumber('PAGE'));
    expect(csNumber('BioShown')).toBe(limitAt(modelLine(27), 'limit(request.bio'));
    // El nombre y el título se recortan en el puente, no en la clase de reglas de Android.
    expect(csNumber('NameShown')).toBe(limitAt(bridgeLine(3588), 'NativeSnapshot.limit'));
    expect(csNumber('ChatShown')).toBe(limitAt(bridgeLine(3587), 'NativeSnapshot.limit'));
    expect(csNumber('NameShown')).toBe(80);
    expect(csNumber('ChatShown')).toBe(csNumber('NameShown'));
    // Y la función que recorta hace lo mismo en las dos capas: corte seco más puntos suspensivos.
    expect(snapshot).toContain('static String limit(String text,int size){return text.length()>size?text.substring(0,size)+"…":text;}');
  });

  it('cada frase vive una vez por capa, con la cadena de Java delante', () => {
    const measured: [string, string[], number][] = [
      ['Unsupported', ['3529', '3579'], 2],
      ['CursorGone', ['3533'], 1],
      ['NoRightReview', ['3539'], 1],
      ['SelfAnswer', ['3586'], 1],
      ['NoRightAnswer', ['3590'], 1],
      ['ChangedAccount', ['3596'], 1],
    ];
    for (const [name, places, occurrences] of measured) {
      const phrase = csSentence(name);
      for (const at of places) expect(says(bridgeLine(Number(at)), phrase), `${name} en :${at}`).toBe(true);
      expect(count(phrase, java), `${name} en Java`).toBe(occurrences);
      // El cable pide la constante: no repite la cadena.
      expect(count(phrase, cable), `${name} en el cable`).toBe(0);
      // El andamio no inventa copias: como mucho reproduce las veces que las dice el puente.
      expect(count(phrase, preview), `${name} en el andamio`).toBeLessThanOrEqual(occurrences);
    }
    // La negación del marcador la escribe `JoinRequests.offset` tres veces y no la pronuncia el puente.
    expect(count(csSentence('CursorIssue'), model)).toBe(3);
    expect(count(csSentence('CursorIssue'), java)).toBe(0);
    expect(count(csSentence('CursorIssue'), cable)).toBe(0);
    // Las dos causas de la forma estricta: Android las lanza en inglés y las reenvía tal cual (`:3583`), y Windows
    // las dice en español. No son cadenas de Java, pero tampoco son un invento: citan al centímetro su causa.
    for (const name of ['BadUserId', 'MissingApprove'] as const) {
      expect(count(csSentence(name), java)).toBe(0);
      expect(count(csSentence(name), cable), name).toBe(0);
    }
    expect(java).toContain('catch(Exception invalid){a.fail(invalid.getMessage());return;}');
    expect(java).toContain('throw new IllegalArgumentException("Missing permission: "+key)');
    expect(policy).toContain('throw new IllegalArgumentException("Invalid identifier")');
    expect(rules).toContain('«Invalid identifier»');
    expect(rules).toContain('«Missing permission: approve»');
    expect(cable).not.toContain('Missing permission: approve"');
  });

  it('los cuatro rótulos y los dos cuerpos del diálogo son los de Android', () => {
    expect(says(bridgeLine(3591), csSentence('ApproveTitle'))).toBe(true);
    expect(says(bridgeLine(3591), csSentence('RejectTitle'))).toBe(true);
    expect(says(bridgeLine(3595), csSentence('ApproveAccept'))).toBe(true);
    expect(says(bridgeLine(3595), csSentence('RejectAccept'))).toBe(true);
    expect(bridgeLine(3594)).toContain('setNegativeButton("Cancelar"');
    // Los dos cuerpos, con sus dos interpolaciones en el mismo orden: nombre y título, nunca al revés.
    expect(bridgeLine(3592)).toContain('"«"+name+"» entrará en «"+title+"» en cuanto Telegram lo confirme. Podrás retirarlo después desde Miembros."');
    expect(bridgeLine(3593)).toContain('"Se descartará la solicitud de «"+name+"» para «"+title+"». La persona podrá enviar otra si sigue teniendo un enlace válido."');
    expect(rules).toContain('"«" + name + "» entrará en «" + title + "» en cuanto Telegram lo confirme. Podrás retirarlo después desde Miembros.";');
    expect(rules).toContain('"Se descartará la solicitud de «" + name + "» para «" + title + "». La persona podrá enviar otra si sigue teniendo un enlace válido.";');
    // Un solo sitio decide cuál de los dos se dice, y el cable lo pregunta en lugar de escribirlo.
    expect(rules).toContain('public static string Title(bool approve) => approve ? ApproveTitle : RejectTitle;');
    expect(cable).toContain('ConfirmPhoto(DesktopJoinRequests.Title(approve), DesktopJoinRequests.Body(approve, name, title),');
    expect(cable).toContain('DesktopJoinRequests.Accept(approve), null)');
    expect(count('new Window', cable)).toBe(0);
    expect(count('MessageBox.Show', cable)).toBe(0);
  });

  it('la fila y la página salen con las mismas claves, en el mismo orden', () => {
    // Android parte la fila en dos pasos: `row` pone tres claves y `finishJoinPage` añade el nombre (`:3566`).
    const built = keys(model.slice(model.indexOf('static JSONObject row('), model.indexOf('static JSONObject page(')), /\.put\("([a-zA-Z]+)"/g);
    expect(built).toEqual(['userId', 'date', 'bio']);
    expect(bridgeLine(3568)).toContain('row.put("name",');
    const written = keys(rules.slice(rules.indexOf('new Entry('), rules.indexOf('public readonly record struct Entry')), /^ {16}([a-zA-Z]+)(?: = |,)/gm);
    expect(written).toEqual([...built, 'name']);
    // La página: `total` y `requests` siempre; `next` y `cursor` viajan también siempre, vacío cuando no hay más.
    expect(modelLine(33)).toContain('.put("total", Math.max(0, total)).put("requests", values)');
    for (const key of ['total = Math.Max(0L, total)', 'requests = rows.Select(row => row.Row).ToList()', 'next,'])
      expect(rules).toContain(key);
    expect(rules).toContain('cursor = next ? Token(rows[^1].UserId, rows[^1].Date) : ""');
    expect(modelLine(35)).toContain('boolean full = values.length() >= PAGE;');
    expect(rules).toContain('var next = rows.Count >= PageSize;');
    expect(modelLine(44)).toContain('return Long.toString(userId) + ":" + Integer.toString(date);');
    expect(rules).toContain('userId.ToString(CultureInfo.InvariantCulture) + ":" + date.ToString(CultureInfo.InvariantCulture);');
  });

  it('lo que la pantalla ofrece es lo que el puente acepta', () => {
    const sheet = desktopSheet();
    // La puerta del escritorio es la forma de `:3527`/`:3577`, más ancha que la de permisos: la cola también existe
    // en un grupo básico, y en MTProto vive en el `PeerChannel` o en el `PeerChat`.
    expect(sheet).toContain("{(chat.supergroup===true||chat.type==='group'||chat.type==='channel')&&<MenuItem icon={<UserPlus/>} label=\"Solicitudes de ingreso\" onClick={()=>{setDialog(undefined);setRequests(chat);}}/>}");
    expect(count('label="Solicitudes de ingreso"', app)).toBe(1);
    // La cifra del rótulo se queda en Android: `TL.Chat` y `TL.Channel` no publican ningún contador pendiente, así
    // que las dos puertas de Android (menú y panel lateral) la llevan y la de escritorio, no.
    expect(count('Solicitudes de ingreso (${active.requests})', app)).toBe(1);
    expect(count('Solicitudes de ingreso (${chat.requests})', app)).toBe(1);
    expect(sheet).not.toContain('chat.requests');
    expect(app).toContain('{requests&&<JoinRequestsPanel chat={requests} accountId={state.selfId} close={()=>setRequests(undefined)}/>}');
    expect(panel).toContain("request<JoinRequestPage>('chat.requests', marker ? { id: chat.id, cursor: marker } : { id: chat.id })");
    expect(panel).toContain("request<boolean>('chat.request.answer', { id: chat.id, userId: item.userId, approve, accountId })");
    // El panel deduplica por persona y fecha, y solo sigue un marcador que la propia página anunció.
    expect(shared).toContain('export function cursorFor(page: JoinRequestPage | undefined): string {');
    expect(shared).toContain('if (!page || page.next !== true) return \'\';');
    expect(shared).toContain('/^\\d+:\\d+$/.test(page.cursor)');
    expect(shared).toContain('export const keyOf = (request: JoinRequest) => `${request.userId}:${request.date}`;');
    expect(contract).toContain('export interface JoinRequestPage { total:number; requests:JoinRequest[]; cursor?:string; next:boolean }');
    // Retirada una fila, la cola se vuelve a pedir desde el principio: ningún marcador viejo sobrevive a la escritura.
    expect(line(panel.split('\n'), 65, 'JoinRequestsPanel.tsx')).toContain("await load('')");
  });

  it('los cortafuegos del cable están en el orden del puente', () => {
    ordered(READ,
      'var kind = DesktopMembership.Of(entry.Id);',
      'if (!DesktopJoinRequests.Supported(kind)) throw new BridgeException(DesktopJoinRequests.Unsupported);',
      'DesktopJoinRequests.CursorProblem(marker)',
      'if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopJoinRequests.NoRightReview);',
      'DesktopJoinRequests.Offset(marker)',
      'throw new BridgeException(DesktopJoinRequests.CursorGone);',
      'client.Messages_GetChatInviteImporters(',
      'DesktopJoinRequests.Page(rows, table.count)');
    expect(READ).toContain('DesktopJoinRequests.PageSize');
    // Responder: forma, cuenta pedida, identificador, decisión, la propia solicitud, permiso, ventana, hash y Telegram.
    ordered(ANSWER,
      'if (!DesktopJoinRequests.Supported(kind)) throw new BridgeException(DesktopJoinRequests.Unsupported);',
      'Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;',
      'DesktopJoinRequests.UserIdProblem(Raw(args, "userId"))',
      'var approve = ApproveValue(args);',
      'if (userId == 0 || userId == owner) throw new BridgeException(DesktopJoinRequests.SelfAnswer);',
      'if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopJoinRequests.NoRightAnswer);',
      'ConfirmPhoto(DesktopJoinRequests.Title(approve)',
      'var hash = TargetHash(userId);',
      'await client.Messages_HideChatJoinRequest(entry.Input, new InputUser(userId, hash), approve);');
    // La cuenta que cambió a mitad del viaje se comprueba en cada salto: dos en la lectura, tres en la respuesta,
    // la última después de escribir, que es la que Android pone dentro del botón positivo (`:3594`).
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);', READ)).toBe(2);
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);', ANSWER)).toBe(3);
    // La `approve` ausente o no booleana se niega antes de mirar a quién responde, igual que `requiredBool` (`:3582`).
    expect(count('throw new BridgeException(DesktopJoinRequests.MissingApprove);', cable)).toBe(2);
  });

  it('el cable reutiliza lo que ya estaba medido y no vuelve a escribirlo', () => {
    // El derecho de la cola es el mismo que el de los enlaces (NativeBridge.java:1863 lo lee para las dos cosas),
    // la cuenta propia es la de siempre y el hash es el de la ronda AZ: cero reglas nuevas de permisos.
    expect(cable).toContain('if (!await MayManageLinksAsync(client, entry, kind))');
    expect(cable).toContain('var hash = TargetHash(userId);');
    expect(cable).toContain('DesktopContact.Limit(');
    expect(cable).toContain('DesktopGroupMembers.UnknownPerson');
    expect(cable).toContain('MergePeers(table.users?.Values, null);');
    expect(count('ChannelParticipant', cable)).toBe(0);
    expect(count('access_hash == 0', cable)).toBe(1);
    expect(sanctions).toContain('public const string NeedsHash =');
    // El andamio no reinventa esa cadena: toma la que ya escribió la ronda AZ.
    expect(preview).toContain('throw new Error(SANCTION_REFUSALS.needsHash);');
    expect(count(csSentence('NeedsHash', sanctions), cable)).toBe(0);
    // Y la respuesta es una sola escritura con la bandera contraria: no hay dos caminos para aprobar y rechazar.
    expect(count('Messages_HideChatJoinRequest', cable)).toBe(1);
    expect(cable).not.toContain('Messages_RequestJoinChat');
  });

  it('las citas de archivo y línea del documento C# existen', () => {
    const modelTotal = modelLines.length;
    const policyTotal = policy.split('\n').length;
    for (const file of [rules, cable]) {
      for (const [, at] of file.matchAll(/NativeBridge\.java:(\d+)/g)) expect(javaLines.length, `:${at}`).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/JoinRequests\.java:(\d+)/g)) expect(modelTotal, `:${at}`).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/BridgePolicy\.java:(\d+)/g)) expect(policyTotal, `:${at}`).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/<c>:(\d{3,4})<\/c>/g)) expect(javaLines.length, `:${at}`).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/<c>:(\d{3,4})-(\d{3,4})<\/c>/g)) expect(javaLines.length, `:${at}`).toBeGreaterThan(Number(at));
    }
    expect(rules).toContain('NativeBridge.java:757');
    expect(rules).toContain('JoinRequests.java:26-31');
    expect(cable).toContain('BridgePolicy.java:48');
    expect(cable).toContain('JoinRequestsPanel.tsx:65');
    // El abanico de nombres y el cierre de página, que son las dos idas que Android hace y Windows no.
    expect(bridgeLine(3559)).toContain('private void joinResolve(Answer a,TdApi.Chat chat,JSONArray rows');
    expect(bridgeLine(3564)).toContain('private void finishJoinPage(Answer a,TdApi.Chat chat,JSONArray rows,int total)');
  });

  it('el andamio modela el flujo en lugar de prometer un vacío', () => {
    for (const method of ['chat.requests', 'chat.request.answer'])
      expect(count(`method === '${method}'`, preview), method).toBe(1);
    // Las seis negaciones del andamio son las del cable, carácter a carácter.
    const table: [string, string][] = [
      ['unsupported', 'Unsupported'], ['cursor', 'CursorIssue'], ['gone', 'CursorGone'],
      ['self', 'SelfAnswer'], ['badId', 'BadUserId'], ['missingApprove', 'MissingApprove'],
    ];
    for (const [key, name] of table) expect(scaffoldSentence(key), key).toBe(csSentence(name));
    // La forma del marcador se exige antes de mirar la cola, y la página se corta por lleno, no por lo que queda.
    expect(preview).toContain('if (joinCursorProblem(marker)) throw new Error(JOIN_REFUSALS.cursor);');
    expect(preview).toContain('const next = slice.length >= 20;');
    expect(preview).toContain('cursor: next && last ? `${last.userId}:${last.date}` : \'\'');
    // Las tres causas que solo pronuncia Windows están medidas contra la plataforma, no repartidas al azar.
    expect(count('const desktop = state.platform', preview)).toBe(1);
    expect(preview).toContain('if (desktop && !strict) throw new Error(JOIN_REFUSALS.badId);');
    expect(preview).toContain('if (desktop && approve === null) throw new Error(JOIN_REFUSALS.missingApprove);');
    expect(preview).toContain('if (desktop) throw new Error(SANCTION_REFUSALS.needsHash);');
    // Y el silencio de la cuenta ajena, que en las dos capas es `false` y no un error.
    expect(preview).toContain("if (typeof params.accountId === 'string' && params.accountId !== state.selfId) return false;");
  });
});

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BG · medido con las manos en el andamio de escritorio', () => {
  let call: Request = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as Request;
  });

  // El andamio responde de forma síncrona y lanza con `throw`: la promesa no llega a existir, así que el `catch` de
  // la promesa no vale. Se mide igual que el puente: la frase que la pantalla acabaría leyendo.
  const ask = async (method: string, params: Record<string, unknown> = {}) => {
    try {
      return await call(method, params);
    } catch (caught) {
      return (caught as Error).message;
    }
  };
  const page = async (id = '14', cursor?: string) =>
    await ask('chat.requests', { id, ...(cursor ? { cursor } : {}) }) as Record<string, unknown>;
  const rows = (result: Record<string, unknown>) => result.requests as Record<string, unknown>[];

  it('la primera página trae veinte filas, el total y el marcador para seguir', async () => {
    const first = await page();
    expect(Object.keys(first)).toEqual(['total', 'requests', 'next', 'cursor']);
    expect(first.total).toBe(25);
    expect(rows(first).length).toBe(20);
    expect(first.next).toBe(true);
    const last = rows(first)[19];
    expect(first.cursor).toBe(`${last.userId}:${last.date}`);
    // Cada fila sale con las cuatro claves de la fila del puente, con nombre y sin identificador suelto.
    expect(Object.keys(last)).toEqual(['userId', 'name', 'date', 'bio']);
    expect(String(last.name).length).toBeGreaterThan(1);
  });

  it('el marcador avanza y la última página lo deja vacío', async () => {
    const first = await page();
    const second = await page('14', String(first.cursor));
    expect(rows(second).length).toBe(5);
    expect(second.next).toBe(false);
    expect(second.cursor).toBe('');
    const seen = [...rows(first), ...rows(second)].map(row => String(row.userId));
    expect(new Set(seen).size).toBe(25);
  });

  it('la cola se puede abrir en un grupo básico y en un canal', async () => {
    for (const id of ['18', '22', '24']) {
      const result = await page(id);
      expect(rows(result).length, id).toBe(20);
    }
  });

  it('un chat que no es grupo ni canal se niega con la frase del puente', async () => {
    expect(await ask('chat.requests', { id: '11' }))
      .toBe('Las solicitudes de ingreso solo existen en grupos y canales.');
    expect(await ask('chat.request.answer', { id: '11', userId: '4101', approve: true, accountId: '1' }))
      .toBe('Las solicitudes de ingreso solo existen en grupos y canales.');
    // Y la fila que no está en la lista es la otra negación: la de la conversación no cargada.
    expect(await ask('chat.requests', { id: '999' }))
      .toBe('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
  });

  it('el marcador mal formado se niega antes de tocar la cola', async () => {
    const good = (await page()).cursor;
    for (const marker of ['4101', 'a:b', `${good}:2`, ':1700000000', '4101:', '0:1700000000', '4101:0', '4101:x', '-1:1700000000'])
      expect(await ask('chat.requests', { id: '14', cursor: marker }), marker)
        .toBe('El marcador de solicitudes no es válido.');
    // El techo del `int` de la fecha (`JoinRequests.offset:57`) también se mide: 2.147.483.648 no entra.
    expect(await ask('chat.requests', { id: '14', cursor: '4101:2147483648' }))
      .toBe('El marcador de solicitudes no es válido.');
    expect(String(good)).toMatch(/^[0-9]+:[0-9]+$/);
  });

  it('un marcador que nombra a quien ya no está manda reabrir la cola', async () => {
    expect(await ask('chat.requests', { id: '14', cursor: '999999:1700000000' }))
      .toBe('Vuelve a abrir las solicitudes para continuar.');
    // La última fila de la primera página, borrada mientras el marcador estaba en la pantalla: mismo consejo.
    const first = await page();
    const last = rows(first)[19];
    expect(await call('chat.request.answer', { id: '14', userId: String(last.userId), approve: false, accountId: '1' })).toBe(true);
    expect(await ask('chat.requests', { id: '14', cursor: String(first.cursor) }))
      .toBe('Vuelve a abrir las solicitudes para continuar.');
  });

  it('aprobar o rechazar quita la fila y el total baja', async () => {
    const before = await page();
    const target = rows(before)[3];
    expect(await call('chat.request.answer', { id: '14', userId: String(target.userId), approve: true, accountId: '1' })).toBe(true);
    const after = await page();
    expect(after.total).toBe(24);
    expect(rows(after).some(row => row.userId === target.userId)).toBe(false);
    // Rechazar es el mismo camino con la bandera contraria.
    expect(await call('chat.request.answer', { id: '14', userId: String(rows(after)[0].userId), approve: false, accountId: '1' })).toBe(true);
    expect((await page()).total).toBe(23);
  });

  it('la cuenta que cambió no toca nada y no oye un error', async () => {
    const first = await page();
    expect(await call('chat.request.answer', { id: '14', userId: String(rows(first)[0].userId), approve: true, accountId: '999' })).toBe(false);
    expect(await call('chat.request.answer', { id: '14', userId: 'zzz', approve: true, accountId: '999' })).toBe(false);
    // Sin la clave, el puente no la echa de menos: `:3580` solo niega una cuenta distinta de la propia.
    expect(await call('chat.request.answer', { id: '14', userId: String(rows(first)[0].userId), approve: true })).toBe(true);
  });

  it('las tres causas de la forma estricta salen en español en Windows', async () => {
    expect(await ask('chat.request.answer', { id: '14', userId: '41,01', approve: true, accountId: '1' }))
      .toBe('El identificador de la solicitud no es válido.');
    expect(await ask('chat.request.answer', { id: '14', userId: 4101, approve: true, accountId: '1' }))
      .toBe('El identificador de la solicitud no es válido.');
    expect(await ask('chat.request.answer', { id: '14', userId: '4101', accountId: '1' }))
      .toBe('La respuesta debe decir si se aprueba o se rechaza la solicitud.');
    expect(await ask('chat.request.answer', { id: '14', userId: '4101', approve: 'true', accountId: '1' }))
      .toBe('La respuesta debe decir si se aprueba o se rechaza la solicitud.');
    // Una fila que ya no está es, en Windows, un `access_hash` perdido: la cadena de la ronda AZ.
    expect(await ask('chat.request.answer', { id: '14', userId: '999999', approve: true, accountId: '1' }))
      .toBe('Telegram no dio los datos necesarios para cambiar el estado de esta persona. Vuelve a abrir la lista e inténtalo de nuevo.');
  });

  it('la propia solicitud y el identificador cero no se responden', async () => {
    expect(await ask('chat.request.answer', { id: '14', userId: '1', approve: true, accountId: '1' }))
      .toBe('Esa solicitud no se puede responder desde aquí.');
    expect(await ask('chat.request.answer', { id: '14', userId: '0', approve: true, accountId: '1' }))
      .toBe('Esa solicitud no se puede responder desde aquí.');
  });

  it('la vista de Android sigue oyendo sus cuatro frases y ninguna de Windows', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android', ready: true, selfId: '1' });
    expect(await ask('chat.requests', { id: '11' })).toBe('Las solicitudes de ingreso solo existen en grupos y canales.');
    expect(await ask('chat.requests', { id: '14', cursor: 'sin-dos-puntos' })).toBe('El marcador de solicitudes no es válido.');
    // La negación del hash no existe en TDLib: aquí la fila ausente se responde con `true`, como la respondería
    // Telegram si la solicitud ya no estuviera, y el panel la ve desaparecer con su propia recarga.
    expect(await call('chat.request.answer', { id: '14', userId: '999999', approve: true, accountId: '1' })).toBe(true);
  });
});
