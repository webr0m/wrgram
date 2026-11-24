package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * La lectura de un mensaje propio: TDLib responde {@link TdApi.MessageReadDate} en chats privados y
 * {@link TdApi.MessageViewers} en grupos. Aquí solo se proyecta la respuesta a JSON con las cinco
 * variantes de fecha con nombre; las ventanas de tiempo y la privacidad las decide el servidor.
 */
final class ReadReceipts {
    static final String NOT_OUTGOING = "Solo puedes consultar la lectura de tus propios mensajes.";
    static final String NOT_PRIVATE = "La hora de lectura solo se consulta en chats privados.";
    static final String NOT_GROUP = "Los lectores solo se consultan en grupos.";
    static final String DATE_UNAVAILABLE = "Telegram no permite consultar la hora de lectura de este mensaje.";
    static final String VIEWERS_UNAVAILABLE = "Telegram no permite consultar los lectores de este mensaje.";
    static final String BROKEN = "No se pudo preparar la consulta de lectura.";
    static final String SCOPE_CHANGED = "La conversación cambió.";
    static final String UNKNOWN_USER = "Usuario de Telegram";

    private ReadReceipts() {
    }

    static boolean sameScope(long activeChat, int activeTopic, long chatId, int topicId) {
        return activeChat == chatId && activeTopic == topicId;
    }

    static JSONObject error(TdApi.Error value, boolean viewers) throws Exception {
        if (value == null || value.message == null) return null;
        int separator = value.message.indexOf(':');
        String code = separator < 0 ? value.message : value.message.substring(0, separator);
        if (viewers) {
            return "MESSAGE_NOT_READ_YET".equals(code) ? new JSONObject().put("viewers", new JSONArray()) : null;
        }
        switch (code) {
            case "MESSAGE_NOT_READ_YET": return date(new TdApi.MessageReadDateUnread());
            case "MESSAGE_TOO_OLD": return date(new TdApi.MessageReadDateTooOld());
            case "USER_PRIVACY_RESTRICTED": return date(new TdApi.MessageReadDateUserPrivacyRestricted());
            case "YOUR_PRIVACY_RESTRICTED": return date(new TdApi.MessageReadDateMyPrivacyRestricted());
            default: return null;
        }
    }

    static long[] missingViewerIds(TdApi.MessageViewers value, java.util.function.LongFunction<String> names) {
        java.util.LinkedHashSet<Long> ids = new java.util.LinkedHashSet<>();
        if (value != null && value.viewers != null) {
            for (TdApi.MessageViewer viewer : value.viewers) {
                if (viewer == null) continue;
                String name = names.apply(viewer.userId);
                if (name == null || name.isEmpty()) ids.add(viewer.userId);
            }
        }
        long[] result = new long[ids.size()];
        int index = 0;
        for (long id : ids) result[index++] = id;
        return result;
    }

    interface UserLookup {
        void get(long id, Consumer<TdApi.User> success, Consumer<TdApi.Error> failure);
    }

    static void hydrateViewerNames(long[] ids, UserLookup lookup, BiConsumer<Long, String> loaded,
                                   Runnable done, Consumer<TdApi.Error> failed) {
        if (ids.length == 0) {
            done.run();
            return;
        }
        AtomicInteger remaining = new AtomicInteger(ids.length);
        AtomicBoolean settled = new AtomicBoolean(false);
        for (long id : ids) {
            lookup.get(id, user -> {
                if (settled.get()) return;
                String name = PersonName.of(user);
                if (name != null && !name.isEmpty()) loaded.accept(id, name);
                if (remaining.decrementAndGet() == 0 && settled.compareAndSet(false, true)) done.run();
            }, error -> {
                if (settled.compareAndSet(false, true)) failed.accept(error);
            });
        }
    }

    static JSONObject date(TdApi.MessageReadDate value) throws Exception {
        JSONObject json = new JSONObject();
        if (value instanceof TdApi.MessageReadDateRead) {
            json.put("state", "read");
            json.put("date", ((TdApi.MessageReadDateRead) value).readDate);
        } else if (value instanceof TdApi.MessageReadDateUnread) json.put("state", "unread");
        else if (value instanceof TdApi.MessageReadDateTooOld) json.put("state", "tooOld");
        else if (value instanceof TdApi.MessageReadDateUserPrivacyRestricted) json.put("state", "userRestricted");
        else if (value instanceof TdApi.MessageReadDateMyPrivacyRestricted) json.put("state", "myRestricted");
        else throw new IllegalArgumentException("Unknown read date");
        return json;
    }

    static JSONObject viewers(TdApi.MessageViewers value, java.util.function.LongFunction<String> names) throws Exception {
        JSONArray rows = new JSONArray();
        if (value != null && value.viewers != null) {
            for (TdApi.MessageViewer viewer : value.viewers) {
                if (viewer == null) continue;
                String name = names.apply(viewer.userId);
                rows.put(new JSONObject().put("id", Long.toString(viewer.userId))
                        .put("name", name == null || name.isEmpty() ? UNKNOWN_USER : name)
                        .put("date", viewer.viewDate));
            }
        }
        return new JSONObject().put("viewers", rows);
    }
}