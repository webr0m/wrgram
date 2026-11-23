package cc.webrom.wrgram;

import static org.junit.Assert.*;

import java.util.Arrays;
import java.util.Collections;
import org.json.JSONObject;
import org.junit.Test;

public class ShareInboxTest {
    @Test public void sendDeTextoConservaElTexto() throws Exception {
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND,"text/plain"," hola mundo ",null);
        assertNotNull(payload);
        assertEquals("hola mundo",payload.getString("text"));
        assertEquals(0,payload.getJSONArray("items").length());
        assertEquals("text/plain",payload.getString("mime"));
    }
    @Test public void sendMultipleIgnoraElTextoYConservaLasUris() throws Exception {
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND_MULTIPLE,"image/*","texto que no viaja",Arrays.asList("content://a/1","content://a/2","content://a/3"));
        assertNotNull(payload);
        assertEquals("",payload.getString("text"));
        assertEquals(3,payload.getJSONArray("items").length());
        assertEquals("content://a/2",payload.getJSONArray("items").getString(1));
    }
    @Test public void accionDesconocidaNoEsCompartir() throws Exception {
        assertNull(ShareInbox.payload("android.intent.action.VIEW","text/plain","hola",null));
        assertNull(ShareInbox.payload(null,"text/plain","hola",null));
    }
    @Test public void sinTextoNiArchivosNoHayNadaQueImportar() throws Exception {
        assertNull(ShareInbox.payload(ShareInbox.SEND,"text/plain","   ",null));
        assertNull(ShareInbox.payload(ShareInbox.SEND_MULTIPLE,"image/*",null,Collections.emptyList()));
    }
    @Test public void nuncaMasDeDiezArchivos() throws Exception {
        String[] uris=new String[14];
        for(int i=0;i<uris.length;i++)uris[i]="content://a/"+i;
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND_MULTIPLE,"image/*",null,Arrays.asList(uris));
        assertNotNull(payload);
        assertEquals(ShareInbox.MAX_ITEMS,payload.getJSONArray("items").length());
        assertEquals(10,ShareInbox.MAX_ITEMS);
    }
    @Test public void elTextoSeRecortaAlTopeDeMensaje() throws Exception {
        StringBuilder largo=new StringBuilder();
        for(int i=0;i<5000;i++)largo.append('x');
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND,"text/plain",largo.toString(),null);
        assertNotNull(payload);
        assertEquals(ShareInbox.MAX_TEXT,payload.getString("text").length());
        assertEquals(4096,ShareInbox.MAX_TEXT);
    }
    @Test public void urisNulasOVaciasSeSaltan() throws Exception {
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND_MULTIPLE,"image/*",null,Arrays.asList(null,"","  ","content://a/1"));
        assertNotNull(payload);
        assertEquals(1,payload.getJSONArray("items").length());
        assertEquals("content://a/1",payload.getJSONArray("items").getString(0));
    }
    @Test public void mimeAusenteEsCualquierTipo() throws Exception {
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND,null,"hola",null);
        assertNotNull(payload);
        assertEquals("*/*",payload.getString("mime"));
    }
    @Test public void sendConFotoYTextoConservaAmbos() throws Exception {
        JSONObject payload=ShareInbox.payload(ShareInbox.SEND,"image/jpeg","mira esto",Collections.singletonList("content://a/1"));
        assertNotNull(payload);
        assertEquals("mira esto",payload.getString("text"));
        assertEquals(1,payload.getJSONArray("items").length());
    }
    @Test public void elNombreSeSaneaComoEnElSelector() throws Exception {
        assertEquals("a_b_.pdf",ShareInbox.nameOf("a<b>.pdf"));
        assertEquals("archivo",ShareInbox.nameOf(null));
        assertEquals("archivo",ShareInbox.nameOf(""));
        assertEquals("archivo",ShareInbox.nameOf(".oculto"));
        assertEquals("archivo",ShareInbox.nameOf("   "));
    }
    @Test public void elNombreLargoConservaLaCola() throws Exception {
        StringBuilder largo=new StringBuilder();
        for(int i=0;i<120;i++)largo.append('n');
        largo.append(".pdf");
        String name=ShareInbox.nameOf(largo.toString());
        assertEquals(90,name.length());
        assertTrue(name.endsWith(".pdf"));
    }
}