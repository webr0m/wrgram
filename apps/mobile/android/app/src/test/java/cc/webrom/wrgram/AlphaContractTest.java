package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.HashSet;
import java.util.Arrays;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class AlphaContractTest {
    @Test public void catalogueIdsAreUniqueAndFallBackToGold() {
        assertEquals(20, Palette.IDS.length);
        assertEquals(20, new HashSet<>(Arrays.asList(Palette.IDS)).size());
        assertEquals(Palette.IDS.length, Palette.NAMES.length);
        assertTrue(Palette.get("gold").dark);
        assertEquals(0xfff0c65c, Palette.get("gold").accent);
        assertEquals(Palette.get("gold").accent, Palette.get("corrupt").accent);
        assertFalse(Palette.get("day").dark);
        assertTrue(Palette.get("night").dark);
        assertFalse(Palette.get("telegram").dark);
        assertTrue(Palette.get("plus").dark);
        for (String id : Palette.IDS) assertNotNull(Palette.get(id));
    }

    @Test public void customThemesAreValidatedAndParsedAsCssRgba() {
        String theme = "{\"name\":\"Mío\",\"scheme\":\"light\",\"palette\":{\"canvas\":\"#ffffff\",\"surface\":\"#ffffff\",\"text\":\"#111111\",\"accent\":\"#3366ff80\",\"outgoing\":\"#eef4ff\"}}";
        assertTrue(Palette.valid(theme));
        Palette palette = Palette.custom(theme);
        assertNotNull(palette);
        assertFalse(palette.dark);
        assertEquals(0x803366ff, palette.accent);
        assertFalse(Palette.valid("{\"name\":\"\",\"palette\":{}}"));
        assertFalse(Palette.valid("{\"name\":\"Roto\",\"palette\":{\"canvas\":\"verde\"}}"));
        assertFalse(Palette.valid("{\"name\":\"Sin paleta\"}"));
        assertNull(Palette.custom("{\"palette\":null}"));
    }

    @Test public void errorsNeverEchoServerContentOrCredentials() {
        TdApi.Error error = new TdApi.Error();
        error.code = 400; error.message = "PRIVATE_PHONE_CODE_12345";
        assertFalse(TdSession.safeError(error).contains("12345"));
        error.code = 429; error.message = "FLOOD_WAIT_120";
        assertTrue(TdSession.safeError(error).contains("no se reintentará automáticamente"));
        error.code = 400; error.message = "PHONE_CODE_INVALID";
        assertTrue(TdSession.safeError(error).contains("código no es válido"));
        error.message = "PASSWORD_HASH_INVALID";
        assertTrue(TdSession.safeError(error).contains("contraseña"));
    }

    @Test public void messageTextAndMediaLabelsAreNotInvented() {
        TdApi.Message message = new TdApi.Message();
        TdApi.MessageText text = new TdApi.MessageText();
        text.text = new TdApi.FormattedText("Texto real", new TdApi.TextEntity[0]);
        message.content = text;
        assertEquals("Texto real", TdSession.text(message));
        message.content = new TdApi.MessagePhoto();
        assertEquals("Foto",TdSession.text(message));
        assertEquals("Sin mensajes", TdSession.text(null));
    }
}
