import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MEMBERSHIP_UNSUPPORTED } from './membership';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rules = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ChatMembership.java');
const cs = text('../../desktop/src/WRGram.Desktop/DesktopMembership.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const membershipUi = text('./membership.ts');
const preview = text('./preview.ts');
const app = text('./App.tsx');

/** El literal que una capa asigna a una constante, en Java (`static final String`) o en C# (`const string`). */
function sentence(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La rama de escritorio del menú del chat: `if(desktop){ … }return;`. */
function desktopMenu(): string {
  const start = app.indexOf('if(desktop){', app.indexOf('function chatMenu'));
  if (start < 0) throw new Error('El menú de escritorio no existe');
  const end = app.indexOf('return;', start);
  if (end < 0) throw new Error('El menú de escritorio no cierra');
  return app.slice(start, end);
}

describe('ronda Z · unirse y salir se niega igual en las tres capas', () => {
  it('la negación de privado y secreto es la misma cadena en Java, C# y la interfaz', () => {
    expect(sentence(java, 'MEMBERSHIP_UNSUPPORTED')).toBe(MEMBERSHIP_UNSUPPORTED);
    expect(sentence(cs, 'Unsupported')).toBe(MEMBERSHIP_UNSUPPORTED);
    expect(membershipUi).toContain(`export const MEMBERSHIP_UNSUPPORTED = '${MEMBERSHIP_UNSUPPORTED}'`);
  });

  it('Windows responde la misma clave que Android, sin inventarse heredad', () => {
    expect(sentence(rules, 'LEFT')).toBe(sentence(cs, 'Left'));
    // La herencia la decide `GetChatOwnerAfterLeaving` en Android; aquí no se pregunta y no se finge.
    expect(cs.includes('7 días')).toBe(false);
    expect(cs.includes('Transferir antes')).toBe(false);
    expect(service.includes('FutureChatCreator')).toBe(false);
  });

  it('el host cumple lo que ofrece y calla lo que no puede cumplir', () => {
    expect(service.includes('"chat.leave" => await LeaveChatAsync(args),')).toBe(true);
    // La ronda AA conectó `chat.join`; lo que sigue sin brazo en el despacho es el traspaso.
    expect(service.includes('"chat.transfer" =>')).toBe(false);
  });
});

describe('ronda Z · el puente de Windows elige la petición que MTProto realmente tiene', () => {
  it('la forma de la clave decide la petición, y privado no es una comunidad', () => {
    const kind = csBody('Of', cs);
    expect(kind).toContain("'g' => Kind.Basic");
    expect(kind).toContain("'c' => Kind.Channel");
    expect(kind).toContain('_ => Kind.Unsupported');
    expect(kind).toContain('char.IsAsciiDigit');
  });

  it('salir no borra el historial: `revoke_messages` en un básico lo borraría para todos', () => {
    expect(cs).toContain('public static bool DeletesHistory(Kind kind) => false;');
    expect(csBody('LeaveChatAsync')).toContain('DesktopMembership.DeletesHistory(kind)');
  });

  it('los dos caminos de MTProto y sus dos guardas de forma están escritos', () => {
    const body = csBody('LeaveChatAsync');
    expect(body).toContain('if (kind == DesktopMembership.Kind.Unsupported) throw new BridgeException(DesktopMembership.Unsupported);');
    expect(body).toContain('Messages_DeleteChatUser(basic.chat_id, new InputUserSelf(), DesktopMembership.DeletesHistory(kind))');
    expect(body).toContain('Channels_LeaveChannel(new InputChannel(peer.channel_id, peer.access_hash))');
    expect(body.match(/DesktopMembership\.Stale/g)?.length).toBe(2);
  });

  it('la fila y el chat abierto se retiran localmente antes de releer la lista', () => {
    const body = csBody('LeaveChatAsync');
    expect(body).toContain('_entries.Remove(entry.Id);');
    expect(body).toContain('_state.Chats = DesktopMembership.Without(_state.Chats, entry.Id);');
    expect(body).toContain('if (_active == entry.Id)');
    expect(body).toContain('await LoadDialogsLocked(_mode, quiet: true);');
    expect(body).toContain('return DesktopMembership.Outcome(DesktopMembership.Left);');
    expect(cs).toContain('chats.Where(chat => chat.Id != id).ToList();');
  });
});

describe('ronda Z · la pantalla de Windows confirma antes de escribir', () => {
  it('el menú de escritorio ofrece salir y pregunta, porque no hay `Dialogs` nativo', () => {
    const menu = desktopMenu();
    // La ronda AA envolvió la pareja en `joinable(chat)?…:…`; la salida sigue siendo la rama contraria.
    expect(menu).toContain(':<MenuItem icon={<X/>} label={chat.type===');
    expect(menu).toContain("confirm('Salir de la comunidad'");
    expect(menu).toContain("()=>void membership('chat.leave',chat)");
  });

  it('y no ofrece lo que el host no puede cumplir', () => {
    // La ronda AA cambió esta aguja: «Unirse» ya sí estaba en el menú de escritorio, así que lo único
    // que sigue sin ofrecer Windows es el traspaso, porque la librería no tiene petición de transferencia.
    const menu = desktopMenu();
    expect(menu.includes('Transferir')).toBe(false);
    expect(menu.includes('chat.transfer')).toBe(false);
  });

  it('la vista de diseño niega privado y secreto antes de mirar la lista', () => {
    expect(preview).toContain(`if (chat && !community(chat)) throw new Error(MEMBERSHIP_UNSUPPORTED);`);
    const leave = preview.slice(preview.indexOf("if (method === 'chat.leave')"));
    expect(leave.slice(0, 400)).toContain('if (chat && !community(chat)) throw new Error(MEMBERSHIP_UNSUPPORTED);');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda Z · la vista de diseño se comporta como los dos puentes', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState(fixture);
    call = designRequest as DesignCall;
  });

  // 11 privado · 26 secreto · 22 canal · 12 grupo · 14 supergrupo propio
  it('en un chat privado o secreto no hay unirse ni salir', async () => {
    for (const id of ['11', '26']) {
      await expect(call('chat.leave', { id })).rejects.toThrow(MEMBERSHIP_UNSUPPORTED);
      await expect(call('chat.join', { id })).rejects.toThrow(MEMBERSHIP_UNSUPPORTED);
    }
  });

  it('salir de un canal responde la misma clave que en Android', async () => {
    expect(await call('chat.leave', { id: '22' })).toEqual({ state: 'left', opened: false });
    await expect(call('chat.leave', { id: '22' })).rejects.toThrow('Esta cuenta ya no es miembro de esa comunidad en Telegram.');
  });

  it('salir y volver a entrar con un grupo sigue siendo un viaje de ida y vuelta', async () => {
    expect(await call('chat.leave', { id: '12' })).toEqual({ state: 'left', opened: false });
    expect(await call('chat.join', { id: '12' })).toEqual({ state: 'joined', opened: false });
  });

  it('la fila del chat al que se dejó de pertenecer sale de la lista', async () => {
    const { snapshot } = await import('./bridge');
    const row = () => snapshot().chats.find(chat => chat.id === '14');
    expect(row()?.inList).not.toBe(false);
    await call('chat.leave', { id: '14' });
    expect(row()?.inList).toBe(false);
  });
});
