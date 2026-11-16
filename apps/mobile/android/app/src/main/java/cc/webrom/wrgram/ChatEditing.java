package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * El nombre y la descripción de una comunidad son lo que ven todas las personas del chat, y
 * Telegram los valida con reglas distintas para cada campo y para cada tipo de grupo. Aquí viven
 * esas tres decisiones —dónde se puede cambiar, quién puede y qué acepta el servidor— para que el
 * puente las obedezca y la interfaz pueda pintar exactamente la misma frase con la que se rechaza.
 */
final class ChatEditing {
    static final int MAX_TITLE = 128;
    static final int MAX_DESCRIPTION = 255;

    private ChatEditing() {}

    /**
     * `setChatTitle` y `setChatDescription` están documentadas para grupos, supergrupos y canales.
     * Un privado, un secreto o Guardados no tienen título que editar: Telegram lo rechazaría y
     * renombrar a otra persona nunca fue la intención del campo.
     */
    static boolean supported(TdApi.Chat chat) {
        if (chat == null) return false;
        return chat.type instanceof TdApi.ChatTypeBasicGroup || chat.type instanceof TdApi.ChatTypeSupergroup;
    }

    /**
     * El derecho existe por tres caminos que no se pueden confundir. Un creador lo tiene mientras
     * siga dentro; un administrador lo tiene si su `rights` lo dice; y un miembro ordinario solo lo
     * tiene en un **grupo básico**, donde los permisos por defecto del chat son sus derechos reales.
     * En un supergrupo o canal esa misma lista describe lo que pueden los que escriben, no lo que
     * pueden administrar, así que ahí no se ofrece a quien no sea administrador: es mejor ocultar un
     * botón que Telegram rechazaría que preguntar y llevar a la persona a una confirmación en vano.
     */
    static boolean canChange(TdApi.Chat chat, TdApi.ChatMemberStatus status) {
        if (!supported(chat) || status == null) return false;
        if (status instanceof TdApi.ChatMemberStatusCreator) return ((TdApi.ChatMemberStatusCreator) status).isMember;
        if (status instanceof TdApi.ChatMemberStatusAdministrator) {
            TdApi.ChatAdministratorRights rights = ((TdApi.ChatMemberStatusAdministrator) status).rights;
            return rights != null && rights.canChangeInfo;
        }
        if (status instanceof TdApi.ChatMemberStatusRestricted) {
            TdApi.ChatMemberStatusRestricted restricted = (TdApi.ChatMemberStatusRestricted) status;
            if (!restricted.isMember) return false;
            TdApi.ChatPermissions defaults = chat.permissions;
            if (defaults != null && !defaults.canChangeInfo) return false;
            if (chat.type instanceof TdApi.ChatTypeSupergroup) return false;
            TdApi.ChatPermissions override = restricted.permissions;
            return override != null && override.canChangeInfo;
        }
        if (status instanceof TdApi.ChatMemberStatusMember) {
            if (chat.type instanceof TdApi.ChatTypeSupergroup) return false;
            return chat.permissions != null && chat.permissions.canChangeInfo;
        }
        return false;
    }

    /**
     * Lo que Telegram acepta, dicho en español y antes de escribir. Se comprueba **el texto que se
     * va a mandar**, bordes fuera, porque un título de espacios vacíos es un título vacío. Los
     * caracteres se cuentan como puntos Unicode: un emoji son dos `char` en Java y uno para
     * Telegram, y contarlos mal negaría un título que el servidor guarda sin queja.
     */
    static String problem(String field, String value) {
        String text = prepared(value);
        int length = text.codePointCount(0, text.length());
        if ("title".equals(field)) {
            if (length == 0) return "Telegram no guarda comunidades sin nombre: escribe un título de al menos un carácter.";
            if (length > MAX_TITLE) return "Telegram admite nombres de hasta " + MAX_TITLE + " caracteres.";
            return null;
        }
        if ("description".equals(field)) {
            if (length > MAX_DESCRIPTION) return "Telegram admite descripciones de hasta " + MAX_DESCRIPTION + " caracteres.";
            return null;
        }
        return "Ese campo no se puede cambiar desde WRGram.";
    }

    /** El texto que realmente llega a Telegram: sin bordes, y vacío solo donde vacío está permitido. */
    static String prepared(String value) {
        return value == null ? "" : value.trim();
    }
}
