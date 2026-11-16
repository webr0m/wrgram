package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class BlockedSendersPolicyTest {
    @Test public void paginatesWithoutOverflow() throws Exception {
        assertEquals(0, BlockedSendersPolicy.offset(new JSONObject()));
        assertEquals(50, BlockedSendersPolicy.offset(new JSONObject().put("offset",50)));
        for(Object offset:new Object[]{-1,1.5,"50",true,Long.MAX_VALUE,JSONObject.NULL}) {
            assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.offset(new JSONObject().put("offset",offset)));
        }
    }
    @Test public void preservesLargeUserAndChatIdentifiers() throws Exception {
        TdApi.MessageSender sender=BlockedSendersPolicy.sender(new JSONObject().put("kind","user").put("id","9007199254740993"),42);
        assertEquals("user",BlockedSendersPolicy.kind(sender));
        assertEquals(9007199254740993L,BlockedSendersPolicy.id(sender));
        sender=BlockedSendersPolicy.sender(new JSONObject().put("kind","chat").put("id","-1001234567890"),42);
        assertEquals("chat",BlockedSendersPolicy.kind(sender));
        assertEquals(-1001234567890L,BlockedSendersPolicy.id(sender));
    }
    @Test public void rejectsSelfAndMalformedOrAmbiguousSenders() throws Exception {
        for(String kind:new String[]{"user","chat","other",""}) {
            assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.sender(new JSONObject().put("kind",kind).put("id","0"),42));
        }
        assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.sender(new JSONObject().put("kind","user").put("id","42"),42));
        assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.sender(new JSONObject().put("kind","user").put("id","-12"),42));
        assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.sender(new JSONObject().put("kind","user").put("id",123),42));
        assertThrows(IllegalArgumentException.class,()->BlockedSendersPolicy.kind(null));
    }
}
