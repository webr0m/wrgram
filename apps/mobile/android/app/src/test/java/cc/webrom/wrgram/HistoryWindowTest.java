package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class HistoryWindowTest {
    private static TdApi.Message message(long chat, long id, String text) {
        TdApi.Message message = new TdApi.Message(); message.chatId = chat; message.id = id;
        TdApi.MessageText content = new TdApi.MessageText(); content.text = new TdApi.FormattedText(text, new TdApi.TextEntity[0]); message.content = content; return message;
    }
    @Test public void localMessagesAreVisibleBeforeNetworkAndShortPagesAreNotEndOfHistory() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read read = window.begin(false);
        assertTrue(window.local(read, new TdApi.Message[]{message(10, 100, "cache")}));
        assertTrue(window.loaded); assertTrue(window.loading); assertEquals(1, window.size());
        window.remote(read, new TdApi.Message[]{message(10, 100, "server")}, true, 10);
        assertFalse(window.loading); assertFalse(window.end); assertFalse(window.stale); assertEquals("server", TdSession.text(window.find(100)));
    }
    @Test public void slowLocalReplyCannotOverwriteFasterRemoteReply() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read read = window.begin(false);
        window.remote(read, new TdApi.Message[]{message(10, 100, "fresh")}, true, 1);
        assertFalse(window.local(read, new TdApi.Message[]{message(10, 100, "stale")}));
        assertEquals("fresh", TdSession.text(window.find(100)));
    }
    @Test public void deletionDuringReadNeverResurrectsAndAccountsDoNotMixChatIds() {
        HistoryWindow window = new HistoryWindow(10); window.put(message(10, 100, "old"));
        HistoryWindow.Read read = window.begin(false); window.remove(100);
        window.remote(read, new TdApi.Message[]{message(10, 100, "deleted"), message(11, 101, "wrong chat")}, true, 1);
        assertEquals(0, window.size());
    }
    @Test public void editAndSendUpdatesBeatAnOlderPage() {
        HistoryWindow window = new HistoryWindow(10); window.put(message(10, 100, "before"));
        HistoryWindow.Read read = window.begin(false);
        TdApi.MessageText edited = (TdApi.MessageText) message(10, 100, "edited").content;
        window.content(100, edited); window.put(message(10, 101, "live"));
        window.remote(read, new TdApi.Message[]{message(10, 100, "old"), message(10, 101, "old live")}, true, 2);
        assertEquals("edited", TdSession.text(window.find(100))); assertEquals("live", TdSession.text(window.find(101)));
    }
    @Test public void timedOutOrCanceledReadIsIgnoredAndNextReadCanStart() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read old = window.begin(false);
        window.failed(old, "timeout"); assertFalse(window.loading);
        assertFalse(window.remote(old, new TdApi.Message[]{message(10, 100, "late")}, true, 1));
        HistoryWindow.Read next = window.begin(false); window.remote(next, new TdApi.Message[]{message(10, 101, "new")}, true, 2);
        assertEquals(1, window.size()); assertNotNull(window.find(101)); assertEquals("", window.error);
    }
    @Test public void openingAnotherReadInvalidatesTheOldGeneration() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read old = window.begin(false); window.invalidate();
        HistoryWindow.Read current = window.begin(false);
        assertFalse(window.local(old, new TdApi.Message[]{message(10, 1, "old")}));
        assertTrue(window.remote(current, new TdApi.Message[]{message(10, 2, "current")}, true, 1));
    }
    @Test public void emptyDisconnectedPageDoesNotPermanentlyHideEarlierHistory() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read read = window.begin(false);
        window.remote(read, new TdApi.Message[0], false, 1);
        assertFalse(window.end); assertTrue(window.stale); assertFalse(window.loading); assertFalse(window.error.isEmpty());
    }
    @Test public void emptyConnectedPageMarksEndButCachedMessagesRemainUsable() {
        HistoryWindow window = new HistoryWindow(10); window.put(message(10, 10, "visible"));
        window.remote(window.begin(true), new TdApi.Message[0], true, 1);
        assertTrue(window.end); assertEquals(1, window.size());
    }
    @Test public void pagingPastMemoryLimitKeepsOlderPagesAndDoesNotStopPagination() {
        HistoryWindow window = new HistoryWindow(10);
        for (int id = 301; id <= 600; id++) window.put(message(10, id, "fixture"));
        HistoryWindow.Read read = window.begin(true); TdApi.Message[] older = new TdApi.Message[40];
        for (int i = 0; i < older.length; i++) older[i] = message(10, 261 + i, "older");
        window.remote(read, older, true, 1);
        assertEquals(300, window.size()); assertEquals(261, window.snapshot().get(0).id); assertFalse(window.end);
        assertEquals(261, window.begin(true).cursor);
    }
    @Test public void liveUpdatesKeepBoundedMemoryAndDoNotMarkPendingAsConfirmed() {
        HistoryWindow window = new HistoryWindow(10);
        for (int id = 1; id <= 1000; id++) window.put(message(10, id, "fixture"));
        TdApi.Message pending = message(10, 1001, "pending"); pending.sendingState = new TdApi.MessageSendingStatePending(); window.put(pending);
        assertEquals(300, window.size()); assertEquals(1000, window.newestConfirmedId());
    }
    @Test public void noProgressPageProvidesRetryInsteadOfClaimingAllMessagesDownloaded() {
        HistoryWindow window = new HistoryWindow(10); window.put(message(10, 100, "one"));
        window.remote(window.begin(true), new TdApi.Message[]{message(10, 100, "one")}, true, 1);
        assertFalse(window.end); assertFalse(window.loading); assertFalse(window.error.isEmpty());
    }
    @Test public void liveMessagesDoNotCreateGapsInOlderWindowAndLatestCanBeRestored() {
        HistoryWindow window = new HistoryWindow(10);
        for (int id = 301; id <= 600; id++) window.put(message(10, id, "fixture"));
        window.remote(window.begin(true), new TdApi.Message[]{message(10, 300, "older")}, true, 1);
        assertFalse(window.latest);
        window.put(message(10, 700, "new live"));
        assertNull(window.find(700)); assertEquals(300, window.snapshot().get(0).id);
        window.remote(window.begin(false), new TdApi.Message[]{message(10, 700, "latest")}, true, 2);
        assertTrue(window.latest); assertEquals(1, window.size()); assertNotNull(window.find(700));
        assertEquals(700, window.begin(true).cursor);
    }
    @Test public void unreadAnchorSurvivesPagesUntilTheReadBoundaryReachesIt() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read read = window.begin(false);
        assertTrue(window.jump(read, new TdApi.Message[]{message(10, 101, "read"), message(10, 105, "new")}, true, 1, false, 105));
        assertEquals(105, window.anchor);
        window.clearAnchor(103); assertEquals(105, window.anchor);
        window.clearAnchor(105); assertEquals(0, window.anchor);
    }
    @Test public void aRecentHistoricalJumpIsNotReusableAsTheLatestWindow() {
        HistoryWindow window = new HistoryWindow(10);
        window.jump(window.begin(false), new TdApi.Message[]{message(10, 105, "older")}, true, 100, false);
        assertFalse(window.canReuseLatest(101));
        window.remote(window.begin(false), new TdApi.Message[]{message(10, 230, "latest")}, true, 102);
        assertTrue(window.canReuseLatest(103));
        assertNull(window.find(105));
    }
    @Test public void newerPagesKeepTheFirstUnreadAndDoNotDeclareAKnownGapClosed() {
        HistoryWindow window = new HistoryWindow(10);
        TdApi.Message first = message(10, 105, "first unread");
        window.jump(window.begin(false), new TdApi.Message[]{first}, true, 1, false, first.id);
        window.newer(window.beginNewer(), new TdApi.Message[]{first}, true, 2, false, true);
        assertFalse(window.latest);
        window.newer(window.beginNewer(), new TdApi.Message[]{message(10, 140, "later")}, true, 3, true, false);
        assertTrue(window.latest);
        assertEquals(first.id, window.anchor);
        assertNotNull(window.find(first.id));
    }
    @Test public void unreadAnchorIsDroppedWhenThePageDoesNotContainIt() {
        HistoryWindow window = new HistoryWindow(10); HistoryWindow.Read read = window.begin(false);
        assertTrue(window.jump(read, new TdApi.Message[]{message(10, 101, "read")}, true, 1, true, 105));
        assertEquals(0, window.anchor);
    }
}
