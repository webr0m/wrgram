namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de <c>profile.sender</c> (brazo en <c>TelegramService.cs:254</c>): leer la fila, sacar su autor y devolver
/// la fila de chat que la pantalla abre después. Las reglas y las frases están en <see cref="DesktopSenderProfile"/>;
/// el par de frases negativas y el orden de las guardas son los de <c>senderProfile</c>
/// (<c>NativeBridge.java:1614-1632</c>).
/// <para>
/// Después de esta orden la pantalla hace <c>chat.profile</c> con el identificador devuelto (<c>PeerProfile.tsx:50-54</c>),
/// y esa ya estaba conectada desde la ronda BA —así que el trabajo de aquí es solo el puente entre un número de mensaje
/// y un peer, que en TDLib hacía <c>CreatePrivateChat</c> y aquí hace la caché de peers que la propia respuesta llenó.
/// </para>
/// <para>
/// La lectura es una petición nueva por clic y no un fallo de diseño: este host no conserva las filas crudas, conserva
/// los DTO que pintó (<c>DesktopState.cs</c>), y en el DTO no está el <c>from_id</c>. Android tampoco lo tendría a mano
/// si TDLib no guardara el mensaje entero.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    private async Task<object?> SenderProfileAsync(JsonElement args)
    {
        var client = CollectionClient();
        // `session.chat(chatId)` de `NativeBridge.java:1619`: sin chat no hay petición que mandar, y la guarda
        // agrupada de Android, que es `NativeBridge.java:1620`, lo niega con la frase del perfil y no con la de
        // «conversación no cargada».
        var entry = FindEntry(Str(args, "chatId"));
        if (entry == null) throw new BridgeException(DesktopSenderProfile.NoProfile);
        var id = Long(args, "id");
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        // La respuesta de `messages.getMessages` trae también a quién habla: de aquí salen el `access_hash` de la
        // persona y el título del canal, y sin esta mezcla el paso siguiente no tendría con qué armar la fila.
        if (page is Messages_Messages table) MergePeers(table.users?.Values, table.chats?.Values);
        var row = DesktopSenderProfile.Row(page.Messages, id);
        if (row == null) throw new BridgeException(DesktopSenderProfile.NoProfile);
        if (DesktopSenderProfile.IsEphemeral(row)) throw new BridgeException(DesktopSenderProfile.NoProfile);
        var peer = DesktopSenderProfile.SenderOf(row);
        if (peer == null) throw new BridgeException(DesktopSenderProfile.UnknownSender);
        // La persona existe en la respuesta pero llegó recortada (`min`): sin hash no hay `InputPeerUser` y la ficha
        // no se puede abrir después. Es la misma negativa que la que documenta `profile.contact` (`DesktopPeerProfileFlow.cs:233`).
        if (peer is PeerUser person && (_users.GetValueOrDefault(person.user_id)?.access_hash ?? 0L) == 0L)
            throw new BridgeException(DesktopPeerProfile.NoHash);
        // `MessageSenderChat` de `NativeBridge.java:1627`: el canal o el grupo que publicó, que aquí ya está en la caché porque el
        // propio mensaje lo trajo. `EntryFromPeer` devuelve `null` si la respuesta no lo incluyó, y eso es «no
        // identificó al remitente», no una fila inventada con el número suelto.
        var sender = EntryFromPeer(peer) ?? throw new BridgeException(DesktopSenderProfile.UnknownSender);
        return DesktopPeerProfile.PeerRow(sender.Id, sender.Title, sender.Type, sender.Username ?? "", sender.Bot);
    }
}
