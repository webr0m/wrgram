package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.view.View;
import android.view.ViewGroup;
import android.widget.LinearLayout;
import android.widget.Button;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import java.util.Arrays;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Uses only the unconnected screen. Never authenticates or reads a Telegram conversation. */
@RunWith(AndroidJUnit4.class)
public class NavigationRegressionTest {
    @org.junit.Before public void accessDeclaration() throws Exception { AccessTestSupport.allow(); }
    @org.junit.After public void removeDeclaration() throws Exception { AccessTestSupport.reset(); }
    private static View named(View root, String name) {
        if (root instanceof Button && (name.contentEquals(((TextView) root).getText()) || (name + " ✓").contentEquals(((TextView) root).getText()))) return root;
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) {
            View found = named(((ViewGroup) root).getChildAt(i), name); if (found != null) return found;
        }
        return null;
    }
    private static void click(MainActivity activity, String name) {
        View button = named(activity.getWindow().getDecorView(), name);
        assertNotNull("Missing control: " + name, button); assertTrue(button.isEnabled()); button.performClick();
    }
    @Test public void unconnectedNavigationAndThemesSurviveRecreation() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                assertFalse(((WrgramApplication) activity.getApplication()).telegram().ready());
                click(activity, "Ajustes");
                for (String name : Palette.NAMES) assertNotNull(named(activity.getWindow().getDecorView(), name));
                activity.screen.assistantDraft = "WRGRAM_FIXTURE: instrucción local sin cuenta";
            });
            scenario.recreate();
            scenario.onActivity(activity -> {
                assertEquals("settings", activity.screen.page);
                assertEquals("WRGRAM_FIXTURE: instrucción local sin cuenta", activity.screen.assistantDraft);
                click(activity, "Extras"); assertEquals("plugins", activity.screen.page);
                click(activity, "WR IA"); assertEquals("assistant", activity.screen.page);
                View send = named(activity.getWindow().getDecorView(), "Consultar WR IA");
                assertNotNull(send); assertFalse(send.isEnabled());
                click(activity, "Revocar consentimiento y vaciar conversación");
                AssistantController assistant = ((WrgramApplication) activity.getApplication()).assistant();
                assertFalse(assistant.consent); assertTrue(assistant.history().isEmpty());
                assertEquals("", activity.screen.assistantDraft);
                click(activity, "Mensajes"); assertEquals("home", activity.screen.page);
            });
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        }
    }
    @Test public void compatibilityChatAndMessageRowsRenderLocalThumbnails()throws Exception{
        File[] image={null};NativeMediaStore[] store={null};AtomicReference<ConversationAdapter.Holder> avatar=new AtomicReference<>(),preview=new AtomicReference<>();
        try(ActivityScenario<MainActivity> scenario=ActivityScenario.launch(MainActivity.class)){
            scenario.onActivity(activity->{
                try{
                    TdSession session=((WrgramApplication)activity.getApplication()).telegram();File folder=session.filesDirectory();assertTrue(folder.mkdirs()||folder.isDirectory());image[0]=new File(folder,"compat-thumbnail-test.jpg");
                    Bitmap source=Bitmap.createBitmap(2,2,Bitmap.Config.ARGB_8888);try(java.io.FileOutputStream output=new java.io.FileOutputStream(image[0])){assertTrue(source.compress(Bitmap.CompressFormat.JPEG,90,output));}finally{source.recycle();}
                    TdApi.File file=new TdApi.File();file.id=9951;file.size=image[0].length();file.expectedSize=image[0].length();file.local=new TdApi.LocalFile(image[0].getAbsolutePath(),true,false,false,true,0,file.size,file.size);
                    store[0]=new NativeMediaStore(activity,session);ConversationAdapter adapter=new ConversationAdapter(activity.palette,16,false,id->{},activity,store[0]);
                    adapter.submitList(Arrays.asList(new ConversationAdapter.Row(1,"Contacto","","","C",true,false,0,file,null,"image/jpeg"),new ConversationAdapter.Row(2,"Remitente","Foto","","",false,false,0,null,file,"image/jpeg")),()->{
                        avatar.set(adapter.onCreateViewHolder(new LinearLayout(activity),0));adapter.onBindViewHolder(avatar.get(),0);
                        preview.set(adapter.onCreateViewHolder(new LinearLayout(activity),0));adapter.onBindViewHolder(preview.get(),1);
                    });
                }catch(Exception failure){throw new AssertionError(failure);}
            });
            long deadline=android.os.SystemClock.uptimeMillis()+5000;boolean rendered=false;
            while(android.os.SystemClock.uptimeMillis()<deadline&&!rendered){InstrumentationRegistry.getInstrumentation().waitForIdleSync();AtomicBoolean ready=new AtomicBoolean();scenario.onActivity(activity->ready.set(avatar.get()!=null&&preview.get()!=null&&avatar.get().avatarImage.getDrawable()!=null&&preview.get().preview.getDrawable()!=null));rendered=ready.get();if(!rendered)android.os.SystemClock.sleep(25);}
            assertTrue("Legacy compatibility rows should render loaded Telegram thumbnails",rendered);
            scenario.onActivity(activity->{if(store[0]!=null)store[0].clear();});
        }finally{if(image[0]!=null)Files.deleteIfExists(image[0].toPath());}
    }
}
