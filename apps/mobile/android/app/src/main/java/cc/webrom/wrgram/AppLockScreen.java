package cc.webrom.wrgram;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.content.res.ColorStateList;
import android.graphics.Color;
import android.os.Build;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import java.util.function.Consumer;

/**
 * System-authenticated lock screen shared by both UI paths. The PIN, pattern,
 * password and biometric templates never reach WRGram; Android verifies them.
 */
final class AppLockScreen {
    interface Callback { void onUnlocked(); }

    private final FragmentActivity activity;
    private final Callback callback;
    private final ActivityResultLauncher<Intent> keyguard;
    private FrameLayout overlay;
    private TextView subtitle, status;
    private Button unlock, credentials;
    private boolean authInProgress, pendingChange, pendingValue;
    private Consumer<Boolean> pendingCallback;

    AppLockScreen(FragmentActivity activity, Callback callback) {
        this.activity = activity;
        this.callback = callback;
        this.keyguard = activity.registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> complete(result.getResultCode() == Activity.RESULT_OK));
    }

    /** Safe to call again after the host rebuilds its content view. */
    void install(FrameLayout host) {
        if (overlay == null) build();
        if (overlay.getParent() instanceof ViewGroup) ((ViewGroup) overlay.getParent()).removeView(overlay);
        host.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
        overlay.setVisibility(AppLock.isUnlocked() ? View.GONE : View.VISIBLE);
    }

    void show(boolean prompt) {
        if (overlay == null) return;
        refresh();
        hideKeyboard();
        overlay.setVisibility(View.VISIBLE);
        if (prompt && AppLock.shouldPrompt()) authenticate(false);
    }

    void hide() {
        if (overlay != null) overlay.setVisibility(View.GONE);
    }

    boolean authenticating() { return authInProgress; }

    void lockNow() {
        if (!AppLock.enabled(activity) || !AppLock.available(activity)) return;
        AppLock.setUnlocked(false);
        show(false);
        authenticate(false);
    }

    void requestChange(boolean enabled, Consumer<Boolean> callback) {
        if (authInProgress) { callback.accept(false); return; }
        if (!AppLock.available(activity)) { callback.accept(false); return; }
        pendingChange = true;
        pendingValue = enabled;
        pendingCallback = callback;
        authenticate(false);
    }

    private void build() {
        Palette palette = Palette.get(activity);
        LinearLayout screen = new LinearLayout(activity);
        screen.setOrientation(LinearLayout.VERTICAL);
        screen.setGravity(Gravity.CENTER);
        screen.setPadding(dp(32), dp(32), dp(32), dp(32));
        screen.setBackgroundColor(palette.canvas);
        screen.setClickable(true);
        screen.setFocusable(true);

        TextView mark = new TextView(activity);
        mark.setText(R.string.app_lock_mark);
        mark.setTextColor(palette.accent);
        mark.setTextSize(22);
        mark.setGravity(Gravity.CENTER);
        screen.addView(mark);

        TextView title = new TextView(activity);
        title.setText(R.string.app_lock_title);
        title.setTextColor(palette.ink);
        title.setTextSize(20);
        title.setGravity(Gravity.CENTER);
        title.setPadding(0, dp(22), 0, dp(8));
        screen.addView(title);

        subtitle = new TextView(activity);
        subtitle.setTextColor(palette.muted);
        subtitle.setTextSize(12);
        subtitle.setGravity(Gravity.CENTER);
        screen.addView(subtitle);

        status = new TextView(activity);
        status.setTextColor(palette.muted);
        status.setTextSize(12);
        status.setGravity(Gravity.CENTER);
        status.setPadding(0, dp(14), 0, 0);
        status.setVisibility(View.GONE);
        screen.addView(status);

        unlock = new Button(activity);
        unlock.setAllCaps(false);
        unlock.setText(R.string.app_lock_unlock);
        unlock.setTextColor(palette.onAccent);
        unlock.setBackgroundTintList(ColorStateList.valueOf(palette.accent));
        unlock.setOnClickListener(view -> authenticate(false));
        LinearLayout.LayoutParams primary = new LinearLayout.LayoutParams(-1, dp(52));
        primary.topMargin = dp(28);
        screen.addView(unlock, primary);

        credentials = new Button(activity);
        credentials.setAllCaps(false);
        credentials.setText(R.string.app_lock_credentials);
        credentials.setTextColor(palette.accent);
        credentials.setBackgroundColor(Color.TRANSPARENT);
        credentials.setOnClickListener(view -> authenticate(true));
        LinearLayout.LayoutParams secondary = new LinearLayout.LayoutParams(-1, dp(48));
        secondary.topMargin = dp(6);
        screen.addView(credentials, secondary);

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(palette.canvas);
        overlay.setClickable(true);
        overlay.setFocusable(true);
        overlay.addView(screen, new FrameLayout.LayoutParams(-1, -1));
        overlay.setVisibility(AppLock.isUnlocked() ? View.GONE : View.VISIBLE);
        refresh();
    }

    private void refresh() {
        if (subtitle == null) return;
        boolean biometric = AppLock.usesBiometric(activity);
        subtitle.setText(biometric ? R.string.app_lock_subtitle : R.string.app_lock_subtitle_credentials);
        credentials.setVisibility(biometric ? View.VISIBLE : View.GONE);
        unlock.setText(biometric ? R.string.app_lock_unlock : R.string.app_lock_credentials);
    }

    private void authenticate(boolean credentialsOnly) {
        if (authInProgress) return;
        if (!AppLock.available(activity)) { complete(false); return; }
        authInProgress = true;
        setStatus("");
        if (credentialsOnly || !AppLock.usesBiometric(activity)) { launchKeyguard(); return; }
        try {
            BiometricPrompt prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) { complete(true); }
                    @Override public void onAuthenticationFailed() { setStatus(activity.getString(R.string.app_lock_failed)); }
                    @Override public void onAuthenticationError(int errorCode, CharSequence message) {
                        if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                            || errorCode == BiometricPrompt.ERROR_CANCELED
                            || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) complete(false);
                        else launchKeyguard();
                    }
                });
            BiometricPrompt.PromptInfo.Builder info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(activity.getString(R.string.app_lock_title))
                .setSubtitle(activity.getString(R.string.app_lock_prompt))
                .setConfirmationRequired(false);
            if (Build.VERSION.SDK_INT >= 30) {
                info.setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK
                    | BiometricManager.Authenticators.DEVICE_CREDENTIAL);
            } else info.setDeviceCredentialAllowed(true);
            prompt.authenticate(info.build());
        } catch (RuntimeException ignored) {
            launchKeyguard();
        }
    }

    private void launchKeyguard() {
        if (!AppLock.available(activity)) { complete(false); return; }
        KeyguardManager keyguardManager = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        Intent intent = keyguardManager == null ? null : keyguardManager.createConfirmDeviceCredentialIntent(
            activity.getString(R.string.app_lock_title), activity.getString(R.string.app_lock_keyguard));
        if (intent == null) { complete(false); return; }
        intent.addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        try { keyguard.launch(intent); } catch (RuntimeException ignored) { complete(false); }
    }

    private void complete(boolean success) {
        if (activity.isFinishing() || activity.isDestroyed()) { authInProgress = false; return; }
        authInProgress = false;
        boolean change = pendingChange, value = pendingValue;
        Consumer<Boolean> callback = pendingCallback;
        pendingChange = false;
        pendingValue = false;
        pendingCallback = null;
        if (success) {
            if (change) AppLock.setEnabled(activity, value);
            AppLock.setUnlocked(true);
            setStatus("");
            hide();
            this.callback.onUnlocked();
        } else if (!AppLock.isUnlocked()) {
            setStatus(activity.getString(R.string.app_lock_cancelled));
            if (overlay != null) overlay.setVisibility(View.VISIBLE);
        }
        if (callback != null) callback.accept(success);
    }

    private void setStatus(String message) {
        if (status == null) return;
        status.setText(message);
        status.setVisibility(message.isEmpty() ? View.GONE : View.VISIBLE);
    }

    private void hideKeyboard() {
        if (overlay == null || overlay.getWindowToken() == null) return;
        android.view.inputmethod.InputMethodManager manager =
            (android.view.inputmethod.InputMethodManager) activity.getSystemService(Context.INPUT_METHOD_SERVICE);
        if (manager != null) manager.hideSoftInputFromWindow(overlay.getWindowToken(), 0);
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
