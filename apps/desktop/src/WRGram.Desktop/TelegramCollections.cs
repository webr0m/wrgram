using System.Text.Json;
using TL;
using WTelegram;

namespace WRGram.Desktop;

public sealed partial class TelegramService
{
    private const int CollectionSize = 30;
    private const long HiddenForwardAuthor = 2666000;
    private readonly Dictionary<string, (InputPeer Peer, int OffsetId, DateTime OffsetDate)> _savedOrigins = new();

    private static ChatDto LookupDto(ChatEntry entry) => new()
    {
        Id = entry.Id, Title = entry.Title, Type = entry.Type, Username = entry.Username,
        Photo = entry.Photo, Bot = entry.Bot, Supergroup = entry.Supergroup, IsForum = entry.IsForum,
        InList = false
    };

    private static ChatEntry SavedEntry(long userId) => new()
    {
        Id = "u" + userId, Peer = new PeerUser { user_id = userId }, Input = new InputPeerSelf(),
        Title = "Mensajes guardados"
    };

    private Client CollectionClient() => _client?.User != null ? _client : throw new BridgeException("Inicia sesión para continuar.");

    private async Task<ChatDto[]> SearchChatsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var query = Str(args, "query").Trim();
        var scope = Str(args, "scope");
        if (scope is not ("account" or "public") || query.Length > 80) throw new BridgeException("Búsqueda no válida.");
        if (query.Length < (scope == "public" ? 3 : 2)) return [];
        var result = await client.Contacts_Search(query, CollectionSize);
        MergePeers(result.users.Values, result.chats.Values);
        var peers = scope == "public" ? result.results : result.my_results;
        return peers.Select(EntryFromPeer).OfType<ChatEntry>().DistinctBy(entry => entry.Id).Select(LookupDto).ToArray();
    }

    private async Task<object> SavedSourcesAsync(JsonElement args)
    {
        var client = CollectionClient();
        var cursor = Str(args, "cursor");
        if (cursor.Length > 0 && !_savedOrigins.ContainsKey(cursor))
            throw new BridgeException("La lista cambió. Vuelve a abrir Mensajes guardados.");
        var origin = cursor.Length == 0 ? default : _savedOrigins[cursor];
        var result = await client.Messages_GetSavedDialogs(offset_date: origin.OffsetDate, offset_id: origin.OffsetId,
            offset_peer: origin.Peer, limit: CollectionSize, exclude_pinned: cursor.Length > 0);
        if (result is not Messages_SavedDialogs page) return new { items = Array.Empty<object>(), next = "" };

        MergePeers(page.users.Values, page.chats.Values);
        var last = "";
        var items = new List<object>();
        foreach (var dialog in page.dialogs.OfType<SavedDialog>())
        {
            var peerUser = dialog.peer as PeerUser;
            var self = peerUser?.user_id == client.User.id;
            var hidden = peerUser?.user_id == HiddenForwardAuthor;
            var entry = self ? SavedEntry(client.User.id) : EntryFromPeer(dialog.peer);
            var peer = entry?.Input ?? (hidden ? new InputPeerUser(HiddenForwardAuthor, 0) : null);
            if (peer == null) continue;
            var id = entry?.Id ?? "u" + HiddenForwardAuthor;
            var message = page.messages.FirstOrDefault(item => item.ID == dialog.top_message);
            _savedOrigins[id] = (peer, dialog.top_message, message?.Date ?? default);
            last = id;
            items.Add(new
            {
                id, title = self ? "Mis notas" : hidden ? "Autor oculto" : entry!.Title,
                preview = PreviewOf(message), date = message == null ? 0L : Unix(message.Date),
                pinned = (dialog.flags & SavedDialog.Flags.pinned) != 0
            });
        }
        return new { items, next = result is Messages_SavedDialogsSlice && last != cursor ? last : "" };
    }

    private async Task<object> SavedHistoryAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = Str(args, "id");
        if (!_savedOrigins.TryGetValue(id, out var origin)) throw new BridgeException("Este origen ya no está disponible.");
        var cursor = CollectionCursor(args);
        var result = await client.Messages_GetSavedHistory(origin.Peer, offset_id: cursor, limit: CollectionSize);
        return MessageCollection(result, SavedEntry(client.User.id), cursor);
    }

    private async Task<object> GalleryAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = Str(args, "id");
        if (id != _active) throw new BridgeException("La conversación cambió.");
        var chat = RequireEntry(id);
        MessagesFilter filter = Str(args, "filter") switch
        {
            "photoVideo" => new InputMessagesFilterPhotoVideo(),
            "photos" => new InputMessagesFilterPhotos(),
            "videos" => new InputMessagesFilterVideo(),
            "documents" => new InputMessagesFilterDocument(),
            "links" => new InputMessagesFilterUrl(),
            "audio" => new InputMessagesFilterMusic(),
            "voice" => new InputMessagesFilterVoice(),
            _ => throw new BridgeException("El filtro de multimedia no es válido.")
        };
        var from = Long(args, "from");
        var until = Long(args, "until");
        if ((from != 0 || until != 0) && (from < 0 || until <= from || until - from > 172800 || until > int.MaxValue))
            throw new BridgeException("La fecha no es válida.");
        var cursor = CollectionCursor(args);
        var result = await client.Messages_Search(chat.Input, "", filter: filter, offset_id: cursor, limit: CollectionSize,
            min_date: until == 0 ? default : DateTimeOffset.FromUnixTimeSeconds(from - 1).UtcDateTime,
            max_date: until == 0 ? default : DateTimeOffset.FromUnixTimeSeconds(until).UtcDateTime);
        return MessageCollection(result, chat, cursor);
    }

    private static int CollectionCursor(JsonElement args)
    {
        var value = Str(args, "cursor");
        if (value.Length == 0) return 0;
        if (!int.TryParse(value, out var id) || id <= 0) throw new BridgeException("Página no válida.");
        return id;
    }

    private object MessageCollection(Messages_MessagesBase result, ChatEntry chat, int cursor)
    {
        if (result is Messages_Messages page) MergePeers(page.users.Values, page.chats.Values);
        if (result is Messages_ChannelMessages channel) MergePeers(channel.users.Values, channel.chats.Values);
        var messages = result.Messages.Where(message => message.ID > 0 && (cursor == 0 || message.ID < cursor)).ToArray();
        var items = messages.Where(message => message is not TL.Message { media: MessageMediaPhoto { ttl_seconds: > 0 } or MessageMediaDocument { ttl_seconds: > 0 } })
            .Select(message => ConvertMessage(message, chat)).OfType<MessageDto>().ToArray();
        return new { items, next = messages.Length == 0 || result.GetType() == typeof(Messages_Messages) ? "" : messages.Min(message => message.ID).ToString() };
    }
}
