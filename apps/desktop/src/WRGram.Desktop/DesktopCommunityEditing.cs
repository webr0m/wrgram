using System;
using System.Text.Json;
using TL;
using WTelegram;

namespace WRGram.Desktop;

/// <summary>
/// Las dos órdenes de la ficha de una comunidad en Windows: leer su nombre y su descripción, y escribir una de las
/// dos. Las reglas y las frases están en <see cref="DesktopCommunityInfo"/>; aquí está el cable, que es lo que
/// faltaba —ninguna de las dos tenía brazo, así que el botón «Nombre y descripción» del menú de escritorio
/// (<c>App.tsx:858</c>, sin guarda de plataforma) caía en el <c>_ =&gt; throw</c> genérico dando a entender que
/// faltaba una petición cuando las cuatro existen en la librería—.
/// <para>
/// El orden es el de <c>NativeBridge.setChatInfo</c> (<c>NativeBridge.java:1919-1943</c>) palabra por palabra: forma
/// del chat, tope del texto nuevo, tope del texto que se creía que había, validación del campo, permiso, comparación
/// con lo que Telegram guarda y, solo al final, la ventana de confirmar. Cambiar ese orden cambia lo que la persona
/// lee: si primero se comparara y después se validara, un título de 300 caracteres se anunciaría como «cambió en
/// otro dispositivo» en lugar de como el exceso que es.
/// </para>
/// <para>
/// La lectura, en cambio, es una sola petición donde Android hace dos. Allá el título sale de la fila y la
/// descripción de un <c>GetBasicGroupFullInfo</c>/<c>GetSupergroupFullInfo</c> aparte (<c>:1808-1818</c>); aquí
/// <c>channels.getFullChannel</c> y <c>messages.getFullChat</c> traen las dos cosas en la misma respuesta
/// (<c>Messages_ChatFull.chats</c> trae el peer renovado). No se duplica la pregunta: si esa lectura falla, el
/// título sigue saliendo de la fila que ya se tenía y <c>descriptionKnown</c> se va en falso, que es exactamente el
/// degradado de Android (<c>:1811</c> y <c>:1817</c>) con una ida a la red menos.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>chat.info</c> (<c>NativeBridge.java:584</c> → <c>chatInfo</c>, <c>:1884-1892</c>). Las seis claves del DTO
    /// son las seis de Android y en el mismo orden que <c>sendCommunity</c> (<c>:1906-1913</c>): <c>title</c>,
    /// <c>description</c>, <c>descriptionKnown</c>, <c>canChange</c>, <c>maxTitle</c>, <c>maxDescription</c>.
    /// </summary>
    private async Task<object?> CommunityInfoAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopCommunityInfo.Supported(kind)) throw new BridgeException(DesktopCommunityInfo.Unsupported);
        var page = await ReadFullAsync(client, entry, kind);
        return new
        {
            title = entry.Title,
            description = DesktopCommunityInfo.Description(page?.full_chat),
            descriptionKnown = DesktopCommunityInfo.Readable(page?.full_chat),
            canChange = DesktopCommunityInfo.CanChange(Renewed(page, entry) ?? _chats.GetValueOrDefault(Number(entry))),
            maxTitle = DesktopCommunityInfo.MaxTitle,
            maxDescription = DesktopCommunityInfo.MaxDescription
        };
    }

    /// <summary>
    /// <c>chat.info.set</c> (<c>NativeBridge.java:585</c> → <c>setChatInfo</c>, <c>:1919-1943</c>). Los dos guardajes
    /// de <c>BridgePolicy.text</c> se copian con sus dos frases distintas, que es lo que Android hace: el texto
    /// nuevo desborda → <see cref="DesktopCommunityInfo.TooLong"/> (<c>:1839</c>); lo que se creía que había no cabe
    /// o no viene → <see cref="DesktopCommunityInfo.Changed"/> (<c>:1841</c>), porque sin esa comparación no se puede
    /// afirmar nada sobre el estado de Telegram.
    /// <para>
    /// El permiso se lee del peer que Telegram mandó con la lista de conversaciones. Android lo pregunta vivo con
    /// <c>GetChatMember</c> (<c>:1845</c>); MTProto no tiene esa pregunta para el propio usuario y la diferencia es
    /// de frescura, no de norma: si la bandera estuviera vieja, la escritura la cobra Telegram con su rechazo, no
    /// este puente con un falso <see cref="DesktopCommunityInfo.NoRight"/>.
    /// </para>
    /// <para>
    /// <c>false</c> es el «Cancelar» de la ventana nativa, igual que en Android (<c>:1890</c> y <c>:1894</c>), y la
    /// pantalla ya sabe traducirlo por «en Telegram no ha cambiado nada».
    /// </para>
    /// </summary>
    private async Task<object?> SetCommunityInfoAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopCommunityInfo.Supported(kind)) throw new BridgeException(DesktopCommunityInfo.Unsupported);
        var value = Raw(args, "value");
        if (value is null || value.Length > DesktopCommunityInfo.BridgeMaximum)
            throw new BridgeException(DesktopCommunityInfo.TooLong);
        var previous = Raw(args, "previous");
        if (previous is null || previous.Length > DesktopCommunityInfo.BridgeMaximum)
            throw new BridgeException(DesktopCommunityInfo.Changed);
        var prepared = DesktopCommunityInfo.Prepared(value);
        var problem = DesktopCommunityInfo.Problem(Str(args, "field"), prepared);
        if (problem is not null) throw new BridgeException(problem);
        if (!DesktopCommunityInfo.CanChange(_chats.GetValueOrDefault(Number(entry))))
            throw new BridgeException(DesktopCommunityInfo.NoRight);
        // Después del `Problem` de Android (`:1843-1844`) solo quedan dos campos posibles: el título y la
        // descripción. Cualquier otro ya se negó con `Ese campo no se puede cambiar desde WRGram.`, así que el
        // branch no vuelve a preguntar por la cadena.
        if (Str(args, "field") == "title")
        {
            var current = DesktopCommunityInfo.Prepared(entry.Title);
            if (DesktopCommunityInfo.Prepared(previous) != current) throw new BridgeException(DesktopCommunityInfo.Changed);
            if (!ConfirmCommunity(DesktopCommunityInfo.TitleBody(current, prepared))) return false;
            if (client.User?.id != owner) throw new BridgeException(DesktopCommunityInfo.ChangedAccount);
            await WriteTitleAsync(client, entry, kind, prepared);
            // La fila de la bandeja lleva el título: Android lo refresca con `schedule()` (`:1850`), y aquí es el
            // propio host quien tiene que moverlo, porque la lista no vuelve a leerse sola.
            entry.Title = prepared;
            foreach (var row in _state.Chats) if (row.Id == entry.Id) row.Title = prepared;
            return true;
        }
        var page = await ReadFullAsync(client, entry, kind);
        if (page is null) throw new BridgeException(DesktopCommunityInfo.Unreadable);
        var stored = DesktopCommunityInfo.Description(page.full_chat);
        if (DesktopCommunityInfo.Prepared(previous) != stored) throw new BridgeException(DesktopCommunityInfo.Changed);
        if (!ConfirmCommunity(DesktopCommunityInfo.DescriptionBody(prepared))) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopCommunityInfo.ChangedAccount);
        await client.Messages_EditChatAbout(entry.Input, prepared);
        return true;
    }

    /// <summary>
    /// La lectura del <c>full info</c>, que es la única petición compartida por los dos flujos. Se traga el error y
    /// devuelve <c>null</c> porque los dos lados lo traducen distinto: la lectura degrada a
    /// <c>descriptionKnown=false</c> y la escritura niega el guardado con <see cref="DesktopCommunityInfo.Unreadable"/>
    /// (<c>NativeBridge.java:1948</c> y <c>:1954</c>). Ninguno de los dos caminos deja pasar el texto de Telegram,
    /// que es lo que Android tampoco hace en este punto.
    /// </summary>
    private static async Task<Messages_ChatFull?> ReadFullAsync(Client client, ChatEntry entry, DesktopMembership.Kind kind)
    {
        try
        {
            if (kind == DesktopMembership.Kind.Basic)
                return entry.Input is InputPeerChat basic ? await client.Messages_GetFullChat(basic.chat_id) : null;
            return entry.Input is InputPeerChannel peer
                ? await client.Channels_GetFullChannel(new InputChannel(peer.channel_id, peer.access_hash))
                : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    /// El peer renovado que viene dentro de la propia respuesta, si viene. Es el equivalente del objeto del que
    /// Android lee <c>chat.title</c> tras su <c>GetChat</c>, con la diferencia de que aquí no hace falta pedirlo.
    private static ChatBase? Renewed(Messages_ChatFull? page, ChatEntry entry) =>
        page?.chats.GetValueOrDefault(Number(entry));

    /// <c>channels.editTitle</c> y <c>messages.editChatTitle</c>: los dos caminos de MTProto para lo que en TDLib es
    /// un único <c>SetChatTitle</c> (<c>NativeBridge.java:1936</c>). La forma del peer decide el camino, y una forma
    /// que no cuadra con la clave de la fila se dice con la frase que ya usa el host para esa contradicción.
    private static async Task WriteTitleAsync(Client client, ChatEntry entry, DesktopMembership.Kind kind, string title)
    {
        if (kind == DesktopMembership.Kind.Basic)
        {
            if (entry.Input is not InputPeerChat basic) throw new BridgeException(DesktopMembership.Stale);
            await client.Messages_EditChatTitle(basic.chat_id, title);
            return;
        }
        if (entry.Input is not InputPeerChannel peer) throw new BridgeException(DesktopMembership.Stale);
        await client.Channels_EditTitle(new InputChannel(peer.channel_id, peer.access_hash), title);
    }

    /// El <c>AlertDialog</c> de <c>confirmCommunity</c> (<c>NativeBridge.java:1974-1980</c>) hecho con la ventana que
    /// el host ya tenía: la misma que levanta el cambio de foto de perfil, con sus dos botones propios y su cierre
    /// por la equis valiendo por «Cancelar». No se escribe una segunda ventana porque no hay nada que cambiarle
    /// salvo el texto y los dos rótulos.
    private static bool ConfirmCommunity(string body) =>
        ConfirmPhoto(DesktopCommunityInfo.DialogTitle, body, DesktopCommunityInfo.DialogAccept, null);

    /// El número del peer, sin descifrar prefijos: la clave ya la fabricó <c>PeerKey</c> al construir la fila.
    private static long Number(ChatEntry entry) => entry.Peer switch
    {
        PeerChat chat => chat.chat_id,
        PeerChannel channel => channel.channel_id,
        _ => 0
    };
}
