package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * Unirse y salir son preguntas que solo Telegram puede responder, y `JoinChat` contesta de cuatro
 * maneras distintas: ya dentro, solicitud pendiente, aprobación de un bot de seguridad o rechazo del
 * bot. El puente las resolvía con un `a.ok(true)` —así que quien pulsaba «Unirme» se quedaba mirando
 * una comunidad a la que no había entrado—, y el enlace de invitación mezclaba las dos variantes
 * nuevas con un «Telegram no permitió unirte» que no dice cuál fue. Aquí vive la proyección exacta
 * de las cuatro variantes más la única regla que TDLib impone sobre el método: los chats privados y
 * secretos no se unen ni se abandonan por esta vía. Nada toca la sesión: es el listado de lo que
 * Telegram puede decir, para que el puente, el enlace de invitación y la interfaz cuenten el mismo
 * resultado con las mismas palabras.
 */
final class ChatMembership {
    static final String JOINED = "joined";
    static final String REQUEST = "request";
    static final String GUARD = "guard";
    static final String DECLINED = "declined";
    static final String LEFT = "left";
    static final String CANCELLED = "cancelled";

    private ChatMembership() {}

    /**
     * `JoinChat` y `LeaveChat` documentan que los chats privados y secretos no se pueden unir ni
     * abandonar por este método, así que ofrecer la acción ahí es prometer algo que Telegram rechaza.
     */
    static boolean applicable(TdApi.Chat chat) {
        if (chat == null) return false;
        return chat.type instanceof TdApi.ChatTypeBasicGroup || chat.type instanceof TdApi.ChatTypeSupergroup;
    }

    /** La clave que Telegram devolvió. Cadena vacía es una variante desconocida: el puente lo avisa. */
    static String state(TdApi.ChatJoinResult result) {
        if (result instanceof TdApi.ChatJoinResultSuccess) return JOINED;
        if (result instanceof TdApi.ChatJoinResultRequestSent) return REQUEST;
        if (result instanceof TdApi.ChatJoinResultGuardBotApprovalRequired) return GUARD;
        if (result instanceof TdApi.ChatJoinResultDeclined) return DECLINED;
        return "";
    }

    /** El bot que tiene que aprobar el ingreso; 0 cuando la respuesta no era de bot de seguridad. */
    static long guardBot(TdApi.ChatJoinResult result) {
        return result instanceof TdApi.ChatJoinResultGuardBotApprovalRequired
            ? ((TdApi.ChatJoinResultGuardBotApprovalRequired) result).botUserId
            : 0L;
    }

    /**
     * Si la cuenta está dentro, dicho por `GetChatMember` y no por la interfaz. La creadora que se
     * fue dejó de ser miembro, y una restringida sale de la lista cuando Telegram dice `isMember`
     * falso; `Left`, `Banned` y un estado sin datos nunca cuentan como estar dentro.
     */
    static boolean inside(TdApi.ChatMemberStatus status) {
        if (status instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) status).isMember;
        if (status instanceof TdApi.ChatMemberStatusRestricted) return ((TdApi.ChatMemberStatusRestricted) status).isMember;
        return status instanceof TdApi.ChatMemberStatusMember || status instanceof TdApi.ChatMemberStatusAdministrator;
    }

    /** Baneado: unirse no es una opción que Telegram ofrezca, y decir «ya lo intento» sería mentira. */
    static boolean blocked(TdApi.ChatMemberStatus status) {
        return status instanceof TdApi.ChatMemberStatusBanned;
    }
}
