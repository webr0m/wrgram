import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { membershipNotice } from './membership';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rules = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/ChatMembership.java');
const cs = text('../../desktop/src/WRGram.Desktop/DesktopMembership.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');

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

/** El `catch` de `JoinChatAsync`, que es donde vive la proyección de los errores de Telegram. */
function joinCatch(): string {
  const body = csBody('JoinChatAsync');
  const start = body.indexOf('catch (RpcException rpc)');
  if (start < 0) throw new Error('JoinChatAsync no captura RpcException');
  let depth = 0;
  for (let i = body.indexOf('{', start); i < body.length; i++) {
    if (body[i] === '{') depth++;
    else if (body[i] === '}' && --depth === 0) return body.slice(start, i + 1);
  }
  throw new Error('El `catch` de JoinChatAsync no cierra');
}

describe('ronda AA · entrar se niega y se afirma con las mismas palabras en las tres capas', () => {
  it('las dos negaciones previas son idénticas en Java y en C#', () => {
    expect(sentence(java, 'MEMBERSHIP_INSIDE')).toBe(sentence(cs, 'Inside'));
    expect(sentence(java, 'MEMBERSHIP_BLOCKED')).toBe(sentence(cs, 'Blocked'));
  });

  it('las dos claves de éxito son las mismas que ya traduce la interfaz', () => {
    expect(sentence(rules, 'JOINED')).toBe(sentence(cs, 'Joined'));
    expect(sentence(rules, 'REQUEST')).toBe(sentence(cs, 'Requested'));
    expect(membershipNotice('joined')).not.toBe('');
    expect(membershipNotice('request')).toContain('solicitud');
  });

  it('Windows no improvisa el camino del enlace: la fila descubierta por usuario público sigue sin hash', () => {
    // La ronda AB añadió `messages.importChatInvite`, pero solo lo llama un enlace que ya trae el código.
    // `chat.join` recibe el id de una fila, y una fila sin enlace no puede inventar el hash de ingreso:
    // prometerlo sería enseñar una pantalla vacía. `WebView` y `guard` tampoco viven en las reglas de
    // pertenencia, sino en `DesktopInviteLinks.cs`, que es la única que habla con un enlace.
    expect(csBody('JoinChatAsync')).not.toContain('ImportChatInvite');
    expect(cs.includes('WebView')).toBe(false);
    expect(cs.includes('guard')).toBe(false);
  });

  it('y un grupo básico se rechaza con su frase, no con una petición que Telegram no acepta', () => {
    expect(csBody('JoinChatAsync')).toContain('if (kind == DesktopMembership.Kind.Basic) throw new BridgeException(DesktopMembership.BasicNeedsLink);');
    expect(sentence(cs, 'BasicNeedsLink')).toContain('enlace de invitación');
  });
});

describe('ronda AA · el puente de Windows elige la petición y escucha la respuesta', () => {
  it('el despacho tiene las dos mitades del viaje', () => {
    expect(service.includes('"chat.join" => await JoinChatAsync(args),')).toBe(true);
    expect(service.includes('"chat.leave" => await LeaveChatAsync(args),')).toBe(true);
  });

  it('antes de escribir mira la pertenencia en la bandera que Telegram dio con la fila', () => {
    const body = csBody('JoinChatAsync');
    expect(body).toContain('DesktopMembership.StandingOf(_chats.GetValueOrDefault(peer.channel_id) as Channel) == DesktopMembership.Standing.Inside');
    expect(body).toContain('throw new BridgeException(DesktopMembership.Inside);');
    expect(body).toContain('var channel = new InputChannel(peer.channel_id, peer.access_hash);');
    expect(body).toContain('await _client.Channels_JoinChannel(channel);');
  });

  it('la bandera `min` manda: un canal recortado no puede negar un ingreso', () => {
    const standing = csBody('StandingOf', cs);
    expect(standing).toContain('if (channel == null) return Standing.Unknown;');
    const min = standing.indexOf('Channel.Flags.min');
    const left = standing.indexOf('Channel.Flags.left');
    expect(min).toBeGreaterThan(0);
    expect(left).toBeGreaterThan(min);
  });

  it('los dos errores con nombre propio se traducen y el resto sube tal cual', () => {
    const caught = joinCatch();
    expect(caught).toContain('if (DesktopMembership.Banned(error)) throw new BridgeException(DesktopMembership.Blocked);');
    expect(caught).toContain('if (!DesktopMembership.RequestSent(error)) throw;');
    expect(cs).toContain('Starts(error, "INVITE_REQUEST_SENT")');
    expect(cs).toContain('Starts(error, "USER_BANNED_IN_CHANNEL")');
    expect(cs).toContain('error.StartsWith(code, StringComparison.Ordinal)');
  });

  it('la solicitud pendiente no convierte la fila en miembro; el ingreso sí', () => {
    const body = csBody('JoinChatAsync');
    expect(joinCatch().includes('MarkInside')).toBe(false);
    // La prueba de posición es la regla: el `request` sale del método antes de que nada marque la fila.
    expect(body.indexOf('return DesktopMembership.Outcome(DesktopMembership.Requested);')).toBeGreaterThan(0);
    expect(body.indexOf('return DesktopMembership.Outcome(DesktopMembership.Requested);'))
      .toBeLessThan(body.indexOf('DesktopMembership.MarkInside(_state.Chats, entry.Id);'));
    expect(body.match(/MarkInside/g)?.length).toBe(1);
    const tail = body.slice(body.indexOf('DesktopMembership.MarkInside'));
    expect(tail).toContain('await LoadDialogsLocked(_mode, quiet: true);');
    expect(tail).toContain('return DesktopMembership.Outcome(DesktopMembership.Joined);');
    expect(csBody('MarkInside', cs)).toContain('row.InList = true;');
  });

  it('la vista de diseño sigue negando el ingreso a quien ya está dentro', () => {
    const join = preview.slice(preview.indexOf("if (method === 'chat.join')"));
    expect(join.slice(0, 600)).toContain("if (chat && chat.inList !== false) throw new Error(INSIDE_NOTICE);");
  });
});

describe('ronda AA · la pantalla de Windows pregunta antes de entrar', () => {
  it('ofrece unirse cuando la fila no está en la lista, y salir en caso contrario', () => {
    const menu = desktopMenu();
    expect(menu).toContain('{community(chat)&&(joinable(chat)?<MenuItem icon={<Plus/>} label={chat.type===');
    expect(menu).toContain("confirm('Unirse a la comunidad'");
    expect(menu).toContain("()=>void membership('chat.join',chat)");
    expect(menu).toContain("confirm('Salir de la comunidad'");
    expect(menu).toContain("()=>void membership('chat.leave',chat)");
  });

  it('y sigue sin ofrecer el traspaso, que la librería no tiene', () => {
    const menu = desktopMenu();
    expect(menu.includes('Transferir')).toBe(false);
    expect(menu.includes('chat.transfer')).toBe(false);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AA · las dos respuestas que da Windows son las que la interfaz sabe leer', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState(fixture);
    call = designRequest as DesignCall;
  });

  // 992 entra directo · 991 queda como solicitud · 12 ya es miembro · 995 rechaza el ingreso
  it('el ingreso normal y la solicitud pendiente caben en el mismo contrato', async () => {
    expect(await call('chat.join', { id: '992' })).toEqual({ state: 'joined', opened: false });
    expect(await call('chat.join', { id: '991' })).toEqual({ state: 'request', opened: false });
  });

  it('un chat al que ya se pertenece no se vuelve a unir', async () => {
    await expect(call('chat.join', { id: '12' })).rejects.toThrow('Esta cuenta ya es miembro de esa comunidad en Telegram.');
  });

  it('y un rechazo no se disimula de éxito: la fila no cambia de estado', async () => {
    const { snapshot } = await import('./bridge');
    expect(await call('chat.join', { id: '995' })).toEqual({ state: 'declined', opened: false });
    expect(snapshot().chats.some(chat => chat.id === '995')).toBe(false);
  });
});
