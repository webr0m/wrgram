package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/**
 * La regla con la que una persona deja de ser «Usuario de Telegram». Se escribe aquí porque las cuatro
 * superficies que pintan nombres (la burbuja, la lista de administradores, la del grupo básico y la pantalla de
 * llamada) tienen que decir lo mismo, y porque el respaldo viejo miraba `editableUsername`, que TDLib solo rellena
 * con la cuenta propia: para cualquier otra persona daba vacío y el relleno se comía el nombre.
 */
public class PersonNamePolicyTest {
    private static TdApi.User user(String first, String last, String[] active, String editable) {
        TdApi.User value = new TdApi.User();
        value.firstName = first;
        value.lastName = last;
        if (active != null || editable != null) value.usernames = new TdApi.Usernames(active, null, editable, null, null);
        return value;
    }

    @Test
    public void nothingKnownIsNothingToSay() {
        assertNull(PersonName.of(null));
        assertNull(PersonName.of(user(null, null, null, null)));
        assertNull(PersonName.username(null));
        assertNull(PersonName.username(user("Ada", null, null, null)));
        assertNull(PersonName.of(user("  ", "   ", new String[0], "")));
    }

    @Test
    public void theTwoNamesJoinAndTrim() {
        assertEquals("Ada Lovelace", PersonName.of(user("Ada", "Lovelace", null, null)));
        assertEquals("Ada", PersonName.of(user("Ada", null, null, null)));
        assertEquals("Ada", PersonName.of(user(" Ada ", "", new String[]{"ada"}, null)));
    }

    @Test
    public void anActiveUsernameSavesThePersonWithoutNames() {
        assertEquals("@ada_lovelace", PersonName.of(user(null, null, new String[]{"ada_lovelace"}, null)));
        assertEquals("@primero", PersonName.of(user("", "", new String[]{"primero", "segundo"}, null)));
    }

    @Test
    public void theChosenUsernameComesFirst() {
        assertEquals("@propio", PersonName.of(user(null, null, new String[]{"ajeno"}, "propio")));
        // `editableUsername` llega a veces como cadena vacía: no es un nombre, no hay que pintarlo.
        assertEquals("@activo", PersonName.of(user(null, null, new String[]{"activo"}, "")));
    }

    @Test
    public void namesAreCappedLikeTheRosterCapsThem() {
        StringBuilder longName = new StringBuilder();
        for (int index = 0; index < 120; index++) longName.append('n');
        assertEquals(longName.substring(0, 90) + "…", PersonName.of(user(longName.toString(), null, null, null)));
        StringBuilder longHandle = new StringBuilder();
        for (int index = 0; index < 120; index++) longHandle.append('h');
        assertEquals("@" + longHandle.substring(0, 89) + "…", PersonName.of(user(null, null, new String[]{longHandle.toString()}, null)));
    }
}
