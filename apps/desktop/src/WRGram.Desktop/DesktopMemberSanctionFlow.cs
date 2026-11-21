namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de las cinco escrituras sobre una fila de supergrupo o canal: <c>groups.member.ban</c> y
/// <c>groups.member.restrict</c> (<c>NativeBridge.java:585</c> → <c>banGroupMember</c>, <c>:2879</c>),
/// <c>groups.member.unban</c> (<c>:572</c> → <c>unbanGroupMember</c>, <c>:2846</c>), <c>groups.member.promote</c>
/// (<c>:573</c> → <c>promoteGroupMember</c>, <c>:2765</c>) y <c>groups.member.demote</c> (<c>:570</c> →
/// <c>demoteGroupMember</c>, <c>:2766</c>). Las reglas, las frases y el orden de las guardas están en
/// <see cref="DesktopMemberSanctions"/> y en <see cref="DesktopGroupMembers"/>; aquí solo se lee, se pregunta y se
/// escribe, en las tres fases que marca Android.
/// <para>
/// Hasta esta ronda el host negaba las cuatro con una sola frase (<c>SanctionsPending</c>) y la pantalla escondía
/// los botones. Las peticiones existían en la librería desde la ronda AX —la lectura de la lista ya usaba el mismo
/// <c>channels.getParticipant</c> sobre uno mismo del que sale el <c>Actor</c>—; lo que faltaba era escribir, y
/// escribir es otra responsabilidad: cada una de estas cinco cambia el estado de una persona en un chat real.
/// </para>
/// <para>
/// Tres cosas manda el protocolo por encima de la copia de Android. La primera: cada escritura necesita el
/// <c>access_hash</c> de la persona objetivo, y ese hash solo llega en las respuestas que la traen entera, así que
/// una fila recortada se niega con <see cref="DesktopMemberSanctions.NeedsHash"/> en lugar de mandar un cero. La
/// segunda: sancionar y levantar la sanción son la misma petición (<c>channels.editBanned</c>) con distintas
/// banderas, y promover y despromover son la otra (<c>channels.editAdmin</c>) —la despromoción es esa petición con
/// los derechos vacíos, no un método aparte—. La tercera: borrar el historial de una persona no es un argumento de
/// la sanción sino una petición posterior (<c>channels.deleteParticipantHistory</c>), que es exactamente la
/// situación del <c>DeleteChatMessagesBySender</c> de <c>:2793</c> y el motivo de que allí la sanción pueda quedar
/// aplicada con el borrado fallido.
/// </para>
/// <para>
/// Y una diferencia de interfaz: Android abre su <c>Dialogs</c> nativo dentro del puente; aquí el cuadro lo abre el
/// host con <c>ConfirmPhoto</c>, y en los dos casos la escritura tiene lugar después del sí. La guarda de cuenta que
/// Android escribe como <c>currentAccount() &amp;&amp; session.selfId==answer.owner &amp;&amp;
/// session.activeChat==chat.id</c> se queda en las dos primeras condiciones, porque el host no tiene conversación
/// activa: la pantalla es la que decide a qué chat escribe.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>groups.member.restrict</c>: el mismo brazo que el baneo con la bandera de restricción puesta, menos el
    /// básico, que aquí no se sanciona: <c>banBasicMember</c> contesta <c>restrictProblem</c> (<c>:2775</c>) y esa
    /// es <see cref="DesktopGroupRoster.NoRestrict"/>.
    /// </summary>
    private async Task<object?> RestrictMemberAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Basic)
            throw new BridgeException(DesktopGroupRoster.WriteProblem(kind, DesktopGroupRoster.NoRestrict));
        return await SanctionAsync(args, true, client, entry, owner);
    }

    /// <summary>
    /// Las tres fases de <c>:2793</c>: lo que se sabe sin red (cuenta, plazo, canal), lo que manda leer la fila
    /// propia (los dos derechos) y lo que manda leer la ajena (el estado). Después el cuadro, y solo después la
    /// escritura; el borrado de mensajes, al final y como petición aparte.
    /// </summary>
    private async Task<object?> SanctionAsync(JsonElement args, bool restrict, Client client, ChatEntry entry, long owner)
    {
        // La guarda de forma es lo primero de `:2793`, y aquí solo puede venir lo que `BanMemberAsync` no encaminó
        // a su casa: un canal, un supergrupo o una fila que no es comunidad ninguna.
        if (DesktopMembership.Of(entry.Id) != DesktopMembership.Kind.Channel)
            throw new BridgeException(DesktopMemberSanctions.RequiresSupergroup);
        var channel = IsChannel(entry);
        var userId = Long(args, "userId");
        var duration = Long(args, "duration", DesktopMemberSanctions.DefaultDuration);
        var deleteMessages = Bool(args, "deleteMessages");
        ThrowProblem(DesktopMemberSanctions.BanPreProblem(userId == owner, duration, restrict, channel));
        var input = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, input));
        ThrowProblem(DesktopMemberSanctions.BanRightProblem(actor, channel, deleteMessages));
        var hash = TargetHash(userId);
        var target = await TargetParticipantAsync(client, input, userId, hash);
        ThrowProblem(DesktopMemberSanctions.BanTargetProblem(target));
        var name = DesktopGroupMembers.Name(_users.GetValueOrDefault(userId));
        if (!ConfirmPhoto(DesktopMemberSanctions.BanTitle(restrict, name),
                DesktopMemberSanctions.BanBody(restrict, name, duration, deleteMessages),
                DesktopMemberSanctions.BanAction(restrict), null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopMemberSanctions.ChangedSanction);
        await client.Channels_EditBanned(input, PeerOf(userId, hash), DesktopMemberSanctions.BanRights(restrict, duration));
        if (!deleteMessages) return true;
        // La sanción ya está puesta: si Telegram no deja borrar, se dice el fallo encima de lo que sí pasó, que es
        // literalmente lo que hace el <c>error</c> del <c>:2793</c>.
        try
        {
            await client.Channels_DeleteParticipantHistory(input, PeerOf(userId, hash));
        }
        catch (Exception error)
        {
            throw new BridgeException(DesktopMemberSanctions.RevokeFailed + error.Message);
        }
        return true;
    }

    /// <summary>
    /// <c>groups.member.unban</c> (<c>:568</c> → <c>:2760</c>). En MTProto levantar el baneo y levantar la
    /// restricción son la misma escritura con <c>chatBannedRights</c> vacío; lo que cambia es el rótulo del cuadro,
    /// que sigue diciendo <c>IsBanned</c> de la fila, y el aviso de que no se envía invitación.
    /// </summary>
    private async Task<object?> LiftMemberAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Basic)
            throw new BridgeException(DesktopGroupRoster.WriteProblem(kind, DesktopGroupRoster.UnbanHint));
        var userId = Long(args, "userId");
        ThrowProblem(DesktopMemberSanctions.LiftPreProblem(userId == owner));
        var input = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, input));
        ThrowProblem(DesktopMemberSanctions.LiftRightProblem(actor));
        var hash = TargetHash(userId);
        var target = await TargetParticipantAsync(client, input, userId, hash);
        ThrowProblem(DesktopMemberSanctions.LiftTargetProblem(target));
        var name = DesktopGroupMembers.Name(_users.GetValueOrDefault(userId));
        var title = DesktopMemberSanctions.LiftTitle(DesktopMemberSanctions.IsBanned(target));
        if (!ConfirmPhoto(title, DesktopMemberSanctions.LiftBody(name), title, null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopMemberSanctions.ChangedUnban);
        await client.Channels_EditBanned(input, PeerOf(userId, hash), DesktopMemberSanctions.LiftRights());
        return true;
    }

    /// <summary>
    /// <c>groups.member.promote</c> (<c>:569</c> → <c>:2765</c>). La fila propia decide qué se puede delegar, la
    /// fila ajena decide si se nombra o se edita, y <c>requestedAdminRights</c> decide el conjunto entero con la
    /// puerta del tipo de chat. Aquí eso se traduce en que <c>current</c> son los derechos que Telegram ya tenía
    /// escritos en el <c>channelParticipantAdmin</c>, no los que la pantalla recuerda.
    /// </summary>
    private async Task<object?> PromoteMemberAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Basic)
            throw new BridgeException(DesktopGroupRoster.WriteProblem(kind, DesktopGroupRoster.NoPromote));
        var userId = Long(args, "userId");
        ThrowProblem(DesktopMemberSanctions.PromotePreProblem(userId == owner));
        var input = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, input));
        ThrowProblem(DesktopMemberSanctions.PromoteRightProblem(actor));
        var hash = TargetHash(userId);
        var target = await TargetParticipantAsync(client, input, userId, hash);
        ThrowProblem(DesktopMemberSanctions.PromoteTargetProblem(target));
        var editing = DesktopMemberSanctions.IsEditable(target);
        var current = editing ? RightsOf(target) : null;
        var anonymous = editing && HasAnonymous(target);
        var (rights, problem) = DesktopMemberSanctions.RequestedRights(actor, IsChannel(entry), IsForum(entry),
            RequestedMap(args), current, anonymous);
        ThrowProblem(problem);
        var name = DesktopGroupMembers.Name(_users.GetValueOrDefault(userId));
        var title = DesktopMemberSanctions.PromoteTitle(editing);
        if (!ConfirmPhoto(title,
                DesktopMemberSanctions.PromoteBody(editing, name, rights!),
                DesktopMemberSanctions.PromoteAction(editing), null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopMemberSanctions.ChangedPromote);
        await client.Channels_EditAdmin(input, new InputUser(userId, hash), rights!, null);
        return true;
    }

    /// <summary>
    /// <c>groups.member.demote</c> (<c>:570</c> → <c>:2766</c>). Volver a ser miembro normal es
    /// <c>channels.editAdmin</c> con los derechos vacíos: la despromoción no existe como petición, y por eso la
    /// guarda de Android exige una administración editable antes de escribir nada.
    /// </summary>
    private async Task<object?> DemoteMemberAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Basic)
            throw new BridgeException(DesktopGroupRoster.WriteProblem(kind, DesktopGroupRoster.NoPromote));
        var userId = Long(args, "userId");
        ThrowProblem(DesktopMemberSanctions.DemotePreProblem(userId == owner));
        var input = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, input));
        ThrowProblem(DesktopMemberSanctions.DemoteRightProblem(actor));
        var hash = TargetHash(userId);
        var target = await TargetParticipantAsync(client, input, userId, hash);
        ThrowProblem(DesktopMemberSanctions.DemoteTargetProblem(target));
        var name = DesktopGroupMembers.Name(_users.GetValueOrDefault(userId));
        if (!ConfirmPhoto(DesktopMemberSanctions.DemoteTitle, DesktopMemberSanctions.DemoteBody(name),
                DesktopMemberSanctions.RemoveRole, null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopMemberSanctions.ChangedDemote);
        await client.Channels_EditAdmin(input, new InputUser(userId, hash), DesktopMemberSanctions.NoRights(), null);
        return true;
    }

    /// El <c>InputChannel</c> de la fila, que es el mismo que usa la lectura de la lista: si la caché ya no tiene un
    /// peer de canal, la fila está vieja y se dice con la frase de siempre.
    private static bool IsChannel(ChatEntry entry) => entry.Type == "channel";

    private static bool IsForum(ChatEntry entry) => entry.IsForum == true;

    /// La persona objetivo de una escritura: sin <c>access_hash</c> no hay <c>InputPeerUser</c> ni
    /// <c>InputUser</c> posible, y mandar un cero sería una respuesta de Telegram que ninguna pantalla sabe traducir.
    private long TargetHash(long userId)
    {
        var user = _users.GetValueOrDefault(userId);
        if (user == null || user.access_hash == 0) throw new BridgeException(DesktopMemberSanctions.NeedsHash);
        return user.access_hash;
    }

    private static InputPeerUser PeerOf(long userId, long hash) => new(userId, hash);

    /// La fila ajena, leída de nuevo en lugar de fiarse de la página que pintó el panel —<c>:2793</c> hace un
    /// <c>GetChatMember</c> suyo por la misma razón—, fusionando las personas que traiga por si la caché no conocía
    /// a esta.
    private async Task<ChannelParticipantBase?> TargetParticipantAsync(Client client, InputChannel channel, long userId, long hash)
    {
        var answer = await client.Channels_GetParticipant(channel, PeerOf(userId, hash));
        MergePeers(answer.users?.Values, answer.chats?.Values);
        return answer.participant;
    }

    /// Los derechos escritos en la fila, en las dieciséis claves de la pantalla, o <c>null</c> si la fila no es una
    /// administración con derechos que heredar.
    private static Dictionary<string, bool>? RightsOf(ChannelParticipantBase? part) => part switch
    {
        ChannelParticipantAdmin admin => DesktopGroupMembers.Actor.Current(admin.admin_rights),
        _ => null
    };

    /// El <c>isAnonymous</c> que Android hereda al editar (<c>:2765</c>, última argumento del constructor): la
    /// bandera de MTProto en la fila actual.
    private static bool HasAnonymous(ChannelParticipantBase? part) => part switch
    {
        ChannelParticipantAdmin admin => (admin.admin_rights?.flags & ChatAdminRights.Flags.anonymous) != 0,
        _ => false
    };

    /// Las dieciséis casillas que manda <c>AdminRightsEditor</c>. Android las exige todas
    /// (<c>requiredBool</c>, <c>:2671</c>) y la pantalla las manda todas porque arranca el objeto de
    /// <c>NO_ADMIN_RIGHTS</c>; una ausente solo puede venir de un llamador viejo y vale «no se pide», que es el
    /// lado seguro: se escriben menos derechos, nunca más.
    private static Dictionary<string, bool> RequestedMap(JsonElement args) =>
        DesktopGroupMembers.Actor.Delegable.ToDictionary(entry => entry.Key, entry => Bool(args, entry.Key));

    /// La fase que falló, dicha con la frase de <see cref="DesktopMemberSanctions"/> y no con una de aquí.
    private static void ThrowProblem(string? problem)
    {
        if (problem != null) throw new BridgeException(problem);
    }
}
