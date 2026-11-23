package cc.webrom.wrgram;

/**
 * Ronda CQ · N03: reglas puras de las acciones de notificación. Sin Android: la JVM las prueba.
 * El bloqueo de la app veta la respuesta directa porque el RemoteInput no pasa por AppLockScreen.
 */
final class NotificationActions {
    static final String REPLY = "cc.webrom.wrgram.action.REPLY";
    static final String MARK_READ = "cc.webrom.wrgram.action.MARK_READ";
    static final String EXTRA_TEXT = "reply_text";
    static final int MAX_TEXT = 4096;
    static final String LOCKED = "Desbloquea WRGram para responder desde la notificación.";
    static final String NOT_READY = "La cuenta no está lista. Abre WRGram para responder.";
    static final String SECRET = "Los chats secretos no admiten respuestas desde la notificación.";
    static final String SEND_FAILED = "No se pudo enviar la respuesta. Abre WRGram y revisa el historial antes de reintentar.";

    private NotificationActions() {}

    static boolean replyAllowed(boolean lockEnabled, boolean secretChat) {
        return !lockEnabled && !secretChat;
    }

    static boolean markReadAllowed(long messageId) {
        return messageId != 0;
    }

    static String cleanedReply(String text) {
        return text == null ? "" : text.trim();
    }

    static String replyProblem(String text) {
        String cleaned = cleanedReply(text);
        if (cleaned.isEmpty()) return "Escribe una respuesta antes de enviarla.";
        if (cleaned.length() > MAX_TEXT) return "La respuesta supera los 4096 caracteres de Telegram.";
        return null;
    }
}