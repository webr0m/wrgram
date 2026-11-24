package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.function.LongFunction;

/**
 * Las estadísticas de una comunidad convertidas al contrato que comparten Android y Windows (ronda CA).
 * <para>
 * TDLib contesta una sola clase abstracta —`ChatStatistics`— con dos variantes, y WTelegramClient dos métodos
 * distintos (`stats.getBroadcastStats` y `stats.getMegagroupStats`). Las dos capas dicen cosas distintas con nombres
 * distintos, así que aquí se aplana todo a un mismo JSON: `kind`, el periodo, una lista de fichas `{id, value,
 * previous}` y, solo en los grupos, la tabla de los que más escriben. Las etiquetas en español no viven en ninguna de
 * las dos capas: las pone la pantalla a partir del `id`, así que un número que Windows llame `viewers` no puede
 * aparecer en Android bautizado de otra manera.
 * </para>
 * <para>
 * Dos reglas de honestidad, y las dos por escrito. La primera: una ficha cuyo valor no sea un número acabado se
 * <b>omite</b> en vez de mandarse a cero —Telegram contesta NaN cuando no tiene el dato, y un cero pintado como dato
 * es una afirmación falsa—. La segunda: `previous` solo viaja si también es un número acabado, porque la pantalla
 * calcula con él el crecimiento; sin él se muestra la cifra sola, que es lo que la biblioteca sabe.
 * </para>
 */
public final class GroupChatStats {
    public static final String NOT_A_COMMUNITY = "Las estadísticas solo existen en supergrupos y canales.";
    public static final String NO_RIGHT = "Telegram no concede a esta cuenta el permiso para ver las estadísticas de la comunidad.";
    public static final String CHANGED = "La cuenta cambió. Vuelve a abrir la conversación.";
    public static final String BROKEN = "No se pudieron preparar las estadísticas.";

    private GroupChatStats() {}

    /**
     * TDLib no conserva el nombre del rechazo de Telegram: para esta petición la respuesta llega como un 403 que
     * `TdSession.safeError` (`TdSession.java:284`) vierte en su frase genérica con el número. Aquí solo puede
     * fallar el permiso de estadísticas, así que ese 403 se traduce; cualquier otro texto viaja tal cual, sin
     * inventarse una causa para un código que no se le ha visto.
     */
    public static String explain(String error) {
        if (error == null || error.isEmpty()) return BROKEN;
        if (error.contains("(403)")) return NO_RIGHT;
        return error;
    }

    public static JSONObject dto(TdApi.ChatStatistics value, LongFunction<String> names) throws Exception {
        JSONObject out = new JSONObject();
        JSONArray cards = new JSONArray();
        JSONArray top = new JSONArray();
        if (value instanceof TdApi.ChatStatisticsChannel) {
            TdApi.ChatStatisticsChannel channel = (TdApi.ChatStatisticsChannel) value;
            out.put("kind", "channel");
            putRange(out, channel.period);
            put(cards, "members", channel.memberCount);
            put(cards, "viewsPerPost", channel.meanMessageViewCount);
            put(cards, "sharesPerPost", channel.meanMessageShareCount);
            put(cards, "reactionsPerPost", channel.meanMessageReactionCount);
            put(cards, "viewsPerStory", channel.meanStoryViewCount);
            put(cards, "sharesPerStory", channel.meanStoryShareCount);
            put(cards, "reactionsPerStory", channel.meanStoryReactionCount);
            if (Double.isFinite(channel.enabledNotificationsPercentage))
                cards.put(new JSONObject().put("id", "notifications").put("value", channel.enabledNotificationsPercentage));
        } else if (value instanceof TdApi.ChatStatisticsSupergroup) {
            TdApi.ChatStatisticsSupergroup group = (TdApi.ChatStatisticsSupergroup) value;
            out.put("kind", "group");
            putRange(out, group.period);
            put(cards, "members", group.memberCount);
            put(cards, "messages", group.messageCount);
            put(cards, "viewers", group.viewerCount);
            put(cards, "senders", group.senderCount);
            if (group.topSenders != null) for (TdApi.ChatStatisticsMessageSenderInfo sender : group.topSenders) {
                if (sender == null) continue;
                String name = names.apply(sender.userId);
                top.put(new JSONObject().put("name", name == null ? "Usuario de Telegram" : name)
                        .put("messages", sender.sentMessageCount).put("avgChars", sender.averageCharacterCount));
            }
        } else return null;
        out.put("values", cards);
        out.put("top", top);
        return out;
    }

    private static void put(JSONArray cards, String id, TdApi.StatisticalValue value) throws Exception {
        if (value == null || !Double.isFinite(value.value)) return;
        JSONObject card = new JSONObject().put("id", id).put("value", value.value);
        if (Double.isFinite(value.previousValue)) card.put("previous", value.previousValue);
        cards.put(card);
    }

    /** `startDate` y `endDate` son `yyyymmdd`; con ceros no hay periodo que enseñar, y la pantalla lo omite. */
    private static void putRange(JSONObject out, TdApi.DateRange period) throws Exception {
        if (period == null) return;
        if (period.startDate <= 0 || period.endDate <= 0) return;
        out.put("from", day(period.startDate));
        out.put("to", day(period.endDate));
    }

    private static String day(int value) {
        return String.format(Locale.ROOT, "%04d-%02d-%02d", value / 10000, value / 100 % 100, value % 100);
    }
}
