package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.webkit.WebView;
import android.view.View;
import android.view.ViewGroup;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Exercises the real bundled WebView image pipeline without an account or Telegram content. */
@RunWith(AndroidJUnit4.class)
public class MediaRenderingTest {
    @org.junit.Before public void accessDeclaration() throws Exception { AccessTestSupport.allow(); }
    @org.junit.After public void removeDeclaration() throws Exception { AccessTestSupport.reset(); }

    private static WebView web(View view){if(view instanceof WebView)return (WebView)view;if(view instanceof ViewGroup)for(int i=0;i<((ViewGroup)view).getChildCount();i++){WebView found=web(((ViewGroup)view).getChildAt(i));if(found!=null)return found;}return null;}
    private static String js(ActivityScenario<ShellActivity> scenario,String script)throws Exception{
        CountDownLatch done=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        scenario.onActivity(activity->{assertFalse("Never inspect an authenticated account",((WrgramApplication)activity.getApplication()).telegram().ready());WebView view=web(activity.getWindow().getDecorView());assertNotNull(view);view.evaluateJavascript(script,result->{value.set(result);done.countDown();});});
        assertTrue(done.await(10,TimeUnit.SECONDS));return value.get();
    }
    private static void until(ActivityScenario<ShellActivity> scenario,String predicate)throws Exception{
        long end=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
        while(System.nanoTime()<end){if("true".equals(js(scenario,predicate)))return;InstrumentationRegistry.getInstrumentation().waitForIdleSync();}
        fail("Bundled UI condition not met: "+predicate);
    }
    private static void loaded(ActivityScenario<ShellActivity> scenario)throws Exception{until(scenario,"document.readyState==='complete' && !!document.querySelector('.auth-card') && !!window.WRGramNative");}

    // 1x1 JPEG generated locally; no Telegram data or account content.
    private static final String JPEG="/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHREAAgEEAwAAAAAAAAAAAAAAAAECAwQFEQYSIf/aAAgBAQAAPwD2OrK2lX//2Q==";

    @Test public void registeredMediaIsServedAndPaintedByTheBundledWebView()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            final int id=424242;
            scenario.onActivity(activity->{
                try{
                    WrgramApplication app=(WrgramApplication)activity.getApplication();
                    java.lang.reflect.Field bridgeField=ShellActivity.class.getDeclaredField("bridge");bridgeField.setAccessible(true);
                    NativeBridge bridge=(NativeBridge)bridgeField.get(activity);
                    java.lang.reflect.Field mediaField=NativeBridge.class.getDeclaredField("media");mediaField.setAccessible(true);
                    NativeMediaStore store=(NativeMediaStore)mediaField.get(bridge);
                    File folder=app.telegram().filesDirectory();assertTrue(folder.mkdirs()||folder.isDirectory());
                    File file=new File(folder,"webview-media-test.jpg");byte[] bytes=android.util.Base64.decode(JPEG,android.util.Base64.DEFAULT);Files.write(file.toPath(),bytes);
                    TdApi.File td=new TdApi.File();td.id=id;td.size=bytes.length;td.expectedSize=bytes.length;td.local=new TdApi.LocalFile(file.getAbsolutePath(),true,false,false,true,0,bytes.length,bytes.length);
                    JSONObject dto=store.register(td,"image/jpeg","image","Test");assertTrue(dto.getBoolean("ready"));
                }catch(Exception error){throw new AssertionError(error);}
            });
            js(scenario,"window.__mediaFetch=0;fetch('/media/424242').then(r=>{window.__mediaFetch=r.status;}).catch(()=>{window.__mediaFetch=-1;});true");
            until(scenario,"window.__mediaFetch!==0");
            assertEquals("200",js(scenario,"String(window.__mediaFetch)").replace("\"",""));
            js(scenario,"window.__media='pending';(()=>{const probe=document.createElement('img');probe.id='media-probe';probe.onload=()=>window.__media='ok:'+probe.naturalWidth+'x'+probe.naturalHeight;probe.onerror=()=>window.__media='error';probe.src='https://appassets.androidplatform.net/media/424242';document.body.appendChild(probe);return true;})()");
            until(scenario,"window.__media!=='pending'");
            assertEquals("\"ok:1x1\"",js(scenario,"window.__media"));
            assertEquals("true",js(scenario,"(()=>{const probe=document.getElementById('media-probe');const box=probe.getBoundingClientRect();const style=getComputedStyle(probe);return box.width>0&&box.height>0&&style.visibility==='visible'&&style.opacity!=='0'&&style.display!=='none';})()"));
        }
    }

    @Test public void completedDownloadBecomesAddressableAfterFileUpdate()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            final int id=424243;
            scenario.onActivity(activity->{
                try{
                    WrgramApplication app=(WrgramApplication)activity.getApplication();
                    java.lang.reflect.Field bridgeField=ShellActivity.class.getDeclaredField("bridge");bridgeField.setAccessible(true);
                    NativeBridge bridge=(NativeBridge)bridgeField.get(activity);
                    java.lang.reflect.Field mediaField=NativeBridge.class.getDeclaredField("media");mediaField.setAccessible(true);
                    NativeMediaStore store=(NativeMediaStore)mediaField.get(bridge);
                    File folder=app.telegram().filesDirectory();assertTrue(folder.mkdirs()||folder.isDirectory());
                    File file=new File(folder,"webview-media-update.jpg");byte[] bytes=android.util.Base64.decode(JPEG,android.util.Base64.DEFAULT);Files.write(file.toPath(),bytes);
                    TdApi.File pending=new TdApi.File();pending.id=id;pending.size=bytes.length;pending.expectedSize=bytes.length;
                    pending.local=new TdApi.LocalFile("",true,false,true,false,0,0,0);
                    assertFalse(store.register(pending,"image/jpeg","image","Test").getBoolean("ready"));
                    TdApi.File completed=new TdApi.File();completed.id=id;completed.size=bytes.length;completed.expectedSize=bytes.length;
                    completed.local=new TdApi.LocalFile(file.getAbsolutePath(),true,false,false,true,0,bytes.length,bytes.length);
                    app.telegram().updateFile(completed);
                    org.json.JSONArray ready=store.refreshReady();boolean listed=false;
                    for(int i=0;i<ready.length();i++)if(ready.getInt(i)==id)listed=true;
                    assertTrue("Completed file must become ready",listed);
                    assertNotNull("Completed file must be served",store.displayFile(id));
                }catch(Exception error){throw new AssertionError(error);}
            });
            js(scenario,"window.__mediaUpdate=0;fetch('/media/424243').then(r=>{window.__mediaUpdate=r.status;}).catch(()=>{window.__mediaUpdate=-1;});true");
            until(scenario,"window.__mediaUpdate!==0");
            assertEquals("200",js(scenario,"String(window.__mediaUpdate)").replace("\"",""));
        }
    }

    @Test public void chatAvatarPaintsWhenNativeReportsPhotoReady()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            final int id=424245;
            scenario.onActivity(activity->{
                try{
                    WrgramApplication app=(WrgramApplication)activity.getApplication();
                    java.lang.reflect.Field bridgeField=ShellActivity.class.getDeclaredField("bridge");bridgeField.setAccessible(true);
                    NativeBridge bridge=(NativeBridge)bridgeField.get(activity);
                    java.lang.reflect.Field mediaField=NativeBridge.class.getDeclaredField("media");mediaField.setAccessible(true);
                    NativeMediaStore store=(NativeMediaStore)mediaField.get(bridge);
                    File folder=app.telegram().filesDirectory();assertTrue(folder.mkdirs()||folder.isDirectory());
                    File file=new File(folder,"webview-avatar.jpg");byte[] bytes=android.util.Base64.decode(JPEG,android.util.Base64.DEFAULT);Files.write(file.toPath(),bytes);
                    TdApi.File td=new TdApi.File();td.id=id;td.size=bytes.length;td.expectedSize=bytes.length;td.local=new TdApi.LocalFile(file.getAbsolutePath(),true,false,false,true,0,bytes.length,bytes.length);
                    assertTrue(store.register(td,"image/jpeg","image","Grupo de prueba").getBoolean("ready"));
                }catch(Exception error){throw new AssertionError(error);}
            });
            // Drives the bundled React chat list exactly as a native state event would, so
            // the avatar test covers Avatar -> MediaView -> CSP/CSS -> /media interception.
            js(scenario,"(()=>{const photo={id:424245,ready:true,mime:'image/jpeg',kind:'image',name:'Grupo de prueba',size:617,downloadLimit:134217728};const chat={id:'123456789',title:'Grupo de prueba',preview:'Hola',date:0,unread:0,marked:false,bot:false,type:'group',pinned:false,muted:false,archived:false,supported:true,photo};window.WRGramNative.onmessage({data:JSON.stringify({event:'state',state:{ready:true,auth:'ready',consent:true,online:true,chats:[chat],messages:[],active:'0',mediaReady:[424245],mediaLoading:[],mediaFailed:[]}})});return true;})()");
            until(scenario,"!!document.querySelector('.chat-row .avatar img')");
            assertEquals("true",js(scenario,"(()=>{const img=document.querySelector('.chat-row .avatar img');const box=img.getBoundingClientRect();return img.complete&&img.naturalWidth>0&&box.width>0&&box.height>0&&getComputedStyle(img).display!=='none';})()"));
        }
    }

    @Test public void bundledUiDoesNotOverflowHorizontallyAtPhoneWidth()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            assertEquals("true",js(scenario,"document.documentElement.scrollWidth<=window.innerWidth+1"));
            js(scenario,"(()=>{const trigger=document.querySelector('.mobile-nav button[aria-label=\"Abrir menú de usuario\"]')||document.querySelector('button[aria-label=\"Abrir menú de usuario\"]');if(!trigger)return false;trigger.click();return true;})()");
            until(scenario,"!!document.querySelector('.account-menu')");
            assertEquals("true",js(scenario,"document.documentElement.scrollWidth<=window.innerWidth+1 && document.querySelector('.account-menu').scrollWidth<=document.querySelector('.account-menu').clientWidth+1"));
            js(scenario,"(()=>{const more=document.querySelector('.account-menu-heading .text-button');if(!more)return false;more.click();return true;})()");
            until(scenario,"!!document.querySelector('.settings-page')");
            assertEquals("true",js(scenario,"document.documentElement.scrollWidth<=window.innerWidth+1 && document.querySelector('.settings-page').scrollWidth<=document.querySelector('.settings-page').clientWidth+1"));
        }
    }

    @Test public void opensAndTurnsPagesOfALocalPdfInTheBundledViewer()throws Exception{
        File[] fixture={null};
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            scenario.onActivity(activity->{
                try{
                    WrgramApplication app=(WrgramApplication)activity.getApplication();
                    java.lang.reflect.Field bridgeField=ShellActivity.class.getDeclaredField("bridge");
                    bridgeField.setAccessible(true);
                    java.lang.reflect.Field mediaField=NativeBridge.class.getDeclaredField("media");
                    mediaField.setAccessible(true);
                    NativeMediaStore store=(NativeMediaStore)mediaField.get(bridgeField.get(activity));
                    File folder=app.telegram().filesDirectory();
                    assertTrue(folder.mkdirs()||folder.isDirectory());
                    fixture[0]=File.createTempFile("wrgram-pdf-test-",".pdf",folder);
                    android.graphics.pdf.PdfDocument pdf=new android.graphics.pdf.PdfDocument();
                    try(java.io.FileOutputStream output=new java.io.FileOutputStream(fixture[0])){
                        for(int number=1;number<=2;number++){
                            android.graphics.pdf.PdfDocument.Page page=pdf.startPage(new android.graphics.pdf.PdfDocument.PageInfo.Builder(160,120,number).create());
                            android.graphics.Paint paint=new android.graphics.Paint();
                            paint.setColor(number==1?android.graphics.Color.RED:android.graphics.Color.BLUE);
                            page.getCanvas().drawRect(0,0,160,120,paint);
                            pdf.finishPage(page);
                        }
                        pdf.writeTo(output);
                    }finally{pdf.close();}
                    TdApi.File file=new TdApi.File();
                    file.id=424246;file.size=fixture[0].length();file.expectedSize=file.size;
                    file.local=new TdApi.LocalFile(fixture[0].getAbsolutePath(),true,false,false,true,0,file.size,file.size);
                    assertTrue(store.register(file,"application/pdf","file","Prueba.pdf").getBoolean("ready"));
                }catch(Exception failure){throw new AssertionError(failure);}
            });
            js(scenario,"""
                (()=>{const media={id:424246,ready:true,mime:'application/pdf',kind:'file',name:'Prueba.pdf',size:1200};
                  const chat={id:'123456789',title:'Prueba local',preview:'Archivo',date:0,unread:0,marked:false,bot:false,type:'private',pinned:false,muted:false,archived:false,supported:true};
                  const message={id:'1',chatId:chat.id,sender:'Prueba',text:'',date:1,outgoing:false,reactions:[],media};
                  window.WRGramNative.onmessage({data:JSON.stringify({event:'state',state:{ready:true,auth:'ready',consent:true,online:true,chats:[chat],messages:[message],active:chat.id,mediaReady:[media.id],mediaLoading:[],mediaFailed:[]}})});
                  return true;
                })()
                """);
            until(scenario,"!!document.querySelector('.file-actions button')");
            js(scenario,"document.querySelector('.file-actions button').click();true");
            until(scenario,"!!document.querySelector('.document-sheet[aria-busy=false] canvas:not([hidden])') || !!document.querySelector('.document-sheet [role=alert]')");
            assertEquals("null",js(scenario,"document.querySelector('.document-sheet [role=alert]')?.textContent ?? null"));
            assertEquals("true",js(scenario,"(()=>{const rgb=document.querySelector('.document-sheet canvas').getContext('2d').getImageData(5,5,1,1).data;return rgb[0]>200&&rgb[2]<40;})()"));
            js(scenario,"document.querySelector('.document-toolbar button:nth-of-type(2)').click();true");
            until(scenario,"(()=>{const rgb=document.querySelector('.document-sheet canvas')?.getContext('2d').getImageData(5,5,1,1).data;return rgb&&rgb[2]>200&&rgb[0]<40;})()");
        }finally{
            if(fixture[0]!=null)Files.deleteIfExists(fixture[0].toPath());
        }
    }

    @Test public void nativePlayerBindsAndPlaysTheLocalVideo()throws Exception{
        android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File file=File.createTempFile("wrgram-player-test-",".mp4",context.getCacheDir());
        try{
            try(java.io.InputStream input=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("player-sample.mp4")){
                Files.copy(input,file.toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
            }
            android.content.Intent intent=new android.content.Intent(context,PlayerActivity.class)
                    .putExtra(PlayerActivity.EXTRA_FILE,file.getAbsolutePath()).putExtra(PlayerActivity.EXTRA_TITLE,"Vídeo de prueba");
            try(ActivityScenario<PlayerActivity> scenario=ActivityScenario.launch(intent)){
                long deadline=android.os.SystemClock.uptimeMillis()+10_000;
                AtomicReference<Boolean> played=new AtomicReference<>(false);
                while(!played.get()&&android.os.SystemClock.uptimeMillis()<deadline){
                    scenario.onActivity(activity->{
                        View surface=activity.getWindow().getDecorView().findViewById(androidx.media3.ui.R.id.exo_content_frame);
                        assertNotNull(surface);
                        View current=surface;
                        while(!(current instanceof androidx.media3.ui.PlayerView)&&current.getParent() instanceof View)current=(View)current.getParent();
                        assertTrue(current instanceof androidx.media3.ui.PlayerView);
                        androidx.media3.common.Player player=((androidx.media3.ui.PlayerView)current).getPlayer();
                        assertNotNull("The video surface needs the live player",player);
                        played.set(player.getCurrentPosition()>0&&player.getVideoSize().width>0);
                    });
                    if(!played.get())android.os.SystemClock.sleep(80);
                }
                assertTrue("ExoPlayer did not render the local video",played.get());
            }
        }finally{Files.deleteIfExists(file.toPath());}
    }
}
