package cc.webrom.wrgram;

import java.util.HashMap;
import java.util.ArrayList;
import java.util.Map;

/** Main-thread deadlines. Canceling a UI request never pretends to undo a Telegram action. */
final class RequestTracker {
    interface Cancel { void cancel(); }
    interface Scheduler { Cancel after(long milliseconds, Runnable runnable); }
    private final Scheduler scheduler;
    private final Map<String, Ticket> pending = new HashMap<>();
    RequestTracker(Scheduler scheduler) { this.scheduler = scheduler; }

    final class Ticket {
        final String key;
        private Cancel timer;
        private boolean finished;
        Ticket(String key) { this.key = key; }
        boolean complete() {
            if (finished) return false;
            finished = true;
            if (timer != null) timer.cancel();
            if (pending.get(key) == this) pending.remove(key);
            return true;
        }
        boolean active() { return !finished; }
    }

    Ticket start(String key, long milliseconds, Runnable timeout) {
        Ticket previous = pending.get(key);
        if (previous != null) previous.complete();
        Ticket ticket = new Ticket(key);
        pending.put(key, ticket);
        ticket.timer = scheduler.after(milliseconds, () -> { if (ticket.complete()) timeout.run(); });
        return ticket;
    }
    void cancelPrefix(String prefix) {
        for (Ticket ticket : new ArrayList<>(pending.values())) if (ticket.key.startsWith(prefix)) ticket.complete();
    }
    void clear() { cancelPrefix(""); }
    int size() { return pending.size(); }
}
