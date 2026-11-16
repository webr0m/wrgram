package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * Buscar dentro de una conversación tiene cuatro criterios —texto, autor, tipo de contenido y fechas—
 * y el puente solo conocía los dos primeros, mal: `SearchChatMessages` admite `senderId`, pero aquí
 * nunca se llenaba, y la banda de fechas existía únicamente en la galería de multimedia. Además
 * TDLib prohíbe `SearchChatMessages` con consulta en un chat secreto («searchSecretMessages must be
 * used instead»), y ese camino no existía: buscar en un secreto devolvía el error del servidor como
 * un fallo genérico. Esta clase es la única que sabe qué combinación de criterios Telegram admite de
 * verdad, cómo se corta la banda de fechas sobre mensajes que ya vienen en orden inverso, y por qué un
 * cursor viejo no puede mezclarse con criterios nuevos. No toca la sesión: son las reglas, escritas
 * una vez, para que el puente, el simulador y la interfaz rechacen lo mismo con las mismas palabras.
 */
final class MessageSearch {
    static final int LIMIT = 50;
    /** Identificador con el que la interfaz pide «los mensajes del propio canal», no una persona. */
    static final String CHAT = "chat";
    /** Un año de margen: la banda se recorta aquí en el cliente, no en el servidor. */
    static final long MAX_WINDOW = 31622400L;

    static final String BAD_SENDER = "El autor del filtro no es un identificador de Telegram válido.";
    static final String CHAT_SENDER_ONLY = "Solo los canales publican a su nombre; en un grupo o conversación privada elige a una persona.";
    static final String REVERSED_BAND = "El rango de fechas termina antes de empezar.";
    static final String FUTURE_BAND = "El filtro apunta a una fecha futura.";
    static final String WIDE_BAND = "El rango de fechas es demasiado amplio; Telegram busca en periodos de hasta un año.";
    static final String BAD_DATE = "La fecha del filtro no es válida.";
    static final String SECRET_BAND = "En un chat secreto Telegram solo busca texto: no filtra por autor ni por fechas.";
    static final String GLOBAL_BAND = "Buscar por autor o por fechas solo vale dentro de una conversación; la búsqueda global no admite esos filtros.";

    private MessageSearch() {}

    /** `SearchSecretMessages` en lugar de `SearchChatMessages`: es lo único que TDLib admite con consulta. */
    static boolean secret(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeSecret;
    }

    /** El canal puede ser su propio remitente; un grupo básico o un privado, no. */
    static boolean selfPosting(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeSupergroup
            && ((TdApi.ChatTypeSupergroup) chat.type).isChannel;
    }

    /** Null si todo cabe dentro de lo que Telegram admite en este chat; si no, el motivo en español. */
    static String problem(String sender, long from, long until, long now, TdApi.Chat chat) {
        String who = trim(sender);
        if (secret(chat)) return band(who, from, until) ? SECRET_BAND : null;
        if (from < 0 || until < 0) return BAD_DATE;
        if (from > Integer.MAX_VALUE - 1L || until > Integer.MAX_VALUE - 1L) return BAD_DATE;
        if (until > 0 && from > 0 && until <= from) return REVERSED_BAND;
        // El tope de arriba es la medianoche *siguiente*, así que hoy en día siempre queda en el futuro;
        // lo que no puede estarlo es el principio de la banda: no habría nada que buscar.
        if (from > now) return FUTURE_BAND;
        if (from > 0 && until > 0 && until - from > MAX_WINDOW) return WIDE_BAND;
        if (who.isEmpty()) return null;
        if (CHAT.equals(who)) return selfPosting(chat) ? null : CHAT_SENDER_ONLY;
        return positive(who) ? null : BAD_SENDER;
    }

    /** Un id de usuario escrito como texto: solo dígitos, y mayor que cero. */
    static boolean positive(String value) {
        if (value == null || value.isEmpty() || value.length() > 19) return false;
        long parsed = 0;
        for (int index = 0; index < value.length(); index++) {
            char digit = value.charAt(index);
            if (digit < '0' || digit > '9') return false;
            parsed = parsed * 10 + (digit - '0');
            if (parsed <= 0) return false;
        }
        return true;
    }

    /** El objeto que TDLib espera; null significa «cualquier autor». Supone `problem()` ya resuelto. */
    static TdApi.MessageSender sender(String sender, TdApi.Chat chat) {
        String who = trim(sender);
        if (who.isEmpty()) return null;
        if (CHAT.equals(who)) return new TdApi.MessageSenderChat(chat.id);
        return new TdApi.MessageSenderUser(Long.parseLong(who));
    }

    /** Autor o fechas: las dos cosas que ni `SearchSecretMessages` ni la búsqueda global conocen. */
    static boolean band(String sender, long from, long until) {
        return !trim(sender).isEmpty() || from != 0 || until != 0;
    }

    private static String trim(String value) {
        return value == null ? "" : value.trim();
    }

    /**
     * `SearchChatMessages` llega en orden inverso y no conoce fechas, así que el tope de arriba se
     * convierte en el mensaje más cercano a esa hora y el corte de abajo se aplica aquí. `seed` es la
     * lectura que hay que pedir antes de paginar; 0 significa «desde el último mensaje».
     */
    static long seed(long until) {
        return until > 0 ? until - 1 : 0;
    }

    /** Si un mensaje de esa fecha entra en la banda pedida. */
    static boolean keep(long date, long from, long until) {
        return (from == 0 || date >= from) && (until == 0 || date < until);
    }

    /** Ya se pasó del principio de la banda: no hay nada más que buscar. */
    static boolean older(long date, long from) {
        return from > 0 && date < from;
    }

    /**
     * Los criterios que produjeron un cursor tienen que ser los mismos que lo siguen usando. Compara
     * las cinco partes —texto, autor, filtro y las dos fechas— porque perder cualquiera de ellas
     * devolvería resultados con una etiqueta que ya no es la que se pidió.
     */
    static boolean same(String query, String sender, String filter, long from, long until,
                        String otherQuery, String otherSender, String otherFilter, long otherFrom, long otherUntil) {
        return text(query).equals(text(otherQuery)) && text(sender).equals(text(otherSender))
            && text(filter).equals(text(otherFilter)) && from == otherFrom && until == otherUntil;
    }

    private static String text(String value) {
        return value == null ? "" : value;
    }
}
