package cc.webrom.wrgram;

import android.content.Context;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

import io.github.pytgcalls.ConnectionState;
import io.github.pytgcalls.NTgCalls;
import io.github.pytgcalls.media.AudioDescription;
import io.github.pytgcalls.media.MediaDescription;
import io.github.pytgcalls.media.MediaSource;
import io.github.pytgcalls.media.StreamMode;
import io.github.pytgcalls.p2p.RTCServer;
import org.drinkless.tdlib.TdApi;

/** The media engine runs off the UI thread. TDLib owns the signaling and call keys. */
final class TelegramCallMedia {
    interface Listener {
        void signal(byte[] data);
        void state(ConnectionState state);
    }

    private final NTgCalls engine = new NTgCalls();
    private final long id;
    private boolean created;
    private static boolean contextInitialized;

    static synchronized TdApi.CallProtocol protocol(Context context) {
        if (!contextInitialized) {
            try {
                // The bundled WebRTC classes target Java 21. Keep the Android app on its Java 17 toolchain.
                Class.forName("org.webrtc.ContextUtils").getMethod("initialize", Context.class)
                        .invoke(null, context.getApplicationContext());
                contextInitialized = true;
            } catch (ReflectiveOperationException error) {
                throw new IllegalStateException("WebRTC context unavailable", error);
            }
        }
        var nativeProtocol = NTgCalls.getProtocol();
        return new TdApi.CallProtocol(nativeProtocol.udp_p2p, nativeProtocol.udp_reflector,
                nativeProtocol.min_layer, nativeProtocol.max_layer, nativeProtocol.library_versions.toArray(new String[0]));
    }

    TelegramCallMedia(long id, Listener listener) {
        this.id = id;
        engine.onSignalingData((peer, data) -> { if (peer == id) listener.signal(data); });
        engine.onConnectionChange((peer, connection) -> { if (peer == id) listener.state(connection.state); });
    }

    void connect(TdApi.Call call, TdApi.CallStateReady ready) throws Exception {
        var devices = NTgCalls.getMediaDevices();
        if (devices.microphone.isEmpty() || devices.speaker.isEmpty()) {
            throw new IllegalStateException("Audio devices unavailable");
        }
        engine.createP2pCall(id);
        created = true;
        engine.setStreamSources(id, StreamMode.CAPTURE, audio(devices.microphone.get(0).metadata));
        engine.setStreamSources(id, StreamMode.PLAYBACK, audio(devices.speaker.get(0).metadata));
        engine.skipExchange(id, ready.encryptionKey, call.isOutgoing);
        engine.connectP2p(id, servers(ready.servers), Arrays.asList(ready.protocol.libraryVersions),
                ready.allowP2p, ready.customParameters == null || ready.customParameters.isEmpty() ? null : ready.customParameters);
    }

    private static MediaDescription audio(String device) {
        return new MediaDescription(new AudioDescription(MediaSource.DEVICE, 48000, 2, device, true),
                null, null, null);
    }

    private static List<RTCServer> servers(TdApi.CallServer[] source) {
        List<RTCServer> result = new ArrayList<>();
        for (TdApi.CallServer server : source) {
            if (server.type instanceof TdApi.CallServerTypeWebrtc) {
                var webrtc = (TdApi.CallServerTypeWebrtc) server.type;
                result.add(new RTCServer(server.id, server.ipAddress, server.ipv6Address, server.port,
                        webrtc.username, webrtc.password, webrtc.supportsTurn, webrtc.supportsStun, false, null));
            } else if (server.type instanceof TdApi.CallServerTypeTelegramReflector) {
                var relay = (TdApi.CallServerTypeTelegramReflector) server.type;
                result.add(new RTCServer(server.id, server.ipAddress, server.ipv6Address, server.port,
                        null, null, true, false, relay.isTcp, relay.peerTag));
            }
        }
        return result;
    }

    void signal(byte[] data) { engine.sendSignalingData(id, data); }

    void mute(boolean mute) {
        if (mute) engine.mute(id);
        else engine.unmute(id);
    }

    void close() {
        if (created) {
            created = false;
            try { engine.stop(id); } catch (RuntimeException ignored) {}
        }
    }
}
