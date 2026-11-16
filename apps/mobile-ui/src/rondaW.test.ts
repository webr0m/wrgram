import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ROSTER_LIMITS, ROSTER_NOTES, ROSTER_STATUS, rosterInsideCount, rosterLine, rosterMatches, rosterNote,
  rosterQueryProblem, rosterRemaining,
} from './groupRoster';
import type { RosterMember } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const pure = java('BasicGroupRoster');
const bridge = java('NativeBridge');
const policy = java('BridgePolicy');
const app = ui('App.tsx');
const preview = ui('preview.ts');
const contract = ui('contract.ts');

/** Cuerpo de una función del interfaz: desde `function nombre(` hasta su llave de cierre. */
function fn(name: string, from = app): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  const open = from.indexOf('{', from.indexOf(')', start));
  let depth = 0;
  for (let i = open; i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de un método del puente: desde su firma hasta la llave que lo cierra. */
function body(name: string, from = bridge): string {
  const start = from.search(new RegExp(`^\\s*(?:private|public|protected|static)[^{;\\n]*?\\b${name}\\(`, 'm'));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const PHRASES: [string, keyof typeof ROSTER_NOTES][] = [
  ['UNSUPPORTED', 'unsupported'], ['EMPTY', 'empty'], ['NO_CREATOR', 'noCreator'],
  ['ORDER', 'order'], ['TOO_LONG', 'tooLong'],
];
const LABELS: [string, keyof typeof ROSTER_STATUS][] = [
  ['CREATOR', 'creator'], ['ADMIN', 'admin'], ['MEMBER', 'member'], ['RESTRICTED', 'restricted'],
  ['LEFT', 'left'], ['BANNED', 'banned'], ['UNKNOWN', 'unknown'],
];

describe('ronda Q · las dos capas dicen exactamente lo mismo', () => {
  it.each(PHRASES)('Java %s y TypeScript tienen la misma frase literal', (name, key) => {
    expect(pure.includes(`String ${name} = "${ROSTER_NOTES[key]}"`)).toBe(true);
  });

  it.each(LABELS)('Java %s y TypeScript llaman igual al mismo estado', (name, key) => {
    expect(pure.includes(`String ${name} = "${ROSTER_STATUS[key]}"`)).toBe(true);
  });

  it('los topes vienen de la schema, no de la memoria', () => {
    expect(pure).toContain('static final int MAX = MemberAdditions.BASIC_LIMIT');
    expect(java('MemberAdditions')).toContain('static final int BASIC_LIMIT = 200');
    expect(ROSTER_LIMITS.group).toBe(200);
    expect(pure).toContain('static final int MAX_QUERY = 80');
    expect(ROSTER_LIMITS.query).toBe(80);
  });

  it('ningún estado se disfraza de miembro', () => {
    expect(pure).toContain('return status == null ? 4 : 3;');
    expect(pure).toContain('if (ChatMembership.inside(status)) return 2;');
    expect(pure).toContain('return ((TdApi.ChatMemberStatusCreator) status).isMember ? 0 : 3;');
  });

  it('la vista de diseño importa las frases en vez de copiarlas', () => {
    expect(preview).toContain("import { BAN_ACTIONS, ROSTER_NOTES, ROSTER_STATUS, ROSTER_UNKNOWN_NAME, banishProblem, rosterInvitedName, rosterManage, rosterMatches, rosterNote, rosterQueryProblem, rosterRemaining } from './groupRoster';");
    for (const sentence of Object.values(ROSTER_NOTES)) {
      expect(preview.split(sentence).length - 1, `preview.ts repite "${sentence}"`).toBe(0);
    }
  });
});

describe('ronda Q · el puente solo pregunta después de descartar', () => {
  it('el método está despachado y permitido', () => {
    expect(bridge).toContain('case "groups.members.basic":basicRoster(p,a);break;');
    expect(policy).toContain('"groups.members.basic"');
  });

  it('un básico es la única lista que cabe entera y la búsqueda se corta antes de pedir nada', () => {
    const method = body('basicRoster');
    expect(method).toContain('if(!BasicGroupRoster.applicable(chat)){answer.fail(BasicGroupRoster.UNSUPPORTED);return;}');
    expect(method).toContain('if(BasicGroupRoster.tooLong(query)){answer.fail(BasicGroupRoster.TOO_LONG);return;}');
    expect(method).toContain('new TdApi.GetBasicGroupFullInfo(BasicGroupRoster.groupId(chat))');
    expect(method).not.toContain('GetSupergroupMembers');
  });

  it('la respuesta separa lo devuelto, lo mostrado y lo que sigue dentro', () => {
    const method = body('writeRoster');
    expect(method).toContain('int insideAll=BasicGroupRoster.inside(info.members),listed=0;');
    expect(method).toContain('if(!BasicGroupRoster.visible(member))continue;');
    expect(method).toContain('if(!BasicGroupRoster.matches(query,name,username))continue;');
    for (const key of ['"members"', '"shown"', '"listed"', '"inside"', '"creator"', '"note"', '"remaining"', '"order"']) {
      expect(method, `la respuesta lleva ${key}`).toContain(key);
    }
  });

  it('el nombre sale de la caché de usuarios con la misma red de seguridad que la lista de supergrupos', () => {
    expect(body('rosterName')).toContain('if(user==null)return "Usuario de Telegram";');
    expect(body('rosterUsername')).toContain('user.usernames.editableUsername');
    expect(body('rosterUsername')).toContain('user.usernames.activeUsernames');
  });
});

describe('ronda Q · el contrato y la interfaz', () => {
  it('la fila de la lista cabe en el contrato TypeScript', () => {
    expect(contract).toContain('export interface RosterMember {id:string;name:string;username:string;status:string;inside:boolean;self:boolean;bot:boolean;since:number;invitedBy:string;invitedByName:string;tag:string}');
    expect(contract).toContain('export interface GroupRoster {members:RosterMember[];shown:number;listed:number;inside:number;creator:string;note:string;remaining:number;order:string;manage:boolean;scope:string}');
    for (const key of ['id', 'name', 'username', 'status', 'inside', 'self', 'bot', 'since', 'invitedBy', 'invitedByName', 'tag']) {
      expect(body('writeRoster'), `el puente manda ${key}`).toContain(`"${key}"`);
    }
  });

  it('la lista de un básico tiene su propia puerta en los dos menús', () => {
    expect(app).toContain('function openGroupRoster(chat:Chat){setDialog({title:`Miembros · ${chat.title}`,body:<GroupMemberRoster chat={chat} run={run} banish=');
    expect(app).toContain("{chat.type==='group'&&chat.supergroup!==true&&<MenuItem icon={<Users/>} label=\"Ver miembros\" onClick={()=>{setDialog(undefined);openGroupRoster(chat);}}/>}");
    expect(app).toContain('{active.type==="group"&&active.supergroup!==true&&<MenuItem icon={<Users/>} label="Ver miembros" onClick={()=>openGroupRoster(active)}/>}');
    const roster = app.indexOf('label="Ver miembros"');
    const add = app.indexOf('label="Añadir personas"');
    expect(roster).toBeGreaterThan(-1);
    expect(add).toBeGreaterThan(roster);
  });

  it('el panel consulta, avisa y deja montar la tanda debajo', () => {
    const panel = fn('GroupMemberRoster');
    expect(panel).toContain("runRef.current<GroupRoster>('groups.members.basic',{id:chat.id,query:query.trim()})");
    expect(panel).toContain('maxLength={80}');
    expect(panel).toContain('{roster.note}');
    expect(panel).toContain('{roster.order}');
    expect(panel).toContain('permissionLine(\'\',roster.remaining)');
    expect(panel).toContain('<GroupAddPeople chat={chat} run={run} showSeats={false} done={()=>setVersion(value=>value+1)}/>');
    expect(panel).toContain('},[chat.id,query,version]);');
  });

  it('los huecos se cuentan una vez y salen de la misma lista', () => {
    const picker = fn('GroupAddPeople');
    expect(picker).toContain('showSeats=true');
    expect(picker).toContain("{showSeats&&<p className=\"settings-note\">{permissionLine('',info.remaining)}</p>}");
    expect(fn('GroupMemberRoster')).toContain('showSeats={false}');
    const rosterSection = preview.slice(preview.indexOf("if (method === 'groups.members.basic')"));
    const rosterBlock = rosterSection.slice(0, rosterSection.indexOf("if (method === 'chat.username')"));
    expect(rosterBlock).toContain('const rows: RosterMember[] = rosterRows(state);');
    const permission = preview.slice(preview.indexOf('function addPermission('));
    expect(permission.slice(0, permission.indexOf('const storyAlbums'))).toContain('const remaining = rosterRemaining(rosterRows(state).filter(row => row.inside).length);');
  });

  it('la vista de diseño corta por el mismo orden que el puente', () => {
    const section = preview.slice(preview.indexOf("if (method === 'groups.members.basic')"));
    const block = section.slice(0, section.indexOf("if (method === 'chat.username')"));
    expect(block).toContain('if (!chat || chat.type !== \'group\' || chat.supergroup === true) throw new Error(ROSTER_NOTES.unsupported)');
    expect(block).toContain('rosterQueryProblem(query)');
    expect(block).toContain('rosterMatches(query, row.name, row.username)');
    expect(block).toContain('rosterNote(\'500\', ordered.length, inside)');
    expect(block).toContain('rosterRemaining(inside)');
    expect(block).toContain('rank(a) - rank(b)');
  });
});

describe('ronda Q · las reglas contadas en TypeScript', () => {
  it('la nota separa el total de los que siguen dentro', () => {
    expect(rosterNote('500', 0, 0)).toBe(ROSTER_NOTES.empty);
    expect(rosterNote('500', 1, 1)).toContain('1 persona');
    expect(rosterNote('500', 1, 1)).toContain('sigue dentro.');
    expect(rosterNote('500', 9, 9)).toContain('todas siguen dentro.');
    expect(rosterNote('500', 9, 7)).toContain('7 siguen dentro y 2 se fueron o fueron expulsados.');
    expect(rosterNote('500', 9, 8)).toContain('1 se fue o fue expulsada.');
    expect(rosterNote('500', 4, 0)).toContain('ninguna sigue dentro');
    expect(rosterNote('0', 4, 4).endsWith(ROSTER_NOTES.noCreator)).toBe(true);
    expect(rosterNote('500', 4, 4)).not.toContain(ROSTER_NOTES.noCreator);
  });

  it('los huecos nunca salen negativos', () => {
    expect(rosterRemaining(12)).toBe(188);
    expect(rosterRemaining(200)).toBe(0);
    expect(rosterRemaining(240)).toBe(0);
  });

  it('la búsqueda es en minúsculas sobre nombre o usuario y el tope es el mismo', () => {
    expect(rosterMatches('', 'María Fernández', 'maria_fdz')).toBe(true);
    expect(rosterMatches('   ', 'María Fernández', 'maria_fdz')).toBe(true);
    expect(rosterMatches('FDZ', 'nada', 'maria_fdz')).toBe(true);
    expect(rosterMatches('fern', 'María Fernández', '')).toBe(true);
    expect(rosterMatches('zzz', 'María Fernández', 'maria_fdz')).toBe(false);
    expect(rosterQueryProblem('x'.repeat(80))).toBe('');
    expect(rosterQueryProblem(`  ${'x'.repeat(81)}  `)).toBe(ROSTER_NOTES.tooLong);
    expect(rosterQueryProblem('   ')).toBe('');
  });

  it('la línea dice estado, fecha y si la persona ya no está dentro', () => {
    const person: RosterMember = {
      id: '502', name: 'María Fernández', username: '@maria_fdz', status: ROSTER_STATUS.member,
      inside: true, self: false, bot: false, since: 1_700_000_000, invitedBy: '500', invitedByName: 'Rosa Ibarra', tag: '',
    };
    expect(rosterLine(person)).toContain('María Fernández · Miembro · desde');
    expect(rosterLine({ ...person, self: true })).toContain('María Fernández (tú)');
    expect(rosterLine({ ...person, bot: true })).toContain('· Bot');
    expect(rosterLine({ ...person, inside: false, status: ROSTER_STATUS.left })).toContain('Salió');
    expect(rosterLine({ ...person, inside: false, status: ROSTER_STATUS.left })).toContain('ya no está dentro');
    expect(rosterLine({ ...person, since: 0 })).not.toContain('desde');
    expect(rosterInsideCount([person, { ...person, id: '503', inside: false }])).toBe(1);
  });
});
