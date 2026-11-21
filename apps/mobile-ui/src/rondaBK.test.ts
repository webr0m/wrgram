import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const preview = text('./preview.ts');
const gap = text('./desktopGap.ts');
const scope = text('./desktopScope.ts');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const pinRules = text('../../desktop/src/WRGram.Desktop/DesktopMessagePin.cs');
const pollRules = text('../../desktop/src/WRGram.Desktop/DesktopPoll.cs');
const reactRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageReact.cs');
const photoRules = text('../../desktop/src/WRGram.Desktop/DesktopChatPhoto.cs');
const liveRules = text('../../desktop/src/WRGram.Desktop/DesktopLiveLocation.cs');
const liveScaffold = text('./liveLocation.ts');

/** El literal que C# asigna a una constante de texto. */
function csSentence(name: string, from: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}

/** El cuerpo de un objeto de frases de `preview.ts`, cortado por su llave de cierre. */
function tsBlock(name: string, from = preview): string {
  const start = from.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  const end = from.indexOf('\n};', start);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return from.slice(start, end);
}

/** La cadena que ese objeto asigna a una propiedad. */
function tsProperty(object: string, key: string, from = preview): string {
  const match = new RegExp(`\\b${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(tsBlock(object, from));
  if (!match) throw new Error(`Falta ${key} en ${object}`);
  return match[1];
}

const serviceLines = service.split(/\r?\n/);
const switchStart = serviceLines.findIndex(row => row.includes('object? result = method switch'));
const genericLine = serviceLines.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
if (switchStart < 0 || genericLine < 0) throw new Error('No se encuentra el despacho de Windows');

/** Las claves que el host atiende y las que se niegan a sí mismas, medidas dentro de su propio `switch`. */
function dispatch() {
  const answered = new Set<string>();
  const refused = new Map<string, number>();
  serviceLines.slice(switchStart, genericLine + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(m => m[1]);
    if (!keys.length) return;
    const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
    for (const key of keys) (negative ? refused.set(key, switchStart + offset + 1) : answered.add(key));
  });
  serviceLines.slice(0, switchStart).forEach(row => {
    const pre = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (pre) answered.add(pre);
  });
  return { answered, refused };
}
const cable = dispatch();

/** Las afirmaciones de una de las dos listas del aviso, según dónde caiga dentro del módulo. */
function claims(side: 'available' | 'pending'): string[] {
  const cut = scope.indexOf('DESKTOP_PENDING');
  return [...scope.matchAll(/\{ label: '([^']+)', methods: \[([^\]]*)\] \}/g)]
    .filter(match => (side === 'pending' ? scope.indexOf(match[0]) >= cut : scope.indexOf(match[0]) < cut))
    .flatMap(match => [...match[2].matchAll(/'([^']+)'/g)].map(m => m[1]));
}
const pending = claims('pending');
const available = claims('available');

/** Las cinco claves que `desktopGap.ts` deja pasar porque su frase con nombre dice más que la genérica. */
const namedInScaffold = [...gap.matchAll(/'([a-z][a-zA-Z0-9._]*)'/g)].map(m => m[1]);

/** Las diez que BJ encontró fingiendo resultado en escritorio sin tener brazo en el host. */
const fakes = ['message.retry', 'groups.createSuper', 'forum.create', 'forum.topics', 'chat.transfer',
  'chat.transfer.check', 'contacts.sync.set', 'contacts.sync.now', 'chat.safety', 'chat.safety.dismiss'];

const generic = (method: string) => `No disponible en escritorio (beta): ${method}`;

/** Una llamada y su mensaje de error, sin `try/catch` en medio de cada prueba. */
async function failure(call: (method: string, params?: Record<string, unknown>) => Promise<unknown>, method: string, params: Record<string, unknown> = {}) {
  return call(method, params).then(() => new Error('respondió sin negarse'), (reason: unknown) => reason as Error);
}

describe('ronda BK · medido en el texto de las dos capas', () => {
  it('la puerta es lo primero que hace el andamio después de leer el estado', () => {
    const opened = preview.indexOf('export async function designRequest');
    const read = preview.indexOf('const state = snapshot();', opened);
    const gate = preview.indexOf('desktopGapRefusal(method)', opened);
    const firstArm = preview.indexOf("if (method === 'appearance')", opened);
    expect(opened).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(opened);
    expect(gate).toBeGreaterThan(read);
    expect(gate).toBeLessThan(firstArm);
    expect(preview.slice(gate - 160, gate)).toContain("state.platform === 'desktop'");
  });

  it('la puerta no se inventa ninguna clave: las saca todas del aviso medido', () => {
    expect(gap).toContain("from './desktopScope'");
    expect(gap).toContain('DESKTOP_PENDING.flatMap(claim => claim.methods)');
    expect([...namedInScaffold].sort()).toEqual(['chat.photo.delete', 'location.live.start', 'message.react.paid', 'pinned.list', 'poll.stop']);
    const written = [...gap.matchAll(/const DESKTOP_NAMED_IN_SCAFFOLD[^\n]*\n\s+([^\n]+)/g)][0]?.[1] ?? '';
    expect(written.split(',').filter(Boolean).length).toBe(5);
  });

  it('la frase genérica del andamio es la línea que el host reserva para lo que no tiene brazo', () => {
    expect(serviceLines[genericLine]).toContain('_ => throw new BridgeException($"No disponible en escritorio (beta): {method}")');
    expect(gap).toContain('No disponible en escritorio (beta): ${method}');
  });

  it('las cinco que saltan la puerta la saltan de verdad, y con la frase del host', () => {
    const pairs: [string, string, string][] = [
      ['message.react.paid', tsProperty('REACT_REFUSALS', 'paid'), csSentence('PaidRefused', reactRules)],
      ['poll.stop', tsProperty('POLL_REFUSALS', 'noStop'), csSentence('NoStop', pollRules)],
      ['pinned.list', tsProperty('PIN_REFUSALS', 'list'), csSentence('NoList', pinRules)],
      ['chat.photo.delete', tsProperty('CHAT_PHOTO', 'noDelete'), csSentence('NoDelete', photoRules)],
      ['location.live.start', tsProperty('LIVE_REFUSALS', 'noSensor', liveScaffold), csSentence('NoSensor', liveRules)],
    ];
    for (const [method, mirror, host] of pairs) {
      expect(mirror).toBe(host);
      expect(cable.refused.get(method)).toBeGreaterThan(0);
      expect(namedInScaffold).toContain(method);
    }
  });

  it('ninguna de las cinco negadas por nombre puede acabar en la puerta genérica', () => {
    for (const key of namedInScaffold) {
      expect(pending).toContain(key);
      expect(available).not.toContain(key);
      expect(cable.answered.has(key)).toBe(false);
    }
  });

  it('ninguna clave que el host atiende está citada como pendiente', () => {
    expect(pending.filter(key => cable.answered.has(key))).toEqual([]);
  });

  it('el andamio no modela ninguna pendiente delante de la puerta', () => {
    const before = preview.slice(0, preview.indexOf('desktopGapRefusal(method)'));
    const offenders = [...before.matchAll(/if \(method === '([a-z][a-zA-Z0-9._]*)'/g)]
      .map(m => m[1])
      .filter(key => pending.includes(key) && !namedInScaffold.includes(key));
    expect(offenders).toEqual([]);
  });

  it('lo que la puerta calla en escritorio sigue modelado para Android', () => {
    for (const key of fakes) {
      const arm = preview.split(/\r?\n/).filter(row => row.includes(`method === '${key}'`));
      expect(arm.length, `falta el brazo de ${key}`).toBeGreaterThan(0);
      // La negación de escritorio no se metió dentro del brazo: quien la dice ahora es la puerta de arriba.
      expect(arm.every(row => !row.includes("state.platform === 'desktop'"))).toBe(true);
    }
  });
});

type Call = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Boot = { call: Call; snap: () => Record<string, unknown> };

async function boot(platform: 'android' | 'web' | 'desktop'): Promise<Boot> {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  const transport = await import('./bridge');
  transport.acceptState({ ...fixture, platform });
  return { call: designRequest as Call, snap: () => transport.snapshot() as unknown as Record<string, unknown> };
}

describe('ronda BK · medido llamando de verdad', () => {
  let desktop: Boot = { call: async () => undefined, snap: () => ({}) };

  beforeEach(async () => {
    desktop = await boot('desktop');
  });

  it('las diez que fingían se niegan con la frase del host, con los parámetros con los que antes respondían', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['message.retry', { id: '114' }],
      ['groups.createSuper', { title: 'Barrio', description: '', kind: 'supergroup' }],
      ['forum.create', { id: '12', name: 'Recados' }],
      ['forum.topics', { id: '12' }],
      ['chat.transfer', { id: '14', userId: '502', password: 'x' }],
      ['chat.transfer.check', { id: '14' }],
      ['contacts.sync.set', { value: true }],
      ['contacts.sync.now', {}],
      ['chat.safety', { id: '21' }],
      ['chat.safety.dismiss', { id: '21', accountId: '1' }],
    ];
    for (const [method, params] of cases) {
      expect(await failure(desktop.call, method, params)).toHaveProperty('message', generic(method));
    }
  });

  it('y se niegan todas las pendientes citadas, sin ninguna lista escrita a mano', async () => {
    const missed: string[] = [];
    for (const method of pending) {
      if (namedInScaffold.includes(method)) continue;
      const error = await failure(desktop.call, method, { id: '11', chatId: '11', offset: 0, limit: 8 });
      if (error.message !== generic(method)) missed.push(`${method} → ${error.message}`);
    }
    expect(missed).toEqual([]);
  });

  it('las cinco con nombre siguen diciendo la suya y no el genérico', async () => {
    const expected: Record<string, string> = {
      'message.react.paid': tsProperty('REACT_REFUSALS', 'paid'),
      'poll.stop': tsProperty('POLL_REFUSALS', 'noStop'),
      'pinned.list': tsProperty('PIN_REFUSALS', 'list'),
      'chat.photo.delete': tsProperty('CHAT_PHOTO', 'noDelete'),
      // La quinta la trae la ronda CB: el brazo existe, lo que falta es una coordenada que el equipo no puede leer.
      'location.live.start': tsProperty('LIVE_REFUSALS', 'noSensor', liveScaffold),
    };
    for (const [method, phrase] of Object.entries(expected)) {
      const error = await failure(desktop.call, method, { id: '101', emoji: '👍', count: '5' });
      expect(error.message).toBe(phrase);
      expect(error.message).not.toBe(generic(method));
    }
  });

  it('negar no escribe: el estado del andamio queda exactamente igual', async () => {
    const before = JSON.stringify(desktop.snap());
    for (const method of fakes) await failure(desktop.call, method, { id: '11', value: true });
    expect(JSON.stringify(desktop.snap())).toBe(before);
  });

  it('la puerta no cierra lo que Windows sí atiende', async () => {
    await expect(desktop.call('appearance', { theme: 'dark' })).resolves.toBe(true);
    await expect(desktop.call('chats.list', {})).resolves.toBe(true);
    expect(Array.isArray(await desktop.call('privacy.get', {}))).toBe(true);
    const sync = await desktop.call('contacts.sync.status', {});
    expect(sync).toBeTruthy();
  });

  it('en Android las diez siguen respondiendo como antes de esta ronda', async () => {
    const phone = await boot('android');
    await expect(phone.call('groups.createSuper', { title: 'Barrio', description: '', kind: 'supergroup' })).resolves.toEqual({ id: '99' });
    await expect(phone.call('forum.topics', { id: '12' })).resolves.toBeInstanceOf(Array);
    await expect(phone.call('chat.transfer.check', { id: '14' })).resolves.toEqual({ state: 'password', retryAfter: 0 });
    expect((await phone.call('contacts.sync.set', { value: false }) as { enabled: boolean }).enabled).toBe(false);
    await expect(phone.call('chat.safety', { id: '21' })).resolves.toBeTruthy();
    await expect(phone.call('message.retry', { id: '114' })).resolves.toBe(true);
    const forum = await phone.call('forum.create', { id: '12', name: 'Recados' });
    expect((forum as { name: string }).name).toBe('Recados');
  });
});
