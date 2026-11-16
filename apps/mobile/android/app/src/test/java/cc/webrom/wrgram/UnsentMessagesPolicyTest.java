package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class UnsentMessagesPolicyTest {
    private static TdApi.Message own() {
        TdApi.Message message = new TdApi.Message();
        message.isOutgoing = true;message.id = 42;message.chatId = 7;
        return message;
    }

    private static TdApi.MessageSendingStateFailed failed(String text, int code) {
        return new TdApi.MessageSendingStateFailed(new TdApi.Error(code, text), true, false, false, false, 0L, 0);
    }

    private static TdApi.Message failure(TdApi.MessageSendingStateFailed state) {
        TdApi.Message message = own();message.sendingState = state;return message;
    }

    @Test public void aMessageOnlyWaitsWhileTelegramDoesNotHaveIt() {
        TdApi.Message pending = own();pending.sendingState = new TdApi.MessageSendingStatePending(3);
        assertTrue(UnsentMessages.pending(pending));assertTrue(UnsentMessages.waiting(pending));assertFalse(UnsentMessages.failed(pending));
        TdApi.Message broken = failure(failed("Too many requests", 429));
        assertTrue(UnsentMessages.failed(broken));assertTrue(UnsentMessages.waiting(broken));assertFalse(UnsentMessages.pending(broken));
        assertFalse(UnsentMessages.waiting(own()));
        TdApi.Message incoming = own();incoming.isOutgoing = false;incoming.sendingState = new TdApi.MessageSendingStatePending(3);
        assertFalse(UnsentMessages.waiting(incoming));
        assertFalse(UnsentMessages.waiting(null));
    }

    @Test public void thePendingRowInventsNothing() throws Exception {
        TdApi.Message pending = own();pending.sendingState = new TdApi.MessageSendingStatePending(3);
        JSONObject row = UnsentMessages.reason(pending);
        assertTrue(row.getBoolean("pending"));
        assertEquals(0, row.getInt("code"));
        assertEquals("", row.getString("telegram"));
        assertFalse(row.getBoolean("canRetry"));
        assertFalse(row.getBoolean("dropsReply"));
        assertEquals("0", row.getString("stars"));
        assertEquals(0, row.getInt("wait"));
    }

    @Test public void theFailedRowKeepsExactlyWhatTelegramSaid() throws Exception {
        TdApi.MessageSendingStateFailed state = new TdApi.MessageSendingStateFailed(
            new TdApi.Error(429, "Too many requests, please try again later."), true, true, true, true, 25L, 12.4);
        JSONObject row = UnsentMessages.reason(failure(state));
        assertFalse(row.getBoolean("pending"));
        assertEquals(429, row.getInt("code"));
        assertEquals("Too many requests, please try again later.", row.getString("telegram"));
        assertTrue(row.getBoolean("canRetry"));
        assertTrue(row.getBoolean("anotherSender"));
        assertTrue(row.getBoolean("otherQuote"));
        assertTrue(row.getBoolean("dropsReply"));
        assertEquals("25", row.getString("stars"));
        assertEquals(13, row.getInt("wait"));
    }

    @Test public void theErrorTextOfCode406NeverReachesTheInterface() throws Exception {
        TdApi.Message message = failure(failed("Cualquier cosa que escribió el servidor", 406));
        JSONObject row = UnsentMessages.reason(message);
        assertEquals("", row.getString("telegram"));
        assertEquals(406, row.getInt("code"));
        assertEquals("", UnsentMessages.telegramText(message));
    }

    @Test public void theErrorTextArrivesAsOneBoundedLine() throws Exception {
        assertEquals("uno dos tres", UnsentMessages.reason(failure(failed("uno\n\rdos  tres", 400))).getString("telegram"));
        String longText = UnsentMessages.reason(failure(failed("x".repeat(400), 400))).getString("telegram");
        assertEquals(UnsentMessages.MAX_ERROR + 1, longText.length());
        assertTrue(longText.endsWith("…"));
        assertEquals("", UnsentMessages.reason(failure(failed("   ", 400))).getString("telegram"));
        assertEquals("", UnsentMessages.reason(failure(new TdApi.MessageSendingStateFailed(null, true, false, false, false, 0L, 0))).getString("telegram"));
    }

    @Test public void starCountsTooBigForADoubleStillTravelAsText() throws Exception {
        TdApi.Message message = failure(new TdApi.MessageSendingStateFailed(new TdApi.Error(400, "paid"), true, false, false, false, 9007199254740993L, 0));
        assertEquals("9007199254740993", UnsentMessages.reason(message).getString("stars"));
    }

    @Test public void retryIsOnlyOfferedWhenTelegramAllowsIt() {
        assertNull(UnsentMessages.retryProblem(failure(failed("Too many requests", 429))));
        assertEquals("El mensaje ya no está cargado. Vuelve a abrir la conversación.", UnsentMessages.retryProblem(null));
        TdApi.Message incoming = failure(failed("x", 400));incoming.isOutgoing = false;
        assertEquals("Solo puedes reintentar mensajes que enviaste tú.", UnsentMessages.retryProblem(incoming));
        assertEquals("Este mensaje ya está en Telegram.", UnsentMessages.retryProblem(own()));
        TdApi.Message pending = own();pending.sendingState = new TdApi.MessageSendingStatePending(1);
        assertEquals("Telegram sigue intentando enviar este mensaje. Espera a que termine antes de repetirlo.", UnsentMessages.retryProblem(pending));
    }

    @Test public void everyTelegramConditionHasItsOwnAnswer() {
        TdApi.MessageSendingStateFailed noRetry = failed("Prohibido", 403);noRetry.canRetry = false;
        assertEquals("Telegram no admite reintentar este mensaje.", UnsentMessages.retryProblem(failure(noRetry)));
        TdApi.MessageSendingStateFailed paid = failed("Pagando", 400);paid.requiredPaidMessageStarCount = 250;
        assertTrue(UnsentMessages.retryProblem(failure(paid)).startsWith("Telegram pide 250 Stars para enviar este mensaje otra vez;"));
        TdApi.MessageSendingStateFailed otherSender = failed("Remitente", 400);otherSender.needAnotherSender = true;
        assertEquals("Telegram solo permite enviarlo otra vez a nombre de otro remitente del chat.", UnsentMessages.retryProblem(failure(otherSender)));
        TdApi.MessageSendingStateFailed otherQuote = failed("Cita", 400);otherQuote.needAnotherReplyQuote = true;
        assertTrue(UnsentMessages.retryProblem(failure(otherQuote)).contains("la cita todavía no se edita desde WRGram"));
        // El orden importa: pagar y cambiar de remitente a la vez se explica por la Stars, que es lo que frena.
        TdApi.MessageSendingStateFailed both = failed("Los dos", 400);both.requiredPaidMessageStarCount = 5;both.needAnotherSender = true;
        assertTrue(UnsentMessages.retryProblem(failure(both)).contains("5 Stars"));
    }

    @Test public void aWaitingClockWarnsButNeverBlocksTheRetry() {
        TdApi.Message message = failure(failed("Espera", 429));message.sendingState = new TdApi.MessageSendingStateFailed(new TdApi.Error(429, "Espera"), true, false, false, false, 0L, 30.5);
        assertNull(UnsentMessages.retryProblem(message));
        assertEquals(31, UnsentMessages.waitSeconds(message));
        assertTrue(UnsentMessages.retryExplanation(message).contains("Telegram pidió esperar 31 s"));
        assertTrue(UnsentMessages.retryExplanation(message).contains("Telegram dijo: «Espera»"));
        assertTrue(UnsentMessages.retryExplanation(message).endsWith("El mensaje se envía tal como lo escribiste."));
    }

    @Test public void onlyDroppingTheReplyNeedsAQuestionBeforeResending() {
        TdApi.Message plain = failure(failed("Espera", 429));
        assertFalse(UnsentMessages.dropsReply(plain));
        assertFalse(UnsentMessages.retryExplanation(plain).contains("quitará la respuesta"));
        TdApi.MessageSendingStateFailed drop = failed("Original borrado", 400);drop.needDropReply = true;
        TdApi.Message message = failure(drop);
        assertTrue(UnsentMessages.dropsReply(message));
        assertTrue(UnsentMessages.retryExplanation(message).contains("Telegram quitará la respuesta al mensaje original"));
        assertEquals(0, UnsentMessages.waitSeconds(own()));
    }

    @Test public void removingIsOfferedForAnythingTelegramNeverReceived() {
        assertNull(UnsentMessages.deleteProblem(failure(failed("Mal", 400))));
        TdApi.Message pending = own();pending.sendingState = new TdApi.MessageSendingStatePending(1);
        assertNull(UnsentMessages.deleteProblem(pending));
        assertEquals("Este mensaje ya está en Telegram; usa sus opciones para borrarlo.", UnsentMessages.deleteProblem(own()));
        TdApi.Message incoming = own();incoming.isOutgoing = false;
        assertEquals("Solo puedes quitar mensajes que enviaste tú.", UnsentMessages.deleteProblem(incoming));
        assertEquals("El mensaje ya no está cargado. Vuelve a abrir la conversación.", UnsentMessages.deleteProblem(null));
    }

    @Test public void theDeleteDialogSaysWhichOfTheTwoThingsHappens() {
        TdApi.Message pending = own();pending.sendingState = new TdApi.MessageSendingStatePending(1);
        assertTrue(UnsentMessages.deleteExplanation(pending).contains("Se descartará sin enviarlo"));
        assertTrue(UnsentMessages.deleteExplanation(failure(failed("Mal", 400))).contains("nunca llegó a Telegram"));
        assertFalse(UnsentMessages.deleteExplanation(failure(failed("Mal", 400))).contains("descartará"));
    }

    @Test public void aMessageAlreadyInTelegramHasNothingToProject() {
        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () -> UnsentMessages.reason(own()));
        assertEquals("Este mensaje no está esperando a Telegram.", error.getMessage());
        TdApi.Message incoming = own();incoming.isOutgoing = false;incoming.sendingState = new TdApi.MessageSendingStatePending(2);
        assertThrows(IllegalArgumentException.class, () -> UnsentMessages.reason(incoming));
    }
}
