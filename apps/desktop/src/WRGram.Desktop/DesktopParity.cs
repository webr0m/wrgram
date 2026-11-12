using System.Text.Json;
using System.Text.RegularExpressions;
using TL;
using WTelegram;

namespace WRGram.Desktop;

// Paridad con el puente de Android: búsqueda, traducción, transcripción, respuestas rápidas,
// carpetas y listas colaborativas, impulsos, cartera de Stars y cola de descargas.
public sealed partial class TelegramService
{
    private const int SearchPageSize = 50;
    private const int QueuePageSize = 50;

    private readonly Dictionary<string, long> _transcriptions = new();
    private readonly Dictionary<long, DateTime> _downloadTracked = new();
    private readonly HashSet<long> _downloadPaused = new();
    private readonly HashSet<int> _chatlistIds = new();
    private readonly HashSet<int> _folderLinks = new();
    private bool _downloadsPausedAll;
    private string _searchQuery = "";
    private string _searchFilter = "";
    private int _searchLastId;

    // ---- búsqueda -----------------------------------------------------------------

    private static MessagesFilter? SearchFilter(string key) => key switch
    {
        "" => null,
        "photos" => new InputMessagesFilterPhotos(),
        "videos" => new InputMessagesFilterVideo(),
        "photoVideo" => new InputMessagesFilterPhotoVideo(),
        "documents" => new InputMessagesFilterDocument(),
        "audio" => new InputMessagesFilterMusic(),
        "voice" => new InputMessagesFilterVoice(),
        "videoNotes" => new InputMessagesFilterRoundVideo(),
        "animations" => new InputMessagesFilterGif(),
        "links" => new InputMessagesFilterUrl(),
        "polls" => new InputMessagesFilterPoll(),
        "mentions" => new InputMessagesFilterMyMentions(),
        _ => throw new BridgeException("El filtro de búsqueda no es válido.")
    };

    private async Task<object?> MessagesSearchAsync(JsonElement args)
    {
        var client = CollectionClient();
        var query = Str(args, "query").Trim();
        if (query.Length > 100) throw new BridgeException("La búsqueda es demasiado larga (máximo 100 caracteres).");
        var filterKey = Str(args, "filter");
        var filter = SearchFilter(filterKey);
        if (Bool(args, "global")) return await SearchGlobalAsync(client, args, query, filter);
        var chat = RequireEntry(_active);
        var result = await client.Messages_Search(chat.Input, query, filter: filter, limit: SearchPageSize);
        _searchQuery = query;
        _searchFilter = filterKey;
        _searchLastId = 0;
        return SearchChatPage(result, chat, storeOffset: true);
    }

    private async Task<object?> MessagesSearchMoreAsync(JsonElement args)
    {
        var client = CollectionClient();
        if (_searchLastId <= 0) return new { messages = Array.Empty<MessageDto>(), next = false };
        var chat = RequireEntry(_active);
        var query = Str(args, "query").Trim();
        var filterKey = Str(args, "filter");
        if (query != _searchQuery || filterKey != _searchFilter)
            throw new BridgeException("La búsqueda cambió. Lanza una nueva búsqueda.");
        var result = await client.Messages_Search(chat.Input, query, filter: SearchFilter(filterKey), offset_id: _searchLastId, limit: SearchPageSize);
        return SearchChatPage(result, chat, storeOffset: true);
    }

    private object SearchChatPage(Messages_MessagesBase result, ChatEntry chat, bool storeOffset)
    {
        MergeSearchPeers(result);
        var messages = result.Messages.Where(message => message.ID > 0).OrderByDescending(message => message.ID).ToArray();
        var items = messages.Select(message => ConvertMessage(message, chat)).OfType<MessageDto>().ToArray();
        var lastId = messages.Length > 0 ? messages.Min(message => message.ID) : 0;
        if (storeOffset) _searchLastId = lastId;
        var next = result is Messages_MessagesSlice && messages.Length > 0 && lastId > 0;
        return new { messages = items, next };
    }

    private async Task<object> SearchGlobalAsync(Client client, JsonElement args, string query, MessagesFilter? filter)
    {
        int rate = 0;
        int offsetId = 0;
        TL.InputPeer? peer = null;
        var offset = Str(args, "offset");
        if (offset.Length > 0)
        {
            var parts = offset.Split(':');
            if (parts.Length != 3 || !int.TryParse(parts[0], out rate) || !int.TryParse(parts[2], out offsetId) || offsetId <= 0)
                throw new BridgeException("La página de búsqueda no es válida. Lanza una nueva búsqueda.");
            peer = FindEntry(parts[1])?.Input;
        }
        var result = await client.Messages_SearchGlobal(query, filter: filter, offset_rate: rate, offset_peer: peer, offset_id: offsetId, limit: SearchPageSize);
        MergeSearchPeers(result);
        var messages = result.Messages.Where(message => message.ID > 0).OrderByDescending(message => message.ID).ToArray();
        var items = new List<MessageDto>();
        foreach (var message in messages)
        {
            var entry = EntryFromPeer(message.Peer);
            if (entry == null) continue;
            var dto = ConvertMessage(message, entry);
            if (dto == null) continue;
            dto.ChatTitle = entry.Title;
            items.Add(dto);
        }
        var total = result switch
        {
            Messages_MessagesSlice slice => slice.count,
            Messages_ChannelMessages channel => channel.count,
            _ => messages.Length
        };
        var nextOffset = "";
        if (result is Messages_MessagesSlice page && messages.Length > 0)
        {
            var oldest = messages.MinBy(message => message.ID)!;
            var peerId = ChatIdOf(oldest.Peer);
            if (peerId != null) nextOffset = $"{page.next_rate}:{peerId}:{oldest.ID}";
        }
        return new { messages = items, nextOffset, total = Math.Max(total, messages.Length) };
    }

    private void MergeSearchPeers(Messages_MessagesBase result)
    {
        if (result is Messages_Messages page) MergePeers(page.users?.Values, page.chats?.Values);
        if (result is Messages_ChannelMessages channel) MergePeers(channel.users?.Values, channel.chats?.Values);
    }

    // ---- traducción y transcripción ------------------------------------------------

    private async Task<object> TranslateMessageAsync(JsonElement args)
    {
        var client = CollectionClient();
        var language = Str(args, "language").Trim();
        if (!Regex.IsMatch(language, "^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$"))
            throw new BridgeException("El idioma de destino no es válido.");
        var chat = RequireEntry(_active);
        var id = (int)Long(args, "id");
        var message = _state.Messages.FirstOrDefault(item => item.Id == id.ToString());
        if (message == null || string.IsNullOrWhiteSpace(message.Text))
            throw new BridgeException("Este mensaje no tiene texto que traducir.");
        var result = await client.Messages_TranslateText(language, chat.Input, id: new[] { id });
        var text = result is Messages_TranslateResult translated ? translated.result.FirstOrDefault()?.text : null;
        if (string.IsNullOrWhiteSpace(text))
            throw new BridgeException("Telegram no devolvió traducción para este mensaje.");
        return new { text };
    }

    private async Task<object> TranscribeAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(_active);
        var id = (int)Long(args, "id");
        var result = await client.Messages_TranscribeAudio(chat.Input, id);
        _transcriptions[$"{chat.Id}:{id}"] = result.transcription_id;
        var pending = (result.flags & Messages_TranscribedAudio.Flags.pending) != 0;
        return new { text = result.text ?? "", pending };
    }

    private async Task<object> TranscribeRateAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(_active);
        var id = (int)Long(args, "id");
        if (!_transcriptions.TryGetValue($"{chat.Id}:{id}", out var transcriptionId))
            throw new BridgeException("No hay una transcripción reciente de este mensaje que valorar.");
        await client.Messages_RateTranscribedAudio(chat.Input, id, transcriptionId, Bool(args, "good"));
        return true;
    }

    // ---- respuestas rápidas ---------------------------------------------------------

    private async Task<object> QuickListAsync()
    {
        var client = CollectionClient();
        var result = await client.Messages_GetQuickReplies(0);
        if (result?.quick_replies == null) return new { shortcuts = Array.Empty<object>() };
        MergePeers(result.users?.Values, result.chats?.Values);
        return new
        {
            shortcuts = result.quick_replies.Select(reply => new
            {
                id = reply.shortcut_id,
                name = reply.shortcut,
                count = reply.count,
                first = reply.top_message
            }).ToArray()
        };
    }

    private async Task<object> QuickMessagesAsync(JsonElement args)
    {
        var client = CollectionClient();
        var result = await client.Messages_GetQuickReplyMessages((int)Long(args, "id"), 0);
        var messages = result.Messages.OfType<TL.Message>().Where(message => message.ID > 0)
            .OrderBy(message => message.ID)
            .Select(message => new { id = message.ID.ToString(), text = message.message ?? "", editable = QuickTextEditable(message) })
            .ToArray();
        return new { messages };
    }

    private static bool QuickTextEditable(TL.Message message) =>
        !string.IsNullOrWhiteSpace(message.message) && message.media is null && (message.entities is null || message.entities.Length == 0);

    private async Task<object> QuickEditAsync(JsonElement args)
    {
        var client = CollectionClient();
        var shortcutId = (int)Long(args, "id");
        var messageId = (int)Long(args, "messageId");
        var text = Str(args, "text");
        if (string.IsNullOrWhiteSpace(text) || text.Length > 4096)
            throw new BridgeException("Escribe entre 1 y 4096 caracteres.");
        var result = await client.Messages_GetQuickReplyMessages(shortcutId, 0);
        var message = result.Messages.OfType<TL.Message>().FirstOrDefault(item => item.ID == messageId);
        if (message is null || !QuickTextEditable(message))
            throw new BridgeException("Este mensaje de la respuesta rápida no se puede editar aquí.");
        await client.Messages_EditMessage(InputPeer.Self, messageId, message: text, quick_reply_shortcut_id: shortcutId);
        return true;
    }

    private static string QuickName(string raw)
    {
        var name = raw.Trim().TrimStart('/').Trim();
        if (name.Length is < 1 or > 32) throw new BridgeException("El nombre de la respuesta rápida debe tener entre 1 y 32 caracteres.");
        return name;
    }

    private async Task<object> QuickAddAsync(JsonElement args)
    {
        var client = CollectionClient();
        var name = QuickName(Str(args, "name"));
        var text = Str(args, "text").Trim();
        if (text.Length is < 1 or > 1000) throw new BridgeException("El texto de la respuesta rápida debe tener entre 1 y 1000 caracteres.");
        await client.Messages_SendMessage(new InputPeerSelf(), text, Random.Shared.NextInt64(1, long.MaxValue),
            quick_reply_shortcut: new InputQuickReplyShortcut { shortcut = name });
        return true;
    }

    private async Task<object> QuickNameAsync(JsonElement args)
    {
        var client = CollectionClient();
        await client.Messages_EditQuickReplyShortcut((int)Long(args, "id"), QuickName(Str(args, "name")));
        return true;
    }

    private async Task<object> QuickDeleteAsync(JsonElement args)
    {
        var client = CollectionClient();
        await client.Messages_DeleteQuickReplyShortcut((int)Long(args, "id"));
        return true;
    }

    private async Task<object> QuickSendAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(_active);
        var shortcutId = (int)Long(args, "id");
        var result = await client.Messages_GetQuickReplyMessages(shortcutId, 0);
        var ids = result.Messages.OfType<TL.Message>().Where(message => message.ID > 0)
            .OrderBy(message => message.ID).Select(message => message.ID).ToArray();
        if (ids.Length == 0) throw new BridgeException("Esta respuesta rápida no tiene texto guardado.");
        await client.Messages_SendQuickReplyMessages(chat.Input, shortcutId, ids,
            ids.Select(_ => Random.Shared.NextInt64(1, long.MaxValue)).ToArray());
        return true;
    }

    // ---- carpetas y listas colaborativas ---------------------------------------------

    private async Task<List<TL.DialogFilterBase>> LoadFiltersAsync()
    {
        var client = CollectionClient();
        var result = await client.Messages_GetDialogFilters();
        return result.filters?.ToList() ?? new List<TL.DialogFilterBase>();
    }

    private static string FilterTitle(TL.DialogFilterBase item) =>
        item.Title?.text ?? (item.ID > 0 ? $"Carpeta {item.ID}" : "Carpeta");

    private async Task<object> FoldersListAsync()
    {
        var filters = await LoadFiltersAsync();
        _chatlistIds.Clear();
        var items = filters.Where(item => item.ID > 0).OrderBy(item => item.ID).Select(item =>
        {
            var shareable = item is TL.DialogFilterChatlist;
            if (shareable) _chatlistIds.Add(item.ID);
            return new
            {
                id = item.ID,
                title = FilterTitle(item),
                shareable,
                hasLinks = item is TL.DialogFilterChatlist list && (list.flags & TL.DialogFilterChatlist.Flags.has_my_invites) != 0
                    || _folderLinks.Contains(item.ID)
            };
        }).ToArray();
        _state.Folders = items.Select(item => new FolderDto { Id = item.id, Title = item.title }).ToList();
        return items;
    }

    private static bool HasFlag(TL.DialogFilter? filter, TL.DialogFilter.Flags flag) =>
        filter != null && (filter.flags & flag) != 0;

    private async Task<object> FolderGetAsync(JsonElement args)
    {
        var filters = await LoadFiltersAsync();
        var id = (int)Long(args, "id");
        var item = filters.FirstOrDefault(filter => filter.ID == id)
            ?? throw new BridgeException("Esta carpeta ya no existe.");
        var plain = item as TL.DialogFilter;
        var included = new List<string>();
        var pinned = new List<string>();
        foreach (var peer in item.PinnedPeers ?? Array.Empty<TL.InputPeer>())
        {
            var key = InputPeerId(peer);
            if (key.Length > 0) pinned.Add(key);
        }
        foreach (var peer in item.IncludePeers ?? Array.Empty<TL.InputPeer>())
        {
            var key = InputPeerId(peer);
            if (key.Length > 0 && !pinned.Contains(key)) included.Add(key);
        }
        var excluded = new List<string>();
        if (plain?.exclude_peers != null)
            foreach (var peer in plain.exclude_peers)
            {
                var key = InputPeerId(peer);
                if (key.Length > 0) excluded.Add(key);
            }
        return new
        {
            id,
            title = FilterTitle(item),
            shareable = item is TL.DialogFilterChatlist,
            includeContacts = HasFlag(plain, TL.DialogFilter.Flags.contacts),
            includeNonContacts = HasFlag(plain, TL.DialogFilter.Flags.non_contacts),
            includeGroups = HasFlag(plain, TL.DialogFilter.Flags.groups),
            includeChannels = HasFlag(plain, TL.DialogFilter.Flags.broadcasts),
            includeBots = HasFlag(plain, TL.DialogFilter.Flags.bots),
            excludeMuted = HasFlag(plain, TL.DialogFilter.Flags.exclude_muted),
            excludeRead = HasFlag(plain, TL.DialogFilter.Flags.exclude_read),
            excludeArchived = HasFlag(plain, TL.DialogFilter.Flags.exclude_archived),
            included,
            excluded,
            pinned
        };
    }

    private string InputPeerId(TL.InputPeer peer)
    {
        switch (peer)
        {
            case InputPeerSelf:
                return _client?.User == null ? "" : "u" + _client.User.id;
            case InputPeerUser user:
                return "u" + user.user_id;
            case InputPeerChat chat:
                return "g" + chat.chat_id;
            case InputPeerChannel channel:
                return "c" + channel.channel_id;
            default:
                return "";
            }
    }

    private static string[] IdsOf(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Array)
            return [];
        return value.EnumerateArray().Where(item => item.ValueKind == JsonValueKind.String)
            .Select(item => item.GetString() ?? "").Where(key => key.Length > 0).ToArray();
    }

    private async Task<object> FolderSaveAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = (int)Long(args, "id");
        var title = Str(args, "title").Trim();
        if (title.Length is < 1 or > 64) throw new BridgeException("El título de la carpeta debe tener entre 1 y 64 caracteres.");
        var shareable = Bool(args, "shareable");
        var filters = await LoadFiltersAsync();
        var original = id > 0 ? filters.FirstOrDefault(item => item.ID == id) : null;
        if (id > 0 && original == null) throw new BridgeException("Esta carpeta ya no existe.");

        var keys = new Dictionary<string, TL.InputPeer>();
        void Collect(TL.InputPeer? peer)
        {
            if (peer == null) return;
            var key = InputPeerId(peer);
            if (key.Length > 0) keys[key] = peer;
        }
        foreach (var filter in filters)
        {
            foreach (var peer in filter.PinnedPeers ?? Array.Empty<TL.InputPeer>()) Collect(peer);
            foreach (var peer in filter.IncludePeers ?? Array.Empty<TL.InputPeer>()) Collect(peer);
            if (filter is TL.DialogFilter plainFilter && plainFilter.exclude_peers != null)
                foreach (var peer in plainFilter.exclude_peers) Collect(peer);
        }
        TL.InputPeer Resolve(string key) => keys.TryGetValue(key, out var known) ? known
            : FindEntry(key)?.Input ?? throw new BridgeException("No se resolvió una conversación de esta carpeta. Actualiza la lista e inténtalo de nuevo.");

        var pinnedKeys = IdsOf(args, "pinned");
        var pinned = pinnedKeys.Distinct().Select(Resolve).ToArray();
        var included = IdsOf(args, "included").Distinct().Where(key => !pinnedKeys.Contains(key)).Select(Resolve).ToArray();
        var excluded = IdsOf(args, "excluded").Distinct().Select(Resolve).ToArray();

        var emoticon = original?.Emoticon;
        var color = original?.Color ?? 0;
        if (id == 0) id = filters.Where(item => item.ID > 0).Select(item => item.ID).DefaultIfEmpty(0).Max() + 1;
        TL.DialogFilterBase rebuilt;
        if (shareable || original is TL.DialogFilterChatlist)
        {
            rebuilt = new TL.DialogFilterChatlist
            {
                id = id,
                title = new TextWithEntities { text = title },
                emoticon = emoticon,
                color = color,
                pinned_peers = pinned,
                include_peers = pinned.Concat(included).ToArray()
            };
        }
        else
        {
            var flags = (TL.DialogFilter.Flags)0;
            if (Bool(args, "includeContacts")) flags |= TL.DialogFilter.Flags.contacts;
            if (Bool(args, "includeNonContacts")) flags |= TL.DialogFilter.Flags.non_contacts;
            if (Bool(args, "includeGroups")) flags |= TL.DialogFilter.Flags.groups;
            if (Bool(args, "includeChannels")) flags |= TL.DialogFilter.Flags.broadcasts;
            if (Bool(args, "includeBots")) flags |= TL.DialogFilter.Flags.bots;
            if (Bool(args, "excludeMuted")) flags |= TL.DialogFilter.Flags.exclude_muted;
            if (Bool(args, "excludeRead")) flags |= TL.DialogFilter.Flags.exclude_read;
            if (Bool(args, "excludeArchived")) flags |= TL.DialogFilter.Flags.exclude_archived;
            if (original is TL.DialogFilter oldPlain)
                flags |= oldPlain.flags & (TL.DialogFilter.Flags.title_noanimate | TL.DialogFilter.Flags.has_emoticon | TL.DialogFilter.Flags.has_color);
            rebuilt = new TL.DialogFilter
            {
                id = id,
                flags = flags,
                title = new TextWithEntities { text = title },
                emoticon = emoticon,
                color = color,
                pinned_peers = pinned,
                include_peers = pinned.Concat(included).ToArray(),
                exclude_peers = excluded
            };
        }
        await client.Messages_UpdateDialogFilter(id: id, filter: rebuilt);
        await LoadFoldersLocked();
        _dialogsDirty = true;
        return true;
    }

    private async Task<object> FolderDeleteAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = (int)Long(args, "id");
        var filters = await LoadFiltersAsync();
        if (filters.All(item => item.ID != id)) throw new BridgeException("Esta carpeta ya no existe.");
        await client.Messages_UpdateDialogFilter(id: id, filter: null);
        _folderLinks.Remove(id);
        await LoadFoldersLocked();
        _dialogsDirty = true;
        return true;
    }

    private async Task<object> FolderLinkAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = (int)Long(args, "id");
        var name = Str(args, "name").Trim();
        if (name.Length is < 1 or > 32) throw new BridgeException("El nombre del enlace debe tener entre 1 y 32 caracteres.");
        var filters = await LoadFiltersAsync();
        var chatlist = filters.FirstOrDefault(item => item.ID == id) as TL.DialogFilterChatlist
            ?? throw new BridgeException("Solo se pueden compartir las listas colaborativas, no las carpetas normales.");
        if (chatlist.include_peers == null || chatlist.include_peers.Length == 0)
            throw new BridgeException("Añade chats a la lista antes de compartirla.");
        var result = await client.Chatlists_ExportChatlistInvite(new InputChatlistDialogFilter { filter_id = id }, name, chatlist.include_peers);
        var url = result.invite?.url;
        if (string.IsNullOrWhiteSpace(url)) throw new BridgeException("Telegram no generó el enlace de invitación.");
        _folderLinks.Add(id);
        return new { link = url, name };
    }

    private async Task<object> FolderJoinAsync(JsonElement args)
    {
        var client = CollectionClient();
        var link = Str(args, "link").Trim();
        var match = Regex.Match(link, @"(?:t\.me|telegram\.me)/addlist/([A-Za-z0-9_\-]+)", RegexOptions.IgnoreCase);
        var slug = match.Success ? match.Groups[1].Value : link.TrimStart('/');
        if (slug.Length is < 1 or > 64) throw new BridgeException("El enlace de la lista no es válido.");
        var invite = await client.Chatlists_CheckChatlistInvite(slug);
        var peers = invite switch
        {
            Chatlists_ChatlistInviteAlready already => JoinPeers(already.missing_peers, () => MergePeers(already.users?.Values, already.chats?.Values)),
            Chatlists_ChatlistInvite full => JoinPeers(full.peers, () => MergePeers(full.users?.Values, full.chats?.Values)),
            _ => throw new BridgeException("Telegram no reconoció esta lista compartida.")
        };
        if (peers.Length > 0) await client.Chatlists_JoinChatlistInvite(slug, peers);
        await LoadFoldersLocked();
        _dialogsDirty = true;
        return true;
    }

    private TL.InputPeer[] JoinPeers(TL.Peer[]? peers, Action merge)
    {
        if (peers == null || peers.Length == 0) return [];
        merge();
        var inputs = peers.Select(peer => EntryFromPeer(peer)?.Input).OfType<TL.InputPeer>().ToArray();
        if (inputs.Length == 0)
            throw new BridgeException("No se pudo resolver el contenido de la lista. Actualiza la lista de chats e inténtalo de nuevo.");
        return inputs;
    }

    private async Task<object> FolderTagsAsync(JsonElement args)
    {
        var client = CollectionClient();
        if (args.ValueKind == JsonValueKind.Object && args.TryGetProperty("enabled", out var enabled)
            && enabled.ValueKind is JsonValueKind.True or JsonValueKind.False)
        {
            await client.Messages_ToggleDialogFilterTags(enabled.GetBoolean());
            return new { enabled = enabled.GetBoolean() };
        }
        var result = await client.Messages_GetDialogFilters();
        return new { enabled = (result.flags & Messages_DialogFilters.Flags.tags_enabled) != 0 };
    }

    // ---- impulsos -------------------------------------------------------------------

    private async Task<object> BoostStatusAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(Str(args, "id"));
        var status = await client.Premium_GetBoostsStatus(chat.Input);
        var giveaways = (status.prepaid_giveaways ?? Array.Empty<TL.PrepaidGiveawayBase>())
            .OfType<TL.PrepaidGiveaway>()
            .Select(giveaway => new
            {
                id = giveaway.id.ToString(),
                winnerCount = giveaway.quantity,
                boostCount = giveaway.months,
                paymentDate = Unix(giveaway.date),
                monthCount = giveaway.months,
                starCount = 0L
            }).ToArray();
        var percentage = 0.0;
        if (status.premium_audience is StatsPercentValue audience && audience.total > 0)
            percentage = Math.Clamp(audience.part / audience.total * 100.0, 0, 100);
        return new
        {
            level = status.level,
            boostCount = status.boosts,
            currentLevelBoostCount = status.current_level_boosts,
            nextLevelBoostCount = status.next_level_boosts,
            giftCodeBoostCount = status.gift_boosts,
            premiumMemberCount = 0,
            premiumMemberPercentage = Math.Round(percentage, 1),
            appliedSlotIds = status.my_boost_slots ?? Array.Empty<int>(),
            boostUrl = string.IsNullOrWhiteSpace(status.boost_url) ? null : status.boost_url,
            giveaways
        };
    }

    private async Task<object> BoostLinkAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(Str(args, "id"));
        var status = await client.Premium_GetBoostsStatus(chat.Input);
        if (string.IsNullOrWhiteSpace(status.boost_url))
            throw new BridgeException("Este chat no tiene enlace público de impulsos; compártelo desde Telegram oficial.");
        return new { link = status.boost_url, isPublic = chat.Username != null };
    }

    private async Task<object> BoostSlotsAsync()
    {
        var client = CollectionClient();
        return BoostSlotsDto(await client.Premium_GetMyBoosts());
    }

    private static object BoostSlotsDto(Premium_MyBoosts mine)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var items = (mine.my_boosts ?? Array.Empty<TL.MyBoost>()).Select(boost =>
        {
            var inUse = boost.peer != null;
            var expires = Unix(boost.expires);
            var cooldown = Unix(boost.cooldown_until_date);
            return new
            {
                slotId = boost.slot,
                chatId = boost.peer != null ? ChatIdOf(boost.peer) ?? "0" : "0",
                startDate = Unix(boost.date),
                expirationDate = expires,
                cooldownUntilDate = cooldown,
                inUse,
                available = !inUse && (cooldown == 0 || cooldown <= now),
                expired = inUse && expires > 0 && expires <= now
            };
        }).OrderBy(item => item.slotId).ToArray();
        return new { total = items.Length, available = items.Count(item => item.available), items };
    }

    private async Task<object> BoostApplyAsync(JsonElement args)
    {
        var client = CollectionClient();
        var chat = RequireEntry(Str(args, "id"));
        var slots = IntArray(args, "slots");
        if (slots.Length == 0) throw new BridgeException("Selecciona un hueco libre para impulsar este chat.");
        return BoostSlotsDto(await client.Premium_ApplyBoost(chat.Input, slots));
    }

    // ---- cartera de Stars --------------------------------------------------------------

    private static long StarsOf(TL.StarsAmountBase? amount) => amount is TL.StarsAmount value ? value.amount : 0;
    private static int NanosOf(TL.StarsAmountBase? amount) => amount is TL.StarsAmount value ? value.nanos : 0;
    private static object? StarAmountDto(TL.StarsAmountBase? amount) => amount == null
        ? null
        : new { starCount = StarsOf(amount), nanostarCount = NanosOf(amount) };

    private async Task<object> StarsTransactionsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var direction = Str(args, "direction", "all");
        if (direction is not ("all" or "in" or "out")) throw new BridgeException("La dirección de los movimientos no es válida.");
        var status = await client.Payments_GetStarsTransactions(new InputPeerSelf(), Str(args, "offset"),
            limit: Math.Clamp((int)Long(args, "limit", 50), 1, 100),
            inbound: direction == "in", outbound: direction == "out");
        MergePeers(status.users?.Values, status.chats?.Values);
        return new
        {
            starCount = StarsOf(status.balance),
            transactions = (status.history ?? Array.Empty<TL.StarsTransaction>()).Select(StarTransactionDto).ToArray(),
            nextOffset = status.next_offset ?? ""
        };
    }

    private object StarTransactionDto(TL.StarsTransaction transaction)
    {
        string kind = "unsupported";
        string label = "Movimiento de Stars no reconocido por esta versión";
        string? chatId = null;
        string? title = null;
        if (transaction.peer is TL.StarsTransactionPeer peer && peer.peer != null)
        {
            var entry = EntryFromPeer(peer.peer);
            kind = peer.peer is PeerUser ? "user" : "peer";
            chatId = entry?.Id;
            title = entry?.Title;
            label = entry?.Title ?? "Conversación desconocida";
        }
        else if (transaction.peer is TL.StarsTransactionPeerAppStore) { kind = "appStore"; label = "Compra de Stars en la App Store"; }
        else if (transaction.peer is TL.StarsTransactionPeerPlayMarket) { kind = "playMarket"; label = "Compra de Stars en Play Store"; }
        else if (transaction.peer is TL.StarsTransactionPeerFragment) { kind = "fragment"; label = transaction.transaction_url != null ? "Retiro vía Fragment" : "Compra vía Fragment"; }
        else if (transaction.peer is TL.StarsTransactionPeerAds) { kind = "ads"; label = "Publicidad de Telegram"; }
        else if (transaction.peer is TL.StarsTransactionPeerPremiumBot) { kind = "premiumBot"; label = "Telegram Premium"; }
        else if (transaction.peer is TL.StarsTransactionPeerAPI) { kind = "api"; label = "Uso de la API de Telegram"; }
        return new
        {
            id = transaction.id ?? "",
            date = Unix(transaction.date),
            refund = (transaction.flags & TL.StarsTransaction.Flags.refund) != 0,
            starCount = StarsOf(transaction.amount),
            nanostarCount = NanosOf(transaction.amount),
            kind,
            label,
            chatId,
            title = (transaction.flags & TL.StarsTransaction.Flags.has_title) != 0 ? transaction.title : null,
            period = (transaction.flags & TL.StarsTransaction.Flags.has_subscription_period) != 0 ? (long?)transaction.subscription_period : null
        };
    }

    private async Task<object> StarsSubscriptionsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var expiring = Bool(args, "expiring");
        var status = await client.Payments_GetStarsSubscriptions(new InputPeerSelf(), Str(args, "offset"), missing_balance: expiring);
        MergePeers(status.users?.Values, status.chats?.Values);
        return new
        {
            starCount = StarsOf(status.balance),
            requiredStarCount = status.subscriptions_missing_balance,
            subscriptions = (status.subscriptions ?? Array.Empty<TL.StarsSubscription>())
                .Select(subscription => StarSubscriptionDto(subscription, expiring)).ToArray(),
            nextOffset = status.subscriptions_next_offset ?? ""
        };
    }

    private object StarSubscriptionDto(TL.StarsSubscription subscription, bool expiring)
    {
        string? chatId = null;
        var title = "";
        if (subscription.peer != null)
        {
            chatId = ChatIdOf(subscription.peer);
            title = ChatTitleOf(subscription.peer);
        }
        var canceled = (subscription.flags & TL.StarsSubscription.Flags.canceled) != 0;
        return new
        {
            id = subscription.id ?? "",
            chatId,
            title = (subscription.flags & TL.StarsSubscription.Flags.has_title) != 0 && !string.IsNullOrEmpty(subscription.title)
                ? subscription.title
                : string.IsNullOrEmpty(title) ? "Suscripción de Stars" : title,
            expirationDate = Unix(subscription.until_date),
            canceled,
            expiring = expiring && (subscription.flags & TL.StarsSubscription.Flags.missing_balance) != 0 && !canceled,
            period = (long)subscription.pricing.period,
            starCount = subscription.pricing.amount,
            kind = subscription.chat_invite_hash != null ? "channel" : "bot",
            canReuse = (subscription.flags & TL.StarsSubscription.Flags.can_refulfill) != 0 && subscription.invoice_slug != null,
            inviteLink = subscription.chat_invite_hash != null ? "https://t.me/" + subscription.chat_invite_hash : null,
            canceledByBot = (subscription.flags & TL.StarsSubscription.Flags.bot_canceled) != 0
        };
    }

    private async Task<object> StarsSubscriptionCancelAsync(JsonElement args, bool canceled)
    {
        var client = CollectionClient();
        var id = Str(args, "id");
        if (id.Length == 0) throw new BridgeException("Falta el identificador de la suscripción.");
        await client.Payments_ChangeStarsSubscription(new InputPeerSelf(), id, canceled: canceled);
        return true;
    }

    private async Task<object> StarsSubscriptionReuseAsync(JsonElement args)
    {
        var client = CollectionClient();
        var id = Str(args, "id");
        if (id.Length == 0) throw new BridgeException("Falta el identificador de la suscripción.");
        var status = await client.Payments_GetStarsSubscriptions(new InputPeerSelf(), "");
        var subscription = (status.subscriptions ?? Array.Empty<TL.StarsSubscription>()).FirstOrDefault(item => item.id == id)
            ?? throw new BridgeException("No se encontró la suscripción. Actualiza la lista de suscripciones.");
        if ((subscription.flags & TL.StarsSubscription.Flags.can_refulfill) == 0 || string.IsNullOrEmpty(subscription.invoice_slug))
            throw new BridgeException("Esta suscripción se renueva desde el propio bot o canal en Telegram.");
        await client.Payments_FulfillStarsSubscription(new InputPeerSelf(), id);
        return true;
    }

    private async Task<object> StarsOptionsAsync()
    {
        var client = CollectionClient();
        var options = await client.Payments_GetStarsTopupOptions();
        return new
        {
            options = options.Select(option => new
            {
                currency = option.currency ?? "",
                amount = option.amount,
                starCount = option.stars,
                additional = (option.flags & TL.StarsTopupOption.Flags.extended) != 0
            }).ToArray(),
            notice = "Los paquetes se compran con dinero real en Telegram oficial desde la tienda; el saldo aparece aquí al acreditarse."
        };
    }

    private async Task<object> StarsRevenueAsync(JsonElement args)
    {
        var client = CollectionClient();
        var peer = RevenuePeer(args);
        var stats = await client.Payments_GetStarsRevenueStats(peer, ton: false);
        var status = stats.status;
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var nextIn = (status.flags & TL.StarsRevenueStatus.Flags.has_next_withdrawal_at) != 0 && status.next_withdrawal_at > DateTime.UtcNow
            ? Unix(status.next_withdrawal_at) - now
            : 0;
        return new
        {
            usdRate = stats.usd_rate,
            total = StarAmountDto(status.overall_revenue),
            current = StarAmountDto(status.current_balance),
            available = StarAmountDto(status.available_balance),
            withdrawalEnabled = (status.flags & TL.StarsRevenueStatus.Flags.withdrawal_enabled) != 0,
            nextWithdrawalIn = nextIn
        };
    }

    private async Task<object> StarsWithdrawAsync(JsonElement args)
    {
        var client = CollectionClient();
        var password = Str(args, "password");
        if (password.Length == 0)
            throw new BridgeException("Escribe tu contraseña de dos pasos para autorizar la retirada.");
        var peer = RevenuePeer(args);
        var info = await client.Account_GetPassword();
        var srp = await Client.InputCheckPassword(info, password);
        long? amount = Long(args, "amount");
        if (amount is not > 0) amount = null;
        var url = await client.Payments_GetStarsRevenueWithdrawalUrl(peer, srp, amount: amount);
        if (string.IsNullOrWhiteSpace(url?.url)) throw new BridgeException("Telegram no generó el enlace de retirada.");
        OpenLink(url.url);
        return true;
    }

    private async Task<object> StarsAdsUrlAsync(JsonElement args)
    {
        var client = CollectionClient();
        var url = await client.Payments_GetStarsRevenueAdsAccountUrl(RevenuePeer(args));
        if (string.IsNullOrWhiteSpace(url?.url)) throw new BridgeException("Telegram no generó el enlace de la cuenta de anuncios.");
        OpenLink(url.url);
        return true;
    }

    private TL.InputPeer RevenuePeer(JsonElement args) =>
        Str(args, "id").Length > 0 ? RequireEntry(Str(args, "id")).Input : new InputPeerSelf();

    // ---- cola de descargas ---------------------------------------------------------------

    private void TrackDownload(long id)
    {
        if (!_downloadTracked.ContainsKey(id)) _downloadTracked[id] = DateTime.UtcNow;
    }

    private void ResumeDownload(long id)
    {
        _ = Task.Run(async () =>
        {
            try { await _media.EnsureFileAsync(id); }
            catch (Exception ex) { _state.Error = Describe(ex); }
            Push();
        });
    }

    private string DownloadState(long id)
    {
        if (_media.IsReady(id) == true) return "completed";
        if (_downloadPaused.Contains(id) || _downloadsPausedAll) return "paused";
        if (_media.IsLoading(id)) return "downloading";
        if (_media.IsFailed(id)) return "stopped";
        return "downloading";
    }

    private void ForgetDownload(long id)
    {
        _downloadTracked.Remove(id);
        _downloadPaused.Remove(id);
    }

    private Task<object> DownloadsStatusAsync()
    {
        long totalSize = 0;
        long downloadedSize = 0;
        foreach (var id in _downloadTracked.Keys)
        {
            var size = _media.MetaOf(id)?.Size ?? 0;
            totalSize += size;
            if (DownloadState(id) == "completed") downloadedSize += size;
        }
        return Task.FromResult<object>(new
        {
            paused = _downloadsPausedAll,
            totalCount = _downloadTracked.Count,
            totalSize,
            downloadedSize
        });
    }

    private Task<object> DownloadsQueueAsync(JsonElement args)
    {
        var query = Str(args, "query").Trim();
        var onlyActive = Bool(args, "active");
        var onlyCompleted = Bool(args, "completed");
        var offset = (int)Math.Max(0, Long(args, "offset"));
        var limit = Math.Clamp((int)Long(args, "limit", QueuePageSize), 1, 100);
        var rows = _downloadTracked.OrderByDescending(pair => pair.Value)
            .Select(pair => new { pair.Key, State = DownloadState(pair.Key), Meta = _media.MetaOf(pair.Key), Date = pair.Value })
            .Where(row => onlyActive ? row.State == "downloading" : onlyCompleted ? row.State == "completed" : true)
            .Where(row => query.Length == 0 || (row.Meta?.Name?.Contains(query, StringComparison.OrdinalIgnoreCase) ?? false))
            .ToArray();
        var items = rows.Skip(offset).Take(limit).Select(row =>
        {
            var size = row.Meta?.Size ?? 0;
            var completed = row.State == "completed";
            var date = Unix(row.Date);
            return new
            {
                fileId = row.Key,
                name = row.Meta?.Name ?? "Archivo",
                kind = row.Meta?.Kind ?? "file",
                size,
                downloaded = completed ? size : 0,
                progress = completed ? 100 : 0,
                state = row.State,
                date,
                completeDate = completed ? date : 0,
                chatId = "",
                messageId = "",
                chatTitle = "",
                canPause = row.State == "paused",
                canCancel = row.State == "paused",
                canRetry = row.State == "stopped"
            };
        }).ToArray();
        return Task.FromResult<object>(new
        {
            counts = new
            {
                active = _downloadTracked.Count(pair => DownloadState(pair.Key) == "downloading"),
                paused = _downloadTracked.Count(pair => DownloadState(pair.Key) == "paused"),
                completed = _downloadTracked.Count(pair => DownloadState(pair.Key) == "completed")
            },
            items,
            nextOffset = offset + limit < rows.Length ? (offset + limit).ToString() : ""
        });
    }

    private Task<object> DownloadsPauseAsync(JsonElement args)
    {
        var value = Bool(args, "value");
        if (value == _downloadsPausedAll) return Task.FromResult<object>(true);
        _downloadsPausedAll = value;
        if (!value)
        {
            var resume = _downloadPaused.ToList();
            _downloadPaused.Clear();
            foreach (var id in resume)
                if (DownloadState(id) != "completed") ResumeDownload(id);
        }
        return Task.FromResult<object>(true);
    }

    private Task<object> DownloadItemPauseAsync(JsonElement args)
    {
        var id = Long(args, "fileId");
        if (!_downloadTracked.ContainsKey(id)) throw new BridgeException("Este archivo ya no está en la cola de descargas.");
        if (Bool(args, "value"))
        {
            if (DownloadState(id) == "downloading")
                throw new BridgeException("Las descargas activas no se pueden pausar una a una en esta versión; usa «Pausar descargas».");
            _downloadPaused.Add(id);
        }
        else if (_downloadPaused.Remove(id) && DownloadState(id) != "completed") ResumeDownload(id);
        return Task.FromResult<object>(true);
    }

    private Task<object> DownloadItemCancelAsync(JsonElement args)
    {
        var id = Long(args, "fileId");
        if (!_downloadTracked.ContainsKey(id)) throw new BridgeException("Este archivo ya no está en la cola de descargas.");
        if (DownloadState(id) == "downloading")
            throw new BridgeException("Las descargas activas no se pueden cancelar en esta versión; espera a que terminen.");
        ForgetDownload(id);
        return Task.FromResult<object>(true);
    }

    private Task<object> DownloadItemAddAsync(JsonElement args)
    {
        var id = Long(args, "fileId");
        if (!_media.Known(id))
            throw new BridgeException("Ese archivo ya no está disponible en esta sesión. Abre de nuevo la conversación.");
        TrackDownload(id);
        _downloadPaused.Remove(id);
        if (DownloadState(id) != "completed") ResumeDownload(id);
        return Task.FromResult<object>(true);
    }

    private Task<object> DownloadItemRemoveAsync(JsonElement args)
    {
        var id = Long(args, "fileId");
        if (DownloadState(id) != "completed")
            throw new BridgeException("Solo se puede quitar de la lista una descarga completada.");
        ForgetDownload(id);
        return Task.FromResult<object>(true);
    }

    // ---- auxiliares ------------------------------------------------------------------

    private string ChatTitleOf(TL.Peer peer) => EntryFromPeer(peer)?.Title ?? "Chat " + (ChatIdOf(peer) ?? "0");

    private static int[] IntArray(JsonElement args, string name)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Array)
            return [];
        var list = new List<int>();
        foreach (var item in value.EnumerateArray())
            if (item.ValueKind == JsonValueKind.Number && item.TryGetInt32(out var number)) list.Add(number);
        return list.ToArray();
    }
}
