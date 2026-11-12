package cc.webrom.wrgram;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.os.SystemClock;
import androidx.biometric.BiometricManager;
import org.json.JSONObject;

/** App-local lock preference. Authentication and secrets stay in the Android system. */
final class AppLock {
    static final int[] DELAYS = {0, 30, 60, 300};
    private static final String PREFS = "security";
    private static final String ENABLED = "app_lock";
    private static final String LOCK_AFTER = "lock_after";

    // Shared by every activity in the process so a Mini App or the native
    // assistant view cannot bypass the lock. Process death resets it to locked.
    private static boolean unlocked;
    private static boolean prompted;
    private static int startedActivities;
    private static long backgroundAt;

    private AppLock() {}

    static boolean enabled(Context context) {
        return context.getSharedPreferences(PREFS, 0).getBoolean(ENABLED, available(context));
    }

    static void setEnabled(Context context, boolean value) {
        context.getSharedPreferences(PREFS, 0).edit().putBoolean(ENABLED, value).apply();
        if (!value) setUnlocked(true);
    }

    static int lockAfter(Context context) {
        int value = context.getSharedPreferences(PREFS, 0).getInt(LOCK_AFTER, 0);
        for (int delay : DELAYS) if (delay == value) return value;
        return 0;
    }

    static void setLockAfter(Context context, int seconds) {
        for (int delay : DELAYS) {
            if (delay == seconds) {
                context.getSharedPreferences(PREFS, 0).edit().putInt(LOCK_AFTER, seconds).apply();
                return;
            }
        }
        throw new IllegalArgumentException("Duración de bloqueo no válida");
    }

    static boolean available(Context context) {
        KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    /**
     * Face unlock is usually weak, so the prompt accepts BIOMETRIC_WEAK and
     * always keeps the device credential as the fallback.
     */
    static boolean usesBiometric(Context context) {
        if (Build.VERSION.SDK_INT < 28) return false;
        return BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            == BiometricManager.BIOMETRIC_SUCCESS;
    }

    static synchronized boolean isUnlocked() {
        return unlocked;
    }

    static synchronized void setUnlocked(boolean value) {
        unlocked = value;
        if (value) {
            backgroundAt = 0;
            prompted = true;
        } else prompted = false;
    }

    /** True at most once per lock event, so returning from the system sheet never loops. */
    static synchronized boolean shouldPrompt() {
        if (unlocked || prompted) return false;
        prompted = true;
        return true;
    }

    static synchronized void activityStarted(Context context) {
        startedActivities++;
        if (startedActivities != 1) return;
        boolean returning = backgroundAt != 0;
        boolean expired = returning && enabled(context) && unlocked
            && SystemClock.elapsedRealtime() - backgroundAt >= lockAfter(context) * 1000L;
        if (expired) unlocked = false;
        backgroundAt = 0;
        // Only a real return from the background may re-arm the automatic prompt;
        // the temporary stop caused by the system credential sheet must not loop it.
        if (returning && !unlocked) prompted = false;
    }

    static synchronized void activityStopped(boolean leavingApp) {
        if (startedActivities > 0) startedActivities--;
        if (startedActivities == 0) backgroundAt = leavingApp ? SystemClock.elapsedRealtime() : 0;
    }

    /** Keeps the app usable if the owner removes the device PIN/pattern/password. */
    static boolean disableIfUnavailable(Context context) {
        if (available(context)) return false;
        if (context.getSharedPreferences(PREFS, 0).getBoolean(ENABLED, false)) {
            setEnabled(context, false);
            return true;
        }
        if (isUnlocked()) return false;
        setUnlocked(true);
        return true;
    }

    static JSONObject status(Context context) throws Exception {
        return new JSONObject()
            .put("enabled", enabled(context))
            .put("available", available(context))
            .put("biometric", usesBiometric(context))
            .put("lockAfter", lockAfter(context));
    }
}
