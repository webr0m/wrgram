package cc.webrom.wrgram;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import io.github.pytgcalls.NTgCalls;
import org.junit.Test;
import org.junit.runner.RunWith;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

@RunWith(AndroidJUnit4.class)
public final class TelegramCallMediaTest {
    @Test public void loadsNativeEngineAndCreatesLocalPeerCall() {
        var protocol = TelegramCallMedia.protocol(InstrumentationRegistry.getInstrumentation().getTargetContext());
        assertTrue(protocol.libraryVersions.length > 0);
        assertTrue(protocol.maxLayer >= protocol.minLayer);
        var engine = new NTgCalls();
        long id = 1234;
        engine.createP2pCall(id);
        try {
            assertNotNull(engine.getCallType(id));
            var devices = NTgCalls.getMediaDevices();
            assertTrue(!devices.microphone.isEmpty());
            assertTrue(!devices.speaker.isEmpty());
        } finally {
            engine.stop(id);
        }
    }
}
