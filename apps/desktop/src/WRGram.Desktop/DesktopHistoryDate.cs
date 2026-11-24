namespace WRGram.Desktop;

using System;
using System.Collections.Generic;

/// <summary>
/// Reglas de «Ir a una fecha» en Windows. El botón existe en la cabecera del chat desde hace rondas y Android lo
/// atiende con <c>GetChatMessageByDate</c> (<c>TdSession.java:955-958</c>, que tolera el 404 y lo devuelve como
/// ausencia); aquí la orden caía en el <c>_ =&gt; throw</c> genérico, que dice «No disponible en escritorio (beta)»
/// dando a entender que falta el cable, y la pantalla además tapaba el botón con <c>!desktop</c>.
/// <para>
/// Las tres frases son literales de <c>messageByDate</c> (<c>NativeBridge.java:3399-3413</c>, recogidas en
/// <c>HistoryDate.java</c>) carácter a carácter: la misma hora escrita en los dos dispositivos tiene que salir o
/// negarse igual.
/// </para>
/// <para>
/// La aritmética es la misma en las dos capas, incluido el techo: <see cref="MaxSeconds"/> vale lo que vale el
/// <c>int</c> de Android aunque MTProto no lo necesite —su <c>offset_date</c> es un <c>DateTime</c>—, porque una
/// hora rechazada en un dispositivo y aceptada en el otro sería la promesa rota de esta ronda. Y el futuro se niega
/// igual que en <c>messageByDate</c>: no es un gesto alcanzable desde el diálogo, porque <c>endOfLocalDate</c>
/// (<c>inboxModel.ts:53-61</c>) corta su propia frontera a «ahora» con un <c>Math.min</c> y el campo no deja pasar
/// de hoy, así que la negación viaja como guarda del puente sobre llamadores que no son la pantalla.
/// </para>
/// <para>
/// Lo que cambia es dónde se busca: <c>GetChatMessageByDate</c> resuelve sobre la ventana que TDLib ya tiene en
/// memoria y su schema promete «Returns the last message sent in a chat no later than the specified date», con 404 si
/// no hay ninguno (<c>tdlib/vendor/java/org/drinkless/tdlib/TdApi.java:124830</c>). Aquí no hay ventana que
/// consultar, así que la ancla viaja en <c>messages.getHistory</c> con <c>offset_date</c> y el mensaje lo elige
/// <see cref="Pick"/> en casa, sobre la franja leída.
/// </para>
/// </summary>
public static class DesktopHistoryDate
{
    /// Literal de <c>messageByDate</c> cuando la conversación pedida no es la abierta o no tiene historial saltable
    /// (<c>NativeBridge.java:3404</c>).
    public const string History = "Este historial no admite saltos por fecha.";

    /// Literal de <c>messageByDate</c> para la hora que no cabe o no viene (<c>NativeBridge.java:3408</c>).
    public const string Range = "Fecha fuera de rango.";

    /// Literal de <c>messageByDate</c> cuando la conversación cambió mientras se esperaba (<c>NativeBridge.java:3410</c>).
    public const string Changed = "La conversación cambió.";

    /// El techo con el que Android decide que una hora es basura: su <c>date</c> viaja en <c>int</c>.
    public const long MaxSeconds = int.MaxValue;

    /// Cuántos mensajes se leen alrededor de la ancla. Es la misma franja con la que Android corta la banda de
    /// fechas en <c>galleryPage</c> (<c>NativeBridge.java:3382</c>, treinta por página), y aquí sirve para otra
    /// cosa: la selección del mensaje la decide esta casa, así que no depende de si el servidor ancló la página un
    /// mensaje antes o después de la hora pedida.
    public const int Page = 30;

    /// Si la hora manda algo, cabe en el entero de Android y no está por delante de <paramref name="now"/>. Es el
    /// <c>at&lt;=0 || at&gt;Integer.MAX_VALUE || at&gt;now</c> de <c>messageByDate</c> (<c>NativeBridge.java:3408</c>).
    public static bool Acceptable(long at, long now) => at > 0 && at <= MaxSeconds && at <= now;

    /// El <c>DateTime</c> que espera <c>messages.getHistory</c> en <c>offset_date</c>, en segundos de epoch UTC.
    public static DateTime Anchor(long at) => DateTimeOffset.FromUnixTimeSeconds(at).UtcDateTime;

    /// <summary>
    /// El identificador del mensaje más reciente enviado <b>hasta</b> la frontera, o <c>null</c> si la franja leída
    /// no llega tan lejos. Se decide aquí y no en el servidor por dos razones: la pantalla promete el último mensaje
    /// «hasta el final del día», y el orden en que MTProto devuelve una página anclada por fecha no está documentado
    /// —una sola fila de más o de menos no puede cambiar la respuesta—.
    /// </summary>
    public static long? Pick(IEnumerable<(long Id, long Date)> rows, long at)
    {
        long? best = null;
        long bestDate = long.MinValue;
        foreach (var (id, date) in rows)
        {
            if (id <= 0 || date > at) continue;
            if (best is null || date > bestDate || (date == bestDate && id > best.Value))
            {
                bestDate = date;
                best = id;
            }
        }
        return best;
    }
}
