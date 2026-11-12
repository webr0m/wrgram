package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import org.junit.Test;

public class TelegraphUrlTest {
    @Test public void upgradesOldPublicLinksWithoutLosingTheirAnchor() {
        assertEquals("https://telegra.ph/Articulo-01-01#Texto", TelegraphUrl.normalize("http://telegra.ph/Articulo-01-01#Texto"));
    }

    @Test public void rejectsLookalikesAndAlternateAuthorities() {
        assertNull(TelegraphUrl.normalize("https://telgra.ph/"));
        assertNull(TelegraphUrl.normalize("https://telegra.ph.example.org/"));
        assertNull(TelegraphUrl.normalize("https://telegra.ph@127.0.0.1/"));
        assertNull(TelegraphUrl.normalize("https://telegra.ph:8443/"));
        assertNull(TelegraphUrl.normalize("file://telegra.ph/articulo"));
    }
}
