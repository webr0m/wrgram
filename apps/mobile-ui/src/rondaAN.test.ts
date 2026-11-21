import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const pollRules = text('../../desktop/src/WRGram.Desktop/DesktopPoll.cs');
const albumRules = text('../../desktop/src/WRGram.Desktop/DesktopAlbum.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const contract = text('./contract.ts');
const panels = text('./BatchPanels.tsx');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const snapshot = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeSnapshot.java');

/** El literal que la clase de reglas asigna a una constante de C#. */
function csSentence(name: string, from = pollRules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** El trozo de `NativeBridge.java` que es un método, desde su firma hasta la llave que lo cierra. */
function javaBody(name: string): string {
  const start = java.search(new RegExp(`private [^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = java.indexOf('{', start); i < java.length; i++) {
    if (java[i] === '{') depth++;
    else if (java[i] === '}' && --depth === 0) return java.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** Lo que una capa hace antes que la otra: si el orden se pierde, la prueba dice cuál iba primero. */
function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta «${needle}»`);
  return index;
}

const pollRefusals = /const POLL_REFUSALS = \{([\s\S]*?)\n\};/.exec(preview)?.[1] ?? '';
const albumRefusals = /const ALBUM_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

/** Las diez frases que Android ya pronuncia hoy, con la constante de C# que las copia y el archivo donde vive. */
const ANDROID_SENTENCES: [string, string, string][] = [
  ['sending', 'Sending', java], ['private', 'Private', java], ['notAllowed', 'NotAllowed', java],
  ['noQuestion', 'NoQuestion', java], ['batch', 'Batch', java], ['option', 'Option', java],
  ['repeated', 'Repeated', java], ['noCorrect', 'NoCorrect', java], ['noPoll', 'NoPoll', java],
  // «cerrada» no la dice el puente sino la lectura: es un motivo de restricción, y esos viven en NativeSnapshot.
  ['closed', 'ClosedReason', snapshot],
];

describe('ronda AN · las frases de la encuesta vienen de Android', () => {
  it.each(ANDROID_SENTENCES)('«%s» es literal de Android en las tres capas', (key, name, source) => {
    const sentence = csSentence(name);
    expect(source).toContain(`"${sentence}"`);
    expect(tsProperty(key, pollRefusals)).toBe(sentence);
    // Y escrita una sola vez en cada capa: una copia suelta es una frase que se va a desfasar.
    expect(count(sentence, preview)).toBe(1);
    expect(count(`"${sentence}"`, service)).toBe(0);
  });

  it('la de la pregunta larga es el «Invalid text» de Android dicho en español', () => {
    expect(policy).toContain('throw new IllegalArgumentException("Invalid text")');
    // La pantalla ya la tenía escrita desde antes de esta ronda, y el puente la adopta en vez de inventar otra.
    expect(panels).toContain(`setError('${csSentence('TooLong')}')`);
    expect(tsProperty('tooLong', pollRefusals)).toBe(csSentence('TooLong'));
    // No es un literal de Android: por eso no está en su archivo.
    expect(java).not.toContain(csSentence('TooLong'));
    expect(pollRules).toContain('«Invalid text»');
  });

  it('las dos que Android lanza sin mensaje tienen frase propia y está contado', () => {
    const answer = javaBody('answerPoll');
    expect(answer).toContain('throw new IllegalArgumentException();');
    expect(answer).not.toContain(`"${csSentence('NoVote')}"`);
    expect(pollRules).toContain('la pantalla se quedó atrás');
  });

  it('el mensaje que ya no está es la misma frase del álbum, en las cuatro capas', () => {
    expect(csSentence('Gone')).toBe(csSentence('Gone', albumRules));
    expect(tsProperty('gone', albumRefusals)).toBe(csSentence('Gone'));
    // El espejo no repite el literal: lo referencia, así que solo puede cambiar de una vez.
    expect(pollRefusals).toContain('gone: ALBUM_REFUSALS.gone,');
    expect(at('gone: ALBUM_REFUSALS.gone', preview)).toBeGreaterThan(at('noPoll:', preview));
  });

  it('cerrar se niega por la biblioteca y listar votantes dejó de negarse', () => {
    const stop = csSentence('NoStop');
    expect(stop).toContain('biblioteca de escritorio');
    expect(service).toContain(`"poll.stop" => throw new BridgeException(DesktopPoll.NoStop)`);
    expect(preview).toContain(`throw new Error(POLL_REFUSALS.noStop)`);
    // La lista de votantes existía en los dos protocolos desde el principio, así que la negativa de esta ronda
    // mentía a medias. Desde la ronda AO no queda ni su rastro en las tres capas: borrar una frase cuando deja de
    // ser cierta es parte de la frase.
    expect(pollRules).not.toContain('NoVoters');
    expect(service).not.toContain('DesktopPoll.NoVoters');
    expect(preview).not.toContain('noVoters');
    expect(service).toContain('"poll.voters" => await PollVotersAsync(args)');
    // Y en Android las dos existen de verdad, que es la prueba de que el hueco era de aquí y no de Telegram.
    expect(java).toContain('new TdApi.StopPoll(');
    expect(java).toContain('new TdApi.GetPollVoters(');
  });

  it('la negación de chat secreto está contada y no copiada', () => {
    const secret = 'Telegram no permite encuestas en chats secretos.';
    expect(java).toContain(`"${secret}"`);
    // Documentada con comillas angulares: si aparece entre comillas rectas es una constante viva.
    expect(pollRules).toContain('«Telegram no permite encuestas en chats secretos.»');
    for (const source of [pollRules, service, preview]) {
      expect(count(`"${secret}"`, source)).toBe(0);
      expect(count(`'${secret}'`, source)).toBe(0);
    }
  });

  it('de las seis razones de restricción solo se traduce la que se puede leer', () => {
    // Las cinco restantes son estados de la tubería de TDLib o datos de sesión que MTProto no publica.
    for (const reason of [
      'La encuesta aún no se ha enviado.', 'La encuesta está programada.',
      'Tu país no puede participar en esta encuesta.', 'Debes llevar más de un día en el chat para votar.',
      'No puedes votar en esta encuesta.',
    ]) {
      expect(snapshot).toContain(`"${reason}"`);
      expect(count(reason, preview)).toBe(0);
      expect(count(`"${reason}"`, pollRules)).toBe(0);
    }
    expect(csSentence('ClosedReason')).toContain('cerrada');
  });
});

describe('ronda AN · el orden de las negaciones es el del puente', () => {
  const javaOrder = [
    'if(!session.canSend())',
    'TdApi.ChatTypePrivate',
    '!chat.permissions.canSendPolls',
    'BridgePolicy.text(p,"question",255)',
    'if(question.isEmpty())',
    'values.length()<2||values.length()>12',
    'text.isEmpty()||text.length()>100',
    '!unique.add(',
    'correct<0||correct>=options.length',
    'period>2628000',
  ];

  it('Android niega en ese orden y el puente de Windows lo respeta', () => {
    const body = javaBody('sendPoll');
    for (const [index, needle] of javaOrder.entries()) {
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(javaOrder[index - 1], body));
    }
    const code = csBody('SendPollAsync');
    const csOrder = [
      'DesktopPoll.CanSendText', 'DesktopPoll.PrivateOk', 'DesktopPoll.CanSendPolls',
      'DesktopPoll.WithinQuestion', 'DesktopPoll.HasQuestion', 'DesktopPoll.Fits(',
      'DesktopPoll.FitsOption', 'DesktopPoll.Repeats', 'DesktopPoll.AllowsCorrect',
      'DesktopPoll.ClosesInRange',
    ];
    for (const [index, needle] of csOrder.entries()) {
      expect(code).toContain(needle);
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(csOrder[index - 1], code));
    }
  });

  it('la longitud se comprueba antes que la pregunta vacía, en las tres capas', () => {
    // Es la sutileza de `BridgePolicy.text`: mide antes del `trim()`, así que 300 espacios se niegan por largos.
    expect(at('BridgePolicy.text(p,"question",255)', javaBody('sendPoll')))
      .toBeLessThan(at('if(question.isEmpty())', javaBody('sendPoll')));
    expect(at('DesktopPoll.WithinQuestion(raw)', service)).toBeLessThan(at('DesktopPoll.HasQuestion(question)', service));
    expect(at('raw.length > POLL_MAX_QUESTION', preview)).toBeLessThan(at('const question = raw.trim()', preview));
  });

  it('el espejo niega en el mismo orden que el puente', () => {
    const code = tsBody('desktopPollSend');
    const order = ['POLL_REFUSALS.sending', 'POLL_REFUSALS.private', 'POLL_REFUSALS.notAllowed',
      'POLL_REFUSALS.tooLong', 'POLL_REFUSALS.noQuestion', 'POLL_REFUSALS.batch',
      'POLL_REFUSALS.option', 'POLL_REFUSALS.repeated', 'POLL_REFUSALS.noCorrect', 'POLL_REFUSALS.closeRange'];
    for (const [index, needle] of order.entries()) {
      expect(code).toContain(needle);
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
    }
  });

  it('las cuatro negaciones del voto van en el orden de Android', () => {
    const code = csBody('AnswerPollAsync');
    // Primero la fila, luego si es encuesta, después el lote y al final la clave: es literalmente el cuerpo de
    // `answerPoll`, y la lectura que en Android hace `message(p)` es aquí el `GetMessages` que abre el método.
    const android = [
      'TdApi.Message message=message(p);',
      'if(!(message.content instanceof TdApi.MessagePoll))',
      'JSONArray values=p.getJSONArray("options")',
      'new TdApi.SetPollAnswer(message.chatId,message.id,ids)',
    ];
    const body = javaBody('answerPoll');
    for (const [index, needle] of android.entries()) {
      expect(body).toContain(needle);
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(android[index - 1], body));
    }
    const order = [
      'var page = await client.GetMessages',
      'if (row == null) throw new BridgeException(DesktopPoll.Gone);',
      'if (row.media is not MessageMediaPoll { poll: { } poll }) throw new BridgeException(DesktopPoll.NoPoll);',
      'if (indices == null) throw new BridgeException(DesktopPoll.NoVote);',
      'var keys = DesktopPoll.KeysFor(poll, indices);',
      'if (keys == null) throw new BridgeException(DesktopPoll.Stale);',
      'await client.Messages_SendVote(entry.Input, (int)id, keys);',
    ];
    for (const needle of order) expect(code).toContain(needle);
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
    }
  });
});

describe('ronda AN · las banderas y los números que hay que fabricar', () => {
  it('las dos banderas invertidas no se cuelan', () => {
    // Es el único sitio donde una traducción distraida deja una encuesta pública creyéndose anónima.
    const body = csBody('FlagsFor', pollRules);
    expect(body).toContain('if (!anonymous) flags |= TL.Poll.Flags.public_voters;');
    expect(body).toContain('if (!revoting) flags |= TL.Poll.Flags.revoting_disabled;');
    expect(body).toContain('if (multiple && !quiz) flags |= TL.Poll.Flags.multiple_choice;');
    expect(body).not.toContain('if (anonymous) flags |= TL.Poll.Flags.public_voters;');
    expect(body).not.toContain('if (revoting) flags |= TL.Poll.Flags.revoting_disabled;');
  });

  it('un cuestionario no admite varias respuestas, igual que en Android', () => {
    expect(java).toContain('boolean multiple=!quiz&&p.optBoolean("multiple")');
    expect(preview).toContain('multiple: !quiz && params.multiple === true');
  });

  it('el identificador y las claves los sortea el cliente, y las claves son distintas entre sí', () => {
    const body = csBody('OptionKeys', pollRules);
    expect(body).toContain('while (!seen.Add(key))');
    // CN-B pone la única excepción a esa regla: con una foto por opción el montaje pasa a `InputPollAnswer`, que no
    // tiene campo `option`, así que las claves del cliente solo se sortean cuando la encuesta va sin imágenes.
    expect(csBody('SendPollAsync')).toContain('var keys = pictures.Length > 0 ? null : DesktopPoll.OptionKeys(options.Length);');
    // El id viaja hasta el contrato en las dos capas: Android no lo manda nunca, así que en la pantalla es opcional.
    expect(csBody('ConvertPoll')).toContain('PollId = poll.id');
    expect(tsBody('desktopPollSend')).toContain('pollId:');
    expect(contract).toMatch(/export interface Poll \{ pollId\?/);
    // Votar no puede usar el índice: solo Telegram tiene la clave, así que hay que leer la fila antes.
    expect(at('client.GetMessages', csBody('AnswerPollAsync'))).toBeLessThan(at('client.Messages_SendVote', csBody('AnswerPollAsync')));
  });

  it('el porcentaje se calcula aquí porque TDLib lo daba hecho', () => {
    expect(snapshot).toContain('.put("percentage",option.votePercentage)');
    const body = csBody('Percentage', pollRules);
    expect(body).toContain('MidpointRounding.AwayFromZero');
    expect(body).toContain('total <= 0 ? 0');
    expect(tsBody('pollPercentage')).toContain('Math.round((votes * 100) / total)');
    expect(csBody('ConvertPoll')).toContain('Percentage = DesktopPoll.Percentage(votes, total)');
  });

  it('el resultado se empareja por la clave opaca y no por el orden', () => {
    expect(csBody('ConvertPoll')).toContain('voters.FirstOrDefault(voter => voter.option == answers[position].option)');
  });

  it('«ver votantes» es lo contrario de «anónima», en las dos capas', () => {
    expect(csBody('CanGetVoters', pollRules)).toContain('=> !IsAnonymous(poll)');
    expect(preview).toContain('canGetVoters: !anonymous');
    // Y la pantalla obedece la bandera: sin ella el botón sale deshabilitado.
    expect(panels).toContain('disabled={pending||!poll.canGetVoters}');
  });

  it('cerrar una encuesta sale siempre en falso, y está dicho por qué', () => {
    expect(csBody('ConvertPoll')).toContain('CanStop = false');
    expect(preview).toContain('canStop: false');
    // Android lo calcula con una fórmula que aquí sería una promesa vacía.
    expect(snapshot).toContain('.put("canStop",message.isOutgoing&&!poll.isClosed)');
    expect(pollRules).toContain('no tiene petición para cerrar una encuesta');
    // La pantalla pinta el botón solo con la bandera puesta, así que la negativa ni se ve.
    expect(panels).toContain('{poll.canStop&&');
  });

  it('la descripción y la explicación viven en sitios distintos según el protocolo', () => {
    // En TDLib la explicación es del cuestionario; en MTProto viaja en los resultados.
    expect(csBody('ConvertPoll')).toContain('Description = ""');
    expect(csBody('ConvertPoll')).toContain('PollResults.Flags.has_solution');
    expect(snapshot).toContain('container.description==null');
  });

  it('los recortes de leer no son los de escribir', () => {
    const constants = (name: string) => Number(new RegExp(`${name} = (\\d+)`).exec(pollRules)?.[1]);
    expect(constants('MaxQuestion')).toBe(255);
    expect(constants('ShownQuestion')).toBe(300);
    expect(constants('MaxExplanation')).toBe(200);
    expect(constants('ShownExplanation')).toBe(300);
    // Y el puente usa los de escribir al validar y los de leer al convertir.
    expect(csBody('SendPollAsync')).toContain('explanation[..DesktopPoll.MaxExplanation]');
    expect(csBody('ConvertPoll')).toContain('DesktopPoll.ShownQuestion');
  });
});

describe('ronda AN · el contrato y la lectura', () => {
  it('cada campo de PollDto existe en el contrato de la pantalla', () => {
    const dto = /public sealed class PollDto\n\{([\s\S]*?)\n\}/.exec(state)?.[1] ?? '';
    const fields = [...dto.matchAll(/public [\w?<>\[\]]+ (\w+) \{ get; set; \}/g)].map(match => match[1]);
    const shape = /export interface Poll \{([^}]*)\}/.exec(contract)?.[1] ?? '';
    expect(fields.length).toBeGreaterThanOrEqual(13);
    for (const field of fields) {
      const camel = field[0].toLowerCase() + field.slice(1);
      // OPCIONAL vale igual: `pollId` es de los campos que Android no manda nunca, así que en el contrato
      // aparece con interrogante y la pantalla lo trata como lo que es — un dato que puede no existir.
      expect(shape).toMatch(new RegExp(`\\b${camel}\\??:`));
    }
  });

  it('cada campo de PollOptionDto existe en el contrato, y ninguno falta', () => {
    const dto = /public sealed class PollOptionDto\n\{([\s\S]*?)\n\}/.exec(state)?.[1] ?? '';
    const fields = [...dto.matchAll(/public [\w?<>]+ (\w+) \{ get; set; \}/g)].map(match => match[1]);
    // `media` entra en la lista con la ronda CN-B: el DTO del host ya trae la foto de la opción, y el contrato la
    // declara opcional, que es lo que permite seguir pintando encuestas sin imágenes.
    expect(fields.map(field => field[0].toLowerCase() + field.slice(1)).sort())
      .toEqual(['choosing', 'chosen', 'index', 'media', 'percentage', 'text', 'votes']);
  });

  it('la encuesta se lee en la conversión y no en ningún otro sitio', () => {
    const body = csBody('ConvertMessage');
    expect(body).toContain('case MessageMediaPoll { poll: { } poll }:');
    // Antes de la default que tapa: si cae después, la burbuja dice «Contenido no compatible».
    expect(at('case MessageMediaPoll', body)).toBeLessThan(at('default:', body));
    expect(body).toContain('dto.Poll = ConvertPoll(poll');
  });

  it('una fila de encuesta no escribe su pregunta en el texto', () => {
    // Si lo hiciera, la tarjeta y la burbuja mostrarían la misma pregunta dos veces.
    const arm = /case MessageMediaPoll[\s\S]*?break;/.exec(csBody('ConvertMessage'))?.[0] ?? '';
    expect(arm).not.toContain('dto.Text =');
  });

  it('el aviso de Telegram mueve la burbuja sin recargar el historial', () => {
    expect(service).toContain('case UpdateMessagePoll poll:');
    expect(at('case UpdateMessagePoll poll:', service)).toBeLessThan(at('case UpdateFolderPeers', service));
    const body = csBody('OnPoll');
    expect(body).toContain('message.Poll.PollId == update.poll_id');
    expect(body).toContain('if (update.poll == null) return;');
    expect(csBody('ConvertPoll')).toContain('PollId = poll.id');
  });

  it('los derechos se leen de la fila que ya se tiene, sin petición extra', () => {
    const body = csBody('Of', pollRules);
    expect(body).toContain('Channel.Flags.has_banned_rights');
    expect(body).toContain('Chat.Flags.has_default_banned_rights');
    // Sin fila no se niega nada: negar por no saber sería peor que el error que devuelve el servidor.
    expect(csBody('Free', pollRules)).toContain('if (Set(rights.Own, bit)) return false;');
    expect(service).toContain('DesktopPoll.Of(ChatRow(entry))');
  });
});

describe('ronda AN · la pantalla deja de esconderla en Windows', () => {
  it('«Crear encuesta» ya no está detrás de !desktop', () => {
    const start = at('<MenuItem icon={<ListChecks/>} label="Crear encuesta"', app);
    // Ahora encabeza la categoría Organizar, sin guarda de plataforma.
    expect(app.slice(start - 120, start)).toContain('title="Organizar"');
    expect(app.slice(start - 3, start)).not.toBe('&&<');
    const closing = 'openPoll();}}/>';
    const end = app.indexOf(closing, start) + closing.length;
    expect(app.slice(start, end)).toContain('onClick={()=>{setDialog(undefined);openPoll();}}/>');
  });

  it('las otras ocho entradas del adjuntar siguen escondidas, cada una con su motivo', () => {
    // La lista de tareas no tiene tipos en la librería; el resto necesita hardware o permisos de Android.
    // «Compartir contacto» se salió de esta cuenta con la ronda AP, que le armó el puente en Windows.
    // «Ubicación en directo» entró con la ronda CB y se queda escondida por lo mismo: Windows no tiene sensor.
    const menu = app.slice(at('function openAttachments', app), at('function toggleFormat', app));
    expect(count('{!desktop&&<MenuItem', menu)).toBe(3);
    expect(menu).toContain('id="record" title="Grabar" description="Voz, cámara y videomensajes" icon={<Mic/>}>{!desktop&&<>');
    // El contenido de pago va un poco más lejos: se esconde además fuera de los canales.
    expect(count("{!desktop&&active?.type==='channel'", menu)).toBe(1);
  });

  it('las cuatro órdenes siguen en la lista blanca del puente Android', () => {
    for (const method of ['poll.send', 'poll.answer', 'poll.stop', 'poll.voters']) {
      expect(policy).toContain(`"${method}"`);
      expect(service).toContain(`"${method}"`);
    }
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = {
  id: string; text: string; chatId: string; outgoing: boolean;
  poll?: {
    question: string; description: string; totalVoters: number; anonymous: boolean; multiple: boolean;
    revoting: boolean; closed: boolean; canSeeResults: boolean; canGetVoters: boolean; canStop: boolean;
    quiz: boolean; explanation?: string; restriction?: string;
    options: { index: number; text: string; votes: number; percentage: number; chosen: boolean }[];
  };
};
type Snap = { active: string; selfId: string; canSend: boolean; uncertain: boolean; messages: Row[]; chats: { id: string; noPolls?: boolean }[] };
type Poll = NonNullable<Row['poll']>;

const DRAFT = { question: '¿Qué probamos primero?', options: ['La barra nueva', 'Los temas'], quiz: false, anonymous: true, multiple: false, revoting: true, hide: false, explanation: '', correct: -1 };

describe('ronda AN · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', canSend: true, uncertain: false, messages: [], chats: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);
  const saved = { active: '1', selfId: '1' };
  /** Abre «Mensajes guardados» —el único privado donde Telegram admite encuesta— y manda un borrador. */
  const send = async (patch: Record<string, unknown> = {}) => {
    set(saved);
    expect(await call('poll.send', { ...DRAFT, ...patch })).toBe(true);
    return snap().messages.at(-1) as Row;
  };
  const pollOf = async (patch: Record<string, unknown> = {}) => (await send(patch)).poll as Poll;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('la encuesta enviada sale como burbuja propia y sin texto', async () => {
    const row = await send();
    expect(row.text).toBe('');
    expect(row.outgoing).toBe(true);
    expect(row.poll?.question).toBe('¿Qué probamos primero?');
    expect(row.poll?.options.map(option => option.text)).toEqual(['La barra nueva', 'Los temas']);
    expect(row.poll?.options.map(option => option.index)).toEqual([0, 1]);
  });

  it('una encuesta recién enviada tiene cero votos y cero por ciento', async () => {
    const poll = await pollOf();
    expect(poll.totalVoters).toBe(0);
    expect(poll.options.every(option => option.votes === 0 && option.percentage === 0)).toBe(true);
  });

  it('los campos que Android lee de TDLib se calculan aquí', async () => {
    const poll = await pollOf();
    expect(poll.description).toBe('');
    expect(poll.canStop).toBe(false);
    expect(poll.canGetVoters).toBe(false);   // anónima, y la bandera sale de ahí
    expect(poll.canSeeResults).toBe(true);   // sin ocultar resultados
    expect(await pollOf({ anonymous: false }).then(shot => shot.canGetVoters)).toBe(true);
    expect((await pollOf({ hide: true })).canSeeResults).toBe(false);
  });

  it('el cuestionario se envía con su respuesta y su explicación', async () => {
    const poll = await pollOf({ quiz: true, correct: 1, explanation: 'La barra salió mejor.', multiple: true });
    expect(poll.quiz).toBe(true);
    expect(poll.explanation).toBe('La barra salió mejor.');
    // Un cuestionario enseña resultados aunque se eligiera ocultarlos, y no admite varias respuestas.
    expect(poll.canSeeResults).toBe(true);
    expect(poll.multiple).toBe(false);
  });

  it('en un privado que no es bot ni uno mismo, Telegram no la admite', async () => {
    set({ active: '11' });
    await expect(call('poll.send', DRAFT)).rejects.toThrow(tsProperty('private', pollRefusals));
    expect(snap().messages.at(-1)?.poll).toBeUndefined();
  });

  it('un bot y Mensajes guardados sí la admiten', async () => {
    expect((await send()).poll?.question).toBeTruthy();
    set({ active: '16', selfId: '1' });
    expect(await call('poll.send', DRAFT)).toBe(true);
  });

  it('donde Telegram negó el derecho, la frase lo dice', async () => {
    set({ active: '22' });
    await expect(call('poll.send', DRAFT)).rejects.toThrow(tsProperty('notAllowed', pollRefusals));
    set({ active: '1', canSend: false });
    await expect(call('poll.send', DRAFT)).rejects.toThrow(tsProperty('sending', pollRefusals));
  });

  it('la pregunta manda: vacía, de relleno o pasado de largo', async () => {
    set(saved);
    await expect(call('poll.send', { ...DRAFT, question: '   ' })).rejects.toThrow(tsProperty('noQuestion', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, question: '' })).rejects.toThrow(tsProperty('noQuestion', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, question: 'x'.repeat(256) })).rejects.toThrow(tsProperty('tooLong', pollRefusals));
    // 255 enteros entran, y la pregunta llega recortada por el lado de leer, no por el de escribir.
    expect((await pollOf({ question: 'x'.repeat(255) })).question).toHaveLength(255);
    // Treinta espacios seguidos no son «larga»: son una pregunta vacía. Y la sutileza del `trim()` tardío
    // tiene su orilla: doscientos caben y se niegan por vacíos, trescientos se niegan por largos.
    await expect(call('poll.send', { ...DRAFT, question: ' '.repeat(200) })).rejects.toThrow(tsProperty('noQuestion', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, question: ' '.repeat(300) })).rejects.toThrow(tsProperty('tooLong', pollRefusals));
  });

  it('las opciones: dos orillas del lote, dos orillas de cada una y prohibido repetirse', async () => {
    set(saved);
    await expect(call('poll.send', { ...DRAFT, options: ['sola'] })).rejects.toThrow(tsProperty('batch', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, options: [] })).rejects.toThrow(tsProperty('batch', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, options: Array.from({ length: 13 }, (_, i) => `op${i}`) }))
      .rejects.toThrow(tsProperty('batch', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, options: ['buena', '   '] })).rejects.toThrow(tsProperty('option', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, options: ['buena', 'x'.repeat(101)] })).rejects.toThrow(tsProperty('option', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, options: ['Barcelona', 'barcelona'] })).rejects.toThrow(tsProperty('repeated', pollRefusals));
    // La ronda CF subió el tope de diez a doce, que es lo que Telegram publica («up to 12 options»).
    expect((await pollOf({ options: Array.from({ length: 12 }, (_, i) => `op${i}`) })).options).toHaveLength(12);
  });

  it('el cuestionario exige una respuesta correcta que exista', async () => {
    set(saved);
    await expect(call('poll.send', { ...DRAFT, quiz: true, correct: -1 })).rejects.toThrow(tsProperty('noCorrect', pollRefusals));
    await expect(call('poll.send', { ...DRAFT, quiz: true, correct: 2 })).rejects.toThrow(tsProperty('noCorrect', pollRefusals));
    expect((await pollOf({ quiz: true, correct: 0 })).quiz).toBe(true);
  });

  it('votar marca la opción, sube el total y llena el porcentaje', async () => {
    const row = await send();
    set({ ...saved, messages: [row] });
    expect(await call('poll.answer', { id: row.id, options: [1] })).toBe(true);
    const poll = (snap().messages[0] as Row).poll as Poll;
    expect(poll.totalVoters).toBe(1);
    expect(poll.options[1].chosen).toBe(true);
    expect(poll.options[0].chosen).toBe(false);
    expect(poll.options[1].votes).toBe(1);
    expect(poll.options[1].percentage).toBe(100);
    expect(poll.options[0].percentage).toBe(0);
  });

  it('cambiar el voto no cuenta dos veces y desmarca el anterior', async () => {
    const row = await send();
    set({ ...saved, messages: [row] });
    await call('poll.answer', { id: row.id, options: [0] });
    await call('poll.answer', { id: row.id, options: [1] });
    const poll = (snap().messages[0] as Row).poll as Poll;
    expect(poll.totalVoters).toBe(1);
    expect(poll.options.map(option => option.votes)).toEqual([0, 1]);
    expect(poll.options.map(option => option.chosen)).toEqual([false, true]);
  });

  it('en una de varias respuestas el reparto se mide sobre los votantes y no sobre los votos', async () => {
    const row = await send({ multiple: true, options: ['a', 'b'] });
    set({ ...saved, messages: [row] });
    await call('poll.answer', { id: row.id, options: [0, 1] });
    const poll = (snap().messages[0] as Row).poll as Poll;
    expect(poll.multiple).toBe(true);
    expect(poll.totalVoters).toBe(1);
    // Es la fórmula de TDLib: un votante que eligió las dos sale al 100 en cada una. Repartir un voto entre
    // dos opciones sería inventarse un denominador que Telegram nunca usó.
    expect(poll.options.map(option => option.votes)).toEqual([1, 1]);
    expect(poll.options.map(option => option.percentage)).toEqual([100, 100]);
  });

  it('votar fuera de la conversación activa es como votar un mensaje que no está', async () => {
    const row = await send();
    set({ active: '12', selfId: '1', messages: [row] });
    await expect(call('poll.answer', { id: row.id, options: [0] })).rejects.toThrow(tsProperty('gone', albumRefusals));
    set(saved);
    expect(await call('poll.answer', { id: row.id, options: [0] })).toBe(true);
  });

  it('una fila que no es encuesta y un lote que no es un voto se niegan cada uno por su causa', async () => {
    const row = await send();
    const sinEncuesta = { ...row, id: String(Number(row.id) + 1), poll: undefined };
    set({ ...saved, messages: [row, sinEncuesta] });
    await expect(call('poll.answer', { id: sinEncuesta.id, options: [0] })).rejects.toThrow(tsProperty('noPoll', pollRefusals));
    await expect(call('poll.answer', { id: '999999', options: [0] })).rejects.toThrow(tsProperty('gone', albumRefusals));
    await expect(call('poll.answer', { id: row.id, options: [] })).rejects.toThrow(tsProperty('noVote', pollRefusals));
    await expect(call('poll.answer', { id: row.id, options: Array.from({ length: 13 }, (_, i) => i) }))
      .rejects.toThrow(tsProperty('noVote', pollRefusals));
    await expect(call('poll.answer', { id: row.id, options: [-1] })).rejects.toThrow(tsProperty('noVote', pollRefusals));
    await expect(call('poll.answer', { id: row.id, options: [7] })).rejects.toThrow(tsProperty('stale', pollRefusals));
  });

  it('cerrar se niega con la biblioteca y la lista se niega con el anonimato', async () => {
    const row = await send();
    set({ ...saved, messages: [row] });
    await expect(call('poll.stop', { id: row.id })).rejects.toThrow(tsProperty('noStop', pollRefusals));
    // El borrador de esta pantalla es anónimo, así que `poll.voters` ya no cae en la negativa de esta ronda sino en
    // la regla de Telegram. Lo que devuelve una encuesta pública es asunto de rondaAO.test.ts.
    await expect(call('poll.voters', { id: row.id, option: 0, limit: 50 }))
      .rejects.toThrow(tsProperty('anonymousVoters', pollRefusals));
  });

  it('el voto no borra la encuesta ni toca las demás filas', async () => {
    const first = await send({ question: 'Primera', options: ['a', 'b'] });
    const second = await send({ question: 'Segunda', options: ['c', 'd'] });
    set({ ...saved, messages: [first, second] });
    await call('poll.answer', { id: second.id, options: [0] });
    const rows = snap().messages;
    expect(rows[0].poll?.question).toBe('Primera');
    expect(rows[0].poll?.totalVoters).toBe(0);
    expect(rows[1].poll?.totalVoters).toBe(1);
  });

  it('la vista de diseño arranca sin encuestas: no se inventa una votación', async () => {
    set({ active: '11', selfId: '1' });
    expect(snap().messages.every(row => !row.poll)).toBe(true);
  });
});
