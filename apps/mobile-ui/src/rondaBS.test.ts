import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';

/**
 * La ronda BS mete Giphy en la pestaña de GIF sin tocar la de Telegram y sin abrir un método nuevo del puente.
 *
 * La forma no es obvia y conviene tenerla escrita. Primero: `catalog` ya existía con tres argumentos, así que la
 * fuente entra como cuarto (`source`) en la misma orden; `send.catalog` no se entera. Eso es lo que permite que
 * `architecture.test.ts` siga midiendo el mismo número de métodos y que la clave de selección siga siendo la misma
 * llave de un solo uso. Segundo: TDLib no tiene ningún `InputFile` que acepte una dirección —`InputFileRemote` pide
 * un identificador que TDLib ya conoce—, así que enviar un GIF de Giphy es descargar el archivo al caché privado y
 * pasar un `InputFileLocal`, como hace cualquier cliente. Tercero: el teléfono no conoce Giphy. Conoce
 * `wrgram.webrom.cc`, que es nuestro Worker, y las dos direcciones que recibe van firmadas bajo esa raíz; la clave y
 * el host de Giphy viven solo en el borde.
 *
 * Lo que vigila esta prueba, en el orden en que se puede romper: que el parámetro viaje por las cuatro capas y que
 * la negación del puente siga siendo una lista cerrada sin «giphy» dentro; que la única raíz que acepta la capa
 * nativa sea la nuestra y coincida con el dominio del `wrangler.jsonc` y con las rutas del Worker; que la guarda de
 * URL descarte host, trayecto y fragmento; que la descarga esté topada y el envío use archivo local con las guardas
 * anteriores intactas; que cada fuente pida su propio consentimiento y que la pantalla y las frases de Telegram no
 * hayan cambiado una coma; y que la CSP deje entrar las miniaturas de nuestro host sin dar al WebView ninguna salida
 * nueva.
 *
 * Dos cosas que esta prueba **no** afirma. Que Giphy funcione en Windows: el host de escritorio sigue sin brazo para
 * `catalog`, y aquí se mide que ese hueco sigue siendo hueco, no que esté cerrado. Y que la pantalla se vea bien:
 * eso solo lo dice una pasada por el emulador con cuenta real.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const JAVA = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';

const java = text(`${JAVA}NativeBridge.java`);
const catalog = text(`${JAVA}NativeCatalog.java`);
const gifs = text(`${JAVA}GiphySource.java`);
const policy = text(`${JAVA}BridgePolicy.java`);
const junit = text('../../mobile/android/app/src/test/java/cc/webrom/wrgram/GiphySourceTest.java');
const edge = text('../../edge/src/index.ts');
const wrangler = text('../../../wrangler.jsonc');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const picker = text('./ExpressionPicker.tsx');
const app = text('./App.tsx');
const contract = text('./contract.ts');
const css = text('./expression-picker.css');
const html = text('../index.html');

const lines = (from: string) => from.split(/\r?\n/);
const javaLines = lines(java);
const catalogLines = lines(catalog);
const gifLines = lines(gifs);
const edgeLines = lines(edge);
const pickerLines = lines(picker);
const contractLines = lines(contract);

/** Una línea de un archivo, contada desde 1. Sin línea no hay prueba: se falla. */
function line(from: string[], number: number, file: string): string {
  const row = from[number - 1];
  if (!row) throw new Error(`Falta la línea ${number} de ${file}`);
  return row;
}
const javaLine = (number: number) => line(javaLines, number, 'NativeBridge.java');
const catalogLine = (number: number) => line(catalogLines, number, 'NativeCatalog.java');
const gifLine = (number: number) => line(gifLines, number, 'GiphySource.java');
const edgeLine = (number: number) => line(edgeLines, number, 'index.ts');
const pickerLine = (number: number) => line(pickerLines, number, 'ExpressionPicker.tsx');
const contractLine = (number: number) => line(contractLines, number, 'contract.ts');

const count = (needle: string, from: string) => from.split(needle).length - 1;

/** Un trozo entre dos agujas, medida la segunda después de la primera. */
function slice(needle: string, tail: string, from: string): string {
  const at = from.indexOf(needle);
  const end = from.indexOf(tail, at + needle.length);
  if (at < 0 || end < 0) throw new Error(`Falta el trozo ${needle}`);
  return from.slice(at, end);
}

/** Orden de apariciones dentro de un cuerpo: la prueba de una guarda es la posición, no una afirmación. */
function ordered(from: string, ...needles: string[]): void {
  const positions = needles.map(needle => {
    const at = from.indexOf(needle);
    if (at < 0) throw new Error(`Falta la aguja "${needle}"`);
    return at;
  });
  expect(positions).toEqual([...positions].sort((a, b) => a - b));
}

const ROOT = 'https://wrgram.webrom.cc/api/v1/gifs';
const GIF_BLOCK = slice('}else if(tab.equals("gif")){', '}else failure.accept("Selector no disponible.");', catalog);
const SEND_BLOCK = slice('void send(String key,long reply,', 'private boolean hasPremium()', catalog);
const GIPHY_BLOCK = slice('private void giphy(', 'private JSONObject item(', catalog);
const GUARDED_BLOCK = slice('static String guarded', 'static List<Gif> parse', gifs);
const SAVE_BLOCK = slice('void save(Gif gif,Saved saved){', 'private JSONObject json(', gifs);
const SEARCH_BLOCK = slice('async function gifSearch(', 'async function gifMedia(', edge);
const MEDIA_BLOCK = slice('async function gifMedia(', 'export default {', edge);
const MEDIA_ROUTE = /const GIF_MEDIA = '([^']+)';/.exec(edge)![1];
const SEARCH_ROUTE = /if \(path === '([^']+)'\) return request\.method === 'GET' \? await gifSearch/.exec(edge)![1];

describe('ronda BS · Giphy como fuente aparte, servida por nuestro borde', () => {
  it('la fuente entra por un parámetro más de catalog, no por un método nuevo', () => {
    expect(javaLine(835).trim()).toBe('case "catalog":catalog.list(BridgePolicy.text(p,"tab",10),BridgePolicy.text(p,"query",100),BridgePolicy.text(p,"setId",40),BridgePolicy.text(p,"source",20),a::ok,a::fail);break;');
    // El envío es la misma orden de siempre: la clave que devuelve el catálogo decide el camino, no un método aparte.
    expect(javaLine(836)).toContain('case "send.catalog":catalog.send(BridgePolicy.text(p,"key",80)');
    // Y la lista cerrada del puente no crece: «giphy» no es un método en ninguna de sus partes.
    expect(policy).not.toContain('giphy');
    expect(count('"catalog"', policy)).toBe(1);
    expect(catalogLine(20)).toContain('void list(String tab,String query,String set,String source,');
    // El WebView tampoco añade llamadas: la única orden de catálogo sigue siendo 'catalog' con sus cuatro claves.
    expect(pickerLine(135)).toContain("useResults<Catalog>('catalog',{tab,query:search,setId,source:tab==='gif'?gifSource:''},");
    expect(count("('catalog'", picker)).toBe(1);
    // Las tres capas hablan del mismo parámetro con el mismo nombre.
    for (const from of [java, catalog, picker]) expect(from).toContain('source');
    // Que la pantalla mande siempre una cadena, vacía o no, no es un detalle: sin clave, el puente lanza y el envío
    // muere con la frase genérica. `BridgePolicy.text` rechaza lo que no es cadena, no lo que está vacío.
    expect(policy).toContain('if(!(value instanceof String)||((String)value).length()>maximum)throw new IllegalArgumentException("Invalid text")');
    expect(count('source:', pickerLine(135))).toBe(1);
  });

  it('la pestaña de GIF decide por posición: giphy antes que las dos ramas de Telegram', () => {
    // El atajo de Giphy cierra la rama con `return`, así que ninguna de las dos rutas de TDLib se ejecuta detrás.
    expect(GIPHY_BLOCK).toContain('gifs.search(query,new GiphySource.Found()');
    expect(catalogLine(43).trim()).toBe('if(source.equals("giphy")){giphy(query,account,chat,topic,success,failure);return;}');
    ordered(GIF_BLOCK, 'if(source.equals("giphy"))', 'new TdApi.GetSavedAnimations()', 'new TdApi.GetInlineQueryResults()');
    // Las dos ramas de Telegram, intactas y con sus topes de siempre (100 guardados, 60 del bot).
    expect(count('if(items.length()>=100)break;', GIF_BLOCK)).toBe(1);
    expect(count('items.length()<60', GIF_BLOCK)).toBe(1);
    // Y la cuenta y el chat se miran igual que antes: una respuesta tardía de Giphy no puede escribir en otra sesión.
    expect(GIPHY_BLOCK).toContain('if(session.selfId!=account)return;');
    // El resultado de Giphy no trae `media`: TDLib no tiene nada que proyectar hasta descargar.
    expect(count('.put("preview",gif.preview)', GIPHY_BLOCK)).toBe(1);
    expect(GIPHY_BLOCK).not.toContain('put("media"');
    expect(count('.put("label","GIF")', GIPHY_BLOCK)).toBe(1);
  });

  it('la capa nativa solo conoce nuestro proxy: ni el host de Giphy ni su clave viajan al teléfono', () => {
    expect(gifLine(24).trim()).toBe(`static final String SEARCH_ROOT = "${ROOT}";`);
    expect(count('giphy.com', gifs)).toBe(0);
    expect(count('api_key', gifs) + count('GIPHY_API_KEY', gifs)).toBe(0);
    // La raíz del teléfono y el dominio publicado del Worker tienen que decir lo mismo o `guarded` tira la lista.
    expect(wrangler).toContain('"pattern": "wrgram.webrom.cc", "custom_domain": true');
    expect(ROOT).toContain(`https://${/"pattern": "([^"]+)"/.exec(wrangler)![1]}`);
    // Las dos rutas que pide Java son las dos que registra el borde, letra por letra.
    expect(MEDIA_ROUTE).toBe('/api/v1/gifs/media/');
    expect(SEARCH_ROUTE).toBe('/api/v1/gifs/search');
    expect(`https://wrgram.webrom.cc${SEARCH_ROUTE}`).toBe(`${ROOT}/search`);
    expect(`https://wrgram.webrom.cc${MEDIA_ROUTE}`).toBe(`${ROOT}/media/`);
    expect(count('SEARCH_ROOT+"/search', gifs)).toBe(2);
    expect(count('SEARCH_ROOT+"/media/"', gifs)).toBe(2);
    // Y el tope de archivo es el mismo en las dos puntas del cable: 12 MiB.
    expect(gifLine(26).trim()).toBe('static final long MAX_BYTES = 12L * 1024 * 1024;');
    expect(edge).toContain('const GIF_MAX_BYTES = 12 * 1024 * 1024;');
    expect(gifLine(25).trim()).toBe('static final int MAX_ITEMS = 25;');
    expect(edge).toContain('const GIF_RESULTS = 25;');
    // La frase del modo apagado es idéntica en las dos capas; la del 502 también; la del 429 se acorta en Java.
    for (const phrase of ['Giphy aún no está habilitado en esta instalación.', 'Giphy no respondió. Vuelve a intentarlo.']) {
      expect(edge).toContain(`'${phrase}'`);
      expect(gifs).toContain(`"${phrase}"`);
    }
    expect(edge).toContain("'Demasiadas búsquedas de GIF. Espera un minuto antes de reintentar.'");
    expect(gifs).toContain('"Demasiadas búsquedas de GIF. Espera un minuto."');
  });

  it('la guarda de URL descarta host, trayecto, consulta y fragmento, y el JUnit lo comprueba', () => {
    expect(GUARDED_BLOCK).toContain('if(candidate==null||!candidate.startsWith(SEARCH_ROOT+"/media/"))return null;');
    expect(GUARDED_BLOCK).toContain('return token.matches("[A-Za-z0-9_-]{8,512}")?candidate:null;');
    ordered(GUARDED_BLOCK, 'candidate==null', 'startsWith(SEARCH_ROOT+"/media/")', 'token.matches(');
    // `parse` no deja pasar una entrada con el identificador raro o alguna de sus dos direcciones fuera del proxy.
    expect(catalog).not.toContain('InputFileRemote');
    expect(gifs).toContain('if(!id.matches("[A-Za-z0-9_-]{1,64}")||preview==null||animation==null)continue;');
    expect(gifs).toContain('for(int i=0;i<items.length()&&gifs.size()<MAX_ITEMS;i++)');
    expect(gifs).toContain('bounded(item.optInt("width"),2000)');
    expect(gifs).toContain('bounded(item.optInt("duration"),60)');
    expect(gifs).toContain('JSONArray items=body.optJSONArray("items");\n        if(items==null)return gifs;');
    // El JUnit es la única prueba ejecutable de este par de funciones: si alguien le quita un caso, esto lo nota.
    expect(count('@Test', junit)).toBe(7);
    for (const needle of ['media0.giphy.com', 'suplantacion.example.net', '../', 'guarded', 'MAX_ITEMS']) {
      expect(junit, needle).toContain(needle);
    }
    expect(count('assertNull', junit)).toBeGreaterThanOrEqual(7);
  });

  it('el GIF se descarga topado al caché privado y se envía como archivo local', () => {
    // Las cuatro guardas de siempre van delante; la de Giphy es la quinta y no sustituye a ninguna.
    ordered(SEND_BLOCK, 'Selección caducada o envío no permitido en este chat.', 'Este sticker requiere Telegram Premium.', 'Comprueba el envío anterior', 'if(selected.gif!=null)', 'if(selected.content!=null)');
    expect(SEND_BLOCK).toContain('input.animation=new TdApi.InputFileLocal(file.getAbsolutePath());');
    expect(count('new TdApi.InputMessageAnimation(input,new TdApi.FormattedText("",new TdApi.TextEntity[0]),false,false)', catalog)).toBe(2);
    // El archivo vive en el caché de la app, junto a lo demás que Telegram ya cachea.
    expect(catalog).toContain('gifs=new GiphySource(new java.io.File(session.context().getCacheDir(),"gifs"))');
    // Descarga: tope declarado y tope contado, tipo obligatorio, nombre provisional y cambio de nombre al final.
    expect(SAVE_BLOCK).toContain('File target=new File(directory,gif.id+".gif");');
    expect(SAVE_BLOCK).toContain('if(target.isFile()&&target.length()>0&&target.length()<=MAX_BYTES){saved.ok(target);return;}');
    expect(SAVE_BLOCK).toContain('File temp=new File(directory,gif.id+".part");');
    expect(SAVE_BLOCK).toContain('if(type==null||!type.toLowerCase(java.util.Locale.ROOT).startsWith("image/"))');
    expect(SAVE_BLOCK).toContain('if(request.getContentLengthLong()>MAX_BYTES)');
    expect(count('throw new Unavailable("El GIF supera el tamaño admitido.");', SAVE_BLOCK)).toBe(2);
    expect(SAVE_BLOCK).toContain('if(!temp.renameTo(target))');
    // Y si algo se rompe a mitad, el trozo incompleto no sirve la próxima vez; el motivo concreto sí se conserva.
    expect(SAVE_BLOCK).toContain('}catch(Unavailable specific){');
    expect(count('discard(temp);', SAVE_BLOCK)).toBe(2);
    expect(gifs).toContain('private static void discard(File file){if(file.isFile()&&!file.delete())file.deleteOnExit();}');
    // `HttpURLConnection` no es `AutoCloseable`: se suelta en el `finally`, no en el paréntesis del `try`.
    expect(count('try(HttpURLConnection', gifs)).toBe(0);
    expect(count('if(request!=null)request.disconnect();', gifs)).toBe(2);
    // Ni una conexión sin tope ni sin redirecciones automáticas, un solo hilo y el hilo se retira solo.
    expect(gifs).toContain('request.setConnectTimeout(5000);request.setReadTimeout(15000);request.setInstanceFollowRedirects(false);');
    expect(gifs).toContain('if(bytes.size()+count>MAX_JSON)');
    expect(gifs).toContain('new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,new LinkedBlockingQueue<>())');
    expect(gifs).toContain('io.allowCoreThreadTimeOut(true);');
    // La lista de selecciones se comparte desde el hilo de la red: sincronizada y con tope, y `clear` no cierra el pool.
    expect(catalog).toContain('private synchronized String mint(Selection selection)');
    expect(catalog).toContain('while(selections.size()>500)');
    expect(catalogLine(135).trim()).toBe('synchronized void clear(){selections.clear();}');
    expect(count('gifs.close()', catalog)).toBe(0);
  });

  it('cada fuente pide su propio consentimiento y Telegram no cambia una coma', () => {
    // La fuente por defecto es Telegram: Giphy se elige, no llega solo.
    expect(pickerLine(11).trim()).toBe("type GifSource = 'telegram' | 'giphy';");
    expect(picker).toContain("const gifSources = [['telegram', 'Telegram'], ['giphy', 'Giphy']] as const;");
    expect(pickerLine(128).trim()).toBe("const [gifSource,setGifSource]=useState<GifSource>('telegram');");
    // Dos permisos distintos, cada uno con su frase y su botón; la pantalla no consulta hasta que se da.
    expect(pickerLine(134).trim()).toBe("const gifNeedsConsent=tab==='gif'&&!!search&&!(giphy?giphyConsent:consent);");
    expect(picker).toContain("const [consent,setConsent]=useState(false);");
    expect(picker).toContain("const [giphyConsent,setGiphyConsent]=useState(false);");
    expect(picker).toContain("'La búsqueda envía el término al bot de GIF configurado por Telegram.'");
    expect(picker).toContain("'La búsqueda llega a los servidores de WRGram y de ahí a Giphy con calificación pg-13. Ni tu IP ni tu cuenta de Telegram viajan hasta Giphy.'");
    expect(picker).toContain("{giphy?'Permitir búsqueda en Giphy':'Permitir búsqueda de GIF'}");
    expect(picker).toContain('onClick={()=>{if(giphy)setGiphyConsent(true);else setConsent(true);}}');
    // La guarda del consentimiento entra en el predicado de la consulta, no como un `if` de pantalla.
    expect(pickerLine(135)).toContain('tab!==\'emoji\'&&ready&&native&&canSendMedia&&!gifNeedsConsent');
    // Las sugerencias de siempre son del bot de Telegram: con Giphy activado desaparecen.
    expect(picker).toContain("{tab==='gif'&&gifSource==='telegram'&&canSendMedia&&<div className=\"sticker-sets expression-packs\" aria-label=\"Colecciones de GIF\">");
    expect(count('gifSuggestions.map', picker)).toBe(1);
    // Y la rejilla se rehace al cambiar de fuente: si no, quedarían las claves de la otra.
    expect(picker).toContain('key={tab+setId+search+gifSource}');
    expect(picker).toContain("placeholder={giphy?'Buscar GIF en Giphy…':placeholders[tab]}");
    expect(picker).toContain("aria-label=\"Fuente de GIF\"");
    expect(picker).toContain('aria-pressed={gifSource===id}');
  });

  it('la miniatura nueva solo pasa por img-src: el WebView no gana ninguna salida', () => {
    const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1];
    if (!csp) throw new Error('Falta la CSP del WebView');
    const directive = (name: string) => csp.split(';').map(part => part.trim()).find(part => part.startsWith(`${name} `)) ?? '';
    expect(directive('img-src')).toContain('https://wrgram.webrom.cc');
    expect(directive('img-src')).toContain("'self'");
    expect(directive('connect-src')).not.toContain('webrom.cc');
    expect(directive('media-src')).toBe("media-src 'self' https://media.wrgram.test blob:");
    expect(directive('script-src')).toBe("script-src 'self'");
    expect(directive('frame-src')).toBe("frame-src 'none'");
    expect(html).not.toContain('giphy.com');
    // La clase que pinta la miniatura existe y solo se usa dentro del selector y del diálogo de confirmación.
    expect(count('className="gif-preview"', picker + app)).toBe(2);
    expect(css).toContain('.gif-preview { max-width: 100%; border-radius: 8px; }');
    expect(css).toContain('.expression-picker .catalog-grid .gif-preview { width: 100%; height: 100%; object-fit: cover; background: var(--input); }');
    // El contrato: seis claves, ninguna dirección ajena, y `preview` es opcional porque Telegram no la manda.
    expect(contractLine(211)).toBe('export interface CatalogItem { key: string; label: string; media?: Media; preview?: string; emoji?:string; premium?:boolean }');
    expect(count('preview?: string', contractLine(211))).toBe(1);
    expect(app).toContain("{item.preview?'Se descargará desde WRGram y se enviará como GIF.':'Contenido real de Telegram.'}");
    expect(count("run<boolean>('send.catalog'", app)).toBe(1);
  });

  it('el borde no devuelve nada de Giphy: ni su host, ni su clave, ni sus campos sobrantes', () => {
    // La clave solo se pone en la petición saliente; la respuesta se arma clave por clave.
    expect(count('api_key', edge)).toBe(1);
    expect(SEARCH_BLOCK).toContain("upstream.searchParams.set('api_key', env.GIPHY_API_KEY);");
    expect(SEARCH_BLOCK).toContain("upstream.searchParams.set('rating', 'pg-13');");
    expect(SEARCH_BLOCK).toContain("`https://api.giphy.com/v1/gifs/${query ? 'search' : 'trending'}`");
    expect(SEARCH_BLOCK).toContain("preview: `${url.origin}${GIF_MEDIA}${encodeToken(still.url)}`,");
    expect(count('items.push', SEARCH_BLOCK)).toBe(1);
    // Sin clave, la función ni pregunta: 503 y ninguna salida a la red.
    expect(SEARCH_BLOCK).toContain("if (!env.GIPHY_API_KEY) return json({ message: 'Giphy aún no está habilitado en esta instalación.' }, 503);");
    ordered(SEARCH_BLOCK, 'if (!env.GIPHY_API_KEY)', 'WRGRAM_GIF_LIMITER.limit(', "upstream.searchParams.set('limit'");
    // Solo los hosts de archivos de Giphy pueden salir por el proxy: ni la API, ni un host cualquiera.
    expect(edge).toContain('(?:media\\d*|i)\\.giphy\\.com');
    expect(count('GIF_HOST.test(', edge)).toBe(2);
    expect(MEDIA_BLOCK).toContain("const answer = await fetch(target, { redirect: 'manual' });");
    expect(MEDIA_BLOCK).toContain("if (answer.status !== 200 || !GIF_TYPES.has(type) || Number(answer.headers.get('content-length') ?? 0) > GIF_MAX_BYTES)");
    expect(MEDIA_BLOCK).toContain("'Cache-Control': 'public, max-age=31536000, immutable'");
    expect(MEDIA_BLOCK).toContain("'X-Content-Type-Options': 'nosniff'");
    // El límite va por su propia cubeta: escribir un GIF no puede comerse el presupuesto de WR IA.
    expect(wrangler).toContain('"name": "WRGRAM_GIF_LIMITER"');
    expect(edgeLine(8)).toContain('WRGRAM_GIF_LIMITER');
    const namespaces = [...wrangler.matchAll(/"namespace_id": "(\d+)"/g)].map(match => match[1]);
    expect(new Set(namespaces).size).toBe(namespaces.length);
    expect(namespaces.length).toBe(2);
    // Y las rutas nuevas entran antes que el fallback de assets, que es lo que las convierte en API y no en 404.
    ordered(edge, "if (path === '/api/v1/plugins'", "if (path === '/api/v1/gifs/search')", 'if (path.startsWith(GIF_MEDIA))');
    expect(wrangler).toContain('"run_worker_first": ["/api/*"]');
  });

  it('el hueco de Windows sigue siendo hueco: aquí se mide, no se tapa', () => {
    const cited = [...DESKTOP_AVAILABLE, ...DESKTOP_PENDING].flatMap(claim => claim.methods);
    expect(count('"catalog"', service)).toBe(0);
    expect(cited).not.toContain('catalog');
    expect(cited).not.toContain('send.catalog');
    // El selector no promete nada sin puente: la pantalla de Giphy nace de `native`, y en escritorio esa puerta es la
    // misma que ya estaba cerrada antes de la ronda.
    expect(pickerLine(187)).toContain("!native?'Conecta tu cuenta en Android para ver tus GIF y stickers.'");
  });
});
