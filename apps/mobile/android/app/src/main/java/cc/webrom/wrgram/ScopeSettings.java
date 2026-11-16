package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Ajustes de notificación que Telegram guarda por tipo de chat (privados, grupos, canales).
 * La fusión es la guarda real: `SetScopeNotificationSettings` sustituye el objeto completo, así que
 * todo lo que la interfaz no gestiona se copia de lo que Telegram acaba de decir, nunca de un valor
 * por defecto. `useDefaultMuteStories` vive fuera de la interfaz a propósito: mientras sea verdadero,
 * el ajuste propio de historias no se aplica, y WRGram no puede decidirlo por la cuenta.
 */
final class ScopeSettings {
    static final int MAX_MUTE = Integer.MAX_VALUE;
    static final long DEFAULT_SOUND = -1L;
    static final long SILENT = 0L;
    static final int MAX_SOUNDS = 64;
    static final int MAX_TITLE = 64;
    static final String[] IDS = {"private", "group", "channel"};

    /** Solo las tres formas que TDLib admite; un alcance inventado no llega al puente de escritura. */
    static TdApi.NotificationSettingsScope scope(String id) {
        if (id == null) return null;
        if (id.equals("private")) return new TdApi.NotificationSettingsScopePrivateChats();
        if (id.equals("group")) return new TdApi.NotificationSettingsScopeGroupChats();
        if (id.equals("channel")) return new TdApi.NotificationSettingsScopeChannelChats();
        return null;
    }

    static String idOf(TdApi.NotificationSettingsScope scope) {
        if (scope instanceof TdApi.NotificationSettingsScopePrivateChats) return "private";
        if (scope instanceof TdApi.NotificationSettingsScopeGroupChats) return "group";
        if (scope instanceof TdApi.NotificationSettingsScopeChannelChats) return "channel";
        return "";
    }

    /** Cómo se nombra el alcance en el diálogo: el texto nunca lo inventa la interfaz. */
    static String phrase(String id) {
        if ("private".equals(id)) return "los chats privados";
        if ("group".equals(id)) return "los grupos";
        if ("channel".equals(id)) return "los canales";
        return "este tipo de chat";
    }

    /** Los identificadores de sonido viajan en texto: un id de 64 bits no sobrevive a un double. */
    static JSONObject row(TdApi.NotificationSettingsScope scope, TdApi.ScopeNotificationSettings value) throws Exception {
        String id = idOf(scope);
        if (id.isEmpty() || value == null) return null;
        return new JSONObject()
            .put("scope", id)
            .put("muted", value.muteFor > 0)
            .put("muteFor", Math.max(0, value.muteFor))
            .put("sound", Long.toString(value.soundId))
            .put("preview", value.showPreview)
            .put("muteStories", value.muteStories)
            .put("storyDefault", value.useDefaultMuteStories)
            .put("storySound", Long.toString(value.storySoundId))
            .put("storyPoster", value.showStoryPoster)
            .put("quietPinned", value.disablePinnedMessageNotifications)
            .put("quietMentions", value.disableMentionNotifications);
    }

    static JSONArray sounds(TdApi.NotificationSounds list) throws Exception {
        JSONArray rows = new JSONArray();
        if (list == null || list.notificationSounds == null) return rows;
        for (TdApi.NotificationSound sound : list.notificationSounds) {
            if (sound == null || rows.length() >= MAX_SOUNDS) continue;
            // -1 y 0 son estados, no sonidos guardados: si Telegram los devolviera, no serían elegibles.
            if (sound.id == DEFAULT_SOUND || sound.id == SILENT || sound.id < 0) continue;
            rows.put(new JSONObject()
                .put("id", Long.toString(sound.id))
                .put("title", NativeSnapshot.limit(sound.title == null ? "" : sound.title, MAX_TITLE))
                .put("duration", Math.max(0, sound.duration)));
        }
        return rows;
    }

    static JSONArray allowed(JSONArray sounds) throws Exception {
        JSONArray ids = new JSONArray();
        for (int i = 0; i < sounds.length(); i++) ids.put(sounds.getJSONObject(i).getString("id"));
        return ids;
    }

    static boolean known(String key) {
        return "muted".equals(key) || "muteFor".equals(key) || "sound".equals(key) || "preview".equals(key)
            || "muteStories".equals(key) || "storySound".equals(key) || "storyPoster".equals(key)
            || "quietPinned".equals(key) || "quietMentions".equals(key);
    }

    /** Copia defensiva: no se entrega a TDLib el objeto que devolvió la lectura. */
    static TdApi.ScopeNotificationSettings copy(TdApi.ScopeNotificationSettings value) {
        return new TdApi.ScopeNotificationSettings(value.muteFor, value.soundId, value.showPreview,
            value.useDefaultMuteStories, value.muteStories, value.storySoundId, value.showStoryPoster,
            value.disablePinnedMessageNotifications, value.disableMentionNotifications);
    }

    /** Aplica el parche sobre lo que Telegram acaba de decir, clave por clave y sin tocar lo demás. */
    static TdApi.ScopeNotificationSettings merge(TdApi.ScopeNotificationSettings current, JSONObject patch, JSONArray ids) throws Exception {
        if (current == null || patch == null || patch.length() == 0) throw new IllegalArgumentException("No hay ningún ajuste que cambiar.");
        JSONArray names = patch.names();
        for (int i = 0; i < names.length(); i++) {
            String key = names.getString(i);
            // Rechazar en vez de ignorar: una clave mal escrita no puede volverse un cambio silencioso.
            if (!known(key)) throw new IllegalArgumentException("Ese ajuste no corresponde a ninguno de Telegram.");
        }
        TdApi.ScopeNotificationSettings next = copy(current);
        if (patch.has("muted") || patch.has("muteFor")) next.muteFor = muteFor(patch);
        if (patch.has("sound")) next.soundId = sound(patch.opt("sound"), ids, "sonido de los mensajes");
        if (patch.has("storySound")) next.storySoundId = sound(patch.opt("storySound"), ids, "sonido de las historias");
        if (patch.has("preview")) next.showPreview = flag(patch, "preview");
        if (patch.has("muteStories")) next.muteStories = flag(patch, "muteStories");
        if (patch.has("storyPoster")) next.showStoryPoster = flag(patch, "storyPoster");
        if (patch.has("quietPinned")) next.disablePinnedMessageNotifications = flag(patch, "quietPinned");
        if (patch.has("quietMentions")) next.disableMentionNotifications = flag(patch, "quietMentions");
        return next;
    }

    /** El mismo contrato que el silencio de un chat: estado y duración no pueden contradecirse. */
    static int muteFor(JSONObject patch) {
        Object raw = patch.opt("muteFor");
        Object state = patch.opt("muted");
        if (raw == null) return Boolean.TRUE.equals(state) ? MAX_MUTE : 0;
        if (!(raw instanceof Integer) && !(raw instanceof Long)) throw new IllegalArgumentException("La duración del silencio no es válida.");
        long seconds = ((Number) raw).longValue();
        if (seconds < 0 || seconds > MAX_MUTE) throw new IllegalArgumentException("La duración del silencio no es válida.");
        if (state != null && Boolean.TRUE.equals(state) != (seconds > 0)) throw new IllegalArgumentException("El silencio y su duración no coinciden.");
        return (int) seconds;
    }

    static boolean flag(JSONObject patch, String key) throws Exception {
        // Sin nombres de campo en el texto: la traducción no se duplica en los dos lados del puente.
        if (!(patch.opt(key) instanceof Boolean)) throw new IllegalArgumentException("Alguno de los ajustes de notificación solo admite un sí o un no.");
        return patch.getBoolean(key);
    }

    /** Un sonido nuevo tiene que ser -1, 0 o uno que Telegram confirmó que existe en esta cuenta. */
    static long sound(Object value, JSONArray ids, String what) throws Exception {
        if (value == null) throw new IllegalArgumentException("Falta el " + what + ".");
        String id = value.toString();
        if (!id.matches("-?[0-9]{1,19}")) throw new IllegalArgumentException("El identificador del " + what + " no es válido.");
        long parsed = Long.parseLong(id);
        if (parsed == DEFAULT_SOUND || parsed == SILENT) return parsed;
        if (parsed > 0 && contains(ids, id)) return parsed;
        throw new IllegalArgumentException("Ese sonido no está entre los que Telegram guarda en esta cuenta.");
    }

    static boolean contains(JSONArray ids, String value) throws Exception {
        for (int i = 0; i < ids.length(); i++) if (ids.getString(i).equals(value)) return true;
        return false;
    }

    static String soundLabel(String id) {
        if (id.equals("-1")) return "el sonido de la aplicación";
        if (id.equals("0")) return "sin sonido";
        return "un sonido guardado en Telegram";
    }

    /** El título lo puso Telegram en su lista; sin ella se describe el id, nunca se inventa un nombre. */
    static String soundName(long id, JSONArray sounds) throws Exception {
        String text = Long.toString(id);
        for (int i = 0; i < sounds.length(); i++) {
            String title = sounds.getJSONObject(i).optString("title", "");
            if (text.equals(sounds.getJSONObject(i).optString("id")) && !title.isEmpty()) return "«" + title + "»";
        }
        return soundLabel(text);
    }

    private static void add(JSONArray list, String text) throws Exception {
        if (text != null && !text.isEmpty()) list.put(text);
    }

    /** Qué va a cambiar, escrito con los valores de Telegram: el diálogo no puede prometer otra cosa. */
    static JSONArray changes(TdApi.ScopeNotificationSettings before, TdApi.ScopeNotificationSettings after) throws Exception {
        return changes(before, after, new JSONArray());
    }

    static JSONArray changes(TdApi.ScopeNotificationSettings before, TdApi.ScopeNotificationSettings after, JSONArray sounds) throws Exception {
        JSONArray list = new JSONArray();
        if (before.muteFor != after.muteFor) {
            add(list, before.muteFor > 0 && after.muteFor > 0
                ? "silencio: " + span(before.muteFor) + " → " + span(after.muteFor)
                : after.muteFor > 0 ? "silencio: " + span(after.muteFor) : "sin silencio");
        }
        if (before.soundId != after.soundId) add(list, "sonido: " + soundName(after.soundId, sounds));
        if (before.storySoundId != after.storySoundId) add(list, "sonido de historias: " + soundName(after.storySoundId, sounds));
        if (before.showPreview != after.showPreview) add(list, after.showPreview ? "mostrar el contenido en el aviso" : "ocultar el contenido en el aviso");
        if (before.muteStories != after.muteStories) add(list, after.muteStories ? "historias silenciadas" : "historias con aviso");
        if (before.showStoryPoster != after.showStoryPoster) add(list, after.showStoryPoster ? "mostrar quién publica la historia" : "ocultar quién publica la historia");
        if (before.disablePinnedMessageNotifications != after.disablePinnedMessageNotifications) {
            add(list, after.disablePinnedMessageNotifications ? "los mensajes fijados avisarán como cualquiera" : "los mensajes fijados volverán a avisar aparte");
        }
        if (before.disableMentionNotifications != after.disableMentionNotifications) {
            add(list, after.disableMentionNotifications ? "las menciones avisarán como cualquier mensaje" : "las menciones volverán a destacar");
        }
        return list;
    }

    /** Bandas de silencio legibles, ancladas a lo que Telegram devuelve (segundos restantes). */
    static String span(int seconds) {
        if (seconds <= 0) return "sin silencio";
        if (seconds >= MAX_MUTE) return "indefinido";
        if (seconds < 3_600) return seconds < 60 ? "unos segundos" : Math.max(1, seconds / 60) + " min";
        if (seconds < 86_400) return hours(seconds / 3_600);
        if (seconds < 2_592_000) return days(seconds / 86_400);
        return months(seconds / 2_592_000);
    }

    static String hours(int value) {
        int amount = Math.max(1, value);
        return amount == 1 ? "1 h" : amount + " h";
    }

    static String days(int value) {
        int amount = Math.max(1, value);
        return amount == 1 ? "1 día" : amount + " días";
    }

    static String months(int value) {
        int amount = Math.max(1, value);
        return amount == 1 ? "1 mes" : amount + " meses";
    }

    /** El detalle que el diálogo añade cuando el ajuste propio de historias no va a aplicarse. */
    static String storyCaveat(TdApi.ScopeNotificationSettings after) {
        return after.useDefaultMuteStories
            ? "Telegram decide las historias por sus propios criterios: el ajuste de historias no se aplicará mientras lo mantenga así."
            : "";
    }

    static boolean sameAsRead(TdApi.ScopeNotificationSettings a, TdApi.ScopeNotificationSettings b) {
        return a == b || (a != null && b != null
            && a.muteFor == b.muteFor && a.soundId == b.soundId && a.showPreview == b.showPreview
            && a.useDefaultMuteStories == b.useDefaultMuteStories && a.muteStories == b.muteStories
            && a.storySoundId == b.storySoundId && a.showStoryPoster == b.showStoryPoster
            && a.disablePinnedMessageNotifications == b.disablePinnedMessageNotifications
            && a.disableMentionNotifications == b.disableMentionNotifications);
    }

    private ScopeSettings() {
    }
}
