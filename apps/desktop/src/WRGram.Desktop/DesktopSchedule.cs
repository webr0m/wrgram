namespace WRGram.Desktop;

using System;
using System.Globalization;

/// <summary>
/// Programar un mensaje en Windows, regla única para los dos flujos que la usan: <c>send.text</c> y el
/// reenvío. En TDLib la programación es un objeto con tres estados —<c>MessageSchedulingStateSendNow</c>,
/// <c>SendWhenOnline</c> y <c>SendAtDate</c>— y Android los aprovecha los tres:
/// <c>NativeBridge.sendOptions</c> traduce <c>"online"</c> a <c>SendWhenOnline</c> y corta la ventana a mano
/// (ni antes de ahora+5 s, ni más allá de 367 días) antes de preguntar.
/// <para>
/// En MTProto no hay tres estados: hay un campo <c>schedule_date</c> de tipo <c>DateTime?</c>, verificado en
/// la firma de <c>Messages_SendMessage</c> y de <c>Messages_ForwardMessages</c> contra WTelegramClient 4.4.10.
/// «Cuando esta cuenta esté en línea» no se puede pedir, y la ventana la decide Telegram con un
/// <c>RpcException</c> si se le manda una hora pasada. Por eso esta clase niega lo que la petición no expresa
/// —en vez de enviar ahora y dejar que la pantalla crea que esperó— y replica la ventana de Android con su
/// frase, para que las dos capas digan lo mismo en el mismo caso.
/// </para>
/// </summary>
public static class DesktopSchedule
{
    /// El texto que la interfaz manda en <c>schedule</c> cuando la persona eligió «cuando se conecte».
    public const string Online = "online";

    /// Copiada carácter a carácter de <c>NativeBridge.sendOptions</c> («Elige una hora entre ahora y los
    /// próximos 367 días.»), con los dos topes de esa misma línea: 5 segundos y 367 días.
    public const string Range = "Elige una hora entre ahora y los próximos 367 días.";

    /// TDLib tiene estado para esto y MTProto no: <c>send.text</c> lo estaba enviando en el momento y callando,
    /// que es justo lo que la auditoría llama operación de efecto incierto (X04). Se niega en las dos rutas.
    public const string WhenOnline =
        "Telegram no tiene una petición que espere a «estar en línea»: solo acepta una hora concreta.";

    /// La pantalla manda o <c>"online"</c>, o un número, o nada. Android usa <c>optLong</c>, que convierte
    /// cualquier otra cosa en 0 —o sea, «ahora»—; aquí se lee igual para no inventarse una negativa que la otra
    /// capa no da.
    public static long Epoch(string raw) =>
        long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var value) && value > 0 ? value : 0;

    public static bool IsOnline(string raw) => raw.Equals(Online, StringComparison.Ordinal);

    /// <c>null</c> cuando no hay hora o cuando es legal; la frase de Android cuando se sale de la ventana. Se
    /// comprueba antes de escribir, porque un <c>schedule_date</c> en el pasado llega al servidor.
    public static string? Problem(long epoch, long now)
    {
        if (epoch == 0) return null;
        if (epoch < now + 5 || epoch > now + 367L * 86400L) return Range;
        return null;
    }

    /// El tipo que esperan las dos peticiones. La conversión es la misma que ya hacía <c>SendAsync</c>:
    /// segundos Unix a <c>DateTime</c> en UTC.
    public static DateTime? Date(long epoch) => epoch == 0
        ? null
        : DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime;
}
