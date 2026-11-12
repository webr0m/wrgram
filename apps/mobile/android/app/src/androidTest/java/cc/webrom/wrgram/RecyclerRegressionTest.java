package cc.webrom.wrgram;

import static org.junit.Assert.*;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class RecyclerRegressionTest {
    @Test public void thousandChatRowsDoNotCreateAThousandViews() throws Exception {
        try (ActivityScenario<RegressionHarnessActivity> scenario = ActivityScenario.launch(RegressionHarnessActivity.class)) {
            CountDownLatch ready = new CountDownLatch(1); scenario.onActivity(activity -> activity.populate(1000, true, ready::countDown)); assertTrue(ready.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> { assertEquals(1000, activity.rows()); assertTrue(activity.views() > 0); assertTrue("Only a viewport of rows may be inflated", activity.views() < 80); assertEquals(1000, activity.lastId()); });
        }
    }
    @Test public void fiveHundredMessagesRemainRecycledWhenJumpingToLatest() throws Exception {
        try (ActivityScenario<RegressionHarnessActivity> scenario = ActivityScenario.launch(RegressionHarnessActivity.class)) {
            CountDownLatch ready = new CountDownLatch(1); scenario.onActivity(activity -> activity.populate(500, false, ready::countDown)); assertTrue(ready.await(10, TimeUnit.SECONDS));
            scenario.onActivity(RegressionHarnessActivity::jumpToLast); InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            scenario.onActivity(activity -> { assertEquals(500, activity.rows()); assertTrue(activity.views() > 0); assertTrue(activity.views() < 80); });
        }
    }
    @Test public void oneChangedMessageDoesNotRebindEveryRow() throws Exception {
        try (ActivityScenario<RegressionHarnessActivity> scenario = ActivityScenario.launch(RegressionHarnessActivity.class)) {
            CountDownLatch first = new CountDownLatch(1); scenario.onActivity(activity -> activity.populate(300, false, first::countDown)); assertTrue(first.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync();
            CountDownLatch second = new CountDownLatch(1); scenario.onActivity(activity -> activity.changeOne(second::countDown)); assertTrue(second.await(10, TimeUnit.SECONDS));
            InstrumentationRegistry.getInstrumentation().waitForIdleSync(); scenario.onActivity(activity -> { assertEquals(300, activity.rows()); assertEquals(1, activity.changedRows()); });
        }
    }
}
