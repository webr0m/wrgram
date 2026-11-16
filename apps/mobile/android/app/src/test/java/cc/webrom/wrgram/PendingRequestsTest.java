package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.junit.Test;

public class PendingRequestsTest {
    @Test public void releasedIdentifierIsAcceptedAgainAndDuplicatesAreRefusedWhileOpen() {
        PendingRequests pending = new PendingRequests();
        assertTrue(pending.admit("7", 1_000));
        assertEquals(1, pending.size());
        assertTrue(pending.contains("7"));
        assertFalse("the same id must not open twice", pending.admit("7", 1_500));
        assertEquals(1, pending.size());
        pending.release("7");
        assertFalse(pending.contains("7"));
        assertTrue(pending.admit("7", 2_000));
    }

    @Test public void capIsEnforcedAndFreedByRelease() {
        PendingRequests pending = new PendingRequests();
        for (int i = 0; i < PendingRequests.CAP; i++) assertTrue(pending.admit("id" + i, 0));
        assertFalse(pending.admit("extra", 0));
        pending.release("id3");
        assertTrue(pending.admit("extra", 0));
        assertEquals(PendingRequests.CAP, pending.size());
    }

    @Test public void abandonedEntryIsReclaimedAfterEveryDeadlineSoTheBridgeNeverLocksUp() {
        PendingRequests pending = new PendingRequests();
        pending.admit("orphan", 0);
        for (int i = 0; i < PendingRequests.CAP - 1; i++) assertTrue(pending.admit("id" + i, 0));
        assertEquals(PendingRequests.CAP, pending.size());
        assertFalse("the orphan occupies a slot until it ages out", pending.admit("new", 0));
        assertTrue(pending.admit("new", PendingRequests.STALE_MS + 1));
        assertFalse(pending.contains("orphan"));
    }

    @Test public void staleWindowSitsAboveTheLongestDeadlineTheInterfaceUses() {
        assertTrue(PendingRequests.STALE_MS > 120_000L);
    }

    @Test public void liveEntryIsKeptInsideTheStaleWindow() {
        PendingRequests pending = new PendingRequests();
        pending.admit("live", 0);
        pending.admit("fresh", PendingRequests.STALE_MS);
        assertTrue(pending.contains("live"));
        assertTrue(pending.contains("fresh"));
        assertEquals(2, pending.size());
    }

    @Test public void clearingForgetsEverythingAndOpensTheIdsAgain() {
        PendingRequests pending = new PendingRequests();
        pending.admit("a", 0);
        pending.admit("b", 0);
        pending.clear();
        assertEquals(0, pending.size());
        assertFalse(pending.contains("a"));
        assertTrue(pending.admit("a", 10));
    }
}
