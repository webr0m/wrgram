namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de las listas de miembros: <c>groups.members</c> y <c>groups.members.page</c>
/// (<c>NativeBridge.java:580-581</c> → <c>groupMembers</c>, <c>:2793-2811</c>), <c>groups.members.basic</c>
/// (<c>:582</c> → <c>basicRoster</c>, <c>:2828-2837</c>) y <c>groups.member.ban</c> cuando el chat es un básico
/// (<c>:584</c> → <c>banGroupMember</c> → <c>banBasicMember</c>, <c>:2880-2898</c>). Las reglas y las frases están en
/// <see cref="DesktopGroupMembers"/> y <see cref="DesktopGroupRoster"/>; aquí solo se pide, se funde la caché de
/// personas y se responde en el orden que marcó Android.
/// <para>
/// Antes de esta ronda, ninguna de las cuatro existía en Windows: <c>grep groups\. apps/desktop</c> no devolvía ni
/// una línea, así que las tres lecturas caían en el <c>_ =&gt; throw</c> genérico. Las dos entradas del panel de
/// detalles («Ver miembros» y «Administrar miembros», <c>App.tsx:1272</c>) no llevan guarda de plataforma, de modo
/// que en Windows «Ver miembros» enseñaba la frase genérica y «Administrar miembros» no decía nada —el panel
/// (<c>App.tsx:1434</c>) no captura el rechazo y se quedaba en «Sin miembros para este filtro o búsqueda»—. Dos
/// huecos distintos con la misma causa.
/// </para>
/// <para>
/// Tres diferencias de protocolo mandan aquí, y las tres están dichas en las clases de reglas: MTProto hace la
/// lectura entera del básico en una sola petición —la fila propia viene dentro de la misma lista, así que no hay un
/// <c>GetChatMember</c> aparte (<c>NativeBridge.java:2835</c>)—; para el supergrupo necesita dos, primero
/// <c>channels.getParticipant</c> sobre uno mismo, porque el permiso se comprueba antes de construir la petición, y
/// después <c>channels.getParticipants</c>; y los dos filtros que no admiten texto se filtran en casa sobre la
/// página devuelta.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// Las dos caras de la lista de un supergrupo o canal. El orden es el de <c>groupMembers</c>: forma del chat,
    /// largo de la búsqueda, apretones de desplazamiento y tamaño, permiso propio, y <b>después</b> el filtro —por
    /// eso un filtro malo en una cuenta sin derechos oye <see cref="DesktopGroupMembers.NoRight"/>, que es lo que
    /// hace Android al construir la petición dentro del <c>try</c> de <c>:2696</c> y no antes—.
    /// </summary>
    private async Task<object?> GroupMembersAsync(JsonElement args, bool page)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopGroupMembers.Supported(kind)) throw new BridgeException(DesktopGroupMembers.Unsupported);
        var query = Str(args, "query");
        if (DesktopGroupMembers.TooLong(query)) throw new BridgeException(DesktopGroupMembers.TooLongQuery);
        var key = Str(args, "filter", "recent");
        var offset = DesktopGroupMembers.Offset(Long(args, "offset"));
        var limit = DesktopGroupMembers.Limit(Long(args, "limit", DesktopGroupMembers.MaxLimit));
        var channel = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, channel));
        if (!actor.CanRestrict && !actor.CanPromote) throw new BridgeException(DesktopGroupMembers.NoRight);
        var (filter, serverSearch) = DesktopGroupMembers.Request(key, query);
        var answer = await client.Channels_GetParticipants(channel, filter, offset, limit, 0);
        MergePeers(answer.users?.Values, answer.chats?.Values);
        var searching = query.Trim().Length > 0;
        var rows = new List<object>();
        foreach (var part in answer.participants ?? Array.Empty<ChannelParticipantBase>())
        {
            // Las dos filas que Android tira antes de construir el objeto (`:2698`): la que no es una persona y la
            // propia, que en la pantalla de administración no tiene nada que administrar.
            var person = DesktopGroupMembers.Person(part);
            if (person == null || person == owner) continue;
            var user = _users.GetValueOrDefault(person.Value);
            if (searching && !serverSearch && !DesktopGroupMembers.Matches(user, query)) continue;
            rows.Add(DesktopGroupMembers.Row(part, user, actor, entry.Type == "channel", entry.IsForum == true));
        }
        // `received` es lo que Telegram devolvió, no lo que quedó filtrado: Android cuenta el array entero (`:2699`)
        // y con dos contadores distintos el desplazamiento se correría menos de lo que avanzó la página.
        var received = answer.participants?.Length ?? 0;
        return page ? DesktopGroupMembers.Page(rows, answer.count, offset, received, searching) : rows;
    }

    /// <summary>
    /// La lista entera de un grupo básico (<c>basicRoster</c> + <c>writeRoster</c>). Una sola petición, porque
    /// <c>messages.getFullChat</c> trae los participantes y las personas en la misma respuesta, y la fila propia va
    /// dentro de esa lista: Android pregunta además <c>GetChatMember(self)</c> (<c>:2718</c>) y aquí ese dato ya
    /// está en la que Telegram acaba de dar.
    /// </summary>
    private async Task<object?> BasicRosterAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopGroupRoster.Supported(kind)) throw new BridgeException(DesktopGroupRoster.Unsupported);
        var query = Str(args, "query");
        if (DesktopGroupRoster.TooLong(query)) throw new BridgeException(DesktopGroupRoster.TooLongQuery);
        var parts = await BasicParticipantsAsync(client, entry);
        var ordered = DesktopGroupRoster.Order(parts);
        var inside = DesktopGroupRoster.InsideCount(parts);
        var creator = DesktopGroupRoster.Creator(parts);
        var listed = 0;
        var rows = new List<object>();
        foreach (var part in ordered)
        {
            listed++;
            var person = DesktopGroupRoster.Person(part);
            var user = _users.GetValueOrDefault(person);
            // La búsqueda se aplica sobre el nombre y el usuario sin arroba, que es lo que
            // <c>writeRoster</c> pasa a <c>BasicGroupRoster.matches</c> (<c>NativeBridge.java:2840</c>).
            if (!DesktopGroupRoster.Matches(query, DesktopGroupRoster.Name(user), DesktopGroupRoster.Username(user) ?? "")) continue;
            // El invitador se resuelve contra la misma caché que `MergePeers` llenó con esta respuesta, sin pedir
            // una persona suelta: en un básico quien invita es casi siempre otra fila de la propia lista, y si no
            // está, `Name(null)` da el respaldo de siempre en lugar de inventarse un nombre.
            rows.Add(DesktopGroupRoster.Row(part, user, owner, _users.GetValueOrDefault(DesktopGroupRoster.InviterId(part))));
        }
        return new
        {
            members = rows,
            shown = rows.Count,
            listed,
            inside,
            creator = creator.ToString(CultureInfo.InvariantCulture),
            note = DesktopGroupRoster.Note(creator, listed, inside),
            remaining = DesktopGroupRoster.Remaining(inside),
            order = DesktopGroupRoster.OrderNote,
            manage = DesktopGroupRoster.MayRemove(ordered.FirstOrDefault(part => DesktopGroupRoster.Person(part) == owner)),
            scope = DesktopGroupRoster.Scope
        };
    }

    /// <summary>
    /// <c>groups.member.ban</c> (<c>NativeBridge.java:584</c> → <c>banGroupMember</c>, <c>:2910</c>). Aquí solo está
    /// el camino del básico, que es el que <c>banBasicMember</c> (<c>:2891-2909</c>) abre antes de nada: plazo a
    /// cero, <c>revoke</c> decidido por la persona y <c>messages.deleteChatUser</c>. El estado objetivo se vuelve a
    /// leer, igual que allá se vuelve a preguntar con <c>GetChatMember</c> (<c>:2897-2898</c>); lo que la lista pintaba
    /// hace un minuto no manda.
    /// </summary>
    private async Task<object?> BanBasicMemberAsync(JsonElement args, Client client, ChatEntry entry, long owner)
    {
        var chatId = BasicId(entry);
        // <c>BridgePolicy.id(params,"userId")</c> y el plazo, en el orden de <c>NativeBridge.java:2893-2895</c>.
        var userId = Long(args, "userId");
        var badDuration = DesktopGroupRoster.DurationProblem(Long(args, "duration", 0));
        if (badDuration != null) throw new BridgeException(badDuration);
        var revoke = Bool(args, "deleteMessages");
        var parts = await BasicParticipantsAsync(client, entry);
        var self = parts.FirstOrDefault(part => DesktopGroupRoster.Person(part) == owner);
        var target = parts.FirstOrDefault(part => DesktopGroupRoster.Person(part) == userId);
        var problem = DesktopGroupRoster.BanProblem(self, target, owner, userId);
        if (problem != null) throw new BridgeException(problem);
        var user = _users.GetValueOrDefault(userId);
        if (user == null || user.access_hash == 0) throw new BridgeException(DesktopGroupRoster.NoHash);
        // El título lo pone Android (<c>NativeBridge.java:2902</c>): «Expulsar de » seguido del nombre del chat, y
        // el botón derecho dice «Expulsar», no «Aplicar en Telegram». Por eso se llama a <c>ConfirmPhoto</c> a secas
        // y no a <c>ConfirmCommunity</c>, que fija los rótulos del guardado de la ficha.
        if (!ConfirmPhoto(DesktopGroupRoster.DialogTitle(entry.Title),
                DesktopGroupRoster.Confirm(DesktopGroupRoster.Name(user), revoke),
                DesktopGroupRoster.DialogAccept, null)) return false;
        // La segunda comprobación de cuenta, la de <c>currentAccount()</c> en <c>NativeBridge.java:2905</c>: entre
        // el diálogo y la escritura la persona pudo cambiar de sesión, y expulsar a nombre de otra cuenta no es un
        // error que se pueda deshacer.
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupRoster.ChangedAccount);
        await client.Messages_DeleteChatUser(chatId, new InputUser(userId, user.access_hash), revoke);
        // Android avisa a su propio estado con <c>schedule()</c>; aquí la lista se vuelve a leer cuando la pantalla
        // la pide, y el panel de la ronda Q ya lo hace después de cada expulsión.
        return true;
    }

    /// El brazo único de la expulsión: un básico va por su camino y un canal o supergrupo va por el de las sanciones
    /// (<see cref="SanctionAsync"/>), con la bandera de baneo. La bifurcación es la de <c>banGroupMember</c>
    /// (<c>NativeBridge.java:2910</c>), que entra en <c>banBasicMember</c> (<c>:2881-2899</c>) antes de preguntar
    /// nada más.
    private async Task<object?> BanMemberAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Basic) return await BanBasicMemberAsync(args, client, entry, owner);
        return await SanctionAsync(args, false, client, entry, owner);
    }

    /// Los participantes de un básico, con las personas fusionadas en la caché de la sesión.
    /// <c>chatParticipantsForbidden</c> es la respuesta de Telegram cuando el <c>full info</c> no deja ver la tabla:
    /// se traduce como lista vacía, que es lo que la pantalla leerá con la frase
    /// <see cref="DesktopGroupRoster.Empty"/> —ninguna persona devuelta, ninguna cifra inventada—.
    private async Task<List<ChatParticipantBase>> BasicParticipantsAsync(Client client, ChatEntry entry)
    {
        var page = await client.Messages_GetFullChat(BasicId(entry));
        MergePeers(page.users?.Values, page.chats?.Values);
        if (page.full_chat is not ChatFull full || full.participants is not ChatParticipants list)
            return new List<ChatParticipantBase>();
        return list.participants?.Where(part => part != null).ToList() ?? new List<ChatParticipantBase>();
    }

    /// La fila propia del canal, que es como MTProto contesta a lo que TDLib resuelve con
    /// <c>GetChatMember(chat.id, MessageSenderUser(self))</c> (<c>NativeBridge.java:2809</c>). Sin esta pregunta no
    /// hay forma de saber si la cuenta administra el chat, y sin administración la lista se niega igual que allá.
    private async Task<ChannelParticipantBase?> SelfParticipantAsync(Client client, InputChannel channel)
    {
        var answer = await client.Channels_GetParticipant(channel, new InputPeerSelf());
        MergePeers(answer.users?.Values, answer.chats?.Values);
        return answer.participant;
    }

    /// El <c>InputChannel</c> de la fila, con la misma guarda de forma que el resto del host: la clave prometía un
    /// canal y la caché dice otra cosa, y eso se dice en lugar de mandar la petición a medias.
    private InputChannel ChannelInput(ChatEntry entry) => entry.Input is InputPeerChannel peer
        ? new InputChannel(peer.channel_id, peer.access_hash)
        : throw new BridgeException(DesktopMembership.Stale);

    /// El número del básico, que <c>messages.getFullChat</c> y <c>messages.deleteChatUser</c> piden suelto.
    private static long BasicId(ChatEntry entry) => entry.Input is InputPeerChat basic
        ? basic.chat_id
        : throw new BridgeException(DesktopMembership.Stale);
}
