namespace WRGram.Desktop;

/// <summary>
/// Reglas de «abrir el chat de una persona» en Windows, el botón «Abrir chat» de la tarjeta de contacto que la
/// ronda AP dejó a medias y el que ya usaban los nombres citados en una biografía. Android lo resuelve con
/// <c>TdApi.CreatePrivateChat(userId)</c> (<c>NativeBridge.java:577</c>): a TDLib le basta el número de la persona
/// porque el <c>access_hash</c> vive dentro de la biblioteca. MTProto no presta ese servicio —<c>InputPeerUser</c>
/// pide <c>id</c> **y** <c>access_hash</c>, y el hash solo viene en las listas que Telegram ya mandó a esta
/// sesión: los contactos, los diálogos y los participantes de los mensajes—, así que la diferencia de protocolo es
/// una frase que la persona llega a leer y no un secreto del puente.
/// <para>
/// Lo que sí se hereda sin tocar es el resto del camino: la clave <c>u</c> + número es la misma forma que ya sabe
/// leer <c>FindEntry</c>, la misma que <c>PeerKey</c> fabrica al convertir un mensaje, y la validación es la de
/// <c>DesktopSavedFilters.ChatToken</c>. No hay segunda regla de identificadores en este host.
/// </para>
/// </summary>
public static class DesktopPrivateChat
{
    /// La sesión todavía no está montada. Es la frase que <c>OpenChatAsync</c> venía diciendo a secas desde la
    /// ronda E; ahora vive aquí porque la piden los dos brazos que abren una conversación.
    public const string NoAccount = "Inicia sesión para abrir conversaciones.";

    /// Lo que Android lanza como <c>Invalid identifier</c> desde <c>BridgePolicy.id</c>
    /// (<c>BridgePolicy.java:58</c>): no es un número positivo de hasta diecinueve dígitos.
    public const string BadId = "El identificador de la persona no es un identificador válido.";

    /// La consecuencia de la diferencia de protocolo escrita con nombre: sin el <c>access_hash</c> no hay
    /// <c>InputPeerUser</c>, y no hay manera de pedirlo por un número de usuario suelto. La persona llega a la
    /// caché con la agenda (<c>contacts.list</c>) o con cualquier mensaje suyo, que es justo de donde sale el
    /// botón, así que la negativa es para un identificador inventado fuera de la app.
    public const string Unknown = "Esa persona todavía no está entre las que este dispositivo conoce.";

    /// La clave con la que <c>FindEntry</c> encuentra la conversación, o <c>null</c> cuando el identificador no
    /// tiene forma. Es pura y no lanza: quien decide la frase es el brazo.
    public static string? KeyOf(string? userId)
    {
        if (userId is null) return null;
        var key = "u" + userId.Trim();
        return DesktopSavedFilters.ChatToken(key) ? key : null;
    }

    /// El número de usuario que va dentro de esa clave. Devuelve cero cuando <see cref="KeyOf"/> habría
    /// devuelto <c>null</c>, que es lo que quiere el llamador: no hay dos maneras de fallar.
    public static long UserIdOf(string? userId)
    {
        var key = KeyOf(userId);
        return key == null || !long.TryParse(key.AsSpan(1), out var value) ? 0 : value;
    }
}
