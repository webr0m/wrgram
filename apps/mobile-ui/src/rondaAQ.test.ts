import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopPrivateChat.cs');
const savedFilters = text('../../desktop/src/WRGram.Desktop/DesktopSavedFilters.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const card = text('./MessageExtraCard.tsx');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

/** El literal que la clase de reglas asigna a una constante de C#. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, from: string) => from.split(needle).length - 1;
const at = (needle: string, from: string) => {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
};

describe('ronda AQ · el puente, medido con la vista de diseño', () => {
  it('las dos frases del puente viajan carácter a carácter al espejo', () => {
    expect(tsProperty('badId')).toBe(csSentence('BadId'));
    expect(tsProperty('unknown')).toBe(csSentence('Unknown'));
    // La tercera es del andamio y solo del andamio: el puente real abre el hilo vacío sin preguntar.
    expect(rules).not.toContain('La vista de diseño no abre');
    expect(service).not.toContain(tsProperty('noThread'));
  });

  it('«inicia sesión» es una frase y la dicen los dos brazos que abren', () => {
    expect(count('public const string NoAccount', rules)).toBe(1);
    expect(csBody('OpenChatAsync')).toContain('throw new BridgeException(DesktopPrivateChat.NoAccount)');
    expect(csBody('OpenContactAsync')).toContain('throw new BridgeException(DesktopPrivateChat.NoAccount)');
    // La literal que estaba escrita a pelo en el brazo ya no puede volver: dos frases iguales son dos verdades distintas.
    expect(count('"Inicia sesión para abrir conversaciones."', service)).toBe(0);
  });

  it('la forma del identificador no se inventa dos veces en este host', () => {
    expect(count('static bool ChatToken(', savedFilters)).toBe(1);
    expect(csBody('KeyOf', rules)).toContain('DesktopSavedFilters.ChatToken(key)');
    // Y la clave es la que ya sabe leer `FindEntry`: `u` + número, la misma que fabrica `PeerKey`.
    expect(csBody('KeyOf', rules)).toContain('"u" + userId.Trim()');
    expect(service).toContain('"u" + user.user_id');
  });

  it('UserIdOf no tiene una segunda manera de fallar', () => {
    const body = csBody('UserIdOf', rules);
    expect(body).toContain('KeyOf(userId)');
    expect(body).toContain('? 0 : value');
    // El brazo confía en eso: cero y forma inválida se niegan con la misma frase.
    expect(csBody('OpenContactAsync')).toContain('if (key == null || person == 0)');
  });

  it('el orden del brazo es el orden del espejo', () => {
    const body = csBody('OpenContactAsync');
    expect(at('DesktopPrivateChat.BadId', body)).toBeLessThan(at('DesktopPrivateChat.NoAccount', body));
    expect(at('DesktopPrivateChat.NoAccount', body)).toBeLessThan(at('DesktopPrivateChat.Unknown', body));
    expect(at('await OpenChatAsync(key)', body)).toBeGreaterThan(at('DesktopPrivateChat.Unknown', body));
    const mirror = tsBody('desktopOpenContact');
    expect(at('CONTACT_OPEN_REFUSALS.badId', mirror)).toBeLessThan(at('CONTACT_OPEN_REFUSALS.unknown', mirror));
    expect(at('CONTACT_OPEN_REFUSALS.unknown', mirror)).toBeLessThan(at('CONTACT_OPEN_REFUSALS.noThread', mirror));
  });

  it('BadId es el «Invalid identifier» de Android dicho en español', () => {
    // La divergencia de idioma del andamio ya está escrita en la ronda AN; aquí solo se mantiene la regla.
    expect(policy).toContain('throw new IllegalArgumentException("Invalid identifier")');
    expect(csSentence('BadId')).toContain('identificador');
  });

  it('Android no se tocó: sigue creando el chat privado y abriéndolo', () => {
    expect(java).toContain('case "contacts.open":{requireAccount();long userId=BridgePolicy.id(p,"id");');
    expect(java).toContain('new TdApi.CreatePrivateChat(userId,false)');
    expect(java).toContain('session.open(chat.id);a.ok(Long.toString(chat.id))');
    expect(policy).toContain('"contacts.open"');
  });

  it('el brazo y el espejo entran por su nombre, una sola vez', () => {
    expect(count('"contacts.open" => await OpenContactAsync(Str(args, "id")),', service)).toBe(1);
    expect(count("if (method === 'contacts.open' && state.platform === 'desktop') return desktopOpenContact(params, state);", preview)).toBe(1);
    // La rama de Android del andamio sigue devolviendo el identificador, que es lo que siempre devolvió.
    expect(count("if (method === 'contacts.open') return String(params.id);", preview)).toBe(1);
    expect(at('contacts.open', preview)).toBeLessThan(at('chats.list', preview));
  });

  it('la burbuja deja de esconder el atajo en Windows', () => {
    expect(count('openUser={desktop?undefined:openUser}', app)).toBe(0);
    expect(count('openUser={openUser}', app)).toBe(3);
    // Y el botón de la tarjeta sigue pidiendo las dos cosas: que la persona tenga id y que alguien sepa abrirla.
    expect(count('{extra.userId&&openUser&&<button', card)).toBe(1);
    expect(count('>Abrir chat</button>', card)).toBe(1);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Snap = { active: string; selfId: string; canSend: boolean; platform: string; chats: { id: string }[] };

describe('ronda AQ · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', canSend: true, platform: 'desktop', chats: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', active: '14', selfId: '1', canSend: false });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  /** Abre a la persona que se le diga y dice en qué conversación quedó la pantalla. */
  const open = async (id: unknown) => {
    await call('contacts.open', { id: String(id) });
    return snap().active;
  };

  /** Lo mismo, esperando la negativa y que la pantalla no se haya movido. */
  const refused = async (id: unknown) => {
    const before = snap().active;
    const error = await call('contacts.open', { id: String(id) }).then(() => '').catch((caught: Error) => caught.message);
    return { error, moved: snap().active !== before };
  };

  it('abrir a quien tiene conversación mueve la pantalla a esa conversación', async () => {
    // Sofía López es el id 503 y su hilo privado es el chat 15; salir de 14 y entrar en 15 es todo el flujo.
    expect(await open('503')).toBe('15');
    expect(snap().chats.some(chat => chat.id === '15')).toBe(true);
  });

  it('y la conversación de una entra por la de la otra, no se suman', async () => {
    expect(await open('502')).toBe('11');
    expect(await open('503')).toBe('15');
    expect(snap().chats.filter(chat => chat.id === '15').length).toBe(1);
  });

  it('la pantalla se queda sin permiso de escribir donde el andamio no lo tiene', async () => {
    // `chat.open` es la que decide el `canSend`, y el andamio solo deja escribir en dos conversaciones.
    expect(await open('503')).toBe('15');
    expect(snap().canSend).toBe(false);
    expect(await open('502')).toBe('11');
    expect(snap().canSend).toBe(true);
  });

  it('conocida sin hilo: el andamio lo dice con nombre y no se mueve', async () => {
    // Nuria Cabrera está en la agenda y no tiene conversación privada; el puente real sí abriría una vacía.
    const { error, moved } = await refused('707');
    expect(error).toBe(tsProperty('noThread'));
    expect(moved).toBe(false);
  });

  it('desconocida: la frase es la del access_hash que no se puede pedir', async () => {
    for (const id of ['999999', '1']) {
      const { error, moved } = await refused(id);
      expect(error).toBe(csSentence('Unknown'));
      expect(moved).toBe(false);
    }
  });

  it('identificador con forma: la regla es la de BridgePolicy, no un capricho del espejo', async () => {
    for (const id of ['', ' ', 'abc', '0', '-5', '1e3', '9'.repeat(20)]) {
      const { error } = await refused(id);
      expect(error, id).toBe(csSentence('BadId'));
    }
    // Diecinueve dígitos es el tope que Java acepta con `Long.parseLong`: pasa la forma y cae en la desconocida,
    // que es la prueba de que las dos negativas no se han fundido en una.
    const { error } = await refused('9'.repeat(19));
    expect(error).toBe(csSentence('Unknown'));
  });

  it('en Android el espejo sigue devolviendo el identificador, que era lo que devolvía', async () => {
    set({ platform: 'android', active: '14' });
    expect(await call('contacts.open', { id: '502' })).toBe('502');
    expect(snap().active).toBe('14');
  });
});
