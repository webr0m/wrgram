import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * La ronda CW-D lleva a Windows los nombres que la CW-C escribió en Android. `DesktopServiceCalls.Invitation`
 * contaba invitados —«Se invitó a 3 personas a la llamada de grupo»— mientras `ServiceMessages.java:130` los nombraba,
 * y el motivo no era la frase sino el despacho: `ServiceText` era `static`, así que no tenía `_users` donde mirar ni
 * de quién era el mensaje. Ahora la frase sigue sin escribirse en el despacho, que es lo que fijó la CW-B, y lo que
 * cambia es lo que el despacho puede bajar hasta ella: el actor, el resolvedor de nombres, el identificador propio y
 * la bandera de propio.
 *
 * **Las cuatro formas de Android están en el mismo orden.** `ServiceMessages.java:130` resuelve en cadena —primero si
 * el mensaje es propio, luego si yo estoy entre invitados, luego si no hay lista, y al final la lista— y aquí se copió
 * ese orden en vez de inventar uno propio, porque encadenar al revés convierte «Invitaste a…» en «Ana te invitó» cuando
 * Ana soy yo. El corte de tres y la cuenta «y N más» son los de `ServiceMessages.java:149`, y el «y N más» aquí sí se
 * puede afirmar: `MessageActionInviteToGroupCall.users` es la lista entera de invitados, no el puñado parcial que trae
 * `otherParticipantIds` y que obligó a la CW-C a recortar con puntos suspensivos.
 *
 * **Lo que sigue dicho está.** Sin actor conocido la frase se dice en pasiva —«Se invitó a Bruno a la llamada de
 * grupo»—, que es lo que pasa en la fila de la lista de chats, donde `PreviewOf` no tiene entrada de chat con la que
 * resolver; Android ahí dice «Alguien». El sustantivo tampoco cuadra: Windows dice «de grupo» porque
 * `MessageActionGroupCall` no trae bit de vídeo, y eso lo midió la CW-B. Y el sufijo «Otros participantes» de la CW-C
 * no tiene espejo posible, porque la acción de grupo de MTProto no trae participantes: la sonda lo mide bandera a
 * bandera y esta prueba lo deja escrito. Entrar en el chat de voz sigue pidiendo el `payload` de tgcalls.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);
const cuerpo = (lines: string[]) => lines.join('\n');

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const service = rows(`${javaDir}ServiceMessages.java`);
const sesion = rows(`${javaDir}TdSession.java`);
const host = rows('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const llamadas = rows('../../desktop/src/WRGram.Desktop/DesktopServiceCalls.cs');
const sonda = rows('../../../.tools/cwb-probe/Program.cs');
const csproj = text('../../../.tools/cwb-probe/CwbProbe.csproj');
const vecinaB = text('./rondaCWB.test.ts');
const vecinaC = text('./rondaCWC.test.ts');
const validacion = text('../../../docs/validation.md');

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
/** La posición de una frase dentro de una sola línea, para comparar el orden de una cadena ternaria. */
function antesDe(linea: string, primeras: string[], donde: string): void {
  const sitios = primeras.map(frase => {
    const at = linea.indexOf(frase);
    if (at < 0) throw new Error(`${donde} no dice ${frase}`);
    return at;
  });
  for (let index = 1; index < sitios.length; index++) expect(sitios[index], primeras[index]).toBeGreaterThan(sitios[index - 1]);
}

const ramaInvita = bloque('MessageInviteVideoChatParticipants a=(TdApi.MessageInviteVideoChatParticipants)c;', service, 'ServiceMessages.java', 1);
const decl = en('public static string Invitation(MessageActionInviteToGroupCall call, string actor,', llamadas, 'DesktopServiceCalls.cs');
const invitacion = bloque('public static string Invitation(MessageActionInviteToGroupCall call, string actor,', llamadas, 'DesktopServiceCalls.cs', 11);

describe('ronda CW-D · el despacho baja lo que hace falta para nombrar', () => {
  it('ServiceText deja de ser estática y recibe el mensaje entero', () => {
    expect(count('private static string ServiceText', host)).toBe(0);
    expect(bloque('private string ServiceText(MessageService service, string actor = "") => service.action switch', host, 'TelegramService.cs', 1))
      .toContain('=> service.action switch');
    // La vista previa de la fila también: sin instancia no hay caché de usuarios que consultar.
    expect(count('private static string PreviewOf', host)).toBe(0);
    expect(count('private string PreviewOf(MessageBase? message)', host)).toBe(1);
    // Y los dos sitios le pasan el actor resuelto, ninguno la acción pelada como antes.
    expect(count('ServiceText(service, ActorOf(service))', host)).toBe(2);
    expect(count('ServiceText(service.action)', host)).toBe(0);
  });

  it('el brazo pide las cinco piezas y no escribe ninguna frase', () => {
    expect(bloque('MessageActionInviteToGroupCall call =>', host, 'TelegramService.cs', 1)).toContain(
      'DesktopServiceCalls.Invitation(call, actor, UserName, _client?.User?.id ?? 0, (service.flags & MessageService.Flags.out_) != 0),');
    expect(count('DesktopServiceCalls.', host)).toBe(5);
    for (const frase of ['"Se invitó"', '"Invitaste"', '" te invitó"', '"a la "', '" más"']) {
      expect(count(frase, host), frase).toBe(0);
    }
  });

  it('el nombre del invitado sale de la caché, con el relleno de Android', () => {
    const resuelve = bloque('private string UserName(long id) =>', host, 'TelegramService.cs', 2);
    expect(resuelve).toContain('_users.TryGetValue(id, out var invitado) ? Clip(FullName(invitado), 120)');
    expect(resuelve).toContain('DesktopPoll.VoterUnknown');
    // El relleno lo pone el que conoce la caché; la clase de frases no sabe qué palabra escribir cuando no llega.
    expect(count('Usuario de Telegram', llamadas)).toBe(0);
    // Y el del autor es el mismo par de recorte, con cadena vacía cuando el perfil no está.
    expect(bloque('private string ActorOf(MessageBase message) =>', host, 'TelegramService.cs', 2))
      .toContain('message.From is PeerUser autor && _users.TryGetValue(autor.user_id, out var invitante) ? Clip(FullName(invitante), 120) : ""');
    expect(bloque('String nameOf(TdSession session,long id)', service, 'ServiceMessages.java', 1))
      .toContain('session==null?"un usuario"');
    expect(bloque('String senderName(TdApi.MessageSender sender)', sesion, 'TdSession.java', 4))
      .toContain('String name = PersonName.of(user); return name == null ? "Usuario de Telegram" : name;');
  });
});

describe('ronda CW-D · las cuatro formas de Android, en el orden de Android', () => {
  it('propio, luego yo-entre-invitados, luego sin lista, luego la lista', () => {
    const propio = en('if (outgoing) return', llamadas, 'DesktopServiceCalls.cs');
    const entreInvitados = en('if (selfId != 0 && ids.Contains(selfId)) return', llamadas, 'DesktopServiceCalls.cs');
    const sinLista = en('if (invitados.Length == 0) return', llamadas, 'DesktopServiceCalls.cs');
    const conLista = en('return (actor.Length == 0 ? "Se invitó a "', llamadas, 'DesktopServiceCalls.cs');
    expect(propio).toBeGreaterThan(decl);
    expect(propio).toBeLessThan(entreInvitados);
    expect(entreInvitados).toBeLessThan(sinLista);
    expect(sinLista).toBeLessThan(conLista);
    // La cadena java, que es de una sola línea, resuelve en el mismo orden.
    antesDe(ramaInvita, ['"Invitaste a la videollamada"', 'actor+" te invitó a la videollamada"', 'actor+" invitó a la videollamada"', 'actor+" invitó a "+invitados'], 'ServiceMessages.java:130');
  });

  it('cada forma se dice una sola vez y en la clase, no en el despacho', () => {
    for (const frase of ['"Invitaste a "', '" te invitó"', '"Se te invitó"', '"Se invitó a "']) {
      expect(count(frase, llamadas), frase).toBe(1);
    }
    // Sin actor la frase se dice en pasiva; el vacío es el caso que trae la fila de la lista de chats.
    expect(invitacion).toContain('actor.Length == 0 ? "Se invitó" : actor + " invitó"');
    // Y sin lista no suelta la preposición, que era el defecto que la CW-C ya cerró en Android.
    expect(invitacion).toContain('string invitados = ids.Length == 0 ? "" : Invitees(ids, nameOf);');
  });

  it('el sustantivo sigue siendo el neutro, en minúscula y una sola vez', () => {
    expect(invitacion).toContain('string noun = GroupNoun.ToLower(Espanol);');
    expect(count('GroupNoun.ToLower(Espanol)', llamadas)).toBe(1);
    // La misma frase en Android acaba en «a la videollamada»: divergencia de sustantivo, medida por la CW-B.
    expect(ramaInvita).toContain('a la videollamada');
    expect(count('" a la " + noun', llamadas)).toBe(3);
  });
});

describe('ronda CW-D · la aritmética de nombres es la de names', () => {
  it('corte en tres, conjunción con dos y cuenta del resto', () => {
    const lista = bloque('public static string Invitees(long[] ids, Func<long, string> nameOf)', llamadas, 'DesktopServiceCalls.cs', 7);
    expect(lista).toContain('if (valores.Count > 3) return string.Join(", ", valores.Take(3)) + " y " + (valores.Count - 3) + " más";');
    expect(lista).toContain('return string.Join(", ", valores.Take(valores.Count - 1)) + " y " + valores[^1];');
    expect(lista).toContain('if (valores.Count == 1) return valores[0];');
    expect(lista).toContain('if (valores.Count == 0) return "un miembro";');
    expect(lista).toContain('ids.Where(id => id != 0).Select(nameOf).ToList()');
    // La misma aritmética en java: tres nombres, y la cifra de lo que no entró.
    const java = bloque('private static String names(TdSession session,long[] ids){', service, 'ServiceMessages.java', 8);
    expect(java).toContain('if(values.size()<3)values.add(nameOf(session,id));');
    expect(java).toContain('+" y "+(total-values.size())+" más"');
    expect(java).toContain('if(ids==null||ids.length==0)return "un miembro";');
  });

  it('aquí la cifra sí se afirma, y en la lista parcial de la CW-C no', () => {
    expect(count('" más"', llamadas)).toBe(1);
    // El recorte parcial de Android cierra con puntos suspensivos y sin número, porque el campo no es el censo.
    expect(bloque('static String participantList(String[] names){', service, 'ServiceMessages.java', 8)).toContain('names.length>shown?joined+"…"');
    expect(bloque('static String participantList(String[] names){', service, 'ServiceMessages.java', 8)).not.toContain('más');
    // Y la deduplicación vive en senderNames, no en la lista de invitados de ninguna de las dos capas.
    expect(bloque('public static string Invitees(long[] ids, Func<long, string> nameOf)', llamadas, 'DesktopServiceCalls.cs', 7)).not.toContain('Distinct');
    expect(bloque('static String[] senderNames(TdSession session,TdApi.MessageSender[] values){', service, 'ServiceMessages.java', 5)).toContain('nombres.contains(nombre)');
  });

  it('la sonda ejecuta la firma nueva sobre la clase real', () => {
    expect(csproj).toContain('apps\\desktop\\src\\WRGram.Desktop\\DesktopServiceCalls.cs');
    // Eran 34 con los nombrados de la CW-D; la CH-B le sumó veinticinco midiendo `DesktopBackgrounds`.
    expect(count('Caso("', sonda)).toBe(59);
    for (const frase of ['"Diego invitó a Ana a la llamada de grupo"', '"Diego invitó a Ana y Bruno a la llamada de grupo"',
      '"Diego invitó a Ana, Bruno y Carla a la llamada de grupo"', '"Diego invitó a Ana, Bruno, Carla y 1 más a la llamada de grupo"',
      '"Diego invitó a Ana, Bruno, Carla y 2 más a la llamada de grupo"', '"Diego invitó a la llamada de grupo"',
      '"Se invitó a Ana y Bruno a la llamada de grupo"', '"Se invitó a la llamada de grupo"', '"Diego te invitó a la llamada de grupo"',
      '"Se te invitó a la llamada de grupo"', '"Invitaste a Ana y Bruno a la llamada de grupo"', '"Invitaste a la llamada de grupo"',
      '"Diego invitó a un miembro a la llamada de grupo"', '"Diego invitó a Usuario de Telegram a la llamada de grupo"',
      // El orden de la cadena: propio delante de yo-entre-invitados, medido con un caso que cumple las dos.
      '"Invitaste a Elena y Ana a la llamada de grupo"']) {
      expect(cuerpo(sonda), frase).toContain(frase);
    }
    // La cifra suelta que medía la CW-B ya no se escribe en ninguna parte del escritorio.
    expect(count('persona', sonda)).toBe(0);
    expect(count('persona', llamadas)).toBe(0);
    expect(cuerpo(sonda)).toContain('return fallos == 0 ? 0 : 1;');
  });
});

describe('ronda CW-D · lo que el escritorio no puede copiar', () => {
  it('la acción de grupo no trae participantes, y ahí no hay sufijo que escribir', () => {
    expect(bloque('Caso("qué banderas trae la acción de grupo, medidas una por una",', sonda, 'Program.cs', 4))
      .toContain('"has_duration");');
    expect(bloque('public static string GroupCall(MessageActionGroupCall call) =>', llamadas, 'DesktopServiceCalls.cs', 2))
      .not.toContain('nameOf');
    expect(count('Otros participantes', llamadas)).toBe(0);
    // En Android el sufijo existe porque el campo existe.
    expect(count('Otros participantes', service)).toBe(1);
  });

  it('el brazo de grupo no cambió: sigue sin bit de vídeo ni nombres', () => {
    expect(count('GroupCall(call)', cuerpo(host))).toBe(1);
    expect(bloque('public static string GroupCall(MessageActionGroupCall call) =>', llamadas, 'DesktopServiceCalls.cs', 2))
      .toContain('(call.flags & MessageActionGroupCall.Flags.has_duration) != 0');
  });
});

describe('ronda CW-D · las vecinas dejan de decir lo que ya no es', () => {
  it('la CW-B ya no espeja la cifra contra la gramática de Android', () => {
    expect(vecinaB).not.toContain('count == 1 ? "" : "s"');
    expect(vecinaB).not.toContain('Windows da cifra, Android da nombres');
    expect(vecinaB).toContain('DesktopServiceCalls.cs:79');
  });

  it('la CW-C ya no abre la ronda que cerró la CW-D', () => {
    expect(vecinaC).not.toContain('trabajo de la ronda CW-D');
    expect(vecinaC).toContain('ronda CW-D');
  });

  it('la hoja de validación cita la clase de llamadas en líneas que declaran algo', () => {
    // La CW-D movió la declaración de `Invitation` tres líneas, así que el número que escribió la CW-C quedó atrás.
    // En vez de perseguir el número, se mide el destino: toda cita de esta clase en la hoja tiene que caer sobre una
    // firma pública, que es lo que los bullets afirman cuando la citan.
    const escritas = [...new Set([...validacion.matchAll(/DesktopServiceCalls\.cs:(\d+)/g)].map(fila => Number(fila[1])))].sort((a, b) => a - b);
    expect(escritas.length).toBeGreaterThan(0);
    for (const at of escritas) expect(llamadas[at - 1], `DesktopServiceCalls.cs:${at}`).toMatch(/^ {4}public (static|const)/);
  });
});

describe('ronda CW-D · las citas se miden', () => {
  /** Cada número citado en este archivo, con la frase que afirma. */
  const anchors: Record<string, string> = {
    'ServiceMessages.java:130': 'MessageInviteVideoChatParticipants a=(TdApi.MessageInviteVideoChatParticipants)c;',
    'ServiceMessages.java:149': 'private static String names(TdSession session,long[] ids){',
    'ServiceMessages.java:160': 'static String[] senderNames(TdSession session,TdApi.MessageSender[] values){',
    'ServiceMessages.java:170': 'static String participantList(String[] names){',
    'TdSession.java:1313': 'if (user == null) requestUser(id);',
    'TelegramService.cs:3655': 'private string ServiceText(MessageService service, string actor = "") => service.action switch',
    'DesktopServiceCalls.cs:79': 'public static string Invitation(MessageActionInviteToGroupCall call, string actor,',
    'DesktopServiceCalls.cs:92': 'public static string Invitees(long[] ids, Func<long, string> nameOf)',
    'Program.cs:179': 'Caso("el esquema no conoce el motivo «rechazada»",',
    'Program.cs:183': 'Caso("qué tipos traen bit de vídeo, medido sobre los Flags anidados",',
    'Program.cs:191': 'Caso("qué banderas trae la acción de grupo, medidas una por una",',
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'ServiceMessages.java' ? service
      : file === 'TdSession.java' ? sesion
        : file === 'TelegramService.cs' ? host
          : file === 'DesktopServiceCalls.cs' ? llamadas
            : file === 'Program.cs' ? sonda
              : (() => { throw new Error(`nada que leer de ${file}`); })();
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const row of rows('./rondaCWD.test.ts')) {
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
    rows('./rondaCWD.test.ts').forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${index + 1}`);
      if (/antesDe\(ramaInvita, \[[^\]]*\], '([^']+)'/.test(row)) {
        const donde = /antesDe\(ramaInvita, \[[^\]]*\], '([^']+)'/.exec(row)![1];
        if (!Object.keys(anchors).includes(donde)) loose.push(`${index + 1} (donde sin ancla)`);
      }
    });
    expect(loose).toEqual([]);
  });
});
