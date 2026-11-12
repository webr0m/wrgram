package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/** Transport-independent send eligibility. TDLib still validates every remote operation. */
final class ChatAccessPolicy {
    static boolean secretReady(TdApi.SecretChat secret){return secret!=null&&secret.state instanceof TdApi.SecretChatStateReady;}
    static boolean canPost(TdApi.Supergroup group){
        if(group==null||!group.isChannel)return false;
        if(group.status instanceof TdApi.ChatMemberStatusCreator)return ((TdApi.ChatMemberStatusCreator)group.status).isMember;
        if(!(group.status instanceof TdApi.ChatMemberStatusAdministrator))return false;
        TdApi.ChatAdministratorRights rights=((TdApi.ChatMemberStatusAdministrator)group.status).rights;
        return rights!=null&&rights.canPostMessages;
    }
    /** Administrators bypass the default member permissions in groups. */
    static boolean isAdmin(TdApi.Supergroup group){
        if(group==null)return false;
        if(group.status instanceof TdApi.ChatMemberStatusCreator)return ((TdApi.ChatMemberStatusCreator)group.status).isMember;
        return group.status instanceof TdApi.ChatMemberStatusAdministrator;
    }
}
