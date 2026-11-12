package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** No account fixtures and no credentials. Exercises the actual bundled Vite app and native port. */
@RunWith(AndroidJUnit4.class)
public class ShellRegressionTest {
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
    @Test public void bundledOriginAndAppearanceRoundTripAreReal()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);assertEquals("\"https://appassets.androidplatform.net\"",js(scenario,"location.origin"));
            scenario.onActivity(activity->{WebView view=web(activity.getWindow().getDecorView());assertFalse(view.getSettings().getAllowFileAccess());assertFalse(view.getSettings().getAllowContentAccess());assertFalse(view.getSettings().getMediaPlaybackRequiresUserGesture());assertEquals(WebSettings.MIXED_CONTENT_NEVER_ALLOW,view.getSettings().getMixedContentMode());});
            js(scenario,"document.querySelector('button[aria-label=\"Ajustes\"]').click();true");until(scenario,"!!document.querySelector('.theme-grid')");
            js(scenario,"Array.from(document.querySelectorAll('.theme-grid button')).find(b=>b.textContent==='Océano').click();true");until(scenario,"document.documentElement.dataset.theme==='ocean'");
            scenario.onActivity(activity->{assertEquals("ocean",activity.getSharedPreferences("appearance",0).getString("theme",""));activity.getSharedPreferences("appearance",0).edit().putString("theme","gold").apply();});
        }
    }
    @Test public void sixOwnAppsAreBuiltInAndUnknownMediaIsBlocked()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);js(scenario,"document.querySelector('button[aria-label=\"Complementos\"]').click();true");until(scenario,"!!document.querySelector('.premium-banner')");
            assertEquals("true",js(scenario,"document.querySelector('.honest-note').textContent.includes('Apps propias incluidas por defecto')"));
            assertEquals("6",js(scenario,"Array.from(document.querySelectorAll('.plugin-card')).filter(c=>c.textContent.includes('Incluida')).length"));
            assertEquals("true",js(scenario,"Array.from(document.querySelectorAll('.plugin-card img')).length===6"));
            js(scenario,"window.__mediaStatus=0;fetch('/media/999999999').then(r=>window.__mediaStatus=r.status);true");until(scenario,"window.__mediaStatus===403");
        }
    }
    @Test public void nativePhoneScreenAndCancellationWorkWithoutCredentials()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);
            js(scenario,"(()=>{const c=document.querySelector('.auth-card input[type=checkbox]');if(c)c.click();return true;})()");
            js(scenario,"(()=>{const b=document.querySelector('.auth-card .primary');if(b&&!b.disabled)b.click();return true;})()");
            until(scenario,"!!document.querySelector('.auth-card input[type=tel]')");
            js(scenario,"Array.from(document.querySelectorAll('.auth-card button')).find(b=>b.textContent==='Cancelar acceso').click();true");
            until(scenario,"!!document.querySelector('.auth-card input[type=checkbox]')");
            scenario.onActivity(activity->assertFalse(activity.getSharedPreferences("appearance",0).getBoolean("consent",false)));
        }
    }
    @Test public void anOldActivityCannotDetachTheCurrentObserver()throws Exception{
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            loaded(scenario);CountDownLatch updated=new CountDownLatch(1);
            TdSession.Listener old=kind->{};TdSession.Listener current=kind->updated.countDown();
            scenario.onActivity(activity->{TdSession session=((WrgramApplication)activity.getApplication()).telegram();session.observe(old);session.observe(current);session.unobserve(old);session.clearError();});
            assertTrue(updated.await(5,TimeUnit.SECONDS));
            scenario.onActivity(activity->((WrgramApplication)activity.getApplication()).telegram().unobserve(current));
        }
    }
}
