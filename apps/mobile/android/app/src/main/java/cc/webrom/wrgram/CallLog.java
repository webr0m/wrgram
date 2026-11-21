package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import java.text.Normalizer;

/**
 * El registro de llamadas no se puede buscar en el servidor. `SearchCallMessages` (TdApi.java:145268)
 * tiene tres campos —un cursor opaco, un tamaño de página de hasta cien y `onlyMissed`— y devuelve
 * `FoundMessages` (TdApi.java:27093) con un total aproximado, las filas y el cursor siguiente: no hay
 * `query`. Lo que escribe la persona solo puede compararse aquí, sobre lo que ya bajó, y eso cambia lo
 * que la pantalla puede prometer: un filtro por nombre nunca ve las filas que todavía no se pidieron.
 * `onlyMissed` tampoco es «perdidas» a secas —TDLib mete dentro las rechazadas—, y una página puede
 * venir más corta que `LIMIT` con el registro aún sin recorrer, porque el único testigo de que queda
 * página es el cursor. Esta clase es la única que sabe esas tres cosas; el puente, la interfaz y la
 * prueba comparten las reglas y las palabras, y nada de esto toca la sesión.
 */
final class CallLog {
    /** TDLib admite hasta cien por página; con cincuenta la primera pantalla cabe sin desplazar. */
    static final int LIMIT = 50;
    /** Un cursor opaco de Telegram no debería pasar de aquí; si lo pasa, algo se leyó mal. */
    static final int MAX_OFFSET = 64;
    static final String BAD_OFFSET = "El cursor del registro de llamadas no es válido.";
    static final String STALE_CURSOR = "Vuelve a abrir el registro de llamadas para continuar.";

    private CallLog() {}

    /** Las dos familias que Telegram mete en el registro: la llamada de uno a uno y la de grupo. */
    static boolean isCall(TdApi.MessageContent content) {
        return content instanceof TdApi.MessageCall || content instanceof TdApi.MessageGroupCall;
    }

    /** Lo que Telegram considera no contestada: perdida o rechazada, en la llamada uno a uno. */
    static boolean missed(TdApi.CallDiscardReason reason) {
        return reason instanceof TdApi.CallDiscardReasonMissed || reason instanceof TdApi.CallDiscardReasonDeclined;
    }

    /** En la llamada de grupo no hay motivo: `wasMissed` cubre las dos cosas que cubre `onlyMissed`. */
    static boolean missed(TdApi.Message message) {
        if (message == null || !isCall(message.content)) return false;
        if (message.content instanceof TdApi.MessageCall) return missed(((TdApi.MessageCall) message.content).discardReason);
        return ((TdApi.MessageGroupCall) message.content).wasMissed;
    }

    /** Vídeo o voz, en las dos familias; un contenido que no es llamada nunca es vídeo. */
    static boolean video(TdApi.Message message) {
        if (message == null || !isCall(message.content)) return false;
        return message.content instanceof TdApi.MessageCall
            ? ((TdApi.MessageCall) message.content).isVideo
            : ((TdApi.MessageGroupCall) message.content).isVideo;
    }

    /** Cincuenta segundos de una conversación grabada no son una llamada: la fila sigue sin duración. */
    static int duration(TdApi.Message message) {
        if (message == null || !isCall(message.content)) return 0;
        int seconds = message.content instanceof TdApi.MessageCall
            ? ((TdApi.MessageCall) message.content).duration
            : ((TdApi.MessageGroupCall) message.content).duration;
        return seconds > 0 ? seconds : 0;
    }

    /** Cursor ya validado; vacío significa «desde la última llamada». */
    static String offset(String raw) {
        String value = raw == null ? "" : raw;
        if (value.length() > MAX_OFFSET) throw new IllegalArgumentException(BAD_OFFSET);
        return value;
    }

    /** TDLib puede devolver menos filas que `LIMIT` y dejar registro detrás: solo el cursor lo dice. */
    static boolean more(String nextOffset) {
        return nextOffset != null && !nextOffset.isEmpty();
    }

    /** `totalCount` es aproximado y vale -1 cuando Telegram no lo sabe; un negativo nunca se pinta. */
    static int total(int raw) {
        return raw < 0 ? 0 : raw;
    }

    /** Nombre sin acentos, en minúsculas y con los espacios de golpe: «José» y «jose » sirven igual. */
    static String normalize(String value) {
        String text = value == null ? "" : Normalizer.normalize(value, Normalizer.Form.NFD).replaceAll("\\p{Mn}+", "");
        return text.toLowerCase(java.util.Locale.ROOT).replaceAll("\\s+", " ").trim();
    }

    /** Filtro local sobre el título del chat; la consulta vacía deja pasar todo. */
    static boolean matches(String title, String query) {
        String needle = normalize(query);
        if (needle.isEmpty()) return true;
        return normalize(title).contains(needle);
    }

    /**
     * La fila que pinta la interfaz. `label` es la frase que ya se lee dentro del chat —la pone
     * `ServiceMessages`, para que el registro no invente otra manera de decir lo mismo—, y el resto
     * son los datos sueltos que el icono y el filtro necesitan.
     */
    static JSONObject row(TdApi.Message message, String title, String label) throws Exception {
        boolean group = message.content instanceof TdApi.MessageGroupCall;
        return new JSONObject()
            .put("chatId", String.valueOf(message.chatId))
            .put("messageId", String.valueOf(message.id))
            .put("title", title == null ? "" : title)
            .put("label", label == null ? "" : label)
            .put("date", message.date)
            .put("missed", missed(message))
            .put("video", video(message))
            .put("group", group)
            .put("duration", duration(message));
    }
}
