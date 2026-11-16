namespace WRGram.Desktop;

using System;

/// <summary>
/// El enlace de invitación en Windows. Android resuelve estos enlaces con TDLib, que tiene un router
/// propio —`getInternalLinkType` dice qué forma es y `joinChatByInviteLink` entra—; MTProto no ofrece
/// ninguno de los dos y hay que hacer el trabajo a mano: leer el `hash` del enlace, preguntar con
/// `messages.checkChatInvite` y, solo después de que la persona confirme, escribir con
/// `messages.importChatInvite`. Las tres decisiones —qué enlace es un invito, qué se pregunta antes de
/// escribir y qué frase se dice cuando Telegram niega el paso— viven aquí para que nada de eso se
/// improvise dentro del puente.
/// <para>
/// Las frases que coinciden con un estado ya conocido están copiadas carácter a carácter de
/// `NativeBridge.java`: `Inside` es `MEMBERSHIP_INSIDE` y `Unknown` es `MEMBERSHIP_UNKNOWN`. Las otras
/// tres (enlace caducado, validación por bot y cobro con Stars) no tienen gemelo en Android, porque
/// allí las resuelve TDLib o un cuadro de diálogo nativo que este host no puede abrir; se dicen como
/// negaciones propias y `rondaAB.test.ts` deja escrito que no hay paridad que comparar.
/// </para>
/// </summary>
public static class DesktopInviteLinks
{
    /// El mismo techo que `BridgePolicy.text(p,"url",2048)` en Android y que el campo de la pantalla.
    public const int MaxUrl = 2048;

    /// `TelegramLinks.normalize` corta la ruta en 1024; un `hash` real de Telegram ronda los 11
    /// caracteres y el legado `joinchat` llega a los 40. Con este techo ninguno se rechaza y ninguno
    /// se inventa.
    public const int MaxHash = 128;

    public const string Inside = "Esta cuenta ya es miembro de esa comunidad en Telegram.";

    public const string Unknown = "Telegram devolvió un resultado que WRGram no sabe interpretar. No se dio por hecho que entraste.";

    public const string Expired = "El enlace de invitación caducó o lo revocaron sus administradores; Telegram no dejó entrar a esta cuenta.";

    /// `messages.chatInviteJoinResultWebView` es la respuesta de una comunidad que valida a quien llega
    /// desde la página de un bot. Abrirla exigiría un navegador incrustado con sesión de la cuenta, y
    /// el host de Windows no lo tiene: se niega en vez de fingir que el ingreso quedó hecho.
    public const string WebGuard = "Esta comunidad valida a quien entra desde una página del bot de seguridad, y WRGram en Windows no abre esa página. Termina el ingreso desde Telegram o desde la app de Android.";

    /// El cobro con Stars en Android pasa por `SendPaymentForm` con el formulario de Telegram. Aquí no
    /// hay ese camino, así que un enlace de pago se rechaza antes de escribir nada.
    public const string Paid = "Esta invitación cobra una suscripción con Telegram Stars y WRGram en Windows no pasa por ese cobro. Ábrela desde la app de Android para suscribirte.";

    public const string BadLink = "Ese enlace de invitación no trae un código reconocible.";

    private static readonly string[] Hosts = { "t.me", "telegram.me", "telegram.dog" };

    /// El `hash` que Telegram pidió, o null cuando el enlace no es una invitación. Se admiten las tres
    /// formas reales: `https://t.me/+HASH`, `https://t.me/joinchat/HASH` —la legada, que los servidores
    /// siguen resolviendo— y `tg://join?invite=HASH`. Cualquier otra cosa vuelve al navegador, que es lo
    /// que hacía este host antes de existir la clase.
    public static string? HashOf(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0 || value.Length > MaxUrl) return null;
        if (!Uri.TryCreate(value, UriKind.Absolute, out var uri)) return null;
        // `Uri.Port` responde 443 incluso cuando el enlace no llevaba puerto, así que el filtro honesto
        // es si el puerto es el del esquema: `t.me:8443/+código` no es un enlace de Telegram.
        if (uri.UserInfo.Length != 0 || !uri.IsDefaultPort) return null;
        var scheme = uri.Scheme.ToLowerInvariant();
        if (scheme == "tg") return uri.Host.Equals("join", StringComparison.OrdinalIgnoreCase) ? Hash(FromQuery(uri.Query)) : null;
        if (scheme != "https") return null;
        if (Array.IndexOf(Hosts, uri.Host.ToLowerInvariant()) < 0) return null;
        var path = uri.AbsolutePath;
        if (path.StartsWith("/+", StringComparison.Ordinal)) return Hash(path[2..]);
        if (path.StartsWith("/joinchat/", StringComparison.Ordinal)) return Hash(path["/joinchat/".Length..]);
        return null;
    }

    /// Es un enlace de invitación aunque el código esté mal: la pantalla tiene que decir «el enlace no
    /// vale» y no «esto no es de Telegram», que son dos verdades distintas.
    public static bool IsInviteLink(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (value.Length == 0 || !Uri.TryCreate(value, UriKind.Absolute, out var uri)) return false;
        var scheme = uri.Scheme.ToLowerInvariant();
        if (scheme == "tg") return uri.Host.Equals("join", StringComparison.OrdinalIgnoreCase);
        if (scheme != "https") return false;
        if (Array.IndexOf(Hosts, uri.Host.ToLowerInvariant()) < 0) return false;
        var path = uri.AbsolutePath;
        return path.StartsWith("/+", StringComparison.Ordinal) || path.StartsWith("/joinchat/", StringComparison.Ordinal);
    }

    /// Sin título no hay invitación que explicar: Telegram puede devolver el `ChatInvite` sin nombre y
    /// la confirmación quedaría en «¿Unirte a ?». Se pone el texto con el que Android llama a ese caso.
    public static string TitleOf(string? title) =>
        string.IsNullOrWhiteSpace(title) ? "este chat" : title.Trim();

    /// El aviso que la pantalla lee antes de escribir. `approval` es la bandera `request_needed` de
    /// Telegram, que cambia el botón: «Solicitar unirme» en lugar de «Unirme».
    public static object Preview(string title, int members, bool approval) => new
    {
        action = "invite_preview",
        title,
        members = Math.Max(0, members),
        approval,
    };

    /// La respuesta del ingreso ya escrito. `state` son las mismas claves que `chat.join` devuelve y
    /// `membership.ts` traduce, así que un enlace y un botón no pueden decir cosas distintas.
    public static object Membership(string state) => new { action = "membership", state };

    public static bool ExpiredHash(string? error) => Starts(error, "INVITE_HASH_EXPIRED");

    public static bool RequestSent(string? error) => Starts(error, "INVITE_REQUEST_SENT");

    public static bool Banned(string? error) => Starts(error, "USER_BANNED_IN_CHANNEL");

    public static bool AlreadyInside(string? error) => Starts(error, "USER_ALREADY_PARTICIPANT");

    private static bool Starts(string? error, string code) =>
        !string.IsNullOrEmpty(error) && error.StartsWith(code, StringComparison.Ordinal);

    private static string FromQuery(string query)
    {
        if (string.IsNullOrEmpty(query)) return string.Empty;
        foreach (var part in query.TrimStart('?').Split('&'))
        {
            var split = part.IndexOf('=');
            if (split <= 0) continue;
            if (!part[..split].Equals("invite", StringComparison.OrdinalIgnoreCase)) continue;
            return part[(split + 1)..];
        }
        return string.Empty;
    }

    /// Base64 con alfabeto seguro: el que Telegram usa en `+HASH` y en `joinchat/HASH`. Se rechaza `+`,
    /// `/` y `%` a propósito —ningún hash de Telegram los lleva—, así que nunca se decodifica nada ni
    /// se manda una cadena arbitraria a `messages.importChatInvite`.
    private static string? Hash(string candidate)
    {
        if (candidate.Length == 0 || candidate.Length > MaxHash) return null;
        foreach (var c in candidate)
        {
            if (char.IsAsciiLetterOrDigit(c) || c is '-' or '_') continue;
            return null;
        }
        return candidate;
    }
}
