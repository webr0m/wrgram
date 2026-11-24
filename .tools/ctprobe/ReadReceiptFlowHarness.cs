using System.Text.Json;
using TL;

namespace WRGram.Desktop;

internal sealed class BridgeException(string message) : Exception(message);

internal interface IReadReceiptRpc
{
    Task<OutboxReadDate> Messages_GetOutboxReadDate(InputPeer peer, int id);
    Task<Messages_ChatFull> Messages_GetFullChat(long chat_id);
    Task<T> Invoke<T>(IMethod<T> query);
}

internal sealed class OfflineReadReceiptRpc : IReadReceiptRpc
{
    public List<string> Calls { get; } = [];
    public Func<InputPeer, int, OutboxReadDate>? OnDate { get; set; }
    public Func<long, Messages_ChatFull>? OnFullChat { get; set; }
    public Func<TL.Methods.Messages_GetMessageReadParticipants, ReadParticipantDate[]>? OnViewers { get; set; }
    public Func<int>? CachedUserCount { get; set; }

    public Task<OutboxReadDate> Messages_GetOutboxReadDate(InputPeer peer, int id)
    {
        Calls.Add($"outboxDate(peer={PeerLabel(peer)},msg={id})");
        return Task.FromResult(OnDate?.Invoke(peer, id) ?? new OutboxReadDate
        {
            date = new DateTime(2023, 11, 14, 22, 13, 20, DateTimeKind.Utc)
        });
    }

    public Task<Messages_ChatFull> Messages_GetFullChat(long chat_id)
    {
        Calls.Add($"GetFullChat({chat_id})");
        return Task.FromResult(OnFullChat?.Invoke(chat_id) ?? new Messages_ChatFull
        {
            users = new Dictionary<long, User>
            {
                [42] = new User { id = 42, first_name = "Ada" }
            },
            chats = new Dictionary<long, ChatBase>()
        });
    }

    public Task<T> Invoke<T>(IMethod<T> query)
    {
        if (query is not TL.Methods.Messages_GetMessageReadParticipants request)
            throw new InvalidOperationException("El flujo emitió una petición de lectores distinta de la esperada.");
        Calls.Add($"viewers(cache={CachedUserCount?.Invoke() ?? -1},peer={PeerLabel(request.peer)},msg={request.msg_id})");
        var response = OnViewers?.Invoke(request) ??
        [
            new ReadParticipantDate { user_id = 42, date = new DateTime(2023, 11, 14, 22, 13, 20, DateTimeKind.Utc) },
            new ReadParticipantDate { user_id = 7, date = new DateTime(2023, 11, 14, 22, 15, 0, DateTimeKind.Utc) }
        ];
        return Task.FromResult((T)(object)response);
    }

    internal static string PeerLabel(InputPeer peer) => peer switch
    {
        InputPeerUser user => $"u{user.user_id}:{user.access_hash}",
        InputPeerChat chat => $"g{chat.chat_id}",
        InputPeerChannel channel => $"c{channel.channel_id}:{channel.access_hash}",
        _ => peer.GetType().Name
    };
}

internal sealed class ProbeMessage
{
    public string Id { get; set; } = "";
    public bool Outgoing { get; set; }
}

public sealed partial class TelegramService
{
    private sealed class ChatEntry
    {
        public TL.Peer Peer = null!;
        public TL.InputPeer Input = null!;
    }

    private sealed class ProbeState
    {
        public List<ProbeMessage> Messages { get; } = [];
    }

    private readonly IReadReceiptRpc _rpc;
    private readonly ChatEntry _entry = new();
    private readonly ProbeState _state = new();
    private readonly Dictionary<long, User> _users = new();
    private readonly string _active = "probe";

    internal TelegramService(IReadReceiptRpc rpc, TL.Peer peer, TL.InputPeer input, params ProbeMessage[] messages)
    {
        _rpc = rpc;
        _entry.Peer = peer;
        _entry.Input = input;
        _state.Messages.AddRange(messages);
    }

    internal int CachedUserCount => _users.Count;
    internal Task<object> ReadDateForProbe(JsonElement args) => ReadDateAsync(args);
    internal Task<object> MessageViewersForProbe(JsonElement args) => MessageViewersAsync(args);

    private IReadReceiptRpc CollectionClient() => _rpc;
    private ChatEntry RequireEntry(string id) => _entry;

    private void MergePeers(IEnumerable<User>? users, IEnumerable<ChatBase>? chats)
    {
        if (users != null) foreach (var user in users) _users[user.id] = user;
        if (chats != null) foreach (var chat in chats) _chats[chat.ID] = chat;
    }

    private readonly Dictionary<long, ChatBase> _chats = new();

    private string UserName(long id) =>
        _users.TryGetValue(id, out var user)
            ? string.Join(" ", new[] { user.first_name, user.last_name }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim() is { Length: > 0 } name ? name : "Usuario de Telegram"
            : "Usuario de Telegram";

    private static long Long(JsonElement element, string name, long fallback = 0)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt64(out var number) => number,
            JsonValueKind.String when long.TryParse(value.GetString(), out var number) => number,
            _ => fallback
        };
    }
}
