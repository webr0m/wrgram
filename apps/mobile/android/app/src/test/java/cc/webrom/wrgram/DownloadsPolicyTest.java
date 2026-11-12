package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.concurrent.atomic.AtomicReference;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class DownloadsPolicyTest {
    private static JSONObject params(String json){try{return new JSONObject(json);}catch(Exception failure){throw new AssertionError(failure);}}
    private static void rejected(Runnable action){try{action.run();fail("Se esperaba un rechazo");}catch(IllegalArgumentException expected){assertFalse(expected.getMessage().isEmpty());}}

    private static TdApi.File file(long size,long downloaded,boolean completed,boolean active){
        TdApi.File value=new TdApi.File();
        value.size=size;
        value.expectedSize=size;
        value.local=new TdApi.LocalFile();
        value.local.downloadedPrefixSize=downloaded;
        value.local.isDownloadingCompleted=completed;
        value.local.isDownloadingActive=active;
        return value;
    }

    private static TdApi.Message document(String name,long chatId,long messageId){
        TdApi.Message message=new TdApi.Message();
        message.chatId=chatId;
        message.id=messageId;
        TdApi.MessageDocument content=new TdApi.MessageDocument();
        TdApi.Document doc=new TdApi.Document();
        doc.fileName=name;
        content.document=doc;
        message.content=content;
        return message;
    }

    @Test
    public void anActiveDownloadShowsItsProgressAndButtons()throws Exception{
        TdApi.FileDownload download=new TdApi.FileDownload();
        download.fileId=77;
        download.message=document("informe.pdf",123,456);
        download.addDate=1_700_000_000;
        download.isPaused=false;
        JSONObject entry=DownloadsPolicy.entry(download,file(1024,512,false,true),"Proyectos");
        assertEquals("77",entry.getString("fileId"));
        assertEquals("informe.pdf",entry.getString("name"));
        assertEquals("documento",entry.getString("kind"));
        assertEquals("Proyectos",entry.getString("chatTitle"));
        assertEquals("123",entry.getString("chatId"));
        assertEquals("456",entry.getString("messageId"));
        assertEquals("downloading",entry.getString("state"));
        assertEquals(1024,entry.getLong("size"));
        assertEquals(512,entry.getLong("downloaded"));
        assertEquals(50,entry.getInt("progress"));
        assertTrue(entry.getBoolean("canPause"));
        assertTrue(entry.getBoolean("canCancel"));
        assertFalse(entry.getBoolean("canRetry"));
    }

    @Test
    public void aPausedDownloadCanOnlyBeResumed()throws Exception{
        TdApi.FileDownload download=new TdApi.FileDownload();
        download.fileId=8;
        download.message=document("video.mp4",1,2);
        download.isPaused=true;
        JSONObject entry=DownloadsPolicy.entry(download,file(4096,1024,false,false),"Canal");
        assertEquals("paused",entry.getString("state"));
        assertTrue(entry.getBoolean("canPause"));
        assertFalse(entry.getBoolean("canCancel"));
        assertTrue(entry.getBoolean("canRetry"));
    }

    @Test
    public void aCompletedDownloadIsReportedDoneEvenWithoutTheFile()throws Exception{
        TdApi.FileDownload download=new TdApi.FileDownload();
        download.fileId=9;
        download.message=document("audio.mp3",1,3);
        download.completeDate=1_700_100_000;
        JSONObject entry=DownloadsPolicy.entry(download,null,"");
        assertEquals("completed",entry.getString("state"));
        assertEquals(100,entry.getInt("progress"));
        assertFalse(entry.getBoolean("canPause"));
        assertFalse(entry.getBoolean("canCancel"));
        assertFalse(entry.getBoolean("canRetry"));
    }

    @Test
    public void voiceNotesAndPhotosGetANameAndKind()throws Exception{
        TdApi.Message voice=new TdApi.Message();
        TdApi.MessageVoiceNote content=new TdApi.MessageVoiceNote();
        content.voiceNote=new TdApi.VoiceNote();
        voice.content=content;
        assertEquals("Nota de voz.ogg",DownloadsPolicy.name(voice));
        assertEquals("nota de voz",DownloadsPolicy.kind(voice));
        TdApi.Message photo=new TdApi.Message();
        photo.content=new TdApi.MessagePhoto();
        assertEquals("Foto.jpg",DownloadsPolicy.name(photo));
        assertEquals("foto",DownloadsPolicy.kind(photo));
        assertEquals("",DownloadsPolicy.name(null));
        assertEquals("archivo",DownloadsPolicy.kind(null));
    }

    @Test
    public void theQueueSerializesCountsAndEntries()throws Exception{
        TdApi.FileDownload download=new TdApi.FileDownload();
        download.fileId=5;
        download.message=document("doc.zip",10,20);
        download.isPaused=true;
        TdApi.FoundFileDownloads found=new TdApi.FoundFileDownloads();
        found.totalCounts=new TdApi.DownloadedFileCounts();
        found.totalCounts.activeCount=1;
        found.totalCounts.pausedCount=2;
        found.totalCounts.completedCount=3;
        found.files=new TdApi.FileDownload[]{download,null};
        found.nextOffset="next-1";
        AtomicReference<String> titles=new AtomicReference<>("Canal · doc.zip");
        JSONObject queue=DownloadsPolicy.queue(found,id->titles.get(),id->file(1000,0,false,false));
        assertEquals(1,queue.getJSONObject("counts").getInt("active"));
        assertEquals(2,queue.getJSONObject("counts").getInt("paused"));
        assertEquals(3,queue.getJSONObject("counts").getInt("completed"));
        assertEquals("next-1",queue.getString("nextOffset"));
        JSONArray items=queue.getJSONArray("items");
        assertEquals(1,items.length());
        assertEquals("doc.zip",items.getJSONObject(0).getString("name"));
    }

    @Test
    public void presetsCarryTheThreeLevelsOfTelegram()throws Exception{
        TdApi.AutoDownloadSettingsPresets presets=new TdApi.AutoDownloadSettingsPresets();
        presets.low=autoSettings(true,1_000_000,10_000_000,100_000);
        presets.medium=autoSettings(true,5_000_000,50_000_000,1_000_000);
        presets.high=autoSettings(true,10_000_000,100_000_000,10_000_000);
        JSONObject value=DownloadsPolicy.presets(presets);
        assertEquals(10_000_000,value.getJSONObject("low").getJSONObject("settings").getLong("videoLimit"));
        assertEquals(50_000_000,value.getJSONObject("medium").getJSONObject("settings").getLong("videoLimit"));
        assertEquals(10_000_000,value.getJSONObject("high").getJSONObject("settings").getLong("otherLimit"));
        assertEquals("Bajo",value.getJSONObject("low").getString("label"));
    }

    private static TdApi.AutoDownloadSettings autoSettings(boolean enabled,int photo,long video,long other){
        TdApi.AutoDownloadSettings value=new TdApi.AutoDownloadSettings();
        value.isAutoDownloadEnabled=enabled;
        value.maxPhotoFileSize=photo;
        value.maxVideoFileSize=video;
        value.maxOtherFileSize=other;
        value.videoUploadBitrate=128;
        value.preloadLargeVideos=enabled;
        value.preloadNextAudio=enabled;
        value.preloadStories=enabled;
        value.useLessDataForCalls=false;
        return value;
    }

    @Test
    public void aRuleTurnsTheChosenPresetIntoTelegramSettings()throws Exception{
        TdApi.AutoDownloadSettingsPresets presets=new TdApi.AutoDownloadSettingsPresets();
        presets.low=autoSettings(true,1_000_000,10_000_000,100_000);
        presets.medium=autoSettings(true,5_000_000,50_000_000,1_000_000);
        presets.high=autoSettings(true,10_000_000,100_000_000,10_000_000);
        TdApi.AutoDownloadSettings wifi=DownloadsPolicy.settings(params("{\"network\":\"wifi\",\"level\":\"high\"}"),presets);
        assertTrue(wifi.isAutoDownloadEnabled);
        assertEquals(100_000_000,wifi.maxVideoFileSize);
        TdApi.AutoDownloadSettings off=DownloadsPolicy.settings(params("{\"network\":\"mobile\",\"level\":\"off\"}"),presets);
        assertFalse(off.isAutoDownloadEnabled);
        assertEquals(0,off.maxPhotoFileSize);
        assertEquals(0,off.maxVideoFileSize);
        assertEquals(0,off.maxOtherFileSize);
        assertFalse(off.preloadStories);
    }

    @Test
    public void unknownNetworksAndLevelsAreRejected()throws Exception{
        rejected(()->DownloadsPolicy.network(params("{\"network\":\"cable\"}")));
        rejected(()->DownloadsPolicy.network(params("{}")));
        rejected(()->DownloadsPolicy.level(params("{\"level\":\"turbo\"}")));
        rejected(()->DownloadsPolicy.level(params("{}")));
        rejected(()->DownloadsPolicy.query(params("{\"query\":"+"\""+repeated('a',129)+"\"}")));
    }

    private static String repeated(char letter,int count){
        StringBuilder value=new StringBuilder();
        for(int index=0;index<count;index++)value.append(letter);
        return value.toString();
    }

    @Test
    public void eachNetworkTypeMapsToItsTelegramCounterpart()throws Exception{
        assertTrue(DownloadsPolicy.networkType("wifi") instanceof TdApi.NetworkTypeWiFi);
        assertTrue(DownloadsPolicy.networkType("mobile") instanceof TdApi.NetworkTypeMobile);
        assertTrue(DownloadsPolicy.networkType("roaming") instanceof TdApi.NetworkTypeMobileRoaming);
        assertTrue(DownloadsPolicy.networkType("other") instanceof TdApi.NetworkTypeOther);
        assertTrue(DownloadsPolicy.networkType("none") instanceof TdApi.NetworkTypeNone);
        rejected(()->DownloadsPolicy.networkType("satellite"));
    }

    @Test
    public void storedRulesFallBackToUnsetAndRememberTheLastChoice()throws Exception{
        JSONArray unset=DownloadsPolicy.storedRules("");
        assertEquals(4,unset.length());
        for(int index=0;index<unset.length();index++)assertEquals("",unset.getJSONObject(index).getString("level"));
        StringBuilder raw=new StringBuilder();
        DownloadsPolicy.rememberRule(raw,"wifi","medium");
        DownloadsPolicy.rememberRule(raw,"mobile","off");
        JSONArray stored=DownloadsPolicy.storedRules(raw.toString());
        assertEquals("medium",stored.getJSONObject(0).getString("level"));
        assertEquals("off",stored.getJSONObject(1).getString("level"));
        assertEquals("",stored.getJSONObject(2).getString("level"));
        JSONArray broken=DownloadsPolicy.storedRules("esto no es json");
        assertEquals(4,broken.length());
        assertEquals("",broken.getJSONObject(0).getString("level"));
    }
}
