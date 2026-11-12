using System.Text.Json;
using System.Text.Json.Serialization;

namespace WRGram.Desktop;

public sealed class DesktopState
{
    public bool Ready { get; set; }
    public string Auth { get; set; } = "welcome";
    public bool Consent { get; set; }
    public bool Busy { get; set; }
    public string Connection { get; set; } = "Sin conectar";
    public bool Online { get; set; }
    public string Error { get; set; } = "";
    public string Notice { get; set; } = "";
    public string Version { get; set; } = DesktopInfo.Version;
    public string SelfId { get; set; } = "0";
    public string Name { get; set; } = "";
    public string Active { get; set; } = "0";
    public bool CanSend { get; set; }
    public bool Sending { get; set; }
    public bool Uncertain { get; set; }
    public bool ChatsBusy { get; set; }
    public bool ChatsEnd { get; set; }
    public List<ChatDto> Chats { get; set; } = new();
    public List<MessageDto> Messages { get; set; } = new();
    public List<FolderDto> Folders { get; set; } = new();
    public HistoryDto History { get; set; } = new();
    public string Typing { get; set; } = "";
    public AppearanceDto Appearance { get; set; } = new();
    public PermissionsDto Permissions { get; set; } = new();
    public SecurityDto Security { get; set; } = new();
    public AssistantDto Assistant { get; set; } = new();
    public AccessDto Access { get; set; } = new() { Checked = true, Allowed = true };
    public UpdateDto Update { get; set; } = new();
    public List<long> MediaReady { get; set; } = new();
    public List<long> MediaLoading { get; set; } = new();
    public List<long> MediaFailed { get; set; } = new();
    public MediaDto? ProfilePhoto { get; set; }
    public string? QrImage { get; set; }
    public string? AuthEmailPattern { get; set; }
    public int? AuthCodeLength { get; set; }
    public string? AuthHint { get; set; }
    public bool? AuthRecoveryAvailable { get; set; }
    public string? AuthRecoveryPattern { get; set; }
    public string? AuthTerms { get; set; }
    public int? AuthMinAge { get; set; }
    public string Platform { get; set; } = "desktop";

    public void ResetSession()
    {
        Ready = false;
        Auth = "welcome";
        Consent = false;
        Busy = false;
        Connection = "Sin conectar";
        Online = false;
        Error = "";
        Notice = "";
        SelfId = "0";
        Name = "";
        Active = "0";
        CanSend = false;
        Sending = false;
        Uncertain = false;
        ChatsBusy = false;
        ChatsEnd = false;
        Chats = new();
        Messages = new();
        Folders = new();
        History = new();
        Typing = "";
        ProfilePhoto = null;
        MediaReady = new();
        MediaLoading = new();
        MediaFailed = new();
        QrImage = null;
        AuthEmailPattern = null;
        AuthCodeLength = null;
        AuthHint = null;
        AuthRecoveryAvailable = null;
        AuthRecoveryPattern = null;
        AuthTerms = null;
        AuthMinAge = null;
    }
}

public sealed class ChatDto
{
    public bool InList { get; set; } = true;
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Preview { get; set; } = "";
    public long Date { get; set; }
    public int Unread { get; set; }
    public string ReadInbox { get; set; } = "0";
    public bool Marked { get; set; }
    public bool Bot { get; set; }
    public string Type { get; set; } = "private";
    public bool Pinned { get; set; }
    public bool Muted { get; set; }
    public bool Archived { get; set; }
    public MediaDto? Photo { get; set; }
    public bool Supported { get; set; } = true;
    public int? ActiveStories { get; set; }
    public bool? IsContact { get; set; }
    public bool? Supergroup { get; set; }
    public bool? IsForum { get; set; }
    public string? SecretState { get; set; }
    public string? Fingerprint { get; set; }
    public string? Username { get; set; }
    public string? Draft { get; set; }
}

public sealed class MessageDto
{
    public string Id { get; set; } = "0";
    public string ChatId { get; set; } = "0";
    public string Sender { get; set; } = "";
    public string Text { get; set; } = "";
    public long Date { get; set; }
    public bool Outgoing { get; set; }
    public string Status { get; set; } = "";
    public bool Edited { get; set; }
    public string? Reply { get; set; }
    public MediaDto? Media { get; set; }
    public bool Transcribable { get; set; }
    public List<ReactionDto> Reactions { get; set; } = new();
    public List<EntityDto>? Entities { get; set; }
    public string? AlbumId { get; set; }
    public double? ScheduledAt { get; set; }
    public string? ChatTitle { get; set; }
}

public sealed class ReactionDto
{
    public string Emoji { get; set; } = "";
    public int Count { get; set; }
    public bool Chosen { get; set; }
    public string? Kind { get; set; }
    public string? CustomEmojiId { get; set; }
}

public sealed class EntityDto
{
    public string Type { get; set; } = "";
    public int Offset { get; set; }
    public int Length { get; set; }
    public string? Url { get; set; }
}

public sealed class MediaDto
{
    public long Id { get; set; }
    public bool Ready { get; set; }
    public string Mime { get; set; } = "application/octet-stream";
    public string Kind { get; set; } = "file";
    public string Name { get; set; } = "Archivo";
    public long Size { get; set; }
    public long? DownloadLimit { get; set; }
    public MediaDto? Thumbnail { get; set; }
    public string? Minithumbnail { get; set; }
    public bool? Exportable { get; set; }
}

public sealed class HistoryDto
{
    public bool Loading { get; set; }
    public string Error { get; set; } = "";
    public bool End { get; set; }
    public bool Latest { get; set; } = true;
    public string Anchor { get; set; } = "0";
}

public sealed class AppearanceDto
{
    public string Theme { get; set; } = "gold";
    public int Font { get; set; } = 16;
    public bool Compact { get; set; }
    public bool Typing { get; set; } = true;
    public bool Enter { get; set; }
    public bool Auto { get; set; }
    public string FontFamily { get; set; } = "system";
    public string Wallpaper { get; set; } = "none";
    public JsonElement? Custom { get; set; }
    public JsonElement? CustomThemes { get; set; }
    public JsonElement? ChatThemes { get; set; }
    public ChromeDto? Chrome { get; set; }
}

public sealed class ChromeDto
{
    public string Canvas { get; set; } = "#0f1012";
    public string Surface { get; set; } = "#17181b";
    public string Text { get; set; } = "#ecece9";
    public string Muted { get; set; } = "#9d9eaa";
    public string Accent { get; set; } = "#dfbd78";
    public bool Dark { get; set; } = true;
}

public sealed class PermissionsDto
{
    public bool Notes { get; set; }
    public bool Replies { get; set; }
}

public sealed class SecurityDto
{
    public bool Enabled { get; set; }
    public bool Available { get; set; }
    public bool Biometric { get; set; }
    public int LockAfter { get; set; }
}

public sealed class AssistantDto
{
    public string State { get; set; } = "No disponible en escritorio";
    public bool Ready { get; set; }
    public bool Busy { get; set; }
    public bool Consent { get; set; }
    public string Error { get; set; } = "";
    public List<object> Turns { get; set; } = new();
}

public sealed class AccessDto
{
    [JsonPropertyName("checked")]
    public bool Checked { get; set; }
    public bool Allowed { get; set; }
    public bool Blocked { get; set; }
    public long ExpiresAt { get; set; }
    public List<object> Countries { get; set; } = new();
}

public sealed class UpdateDto
{
    public bool Supported { get; set; }
    public bool Checking { get; set; }
    public bool Available { get; set; }
    public bool Downloaded { get; set; }
    public int CurrentVersionCode { get; set; }
    public int AvailableVersionCode { get; set; }
    public int Priority { get; set; }
    public string Error { get; set; } = "";
    public string? Notes { get; set; }
}

public sealed class FolderDto
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
}

public static class DesktopInfo
{
    public const string Version = "0.1.0-desktop2";
}
