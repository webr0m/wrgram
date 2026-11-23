import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

/**
 * Ronda CP: el tope de la copia privada deja de ser un invento de la beta y pasa a ser el de Telegram.
 *
 * Telegram acepta 2 GB por archivo y 4 GB con Premium. TDLib no publica ese número en `PremiumLimitType`
 * (las 22 subclases del binding vendored son de recuentos y longitudes), así que la regla se escribe una vez
 * en `UploadPolicy` y las otras dos capas la copian con sus dos orillas. Lo que se vigila aquí sin cuenta es
 * que ninguna capa vuelva a escribir un número suelto y que las frases sigan siendo las mismas carácter a
 * carácter: si una cambia, la prueba dice en cuál.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const optional = (path: string) => {
  const url = new URL(path, import.meta.url);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const upload = optional('../../mobile/android/app/src/main/java/cc/webrom/wrgram/UploadPolicy.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopAttachment.cs');
const albumRules = text('../../desktop/src/WRGram.Desktop/DesktopAlbum.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const bridge = text('./bridge.ts');

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** El literal que una capa asigna a una constante de C#. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El literal de una constante de Java. */
function javaSentence(name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(upload);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
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

/** Cuerpo de una función de App.tsx, que se escribe en una sola línea. */
function appBody(signature: string): string {
  const start = app.indexOf(signature);
  if (start < 0) throw new Error(`Falta ${signature}`);
  const end = app.indexOf('\n', start);
  return app.slice(start, end < 0 ? app.length : end);
}

describe('ronda CP · la regla del tope vive en una clase pura', () => {
  it('las dos orillas son los bytes que Telegram acepta', () => {
    expect(upload).toContain('static final long FREE_MAX_BYTES=2L*1024*1024*1024;');
    expect(upload).toContain('static final long PREMIUM_MAX_BYTES=4L*1024*1024*1024;');
    expect(upload).toContain('static long maxBytes(boolean premium){return premium?PREMIUM_MAX_BYTES:FREE_MAX_BYTES;}');
  });

  it('Premium se lee de la cuenta ya cargada y una cuenta ausente no es Premium', () => {
    expect(upload).toContain('static boolean premium(TdApi.User self){return self!=null&&self.isPremium;}');
  });

  it('cada negativa tiene su literal escrito, no una frase montada con el número', () => {
    expect(javaSentence('TOO_BIG')).toBe('No se pudo importar el archivo. Límite: 2 GB.');
    expect(javaSentence('TOO_BIG_PREMIUM')).toBe('No se pudo importar el archivo. Límite: 4 GB.');
    expect(javaSentence('ALBUM_TOO_BIG')).toBe('No se pudieron importar las fotos. Límite: 10 imágenes de 2 GB.');
    expect(javaSentence('ALBUM_TOO_BIG_PREMIUM')).toBe('No se pudieron importar las fotos. Límite: 10 imágenes de 4 GB.');
    expect(javaSentence('KEYBOARD_TOO_BIG')).toBe('No se pudo importar el GIF o imagen del teclado. Límite: 2 GB.');
    expect(javaSentence('KEYBOARD_TOO_BIG_PREMIUM')).toBe('No se pudo importar el GIF o imagen del teclado. Límite: 4 GB.');
    expect(upload).toContain('static String tooBig(boolean premium){return premium?TOO_BIG_PREMIUM:TOO_BIG;}');
    expect(upload).toContain('static String albumTooBig(boolean premium){return premium?ALBUM_TOO_BIG_PREMIUM:ALBUM_TOO_BIG;}');
    expect(upload).toContain('static String keyboardTooBig(boolean premium){return premium?KEYBOARD_TOO_BIG_PREMIUM:KEYBOARD_TOO_BIG;}');
  });
});

describe('ronda CP · Android corta la copia con la regla', () => {
  it('ya no queda un 32 MB escrito en el puente', () => {
    expect(count('32L*1024*1024', java)).toBe(0);
    expect(count('32 MB', java)).toBe(0);
  });

  it('la pieza suelta pregunta el tope de la cuenta que eligió', () => {
    expect(count('boolean premium=UploadPolicy.premium(session.user(user));', java)).toBe(1);
    expect(count('if(size>UploadPolicy.maxBytes(premium))throw new IllegalArgumentException();', java)).toBe(1);
    expect(count('answer.fail(UploadPolicy.tooBig(premium))', java)).toBe(1);
  });

  it('el álbum y el teclado comparten la copia de la foto y reciben el tope por parámetro', () => {
    expect(count('boolean premium=UploadPolicy.premium(session.user(owner));', java)).toBe(2);
    expect(java).toContain('private Attachment importPhoto(Uri uri,long owner,long chat,File folder,long maxBytes)throws Exception{');
    expect(count('if(size>maxBytes)throw new IllegalArgumentException();', java)).toBe(1);
    expect(count('importPhoto(uri,owner,chat,folder,UploadPolicy.maxBytes(premium))', java)).toBe(2);
    expect(count('answer.fail(UploadPolicy.albumTooBig(premium))', java)).toBe(1);
    expect(count('UploadPolicy.keyboardTooBig(premium)', java)).toBe(1);
  });
});

describe('ronda CP · Windows tiene las dos orillas y la frase de cada una', () => {
  it('el tope deja de ser una constante y pasa a preguntar por la cuenta', () => {
    expect(rules).toContain('public const long FreeMaxBytes = 2L * 1024 * 1024 * 1024;');
    expect(rules).toContain('public const long PremiumMaxBytes = 4L * 1024 * 1024 * 1024;');
    expect(rules).toContain('public static long MaxBytes(bool premium) => premium ? PremiumMaxBytes : FreeMaxBytes;');
    expect(rules).toContain('public static bool Exceeds(long transmitted, bool premium) => transmitted > MaxBytes(premium);');
    expect(count('DesktopAttachment.MaxBytes', service)).toBe(0);
  });

  it('las dos frases del archivo y las dos del álbum están escritas', () => {
    expect(csSentence('TooBig')).toBe('No se pudo importar el archivo. Límite: 2 GB.');
    expect(csSentence('TooBigPremium')).toBe('No se pudo importar el archivo. Límite: 4 GB.');
    expect(rules).toContain('public static string TooBigOf(bool premium) => premium ? TooBigPremium : TooBig;');
    expect(csSentence('ImportFailed', albumRules)).toBe('No se pudieron importar las fotos. Límite: 10 imágenes de 2 GB.');
    expect(csSentence('ImportFailedPremium', albumRules)).toBe('No se pudieron importar las fotos. Límite: 10 imágenes de 4 GB.');
    expect(albumRules).toContain('public static string ImportFailedOf(bool premium) => premium ? ImportFailedPremium : ImportFailed;');
  });

  it('el host pasa la bandera de la sesión a la copia y a la negativa', () => {
    expect(service).toContain('private static async Task<long> ImportCopyAsync(string target, string source, bool premium)');
    expect(service).toContain('if (DesktopAttachment.Exceeds(written, premium)) throw new BridgeException(DesktopAttachment.TooBigOf(premium));');
    expect(count('ImportCopyAsync(target, chosen, DesktopEmojiCatalog.IsPremium(client.User!))', service)).toBe(1);
    expect(count('ImportCopyAsync(target, source, DesktopEmojiCatalog.IsPremium(client.User!))', service)).toBe(1);
    expect(count('DesktopAttachment.TooBigOf(DesktopEmojiCatalog.IsPremium(client.User!))', service)).toBe(1);
    expect(count('DesktopAlbum.ImportFailedOf(DesktopEmojiCatalog.IsPremium(client.User!))', service)).toBe(1);
    expect(count('32 MB', service)).toBe(0);
  });
});

describe('ronda CP · las frases son las mismas en las tres capas', () => {
  it('archivo, álbum y teclado coinciden carácter a carácter', () => {
    expect(csSentence('TooBig')).toBe(javaSentence('TOO_BIG'));
    expect(csSentence('TooBigPremium')).toBe(javaSentence('TOO_BIG_PREMIUM'));
    expect(csSentence('ImportFailed', albumRules)).toBe(javaSentence('ALBUM_TOO_BIG'));
    expect(csSentence('ImportFailedPremium', albumRules)).toBe(javaSentence('ALBUM_TOO_BIG_PREMIUM'));
    expect(tsProperty('tooBig')).toBe(javaSentence('TOO_BIG'));
    expect(tsProperty('tooBigPremium')).toBe(javaSentence('TOO_BIG_PREMIUM'));
    expect(tsProperty('importFailed')).toBe(javaSentence('ALBUM_TOO_BIG'));
    expect(tsProperty('importFailedPremium')).toBe(javaSentence('ALBUM_TOO_BIG_PREMIUM'));
  });

  it('ninguna frase está escrita dos veces en el andamio', () => {
    for (const name of ['tooBig', 'tooBigPremium', 'importFailed', 'importFailedPremium']) {
      expect(count(tsProperty(name), preview)).toBe(1);
    }
  });
});

describe('ronda CP · el andamio y la pantalla anuncian el tope de la cuenta', () => {
  it('el espejo pregunta el tope por la bandera Premium de la cartera', () => {
    expect(preview).toContain('const attachMaxBytes = (premium: boolean) => premium ? 4 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;');
    // La ronda CO añadió una tercera consulta: `desktopShareImport` también pregunta el tope por la cartera.
    expect(count('const premium = state.wallet?.premium === true;', preview)).toBe(3);
    expect(tsBody('desktopAttachmentPick')).toContain('if (size > attachMaxBytes(premium)) throw new Error(premium ? ATTACH_REFUSALS.tooBigPremium : ATTACH_REFUSALS.tooBig);');
    expect(tsBody('desktopAttachmentAlbum')).toContain('if (size > attachMaxBytes(premium)) throw new Error(premium ? ALBUM_REFUSALS.importFailedPremium : ALBUM_REFUSALS.importFailed);');
    expect(count('ATTACH_MAX_BYTES', preview)).toBe(0);
  });

  it('las dos ventanas de confirmación dicen el tope que cumple la cuenta', () => {
    expect(count('Límite de esta versión: 32 MB.', app)).toBe(0);
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", app)).toBe(2);
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", appBody('function previewAttachment'))).toBe(1);
    expect(count("Límite: {state.wallet?.premium?'4 GB':'2 GB'}.", appBody('function replaceMessageMedia'))).toBe(1);
  });
});

describe('ronda CP · una copia de gigas tiene plazo de copia', () => {
  it('los tres métodos que copian un archivo elegido esperan más que un diálogo', () => {
    expect(bridge).toContain("const IMPORT_COPY = new Set(['attachment.pick', 'attachment.album', 'share.import']);");
    expect(count('IMPORT_COPY.has(method) ? 900000 : USER_DRIVEN.has(method) ? 300000', bridge)).toBe(1);
    // Los selectores siguen siendo órdenes con plazo de persona: la copia grande no los saca de la lista.
    expect(bridge).toContain("'attachment.pick', 'attachment.camera', 'attachment.album'");
  });

  it('el plazo se cumple de verdad, no sólo está escrito', async () => {
    // `bridge.ts` lee `window.WRGramNative` al cargarse; sin puerto el módulo entra por la rama de vista previa.
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { requestTimeoutMs } = await import('./bridge');
    expect(requestTimeoutMs('attachment.pick')).toBe(900000);
    expect(requestTimeoutMs('attachment.album')).toBe(900000);
    expect(requestTimeoutMs('share.import')).toBe(900000);
    expect(requestTimeoutMs('attachment.camera')).toBe(300000);
    expect(requestTimeoutMs('media.export')).toBe(300000);
    expect(requestTimeoutMs('storage.details')).toBe(130000);
    expect(requestTimeoutMs('send.text')).toBe(35000);
  });
});