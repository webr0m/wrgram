package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

/** El tope de subida es el de Telegram, no el de la beta: 2 GB por archivo y 4 GB con Premium. */
public class UploadPolicyTest {
    @Test
    public void limitsAreTheBytesTelegramAccepts(){
        assertEquals(2L*1024*1024*1024,UploadPolicy.FREE_MAX_BYTES);
        assertEquals(4L*1024*1024*1024,UploadPolicy.PREMIUM_MAX_BYTES);
        assertEquals(2147483648L,UploadPolicy.maxBytes(false));
        assertEquals(4294967296L,UploadPolicy.maxBytes(true));
        assertTrue(UploadPolicy.maxBytes(true)>UploadPolicy.maxBytes(false));
    }

    @Test
    public void premiumComesFromTheCachedAccountAndAnAbsentAccountIsNotPremium(){
        assertFalse(UploadPolicy.premium(null));
        TdApi.User free=new TdApi.User();
        assertFalse(UploadPolicy.premium(free));
        TdApi.User paid=new TdApi.User();
        paid.isPremium=true;
        assertTrue(UploadPolicy.premium(paid));
    }

    @Test
    public void eachRefusalKeepsItsOwnLiteralForBothShores(){
        assertEquals("No se pudo importar el archivo. Límite: 2 GB.",UploadPolicy.tooBig(false));
        assertEquals("No se pudo importar el archivo. Límite: 4 GB.",UploadPolicy.tooBig(true));
        assertEquals("No se pudieron importar las fotos. Límite: 10 imágenes de 2 GB.",UploadPolicy.albumTooBig(false));
        assertEquals("No se pudieron importar las fotos. Límite: 10 imágenes de 4 GB.",UploadPolicy.albumTooBig(true));
        assertEquals("No se pudo importar el GIF o imagen del teclado. Límite: 2 GB.",UploadPolicy.keyboardTooBig(false));
        assertEquals("No se pudo importar el GIF o imagen del teclado. Límite: 4 GB.",UploadPolicy.keyboardTooBig(true));
        assertEquals(UploadPolicy.TOO_BIG,UploadPolicy.tooBig(false));
        assertEquals(UploadPolicy.TOO_BIG_PREMIUM,UploadPolicy.tooBig(true));
        assertEquals(UploadPolicy.ALBUM_TOO_BIG,UploadPolicy.albumTooBig(false));
        assertEquals(UploadPolicy.ALBUM_TOO_BIG_PREMIUM,UploadPolicy.albumTooBig(true));
        assertEquals(UploadPolicy.KEYBOARD_TOO_BIG,UploadPolicy.keyboardTooBig(false));
        assertEquals(UploadPolicy.KEYBOARD_TOO_BIG_PREMIUM,UploadPolicy.keyboardTooBig(true));
    }
}