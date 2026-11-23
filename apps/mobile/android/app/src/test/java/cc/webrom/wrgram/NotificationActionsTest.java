package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Ronda CQ · N03: reglas puras de las acciones de notificación (responder y marcar leído). */
public class NotificationActionsTest {
    @Test public void responderSoloSinBloqueoYSinChatSecreto() {
        assertTrue(NotificationActions.replyAllowed(false, false));
        assertFalse(NotificationActions.replyAllowed(true, false));
        assertFalse(NotificationActions.replyAllowed(false, true));
        assertFalse(NotificationActions.replyAllowed(true, true));
    }
    @Test public void marcarLeidoExigeUnMensajeConocido() {
        assertFalse(NotificationActions.markReadAllowed(0));
        assertTrue(NotificationActions.markReadAllowed(1));
        assertTrue(NotificationActions.markReadAllowed(9_007_199_254_740_993L));
    }
    @Test public void laRespuestaVaciaONulaSeRechazaConAviso() {
        assertNotNull(NotificationActions.replyProblem(null));
        assertNotNull(NotificationActions.replyProblem(""));
        assertNotNull(NotificationActions.replyProblem("   \n\t "));
        assertEquals("Escribe una respuesta antes de enviarla.", NotificationActions.replyProblem(" "));
    }
    @Test public void laRespuestaRespetaElLimiteDeTelegram() {
        assertNull(NotificationActions.replyProblem("a".repeat(4096)));
        assertNotNull(NotificationActions.replyProblem("a".repeat(4097)));
        assertEquals("La respuesta supera los 4096 caracteres de Telegram.", NotificationActions.replyProblem("a".repeat(4097)));
    }
    @Test public void elLimiteSeMideSobreElTextoLimpio() {
        assertNull(NotificationActions.replyProblem("  " + "a".repeat(4096) + "  "));
        assertEquals("hola", NotificationActions.cleanedReply("  hola \n"));
        assertEquals("", NotificationActions.cleanedReply(null));
    }
    @Test public void lasAccionesYLaClaveDelRemoteInputTienenNombreEstable() {
        assertEquals("cc.webrom.wrgram.action.REPLY", NotificationActions.REPLY);
        assertEquals("cc.webrom.wrgram.action.MARK_READ", NotificationActions.MARK_READ);
        assertEquals("reply_text", NotificationActions.EXTRA_TEXT);
        assertEquals(4096, NotificationActions.MAX_TEXT);
    }
    @Test public void lasNegativasDeEjecucionNoRevelanDatosSensibles() {
        assertEquals("Desbloquea WRGram para responder desde la notificación.", NotificationActions.LOCKED);
        assertEquals("La cuenta no está lista. Abre WRGram para responder.", NotificationActions.NOT_READY);
        assertEquals("Los chats secretos no admiten respuestas desde la notificación.", NotificationActions.SECRET);
        assertEquals("No se pudo enviar la respuesta. Abre WRGram y revisa el historial antes de reintentar.", NotificationActions.SEND_FAILED);
    }
}