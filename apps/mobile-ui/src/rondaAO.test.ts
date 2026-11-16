import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const pollRules = text('../../desktop/src/WRGram.Desktop/DesktopPoll.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const stateFile = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const preview = text('./preview.ts');
const panels = text('./BatchPanels.tsx');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const session = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
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

/** El literal de una constante de TypeScript declarada con `=` y no dentro de un objeto. */
function tsConst(name: string, from = preview): string {
  const match = new RegExp(`\\b${name} = '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
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

/** El trozo de un archivo Java que es un método, desde su firma hasta la llave que lo cierra. */
function javaBody(name: string, from = java): string {
  const start = from.search(new RegExp(`(?:private|String) [^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
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
// La negativa del mensaje que ya no está es la del álbum, referenciada: en el espejo no hay dos frases que defender.
const albumRefusals = /const ALBUM_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

/** Las cuatro frases que la lista de votantes pronuncia, con dónde nacieron. */
const VOTER_REFUSALS: [string, string, 'java' | 'aquí'][] = [
  ['noPoll', 'NoPoll', 'java'],
  ['noOption', 'NoOption', 'aquí'],
  ['anonymousVoters', 'AnonymousVoters', 'aquí'],
  ['firstPage', 'OnlyFirstPage', 'aquí'],
];

describe('ronda AO · la lista de votantes habla en las tres capas', () => {
  it('los tres nombres de votante son literales de TdSession.senderName', () => {
    const body = javaBody('senderName', session);
    for (const name of ['VoterSelf', 'VoterUnknown', 'VoterUnknownChat']) {
      const sentence = csSentence(name);
      expect(body).toContain(`"${sentence}"`);
      // Y cada uno se escribe una sola vez en cada capa: dos sitios para la misma palabra es una palabra que se
      // va a desfasar.
      expect(count(`"${sentence}"`, pollRules)).toBe(1);
    }
    expect(tsConst('VOTER_SELF')).toBe(csSentence('VoterSelf'));
    // Y en el espejo no hay ni una fila de nombre ajeno: el andamio jamás ha visto votar a nadie más que a esta
    // cuenta, así que los dos nombres de relleno vivirían sin nadie que los pronuncie. Están contados con comillas
    // angulares en el comentario y entre comillas rectas no aparecen.
    expect(preview).not.toContain('VOTER_UNKNOWN');
    for (const source of [preview]) {
      expect(count(`'${csSentence('VoterUnknown')}'`, source)).toBe(0);
      expect(count(`'${csSentence('VoterUnknownChat')}'`, source)).toBe(0);
    }
    expect(preview).toContain('«Usuario de Telegram» y «Conversación»');
    // El puente no copia los literales en su cuerpo: los pregunta a la clase de reglas.
    expect(count('"Tú"', service)).toBe(0);
    expect(count('"Usuario de Telegram"', service)).toBe(0);
  });

  it.each(VOTER_REFUSALS)('«%s» está en las dos capas de este cliente', (key, name, origin) => {
    const sentence = csSentence(name);
    expect(tsProperty(key, pollRefusals)).toBe(sentence);
    expect(count(sentence, preview)).toBe(1);
    expect(count(`"${sentence}"`, service)).toBe(0);
    if (origin === 'java') expect(javaBody('pollVoters')).toContain(`"${sentence}"`);
    else expect(java).not.toContain(sentence);
  });

  it('la negativa de la opción es la que Android lanza sin mensaje', () => {
    const body = javaBody('pollVoters');
    expect(body).toContain('int option=p.optInt("option",-1);if(option<0)throw new IllegalArgumentException();');
    // Un `IllegalArgumentException()` pelado no deja frase que copiar, así que la de aquí es la causa nombrada.
    expect(body).not.toContain(csSentence('NoOption'));
    expect(pollRules).toContain('IllegalArgumentException()</c> sin mensaje');
  });

  it('el anonimato es una regla de Telegram y no un hueco del puente', () => {
    expect(csSentence('AnonymousVoters')).toContain('anónima');
    // La misma regla ya decide la bandera que apaga el botón, y las dos viven en la misma clase.
    expect(csBody('CanGetVoters', pollRules)).toContain('=> !IsAnonymous(poll)');
    expect(snapshot).toContain('.put("canGetVoters",poll.canGetVoters)');
    expect(panels).toContain('disabled={pending||!poll.canGetVoters}');
    // En Android no hay frase: ni lo comprueba el puente, porque TDLib no tiene votantes que devolver.
    expect(javaBody('pollVoters')).not.toContain('anónim');
  });

  it('la paginación está contada como divergencia y no como olvido', () => {
    // TDLib salta un número de votantes; MTProto espera el cursor opaco que él devolvió en `next_offset`.
    expect(javaBody('pollVoters')).toContain('perform(new TdApi.GetPollVoters(message.chatId,message.id,option,offset,limit)');
    expect(pollRules).toContain('next_offset');
    expect(csSentence('OnlyFirstPage')).toContain('primera página');
    // Y este puente no reparte cursores: la respuesta no tiene campo por donde entregarlos.
    expect(stateFile).not.toContain('NextOffset');
  });

  it('el conjunto de negaciones de la encuesta es el que está escrito, sin claves sueltas', () => {
    const keys = [...pollRefusals.matchAll(/^ {2}(\w+):/gm)].map(match => match[1]).sort();
    expect(keys).toEqual([
      'anonymousVoters', 'batch', 'closed', 'firstPage', 'gone', 'noCorrect', 'noOption', 'noPoll', 'noQuestion',
      'noStop', 'noVote', 'notAllowed', 'option', 'private', 'repeated', 'sending', 'stale', 'tooLong',
    ]);
    // La negativa que decía que el cable faltaba ya no está en ninguna capa: borrarla era parte de conectarlo.
    expect(preview).not.toContain('noVoters');
    expect(pollRules).not.toContain('NoVoters');
  });
});

describe('ronda AO · el orden de las negativas es el del puente', () => {
  it('Android niega en tres pasos y el puente respeta esos tres', () => {
    const body = javaBody('pollVoters');
    const order = [
      'TdApi.Message message=message(p);',
      'if(!(message.content instanceof TdApi.MessagePoll))',
      'int option=p.optInt("option",-1)',
      'perform(new TdApi.GetPollVoters(',
    ];
    for (const [index, needle] of order.entries()) {
      expect(body).toContain(needle);
      if (index > 0) expect(at(needle, body)).toBeGreaterThan(at(order[index - 1], body));
    }
  });

  it('el puente añade dos lecturas que TDLib hacía por dentro, y en el orden dicho', () => {
    const code = csBody('PollVotersAsync');
    const order = [
      'var page = await client.GetMessages',
      'if (row == null) throw new BridgeException(DesktopPoll.Gone);',
      'if (row.media is not MessageMediaPoll { poll: { } poll }) throw new BridgeException(DesktopPoll.NoPoll);',
      'if (option < 0) throw new BridgeException(DesktopPoll.NoOption);',
      'if (DesktopPoll.IsAnonymous(poll)) throw new BridgeException(DesktopPoll.AnonymousVoters);',
      'if (Long(args, "offset") > 0) throw new BridgeException(DesktopPoll.OnlyFirstPage);',
      'var keys = DesktopPoll.KeysFor(poll, new[] { option });',
      'if (keys == null) throw new BridgeException(DesktopPoll.Stale);',
      'await client.Messages_GetPollVotes(entry.Input, (int)id, limit, option: keys[0]);',
      'MergePeers(votes.users?.Values, votes.chats?.Values);',
    ];
    for (const needle of order) expect(code).toContain(needle);
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
    }
  });

  it('la clave opaca es lo que se pregunta, otra vez después de leer la fila', () => {
    // Es la regla de la ronda AH aplicada a la lectura: el índice que la pantalla toca no es lo que MTProto entiende.
    const code = csBody('PollVotersAsync');
    expect(at('client.GetMessages', code)).toBeLessThan(at('client.Messages_GetPollVotes', code));
    expect(code).toContain('option: keys[0]');
    expect(code).not.toContain('option: option.ToString');
  });

  it('el espejo niega en el mismo orden que el puente', () => {
    const code = tsBody('desktopPollVoters');
    const order = ['POLL_REFUSALS.gone', 'POLL_REFUSALS.noPoll', 'POLL_REFUSALS.noOption',
      'POLL_REFUSALS.anonymousVoters', 'POLL_REFUSALS.firstPage', 'POLL_REFUSALS.stale'];
    for (const needle of order) expect(code).toContain(needle);
    for (const [index, needle] of order.entries()) {
      if (index > 0) expect(at(needle, code)).toBeGreaterThan(at(order[index - 1], code));
    }
  });
});

describe('ronda AO · es una lectura y se comprueba que lo sea', () => {
  it('el cuerpo no puede escribir en ninguna de las cuatro capas', () => {
    const code = csBody('PollVotersAsync');
    for (const forbidden of ['ReadHistory', 'UploadFileAsync', 'SendMultiMedia', 'SendMedia', 'SendVote',
      'DropOutbox', 'DeleteFolder', '_historyDirty', '_dialogsDirty', '_state.Sending', '_state.Uncertain', 'Push()']) {
      expect(code, forbidden).not.toContain(forbidden);
    }
  });

  it('las tres orillas del tope son las de Android', () => {
    expect(javaBody('pollVoters')).toContain('int limit=Math.max(1,Math.min(50,p.optInt("limit",50)))');
    const body = csBody('VoterLimit', pollRules);
    expect(body).toContain('Math.Clamp(limit, 1, MaxVoters)');
    expect(Number(/MaxVoters = (\d+)/.exec(pollRules)?.[1])).toBe(50);
    expect(preview).toContain('POLL_MAX_VOTERS = 50');
    expect(tsBody('desktopPollVoters')).toContain('Math.max(1, Math.min(POLL_MAX_VOTERS, requested))');
    // Y la pantalla nace ya con el tope puesto, que es por lo que nunca llega un offset.
    expect(panels).toContain("'poll.voters',{id:messageId,option,limit:50}");
  });

  it('lo que devuelve el puente son los dos campos de siempre y la fecha en segundos', () => {
    expect(javaBody('pollVoters')).toContain('object("name",session.senderName(voter.voterId),"date",voter.date)');
    expect(javaBody('pollVoters')).toContain('object("total",result.totalCount,"items",items)');
    const dto = /public sealed class PollVotersDto\n\{([\s\S]*?)\n\}/.exec(stateFile)?.[1] ?? '';
    const fields = [...dto.matchAll(/public [\w?<>\[\]]+ (\w+) \{ get; set; \}/g)].map(match => match[1]);
    expect(fields.sort()).toEqual(['Items', 'Total']);
    expect(stateFile).toContain('public sealed class PollVoterDto');
    // La pantalla multiplica la fecha por 1000: si viajara como `DateTime` serializado, la lista saldría en 1970.
    expect(panels).toContain('new Date(voter.date*1000)');
  });

  it('la lista viene en subtipos y la clase base no dice ni quién ni cuándo', () => {
    const body = csBody('VoterOf', pollRules);
    for (const subtype of ['MessagePeerVote single', 'MessagePeerVoteMultiple many', 'MessagePeerVoteInputOption legacy'])
      expect(body).toContain(subtype);
    // Sin ese descarte el puente no compilaría: `vote.peer` no existe en la clase base.
    expect(csBody('PollVotersAsync')).not.toContain('vote.peer');
    expect(csBody('PollVotersAsync')).toContain('DesktopPoll.VoterOf(vote)');
    expect(body).toContain('_ => (null, default)');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Voter = { name: string; date: number };
type Row = {
  id: string; text: string; chatId: string; outgoing: boolean;
  poll?: {
    question: string; totalVoters: number; anonymous: boolean; multiple: boolean; canGetVoters: boolean;
    options: { index: number; text: string; votes: number; chosen: boolean }[];
  };
};
type Snap = { active: string; selfId: string; canSend: boolean; messages: Row[] };
type List = { total: number; items: Voter[] };

const DRAFT = {
  question: '¿Qué probamos primero?', options: ['La barra nueva', 'Los temas', 'Ninguna'],
  quiz: false, anonymous: false, multiple: false, revoting: true, hide: false, explanation: '', correct: -1,
};

describe('ronda AO · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', selfId: '', canSend: true, messages: [] });
  const set = (patch: Partial<Snap>) => transport.acceptState({ ...snap(), ...patch } as never);
  const saved = { active: '1', selfId: '1' };

  /** Envía una encuesta pública en «Mensajes guardados» y devuelve la burbuja. */
  const send = async (patch: Record<string, unknown> = {}) => {
    set(saved);
    expect(await call('poll.send', { ...DRAFT, ...patch })).toBe(true);
    return snap().messages.at(-1) as Row;
  };
  /** Manda la encuesta, vota lo que se le diga y deja la conversación abierta con esa burbuja. */
  const withVotes = async (options: number[], patch: Record<string, unknown> = {}) => {
    const row = await send(patch);
    set({ ...saved, messages: [row] });
    if (options.length > 0) expect(await call('poll.answer', { id: row.id, options })).toBe(true);
    return snap().messages[0] as Row;
  };
  const voters = async (row: Row, option: number, extra: Record<string, unknown> = {}) =>
    await call('poll.voters', { id: row.id, option, limit: 50, ...extra }) as List;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('sin votos no hay nombres, pero el total coincide con el botón de la tarjeta', async () => {
    const row = await withVotes([]);
    expect(row.poll?.options[0].votes).toBe(0);
    expect(await voters(row, 0)).toEqual({ total: 0, items: [] });
  });

  it('votar nos mete en la lista con nuestra propia hora', async () => {
    const before = Math.floor(Date.now() / 1000);
    const row = await withVotes([1]);
    const after = Math.floor(Date.now() / 1000);
    const list = await voters(row, 1);
    expect(list.total).toBe(1);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].name).toBe(tsConst('VOTER_SELF'));
    expect(list.items[0].date).toBeGreaterThanOrEqual(before);
    expect(list.items[0].date).toBeLessThanOrEqual(after);
    // Las demás opciones siguen sin nombres: una votación nuestra no reparte la lista.
    expect(await voters(row, 0)).toEqual({ total: 0, items: [] });
    expect(await voters(row, 2)).toEqual({ total: 0, items: [] });
  });

  it('cambiar el voto borra la marca anterior en vez de acumular dos horas', async () => {
    const first = await withVotes([0]);
    expect((await voters(first, 0)).items).toHaveLength(1);
    expect(await voters(first, 1)).toEqual({ total: 0, items: [] });
    const row = await withVotes([1]);
    expect((await voters(row, 1)).items).toHaveLength(1);
    // La opción que dejamos tiene el recuento a cero y, con él, la lista vacía: las dos cifras se sostienen.
    expect(await voters(row, 0)).toEqual({ total: 0, items: [] });
  });

  it('en una de varias respuestas aparecemos en cada opción que tocamos', async () => {
    const row = await withVotes([0, 2], { multiple: true });
    expect(row.poll?.multiple).toBe(true);
    expect(row.poll?.totalVoters).toBe(1);
    expect((await voters(row, 0)).total).toBe(1);
    expect((await voters(row, 2)).total).toBe(1);
    expect(await voters(row, 1)).toEqual({ total: 0, items: [] });
  });

  it('una encuesta anónima se niega con la regla de Telegram', async () => {
    const row = await withVotes([0], { anonymous: true });
    expect(row.poll?.canGetVoters).toBe(false);
    await expect(voters(row, 0)).rejects.toThrow(tsProperty('anonymousVoters', pollRefusals));
  });

  it('el resto de negativas, cada una por su causa', async () => {
    const row = await withVotes([0]);
    const sinEncuesta = { ...row, id: String(Number(row.id) + 1), poll: undefined };
    set({ ...saved, messages: [row, sinEncuesta] });
    await expect(call('poll.voters', { id: sinEncuesta.id, option: 0 })).rejects.toThrow(tsProperty('noPoll', pollRefusals));
    await expect(call('poll.voters', { id: '999999', option: 0 })).rejects.toThrow(tsProperty('gone', albumRefusals));
    await expect(call('poll.voters', { id: row.id })).rejects.toThrow(tsProperty('noOption', pollRefusals));
    await expect(call('poll.voters', { id: row.id, option: -1 })).rejects.toThrow(tsProperty('noOption', pollRefusals));
    await expect(call('poll.voters', { id: row.id, option: 'dos' })).rejects.toThrow(tsProperty('noOption', pollRefusals));
    await expect(call('poll.voters', { id: row.id, option: 9 })).rejects.toThrow(tsProperty('stale', pollRefusals));
    await expect(call('poll.voters', { id: row.id, option: 0, offset: 50 }))
      .rejects.toThrow(tsProperty('firstPage', pollRefusals));
  });

  it('un desplazamiento negativo no es otra página: Android lo aplaina a cero, aquí igual', async () => {
    const row = await withVotes([0]);
    expect((await voters(row, 0, { offset: -10 })).items).toHaveLength(1);
  });

  it('leer la lista no mueve nada: ni historial, ni recuentos, ni filas', async () => {
    const row = await withVotes([1]);
    const antes = JSON.stringify(snap().messages);
    expect((await voters(row, 1)).items).toHaveLength(1);
    expect((await voters(row, 0)).items).toHaveLength(0);
    expect(JSON.stringify(snap().messages)).toBe(antes);
  });

  it('la lista es de la conversación activa, como el voto', async () => {
    const row = await withVotes([0]);
    set({ active: '12', selfId: '1', messages: [row] });
    await expect(voters(row, 0)).rejects.toThrow(tsProperty('gone', albumRefusals));
    set(saved);
    expect((await voters(row, 0)).items).toHaveLength(1);
  });

  it('el tope no inventa ni recorta: con 1 cabemos y con 1000 también', async () => {
    const row = await withVotes([0]);
    const conocidos = (await voters(row, 0)).items;
    expect(conocidos).toHaveLength(1);
    // Un andamio solo conoce nuestro voto, así que ningún tope puede recortar nada. Lo que se comprueba es que
    // ninguno de los tres valores —1, 0 y 1000— cambie el total ni borre la fila que sí existe.
    for (const limit of [1, 0, 1000, 'muchos'])
      expect(await voters(row, 0, { limit })).toEqual({ total: 1, items: conocidos });
  });

  it('dos encuestas de la misma conversación no comparten votantes', async () => {
    set(saved);
    const first = await send({ question: 'Primera' });
    const second = await send({ question: 'Segunda' });
    set({ ...saved, messages: [first, second] });
    await call('poll.answer', { id: second.id, options: [0] });
    const rows = snap().messages;
    expect(await voters(rows[0], 0)).toEqual({ total: 0, items: [] });
    expect((await voters(rows[1], 0)).items).toHaveLength(1);
  });

  it('el puente atiende la orden y el andamio también: la negativa de la ronda AN no vuelve', () => {
    expect(service).toContain('"poll.voters" => await PollVotersAsync(args)');
    expect(preview).toContain("method === 'poll.voters' && state.platform === 'desktop'");
    expect(preview).toContain('return desktopPollVoters(params, state)');
    // Fuera de escritorio la orden sigue cayendo en la negativa sintética, que es la regla de siempre: el brazo
    // propio está atado a la plataforma y antes del `throw` de la vista.
    expect(at("method === 'poll.voters'", preview)).toBeLessThan(at("throw new Error('Vista sintética", preview));
  });
});
