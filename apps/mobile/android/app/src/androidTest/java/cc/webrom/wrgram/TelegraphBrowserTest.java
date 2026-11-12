package cc.webrom.wrgram;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import android.content.Intent;
import android.os.SystemClock;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class TelegraphBrowserTest {
    @Test public void rendersPublicArticleInsideWrgram() throws Exception {
        AccessTestSupport.allow();
        try {
            String url = "https://telegra.ph/Instant-View-Telegraph-and-Other-Goodies-11-24";
            Intent intent = new Intent(AccessTestSupport.app(), TelegraphActivity.class).putExtra(TelegraphActivity.URL, url);
            try (ActivityScenario<TelegraphActivity> scenario = ActivityScenario.launch(intent)) {
                AtomicBoolean loaded = new AtomicBoolean();
                long deadline = SystemClock.uptimeMillis() + 25000;
                while (!loaded.get() && SystemClock.uptimeMillis() < deadline) {
                    scenario.onActivity(activity -> {
                        WebView web = findWebView(activity.getWindow().getDecorView());
                        assertNotNull(web);
                        assertFalse(web.getSettings().getJavaScriptEnabled());
                        loaded.set(url.equals(web.getUrl()) && web.getProgress() == 100
                                && web.getTitle() != null && web.getTitle().contains("Instant View"));
                    });
                    if (!loaded.get()) SystemClock.sleep(150);
                }
                assertTrue("The public article should render in WRGram", loaded.get());
            }
        } finally {
            AccessTestSupport.reset();
        }
    }

    private static WebView findWebView(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView child = findWebView(group.getChildAt(i));
                if (child != null) return child;
            }
        }
        return null;
    }
}
