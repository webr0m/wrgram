package cc.webrom.wrgram;

import static org.junit.Assert.*;

import java.util.ArrayList;
import java.util.List;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class InviteLinksPolicyTest {

    private static TdApi.ChatInviteLink link(String url, String name, int created, int expires, int limit, int members,
                                             boolean approval, boolean primary, boolean revoked, boolean paid) {
        return new TdApi.ChatInviteLink(url, name, 4242L, created, 0, expires,
                paid ? new TdApi.StarSubscriptionPricing(30, 100) : null,
                limit, members, 0, 3, approval, primary, revoked);
    }

    private static JSONArray rows(int count, int firstDate) throws Exception {
        JSONArray values = new JSONArray();
        for (int i = 0; i < count; i++) {
            values.put(InviteLinks.row(link("https://t.me/+code" + i, "enlace " + i, firstDate - i, 0, 0, 0, false, false, false, false)));
        }
        return values;
    }

    @Test public void rowProjectsOnlyWhatTelegramSaidAndNeverBreaksOnJunk() throws Exception {
        assertNull(InviteLinks.row(null));
        assertNull(InviteLinks.row(link("", "sin url", 10, 0, 0, 0, false, false, false, false)));
        assertNull(InviteLinks.row(link("https://t.me/" + "x".repeat(600), "larga", 10, 0, 0, 0, false, false, false, false)));
        JSONObject row = InviteLinks.row(link("https://t.me/+abcDEF", "Reunión de vecinos", 1700000000, 1700099999, 25, 7, true, true, false, false));
        assertEquals("https://t.me/+abcDEF", row.getString("link"));
        assertEquals("el creador viaja en texto porque supera 53 bits", "4242", row.getString("creator"));
        assertEquals(1700000000, row.getInt("created"));
        assertEquals(1700099999, row.getInt("expires"));
        assertEquals(25, row.getInt("memberLimit"));
        assertEquals(7, row.getInt("memberCount"));
        assertEquals(3, row.getInt("pending"));
        assertTrue(row.getBoolean("approval"));
        assertTrue(row.getBoolean("primary"));
        assertFalse(row.getBoolean("revoked"));
        assertFalse(row.getBoolean("paid"));
    }

    @Test public void rowClampsNegativeCountersCutsNamesAndFlagsPaidLinks() throws Exception {
        TdApi.ChatInviteLink raw = link("https://t.me/+x", "n".repeat(60), 0, 0, -5, -9, false, false, false, true);
        raw.date = -10;
        raw.editDate = -3;
        raw.memberCount = -4;
        raw.pendingJoinRequestCount = -2;
        JSONObject row = InviteLinks.row(raw);
        assertEquals("Telegram nunca da negativos; se anclan a cero", 0, row.getInt("memberLimit"));
        assertEquals(0, row.getInt("memberCount"));
        assertEquals(0, row.getInt("pending"));
        assertEquals(0, row.getInt("created"));
        assertEquals(0, row.getInt("edited"));
        assertEquals("el nombre de un enlace no pasa de 32", 32, row.getString("name").length());
        assertTrue(InviteLinks.row(link("https://t.me/+x", "s", 1, 0, 0, 0, false, false, false, true)).getBoolean("paid"));
    }

    @Test public void cursorRoundTripsUrlsThatContainColons() throws Exception {
        assertNull(InviteLinks.cursor(""));
        assertNull(InviteLinks.cursor(null));
        String url = "https://t.me/+Z9_abc";
        InviteLinks.Cursor cursor = InviteLinks.cursor(InviteLinks.token(1700000000, url));
        assertEquals(1700000000, cursor.date);
        assertEquals("el primer dos puntos separa la fecha: el resto es la url", url, cursor.link);
    }

    @Test public void malformedCursorsAreRejectedInsteadOfResentToTelegram() {
        List<String> junk = new ArrayList<>();
        junk.add("1700000000");
        junk.add(":https://t.me/+a");
        junk.add("1700000000:");
        junk.add("-1:https://t.me/+a");
        junk.add("abc:https://t.me/+a");
        junk.add("12345678901:https://t.me/+a");
        junk.add("1700000000:https://t.me/+a b");
        junk.add("1700000000: " + "y".repeat(600));
        for (String value : junk) {
            try {
                InviteLinks.cursor(value);
                fail("marcador aceptado por error: " + value);
            } catch (IllegalArgumentException expected) {
                assertTrue(expected.getMessage().contains("marcador"));
            }
        }
    }

    @Test public void onlyRealInviteUrlsReachTheWriteHandlers() {
        assertTrue(InviteLinks.validUrl("https://t.me/+abcDEF"));
        assertTrue(InviteLinks.validUrl("https://t.me/joinchat/AAAAAEsometoken"));
        assertTrue("el enlace principal de un chat público es su nombre de usuario", InviteLinks.validUrl("https://t.me/WRGram"));
        assertTrue(InviteLinks.validUrl("https://telegram.dog/+abcDEF"));
        assertTrue(InviteLinks.validUrl("tg://join?invite=ABCdef"));
        assertFalse(InviteLinks.validUrl(null));
        assertFalse(InviteLinks.validUrl(""));
        assertFalse(InviteLinks.validUrl("   "));
        assertFalse("sin esquema puede ser cualquier cosa", InviteLinks.validUrl("t.me/+abc"));
        assertFalse("un dominio ajeno no se envía nunca al puente de escritura", InviteLinks.validUrl("https://evil.test/+abc"));
        assertFalse(InviteLinks.validUrl("https://t.me.evil.test/+abc"));
        assertFalse(InviteLinks.validUrl("http://t.me/+abc"));
        assertFalse(InviteLinks.validUrl("https://t.me/"));
        assertFalse(InviteLinks.validUrl("https://t.me/+abc def"));
        assertFalse(InviteLinks.validUrl("https://t.me/+" + "z".repeat(600)));
    }

    @Test public void impossibleLinkSettingsAreRefusedBeforeTelegram() {
        assertNull(InviteLinks.problem("", 0, 0, false));
        assertNull(InviteLinks.problem("Reunión de vecinos", 86_400, 50, false));
        assertNull("aprobar sin límite sí es una combinación válida", InviteLinks.problem("x", 0, 0, true));
        assertNull("un año exacto lo admite", InviteLinks.problem("x", InviteLinks.MAX_SPAN, 0, false));
        assertNotNull(InviteLinks.problem(null, 0, 0, false));
        assertNotNull(InviteLinks.problem("n".repeat(33), 0, 0, false));
        assertNotNull(InviteLinks.problem("x", -1, 0, false));
        assertNotNull(InviteLinks.problem("x", InviteLinks.MAX_SPAN + 1L, 0, false));
        assertNotNull(InviteLinks.problem("x", 0, -1, false));
        assertNotNull(InviteLinks.problem("x", 0, 100_000, false));
        assertEquals("Un enlace que exige aprobación no puede limitar además el número de miembros.",
                InviteLinks.problem("x", 0, 10, true));
    }

    @Test public void expirationIsAbsoluteAndNeverPastTheAllowedSpan() {
        assertEquals("0 significa sin caducidad", 0, InviteLinks.expiration(1_700_000_000L, 0));
        assertEquals(1_700_003_600, InviteLinks.expiration(1_700_000_000L, 3_600));
        assertEquals(1_700_000_000 + InviteLinks.MAX_SPAN, InviteLinks.expiration(1_700_000_000L, InviteLinks.MAX_SPAN));
        try {
            InviteLinks.expiration(1_700_000_000L, InviteLinks.MAX_SPAN + 1L);
            fail("se admitió una caducidad fuera de rango");
        } catch (IllegalArgumentException expected) {
            assertTrue(expected.getMessage().contains("año"));
        }
    }

    @Test public void pageOnlyPromisesAnotherPageWhenThisOneIsFull() throws Exception {
        JSONObject empty = InviteLinks.page(new JSONArray(), 12, false);
        assertEquals(12, empty.getInt("total"));
        assertFalse(empty.getBoolean("next"));
        assertFalse("una página vacía no puede dar marcador", empty.has("cursor"));
        assertFalse(empty.getBoolean("revoked"));
        assertTrue(InviteLinks.page(null, 0, true).getBoolean("revoked"));
        assertEquals("un total negativo no se muestra", 0, InviteLinks.page(null, -7, false).getInt("total"));

        JSONObject partial = InviteLinks.page(rows(7, 1_700_000_000), 7, false);
        assertFalse(partial.getBoolean("next"));
        assertFalse(partial.has("cursor"));

        JSONObject full = InviteLinks.page(rows(InviteLinks.PAGE, 1_700_000_000), 41, false);
        assertEquals(41, full.getInt("total"));
        assertTrue(full.getBoolean("next"));
        InviteLinks.Cursor next = InviteLinks.cursor(full.getString("cursor"));
        assertEquals("el marcador sale del último elemento devuelto", 1_700_000_000 - (InviteLinks.PAGE - 1), next.date);
        assertEquals("https://t.me/+code" + (InviteLinks.PAGE - 1), next.link);
    }

    @Test public void primarySubscriptionAndRevokedLinksAreNotEditable() {
        assertTrue(InviteLinks.editable(link("https://t.me/+a", "normal", 10, 0, 0, 0, false, false, false, false)));
        assertFalse(InviteLinks.editable(null));
        assertFalse("el principal no admite nombre ni límites", InviteLinks.editable(link("https://t.me/+a", "p", 10, 0, 0, 0, false, true, false, false)));
        assertFalse(InviteLinks.editable(link("https://t.me/+a", "s", 10, 0, 0, 0, false, false, false, true)));
        assertFalse(InviteLinks.editable(link("https://t.me/+a", "r", 10, 0, 0, 0, false, false, true, false)));
    }
}
