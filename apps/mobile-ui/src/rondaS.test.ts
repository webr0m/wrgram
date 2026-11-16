import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_WINDOW, REJECTIONS, problem } from './messageSearch';
import type { Message } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MessageSearch.java');
const csRules = text('../../desktop/src/WRGram.Desktop/DesktopSearch.cs');
const bridge = text('../../desktop/src/WRGram.Desktop/DesktopParity.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const contract = text('./contract.ts');

/** Las frases que las tres capas comparten; la de chats secretos y la global solo viven en Android. */
const SHARED: [string, string, keyof typeof REJECTIONS][] = [
  ['BAD_SENDER', 'BadSender', 'badSender'],
  ['CHAT_SENDER_ONLY', 'ChatSenderOnly', 'chatSenderOnly'],
  ['REVERSED_BAND', 'ReversedBand', 'reversedBand'],
  ['FUTURE_BAND', 'FutureBand', 'futureBand'],
  ['WIDE_BAND', 'WideBand', 'wideBand'],
  ['BAD_DATE', 'BadDate', 'badDate'],
];

/** Cuerpo de un método estático de C#: desde su firma hasta la llave que lo cierra.
 *  No hay compilador de pruebas aquí, así que la aguja es literal: si el puente cambia de forma, toca actualizarla. */
function csBody(name: string, from = csRules): string {
  const start = from.search(new RegExp(`(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

describe('ronda S · las tres capas rechazan lo mismo con las mismas palabras', () => {
  it.each(SHARED)('%s / %s: la misma frase literal en Java, TypeScript y C#', (javaField, csField, key) => {
    expect(java, `Java ${javaField}`).toContain(`static final String ${javaField} = "${REJECTIONS[key]}";`);
    expect(csRules, `C# ${csField}`).toContain(`public const string ${csField} = "${REJECTIONS[key]}";`);
  });

  it('cada frase compartida está escrita una sola vez y las que no aplican no existen', () => {
    for (const [, , key] of SHARED) {
      expect(csRules.split(REJECTIONS[key]).length - 1, key).toBe(1);
    }
    expect(csRules.includes(REJECTIONS.secretBand), 'en escritorio no hay chats secretos').toBe(false);
    expect(csRules.includes(REJECTIONS.globalBand), 'la banda no llega a la búsqueda global').toBe(false);
    expect(csRules).toContain('public const string AuthorUnknown = "No tenemos guardada a esa persona en esta sesión. Abre de nuevo la conversación y repite la búsqueda.";');
  });

  it('el orden de los descartes es el de Android', () => {
    const returns = (source: string, from: string, to?: string) => {
      const start = source.indexOf(from);
      expect(start, from).toBeGreaterThan(-1);
      const stop = to ? source.indexOf(to, start) : source.indexOf('\n    }', start);
      return [...source.slice(start, stop).matchAll(/return .+;/g)].map(match => match[0].replace(/\s+/g, ' '));
    };
    expect(returns(csRules, 'public static string? Problem')).toEqual([
      'return BadDate;', 'return BadDate;', 'return ReversedBand;', 'return FutureBand;', 'return WideBand;',
      'return null;', 'return isChannel ? null : ChatSenderOnly;', 'return Token(who) ? null : BadSender;',
    ]);
    expect(returns(java, 'static String problem(', 'static boolean positive')).toEqual([
      'return band(who, from, until) ? SECRET_BAND : null;', 'return BAD_DATE;', 'return BAD_DATE;',
      'return REVERSED_BAND;', 'return FUTURE_BAND;', 'return WIDE_BAND;', 'return null;',
      'return selfPosting(chat) ? null : CHAT_SENDER_ONLY;', 'return positive(who) ? null : BAD_SENDER;',
    ]);
  });

  it('el techo de la banda y la página son los mismos números', () => {
    expect(java).toContain('static final long MAX_WINDOW = 31622400L;');
    expect(csRules).toContain('public const long MaxWindow = 31622400L;');
    expect(java).toContain('static final int LIMIT = 50;');
    expect(csRules).toContain('public const int Limit = 50;');
    expect(csRules).toContain('public const long IntLimit = 2147483646L;');
  });

  it('en escritorio un identificador de autor lleva prefijo de peer', () => {
    const body = csBody('Token');
    expect(body).toContain("if (value[0] is not ('u' or 'c')) return false;");
    expect(body).toContain('if (value.Length is < 2 or > 20) return false;');
    expect(csRules).not.toContain('public static bool Token(string sender) => Regex');
  });

  it('el mismo `Same` de cinco criterios manda en la página siguiente', () => {
    const body = csBody('Same');
    expect(body).toContain('from == otherFrom && until == otherUntil');
    expect(bridge).toContain('if (!DesktopSearch.Same(query, sender, filterKey, from, until, _searchQuery, _searchSender, _searchFilter, _searchFrom, _searchUntil))');
    expect(bridge).toContain('throw new BridgeException("La búsqueda cambió. Lanza una nueva búsqueda.");');
  });

  it('Keep se queda en el escritorio porque el servidor también recorta', () => {
    expect(csBody('Keep')).toContain('(from == 0 || date >= from) && (until == 0 || date < until)');
    expect(java).toContain('return (from == 0 || date >= from) && (until == 0 || date < until);');
  });
});

describe('ronda S · el puente de escritorio escribe los criterios en Telegram', () => {
  it('la búsqueda por chat manda autor y banda, no solo texto', () => {
    expect(bridge).toContain('var bad = DesktopSearch.Problem(sender, from, until, DateTimeOffset.UtcNow.ToUnixTimeSeconds(), chat.Type == "channel");');
    expect(bridge).toContain('if (bad != null) throw new BridgeException(bad);');
    expect(bridge).toContain('from_id: AuthorPeer(sender, chat), min_date: DesktopSearch.MinDate(from), max_date: DesktopSearch.MaxDate(until),');
    expect(bridge).toContain('limit: DesktopSearch.Limit');
  });

  it('las fechas salen en la forma que MTProto espera y el corte se confirma aquí', () => {
    expect(csBody('MinDate')).toContain('from == 0 ? default : System.DateTimeOffset.FromUnixTimeSeconds(from).UtcDateTime');
    expect(csBody('MaxDate')).toContain('until == 0 ? default : System.DateTimeOffset.FromUnixTimeSeconds(until).UtcDateTime');
    expect(bridge).toContain('.Where(message => message.ID > 0 && DesktopSearch.Keep(Unix(message.Date), from, until))');
  });

  it('el autor se resuelve con el peer real y el canal puede firmarse a sí mismo', () => {
    const peer = csBody('AuthorPeer', bridge);
    expect(peer).toContain('if (who.Length == 0) return null;');
    expect(peer).toContain('if (who == DesktopSearch.Chat) return chat.Input;');
    expect(peer).toContain('if (_client?.User != null && who == "u" + _client.User.id) return new InputPeerSelf();');
    expect(peer).toContain('return FindEntry(who)?.Input ?? throw new BridgeException(DesktopSearch.AuthorUnknown);');
  });

  it('el cursor se guarda con las cinco partes y la página corta se las lleva puestas', () => {
    for (const field of ['private string _searchSender = "";', 'private long _searchFrom;', 'private long _searchUntil;']) expect(bridge).toContain(field);
    expect(bridge).toContain('_searchSender = sender;');
    expect(bridge).toContain('_searchFrom = from;');
    expect(bridge).toContain('_searchUntil = until;');
    expect(bridge).toContain('return SearchChatPage(result, chat, from, until, storeOffset: true);');
    expect(bridge).toContain('private object SearchChatPage(Messages_MessagesBase result, ChatEntry chat, long from, long until, bool storeOffset)');
  });

  it('cada mensaje dice quién lo firmó, en la forma que este puente entiende', () => {
    expect(state).toContain('public string? AuthorId { get; set; }');
    expect(state).toContain('public string? AuthorKind { get; set; }');
    expect(service).toContain('AuthorId = PeerKey(message.From),');
    expect(service).toContain('AuthorKind = message.From is TL.PeerChannel ? "chat" : message.From is TL.PeerUser ? "user" : null,');
    expect(contract).toContain("authorKind?:'user'|'chat'; authorId?:string;");
  });

  it('la búsqueda global no recibe autor ni fechas de este puente', () => {
    const global = csBody('SearchGlobalAsync', bridge);
    expect(global).not.toContain('from_id');
    expect(global).not.toContain('min_date');
  });
});

describe('ronda S · la interfaz abre la banda en los dos transportes', () => {
  it('el botón de buscar ya no es exclusivo de móvil', () => {
    expect(app).toContain('{<IconButton label="Buscar mensajes" active={search} onClick={()=>setSearch(!search)}><Search/></IconButton>}');
    expect(app).not.toContain('{!desktop&&<IconButton label="Buscar mensajes"');
  });

  it('la barra de autor y fechas se pinta también en escritorio', () => {
    expect(app).toContain("{search&&searchMode==='chat'&&<div className=\"search-who\"");
    expect(app.split("!desktop&&searchMode==='chat'").length - 1).toBe(0);
  });

  it('el criterio del autor se decide con la forma de identificador del transporte', () => {
    expect(app).toContain("const searchProblem=problem(searchSender,searchBand.from,searchBand.to,active,undefined,desktop?'peer':'numeric');");
    expect(app).toContain("const searchAuthors=authors([...state.messages,...(found??[])],desktop?'u'+state.selfId:state.selfId??'');");
  });

  it('las dos formas aceptan su token y rechazan el del otro, con la misma frase', () => {
    expect(problem('u123', 0, 0, { type: 'channel' }, 2_000_000_000)).toBe(REJECTIONS.badSender);
    expect(problem('u123', 0, 0, { type: 'channel' }, 2_000_000_000, 'peer')).toBe(null);
    expect(problem('c456', 0, 0, { type: 'channel' }, 2_000_000_000, 'peer')).toBe(null);
    expect(problem('123', 0, 0, { type: 'private' }, 2_000_000_000, 'peer')).toBe(REJECTIONS.badSender);
    expect(problem('123', 0, 0, { type: 'private' }, 2_000_000_000)).toBe(null);
    expect(problem('uc456', 0, 0, { type: 'channel' }, 2_000_000_000, 'peer')).toBe(REJECTIONS.badSender);
    expect(problem('u0', 0, 0, { type: 'channel' }, 2_000_000_000, 'peer')).toBe(REJECTIONS.badSender);
    expect(problem('u', 0, 0, { type: 'channel' }, 2_000_000_000, 'peer')).toBe(REJECTIONS.badSender);
  });

  it('las reglas de fechas no cambian con la forma del autor', () => {
    const now = 2_000_000_000;
    for (const shape of ['numeric', 'peer'] as const) {
      expect(problem('', 0, 0, undefined, now, shape)).toBe(null);
      expect(problem('', 500, 400, undefined, now, shape)).toBe(REJECTIONS.reversedBand);
      expect(problem('', now + 10, 0, undefined, now, shape)).toBe(REJECTIONS.futureBand);
      expect(problem('', 100, 100 + MAX_WINDOW + 1, undefined, now, shape)).toBe(REJECTIONS.wideBand);
      expect(problem('', 100, 100 + MAX_WINDOW, undefined, now, shape)).toBe(null);
      expect(problem('', -1, 0, undefined, now, shape)).toBe(REJECTIONS.badDate);
      expect(problem('chat', 0, 0, { type: 'group' }, now, shape)).toBe(REJECTIONS.chatSenderOnly);
      expect(problem('chat', 0, 0, { type: 'channel' }, now, shape)).toBe(null);
      expect(problem('1', 0, 0, { type: 'secret' }, now, shape)).toBe(REJECTIONS.secretBand);
    }
  });
});

type SearchPage = { messages: Message[]; next: boolean };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

// `preview.ts` arrastra `bridge.ts`, que vive del `window` del navegador; se le da un window vacío y se
// recarga el módulo con el estado de serie plantado, igual que hace `main.tsx` al arrancar la vista.
let call: DesignCall = async () => undefined;
beforeEach(async () => {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  (await import('./bridge')).acceptState(fixture);
  call = designRequest as DesignCall;
});

/** Lo que devuelve la vista de diseño tras recorrer todas las páginas del marcador, igual que el usuario. */
async function searched(chatId: string, params: Record<string, unknown> = {}): Promise<Message[]> {
  await call('chat.open', { id: chatId });
  const criteria = { query: '', ...params };
  let page = (await call('messages.search', { ...criteria, page: true })) as SearchPage;
  const seen = [...page.messages];
  while (page.next) {
    page = (await call('messages.search.more', criteria)) as SearchPage;
    seen.push(...page.messages);
  }
  return seen;
}

describe('ronda S · la vista de diseño mueve autor y fechas con la forma numérica de Android', () => {
  it('el autor parte el historial en las dos voces de la conversación', async () => {
    const all = await searched('17');
    const javier = await searched('17', { sender: '1017' });
    const mine = await searched('17', { sender: '1' });
    expect(all.length).toBeGreaterThan(0);
    expect(javier.every(message => message.authorId === '1017' && !message.outgoing)).toBe(true);
    expect(mine.every(message => message.authorId === '1' && message.outgoing)).toBe(true);
    expect(javier.length + mine.length).toBe(all.length);
    expect(javier.length).toBeLessThan(all.length);
  });

  it('la ventana de fechas recorta y se suma a la del autor', async () => {
    const all = (await searched('17')).sort((a, b) => a.date - b.date);
    const from = all[10].date;
    const until = all[20].date;
    const band = await searched('17', { from, until });
    expect(band.length).toBe(10);
    expect(band.every(message => message.date >= from && message.date < until)).toBe(true);
    const both = await searched('17', { sender: '1017', from, until });
    expect(both.length).toBeLessThanOrEqual(band.length);
    expect(both.every(message => message.authorId === '1017' && message.date >= from && message.date < until)).toBe(true);
  });

  it('rechaza con la frase de Android lo que el puente no aceptaría', async () => {
    await expect(searched('17', { sender: 'chat' })).rejects.toThrow(REJECTIONS.chatSenderOnly);
    await expect(searched('17', { sender: 'u1017' })).rejects.toThrow(REJECTIONS.badSender);
    await expect(searched('26', { sender: '526' })).rejects.toThrow(REJECTIONS.secretBand);
    await expect(searched('17', { from: 1_000, until: 1_000 + MAX_WINDOW + 1 })).rejects.toThrow(REJECTIONS.wideBand);
    await expect(searched('17', { from: 5_000, until: 4_000 })).rejects.toThrow(REJECTIONS.reversedBand);
  });

  it('la búsqueda global no admite la banda, igual que el puente', async () => {
    await call('chat.open', { id: '17' });
    await expect(call('messages.search', { query: 'boceto', global: true, sender: '1017' }))
      .rejects.toThrow(REJECTIONS.globalBand);
  });

  it('cambiar un criterio a mitad de página obliga a volver a buscar', async () => {
    await call('chat.open', { id: '17' });
    await call('messages.search', { query: '', sender: '1017', page: true });
    await expect(call('messages.search.more', { query: '', sender: '1' }))
      .rejects.toThrow('Vuelve a buscar para continuar.');
  });
});
