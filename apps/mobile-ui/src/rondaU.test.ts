import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CHAT_SENDER, MAX_WINDOW, REJECTIONS, authors, bandNotice, bandOf, hasBand, isSecret, problem,
} from './messageSearch';
import type { Message } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const pure = java('MessageSearch');
const bridge = java('NativeBridge');
const snapshot = java('NativeSnapshot');
const policy = java('BridgePolicy');
const app = ui('App.tsx');
const preview = ui('preview.ts');
const contract = ui('contract.ts');
const bridgeTs = ui('bridge.ts');

/** Cuerpo de un método del puente: desde su firma hasta la llave que lo cierra. */
function body(name: string, from = bridge): string {
  const start = from.search(new RegExp(`^\\s*(?:private|public|protected|static)[^{;\\n]*?\\b${name}\\(`, 'm'));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const DAY = 86_400;
const NOW = 1_770_000_000;
const chat = (type?: string) => ({ type });

describe('ronda O · el modelo TS conoce las reglas de Telegram', () => {
  it('rechaza en un chat secreto todo lo que TDLib no admite', () => {
    expect(problem('', 0, 0, chat('secret'))).toBeNull();
    expect(problem('730', 0, 0, chat('secret'))).toBe(REJECTIONS.secretBand);
    expect(problem('', NOW - DAY, NOW, chat('secret'))).toBe(REJECTIONS.secretBand);
    expect(isSecret(chat('secret'))).toBe(true);
    expect(isSecret(chat('channel'))).toBe(false);
  });

  it('solo deja publicar a su nombre a un canal', () => {
    expect(problem(CHAT_SENDER, 0, 0, chat('channel'))).toBeNull();
    expect(problem(CHAT_SENDER, 0, 0, chat('group'))).toBe(REJECTIONS.chatSenderOnly);
    expect(problem(CHAT_SENDER, 0, 0, chat('private'))).toBe(REJECTIONS.chatSenderOnly);
  });

  it('exige un identificador de autor bien formado', () => {
    for (const bad of ['maría', '0', '-7', '77a', '007', '99999999999999999999'])
      expect(problem(bad, 0, 0, chat('group')), bad).toBe(REJECTIONS.badSender);
    expect(problem('730', 0, 0, chat('group'))).toBeNull();
    expect(problem(' 730 ', 0, 0, chat('group'))).toBeNull();
  });

  it('ordena los rechazos de fechas igual que Java', () => {
    expect(problem('', -1, 0, chat('group'), NOW)).toBe(REJECTIONS.badDate);
    expect(problem('', 0, 2_147_483_648, chat('group'), NOW)).toBe(REJECTIONS.badDate);
    expect(problem('', NOW, NOW - DAY, chat('group'), NOW)).toBe(REJECTIONS.reversedBand);
    expect(problem('', NOW, NOW, chat('group'), NOW)).toBe(REJECTIONS.reversedBand);
    expect(problem('', NOW + DAY, NOW + 2 * DAY, chat('group'), NOW)).toBe(REJECTIONS.futureBand);
    expect(problem('', NOW - 400 * DAY, NOW, chat('group'), NOW)).toBe(REJECTIONS.wideBand);
    // Buscar «hoy» es legal: el tope exclusivo cae en la medianoche siguiente, siempre en el futuro.
    expect(problem('', NOW - 60, NOW + 43_200, chat('group'), NOW)).toBeNull();
    // Con autor inválido pero banda rota, gana la banda: el orden de Java está copiado tal cual.
    expect(problem('no-es-id', NOW, NOW - 10, chat('group'), NOW)).toBe(REJECTIONS.reversedBand);
    // Y el rechazo del secreto se aplica antes que nada, porque ahí ni siquiera hay banda que validar.
    expect(problem('no-es-id', NOW, NOW - 10, chat('secret'), NOW)).toBe(REJECTIONS.secretBand);
  });

  it('las casillas de calendario producen la banda que espera el puente', () => {
    expect(bandOf('', '')).toEqual({ from: 0, to: 0, notice: '' });
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const band = bandOf(key, '');
    expect(band.notice).toBe('');
    expect(band.to).toBe(0);
    expect(band.from % DAY).toBeGreaterThanOrEqual(0);
    expect(problem('', band.from, band.to, chat('private'))).toBeNull();
    for (const bad of ['2026-13-45', 'ayer', '2026-2-30'])
      expect(bandOf(bad, '').notice, bad).toBe(REJECTIONS.badDate);
    expect(hasBand('', 0, 0)).toBe(false);
    expect(hasBand('', 0, 1)).toBe(true);
  });

  it('los autores salen de lo que ya se leyó, sin inventar miembros', () => {
    const rows: Pick<Message, 'sender' | 'authorId' | 'authorKind'>[] = [
      { sender: 'WRGram · Novedades', authorId: '22', authorKind: 'chat' },
      { sender: 'Javier Morales', authorId: '1017', authorKind: 'user' },
      { sender: 'Rodrigo', authorId: '1', authorKind: 'user' },
      { sender: 'Sin id' },
      { sender: 'Javier Morales', authorId: '1017', authorKind: 'user' },
    ];
    // Con cuenta conocida, uno se pinta primero y con su nombre de persona.
    expect(authors(rows, '1')).toEqual([
      { id: '1', label: 'Tú', kind: 'user' },
      { id: '1017', label: 'Javier Morales', kind: 'user' },
    ]);
    // Sin cuenta, el autor sigue siendo un autor: la lista no se queda vacía.
    expect(authors(rows, '')).toEqual([
      { id: '1017', label: 'Javier Morales', kind: 'user' },
      { id: '1', label: 'Rodrigo', kind: 'user' },
    ]);
  });

  it('resume el filtro con las palabras exactas que se ven en pantalla', () => {
    const from = Math.floor(new Date(2026, 0, 10).getTime() / 1000);
    const until = Math.floor(new Date(2026, 0, 14).getTime() / 1000);
    expect(bandNotice(CHAT_SENDER, 0, 0, chat('channel'))).toBe('solo publicaciones del canal');
    expect(bandNotice('1017', 0, 0, chat('private'), [{ id: '1017', label: 'Javier Morales', kind: 'user' }]))
      .toBe('solo de Javier Morales');
    expect(bandNotice('1017', 0, 0, chat('private'))).toBe('solo de ese autor');
    expect(bandNotice('', from, until, chat('private'))).toContain('entre el 10 ene 2026 y el 13 ene 2026');
    expect(bandNotice('', from, 0, chat('private'))).toContain('desde el 10 ene 2026');
    expect(bandNotice('', 0, until, chat('private'))).toContain('hasta el 13 ene 2026');
    expect(bandNotice('', 0, 0, chat('private'))).toBe('');
  });
});

describe('ronda O · el puente y la interfaz dicen lo mismo', () => {
  it('las ocho frases del puente son literalmente las del modelo', () => {
    const constants: Record<keyof typeof REJECTIONS, string> = {
      badSender: 'BAD_SENDER', chatSenderOnly: 'CHAT_SENDER_ONLY', reversedBand: 'REVERSED_BAND',
      futureBand: 'FUTURE_BAND', wideBand: 'WIDE_BAND', badDate: 'BAD_DATE',
      secretBand: 'SECRET_BAND', globalBand: 'GLOBAL_BAND',
    };
    expect(Object.keys(REJECTIONS)).toHaveLength(8);
    for (const [key, name] of Object.entries(constants) as [keyof typeof REJECTIONS, string][])
      expect(pure.includes(`String ${name} = "${REJECTIONS[key]}"`), name).toBe(true);
    expect(pure).toContain('static final long MAX_WINDOW = 31622400L;');
    expect(MAX_WINDOW).toBe(31_622_400);
    expect(pure).toContain('static final String CHAT = "chat";');
    expect(CHAT_SENDER).toBe('chat');
    expect(pure).toContain('static final int LIMIT = 50;');
  });

  it('la clase pura no mira la sesión ni Android: solo reglas', () => {
    expect(pure).not.toContain('import android');
    expect(pure).not.toMatch(/session\.|NativeBridge|TdSession\.(?!senderKind|senderId)/);
    expect(pure).toMatch(/^final class MessageSearch \{/m);
    // `sender()` construye lo que TDLib espera; el resto no toca la red.
    expect(pure).toContain('new TdApi.MessageSenderUser(Long.parseLong(who))');
    expect(pure).toContain('new TdApi.MessageSenderChat(chat.id)');
  });

  it('el puente enruta el chat secreto por SearchSecretMessages', () => {
    expect(body('search')).toContain('if(MessageSearch.secret(value)&&!query.trim().isEmpty()){searchSecret=true;secretPage(query,filter,"",page,a);return;}');
    expect(body('search')).not.toContain('new TdApi.SearchChatMessages');
    expect(body('secretPage')).toContain('new TdApi.SearchSecretMessages(');
    expect(body('secretPage')).not.toContain('SearchChatMessages');
    // El cursor de un secreto es un texto opaco: no puede mezclarse con otro.
    expect(body('secretPage')).toContain('!cursor.equals(searchSecretOffset)');
    expect(body('searchMore')).toContain('if(searchSecret){');
    expect(body('searchMore')).toContain('secretPage(searchQuery,searchFilterKey,cursor,true,a)');
  });

  it('la banda de fechas se corta sobre el historial, porque TDLib no la conoce', () => {
    expect(body('search')).toContain('long seed=MessageSearch.seed(until)');
    expect(body('search')).toContain('session.messageByDate(chat,(int)seed');
    expect(body('search')).toContain('if(message==null||MessageSearch.older(message.date,from)){emptySearch(page,a);return;}');
    const page = body('searchPage');
    expect(page).toContain('search.senderId=sender');
    expect(page).toContain('search.limit=MessageSearch.LIMIT');
    expect(page).toContain('if(MessageSearch.older(message.date,from)){past=true;break;}');
    expect(page).toContain('if(!MessageSearch.keep(message.date,from,until))continue;');
    expect(page).toContain('searchNext=past?0:next');
  });

  it('paginar solo vale mientras los cinco criterios sigan siendo los mismos', () => {
    const more = body('searchMore');
    expect(more).toContain('MessageSearch.same(searchQuery,searchSender,searchFilterKey,searchFrom,searchUntil,');
    expect(more).toContain('a.fail("Vuelve a buscar para continuar.")');
    // Y el puente reutiliza los criterios guardados, no los que llegan en esta llamada.
    expect(more).toContain('searchPage(searchQuery,searchFilterKey,MessageSearch.sender(searchSender,session.chat(chat)),searchFrom,searchUntil,cursor,searchGeneration,true,a)');
  });

  it('la búsqueda sigue sin abrir diálogos nativos', () => {
    expect(bridge).toContain('case "messages.search":search(p,a);break;');
    expect(bridge).toContain('case "messages.search.more":searchMore(p,a);break;');
    expect(policy).toContain('"messages.search"');
    expect(policy).toContain('"messages.search.more"');
    const userDriven = bridgeTs.slice(bridgeTs.indexOf('const USER_DRIVEN = new Set(['));
    expect(userDriven.slice(0, userDriven.indexOf(']);'))).not.toContain('messages.search');
  });

  it('el DTO entrega quién escribió cada mensaje', () => {
    expect(snapshot).toContain('data.put("authorKind",authorKind)');
    expect(snapshot).toContain('TdSession.senderKind(message.senderId)');
    expect(contract).toContain("authorKind?:'user'|'chat'; authorId?:string;");
  });

  it('la interfaz filtra antes de preguntar y no lanza una búsqueda ya rechazada', () => {
    expect(app).toContain("const params={query:text,filter:searchFilter,...(searchMode==='chat'?{sender:searchSender,from:searchBand.from,until:searchBand.to}:{})}");
    expect(app).toContain('const canSearch=search&&searchProblem===null&&searchBand.notice===\'\'');
    expect(app).toContain('{searchBand.notice||searchProblem}');
    expect(app).toContain("request<{messages:Message[];next:boolean}>('messages.search.more',{query:searchQuery.trim(),filter:searchFilter,sender:searchSender,from:searchBand.from,until:searchBand.to})");
  });

  it('cada panel de búsqueda arranca limpio de autor y fechas', () => {
    for (const needle of ['setSearchSender(\'\');setSince(\'\');setUntilDay(\'\')'])
      expect(app.split(needle).length - 1).toBeGreaterThanOrEqual(4);
    expect(app).toContain('{searchMode===\'global\'?\'Todo Telegram\':\'Este chat\'}');
    expect(app).toContain('className="search-who"');
    expect(app).toContain('{active?.type===\'channel\'&&');
    // La barra se ofrece en los dos transportes que filtran: Android con TDLib y Windows con MTProto
    // (`DesktopSearch`), cada uno con la forma de identificador que su puente entiende.
    expect(app).toContain("const searchProblem=problem(searchSender,searchBand.from,searchBand.to,active,undefined,desktop?'peer':'numeric');");
    expect(app).toContain("{search&&searchMode==='chat'&&<div className=\"search-who\"");
    expect(app).toContain("{search&&searchMode==='chat'&&(searchBand.notice!==''||searchProblem!==null)");
    expect(app).toContain("{search&&searchMode==='chat'&&searchProblem===null&&searchBand.notice===''");
    expect(app.split("{search&&!desktop&&searchMode==='chat'").length - 1).toBe(0);
  });

  it('aplicar un filtro guardado reabre el panel de búsqueda', () => {
    const start = app.indexOf('async function applySavedFilter(');
    expect(start).toBeGreaterThan(-1);
    const apply = app.slice(start, app.indexOf('\n }', start));
    expect(apply).toContain("const opened=await run<boolean>('chat.open',{id:item.chatId})");
    expect(apply).toContain("navigate('chats');setMobileChat(true);");
    expect(apply).toContain('setSearch(true);');
    // Reaplicar el mismo filtro tiene que volver a buscar aunque ningún criterio cambie.
    expect(apply).toContain('setSearchNonce(value=>value+1);');
    expect(app).toContain('state.selfId,searchMode,searchNonce]');
    expect(apply).toContain('setSearchSender(\'\');setSince(\'\');setUntilDay(\'\');');
  });

  it('los resultados se leen en orden cronológico, como el historial', () => {
    expect(app).toMatch(/const chronological=\(messages:Message\[\]\)=>\[...messages\]\.sort\(\(a,b\)=>a\.date-b\.date\|\|Number\(a\.id\)-Number\(b\.id\)\);/);
    expect(app).toContain('return chronological([...new Map(');
    expect(app).toContain('setFound(chronological(result.messages))');
    expect(app).toContain('setFound(chronological(result))');
  });
});

describe('ronda O · la vista de diseño simula el mismo puente', () => {
  it('reutiliza el modelo en vez de reescribir las frases', () => {
    expect(preview).toContain("import { CHAT_SENDER, REJECTIONS, hasBand, problem } from './messageSearch';");
    for (const sentence of Object.values(REJECTIONS))
      expect(preview.includes(sentence), sentence).toBe(false);
    expect(preview).toContain('const verdict = problem(sender, from, until, state.chats.find(item => item.id === state.active));');
    expect(preview).toContain('if (hasBand(sender, from, until)) throw new Error(REJECTIONS.globalBand);');
    expect(preview).toContain("throw new Error('Vuelve a buscar para continuar.')");
  });

  it('pacta la página corta y el cursor con criterios pegados', () => {
    expect(preview).toContain('const SEARCH_PAGE = 8;');
    expect(preview).toContain('if (method === \'messages.search\' || method === \'messages.search.more\') {');
    expect(preview).toContain('if (method === \'messages.search\') designSearch = { key, next: 0 };');
    expect(preview).toContain('const cursor = designSearch;');
    expect(preview).toContain('if (!cursor || cursor.key !== key) throw new Error(\'Vuelve a buscar para continuar.\');');
    expect(preview).toContain('params.page ? { messages: page, next: designSearch.next < hits.length } : page');
  });

  it('busca sobre el historial completo que también abre chat.open', () => {
    expect(preview).toContain('const base = poolOf(id);');
    expect(preview).toContain('.filter(message => !message.service && matchesSearch(message, text, filter) && matchesAuthor(message, sender))');
    expect(preview).toContain('.filter(message => (from === 0 || message.date >= from) && (until === 0 || message.date < until))');
    expect(preview).toContain('.reverse();');
    // Sin fixture no hay resultados: las voces vacías son parte del trato, no un olvido.
    expect(preview).toContain("voice:[], videoNotes:[], animations:['sticker'], links:[], polls:[], mentions:[],");
  });

  it('tiene canal, privada con dos voces y un chat secreto donde rechazar', () => {
    expect(preview).toContain("authorKind:'chat',authorId:'22'");
    expect(preview).toContain("authorId:mine?'1':'1017'");
    expect(preview).toContain("['26','Irene Català','Aquí no hay nube',0,'secret']");
    expect(preview).toContain("id==='26'?secretNotes");
    // Y los filtros guardados, que antes ni se simulaban.
    expect(preview).toContain("if (method === 'search.filters.save') {");
    expect(preview).toContain("throw new Error('Puedes guardar hasta 20 filtros de búsqueda.')");
    expect(preview).toContain("throw new Error('La búsqueda necesita texto o un filtro.')");
  });
});
