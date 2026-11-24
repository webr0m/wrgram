import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { rosterNote } from './groupRoster';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const supergroup = text('../../desktop/src/WRGram.Desktop/DesktopGroupMembers.cs');
const roster = text('../../desktop/src/WRGram.Desktop/DesktopGroupRoster.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopGroupRosterFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const contract = text('./contract.ts');
const bridge = text('./bridge.ts');
const mirror = text('./desktopMembers.ts');
const groupRosterUi = text('./groupRoster.ts');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const basicJava = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BasicGroupRoster.java');
const actionJava = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BasicGroupMemberAction.java');

const lines = java.split('\n');
const rosterLines = basicJava.split('\n');
const actionLines = actionJava.split('\n');

/** Una línea de Android, contada desde 1. Sin aguja no hay prueba: se falla. */
function line(from: string[], number: number, label: string): string {
  const value = from[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de ${label}`);
  return value;
}
const javaLine = (number: number) => line(lines, number, 'NativeBridge');
const rosterLine = (number: number) => line(rosterLines, number, 'BasicGroupRoster');
const actionLine = (number: number) => line(actionLines, number, 'BasicGroupMemberAction');

/** El literal que una clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from: string): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de un `static final String` de Android. */
function javaSentence(name: string, from: string): string {
  const match = new RegExp(`static final String ${name} = "((?:[^"\\\\]|\\\\.)*)";`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name} en Android`);
  return match[1];
}

/** La frase dentro de un `answer.fail("...")` de una línea dada. */
function failSentence(number: number): string {
  const match = /answer\.fail\("((?:[^"\\]|\\.)*)"\)/.exec(javaLine(number));
  if (!match) throw new Error(`La línea ${number} de Android no falla con un literal`);
  return match[1];
}

/** El cuerpo de un método del puente de C#, con las llaves balanceadas. */
function csBody(name: string, from = cable): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  const brace = from.indexOf('{', start);
  const end = from.indexOf(';', start);
  // Un método resuelto en expresión (`=> …;`) no tiene bloque: pedirlo sería una aguja mal puesta.
  if (brace < 0 || (end >= 0 && end < brace)) throw new Error(`${name} se resuelve en una expresión, no en un bloque`);
  let depth = 0;
  for (let i = brace; i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Las claves que `object("a",…,"b",…)` escribe en una línea, en su orden. */
function objectKeys(source: string): string[] {
  return [...source.matchAll(/"([a-zA-Z]+)"/g)].map(match => match[1]);
}

/**
 * Si las claves aparecen en el texto de C# en el mismo orden, una detrás de otra. C# escribe la clave sola
 * cuando el valor se llama igual (`listed,`), así que las dos formas cuentan: lo que se prueba es el orden
 * de la fila, no la sintaxis con la que está dicha.
 */
function inOrder(body: string, keys: string[]): boolean {
  let cursor = 0;
  for (const key of keys) {
    const finder = new RegExp(`[\\s{,(]${key}\\s*(?:=|,)`, 'g');
    finder.lastIndex = cursor;
    const match = finder.exec(body);
    if (!match) return false;
    cursor = match.index + match[0].length;
  }
  return true;
}

// Medido hoy en `NativeBridge.java`: cada clave es la línea donde Android responde ese `answer.fail` literal.
const SUPERGROUP_REFUSALS = {
  Unsupported: '2806', TooLongQuery: '2808', NoRight: '2811', Unreadable: '2818',
} as const;

describe('ronda AX · las listas de miembros, cruzadas con las tres capas', () => {
  it('las cuatro frases fijas de la lista de supergrupo están letra por letra en la línea que citan', () => {
    for (const [name, number] of Object.entries(SUPERGROUP_REFUSALS)) {
      expect(csSentence(name, supergroup)).toBe(failSentence(Number(number)));
      expect(csSentence(name, supergroup)).toContain('');
    }
  });

  it('el filtro malo viaja desde el `IllegalArgumentException` de Android, no desde un literal nuevo', () => {
    // `:2813` mete la construcción del filtro en un `try` y devuelve `invalid.getMessage()`; la frase nace allí,
    // en `supergroupMembersFilter`/`chatMembersFilter` `:2789-2790`, así que se compara con la litera que
    // Android lanza y no con una inventada para Windows.
    const thrown = /throw new IllegalArgumentException\("Filtro de miembros no válido\."\)/;
    expect(thrown.test(line(lines, 2789, 'NativeBridge')) || thrown.test(line(lines, 2790, 'NativeBridge'))).toBe(true);
    expect(csSentence('BadFilter', supergroup)).toBe('Filtro de miembros no válido.');
    expect(line(lines, 2813, 'NativeBridge')).toContain('answer.fail(invalid.getMessage())');
  });

  it('el permiso se comprueba antes que el filtro, en el puente y en su espejo', () => {
    expect(Number(SUPERGROUP_REFUSALS.NoRight)).toBeLessThan(2813);
    const body = csBody('GroupMembersAsync');
    expect(body.indexOf('DesktopGroupMembers.NoRight')).toBeGreaterThanOrEqual(0);
    expect(body.indexOf('DesktopGroupMembers.NoRight')).toBeLessThan(body.indexOf('DesktopGroupMembers.Request('));
  });

  it('las cinco frases del básico están en las cinco líneas que cita la regla pura', () => {
    expect(csSentence('Unsupported', roster)).toBe(javaSentence('UNSUPPORTED', basicJava));
    expect(csSentence('Empty', roster)).toBe(javaSentence('EMPTY', basicJava));
    expect(csSentence('NoCreator', roster)).toBe(javaSentence('NO_CREATOR', basicJava));
    expect(csSentence('OrderNote', roster)).toBe(javaSentence('ORDER', basicJava));
    expect(csSentence('TooLongQuery', roster)).toBe(javaSentence('TOO_LONG', basicJava));
    expect(rosterLine(28)).toContain('static final String ORDER =');
    expect(roster).toContain('public const string OrderNote =');
  });

  it('las ocho frases de acción del básico están letra por letra en BasicGroupMemberAction', () => {
    const pairs: [string, string][] = [
      ['NoRight', 'NO_RIGHT'], ['Self', 'SELF'], ['CreatorProblem', 'CREATOR'], ['Outside', 'OUTSIDE'],
      ['NoRestrict', 'NO_RESTRICT'], ['NoPromote', 'NO_PROMOTE'], ['NoDuration', 'NO_DURATION'], ['Scope', 'SCOPE'],
      ['UnbanHint', 'UNBAN_HINT'], ['RevokeOn', 'REVOKE_ON'], ['RevokeOff', 'REVOKE_OFF'],
    ];
    for (const [csharp, android] of pairs) expect(csSentence(csharp, roster)).toBe(javaSentence(android, actionJava));
  });

  it('los siete estados del básico son los siete de Android y los seis del supergrupo los suyos', () => {
    for (const [csharp, android] of [['Propietario', 'CREATOR'], ['Administrador', 'ADMIN'], ['Miembro', 'MEMBER'],
      ['Restringido', 'RESTRICTED'], ['Salio', 'LEFT'], ['Baneado', 'BANNED'], ['SinEstado', 'UNKNOWN']] as [string, string][]) {
      expect(csSentence(csharp, roster)).toBe(javaSentence(android, basicJava));
    }
    expect(csSentence('StatusLeft', supergroup)).toBe(javaSentence('LEFT', basicJava));
  });

  it('la frase del diálogo de expulsión es la línea del `Dialogs` de Android, título y botón incluidos', () => {
    expect(javaLine(2902)).toContain('.setTitle("Expulsar de "+chat.title)');
    expect(javaLine(2904)).toContain('setPositiveButton("Expulsar"');
    expect(javaLine(2905)).toContain('"La conversación cambió. No se expulsó a nadie."');
    expect(csSentence('DialogAccept', roster)).toBe('Expulsar');
    // La frase de cuenta cambiada no está en la línea del botón: Android la responde dentro del `setPositiveButton`,
    // que arranca en la 2904 y la dice en la 2905. Medido sobre el archivo de hoy.
    expect(csSentence('ChangedAccount', roster)).toBe(failSentence(2905));
    expect(roster).toContain('public static string DialogTitle(string chatTitle) => "Expulsar de " + chatTitle;');
    const confirm = /"Se expulsará a " \+ name \+ " del grupo de forma definitiva\. " \+ \(revoke \? RevokeOn : RevokeOff\)/;
    expect(confirm.test(roster)).toBe(true);
    expect(actionLine(99)).toContain('"Se expulsará a " + name + " del grupo de forma definitiva. "');
    // El diálogo usa el título de Android, no el de la ficha de la comunidad.
    expect(csBody('BanBasicMemberAsync')).toContain('ConfirmPhoto(DesktopGroupRoster.DialogTitle(entry.Title)');
    expect(csBody('BanBasicMemberAsync')).not.toContain('ConfirmCommunity(');
  });

  it('los seis filtros de la pantalla son las seis teclas que el host traduce', () => {
    const filters = app.split('\n').find(row => row.startsWith('const MEMBER_FILTERS:'));
    if (!filters) throw new Error('Falta la fila de filtros de miembros en App.tsx');
    const keys = [...filters.matchAll(/\['([a-z]+)','[^']*'\]/g)].map(match => match[1]);
    expect(keys).toEqual(['recent', 'administrators', 'restricted', 'banned', 'bots', 'contacts']);
    for (const key of keys) expect(supergroup).toContain(`"${key}"`);
    expect(mirror).toContain("export const DESKTOP_MEMBER_FILTERS = ['recent', 'administrators', 'restricted', 'banned', 'bots', 'contacts'] as const;");
    // Los tres que en MTProto no llevan `q` son los que se filtran en casa.
    for (const key of ['administrators', 'bots']) {
      const arm = new RegExp(`"${key}" => new ChannelParticipants(Admins|Bots)\\(\\)`);
      expect(arm.test(supergroup)).toBe(true);
    }
    expect(supergroup).toContain('!(searching && (key is "administrators" or "bots"))');
  });

  it('los dos apretones y el tope de búsqueda son los de la línea 2809 y la 2808', () => {
    expect(javaLine(2809)).toContain('Math.max(0,Math.min(5000,');
    expect(javaLine(2809)).toContain('Math.max(1,Math.min(50,');
    expect(supergroup).toContain('public const int MaxOffset = 5000;');
    expect(supergroup).toContain('public const int MaxLimit = 50;');
    expect(supergroup).toContain('public const int MinLimit = 1;');
    expect(javaLine(2808)).toContain('if(query.length()>80)');
    expect(supergroup).toContain('public static bool TooLong(string? query) => (query ?? "").Length > MaxQuery;');
    // El básico recorta antes de medir (`BasicGroupRoster.java:97`): dos caminos, dos reglas.
    expect(rosterLine(97)).toContain('query.trim().length() > MAX_QUERY');
    expect(roster).toContain('public static bool TooLong(string? query) => (query ?? "").Trim().Length > MaxQuery;');
  });

  it('las dieciséis claves de una fila de supergrupo son las de `memberDto`, en su orden', () => {
    const keys = objectKeys(javaLine(2801));
    expect(keys.length).toBeGreaterThanOrEqual(15);
    expect(inOrder(csBody('Row', supergroup), keys)).toBe(true);
    const ui = /export interface GroupMember \{([^}]*)\}/.exec(contract);
    if (!ui) throw new Error('Falta GroupMember en el contrato');
    expect(ui[1].split(';').map(field => field.trim().split(/[:?]/)[0])).toEqual(keys);
  });

  it('las once claves del básico son las de `writeRoster` y las del envoltorio las diez de la respuesta', () => {
    const rowKeys = objectKeys(`${javaLine(2851)} ${javaLine(2852)} ${javaLine(2853)} ${javaLine(2854)} ${javaLine(2855)}`);
    expect(rowKeys).toEqual(['id', 'name', 'username', 'status', 'inside', 'self', 'bot', 'since', 'invitedBy', 'invitedByName', 'tag']);
    expect(inOrder(csBody('Row', roster), rowKeys)).toBe(true);
    const answerKeys = objectKeys(`${javaLine(2857)} ${javaLine(2858)} ${javaLine(2859)} ${javaLine(2860)} ${javaLine(2861)}`);
    expect(answerKeys).toEqual(['members', 'shown', 'listed', 'inside', 'creator', 'note', 'remaining', 'order', 'manage', 'scope']);
    expect(inOrder(csBody('BasicRosterAsync'), answerKeys)).toBe(true);
    expect(answerKeys.length).toBe(10);
  });

  it('el desplazamiento cuenta lo devuelto y se corta al buscar, igual que la línea 2816', () => {
    expect(javaLine(2816)).toContain('int received=result.members==null?0:result.members.length');
    expect(javaLine(2816)).toContain('int next=query.trim().isEmpty()?offset+received:0');
    const page = csBody('Page', supergroup);
    expect(page).toContain('var next = searching ? 0 : offset + received;');
    expect(csBody('GroupMembersAsync')).toContain('var received = answer.participants?.Length ?? 0;');
  });

  it('lo que MTProto no publica en un básico está escrito como divergencia, no imitado', () => {
    expect(roster).toContain('ChatParticipant.Flags');
    expect(roster).toContain('no existe bandera de');
    expect(csBody('Status', roster)).toContain('ChatParticipantCreator => Propietario');
    expect(csBody('Status', roster)).toContain('ChatParticipantAdmin => Administrador');
    // La administración de un básico no tiene tabla de derechos que leer: `mayRemove` se traduce con la salvedad.
    expect(actionLine(48)).toContain('rights.canRestrictMembers');
    expect(roster).toContain('public static bool MayRemove(ChatParticipantBase? self) =>\n        self is ChatParticipantCreator or ChatParticipantAdmin;');
  });

  it('los ocho métodos están en la lista del puente y en el despacho de Windows', () => {
    const arms = ['"groups.members" => await GroupMembersAsync(args, page: false)',
      '"groups.members.page" => await GroupMembersAsync(args, page: true)',
      '"groups.members.basic" => await BasicRosterAsync(args)',
      '"groups.member.ban" => await BanMemberAsync(args)',
      '"groups.member.restrict" => await RestrictMemberAsync(args)',
      '"groups.member.promote" => await PromoteMemberAsync(args)',
      '"groups.member.demote" => await DemoteMemberAsync(args)',
      '"groups.member.unban" => await LiftMemberAsync(args)'];
    for (const arm of arms) expect(service).toContain(arm);
    for (const method of ['groups.members', 'groups.members.page', 'groups.members.basic', 'groups.member.ban',
      'groups.member.restrict', 'groups.member.promote', 'groups.member.demote', 'groups.member.unban']) {
      expect(policy).toContain(`"${method}"`);
    }
    for (const method of ['groups.member.ban', 'groups.member.unban', 'groups.member.restrict', 'groups.member.promote', 'groups.member.demote']) {
      expect(bridge).toContain(`'${method}'`);
    }
  });

  it('la negación de una escritura fuera de forma es la de Telegram, y ya no queda hueco de WRGram', () => {
    // La ronda AZ conectó las cuatro escrituras de comunidad, así que `WriteProblem` dejó de nombrar un
    // pendiente propio: solo decide si la negación es la del básico o la de «esto no es una comunidad».
    expect(roster).not.toContain('SanctionsPending');
    expect(roster).toMatch(/WriteProblem\(DesktopMembership\.Kind kind, string basicProblem\) =>\s*\n\s*kind == DesktopMembership\.Kind\.Basic \? basicProblem : DesktopMemberSanctions\.RequiresSupergroup;/);
    expect(csBody('BanMemberAsync')).toContain('if (kind == DesktopMembership.Kind.Basic) return await BanBasicMemberAsync(args, client, entry, owner);');
    expect(csBody('BanMemberAsync')).toContain('return await SanctionAsync(args, false, client, entry, owner);');
  });

  it('la pantalla pinta en Windows las seis acciones, que ya tienen brazo en el puente', () => {
    // Y las dos listas mantienen su puerta: la hoja de opciones, porque el panel lateral lo abre
    // `chatInfo`, que corta en escritorio, y la ficha de la persona pide un método que el puente no responde.
    const desktopSheet = app.slice(app.indexOf('function chatMenu(chat:Chat){'), app.indexOf('const action=(method:string,value:boolean)'));
    expect(desktopSheet).toContain('{chat.type===\'group\'&&chat.supergroup!==true&&<MenuItem icon={<Users/>} label="Ver miembros" onClick={()=>{setDialog(undefined);openGroupRoster(chat);}}/>}');
    expect(desktopSheet).toContain('{(chat.supergroup===true||chat.type===\'channel\')&&<MenuItem icon={<ShieldCheck/>} label="Administrar miembros" onClick={()=>{setDialog(undefined);openGroupMembers(chat);}}/>}');
    expect(app).toContain('function GroupAdmin({chat,run,sanction,promote,demote,unban,revenue}:{chat:Chat;run:Run;');
    expect(app).toContain('body:<GroupAdmin chat={chat} run={run} sanction=');
    expect(app.slice(app.indexOf('function GroupAdmin'),app.indexOf('function MemberSanctionDialog'))).not.toContain('{!desktop&&<>');
    expect(app).not.toContain('DESKTOP_MEMBER_REFUSALS.sanctions');
    expect(app).toContain('{member.canUnban&&<button className="text-button" onClick={()=>unban(member)}>{liftTitle(!!member.banned)}</button>}');
    expect(app).toContain('.catch(report)}');
    expect(app).toContain("setError(reason instanceof Error?reason.message:'Telegram no devolvió la lista de este chat.')");
  });

  it('el andamio espeja las ramas de escritorio con las frases del puente', () => {
    expect(preview).toContain("import { DESKTOP_MEMBER_REFUSALS, desktopMemberFilterProblem, desktopMemberQueryProblem, isSupergroupOrChannel } from './desktopMembers';");
    expect(preview).toContain("if (!isSupergroupOrChannel(chat)) throw new Error(DESKTOP_MEMBER_REFUSALS.notCommunity);");
    expect(preview).toContain('const tooLong = desktopMemberQueryProblem(String(params.query ?? \'\'));');
    expect(preview).toContain('const badFilter = desktopMemberFilterProblem(String(params.filter || \'recent\'));');
    expect(preview).toContain('if (state.platform === \'desktop\') return desktopSanction(params, state, false);');
    expect(preview).toContain('if (state.platform === \'desktop\') return desktopLift(params, state);');
    // En un básico la negación sigue siendo la de Telegram, en las dos capas.
    const section = preview.slice(preview.indexOf("if (method === 'groups.member.restrict'"));
    const block = section.slice(0, section.indexOf("if (method === 'groups.member.unban')"));
    expect(block.indexOf('BAN_ACTIONS.noRestrict')).toBeLessThan(block.indexOf("state.platform === 'desktop'"));
  });

  it('las frases del espejo son las del puente, letra por letra', () => {
    expect(mirrorSentence('notCommunity')).toBe(csSentence('Unsupported', supergroup));
    expect(mirrorSentence('longQuery')).toBe(csSentence('TooLongQuery', supergroup));
    expect(mirrorSentence('longQuery')).toBe(csSentence('TooLongQuery', roster));
    expect(mirrorSentence('noRight')).toBe(csSentence('NoRight', supergroup));
    expect(mirrorSentence('badFilter')).toBe(csSentence('BadFilter', supergroup));
    expect(mirrorSentence('unreadable')).toBe(csSentence('Unreadable', supergroup));
    expect(mirrorSentence('noHash')).toBe(csSentence('NoHash', roster));
    expect(mirrorSentence('notCommunity')).toBe('La administración solo está disponible en supergrupos y canales.');
  });

  it('la lista del básico y la del supergrupo no se pisan: cada una niega la forma contraria', () => {
    expect(csSentence('Unsupported', roster)).toBe(javaSentence('UNSUPPORTED', basicJava));
    expect(preview).toContain('if (!chat || chat.type !== \'group\' || chat.supergroup === true) throw new Error(ROSTER_NOTES.unsupported);');
    expect(csBody('BasicRosterAsync')).toContain('if (!DesktopGroupRoster.Supported(kind)) throw new BridgeException(DesktopGroupRoster.Unsupported);');
    expect(csBody('GroupMembersAsync')).toContain('if (!DesktopGroupMembers.Supported(kind)) throw new BridgeException(DesktopGroupMembers.Unsupported);');
    expect(roster).toContain('public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Basic;');
    expect(supergroup).toContain('public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Channel;');
  });

  it('la palabra del espejo de Android en el navegador sigue valiendo para las cuatro frases del básico', () => {
    expect(groupRosterUi).toContain(`unsupported: '${csSentence('Unsupported', roster)}'`);
    expect(groupRosterUi).toContain(`tooLong: '${csSentence('TooLongQuery', roster)}'`);
    expect(groupRosterUi).toContain(`order: '${csSentence('OrderNote', roster)}'`);
    expect(groupRosterUi).toContain(`scope: '${csSentence('Scope', roster)}'`);
  });
});

function mirrorSentence(name: string): string {
  const match = new RegExp(`  ${name}: '((?:[^'\\\\]|\\\\.)*)',`).exec(mirror);
  if (!match) throw new Error(`Falta la frase ${name} en el espejo`);
  return match[1];
}

type Member = { id: string; name: string; status: string; canBan?: boolean; canUnban?: boolean; canRestrict?: boolean; canPromote?: boolean; banned?: boolean; restricted?: boolean; until?: number };
type MemberPage = { members: Member[]; nextOffset: number; hasMore: boolean };
type Roster = { members: Member[]; shown: number; listed: number; inside: number; creator: string; note: string; remaining: number; order: string; manage: boolean; scope: string };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AX · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let platform: 'desktop' | 'android' = 'desktop';

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);

  async function use(target: 'desktop' | 'android') {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: target, ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    platform = target;
  }

  beforeEach(async () => { await use('desktop'); });

  it('leer la página de un supergrupo trae filas con la forma que consume la pantalla', async () => {
    const page = await call('groups.members.page', { id: '14', query: '', filter: 'recent', offset: 0, limit: 50 }) as MemberPage;
    expect(Array.isArray(page.members)).toBe(true);
    expect(page.members.length).toBeGreaterThan(0);
    expect(typeof page.nextOffset).toBe('number');
    expect(typeof page.hasMore).toBe('boolean');
    for (const row of page.members) expect(typeof row.name).toBe('string');
  });

  it('un básico no administra por la vía del supergrupo, en las dos capas', async () => {
    for (const method of ['groups.members', 'groups.members.page']) {
      const message = await ask(method, { id: '18', query: '', filter: 'recent', offset: 0, limit: 50 });
      if (platform === 'desktop') {
        expect(message).toBe('La administración solo está disponible en supergrupos y canales.');
      } else if (method === 'groups.members') {
        expect(Array.isArray(message)).toBe(true);
      }
    }
  });

  it('una búsqueda de 81 caracteres se niega antes de preguntar a Telegram, y una de 80 pasa', async () => {
    const long = 'a'.repeat(81);
    const message = await ask('groups.members.page', { id: '14', query: long, filter: 'recent', offset: 0, limit: 50 });
    if (platform === 'desktop') expect(message).toBe('La búsqueda de miembros admite hasta 80 caracteres.');
    else expect(typeof message).toBe('object');
    const justFits = await call('groups.members.page', { id: '14', query: 'a'.repeat(80), filter: 'recent', offset: 0, limit: 50 });
    expect(justFits).toBeTruthy();
  });

  it('un filtro que la pantalla no conoce se niega con la frase del puente en Windows', async () => {
    const message = await ask('groups.members.page', { id: '14', query: '', filter: 'desaparecidos', offset: 0, limit: 50 });
    if (platform === 'desktop') expect(message).toBe('Filtro de miembros no válido.');
    else expect(typeof message).toBe('object');
  });

  it('la lista entera del básico trae las diez claves y las dos cifras separadas', async () => {
    const value = await call('groups.members.basic', { id: '18', query: '' }) as Roster;
    expect(Object.keys(value)).toEqual(['members', 'shown', 'listed', 'inside', 'creator', 'note', 'remaining', 'order', 'manage', 'scope']);
    expect(value.listed).toBeGreaterThanOrEqual(value.inside);
    expect(value.members.length).toBe(value.shown);
    expect(value.creator).toBe('500');
    expect(typeof value.manage).toBe('boolean');
    expect(value.scope).toBe('En un grupo básico Telegram solo permite expulsar o invitar: no hay permisos parciales ni administración a la carta.');
    expect(Object.keys(value.members[0])).toEqual(['id', 'name', 'username', 'status', 'inside', 'self', 'bot', 'since', 'invitedBy', 'invitedByName', 'tag']);
  });

  it('la lista del básico busca en casa y dice cuántos no coinciden', async () => {
    const all = await call('groups.members.basic', { id: '18', query: '' }) as Roster;
    const found = await call('groups.members.basic', { id: '18', query: 'rosa' }) as Roster;
    expect(found.members.every(member => member.name.toLowerCase().includes('rosa'))).toBe(true);
    expect(found.shown).toBeLessThan(all.shown);
    expect(found.note).toBe(all.note);
    const none = await call('groups.members.basic', { id: '18', query: 'zzz-no-existe' }) as Roster;
    expect(none.shown).toBe(0);
    expect(none.listed).toBe(all.listed);
  });

  it('el básico no admite plazo, y la nota lo dice en las dos capas', async () => {
    const message = await ask('groups.member.ban', { id: '18', userId: '502', duration: 3600, deleteMessages: false });
    expect(message).toBe('La expulsión de un grupo básico no tiene plazo: siempre es definitiva.');
  });

  it('expulsar a uno mismo, al creador o al que ya se fue se niega con la frase de Android', async () => {
    expect(await ask('groups.member.ban', { id: '18', userId: '1', duration: 0, deleteMessages: false }))
      .toBe('No te expulses a ti mismo desde la lista: para salir usa «Salir del grupo».');
    expect(await ask('groups.member.ban', { id: '18', userId: '500', duration: 0, deleteMessages: false }))
      .toBe('Al creador del grupo no se le expulsa: solo puede salir él.');
    expect(await ask('groups.member.ban', { id: '18', userId: '509', duration: 0, deleteMessages: false }))
      .toBe('Esta persona ya no está dentro del grupo: no hay nada que expulsar.');
  });

  it('expulsar de un básico funciona en Windows, que es lo que esta ronda trajo', async () => {
    expect(await call('groups.member.ban', { id: '18', userId: '503', duration: 0, deleteMessages: true })).toBe(true);
    const after = await call('groups.members.basic', { id: '18', query: '' }) as Roster;
    expect(after.inside).toBeLessThan(after.listed);
    expect(after.note).toBe(rosterNote(after.creator, after.listed, after.inside));
  });

  it('en un canal la expulsión se escribe y la fila pasa al filtro de baneados', async () => {
    expect(await call('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false })).toBe(true);
    const page = await call('groups.members.page', { id: '14', query: '', filter: 'banned', offset: 0, limit: 50 }) as MemberPage;
    expect(page.members.some(member => member.id === '502' && member.banned === true && member.status === 'Baneado')).toBe(true);
  });

  it('restringir, promover y despromover se niegan en el básico con la palabra de Telegram en las dos capas', async () => {
    expect(await ask('groups.member.restrict', { id: '18', userId: '503', duration: 0, deleteMessages: false }))
      .toBe('En un grupo básico Telegram no admite restricciones parciales: o expulsa o no hace nada.');
    for (const method of ['groups.member.promote', 'groups.member.demote']) {
      expect(await ask(method, { id: '18', userId: '503' }))
        .toBe('En un grupo básico la administración no se reparte en permisos: Telegram solo permite elegirlos en supergrupos y canales.');
    }
    expect(await ask('groups.member.unban', { id: '18', userId: '510' }))
      .toBe('Para que vuelva, invítalo de nuevo desde la tanda: en un grupo básico no hay baneo que levantar.');
  });

  it('fuera del básico las cuatro escrituras se aplican, cada una sobre su fila', async () => {
    expect(await call('groups.member.restrict', { id: '14', userId: '502', duration: 3600, deleteMessages: false })).toBe(true);
    expect(await call('groups.member.unban', { id: '14', userId: '503' })).toBe(true);
    expect(await call('groups.member.promote', { id: '14', userId: '503', canChangeInfo: true, canDeleteMessages: true })).toBe(true);
    expect(await call('groups.member.demote', { id: '14', userId: '501' })).toBe(true);
  });

  it('la lista entera no se pide a un supergrupo, aquí y en Android', async () => {
    expect(await ask('groups.members.basic', { id: '14', query: '' }))
      .toBe('La lista entera de un chat solo la da Telegram en los grupos básicos; en supergrupos y canales se pide por páginas.');
    expect(await ask('groups.members.basic', { id: '11', query: '' }))
      .toBe('La lista entera de un chat solo la da Telegram en los grupos básicos; en supergrupos y canales se pide por páginas.');
  });

  it('un canal también se administra, y `groups.members` sin página responde la array simple', async () => {
    const rows = await call('groups.members', { id: '22' }) as Member[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(platform).toBe('desktop');
  });
});

describe('ronda AX · el mismo andamio visto desde Android', () => {
  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'android', ready: true, name: 'Rodrigo' });
    const call = designRequest as DesignCall;
    const page = await call('groups.members.page', { id: '14', query: '', filter: 'recent', offset: 0, limit: 50 }) as MemberPage;
    expect(page.members.length).toBeGreaterThan(0);
  });

  it('en Android la expulsión de un canal sigue mandándose: la negación es solo de Windows', async () => {
    const { designRequest } = await import('./preview');
    const call = designRequest as DesignCall;
    expect(await call('groups.member.ban', { id: '14', userId: '503', duration: 0, deleteMessages: false })).toBe(true);
    expect(await call('groups.member.promote', { id: '14', userId: '503' })).toBe(true);
  });
});
