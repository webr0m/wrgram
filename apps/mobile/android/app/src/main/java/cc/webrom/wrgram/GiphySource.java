package cc.webrom.wrgram;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Búsqueda de GIF contra nuestro propio edge. Ni la clave de Giphy ni sus hosts llegan al teléfono:
 * cada URL que devuelve el servicio está firmada bajo SEARCH_ROOT y solo nuestro Worker la resuelve.
 */
final class GiphySource {
    static final String SEARCH_ROOT = "https://wrgram.webrom.cc/api/v1/gifs";
    static final int MAX_ITEMS = 25;
    static final long MAX_BYTES = 12L * 1024 * 1024;
    private static final long MAX_JSON = 512 * 1024;

    static final class Gif {
        final String id;final String preview;final String animation;
        final int width;final int height;final int duration;
        Gif(String id,String preview,String animation,int width,int height,int duration){
            this.id=id;this.preview=preview;this.animation=animation;
            this.width=width;this.height=height;this.duration=duration;
        }
    }
    interface Found { void ok(List<Gif> gifs);void error(String message); }
    interface Saved { void ok(File file);void error(String message); }
    private static final class Unavailable extends Exception {
        Unavailable(String message){super(message);}
    }

    private final File directory;
    // Un solo hilo y cola ilimitada: las búsquedas se atienden de a una y el hilo se retira cuando el selector lleva media minuto cerrado.
    private final ThreadPoolExecutor io = new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,new LinkedBlockingQueue<>());

    { io.allowCoreThreadTimeOut(true); }

    GiphySource(File directory){this.directory=directory;}

    /** Solo acepta la ruta de nuestro proxy: nada de host, consulta o fragmento ajenos. */
    static String guarded(String candidate){
        if(candidate==null||!candidate.startsWith(SEARCH_ROOT+"/media/"))return null;
        String token=candidate.substring((SEARCH_ROOT+"/media/").length());
        return token.matches("[A-Za-z0-9_-]{8,512}")?candidate:null;
    }

    static List<Gif> parse(JSONObject body){
        List<Gif> gifs=new ArrayList<>();
        JSONArray items=body.optJSONArray("items");
        if(items==null)return gifs;
        for(int i=0;i<items.length()&&gifs.size()<MAX_ITEMS;i++){
            JSONObject item=items.optJSONObject(i);
            if(item==null)continue;
            String id=item.optString("id");
            String preview=guarded(item.optString("preview"));
            String animation=guarded(item.optString("animation"));
            if(!id.matches("[A-Za-z0-9_-]{1,64}")||preview==null||animation==null)continue;
            gifs.add(new Gif(id,preview,animation,
                bounded(item.optInt("width"),2000),bounded(item.optInt("height"),2000),bounded(item.optInt("duration"),60)));
        }
        return gifs;
    }

    private static int bounded(int value,int maximum){return value>0&&value<=maximum?value:0;}

    void search(String query,Found found){
        String term=query==null?"":query.trim();
        io.execute(()->{
            try{ found.ok(parse(json(term.isEmpty()?SEARCH_ROOT+"/search":SEARCH_ROOT+"/search?q="+URLEncoder.encode(term,"UTF-8")))); }
            catch(Unavailable specific){found.error(specific.getMessage());}
            catch(Exception ignored){found.error("Giphy no respondió. Revisa la conexión y vuelve a intentarlo.");}
        });
    }

    void save(Gif gif,Saved saved){
        io.execute(()->{
            File target=new File(directory,gif.id+".gif");
            if(target.isFile()&&target.length()>0&&target.length()<=MAX_BYTES){saved.ok(target);return;}
            if(!directory.isDirectory()&&!directory.mkdirs()){saved.error("No se pudo preparar el almacén de GIF.");return;}
            File temp=new File(directory,gif.id+".part");
            // `HttpURLConnection` no es `AutoCloseable`: se cierra arriba, en el `finally`, y aquí solo los streams.
            HttpURLConnection request=null;
            try{
                request=open(gif.animation);
                String type=request.getContentType();
                if(type==null||!type.toLowerCase().startsWith("image/"))throw new Unavailable("El archivo recibido no es un GIF.");
                if(request.getContentLengthLong()>MAX_BYTES)throw new Unavailable("El GIF supera el tamaño admitido.");
                try(InputStream input=request.getInputStream();OutputStream output=new FileOutputStream(temp)){
                    byte[] buffer=new byte[8192];int count;long total=0;
                    while((count=input.read(buffer))!=-1){
                        total+=count;
                        if(total>MAX_BYTES)throw new Unavailable("El GIF supera el tamaño admitido.");
                        output.write(buffer,0,count);
                    }
                    if(total<=0)throw new Unavailable("El GIF llegó vacío.");
                    output.flush();
                }
                // Primero se cierra el archivo, después se cambia de nombre: al revés puede no quedar escrito.
                if(!temp.renameTo(target))throw new Unavailable("No se pudo guardar el GIF.");
                saved.ok(target);
            }catch(Unavailable specific){
                discard(temp);
                saved.error(specific.getMessage());
            }catch(Exception ignored){
                discard(temp);
                saved.error("El GIF no se descargó completo. Vuelve a intentarlo.");
            }finally{
                if(request!=null)request.disconnect();
            }
        });
    }

    private static void discard(File file){if(file.isFile()&&!file.delete())file.deleteOnExit();}

    private JSONObject json(String url)throws Exception{
        HttpURLConnection request=null;
        try{
            request=open(url);
            try(InputStream input=request.getInputStream();ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
                byte[] buffer=new byte[4096];int count;
                while((count=input.read(buffer))!=-1){
                    if(bytes.size()+count>MAX_JSON)throw new Unavailable("La respuesta de Giphy es demasiado grande.");
                    bytes.write(buffer,0,count);
                }
                return new JSONObject(bytes.toString("UTF-8"));
            }
        }finally{
            if(request!=null)request.disconnect();
        }
    }

    private static HttpURLConnection open(String url)throws Exception{
        HttpURLConnection request=(HttpURLConnection) new URL(url).openConnection();
        request.setConnectTimeout(5000);request.setReadTimeout(15000);request.setInstanceFollowRedirects(false);
        request.setRequestProperty("Accept","application/json");request.setRequestProperty("Cache-Control","no-store");
        int code=request.getResponseCode();
        if(code==503)throw new Unavailable("Giphy aún no está habilitado en esta instalación.");
        if(code==429)throw new Unavailable("Demasiadas búsquedas de GIF. Espera un minuto.");
        if(code!=200)throw new Unavailable("Giphy no respondió. Vuelve a intentarlo.");
        return request;
    }
}
