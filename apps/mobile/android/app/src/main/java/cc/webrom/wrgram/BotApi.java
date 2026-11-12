package cc.webrom.wrgram;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Pattern;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONObject;

/**
 * Único transporte hacia la Bot API de Telegram.
 *
 * <p>El host queda fijado dentro de esta clase y el token solo se acepta con la forma
 * `número:cadena` porque viaja dentro de la ruta: un token con barras, puntos suspensivos o
 * almohadillas convertiría `/bot<token>/método` en otra ruta del servidor. Ningún mensaje de
 * error devuelve texto del servidor sin antes comprobar que no repite el token.</p>
 */
final class BotApi {
    static final String HOST = "api.telegram.org";
    private static final Pattern TOKEN = Pattern.compile("[0-9]{1,20}:[A-Za-z0-9_-]{25,80}");
    private static final int CONNECT_TIMEOUT_MS = 10_000;
    private static final int READ_TIMEOUT_MS = 15_000;
    private static final int MAX_RESPONSE_BYTES = 65_536;

    private BotApi() {}

    static final class Reply {
        final JSONObject result;
        final String error;

        private Reply(JSONObject result, String error) { this.result = result; this.error = error; }
        static Reply ok(JSONObject result) { return new Reply(result, null); }
        static Reply fail(String error) { return new Reply(null, error); }
    }

    static boolean validToken(String token) { return token != null && TOKEN.matcher(token).matches(); }

    /** Ruta exacta que se va a solicitar; separada para poder juzgarla en pruebas JVM. */
    static String path(String token, String method) { return "/bot" + token + "/" + method; }

    /** Respuesta de Telegram tal cual, salvo cuando repite el token o se pasa de 200 caracteres. */
    static String safeDescription(String description, String token) {
        if (description == null || description.isBlank()) return "La Bot API rechazó la petición.";
        String trimmed = description.trim();
        if (token != null && trimmed.contains(token)) return "La Bot API rechazó el token del bot.";
        return trimmed.length() > 200 ? trimmed.substring(0, 200) : trimmed;
    }

    static Reply call(String token, String method, JSONObject payload) {
        if (!validToken(token)) return Reply.fail("El token no tiene el formato de un bot de Telegram.");
        if (method == null || !method.matches("[A-Za-z]{1,32}")) return Reply.fail("Método de Bot API no válido.");
        HttpsURLConnection connection = null;
        try {
            connection = (HttpsURLConnection) new URL("https://" + HOST + path(token, method)).openConnection();
            connection.setSSLSocketFactory(new PublicOnlySocketFactory(CONNECT_TIMEOUT_MS));
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Cache-Control", "no-store");
            if (payload != null) {
                byte[] bytes = payload.toString().getBytes(StandardCharsets.UTF_8);
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setFixedLengthStreamingMode(bytes.length);
                try (OutputStream output = connection.getOutputStream()) { output.write(bytes); }
            }
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            if (stream == null) return Reply.fail(status == 401 ? "La Bot API no reconoció el token del bot." : "La Bot API respondió " + status + ".");
            String body = read(stream);
            JSONObject json = new JSONObject(body);
            if (json.optBoolean("ok")) return Reply.ok(json.optJSONObject("result"));
            return Reply.fail(safeDescription(json.optString("description"), token));
        } catch (java.net.SocketTimeoutException timeout) {
            return Reply.fail("La Bot API tardó demasiado en responder. Comprueba el chat antes de repetir la publicación.");
        } catch (Exception ignored) {
            return Reply.fail("No se pudo contactar con la Bot API de Telegram.");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String read(InputStream stream) throws Exception {
        try (InputStream input = stream; ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (bytes.size() + count > MAX_RESPONSE_BYTES) throw new IllegalStateException("Response limit");
                bytes.write(buffer, 0, count);
            }
            return bytes.toString("UTF-8");
        }
    }
}
