import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda BY — la familia del emoji en Windows, medida contra el puente que la inventó.
 *
 * Once claves llevaban desde el puente de Android en `BridgePolicy.java` —estado emoji, emoji personalizado, packs
 * de emojis y packs de stickers— y en Windows caían todas en el `_ => throw` genérico del despacho, que anuncia «no
 * disponible en escritorio (beta)» de cosas que WTelegramClient 4.4.10 sí sabe pedir. La ronda las cableó en dos
 * archivos: `DesktopEmojiCatalog.cs`, donde viven las frases, los topes y las guardas sin red, y
 * `DesktopEmojiCatalogFlow.cs`, donde vive el orden de las peticiones y las dos cachés que la librería obliga.
 *
 * Este archivo mide seis cosas, todas sobre el texto de las cuatro capas y sin copiar una cifra de la hoja de ronda:
 *
 * 1. Qué claves de la familia tienen brazo y cuáles siguen negadas: las once lo tienen, y `premium.state` —que hasta
 *    la ronda CD era la única que la compuerta BJ no dejaba cablear suelta— salió de esa línea y vive en su archivo.
 * 2. Que cada frase con la que el host se niega es la de Android, carácter a carácter, leída de la línea que la
 *    escribió por primera vez. La pantalla es la misma en las dos capas: si la frase difiere, la ve el usuario.
 * 3. Que los ocho topes salen del puente de Android medidos por regex, no transcritos de memoria.
 * 4. Que las guardas puras —las cuatro expresiones regulares y los dos intervalos— dicen lo mismo en las dos orillas,
 *    con la lección de la ronda AT: anclar con `\A` y `\z`, no con `$`.
 * 5. Que el orden de las comprobaciones de `emojiStatus.set` es el de Android y que la quita se niega después del
 *    filtro de Premium, no antes, para que nadie con cuenta normal se lleve una frase de biblioteca en vez de la suya.
 * 6. Que lo que la interfaz declara como disponible en Windows es exactamente lo que el host contesta, que el mando
 *    «Quitar» de la pantalla desaparece en el escritorio en vez de prometer una negativa, y que el documento de un
 *    emoji personalizado se clasifica por su mime y no por ser sticker.
 *
 * La última prueba es el cortafuegos de las citas: todo `Archivo:NNN` escrito en los dos archivos nuevos y en el
 * comentario del despacho tiene que existir en la tabla y señalar hoy la línea que la frase afirma, igual que hacen
 * BM con el host y BZ con las historias.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const rules = text(`${host}DesktopEmojiCatalog.cs`);
const flow = text(`${host}DesktopEmojiCatalogFlow.cs`);
const service = rows(`${host}TelegramService.cs`);
const state = text(`${host}DesktopState.cs`);
const media = text(`${host}MediaRegistry.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const scope = text('./desktopScope.ts');
const menu = text('./UserMenu.tsx');
const status = text('./EmojiStatusSettings.tsx');

const FAMILY = ['emojiStatus.state', 'emojiStatus.options', 'emojiStatus.set', 'customEmoji.get', 'customEmoji.search',
  'emojiPacks.list', 'emojiPacks.get', 'stickers.installed', 'stickers.search', 'stickers.get', 'stickers.install'];

/** El despacho de Windows, con el mismo recorte que usan BJ, BK, BO, BZ y BM. */
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
  return { answered, refused };
}
const cable = dispatch();

/** El literal de texto o de entero que C# asigna a una constante. */
function csLiteral(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}
const csNumber = (name: string, from = rules) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(from)?.[1]);

/** Todas las frases con las que la línea medida de Android se niega. */
const failsOf = (at: number) => [...(java[at - 1] ?? '').matchAll(/a\.fail\("((?:[^"\\]|\\.)*)"\)/g)].map(m => m[1]);
const throwsOf = (at: number) => [...(java[at - 1] ?? '').matchAll(/IllegalArgumentException\("((?:[^"\\]|\\.)*)"\)/g)].map(m => m[1]);
const numberFrom = (at: number, pattern: RegExp, from = java) => Number((from[at - 1] ?? '').match(pattern)?.[1]);

/** La línea medida de Android: `jrow(350)` es exactamente la línea 350. */
const jrow = (at: number) => java[at - 1] ?? '';
const srow = (at: number) => snapshot[at - 1] ?? '';

describe('ronda BY · el cable de la familia del emoji en Windows', () => {
  it('las once claves tienen brazo, van juntas y cada una llama a su método', () => {
    const arms: [string, string][] = [
      ['emojiStatus.state', 'EmojiStatusStateAsync'], ['emojiStatus.options', 'EmojiStatusOptionsAsync'],
      ['emojiStatus.set', 'EmojiStatusSetAsync'], ['customEmoji.get', 'CustomEmojiAsync'],
      ['customEmoji.search', 'CustomEmojiSearchAsync'], ['emojiPacks.list', 'EmojiPacksListAsync'],
      ['emojiPacks.get', 'EmojiPackAsync'], ['stickers.installed', 'InstalledStickersAsync'],
      ['stickers.search', 'SearchStickersAsync'], ['stickers.get', 'StickerSetAsync'],
      ['stickers.install', 'ChangeStickerSetAsync'],
    ];
    const first = cable.answered.get('emojiStatus.state');
    expect(first, 'el estado emoji no tiene brazo').toBeTypeOf('number');
    arms.forEach(([key, method], index) => {
      expect(cable.answered.has(key), `${key} sigue sin brazo`).toBe(true);
      expect(cable.refused.has(key), `${key} se niega a sí misma`).toBe(false);
      const at = cable.answered.get(key)!;
      expect(at, `${key} no va pegada a la anterior`).toBe(first! + index);
      expect(service[at - 1], `${key} no llama a ${method}`).toContain(`=> await ${method}(`);
      expect(flow, `${key} no declara ${method}`).toMatch(new RegExp(`private (?:async )?Task<object\\?> ${method}\\(`));
    });
    // Las dos que no piden argumentos: su firma en el puente de Android tampoco tiene `params`.
    ['emojiStatus.state', 'stickers.installed'].forEach(key =>
      expect(service[cable.answered.get(key)! - 1]).toContain('Async(),'));
  });

  it('la familia declarada en el puente es la cableada, y premium.state salió de la línea pendiente en la ronda CD', () => {
    const declared = [...new Set([...policy.matchAll(/"((?:emojiStatus|customEmoji|emojiPacks|stickers)\.[a-z.]+)"/g)].map(m => m[1]))];
    expect(declared.sort()).toEqual([...FAMILY].sort());
    expect(cable.answered.has('premium.state'), 'la ronda CD no dejó brazo para premium.state').toBe(true);
    expect(desktopGapRefusal('premium.state'), 'la puerta BK sigue negando premium.state').toBeUndefined();
  });

  it('el comentario del despacho dice donde vive cada pieza de la familia', () => {
    const at = cable.answered.get('emojiStatus.state')!;
    const comment = service.slice(at - 9, at - 1).join('\n');
    expect(comment.split('\n')).toHaveLength(8);
    expect(comment).toContain('ronda BY');
    expect(comment).toContain('DesktopEmojiCatalogFlow');
    expect(comment).toContain('DesktopEmojiCatalog');
    expect(comment).toContain('account.clearEmojiStatus');
    expect(comment).toContain('PhotoSize');
  });

  it('las frases del host son las de Android, carácter a carácter', () => {
    const table: [string, number, 'fail' | 'throw'][] = [
      ['StatusUnread', 315, 'fail'], ['StatusesUnprepared', 335, 'fail'], ['BadStatusId', 350, 'throw'],
      ['BadExpiry', 354, 'throw'], ['StatusNeedsPremium', 359, 'fail'], ['BadCustomEmoji', 4429, 'throw'],
      ['CustomEmojiMissing', 4430, 'fail'], ['CustomEmojiUnloaded', 4430, 'fail'],
      ['CustomEmojiUnsearched', 4431, 'fail'], ['SavedUnread', 5019, 'fail'], ['NeedPackName', 5024, 'fail'],
      ['ResultsUnread', 5026, 'fail'], ['BadPage', 5031, 'throw'], ['FeaturedUnread', 5037, 'fail'],
      ['NotEmojiPack', 5047, 'fail'], ['PackUnopened', 5059, 'fail'], ['PacksUnprepared', 5062, 'fail'],
      ['NeedShortName', 5063, 'throw'], ['PackUnprepared', 5063, 'fail'], ['PackUnloaded', 5064, 'fail'],
    ];
    for (const [name, at, kind] of table) {
      const source = kind === 'fail' ? failsOf(at) : throwsOf(at);
      expect(source.length, `la línea ${at} de Android no se niega con ninguna frase`).toBeGreaterThan(0);
      expect(source, `${name} no es la frase de NativeBridge.java:${at}`).toContain(csLiteral(name));
    }
    // Las dos salidas del mismo intento de `:335` y `:336` son la misma frase.
    expect(csLiteral('StatusesUnprepared')).toBe(failsOf(336)[0]);
    // `Emoji personalizado no válido.` nace en `reactCustom` (hoy :4406); :4396 se reserva para `allowCustom`.
    expect(jrow(4419)).toContain('result.put("allowCustom",value.allowCustomEmoji)');
    expect(csLiteral('BadCustomEmoji')).toBe(throwsOf(4429)[0]);
  });

  it('los tres huecos propios se niegan con nombre y causa, y ninguna frase es de Android', () => {
    for (const name of ['NoRemoval', 'NoAccessHash', 'NeedDecision'])
      expect(java.join('\n'), `${name} sí existe en Android`).not.toContain(csLiteral(name));
    expect(csLiteral('NoRemoval')).toContain('no puede quitarlo');
    expect(csLiteral('NoAccessHash')).toContain('firma de acceso');
    expect(csLiteral('NeedDecision')).toContain('se guarda o se quita');
    // Las tres se lanzan con `BridgeException`, no con el rechazo genérico del final.
    expect(flow).toContain(`throw new BridgeException(DesktopEmojiCatalog.NoRemoval)`);
    expect(flow).toContain(`throw new BridgeException(DesktopEmojiCatalog.NoAccessHash)`);
    expect(flow).toContain(`throw new BridgeException(DesktopEmojiCatalog.NeedDecision)`);
    expect(cable.refused.has('emojiStatus.set')).toBe(false);
    // La negativa con causa de la escritura, en la forma de la reacción: la frase de la biblioteca va detrás.
    expect(csLiteral('WriteFailed')).toBe('No se confirmó el pack en el Telegram de tu cuenta. ');
    expect(flow).toContain('DesktopEmojiCatalog.WriteFailed + message');
    // `BadId` es el `Invalid identifier` de `BridgePolicy.id`, dicho en español.
    expect(policy).toMatch(/IllegalArgumentException\("Invalid identifier/);
    expect(csLiteral('BadId')).toMatch(/[Ii]dentificador/);
  });

  it('los ocho topes están medidos en el puente, no copiados de memoria', () => {
    expect(csNumber('StatusCap')).toBe(numberFrom(329, /ids\.size\(\)<(\d+)/));
    expect(csNumber('StatusCap')).toBe(numberFrom(333, /Math\.min\(ids\.size\(\),(\d+)\)/));
    expect(csNumber('PackLimit')).toBe(numberFrom(5032, /GetTrendingStickerSets\(type,offset,(\d+)\)/));
    expect(csNumber('MaxOffset')).toBe(numberFrom(5031, /offset>(\d+)/));
    expect(csNumber('StickersShown')).toBe(numberFrom(5064, /i<(\d+)/));
    expect(csNumber('TitleCap')).toBe(numberFrom(4990, /limit\(set\.title,(\d+)/));
    expect(csNumber('QueryCap')).toBe(numberFrom(5023, /text\(p,"query",(\d+)/));
    expect(csNumber('ShortNameCap')).toBe(numberFrom(5063, /text\(p,"name",(\d+)/));
    expect(csNumber('SearchCap')).toBe(numberFrom(4431, /new String\[0\],0,(\d+)\)/));
  });

  it('las cuatro guardas de forma dicen lo mismo en las dos orillas', () => {
    // El literal de la guarda en C#, sin los anclajes que la casa añade: `\A(…)\z`.
    const anchored = (name: string) => new RegExp(`${name} = new\\(@"\\\\A(.*)\\\\z"`).exec(rules)?.[1];
    const matches = (at: number) => jrow(at).match(/matches\("([^"]+)"\)/)?.[1] ?? '';
    // La de Android va entre paréntesis: sin ellos el `\A` solo anclaría la primera alternativa.
    expect(anchored('StatusPattern')).toBe(`(${matches(350)})`);
    expect(anchored('ShortNamePattern')).toBe(matches(5063));
    // `PositiveId` es la lectura positiva del `BridgePolicy.id`, que en Android admite signo y cero.
    expect(anchored('PositivePattern')).toBe('[1-9][0-9]{0,18}');
    expect(policy).toMatch(/matches\("-\?\(0\|\[1-9\]\[0-9\]\{0,18\}\)"\)/);
    expect(rules).toContain('no con <c>$</c>');
    expect(rules).toContain('.NET deja pasar un salto de línea final');
  });

  it('los dos intervalos y las tres secciones son los de Android', () => {
    expect(jrow(354)).toContain('expiration<now+60||expiration>now+367L*86400L');
    expect(rules).toContain('expiration >= now + 60 && expiration <= now + 367L * 86400L');
    expect(jrow(5031)).toContain('offset<0||offset>10000');
    expect(rules).toContain('offset >= 0 && offset <= MaxOffset');
    const sections = [...java.slice(5011, 5042).join('\n').matchAll(/case "([a-z]+)"/g)].map(m => m[1]);
    expect(sections).toEqual(['installed', 'search', 'featured']);
    expect(rules).toContain('kind is "installed" or "search" or "featured"');
    // El recorte del nombre corto: hasta el último `/`, igual que hoy :5040. Vive en la regla pura y el brazo la llama.
    expect(jrow(5063)).toContain('name.substring(name.lastIndexOf(\'/\')+1)');
    expect(rules).toContain("var cut = value.LastIndexOf('/')");
    expect(flow).toContain('DesktopEmojiCatalog.ShortNameOf(');
  });

  it('el orden de emojiStatus.set es el de Android y la quita se niega después del filtro de Premium', () => {
    const body = flow.slice(flow.indexOf('private async Task<object?> EmojiStatusSetAsync('), flow.indexOf('/// `customEmoji.get`'));
    const order = ['BadStatusId', 'BadExpiry', 'StatusNeedsPremium', 'NoRemoval', 'Account_UpdateEmojiStatus'];
    let previous = -1;
    for (const needle of order) {
      const at = body.indexOf(needle);
      expect(at, `${needle} falta en el brazo o está fuera de orden`).toBeGreaterThan(previous);
      previous = at;
    }
    // El eco local, en el sitio del `schedule()` de `:347`: sin ida y vuelta a la red.
    expect(body).toContain('user.emoji_status = status;');
    expect(body).toContain('_state.EmojiStatus = EmojiStatusDto.Of(DesktopEmojiCatalog.MarkOf(user, now));');
    expect(body).toContain('Push();');
    // La bandera se lee de la sesión conectada; Android vuelve a pedir el usuario.
    expect(flow).not.toContain('Users_GetUser');
    expect(jrow(309)).toContain('new TdApi.GetUser(session.selfId)');
    expect(jrow(358)).toContain('new TdApi.GetUser(a.owner)');
  });

  it('la bandeja sale de dos listas porque el tema no está en la librería', () => {
    const steps = flow.slice(flow.indexOf('var steps = new'), flow.indexOf('foreach (var (fetch, keepExpiration) in steps)'));
    expect([...steps.matchAll(/Account_Get(\w+)EmojiStatuses/g)].map(m => m[1])).toEqual(['Default', 'Recent']);
    expect(steps).not.toContain('Themed');
    expect(jrow(323)).toContain('GetDefaultEmojiStatuses');
    expect(jrow(324)).toContain('GetThemedEmojiStatuses');
    expect(jrow(325)).toContain('GetRecentEmojiStatuses');
    // La tolerancia de Android: si una lista falla se pasa a la siguiente sin decir nada.
    expect(flow).toContain('catch { }');
    expect(csNumber('StatusCap')).toBe(200);
  });

  it('la firma de acceso se apunta en cada lista y se reintenta una sola vez', () => {
    expect(flow).toContain('private readonly Dictionary<long, long> _packKeys = new();');
    expect(flow).toContain('private bool _packKeysRefreshed;');
    const key = flow.slice(flow.indexOf('private async Task<InputStickerSet> PackKeyAsync('));
    expect(key.indexOf('_packKeysRefreshed')).toBeLessThan(key.indexOf('Messages_GetAllStickers'));
    expect(key.indexOf('Messages_GetAllStickers')).toBeLessThan(key.indexOf('NoAccessHash'));
    expect(flow.match(/Remember\(/g) ?? []).toHaveLength(5);
    // `InputStickerSetShortName` es la única puerta que abre un pack nunca listado: no lleva firma.
    expect(flow).toContain('new InputStickerSetShortName { short_name = name }');
    expect(flow).toContain('new InputStickerSetID { id = id, access_hash = known }');
  });

  it('la marca y la cartera salen del estado de la sesión y se borran con la sesión', () => {
    expect(state).toContain('public EmojiStatusDto? EmojiStatus { get; set; }');
    expect(state).toContain('public WalletDto? Wallet { get; set; }');
    expect(state.slice(state.indexOf('public void ResetSession()'))).toMatch(/EmojiStatus = null;\s*\n\s*Wallet = null;/);
    // La ventana se mide sobre el bloque, no por número: la ronda CI metió tres brazos en el despacho y lo desplazó.
    const loginAt = service.findIndex(row => row.includes('_state.SelfId = user.id.ToString();')) + 1;
    expect(loginAt, 'el puente ya no escribe `_state.SelfId`').toBeGreaterThan(0);
    const login = service.slice(loginAt - 1, loginAt + 9).join('\n');
    expect(login).toContain('_state.Wallet = new WalletDto { Premium = DesktopEmojiCatalog.IsPremium(user) };');
    expect(login).toContain('_state.EmojiStatus = EmojiStatusDto.Of(DesktopEmojiCatalog.MarkOf(user, Unix(DateTime.UtcNow)));');
    // Sin Premium no hay marca, y la caducidad pasada tampoco cuenta: las dos reglas de `NativeSnapshot.java:52` y `:54`.
    expect(rules).toContain('if (!IsPremium(user)) return null;');
    expect(rules).toContain('expiration != 0 && expiration <= now ? null : new Mark(id.ToString(), expiration)');
    expect(srow(52)).toContain('!user.isPremium||user.emojiStatus==null)return null');
    expect(srow(54)).toContain('status.expirationDate!=0&&status.expirationDate<=System.currentTimeMillis()/1000');
  });

  it('el documento de un emoji personalizado se clasifica por su mime y no por ser sticker', () => {
    const custom = media.indexOf('DocumentAttributeCustomEmoji');
    const sticker = media.indexOf('attribute is DocumentAttributeSticker');
    expect(custom).toBeGreaterThan(0);
    expect(sticker).toBeGreaterThan(custom);
    expect(media.slice(custom, custom + 260)).toContain('mime.StartsWith("image/") ? "image" : mime.StartsWith("video/") ? "video" : "file"');
    // Las tres formas del puente de Android: webp es imagen, tgs es sticker, webm es vídeo.
    expect(srow(447)).toContain('"image/webp","image"');
    expect(srow(448)).toContain('"application/x-tgsticker","sticker"');
    expect(srow(450)).toContain('"video/webm","video"');
  });

  it('lo que la interfaz declara disponible es exactamente lo que el host contesta', () => {
    const claim = DESKTOP_AVAILABLE.find(row => row.methods.includes('emojiPacks.list'));
    expect(claim, 'la familia no está declarada como disponible').toBeDefined();
    expect([...claim!.methods].sort()).toEqual([...FAMILY.filter(key => key !== 'emojiStatus.state')].sort());
    expect(claim!.label).toContain('puesto (no quitado)');
    // `emojiStatus.state` tiene brazo pero no la llama ninguna pantalla, así que no puede ir en la lista.
    expect(DESKTOP_PENDING.flatMap(row => row.methods)).not.toContain('emojiStatus.state');
    expect(scope).not.toMatch(/label:[^\n]*(estado emoji|packs y stickers)[^\n]*methods:[^\n]*'emojiStatus\.set'[^\n]*\}/.source + '[^\\n]*pendiente');
    for (const key of FAMILY) expect(cable.answered.has(key), `${key} sin brazo`).toBe(true);
  });

  it('el menú de cuenta ofrece el catálogo y la pantalla no ofrece el mando que el host niega', () => {
    const desktop = menu.slice(0, menu.indexOf('return <div className="account-menu">\n    <button className="user-menu-profile" onClick={openProfile}>'));
    expect(desktop).toContain('label={state.wallet?.premium?\'Cambiar estado emoji\':\'Packs de emojis\'}');
    expect(desktop).toContain('onClick={openEmoji}');
    expect(desktop).toContain('detail="Packs de Telegram, guardados y estado emoji escritos en tu cuenta"');
    // El mando de quitar: la guarda de plataforma está escrita y la clave cero no viaja en Windows.
    expect(status).toContain("const desktop = useSyncExternalStore(subscribe,() => snapshot().platform === 'desktop');");
    expect(status).toContain('{status && !desktop && <button type="button" className="text-button" disabled={saving} onClick={()=>void apply(\'0\')}>Quitar</button>}');
  });
});

describe('ronda BY · las citas de los dos archivos nuevos y del despacho', () => {
  // La clave es la cita tal como está escrita y el valor es lo que esa línea dice hoy en el puente. CT movió el
  // puente sin reescribir la prosa: no hay mapa que traduzga la cifra heredada, la prosa tiene que decir la de hoy.
  const anchors: Record<string, string> = {
    'NativeBridge.java:307': 'private void emojiStatusState(Answer a){',
    'NativeBridge.java:315': 'a.fail("No se pudo leer el estado emoji.")',
    'NativeBridge.java:335': 'a.fail("No se pudieron preparar los estados emoji.")',
    'NativeBridge.java:350': 'IllegalArgumentException("Estado emoji no válido.")',
    'NativeBridge.java:354': 'IllegalArgumentException("La caducidad debe estar entre un minuto y 367 días.")',
    'NativeBridge.java:359': 'a.fail("Necesitas Telegram Premium para cambiar el estado emoji.")',
    'NativeBridge.java:360': 'new TdApi.SetEmojiStatus(selected),a,ignored->{schedule();a.ok(true);}',
    'NativeBridge.java:4429': 'private void reactCustom(JSONObject p,Answer a)',
    'NativeBridge.java:4430': 'a.fail("Ese emoji personalizado no está disponible.")',
    'NativeBridge.java:4431': 'a.fail("No se pudieron cargar emojis personalizados.")',
    'NativeBridge.java:5019': 'a.fail("No se pudieron leer los packs guardados.")',
    'NativeBridge.java:5024': 'a.fail("Escribe el nombre de un pack.")',
    'NativeBridge.java:5031': 'IllegalArgumentException("Página no válida.")',
    'NativeBridge.java:5032': 'new TdApi.GetTrendingStickerSets(type,offset,24)',
    'NativeBridge.java:5040': 'IllegalArgumentException("Sección de emojis no válida.")',
    'NativeBridge.java:5047': 'a.fail("Este pack no contiene emojis personalizados.")',
    'NativeBridge.java:5059': 'a.fail("No se pudo abrir el pack de emojis.")',
    'NativeBridge.java:5062': 'a.fail("No se pudieron preparar los packs de stickers.")',
    'NativeBridge.java:5063': 'private void searchStickers(JSONObject p,Answer a)',
    'NativeBridge.java:5064': 'a.fail("No se pudo cargar el pack de stickers.")',
    'NativeBridge.java:5065': 'boolean installed=p.getBoolean("installed")',
    'NativeSnapshot.java:51': 'static JSONObject emojiStatus(TdApi.User user)throws Exception{',
    'NativeSnapshot.java:52': 'if(user==null||!user.isPremium||user.emojiStatus==null)return null;',
    'BridgePolicy.java:59': 'static long id(JSONObject params,String key)',
    'DesktopMessageReactFlow.cs:60': 'throw new BridgeException("La cuenta no está conectada.")',
    'DesktopMessageReactFlow.cs:104': 'throw new BridgeException("No se confirmó la reacción en el mensaje. " + message, ex)',
    'EmojiStatusSettings.tsx:180': "{item.thumbnail ? <MediaView media={item.thumbnail} auto passive/> : '✨'}",
    'BatchPanels.tsx:198': '{open.thumbnail&&<MediaView media={open.thumbnail} auto/>}',
  };

  /** Las fuentes vigiladas: los dos archivos de la ronda y el bloque de comentario que precede a sus brazos. */
  const at = cable.answered.get('emojiStatus.state')!;
  const watched: [string, string][] = [
    ['DesktopEmojiCatalog.cs', rules],
    ['DesktopEmojiCatalogFlow.cs', flow],
    ['TelegramService.cs (comentario BY)', service.slice(at - 9, at - 1).join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' ? java
      : file === 'NativeSnapshot.java' ? snapshot
        : file === 'BridgePolicy.java' ? rows(`${javaDir}${file}`)
          : file === 'DesktopMessageReactFlow.cs' ? rows(`${host}${file}`)
            : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  /** Una línea Java sin literales ni comentarios de final de línea, para poder contar llaves. */
  function bare(row: string) {
    let out = '';
    for (let i = 0; i < row.length; i++) {
      const ch = row[i], next = row[i + 1];
      if (ch === '/' && next === '/') break;
      if (ch === '\\') { i++; continue; }
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i++;
        while (i < row.length) {
          if (row[i] === '\\') { i++; continue; }
          if (row[i] === quote) break;
          i++;
        }
        continue;
      }
      out += ch;
    }
    return out;
  }

  /** La última línea del método declarado en `start`, medida por balance de llaves. */
  function spanOf(body: string[], start: number) {
    let depth = 0, opened = false;
    for (let n = start; n <= body.length; n++) {
      for (const ch of bare(body[n - 1] ?? '')) {
        if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--;
      }
      if (opened && depth === 0) return n;
    }
    throw new Error(`El método de la línea ${start} no cierra`);
  }

  // Las firmas de la familia, las cuatro ayudas que solo llaman ellas y la reacción cuyo aviso de emoji prestó la
  // frase de `customEmoji.get`. `reactCustom` es la única que no es de la familia: se cita por vecindad de frase.
  const HANDLERS = ['emojiStatusState', 'emojiStatusOptions', 'loadEmojiStatuses', 'addEmojiStatusIds', 'emojiStatusMedia',
    'emojiStatusDtos', 'emojiStatusSet', 'customEmoji', 'customEmojiSearch', 'reactCustom', 'stickerInfo', 'customEmojiId',
    'emojiPackList', 'emojiPacks', 'emojiPack', 'installedStickers', 'searchStickers', 'stickerSet', 'changeStickerSet'];
  const declOf = (name: string) => java
    .map((row, index) => [/^\s+(?:private|static|public)\s+[^\n=;]*?\b(\w+)\(/.exec(row)?.[1], index + 1] as const)
    .filter(([declared]) => declared === name)
    .map(([, line]) => line);

  /** Rango actual medido y métodos que lo llenan; la prosa tiene que atribuir ese rango al puente. */
  const GROUPS: [number, number, string[]][] = [
    [307, 317, ['emojiStatusState']],
    [318, 346, ['emojiStatusOptions', 'loadEmojiStatuses', 'addEmojiStatusIds', 'emojiStatusMedia', 'emojiStatusDtos']],
    [347, 362, ['emojiStatusSet']],
    [4430, 4431, ['customEmoji', 'customEmojiSearch']],
    [4990, 5011, ['stickerInfo', 'emojiPackList']],
    [5012, 5042, ['emojiPacks']],
    [5043, 5061, ['emojiPack']],
    [5062, 5065, ['installedStickers', 'searchStickers', 'stickerSet', 'changeStickerSet']],
  ];

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('el rango de la marca, que el host cita cerrado en 58, cierra en 60', () => {
    expect(spanOf(snapshot, 51)).toBe(60);
    expect(srow(59)).toContain('return id>0?new JSONObject().put("customEmojiId"');
    expect(rules).toContain('NativeSnapshot.java:51-60');
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    const written = new Set<string>();
    for (const [, body] of watched)
      for (const match of body.matchAll(/([A-Za-z]+(?:\.tsx|\.ts|\.java|\.cs)):(\d+)(?:-(\d+))?/g))
        written.add(`${match[1]}:${Number(match[2])}`);
    expect([...written].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('toda cifra suelta de las dos orillas cae dentro de un método medido del puente', () => {
    // Las cifras sin nombre que el host escribe entre contras (`:5008`) son continuaciones de la frase de
    // `NativeBridge.java` que va delante. Lo que no se admite es que caigan fuera de los métodos de la familia,
    // porque entonces o se atribuyeron al archivo equivocado o el puente cambió de sitio desde que se escribió.
    const covered = HANDLERS.flatMap(declOf).map(start => [start, spanOf(java, start)] as const);
    expect(covered).toHaveLength(20);   // las diecinueve firmas, con la sobrecarga de `stickerInfo`, más su helper
    const loose = new Map<number, string>();
    for (const [name, body] of watched)
      for (const match of body.matchAll(/(?:`|<c>):(\d+)(?:-(\d+))?/g))
        for (const group of [match[1], match[2]]) if (group) loose.set(Number(group), name);
    expect(loose.size).toBeGreaterThanOrEqual(40);
    for (const [n, name] of Array.from(loose.entries()))
      expect(covered.some(([start, end]) => n >= start && n <= end),
        `${name} cita :${n}, que hoy no es línea de un método de la familia`).toBe(true);
  });

  it('los ocho intervalos atribuidos al puente salen del balance de llaves', () => {
    const escrito = watched.map(([, body]) => body).join('\n');
    const writtenRanges = [...escrito.matchAll(/(?:NativeBridge\.java|<c>|`):(\d+)(?:-(\d+))?/g)]
      .map(match => [Number(match[1]), Number(match[2] ?? match[1])] as const);
    for (const [start, end, names] of GROUPS) {
      const decls = names.flatMap(declOf);
      expect(decls.length, `no se declara ningún método de ${names.join(', ')}`).toBeGreaterThanOrEqual(names.length);
      expect(Math.min(...decls), `${names.join(' + ')} no empieza en ${start}`).toBe(start);
      expect(Math.max(...decls.map(n => spanOf(java, n))), `${names.join(' + ')} no cierra en ${end}`).toBe(end);
      expect(writtenRanges.some(([from, to]) => from <= start && to >= end),
        `ninguna cita escrita cubre :${start}-${end}`).toBe(true);
    }
  });
});
