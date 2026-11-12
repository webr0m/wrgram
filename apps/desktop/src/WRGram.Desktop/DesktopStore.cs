using System.IO;
using System.Text.Json;

namespace WRGram.Desktop;

public sealed class BridgeException : Exception
{
    public BridgeException(string message, Exception? inner = null) : base(message, inner) { }
}

public sealed class DesktopStore
{
    private static readonly JsonSerializerOptions SettingsJson = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true,
        WriteIndented = true
    };

    private sealed class SettingsFile
    {
        public AppearanceDto Appearance { get; set; } = new();
        public bool Consent { get; set; }
    }

    public string Root { get; }
    public string MediaDirectory { get; }
    public string SessionPath { get; }
    public AppearanceDto Appearance { get; private set; } = new();
    public bool Consent { get; private set; }

    private string SettingsPath => Path.Combine(Root, "settings.json");
    private string CredentialsPath => Path.Combine(Root, "telegram.json");

    public DesktopStore()
    {
        Root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "WRGram");
        MediaDirectory = Path.Combine(Root, "media");
        SessionPath = Path.Combine(Root, "session.dat");
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(MediaDirectory);
        Load();
    }

    public bool HasSession
    {
        get
        {
            try { return File.Exists(SessionPath) && new FileInfo(SessionPath).Length > 0; }
            catch { return false; }
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(SettingsPath)) return;
            var saved = JsonSerializer.Deserialize<SettingsFile>(File.ReadAllText(SettingsPath), SettingsJson);
            if (saved?.Appearance != null) Appearance = saved.Appearance;
            Consent = saved?.Consent == true;
        }
        catch
        {
            // A damaged settings file falls back to defaults; it is local UI state only.
        }
    }

    public void Save()
    {
        try
        {
            var temp = SettingsPath + ".tmp";
            File.WriteAllText(temp, JsonSerializer.Serialize(new SettingsFile { Appearance = Appearance, Consent = Consent }, SettingsJson));
            File.Move(temp, SettingsPath, overwrite: true);
        }
        catch
        {
            // Persisting appearance is best-effort; the session keeps working in memory.
        }
    }

    public void SetConsent(bool value)
    {
        Consent = value;
        Save();
    }

    public (int ApiId, string ApiHash) LoadCredentials()
    {
        var idText = FirstNonEmpty(
            Environment.GetEnvironmentVariable("WRGRAM_TELEGRAM_API_ID"),
            Environment.GetEnvironmentVariable("TELEGRAM_API_ID"));
        var hash = FirstNonEmpty(
            Environment.GetEnvironmentVariable("WRGRAM_TELEGRAM_API_HASH"),
            Environment.GetEnvironmentVariable("TELEGRAM_API_HASH"));

        if ((string.IsNullOrWhiteSpace(idText) || string.IsNullOrWhiteSpace(hash)) && File.Exists(CredentialsPath))
        {
            try
            {
                using var doc = JsonDocument.Parse(File.ReadAllText(CredentialsPath));
                idText = ReadString(doc.RootElement, "apiId") ?? idText;
                hash = ReadString(doc.RootElement, "apiHash") ?? hash;
            }
            catch
            {
                throw new BridgeException("No se pudo leer la configuración de Telegram. Revisa %APPDATA%\\WRGram\\telegram.json.");
            }
        }

        if (string.IsNullOrWhiteSpace(idText) || string.IsNullOrWhiteSpace(hash))
        {
            try
            {
                using var stream = typeof(DesktopStore).Assembly.GetManifestResourceStream("telegram.embedded.json");
                if (stream != null)
                {
                    using var doc = JsonDocument.Parse(stream);
                    idText = ReadString(doc.RootElement, "apiId") ?? idText;
                    hash = ReadString(doc.RootElement, "apiHash") ?? hash;
                }
            }
            catch
            {
                // Fall through to the configuration message; never surface credential contents.
            }
        }

        if (!int.TryParse(idText, out var apiId) || apiId <= 0 || string.IsNullOrWhiteSpace(hash))
            throw new BridgeException("Faltan las credenciales de Telegram en esta compilación. Define WRGRAM_TELEGRAM_API_ID y WRGRAM_TELEGRAM_API_HASH, o crea %APPDATA%\\WRGram\\telegram.json con apiId y apiHash.");

        return (apiId, hash.Trim());
    }

    private static string? ReadString(JsonElement root, string name)
    {
        if (!root.TryGetProperty(name, out var value)) return null;
        return value.ValueKind == JsonValueKind.Number ? value.GetInt32().ToString() : value.GetString();
    }

    private static string? FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
}
