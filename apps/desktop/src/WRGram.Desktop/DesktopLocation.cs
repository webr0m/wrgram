namespace WRGram.Desktop;

using System;
using System.Globalization;
using TL;

/// <summary>
/// Reglas de «leer una ubicación» en Windows. Hasta esta ronda el host no mencionaba ninguna de las tres clases
/// de medio geográfico: el <c>switch</c> de <c>ConvertMessage</c> conocía foto, documento, encuesta y contacto, y
/// una ubicación caía en el <c>default</c>, que escribe «Contenido no compatible con esta beta.» donde la persona
/// esperaba un par de coordenadas y un botón de mapa. Android publica la tarjeta desde <c>MessageExtras.card</c>
/// (<c>MessageExtras.java:40-50</c>) con los cinco campos que lee <c>MessageExtraCard.tsx</c>, y aquí salen los
/// mismos con los mismos nombres.
/// <para>
/// Los tres títulos son literales de <c>MessageExtras.summary</c> (<c>:15-20</c>) carácter a carácter: «Ubicación»,
/// «Ubicación en vivo» y «Lugar». Que se llamen igual en las dos capas no es cosmética —el mismo mensaje recibido
/// en los dos dispositivos tiene que decir lo mismo— y una prueba los cruza con el archivo Java.
/// </para>
/// <para>
/// Lo que MTProto cambia es el envoltorio, no el contenido: TDLib separa en tres tipos de contenido lo que aquí
/// son tres clases de <c>MessageMedia</c>, y <c>MessageMediaGeoLive</c> **deriva** de <c>MessageMediaGeo</c> en la
/// librería. El orden de los casos del <c>switch</c> no es estilo: si el fijo se mira primero, una ubicación en
/// vivo se pinta como fija y pierde su cuenta atrás.
/// </para>
/// </summary>
public static class DesktopLocation
{
    /// Literal de <c>MessageExtras.summary</c> para <c>TdApi.MessageLocation</c> (<c>MessageExtras.java:15</c>).
    public const string Fixed = "Ubicación";

    /// Literal de <c>summary</c> para <c>TdApi.MessageLiveLocation</c> (<c>MessageExtras.java:16</c>), el mismo que
    /// usa Android como título de la tarjeta en <c>:43</c>.
    public const string Live = "Ubicación en vivo";

    /// Literal de <c>summary</c> cuando el lugar no trae título (<c>MessageExtras.java:19</c>).
    public const string Venue = "Lugar";

    /// Literal de <c>openMessageLocation</c> cuando la fila o el chat protegen su contenido
    /// (<c>NativeBridge.java:416</c>). Es la misma idea del <c>noforwards</c> que ya apaga el reenvío: el mapa
    /// externo se considera una salida del chat.
    public const string Protected = "Esta ubicación solo se puede ver dentro de este chat.";

    /// Literal de <c>openMessageLocation</c> cuando las coordenadas no están o no valen
    /// (<c>NativeBridge.java:421</c>). La pantalla ya oculta el botón en ese caso; esta frase la oye quien invoque
    /// el puente por su cuenta.
    public const string Gone = "La ubicación ya no está disponible.";

    /// La URL que arma Android tal cual (<c>NativeBridge.java:425</c>): <c>query</c> con «lat,lon». No es un
    /// capricho del puente —es el enlace que la persona ve en el portapapeles del navegador—, así que se copia
    /// entero y una prueba lo compara con el archivo Java.
    public const string MapBase = "https://www.google.com/maps/search/?api=1&query=";

    /// El tope con el que <c>MessageExtras.text</c> recorta título y dirección de un lugar
    /// (<c>MessageExtras.java:136</c>, que llama a <c>NativeSnapshot.limit</c>).
    public const int TextLimit = 2048;

    /// La regla de <c>MessageExtras.validLocation</c> (<c>:129-132</c>): finita y dentro de los rangos. Cero es un
    /// valor legítimo —el golfo de Guinea existe—, así que no se puede decidir por «trae algo».
    public static bool Valid(double latitude, double longitude) =>
        !double.IsNaN(latitude) && !double.IsInfinity(latitude) &&
        !double.IsNaN(longitude) && !double.IsInfinity(longitude) &&
        Math.Abs(latitude) <= 90 && Math.Abs(longitude) <= 180;

    /// El punto del esquema, que puede no venir: <c>MessageMediaGeo.geo</c> es nullable y Android trata el nulo
    /// igual que el rango roto —tarjeta sin coordenadas y sin botón—.
    public static bool Valid(GeoPoint? point) => point != null && Valid(point.lat, point.lon);

    /// <summary>
    /// El enlace que se le entrega al navegador. El separador decimal va fijado al cultivo invariable a propósito:
    /// un Windows con la regional en español escribiría <c>40,416774</c> con coma, y la consulta de Google maps,
    /// que usa la coma para separar latitud de longitud, recibiría cuatro números en vez de dos. El formato por
    /// defecto de <c>double</c> en .NET ya es el más corto que relee el mismo valor, que es lo que hace Java con
    /// <c>Double.toString</c>.
    /// </summary>
    public static string Link(GeoPoint point) =>
        MapBase + point.lat.ToString(CultureInfo.InvariantCulture) + "," + point.lon.ToString(CultureInfo.InvariantCulture);

    /// El instante en que deja de actualizarse, en segundos de epoch, que es la unidad del contrato. Android lo saca
    /// de la hora del mensaje más el periodo vivo de la ubicación (<c>MessageExtras.java:42</c>) y lo deja en cero
    /// cuando el tiempo que queda no vale. MTProto no separa las dos cifras: <c>MessageMediaGeoLive</c> solo trae
    /// <c>period</c>, así que el periodo de validez hace las veces de las dos, y cero sigue significando «no hay
    /// cuenta atrás», no «caducó en 1970».
    public static long ExpiresAt(long date, int period) => period <= 0 ? 0 : date + period;

    /// Título de un lugar con la regla de Android: en blanco cuenta como ausente y cae en «Lugar»; si viene, se
    /// recorta con el punto suspensivo de <c>NativeSnapshot.limit</c>, no con el <c>Clip</c> del host.
    public static string Title(string? value) =>
        string.IsNullOrWhiteSpace(value) ? Venue : DesktopContact.Limit(value!, TextLimit);

    /// Dirección de un lugar: aquí el respaldo de Android es la cadena vacía (<c>text(venue.address, "")</c>), que
    /// es lo que hace que la pantalla no pinte la línea.
    public static string Address(string? value) =>
        string.IsNullOrWhiteSpace(value) ? "" : DesktopContact.Limit(value!, TextLimit);
}
