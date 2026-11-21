import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_AVAILABLE_TEXT, DESKTOP_PENDING, DESKTOP_PENDING_TEXT } from './desktopScope';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const allowed = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const scope = text('./desktopScope.ts');
const settings = text('./SettingsPage.tsx');
const serviceLines = service.split('\n');

function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}

/**
 * El despacho de Windows, recortado entre su `switch` y el rechazo genérico que cierra la lista. El recorte no es
 * un detalle: `TelegramService.cs` tiene otros `switch` con líneas de forma idéntica —el de los tipos de entidad,
 * que tiene `"bold" =>` igual que una orden—, y leer el archivo entero daría por contestadas claves que el puente
 * nunca recibe. Las dos órdenes atendidas **antes** del `switch` (`media.load` y `media.retry`) se suman aparte,
 * porque fuera del despacho también son respuestas del cable.
 */
function dispatch(from: string[]) {
  const start = from.findIndex(row => row.includes('object? result = method switch'));
  const end = from.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  if (start < 0 || end < 0) throw new Error('No se encuentra el despacho de Windows');
  const answered = new Map<string, number>();
  const refused = new Map<string, number>();
  from.slice(start, end + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
    if (!keys.length) return;
    // Un brazo que lanza en su propia línea, o que contesta la frase del hueco, no atiende la orden: la niega.
    const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
    for (const key of keys) (negative ? refused : answered).set(key, start + offset + 1);
  });
  from.slice(0, start).forEach((row, index) => {
    const pre = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (pre) answered.set(pre, index + 1);
  });
  return { answered, refused, start: start + 1, end: end + 1 };
}

const cable = dispatch(serviceLines);
const javaCases = new Set([...java.matchAll(/case "([a-z][a-zA-Z0-9._]*)":/g)].map(match => match[1]));
const policyKeys = new Set([...allowed.matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]));
const cited = (claims: readonly { methods: readonly string[] }[]) => claims.flatMap(claim => claim.methods);
const desktopBranch = (() => {
  const at = settings.indexOf("if(state.platform==='desktop') return");
  if (at < 0) throw new Error('Falta la rama de escritorio de SettingsPage.tsx');
  const stop = settings.indexOf('const categories=[', at);
  return settings.slice(at, stop);
})();

describe('ronda BJ · medido en el cable del despacho', () => {
  it('el aviso deja de ser prosa: la pantalla imprime las dos frases y no escribe ninguna lista', () => {
    expect(desktopBranch).toContain('<p className="settings-note">{DESKTOP_AVAILABLE_TEXT}</p>');
    expect(desktopBranch).toContain('<p className="settings-note settings-unavailable">{DESKTOP_PENDING_TEXT}</p>');
    // La casa única: la frase del final está en el módulo y la pantalla no la repite.
    expect((scope.match(/Estas funciones no se simulan/g) ?? []).length).toBe(1);
    expect((settings.match(/Estas funciones no se simulan/g) ?? []).length).toBe(0);
    // Y no se cuela en la rama móvil, que tiene su propio alcance en las categorías.
    expect(settings.slice(settings.indexOf('const categories=['))).not.toContain('DESKTOP_PENDING_TEXT');
  });

  it('el despacho se lee de verdad: brazos vivos, brazos que se niegan y el rechazo que cierra la lista', () => {
    for (const key of ['send.attachment', 'chats.search', 'groups.member.ban', 'privacy.blocked', 'contacts.list']) {
      expect(cable.answered.has(key), key).toBe(true);
    }
    // Los cuatro que se niegan a sí mismos no cuentan como respuesta, aunque tengan línea en el despacho.
    for (const key of ['pinned.list', 'poll.stop', 'message.react.paid', 'chat.photo.delete', 'accounts.add', 'authenticate.qr']) {
      expect(cable.answered.has(key), key).toBe(false);
      expect(cable.refused.has(key), key).toBe(true);
    }
    expect(line(serviceLines, cable.end, 'TelegramService.cs')).toContain('_ => throw new BridgeException');
    // Las dos órdenes anteriores al `switch` también son el cable: sin leerlas, el aviso negaría la descarga.
    expect(cable.answered.get('media.load')).toBeLessThan(cable.start);
    expect(cable.answered.get('media.retry')).toBeLessThan(cable.start);
  });

  it('lo que el aviso llama disponible tiene brazo vivo en Windows, clave por clave', () => {
    const missing = DESKTOP_AVAILABLE.flatMap(claim =>
      claim.methods.filter(method => !cable.answered.has(method)).map(method => `${claim.label} -> ${method}`));
    expect(missing).toEqual([]);
  });

  it('lo que el aviso llama pendiente no tiene brazo, o tiene uno que lo niega con nombre', () => {
    const wrong = DESKTOP_PENDING.flatMap(claim =>
      claim.methods.filter(method => cable.answered.has(method)).map(method => `${claim.label} -> ${method}`));
    expect(wrong).toEqual([]);
    // Las negaciones con nombre: la pantalla no dice «falta tiempo», dice lo que falta.
    expect(line(serviceLines, cable.refused.get('pinned.list')!, 'TelegramService.cs')).toContain('DesktopMessagePin.NoList');
    expect(line(serviceLines, cable.refused.get('poll.stop')!, 'TelegramService.cs')).toContain('DesktopPoll.NoStop');
    expect(line(serviceLines, cable.refused.get('message.react.paid')!, 'TelegramService.cs')).toContain('DesktopMessageReact.PaidRefused');
    expect(line(serviceLines, cable.refused.get('chat.photo.delete')!, 'TelegramService.cs')).toContain('DesktopChatPhoto.NoDelete');
  });

  it('ninguna clave se afirma y se niega a la vez, y ninguna etiqueta se repite', () => {
    const both = cited(DESKTOP_AVAILABLE).filter(method => cited(DESKTOP_PENDING).includes(method));
    expect(both).toEqual([]);
    const labels = [...DESKTOP_AVAILABLE, ...DESKTOP_PENDING].map(claim => claim.label);
    expect(labels.length).toBe(new Set(labels).size);
    expect([...DESKTOP_AVAILABLE, ...DESKTOP_PENDING].filter(claim => claim.methods.length === 0)).toEqual([]);
  });

  it('toda clave citada la conoce el puente de Android y la lista que filtra el puente', () => {
    const unknown = [...new Set(cited([...DESKTOP_AVAILABLE, ...DESKTOP_PENDING]))]
      .filter(method => !javaCases.has(method) || !policyKeys.has(method));
    expect(unknown).toEqual([]);
  });

  it('las cuatro negaciones que mentían estaban sostenidas por brazos escritos', () => {
    // El aviso negaba «envío de archivos», «contactos», «administración de grupos» y «búsqueda», y las cuatro
    // cosas ya estaban cableadas: se comprueba en el cable y en la línea de Android que las nombra.
    for (const [method, needle] of [['send.attachment', 'send.attachment'], ['contacts.list', 'contacts.list'],
      ['chats.search', 'chats.search'], ['groups.member.ban', 'groups.member.ban']] as const) {
      expect(cable.answered.has(method), method).toBe(true);
      expect(java).toContain(`case "${needle}":`);
    }
    for (const stale of ['envío de archivos y notas de voz', 'contactos y administración de grupos', 'búsqueda, complementos', 'inicio de sesión real, lista de chats y carpetas']) {
      expect(settings).not.toContain(stale);
      expect(DESKTOP_PENDING_TEXT).not.toContain(stale);
    }
  });

  it('las cuatro familias siguen dichas, ahora en el lado que es cierto', () => {
    for (const family of ['archivos, fotos y álbumes enviados', 'agenda leída', 'administración de comunidades', 'búsqueda con filtros guardados']) {
      expect(DESKTOP_AVAILABLE_TEXT).toContain(family);
    }
    // Y lo que de verdad falta no se esconde detrás de una palabra colectiva.
    expect(DESKTOP_PENDING_TEXT).toContain('notas de voz');
    expect(DESKTOP_PENDING_TEXT).toContain('historias');
    expect(DESKTOP_PENDING_TEXT).toContain('notificaciones push');
    expect(DESKTOP_PENDING_TEXT).toContain('Mini Apps');
    expect(DESKTOP_PENDING_TEXT).toContain('WR IA');
    expect(DESKTOP_PENDING_TEXT).toContain('llamadas');
    expect(DESKTOP_PENDING_TEXT).not.toContain('complementos');
  });
});

describe('ronda BJ · medido con la fórmula del aviso', () => {
  it('las dos frases salen de las listas, no de un texto fijo que se pueda pudrir aparte', () => {
    expect(DESKTOP_AVAILABLE_TEXT).toBe('Disponible: ' + DESKTOP_AVAILABLE.map(claim => claim.label).join(', ') + '.');
    expect(DESKTOP_PENDING_TEXT).toBe('Pendiente en escritorio: ' + DESKTOP_PENDING.map(claim => claim.label).join(', ') +
      '. Estas funciones no se simulan: si una acción no está disponible, la app lo indica.');
    expect(DESKTOP_AVAILABLE.map(claim => claim.label).every(label => DESKTOP_AVAILABLE_TEXT.includes(label))).toBe(true);
    expect(DESKTOP_PENDING.map(claim => claim.label).every(label => DESKTOP_PENDING_TEXT.includes(label))).toBe(true);
    // Y ninguna clave se cuela escrita en la prosa: el aviso habla en familias, el cable en claves.
    expect(DESKTOP_AVAILABLE_TEXT).not.toContain('send.attachment');
    expect(DESKTOP_PENDING_TEXT).not.toContain('voice.start');
  });

  it('el módulo se declara a sí mismo: tipos y exportaciones que la pantalla consume', () => {
    expect(scope).toContain('export type ScopeClaim = { readonly label: string; readonly methods: readonly string[] }');
    expect(settings).toContain("from './desktopScope'");
    expect(scope).not.toContain('<');  // Datos, no JSX: la capa de reglas no pinta.
  });

  it('lo que el aviso llama disponible lo nombra la interfaz: ninguna afirmación es de despacho puro', () => {
    // Condición necesaria, no suficiente: si ninguna pantalla de la app pide la clave, el brazo existe pero el
    // usuario no llega a él, y «Disponible» sería una frase sobre el cable en vez de sobre la app.
    const dir = new URL('.', import.meta.url);
    const ui = readdirSync(dir)
      .filter(name => /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') && name !== 'desktopScope.ts')
      .map(name => readFileSync(new URL(name, dir), 'utf8'))
      .join('\n');
    const orphan = cited(DESKTOP_AVAILABLE).filter(method => !ui.includes(`'${method}'`));
    expect(orphan).toEqual([]);
  });
});
