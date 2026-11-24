using System.Text.Json;
using TL;

namespace WRGram.Desktop;

/// WTelegramClient 4.4.10 expone la fecha privada y los lectores de grupo básico con peticiones distintas.
public sealed partial class TelegramService
{
    private async Task<object> ReadDateAsync(JsonElement args)
    {
        if (!DesktopReadReceipts.TryMessageId(Long(args, "id"), out var id))
            throw new BridgeException(DesktopReadReceipts.InvalidMessageId);
        var client = CollectionClient();
        var chat = RequireEntry(_active);
        var message = _state.Messages.FirstOrDefault(item => item.Id == id.ToString());
        if (message == null || !message.Outgoing) throw new BridgeException(DesktopReadReceipts.NotOutgoing);
        if (chat.Peer is not PeerUser) throw new BridgeException(DesktopReadReceipts.NotPrivate);
        try
        {
            var value = await client.Messages_GetOutboxReadDate(chat.Input, id);
            return DesktopReadReceipts.Date(value);
        }
        catch (RpcException rpc)
        {
            var state = DesktopReadReceipts.Error(rpc);
            if (state != null) return state;
            throw;
        }
    }

    private async Task<object> MessageViewersAsync(JsonElement args)
    {
        if (!DesktopReadReceipts.TryMessageId(Long(args, "id"), out var id))
            throw new BridgeException(DesktopReadReceipts.InvalidMessageId);
        var client = CollectionClient();
        var chat = RequireEntry(_active);
        var message = _state.Messages.FirstOrDefault(item => item.Id == id.ToString());
        if (message == null || !message.Outgoing) throw new BridgeException(DesktopReadReceipts.NotOutgoing);
        // La variante de supergrupo (`channels.getMessageReadParticipants`) no existe en la librería, así que
        // un canal se niega por su nombre en vez de caer en el rechazo genérico del final del switch.
        if (chat.Peer is PeerChannel) throw new BridgeException(DesktopReadReceipts.NotBasicGroup);
        if (chat.Peer is not PeerChat) throw new BridgeException(DesktopReadReceipts.NotGroup);
        if (chat.Input is not InputPeerChat basic) throw new BridgeException(DesktopReadReceipts.NotBasicGroup);
        var page = await client.Messages_GetFullChat(basic.chat_id);
        MergePeers(page.users?.Values, page.chats?.Values);
        ReadParticipantDate[] parts;
        try
        {
            parts = await client.Invoke(new TL.Methods.Messages_GetMessageReadParticipants { peer = chat.Input, msg_id = id });
        }
        catch (RpcException rpc)
        {
            var viewers = DesktopReadReceipts.ViewersError(rpc);
            if (viewers != null) return viewers;
            throw;
        }
        return DesktopReadReceipts.Viewers(parts, UserName);
    }
}