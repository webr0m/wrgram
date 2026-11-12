package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatAccessPolicyTest {
    @Test public void cannotSendToUnknownPendingOrClosedSecret(){assertFalse(ChatAccessPolicy.secretReady(null));TdApi.SecretChat chat=new TdApi.SecretChat();assertFalse(ChatAccessPolicy.secretReady(chat));chat.state=new TdApi.SecretChatStatePending();assertFalse(ChatAccessPolicy.secretReady(chat));chat.state=new TdApi.SecretChatStateClosed();assertFalse(ChatAccessPolicy.secretReady(chat));chat.state=new TdApi.SecretChatStateReady();assertTrue(ChatAccessPolicy.secretReady(chat));}
    @Test public void subscribersCannotPublishInChannels(){TdApi.Supergroup group=new TdApi.Supergroup();group.isChannel=true;group.status=new TdApi.ChatMemberStatusMember();assertFalse(ChatAccessPolicy.canPost(group));assertFalse(ChatAccessPolicy.canPost(null));}
    @Test public void administratorsNeedExplicitPostRight(){TdApi.Supergroup group=new TdApi.Supergroup();group.isChannel=true;TdApi.ChatMemberStatusAdministrator admin=new TdApi.ChatMemberStatusAdministrator();group.status=admin;assertFalse(ChatAccessPolicy.canPost(group));admin.rights=new TdApi.ChatAdministratorRights();assertFalse(ChatAccessPolicy.canPost(group));admin.rights.canPostMessages=true;assertTrue(ChatAccessPolicy.canPost(group));}
    @Test public void creatorCanOnlyPostWhileStillAMember(){TdApi.Supergroup group=new TdApi.Supergroup();TdApi.ChatMemberStatusCreator creator=new TdApi.ChatMemberStatusCreator();group.status=creator;group.isChannel=true;assertFalse(ChatAccessPolicy.canPost(group));creator.isMember=true;assertTrue(ChatAccessPolicy.canPost(group));creator.isMember=false;assertFalse(ChatAccessPolicy.canPost(group));}
    @Test public void nonChannelCreatorIsAnAdminOnlyWhileMember(){TdApi.Supergroup group=new TdApi.Supergroup();TdApi.ChatMemberStatusCreator creator=new TdApi.ChatMemberStatusCreator();group.status=creator;assertFalse(ChatAccessPolicy.isAdmin(group));creator.isMember=true;assertTrue(ChatAccessPolicy.isAdmin(group));group.status=new TdApi.ChatMemberStatusAdministrator();assertTrue(ChatAccessPolicy.isAdmin(group));group.status=new TdApi.ChatMemberStatusMember();assertFalse(ChatAccessPolicy.isAdmin(group));assertFalse(ChatAccessPolicy.isAdmin(null));}
}
