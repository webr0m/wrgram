import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopProfilePhoto.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopAccountPhoto.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const registry = text('../../desktop/src/WRGram.Desktop/MediaRegistry.cs');
const profileRules = text('../../desktop/src/WRGram.Desktop/DesktopAccountProfile.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

const lines = java.split('\n');

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El número que la clase de reglas asigna a una constante, con o sin sufijo de tipo. */
function csNumber(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(rules);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Una línea de Android, contada desde 1. */
function javaLine(number: number): string {
  const line = lines[number - 1];
  if (!line) throw new Error(`Falta la línea ${number} de Android`);
  return line;
}

/** La cadena que Android pasa a un constructor de diálogo en una línea dada. */
function javaDialog(number: number, setter: string): string {
  const match = new RegExp(`${setter}\\("((?:[^"\\\\]|\\\\.)*)"`).exec(javaLine(number));
  if (!match) throw new Error(`${javaLine(number).slice(0, 40)}… no tiene ${setter}`);
  return match[1];
}

/** La cadena que Android responde por el tubo de errores en la línea dada. */
function javaFail(number: number): string {
  const match = /answer\.fail\("((?:[^"\\]|\\.)*)"\)/.exec(javaLine(number));
  if (!match) throw new Error(`La línea ${number} de Android no responde con una frase`);
  return match[1];
}

/** La cadena con la que Android lanza en la línea dada, desde la ronda BD dentro de `preparePhoto`. */
function javaThrow(number: number): string {
  const match = /throw new IllegalArgumentException\("((?:[^"\\]|\\.)*)"\)/.exec(javaLine(number));
  if (!match) throw new Error(`La línea ${number} de Android no lanza con una frase`);
  return match[1];
}

/** La propiedad de un objeto de literales del espejo. */
function tsProperty(name: string, from: string): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El bloque del espejo, desde su declaración hasta la llave que lo cierra. */
function tsBlock(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  const end = preview.indexOf('};', start);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return preview.slice(start, end);
}

/** Cuerpo de una función del espejo. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de un método del puente de C#, con las llaves balanceadas. */
function csBody(name: string, from = cable): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de un miembro de la clase de reglas puras. */
function csMember(name: string): string {
  const start = rules.search(new RegExp(`\\b(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el miembro ${name}`);
  const next = rules.slice(start + 1).search(/\n *(?:public|private) /);
  return rules.slice(start, next < 0 ? rules.length : start + 1 + next);
}

/** La documentación XML que precede a un miembro, hasta su declaración. */
function csDoc(name: string, from = cable): string {
  const match = new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`).exec(from);
  if (!match) throw new Error(`Falta ${name}`);
  const opening = from.lastIndexOf('<summary>', match.index);
  if (opening < 0) throw new Error(`Falta la documentación de ${name}`);
  return from.slice(opening, match.index);
}

/** El bloque de documentación que precede a una constante de la clase de reglas. */
function csConstDoc(name: string): string {
  const declaration = at(`public const string ${name} =`, rules);
  const opening = rules.lastIndexOf('<summary>', declaration);
  const previous = rules.lastIndexOf('public const string', declaration - 1);
  if (opening < 0 || previous >= opening) throw new Error(`Falta la documentación de ${name}`);
  return rules.slice(opening, declaration);
}

/** La última línea de Android que cita el bloque de documentación de una constante. */
function cited(name: string): number {
  const declaration = at(`public const string ${name} =`, rules);
  const previous = rules.lastIndexOf('public const string', declaration - 1);
  const block = rules.slice(previous < 0 ? 0 : previous, declaration);
  const matches = [...block.matchAll(/NativeBridge\.java:(\d+)(?!-)/g)];
  if (matches.length === 0) throw new Error(`${name} no cita la línea de Android donde nace su frase`);
  return Number(matches.at(-1)![1]);
}

function at(needle: string, from: string): number {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
}

const count = (needle: string, from: string) => from.split(needle).length - 1;

describe('ronda AU · la foto de perfil, cruzada con las tres capas', () => {
  it('las diez frases del diálogo y del descarte están letra por letra en el puente', () => {
    // En Android estas cadenas no son decoración: son lo único que la persona lee al elegir y al decidir.
    expect(csSentence('NoImage')).toBe(javaThrow(1684));
    expect(csSentence('ChangedAccount')).toBe(javaFail(1659));
    expect(csSentence('PickTitle')).toBe(javaDialog(1690, 'setTitle'));
    expect(csSentence('PickBody')).toBe(javaDialog(1690, 'setMessage'));
    expect(csSentence('PickAccept')).toBe(javaDialog(1690, 'setPositiveButton'));
    expect(csSentence('DeleteTitle')).toBe(javaDialog(1646, 'setTitle'));
    expect(csSentence('DeleteBody')).toBe(javaDialog(1646, 'setMessage'));
    expect(csSentence('DeleteAccept')).toBe(javaDialog(1646, 'setPositiveButton'));
    expect(csSentence('Cancel')).toBe(javaDialog(1646, 'setNegativeButton'));
    expect(javaDialog(1690, 'setNegativeButton')).toBe(csSentence('Cancel'));
  });

  it('el espejo copia las dos frases que sí puede alcanzar y calla las que no', () => {
    const mirror = tsBlock('PROFILE_PHOTO');
    expect(tsProperty('noImage', mirror)).toBe(csSentence('NoImage'));
    // `NotFound` no nace en Android: es la consecuencia de que MTProto borre con `InputPhoto` y TDLib con `photoId`.
    expect(tsProperty('notFound', mirror)).toBe(csSentence('NotFound'));
    expect(csConstDoc('NotFound')).toContain('photos.getUserPhotos');
    expect(csConstDoc('NotFound')).toContain('DeleteProfilePhoto(photoId)');
    // Y `ChangedAccount` no se copia: el andamio no abre ventana modal, así que no hay hueco donde cambie la cuenta.
    expect(mirror).not.toContain('changed');
    expect(tsBody('designAccountPhotoPick')).not.toContain('ChangedAccount');
  });

  it('los cinco números del descarte son los literales de Android, línea a línea', () => {
    expect(csNumber('MaxBytes')).toBe('20');
    expect(javaLine(1674)).toContain('cursor.getLong(0)>20L*1024*1024');
    expect(csNumber('MaxPixels')).toBe('12000');
    expect(javaLine(1675)).toContain('bounds.outWidth>12000||bounds.outHeight>12000');
    expect(csNumber('DecodeLimit')).toBe('2048');
    expect(javaLine(1676)).toContain('/options.inSampleSize>2048)options.inSampleSize*=2');
    expect(csNumber('Side')).toBe('640');
    expect(javaLine(1678)).toContain('Bitmap.createScaledBitmap(crop,640,640,true)');
    expect(csNumber('JpegQuality')).toBe('88');
    expect(javaLine(1679)).toContain('compress(Bitmap.CompressFormat.JPEG,88,stream)');
    const mirror = tsBlock('PROFILE_PHOTO_MAX');
    expect(mirror).toContain('bytes: 20 * 1024 * 1024');
    expect(mirror).toContain('pixels: 12000');
  });

  it('la tabla del giro y del espejo es la de Android, con el orden canónico de EXIF', () => {
    const turn = javaLine(1677);
    expect(turn).toContain('rotation=orientation==3||orientation==4?180:orientation==5||orientation==6?90:orientation==7||orientation==8?270:0');
    expect(turn).toContain('flip=orientation==2||orientation==4||orientation==5||orientation==7');
    const angle = csMember('Turn');
    for (const pair of ['3 or 4 => 180', '5 or 6 => 90', '7 or 8 => 270', '_ => 0'])
      expect(angle).toContain(pair);
    const mirror = csMember('Mirror');
    expect(mirror).toContain('orientation is 2 or 4 or 5 or 7');
    // La diferencia fina entre capas: Android compone las dos operaciones en una matriz —espejo después del giro,
    // o sea aplicado primero— y el orden canónico es el contrario. Windows aplica los dos pasos por separado.
    expect(javaLine(1678)).toContain('matrix.postRotate(rotation);if(flip)matrix.postScale(-1f,1f)');
    const steps = csBody('Turn', cable);
    expect(at('new RotateTransform(angle)', steps)).toBeLessThan(at('new ScaleTransform(-1, 1)', steps));
    expect(rules).toContain('Android publica un reflejo del recorte correcto');
    // Y las dos mediciones que obligan a hacerlo a mano, escritas con su número.
    expect(rules).toContain('BitmapImage</c> de WPF lo devolvió');
    expect(rules).toContain('GetQuery("/App1/IFD/{System.UInt16=274}")</c> lanza <c>InvalidOperationException');
    expect(csMember('Orientation').length).toBeGreaterThan(200);
  });

  it('el recorte se mide sobre la imagen ya girada y al centro del lado menor', () => {
    const crop = javaLine(1678);
    expect(crop).toContain('int side=Math.min(oriented.getWidth(),oriented.getHeight())');
    expect(crop).toContain('(oriented.getWidth()-side)/2');
    expect(crop).toContain('(oriented.getHeight()-side)/2');
    expect(csMember('CropSide')).toContain('Math.Min(width, height)');
    expect(csMember('CropLeft')).toContain('CropSide(width, height)');
    expect(csMember('CropTop')).toContain('CropSide(width, height)');
    // En el cable el orden es el mismo: primero `Turn`, y solo entonces el lado menor de lo girado.
    const prepare = csBody('PreparePhoto');
    expect(at('Turn(decoded, orientation)', prepare)).toBeLessThan(at('CropSide(turned.PixelWidth, turned.PixelHeight)', prepare));
    expect(prepare).toContain('DesktopProfilePhoto.CropTop(turned.PixelWidth, turned.PixelHeight)');
  });

  it('las cuatro negaciones del descarte caben en la frase única de Android, en su orden', () => {
    const problem = csMember('Problem');
    expect(at('IsImage(name)', problem)).toBeLessThan(at('bytes > MaxBytes', problem));
    expect(at('bytes > MaxBytes', problem)).toBeLessThan(at('width > MaxPixels', problem));
    expect(count('return NoImage;', problem)).toBe(3);
    expect(tsBody('profilePhotoProblem')).toContain('!profilePhotoIsImage(name)');
    expect(tsBody('profilePhotoProblem')).toContain('bytes > PROFILE_PHOTO_MAX.bytes');
    expect(tsBody('profilePhotoProblem')).toContain('width > PROFILE_PHOTO_MAX.pixels');
    // Las dimensiones se leen sin descodificar, que es el `inJustDecodeBounds` de Android.
    expect(javaLine(1675)).toContain('bounds.inJustDecodeBounds=true');
    expect(csBody('StoredSize')).toContain('BitmapCreateOptions.DelayCreation');
    expect(csDoc('StoredSize')).toContain('4032x3024');
    // El tipo se decide por extensión porque el selector de Windows no da el MIME que el de Android sí da.
    expect(javaLine(1673)).toContain('mime.startsWith("image/")');
    expect(csMember('IsImage')).toContain('ToLowerInvariant()');
    expect(tsBody('profilePhotoIsImage')).toContain('.toLowerCase()');
    expect(rules).toContain('webp');
  });

  it('el cable escribe por MTProto, y cancelar no es un error', () => {
    const pick = csBody('AccountPhotoPickAsync');
    // La firma del selector lleva desde la ronda BD el título que pone cada flujo: la aguja sigue midiendo lo
    // mismo —que la ventana se abre antes de tocar el archivo—, con la cadena que ahora escribe el host.
    expect(pick).toContain('ChoosePhoto(DesktopProfilePhoto.PickFile)');
    expect(at('ChoosePhoto(DesktopProfilePhoto.PickFile)', pick)).toBeLessThan(at('PreparePhoto(chosen)', pick));
    expect(at('PreparePhoto(chosen)', pick)).toBeLessThan(at('ConfirmPhoto(DesktopProfilePhoto.PickTitle', pick));
    expect(pick).toContain('if (!ConfirmPhoto(');
    expect(pick).toContain('return false;');
    expect(pick).toContain('await client.UploadFileAsync(new MemoryStream(prepared.Jpeg), "perfil.jpg")');
    expect(pick).toContain('Photos_UploadProfilePhoto(file: uploaded)');
    // Las dos miradas de cuenta de Android: una antes del diálogo y otra antes de escribir.
    expect(count('CollectionClient().User!.id != owner', pick)).toBe(2);
    expect(javaLine(1659)).toContain('session.selfId!=owner');
    expect(javaLine(1693)).toContain('session.selfId!=owner');
    // Borrar: sin foto no hay diálogo, y la foto se localiza antes de preguntar.
    const drop = csBody('AccountPhotoDeleteAsync');
    expect(drop).toContain('self.photo?.photo_id ?? 0');
    expect(at('if (photoId <= 0) return false;', drop)).toBeLessThan(at('ResolvePhotoAsync(client, photoId)', drop));
    expect(at('ResolvePhotoAsync(client, photoId)', drop)).toBeLessThan(at('ConfirmPhoto(DesktopProfilePhoto.DeleteTitle', drop));
    expect(drop).toContain('Photos_DeletePhotos([current])');
    // `photos.deletePhotos` pide el `InputPhoto` entero, y el conversor es implícito: el método con nombre es protected.
    const resolve = csBody('ResolvePhotoAsync');
    expect(resolve).toContain('Photos_GetUserPhotos(new InputUserSelf())');
    expect(resolve).not.toContain('ToInputPhoto()');
    expect(csDoc('ResolvePhotoAsync')).toContain('op_Implicit');
    expect(csDoc('ResolvePhotoAsync')).toContain('protected');
  });

  it('el avatar cacheado se olvida antes de volver a registrar, y una bajada vieja no gana', () => {
    const refresh = csBody('RefreshSelfPhotoAsync');
    expect(at('_media.Forget(key)', refresh)).toBeLessThan(at('_media.RegisterProfile(self, self.photo != null, key', refresh));
    expect(refresh).toContain('Push();');
    expect(count('await SelfAsync(client)', refresh)).toBe(1);
    const drop = csBody('Forget', registry);
    expect(drop).toContain('StableId("photo:" + ownerKey)');
    expect(drop).toContain('_entries.Remove(alias)');
    expect(drop).toContain('File.Delete(PathFor(raw))');
    // Sin la guarda de la referencia, la bajada que estaba en vuelo volvería a escribir la foto vieja en la misma ruta.
    expect(csBody('DownloadAsync', registry)).toContain('ReferenceEquals(_entries.GetValueOrDefault(id), entry)');
  });

  it('las dos órdenes tienen brazo, manejador y espejo; la negativa del menú ya no existe', () => {
    for (const [method, name] of [
      ['account.photo.pick', 'AccountPhotoPickAsync'], ['account.photo.delete', 'AccountPhotoDeleteAsync'],
    ] as const) {
      expect(count(`"${method}" => await ${name}(),`, service)).toBe(1);
      expect(count(`private async Task<object?> ${name}(`, cable)).toBe(1);
      expect(count(`method === '${method}'`, preview)).toBe(1);
      expect(java).toContain(`case "${method}"`);
      expect(policy).toContain(`"${method}"`);
    }
    // Las sesiones tenían negativa propia cuando se escribió esta prueba; la ronda AV la cambió por los dos brazos
    // de verdad, así que citar cualquiera de las dos constantes apagadas sería dejar un brazo fantasma.
    expect(service).not.toContain('NoSessions');
    expect(profileRules).not.toContain('NoSessions');
    expect(profileRules).not.toContain('NoPhoto');
    expect(service).not.toContain('DesktopAccountProfile.NoPhoto');
  });

  it('la pantalla ofrece la foto en las dos plataformas, sin tocar el puente', () => {
    expect(app).toContain(`void run<boolean>('account.photo.pick')`);
    expect(app).toContain(`void run<boolean>('account.photo.delete')`);
    expect(count('{!desktop&&<MenuItem icon={<Image/>}', app)).toBe(0);
    expect(count('{!desktop&&profile.photoId!=="0"', app)).toBe(0);
    // El andamio no añade métodos: los dos ya estaban en la lista del puente de Android.
    expect(preview).toContain("if (method === 'account.photo.pick') return designAccountPhotoPick(params);");
    expect(preview).toContain("if (method === 'account.photo.delete') return designAccountPhotoDelete();");
  });

  it('el avatar del resumen se lee del almacén, no del render del clic', () => {
    // `openProfile` reconstruye el diálogo desde el `.then` del botón, y ese cierre pertenece al render en que
    // se pintó el menú: con la foto en una variable de ese render, subir una no la enseña. La aguja de abajo es
    // la que falló andando en el recorrido del DOM. El botón de la barra sí puede seguir leyendo el render,
    // porque se rehace en cada uno.
    const profile = app.slice(app.indexOf('function openProfile('), app.indexOf('function openSessions('));
    expect(profile).not.toBe('');
    expect(profile).not.toContain('state.profilePhoto');
    expect(app).toContain('const photo=useSyncExternalStore(subscribe,()=>snapshot().profilePhoto);');
    expect(app).toContain('<LiveProfileAvatar name={profile.firstName||state.name}/>');
    // Y sigue siendo el mismo par de clases que pinta el menú de usuario vivo, para que el cuadro no cambie de
    // tamaño al pasar del menú al perfil.
    expect(app).toContain('<span className="settings-header-avatar">{photo?<MediaView media={photo} auto eager passive/>');
    expect(app).toContain("import { AccountAvatarStatus, PremiumMark } from './PremiumMark';");
    // Y el espejo publica la foto en la forma que el andamio sí puede pintar: `ready:false` como la deja el
    // puente, e `id:0` con miniatura local, que es como `MediaView` enseña una foto sin tubería de descarga.
    expect(tsBody('designAccountPhotoPick')).toContain('id: 0, ready: false');
    expect(tsBody('designAccountPhotoPick')).toContain("minithumbnail: '/bots/snake.jpg'");
  });

  it('lo que el andamio no puede imitar está dicho, no callado', () => {
    // El selector y el diálogo son ventanas nativas: sin esa nota, quien lea el espejo buscaría un gesto fantasma.
    expect(preview).toContain('El andamio no puede abrir ni el selector de Windows ni el diálogo de confirmar');
    // Tampoco se finge la geometría: 640 y calidad 88 no se copian al espejo porque no hay imagen real delante.
    expect(tsBlock('PROFILE_PHOTO_MAX')).not.toContain('side: 640');
    expect(tsBlock('PROFILE_PHOTO_MAX')).not.toContain('quality');
    // Y la cancelación, que en Android responde `false` sin error, tampoco se inventa aquí.
    expect(javaLine(1655)).toContain('if(uri==null){profilePhotoPicking=null;answer.ok(false);return;}');
    expect(cable).toContain('Cancelar en el selector o en la confirmación');
  });

  it('las citas de Android en la regla pura dicen eso mismo en la línea citada', () => {
    // Un número de línea es una promesa que se pudre: la ronda AS lo aprendió cuando dos líneas de comentario
    // movieron tres citas y las agujas viejas siguieron en verde sobre un archivo mentiroso.
    const setters: Record<string, string> = {
      PickTitle: 'setTitle', PickBody: 'setMessage', PickAccept: 'setPositiveButton',
      DeleteTitle: 'setTitle', DeleteBody: 'setMessage', DeleteAccept: 'setPositiveButton', Cancel: 'setNegativeButton',
    };
    for (const [name, setter] of Object.entries(setters)) {
      const line = javaLine(cited(name));
      expect(line, `${name} cita una línea que ya no es un diálogo`).toContain(`${setter}("`);
      expect(javaDialog(cited(name), setter)).toBe(csSentence(name));
    }
    // Las dos frases que Android responde por el tubo de errores, no por un diálogo.
    expect(javaThrow(cited('NoImage'))).toBe(csSentence('NoImage'));
    expect(javaFail(cited('ChangedAccount'))).toBe(csSentence('ChangedAccount'));
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Profile = { photoId: string };
type Snap = { profilePhoto?: { id: number; ready: boolean; kind: string; mime: string } | null };

describe('ronda AU · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({});

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop', ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  const profile = async () => (await call('account.profile')) as Profile;
  // El puente siempre manda un objeto: `request(method, params = {})` de `bridge.ts:56`.
  const pick = async (params: Record<string, unknown> = {}) =>
    call('account.photo.pick', params).catch((caught: Error) => caught.message);
  const drop = async () => call('account.photo.delete').catch((caught: Error) => caught.message);

  it('elegir una foto la publica en la cuenta y en el avatar, como hace el puente', async () => {
    expect(await pick()).toBe(true);
    const value = await profile();
    expect(value.photoId).not.toBe('0');
    // `RefreshSelfPhotoAsync` registra la foto nueva sin haberla bajado todavía: `ready:false`.
    expect(snap().profilePhoto).toMatchObject({ ready: false, kind: 'image', mime: 'image/jpeg' });
  });

  it('las cuatro negaciones del descarte salen con la frase única de Android', async () => {
    const refusal = csSentence('NoImage');
    // El tipo: `webp` es justo el códec que WPF no trae, y un archivo sin punto tampoco tiene extensión.
    expect(await pick({ name: 'retrato.webp' })).toBe(refusal);
    expect(await pick({ name: 'sin extension' })).toBe(refusal);
    expect(await pick({ name: 'archivo.tar.gz' })).toBe(refusal);
    // El peso y las dimensiones, con el tope abierto por debajo (`>` y no `>=`).
    expect(await pick({ size: 20 * 1024 * 1024 + 1 })).toBe(refusal);
    expect(await pick({ width: 12001 })).toBe(refusal);
    expect(await pick({ height: 0 })).toBe(refusal);
    expect(await pick({ width: -4 })).toBe(refusal);
    const value = await profile();
    expect(value.photoId).toBe('0');
    expect(snap().profilePhoto).toBeFalsy();
  });

  it('los topes se miden crudos: 20 MiB y 12000 píxeles entran justos', async () => {
    expect(await pick({ size: 20 * 1024 * 1024, width: 12000, height: 12000 })).toBe(true);
    expect((await profile()).photoId).not.toBe('0');
    // La extensión se compara en minúsculas, igual que `ToLowerInvariant` del puente.
    expect(await pick({ name: 'Retrato.JPG' })).toBe(true);
  });

  it('quitar la foto deja el perfil sin foto y sin avatar; sin foto no hay error', async () => {
    expect(await pick({ name: 'retrato.png' })).toBe(true);
    expect(await drop()).toBe(true);
    expect((await profile()).photoId).toBe('0');
    expect(snap().profilePhoto).toBeNull();
    // La segunda vez no hay nada que borrar: Android responde `false` y la pantalla no abre diálogo.
    expect(await drop()).toBe(false);
  });

  it('el andamio de la foto no toca nada del chat ni de la conversación abierta', async () => {
    const before = transport.snapshot();
    expect(await pick({ name: 'retrato.bmp', width: 900, height: 400 })).toBe(true);
    expect(await drop()).toBe(true);
    const after = transport.snapshot();
    expect(after.active).toBe(before.active);
    expect(after.messages).toBe(before.messages);
    expect(after.chats).toBe(before.chats);
    expect(after.name).toBe(before.name);
  });
});
