package cc.webrom.wrgram;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FilterInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.attribute.BasicFileAttributeView;
import java.nio.file.attribute.FileTime;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Only TDLib files explicitly referenced by a visible DTO/catalog are addressable. No JS paths. */
final class NativeMediaStore {
    private static final long MB=1024L*1024L;
    private static final long TELEGRAM_FILE_LIMIT=4096L*MB;
    private final Context context;
    private final TdSession session;
    private final LinkedHashMap<Integer,TdApi.File> known=new LinkedHashMap<>(32,.75f,true);
    private final ConcurrentHashMap<Integer,Resource> ready=new ConcurrentHashMap<>();
    private final Map<Integer,String> mimeTypes=new HashMap<>();
    private final Set<Integer> protectedFiles=new HashSet<>();
    private final Set<Integer> downloading=new HashSet<>();
    private final Set<Integer> watching=new HashSet<>();
    private final Set<Integer> failed=new HashSet<>();
    private final Map<Integer,Long> lastProgress=new HashMap<>();
    private static final long ACCESS_INTERVAL = 30 * 60 * 1000L;
    private static final class Resource {
        final File file;
        final String mime;
        long lastAccess;
        Resource(File file,String mime){this.file=file;this.mime=mime;}
    }
    private static final class ByteRange {final long start,end;ByteRange(long start,long end){this.start=start;this.end=end;}long length(){return end-start+1;}}
    private static final class LimitedInputStream extends FilterInputStream {
        private long remaining;
        LimitedInputStream(InputStream input,long length){super(input);remaining=length;}
        @Override public int read()throws IOException{if(remaining<=0)return -1;int value=super.read();if(value>=0)remaining--;return value;}
        @Override public int read(byte[] buffer,int offset,int length)throws IOException{if(remaining<=0)return -1;int count=super.read(buffer,offset,(int)Math.min(length,remaining));if(count>0)remaining-=count;return count;}
        @Override public long skip(long count)throws IOException{long skipped=super.skip(Math.min(count,remaining));remaining-=skipped;return skipped;}
    }
    NativeMediaStore(Context context,TdSession session){this.context=context;this.session=session;}
    synchronized JSONObject register(TdApi.File original,String mime,String kind,String name)throws Exception{
        if(original==null)return null;TdApi.File file=session.mediaFile(original);known.put(file.id,file);mimeTypes.put(file.id,mime);
        while(known.size()>4000){int id=known.keySet().iterator().next();known.remove(id);ready.remove(id);mimeTypes.remove(id);protectedFiles.remove(id);downloading.remove(id);watching.remove(id);failed.remove(id);lastProgress.remove(id);}
        try{refresh(file);}catch(Exception ignored){ready.remove(file.id);if(downloading.remove(file.id))failed.add(file.id);}return new JSONObject().put("id",file.id).put("ready",ready.containsKey(file.id)).put("mime",mime).put("kind",kind).put("name",name==null?"":name).put("size",Math.max(file.size,file.expectedSize)).put("downloadLimit",downloadLimit(file.id));
    }
    private long downloadLimit(int id){return "application/x-tgsticker".equalsIgnoreCase(mimeTypes.get(id))?2L*MB:TELEGRAM_FILE_LIMIT;}
    private void refresh(TdApi.File file)throws Exception{
        if(file.local==null){ready.remove(file.id);return;}
        long size=Math.max(file.size,file.expectedSize);
        // A completed flag can lag one update behind the real file, and TDLib reports
        // downloadedSize==size only after the whole file exists on disk.
        boolean completed=file.local.isDownloadingCompleted||(size>0&&file.local.downloadedSize>=size&&file.local.path!=null&&!file.local.path.isEmpty());
        // A transfer that TDLib briefly pauses is not a failure: the stall watchdog
        // tracks real byte progress and only gives up after a full idle window.
        if(!completed){ready.remove(file.id);if(file.local.isDownloadingActive){downloading.add(file.id);failed.remove(file.id);}return;}
        File path=new File(file.local.path==null?"":file.local.path);
        if(!path.isAbsolute()){ready.remove(file.id);if(downloading.remove(file.id))failed.add(file.id);return;}
        File canonical=path.getCanonicalFile();
        if(privateFile(canonical)&&canonical.isFile()){
            String mime=mimeTypes.getOrDefault(file.id,"application/octet-stream");
            Resource previous=ready.get(file.id);
            if(previous==null||!previous.file.equals(canonical)||!previous.mime.equals(mime))ready.put(file.id,new Resource(canonical,mime));
            downloading.remove(file.id);watching.remove(file.id);failed.remove(file.id);lastProgress.remove(file.id);
        }
        else{ready.remove(file.id);if(downloading.remove(file.id))failed.add(file.id);}
    }
    // TDLib has used both the account files directory and the app-private roots across
    // versions; all of them stay inside our sandbox, never external or shared storage.
    private boolean privateFile(File path){
        for(File root:new File[]{session.filesDirectory(),context.getNoBackupFilesDir(),context.getFilesDir(),context.getCacheDir()}){
            try{if(path.getPath().startsWith(root.getCanonicalPath()+File.separator))return true;}catch(Exception ignored){}
        }
        return false;
    }
    synchronized JSONArray refreshReady(){for(TdApi.File file:known.values())try{refresh(session.mediaFile(file));}catch(Exception ignored){ready.remove(file.id);if(downloading.remove(file.id))failed.add(file.id);}return new JSONArray(ready.keySet());}
    synchronized JSONArray loadingIds(){return new JSONArray(downloading);}
    synchronized JSONArray failedIds(){return new JSONArray(failed);}
    synchronized void load(int id,java.util.function.Consumer<Boolean> success,java.util.function.Consumer<String> failure){
        TdApi.File file=known.get(id);if(file==null){failure.accept("Archivo no autorizado por esta vista.");return;}
        try{refresh(session.mediaFile(file));}catch(Exception ignored){}
        if(ready.containsKey(id)){failed.remove(id);success.accept(true);return;}
        long limit=downloadLimit(id);long size=Math.max(file.size,file.expectedSize);if(size>limit){failed.add(id);failure.accept("Este archivo supera el límite de descarga de esta versión ("+limit/MB+" MB).");return;}
        // A previous attempt may still be queued in TDLib: keep it alive and watch it
        // from here too, otherwise a stalled transfer could spin forever in the UI.
        if(!downloading.add(id)){failed.remove(id);success.accept(true);watchStall(id,0,failure);return;}

        // A finite limit makes TDLib cancel the transfer after that many bytes and can
        // leave the file permanently incomplete. The size guard above is our own limit.
        failed.remove(id);lastProgress.remove(id);TdApi.DownloadFile get=new TdApi.DownloadFile();get.fileId=id;get.priority=32;get.limit=0;get.synchronous=false;
        session.perform(get,result->{String problem=null;synchronized(NativeMediaStore.this){try{TdApi.File current=session.mediaFile(result);refresh(current);}catch(Exception ignored){downloading.remove(id);failed.add(id);problem="No se pudo preparar el archivo descargado.";}}if(problem==null){success.accept(true);watchStall(id,0,failure);}else failure.accept(problem);},error->{synchronized(NativeMediaStore.this){downloading.remove(id);watching.remove(id);failed.add(id);lastProgress.remove(id);}failure.accept(error);});
    }
    // A transfer can stay "active" while the network delivers nothing. Track real byte
    // progress and only fail after three consecutive checks (24 s) without movement.
    private void watchStall(int id,int idle,java.util.function.Consumer<String> failure){
        synchronized(NativeMediaStore.this){if(!watching.add(id))return;}
        final int startIdle=idle;
        new Handler(Looper.getMainLooper()).postDelayed(()->{
            String stalled=null;
            int next=startIdle;
            synchronized(NativeMediaStore.this){
                if(!downloading.contains(id)||ready.containsKey(id)){watching.remove(id);lastProgress.remove(id);return;}
                TdApi.File current=session.mediaFile(known.get(id));
                long downloaded=current!=null&&current.local!=null?current.local.downloadedSize:-1;
                if(downloaded>lastProgress.getOrDefault(id,-1L)){lastProgress.put(id,downloaded);next=0;}
                else next++;
                if(next<3){watching.remove(id);watchStall(id,next,failure);return;}
                downloading.remove(id);watching.remove(id);failed.add(id);lastProgress.remove(id);
                stalled="Telegram no completó la descarga. Comprueba la conexión e inténtalo de nuevo.";
            }
            failure.accept(stalled);
        },8000);
    }
     void protect(int id){synchronized(protectedFiles){protectedFiles.add(id);}}
     boolean protectedFile(int id){synchronized(protectedFiles){return protectedFiles.contains(id);}}
     synchronized String mimeType(int id){return mimeTypes.getOrDefault(id,"application/octet-stream");}
    private void recordAccess(Resource resource){
        long now=System.currentTimeMillis();
        synchronized(resource){
            if(now>=resource.lastAccess&&now-resource.lastAccess<ACCESS_INTERVAL)return;
            resource.lastAccess=now;
        }
        // Record actual playback or viewing, rather than touching files merely listed in a chat.
        WrgramApplication app=(WrgramApplication)context.getApplicationContext();
        app.storage().execute(()->{
            try{
                BasicFileAttributeView attributes=Files.getFileAttributeView(resource.file.toPath(),BasicFileAttributeView.class);
                attributes.setTimes(null,FileTime.fromMillis(now),null);
            }catch(IOException|RuntimeException ignored){/* A file can be removed while this touch is queued. */}
        });
    }
    File displayFile(int id){
        Resource resource=ready.get(id);
        if(resource==null)return null;
        recordAccess(resource);
        return resource.file;
    }
    File exportFile(int id){return protectedFile(id)?null:displayFile(id);}
    WebResourceResponse response(String path){return response(path,null);}
    WebResourceResponse response(String path,String rangeHeader){
        FileInputStream input=null;
        try{
            if(path==null||!path.matches("/media/[1-9][0-9]{0,9}"))return ShellActivity.blocked();Resource resource=ready.get(Integer.parseInt(path.substring(7)));if(resource==null)return ShellActivity.blocked();long total=resource.file.length();Map<String,String> headers=new HashMap<>();headers.put("Cache-Control","no-store");headers.put("X-Content-Type-Options","nosniff");headers.put("Content-Security-Policy","default-src 'none'");headers.put("Accept-Ranges","bytes");headers.put("Content-Length",Long.toString(total));
            if(rangeHeader==null||rangeHeader.trim().isEmpty()){
                input=new FileInputStream(resource.file);
                recordAccess(resource);
                WebResourceResponse full=new WebResourceResponse(resource.mime,null,200,"OK",headers,input);input=null;return full;
            }
            ByteRange range=parseRange(rangeHeader,total);if(range==null){headers.put("Content-Range","bytes */"+total);headers.put("Content-Length","0");return new WebResourceResponse(resource.mime,null,416,"Range Not Satisfiable",headers,new ByteArrayInputStream(new byte[0]));}
            headers.put("Content-Range","bytes "+range.start+"-"+range.end+"/"+total);headers.put("Content-Length",Long.toString(range.length()));
            input=new FileInputStream(resource.file);input.getChannel().position(range.start);
            recordAccess(resource);
            WebResourceResponse partial=new WebResourceResponse(resource.mime,null,206,"Partial Content",headers,new LimitedInputStream(input,range.length()));input=null;return partial;
        }catch(Exception ignored){
            // input!=null aquí significa que el descriptor se abrió pero la respuesta nunca llegó a existir.
            if(input!=null){try{input.close();}catch(IOException alsoIgnored){}}
            return ShellActivity.blocked();
        }
    }
    private static ByteRange parseRange(String header,long total){
        if(total<=0||header==null)return null;String value=header.trim();if(!value.regionMatches(true,0,"bytes=",0,6)||value.indexOf(',')>=0)return null;String spec=value.substring(6).trim();int dash=spec.indexOf('-');if(dash<0||dash!=spec.lastIndexOf('-'))return null;
        try{String left=spec.substring(0,dash).trim(),right=spec.substring(dash+1).trim();long start,end;if(left.isEmpty()){long suffix=Long.parseLong(right);if(suffix<=0)return null;start=Math.max(0,total-suffix);end=total-1;}else{start=Long.parseLong(left);end=right.isEmpty()?total-1:Long.parseLong(right);if(start<0||start>=total||end<start)return null;end=Math.min(end,total-1);}return new ByteRange(start,end);}catch(NumberFormatException ignored){return null;}
    }
    synchronized void clear(){known.clear();ready.clear();mimeTypes.clear();synchronized(protectedFiles){protectedFiles.clear();}downloading.clear();watching.clear();failed.clear();lastProgress.clear();TelegramFileProvider.clear();}
}
