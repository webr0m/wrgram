package cc.webrom.wrgram;

import android.os.Handler;
import android.os.Looper;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONArray;
import org.json.JSONObject;

/** Independent assistant. Never receives the Telegram session, messages, notes or identifiers. */
final class AssistantController {
    private static final String BASE = "https://wrgram.webrom.cc/api/v1/assistant";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final List<AssistantPayload.Turn> turns = new ArrayList<>();
    private final List<JSONObject> proposals = new ArrayList<>();
    private Runnable listener;
    private volatile HttpURLConnection connection;
    private volatile long generation;
    boolean busy, consent, ready;
    String model = "", state = "Sin comprobar", error = "";

    void observe(Runnable value) { listener = value; }
    void unobserve(Runnable value) { if (listener == value) listener = null; }
    private void changed() { if (listener != null) listener.run(); }
    List<AssistantPayload.Turn> history() { return new ArrayList<>(turns); }
    List<JSONObject> proposals() { return new ArrayList<>(proposals); }

    void status() {
        if (busy) return;
        busy = true; error = ""; final long token = ++generation; deadline(token); changed();
        io.execute(() -> {
            if (generation != token) return;
            try {
                JSONObject result = call("/status", null);
                String remoteState = result.optString("state"), provider = result.optString("provider"), remoteModel = result.optString("model");
                if (!(result.opt("state") instanceof String) || !(result.opt("model") instanceof String) ||
                    !(remoteState.equals("ready") || remoteState.equals("not-configured") || remoteState.equals("model-missing") || remoteState.equals("offline")) || !provider.equals("groq") || remoteModel.length() > 200) throw new IllegalStateException("Invalid status");
                main.post(() -> { if (generation != token) return; busy = false; ready = remoteState.equals("ready"); model = remoteModel;
                    state = ready ? "Proveedor Groq disponible" : remoteState.equals("not-configured") ? "Generación deshabilitada en la alpha pública" : "Proveedor no disponible"; changed(); });
            } catch (Exception ignored) { main.post(() -> { if (generation != token) return; busy = false; ready = false; state = "Sin conexión al servicio de IA"; error = "No se pudo comprobar el servicio. Puedes volver a intentarlo."; changed(); }); }
        });
    }

    boolean send(String prompt) {
        if (busy || !ready || !consent || prompt.trim().isEmpty() || prompt.length() > 4000) return false;
        List<AssistantPayload.Turn> requestTurns = new ArrayList<>(turns);
        while (requestTurns.size() > 8) requestTurns.remove(0);
        requestTurns.add(new AssistantPayload.Turn("user", prompt));
        final JSONObject payload;
        try { payload = AssistantPayload.build(requestTurns, consent, "groq"); }
        catch (Exception ignored) { error = "Revisa el consentimiento y la instrucción propia."; changed(); return false; }
        busy = true; error = ""; final long token = ++generation; deadline(token); changed();
        io.execute(() -> {
            if (generation != token) return;
            try {
                JSONObject result = call("/chat", payload);
                String message = result.optString("message");
                if (!result.optString("provider").equals("groq") || !(result.opt("message") instanceof String) || message.length() > 12000 || !(result.opt("proposals") instanceof JSONArray)) throw new IllegalStateException("Invalid response");
                List<JSONObject> safeProposals = new ArrayList<>();
                JSONArray candidates = result.getJSONArray("proposals");
                for (int i = 0; i < Math.min(3, candidates.length()); i++) {
                    JSONObject proposal = candidates.optJSONObject(i); if (proposal == null) continue;
                    String title = proposal.optString("title").trim(), text = proposal.optString("text").trim();
                    if (proposal.optString("type").equals("prepare_personal_note") && !title.isEmpty() && title.length() <= 80 && !text.isEmpty() && text.length() <= 5000)
                        safeProposals.add(new JSONObject().put("title", title).put("text", text));
                }
                if (message.trim().isEmpty() && safeProposals.isEmpty()) throw new IllegalStateException("Empty response");
                main.post(() -> { if (generation != token) return; busy = false;
                    turns.clear(); turns.addAll(requestTurns); if (!message.trim().isEmpty()) turns.add(new AssistantPayload.Turn("assistant", message));
                    proposals.clear(); proposals.addAll(safeProposals); changed(); });
            } catch (Exception ignored) { main.post(() -> { if (generation != token) return; busy = false; error = "La generación no se confirmó. Tu instrucción no se ha borrado; no se reintentó ni se cambió de proveedor automáticamente."; changed(); }); }
        });
        return true;
    }

    void clear() {
        generation++; HttpURLConnection current = connection; if (current != null) current.disconnect();
        turns.clear(); proposals.clear(); consent = false; busy = false; error = ""; changed();
    }
    void revoke() { clear(); }

    private void deadline(long token) {
        main.postDelayed(() -> {
            if (generation != token || !busy) return;
            generation++; busy = false;
            HttpURLConnection current = connection; if (current != null) current.disconnect();
            error = "El servicio de IA tardó demasiado. Se canceló la espera y no se reintentó automáticamente."; changed();
        }, 20_000);
    }

    private JSONObject call(String path, JSONObject body) throws Exception {
        HttpURLConnection request = (HttpURLConnection) new URL(BASE + path).openConnection(); connection = request;
        request.setConnectTimeout(5000); request.setReadTimeout(15_000); request.setInstanceFollowRedirects(false);
        request.setRequestProperty("Accept", "application/json"); request.setRequestProperty("Cache-Control", "no-store");
        try {
            if (body != null) {
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                request.setRequestMethod("POST"); request.setDoOutput(true); request.setRequestProperty("Content-Type", "application/json"); request.setFixedLengthStreamingMode(bytes.length);
                try (java.io.OutputStream output = request.getOutputStream()) { output.write(bytes); }
            }
            int code = request.getResponseCode();
            if (code != 200) throw new IllegalStateException("Service unavailable");
            try (InputStream input = request.getInputStream(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = input.read(buffer)) != -1) { if (bytes.size() + count > 196608) throw new IllegalStateException("Response limit"); bytes.write(buffer, 0, count); }
                return new JSONObject(bytes.toString("UTF-8"));
            }
        } finally { request.disconnect(); if (connection == request) connection = null; }
    }
}
