package cc.webrom.wrgram;

import android.os.Bundle;
import android.view.Gravity;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.OnBackPressedCallback;
import java.io.ByteArrayInputStream;

/** Public articles use an isolated, read-only WebView without a Telegram bridge. */
public final class TelegraphActivity extends AccessActivity {
    static final String URL = "telegraph_url";
    private WebView web;
    private TextView status;

    private boolean allowed() {
        return (!AppLock.enabled(this) || AppLock.isUnlocked())
                && ((WrgramApplication) getApplication()).ageAccess().allowed();
    }

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        String url = TelegraphUrl.normalize(getIntent().getStringExtra(URL));
        if (url == null || !requireAccess() || !allowed()) { finish(); return; }

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        LinearLayout bar = new LinearLayout(this);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        Button close = new Button(this);
        close.setText(R.string.telegraph_close);
        close.setOnClickListener(view -> finish());
        bar.addView(close);
        status = new TextView(this);
        status.setText(R.string.telegraph_loading);
        status.setGravity(Gravity.CENTER);
        bar.addView(status, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));
        Button reload = new Button(this);
        reload.setText(R.string.telegraph_reload);
        reload.setOnClickListener(view -> web.reload());
        bar.addView(reload);
        root.addView(bar);

        web = new WebView(this);
        web.setContentDescription(getString(R.string.telegraph_article));
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(false);
        settings.setDomStorageEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, false);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String destination = request.getUrl().toString();
                String normalized = TelegraphUrl.normalize(destination);
                if (normalized != null && request.isForMainFrame()) {
                    if (normalized.equals(destination)) return false;
                    view.loadUrl(normalized);
                    return true;
                }
                if (request.isForMainFrame() && request.hasGesture() && allowed()) {
                    try {
                        MiniAppPolicy.origin(destination);
                        ExternalLinks.open(TelegraphActivity.this, destination, () -> {}, () -> {});
                    } catch (IllegalArgumentException ignored) {}
                }
                return true;
            }

            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String destination = request.getUrl().toString();
                if (destination.equals(TelegraphUrl.normalize(destination))) return null;
                return new WebResourceResponse("text/plain", "UTF-8", new ByteArrayInputStream(new byte[0]));
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                status.setText(R.string.telegraph_loading);
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (TelegraphUrl.normalize(url) != null && getString(R.string.telegraph_loading).contentEquals(status.getText()))
                    status.setText(R.string.telegraph_domain);
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) status.setText(R.string.telegraph_error);
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse error) {
                if (request.isForMainFrame()) status.setText(R.string.telegraph_unavailable);
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1));
        setContentView(root);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (web.canGoBack()) web.goBack();
                else finish();
            }
        });
        web.loadUrl(url);
    }

    @Override protected void onStart() { super.onStart(); AppLock.activityStarted(this); }
    @Override protected void onResume() { super.onResume(); if (!allowed()) finish(); }
    @Override protected void onStop() { AppLock.activityStopped(!isChangingConfigurations()); super.onStop(); }

    @Override protected void onDestroy() {
        if (web != null) {
            web.stopLoading();
            if (web.getParent() instanceof ViewGroup) ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
        }
        super.onDestroy();
    }
}
