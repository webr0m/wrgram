package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/**
 * La ronda BS abre una fuente de GIF que no es Telegram. Como lo que devuelve el servidor llega de fuera, la única
 * defensa vale la misma que la del envío de archivos: no se interpreta ningún campo, se valida uno por uno. Estas
 * pruebas miden esa validación sobre JSON escrito a mano, sin red y sin TDLib.
 */
public class GiphySourceTest {
    private static final String PROXY = GiphySource.SEARCH_ROOT + "/media/";
    private static final String TOKEN = "aHR0cHM6Ly9tZWRpMC5naXBoeS5jb20vbWVkaWEvU2FsdWQzL2dpcGh5X2dpZg";

    private static JSONObject entry(String id,String preview,String animation,int width,int height,int duration) throws Exception {
        JSONObject value=new JSONObject();
        value.put("id",id).put("preview",preview).put("animation",animation);
        value.put("width",width).put("height",height).put("duration",duration);
        return value;
    }

    private static JSONObject body(JSONObject...entries) throws Exception {
        JSONArray items=new JSONArray();
        for(JSONObject entry:entries)items.put(entry);
        return new JSONObject().put("items",items);
    }

    @Test public void unaEntradaCorrectaSeConvierteEnArchivoPropio() throws Exception {
        List<GiphySource.Gif> gifs=GiphySource.parse(body(entry("Saludo3x",PROXY+TOKEN,PROXY+TOKEN+"-x",200,120,2)));
        assertEquals(1,gifs.size());
        GiphySource.Gif gif=gifs.get(0);
        assertEquals("Saludo3x",gif.id);
        assertEquals(200,gif.width);
        assertEquals(120,gif.height);
        assertEquals(2,gif.duration);
        assertTrue(gif.preview.startsWith(PROXY));
        assertTrue(gif.animation.startsWith(PROXY));
    }

    @Test public void unHostQueNoEsNuestroProxySeDescartaEntero() throws Exception {
        List<GiphySource.Gif> gifs=GiphySource.parse(body(
            entry("Uno",PROXY+TOKEN,"https://media0.giphy.com/media/Uno/giphy.gif",200,120,2),
            entry("Dos",PROXY+TOKEN,PROXY+"../../../../../etc/passwd",200,120,2),
            entry("Tres","https://suplantacion.example.net/x.gif",PROXY+TOKEN,200,120,2),
            entry("Cuatro",PROXY+TOKEN+"?redirige=1",PROXY+TOKEN,200,120,2),
            entry("Cinco",PROXY+TOKEN,PROXY+TOKEN,200,120,2)));
        assertEquals(1,gifs.size());
        assertEquals("Cinco",gifs.get(0).id);
    }

    @Test public void lasMedidasFueraDeRangoValenCeroYTelegramLasCalcula() throws Exception {
        List<GiphySource.Gif> gifs=GiphySource.parse(body(
            entry("Gigante",PROXY+TOKEN,PROXY+TOKEN,9_000,120,-4),
            entry("Cero",PROXY+TOKEN,PROXY+TOKEN,0,0,0)));
        assertEquals(0,gifs.get(0).width);
        assertEquals(120,gifs.get(0).height);
        assertEquals(0,gifs.get(0).duration);
        assertEquals(0,gifs.get(1).width);
    }

    @Test public void unIdentificadorRaroNuncaLlegaAlNombreDelArchivo() throws Exception {
        for(String id:new String[]{"","con espacio","ruta/../x","fin.gif","ñame","<script>"})
            assertEquals(id,0,GiphySource.parse(body(entry(id,PROXY+TOKEN,PROXY+TOKEN,200,120,2))).size());
    }

    @Test public void laListaSeCortaEnElMismoMáximoQueSeLePideAlServidor() throws Exception {
        JSONObject[] entries=new JSONObject[GiphySource.MAX_ITEMS+7];
        for(int i=0;i<entries.length;i++)entries[i]=entry("Gif"+i,PROXY+TOKEN,PROXY+TOKEN,200,120,2);
        assertEquals(GiphySource.MAX_ITEMS,GiphySource.parse(body(entries)).size());
    }

    @Test public void sinListaElResultadoVacíoNoEsUnError() throws Exception {
        assertEquals(0,GiphySource.parse(new JSONObject()).size());
        assertEquals(0,GiphySource.parse(new JSONObject().put("items","nada")).size());
    }

    @Test public void laRutaDelProxyNoAceptaNiQueryNiFragmento() {
        assertNull(GiphySource.guarded(null));
        assertNull(GiphySource.guarded(""));
        assertNull(GiphySource.guarded("https://otro.example/api/v1/gifs/media/"+TOKEN));
        assertNull(GiphySource.guarded(PROXY));
        assertNull(GiphySource.guarded(PROXY+"corto"));
        assertNull(GiphySource.guarded(PROXY+TOKEN+"#fragmento"));
        assertEquals(PROXY+TOKEN,GiphySource.guarded(PROXY+TOKEN));
    }
}
