namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de <c>groups.stats</c> (<c>NativeBridge.java:883</c>): la única petición de estadísticas que las dos capas
/// tienen, con sus dos métodos de MTProto —<c>stats.getBroadcastStats</c> para un canal y
/// <c>stats.getMegagroupStats</c> para un supergrupo— elegidos por la forma que la caché guarda de la fila. Reglas,
/// fichas y frases están en <see cref="DesktopGroupStats"/>; aquí solo viaja la lectura.
/// <para>
/// El orden es el de <c>:863</c> línea por línea: la fila, la forma, la red, la pasada de cuenta y el armado del JSON.
/// Y falta, deliberadamente, un paso que sí tienen los permisos: aquí no se pregunta el derecho antes de ir a la red,
/// porque Android tampoco lo hace. Allá el <c>GetChatStatistics</c> se manda tal cual y el 403 de Telegram cae en
/// <c>GroupChatStats.explain</c>; lo mismo aquí, donde el <c>CHAT_ADMIN_REQUIRED</c> del mismo viaje se traduce en la
/// misma frase. Preguntar de más sería prometer un botón que Android no filtra.
/// </para>
/// <para>
/// Lo que las dos bibliotecas no reparten igual es <i>dónde</i> está el dato, y por eso la forma decide el método y no
/// el revés: TDLib contesta un solo <c>ChatStatistics</c> cuya variante ya trae la clase de chat, mientras MTProto
/// obliga a elegir. De ahí los dos códigos que Android no puede producir —<c>BROADCAST_REQUIRED</c> y
/// <c>MEGAGROUP_REQUIRED</c>—, que son la caché contradicha y se dicen con <see cref="DesktopGroupStats.WrongShape"/>
/// en lugar de reintentar con el otro método: adivinar la forma de la comunidad con dos viajes a la red sería
/// enseñar, cuando toque, la estadística de otra conversación.
/// </para>
/// <para>
/// El <c>dark</c> de los dos métodos vale <c>false</c>, igual que el <c>false</c> del
/// <c>new TdApi.GetChatStatistics(statsChat.id, false)</c> de <c>:863</c>. No es un detalle que se pueda notar: solo
/// tiñe las gráficas, y las gráficas todavía no se dibujan en ninguna de las dos capas.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <c>groups.stats</c> (<c>:863</c>). Una lectura sin paginación ni escritura: no hay marca que mover en el
    /// espejo local, y por eso no hay <c>Apply</c> como en los permisos.
    private async Task<object?> GroupStatsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopGroupStats.Supported(kind)) throw new BridgeException(DesktopGroupStats.NotCommunity);
        var channel = ChannelInput(entry);
        // La forma que la caché tiene de la fila, que es la misma que usa el resto del host para separar canal de
        // supergrupo (<c>DesktopMemberSanctionFlow.cs:201</c>); el <c>Kind</c> de arriba no basta porque los dos son
        // canales a efectos de MTProto.
        var broadcast = entry.Type == "channel";
        Stats_BroadcastStats? channelStats = null;
        Stats_MegagroupStats? groupStats = null;
        try
        {
            if (broadcast) channelStats = await client.Stats_GetBroadcastStats(channel, false);
            else groupStats = await client.Stats_GetMegagroupStats(channel, false);
        }
        catch (RpcException rpc)
        {
            var refusal = DesktopGroupStats.Refusal(rpc.Message);
            if (refusal == null) throw;
            throw new BridgeException(refusal);
        }
        // La pasada del <c>perform</c> de <c>:475</c> envuelta en el callback de <c>:863</c>: la respuesta es de la
        // sesión que la pidió, y el DTO de la otra cuenta no se arma ni se enseña.
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupStats.ChangedAccount);
        var dto = broadcast
            ? (channelStats is null ? null : DesktopGroupStats.Dto(channelStats))
            : (groupStats is null ? null : DesktopGroupStats.Dto(groupStats, user => DesktopGroupRoster.Name(user as User)));
        // El paracaídas de <c>GroupChatStats.dto</c>, que devuelve <c>null</c> cuando TDLib contesta una variante que
        // no es ni canal ni grupo. Aquí el método ya eligió la clase, así que solo cabe una respuesta sin cuerpo.
        if (dto is null) throw new BridgeException(DesktopGroupStats.Broken);
        return dto;
    }
}
