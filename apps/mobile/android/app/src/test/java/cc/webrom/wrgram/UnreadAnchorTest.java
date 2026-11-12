package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class UnreadAnchorTest {
    private static TdApi.Message message(long id, boolean outgoing) {
        TdApi.Message message = new TdApi.Message();
        message.chatId = 10;
        message.id = id;
        message.isOutgoing = outgoing;
        TdApi.MessageText content = new TdApi.MessageText();
        content.text = new TdApi.FormattedText("fixture", new TdApi.TextEntity[0]);
        message.content = content;
        return message;
    }

    @Test public void firstUnreadMatchesForNewestFirstPages() {
        TdApi.Message[] page = {message(106, false), message(105, true), message(104, false), message(103, false), message(102, false)};
        assertEquals(104, TdSession.firstUnreadFromEnd(page, 2));
    }

    @Test public void firstUnreadMatchesForOldestFirstPages() {
        TdApi.Message[] page = {message(102, false), message(103, false), message(104, false), message(105, true), message(106, false)};
        assertEquals(104, TdSession.firstUnreadFromEnd(page, 2));
    }

    @Test public void firstUnreadCountsOnlyIncomingMessagesAndFallsBackToTheOldest() {
        TdApi.Message[] incoming = {message(107, false), message(108, true), message(109, false)};
        assertEquals(107, TdSession.firstUnreadFromEnd(incoming, 2));
        assertEquals(109, TdSession.firstUnreadFromEnd(incoming, 1));
        assertEquals(107, TdSession.firstUnreadFromEnd(incoming, 9));
        TdApi.Message[] outgoingOnly = {message(201, true), message(200, true)};
        assertEquals(200, TdSession.firstUnreadFromEnd(outgoingOnly, 1));
        assertEquals(0, TdSession.firstUnreadFromEnd(new TdApi.Message[0], 3));
    }
}
