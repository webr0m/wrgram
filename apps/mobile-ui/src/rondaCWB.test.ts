import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * La ronda CW-B lleva a Windows los mensajes de servicio de llamada que la ronda CW midió y dejó sin escribir.
 * El despacho de `TelegramService.cs:3656` caía con los cuatro tipos de llamada bajo el paraguas
 * (`TelegramService.cs:3671`) —hoy tiene sus cinco brazos en `TelegramService.cs:3666-3670`—, así que una llamada
 * quedaba como «Mensaje de servicio de Telegram» en el historial de escritorio mientras la misma conversación la
 * nombraba en Android. La corrección no copia la frase de Android: `ServiceMessages.java:125` y
 * `ServiceMessages.java:126` sacan el sustantivo de `isVideo`, y en MTProto ese bit solo lo traen
 * `MessageActionPhoneCall` y `MessageActionConferenceCall`.
 *
 * **El grupo necesita un nombre propio, y se eligió aquí.** `MessageActionGroupCall` no trae bandera de vídeo —lo
 * mide la sonda sobre el ensamblado, caso a caso—, y afirmar «videollamada» o «de voz» donde el esquema no lo dice
 * es el defecto contrario del que cerró la ronda CW. El sustantivo elegido es el neutro
 * (`DesktopServiceCalls.cs:25`), y esto abre una divergencia entre capas que este archivo deja medida y dicha: el
 * mismo chat de grupo se nombra «de voz» o «vídeo» en Android y «de grupo» en Windows, porque una capa trae el
 * campo y la otra no. No es un empate que se pueda cerrar desde el puente.
 *
 * **Lo que sigue sin poder decirse.** MTProto no tiene un motivo «rechazada» en la llamada de uno a uno, y eso
 * también lo mide la sonda (`.tools/cwb-probe/Program.cs:179`) en vez de afirmarse de memoria: busy y hangup caen en «finalizada»,
 * igual que caen en Android. La otra ausencia es la que ya midió la ronda CW y sigue en pie: entrar en un chat de
 * voz exige el `payload` que solo fabrica tgcalls, y ningún brazo de texto lo arregla.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const service = rows(`${javaDir}ServiceMessages.java`);
const host = rows('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const llamadas = rows('../../desktop/src/WRGram.Desktop/DesktopServiceCalls.cs');
const sonda = rows('../../../.tools/cwb-probe/Program.cs');
const csproj = text('../../../.tools/cwb-probe/CwbProbe.csproj');
const csprojHost = text('../../desktop/src/WRGram.Desktop/WRGram.Desktop.csproj');
const lanzador = text('../../../scripts/desktop.ps1');
const cuerpo = (lines: string[]) => lines.join('\n');
const versionDelHost = /WTelegramClient" Version="([^"]+)"/.exec(csprojHost)?.[1] ?? '';

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

const decl = en('private string ServiceText(MessageService service, string actor = "") => service.action switch', host, 'TelegramService.cs');
const paraguas = en('_ => "Mensaje de servicio de Telegram"', host, 'TelegramService.cs');
const brazos = host.slice(decl, paraguas - 1).filter(row => row.includes('DesktopServiceCalls.'));

/** Los sustantivos que la clase de escritorio declara, leídos de su propia firma. */
function pareja(nombre: string): [string, string] {
  const match = new RegExp(`string ${nombre}\\(bool video\\) => video \\? "([^"]+)" : "([^"]+)";`).exec(cuerpo(llamadas));
  if (!match) throw new Error(`${nombre} no declara su pareja`);
  return [match[1], match[2]];
}
const [videoUno, vozUno] = pareja('KindOf');
const [videoGrupo, vozGrupo] = pareja('ConferenceKindOf');
const nombreGrupo = /public const string GroupNoun = "([^"]+)";/.exec(cuerpo(llamadas))?.[1] ?? '';
const ramaGrupoJava = bloque('else if(c instanceof TdApi.MessageGroupCall){', service, 'ServiceMessages.java', 1);
const ramaUnoJava = bloque('else if(c instanceof TdApi.MessageCall){', service, 'ServiceMessages.java', 1);

describe('ronda CW-B · el despacho pide la frase, no la escribe', () => {
  it('los cinco tipos de llamada tienen su brazo dentro del switch', () => {
    expect(brazos.map(row => row.trim())).toEqual([
      'MessageActionPhoneCall call => DesktopServiceCalls.PhoneCall(call),',
      'MessageActionConferenceCall call => DesktopServiceCalls.ConferenceCall(call),',
      'MessageActionGroupCall call => DesktopServiceCalls.GroupCall(call),',
      'MessageActionGroupCallScheduled call => DesktopServiceCalls.GroupCallScheduled(call),',
      'MessageActionInviteToGroupCall call => DesktopServiceCalls.Invitation(call, actor, UserName, _client?.User?.id ?? 0, (service.flags & MessageService.Flags.out_) != 0),',
    ]);
    // Los cuatro brazos de arriba son los que escribió la CW-B; el de la invitación lo reescribió la CW-D para
    // bajar el actor, el resolvedor de nombres, el identificador propio y la bandera de propio.
    // Orden por posición: los cinco van detrás del brazo que les hace de borde y delante del paraguas.
    const borde = en('MessageActionChatDeletePhoto =>', host, 'TelegramService.cs');
    expect(borde).toBeGreaterThan(decl);
    expect(borde).toBeLessThan(en('DesktopServiceCalls.PhoneCall(call),', host, 'TelegramService.cs'));
    for (const nombre of ['PhoneCall', 'ConferenceCall', 'GroupCall', 'GroupCallScheduled', 'Invitation']) {
      const at = en(`DesktopServiceCalls.${nombre}(call`, host, 'TelegramService.cs');
      expect(at, nombre).toBeGreaterThan(decl);
      expect(at, nombre).toBeLessThan(paraguas);
    }
    expect(count('DesktopServiceCalls.', host)).toBe(5);
    expect(count('ServiceText(service, ActorOf(service))', host)).toBe(2);
  });

  it('el nombre de la llamada no se escribe a pelo en el despacho', () => {
    for (const frase of ['"Videollamada"', '"Llamada"', '"Llamada de voz"', '"Llamada de grupo"', '" rechazada"']) {
      expect(count(frase, host), frase).toBe(0);
    }
    // Cada pareja se dice una sola vez, en su propia firma.
    expect(count('video ? "Videollamada" : "Llamada";', llamadas)).toBe(1);
    expect(count('video ? "Videollamada" : "Llamada de voz";', llamadas)).toBe(1);
    expect([videoUno, vozUno]).toEqual(['Videollamada', 'Llamada']);
    expect([videoGrupo, vozGrupo]).toEqual(['Videollamada', 'Llamada de voz']);
  });
});

describe('ronda CW-B · cada familia lee la bandera que su tipo trae', () => {
  it('el bit de vídeo solo se pide donde el esquema lo tiene', () => {
    expect(bloque('public static string PhoneCall(MessageActionPhoneCall call)', llamadas, 'DesktopServiceCalls.cs', 3))
      .toContain('KindOf((call.flags & MessageActionPhoneCall.Flags.video) != 0)');
    expect(bloque('public static string ConferenceCall(MessageActionConferenceCall call)', llamadas, 'DesktopServiceCalls.cs', 5))
      .toContain('ConferenceKindOf((call.flags & MessageActionConferenceCall.Flags.video) != 0)');
    expect(count('Flags.video', llamadas)).toBe(2);
  });

  it('el grupo se decide por su duración y no por un bit que no trae', () => {
    const grupo = bloque('public static string GroupCall(MessageActionGroupCall call) =>', llamadas, 'DesktopServiceCalls.cs', 2);
    expect(grupo).toContain('(call.flags & MessageActionGroupCall.Flags.has_duration) != 0');
    expect(grupo).not.toContain('Flags.video');
    expect(grupo).not.toContain('KindOf');
    // Sin cifra no se afirma que terminó: la rama pelada es el sustantivo solo.
    expect(grupo).toContain(': GroupNoun;');
  });

  it('el orden de las formas del grupo es el de Android', () => {
    const missed = en('Flags.missed) != 0) return kind + " perdida"', llamadas, 'DesktopServiceCalls.cs');
    const active = en('Flags.active) != 0) return kind + " en curso"', llamadas, 'DesktopServiceCalls.cs');
    const fin = en('return kind + " finalizada" + Detail(call.duration);', llamadas, 'DesktopServiceCalls.cs');
    expect(missed).toBeLessThan(active);
    expect(active).toBeLessThan(fin);
    expect(ramaGrupoJava).toContain('a.wasMissed?type+" perdida":a.isActive?type+" en curso"');
  });

  it('la duración y la hora salen de la misma aritmética que en Android', () => {
    const largo = bloque('public static string Length(int seconds)', llamadas, 'DesktopServiceCalls.cs', 7);
    expect(largo).toContain('hours > 0 ? hours + " h " + minutes + " min"');
    expect(largo).toContain('minutes > 0 ? minutes + " min " + total % 60 + " s"');
    const largoJava = bloque('static String duration(int seconds){', service, 'ServiceMessages.java', 4);
    expect(largoJava).toContain('hours+" h "+minutes+" min"');
    expect(largoJava).toContain('minutes+" min "+secs+" s"');
    // El detalle solo se pega con cifra, aquí y allí.
    expect(cuerpo(llamadas)).toContain('seconds > 0 ? " · " + Length(seconds) : ""');
    expect(ramaGrupoJava).toContain('(a.duration>0?" · "+duration(a.duration):"")');
    // La hora programada, en zona local y con la misma cultura que Android; sin hora, sin punto colgante.
    expect(cuerpo(llamadas)).toContain('ToString("d MMM, HH:mm", Espanol)');
    expect(cuerpo(llamadas)).toContain('(when.Length == 0 ? "" : " · " + when)');
    // Y la invitación: la CW-B la dejó dando cifra y la ronda CW-D la pasó a nombres, así que el espejo que se
    // comprueba aquí es la firma que hace falta para nombrar —actor, resolvedor, propio y uno entre invitados—.
    expect(bloque('public static string Invitation(MessageActionInviteToGroupCall call, string actor,', llamadas, 'DesktopServiceCalls.cs', 1))
      .toContain('Func<long, string> nameOf, long selfId, bool outgoing)');
    // La cifra suelta que escribía la CW-B ya no aparece en la capa de escritorio.
    expect(count('persona', llamadas)).toBe(0);
    expect(count('" más"', llamadas)).toBe(1);
    // La rama java concordaba ese número con la misma gramática; desde la ronda CW-C nombra a los invitados,
    // y desde la CW-D el escritorio también, con el corte de tres que mide rondaCWD.test.ts.
    const invitacionJava = bloque('MessageInviteVideoChatParticipants a=(TdApi.MessageInviteVideoChatParticipants)c;', service, 'ServiceMessages.java', 1);
    expect(invitacionJava).not.toContain('(count==1?"":"s")');
    expect(invitacionJava).toContain('names(session,a.userIds)');
  });
});

describe('ronda CW-B · lo que el esquema no trae no se inventa', () => {
  it('Windows no puede decir «rechazada», y Android sí', () => {
    expect(count('" rechazada"', llamadas)).toBe(0);
    expect(count('PhoneCallDiscardReason', llamadas)).toBe(2);
    expect(cuerpo(llamadas)).not.toContain('PhoneCallDiscardReasonDeclined');
    expect(cuerpo(llamadas)).toContain('MTProto no tiene <c>phoneCallDiscardReasonDeclined</c>');
    // En la otra capa el campo existe, y ahí la forma sí se escribe.
    expect(ramaUnoJava).toContain('a.discardReason instanceof TdApi.CallDiscardReasonDeclined?type+" rechazada"');
  });

  it('busy y hangup caen en «finalizada», como caen en Android', () => {
    expect(cuerpo(sonda)).toContain('Caso("uno a uno ocupada, como en Android"');
    expect(cuerpo(sonda)).toContain('"Videollamada finalizada · 1 h 2 min"');
    expect(cuerpo(sonda)).toContain('"Llamada finalizada · 1 min 5 s"');
  });

  it('la divergencia del grupo está medida, no disimulada', () => {
    expect(nombreGrupo).not.toBe(vozGrupo);
    expect(nombreGrupo).not.toBe(videoGrupo);
    expect(nombreGrupo).toBe('Llamada de grupo');
    // Y el sustantivo neutro es el que usan las tres formas que sí tienen acción de grupo.
    expect(count('GroupNoun', llamadas)).toBe(5);
    expect(cuerpo(sonda)).toContain(`"${nombreGrupo} finalizada · 2 min 5 s"`);
    expect(cuerpo(sonda)).toContain(`"${nombreGrupo}"`);
    expect(cuerpo(sonda)).toContain(`"${nombreGrupo} programada"`);
    expect(cuerpo(sonda)).toContain(`a la ${nombreGrupo.toLowerCase()}`);
  });
});

describe('ronda CW-B · la sonda ejecuta la clase real', () => {
  it('compila el archivo del host, no una copia', () => {
    expect(csproj).toContain('<Compile Include=');
    expect(csproj).toContain('apps\\desktop\\src\\WRGram.Desktop\\DesktopServiceCalls.cs');
    expect(cuerpo(sonda)).toContain('using WRGram.Desktop;');
    expect(versionDelHost).not.toBe('');
    expect(csproj).toContain(`Include="WTelegramClient" Version="${versionDelHost}"`);
  });

  it('la compuerta de escritorio corre la sonda dentro del check', () => {
    const check = lanzador.indexOf("if ($Task -eq 'check') {");
    const sondaEnElCheck = lanzador.indexOf('Join-Path $root \'.tools\\cwb-probe\\CwbProbe.csproj\'');
    const despuesDelCheck = lanzador.indexOf('$exe = Join-Path');
    expect(check, 'el lanzador no tiene rama de check').toBeGreaterThanOrEqual(0);
    expect(sondaEnElCheck, 'el check no menciona el proyecto de la sonda').toBeGreaterThan(check);
    expect(despuesDelCheck, 'el lanzador cambió de forma y ya no se sabe dónde acaba el check').toBeGreaterThan(sondaEnElCheck);
    expect(lanzador).toContain('dotnet run --project $probe');
    // Que la sonda corra no basta: tiene que poder tumbar la compuerta.
    const queja = lanzador.indexOf('if ($LASTEXITCODE -ne 0) { throw', sondaEnElCheck);
    expect(queja, 'la sonda corre pero su fallo no corta la compuerta').toBeGreaterThan(sondaEnElCheck);
    expect(queja).toBeLessThan(despuesDelCheck);
    expect(lanzador.slice(queja, despuesDelCheck)).toContain('sonda');
  });

  it('las tres banderas que sostienen las frases se miden sobre el ensamblado', () => {
    expect(bloque('Caso("el esquema no conoce el motivo «rechazada»",', sonda, 'Program.cs', 4))
      .toContain('"PhoneCallDiscardReason,PhoneCallDiscardReasonBusy,PhoneCallDiscardReasonDisconnect,"');
    expect(cuerpo(sonda)).not.toContain('PhoneCallDiscardReasonDeclined');
    expect(bloque('Caso("qué tipos traen bit de vídeo, medido sobre los Flags anidados",', sonda, 'Program.cs', 8))
      .toContain('"PhoneCall,ConferenceCall,"');
    expect(bloque('Caso("qué banderas trae la acción de grupo, medidas una por una",', sonda, 'Program.cs', 4))
      .toContain('"has_duration");');
  });

  it('la sonda cuenta sus casos y sale roja si alguno discrepa', () => {
    // Eran 20 con la invitación en cifra; la ronda CW-D cambió los tres casos de cifra por diecisiete nombrados y le
    // añadió el caso que ejecuta el orden de las cuatro formas (propio delante de yo-entre-invitados). Veinticinco más
    // los midió la CH-B sobre `DesktopBackgrounds`: el tipo que sale de cada hoja, el giro pasado a CSS, el color y
    // su alfa, la fila con la que se pide un fondo y lo que no es número.
    expect(count('Caso("', sonda)).toBe(59);
    expect(cuerpo(sonda)).toContain('return fallos == 0 ? 0 : 1;');
  });
});

describe('ronda CW-B · las citas se miden', () => {
  /** Cada número citado en este archivo, con la frase que afirma. */
  const anchors: Record<string, string> = {
    'TelegramService.cs:3656': 'private string ServiceText(MessageService service, string actor = "") => service.action switch',
    'TelegramService.cs:3666': 'MessageActionPhoneCall call => DesktopServiceCalls.PhoneCall(call),',
    'TelegramService.cs:3671': '_ => "Mensaje de servicio de Telegram"',
    'DesktopServiceCalls.cs:19': 'video ? "Videollamada" : "Llamada";',
    'DesktopServiceCalls.cs:22': 'video ? "Videollamada" : "Llamada de voz";',
    'DesktopServiceCalls.cs:25': 'public const string GroupNoun = "Llamada de grupo";',
    'DesktopServiceCalls.cs:48': 'public static string PhoneCall(MessageActionPhoneCall call)',
    'DesktopServiceCalls.cs:66': 'public static string GroupCall(MessageActionGroupCall call) =>',
    'DesktopServiceCalls.cs:79': 'public static string Invitation(MessageActionInviteToGroupCall call, string actor,',
    'ServiceMessages.java:125': 'String type=a.isVideo?"Videollamada":"Llamada";',
    'ServiceMessages.java:126': 'String type=a.isVideo?"Videollamada":"Llamada de voz";',
    'ServiceMessages.java:186': 'static String duration(int seconds){',
    'Program.cs:179': 'Caso("el esquema no conoce el motivo «rechazada»",',
    'Program.cs:183': 'Caso("qué tipos traen bit de vídeo, medido sobre los Flags anidados",',
    'Program.cs:191': 'Caso("qué banderas trae la acción de grupo, medidas una por una",',
  };

  /** El final de cada rango escrito, con lo que esa línea tiene que decir. */
  const ends: Record<string, [number, string]> = {
    'TelegramService.cs:3666': [3670, 'MessageActionInviteToGroupCall call => DesktopServiceCalls.Invitation(call, actor, UserName,'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TelegramService.cs' ? host
      : file === 'DesktopServiceCalls.cs' ? llamadas
        : file === 'ServiceMessages.java' ? service
          : file === 'Program.cs' ? sonda
            : (() => { throw new Error(`nada que leer de ${file}`); })();
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const row of rows('./rondaCWB.test.ts')) {
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

  it('todo rango escrito termina donde dice su tabla', () => {
    for (const [citation, [end, needle]] of Object.entries(ends)) {
      expect(written.get(citation), citation).toBe(end);
      expect(lineOf(citation.split(':')[0], end), `${citation}-${end}`).toContain(needle);
    }
    for (const [citation, end] of written) if (end > 0) expect(Object.keys(ends), citation).toContain(citation);
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    rows('./rondaCWB.test.ts').forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
