import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const model = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/InviteLinks.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopLinkManager.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopLinkManagerFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const community = text('../../desktop/src/WRGram.Desktop/DesktopCommunityInfo.cs');
const app = text('./App.tsx');
const panel = text('./InviteLinksPanel.tsx');
const shared = text('./inviteLinkModel.ts');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');

const javaLines = java.split('\n');
const modelLines = model.split('\n');
const appLines = app.split('\n');

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const bridgeLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const modelLine = (number: number) => line(modelLines, number, 'InviteLinks.java');
const appLine = (number: number) => line(appLines, number, 'App.tsx');

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** El entero que C# asigna a un techo, o el de Java: las dos formas de escribir el mismo número. */
function csNumber(name: string): number {
  const match = new RegExp(`public const (?:int|long) ${name} = ([0-9_]+)`).exec(rules);
  if (!match) throw new Error(`Falta el techo ${name}`);
  return Number(match[1].replace(/_/g, ''));
}
function javaNumber(name: string): number {
  const match = new RegExp(`static final int ${name} = ([0-9_]+)`).exec(model);
  if (!match) throw new Error(`Falta el techo ${name} de InviteLinks`);
  return Number(match[1].replace(/_/g, ''));
}

/** Si la línea lleva esa frase escrita como literal entero. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);
const count = (needle: string, from: string) => from.split(needle).length - 1;

/** El cuerpo de un método, cortado por el siguiente bloque de documento. */
function body(needle: string, from: string): string {
  const at = from.indexOf(needle);
  if (at < 0) throw new Error(`Falta ${needle}`);
  const rest = from.slice(at);
  const next = rest.indexOf('\n    /// <summary>', 1);
  return next < 0 ? rest : rest.slice(0, next);
}

/** Orden de apariciones dentro de un cuerpo: la prueba del cortafuegos es la posición, no una afirmación. */
function ordered(from: string, ...needles: string[]): void {
  const positions = needles.map(needle => {
    const at = from.indexOf(needle);
    if (at < 0) throw new Error(`Falta la aguja "${needle}"`);
    return at;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

/** La rama de escritorio del menú de conversación, cortada antes de la rama de Android. */
function desktopSheet(): string {
  const start = app.indexOf('function chatMenu(chat:Chat){');
  const end = app.indexOf('const action=(method:string,value:boolean)', start);
  if (start < 0 || end < 0) throw new Error('Falta la hoja de opciones de escritorio');
  return app.slice(start, end);
}

const READ = body('private async Task<object?> InviteLinksAsync', cable);
const FORM = body('private async Task<object?> InviteLinkFormAsync', cable);
const REVOKE = body('private async Task<object?> RevokeInviteLinkAsync', cable);

/** Las trece claves de una fila, en el orden en que se escriben. */
const keys = (from: string, pattern: RegExp) => [...from.matchAll(pattern)].map(found => found[1]);

describe('ronda BF · las cuatro capas dicen lo mismo de los enlaces de invitación', () => {
  it('el despacho de las cuatro órdenes está en las tres capas', () => {
    expect(bridgeLine(741)).toContain('case "chat.invitelinks":inviteLinks(p,a);break;');
    expect(bridgeLine(742)).toContain('case "chat.invitelink.create":try{inviteLinkForm(p,a,true);}catch(Exception invalid){a.fail(invalid.getMessage());}break;');
    expect(bridgeLine(743)).toContain('case "chat.invitelink.edit":try{inviteLinkForm(p,a,false);}catch(Exception invalid){a.fail(invalid.getMessage());}break;');
    expect(bridgeLine(744)).toContain('case "chat.invitelink.revoke":revokeInviteLink(p,a);break;');
    expect(policy).toContain('static { METHODS.addAll(Arrays.asList("chat.invitelinks","chat.invitelink.create","chat.invitelink.edit","chat.invitelink.revoke")); }');
    for (const arm of [
      '"chat.invitelinks" => await InviteLinksAsync(args),',
      '"chat.invitelink.create" => await InviteLinkFormAsync(args, create: true),',
      '"chat.invitelink.edit" => await InviteLinkFormAsync(args, create: false),',
      '"chat.invitelink.revoke" => await RevokeInviteLinkAsync(args),',
    ]) expect(service).toContain(arm);
    for (const dead of ['chat.invitelinks" => throw', 'chat.invitelink.create" => throw', 'chat.invitelink.edit" => throw', 'chat.invitelink.revoke" => throw'])
      expect(service).not.toContain(dead);
    // Las tres escrituras esperan la confirmación de la persona: sin esto, el plazo corto abandona el diálogo.
    for (const method of ['chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke'])
      expect(bridge).toContain(`'${method}'`);
    expect(bridge).toContain("'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke', 'chat.request.answer',");
  });

  it('los cinco techos son el mismo número en las dos capas', () => {
    expect(csNumber('PageSize')).toBe(javaNumber('PAGE'));
    expect(csNumber('MaxUrl')).toBe(javaNumber('MAX_URL'));
    expect(csNumber('MaxName')).toBe(javaNumber('MAX_NAME'));
    expect(csNumber('MaxMembers')).toBe(javaNumber('MAX_MEMBERS'));
    expect(csNumber('MaxSpan')).toBe(javaNumber('MAX_SPAN'));
    // El andamio comparte los techos con la pantalla, no los reinventa.
    expect(shared).toContain('export const MAX_NAME = 32;');
    expect(shared).toContain('export const MAX_MEMBERS = 99_999;');
    expect(shared).toContain('export const MAX_SPAN = 31_536_000;');
  });

  it('cada frase vive una vez por capa, con la cadena de Java delante', () => {
    // La cuenta de Java es lo que hay en el archivo, medido: `NoRightCreate` y `DialogCreate` las dice también el
    // viejo `createInviteLink` (:1863), que comparte las dos cadenas con el formulario de la ronda G.
    const measured: [string, string[], number][] = [
      ['Unsupported', ['3589', '3625', '3683'], 3],
      ['NoRightReview', ['3599'], 1],
      ['NoRightCreate', ['1863', '3643'], 2],
      ['NoRightEdit', ['3663'], 1],
      ['NoRightRevoke', ['3695'], 1],
      ['InvalidLink', ['3630'], 1],
      ['EmptyRevoke', ['3689'], 1],
      ['NotRecognised', ['3655', '3692'], 2],
      ['PaidLinks', ['3657'], 1],
      ['PrimaryEdit', ['3658'], 1],
      ['AlreadyRevoked', ['3659'], 1],
      ['OtherCreatorEdit', ['3664'], 1],
      ['OtherCreatorRevoke', ['3696'], 1],
      ['ChangedAccount', ['3713'], 1],
    ];
    for (const [name, places, occurrences] of measured) {
      const phrase = csSentence(name);
      for (const at of places) expect(says(bridgeLine(Number(at)), phrase), `${name} en :${at}`).toBe(true);
      expect(count(phrase, java), `${name} en Java`).toBe(occurrences);
      // El cable pide la constante: no repite la cadena.
      expect(count(phrase, cable), `${name} en el cable`).toBe(0);
      // El andamio no inventa copias: como mucho reproduce las veces que las dice el puente.
      expect(count(phrase, preview), `${name} en el andamio`).toBeLessThanOrEqual(occurrences);
    }
    // Las cuatro negaciones del marcador y las seis del formulario están en InviteLinks.java, no en el puente.
    expect(count(csSentence('CursorProblem'), model)).toBe(3);
    for (const [name, at] of [['BadName', 79], ['NameTooLong', 80], ['BadExpiry', 81], ['TooFar', 82], ['BadLimit', 83], ['ApprovalLimit', 84]] as const)
      expect(says(modelLine(at), csSentence(name)), name).toBe(true);
    expect(count(csSentence('TooFar'), model)).toBe(2); // `problem` y `expiration`, la misma prohibición dos veces.
    // Las dos frases que solo existen en Windows no se inventan: se nombran y se citan.
    for (const name of ['IncompleteApproval', 'PrimaryUnknown'] as const) {
      expect(count(csSentence(name), java)).toBe(0);
      expect(count(csSentence(name), cable), name).toBe(0);
    }
    // La frase en inglés es de Java: `requiredBool` (:2757) la arma con el nombre de la clave y el despacho de `:742`
    // reenvía el `getMessage()` tal cual. En Windows no se lanza: el documento la cita y el cable responde en español.
    expect(java).toContain('throw new IllegalArgumentException("Missing permission: "+key)');
    expect(rules).toContain('«Missing');
    expect(rules).toContain('permission: approval», llega a la pantalla en inglés');
    expect(cable).not.toContain('Missing permission');
  });

  it('los diálogos dicen las tres palabras de Android y reutilizan la ventana del host', () => {
    expect(says(bridgeLine(3644), csSentence('DialogCreate'))).toBe(true);
    expect(says(bridgeLine(3666), csSentence('DialogEdit'))).toBe(true);
    expect(says(bridgeLine(3698), csSentence('DialogRevoke'))).toBe(true);
    expect(says(bridgeLine(3641), csSentence('DefaultLabel'))).toBe(true);
    expect(says(bridgeLine(3665), csSentence('NoLabel'))).toBe(true);
    expect(says(bridgeLine(3711), 'Cancelar')).toBe(true);
    // El botón positivo y el tope de texto ya vivían en la ficha de la comunidad: una sola verdad por cadena.
    expect(community).toContain('public const string DialogAccept = "Aplicar en Telegram";');
    expect(says(bridgeLine(3712), 'Aplicar en Telegram')).toBe(true);
    expect(count('"Aplicar en Telegram"', rules + cable)).toBe(0);
    expect(count('"Ese texto es demasiado largo para enviarlo a Telegram."', rules + cable)).toBe(0);
    expect(cable).toContain('ConfirmPhoto(title, body, DesktopCommunityInfo.DialogAccept, null);');
    expect(count('new Window', cable)).toBe(0);
    expect(count('MessageBox.Show', cable)).toBe(0);
    expect(count('private static bool ConfirmLink(string title, string body)', cable)).toBe(1);
  });

  it('los tres cuerpos del diálogo son los de Android, palabra por palabra', () => {
    expect(bridgeLine(3679)).toContain('"Enlace «"+name+"» en «"+title+"»: "+validity+" y "+capacity');
    expect(bridgeLine(3679)).toContain('. Telegram aplica estos ajustes en cuanto lo confirmes; nadie se une por sí solo.');
    expect(rules).toContain('return "Enlace «" + label + "» en «" + title + "»: " + validity + " y " + capacity');
    expect(rules).toContain('". Telegram aplica estos ajustes en cuanto lo confirmes; nadie se une por sí solo.";');
    for (const fragment of ['no caduca', 'caduca el ', 'los nuevos tendrán que aprobarse', 'miembros a la vez', 'sin límite de miembros'])
      expect(rules).toContain(fragment);
    expect(bridgeLine(3677)).toContain('"los nuevos tendrán que aprobarse":"sin límite de miembros"');
    expect(bridgeLine(3678)).toContain('capacity="hasta "+memberLimit+" miembros a la vez"');
    // El cuerpo de revocar, con sus dos sufijos condicionales (:3698-3700).
    expect(bridgeLine(3698)).toContain('"Dejará de funcionar el enlace «"+name+"» de «"+title+"»"');
    expect(bridgeLine(3699)).toContain(', que además es el enlace principal: Telegram creará uno nuevo.');
    expect(bridgeLine(3700)).toContain(' Las "+current.memberCount+" personas que ya entraron seguirán en el chat.');
    expect(rules).toContain('"Dejará de funcionar el enlace «" + name + "» de «" + title + "»"');
    expect(rules).toContain('", que además es el enlace principal: Telegram creará uno nuevo." : "."');
    expect(rules).toContain('" personas que ya entraron seguirán en el chat."');
  });

  it('la fila y la página salen con las mismas claves, en el mismo orden', () => {
    const built = keys(model.slice(model.indexOf('static JSONObject row('), model.indexOf('static JSONObject page(')), /\.put\("([a-zA-Z]+)"/g);
    expect(built).toEqual(['link', 'name', 'creator', 'created', 'edited', 'expires', 'memberLimit', 'memberCount', 'pending', 'approval', 'primary', 'revoked', 'paid']);
    const written = keys(rules.slice(rules.indexOf('new Entry('), rules.indexOf('public readonly record struct Entry')), /^ {16}([a-zA-Z]+)(?: = |,)/gm);
    expect(written).toEqual(built);
    // La página: `total`, `links`, `revoked` en Java, y aquí además `next` y `cursor` siempre, vacío cuando no hay más.
    expect(modelLine(60)).toContain('.put("total", Math.max(0, total)).put("links", values).put("revoked", revoked)');
    for (const key of ['total = Math.Max(0L, total)', 'links = rows.Select(row => row.Row).ToList()', 'revoked,', 'next,'])
      expect(rules).toContain(key);
    expect(rules).toContain('cursor = next ? Token(rows[^1].Created, rows[^1].Link) : ""');
    expect(modelLine(66)).toContain('token(last.getInt("created"), last.getString("link"))');
    expect(rules).toContain('Math.Max(0L, created).ToString(CultureInfo.InvariantCulture) + ":" + link');
    expect(modelLine(26)).toContain('Integer.toString(Math.max(0, date)) + \':\' + (link == null ? "" : link)');
  });

  it('lo que la pantalla ofrece es lo que el puente acepta', () => {
    const sheet = desktopSheet();
    expect(sheet).toContain("{(chat.supergroup===true||chat.type==='group'||chat.type==='channel')&&<MenuItem icon={<KeyRound/>} label=\"Mis enlaces de invitación\" onClick={()=>{setDialog(undefined);setLinks(chat);}}/>}");
    expect(count('label="Mis enlaces de invitación"', app)).toBe(3);
    // La guarda es la forma de `:3589`, no `community(chat)`: el grupo básico también tiene enlace exportado.
    expect(sheet).not.toMatch(/community\(chat\)&&<MenuItem icon=\{<KeyRound\/>\}/);
    expect(app).toContain('{links&&<InviteLinksPanel chat={links} accountId={state.selfId} close={()=>setLinks(undefined)}/>}');
    expect(panel).toContain("request<InviteLinkPage>('chat.invitelinks', marker ? { id: chat.id, revoked: showing, cursor: marker } : { id: chat.id, revoked: showing })");
    expect(panel).toContain("const applied = await request<boolean>(method, { id: chat.id, accountId, ...params });");
    expect(panel).toContain("send(mode === 'create' ? 'chat.invitelink.create' : 'chat.invitelink.edit'");
    expect(panel).toContain("send('chat.invitelink.revoke', { link: item.link }");
    // El panel no promete editar lo que el puente va a negar: son las mismas tres exclusiones.
    expect(shared).toContain('export const canEdit = (link: InviteLink) => !link.primary && !link.paid && !link.revoked;');
    expect(shared).toContain('export const canRevoke = (link: InviteLink) => !link.revoked;');
    expect(panel).toContain('La confirmación definitiva la da Telegram en pantalla antes de escribir nada.');
  });

  it('los cortafuegos del cable están en el orden del puente', () => {
    ordered(READ,
      'if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.Unsupported);',
      'DesktopLinkManager.CursorIssue(marker)',
      'Bool(args, "revoked")',
      'if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightReview);',
      'DesktopLinkManager.PrimaryOf((await ReadFullAsync(client, entry, kind))?.full_chat) ?? ""',
      'client.Messages_GetExportedChatInvites(',
      'DesktopLinkManager.Page(rows, table.count, revoked)');
    expect(READ).toContain('new InputUserSelf()');
    // Crear: forma, cuenta, enlace, nombre, caducidad, límite, aprobación, permiso, ventana y luego Telegram. El
    // marcador no existe en este camino: `inviteLinkForm` no lo mira, y aquí tampoco —el marcador es de la lectura.
    ordered(FORM,
      'if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.Unsupported);',
      'Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;',
      'InvalidLink',
      'DesktopCommunityInfo.Prepared(text)',
      'DesktopLinkManager.Problem(name, expiresIn, memberLimit, approval)',
      'DesktopLinkManager.Expires(DateTimeOffset.UtcNow.ToUnixTimeSeconds(), expiresIn)',
      'throw new BridgeException(DesktopLinkManager.NoRightCreate);',
      'ConfirmLink(DesktopLinkManager.DialogCreate,',
      'await client.Messages_ExportChatInvite(entry.Input, Moment(expiration), Quota(memberLimit), label, null, false, approval);');
    expect(count('Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;', cable)).toBe(2);
    // Editar: se lee el enlace antes de tocarlo, y la primacía se pregunta porque MTProto no la trae en la fila.
    ordered(FORM,
      'var answer = await client.Messages_GetExportedChatInvite(entry.Input, url);',
      'throw new BridgeException(DesktopLinkManager.NotRecognised);',
      'if (primary is null) throw new BridgeException(DesktopLinkManager.PrimaryUnknown);',
      'DesktopLinkManager.NotEditable(exported, DesktopLinkManager.IsPrimary(exported, primary))',
      'throw new BridgeException(DesktopLinkManager.NoRightEdit);',
      'throw new BridgeException(DesktopLinkManager.OtherCreatorEdit);',
      'ConfirmLink(DesktopLinkManager.DialogEdit,',
      'await client.Messages_EditExportedChatInvite(entry.Input, url, Moment(expiration), Quota(memberLimit),');
    expect(FORM).toContain('name.Length == 0 ? null : name, false);');
    // Revocar: vacío, lectura, ya revocado, primacía, permiso, creador, ventana y la misma escritura con la bandera.
    ordered(REVOKE,
      'if (url.Length == 0) throw new BridgeException(DesktopLinkManager.EmptyRevoke);',
      'var answer = await client.Messages_GetExportedChatInvite(entry.Input, url);',
      'throw new BridgeException(DesktopLinkManager.NotRecognised);',
      'if (DesktopLinkManager.Revoked(exported)) return false;',
      'if (primary is null) throw new BridgeException(DesktopLinkManager.PrimaryUnknown);',
      'throw new BridgeException(DesktopLinkManager.NoRightRevoke);',
      'throw new BridgeException(DesktopLinkManager.OtherCreatorRevoke);',
      'ConfirmLink(DesktopLinkManager.DialogRevoke, DesktopLinkManager.RevokeBody(',
      'await client.Messages_EditExportedChatInvite(entry.Input, url, null, null, null, null, true);');
    // La cuenta que cambió a mitad del viaje se comprueba en cada salto, antes y después de la ventana: dos veces en
    // la lectura, ocho en el formulario (tres por el crear, cinco por el editar) y cinco en la revocación. La guarda
    // del botón positivo es la que Android pone dentro de `confirmLink` (`:3713`), y aquí es la misma posición.
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);', READ)).toBe(2);
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);', FORM)).toBe(8);
    expect(count('if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);', REVOKE)).toBe(5);
  });

  it('el cable reutiliza lo que ya estaba medido y no vuelve a escribirlo', () => {
    // La lectura del `full info`, la pregunta por el propio participante y la clave del canal son de las rondas AW,
    // AX y BB; esta ronda añade el enlace exportado, no una segunda forma de leer la comunidad.
    expect(cable).toContain('await ReadFullAsync(client, entry, kind)');
    expect(cable).toContain('SelfParticipantAsync(client, ChannelInput(entry))');
    expect(cable).toContain('BasicParticipantsAsync(client, entry)');
    expect(cable).toContain('DesktopMemberAdditions.MayInvite(');
    expect(cable).toContain('DesktopLinkManager.MayManageLinks(self)');
    expect(count('Channels_GetFullChannel', cable)).toBe(0);
    expect(count('Messages_GetFullChat', cable)).toBe(0);
    expect(count('ChatInviteExported.Flags', cable)).toBe(0);
    expect(rules).toContain('public static bool Revoked(ChatInviteExported link) => On(link.flags, ChatInviteExported.Flags.revoked);');
    // En MTProto no hay `RevokeChatInviteLink`: se revoca con la misma escritura del editar y su bandera.
    expect(cable).not.toContain('Messages_DeleteExportedChatInvite');
    // Las dos conversiones del `long` de Android a la forma que piden las escrituras de WTelegramClient viven en el
    // cable, junto a la petición: cero no es «sin caducidad» y el `null` de `usage_limit` es el modo de decirlo.
    expect(cable).toContain('epoch is { } value ? DateTimeOffset.FromUnixTimeSeconds(value).UtcDateTime : null');
    expect(cable).toContain('memberLimit > 0 ? (int)memberLimit : null');
  });

  it('las citas de archivo y línea del documento C# existen', () => {
    for (const file of [rules, cable]) {
      for (const [, at] of file.matchAll(/NativeBridge\.java:(\d+)/g)) expect(javaLines.length).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/InviteLinks\.java:(\d+)/g)) expect(modelLines.length).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/InviteLinks\.java:(\d+)-(\d+)/g)) expect(modelLines.length).toBeGreaterThan(Number(at));
      for (const [, at] of file.matchAll(/BridgePolicy\.java:(\d+)/g)) expect(Number(at)).toBeLessThan(policy.split('\n').length);
    }
    expect(rules).toContain('InviteLinks.java:40-56');
    expect(rules).toContain('NativeBridge.java:1843');
    expect(cable).toContain('NativeBridge.java:741-744');
    expect(cable).toContain('BridgePolicy.java:49');
    expect(cable).toContain('InviteLinksPanel.tsx:68');
    expect(line(panel.split('\n'), 68, 'InviteLinksPanel.tsx')).toContain("await load('', revoked)");
    // Toda cita suelta del puente (`:3611`, `:473`) señala una línea que existe: `:58` no entra porque es la clase de
    // reglas de este propio host, citada con `<see cref>`, no una línea de Java.
    for (const [, at] of `${rules}\n${cable}`.matchAll(/<c>:(\d{3,4})<\/c>/g)) expect(javaLines.length, `:${at}`).toBeGreaterThan(Number(at));
    for (const [, at] of `${rules}\n${cable}`.matchAll(/<c>:(\d{3,4})-(\d{3,4})<\/c>/g)) expect(javaLines.length, `:${at}`).toBeGreaterThan(Number(at));
  });

  it('ninguna cita de la pantalla señala una línea que ya no dice eso', () => {
    // La tabla es el cortafuegos del arrastre: cada ronda que mete líneas en el menú de escritorio descoloca
    // las que citan `App.tsx` por número. Aquí se declara una vez lo que tiene que decir cada línea citada.
    const anchors: Record<number, string> = {
      95: 'function ContactAvatar(',
      368: "raw.trim().replace(/^@/,'')",
      395: 'function openSessions()',
      736: 'const openRelated=',
      // Las dos de la puerta de agenda (ronda BL): la pantalla arma la orden según el estado de la persona y, solo
      // para quitarla, confirma antes de mandar nada.
      742: "run<boolean>(remove?'contacts.remove':'contacts.add'",
      743: "confirm('Quitar de contactos'",
      // Las tres de la puerta de bloqueo (ronda BI): la pantalla confirma y solo entonces manda la orden.
      744: 'changeBlock={(peer,blocked)=>{',
      746: "confirm(label+' a '+peer.title",
      747: "run<boolean>('profile.block'",
      789: 'function chatInfo(chat:Chat)',
      // La puerta de borrado automático de la rama de escritorio (ronda BN): la misma guarda de forma que la de
      // Android, y citada porque el andamio declara con ella que un chat secreto no se alcanza.
      885: 'label="Borrado automático"',
      896: 'label="Nombre y descripción"',
      920: 'label="Añadir personas"',
      1217: 'className="details-panel"',
      1288: 'const MEMBER_FILTERS',
      1379: 'Sin miembros para este filtro',
      1422: 'disabled={contact.bot}',
      1424: 'const GROUP_PERMISSION_FIELDS',
    };
    for (const [at, needle] of Object.entries(anchors)) expect(appLine(Number(at)), `App.tsx:${at}`).toContain(needle);
    const cited = new Set<number>();
    const hosts = [
      ...readdirSync(new URL('../../desktop/src/WRGram.Desktop/', import.meta.url))
        .filter(name => name.endsWith('.cs'))
        .map(name => text(`../../desktop/src/WRGram.Desktop/${name}`)),
      text('./groupPermissions.ts'), text('./preview.ts'), text('./inviteLinkModel.ts'),
    ];
    for (const source of hosts) for (const [, at] of source.matchAll(/App\.tsx:(\d+)/g)) cited.add(Number(at));
    // Toda cita escrita tiene su ancla medida, y toda ancla registrada está citada en alguna parte.
    expect([...cited].sort((a, b) => a - b)).toEqual(Object.keys(anchors).map(Number).sort((a, b) => a - b));
  });

  it('el andamio modela el flujo en lugar de prometer un vacío', () => {
    for (const method of ['chat.invitelinks', 'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke'])
      expect(count(`method === '${method}'`, preview)).toBe(1);
    expect(preview).not.toContain(`if (method === 'chat.invitelinks') return [];`);
    expect(preview).toContain('params.revoked ? revokedLinks : activeLinks');
    // Las dos negaciones que la pantalla ya ofrece como botones apagados están escritas en el andamio.
    expect(preview).toContain(`if (activeLinks[index].primary) throw new Error('El enlace principal no admite nombre, caducidad ni límite: revócalo y Telegram creará uno nuevo.');`);
    expect(preview).toContain(`if (activeLinks[index].paid) throw new Error('Los enlaces de suscripción se administran desde Stars.');`);
    expect(preview).toContain(`throw new Error('Telegram ya no reconoce ese enlace en este chat.');`);
  });
});

type Request = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda BF · medido con las manos en el andamio de escritorio', () => {
  let call: Request = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as Request;
  });

  // El andamio responde de forma síncrona y lanza con `throw`: la promesa no llega a existir, así que el `catch` de
  // la promesa no vale. Se mide igual que el puente: la frase que la pantalla acabaría leyendo.
  const ask = async (method: string, params: Record<string, unknown> = {}) => {
    try {
      return await call(method, params);
    } catch (caught) {
      return (caught as Error).message;
    }
  };
  const page = async (revoked = false, cursor?: string) =>
    await ask('chat.invitelinks', { id: '14', revoked, ...(cursor ? { cursor } : {}) }) as Record<string, unknown>;

  it('la primera página trae veinte filas, el total y el marcador para seguir', async () => {
    const first = await page();
    expect(Object.keys(first)).toEqual(['total', 'links', 'revoked', 'cursor', 'next']);
    expect(first.total).toBe(22);
    expect((first.links as unknown[]).length).toBe(20);
    expect(first.next).toBe(true);
    const last = (first.links as Record<string, unknown>[])[19];
    expect(first.cursor).toBe(`${last.created}:${last.link}`);
  });

  it('el marcador avanza y la última página lo deja vacío', async () => {
    const first = await page();
    const second = await page(false, String((first as Record<string, unknown>).cursor));
    expect((second.links as unknown[]).length).toBe(2);
    expect(second.next).toBe(false);
    // Las dos páginas no se pisan: la pantalla deduplica por enlace, no por posición.
    const links = [...(first.links as Record<string, unknown>[]), ...(second.links as Record<string, unknown>[])]
      .map(row => String(row.link));
    expect(new Set(links).size).toBe(22);
  });

  it('la pestaña de revocados es otro viaje, con su propio vaciado', async () => {
    const revoked = await page(true);
    expect(revoked.revoked).toBe(true);
    expect((revoked.links as Record<string, unknown>[]).every(row => row.revoked)).toBe(true);
    expect(revoked.next).toBe(false);
    expect(revoked.cursor === undefined || revoked.cursor === '').toBe(true);
  });

  it('crear deja el enlace nuevo al principio de la lista que se vuelve a pedir', async () => {
    expect(await call('chat.invitelink.create', {
      id: '14', accountId: '1001', name: 'Reunión de barrio', expiresIn: 86_400, memberLimit: 12, approval: false,
    })).toBe(true);
    const rows = (await page()).links as Record<string, unknown>[];
    expect(rows[0].name).toBe('Reunión de barrio');
    expect(rows[0].memberLimit).toBe(12);
    expect(rows[0].primary).toBe(false);
    expect(String(rows[0].link)).toContain('https://t.me/+new');
  });

  it('el enlace principal y el de suscripción se niegan con la frase de Android', async () => {
    const rows = (await page()).links as Record<string, unknown>[];
    const primary = String(rows.find(row => row.primary)!.link);
    const paid = String(rows.find(row => row.paid)!.link);
    expect(await ask('chat.invitelink.edit', { id: '14', accountId: '1001', link: primary, name: 'Otro', expiresIn: 0, memberLimit: 0, approval: false }))
      .toBe('El enlace principal no admite nombre, caducidad ni límite: revócalo y Telegram creará uno nuevo.');
    expect(await ask('chat.invitelink.edit', { id: '14', accountId: '1001', link: paid, name: 'Otro', expiresIn: 0, memberLimit: 0, approval: false }))
      .toBe('Los enlaces de suscripción se administran desde Stars.');
    expect(await ask('chat.invitelink.edit', { id: '14', accountId: '1001', link: 'https://t.me/+noexiste', name: 'Otro', expiresIn: 0, memberLimit: 0, approval: false }))
      .toBe('Telegram ya no reconoce ese enlace en este chat.');
  });

  it('lo que se guarda es lo que se vuelve a leer', async () => {
    const rows = (await page()).links as Record<string, unknown>[];
    const target = String(rows.find(row => !row.primary && !row.paid)!.link);
    expect(await call('chat.invitelink.edit', { id: '14', accountId: '1001', link: target, name: 'Vecinos del norte', expiresIn: 604_800, memberLimit: 0, approval: true }))
      .toBe(true);
    const after = (await page()).links as Record<string, unknown>[];
    const row = after.find(item => item.link === target)!;
    expect(row.name).toBe('Vecinos del norte');
    expect(row.approval).toBe(true);
    // Con aprobación pedida, el límite no viaja: es la misma negación del puente, en la pantalla.
    expect(row.memberLimit).toBe(0);
  });

  it('revocar mueve la fila de pestaña y no la borra', async () => {
    const rows = (await page()).links as Record<string, unknown>[];
    const target = String(rows.find(row => !row.primary && !row.paid)!.link);
    expect(await call('chat.invitelink.revoke', { id: '14', accountId: '1001', link: target })).toBe(true);
    const activos = (await page()).links as Record<string, unknown>[];
    expect(activos.some(row => row.link === target)).toBe(false);
    const revocados = (await page(true)).links as Record<string, unknown>[];
    expect(revocados[0].link).toBe(target);
    expect(revocados[0].revoked).toBe(true);
  });

  it('el formulario de la pantalla no promete lo que el puente niega', async () => {
    // Las cinco negaciones que `formProblem` comparte con `InviteLinks.problem` y con el cable, medidas una a una y
    // no de refilón: la pantalla deja de mandar lo que el puente iba a rechazar con la misma frase.
    const { formProblem } = await import('./inviteLinkModel');
    const cases: [{ name: string; expiresIn: number; memberLimit: number; approval: boolean }, string][] = [
      [{ name: 'n'.repeat(csNumber('MaxName') + 1), expiresIn: 0, memberLimit: 0, approval: false }, csSentence('NameTooLong')],
      [{ name: '', expiresIn: -1, memberLimit: 0, approval: false }, csSentence('BadExpiry')],
      [{ name: '', expiresIn: csNumber('MaxSpan') + 1, memberLimit: 0, approval: false }, csSentence('TooFar')],
      [{ name: '', expiresIn: 0, memberLimit: csNumber('MaxMembers') + 1, approval: false }, csSentence('BadLimit')],
      [{ name: '', expiresIn: 0, memberLimit: 10, approval: true }, csSentence('ApprovalLimit')],
    ];
    for (const [form, phrase] of cases) expect(formProblem(form), phrase).toBe(phrase);
    expect(formProblem({ name: 'Reunión de barrio', expiresIn: 86_400, memberLimit: 12, approval: false })).toBe('');
    // El andamio no valida el formulario: lo hace el puente, y aquí se ve que la pantalla no se lo salta.
    expect(await ask('chat.invitelink.create', { id: '14', accountId: '1001', name: '', expiresIn: 86_400, memberLimit: 0, approval: false })).toBe(true);
  });
});
