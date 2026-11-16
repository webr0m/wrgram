package cc.webrom.wrgram;

import org.json.JSONObject;
import org.drinkless.tdlib.TdApi;

final class ChatNotificationPolicy {
    static boolean explicitlyMuted(TdApi.ChatNotificationSettings settings) {
        // TDLib exposes remaining seconds, not a Unix timestamp.
        return settings != null && !settings.useDefaultMuteFor && settings.muteFor > 0;
    }

    static int muteFor(JSONObject params) {
        Object enabled = params.opt("value");
        if (!(enabled instanceof Boolean)) throw new IllegalArgumentException("Ajuste de notificaciones no válido.");
        if (!params.has("muteFor")) return (Boolean) enabled ? Integer.MAX_VALUE : 0;
        Object raw = params.opt("muteFor");
        if (!(raw instanceof Integer) && !(raw instanceof Long)) throw new IllegalArgumentException("Duración no válida.");
        long seconds = ((Number) raw).longValue();
        if (seconds < 0 || seconds > Integer.MAX_VALUE || ((Boolean) enabled) != (seconds > 0))
            throw new IllegalArgumentException("Duración no válida.");
        return (int) seconds;
    }
}
