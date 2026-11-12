package cc.webrom.wrgram;

import java.util.function.IntFunction;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Download-manager DTOs and per-network rules. Pure: no Android, no network, no credentials. */
final class DownloadsPolicy {
    private DownloadsPolicy(){}

    static final int MAX_QUERY=128;
    static final int MAX_OFFSET=512;
    static final int MAX_LIMIT=50;

    static String query(JSONObject params){
        Object value=params.opt("query");
        if(value==null)return "";
        if(!(value instanceof String)||((String)value).length()>MAX_QUERY)throw new IllegalArgumentException("Búsqueda de descargas no válida.");
        return (String)value;
    }

    static String offset(JSONObject params){
        Object value=params.opt("offset");
        if(value==null)return "";
        if(!(value instanceof String)||((String)value).length()>MAX_OFFSET)throw new IllegalArgumentException("Offset de descargas no válido.");
        return (String)value;
    }

    static boolean onlyActive(JSONObject params){return params.optBoolean("active",false)&&!params.optBoolean("completed",false);}
    static boolean onlyCompleted(JSONObject params){return params.optBoolean("completed",false)&&!params.optBoolean("active",false);}

    static String network(JSONObject params){
        Object value=params.opt("network");
        if(!(value instanceof String))throw new IllegalArgumentException("Elige una red: wifi, mobile, roaming u other.");
        String network=(String)value;
        if(!network.matches("wifi|mobile|roaming|other|none"))throw new IllegalArgumentException("Elige una red: wifi, mobile, roaming u other.");
        return network;
    }

    static String level(JSONObject params){
        Object value=params.opt("level");
        if(!(value instanceof String))throw new IllegalArgumentException("Elige un nivel: off, low, medium o high.");
        String level=(String)value;
        if(!level.matches("off|low|medium|high"))throw new IllegalArgumentException("Elige un nivel: off, low, medium o high.");
        return level;
    }

    static TdApi.NetworkType networkType(String key){
        switch(key){
            case "wifi":return new TdApi.NetworkTypeWiFi();
            case "mobile":return new TdApi.NetworkTypeMobile();
            case "roaming":return new TdApi.NetworkTypeMobileRoaming();
            case "other":return new TdApi.NetworkTypeOther();
            case "none":return new TdApi.NetworkTypeNone();
            default:throw new IllegalArgumentException("Elige una red: wifi, mobile, roaming u other.");
        }
    }

    static JSONObject settings(TdApi.AutoDownloadSettings value){
        if(value==null)return new JSONObject();
        return object("enabled",value.isAutoDownloadEnabled,"photoLimit",value.maxPhotoFileSize,
            "videoLimit",value.maxVideoFileSize,"otherLimit",value.maxOtherFileSize,"bitrate",value.videoUploadBitrate,
            "preloadVideos",value.preloadLargeVideos,"preloadAudio",value.preloadNextAudio,"preloadStories",value.preloadStories,
            "lessDataForCalls",value.useLessDataForCalls);
    }

    static JSONObject presets(TdApi.AutoDownloadSettingsPresets value){
        JSONObject low=object("label","Bajo","settings",settings(value.low));
        JSONObject medium=object("label","Medio","settings",settings(value.medium));
        JSONObject high=object("label","Alto","settings",settings(value.high));
        return object("low",low,"medium",medium,"high",high);
    }

    static TdApi.AutoDownloadSettings settings(JSONObject params,TdApi.AutoDownloadSettingsPresets presets){
        if(presets==null||presets.medium==null)throw new IllegalArgumentException("Telegram no devolvió los niveles de descarga automática.");
        String level=level(params);
        TdApi.AutoDownloadSettings source;
        switch(level){
            case "off":source=presets.medium;break;
            case "low":source=presets.low!=null?presets.low:presets.medium;break;
            case "medium":source=presets.medium;break;
            default:source=presets.high!=null?presets.high:presets.medium;break;
        }
        TdApi.AutoDownloadSettings value=new TdApi.AutoDownloadSettings();
        value.isAutoDownloadEnabled=!level.equals("off");
        value.maxPhotoFileSize=level.equals("off")?0:source.maxPhotoFileSize;
        value.maxVideoFileSize=level.equals("off")?0:source.maxVideoFileSize;
        value.maxOtherFileSize=level.equals("off")?0:source.maxOtherFileSize;
        value.videoUploadBitrate=source.videoUploadBitrate;
        value.preloadLargeVideos=level.equals("off")?false:source.preloadLargeVideos;
        value.preloadNextAudio=level.equals("off")?false:source.preloadNextAudio;
        value.preloadStories=level.equals("off")?false:source.preloadStories;
        value.useLessDataForCalls=source.useLessDataForCalls;
        return value;
    }

    static String name(TdApi.Message message){
        if(message==null||message.content==null)return "";
        TdApi.MessageContent content=message.content;
        if(content instanceof TdApi.MessageDocument)return ((TdApi.MessageDocument)content).document.fileName;
        if(content instanceof TdApi.MessageVideo)return ((TdApi.MessageVideo)content).video.fileName;
        if(content instanceof TdApi.MessageAudio)return ((TdApi.MessageAudio)content).audio.fileName;
        if(content instanceof TdApi.MessageVoiceNote)return "Nota de voz.ogg";
        if(content instanceof TdApi.MessagePhoto)return "Foto.jpg";
        if(content instanceof TdApi.MessageSticker)return "Sticker.webp";
        return "";
    }

    static String kind(TdApi.Message message){
        if(message==null||message.content==null)return "archivo";
        TdApi.MessageContent content=message.content;
        if(content instanceof TdApi.MessageDocument)return "documento";
        if(content instanceof TdApi.MessageVideo)return "vídeo";
        if(content instanceof TdApi.MessageAudio)return "audio";
        if(content instanceof TdApi.MessageVoiceNote)return "nota de voz";
        if(content instanceof TdApi.MessagePhoto)return "foto";
        if(content instanceof TdApi.MessageSticker)return "sticker";
        if(content instanceof TdApi.MessageAnimation)return "animación";
        return "archivo";
    }

    static JSONObject counts(TdApi.DownloadedFileCounts value){
        if(value==null)return object("active",0,"paused",0,"completed",0);
        return object("active",value.activeCount,"paused",value.pausedCount,"completed",value.completedCount);
    }

    static JSONObject entry(TdApi.FileDownload download,TdApi.File file,String chatTitle){
        if(download==null)return null;
        long size=file!=null?(file.size>0?file.size:file.expectedSize):0;
        long downloaded=file!=null&&file.local!=null?file.local.downloadedPrefixSize:0;
        boolean completed=file!=null&&file.local!=null&&file.local.isDownloadingCompleted;
        boolean active=file!=null&&file.local!=null&&file.local.isDownloadingActive&&!download.isPaused;
        String state;
        if(download.completeDate>0)state="completed";
        else if(completed)state="completed";
        else if(download.isPaused)state="paused";
        else if(active)state="downloading";
        else state="stopped";
        int progress=size>0?(int)Math.min(100L,Math.round(100.0*downloaded/size)):(state.equals("completed")?100:0);
        TdApi.Message message=download.message;
        return object("fileId",String.valueOf(download.fileId),
            "name",name(message),"kind",kind(message),
            "size",size,"downloaded",downloaded,"progress",progress,"state",state,
            "date",download.addDate,"completeDate",download.completeDate,
            "chatId",message==null?"0":String.valueOf(message.chatId),
            "messageId",message==null?"0":String.valueOf(message.id),
            "chatTitle",chatTitle==null?"":chatTitle,
            "canPause",state.equals("downloading")||state.equals("paused"),
            "canCancel",state.equals("downloading"),
            "canRetry",state.equals("paused")||state.equals("stopped"));
    }

    static JSONObject queue(TdApi.FoundFileDownloads found,IntFunction<String> chatTitle,IntFunction<TdApi.File> cache)throws Exception{
        JSONArray items=new JSONArray();
        if(found.files!=null)for(TdApi.FileDownload download:found.files){
            if(download==null)continue;
            JSONObject entry=entry(download,cache.apply(download.fileId),chatTitle.apply(download.fileId));
            if(entry!=null)items.put(entry);
        }
        return object("counts",counts(found.totalCounts),"items",items,"nextOffset",found.nextOffset==null?"":found.nextOffset);
    }

    static JSONArray storedRules(String raw){
        JSONObject stored;
        try{stored=raw==null||raw.isEmpty()?new JSONObject():new JSONObject(raw);}
        catch(Exception invalid){stored=new JSONObject();}
        JSONArray networks=new JSONArray();
        for(String key:new String[]{"wifi","mobile","roaming","other"}){
            String level=stored.optString(key,"");
            networks.put(object("network",key,"level",level.matches("off|low|medium|high")?level:""));
        }
        return networks;
    }

    static void rememberRule(StringBuilder raw,String network,String level){
        JSONObject stored;
        try{stored=raw.length()==0?new JSONObject():new JSONObject(raw.toString());stored.put(network,level);raw.setLength(0);raw.append(stored.toString());}
        catch(Exception ignored){}
    }

    private static JSONObject object(Object...pairs){try{JSONObject value=new JSONObject();for(int i=0;i<pairs.length;i+=2)value.put((String)pairs[i],pairs[i+1]);return value;}catch(Exception ignored){throw new IllegalArgumentException("Invalid DTO");}}
}
