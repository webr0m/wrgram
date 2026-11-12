package cc.webrom.wrgram;

import static org.junit.Assert.*;
import android.app.Instrumentation;
import androidx.test.core.app.ActivityScenario;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;

public class SettingsSupportRegressionTest {
    @Test public void privacyAgeAndSupportFlowStaysInCurrentShell()throws Exception{
        AccessTestSupport.allow();
        Instrumentation instrumentation=InstrumentationRegistry.getInstrumentation();
        Instrumentation.ActivityMonitor legacy=new Instrumentation.ActivityMonitor(MainActivity.class.getName(),null,false);
        instrumentation.addMonitor(legacy);
        try(ActivityScenario<ShellActivity> scenario=ActivityScenario.launch(ShellActivity.class)){
            scenario.onActivity(activity->{activity.showSettingsSupport();assertFalse(activity.isFinishing());});
            assertNull("Settings must not route to the legacy MainActivity",instrumentation.waitForMonitorWithTimeout(legacy,1000));
        }finally{instrumentation.removeMonitor(legacy);}
    }
}
