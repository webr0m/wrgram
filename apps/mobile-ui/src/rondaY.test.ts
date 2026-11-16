import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMembership } from './contract';
import {
  BAD_RECIPIENT, NO_SUCCESSOR, SELF_RECIPIENT, UNSUPPORTED, candidates, community, eligible, exitNotice, rosterMethod,
} from './chatOwnership';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const bridge = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rules = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ChatOwnership.java');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const membershipUi = text('./membership.ts');
const contract = text('./contract.ts');
const transport = text('./bridge.ts');

/** Cuerpo de un método de Java, desde su firma hasta la llave que lo cierra. */
function javaBody(name: string, from = bridge): string {
  const start = from.search(new RegExp(`(?:private|static)[^\\n;=]*\\b${name}\\(`));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** El literal que Java asigna a una constante `static final String`. */
function javaSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"([^"]+)"`).exec(rules);
  if (!match) throw new Error(`Falta la frase ChatOwnership.${name}`);
  return match[1];
}

const SENTENCES: [string, string, string][] = [
  ['UNSUPPORTED', 'ChatOwnership.UNSUPPORTED', UNSUPPORTED],
  ['BAD_RECIPIENT', 'ChatOwnership.BAD_RECIPIENT', BAD_RECIPIENT],
  ['SELF_RECIPIENT', 'ChatOwnership.SELF_RECIPIENT', SELF_RECIPIENT],
  ['NO_SUCCESSOR', 'ChatOwnership.NO_SUCCESSOR', NO_SUCCESSOR],
];

describe('ronda Y · la salida del propietario y el traspaso', () => {
  it('las cuatro condenas son la misma cadena en Java y en TypeScript', () => {
    for (const [name, needle, mirrored] of SENTENCES) {
      expect(javaSentence(name), name).toBe(mirrored);
      expect(bridge.includes(needle), needle).toBe(true);
    }
  });

  it('los dos momentos y la respuesta de traspaso se llaman igual en las dos capas', () => {
    expect(javaSentence('IMMEDIATE')).toBe('immediate');
    expect(javaSentence('SEVEN_DAYS')).toBe('seven_days');
    expect(javaSentence('TRANSFER')).toBe('transfer');
    expect(bridge.includes('"transfer"'), 'el puente no escribe la clave a mano').toBe(false);
    expect(membershipUi.includes("case 'transfer'"), 'la interfaz nombra la respuesta').toBe(true);
  });

  it('salir siendo propietario se decide antes de confirmar y pregunta al propio Telegram', () => {
    const leave = javaBody('chatLeave');
    expect(leave).toContain('if (ChatOwnership.creator(status)) { readSuccessor(a, chat); return; }');
    // El `LeaveChat` corriente sigue existiendo donde la cuenta no es la dueña.
    expect(leave).toContain('confirmMembership(a, ChatMembership.LEFT, chat,');
    const heir = javaBody('readSuccessor');
    expect(heir).toContain('new TdApi.GetChatOwnerAfterLeaving(chat.id)');
    expect(heir).toContain('ignored -> confirmOwnerExit(a, chat, "")');
    expect(javaBody('confirmOwnerExit')).toContain('new TdApi.LeaveChat(chat.id)');
  });

  it('el diálogo nativo de la propietaria ofrece elegir heredero en vez de aceptarlo', () => {
    const dialog = javaBody('confirmOwnerExit');
    expect(dialog).toContain('ChatOwnership.exitMessage(chat.title, heir, chat)');
    expect(dialog).toContain('.setNegativeButton("Cancelar"');
    expect(dialog).toContain('.setNeutralButton("Transferir antes", (d, w) -> answerMembership(a, ChatOwnership.TRANSFER, false))');
    expect(dialog).toContain('answerOwnerExit(a, chat, heir)');
    expect(dialog).toContain('.setOnCancelListener(d -> answerMembership(a, ChatMembership.CANCELLED, false)).show()');
    expect(javaBody('answerOwnerExit')).toContain('"when", ChatOwnership.moment(chat)');
  });

  it('la transferencia deja de negarse en los grupos básicos, que es como se documenta', () => {
    expect(bridge.includes('La transferencia de propiedad solo está disponible en supergrupos y canales.'),
      'la frase inventada se fue').toBe(false);
    expect(javaBody('transferOwnershipCheck')).toContain('if(!ChatOwnership.applicable(chat)){answer.fail(ChatOwnership.UNSUPPORTED);return;}');
    expect(javaBody('transferOwnership')).toContain('if(!ChatOwnership.applicable(chat)){answer.fail(ChatOwnership.UNSUPPORTED);return;}');
    // El destinatario se comprueba con la respuesta de Telegram, no con la fila pintada.
    expect(javaBody('transferOwnership')).toContain('perform(new TdApi.GetUser(userId),answer,user->{');
    expect(javaBody('transferOwnership')).toContain('if(!ChatOwnership.recipient(user,session.selfId)){answer.fail(ChatOwnership.BAD_RECIPIENT);return;}');
    expect(javaBody('transferOwnership')).toContain('throw new IllegalArgumentException(ChatOwnership.SELF_RECIPIENT)');
  });

  it('el aviso de salida dice lo que la schema, según el tipo de chat', () => {
    const basic = exitNotice('immediate', 'Álex Moreno');
    expect(basic).toContain('grupo básico');
    expect(basic).toContain('Álex Moreno');
    expect(basic).not.toContain('7 días');
    const delayed = exitNotice('seven_days', 'María Fernández');
    expect(delayed).toContain('7 días');
    expect(delayed).toContain('María Fernández');
    expect(exitNotice('immediate', '  ')).toBe(`Saliste de la comunidad. ${NO_SUCCESSOR}`);
    expect(exitNotice(undefined, undefined)).toBe(`Saliste de la comunidad. ${NO_SUCCESSOR}`);
  });

  it('la lista de un básico y la de un supergrupo se piden cada una donde existe', () => {
    expect(rosterMethod({ type: 'group', supergroup: undefined })).toBe('groups.members.basic');
    expect(rosterMethod({ type: 'group', supergroup: true })).toBe('groups.members');
    expect(rosterMethod({ type: 'channel' })).toBe('groups.members');
    expect(community({ type: 'private' })).toBe(false);
    expect(community({ type: 'secret' })).toBe(false);
    expect(community({ type: 'group' })).toBe(true);
    expect(app).toContain('const method=rosterMethod(chat);');
    expect(app).toContain('candidates(method,page).filter(eligible)');
  });

  it('las agujas de la interfaz, el contrato y la simulación están en su sitio', () => {
    expect(app).toContain('if(answer.state===TRANSFER_STATE){openTransferOwnership(chat);return;}');
    expect(app).toContain('answer.owner?exitNotice(answer.when,answer.successor)');
    expect(contract).toContain('export interface ChatMembership {state:string;opened:boolean;owner?:boolean;when?:string;successor?:string}');
    expect(preview).toContain('const ownedChats: Record<string, { heir: string; basic: boolean }> = {');
    expect(preview).toContain('when: owned.basic ? MOMENTS.immediate : MOMENTS.sevenDays,');
    expect(preview).toContain('delete ownedChats[String(params.id)];');
    expect(preview).toContain('if (!chat || !community(chat)) throw new Error(UNSUPPORTED);');
    expect(preview).toContain('if (id === state.selfId) throw new Error(SELF_RECIPIENT);');
    // La regla vive en `community()`: el grupo básico dejó de estar excluido y el menú lo ofrece junto a «Salir».
    expect(app).toContain('{community(active)&&<MenuItem icon={<ArrowRight/>} label="Transferir propiedad"');
    expect(app).toContain('{community(chat)&&<MenuItem icon={<ArrowRight/>} label="Transferir propiedad"');
    expect(app.includes('active.type==="group"||active.type==="channel")&&<MenuItem icon={<ArrowRight/>}')).toBe(false);
  });

  it('confirmar en nativo sigue siendo plazo de persona', () => {
    const list = transport.slice(transport.indexOf('const USER_DRIVEN = new Set(['));
    const driven = [...list.slice(0, list.indexOf(']);')).matchAll(/'([^']+)'/g)].map(match => match[1]);
    expect(driven).toContain('chat.leave');
    expect(driven).toContain('chat.transfer');
  });

  it('ninguna frase del flujo se escribe a mano en la capa que la consume', () => {
    expect(preview.includes('"Telegram no entrega la propiedad a un bot')).toBe(false);
    expect(app.includes('La propiedad solo existe en comunidades')).toBe(false);
    expect(rules.includes('groups.members')).toBe(false);
  });
});

type Page = { chats: { id: string; inList?: boolean }[] };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda Y · el flujo recorrido contra el puente de diseño', () => {
  let call: DesignCall = async () => undefined;
  let live: () => Page = () => ({ chats: [] });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState(fixture);
    live = transport.snapshot;
    call = designRequest as DesignCall;
  });

  const chat = (id: string) => live().chats.find(item => item.id === id) ?? { id };
  async function leave(id: string): Promise<ChatMembership> {
    return await call('chat.leave', { id }) as ChatMembership;
  }

  it('salir del supergrupo que la cuenta posee avisa del heredero y del plazo', async () => {
    const answer = await leave('14');
    expect(answer).toEqual({ state: 'left', opened: false, owner: true, when: 'seven_days', successor: 'María Fernández' });
    expect(chat('14').inList).toBe(false);
    expect(exitNotice(answer.when, answer.successor)).toContain('7 días');
  });

  it('salir del grupo básico entrega la propiedad en el mismo instante', async () => {
    const answer = await leave('18');
    expect(answer.owner).toBe(true);
    expect(answer.when).toBe('immediate');
    expect(answer.successor).toBe('Álex Moreno');
  });

  it('salir de una comunidad que no es tuya no inventa heredero', async () => {
    expect(await leave('12')).toEqual({ state: 'left', opened: false });
    await expect(leave('12')).rejects.toThrow('Esta cuenta ya no es miembro de esa comunidad en Telegram.');
  });

  it('entregar la propiedad quita el heredo y devuelve la salida normal', async () => {
    expect(await call('chat.transfer', { id: '14', userId: '503', password: '' })).toBe(true);
    expect(await leave('14')).toEqual({ state: 'left', opened: false });
  });

  it('la schema excluye bots, cuentas eliminadas y la propia cuenta', async () => {
    await expect(call('chat.transfer', { id: '14', userId: '504' })).rejects.toThrow(BAD_RECIPIENT);
    await expect(call('chat.transfer', { id: '14', userId: '507' })).rejects.toThrow(BAD_RECIPIENT);
    await expect(call('chat.transfer', { id: '14', userId: '999' })).rejects.toThrow(BAD_RECIPIENT);
    await expect(call('chat.transfer', { id: '14', userId: '1' })).rejects.toThrow(SELF_RECIPIENT);
  });

  it('en un chat privado no hay propiedad que transferir ni que heredar', async () => {
    await expect(call('chat.transfer', { id: '11', userId: '502' })).rejects.toThrow(UNSUPPORTED);
    await expect(call('chat.transfer.check', { id: '11' })).rejects.toThrow(UNSUPPORTED);
    await expect(call('chat.transfer.check', { id: '14' })).resolves.toEqual({ state: 'password', retryAfter: 0 });
  });

  it('las dos listas se normalizan a la misma tabla y el filtro deja fuera al bot', async () => {
    const basicMethod = rosterMethod({ type: 'group' });
    const page = await call(basicMethod, { id: '18' });
    const rows = candidates(basicMethod, page);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some(row => row.bot)).toBe(true);
    expect(eligible({ bot: true })).toBe(false);
    expect(eligible({ deleted: true })).toBe(false);
    expect(eligible({ self: true })).toBe(false);
    expect(eligible({ name: 'x' } as never)).toBe(true);
    const superMethod = rosterMethod({ type: 'group', supergroup: true });
    expect(candidates(superMethod, await call(superMethod, { id: '14' })).filter(eligible).map(row => row.id))
      .toEqual(['501', '502', '503']);
  });
});
