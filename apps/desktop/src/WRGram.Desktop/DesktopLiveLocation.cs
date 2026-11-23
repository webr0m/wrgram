namespace WRGram.Desktop;

using System;
using TL;

/// <summary>
/// Reglas de la ubicación en directo en Windows (ronda CB). Android hace las tres cosas —enviar, renovar y
/// detener— porque TDLib tiene los tres pedidos y el teléfono tiene sensores: <c>InputMessageLiveLocation</c>
/// (<c>NativeBridge.java:4774</c>), <c>EditMessageLiveLocation</c> con punto nuevo (<c>NativeBridge.java:4815</c>)
/// y <c>EditMessageLiveLocation</c> sin punto (<c>NativeBridge.java:4832</c>). Aquí solo hay con qué detener, y
/// las dos razones son de biblioteca y de sistema, no de pereza.
/// <para>
/// <b>Empezar a compartir no se puede.</b> El proyecto se compila contra <c>net8.0-windows</c>
/// (<c>WRGram.Desktop.csproj:5</c>), que no proyecta <c>Windows.Devices.Geolocation</c>; el otro camino era el
/// navegador embebido, y <c>MainWindow.xaml.cs:134</c> es lo único que toca su entorno —no hay manejador de
/// <c>PermissionRequested</c> que conceda <c>CoreWebView2PermissionKind.Geolocation</c>—, así que la pregunta de
/// <c>navigator.geolocation</c> cae en el deniegue por defecto. Sin posición que leer no hay nada que enviar, y
/// <see cref="NoSensor"/> lo dice en vez de dejar pasar el brazo al <c>_ =&gt; throw</c> genérico, que habla de una
/// «beta» que no es la causa.
/// </para>
/// <para>
/// <b>Renovar tampoco.</b> El sondeo por reflexión del ensamblado no encontró ninguna petición de renovación: los
/// únicos tipos con «Live» son <c>TL.InputMediaGeoLive</c>, <c>TL.MessageMediaGeoLive</c>,
/// <c>TL.UpdateGeoLiveViewed</c>, <c>TL.Methods.Messages_ReportMessagesDelivery</c> y <c>TL.Methods.Stories_StartLive</c>
/// —no están <c>messages.editMessageLiveLocation</c> ni <c>messages.stopMessageLiveLocation</c>—.
/// </para>
/// <para>
/// <b>Detener sí, por otro camino.</b> Lo que la interfaz llama «Dejar de compartir» es un <c>messages.editMessage</c>
/// de toda la vida con un adjunto <c>inputMediaGeoLive</c> que lleva su bit <c>stopped</c>. Los bits medidos sobre
/// <c>InputMediaGeoLive+Flags</c> son <c>stopped=1</c>, <c>has_period=2</c>, <c>has_heading=4</c> y
/// <c>has_proximity_notification_radius=8</c>; en <c>MessageMediaGeoLive+Flags</c> solo existen
/// <c>has_heading=1</c> y <c>has_proximity_notification_radius=2</c>, porque ahí el periodo es un entero obligatorio
/// y no un campo opcional.
/// </para>
/// </summary>
public static class DesktopLiveLocation
{
    /// Gemelo carácter a carácter de <c>LiveLocationPolicy.NOT_SHARING</c> (<c>LiveLocationPolicy.java:50</c>), que
    /// es la frase con la que Android niega las cuatro situaciones que no son una ubicación propia en directo: fila
    /// que no está (<c>NativeBridge.java:4829</c>), contenido que ya no es una ubicación, mensaje recibido y chat
    /// distinto del abierto. Aquí la primera la cubre <c>RequireEntry</c> y las otras tres van juntas por el mismo
    /// motivo, así que la misma frase sirve sin inventar una categoría nueva.
    public const string NotSharing = "No estás compartiendo ninguna ubicación en directo en este chat.";

    /// La negativa de empezar a compartir. No es la del beta genérico: el brazo existe, lo que falta es un sensor del
    /// que fiar una coordenada.
    public const string NoSensor = "Windows no puede leer una ubicación. No se envió ninguna ubicación en directo.";

    /// La regla de la tarjeta, gemela de <c>MessageExtras.java:44</c> (<c>message.isOutgoing &amp;&amp; live.expiresIn &gt; 0</c>):
    /// el botón «Dejar de compartir» solo existe sobre una ubicación propia y mientras le queda tiempo. Que la cifra se
    /// llame <c>expiresIn</c> en un lado y <c>period</c> en el otro no cambia la regla; y el cero sigue significando
    /// «sin cuenta atrás», no «caducó en 1970», igual que en <see cref="DesktopLocation.ExpiresAt"/>.
    public static bool CanStop(bool outgoing, int period) => outgoing && period > 0;

    /// Si la fila es del propio usuario: <c>Message.Flags.out_</c>, la misma bandera con la que
    /// <c>ConvertMessage</c> arma <c>MessageDto.Outgoing</c> (<c>TelegramService.cs:3419</c>).
    public static bool IsOutgoing(TL.Message message) => (message.flags & TL.Message.Flags.out_) != 0;

    /// El tiempo que la ubicación sigue anunciando, con el orden de la librería en la cabeza:
    /// <c>MessageMediaGeoLive</c> deriva de <c>MessageMediaGeo</c>, así que una <c>is</c> sobre la viva antes de tocar
    /// cualquier otra clase geográfica. Cualquier cosa que no sea una ubicación viva devuelve cero, que es lo que hace
    /// que <see cref="CanStop"/> se niegue sin necesidad de un caso aparte.
    public static int Period(MessageMedia? media) => media is MessageMediaGeoLive live ? live.period : 0;

    /// El adjunto con el que se detiene una ubicación. <c>MessageMediaGeoLive.ToInputMedia()</c> devuelve la familia
    /// base <c>InputMedia</c> y rellena <c>geo_point</c>, <c>period</c> y <c>heading</c> —encendiendo
    /// <c>has_period</c> y <c>has_heading</c> cuando los valores vienen—, así que partir de él es la única forma de
    /// conservar el último punto conocido. Encima se pone el bit <c>stopped</c> y se quitan los tres que anuncian una
    /// renovación: un adjunto detenido no tiene periodo, ni rumbo, ni radio de aviso, y dejárselos sería decirle a
    /// Telegram las dos cosas a la vez.
    public static InputMediaGeoLive Stopped(MessageMediaGeoLive live)
    {
        var media = (InputMediaGeoLive)live.ToInputMedia();
        media.flags |= InputMediaGeoLive.Flags.stopped;
        media.flags &= ~(InputMediaGeoLive.Flags.has_period
            | InputMediaGeoLive.Flags.has_heading
            | InputMediaGeoLive.Flags.has_proximity_notification_radius);
        media.period = 0;
        media.heading = 0;
        media.proximity_notification_radius = 0;
        return media;
    }
}
