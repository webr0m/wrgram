package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.junit.Test;

public class TdSessionTest {
    @Test public void unreadPageOffsetIncludesTheNewestUnreadMessage() {
        // TDLib counts the boundary message itself, so one extra message is required.
        assertEquals(-2, TdSession.unreadOffset(1, true));
        assertEquals(-13, TdSession.unreadOffset(12, true));
        assertEquals(-17, TdSession.unreadOffset(16, true));
    }
    @Test public void unreadPageOffsetStaysInsideTdlibBoundsAndPeek() {
        assertEquals(-99, TdSession.unreadOffset(98, true));
        assertEquals(-99, TdSession.unreadOffset(99, true));
        assertEquals(-99, TdSession.unreadOffset(500, true));
        assertEquals(0, TdSession.unreadOffset(5, false));
    }
}
