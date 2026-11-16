package cc.webrom.wrgram;

import java.util.Arrays;
import java.util.Comparator;
import java.util.Locale;

import org.drinkless.tdlib.TdApi;

/**
 * La ronda P pudo meter gente en un grupo básico, pero nadie podía mirar después quién estaba dentro:
 * `GetSupergroupMembers` no sirve aquí y TDLib solo responde `SearchChatMembers` en supergrupos, así que
 * la única ventana era el informe de la tanda. `GetBasicGroupFullInfo` sí devuelve la lista entera —la
 * propia schema limita el básico a 200, cabe de una vez—, pero no dice el orden ni traduce los estados, y
 * un miembro que se fue sigue apareciendo con su `ChatMemberStatusLeft`. Aquí viven esas reglas escritas
 * una vez: qué se puede listar, cómo se llama cada estado, en qué orden se presenta y qué se puede prometer
 * de la lista. La clase no toca la sesión ni TDLib en vivo: el nombre de cada persona lo pone el puente,
 * porque solo `GetBasicGroupFullInfo` y la caché de usuarios lo saben.
 */
final class BasicGroupRoster {
    /** Un grupo básico no pasa de 200, así que la lista cabe en una sola respuesta: no hay paginación. */
    static final int MAX = MemberAdditions.BASIC_LIMIT;
    /** La búsqueda local admite hasta 80 caracteres, el mismo techo que la de supergrupos. */
    static final int MAX_QUERY = 80;

    static final String UNSUPPORTED = "La lista entera de un chat solo la da Telegram en los grupos básicos; en supergrupos y canales se pide por páginas.";
    static final String EMPTY = "Telegram no devolvió ninguna persona en la lista de este grupo básico.";
    static final String NO_CREATOR = "Telegram no dice quién creó este grupo.";
    static final String ORDER = "Primero van quien creó el grupo y la administración; el resto se ordena por identificador, no por actividad reciente.";
    static final String TOO_LONG = "La búsqueda de miembros admite hasta 80 caracteres.";

    static final String CREATOR = "Propietario";
    static final String ADMIN = "Administrador";
    static final String MEMBER = "Miembro";
    static final String RESTRICTED = "Restringido";
    static final String LEFT = "Salió";
    static final String BANNED = "Baneado";
    static final String UNKNOWN = "Sin estado";

    private BasicGroupRoster() {}

    /** Solo los básicos se listan de una vez: es el único chat cuya lista entera da este método. */
    static boolean applicable(TdApi.Chat chat) {
        return chat != null && chat.type instanceof TdApi.ChatTypeBasicGroup;
    }

    static long groupId(TdApi.Chat chat) {
        return applicable(chat) ? ((TdApi.ChatTypeBasicGroup) chat.type).basicGroupId : 0L;
    }

    /** Un chat puede traer otros remitentes; aquí solo se listan personas. */
    static boolean visible(TdApi.ChatMember member) {
        return member != null && member.memberId instanceof TdApi.MessageSenderUser;
    }

    static long userId(TdApi.ChatMember member) {
        return visible(member) ? ((TdApi.MessageSenderUser) member.memberId).userId : 0L;
    }

    /** El estado dicho por TDLib, con palabras que la persona puede leer. Un estado nuevo no se disfraza. */
    static String status(TdApi.ChatMemberStatus status) {
        if (status instanceof TdApi.ChatMemberStatusCreator) return CREATOR;
        if (status instanceof TdApi.ChatMemberStatusAdministrator) return ADMIN;
        if (status instanceof TdApi.ChatMemberStatusRestricted) return RESTRICTED;
        if (status instanceof TdApi.ChatMemberStatusMember) return MEMBER;
        if (status instanceof TdApi.ChatMemberStatusLeft) return LEFT;
        if (status instanceof TdApi.ChatMemberStatusBanned) return BANNED;
        return UNKNOWN;
    }

    /** El orden es nuestro y se dice como tal: creador dentro, administración, el resto dentro, fuera y desconocidos. */
    static int rank(TdApi.ChatMemberStatus status) {
        if (status instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) status).isMember ? 0 : 3;
        if (status instanceof TdApi.ChatMemberStatusAdministrator) return 1;
        if (ChatMembership.inside(status)) return 2;
        return status == null ? 4 : 3;
    }

    /** Devuelve la lista ordenada sin tocar la que dio TDLib; los identificadores empatados quedan estables. */
    static TdApi.ChatMember[] order(TdApi.ChatMember[] members) {
        if (members == null) return new TdApi.ChatMember[0];
        TdApi.ChatMember[] copy = members.clone();
        Arrays.sort(copy, Comparator
            .comparingInt((TdApi.ChatMember member) -> rank(member == null ? null : member.status))
            .thenComparingLong(BasicGroupRoster::userId));
        return copy;
    }

    /** Cuántos siguen dentro: `Left`, `Banned` y un estado raro no cuentan, igual que en la regla de ingreso. */
    static int inside(TdApi.ChatMember[] members) {
        if (members == null) return 0;
        int count = 0;
        for (TdApi.ChatMember member : members) if (visible(member) && ChatMembership.inside(member.status)) count++;
        return count;
    }

    static boolean tooLong(String query) {
        return query != null && query.trim().length() > MAX_QUERY;
    }

    /** Búsqueda local, en minúsculas y sobre nombre o usuario: la lista ya está en el dispositivo. */
    static boolean matches(String query, String name, String username) {
        String needle = query == null ? "" : query.trim().toLowerCase(Locale.ROOT);
        if (needle.isEmpty()) return true;
        if (name != null && name.toLowerCase(Locale.ROOT).contains(needle)) return true;
        return username != null && username.toLowerCase(Locale.ROOT).contains(needle);
    }

    /** Huecos que quedan, contados sobre la lista real y no sobre un número que la persona recuerde. */
    static int remaining(int inside) {
        return Math.max(0, MAX - inside);
    }

    /**
     * Lo que la lista puede prometer en una frase. Se dice el total devuelto y cuántos siguen dentro,
     * porque en un básico Telegram conserva a los que se fueron; mezclarlos daría una cifra de miembros
     * que no cuadra con la de `BasicGroup.member_count`.
     */
    static String note(long creatorId, int total, int inside) {
        if (total <= 0) return EMPTY;
        String head = total == 1
            ? "Telegram devolvió 1 persona de la lista completa del grupo; "
            : "Telegram devolvió " + total + " personas de la lista completa del grupo; ";
        String rest;
        if (inside == total) rest = inside == 1 ? "sigue dentro." : "todas siguen dentro.";
        else if (inside == 0) rest = "ninguna sigue dentro: los demás se fueron o fueron expulsados.";
        else rest = inside + " siguen dentro y " + (total - inside) + (total - inside == 1 ? " se fue o fue expulsada." : " se fueron o fueron expulsados.");
        return head + rest + (creatorId == 0 ? " " + NO_CREATOR : "");
    }

    /**
     * La firma de la invitación. `TdApi.ChatMember.inviterUserId` es un número, y pintar ese número en la
     * lista —«Invitado por 500»— era lo que esta regla viene a evitar: sin invitador, como le pasa a quien
     * creó el grupo, no hay nombre que decir y se responde la cadena vacía, que es lo que la pantalla mira
     * para no pintar la línea. Con invitador, el nombre es el que la caché de la sesión guarde de esa
     * persona, con su respaldo de siempre cuando Telegram ya no la describe.
     */
    static String invitedName(long inviterUserId, String name) {
        return inviterUserId == 0 ? "" : name;
    }
}
