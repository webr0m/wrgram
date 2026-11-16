import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ADD_CANCELLED, ADD_LIMITS, ADD_REJECTIONS, batchNotice, batchProblem, forwardNotice, forwardProblem,
  outcomeLine, permissionLine, positiveId, readState,
} from './memberAdditions';
import type { AddBatch } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const pure = java('MemberAdditions');
const bridge = java('NativeBridge');
const policy = java('BridgePolicy');
const app = ui('App.tsx');
const preview = ui('preview.ts');
const contract = ui('contract.ts');
const bridgeTs = ui('bridge.ts');

/** Cuerpo de una función Kotlin/TSX: desde `function nombre(` hasta su llave de cierre. */
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

const JAVA_KEYS: [string, keyof typeof ADD_REJECTIONS][] = [
  ['UNSUPPORTED', 'unsupported'], ['MIGRATED', 'migrated'], ['BANNED', 'banned'], ['OUTSIDE', 'outside'],
  ['NO_RIGHT', 'noRight'], ['FULL', 'full'], ['EMPTY', 'empty'], ['TOO_MANY', 'tooMany'],
  ['BAD_ID', 'badId'], ['BAD_FORWARD', 'badForward'], ['PREMIUM_WOULD_ALLOW', 'premiumWouldAllow'],
  ['PREMIUM_REQUIRED', 'premiumRequired'], ['FAILED', 'failed'], ['UNCONFIRMED', 'unconfirmed'],
  ['CANCELLED_NOTICE', 'cancelled'],
];

describe('ronda P · las dos capas dicen exactamente lo mismo', () => {
  it.each(JAVA_KEYS)('Java %s y TypeScript tienen la misma frase literal', (name, key) => {
    expect(pure.includes(`String ${name} = "${ADD_REJECTIONS[key]}"`)).toBe(true);
  });

  it('la vista de diseño importa las frases en vez de copiarlas', () => {
    expect(preview).toContain("import { ADD_REJECTIONS, batchProblem, fitsLong, forwardProblem, positiveId } from './memberAdditions';");
    for (const [, key] of JAVA_KEYS) {
      const sentence = ADD_REJECTIONS[key];
      if (sentence === ADD_REJECTIONS.failed) continue; // la usa el propio modelo
      expect(preview.includes(sentence), `preview.ts repite "${sentence}"`).toBe(false);
    }
  });

  it('los tres estados Telegram caben en el contrato TypeScript', () => {
    expect(contract).toContain("export type AddState = 'added' | 'rejected' | 'unclear'");
    expect(pure).toContain('static final String ADDED = "added"');
    expect(pure).toContain('static final String REJECTED = "rejected"');
    expect(pure).toContain('static final String UNCLEAR = "unclear"');
  });

  it('el tope de un grupo básico sale de la schema, no de la memoria', () => {
    expect(pure).toContain('static final int BASIC_LIMIT = 200');
    expect(pure).toContain('a basic group of 0-200 users');
    expect(ADD_LIMITS.basic).toBe(200);
    expect(ADD_LIMITS.batch).toBe(20);
    expect(ADD_LIMITS.forward).toBe(100);
  });
});

describe('ronda P · el puente pregunta después de descartar', () => {
  it('los dos métodos están despachados y permitidos', () => {
    expect(bridge).toContain('case "groups.add.info":addInfo(p,a);break;');
    expect(bridge).toContain('case "groups.member.add":addMembers(p,a);break;');
    expect(policy).toContain('"groups.add.info","groups.member.add"');
  });

  it('la tanda espera a la persona, no al plazo de una lectura', () => {
    expect(bridgeTs).toContain("'groups.member.add',");
    expect(bridgeTs).not.toContain("'groups.add.info'");
  });

  it('el lote se corta antes de tocar Telegram', () => {
    const add = body('addMembers');
    expect(add).toContain('MemberAdditions.batch(unique.size())');
    expect(add).toContain('MemberAdditions.positive(value)');
    expect(add).toContain('MemberAdditions.forwardProblem(forward)');
    expect(add).toContain('if (id != session.selfId) unique.add(id)');
    // Nadie se añade a sí mismo, y la lista se deduplica antes de contar.
    expect(add).toContain('java.util.LinkedHashSet<Long> unique');
  });

  it('el permiso se lee con los datos que la schema reparte', () => {
    const context = body('addContext');
    expect(context).toContain('new TdApi.GetBasicGroup(');
    expect(context).toContain('group.upgradedToSupergroupId, group.memberCount, group.status');
    expect(context).toContain('new TdApi.GetSupergroup(id)');
    expect(context).toContain('new TdApi.GetChatMember(chat.id, new TdApi.MessageSenderUser(session.selfId))');
    expect(body('addInfo')).toContain('MemberAdditions.problem(chat, migratedTo, memberCount, self)');
  });

  it('la alta solo se da por hecha cuando GetChatMember la confirma', () => {
    const run = body('runAdd');
    expect(run).toContain('MemberAdditions.named(');
    expect(run).toContain('MemberAdditions.reason(named)');
    expect(run).toContain('new TdApi.GetChatMember(chat.id, new TdApi.MessageSenderUser(id))');
    expect(run).toContain('MemberAdditions.outcome(null, after)');
    expect(run).toContain('MemberAdditions.UNCONFIRMED');
  });

  it('un error fuerte corta la cola en lugar de seguirla llenando de fallos', () => {
    const run = body('runAdd');
    expect(run).toContain('stopAdd(results, rejected, a)');
    expect(body('stopAdd')).toContain('answerAdd(a, results, reason)');
    // La cancelación nativa no manda nadie y se nombra con un marcador, no con una frase suelta.
    expect(body('confirmAdd')).toContain('answerAdd(a, new JSONArray(), MemberAdditions.CANCELLED)');
  });

  it('la confirmación es nativa y enumera a quién se le pregunta', () => {
    const confirm = body('confirmAdd');
    expect(confirm).toContain('Dialogs.builder(activity)');
    expect(confirm).toContain('Telegram decide una por una');
    expect(confirm).toContain('names.append(" y ").append(ids.length - 3)');
  });
});

describe('ronda P · la interfaz separa las tres salidas', () => {
  const batch = (results: AddBatch['results'], stopped = ''): AddBatch => ({ results, stopped });

  it('un estado desconocido nunca se lee como añadido', () => {
    expect(readState('added')).toBe('added');
    expect(readState('noventaynueve')).toBe('unclear');
    expect(readState(undefined)).toBe('unclear');
  });

  it('el resumen cuenta añadido, fuera y sin confirmar por separado', () => {
    expect(batchNotice(batch([
      { id: '1', name: 'A', state: 'added', reason: '' },
      { id: '2', name: 'B', state: 'rejected', reason: ADD_REJECTIONS.failed },
      { id: '3', name: 'C', state: 'unclear', reason: ADD_REJECTIONS.unconfirmed },
    ]))).toBe('Resultado en Telegram: 1 persona añadida, 1 persona quedó fuera, 1 sin confirmar.');
    expect(batchNotice(batch([]))).toContain('Nadie fue añadido');
  });

  it('una parada de Telegram se dice dentro del resumen', () => {
    const line = batchNotice(batch([{ id: '1', name: 'A', state: 'added', reason: '' }], 'Telegram solicita una pausa.'));
    expect(line).toContain('Telegram cortó la tanda: Telegram solicita una pausa.');
  });

  it('cerrar el diálogo no se disfraza de tanda vacía', () => {
    expect(batchNotice(batch([], ADD_CANCELLED))).toBe(ADD_REJECTIONS.cancelled);
    expect(batchNotice(batch([], 'Cancelado: nadie fue añadido.'))).not.toBe(ADD_REJECTIONS.cancelled);
  });

  it('la línea de cada persona lleva su motivo exacto o ninguno', () => {
    expect(outcomeLine({ id: '1', name: 'Ana', state: 'added', reason: '' })).toBe('Ana · Añadido');
    expect(outcomeLine({ id: '2', name: 'Bea', state: 'rejected', reason: ADD_REJECTIONS.premiumWouldAllow }))
      .toBe(`Bea · No añadido · ${ADD_REJECTIONS.premiumWouldAllow}`);
    expect(outcomeLine({ id: '3', name: 'Cid', state: 'unclear', reason: '' })).toBe('Cid · Sin confirmar');
  });

  it('el margen de la tanda y del historial son los mismos que en Java', () => {
    expect(batchProblem(0)).toBe(ADD_REJECTIONS.empty);
    expect(batchProblem(21)).toBe(ADD_REJECTIONS.tooMany);
    expect(batchProblem(20)).toBe('');
    expect(forwardProblem(101)).toBe(ADD_REJECTIONS.badForward);
    expect(forwardProblem(-1)).toBe(ADD_REJECTIONS.badForward);
    expect(forwardProblem(100)).toBe('');
    expect(positiveId('0')).toBe(false);
    expect(positiveId('12')).toBe(true);
    expect(positiveId('1.5')).toBe(false);
  });

  it('el historial solo se promete donde la schema lo admite', () => {
    expect(forwardNotice(0)).toBe('');
    expect(forwardNotice(30)).toBe('Verá los 30 mensajes anteriores.');
    expect(forwardNotice(500)).toBe('Verá los 100 mensajes anteriores.');
  });

  it('sin margen conocido se anuncia el criterio de Telegram, no un hueco inventado', () => {
    expect(permissionLine(ADD_REJECTIONS.noRight, 12)).toBe(ADD_REJECTIONS.noRight);
    expect(permissionLine('', -1)).toContain('Telegram decide persona por persona');
    expect(permissionLine('', 7)).toContain('Quedan 7 huecos');
  });
});

describe('ronda P · el panel está conectado', () => {
  it('el permiso se lee antes de ofrecer la acción y los bots se quedan fuera', () => {
    const picker = fn('GroupAddPeople');
    expect(picker).toContain("run<AddPermission>('groups.add.info',{id:chat.id})");
    expect(picker).toContain("run<Contact[]>('contacts.list')");
    expect(picker).toContain('filter(item=>!item.bot)');
    expect(picker).toContain('if(!info.allowed)return <div className="group-add"><p className="settings-note" role="status">{info.reason}</p>{reportView}</div>');
    expect(picker).toContain("const fresh=await run<AddPermission>('groups.add.info',{id:chat.id});if(fresh)setInfo(fresh);");
  });

  it('el control de historial solo aparece en grupos básicos', () => {
    const picker = fn('GroupAddPeople');
    expect(picker).toContain('{info.forward&&<label className="group-add-forward">');
    expect(picker).toContain('max={ADD_LIMITS.forward}');
    expect(picker).toContain('disabled={!picked.length||busy}');
    expect(picker.split('{reportView}').length - 1).toBe(3);
  });

  it('la tanda montada refresca la lista de miembros', () => {
    expect(app).toContain('<GroupAddPeople chat={chat} run={run} showSeats={false} done={()=>setVersion(value=>value+1)}/>');
  });

  it('un grupo básico llega al flujo sin pasar por el panel de supergrupos', () => {
    expect(app).toContain('function openAddPeople(chat:Chat){setDialog({title:`Añadir personas · ${chat.title}`');
    expect(app).toContain("done={()=>setToast('Telegram respondió a la tanda de invitaciones.')}/>});}");
    expect(app).toContain('{(active.type==="group"||active.supergroup===true||active.type==="channel")&&<MenuItem icon={<UserPlus/>} label="Añadir personas" onClick={()=>openAddPeople(active)}/>}');
    expect(app).toContain("{(chat.type==='group'||chat.supergroup===true||chat.type==='channel')&&<MenuItem icon={<UserPlus/>} label=\"Añadir personas\" onClick={()=>{setDialog(undefined);openAddPeople(chat);}}/>}");
    expect(app).toContain('{(active.supergroup===true||active.type==="channel")&&<MenuItem icon={<ShieldCheck/>} label="Administrar miembros"');
    // El orden se mide dentro del panel de Android (`active.`), porque la ronda AX dejó una segunda fila de
    // «Administrar miembros» en la hoja de opciones de Windows, que es de otro sitio y de otra guarda.
    const manage = app.indexOf('{(active.supergroup===true||active.type==="channel")&&<MenuItem icon={<ShieldCheck/>} label="Administrar miembros"');
    const addPeople = app.indexOf('{(active.type==="group"||active.supergroup===true||active.type==="channel")&&<MenuItem icon={<UserPlus/>} label="Añadir personas"');
    expect(app.split('label="Administrar miembros"').length - 1).toBe(2);
    // Tres y no dos desde la ronda BB: la hoja de opciones de Windows también ofrece la firma. Antes era la
    // única puerta del escritorio sin ella, así que el puente respondía y la pantalla no lo pedía.
    expect(app.split('label="Añadir personas"').length - 1).toBe(3);
    expect(manage).toBeGreaterThan(addPeople);
  });

  it('la vista de diseño corta por el mismo orden que el puente', () => {
    const section = preview.slice(preview.indexOf("if (method === 'groups.member.add')"));
    const block = section.slice(0, section.indexOf("if (method === 'groups.createSuper')"));
    expect(block).toContain('batchProblem(ids.length)');
    expect(block).toContain('positiveId(id)');
    expect(block).toContain('forwardProblem(limit)');
    expect(block).toContain('if (!permission.allowed) throw new Error(permission.reason || ADD_REJECTIONS.noRight)');
    expect(block).toContain('new Set(');
  });

  it('el historial solo se ofrece donde TDLib lo lee: en el grupo básico', () => {
    const section = preview.slice(preview.indexOf('function addPermission('));
    const block = section.slice(0, section.indexOf('const storyAlbums'));
    expect(block).toContain("if (chat.type !== 'group' || chat.supergroup === true) return { allowed: true, reason: '', forward: false, remaining: -1 }");
    expect(block).toContain('const remaining = rosterRemaining(rosterRows(state).filter(row => row.inside).length);');
    expect(block).toContain("return { allowed: true, reason: '', forward: true, remaining };");
  });
});
