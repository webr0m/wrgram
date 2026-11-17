using System.Text.RegularExpressions;
using TL;

namespace WRGram.Desktop;

/// <summary>
/// Reglas del archivo que se envía desde Windows. Están aquí y no dentro del puente por lo mismo que las de
/// borrado o las de la bandeja de programados: cuatro de las cinco las copia el espejo carácter a carácter de
/// <c>NativeBridge</c>, la quinta es la que este host añade, y todas se pueden leer sin abrir un selector de
/// archivos ni conectar una cuenta.
/// <para>
/// Android no tiene que decidir nada de esto: el selector del sistema le devuelve un <c>Uri</c> con nombre y
/// tipo, y <c>ContentResolver.getType</c> le da el MIME. Aquí el selector devuelve una ruta de disco, así que
/// el nombre y el tipo salen del propio archivo y la norma hay que escribirla.
/// </para>
/// </summary>
public static class DesktopAttachment
{
    /// Copiado de <c>NativeBridge.picked</c> (<c>size&gt;32L*1024*1024</c>), que es también el tope que la
    /// pantalla anuncia en español («Límite de esta versión: 32 MB.»). Se comprueba mientras se copia, no
    /// después: un vídeo de 4 GB no tiene por qué caber dos veces en el disco de la persona.
    public const long MaxBytes = 32L * 1024 * 1024;

    /// El mismo búfer con el que <c>NativeBridge.picked</c> copia en trozos de 32 KiB y va contando bytes.
    public const int BufferBytes = 32768;

    /// <c>NativeBridge.attachment.pick</c>, en el <c>catch</c> de <c>activity.picker.launch</c>. En Windows el
    /// selector es del propio sistema y no puede faltar, así que la frase queda escrita por si alguna vez el
    /// diálogo lanza; el espejo la comparte para que las dos capas nieguen igual.
    public const string NoPicker = "No hay un selector de archivos disponible.";

    /// Literal de <c>NativeBridge.picked</c> cuando la copia se pasa del tope o cuando el archivo no se puede
    /// leer. Es una sola frase para las dos cosas porque las dos se ven igual desde la pantalla.
    public const string TooBig = "No se pudo importar el archivo. Límite: 32 MB.";

    /// Literal de <c>NativeBridge.picked</c>: Android apunta la cuenta y la conversación en el momento de elegir
    /// y, si al terminar la copia han cambiado, tira el archivo. Aquí el selector es sincrónico, pero el salto
    /// de pestaña entre elegir y confirmar sigue existiendo y lo corta el envío.
    public const string ChangedChat = "La cuenta o conversación cambió.";

    /// Literal de <c>NativeBridge.sendAttachment</c> cuando hay un envío sin confirmar en el historial.
    public const string Uncertain = "Revisa el envío anterior en el historial antes de enviar otro archivo.";

    /// La única frase que no está en Android: allí un <c>token</c> que no está en el mapa lanza una excepción sin
    /// mensaje. En Windows se dice con nombre porque el archivo vive en disco y puede faltar por dos motivos
    /// distintos —que ya se enviara, que la sesión se cerrara o que alguien lo borrara de la carpeta— y callar
    /// con un error vacío se lee como un fallo de la interfaz.
    public const string NotPrepared = "Ese archivo ya no está preparado para enviar. Vuelve a elegirlo.";

    /// El nombre con el que Telegram muestra el archivo, con la norma de <c>NativeBridge.picked</c> tal cual:
    /// se conservan letras, números, punto, guion bajo, espacio y guion; los demás caracteres se vuelven
    /// <c>_</c>; si pasa de 90 se guardan los últimos 90 (los del final son los que distinguen «informe-2026.pdf»
    /// de «informe-2025.pdf»); y si queda vacío o empieza por punto se llama «archivo». El punto inicial no es
    /// capricho: un nombre que empieza por punto queda oculto en la carpeta de salida y ya no se puede volver
    /// a encontrar para enviarlo. El respaldo cambia según quién pregunte, y lo decide el propio Android:
    /// <c>picked</c> llama «archivo» al archivo suelto e <c>importPhoto</c> (<c>NativeBridge.java:4852-4854</c>)
    /// llama «foto» a la pieza de un álbum. La misma clase de caracteres y el mismo recorte; cambia la palabra.
    /// </summary>
    public static string NameOf(string raw, string fallback = "archivo")
    {
        var name = Regex.Replace(raw, @"[^\p{L}\p{N}._ -]", "_");
        if (name.Length > 90) name = name.Substring(name.Length - 90);
        if (string.IsNullOrWhiteSpace(name) || name.StartsWith(".", StringComparison.Ordinal)) name = fallback;
        return name;
    }

    /// La terna exacta de <c>NativeBridge.sendAttachment</c> ("image/jpeg", "image/png", "image/webp") que decide
    /// si el contenido sale como foto o como archivo. GIF y HEIC están fuera a propósito: enviarlos por la vía de
    /// foto daría un error de servidor. Los dos se van por la de documento, pero el GIF además lleva la marca de
    /// animación de <see cref="AttributesFor"/>, que es lo que hace que Telegram lo reproduzca en la burbuja en
    /// lugar de guardarlo como un archivo suelto.
    public static bool IsPhoto(string? mime) => mime is "image/jpeg" or "image/png" or "image/webp";

    /// El <c>kind</c> que la pantalla manda en <c>attachment.pick</c>. Solo «gif» cambia algo, y solo el diálogo:
    /// cualquier otro valor —incluido el que no envía «Archivo o foto»— deja el selector abierto de par en par.
    /// Lo que sale por el cable no depende de esta palabra sino del MIME del archivo elegido, igual que en Android.
    public static string PickerTitle(string? kind) => Gif(kind) ? "Enviar un GIF" : "Enviar un archivo";

    /// El filtro escrito como lo pide <c>OpenFileDialog</c>. Android pasa su propia lista al selector del sistema
    /// (<c>OpenDocument</c>); aquí el diálogo es de Win32 y la sintaxis es otra, pero el criterio es el mismo.
    public static string PickerFilter(string? kind) => Gif(kind) ? "GIF|*.gif" : "Todos los archivos|*.*";

    private static bool Gif(string? kind) => string.Equals(kind, "gif", StringComparison.Ordinal);

    /// La norma del cable, la misma de <c>NativeBridge.sendAttachment</c>: un <c>image/gif</c> que ya estaba en el
    /// dispositivo sale como animación, no como documento mudo.
    public static bool IsAnimation(string? mime) => string.Equals(mime, "image/gif", StringComparison.Ordinal);

    /// El nombre siempre; la marca de animación solo cuando el MIME lo pide. Sin esa marca Telegram guarda el
    /// archivo y lo muestra como lo que es para él: una ficha más del chat.
    public static DocumentAttribute[] AttributesFor(string name, string? mime) => IsAnimation(mime)
        ? [new DocumentAttributeFilename { file_name = name }, new DocumentAttributeAnimated()]
        : [new DocumentAttributeFilename { file_name = name }];

    /// Lo que se envía cuando la extensión no está en la tabla: un archivo con su nombre, sin prometer nada.
    public const string Fallback = "application/octet-stream";

    /// Tabla extensión → MIME. El selector de Windows no da el tipo de contenido, y el tipo decide dos cosas que
    /// la persona ve: si la pieza sale como foto con miniatura o como archivo, y con qué icono la pinta la
    /// pantalla. Sin tabla todo saldría <c>application/octet-stream</c> —se enviaría igual, pero un .mp4 dejaría
    /// de reproducirse en línea y un .jpg saldría como un documento—, así que se escribe lo que Telegram sabe
    /// mostrar y se cae en el flujo genérico para cualquier otra extensión.
    /// <para>
    /// El espejo del andamio copia estas parejas literalmente y <c>rondaAK.test.ts</c> las compara capa contra
    /// capa: una clave que falte en una de las dos cambia de icono según desde dónde se mire la misma
    /// conversación.
    /// </para>
    /// </summary>
    public static string MimeOf(string name)
    {
        var dot = name.LastIndexOf('.');
        if (dot < 0 || dot == name.Length - 1) return Fallback;
        return Types.TryGetValue(name.Substring(dot + 1).ToLowerInvariant(), out var mime) ? mime : Fallback;
    }

    /// Claves en minúscula; <see cref="MimeOf"/> recorta la extensión antes de mirar, así que «Foto.JPG» y
    /// «foto.jpg» llegan a la misma línea.
    private static readonly Dictionary<string, string> Types = new(StringComparer.Ordinal)
    {
        ["jpg"] = "image/jpeg", ["jpeg"] = "image/jpeg", ["png"] = "image/png", ["webp"] = "image/webp",
        ["gif"] = "image/gif", ["bmp"] = "image/bmp", ["tif"] = "image/tiff", ["tiff"] = "image/tiff",
        ["heic"] = "image/heic", ["heif"] = "image/heif", ["svg"] = "image/svg+xml",
        ["mp4"] = "video/mp4", ["m4v"] = "video/x-m4v", ["mov"] = "video/quicktime", ["mkv"] = "video/x-matroska",
        ["webm"] = "video/webm", ["avi"] = "video/x-msvideo", ["3gp"] = "video/3gpp",
        ["mp3"] = "audio/mpeg", ["m4a"] = "audio/mp4", ["aac"] = "audio/aac", ["wav"] = "audio/wav",
        ["flac"] = "audio/flac", ["ogg"] = "audio/ogg", ["oga"] = "audio/ogg", ["opus"] = "audio/opus",
        ["pdf"] = "application/pdf", ["epub"] = "application/epub+zip", ["zip"] = "application/zip",
        ["rar"] = "application/vnd.rar", ["7z"] = "application/x-7z-compressed", ["tar"] = "application/x-tar",
        ["gz"] = "application/gzip", ["apk"] = "application/vnd.android.package-archive",
        ["txt"] = "text/plain", ["md"] = "text/markdown", ["csv"] = "text/csv", ["json"] = "application/json",
        ["doc"] = "application/msword", ["dot"] = "application/msword",
        ["docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ["xls"] = "application/vnd.ms-excel",
        ["xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ["ppt"] = "application/vnd.ms-powerpoint",
        ["pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    };

    /// El corte de Android, que copia y comprueba a la vez: deja de escribir en cuanto se pasa del tope y quien
    /// llama borra lo que llevaba copiado.
    public static bool Exceeds(long transmitted) => transmitted > MaxBytes;
}
