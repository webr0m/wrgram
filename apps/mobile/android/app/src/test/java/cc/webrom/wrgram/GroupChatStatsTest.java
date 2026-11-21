package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.util.function.LongFunction;

/**
 * El contrato que las dos capas tienen que decir igual (ronda CA). Se prueba aquí y no en la pantalla porque lo que
 * se decide es qué se manda: las fichas cuyo valor Telegram no contesta se omiten, el periodo se escribe como fecha y
 * los nombres de los que más escriben salen por la misma regla que por la que sale cualquier otro nombre de la app.
 */
public class GroupChatStatsTest {
    private static final LongFunction<String> NO_NAMES = id -> null;

    private static TdApi.ChatStatisticsChannel channel() {
        TdApi.ChatStatisticsChannel value = new TdApi.ChatStatisticsChannel();
        value.period = new TdApi.DateRange(20261020, 20261119);
        value.memberCount = new TdApi.StatisticalValue(1200, 1000, 20);
        value.meanMessageViewCount = new TdApi.StatisticalValue(430, 400, 7.5);
        value.meanMessageShareCount = new TdApi.StatisticalValue(12, 0, 0);
        value.meanMessageReactionCount = new TdApi.StatisticalValue(30, 25, 20);
        value.meanStoryViewCount = new TdApi.StatisticalValue(Double.NaN, Double.NaN, Double.NaN);
        value.meanStoryShareCount = new TdApi.StatisticalValue(2, Double.NaN, Double.NaN);
        value.meanStoryReactionCount = null;
        value.enabledNotificationsPercentage = 64.5;
        return value;
    }

    private static JSONObject card(JSONObject value, String id) {
        try {
            JSONArray cards = value.getJSONArray("values");
            for (int index = 0; index < cards.length(); index++)
                if (id.equals(cards.getJSONObject(index).getString("id"))) return cards.getJSONObject(index);
            return null;
        } catch (Exception impossible) {
            throw new AssertionError(impossible);
        }
    }

    @Test
    public void theChannelSpeaksTheSharedContract() throws Exception {
        JSONObject value = GroupChatStats.dto(channel(), NO_NAMES);
        assertEquals("channel", value.getString("kind"));
        assertEquals("2026-10-20", value.getString("from"));
        assertEquals("2026-11-19", value.getString("to"));
        assertEquals(1200, card(value, "members").getDouble("value"), 0.001);
        assertEquals(1000, card(value, "members").getDouble("previous"), 0.001);
        assertEquals(64.5, card(value, "notifications").getDouble("value"), 0.001);
        assertFalse("Telegram no contesta el periodo anterior de las notificaciones",
                card(value, "notifications").has("previous"));
    }

    @Test
    public void aNumberTelegramDidNotAnswerIsOmittedInsteadOfZero() throws Exception {
        JSONObject value = GroupChatStats.dto(channel(), NO_NAMES);
        assertNull("sin valor no hay ficha", card(value, "viewsPerStory"));
        assertNull("sin periodo anterior no se promete crecimiento", card(value, "sharesPerStory").opt("previous"));
        assertNull("un campo vacío de TDLib tampoco inventa la ficha", card(value, "reactionsPerStory"));
        assertEquals(430, card(value, "viewsPerPost").getDouble("value"), 0.001);
        JSONArray cards = value.getJSONArray("values");
        for (int index = 0; index < cards.length(); index++) assertTrue(cards.getJSONObject(index).has("value"));
    }

    @Test
    public void theGroupAddsWhoWritesTheMost() throws Exception {
        TdApi.ChatStatisticsSupergroup value = new TdApi.ChatStatisticsSupergroup();
        value.period = new TdApi.DateRange(0, 0);
        value.memberCount = new TdApi.StatisticalValue(80, 80, 0);
        value.messageCount = new TdApi.StatisticalValue(1400, 1200, 16.6);
        value.viewerCount = new TdApi.StatisticalValue(55, 50, 10);
        value.senderCount = new TdApi.StatisticalValue(9, 6, 50);
        value.topSenders = new TdApi.ChatStatisticsMessageSenderInfo[]{
                new TdApi.ChatStatisticsMessageSenderInfo(7, 40, 120),
                new TdApi.ChatStatisticsMessageSenderInfo(8, 12, 60),
        };
        JSONObject dto = GroupChatStats.dto(value, id -> id == 7 ? "Ada Lovelace" : null);
        assertEquals("group", dto.getString("kind"));
        assertFalse("yyyymmdd con ceros no es un periodo", dto.has("from"));
        assertEquals(9, card(dto, "senders").getDouble("value"), 0.001);
        JSONArray top = dto.getJSONArray("top");
        assertEquals(2, top.length());
        assertEquals("Ada Lovelace", top.getJSONObject(0).getString("name"));
        assertEquals(40, top.getJSONObject(0).getInt("messages"));
        assertEquals(120, top.getJSONObject(0).getInt("avgChars"));
        assertEquals("Usuario de Telegram", top.getJSONObject(1).getString("name"));
    }

    @Test
    public void theRefusalKeepsItsOwnWords() {
        assertEquals(GroupChatStats.NO_RIGHT, GroupChatStats.explain("Telegram no pudo completar la operación (403). Inténtalo más tarde."));
        assertEquals("Telegram solicita una pausa. Espera antes de volver a intentarlo; no se reintentará automáticamente.",
                GroupChatStats.explain("Telegram solicita una pausa. Espera antes de volver a intentarlo; no se reintentará automáticamente."));
        assertEquals(GroupChatStats.BROKEN, GroupChatStats.explain(""));
    }
}
