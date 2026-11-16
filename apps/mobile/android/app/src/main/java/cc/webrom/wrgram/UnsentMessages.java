package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/**
 * Mensajes propios que Telegram todavía no tiene por buenos: «pending» está saliendo ahora mismo y
 * «failed» se quedó en el dispositivo. La diferencia importa porque reintentar un pendiente
 * duplicaría un envío que quizá ya caminó, y porque las únicas razones del fallo son las que manda
 * Telegram: `MessageSendingStateFailed` llega con `canRetry`, `needAnotherSender`, `needDropReply`,
 * `needAnotherReplyQuote`, el coste en Stars y un `retryAfter` que además **no** emite actualización,
 * así que solo sirve para avisar, nunca para prohibir el reintento para siempre.
 */
final class UnsentMessages {
    static final int MAX_ERROR = 180;
    /** TDLib prohíbe mostrar o procesar el texto que Telegram manda con este código. */
    static final int UNDISPLAYABLE_CODE = 406;

    private UnsentMessages() {}

    static boolean pending(TdApi.Message message) {
        return message != null && message.isOutgoing && message.sendingState instanceof TdApi.MessageSendingStatePending;
    }

    static boolean failed(TdApi.Message message) {
        return message != null && message.isOutgoing && message.sendingState instanceof TdApi.MessageSendingStateFailed;
    }

    /** Cualquier mensaje propio que todavía no está en Telegram, haya salido o no. */
    static boolean waiting(TdApi.Message message) {
        return message != null && message.isOutgoing && message.sendingState != null;
    }

    private static TdApi.MessageSendingStateFailed failure(TdApi.Message message) {
        return failed(message) ? (TdApi.MessageSendingStateFailed) message.sendingState : null;
    }

    /**
     * La fila que ve la interfaz, con la misma forma para un pendiente y para un fallido: así el
     * componente no tiene que adivinar qué campos existen. De un pendiente solo se sabe que sigue
     * saliendo, así que todo lo demás son los valores neutros de Telegram.
     */
    static JSONObject reason(TdApi.Message message) throws Exception {
        if (!waiting(message)) throw new IllegalArgumentException("Este mensaje no está esperando a Telegram.");
        TdApi.MessageSendingStateFailed failure = failure(message);
        JSONObject row = new JSONObject();
        row.put("pending", failure == null);
        row.put("code", 0);
        row.put("telegram", "");
        row.put("canRetry", false);
        row.put("anotherSender", false);
        row.put("otherQuote", false);
        row.put("dropsReply", false);
        // Las Stars pueden superar 2^53 en cuentas con suscripciones caras; viajan en texto como los ids.
        row.put("stars", "0");
        row.put("wait", 0);
        if (failure == null) return row;
        int code = failure.error == null ? 0 : failure.error.code;
        row.put("code", code);
        row.put("telegram", telegramText(message));
        row.put("canRetry", failure.canRetry);
        row.put("anotherSender", failure.needAnotherSender);
        row.put("otherQuote", failure.needAnotherReplyQuote);
        row.put("dropsReply", failure.needDropReply);
        row.put("stars", Long.toString(failure.requiredPaidMessageStarCount));
        row.put("wait", waitSeconds(message));
        return row;
    }

    /** Las palabras de Telegram sobre el fallo, recortadas a una línea y sin nada de la 406. */
    static String telegramText(TdApi.Message message) {
        TdApi.MessageSendingStateFailed failure = failure(message);
        TdApi.Error error = failure == null ? null : failure.error;
        if (error == null || error.message == null || error.code == UNDISPLAYABLE_CODE) return "";
        // Una línea limpia: los saltos de Telegram se vuelven espacios y las secuencias se colapsan.
        String said = error.message.replace('\n', ' ').replace('\r', ' ').replaceAll(" {2,}", " ").trim();
        return said.isEmpty() ? "" : NativeSnapshot.limit(said, MAX_ERROR);
    }

    /** Segundos que Telegram pidió esperar; 0 cuando no pidió ninguna espera. */
    static int waitSeconds(TdApi.Message message) {
        TdApi.MessageSendingStateFailed failure = failure(message);
        if (failure == null || !(failure.retryAfter > 0)) return 0;
        return (int) Math.min(Integer.MAX_VALUE, Math.ceil(failure.retryAfter));
    }

    /** Por qué WRGram no ofrece reintentar, o `null` si Telegram dice que se puede mandar otra vez. */
    static String retryProblem(TdApi.Message message) {
        if (message == null) return "El mensaje ya no está cargado. Vuelve a abrir la conversación.";
        if (!message.isOutgoing) return "Solo puedes reintentar mensajes que enviaste tú.";
        if (message.sendingState instanceof TdApi.MessageSendingStatePending)
            return "Telegram sigue intentando enviar este mensaje. Espera a que termine antes de repetirlo.";
        TdApi.MessageSendingStateFailed failure = failure(message);
        if (failure == null) return "Este mensaje ya está en Telegram.";
        if (!failure.canRetry) return "Telegram no admite reintentar este mensaje.";
        if (failure.requiredPaidMessageStarCount > 0)
            return "Telegram pide " + failure.requiredPaidMessageStarCount + " Stars para enviar este mensaje otra vez; hazlo desde el propio mensaje, donde puedes revisar el coste.";
        if (failure.needAnotherSender) return "Telegram solo permite enviarlo otra vez a nombre de otro remitente del chat.";
        if (failure.needAnotherReplyQuote) return "Telegram solo permite enviarlo otra vez con una cita distinta, y la cita todavía no se edita desde WRGram.";
        return null;
    }

    /** El reintento cambia el contenido solo en un caso: Telegram tira la respuesta si el original ya no existe. */
    static boolean dropsReply(TdApi.Message message) {
        TdApi.MessageSendingStateFailed failure = failure(message);
        return failure != null && failure.needDropReply;
    }

    /** Lo que se le pregunta a la persona antes de reenviar: lo que dijo Telegram y lo que va a cambiar. */
    static String retryExplanation(TdApi.Message message) {
        StringBuilder text = new StringBuilder();
        String said = telegramText(message);
        if (!said.isEmpty()) text.append("Telegram dijo: «").append(said).append("». ");
        if (dropsReply(message)) text.append("Al enviarlo otra vez Telegram quitará la respuesta al mensaje original, que ya no está en el chat. ");
        int wait = waitSeconds(message);
        if (wait > 0) text.append("Telegram pidió esperar ").append(wait).append(" s antes de reintentar; si vuelve a rechazarlo, inténtalo dentro de un momento. ");
        text.append("El mensaje se envía tal como lo escribiste.");
        return text.toString().trim();
    }

    /**
     * Por qué WRGram no ofrece quitar el mensaje. Un pendiente **sí** se puede quitar: descartar un
     * envío propio que todavía no salió es la vía normal para cancelarlo, y el permiso real lo decide
     * después `GetMessageProperties`, que es la única fuente que TDLib admite para `deleteMessages`.
     */
    static String deleteProblem(TdApi.Message message) {
        if (message == null) return "El mensaje ya no está cargado. Vuelve a abrir la conversación.";
        if (!message.isOutgoing) return "Solo puedes quitar mensajes que enviaste tú.";
        if (message.sendingState == null) return "Este mensaje ya está en Telegram; usa sus opciones para borrarlo.";
        return null;
    }

    /** Texto del diálogo según lo que estaba pasando: un pendiente se descarta, un fallido se retira. */
    static String deleteExplanation(TdApi.Message message) {
        if (pending(message)) return "El mensaje todavía está saliendo de este dispositivo. Se descartará sin enviarlo y no aparecerá en el chat.";
        return "El mensaje nunca llegó a Telegram. Se quitará de este dispositivo y no se envía nada a la otra parte.";
    }
}
