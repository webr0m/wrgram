using System.Text.Json;
using Microsoft.Win32;

namespace WRGram.Desktop;

/** Native counterpart of the WRGram theme catalogue for the desktop chrome. */
public sealed record DesktopColors(string Canvas, string Surface, string Text, string Muted, string Accent, bool Dark);

public static class DesktopPalette
{
    private static readonly Dictionary<string, (string Canvas, string Surface, string Text, string Muted, string Accent, bool Dark)> BuiltIn = new()
    {
        ["gold"] = ("#101113", "#191a1e", "#ecece9", "#9d9eaa", "#dfbd78", true),
        ["violet"] = ("#f6f7f9", "#ffffff", "#242831", "#606977", "#7761ba", false),
        ["day"] = ("#f6f7f9", "#ffffff", "#242831", "#606977", "#426fae", false),
        ["night"] = ("#111522", "#1c2232", "#ecece9", "#9d9eaa", "#b8a5f0", true),
        ["ocean"] = ("#f6f7f9", "#ffffff", "#242831", "#606977", "#27768e", false),
        ["forest"] = ("#f6f7f9", "#ffffff", "#242831", "#606977", "#3e7756", false),
        ["sunset"] = ("#f6f7f9", "#ffffff", "#242831", "#606977", "#aa6047", false),
        ["graphite"] = ("#101113", "#191a1e", "#ecece9", "#9d9eaa", "#c4c5cc", true),
        ["telegram"] = ("#ffffff", "#ffffff", "#242831", "#606977", "#3390ec", false),
        ["telegram-night"] = ("#0e1621", "#17212b", "#f5f5f5", "#7f91a4", "#5288c1", true),
        ["tgx"] = ("#0b1412", "#142320", "#e7f4f0", "#86a8a0", "#4dd0c4", true),
        ["nekogram"] = ("#14121b", "#1e1a2b", "#efe9f7", "#a79bb8", "#c792ea", true),
        ["plus"] = ("#131211", "#211d19", "#f4ede5", "#b3a393", "#ff8a3d", true),
        ["ayu"] = ("#0b0f14", "#101720", "#e8f1f8", "#92a6b8", "#59c2ff", true),
        ["catogram"] = ("#fff7fa", "#ffffff", "#3a2430", "#8a6476", "#d94f86", false),
        ["ime"] = ("#f5f8ff", "#ffffff", "#1d2a3d", "#5c6f88", "#2f6fed", false),
        ["unigram"] = ("#1b1b1f", "#252529", "#f0f0f4", "#a0a0aa", "#4cc2ff", true),
        ["material"] = ("#141218", "#211f26", "#e6e0e9", "#cac4d0", "#d0bcff", true),
        ["sixtyfour"] = ("#0f1115", "#171a21", "#e9eef5", "#96a3b5", "#4d9fff", true),
    };

    public static DesktopColors Resolve(AppearanceDto appearance)
    {
        var chrome = appearance.Chrome;
        if (chrome != null && IsHex(chrome.Canvas) && IsHex(chrome.Surface) && IsHex(chrome.Text) && IsHex(chrome.Muted) && IsHex(chrome.Accent))
            return new DesktopColors(chrome.Canvas, chrome.Surface, chrome.Text, chrome.Muted, chrome.Accent, chrome.Dark);
        if (appearance.Auto) return Builtin(SystemDark() ? "night" : "day");
        if (appearance.Theme == "custom" && appearance.Custom is { ValueKind: JsonValueKind.Object } custom && custom.TryGetProperty("palette", out var palette) && palette.ValueKind == JsonValueKind.Object)
        {
            var dark = !custom.TryGetProperty("scheme", out var scheme) || scheme.ValueKind != JsonValueKind.String || scheme.GetString() != "light";
            var seed = Builtin(dark ? "gold" : "day");
            return new DesktopColors(
                Color(palette, "canvas", seed.Canvas), Color(palette, "surface", seed.Surface),
                Color(palette, "text", seed.Text), Color(palette, "muted", seed.Muted),
                Color(palette, "accent", seed.Accent), dark);
        }
        return Builtin(appearance.Theme);
    }

    private static DesktopColors Builtin(string id) => BuiltIn.TryGetValue(id, out var value)
        ? new DesktopColors(value.Canvas, value.Surface, value.Text, value.Muted, value.Accent, value.Dark)
        : new DesktopColors(BuiltIn["gold"].Canvas, BuiltIn["gold"].Surface, BuiltIn["gold"].Text, BuiltIn["gold"].Muted, BuiltIn["gold"].Accent, true);

    private static string Color(JsonElement palette, string key, string fallback)
    {
        if (!palette.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String) return fallback;
        var text = value.GetString() ?? "";
        return IsHex(text) ? text : fallback;
    }

    public static bool IsHex(string? value) => value is { Length: 7 or 9 } && value[0] == '#' && value[1..].All(Uri.IsHexDigit);

    private static bool SystemDark()
    {
        try
        {
            var value = Registry.GetValue(@"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Themes\Personalize", "AppsUseLightTheme", 1);
            return value is int light && light == 0;
        }
        catch { return false; }
    }
}
