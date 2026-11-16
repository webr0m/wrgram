import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ADD_CANCELLED, ADD_LIMITS, ADD_REJECTIONS, batchNotice, fitsLong, outcomeLine, positiveId } from './memberAdditions';
import type { AddBatch, AddPermission, AddResult } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rulesJava = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MemberAdditions.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopMemberAdditions.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopMemberAdditionsFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const mirror = text('./memberAdditions.ts');

const lines = java.split('\n');
const pure = rulesJava.split('\n');

/** Una línea del puente, contada desde 1. Sin aguja no hay prueba: se falla. */
function line(number: number): string {
  const value = lines[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return value;
}

/** Una línea de la clase de reglas de Android. */
function rule(number: number): string {
  const value = pure[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de MemberAdditions`);
  return value;
}

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}

/** Si la línea lleva esa frase escrita como literal entero. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);

/** Y si la lleva partida por una concatenación, se comprueban los pedazos en orden. */
function saysInParts(row: string, ...parts: string[]): void {
  let cursor = 0;
  for (const part of parts) {
    const at = row.indexOf(`"${part}"`, cursor);
    if (at < 0) throw new Error(`La línea no dice "${part}"`);
    cursor = at + part.length;
  }
}

const count = (needle: string, from: string) => from.split(needle).length - 1;

/** El cuerpo de un método, cortado por la siguiente firma. */
function body(needle: string, from: string, stop = '\n    private '): string {
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

/**
 * Las quince frases con su gemelo en las tres capas: la línea de Android, la constante de C# y la clave del
 * espejo TypeScript. `rondaV` ya cotejaba Java contra el espejo; aquí entra el host, que es la capa nueva.
 */
const PHRASES: [number, string, keyof typeof ADD_REJECTIONS][] = [
  [24, 'Unsupported', 'unsupported'],
  [25, 'Migrated', 'migrated'],
  [26, 'Banned', 'banned'],
  [27, 'Outside', 'outside'],
  [28, 'NoRight', 'noRight'],
  [29, 'Full', 'full'],
  [30, 'Empty', 'empty'],
  [31, 'TooMany', 'tooMany'],
  [32, 'BadId', 'badId'],
  [33, 'BadForward', 'badForward'],
  [34, 'PremiumWouldAllow', 'premiumWouldAllow'],
  [35, 'PremiumRequired', 'premiumRequired'],
  [36, 'Failed', 'failed'],
  [37, 'Unconfirmed', 'unconfirmed'],
  [38, 'CancelledNotice', 'cancelled'],
];

type DesignCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;

describe('ronda BB · la firma de invitación cruzada con las tres capas', () => {
  it('las dos órdenes tienen brazo en el host y ya estaban en la lista del puente', () => {
    expect(service).toContain('"groups.add.info" => await AddInfoAsync(args),');
    expect(service).toContain('"groups.member.add" => await AddMembersAsync(args),');
    const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
    for (const method of ['groups.add.info', 'groups.member.add']) expect(policy).toContain(`"${method}"`);
  });

  it('las quince frases son la palabra de Android en su línea, en las tres capas', () => {
    for (const [number, csName, tsKey] of PHRASES) {
      expect(csSentence(csName)).toBe(ADD_REJECTIONS[tsKey]);
      expect(says(rule(number), ADD_REJECTIONS[tsKey])).toBe(true);
    }
    // Cada una, una sola vez en la clase de reglas: el cable pregunta, no repite el español.
    for (const [, csName] of PHRASES) expect(count(csSentence(csName), rules)).toBe(1);
  });

  it('la negación sin gemelo es propia de Windows y lo dice una vez en cada capa', () => {
    const needsHash = csSentence('NeedsHash');
    expect(java).not.toContain(needsHash);
    expect(rulesJava).not.toContain(needsHash);
    expect(mirror).not.toContain(needsHash);
    expect(count(needsHash, rules)).toBe(1);
    expect(count('DesktopMemberAdditions.NeedsHash', cable)).toBe(1);
  });

  it('el andamio no escribe ni una de esas frases: las pregunta', () => {
    for (const phrase of Object.values(ADD_REJECTIONS)) {
      expect(count(phrase, preview)).toBe(0);
      expect(count(phrase, mirror)).toBe(1);
    }
  });

  it('los tres topes, con su línea, y los cuatro marcadores, con la suya', () => {
    expect(ADD_LIMITS.basic).toBe(200);
    expect(ADD_LIMITS.batch).toBe(20);
    expect(ADD_LIMITS.forward).toBe(100);
    expect(rule(18)).toContain('BASIC_LIMIT = 200');
    expect(rule(20)).toContain('MAX_BATCH = 20');
    expect(rule(22)).toContain('MAX_FORWARD = 100');
    expect(count('BasicLimit = 200', rules)).toBe(1);
    expect(count('MaxBatch = 20', rules)).toBe(1);
    expect(count('MaxForward = 100', rules)).toBe(1);
    for (const [number, name, value] of [[41, 'Added', 'added'], [43, 'Rejected', 'rejected'],
      [45, 'Unclear', 'unclear'], [47, 'Cancelled', 'cancelled']] as [number, string, string][]) {
      expect(rule(number)).toContain(`"${value}"`);
      expect(csSentence(name)).toBe(value);
    }
    expect(mirror).toContain(`export const ADD_CANCELLED = '${ADD_CANCELLED}';`);
  });

  it('el cortafuegos del puente va en este orden y las dos capas nuevas también', () => {
    ordered(body('private void addMembers(', java),
      'MemberAdditions.positive(value)',
      'if (id != session.selfId) unique.add(id)',
      'MemberAdditions.batch(unique.size())',
      'asked.matches("[0-9]{1,3}")',
      'MemberAdditions.forwardProblem(forward)',
      'MemberAdditions.problem(chat, migratedTo, memberCount, self)',
      'confirmAdd(a, chat, wanted, sending');
    ordered(body('private async Task<object?> AddMembersAsync(', cable),
      'DesktopMemberAdditions.Positive(value)',
      'long.TryParse(value, NumberStyles.None',
      'DesktopMemberAdditions.Batch(wanted.Count)',
      'Regex.IsMatch(asked, "^[0-9]{1,3}$")',
      'DesktopMemberAdditions.ForwardProblem(requested)',
      'await AddContextAsync(client, entry, kind)',
      'ConfirmPhoto(DesktopMemberAdditions.DialogTitle');
    ordered(body("if (method === 'groups.member.add')", preview, "\n  if (method === 'groups.createSuper')"),
      'ADD_REJECTIONS.empty',
      'positiveId(id)',
      'batchProblem(ids.length)',
      '/^[0-9]{1,3}$/.test(asked)',
      'forwardProblem(limit)',
      'addPermission(String(params.id), state)');
  });

  it('un identificador que no cabe en un `long` es identificador inválido en las tres capas', () => {
    // `positive` mira los dígitos y `Long.parseLong` el rango (`:2161-2163`): dos pasos y un solo mensaje.
    expect(line(2161)).toContain('MemberAdditions.positive(value)');
    expect(line(2163)).toContain('MemberAdditions.BAD_ID');
    expect(positiveId('9223372036854775808')).toBe(true);
    expect(fitsLong('9223372036854775808')).toBe(false);
    expect(fitsLong('9223372036854775807')).toBe(true);
    expect(fitsLong('707')).toBe(true);
    expect(count('throw new BridgeException(DesktopMemberAdditions.BadId)', cable)).toBe(2);
    expect(cable).toContain('long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out _)');
    expect(preview).toContain('!positiveId(id) || !fitsLong(id)');
  });

  it('las dos peticiones van escritas a mano, porque la librería no trae el campo de historial', () => {
    const run = body('private async Task<(List<object> Rows, string Stopped)> RunAddAsync(', cable);
    expect(run).toContain('await client.Invoke(new TL.Methods.Messages_AddChatUser');
    expect(run).toContain('fwd_limit = forward,');
    expect(run).toContain('await client.Invoke(new TL.Methods.Channels_InviteToChannel');
    // `client.AddChatUser` existe, pero sin `fwd_limit`: usarlo sería prometer un historial que no viaja.
    expect(cable).not.toContain('client.AddChatUser(');
    // Un solo nombre por viaje en el canal: el informe y el corte de la cola se perderían juntando la tanda.
    expect(run).toContain('users = new InputUserBase[] { new InputUser(id, user.access_hash) }');
    expect(count('DesktopMemberAdditions.ForwardLimit(kind, requested)', cable)).toBe(1);
  });

  it('la respuesta buena no nombra a quien entró: se vuelve a leer su estado', () => {
    const run = body('private async Task<(List<object> Rows, string Stopped)> RunAddAsync(', cable);
    expect(run).toContain('DesktopMemberAdditions.Named(answer, id)');
    expect(run).toContain('await AddedAsync(client, kind, entry, id)');
    expect(run).toContain('DesktopMemberAdditions.Outcome(null, inside)');
    // Las dos formas de la relectura, medidas con la sonda: el básico no admite pregunta por persona.
    const reRead = body('private async Task<bool> AddedAsync(', cable);
    expect(reRead).toContain('BasicParticipantsAsync(client, entry)');
    expect(reRead).toContain('client.Channels_GetParticipant(ChannelInput(entry), new InputPeerUser(id, user.access_hash))');
    expect(line(2216)).toContain('new TdApi.GetChatMember(chat.id, new TdApi.MessageSenderUser(id))');
    expect(rules).toContain('answer?.missing_invitees?.FirstOrDefault(item => item != null && item.user_id == userId)');
  });

  it('un fallo fuerte corta la tanda, y la cuenta nueva antes de cada persona', () => {
    const run = body('private async Task<(List<object> Rows, string Stopped)> RunAddAsync(', cable);
    expect(run).toContain('if (client.User?.id != owner) return (rows, DesktopMemberAdditions.ChangedAccount);');
    expect(run).toContain('return (rows, message);');
    expect(csSentence('ChangedAccount')).toBe('La cuenta cambió. Revisa el grupo antes de repetir.');
    expect(says(line(2208), 'La cuenta cambió. Revisa el grupo antes de repetir.')).toBe(true);
    expect(says(line(2217), 'La cuenta cambió. Revisa el grupo antes de repetir.')).toBe(true);
    // La persona sin `access_hash` se nombra y la cola sigue: no se corta por algo que no es de Telegram.
    expect(run).toContain('DesktopMemberAdditions.NeedsHash');
    expect(count('continue;', run)).toBe(2);
  });

  it('cerrar el cuadro vale por «Cancelar» y no inventa una tanda vacía', () => {
    const add = body('private async Task<object?> AddMembersAsync(', cable);
    expect(add).toContain('DesktopMemberAdditions.Answer(new List<object>(), DesktopMemberAdditions.Cancelled)');
    expect(add).not.toContain('"Añadir en Telegram"');
    expect(count('DesktopMemberAdditions.DialogTitle', add)).toBe(2);
    // El botón izquierdo de Android es solo la etiqueta del cierre; la frase del aviso vive en el espejo.
    expect(says(line(2197), 'Cancelar')).toBe(true);
    expect(line(2197)).toContain('MemberAdditions.CANCELLED');
  });

  it('el cuadro es el de Android: tres nombres, título a sesenta y cuatro e historial solo si viaja', () => {
    expect(csSentence('DialogTitle')).toBe('Añadir en Telegram');
    expect(says(line(2195), 'Añadir en Telegram')).toBe(true);
    expect(says(line(2198), 'Añadir en Telegram')).toBe(true);
    const dialog = body('private void confirmAdd(', java);
    expect(dialog).toContain('Math.min(ids.length, 3)');
    saysInParts(line(2190), ' y ', ' más');
    expect(rules).toContain('list.Take(3)');
    expect(rules).toContain('" y " + (list.Count - 3) + " más"');
    saysInParts(line(2192), 'WRGram añadirá a ', ' en «', '». Telegram decide una por una y ');
    saysInParts(line(2193), 'puede negarse sin dar motivo; cada respuesta aparece al terminar.');
    saysInParts(line(2194), ' Verá los ', ' mensajes anteriores.');
    const message = body('public static string Body(', rules);
    expect(message).toContain('"WRGram añadirá a " + names + " en «" + title + "». Telegram decide una por una y puede negarse sin dar motivo; cada respuesta aparece al terminar."');
    expect(message).toContain('" Verá los " + forward + " mensajes anteriores."');
    // El título, recortado a sesenta y cuatro en las dos capas.
    expect(dialog).toContain('NativeSnapshot.limit(chat.title == null ? "" : chat.title, 64)');
    expect(rules).toContain('DesktopContact.Limit(title ?? "", 64)');
    // Los dos recortes de nombre son distintos a propósito: el del cuadro, medido en `:2188`.
    expect(line(2188)).toContain('NativeSnapshot.limit(session.senderName(new TdApi.MessageSenderUser(ids[index])), 40)');
    expect(line(2235)).toContain('NativeSnapshot.limit(session.senderName(new TdApi.MessageSenderUser(id)), 60)');
    expect(count('NameInDialog = 40', rules)).toBe(1);
    expect(count('NameShown = 60', rules)).toBe(1);
    // En el cuadro manda el recorte corto; en el informe, el largo.
    expect(count('DesktopMemberAdditions.DialogName', cable)).toBe(1);
    expect(count('DesktopMemberAdditions.Name(', cable)).toBe(4);
  });

  it('el lleno, la migración y el bloqueo se leen donde la librería los pone', () => {
    const context = body('private async Task<(string? Problem, int Members)> AddContextAsync(', cable);
    expect(context).toContain('Chat.Flags.has_migrated_to');
    expect(context).toContain('row.migrated_to != null');
    expect(context).toContain('row?.participants_count ?? -1');
    expect(context).toContain('await SelfParticipantAsync(client, ChannelInput(entry))');
    // En un básico no hay fila de sanción: el bloqueo solo se prueba en un canal, y eso se dice con un `false`.
    expect(context).toContain('DesktopMemberAdditions.Inside(self), false,');
    // Y «baneado» no se define dos veces: se pregunta por la definición de la lista de miembros.
    expect(rules).toContain('self != null && DesktopGroupMembers.IsBanned(self)');
    expect(count('DesktopGroupMembers.IsBanned(self)', rules)).toBe(1);
    expect(rules).toContain('ChatAdminRights.Flags.invite_users');
    ordered(body('public static string? Problem(', rules), 'Unsupported', 'Migrated', 'Banned', 'Outside', 'NoRight', 'Full');
    expect(rule(101)).toContain('static String problem(TdApi.Chat chat, long migratedTo, int memberCount, TdApi.ChatMemberStatus self)');
  });

  it('el hueco que queda solo se sabe en un básico con cifra leída', () => {
    expect(rules).toContain('kind == DesktopMembership.Kind.Basic && memberCount >= 0 ? BasicLimit - memberCount : -1');
    expect(line(2143)).toContain('MemberAdditions.basic(chat) && memberCount >= 0');
    expect(body('private async Task<object?> AddInfoAsync(', cable)).toContain('DesktopMemberAdditions.Remaining(kind, members)');
    // Un privado no se pregunta a la red: la regla de forma se resuelve en casa, como `applicable`.
    expect(cable).toContain('if (!DesktopMemberAdditions.Applicable(kind))');
    expect(rulesJava).toContain('static boolean applicable(TdApi.Chat chat)');
  });

  it('la hoja de opciones de Windows ofrece la firma, que era la única puerta vacía', () => {
    // Tres hojas la ofrecen: la del chat de Android, la del panel de la conversación abierta y la del escritorio.
    // Las dos primeras ya la tenían desde la ronda P; la tercera era la que quedaba, y dejaba el puente sin entrada.
    expect(app.split('label="Añadir personas"').length - 1).toBe(3);
    const sheet = body("onClick={()=>act('chat.pin',!chat.pinned)}", app, '\n    </div>});return;');
    expect(sheet).toContain("label=\"Añadir personas\" onClick={()=>{setDialog(undefined);openAddPeople(chat);}}");
    ordered(sheet, 'label="Ver miembros"', 'label="Añadir personas"', 'label="Administrar miembros"');
    // La guarda es la misma en las dos hojas que nombran la fila por `chat`: grupo, supergrupo o canal, y nada
    // de privados. La tercera hoja habla de la conversación abierta (`active.`), con las tres mismas formas.
    expect(count("(chat.type==='group'||chat.supergroup===true||chat.type==='channel')&&<MenuItem icon={<UserPlus/>} label=\"Añadir personas\"", app)).toBe(2);
    expect(sheet).toContain("{(chat.type==='group'||chat.supergroup===true||chat.type==='channel')&&<MenuItem icon={<UserPlus/>} label=\"Añadir personas\"");
  });
});

describe('ronda BB · las manos sobre el andamio', () => {
  let call: DesignCall;
  let selfId = '1';

  async function use(target: 'desktop' | 'android') {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: target, ready: true, name: 'Rodrigo' });
    selfId = fixture.selfId;
    call = designRequest as DesignCall;
  }

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);

  const batch = async (params: Record<string, unknown>) => await call('groups.member.add', params) as AddBatch;

  beforeEach(async () => { await use('desktop'); });

  it('veinticinco personas con un identificador mal escrito oyen lo que está mal', async () => {
    const ids = Array.from({ length: 24 }, (_, index) => String(9000 + index));
    expect(await ask('groups.member.add', { id: '18', userIds: [...ids, '0'] })).toBe(ADD_REJECTIONS.badId);
    expect(await ask('groups.member.add', { id: '18', userIds: ids })).toBe(ADD_REJECTIONS.tooMany);
    expect(await ask('groups.member.add', { id: '18', userIds: [] })).toBe(ADD_REJECTIONS.empty);
    expect(await ask('groups.member.add', { id: '18' })).toBe(ADD_REJECTIONS.empty);
  });

  it('un identificador fuera del rango de un `long` se descarta como identificador', async () => {
    expect(await ask('groups.member.add', { id: '18', userIds: ['9223372036854775808'] })).toBe(ADD_REJECTIONS.badId);
    expect(await ask('groups.member.add', { id: '18', userIds: ['9223372036854775807', '712'] })).not.toBe(ADD_REJECTIONS.badId);
    expect(await ask('groups.member.add', { id: '18', userIds: ['07'] })).toBe(ADD_REJECTIONS.badId);
    expect(await ask('groups.member.add', { id: '18', userIds: ['707', '712'] })).not.toBe(ADD_REJECTIONS.badId);
  });

  it('veinte personas sí caben y el margen escrito se acepta como número', async () => {
    const ids = Array.from({ length: 20 }, (_, index) => String(9000 + index));
    const value = await batch({ id: '18', userIds: ids, forwardLimit: '05' });
    expect(value.results.length).toBe(20);
    expect(value.results.every(item => item.state === 'added')).toBe(true);
    expect(value.stopped).toBe('');
  });

  it('el margen se corta donde lo corta el puente', async () => {
    expect(await ask('groups.member.add', { id: '18', userIds: ['712'], forwardLimit: '101' })).toBe(ADD_REJECTIONS.badForward);
    expect(await ask('groups.member.add', { id: '18', userIds: ['712'], forwardLimit: 'abc' })).toBe(ADD_REJECTIONS.badForward);
    expect(await ask('groups.member.add', { id: '18', userIds: ['712'], forwardLimit: 1000 })).toBe(ADD_REJECTIONS.badForward);
    expect(await ask('groups.member.add', { id: '18', userIds: ['712'], forwardLimit: '-1' })).toBe(ADD_REJECTIONS.badForward);
    expect((await batch({ id: '18', userIds: ['712'], forwardLimit: '100' })).results[0].state).toBe('added');
  });

  it('la propia cuenta y los repetidos no cuentan para el lote', async () => {
    const value = await batch({ id: '18', userIds: [selfId, '712', '712'] });
    expect(value.results.length).toBe(1);
    expect(value.results[0].id).toBe('712');
    expect(value.results[0].name).toBe('Iván Sotelo');
    // Veintidós entradas que son veinte personas menos la propia y un duplicado repetido: el lote cabe.
    const many = [selfId, '8000', ...Array.from({ length: 20 }, (_, index) => String(8000 + index))];
    expect((await batch({ id: '18', userIds: many })).results.length).toBe(20);
  });

  it('quien ya está dentro vuelve rechazado con la palabra de Telegram', async () => {
    const value = await batch({ id: '18', userIds: ['502'] });
    expect(value.results[0]).toEqual({ id: '502', name: 'María Fernández', state: 'rejected', reason: ADD_REJECTIONS.failed });
  });

  it('la única señal que la schema sabe dar es la de Premium', async () => {
    const value = await batch({ id: '18', userIds: ['707'] });
    expect(value.results[0].state).toBe('rejected');
    expect(value.results[0].reason).toBe(ADD_REJECTIONS.premiumWouldAllow);
    expect(outcomeLine(value.results[0])).toBe(`Nuria Cabrera · No añadido · ${ADD_REJECTIONS.premiumWouldAllow}`);
  });

  it('un privado no es un grupo: la nota dice por qué y no hay tanda', async () => {
    const info = await call('groups.add.info', { id: '11' }) as AddPermission;
    expect(info.allowed).toBe(false);
    expect(info.reason).toBe(ADD_REJECTIONS.unsupported);
    expect(info.forward).toBe(false);
    expect(info.remaining).toBe(-1);
    expect(await ask('groups.member.add', { id: '11', userIds: ['712'] })).toBe(ADD_REJECTIONS.unsupported);
    expect(await ask('groups.member.add', { id: '9999', userIds: ['712'] })).toBe(ADD_REJECTIONS.unsupported);
  });

  it('el historial solo se ofrece donde viaja y el hueco se cuenta con la lista entera', async () => {
    const basic = await call('groups.add.info', { id: '18' }) as AddPermission;
    expect(basic.allowed).toBe(true);
    expect(basic.forward).toBe(true);
    expect(basic.remaining).toBeGreaterThan(0);
    expect(basic.remaining).toBeLessThan(ADD_LIMITS.basic);
    for (const id of ['12', '24', '22', '14']) {
      const info = await call('groups.add.info', { id }) as AddPermission;
      expect(info.allowed).toBe(true);
      expect(info.forward).toBe(false);
      expect(info.remaining).toBe(-1);
    }
  });

  it('añadir entra a la persona en la lista del básico y le quita un hueco al reparto', async () => {
    const before = await call('groups.add.info', { id: '18' }) as AddPermission;
    const value = await batch({ id: '18', userIds: ['712', '718'] });
    expect(value.results.map(item => item.state)).toEqual(['added', 'added']);
    const roster = await call('groups.members.basic', { id: '18' }) as { members: { id: string; inside: boolean }[] };
    expect(roster.members.filter(row => row.inside).map(row => row.id)).toEqual(expect.arrayContaining(['712', '718']));
    const after = await call('groups.add.info', { id: '18' }) as AddPermission;
    expect(after.remaining).toBe(before.remaining - 2);
    expect(batchNotice(value)).toBe('Resultado en Telegram: 2 personas añadidas.');
  });

  it('el resumen cuenta por separado lo que Telegram confirmó, rechazó y dejó sin confirmar', async () => {
    const value = await batch({ id: '18', userIds: ['502', '707', '712'] });
    expect(batchNotice(value)).toBe('Resultado en Telegram: 1 persona añadida, 2 personas quedaron fuera.');
    expect(outcomeLine(value.results.find(item => item.id === '502') as AddResult))
      .toBe(`María Fernández · No añadido · ${ADD_REJECTIONS.failed}`);
    expect(batchNotice({ results: [], stopped: ADD_CANCELLED })).toBe(ADD_REJECTIONS.cancelled);
    expect(batchNotice({ results: [{ id: '9001', name: 'Usuario 9001', state: 'unclear', reason: ADD_REJECTIONS.unconfirmed }], stopped: '' }))
      .toBe('Resultado en Telegram: 1 sin confirmar.');
  });

  it('en la vista de Android el cortafuegos es el mismo: la pantalla no sabe de transportes', async () => {
    await use('android');
    const ids = Array.from({ length: 24 }, (_, index) => String(9000 + index));
    expect(await ask('groups.member.add', { id: '18', userIds: [...ids, 'x'] })).toBe(ADD_REJECTIONS.badId);
    expect(await ask('groups.member.add', { id: '22', userIds: ['712'], forwardLimit: '101' })).toBe(ADD_REJECTIONS.badForward);
    const info = await call('groups.add.info', { id: '22' }) as AddPermission;
    expect(info.forward).toBe(false);
    expect((await batch({ id: '22', userIds: ['712'] })).results[0].state).toBe('added');
  });
});
