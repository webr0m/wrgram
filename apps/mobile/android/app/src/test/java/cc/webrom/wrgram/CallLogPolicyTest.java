package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class CallLogPolicyTest {
    private static TdApi.Message oneToOne(long chat, long id, int date, TdApi.CallDiscardReason reason, boolean video, int seconds) {
        TdApi.MessageCall call = new TdApi.MessageCall();
        call.isVideo = video;
        call.discardReason = reason;
        call.duration = seconds;
        return of(chat, id, date, call);
    }

    private static TdApi.Message group(long chat, long id, int date, boolean missed, boolean active, boolean video, int seconds) {
        TdApi.MessageGroupCall call = new TdApi.MessageGroupCall();
        call.wasMissed = missed;
        call.isActive = active;
        call.isVideo = video;
        call.duration = seconds;
        return of(chat, id, date, call);
    }

    private static TdApi.Message of(long chat, long id, int date, TdApi.MessageContent content) {
        TdApi.Message message = new TdApi.Message();
        message.chatId = chat;
        message.id = id;
        message.date = date;
        message.content = content;
        return message;
    }

    @Test public void onlyTheTwoCallFamiliesAreRows() {
        assertTrue(CallLog.isCall(new TdApi.MessageCall()));
        assertTrue(CallLog.isCall(new TdApi.MessageGroupCall()));
        assertFalse(CallLog.isCall(new TdApi.MessageText()));
        assertFalse(CallLog.isCall(new TdApi.MessageVideoChatStarted()));
        assertFalse(CallLog.isCall(null));
    }

    @Test public void theServerFilterPutsDeclinesWithMisses() {
        assertTrue(CallLog.missed(new TdApi.CallDiscardReasonMissed()));
        assertTrue(CallLog.missed(new TdApi.CallDiscardReasonDeclined()));
        assertFalse(CallLog.missed(new TdApi.CallDiscardReasonHungUp()));
        assertFalse(CallLog.missed(new TdApi.CallDiscardReasonDisconnected()));
        assertFalse(CallLog.missed(new TdApi.CallDiscardReasonEmpty()));
        assertFalse(CallLog.missed((TdApi.CallDiscardReason) null));
    }

    @Test public void missedReadsTheReasonOrTheGroupFlag() {
        assertTrue(CallLog.missed(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonMissed(), false, 0)));
        assertTrue(CallLog.missed(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonDeclined(), false, 0)));
        assertFalse(CallLog.missed(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonHungUp(), false, 42)));
        assertTrue(CallLog.missed(group(8, 4, 100, true, false, true, 0)));
        assertFalse(CallLog.missed(group(8, 4, 100, false, true, true, 0)));
        assertFalse(CallLog.missed((TdApi.Message) null));
        assertFalse(CallLog.missed(of(9, 5, 100, new TdApi.MessageText())));
    }

    @Test public void videoComesFromTheCallItself() {
        assertTrue(CallLog.video(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonHungUp(), true, 12)));
        assertFalse(CallLog.video(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonHungUp(), false, 12)));
        assertTrue(CallLog.video(group(8, 4, 100, false, false, true, 30)));
        assertFalse(CallLog.video(group(8, 4, 100, false, false, false, 30)));
        assertFalse(CallLog.video(of(9, 5, 100, new TdApi.MessageText())));
    }

    @Test public void theGroupCallNamesItselfWithTheNounOfItsOwnKind() {
        assertEquals("Llamada de voz perdida", ServiceMessages.text(group(8, 4, 100, true, false, false, 0), null));
        assertEquals("Videollamada perdida", ServiceMessages.text(group(8, 4, 100, true, false, true, 0), null));
        assertEquals("Llamada de voz en curso", ServiceMessages.text(group(8, 4, 100, false, true, false, 0), null));
        assertEquals("Llamada de voz finalizada · 2 min 5 s", ServiceMessages.text(group(8, 4, 100, false, false, false, 125), null));
        assertEquals("Videollamada finalizada", ServiceMessages.text(group(8, 4, 100, false, false, true, 0), null));
        assertEquals("Llamada perdida", ServiceMessages.text(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonMissed(), false, 0), null));
        assertEquals("Videollamada rechazada", ServiceMessages.text(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonDeclined(), true, 0), null));
    }

    @Test public void aCallNobodyAnsweredHasNoDuration() {
        assertEquals(0, CallLog.duration(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonMissed(), false, 0)));
        assertEquals(0, CallLog.duration(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonHungUp(), false, -5)));
        assertEquals(205, CallLog.duration(oneToOne(7, 3, 100, new TdApi.CallDiscardReasonHungUp(), false, 205)));
        assertEquals(60, CallLog.duration(group(8, 4, 100, false, false, false, 60)));
        assertEquals(0, CallLog.duration(null));
    }

    @Test public void theCursorIsOpaqueAndBounded() {
        assertEquals("", CallLog.offset(""));
        assertEquals("", CallLog.offset(null));
        assertEquals("1771234567890", CallLog.offset("1771234567890"));
        try {
            CallLog.offset("012345678901234567890123456789012345678901234567890123456789012345678");
            fail("un cursor de 72 caracteres no es de Telegram");
        } catch (IllegalArgumentException invalid) {
            assertEquals(CallLog.BAD_OFFSET, invalid.getMessage());
        }
    }

    @Test public void onlyTheCursorProvesThereIsAnotherPage() {
        assertFalse(CallLog.more(""));
        assertFalse(CallLog.more(null));
        assertTrue(CallLog.more("1771234567890"));
    }

    @Test public void anUnknownTotalIsNeverPainted() {
        assertEquals(0, CallLog.total(-1));
        assertEquals(0, CallLog.total(0));
        assertEquals(37, CallLog.total(37));
    }

    @Test public void namesMatchIgnoringAccentsAndCase() {
        assertTrue(CallLog.matches("José Álvarez", "jose"));
        assertTrue(CallLog.matches("josé   alvarez", "José  ÁLVAREZ"));
        assertTrue(CallLog.matches("Ana", ""));
        assertTrue(CallLog.matches("Ana", "   "));
        assertTrue(CallLog.matches("Comunidad WR", "comunidad wr"));
        assertFalse(CallLog.matches("Ana", "juan"));
        assertFalse(CallLog.matches(null, "ana"));
    }

    @Test public void theRowCarriesWhatTheScreenPaints() throws Exception {
        JSONObject row = CallLog.row(oneToOne(7, 3, 1771234567, new TdApi.CallDiscardReasonMissed(), false, 0), "Ana", "Llamada perdida");
        assertEquals("7", row.getString("chatId"));
        assertEquals("3", row.getString("messageId"));
        assertEquals("Ana", row.getString("title"));
        assertEquals("Llamada perdida", row.getString("label"));
        assertEquals(1771234567, row.getInt("date"));
        assertTrue(row.getBoolean("missed"));
        assertFalse(row.getBoolean("video"));
        assertFalse(row.getBoolean("group"));
        assertEquals(0, row.getInt("duration"));
    }

    @Test public void aGroupRowMarksItselfAndToleratesMissingText() throws Exception {
        JSONObject row = CallLog.row(group(8, 4, 1771234567, false, true, true, 90), null, null);
        assertTrue(row.getBoolean("group"));
        assertTrue(row.getBoolean("video"));
        assertEquals(90, row.getInt("duration"));
        assertEquals("", row.getString("title"));
        assertEquals("", row.getString("label"));
        assertFalse(row.getBoolean("missed"));
    }

    @Test public void thePageIsFiftyOfTheHundredTelegramAllows() {
        assertEquals(50, CallLog.LIMIT);
        assertTrue(CallLog.LIMIT <= 100);
    }
}
