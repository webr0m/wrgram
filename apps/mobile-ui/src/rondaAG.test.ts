import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const reactRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageReact.cs');
const flow = text('../../desktop/src/WRGram.Desktop/DesktopMessageReactFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const dto = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que una capa asigna a una constante en C# (`const string`). */
function csSentence(name: string, from = reactRules): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** La cadena que `preview.ts` asigna a una propiedad del objeto de frases, cortado por su llave de cierre. */
function tsProperty(object: string, key: string): string {
  const start = preview.indexOf(`const ${object} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${object}`);
  const block = preview.slice(start, preview.indexOf('\n};', start));
  const match = new RegExp(`\\b${key}: '((?:[^'\\\\]|\\\\.)*)'`).exec(block);
  if (!match) throw new Error(`Falta ${key} en ${object}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, source: string) => source.split(needle).length - 1;

describe('ronda AG · la negativa que esta ronda escribió la desmontó la sonda de la BX', () => {
  it('la petición existe en la librería, y el brazo la llama', () => {
    // La ronda AG negó las tres escrituras con «la biblioteca de escritorio no incluye la petición para enviar
    // reacciones». La sonda, compilada contra WTelegramClient 4.4.10, midió lo contrario: lo que no existe son los
    // nombres jubilados que se buscaron. La escrita hoy es `messages.sendReaction`.
    expect(flow).toContain('await client.Messages_SendReaction(entry.Input, ids[0], set, big: false, add_to_recent: true);');
    expect(reactRules).toContain('Client.Messages_SendReaction(');
    expect(reactRules).toContain('TL.ReactionEmoji.emoticon');
    expect(reactRules).toContain('TL.ReactionCustomEmoji.document_id');
    // Y la frase con la que se mentía ya no está declarada en ninguna de las dos capas.
    expect(reactRules).not.toMatch(/public const string Refused\b/);
    expect(preview).not.toMatch(/\bREACT_REFUSAL\b/);
  });

  it('las dos escrituras tienen brazo vivo, y la de pago se niega con su causa antes del genérico', () => {
    const arm = '"message.react" or "message.react.custom" => await ReactAsync(args, method == "message.react.custom"),';
    const paid = '"message.react.paid" => throw new BridgeException(DesktopMessageReact.PaidRefused),';
    expect(count(arm, service)).toBe(1);
    expect(count(paid, service)).toBe(1);
    // El genérico está por debajo: si alguna mañana se mueve, la guarda lo ve.
    expect(service.indexOf(arm)).toBeLessThan(service.indexOf('_ => throw new BridgeException($"No disponible en escritorio (beta)'));
  });

  it('son métodos que el puente ya conoce, así que no nacen huérfanos', () => {
    for (const method of ['message.react', 'message.react.custom', 'message.react.paid']) {
      expect(policy).toContain(`"${method}"`);
    }
  });

  it('el properties de Windows ya no devuelve la bandeja vacía, y dice la cara que sigue negada', () => {
    const props = csBody('PropertiesAsync');
    expect(props).toContain('var band = entry == null || _client is not Client client ? new List<object>() : await ReactionBandAsync(entry, client, message);');
    expect(props).toContain('reactions = band,');
    // La de Stars sigue negada porque gasta saldo sin cartera conectada. La ✨ la encendió la ronda CD con la bandera
    // Premium de la sesión, la misma que `DesktopEmojiCatalog` usa para avisar antes de guardar un estado emoji.
    expect(props).toContain('paid = false,');
    expect(props).toContain('allowCustom = customReaction');
    expect(reactRules).not.toContain('public static readonly string[] None = [];');
  });

  it('y lo que la sonda negó no vuelve a aparecer como si existiera', () => {
    // En el transporte, no en la prosa: los nombres imposibles solo pueden estar en los comentarios.
    for (const name of ['Messages_SetReactions', 'TypeReactionEmoji', 'CallRpcAsync']) {
      const outsideComments = [service, flow]
        .join('\n')
        .split('\n')
        .filter(line => !line.trim().startsWith('//') && !line.trim().startsWith('///'))
        .join('\n');
      expect(outsideComments).not.toContain(name);
    }
  });
});

describe('ronda AG · leer reacciones sí existe, y ahora llega en directo', () => {
  it('el host mira el aviso de Telegram en el despacho de actualizaciones', () => {
    expect(service).toContain('case UpdateMessageReactions reactions:');
    expect(service).toContain('OnReactions(reactions);');
  });

  it('reescribe la fila entera, porque el aviso trae la cuenta total', () => {
    const body = csBody('OnReactions');
    expect(body).toContain('var chatId = ChatIdOf(update.peer);');
    expect(body).toContain('message.ChatId == chatId && message.Id == update.msg_id.ToString()');
    expect(body).toContain('message.Reactions = ConvertReactions(update.reactions);');
    expect(body).not.toContain('Add(');
  });

  it('el tema de un foro sigue sin usarse, dicho junto al método', () => {
    const start = service.indexOf('private void OnReactions');
    const doc = service.slice(service.lastIndexOf('/// <summary>', start), start);
    expect(doc).toContain('top_msg_id');
    expect(doc).toContain('messages.getMessageReactionsList');
  });

  it('la lectura convierte los dos tipos que Telegram manda', () => {
    const convert = csBody('ConvertReactions');
    expect(convert).toContain('case ReactionEmoji emoji:');
    expect(convert).toContain('case ReactionCustomEmoji custom:');
    expect(convert).toContain('Chosen = result.chosen_order != 0');
  });

  it('la fila del puente trae sus fichas desde la conversión', () => {
    expect(service).toContain('dto.Reactions = ConvertReactions(message.reactions);');
    expect(dto).toMatch(/Reactions\s*\{\s*get;\s*set;\s*\}/);
  });
});

describe('ronda AG · el espejo dice lo mismo que el puente', () => {
  it('las seis frases del andamio son idénticas carácter a carácter a las del .cs', () => {
    for (const [key, constant] of [['noEmoji', 'NoEmoji'], ['notOffered', 'NotOffered'], ['needsPremium', 'NeedsPremium'],
      ['noCustom', 'NoCustomEmoji'], ['notPremium', 'NotPremiumAccount'], ['paid', 'PaidRefused']] as const) {
      expect(tsProperty('REACT_REFUSALS', key), key).toBe(csSentence(constant));
    }
  });

  it('las tres ramas entran por la puerta de la plataforma', () => {
    expect(count("if (method === 'message.react' && state.platform === 'desktop') return desktopReact(params, state, false);", preview)).toBe(1);
    expect(count("if (method === 'message.react.custom' && state.platform === 'desktop') return desktopReact(params, state, true);", preview)).toBe(1);
    expect(count("if (method === 'message.react.paid' && state.platform === 'desktop') throw new Error(REACT_REFUSALS.paid);", preview)).toBe(1);
  });

  it('en la vista de diseño las fichas del chat de arranque existen de verdad', () => {
    expect(preview).toContain('const BOOT_REACTIONS: Message[\'reactions\'] = [');
    expect(preview).toContain('reactions:BOOT_REACTIONS');
    // Una sin elegir y otra elegida: las dos direcciones del gesto, no solo la de poner.
    expect(preview).toContain("{ emoji: '👍', count: 3, chosen: false },");
    expect(preview).toContain("{ emoji: '❤️', count: 1, chosen: true },");
  });

  it('la banda la pintan las dos capas, desde una sola función', () => {
    // Antes la pantalla tapaba el selector en Windows porque ninguna de las dos capas sabía escribir. La BX conecta
    // la escritura, así que la banda sale de `reactionBar`, definida una vez antes de las dos ramas de la plataforma.
    const menu = app.slice(app.indexOf('async function messageMenu'));
    const bar = menu.indexOf('const reactionBar=(props:Properties,act:');
    const branch = menu.indexOf('if(desktop){');
    const android = menu.indexOf('const owner=state.selfId,topic=state.topic?.id;');
    expect(bar).toBeGreaterThan(-1);
    expect(branch).toBeGreaterThan(bar);
    expect(android).toBeGreaterThan(branch);
    expect(menu.slice(branch, android)).toContain('{props.reactions.length>0&&reactionBar(props,act)}');
    expect(menu.slice(android)).toContain('{reactionBar(props,act)}');
    expect(count('const reactionBar=(props:Properties,act:', app)).toBe(1);
    // Las dos bandas que se pintan: la compartida del menú y la del visor de historias, que escribe por
    // `story.react` y no por `message.react`.
    expect(count('className="reaction-picker"', app)).toBe(2);
    expect(preview).toContain('reactions: [],');
  });

  it('y el menú de Android por fin contesta algo: sin properties, el andamio no abría ni la banda', () => {
    expect(preview).toContain("if (method === 'message.properties') return designProperties(String(params.id), state);");
    expect(preview).toContain('reactions: DESIGN_REACTIONS, paid: false, allowCustom: false,');
    // Los ocho de la banda no son un capricho: `rowSize=8` es lo que el puente pide. Desde la ronda BV el
    // muestrario del andamio ya no cabe en ocho: dieciséis libres más dos de Premium, que es lo que se ve al
    // abrir «Ver todas», y la pantalla recorta la banda a los ocho de arriba con `slice(0,8)`.
    expect(java).toContain('reactions.rowSize=8');
    expect(preview).toMatch(/const DESIGN_REACTIONS: ReactionOption\[\] = \[[^\]]*\]/);
    const list = /const DESIGN_REACTIONS: ReactionOption\[\] = \[([^\]]*)\]/.exec(preview)![1];
    expect(list.split(',').length).toBe(14);
    expect(app).toContain('props.reactions.slice(0,8)');
  });

  it('y tocar una ficha manda la orden que el puente ya conoce', () => {
    expect(app).toContain("void run('message.react',{id:message.id,emoji:reaction.emoji,remove:reaction.chosen})");
    expect(app).toContain("void run('message.react.custom',{id:message.id,emoji:reaction.customEmojiId,remove:reaction.chosen})");
    expect(app).toContain("void run('message.react.paid',{id:message.id,count:String(count)})");
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string; reactions: { emoji: string; count: number; chosen: boolean }[] };
type Snap = { messages: Row[] };

describe('ronda AG · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let snap: () => Snap = () => ({ messages: [] });

  const row = (id: string) => snap().messages.find(item => item.id === id)!;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('tocar una ficha en Windows escribe: la cuenta sube y la ficha queda marcada', async () => {
    expect(await call('message.react', { id: '101', emoji: '👍' })).toBe(true);
    const band = row('101').reactions;
    expect(band.find(item => item.emoji === '👍')).toMatchObject({ count: 4, chosen: true });
    // La otra no se borra: MTProto manda el conjunto completo, y mandar solo la nueva borraría la puesta.
    expect(band.find(item => item.emoji === '❤️')).toMatchObject({ count: 1, chosen: true });
  });

  it('quitar la que estaba puesta baja su cuenta y deja la otra intacta', async () => {
    expect(await call('message.react', { id: '101', emoji: '❤️', remove: true })).toBe(true);
    expect(row('101').reactions.find(item => item.emoji === '❤️')).toMatchObject({ count: 0, chosen: false });
    expect(row('101').reactions.find(item => item.emoji === '👍')).toMatchObject({ count: 3, chosen: false });
  });

  it('la de pago y la personalizada sin Premium se niegan con su causa, no con el genérico', async () => {
    await expect(call('message.react.paid', { id: '101', count: '5' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'paid'));
    await expect(call('message.react.custom', { id: '101', emoji: '1234' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'notPremium'));
    await expect(call('message.react', { id: '101', emoji: '' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'noEmoji'));
    await expect(call('message.react', { id: '101', emoji: '🍑' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'notOffered'));
    await expect(call('message.react', { id: '101', emoji: '🫶' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'needsPremium'));
  });

  it('negar no escribe: las fichas siguen exactamente como estaban', async () => {
    const before = JSON.stringify(row('101').reactions);
    for (const params of [{ emoji: '' }, { emoji: '🍑' }, { emoji: '🫶' }]) {
      await call('message.react', { id: '101', ...params }).then(
        () => Promise.reject(new Error('debería haberse negado')),
        () => undefined,
      );
    }
    expect(JSON.stringify(row('101').reactions)).toBe(before);
  });

  it('el properties de Windows ya ofrece la bandeja, sin las fichas que esta cuenta tiene puestas', async () => {
    const props = await call('message.properties', { id: '101' }) as { reactions: { emoji: string }[]; paid: boolean; allowCustom: boolean };
    expect(props.reactions.length).toBeGreaterThan(0);
    expect(props.reactions.some(item => item.emoji === '❤️')).toBe(false);
    expect(props.reactions.some(item => item.emoji === '👍')).toBe(true);
    expect(props).toMatchObject({ paid: false, allowCustom: false });
    expect(row('101').reactions).toHaveLength(2);
  });

  it('fuera de Windows la orden sigue cayendo en su negativa de siempre', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    // La banda existe y trae fichas: eso es lo que en Windows no se pinta, y es la diferencia que la ronda
    // AG quería poder señalar con el ratón en las dos capas. Desde la BV la lista del chat sigue después de
    // las ocho de la banda, así que se compara lo que la pantalla pinta sin tocar el «+».
    const props = await call('message.properties', { id: '101' }) as { reactions: { kind: string; emoji?: string }[]; paid: boolean; allowCustom: boolean };
    expect({ ...props, reactions: props.reactions.slice(0, 8) }).toMatchObject({ reactions: ['👍', '❤️', '🔥', '👏', '🎉', '✅', '👀', '🙏'].map(emoji => ({ kind: 'emoji', emoji })), paid: false, allowCustom: false });
    await expect(call('message.react', { id: '101', emoji: '👍' })).rejects.toThrow(
      'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
    );
  });
});
