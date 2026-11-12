package cc.webrom.wrgram;

import static org.junit.Assert.*;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.nio.file.Files;
import java.time.LocalDate;

/** Only the isolated debug package; never touch an authenticated session or release data. */
final class AccessTestSupport {
    static WrgramApplication app() { return (WrgramApplication) InstrumentationRegistry.getInstrumentation().getTargetContext().getApplicationContext(); }
    static void assertNoEngine() throws Exception { assertTrue(BuildConfig.DEBUG);for(TdSession session:app().accounts()){assertFalse("Never test on an authenticated account",session.ready());java.lang.reflect.Field field=TdSession.class.getDeclaredField("client");field.setAccessible(true);assertNull("Age gate must not create a TDLib client",field.get(session));} }
    static void reset() throws Exception {
        assertTrue(BuildConfig.DEBUG);for(TdSession session:app().accounts())assertFalse("Never test on an authenticated account",session.ready());
        Files.deleteIfExists(new File(app().getNoBackupFilesDir(), "age-access.v1.enc").toPath());
        app().ageAccess().reload();
    }
    static void allow() throws Exception { reset(); app().ageAccess().declare("CL", LocalDate.now().minusYears(30)); }
}
