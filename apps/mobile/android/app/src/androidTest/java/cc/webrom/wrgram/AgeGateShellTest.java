package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Confirms the bundled React UI presents the gate while TDLib remains unopened. */
@RunWith(AndroidJUnit4.class)
public class AgeGateShellTest {
    private static WebView find(View root){if(root instanceof WebView)return (WebView)root;if(root instanceof ViewGroup)for(int i=0;i<((ViewGroup)root).getChildCount();i++){WebView found=find(((ViewGroup)root).getChildAt(i));if(found!=null)return found;}return null;}
    private static boolean ready(ActivityScenario<ShellActivity> scenario)throws Exception{CountDownLatch done=new CountDownLatch(1);java.util.concurrent.atomic.AtomicBoolean ready=new java.util.concurrent.atomic.AtomicBoolean();scenario.onActivity(activity->{try{AccessTestSupport.assertNoEngine();}catch(Exception failure){throw new AssertionError(failure);}WebView web=find(activity.getWindow().getDecorView());assertNotNull(web);web.evaluateJavascript("!!document.querySelector('.age-gate-card h1')&&document.readyState==='complete'",value->{ready.set("true".equals(value));done.countDown();});});assertTrue(done.await(5,TimeUnit.SECONDS));return ready.get();}
    @Test public void ageGateUsesNewBundledUiWithoutStartingTdlib()throws Exception{
        AccessTestSupport.reset();
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);while(System.nanoTime()<deadline&&!ready(scenario))InstrumentationRegistry.getInstrumentation().waitForIdleSync();assertTrue("Bundled React age gate did not load",ready(scenario));
            CountDownLatch loaded=new CountDownLatch(1);java.util.concurrent.atomic.AtomicReference<String> result=new java.util.concurrent.atomic.AtomicReference<>();scenario.onActivity(activity->{WebView web=find(activity.getWindow().getDecorView());web.evaluateJavascript("document.querySelector('.age-gate-page')?.innerText||''",value->{result.set(value);loaded.countDown();});});assertTrue(loaded.await(5,TimeUnit.SECONDS));assertTrue("Age gate text: "+result.get(),result.get().contains("Antes de conectar Telegram"));AccessTestSupport.assertNoEngine();
        }finally{AccessTestSupport.reset();}
    }
}
