package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * La ronda Q enseñó a mirar la lista de un grupo básico; esta ronda deja que esa lista sirva para algo.
 * Expulsar gente de un básico parecía imposible porque el puente cortaba por `ChatTypeSupergroup` y
 * devolvía «Esta acción requiere un supergrupo o canal», una frase que además mentía a medias: la schema
 * sí describe la acción aquí. `BanChatMember` existe para cualquier chat y pide el permiso
 * `canRestrictMembers`; lo que un básico no tiene son las tres cosas que el panel de supergrupos da por
 * supuestas: el plazo («`bannedUntilDate` … Always 0 in basic groups»), las restricciones parciales
 * (`ChatMemberStatusRestricted`: «Not supported in basic groups and channels») y la administración
 * repartida en permisos (`canPromoteMembers`: «applicable to supergroups and channels only»). A cambio,
 * `revokeMessages` sí es una decisión real: la propia schema dice que en supergrupos y canales «always
 * true», así que borrar o no borrar sus mensajes solo se pregunta donde la respuesta puede cambiar.
 * Aquí están las reglas y las palabras, una vez, sin TDLib más allá de leer estados.
 */
final class BasicGroupMemberAction {

    static final String NO_RIGHT = "Telegram no concede a esta cuenta permiso para expulsar personas del grupo.";
    static final String SELF = "No te expulses a ti mismo desde la lista: para salir usa «Salir del grupo».";
    static final String CREATOR = "Al creador del grupo no se le expulsa: solo puede salir él.";
    static final String OUTSIDE = "Esta persona ya no está dentro del grupo: no hay nada que expulsar.";
    static final String NO_RESTRICT = "En un grupo básico Telegram no admite restricciones parciales: o expulsa o no hace nada.";
    static final String NO_PROMOTE = "En un grupo básico la administración no se reparte en permisos: Telegram solo permite elegirlos en supergrupos y canales.";
    static final String NO_DURATION = "La expulsión de un grupo básico no tiene plazo: siempre es definitiva.";
    static final String REVOKE_ON = "También se borrarán los mensajes que esta persona envió en el grupo.";
    static final String REVOKE_OFF = "Sus mensajes se quedan en el grupo.";
    static final String SCOPE = "En un grupo básico Telegram solo permite expulsar o invitar: no hay permisos parciales ni administración a la carta.";
    static final String UNBAN_HINT = "Para que vuelva, invítalo de nuevo desde la tanda: en un grupo básico no hay baneo que levantar.";

    private BasicGroupMemberAction() {}

    /** El grupo básico es el único territorio de esta clase; lo demás sigue por su propio camino. */
    static boolean applicable(TdApi.Chat chat) {
        return MemberAdditions.basic(chat);
    }

    /**
     * Quién puede expulsar, dicho por lo que el servidor devuelve sobre la propia cuenta: el creador
     * dentro del grupo y cualquier administrador con `canRestrictMembers`. Un miembro normal no puede,
     * y eso se dice antes de ofrecer el botón en lugar de dejarlo fallar en seco.
     */
    static boolean mayRemove(TdApi.ChatMemberStatus self) {
        if (self instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) self).isMember;
        if (self instanceof TdApi.ChatMemberStatusAdministrator) {
            TdApi.ChatAdministratorRights rights = ((TdApi.ChatMemberStatusAdministrator) self).rights;
            return rights != null && rights.canRestrictMembers;
        }
        return false;
    }

    /**
     * Null si la expulsión tiene sentido tal y como la pide la persona; si no, el motivo exacto. El
     * estado objetivo viene de `GetChatMember`, no de lo que la lista pintaba hace un minuto.
     */
    static String banProblem(TdApi.ChatMemberStatus self, TdApi.ChatMemberStatus target, long selfId, long targetId) {
        if (targetId == selfId) return SELF;
        if (target instanceof TdApi.ChatMemberStatusCreator) return CREATOR;
        if (!(target instanceof TdApi.ChatMemberStatusMember) && !(target instanceof TdApi.ChatMemberStatusAdministrator)) return OUTSIDE;
        if (!mayRemove(self)) return NO_RIGHT;
        return null;
    }

    /** La restricción a plazos y permisos no existe en un básico: lo dice la schema, no una preferencia. */
    static String restrictProblem(TdApi.Chat chat) {
        return applicable(chat) ? NO_RESTRICT : null;
    }

    /** Promover y despromover se cortan igual: sin permisos que elegir, no hay edición de roles posible. */
    static String promoteProblem(TdApi.Chat chat) {
        return applicable(chat) ? NO_PROMOTE : null;
    }

    /**
     * Un plazo pedido en un básico es una promesa vacía: `bannedUntilDate` se ignora y el estado queda a
     * 0, así que se rechaza en vez de enviar un número que Telegram va a tirar.
     */
    static String durationProblem(TdApi.Chat chat, long requested) {
        return applicable(chat) && requested != 0 ? NO_DURATION : null;
    }

    /** Lo que realmente se manda: en un básico el plazo es siempre 0. */
    static int until(TdApi.Chat chat, long requested) {
        if (!applicable(chat)) return (int) Math.min(Integer.MAX_VALUE, Math.max(0, requested));
        return 0;
    }

    /**
     * `revokeMessages`: «Always true for supergroups and channels». Fuera de un básico la respuesta ya
     * está escrita, así que la pregunta solo tiene sentido aquí.
     */
    static boolean revokes(TdApi.Chat chat, boolean requested) {
        return applicable(chat) ? requested : true;
    }

    /** La frase del diálogo nativo de confirmación: dice qué pasa con los mensajes, sin rodeos. */
    static String confirm(String name, boolean revoke) {
        return "Se expulsará a " + name + " del grupo de forma definitiva. " + (revoke ? REVOKE_ON : REVOKE_OFF);
    }

    /** Devolver a alguien a un básico no es un desbaneo: es una invitación nueva, y ya existe para eso. */
    static String unbanProblem(TdApi.Chat chat) {
        return applicable(chat) ? UNBAN_HINT : null;
    }

    /** Una sola línea para la lista entera: qué admite un básico y qué no, antes de que se busque a ciegas. */
    static String scope() {
        return SCOPE;
    }
}
