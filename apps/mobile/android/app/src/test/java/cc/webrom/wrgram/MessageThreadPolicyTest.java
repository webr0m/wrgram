package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class MessageThreadPolicyTest {
    private static TdApi.Message message(int replies) {
        TdApi.MessageReplyInfo info = new TdApi.MessageReplyInfo();
        info.replyCount = replies;
        TdApi.MessageInteractionInfo interactions = new TdApi.MessageInteractionInfo();
        interactions.replyInfo = info;
        TdApi.Message value = new TdApi.Message();
        value.interactionInfo = interactions;
        return value;
    }

    @Test public void nothingIsOfferedWithoutReplyInformation() throws Exception {
        assertNull(MessageThread.badge(null));
        assertNull(MessageThread.badge(new TdApi.Message()));
        TdApi.Message empty = new TdApi.Message();
        empty.interactionInfo = new TdApi.MessageInteractionInfo();
        assertNull("Telegram solo envía replyInfo donde hay discusión.", MessageThread.badge(empty));
    }

    @Test public void aPostWithCommentsOffersTheThread() throws Exception {
        JSONObject data = MessageThread.badge(message(7));
        assertEquals(7, data.getInt("comments"));
        assertTrue(data.getBoolean("canOpen"));
    }

    @Test public void anEmptyThreadIsCountedButNeverClickable() throws Exception {
        JSONObject data = MessageThread.badge(message(0));
        assertEquals(0, data.getInt("comments"));
        assertFalse("Un contador a cero no puede abrir un botón.", data.has("canOpen"));
    }

    @Test public void negativeCountersAreClamped() throws Exception {
        assertEquals(0, MessageThread.badge(message(-4)).getInt("comments"));
    }

    @Test public void theDiscussionChatComesFromTelegramAndTravelsAsText() throws Exception {
        TdApi.MessageReplyInfo replies = new TdApi.MessageReplyInfo();
        replies.replyCount = 12;
        TdApi.MessageThreadInfo info = new TdApi.MessageThreadInfo(
                -1001234567890123456L, 9007199254740993L, replies, 3, new TdApi.Message[0], null);
        JSONObject data = MessageThread.summary(info);
        assertEquals("-1001234567890123456", data.getString("chatId"));
        assertEquals("9007199254740993", data.getString("threadId"));
        assertEquals(12, data.getInt("comments"));
        assertEquals(3, data.getInt("unread"));
    }

    @Test public void anIncompleteThreadIsRejected() throws Exception {
        assertNull(MessageThread.summary(null));
        JSONObject bare = MessageThread.summary(new TdApi.MessageThreadInfo(-1002L, 88L, null, -5, new TdApi.Message[0], null));
        assertEquals("-1002", bare.getString("chatId"));
        assertEquals(0, bare.getInt("comments"));
        assertEquals(0, bare.getInt("unread"));
        assertNull(MessageThread.summary(new TdApi.MessageThreadInfo(0L, 88L, null, 0, new TdApi.Message[0], null)));
        assertNull(MessageThread.summary(new TdApi.MessageThreadInfo(-1002L, 0L, null, 0, new TdApi.Message[0], null)));
    }

    @Test public void paginationStopsWhenThePageStopsMovingBack() {
        assertEquals(0L, MessageThread.cursor(null, 500L));
        assertEquals(0L, MessageThread.cursor(new TdApi.Message[0], 500L));
        TdApi.Message high = new TdApi.Message();
        high.id = 9007199254740995L;
        TdApi.Message low = new TdApi.Message();
        low.id = 9007199254740993L;
        assertEquals("el más antiguo manda, sin importar el orden", 9007199254740993L, MessageThread.cursor(new TdApi.Message[]{high, low}, high.id));
        assertEquals("una página que no retrocede es el final del hilo", 0L, MessageThread.cursor(new TdApi.Message[]{low}, low.id));
        assertEquals("los huecos de la página no detienen el cursor", 9007199254740993L, MessageThread.cursor(new TdApi.Message[]{null, low}, high.id));
    }
}
