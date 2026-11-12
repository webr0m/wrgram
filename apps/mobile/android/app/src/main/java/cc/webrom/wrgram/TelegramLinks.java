package cc.webrom.wrgram;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** Normalizes only Telegram-owned links; arbitrary URLs never reach the TDLib router. */
final class TelegramLinks {
    private TelegramLinks() {}

    static String normalize(String raw) {
        if (raw == null) return null;
        String value = raw.trim();
        if (value.isEmpty() || value.length() > 2048) return null;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            String host = uri.getHost() == null ? "" : uri.getHost().toLowerCase(Locale.ROOT);
            if (host.isEmpty() || uri.getRawUserInfo() != null || uri.getPort() != -1) return null;
            String path = uri.getRawPath() == null ? "" : uri.getRawPath();
            String query = uri.getRawQuery();
            if (path.length() > 1024 || query != null && query.length() > 1024) return null;
            if ("tg".equals(scheme)) return "tg://" + host + path + (query == null || query.isEmpty() ? "" : "?" + query);
            if (!"https".equals(scheme) || !("t.me".equals(host) || "telegram.me".equals(host) || "telegram.dog".equals(host))) return null;
            return "https://" + host + path + (query == null || query.isEmpty() ? "" : "?" + query);
        } catch (URISyntaxException ignored) {
            return null;
        }
    }

    static boolean isTelegram(String raw) {
        return normalize(raw) != null;
    }
}
