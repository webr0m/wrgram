package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class SafetySignalsPolicyTest {

    private static TdApi.Chat chat(TdApi.ChatActionBar bar) {
        TdApi.Chat chat = new TdApi.Chat();
        chat.actionBar = bar;
        chat.canBeReported = true;
        return chat;
    }

    private static TdApi.VerificationStatus status(boolean verified, boolean scam, boolean fake) {
        return new TdApi.VerificationStatus(verified, scam, fake, 0L);
    }

    private static TdApi.User contact() {
        TdApi.User user = new TdApi.User();
        user.isContact = true;
        return user;
    }

    private static String[] ids(JSONArray list) throws Exception {
        String[] values = new String[list.length()];
        for (int i = 0; i < list.length(); i++) values[i] = list.getJSONObject(i).getString("id");
        return values;
    }

    @Test public void noActionBarMeansNoNoticeAtAll() throws Exception {
        assertNull(SafetySignals.notice(null));
        assertNull("sin barra no hay aviso que inventar", SafetySignals.notice(new TdApi.Chat()));
        assertFalse(SafetySignals.dismissible(new TdApi.Chat()));
        assertFalse(SafetySignals.dismissible((TdApi.Chat) null));
    }

    @Test public void eachTelegramBarKeepsItsOwnMeaning() throws Exception {
        assertEquals("spam", SafetySignals.notice(chat(new TdApi.ChatActionBarReportSpam(false))).getString("kind"));
        assertEquals("warn", SafetySignals.notice(chat(new TdApi.ChatActionBarReportSpam(true))).getString("tone"));
        assertTrue(SafetySignals.notice(chat(new TdApi.ChatActionBarReportSpam(true))).getBoolean("canUnarchive"));
        assertEquals("unknown", SafetySignals.notice(chat(new TdApi.ChatActionBarReportAddBlock(false, null))).getString("kind"));
        assertEquals("invite", SafetySignals.notice(chat(new TdApi.ChatActionBarInviteMembers())).getString("kind"));
        assertEquals("contact", SafetySignals.notice(chat(new TdApi.ChatActionBarAddContact())).getString("kind"));
        assertEquals("phone", SafetySignals.notice(chat(new TdApi.ChatActionBarSharePhoneNumber())).getString("kind"));
        assertEquals("join", SafetySignals.notice(chat(new TdApi.ChatActionBarJoinRequest("WRGram", true, 100))).getString("kind"));
    }

    @Test public void anUnknownBarIsIgnoredInsteadOfGuessed() throws Exception {
        TdApi.ChatActionBar future = new TdApi.ChatActionBar() {
            @Override public int getConstructor() { return 1234567; }
        };
        assertNull("mejor callar que describir una barra desconocida", SafetySignals.notice(chat(future)));
        assertFalse(SafetySignals.dismissible(future));
    }

    @Test public void unarchiveFlagComesFromTheBarNotFromTheUi() throws Exception {
        assertFalse(SafetySignals.notice(chat(new TdApi.ChatActionBarReportSpam(false))).getBoolean("canUnarchive"));
        assertTrue(SafetySignals.notice(chat(new TdApi.ChatActionBarReportAddBlock(true, null))).getBoolean("canUnarchive"));
        assertFalse("las barras informativas no prometen un archivado que Telegram no hizo",
                SafetySignals.notice(chat(new TdApi.ChatActionBarAddContact())).has("canUnarchive"));
        assertFalse("el permiso de denuncia pertenece al chat, no al aviso",
                SafetySignals.notice(chat(new TdApi.ChatActionBarReportSpam(true))).has("canReport"));
    }

    @Test public void onlyTelegramBarsCanBeDismissedAndOnlyTheTwoWarnings() throws Exception {
        assertTrue(SafetySignals.dismissible(new TdApi.ChatActionBarReportSpam(false)));
        assertTrue(SafetySignals.dismissible(new TdApi.ChatActionBarReportAddBlock(false, null)));
        assertFalse(SafetySignals.dismissible(new TdApi.ChatActionBarInviteMembers()));
        assertFalse(SafetySignals.dismissible(new TdApi.ChatActionBarAddContact()));
        assertFalse(SafetySignals.dismissible(new TdApi.ChatActionBarSharePhoneNumber()));
        assertFalse("el aviso de solicitud pendiente refleja estado real: no se puede ocultar",
                SafetySignals.dismissible(new TdApi.ChatActionBarJoinRequest("g", false, 1)));
    }

    @Test public void registrationDateOnlyWhenTelegramGaveARealMonth() throws Exception {
        assertNull(SafetySignals.registered(null));
        assertEquals("2024-03", SafetySignals.registered(new TdApi.AccountInfo(3, 2024, "CL", 0, 0)));
        assertEquals("1970-01", SafetySignals.registered(new TdApi.AccountInfo(1, 1970, "", 0, 0)));
        assertEquals("2024-12", SafetySignals.registered(new TdApi.AccountInfo(12, 2024, "", 0, 0)));
        assertNull("mes fuera de rango", SafetySignals.registered(new TdApi.AccountInfo(13, 2024, "", 0, 0)));
        assertNull(SafetySignals.registered(new TdApi.AccountInfo(0, 2024, "", 0, 0)));
        assertNull(SafetySignals.registered(new TdApi.AccountInfo(5, 1969, "", 0, 0)));
        assertEquals("1999-05", SafetySignals.notice(chat(new TdApi.ChatActionBarReportAddBlock(false,
                new TdApi.AccountInfo(5, 1999, "", 0, 0)))).getString("registered"));
        assertFalse("sin datos de cuenta no se muestra registro",
                SafetySignals.notice(chat(new TdApi.ChatActionBarReportAddBlock(false, null))).has("registered"));
    }

    @Test public void joinNoticeKeepsTheFactsTelegramSent() throws Exception {
        StringBuilder wide = new StringBuilder();
        for (int i = 0; i < 200; i++) wide.append('c');
        JSONObject notice = SafetySignals.notice(chat(new TdApi.ChatActionBarJoinRequest(wide.toString(), true, -9)));
        assertEquals(80, notice.getString("title").length());
        assertEquals("una fecha negativa no viaja a la interfaz", 0, notice.getInt("date"));
        assertTrue(notice.getBoolean("channel"));
        TdApi.ChatActionBarJoinRequest bare = new TdApi.ChatActionBarJoinRequest();
        bare.title = null;
        assertEquals("", SafetySignals.notice(chat(bare)).getString("title"));
    }

    @Test public void verificationSignalsComeOnlyFromTelegram() throws Exception {
        TdApi.User user = contact();
        user.verificationStatus = status(true, false, false);
        assertArrayEquals("una cuenta verificada no es una cuenta segura",
                new String[] {"verified"}, ids(SafetySignals.signals(null, user, null, null)));
        user.verificationStatus = status(false, true, true);
        assertArrayEquals(new String[] {"scam", "fake"}, ids(SafetySignals.signals(null, user, null, null)));
        user.verificationStatus = null;
        assertEquals("sin verificación no hay ninguna insignia", 0, SafetySignals.signals(null, user, null, null).length());
        TdApi.Supergroup group = new TdApi.Supergroup();
        group.verificationStatus = status(true, false, false);
        assertArrayEquals(new String[] {"verified"}, ids(SafetySignals.signals(null, null, null, group)));
    }

    @Test public void restrictionsAreQuotedFromTelegramWithALimit() throws Exception {
        TdApi.User user = contact();
        StringBuilder reason = new StringBuilder("   ");
        for (int i = 0; i < 200; i++) reason.append('x');
        user.restrictionInfo = new TdApi.RestrictionInfo(reason.toString(), false);
        JSONArray list = SafetySignals.signals(null, user, null, null);
        assertEquals("restricted", list.getJSONObject(0).getString("id"));
        assertEquals("bad", list.getJSONObject(0).getString("tone"));
        assertEquals("el motivo se cita tal cual, recortado", 140, list.getJSONObject(0).getString("value").length());
        user.restrictionInfo = new TdApi.RestrictionInfo("   ", false);
        assertEquals("un motivo vacío no es una señal", 0, SafetySignals.signals(null, user, null, null).length());
    }

    @Test public void privateSignalsKeepSeverityOrder() throws Exception {
        TdApi.User user = new TdApi.User();
        user.verificationStatus = status(true, true, false);
        user.restrictsNewChats = true;
        user.type = new TdApi.UserTypeDeleted();
        TdApi.UserFullInfo full = new TdApi.UserFullInfo();
        full.usesUnofficialApp = true;
        full.hasPrivateForwards = true;
        full.groupInCommonCount = 4;
        TdApi.Chat chat = new TdApi.Chat();
        chat.hasProtectedContent = true;
        assertArrayEquals(new String[] {"scam", "verified", "deleted", "restrictsNewChats", "notContact",
                "unofficialApp", "privateForwards", "commonGroups", "protectedContent"},
                ids(SafetySignals.signals(chat, user, full, null)));
        assertEquals("4", SafetySignals.signals(chat, user, full, null).getJSONObject(7).getString("value"));
        user.isContact = true;
        assertEquals("un contacto propio no genera sospecha", -1,
                String.join(",", ids(SafetySignals.signals(chat, user, full, null))).indexOf("notContact"));
    }

    @Test public void channelSignalsDescribeHowTelegramSendsTheMessages() throws Exception {
        TdApi.Supergroup channel = new TdApi.Supergroup();
        channel.isChannel = true;
        channel.showMessageSender = false;
        channel.signMessages = true;
        channel.joinByRequest = true;
        channel.joinToSendMessages = true;
        assertArrayEquals(new String[] {"anonymousSenders", "signMessages", "joinByRequest", "joinToSend"},
                ids(SafetySignals.signals(null, null, null, channel)));
        channel.isChannel = false;
        assertArrayEquals("un grupo normal no publica de forma anónima",
                new String[] {"signMessages", "joinByRequest", "joinToSend"},
                ids(SafetySignals.signals(null, null, null, channel)));
        assertEquals(0, SafetySignals.signals(null, null, null, new TdApi.Supergroup()).length());
    }

    @Test public void theSignalListIsCappedAtTheMostSeriousTwelve() throws Exception {
        TdApi.Chat chat = new TdApi.Chat();
        chat.hasProtectedContent = true;
        TdApi.User user = new TdApi.User();
        user.verificationStatus = status(true, true, true);
        user.restrictionInfo = new TdApi.RestrictionInfo("censurado", false);
        user.restrictsNewChats = true;
        user.type = new TdApi.UserTypeDeleted();
        TdApi.UserFullInfo full = new TdApi.UserFullInfo();
        full.usesUnofficialApp = true;
        full.hasPrivateForwards = true;
        full.groupInCommonCount = 999999;
        TdApi.Supergroup group = new TdApi.Supergroup();
        group.isChannel = true;
        group.signMessages = true;
        group.joinByRequest = true;
        group.joinToSendMessages = true;
        JSONArray list = SafetySignals.signals(chat, user, full, group);
        assertEquals(SafetySignals.MAX_SIGNALS, list.length());
        assertEquals("scam", list.getJSONObject(0).getString("id"));
        assertEquals("999", list.getJSONObject(9).getString("value"));
        assertEquals("las señales informativas se quedan fuera antes que las graves", -1,
                String.join(",", ids(list)).indexOf("protectedContent"));
    }

    @Test public void absentObjectsProduceNothingInsteadOfCrashing() throws Exception {
        assertEquals(0, SafetySignals.signals(null, null, null, null).length());
        JSONArray list = SafetySignals.signals(null, new TdApi.User(), null, null);
        assertEquals(1, list.length());
        assertEquals("notContact", list.getJSONObject(0).getString("id"));
    }
}
