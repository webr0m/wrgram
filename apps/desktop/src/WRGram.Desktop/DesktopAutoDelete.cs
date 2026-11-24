namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;

/// <summary>
/// Las reglas del borrado automático en Windows, que son las de <c>autoDeleteGet</c> (<c>NativeBridge.java:1358</c>),
/// <c>autoDeleteSet</c> (<c>:1373</c>), <c>confirmChatAutoDelete</c> (<c>:1399</c>) y <c>confirmAutoDelete</c>
/// (<c>:1408</c>) más el <c>AccountSafetyPolicy.autoDeleteSeconds</c> (<c>AccountSafetyPolicy.java:13</c>). Aquí vive
/// todo lo que se puede afirmar sin tener conexión; el hilo está en <c>DesktopAutoDeleteFlow.cs</c>.
/// <para>
/// El temporizador se mide en días completos: el panel de la pantalla ofrece 0, 1, 7 y 30 días
/// (<c>AutoDeleteSettings.tsx:37</c>) en una caja de 0 a 365 (<c>AutoDeleteSettings.tsx:38</c>), y multiplica por 86400
/// antes de mandar. Android lo comprueba con
/// <c>seconds&lt;0||seconds&gt;365*86400||seconds%86400!=0</c>; se copia la fórmula y no la intención, porque la
/// segunda dejaría pasar 30 horas.
/// </para>
/// <para>
/// Dos cosas de Android no tienen camino aquí, y se dicen en vez de imitarse. Los chats secretos: TDLib los conoce y
/// MTProto no, así que las dos frases de <c>:1343</c> y <c>:1367</c> no tienen quién las diga. Y el <c>canChange</c>
/// de un chat particular, que allá es una comparación de identificadores y aquí es la misma comparación —incluido el
/// <c>777000</c>, el usuario con el que Telegram habla solo—, pero no una petición: la marca de «no puedes» sale de
/// la forma del peer, no de un <c>GetChatMember</c>.
/// </para>
/// </summary>
public static class DesktopAutoDelete
{
    /// Segundos de un día, el único paso que Telegram admite en este ajuste.
    public const int Day = 86400;

    /// El tope de <c>AccountSafetyPolicy.java:17</c>: 365 días, y ni una hora más.
    public const int MaxDays = 365;

    /// <c>userId!=777000</c> de <c>NativeBridge.java:1368</c> y <c>:1371</c>: el chat de avisos de Telegram, que no
    /// admite temporizador. Es un identificador de servidor, no un número inventado aquí.
    public const long TelegramNotices = 777000;

    /// <c>throw new IllegalArgumentException("Duración no válida.")</c> (<c>AccountSafetyPolicy.java:15</c>): el campo
    /// falta, no es un número entero o es un decimal.
    public const string BadDuration = "Duración no válida.";

    /// <c>AccountSafetyPolicy.java:17</c> aplicado a un entero que sí era entero.
    public const string OutOfRange = "Elige de 0 a 365 días completos.";

    /// <c>NativeBridge.java:1391</c>, cuando el peer es la propia cuenta o el usuario de avisos.
    public const string NotAllowedHere = "Telegram no permite borrado automático en este chat.";

    /// <c>NativeBridge.java:1888</c>: el derecho <c>canChangeInfo</c> se mira antes de preguntar, no después.
    public const string NoRight = "Necesitas permiso para cambiar la información del chat.";

    /// <c>NativeBridge.java:1402</c>: entre la ventana modal y la escritura, otro dispositivo movió el temporizador.
    public const string Changed = "El temporizador cambió. Actualiza el estado antes de modificarlo.";

    /// <c>NativeBridge.java:1380</c>: la misma guardia, en el ajuste predeterminado.
    public const string DefaultChanged = "El ajuste cambió en otro dispositivo. Actualiza el estado.";

    /// <c>NativeBridge.java:1408</c>, la frase del botón positivo de <c>confirmAutoDelete</c>.
    public const string ChangedAccount = "La cuenta cambió. No se modificó el temporizador.";

    /// La novena negación no es de Android: es la que pronuncia este host cuando una de sus lecturas no devuelve el
    /// número. <c>DesktopCommunityEditing.ReadFullAsync</c> se traga el error y devuelve <c>null</c>, y el temporizador
    /// no tiene una degradación honesta —sin número no hay panel que pintar—, así que aquí se corta. La ronda AW
    /// nombró el mismo silencio de Telegram en la descripción de la comunidad; esta frase cambia el sustantivo porque
    /// lo que no vino es el ajuste, no el texto, y por eso no se reutiliza su constante.
    public const string Unreadable = "Telegram no devolvió la información actual de la conversación. Vuelve a intentarlo.";

    /// <c>confirmAutoDelete</c> (<c>:1389</c>) con el título de la comunidad recortado por la única casa que tiene
    /// esa regla en el host, <see cref="DesktopContact.Limit"/>; el título del modo predeterminado es literal y lo
    /// escribe <c>:1357</c>.
    public static string DialogTitle(string title) => "Borrado automático · " + DesktopContact.Limit(title, 100);

    /// <c>NativeBridge.java:1408</c>, las dos frases según el valor que se va a escribir. El cero no es «borrar
    /// ahora»: apaga el temporizador para los mensajes futuros, y el texto lo dice.
    public static string Body(int seconds) => seconds == 0
        ? "Se desactivará el temporizador para los mensajes futuros. Esto no recupera mensajes ya borrados."
        : "Los mensajes futuros se eliminarán automáticamente para todos después de " + (seconds / Day) +
          " días. No es una limpieza del historial existente.";

    /// <c>:1391</c>. El cancelar (<c>:1390</c>) y el cierre por la equis (<c>:1394</c>) responden <c>false</c> sin
    /// tocar Telegram, que es lo que la pantalla espera para no borrar el número que la persona ya había elegido.
    public const string Accept = "Aplicar en Telegram";

    /// <c>AccountSafetyPolicy.java:11</c>, la primera negación de los cuatro flujos y la que Android hace antes de
    /// mirar cualquier otro campo: el panel manda el identificador de la cuenta que pintó y, si la sesión ya no es
    /// esa, aquí se corta. Se queda en esta casa mientras sea el borrado automático el único flujo de escritorio que
    /// lo pide; la ronda que conecte el siguiente (<c>sponsored.settings</c> también llama a <c>owner</c>) la
    /// subirá a un módulo compartido.
    public const string WrongAccount = "La cuenta cambió. Vuelve a abrir este ajuste.";

    /// El título que <c>NativeBridge.java:1378</c> le pone a la conversación cuando lo que se cambia es el ajuste
    /// predeterminado: no hay community que nombre, así que Android nombra el grupo de chats al que afecta.
    public const string NewChats = "Chats nuevos";

    /// <c>AccountSafetyPolicy.java:13-19</c> carácter a carácter: primero la forma del campo y luego su valor, con
    /// las dos frases en ese orden. El <see cref="ArgumentException"/> viaja hasta la interfaz con su mensaje tal
    /// cual (<c>DesktopBridge.cs:93-98</c>), que es justo lo que hace el puente de Android con el suyo.
    public static int Seconds(JsonElement args)
    {
        if (!args.TryGetProperty("seconds", out var raw) || !raw.TryGetInt64(out var value))
            throw new ArgumentException(BadDuration);
        if (value < 0 || value > (long)MaxDays * Day || value % Day != 0) throw new ArgumentException(OutOfRange);
        return (int)value;
    }

    /// <c>AccountSafetyPolicy.owner</c> (<c>AccountSafetyPolicy.java:10-12</c>). Falta la clave no es una negación:
    /// las dos pantallas la mandan siempre (<c>AutoDeleteSettings.tsx:21</c>), así que una petición sin ella solo
    /// puede venir de fuera de la interfaz, y el host la lee como «la cuenta de la sesión» —igual que las dos guardas de
    /// la ronda BF en <c>DesktopLinkManagerFlow.cs</c>—. Presente, tiene que ser exacta. La otra mitad del <c>if</c>
    /// de Android, <c>selfId&lt;=0</c>, la comprueba el cable junto a esta, porque hace falta el cliente para saberlo.
    public static bool Owns(JsonElement args, string selfId) =>
        args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("accountId", out var asked) ||
        (asked.ValueKind == JsonValueKind.String ? asked.GetString() : asked.ToString()) == selfId;

    /// <c>userId!=session.selfId&amp;&amp;userId!=777000</c> de <c>:1347</c>, la marca que lee el panel, y su reverso
    /// para la escritura de <c>:1370</c>: la propia cuenta (Guardados) y el usuario de avisos no tienen temporizador.
    public static bool CanChangePrivate(long userId, long selfId) => userId != selfId && userId != TelegramNotices;

    /// El número que trae la respuesta de <c>getFullChat</c> o <c>getFullChannel</c>. <c>ChatFullBase</c> es un
    /// marcador vacío —medido por reflexión sobre la 4.4.10: las dos formas concretas, <c>ChatFull</c> y
    /// <c>ChannelFull</c>, declaran cada una su <c>ttl_period</c>—, así que el descifrado se hace por forma y un
    /// <c>null</c> quiere decir «Telegram no devolvió ninguna de las dos», que es lo único honesto para una tercera
    /// forma que hoy no existe en el esquema.
    public static int? Period(ChatFullBase? full) => full switch
    {
        ChatFull basic => basic.ttl_period,
        ChannelFull channel => channel.ttl_period,
        _ => null
    };

    /// Las dos claves que <c>object("seconds",…,"canChange",…)</c> fabrica en <c>:1340</c>, <c>:1347</c>, <c>:1361</c>
    /// y <c>:1383</c>. Después de escribir, Android responde <c>canChange:true</c> siempre: la escritura ya exigió el
    /// derecho, así que la segunda vez sobra volver a preguntarlo.
    public static object Dto(int seconds, bool canChange) => new { seconds, canChange };
}
