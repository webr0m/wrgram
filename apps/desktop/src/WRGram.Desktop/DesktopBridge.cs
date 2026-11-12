using System.IO;
using System.Text.Json;
using System.Windows.Threading;
using Microsoft.Web.WebView2.Core;
using TL;
using WTelegram;

namespace WRGram.Desktop;

public sealed class DesktopBridge
{
    private readonly CoreWebView2 _web;
    private readonly Dispatcher _dispatcher;
    private readonly DesktopState _state;
    private readonly MediaRegistry _media;
    private readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web)
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        PropertyNameCaseInsensitive = true
    };

    private TelegramService? _service;

    public DesktopBridge(CoreWebView2 web, Dispatcher dispatcher, DesktopState state, MediaRegistry media)
    {
        _web = web;
        _dispatcher = dispatcher;
        _state = state;
        _media = media;
    }

    public void Attach(TelegramService service)
    {
        _service = service;
        _web.WebMessageReceived += OnWebMessageReceived;
    }

    public void PushState()
    {
        var payload = JsonSerializer.Serialize(new { @event = "state", state = _state }, _json);
        Post(payload);
    }

    public bool TryGetMedia(long id, out string path, out string mime) => _media.TryGetFile(id, out path, out mime);

    private async void OnWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        string raw;
        try { raw = e.TryGetWebMessageAsString(); }
        catch { return; }

        string id = "", method = "";
        JsonElement args = default;
        try
        {
            using var document = JsonDocument.Parse(raw);
            if (document.RootElement.ValueKind != JsonValueKind.Object) return;
            if (document.RootElement.TryGetProperty("id", out var idElement) && idElement.ValueKind == JsonValueKind.String)
                id = idElement.GetString() ?? "";
            if (document.RootElement.TryGetProperty("method", out var methodElement) && methodElement.ValueKind == JsonValueKind.String)
                method = methodElement.GetString() ?? "";
            if (document.RootElement.TryGetProperty("params", out var paramsElement))
                args = paramsElement.Clone();
        }
        catch { return; }

        if (string.IsNullOrEmpty(id) || string.IsNullOrEmpty(method)) return;

        object? result = null;
        string? error = null;
        try
        {
            var service = _service ?? throw new BridgeException("La aplicación todavía se está iniciando.");
            result = await service.HandleAsync(method, args);
        }
        catch (Exception ex)
        {
            error = UserMessage(ex);
        }

        var payload = error == null
            ? JsonSerializer.Serialize(new { id, result }, _json)
            : JsonSerializer.Serialize(new { id, error }, _json);
        Post(payload);
    }

    private void Post(string payload) => _dispatcher.BeginInvoke(() =>
    {
        try { _web.PostWebMessageAsString(payload); }
        catch { /* The page may be navigating; the next state push re-sends it. */ }
    });

    private static string UserMessage(Exception exception) => exception switch
    {
        BridgeException bridge => bridge.Message,
        RpcException rpc when !string.IsNullOrWhiteSpace(rpc.Message) => rpc.Message,
        _ => string.IsNullOrWhiteSpace(exception.Message) ? "No se pudo completar la operación." : exception.Message
    };
}
