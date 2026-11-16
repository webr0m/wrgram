import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const java = (name: string) => source(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const bridge = java('NativeBridge');

const userDriven = () => [...source('./bridge.ts').split('const USER_DRIVEN = new Set([')[1].split(']);')[0].matchAll(/'([^']+)'/g)].map(match => match[1]);

// Cuerpos de los métodos declarados a cuatro espacios, con las llaves balanceadas a mano:
// el archivo es denso y un análisis que se rompe en silencio daría una guarda falsa.
// El `[^{]` descarta la una-línea de `interface LinkSink`, que sin él se hacía pasar por `ok()`
// y conectaba cada clave del despacho con todo el puente.
const bodies = (): Map<string, string> => {
  const out = new Map<string, string>();
  for (const match of bridge.matchAll(/^ {4}(?:private|public|protected|static)[^{;\n]*?\b(\w+)\(/gm)) {
    const open = bridge.indexOf('{', match.index! + match[0].length - 1);
    if (open < 0) continue;
    let depth = 0;
    for (let i = open; i < bridge.length; i++) {
      if (bridge[i] === '{') depth++;
      if (bridge[i] === '}' && --depth === 0) { out.set(match[1], bridge.slice(open, i + 1)); break; }
    }
  }
  return out;
};

const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'new', 'return', 'try', 'else', 'synchronized', 'instanceof', 'super', 'this']);
const calls = (text: string, known: Set<string>) => [...text.matchAll(/\b(\w+)\s*\(/g)].map(match => match[1]).filter(name => known.has(name) && !KEYWORDS.has(name));

/** Tres saltos alcanzan lo que hay en el puente hoy: handler → preparar → confirmar. */
const reach = (seed: string[], bodies: Map<string, string>) => {
  const seen = new Set<string>();
  let frontier = seed;
  for (let hop = 0; hop < 3; hop++) {
    const next: string[] = [];
    for (const name of frontier) {
      if (seen.has(name)) continue;
      seen.add(name);
      next.push(...calls(bodies.get(name) ?? '', new Set(bodies.keys())));
    }
    frontier = next;
  }
  return seen;
};

/** El cuerpo de `switch(method)`, el único sitio donde una clave es un método del puente. */
const dispatch = (): string => {
  const open = bridge.indexOf('switch(method){');
  if (open < 0) throw new Error('No se encontró el despacho del puente.');
  let depth = 0;
  for (let i = open + 'switch(method)'.length; i < bridge.length; i++) {
    if (bridge[i] === '{') depth++;
    if (bridge[i] === '}' && --depth === 0) return bridge.slice(open, i + 1);
  }
  throw new Error('El despacho del puente no cierra.');
};

/** Dónde termina un `case`: en su `break;`, en un `return;` o donde arranca el siguiente. */
const caseEnd = (text: string, from: number): number => {
  const nextCase = /\bcase "/.exec(text.slice(from));
  const edges = [text.indexOf('break;', from), text.indexOf('return;', from), nextCase ? from + nextCase.index : -1];
  return edges.filter(index => index >= from).reduce((last, index) => Math.min(last, index), text.length);
};

const analysed = () => {
  const all = bodies();
  const known = new Set(all.keys());
  const dialogs = new Set([...all].filter(([, body]) => body.includes('Dialogs.builder')).map(([name]) => name));
  const text = dispatch();
  const waiting = new Set<string>();
  for (const match of text.matchAll(/case "([\w.]+)":/g)) {
    const from = match.index! + match[0].length;
    const segment = text.slice(from, caseEnd(text, from));
    if ([...reach(calls(segment, known), all)].some(name => dialogs.has(name))) waiting.add(match[1]);
  }
  return { waiting, dialogs, all };
};

// Ramos que el análisis no puede distinguir: comparten método con otra clave que sí muestra diálogo.
const TOLERATED: Record<string, string> = {
  'contacts.remove': 'el `Dialogs` es de la rama de añadir; quitar responde sin preguntar',
  'bot.edit': 'el diálogo de `botMessageAction` solo se abre con la clase «borrar»',
  'bot.pin': 'el diálogo de `botMessageAction` solo se abre con la clase «borrar»',
  'bot.unpin': 'el diálogo de `botMessageAction` solo se abre con la clase «borrar»',
};

describe('ronda J (transversal): un diálogo nativo no puede caducar a los 35 s', () => {
  const { waiting, dialogs, all } = analysed();

  // `bridge.ts` lee `window` al cargarse, y el entorno de estas pruebas es node puro.
  let requestTimeoutMs: (method: string) => number;
  const previousWindow = (globalThis as { window?: unknown }).window;
  beforeAll(async () => {
    if (!previousWindow) (globalThis as { window?: unknown }).window = {};
    requestTimeoutMs = (await import('./bridge')).requestTimeoutMs;
  });
  afterAll(() => {
    if (!previousWindow) delete (globalThis as { window?: unknown }).window;
  });

  it('el análisis ve los diálogos reales del puente', () => {
    expect(all.size).toBeGreaterThan(200);
    expect([...dialogs].length).toBeGreaterThan(25);
    for (const helper of ['confirmLink', 'confirmScope', 'confirmSafety', 'answerJoinRequest', 'chooseFolderChats']) {
      expect(dialogs.has(helper), helper).toBe(true);
    }
    // Sin tres saltos no se vería `notify.scope.save`: la guarda tiene que atravesar preparar→confirmar.
    expect(waiting.has('notify.scope.save')).toBe(true);
    expect(waiting.has('chat.request.answer')).toBe(true);
    expect(waiting.size).toBeGreaterThan(45);
    // Y no ve diálogos donde no los hay: si el parser vuelve a contaminarse, la guarda se vacía.
    for (const key of ['state', 'chat.pin', 'typing', 'logout', 'media.load', 'history.older', 'chats.list']) {
      expect(waiting.has(key), key).toBe(false);
    }
  });

  it('todo método que puede quedarse esperando a una persona tiene plazo de persona', () => {
    const listed = new Set(userDriven());
    const missing = [...waiting].filter(key => !listed.has(key) && !(key in TOLERATED)).sort();
    expect(missing).toEqual([]);
  });

  it('los descartes tolerados siguen siendo descartes reales', () => {
    // Si el puente deja de abrir diálogo en alguna de estas ramas, sobra la exención.
    for (const key of Object.keys(TOLERATED)) expect(waiting.has(key), key).toBe(true);
  });

  it('los siete métodos que se sumaron en esta ronda esperan cinco minutos', () => {
    for (const key of ['chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke', 'chat.request.answer', 'folders.links.delete', 'chat.paidMessages.set', 'send.paidMedia']) {
      expect(userDriven(), key).toContain(key);
      expect(requestTimeoutMs(key)).toBe(300_000);
    }
  });

  it('los selectores del sistema siguen teniendo plazo de persona', () => {
    // La guarda del párrafo anterior sólo ve los `Dialogs` del puente; la cámara, el archivo,
    // los permisos y el contacto compartido viven en MainActivity y no se detectan desde aquí.
    for (const key of ['attachment.pick', 'attachment.camera', 'attachment.videoNote.record', 'account.photo.pick', 'voice.start', 'story.create.photo', 'story.create.video', 'share.location', 'media.export', 'contacts.import']) {
      expect(userDriven(), key).toContain(key);
    }
  });

  it('lo que no espera a nadie sigue cortándose pronto', () => {
    expect(requestTimeoutMs('chat.requests')).toBe(35_000);
    expect(requestTimeoutMs('notify.scopes')).toBe(35_000);
    expect(requestTimeoutMs('storage.details')).toBe(130_000);
  });

  it('las tres confirmaciones de la ronda G y la cola de la F tenían el hueco abierto', () => {
    // Rondas anteriores documentaron el diálogo nativo y dejaron la respuesta a 35 s.
    expect(bridge).toMatch('case "chat.request.answer":answerJoinRequest(p,a);break;');
    expect(bridge).toMatch('case "chat.invitelink.revoke":revokeInviteLink(p,a);break;');
    expect(bridge).toMatch('case "folders.links.delete":folderLinkChange(p,a,true);break;');
    expect(java('BridgePolicy')).toMatch('"chat.invitelink.create","chat.invitelink.edit","chat.invitelink.revoke"');
  });
});
