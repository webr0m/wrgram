package cc.webrom.wrgram;

import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/**
 * Bookkeeping for the requests the WebView has in flight. An identifier is released only when its
 * reply is posted, so a handler that abandons an answer must not be able to wedge the bridge:
 * entries older than {@link #STALE_MS} are reclaimed before admitting a new one. That window sits
 * above every deadline the interface uses, so a live request is never reclaimed.
 */
final class PendingRequests {
    static final int CAP = 32;
    static final long STALE_MS = 600_000L;

    private final Map<String, Long> openedAt = new HashMap<>();

    int size() { return openedAt.size(); }

    boolean contains(String id) { return openedAt.containsKey(id); }

    /** Reserves `id` and returns false when it is already open or the bookkeeping is full. */
    boolean admit(String id, long now) {
        expire(now);
        if (openedAt.containsKey(id) || openedAt.size() >= CAP) return false;
        openedAt.put(id, now);
        return true;
    }

    void release(String id) { openedAt.remove(id); }

    void clear() { openedAt.clear(); }

    private void expire(long now) {
        Iterator<Map.Entry<String, Long>> entries = openedAt.entrySet().iterator();
        while (entries.hasNext()) if (now - entries.next().getValue() > STALE_MS) entries.remove();
    }
}
