namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la gestión de enlaces de invitación: las cuatro órdenes (<c>chat.invitelinks</c>,
/// <c>chat.invitelink.create</c>, <c>chat.invitelink.edit</c> y <c>chat.invitelink.revoke</c>) que Android despacha en
/// <c>NativeBridge.java:761-764</c> y atienden <c>inviteLinks</c> (<c>:3640</c>), <c>inviteLinkForm</c>
/// (<c>:3676</c>) —los dos primeros caminos— y <c>revokeInviteLink</c> (<c>:3734</c>). Reglas, techos, frases y
/// cuerpos de diálogo están en <see cref="DesktopLinkManager"/>; aquí está
/// el cable, que es lo que faltaba: las cuatro llevan desde la ronda A en la lista del puente
/// (<c>BridgePolicy.java:49</c>) y la pantalla las pide desde la ronda G, pero en Windows la entrada
/// «Mis enlaces de invitación» estaba tapada con <c>!desktop</c> y, de haberse abierto, la primera pregunta habría
/// caído en el <c>_ =&gt; throw</c> genérico dando a entender que faltaba una petición cuando las cuatro existen.
/// <para>
/// El orden de guardas es el del puente, y es la prueba de que este archivo existe: forma, marcador, cuenta, enlace,
/// nombre, caducidad, límite, aprobación, permiso, primacía, creador y solo al final la ventana de confirmar.
/// Adelantar el permiso al principio de <c>inviteLinkForm</c>, como hace <c>inviteLinks</c>, haría que un formulario
/// mal escrito en un chat que sí se administrara oyera primero «no tienes permiso» y después nada, porque la orden ya
/// se habría cortado.
/// </para>
/// <para>
/// Dos idas a la red más por pedido, escritas en lugar de fingidas. La primera es el <c>full info</c>, que hay que
/// leer para saber qué enlace es el principal: TDLib trae <c>isPrimary</c> dentro de la fila y MTProto no, así que
/// Windows compara con <c>ChannelFull.exported_invite</c> o <c>ChatFull.exported_invite</c>
/// (<c>DesktopLinkManager.cs:375-376</c>). La segunda solo aparece en el crear y en el editar, y es que Android
/// pregunta el permiso con un <c>GetChatMember</c> vivo y aquí la pregunta es <c>channels.getParticipant(self)</c>
/// en un canal o la tabla de <c>messages.getFullChat</c> en un básico —las dos lecturas que ya usan las rondas BB
/// y BE con el mismo gasto—. Ninguna de las dos inventa un dato: la consecuencia de que la bandera estuviera vieja
/// la cobra Telegram con su rechazo, no este puente con un falso <see cref="DesktopLinkManager.NoRightEdit"/>.
/// </para>
/// <para>
/// Y una diferencia de estado, dicha: Android recuerda el marcador que repartió y lo compara con el que le llegan
/// (<c>linkOwner</c> contra <c>session.selfId</c> en <c>NativeBridge.java:3647</c>); aquí la posición es un argumento
/// de <c>messages.getExportedChatInvites</c>, no una memoria del
/// cliente, así que no hay nada que pueda estar viejo ni frase que decir. Por el mismo motivo, después de escribir
/// tampoco hay cursor que limpiar ni lista que refrescar con <c>schedule()</c>: el panel vuelve a pedir la primera
/// página él solo (<c>InviteLinksPanel.tsx:68</c>).
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>createInviteLink</c> (<c>NativeBridge.java:1907</c>, despachado en <c>:694</c>): el enlace suelto que la
    /// pantalla pide sin formulario, con el nombre fijo <see cref="DesktopLinkManager.DefaultLabel"/>, siete días y sin
    /// límite de participantes. Cuatro cosas de este camino son distintas del de <see cref="InviteLinkFormAsync"/> y
    /// las cuatro vienen de Java, no de gusto: la negativa de forma es otra frase
    /// (<see cref="DesktopLinkManager.NotCreatable"/>), el diálogo se pregunta con sus dos cadenas propias
    /// (<see cref="DesktopLinkManager.QuickBody"/> y <see cref="DesktopLinkManager.QuickAccept"/>, no
    /// <see cref="DesktopLinkManager.FormBody"/> ni el «Aplicar en Telegram» de <c>confirmLink</c>), no llega
    /// <c>accountId</c> porque el puente java no lo lee aquí, y al final no hay relectura ni primacía que comprobar:
    /// se crea, se enseña el enlace y se responde.
    /// <para>
    /// Las dos guardas de cuenta son las dos pasadas de <c>perform</c> (<c>:488</c>) por las que pasan las dos idas a
    /// la red de este flujo —allá la comprobación va dentro de cada <c>perform</c> y por eso no se le ve escrita— y se
    /// niegan con la frase genérica de ese <c>perform</c>, <see cref="DesktopChatUsernames.ChangedAccount"/>, no con la
    /// de la familia (<see cref="DesktopLinkManager.ChangedAccount"/>): Android no escribe ninguna en
    /// <c>createInviteLink</c>, así que la que la persona leería es la del envoltorio. Es la misma decisión que dejó
    /// documentada la ronda BC en <c>DesktopChatUsernames.cs:63-67</c>. No hay tercera: el botón positivo de este
    /// diálogo no pregunta por la cuenta, a diferencia del <c>confirmLink</c> de <c>NativeBridge.java:3762-3769</c>,
    /// que sí lo hace en el formulario.
    /// </para>
    /// <para>
    /// Y una diferencia de plataforma, dicha en lugar de fingida. Android termina con un <c>Intent.ACTION_SEND</c> y,
    /// solo cuando ninguna aplicación lo acepta, con un <c>AlertDialog</c> que muestra el enlace seleccionable. Windows
    /// no tiene hoja de compartir —la proyección WinRT no la ha ejercitado nunca este host—, así que toma con
    /// carácter general el camino que Android toma en ese caso: la misma caja, las mismas dos cadenas y el mismo botón
    /// único. El enlace no se copia al portapapeles: Android tampoco lo hace, y copiar en silencio sería escribir donde
    /// la persona no pidió. La escritura contesta la base <c>ExportedChatInvite</c> —medido sobre WTelegramClient
    /// 4.4.10—, y de sus dos derivados el único que trae datos es <c>chatInviteExported</c>, cuyo <c>link</c> no lleva
    /// bandera de presencia: los once bits de <c>flags</c> son otros campos. El <c>as</c> y el <c>?? ""</c> no son una
    /// duda sobre Telegram, son la forma que admite el tipado de la librería; una respuesta vacía se muestra vacía en
    /// lugar de negarse con una frase inventada.
    /// </para>
    private async Task<object?> CreateInviteAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.NotCreatable);
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightCreate);
        if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);
        if (!ConfirmPhoto(DesktopLinkManager.DialogCreate, DesktopLinkManager.QuickBody, DesktopLinkManager.QuickAccept, null)) return false;
        var issued = await client.Messages_ExportChatInvite(entry.Input,
            Moment(DesktopLinkManager.Expires(DateTimeOffset.UtcNow.ToUnixTimeSeconds(), DesktopLinkManager.QuickSpan)),
            null, DesktopLinkManager.DefaultLabel, null, false, false) as ChatInviteExported;
        if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);
        Notice(DesktopLinkManager.DialogCreated, DesktopLinkManager.CreatedBody, DesktopLinkManager.DialogClose,
            issued?.link ?? "");
        return true;
    }

    /// <summary>
    /// <c>inviteLinks</c> (<c>NativeBridge.java:3640-3655</c>) más <c>loadInviteLinks</c> (<c>:3646-3656</c>). Las
    /// veinte filas se piden filtradas por esta cuenta, que es exactamente el <c>session.selfId</c> que Android manda
    /// como <c>creator_user_id</c>, y la página sale de <see cref="DesktopLinkManager.Page"/> con sus cinco claves.
    /// El <c>catch</c> de <c>:3630</c> («No se pudieron preparar los enlaces de invitación.») cubre un fallo
    /// construyendo el JSON; aquí la fila se arma desde el objeto ya medido y no hay nada que atrapar, así que esa frase
    /// no se copia.
    /// </summary>
    private async Task<object?> InviteLinksAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.Unsupported);
        var marker = Raw(args, "cursor");
        var cursor = DesktopLinkManager.CursorIssue(marker);
        if (cursor != null) throw new BridgeException(cursor);
        var revoked = Bool(args, "revoked");
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightReview);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        // La lectura del enlace principal, la que Android no hace porque la tiene en su base. Si falla, el marcador de
        // primacía se queda en vacío y las filas salen sin marcar: es el degradado de una lista, no una negación.
        var primary = DesktopLinkManager.PrimaryOf((await ReadFullAsync(client, entry, kind))?.full_chat) ?? "";
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        var offset = DesktopLinkManager.CursorOf(marker);
        var table = await client.Messages_GetExportedChatInvites(
            entry.Input, new InputUserSelf(), DesktopLinkManager.PageSize,
            offset is { } when1 ? Moment(when1.Date) : null, offset?.Link ?? "", revoked);
        var rows = (table.invites ?? Array.Empty<ExportedChatInvite>())
            .Select(invite => DesktopLinkManager.Row(invite, primary))
            .Where(row => row != null)
            .Select(row => row!.Value)
            .ToList();
        return DesktopLinkManager.Page(rows, table.count, revoked);
    }

    /// <summary>
    /// <c>inviteLinkForm</c> (<c>NativeBridge.java:3676-3727</c>) con los dos caminos. <c>false</c> es el «Cancelar»
    /// del diálogo y el cierre por la equis, igual que en Android (<c>:3730</c> y <c>:3734</c>), y la cuenta que cambió
    /// a mitad del viaje se dice con <see cref="DesktopLinkManager.ChangedAccount"/> ocho veces en el método: tres en
    /// el crear y cinco en el editar. Son las dos pasadas del <c>perform</c> de <c>:488</c> antes de cada ida, la
    /// guarda que el
    /// propio botón positivo escribe antes de tocar Telegram y la comprobación que sigue a la escritura; el editar
    /// añade las dos que abrazan la lectura del <c>full info</c>, que en Android no hace falta porque su fila ya
    /// trae <c>isPrimary</c>.
    /// </summary>
    private async Task<object?> InviteLinkFormAsync(JsonElement args, bool create)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.Unsupported);
        if (Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;
        var url = "";
        if (!create)
        {
            var link = Raw(args, "link");
            if (link is null || link.Length > DesktopLinkManager.MaxUrl) throw new BridgeException(DesktopCommunityInfo.TooLong);
            url = DesktopCommunityInfo.Prepared(link);
            if (!DesktopLinkManager.ValidUrl(url)) throw new BridgeException(DesktopLinkManager.InvalidLink);
        }
        var text = Raw(args, "name");
        if (text is null || text.Length > DesktopLinkManager.MaxName) throw new BridgeException(DesktopCommunityInfo.TooLong);
        var name = DesktopCommunityInfo.Prepared(text);
        var expiresIn = Long(args, "expiresIn");
        var memberLimit = Long(args, "memberLimit");
        var approval = ApprovalValue(args);
        var problem = DesktopLinkManager.Problem(name, expiresIn, memberLimit, approval);
        if (problem != null) throw new BridgeException(problem);
        var expiration = DesktopLinkManager.Expires(DateTimeOffset.UtcNow.ToUnixTimeSeconds(), expiresIn);
        var title = DesktopContact.Limit(entry.Title, DesktopLinkManager.ChatShown);
        if (create)
        {
            if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightCreate);
            if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
            var label = DesktopLinkManager.CreateLabel(name);
            if (!ConfirmLink(DesktopLinkManager.DialogCreate,
                    DesktopLinkManager.FormBody(label, expiration, memberLimit, approval, title))) return false;
            if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
            // El nombre siempre viaja: Android manda `name.isEmpty()?"WRGram":name` a `CreateChatInviteLink`, y la
            // ausencia del título en MTProto no es «sin nombre» sino «el que Telegram elija», que no es lo mismo.
            await client.Messages_ExportChatInvite(entry.Input, Moment(expiration), Quota(memberLimit), label, null, false, approval);
            if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
            return true;
        }
        // Se lee el enlace antes de tocarlo, que es la razón que Android escribe en `NativeBridge.java:3706`: un
        // enlace principal o de suscripción no admite estos cambios y hay que saberlo de Telegram, no del panel.
        var answer = await client.Messages_GetExportedChatInvite(entry.Input, url);
        var current = answer switch
        {
            Messages_ExportedChatInvite one => one.invite,
            Messages_ExportedChatInviteReplaced swapped => swapped.invite,
            _ => null
        };
        if (current is not ChatInviteExported exported || exported.link != url)
            throw new BridgeException(DesktopLinkManager.NotRecognised);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        var primary = DesktopLinkManager.PrimaryOf((await ReadFullAsync(client, entry, kind))?.full_chat);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        if (primary is null) throw new BridgeException(DesktopLinkManager.PrimaryUnknown);
        var refusal = DesktopLinkManager.NotEditable(exported, DesktopLinkManager.IsPrimary(exported, primary));
        if (refusal != null) throw new BridgeException(refusal);
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightEdit);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        if (exported.admin_id != 0 && exported.admin_id != owner) throw new BridgeException(DesktopLinkManager.OtherCreatorEdit);
        if (!ConfirmLink(DesktopLinkManager.DialogEdit,
                DesktopLinkManager.FormBody(DesktopLinkManager.EditLabel(name), expiration, memberLimit, approval, title))) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        // A Telegram no va «sin nombre»: el vacío se manda como ausencia de `title`, que es como MTProto borra el
        // comentario de un enlace. El diálogo sí lo nombra, porque ahí lo que se lee es lo que la persona verá.
        await client.Messages_EditExportedChatInvite(entry.Input, url, Moment(expiration), Quota(memberLimit),
            approval, name.Length == 0 ? null : name, false);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        return true;
    }

    /// <summary>
    /// <c>revokeInviteLink</c> (<c>NativeBridge.java:3734-3761</c>). El enlace ya revocado responde <c>false</c> y no
    /// una frase, que es lo que Android hace en <c>:3712</c>: no ha pasado nada y la pantalla no tiene nada que decir.
    /// En MTProto no hay <c>RevokeChatInviteLink</c>; lo que hay es <c>messages.editExportedChatInvite</c> con la
    /// bandera <c>revoked</c> y nada más, que es la misma escritura con la que Telegram deja de aceptar el enlace.
    /// <c>messages.deleteExportedChatInvite</c> queda fuera: borra la fila en lugar de revocarla, y la pestaña
    /// «Revocados» del panel se quedaría vacía.
    /// </summary>
    private async Task<object?> RevokeInviteLinkAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopLinkManager.Supported(kind)) throw new BridgeException(DesktopLinkManager.Unsupported);
        if (Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;
        var link = Raw(args, "link");
        if (link is null || link.Length > DesktopLinkManager.MaxUrl) throw new BridgeException(DesktopCommunityInfo.TooLong);
        var url = DesktopCommunityInfo.Prepared(link);
        if (url.Length == 0) throw new BridgeException(DesktopLinkManager.EmptyRevoke);
        var title = DesktopContact.Limit(entry.Title, DesktopLinkManager.ChatShown);
        var answer = await client.Messages_GetExportedChatInvite(entry.Input, url);
        var current = answer switch
        {
            Messages_ExportedChatInvite one => one.invite,
            Messages_ExportedChatInviteReplaced swapped => swapped.invite,
            _ => null
        };
        if (current is not ChatInviteExported exported || exported.link != url)
            throw new BridgeException(DesktopLinkManager.NotRecognised);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        if (DesktopLinkManager.Revoked(exported)) return false;
        var primary = DesktopLinkManager.PrimaryOf((await ReadFullAsync(client, entry, kind))?.full_chat);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        if (primary is null) throw new BridgeException(DesktopLinkManager.PrimaryUnknown);
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopLinkManager.NoRightRevoke);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        if (exported.admin_id != 0 && exported.admin_id != owner) throw new BridgeException(DesktopLinkManager.OtherCreatorRevoke);
        if (!ConfirmLink(DesktopLinkManager.DialogRevoke, DesktopLinkManager.RevokeBody(
                DesktopLinkManager.RevokeName(exported.title), title, DesktopLinkManager.IsPrimary(exported, primary),
                Math.Max(0, exported.usage)))) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        await client.Messages_EditExportedChatInvite(entry.Input, url, null, null, null, null, true);
        if (client.User?.id != owner) throw new BridgeException(DesktopLinkManager.ChangedAccount);
        return true;
    }

    /// <c>canInviteMembers</c> (<c>NativeBridge.java:1887</c>) leído del sitio donde MTProto publica el derecho: la
    /// fila propia en <c>channels.getParticipant</c>, con su tabla de derechos, o la cabecera del chat en un básico.
    /// Las dos lecturas son las que ya gastan las rondas BB y BE; esta no añade petición ni inventa permiso.
    private async Task<bool> MayManageLinksAsync(Client client, ChatEntry entry, DesktopMembership.Kind kind)
    {
        if (kind == DesktopMembership.Kind.Basic)
        {
            var self = (await BasicParticipantsAsync(client, entry))
                .FirstOrDefault(part => DesktopGroupRoster.Person(part) == (client.User?.id ?? 0));
            return DesktopLinkManager.MayManageLinks(self);
        }
        return DesktopMemberAdditions.MayInvite(await SelfParticipantAsync(client, ChannelInput(entry)));
    }

    /// <c>requiredBool(p,"approval")</c> (<c>NativeBridge.java:3688</c>). Allá es un <c>throw</c> en inglés que el
    /// despacho reenvía; aquí es la causa concreta en español, sin nombre de clave, que es lo único que la persona
    /// puede comprobar.
    private static bool ApprovalValue(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("approval", out var flag))
            throw new BridgeException(DesktopLinkManager.IncompleteApproval);
        if (flag.ValueKind == JsonValueKind.True) return true;
        if (flag.ValueKind == JsonValueKind.False) return false;
        throw new BridgeException(DesktopLinkManager.IncompleteApproval);
    }

    /// El segundo absoluto de <see cref="DesktopLinkManager.Expires"/> convertido a la <c>DateTime?</c> que piden las
    /// dos escrituras: <c>null</c> es «sin caducidad», y el cero de WTelegramClient no lo es.
    private static DateTime? Moment(long? epoch) =>
        epoch is { } value ? DateTimeOffset.FromUnixTimeSeconds(value).UtcDateTime : null;

    /// <c>usage_limit</c>: Telegram no distingue «cero» de «sin límite», así que el cero se manda como ausencia, que es
    /// lo que TDLib traduce del <c>memberLimit</c> de <c>NativeBridge.java:3698</c> y <c>:3687</c>.
    private static int? Quota(long memberLimit) => memberLimit > 0 ? (int)memberLimit : null;

    /// El <c>Dialogs.builder</c> con el que Android confirma los tres diálogos del puente
    /// (<c>NativeBridge.java:3763-3768</c>), hecho con la ventana que el host ya levanta para
    /// los otros guardados: el mismo par de botones, el mismo «Cancelar» y el cierre por la equis valiendo igual. El
    /// rótulo positivo es <see cref="DesktopCommunityInfo.DialogAccept"/>, la cadena exacta de Android.
    private static bool ConfirmLink(string title, string body) =>
        ConfirmPhoto(title, body, DesktopCommunityInfo.DialogAccept, null);
}
