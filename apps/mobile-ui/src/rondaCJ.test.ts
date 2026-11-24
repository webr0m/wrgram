import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CJ — el silencio que una cuenta aplica por defecto a lo que ella misma envía.
 *
 * Android lo delega entero en TDLib: la clave `chat.defaultSilent` llama a
 * `ToggleChatDefaultDisableNotification` (`NativeBridge.java:735`), la biblioteca contesta `Ok` sin traer nada que
 * copiar, y el valor vuelve a la pantalla por la fila del chat (`NativeSnapshot.java:107-109`), que es la que lee el
 * compositor al arrancar. La clave está declarada en la lista del puente (`BridgePolicy.java:52`) y el aviso de
 * cambio está cableado en la sesión (`TdSession.java:435`), que refresca la lista (`TdSession.java:438`).
 *
 * **Lo que mide la biblioteca vendada, y por qué Windows no puede copiar el mecanismo.** El campo no viaja a los
 * servidores de Telegram: `TdApi.java:10697` lo describe como «Default value of the disableNotification parameter,
 * used when a message is sent to the chat» —un defecto local que TDLib aplica al enviar— y `TdApi.java:158277` dice
 * que la función cambia ese valor. En MTProto la sonda de la ronda recorrió `TL.Chat`, `TL.Channel`, `TL.ChannelFull`
 * y `TL.ChatFull` y no encontró hueco: los tres `default_*` que tienen son `default_banned_rights`,
 * `groupcall_default_join_as` y `default_send_as`, otras tres cosas. Así que la lista vive en `default-silent.json`,
 * dentro de la carpeta de la app y separada por cuenta, con la diferencia honesta de que el equivalente de la otra
 * capa tampoco es un dato del servidor.
 *
 * **El defecto gana al interruptor de la pantalla, en las dos capas.** En Android no lo decide este cliente:
 * `sendOptions` devuelve `null` cuando la pantalla pidió avisar (`NativeBridge.java:174`) y TDLib aplica entonces su
 * defecto. En Windows el brazo (`TelegramService.cs:224`) llama al guardador (`DesktopParity.cs:285-296`), la marca
 * sale hacia la interfaz por el DTO de la fila (`DesktopState.cs:128`) y los seis envíos que llevan flag preguntan
 * por el defecto antes de mandar. La regla está dicha una sola vez, en `DesktopDefaultSilent.SilentFor`, y el
 * interruptor se siembra con la marca de la fila (`App.tsx:182`) mientras la orden y sus dos avisos viven en
 * `setDefaultSilent` (`App.tsx:1183`).
 *
 * **Dos huecos declarados por su nombre, no un pudridero.** `business.quick.send` no puede heredar el defecto en
 * Windows: el ayuda de la librería se llama `Messages_SendQuickReplyMessages(for_peer, shortcut_id, ids, random_id)`
 * y no tiene parámetro `silent` ninguno, mientras que en TDLib la misma orden se manda sin opciones —su clase
 * tampoco tiene campo `options`— y ahí el defecto actúa solo. Y quién puede cambiar el defecto lo decide TDLib en
 * tiempo de ejecución, que su fuente vendada no lo escribe, así que Windows guarda la lista para cualquier
 * conversación en lugar de inventarse un filtro de tipos medido a medias. Ninguno de los dos se finge con el
 * andamio.
 *
 * Como en CF, CM, CN, CI, CB, BZ y BY: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda —en
 * su propio archivo y en el comentario de la clase pura— tiene que estar en la tabla y señalar hoy la línea que la
 * frase afirma.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const tdlibPath = '../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java';

const bridge = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const session = rows(`${javaDir}TdSession.java`);
const policy = rows(`${javaDir}BridgePolicy.java`).join('\n');
const tdlib = rows(tdlibPath);
const service = rows(`${host}TelegramService.cs`);
const parity = rows(`${host}DesktopParity.cs`);
const pure = rows(`${host}DesktopDefaultSilent.cs`);
const state = rows(`${host}DesktopState.cs`);
const collections = rows(`${host}TelegramCollections.cs`);
const app = rows('./App.tsx');
const contract = rows('./contract.ts');
const scope = rows('./desktopScope.ts');

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const atJava = (n: string) => en(n, bridge, 'NativeBridge.java');
const atApp = (n: string) => en(n, app, 'App.tsx');
const atPar = (n: string) => en(n, parity, 'DesktopParity.cs');
const count = (needle: string, body: string[]) => body.join('\n').split(needle).length - 1;

/** El cuerpo de un método, delgado por balance de llaves a partir de su firma. */
function body(lines: string[], signature: string, where: string): string {
  const start = lines.findIndex(row => row.includes(signature));
  if (start < 0) throw new Error(`Falta ${signature} en ${where}`);
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index]) {
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return lines.slice(start, index + 1).join('\n');
    }
  }
  throw new Error(`${signature} no cierra su llave en ${where}`);
}

/** El despacho de Windows recortado como lo recortan BJ, BK, BM, CA y CI: brazos vivos, negados y su línea. */
function dispatch() {
  const start = service.findIndex(row => row.includes('object? result = method switch'));
  const generic = service.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  const arms = new Map<string, number>();
  service.slice(start, generic + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    for (const match of row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)) arms.set(match[1], start + offset + 1);
  });
  return { start: start + 1, generic: generic + 1, arms };
}
const cable = dispatch();

const KEY = 'chat.defaultSilent';
const CALL = 'var silent = SilentFor(';

describe('ronda CJ · el puente de Android', () => {
  it('la clave está declarada y su brazo llama a la función medida de TDLib', () => {
    expect(policy).toContain(`static { METHODS.add("${KEY}"); }`);
    const line = atJava(`case "${KEY}":`);
    expect(bridge[line - 1]).toContain('perform(new TdApi.ToggleChatDefaultDisableNotification(chat.id,p.getBoolean("value")),a,result->a.ok(true))');
    // La orden contesta `Ok`, sin valor que copiar: lo que se afirma es que salió.
    expect(bridge[line - 1]).toContain('a.ok(true)');
    // Y el chat es el de la fila activa, con el mismo `target` que usan las otras órdenes de chat.
    expect(bridge[line - 1]).toContain('TdApi.Chat chat=target(p)');
    expect(tdlib.join('\n')).toContain('public static class ToggleChatDefaultDisableNotification extends Function<Ok>');
    expect(bridge[line - 1]).toContain('break;}');
  });

  it('va pegado a chat.mute en las dos capas, que son las dos caras del aviso', () => {
    expect(atJava('case "chat.mute":') + 1).toBe(atJava(`case "${KEY}":`));
    expect(cable.arms.get('chat.mute')).toBe(cable.arms.get(KEY)! - 1);
  });

  it('el valor se lee de la fila y la fila se refresca con el aviso de TDLib', () => {
    const put = en('data.put("defaultSilent",true)', snapshot, 'NativeSnapshot.java');
    expect(snapshot[put - 1]).toContain('if(chat.defaultDisableNotification)');
    // Como `isForum` o `supergroup`: solo se escribe la marca encendida, y el comentario que lo dice está pegado.
    expect(count('data.put("defaultSilent"', snapshot)).toBe(1);
    expect(snapshot[put - 3]).toContain('el `muted` de arriba es el de lo');
    const handled = en('object instanceof TdApi.UpdateChatDefaultDisableNotification', session, 'TdSession.java');
    expect(session[handled - 1]).toContain('} else if (object instanceof TdApi.UpdateChatDefaultDisableNotification) {');
    expect(session[handled + 3 - 1]).toContain('chats.get(value.chatId).defaultDisableNotification = value.defaultDisableNotification; emit("chats");');
    // El aviso refresca la fila y no toca el silencio de lo que llega: son dos campos distintos.
    expect(session.slice(handled - 1, handled + 3).join('\n')).not.toContain('notificationSettings');
  });

  it('el defecto manda sobre el interruptor porque las opciones se mandan vacías', () => {
    const options = body(bridge, 'private static TdApi.MessageSendOptions sendOptions(JSONObject p)', 'NativeBridge.java');
    expect(options).toContain('boolean silent=p.optBoolean("silent");');
    expect(options).toContain('if(!silent&&schedule==0&&!raw.equals("online"))return null;');
    expect(options).toContain('options.disableNotification=silent;');
    // Y la biblioteca lo dice con esas palabras en la fuente vendada, que es la única medición posible aquí.
    const field = en('public boolean defaultDisableNotification;', tdlib, 'TdApi.java');
    expect(tdlib[field - 3]).toContain('Default value of the disableNotification parameter, used when a message is sent to the chat.');
    expect(tdlib.join('\n')).toContain('Changes the value of the default disableNotification parameter, used when a message is sent to a chat.');
  });
});

describe('ronda CJ · el brazo de Windows y su clase pura', () => {
  it('la clave tiene brazo vivo, llama al guardador y contesta true', () => {
    const at = cable.arms.get(KEY);
    expect(at, `${KEY} sigue sin brazo`).toBeTypeOf('number');
    expect(service[at! - 1]).toContain(`"${KEY}" => SetDefaultSilent(args),`);
    expect(/=>\s*throw\b/.test(service[at! - 1]), `${KEY} se niega a sí misma`).toBe(false);
    const writer = body(parity, 'private object SetDefaultSilent(JsonElement args)', 'DesktopParity.cs');
    expect(writer).toContain('var entry = RequireEntry(Str(args, "id"));');
    expect(writer).toContain('var value = Bool(args, "value");');
    expect(writer).toContain('DesktopDefaultSilent.Toggle(DefaultSilentsOf(account), entry.Id, value);');
    expect(writer).toContain('WriteDefaultSilents(account, next);');
    expect(writer).toContain('foreach (var chat in _state.Chats) if (chat.Id == entry.Id) chat.DefaultSilent = mark;');
    expect(writer.trim().endsWith('return true;\n    }')).toBe(true);
    // La cuenta dueña es la misma que escriben los filtros guardados: prefijo `u` y el id del usuario conectado.
    expect(pure.join('\n')).toContain('public static string AccountKey(long userId) => "u" + userId;');
    expect(writer).toContain('DesktopDefaultSilent.AccountKey(CollectionClient().User!.id)');
  });

  it('la regla pura está dicha una sola vez y sus cuatro piezas son medidas', () => {
    const rules = pure.join('\n');
    expect(rules).toContain('public const string FileName = "default-silent.json";');
    expect(rules).toContain('if (value) next.Add(chatId);');
    expect(rules).toContain('else next.Remove(chatId);');
    expect(rules).toContain('public static bool? Mark(HashSet<string> current, string chatId) => current.Contains(chatId) ? true : null;');
    expect(rules).toContain('public static bool SilentFor(HashSet<string> current, string chatId, bool silent) => silent || current.Contains(chatId);');
    // Encender repetido no duplica y apagar no borra al vecino: es un conjunto, no una lista.
    expect(count('next.Add(chatId)', pure)).toBe(1);
    expect(count('SilentFor', service)).toBe(6);
    expect(count('SilentFor', parity)).toBe(2);
    expect(count('public static bool SilentFor', pure)).toBe(1);
  });

  it('la lista vive en la carpeta de la app, separada por cuenta y a prueba de disco', () => {
    const reader = body(parity, 'private HashSet<string> ReadDefaultSilents(string account)', 'DesktopParity.cs');
    expect(reader).toContain('if (!System.IO.File.Exists(DefaultSilentPath)) return [];');
    expect(reader).toContain('if (file == null || file.Account != account) return [];');
    expect(reader).toContain('return new HashSet<string>(file.Chats ?? []);');
    expect(reader).toContain('catch (Exception)');
    const writer = body(parity, 'private void WriteDefaultSilents(string account, HashSet<string> chats)', 'DesktopParity.cs');
    expect(writer).toContain('var temp = DefaultSilentPath + ".tmp";');
    expect(writer).toContain('System.IO.File.Move(temp, DefaultSilentPath, overwrite: true);');
    // Otra cuenta conectada, otra lista: el cache se tira cuando cambia el dueño.
    const cache = body(parity, 'private HashSet<string> DefaultSilentsOf(string account)', 'DesktopParity.cs');
    expect(cache).toContain('if (_defaultSilentAccount != account)');
    expect(cache).toContain('_defaultSilents = ReadDefaultSilents(account);');
    expect(parity[atPar('private string DefaultSilentPath =>') - 1])
      .toContain('System.IO.Path.Combine(_store.Root, DesktopDefaultSilent.FileName)');
    // La pareja serializada del archivo, con su dueño y su lista.
    const file = body(state, 'public sealed class DefaultSilentFileDto', 'DesktopState.cs');
    expect(file).toContain('public string Account { get; set; } = "";');
    expect(file).toContain('public List<string> Chats { get; set; } = new();');
  });

  it('la marca sale en las tres listas de chats, leída por la misma función que escribe el brazo', () => {
    expect(state.join('\n')).toContain('public bool? DefaultSilent { get; set; }');
    expect(collections.join('\n')).toContain('DefaultSilent = DefaultSilentMark(entry.Id), InList = false');
    expect(count('DefaultSilent = DefaultSilentMark(entry.Id)', service)).toBe(2);
    expect(count('DefaultSilent = DefaultSilentMark(entry.Id)', collections)).toBe(1);
    expect(parity.slice(atPar('private bool? DefaultSilentMark(string id) =>') - 1, atPar('private bool? DefaultSilentMark(string id) =>') + 1).join(' '))
      .toContain('DesktopDefaultSilent.Mark(DefaultSilentsOf(DesktopDefaultSilent.AccountKey(_client?.User?.id ?? 0)), id)');
  });

  it('los seis envíos con flag preguntan por el defecto antes de mandar', () => {
    const sites: number[] = [];
    service.forEach((row, index) => { if (row.includes(CALL)) sites.push(index + 1); });
    expect(sites).toHaveLength(6);
    // Ningún envío con flag se salva: quedarse con el flag de la pantalla sería mandar notificado lo que la cuenta
    // decidió callar, que es justo lo que TDLib no permite en Android.
    expect(count('var silent = Bool(args, "silent");', service)).toBe(0);
    expect(service[sites[0] - 1]).toContain('SilentFor(entry.Id, args);');
    expect(service[sites[1] - 1]).toContain('SilentFor(target.Id, args);');
    for (const at of sites.slice(2)) expect(service[at - 1]).toContain('SilentFor(entry.Id, args);');
    expect(parity.join('\n'))
      .toContain('DesktopDefaultSilent.SilentFor(DefaultSilentsOf(DesktopDefaultSilent.AccountKey(_client?.User?.id ?? 0)), chatId, Bool(args, "silent"));');
  });

  it('el hueco que no se tapa se dice por su nombre, no se disimula con el andamio', () => {
    // `business.quick.send`: la librería no tiene parámetro `silent` por donde meter el defecto.
    const quick = body(parity, 'private async Task<object> QuickSendAsync(JsonElement args)', 'DesktopParity.cs');
    expect(quick).toContain('await client.Messages_SendQuickReplyMessages(chat.Input, shortcutId, ids,');
    expect(quick).not.toContain(CALL);
    expect(quick).not.toContain('silent');
    // Y en Android la misma orden se manda sin opciones —la clase tampoco tiene campo—, que es donde el defecto actúa.
    expect(bridge[atJava('case "business.quick.send":') - 1])
      .toContain('new TdApi.SendQuickReplyShortcutMessages(session.activeChat,(int)BridgePolicy.id(p,"id"),0)');
    const request = tdlib.slice(en('public static class SendQuickReplyShortcutMessages extends Function<Messages>', tdlib, 'TdApi.java') - 1,
      en('public static class SendQuickReplyShortcutMessages extends Function<Messages>', tdlib, 'TdApi.java') + 30).join('\n');
    expect(request).not.toContain('MessageSendOptions options;');
  });
});

describe('ronda CJ · la pantalla', () => {
  it('la fila trae el defecto, el compositor arranca con él y cada envío lo lleva', () => {
    expect(contract.join('\n')).toContain('defaultSilent?:boolean }');
    const effect = atApp('useEffect(()=>{setSilent(active?.defaultSilent===true);');
    expect(app[effect - 1]).toContain('},[state.active,active?.defaultSilent]);');
    expect(app[atApp("await run<boolean>('send.text',{...draftScope") - 1]).toContain('acknowledge:state.uncertain,silent,');
    // El estado del compositor es uno solo; los otros dos `silent` son del reenvío y del bot, con su propio estado.
    expect(count('const [selected,setSelected]=useState<Set<string>>(new Set());const [silent,setSilent]=useState(false)', app)).toBe(1);
  });

  it('el menú ofrece las dos direcciones con sus dos avisos, y solo si se puede escribir', () => {
    const line = atApp('function setDefaultSilent');
    expect(app[line - 1]).toContain(`void run<boolean>('${KEY}',{id:chat.id,value})`);
    expect(app[line - 1]).toContain('Los mensajes de esta conversación salen sin notificación por defecto.');
    expect(app[line - 1]).toContain('Los mensajes de esta conversación vuelven a avisar por defecto.');
    // La guarda: sin cuenta que escriba o sin conversación abierta, la orden no se manda.
    const item = atApp('setDefaultSilent(active,!active.defaultSilent)');
    expect(app[item - 1]).toContain('if(!active||!state.canSend){setDialog(undefined);return;}');
    expect(app[item - 1]).toContain("label={active?.defaultSilent?'Quitar el silencio por defecto':'Enviar sin notificación por defecto'}");
    expect(app[item - 1]).toContain('icon={active?.defaultSilent?<BellOff/>:<Bell/>}');
    expect(count('setDefaultSilent(active', app)).toBe(1);
  });

  it('la fila del andamio declara la clave como viva, junto al silencio que ya estaba', () => {
    const row = en("'chat.read', 'chat.unread', 'chat.archive', 'chat.mute'", scope, 'desktopScope.ts');
    expect(scope[row - 1]).toContain(`'${KEY}'`);
    expect(scope[row - 1]).toContain("label: 'lectura, archivo y silencio'");
    expect(count(KEY, scope)).toBe(1);
    // Y en el puente de Android la clave viva es la misma cadena, no una parecida.
    expect(policy).toContain(`"${KEY}"`);
  });
});

describe('ronda CJ · las citas', () => {
  /** Lo que tiene que decir hoy la primera línea de cada cita. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    'BridgePolicy.java:52': 'static { METHODS.add("chat.defaultSilent"); }',
    'NativeBridge.java:174': 'if(!silent&&schedule==0&&!raw.equals("online"))return null;',
    'NativeBridge.java:735': 'case "chat.defaultSilent":',
    'NativeSnapshot.java:107': '// `defaultSilent` es el aviso que se quita a lo que la propia cuenta envía',
    'TdApi.java:10697': 'Default value of the disableNotification parameter, used when a message is sent to the chat.',
    'TdApi.java:158277': 'Changes the value of the default disableNotification parameter, used when a message is sent to a chat.',
    'TdSession.java:435': '} else if (object instanceof TdApi.UpdateChatDefaultDisableNotification) {',
    'TdSession.java:438': 'chats.get(value.chatId).defaultDisableNotification = value.defaultDisableNotification; emit("chats");',
    'TelegramService.cs:224': '"chat.defaultSilent" => SetDefaultSilent(args),',
    'DesktopParity.cs:285': 'private object SetDefaultSilent(JsonElement args)',
    'DesktopState.cs:128': 'public bool? DefaultSilent { get; set; }',
    'App.tsx:182': 'useEffect(()=>{setSilent(active?.defaultSilent===true);',
    'App.tsx:1183': 'function setDefaultSilent(chat:Chat,value:boolean)',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'NativeSnapshot.java:107': [109, 'if(chat.defaultDisableNotification)data.put("defaultSilent",true);'],
    'DesktopParity.cs:285': [296, '}'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'App.tsx' ? app
        : file === 'BridgePolicy.java' || file === 'NativeBridge.java' || file === 'NativeSnapshot.java' || file === 'TdSession.java' ? rows(`${javaDir}${file}`)
          : rows(`${host}${file}`);
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const files = [`${host}DesktopDefaultSilent.cs`, './rondaCJ.test.ts'];
  const written = new Map<string, number>();
  for (const path of files) for (const row of rows(path)) {
    for (const match of row.matchAll(/([A-Za-z][\w.]*\.(?:java|cs|tsx|ts)):(\d+)(?:-(\d+))?/g)) {
      const start = `${match[1]}:${match[2]}`;
      written.set(start, Math.max(written.get(start) ?? 0, Number(match[3] ?? 0)));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [at, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(at);
      const [file] = citation.split(':');
      expect(lineOf(file, at), `${citation} termina en ${at}`).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const loose: string[] = [];
    for (const path of files) rows(path).forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) loose.push(`${path.split('/').pop()}:${index + 1}`);
    });
    expect(loose).toEqual([]);
  });
});
