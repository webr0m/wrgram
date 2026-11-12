package cc.webrom.wrgram;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import org.json.JSONObject;

/** Native counterparts of the WRGram theme catalogue; palettes are local, never downloaded. */
final class Palette {
    static final String[] IDS = {
        "gold", "violet", "day", "night", "ocean", "forest", "sunset", "graphite",
        "telegram", "telegram-night", "tgx", "nekogram", "plus", "ayu", "catogram",
        "ime", "unigram", "material", "sixtyfour", "custom",
    };
    static final String[] NAMES = {
        "WR Gold", "Violeta", "Día", "Noche", "Océano", "Bosque", "Terracota", "Grafito",
        "Telegram claro", "Telegram oscuro", "TGX", "Nekogram", "Plus Messenger", "AyuGram",
        "Catogram", "iMe", "Unigram", "Materialgram", "64Gram", "Personalizado",
    };
    final int canvas, surface, ink, muted, accent, soft, outgoing, onAccent;
    final boolean dark;

    private Palette(int canvas, int surface, int ink, int muted, int accent, int soft, int outgoing, int onAccent, boolean dark) {
        this.canvas = canvas; this.surface = surface; this.ink = ink; this.muted = muted;
        this.accent = accent; this.soft = soft; this.outgoing = outgoing; this.onAccent = onAccent; this.dark = dark;
    }

    static Palette get(String id) {
        switch (id) {
            case "violet": return new Palette(0xfff8f9fc, 0xffffffff, 0xff20232b, 0xff6e5f78, 0xff6954d0, 0xffefecfc, 0xffede8fb, 0xffffffff, false);
            case "day": return new Palette(0xfff5f7fa, 0xffffffff, 0xff172334, 0xff526277, 0xff215eb8, 0xffe8f0fc, 0xffe4edfc, 0xffffffff, false);
            case "night": return new Palette(0xff121827, 0xff1b2333, 0xffe4e9f4, 0xffb0bdd2, 0xffb8a5ff, 0xff302b4a, 0xff363050, 0xff1b1830, true);
            case "ocean": return new Palette(0xfff1f8fa, 0xffffffff, 0xff173945, 0xff466b78, 0xff086d8b, 0xffe0f1f6, 0xffdceff5, 0xffffffff, false);
            case "forest": return new Palette(0xfff5f8f1, 0xfffefffb, 0xff223b30, 0xff526d5d, 0xff326d48, 0xffe7f1e5, 0xffe1eddc, 0xffffffff, false);
            case "sunset": return new Palette(0xfffcf6f0, 0xfffffdfa, 0xff432b28, 0xff7b5c55, 0xffa64b34, 0xfffae9df, 0xfff6e2d6, 0xffffffff, false);
            case "graphite": return new Palette(0xff191a1b, 0xff232527, 0xffefeee9, 0xffc0bcb2, 0xffe3b174, 0xff3e3428, 0xff3e3428, 0xff231c15, true);
            case "telegram": return new Palette(0xffffffff, 0xffffffff, 0xff242831, 0xff606977, 0xff3390ec, 0xffe7f2fd, 0xffeffdde, 0xffffffff, false);
            case "telegram-night": return new Palette(0xff0e1621, 0xff17212b, 0xfff5f5f5, 0xff7f91a4, 0xff5288c1, 0xff1c2b3b, 0xff2b5278, 0xffffffff, true);
            case "tgx": return new Palette(0xff0b1412, 0xff142320, 0xffe7f4f0, 0xff86a8a0, 0xff4dd0c4, 0xff1a302c, 0xff173b35, 0xff04201c, true);
            case "nekogram": return new Palette(0xff14121b, 0xff1e1a2b, 0xffefe9f7, 0xffa79bb8, 0xffc792ea, 0xff2b2138, 0xff342a49, 0xff201631, true);
            case "plus": return new Palette(0xff131211, 0xff211d19, 0xfff4ede5, 0xffb3a393, 0xffff8a3d, 0xff33251a, 0xff3a2a1c, 0xff241304, true);
            case "ayu": return new Palette(0xff0b0f14, 0xff101720, 0xffe8f1f8, 0xff92a6b8, 0xff59c2ff, 0xff122330, 0xff14324a, 0xff041820, true);
            case "catogram": return new Palette(0xfffff7fa, 0xffffffff, 0xff3a2430, 0xff8a6476, 0xffd94f86, 0xfffbe4ee, 0xffffe1ec, 0xffffffff, false);
            case "ime": return new Palette(0xfff5f8ff, 0xffffffff, 0xff1d2a3d, 0xff5c6f88, 0xff2f6fed, 0xffe8f0fd, 0xffdce9ff, 0xffffffff, false);
            case "unigram": return new Palette(0xff1b1b1f, 0xff252529, 0xfff0f0f4, 0xffa0a0aa, 0xff4cc2ff, 0xff16313d, 0xff23323d, 0xff001e28, true);
            case "material": return new Palette(0xff141218, 0xff211f26, 0xffe6e0e9, 0xffcac4d0, 0xffd0bcff, 0xff2e2839, 0xff4a4458, 0xff381e72, true);
            case "sixtyfour": return new Palette(0xff0f1115, 0xff171a21, 0xffe9eef5, 0xff96a3b5, 0xff4d9fff, 0xff152435, 0xff1f3a5f, 0xff001a33, true);
            default: return new Palette(0xff0d0e10, 0xff17181b, 0xfff5f2e9, 0xffc1bbad, 0xfff0c65c, 0xff36301f, 0xff39311e, 0xff17140c, true);
        }
    }

    static boolean systemDark(Context context) {
        return context != null && (context.getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    static Palette get(Context context) {
        return context == null ? get("gold") : get(context.getSharedPreferences("appearance", 0), systemDark(context));
    }

    static Palette get(SharedPreferences prefs) {
        return get(prefs, false);
    }

    static Palette get(SharedPreferences prefs, boolean systemDark) {
        if (prefs == null) return get(systemDark ? "night" : "day");
        if (prefs.getBoolean("auto", false)) return get(systemDark ? "night" : "day");
        String theme = prefs.getString("theme", "gold");
        if ("custom".equals(theme)) {
            Palette own = custom(prefs.getString("customTheme", ""));
            if (own != null) return own;
            return get("gold");
        }
        return get(theme == null ? "gold" : theme);
    }

    /** Strict check for themes received from the bridge before they are stored. */
    static boolean valid(String json) {
        if (json == null || json.isEmpty() || json.length() > 16384) return false;
        try {
            JSONObject theme = new JSONObject(json);
            String name = theme.optString("name", "").trim();
            if (name.isEmpty() || name.length() > 40) return false;
            String scheme = theme.optString("scheme", "dark");
            if (!"dark".equals(scheme) && !"light".equals(scheme)) return false;
            JSONObject palette = theme.optJSONObject("palette");
            if (palette == null) return false;
            for (String key : new String[]{"canvas", "surface", "text", "accent", "outgoing"}) parse(palette.optString(key, ""));
            for (String key : new String[]{"rail", "elevated", "chat", "muted", "faint", "onAccent", "line", "goldLine", "soft", "hover", "input", "selected", "outgoingMeta", "bubble", "bubbleLine", "messageMeta", "date", "premium", "pattern", "wallDot", "wallAuroraA", "wallAuroraB", "danger"}) if (palette.has(key)) parse(palette.optString(key, ""));
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }

    /** Resolves a stored custom theme; returns null when its palette is missing or corrupt. */
    static Palette custom(String json) {
        if (json == null || json.isEmpty() || json.length() > 16384) return null;
        try {
            JSONObject theme = new JSONObject(json);
            JSONObject palette = theme.optJSONObject("palette");
            if (palette == null) return null;
            boolean dark = !"light".equals(theme.optString("scheme", "dark"));
            int fallback = dark ? 0xff101113 : 0xfff6f7f9;
            return new Palette(
                color(palette.optString("canvas", ""), fallback),
                color(palette.optString("surface", ""), dark ? 0xff191a1e : 0xffffffff),
                color(palette.optString("text", ""), dark ? 0xffecece9 : 0xff242831),
                color(palette.optString("muted", ""), dark ? 0xff9d9eaa : 0xff606977),
                color(palette.optString("accent", ""), 0xffdfbd78),
                color(palette.optString("soft", ""), dark ? 0xff36301f : 0xffe8f0fc),
                color(palette.optString("outgoing", ""), dark ? 0xff353021 : 0xffdfebfa),
                color(palette.optString("onAccent", ""), dark ? 0xff241d10 : 0xffffffff),
                dark);
        } catch (Exception ignored) {
            return null;
        }
    }

    private static int color(String value, int fallback) {
        try { return parse(value); } catch (Exception ignored) { return fallback; }
    }

    /** Accepts the #rrggbb and #rrggbbaa colors used by the shared theme catalogue. */
    static int parse(String value) {
        String hex = value == null ? "" : value.trim();
        if (hex.startsWith("#")) hex = hex.substring(1);
        if (!hex.matches("[0-9a-fA-F]{6}|[0-9a-fA-F]{8}")) throw new IllegalArgumentException();
        if (hex.length() == 6) return 0xff000000 | Integer.parseInt(hex, 16);
        long rgb = Long.parseLong(hex, 16);
        int alpha = (int) (rgb & 0xff);
        int red = (int) ((rgb >>> 24) & 0xff);
        int green = (int) ((rgb >>> 16) & 0xff);
        int blue = (int) ((rgb >>> 8) & 0xff);
        return alpha << 24 | red << 16 | green << 8 | blue;
    }
}
