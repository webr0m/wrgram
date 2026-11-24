import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (url: string) => readFileSync(new URL(url, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const java = (name: string) => read(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const cs = (name: string) => read(`../../desktop/src/WRGram.Desktop/${name}.cs`);
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

const RULE_LITERALS = ['"Usuario de Telegram"', '"Conversación"', '"Tú"'];

describe('ronda BW · una persona sin nombre deja de ser un relleno para siempre', () => {
  const person = java('PersonName');
  const session = java('TdSession');
  const bridge = java('NativeBridge');

  it('la regla vive en un sitio y dice las tres cosas en orden', () => {
    expect(person).toContain('final class PersonName {');
    expect(person).toContain('static String of(TdApi.User user)');
    const of = body(person, 'static String of(TdApi.User user)');
    expect(of).toContain('if (user == null) return null;');
    expect(of).toContain('NativeSnapshot.limit(join(user.firstName, user.lastName), 90)');
    expect(of).toContain('if (!name.isEmpty()) return name;');
    expect(of).toContain('String username = username(user);');
    expect(of).toContain('return username == null ? null : NativeSnapshot.limit("@" + username, 90);');
    // Nada de rellenos aquí: quien llama pone la palabra, porque cada capa ya la tiene anclada.
    for (const literal of RULE_LITERALS) expect(of).not.toContain(literal);
    expect(person).toContain('private PersonName() { }');
  });

  it('el respaldo es el usuario público, no el de la cuenta propia', () => {
    const username = body(person, 'static String username(TdApi.User user)');
    expect(username).toContain('if (user == null || user.usernames == null) return null;');
    // `editableUsername` manda solo cuando existe y no está vacío; si no, el primer activo.
    expect(username).toContain('user.usernames.editableUsername != null && !user.usernames.editableUsername.isEmpty()');
    expect(username).toContain('user.usernames.activeUsernames[0]');
  });

  it('la burbuja pregunta la regla, conserva sus literales y pide el perfil que falta', () => {
    const sender = body(session, 'String senderName(TdApi.MessageSender sender)');
    for (const literal of RULE_LITERALS) expect(sender).toContain(literal);
    expect(sender).toContain('TdApi.User user = users.get(id); if (user == null) requestUser(id); String name = PersonName.of(user);');
    expect(sender).toContain('return name == null ? "Usuario de Telegram" : name;');
    // La concatenación pelada era la que devolvía una cadena vacía para un perfil mínimo.
    expect(sender).not.toContain('(user.firstName + " " + user.lastName).trim()');
    // Las agujas del host C# leen estas líneas por su número: firma en 1310, cierra en 1317.
    // Las seis que sumó la ronda CH-A2 sobre la sesión y las de CT movieron la banda: medida, no restada.
    expect(line(session, 1310)).toContain('String senderName(TdApi.MessageSender sender)');
    expect(line(session, 1309)).toBe('    }');
    expect(line(session, 1318)).toContain('TdApi.File senderPhoto');
  });

  it('la recuperación se pide una vez por identificador y se aprovecha al repintar', () => {
    const request = body(session, 'void requestUser(long id)');
    expect(request).toContain('if (!ready() || id == 0 || id == selfId || users.containsKey(id) || !unknownUsers.add(id)) return;');
    expect(request).toContain('perform(new TdApi.GetUser(id), user -> {');
    expect(request).toContain('unknownUsers.remove(id);');
    expect(request).toContain('users.put(id, user);');
    expect(request).toContain('while (users.size() > 2000) users.remove(users.keySet().iterator().next());');
    expect(request).toContain('emit("chats"); emit("messages");');
    // Sin reintento infinito: el fallo deja el identificador apuntado hasta cerrar sesión.
    expect(request).toContain('}, ignored -> { });');
    expect(session).toContain('private final Set<Long> unknownUsers = new HashSet<>();');
    // Y lo que ya sabía Telegram cuenta: la respuesta por su cuenta limpia el pendiente.
    expect(line(session, 362)).toContain('users.put(user.id, user); unknownUsers.remove(user.id);');
    expect(line(session, 341)).toContain('uncertainSends.clear(); unknownUsers.clear(); typingUsers.clear();');
  });

  it('la lista de administradores ya no pregunta solo por el usuario editable', () => {
    const member = body(bridge, 'private JSONObject memberDto(TdApi.ChatMember member');
    expect(member).toContain('String name=PersonName.of(user);');
    expect(member).toContain('if(name==null){name="Usuario de Telegram";session.requestUser(userId);}');
    expect(member).not.toContain('editableUsername');
    expect(line(bridge, 2795)).toContain('PersonName.of(user)');
    expect(line(bridge, 2796)).toContain('session.requestUser(userId)');
    // El cuerpo de memberDto no se desplaza: sus agujas siguen apuntando a su sitio.
    expect(line(bridge, 2792)).toContain('private JSONObject memberDto');
    expect(line(bridge, 2802)).toBe('    }');
  });

  it('la lista de un grupo básico también despierta la recuperación', () => {
    expect(line(bridge, 2848)).toContain('TdApi.User user=session.user(userId);if(PersonName.of(user)==null)session.requestUser(userId);');
    // `rosterName` ya hacía la regla bien, pero la hacía en su casa: ahora la pide y se queda con su relleno.
    const roster = body(bridge, 'private static String rosterName(TdApi.User user)');
    expect(roster).toContain('if(user==null)return "Usuario de Telegram";');
    expect(roster).toContain('String name=PersonName.of(user);');
    expect(roster).not.toContain('user.firstName');
    expect(roster).not.toContain('NativeSnapshot.limit');
    expect(line(bridge, 2870)).toBe('    }');
    expect(line(bridge, 2871)).toContain('private static String rosterUsername(TdApi.User user){');
    expect(line(bridge, 2875)).toBe('    }');
  });

  it('ninguna superficie repite ya la regla y los archivos no se movieron de su aguja', () => {
    const calls = java('TelegramCalls');
    // Los hosts C# y las notas citan líneas de estos archivos por su número: el total es la invariant.
    // Medido hoy con `wc -l`: la ronda CH-A puso el bloque de los fondos al final del puente y la CH-A2 sumó
    // nueve líneas a la sesión; la CQ añadió al final los dos brazos de notificación. CT volvió a medir ambos
    // archivos después de insertar sus métodos de lectura: 5578 líneas el puente y 1429 la sesión.
    expect(bridge.split('\n').length - 1).toBe(5578);
    expect(session.split('\n').length - 1).toBe(1429);
    expect(calls.split('\n').length - 1).toBe(289);
    // Las cuatro superficies que pintan un nombre llaman a la misma función.
    expect(line(bridge, 2795)).toContain('PersonName.of(user)');
    expect(line(bridge, 2848)).toContain('PersonName.of(user)');
    expect(line(session, 1313)).toContain('PersonName.of(user)');
    expect(line(calls, 65)).toContain('String name = PersonName.of(user); return name == null ? "Telegram" : name;');
    // Y ninguna de las cuatro vuelve a concatenar los dos nombres por su cuenta.
    expect(bridge.split('\n').slice(2779, 2790).join('\n') + line(calls, 65)).not.toContain('user.firstName + ');
    // El recorte a noventa que Windows cita está donde dice la cita.
    expect(line(person, 21)).toContain('NativeSnapshot.limit(join(user.firstName, user.lastName), 90)');
    expect(line(person, 24)).toContain('NativeSnapshot.limit("@" + username, 90)');
  });

  it('Windows cita las líneas que de verdad describen la regla', () => {
    const roster = cs('DesktopGroupRoster');
    expect(roster).toContain('<c>NativeBridge.java:2864-2870</c>');
    expect(roster).toContain('<c>:2856-2860</c>');
    expect(roster).not.toContain(':2754-2758');
    expect(line(bridge, 2875)).toBe('    }');
    // Windows dice el arroba con su propia lectura de MTProto, en el mismo orden que Android.
    const join = cs('DesktopJoinRequestsFlow');
    const person = body(join, 'private string PersonName(long userId');
    expect(join).toContain('<c>TdSession.java:1310-1316</c>');
    expect(person).toContain('var handle = DesktopContact.Username(person);');
    expect(person).toContain('return handle.Length == 0 ? DesktopGroupMembers.UnknownPerson : "@" + handle;');
    // Y el párrafo que contaba el arroba como divergencia apunta ahora a las líneas que describen la regla.
    const members = cs('DesktopGroupMembers');
    expect(members).toContain('(<c>:2792-2802</c>)');
    expect(members).toContain('<c>:2798-2800</c>');
    // Ninguna cita de esta banda puede quedarse en el antes de la ronda BV: los números van con el archivo.
    expect(members).not.toMatch(/<c>:2[0-6][0-9][0-9]<\/c>/);
    expect(members).not.toMatch(/<c>:1[0-7][0-9][0-9]<\/c>/);
    expect(members).toContain('(<c>:2802</c>)');
    expect(members).toContain('<c>:2776</c>');
    expect(members).toContain('<c>:2865</c>');
    expect(members).toContain('<c>:1882</c> y <c>:1884</c>');
    expect(members).toContain('La regla del');
  });
});
