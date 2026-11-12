package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

import org.json.JSONObject;
import org.junit.Test;

public class InboxTabEmojiTest {
    @Test public void presetsAreAvailableWithoutPremium() throws Exception {
        JSONObject valid = new JSONObject().put("kind", "preset").put("id", "star");
        assertEquals("star", NativeBridge.inboxTabEmoji(valid, false, null).getString("id"));
        JSONObject unknown = new JSONObject().put("kind", "preset").put("id", "unknown");
        assertThrows(IllegalArgumentException.class, () -> NativeBridge.inboxTabEmoji(unknown, false, null));
    }

    @Test public void premiumEmojiKeepsItsExactIdAndCanSurviveAnExpiredSubscription() throws Exception {
        String id = "8765432109876543210";
        JSONObject choice = new JSONObject().put("kind", "premium").put("id", id).put("emoji", "⭐");
        assertEquals(id, NativeBridge.inboxTabEmoji(choice, true, null).getString("id"));
        assertEquals("⭐", NativeBridge.inboxTabEmoji(choice, false, id).getString("emoji"));
        assertThrows(IllegalArgumentException.class, () -> NativeBridge.inboxTabEmoji(choice, false, "42"));
        choice.put("id", "9223372036854775808");
        assertThrows(IllegalArgumentException.class, () -> NativeBridge.inboxTabEmoji(choice, true, null));
    }
}
