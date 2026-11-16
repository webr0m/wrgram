package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * La schema respondió antes de escribir y corrigió dos cosas que dábamos por ciertas. Primero: salir
 * siendo propietario no está bloqueado —existe `GetChatOwnerAfterLeaving`, «returns the user who will
 * become the owner of the chat after 7 days if the current user does not return to the supergroup or
 * channel during that period or immediately for basic groups»—, así que lo que faltaba no era un
 * permiso sino decir a manos de quién queda el chat antes de pulsar Salir. Segundo:
 * `TransferChatOwnership` dice «for basic groups, supergroups and channel chats only», o sea que el
 * puente restringía el traspaso a supergrupos por decisión propia, no por regla de Telegram. Aquí
 * viven las frases y las tres decisiones —quién es propietario, cuándo cambia la propiedad y a quién
 * se le puede entregar—; nada de esto habla con Telegram, pero todo lo que el puente, la interfaz y
 * la vista de diseño dicen sobre la propiedad sale de esta clase.
 */
final class ChatOwnership {
    static final String TRANSFER = "transfer";
    static final String IMMEDIATE = "immediate";
    static final String SEVEN_DAYS = "seven_days";

    static final String UNSUPPORTED
        = "La propiedad solo existe en comunidades: en un chat privado o secreto no hay nada que transferir ni heredar.";
    static final String BAD_RECIPIENT
        = "Telegram no entrega la propiedad a un bot ni a una cuenta eliminada: elige a una persona.";
    static final String SELF_RECIPIENT = "Elige a otra persona para recibir la propiedad.";
    static final String NO_SUCCESSOR = "Telegram no devolvió a quién pasaría la propiedad si sales.";

    private ChatOwnership() {}

    /**
     * `TransferChatOwnership` y `GetChatOwnerAfterLeaving` se documentan igual: básico, supergrupo o
     * canal. El chat privado y el secreto quedan fuera, que es lo único que la schema prohíbe de verdad.
     */
    static boolean applicable(TdApi.Chat chat) {
        if (chat == null) return false;
        return chat.type instanceof TdApi.ChatTypeBasicGroup || chat.type instanceof TdApi.ChatTypeSupergroup;
    }

    /** En un básico la propiedad cambia «immediately»; en supergrupo o canal, a los 7 días de no volver. */
    static boolean basic(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeBasicGroup;
    }

    /** Cuándo Telegram entrega la propiedad después de que el propietario salga. */
    static String moment(TdApi.Chat chat) {
        return basic(chat) ? IMMEDIATE : SEVEN_DAYS;
    }

    /** Solo cuenta como propietario quien sigue dentro: la creadora que ya salió no tiene propiedad que ceder. */
    static boolean creator(TdApi.ChatMemberStatus status) {
        return status instanceof TdApi.ChatMemberStatusCreator && ((TdApi.ChatMemberStatusCreator) status).isMember;
    }

    /**
     * `TransferChatOwnership` documenta el destinatario: «The ownership can't be transferred to a bot
     * or to a deleted user», y `UserTypeDeleted` añade que no se puede hacer ninguna acción sobre él.
     * La propia cuenta tampoco: entregarse la propiedad a una misma no es un traspaso.
     */
    static boolean recipient(TdApi.User user, long selfId) {
        if (user == null || user.id <= 0 || user.id == selfId) return false;
        return !(user.type instanceof TdApi.UserTypeBot) && !(user.type instanceof TdApi.UserTypeDeleted);
    }

    /** El id del heredero, dicho por el `User` que devuelve la propia petición. */
    static long successor(TdApi.User user) {
        return user == null ? 0L : user.id;
    }

    /**
     * Lo que la persona tiene que leer antes de pulsar Salir siendo propietaria: el nombre real de a
     * manos de quién queda el chat y el plazo con el que Telegram lo decide. Sin heredero la frase lo
     * dice en lugar de prometer un nombre.
     */
    static String exitMessage(String title, String successorName, TdApi.Chat chat) {
        String name = title == null ? "" : title.trim();
        String who = successorName == null ? "" : successorName.trim();
        if (name.isEmpty()) name = "esta comunidad";
        if (who.isEmpty()) {
            return "«" + name + "» dejará de aparecer en los chats de esta cuenta. " + NO_SUCCESSOR
                + " WRGram solo pide abandonar: no borra ningún mensaje.";
        }
        return basic(chat)
            ? "«" + name + "» dejará de ser tuyo: en un grupo básico Telegram entrega la propiedad a " + who
                + " en cuanto sales. WRGram solo pide abandonar: no borra ningún mensaje."
            : "«" + name + "» seguirá siendo tuyo durante 7 días: si no vuelves, Telegram le entrega la propiedad a "
                + who + ". Puedes transferírsela ahora y salir después como miembro.";
    }
}
