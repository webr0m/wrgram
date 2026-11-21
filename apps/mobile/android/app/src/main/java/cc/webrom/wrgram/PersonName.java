package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * Cómo se llama a una persona cuando Telegram no ha dado más que su identificador.
 *
 * La regla es la misma en las cuatro superficies que pintan nombres —la burbuja del mensaje, la lista de
 * administradores, la de un grupo básico y la pantalla de llamada—: primero el nombre con el apellido y, si no los
 * hay, el usuario público con arroba. El campo `editableUsername` no sirve como respaldo porque TDLib solo lo
 * rellena con la cuenta propia; preguntar por él deja sin nombre a todo el mundo menos a ti.
 *
 * Devuelve `null` cuando no hay nada que decir. La palabra de relleno la decide quien llama: cada capa ya la
 * tiene escrita, contada una sola vez y anclada en sus pruebas.
 */
final class PersonName {
    private PersonName() { }

    static String of(TdApi.User user) {
        if (user == null) return null;
        String name = NativeSnapshot.limit(join(user.firstName, user.lastName), 90);
        if (!name.isEmpty()) return name;
        String username = username(user);
        return username == null ? null : NativeSnapshot.limit("@" + username, 90);
    }

    /** El usuario que se ve: el editable manda porque es el que la propia cuenta eligió, y si no hay, el primero activo. */
    static String username(TdApi.User user) {
        if (user == null || user.usernames == null) return null;
        if (user.usernames.editableUsername != null && !user.usernames.editableUsername.isEmpty()) return user.usernames.editableUsername;
        return user.usernames.activeUsernames != null && user.usernames.activeUsernames.length > 0 ? user.usernames.activeUsernames[0] : null;
    }

    private static String join(String first, String last) {
        return ((first == null ? "" : first) + " " + (last == null ? "" : last)).trim();
    }
}
