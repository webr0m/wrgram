import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopGapRefusal } from './desktopGap';
import {
  CALL_LOG_LABELS, CALL_LOG_LIMIT, CALL_LOG_MAX_OFFSET, CALL_LOG_REFUSALS,
  callDurationText, callLogMore, callLogOffsetProblem, callLogPage, callLogTotal, callRowLabel,
  isMissedReason, matchesCallName, normalizeCallName,
} from './callLogModel';
import type { CallLogEntry } from './contract';

/**
 * Ronda CL — el registro de llamadas.
 *
 * La premisa de la cola era falsa, y toda la ronda gira alrededor de eso: `SearchCallMessages` (`TdApi.java:145268`)
 * tiene **tres** campos —`offset` (`TdApi.java:145272`), `limit` (`TdApi.java:145276`) y `onlyMissed`
 * (`TdApi.java:145280`)— y ninguno se llama `query`. Lo que escribe la persona no puede viajar a Telegram, así que el
 * nombre solo recorta lo que ya bajó. Responde `FoundMessages` (`TdApi.java:27093`) con `totalCount`
 * (`TdApi.java:27097`, aproximado y -1 cuando Telegram no lo sabe), `messages` (`TdApi.java:27101`) y `nextOffset`
 * (`TdApi.java:27105`), y la librería avisa del techo de la página en `TdApi.java:145274` («up to 100»). Con ese
 * hueco por escrito, la pantalla no puede prometer «sin resultados»: puede prometer «esto es lo que hay descargado».
 *
 * **Dónde vive cada regla.** Una sola vez, en `CallLog.java`: el tamaño de página (`CallLog.java:20`), el techo del
 * cursor (`CallLog.java:22`), las dos negaciones (`CallLog.java:23-24`), el constructor cerrado (`CallLog.java:26`),
 * las dos familias (`CallLog.java:29`), lo que el servidor cuenta como no contestada (`CallLog.java:34-36` y el
 * `wasMissed` de grupo en `CallLog.java:39`), el vídeo (`CallLog.java:46`), la duración (`CallLog.java:54`), el cursor
 * (`CallLog.java:63-67`), el testigo de que queda página (`CallLog.java:70-72`), el total que nunca se pinta negativo
 * (`CallLog.java:75-77`), el nombre sin acentos (`CallLog.java:80-83`) y su `contains` (`CallLog.java:86-90`). El
 * puente no repite ninguna de las dos negaciones: las oye por referencia.
 *
 * **El orden del cuerpo, medido línea por línea.** `NativeBridge.java:753` enruta `calls.list` justo detrás de la
 * búsqueda de mensajes, y el cuerpo (`NativeBridge.java:5383-5412`) valida el cursor (`NativeBridge.java:5386`), niega
 * el que no sigue el recorrido de esta sesión (`NativeBridge.java:5388`), arma la función con el `LIMIT` de la clase
 * (`NativeBridge.java:5390`), descarta lo que no es llamada (`NativeBridge.java:5394`), apunta los chats que faltan sin
 * pasar de veinte (`NativeBridge.java:5396`), comprueba que la cuenta sigue siendo la misma (`NativeBridge.java:5399`)
 * y **solo entonces** recorta por nombre (`NativeBridge.java:5404`) y arma la fila (`NativeBridge.java:5405`). La frase
 * de cada fila la pone la rama de `MessageCall` (`ServiceMessages.java:125`), para que el registro no invente otra manera de
 * decir lo que ya se lee dentro del chat. El cursor que se recuerda es el que se repartió (`NativeBridge.java:5407`) y
 * la página sale con las dos cifras (`NativeBridge.java:5408`): `fetched` antes del recorte, `shown` después.
 *
 * **Windows, por su nombre.** `calls.list` está declarado pendiente (`desktopScope.ts:98`) y la rama de escritorio de
 * Ajustes no lo ofrece: el registro solo se pinta en la lista de categorías del móvil (`SettingsPage.tsx:232`, fuera
 * del bloque que devuelve `SettingsPage.tsx:179`). En el andamio sí trabaja: `preview.ts:2497` lo despacha a
 * `designCallPage` (`preview.ts:3347-3366`), que copia el mismo orden —negación, cursor viejo, recorte local— y
 * recuerda el cursor siguiente como hace el puente.
 *
 * **Las cuatro casas de las palabras.** La clave la declara `BridgePolicy.java:55`, al lado de la llamada que ya vivía
 * aquí (`BridgePolicy.java:41`), y el brazo la recoge entre la búsqueda de mensajes (`NativeBridge.java:752`) y los
 * hilos. La fila la arma `CallLog.java:97` y la frase se la presta `ServiceMessages.java:125-126`, con la duración de
 * `ServiceMessages.java:186-191`; por eso el registro y la burbuja no pueden decir dos cosas distintas de la misma
 * llamada. El espejo de TypeScript arma la página en `callLogModel.ts:113` y el contrato con las dos cifras está en
 * `contract.ts:248-249`. La pantalla manda el nombre vacío —`CallLogPanel.tsx:36`—, recorta en memoria con la regla de
 * la clase —`CallLogPanel.tsx:59`— y avisa del recorte —`CallLogPanel.tsx:77`— antes de ofrecer más llamadas. El
 * andamio pagina de cinco (`preview.ts:3320`), recuerda el cursor que repartió (`preview.ts:3340`) y toma los títulos
 * de la bandeja real (`preview.ts:3358`), y la librería ordena la lista de arriba abajo (`TdApi.java:145264`).
 *
 * Como en CF, CM, CN, CI, CJ y CK: la última prueba mide las citas.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const jvmDir = '../../mobile/android/app/src/test/java/cc/webrom/wrgram/';
const tdlibPath = '../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java';

const bridge = rows(`${javaDir}NativeBridge.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const pure = rows(`${javaDir}CallLog.java`);
const service = rows(`${javaDir}ServiceMessages.java`);
const jvm = rows(`${jvmDir}CallLogPolicyTest.java`);
const model = rows('./callLogModel.ts');
const panel = rows('./CallLogPanel.tsx');
const settings = rows('./SettingsPage.tsx');
const contract = text('./contract.ts');
const scope = rows('./desktopScope.ts');
const preview = rows('./preview.ts');
const tdlib = rows(tdlibPath);

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const atJava = (n: string) => en(n, bridge, 'NativeBridge.java');
const atPure = (n: string) => en(n, pure, 'CallLog.java');
const atModel = (n: string) => en(n, model, 'callLogModel.ts');
const atPanel = (n: string) => en(n, panel, 'CallLogPanel.tsx');
const count = (needle: string, cuerpo: string | string[]) => (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;

/** El cuerpo de un método, recortado por balance de llaves a partir de su firma. */
function body(lines: string[], signature: string, where: string): string {
  const start = lines.findIndex(row => row.includes(signature));
  if (start < 0) throw new Error(`Falta ${signature} en ${where}`);
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index]) {
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return lines.slice(start, index + 1).join('\n');
    }
  }
  throw new Error(`${signature} no cierra su llave en ${where}`);
}

/** La cadena entre comillas de una constante Java, para comparar carácter a carácter con el espejo de TypeScript. */
const citaJava = (row: string) => /"(.*)"/.exec(row)?.[1] ?? '';

const KEY = 'calls.list';
const ARM = `case "${KEY}":`;

/** Una fila del registro, con la forma que devuelve el puente. */
const fila = (chatId: string, title: string, missed: boolean): CallLogEntry =>
  ({ chatId, messageId: `9${chatId}`, title, label: missed ? CALL_LOG_LABELS.missed : CALL_LOG_LABELS.finished(' · 1 min 5 s'), date: 1771234567, missed, video: false, group: false, duration: missed ? 0 : 65 });

describe('ronda CL · el puente de Android', () => {
  it('la clave está declarada y el brazo entra entre la búsqueda y los hilos', () => {
    expect(policy).toContain(`static { METHODS.add("${KEY}"); }`);
    // `call.open` ya vivía en la política; lo nuevo es el registro, y entra detrás sin pisar lo de antes.
    expect(policy).toContain('static { METHODS.add("call.open"); }');
    const arm = atJava(ARM);
    expect(bridge[arm - 1]).toContain('callLog(p,a);break;');
    expect(bridge[arm - 2]).toContain('case "messages.search.more":searchMore(p,a);break;');
    expect(atJava('case "thread.load":')).toBeGreaterThan(arm);
    expect(count(ARM, bridge)).toBe(1);
  });

  it('el cuerpo niega el cursor antes de preguntar y recorta el nombre después de la página', () => {
    const escrita = body(bridge, 'private void callLog(JSONObject p,Answer a){', 'NativeBridge.java');
    const orden = [
      'requireAccount();',
      'try{offset=CallLog.offset(p.optString("offset",""));}catch(IllegalArgumentException invalid){a.fail(invalid.getMessage());return;}',
      'if(!offset.isEmpty()&&(callLogOwner!=session.selfId||callLogMissed!=onlyMissed||!offset.equals(callLogOffset))){a.fail(CallLog.STALE_CURSOR);return;}',
      'TdApi.SearchCallMessages search=new TdApi.SearchCallMessages();search.offset=offset;search.limit=CallLog.LIMIT;search.onlyMissed=onlyMissed;',
      'perform(search,a,result->{',
      'if(message==null||!CallLog.isCall(message.content))continue;',
      'loadSearchChats(missing,0,()->{',
      'if(!CallLog.matches(title,query))continue;',
      'callLogOwner=owner;callLogMissed=onlyMissed;callLogOffset=CallLog.more(result.nextOffset)?result.nextOffset:"";',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = escrita.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // La prueba de la premisa falsa: el nombre no entra en la función de Telegram, entra aquí dentro.
    expect(escrita).not.toContain('search.query');
    expect(escrita.indexOf('CallLog.matches(title,query)')).toBeGreaterThan(escrita.indexOf('perform(search,a,result'));
    // Y el `onlyMissed` sí viaja: es lo único del cuadro que el servidor conoce.
    expect(escrita).toContain('search.onlyMissed=onlyMissed;');
  });

  it('la página que no existe se niega con las palabras de la clase, no con otras', () => {
    expect(count('a.fail(CallLog.STALE_CURSOR)', bridge)).toBe(1);
    expect(count(CALL_LOG_REFUSALS.staleCursor, bridge)).toBe(0);
    expect(count(CALL_LOG_REFUSALS.badOffset, bridge)).toBe(0);
    expect(count('a.fail("No se pudo preparar el registro de llamadas.");', bridge)).toBe(1);
    expect(count('La cuenta cambió.', body(bridge, 'private void callLog(', 'NativeBridge.java'))).toBe(1);
  });

  it('los chats que faltan se piden con techo y la fila sale con la frase del chat', () => {
    const escrita = body(bridge, 'private void callLog(JSONObject p,Answer a){', 'NativeBridge.java');
    expect(escrita).toContain('!missing.contains(message.chatId)&&missing.size()<20');
    expect(escrita).toContain('rows.put(CallLog.row(message,title,ServiceMessages.text(message,session)));shown++;');
    // `fetched` cuenta lo que bajó, `shown` lo que el nombre deja ver: las dos cifras están en el mismo JSON.
    expect(escrita).toContain('.put("fetched",kept.size()).put("shown",shown).put("total",CallLog.total(result.totalCount))');
    expect(escrita).toContain('.put("nextOffset",callLogOffset).put("more",!callLogOffset.isEmpty())');
    expect(count('CallLog.total(', bridge)).toBe(1);
    expect(count('CallLog.more(', bridge)).toBe(1);
  });

  it('la librería no tiene campo de nombre y el total llega aproximado', () => {
    const funcion = en('public static class SearchCallMessages extends Function<FoundMessages> {', tdlib, 'TdApi.java');
    const cuerpo = tdlib.slice(funcion - 1, funcion + 13);
    expect(cuerpo.join('\n')).toContain('public String offset;');
    expect(cuerpo.join('\n')).toContain('public int limit;');
    expect(cuerpo.join('\n')).toContain('public boolean onlyMissed;');
    // Aquí está el hueco, escrito por la propia librería: tres campos y ni una sola mención de un texto.
    expect(cuerpo.join('\n').toLowerCase()).not.toContain('query');
    const respuesta = en('public static class FoundMessages extends Object {', tdlib, 'TdApi.java');
    const page = tdlib.slice(respuesta - 1, respuesta + 13);
    expect(page.join('\n')).toContain('public int totalCount;');
    expect(page.join('\n')).toContain('public Message[] messages;');
    expect(page.join('\n')).toContain('public String nextOffset;');
  });
});

describe('ronda CL · la clase pura y su prueba JVM', () => {
  it('el espejo de TypeScript dice las mismas cifras y las mismas negaciones', () => {
    const limite = Number(/static final int LIMIT = (\d+);/.exec(pure[atPure('static final int LIMIT =') - 1])?.[1]);
    const techo = Number(/static final int MAX_OFFSET = (\d+);/.exec(pure[atPure('static final int MAX_OFFSET =') - 1])?.[1]);
    expect(limite).toBe(CALL_LOG_LIMIT);
    expect(techo).toBe(CALL_LOG_MAX_OFFSET);
    // TDLib admite hasta cien (`TdApi.java:145274`); cincuenta es de aquí, y el espejo lo repite.
    expect(CALL_LOG_LIMIT).toBeLessThanOrEqual(100);
    expect(pure[atPure('static final String BAD_OFFSET =') - 1]).not.toBe('');
    expect(citaJava(pure[atPure('static final String BAD_OFFSET =') - 1])).toBe(CALL_LOG_REFUSALS.badOffset);
    expect(citaJava(pure[atPure('static final String STALE_CURSOR =') - 1])).toBe(CALL_LOG_REFUSALS.staleCursor);
    expect(model[atModel('export const CALL_LOG_LIMIT') - 1]).toContain(`= ${CALL_LOG_LIMIT};`);
  });

  it('las cuatro terminaciones del registro son las frases de la burbuja', () => {
    const uno = service[en('else if(c instanceof TdApi.MessageCall){', service, 'ServiceMessages.java') - 1];
    const grupo = service[en('else if(c instanceof TdApi.MessageGroupCall){', service, 'ServiceMessages.java') - 1];
    expect(uno).toContain('String type=a.isVideo?"Videollamada":"Llamada";');
    for (const [clave, sufijo] of [['missed', 'perdida'], ['declined', 'rechazada'], ['disconnected', 'interrumpida'], ['finished', 'finalizada']] as const) {
      expect(uno, sufijo).toContain(`type+" ${sufijo}"`);
      const voz = clave === 'finished' ? CALL_LOG_LABELS.finished('') : CALL_LOG_LABELS[clave];
      const video = clave === 'finished' ? CALL_LOG_LABELS.videoFinished('') : CALL_LOG_LABELS[`video${clave[0].toUpperCase()}${clave.slice(1)}` as keyof typeof CALL_LOG_LABELS];
      expect(voz, sufijo).toBe(`Llamada ${sufijo}`);
      expect(String(video), sufijo).toBe(`Videollamada ${sufijo}`);
    }
    // En grupo no hay motivo suelto —las dos caras son la bandera y la duración— y el sustantivo lo pone `isVideo`,
    // igual que arriba, con lo que una llamada de grupo sin vídeo ya no puede decirse videollamada.
    expect(grupo).toContain('String type=a.isVideo?"Videollamada":"Llamada de voz";');
    for (const [sufijo, voz, video] of [
      ['perdida', CALL_LOG_LABELS.voiceMissed, CALL_LOG_LABELS.videoMissed],
      ['en curso', CALL_LOG_LABELS.voiceInProgress, CALL_LOG_LABELS.videoInProgress],
      ['finalizada', CALL_LOG_LABELS.voiceFinished(''), CALL_LOG_LABELS.videoFinished('')],
    ] as const) {
      expect(grupo, sufijo).toContain(`type+" ${sufijo}"`);
      expect(voz, sufijo).toBe(`Llamada de voz ${sufijo}`);
      expect(video, sufijo).toBe(`Videollamada ${sufijo}`);
    }
    // Sin duración no va ni el punto medio —las tres formas son las de `ServiceMessages.duration`.
    expect(service[en('static String duration(int seconds){', service, 'ServiceMessages.java') - 1]).toContain('static String duration(int seconds){');
    expect(callDurationText(3840)).toBe('1 h 4 min');
    expect(callDurationText(95)).toBe('1 min 35 s');
    expect(callDurationText(45)).toBe('45 s');
    expect(callDurationText(-5)).toBe('0 s');
  });

  it('el registro no admite nombres que la burbuja no escribiría', () => {
    expect(callRowLabel('missed', false, false, 0)).toBe('Llamada perdida');
    expect(callRowLabel('declined', true, false, 0)).toBe('Videollamada rechazada');
    expect(callRowLabel('disconnected', false, false, 30)).toBe('Llamada interrumpida');
    expect(callRowLabel('ended', false, false, 95)).toBe('Llamada finalizada · 1 min 35 s');
    expect(callRowLabel('ended', true, false, 0)).toBe('Videollamada finalizada');
    expect(callRowLabel('missed', true, true, 0)).toBe('Videollamada perdida');
    expect(callRowLabel('ended', true, true, 0, true)).toBe('Videollamada en curso');
    expect(callRowLabel('missed', false, true, 0)).toBe('Llamada de voz perdida');
    expect(callRowLabel('ended', false, true, 125)).toBe('Llamada de voz finalizada · 2 min 5 s');
    expect(callRowLabel('declined', false, true, 0, true)).toBe('Llamada de voz en curso');
    // El servidor cuenta las rechazadas como no contestadas, y `onlyMissed` hace lo mismo arriba.
    expect(isMissedReason('missed')).toBe(true);
    expect(isMissedReason('declined')).toBe(true);
    expect(isMissedReason('disconnected')).toBe(false);
    expect(isMissedReason('ended')).toBe(false);
    expect(body(pure, 'static boolean missed(TdApi.CallDiscardReason reason)', 'CallLog.java'))
      .toContain('reason instanceof TdApi.CallDiscardReasonMissed || reason instanceof TdApi.CallDiscardReasonDeclined');
    expect(body(pure, 'static boolean missed(TdApi.Message message)', 'CallLog.java')).toContain('.wasMissed');
  });

  it('el cursor es opaco, se niega por su cuenta y solo él prueba que queda página', () => {
    expect(callLogOffsetProblem(undefined)).toBeNull();
    expect(callLogOffsetProblem('1771234567890')).toBeNull();
    expect(callLogOffsetProblem('0'.repeat(CALL_LOG_MAX_OFFSET))).toBeNull();
    expect(callLogOffsetProblem('0'.repeat(CALL_LOG_MAX_OFFSET + 1))).toBe(CALL_LOG_REFUSALS.badOffset);
    expect(callLogOffsetProblem(42)).toBe(CALL_LOG_REFUSALS.badOffset);
    expect(count('throw new IllegalArgumentException(BAD_OFFSET);', pure)).toBe(1);
    expect(callLogMore('')).toBe(false);
    expect(callLogMore('1771234567890')).toBe(true);
    expect(callLogTotal(-1)).toBe(0);
    expect(callLogTotal(37)).toBe(37);
    // Una página corta con cursor sigue siendo página: el único testigo es el cursor, no el tamaño.
    expect(body(pure, 'static boolean more(', 'CallLog.java')).toContain('nextOffset != null && !nextOffset.isEmpty()');
  });

  it('la prueba JVM existe, cubre las reglas y no deja caracteres CJK en la capa nueva', () => {
    expect(count('@Test', jvm)).toBe(13);
    expect(jvm[en('public class CallLogPolicyTest', jvm, 'CallLogPolicyTest.java') - 1]).toContain('public class CallLogPolicyTest {');
    expect(count('CallLog.offset(', jvm)).toBeGreaterThanOrEqual(4);
    for (const archivo of [pure, jvm, model, panel]) {
      expect(/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(archivo.join('\n')), 'caracteres CJK en la capa nueva').toBe(false);
    }
  });
});

describe('ronda CL · la pantalla', () => {
  it('la entrada vive en Ajustes del móvil y el registro se declara de solo lectura', () => {
    const filaEntrada = en("id:'calls'", settings, 'SettingsPage.tsx');
    expect(settings[filaEntrada - 1]).toContain("{id:'calls',title:'Registro de llamadas'");
    expect(settings[filaEntrada - 1]).toContain('<CallLogPanel key={state.selfId} run={run} ready={state.ready}/>');
    expect(count("id:'calls'", settings)).toBe(1);
    expect(settings[atSettingsImport() - 1]).toContain("from './CallLogPanel'");
    // La rama de escritorio devuelve su propio `<main>` antes de la lista de categorías y no menciona el panel.
    const escritorio = settings.slice(
      en("if(state.platform==='desktop') return", settings, 'SettingsPage.tsx') - 1,
      en('const categories=[', settings, 'SettingsPage.tsx') - 1,
    ).join('\n');
    expect(escritorio).not.toContain('CallLogPanel');
    expect(panel[atPanel('El registro es solo lectura') - 1]).toContain('El registro es solo lectura');
    expect(count("run<CallLogPage>('calls.list'", panel)).toBe(1);
  });

  it('la pantalla manda el nombre vacío y lo recorta en memoria, que es lo único que puede hacer', () => {
    const llamada = panel[atPanel("run<CallLogPage>('calls.list'") - 1];
    expect(llamada).toContain('query:\'\'');
    expect(llamada).toContain('onlyMissed:missed');
    // El cuadro escribe en memoria con la misma regla que el puente, y cambiarlo no vuelve a preguntar.
    expect(panel[atPanel('const visible=useMemo') - 1]).toContain('matchesCallName(row.title,query)');
    expect(count('matchesCallName(', panel)).toBe(1);
    expect(count('const page=await run<CallLogPage>', panel)).toBe(1);
  });

  it('las dos cifras se dicen y el recorte local se avisa en vez de prometer vacío', () => {
    expect(panel.join('\n')).toContain('Telegram devolvió {register.fetched} fila');
    expect(panel.join('\n')).toContain('coinciden con «${query}»');
    expect(panel.join('\n')).toContain('en total, aproximado');
    expect(panel.join('\n')).toContain('Telegram no informa cuántas hay en total');
    expect(panel[atPanel('El nombre solo recorta lo que ya se descargó') - 1]).toContain('Telegram no permite buscar llamadas por nombre');
    expect(panel.join('\n')).toContain('Ninguna de las filas descargadas coincide con ese nombre.');
    expect(panel.join('\n')).toContain('Cargar más llamadas');
    // El aviso no se guarda para el final: sale en cuanto hay un nombre escrito.
    const aviso = atPanel('El nombre solo recorta lo que ya se descargó');
    expect(panel.slice(aviso - 1).join('\n')).toContain('Cargar más llamadas');
  });

  it('el contrato lleva las dos cifras, que es lo que la pantalla necesita para no mentir', () => {
    expect(contract).toContain('export interface CallLogEntry {chatId:string;messageId:string;title:string;label:string;date:number;missed:boolean;video:boolean;group:boolean;duration:number}');
    expect(contract).toContain('export interface CallLogPage {rows:CallLogEntry[];fetched:number;shown:number;total:number;nextOffset:string;more:boolean}');
    expect(count('fetched:number;shown:number;total:number', contract)).toBe(1);
  });
});

function atSettingsImport(): number {
  return en("import { CallLogPanel } from './CallLogPanel'", settings, 'SettingsPage.tsx');
}

describe('ronda CL · el andamio y Windows', () => {
  it('el andamio copia el orden del puente: negación, cursor viejo y recorte local', () => {
    expect(preview[atPreview("if (method === 'calls.list') return designCallPage") - 1]).toContain(`if (method === '${KEY}') return designCallPage(params, state);`);
    const pagina = body(preview, 'function designCallPage(', 'preview.ts');
    const orden = [
      'const refusal = callLogOffsetProblem(params.offset);',
      'if (refusal) throw new Error(refusal);',
      'throw new Error(CALL_LOG_REFUSALS.staleCursor);',
      'const page = callLogPage(pool, start, query, onlyMissed, pool.length, CALL_LOG_DESIGN_PAGE);',
      'designCalls = { owner: state.selfId, onlyMissed, cursor: page.nextOffset };',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = pagina.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en el andamio`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // El espejo se queda con el cursor que repartió, igual que el puente: sin eso no puede negar un cursor viejo.
    expect(preview[atPreview('let designCalls:') - 1]).toContain('cursor: string } | null = null;');
  });

  it('las filas del andamio tienen nombre de chat de verdad, no inventado', () => {
    const muestra = preview
      .slice(en('const designCallRows', preview, 'preview.ts') - 1, en('let designCalls:', preview, 'preview.ts') - 1)
      .join('\n');
    const ids = [...muestra.matchAll(/chat: '([^']+)'/g)].map(match => match[1]);
    expect(ids.length).toBe(15);
    expect(preview[atPreview('const CALL_LOG_DESIGN_PAGE') - 1]).toBe('const CALL_LOG_DESIGN_PAGE = 5;');
    // Los títulos salen de la lista de chats del propio andamio, así que una fila no puede prometer un nombre ausente.
    expect(preview[atPreview('chatId: row.chat, messageId') - 1])
      .toContain('title: state.chats.find(chat => chat.id === row.chat)?.title');
    const lista = preview[atPreview("['11','María Fernández'") - 1];
    for (const id of ids) expect(lista, `el chat ${id} del registro no está en la bandeja`).toContain(`['${id}'`);
    expect(count('callRowLabel(', preview)).toBe(1);
  });

  it('la página corta del andamio deja ver el recorte: descargadas y coincidentes son cifras distintas', () => {
    const pool = [fila('11', 'María Fernández', false), fila('13', 'Daniel Ruiz', true), fila('17', 'Javier Morales', false), fila('24', 'Nuria Pérez', true)];
    const todas = callLogPage(pool, 0, '', false, pool.length, 50);
    expect(todas.fetched).toBe(4);
    expect(todas.shown).toBe(4);
    expect(todas.more).toBe(false);
    // Con nombre: la página se recorta después, así que `fetched` sigue siendo el tamaño de lo que Telegram devolvió.
    const buscar = callLogPage(pool, 0, 'daniel', false, pool.length, 2);
    expect(buscar.fetched).toBe(2);
    expect(buscar.shown).toBe(1);
    expect(buscar.rows.map(row => row.title)).toEqual(['Daniel Ruiz']);
    expect(buscar.nextOffset).toBe('2');
    expect(buscar.more).toBe(true);
    // `onlyMissed` recorta antes de paginar porque eso hace el servidor: el cursor cuenta sobre lo filtrado.
    const perdidas = callLogPage(pool, 0, '', true, pool.length, 1);
    expect(perdidas.fetched).toBe(1);
    expect(perdidas.nextOffset).toBe('1');
    expect(callLogPage(pool, 1, '', true, pool.length, 1).rows.map(row => row.title)).toEqual(['Nuria Pérez']);
    expect(callLogPage(pool, 2, '', true, pool.length, 1).more).toBe(false);
  });

  it('el nombre se compara sin acentos, en minúsculas y con los espacios de golpe', () => {
    expect(normalizeCallName('José   ÁLVAREZ')).toBe('jose alvarez');
    expect(matchesCallName('Ana', '')).toBe(true);
    expect(matchesCallName('Ana', '   ')).toBe(true);
    expect(matchesCallName('josé   alvarez', 'José  Álvarez')).toBe(true);
    expect(matchesCallName('Comunidad WR', 'comunidad wr')).toBe(true);
    expect(matchesCallName('Ana', 'juan')).toBe(false);
    expect(matchesCallName(undefined as unknown as string, 'ana')).toBe(false);
    // La misma regla en las dos capas: el andamio no puede enseñar un filtro que el puente no haría.
    expect(body(pure, 'static boolean matches(', 'CallLog.java')).toContain('normalize(title).contains(needle)');
  });

  it('Windows lo declara pendiente y el andamio lo niega por su nombre', () => {
    const filaPendiente = en(`'${KEY}'`, scope, 'desktopScope.ts');
    expect(scope[filaPendiente - 1]).toContain("label: 'notificaciones push, llamadas y WR IA'");
    expect(count(`'${KEY}'`, scope)).toBe(1);
    expect(scope.slice(0, filaPendiente).join('\n')).toContain('DESKTOP_PENDING');
    expect(desktopGapRefusal(KEY)).toBe(`No disponible en escritorio (beta): ${KEY}`);
    // La llamada real no está en el puente de Windows: lo que hay en el registro es el hueco declarado.
    expect(model[atModel('export function callLogPage') - 1]).toContain('export function callLogPage(');
  });
});

function atPreview(needle: string): number {
  return en(needle, preview, 'preview.ts');
}

describe('ronda CL · las citas', () => {
  /** Lo que tiene que decir hoy la primera línea de cada cita. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    'TdApi.java:145264': 'Searches for call and group call messages. Returns the results in reverse chronological order',
    'TdApi.java:145268': 'public static class SearchCallMessages extends Function<FoundMessages> {',
    'TdApi.java:145272': 'public String offset;',
    'TdApi.java:145274': 'The maximum number of messages to be returned; up to 100',
    'TdApi.java:145276': 'public int limit;',
    'TdApi.java:145280': 'public boolean onlyMissed;',
    'TdApi.java:27093': 'public static class FoundMessages extends Object {',
    'TdApi.java:27097': 'public int totalCount;',
    'TdApi.java:27101': 'public Message[] messages;',
    'TdApi.java:27105': 'public String nextOffset;',
    'BridgePolicy.java:41': 'static { METHODS.add("call.open"); }',
    'BridgePolicy.java:55': 'static { METHODS.add("calls.list"); }',
    'NativeBridge.java:752': 'case "messages.search.more":searchMore(p,a);break;',
    'NativeBridge.java:753': 'case "calls.list":callLog(p,a);break;',
    'NativeBridge.java:5383': 'private void callLog(JSONObject p,Answer a){',
    'NativeBridge.java:5386': 'try{offset=CallLog.offset(p.optString("offset",""));',
    'NativeBridge.java:5388': 'if(!offset.isEmpty()&&(callLogOwner!=session.selfId',
    'NativeBridge.java:5390': 'TdApi.SearchCallMessages search=new TdApi.SearchCallMessages();',
    'NativeBridge.java:5394': 'if(message==null||!CallLog.isCall(message.content))continue;',
    'NativeBridge.java:5396': '!missing.contains(message.chatId)&&missing.size()<20',
    'NativeBridge.java:5399': 'if(!currentAccount()||session.selfId!=owner){a.fail("La cuenta cambió.");return;}',
    'NativeBridge.java:5404': 'if(!CallLog.matches(title,query))continue;',
    'NativeBridge.java:5405': 'rows.put(CallLog.row(message,title,ServiceMessages.text(message,session)));shown++;',
    'NativeBridge.java:5407': 'callLogOwner=owner;callLogMissed=onlyMissed;',
    'NativeBridge.java:5408': '.put("fetched",kept.size()).put("shown",shown)',
    'CallLog.java:20': 'static final int LIMIT = 50;',
    'CallLog.java:22': 'static final int MAX_OFFSET = 64;',
    'CallLog.java:23': 'static final String BAD_OFFSET =',
    'CallLog.java:24': 'static final String STALE_CURSOR =',
    'CallLog.java:26': 'private CallLog() {}',
    'CallLog.java:29': 'static boolean isCall(TdApi.MessageContent content) {',
    'CallLog.java:34': 'static boolean missed(TdApi.CallDiscardReason reason) {',
    'CallLog.java:39': 'static boolean missed(TdApi.Message message) {',
    'CallLog.java:46': 'static boolean video(TdApi.Message message) {',
    'CallLog.java:54': 'static int duration(TdApi.Message message) {',
    'CallLog.java:63': 'static String offset(String raw) {',
    'CallLog.java:70': 'static boolean more(String nextOffset) {',
    'CallLog.java:75': 'static int total(int raw) {',
    'CallLog.java:80': 'static String normalize(String value) {',
    'CallLog.java:86': 'static boolean matches(String title, String query) {',
    'CallLog.java:97': 'static JSONObject row(TdApi.Message message, String title, String label) throws Exception {',
    'ServiceMessages.java:125': 'String type=a.isVideo?"Videollamada":"Llamada";',
    'ServiceMessages.java:186': 'static String duration(int seconds){',
    'callLogModel.ts:113': 'export function callLogPage(',
    'CallLogPanel.tsx:36': "run<CallLogPage>('calls.list',{offset:cursor,query:'',onlyMissed:missed})",
    'CallLogPanel.tsx:59': 'matchesCallName(row.title,query)',
    'CallLogPanel.tsx:77': 'El nombre solo recorta lo que ya se descargó',
    'SettingsPage.tsx:179': "if(state.platform==='desktop') return",
    'SettingsPage.tsx:232': "{id:'calls',title:'Registro de llamadas'",
    'contract.ts:248': 'export interface CallLogEntry',
    'contract.ts:249': 'export interface CallLogPage',
    'desktopScope.ts:98': "label: 'notificaciones push, llamadas y WR IA'",
    'preview.ts:2497': "if (method === 'calls.list') return designCallPage(params, state);",
    'preview.ts:3320': 'const CALL_LOG_DESIGN_PAGE = 5;',
    'preview.ts:3340': 'let designCalls: { owner: string; onlyMissed: boolean; cursor: string } | null = null;',
    'preview.ts:3347': 'function designCallPage(params: Record<string, unknown>, state: State): CallLogPage {',
    'preview.ts:3358': 'state.chats.find(chat => chat.id === row.chat)',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'NativeBridge.java:5383': [5412, '}'],
    'CallLog.java:20': [24, 'static final String STALE_CURSOR ='],
    'CallLog.java:23': [24, 'static final String STALE_CURSOR ='],
    'CallLog.java:34': [36, '}'],
    'CallLog.java:63': [67, '}'],
    'CallLog.java:70': [72, '}'],
    'CallLog.java:75': [77, '}'],
    'CallLog.java:80': [83, '}'],
    'CallLog.java:86': [90, '}'],
    'ServiceMessages.java:125': [126, 'kind="call"'],
    'ServiceMessages.java:186': [191, '}'],
    'contract.ts:248': [249, 'export interface CallLogPage'],
    'preview.ts:3347': [3366, '}'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'callLogModel.ts' ? model
        : file === 'CallLogPanel.tsx' ? panel
          : file === 'SettingsPage.tsx' ? settings
            : file === 'preview.ts' ? preview
              : file === 'contract.ts' ? rows('./contract.ts')
                : file === 'desktopScope.ts' ? scope
                  : file === 'CallLogPolicyTest.java' ? jvm
                    : file === 'ServiceMessages.java' ? service
                      : rows(`${javaDir}${file}`);
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const files = [
    `${javaDir}CallLog.java`,
    `${jvmDir}CallLogPolicyTest.java`,
    './callLogModel.ts',
    './CallLogPanel.tsx',
    './rondaCL.test.ts',
  ];
  const written = new Map<string, number>();
  for (const path of files) for (const row of rows(path)) {
    for (const match of row.matchAll(/([A-Za-z][\w.]*\.(?:java|cs|tsx|ts)):(\d+)(?:-(\d+))?/g)) {
      const start = `${match[1]}:${match[2]}`;
      written.set(start, Math.max(written.get(start) ?? 0, Number(match[3] ?? 0)));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [at, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(at);
      const [file] = citation.split(':');
      expect(lineOf(file, at), `${citation} termina en ${at}`).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    for (const path of files) rows(path).forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${path.split('/').pop()}:${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
