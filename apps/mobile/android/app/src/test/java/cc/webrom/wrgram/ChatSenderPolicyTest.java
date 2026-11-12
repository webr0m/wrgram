package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatSenderPolicyTest {
    private static TdApi.ChatMessageSender person(long id){return new TdApi.ChatMessageSender(new TdApi.MessageSenderUser(id),false);}
    private static TdApi.ChatMessageSender channel(long id,boolean premium){return new TdApi.ChatMessageSender(new TdApi.MessageSenderChat(id),premium);}

    @Test public void thePersonalSlotOnlyAcceptsTheConnectedAccount(){
        TdApi.ChatMessageSender[] senders={person(7),channel(40,false)};
        assertSame(senders[0],NativeBridge.allowedSender(senders,7,"user",7));
        assertNull(NativeBridge.allowedSender(senders,7,"user",8));
        assertNull(NativeBridge.allowedSender(senders,7,"user",40));
    }

    @Test public void aChannelIsOnlyAcceptedWhenTdlibOfferedItForThisChat(){
        TdApi.ChatMessageSender[] senders={person(7),channel(40,false)};
        assertSame(senders[1],NativeBridge.allowedSender(senders,7,"chat",40));
        assertNull(NativeBridge.allowedSender(senders,7,"chat",41));
        assertNull(NativeBridge.allowedSender(senders,7,"chat",7));
    }

    @Test public void unknownKindsMissingListsAndHolesAreRejected(){
        TdApi.ChatMessageSender[] senders={channel(40,false)};
        for(String kind:new String[]{"bot","","admin","channel"})assertNull(kind,NativeBridge.allowedSender(senders,7,kind,40));
        assertNull(NativeBridge.allowedSender(null,7,"chat",40));
        assertNull(NativeBridge.allowedSender(new TdApi.ChatMessageSender[]{channel(40,false),null,null},7,"chat",41));
    }

    @Test public void premiumSendersAreStillReturnedSoTheCallerCanExplainThem(){
        assertTrue(NativeBridge.allowedSender(new TdApi.ChatMessageSender[]{channel(40,true)},7,"chat",40).needsPremium);
    }

    @Test public void kindAndIdentifierComeFromTheTdlibSenderUnion(){
        assertEquals("user",TdSession.senderKind(new TdApi.MessageSenderUser(7)));
        assertEquals("chat",TdSession.senderKind(new TdApi.MessageSenderChat(40)));
        assertEquals("other",TdSession.senderKind(null));
        assertEquals(7,TdSession.senderId(new TdApi.MessageSenderUser(7)));
        assertEquals(40,TdSession.senderId(new TdApi.MessageSenderChat(40)));
        assertEquals(0,TdSession.senderId(null));
    }
}
