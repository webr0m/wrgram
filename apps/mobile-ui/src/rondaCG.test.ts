import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (url: string) => readFileSync(new URL(url, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const ANDROID = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const java = (name: string) => read(`${ANDROID}${name}.java`);
const line = (source: string, at: number) => {
  const entry = source.split('\n')[at - 1];
  if (entry === undefined) throw new Error(`La línea ${at} no existe`);
  return entry;
};

/** El cuerpo de un método Java: desde la firma hasta la llave que lo cierra al mismo nivel. */
const body = (source: string, start: string) => {
  const open = source.indexOf(start);
  if (open < 0) throw new Error(`No se encuentra ${start}`);
  const brace = source.indexOf('{', open);
  let depth = 0;
  for (const [index, character] of source.slice(brace).split('').entries()) {
    if (character === '{') depth++;
    if (character === '}' && --depth === 0) return source.slice(brace, brace + index + 1);
  }
  throw new Error(`Llave sin cerrar tras ${start}`);
};

const count = (needle: string, source: string) => source.split(needle).length - 1;
const PHRASE = 'La conversación todavía no está cargada.';
const CONSTANT = 'CHAT_NOT_LOADED';

describe('ronda CG · la rama muerta de TdSession.unsupported() no vuelve a mentir', () => {
  const bridge = java('NativeBridge');
  const session = java('TdSession');
  const snapshot = java('NativeSnapshot');
  const activity = java('MainActivity');
  const tdlib = read('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
  const sources: Record<string, string> = {
    'TdSession.java': session, 'NativeBridge.java': bridge,
    'MainActivity.java': activity, 'NativeSnapshot.java': snapshot,
  };
  const anclas: Record<string, string> = {
    'TdSession.java:724': `static final String ${CONSTANT} = "${PHRASE}";`,
    'TdSession.java:732': 'if (chat == null || !ready() || selfId <= 0 || !transportAvailable) return false;',
    'TdSession.java:762': `if (chats.get(id) == null) { fail(${CONSTANT}); return; }`,
    'NativeBridge.java:727': `if(chat==null){a.fail(TdSession.${CONSTANT});return;}`,
    'NativeBridge.java:1151': 'if(target==null||target.type instanceof TdApi.ChatTypeSecret)',
    'NativeBridge.java:3211': `if (chat == null) {fail.accept(TdSession.${CONSTANT});return;}`,
    'NativeBridge.java:3248': 'if (chat != null) items.put(dto.chat(chat));',
    'NativeBridge.java:4696': 'if(chat==null)throw new IllegalArgumentException();',
    'MainActivity.java:311': 'TdApi.Chat chat = telegram.chat(id);',
    'MainActivity.java:313': `if (chat == null) { showInfo(TdSession.${CONSTANT}); return; }`,
    'NativeSnapshot.java:89': 'JSONObject chat(TdApi.Chat chat)throws Exception{',
    'NativeSnapshot.java:91': '.put("supported",true)',
  };

  for (const [cite, needle] of Object.entries(anclas)) {
    it(`${cite} sigue diciendo, carácter a carácter, lo que se escribió`, () => {
      const [file, at] = [cite.slice(0, cite.indexOf(':')), Number(cite.slice(cite.indexOf(':') + 1))];
      expect(line(sources[file], at)).toContain(needle);
    });
  }

  it('la frase vive una sola vez en el paquete y la repiten los cuatro sitios que ya la decían', () => {
    expect(count(`"${PHRASE}"`, bridge) + count(`"${PHRASE}"`, session)
      + count(`"${PHRASE}"`, activity) + count(`"${PHRASE}"`, snapshot)).toBe(1);
    for (const cite of ['MainActivity.java:313', 'NativeBridge.java:727', 'NativeBridge.java:3211', 'TdSession.java:762']) {
      const [file, at] = [cite.slice(0, cite.indexOf(':')), Number(cite.slice(cite.indexOf(':') + 1))];
      expect(line(sources[file], at)).toContain(CONSTANT);
    }
  });

  it('el método muerto ya no existe y ninguna capa lo llama', () => {
    const paquete = readdirSync(new URL(ANDROID, import.meta.url))
      .filter(name => name.endsWith('.java'))
      .map(name => read(`${ANDROID}${name}`)).join('\n');
    expect(paquete).not.toContain(`String unsupported(TdApi.Chat`);
    expect(paquete).not.toMatch(/unsupported\(/);
    expect(session).not.toContain(`!unsupported(chat).isEmpty()`);
    // canSend sigue negándose por las cuatro razones reales, ninguna inventada.
    expect(body(session, 'boolean canSend()')).not.toContain('unsupported');
    expect(body(session, 'boolean canSend()')).toContain(anclas['TdSession.java:732']);
  });

  it('abrir un chat sin cargar falla con la frase, y buscar uno público falla antes de abrirlo', () => {
    const open = body(session, 'void open(long id,long messageId)');
    expect(open.indexOf(`fail(${CONSTANT})`)).toBeLessThan(open.indexOf('ensureSupergroup('));
    // `chat.find` ya no contesta `true` con la conversación ausente: primero falla, luego abre.
    expect(line(bridge, 727)).toContain('session.findPublic(BridgePolicy.text(p,"username",33)');
    expect(line(bridge, 727).indexOf(CONSTANT)).toBeLessThan(line(bridge, 727).indexOf('session.open(chat.id)'));
    expect(line(bridge, 727).lastIndexOf('a.ok(true)')).toBeGreaterThan(line(bridge, 727).indexOf('return;'));
  });

  it('un chat que no llegó no revienta el puente ni se cuela en una lista', () => {
    // El guarda de secretos miraba `target.type` antes de saber si `target` existía.
    expect(line(bridge, 1151)).toContain('answer.fail("El chat enlazado no admite resultados inline.")');
    // Reenviar a un chat desconocido se rechaza sin inventar un tipo de chat. La rama entera cabe en una línea, y esa
    // línea es hoy la 4673 (medido: contiene el guarda del chat y el `throw` sin tipo inventado).
    expect(line(bridge, 4696)).toContain(`TdApi.Chat chat=session.chat(to);${anclas['NativeBridge.java:4696']}`);
    expect(line(bridge, 4696)).not.toContain('unsupported');
    // La búsqueda de destinos descarta los chats que TDLib aún no tiene.
    const search = body(bridge, 'private void searchChats');
    expect(count('if (chat != null) items.put(dto.chat(chat));', search)).toBe(1);
    expect(search.indexOf('session.chat(id)')).toBeLessThan(search.indexOf('items.put(dto.chat(chat))'));
  });

  it('`supported` del DTO dice si el objeto llegó, y el `false` lo pone la interfaz al inventar una ficha', () => {
    const comment = line(snapshot, 86) + '\n' + line(snapshot, 87) + '\n' + line(snapshot, 88);
    expect(comment).toContain('no si el tipo de chat se');
    expect(comment).toContain('supported');
    expect(comment).toContain('inventan la ficha');
    expect(body(snapshot, 'JSONObject chat(TdApi.Chat chat)')).toContain('.put("supported",true)');
    // La capa de contratos lo exige: ningún chat llega sin su marca.
    expect(line(read('./contract.ts'), 30)).toContain('supported: boolean;');
    // Y estos son los únicos sitios de la interfaz que deciden la marca.
    expect(line(read('./peerCard.ts'), 76)).toContain('supported: true');
    expect(line(read('./App.tsx'), 317)).toContain('supported:false');
    expect(count('supported:false', read('./App.tsx'))).toBe(1);
    expect(count('supported:true', read('./App.tsx'))).toBe(2);
    // Quien consume la marca: la ficha de perfil, el reenvío, la bandeja y los paneles.
    expect(read('./PeerProfile.tsx')).toContain('{chat.supported && <button type="button" onClick={() => openChat(chat)}>');
    expect(line(read('./App.tsx'), 1053)).toContain('state.chats.filter(chat=>chat.supported)');
    expect(line(read('./Inbox.tsx'), 152)).toContain('chat.supported === false');
  });

  it('ninguna capa vecina se movió de su aguja y los tres huecos que declaró la ronda están ya cableados', () => {
    // Las longitudes se miden hoy sobre los archivos en disco, después de CT y de las rondas posteriores. Los
    // incrementos históricos se explican en sus propias pruebas; aquí solo se fija el tamaño actual de cada capa.
    expect(bridge.split('\n').length - 1).toBe(5601);
    expect(session.split('\n').length - 1).toBe(1429);
    expect(snapshot.split('\n').length - 1).toBe(553);
    expect(activity.split('\n').length - 1).toBe(609);
    expect(read('./desktopScope.ts')).toContain("'notes.write', 'notes.read', 'notes.clear'");
    // Los tres huecos que CG encontró siguen existiendo en la biblioteca vendada, pero ninguno está vacío ya: la CK
    // cableó `EditMessageMedia`, la CJ `ToggleChatDefaultDisableNotification` y la CL `SearchCallMessages`. Dicho en
    // voz alta: esta compuerta perdió su fuerza negativa, así que solo comprueba que la clase sigue vendada y que cada
    // una se llama en su capa; las clasificaciones las defienden las pruebas JVM de cada ronda.
    expect(tdlib).toContain('class EditMessageMedia extends Function<Message>');
    expect(tdlib).toContain('class SearchCallMessages extends Function<FoundMessages>');
    expect(tdlib).toContain('class ToggleChatDefaultDisableNotification extends Function<Ok>');
    expect(count('new TdApi.EditMessageMedia(', bridge)).toBe(1);
    expect(count('new TdApi.SearchCallMessages(', bridge)).toBe(1);
    expect(count('new TdApi.ToggleChatDefaultDisableNotification(', bridge)).toBe(1);
    // El cursor de la llamada viaja en la línea que midió la CL: el `limit` no lo inventa el puente, lo dice `CallLog`.
    expect(line(bridge, 5413)).toContain('new TdApi.SearchCallMessages();search.offset=offset;search.limit=CallLog.LIMIT');
    // Nadie más lo llama: el registro se pide desde el brazo del puente, no desde la sesión.
    expect(session).not.toContain('new TdApi.SearchCallMessages(');
    expect(line(bridge, 4718)).toContain('new TdApi.EditMessageMedia(chatId,messageId,null,content)');
  });
});
