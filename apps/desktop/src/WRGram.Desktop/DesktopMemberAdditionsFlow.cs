namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using System.Text.RegularExpressions;
using TL;
using WTelegram;

/// <summary>
/// El cable de la firma de invitación: <c>groups.add.info</c> (<c>NativeBridge.java:2136</c>) y
/// <c>groups.member.add</c> (<c>:2154</c>). Las reglas y las frases están en <see cref="DesktopMemberAdditions"/>;
/// aquí se lee el estado propio, se pregunta permiso, se confirma en ventana y se ejecuta la tanda de una en una,
/// que es el orden de <c>runAdd</c> (<c>:2118</c>).
/// <para>
/// Hasta esta ronda las dos caían en el <c>_ =&gt; throw</c> genérico del host, y la pantalla ya estaba puesta:
/// el menú «Añadir personas» (<c>App.tsx:916</c>) no lleva guarda de plataforma, así que en Windows abrir el panel
/// enseñaba el aviso de error genérico en lugar de la lista de personas. Es el mismo hueco que declararon las
/// rondas AX, AZ y BA, y el último que quedaba en la familia C10.
/// </para>
/// <para>
/// Dos peticiones en vez de una, y las dos fuera del envoltorio cómodo de la librería: <c>messages.addChatUser</c>
/// sí tiene helper (<see cref="WTelegram.Client.AddChatUser(InputPeer,InputUserBase)"/>) pero sin el campo de
/// historial, así que se manda la petición a mano por <c>TL.Methods.Messages_AddChatUser</c>, que sí trae
/// <c>fwd_limit</c>; y <c>channels.inviteToChannel</c> no tiene helper ninguno, solo la clase de petición, que
/// viaja por <c>Client.Invoke</c>. La medida es de la sonda sobre WTelegramClient 4.4.10, no de la documentación.
/// </para>
/// <para>
/// Android añade de una en una porque su <c>AddChatMember</c> es de una en una. MTProto acepta un vector en
/// <c>channels.inviteToChannel</c>, y aquí se le manda igual un solo nombre: el informe es por persona, la cola se
/// corta en la persona que falló fuerte y las dos cosas se perderían juntando la tanda en un viaje. Es una
/// decisión de contrato, no de protocolo, y está dicha en la prueba.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <c>addInfo</c> (<c>:2050-2061</c>). No es una orden que se niegue: un chat donde no se puede invitar
    /// responde <c>allowed:false</c> con su motivo, que es como la pantalla pinta la nota en lugar del botón.
    private async Task<object?> AddInfoAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopMemberAdditions.Applicable(kind))
            return DesktopMemberAdditions.Info(false, DesktopMemberAdditions.Unsupported, false, -1);
        var (problem, members) = await AddContextAsync(client, entry, kind);
        return DesktopMemberAdditions.Info(problem == null, problem ?? "",
            problem == null && DesktopMemberAdditions.ForwardsHistory(kind),
            DesktopMemberAdditions.Remaining(kind, members));
    }

    /// <c>addContext</c> (<c>:2036-2047</c>): el estado propio y la cifra que manda la regla del lleno. Las dos
    /// preguntas son locales en Android —TDLib las tiene en su base— y valen una ida a la red aquí, que es lo que
    /// MTProto ofrece: <c>messages.getFullChat</c> para un básico y <c>channels.getParticipant(self)</c> para un
    /// canal. La cifra del canal no se pide: el lleno solo existe en el básico, y pedirla sería gastar una tercera
    /// llamada por un número que <see cref="DesktopMemberAdditions.Remaining"/> devuelve en <c>-1</c> de todas formas.
    private async Task<(string? Problem, int Members)> AddContextAsync(Client client, ChatEntry entry, DesktopMembership.Kind kind)
    {
        var owner = client.User?.id ?? 0;
        if (kind == DesktopMembership.Kind.Basic)
        {
            var chatId = BasicId(entry);
            var parts = await BasicParticipantsAsync(client, entry);
            var self = parts.FirstOrDefault(part => DesktopGroupRoster.Person(part) == owner);
            // La cabecera `chat` la renueva la propia respuesta, fusionada por `BasicParticipantsAsync`: ahí están
            // los dos datos que TDLib guarda en `BasicGroup` —`migrated_to` y `participants_count`—.
            var row = _chats.GetValueOrDefault(chatId) as Chat;
            var migrated = row != null && On(row.flags, Chat.Flags.has_migrated_to) && row.migrated_to != null;
            var members = row?.participants_count ?? -1;
            // En un básico no hay fila de sanción que leer: quien fue expulsado sale de la tabla y se cuenta como
            // fuera, que es el `ChatMemberStatusLeft` de allá. El bloqueo, por tanto, solo se puede probar en un canal.
            return (DesktopMemberAdditions.Problem(kind, migrated, members, DesktopMemberAdditions.Inside(self), false,
                DesktopMemberAdditions.MayInvite(self)), members);
        }
        var actor = await SelfParticipantAsync(client, ChannelInput(entry));
        return (DesktopMemberAdditions.Problem(kind, false, -1, DesktopMemberAdditions.Inside(actor),
            DesktopMemberAdditions.Blocked(actor), DesktopMemberAdditions.MayInvite(actor)), -1);
    }

    /// <c>addMembers</c> (<c>:2068-2096</c>). El orden de los cortafuegos es el del puente, y es la prueba:
    /// identificador inválido, lote, margen, permiso y solo después el cuadro. Adelantar el lote haría que una
    /// lista de veinticinco con un identificador mal escrito oyera «selecciona hasta 20» en lugar de la verdad.
    private async Task<object?> AddMembersAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        var raw = Arr(args, "userIds");
        if (raw.Any(value => !DesktopMemberAdditions.Positive(value))) throw new BridgeException(DesktopMemberAdditions.BadId);
        // El segundo paso de `:2076-2077`: un identificador que cabe en el texto pero no en un `long` tampoco es de
        // Telegram, y el puente lo dice con la misma palabra. Sin esta comprobación, `Unique` lo tiraría en silencio
        // y la tanda se ejecutaría con menos personas de las que la pantalla eligió.
        if (raw.Any(value => !long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out _))) throw new BridgeException(DesktopMemberAdditions.BadId);
        var wanted = DesktopMemberAdditions.Unique(raw, owner);
        var batch = DesktopMemberAdditions.Batch(wanted.Count);
        if (batch != null) throw new BridgeException(batch);
        var asked = Str(args, "forwardLimit");
        if (asked.Length > 0 && !Regex.IsMatch(asked, "^[0-9]{1,3}$")) throw new BridgeException(DesktopMemberAdditions.BadForward);
        var requested = asked.Length == 0 ? 0 : int.Parse(asked, CultureInfo.InvariantCulture);
        var range = DesktopMemberAdditions.ForwardProblem(requested);
        if (range != null) throw new BridgeException(range);
        var (problem, _) = await AddContextAsync(client, entry, kind);
        if (problem != null) throw new BridgeException(problem);
        var forward = DesktopMemberAdditions.ForwardLimit(kind, requested);
        var people = wanted.Select(value => long.Parse(value, CultureInfo.InvariantCulture)).ToList();
        // El cuadro de `confirmAdd` (<c>:2098-2116</c>): los tres primeros nombres, el título recortado y la frase
        // de historial solo cuando el historial viaja. Cerrar la ventana vale por «Cancelar», como allá.
        if (!ConfirmPhoto(DesktopMemberAdditions.DialogTitle,
                DesktopMemberAdditions.DialogBody(people.Select(id => DesktopMemberAdditions.DialogName(_users.GetValueOrDefault(id))),
                    entry.Title, forward),
                DesktopMemberAdditions.DialogTitle, null))
            return DesktopMemberAdditions.Answer(new List<object>(), DesktopMemberAdditions.Cancelled);
        var rows = await RunAddAsync(client, kind, entry, people, forward, owner);
        return DesktopMemberAdditions.Answer(rows.Rows, rows.Stopped);
    }

    /// <c>runAdd</c> (<c>:2118-2144</c>) hecho con un <c>foreach</c> en lugar de la cola de callbacks de TDLib, que
    /// es la única libertad que se toma aquí: la persona se añade, se mira si la respuesta la nombró entre las que
    /// no entraron y, si no, se pregunta su estado. Un fallo fuerte corta la tanda y se dice dónde quedó, con las
    /// filas que ya había.
    private async Task<(List<object> Rows, string Stopped)> RunAddAsync(Client client, DesktopMembership.Kind kind,
        ChatEntry entry, List<long> people, int forward, long owner)
    {
        var rows = new List<object>();
        foreach (var id in people)
        {
            // La primera de las dos guardas de cuenta (<c>:2122</c>), antes de cada persona: entre el cuadro y la
            // firma, y entre firma y firma, la sesión pudo cambiar, y añadir a nombre de otra cuenta no se deshace.
            if (client.User?.id != owner) return (rows, DesktopMemberAdditions.ChangedAccount);
            var user = _users.GetValueOrDefault(id);
            if (user == null || user.access_hash == 0)
            {
                // Windows no puede inventar el `access_hash` de quien nunca vino en una respuesta. No se manda nada
                // a medias y no se corta la tanda: esta persona se nombra sin preguntar y la cola sigue.
                rows.Add(DesktopMemberAdditions.Row(id, DesktopMemberAdditions.Name(user), DesktopMemberAdditions.Unclear,
                    DesktopMemberAdditions.NeedsHash));
                continue;
            }
            Messages_InvitedUsers answer;
            try
            {
                answer = kind == DesktopMembership.Kind.Basic
                    ? await client.Invoke(new TL.Methods.Messages_AddChatUser
                    {
                        chat_id = BasicId(entry),
                        user_id = new InputUser(id, user.access_hash),
                        fwd_limit = forward,
                    })
                    : await client.Invoke(new TL.Methods.Channels_InviteToChannel
                    {
                        channel = ChannelInput(entry),
                        users = new InputUserBase[] { new InputUser(id, user.access_hash) },
                    });
            }
            catch (Exception error)
            {
                // El `rejected ->` de `:2140-2143`: la fila entra sin confirmar con el texto de Telegram y la cola
                // se corta con ese mismo texto, porque seguiría fallando sobre lo mismo.
                var message = error.Message ?? "";
                rows.Add(DesktopMemberAdditions.Row(id, DesktopMemberAdditions.Name(user), DesktopMemberAdditions.Unclear, message));
                return (rows, message);
            }
            if (answer.updates is Updates update) MergePeers(update.users?.Values, update.chats?.Values);
            var named = DesktopMemberAdditions.Named(answer, id);
            if (named != null)
            {
                rows.Add(DesktopMemberAdditions.Row(id, DesktopMemberAdditions.Name(_users.GetValueOrDefault(id)),
                    DesktopMemberAdditions.Rejected, DesktopMemberAdditions.Reason(named)));
                continue;
            }
            // La respuesta buena no nombra a quien entró. Se vuelve a leer el estado, que es el
            // <c>GetChatMember</c> de <c>:2130</c>, y solo entonces se dice «añadido».
            var inside = await AddedAsync(client, kind, entry, id);
            var state = DesktopMemberAdditions.Outcome(null, inside);
            rows.Add(DesktopMemberAdditions.Row(id, DesktopMemberAdditions.Name(_users.GetValueOrDefault(id)), state,
                state == DesktopMemberAdditions.Added ? "" : DesktopMemberAdditions.Unconfirmed));
        }
        return (rows, "");
    }

    /// <c>GetChatMember</c> sobre la persona recién firmada (<c>:2130</c>). En un básico la única forma de volver a
    /// leer la tabla es <c>messages.getFullChat</c> —no hay pregunta por persona—; en un canal sí la hay, y es la
    /// misma que hizo la ronda AX para el propio participante.
    private async Task<bool> AddedAsync(Client client, DesktopMembership.Kind kind, ChatEntry entry, long id)
    {
        if (kind == DesktopMembership.Kind.Basic)
        {
            var parts = await BasicParticipantsAsync(client, entry);
            return DesktopMemberAdditions.Inside(parts.FirstOrDefault(part => DesktopGroupRoster.Person(part) == id));
        }
        var user = _users.GetValueOrDefault(id);
        if (user == null || user.access_hash == 0) return false;
        var page = await client.Channels_GetParticipant(ChannelInput(entry), new InputPeerUser(id, user.access_hash));
        MergePeers(page.users?.Values, page.chats?.Values);
        return DesktopMemberAdditions.Inside(page.participant);
    }
}
