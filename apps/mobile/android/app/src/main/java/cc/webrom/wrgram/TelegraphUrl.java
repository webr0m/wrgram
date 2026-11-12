package cc.webrom.wrgram;

import java.net.URI;
import java.net.URISyntaxException;

final class TelegraphUrl {
    private TelegraphUrl() {}

    static String normalize(String value) {
        if (value == null || value.length() > 2048) return null;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (!"telegra.ph".equalsIgnoreCase(uri.getRawAuthority())
                    || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) return null;
            return "https" + value.substring(scheme.length());
        } catch (URISyntaxException ignored) {
            return null;
        }
    }
}
