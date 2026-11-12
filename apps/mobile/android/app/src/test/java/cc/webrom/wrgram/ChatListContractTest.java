package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatListContractTest {
    @Test public void archiveAndMainAreNeverMixed(){assertFalse(TdSession.sameList(new TdApi.ChatListMain(),new TdApi.ChatListArchive()));assertTrue(TdSession.sameList(new TdApi.ChatListMain(),new TdApi.ChatListMain()));}
    @Test public void folderIdsMustMatch(){assertTrue(TdSession.sameList(new TdApi.ChatListFolder(12),new TdApi.ChatListFolder(12)));assertFalse(TdSession.sameList(new TdApi.ChatListFolder(12),new TdApi.ChatListFolder(13)));assertFalse(TdSession.sameList(null,new TdApi.ChatListMain()));}
    @Test public void plainTextSnapshotNeverInventsMediaCaption(){TdApi.Message message=new TdApi.Message();TdApi.MessageText content=new TdApi.MessageText();content.text=new TdApi.FormattedText("<script>not executable</script>",new TdApi.TextEntity[0]);message.content=content;assertEquals("<script>not executable</script>",NativeSnapshot.contentCaption(message.content));}
    @Test public void serviceMessagesNeverFallBackToUnsupportedText(){TdApi.Message message=new TdApi.Message();TdApi.MessageChatChangeTitle title=new TdApi.MessageChatChangeTitle();title.title="Viajes";message.content=title;String text=ServiceMessages.text(message,null);assertNotNull(text);assertTrue(text.contains("Viajes"));assertFalse(text.contains("no compatible"));}
}
