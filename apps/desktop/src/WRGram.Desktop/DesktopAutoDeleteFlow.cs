namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la familia S06 en Windows: <c>privacy.autoDelete</c> y <c>chat.autoDelete</c> para leer,
/// <c>privacy.autoDelete.set</c> y <c>chat.autoDelete.set</c> para escribir. Las cuatro llevan en el puente de
/// Android desde <c>BridgePolicy.java:44</c> y se atienden en <c>NativeBridge.java:562-565</c>; en el host de
/// escritorio las cuatro caían en el <c>_ =&gt; throw</c> genérico del despacho, que decía «no disponible en
/// escritorio (beta)» de una función que la librería tiene resuelta desde siempre: el número viaja en las tres
/// respuestas <c>*getFull*</c> —<c>users.getFullUser</c>, <c>messages.getFullChat</c> y
/// <c>channels.getFullChannel</c>, cada una con su <c>ttl_period</c>— y escribir son <c>messages.setHistoryTTL</c>,
/// <c>messages.setDefaultHistoryTTL</c> y su lectura <c>messages.getDefaultHistoryTTL</c>, todo medido por reflexión
/// sobre la 4.4.10. Reglas y frases, en <see cref="DesktopAutoDelete"/>; aquí solo el orden de las peticiones.
/// <para>
/// El orden de la escritura es el de <c>autoDeleteSet</c> (<c>NativeBridge.java:1396-1420</c>) línea por línea: la
/// cuenta, la duración, el estado de antes, el derecho, la ventana, la segunda mirada al estado y solo entonces
/// <c>messages.setHistoryTTL</c>. No es cosmético: si el derecho se mirara después de la ventana, un grupo donde no
/// se puede cambiar nada enseñaría primero un «¿aplicar en Telegram?» que no se va a poder cumplir, y la norma de la
/// ronda BI dice que eso es peor que un aviso. Si la comparación con el valor de antes se saltara, la escritura
/// pisaría el cambio que otra persona hizo mientras la ventana estaba abierta.
/// </para>
/// <para>
/// Tres cosas de Android se quedan fuera, dichas en vez de imitadas. Los chats secretos: TDLib los conoce y MTProto
/// no, así que las dos frases de <c>:1343</c> y <c>:1367</c> no tienen quién las diga. El derecho de una comunidad,
/// que allá es un <c>GetChatMember</c> vivo y aquí son las banderas del peer que la propia respuesta trae
/// (<see cref="DesktopCommunityInfo.CanChange"/>) —la misma diferencia de frescura que declaró la ronda AW, con la
/// misma consecuencia: si la bandera estuviera vieja, lo cobra Telegram con su rechazo, no este puente con un
/// «no tienes permiso» inventado—. Y la guarda de cuenta: Android la repite al entrar en cada respuesta asíncrona
/// (<c>NativeBridge.java:488</c>)
/// además de en el botón positivo (<c>:1392</c>); aquí la sesión no puede cambiarse a mitad de una petición —la
/// multitarea de cuentas se niega en el propio despacho—, así que basta la del botón, que es la que nombra al
/// temporizador.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// La primera línea de los cuatro métodos de Android: <c>AccountSafetyPolicy.owner</c>
    /// (<c>AccountSafetyPolicy.java:10-12</c>). El panel manda el identificador de la cuenta que pintó, y si la sesión
    /// del host ya no es esa —o no hay sesión— la orden se niega con la frase de Android antes de tocar nada, igual
    /// que allá. No cuesta ninguna petición: se resuelve con la sesión que el host ya tiene.
    /// </summary>
    private static void RequireAutoDeleteAccount(JsonElement args, Client client)
    {
        var self = client.User?.id ?? 0;
        if (self <= 0 || !DesktopAutoDelete.Owns(args, self.ToString()))
            throw new ArgumentException(DesktopAutoDelete.WrongAccount);
    }

    /// <summary>
    /// <c>autoDeleteGet</c> (<c>NativeBridge.java:1381-1395</c>). El modo predeterminado es una sola pregunta y
    /// <c>canChange:true</c>, igual que <c>:1340</c>: el ajuste vive en la cuenta, no en un chat, y no hay derecho que
    /// comprobar. El modo por conversación son las dos formas de <see cref="AutoDeleteStateAsync"/>.
    /// </summary>
    private async Task<object?> AutoDeleteReadAsync(JsonElement args, bool chatMode)
    {
        var client = CollectionClient();
        RequireAutoDeleteAccount(args, client);
        if (!chatMode) return DesktopAutoDelete.Dto((await client.Messages_GetDefaultHistoryTTL()).period, true);
        var (seconds, canChange) = await AutoDeleteStateAsync(client, RequireEntry(Str(args, "id")));
        return DesktopAutoDelete.Dto(seconds, canChange);
    }

    /// <summary>
    /// <c>autoDeleteSet</c> (<c>NativeBridge.java:1396-1420</c>) más sus dos confirmaciones
    /// (<c>confirmChatAutoDelete</c>, <c>:1422</c>, y <c>confirmAutoDelete</c>, <c>:1431</c>). El <c>false</c> es el
    /// «Cancelar» de la ventana (<c>:1410</c>) y su cierre por la equis (<c>:1414</c>): la interfaz ya lo traduce por
    /// «en Telegram no ha cambiado nada» y conserva el número que la persona había escrito.
    /// <para>
    /// Que la respuesta final vuelva a leerse en Telegram en vez de devolver el número que se acaba de mandar es lo
    /// que hace <c>:1383</c> con su tercer <c>GetChat</c>, y aquí hace todavía más falta: <c>setHistoryTTL</c>
    /// responde un <c>Updates</c>, no el estado del chat. Si la escritura y la lectura no hubieran quedado de acuerdo
    /// por el motivo que sea, el panel pinta lo que Telegram guarda, no lo que se le pidió.
    /// </para>
    /// </summary>
    private async Task<object?> AutoDeleteWriteAsync(JsonElement args, bool chatMode)
    {
        var client = CollectionClient();
        RequireAutoDeleteAccount(args, client);
        var owner = client.User?.id ?? 0;
        var seconds = DesktopAutoDelete.Seconds(args);
        if (!chatMode)
        {
            var before = await client.Messages_GetDefaultHistoryTTL();
            if (!ConfirmAutoDelete(DesktopAutoDelete.DialogTitle(DesktopAutoDelete.NewChats), seconds)) return false;
            if (client.User?.id != owner) throw new BridgeException(DesktopAutoDelete.ChangedAccount);
            var current = await client.Messages_GetDefaultHistoryTTL();
            if (current.period != before.period) throw new BridgeException(DesktopAutoDelete.DefaultChanged);
            await client.Messages_SetDefaultHistoryTTL(seconds);
            return DesktopAutoDelete.Dto((await client.Messages_GetDefaultHistoryTTL()).period, true);
        }
        var entry = RequireEntry(Str(args, "id"));
        var (previous, canChange) = await AutoDeleteStateAsync(client, entry);
        // La frase la decide la forma del peer, que es lo que decide la rama en `:1369` (`Telegram no permite…`) y en
        // `:1373` (`Necesitas permiso…`): en un particular no hay derecho que leer, hay un chat que no lo admite.
        if (!canChange)
            throw new BridgeException(entry.Peer is PeerUser ? DesktopAutoDelete.NotAllowedHere : DesktopAutoDelete.NoRight);
        if (!ConfirmAutoDelete(DesktopAutoDelete.DialogTitle(entry.Title), seconds)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopAutoDelete.ChangedAccount);
        var (now, _) = await AutoDeleteStateAsync(client, entry);
        if (now != previous) throw new BridgeException(DesktopAutoDelete.Changed);
        await client.Messages_SetHistoryTTL(entry.Input, seconds);
        var (applied, _) = await AutoDeleteStateAsync(client, entry);
        return DesktopAutoDelete.Dto(applied, true);
    }

    /// <summary>
    /// Las dos preguntas que comparten la lectura y la escritura, resueltas en una sola ida a la red: cuánto vale el
    /// temporizador de esta conversación y si se puede cambiar. Las dos salen de la misma respuesta, y es la
    /// diferencia de forma con Android, que para saber el derecho tiene que hacer un <c>GetChatMember</c> aparte
    /// (<c>:1348</c>).
    /// <para>
    /// Un particular se lee con <c>users.getFullUser</c>, que es la única respuesta de MTProto donde viaja el
    /// <c>ttl_period</c> de una conversación uno a uno; el derecho, en cambio, no se lee de ningún sitio: es la
    /// comparación de identificadores de <c>:1347</c>, con su <c>777000</c> incluido. Una comunidad se lee por el
    /// mismo camino que la ficha de <c>chat.info</c> —<c>messages.getFullChat</c> o
    /// <c>channels.getFullChannel</c> según la forma del peer— y su respuesta se fusiona en la caché del host antes
    /// de mirar las banderas, para que el derecho se juzgue sobre el peer que Telegram acaba de pintar.
    /// </para>
    /// </summary>
    private async Task<(int Seconds, bool CanChange)> AutoDeleteStateAsync(Client client, ChatEntry entry)
    {
        if (entry.Peer is PeerUser privatePeer)
        {
            var answer = await client.Users_GetFullUser(PrivateInput(entry));
            MergePeers(answer.users?.Values, answer.chats?.Values);
            if (answer.full_user is null) throw new BridgeException(DesktopAutoDelete.Unreadable);
            return (answer.full_user.ttl_period,
                DesktopAutoDelete.CanChangePrivate(privatePeer.user_id, client.User?.id ?? 0));
        }
        var page = await ReadFullAsync(client, entry, DesktopMembership.Of(entry.Id))
            ?? throw new BridgeException(DesktopAutoDelete.Unreadable);
        MergePeers(null, page.chats?.Values);
        var period = DesktopAutoDelete.Period(page.full_chat) ?? throw new BridgeException(DesktopAutoDelete.Unreadable);
        return (period, DesktopCommunityInfo.CanChange(Renewed(page, entry) ?? _chats.GetValueOrDefault(Number(entry))));
    }

    /// La ventana de <c>confirmAutoDelete</c> (<c>NativeBridge.java:1431-1439</c>) con la misma WPF que ya levantan
    /// la foto del perfil y el rename de la comunidad: el título lleva el recorte de <c>:1389</c>, el cuerpo es el de
    /// <c>:1388</c> y los dos botones, los rótulos de <c>:1390</c> y <c>:1391</c>.
    private static bool ConfirmAutoDelete(string title, int seconds) =>
        ConfirmPhoto(title, DesktopAutoDelete.Body(seconds), DesktopAutoDelete.Accept, null);

    /// El <c>InputPeerUser</c> de la fila, devuelto a la forma que pide <c>users.getFullUser</c>. «Mensajes
    /// guardados» se arma como <c>InputPeerSelf</c> en <c>EntryFromPeer</c>, y esa es también la forma válida —y la
    /// que no necesita hash— para preguntarse a una misma.
    private static InputUserBase PrivateInput(ChatEntry entry) => entry.Input switch
    {
        InputPeerSelf => new InputUserSelf(),
        InputPeerUser user => new InputUser(user.user_id, user.access_hash),
        _ => throw new BridgeException(DesktopMembership.Stale)
    };
}
