package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class ForwardOriginPolicyTest {
    private static final ForwardOrigin.Names NONE = new ForwardOrigin.Names() {
        @Override public String user(long id) { return null; }
        @Override public String chat(long id) { return null; }
    };

    private static TdApi.MessageForwardInfo info(TdApi.MessageOrigin origin, int date) {
        TdApi.MessageForwardInfo value = new TdApi.MessageForwardInfo();
        value.origin = origin;
        value.date = date;
        return value;
    }

    @Test public void knownUserIsNamedAndStaysWithoutAnyJumpTarget() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginUser(42L), 1000), new ForwardOrigin.Names() {
            @Override public String user(long id) { return id == 42L ? "Ana Pérez" : null; }
            @Override public String chat(long id) { return "no debería consultarse"; }
        });
        assertEquals("user", data.getString("kind"));
        assertEquals("Ana Pérez", data.getString("name"));
        assertEquals("42", data.getString("userId"));
        assertFalse(data.has("chatId"));
        assertFalse(data.has("messageId"));
        assertEquals(1000, data.getInt("date"));
    }

    @Test public void unknownUserKeepsAGenericLabelWithoutInventingAnIdentity() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginUser(42L), 0), NONE);
        assertEquals("un usuario", data.getString("name"));
        assertEquals("42", data.getString("userId"));
        assertFalse(data.has("date"));
    }

    @Test public void zeroUserIdProjectsNothing() throws Exception {
        assertNull(ForwardOrigin.project(info(new TdApi.MessageOriginUser(0L), 1000), NONE));
    }

    @Test public void hiddenAuthorsShowOnlyTheNameTelegramDecidedToReveal() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginHiddenUser("Ana R."), 5), NONE);
        assertEquals("hidden", data.getString("kind"));
        assertEquals("Ana R.", data.getString("name"));
        assertFalse(data.has("userId"));
        assertFalse(data.has("chatId"));
        assertEquals("un usuario anónimo", ForwardOrigin.project(info(new TdApi.MessageOriginHiddenUser("   "), 5), NONE).getString("name"));
    }

    @Test public void chatOriginIsNavigableToTheChatButNeverToAnInventedMessage() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginChat(9007199254740993L, " firma "), 7), new ForwardOrigin.Names() {
            @Override public String user(long id) { return null; }
            @Override public String chat(long id) { return "Grupo de soporte"; }
        });
        assertEquals("chat", data.getString("kind"));
        assertEquals("Grupo de soporte", data.getString("name"));
        assertEquals("9007199254740993", data.getString("chatId"));
        assertFalse(data.has("messageId"));
        assertFalse(data.has("userId"));
        assertEquals("firma", data.getString("signature"));
    }

    @Test public void channelOriginCarriesTheExactPostSoTheOriginalCanBeOpened() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginChannel(9007199254740993L, 9007199254740111L, null), 120), new ForwardOrigin.Names() {
            @Override public String user(long id) { return null; }
            @Override public String chat(long id) { return null; }
        });
        assertEquals("channel", data.getString("kind"));
        assertEquals("un canal", data.getString("name"));
        assertEquals("9007199254740993", data.getString("chatId"));
        assertEquals("9007199254740111", data.getString("messageId"));
        assertFalse(data.has("signature"));
        assertEquals(120, data.getInt("date"));
    }

    @Test public void channelWithoutAMessageIdStillOpensTheChannel() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginChannel(8L, 0L, ""), 1), new ForwardOrigin.Names() {
            @Override public String user(long id) { return null; }
            @Override public String chat(long id) { return "Noticias"; }
        });
        assertEquals("8", data.getString("chatId"));
        assertFalse(data.has("messageId"));
        assertFalse(data.has("signature"));
    }

    @Test public void chatWithZeroIdKeepsTheGenericLabelAndNoTarget() throws Exception {
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginChat(0L, null), 1), NONE);
        assertEquals("una conversación", data.getString("name"));
        assertFalse(data.has("chatId"));
    }

    @Test public void namesAndSignaturesAreTrimmedAndBounded() throws Exception {
        StringBuilder longName = new StringBuilder(), longSignature = new StringBuilder();
        for (int i = 0; i < 300; i++) { longName.append('n'); longSignature.append('s'); }
        JSONObject data = ForwardOrigin.project(info(new TdApi.MessageOriginChannel(3L, 4L, longSignature.toString()), 1), new ForwardOrigin.Names() {
            @Override public String user(long id) { return null; }
            @Override public String chat(long id) { return "  " + longName + "  "; }
        });
        assertEquals(120, data.getString("name").length());
        assertEquals(80, data.getString("signature").length());
    }

    @Test public void missingForwardDataProjectsNothing() throws Exception {
        assertNull(ForwardOrigin.project(null, NONE));
        assertNull(ForwardOrigin.project(info(null, 1), NONE));
        assertNull(ForwardOrigin.project(info(new TdApi.MessageOriginUser(5L), 1), null));
    }
}
