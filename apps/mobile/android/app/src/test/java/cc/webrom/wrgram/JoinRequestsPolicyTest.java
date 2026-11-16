package cc.webrom.wrgram;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class JoinRequestsPolicyTest {

    private static TdApi.ChatJoinRequest request(long userId, int date, String bio) {
        return new TdApi.ChatJoinRequest(userId, date, bio);
    }

    private static JSONArray rows(long firstUserId, int count, int date) throws Exception {
        JSONArray values = new JSONArray();
        for (int i = 0; i < count; i++) values.put(JoinRequests.row(request(firstUserId + i, date - i, "")));
        return values;
    }

    @Test public void unknownPendingCountIsAlwaysZero() throws Exception {
        assertEquals(0, JoinRequests.count(null));
        TdApi.Chat chat = new TdApi.Chat();
        assertEquals(0, JoinRequests.count(chat));
        chat.pendingJoinRequests = new TdApi.ChatJoinRequestsInfo(-5, new long[0]);
        assertEquals("un total negativo no infla el aviso", 0, JoinRequests.count(chat));
        chat.pendingJoinRequests = new TdApi.ChatJoinRequestsInfo(3, new long[]{7L});
        assertEquals(3, JoinRequests.count(chat));
    }

    @Test public void rowKeepsTheIdentifierAsTextAndNeverInventsAName() throws Exception {
        assertNull(JoinRequests.row(null));
        assertNull("sin identificador no hay fila que aprobar", JoinRequests.row(request(0, 1000, "hola")));
        JSONObject row = JoinRequests.row(request(9007199254740993L, 1700000000, "Diseñadora de producto"));
        assertEquals("9007199254740993", row.getString("userId"));
        assertEquals(1700000000, row.getInt("date"));
        assertEquals("Diseñadora de producto", row.getString("bio"));
        assertFalse("el nombre lo resuelve el puente, nunca esta clase", row.has("name"));
        assertEquals(0, JoinRequests.row(request(5, -9, null)).getInt("date"));
        assertEquals("", JoinRequests.row(request(5, 1, null)).getString("bio"));
    }

    @Test public void longBioIsCutButNeverDuplicated() throws Exception {
        StringBuilder text = new StringBuilder();
        for (int i = 0; i < 400; i++) text.append('a');
        String bio = JoinRequests.row(request(5, 1, text.toString())).getString("bio");
        assertEquals(141, bio.length());
        assertTrue(bio.endsWith("…"));
    }

    @Test public void aShortPageHasNoCursorAndAFullPagePointsToItsLastRequest() throws Exception {
        JSONObject empty = JoinRequests.page(new JSONArray(), 0);
        assertEquals(0, empty.getInt("total"));
        assertFalse(empty.getBoolean("next"));
        assertFalse(empty.has("cursor"));

        JSONObject partial = JoinRequests.page(rows(100, JoinRequests.PAGE - 1, 2000), 7);
        assertFalse("una página incompleta significa que ya no hay más", partial.getBoolean("next"));
        assertFalse(partial.has("cursor"));

        JSONObject full = JoinRequests.page(rows(100, JoinRequests.PAGE, 2000), 40);
        assertTrue(full.getBoolean("next"));
        assertEquals("un total negativo no se muestra", 40, full.getInt("total"));
        assertEquals(JoinRequests.PAGE, full.getJSONArray("requests").length());
        assertEquals(JoinRequests.token(100 + JoinRequests.PAGE - 1, 2000 - (JoinRequests.PAGE - 1)), full.getString("cursor"));
    }

    @Test public void pageClampsAnApproximateTotalFromTelegram() throws Exception {
        JSONObject data = JoinRequests.page(rows(1, 3, 10), -4);
        assertEquals(0, data.getInt("total"));
        assertFalse(data.getBoolean("next"));
        JSONObject missing = JoinRequests.page(null, 2);
        assertEquals(0, missing.getJSONArray("requests").length());
        assertFalse(missing.getBoolean("next"));
    }

    @Test public void cursorRoundTripsWithoutLosingPrecision() throws Exception {
        assertNull(JoinRequests.offset(null));
        assertNull("vacío significa empezar de nuevo", JoinRequests.offset(""));
        TdApi.ChatJoinRequest offset = JoinRequests.offset(JoinRequests.token(9007199254740993L, 1700000000));
        assertEquals(9007199254740993L, offset.userId);
        assertEquals(1700000000, offset.date);
    }

    @Test public void malformedCursorsAreRejectedInsteadOfGuessing() throws Exception {
        List<String> broken = new ArrayList<>();
        broken.add("9007199254740993");
        broken.add(":1700000000");
        broken.add("9007199254740993:");
        broken.add("0:1700000000");
        broken.add("9007199254740993:0");
        broken.add("-1:1700000000");
        broken.add("1:2:3");
        broken.add("abc:1700000000");
        broken.add("9007199254740993:1700000000x");
        for (String value : broken) {
            try {
                JoinRequests.offset(value);
                fail("el marcador '" + value + "' no debería aceptarse");
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains("marcador"));
            }
        }
    }
}
