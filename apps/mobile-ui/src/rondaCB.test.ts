import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import type { State } from './contract';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { DESKTOP_NAMED_IN_SCAFFOLD, desktopGapRefusal, desktopGenericRefusal } from './desktopGap';
import { LIVE_DURATIONS, LIVE_REFUSALS } from './liveLocation';

/**
 * Ronda CB — la ubicación en directo, medida en las cuatro capas.
 *
 * El hueco no era uno solo: Android tenía los tres pedidos de TDLib porque el teléfono tiene sensor, Windows tiene
 * con qué detener porque el `messages.editMessage` con el bit `stopped` sí existe en la librería, y la pantalla no
 * tenía ni menú de duraciones ni botón. La ronda repartió la familia así: `location.live.start` se niega por su
 * nombre en Windows, `location.live.stop` funciona en las dos capas, y la renovación la hace el rastreador del
 * teléfono —no es una orden del cable, y por eso no existe `location.live.update` en ninguna parte.
 *
 * Este archivo mide seis cosas, todas sobre el texto de las capas y sin copiar una cifra de la hoja de ronda:
 *
 * 1. Qué claves de la familia tienen brazo en cada orilla, que lo pendiente es exactamente lo que el aviso declara,
 *    y que el andamio se niega con la frase con nombre y no con la puerta genérica de BK.
 * 2. Que las cuatro duraciones del menú son las cuatro del puente, y que cada rótulo es el que produce su función
 *    `label` con sus propias palabras —no los que recuerda la pantalla.
 * 3. Que las cinco negativas son las mismas carácter a carácter en Java, C# y TypeScript, cada una leída de la
 *    línea que la escribió por primera vez.
 * 4. Que la regla de la tarjeta —propia y con cuenta atrás— es una sola regla en las tres capas, y que el botón se
 *    gatingea por la bandera y no por la plataforma.
 * 5. Que el orden de comprobaciones de los dos brazos es el del puente: la compartida ya abierta antes que la cota
 *    de duración, y «no es una ubicación propia» antes que «ya caducó».
 * 6. Que medido con las manos —`designRequest` sobre `transport`— empieza, mueve la bandera y detiene deja el
 *    estado que dice dejar.
 *
 * La última prueba es el cortafuegos de las citas: todo `Archivo:NNN` escrito en los archivos de la ronda tiene que
 * existir en la tabla y señalar hoy la línea que la frase afirma, y toda cifra suelta entre contras tiene que caer
 * en una línea medida del archivo al que pertenece, igual que hacen BM, BZ y BY.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const flowLines = rows(`${host}DesktopLiveLocationFlow.cs`);
const flow = flowLines.join('\n');
const rules = text(`${host}DesktopLiveLocation.cs`);
const point = text(`${host}DesktopLocation.cs`);
const service = rows(`${host}TelegramService.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const live = rows(`${javaDir}LiveLocationPolicy.java`);
const extras = rows(`${javaDir}MessageExtras.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const tdlib = rows('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const app = text('./App.tsx');
const card = text('./MessageExtraCard.tsx');
const contract = rows('./contract.ts');
const scope = rows('./desktopScope.ts');
const bridge = text('./bridge.ts');
const preview = rows('./preview.ts');

/** La familia entera, leída de la lista que filtra el puente de Android: dos claves y no tres. */
const FAMILY = ['location.live.start', 'location.live.stop'];

/** El despacho de Windows, con el mismo recorte que usan BJ, BK, BO, BZ, BY y BM. */
function dispatch() {
  const start = service.findIndex(row => row.includes('object? result = method switch'));
  const end = service.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  if (start < 0 || end < 0) throw new Error('No se encuentra el despacho de Windows');
  const answered = new Map<string, number>();
  const refused = new Map<string, number>();
  service.slice(start, end + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
    if (!keys.length) return;
    const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
    for (const key of keys) (negative ? refused : answered).set(key, start + offset + 1);
  });
  return { answered, refused };
}
const cable = dispatch();

/** Todas las líneas de un cuerpo que dicen algo; la primera, en número de línea (1-based). */
function at(needle: string, body: string[] = java) {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea dice ${needle}`);
  return index + 1;
}
function where(needle: string, body: string[] = java) {
  const hits = body.map((row, index) => (row.includes(needle) ? index + 1 : 0)).filter(Boolean);
  if (!hits.length) throw new Error(`Ninguna línea dice ${needle}`);
  return hits;
}
const jrow = (n: number) => java[n - 1] ?? '';

/** El literal de texto que Java o C# asignan a una constante. */
function literal(name: string, from: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}
const javaConstant = (name: string) => literal(name, live.join('\n'));

/** Los fuentes C# del proyecto de Windows, para negar una API en todo el host y no en una sola hoja. */
const desktopCs = readdirSync(new URL(host, import.meta.url)).filter(name => name.endsWith('.cs'));
/** Los archivos cuyo código —líneas que no son solo prosa— dicen algo. */
const enCódigoDe = (needle: RegExp) => desktopCs.filter(name =>
  rows(`${host}${name}`).some(row => !/^\s*(?:\/\/|\/\*|\*)/.test(row) && needle.test(row)));

/** Una línea Java sin literales de texto ni comentario de final de línea, para poder contar llaves. */
function bare(row: string) {
  let out = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i], next = row[i + 1];
    if (ch === '/' && next === '/') break;
    if (ch === '\\') { i++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < row.length) {
        if (row[i] === '\\') { i++; continue; }
        if (row[i] === quote) break;
        i++;
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/** El cuerpo completo de un método Java: de su firma a la línea donde se cierra el bloque. */
function cuerpo(needle: string, source: string[]) {
  const start = source.findIndex(row => row.includes(needle));
  if (start < 0) throw new Error(`No está el método ${needle}`);
  let depth = 0, opened = false;
  for (let n = start; n < source.length; n++) {
    for (const ch of bare(source[n])) {
      if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--;
    }
    if (opened && depth === 0) return { start: start + 1, end: n + 1, text: source.slice(start, n + 1).join('\n') };
  }
  throw new Error(`${needle} no cierra`);
}

describe('ronda CB · el cable de la ubicación en directo', () => {
  it('Android tiene los dos brazos, van juntos y llama cada uno al suyo', () => {
    const start = at('case "location.live.start"');
    expect(jrow(start)).toContain('case "location.live.start":startLiveLocation(p,a);break;');
    expect(jrow(start + 1)).toContain('case "location.live.stop":stopLiveLocation(p,a);break;');
    expect(at('case "location.live.stop"')).toBe(start + 1);
  });

  it('la familia del puente son dos claves y no tres: renovar no es una orden del cable', () => {
    const declared = [...new Set([...policy.matchAll(/"(location\.live\.[a-z]+)"/g)].map(m => m[1]))];
    expect(declared.sort()).toEqual(FAMILY);
    expect(policy).not.toContain('location.live.update');
    expect(java.join('\n')).not.toContain('"location.live.update"');
    // La renovación existe, pero es el rastreador local del teléfono escribiendo el mensaje, no una clave del cable.
    expect(cuerpo('private void startLiveTracking', java).text).toContain('liveMessage=message.id');
    expect(jrow(at('private void pushLiveLocation'))).toContain('pushLiveLocation(android.location.Location fix)');
    expect(jrow(at('session.perform(new TdApi.EditMessageLiveLocation'))).toContain('null,live)');
  });

  it('Windows niega empezar por su causa y atiende detener con un brazo propio', () => {
    const refusedAt = cable.refused.get('location.live.start');
    expect(refusedAt, 'empezar a compartir ya no se niega por su nombre').toBeTypeOf('number');
    expect(service[refusedAt! - 1]).toContain('=> throw new BridgeException(DesktopLiveLocation.NoSensor),');
    const answeredAt = cable.answered.get('location.live.stop');
    expect(answeredAt, 'detener sigue sin brazo').toBeTypeOf('number');
    expect(service[answeredAt! - 1]).toContain('=> await StopLiveLocationAsync(args),');
    expect(flow).toContain('private async Task<object?> StopLiveLocationAsync(JsonElement args)');
    // Las dos van pegadas: la negativa con nombre y la orden viva son la misma familia.
    expect(answeredAt).toBe(refusedAt! + 1);
    expect(cable.answered.has('location.live.update')).toBe(false);
  });

  it('lo que el aviso declara pendiente es exactamente lo que el host no atiende', () => {
    const pending = [...new Set(DESKTOP_PENDING.flatMap(claim => claim.methods))];
    expect(pending).toContain('location.live.start');
    expect(pending).not.toContain('location.live.stop');
    expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes('location.live.stop'))).toBe(true);
    expect(desktopGapRefusal('location.live.start')).toBeUndefined();
    expect(desktopGapRefusal('location.live.stop')).toBeUndefined();
    expect(DESKTOP_NAMED_IN_SCAFFOLD).toContain('location.live.start');
    // La puerta genérica existe y sigue diciendo lo suyo: aquí no pasa por ella porque el andamio ya la negó por
    // nombre, no porque la clave haya dejado de estar pendiente.
    expect(desktopGenericRefusal('location.live.start')).toBe('No disponible en escritorio (beta): location.live.start');
  });

  it('empezar se confirma en un diálogo de Android, así que no muere a los 35 segundos', () => {
    const desde = bridge.indexOf('const USER_DRIVEN = new Set([');
    const driven = bridge.slice(desde, bridge.indexOf(']);', desde));
    expect(driven).toContain("'location.live.start'");
    expect(driven).not.toContain("'location.live.stop'");
  });

  it('la pantalla no ofrece en Windows lo que el host niega', () => {
    expect(app).toContain('{!desktop&&<MenuItem icon={<Radio/>} label="Ubicación en directo"');
    expect(app).toContain('LIVE_DURATIONS.map(item=><button className="menu-item" key={item.period} onClick={()=>startLiveLocation(item.period)}>');
    expect(app).toContain("void run<LiveStart>('location.live.start',{period,reply:replyId||'0',silent})");
    expect(card).toContain("await run?.('location.live.stop',{id:message.id})");
  });
});

describe('ronda CB · las duraciones del menú son las del puente', () => {
  const DURATIONS = live.find(row => row.includes('int[] DURATIONS')) ?? '';
  const MIN_PERIOD = Number(/MIN_PERIOD = (\d+)/.exec(live.join('\n'))?.[1]);
  const MAX_PERIOD = Number(/MAX_PERIOD = (\d+)/.exec(live.join('\n'))?.[1]);
  const PERMANENT = 2 ** 31 - 1;
  const etiqueta = cuerpo('public static String label(int period)', live);
  const cuenta = cuerpo('public static long expiresAt(long sentAt, int period)', live);

  it('las cuatro cifras del menú son literalmente las de LiveLocationPolicy.DURATIONS', () => {
    expect([...DURATIONS.matchAll(/\d+/g)].map(m => Number(m[0]))).toEqual(LIVE_DURATIONS.map(item => item.period));
    expect(MIN_PERIOD).toBe(60);
    expect(MAX_PERIOD).toBe(86400);
  });

  it('todas están dentro de la cota de la librería y ninguna es el «sin límite»', () => {
    for (const item of LIVE_DURATIONS) {
      expect(item.period).toBeGreaterThanOrEqual(MIN_PERIOD);
      expect(item.period).toBeLessThanOrEqual(MAX_PERIOD);
      expect(item.period).not.toBe(PERMANENT);
    }
    // La regla que acepta las cifras es la del puente, medida en sus dos ramas.
    expect(live.join('\n')).toContain('period == PERMANENT || (period >= MIN_PERIOD && period <= MAX_PERIOD)');
    expect(live.join('\n')).toContain('if (!validPeriod(period)) throw new IllegalArgumentException(BAD_PERIOD)');
    expect(live.join('\n')).toContain('PERMANENT = Integer.MAX_VALUE');
  });

  it('cada rótulo es el que produce la función label con sus propias palabras', () => {
    // Las palabras salen del cuerpo de `label` medido por llaves: los dos ternarios —uno por minutos, otro por
    // horas—, la cadena del retorno final y el umbral de la rama. Nada de eso se transcribe de memoria.
    const pares = [...etiqueta.text.matchAll(/\? "([^"]+)" : "([^"]+)"/g)].map(m => [m[1], m[2]]);
    expect(pares).toHaveLength(2);
    const [minuto, hora] = pares;
    const umbrales = [...etiqueta.text.matchAll(/period < (\w+)/g)].map(m => m[1]);
    expect(umbrales).toEqual(['3600', 'MAX_PERIOD']);
    const fijo = /3600f\) \+ "([^"]+)"/.exec(etiqueta.text)?.[1];
    expect(fijo).toBe(' horas');
    const esperado = (period: number) => {
      if (period < 3600) {
        const n = Math.round(period / 60);
        return `${n} ${n === 1 ? minuto[0] : minuto[1]}`;
      }
      const n = Math.round(period / 3600);
      return period < MAX_PERIOD ? `${n} ${n === 1 ? hora[0] : hora[1]}` : `${n}${fijo}`;
    };
    expect(LIVE_DURATIONS.map(item => item.label)).toEqual(LIVE_DURATIONS.map(item => esperado(item.period)));
    // Y el «sin límite» que la librería entiende no está en el menú, así que nadie lo va a pedir por error.
    expect(etiqueta.text).toContain('"sin límite"');
    expect(etiqueta.end).toBe(at('return Math.round(period / 3600f) + " horas";', live) + 1);
  });

  it('el puente y el andamio cortan la cuenta atrás con la misma regla', () => {
    expect(cuenta.text).toContain('period == PERMANENT || period <= 0');
    expect(cuenta.text).toContain('return sentAt + period;');
    // La respuesta del puente lleva las tres claves que lee la pantalla.
    const ok = jrow(where('answer.ok(object("id",Long.toString(message.id)', java)[0]);
    expect(ok).toContain('"chatId"');
    expect(ok).toContain('LiveLocationPolicy.expiresAt(message.date,period)');
  });
});

describe('ronda CB · las cinco negativas, carácter a carácter', () => {
  it('la compartida que ya está abierta la niega la misma frase en Java y en la pantalla', () => {
    expect(javaConstant('ALREADY')).toBe(LIVE_REFUSALS.already);
    expect(jrow(at('a.fail(LiveLocationPolicy.ALREADY)'))).toContain('if(liveMessage!=0)');
    // El andamio la pronuncia antes que la cota de duración, que es el orden del puente.
    expect(at('if (liveShareOf(state)) throw new Error(LIVE_REFUSALS.already)', preview))
      .toBeLessThan(at('throw new Error(LIVE_REFUSALS.badPeriod)', preview));
  });

  it('«no estás compartiendo» es una sola frase para las cuatro situaciones que no lo son', () => {
    expect(javaConstant('NOT_SHARING')).toBe(LIVE_REFUSALS.notSharing);
    expect(literal('NotSharing', rules)).toBe(LIVE_REFUSALS.notSharing);
    expect(jrow(at('a.fail(LiveLocationPolicy.NOT_SHARING)'))).toContain(
      'message==null||!(message.content instanceof TdApi.MessageLiveLocation)||!message.isOutgoing||message.chatId!=session.activeChat');
    // Windows junta las mismas en una sola condición: fila que no está, contenido que no es vivo, mensaje recibido.
    expect(flow).toContain('if (row?.media is not MessageMediaGeoLive live || !DesktopLiveLocation.IsOutgoing(row))');
    expect(flowLines.filter(row => row.includes('throw new BridgeException(DesktopLiveLocation.NotSharing)'))).toHaveLength(1);
  });

  it('la cota de duración la dice el puente y la repite la pantalla', () => {
    expect(javaConstant('BAD_PERIOD')).toBe(LIVE_REFUSALS.badPeriod);
    expect(cuerpo('public static int period(JSONObject params)', live).text).toContain(BAD_PERIOD_REFUSO());
    function BAD_PERIOD_REFUSO() { return 'if (!validPeriod(period)) throw new IllegalArgumentException(BAD_PERIOD)'; }
  });

  it('la ubicación caducada usa la misma cadena en las dos negativas de Android y en las dos de Windows', () => {
    // La frase está escrita dos veces en Java, y en una de ellas la pronuncia `answer.fail` en vez de `a.fail`, así
    // que se busca el texto y no la llamada.
    const dicho = where('"La ubicación ya no está disponible."');
    expect(dicho).toHaveLength(2);
    const frase = (n: number) => /(?:a|answer)\.fail\("([^"]*)"\)/.exec(jrow(n))![1];
    expect(frase(dicho[0])).toBe(LIVE_REFUSALS.gone);
    expect(frase(dicho[1])).toBe(LIVE_REFUSALS.gone);
    expect(literal('Gone', point)).toBe(LIVE_REFUSALS.gone);
    // Las dos negativas de Windows comparten la constante, que es lo que evita que se separen.
    expect(flowLines.filter(row => row.includes('throw new BridgeException(DesktopLocation.Gone)'))).toHaveLength(2);
    // Y en Android la caducada se niega después de la propiedad, no antes.
    expect(dicho[1]).toBeGreaterThan(at('a.fail(LiveLocationPolicy.NOT_SHARING)'));
  });

  it('la negativa de Windows no habla de una beta que no es la causa', () => {
    expect(literal('NoSensor', rules)).toBe(LIVE_REFUSALS.noSensor);
    expect(LIVE_REFUSALS.noSensor).not.toContain('beta');
    expect(LIVE_REFUSALS.noSensor).not.toContain('No disponible en escritorio');
    // El andamio la pronuncia en la misma rama de la clave, antes de mirar el estado.
    const rama = at("if (method === 'location.live.start') {", preview);
    expect(preview[rama]).toContain("if (state.platform === 'desktop') throw new Error(LIVE_REFUSALS.noSensor);");
  });
});

describe('ronda CB · la regla de la tarjeta en las tres capas', () => {
  it('«puedo dejar de compartir» es propia y con cuenta atrás, en Java y en C#', () => {
    expect(extras[at('.put("canStop", message.isOutgoing && live.expiresIn > 0)', extras) - 1]).toContain(
      'message.isOutgoing && live.expiresIn > 0');
    expect(rules).toContain('public static bool CanStop(bool outgoing, int period) => outgoing && period > 0;');
    // La misma bandera con la que el puente decide si la fila es propia es la que arma el DTO de Windows.
    expect(rules).toContain('(message.flags & TL.Message.Flags.out_) != 0');
    expect(service.join('\n')).toContain('Outgoing = (message.flags & TL.Message.Flags.out_) != 0,');
  });

  it('el periodo solo lo tiene la ubicación viva', () => {
    expect(rules).toContain('media is MessageMediaGeoLive live ? live.period : 0');
    // El orden de la `is` importa porque la clase viva deriva de la fija: al revés, una ubicación normal daría
    // periodo. Lo que se mide aquí es que el tipo fijo no se prueba en ninguna parte —no hay brazo que invertir— y
    // que el peligro está escrito junto a la función, para que nadie lo añada sin saberlo.
    expect(rules.match(/is MessageMediaGeoLive/g)).toHaveLength(1);
    expect(rules).not.toMatch(/(is|case|as) MessageMediaGeo[\s);]/);
    expect(rules).toContain('deriva de <c>MessageMediaGeo</c>');
  });

  it('detener escribe el adjunto con el bit stopped y sin los tres que anuncian renovación', () => {
    expect(rules).toContain('(InputMediaGeoLive)live.ToInputMedia()');
    expect(rules).toContain('media.flags |= InputMediaGeoLive.Flags.stopped;');
    expect(rules.replace(/\s+/g, ' ')).toContain(
      'media.flags &= ~(InputMediaGeoLive.Flags.has_period | InputMediaGeoLive.Flags.has_heading | InputMediaGeoLive.Flags.has_proximity_notification_radius);');
    for (const campo of ['period', 'heading', 'proximity_notification_radius'])
      expect(rules).toContain(`media.${campo} = 0;`);
    // Partir de `ToInputMedia` es la única forma de conservar el último punto conocido, que es obligatorio.
    expect(rules).toContain('geo_point');
  });

  it('la pantalla gatingea el botón por la bandera y el estado por la cuenta atrás', () => {
    expect(card).toContain('{location.canStop&&run&&<button type="button" className="text-button" disabled={stopping}');
    expect(card).toContain("onClick={()=>void stop()}>{stopping?'Dejando de compartir…':'Dejar de compartir'}</button>}");
    expect(card).toContain("{location.live&&<small role=\"status\">{live?'Ubicación en vivo activa':'La ubicación dejó de actualizarse'}</small>}");
    const rama = contract.find(row => row.includes("kind:'location'") && row.includes('canStop'));
    expect(rama).toBeDefined();
    expect(rama).toContain('live?:boolean');
    expect(rama).toContain('expiresAt?:number');
    expect(rama).toContain('canStop?:boolean');
  });
});

describe('ronda CB · el orden de los brazos', () => {
  it('Android: la fila, la propiedad, el tiempo, el rastreador y la escritura, en ese orden', () => {
    // Todo se mide dentro del cuerpo de `stopLiveLocation`: `session.message(id)` y la negativa de propiedad están
    // escritas igual en otros brazos del puente, y buscarlas desde la línea uno daría el orden de otro método.
    const stop = cuerpo('private void stopLiveLocation', java);
    const enStop = (needle: string) => {
      const index = stop.text.split('\n').findIndex(row => row.includes(needle));
      expect(index, `no está en stopLiveLocation: ${needle}`).toBeGreaterThan(-1);
      return stop.start + index;
    };
    const firma = stop.start;
    const leer = enStop('TdApi.Message message=session.message(id)');
    const negada = enStop('a.fail(LiveLocationPolicy.NOT_SHARING)');
    const caducada = enStop('expiresIn<=0');
    const rastreador = enStop('if(liveMessage==id)stopLiveTracking();');
    const escribe = enStop('new TdApi.EditMessageLiveLocation(message.chatId,id,null,null)');
    expect(jrow(firma + 1)).toContain('requireAccount();');
    expect(firma).toBeLessThan(leer);
    expect(leer).toBeLessThan(negada);
    expect(negada).toBeLessThan(caducada);
    expect(caducada).toBeLessThan(rastreador);
    expect(rastreador).toBeLessThan(escribe);
    expect(stop.end - stop.start).toBe(8);
  });

  it('Windows: releer, negar lo que no es propio, negar lo que caducó y editar', () => {
    const relee = at('await client.GetMessages(entry.Input, new InputMessageID { id = (int)id })', flowLines);
    const noPropia = at('throw new BridgeException(DesktopLiveLocation.NotSharing)', flowLines);
    const sinTiempo = at('if (DesktopLiveLocation.Period(row.media) <= 0)', flowLines);
    const sinPunto = at('if (!DesktopLocation.Valid(live.geo))', flowLines);
    const escribe = at('await client.Messages_EditMessage(entry.Input, (int)id, media: DesktopLiveLocation.Stopped(live))', flowLines);
    expect(relee).toBeLessThan(noPropia);
    expect(noPropia).toBeLessThan(sinTiempo);
    expect(sinTiempo).toBeLessThan(sinPunto);
    expect(sinPunto).toBeLessThan(escribe);
    // La única comprobación que Android no hace es la del punto, y aquí es obligatoria: sin coordenada no hay
    // adjunto que reconstruir.
    expect(jrow(at('expiresIn<=0'))).not.toContain('geo');
  });

  it('el brazo de Windows no finge el rastreador que apaga el de Android', () => {
    // En el teléfono hay algo que renovar; aquí no, así que detener es una sola petición y nada de estado local.
    expect(flow).not.toContain('stopLiveTracking');
    expect(flow).not.toContain('StopLiveTracking');
    expect(flow.match(/Messages_EditMessage/g)).toHaveLength(1);
    // La tarjeta se arma con la fila que estaba en memoria, pero detener se hace sobre la que se releé.
    expect(at('var row = page.Messages?.OfType<TL.Message>()', flowLines)).toBeGreaterThan(at('var page = await client.GetMessages', flowLines));
  });

  it('empezar en Android: la compartida abierta antes que la solicitud en curso y antes que el periodo', () => {
    // Las dos frases existen también en `requestLocationForBot`, que es de otra orden y está 3.400 líneas antes, así
    // que el orden se mide dentro del cuerpo de `startLiveLocation`.
    const start = cuerpo('private void startLiveLocation', java);
    const enStart = (needle: string) => {
      const index = start.text.split('\n').findIndex(row => row.includes(needle));
      expect(index, `no está en startLiveLocation: ${needle}`).toBeGreaterThan(-1);
      return start.start + index;
    };
    const abierta = enStart('a.fail(LiveLocationPolicy.ALREADY)');
    const enCurso = enStart('Ya hay una solicitud de ubicación en curso.');
    const periodo = enStart('int period=LiveLocationPolicy.period(p)');
    expect(abierta).toBeLessThan(enCurso);
    expect(enCurso).toBeLessThan(periodo);
    // Después del permiso hay un diálogo de confirmación con la ubicación reciente y su duración escrita en claro, y
    // ese diálogo lo monta `livePermissionResult`, no el brazo: es la misma clave que sale por otra puerta.
    const confirmar = at('"Confirmar ubicación en directo"');
    expect(at('void livePermissionResult(boolean granted)', java)).toBeLessThan(confirmar);
    expect(at('private void startLiveTracking', java)).toBeGreaterThan(confirmar);
    expect(jrow(confirmar)).toContain('LiveLocationPolicy.label(period)');
    expect(jrow(confirmar)).toContain('setPositiveButton("Compartir en directo"');
    expect(jrow(confirmar)).toContain('WRGram la renueva mientras la app esté abierta.');
  });
});

describe('ronda CB · lo que limita la familia es la biblioteca, no el gusto', () => {
  it('TDLib admite el periodo, el rumbo y el radio que el puente copia', () => {
    expect(tdlib[35709 - 1]).toContain('between 60 and 86400');
    expect(tdlib[35709 - 1]).toContain('0x7FFFFFFF for permanent');
    expect(tdlib[46978 - 1]).toContain('1-360; 0 if unknown');
    expect(tdlib[46982 - 1]).toContain('in meters (0-100000)');
    expect(tdlib[49115 - 1]).toContain('updateMessageContent is not sent');
    // Las cotas del puente salen de esas líneas: la frase de la cota y el tope del rumbo.
    expect(javaConstant('BAD_PERIOD')).toContain('1 minuto y 24 horas');
    expect(live.join('\n')).toContain('MAX_HEADING = 360');
    expect(live.join('\n')).toContain('PUSH_MIN_METERS = 12f');
  });

  it('en Windows no hay con qué leer una posición: el TFM no proyecta el sensor y el WebView no lo pide', () => {
    expect(text(`${host}WRGram.Desktop.csproj`)).toContain('<TargetFramework>net8.0-windows</TargetFramework>');
    // La negativa se niega en todo el host, no en una hoja: ni el WinRT del sensor (`Windows.Devices.Geolocation`,
    // `Geolocator`) ni el permiso del WebView (`CoreWebView2PermissionKind`, `PermissionRequested`) aparecen en
    // código. Las únicas líneas que los nombran son las que explican por qué no están.
    expect(enCódigoDe(/Windows\.Devices\.Geolocation|Geolocator|Geoposition/)).toEqual([]);
    expect(enCódigoDe(/CoreWebView2PermissionKind|PermissionRequested/)).toEqual([]);
    expect(rules).toContain('que no proyecta <c>Windows.Devices.Geolocation</c>');
    expect(rules).toContain('CoreWebView2PermissionKind.Geolocation');
    // Y el `CoreWebView2.Environment` que sí usa el host no tiene nada que ver con permisos, para que nadie lea en
    // esa línea una puerta que no abre.
    const main = rows(`${host}MainWindow.xaml.cs`);
    expect(main.join('\n')).toContain('var environment = Web.CoreWebView2.Environment;');
    expect(main.filter(row => row.includes('CoreWebView2.Environment')).length).toBe(1);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type LiveRow = { id: string; chatId: string; outgoing: boolean; extra?: { live?: boolean; expiresAt?: number; canStop?: boolean } };

describe('ronda CB · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let base: State;

  const nowSeconds = () => Math.floor(Date.now() / 1000);
  const rowOf = (id: string) => (transport.snapshot().messages as unknown as LiveRow[]).find(item => item.id === id);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const pv = await import('./preview');
    transport = await import('./bridge');
    base = pv.fixture;
    transport.acceptState({ ...pv.fixture, platform: 'android' });
    call = pv.designRequest as DesignCall;
  });

  it('empezar escribe una fila propia, viva y con botón, y responde hasta cuándo caduca', async () => {
    for (const item of LIVE_DURATIONS) {
      transport.acceptState({ ...base, platform: 'android' });
      const started = await call('location.live.start', { period: item.period }) as { id: string; chatId: string; expiresAt: number };
      expect(started.chatId).toBe(base.active);
      expect(started.expiresAt - nowSeconds()).toBeGreaterThanOrEqual(item.period - 1);
      expect(started.expiresAt - nowSeconds()).toBeLessThanOrEqual(item.period);
      const row = rowOf(started.id)!;
      expect(row.outgoing).toBe(true);
      expect(row.extra?.live).toBe(true);
      expect(row.extra?.canStop).toBe(true);
    }
  });

  it('con una compartida abierta no se empieza otra, ni siquiera con una duración imposible', async () => {
    const started = await call('location.live.start', { period: 3600 }) as { id: string };
    await expect(call('location.live.start', { period: 3600 })).rejects.toThrow(LIVE_REFUSALS.already);
    await expect(call('location.live.start', { period: 120 })).rejects.toThrow(LIVE_REFUSALS.already);
    // Sin la compartida abierta, la misma duración imposible sí cae en la cota de la librería.
    expect(await call('location.live.stop', { id: started.id })).toBe(true);
    await expect(call('location.live.start', { period: 120 })).rejects.toThrow(LIVE_REFUSALS.badPeriod);
  });

  it('detener apaga la cuenta atrás y el botón, y deja la tarjeta donde estaba', async () => {
    const started = await call('location.live.start', { period: 900 }) as { id: string };
    expect(await call('location.live.stop', { id: started.id })).toBe(true);
    const row = rowOf(started.id)!;
    expect(row.extra?.live).toBe(true);
    expect(row.extra?.expiresAt).toBe(0);
    expect(row.extra?.canStop).toBe(false);
    // Y ya no hay compartida abierta, así que se puede empezar otra.
    const otra = await call('location.live.start', { period: 3600 }) as { id: string };
    expect(otra.id).not.toBe(started.id);
  });

  it('detener niega primero lo que no es una compartida propia y después lo que ya caducó', async () => {
    await call('chat.open', { id: '14' });
    // La fila viva del andamio es recibida: no es suya, así que la negativa es la de no compartir.
    expect(rowOf('212')?.outgoing).toBe(false);
    await expect(call('location.live.stop', { id: '212' })).rejects.toThrow(LIVE_REFUSALS.notSharing);
    await expect(call('location.live.stop', { id: '101' })).rejects.toThrow(LIVE_REFUSALS.notSharing);
    await expect(call('location.live.stop', { id: '999999' })).rejects.toThrow(LIVE_REFUSALS.notSharing);
    const started = await call('location.live.start', { period: 900 }) as { id: string };
    expect(await call('location.live.stop', { id: started.id })).toBe(true);
    await expect(call('location.live.stop', { id: started.id })).rejects.toThrow(LIVE_REFUSALS.gone);
  });

  it('bajo escritorio empezar se niega por el sensor y detener sigue funcionando', async () => {
    const started = await call('location.live.start', { period: 900 }) as { id: string };
    transport.acceptState({ ...transport.snapshot(), platform: 'desktop' });
    await expect(call('location.live.start', { period: 900 })).rejects.toThrow(LIVE_REFUSALS.noSensor);
    await expect(call('location.live.start', { period: 900 }))
      .rejects.not.toThrow(desktopGenericRefusal('location.live.start'));
    expect(await call('location.live.stop', { id: started.id })).toBe(true);
    expect(rowOf(started.id)?.extra?.canStop).toBe(false);
  });
});

describe('ronda CB · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la primera línea de cada cita. Medido hoy, línea por línea. */
  const anchors: Record<string, string> = {
    'LiveLocationPolicy.java:29': 'int[] DURATIONS = {900, 3600, 28800, 86400}',
    'LiveLocationPolicy.java:48': 'ALREADY =',
    'LiveLocationPolicy.java:50': 'NOT_SHARING =',
    'LiveLocationPolicy.java:52': 'BAD_PERIOD =',
    'LiveLocationPolicy.java:87': 'public static long expiresAt(long sentAt, int period)',
    'MessageExtras.java:42': 'live.expiresIn <= 0 || live.location == null',
    'MessageExtras.java:44': 'put("canStop", message.isOutgoing && live.expiresIn > 0)',
    'NativeBridge.java:421': 'answer.fail("La ubicación ya no está disponible.")',
    'NativeBridge.java:1200': 'livePermissionResult(granted)',
    'NativeBridge.java:4735': 'private void startLiveLocation(JSONObject p,Answer a)',
    'NativeBridge.java:4739': 'a.fail(LiveLocationPolicy.ALREADY)',
    'NativeBridge.java:4741': 'int period=LiveLocationPolicy.period(p)',
    'NativeBridge.java:4774': 'new TdApi.InputMessageLiveLocation(live)',
    'NativeBridge.java:4815': 'new TdApi.EditMessageLiveLocation(chat,message,null,live)',
    'NativeBridge.java:4825': 'private void stopLiveLocation(JSONObject p,Answer a)',
    'NativeBridge.java:4829': 'a.fail(LiveLocationPolicy.NOT_SHARING)',
    'NativeBridge.java:4830': 'a.fail("La ubicación ya no está disponible.")',
    'NativeBridge.java:4831': 'if(liveMessage==id)stopLiveTracking();',
    'NativeBridge.java:4832': 'new TdApi.EditMessageLiveLocation(message.chatId,id,null,null)',
    'MainWindow.xaml.cs:134': 'Web.CoreWebView2.Environment',
    'TelegramService.cs:3419': 'Outgoing = (message.flags & TL.Message.Flags.out_) != 0,',
    'TdApi.java:35709': 'between 60 and 86400',
    'TdApi.java:46978': '1-360; 0 if unknown',
    'WRGram.Desktop.csproj:5': '<TargetFramework>net8.0-windows</TargetFramework>',
    // Las dos que trajo la CH-B: su comentario del andamio vive entre las dos agujas de `preview.ts` que esta ronda
    // vigila, así que la cita es escrita y aquí tiene que estar anclada.
    'DesktopBackgroundsFlow.cs:70': 'if (raw.Length == 0 && top.Length == 0) throw new BridgeException(DesktopBackgrounds.Nothing);',
    'DesktopBackgroundsFlow.cs:88': '/// Los dos huecos del estado, escritos con la lista que se acaba de leer.',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'NativeBridge.java:4825': [4833, '}'],
    'LiveLocationPolicy.java:87': [90, '}'],
    'DesktopBackgroundsFlow.cs:70': [85, 'return after.Find(row => row.Id == raw) ?? throw new BridgeException(DesktopBackgrounds.Gone);'],
    'DesktopBackgroundsFlow.cs:88': [91, 'private void PublishCloudSlots(List<BackgroundRowDto> rows)'],
  };

  /** Las cifras sueltas entre contras: el archivo al que pertenecen, y lo que dice hoy su línea. */
  const sueltas: Record<string, string> = {
    // Las tres constantes (`:48`, `:50`, `:52`) ganaron su archivo delante en el barrido CITA-C, así que ya no son
    // sueltas: están medidas en la tabla de arriba como citas con nombre.
    'LiveLocationPolicy.java:100': 'public static String label(int period)',
    'LiveLocationPolicy.java:111': '}',
    'TdApi.java:35709': 'between 60 and 86400',
    'TdApi.java:46978': '1-360; 0 if unknown',
    'TdApi.java:46982': 'in meters (0-100000)',
    'TdApi.java:49115': 'updateMessageContent is not sent',
  };

  /** A quién pertenece una cifra suelta según el archivo que la escribe. */
  const dueños: Record<string, string> = {
    'liveLocation.ts': 'LiveLocationPolicy.java',
    'preview.ts CB': 'LiveLocationPolicy.java',
    'LiveLocationPolicy.java': 'TdApi.java',
  };

  const pvFrom = at("if (method === 'location.live.start')", preview) - 5;
  const pvTo = at('const adminRights', preview);
  const scStop = at("methods: ['location.live.stop']", scope);
  const scStart = at("methods: ['share.location', 'location.live.start']", scope);

  /** Las fuentes vigiladas: los dos archivos nuevos, la regla del puente y los tres trozos de la pantalla. */
  const watched: [string, string][] = [
    ['DesktopLiveLocation.cs', rules],
    ['DesktopLiveLocationFlow.cs', flow],
    ['LiveLocationPolicy.java', live.join('\n')],
    ['liveLocation.ts', text('./liveLocation.ts')],
    ['preview.ts CB', preview.slice(pvFrom, pvTo).join('\n')],
    ['desktopScope.ts CB', [...scope.slice(scStop - 3, scStop), ...scope.slice(scStart - 5, scStart)].join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' ? java
      : file === 'MessageExtras.java' ? extras
        : file === 'LiveLocationPolicy.java' ? live
          : file === 'TdApi.java' ? tdlib
            : file === 'WRGram.Desktop.csproj' || file === 'MainWindow.xaml.cs' || file === 'TelegramService.cs'
              || file === 'DesktopBackgroundsFlow.cs'
              ? rows(`${host}${file}`)
              : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  const loose = new Map<string, string>();
  for (const [donde, body] of watched) {
    for (const match of body.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj)):(\d+)(?:-(\d+))?/g)) {
      const key = `${match[1]}:${match[2]}`;
      written.set(key, Math.max(written.get(key) ?? 0, match[3] ? Number(match[3]) : 0));
    }
    for (const match of body.matchAll(/(?:`|<c>):(\d+)(?:-(\d+))?/g)) {
      const owner = dueños[donde];
      if (!owner) throw new Error(`${donde} escribe una cifra suelta sin dueño declarado`);
      for (const grupo of [match[1], match[2]]) if (grupo) loose.set(`${owner}:${grupo}`, donde);
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [n, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(n);
      const [file] = citation.split(':');
      expect(lineOf(file, n), `${citation} termina en ${n}`).toContain(needle);
    }
  });

  it('toda cifra suelta cae en la línea que dice lo que su párrafo afirma', () => {
    for (const [citation, donde] of loose) {
      const [file, n] = citation.split(':');
      const needle = sueltas[citation];
      expect(needle, `${donde} cita ${citation}, que no está medido`).toBeTypeOf('string');
      expect(lineOf(file, Number(n)), `${donde} cita ${citation}`).toContain(needle);
    }
    // Antes era un suelo (`>= 11`) y por eso se pudría sin avisar: cuando una cifra suelta gana su archivo delante —lo
    // que hizo la ronda CITA-C con `LiveLocationPolicy.java:87-90` del andamio— la tabla envejecía por arriba y el
    // suelo seguía contento. Ahora se compara el conjunto: ni una cifra suelta sin medir ni una medida sin cita.
    expect([...loose.keys()].sort()).toEqual(Object.keys(sueltas).sort());
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('el andamio ya no cita el puente de oído: las dos cifras que escribió la ronda están medidas', () => {
    // La ronda CB metió líneas en `NativeBridge.java`, así que cualquier cifra de antes de la tanda puede estar bien
    // o puede señalar otro sitio. Solo vale buscar el literal.
    expect(jrow(at('private void startLiveLocation'))).toBe(jrow(4735));
    expect(preview[at('Lo que `startLiveLocation`', preview) - 1]).toContain('NativeBridge.java:4735');
    expect(preview[at('El `EditMessageLiveLocation` sin punto', preview) - 1]).toContain('NativeBridge.java:4832');
    expect(preview.join('\n')).not.toContain('NativeBridge.java:4998');
    expect(preview.join('\n')).not.toContain('NativeBridge.java:4936-4944');
  });
});
