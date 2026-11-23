import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import type { CloudBackground } from './cloud-backgrounds';

/**
 * Ronda CH-B — los fondos que la cuenta tiene instalados, en Windows.
 *
 * La pantalla ya existía desde la CH-A y el contrato tampoco se movió: las siete claves de la fila son las de
 * `CloudBackground` (`cloud-backgrounds.ts:1`), y lo único que cambia es quién las escribe. Android las saca de
 * TDLib (`AccountBackgrounds.java:99`); Windows de `account.getWallPapers` y `account.installWallPaper`, las dos
 * únicas peticiones que la sonda encontró para esto en WTelegramClient 4.4.10.
 *
 * **Las dos marcas que no son las mismas en las dos capas, y qué hace la pantalla con eso.** En TDLib `isDefault`
 * es «de los que trae Telegram» y el elegido hay que sacarlo de la tienda del aviso (`AccountBackgrounds.java:113`);
 * en MTProto es al revés: el bit `default_` de la propia respuesta es el puesto (`DesktopBackgrounds.cs:127`), así
 * que aquí `selected` viene en la lista y `stock` no viene en ninguna parte. La regla está dicha una sola vez, en
 * `DesktopBackgrounds.cs:136`, y la pantalla omite la palabra cuando la capa manda nulo (`CloudBackgrounds.tsx:113`).
 * El nombre tampoco lo trae MTProto —`slug` es la dirección opaca de los enlaces de fondo—, así que la fila sale
 * vacía (`DesktopState.cs:547`) y el título lo saca la pantalla del tipo (`cloud-backgrounds.ts:49`).
 *
 * **El hueco, por su nombre.** Crear un fondo de color no es que falte tiempo: la única escritura de un fondo nuevo
 * es `account.uploadWallPaper`, que pide un archivo, y `wallPaperNoFile` no tiene petición que lo fabrique. Lo dice
 * `DesktopBackgrounds.cs:76`, una frase con nombre —no la del beta genérico, que hablaría de un brazo que sí
 * existe— y que el andamio repite carácter a carácter. La puerta de alcance deja de prometer la creación
 * (`desktopScope.ts:75`) y el formulario de colores no se ofrece en escritorio (`CloudBackgrounds.tsx:124`).
 *
 * **El orden de negar, medido en el brazo.** `DesktopBackgroundsFlow.cs:70-85` reproduce las tres ramas de
 * `backgroundSet` (`NativeBridge.java:5401`) en el mismo orden y añade las dos comprobaciones que aquí hacen falta
 * porque el `access_hash` sale de la lista recién leída: la fila que ya no está y la que es del otro modo. La
 * confirmación se releé en vez de darla por hecha, que es lo que permite devolver la fila con su marca real.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const csDir = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';

const rules = rows(`${csDir}DesktopBackgrounds.cs`);
const flow = rows(`${csDir}DesktopBackgroundsFlow.cs`);
const service = rows(`${csDir}TelegramService.cs`);
const stateCs = rows(`${csDir}DesktopState.cs`);
const pure = rows(`${javaDir}AccountBackgrounds.java`);
const java = rows(`${javaDir}NativeBridge.java`);
const tdlib = rows('../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java');
const model = rows('./cloud-backgrounds.ts');
const panel = rows('./CloudBackgrounds.tsx');
const appearance = rows('./AppearanceSettings.tsx');
const scope = rows('./desktopScope.ts');
const preview = rows('./preview.ts');
const probe = rows('../../../.tools/cwb-probe/Program.cs');
const { sortCloudBackgrounds } = await import('./cloud-backgrounds');

const bodies: Record<string, string[]> = {
  'DesktopBackgrounds.cs': rules, 'DesktopBackgroundsFlow.cs': flow, 'TelegramService.cs': service,
  'DesktopState.cs': stateCs, 'AccountBackgrounds.java': pure, 'NativeBridge.java': java, 'TdApi.java': tdlib,
  'cloud-backgrounds.ts': model, 'CloudBackgrounds.tsx': panel, 'AppearanceSettings.tsx': appearance,
  'desktopScope.ts': scope, 'preview.ts': preview, 'Program.cs': probe,
};

/** La línea —1-based— de la primera fila que dice la aguja. */
function en(needle: string, file: string): number {
  const body = bodies[file];
  if (body === undefined) throw new Error(`Nadie vigiló ${file}`);
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${file} dice ${needle}`);
  return index + 1;
}
/** La única línea que dice la aguja: si se repite, la ancla no puede medirse y la prueba lo dice. */
function sola(needle: string, file: string): number {
  const hits = bodies[file].map((row, i) => (row.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${file} dice ${needle} en ${hits.join(',') || 'ninguna'} línea`);
  return hits[0];
}
const count = (needle: string, cuerpo: string | string[]) =>
  (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;
const lineOf = (file: string, at: number) => {
  const row = bodies[file][at - 1];
  if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
  return row;
};

/** La frase que C# asigna a una constante, unidas las partes de una concatenación. */
function csFrase(name: string, body: string[]): string {
  const start = body.findIndex(row => row.includes(`public const string ${name} =`));
  if (start < 0) throw new Error(`Falta la constante ${name}`);
  const trozo: string[] = [];
  for (let index = start; index < body.length; index++) {
    trozo.push(body[index]);
    if (body[index].includes(';')) break;
  }
  return [...trozo.join(' ').matchAll(/"([^"]*)"/g)].map(match => match[1]).join('');
}

/** La propiedad de un objeto de frases del andamio, cortado por su llave de cierre. */
function tsFrase(key: string): string {
  const start = preview.findIndex(row => row.includes('const CLOUD_REFUSALS = {'));
  if (start < 0) throw new Error('Falta CLOUD_REFUSALS');
  let end = start;
  while (!preview[end].includes('};')) end++;
  const match = new RegExp(`\\b${key}: '([^']*)'`).exec(preview.slice(start, end + 1).join('\n'));
  if (!match) throw new Error(`Falta ${key} en CLOUD_REFUSALS`);
  return match[1];
}

const LEER = 'backgrounds.list';
const PONER = 'background.set';
const SINTESIS = 'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.';

describe('ronda CH-B · las reglas del host, solas', () => {
  it('los tres nombres de tipo son los mismos que produce Android, y el cuarto de Android no sale aquí', () => {
    for (const [csharp, javaName] of [['Fill', 'FILL'], ['Wallpaper', 'WALLPAPER'], ['Pattern', 'PATTERN']] as [string, string][]) {
      const filaJava = lineOf('AccountBackgrounds.java', sola(`static final String ${javaName} =`, 'AccountBackgrounds.java'));
      expect(csFrase(csharp, rules), javaName).toBe(/"([^"]*)"/.exec(filaJava)![1]);
    }
    // El cuarto nombre de Android solo se nombra en el comentario: MTProto no mete temas de chat en esta lista, así
    // que ninguna línea de código lo produce.
    expect(rules.filter(row => row.includes('chatTheme') && !row.trim().startsWith('///'))).toEqual([]);
    expect(rules.join('\n')).not.toMatch(/const string Chat\w* =/);
    // Los tres nombres de tipo y las siete negativas: diez constantes, ninguna más.
    expect(count('public const string', rules)).toBe(10);
  });

  it('la marca de serie no la sabe MTProto y el host lo dice con un nulo en vez de aproximar', () => {
    expect(lineOf('DesktopBackgrounds.cs', sola('public static bool? Stock(', 'DesktopBackgrounds.cs'))).toContain('=> null;');
    // La marca del puesto sí viene: es el bit `default_` de la respuesta, no un recuerdo de la sesión.
    expect(lineOf('DesktopBackgrounds.cs', sola('WallPaper file => (file.flags & WallPaper.Flags.default_) != 0,', 'DesktopBackgrounds.cs')))
      .toContain('Flags.default_');
    expect(lineOf('DesktopState.cs', sola('Selected = DesktopBackgrounds.IsChosen(wallpaper),', 'DesktopState.cs'))).toContain('IsChosen');
    expect(lineOf('DesktopState.cs', sola('Stock = DesktopBackgrounds.Stock(wallpaper),', 'DesktopState.cs'))).toContain('DesktopBackgrounds.Stock');
    // Y en Android es al revés: ahí la marca de serie viene en la fila y el puesto sale de la tienda del aviso.
    expect(lineOf('AccountBackgrounds.java', sola('.put("stock", background.isDefault)', 'AccountBackgrounds.java'))).toContain('isDefault');
    expect(lineOf('AccountBackgrounds.java', sola('.put("selected", id.equals(chosen))', 'AccountBackgrounds.java'))).toContain('chosen');
  });

  it('el nombre tampoco lo trae la respuesta: la fila sale vacía y la pantalla lo saca del tipo', () => {
    expect(lineOf('DesktopState.cs', sola('Name = "",', 'DesktopState.cs'))).toContain('Name = ""');
    expect(lineOf('cloud-backgrounds.ts', sola('export function cloudBackgroundLabel(', 'cloud-backgrounds.ts'))).toBeDefined();
    expect(lineOf('cloud-backgrounds.ts', sola("return name.length > 0 ? name : CLOUD_KIND_LABELS[row.kind] ?? CLOUD_KIND_LABELS[''];", 'cloud-backgrounds.ts')))
      .toContain("CLOUD_KIND_LABELS[row.kind] ?? CLOUD_KIND_LABELS['']");
    expect(lineOf('CloudBackgrounds.tsx', sola('<strong>{t(cloudBackgroundLabel(row))}</strong>', 'CloudBackgrounds.tsx'))).toBeDefined();
    // Y el aviso del puesto se lee con la misma palabra que la fila, no con un nombre inventado.
    expect(count('cloudBackgroundLabel(answer)', panel)).toBe(3);
    expect(lineOf('CloudBackgrounds.tsx', sola("if (row.stock !== null) marks.push(row.stock ? t('de serie') : t('de la cuenta'));", 'CloudBackgrounds.tsx')))
      .toContain('row.stock !== null');
  });

  it('el giro pasa por la misma fórmula que en Android, con el doble módulo que la sonda mira', () => {
    expect(lineOf('DesktopBackgrounds.cs', sola('var normalized = ((rotation % 360) + 360) % 360;', 'DesktopBackgrounds.cs'))).toBeDefined();
    expect(lineOf('DesktopBackgrounds.cs', sola('return (180 + normalized) % 360;', 'DesktopBackgrounds.cs'))).toBeDefined();
    expect(lineOf('AccountBackgrounds.java', sola('return (180 + Math.floorMod(rotation, 360)) % 360;', 'AccountBackgrounds.java'))).toBeDefined();
    // Los casos que la sonda cuenta, escritos por el camino largo (pintar la fila) para que el giro se pruebe con
    // los mismos nombres que usa el protocolo: el negativo que con un solo módulo se caería por debajo de cero.
    expect(sola('DosColores(0x112233, 0x445566, -315)', 'Program.cs')).toBeGreaterThan(0);
    expect(sola('DosColores(0x112233, 0x445566, 405)', 'Program.cs')).toBeGreaterThan(0);
    expect(sola('"un giro negativo sigue saliendo del lado de Android"', 'Program.cs')).toBeGreaterThan(0);
    expect(count('"linear-gradient(225deg, #112233, #445566)"', probe)).toBe(2);
  });

  it('una imagen no se pinta, un estampado pinta su relleno y los colores salen en el orden de Telegram', () => {
    expect(lineOf('DesktopBackgrounds.cs', sola('public static string? Css(WallPaperBase wallpaper) =>', 'DesktopBackgrounds.cs')))
      .toContain('KindOf(wallpaper) == Wallpaper ? null : Paint(wallpaper.Settings)');
    expect(lineOf('DesktopBackgrounds.cs', sola('1 => stops[0],', 'DesktopBackgrounds.cs'))).toBeDefined();
    expect(lineOf('DesktopBackgrounds.cs', sola('2 => $"linear-gradient({Angle(settings.rotation)}deg, ', 'DesktopBackgrounds.cs')))
      .toContain('linear-gradient({Angle(settings.rotation)}deg');
    expect(lineOf('DesktopBackgrounds.cs', sola('3 or 4 => "linear-gradient(180deg, "', 'DesktopBackgrounds.cs'))).toBeDefined();
    // La máscara del color es la de Android, sin almohadilla de más y sin alfa.
    expect(lineOf('DesktopBackgrounds.cs', sola('public static string Hex(int color)', 'DesktopBackgrounds.cs'))).toContain('color & 0xffffff');
    expect(lineOf('AccountBackgrounds.java', sola('return String.format(Locale.ROOT, "#%06x", color & 0xffffff);', 'AccountBackgrounds.java')))
      .toContain('color & 0xffffff');
    // Cero colores no es fondo pintable: la rama que lo dice y el caso de la sonda que lo mira.
    expect(lineOf('DesktopBackgrounds.cs', sola('if (settings == null) return null;', 'DesktopBackgrounds.cs'))).toBeDefined();
    expect(sola('"sin ningún bit de color no hay fondo pintable"', 'Program.cs')).toBeGreaterThan(0);
  });

  it('el identificador viaja en texto, se lee estricto y la hoja que no es de las dos medidas no se pide', () => {
    expect(lineOf('DesktopBackgrounds.cs', sola('public static string IdOf(', 'DesktopBackgrounds.cs'))).toContain('wallpaper.ID.ToString()');
    expect(lineOf('AccountBackgrounds.java', sola('String id = String.valueOf(background.id);', 'AccountBackgrounds.java'))).toContain('String.valueOf');
    expect(lineOf('DesktopBackgrounds.cs', sola('if (!long.TryParse(value.Trim(), System.Globalization.NumberStyles.AllowLeadingSign,', 'DesktopBackgrounds.cs')))
      .toContain('NumberStyles.AllowLeadingSign');
    expect(lineOf('DesktopBackgrounds.cs', sola('WallPaper file => new InputWallPaper { id = file.id, access_hash = file.access_hash },', 'DesktopBackgrounds.cs'))).toBeDefined();
    expect(lineOf('DesktopBackgrounds.cs', sola('WallPaperNoFile solid => new InputWallPaperNoFile { id = solid.id },', 'DesktopBackgrounds.cs'))).toBeDefined();
    // La regla pura no lanza nada: lo niega el brazo, y así la sonda compila el archivo sin arrastrar el cable.
    expect(lineOf('DesktopBackgrounds.cs', sola('public static InputWallPaperBase? InputOf(', 'DesktopBackgrounds.cs'))).toContain('=> wallpaper switch');
  });

  it('las siete negativas del host están dichas una sola vez, en el archivo que las explica', () => {
    for (const name of ['Nothing', 'BadId', 'NoCreate', 'NoList', 'Gone', 'NotConfirmed', 'ModeChanged'])
      expect(count(`public const string ${name} =`, rules), name).toBe(1);
    expect(csFrase('Nothing', rules)).toBe(/"([^"]*)"/.exec(lineOf('AccountBackgrounds.java', sola('static final String NOTHING =', 'AccountBackgrounds.java')))![1]);
    // Las otras dos no tienen gemela en Android: son de la librería de Windows.
    expect(csFrase('NoList', rules)).toContain('no devolvió ninguna lista');
    expect(csFrase('NotConfirmed', rules)).toContain('no confirmó el fondo');
  });
});

describe('ronda CH-B · el cable de los dos brazos', () => {
  it('las dos claves entran en el `switch` con su método al lado y sin negarse por la puerta genérica', () => {
    expect(lineOf('TelegramService.cs', sola(`"${LEER}" => await BackgroundsListAsync(args),`, 'TelegramService.cs'))).toBeDefined();
    expect(lineOf('TelegramService.cs', sola(`"${PONER}" => await BackgroundSetAsync(args),`, 'TelegramService.cs'))).toBeDefined();
    expect(count(`"${LEER}" =>`, service)).toBe(1);
    expect(count(`"${PONER}" =>`, service)).toBe(1);
    // Pegadas a las dos de la ubicación en directo, el sitio que dejaron las rondas CB y CH.
    expect(en('"location.live.stop" => await StopLiveLocationAsync(args),', 'TelegramService.cs'))
      .toBeLessThan(en(`"${LEER}" => await BackgroundsListAsync(args),`, 'TelegramService.cs'));
  });

  it('la lectura pide la cuenta, recorta al modo y publica los dos huecos antes de responder', () => {
    const abrir = sola('private async Task<object?> BackgroundsListAsync(', 'DesktopBackgroundsFlow.cs');
    expect(lineOf('DesktopBackgroundsFlow.cs', abrir + 2)).toContain('BackgroundRowDto.Rows(await InstalledWallPapersAsync())');
    expect(lineOf('DesktopBackgroundsFlow.cs', abrir + 3)).toContain('var dark = Bool(args, "dark");');
    expect(lineOf('DesktopBackgroundsFlow.cs', abrir + 4)).toContain('PublishCloudSlots(rows);');
    expect(lineOf('DesktopBackgroundsFlow.cs', abrir + 5)).toContain('rows.FindAll(row => row.Dark == dark)');
    // El marcador en cero es lo que impide el `wallPapersNotModified` sin lista.
    expect(lineOf('DesktopBackgroundsFlow.cs', sola('var answer = await client.Account_GetWallPapers(0);', 'DesktopBackgroundsFlow.cs'))).toBeDefined();
    expect(lineOf('DesktopBackgroundsFlow.cs', sola('if (answer?.wallpapers == null) throw new BridgeException(DesktopBackgrounds.NoList);', 'DesktopBackgroundsFlow.cs'))).toBeDefined();
  });

  it('el brazo que pone recorre las ramas en el orden del puente y niega la creación por su nombre', () => {
    const abrir = sola('private async Task<object?> BackgroundSetAsync(', 'DesktopBackgroundsFlow.cs');
    const cuerpo = flow.slice(abrir - 1, abrir + 19).join('\n');
    const orden = ['Nothing', 'NoCreate', 'BadId', 'Gone', 'ModeChanged', 'NotConfirmed']
      .map(name => [name, cuerpo.indexOf(`DesktopBackgrounds.${name})`)] as [string, number]);
    for (const [name, at] of orden) expect(at, `falta ${name} en el brazo`).toBeGreaterThan(-1);
    expect(orden.map(([, at]) => at)).toEqual([...orden.map(([, at]) => at)].sort((a, b) => a - b));
    // Las dos comprobaciones que Android no hace porque su escritura no necesita la lista.
    expect(cuerpo).toContain('Array.Find(installed, item => item.ID == wanted)');
    expect(cuerpo).toContain('if (DesktopBackgrounds.IsDark(wallpaper) != dark)');
    expect(cuerpo).toContain('DesktopBackgrounds.InputOf(wallpaper) ?? throw new BridgeException(DesktopBackgrounds.Gone)');
    expect(cuerpo).toContain('Account_InstallWallPaper(request, wallpaper.Settings)');
    // Y la fila se releé después de instalar: la marca que pinta la raíz es la que devuelve Telegram.
    expect(cuerpo).toContain('var after = BackgroundRowDto.Rows(await InstalledWallPapersAsync());');
    expect(cuerpo).toContain('return after.Find(row => row.Id == raw)');
  });

  it('la lectura de arranque pinta el fondo sin abrir el panel y su fallo no tira la sesión', () => {
    expect(lineOf('DesktopBackgroundsFlow.cs', sola('PublishCloudSlots(BackgroundRowDto.Rows(await InstalledWallPapersAsync()));', 'DesktopBackgroundsFlow.cs'))).toBeDefined();
    expect(lineOf('DesktopBackgroundsFlow.cs', sola('catch { /* Sin lista no hay fondo', 'DesktopBackgroundsFlow.cs'))).toContain('catch {');
    expect(lineOf('TelegramService.cs', sola('await RefreshCloudSlotsAsync();', 'TelegramService.cs'))).toBeDefined();
    expect(count('RefreshCloudSlotsAsync()', service)).toBe(1);
    // El hueco se limpia con la cuenta: sin lectura no hay fondo de cuenta que pintar.
    expect(lineOf('DesktopState.cs', sola('Appearance.AccountBackgrounds = null;', 'DesktopState.cs'))).toContain('= null');
  });

  it('los dos huecos del estado salen de la misma lista y cada uno es del suyo modo', () => {
    expect(lineOf('DesktopState.cs', sola('Light = rows.Find(row => row.Selected && !row.Dark),', 'DesktopState.cs'))).toContain('!row.Dark');
    expect(lineOf('DesktopState.cs', sola('Dark = rows.Find(row => row.Selected && row.Dark),', 'DesktopState.cs'))).toContain('row.Selected && row.Dark');
    expect(lineOf('DesktopState.cs', sola('public BackgroundSlotsDto? AccountBackgrounds { get; set; }', 'DesktopState.cs'))).toBeDefined();
    expect(lineOf('cloud-backgrounds.ts', sola('return dark ? slots?.dark : slots?.light;', 'cloud-backgrounds.ts'))).toBeDefined();
  });
});

describe('ronda CH-B · la pantalla en las dos capas', () => {
  it('el bloque se monta también en escritorio, que ya tiene quién conteste las dos claves', () => {
    const montaje = sola('{(state.platform === \'android\' || state.platform === \'desktop\') && <CloudBackgroundSettings', 'AppearanceSettings.tsx');
    expect(lineOf('AppearanceSettings.tsx', montaje)).toContain('platform={state.platform}');
    expect(count('<CloudBackgroundSettings', appearance)).toBe(1);
    expect(lineOf('CloudBackgrounds.tsx', sola('export function CloudBackgroundSettings({ dark, accent, canvas, platform, run }', 'CloudBackgrounds.tsx')))
      .toContain('platform');
  });

  it('la nota del elegido dice de dónde sale la marca en cada capa', () => {
    const desktop = sola("? 'La marca de elegido la pone Telegram en la lista que se lee", 'CloudBackgrounds.tsx');
    const android = sola(": 'La marca de elegido la pone Telegram cuando la cuenta avisa un cambio", 'CloudBackgrounds.tsx');
    expect(desktop).toBeLessThan(android);
    expect(lineOf('CloudBackgrounds.tsx', android)).toContain('hasta el siguiente aviso');
    expect(lineOf('CloudBackgrounds.tsx', desktop)).toContain('cada lectura la trae fresca');
    // Y la nota se lee antes de las filas, que es donde estaba desde la CH-A.
    expect(panel.slice(desktop - 1).join('\n')).toContain('sortCloudBackgrounds(rows)');
    expect(count('La marca de elegido la pone Telegram', panel)).toBe(2);
  });

  it('el formulario de colores solo se ofrece donde la orden existe, y el límite se dice donde no', () => {
    expect(lineOf('CloudBackgrounds.tsx', sola("{platform === 'android' && <>", 'CloudBackgrounds.tsx'))).toBeDefined();
    expect(lineOf('CloudBackgrounds.tsx', sola('<div className="cloud-background-create">', 'CloudBackgrounds.tsx'))).toBeDefined();
    expect(lineOf('CloudBackgrounds.tsx', sola('Windows solo pone fondos que la cuenta ya tiene', 'CloudBackgrounds.tsx')))
      .toContain('ese paso no existe aquí');
    // La frase del host y la de la pantalla dicen el mismo hueco, cada una con sus palabras.
    expect(csFrase('NoCreate', rules)).toContain('la única forma de escribir uno nuevo');
    const crear = sola('function create()', 'CloudBackgrounds.tsx');
    expect(panel.slice(crear - 1, crear + 8).join('\n')).toContain("run<CloudBackground>('background.set', { ...params })");
  });

  it('lo que la capa no manda no se afirma: sin marca no hay palabra de serie y el orden sigue definido', () => {
    expect(lineOf('CloudBackgrounds.tsx', sola("if (row.stock !== null) marks.push", 'CloudBackgrounds.tsx'))).toBeDefined();
    // Sin marca `null` y marca falsa caen en el mismo grupo —detrás de lo de serie—, y dentro del grupo manda el
    // nombre: la marca ausente no sube a una fila por las dudas.
    const ordenado: CloudBackground[] = [
      { id: 'a', name: 'Uno', dark: true, stock: null, selected: false, kind: 'fill', css: '#111111' },
      { id: 'b', name: 'Dos', dark: true, stock: true, selected: false, kind: 'fill', css: '#222222' },
      { id: 'c', name: 'Tres', dark: true, stock: false, selected: false, kind: 'fill', css: '#333333' },
    ];
    expect(sortCloudBackgrounds(ordenado).map(row => row.name)).toEqual(['Dos', 'Tres', 'Uno']);
    expect(sortCloudBackgrounds([...ordenado].reverse()).map(row => row.name)).toEqual(['Dos', 'Tres', 'Uno']);
  });
});

describe('ronda CH-B · el andamio escrito', () => {
  it('la puerta de alcance ya no promete la lectura ni el puesto pendientes', () => {
    const fila = sola(`methods: ['${LEER}', '${PONER}'] },`, 'desktopScope.ts');
    expect(lineOf('desktopScope.ts', fila)).toContain('leer y poner los fondos que la cuenta ya tiene');
    expect(lineOf('desktopScope.ts', fila)).toContain('(crear uno por color, no)');
    expect(fila).toBeLessThan(sola('export const DESKTOP_PENDING: readonly ScopeClaim[] = [', 'desktopScope.ts'));
    expect(fila).toBeGreaterThan(sola('export const DESKTOP_AVAILABLE: readonly ScopeClaim[] = [', 'desktopScope.ts'));
    expect(count(`'${LEER}'`, scope)).toBe(1);
    expect(count(`'${PONER}'`, scope)).toBe(1);
  });

  it('las cinco frases del host están en el andamio carácter a carácter', () => {
    for (const [ts, cs] of [['nothing', 'Nothing'], ['badId', 'BadId'], ['noCreate', 'NoCreate'], ['gone', 'Gone'], ['modeChanged', 'ModeChanged']] as [string, string][])
      expect(tsFrase(ts), cs).toBe(csFrase(cs, rules));
    // La del hueco no entra en la lista de las cinco que saltan la puerta genérica: aquí el brazo sí existe.
    expect(count('CLOUD_REFUSALS.noCreate', preview)).toBe(1);
    expect(count('CLOUD_REFUSALS.gone', preview)).toBe(1);
  });

  it('el andamio despacha las dos claves y deja la rama de colores en su sitio', () => {
    expect(lineOf('preview.ts', sola(`if (method === '${LEER}') return designBackgrounds(params, state);`, 'preview.ts'))).toBeDefined();
    expect(lineOf('preview.ts', sola(`if (method === '${PONER}' && !designCloudColors(params)) return designBackgroundSet(params, state);`, 'preview.ts'))).toBeDefined();
    expect(lineOf('preview.ts', sola(`if (method === '${PONER}' && state.platform === 'desktop') throw new Error(CLOUD_REFUSALS.noCreate);`, 'preview.ts'))).toBeDefined();
    // La rama de colores de Android cae al rechazo sintético de siempre: el CSS lo devuelve TDLib y aquí no se inventa.
    expect(sola(`if (method === '${LEER}') return designBackgrounds`, 'preview.ts'))
      .toBeGreaterThan(sola("if (method === 'location.live.stop')", 'preview.ts'));
    expect(sola(`if (method === '${PONER}' && state.platform === 'desktop'`, 'preview.ts'))
      .toBeLessThan(sola(`throw new Error('${SINTESIS.slice(0, 24)}`, 'preview.ts'));
  });

  it('la lista sintética tiene las cuatro formas y los identificadores viajan en texto', () => {
    const inicio = sola('let previewBackgrounds: CloudBackground[] = [', 'preview.ts');
    const cuerpo = preview.slice(inicio - 1, inicio + 5).join('\n');
    for (const kind of ["kind: 'fill'", "kind: 'pattern'", "kind: 'wallpaper'"]) expect(cuerpo, kind).toContain(kind);
    expect(count('id:', cuerpo)).toBe(4);
    for (const match of cuerpo.matchAll(/id: '(\d+)'/g)) expect(match[1], 'el identificador tiene que caber en texto').not.toMatch(/e\+/i);
    // Cada modo trae su puesto: sin esa fila la raíz no tendría qué pintar.
    expect(cuerpo).toContain('selected: true');
    expect(count('dark: true', cuerpo)).toBe(2);
    expect(count('dark: false', cuerpo)).toBe(2);
  });
});

type Call = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Boot = { call: Call; snap: () => Record<string, any> };

async function boot(platform: 'android' | 'web' | 'desktop'): Promise<Boot> {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  const transport = await import('./bridge');
  transport.acceptState({ ...fixture, platform });
  return { call: designRequest as Call, snap: () => transport.snapshot() as unknown as Record<string, any> };
}

describe('ronda CH-B · llamado de verdad', () => {
  let desktop: Boot, android: Boot;
  beforeEach(async () => {
    desktop = await boot('desktop');
    android = await boot('android');
  });

  const failure = (booteo: Boot, method: string, params: Record<string, unknown> = {}) =>
    booteo.call(method, params).then(() => new Error('respondió sin negarse'), (reason: unknown) => reason as Error);

  it('la lectura de escritorio trae filas sin nombre y sin marca, y la de Android con las dos cosas', async () => {
    const claro = await desktop.call(LEER, { dark: false }) as { rows: any[] };
    expect(claro.rows.length).toBeGreaterThan(0);
    for (const row of claro.rows) {
      expect(row.name).toBe('');
      expect(row.stock).toBeNull();
      expect(row.dark).toBe(false);
    }
    const oscuro = await android.call(LEER, { dark: true }) as { rows: any[] };
    for (const row of oscuro.rows) {
      expect(typeof row.stock).toBe('boolean');
      expect(row.name.length).toBeGreaterThan(0);
      expect(row.dark).toBe(true);
    }
    // Y la lectura publica los dos huecos: la raíz pinta sin que nadie abra el panel.
    const huecos = desktop.snap().appearance.accountBackgrounds;
    expect(huecos.light.selected).toBe(true);
    expect(huecos.dark.selected).toBe(true);
    expect(huecos.light.dark).toBe(false);
    expect(huecos.dark.dark).toBe(true);
  });

  it('poner por identificador mueve la marca dentro de su modo y deja el otro intacto', async () => {
    const antes = await desktop.call(LEER, { dark: false }) as { rows: any[] };
    const elegido = antes.rows.find(row => !row.selected);
    const despues = await desktop.call(PONER, { id: elegido.id, dark: false }) as any;
    expect(despues.selected).toBe(true);
    expect(despues.id).toBe(elegido.id);
    expect(despues.name).toBe('');
    expect(despues.stock).toBeNull();
    const lista = await desktop.call(LEER, { dark: false }) as { rows: any[] };
    expect(lista.rows.filter(row => row.selected).length).toBe(1);
    expect(lista.rows.find(row => row.selected)!.id).toBe(elegido.id);
    // El modo oscuro no se toca: la marca de puesto es por modo en las dos capas.
    const oscuro = await desktop.call(LEER, { dark: true }) as { rows: any[] };
    expect(oscuro.rows.filter(row => row.selected).length).toBe(1);
    const huecos = desktop.snap().appearance.accountBackgrounds;
    expect(huecos.light.id).toBe(elegido.id);
    expect(huecos.dark.selected).toBe(true);
  });

  it('las cuatro negativas del brazo se oyen en el andamio con la frase del host', async () => {
    expect((await failure(desktop, PONER, {})).message).toBe(tsFrase('nothing'));
    expect((await failure(desktop, PONER, { id: 'no-es-número', dark: false })).message).toBe(tsFrase('badId'));
    expect((await failure(desktop, PONER, { id: '999999', dark: false })).message).toBe(tsFrase('gone'));
    const lista = await desktop.call(LEER, { dark: true }) as { rows: any[] };
    expect((await failure(desktop, PONER, { id: lista.rows[0].id, dark: false })).message).toBe(tsFrase('modeChanged'));
    // El orden es el del brazo: un identificador que no es número se niega antes de buscarlo en la lista, aunque el
    // modo pedido tampoco cuadre con ninguna fila.
    expect((await failure(desktop, PONER, { id: 'no-es-número', dark: true })).message).toBe(tsFrase('badId'));
  });

  it('la creación por color se niega por su nombre en escritorio y se queda sin modelo en Android', async () => {
    expect((await failure(desktop, PONER, { top: '#0a141e', dark: true })).message).toBe(csFrase('NoCreate', rules));
    expect((await failure(android, PONER, { top: '#0a141e', dark: true })).message).toBe(SINTESIS);
    // Con las dos cosas vacías no hay orden ninguna, y eso lo dice la misma frase en las dos capas.
    expect((await failure(android, PONER, {})).message).toBe(csFrase('Nothing', rules));
  });

  it('la lectura del otro modo no cuela filas del modo que está pintado', async () => {
    const claro = await desktop.call(LEER, { dark: false }) as { rows: any[] };
    const oscuro = await desktop.call(LEER, { dark: true }) as { rows: any[] };
    expect(claro.rows.every(row => row.dark === false)).toBe(true);
    expect(oscuro.rows.every(row => row.dark === true)).toBe(true);
    expect(claro.rows.length + oscuro.rows.length).toBe(4);
  });
});

describe('ronda CH-B · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir hoy la línea citada. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    // Android: los tres nombres de tipo, la frase del nada, el cálculo del relleno y la fila del contrato.
    'AccountBackgrounds.java:26': 'static final String FILL = "fill";',
    'AccountBackgrounds.java:27': 'static final String WALLPAPER = "wallpaper";',
    'AccountBackgrounds.java:28': 'static final String PATTERN = "pattern";',
    'AccountBackgrounds.java:33': 'static final String NOTHING =',
    'AccountBackgrounds.java:51': 'static String css(TdApi.BackgroundType type) {',
    'AccountBackgrounds.java:56': 'return "linear-gradient(" + angle(gradient.rotationAngle) + "deg, "',
    'AccountBackgrounds.java:67': 'return "linear-gradient(180deg, " + stops + ")";',
    'AccountBackgrounds.java:72': 'private static TdApi.BackgroundFill fillOf(',
    'AccountBackgrounds.java:87': 'static JSONObject row(',
    'AccountBackgrounds.java:89': 'String id = String.valueOf(background.id);',
    'AccountBackgrounds.java:99': 'static JSONArray rows(',
    // La guarda que la ronda CITA-D dejó citada en el docstring de `DesktopBackgrounds.cs`: sin lista, fila vacía.
    'AccountBackgrounds.java:101': 'if (backgrounds == null) return result;',
    'AccountBackgrounds.java:113': 'static String putSlot(',
    'AccountBackgrounds.java:212': 'return String.format(Locale.ROOT, "#%06x", color & 0xffffff);',
    // La marca que TDLib sí trae y MTProto no, en la clase del documento de la librería.
    'TdApi.java:4982': 'public static class Background extends Object {',
    // El puente de Android: las dos órdenes y las dos frases que el host reproduce.
    'NativeBridge.java:754': 'case "backgrounds.list":backgroundsList(p,a);break;',
    'NativeBridge.java:755': 'case "background.set":backgroundSet(p,a);break;',
    'NativeBridge.java:5386': 'if(destroyed||!currentAccount()||session.selfId!=owner){a.fail("La cuenta cambió.");return;}',
    'NativeBridge.java:5401': 'private void backgroundSet(JSONObject p,Answer a){',
    'NativeBridge.java:5407': 'remote.backgroundId=BridgePolicy.id(p,"id");',
    'NativeBridge.java:5409': 'a.fail("El identificador del fondo no vale.");',
    // Windows: la regla pura, el brazo y el estado.
    'DesktopBackgrounds.cs:76': 'public const string NoCreate =',
    'DesktopBackgrounds.cs:127': 'public static bool IsChosen(',
    'DesktopBackgrounds.cs:136': 'public static bool? Stock(',
    'DesktopBackgroundsFlow.cs:70': 'throw new BridgeException(DesktopBackgrounds.Nothing);',
    'DesktopBackgroundsFlow.cs:88': '/// Los dos huecos del estado',
    'DesktopState.cs:547': 'Name = "",',
    // La pantalla, en las dos capas.
    'CloudBackgrounds.tsx:13': 'export function CloudBackgroundSettings({ dark, accent, canvas, platform, run }',
    'CloudBackgrounds.tsx:40': "if (answer?.rows) setRows(answer.rows); else setError(",
    'CloudBackgrounds.tsx:113': 'if (row.stock !== null) marks.push(',
    'CloudBackgrounds.tsx:124': "{platform === 'android' && <>",
    'cloud-backgrounds.ts:1': 'export type CloudBackground = {',
    'cloud-backgrounds.ts:49': 'export function cloudBackgroundLabel(',
    'desktopScope.ts:75': "methods: ['backgrounds.list', 'background.set'] },",
  };

  /** Las anclas que solo se citan como rango, con la línea donde terminan y lo que dice. */
  const ends: Record<string, [number, string]> = {
    'TdApi.java:4982': [4990, 'public boolean isDefault;'],
    'AccountBackgrounds.java:72': [75, 'return null;'],
    'DesktopBackgroundsFlow.cs:70': [85, 'return after.Find(row => row.Id == raw)'],
    'DesktopBackgroundsFlow.cs:88': [91, 'private void PublishCloudSlots('],
  };

  const watched: [string, string][] = [
    ['rondaCHB.test.ts', text('./rondaCHB.test.ts').split('const text =')[0]],
    ['DesktopBackgrounds.cs', rules.join('\n')],
    ['DesktopBackgroundsFlow.cs', flow.join('\n')],
    ['TelegramService.cs brazos', service.slice(en('"location.live.start" => throw', 'TelegramService.cs') - 1, en('"updates.check"', 'TelegramService.cs')).join('\n')],
    ['DesktopState.cs huecos', stateCs.slice(en('/// Los dos fondos que la cuenta tiene puestos', 'DesktopState.cs') - 1, en('public sealed class ChromeDto', 'DesktopState.cs')).join('\n')],
    ['AccountBackgrounds.java tipos', pure.slice(en('static final String FILL =', 'AccountBackgrounds.java') - 1, en('static final String NOTHING =', 'AccountBackgrounds.java') + 1).join('\n')],
    ['AccountBackgrounds.java css', pure.slice(en('static String css(', 'AccountBackgrounds.java') - 1, en('private static TdApi.BackgroundFill fillOf', 'AccountBackgrounds.java') + 4).join('\n')],
    ['AccountBackgrounds.java fila', pure.slice(en('static JSONObject row(', 'AccountBackgrounds.java') - 1, en('static JSONArray rows(', 'AccountBackgrounds.java') + 5).join('\n')],
    ['AccountBackgrounds.java hueco', pure.slice(en('static String putSlot(', 'AccountBackgrounds.java') - 1, en('static String putSlot(', 'AccountBackgrounds.java') + 2).join('\n')],
    ['AccountBackgrounds.java hex', pure.slice(en('private static String hex(', 'AccountBackgrounds.java') - 1, en('private static String hex(', 'AccountBackgrounds.java') + 2).join('\n')],
    ['NativeBridge.java ramas', java.slice(en(`case "${LEER}":`, 'NativeBridge.java') - 1, en(`case "${PONER}":`, 'NativeBridge.java') + 1).join('\n')],
    ['cloud-backgrounds.ts', model.join('\n')],
    ['CloudBackgrounds.tsx', panel.join('\n')],
    ['AppearanceSettings.tsx montaje', appearance.slice(en("{(state.platform === 'android' || state.platform === 'desktop') && <CloudBackgroundSettings", 'AppearanceSettings.tsx') - 1, en("{(state.platform === 'android' || state.platform === 'desktop') && <CloudBackgroundSettings", 'AppearanceSettings.tsx')).join('\n')],
    ['desktopScope.ts fila', scope.slice(en('// La ronda CH-B cableó', 'desktopScope.ts') - 1, en(`methods: ['${LEER}', '${PONER}'] },`, 'desktopScope.ts')).join('\n')],
    ['preview.ts brazos', preview.slice(en("if (method === 'location.live.stop')", 'preview.ts') - 1, en("if (method === 'calls.list')", 'preview.ts')).join('\n')],
    ['preview.ts espejo', preview.slice(en('let previewBackgrounds: CloudBackground[] = [', 'preview.ts') - 1, en('function designBackgroundSet(', 'preview.ts') + 18).join('\n')],
  ];

  const written = new Map<string, number>();
  for (const [, body] of watched)
    for (const match of body.matchAll(/([A-Za-z][\w.-]*\.(?:tsx|ts|java|cs|csproj|css)):(\d+)(?:-(\d+))?/g))
      written.set(`${match[1]}:${match[2]}`, Math.max(written.get(`${match[1]}:${match[2]}`) ?? 0, Number(match[3] ?? 0)));

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('ninguna cifra se escribe de oído: cada ancla coincide con lo que mide el propio archivo', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(sola(needle, file), `${citation} medido`).toBe(Number(at));
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [at, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(at);
      const [file] = citation.split(':');
      expect(lineOf(file, at), `${citation} termina en ${at}`).toContain(needle);
    }
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    const sueltas: string[] = [];
    for (const [nombre, body] of watched) body.split('\n').forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row) || /`:\d/.test(row)) sueltas.push(`${nombre} línea ${index + 1}`);
    });
    expect(sueltas).toEqual([]);
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    const medidas: [string, number][] = [
      ['DesktopBackgrounds.cs', rules.length], ['DesktopBackgroundsFlow.cs', flow.length],
      ['TelegramService.cs', service.length], ['DesktopState.cs', stateCs.length],
      ['AccountBackgrounds.java', pure.length], ['cloud-backgrounds.ts', model.length],
      ['CloudBackgrounds.tsx', panel.length], ['AppearanceSettings.tsx', appearance.length],
      ['desktopScope.ts', scope.length], ['preview.ts', preview.length], ['Program.cs', probe.length],
    ];
    expect(medidas).toEqual([
      ['DesktopBackgrounds.cs', 213], ['DesktopBackgroundsFlow.cs', 110], ['TelegramService.cs', 4313],
      ['DesktopState.cs', 759], ['AccountBackgrounds.java', 215], ['cloud-backgrounds.ts', 97],
      ['CloudBackgrounds.tsx', 144], ['AppearanceSettings.tsx', 379], ['desktopScope.ts', 118],
      ['preview.ts', 3346], ['Program.cs', 293],
    ]);
  });
});
