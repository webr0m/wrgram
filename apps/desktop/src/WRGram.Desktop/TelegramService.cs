using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using TL;
using WTelegram;

namespace WRGram.Desktop;

public sealed partial class TelegramService : IAsyncDisposable
{
    private sealed class ChatEntry
    {
        public string Id = "";
        public TL.Peer Peer = null!;
        public TL.InputPeer Input = null!;
        public string Title = "";
        public string Type = "private";
        public bool Bot;
        public bool Pinned;
        public bool Archived;
        public bool Muted;
        public int Unread;
        public int ReadInbox;
        public int ReadOutbox;
        public int TopMessage;
        public long Date;
        public bool? Supergroup;
        public bool? IsForum;
        public bool? IsContact;
        public string? Username;
        public string? Draft;
        public MediaDto? Photo;
    }

    private readonly DesktopStore _store;
    private readonly MediaRegistry _media;
    private readonly DesktopState _state;
    private readonly Action _push;
    private readonly Action _appearanceChanged;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CancellationTokenSource _dispose = new();
    private readonly ConcurrentQueue<UpdatesBase> _updates = new();
    private readonly ConcurrentQueue<Update> _others = new();
    private readonly Dictionary<long, User> _users = new();
    private readonly Dictionary<long, ChatBase> _chats = new();
    private readonly Dictionary<string, ChatEntry> _entries = new();
    private readonly Dictionary<string, Dictionary<int, string>> _textCache = new();

    private Client? _client;
    private string _active = "0";
    private string _mode = "main";
    private int _oldestId;
    private int _newestId;
    private bool _latest;
    private bool _historyEnd;
    private bool _historyDirty;
    private bool _dialogsDirty;
    private DateTime _lastHistoryLoad;
    private DateTime _lastDialogsLoad;

    public TelegramService(DesktopStore store, MediaRegistry media, DesktopState state, Action push, Action appearanceChanged)
    {
        _store = store;
        _media = media;
        _state = state;
        _push = push;
        _appearanceChanged = appearanceChanged;
        _state.Appearance = store.Appearance;
        _state.Consent = store.Consent;
        _media.Changed += Push;
        _ = PumpLoopAsync();
    }

    public Client? Client => _client;

    public async Task InitializeAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_store.HasSession)
            {
                try { await ConnectCoreLocked(quiet: true); }
                catch
                {
                    DisposeClientLocked();
                    _state.Ready = false;
                    _state.Auth = "welcome";
                }
            }
            Push();
        }
        finally { _gate.Release(); }
    }

    public async Task<object?> HandleAsync(string method, JsonElement args)
    {
        if (method == "media.load")
        {
            _ = LoadMediaAsync(Long(args, "id"));
            return true;
        }
        if (method == "media.retry") return _media.RetryFailed();

        await _gate.WaitAsync();
        try
        {
            object? result = method switch
            {
                "connect" => await ConnectAsync(),
                "authenticate" => await AuthenticateAsync(Str(args, "value")),
                "auth.register" => await RegisterAsync(args),
                "auth.resend" => throw new BridgeException("El reenvío de código no está disponible en esta beta de escritorio."),
                "authenticate.qr" => throw new BridgeException("El acceso por QR no está disponible en esta beta de escritorio. Usa tu número y el código."),
                "auth.recover.request" or "auth.recover.reset" => throw new BridgeException("La recuperación de la contraseña de dos pasos no está disponible en escritorio."),
                "logout" => await LogoutAsync(),
                "accounts.list" => Accounts(),
                "accounts.add" or "accounts.switch" or "accounts.remove" => throw new BridgeException("La multitarea de cuentas no está disponible en escritorio (beta)."),
                "appearance" => Appearance(args),
                "chats.list" => await LoadDialogsAsync(Str(args, "list", "main")),
                "chats.more" => await LoadMoreDialogsAsync(),
                "chats.search" => await SearchChatsAsync(args),
                "saved.sources" => await SavedSourcesAsync(args),
                "saved.history" => await SavedHistoryAsync(args),
                "gallery.list" => await GalleryAsync(args),
                "chat.open" => await OpenChatAsync(Str(args, "id"), checked((int)Long(args, "messageId"))),
                "chat.close" => true,
                "chat.saved" => await OpenSavedAsync(),
                "chat.read" => await ReadActiveAsync(),
                "chat.pinned" => null,
                "chat.mute" => await MuteAsync(args),
                "history.older" => await LoadOlderAsync(),
                "history.newer" => await LoadNewerAsync(),
                "history.refresh" => await RefreshHistoryAsync(),
                "typing" => await TypingAsync(args),
                "draft.set" => await DraftAsync(args),
                "send.text" => await SendAsync(args),
                "message.copy" => CopyMessage(Str(args, "id")),
                "message.properties" => Properties(Str(args, "id")),
                "media.export" => await ExportMediaAsync(Long(args, "id")),
                "retry" => await RetryAsync(),
                "error.clear" => ClearError(),
                "app.background" => true,
                "native.settings" => OpenDataFolder(),
                "link.open" => OpenLink(Str(args, "url")),
                "notifications.status" => new { configured = false, enabled = false, permission = false, registered = false, status = "No disponible en escritorio" },
                "messages.search" => await MessagesSearchAsync(args),
                "messages.search.more" => await MessagesSearchMoreAsync(args),
                "message.translate" => await TranslateMessageAsync(args),
                "message.transcribe" => await TranscribeAsync(args),
                "message.transcribe.rate" => await TranscribeRateAsync(args),
                "business.quick.list" => await QuickListAsync(),
                "business.quick.messages" => await QuickMessagesAsync(args),
                "business.quick.add" => await QuickAddAsync(args),
                "business.quick.name" => await QuickNameAsync(args),
                "business.quick.edit" => await QuickEditAsync(args),
                "business.quick.delete" => await QuickDeleteAsync(args),
                "business.quick.send" => await QuickSendAsync(args),
                "folders.list" => await FoldersListAsync(),
                "folders.get" => await FolderGetAsync(args),
                "folders.save" => await FolderSaveAsync(args),
                "folders.delete" => await FolderDeleteAsync(args),
                "folders.link" => await FolderLinkAsync(args),
                "folders.join" => await FolderJoinAsync(args),
                "chat.folderTags" => await FolderTagsAsync(args),
                "chat.boost.status" => await BoostStatusAsync(args),
                "chat.boost.link" => await BoostLinkAsync(args),
                "chat.boost.slots" => await BoostSlotsAsync(),
                "chat.boost.apply" => await BoostApplyAsync(args),
                "stars.transactions" => await StarsTransactionsAsync(args),
                "stars.subscriptions" => await StarsSubscriptionsAsync(args),
                "stars.subscription.cancel" => await StarsSubscriptionCancelAsync(args, canceled: true),
                "stars.subscription.resume" => await StarsSubscriptionCancelAsync(args, canceled: false),
                "stars.subscription.reuse" => await StarsSubscriptionReuseAsync(args),
                "stars.options" => await StarsOptionsAsync(),
                "stars.revenue" => await StarsRevenueAsync(args),
                "stars.withdraw" => await StarsWithdrawAsync(args),
                "stars.ads.url" => await StarsAdsUrlAsync(args),
                "downloads.status" => await DownloadsStatusAsync(),
                "downloads.pause" => await DownloadsPauseAsync(args),
                "downloads.queue" => await DownloadsQueueAsync(args),
                "downloads.item.pause" => await DownloadItemPauseAsync(args),
                "downloads.item.cancel" => await DownloadItemCancelAsync(args),
                "downloads.item.add" => await DownloadItemAddAsync(args),
                "downloads.item.remove" => await DownloadItemRemoveAsync(args),
                "contacts.sync.status" => new { enabled = false, running = false, last = 0L, matched = 0, imported = 0, skipped = false, error = "No disponible en escritorio" },
                "updates.check" => _state.Update,
                "sponsored.retry" => null,
                "access.declare" or "access.privacy" or "access.terms" => true,
                "state" => _state,
                _ => throw new BridgeException($"No disponible en escritorio (beta): {method}")
            };
            Push();
            return result;
        }
        finally { _gate.Release(); }
    }

    public void Push()
    {
        _state.MediaReady = _media.ReadyIds();
        _state.MediaLoading = _media.LoadingIds();
        _state.MediaFailed = _media.FailedIds();
        _push();
    }

    // ---- connection and login -------------------------------------------------

    private async Task<object?> ConnectAsync()
    {
        _state.Busy = true;
        _state.Error = "";
        Push();
        try
        {
            _state.Consent = true;
            _store.SetConsent(true);
            await ConnectCoreLocked(quiet: false);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.Busy = false;
            Push();
        }
    }

    private async Task ConnectCoreLocked(bool quiet)
    {
        if (_client?.User != null)
        {
            if (!_state.Ready) await CompleteLoginLocked();
            return;
        }

        var (apiId, apiHash) = _store.LoadCredentials();
        DisposeClientLocked();
        _client = new Client(apiId, apiHash, _store.SessionPath)
        {
            PingInterval = 60
        };
        _client.OnUpdates += QueueUpdates;
        _client.OnOther += QueueOther;

        try
        {
            await _client.ConnectAsync();
        }
        catch (Exception ex)
        {
            DisposeClientLocked();
            if (quiet) throw;
            throw new BridgeException("No se pudo conectar con Telegram. Revisa la red e inténtalo de nuevo.", ex);
        }

        _state.Online = !_client.Disconnected;
        _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
        if (_client.User != null)
        {
            await CompleteLoginLocked();
            return;
        }
        _state.Ready = false;
        _state.Auth = "phone";
        _state.Busy = false;
        if (!quiet) Push();
    }

    private async Task CompleteLoginLocked()
    {
        var user = _client?.User ?? throw new BridgeException("Telegram no confirmó la sesión.");
        _state.Ready = true;
        _state.Auth = "closed";
        _state.Consent = true;
        _state.Busy = false;
        _state.SelfId = user.id.ToString();
        _state.Name = FullName(user);
        _state.ProfilePhoto = _media.RegisterProfile(user, user.photo != null, "self:" + user.id, _state.Name);
        _state.CanSend = true;
        _state.Online = !(_client?.Disconnected ?? true);
        _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
        _state.Error = "";
        _state.Notice = "";
        _state.ChatsBusy = true;
        Push();

        await LoadFoldersLocked();
        await LoadDialogsLocked(_mode, quiet: true);
        _state.ChatsBusy = false;
        Push();
    }

    private async Task<object?> AuthenticateAsync(string value)
    {
        if (_client == null) throw new BridgeException("Pulsa Continuar con Telegram para iniciar la conexión.");
        if (string.IsNullOrWhiteSpace(value)) throw new BridgeException("Escribe el dato que pide Telegram.");
        _state.Busy = true;
        _state.Error = "";
        Push();
        try
        {
            var next = await _client.Login(value.Trim());
            await AfterLoginStepLocked(next);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.Busy = false;
            Push();
        }
    }

    private async Task<object?> RegisterAsync(JsonElement args)
    {
        var first = Str(args, "firstName").Trim();
        var last = Str(args, "lastName").Trim();
        if (first.Length == 0) throw new BridgeException("Escribe tu nombre para crear la cuenta.");
        return await AuthenticateAsync((first + " " + last).Trim());
    }

    private async Task AfterLoginStepLocked(string? next)
    {
        if (_client?.User != null)
        {
            await CompleteLoginLocked();
            return;
        }

        switch (next)
        {
            case "verification_code":
                _state.Auth = "code";
                break;
            case "password":
                _state.Auth = "password";
                await LoadPasswordHintLocked();
                break;
            case "name":
                _state.Auth = "registration";
                break;
            case "email":
                _state.Auth = "email";
                break;
            case "email_verification_code":
                _state.Auth = "emailCode";
                break;
            case "phone_number":
                _state.Auth = "phone";
                break;
            default:
                if (_client?.User != null) await CompleteLoginLocked();
                else if (string.IsNullOrEmpty(next)) throw new BridgeException("Telegram no completó el inicio de sesión. Inténtalo de nuevo.");
                else _state.Auth = "phone";
                break;
        }
    }

    private async Task LoadPasswordHintLocked()
    {
        try
        {
            var password = await _client!.Account_GetPassword();
            _state.AuthHint = string.IsNullOrWhiteSpace(password.hint) ? null : password.hint;
        }
        catch
        {
            _state.AuthHint = null;
        }
    }

    private async Task<object?> LogoutAsync()
    {
        try
        {
            if (_client?.User != null) await _client.Auth_LogOut();
        }
        catch { }
        DisposeClientLocked();
        try { if (File.Exists(_store.SessionPath)) File.Delete(_store.SessionPath); } catch { }

        _users.Clear();
        _chats.Clear();
        _entries.Clear();
        _textCache.Clear();
        _savedOrigins.Clear();
        _active = "0";
        _mode = "main";
        _state.ResetSession();
        _state.Consent = false;
        _store.SetConsent(false);
        return true;
    }

    private async Task<object?> RetryAsync()
    {
        if (_client == null)
        {
            await ConnectCoreLocked(quiet: false);
            return true;
        }
        try
        {
            await _client.ConnectAsync();
            _state.Online = !_client.Disconnected;
            _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
            if (_client.User != null && !_state.Ready) await CompleteLoginLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    // ---- dialogs and chats ----------------------------------------------------

    private async Task<object?> LoadDialogsAsync(string list, bool quiet = false)
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para cargar las conversaciones.");
        if (!quiet)
        {
            _state.ChatsBusy = true;
            Push();
        }
        try
        {
            await LoadDialogsLocked(list, quiet);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.ChatsBusy = false;
            Push();
        }
    }

    private async Task LoadDialogsLocked(string list, bool quiet = false)
    {
        if (_client?.User == null) return;
        _mode = list;
        var folder = list == "archive" ? 1 : list.StartsWith("folder:") && int.TryParse(list[7..], out var id) ? id : 0;
        if (folder > 1 && _chatlistIds.Contains(folder))
            throw new BridgeException("Las listas colaborativas todavía no se abren como pestaña en esta versión de escritorio.");

        var result = await _client.Messages_GetDialogs(limit: 60, folder_id: folder);
        if (result is Messages_Dialogs page)
        {
            MergePeers(page.users.Values, page.chats.Values);
            BuildChats(page.Dialogs, page.Messages, folder);
            _state.ChatsEnd = result is not Messages_DialogsSlice;
        }

        _lastDialogsLoad = DateTime.UtcNow;
        _dialogsDirty = false;
        if (!quiet) Push();
    }

    private void BuildChats(DialogBase[] dialogs, MessageBase[] messages, int folder)
    {
        _entries.Clear();
        var chats = new List<ChatDto>();
        foreach (var dialog in dialogs.OfType<TL.Dialog>())
        {
            var entry = EntryFromPeer(dialog.peer);
            if (entry == null) continue;

            entry.Pinned = (dialog.flags & TL.Dialog.Flags.pinned) != 0;
            entry.Archived = folder == 1 || dialog.folder_id == 1;
            entry.Muted = dialog.notify_settings?.mute_until > DateTime.UtcNow;
            entry.Unread = dialog.unread_count;
            entry.ReadInbox = dialog.read_inbox_max_id;
            entry.ReadOutbox = dialog.read_outbox_max_id;
            entry.TopMessage = dialog.top_message;
            if (dialog.draft is DraftMessage draft) entry.Draft = draft.message;

            var top = messages.FirstOrDefault(message => message.ID == dialog.top_message);
            entry.Date = top != null ? Unix(top.Date) : 0;
            _entries[entry.Id] = entry;

            chats.Add(new ChatDto
            {
                Id = entry.Id,
                Title = entry.Title,
                Preview = PreviewOf(top),
                Date = entry.Date,
                Unread = entry.Unread,
                ReadInbox = entry.ReadInbox.ToString(),
                Marked = (dialog.flags & TL.Dialog.Flags.unread_mark) != 0,
                Bot = entry.Bot,
                Type = entry.Type,
                Pinned = entry.Pinned,
                Muted = entry.Muted,
                Archived = entry.Archived,
                Photo = entry.Photo,
                Supported = true,
                Username = entry.Username,
                Draft = entry.Draft,
                IsContact = entry.IsContact,
                Supergroup = entry.Supergroup,
                IsForum = entry.IsForum
            });
        }
        if (_active != "0" && chats.All(chat => chat.Id != _active) && FindEntry(_active) is { } active)
            chats.Add(LookupDto(active));
        _state.Chats = chats;
    }

    private async Task<object?> LoadMoreDialogsAsync()
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para cargar más conversaciones.");
        if (_state.ChatsEnd) return false;
        var lastDto = _state.Chats.LastOrDefault(chat => chat.InList);
        if (lastDto == null) return await LoadDialogsAsync(_mode);
        if (_state.ChatsBusy) return true;

        _state.ChatsBusy = true;
        Push();
        try
        {
            if (!_entries.TryGetValue(lastDto.Id, out var last) || last.Input == null) return false;
            var folder = _mode == "archive" ? 1 : _mode.StartsWith("folder:") && int.TryParse(_mode[7..], out var id) ? id : 0;
            var offsetDate = last.Date > 0 ? DateTimeOffset.FromUnixTimeSeconds(last.Date).UtcDateTime : default;
            var result = await _client.Messages_GetDialogs(offset_date: offsetDate, offset_id: last.TopMessage, offset_peer: last.Input, limit: 60, folder_id: folder);
            if (result is not Messages_Dialogs page) return false;

            MergePeers(page.users.Values, page.chats.Values);
            var known = _state.Chats.Where(chat => chat.InList).Select(chat => chat.Id).ToHashSet();
            var added = 0;
            foreach (var dialog in page.Dialogs.OfType<TL.Dialog>())
            {
                var entry = EntryFromPeer(dialog.peer);
                if (entry == null || !known.Add(entry.Id)) continue;
                entry.Pinned = (dialog.flags & TL.Dialog.Flags.pinned) != 0;
                entry.Archived = folder == 1 || dialog.folder_id == 1;
                entry.Muted = dialog.notify_settings?.mute_until > DateTime.UtcNow;
                entry.Unread = dialog.unread_count;
                entry.ReadInbox = dialog.read_inbox_max_id;
                entry.ReadOutbox = dialog.read_outbox_max_id;
                entry.TopMessage = dialog.top_message;
                var top = page.Messages.FirstOrDefault(message => message.ID == dialog.top_message);
                entry.Date = top != null ? Unix(top.Date) : 0;
                _entries[entry.Id] = entry;
                _state.Chats.RemoveAll(chat => chat.Id == entry.Id && !chat.InList);
                _state.Chats.Add(new ChatDto
                {
                    Id = entry.Id,
                    Title = entry.Title,
                    Preview = PreviewOf(top),
                    Date = entry.Date,
                    Unread = entry.Unread,
                    ReadInbox = entry.ReadInbox.ToString(),
                    Marked = (dialog.flags & TL.Dialog.Flags.unread_mark) != 0,
                    Bot = entry.Bot,
                    Type = entry.Type,
                    Pinned = entry.Pinned,
                    Muted = entry.Muted,
                    Archived = entry.Archived,
                    Photo = entry.Photo,
                    Supported = true,
                    Username = entry.Username,
                    IsContact = entry.IsContact,
                    Supergroup = entry.Supergroup,
                    IsForum = entry.IsForum
                });
                added++;
            }
            _state.ChatsEnd = result is not Messages_DialogsSlice || added == 0;
            _lastDialogsLoad = DateTime.UtcNow;
            _dialogsDirty = false;
            return added > 0;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.ChatsBusy = false;
            Push();
        }
    }

    private async Task LoadFoldersLocked()
    {
        try
        {
            var filters = await _client!.Messages_GetDialogFilters();
            var folders = new List<FolderDto>();
            _chatlistIds.Clear();
            if (filters.filters != null)
                foreach (var filter in filters.filters)
                {
                    if (filter is DialogFilter item && item.id > 0)
                        folders.Add(new FolderDto { Id = item.id, Title = item.title?.text ?? $"Carpeta {item.id}" });
                    else if (filter is DialogFilterChatlist list && list.id > 0)
                    {
                        _chatlistIds.Add(list.id);
                        folders.Add(new FolderDto { Id = list.id, Title = list.title?.text ?? $"Lista {list.id}" });
                    }
                }
            _state.Folders = folders;
        }
        catch
        {
            _state.Folders = new List<FolderDto>();
        }
    }

    private async Task<object?> OpenChatAsync(string id, int messageId = 0)
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para abrir conversaciones.");
        var entry = FindEntry(id);
        if (entry == null)
        {
            await LoadDialogsLocked(_mode, quiet: true);
            entry = FindEntry(id);
        }
        if (entry == null) throw new BridgeException("La conversación no está en la lista cargada. Actualiza la lista e inténtalo de nuevo.");

        _entries.TryAdd(id, entry);
        if (_state.Chats.All(chat => chat.Id != id)) _state.Chats.Add(LookupDto(entry));
        _active = id;
        _state.Active = id;
        _state.Typing = "";
        _state.Messages = new List<MessageDto>();
        _state.History = new HistoryDto { Loading = true };
        Push();
        await RefreshHistoryLocked(anchorUnread: messageId == 0, messageId: messageId);
        return true;
    }

    private async Task<object?> OpenSavedAsync()
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para abrir los mensajes guardados.");
        var self = SavedEntry(_client.User.id);
        _entries.TryAdd(self.Id, self);
        return await OpenChatAsync(self.Id);
    }

    private async Task<object?> MuteAsync(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var value = Bool(args, "value");
        await _client.Account_UpdateNotifySettings(new InputNotifyPeer { peer = entry.Input }, new InputPeerNotifySettings
        {
            mute_until = value ? DateTime.UtcNow.AddYears(20) : DateTime.UtcNow.AddMinutes(-1)
        });
        entry.Muted = value;
        foreach (var chat in _state.Chats) if (chat.Id == entry.Id) chat.Muted = value;
        return true;
    }

    // ---- history and messages -------------------------------------------------

    private async Task<object?> RefreshHistoryAsync()
    {
        if (_state.Active != "0") await RefreshHistoryLocked();
        return true;
    }

    private async Task RefreshHistoryLocked(bool anchorUnread = false, int messageId = 0)
    {
        if (_client?.User == null) return;
        var entry = FindEntry(_active);
        if (entry == null) return;

        var wantsUnread = anchorUnread && entry.Unread > 0 && entry.TopMessage > entry.ReadInbox;
        var boundary = wantsUnread && entry.ReadInbox > 0;
        var limit = boundary ? 100 : wantsUnread ? Math.Clamp(entry.Unread + 20, 40, 100) : 40;
        _state.History.Loading = true;
        Push();
        try
        {
            var result = messageId > 0
                ? await _client.Messages_GetHistory(entry.Input, offset_id: messageId, add_offset: -15, limit: limit)
                : boundary
                    ? await _client.Messages_GetHistory(entry.Input, offset_id: entry.ReadInbox, add_offset: -100, limit: limit)
                    : await _client.Messages_GetHistory(entry.Input, limit: limit);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var messages = result.Messages
                .Where(message => message.ID > 0)
                .OrderBy(message => message.ID)
                .ToList();

            var anchorId = boundary ? FirstAfter(messages, entry.ReadInbox) : wantsUnread ? UnreadFromEnd(messages, entry.Unread) : 0;
            _state.Messages = messages.Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>().ToList();
            _oldestId = messages.Count > 0 ? messages[0].ID : 0;
            _newestId = messages.Count > 0 ? messages[^1].ID : 0;
            _latest = messageId > 0 ? entry.TopMessage > 0 && _newestId >= entry.TopMessage
                : !boundary || entry.TopMessage <= 0 || _newestId >= entry.TopMessage;
            _historyEnd = _latest && result.Messages.Length < limit;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = _latest, Anchor = anchorId.ToString() };
            _entryReadOutbox(entry, messages.Count > 0 ? messages[^1].ID : 0);
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
        }
        catch (Exception ex)
        {
            _state.History = new HistoryDto { Loading = false, Error = Describe(ex), End = false, Latest = true };
            _state.Error = Describe(ex);
            Push();
        }
    }

    private void _entryReadOutbox(ChatEntry entry, int latest)
    {
        if (latest <= 0) return;
        foreach (var chat in _state.Chats)
        {
            if (chat.Id != entry.Id) continue;
            entry.ReadOutbox = Math.Max(entry.ReadOutbox, latest);
        }
    }

    private static int FirstAfter(List<MessageBase> page, int boundary)
    {
        var first = 0;
        foreach (var message in page)
            if (message.ID > boundary && (first == 0 || message.ID < first)) first = message.ID;
        return first;
    }

    private static int UnreadFromEnd(List<MessageBase> page, int unread)
    {
        var incoming = page
            .Where(message => message is TL.Message item && (item.flags & TL.Message.Flags.out_) == 0)
            .Select(message => message.ID)
            .OrderByDescending(id => id)
            .ToList();
        if (incoming.Count == 0) return 0;
        return incoming[Math.Min(Math.Max(unread, 1), incoming.Count) - 1];
    }

    private async Task<object?> LoadOlderAsync()
    {
        if (_client?.User == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación para cargar su historial.");
        if (_historyEnd) return true;

        _state.History.Loading = true;
        Push();
        try
        {
            var result = await _client.Messages_GetHistory(entry.Input, offset_id: _oldestId, limit: 40);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var older = result.Messages
                .Where(message => message.ID > 0 && message.ID < _oldestId)
                .OrderBy(message => message.ID)
                .ToList();

            if (older.Count > 0)
            {
                var converted = older.Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>();
                _state.Messages.InsertRange(0, converted);
                _oldestId = older[0].ID;
            }
            _historyEnd = result.Messages.Length < 40 || older.Count == 0;
            _latest = false;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = false, Anchor = _state.History.Anchor };
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
            return true;
        }
        catch (Exception ex)
        {
            _state.History.Loading = false;
            _state.History.Error = Describe(ex);
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    private async Task<object?> LoadNewerAsync()
    {
        if (_client?.User == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación para cargar su historial.");
        if (_latest) return true;

        _state.History.Loading = true;
        Push();
        try
        {
            var result = await _client.Messages_GetHistory(entry.Input, offset_id: _newestId, add_offset: -40, limit: 40);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var newer = result.Messages
                .Where(message => message.ID > _newestId)
                .OrderBy(message => message.ID)
                .ToList();

            if (newer.Count > 0)
            {
                var known = _state.Messages.Select(message => message.Id).ToHashSet();
                var converted = newer.Where(message => !known.Contains(message.ID.ToString()))
                    .Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>();
                _state.Messages.AddRange(converted);
                _newestId = newer[^1].ID;
            }
            _latest = newer.Count == 0 || entry.TopMessage <= 0 || _newestId >= entry.TopMessage;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = _latest, Anchor = _state.History.Anchor };
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
            return true;
        }
        catch (Exception ex)
        {
            _state.History.Loading = false;
            _state.History.Error = Describe(ex);
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    private async Task<object?> ReadActiveAsync()
    {
        var entry = FindEntry(_active);
        if (entry == null) return true;
        await ReadHistoryLocked(entry);
        return true;
    }

    private async Task ReadHistoryLocked(ChatEntry entry)
    {
        if (_client == null) return;
        var latest = entry.TopMessage > 0 ? entry.TopMessage : _state.Messages.LastOrDefault()?.Id is { } id && int.TryParse(id, out var value) ? value : 0;
        var confirmed = false;
        try
        {
            if (latest > 0) { await _client.Messages_ReadHistory(entry.Input, latest); confirmed = true; }
        }
        catch { }
        entry.Unread = 0;
        var floor = confirmed ? Math.Max(entry.ReadInbox, latest) : entry.ReadInbox;
        entry.ReadInbox = floor;
        foreach (var chat in _state.Chats)
            if (chat.Id == entry.Id)
            {
                chat.Unread = 0;
                chat.ReadInbox = floor.ToString();
            }
        _state.History.Anchor = "0";
        Push();
    }

    private async Task<object?> SendAsync(JsonElement args)
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para enviar mensajes.");
        if (args.TryGetProperty("accountId", out _) &&
            (Str(args, "accountId") != _state.SelfId || Str(args, "chatId") != _active))
            throw new BridgeException("La conversación cambió. No se envió el mensaje.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación antes de enviar.");
        var text = Str(args, "text");
        if (string.IsNullOrWhiteSpace(text)) throw new BridgeException("El mensaje está vacío.");

        var replyId = (int)Long(args, "reply", 0);
        var silent = Bool(args, "silent");
        var schedule = Long(args, "schedule", 0);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            var entities = ParseEntities(args);
            InputReplyTo? reply = replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null;
            DateTime? scheduleDate = schedule > 0 ? DateTimeOffset.FromUnixTimeSeconds(schedule).UtcDateTime : null;
            await _client.Messages_SendMessage(entry.Input, text, Random.Shared.NextInt64(1, long.MaxValue),
                reply_to: reply, entities: entities, schedule_date: scheduleDate, silent: silent, clear_draft: true);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            if (schedule <= 0)
            {
                await RefreshHistoryLocked();
                _dialogsDirty = true;
            }
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    private async Task<object?> TypingAsync(JsonElement args)
    {
        if (_client?.User == null || !_state.Appearance.Typing) return true;
        var entry = FindEntry(_active);
        if (entry == null) return true;
        try
        {
            await _client.Messages_SetTyping(entry.Input, Bool(args, "active") ? new SendMessageTypingAction() : new SendMessageCancelAction());
        }
        catch { }
        return true;
    }

    private async Task<object?> DraftAsync(JsonElement args)
    {
        if (_client?.User == null || Str(args, "accountId", _state.SelfId) != _state.SelfId) return false;
        var entry = FindEntry(Str(args, "chatId", _active));
        if (entry == null) return false;
        return await _client.Messages_SaveDraft(entry.Input, Str(args, "text"));
    }

    private bool CopyMessage(string id)
    {
        var message = _state.Messages.FirstOrDefault(item => item.Id == id);
        if (message == null || string.IsNullOrEmpty(message.Text)) return false;
        try
        {
            Application.Current.Dispatcher.Invoke(() => Clipboard.SetText(message.Text));
            return true;
        }
        catch
        {
            return false;
        }
    }

    private static object Properties(string id) => new
    {
        reply = true,
        copy = true,
        copyContent = true,
        edit = false,
        deleteSelf = false,
        deleteAll = false,
        forward = false,
        pin = false,
        editCaption = false,
        caption = "",
        reactions = Array.Empty<string>(),
        paid = false,
        allowCustom = false
    };

    private async Task LoadMediaAsync(long id)
    {
        TrackDownload(id);
        if (_downloadsPausedAll || _downloadPaused.Contains(id)) { Push(); return; }
        try { await _media.EnsureFileAsync(id); }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
        }
        Push();
    }

    private async Task<object?> ExportMediaAsync(long id)
    {
        if (!_media.CanExport(id)) throw new BridgeException("Telegram protege este contenido.");
        var path = await _media.EnsureFileAsync(id);
        if (path == null || !_media.TryGetFile(id, out var file, out _))
            throw new BridgeException("El archivo todavía no está disponible. Espera a que termine la descarga.");
        var name = _media.NameOf(id) ?? "archivo";
        var target = Application.Current.Dispatcher.Invoke(() =>
        {
            var dialog = new Microsoft.Win32.SaveFileDialog
            {
                FileName = Path.GetFileName(name),
                Filter = "Todos los archivos|*.*"
            };
            return dialog.ShowDialog() == true ? dialog.FileName : null;
        });
        if (target == null) return false;
        File.Copy(file, target, overwrite: true);
        return true;
    }

    private object? Appearance(JsonElement args)
    {
        var appearance = _state.Appearance;
        if (args.TryGetProperty("theme", out var theme) && theme.ValueKind == JsonValueKind.String) appearance.Theme = theme.GetString()!;
        if (args.TryGetProperty("font", out var font) && font.TryGetInt32(out var size)) appearance.Font = size;
        if (args.TryGetProperty("compact", out var compact) && compact.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Compact = compact.GetBoolean();
        if (args.TryGetProperty("typing", out var typing) && typing.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Typing = typing.GetBoolean();
        if (args.TryGetProperty("enter", out var enter) && enter.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Enter = enter.GetBoolean();
        if (args.TryGetProperty("auto", out var auto) && auto.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Auto = auto.GetBoolean();
        if (args.TryGetProperty("fontFamily", out var family) && family.ValueKind == JsonValueKind.String) appearance.FontFamily = family.GetString()!;
        if (args.TryGetProperty("wallpaper", out var wallpaper) && wallpaper.ValueKind == JsonValueKind.String) appearance.Wallpaper = wallpaper.GetString()!;
        if (args.TryGetProperty("custom", out var custom)) appearance.Custom = custom.ValueKind == JsonValueKind.Null ? null : custom.Clone();
        if (args.TryGetProperty("customThemes", out var customThemes)) appearance.CustomThemes = customThemes.ValueKind == JsonValueKind.Null ? null : customThemes.Clone();
        if (args.TryGetProperty("chatThemes", out var chatThemes)) appearance.ChatThemes = chatThemes.ValueKind == JsonValueKind.Null ? null : chatThemes.Clone();
        if (args.TryGetProperty("chrome", out var chrome) && chrome.ValueKind == JsonValueKind.Object)
        {
            var canvas = ChromeColor(chrome, "canvas");
            var surface = ChromeColor(chrome, "surface");
            var text = ChromeColor(chrome, "text");
            var muted = ChromeColor(chrome, "muted");
            var accent = ChromeColor(chrome, "accent");
            if (canvas != null && surface != null && text != null && muted != null && accent != null)
                appearance.Chrome = new ChromeDto
                {
                    Canvas = canvas, Surface = surface, Text = text, Muted = muted, Accent = accent,
                    Dark = !chrome.TryGetProperty("dark", out var dark) || dark.ValueKind != JsonValueKind.False
                };
        }
        _store.Save();
        _appearanceChanged();
        return true;
    }

    private static string? ChromeColor(JsonElement chrome, string key)
    {
        if (!chrome.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String) return null;
        var text = value.GetString() ?? "";
        return DesktopPalette.IsHex(text) ? text.ToLowerInvariant() : null;
    }

    private object Accounts()
    {
        return new[] { new { slot = "main", name = _state.Name, ready = _state.Ready, active = true } };
    }

    private bool ClearError() { _state.Error = ""; return true; }

    private bool OpenDataFolder()
    {
        try { Process.Start(new ProcessStartInfo("explorer.exe", $"\"{_store.Root}\"") { UseShellExecute = true }); return true; }
        catch { return false; }
    }

    private bool OpenLink(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            throw new BridgeException("Solo se abren enlaces web http o https en esta beta.");
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); return true; }
        catch { return false; }
    }

    // ---- conversion helpers ---------------------------------------------------

    private MessageDto? ConvertMessage(MessageBase source, ChatEntry entry)
    {
        if (source is TL.Message message)
        {
            var dto = new MessageDto
            {
                Id = message.ID.ToString(),
                ChatId = entry.Id,
                Sender = SenderName(message, entry),
                Text = message.message ?? "",
                Date = Unix(message.Date),
                Outgoing = (message.flags & TL.Message.Flags.out_) != 0,
                Edited = (message.flags & TL.Message.Flags.has_edit_date) != 0,
                AlbumId = (message.flags & TL.Message.Flags.has_grouped_id) != 0 && message.grouped_id > 0 ? message.grouped_id.ToString() : null
            };
            dto.Status = dto.Outgoing ? (entry.ReadOutbox >= message.ID ? "read" : "sent") : "";
            dto.Entities = ConvertEntities(message.entities);
            dto.Reactions = ConvertReactions(message.reactions);

            if (message.reply_to is MessageReplyHeader header && header.reply_to_msg_id > 0)
                dto.Reply = CachedText(entry.Id, header.reply_to_msg_id) ?? "Mensaje anterior";

            var exportable = (message.flags & TL.Message.Flags.noforwards) == 0 && !ProtectedChat(entry);
            switch (message.media)
            {
                case MessageMediaPhoto { photo: Photo photo }:
                    dto.Media = _media.RegisterPhoto(photo, exportable: exportable);
                    break;
                case MessageMediaDocument { document: Document document }:
                    dto.Media = _media.RegisterDocument(document, exportable: exportable);
                    dto.Transcribable = document.attributes.Any(attribute =>
                        attribute is DocumentAttributeAudio audio && (audio.flags & DocumentAttributeAudio.Flags.voice) != 0 ||
                        attribute is DocumentAttributeVideo video && (video.flags & DocumentAttributeVideo.Flags.round_message) != 0);
                    break;
                case null:
                    break;
                default:
                    if (string.IsNullOrWhiteSpace(dto.Text)) dto.Text = "Contenido no compatible con esta beta.";
                    break;
            }

            if (!_textCache.TryGetValue(entry.Id, out var texts)) _textCache[entry.Id] = texts = new Dictionary<int, string>();
            texts[message.ID] = dto.Text;
            return dto;
        }

        if (source is MessageService service)
        {
            return new MessageDto
            {
                Id = service.ID.ToString(),
                ChatId = entry.Id,
                Sender = SenderName(service, entry),
                Text = ServiceText(service.action),
                Date = Unix(service.Date),
                Outgoing = (service.flags & MessageService.Flags.out_) != 0,
                Status = "",
                Reactions = new List<ReactionDto>()
            };
        }

        return null;
    }

    private string SenderName(MessageBase message, ChatEntry entry)
    {
        if (message.From is PeerUser user && _users.TryGetValue(user.user_id, out var info)) return FullName(info);
        if (message.From is PeerChannel channel && _chats.TryGetValue(channel.channel_id, out var chat)) return chat.Title;
        if (entry.Type == "channel") return entry.Title;
        return "Telegram";
    }

    private string? CachedText(string chatId, int messageId) =>
        _textCache.TryGetValue(chatId, out var texts) && texts.TryGetValue(messageId, out var text) ? text : null;

    private static string ServiceText(MessageAction? action) => action switch
    {
        MessageActionChatCreate => "Se creó el grupo",
        MessageActionChatEditTitle => "Se cambió el título del grupo",
        MessageActionChannelCreate => "Se creó el canal",
        MessageActionChatJoinedByLink => "Alguien se unió mediante un enlace",
        MessageActionPinMessage => "Se fijó un mensaje",
        MessageActionHistoryClear => "Se borró el historial",
        MessageActionScreenshotTaken => "Se tomó una captura de pantalla",
        MessageActionChatDeletePhoto => "Se eliminó la foto del grupo",
        _ => "Mensaje de servicio de Telegram"
    };

    private static List<ReactionDto> ConvertReactions(MessageReactions? reactions)
    {
        var list = new List<ReactionDto>();
        if (reactions?.results == null) return list;
        foreach (var result in reactions.results)
        {
            switch (result.reaction)
            {
                case ReactionEmoji emoji:
                    list.Add(new ReactionDto { Emoji = emoji.emoticon, Count = result.count, Chosen = result.chosen_order != 0 });
                    break;
                case ReactionCustomEmoji custom:
                    list.Add(new ReactionDto { Emoji = "", Count = result.count, Chosen = result.chosen_order != 0, Kind = "custom", CustomEmojiId = custom.document_id.ToString() });
                    break;
            }
        }
        return list;
    }

    private static List<EntityDto>? ConvertEntities(MessageEntity[]? entities)
    {
        if (entities == null || entities.Length == 0) return null;
        var list = new List<EntityDto>();
        foreach (var entity in entities)
        {
            var type = entity switch
            {
                MessageEntityBold => "bold",
                MessageEntityItalic => "italic",
                MessageEntityUnderline => "underline",
                MessageEntityStrike => "strikethrough",
                MessageEntitySpoiler => "spoiler",
                MessageEntityCode => "code",
                MessageEntityPre => "pre",
                MessageEntityBlockquote => "blockquote",
                MessageEntityTextUrl => "link",
                MessageEntityUrl => "link",
                _ => null
            };
            if (type == null) continue;
            list.Add(new EntityDto
            {
                Type = type,
                Offset = entity.offset,
                Length = entity.length,
                Url = entity is MessageEntityTextUrl url ? url.url : null
            });
        }
        return list.Count > 0 ? list : null;
    }

    private static MessageEntity[]? ParseEntities(JsonElement args)
    {
        if (!args.TryGetProperty("entities", out var array) || array.ValueKind != JsonValueKind.Array) return null;
        var list = new List<MessageEntity>();
        foreach (var item in array.EnumerateArray())
        {
            var type = Str(item, "type");
            if (!item.TryGetProperty("offset", out var offsetElement) || !offsetElement.TryGetInt32(out var offset)) continue;
            if (!item.TryGetProperty("length", out var lengthElement) || !lengthElement.TryGetInt32(out var length)) continue;

            MessageEntity? entity = type switch
            {
                "bold" => new MessageEntityBold(),
                "italic" => new MessageEntityItalic(),
                "underline" => new MessageEntityUnderline(),
                "strikethrough" => new MessageEntityStrike(),
                "spoiler" => new MessageEntitySpoiler(),
                "code" => new MessageEntityCode(),
                "pre" => new MessageEntityPre(),
                "blockquote" => new MessageEntityBlockquote(),
                "link" => item.TryGetProperty("url", out var url) && url.ValueKind == JsonValueKind.String
                    ? new MessageEntityTextUrl { url = url.GetString() }
                    : null,
                _ => null
            };
            if (entity == null) continue;
            entity.offset = offset;
            entity.length = length;
            list.Add(entity);
        }
        return list.Count > 0 ? list.ToArray() : null;
    }

    private ChatEntry? EntryFromPeer(TL.Peer peer)
    {
        switch (peer)
        {
            case PeerUser userPeer when _users.TryGetValue(userPeer.user_id, out var user):
            {
                var id = "u" + user.id;
                var title = user.id == _client?.User?.id ? "Mensajes guardados" : FullName(user);
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = user.id == _client?.User?.id ? new InputPeerSelf() : new InputPeerUser(user.id, user.access_hash),
                    Title = title,
                    Type = "private",
                    Bot = (user.flags & User.Flags.bot) != 0,
                    IsContact = (user.flags & User.Flags.contact) != 0,
                    Username = user.MainUsername,
                    Photo = _media.RegisterProfile(user, user.photo != null, id, title)
                };
            }
            case PeerChat chatPeer when _chats.TryGetValue(chatPeer.chat_id, out var chat):
            {
                var id = "g" + chat.ID;
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = new InputPeerChat(chat.ID),
                    Title = chat.Title,
                    Type = "group",
                    Photo = _media.RegisterProfile(chat, chat.Photo != null, id, chat.Title)
                };
            }
            case PeerChannel channelPeer when _chats.TryGetValue(channelPeer.channel_id, out var channelBase) && channelBase is Channel channel:
            {
                var id = "c" + channel.ID;
                var supergroup = (channel.flags & Channel.Flags.megagroup) != 0;
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = new InputPeerChannel(channel.id, channel.access_hash),
                    Title = channel.Title,
                    Type = supergroup ? "group" : "channel",
                    Supergroup = supergroup,
                    IsForum = (channel.flags & Channel.Flags.forum) != 0,
                    Username = channel.MainUsername,
                    Photo = _media.RegisterProfile(channel, channel.Photo != null, id, channel.Title)
                };
            }
            default:
                return null;
        }
    }

    private ChatEntry? FindEntry(string id)
    {
        if (_entries.TryGetValue(id, out var entry)) return entry;
        if (id.Length < 2 || !long.TryParse(id.AsSpan(1), out var peerId) || peerId <= 0) return null;
        if (id[0] == 'u' && peerId == _client?.User?.id) return SavedEntry(peerId);
        TL.Peer? peer = id[0] switch
        {
            'u' => new PeerUser { user_id = peerId },
            'g' => new PeerChat { chat_id = peerId },
            'c' => new PeerChannel { channel_id = peerId },
            _ => null
        };
        return peer == null ? null : EntryFromPeer(peer);
    }

    private bool ProtectedChat(ChatEntry entry)
    {
        return entry.Peer switch
        {
            PeerChannel peer when _chats.GetValueOrDefault(peer.channel_id) is Channel channel => (channel.flags & Channel.Flags.noforwards) != 0,
            PeerChat peer when _chats.GetValueOrDefault(peer.chat_id) is Chat chat => (chat.flags & Chat.Flags.noforwards) != 0,
            _ => false
        };
    }

    private ChatEntry RequireEntry(string id) => FindEntry(id) ?? throw new BridgeException("La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.");

    private static string FullName(User user)
    {
        var name = string.Join(" ", new[] { user.first_name, user.last_name }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        if (name.Length > 0) return name;
        if (!string.IsNullOrWhiteSpace(user.MainUsername)) return "@" + user.MainUsername;
        return "Usuario " + user.id;
    }

    private static string PreviewOf(MessageBase? message)
    {
        if (message is TL.Message text && !string.IsNullOrWhiteSpace(text.message))
        {
            var value = text.message.Replace('\n', ' ').Trim();
            return value.Length > 90 ? value[..90] + "…" : value;
        }
        if (message is TL.Message media)
        {
            return media.media switch
            {
                MessageMediaPhoto => "Foto",
                MessageMediaDocument { document: Document document } => document.mime_type switch
                {
                    "application/x-tgsticker" => "Sticker",
                    _ when document.mime_type.StartsWith("video/") => "Vídeo",
                    _ when document.mime_type.StartsWith("audio/") => "Audio",
                    _ when document.mime_type.StartsWith("image/") => "Imagen",
                    _ => string.IsNullOrWhiteSpace(document.Filename) ? "Archivo" : document.Filename!
                },
                null => "",
                _ => "Contenido multimedia"
            };
        }
        if (message is MessageService service) return ServiceText(service.action);
        return "";
    }

    private static long Unix(DateTime date) =>
        date.Year < 1970 ? 0 : new DateTimeOffset(DateTime.SpecifyKind(date, DateTimeKind.Utc)).ToUnixTimeSeconds();

    private static string Str(JsonElement element, string name, string fallback = "")
    {
        if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value))
        {
            if (value.ValueKind == JsonValueKind.String) return value.GetString() ?? fallback;
            if (value.ValueKind == JsonValueKind.Number) return value.ToString();
            if (value.ValueKind == JsonValueKind.True) return "true";
            if (value.ValueKind == JsonValueKind.False) return "false";
        }
        return fallback;
    }

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

    private static bool Bool(JsonElement element, string name, bool fallback = false)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => fallback
        };
    }

    private static string Describe(Exception exception)
    {
        if (exception is BridgeException bridge) return bridge.Message;
        if (exception is RpcException rpc)
        {
            var code = rpc.Message ?? "";
            if (code.StartsWith("PHONE_NUMBER_INVALID")) return "El número de teléfono no es válido. Usa el prefijo internacional.";
            if (code.StartsWith("PHONE_CODE_INVALID") || code.StartsWith("PHONE_CODE_EXPIRED")) return "El código no es válido o caducó.";
            if (code.StartsWith("PASSWORD_HASH_INVALID")) return "La contraseña de dos pasos no es correcta.";
            if (code.StartsWith("SESSION_PASSWORD_NEEDED")) return "La cuenta requiere la contraseña de dos pasos.";
            if (code.StartsWith("FLOOD_WAIT")) return "Telegram pidió esperar antes de reintentar.";
            if (code.StartsWith("AUTH_KEY_UNREGISTERED") || code.StartsWith("AUTH_KEY_INVALID") || code.StartsWith("SESSION_REVOKED")) return "La sesión ya no es válida. Inicia sesión de nuevo.";
            if (code.StartsWith("API_ID_INVALID") || code.StartsWith("API_ID_PUBLISHED_FLOOD")) return "Las credenciales de API no son válidas para esta aplicación.";
            return code;
        }
        return string.IsNullOrWhiteSpace(exception.Message) ? "No se pudo completar la operación." : exception.Message;
    }

    // ---- updates --------------------------------------------------------------

    private Task QueueUpdates(UpdatesBase updates)
    {
        _updates.Enqueue(updates);
        return Task.CompletedTask;
    }

    private Task QueueOther(IObject other)
    {
        if (other is Update update) _others.Enqueue(update);
        return Task.CompletedTask;
    }

    private async Task PumpLoopAsync()
    {
        while (!_dispose.IsCancellationRequested)
        {
            try { await Task.Delay(900, _dispose.Token); }
            catch { break; }
            if (!_historyDirty && !_dialogsDirty && _updates.IsEmpty && _others.IsEmpty) continue;

            try
            {
                await _gate.WaitAsync(_dispose.Token);
                try
                {
                    ProcessUpdatesLocked();
                    var now = DateTime.UtcNow;
                    if (_historyDirty && (now - _lastHistoryLoad).TotalMilliseconds > 1200 && _state.Ready && _state.Active != "0")
                        await RefreshHistoryLocked();
                    if (_dialogsDirty && (now - _lastDialogsLoad).TotalMilliseconds > 4000 && _state.Ready)
                        await LoadDialogsLocked(_mode, quiet: true);
                    Push();
                }
                finally { _gate.Release(); }
            }
            catch { }
        }
    }

    private void ProcessUpdatesLocked()
    {
        while (_updates.TryDequeue(out var updates))
        {
            try
            {
                switch (updates)
                {
                    case TL.Updates combined:
                        MergePeers(combined.users?.Values, combined.chats?.Values);
                        foreach (var update in combined.updates ?? Array.Empty<Update>()) HandleUpdate(update);
                        break;
                    case TL.UpdatesCombined combined:
                        MergePeers(combined.users?.Values, combined.chats?.Values);
                        foreach (var update in combined.updates ?? Array.Empty<Update>()) HandleUpdate(update);
                        break;
                    case UpdatesTooLong:
                        _historyDirty = true;
                        _dialogsDirty = true;
                        break;
                }
            }
            catch { }
        }
        while (_others.TryDequeue(out var update)) HandleUpdate(update);
    }

    private void HandleUpdate(Update update)
    {
        switch (update)
        {
            case UpdateNewMessage news:
                OnIncoming(news.message);
                break;
            case UpdateEditMessage edit:
                OnIncoming(edit.message);
                break;
            case UpdateDeleteMessages deleted:
                OnDeleted(deleted.messages);
                break;
            case UpdateReadHistoryOutbox read:
                OnReadOutbox(read.peer, read.max_id);
                break;
            case UpdateReadHistoryInbox read:
                OnReadInbox(read.peer, read.max_id, read.still_unread_count);
                break;
        }
    }

    private void OnIncoming(MessageBase message)
    {
        var chatId = ChatIdOf(message.Peer);
        if (chatId == null) return;
        // While an unread-anchored window is open, new messages wait for history.newer
        // so the gap between the anchor and the live message is never skipped.
        if (chatId == _active && _latest) _historyDirty = true;
        _dialogsDirty = true;
    }

    private void OnDeleted(int[] ids)
    {
        if (ids == null || ids.Length == 0) return;
        var set = ids.ToHashSet();
        if (_state.Active != "0")
        {
            _state.Messages.RemoveAll(message => int.TryParse(message.Id, out var id) && set.Contains(id));
            if (_latest) _historyDirty = true;
        }
        _dialogsDirty = true;
    }

    private void OnReadOutbox(TL.Peer peer, int maxId)
    {
        var chatId = ChatIdOf(peer);
        if (chatId == null || !_entries.TryGetValue(chatId, out var entry)) return;
        entry.ReadOutbox = Math.Max(entry.ReadOutbox, maxId);
        if (chatId == _active)
        {
            foreach (var message in _state.Messages)
                if (message.Outgoing && int.TryParse(message.Id, out var id) && id <= maxId)
                    message.Status = "read";
        }
    }

    private void OnReadInbox(TL.Peer peer, int maxId, int stillUnread)
    {
        var chatId = ChatIdOf(peer);
        if (chatId == null) return;
        if (_entries.TryGetValue(chatId, out var entry))
        {
            entry.ReadInbox = Math.Max(entry.ReadInbox, maxId);
            entry.Unread = Math.Max(0, stillUnread);
        }
        foreach (var chat in _state.Chats)
            if (chat.Id == chatId)
            {
                chat.ReadInbox = Math.Max(int.TryParse(chat.ReadInbox, out var read) ? read : 0, maxId).ToString();
                chat.Unread = Math.Max(0, stillUnread);
            }
        if (chatId == _state.Active && int.TryParse(_state.History.Anchor, out var anchor) && anchor > 0 && maxId >= anchor)
            _state.History.Anchor = "0";
    }

    private static string? ChatIdOf(TL.Peer? peer) => peer switch
    {
        PeerUser user => "u" + user.user_id,
        PeerChat chat => "g" + chat.chat_id,
        PeerChannel channel => "c" + channel.channel_id,
        _ => null
    };

    private void MergePeers(IEnumerable<User>? users, IEnumerable<ChatBase>? chats)
    {
        if (users != null) foreach (var user in users) _users[user.id] = user;
        if (chats != null) foreach (var chat in chats) _chats[chat.ID] = chat;
    }

    private void DisposeClientLocked()
    {
        try { _client?.Dispose(); } catch { }
        _client = null;
    }

    public async ValueTask DisposeAsync()
    {
        _dispose.Cancel();
        await _gate.WaitAsync();
        try { DisposeClientLocked(); }
        finally { _gate.Release(); }
        _dispose.Dispose();
        _gate.Dispose();
    }
}
