package cc.webrom.wrgram;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.drinkless.tdlib.TdApi;

/** Per-chat bounded cache: late reads cannot resurrect edits/deletions received in flight. */
final class HistoryWindow {
    static final int LIMIT = 300;
    final long chatId;
    private final TreeMap<Long, TdApi.Message> items = new TreeMap<>();
    private final Map<Long, Long> changed = new HashMap<>();
    private long revision, serial;
    boolean loading, loaded, end, stale = true, remoteApplied;
    boolean latest = true, newerEnd = true;
    String error = "";
    long refreshedAt;
    /** Short-page retries already scheduled for a chat whose message database is still opening. */
    int coldRetries;
    boolean waitingRetry;
    /** First unread message to keep the divider in place while the window is open; 0 means none. */
    long anchor;

    static final class Read {
        final long serial, revision, cursor;
        final boolean older, newer;
        Read(long serial, long revision, long cursor, boolean older, boolean newer) {
            this.serial = serial; this.revision = revision; this.cursor = cursor; this.older = older; this.newer = newer;
        }
    }
    HistoryWindow(long chatId) { this.chatId = chatId; }
    Read begin(boolean older) {
        loading = true; waitingRetry = false; error = ""; remoteApplied = false;
        return new Read(++serial, revision, older && !items.isEmpty() ? items.firstKey() : 0, older, false);
    }
    Read beginNewer() {
        loading = true; waitingRetry = false; error = ""; remoteApplied = false;
        return new Read(++serial, revision, items.isEmpty() ? 0 : items.lastKey(), false, true);
    }
    boolean current(Read read) { return serial == read.serial; }
    boolean local(Read read, TdApi.Message[] page) {
        if (!current(read) || remoteApplied) return false;
        merge(read, page); if (page.length > 0) loaded = true; return true;
    }
    boolean remote(Read read, TdApi.Message[] page, boolean connected, long now) {
        if (!current(read)) return false;
        remoteApplied = true; loading = false; loaded = true; refreshedAt = now; stale = !connected;
        merge(read, page);
        // TDLib can return a short page from its DB. A short page is not proof of remote EOF.
        end = connected && page.length == 0;
        if (read.older && page.length > 0 && oldest(page) >= read.cursor) error = "Telegram no devolvió mensajes anteriores. Puedes volver a intentarlo.";
        if (!connected && page.length == 0) error = "Esperando red o sincronización. Puedes usar los mensajes ya cargados y reintentar.";
        changed.clear(); return true;
    }
    boolean failed(Read read, String reason) {
        if (!current(read)) return false;
        serial++; loading = false; error = reason; stale = true; changed.clear(); return true;
    }
    boolean jump(Read read, TdApi.Message[] page, boolean connected, long now, boolean atLatest) {
        return jump(read, page, connected, now, atLatest, 0);
    }
    boolean jump(Read read, TdApi.Message[] page, boolean connected, long now, boolean atLatest, long anchorId) {
        if (!current(read)) return false;
        items.clear(); changed.clear(); revision++;
        for (TdApi.Message message : page) if (message != null && message.chatId == chatId) items.put(message.id, message);
        loading = false; loaded = true; end = false; stale = !connected; latest = atLatest; newerEnd = atLatest; error = ""; refreshedAt = now;
        anchor = anchorId > 0 && items.containsKey(anchorId) ? anchorId : 0;
        return true;
    }
    void clearAnchor(long readBoundary) {
        if (anchor > 0 && readBoundary >= anchor) anchor = 0;
    }
    void resetAnchor() { anchor = 0; }
    boolean canReuseLatest(long now) {
        return loaded && !loading && !waitingRetry && latest && !stale && now - refreshedAt <= 20_000;
    }
    boolean newer(Read read, TdApi.Message[] page, boolean connected, long now, boolean reachedLatest, boolean knownNewer) {
        if (!current(read)) return false;
        remoteApplied = true; loading = false; loaded = true; refreshedAt = now; stale = !connected;
        int added = 0;
        for (TdApi.Message message : page) if (message != null && message.chatId == chatId && message.id > read.cursor && changed.getOrDefault(message.id, 0L) <= read.revision) { items.put(message.id, message); added++; }
        while (items.size() > LIMIT) items.pollFirstEntry();
        if (connected && (reachedLatest || (added == 0 && !knownNewer))) { latest = true; newerEnd = true; }
        else if (connected && added == 0) error = "Telegram aún no devolvió los mensajes siguientes. Puedes reintentar.";
        else if (!connected && page.length == 0) error = "Esperando red o sincronización. Puedes reintentar.";
        changed.clear(); return true;
    }
    void invalidate() { serial++; loading = false; waitingRetry = false; stale = true; changed.clear(); }
    private void merge(Read read, TdApi.Message[] page) {
        if (!read.older && !latest && page.length > 0) {
            // A sliding older window is not contiguous with the latest page. Do not hide that gap.
            items.entrySet().removeIf(entry -> changed.getOrDefault(entry.getKey(), 0L) <= read.revision);
            latest = true; newerEnd = true;
        }
        for (TdApi.Message message : page) if (message.chatId == chatId && changed.getOrDefault(message.id, 0L) <= read.revision) items.put(message.id, message);
        while (items.size() > LIMIT) { if (read.older) { items.pollLastEntry(); latest = false; } else items.pollFirstEntry(); }
    }
    void put(TdApi.Message message) {
        if (message.chatId != chatId) return;
        // New live messages must not make pagination skip the discarded middle of an older window.
        if (!latest && !items.isEmpty() && message.id > items.lastKey()) { stale = true; return; }
        if (loading) changed.put(message.id, ++revision); else revision++;
        items.put(message.id, message); while (items.size() > LIMIT) items.pollFirstEntry();
    }
    void content(long id, TdApi.MessageContent content) {
        if (loading) changed.put(id, ++revision); else revision++;
        TdApi.Message existing = items.get(id); if (existing != null) existing.content = content;
    }
    void remove(long id) {
        if (loading) changed.put(id, ++revision); else revision++;
        items.remove(id);
    }
    TdApi.Message find(long id) { return items.get(id); }
    List<TdApi.Message> snapshot() { return new ArrayList<>(items.values()); }
    int size() { return items.size(); }
    long newestConfirmedId() {
        for (TdApi.Message message : items.descendingMap().values()) if (message.sendingState == null) return message.id;
        return 0;
    }
    private static long oldest(TdApi.Message[] page) {
        long result = Long.MAX_VALUE; for (TdApi.Message message : page) result = Math.min(result, message.id); return result;
    }
}
