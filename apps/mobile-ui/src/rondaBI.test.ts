import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BLOCKED_DIALOG, BLOCKED_KINDS, BLOCKED_MAX_OFFSET, BLOCKED_NAME_SHOWN, BLOCKED_PAGE_SIZE,
  BLOCKED_REFUSALS, blockedHasMore, blockedLimit, blockedSender,
} from './blockedSenders';
import type { BlockedSenders } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BlockedSendersPolicy.java');
const allowed = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopBlocked.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopBlockedFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const mirror = text('./blockedSenders.ts');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');
const panel = text('./BlockedSettings.tsx');
const settings = text('./SettingsPage.tsx');
const profile = text('./PeerProfile.tsx');
const app = text('./App.tsx');
const contract = text('./contract.ts');

const javaLines = java.split('\n');
const policyLines = policy.split('\n');
const allowedLines = allowed.split('\n');
const profileLines = profile.split('\n');

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const javaLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const policyLine = (number: number) => line(policyLines, number, 'BlockedSendersPolicy.java');
const allowedLine = (number: number) => line(allowedLines, number, 'BridgePolicy.java');
const profileLine = (number: number) => line(profileLines, number, 'PeerProfile.tsx');

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** El entero que C# asigna a un techo. */
function csNumber(name: string, from = rules): number {
  const match = new RegExp(`public const int ${name} =\\s*(\\d+)`).exec(from);
  if (!match) throw new Error(`Falta el techo ${name}`);
  return Number(match[1]);
}

/** El literal que Java asigna a una cadena, con las comillas puestas. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);

/** El cuerpo de un método, cortado por el siguiente bloque de documento o por la siguiente firma. */
function body(needle: string, from: string, stop: string): string {
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

const javaList = body('private void blockedSenders(JSONObject params,Answer answer) {', java, '\n    private void unblockSender');
const javaUnblock = body('private void unblockSender(JSONObject params,Answer answer) {', java, '\n    private static String presence');
const javaBlock = body('private void profileBlock(JSONObject params,Answer answer)throws Exception{', java, '\n    private void reportChat');
const csList = body('private async Task<object?> BlockedAsync', cable, '\n    /// <summary>');
const csUnblock = body('private async Task<object?> UnblockSenderAsync', cable, '\n    /// <summary>');
const csBlock = body('private async Task<object?> SetBlockProfileAsync', cable, '\n    /// <summary>');
const csSearch = body('private async Task<TL.Peer?> BlockedPeerAsync', cable, '\n    /// <summary>');
const csRow = body('public static object Row(Peer peer', rules, '\n    /// <summary>');
const csPage = body('public static object Page(List<object> items', rules, '\n    /// <summary>');
const desktop = body("if(state.platform==='desktop') return", settings, 'const categories=[');
const driven = body('const USER_DRIVEN = new Set([', bridge, '\n]);');

describe('ronda BI · medido en el cable de las tres capas', () => {
  it('las tres órdenes tienen brazo en Windows y las dos capas antiguas las siguen nombrando igual', () => {
    expect(javaLine(553)).toContain('case "privacy.blocked":blockedSenders(p,a);break;');
    expect(javaLine(554)).toContain('case "privacy.unblock":unblockSender(p,a);break;');
    expect(javaLine(540)).toContain('case "profile.block":profileBlock(p,a);break;');
    expect(allowedLine(42)).toContain('"privacy.blocked","privacy.unblock"');
    expect(allowedLine(30)).toContain('"profile.block"');
    expect(service).toContain('"privacy.blocked" => await BlockedAsync(args),');
    expect(service).toContain('"privacy.unblock" => await UnblockSenderAsync(args),');
    expect(service).toContain('"profile.block" => await SetBlockProfileAsync(args),');
    expect(cable).toContain('private async Task<object?> BlockedAsync(JsonElement args)');
    expect(cable).toContain('private async Task<object?> UnblockSenderAsync(JsonElement args)');
    expect(cable).toContain('private async Task<object?> SetBlockProfileAsync(JsonElement args)');
  });

  it('los tres techos están medidos en las tres capas, con la resta escrita como resta', () => {
    expect(policyLine(7)).toContain('PAGE_SIZE = 50');
    expect(csNumber('PageSize')).toBe(BLOCKED_PAGE_SIZE);
    expect(BLOCKED_PAGE_SIZE).toBe(50);
    // El techo del marcador no es un número redondo: es el sitio donde `offset+count` dejaría de caber en un `int`.
    expect(policyLine(14)).toContain('offset > Integer.MAX_VALUE - PAGE_SIZE');
    expect(rules).toContain('public const int MaxOffset = int.MaxValue - PageSize;');
    expect(BLOCKED_MAX_OFFSET).toBe(2_147_483_647 - BLOCKED_PAGE_SIZE);
    expect(javaLine(1555)).toContain('NativeSnapshot.limit(session.senderName(sender),120)');
    expect(javaLine(1555)).toContain('NativeSnapshot.limit(session.senderName(sender),120)');
    expect(csNumber('NameShown')).toBe(BLOCKED_NAME_SHOWN);
    expect(BLOCKED_NAME_SHOWN).toBe(120);
    // Dos palabras para tres subtipos: el canal y el grupo básico caben en la misma.
    expect(says(policyLine(27), 'user')).toBe(true);
    expect(says(policyLine(28), 'chat')).toBe(true);
    expect(csSentence('UserKind')).toBe(BLOCKED_KINDS[0]);
    expect(csSentence('ChatKind')).toBe(BLOCKED_KINDS[1]);
  });

  it('las siete frases que Android dice están copiadas carácter a carácter en C# y en el espejo', () => {
    const shared: [string, string, string[]][] = [
      ['BadOffset', BLOCKED_REFUSALS.badOffset, [policyLine(12), policyLine(14)]],
      ['BadSender', BLOCKED_REFUSALS.badSender, [policyLine(23)]],
      ['IncompatiblePeer', BLOCKED_REFUSALS.incompatiblePeer, [policyLine(29), policyLine(35)]],
      ['ListFailed', BLOCKED_REFUSALS.listFailed, [javaLine(1547)]],
      ['ChangedAccount', BLOCKED_REFUSALS.changedAccount, [javaLine(1560)]],
      ['NotPrivate', BLOCKED_REFUSALS.notPrivate, [javaLine(1303)]],
      ['SelfBlock', BLOCKED_REFUSALS.selfBlock, [javaLine(1305)]],
    ];
    for (const [name, phrase, rows] of shared) {
      expect(csSentence(name)).toBe(phrase);
      for (const row of rows) expect(says(row, phrase)).toBe(true);
    }
  });

  it('las cinco negaciones propias de Windows no están en Android y sí en las dos capas nuevas', () => {
    const windows = ['notInList', 'needsHash', 'noProfileHash', 'missingValue', 'badValue'] as const;
    for (const name of windows) {
      const phrase = BLOCKED_REFUSALS[name];
      expect(java).not.toContain(phrase);
      expect(policy).not.toContain(phrase);
      expect(rules).toContain(`"${phrase}"`);
    }
    // Las dos del valor viajan dentro del cortafuegos, no en un `catch` que las trague.
    expect(rules).toContain('throw new BridgeException("' + BLOCKED_REFUSALS.missingValue + '")');
    expect(rules).toContain('throw new BridgeException("' + BLOCKED_REFUSALS.badValue + '")');
    // Las tres de la lista/la ficha las dice el cable antes de escribir nada, y la del hash se resuelve antes de
    // preguntar: un cuadro de confirmar que no puede cumplirse es peor que un aviso.
    expect(csUnblock).toContain('DesktopBlocked.NotInList');
    expect(csUnblock).toContain('UnblockTarget(peer)');
    expect(body('private InputPeer UnblockTarget(TL.Peer peer)', cable, '\n}')).toContain('DesktopBlocked.NeedsHash');
    expect(csBlock).toContain('DesktopBlocked.NoProfileHash');
  });

  it('el cuadro de confirmar es el de Android: sus cuatro rótulos y la escritura detrás', () => {
    expect(javaLine(1556)).toContain('.setTitle("Desbloquear a "+name)');
    expect(says(javaLine(1557), BLOCKED_DIALOG.body)).toBe(true);
    expect(javaLine(1558)).toContain('.setNegativeButton("Cancelar"');
    expect(javaLine(1559)).toContain('.setPositiveButton("Desbloquear"');
    expect(csSentence('Body')).toBe(BLOCKED_DIALOG.body);
    expect(csSentence('Accept')).toBe(BLOCKED_DIALOG.accept);
    expect(rules).toContain('"Desbloquear a " + name');
    expect(csUnblock).toContain('ConfirmPhoto(DesktopBlocked.Title(name), DesktopBlocked.Body, DesktopBlocked.Accept, null)');
    ordered(javaUnblock, 'BlockedSendersPolicy.sender(', '.setTitle(', '.setPositiveButton(', 'SetMessageSenderBlockList(sender,null)');
    ordered(csUnblock, 'DesktopBlocked.Requested(', 'ConfirmPhoto(', 'client.Contacts_Unblock(');
    // Cancelar responde `false` sin tocar Telegram, en las dos capas.
    expect(javaLine(1562)).toContain('setOnCancelListener(dialog->answer.ok(false))');
    expect(csUnblock).toContain('if (!ConfirmPhoto(DesktopBlocked.Title(name), DesktopBlocked.Body, DesktopBlocked.Accept, null)) return false;');
    expect(csUnblock).not.toMatch(/Contacts_Unblock\([^\n]*\);\s*\n\s*return false;/);
    // El rótulo del botón de la fila sale del espejo, no de una copia escrita a mano en la pantalla.
    expect(panel).toContain('aria-label={BLOCKED_DIALOG.title(sender.name)}');
    expect(panel).toContain('>{BLOCKED_DIALOG.accept}</button>');
    expect(panel).not.toContain("'Desbloquear a '+sender.name");
  });

  it('la guarda de la cuenta envuelve la escritura en las dos capas, y la lectura también la mira', () => {
    ordered(javaUnblock, '.setPositiveButton(', 'session.selfId!=answer.owner', 'perform(new TdApi.SetMessageSenderBlockList');
    ordered(csUnblock, 'ConfirmPhoto(', 'if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);', 'client.Contacts_Unblock(target, false);');
    // En Windows la cuenta se vuelve a mirar antes y después de escribir: la orden es asíncrona y el host puede
    // haber cambiado de sesión mientras Telegram respondía.
    expect(csUnblock.match(/client\.User\?\.id != owner/g)?.length).toBe(2);
    expect(csList).toContain('if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);');
    expect(csSearch).toContain('if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);');
    // La ficha no la mira, porque tampoco la mira Android: no hay diálogo nativo que se cruce.
    expect(csBlock).not.toContain('ChangedAccount');
    expect(javaBlock).not.toContain('currentAccount()');
  });

  it('las tres llamadas de la librería piden la lista principal y nunca la de historias', () => {
    const calls = cable.match(/client\.Contacts_(GetBlocked|Block|Unblock)\([^;]*\)/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const call of calls) expect(call).toMatch(/, false\)$/);
    expect(javaList).toContain('new TdApi.BlockListMain()');
    expect(java).not.toContain('BlockListStories');
    // La otra lista de TDLib no la ofrece ninguna pantalla, así que tampoco se modela en el andamio.
    expect(mirror).not.toContain('stories');
    expect(panel).not.toContain('historias');
  });

  it('la fila y la página salen de las mismas claves en las tres capas', () => {
    expect(javaLine(1538)).toContain('object("kind",kind,"id",Long.toString(id),"name"');
    expect(javaLine(1545)).toContain('if(photo!=null)item.put("photo",photo)');
    expect(csRow).toContain('{ ["kind"] = Kind(peer), ["id"] = Id(peer), ["name"] = name };');
    expect(csRow).toContain('if (photo != null) row["photo"] = photo;');
    expect(contract).toContain("export interface BlockedSender { kind:'user'|'chat'; id:string; name:string; photo?:Media }");
    expect(javaLine(1549)).toContain('count>0&&(count>=BlockedSendersPolicy.PAGE_SIZE||offset+count<result.totalCount)');
    expect(rules).toContain('rows > 0 && (rows >= PageSize || offset + rows < total)');
    expect(mirror).toContain('rows > 0 && (rows >= BLOCKED_PAGE_SIZE || offset + rows < total)');
    expect(javaLine(1549)).toContain('"nextOffset",offset+count');
    expect(csPage).toContain('nextOffset = offset + items.Count');
    expect(mirror).toContain('nextOffset: offset + items.length');
    // La fórmula, medida con números: página llena sigue, página corta para aunque falten filas por leer.
    expect(blockedHasMore(50, 0, 120)).toBe(true);
    expect(blockedHasMore(50, 50, 120)).toBe(true);
    expect(blockedHasMore(3, 3, 6)).toBe(false);
    expect(blockedHasMore(3, 0, 6)).toBe(true);
    expect(blockedHasMore(0, 0, 0)).toBe(false);
  });

  it('Windows busca el par de verdad y no reconstruye el número que devolvió la pantalla', () => {
    // El `kind` de la pantalla vale para grupo básico y canal a la vez: el número suelto no dice cuál de los dos es.
    expect(csSearch).toContain('Contacts_GetBlocked(offset, DesktopBlocked.PageSize, false)');
    expect(csSearch).toContain('SameSender(row.peer_id, kind, id)');
    expect(cable).toContain('peer is PeerChat chat && chat.chat_id == id');
    expect(cable).toContain('peer is PeerChannel channel && channel.channel_id == id');
    expect(cable).toContain('peer is PeerUser user && user.user_id == id');
    // El hash sale de los diccionarios de la misma respuesta, y cero no se manda nunca.
    expect(csList).toContain('MergePeers(answer.users?.Values, answer.chats?.Values)');
    expect(csSearch).toContain('MergePeers(answer.users?.Values, answer.chats?.Values)');
    expect(cable).toContain('PeerChat chat => new InputPeerChat(chat.chat_id)');
    expect(cable).toContain('access_hash: > 0');
    // La falta de hash se resuelve antes del cuadro de confirmar: no se pregunta lo que no se puede cumplir.
    ordered(csUnblock, 'BlockedPeerAsync(', 'UnblockTarget(peer)', 'ConfirmPhoto(', 'client.Contacts_Unblock(');
    expect(csBlock).toContain('if (entry.Input is not InputPeerUser target || target.access_hash == 0)');
    // La ficha escribe por la otra puerta y en el orden de Java: forma, cuenta propia, valor.
    ordered(javaBlock, 'chat.type instanceof TdApi.ChatTypePrivate', 'userId==session.selfId', 'params.getBoolean("value")', 'SetMessageSenderBlockList');
    ordered(csBlock, 'RequireEntry(', 'DesktopBlocked.NotPrivate', 'DesktopBlocked.SelfBlock', 'DesktopBlocked.BlockValue(args)', 'Contacts_Block(target, false)');
    expect(cable).toContain('if (block) await client.Contacts_Block(target, false);');
    expect(cable).toContain('else await client.Contacts_Unblock(target, false);');
  });

  it('la pantalla de escritorio ofrece la lista, y el desbloqueo es el único de los tres que espera a la persona', () => {
    expect(desktop).toContain('{visibilitySection}{blockedSection}');
    expect(settings).toContain('<BlockedSettings key={state.selfId} run={run} ready={state.ready}/>');
    expect(desktop).toContain('PRIVACIDAD');
    // El botón de la ficha no tiene guarda de plataforma: las dos capas lo atienden.
    expect(profileLine(100)).toContain("chat.type==='private' && chat.id!==ownId");
    expect(profileLine(100)).not.toContain('desktop');
    expect(app).toContain("run<boolean>('profile.block',{id:peer.id,value:!blocked})");
    ordered(body('changeBlock={(peer,blocked)=>{', app, '}} back='), 'confirm(', "run<boolean>('profile.block'");
    expect(driven).toContain("'privacy.unblock'");
    expect(driven).not.toContain("'privacy.blocked'");
    expect(driven).not.toContain("'profile.block'");
    expect(bridge).toContain("'privacy.unblock',");
  });

  it('el andamio modela las reglas de las dos capas y no una letra suelta', () => {
    expect(preview).toContain("if (method === 'privacy.blocked') return designBlockedPage(params);");
    expect(preview).toContain("if (method === 'privacy.unblock') return designUnblockSender(params, state);");
    expect(preview).toContain("if (method === 'profile.block') return designProfileBlock(params, state);");
    for (const needle of ['blockedOffsetProblem', 'blockedSender(params, state.selfId)', 'blockedPage(', 'BLOCKED_REFUSALS.']) {
      expect(preview).toContain(needle);
    }
    // Una sola lista: la que lee el panel es la que escribe la ficha y la que lee la ficha de la persona.
    expect(preview.match(/designBlockedRows/g)!.length).toBeGreaterThan(6);
    expect(preview).toContain('blocked:designIsBlocked(id)');
  });

  it('el cortafuegos de la forma es el de Java, también cuando lo llama otra capa', () => {
    expect(blockedSender({ kind: 'user', id: '501' }, '1')).toEqual({ kind: 'user', id: '501' });
    expect(blockedSender({ kind: 'chat', id: '-1002' }, '1')).toEqual({ kind: 'chat', id: '-1002' });
    expect(blockedSender({ kind: 'channel', id: '5' }, '1')).toBeNull();
    expect(blockedSender({ kind: 'user', id: 501 }, '1')).toBeNull();
    expect(blockedSender({ kind: 'user', id: '0' }, '1')).toBeNull();
    expect(blockedSender({ kind: 'user', id: '1' }, '1')).toBeNull();
    expect(blockedSender({ kind: 'chat', id: '0' }, '1')).toBeNull();
    expect(blockedSender({ kind: 'user', id: '1e3' }, '1')).toBeNull();
  });
});

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

const page = async (call: Request, offset?: number) =>
  await call('privacy.blocked', offset === undefined ? {} : { offset }) as BlockedSenders;
const ids = (rows: BlockedSenders) => rows.items.map(row => row.id);

describe('ronda BI · medido con las manos en el andamio', () => {
  let call: Request = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as Request;
  });

  it('la primera página trae tres filas, dice el total y manda el marcador a la siguiente', async () => {
    const first = await page(call);
    expect(ids(first)).toEqual(['501', '8102', '-1002']);
    expect(first.total).toBe(6);
    expect(first.nextOffset).toBe(3);
    expect(first.hasMore).toBe(true);
    const second = await page(call, 3);
    expect(ids(second)).toEqual(['8104', '8105', '-1003']);
    expect(second.nextOffset).toBe(6);
    expect(second.hasMore).toBe(false);
    // La fila larga sale recortada con la marca del puente, no entera ni cortada a secas.
    const long = second.items.find(row => row.id === '8104')!;
    expect(long.name.length).toBe(BLOCKED_NAME_SHOWN + 1);
    expect(long.name.endsWith('…')).toBe(true);
    expect(long.name).toBe(blockedLimit('María Fernanda de los Ángeles Bustamante y Valdivielso, que escribió un nombre larguísimo en su perfil de Telegram para ver qué hace el puente con él'));
  });

  it('el marcador se niega con la frase de las tres capas y se acepta hasta el techo', async () => {
    for (const offset of [-1, 1.5, BLOCKED_MAX_OFFSET + 1]) {
      await expect(call('privacy.blocked', { offset })).rejects.toThrow(BLOCKED_REFUSALS.badOffset);
    }
    await expect(call('privacy.blocked', { offset: '3' })).rejects.toThrow(BLOCKED_REFUSALS.badOffset);
    const tail = await page(call, BLOCKED_MAX_OFFSET);
    expect(tail.items).toEqual([]);
    expect(tail.hasMore).toBe(false);
  });

  it('desbloquear quita la fila de la lista que se vuelve a leer', async () => {
    expect(await call('privacy.unblock', { kind: 'user', id: '501' })).toBe(true);
    const rest = await page(call);
    expect(rest.total).toBe(5);
    expect(ids(rest)).toEqual(['8102', '-1002', '8104']);
    await expect(call('privacy.unblock', { kind: 'user', id: '501' })).rejects.toThrow(BLOCKED_REFUSALS.notInList);
    // Un chat y una persona con números parecidos son remitentes distintos.
    expect(await call('privacy.unblock', { kind: 'chat', id: '-1002' })).toBe(true);
    expect(ids(await page(call))).toEqual(['8102', '8104', '8105']);
  });

  it('la forma se niega antes de leer la lista, y la búsqueda antes de escribir', async () => {
    await expect(call('privacy.unblock', { kind: 'user', id: 501 })).rejects.toThrow(BLOCKED_REFUSALS.badSender);
    await expect(call('privacy.unblock', { kind: 'channel', id: '501' })).rejects.toThrow(BLOCKED_REFUSALS.badSender);
    await expect(call('privacy.unblock', { kind: 'user', id: '1' })).rejects.toThrow(BLOCKED_REFUSALS.badSender);
    await expect(call('privacy.unblock', { kind: 'chat', id: '0' })).rejects.toThrow(BLOCKED_REFUSALS.badSender);
    // Con la forma buena y el remitente fuera de la lista ya no es un problema de forma: es la relectura.
    await expect(call('privacy.unblock', { kind: 'user', id: '9999' })).rejects.toThrow(BLOCKED_REFUSALS.notInList);
    expect((await page(call)).total).toBe(6);
  });

  it('bloquear desde la ficha escribe en la misma lista que lee el panel', async () => {
    const card = async () => await call('chat.profile', { id: '11' }) as { id: string; title: string; blocked: boolean };
    expect((await card()).blocked).toBe(true);
    expect(await call('profile.block', { id: '11', value: false })).toBe(true);
    expect(ids(await page(call))).toEqual(['8102', '-1002', '8104']);
    expect((await card()).blocked).toBe(false);
    expect(await call('profile.block', { id: '11', value: true })).toBe(true);
    const last = await page(call, 3);
    expect(last.items.at(-1)).toEqual({ kind: 'user', id: '501', name: 'María Fernández' });
    expect((await card()).blocked).toBe(true);
  });

  it('la ficha niega lo que niega Android, en su orden, y el valor antes de escribir', async () => {
    await expect(call('profile.block', { id: '12', value: true })).rejects.toThrow(BLOCKED_REFUSALS.notPrivate);
    // La guarda de comunidad va delante: sin valor también se niega por ser un grupo.
    await expect(call('profile.block', { id: '12' })).rejects.toThrow(BLOCKED_REFUSALS.notPrivate);
    await expect(call('profile.block', { id: 'no existe', value: true })).rejects.toThrow(BLOCKED_REFUSALS.notPrivate);
    await expect(call('profile.block', { id: '1', value: true })).rejects.toThrow(BLOCKED_REFUSALS.selfBlock);
    await expect(call('profile.block', { id: '11' })).rejects.toThrow(BLOCKED_REFUSALS.missingValue);
    await expect(call('profile.block', { id: '11', value: 'si' })).rejects.toThrow(BLOCKED_REFUSALS.badValue);
    expect((await page(call)).total).toBe(6);
  });
});
