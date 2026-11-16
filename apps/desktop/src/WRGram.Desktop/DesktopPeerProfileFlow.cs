namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la ficha de perfil: <c>chat.profile</c>, <c>profile.related</c>, <c>profile.peer</c> y
/// <c>profile.contact</c>. Las reglas y las frases están en <see cref="DesktopPeerProfile"/>; aquí solo se pide, se
/// funda la caché de personas y se responde con las claves que la pantalla lee
/// (<c>PeerProfile.tsx:52</c>, <c>:141</c> y <c>App.tsx:729</c>).
/// <para>
/// Hasta esta ronda las cuatro caían en el <c>_ =&gt; throw</c> genérico del host, y la consecuencia se veía en
/// pantalla: la ficha de una persona no se abría desde Windows y la pestaña «Miembros»/«En común» —que Android sí
/// atiende desde <c>NativeBridge.java:1554</c>— se quedaba en el aviso de siempre. La ficha tampoco ofrecía
/// «Administrar miembros» en Windows porque <c>canManageMembers</c> nunca llegó a viajar.
/// </para>
/// <para>
/// Tres lecturas distintas y ninguna inventada: <c>users.getFullUser</c> para una persona,
/// <c>channels.getFullChannel</c> para un canal o supergrupo y <c>messages.getFullChat</c> para un básico. La
/// administración de la comunidad se decide con la misma pregunta que hizo la ronda AX antes de listar
/// (<see cref="SelfParticipantAsync"/> y <see cref="DesktopGroupMembers.Actor"/>), porque MTProto no publica un
/// «puedo administrar yo» en el <c>full info</c>: <c>TL.ChannelFull</c> dice <c>can_view_participants</c> y nada
/// más.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <see cref="DesktopPeerProfile"/>: la ficha pide el chat y Telegram responde según su forma. El orden es el de
    /// <c>chatProfile</c> (<c>NativeBridge.java:1203-1250</c>) —privado, comunidad, básico, y al final el resto—.
    private async Task<object?> ChatProfileAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        return entry.Input switch
        {
            InputPeerUser peer => await PrivateProfileAsync(client, entry, peer),
            InputPeerChannel => await CommunityProfileAsync(client, entry),
            InputPeerChat basic => await BasicProfileAsync(client, entry, basic.chat_id),
            // «Mensajes guardados» y cualquier otro peer: Android cierra con el objeto mínimo de `:1245` y aquí
            // igual, sin prometer ni bio ni derechos que nadie leyó.
            _ => DesktopPeerProfile.PeerRow(entry.Id, entry.Title, entry.Type, entry.Username ?? "", entry.Bot),
        };
    }

    /// <c>GetUserFullInfo</c> + <c>session.user(userId)</c> (<c>:1203-1226</c>). Las dos fuentes siguen siendo dos
    /// en MTProto: la biografía, el cumple y el bloqueo viajan en <c>TL.UserFull</c>; el teléfono, la insignia,
    /// premium y la presencia viajan en el <c>TL.User</c> que la misma respuesta trae.
    private async Task<object?> PrivateProfileAsync(Client client, ChatEntry entry, InputPeerUser peer)
    {
        if (peer.access_hash == 0) throw new BridgeException(DesktopPeerProfile.NoHash);
        var answer = await client.Users_GetFullUser(new InputUser(peer.user_id, peer.access_hash));
        MergePeers(answer.users?.Values, answer.chats?.Values);
        var full = answer.full_user;
        var user = _users.GetValueOrDefault(peer.user_id);
        var names = DesktopPeerProfile.ActiveUsernames(user?.usernames);
        var birth = full?.birthday;
        var bot = full?.bot_info;
        return new
        {
            id = peer.user_id.ToString(),
            title = user != null ? FullName(user) : entry.Title,
            username = names.Count > 0 ? names[0] : user?.MainUsername ?? "",
            usernames = names,
            bio = full?.about ?? "",
            bioEntities = Array.Empty<object>(),
            bot = entry.Bot || On(user?.flags, User.Flags.bot),
            groupCount = full?.common_chats_count ?? 0,
            photo = entry.Photo,
            blocked = On(full?.flags, UserFull.Flags.blocked),
            phone = user?.phone ?? "",
            premium = On(user?.flags, User.Flags.premium),
            verified = On(user?.flags, User.Flags.verified),
            presence = DesktopPeerProfile.Presence(user?.status, DateTime.Now),
            birthday = birth == null ? null : new { day = birth.day, month = birth.month, year = On(birth.flags, Birthday.Flags.has_year) ? birth.year : 0 },
            commands = bot?.commands is { Length: > 0 } list
                ? list.Where(command => command != null).Select(command => new { name = command.command ?? "", description = command.description ?? "" }).ToArray()
                : null,
            privacyUrl = bot?.privacy_policy_url ?? "",
        };
    }

    /// <c>GetBasicGroupFullInfo</c> (<c>:1241-1242</c>): Android saca la cifra y el permiso de la misma tabla de
    /// miembros. Aquí esa tabla solo viene dentro de <c>TL.ChatFull</c>; cuando Telegram ya migró el básico a
    /// comunidad la respuesta es <c>TL.CommunityFull</c>, que no trae tabla, y entonces la cifra la da el propio
    /// <c>TL.Chat.participants_count</c> mientras el permiso se queda en falso: sin tabla no se abre una puerta que
    /// va a devolver una lista vacía.
    private async Task<object?> BasicProfileAsync(Client client, ChatEntry entry, long chatId)
    {
        var page = await client.Messages_GetFullChat(chatId);
        MergePeers(page.users?.Values, page.chats?.Values);
        var table = page.full_chat is ChatFull full ? full.participants as ChatParticipants : null;
        var listed = table?.participants?.Length ?? 0;
        var count = table != null ? listed
            : page.chats?.Values.OfType<Chat>().FirstOrDefault(chat => chat.ID == chatId)?.participants_count ?? 0;
        return new
        {
            id = entry.Id,
            title = entry.Title,
            username = "",
            usernames = new List<string>(),
            bio = page.full_chat switch { ChatFull f => f.about ?? "", CommunityFull c => c.about ?? "", _ => "" },
            bioEntities = Array.Empty<object>(),
            memberCount = count,
            canViewMembers = table != null && listed > 0,
        };
    }

    /// <c>sendPublicChatProfile</c> (<c>:1247-1267</c>). La cifra, la descripción y el permiso de ver la lista salen
    /// de <c>TL.ChannelFull</c>; las banderas del peer (<c>verified</c>, <c>forum</c>) se leen del <c>TL.Channel</c>
    /// que la misma respuesta renueva, que es el equivalente exacto del <c>GetSupergroup</c> de Android. La
    /// administración, no: MTProto no la publica en el full, así que se pregunta al participante propio antes de
    /// responder, igual que <c>groupMembers</c> (<c>:2693</c>). Es una ida a la red más, no un derecho inventado.
    private async Task<object?> CommunityProfileAsync(Client client, ChatEntry entry)
    {
        var channel = ChannelInput(entry);
        var answer = await client.Channels_GetFullChannel(channel);
        MergePeers(answer.users?.Values, answer.chats?.Values);
        var full = answer.full_chat as ChannelFull;
        var peer = answer.chats?.Values.OfType<Channel>().FirstOrDefault(chat => chat.ID == channel.channel_id);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, channel));
        // El testigo de Android (`:1254-1258`): creador, o administrador con `canRestrictMembers` o
        // `canPromoteMembers`. Aquí las dos banderas son `ban_users` y `add_admins`, y el creador ya viene de estado.
        var admin = actor.Creator || actor.CanRestrict || actor.CanPromote;
        var names = DesktopPeerProfile.ActiveUsernames(peer?.usernames);
        return new
        {
            id = entry.Id,
            title = peer?.Title ?? entry.Title,
            username = names.Count > 0 ? names[0] : entry.Username ?? "",
            usernames = names,
            bio = full?.about ?? "",
            bioEntities = Array.Empty<object>(),
            memberCount = full != null && On(full.flags, ChannelFull.Flags.has_participants_count) ? full.participants_count : 0,
            administratorCount = full != null && admin && On(full.flags, ChannelFull.Flags.has_admins_count) ? full.admins_count : 0,
            canViewMembers = full != null && On(full.flags, ChannelFull.Flags.can_view_participants),
            canManageMembers = admin,
            linkedChatId = full != null && On(full.flags, ChannelFull.Flags.has_linked_chat_id) ? full.linked_chat_id.ToString() : "0",
            isForum = peer != null ? On(peer.flags, Channel.Flags.forum) : entry.IsForum == true,
            verified = peer != null && On(peer.flags, Channel.Flags.verified),
            photo = entry.Photo,
        };
    }

    /// <see cref="DesktopPeerProfile"/>: la pestaña «En común» o «Miembros». El orden es el de <c>profileRelated</c>
    /// (<c>NativeBridge.java:1554-1576</c>): recorte del desplazamiento y, según la forma del chat, una de las tres
    /// lecturas o la negación.
    private async Task<object?> RelatedAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        var offset = DesktopPeerProfile.Offset(Long(args, "offset"));
        switch (entry.Input)
        {
            case InputPeerUser peer:
            {
                if (peer.access_hash == 0) throw new BridgeException(DesktopPeerProfile.NoHash);
                var answer = await client.Messages_GetCommonChats(new InputUser(peer.user_id, peer.access_hash),
                    Long(args, "cursor"), DesktopPeerProfile.Page);
                // <c>TL.Messages_Chats</c> solo trae <c>chats</c>: la respuesta no describe personas, describe
                // comunidades, así que no hay caché que fundir y la fila se arma con el peer que Telegram acaba de dar.
                var chats = answer.chats?.Values.ToArray() ?? Array.Empty<ChatBase>();
                var rows = new List<object>();
                foreach (var chat in chats.Where(row => row != null))
                {
                    // La fila que `respondProfilePeer` arma con `dto.chat`: identificador con su forma, título,
                    // usuario público y tipo. El tipo manda en la pantalla: un supergrupo migrado sigue siendo «group».
                    var (id, type) = chat switch
                    {
                        Channel c => ("c" + c.ID, On(c.flags, Channel.Flags.megagroup) ? "group" : "channel"),
                        Chat c => ("g" + c.ID, "group"),
                        _ => ("", "private"),
                    };
                    if (id.Length == 0) continue;
                    rows.Add(DesktopPeerProfile.PeerRow(id, chat.Title, type, (chat as Channel)?.MainUsername ?? "", false));
                }
                // Android marca el final cuando la página vino corta (`:1563`); el cursor es el identificador del
                // último chat devuelto, que en MTProto es el `max_id` de la siguiente petición.
                return new { chats = rows, nextCursor = DesktopPeerProfile.Cursor(chats, rows.Count) };
            }
            case InputPeerChat basic:
            {
                // El básico se corta en casa, como `profileMembers(..., local=true)`: la tabla ya viene entera en
                // `messages.getFullChat` y desplazarse es mirar de la posición `offset` a `offset + 30` (`:1577`).
                var parts = await BasicParticipantsAsync(client, entry);
                var start = Math.Min(offset, parts.Count);
                var end = Math.Min(parts.Count, start + DesktopPeerProfile.Page);
                var rows = new List<object>();
                for (var i = start; i < end; i++)
                {
                    var person = DesktopGroupRoster.Person(parts[i]);
                    if (person == 0L) continue;
                    rows.Add(DesktopPeerProfile.MemberRow(person, DesktopGroupRoster.Name(_users.GetValueOrDefault(person)),
                        DesktopPeerProfile.Role(parts[i])));
                }
                return new { members = rows, nextOffset = end, hasMore = end < parts.Count };
            }
            case InputPeerChannel:
            {
                // El supergrupo pregunta a Telegram con el filtro `recent` de la ronda AX y 30 filas, que es la
                // petición que Android arma en `:1570`. `hasMore` se decide con lo que la respuesta trajo, no con lo
                // que quedó filtrado: aquí no se filtra nada.
                var channel = ChannelInput(entry);
                var (filter, _) = DesktopGroupMembers.Request("recent", "");
                var answer = await client.Channels_GetParticipants(channel, filter, 0, DesktopPeerProfile.Page, 0);
                MergePeers(answer.users?.Values, answer.chats?.Values);
                var received = answer.participants?.Length ?? 0;
                var rows = new List<object>();
                foreach (var part in answer.participants ?? Array.Empty<ChannelParticipantBase>())
                {
                    var person = DesktopGroupMembers.Person(part);
                    if (person == null) continue;
                    rows.Add(DesktopPeerProfile.MemberRow(person.Value, DesktopGroupMembers.Name(_users.GetValueOrDefault(person.Value)),
                        DesktopPeerProfile.Role(part)));
                }
                return new { members = rows, nextOffset = offset + received, hasMore = received == DesktopPeerProfile.Page };
            }
            default: throw new BridgeException(DesktopPeerProfile.NoList);
        }
    }

    /// <c>profile.peer</c> (<c>:524</c>): el chat que la pestaña ya tiene delante. En Windows la fila se arma con la
    /// entrada que <see cref="RequireEntry"/> acaba de reconstruir, sin petición nueva.
    private object? ProfilePeerAsync(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        return DesktopPeerProfile.PeerRow(entry.Id, entry.Title, entry.Type, entry.Username ?? "", entry.Bot);
    }

    /// <c>profile.contact</c> (<c>:527</c>): en TDLib es <c>CreatePrivateChat(userId,false)</c>, que no habla con
    /// Telegram; en MTProto hace falta el par identificador + <c>access_hash</c>, y ese par solo lo tiene la caché
    /// que las propias respuestas van llenando (<c>MergePeers</c>). Cuando la persona no está, se dice en lugar de
    /// mandar un cero.
    private object? ProfileContactAsync(JsonElement args)
    {
        var user = _users.GetValueOrDefault(Long(args, "id"));
        if (user == null || user.access_hash == 0) throw new BridgeException(DesktopPeerProfile.NoHash);
        return DesktopPeerProfile.PeerRow("u" + user.id, FullName(user), "private", user.MainUsername ?? "",
            On(user.flags, User.Flags.bot));
    }

    /// Una bandera de MTProto sobre un <c>flags</c> que puede venir sin respuesta.
    private static bool On<T>(T? flags, T bit) where T : struct, Enum => flags.HasValue && flags.Value.HasFlag(bit);
}
