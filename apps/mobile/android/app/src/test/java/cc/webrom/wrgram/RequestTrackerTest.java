package cc.webrom.wrgram;

import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class RequestTrackerTest {
    static final class FakeClock implements RequestTracker.Scheduler {
        static final class Job { long at; Runnable action; boolean canceled; }
        long now;
        final List<Job> jobs = new ArrayList<>();
        @Override public RequestTracker.Cancel after(long delay, Runnable action) { Job job = new Job(); job.at = now + delay; job.action = action; jobs.add(job); return () -> job.canceled = true; }
        void advance(long time) { now += time; for (Job job : new ArrayList<>(jobs)) if (!job.canceled && job.at <= now) { job.canceled = true; job.action.run(); } }
    }
    @Test public void deadlineFreesRequestExactlyOnceAndLateResponseIsIgnored() {
        FakeClock clock = new FakeClock(); RequestTracker requests = new RequestTracker(clock); AtomicInteger failures = new AtomicInteger();
        RequestTracker.Ticket read = requests.start("history:1", 12000, failures::incrementAndGet);
        clock.advance(11999); assertEquals(0, failures.get()); clock.advance(1);
        assertEquals(1, failures.get()); assertEquals(0, requests.size()); assertFalse(read.complete());
        clock.advance(100000); assertEquals(1, failures.get());
    }
    @Test public void normalCompletionCancelsTimer() {
        FakeClock clock = new FakeClock(); RequestTracker requests = new RequestTracker(clock); AtomicInteger failures = new AtomicInteger();
        RequestTracker.Ticket read = requests.start("history", 12000, failures::incrementAndGet);
        assertTrue(read.complete()); clock.advance(12000); assertEquals(0, failures.get()); assertFalse(read.complete());
    }
    @Test public void replacingAReadDoesNotLetOldTimeoutCancelNewRead() {
        FakeClock clock = new FakeClock(); RequestTracker requests = new RequestTracker(clock); AtomicInteger failures = new AtomicInteger();
        RequestTracker.Ticket first = requests.start("history", 100, failures::incrementAndGet); clock.advance(50);
        RequestTracker.Ticket second = requests.start("history", 100, failures::incrementAndGet); clock.advance(50);
        assertFalse(first.active()); assertTrue(second.active()); assertEquals(0, failures.get()); clock.advance(50); assertEquals(1, failures.get());
    }
    @Test public void closingAChatCancelsOnlyItsReadsNotAnotherChatOrSend() {
        FakeClock clock = new FakeClock(); RequestTracker requests = new RequestTracker(clock); AtomicInteger failures = new AtomicInteger();
        requests.start("history:1:remote", 100, failures::incrementAndGet); requests.start("history:2:remote", 100, failures::incrementAndGet); requests.start("send:1", 100, failures::incrementAndGet);
        requests.cancelPrefix("history:1:"); assertEquals(2, requests.size()); clock.advance(100); assertEquals(2, failures.get());
    }
    @Test public void loggingOutCancelsEveryOutstandingCallback() {
        FakeClock clock = new FakeClock(); RequestTracker requests = new RequestTracker(clock); AtomicInteger failures = new AtomicInteger();
        requests.start("read", 100, failures::incrementAndGet); requests.start("send", 100, failures::incrementAndGet); requests.clear(); clock.advance(100);
        assertEquals(0, requests.size()); assertEquals(0, failures.get());
    }
}
