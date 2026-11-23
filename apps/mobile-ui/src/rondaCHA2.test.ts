import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cloudBackgroundFor, type CloudBackground, type CloudBackgroundSlots } from './cloud-backgrounds';

/**
 * Ronda CH-A2 — WRGram escucha `UpdateDefaultBackground` y recuerda el fondo por modo y por cuenta.
 *
 * CH-A dejó dicho el hueco y no lo cerró: ninguna función de TDLib devuelve cuál está puesto
 * (`GetInstalledBackgrounds` solo ordena, `SearchBackground` pide un nombre y el setter responde por su
 * cuenta), de modo que la única fuente viva es el aviso `UpdateDefaultBackground`
 * (`TdApi.java:99598-99606`), que trae el modo en `forDarkTheme` (`TdApi.java:99602`) y el `Background`
 * nuevo —que puede ser nulo: «The default background has changed» con `background` null significa «sin
 * fondo puesto», así que vacío y desconocido no pueden ser el mismo valor—. Desde esta ronda la rama existe
 * en `TdSession.java`, lo avisado se guarda en las preferencias y `selected` deja de ser el recuerdo de una
 * pulsación.
 *
 * **Dónde se guarda cada cosa.** Los dos huecos viven en una sola clave, `accountBackgrounds`, con forma
 * `{"owner":…,"light":fila,"dark":fila}`: escribe (`AccountBackgrounds.java:113-125`), lee el texto de un
 * hueco (`AccountBackgrounds.java:128-131`), lee el elegido (`AccountBackgrounds.java:134-138`), publica los
 * dos (`AccountBackgrounds.java:141-149`) y no lanza nunca (`AccountBackgrounds.java:151-157`). El `owner`
 * está delante en las tres lecturas: sin él, cambiar de cuenta pintaría el fondo de la anterior. En la
 * sesión el aviso se guarda en un mapa por modo (`TdSession.java:54`) con un centinela para el null
 * (`TdSession.java:55`), se lee con `defaultBackground` (`TdSession.java:158`), se escribe en la rama
 * (`TdSession.java:314`), se olvida al cerrar la cuenta (`TdSession.java:336`) y la llave ausente se distingue
 * del centinela preguntando `defaultBackgroundKnown` (`TdSession.java:1408`).
 *
 * **El camino del aviso hasta la pantalla.** `changed("appearance")` guarda antes de repintar
 * (`NativeBridge.java:127`), y el guarda recorre los dos modos (`NativeBridge.java:5357-5369`): descarta el
 * modo no oído (`NativeBridge.java:5361`), pide lo escuchado (`NativeBridge.java:5362`), compara con lo ya
 * guardado (`NativeBridge.java:5364`) y solo escribe si algo cambió (`NativeBridge.java:5368`) —un aviso repetido no reescribe las preferencias—. La
 * marca del listado sale del mismo sitio (`NativeBridge.java:5349`) y el puesto desde aquí se escribe en el
 * hueco de su modo (`NativeBridge.java:5417`), así que el aviso y el puesto no pueden discrepar. La
 * instantánea publica los dos huecos juntos (`NativeSnapshot.java:545`) con la cuenta delante
 * (`NativeSnapshot.java:539-551`, llamada en `NativeSnapshot.java:39` y en el rebote sin cuenta
 * `NativeBridge.java:133`).
 *
 * **Por qué el modo lo decide la interfaz.** El nativo no sabe qué modo está pintado: el tema resuelto vive
 * en TypeScript. Por eso viajan los dos huecos y elige la raíz (`cloud-backgrounds.ts:79-81` con el tipo en
 * `cloud-backgrounds.ts:73`), nunca uno por delante del otro: un fondo puesto para claro no pinta en
 * oscuro, y cruzarlos cambiaría el fondo de la cuenta al girar el modo del sistema. La pantalla dice de
 * dónde sale la marca (`CloudBackgrounds.tsx:96-98`) y el aviso de cada puesto se conserva
 * (`CloudBackgrounds.tsx:65`).
 *
 * **Lo que CH-B cambió del contrato.** La marca de serie pasa a poder ser `null`, porque el cable de Windows no
 * trae el `isDefault` de TDLib (`TdApi.java:4982-4990`) en ninguna de sus dos hojas y aproximarla sería afirmar.
 * Android la sigue mandando como booleano; lo que mide esa ronda es la omisión en la fila, no esta.
 *
 * **Lo que sigue abierto.** El aviso no se reenvía: lo cambiado con WRGram cerrado se desconoce hasta el
 * siguiente aviso o hasta el siguiente puesto desde aquí. Borrar el puesto sí tiene función propia
 * (`TdApi.java:117060`) y no hace falta para esto. La cara de Windows es la ronda CH-B.
 *
 * Como en CH-A, CF, CL, CM, CN, CJ, CK y CW: la última prueba mide las citas.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const jvmDir = '../../mobile/android/app/src/test/java/cc/webrom/wrgram/';
const tdlibPath = '../../mobile/android/tdlib/vendor/java/org/drinkless/tdlib/TdApi.java';

const bridge = rows(`${javaDir}NativeBridge.java`);
const session = rows(`${javaDir}TdSession.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const pure = rows(`${javaDir}AccountBackgrounds.java`);
const jvm = rows(`${jvmDir}AccountBackgroundsTest.java`);
const model = rows('./cloud-backgrounds.ts');
const panel = rows('./CloudBackgrounds.tsx');
const app = rows('./App.tsx');
const contract = text('./contract.ts');
const tdlib = rows(tdlibPath);

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}
const atJava = (n: string) => en(n, bridge, 'NativeBridge.java');
const atSession = (n: string) => en(n, session, 'TdSession.java');
const atSnapshot = (n: string) => en(n, snapshot, 'NativeSnapshot.java');
const atModel = (n: string) => en(n, model, 'cloud-backgrounds.ts');
const atPanel = (n: string) => en(n, panel, 'CloudBackgrounds.tsx');
const atApp = (n: string) => en(n, app, 'App.tsx');
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

/** Los pasos tienen que estar y estar en este orden: es la aguja, no la prosa, la que manda. */
function orden(cuerpo: string, pasos: string[], donde: string): void {
  let anterior = -1;
  for (const paso of pasos) {
    const posicion = cuerpo.indexOf(paso);
    expect(posicion, `el paso «${paso.slice(0, 46)}» no está en ${donde}`).toBeGreaterThan(-1);
    expect(posicion, `el paso «${paso.slice(0, 46)}» no está en orden en ${donde}`).toBeGreaterThan(anterior);
    anterior = posicion;
  }
}

describe('ronda CH-A2 · la tienda de los dos huecos', () => {
  it('escribir pide dueño, nombra el hueco del modo y guarda al dueño por delante', () => {
    const escrita = body(pure, 'static String putSlot(String stored, String owner, boolean dark, String row) {', 'AccountBackgrounds.java');
    orden(escrita, [
      'if (owner == null || owner.isEmpty()) return stored;',
      'JSONObject store = parse(stored);',
      'String key = dark ? "dark" : "light";',
      'if (row == null) store.remove(key);',
      'else store.put(key, new JSONObject(row));',
      'store.put("owner", owner);',
      'return store.toString();',
    ], 'putSlot');
    // Sin dueño no se escribe nada: una fila huérfana sería el fondo de la cuenta equivocada. El `return stored;`
    // de la guarda y el del `catch` son los dos únicos caminos que devuelven la tienda intacta.
    expect(count('return stored;', escrita)).toBe(2);
    expect(count('store.put(key', escrita)).toBe(1);
    expect(escrita).not.toContain('backgroundId');
  });

  it('lo que no es una fila deja la tienda tal como estaba', () => {
    const escrita = body(pure, 'static String putSlot(String stored, String owner, boolean dark, String row) {', 'AccountBackgrounds.java');
    // El `row` se parsea dentro del try: un texto roto no puede tirar el puente ni borrar el otro hueco.
    orden(escrita, ['try {', 'else store.put(key, new JSONObject(row));', '} catch (Exception ignored) {'], 'putSlot');
    const trasElCatch = escrita.slice(escrita.indexOf('} catch (Exception ignored) {') + '} catch (Exception ignored) {'.length, escrita.indexOf('return store.toString();'));
    // Lo único que hace el catch es devolver la tienda que llegó: ni borra el otro hueco ni escribe dueño.
    expect(trasElCatch.replace(/\s/g, '')).toBe('returnstored;}');
  });

  it('leer el elegido exige ser el dueño, y leer el hueco no decide nada', () => {
    const elegido = body(pure, 'static String chosenId(String stored, String owner, boolean dark) {', 'AccountBackgrounds.java');
    orden(elegido, [
      'if (owner == null || owner.isEmpty() || !owner.equals(parse(stored).optString("owner"))) return "";',
      'JSONObject row = parse(stored).optJSONObject(dark ? "dark" : "light");',
      'return row == null ? "" : row.optString("id", "");',
    ], 'chosenId');
    const hueco = body(pure, 'static String slot(String stored, boolean dark) {', 'AccountBackgrounds.java');
    // `slot` es el espejo interno del compare: no tiene dueño porque no se publica ni pinta.
    expect(hueco).not.toContain('owner');
    expect(count('dark ? "dark" : "light"', elegido)).toBe(1);
  });

  it('lo publicado son los dos huecos con su fila dentro y sin el dueño', () => {
    const publicados = body(pure, 'static JSONObject slots(String stored, String owner) throws Exception {', 'AccountBackgrounds.java');
    orden(publicados, [
      'if (owner == null || owner.isEmpty() || !owner.equals(parse(stored).optString("owner"))) return result;',
      'for (String key : new String[] {"light", "dark"}) {',
      'JSONObject row = parse(stored).optJSONObject(key);',
      'if (row != null) result.put(key, row);',
    ], 'slots');
    // El guard sale antes del bucle: otra cuenta no pinta fila alguna, y el `result` que devuelve está vacío.
    expect(count('return result;', publicados)).toBe(2);
    expect(count('"owner"', publicados)).toBe(1);
    expect(publicados).not.toContain('put("owner"');
    // El guard lo escribieron igual `chosenId` y `slots`: dos dueños distintos es una cuenta equivocada.
    expect(count('owner.equals(parse(stored).optString("owner"))', pure)).toBe(2);
  });

  it('lo roto se lee como vacío y nunca lanza', () => {
    const parse = body(pure, 'private static JSONObject parse(String json) {', 'AccountBackgrounds.java');
    orden(parse, ['return new JSONObject(json == null ? "" : json);', '} catch (Exception ignored) {', 'return new JSONObject();'], 'parse');
    expect(count('public ', parse)).toBe(0);
  });
});

describe('ronda CH-A2 · el aviso escuchado en la sesión', () => {
  it('el mapa va por modo y el centinela separa «sin fondo» de «no lo sé»', () => {
    expect(session[atSession('private final Map<Boolean,TdApi.Background> defaultBackgrounds') - 1])
      .toContain('new java.util.concurrent.ConcurrentHashMap<>()');
    // Un HashMap no vale y esta prueba lo prohíbe por texto. La justificación de hilos no aguanta la
    // medición: el aviso se enhebra en la hebra principal y el puente lo lee en esa misma hebra, así que
    // lo que sostiene el `ConcurrentHashMap` es la prohibición escrita, no una carrera observada.
    expect(session[atSession('private final Map<Boolean,TdApi.Background> defaultBackgrounds') - 1]).not.toContain('new HashMap<>');
    expect(session[atSession('private static final TdApi.Background NO_DEFAULT_BACKGROUND') - 1]).toContain('new TdApi.Background()');
    const leido = session[atSession('TdApi.Background defaultBackground(boolean dark){') - 1];
    expect(leido).toContain('TdApi.Background value=defaultBackgrounds.get(dark);return value==NO_DEFAULT_BACKGROUND?null:value;');
    expect(count('NO_DEFAULT_BACKGROUND', session)).toBe(3);
    expect(count('defaultBackgrounds', session)).toBe(5);
  });

  it('la rama guarda con el modo del aviso, traduce el null y avisa después', () => {
    const rama = session[atSession('else if(object instanceof TdApi.UpdateDefaultBackground){') - 1];
    orden(rama, [
      'defaultBackgrounds.put(update.forDarkTheme,',
      'update.background==null?NO_DEFAULT_BACKGROUND:update.background',
      ');emit("appearance");',
    ], 'la rama de UpdateDefaultBackground');
    // El modo lo dice el aviso: adivinarlo por la sesión pintaría en el hueco equivocado.
    expect(rama).not.toContain('forDarkTheme,false');
    expect(count('instanceof TdApi.UpdateDefaultBackground', session.join('\n'))).toBe(1);
  });

  it('cerrar la cuenta olvida los huecos escuchados', () => {
    const cierre = atSession('defaultBackgrounds.clear();');
    expect(session[cierre - 1]).toContain('requests.clear();');
    // El dueño se borra en la línea siguiente: sin el `selfId = 0` el map vacío no sería suficiente.
    expect(session[cierre]).toContain('selfId = 0');
    expect(session.slice(atSession('if (authorization instanceof TdApi.AuthorizationStateClosed) {') - 1, cierre).join('\n'))
      .toContain('defaultBackgrounds.clear()');
  });

  it('el aviso trae dos campos y el borrado tiene su propia función', () => {
    const clase = atTd('public static class UpdateDefaultBackground extends Update {');
    const bloque = tdlib.slice(clase - 1, clase + 9).join('\n');
    expect(bloque).toContain('public boolean forDarkTheme;');
    expect(bloque).toContain('@Nullable public Background background;');
    expect(tdlib[atTd('public static class DeleteDefaultBackground extends Function<Ok> {') - 1]).toContain('Function<Ok>');
  });
});

describe('ronda CH-A2 · el puente', () => {
  it('lo que avisa «appearance» se guarda antes de repintar el estado', () => {
    const changed = bridge[atJava('void changed(String kind){') - 1];
    expect(changed).toContain('if(kind.equals("appearance"))rememberCloudBackgrounds();schedule();');
    expect(changed.indexOf('rememberCloudBackgrounds();')).toBeLessThan(changed.indexOf('schedule();'));
    expect(count('rememberCloudBackgrounds', bridge)).toBe(2);
  });

  it('la tienda es una sola clave de preferencias y se lee entera', () => {
    expect(bridge[atJava('private String cloudStore(){') - 1]).toContain('prefs.getString("accountBackgrounds","")');
    // Ya no existe el campo suelto de CH-A: dos sitios escribiendo la misma marca es una marca que miente.
    expect(bridge.join('\n')).not.toContain('"accountBackground"');
    expect(count('"accountBackgrounds"', bridge)).toBe(3);
    expect(bridge.join('\n')).not.toContain('backgroundChosen');
  });

  it('el guarda recorre los dos modos, compara y solo escribe si algo cambió', () => {
    const escrita = body(bridge, 'private void rememberCloudBackgrounds(){', 'NativeBridge.java');
    orden(escrita, [
      'if(!currentAccount())return;',
      'String owner=String.valueOf(session.selfId);String stored=cloudStore();String next=stored;',
      'for(boolean dark:new boolean[]{false,true}){if(!session.defaultBackgroundKnown(dark))continue;',
      'TdApi.Background live=session.defaultBackground(dark);',
      'String row=live==null?"":AccountBackgrounds.row(live,String.valueOf(live.id)).toString();',
      'if(row.equals(AccountBackgrounds.slot(stored,dark)))continue;',
      'next=AccountBackgrounds.putSlot(next,owner,dark,row.isEmpty()?null:row);',
      'if(!next.equals(stored))prefs.edit().putString("accountBackgrounds",next).apply();',
    ], 'rememberCloudBackgrounds');
    // Aquí no se llama a Telegram: el aviso ya trajo el Background, y pedirlo sería otra respuesta que llegar tarde.
    expect(escrita).not.toContain('session.perform(');
    expect(escrita).not.toContain('TdApi.Get');
    // El null del aviso libera el hueco en vez de borrar la fila entera.
    expect(escrita).toContain('row.isEmpty()?null:row');
    expect(count('putSlot(', escrita)).toBe(1);
  });

  it('el modo del que no se avisó nada deja su hueco como lo dejó la sesión anterior', () => {
    const escrita = body(bridge, 'private void rememberCloudBackgrounds(){', 'NativeBridge.java');
    // El acceso plano devuelve null igual si no hay fondo que si nadie avisó nunca: sin la guarda, el aviso del
    // claro barría el fondo oscuro persistido, que es justo lo que guardar la fila en preferencias evita.
    expect(escrita).toContain('if(!session.defaultBackgroundKnown(dark))continue;');
    expect(escrita.indexOf('defaultBackgroundKnown')).toBeLessThan(escrita.indexOf('TdApi.Background live='));
    expect(count('defaultBackgroundKnown', bridge)).toBe(1);
    // La pregunta existe y mira la llave del mapa, no el valor: el centinela tiene que seguir contando como oído.
    expect(count('defaultBackgroundKnown', session)).toBe(2);
    expect(session[atSession('boolean defaultBackgroundKnown(boolean dark){') - 1]).toContain('defaultBackgrounds.containsKey(dark)');
    expect(session[atSession('boolean defaultBackgroundKnown(boolean dark){') - 1]).not.toContain('!= null');
    // Y el borrado del hueco sigue viniendo solo del centinela que la rama escribe, nunca de una llave ausente.
    expect(session[atSession('else if(object instanceof TdApi.UpdateDefaultBackground){') - 1])
      .toContain('update.background==null?NO_DEFAULT_BACKGROUND:update.background');
  });

  it('el elegido del listado y el puesto del setter salen del mismo hueco', () => {
    expect(bridge[atJava('private String chosenBackground(boolean dark){') - 1])
      .toContain('AccountBackgrounds.chosenId(cloudStore(),String.valueOf(session.selfId),dark)');
    expect(count('chosenBackground(', bridge)).toBe(2);
    const escrita = body(bridge, 'private void backgroundSet(JSONObject p,Answer a){', 'NativeBridge.java');
    orden(escrita, [
      'JSONObject row=AccountBackgrounds.row(result,String.valueOf(result.id));',
      'String next=AccountBackgrounds.putSlot(cloudStore(),String.valueOf(session.selfId),set.forDarkTheme,row.toString());',
      'prefs.edit().putString("accountBackgrounds",next).apply();',
      'schedule();',
      'a.ok(row);',
    ], 'backgroundSet');
    // La misma fila viaja a la tienda y a la respuesta, y el modo es el del setter, no el pintado.
    expect(count('AccountBackgrounds.row(result,', bridge)).toBe(1);
    expect(escrita).not.toContain('accountBackground"');
  });

  it('el estado de rebote sin cuenta también lleva el dueño', () => {
    const rebote = bridge[atJava('private JSONObject bridgeState(boolean includeChats,boolean includeMessages)throws Exception{') - 1];
    expect(rebote).toContain('"appearance",NativeSnapshot.appearanceDto(prefs,activity,String.valueOf(session.selfId))');
  });
});

describe('ronda CH-A2 · la instantánea', () => {
  it('los dos huecos se publican juntos y con la cuenta delante', () => {
    expect(snapshot[atSnapshot('static JSONObject appearanceDto(SharedPreferences prefs,Context context,String account)throws Exception{') - 1])
      .toContain('String account');
    expect(snapshot[atSnapshot('value.put("accountBackgrounds",AccountBackgrounds.slots(') - 1])
      .toContain('AccountBackgrounds.slots(prefs.getString("accountBackgrounds",""),account)');
    expect(snapshot[atSnapshot('data.put("appearance",appearanceDto(prefs,session.context(),String.valueOf(session.selfId)));') - 1])
      .toContain('String.valueOf(session.selfId)');
    expect(count('appearanceDto(', snapshot)).toBe(2);
    expect(count('"accountBackgrounds"', snapshot)).toBe(2);
    expect(snapshot.join('\n')).not.toContain('"accountBackground"');
  });

  it('la publicación no decide el modo: solo copia lo guardado', () => {
    const publicada = body(snapshot, 'static JSONObject appearanceDto(SharedPreferences prefs,Context context,String account)throws Exception{', 'NativeSnapshot.java');
    // Ninguna rama por modo aquí: el único que sabe el modo activo es el tema de la interfaz.
    expect(publicada).not.toContain('forDarkTheme');
    expect(publicada).not.toContain('dark ?');
    expect(count('AccountBackgrounds.slots', publicada)).toBe(1);
    expect(count('"dark"', publicada)).toBe(0);
  });
});

describe('ronda CH-A2 · la interfaz', () => {
  const claro: CloudBackground = { id: '1', name: 'Claro', dark: false, stock: false, selected: true, kind: 'fill', css: '#0a141e' };
  const oscuro: CloudBackground = { id: '2', name: 'Oscuro', dark: true, stock: false, selected: true, kind: 'fill', css: '#102030' };

  it('el hueco del modo activo es el único que pinta y no hay cruzamiento', () => {
    const huecos: CloudBackgroundSlots = { light: claro, dark: oscuro };
    expect(cloudBackgroundFor(huecos, false)).toBe(claro);
    expect(cloudBackgroundFor(huecos, true)).toBe(oscuro);
    expect(cloudBackgroundFor({ light: claro }, true)).toBeUndefined();
    expect(cloudBackgroundFor({ dark: oscuro }, false)).toBeUndefined();
    expect(cloudBackgroundFor(undefined, true)).toBeUndefined();
    expect(cloudBackgroundFor({}, false)).toBeUndefined();
    // Cero fallback: si oscuro está vacío, la pantalla se queda con la paleta, no con el fondo de claro.
    expect(model[atModel('return dark ? slots?.dark : slots?.light;') - 1]).not.toContain('??');
  });

  it('el contrato publica los dos huecos como objeto y ya no el campo suelto', () => {
    expect(contract).toContain("import type { CloudBackgroundSlots } from './cloud-backgrounds'");
    expect(contract).toContain('accountBackgrounds?: CloudBackgroundSlots');
    expect(count('accountBackgrounds?: CloudBackgroundSlots', contract)).toBe(1);
    expect(contract).not.toContain('accountBackground?: CloudBackground');
  });

  it('la raíz pinta por el tema resuelto y depende del css, no del objeto', () => {
    const linea = app[atApp('const cloud=cloudBackgroundCss(cloudBackgroundFor(') - 1];
    expect(linea).toContain("cloudBackgroundFor(state.appearance.accountBackgrounds,theme.scheme==='dark')");
    expect(app[atApp("import { cloudBackgroundCss, cloudBackgroundFor } from './cloud-backgrounds'") - 1]).toContain('./cloud-backgrounds');
    // `slots()` devuelve un objeto nuevo en cada instantánea: depender del objeto repintaría la paleta en cada post.
    expect(linea).toContain('state.appearance.accountBackgrounds?.dark?.css,state.appearance.accountBackgrounds?.light?.css');
    expect(linea).not.toContain('accountBackgrounds])');
  });

  it('la pantalla dice de dónde sale la marca, en cada capa con su frase, y el aviso del puesto se conserva', () => {
    // Desde CH-B la nota se parte: en Windows la marca la dice la lista que se lee, y aquí el aviso escuchado.
    expect(panel[atPanel("const chosen = platform === 'desktop'") - 1]).toContain("platform === 'desktop'");
    expect(panel[atPanel('en la lista que se lee') - 1]).toContain('cada lectura la trae fresca');
    const nota = panel[atPanel('cuando la cuenta avisa un cambio') - 1];
    expect(nota).toContain('si el fondo se cambió con WRGram cerrado, la marca no se entera hasta el siguiente aviso');
    expect(panel.join('\n')).not.toContain('es el último que puso WRGram');
    // El aviso lo pone `load`, que antes se borraba a sí mismo en el `finally`.
    expect(panel[atPanel('load(isPaintable(answer)') - 1]).toContain('load(isPaintable(answer)');
    expect(count('setNotice(', panel)).toBe(2);
    expect(count('load(`Fondo', panel)).toBe(1);
  });
});

describe('ronda CH-A2 · la prueba de la JVM', () => {
  it('las ocho reglas nuevas de la tienda tienen su prueba', () => {
    expect(count('@Test', jvm)).toBe(25);
    expect(count('private static String rowText(', jvm)).toBe(1);
    const prueba = (nombre: string) => body(jvm, `void ${nombre}()`, 'AccountBackgroundsTest.java');
    expect(prueba('theStoreKeepsOneRowPerModeAndNamesItsOwner')).toContain('AccountBackgrounds.putSlot(stored, "42", true, rowText(9, "Oscuro"));');
    expect(prueba('aSlotPutToNullFreesItsModeAndKeepsTheOther')).toContain('AccountBackgrounds.chosenId(stored, "42", true)');
    expect(prueba('anotherAccountDoesNotGetTheRowsOfThisOne')).toContain('AccountBackgrounds.chosenId(stored, "43", false)');
    expect(prueba('aBrokenOrEmptyStoreReadsAsNothingPuesto')).toContain('"{\\"owner\\":42}"');
    expect(prueba('thePublishedSlotsCarryTheRowSoTheUiPaintsWithoutAskingAgain')).toContain('slots.getJSONObject("light")');
    // Lo publicado no lleva dueño: la prueba lo comprueba, y aquí se comprueba que la prueba lo comprueba.
    expect(prueba('thePublishedSlotsCarryTheRowSoTheUiPaintsWithoutAskingAgain')).toContain('assertFalse(slots.has("owner"))');
  });
});

describe('ronda CH-A2 · las citas', () => {
  /** Lo que tiene que decir hoy la primera línea de cada cita. Medido, línea por línea. */
  const anchors: Record<string, string> = {
    'TdApi.java:99598': 'public static class UpdateDefaultBackground extends Update {',
    'TdApi.java:99602': 'public boolean forDarkTheme;',
    'TdApi.java:117060': 'public static class DeleteDefaultBackground extends Function<Ok> {',
    'TdSession.java:54': 'private final Map<Boolean,TdApi.Background> defaultBackgrounds',
    'TdSession.java:55': 'private static final TdApi.Background NO_DEFAULT_BACKGROUND',
    'TdSession.java:158': 'TdApi.Background defaultBackground(boolean dark){',
    'TdSession.java:314': 'else if(object instanceof TdApi.UpdateDefaultBackground){',
    'TdSession.java:336': 'defaultBackgrounds.clear();',
    'TdSession.java:1408': 'boolean defaultBackgroundKnown(boolean dark){',
    'AccountBackgrounds.java:113': 'static String putSlot(String stored, String owner, boolean dark, String row) {',
    'AccountBackgrounds.java:128': 'static String slot(String stored, boolean dark) {',
    'AccountBackgrounds.java:134': 'static String chosenId(String stored, String owner, boolean dark) {',
    'AccountBackgrounds.java:141': 'static JSONObject slots(String stored, String owner) throws Exception {',
    'AccountBackgrounds.java:151': 'private static JSONObject parse(String json) {',
    'NativeBridge.java:127': 'void changed(String kind){',
    'NativeBridge.java:5349': 'private String chosenBackground(boolean dark){',
    'NativeBridge.java:5357': 'private void rememberCloudBackgrounds(){',
    'NativeBridge.java:5361': 'for(boolean dark:new boolean[]{false,true}){if(!session.defaultBackgroundKnown(dark))continue;',
    'NativeBridge.java:5362': 'TdApi.Background live=session.defaultBackground(dark);',
    'NativeBridge.java:5364': 'if(row.equals(AccountBackgrounds.slot(stored,dark)))continue;',
    'NativeBridge.java:5368': 'if(!next.equals(stored))prefs.edit().putString("accountBackgrounds",next).apply();',
    'NativeBridge.java:5387': 'AccountBackgrounds.rows(result.backgrounds,chosenBackground(dark))',
    'NativeBridge.java:5417': 'String next=AccountBackgrounds.putSlot(cloudStore(),String.valueOf(session.selfId),set.forDarkTheme,row.toString());',
    'NativeBridge.java:133': 'private JSONObject bridgeState(boolean includeChats,boolean includeMessages)throws Exception{',
    'NativeSnapshot.java:539': 'static JSONObject appearanceDto(SharedPreferences prefs,Context context,String account)throws Exception{',
    'NativeSnapshot.java:545': 'value.put("accountBackgrounds",AccountBackgrounds.slots(',
    'NativeSnapshot.java:39': 'data.put("appearance",appearanceDto(prefs,session.context(),String.valueOf(session.selfId)));',
    'backgrounds.ts:73': 'export type CloudBackgroundSlots = {',
    'backgrounds.ts:79': 'export function cloudBackgroundFor(',
    'CloudBackgrounds.tsx:96': "const chosen = platform === 'desktop'",
    'CloudBackgrounds.tsx:65': 'load(isPaintable(answer)',
    'TdApi.java:4982': 'public static class Background extends Object {',
    'AccountBackgroundsTest.java:214': 'theStoreKeepsOneRowPerModeAndNamesItsOwner',
    'AccountBackgroundsTest.java:232': 'aSlotPutToNullFreesItsModeAndKeepsTheOther',
    'AccountBackgroundsTest.java:251': 'anotherAccountDoesNotGetTheRowsOfThisOne',
    'AccountBackgroundsTest.java:266': 'aBrokenOrEmptyStoreReadsAsNothingPuesto',
    'AccountBackgroundsTest.java:274': 'thePublishedSlotsCarryTheRowSoTheUiPaintsWithoutAskingAgain',
  };

  /** La última línea de cada rango citado, con lo que dice. */
  const ends: Record<string, [number, string]> = {
    'TdApi.java:99598': [99606, '@Nullable public Background background;'],
    'AccountBackgrounds.java:113': [125, '}'],
    'AccountBackgrounds.java:128': [131, '}'],
    'AccountBackgrounds.java:134': [138, '}'],
    'AccountBackgrounds.java:141': [149, '}'],
    'AccountBackgrounds.java:151': [157, '}'],
    'NativeBridge.java:5357': [5369, '}'],
    'NativeSnapshot.java:539': [551, '}'],
    'backgrounds.ts:79': [81, '}'],
    'CloudBackgrounds.tsx:96': [98, 'la marca no se entera hasta el siguiente aviso'],
    'TdApi.java:4982': [4990, 'public boolean isDefault;'],
  };

  const lineOf = (file: string, at: number): string => {
    const source = file === 'TdApi.java' ? tdlib
      : file === 'backgrounds.ts' ? model
        : file === 'CloudBackgrounds.tsx' ? panel
          : file === 'App.tsx' ? app
            : file === 'AccountBackgroundsTest.java' ? jvm
              : file === 'NativeSnapshot.java' ? snapshot
                : file === 'TdSession.java' ? session
                  : rows(`${javaDir}${file}`);
    const fila = source[at - 1];
    if (fila === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return fila;
  };

  // Se escanean solo los archivos que no escriben citas de suyo: así esta tabla es la única fuente.
  const files = [
    `${javaDir}NativeBridge.java`,
    `${javaDir}TdSession.java`,
    './cloud-backgrounds.ts',
    './CloudBackgrounds.tsx',
    `${jvmDir}AccountBackgroundsTest.java`,
    './rondaCHA2.test.ts',
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
