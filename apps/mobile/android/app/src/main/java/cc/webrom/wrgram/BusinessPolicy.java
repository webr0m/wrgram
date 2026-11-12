package cc.webrom.wrgram;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

import org.drinkless.tdlib.TdApi;

/** Validación y construcción de los objetos de Telegram Business y respuestas rápidas. */
final class BusinessPolicy {
    static final int MAX_NAME = 32;
    static final int MAX_TEXT = 4096;
    static final int MAX_TITLE = 64;
    static final int MAX_ZONE = 64;
    static final int MAX_INTERVALS = 60;
    static final Set<Integer> INACTIVITY_DAYS = new HashSet<>(Arrays.asList(7, 14, 21, 28));

    private BusinessPolicy() {
    }

    static String name(JSONObject params, String key) {
        Object value = params.opt(key);
        if (!(value instanceof String) || ((String) value).trim().isEmpty() || ((String) value).length() > MAX_NAME)
            throw new IllegalArgumentException("El nombre de la respuesta rápida debe tener entre 1 y " + MAX_NAME + " caracteres.");
        return ((String) value).trim();
    }

    static String text(JSONObject params, String key, int maximum, String label) {
        Object value = params.opt(key);
        if (!(value instanceof String)) return "";
        if (((String) value).length() > maximum) throw new IllegalArgumentException(label + " no puede superar " + maximum + " caracteres.");
        return (String) value;
    }

    static int inactivityDays(JSONObject params) {
        int days = params.optInt("inactivityDays", -1);
        if (!INACTIVITY_DAYS.contains(days)) throw new IllegalArgumentException("Telegram solo acepta 7, 14, 21 o 28 días de inactividad.");
        return days;
    }

    static TdApi.BusinessRecipients recipients(JSONObject params, String key) {
        Object raw = params.opt(key);
        if (!(raw instanceof JSONObject)) return new TdApi.BusinessRecipients(null, null, false, false, false, false, false);
        JSONObject value = (JSONObject) raw;
        return new TdApi.BusinessRecipients(null, null, value.optBoolean("existing", false), value.optBoolean("newChats", false),
                value.optBoolean("contacts", false), value.optBoolean("nonContacts", false), false);
    }

    static TdApi.BusinessAwayMessageSchedule schedule(JSONObject params) {
        String kind = text(params, "schedule", 12, "El tipo de horario");
        if (kind.equals("custom")) {
            int start = params.optInt("startDate", -1);
            int end = params.optInt("endDate", -1);
            if (start < 0 || end < 0 || end <= start) throw new IllegalArgumentException("La fecha de fin debe ser posterior a la de inicio.");
            return new TdApi.BusinessAwayMessageScheduleCustom(start, end);
        }
        if (kind.equals("outside")) return new TdApi.BusinessAwayMessageScheduleOutsideOfOpeningHours();
        return new TdApi.BusinessAwayMessageScheduleAlways();
    }

    static TdApi.BusinessOpeningHoursInterval[] intervals(JSONObject params, String key) {
        Object raw = params.opt(key);
        if (!(raw instanceof JSONArray)) throw new IllegalArgumentException("Falta la lista de horarios.");
        JSONArray items = (JSONArray) raw;
        if (items.length() > MAX_INTERVALS) throw new IllegalArgumentException("Demasiados tramos de horario.");
        TdApi.BusinessOpeningHoursInterval[] result = new TdApi.BusinessOpeningHoursInterval[items.length()];
        for (int i = 0; i < result.length; i++) {
            Object item = items.opt(i);
            if (!(item instanceof JSONObject)) throw new IllegalArgumentException("Tramo de horario no válido.");
            JSONObject value = (JSONObject) item;
            int start = value.optInt("startMinute", -1), end = value.optInt("endMinute", -1);
            if (start < 0 || end <= start || end > 10080) throw new IllegalArgumentException("Cada tramo debe tener inicio y fin dentro de la semana y duración mayor que cero.");
            result[i] = new TdApi.BusinessOpeningHoursInterval(start, end);
        }
        return result;
    }

    static TdApi.BusinessBotRights botRights(JSONObject params, String key) {
        Object raw = params.opt(key);
        JSONObject value = raw instanceof JSONObject ? (JSONObject) raw : new JSONObject();
        return new TdApi.BusinessBotRights(value.optBoolean("canReply"), value.optBoolean("canReadMessages"), value.optBoolean("canDeleteSentMessages"),
                value.optBoolean("canDeleteAllMessages"), value.optBoolean("canEditName"), value.optBoolean("canEditBio"), value.optBoolean("canEditProfilePhoto"),
                value.optBoolean("canEditUsername"), value.optBoolean("canViewGiftsAndStars"), value.optBoolean("canSellGifts"), value.optBoolean("canChangeGiftSettings"),
                value.optBoolean("canTransferAndUpgradeGifts"), value.optBoolean("canTransferStars"), value.optBoolean("canManageStories"));
    }

    static String[] rightKeys() {
        return new String[]{"canReply", "canReadMessages", "canDeleteSentMessages", "canDeleteAllMessages", "canEditName", "canEditBio", "canEditProfilePhoto",
                "canEditUsername", "canViewGiftsAndStars", "canSellGifts", "canChangeGiftSettings", "canTransferAndUpgradeGifts", "canTransferStars", "canManageStories"};
    }
}
