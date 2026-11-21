import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Poll, State } from './contract';
import { DESKTOP_AVAILABLE, DESKTOP_AVAILABLE_TEXT, DESKTOP_PENDING } from './desktopScope';
import { DESKTOP_NAMED_IN_SCAFFOLD, desktopGapRefusal, desktopGenericRefusal } from './desktopGap';

/**
 * Ronda CM — la descripción de la encuesta, que Android ya escribía y Windows todavía no podía llevar.
 *
 * El hueco no estaba en la pantalla ni en el contrato: `contract.ts:124` declara `description:string` desde la ronda
 * AO, `NativeSnapshot.java:198` ya la leía del contenedor del mensaje y la tarjeta `BatchPanels.tsx:38` ya la pintaba.
 * Lo que faltaba era la escritura. TDLib la pide en `TdApi.InputMessagePoll.description` y el puente de Android la
 * pone en `NativeBridge.java:4698`, pasada por el mismo recorte con el que se limitan los pies de foto:
 * `NativeBridge.java:5306` la mide contra 1024, que es la opción de runtime `message_caption_length_max` con la que
 * este puente trabaja desde la ronda AE, y `NativeBridge.java:5307` devuelve `null` cuando sale vacía —que es como
 * TDLib entiende «sin descripción», no una cadena vacía— . La pantalla manda la suya en `BatchPanels.tsx:94`, recortada
 * a mano en el `textarea` de `BatchPanels.tsx:100`, y el borrador la lleva declarada en
 * `BatchPanels.tsx:63`; el compositor la enchufa al puente sin renombrarla en `App.tsx:1142`, que manda el borrador
 * entero como mandaba la pregunta.
 *
 * Windows no puede con ella, y no por pereza: contado sobre el ensamblado empaquetado, ni `TL.Poll` ni
 * `TL.InputMediaPoll` traen un campo donde escribirla. Callar la descripción y mandar la encuesta igualmente sería
 * fingir —saldría por el cable una encuesta distinta de la que se pidió—, así que la ronda la niega por su nombre:
 * la frase está en `DesktopPoll.cs:225`, la regla que decide si se manda o se niega en `DesktopPoll.cs:344` y la
 * guarda en `TelegramService.cs:2523`, la última del envío, detrás de la del cierre. Al leer, el hueco se declara
 * igual: `TelegramService.cs:2945` pone `Description` en vacío porque la librería no lo trae nunca.
 *
 * El andamio copia la misma decisión, con la misma frase: `preview.ts:1047` es la negativa con nombre y
 * `preview.ts:1105` la guarda, que va detrás de las diez compartidas porque en Android no existe; por eso solo se
 * alcanza bajo escritorio, como marca `preview.ts:2445`. La fila que deja un envío de escritorio sigue saliendo con
 * la descripción vacía —`preview.ts:1115`—, que es la única verdad posible mientras no haya campo donde ponerla.
 *
 * Lo que la ronda NO cerró, dicho en vez de tapado: el medio por opción. TDLib lo pide en
 * `TdApi.InputPollOption.media` y MTProto en `TL.InputPollAnswer.media`, así que en las dos capas es construible, pero
 * la lectura tampoco está: `NativeSnapshot.java` no serializa ni `option.media` ni `MessagePoll.media`, y
 * `DesktopPoll.cs` no lee `poll_media`. Eso es una ronda entera, no una línea, y aquí no se simuló ninguna de las dos.
 *
 * Como en CF, CB, BM, BY y BZ: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda tiene que
 * estar en la tabla y señalar hoy la línea que la frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const service = rows(`${host}TelegramService.cs`);
const pollCs = rows(`${host}DesktopPoll.cs`);
const preview = rows('./preview.ts');
const batch = rows('./BatchPanels.tsx');
const contract = rows('./contract.ts');
const app = rows('./App.tsx');

/** La primera línea de un cuerpo que dice algo, en número de línea (1-based). */
function en(needle: string, body: string[], where: string) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const donde = (needle: string, body: string[]) => body.map((row, i) => (row.includes(needle) ? i + 1 : 0)).filter(Boolean);
const atJava = (n: string) => en(n, java, 'NativeBridge.java');
const atSnap = (n: string) => en(n, snapshot, 'NativeSnapshot.java');
const atServ = (n: string) => en(n, service, 'TelegramService.cs');
const atPoll = (n: string) => en(n, pollCs, 'DesktopPoll.cs');
const atPv = (n: string) => en(n, preview, 'preview.ts');
const atUi = (n: string) => en(n, batch, 'BatchPanels.tsx');
const atApp = (n: string) => en(n, app, 'App.tsx');
const atDoc = (n: string) => en(n, contract, 'contract.ts');

const jrow = (n: number) => java[n - 1] ?? '';
const srow = (n: number) => snapshot[n - 1] ?? '';
const crow = (n: number) => service[n - 1] ?? '';
const prow = (n: number) => pollCs[n - 1] ?? '';
const pvrow = (n: number) => preview[n - 1] ?? '';
const brow = (n: number) => batch[n - 1] ?? '';
const arow = (n: number) => app[n - 1] ?? '';

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
/** El entero que viene justo detrás de un trozo literal de la línea, para no copiar la cifra de memoria. */
function capOf(row: string, after: string) {
  const at = row.indexOf(after);
  if (at < 0) throw new Error(`${after} no aparece en ${row.trim()}`);
  const match = /(\d+)/.exec(row.slice(at + after.length));
  if (!match) throw new Error(`${after} no va seguida de un número en ${row.trim()}`);
  return Number(match[1]);
}
const NO_DESCRIPTION = csLiteral('NoDescription');

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type PollRow = { id: string; outgoing: boolean; poll?: Poll };

const options = (count: number) => Array.from({ length: count }, (_, index) => `Opción ${index + 1}`);

describe('ronda CM · la descripción escrita, medida en las tres capas', () => {
  it('Android la monta en el.poll y la recorta con el mismo techo que un pie de foto', () => {
    const line = atJava('poll.description=pollDescription(p);');
    expect(jrow(line)).toContain('TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();');
    // El helper está al final del archivo, y su medida y su `null` son las dos únicas salidas que tiene.
    const helper = atJava('private static TdApi.FormattedText pollDescription(JSONObject p){');
    expect(jrow(helper + 1)).toContain('NativeSnapshot.limit(p.optString("description","").trim(),1024)');
    expect(jrow(helper + 2)).toContain('return text.isEmpty()?null:new TdApi.FormattedText(text,');
    expect(capOf(jrow(helper + 1), 'trim(),')).toBe(1024);
    // Una sola función que la escribe: si alguien copia el recorte en otro sitio, la igualdad se rompe aquí.
    expect(donde('pollDescription(', java)).toHaveLength(2);
  });

  it('la lectura ya estaba, con su propio techo de pantalla', () => {
    const read = atSnap('.put("description",container.description==null||container.description.text==null?"":limit(container.description.text,600))');
    expect(capOf(srow(read), 'container.description.text,')).toBe(600);
    // Y el contrato la declara obligatoria, que es lo que permite pintar la tarjeta sin preguntar.
    expect(contract[atDoc('export interface Poll {') - 1]).toContain('description:string');
  });

  it('la pantalla la ofrece solo donde se puede escribir, y la manda recortada', () => {
    const field = atUi('!desktop&&<label className="field-label">Descripción (opcional)');
    expect(brow(field)).toContain('<textarea className="large-input"');
    // El techo que deja teclear la pantalla es el mismo número con el que el puente corta al escribir.
    expect(capOf(brow(field), 'maxLength={')).toBe(1024);
    expect(brow(atUi("const [description,setDescription]=useState('');"))).toContain("useState('')");
    const payload = atUi('description:description.trim()');
    expect(brow(payload)).toContain('await send({question:question.trim()');
    // El campo va debajo de las opciones y encima del cierre: el orden que tiene en la burbuja.
    expect(field).toBeGreaterThan(atUi('<fieldset><legend>Opciones ({options.length}/12)'));
    expect(field).toBeLessThan(atUi('Cierre automático'));
    expect(brow(atUi('export interface PollDraft'))).toContain('question:string;description:string;');
    // Y la orden que sale del compositor es la del puente: la clave viaja dentro del borrador, sin renombrarla.
    expect(arow(atApp("openPoll(){setDialog({title:'Crear encuesta'"))).toContain("'poll.send',{...draft");
  });

  it('Windows la niega por su nombre, con la frase que explica el hueco de la librería', () => {
    expect(NO_DESCRIPTION).toBe('La biblioteca de escritorio no tiene campo para la descripción de la encuesta, así que aquí la encuesta se envía y se vota sin descripción.');
    expect(pvLiteral('noDescription')).toBe(NO_DESCRIPTION);
    const guard = atServ('if (DesktopPoll.HasDescription(Str(args, "description")))');
    expect(crow(guard)).toContain('throw new BridgeException(DesktopPoll.NoDescription);');
    expect(prow(atPoll('public static bool HasDescription(string? raw)'))).toContain('Trim(raw).Length > 0');
    // La guarda es la última del envío: manda el cierre (CF) y después manda esta, antes de montar la petición.
    expect(guard).toBeGreaterThan(atServ('if (!DesktopPoll.ClosesInRange(duration))'));
    expect(guard).toBeLessThan(atServ('var media = new InputMediaPoll { poll = poll };'));
  });

  it('al leer, el hueco también se dice: Windows no inventa una descripción que la librería no trae', () => {
    const empty = atServ('Description = "",');
    expect(crow(empty)).toContain('Description = ""');
    expect(prow(atPoll('public const string NoDescription ='))).toContain('NoDescription');
    // El andamio no puede hacer mejor que la capa que imita: la fila de escritorio sale con la descripción vacía.
    expect(pvrow(atPv("question: question.slice(0, POLL_SHOWN_QUESTION), description: '',"))).toContain("description: ''");
  });

  it('el orden de las negaciones del envío, medido en la capa que las tiene todas', () => {
    const steps = ['permiso de encuesta', 'largo de la pregunta', 'pregunta vacía', 'opciones', 'respuesta correcta', 'cierre', 'descripción', 'petición']
      .map(label => [label, {
        'permiso de encuesta': atServ('if (!DesktopPoll.CanSendPolls(rights))'),
        'largo de la pregunta': atServ('if (!DesktopPoll.WithinQuestion(raw))'),
        'pregunta vacía': atServ('if (!DesktopPoll.HasQuestion(question))'),
        'opciones': atServ('if (!DesktopPoll.Fits(options.Length))'),
        'respuesta correcta': atServ('if (quiz && !DesktopPoll.AllowsCorrect(correct, options.Length))'),
        'cierre': atServ('if (!DesktopPoll.ClosesInRange(duration))'),
        'descripción': atServ('if (DesktopPoll.HasDescription(Str(args, "description")))'),
        'petición': atServ('var media = new InputMediaPoll { poll = poll };'),
      }[label]!] as [string, number]);
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i][1], `${steps[i][0]} va después de ${steps[i - 1][0]}`).toBeGreaterThan(steps[i - 1][1]);
    }
  });

  it('la puerta de BK no toca esta clave: el hueco es de parámetro, no de método', () => {
    // `poll.send` sí se atiende en escritorio, así que sigue en «disponible» y la puerta genérica no lo corta.
    expect(DESKTOP_NAMED_IN_SCAFFOLD).not.toContain('poll.send');
    expect(desktopGapRefusal('poll.send')).toBeUndefined();
    expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes('poll.send'))).toBe(true);
    expect(DESKTOP_PENDING.some(claim => claim.methods.includes('poll.send'))).toBe(false);
    // El aviso no gana una coma nueva: lo que falta es un parámetro de una clave que ya contesta.
    expect(DESKTOP_AVAILABLE_TEXT).toContain('encuestas creadas y votadas');
    expect(text('./desktopScope.ts')).toContain("methods: ['poll.send', 'poll.answer', 'poll.voters']");
  });
});

describe('ronda CM · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let base: State;

  const reset = (platform: 'desktop' | 'android') =>
    transport.acceptState({ ...base, platform, active: '1', selfId: '1', canSend: true });
  const lastPoll = () => {
    const list = transport.snapshot().messages as unknown as PollRow[];
    const row = [...list].reverse().find(item => item.poll);
    if (!row?.poll) throw new Error('El andamio no dejó ninguna encuesta en la lista');
    return row.poll;
  };
  const pollCount = () => (transport.snapshot().messages as unknown as PollRow[]).filter(row => row.poll).length;
  const send = (extra: Record<string, unknown> = {}) =>
    call('poll.send', { question: '¿Con descripción?', options: options(3), ...extra });
  /** Lo que el andamio contesta, en texto, para poder negar una frase sin depender de lo demás. */
  const outcome = async (extra: Record<string, unknown> = {}) => {
    try { return { ok: await send(extra), error: '' }; }
    catch (caught) { return { ok: undefined, error: String(caught) }; }
  };

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const pv = await import('./preview');
    transport = await import('./bridge');
    base = pv.fixture;
    reset('desktop');
    call = pv.designRequest as DesignCall;
  });

  it('bajo escritorio, una descripción se niega con la frase con nombre y no con la genérica', async () => {
    const antes = pollCount();
    const first = await outcome({ description: 'El contexto que conviene leer antes de votar.' });
    expect(first.ok).toBeUndefined();
    expect(first.error).toContain(pvLiteral('noDescription'));
    expect(first.error).not.toContain(desktopGenericRefusal('poll.send'));
    // Y no se quedó a medias: la negativa tiene que llegar antes de que la lista crezca.
    expect(pollCount()).toBe(antes);
  });

  it('vacía o en espacios no cuenta, que es lo que deja mandar la encuesta de siempre', async () => {
    for (const benigno of [undefined, '', '   ', '\n\t']) {
      const one = await outcome(benigno === undefined ? {} : { description: benigno });
      expect(one.error, `${JSON.stringify(benigno)} no tendría que negarse`).toBe('');
      expect(one.ok).toBe(true);
      expect(lastPoll().description).toBe('');
    }
  });

  it('la guarda de la descripción es la última: antes manda el cierre', async () => {
    const both = await outcome({ description: 'algo', duration: 4 });
    expect(both.error).toContain(pvLiteral('closeRange'));
    expect(both.error).not.toContain(pvLiteral('noDescription'));
    const badOptions = await outcome({ options: options(13), description: 'algo' });
    expect(badOptions.error).toContain(pvLiteral('batch'));
  });

  it('la negativa solo existe bajo escritorio: en Android la descripción se escribe y aquí no se finge', async () => {
    reset('android');
    const one = await outcome({ description: 'En Android sí viaja.' });
    expect(one.error).not.toContain(pvLiteral('noDescription'));
    expect(one.error).not.toContain(desktopGenericRefusal('poll.send'));
  });
});

describe('ronda CM · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'NativeBridge.java:4698': 'poll.description=pollDescription(p);',
    'NativeBridge.java:5306': 'NativeSnapshot.limit(p.optString("description","").trim(),1024)',
    'NativeBridge.java:5307': 'return text.isEmpty()?null:new TdApi.FormattedText(text,new TdApi.TextEntity[0]);',
    'NativeSnapshot.java:198': 'limit(container.description.text,600)',
    'DesktopPoll.cs:225': 'public const string NoDescription =',
    'DesktopPoll.cs:344': 'public static bool HasDescription(string? raw)',
    'TelegramService.cs:2523': 'if (DesktopPoll.HasDescription(Str(args, "description")))',
    'TelegramService.cs:2945': 'Description = "",',
    'preview.ts:1047': "noDescription: 'La biblioteca de escritorio no tiene campo",
    'preview.ts:1105': "if (String(params.description ?? '').trim()) throw new Error(POLL_REFUSALS.noDescription);",
    'preview.ts:1115': "question: question.slice(0, POLL_SHOWN_QUESTION), description: '',",
    'preview.ts:2445': "if (method === 'poll.send' && state.platform === 'desktop')",
    'BatchPanels.tsx:38': '{poll.description&&<p className="poll-description">',
    'BatchPanels.tsx:63': 'export interface PollDraft {question:string;description:string;',
    'BatchPanels.tsx:94': 'description:description.trim()',
    'BatchPanels.tsx:100': '!desktop&&<label className="field-label">Descripción (opcional)',
    'contract.ts:124': 'description:string',
    'App.tsx:1142': "run<boolean>('poll.send',{...draft",
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CF, CB, BM y BY. */
  const helper = atJava('private static TdApi.FormattedText pollDescription(JSONObject p){');
  const guard = atServ('if (DesktopPoll.HasDescription(Str(args, "description")))');
  const read = atSnap('limit(container.description.text,600)');
  const field = atUi('!desktop&&<label className="field-label">Descripción (opcional)');
  const watched: [string, string][] = [
    ['rondaCM.test.ts', text('./rondaCM.test.ts').split('const text =')[0]],
    ['DesktopPoll.cs descripción', pollCs.slice(atPoll('/// Si la pantalla pidió descripción.') - 1, atPoll('public static bool HasDescription(string? raw)') + 1).join('\n')],
    ['TelegramService.cs envío', service.slice(guard - 4, guard + 2).join('\n')],
    ['TelegramService.cs lectura', service.slice(atServ('Description = "",') - 6, atServ('Description = "",') + 1).join('\n')],
    ['NativeBridge.java sendPoll', java.slice(atJava('TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();') - 1, atJava('TdApi.InputMessagePoll poll=new TdApi.InputMessagePoll();')).join('\n')],
    ['NativeBridge.java helper', java.slice(helper - 4, helper + 3).join('\n')],
    ['NativeSnapshot.java poll', snapshot.slice(read - 3, read + 2).join('\n')],
    ['preview.ts negativa', preview.slice(atPv('const POLL_REFUSALS = {') - 13, atPv('noDescription:') + 3).join('\n')],
    ['preview.ts guarda', preview.slice(atPv('const duration = Number(params.duration ?? 0);'), atPv('const poll: Poll = {')).join('\n')],
    ['preview.ts espejo', preview.slice(atPv('const poll: Poll = {') - 1, atPv('const sent: Message = {') - 1).join('\n')],
    ['BatchPanels.tsx composer', batch.slice(atUi('const [duration,setDuration]=useState(0);') - 1, field + 1).join('\n')],
    ['App.tsx CM', arow(atApp("openPoll(){setDialog({title:'Crear encuesta'"))],
  ];

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' ? java
      : file === 'NativeSnapshot.java' ? snapshot
        : file === 'TelegramService.cs' ? service
          : file === 'DesktopPoll.cs' ? pollCs
            : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const [, body] of watched) {
    for (const match of body.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj)):(\d+)(?:-(\d+))?/g)) {
      written.set(`${match[1]}:${match[2]}`, Math.max(written.get(`${match[1]}:${match[2]}`) ?? 0, match[3] ? Number(match[3]) : 0));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('ninguna ancla se cita dos veces con cifras que no coinciden, y ninguna cifra se cita sin ancla', () => {
    for (const [citation] of written) expect(anchors[citation], `${citation} no está en la tabla de anclas`).toBeTypeOf('string');
    for (const citation of Object.keys(anchors)) expect(written.has(citation), `${citation} no lo cita nadie`).toBe(true);
  });

  it('el andamio ya no cita las cifras de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    const medidas: [string, number][] = [
      ['NativeBridge.java', atJava('poll.description=pollDescription(p);')],
      ['NativeBridge.java', atJava('NativeSnapshot.limit(p.optString("description","").trim(),1024);')],
      ['NativeBridge.java', atJava('return text.isEmpty()?null:new TdApi.FormattedText(text,new TdApi.TextEntity[0]);')],
      ['NativeSnapshot.java', atSnap('limit(container.description.text,600)')],
      ['DesktopPoll.cs', atPoll('public const string NoDescription =')],
      ['DesktopPoll.cs', atPoll('public static bool HasDescription(string? raw)')],
      ['TelegramService.cs', atServ('if (DesktopPoll.HasDescription(Str(args, "description")))')],
      ['TelegramService.cs', atServ('Description = "",')],
      ['preview.ts', atPv("noDescription: 'La biblioteca de escritorio no tiene campo")],
      ['preview.ts', atPv("if (String(params.description ?? '').trim()) throw new Error(POLL_REFUSALS.noDescription);")],
      ['preview.ts', atPv("question: question.slice(0, POLL_SHOWN_QUESTION), description: '',")],
      ['preview.ts', atPv("if (method === 'poll.send' && state.platform === 'desktop')")],
      ['BatchPanels.tsx', atUi('{poll.description&&<p className="poll-description">')],
      ['BatchPanels.tsx', atUi('export interface PollDraft {question:string;description:string;')],
      ['BatchPanels.tsx', atUi('description:description.trim()')],
      ['BatchPanels.tsx', atUi('!desktop&&<label className="field-label">Descripción (opcional)')],
      ['contract.ts', atDoc('export interface Poll {')],
      ['App.tsx', atApp("'poll.send',{...draft")],
    ];
    for (const [file, n] of medidas) {
      expect(anchors[`${file}:${n}`], `${file}:${n} no está en la tabla de anclas`).toBeTypeOf('string');
    }
    expect(Object.keys(anchors)).toHaveLength(18);
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    // Medido hoy con `split(/\r?\n/).length`: la tanda CK dejó una línea de caso y un bloque de métodos en
    // `NativeBridge.java`, cuatro líneas en `App.tsx` (tres del menú y la función nueva) y tres en `preview.ts`. La
    // ronda CL sumó encima su línea de `calls.list` y su bloque en el puente, las cincuenta de la pantalla del
    // registro en `preview.ts` y las cuatro de la fila y la página en `contract.ts`. La CK-B sumó al despacho las
    // noventa y siete líneas del brazo de `message.edit.media` y su método. La ronda CD sumó diez líneas al despacho —
    // el brazo de `premium.state` con su comentario, la bandera `customReaction` con el suyo y el comentario que dice
    // las dos caras de `allowCustom`— y no tocó ninguna de las demás capas de esta hoja. La ronda CE sumó treinta y
    // siete líneas al despacho —el `ParseEntities` reescrito con el techo de cien y sus dos ayudantes de negativa, la
    // vuelta de la entidad con la cifra del emoji y la dirección materializada, y el parseo por delante de la marca de
    // envío— y no tocó ninguna de las demás capas de esta hoja; doce más, los dos ayudantes de la ronda CW-D.
    // Veinticuatro más, repartidas entre los fondos de la CH-A y el aviso `UpdateDefaultBackground` de la CH-A2, y
    // cuatro en la instantánea con el `appearance` que publica los dos huecos.
    expect(java).toHaveLength(5425);
    expect(snapshot).toHaveLength(554);
    expect(service).toHaveLength(4301);
    expect(pollCs).toHaveLength(500);
    expect(contract).toHaveLength(250);
    expect(batch).toHaveLength(351);
    expect(preview).toHaveLength(3252);
    expect(app).toHaveLength(1557);
  });
});
