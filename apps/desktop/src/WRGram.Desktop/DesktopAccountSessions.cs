using System.Collections.Generic;
using System.Text.Json;
using TL;

namespace WRGram.Desktop;

/// <summary>
/// Las dos órdenes de las sesiones de la propia cuenta en Windows: leer la lista y cerrar una de ellas. Las reglas
/// y las frases están en <see cref="DesktopSessions"/>; aquí está el cable, que es lo que faltaba —la lectura caía
/// en una negativa escrita por este host (<c>DesktopAccountProfile.NoSessions</c>, que esta ronda borra) y la
/// escritura en el <c>_ =&gt; throw</c> genérico, sin que nadie hubiera mirado si la librería tenía petición.
/// <para>
/// La medida dice que las dos las tiene: <c>Account_GetAuthorizations(Client)</c> responde
/// <c>Task&lt;TL.Account_Authorizations&gt;</c> y <c>Account_ResetAuthorization(Client, long hash)</c>
/// <c>Task&lt;bool&gt;</c> (WTelegramClient 4.4.10, reflexionado). Android pregunta con <c>GetActiveSessions</c>
/// (<c>NativeBridge.java:1810</c>) y cierra con <c>TerminateSession</c> (<c>NativeBridge.java:569</c>), que son la
/// misma pregunta de TDLib con otros nombres. Lo que no se parece es la forma de los datos, y esa traducción vive
/// entera en <see cref="DesktopSessions"/>: el cable solo pide y ordena.
/// </para>
/// <para>
/// El identificador es la diferencia con más consecuencias. TDLib da un <c>item.id</c> de sesión; MTProto da un
/// <c>hash</c> de 64 bits que solo tiene sentido para la sesión que está viva en este momento. Por eso la pantalla
/// lo trata como una opaca cadena de ida y vuelta —<c>item.id</c> en <c>apps/mobile-ui/src/App.tsx:413</c>— y por eso la lista se lee
/// <b>siempre</b> antes de cerrar: un <c>hash</c> guardado de una lectura anterior ya no vale. Aquí no hay caché de
/// sesiones, igual que en Android, que tampoco guarda la lista: cada apertura del diálogo vuelve a preguntar.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>account.sessions</c> (<c>NativeBridge.java:551</c> → <c>accountSessions</c>, <c>:1810</c>). Las ocho claves
    /// del DTO son las ocho de Android, en el mismo orden, y ninguna se inventa: lo que MTProto no trae se deja
    /// vacío con la misma cadena con la que lo deja el puente móvil.
    /// <para>
    /// La lista se devuelve sin filtrar y sin ordenar. Telegram ya pone la sesión actual primero, y ordenarla aquí
    /// sería una norma propia que la pantalla no pidió; la pantalla, además, no ordena —pinta en el orden recibido
    /// —, así que el orden que se ve es el que dice Telegram.
    /// </para>
    /// </summary>
    private async Task<object?> SessionsAsync()
    {
        var client = CollectionClient();
        var page = await client.Account_GetAuthorizations();
        var sessions = page.authorizations ?? throw new BridgeException(DesktopSessions.NotRead);
        List<object> items = [];
        foreach (var session in sessions)
        {
            if (session is null) continue;
            items.Add(new
            {
                id = session.hash.ToString(),
                current = (session.flags & TL.Authorization.Flags.current) != 0,
                device = DesktopSessions.Device(session.device_model),
                platform = session.platform ?? "",
                version = DesktopSessions.Version(session.app_name, session.app_version),
                location = DesktopSessions.Location(session.country, session.region),
                ip = session.ip ?? "",
                lastActive = Unix(session.date_active)
            });
        }
        return items;
    }

    /// <summary>
    /// <c>account.session.revoke</c> (<c>NativeBridge.java:569</c>) con el guardaje de esa línea, en ese orden:
    /// sesión montada, identificador con forma, y recién entonces la escritura. Android no comprueba nada más —no
    /// prohíbe cerrar la sesión propia— porque la pantalla ya no ofrece el botón en esa fila
    /// (<c>App.tsx:413</c>, <c>!item.current</c>); copiar esa omisión es más honesto que inventar una guarda que el
    /// otro cliente no tiene.
    /// <para>
    /// Se devuelve el <c>bool</c> de la librería en vez del <c>true</c> fijo de Android. Allá el <c>case</c>
    /// responde <c>a.ok(true)</c> sin mirar lo que dijo TDLib; aquí la petición sí contesta algo, y fingir un éxito
    /// cuando la respuesta es negativa sería una de esas mentiras que después nadie puede depurar. La pantalla
    /// comprueba «no es <c>undefined</c>», así que un <c>false</c> relee la lista igual y la persona ve si la fila
    /// sigue ahí.
    /// </para>
    /// </summary>
    private async Task<object?> RevokeSessionAsync(JsonElement args)
    {
        var client = CollectionClient();
        var raw = Raw(args, "id");
        if (!DesktopSessions.ValidId(raw)) throw new BridgeException(DesktopSessions.BadId);
        return await client.Account_ResetAuthorization(DesktopSessions.HashOf(raw));
    }
}
