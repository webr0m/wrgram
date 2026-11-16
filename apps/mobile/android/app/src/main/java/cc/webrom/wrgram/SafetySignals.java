package cc.webrom.wrgram;

import java.util.Locale;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Proyección pura de las señales de seguridad que Telegram ya informó sobre un chat.
 * No infiere reputación: si Telegram no lo dijo, aquí no existe. Los textos los decide la interfaz.
 */
final class SafetySignals {
    static final int MAX_SIGNALS = 12;
    static final int MAX_TITLE = 80;
    static final int MAX_REASON = 140;

    private SafetySignals() {}

    /**
     * Barra de acciones que Telegram pidió mostrar. Devuelve solo datos: la red con la que se
     * explica el aviso pertenece a la interfaz, para que «descartar» y «denunciar» siempre
     * describan el mismo hecho que llegó de Telegram.
     */
    static JSONObject notice(TdApi.Chat chat) throws Exception {
        if (chat == null || chat.actionBar == null) return null;
        TdApi.ChatActionBar bar = chat.actionBar;
        if (bar instanceof TdApi.ChatActionBarReportSpam) {
            return base("spam", "warn").put("canUnarchive", ((TdApi.ChatActionBarReportSpam) bar).canUnarchive);
        }
        if (bar instanceof TdApi.ChatActionBarReportAddBlock) {
            TdApi.ChatActionBarReportAddBlock value = (TdApi.ChatActionBarReportAddBlock) bar;
            JSONObject data = base("unknown", "warn").put("canUnarchive", value.canUnarchive);
            String registered = registered(value.accountInfo);
            if (registered != null) data.put("registered", registered);
            return data;
        }
        if (bar instanceof TdApi.ChatActionBarInviteMembers) return base("invite", "info");
        if (bar instanceof TdApi.ChatActionBarAddContact) return base("contact", "info");
        if (bar instanceof TdApi.ChatActionBarSharePhoneNumber) return base("phone", "info");
        if (bar instanceof TdApi.ChatActionBarJoinRequest) {
            TdApi.ChatActionBarJoinRequest value = (TdApi.ChatActionBarJoinRequest) bar;
            return base("join", "info").put("channel", value.isChannel)
                    .put("date", Math.max(0, value.requestDate))
                    .put("title", value.title == null ? "" : limit(value.title, MAX_TITLE));
        }
        return null;
    }

    private static JSONObject base(String kind, String tone) throws Exception {
        return new JSONObject().put("kind", kind).put("tone", tone);
    }

    /** «2024-03» cuando Telegram informó un año y mes reales; null en cualquier otro caso. */
    static String registered(TdApi.AccountInfo info) {
        if (info == null) return null;
        if (info.registrationYear < 1970 || info.registrationMonth < 1 || info.registrationMonth > 12) return null;
        return String.format(Locale.ROOT, "%04d-%02d", info.registrationYear, info.registrationMonth);
    }

    /** Telegram permite quitar su aviso solo en las barras de spam y de cuenta desconocida. */
    static boolean dismissible(TdApi.ChatActionBar bar) {
        return bar instanceof TdApi.ChatActionBarReportSpam || bar instanceof TdApi.ChatActionBarReportAddBlock;
    }

    static boolean dismissible(TdApi.Chat chat) {
        return chat != null && dismissible(chat.actionBar);
    }

    /** Señales ordenadas de más grave a más informativa, con un máximo para no inundar el panel. */
    static JSONArray signals(TdApi.Chat chat, TdApi.User user, TdApi.UserFullInfo fullInfo, TdApi.Supergroup group)
            throws Exception {
        JSONArray list = new JSONArray();
        TdApi.VerificationStatus status = user != null ? user.verificationStatus : group != null ? group.verificationStatus : null;
        if (status != null) {
            if (status.isScam) add(list, "scam", "bad");
            if (status.isFake) add(list, "fake", "bad");
            if (status.isVerified) add(list, "verified", "good");
        }
        TdApi.RestrictionInfo restriction = user != null ? user.restrictionInfo : group != null ? group.restrictionInfo : null;
        if (restriction != null && restriction.restrictionReason != null && !restriction.restrictionReason.isBlank()) {
            add(list, "restricted", "bad", limit(restriction.restrictionReason.trim(), MAX_REASON));
        }
        if (user != null) {
            if (user.type instanceof TdApi.UserTypeDeleted) add(list, "deleted", "warn");
            if (user.restrictsNewChats) add(list, "restrictsNewChats", "warn");
            if (!user.isContact && !user.isMutualContact) add(list, "notContact", "warn");
        }
        if (fullInfo != null) {
            if (fullInfo.usesUnofficialApp) add(list, "unofficialApp", "warn");
            if (fullInfo.hasPrivateForwards) add(list, "privateForwards", "info");
            if (fullInfo.groupInCommonCount > 0) add(list, "commonGroups", "info",
                    Integer.toString(Math.min(fullInfo.groupInCommonCount, 999)));
        }
        if (group != null) {
            if (group.isChannel && !group.showMessageSender) add(list, "anonymousSenders", "info");
            if (group.signMessages) add(list, "signMessages", "info");
            if (group.joinByRequest) add(list, "joinByRequest", "info");
            if (group.joinToSendMessages) add(list, "joinToSend", "info");
        }
        if (chat != null && chat.hasProtectedContent) add(list, "protectedContent", "info");
        return list;
    }

    private static void add(JSONArray list, String id, String tone) throws Exception {
        add(list, id, tone, "");
    }

    /** Se conservan las primeras: el orden anterior ya va de la señal más grave a la más informativa. */
    private static void add(JSONArray list, String id, String tone, String value) throws Exception {
        if (list.length() >= MAX_SIGNALS) return;
        list.put(new JSONObject().put("id", id).put("tone", tone).put("value", value));
    }

    private static String limit(String text, int size) { return text.length() > size ? text.substring(0, size) : text; }
}
