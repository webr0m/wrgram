import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { desktopGapRefusal } from './desktopGap';
import {
  BACKGROUND_ANGLES, CLOUD_KIND_NOTES, cloudBackgroundCss, cloudBackgroundNotice, cloudBackgroundParams,
  isBackgroundHex, isPaintable, sortCloudBackgrounds,
  type CloudBackground, type CloudBackgroundDraft,
} from './cloud-backgrounds';

/**
 * Ronda CH-A — los fondos que la cuenta tiene instalados, en Android.
 *
 * Lo que TDLib llama `Background` (`TdApi.java:4982-5006`) no es el fondo del chat: el del chat se pone con
 * `SetChatBackground` (`TdApi.java:150976`), que ya vive en otra pantalla. El de la cuenta se lee con
 * `GetInstalledBackgrounds` (`TdApi.java:128958`), que tiene **un solo campo** —`forDarkTheme`
 * (`TdApi.java:128962`)— y cuya documentación no habla de filtro sino de **orden** («Pass true to order returned
 * backgrounds for a dark theme», `TdApi.java:128960`), y se escribe con `SetDefaultBackground`
 * (`TdApi.java:152518-152530`), que admite `background` nulo (documento `TdApi.java:152520`) y `type` nulo
 * (`TdApi.java:152524`): con las dos nulidades es por lo que una cara puede elegir sin subir archivo y la otra
 * crear un relleno nuevo sin tener dónde guardarlo.
 *
 * **Lo que se pinta y lo que no, medido campo a campo.** De los cuatro tipos que caben en `type`
 * (`TdApi.java:5006`) solo dos traen relleno: `BackgroundTypeFill` (`TdApi.java:5335`) con su `fill`
 * (`TdApi.java:5339`) y `BackgroundTypePattern` (`TdApi.java:5279-5295`) con `fill` (`TdApi.java:5283`),
 * `intensity` (`TdApi.java:5287`), `isInverted` (`TdApi.java:5291`) e `isMoving` (`TdApi.java:5295`) —el
 * estampado es un PNG o un TGV (`TdApi.java:5277`) y aquí no se baja. `BackgroundTypeWallpaper`
 * (`TdApi.java:5235-5243`) no declara más que `isBlurred` (`TdApi.java:5239`) e `isMoving` (`TdApi.java:5243`):
 * la imagen vive en el `document` del fondo (`TdApi.java:5002`, «Null only for filled and chat theme
 * backgrounds», `TdApi.java:5000`) y hay que bajarla por el conducto de medios. `BackgroundTypeChatTheme`
 * (`TdApi.java:5373`) solo trae `themeName` (`TdApi.java:5377`) y su propio documento (`TdApi.java:5371`) dice
 * que ese tipo vale **solo como fondo de conversación**. Los tres rellenos son datos puros en RGB: un color
 * (`TdApi.java:5083`), dos con su giro (`TdApi.java:5121`, `TdApi.java:5125`, `TdApi.java:5129`, y el documento
 * `TdApi.java:5127` «Must always be divisible by 45») o una lista de 3 o 4 colores (`TdApi.java:5171`,
 * documento `TdApi.java:5169`).
 *
 * **El hueco que quedó dicho y el que cerró CH-A2.** Ninguna función devuelve cuál está puesto: las únicas que
 * responden `Background` o `Backgrounds` son `GetInstalledBackgrounds`, `SearchBackground` (`TdApi.java:145224`),
 * que pide un `name` (`TdApi.java:145228`), y el propio setter. Lo que sí manda Telegram es el aviso
 * `UpdateDefaultBackground` (`TdApi.java:99598-99606`), y desde CH-A2 esa rama existe en `TdSession.java`: lo que
 * la cuenta avisa se guarda por modo y por dueño, de modo que `selected` (`AccountBackgrounds.java:94`) ya no es
 * el recuerdo de una pulsación sino lo último que Telegram dijo. `isDefault` (`TdApi.java:4988-4990`) sigue
 * significando «de los que trae Telegram» y no «el elegido», y eso sigue escrito en la pantalla
 * (`CloudBackgrounds.tsx:59`). Lo que no se cierra es lo que ocurrió con WRGram cerrado: el aviso no se replay,
 * así que la marca llega con el siguiente aviso o con el siguiente puesto.
 *
 * **Dónde vive cada regla.** Una sola vez, en `AccountBackgrounds.java`: los cuatro nombres del tipo
 * (`AccountBackgrounds.java:26-29`), las tres negaciones (`AccountBackgrounds.java:31-33`), el constructor
 * cerrado (`AccountBackgrounds.java:35`), el nombre del tipo (`AccountBackgrounds.java:38`), el CSS
 * (`AccountBackgrounds.java:51`), la regla de 3 o 4 colores (`AccountBackgrounds.java:61`), de dónde se saca el
 * relleno (`AccountBackgrounds.java:72`), la fila (`AccountBackgrounds.java:87-97`), el listado
 * (`AccountBackgrounds.java:99-104`), el relleno que se escribe (`AccountBackgrounds.java:165-174`), el giro que
 * llega como texto (`AccountBackgrounds.java:177`), el formato de color que se admite (`AccountBackgrounds.java:198`
 * con su puerta en `AccountBackgrounds.java:202`) y el giro con el que CSS pinta lo mismo (`AccountBackgrounds.java:207`).
 * La tienda de los dos huecos —el aviso guardado por modo y por dueño— vive en la misma clase y se mide en la ronda
 * CH-A2, junto con la rama que la alimenta.
 * En TypeScript solo hay reglas propias de presentación: el aviso por tipo (`cloud-backgrounds.ts:17-23`), el orden
 * del listado (`cloud-backgrounds.ts:39`), los ocho giros que ofrece la pantalla (`cloud-backgrounds.ts:45`) y lo que
 * se manda para crear (`cloud-backgrounds.ts:66-71`). Lo que Telegram admite o rechaza lo dice Java, y la pantalla
 * se limita a no enviar lo que ese ya niega.
 *
 * **El orden de los dos cuerpos, medido línea por línea.** `backgroundsList` (`NativeBridge.java:5381-5390`) pide
 * la cuenta (`NativeBridge.java:5382`), apunta al dueño y lee una vez el modo pedido (`NativeBridge.java:5383`),
 * arma la función con ese modo (`NativeBridge.java:5384`), y **solo después** de comprobar que la cuenta sigue
 * siendo la misma (`NativeBridge.java:5386`) arma las filas con el elegido del mismo modo
 * (`NativeBridge.java:5387`). `backgroundSet` (`NativeBridge.java:5401-5423`) decide rama por `id`
 * (`NativeBridge.java:5405`): con `id` viaja `InputBackgroundRemote` (`NativeBridge.java:5407`) y el `type` se
 * queda nulo; con `top` viaja el relleno (`NativeBridge.java:5411`); sin las dos cosas se niega con la palabra de
 * la clase (`NativeBridge.java:5413`). Lo que Telegram devuelve se guarda en el hueco del modo, con el dueño
 * delante (`NativeBridge.java:5417`), y se escribe en las preferencias (`NativeBridge.java:5418`) antes de avisar
 * a la instantánea (`NativeBridge.java:5419`) y antes de responder: ese orden es aguja de batería.
 *
 * **Windows y el andamio.** Las dos claves están declaradas pendientes (`desktopScope.ts:96`) y no hay ninguna
 * otra aparición de los dos nombres en el host C#: lo único que el escritorio sabe de «wallpaper» es el campo
 * local de la apariencia (`DesktopState.cs:508`, leído en `TelegramService.cs:3273`), que no es el fondo de la
 * cuenta. El andamio tampoco las despacha: aquí se prueba que `preview.ts` no tiene rama. La cara de Windows es
 * la ronda CH-B.
 *
 * Como en CF, CL, CM, CN, CJ, CK y CW: la última prueba mide las citas.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const jvmDir = '../../mobile/android/app/src/test/java/cc/webrom/wrgram/';
const csDir = '../../desktop/src/WRGram.Desktop/';
const tdlibPath = '../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java';

const bridge = rows(`${javaDir}NativeBridge.java`);
const session = rows(`${javaDir}TdSession.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const pure = rows(`${javaDir}AccountBackgrounds.java`);
const jvm = rows(`${jvmDir}AccountBackgroundsTest.java`);
const model = rows('./cloud-backgrounds.ts');
const panel = rows('./CloudBackgrounds.tsx');
const appearance = rows('./AppearanceSettings.tsx');
const app = rows('./App.tsx');
const contract = text('./contract.ts');
const scope = rows('./desktopScope.ts');
const preview = rows('./preview.ts');
const desktopState = rows(`${csDir}DesktopState.cs`);
const host = rows(`${csDir}TelegramService.cs`);
const tdlib = rows(tdlibPath);

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const atJava = (n: string) => en(n, bridge, 'NativeBridge.java');
const atPure = (n: string) => en(n, pure, 'AccountBackgrounds.java');
const atModel = (n: string) => en(n, model, 'cloud-backgrounds.ts');
const atPanel = (n: string) => en(n, panel, 'CloudBackgrounds.tsx');
const atTd = (n: string) => en(n, tdlib, 'TdApi.java');
const count = (needle: string, cuerpo: string | string[]) => (Array.isArray(cuerpo) ? cuerpo.join('\n') : cuerpo).split(needle).length - 1;

/** El cuerpo de un método, recortado por balance de llaves a partir de su firma. */
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

/** La cadena entre comillas de una constante Java, para comparar carácter a carácter con el espejo de TypeScript. */
const citaJava = (row: string) => /"(.*)"/.exec(row)?.[1] ?? '';

/** El bloque de una clase de TDLib, desde su declaración hasta la siguiente. */
function tdBlock(declaration: string, hasta = 16): string[] {
  const start = atTd(declaration);
  return tdlib.slice(start - 1, start - 1 + hasta);
}
const campos = (bloque: string[]) => bloque.filter(row => /^\s*(?:@\w+ )?public [\w[\]]+ \w+;/.test(row));

const LEER = 'backgrounds.list';
const PONER = 'background.set';

/** Una fila del listado, con la forma que devuelve el puente. */
const fila = (par: Partial<CloudBackground>): CloudBackground =>
  ({ id: '1', name: 'Sin nombre', dark: false, stock: false, selected: false, kind: '', css: null, ...par });

describe('ronda CH-A · el puente de Android', () => {
  it('las dos claves están declaradas y los dos brazos entran entre el registro y los hilos', () => {
    expect(policy).toContain(`static { METHODS.addAll(Arrays.asList("${LEER}","${PONER}")); }`);
    expect(policy).toContain('static { METHODS.add("calls.list"); }');
    const brazos = [atJava(`case "${LEER}":`), atJava(`case "${PONER}":`)];
    expect(bridge[brazos[0] - 1]).toContain('backgroundsList(p,a);break;');
    expect(bridge[brazos[1] - 1]).toContain('backgroundSet(p,a);break;');
    expect(bridge[brazos[0] - 2]).toContain('case "calls.list":callLog(p,a);break;');
    expect(bridge[brazos[1] + 1 - 1]).toContain('case "thread.load":threadLoad(p,a);break;');
    expect(count(`case "${LEER}":`, bridge)).toBe(1);
    expect(count(`case "${PONER}":`, bridge)).toBe(1);
  });

  it('el listado se pide una sola vez, con el modo que está pintado y con el elegido de ese modo', () => {
    const escrita = body(bridge, 'private void backgroundsList(JSONObject p,Answer a){', 'NativeBridge.java');
    const orden = [
      'requireAccount();',
      'long owner=session.selfId;boolean dark=p.optBoolean("dark");',
      'TdApi.GetInstalledBackgrounds request=new TdApi.GetInstalledBackgrounds();request.forDarkTheme=dark;',
      'session.perform(request,result->{',
      'if(destroyed||!currentAccount()||session.selfId!=owner){a.fail("La cuenta cambió.");return;}',
      'AccountBackgrounds.rows(result.backgrounds,chosenBackground(dark))',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = escrita.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // El campo único de la función es el orden: no hay filtro que el puente pueda estar usando mal.
    expect(campos(tdBlock('public static class GetInstalledBackgrounds extends Function<Backgrounds> {')).length).toBe(1);
    expect(escrita).not.toContain('forLightTheme');
    expect(count('TdApi.GetInstalledBackgrounds', escrita)).toBe(2);
    // El modo de la lectura y el modo de la marca son la misma variable: pedir uno y marcar el otro es mentir.
    expect(count('p.optBoolean("dark")', escrita)).toBe(1);
    expect(bridge[atJava('private String chosenBackground(boolean dark)') - 1])
      .toContain('AccountBackgrounds.chosenId(cloudStore(),String.valueOf(session.selfId),dark)');
  });

  it('elegir por identificador deja el tipo nulo y crear por color no sube archivo alguno', () => {
    const escrita = body(bridge, 'private void backgroundSet(JSONObject p,Answer a){', 'NativeBridge.java');
    const orden = [
      'requireAccount();',
      'TdApi.SetDefaultBackground set=new TdApi.SetDefaultBackground();set.forDarkTheme=p.optBoolean("dark");',
      'if(!id.isEmpty()){',
      'TdApi.InputBackgroundRemote remote=new TdApi.InputBackgroundRemote();remote.backgroundId=BridgePolicy.id(p,"id");',
      'set.background=remote;',
      '}else if(!top.isEmpty()){',
      'set.type=AccountBackgrounds.fillType(top,p.optString("bottom","").trim(),AccountBackgrounds.angleOf(p.optString("angle","0")));',
      '}else{a.fail(AccountBackgrounds.NOTHING);return;}',
      'perform(set,a,result->{',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = escrita.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 46)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // Las dos nulidades del setter son las que permiten las dos ramas sin conducto de subida.
    expect(escrita).not.toContain('InputBackgroundUploaded');
    expect(count('set.background=', escrita)).toBe(1);
    expect(count('set.type=', escrita)).toBe(1);
    expect(count('set.forDarkTheme=', escrita)).toBe(1);
    // El identificador entra validado por la política, no parseado a mano: un largo de Telegram no cabe en JavaScript.
    expect(escrita).toContain('BridgePolicy.id(p,"id")');
    expect(bridge[atJava('TdApi.InputBackgroundRemote remote=') - 2]).toContain('try{');
    expect(escrita).toContain('a.fail("El identificador del fondo no vale.");return;');
  });

  it('lo que se pone se guarda en el hueco de su modo antes de avisar a la instantánea', () => {
    const escrita = body(bridge, 'private void backgroundSet(JSONObject p,Answer a){', 'NativeBridge.java');
    const orden = [
      'JSONObject row=AccountBackgrounds.row(result,String.valueOf(result.id));',
      'String next=AccountBackgrounds.putSlot(cloudStore(),String.valueOf(session.selfId),set.forDarkTheme,row.toString());',
      'prefs.edit().putString("accountBackgrounds",next).apply();',
      'schedule();',
      'a.ok(row);',
    ];
    let anterior = -1;
    for (const paso of orden) {
      const posicion = escrita.indexOf(paso);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en el cuerpo`).toBeGreaterThan(-1);
      expect(posicion, `el paso ${paso.slice(0, 40)} no está en orden`).toBeGreaterThan(anterior);
      anterior = posicion;
    }
    // La misma fila viaja a las preferencias y a la respuesta: no puede decir dos cosas distintas.
    expect(count('AccountBackgrounds.row(result,', bridge)).toBe(1);
    expect(snapshot[en('value.put("accountBackgrounds",AccountBackgrounds.slots(', snapshot, 'NativeSnapshot.java') - 1])
      .toContain('AccountBackgrounds.slots(prefs.getString("accountBackgrounds",""),account)');
    expect(count('"accountBackgrounds"', snapshot)).toBe(2);
    // El hueco que se escribe es el del modo con el que se llamó al setter, no el que estaba pintado.
    expect(count('set.forDarkTheme,row.toString()', escrita)).toBe(1);
  });

  it('el puente no repite las palabras de la clase y las tres negaciones se dicen una sola vez', () => {
    const negacion = (nombre: string) => citaJava(pure[atPure(`static final String ${nombre} =`) - 1]);
    const color = negacion('BAD_COLOR');
    const angulo = negacion('BAD_ANGLE');
    const nada = negacion('NOTHING');
    expect(color).not.toBe('');
    expect(count(color, bridge)).toBe(0);
    expect(count(angulo, bridge)).toBe(0);
    expect(count(nada, bridge)).toBe(0);
    expect(count('a.fail(AccountBackgrounds.NOTHING)', bridge)).toBe(1);
    expect(count('a.fail(invalid.getMessage())', body(bridge, 'private void backgroundSet(', 'NativeBridge.java'))).toBe(1);
    // Cuatro nombres, tres negaciones y el formato del color: ocho constantes de texto, todas dentro de la clase.
    expect(count('static final String', pure)).toBe(8);
    expect(count('public static final String', pure)).toBe(0);
  });

  it('el aviso de la cuenta se escucha: eso es lo que CH-A2 venía a cerrar', () => {
    const actualizaciones = [...session.join('\n').matchAll(/instanceof (TdApi\.Update\w+)/g)].map(match => match[1]);
    expect(actualizaciones.length).toBeGreaterThanOrEqual(50);
    expect(actualizaciones).toContain('TdApi.UpdateDefaultBackground');
    expect(tdBlock('public static class UpdateDefaultBackground extends Update {', 10).join('\n'))
      .toContain('@Nullable public Background background;');
    // Borrar el puesto sí se puede; leerlo, no: por eso el elegido tiene que salir del aviso.
    expect(tdlib[atTd('public static class DeleteDefaultBackground extends Function<Ok> {') - 1]).toContain('Function<Ok>');
  });
});

describe('ronda CH-A · la clase pura y su prueba JVM', () => {
  it('los cuatro nombres del tipo son los cuatro que caben en `type`, y lo desconocido se queda en vacío', () => {
    const nombres = pure.slice(atPure('static final String FILL =') - 1, atPure('static final String CHAT_THEME =')).map(citaJava);
    expect(nombres).toEqual(['fill', 'wallpaper', 'pattern', 'chatTheme']);
    // El orden de las dos listas es suyo; lo que tiene que cuadrar es el contenido: los cuatro nombres y el vacío.
    expect([...Object.keys(CLOUD_KIND_NOTES)].sort()).toEqual([...nombres, ''].sort());
    const kindOf = body(pure, 'static String kindOf(TdApi.BackgroundType type) {', 'AccountBackgrounds.java');
    // Cada rama con su nombre: trocar dos es dar por pintable lo que no tiene relleno.
    expect(kindOf).toContain('if (type instanceof TdApi.BackgroundTypeFill) return FILL;');
    expect(kindOf).toContain('if (type instanceof TdApi.BackgroundTypeWallpaper) return WALLPAPER;');
    expect(kindOf).toContain('if (type instanceof TdApi.BackgroundTypePattern) return PATTERN;');
    expect(kindOf).toContain('if (type instanceof TdApi.BackgroundTypeChatTheme) return CHAT_THEME;');
    expect(kindOf).toContain('return "";');
    // Cada tipo existe en la librería con ese nombre exacto.
    for (const clase of ['BackgroundTypeFill', 'BackgroundTypeWallpaper', 'BackgroundTypePattern', 'BackgroundTypeChatTheme']) {
      expect(tdlib[atTd(`public static class ${clase} extends BackgroundType {`) - 1]).toContain(clase);
    }
  });

  it('el CSS sale del relleno y del giro que lee Telegram, no del que lee CSS', () => {
    const css = body(pure, 'static String css(TdApi.BackgroundType type) {', 'AccountBackgrounds.java');
    expect(css).toContain('return "linear-gradient(" + angle(gradient.rotationAngle) + "deg, "');
    expect(css).toContain('return "linear-gradient(180deg, " + stops + ")";');
    expect(pure[atPure('private static int angle(int rotation) {')]).toContain('(180 + Math.floorMod(rotation, 360)) % 360');
    // El giro que admite Telegram es múltiplo de 45 (documento `TdApi.java:5127`); los ocho de la pantalla lo son.
    const puerta = pure[atPure('if (rotation % 45 != 0') - 1];
    for (const angulo of BACKGROUND_ANGLES) {
      expect(angulo % 45, `el giro ${angulo} no es múltiplo de 45`).toBe(0);
      expect(puerta, `la puerta del giro no menciona ${angulo >= 100 ? 'el techo' : 'el paso'}`).toContain('% 45');
    }
    expect(BACKGROUND_ANGLES.map(angulo => (180 + angulo) % 360))
      .toEqual([180, 225, 270, 315, 0, 45, 90, 135]);
    // Lo que no tiene relleno no se pinta: la única salida es nula, y eso lo decide `fillOf`.
    expect(body(pure, 'private static TdApi.BackgroundFill fillOf(', 'AccountBackgrounds.java')).toContain('return null;');
    expect(css).toContain('if (colors == null || colors.length < 3 || colors.length > 4) return null;');
    expect(tdlib[atTd(' * A list of 3 or 4 colors of the freeform gradient in the RGB format.') - 1]).toContain('3 or 4');
  });

  it('el color se admite con almohadilla y seis u ocho dígitos, igual que en la pantalla', () => {
    const java = citaJava(pure[atPure('private static final String HEX =') - 1]).replace('(?:', '(');
    const ts = /\/\^(.+)\$\//.exec(model[atModel('return /^#') - 1])?.[1] ?? '';
    expect(java).toBe(ts);
    expect(ts).toBe('#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})');
    expect(pure[atPure('if (!hex.matches(HEX)) throw new IllegalArgumentException(BAD_COLOR);') - 1]).toContain('matches(HEX)');
    // `Palette.parse` también acepta el hex desnudo; aquí no se le deja, y eso es lo que prueba la fila JVM.
    expect(jvm[en('aColorOutsideTheTwoFormatsIsRefusedWithItsWord', jvm, 'AccountBackgroundsTest.java') - 1])
      .toContain('@Test public void aColorOutsideTheTwoFormatsIsRefusedWithItsWord');
    for (const vale of ['#0a141e', '#0a141e80', '#FF0000']) expect(isBackgroundHex(vale), vale).toBe(true);
    for (const noVale of ['0a141e', '#fff', '#00000g', '', 'rojo']) expect(isBackgroundHex(noVale), noVale).toBe(false);
  });

  it('la fila viaja con el identificador en texto y la marca de elegido la pone quien eligió', () => {
    const escrita = body(pure, 'static JSONObject row(TdApi.Background background, String chosen) throws Exception {', 'AccountBackgrounds.java');
    expect(escrita).toContain('.put("id", id)');
    expect(escrita).toContain('String id = String.valueOf(background.id);');
    expect(escrita).toContain('.put("stock", background.isDefault)');
    expect(escrita).toContain('.put("selected", id.equals(chosen))');
    expect(escrita).toContain('paint == null ? JSONObject.NULL : paint');
    // `stock` es el `isDefault` del documento, que habla de los fondos de serie, no del puesto.
    expect(tdlib[atTd(' * True, if this is one of default backgrounds.') - 1]).toContain('one of default backgrounds');
    expect(pure[atPure('.put("name", background.name == null ? "" : background.name)') - 1]).toContain('? "" :');
    // Y el listado aguanta los huecos: una fila nula no puede tirar la respuesta entera.
    expect(body(pure, 'static JSONArray rows(', 'AccountBackgrounds.java')).toContain('if (background != null)');
  });

  it('la prueba JVM existe, cubre las reglas y no deja caracteres CJK en la capa nueva', () => {
    expect(count('@Test', jvm)).toBe(25);
    expect(jvm[en('public class AccountBackgroundsTest {', jvm, 'AccountBackgroundsTest.java') - 1])
      .toContain('public class AccountBackgroundsTest {');
    for (const nombre of [
      'onlyTheFourKnownTypesGetAName', 'aWallpaperAndAChatThemeHaveNothingToPaint', 'aSolidFillBecomesItsRgbHex',
      'theGradientAngleIsReadFromTheTopByTelegramAndFromTheBottomByCss', 'aFreeformFillNeedsThreeOrFourColorsAndKeepsTheirOrder',
      'aPatternPaintsItsFillAndNotItsStamp', 'oneHexColorWithoutBottomIsASolidFill',
      'twoColorsBecomeAGradientWithTheAngleTelegramAccepts', 'anAngleThatIsNotMultipleOfFortyFiveIsRefusedWithItsWord',
      'theAngleArrivesAsNumberOrAsTextAndNothingElse', 'aColorOutsideTheTwoFormatsIsRefusedWithItsWord',
      'theIdentifierTravelsAsTextSoJavaScriptDoesNotRoundIt', 'onlyTheBackgroundChosenInThisSessionCountsAsSelected',
      'anUnpaintableRowStillShowsItsNameWithTheCssAbsent', 'theListKeepsEveryRowAndSurvivesWithoutNada',
    ]) expect(count(nombre, jvm), nombre).toBe(1);
    for (const archivo of [pure, jvm, model, panel]) {
      expect(/[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(archivo.join('\n')), 'caracteres CJK en la capa nueva').toBe(false);
    }
  });

  it('un color solo crea relleno liso y dos crean degradado con el giro que llega', () => {
    const fillType = body(pure, 'static TdApi.BackgroundType fillType(String top, String bottom, int rotation) {', 'AccountBackgrounds.java');
    expect(fillType).toContain('if (bottom == null || bottom.isEmpty() || bottom.equals(top)) return wrap(solid(first));');
    expect(fillType).toContain('gradient.rotationAngle = rotation;');
    // El giro puede llegar como texto: lo que no es entero se niega con la palabra del ángulo, no con un cero.
    expect(body(pure, 'static int angleOf(String value) {', 'AccountBackgrounds.java')).toContain('Integer.parseInt');
    expect(body(pure, 'static int angleOf(String value) {', 'AccountBackgrounds.java'))
      .toContain('throw new IllegalArgumentException(BAD_ANGLE);');
    expect(jvm[en('anAlphaHexReachesTelegramAsRgbOnly', jvm, 'AccountBackgroundsTest.java') - 1]).toContain('@Test');
    expect(pure[atPure('return Palette.parse(hex) & 0xffffff;') - 1]).toContain('& 0xffffff');
    expect(pure[atPure('private static String hex(int color) {')]).toContain('"#%06x"');
  });
});

describe('ronda CH-A · la pantalla', () => {
  it('el bloque solo se monta en Android, que es la capa que lo sabe hacer', () => {
    expect(appearance[en("import { CloudBackgroundSettings } from './CloudBackgrounds'", appearance, 'AppearanceSettings.tsx') - 1])
      .toContain("from './CloudBackgrounds'");
    const montaje = en("<CloudBackgroundSettings", appearance, 'AppearanceSettings.tsx');
    expect(appearance[montaje - 1]).toContain("{state.platform === 'android' && <CloudBackgroundSettings");
    expect(appearance[montaje - 1]).toContain("dark={active.scheme === 'dark'}");
    expect(count('<CloudBackgroundSettings', appearance)).toBe(1);
  });

  it('las dos llamadas del panel: leer con el modo activo y poner por identificador o por colores', () => {
    expect(panel[atPanel("run<{ rows?: CloudBackground[] }>('backgrounds.list'") - 1])
      .toContain("run<{ rows?: CloudBackground[] }>('backgrounds.list', { dark })");
    expect(count("run<CloudBackground>('background.set'", panel)).toBe(2);
    expect(panel[atPanel("run<CloudBackground>('background.set', { id: row.id, dark })") - 1]).toContain('{ id: row.id, dark }');
    expect(panel[atPanel('const params = cloudBackgroundParams(draft, dark);') - 1]).toContain('cloudBackgroundParams(draft, dark)');
    // Sin respuesta no se pinta nada nuevo: el aviso sale del `answer === undefined`, no del fondo anterior.
    expect(count('if (answer === undefined)', panel)).toBe(2);
    expect(panel.join('\n')).toContain('La cuenta no ha aceptado el fondo.');
    // Lo que se avisa se lee al final del repaso: si el aviso viajara aparte, `load()` lo borraría al terminar.
    expect(count('setNotice(', panel)).toBe(1);
    expect(panel[atPanel('load(isPaintable(answer)') - 1]).toContain('load(isPaintable(answer)');
    expect(count('load(`Fondo', panel)).toBe(1);
  });

  it('la marca de elegido se explica en la propia nota, no al final de la pantalla', () => {
    const nota = atPanel('La marca de elegido la pone Telegram');
    expect(panel[nota - 1]).toContain('si el fondo se cambió con WRGram cerrado, la marca no se entera hasta el siguiente aviso');
    expect(panel[nota - 1]).toContain('A diferencia del fondo del chat');
    expect(panel[nota - 1]).not.toContain('es el último que puso WRGram');
    // El aviso va delante del listado: quien baje a las filas ya lo ha leído.
    expect(panel.slice(nota - 1).join('\n')).toContain('sortCloudBackgrounds(rows)');
    expect(panel[atPanel('aria-pressed={row.selected}') - 1]).toContain('aria-pressed={row.selected}');
    expect(count('cloud-background-check', panel)).toBe(1);
  });

  it('lo no pintable se dice en la fila en vez de ocultarse, con las palabras de la lista compartida', () => {
    expect(panel[atPanel('{!isPaintable(row) && <small className="cloud-background-note">') - 1])
      .toContain('{!isPaintable(row) && <small className="cloud-background-note">');
    expect(panel[atPanel('{[row.dark ? t(\'Oscuro\')') - 1]).toContain("row.stock ? t('de serie') : t('de la cuenta')");
    expect(cloudBackgroundNotice(fila({ kind: 'wallpaper' }))).toBe(CLOUD_KIND_NOTES.wallpaper);
    expect(cloudBackgroundNotice(fila({ kind: 'chatTheme' }))).toBe(CLOUD_KIND_NOTES.chatTheme);
    expect(cloudBackgroundNotice(fila({ kind: 'pattern' }))).toBe('Solo se pinta su relleno; el estampado no se descarga en WRGram.');
    expect(cloudBackgroundNotice(fila({ kind: '' }))).toBe('Telegram no ha dicho qué tipo de fondo es.');
    expect(cloudBackgroundNotice(fila({ kind: 'fill', css: '#0a141e' }))).toBe('');
    // Una clave inventada no puede quedarse sin aviso: la última fila del listado lo diría mal.
    expect(cloudBackgroundNotice(fila({ kind: 'video' as CloudBackground['kind'] }))).toBe(CLOUD_KIND_NOTES['']);
  });

  it('el espejo de TypeScript pinta, ordena y prepara los parámetros con sus propias reglas', () => {
    expect(cloudBackgroundCss(undefined)).toBe('');
    expect(cloudBackgroundCss(fila({ kind: 'wallpaper' }))).toBe('');
    expect(cloudBackgroundCss(fila({ kind: 'fill', css: '' }))).toBe('');
    expect(cloudBackgroundCss(fila({ kind: 'fill', css: '#0a141e' }))).toBe('#0a141e');
    expect(isPaintable(fila({ css: null }))).toBe(false);
    const orden = sortCloudBackgrounds([
      fila({ id: '1', name: 'Tapiz', kind: 'wallpaper', stock: true }),
      fila({ id: '2', name: 'Liso', kind: 'fill', css: '#000000', stock: true }),
      fila({ id: '3', name: 'Cuenta', kind: 'fill', css: '#ffffff', stock: false }),
      fila({ id: '4', name: 'Azul', kind: 'fill', css: '#0000ff', selected: true }),
    ]);
    // Primero lo que se pinta, dentro de lo pintable lo de serie, y solo después el marcado como elegido.
    expect(orden.map(row => row.name)).toEqual(['Liso', 'Azul', 'Cuenta', 'Tapiz']);
    expect(orden.map(row => row.id)).toEqual(['2', '4', '3', '1']);
    expect(sortCloudBackgrounds([]).length).toBe(0);
    const borrador: CloudBackgroundDraft = { top: '#0a141e', bottom: '#ff0000', angle: 45, gradient: true };
    expect(cloudBackgroundParams(borrador, true)).toEqual({ top: '#0a141e', bottom: '#ff0000', angle: 45, dark: true });
    // Sin degradado el segundo color no viaja, que es como el puente decide la rama.
    expect(cloudBackgroundParams({ ...borrador, gradient: false }, false)).toEqual({ top: '#0a141e', dark: false });
    expect(cloudBackgroundParams({ ...borrador, bottom: 'rojo' }, true)).toBeUndefined();
    expect(cloudBackgroundParams({ ...borrador, top: '0a141e' }, true)).toBeUndefined();
  });

  it('el fondo elegido se pinta en la raíz y se quita cuando deja de valer', () => {
    expect(app[en("import { cloudBackgroundCss, cloudBackgroundFor } from './cloud-backgrounds'", app, 'App.tsx') - 1])
      .toContain("from './cloud-backgrounds'");
    const efecto = en('const cloud=cloudBackgroundCss(cloudBackgroundFor(', app, 'App.tsx');
    expect(app[efecto - 1]).toContain("root.dataset.cloudBackground='on';root.style.setProperty('--cloud-background',cloud)");
    expect(app[efecto - 1]).toContain('delete root.dataset.cloudBackground;root.style.removeProperty(\'--cloud-background\')');
    // El modo activo lo sabe solo el tema resuelto: la raíz no puede adivinarlo por la cuenta.
    expect(app[efecto - 1]).toContain("cloudBackgroundFor(state.appearance.accountBackgrounds,theme.scheme==='dark')");
    expect(contract).toContain('accountBackgrounds?: CloudBackgroundSlots');
    expect(count('accountBackgrounds?: CloudBackgroundSlots', contract)).toBe(1);
    expect(contract).toContain("import type { CloudBackgroundSlots } from './cloud-backgrounds'");
  });
});

describe('ronda CH-A · Windows y el andamio', () => {
  it('las dos claves están declaradas pendientes y el andamio no tiene rama ninguna', () => {
    const pendiente = en(`'${PONER}'`, scope, 'desktopScope.ts');
    expect(scope[pendiente - 1]).toContain("label: 'fondos guardados en tu cuenta de Telegram'");
    expect(scope[pendiente - 1]).toContain(`methods: ['${LEER}', '${PONER}']`);
    expect(scope.slice(0, pendiente).join('\n')).toContain('DESKTOP_PENDING');
    expect(count(`'${LEER}'`, scope)).toBe(1);
    expect(desktopGapRefusal(LEER)).toBe(`No disponible en escritorio (beta): ${LEER}`);
    expect(desktopGapRefusal(PONER)).toBe(`No disponible en escritorio (beta): ${PONER}`);
    expect(preview.join('\n')).not.toContain(`'${LEER}'`);
    expect(preview.join('\n')).not.toContain(`'${PONER}'`);
  });

  it('el host de escritorio no conoce las dos claves y lo suyo es el wallpaper local de la apariencia', () => {
    const cs = [...desktopState, ...host].join('\n');
    expect(cs).not.toContain(LEER);
    expect(cs).not.toContain(PONER);
    expect(desktopState[en('public string Wallpaper { get; set; } = "none";', desktopState, 'DesktopState.cs') - 1])
      .toContain('Wallpaper { get; set; } = "none"');
    expect(host[en('args.TryGetProperty("wallpaper"', host, 'TelegramService.cs') - 1]).toContain('appearance.Wallpaper');
  });

  it('las dos caras dicen lo mismo del color, cada una con su frase', () => {
    const java = citaJava(pure[atPure('static final String BAD_COLOR =') - 1]);
    const pantalla = /'([^']{10,})'/.exec(panel[atPanel('Los colores tienen que estar en el formato de Telegram') - 1])?.[1] ?? '';
    expect(java).toContain('formato de Telegram');
    expect(pantalla).toContain('formato de Telegram');
    expect(pantalla).not.toBe(java);
    expect(panel[atPanel('Sin degradado se crea un fondo de un solo color') - 1]).toContain('múltiplos de 45 grados');
  });
});

describe('ronda CH-A · las citas', () => {
  /** Lo que tiene que decir hoy la primera línea de cada cita. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    'TdApi.java:4982': 'public static class Background extends Object {',
    'TdApi.java:4988': ' * True, if this is one of default backgrounds.',
    'TdApi.java:4990': 'public boolean isDefault;',
    'TdApi.java:5000': ' * Document with the background; may be null. Null only for filled and chat theme backgrounds.',
    'TdApi.java:5002': '@Nullable public Document document;',
    'TdApi.java:5006': 'public BackgroundType type;',
    'TdApi.java:5079': 'public static class BackgroundFillSolid extends BackgroundFill {',
    'TdApi.java:5083': 'public int color;',
    'TdApi.java:5117': 'public static class BackgroundFillGradient extends BackgroundFill {',
    'TdApi.java:5121': 'public int topColor;',
    'TdApi.java:5125': 'public int bottomColor;',
    'TdApi.java:5127': 'Must always be divisible by 45',
    'TdApi.java:5129': 'public int rotationAngle;',
    'TdApi.java:5167': 'public static class BackgroundFillFreeformGradient extends BackgroundFill {',
    'TdApi.java:5169': ' * A list of 3 or 4 colors of the freeform gradient in the RGB format.',
    'TdApi.java:5171': 'public int[] colors;',
    'TdApi.java:5235': 'public static class BackgroundTypeWallpaper extends BackgroundType {',
    'TdApi.java:5239': 'public boolean isBlurred;',
    'TdApi.java:5243': 'public boolean isMoving;',
    'TdApi.java:5277': ' * A PNG or TGV (gzipped subset of SVG with MIME type',
    'TdApi.java:5279': 'public static class BackgroundTypePattern extends BackgroundType {',
    'TdApi.java:5283': 'public BackgroundFill fill;',
    'TdApi.java:5287': 'public int intensity;',
    'TdApi.java:5291': 'public boolean isInverted;',
    'TdApi.java:5295': 'public boolean isMoving;',
    'TdApi.java:5335': 'public static class BackgroundTypeFill extends BackgroundType {',
    'TdApi.java:5339': 'public BackgroundFill fill;',
    'TdApi.java:5371': ' * A background from a chat theme based on an emoji; can be used only as a chat background in channels.',
    'TdApi.java:5373': 'public static class BackgroundTypeChatTheme extends BackgroundType {',
    'TdApi.java:5377': 'public String themeName;',
    'TdApi.java:5411': 'public static class Backgrounds extends Object {',
    'TdApi.java:99598': 'public static class UpdateDefaultBackground extends Update {',
    'TdApi.java:117060': 'public static class DeleteDefaultBackground extends Function<Ok> {',
    'TdApi.java:128958': 'public static class GetInstalledBackgrounds extends Function<Backgrounds> {',
    'TdApi.java:128960': ' * Pass true to order returned backgrounds for a dark theme.',
    'TdApi.java:128962': 'public boolean forDarkTheme;',
    'TdApi.java:145224': 'public static class SearchBackground extends Function<Background> {',
    'TdApi.java:145228': 'public String name;',
    'TdApi.java:150976': 'public static class SetChatBackground extends Function<Ok> {',
    'TdApi.java:152518': 'public static class SetDefaultBackground extends Function<Background> {',
    'TdApi.java:152520': ' * The input background to use; pass null to create a new filled background.',
    'TdApi.java:152524': ' * Background type; pass null to use the default type of the remote background;',
    'TdApi.java:152530': 'public boolean forDarkTheme;',
    'TdApi.java:32667': 'public static class InputBackgroundRemote extends InputBackground {',
    'AccountBackgrounds.java:26': 'static final String FILL = "fill";',
    'AccountBackgrounds.java:31': 'static final String BAD_COLOR =',
    'AccountBackgrounds.java:32': 'static final String BAD_ANGLE =',
    'AccountBackgrounds.java:33': 'static final String NOTHING =',
    'AccountBackgrounds.java:35': 'private AccountBackgrounds() {}',
    'AccountBackgrounds.java:38': 'static String kindOf(TdApi.BackgroundType type) {',
    'AccountBackgrounds.java:51': 'static String css(TdApi.BackgroundType type) {',
    'AccountBackgrounds.java:61': 'if (colors == null || colors.length < 3 || colors.length > 4) return null;',
    'AccountBackgrounds.java:72': 'private static TdApi.BackgroundFill fillOf(TdApi.BackgroundType type) {',
    'AccountBackgrounds.java:87': 'static JSONObject row(TdApi.Background background, String chosen) throws Exception {',
    'AccountBackgrounds.java:94': '.put("selected", id.equals(chosen))',
    'AccountBackgrounds.java:99': 'static JSONArray rows(TdApi.Background[] backgrounds, String chosen) throws Exception {',
    'AccountBackgrounds.java:165': 'static TdApi.BackgroundType fillType(String top, String bottom, int rotation) {',
    'AccountBackgrounds.java:177': 'static int angleOf(String value) {',
    'AccountBackgrounds.java:198': 'private static final String HEX =',
    'AccountBackgrounds.java:202': 'if (!hex.matches(HEX)) throw new IllegalArgumentException(BAD_COLOR);',
    'AccountBackgrounds.java:207': 'private static int angle(int rotation) {',
    'NativeBridge.java:753': 'case "calls.list":callLog(p,a);break;',
    'NativeBridge.java:754': 'case "backgrounds.list":backgroundsList(p,a);break;',
    'NativeBridge.java:755': 'case "background.set":backgroundSet(p,a);break;',
    'NativeBridge.java:756': 'case "thread.load":threadLoad(p,a);break;',
    'NativeBridge.java:5381': 'private void backgroundsList(JSONObject p,Answer a){',
    'NativeBridge.java:5382': 'requireAccount();',
    'NativeBridge.java:5383': 'long owner=session.selfId;boolean dark=p.optBoolean("dark");',
    'NativeBridge.java:5384': 'TdApi.GetInstalledBackgrounds request=new TdApi.GetInstalledBackgrounds();request.forDarkTheme=dark;',
    'NativeBridge.java:5386': 'if(destroyed||!currentAccount()||session.selfId!=owner){a.fail("La cuenta cambió.");return;}',
    'NativeBridge.java:5387': 'AccountBackgrounds.rows(result.backgrounds,chosenBackground(dark))',
    'NativeBridge.java:5401': 'private void backgroundSet(JSONObject p,Answer a){',
    'NativeBridge.java:5405': 'if(!id.isEmpty()){',
    'NativeBridge.java:5407': 'TdApi.InputBackgroundRemote remote=new TdApi.InputBackgroundRemote();',
    'NativeBridge.java:5411': 'set.type=AccountBackgrounds.fillType(',
    'NativeBridge.java:5413': '}else{a.fail(AccountBackgrounds.NOTHING);return;}',
    'NativeBridge.java:5417': 'String next=AccountBackgrounds.putSlot(cloudStore(),String.valueOf(session.selfId),set.forDarkTheme,row.toString());',
    'NativeBridge.java:5418': 'prefs.edit().putString("accountBackgrounds",next).apply();',
    'NativeBridge.java:5419': 'schedule();',
    'BridgePolicy.java:54': 'static { METHODS.add("calls.list"); }',
    'BridgePolicy.java:55': 'static { METHODS.addAll(Arrays.asList("backgrounds.list","background.set")); }',
    'AccountBackgroundsTest.java:48': 'onlyTheFourKnownTypesGetAName',
    'AccountBackgroundsTest.java:56': 'aWallpaperAndAChatThemeHaveNothingToPaint',
    'AccountBackgroundsTest.java:71': 'theGradientAngleIsReadFromTheTopByTelegramAndFromTheBottomByCss',
    'AccountBackgroundsTest.java:84': 'aFreeformFillNeedsThreeOrFourColorsAndKeepsTheirOrder',
    'AccountBackgroundsTest.java:93': 'aPatternPaintsItsFillAndNotItsStamp',
    'AccountBackgroundsTest.java:102': 'oneHexColorWithoutBottomIsASolidFill',
    'AccountBackgroundsTest.java:110': 'twoColorsBecomeAGradientWithTheAngleTelegramAccepts',
    'AccountBackgroundsTest.java:125': 'anAngleThatIsNotMultipleOfFortyFiveIsRefusedWithItsWord',
    'AccountBackgroundsTest.java:136': 'theAngleArrivesAsNumberOrAsTextAndNothingElse',
    'AccountBackgroundsTest.java:150': 'aColorOutsideTheTwoFormatsIsRefusedWithItsWord',
    'AccountBackgroundsTest.java:161': 'theIdentifierTravelsAsTextSoJavaScriptDoesNotRoundIt',
    'AccountBackgroundsTest.java:173': 'onlyTheBackgroundChosenInThisSessionCountsAsSelected',
    'AccountBackgroundsTest.java:181': 'anUnpaintableRowStillShowsItsNameWithTheCssAbsent',
    'AccountBackgroundsTest.java:195': 'theListKeepsEveryRowAndSurvivesWithoutNada',
    'backgrounds.ts:1': 'export type CloudBackground = {',
    'backgrounds.ts:17': 'export const CLOUD_KIND_NOTES: Record<CloudBackground[',
    'backgrounds.ts:25': 'export function cloudBackgroundNotice(',
    'backgrounds.ts:29': 'export function isPaintable(',
    'backgrounds.ts:34': 'export function cloudBackgroundCss(',
    'backgrounds.ts:39': 'export function sortCloudBackgrounds(',
    'backgrounds.ts:45': 'export const BACKGROUND_ANGLES =',
    'backgrounds.ts:60': 'return /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value);',
    'backgrounds.ts:66': 'export function cloudBackgroundParams(',
    'backgrounds.ts:68': 'if (!draft.gradient) return { top: draft.top, dark };',
    'CloudBackgrounds.tsx:12': 'export function CloudBackgroundSettings({ dark, accent, canvas, run }',
    'CloudBackgrounds.tsx:28': "run<{ rows?: CloudBackground[] }>('backgrounds.list', { dark })",
    'CloudBackgrounds.tsx:38': "run<CloudBackground>('background.set', { id: row.id, dark })",
    'CloudBackgrounds.tsx:47': 'const params = cloudBackgroundParams(draft, dark);',
    'CloudBackgrounds.tsx:48': "setError('Los colores tienen que estar en el formato de Telegram.')",
    'CloudBackgrounds.tsx:51': "run<CloudBackground>('background.set', { ...params })",
    'CloudBackgrounds.tsx:59': 'La marca de elegido la pone Telegram',
    'CloudBackgrounds.tsx:66': 'sortCloudBackgrounds(rows).map(row',
    'CloudBackgrounds.tsx:74': '{!isPaintable(row) && <small className="cloud-background-note">',
    'CloudBackgrounds.tsx:88': 'Sin degradado se crea un fondo de un solo color',
    'AppearanceSettings.tsx:14': "import { CloudBackgroundSettings } from './CloudBackgrounds'",
    'AppearanceSettings.tsx:117': "{state.platform === 'android' && <CloudBackgroundSettings",
    'App.tsx:47': "import { cloudBackgroundCss, cloudBackgroundFor } from './cloud-backgrounds'",
    'App.tsx:445': 'const cloud=cloudBackgroundCss(cloudBackgroundFor(',
    'contract.ts:2': "import type { CloudBackgroundSlots } from './cloud-backgrounds'",
    'contract.ts:210': 'accountBackgrounds?: CloudBackgroundSlots',
    'desktopScope.ts:96': "label: 'fondos guardados en tu cuenta de Telegram'",
    'DesktopState.cs:508': 'public string Wallpaper { get; set; } = "none";',
    'TelegramService.cs:3273': 'args.TryGetProperty("wallpaper"',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'TdApi.java:4982': [5006, 'public BackgroundType type;'],
    'TdApi.java:5279': [5295, 'public boolean isMoving;'],
    'TdApi.java:5235': [5243, 'public boolean isMoving;'],
    'TdApi.java:99598': [99606, '@Nullable public Background background;'],
    'TdApi.java:152518': [152530, 'public boolean forDarkTheme;'],
    'AccountBackgrounds.java:26': [29, 'static final String CHAT_THEME ='],
    'AccountBackgrounds.java:31': [33, 'static final String NOTHING ='],
    'AccountBackgrounds.java:87': [97, '}'],
    'AccountBackgrounds.java:99': [104, '}'],
    'AccountBackgrounds.java:165': [174, '}'],
    'NativeBridge.java:5381': [5390, '}'],
    'NativeBridge.java:5401': [5423, '}'],
    'backgrounds.ts:66': [71, '}'],
    'backgrounds.ts:17': [23, '};'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'backgrounds.ts' ? model
        : file === 'CloudBackgrounds.tsx' ? panel
          : file === 'App.tsx' ? app
            : file === 'AppearanceSettings.tsx' ? appearance
              : file === 'contract.ts' ? rows('./contract.ts')
                : file === 'desktopScope.ts' ? scope
                  : file === 'preview.ts' ? preview
                    : file === 'AccountBackgroundsTest.java' ? jvm
                      : file === 'NativeSnapshot.java' ? snapshot
                        : file === 'TdSession.java' ? session
                          : file === 'DesktopState.cs' ? desktopState
                            : file === 'TelegramService.cs' ? host
                              : rows(`${javaDir}${file}`);
    const row = source[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  const files = [
    `${javaDir}AccountBackgrounds.java`,
    `${jvmDir}AccountBackgroundsTest.java`,
    './cloud-backgrounds.ts',
    './CloudBackgrounds.tsx',
    './rondaCH.test.ts',
  ];
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
