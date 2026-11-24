import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Poll, State } from './contract';
import { DESKTOP_NAMED_IN_SCAFFOLD, desktopGenericRefusal } from './desktopGap';

/**
 * Ronda CF — las doce opciones y el cierre temporizado, medidos en las tres capas.
 *
 * El hueco no era de código nuevo sino de techo: las dos capas ya cortaban la lista de opciones en diez, que es un
 * número que nadie publicó nunca. Telegram dice «A poll can have up to 12 options» en su FAQ y la Bot API
 * «a JSON-serialized list of 1-12 answer options», y TDLib deja poner tantas como permita su opción de runtime, así
 * que la ronda subió el listón en `NativeBridge.java:4782` para escribir y en `NativeBridge.java:4797` para votar.
 * Lo mismo en Windows, con las dos cifras de `DesktopPoll.cs:91` y `DesktopPoll.cs:99`.
 *
 * Lo otro que faltaba era el cierre. Android lo pide en segundos y se lo da a TDLib en `NativeBridge.java:4792`,
 * que es la forma relativa; MTProto pide una fecha absoluta dentro del propio `TL.Poll` y por eso
 * `TelegramService.cs:2557` la calcula contra el reloj de la petición y le pone su bandera en la línea de arriba,
 * en `TelegramService.cs:2556`, dentro del mismo bloque. La franja —de 5 segundos a 2.628.000, con el cero dicho
 * aparte porque en la pantalla significa «sin cierre»— es la que publica Telegram y la comprueba la regla de
 * `DesktopPoll.cs:331`; su frase está en la constante de `DesktopPoll.cs:192`. La guarda es la décima negación del
 * envío y va la última en las tres capas porque fue la última que se añadió: `NativeBridge.java:4791`,
 * `TelegramService.cs:2530` y `preview.ts:1120`.
 *
 * Hacia arriba viaja una sola clave nueva, `closesAt`, en segundo de época: la escribe Android en
 * `NativeSnapshot.java:203`, la declara el contrato en `contract.ts:124`, la guarda Windows en
 * `DesktopState.cs:265` desde `TelegramService.cs:2971`, la pinta la tarjeta en `BatchPanels.tsx:39` y la calcula
 * el espejo en `preview.ts:1141`. El select con las ocho salidas está en `BatchPanels.tsx:108`, y la nota que la
 * ronda dejó en `DesktopPoll.cs:112` sigue apuntando a `BatchPanels.tsx:35`, que es de donde sale el límite de la
 * página de votantes.
 *
 * Las divergencias leídas, no tapadas: MTProto dice el cierre de dos formas —`close_period` y `close_date`— y esta
 * capa solo puede pintar la segunda, que es lo que declara `DesktopPoll.cs:451`; una encuesta creada fuera con la
 * primera se queda sin aviso en Windows y en Android no, porque TDLib siempre entrega `Poll.closeDate`. Y cerrar
 * una encuesta sigue sin existir en la librería de escritorio: la clave que lo dice es `canStop`, que aquí sale
 * siempre en falso, y el negativo lo protege la frase con nombre de `DesktopPoll.NoStop`.
 *
 * Este archivo mide cuatro cosas sobre el texto de las capas y una con las manos sobre el andamio, sin copiar una
 * cifra de la hoja de ronda. La última prueba es el cortafuegos de las citas: todo `Archivo:NNN` escrito por la
 * ronda —en su prosa y en los trozos de código que tocó— tiene que existir en la tabla y señalar hoy la línea que
 * la frase afirma, igual que hacen CB, BM, BZ y BY.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const service = rows(`${host}TelegramService.cs`);
const pollCs = rows(`${host}DesktopPoll.cs`);
const stateCs = rows(`${host}DesktopState.cs`);
const preview = rows('./preview.ts');
const batch = rows('./BatchPanels.tsx');
const contract = rows('./contract.ts');

/** La primera línea de un cuerpo que dice algo, en número de línea (1-based). */
function en(needle: string, body: string[]) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${body === java ? 'NativeBridge.java' : 'este archivo'} dice ${needle}`);
  return index + 1;
}
/** Todas las líneas que dicen algo: sirve para exigir que una aguja no aparezca duplicada. */
function donde(needle: string, body: string[]) {
  return body.map((row, index) => (row.includes(needle) ? index + 1 : 0)).filter(Boolean);
}
const atJava = (needle: string) => en(needle, java);
const atSnap = (needle: string) => en(needle, snapshot);
const atServ = (needle: string) => en(needle, service);
const atPoll = (needle: string) => en(needle, pollCs);
const atState = (needle: string) => en(needle, stateCs);
const atPv = (needle: string) => en(needle, preview);
const atUi = (needle: string) => en(needle, batch);
const atDoc = (needle: string) => en(needle, contract);

const jrow = (n: number) => java[n - 1] ?? '';
const srow = (n: number) => snapshot[n - 1] ?? '';
const crow = (n: number) => service[n - 1] ?? '';
const prow = (n: number) => pollCs[n - 1] ?? '';
const xrow = (n: number) => stateCs[n - 1] ?? '';
const pvrow = (n: number) => preview[n - 1] ?? '';
const brow = (n: number) => batch[n - 1] ?? '';

/** El texto entre comillas que Java lanza en una línea, para poder comparar frases carácter a carácter. */
function javaThrow(n: number) {
  const match = /IllegalArgumentException\("((?:[^"\\]|\\.)*)"\)/.exec(jrow(n));
  if (!match) throw new Error(`La línea ${n} de NativeBridge.java no lanza un mensaje`);
  return match[1].replace(/\\"/g, '"');
}
/** El literal C# de una constante de `DesktopPoll`, sin que lo engañe otra que termine igual. */
function csLiteral(name: string) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(pollCs.join('\n'));
  if (!match) throw new Error(`Falta la constante ${name} en DesktopPoll.cs`);
  return match[1].replace(/\\"/g, '"');
}
/** El literal TypeScript de una clave de `POLL_REFUSALS`, buscado dentro del objeto y no en los otros dos que se llaman igual. */
function pvLiteral(name: string) {
  const zone = preview.slice(atPv('const POLL_REFUSALS = {') - 1).join('\n').split('\n};')[0];
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(zone);
  if (!match) throw new Error(`Falta la negativa ${name} en POLL_REFUSALS`);
  return match[1].replace(/\\'/g, "'");
}
/** El entero que una línea declara, sea en Java, en C# o en TypeScript. */
function numberOn(row: string, name: string) {
  const match = new RegExp(`${name}\\D*(\\d+)`).exec(row);
  if (!match) throw new Error(`${name} no aparece en ${row.trim()}`);
  return Number(match[1]);
}
const CLOSE_PHRASE = csLiteral('CloseRange');
const BATCH_PHRASE = csLiteral('Batch');

/** Una guarda tiene que venir estrictamente antes de la siguiente, dentro de la misma capa. */
function ordered(label: string, steps: [string, number][]) {
  for (let i = 1; i < steps.length; i++) {
    expect(steps[i][1], `${label}: ${steps[i][0]} va después de ${steps[i - 1][0]}`)
      .toBeGreaterThan(steps[i - 1][1]);
  }
}

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type PollRow = { id: string; outgoing: boolean; poll?: Poll };

describe('ronda CF · el techo de doce, leído de las tres capas', () => {
  it('las doce opciones entran en el puente de Android, y las doce también al votar', () => {
    expect(donde('if(values.length()<2||values.length()>12)', java)).toHaveLength(1);
    const write = atJava('if(values.length()<2||values.length()>12)');
    expect(jrow(write)).toContain(`"${BATCH_PHRASE}"`);
    expect(numberOn(prow(atPoll('public const int MaxOptions')), 'MaxOptions')).toBe(12);
    expect(numberOn(prow(atPoll('public const int MinOptions')), 'MinOptions')).toBe(2);
    expect(prow(atPoll('public static bool Fits(int count)'))).toContain('>= MinOptions and <= MaxOptions');
    // Votar admite de una a doce: la orilla alta es la misma porque en una de respuestas múltiples se marcan todas.
    const vote = atJava('JSONArray values=p.getJSONArray("options");if(values.length()<1||values.length()>12)');
    expect(vote).toBeGreaterThan(write);
    expect(numberOn(prow(atPoll('public const int MaxVotes')), 'MaxVotes')).toBe(12);
    expect(numberOn(prow(atPoll('public const int MinVotes')), 'MinVotes')).toBe(1);
  });

  it('Windows dice doce con las mismas palabras que Android, carácter a carácter', () => {
    expect(BATCH_PHRASE).toBe('Escribe entre 2 y 12 opciones.');
    expect(pvLiteral('batch')).toBe(BATCH_PHRASE);
    expect(javaThrow(atJava('if(values.length()<2||values.length()>12)'))).toBe(BATCH_PHRASE);
  });

  it('el espejo del andamio corta en la misma orilla y con la misma frase', () => {
    const caps = atPv('const POLL_MAX_QUESTION = 255, POLL_MIN_OPTIONS = 2, POLL_MAX_OPTIONS = 12');
    expect(numberOn(pvrow(caps), 'POLL_MAX_OPTIONS')).toBe(12);
    expect(pvrow(atPv('if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS)')))
      .toContain('POLL_REFUSALS.batch');
  });

  it('la pantalla ya no ofrece la décima como techo en ninguno de sus cuatro sitios', () => {
    const tap = atUi('next.size<12');
    const guard = atUi('if(clean.length<2||clean.length>12)');
    const shown = atUi('<fieldset><legend>Opciones ({options.length}/12)');
    expect(brow(guard)).toContain('Añade entre 2 y 12 opciones.');
    expect(brow(tap)).toContain('next.size<12');
    // El letrero del campo y el botón de añadir comparten línea: los dos tenían que subir a doce a la vez.
    expect(shown).toBe(atUi('options.length<12&&'));
    // Que no quede un diez suelto defendiendo el techo viejo en la zona de la encuesta.
    const pollZone = batch.slice(0, atUi('export interface ChecklistDraft'));
    expect(pollZone.filter(row => /\/10\)|size<10\b|length>10\b|10 opciones/.test(row))).toEqual([]);
    expect(pollZone.join('\n')).toContain('const POLL_CLOSE_OPTIONS:[number,string][]=');
  });
});

describe('ronda CF · la franja del cierre, medida en las tres capas', () => {
  it('Android rechaza fuera de la franja y escribe el periodo justo después', () => {
    const guard = atJava('int period=p.optInt("duration",0);');
    expect(jrow(guard)).toContain('period<0');
    expect(jrow(guard)).toContain('(period>0&&period<5)');
    expect(jrow(guard)).toContain('period>2628000');
    expect(javaThrow(guard)).toBe(CLOSE_PHRASE);
    expect(jrow(guard + 1)).toContain('poll.openPeriod=period;');
    expect(jrow(guard + 2)).toContain('session.sendContent(poll,');
  });

  it('los dos topes de Windows son los mismos números que los de la franja publicada', () => {
    const min = atPoll('public const int MinClose = 5;');
    const max = atPoll('public const int MaxClose = 2628000;');
    expect(max).toBe(min + 1);
    expect(numberOn(prow(min), 'MinClose')).toBe(5);
    expect(numberOn(prow(max), 'MaxClose')).toBe(2628000);
    const rule = prow(atPoll('public static bool ClosesInRange(int seconds)'));
    expect(rule).toContain('seconds == 0');
    expect(rule).toContain('>= MinClose and <= MaxClose');
  });

  it('el espejo no se inventa una franja: lee el cinco y el 2.628.000 de la misma línea', () => {
    const caps = atPv('const POLL_MIN_CLOSE = 5, POLL_MAX_CLOSE = 2628000');
    expect(numberOn(pvrow(caps), 'POLL_MIN_CLOSE')).toBe(5);
    expect(numberOn(pvrow(caps), 'POLL_MAX_CLOSE')).toBe(2628000);
    const guard = pvrow(atPv('if (duration !== 0 && !(Number.isInteger(duration)'));
    expect(guard).toContain('duration >= POLL_MIN_CLOSE');
    expect(guard).toContain('duration <= POLL_MAX_CLOSE');
    expect(guard).toContain('POLL_REFUSALS.closeRange');
  });

  it('la frase del cierre es una sola en Java, en C# y en el andamio', () => {
    expect(CLOSE_PHRASE).toBe('La encuesta debe cerrarse entre 5 segundos y 30 días y 1 hora después de enviarse.');
    expect(javaThrow(atJava('int period=p.optInt("duration",0);'))).toBe(CLOSE_PHRASE);
    expect(pvLiteral('closeRange')).toBe(CLOSE_PHRASE);
    // La la dice una sola vez en C#: la constante que lee el puente, no una copia en el despacho.
    expect(prow(atPoll('public const string CloseRange'))).toContain(CLOSE_PHRASE);
    expect(crow(atServ('if (!DesktopPoll.ClosesInRange(duration))'))).toContain('DesktopPoll.CloseRange');
  });

  it('en Windows el cierre viaja como fecha absoluta con su bandera puesta, en el mismo bloque', () => {
    const start = atServ('if (duration > 0)');
    const flag = atServ('poll.flags |= TL.Poll.Flags.has_close_date;');
    const date = atServ('poll.close_date = DesktopPoll.CloseDate(Unix(DateTime.UtcNow), duration);');
    expect(flag).toBe(start + 2);
    expect(date).toBe(flag + 1);
    expect(prow(atPoll('public static DateTime CloseDate(long nowEpoch, int seconds)'))).toContain('CloseDate');
    expect(prow(atPoll('DateTimeOffset.FromUnixTimeSeconds(nowEpoch + seconds).UtcDateTime;')))
      .toContain('nowEpoch + seconds');
    // La duración se lee antes de construir el `TL.Poll`, y la fecha se escribe después de la bandera.
    expect(atServ('var duration = (int)Long(args, "duration", 0);')).toBeLessThan(start);
    expect(atServ('var poll = new TL.Poll')).toBeLessThan(start);
  });

  it('lo que se lee de la lista es la fecha, y solo cuando la fila la trae', () => {
    const read = crow(atServ('if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt = Unix(poll.close_date);'));
    expect(read).not.toContain('close_period');
    expect(prow(atPoll('public static bool HasCloseDate(TL.Poll poll)'))).toContain('TL.Poll.Flags.has_close_date');
    // Android lee el dato hecho de TDLib, sin bandera que consultar: de ahí la asimetría declarada arriba.
    expect(srow(atSnap('if(poll.closeDate>0)value.put("closesAt",poll.closeDate);'))).toContain('poll.closeDate>0');
  });
});

describe('ronda CF · el orden de las negaciones, en las tres capas', () => {
  it('la del cierre es la décima y va la última, antes de que nada toque la librería', () => {
    ordered('Android', [
      ['pregunta vacía', atJava('String question=BridgePolicy.text(p,"question",255).trim();if(question.isEmpty())')],
      ['opciones', atJava('if(values.length()<2||values.length()>12)')],
      ['respuesta correcta', atJava('if(correct<0||correct>=options.length)')],
      ['cierre', atJava('int period=p.optInt("duration",0);')],
      ['envío', atJava('session.sendContent(poll,')],
    ]);
    ordered('Windows', [
      ['permiso de encuesta', atServ('if (!DesktopPoll.CanSendPolls(rights))')],
      ['largo de la pregunta', atServ('if (!DesktopPoll.WithinQuestion(raw))')],
      ['pregunta vacía', atServ('if (!DesktopPoll.HasQuestion(question))')],
      ['opciones', atServ('if (!DesktopPoll.Fits(options.Length))')],
      ['respuesta correcta', atServ('if (quiz && !DesktopPoll.AllowsCorrect(correct, options.Length))')],
      ['cierre', atServ('if (!DesktopPoll.ClosesInRange(duration))')],
      ['petición', atServ('var media = new InputMediaPoll { poll = poll };')],
    ]);
    ordered('andamio', [
      ['largo de la pregunta', atPv('if (raw.length > POLL_MAX_QUESTION)')],
      ['pregunta vacía', atPv('if (!question) throw new Error(POLL_REFUSALS.noQuestion)')],
      ['opciones', atPv('if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS)')],
      ['respuesta correcta', atPv('if (quiz && !(Number.isInteger(correct) && correct >= 0 && correct < options.length))')],
      ['cierre', atPv('if (duration !== 0 && !(Number.isInteger(duration)')],
      ['fila', atPv('const poll: Poll = {')],
    ]);
  });

  it('cada capa rechaza el cero por su cuenta y no como un número imposible', () => {
    // Es lo que permite que la pantalla use el cero como «Sin cierre» sin mentirle a Telegram.
    expect(prow(atPoll('public static bool ClosesInRange(int seconds)'))).toContain('seconds == 0');
    expect(jrow(atJava('int period=p.optInt("duration",0);'))).toContain('(period>0&&period<5)');
    expect(pvrow(atPv('if (duration !== 0 && !(Number.isInteger(duration)'))).toContain('duration !== 0');
    expect(brow(atUi('const [duration,setDuration]=useState(0);'))).toContain('useState(0)');
  });

  it('el select de la pantalla solo ofrece cifras que caen dentro de la franja', () => {
    const values = [...brow(atUi('const POLL_CLOSE_OPTIONS:[number,string][]')).matchAll(/\[(\d+),'/g)]
      .map(match => Number(match[1]));
    expect(values).toHaveLength(8);
    expect(values[0]).toBe(0);
    for (const value of values.slice(1)) {
      expect(value, `${value} segundos no está en la franja`).toBeGreaterThanOrEqual(5);
      expect(value, `${value} segundos no está en la franja`).toBeLessThanOrEqual(2628000);
    }
    // Y la orden que sale del compositor es la que consume el puente: la clave se llama `duration` en las tres capas.
    expect(brow(atUi('duration});if(sent)close();'))).toContain('duration}');
    expect(brow(atUi('export interface PollDraft'))).toContain('duration:number');
    expect(crow(atServ('var duration = (int)Long(args, "duration", 0);'))).toContain('"duration"');
    expect(jrow(atJava('int period=p.optInt("duration",0);'))).toContain('"duration"');
  });
});

describe('ronda CF · la clave `closesAt`, hop por hop', () => {
  it('la declara el contrato y la escriben las dos capas, en la forma que toca a cada una', () => {
    const line = atDoc('export interface Poll {');
    expect(contract[line - 1]).toContain('closesAt?:number');
    expect(contract[line - 1]).toContain('question:string');
    // Opcional en las dos orillas: Android la omite cuando no hay cierre y Windows también puede omitirla.
    expect(srow(atSnap('if(poll.closeDate>0)value.put("closesAt",poll.closeDate);'))).toContain('value.put("closesAt"');
    expect(xrow(atState('public long? ClosesAt { get; set; }'))).toContain('long?');
  });

  it('el puente de Windows la copia en camelCase desde la fecha de la fila', () => {
    const read = crow(atServ('if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt = Unix(poll.close_date);'));
    expect(read).toContain('dto.ClosesAt');
    expect(read).toContain('Unix(poll.close_date)');
    // El nombre con el que sale al cable es el del contrato, no el de la propiedad C#.
    expect(text(`${host}DesktopBridge.cs`)).toContain('JsonNamingPolicy.CamelCase');
  });

  it('la tarjeta la pinta solo mientras la encuesta esté abierta', () => {
    const shown = atUi('{poll.closesAt&&!closed&&');
    expect(brow(shown)).toContain('Cierra el ');
    expect(brow(shown)).toContain('new Date(poll.closesAt*1000)');
    expect(brow(shown)).toContain('toLocaleString');
    // El aviso comparte clase con la descripción, va justo debajo de ella y antes de la lista de opciones.
    expect(shown).toBe(atUi('{poll.description&&<p className="poll-description">{poll.description}</p>}') + 1);
    expect(shown).toBeLessThan(atUi('<div className="poll-options">'));
  });

  it('el espejo la calcula con la misma suma que hace la capa que imita', () => {
    expect(pvrow(atPv('...(duration ? { closesAt: Math.floor(Date.now() / 1000) + duration } : {})'))).toContain('closesAt');
    expect(prow(atPoll('DateTimeOffset.FromUnixTimeSeconds(nowEpoch + seconds).UtcDateTime;')))
      .toContain('nowEpoch + seconds');
  });
});

describe('ronda CF · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let base: State;

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  /** «Mensajes guardados»: el único privado donde Telegram admite encuesta, y donde `canSend` dice verdad. */
  const reset = () => transport.acceptState({ ...base, platform: 'desktop', active: '1', selfId: '1', canSend: true });
  const lastPoll = () => {
    const list = transport.snapshot().messages as unknown as PollRow[];
    const row = [...list].reverse().find(item => item.poll);
    if (!row?.poll) throw new Error('El andamio no dejó ninguna encuesta en la lista');
    return row.poll;
  };
  const options = (count: number) => Array.from({ length: count }, (_, index) => `Opción ${index + 1}`);
  const send = (extra: Record<string, unknown> = {}) => call('poll.send', { question: '¿Cuántas opciones?', options: options(3), ...extra });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const pv = await import('./preview');
    transport = await import('./bridge');
    base = pv.fixture;
    reset();
    call = pv.designRequest as DesignCall;
  });

  it('doce opciones entran y trece se caen con la frase de la lista', async () => {
    expect(await send({ options: options(12) })).toBe(true);
    expect(lastPoll().options).toHaveLength(12);
    await expect(send({ options: options(13) })).rejects.toThrow(pvLiteral('batch'));
    expect(await send({ options: options(2) })).toBe(true);
    expect(lastPoll().options).toHaveLength(2);
    await expect(send({ options: options(1) })).rejects.toThrow(pvLiteral('batch'));
  });

  it('la franja del cierre es cerrada por arriba y por abajo, y el cero vale', async () => {
    for (const bad of [4, -1, 2628001, 30000000]) {
      await expect(send({ duration: bad }), `${bad} segundos tendría que caerse`).rejects.toThrow(pvLiteral('closeRange'));
    }
    for (const good of [0, 5, 3600, 2628000]) {
      expect(await send({ duration: good }), `${good} segundos tendría que pasar`).toBe(true);
    }
  });

  it('sin cierre pedido no hay clave; con cierre, la fecha cae al instante sumado', async () => {
    expect(await send({ duration: 0 })).toBe(true);
    expect('closesAt' in lastPoll()).toBe(false);
    expect(lastPoll().closesAt).toBeUndefined();
    expect(await send({ duration: 3600 })).toBe(true);
    const delta = (lastPoll().closesAt ?? 0) - nowSeconds();
    expect(delta).toBeLessThanOrEqual(3600);
    expect(delta).toBeGreaterThanOrEqual(3599);
    expect(await send({ duration: 2628000 })).toBe(true);
    expect((lastPoll().closesAt ?? 0) - nowSeconds()).toBeGreaterThanOrEqual(2628000 - 2);
  });

  it('la guarda de las opciones manda sobre la del cierre, que es el orden de las capas', async () => {
    await expect(send({ options: options(13), duration: 4 })).rejects.toThrow(pvLiteral('batch'));
    await expect(send({ options: options(13), duration: 4 })).rejects.not.toThrow(pvLiteral('closeRange'));
  });

  it('el andamio no promete cerrar una encuesta desde Windows, y lo dice por su nombre', async () => {
    expect(await send({ duration: 21600 })).toBe(true);
    expect(lastPoll().closed).toBe(false);
    expect(lastPoll().canStop).toBe(false);
    expect(DESKTOP_NAMED_IN_SCAFFOLD).toContain('poll.stop');
    await expect(call('poll.stop', { id: '1' })).rejects.toThrow(pvLiteral('noStop'));
    await expect(call('poll.stop', { id: '1' })).rejects.not.toThrow(desktopGenericRefusal('poll.stop'));
  });

  it('la fila que deja el envío es propia, abierta y con el aviso por delante', async () => {
    expect(await send({ duration: 43200, multiple: true })).toBe(true);
    const list = transport.snapshot().messages as unknown as PollRow[];
    const row = [...list].reverse().find(item => item.poll)!;
    expect(row.outgoing).toBe(true);
    expect(row.poll?.multiple).toBe(true);
    expect(row.poll?.anonymous).toBe(true);
    expect((row.poll?.closesAt ?? 0) - nowSeconds()).toBeGreaterThanOrEqual(43200 - 2);
  });
});

describe('ronda CF · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'NativeBridge.java:4782': 'if(values.length()<2||values.length()>12)',
    'NativeBridge.java:4791': 'period>2628000',
    'NativeBridge.java:4792': 'poll.openPeriod=period;',
    'NativeBridge.java:4797': 'values.length()<1||values.length()>12',
    'NativeSnapshot.java:203': 'value.put("closesAt",poll.closeDate)',
    'TelegramService.cs:2530': 'DesktopPoll.ClosesInRange(duration)',
    'TelegramService.cs:2556': 'poll.flags |= TL.Poll.Flags.has_close_date;',
    'TelegramService.cs:2557': 'poll.close_date = DesktopPoll.CloseDate(Unix(DateTime.UtcNow), duration);',
    'TelegramService.cs:2971': 'dto.ClosesAt = Unix(poll.close_date)',
    'DesktopPoll.cs:91': 'public const int MaxOptions = 12;',
    'DesktopPoll.cs:99': 'public const int MaxVotes = 12;',
    'DesktopPoll.cs:112': 'BatchPanels.tsx:35',
    'DesktopPoll.cs:192': 'CloseRange = "La encuesta debe cerrarse entre 5 segundos',
    'DesktopPoll.cs:331': 'public static bool ClosesInRange(int seconds)',
    'DesktopPoll.cs:451': 'public static bool HasCloseDate(TL.Poll poll)',
    'DesktopState.cs:265': 'public long? ClosesAt { get; set; }',
    'contract.ts:124': 'closesAt?:number',
    'BatchPanels.tsx:35': 'limit:50',
    'BatchPanels.tsx:39': 'Cierra el ',
    'BatchPanels.tsx:108': 'Cierre automático de la encuesta',
    'preview.ts:1120': 'duration >= POLL_MIN_CLOSE',
    'preview.ts:1141': 'closesAt: Math.floor(Date.now() / 1000) + duration',
    // Las seis que entraron en el ámbito con la ronda CN-B: los comentarios de `DesktopPoll` citan el todo o nada y
    // el montaje de Android, y la lectura de la foto queda en el `return null;` del reparto. Medidas hoy, una por una.
    'NativeBridge.java:4783': 'JSONArray media=p.optJSONArray("media")',
    'NativeBridge.java:4784': 'images.size()!=values.length()',
    'NativeBridge.java:4786': 'images.isEmpty()?null:new TdApi.InputPollMediaPhoto',
    'NativeSnapshot.java:435': 'if(value instanceof TdApi.PollMediaPhoto)',
    'NativeSnapshot.java:441': 'return null;',
    'BatchPanels.tsx:94': "media:pictures.map(item=>item||'')",
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CB, BM y BY. */
  const close = atSnap('if(poll.closeDate>0)value.put("closesAt",poll.closeDate);');
  const voters = atServ('if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt = Unix(poll.close_date);');
  const watched: [string, string][] = [
    ['rondaCF.test.ts', text('./rondaCF.test.ts').split('const text =')[0]],
    ['DesktopPoll.cs', pollCs.join('\n')],
    ['DesktopState.cs CF', stateCs.slice(atState('public bool Quiz { get; set; }') - 1, atState('public List<PollOptionDto> Options') - 1).join('\n')],
    ['TelegramService.cs envío', service.slice(atServ('var rights = DesktopPoll.Of(ChatRow(entry));') - 1, atServ('var media = new InputMediaPoll { poll = poll };') + 8).join('\n')],
    ['TelegramService.cs lectura', service.slice(voters - 3, voters + 2).join('\n')],
    ['NativeBridge.java sendPoll', java.slice(atJava('private void sendPoll(JSONObject p,Answer a)') - 1, atJava('private void answerPoll(JSONObject p,Answer a)') - 1).join('\n')],
    ['NativeSnapshot.java poll', snapshot.slice(close - 3, close + 2).join('\n')],
    ['preview.ts CF', preview.slice(atPv('const POLL_REFUSALS = {') - 1, atPv('function applyPollVote(') - 2).join('\n')],
    ['BatchPanels.tsx CF', batch.slice(0, atUi('export interface ChecklistDraft') - 1).join('\n')],
    ['contract.ts CF', contract.slice(atDoc('export interface Poll {') - 3, atDoc('export interface Poll {')).join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' ? java
      : file === 'NativeSnapshot.java' ? snapshot
        : file === 'TelegramService.cs' ? service
          : file === 'DesktopPoll.cs' ? pollCs
            : file === 'DesktopState.cs' ? stateCs
              : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const [, body] of watched) {
    for (const match of body.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj)):(\d+)(?:-(\d+))?/g)) {
      const key = `${match[1]}:${match[2]}`;
      written.set(key, Math.max(written.get(key) ?? 0, match[3] ? Number(match[3]) : 0));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
    expect(Object.keys(anchors)).toHaveLength(28);
  });

  it('el andamio ya no cita las cifras de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    const medidas: [string, number][] = [
      ['NativeBridge.java', atJava('if(values.length()<2||values.length()>12)')],
      ['NativeBridge.java', atJava('int period=p.optInt("duration",0);')],
      ['NativeBridge.java', atJava('poll.openPeriod=period;')],
      ['NativeBridge.java', atJava('JSONArray values=p.getJSONArray("options");if(values.length()<1||values.length()>12)')],
      ['NativeSnapshot.java', atSnap('if(poll.closeDate>0)value.put("closesAt",poll.closeDate);')],
      ['TelegramService.cs', atServ('if (!DesktopPoll.ClosesInRange(duration))')],
      ['TelegramService.cs', atServ('poll.flags |= TL.Poll.Flags.has_close_date;')],
      ['TelegramService.cs', atServ('poll.close_date = DesktopPoll.CloseDate(Unix(DateTime.UtcNow), duration);')],
      ['TelegramService.cs', atServ('if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt = Unix(poll.close_date);')],
      ['DesktopPoll.cs', atPoll('public const int MaxOptions = 12;')],
      ['DesktopPoll.cs', atPoll('public const int MaxVotes = 12;')],
      ['DesktopPoll.cs', atPoll('CloseRange = "')],
      ['DesktopPoll.cs', atPoll('public static bool ClosesInRange(int seconds)')],
      ['DesktopPoll.cs', atPoll('public static bool HasCloseDate(TL.Poll poll)')],
      ['DesktopState.cs', atState('public long? ClosesAt { get; set; }')],
      ['contract.ts', atDoc('export interface Poll {')],
      ['BatchPanels.tsx', atUi('poll.voters')],
      ['BatchPanels.tsx', atUi('{poll.closesAt&&!closed&&')],
      ['BatchPanels.tsx', atUi('Cierre automático de la encuesta')],
      ['preview.ts', atPv('if (duration !== 0 && !(Number.isInteger(duration)')],
      ['preview.ts', atPv('...(duration ? { closesAt: Math.floor(Date.now() / 1000) + duration } : {})')],
    ];
    for (const [file, n] of medidas) {
      expect(anchors[`${file}:${n}`], `${file}:${n} no está en la tabla de anclas`).toBeTypeOf('string');
    }
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    // Las longitudes se miden hoy sobre los archivos en disco, después de CT y de las rondas posteriores. Los
    // incrementos históricos se explican en sus propias pruebas; aquí solo se fija el tamaño actual de cada capa.
    expect(java).toHaveLength(5602);
    expect(snapshot).toHaveLength(554);
    expect(service).toHaveLength(4312);
    expect(pollCs).toHaveLength(500);
    expect(stateCs).toHaveLength(760);
    expect(contract).toHaveLength(251);
    expect(batch).toHaveLength(351);
    expect(preview).toHaveLength(3437);
  });
});
