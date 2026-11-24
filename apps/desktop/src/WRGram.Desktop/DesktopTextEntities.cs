using System.Text.Json;
using System.Text.RegularExpressions;

namespace WRGram.Desktop;

/// <summary>
/// Reglas de las entidades de formato que el compositor manda al host y que el host devuelve en la
/// fila. Android las tiene en <c>NativeBridge.textEntities</c> y <c>NativeSnapshot.entities</c>; el
/// puente de Windows no podía limitarse a copiar los números, porque Telegram cuenta desplazamientos y
/// longitudes en unidades UTF-16 —lo dice <c>richDraft.ts</c> en su cabecera y lo repiten los dos
/// parámetros del esquema— y un valor fuera de rango no se ignora a medias: hace que el servidor
/// descarte el formato entero del mensaje.
/// </summary>
internal static class DesktopTextEntities
{
    /// <summary>El mismo techo de <c>NativeBridge.java:4583</c> y de <c>MAX_ENTITIES</c> del compositor.</summary>
    public const int MaxEntities = 100;

    /// <summary>
    /// Tipos que el puente de Windows sabe mandar. Lo que no está aquí se rechaza con su nombre en vez de
    /// colarse como <c>null</c>: una entidad desechada en silencio es exactamente el defecto que hacía salir
    /// un emoji personalizado como un glifo sin cara.
    /// </summary>
    public static readonly string[] KnownTypes =
        ["bold", "italic", "underline", "strikethrough", "spoiler", "code", "pre", "blockquote", "link", "customEmoji"];

    /// <summary>Negativa por pasarse del techo, con la cifra que sobra para que el aviso no sea un misterio.</summary>
    public static string? TooManyProblem(int count) =>
        count > MaxEntities
            ? $"El mensaje trae {count} entidades de formato y Telegram admite {MaxEntities}."
            : null;

    /// <summary>Nombra la entidad que el puente no sabe escribir, en lugar de dejarla fuera sin decir nada.</summary>
    public static string? UnknownTypeProblem(string? type)
    {
        if (type is null) return "Una entidad de formato no trae su tipo.";
        return Array.IndexOf(KnownTypes, type) >= 0
            ? null
            : $"El escritorio no sabe enviar una entidad de tipo «{type}».";
    }

    /// <summary>Absencia nombrada: un desplazamiento que no llega no vale cero, es una entidad que no se puede arreglar.</summary>
    public static string MissingNumberProblem(string? type, string property) =>
        $"La entidad «{type}» no trae su {property}.";

    /// <summary>
    /// Comprobación de rango sobre el texto tal como viaja. El orden es el de <c>NativeBridge.java:4589</c>:
    /// primero el principio, luego que la longitud cubra algo, y al final que el final no rebase el texto.
    /// Cada negativa lleva sus números porque sin ellos el aviso no dice qué borrar del borrador.
    /// </summary>
    public static string? OffsetProblem(int offset, int length, string text)
    {
        if (offset < 0 || offset > text.Length)
            return $"Una entidad empieza en {offset} y el mensaje tiene {text.Length} caracteres.";
        if (length < 1) return $"Una entidad que empieza en {offset} no cubre ningún carácter.";
        if (length > text.Length - offset)
            return $"Una entidad que empieza en {offset} termina en {offset + length} y el mensaje tiene {text.Length} caracteres.";
        return null;
    }

    /// <summary>
    /// Devuelve el <c>document_id</c> del emoji personalizado y deja en <paramref name="error"/> la misma
    /// frase con la que Android niega la entrada (<c>NativeBridge.java:4602</c>). La gramática es la de
    /// <c>BridgePolicy.java:58</c> —entero opcionalmente negativo, sin espacios ni cifras sobrantes y de
    /// hasta diecinueve dígitos— y como Telegram solo conoce ids positivos, un cero o un negativo tampoco vale.
    /// </summary>
    public static long? CustomEmojiId(JsonElement entity, out string? error)
    {
        error = null;
        var value = ReadId(entity, "customEmojiId");
        if (value is null or <= 0)
        {
            error = DesktopEmojiCatalog.BadCustomEmoji;
            return null;
        }
        return value;
    }

    /// <summary>Tipo de la entidad tal como lo escribe el compositor, o <c>null</c> si no lo trae.</summary>
    public static string? TypeOf(JsonElement entity) =>
        entity.TryGetProperty("type", out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    /// <summary>Dirección que trae una entidad de enlace del borrador, o <c>null</c> si no trae ninguna.</summary>
    public static string? UrlOf(JsonElement entity) =>
        entity.TryGetProperty("url", out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    /// <summary>
    /// Por qué una entidad de enlace no puede salir: porque no lleva dirección o porque Telegram no la
    /// admitiría. El patrón es el de <c>NativeBridge.java:4606</c>, que es lo que impide que un enlace roto
    /// se lleve por delante el formato del resto del mensaje.
    /// </summary>
    public static string? UrlProblem(string? url) => IsSendableUrl(url)
        ? null
        : "Una entidad de enlace necesita una dirección que empiece por http://, https:// o tg://.";

    /// <summary>
    /// Dirección de un enlace que detectó Telegram y que viene sin ella: la dirección es el trozo de texto
    /// que abarca la entidad. <c>NativeSnapshot.java:523</c> hace la misma copia y comprueba el rango antes,
    /// porque sin esta clave editar un mensaje con una URL escrita a pelo negaría su propio enlace.
    /// </summary>
    public static string? TextAsUrl(string text, int offset, int length) =>
        offset < 0 || length < 1 || text.Length < offset + length ? null : text.Substring(offset, length);

    /// <summary>
    /// Lee un id de entidad con la gramática de <c>BridgePolicy.java:58</c>. Acepta el número JSON y la
    /// cadena —<c>contract.ts</c> guarda el id como texto para no perder cifras delante de JavaScript— y
    /// devuelve <c>null</c> en cuanto algo sobra: un punto, un espacio o una coma de miles.
    /// </summary>
    public static long? ReadId(JsonElement entity, string property)
    {
        if (!entity.TryGetProperty(property, out var value)) return null;
        if (value.ValueKind == JsonValueKind.Number) return value.TryGetInt64(out var number) ? number : null;
        if (value.ValueKind != JsonValueKind.String) return null;
        var digits = value.GetString();
        if (string.IsNullOrEmpty(digits)) return null;
        if (digits[0] == '-') digits = digits[1..];
        if (digits.Length == 0 || digits.Length > 19) return null;
        if (digits.Length > 1 && digits[0] == '0') return null;
        foreach (var character in digits)
        {
            if (character is < '0' or > '9') return null;
        }
        return long.TryParse(digits, out var parsed) ? parsed : null;
    }

    private static bool IsSendableUrl(string? url) => url is not null && SendableUrl.IsMatch(url);

    private static readonly Regex SendableUrl = new(@"^(?:https?://|tg://).+", RegexOptions.IgnoreCase | RegexOptions.Compiled);
}
