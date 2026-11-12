package cc.webrom.wrgram;

import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import java.util.ArrayDeque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Schedules cleanup in TDLib's existing disk cache for the current Telegram account. */
final class TelegramCache {
    private static final long INTERVAL = 6 * 60 * 60 * 1000L;
    private static final int CHAT_SCAN_LIMIT = 1000;
    private static final int MAX_EXCEPTIONS = 100;
    private final TdSession session;
    private final SharedPreferences preferences;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final Runnable maintenance = this::maintain;
    private boolean busy;
    private int generation;
    private int policyRevision;

    private static final class Policy {
        final int maximum, people, groups, channels;
        final Set<Long> keep;

        Policy(JSONObject value) {
            maximum = CachePolicy.gib(value.optInt("maxGiB", CachePolicy.DEFAULT_GIB));
            people = CachePolicy.days(value.optInt("privateDays", CachePolicy.DEFAULT_DAYS));
            groups = CachePolicy.days(value.optInt("groupDays", CachePolicy.DEFAULT_DAYS));
            channels = CachePolicy.days(value.optInt("channelDays", CachePolicy.DEFAULT_DAYS));
            keep = new LinkedHashSet<>();
            JSONArray ids = value.optJSONArray("keepChats");
            if (ids != null) for (int i = 0; i < Math.min(ids.length(), MAX_EXCEPTIONS); i++) {
                long id = ids.optLong(i);
                if (id != 0) keep.add(id);
            }
        }

        JSONObject dto() throws JSONException {
            JSONArray ids = new JSONArray();
            for (long id : keep) ids.put(Long.toString(id));
            return new JSONObject().put("maxGiB", maximum).put("privateDays", people)
                    .put("groupDays", groups).put("channelDays", channels).put("keepChats", ids);
        }

        int retention(String kind) {
            if ("private".equals(kind)) return people;
            if ("group".equals(kind)) return groups;
            if ("channel".equals(kind)) return channels;
            return 0;
        }
    }

    TelegramCache(TdSession session) {
        this.session = session;
        preferences = session.context().getSharedPreferences("telegram_cache", 0);
    }

    private String key() { return session.slot + "." + session.selfId; }

    private Policy policy() {
        try { return new Policy(new JSONObject(preferences.getString(key(), "{}"))); }
        catch (JSONException ignored) { return new Policy(new JSONObject()); }
    }

    JSONObject settings() throws JSONException { return policy().dto(); }

    JSONObject save(JSONObject values) throws JSONException {
        Policy policy = new Policy(values);
        JSONObject settings = policy.dto();
        preferences.edit().putString(key(), settings.toString()).remove(key() + ".last").apply();
        policyRevision++;
        schedule(3500);
        return settings;
    }

    void start() { schedule(30_000); }

    void stop() {
        main.removeCallbacks(maintenance);
        generation++;
        busy = false;
    }

    private void schedule(long delay) {
        main.removeCallbacks(maintenance);
        main.postDelayed(maintenance, delay);
    }

    private void maintain() {
        if (!session.ready() || session.selfId == 0) return;
        long now = System.currentTimeMillis();
        String key = key();
        long last = preferences.getLong(key + ".last", 0L);
        if (busy) { schedule(60_000); return; }
        if (now >= last && now - last < INTERVAL) { schedule(INTERVAL - (now - last)); return; }
        int run = ++generation;
        int revision = policyRevision;
        busy = true;
        Policy policy = policy();
        Consumer<Boolean> complete = success -> {
            if (run != generation) return;
            busy = false;
            if (!key.equals(key()) || !session.ready()) return;
            if (revision != policyRevision) { schedule(3500); session.cacheChanged(); return; }
            if (success) preferences.edit().putLong(key + ".last", now).apply();
            schedule(success ? INTERVAL : 15 * 60_000L);
            session.cacheChanged();
        };
        ArrayDeque<TdApi.OptimizeStorage> operations = new ArrayDeque<>();
        Set<Long> retained = new LinkedHashSet<>(policy.keep);
        if (session.activeChat != 0) retained.add(session.activeChat);
        if (policy.people == policy.groups && policy.groups == policy.channels) {
            if (policy.people != 0) operations.add(ageSweep(policy.people, new long[0], ids(retained)));
            finishWithQuota(policy, operations, run, complete);
        } else {
            session.performSlow(new TdApi.GetStorageStatistics(CHAT_SCAN_LIMIT), stats -> {
                if (run != generation) return;
                Map<Integer, Set<Long>> buckets = new LinkedHashMap<>();
                if (stats.byChat != null) for (TdApi.StorageStatisticsByChat item : stats.byChat) {
                    if (item.chatId == 0 || retained.contains(item.chatId)) continue;
                    TdApi.Chat chat = session.chat(item.chatId);
                    int days = policy.retention(chat == null ? null : CachePolicy.chatKind(chat.type));
                    if (days != 0) buckets.computeIfAbsent(days, ignored -> new LinkedHashSet<>()).add(item.chatId);
                }
                buckets.forEach((days, chats) -> operations.add(ageSweep(days, ids(chats), new long[0])));
                finishWithQuota(policy, operations, run, complete);
            }, error -> complete.accept(false));
        }
    }

    private static TdApi.OptimizeStorage ageSweep(int days, long[] chats, long[] excluded) {
        return CachePolicy.optimize(CachePolicy.NO_SIZE_LIMIT, days * CachePolicy.DAY, 3600, "all", chats, excluded);
    }

    private void finishWithQuota(Policy policy, ArrayDeque<TdApi.OptimizeStorage> operations, int run, Consumer<Boolean> complete) {
        sweepNext(operations, run, success -> {
            if (!success || policy.maximum == 0) { complete.accept(success); return; }
            long limit = policy.maximum * CachePolicy.GIB;
            session.perform(new TdApi.GetStorageStatisticsFast(), stats -> {
                if (run != generation) return;
                if (stats.filesSize <= limit) { complete.accept(true); return; }
                long[] excluded = session.activeChat == 0 ? new long[0] : new long[]{session.activeChat};
                session.performSlow(CachePolicy.optimize(limit, CachePolicy.NO_AGE_LIMIT, 3600, "all", new long[0], excluded),
                        ignored -> complete.accept(true), error -> complete.accept(false));
            }, error -> complete.accept(false));
        });
    }

    private void sweepNext(ArrayDeque<TdApi.OptimizeStorage> operations, int run, Consumer<Boolean> complete) {
        if (run != generation) return;
        TdApi.OptimizeStorage next = operations.poll();
        if (next == null) { complete.accept(true); return; }
        session.performSlow(next, ignored -> sweepNext(operations, run, complete), error -> complete.accept(false));
    }

    void clear(String category, long chatId, int days, Consumer<TdApi.StorageStatistics> done, Consumer<String> failure) {
        if (busy) { failure.accept("Hay una limpieza de caché en curso. Vuelve a intentarlo en un momento."); return; }
        if (chatId != 0) {
            TdApi.Chat chat = session.chat(chatId);
            if (chat == null || CachePolicy.chatKind(chat.type) == null) {
                failure.accept("Esta conversación no está disponible para la limpieza de caché.");
                return;
            }
        }
        long[] chats = chatId == 0 ? new long[0] : new long[]{chatId};
        TdApi.OptimizeStorage operation = days > 0
                ? CachePolicy.optimize(CachePolicy.NO_SIZE_LIMIT, days * CachePolicy.DAY, 0, category, chats, new long[0])
                : CachePolicy.optimize(0, CachePolicy.NO_AGE_LIMIT, 0, category, chats, new long[0]);
        int run = ++generation;
        busy = true;
        session.performSlow(operation, result -> {
            if (run != generation) return;
            busy = false;
            session.cacheChanged();
            done.accept(result);
        }, error -> {
            if (run != generation) return;
            busy = false;
            failure.accept(error);
        });
    }

    void details(Consumer<JSONObject> done, Consumer<String> failure) {
        if (busy) { failure.accept("El almacenamiento se está actualizando. Inténtalo de nuevo en un momento."); return; }
        int run = ++generation;
        busy = true;
        session.performSlow(new TdApi.GetStorageStatistics(30), stats -> {
            if (run != generation) return;
            busy = false;
            try { done.accept(breakdown(stats)); }
            catch (JSONException ignored) { failure.accept("No se pudo preparar el detalle de almacenamiento."); }
        }, error -> {
            if (run != generation) return;
            busy = false;
            failure.accept(error);
        });
    }

    private JSONObject breakdown(TdApi.StorageStatistics stats) throws JSONException {
        Map<String, Long> categories = new LinkedHashMap<>();
        JSONArray chats = new JSONArray();
        if (stats.byChat != null) for (TdApi.StorageStatisticsByChat item : stats.byChat) {
            JSONObject sizes = new JSONObject();
            long total = 0;
            if (item.byFileType != null) for (TdApi.StorageStatisticsByFileType file : item.byFileType) {
                String type = CachePolicy.category(file.fileType);
                if (type == null) continue;
                total += file.size;
                sizes.put(type, sizes.optLong(type) + file.size);
                categories.merge(type, file.size, Long::sum);
            }
            TdApi.Chat chat = session.chat(item.chatId);
            if (total > 0 && chat != null && CachePolicy.chatKind(chat.type) != null) {
                chats.put(new JSONObject().put("id", Long.toString(chat.id)).put("title", NativeSnapshot.limit(chat.title, 128))
                        .put("size", total).put("categories", sizes));
            }
        }
        return new JSONObject().put("categories", new JSONObject(categories)).put("chats", chats);
    }

    private static long[] ids(Set<Long> values) { return values.stream().mapToLong(Long::longValue).toArray(); }
}
