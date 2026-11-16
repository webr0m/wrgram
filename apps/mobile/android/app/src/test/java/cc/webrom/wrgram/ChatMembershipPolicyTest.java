package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatMembershipPolicyTest {
    private static TdApi.Chat of(TdApi.ChatType type) {
        TdApi.Chat chat = new TdApi.Chat();
        chat.type = type;
        return chat;
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        return of(type);
    }

    @Test public void onlyCommunitiesCanBeJoinedOrLeftByThisMethod() {
        assertTrue(ChatMembership.applicable(of(new TdApi.ChatTypeBasicGroup())));
        assertTrue(ChatMembership.applicable(supergroup(false)));
        assertTrue(ChatMembership.applicable(supergroup(true)));
        assertFalse(ChatMembership.applicable(of(new TdApi.ChatTypePrivate())));
        assertFalse(ChatMembership.applicable(of(new TdApi.ChatTypeSecret())));
        assertFalse(ChatMembership.applicable(of(null)));
        assertFalse(ChatMembership.applicable(null));
    }

    @Test public void theFourResultsTelegramCanAnswerHaveFourDifferentNames() {
        assertEquals(ChatMembership.JOINED, ChatMembership.state(new TdApi.ChatJoinResultSuccess()));
        assertEquals(ChatMembership.REQUEST, ChatMembership.state(new TdApi.ChatJoinResultRequestSent()));
        assertEquals(ChatMembership.GUARD, ChatMembership.state(new TdApi.ChatJoinResultGuardBotApprovalRequired()));
        assertEquals(ChatMembership.DECLINED, ChatMembership.state(new TdApi.ChatJoinResultDeclined()));
    }

    @Test public void anUnknownVariantIsNotSilentlyTreatedAsEntering() {
        // Un `ChatJoinResult` que no se reconoce aquí no puede traducirse en «ya dentro».
        assertEquals("", ChatMembership.state(null));
        assertNotEquals(ChatMembership.JOINED, ChatMembership.state(new TdApi.ChatJoinResultDeclined()));
        assertNotEquals(ChatMembership.JOINED, ChatMembership.state(new TdApi.ChatJoinResultRequestSent()));
    }

    @Test public void onlyTheGuardVariantCarriesABot() {
        assertEquals(730L, ChatMembership.guardBot(new TdApi.ChatJoinResultGuardBotApprovalRequired(730L, 4100L)));
        assertEquals(0L, ChatMembership.guardBot(new TdApi.ChatJoinResultSuccess(1L)));
        assertEquals(0L, ChatMembership.guardBot(new TdApi.ChatJoinResultRequestSent()));
        assertEquals(0L, ChatMembership.guardBot(new TdApi.ChatJoinResultDeclined()));
        assertEquals(0L, ChatMembership.guardBot(null));
    }

    @Test public void theSuccessChatIdIsNotTheChatThePersonWasAskedAbout() {
        // `ChatJoinResultSuccess` trae su propio id: la interfaz no puede suponer que coincide.
        assertEquals(99L, new TdApi.ChatJoinResultSuccess(99L).chatId);
        assertEquals(0L, new TdApi.ChatJoinResultSuccess().chatId);
    }

    @Test public void creatorsAndRestrictedMembersCountOnlyWhileTelegramKeepsThemInside() {
        TdApi.ChatMemberStatusCreator creator = new TdApi.ChatMemberStatusCreator();
        assertFalse(ChatMembership.inside(creator));
        creator.isMember = true;
        assertTrue(ChatMembership.inside(creator));
        TdApi.ChatMemberStatusRestricted restricted = new TdApi.ChatMemberStatusRestricted();
        assertFalse(ChatMembership.inside(restricted));
        restricted.isMember = true;
        assertTrue(ChatMembership.inside(restricted));
        restricted.isMember = false;
        assertFalse(ChatMembership.inside(restricted));
    }

    @Test public void membersAdministratorsLeftAndBannedReadAsTheyAreDocumented() {
        assertTrue(ChatMembership.inside(new TdApi.ChatMemberStatusMember()));
        assertTrue(ChatMembership.inside(new TdApi.ChatMemberStatusAdministrator()));
        assertFalse(ChatMembership.inside(new TdApi.ChatMemberStatusLeft()));
        assertFalse(ChatMembership.inside(new TdApi.ChatMemberStatusBanned()));
        assertFalse(ChatMembership.inside(null));
    }

    @Test public void banningIsADifferentAnswerThanHavingLeft() {
        assertTrue(ChatMembership.blocked(new TdApi.ChatMemberStatusBanned()));
        assertFalse(ChatMembership.blocked(new TdApi.ChatMemberStatusLeft()));
        assertFalse(ChatMembership.blocked(new TdApi.ChatMemberStatusMember()));
        assertFalse(ChatMembership.blocked(null));
    }
}
