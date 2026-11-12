package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real unauthenticated Android views, not web-demo fixtures. Exported only by the test APK. */
@RunWith(AndroidJUnit4.class)
public class StoreScreensTest {
    private static WebView web(View root) {
        if (root instanceof WebView) return (WebView) root;
        if (root instanceof ViewGroup) for (int i=0;i<((ViewGroup)root).getChildCount();i++) { WebView found=web(((ViewGroup)root).getChildAt(i)); if(found!=null)return found; }
        return null;
    }
    private static String js(ActivityScenario<ShellActivity> scenario, String script) throws Exception {
        CountDownLatch done=new CountDownLatch(1); AtomicReference<String> result=new AtomicReference<>();
        scenario.onActivity(activity->{assertFalse(AccessTestSupport.app().telegram().ready());WebView browser=web(activity.getWindow().getDecorView());assertNotNull(browser);browser.evaluateJavascript(script,value->{result.set(value);done.countDown();});});
        assertTrue(done.await(10,TimeUnit.SECONDS)); return result.get();
    }
    private static void until(ActivityScenario<ShellActivity> scenario, String predicate) throws Exception {
        long deadline=System.nanoTime()+TimeUnit.SECONDS.toNanos(20);
        while(System.nanoTime()<deadline) { if("true".equals(js(scenario,predicate)))return;InstrumentationRegistry.getInstrumentation().waitForIdleSync(); }
        fail("Actual Android UI was not ready");
    }
    private static void capture(android.app.Activity activity, String name) {
        assertTrue(BuildConfig.DEBUG); assertFalse(AccessTestSupport.app().telegram().ready());
        assertTrue((activity.getWindow().getAttributes().flags & WindowManager.LayoutParams.FLAG_SECURE)!=0);
        // Render this app's own empty/non-account view tree. Never remove FLAG_SECURE or capture other apps.
        View root=activity.getWindow().getDecorView(); assertTrue("La vista debe tener dimensiones reales antes de capturar",root.getWidth()>0&&root.getHeight()>0);
        Bitmap bitmap=Bitmap.createBitmap(root.getWidth(),root.getHeight(),Bitmap.Config.ARGB_8888);
        root.draw(new Canvas(bitmap));
        try {
            File directory=new File(activity.getExternalFilesDir(null),"store-screens");
            if(!directory.isDirectory()&&!directory.mkdirs())throw new IllegalStateException("Output unavailable");
            try(FileOutputStream output=new FileOutputStream(new File(directory,name))) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG,100,output)); }
        } catch(Exception failure) { throw new AssertionError("Screenshot export failed",failure); }
        finally { bitmap.recycle(); }
    }
    @Test public void exportActualNonAccountScreens() throws Exception {
        AccessTestSupport.reset();
        AccessTestSupport.app().getSharedPreferences("appearance",0).edit().putBoolean("consent",false).putString("theme","gold").commit();
        try {
            try(ActivityScenario<ShellActivity> gate=ActivityScenario.launch(ShellActivity.class)) {
                until(gate,"!!document.querySelector('.age-gate-page') && !!window.WRGramNative && document.querySelectorAll('.age-label select option').length>200");
                gate.onActivity(activity->{try{AccessTestSupport.assertNoEngine();}catch(Exception failure){throw new AssertionError(failure);}capture(activity,"01-age-access.png");});
            }
            AccessTestSupport.allow();
            AccessTestSupport.app().getSharedPreferences("appearance",0).edit().putBoolean("consent",false).commit();
            try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)) {
                until(scenario,"document.readyState==='complete' && !!document.querySelector('.auth-card') && !!window.WRGramNative");
                js(scenario,"window.__storePainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__storePainted=true));true");until(scenario,"window.__storePainted===true");
                scenario.onActivity(activity->capture(activity,"02-welcome.png"));
                js(scenario,"document.querySelector('button[aria-label=\"Ajustes\"]').click();true");until(scenario,"!!document.querySelector('.theme-grid')");
                js(scenario,"window.__storePainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__storePainted=true));true");until(scenario,"window.__storePainted===true");
                scenario.onActivity(activity->capture(activity,"03-settings.png"));
                js(scenario,"document.querySelector('button[aria-label=\"Complementos\"]').click();true");until(scenario,"!!document.querySelector('.premium-banner')");
                until(scenario,"Array.from(document.querySelectorAll('.plugin-icon>img')).length===6&&Array.from(document.querySelectorAll('.plugin-icon>img')).every(i=>i.complete&&i.naturalWidth>0)");
                js(scenario,"window.__storePainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__storePainted=true));true");until(scenario,"window.__storePainted===true");
                scenario.onActivity(activity->capture(activity,"04-complements.png"));
                js(scenario,"document.querySelector('.plugin-card').scrollIntoView({block:'start'});true");
                js(scenario,"window.__storePainted=false;requestAnimationFrame(()=>requestAnimationFrame(()=>window.__storePainted=true));true");until(scenario,"window.__storePainted===true");
                scenario.onActivity(activity->capture(activity,"05-own-apps.png"));
            }
        } finally { AccessTestSupport.reset(); }
    }
    @Test public void fontSizeSettingChangesTheLiveChatFont()throws Exception{
        AccessTestSupport.reset();WrgramApplication app=AccessTestSupport.app();app.getSharedPreferences("appearance",0).edit().putBoolean("consent",false).putInt("font",14).commit();AccessTestSupport.allow();app.getSharedPreferences("appearance",0).edit().putBoolean("consent",false).commit();
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            until(scenario,"!!document.querySelector('.auth-card')&&!!window.WRGramNative");
            js(scenario,"document.querySelector('button[aria-label=\\\"Ajustes\\\"]').click();true");until(scenario,"!!document.querySelector('.settings-page .font-preview')");
            js(scenario,"Array.from(document.querySelectorAll('.setting-row .segmented button')).find(button=>button.textContent.trim()==='Grande').click();true");
            until(scenario,"document.querySelector('.settings-page .font-preview').style.fontSize==='18px'&&getComputedStyle(document.querySelector('.workspace')).getPropertyValue('--font-size').trim()==='18px'");
            assertEquals("true",js(scenario,"(()=>{const bubble=document.createElement('article');bubble.className='bubble';const text=document.createElement('p');text.textContent='Prueba visible';bubble.append(text);document.querySelector('.workspace').append(bubble);const composer=document.createElement('div');composer.className='composer';const input=document.createElement('textarea');input.value='Prueba';composer.append(input);document.querySelector('.workspace').append(composer);return getComputedStyle(text).fontSize==='18px'&&getComputedStyle(input).fontSize==='18px';})()"));
            scenario.onActivity(activity->{try{AccessTestSupport.assertNoEngine();}catch(Exception failure){throw new AssertionError(failure);}});
        }finally{AccessTestSupport.reset();}
    }
}
