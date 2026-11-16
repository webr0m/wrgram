package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class ChatNotificationPolicyTest {
    @Test public void preservesExistingBooleanRequests() throws Exception {
        assertEquals(Integer.MAX_VALUE,ChatNotificationPolicy.muteFor(new JSONObject().put("value",true)));
        assertEquals(0,ChatNotificationPolicy.muteFor(new JSONObject().put("value",false)));
    }
    @Test public void usesRemainingSecondsAndSupportsUnmute() throws Exception {
        for(int seconds:new int[]{0,3600,28800,172800,Integer.MAX_VALUE})
            assertEquals(seconds,ChatNotificationPolicy.muteFor(new JSONObject().put("value",seconds>0).put("muteFor",seconds)));
    }
    @Test public void rejectsInvalidDurationsAndContradictoryRequests() throws Exception {
        for(Object value:new Object[]{-1,1.5,"3600",true,Long.MAX_VALUE,JSONObject.NULL})
            assertThrows(IllegalArgumentException.class,()->ChatNotificationPolicy.muteFor(new JSONObject().put("value",true).put("muteFor",value)));
        assertThrows(IllegalArgumentException.class,()->ChatNotificationPolicy.muteFor(new JSONObject().put("value",false).put("muteFor",3600)));
        assertThrows(IllegalArgumentException.class,()->ChatNotificationPolicy.muteFor(new JSONObject().put("value",true).put("muteFor",0)));
        assertThrows(IllegalArgumentException.class,()->ChatNotificationPolicy.muteFor(new JSONObject().put("value","true")));
    }
    @Test public void temporaryMuteMustNotBeComparedWithEpochTime() {
        TdApi.ChatNotificationSettings settings=new TdApi.ChatNotificationSettings();
        settings.muteFor=3600;
        assertTrue(ChatNotificationPolicy.explicitlyMuted(settings));
        settings.muteFor=0;
        assertFalse(ChatNotificationPolicy.explicitlyMuted(settings));
        settings.muteFor=Integer.MAX_VALUE;
        settings.useDefaultMuteFor=true;
        assertFalse(ChatNotificationPolicy.explicitlyMuted(settings));
        assertFalse(ChatNotificationPolicy.explicitlyMuted(null));
    }
}
