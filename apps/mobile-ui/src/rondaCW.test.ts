import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { CALL_LOG_LABELS, callRowLabel } from './callLogModel';

/**
 * La ronda CW trata del sustantivo de una llamada de grupo. `ServiceMessages.java:126` escribía «Videollamada» en las
 * tres formas del grupo sin mirar `isVideo`, que sí trae el mensaje (`TdApi.java:49759`), mientras `CallLog.java:46` ya
 * lo leía para el icono: el mismo mensaje se pintaba con dos palabras distintas según se mirara desde la burbuja o
 * desde el registro. Ahora el sustantivo sale del mismo campo en las dos familias —`ServiceMessages.java:125` y
 * `ServiceMessages.java:126`— y el espejo de la interfaz no puede inventar un nombre que la burbuja no escriba.
 *
 * **Lo que no se puede saber, dicho está.** `ServiceMessages.java:127`, `ServiceMessages.java:128`, `ServiceMessages.java:129`
 * y `ServiceMessages.java:130` tratan de los mensajes heredados del videochat y Telegram no pone en ninguno un campo de
 * vídeo: lo mide esta prueba sobre el cuerpo de cada clase de `TdApi.java` y por eso esas cuatro frases siguen hablando
 * de «videollamada» —el nombre del funcionamiento, no una afirmación sobre esa llamada concreta—. Lo que entonces llegaba
 * y no se usaba era `otherParticipantIds` del mensaje de grupo: aquí se nombró el hueco en vez de inventar cómo
 * pintarlo, y la ronda CW-C lo rellena con las tres reglas que mide `rondaCWC.test.ts`.
 *
 * **Entrar en un chat de voz sigue sin estar, y se dice por qué.** `TdApi.java:138457` declara `JoinGroupCall` con los
 * `TdApi.java:30070` parámetros de entrada, y el propio documento de la librería escribe que `audioSourceId` y el
 * `payload` se «reciben de tgcalls»: sin ese motor nadie puede fabricar la entrada, ni aquí ni en ningún sitio. Esta
 * prueba lo deja medido para que ninguna pantalla prometa un botón de «Unirse».
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const service = rows(`${javaDir}ServiceMessages.java`);
const pure = rows(`${javaDir}CallLog.java`);
const bridge = rows(`${javaDir}NativeBridge.java`);
const tdlib = rows('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const model = rows('./callLogModel.ts');
const preview = rows('./preview.ts');
const host = rows('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const llamadas = rows('../../desktop/src/WRGram.Desktop/DesktopServiceCalls.cs');
const scope = text('./desktopScope.ts');

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const count = (needle: string, cuerpo: string | string[]) => (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;

/** El cuerpo de una clase de `TdApi.java`, de su declaración a la línea que la cierra. */
function claseTdLib(nombre: string): string {
  const start = en(`public static class ${nombre} extends`, tdlib, 'TdApi.java');
  for (let index = start; index < tdlib.length; index++) if (tdlib[index].trim() === '}') return tdlib.slice(start - 1, index + 1).join('\n');
  throw new Error(`${nombre} no cierra su llave en TdApi.java`);
}

/** El par de sustantivos que la rama java saca de `isVideo`, carácter a carácter. */
function sustantivos(row: string): [string, string] {
  const match = /String type=a\.isVideo\?"([^"]+)":"([^"]+)";/.exec(row);
  if (!match) throw new Error('la rama no saca el sustantivo de isVideo');
  return [match[1], match[2]];
}

const ramaUno = service[en('else if(c instanceof TdApi.MessageCall){', service, 'ServiceMessages.java') - 1];
const ramaGrupo = service[en('else if(c instanceof TdApi.MessageGroupCall){', service, 'ServiceMessages.java') - 1];

describe('ronda CW · el sustantivo lo pone el mensaje, no la pantalla', () => {
  it('las dos familias construyen su frase sobre el mismo campo', () => {
    expect(sustantivos(ramaUno)).toEqual(['Videollamada', 'Llamada']);
    expect(sustantivos(ramaGrupo)).toEqual(['Videollamada', 'Llamada de voz']);
    // La regla se dice una vez por familia: dos ramas, dos `String type=a.isVideo`, y ninguna otra.
    expect(count('String type=a.isVideo', service)).toBe(2);
  });

  it('el grupo no puede escribir un nombre que no salga de su bandera', () => {
    for (const sufijo of ['perdida', 'en curso', 'finalizada']) {
      expect(ramaGrupo, sufijo).not.toContain(`"Videollamada ${sufijo}"`);
      expect(ramaGrupo, sufijo).not.toContain(`"Llamada de voz ${sufijo}"`);
      expect(ramaGrupo, sufijo).toContain(`type+" ${sufijo}"`);
    }
    // La duración solo se pega a la forma terminada, y sin duración no va ni el punto medio.
    expect(ramaGrupo).toContain('(a.duration>0?" · "+duration(a.duration):"")');
  });

  it('el registro y la burbuja leen la misma frase y el mismo campo', () => {
    // La fila la arma el puente con la frase de ServiceMessages: una sola fuente para las dos pantallas.
    expect(count('rows.put(CallLog.row(message,title,ServiceMessages.text(message,session)));shown++;', bridge)).toBe(1);
    // La CW dejó el hueco dicho —la rama no nombraba a nadie— y la CW-C lo cerró: ahora la lista se pide.
    expect(ramaGrupo).toContain('participantList(senderNames(session,a.otherParticipantIds))');
    // `CallLog.video` ya miraba `isVideo` en las dos familias antes de que la burbuja lo hiciera.
    const video = pure.slice(en('static boolean video(TdApi.Message message) {', pure, 'CallLog.java') - 1, en('static boolean video(TdApi.Message message) {', pure, 'CallLog.java') + 4);
    expect(video.join('\n')).toContain('((TdApi.MessageCall) message.content).isVideo');
    expect(video.join('\n')).toContain('((TdApi.MessageGroupCall) message.content).isVideo');
  });
});

describe('ronda CW · lo que Telegram sí manda en cada mensaje', () => {
  it('el mensaje de grupo trae el campo que usa la frase nueva', () => {
    expect(claseTdLib('MessageGroupCall')).toContain('public boolean isVideo;');
    expect(claseTdLib('MessageGroupCall')).toContain('public boolean wasMissed;');
    expect(claseTdLib('MessageGroupCall')).toContain('public boolean isActive;');
    expect(claseTdLib('MessageCall')).toContain('public boolean isVideo;');
  });

  it('los cuatro mensajes heredados no traen campo de vídeo, y ahí no se inventa nada', () => {
    for (const nombre of ['MessageVideoChatScheduled', 'MessageVideoChatStarted', 'MessageVideoChatEnded', 'MessageInviteVideoChatParticipants']) {
      expect(claseTdLib(nombre), nombre).not.toContain('isVideo');
    }
    // Tres frases siguen carácter a carácter como las dejó la CW; la cuarta la reescribió la CW-C.
    expect(service[en('MessageVideoChatScheduled a=(TdApi.MessageVideoChatScheduled)c;', service, 'ServiceMessages.java') - 1])
      .toContain('text="Videollamada programada · "+date(a.startDate)');
    expect(service[en('TdApi.MessageVideoChatStarted){kind="call";', service, 'ServiceMessages.java') - 1])
      .toContain('text="Videollamada iniciada";');
    expect(service[en('MessageVideoChatEnded a=(TdApi.MessageVideoChatEnded)c;', service, 'ServiceMessages.java') - 1])
      .toContain('text="Videollamada finalizada"+((a.duration>0)?" · "+duration(a.duration):"")');
    expect(service[en('MessageInviteVideoChatParticipants a=(TdApi.MessageInviteVideoChatParticipants)c;', service, 'ServiceMessages.java') - 1])
      .toContain('invitados.isEmpty()?actor+" invitó a la videollamada":actor+" invitó a "+invitados+" a la videollamada"');
  });
});

describe('ronda CW · el espejo de la interfaz no inventa nombres', () => {
  it('las tres formas del grupo salen del sustantivo de la rama java', () => {
    const [, voz] = sustantivos(ramaGrupo);
    expect(CALL_LOG_LABELS.voiceMissed).toBe(`${voz} perdida`);
    expect(CALL_LOG_LABELS.voiceInProgress).toBe(`${voz} en curso`);
    expect(CALL_LOG_LABELS.voiceFinished('')).toBe(`${voz} finalizada`);
    expect(CALL_LOG_LABELS.voiceFinished(' · 2 min 5 s')).toBe(`${voz} finalizada · 2 min 5 s`);
  });

  it('una fila de grupo sin vídeo no puede decirse videollamada', () => {
    expect(callRowLabel('missed', false, true, 0)).toBe('Llamada de voz perdida');
    expect(callRowLabel('declined', false, true, 0)).toBe('Llamada de voz perdida');
    expect(callRowLabel('ended', false, true, 125)).toBe('Llamada de voz finalizada · 2 min 5 s');
    expect(callRowLabel('ended', false, true, 0, true)).toBe('Llamada de voz en curso');
    expect(callRowLabel('missed', true, true, 0)).toBe('Videollamada perdida');
    expect(callRowLabel('ended', true, true, 0, true)).toBe('Videollamada en curso');
    // Uno a uno sigue con sus cuatro terminaciones, que el grupo no tiene.
    expect(callRowLabel('disconnected', false, false, 30)).toBe('Llamada interrumpida');
    expect(callRowLabel('declined', true, false, 0)).toBe('Videollamada rechazada');
    // El espejo tiene que nombrar el campo igual que la rama: si `group` se quedara fuera, esta línea lo vería.
    expect(model[en('if (group) {', model, 'callLogModel.ts') - 1]).toBe('  if (group) {');
    expect(model[en('if (ongoing) return video ? CALL_LOG_LABELS.videoInProgress : CALL_LOG_LABELS.voiceInProgress;', model, 'callLogModel.ts') - 1])
      .toContain('CALL_LOG_LABELS.voiceInProgress');
  });

  it('el andamio tiene fila de chat de voz de grupo, para que la pantalla la enseñe', () => {
    const fila = preview[en("{ chat: '24', reason: 'missed', video: false, group: true", preview, 'preview.ts') - 1];
    expect(fila).toContain("{ chat: '24', reason: 'missed', video: false, group: true, missed: true, seconds: 0 },");
    expect(callRowLabel('missed', false, true, 0)).toBe('Llamada de voz perdida');
  });
});

describe('ronda CW · Windows y entrar en la llamada, por su nombre', () => {
  it('el host de escritorio ya nombra la llamada, y lo hace leyendo el bit', () => {
    // Lo que la ronda CW midió como ausencia —los cuatro tipos que traerían la llamada no aparecían ni una vez
    // en el despacho— lo cerró la ronda CW-B metiendo sus brazos y su clase.
    for (const nombre of ['MessageActionPhoneCall', 'MessageActionConferenceCall', 'MessageActionGroupCall', 'MessageActionInviteToGroupCall']) {
      expect(count(nombre, host) > 0, nombre).toBe(true);
    }
    // El sustantivo no se escribe a pelo en el despacho: los cinco brazos piden la frase a la clase que mira el bit.
    expect(count('"Videollamada"', host)).toBe(0);
    expect(count('DesktopServiceCalls.', host)).toBe(5);
    expect(llamadas.join('\n')).toContain('video ? "Videollamada" : "Llamada"');
    expect(host[en('private string ServiceText(MessageService service, string actor', host, 'TelegramService.cs') - 1])
      .toContain('private string ServiceText(MessageService service, string actor = "") => service.action switch');
    expect(count('_ => "Mensaje de servicio de Telegram"', host)).toBe(1);
    // Y la interfaz lo dice: el teléfono y el registro están en la fila de pendientes.
    expect(scope).toContain("label: 'notificaciones push, llamadas y WR IA'");
    expect(scope).toContain("'call.open', 'calls.list'");
  });

  it('entrar en un chat de voz exige un payload que solo fabrica tgcalls', () => {
    expect(claseTdLib('JoinGroupCall')).toContain('public GroupCallJoinParameters joinParameters;');
    const parametros = claseTdLib('GroupCallJoinParameters');
    expect(parametros).toContain('public int audioSourceId;');
    expect(parametros).toContain('public String payload;');
    expect(parametros).toContain('public boolean isMuted;');
    // El sí existe: con esto se entraría con el vídeo encendido, y se apaga y enciende después. No es el freno.
    expect(parametros).toContain('public boolean isMyVideoEnabled;');
    expect(claseTdLib('ToggleGroupCallIsMyVideoEnabled')).toContain('public boolean isMyVideoEnabled;');
    // Lo que frena es el payload: sin motor no hay entrada que pedir y la pantalla no puede ofrecer «Unirse».
    expect(tdlib.join('\n')).not.toContain('class SendGroupCallSignalingData');
  });
});

describe('ronda CW · las citas se miden', () => {
  /** Cada número citado en este archivo, con la frase que afirma. */
  const anchors: Record<string, string> = {
    'ServiceMessages.java:125': 'String type=a.isVideo?"Videollamada":"Llamada";',
    'ServiceMessages.java:126': 'String type=a.isVideo?"Videollamada":"Llamada de voz";',
    'ServiceMessages.java:127': 'text="Videollamada programada · "+date(a.startDate)',
    'ServiceMessages.java:128': 'text="Videollamada iniciada";',
    'ServiceMessages.java:129': 'text="Videollamada finalizada"+((a.duration>0)?" · "+duration(a.duration):"")',
    'ServiceMessages.java:130': 'actor+" invitó a "+invitados+" a la videollamada"',
    'CallLog.java:46': 'static boolean video(TdApi.Message message) {',
    'NativeBridge.java:5428': 'rows.put(CallLog.row(message,title,ServiceMessages.text(message,session)));shown++;',
    'TdApi.java:49759': 'public static class MessageGroupCall extends MessageContent {',
    'TdApi.java:138457': 'public static class JoinGroupCall extends Function<GroupCallInfo> {',
    'TdApi.java:30070': 'public static class GroupCallJoinParameters extends Object {',
    'callLogModel.ts:60': 'export function callRowLabel(',
    'preview.ts:3378': "{ chat: '24', reason: 'missed', video: false, group: true",
    'TelegramService.cs:3655': 'private string ServiceText(MessageService service, string actor = "") => service.action switch',
    'desktopScope.ts:102': "label: 'notificaciones push, llamadas y WR IA'",
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'CallLog.java' ? pure
        : file === 'NativeBridge.java' ? bridge
          : file === 'ServiceMessages.java' ? service
            : file === 'callLogModel.ts' ? model
              : file === 'preview.ts' ? preview
                : file === 'desktopScope.ts' ? rows('./desktopScope.ts')
                  : file === 'TelegramService.cs' ? host
                    : (() => { throw new Error(`nada que leer de ${file}`); })();
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const row of rows('./rondaCW.test.ts')) {
    for (const match of row.matchAll(/([A-Za-z][\w.]*\.(?:java|cs|tsx|ts)):(\d+)(?:-(\d+))?/g)) {
      written.set(`${match[1]}:${match[2]}`, Math.max(written.get(`${match[1]}:${match[2]}`) ?? 0, Number(match[3] ?? 0)));
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
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    rows('./rondaCW.test.ts').forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
