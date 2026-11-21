import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * La ronda CW-C escribe los participantes que el mensaje de llamada de grupo ya traía. `TdApi.java:49783` declara
 * `otherParticipantIds`, y la rama del grupo (`ServiceMessages.java:126`) lo recibía y lo tiraba: la burbuja se
 * quedaba en «Llamada de voz finalizada · 2 min 5 s» mientras Telegram nombraba a media llamada. La corrección es de
 * Android y de una capa, porque la frase la fabrica `ServiceMessages.text` y el resto —la burbuja por
 * `NativeSnapshot.java:483` y la fila del registro por `CallLog.row`— la pinta tal cual; ninguna pantalla tiene nada
 * que inventar aquí.
 *
 * **Las tres reglas son deliberadas y las tres se miden.** Deduplicar: `TdSession.java:1309` resuelve al revés de
 * como se desearía —mientras el perfil no está en memoria el nombre es el relleno, y dos rellenos iguales en la misma
 * línea se leen como dos personas que son una—. Cortar en tres: es el corte que ya hace `names` en las familias que
 * tienen lista completa. Y no poner cifra de «más»: el campo se documenta como «some other call participants», así que
 * lo que llega no es el censo de la llamada y un número se leería como total; lo que sobra se corta con puntos
 * suspensivos.
 *
 * **Lo que quedó abierto, y ya está cerrado.** Windows no cerró esta paridad en la CW-C: `DesktopServiceCalls.Invitation`
 * daba cifra, y para nombrar hacía falta bajar un resolvedor de nombres y el actor hasta un `ServiceText` que entonces
 * era estático y no tenía caché de usuarios que consultar. La ronda CW-D hizo ese viaje y su paridad la mide
 * `rondaCWD.test.ts`. El sufijo «Otros participantes» sigue sin espejo en el escritorio, y no por falta de viaje:
 * `MessageActionGroupCall` no trae participantes. El otro hueco es el de siempre: entrar en el chat de voz exige el
 * `payload` que solo fabrica tgcalls.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);
const cuerpo = (lines: string[]) => lines.join('\n');

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const service = rows(`${javaDir}ServiceMessages.java`);
const puente = rows(`${javaDir}NativeBridge.java`);
const sesion = rows(`${javaDir}TdSession.java`);
const instantanea = rows(`${javaDir}NativeSnapshot.java`);
const tdlib = rows('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const jvm = rows('../../mobile/android/app/src/test/java/cc/webrom/wrgram/GroupCallParticipantsTest.java');
const llamadas = rows('../../desktop/src/WRGram.Desktop/DesktopServiceCalls.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const modelo = text('./callLogModel.ts');

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
/** El trozo de cuerpo que empieza en la aguja, medido en líneas desde ella. */
function bloque(needle: string, body: string[], where: string, lineas: number): string {
  const start = en(needle, body, where);
  return cuerpo(body.slice(start - 1, start - 1 + lineas));
}
const count = (needle: string, donde: string | string[]) =>
  (Array.isArray(donde) ? cuerpo(donde) : donde).split(needle).length - 1;

const ramaGrupo = bloque('else if(c instanceof TdApi.MessageGroupCall){', service, 'ServiceMessages.java', 1);
const ramaInvita = bloque('else if(c instanceof TdApi.MessageInviteVideoChatParticipants){', service, 'ServiceMessages.java', 1);
const dedupe = bloque('static String[] senderNames(TdSession session,TdApi.MessageSender[] values){', service, 'ServiceMessages.java', 5);
const lista = bloque('static String participantList(String[] names){', service, 'ServiceMessages.java', 8);
const sufijo = 'text+=" · Otros participantes: "+otros';

describe('ronda CW-C · el mensaje ya traía los nombres', () => {
  it('el esquema declara la lista parcial y la rama la lee', () => {
    expect(tdlib[49783 - 1]).toContain('public MessageSender[] otherParticipantIds;');
    expect(ramaGrupo).toContain('senderNames(session,a.otherParticipantIds)');
    expect(ramaGrupo).toContain('participantList(');
    // Y la lista se pide una sola vez: la frase se arma con el texto ya recortado.
    expect(count('participantList(senderNames(session,a.otherParticipantIds))', service)).toBe(1);
  });

  it('la invitación trae lista completa y por eso usa el helper que cuenta', () => {
    expect(bloque('public static class MessageInviteVideoChatParticipants extends MessageContent {', tdlib, 'TdApi.java', 10))
      .toContain('public long[] userIds;');
    expect(ramaInvita).toContain('names(session,a.userIds)');
    // Sin invitados no hay preposición suelta: «…invitó a  a la videollamada» era el defecto que había que evitar.
    expect(ramaInvita).toContain('a.userIds==null||a.userIds.length==0?"":names(session,a.userIds)');
  });
});

describe('ronda CW-C · las tres reglas de la lista', () => {
  it('deduplica, y esa es la razón de ser del helper', () => {
    expect(dedupe).toContain('nombres.contains(nombre)');
    expect(dedupe).toContain('return new String[0]');
    // Con sesión nula todo cae en el relleno; sin deduplicar la burbuja diría dos veces el mismo nombre.
    expect(bloque('String senderName(TdApi.MessageSender sender)', sesion, 'TdSession.java', 4))
      .toContain('if (user == null) requestUser(id);');
  });

  it('corta en tres y no afirma cuántos faltan', () => {
    expect(lista).toContain('Math.min(3,names.length)');
    expect(lista).toContain('names.length>shown?joined+"…"');
    expect(lista).not.toContain('" más"');
    expect(count('" · Otros participantes: "', service)).toBe(1);
    expect(ramaGrupo).toContain(sufijo);
    // El sufijo va condicionado: lista vacía, frase tal como estaba.
    expect(ramaGrupo).toContain('if(!otros.isEmpty())' + sufijo);
  });

  it('el corte de tres es el mismo que el de las familias con lista completa', () => {
    expect(bloque('private static String names(TdSession session,long[] ids){', service, 'ServiceMessages.java', 4))
      .toContain('if(values.size()<3)values.add(nameOf(session,id));');
  });
});

describe('ronda CW-C · la frase la escribe Java, no la pantalla', () => {
  it('ninguna capa de interfaz se inventa el sufijo', () => {
    for (const [donde, cuerpo] of [['App.tsx', app], ['preview.ts', preview], ['callLogModel.ts', modelo], ['DesktopServiceCalls.cs', llamadas]] as [string, string][]) {
      expect(count('Otros participantes', cuerpo), donde).toBe(0);
    }
  });

  it('las dos salidas de la frase son la misma cadena', () => {
    expect(cuerpo(instantanea)).toContain('String service=ServiceMessages.text(message,session);if(service!=null)return service;');
    expect(cuerpo(puente)).toContain('rows.put(CallLog.row(message,title,ServiceMessages.text(message,session)));shown++;');
  });
});

describe('ronda CW-C · la prueba JVM ejecuta las funciones puras', () => {
  it('nueve pruebas, y las tres reglas están escritas allí', () => {
    expect(count('@Test public void', jvm)).toBe(9);
    expect(cuerpo(jvm)).toContain('assertEquals("Ana, Bruno y Carla…", ServiceMessages.participantList(new String[] {"Ana", "Bruno", "Carla", "Dani"}));');
    expect(cuerpo(jvm)).toContain('assertEquals("Alguien", una[0]);');
    expect(cuerpo(jvm)).toContain('assertEquals("Llamada de voz finalizada · 2 min 5 s", ServiceMessages.text(group(false, false, false, 125, null), null));');
    // El javadoc de la prueba cita el campo: si el número se mueve, esta línea lo ve.
    expect(cuerpo(jvm)).toContain('TdApi.java:49783');
  });
});

describe('ronda CW-C · la paridad con Windows está cerrada', () => {
  it('el escritorio nombra donde la CW-C dejó de dar cifra', () => {
    // La CW-C midió la divergencia —cifra aquí, nombres allí— y la ronda CW-D la cerró: la firma ya recibe actor,
    // resolvedor, identificador propio y bandera de propio, y la cifra suelta desapareció de la clase.
    expect(bloque('public static string Invitation(MessageActionInviteToGroupCall call', llamadas, 'DesktopServiceCalls.cs', 8))
      .toContain('Func<long, string> nameOf, long selfId, bool outgoing');
    expect(count('count == 1 ? "" : "s"', llamadas)).toBe(0);
    expect(count('persona', llamadas)).toBe(0);
    expect(ramaInvita).not.toContain('(count==1?"":"s")');
    // Lo que sigue sin espejo es el sufijo del grupo: `MessageActionGroupCall` no trae participantes, así que el
    // brazo del escritorio tampoco puede leer a nadie.
    expect(bloque('public static string GroupCall(MessageActionGroupCall call) =>', llamadas, 'DesktopServiceCalls.cs', 2))
      .not.toContain('users');
    expect(count('Otros participantes', llamadas)).toBe(0);
  });
});

describe('ronda CW-C · las citas se miden', () => {
  /** Cada número citado en este archivo, con la frase que afirma. */
  const anchors: Record<string, string> = {
    'TdApi.java:49783': 'public MessageSender[] otherParticipantIds;',
    'ServiceMessages.java:126': 'String otros=participantList(senderNames(session,a.otherParticipantIds));',
    'ServiceMessages.java:130': 'String invitados=a.userIds==null||a.userIds.length==0?"":names(session,a.userIds);',
    'ServiceMessages.java:160': 'static String[] senderNames(TdSession session,TdApi.MessageSender[] values){',
    'ServiceMessages.java:170': 'static String participantList(String[] names){',
    'NativeSnapshot.java:483': 'String service=ServiceMessages.text(message,session);if(service!=null)return service;',
    'TdSession.java:1309': 'if (user == null) requestUser(id);',
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'ServiceMessages.java' ? service
        : file === 'NativeSnapshot.java' ? instantanea
          : file === 'TdSession.java' ? sesion
            : (() => { throw new Error(`nada que leer de ${file}`); })();
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const row of rows('./rondaCWC.test.ts')) {
    for (const match of row.matchAll(/([A-Za-z][\w.]*\.(?:java|cs|tsx|ts)):(\d+)(?:-(\d+))?/g)) {
      const key = `${match[1]}:${match[2]}`;
      written.set(key, Math.max(written.get(key) ?? 0, Number(match[3] ?? 0)));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
    for (const [, end] of written) expect(end).toBe(0);
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    rows('./rondaCWC.test.ts').forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
