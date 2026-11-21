import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { DESKTOP_NAMED_IN_SCAFFOLD, desktopGapRefusal } from './desktopGap';

/**
 * Ronda BX — la auditoría dijo cinco huecos de Windows y la sonda desmontó cuatro de ellos.
 *
 * La nota de la auditoría pedía «reaccionar, cerrar la encuesta, listar los fijados, quitar la foto y reintentar»
 * como si fueran cinco cable sueltos. La sonda, compilada contra WTelegramClient 4.4.10 y leída por reflexión sobre
 * el ensamblado, midió tres cosas distintas: que la petición de reaccionar **sí está** bajo su nombre actual
 * (`messages.sendReaction`) y lo que no está son los nombres que la ronda AG buscó para negarla
 * (`messages.setChatReactions`, `messages.availableReactions`, la unión `TypeReaction`); que para cerrar una
 * encuesta, listar los fijados y borrar la foto de una comunidad no hay petición ni objeto vacío
 * (`messages_stopPoll`, `messages_getPinnedMessages` y `inputChatPhotoEmpty`: los tres, NO EXISTE en el ensamblado),
 * así que su negativa con nombre propio es la respuesta correcta y no un pudridero; y que `message.retry` no tiene
 * brazo ninguno —el `"retry"` del despacho reintenta descargas, otra orden—, con lo que la puerta de BK es la que
 * impide que el andamio lo finja.
 *
 * Este archivo mide, sin copiar una cifra de la hoja de ronda:
 *
 * 1. Qué hizo hoy el despacho con las cinco claves de la auditoría: dos contestadas, cuatro negadas con su causa y
 *    una abandonada al genérico. La comprobación recorre el cable, no busca una frase.
 * 2. Que la escritura que se conectó lo está con la petición medida, con las dos banderas que la sonda leyó del
 *    ensamblado y con el conjunto completo que exige `messages.sendReaction`.
 * 3. Que la bandeja se lee donde MTProto la pone —la información completa del chat, y si el chat no la personaliza,
 *    la lista general— y que esa lectura tiene un límite dicho: una vez por sesión.
 * 4. Que las cuatro negativas con nombre siguen diciendo en el andamio la frase del host, carácter a carácter.
 * 5. Que el aviso cambió de casilla las dos claves cableadas y dejó las otras cuatro donde estaban.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const service = rows(`${host}TelegramService.cs`);
const reactRules = text(`${host}DesktopMessageReact.cs`);
const flow = text(`${host}DesktopMessageReactFlow.cs`);
const preview = text('./preview.ts');
const app = text('./App.tsx');

/** El despacho de Windows, con el mismo recorte que usan BJ, BK, BM y BZ. */
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
  service.slice(0, start).forEach((row, index) => {
    const pre = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (pre) answered.set(pre, index + 1);
  });
  return { answered, refused };
}
const cable = dispatch();

/** El literal de texto que C# asigna a una constante, en el archivo que sea. */
function csLiteral(name: string, from: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

/** La propiedad de un objeto literal de `preview.ts`, cortada por su llave de cierre. */
function tsProperty(object: string, key: string): string {
  const start = preview.indexOf(`const ${object} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${object}`);
  const block = preview.slice(start, preview.indexOf('\n};', start));
  const match = new RegExp(`\\b${key}: '((?:[^'\\\\]|\\\\.)*)'`).exec(block);
  if (!match) throw new Error(`Falta ${key} en ${object}`);
  return match[1];
}

const pollRules = text(`${host}DesktopPoll.cs`);
const pinRules = text(`${host}DesktopMessagePin.cs`);
const photoRules = text(`${host}DesktopChatPhoto.cs`);

describe('ronda BX · las cinco claves de la auditoría, medidas en el cable de hoy', () => {
  it('las dos escrituras de reacción se contestan', () => {
    for (const key of ['message.react', 'message.react.custom']) {
      expect(cable.answered.has(key), `${key} sigue sin brazo`).toBe(true);
      expect(cable.refused.has(key), `${key} se niega y a la vez se contesta`).toBe(false);
    }
  });

  it('las cuatro que no se pueden se niegan con su causa, no con el aviso genérico', () => {
    // Una negativa con nombre es información; el genérico es una promesa sin fecha. La sonda midió que en estos
    // cuatro casos la petición no está (o está y gasta dinero sin cartera), así que lo que procede es decirlo.
    for (const key of ['message.react.paid', 'poll.stop', 'pinned.list', 'chat.photo.delete']) {
      expect(cable.refused.has(key), `${key} no está negada con nombre`).toBe(true);
      expect(cable.answered.has(key), `${key} está negada y contestada a la vez`).toBe(false);
      expect(desktopGapRefusal(key), `${key} no debería pasar por la puerta genérica`).toBeUndefined();
      expect(DESKTOP_NAMED_IN_SCAFFOLD).toContain(key);
    }
  });

  it('`message.retry` no tiene brazo: el `"retry"` del despacho es la descarga, otra orden', () => {
    expect(cable.answered.has('message.retry')).toBe(false);
    expect(cable.refused.has('message.retry')).toBe(false);
    expect(service.join('\n')).toContain('"retry" => await RetryAsync(),');
    // Y como no lo tiene, la puerta de BK es la que lo niega en el andamio: sin ella, `preview.ts` lo representaría.
    expect(desktopGapRefusal('message.retry')).toBe('No disponible en escritorio (beta): message.retry');
  });
});

describe('ronda BX · la escritura, con la petición medida y el conjunto completo', () => {
  it('llama a `Messages_SendReaction`, no a los nombres que se buscaron para negarla', () => {
    expect(flow).toContain('await client.Messages_SendReaction(entry.Input, ids[0], set, big: false, add_to_recent: true);');
    expect(reactRules).toContain('Client.Messages_SendReaction(');
  });

  it('lee la bandera de Premium donde la midió la sonda, sin una ida y vuelta', () => {
    // `268435456` es el valor que la reflexión del ensamblado dio a `User.Flags.premium`; aquí se compara contra la
    // constante, que es el mismo número escrito por su nombre.
    expect(flow).toContain('var premium = (client.User.flags & User.Flags.premium) != 0;');
    expect(reactRules).toContain('268435456');
  });

  it('manda el conjunto entero, porque lo que no va en el vector se quita', () => {
    expect(reactRules).toContain('if (!row.Chosen) continue;');
    expect(reactRules).toContain('if (remove && key == target.Key) continue;');
    expect(reactRules).toContain('if (!remove && !set.Any(item => KeyOf(item) == target.Key)) set.Add(Build(target));');
    expect(reactRules).toContain('return [.. set];');
    // La clave con la que una ficha se reconoce a sí misma en el vector: prefijo por clase, para que un emoji y un
    // documento con el mismo texto no se confundan.
    expect(reactRules).toContain('row.Kind == CustomKind ? "c:" + row.CustomEmojiId : "e:" + row.Emoji');
    expect(reactRules).toContain('public const string CustomKind = "custom";');
    expect(app).toContain("reaction.kind==='custom'");
  });

  it('el orden de las guardas reproduce al de Android: fila, forma, Premium y al final la lista ofrecida', () => {
    const order = [
      'if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);',
      'var rows = DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids);',
      'if (!long.TryParse(Str(args, "emoji").Trim(), out var document) || document <= 0)',
      'if (!premium) throw new BridgeException(DesktopMessageReact.NotPremiumAccount);',
      'if (emoji.Length == 0) throw new BridgeException(DesktopMessageReact.NoEmoji);',
      'if (!remove && available != null)',
      'await client.Messages_SendReaction(entry.Input, ids[0], set, big: false, add_to_recent: true);',
    ];
    const lines = flow.split(/\r?\n/);
    const where = order.map(needle => {
      const index = lines.findIndex(row => row.includes(needle));
      expect(index, `falta la guarda: ${needle}`).toBeGreaterThan(-1);
      return index;
    });
    for (let i = 1; i < where.length; i++) expect(where[i], `orden roto en ${order[i]}`).toBeGreaterThan(where[i - 1]);
    // Al quitar, la lista no se pregunta: es la misma excepción que hace Android.
    expect(flow).toContain('if (!remove && available != null)');
  });
});

describe('ronda BX · la bandeja se lee donde MTProto la pone, y eso tiene un límite dicho', () => {
  it('primero la personalización del chat y, si no la hay, la lista general', () => {
    expect(flow).toContain('var answer = await client.GetFullChat(entry.Input);');
    expect(flow).toContain('ChannelFull channel when (channel.flags & ChannelFull.Flags.has_available_reactions) != 0 => channel.available_reactions,');
    expect(flow).toContain('ChatFull chat when (chat.flags & ChatFull.Flags.has_available_reactions) != 0 => chat.available_reactions,');
    expect(flow).toContain('if (available is not ChatReactionsSome some) return null;');
    expect(flow).toContain('var list = await ChatOffersAsync(client, entry) ?? await DefaultOffersAsync(client);');
    expect(flow).toContain('var answer = await client.Messages_GetAvailableReactions(hash: 0);');
    expect(flow).toContain('(item.flags & AvailableReaction.Flags.premium) != 0');
  });

  it('los dos tipos que Telegram manda en la lista del chat, convertidos', () => {
    expect(flow).toContain('ReactionEmoji emoji => new DesktopMessageReact.Offer(emoji.emoticon, null, false),');
    expect(flow).toContain('ReactionCustomEmoji custom => new DesktopMessageReact.Offer("", custom.document_id.ToString(), true),');
  });

  it('una vez por chat y una vez por sesión: el límite está escrito junto a la caché', () => {
    expect(flow).toContain('private readonly Dictionary<string, DesktopMessageReact.Offer[]?> _reactionOffers = new();');
    expect(flow).toContain('if (_reactionOffers.TryGetValue(entry.Id, out var cached)) return cached;');
    expect(flow).toContain('if (_reactionDefaults != null) return _reactionDefaults;');
    expect(flow).toContain('la caché no');
    // Si la lista no se pudo leer, el brazo no finge una bandeja: sale vacía, y la validación se salta.
    expect(flow).toContain('if (available == null) return [];');
  });

  it('el properties pasó a esperar, porque leer la bandeja es una ida a la red', () => {
    expect(service.join('\n')).toContain('"message.properties" => await PropertiesAsync(Str(args, "id")),');
    expect(service.join('\n')).toContain('private async Task<object> PropertiesAsync(string id)');
    expect(service.join('\n')).toContain('var band = entry == null || _client is not Client client ? new List<object>() : await ReactionBandAsync(entry, client, message);');
  });
});

describe('ronda BX · las cuatro negativas con nombre, espejadas carácter a carácter', () => {
  it.each([
    ['DesktopPoll.NoStop', () => csLiteral('NoStop', pollRules), () => tsProperty('POLL_REFUSALS', 'noStop')],
    ['DesktopMessagePin.NoList', () => csLiteral('NoList', pinRules), () => tsProperty('PIN_REFUSALS', 'list')],
    ['DesktopChatPhoto.NoDelete', () => csLiteral('NoDelete', photoRules), () => tsProperty('CHAT_PHOTO', 'noDelete')],
    ['DesktopMessageReact.PaidRefused', () => csLiteral('PaidRefused', reactRules), () => tsProperty('REACT_REFUSALS', 'paid')],
  ] as const)('%s es la misma cadena en las dos capas', (name, hostSay, scaffoldSay) => {
    expect(scaffoldSay(), name).toBe(hostSay());
  });
});

describe('ronda BX · el aviso cambió de casilla', () => {
  it('las dos claves cableadas figuran en disponibles y han desaparecido de pendientes', () => {
    const claim = DESKTOP_AVAILABLE.find(entry => entry.methods.includes('message.react'));
    expect(claim?.label).toBe('poner y quitar reacciones de emoji y personalizadas');
    expect(claim?.methods).toEqual(['message.react', 'message.react.custom']);
    for (const key of ['message.react', 'message.react.custom']) {
      expect(DESKTOP_PENDING.some(entry => entry.methods.includes(key)), `${key} sigue declarado pendiente`).toBe(false);
    }
  });

  it('la casilla de pendiente que queda nombra lo que sí falta, sin arrastrar las dos cableadas', () => {
    const claim = DESKTOP_PENDING.find(entry => entry.methods.includes('message.react.paid'));
    expect(claim?.methods).toEqual(['message.react.paid', 'poll.stop']);
    expect(claim?.label).toBe('reacciones de pago y cerrar una encuesta');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BX · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
  });

  it('bajo escritorio, las cuatro negativas dicen su causa y el retry cae en la puerta', async () => {
    await expect(call('message.react.paid', { id: '101', count: '5' })).rejects.toThrow(tsProperty('REACT_REFUSALS', 'paid'));
    await expect(call('poll.stop', { id: '101' })).rejects.toThrow(tsProperty('POLL_REFUSALS', 'noStop'));
    await expect(call('pinned.list', { chatId: '1' })).rejects.toThrow(tsProperty('PIN_REFUSALS', 'list'));
    await expect(call('chat.photo.delete', { id: '1' })).rejects.toThrow(tsProperty('CHAT_PHOTO', 'noDelete'));
    await expect(call('message.retry', { id: '114' })).rejects.toThrow('No disponible en escritorio (beta): message.retry');
  });

  it('y la orden que el host sí atiende deja de negarse en el andamio', async () => {
    expect(await call('message.react', { id: '101', emoji: '👍' })).toBe(true);
    // El retry sigue vivo en Android: la puerta es de plataforma, no una eliminación de la representación.
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    expect(await call('message.retry', { id: '114' })).toBe(true);
  });
});
