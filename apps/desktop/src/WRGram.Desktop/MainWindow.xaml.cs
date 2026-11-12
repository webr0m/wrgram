using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Media;
using Microsoft.Web.WebView2.Core;

namespace WRGram.Desktop;

public partial class MainWindow : Window
{
    private const string VirtualHost = "wrgram.local";

    private readonly DesktopState _state = new();
    private DesktopStore? _store;
    private MediaRegistry? _media;
    private TelegramService? _service;
    private DesktopBridge? _bridge;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
    }

    private async void OnLoaded(object sender, RoutedEventArgs e)
    {
        Loaded -= OnLoaded;
        try
        {
            await StartAsync();
        }
        catch (Exception ex)
        {
            SplashText.Text = "No se pudo iniciar WRGram Desktop.\n\n" + ex.Message;
        }
    }

    private async Task StartAsync()
    {
        var ui = ResolveUiDirectory();
        if (ui == null)
        {
            SplashText.Text = "No se encontró la interfaz web compilada.\n\nEjecuta la compilación de apps/mobile-ui (genera dist) y vuelve a compilar este proyecto. También puedes indicar una carpeta con WRGRAM_UI_DIR.";
            return;
        }

        var dataFolder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WRGram", "WebView2");
        Directory.CreateDirectory(dataFolder);
        var environment = await CoreWebView2Environment.CreateAsync(userDataFolder: dataFolder);
        await Web.EnsureCoreWebView2Async(environment);

        var core = Web.CoreWebView2;
        core.Settings.AreDefaultContextMenusEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.IsSwipeNavigationEnabled = false;
        core.Settings.AreDevToolsEnabled = Environment.GetEnvironmentVariable("WRGRAM_DEBUG") == "1";

        core.SetVirtualHostNameToFolderMapping(VirtualHost, ui, CoreWebView2HostResourceAccessKind.DenyCors);
        core.AddWebResourceRequestedFilter($"https://{VirtualHost}/media/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += OnWebResourceRequested;
        core.NavigationStarting += OnNavigationStarting;
        core.NewWindowRequested += OnNewWindowRequested;

        ApplyShim(core);

        _store = new DesktopStore();
        _media = new MediaRegistry(_store, () => _service?.Client);
        _state.Appearance = _store.Appearance;
        _state.Consent = _store.Consent;
        _bridge = new DesktopBridge(core, Dispatcher, _state, _media);
        _service = new TelegramService(_store, _media, _state, _bridge.PushState, () => Dispatcher.BeginInvoke(ApplyAppearance));
        _bridge.Attach(_service);
        ApplyAppearance();

        Web.NavigationCompleted += OnNavigationCompleted;
        core.Navigate($"https://{VirtualHost}/index.html");
        _ = _service.InitializeAsync();
    }

    private static async void ApplyShim(CoreWebView2 core)
    {
        const string shim = """
            window.WRGRAM_MEDIA_BASE = 'https://wrgram.local';
            window.WRGramNative = {
              onmessage: null,
              postMessage: function (message) { window.chrome.webview.postMessage(String(message)); }
            };
            window.chrome.webview.addEventListener('message', function (event) {
              var handler = window.WRGramNative.onmessage;
              if (!handler) return;
              handler({ data: typeof event.data === 'string' ? event.data : JSON.stringify(event.data) });
            });
            """;
        try { await core.AddScriptToExecuteOnDocumentCreatedAsync(shim); }
        catch { /* Navigation will fail with a visible error if the bridge is unavailable. */ }
    }

    private void OnNavigationCompleted(object? sender, CoreWebView2NavigationCompletedEventArgs e)
    {
        if (e.IsSuccess) Splash.Visibility = Visibility.Collapsed;
        else SplashText.Text = $"No se pudo cargar la interfaz (error {e.WebErrorStatus}).";
    }

    private static void OnNavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
    {
        if (e.Uri.StartsWith($"https://{VirtualHost}/", StringComparison.OrdinalIgnoreCase)) return;
        e.Cancel = true;
        OpenExternal(e.Uri);
    }

    private static void OnNewWindowRequested(object? sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        e.Handled = true;
        OpenExternal(e.Uri);
    }

    private static void OpenExternal(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return;
        if (uri.Scheme != "http" && uri.Scheme != "https") return;
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); }
        catch { }
    }

    private void OnWebResourceRequested(object? sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        var deferral = e.GetDeferral();
        try
        {
            var path = new Uri(e.Request.Uri).AbsolutePath.Trim('/');
            if (!path.StartsWith("media/", StringComparison.Ordinal) || !long.TryParse(path[6..], out var id)
                || _media == null || !_media.TryGetFile(id, out var file, out var mime))
            {
                e.Response = Web.CoreWebView2.Environment.CreateWebResourceResponse(null, 404, "Not Found", "Content-Type: text/plain; charset=utf-8");
                return;
            }

            Stream stream = mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase) || mime == "application/x-tgsticker"
                ? new MemoryStream(File.ReadAllBytes(file), writable: false)
                : File.OpenRead(file);
            var headers = $"Content-Type: {mime}\r\nCache-Control: public, max-age=86400";
            e.Response = Web.CoreWebView2.Environment.CreateWebResourceResponse(stream, 200, "OK", headers);
        }
        catch
        {
            e.Response = Web.CoreWebView2.Environment.CreateWebResourceResponse(null, 500, "Internal Error", "Content-Type: text/plain; charset=utf-8");
        }
        finally
        {
            deferral.Complete();
        }
    }

    private static string? ResolveUiDirectory()
    {
        var overrideDirectory = Environment.GetEnvironmentVariable("WRGRAM_UI_DIR");
        if (!string.IsNullOrWhiteSpace(overrideDirectory) && File.Exists(Path.Combine(overrideDirectory, "index.html")))
            return Path.GetFullPath(overrideDirectory);

        var extracted = ExtractEmbeddedUi();
        if (extracted != null) return extracted;

        var bundled = Path.Combine(AppContext.BaseDirectory, "ui");
        return File.Exists(Path.Combine(bundled, "index.html")) ? Path.GetFullPath(bundled) : null;
    }

    private static string? ExtractEmbeddedUi()
    {
        var root = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "WRGram", "ui");
        var assembly = typeof(MainWindow).Assembly;
        var found = false;
        foreach (var resource in assembly.GetManifestResourceNames())
        {
            var name = resource.Replace('\\', '/');
            if (!name.StartsWith("ui/", StringComparison.Ordinal)) continue;
            var target = Path.GetFullPath(Path.Combine(root, name[3..].Replace('/', Path.DirectorySeparatorChar)));
            if (!target.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) continue;
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            using var source = assembly.GetManifestResourceStream(resource);
            if (source == null) continue;
            using var destination = File.Create(target);
            source.CopyTo(destination);
            found = true;
        }
        return found && File.Exists(Path.Combine(root, "index.html")) ? root : null;
    }

    private void ApplyAppearance()
    {
        var palette = DesktopPalette.Resolve(_state.Appearance);
        var canvas = Brush(palette.Canvas);
        Background = canvas;
        Splash.Background = canvas;
        BrandText.Foreground = Brush(palette.Accent);
        SubtitleText.Foreground = Brush(palette.Muted);
        SplashText.Foreground = Brush(palette.Text);
        ApplyTitleBar(palette);
    }

    private static SolidColorBrush Brush(string hex)
    {
        var brush = new SolidColorBrush((Color)ColorConverter.ConvertFromString(hex));
        brush.Freeze();
        return brush;
    }

    [DllImport("dwmapi.dll", PreserveSig = true)]
    private static extern int DwmSetWindowAttribute(IntPtr window, int attribute, ref int value, int size);

    private void ApplyTitleBar(DesktopColors palette)
    {
        try
        {
            var handle = new System.Windows.Interop.WindowInteropHelper(this).Handle;
            if (handle == IntPtr.Zero) return;
            var immersive = palette.Dark ? 1 : 0;
            if (DwmSetWindowAttribute(handle, 20, ref immersive, sizeof(int)) != 0)
                DwmSetWindowAttribute(handle, 19, ref immersive, sizeof(int));
            var caption = ColorRef(palette.Surface);
            var text = ColorRef(palette.Text);
            var border = ColorRef(palette.Canvas);
            DwmSetWindowAttribute(handle, 35, ref caption, sizeof(int));
            DwmSetWindowAttribute(handle, 36, ref text, sizeof(int));
            DwmSetWindowAttribute(handle, 34, ref border, sizeof(int));
        }
        catch { /* Older Windows builds keep the system title bar. */ }
    }

    private static int ColorRef(string hex)
    {
        var value = Convert.ToInt32(hex[1..7], 16);
        return (value & 0xFF) << 16 | value & 0xFF00 | (value >> 16) & 0xFF;
    }

    protected override void OnClosed(EventArgs e)
    {
        base.OnClosed(e);
        var service = _service;
        _service = null;
        if (service != null) _ = service.DisposeAsync().AsTask();
    }
}
