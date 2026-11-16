import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const reactRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageReact.cs');
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

/** El literal de una constante de TypeScript (`const X = '...'`), que en el espejo va suelto. */
function tsSentence(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*\\n?\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
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

describe('ronda AG · la negativa dice lo que falta, no que falta el cable', () => {
  it('la frase del puente nombra la petición que la biblioteca no tiene', () => {
    const refused = csSentence('Refused');
    expect(refused).toContain('la petición para enviar reacciones');
    // Que la causa escrita sea la de verdad, y no un «no está conectado»: la sonda compilada contra
    // WTelegramClient 4.4.10 dijo que `messages.setReactions` y la unión `TypeReaction` no existen.
    expect(reactRules).toContain('messages.setReactions');
    expect(reactRules).toContain('TypeReaction');
    expect(reactRules).toContain('Client.CallRpcAsync');
  });

  it('las tres escrituras se niegan antes del genérico de escritorio', () => {
    const arm = '"message.react" or "message.react.custom" or "message.react.paid" => throw new BridgeException(DesktopMessageReact.Refused),';
    expect(count(arm, service)).toBe(1);
    // El genérico está por debajo: si alguna mañana se mueve, la guarda lo ve.
    expect(service.indexOf(arm)).toBeLessThan(service.indexOf('_ => throw new BridgeException($"No disponible en escritorio (beta)'));
  });

  it('son métodos que el puente ya conoce, así que no nacen huérfanos', () => {
    for (const method of ['message.react', 'message.react.custom', 'message.react.paid']) {
      expect(policy).toContain(`"${method}"`);
    }
  });

  it('el selector de escritorio no promete fichas que no se pueden poner', () => {
    const props = csBody('Properties');
    expect(props).toContain('reactions = DesktopMessageReact.None,');
    expect(props).toContain('paid = false,');
    expect(props).toContain('allowCustom = false');
    expect(reactRules).toContain('public static readonly string[] None = [];');
  });

  it('y lo que la sonda negó no vuelve a aparecer como si existiera', () => {
    // En el transporte, no en la prosa: los nombres imposibles solo pueden estar en los comentarios.
    for (const name of ['Messages_SetReactions', 'TypeReactionEmoji', 'CallRpcAsync']) {
      const outsideComments = service
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
  it('la frase del andamio es idéntica carácter a carácter a la del .cs', () => {
    expect(tsSentence('REACT_REFUSAL')).toBe(csSentence('Refused'));
  });

  it('las tres ramas entran por la puerta de la plataforma', () => {
    for (const method of ['message.react', 'message.react.custom', 'message.react.paid']) {
      expect(count(`if (method === '${method}' && state.platform === 'desktop') throw new Error(REACT_REFUSAL);`, preview)).toBe(1);
    }
  });

  it('en la vista de diseño las fichas del chat de arranque existen de verdad', () => {
    expect(preview).toContain('const BOOT_REACTIONS: Message[\'reactions\'] = [');
    expect(preview).toContain('reactions:BOOT_REACTIONS');
    // Una sin elegir y otra elegida: las dos direcciones del gesto, no solo la de poner.
    expect(preview).toContain("{ emoji: '👍', count: 3, chosen: false },");
    expect(preview).toContain("{ emoji: '❤️', count: 1, chosen: true },");
  });

  it('la banda de emojis la pinta solo la capa que puede escribir', () => {
    const desktop = app.split('async function messageMenu')[1].split('});return;')[0];
    expect(desktop).toContain('if(desktop){');
    expect(desktop).not.toContain('reaction-picker');
    // Las dos bandas que sí existen: la del menú de Android y la del visor de historias, que escribe por
    // `story.react` y no por `message.react`.
    expect(count('className="reaction-picker"', app)).toBe(2);
    expect(preview).toContain('reactions: [],');
  });

  it('y el menú de Android por fin contesta algo: sin properties, el andamio no abría ni la banda', () => {
    expect(preview).toContain("if (method === 'message.properties') return designProperties(String(params.id), state);");
    expect(preview).toContain('reactions: DESIGN_REACTIONS, paid: false, allowCustom: false,');
    // Los ocho no son un capricho: `rowSize=8` es lo que el puente pide, y `emojis()` corta en 16.
    expect(java).toContain('reactions.rowSize=8');
    expect(preview).toMatch(/const DESIGN_REACTIONS = \[[^\]]*\];/);
    const list = /const DESIGN_REACTIONS = \[([^\]]*)\];/.exec(preview)![1];
    expect(list.split(',').length).toBe(8);
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

  it('tocar una ficha en Windows se niega con la causa, no con el genérico', async () => {
    await expect(call('message.react', { id: '101', emoji: '👍' })).rejects.toThrow(
      'La biblioteca de escritorio no incluye la petición para enviar reacciones, así que aquí se pueden ver pero no poner.',
    );
    await expect(call('message.react', { id: '101', emoji: '❤️', remove: true })).rejects.toThrow(tsSentence('REACT_REFUSAL'));
  });

  it('las otras dos escrituras, con la misma frase', async () => {
    const refused = tsSentence('REACT_REFUSAL');
    await expect(call('message.react.custom', { id: '101', emoji: '1234', remove: false })).rejects.toThrow(refused);
    await expect(call('message.react.paid', { id: '101', count: '5' })).rejects.toThrow(refused);
  });

  it('negar no escribe: las fichas siguen exactamente como estaban', () => {
    const before = JSON.stringify(row('101').reactions);
    return call('message.react', { id: '101', emoji: '👍' })
      .then(() => Promise.reject(new Error('debería haberse negado')))
      .catch(error => {
        expect(String(error)).toContain('La biblioteca de escritorio');
        expect(JSON.stringify(row('101').reactions)).toBe(before);
      });
  });

  it('el properties de escritorio no ofrece el selector, y eso no tapa las fichas de la fila', async () => {
    expect(await call('message.properties', { id: '101' })).toMatchObject({ reactions: [] });
    expect(row('101').reactions).toHaveLength(2);
  });

  it('fuera de Windows la orden sigue cayendo en su negativa de siempre', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    // La banda existe y trae fichas: eso es lo que en Windows no se pinta, y es la diferencia que la ronda
    // AG quería poder señalar con el ratón en las dos capas.
    expect(await call('message.properties', { id: '101' })).toMatchObject({ reactions: ['👍', '❤️', '🔥', '👏', '🎉', '✅', '👀', '🙏'], paid: false, allowCustom: false });
    await expect(call('message.react', { id: '101', emoji: '👍' })).rejects.toThrow(
      'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.',
    );
  });
});
