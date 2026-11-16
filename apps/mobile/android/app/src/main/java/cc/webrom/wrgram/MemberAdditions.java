package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * Añadir gente a un grupo parece sencillo y no lo es: TDLib documenta que `AddChatMember` «requiere el
 * permiso canInviteUsers», que no se puede añadir a privados ni secretos, que el `forwardLimit` solo
 * vale en grupos básicos y que la respuesta buena *no* dice quién entró —dice quiénes NO entraron, en
 * `FailedToAddMembers`, y con solo dos señales legibles: dos banderitas de Premium—. Además el objeto
 * `BasicGroup` de la propia schema dice «0-200 users», así que llenarlo es imposible sin preguntar.
 * Antes de esta clase el puente solo usaba `AddChatMember` para meter bots como administradores, y la
 * interfaz no ofrecía añadir personas normales: el botón no existía. Aquí viven las reglas escritas una
 * vez, con las palabras exactas que el puente, la interfaz y la vista de diseño repiten; el resto —si
 * Telegram acepta o no— lo contesta Telegram, y nunca se maquilla un «añadido» que nadie confirmó.
 */
final class MemberAdditions {
    /** La schema de TDLib describe `BasicGroup` como «a basic group of 0-200 users». */
    static final int BASIC_LIMIT = 200;
    /** `AddChatMember` es de uno en uno: un lote enorme sería una cola interminable sin respuesta. */
    static final int MAX_BATCH = 20;
    /** `forward_limit` está acotado por la propia schema: «up to 100». */
    static final int MAX_FORWARD = 100;

    static final String UNSUPPORTED = "Solo en grupos se añade a otras personas; en un privado o un secreto Telegram decide quién está.";
    static final String MIGRATED = "Ese grupo se convirtió en supergrupo; añade a las personas desde el chat nuevo.";
    static final String BANNED = "Telegram tiene bloqueada esta cuenta en el grupo: no puede invitar a nadie.";
    static final String OUTSIDE = "Primero tienes que estar dentro del grupo para invitar a alguien.";
    static final String NO_RIGHT = "Telegram no concede a esta cuenta permiso para invitar en este grupo.";
    static final String FULL = "Un grupo básico llega hasta 200 miembros y ya está lleno; Telegram lo convierte en supergrupo antes de admitir más.";
    static final String EMPTY = "Elige al menos una persona para añadir.";
    static final String TOO_MANY = "Telegram añade de una en una: selecciona hasta 20 personas por vez.";
    static final String BAD_ID = "Alguna de las personas elegidas no tiene un identificador de Telegram válido.";
    static final String BAD_FORWARD = "Los mensajes que ve al entrar tienen que ser entre 0 y 100.";
    static final String PREMIUM_WOULD_ALLOW = "Telegram solo permite invitar a esta persona con una cuenta con Telegram Premium.";
    static final String PREMIUM_REQUIRED = "Este chat exige Telegram Premium para enviar el enlace a esta persona.";
    static final String FAILED = "Telegram no añadió a esta persona.";
    static final String UNCONFIRMED = "Telegram respondió pero no confirmó la membresía; revisa la lista antes de repetir.";
    static final String CANCELLED_NOTICE = "Cancelado: nadie fue añadido.";

    /** Telegram lo puso dentro. */
    static final String ADDED = "added";
    /** `FailedToAddMembers` lo nombró: no entró, y hay un motivo que se puede decir. */
    static final String REJECTED = "rejected";
    /** Nada confirmado: ni dentro ni nombrado en el rechazo. */
    static final String UNCLEAR = "unclear";
    /** La persona cerró el diálogo nativo: no se envió nada y eso se dice solo, sin inventar tanda. */
    static final String CANCELLED = "cancelled";

    private MemberAdditions() {}

    static boolean basic(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeBasicGroup;
    }

    static boolean supergroup(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeSupergroup;
    }

    /** Privados y secretos quedan fuera por contrato de la propia schema de `AddChatMember`. */
    static boolean applicable(TdApi.Chat chat) {
        return basic(chat) || supergroup(chat);
    }

    /** `forward_limit` «is ignored for supergroups and channels», así que no se ofrece ni se envía. */
    static boolean forwardsHistory(TdApi.Chat chat) {
        return basic(chat);
    }

    /** El estado propio no está en `Chat`; lo dice `GetChatMember` sobre la propia cuenta. */
    static boolean inside(TdApi.ChatMemberStatus status) {
        return ChatMembership.inside(status);
    }

    static boolean blocked(TdApi.ChatMemberStatus status) {
        return ChatMembership.blocked(status);
    }

    /**
     * Quién puede invitar, según lo que TDLib pone negro sobre blanco: creador, administrador con
     * `canInviteUsers` y miembro restringido cuyo permiso de invitación sigue en pie. En un grupo
     * básico cualquier miembro de dentro puede invitar —así lo describe Telegram en sus clientes—; si
     * el servidor lo rechaza, el rechazo se cuenta tal cual, no se inventa un permiso.
     */
    static boolean mayInvite(TdApi.Chat chat, TdApi.ChatMemberStatus self) {
        if (self instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) self).isMember;
        if (self instanceof TdApi.ChatMemberStatusAdministrator) {
            TdApi.ChatAdministratorRights rights = ((TdApi.ChatMemberStatusAdministrator) self).rights;
            return rights != null && rights.canInviteUsers;
        }
        if (self instanceof TdApi.ChatMemberStatusRestricted) {
            TdApi.ChatMemberStatusRestricted who = (TdApi.ChatMemberStatusRestricted) self;
            return who.isMember && who.permissions != null && who.permissions.canInviteUsers;
        }
        return self instanceof TdApi.ChatMemberStatusMember && basic(chat);
    }

    /**
     * Null si la operación tiene sentido; si no, el motivo en español. `migratedTo` es el
     * `upgraded_to_supergroup_id` del grupo básico y `memberCount` viene de la schema (`-1` = no se sabe).
     */
    static String problem(TdApi.Chat chat, long migratedTo, int memberCount, TdApi.ChatMemberStatus self) {
        if (!applicable(chat)) return UNSUPPORTED;
        if (migratedTo != 0) return MIGRATED;
        if (blocked(self)) return BANNED;
        if (!inside(self)) return OUTSIDE;
        if (!mayInvite(chat, self)) return NO_RIGHT;
        if (basic(chat) && memberCount >= BASIC_LIMIT) return FULL;
        return null;
    }

    /** Falta de lista o lista demasiado larga; el puente ya habrá cortado identificadores basura. */
    static String batch(int count) {
        if (count <= 0) return EMPTY;
        if (count > MAX_BATCH) return TOO_MANY;
        return null;
    }

    /** Identificador de usuario escrito como texto: dígitos sueltos y mayores que cero. */
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

    /**
     * Lo que realmente se manda a Telegram: fuera de un grupo básico el campo se ignora, y mandarlo
     * lleno sería prometer un historial que el nuevo miembro no va a recibir.
     */
    static int forward(TdApi.Chat chat, int requested) {
        if (!forwardsHistory(chat) || requested <= 0) return 0;
        return Math.min(requested, MAX_FORWARD);
    }

    static String forwardProblem(int requested) {
        return requested < 0 || requested > MAX_FORWARD ? BAD_FORWARD : null;
    }

    /**
     * La respuesta de `AddChatMember` nombra a los que NO entraron. Si la persona está en esa lista,
     * ahí está el motivo legible; si no está, todavía hay que confirmar la membresía con `GetChatMember`.
     */
    static TdApi.FailedToAddMember named(TdApi.FailedToAddMembers result, long userId) {
        if (result == null || result.failedToAddMembers == null) return null;
        for (TdApi.FailedToAddMember item : result.failedToAddMembers) {
            if (item != null && item.userId == userId) return item;
        }
        return null;
    }

    /** Las dos únicas razones que la schema sabe decir; si no, se dice el rechazo sin adornos. */
    static String reason(TdApi.FailedToAddMember failed) {
        if (failed == null) return FAILED;
        if (failed.premiumRequiredToSendMessages) return PREMIUM_REQUIRED;
        if (failed.premiumWouldAllowInvite) return PREMIUM_WOULD_ALLOW;
        return FAILED;
    }

    /**
     * Estado final de una persona: rechazada si Telegram la nombró, añadida solo si `GetChatMember` la
     * muestra dentro, y «sin confirmar» en cualquier otro caso. No hay cuarta salida ni optimismo.
     */
    static String outcome(TdApi.FailedToAddMember failed, TdApi.ChatMemberStatus after) {
        if (failed != null) return REJECTED;
        return inside(after) ? ADDED : UNCLEAR;
    }
}
