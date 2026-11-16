package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Proyección pura de las solicitudes de ingreso: no pide nada a Telegram ni lee la sesión.
 * El puente añade los nombres desde su caché y Telegram vuelve a validar los permisos al decidir.
 */
final class JoinRequests {
    static final int PAGE = 20;

    private JoinRequests() {}

    /** Solicitudes pendientes que Telegram ya informó; cero si aún no las conoce. */
    static int count(TdApi.Chat chat) {
        if (chat == null || chat.pendingJoinRequests == null) return 0;
        return Math.max(0, chat.pendingJoinRequests.totalCount);
    }

    /** Fila sin nombre; el identificador viaja como texto para no perder precisión en JavaScript. */
    static JSONObject row(TdApi.ChatJoinRequest request) throws Exception {
        if (request == null || request.userId == 0) return null;
        return new JSONObject().put("userId", Long.toString(request.userId))
                .put("date", Math.max(0, request.date))
                .put("bio", request.bio == null ? "" : limit(request.bio, 140));
    }

    /** Página con su marcador opaco. El marcador solo existe cuando la página vino llena. */
    static JSONObject page(JSONArray rows, int total) throws Exception {
        JSONArray values = rows == null ? new JSONArray() : rows;
        JSONObject data = new JSONObject().put("total", Math.max(0, total)).put("requests", values);
        if (values.length() == 0) return data.put("next", false);
        boolean full = values.length() >= PAGE;
        data.put("next", full);
        if (full) {
            JSONObject last = values.getJSONObject(values.length() - 1);
            data.put("cursor", token(Long.parseLong(last.getString("userId")), last.getInt("date")));
        }
        return data;
    }

    static String token(long userId, int date) { return Long.toString(userId) + ":" + Integer.toString(date); }

    /** Marcador devuelto por la página anterior; vacío significa «desde el principio». */
    static TdApi.ChatJoinRequest offset(String value) throws Exception {
        if (value == null || value.isEmpty()) return null;
        int split = value.indexOf(':');
        if (split <= 0 || split != value.lastIndexOf(':') || split == value.length() - 1) {
            throw new IllegalArgumentException("El marcador de solicitudes no es válido.");
        }
        final long userId;
        final int date;
        try {
            userId = Long.parseLong(value.substring(0, split));
            date = Integer.parseInt(value.substring(split + 1));
        } catch (NumberFormatException failure) {
            throw new IllegalArgumentException("El marcador de solicitudes no es válido.");
        }
        if (userId <= 0 || date <= 0) throw new IllegalArgumentException("El marcador de solicitudes no es válido.");
        return new TdApi.ChatJoinRequest(userId, date, "");
    }

    private static String limit(String text, int size) { return text.length() > size ? text.substring(0, size) + "…" : text; }
}
