import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  ADMIN_RIGHT_RULES, ADMIN_RIGHT_SUMMARY, NO_ADMIN_RIGHTS, SANCTION_DURATION, SANCTION_LABELS, SANCTION_REFUSALS,
  adminRightsSummary, demoteBody, liftBody, liftTitle, promoteBody, promoteTitle, requestedRights, sanctionAction,
  sanctionBody, sanctionDurationLabel, sanctionTitle,
} from './memberSanctions';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopMemberSanctions.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopMemberSanctionFlow.cs');
const supergroup = text('../../desktop/src/WRGram.Desktop/DesktopGroupMembers.cs');
const roster = text('../../desktop/src/WRGram.Desktop/DesktopGroupRoster.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const mirror = text('./memberSanctions.ts');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

const lines = java.split('\n');

/** Una línea de Android, contada desde 1. Sin aguja no hay prueba: se falla. */
function line(number: number): string {
  const value = lines[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return value;
}

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}

/** El cuerpo de un método de C#, con las llaves balanceadas. */
function csBody(name: string, from = cable): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  const brace = from.indexOf('{', start);
  const end = from.indexOf(';', start);
  if (brace < 0 || (end >= 0 && end < brace)) throw new Error(`${name} se resuelve en una expresión, no en un bloque`);
  let depth = 0;
  for (let i = brace; i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Si la línea de Android lleva esa frase escrita como literal entero. */
const says = (number: number, phrase: string) => line(number).includes(`"${phrase}"`);

/** Y si la lleva partida por una concatenación, se comprueban los pedazos en orden. */
function saysInParts(number: number, ...parts: string[]): void {
  const row = line(number);
  let cursor = 0;
  for (const part of parts) {
    const at = row.indexOf(`"${part}"`, cursor);
    if (at < 0) throw new Error(`La línea ${number} de Android no dice "${part}"`);
    cursor = at + part.length;
  }
}

/** Las dieciséis filas de `Actor.Delegable`, con su bandera de MTProto y su puerta. */
function delegable(): { key: string; right: string; gate: string }[] {
  const start = supergroup.indexOf('Delegable =');
  if (start < 0) throw new Error('Falta la tabla de delegación');
  const block = supergroup.slice(start, supergroup.indexOf('};', start));
  return [...block.matchAll(/\("([a-zA-Z]+)", "([a-z_]+)", Gate\.(\w+)\)/g)]
    .map(match => ({ key: match[1], right: match[2], gate: match[3].toLowerCase() }));
}

/** La frase con la que el reparto de permisos se niega; vacía cuando sí reparte. */
function refusal(result: ReturnType<typeof requestedRights>): string {
  return result.ok ? '' : result.problem;
}

const SANCTIONS = {
  requiresSupergroup: 'RequiresSupergroup', badDuration: 'BadDuration', channelNoRestrict: 'ChannelNoRestrict',
  noRestrictRight: 'NoRestrictRight', noDeleteRight: 'NoDeleteRight', noLiftRight: 'NoLiftRight',
  noPromoteRight: 'NoPromoteRight', noDemoteRight: 'NoDemoteRight', selfMenu: 'SelfMenu', selfList: 'SelfList',
  selfRole: 'SelfRole', selfDemote: 'SelfDemote', notSanctionable: 'NotSanctionable', notLiftable: 'NotLiftable',
  notPromotable: 'NotPromotable', notEditableAdmin: 'NotEditableAdmin', noDelegation: 'NoDelegation',
  incompatibleRight: 'IncompatibleRight', noRightSelected: 'NoRightSelected', revokeFailed: 'RevokeFailed',
  needsHash: 'NeedsHash',
} as const;

describe('ronda AZ · las cinco escrituras de una fila, cruzadas con las tres capas', () => {
  it('las veintiuna negaciones del espejo son las del puente, letra por letra', () => {
    for (const [key, constant] of Object.entries(SANCTIONS)) {
      expect(SANCTION_REFUSALS[key as keyof typeof SANCTION_REFUSALS]).toBe(csSentence(constant));
    }
  });

  it('cada negación es la palabra de Android en la línea que la dice', () => {
    // `:2899` (banear y restringir), `:2866` (levantar), `:2871` (promover), `:2872` (despromover) y `:2869` (el reparto).
    const plain: [number, keyof typeof SANCTION_REFUSALS][] = [
      [2899, 'requiresSupergroup'], [2899, 'selfMenu'], [2899, 'badDuration'], [2899, 'channelNoRestrict'],
      [2899, 'noRestrictRight'], [2899, 'noDeleteRight'], [2899, 'notSanctionable'], [2899, 'revokeFailed'],
      [2866, 'selfList'], [2866, 'noLiftRight'], [2866, 'notLiftable'],
      [2871, 'selfRole'], [2871, 'noPromoteRight'], [2871, 'notPromotable'],
      [2872, 'selfDemote'], [2872, 'noDemoteRight'], [2872, 'notEditableAdmin'],
      [2869, 'noDelegation'], [2869, 'incompatibleRight'], [2869, 'noRightSelected'],
    ];
    for (const [number, key] of plain) expect(says(number, SANCTION_REFUSALS[key])).toBe(true);
    // Las cuatro líneas repiten la guarda de forma con la misma cadena, y `NeedsHash` es la única que no existe allá.
    for (const number of [2866, 2871, 2872]) expect(says(number, SANCTION_REFUSALS.requiresSupergroup)).toBe(true);
    expect(SANCTION_REFUSALS.needsHash).toBe(csSentence('NeedsHash'));
    // Y el `NoHash` del básico sigue con su palabra de expulsar: esta ronda no lo reescribió.
    expect(csSentence('NoHash', roster)).toBe('Telegram no dio los datos necesarios para expulsar a esta persona. Vuelve a abrir la lista e inténtalo de nuevo.');
  });

  it('los diez rótulos de los cuadros son los de Android, y el espejo los dice una sola vez', () => {
    expect(SANCTION_LABELS.restrict).toBe(csSentence('Restrict'));
    expect(SANCTION_LABELS.ban).toBe(csSentence('Ban'));
    expect(SANCTION_LABELS.liftBan).toBe(csSentence('LiftBan'));
    expect(SANCTION_LABELS.liftRestriction).toBe(csSentence('LiftRestriction'));
    expect(SANCTION_LABELS.promote).toBe(csSentence('Promote'));
    expect(SANCTION_LABELS.saveRights).toBe(csSentence('SaveRights'));
    expect(SANCTION_LABELS.nameAdmin).toBe(csSentence('NameAdmin'));
    expect(SANCTION_LABELS.editRights).toBe(csSentence('EditRightsTitle'));
    expect(SANCTION_LABELS.demote).toBe(csSentence('DemoteTitle'));
    expect(SANCTION_LABELS.removeRole).toBe(csSentence('RemoveRole'));
    for (const label of ['Restringir', 'Banear', 'Quitar baneo', 'Quitar restricción', 'Promover', 'Guardar permisos',
      'Promover a administrador', 'Editar permisos de administrador', 'Quitar administración', 'Quitar rol']) {
      const quoted = `"${label}"`;
      const times = [2899, 2866, 2871, 2872].reduce((total, number) => total + line(number).split(quoted).length - 1, 0);
      expect(times).toBeGreaterThan(0);
    }
  });

  it('el plazo por defecto y sus dos bordes salen de la misma línea', () => {
    expect(SANCTION_DURATION.default).toBe(3600);
    expect(SANCTION_DURATION.min).toBe(60);
    expect(SANCTION_DURATION.max).toBe(366 * 86400);
    expect(rules).toContain('public const long DefaultDuration = 3600;');
    expect(rules).toContain('public const long MinDuration = 60;');
    expect(rules).toContain('public const long MaxDuration = 366L * 86400;');
    expect(line(2899)).toContain('params.optLong("duration",3600)');
    expect(line(2899)).toContain('duration<60||duration>366L*86400');
  });

  it('las cuatro frases del cuadro están en las tres capas, partidas o enteras', () => {
    expect(sanctionTitle(false, 'Sofía López')).toBe('Banear a Sofía López');
    expect(sanctionTitle(true, 'Sofía López')).toBe('Restringir a Sofía López');
    expect(sanctionAction(true)).toBe(SANCTION_LABELS.restrict);
    expect(rules).toContain('public static string BanTitle(bool restrict, string name) => BanAction(restrict) + " a " + name;');
    saysInParts(2899, ' a ', '. ', 'Telegram validará el cambio en la cuenta.');
    expect(line(2899)).toContain('.setTitle(action+" a "+name)');
    expect(sanctionBody(true, 'María', 3600, false))
      .toBe('Se quitarán los permisos de envío a María durante 1 hora(s). No se borrarán mensajes. Telegram validará el cambio en la cuenta.');
    expect(sanctionBody(false, 'María', 0, true))
      .toBe('Se expulsará a María de forma permanente. También se borrarán todos los mensajes que envió en este chat. Telegram validará el cambio en la cuenta.');
    expect(liftTitle(true)).toBe('Quitar baneo');
    expect(liftTitle(false)).toBe('Quitar restricción');
    expect(liftBody('María')).toBe('Se restaurará el acceso completo de María a este grupo o canal. No se enviará una invitación.');
    saysInParts(2866, 'Se restaurará el acceso completo de ', ' a este grupo o canal. No se enviará una invitación.');
    expect(promoteTitle(true)).toBe('Editar permisos de administrador');
    expect(promoteTitle(false)).toBe('Promover a administrador');
    expect(promoteBody(false, 'María', { canChangeInfo: true, canInviteUsers: true }))
      .toBe('Se otorgarán a María: editar información, invitar miembros. Telegram volverá a validar tu autoridad.');
    saysInParts(2871, 'Se actualizarán los permisos de ', 'Se otorgarán a ', '. Telegram volverá a validar tu autoridad.');
    expect(demoteBody('Álex')).toBe('Álex dejará de ser administrador y conservará su membresía normal.');
    saysInParts(2872, ' dejará de ser administrador y conservará su membresía normal.');
  });

  it('el plazo del cuadro se lee como lo lee Android: cero, días, horas, minutos', () => {
    expect(sanctionDurationLabel(0)).toBe('de forma permanente');
    expect(sanctionDurationLabel(86400 * 3)).toBe('durante 3 día(s)');
    expect(sanctionDurationLabel(3600 * 5)).toBe('durante 5 hora(s)');
    expect(sanctionDurationLabel(120)).toBe('durante 2 minuto(s)');
    expect(line(2873)).toContain('if(seconds==0)return "de forma permanente"');
    expect(line(2873)).toContain('"durante "+(seconds/86400)+" día(s)"');
    expect(line(2873)).toContain('"durante "+(seconds/3600)+" hora(s)"');
    expect(line(2873)).toContain('"durante "+(seconds/60)+" minuto(s)"');
  });

  it('las dieciséis etiquetas del resumen son las de `adminRightsSummary`, en su orden', () => {
    const labels = [...line(2870).matchAll(/labels\.add\("([^"]+)"\)/g)].map(match => match[1]);
    expect(labels.length).toBe(16);
    expect(ADMIN_RIGHT_RULES.map(entry => ADMIN_RIGHT_SUMMARY[entry.key])).toEqual(labels);
    expect(adminRightsSummary({ canRestrictMembers: true, canManageTopics: true })).toBe('restringir miembros, gestionar temas');
    expect(adminRightsSummary(NO_ADMIN_RIGHTS)).toBe('');
  });

  it('la tabla de delegación es una sola: la que pinta la lista es la que acepta la escritura', () => {
    const table = delegable();
    expect(table.length).toBe(16);
    expect(table.map(entry => entry.key)).toEqual(ADMIN_RIGHT_RULES.map(entry => entry.key));
    expect(table.map(entry => entry.gate)).toEqual(ADMIN_RIGHT_RULES.map(entry => entry.gate));
    // Y el cable la usa para leer las casillas, en lugar de volver a enumerarlas.
    expect(cable).toContain('DesktopGroupMembers.Actor.Delegable.ToDictionary(entry => entry.Key, entry => Bool(args, entry.Key))');
    expect(rules.match(/DesktopGroupMembers\.Actor\.Delegable\.Any/g)?.length).toBe(2);
  });

  it('la puerta de cada permiso es la fórmula de índices de Android', () => {
    const fields = /String\[\] fields=\{([^}]*)\}/.exec(line(2869))![1].split(',').map(name => name.replace(/"/g, ''));
    expect(fields).toEqual(ADMIN_RIGHT_RULES.map(entry => entry.key));
    const formula = /if\(channel&&\(([^)]+)\)\|\|!channel&&\(([^)]+)\)\|\|!forum&&([^)]+)\)/.exec(line(2869));
    if (!formula) throw new Error('La guarda de permisos de Android ya no tiene la forma de índices');
    const indexes = (group: string) => [...group.matchAll(/values\[(\d+)\]/g)].map(match => Number(match[1]));
    const [noChannel, noCommunity, noForum] = [formula[1], formula[2], formula[3]].map(indexes);
    // De las tres negaciones sale la puerta afirmativa, en el mismo orden en que las comprueba Android.
    const expected = fields.map((_, index) => noForum.includes(index) ? 'forum'
      : noChannel.includes(index) ? 'community' : noCommunity.includes(index) ? 'channel' : 'any');
    expect(ADMIN_RIGHT_RULES.map(entry => entry.gate)).toEqual(expected);
  });

  it('el reparto de permisos hereda lo que no se puede delegar y veta la administración vacía', () => {
    const granted = { ...NO_ADMIN_RIGHTS, canChangeInfo: true, canPinMessages: true, canEditMessages: true, canManageTopics: true };
    const inChannel = { ...NO_ADMIN_RIGHTS, canPostMessages: true, canPinMessages: true, canManageTopics: true };
    expect(requestedRights({ canChangeInfo: true }, granted, null, false, false)).toEqual({ ok: true, rights: { ...NO_ADMIN_RIGHTS, canChangeInfo: true } });
    expect(refusal(requestedRights({ canManageTags: true }, granted, null, false, false))).toBe(SANCTION_REFUSALS.noDelegation);
    // La puerta del tipo de chat solo se consulta en lo que sí se puede delegar: un permiso que la cuenta no tiene
    // se corta antes por la regla de delegación, aunque tampoco exista en este chat.
    expect(refusal(requestedRights({ canPostMessages: true }, granted, null, false, false))).toBe(SANCTION_REFUSALS.noDelegation);
    expect(refusal(requestedRights({ canPostMessages: true }, inChannel, null, false, false))).toBe(SANCTION_REFUSALS.incompatibleRight);
    expect(requestedRights({ canPostMessages: true }, inChannel, null, true, false)).toEqual({ ok: true, rights: { ...NO_ADMIN_RIGHTS, canPostMessages: true } });
    expect(refusal(requestedRights({ canPinMessages: true }, inChannel, null, true, false))).toBe(SANCTION_REFUSALS.incompatibleRight);
    expect(refusal(requestedRights({ canManageTopics: true }, granted, null, false, false))).toBe(SANCTION_REFUSALS.incompatibleRight);
    expect(requestedRights({ canManageTopics: true }, granted, null, false, true)).toEqual({ ok: true, rights: { ...NO_ADMIN_RIGHTS, canManageTopics: true } });
    expect(refusal(requestedRights({}, granted, null, false, false))).toBe(SANCTION_REFUSALS.noRightSelected);
    // Editar: lo que la cuenta no tiene se conserva tal como lo devolvió Telegram, aunque nadie lo pida ahora.
    const kept = requestedRights({}, granted, { ...NO_ADMIN_RIGHTS, canManageTags: true }, false, false);
    expect(kept.ok && kept.rights.canManageTags).toBe(true);
  });

  it('el cable lanza las fases en el orden de Android: sin red, con la fila propia y con la ajena', () => {
    const sanction = csBody('SanctionAsync');
    expect(sanction).toContain('ThrowProblem(DesktopMemberSanctions.BanPreProblem(userId == owner, duration, restrict, channel));');
    expect(sanction.indexOf('BanPreProblem')).toBeLessThan(sanction.indexOf('SelfParticipantAsync'));
    expect(sanction.indexOf('BanRightProblem')).toBeLessThan(sanction.indexOf('TargetParticipantAsync'));
    expect(sanction.indexOf('BanTargetProblem')).toBeLessThan(sanction.indexOf('ConfirmPhoto'));
    expect(sanction.indexOf('ConfirmPhoto')).toBeLessThan(sanction.indexOf('Channels_EditBanned'));
    expect(sanction.indexOf('Channels_EditBanned')).toBeLessThan(sanction.indexOf('Channels_DeleteParticipantHistory'));
    expect(sanction).toContain('if (client.User?.id != owner) throw new BridgeException(DesktopMemberSanctions.ChangedSanction);');
    expect(sanction).toContain('DesktopMemberSanctions.RevokeFailed + error.Message');
    for (const [body, pre, right, target] of [
      [csBody('LiftMemberAsync'), 'LiftPreProblem', 'LiftRightProblem', 'LiftTargetProblem'],
      [csBody('PromoteMemberAsync'), 'PromotePreProblem', 'PromoteRightProblem', 'PromoteTargetProblem'],
      [csBody('DemoteMemberAsync'), 'DemotePreProblem', 'DemoteRightProblem', 'DemoteTargetProblem'],
    ] as [string, string, string, string][]) {
      expect(body.indexOf(pre)).toBeLessThan(body.indexOf('SelfParticipantAsync'));
      expect(body.indexOf(right)).toBeLessThan(body.indexOf('TargetParticipantAsync'));
      expect(body.indexOf(target)).toBeLessThan(body.indexOf('ConfirmPhoto'));
    }
    // Las dos peticiones del protocolo, con la despromoción como `editAdmin` vacío y no como método aparte.
    expect(csBody('DemoteMemberAsync')).toContain('DesktopMemberSanctions.NoRights(), null)');
    expect(csBody('LiftMemberAsync')).toContain('DesktopMemberSanctions.LiftRights()');
    expect(supergroup).toContain('internal static readonly (string Key, string Right, Gate Gate)[] Delegable');
    expect(supergroup).toContain('internal enum Gate');
  });

  it('las cinco escrituras están en la lista del puente, en el despacho y en la pantalla', () => {
    for (const arm of ['"groups.member.ban" => await BanMemberAsync(args)', '"groups.member.restrict" => await RestrictMemberAsync(args)',
      '"groups.member.promote" => await PromoteMemberAsync(args)', '"groups.member.demote" => await DemoteMemberAsync(args)',
      '"groups.member.unban" => await LiftMemberAsync(args)']) {
      expect(service).toContain(arm);
    }
    for (const method of ['groups.member.ban', 'groups.member.restrict', 'groups.member.promote', 'groups.member.demote', 'groups.member.unban']) {
      expect(policy).toContain(`"${method}"`);
    }
    // Y la pantalla las pinta sin preguntar en qué capa está: el brazo existe en las dos.
    expect(app).toContain('{member.canRestrict&&<button className="text-button" onClick={()=>sanction(member,true)}>{SANCTION_LABELS.restrict}</button>}');
    expect(app).toContain('{member.canBan&&<button className="text-button text-danger" onClick={()=>sanction(member,false)}>{SANCTION_LABELS.ban}</button>}');
    expect(app).toContain('{member.canDemote&&<button className="text-button" onClick={()=>demote(member)}>{SANCTION_LABELS.demote}</button>}');
    expect(app).toContain('confirm(SANCTION_LABELS.demote,demoteBody(member.name),SANCTION_LABELS.removeRole,');
    expect(app).toContain('const label=liftTitle(!!member.banned);confirm(label,liftBody(member.name),label,');
    expect(app).toContain('const value={...NO_ADMIN_RIGHTS}');
    expect(app).not.toContain('EMPTY_ADMIN_RIGHTS');
  });

  it('el andamio espeja las cuatro escrituras de comunidad y ninguna frase suya es nueva', () => {
    for (const needle of ['function desktopSanction(params: Record<string, unknown>, state: State, restrict: boolean): true {',
      'function desktopLift(params: Record<string, unknown>, state: State): true {',
      'function desktopPromote(params: Record<string, unknown>, state: State): true {',
      'function desktopDemote(params: Record<string, unknown>, state: State): true {',
      'return { ok: true, rights: chosen };']) {
      expect(needle.startsWith('return') ? mirror : preview).toContain(needle);
    }
    // Las tres fases, en el mismo orden, también aquí.
    const sanction = preview.slice(preview.indexOf('function desktopSanction'), preview.indexOf('function desktopLift'));
    expect(sanction.indexOf('sanctionPreProblem')).toBeLessThan(sanction.indexOf('sanctionRightProblem'));
    expect(sanction.indexOf('sanctionRightProblem')).toBeLessThan(sanction.indexOf('memberRow('));
    expect(sanction.indexOf('memberRow(')).toBeLessThan(sanction.indexOf('sanctionTargetProblem'));
    expect(preview).toContain('row.status = restrict ? ROSTER_STATUS.restricted : ROSTER_STATUS.banned;');
    expect(preview).toContain('const shape = memberShape(row);\n  row.canBan = ');
    expect(preview).toContain('row.canPromote = selfRights.canPromoteMembers && shape.normal && !row.bot;');
    // La lista de casillas que se ofrece sale de la misma puerta que la escritura consulta.
    expect(preview).toContain('offered = availableRights(chat?.type === \'channel\', chat?.isForum === true);');
    // Doce fases declaradas y doce llamadas: cada escritura pregunta una sola vez por cada una.
    expect(mirror.match(/export function (?:sanction|lift|promote|demote)(?:Pre|Right|Target)Problem/g)?.length).toBe(12);
    for (const name of ['sanction', 'lift', 'promote', 'demote']) {
      const body = preview.slice(preview.indexOf(`function desktop${name[0].toUpperCase()}${name.slice(1)}`));
      for (const phase of ['Pre', 'Right', 'Target']) {
        expect(body.match(new RegExp(`${name}${phase}Problem\\(`, 'g'))?.length).toBe(1);
      }
    }
  });
});

type Member = { id: string; name: string; status: string; banned?: boolean; restricted?: boolean; until?: number; canBan?: boolean; canUnban?: boolean; canRestrict?: boolean; canPromote?: boolean; canDemote?: boolean; canEditRights?: boolean; currentRights?: Record<string, boolean>; adminRights?: Record<string, boolean> };
type MemberPage = { members: Member[]; nextOffset: number; hasMore: boolean };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AZ · medido con las manos, sobre la lista del supergrupo', () => {
  let call: DesignCall = async () => undefined;

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);

  const row = async (id: string, chat = '14') => {
    const page = await call('groups.members.page', { id: chat, query: '', filter: 'recent', offset: 0, limit: 50 }) as MemberPage;
    return page.members.find(member => member.id === id);
  };

  async function use(target: 'desktop' | 'android') {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: target, ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  }

  beforeEach(async () => { await use('desktop'); });

  it('banear a una miembro la saca de su estado y la mete en el filtro de baneados', async () => {
    expect(await call('groups.member.ban', { id: '14', userId: '502', duration: 86400, deleteMessages: false })).toBe(true);
    const after = await row('502');
    expect(after?.status).toBe('Baneado');
    expect(after?.banned).toBe(true);
    expect(after?.restricted).toBe(false);
    expect((after?.until ?? 0)).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(after?.canBan).toBe(false);
    expect(after?.canUnban).toBe(true);
    const banned = await call('groups.members.page', { id: '14', query: '', filter: 'banned', offset: 0, limit: 50 }) as MemberPage;
    expect(banned.members.map(member => member.id)).toContain('502');
  });

  it('restringir deja a la persona dentro, con plazo y con la puerta de levantar abierta', async () => {
    expect(await call('groups.member.restrict', { id: '14', userId: '502', duration: 3600, deleteMessages: false })).toBe(true);
    const after = await row('502');
    expect(after?.status).toBe('Restringido');
    expect(after?.restricted).toBe(true);
    expect(after?.banned).toBe(false);
    expect(after?.canBan).toBe(true);
    expect(after?.canPromote).toBe(false);
  });

  it('levantar la sanción devuelve la fila a miembro normal, con sus tres acciones', async () => {
    await call('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false });
    expect(await call('groups.member.unban', { id: '14', userId: '502' })).toBe(true);
    const after = await row('502');
    expect(after?.status).toBe('Miembro');
    expect(after?.until).toBe(0);
    expect(after?.canUnban).toBe(false);
    expect(after?.canPromote).toBe(true);
  });

  it('promover escribe los permisos elegidos y despromover los borra', async () => {
    expect(await call('groups.member.promote', { id: '14', userId: '502', canChangeInfo: true, canInviteUsers: true })).toBe(true);
    const promoted = await row('502');
    expect(promoted?.status).toBe('Administrador');
    expect(promoted?.currentRights?.canChangeInfo).toBe(true);
    expect(promoted?.currentRights?.canRestrictMembers).toBe(false);
    expect(promoted?.canDemote).toBe(true);
    expect(promoted?.canEditRights).toBe(true);
    expect(promoted?.canBan).toBe(false);
    expect(await call('groups.member.demote', { id: '14', userId: '502' })).toBe(true);
    const demoted = await row('502');
    expect(demoted?.status).toBe('Miembro');
    expect(demoted?.currentRights).toBeUndefined();
    expect(demoted?.canPromote).toBe(true);
    expect(demoted?.canDemote).toBe(false);
  });

  it('las tres fases se cortan con la frase de Windows, cada una en su momento', async () => {
    expect(await ask('groups.member.ban', { id: '14', userId: '1', duration: 0, deleteMessages: false }))
      .toBe('No puedes cambiar tu propio estado desde este menú.');
    expect(await ask('groups.member.ban', { id: '14', userId: '502', duration: 30, deleteMessages: false }))
      .toBe('La duración debe ser permanente o estar entre 1 minuto y 366 días.');
    expect(await ask('groups.member.ban', { id: '14', userId: '501', duration: 0, deleteMessages: false }))
      .toBe('Telegram solo permite aplicar esta acción a un miembro normal o ya restringido. Los administradores deben perder su rol primero.');
    expect(await ask('groups.member.ban', { id: '14', userId: '999', duration: 0, deleteMessages: false }))
      .toBe('Telegram no dio los datos necesarios para cambiar el estado de esta persona. Vuelve a abrir la lista e inténtalo de nuevo.');
  });

  it('un canal no restringe ni borra mensajes, y las dos cosas las dice Telegram con sus palabras', async () => {
    expect(await ask('groups.member.restrict', { id: '22', userId: '502', duration: 3600, deleteMessages: false }))
      .toBe('Los canales no admiten restricciones de miembros; usa Banear para expulsar del canal.');
    expect(await ask('groups.member.ban', { id: '22', userId: '502', duration: 3600, deleteMessages: true }))
      .toBe('Telegram no permite borrar mensajes de un miembro desde este tipo de chat o tu cuenta no tiene ese permiso.');
    // Y sin pedir el borrado, la expulsión del canal sí se escribe.
    expect(await call('groups.member.ban', { id: '22', userId: '502', duration: 0, deleteMessages: false })).toBe(true);
  });

  it('el reparto de permisos se niega con la regla de delegación y con la puerta del tipo de chat', async () => {
    expect(await ask('groups.member.promote', { id: '14', userId: '502', canPostMessages: true }))
      .toBe('No puedes delegar un permiso que no tienes en Telegram.');
    expect(await ask('groups.member.promote', { id: '14', userId: '502', canPinMessages: true, canManageTopics: true }))
      .toBe('Uno de los permisos no es compatible con este tipo de chat.');
    expect(await ask('groups.member.promote', { id: '22', userId: '502', canChangeInfo: true, canPinMessages: true }))
      .toBe('Uno de los permisos no es compatible con este tipo de chat.');
    expect(await ask('groups.member.promote', { id: '14', userId: '502' }))
      .toBe('Selecciona al menos un permiso administrativo.');
    // En el canal del muestrario sí pasa el permiso de publicar, y en el foro el de temas.
    expect(await call('groups.member.promote', { id: '22', userId: '502', canEditMessages: true })).toBe(true);
    expect(await call('groups.member.promote', { id: '12', userId: '502', canManageTopics: true })).toBe(true);
    const edited = await row('502', '12');
    expect(edited?.currentRights?.canManageTopics).toBe(true);
    expect(edited?.currentRights?.canEditMessages).toBe(false);
  });

  it('la lista que se ofrece ya trae la puerta aplicada: la pantalla no enseña lo que el puente rechaza', async () => {
    const offered = (await row('502'))?.adminRights ?? {};
    // '14' es un supergrupo que no es foro ni canal: los tres permisos con puerta están apagados…
    expect(offered.canManageTopics).toBe(false);
    expect(offered.canPostMessages).toBe(false);
    expect(offered.canManageDirectMessages).toBe(false);
    // …y los que sí existen en un grupo se ofrecen con la bandera de la cuenta.
    expect(offered.canPinMessages).toBe(true);
    expect(offered.canPromoteMembers).toBe(true);
    expect(offered.canSendWelcomeMessages).toBe(false);
    // En el foro el de temas se ofrece, y en el canal los dos permisos propios del canal.
    expect((await row('502', '12'))?.adminRights?.canManageTopics).toBe(true);
    const channel = await call('groups.members.page', { id: '22', query: '', filter: 'recent', offset: 0, limit: 50 }) as MemberPage;
    const inChannel = channel.members.find(member => member.id === '502')?.adminRights ?? {};
    expect(inChannel.canPostMessages).toBe(false);
    expect(inChannel.canPinMessages).toBe(false);
    // Y lo que la pantalla ofrece coincide, permiso por permiso, con lo que el puente acepta en ese mismo chat.
    expect(await ask('groups.member.promote', { id: '14', userId: '502', canManageTopics: true }))
      .toBe(SANCTION_REFUSALS.incompatibleRight);
    expect(await call('groups.member.promote', { id: '12', userId: '502', canManageTopics: true })).toBe(true);
  });

  it('quitar un rol que no existe y levantar una sanción que no hay se niegan sobre la fila', async () => {
    expect(await ask('groups.member.demote', { id: '14', userId: '502' }))
      .toBe('Telegram no permite editar este rol de administrador.');
    expect(await ask('groups.member.unban', { id: '14', userId: '502' }))
      .toBe('Este usuario ya no figura como baneado o restringido.');
    expect(await ask('groups.member.unban', { id: '14', userId: '1' }))
      .toBe('No puedes cambiar tu propio estado desde esta lista.');
    expect(await ask('groups.member.promote', { id: '14', userId: '503', canChangeInfo: true }))
      .toBe('Telegram solo permite promover a un miembro normal o editar un administrador que puedas modificar.');
  });

  it('una fila que no es comunidad se niega con la guarda de forma, en las cuatro escrituras', async () => {
    for (const method of ['groups.member.ban', 'groups.member.restrict', 'groups.member.promote', 'groups.member.demote', 'groups.member.unban']) {
      expect(await ask(method, { id: '11', userId: '502', duration: 0, deleteMessages: false, canChangeInfo: true }))
        .toBe('Esta acción requiere un supergrupo o canal.');
    }
  });

  it('el básico sigue negándose con la palabra de Telegram, no con la de esta ronda', async () => {
    expect(await ask('groups.member.restrict', { id: '18', userId: '503', duration: 3600, deleteMessages: false }))
      .toBe('En un grupo básico Telegram no admite restricciones parciales: o expulsa o no hace nada.');
    expect(await ask('groups.member.promote', { id: '18', userId: '503', canChangeInfo: true }))
      .toBe('En un grupo básico la administración no se reparte en permisos: Telegram solo permite elegirlos en supergrupos y canales.');
    expect(await ask('groups.member.unban', { id: '18', userId: '510' }))
      .toBe('Para que vuelva, invítalo de nuevo desde la tanda: en un grupo básico no hay baneo que levantar.');
  });

  it('la misma fila, escrita dos veces, no se sanciona dos veces', async () => {
    await call('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false });
    expect(await ask('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false }))
      .toBe('Telegram solo permite aplicar esta acción a un miembro normal o ya restringido. Los administradores deben perder su rol primero.');
  });
});

describe('ronda AZ · el andamio visto desde Android', () => {
  let call: DesignCall = async () => undefined;

  async function use(target: 'desktop' | 'android') {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: target, ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  }

  beforeEach(async () => { await use('android'); });

  it('las cinco escrituras siguen valiendo en Android, que es donde ya estaban', async () => {
    expect(await call('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false })).toBe(true);
    expect(await call('groups.member.restrict', { id: '14', userId: '503', duration: 3600, deleteMessages: false })).toBe(true);
    expect(await call('groups.member.promote', { id: '14', userId: '502', canChangeInfo: true })).toBe(true);
    expect(await call('groups.member.demote', { id: '14', userId: '501' })).toBe(true);
    expect(await call('groups.member.unban', { id: '14', userId: '503' })).toBe(true);
  });

  it('y en Android la fila no se mueve: el espejo de estados es del puente de Windows', async () => {
    await call('groups.member.ban', { id: '14', userId: '502', duration: 0, deleteMessages: false });
    const page = await call('groups.members.page', { id: '14', query: '', filter: 'recent', offset: 0, limit: 50 }) as MemberPage;
    expect(page.members.find(member => member.id === '502')?.status).toBe('Miembro');
  });
});
