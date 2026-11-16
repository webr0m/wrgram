import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAN_ACTIONS, ROSTER_STATUS, banishConfirm, banishProblem, banishable, rosterManage } from './groupRoster';
import type { RosterMember } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const pure = java('BasicGroupMemberAction');
const bridge = java('NativeBridge');
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

const JAVA_KEYS: [string, keyof typeof BAN_ACTIONS][] = [
  ['NO_RIGHT', 'noRight'], ['SELF', 'self'], ['CREATOR', 'creator'], ['OUTSIDE', 'outside'],
  ['NO_RESTRICT', 'noRestrict'], ['NO_PROMOTE', 'noPromote'], ['NO_DURATION', 'noDuration'],
  ['REVOKE_ON', 'revokeOn'], ['REVOKE_OFF', 'revokeOff'], ['SCOPE', 'scope'], ['UNBAN_HINT', 'unban'],
];

const person = (over: Partial<RosterMember>): RosterMember => ({
  id: '600', name: 'Lucía', username: 'lucia_m', status: ROSTER_STATUS.member, inside: true,
  self: false, bot: false, since: 0, invitedBy: '500', invitedByName: 'Rosa Ibarra', tag: '', ...over,
});

describe('ronda R · las dos capas dicen lo mismo sobre expulsar', () => {
  it.each(JAVA_KEYS)('Java %s y TypeScript tienen la misma frase literal', (name, key) => {
    expect(pure.includes(`String ${name} = "${BAN_ACTIONS[key]}"`), `${name} copiado literal`).toBe(true);
  });

  it('ninguna frase se repite dentro del propio TypeScript', () => {
    const values = Object.values(BAN_ACTIONS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('la vista de diseño importa las frases en vez de copiarlas', () => {
    expect(preview).toContain("import { BAN_ACTIONS, ROSTER_NOTES, ROSTER_STATUS, ROSTER_UNKNOWN_NAME, banishProblem, rosterInvitedName, rosterManage, rosterMatches, rosterNote, rosterQueryProblem, rosterRemaining } from './groupRoster';");
    for (const [, key] of JAVA_KEYS) {
      expect(preview.includes(`'${BAN_ACTIONS[key]}'`), `preview.ts repite ${key}`).toBe(false);
    }
  });
});

describe('ronda R · la clase pura corta lo que la schema no admite', () => {
  it('solo manda en un grupo básico', () => {
    expect(pure).toContain('static boolean applicable(TdApi.Chat chat) {');
    expect(pure).toContain('return MemberAdditions.basic(chat);');
  });

  it('el permiso sale del estado propio, no de la suposición', () => {
    expect(pure).toContain('if (self instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) self).isMember;');
    expect(pure).toContain('return rights != null && rights.canRestrictMembers;');
    expect(pure).toContain('return false;');
  });

  it('el orden del descarte no deja colar un creador', () => {
    const problem = body('banProblem', pure);
    expect(problem).toContain('if (targetId == selfId) return SELF;');
    expect(problem).toContain('if (target instanceof TdApi.ChatMemberStatusCreator) return CREATOR;');
    expect(problem).toContain('if (!mayRemove(self)) return NO_RIGHT;');
    expect(problem.indexOf('SELF') < problem.indexOf('mayRemove')).toBe(true);
  });

  it('restringir y repartir permisos se niegan con la frase de la schema', () => {
    expect(pure).toContain('return applicable(chat) ? NO_RESTRICT : null;');
    expect(pure).toContain('return applicable(chat) ? NO_PROMOTE : null;');
    expect(pure).toContain('return applicable(chat) ? UNBAN_HINT : null;');
  });

  it('el plazo se corta a cero y los mensajes se deciden aquí', () => {
    expect(pure).toContain('return applicable(chat) && requested != 0 ? NO_DURATION : null;');
    expect(pure).toContain('if (!applicable(chat)) return (int) Math.min(Integer.MAX_VALUE, Math.max(0, requested));');
    expect(pure).toContain('        return 0;');
    expect(pure).toContain('return applicable(chat) ? requested : true;');
  });

  it('la confirmación nombra a la persona y dice lo de sus mensajes', () => {
    expect(pure).toContain('return "Se expulsará a " + name + " del grupo de forma definitiva. " + (revoke ? REVOKE_ON : REVOKE_OFF);');
  });

  it('el TypeScript refleja las mismas tres decisiones locales', () => {
    expect(banishable(person({}))).toBe(true);
    expect(banishable(person({ inside: false }))).toBe(false);
    expect(banishable(person({ self: true }))).toBe(false);
    expect(banishable(person({ status: ROSTER_STATUS.creator }))).toBe(false);
    expect(banishProblem(person({ self: true }))).toBe(BAN_ACTIONS.self);
    expect(banishProblem(person({ status: ROSTER_STATUS.creator }))).toBe(BAN_ACTIONS.creator);
    expect(banishProblem(person({ status: ROSTER_STATUS.left, inside: false }))).toBe(BAN_ACTIONS.outside);
    expect(banishProblem(person({}))).toBe('');
    expect(banishConfirm('Lucía', true)).toContain(BAN_ACTIONS.revokeOn);
    expect(banishConfirm('Lucía', false)).toContain(BAN_ACTIONS.revokeOff);
  });

  it('el permiso de la lista sale del estado propio, como en Java', () => {
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.creator })])).toBe(true);
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.admin })])).toBe(true);
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.creator, inside: false })])).toBe(false);
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.member })])).toBe(false);
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.restricted })])).toBe(false);
    expect(rosterManage([person({ self: true, status: ROSTER_STATUS.left })])).toBe(false);
    expect(rosterManage([person({ status: ROSTER_STATUS.admin }), person({ self: true })])).toBe(false);
  });
});

describe('ronda R · el puente escribe solo lo que Telegram admite en un básico', () => {
  it('la expulsión bifurca antes de tocar el camino de supergrupo', () => {
    const ban = body('banGroupMember');
    expect(ban).toContain('if(BasicGroupMemberAction.applicable(chat)){banBasicMember(chat,params,answer,restrict);return;}');
    expect(ban).toContain('if(!(chat.type instanceof TdApi.ChatTypeSupergroup)){answer.fail("Esta acción requiere un supergrupo o canal.");return;}');
  });

  it('el ramal básico corta restrictivo, plazo y permiso antes de preguntar', () => {
    const basic = body('banBasicMember');
    expect(basic).toContain('if(restrict){answer.fail(BasicGroupMemberAction.restrictProblem(chat));return;}');
    expect(basic).toContain('String badDuration=BasicGroupMemberAction.durationProblem(chat,params.optLong("duration",0));');
    expect(basic).toContain('boolean revoke=BasicGroupMemberAction.revokes(chat,params.optBoolean("deleteMessages",false));');
    expect(basic).toContain('perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->');
    expect(basic).toContain('perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(userId)),answer,target->{');
    expect(basic).toContain('String problem=BasicGroupMemberAction.banProblem(actor.status,target.status,session.selfId,userId);');
  });

  it('se confirma en diálogo nativo y se manda BanChatMember con plazo cero', () => {
    const basic = body('banBasicMember');
    expect(basic).toContain('Dialogs.builder(activity).setTitle("Expulsar de "+chat.title).setMessage(BasicGroupMemberAction.confirm(name,revoke))');
    expect(basic).toContain('.setNegativeButton("Cancelar",(d,w)->answer.ok(false))');
    expect(basic).toContain('.setPositiveButton("Expulsar",(d,w)->{');
    expect(basic).toContain('if(!currentAccount()||session.selfId!=answer.owner||session.activeChat!=chat.id)');
    expect(basic).toContain('perform(new TdApi.BanChatMember(chat.id,new TdApi.MessageSenderUser(userId),BasicGroupMemberAction.until(chat,0),revoke),answer,ignored->{schedule();answer.ok(true);});');
    expect(basic).not.toContain('DeleteChatMessagesBySender');
  });

  it('devolver, promover o restringir se responden con la frase correcta', () => {
    expect(body('unbanGroupMember')).toContain('if(BasicGroupMemberAction.applicable(chat)){answer.fail(BasicGroupMemberAction.unbanProblem(chat));return;}');
    expect(body('promoteGroupMember')).toContain('String basics=BasicGroupMemberAction.promoteProblem(chat);if(basics!=null)throw new IllegalArgumentException(basics);');
    expect(body('demoteGroupMember')).toContain('String basics=BasicGroupMemberAction.promoteProblem(chat);if(basics!=null){answer.fail(basics);return;}');
  });

  it('la lista lleva el permiso y el alcance leídos del servidor', () => {
    const roster = body('basicRoster');
    expect(roster).toContain('perform(new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId)),answer,actor->');
    expect(roster).toContain('perform(new TdApi.GetBasicGroupFullInfo(BasicGroupRoster.groupId(chat)),answer,info->writeRoster(info,query,actor.status,answer))');
    const written = body('writeRoster');
    expect(written).toContain('"manage",BasicGroupMemberAction.mayRemove(self),"scope",BasicGroupMemberAction.scope()');
  });
});

describe('ronda R · la pantalla deja actuar sobre la lista', () => {
  it('el contrato trae el permiso y el alcance', () => {
    expect(contract).toContain('note:string;remaining:number;order:string;manage:boolean;scope:string}');
  });

  it('cada fila elegible ofrece expulsar y las demás explican por qué no', () => {
    const panel = fn('GroupMemberRoster');
    expect(panel).toContain('banish(member:RosterMember):void');
    expect(panel).toContain('{roster.manage&&banishable(member)&&<button type="button" onClick={()=>banish(member)}>Expulsar</button>}');
    expect(panel).toContain('{!banishable(member)&&!member.self&&<small>{banishProblem(member)}</small>}');
    expect(panel).toContain('<p className="settings-note">{roster.scope}</p>');
    expect(panel).toContain('{!roster.manage&&<p className="inline-warning" role="status"><span>{BAN_ACTIONS.noRight}</span></p>}');
  });

  it('la apertura encadena expulsión, aviso y lista refrescada', () => {
    const opener = fn('openGroupRoster');
    expect(opener).toContain('banish={member=>setDialog({title:`Expulsar a ${member.name}`');
    expect(opener).toContain('<MemberSanctionDialog member={member} restrict={false} basic send=');
    expect(opener).toContain("run<boolean>('groups.member.ban',{id:chat.id,userId:member.id,duration,deleteMessages})");
    expect(opener).toContain('openGroupRoster(chat);');
  });

  it('en un básico el diálogo de sanción no ofrece plazo', () => {
    const dialog = fn('MemberSanctionDialog');
    expect(dialog).toContain('basic=false');
    expect(dialog).toContain('const note=basic?`${banishConfirm(member.name,deleteMessages)} ${BAN_ACTIONS.noDuration}`');
    expect(dialog).toContain('{!basic&&<label className="field-label">Duración');
    expect(dialog).toContain('onClick={()=>send(basic?0:duration,deleteMessages)}');
    expect(dialog).toContain("{basic?'Revisar expulsión':restrict?'Revisar restricción':'Revisar baneo'}");
  });
});

describe('ronda R · la vista de diseño se comporta como el puente', () => {
  it('la lista contesta permiso y alcance', () => {
    const section = preview.slice(preview.indexOf("if (method === 'groups.members.basic')"));
    const block = section.slice(0, section.indexOf("if (method === 'chat.username')"));
    expect(block).toContain('manage: rosterManage(rows), scope: BAN_ACTIONS.scope,');
  });

  it('expulsar de un básico cambia el estado de la fila y se corta con las mismas reglas', () => {
    const block = preview.slice(preview.indexOf("if (method === 'groups.member.ban')"));
    const banish = block.slice(0, block.indexOf("if (method === 'groups.member.restrict'"));
    // La ronda AX metió dentro de este `if` la negación de Windows, así que la forma de seguir fuera de un
    // básico ya no es un `return true` solo en una línea: sigue siendo el mismo descarte, con bloque.
    expect(banish).toContain("if (!chat || chat.type !== 'group' || chat.supergroup === true) {");
    expect(banish).toContain('return true;');
    expect(banish).toContain('if (Number(params.duration ?? 0) !== 0) throw new Error(BAN_ACTIONS.noDuration);');
    expect(banish).toContain('const problem = row ? banishProblem(row) : BAN_ACTIONS.outside;');
    expect(banish).toContain('if (!rosterManage(rosterRows(state))) throw new Error(BAN_ACTIONS.noRight);');
    expect(banish).toContain('banished.add(userId);');
    expect(preview).toContain('.map(row => (banished.has(row.id) ? { ...row, inside: false, status: ROSTER_STATUS.banned } : row));');
  });

  it('restringir, promover y desbanear se niegan donde la schema los niega', () => {
    expect(preview).toContain('throw new Error(method === \'groups.member.restrict\' ? BAN_ACTIONS.noRestrict : BAN_ACTIONS.noPromote);');
    expect(preview).toContain('if (chat && chat.type === \'group\' && chat.supergroup !== true) throw new Error(BAN_ACTIONS.unban);');
  });

  it('el panel de administración de supergrupos sigue hablando con GroupMember', () => {
    expect(app).toContain('<MemberSanctionDialog member={member} restrict={restrict} send=');
    expect(fn('MemberSanctionDialog')).toContain('member:{name:string};restrict:boolean;basic?:boolean');
  });
});
