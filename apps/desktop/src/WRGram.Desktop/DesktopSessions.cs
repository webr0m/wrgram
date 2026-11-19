using System;
using System.Text.RegularExpressions;

namespace WRGram.Desktop;

/// <summary>
/// Reglas de la lista de sesiones activas en Windows. En Android el flujo está escrito entero desde hace rondas:
/// la lectura es <c>accountSessions</c> (<c>NativeBridge.java:1766</c>), despachada en <c>:538</c>, y el cierre es
/// un <c>TerminateSession</c> de una línea (<c>:553</c>). Aquí las dos caían en negativas: la lectura con una
/// frase propia (<c>DesktopAccountProfile.NoSessions</c>, que esta ronda ha borrado porque mentía) y la escritura
/// con el <c>_ =&gt; throw</c> genérico, sin que nadie hubiera mirado si la librería tenía petición.
/// <para>
/// La medida dice que sí: reflexionado WTelegramClient 4.4.10, <c>Account_GetAuthorizations(Client)</c> devuelve
/// <c>Task&lt;TL.Account_Authorizations&gt;</c> y <c>Account_ResetAuthorization(Client, long hash)</c> responde
/// <c>Task&lt;bool&gt;</c>. Lo que no hay es una correspondencia campo por campo, y eso es lo que esta clase
/// decide en vez de dejarlo repartido por el cable.
/// </para>
/// <para>
/// TDLib ya trae <c>Session</c> con <c>deviceModel</c>, <c>platform</c>, <c>applicationName</c> +
/// <c>applicationVersion</c>, <c>location</c> (una sola cadena), <c>ipAddress</c> y <c>lastActiveDate</c>. MTProto
/// reparte lo mismo por otros sitios: la aplicación va en dos campos (<c>app_name</c>, <c>app_version</c>) como
/// en TDLib, pero la procedencia llega en <b>dos</b> cadenas (<c>country</c> y <c>region</c>) donde TDLib da una,
/// la marca de «esta sesión» no es un booleano sino un bit de <c>flags</c>, el identificador no es un id de sesión
/// sino un <c>hash</c> de 64 bits, y la hora viene como <c>DateTime</c> en lugar de un entero Unix. Las cuatro
/// funciones de abajo son esas cuatro traducciones, cada una con su criterio escrito.
/// </para>
/// <para>
/// Lo que MTProto publica y el contrato de la interfaz no consume —<c>api_id</c>, <c>official_app</c>,
/// <c>password_pending</c>, <c>unconfirmed</c>, <c>encrypted_requests_disabled</c>, <c>call_requests_disabled</c>,
/// <c>date_created</c> y <c>authorization_ttl_days</c>— no viaja. No es que Telegram no lo sepa: es que ninguna
/// pantalla lo pregunta, y añadir claves que nadie lee es la forma barata de que la próxima ronda las crea
/// mostradas.
/// </para>
/// </summary>
public static class DesktopSessions
{
    /// Literal de <c>answer.fail("No se pudieron consultar las sesiones.")</c> (<c>NativeBridge.java:1766</c>). Allá
    /// la produce el fallo al montar el <c>JSONArray</c>; aquí no hay JSON que montar —se devuelve un array de
    /// DTOs—, así que la frase queda para lo que sí puede pasar en esta capa: que la respuesta no traiga la lista.
    public const string NotRead = "No se pudieron consultar las sesiones.";

    /// El respaldo de <c>item.deviceModel==null?"Dispositivo":item.deviceModel</c> (<c>NativeBridge.java:1766</c>).
    /// No es decoración: sin <c>device</c> la fila de la pantalla (<c>App.tsx:395</c>) queda sin título.
    public const string NoDevice = "Dispositivo";

    /// Lo que Android lanza como <c>Invalid identifier</c> desde <c>BridgePolicy.id</c>
    /// (<c>BridgePolicy.java:53</c>) dicho en español, como hicieron las rondas AT y AU con las demás frases
    /// inglesas del puente: un código de la biblioteca no es una explicación.
    public const string BadId = "El identificador de la sesión no es un identificador válido.";

    /// La misma forma que acepta Java: <c>-?(0|[1-9][0-9]{0,18})</c> contra la cadena entera. Se ancla con
    /// <c>\A</c> y <c>\z</c> y no con <c>^</c> y <c>$</c> por la lección de la ronda AT: el <c>$</c> de .NET deja
    /// pasar un salto de línea final y <c>matches</c> de Java no.
    /// <para>
    /// Como en Android, el valor tiene que llegar **como cadena**: <c>BridgePolicy.id</c> empieza con
    /// <c>value instanceof String</c>, y <c>Raw</c> del host hace esa misma comprobación sobre el JSON. Un número
    /// suelto se niega, aunque se parezca.
    /// </para>
    /// </summary>
    public static bool ValidId(string? raw) =>
        raw != null && Regex.IsMatch(raw, @"\A-?(0|[1-9][0-9]{0,18})\z");

    /// El <c>hash</c> con el que <c>account.resetAuthorization</c> identifica la sesión. Devuelve cero cuando
    /// <see cref="ValidId"/> habría dicho que no, para que el brazo tenga una sola manera de fallar.
    /// <para>
    /// Aquí Windows aprieta un poco más que Android: diecinueve nueves pasan el patrón de las dos capas, pero a
    /// Java le explota después un <c>NumberFormatException</c> con su texto de la máquina y aquí
    /// <c>long.TryParse</c> le devuelve cero y la persona lee <see cref="BadId"/>. Se eligió la frase propia
    /// porque un mensaje de .NET sobre un desbordamiento no explica nada.
    /// </para>
    /// </summary>
    public static long HashOf(string? raw) => ValidId(raw) && long.TryParse(raw, out var hash) ? hash : 0;

    /// <c>item.deviceModel==null?"Dispositivo":item.deviceModel</c>, con una diferencia obligada: en MTProto el
    /// campo llega como cadena y puede venir **vacía**, no solo nula, y una fila sin título se ve igual.
    public static string Device(string? model) => string.IsNullOrEmpty(model) ? NoDevice : model;

    /// <c>item.applicationName==null?"":item.applicationName+" "+(item.applicationVersion==null?"":item.applicationVersion)</c>
    /// (<c>NativeBridge.java:1766</c>). Se copia tal cual, con su espacio cuando la versión falta: la pantalla
    /// compone <c>[version,platform,location].filter(Boolean).join(' · ')</c> y el HTML colapsa el doble espacio,
    /// así que divergir aquí sería cambiar una cifra por estética y perder la paridad que esta ronda persigue.
    public static string Version(string? name, string? version) =>
        name == null ? "" : name + " " + (version ?? "");

    /// La traducción que no existe en TDLib: <c>location</c> allá es una cadena sola y acá son dos campos,
    /// <c>country</c> y <c>region</c>. Se compone en el orden en que Telegram oficial los enseña —primero la
    /// ciudad, después el país, con coma—, y cuando falta uno no se deja la coma suelta ni se inventa el hueco.
    public static string Location(string? country, string? region)
    {
        var place = region ?? "";
        var nation = country ?? "";
        return place.Length > 0 && nation.Length > 0 ? place + ", " + nation : place + nation;
    }
}
