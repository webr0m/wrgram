package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class ReplyQuoteTest {
    private static TdApi.Message text(String value, TdApi.TextEntity... entities) {
        TdApi.MessageText content = new TdApi.MessageText();
        content.text = new TdApi.FormattedText(value, entities);
        TdApi.Message message = new TdApi.Message();
        message.content = content;
        return message;
    }

    private static TdApi.TextEntity entity(int offset, int length, TdApi.TextEntityType type) {
        return new TdApi.TextEntity(offset, length, type);
    }

    private static JSONObject quote(String text, int position) throws Exception {
        return new JSONObject().put("text", text).put("position", position);
    }

    private static String refusal(TdApi.Message original, JSONObject quote) {
        try {
            ReplyQuote.of(original, quote);
            return null;
        } catch (IllegalArgumentException refused) {
            return refused.getMessage();
        } catch (Exception other) {
            throw new AssertionError(other);
        }
    }

    @Test
    public void lasTresNegativasSonLasCompartidas() {
        assertEquals("Solo se puede citar el texto de un mensaje.", ReplyQuote.NOT_TEXT);
        assertEquals("La cita no puede estar vacía.", ReplyQuote.EMPTY);
        assertEquals("La cita no coincide con el texto del mensaje.", ReplyQuote.MISMATCH);
    }

    @Test
    public void unaCitaValidaViajaConSuPosicion() throws Exception {
        TdApi.InputTextQuote result = ReplyQuote.of(text("Hola mundo cruel"), quote("mundo", 5));
        assertEquals("mundo", result.text.text);
        assertEquals(5, result.position);
        assertEquals(0, result.richTexts.length);
    }

    @Test
    public void lasEntidadesSeRecortanYSeDesplazan() throws Exception {
        TdApi.Message original = text("Hola mundo cruel",
            entity(5, 5, new TdApi.TextEntityTypeBold()),
            entity(3, 5, new TdApi.TextEntityTypeItalic()),
            entity(0, 4, new TdApi.TextEntityTypeCode()));
        TdApi.InputTextQuote result = ReplyQuote.of(original, quote("mun", 5));
        assertEquals(2, result.text.entities.length);
        assertEquals(0, result.text.entities[0].offset);
        assertEquals(3, result.text.entities[0].length);
        assertTrue(result.text.entities[0].type instanceof TdApi.TextEntityTypeBold);
        assertEquals(0, result.text.entities[1].offset);
        assertEquals(3, result.text.entities[1].length);
        assertTrue(result.text.entities[1].type instanceof TdApi.TextEntityTypeItalic);
    }

    @Test
    public void unaEntidadQueApenasTocaLaCitaNoViaja() throws Exception {
        TdApi.Message original = text("Hola mundo cruel", entity(2, 3, new TdApi.TextEntityTypeBold()));
        TdApi.InputTextQuote result = ReplyQuote.of(original, quote("mundo", 5));
        assertEquals(0, result.text.entities.length);
    }

    @Test
    public void laCitaVaciaSeNiegaPorSuNombre() throws Exception {
        assertEquals(ReplyQuote.EMPTY, refusal(text("Hola mundo"), quote("", 0)));
        assertEquals(ReplyQuote.EMPTY, refusal(text("Hola mundo"), new JSONObject().put("position", 0)));
    }

    @Test
    public void unaCitaQueNoCoincideSeNiegaPorSuNombre() throws Exception {
        assertEquals(ReplyQuote.MISMATCH, refusal(text("Hola mundo cruel"), quote("mundo", 0)));
        assertEquals(ReplyQuote.MISMATCH, refusal(text("Hola mundo cruel"), quote("MUNDO", 5)));
        assertEquals(ReplyQuote.MISMATCH, refusal(text("Hola mundo cruel"), quote("cruel", -1)));
        assertEquals(ReplyQuote.MISMATCH, refusal(text("Hola mundo cruel"), quote("cruel", 12)));
        assertEquals(ReplyQuote.MISMATCH, refusal(text("Hola mundo cruel"), new JSONObject().put("text", "mundo")));
    }

    @Test
    public void unMensajeSinTextoSeNiegaPorSuNombre() throws Exception {
        TdApi.Message sticker = new TdApi.Message();
        sticker.content = new TdApi.MessageSticker();
        assertEquals(ReplyQuote.NOT_TEXT, refusal(sticker, quote("algo", 0)));
        assertEquals(ReplyQuote.NOT_TEXT, refusal(null, quote("algo", 0)));
        TdApi.Message empty = text("");
        assertEquals(ReplyQuote.NOT_TEXT, refusal(empty, quote("algo", 0)));
    }

    @Test
    public void elContenidoTemporalNoSeCita() throws Exception {
        TdApi.Message timer = text("Hola mundo");
        timer.selfDestructType = new TdApi.MessageSelfDestructTypeTimer();
        assertEquals(ReplyQuote.NOT_TEXT, refusal(timer, quote("mundo", 5)));
    }

    @Test
    public void elPieDeUnaFotoSiSeCita() throws Exception {
        TdApi.MessagePhoto photo = new TdApi.MessagePhoto();
        photo.caption = new TdApi.FormattedText("pie de foto", new TdApi.TextEntity[0]);
        TdApi.Message message = new TdApi.Message();
        message.content = photo;
        TdApi.InputTextQuote result = ReplyQuote.of(message, quote("de", 4));
        assertEquals("de", result.text.text);
        assertEquals(4, result.position);
    }

    @Test
    public void soloLosTiposQueTelegramAdmiteEnUnaCita() {
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeBold()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeItalic()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeUnderline()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeStrikethrough()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeSpoiler()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeCustomEmoji()));
        assertTrue(ReplyQuote.allowed(new TdApi.TextEntityTypeDateTime()));
        assertFalse(ReplyQuote.allowed(new TdApi.TextEntityTypeCode()));
        assertFalse(ReplyQuote.allowed(new TdApi.TextEntityTypePre()));
        assertFalse(ReplyQuote.allowed(new TdApi.TextEntityTypeTextUrl()));
        assertFalse(ReplyQuote.allowed(new TdApi.TextEntityTypeMention()));
    }

    @Test
    public void elProblemaEsNuloCuandoLaCitaCuadra() {
        assertNull(ReplyQuote.problem("Hola mundo cruel", "mundo", 5));
        assertEquals(ReplyQuote.EMPTY, ReplyQuote.problem("Hola mundo cruel", "", 0));
        assertEquals(ReplyQuote.MISMATCH, ReplyQuote.problem("Hola mundo cruel", "mundo", 1));
    }
}