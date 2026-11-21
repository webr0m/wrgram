import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * La ronda BQ conecta `chat.invite` en Windows: el brazo del despacho, el cable y las cinco frases que Android ya
 * decía y que aquí faltaban. Lo que esta prueba vigila son las cuatro piezas por las que el flujo puede romperse.
 *
 * Primero las frases: `createInviteLink` (`NativeBridge.java:1883`) niega de dos maneras y pregunta de una, y las
 * cinco cadenas que salen de ahí están copiadas carácter a carácter en `DesktopLinkManager`, cada una una sola vez
 * por capa. Dos de ellas son parecidas a otras que ya vivían aquí y no son la misma: «solo se crean» frente al
 * «solo existen» de la gestión de enlaces, y el botón «Crear enlace» frente al «Aplicar en Telegram» de
 * `confirmLink` (`:3724`) —Android tiene dos diálogos y dos rótulos, y unificarlos en Windows habría borrado uno de
 * los dos. Segundo el orden: forma, derecho, cuenta, ventana, escritura, cuenta, caja; medido por posición en los dos
 * cables, no por prosa. Tercero la puerta: la hoja de escritorio tiene que ofrecer lo mismo que la rama de Android,
 * con la misma guarda de forma. Y cuarto lo que no se copia: Android termina en un `Intent.ACTION_SEND` que en WPF no
 * existe, así que Windows toma el camino con el que el propio Android se queda cuando nadie le acepta ese `Intent` —
 * la caja seleccionable, sus dos cadenas y su botón único— y no inventa ni una hoja de compartir ni un copiado al
 * portapapeles que nadie pidió.
 *
 * Las tres pruebas del final no leen texto: arrancan el andamio en modo escritorio y llaman, porque son las únicas
 * que pueden decir si la fila que entra en «Mis enlaces» es la que el puente escribiría.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopLinkManager.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopLinkManagerFlow.cs');
const sheet = text('../../desktop/src/WRGram.Desktop/DesktopAccountPhoto.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');
const scope = text('./desktopScope.ts');
const validation = text('../../../docs/validation.md');
const audit = text('../../../docs/telegram-flow-audit-2026-11-13.md');

const javaLines = java.split('\n');
const policyLines = policy.split('\n');
const serviceLines = service.split('\n');

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const javaLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const policyLine = (number: number) => line(policyLines, number, 'BridgePolicy.java');

/** El literal que la clase de reglas de C# asigna a una constante de texto, en una o dos líneas. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
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

const FORM = body('private async Task<object?> CreateInviteAsync', cable);
const ARM = '"chat.invite" => await CreateInviteAsync(args),';
const ACCOUNT = 'if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);';

describe('ronda BQ · crear enlace de invitación también en Windows', () => {
  it('la orden está en las cuatro capas y su brazo va delante del rechazo', () => {
    expect(javaLine(694)).toContain('case "chat.invite":createInviteLink(p,a);break;');
    expect(policyLine(25)).toContain('"chat.invite"');
    expect(service).toContain(ARM);
    expect(service).not.toContain('"chat.invite" => throw');
    // Medido por relación, no por número: el número lo ancla la ronda BM, aquí importa el sitio.
    const arm = serviceLines.findIndex(row => row.includes(ARM)) + 1;
    const start = serviceLines.findIndex(row => row.includes('object? result = method switch')) + 1;
    const generic = serviceLines.findIndex(row => row.includes('No disponible en escritorio (beta): {method}')) + 1;
    expect(start).toBeLessThan(arm);
    expect(arm).toBeLessThan(generic);
    // Delante de las otras cuatro de su familia, que es el orden del puente de Android (:681 antes que :741).
    expect(arm).toBeLessThan(serviceLines.findIndex(row => row.includes('"chat.invitelinks" =>')) + 1);
    // El diálogo nativo deja la petición abierta: sin esto, la persona leería el cuadro con la promesa ya muerta.
    expect(bridge).toContain("'chat.invite', 'chat.subscription.create', 'chat.transfer',");
  });

  it('las cinco frases nuevas son literales de Android, cada una una vez por capa', () => {
    // Cuatro de las cinco las dice Android una sola vez en todo el puente. La quinta es el rótulo del botón positivo,
    // y ese lo repite en otros dos diálogos; se comprueba aparte, en la prueba de los dos diálogos, porque exigirle
    // unicidad a Java sería exigirle algo que Java no hace.
    for (const name of ['NotCreatable', 'QuickBody', 'DialogCreated', 'CreatedBody'] as const) {
      const phrase = `"${csSentence(name)}"`;
      expect(says(javaLine(1883), csSentence(name)), name).toBe(true);
      expect(count(phrase, java), `${name} en Java`).toBe(1);
      // En la capa nueva vive una sola vez: la dice la clase de reglas y el cable la pide por su nombre.
      expect(count(phrase, rules), `${name} en las reglas`).toBe(1);
      expect(count(phrase, cable), `${name} en el cable`).toBe(0);
      expect(count(phrase, sheet), `${name} en la ventana`).toBe(0);
    }
    // El botón de cerrar es el de siempre de Android, pero en esta capa no estaba escrito: era «Cancelar».
    expect(says(javaLine(1883), csSentence('DialogClose'))).toBe(true);
    expect(count('public const string DialogClose = "Cerrar";', rules)).toBe(1);
    expect(count('"Cerrar"', cable + sheet)).toBe(0);
    // Y las tres que se reutilizan, no se vuelven a escribir: el cable las pide por su nombre de constante.
    for (const name of ['NoRightCreate', 'DialogCreate', 'DefaultLabel'] as const) {
      expect(says(javaLine(1883), csSentence(name)), name).toBe(true);
      expect(count(`"${csSentence(name)}"`, FORM), `${name} escrito en el cable`).toBe(0);
      expect(FORM, `${name} pedido por alias`).toContain(`DesktopLinkManager.${name}`);
    }
    // La cuarta frase que este flujo necesita no es de su familia. Android no escribe ninguna guarda de cuenta en
    // `createInviteLink`: la que salta es la genérica del envoltorio con el que manda cada petición, y esa cadena ya
    // vivía en Windows desde la ronda BC. Usar la de los enlaces —«No se modificó ningún enlace.»— sería enseñar en
    // pantalla una frase que el puente java de este flujo nunca pronuncia.
    expect(javaLine(488)).toContain('void perform(');
    expect(javaLine(488)).toContain('"La cuenta cambió. Vuelve a abrir la conversación."');
    expect(count('"La cuenta cambió. Vuelve a abrir la conversación."', rules + cable + sheet)).toBe(0);
    expect(count('DesktopChatUsernames.ChangedAccount', FORM)).toBe(2);
    expect(count('DesktopLinkManager.ChangedAccount', FORM)).toBe(0);
  });

  it('donde se cita el envoltorio de Android, se cita su línea de hoy', () => {
    // `perform` se movió otra vez: las líneas que las rondas BD y CB añadieron más arriba lo dejaron en `:488`, y tres
    // cables y dos hojas seguían diciendo `:473`. Lo que se comprueba es la línea, no la prosa: si Java vuelve a
    // moverse, esto falla.
    // Se busca la cita, no la coincidencia: entre la palabra y el número no hay más que la pegatina de siempre
    // («` de `», « (`», «</c> (<c>»), así que una hoja que esté contando el error —como la de validación— no cuela.
    expect(javaLine(488)).toContain('void perform(');
    expect(javaLine(473)).not.toContain('void perform(');
    for (const [name, chunk] of [['las reglas', rules], ['el cable', cable], ['la ventana', sheet],
      ['el despacho', service], ['la pantalla', app], ['el andamio', preview],
      ['la hoja de validación', validation], ['la hoja de auditoría', audit],
      ['la cita de los nombres públicos', text('../../desktop/src/WRGram.Desktop/DesktopChatUsernameFlow.cs')],
      ['la cita de los permisos', text('../../desktop/src/WRGram.Desktop/DesktopGroupPermissionsFlow.cs')]] as const) {
      const stale = chunk.split('\n').filter(row => /perform[^\n]{0,12}:473/.test(row));
      expect(stale, `${name} cita perform en :473`).toEqual([]);
    }
  });

  it('los dos diálogos de Android siguen siendo dos diálogos en Windows', () => {
    // `createInviteLink` pregunta con su rótulo; el formulario de la ronda G lo hace con el de `confirmLink`.
    expect(says(javaLine(1883), csSentence('QuickAccept'))).toBe(true);
    // `confirmLink` ya no es una línea: la CB la partió en cinco, así que el botón se lee en `:3727`.
    expect(says(javaLine(3731), 'Aplicar en Telegram')).toBe(true);
    // «Crear enlace» es el rótulo que Android pone en este diálogo (y repite en otros dos, el de suscripción y el de
    // carpetas); «Aplicar en Telegram» es el con el que pregunta las escrituras ya elegidas, cinco veces en el puente.
    // Son dos botones distintos y en Windows siguen siéndolo: uno es una constante de esta familia y el otro se pide
    // por alias a la de la comunidad, y ninguno de los dos se vuelve a escribir como literal en el cable.
    expect(count('"Crear enlace"', java)).toBe(3);
    expect(count('"Aplicar en Telegram"', java)).toBe(5);
    expect(csSentence('QuickAccept')).not.toBe('Aplicar en Telegram');
    expect(count('"Aplicar en Telegram"', rules + cable)).toBe(0);
    expect(cable).toContain('ConfirmPhoto(title, body, DesktopCommunityInfo.DialogAccept, null);');
    expect(count('DesktopLinkManager.QuickAccept', FORM)).toBe(1);
    expect(FORM).toContain('ConfirmPhoto(DesktopLinkManager.DialogCreate, DesktopLinkManager.QuickBody, DesktopLinkManager.QuickAccept, null)');
    expect(count('ConfirmLink(DesktopLinkManager.DialogCreate,', cable)).toBe(1);
    // El cuerpo de este diálogo no es el del formulario: no hay nombre, caducidad ni límite que resumir.
    expect(FORM).not.toContain('DesktopLinkManager.FormBody');
    expect(count('DesktopLinkManager.QuickBody', cable)).toBe(2);
  });

  it('los siete días son el mismo número y no una cuenta propia', () => {
    expect(rules).toContain('public const long QuickSpan = 7L * 24 * 60 * 60;');
    expect(javaLine(1883)).toContain('7L*24*60*60');
    // La caducidad se calcula con la regla de la familia, no con una suma suelta dentro del cable.
    expect(FORM).toContain('DesktopLinkManager.Expires(DateTimeOffset.UtcNow.ToUnixTimeSeconds(), DesktopLinkManager.QuickSpan)');
    expect(preview).toContain('expires: now + 7 * 24 * 60 * 60');
    expect(604_800).toBe(7 * 24 * 60 * 60);
  });

  it('el orden de guardas es el de Android, medido por posición en los dos cables', () => {
    ordered(FORM,
      'var entry = RequireEntry(Str(args, "id"));',
      'if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.NotCreatable);',
      'if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightCreate);',
      'if (!ConfirmPhoto(DesktopLinkManager.DialogCreate',
      'var issued = await client.Messages_ExportChatInvite(',
      'Notice(DesktopLinkManager.DialogCreated',
      'return true;');
    // Las dos pasadas de `perform` (`:488`) sobre las dos idas a la red. La comprobación de Android va al entregar la
    // respuesta, no al pedirla, así que una cae antes de preguntar y otra antes de mostrar la caja.
    expect(count(ACCOUNT, FORM)).toBe(2);
    expect(FORM.indexOf(ACCOUNT)).toBeGreaterThan(FORM.indexOf('MayManageLinksAsync'));
    expect(FORM.indexOf(ACCOUNT)).toBeLessThan(FORM.indexOf('ConfirmPhoto('));
    expect(FORM.lastIndexOf(ACCOUNT)).toBeGreaterThan(FORM.indexOf('Messages_ExportChatInvite('));
    expect(FORM.lastIndexOf(ACCOUNT)).toBeLessThan(FORM.indexOf('Notice('));
    // El mismo orden, leído en la línea de Java: forma, derecho, ventana, escritura, hoja de compartir y caja.
    ordered(javaLine(1883),
      'answer.fail("Los enlaces de invitación solo se crean para grupos y canales.")',
      'if(!canInviteMembers(actor)){answer.fail("Telegram no concede a esta cuenta permiso para crear enlaces de invitación.")',
      '.setNegativeButton("Cancelar",(d,w)->answer.ok(false)).setPositiveButton("Crear enlace"',
      'perform(new TdApi.CreateChatInviteLink(chat.id,"WRGram",expiration,0,false)',
      'Intent share=new Intent(Intent.ACTION_SEND)',
      'setTitle("Enlace creado")');
    // Y el detalle que delata el orden: el derecho se pregunta antes de levantar el cuadro, nunca después.
    expect(javaLine(1883).indexOf('canInviteMembers(actor)')).toBeLessThan(javaLine(1883).indexOf('setTitle("Crear enlace de invitación")'));
  });

  it('la ventana es la del host, con su variante de botón único y caja seleccionable', () => {
    // El cuadro de confirmar sigue teniendo sus dos botones y su «Cancelar» de siempre.
    expect(sheet).toContain('Dialog(title, body, accept, DesktopProfilePhoto.Cancel, preview, null) == true;');
    expect(sheet).toContain('Dialog(title, body, close, null, null, value);');
    expect(sheet).toContain('if (cancel != null)');
    // La caja es de lectura y se puede seleccionar, como el `EditText` con `setTextIsSelectable(true)` de Android.
    expect(sheet).toContain('Text = value, IsReadOnly = true');
    // Una sola ventana construida en la capa, y el cable no levanta ninguna ni usa el cuadro del sistema.
    expect(count('new Window', sheet)).toBe(1);
    expect(count('new Window', cable)).toBe(0);
    expect(count('MessageBox.Show', sheet + cable)).toBe(0);
    // Y el portapapeles, que sí tiene cable en este host, no se toca: Android tampoco copia en este flujo.
    expect(cable).not.toContain('Clipboard');
    expect(FORM).toContain('Notice(DesktopLinkManager.DialogCreated');
  });

  it('la puerta de escritorio es la guarda de forma de Android, en el mismo hueco', () => {
    const door = "{(chat.supergroup===true||chat.type==='group'||chat.type==='channel')&&<MenuItem icon={<Link2/>} label=\"Crear enlace de invitación\" onClick={()=>{void run('chat.invite',{id:chat.id});setDialog(undefined);}}/>}";
    expect(desktopSheet()).toContain(door);
    expect(count(door, app)).toBe(2);
    // Crear antes que listar, igual que en la rama de Android y que en el puente (:681 antes que :741).
    ordered(desktopSheet(), 'label="Crear enlace de invitación"', 'label="Mis enlaces de invitación"');
    // La guarda es la pareja de formas de `:1863`, no `community(chat)`: el básico también crea su enlace.
    expect(desktopSheet()).not.toMatch(/community\(chat\)&&<MenuItem icon=\{<Link2\/>\} label="Crear enlace/);
  });

  it('el aviso cruzó la clave y el andamio la modela con la frase de la capa', () => {
    expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes('chat.invite'))).toBe(true);
    expect(DESKTOP_PENDING.some(claim => claim.methods.includes('chat.invite'))).toBe(false);
    expect(scope).toContain("'chat.photo.pick', 'chat.invite', 'chat.invitelinks', 'chat.invitelink.create'");
    expect(desktopGapRefusal('chat.invite')).toBeUndefined();
    // BQ cruzó `chat.invite` de pendientes a disponibles; la BR sumó `message.link` a la afirmación de enlaces y la BX
    // las dos claves de reaccionar. Las dos cifras vuelven a estar contadas sobre las listas, no copiadas: la BY afirmó
    // diez claves de la familia del emoji, sacó nueve de pendientes y dejó `emojiStatus.state` fuera de las dos listas
    // porque ninguna pantalla la llama, y la CB añade `location.live.stop` a lo afirmado —el botón «Dejar de compartir»
    // ya tiene cable— y estrena la fila de pendientes de compartir una ubicación desde el equipo con sus dos claves.
    // De 157 disponibles se pasa a 158 y de 123 pendientes a 125. La ronda CI sacó los tres enlaces de carpeta de
    // «pendiente» y declaró `folders.link`, que ya tenía brazo, y la CJ sumó `chat.defaultSilent` a la fila de
    // silencio, que también lo tenía (`TelegramService.cs:219`). La CK estrenó en la lista de pendientes la fila
    // «cambiar el archivo de un mensaje enviado» con su única clave `message.edit.media`: eran 163 vivos y 123
    // pendientes. La ronda CL metió `calls.list` en la fila de notificaciones, llamadas y WR IA —el registro de
    // llamadas solo existe en Android—, así que eran 163 vivos y 124 pendientes. La CK-B le dio brazo de verdad a
    // `message.edit.media` (`TelegramService.cs:325`), sacó su fila de pendientes y la sumó a la afirmada de editar:
    // eran 164 vivos y 123 pendientes. La ronda CD partió la fila de Premium: sacó `premium.state` de la pendiente —
    // la cableó en Windows (`TelegramService.cs:399`)— y la declaró sola como la marca de la cuenta. La CH-A estrenó en
    // Android los fondos de la cuenta (`backgrounds.list`, `background.set`) y los dejó pendientes en el andamio: hoy son 165
    // vivos y 124 pendientes, contados sobre las dos listas.
    const available = new Set(DESKTOP_AVAILABLE.flatMap(claim => claim.methods));
    const pending = new Set(DESKTOP_PENDING.flatMap(claim => claim.methods));
    expect(available.size).toBe(165);
    expect(pending.size).toBe(124);
    expect([...available].filter(method => pending.has(method))).toEqual([]);
    expect(preview).toContain("if (method === 'chat.invite') {");
    ordered(preview, "if (method === 'chat.invite')", "if (method === 'chat.invitelinks')");
    expect(count(csSentence('NotCreatable'), preview)).toBe(1);
    expect(count(csSentence('QuickBody'), preview)).toBe(0);
    // La fila del andamio es la que el puente escribe: nombre fijo, sin límite y sin aprobación.
    expect(preview).toContain("name: 'WRGram', creator: '1001'");
    expect(preview).toContain('memberLimit: 0, memberCount: 0, pending: 0, approval: false');
  });
});

describe('ronda BQ · medido con las manos en el andamio', () => {
  let call: (method: string, params?: Record<string, unknown>) => Promise<unknown> = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const scaffold = await import('./preview');
    const module = await import('./bridge');
    module.acceptState({ ...scaffold.fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = scaffold.designRequest as typeof call;
  });

  const ask = async (method: string, params: Record<string, unknown> = {}) =>
    call(method, params).catch((caught: Error) => caught.message);
  // El andamio modela un solo muestrario de enlaces, como un solo panel hay abierto en pantalla: lo que crece con una
  // escritura es el `total` de la página, porque la primera página va topada a veinte filas y ya venía llena.
  const page = async (id: string) => await ask('chat.invitelinks', { id, revoked: false }) as
    { links: Record<string, unknown>[]; total: number };

  it('crear en un grupo devuelve verdadero y la fila entra en la lista', async () => {
    const before = await page('14');
    expect(await ask('chat.invite', { id: '14' })).toBe(true);
    const after = await page('14');
    expect(after.total).toBe(before.total + 1);
    const [fresh] = after.links;
    expect(fresh).toMatchObject({ name: 'WRGram', memberLimit: 0, memberCount: 0, approval: false, revoked: false, paid: false, primary: false });
    // Siete días justos, contados desde ahora, y una caducidad que de verdad llega.
    const now = Math.floor(Date.now() / 1000);
    expect(Number(fresh.expires) - now).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 - 5);
    expect(Number(fresh.expires) - now).toBeLessThanOrEqual(7 * 24 * 60 * 60 + 5);
    expect(String(fresh.link)).toMatch(/^https:\/\/t\.me\/\+quick\d+$/);
  });

  it('el canal y el grupo básico también crean; el particular, el bot y el secreto se niegan con la frase de Java', async () => {
    expect(await ask('chat.invite', { id: '22' })).toBe(true);
    expect(await ask('chat.invite', { id: '23' })).toBe(true);
    const refused = csSentence('NotCreatable');
    const before = await page('22');
    expect(await ask('chat.invite', { id: '11' })).toBe(refused);
    expect(await ask('chat.invite', { id: '16' })).toBe(refused);
    expect(await ask('chat.invite', { id: '26' })).toBe(refused);
    expect(await ask('chat.invite', { id: '999' })).toBe(refused);
    // Y la negación no deja rastro: las cuatro llamadas no añadieron ninguna fila al muestrario.
    expect((await page('22')).total).toBe(before.total);
  });

  it('lo que se crea con un toque es la misma fila que sabe crear el formulario', async () => {
    expect(await ask('chat.invite', { id: '14' })).toBe(true);
    expect(await ask('chat.invitelink.create', { id: '14', name: '', expiresIn: 0, memberLimit: 0, approval: false })).toBe(true);
    const rows = (await page('14')).links;
    const quick = rows.find(row => String(row.link).includes('quick'))!;
    const form = rows.find(row => String(row.link).includes('new'))!;
    expect(quick.name).toBe('WRGram');
    expect(form.name).toBe('');
    expect(Object.keys(quick)).toEqual(Object.keys(form));
  });
});
