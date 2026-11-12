package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.KeyStore;
import java.time.LocalDate;
import java.util.Arrays;
import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AgeAccessRegressionTest {
    @Before public void before() throws Exception { AccessTestSupport.reset(); }
    @After public void after() throws Exception {
        AccessTestSupport.reset(); AccessTestSupport.app().getSharedPreferences("appearance", 0).edit().putBoolean("consent", false).commit();
    }
    private File file() { return new File(AccessTestSupport.app().getNoBackupFilesDir(), "age-access.v1.enc"); }
    private static View named(View root, String label) {
        if (root instanceof Button && label.contentEquals(((TextView) root).getText())) return root;
        if (root instanceof ViewGroup) for (int i = 0; i < ((ViewGroup) root).getChildCount(); i++) { View found = named(((ViewGroup) root).getChildAt(i), label); if (found != null) return found; }
        return null;
    }
    private static void assertNoEngine() throws Exception {
        java.lang.reflect.Field client = TdSession.class.getDeclaredField("client"); client.setAccessible(true);
        assertNull("No TDLib connection before declaration", client.get(AccessTestSupport.app().telegram()));
    }
    @Test public void existingTelegramConsentNeverBypassesMissingAgeReceipt() throws Exception {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            AccessTestSupport.app().getSharedPreferences("appearance", 0).edit().putBoolean("consent", true).commit();
            AccessTestSupport.app().telegram().start();
        });
        assertNoEngine(); assertFalse(AccessTestSupport.app().ageAccess().allowed());
    }
    @Test public void approvalIsEncryptedSurvivesReloadAndNeverStoresBirthDate() throws Exception {
        LocalDate birth = LocalDate.now().minusYears(30); AccessTestSupport.app().ageAccess().declare("CL", birth);
        AgeAccessStore loaded = new AgeAccessStore(AccessTestSupport.app()); assertTrue(loaded.allowed()); assertEquals("CL", loaded.receipt().country);
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore"); keys.load(null);
        byte[] bytes = Files.readAllBytes(file().toPath());
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding"); cipher.init(Cipher.DECRYPT_MODE, (SecretKey) keys.getKey("wrgram.age.access.v1", null), new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
        cipher.updateAAD("wrgram.age.access.v1".getBytes(StandardCharsets.UTF_8));
        String plain = new String(cipher.doFinal(Arrays.copyOfRange(bytes, 12, bytes.length)), StandardCharsets.UTF_8);
        JSONObject value = new JSONObject(plain); assertEquals(4, value.length());
        assertTrue(value.has("country") && value.has("eligible") && value.has("checkedAt") && value.has("revision"));
        assertFalse(plain.contains(birth.toString())); assertFalse(value.has("age")); assertFalse(value.has("birth")); assertFalse(value.has("userId"));
    }
    @Test public void teenInRestrictedRegionStaysBlockedAfterRestartAndCannotResetViaSettings() throws Exception {
        AccessTestSupport.app().ageAccess().declare("ES", LocalDate.now().minusYears(17));
        AgeAccessStore store = new AgeAccessStore(AccessTestSupport.app()); assertTrue(store.blocked()); assertFalse(store.allowed());
        try { store.declare("CL", LocalDate.now().minusYears(30)); fail(); } catch (IllegalStateException expected) { }
        try { store.forgetApproval(); fail(); } catch (IllegalStateException expected) { }
        assertTrue(new AgeAccessStore(AccessTestSupport.app()).blocked()); assertNoEngine();
    }
    @Test public void damagedReceiptFailsClosedWithoutTouchingSessionKey() throws Exception {
        AccessTestSupport.app().ageAccess().declare("CL", LocalDate.now().minusYears(16));
        File sessionKey = new File(AccessTestSupport.app().getNoBackupFilesDir(), "tdlib-key.v1");
        byte[] before = sessionKey.exists() ? Files.readAllBytes(sessionKey.toPath()) : null;
        byte[] bytes = Files.readAllBytes(file().toPath()); bytes[bytes.length - 1] ^= 1; Files.write(file().toPath(), bytes);
        AccessTestSupport.app().ageAccess().reload(); assertFalse(AccessTestSupport.app().ageAccess().allowed());
        if (before != null) assertArrayEquals(before, Files.readAllBytes(sessionKey.toPath())); else assertFalse(sessionKey.exists());
    }
    @Test public void birthFieldsAreBlankAndNotRestoredAfterRotation() {
        try (ActivityScenario<AgeGateActivity> scenario = ActivityScenario.launch(AgeGateActivity.class)) {
            scenario.onActivity(activity -> {
                EditText day = activity.findViewById(R.id.age_day); assertEquals("", day.getText().toString()); assertFalse(day.isSaveEnabled()); day.setText("11");
                ((EditText) activity.findViewById(R.id.age_month)).setText("12"); ((EditText) activity.findViewById(R.id.age_year)).setText("2000");
                assertEquals(0, ((Spinner) activity.findViewById(R.id.age_country)).getSelectedItemPosition());
            });
            scenario.recreate();
            scenario.onActivity(activity -> {
                for (int id : new int[]{R.id.age_day, R.id.age_month, R.id.age_year}) assertEquals("", ((EditText) activity.findViewById(id)).getText().toString());
                assertEquals(0, ((Spinner) activity.findViewById(R.id.age_country)).getSelectedItemPosition());
            });
        }
    }
    @Test public void unspecifiedCountryAndEmptyBirthNeverWriteApproval() throws Exception {
        try (ActivityScenario<AgeGateActivity> scenario = ActivityScenario.launch(AgeGateActivity.class)) {
            scenario.onActivity(activity -> { View next = named(activity.getWindow().getDecorView(), "Continuar"); assertNotNull(next); next.performClick(); assertFalse(AccessTestSupport.app().ageAccess().allowed()); });
            assertFalse(file().exists()); assertNoEngine();
        }
    }
    private void redirect(Class<? extends Activity> entry) throws Exception {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor monitor = instrumentation.addMonitor(ShellActivity.class.getName(), null, false);
        Activity gate = null;
        try {
            Intent intent = new Intent(AccessTestSupport.app(), entry).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK).putExtra("page", "assistant").putExtra("ageApproved", true);
            AccessTestSupport.app().startActivity(intent);
            gate = instrumentation.waitForMonitorWithTimeout(monitor, 10_000); assertNotNull("Missing bundled age gate", gate);assertTrue(gate instanceof ShellActivity);
            instrumentation.waitForIdleSync(); assertNoEngine(); assertFalse(AccessTestSupport.app().assistant().consent);
        } finally {
            instrumentation.removeMonitor(monitor);
            if (gate != null) { Activity current = gate; instrumentation.runOnMainSync(current::finishAndRemoveTask); instrumentation.waitForIdleSync(); }
        }
    }
    @Test public void launcherRequiresNewDeclarationOnUpgradeEvenWithLegacyConsent() throws Exception {
        AccessTestSupport.app().getSharedPreferences("appearance", 0).edit().putBoolean("consent", true).commit(); redirect(ShellActivity.class);
    }
    @Test public void legacyAssistantEntryAndForgedExtrasCannotBypassGate() throws Exception { redirect(MainActivity.class); }
}
