import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * La ronda BR pinta por fin la tarjeta del enlace en Windows y conecta el botón que la abre. Antes de la ronda el
 *DTO del host no tenía campo `preview`, así que `<section className="link-preview">` de `MessageContent.tsx:152` no
 * se pintaba nunca en escritorio y «Abrir enlace externo» llamaba a un `message.link` que caía en el rechazo genérico
 * del despacho: la mitad escrita y la mitad muda.
 *
 * Lo que vigila esta prueba son las cuatro piezas por las que el flujo puede romperse. Primera la negación: Android
 * lanza `IllegalArgumentException()` sin texto en sus cuatro guardas (`NativeBridge.java:787`) y es el envoltorio
 * (`:167`) el que pone encima la única frase que la persona oye; en Windows esa frase vive una sola vez en
 * `DesktopBridge.InvalidRequest` y los cuatro rechazos la piden por alias. Segunda la tarjeta: las cuatro claves, los
 * dos recortes —240 y 700— y el sitio sin recortar, medidos sobre la línea que los escribe
 * (`NativeSnapshot.java:227`), más lo que esa línea **no** escribe: la dirección, que viaja dentro de la fila y se
 * pide por el número del mensaje. Tercero el predicado del temporizador, que en Android es uno solo
 * (`MessageExtras.temporary`) y mira la proyección y el brazo por igual; aquí `DesktopSenderProfile.IsEphemeral`, con
 * las dos mitades pidiéndolo por alias y ninguna escribiendo `ttl_period`. Cuarto el orden de guardas, medido por
 * posición en los tres cables.
 *
 * Y una diferencia de protocolo que no es un defecto: en TDLib la tarjeta es un campo del contenido de texto y en
 * MTProto es un adjunto, así que las dos guardas de Java («¿es texto?» y «¿tiene tarjeta?») son aquí una sola mirada
 * a la clase de `media`. La prueba lo comprueba leyendo las dos formas, no dando por bueno que sean la misma.
 *
 * Las cuatro pruebas del final no leen texto: arrancan el andamio en modo escritorio, abren la conversación del
 * muestrario y llaman, porque son las únicas que pueden decir si lo que contesta la fila es lo que la pantalla pinta.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const JAVA = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';

const java = text(`${JAVA}NativeBridge.java`);
const snapshot = text(`${JAVA}NativeSnapshot.java`);
const extras = text(`${JAVA}MessageExtras.java`);
const envelope = text('../../desktop/src/WRGram.Desktop/DesktopBridge.cs');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopLinkPreview.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const profile = text('../../desktop/src/WRGram.Desktop/DesktopSenderProfile.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const content = text('./MessageContent.tsx');
const contract = text('./contract.ts');
const bridge = text('./bridge.ts');
const scope = text('./desktopScope.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

const lines = (from: string) => from.split(/\r?\n/);
const javaLines = lines(java);
const snapshotLines = lines(snapshot);
const extrasLines = lines(extras);
const contractLines = lines(contract);
const serviceLines = lines(service);

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const javaLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const snapshotLine = (number: number) => line(snapshotLines, number, 'NativeSnapshot.java');
const contractLine = (number: number) => line(contractLines, number, 'contract.ts');

/** El literal que una clase de C# asigna a una constante de texto, en una o dos líneas. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`(?:public const string|int|long) ${name} =\\s*(?:\\r?\\n\\s*)?"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"').replace(/\\\//g, '/');
}

/** Si la línea lleva esa frase escrita como literal entero. */
const says = (row: string, phrase: string) => row.includes(`"${phrase}"`);
const count = (needle: string, from: string) => from.split(needle).length - 1;

/** Un trozo entre dos agujas, medida la segunda después de la primera. */
function slice(needle: string, tail: string, from: string): string {
  const at = from.indexOf(needle);
  const end = from.indexOf(tail, at + needle.length);
  if (at < 0 || end < 0) throw new Error(`Falta el trozo ${needle}`);
  return from.slice(at, end);
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

const ARM = slice('private async Task<object?> MessageLinkAsync', '\n    private async Task<object?> TelegramLinkAsync', service);
const CASE = slice('case MessageMediaWebPage { webpage: WebPage page }:', '\n                case null:', service);
const SCAFFOLD = slice("if (method === 'message.link') {", "if (method === 'telegram.link'", preview);
const DTO = slice('public sealed class LinkPreviewDto', '\n}', state);

describe('ronda BR · la tarjeta del enlace y su botón también en Windows', () => {
  it('la orden está en las cuatro capas y su brazo va delante del rechazo', () => {
    expect(javaLine(787)).toContain('case "message.link":{TdApi.Message message=message(p);');
    expect(service).toContain('"message.link" => await MessageLinkAsync(args),');
    expect(service).not.toContain('"message.link" => throw');
    // Medido por relación, no por número: el número lo ancla la ronda BM, aquí importa el sitio.
    const arm = serviceLines.findIndex(row => row.includes('"message.link" =>')) + 1;
    const start = serviceLines.findIndex(row => row.includes('object? result = method switch')) + 1;
    const generic = serviceLines.findIndex(row => row.includes('No disponible en escritorio (beta): {method}')) + 1;
    expect(start).toBeLessThan(arm);
    expect(arm).toBeLessThan(generic);
    // Delante de `link.open`, que es el orden del puente: `:779` antes que `:780`.
    expect(arm).toBeLessThan(serviceLines.findIndex(row => row.includes('"link.open" =>')) + 1);
    expect(javaLine(788)).toContain('case "link.open":');
    // La pantalla ya tenía el botón y la hoja que lo llama; lo que no tenía era a quién preguntar.
    expect(content).toContain('<button className="text-button" onClick={openLink}>Abrir enlace externo</button>');
    expect(app).toContain('openLink={()=>openMessageLink(message)}');
    expect(bridge).toContain("'link.open', 'message.link', 'telegram.link',");
  });

  it('la negación es la frase del envoltorio de Android, una vez por capa y pedida por alias', () => {
    const phrase = csSentence('InvalidRequest', envelope);
    expect(phrase).toBe('Solicitud no válida o función no disponible.');
    // En Java la dice el envoltorio, no el brazo: las cuatro guardas de `:779` lanzan la excepción vacía.
    expect(says(javaLine(167), phrase)).toBe(true);
    expect(count(`"${phrase}"`, javaLine(787))).toBe(0);
    expect(count(`"${phrase}"`, java)).toBe(1);
    // En la capa nueva vive una sola vez, y el cable la pide por su nombre.
    expect(count(`"${phrase}"`, envelope)).toBe(1);
    expect(count(phrase, service)).toBe(0);
    expect(count('DesktopBridge.InvalidRequest', ARM)).toBe(4);
    // Ni el resto del host ni la pantalla la vuelven a escribir; el andamio sí, una vez, que es donde se lee.
    expect(count(phrase, rules + state + profile + app + content)).toBe(0);
    expect(count(`'${phrase}'`, preview)).toBe(1);
  });

  it('las cuatro claves de la tarjeta son las de Android, con sus dos recortes y sin dirección', () => {
    const card = snapshotLine(227);
    expect(card).toContain('.put("title",limit(link.title==null?"":link.title,240))');
    expect(card).toContain('.put("site",link.siteName==null?"":link.siteName)');
    expect(card).toContain('.put("description",limit(link.description==null?"":link.description.text,700))');
    expect(card).toContain('card.put("photo",image)');
    // Las cuatro y no cinco: la dirección se queda en la fila.
    for (const key of ['title', 'site', 'description', 'photo', 'preview']) expect(count(`put("${key}"`, card), key).toBe(1);
    expect(count('put("url"', card)).toBe(0);
    // Las dos mitades de la regla, en la clase que las declara.
    expect(rules).toContain('public const int TitleLimit = 240;');
    expect(rules).toContain('public const int DescriptionLimit = 700;');
    expect(rules).toContain('public static string Title(WebPage page) => DesktopContact.Limit(page.title ?? "", TitleLimit);');
    expect(rules).toContain('public static string Description(WebPage page) => DesktopContact.Limit(page.description ?? "", DescriptionLimit);');
    // El sitio va sin recortar, igual que en Java.
    expect(rules).toContain('public static string Site(WebPage page) => page.site_name ?? "";');
    expect(count('DesktopContact.Limit', rules)).toBe(2);
    // Y el DTO publica exactamente esas cuatro claves, ninguna de ellas la dirección.
    expect(DTO).toContain('public string Title { get; set; } = "";');
    expect(DTO).toContain('public string Site { get; set; } = "";');
    expect(DTO).toContain('public string Description { get; set; } = "";');
    expect(DTO).toContain('public MediaDto? Photo { get; set; }');
    expect(count('public string', DTO)).toBe(3);
    expect(DTO).not.toContain('Url');
    expect(contractLine(84)).toContain('preview?:{title:string;site:string;description:string;photo?:Media}');
    expect(count('url', contractLine(84))).toBe(0);
  });

  it('la dirección vive en la fila y solo la pide el brazo', () => {
    // En Java el brazo la saca de la tarjeta ya cargada (`openLinkOrTelegram(link.url,a)`), nunca del argumento.
    expect(javaLine(787)).toContain('openLinkOrTelegram(link.url,a)');
    expect(rules).toContain('public static string Url(WebPage page) => page.url ?? "";');
    expect(ARM).toContain('return await LinkFromUrlAsync(DesktopLinkPreview.Url(web), Bool(args, "confirmed"));');
    // El brazo no lee ninguna dirección en la petición: la lee en la fila.
    expect(ARM).not.toContain('Str(args, "url")');
    expect(count('page.url', service + state)).toBe(0);
    // Y la hoja del enlace es una sola para las tres puertas, como `openLinkOrTelegram` para las dos de Android.
    expect(count('LinkFromUrlAsync(', service)).toBe(3);
    expect(count('Bool(args, "confirmed")', service)).toBe(2);
    expect(count('openLinkedUrl(', preview)).toBe(3);
    expect(service).toContain('private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(Str(args, "url"), Bool(args, "confirmed"));');
  });

  it('el temporizador es un solo predicado y lo comparten la proyección y el brazo', () => {
    expect(line(extrasLines, 11, 'MessageExtras.java')).toContain('return message.selfDestructType != null || message.ephemeralContent != null;');
    // La proyección lo mira antes de escribir las cuatro claves...
    expect(snapshotLine(227)).toContain('if(!temporary&&message.content instanceof TdApi.MessageText&&(chat==null||!(chat.type instanceof TdApi.ChatTypeSecret)))');
    expect(line(snapshotLines, 166, 'NativeSnapshot.java')).toContain('boolean temporary=MessageExtras.temporary(message);');
    // ...y el brazo lo repite como su segunda guarda.
    expect(javaLine(787)).toContain('if(message.selfDestructType!=null||message.ephemeralContent!=null||!(message.content instanceof TdApi.MessageText))throw new IllegalArgumentException();');
    // En Windows el espejo lo escribió la ronda BP y las dos mitades lo piden por alias.
    expect(profile).toContain('public static bool IsEphemeral(MessageBase? row) => row switch');
    expect(count('ttl_period > 0', profile)).toBe(2);
    expect(count('ttl_period', service)).toBe(0);
    expect(count('DesktopSenderProfile.IsEphemeral(', service)).toBe(2);
    ordered(ARM, 'if (row == null) throw', 'if (DesktopSenderProfile.IsEphemeral(row)) throw', 'var web = DesktopLinkPreview.PageOf(row);');
    ordered(CASE, 'if (!DesktopSenderProfile.IsEphemeral(message))', 'dto.Preview = DesktopLinkPreview.Card(');
    // El andamio modela las dos mitades: la fila con temporizador se niega y no lleva tarjeta.
    expect(preview).toContain("'207': { url: 'https://wrgram.app/caduca', ephemeral: true }");
    ordered(SCAFFOLD, 'if (!row) throw new Error(INVALID_REQUEST);', 'if (seen?.ephemeral) throw new Error(INVALID_REQUEST);', 'if (!row.preview) throw new Error(INVALID_REQUEST);');
  });

  it('las dos guardas de Java sobre el contenido son una sola mirada al adjunto', () => {
    // TDLib guarda la tarjeta dentro del texto; MTProto la declara como `MessageMediaWebPage`. La diferencia está
    // escrita en la regla, no repartida por el cable.
    expect(rules).toContain('Message { media: MessageMediaWebPage page } => page.webpage as WebPage,');
    expect(rules).toContain('_ => null,');
    expect(count('PageOf', ARM)).toBe(1);
    expect(count('MessageText', ARM)).toBe(0);
    // Y la proyección cuelga la tarjeta solo cuando la página existe: un `break` sin `dto.Preview`.
    expect(count('dto.Preview', service)).toBe(1);
    expect(CASE).toContain('case MessageMediaWebPage { webpage: WebPage page }:');
    expect(CASE).toContain('break;');
    // La foto, además, solo se registra cuando la página la trae, con el nombre con que la registra Android.
    expect(says(snapshotLine(464), csSentence('PhotoName'))).toBe(true);
    expect(rules).toContain('public static Photo? PhotoOf(WebPage page) => page.photo as Photo;');
    expect(rules).toContain('if (media != null) card.Photo = media;');
    expect(CASE).toContain('shot == null ? null : _media.RegisterPhoto(shot, DesktopLinkPreview.PhotoName, exportable: exportable)');
    expect(count('"Vista previa del enlace"', service + state)).toBe(0);
    // La protección de la miniatura en chat restringido es la `exportable` de la fila, no una regla nueva.
    expect(snapshotLine(227)).toContain('if(restricted){protect(image);image.put("exportable",false);}');
    expect(count('exportable: exportable', CASE)).toBe(1);
  });

  it('el orden de guardas es el de Android, medido por posición en los tres cables', () => {
    // Fila del chat abierto → temporizador → contenido de texto → tarjeta → embudo.
    ordered(javaLine(787), 'message=message(p)', 'message.selfDestructType!=null', '!(message.content instanceof TdApi.MessageText)', ').linkPreview;', 'if(link==null)throw', 'openLinkOrTelegram(link.url,a)');
    // La primera guarda de Java es `message(p)` (`:364`): cuenta, fila y conversación activa.
    expect(line(javaLines, 364, 'NativeBridge.java')).toContain('requireAccount();');
    expect(line(javaLines, 364, 'NativeBridge.java')).toContain('message==null||message.chatId!=session.activeChat');
    // Windows: cuenta abierta → fila releída → temporizador → tarjeta → embudo, sin red antes de la fila.
    ordered(ARM,
      'var entry = FindEntry(_active);',
      'if (entry == null) throw new BridgeException(DesktopBridge.InvalidRequest);',
      'var id = Long(args, "id");',
      'await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });',
      'DesktopSenderProfile.Row(page.Messages, id);',
      'if (row == null) throw new BridgeException(DesktopBridge.InvalidRequest);',
      'if (DesktopSenderProfile.IsEphemeral(row)) throw new BridgeException(DesktopBridge.InvalidRequest);',
      'if (web == null) throw new BridgeException(DesktopBridge.InvalidRequest);',
      'return await LinkFromUrlAsync(');
    // Y el mismo orden en el andamio, con la última guarda en el sitio que en Java ocupa la tarjeta.
    ordered(SCAFFOLD,
      "const id = String(params.id);",
      'const row = poolOf(state.active).find(item => item.id === id);',
      'if (!row) throw new Error(INVALID_REQUEST);',
      'if (seen?.ephemeral) throw new Error(INVALID_REQUEST);',
      'if (!row.preview) throw new Error(INVALID_REQUEST);',
      'return openLinkedUrl(seen?.url ?? ',
      '!!params.confirmed);');
    // Ninguna de las cuatro guardas escribe: ni el andamio cambia su estado ni el cable llama a la red dos veces.
    expect(SCAFFOLD).not.toContain('acceptState');
    expect(count('await client.', ARM)).toBe(1);
  });

  it('la pantalla vuelve a pedir con `confirmed` y las dos puertas comparten la hoja', () => {
    expect(app).toContain("function handleTelegramLinkResult(result:TelegramLinkResult|boolean|undefined,url='',again?:(confirmed:boolean)=>void){");
    expect(app).toContain('if(!url&&!again)return;');
    expect(app).toContain('function openMessageLink(message:Message){const ask=(confirmed:boolean)=>run<TelegramLinkResult|boolean>(\'message.link\',{id:message.id,confirmed});');
    // La tarjeta pregunta por su número; el formulario de enlaces, por la dirección que tecleó la persona.
    expect(app).toContain('()=>{if(again)again(true);else void run<TelegramLinkResult>(\'telegram.link\',{url,confirmed:true})');
    // La tarjeta se re pide a sí misma con `confirmed`, no salta a la otra puerta con la dirección vacía.
    expect(app).toContain("handleTelegramLinkResult(answer,'',confirmed=>{void ask(confirmed)");
  });

  it('el aviso cruzó la clave y el andamio la modela con la frase de la capa', () => {
    expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes('message.link'))).toBe(true);
    expect(DESKTOP_PENDING.some(claim => claim.methods.includes('message.link'))).toBe(false);
    expect(scope).toContain("'telegram.link', 'link.open', 'message.link'");
    expect(desktopGapRefusal('message.link')).toBeUndefined();
    // Las dos cifras del aviso, contadas sobre las listas: la BY sumó diez claves de la familia del emoji quitando
    // nueve de las pendientes y la CB dejó de negar `location.live.stop` —el botón «Dejar de compartir» ya tiene
    // cable—, así que eran 158 disponibles y 125 pendientes. La CI sacó del aviso pendiente los tres enlaces de
    // carpeta y declaró `folders.link`, que ya tenía brazo desde la G, y la CJ sumó `chat.defaultSilent`, que también
    // lo tenía. La CK estrenó en la lista de pendientes la fila «cambiar el archivo de un mensaje enviado» con su
    // única clave `message.edit.media`: eran 163 vivos y 123 pendientes. La ronda CL añadió `calls.list` a la fila de
    // notificaciones, llamadas y WR IA, que sigue sin brazo en Windows: eran 163 vivos y 124 pendientes. La CK-B
    // escribió el brazo de `message.edit.media` (`TelegramService.cs:330`), movió su fila del aviso pendiente al de
    // disponible y sumó su clave a lo afirmado: eran 164 vivos y 123 pendientes. La ronda CD partió la fila de
    // Premium: sacó `premium.state` de la pendiente —la cableó en Windows (`TelegramService.cs:404`)— y la declaró
    // sola como la marca de la cuenta: eran 165 vivos y 124 pendientes. La CH-B escribió los dos brazos de los fondos
    // (`TelegramService.cs:507` y `TelegramService.cs:508`) y pasó su fila de pendientes a afirmada: hoy son 167 vivos
    // y 122 pendientes. La CT añadió la fecha de lectura y los lectores (`message.readDate` y `message.viewers`): son
    // 170 vivos y 122 pendientes, con las dos claves declaradas también en `BridgePolicy.java`.
    // La A02 estrenó en Android cambiar el número con la sesión abierta (`account.phone.change`,
    // `account.phone.check`, `account.phone.resend` — `BridgePolicy.java:57`, despachadas en `NativeBridge.java:566-568`),
    // y las dejó pendientes en el andamio (`desktopScope.ts:100`) porque el host las niega por su nombre
    // (`TelegramService.cs:154`): 170 vivos y 125 pendientes, contados sobre las dos listas.
    const available = new Set(DESKTOP_AVAILABLE.flatMap(claim => claim.methods));
    const pending = new Set(DESKTOP_PENDING.flatMap(claim => claim.methods));
    for (const method of ['message.readDate', 'message.viewers']) {
      expect(policy).toContain(`"${method}"`);
      expect(scope).toContain(`'${method}'`);
      expect(available.has(method)).toBe(true);
      expect(pending.has(method)).toBe(false);
    }
    for (const method of ['account.phone.change', 'account.phone.check', 'account.phone.resend']) {
      expect(policy).toContain(`"${method}"`);
      expect(scope).toContain(`'${method}'`);
      expect(available.has(method)).toBe(false);
      expect(pending.has(method)).toBe(true);
    }
    expect(available.size).toBe(170);
    expect(pending.size).toBe(125);
    expect([...available].filter(method => pending.has(method))).toEqual([]);
  });
});

describe('ronda BR · medido con las manos en el andamio', () => {
  let call: (method: string, params?: Record<string, unknown>) => Promise<unknown> = async () => undefined;
  const refused = csSentence('InvalidRequest', envelope);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const scaffold = await import('./preview');
    const module = await import('./bridge');
    module.acceptState({ ...scaffold.fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = scaffold.designRequest as typeof call;
    await call('chat.open', { id: '14' });
  });

  const ask = async (method: string, params: Record<string, unknown> = {}) =>
    call(method, params).catch((caught: Error) => caught.message);
  /** Lo que la pantalla tendría pintado: la fila tal y como la devuelve el puente, con su tarjeta o sin ella. */
  const rows = async (query: string) =>
    await ask('messages.search', { query }) as { id: string; preview?: { title: string; site: string; description: string; photo?: unknown } }[];

  it('la tarjeta del artículo se va al navegador sin preguntar nada', async () => {
    expect(await ask('message.link', { id: '201' })).toEqual({ action: 'link' });
    // Confirmada o no, un enlace que no es invitación no pregunta: `openLinkOrTelegram` lo abre y punto.
    expect(await ask('message.link', { id: '201', confirmed: true })).toEqual({ action: 'link' });
    const [seen] = await rows('Sitio');
    expect(seen.id).toBe('201');
    expect(seen.preview).toMatchObject({ site: 'wrgram.app', title: 'WRGram — un espacio para construir juntos' });
    expect(seen.preview?.photo).toMatchObject({ name: 'Vista previa del enlace' });
  });

  it('la tarjeta de una invitación pregunta antes de escribir y escribe al confirmar', async () => {
    expect(await ask('message.link', { id: '206' })).toEqual({
      action: 'invite_preview', title: 'Astronomía en Chile', members: 1204, approval: false,
    });
    expect(await ask('message.link', { id: '206', confirmed: true })).toEqual({ action: 'membership', state: 'joined' });
  });

  it('la fila con temporizador no pinta tarjeta y se niega con la frase del envoltorio', async () => {
    expect(await ask('message.link', { id: '207' })).toBe(refused);
    const [seen] = await rows('Apunte');
    expect(seen.id).toBe('207');
    // Y no es que la tarjeta esté y el botón la niegue: la fila llega sin tarjeta, como en `NativeSnapshot.java:227`.
    expect(seen.preview).toBeUndefined();
  });

  it('sin fila, sin tarjeta o sin conversación abierta la negación es la misma frase', async () => {
    // Un número que no está en el historial del chat abierto (`message(p)`).
    expect(await ask('message.link', { id: '999' })).toBe(refused);
    // Una fila de foto: adjunto hay, página no.
    expect(await ask('message.link', { id: '205' })).toBe(refused);
    expect((await rows('Foto de la última'))[0].preview).toBeUndefined();
    // Y con la conversación cerrada, que es el `session.activeChat` vacío de Android.
    expect(await ask('chat.close')).toBe(true);
    expect(await ask('message.link', { id: '201' })).toBe(refused);
  });
});
