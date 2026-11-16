import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PEER_REFUSALS } from './peerCard';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * La ronda BP conecta `profile.sender` en Windows: la clase de reglas, el cable y el brazo del despacho. Lo que esta
 * prueba vigila es lo que esa conexión promete, en las cuatro piezas que la forman y en los tres estados que puede
 * dar la orden.
 *
 * Primero las frases: `senderProfile` de Android solo sabe negar de dos maneras —la guarda agrupada de `:1600`, que
 * comparte la literal del chat secreto ya escrita en `DesktopPeerProfile.cs:23`, y la del autor que la fila no trae,
 * en `:1611`— y ninguna de las dos se vuelve a escribir en el cable, en el andamio ni en la pantalla. Segundo el
 * orden: las guardas del cable tienen que caer en las mismas posiciones relativas que las de Java, con la lectura del
 * temporizador por delante de la negación que produce y con el `access_hash` por delante de la fila devuelta, porque
 * una ficha inventada con el número suelto es peor que un aviso (norma BI). Tercero la puerta: BO había vuelto texto
 * el nombre del remitente porque el brazo no existía; BP lo escribió y la guarda tiene que haberse ido, con todo lo
 * que la pantalla hace después (`PeerProfile.tsx:50` y su `chat.profile`) ya medido.
 *
 * Las cinco pruebas del final no leen texto: arrancan el módulo real y llaman. Son las únicas que pueden decir si el
 * andamio enseña lo que el puente contestaría, y por eso fueron ellas las que obligaron a poner autor en las filas del
 * muestrario: `profile.sender` nombra al autor por su número, y una fila que se firma con un nombre y lleva el número
 * de otra se desmentía en cuanto se pulsaba. La última barre los grupos enteros para que eso no pueda volver a
 * colarse: recorre las filas que la pantalla pintarían como botón y exige que todas tengan a quién preguntar.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopSenderProfile.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopSenderProfileFlow.cs');
const hashes = text('../../desktop/src/WRGram.Desktop/DesktopPeerProfile.cs');
const dispatchTable = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const screen = text('./PeerProfile.tsx');
const preview = text('./preview.ts');
const mirror = text('./peerCard.ts');
const scope = text('./desktopScope.ts');
const service = text('./contract.ts');

const lines = java.split('\n');

/** Una línea del puente de Android, contada desde 1. Sin aguja no hay prueba: se falla. */
function javaLine(number: number): string {
  const row = lines[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return row;
}

/** El literal que una clase de reglas de C# asigna a una constante de texto. */
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

/** El método de Android que corresponde, cortado por el siguiente. */
function javaMethod(name: string, next: string): string {
  const start = java.indexOf(`private void ${name}(`);
  const end = java.indexOf(`private void ${next}(`, start);
  if (start < 0 || end < 0) throw new Error(`Falta ${name} en NativeBridge`);
  return java.slice(start, end);
}

const SENDER = javaMethod('senderProfile', 'respondProfilePeer');
const CABLE = body('private async Task<object?> SenderProfileAsync', cable);

/** Las dos negaciones de la orden, con la línea de Android que las dice. */
const REFUSALS: [string, number][] = [
  [PEER_REFUSALS.secret, 1601],
  [PEER_REFUSALS.noSender, 1611],
];

describe('ronda BP · las tres capas dicen lo mismo del remitente', () => {
  it('la orden tiene brazo en el despacho, delante del rechazo genérico', () => {
    expect(dispatchTable).toContain('"profile.sender" => await SenderProfileAsync(args),');
    expect(count('"profile.sender" =>', dispatchTable)).toBe(1);
    // El brazo vive donde están sus cinco hermanas: `chat.profile` abre la familia y el genérico la cierra.
    ordered(dispatchTable,
      '"chat.profile" => await ChatProfileAsync(args)',
      '"profile.related" => await RelatedAsync(args)',
      '"profile.peer" => ProfilePeerAsync(args)',
      '"profile.contact" => ProfileContactAsync(args)',
      '"profile.sender" => await SenderProfileAsync(args)',
      '_ => throw new BridgeException');
    // El número que la ronda BM dejó anclado sigue siendo el del brazo.
    expect(cable).toContain('TelegramService.cs:253');
    expect(dispatchTable.split('\n')[252]).toContain('"profile.sender" => await SenderProfileAsync(args),');
  });

  it('las dos negaciones son literales de Android y cada una vive una sola vez por capa', () => {
    for (const [phrase, at] of REFUSALS) expect(says(javaLine(at), phrase), `NativeBridge.java:${at}`).toBe(true);
    // La primera no se copia: es la misma frase del chat secreto, así que la constante de aquí es un alias.
    expect(javaLine(1601)).toContain(`"${PEER_REFUSALS.secret}"`);
    expect(rules).toContain('public const string NoProfile = DesktopPeerProfile.Secret;');
    expect(count(`"${PEER_REFUSALS.secret}"`, rules)).toBe(0);
    // La literal vive una sola vez en la capa, y es la de siempre: la casa que la escribió sigue siendo la dueña.
    expect(count(`"${PEER_REFUSALS.secret}"`, hashes)).toBe(1);
    // La segunda sí es de esta clase, y carácter a carácter.
    expect(javaLine(1611)).toContain(`"${PEER_REFUSALS.noSender}"`);
    expect(csSentence('UnknownSender')).toBe(PEER_REFUSALS.noSender);
    expect(mirror).toContain(`noSender: '${PEER_REFUSALS.noSender}',`);
    for (const phrase of REFUSALS.map(([phrase]) => phrase)) {
      // Ni el cable, ni el andamio, ni la pantalla las vuelven a escribir: las tres llaman a su casa.
      expect(count(phrase, cable), `cable.${phrase}`).toBe(0);
      expect(count(phrase, preview), `scaffold.${phrase}`).toBe(0);
      expect(count(phrase, app), `app.${phrase}`).toBe(0);
      expect(count(phrase, screen), `screen.${phrase}`).toBe(0);
    }
    expect(count(PEER_REFUSALS.noSender, mirror)).toBe(1);
  });

  it('la guarda agrupada de `:1600` son seis condiciones y una sola frase', () => {
    // Seis condiciones unidas con cinco `||`, todas contra un solo `answer.fail`.
    const guard = javaLine(1600);
    expect(count('||', guard)).toBe(5);
    for (const needle of ['message==null', 'message.chatId!=chatId', 'source==null',
      'source.type instanceof TdApi.ChatTypeSecret', 'message.selfDestructType!=null', 'message.ephemeralContent!=null']) {
      expect(guard, needle).toContain(needle);
    }
    // Una sola frase para las seis: la negación se escribe detrás del `if`, no dentro de cada rama.
    expect(count('answer.fail', guard)).toBe(0);
    expect(count('answer.fail', javaLine(1601))).toBe(1);
    // En C# las seis se reparten entre dos casas: la del chat y la del temporizador, y todas dicen lo mismo.
    expect(CABLE).toContain('if (entry == null) throw new BridgeException(DesktopSenderProfile.NoProfile);');
    expect(CABLE).toContain('if (row == null) throw new BridgeException(DesktopSenderProfile.NoProfile);');
    expect(CABLE).toContain('if (DesktopSenderProfile.IsEphemeral(row)) throw new BridgeException(DesktopSenderProfile.NoProfile);');
    expect(count('DesktopSenderProfile.NoProfile', CABLE)).toBe(3);
    // La fila se busca dentro de su propia conversación, que es el `message.chatId!=chatId` traducido a petición.
    expect(rules).toContain('public static MessageBase? Row(MessageBase[]? rows, long id)');
    expect(rules).toContain('if (row != null && row.ID == id) return row;');
    // Y la marca de borrado automático se lee del propio objeto, no de una proyección: `has_ttl_period` no basta.
    for (const needle of ['Message message => message.ttl_period > 0,', 'MessageService service => service.ttl_period > 0,']) {
      expect(rules, needle).toContain(needle);
    }
    // La marca solo se nombra en el documento, que es donde se explica por qué no es la regla: en el código manda el valor.
    expect(count('has_ttl_period', rules)).toBe(1);
    expect(count('has_ttl_period', CABLE)).toBe(0);
    // Los dos tipos de fila, porque en MTProto un servicio es otra clase y también tiene autor.
    for (const needle of ['Message message => message.from_id,', 'MessageService service => service.from_id,']) {
      expect(rules, needle).toContain(needle);
    }
    expect(count('public static TL.Peer? SenderOf', rules + cable)).toBe(1);
    // Lo que no es ninguna de las dos clases no produce autor ni temporizador: `null` y `false`, sin fila inventada.
    expect(count('_ => null,', rules)).toBe(1);
    expect(count('_ => false,', rules)).toBe(1);
    expect(count('public static bool IsEphemeral', rules + cable)).toBe(1);
    expect(count('public static MessageBase? Row', rules + cable)).toBe(1);
  });

  it('el orden de guardas del cable es el de Java, medido por posición', () => {
    ordered(SENDER,
      'long chatId=BridgePolicy.id(params,"chatId")',
      'TdApi.Chat source=session.chat(chatId);',
      'answer.fail("Este perfil no está disponible.")',
      'message.senderId instanceof TdApi.MessageSenderUser',
      'message.senderId instanceof TdApi.MessageSenderChat',
      'answer.fail("Telegram no identificó al remitente.")');
    ordered(CABLE,
      'var entry = FindEntry(Str(args, "chatId"));',
      'await client.GetMessages(entry.Input, new InputMessageID { id = (int)id })',
      'MergePeers(table.users?.Values, table.chats?.Values);',
      'var row = DesktopSenderProfile.Row(page.Messages, id);',
      'if (row == null) throw',
      'if (DesktopSenderProfile.IsEphemeral(row)) throw',
      'var peer = DesktopSenderProfile.SenderOf(row);',
      'if (peer == null) throw new BridgeException(DesktopSenderProfile.UnknownSender);',
      'return DesktopPeerProfile.PeerRow(');
    // El temporizador delante de la negación que produce: si no, un autor sin fila oíría «no identificó» por culpa de otro.
    expect(CABLE.indexOf('IsEphemeral')).toBeLessThan(CABLE.indexOf('SenderOf'));
    // La ficha se arma con la fila leída, nunca con el número: el hash se pide antes de devolver nada.
    expect(CABLE.indexOf('access_hash ?? 0L) == 0L')).toBeLessThan(CABLE.indexOf('return DesktopPeerProfile.PeerRow'));
    expect(CABLE).toContain('throw new BridgeException(DesktopPeerProfile.NoHash)');
    // Y la caché de peers se llena con la respuesta que los trae, que es lo que en TDLib hace el propio `GetChat`.
    expect(count('MergePeers', CABLE)).toBe(1);
  });

  it('la pantalla abre la ficha por la misma puerta en las dos capas, y sin texto suyo', () => {
    const peer = "const peer = initial ?? await request<Chat>('profile.sender', message);";
    expect(screen).toContain(peer);
    expect(count('profile.sender', screen)).toBe(1);
    // El identificador devuelto no lo toca la pantalla: se usa tal cual en la ficha que viene después.
    expect(screen).toContain("const data = await request<ChatProfile>('chat.profile', { id: peer.id });");
    expect(screen).not.toContain("'u' +");
    // La puerta de BO ya no está: el nombre del remitente de un grupo vuelve a ser botón en las dos capas.
    const door = "{!message.outgoing&&active.type==='group'&&<button type=\"button\" className=\"sender-name sender-profile\" onClick={()=>showPeerProfile(undefined,message)} aria-label={`Ver perfil de ${message.sender}`}>";
    expect(app).toContain(door);
    expect(count('sender-name sender-profile', app)).toBe(1);
    expect(count('showPeerProfile(undefined,message)', app)).toBe(1);
    // Y la firma del puente, declarada una sola vez en el contrato compartido.
    expect(service).toContain("authorKind?:'user'|'chat'; authorId?:string;");
  });

  it('la familia cruzó de pendiente a disponible y el andamio dejó de negarla', () => {
    const claim = `{ label: 'fichas de chat y de persona', methods: ['chat.profile', 'profile.peer', 'profile.related', 'profile.sender'] },`;
    expect(count(claim, scope)).toBe(1);
    expect(scope.indexOf(claim)).toBeGreaterThan(scope.indexOf('export const DESKTOP_AVAILABLE'));
    expect(scope.indexOf(claim)).toBeLessThan(scope.indexOf('export const DESKTOP_PENDING'));
    expect(DESKTOP_AVAILABLE.some(item => item.methods.includes('profile.sender'))).toBe(true);
    expect(DESKTOP_PENDING.some(item => item.methods.includes('profile.sender'))).toBe(false);
    // La puerta de BK: sin brazo la habría negado en escritorio; con brazo, ni la menciona.
    expect(desktopGapRefusal('profile.sender')).toBeUndefined();
    // El andamio la modela con las reglas de `peerCard.ts`, sin una sola frase propia.
    expect(preview).toContain("if (method === 'profile.sender') return designSender(params, state);");
    ordered(preview,
      "if (method === 'profile.related')",
      "if (method === 'profile.peer')",
      "if (method === 'profile.contact')",
      "if (method === 'profile.sender')");
    expect(count('PEER_REFUSALS.secret', preview)).toBeGreaterThan(0);
    expect(count('PEER_REFUSALS.noSender', preview)).toBe(2);
    expect(count('PEER_REFUSALS.noHash', preview)).toBeGreaterThan(2);
  });
});

type PeerRow = { id: string; title: string; type: string; username: string; bot: boolean; supported: boolean };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BP · medido con las manos en el andamio', () => {
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
  const sender = async (chatId: string, id: string) => await ask('profile.sender', { chatId, id }) as PeerRow | string;

  it('el autor de una fila de grupo es la persona que la lista conoce', async () => {
    expect(await sender('23', '503')).toEqual({ id: '503', title: 'Sofía López', type: 'private', username: 'sofialopez', bot: false, supported: true });
    // Las dos filas que el andamio firmaba con un nombre ajeno a su número: ya coinciden, y se puede pulsar.
    expect(await sender('23', '502')).toEqual({ id: '502', title: 'María Fernández', type: 'private', username: 'maria_fdz', bot: false, supported: true });
    expect(await sender('23', '501')).toEqual({ id: '501', title: 'Álex Moreno', type: 'private', username: '', bot: false, supported: true });
    // Y las del arranque, que las ve también el chat 14: la misma fila en las dos ventanas.
    expect(await sender('14', '105')).toMatchObject({ id: '502', title: 'María Fernández' });
    expect(await sender('11', '105')).toMatchObject({ id: '502', title: 'María Fernández' });
    // Las dos familias que solo se ven en la comunidad —el muestrario de multimedia y las ubicaciones— también
    // fueron firmadas con su número: antes decían «Vista de diseño» y «Álex Moreno» sin autor, y al pulsarlas
    // el andamio habría negado con la frase de `:1611` algo que el puente sí sabe contestar.
    expect(await sender('14', '205')).toMatchObject({ id: '502', title: 'María Fernández' });
    expect(await sender('14', '213')).toMatchObject({ id: '501', title: 'Álex Moreno' });
  });

  it('la fila la firma el canal, y la respuesta abre la ficha sin tocar el identificador', async () => {
    expect(await sender('22', '401')).toMatchObject({ id: '22', title: 'WRGram · Novedades', type: 'channel' });
    // Lo que hace la pantalla después del primer `await`: `chat.profile` con el identificador devuelto.
    expect(await ask('chat.profile', { id: '22' })).toMatchObject({ title: 'WRGram · Novedades' });
    expect(await ask('chat.profile', { id: '503' })).toMatchObject({ title: 'Sofía López' });
  });

  it('el chat secreto, el que no existe y el número que no es de ahí se niegan con la frase agrupada', async () => {
    expect(await sender('26', '2601')).toBe(PEER_REFUSALS.secret);
    expect(await sender('999', '105')).toBe(PEER_REFUSALS.secret);
    expect(await sender('12', '105')).toBe(PEER_REFUSALS.secret);
    expect(await sender('11', '503')).toBe(PEER_REFUSALS.secret);
  });

  it('quien no tiene autor se niega con la frase de `:1611`, y quien no tiene ficha con el `access_hash`', async () => {
    // Las filas de servicio y las que el propio andamio escribe no traen autor identificado: la negación con nombre.
    expect(await sender('11', '106')).toBe(PEER_REFUSALS.noSender);
    expect(await sender('21', '1001')).toBe(PEER_REFUSALS.noSender);
    // Javier escribe en el chat 17 con un número que la lista de este host no conoce: sin hash no hay InputPeerUser.
    expect(await sender('17', '1002')).toBe(PEER_REFUSALS.noHash);
    // La misma puerta, la misma frase que la hermana de al lado.
    expect(await ask('profile.contact', { id: '1017' })).toBe(PEER_REFUSALS.noHash);
    // Y en Android el andamio contesta igual: una tabla de respuestas, dos plataformas.
    vi.resetModules();
    const scaffold = await import('./preview');
    const bridge = await import('./bridge');
    bridge.acceptState({ ...scaffold.fixture, platform: 'android', ready: true });
    const android = scaffold.designRequest as DesignCall;
    expect(await android('profile.sender', { chatId: '23', id: '503' })).toMatchObject({ title: 'Sofía López' });
    expect(await android('profile.sender', { chatId: '22', id: '402' })).toMatchObject({ type: 'channel' });
  });

  it('ninguna fila que la pantalla pinta como botón se queda sin autor', async () => {
    // La guarda mecánica de la coherencia: en un grupo el nombre del remitente es botón de ficha, así que toda
    // fila ajena y no-de-servicio de todo grupo del muestrario tiene que responder con una ficha. Si alguien
    // añade una fila sin `authorId`, esto lo dice con chat y número; en la pantalla sería la frase de `:1611`.
    const scaffold = await import('./preview');
    const bridge = await import('./bridge');
    const groups = scaffold.fixture.chats.filter(chat => chat.type === 'group');
    expect(groups.length).toBeGreaterThan(0);
    for (const chat of groups) {
      await ask('chat.open', { id: chat.id });
      for (const row of bridge.snapshot().messages.filter(item => !item.outgoing && !item.service)) {
        const answer = await sender(chat.id, row.id);
        expect(typeof answer, `chat ${chat.id}, fila ${row.id}: ${answer}`).toBe('object');
      }
    }
  });
});
