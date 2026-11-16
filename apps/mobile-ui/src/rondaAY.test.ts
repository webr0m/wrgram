import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ROSTER_UNKNOWN_NAME, rosterInvitedName } from './groupRoster';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const basicJava = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BasicGroupRoster.java');
const roster = text('../../desktop/src/WRGram.Desktop/DesktopGroupRoster.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopGroupRosterFlow.cs');
const supergroup = text('../../desktop/src/WRGram.Desktop/DesktopGroupMembers.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const contract = text('./contract.ts');
const mirror = text('./groupRoster.ts');

const lines = java.split('\n');
const rosterLines = basicJava.split('\n');

/** Una línea contada desde 1; sin aguja no hay prueba, se falla. */
function line(from: string[], number: number, label: string): string {
  const value = from[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de ${label}`);
  return value;
}

/** Las claves que `object("a",…,"b",…)` escribe en varias líneas, en su orden. */
function objectKeys(source: string): string[] {
  return [...source.matchAll(/"([a-zA-Z]+)",/g)].map(match => match[1]);
}

/** El literal que una clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from: string): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

// La fila del básico se escribe en cinco líneas (2820-2824) y el `answer.ok` empieza en la 2826: la ronda AY
// metió su clave dentro de la 2823 a propósito, porque abrir una línea nueva correría todas las agujas que
// otras rondas tienen puestas por número.
const rowLines = `${line(lines, 2820, 'NativeBridge')} ${line(lines, 2821, 'NativeBridge')} ` +
  `${line(lines, 2822, 'NativeBridge')} ${line(lines, 2823, 'NativeBridge')} ${line(lines, 2824, 'NativeBridge')}`;

describe('ronda AY · la firma de la invitación', () => {
  it('Android resuelve al invitador con su regla pura y no con el número que trae TDLib', () => {
    expect(line(lines, 2823, 'NativeBridge')).toContain(
      '"invitedByName",BasicGroupRoster.invitedName(member.inviterUserId,rosterName(session.user(member.inviterUserId)))');
    expect(basicJava).toContain('static String invitedName(long inviterUserId, String name) {');
    expect(line(rosterLines, rosterLines.findIndex(one => one.includes('return inviterUserId == 0')) + 1, 'BasicGroupRoster'))
      .toContain('return inviterUserId == 0 ? "" : name;');
  });

  it('Windows copia la misma regla y saca el nombre de la caché que la propia respuesta llenó', () => {
    expect(roster).toContain('public static string InvitedName(long inviterId, string name) => inviterId == 0 ? "" : name;');
    expect(roster).toContain('public static long InviterId(ChatParticipantBase? part) => part is ChatParticipant inviter ? inviter.inviter_id : 0L;');
    expect(roster).toContain('invitedBy = who.ToString(CultureInfo.InvariantCulture),');
    expect(roster).toContain('invitedByName = InvitedName(who, Name(inviter)),');
    expect(roster).toContain('public static object Row(ChatParticipantBase part, User? user, long selfId, User? inviter)');
    expect(cable).toContain('DesktopGroupRoster.Row(part, user, owner, _users.GetValueOrDefault(DesktopGroupRoster.InviterId(part)))');
  });

  it('la vista de diseño tiene su espejo y la pantalla ya no pinta un identificador', () => {
    expect(mirror).toContain('export function rosterInvitedName(invitedBy: string, name: string): string {');
    expect(mirror).toContain("return invitedBy === '0' ? '' : name;");
    expect(preview).toContain('rosterInvitedName(row.invitedBy, listed.find(person => person.id === row.invitedBy)?.name ?? ROSTER_UNKNOWN_NAME)');
    expect(app).toContain('{member.invitedByName&&<small>Invitado por {member.invitedByName}</small>}');
    expect(app).not.toContain('Invitado por {member.invitedBy}');
  });

  it('las once claves de la fila son las de `writeRoster`, en su orden, en las tres capas', () => {
    const keys = objectKeys(rowLines);
    expect(keys).toEqual(['id', 'name', 'username', 'status', 'inside', 'self', 'bot', 'since', 'invitedBy', 'invitedByName', 'tag']);
    const ui = /export interface RosterMember \{([^}]*)\}/.exec(contract);
    if (!ui) throw new Error('Falta RosterMember en el contrato');
    expect(ui[1].split(';').map(field => field.trim().split(/[:?]/)[0])).toEqual(keys);
    expect(roster.slice(roster.indexOf('public static object Row(ChatParticipantBase part, User? user, long selfId, User? inviter)')))
      .toContain('invitedByName = InvitedName(who, Name(inviter)),\n            tag = ""');
  });

  it('quien no tiene nombre se dice con el respaldo de siempre y no con una frase nueva', () => {
    expect(supergroup).toContain('public const string UnknownPerson = "Usuario de Telegram";');
    expect(java).toContain('if(user==null)return "Usuario de Telegram";');
    // El andamio no reescribe la palabra: la pregunta al espejo, que es la norma que fijó la ronda AO.
    expect(ROSTER_UNKNOWN_NAME).toBe(csSentence('UnknownPerson', supergroup));
    expect(preview).toContain('?? ROSTER_UNKNOWN_NAME)');
    expect(preview).not.toContain(`'${ROSTER_UNKNOWN_NAME}'`);
    // El respaldo solo vale cuando hay invitador: sin invitador la firma se queda vacía.
    expect(rosterInvitedName('0', ROSTER_UNKNOWN_NAME)).toBe('');
    expect(rosterInvitedName('501', ROSTER_UNKNOWN_NAME)).toBe(ROSTER_UNKNOWN_NAME);
  });
});

type Row = { id: string; name: string; invitedBy: string; invitedByName: string; status: string };
type Roster = { members: Row[]; shown: number; note: string };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AY · medido con las manos', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  });

  const rosterOf = async (query: string) => await call('groups.members.basic', { id: '18', query }) as Roster;

  it('ninguna firma es un número suelto, y la fila del creador no tiene firma', async () => {
    const all = await rosterOf('');
    const creator = all.members.find(row => row.status === 'Propietario');
    if (!creator) throw new Error('Falta la fila del creador en el muestrario');
    expect(creator.invitedBy).toBe('0');
    expect(creator.invitedByName).toBe('');
    for (const row of all.members) {
      expect(/^\d+$/.test(row.invitedByName), `${row.id} pinta un identificador`).toBe(false);
      if (row.invitedBy !== '0') expect(row.invitedByName.length).toBeGreaterThan(0);
    }
  });

  it('la firma dice el nombre de la lista, no el identificador que viaja en `invitedBy`', async () => {
    const all = await rosterOf('');
    const rosa = all.members.find(row => row.id === '500');
    if (!rosa) throw new Error('Falta Rosa Ibarra en la lista');
    const invited = all.members.filter(row => row.invitedBy === '500');
    expect(invited.length).toBeGreaterThan(1);
    for (const row of invited) expect(row.invitedByName).toBe(rosa.name);
  });

  it('filtrar la vista no rompe la firma: se resuelve sobre la lista entera, como en los puentes', async () => {
    const all = await rosterOf('');
    const nadia = all.members.find(row => row.id === '510');
    if (!nadia) throw new Error('Falta la fila invitada por alguien que no coincide con la búsqueda');
    expect(nadia.invitedBy).toBe('501');
    const only = await rosterOf('nadia');
    expect(only.shown).toBe(1);
    expect(only.members[0].invitedBy).toBe('501');
    expect(only.members[0].invitedByName).toBe(nadia.invitedByName);
    expect(only.members.some(row => row.id === '501')).toBe(false);
  });

  it('el espejo de la pantalla reproduce la firma fila a fila', async () => {
    const all = await rosterOf('');
    for (const row of all.members) {
      const inviter = all.members.find(person => person.id === row.invitedBy);
      expect(rosterInvitedName(row.invitedBy, inviter?.name ?? ROSTER_UNKNOWN_NAME)).toBe(row.invitedByName);
    }
  });

  it('expulsar a una persona no le borra la firma de la invitación', async () => {
    const before = await rosterOf('');
    const sofia = before.members.find(row => row.id === '503');
    if (!sofia) throw new Error('Falta la fila que se va a expulsar');
    expect(sofia.invitedByName).toBe('Rosa Ibarra');
    expect(await call('groups.member.ban', { id: '18', userId: '503', duration: 0, deleteMessages: true })).toBe(true);
    const after = await rosterOf('');
    const banned = after.members.find(row => row.id === '503');
    if (!banned) throw new Error('La fila expulsada desapareció de la lista');
    expect(banned.invitedByName).toBe('Rosa Ibarra');
    expect(after.note).toContain('fueron expulsados');
  });

  it('la lista del supergrupo no promete firmas que Telegram no manda por página', async () => {
    const page = await call('groups.members.page', { id: '14', query: '', filter: 'recent', offset: 0, limit: 50 }) as
      { members: Record<string, unknown>[] };
    expect(page.members.length).toBeGreaterThan(0);
    expect(Object.keys(page.members[0])).not.toContain('invitedByName');
  });
});
