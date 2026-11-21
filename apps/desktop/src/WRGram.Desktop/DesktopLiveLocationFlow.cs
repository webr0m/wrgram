namespace WRGram.Desktop;

using System;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la ubicación en directo en Windows (ronda CB): un brazo que niega con su causa y otro que funciona.
/// <c>location.live.start</c> se niega en el propio despacho por lo dicho en <see cref="DesktopLiveLocation.NoSensor"/>
/// —sin lector de posición no hay nada que enviar, y el <c>_ =&gt; throw</c> genérico diría «beta» donde la causa es el
/// sensor—; <c>location.live.stop</c> es <c>messages.editMessage</c> con el adjunto detenido, que la librería sí tiene.
/// <para>
/// El orden del brazo que funciona es el de <c>stopLiveLocation</c> (<c>NativeBridge.java:4825-4833</c>): requireAccount
/// y «no hay conversación abierta» van antes que todo y aquí los hacen <c>CollectionClient</c> y <c>RequireEntry</c>;
/// después viene la fila, y las tres formas de no-ser-una-ubicación-propia-en-directo (no está, no es una ubicación
/// viva, es de otra persona) se niegan juntas con la misma frase de Android (<c>NativeBridge.java:4829</c>); luego el
/// tiempo agotado (<c>NativeBridge.java:4830</c>). La única comprobación que Android no hace es la del punto: TDLib lo
/// lleva siempre, pero aquí el <c>geo_point</c> del adjunto es obligatorio y una fila sin coordenadas no se puede
/// reconstruir. Las dos negativas comparten la constante <see cref="DesktopLocation.Gone"/> porque Android repite la
/// misma cadena escrita en las dos partes —<c>NativeBridge.java:421</c> y <c>NativeBridge.java:4830</c>—; unirse aquí
/// es lo que evita que las dos se separen cuando alguien cambie una.
/// </para>
/// <para>
/// Lo que no copia este brazo es el estado local de Android. <c>NativeBridge.java:4831</c> apaga su rastreador antes
/// de escribir porque el teléfono es quien renueva; aquí no hay nada que apagar —no hay rastreador que renovar—, y por
/// eso la orden consiste en una sola petición. Tampoco hay que fiarse de la caché: la tarjeta se arma con la fila que
/// estaba en memoria, pero detener se hace sobre la que se releé, que es la costumbre de este host cuando el argumento
/// es un id de mensaje suelto (ver <see cref="OpenLocationAsync"/>).
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <c>stopLiveLocation</c> (<c>NativeBridge.java:4825</c>) en su única forma posible por MTProto con esta
    /// librería: releer la fila, decidir con <see cref="DesktopLiveLocation"/> y editar el adjunto. El
    /// <c>random_id</c> que TDLib pide para toda escritura no existe aquí —<c>messages.editMessage</c> lo ignora—, así
    /// que no hay nada que sortear entre las dos capas.
    private async Task<object?> StopLiveLocationAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var id = Long(args, "id");
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        var row = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == id);
        if (row?.media is not MessageMediaGeoLive live || !DesktopLiveLocation.IsOutgoing(row))
            throw new BridgeException(DesktopLiveLocation.NotSharing);
        if (DesktopLiveLocation.Period(row.media) <= 0) throw new BridgeException(DesktopLocation.Gone);
        if (!DesktopLocation.Valid(live.geo)) throw new BridgeException(DesktopLocation.Gone);
        try
        {
            await client.Messages_EditMessage(entry.Input, (int)id, media: DesktopLiveLocation.Stopped(live));
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        _dialogsDirty = true;
        Push();
        return true;
    }
}
