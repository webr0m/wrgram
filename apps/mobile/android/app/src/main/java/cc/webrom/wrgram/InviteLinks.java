package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Proyección y validación de los enlaces de invitación de un chat. Sin sesión, sin TDLib en runtime
 * más allá de los DTOs: todo lo decide Telegram, aquí solo se traduce y se rechaza lo imposible.
 */
final class InviteLinks {
    static final int PAGE = 20;
    static final int MAX_URL = 512;
    static final int MAX_NAME = 32;
    static final int MAX_MEMBERS = 99_999;
    static final int MAX_SPAN = 31_536_000;

    private InviteLinks() {}

    static final class Cursor {
        final int date;
        final String link;
        Cursor(int date, String link) { this.date = date; this.link = link; }
    }

    static String token(int date, String link) { return Integer.toString(Math.max(0, date)) + ':' + (link == null ? "" : link); }

    /** Marcador opaco `fecha:enlace` devuelto por la página anterior; null significa «desde el principio». */
    static Cursor cursor(String value) {
        if (value == null || value.isEmpty()) return null;
        int split = value.indexOf(':');
        if (split <= 0 || split == value.length() - 1) throw new IllegalArgumentException("El marcador de enlaces no es válido.");
        String head = value.substring(0, split);
        if (!head.matches("[0-9]{1,10}")) throw new IllegalArgumentException("El marcador de enlaces no es válido.");
        String link = value.substring(split + 1);
        if (link.length() > MAX_URL || link.matches(".*\\s.*")) throw new IllegalArgumentException("El marcador de enlaces no es válido.");
        return new Cursor(Integer.parseInt(head), link);
    }

    static JSONObject row(TdApi.ChatInviteLink link) throws Exception {
        if (link == null || link.inviteLink == null || link.inviteLink.isEmpty() || link.inviteLink.length() > MAX_URL) return null;
        return new JSONObject()
                .put("link", link.inviteLink)
                .put("name", cut(link.name, MAX_NAME))
                .put("creator", Long.toString(Math.max(0L, link.creatorUserId)))
                .put("created", Math.max(0, link.date))
                .put("edited", Math.max(0, link.editDate))
                .put("expires", Math.max(0, link.expirationDate))
                .put("memberLimit", Math.max(0, link.memberLimit))
                .put("memberCount", Math.max(0, link.memberCount))
                .put("pending", Math.max(0, link.pendingJoinRequestCount))
                .put("approval", link.createsJoinRequest)
                .put("primary", link.isPrimary)
                .put("revoked", link.isRevoked)
                .put("paid", link.subscriptionPricing != null);
    }

    static JSONObject page(JSONArray rows, int total, boolean revoked) throws Exception {
        JSONArray values = rows == null ? new JSONArray() : rows;
        JSONObject data = new JSONObject().put("total", Math.max(0, total)).put("links", values).put("revoked", revoked);
        if (values.length() == 0) return data.put("next", false);
        boolean full = values.length() >= PAGE;
        data.put("next", full);
        if (full) {
            JSONObject last = values.getJSONObject(values.length() - 1);
            data.put("cursor", token(last.getInt("created"), last.getString("link")));
        }
        return data;
    }

    /** Solo formas que Telegram produce de verdad: así un enlace inventado nunca llega a `Edit`/`Revoke`. */
    static boolean validUrl(String value) {
        if (value == null || value.isEmpty() || value.length() > MAX_URL || value.matches(".*\\s.*")) return false;
        return value.matches("(?i)(https://(?:t\\.me|telegram\\.me|telegram\\.dog)/(?:join\\?invite=\\S+|joinchat/\\S+|\\+\\S+|[A-Za-z][A-Za-z0-9_]{3,31})|tg://join\\?invite=\\S+)");
    }

    /** Devuelve el mensaje que debe ver el usuario, o null cuando el formulario se puede enviar. */
    static String problem(String name, long expiresIn, int memberLimit, boolean approval) {
        if (name == null) return "El nombre del enlace no es válido.";
        if (name.length() > MAX_NAME) return "El nombre del enlace no puede superar 32 caracteres.";
        if (expiresIn < 0) return "La caducidad del enlace no es válida.";
        if (expiresIn > MAX_SPAN) return "Telegram no permite enlaces que caduquen más allá de un año.";
        if (memberLimit < 0 || memberLimit > MAX_MEMBERS) return "El límite de miembros debe estar entre 0 y 99.999.";
        if (approval && memberLimit > 0) return "Un enlace que exige aprobación no puede limitar además el número de miembros.";
        return null;
    }

    /** Caducidad absoluta a partir de los segundos elegidos; 0 significa «sin caducidad». */
    static int expiration(long now, long expiresIn) {
        if (expiresIn <= 0) return 0;
        if (expiresIn > MAX_SPAN) throw new IllegalArgumentException("Telegram no permite enlaces que caduquen más allá de un año.");
        long value = now + expiresIn;
        if (value > Integer.MAX_VALUE) throw new IllegalArgumentException("La caducidad del enlace no es válida.");
        return (int) value;
    }

    /** `true` cuando Telegram acepta que se le cambien los ajustes de acceso a este enlace. */
    static boolean editable(TdApi.ChatInviteLink link) {
        return link != null && !link.isPrimary && link.subscriptionPricing == null && !link.isRevoked;
    }

    private static String cut(String value, int size) { return value == null ? "" : value.length() > size ? value.substring(0, size) : value; }
}
