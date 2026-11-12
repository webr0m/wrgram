package cc.webrom.wrgram;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import androidx.core.content.ContextCompat;
import io.github.pytgcalls.ConnectionState;
import org.drinkless.tdlib.TdApi;

import java.util.ArrayDeque;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Owns at most one private voice call for the current Telegram account. */
final class TelegramCalls {
    private static final String RING_CHANNEL = "telegram_voice_incoming";
    private static final int RING_NOTIFICATION = 7140;
    private final WrgramApplication app;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService mediaThread = Executors.newSingleThreadExecutor();
    private final Set<Runnable> observers = new LinkedHashSet<>();
    private final ArrayDeque<byte[]> queuedSignals = new ArrayDeque<>();
    private TelegramCallMedia media;
    private TdSession session;
    private TdApi.Call call;
    private int callId;
    private long peer;
    private long connectedAt;
    private int generation;
    private boolean accepted, serviceReady, mediaStarted, mediaReady, muted, speaker;
    private boolean incomingPresented;
    private String status = "";
    private final Runnable timedOut = () -> {
        if (session != null && connectedAt == 0) end(true, "Telegram no completó la llamada.");
    };

    TelegramCalls(WrgramApplication app) { this.app = app; }
    boolean active() { return session != null; }
    boolean ringing() { return call != null && !call.isOutgoing && !accepted && call.state instanceof TdApi.CallStatePending; }
    boolean connected() { return connectedAt > 0; }
    boolean claimIncomingScreen() {
        if (!ringing() || incomingPresented) return false;
        incomingPresented = true;
        return true;
    }
    boolean muted() { return muted; }
    boolean speaker() { return speaker; }
    long peer() { return peer; }
    String status() { return status; }
    String fingerprint() {
        return call != null && call.state instanceof TdApi.CallStateReady ready && ready.emojis != null
                ? String.join(" ", ready.emojis) : "";
    }
    String name() {
        TdApi.User user = session == null ? null : session.user(peer);
        return user == null ? "Telegram" : (user.firstName + " " + user.lastName).trim();
    }
    void addObserver(Runnable observer) { observers.add(observer); }
    void removeObserver(Runnable observer) { observers.remove(observer); }
    private void updateUi(String text) {
        status = text;
        for (Runnable observer : observers.toArray(new Runnable[0])) observer.run();
    }

    void start(long userId) {
        if (active() || !mayUseMicrophone() || !app.telegram().ready()) return;
        TdSession owner = app.telegram();
        session = owner;
        peer = userId;
        accepted = true;
        int attempt = ++generation;
        updateUi("Comprobando si el contacto admite llamadas…");
        main.postDelayed(timedOut, 45000);
        owner.perform(new TdApi.GetUserFullInfo(userId), info -> {
            if (attempt != generation) return;
            if (!info.canBeCalled) { end(false, "Este contacto no está disponible para llamadas."); return; }
            TdApi.CallProtocol protocol = protocol();
            if (protocol == null || !startAudioService()) return;
            updateUi("Llamando…");
            owner.perform(new TdApi.CreateCall(userId, protocol, false), result -> {
                if (attempt != generation) {
                    discard(owner, result.id, false, 0);
                    return;
                }
                callId = result.id;
            }, error -> { if (attempt == generation) end(false, error); });
        }, error -> { if (attempt == generation) end(false, error); });
    }

    void accept() {
        if (!ringing() || !mayUseMicrophone()) return;
        TdApi.CallProtocol protocol = protocol();
        if (protocol == null || !startAudioService()) return;
        accepted = true;
        cancelRing();
        int attempt = generation;
        updateUi("Conectando…");
        session.perform(new TdApi.AcceptCall(callId, protocol), ignored -> {},
                error -> { if (attempt == generation) end(true, error); });
    }

    private TdApi.CallProtocol protocol() {
        try { return TelegramCallMedia.protocol(app); }
        catch (RuntimeException | LinkageError error) {
            end(true, "No se pudo cargar el motor de llamadas.");
            return null;
        }
    }

    private boolean mayUseMicrophone() {
        return app.ageAccess().allowed() && (!AppLock.enabled(app) || AppLock.isUnlocked())
                && ContextCompat.checkSelfPermission(app, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean startAudioService() {
        try {
            ContextCompat.startForegroundService(app, new Intent(app, CallAudioService.class));
            return true;
        } catch (RuntimeException error) {
            end(true, "Android no permitió iniciar el audio de la llamada.");
            return false;
        }
    }

    void serviceStarted() {
        if (!active()) { app.stopService(new Intent(app, CallAudioService.class)); return; }
        serviceReady = true;
        connectIfReady();
    }
    void serviceStopped() {
        if (active() && serviceReady) end(true, "Android detuvo el audio de la llamada.");
    }

    void changed(TdSession owner, TdApi.Call update) {
        if (owner != app.telegram() || update.isVideo) return;
        if (!active()) {
            if (update.isOutgoing || !(update.state instanceof TdApi.CallStatePending)) return;
            generation++;
            session = owner;
            peer = update.userId;
            callId = update.id;
            call = update;
            showRing();
            updateUi("Llamada de voz entrante");
            main.postDelayed(timedOut, 60000);
            return;
        }
        if (session != owner || (callId != 0 ? update.id != callId : !update.isOutgoing || update.userId != peer)) return;
        call = update;
        callId = update.id;
        if (update.state instanceof TdApi.CallStateDiscarded) end(false, "Llamada finalizada");
        else if (update.state instanceof TdApi.CallStateError) end(false, "Telegram terminó la llamada con un error.");
        else if (update.state instanceof TdApi.CallStateReady) {
            updateUi(connected() ? "En llamada" : "Conectando audio…");
            connectIfReady();
        } else if (update.isOutgoing && update.state instanceof TdApi.CallStatePending pending) {
            updateUi(pending.isReceived ? "Sonando…" : "Llamando…");
        }
    }

    private void connectIfReady() {
        if (!accepted || !serviceReady || mediaStarted || call == null || !(call.state instanceof TdApi.CallStateReady ready)) return;
        mediaStarted = true;
        TdApi.Call current = call;
        TdSession owner = session;
        int attempt = generation;
        mediaThread.execute(() -> {
            try {
                media = new TelegramCallMedia(current.id, new TelegramCallMedia.Listener() {
                    @Override public void signal(byte[] data) { main.post(() -> {
                        if (attempt == generation) owner.perform(new TdApi.SendCallSignalingData(current.id, data), ignored -> {}, error -> {});
                    }); }
                    @Override public void state(ConnectionState state) { main.post(() -> mediaState(attempt, state)); }
                });
                media.connect(current, ready);
                main.post(() -> {
                    if (attempt != generation) return;
                    mediaReady = true;
                    while (!queuedSignals.isEmpty()) deliver(queuedSignals.removeFirst());
                });
            } catch (Exception | LinkageError error) {
                main.post(() -> { if (attempt == generation) end(true, "No se pudo conectar el audio."); });
            }
        });
    }

    private void mediaState(int attempt, ConnectionState state) {
        if (attempt != generation) return;
        if (state == ConnectionState.CONNECTED) {
            if (connectedAt == 0) connectedAt = SystemClock.elapsedRealtime();
            main.removeCallbacks(timedOut);
            updateUi("En llamada");
        } else if (state == ConnectionState.CONNECTING && connected()) {
            updateUi("Reconectando audio…");
        } else if (state == ConnectionState.FAILED || state == ConnectionState.TIMEOUT || state == ConnectionState.CLOSED) {
            end(true, true, "Se interrumpió la conexión de la llamada.");
        }
    }

    void signal(TdSession owner, TdApi.UpdateNewCallSignalingData data) {
        if (session != owner || data.callId != callId || data.data == null || data.data.length > 65536) return;
        if (mediaReady) deliver(data.data);
        else if (queuedSignals.size() < 64) queuedSignals.addLast(data.data);
    }
    private void deliver(byte[] bytes) {
        mediaThread.execute(() -> {
            if (media != null) try { media.signal(bytes); } catch (RuntimeException ignored) {}
        });
    }

    void toggleMute() {
        if (!mediaReady) return;
        boolean next = !muted;
        int attempt = generation;
        mediaThread.execute(() -> {
            try {
                if (media == null) return;
                media.mute(next);
                main.post(() -> { if (attempt == generation) { muted = next; updateUi(status); } });
            } catch (RuntimeException ignored) {}
        });
    }
    void toggleSpeaker() {
        if (serviceReady && CallAudioService.route(app, !speaker)) {
            speaker = !speaker;
            updateUi(status);
        }
    }

    void hangUp() { if (active()) end(true, "Llamada finalizada"); }
    void accountChanged() { if (active()) end(true, "Llamada finalizada"); }
    void sessionEnded(TdSession owner) { if (session == owner) end(false, "La sesión de Telegram se cerró."); }
    void audioUnavailable() { if (active()) end(true, "Android no permitió iniciar el audio de la llamada."); }

    private void end(boolean sendDiscard, String reason) {
        end(sendDiscard, false, reason);
    }
    private void end(boolean sendDiscard, boolean disconnected, String reason) {
        TdSession owner = session;
        int id = callId;
        int duration = connectedAt == 0 ? 0 : (int)((SystemClock.elapsedRealtime() - connectedAt) / 1000);
        generation++;
        main.removeCallbacks(timedOut);
        session = null;
        peer = 0;
        callId = 0;
        call = null;
        connectedAt = 0;
        accepted = serviceReady = mediaStarted = mediaReady = muted = speaker = incomingPresented = false;
        queuedSignals.clear();
        cancelRing();
        mediaThread.execute(() -> { if (media != null) { media.close(); media = null; } });
        app.stopService(new Intent(app, CallAudioService.class));
        if (sendDiscard && owner != null && id > 0) discard(owner, id, disconnected, duration);
        updateUi(reason);
    }

    private static void discard(TdSession owner, int id, boolean disconnected, int duration) {
        owner.perform(new TdApi.DiscardCall(id, disconnected, "", duration, false, 0), ignored -> {}, error -> {});
    }
    private void showRing() {
        if (!PushNotifications.permitted(app)) return;
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        if (manager == null) return;
        NotificationChannel channel = new NotificationChannel(RING_CHANNEL, "Llamadas entrantes", NotificationManager.IMPORTANCE_HIGH);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(channel);
        PendingIntent open = PendingIntent.getActivity(app, 7140, new Intent(app, CallActivity.class),
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(app, RING_CHANNEL).setSmallIcon(R.drawable.brand_foreground)
                .setContentTitle("Llamada de Telegram").setContentText("Toca para responder en WRGram")
                .setCategory(Notification.CATEGORY_CALL).setVisibility(Notification.VISIBILITY_PRIVATE)
                .setContentIntent(open).setTimeoutAfter(60000).build();
        manager.notify(RING_NOTIFICATION, notification);
    }
    private void cancelRing() {
        NotificationManager manager = app.getSystemService(NotificationManager.class);
        if (manager != null) manager.cancel(RING_NOTIFICATION);
    }
}
