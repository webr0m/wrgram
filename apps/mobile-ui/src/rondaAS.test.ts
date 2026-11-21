import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dayKey, endOfLocalDate } from './inboxModel';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopHistoryDate.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const inbox = text('./Inbox.tsx');
const model = text('./inboxModel.ts');
const javaRules = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/HistoryDate.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const session = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const tdApi = text('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');

/** El literal que la clase de reglas de C# asigna a una constante. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una constante Java de la clase de reglas. */
function javaSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(javaRules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El número que la clase de reglas de C# asigna a una constante. */
function csNumber(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** La propiedad de un objeto de literales del espejo. */
function tsProperty(name: string, from: string): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El bloque del espejo, desde su declaración hasta la llave que lo cierra. */
function tsBlock(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  const end = preview.indexOf('};', start);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return preview.slice(start, end);
}

/** Cuerpo de un miembro de C#, hasta la siguiente declaración de la clase. */
function csMember(name: string): string {
  const start = rules.search(new RegExp(`\\b(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el miembro ${name}`);
  const next = rules.slice(start + 1).search(/\n *(?:public|private) /);
  return rules.slice(start, next < 0 ? rules.length : start + 1 + next);
}

/** Cuerpo de un método del puente de C#. */
function csBody(name: string): string {
  const start = service.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = service.indexOf('{', start); i < service.length; i++) {
    if (service[i] === '{') depth++;
    else if (service[i] === '}' && --depth === 0) return service.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La documentación XML que precede a un método del puente, desde su último `///`. */
function csDoc(name: string): string {
  const start = at(`private async Task<object?> ${name}(`, service);
  const opening = service.lastIndexOf('<summary>', start);
  if (opening < 0) throw new Error(`Falta la documentación de ${name}`);
  return service.slice(opening, start);
}

/** Cuerpo de una función del espejo. */
function tsBody(name: string): string {
  const start = preview.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = preview.indexOf('{', start); i < preview.length; i++) {
    if (preview[i] === '{') depth++;
    else if (preview[i] === '}' && --depth === 0) return preview.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de un método Java. */
function javaBody(name: string): string {
  const start = java.search(new RegExp(`private void ${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = java.indexOf('{', start); i < java.length; i++) {
    if (java[i] === '{') depth++;
    else if (java[i] === '}' && --depth === 0) return java.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, from: string) => from.split(needle).length - 1;
function at(needle: string, from: string): number {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
}

const NOW = () => Math.floor(Date.now() / 1000);
const DAY = 86_400;

describe('ronda AS · las reglas, cruzadas con las tres capas', () => {
  it('las dos frases que se espejan son las de Android, letra por letra', () => {
    expect(javaSentence('History')).toBe(csSentence('History'));
    expect(javaSentence('Range')).toBe(csSentence('Range'));
    const mirror = tsBlock('HISTORY_DATE_REFUSALS');
    expect(tsProperty('history', mirror)).toBe(csSentence('History'));
    expect(tsProperty('range', mirror)).toBe(csSentence('Range'));
    // Y el puente de Android las dice por referencia, así que ya no hay dos verdades que se pudran aparte.
    expect(javaBody('messageByDate')).toContain('answer.fail(HistoryDate.Range)');
    expect(javaBody('messageByDate')).toContain('answer.fail(HistoryDate.History)');
  });

  it('la tercera frase no se espeja, con su motivo escrito', () => {
    // Nace del callback de Android, que llega tarde; los dos puentes responden en el hilo que leyó el estado.
    expect(javaSentence('Changed')).toBe(csSentence('Changed'));
    expect(javaBody('messageByDate')).toContain('answer.fail(HistoryDate.Changed)');
    // El alcance importa: la misma frase vive en el espejo para la bandeja de programados, así que buscarla en
    // todo el archivo no pregunta nada. La pregunta es si el salto por fecha la ofrece.
    expect(tsBlock('HISTORY_DATE_REFUSALS')).not.toContain('cambió');
    expect(tsBody('designHistoryDate')).not.toContain('Changed');
    expect(preview).toContain('tercera frase de Android');
  });

  it('el techo de la hora es el mismo entero en las tres capas', () => {
    // Las dos capas de puente nombran el tope de su propio `int`, que no puede irse de sitio; el espejo escribe
    // la cifra, y es esa cifra la que se compara con lo que valen esos dos nombres.
    const ceiling = 2 ** 31 - 1;
    expect(rules).toContain('MaxSeconds = int.MaxValue');
    expect(csMember('Acceptable')).toContain('at <= MaxSeconds');
    expect(javaRules).toContain('at <= Integer.MAX_VALUE');
    expect(preview).toContain(`const HISTORY_DATE_MAX = ${ceiling}`);
    expect(tsBody('designHistoryDate')).toContain('at <= HISTORY_DATE_MAX');
  });

  it('el «ahora» con el que se niega está en las tres capas, y la frontera es inclusiva', () => {
    expect(javaRules).toContain('at > 0 && at <= Integer.MAX_VALUE && at <= now');
    expect(csMember('Acceptable')).toContain('at > 0 && at <= MaxSeconds && at <= now');
    expect(tsBody('designHistoryDate')).toContain('at > 0 && at <= HISTORY_DATE_MAX && at <= Math.floor(Date.now() / 1000)');
    // Y la hora aceptada viaja sin retocar: lo que negó la guarda es lo único que sobraba.
    expect(javaBody('messageByDate')).toContain('HistoryDate.acceptable(at,System.currentTimeMillis()/1000)');
    expect(javaBody('messageByDate')).toContain('session.messageByDate(chatId,(int)at,');
    expect(csBody('HistoryDateAsync')).toContain('DesktopHistoryDate.Anchor(at)');
    expect(session).toContain('new TdApi.GetChatMessageByDate(chatId,date)');
  });

  it('el formulario recorta su propia frontera, que es por lo que ninguna fecha suya se niega', () => {
    expect(model).toContain('date.setDate(date.getDate() + 1)');
    expect(model).toContain('date.setHours(0, 0, 0, 0)');
    // La línea que desmontó el defecto que veníamos a arreglar: el tope ya se corta a «ahora» en la interfaz.
    expect(model).toContain('Math.min(date.getTime() - 1000, now.getTime())');
    expect(model).toContain('value > dayKey(now)');
    expect(inbox).toContain('max={dayKey(new Date())}');
    // La promesa de la pantalla habla hacia atrás, y el corte la cumple.
    expect(inbox).toContain('Abre el último mensaje enviado hasta el final del día');
    // Y la ronda confiesa en las tres capas que la guarda del futuro no es un gesto alcanzable.
    expect(rules).toContain('no es un gesto alcanzable desde el diálogo');
    expect(javaRules).toContain('no un gesto de la pantalla');
    expect(preview).toContain('ninguna fecha que el formulario pueda producir cae aquí');
  });

  it('TDLib promete el último mensaje sin pasarse de la hora y el brazo lo cita', () => {
    expect(tdApi).toContain('Returns the last message sent in a chat no later than the specified date');
    expect(rules).toContain('no later than the specified date');
    // El 404 de TDLib es la ausencia; la frase que se lee es de la pantalla, no del puente.
    expect(session).toContain('if(error.code==404)found.accept(null)');
    expect(app).toContain('No hay mensajes hasta el final de ese día.');
  });

  it('el brazo niega la conversación antes que la hora, y la hora antes de pedir nada', () => {
    const body = csBody('HistoryDateAsync');
    expect(at('DesktopHistoryDate.History', body)).toBeLessThan(at('DesktopHistoryDate.Range', body));
    expect(at('DesktopHistoryDate.Range', body)).toBeLessThan(at('Messages_GetHistory', body));
    expect(body).toContain('requested != _active');
    expect(javaBody('messageByDate')).toContain('chatId!=session.activeChat');
    // El orden del espejo es el mismo.
    expect(at('HISTORY_DATE_REFUSALS.history', tsBody('designHistoryDate')))
      .toBeLessThan(at('HISTORY_DATE_REFUSALS.range', tsBody('designHistoryDate')));
  });

  it('la lectura ancla por fecha y no por identificador, con su franja', () => {
    const body = csBody('HistoryDateAsync');
    expect(body).toContain('offset_date: DesktopHistoryDate.Anchor(at)');
    expect(body).toContain('limit: DesktopHistoryDate.Page');
    expect(body).not.toContain('offset_id');
    expect(csNumber('Page')).toBe('30');
    expect(csMember('Anchor')).toContain('DateTimeOffset.FromUnixTimeSeconds(at).UtcDateTime');
  });

  it('el mensaje lo elige esta casa, no el orden que traiga la página', () => {
    const pick = csMember('Pick');
    expect(pick).toContain('date > at');
    expect(pick).toContain('id <= 0');
    expect(pick).toContain('date > bestDate');
    expect(pick).toContain('id > best.Value');
    // Y se le entrega la hora que pasó la guarda, sin recortes intermedios que la muevan.
    expect(csBody('HistoryDateAsync')).toContain('DesktopHistoryDate.Pick(page.Messages');
    expect(csBody('HistoryDateAsync')).toContain('Unix(message.date)');
    expect(csBody('HistoryDateAsync')).toContain('), at)');
  });

  it('la orden tiene brazo una sola vez y el botón dejó de estar tapado', () => {
    expect(count('"history.byDate" => await HistoryDateAsync(args),', service)).toBe(1);
    expect(count("method === 'history.byDate'", preview)).toBe(1);
    expect(count('private async Task<object?> HistoryDateAsync(', service)).toBe(1);
    expect(policy).toContain('"history.byDate"');
    expect(java).toContain('case "history.byDate":messageByDate(p,a);break;');
    expect(count('label="Ir a una fecha"', app)).toBe(1);
    expect(app).toContain(`{!active.isForum&&active.type!=='secret'&&<IconButton label="Ir a una fecha"`);
    expect(app).not.toContain(`!desktop&&!active.isForum&&active.type!=='secret'&&<IconButton label="Ir a una fecha"`);
  });

  it('lo que este host no puede tener se dice en el doc en vez de fingirse', () => {
    const doc = csDoc('HistoryDateAsync');
    expect(doc).toContain('no hay temas de foro');
    expect(doc).toContain('chats secretos no existen en este host');
    expect(doc).toContain('como contrato, no como gesto');
  });

  it('la regla pura se lee sola: la franja y el techo traen su motivo', () => {
    expect(rules).toContain('NativeBridge.java:3388-3402');
    expect(rules).toContain('tdlib/vendor/java/org/drinkless/tdlib/TdApi.java:124830');
    expect(javaRules).toContain('inboxModel.ts');
  });

  it('las líneas de Java que cita el puente de C# dicen eso mismo', () => {
    // Un número de línea es una promesa que se pudre: el comentario de dos líneas que arregló el defecto de
    // «hoy» movió las tres citas y las agujas viejas habrían seguido en verde sobre un archivo mentiroso.
    const lines = java.split('\n');
    const cited = (name: string): number => {
      const declaration = at(`public const string ${name} =`, rules);
      // La cita válida es la última antes de la declaración: hacia atrás siempre se cruza la del vecino.
      const matches = [...rules.slice(declaration - 260, declaration).matchAll(/NativeBridge\.java:(\d+)(?!-)/g)];
      if (matches.length === 0) throw new Error(`${name} no cita la línea de Java donde nace su frase`);
      return Number(matches.at(-1)![1]);
    };
    for (const name of ['History', 'Range', 'Changed']) {
      const line = lines[cited(name) - 1] ?? '';
      expect(line).toContain(`answer.fail(HistoryDate.${name})`);
      expect(javaRules).toContain(`String ${name} = "${csSentence(name)}"`);
    }
    // Y el rango que cita la clase entera abraza el método: por arriba su firma, por abajo su cierre.
    const span = /NativeBridge\.java:(\d+)-(\d+)/.exec(rules);
    if (!span) throw new Error('El rango de `messageByDate` no está citado en la regla pura.');
    expect(Number(span[1])).toBe(java.slice(0, at('private void messageByDate(', java)).split('\n').length);
    expect(lines[Number(span[2]) - 1].trim()).toBe('}');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string; date: number };
type Snap = { active: string; platform: string; messages: Row[] };

describe('ronda AS · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', platform: 'desktop', messages: [] });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  /** Entra en la conversación del historial con fechas y deja la pantalla allí. */
  const enter = async (id = '14') => {
    await call('chat.open', { id });
    return snap().active;
  };

  /** Pide el salto y devuelve el id, `null`, o la frase con la que cayó. */
  const jump = async (when: unknown, id?: string) =>
    call('history.byDate', { id: id ?? snap().active, at: Number(when) }).catch((caught: Error) => caught.message);

  /** La misma aritmética del brazo, escrita aquí en paralelo: fecha más alta sin pasarse, y en empate el id mayor. */
  const newestBefore = (bound: number) => {
    let best: Row | undefined;
    for (const row of snap().messages) {
      if (row.date > bound) continue;
      if (!best || row.date > best.date || (row.date === best.date && Number(row.id) > Number(best.id))) best = row;
    }
    return best ? best.id : null;
  };

  it('elegir hoy salta, con la hora tal cual la produce el formulario', async () => {
    expect(await enter()).toBe('14');
    // Nada de inventar la frontera: se le pide al mismo `endOfLocalDate` que usa el diálogo, y resulta que corta
    // a «ahora» él solo. Esta es la hora que la release publicada ya mandaba, y la que siempre funcionó.
    const at = endOfLocalDate(dayKey(new Date()));
    expect(at).toBeLessThanOrEqual(NOW());
    expect(at).toBeGreaterThan(NOW() - 2);
    expect(await jump(at)).toBe(newestBefore(at));
    expect(await jump(at)).not.toBe('Fecha fuera de rango.');
  });

  it('una frontera del pasado deja la que estaba, sin acercar nada', async () => {
    expect(await enter()).toBe('14');
    // `galleryItems` guarda una fila de febrero de 2024; todo lo demás está en estos días.
    const sketch = Math.floor(new Date(2024, 1, 29, 16).getTime() / 1000);
    expect(await jump(sketch + DAY)).toBe('203');
    expect(await jump(sketch - DAY)).toBeNull();
  });

  it('antes del primer mensaje no hay a dónde saltar y la orden responde null', async () => {
    expect(await enter()).toBe('14');
    expect(await jump(1_000_000)).toBeNull();
  });

  it('la hora basura cae en la frase de siempre y no toca el historial', async () => {
    expect(await enter()).toBe('14');
    const before = snap().messages.length;
    for (const bad of [0, -5, 2_147_483_648, Number.NaN]) expect(await jump(bad)).toBe('Fecha fuera de rango.');
    expect(snap().messages.length).toBe(before);
  });

  it('el techo del entero y el futuro comparten frase mientras el reloj sea de este siglo', async () => {
    expect(await enter()).toBe('14');
    // 2147483647 es 2038: aquí cae en la negación por futuro, no por desbordamiento. Las dos causas se separan
    // donde viven solas —en `HistoryDatePolicyTest`, que puede dar un «ahora» posterior al techo—, porque un
    // espejo con el reloj de hoy no tiene manera de producir la una sin la otra.
    expect(await jump(2_147_483_647)).toBe('Fecha fuera de rango.');
    expect(await jump(NOW() + DAY)).toBe('Fecha fuera de rango.');
  });

  it('el id de otra conversación no es un historial saltable', async () => {
    expect(await enter()).toBe('14');
    const before = snap().messages.length;
    expect(await jump(NOW(), '11')).toBe('Este historial no admite saltos por fecha.');
    expect(await jump(NOW(), '')).toBe('Este historial no admite saltos por fecha.');
    expect(snap().messages.length).toBe(before);
    expect(snap().active).toBe('14');
  });

  it('lo que devuelve la orden existe en el chat y el salto aterriza encima', async () => {
    expect(await enter()).toBe('14');
    const landed = await jump(NOW());
    expect(typeof landed).toBe('string');
    expect(snap().messages.map(row => row.id)).toContain(landed as string);
    await call('chat.open', { id: '14', messageId: landed });
    expect(snap().active).toBe('14');
    expect(snap().messages.map(row => row.id)).toContain(landed as string);
  });

  it('saltar es leer: no añade filas ni cambia la ventana', async () => {
    expect(await enter()).toBe('14');
    const rows = snap().messages.map(row => row.id).join(',');
    await jump(NOW() - 3 * DAY);
    await jump(NOW());
    await jump(1_000_000);
    expect(snap().messages.map(row => row.id).join(',')).toBe(rows);
  });

  it('en Android la orden se espeja igual, porque es una cuenta local', async () => {
    transport.acceptState({ ...transport.snapshot(), platform: 'android' } as never);
    expect(await enter()).toBe('14');
    expect(await jump(NOW())).toBe(newestBefore(NOW()));
    expect(await jump(1_000_000)).toBeNull();
    expect(await jump(0)).toBe('Fecha fuera de rango.');
  });
});
