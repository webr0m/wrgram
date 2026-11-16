package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class ChatOwnershipPolicyTest {
    private static TdApi.Chat of(TdApi.ChatType type) {
        TdApi.Chat chat = new TdApi.Chat();
        chat.type = type;
        return chat;
    }

    private static TdApi.Chat basic() {
        return of(new TdApi.ChatTypeBasicGroup());
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        return of(type);
    }

    private static TdApi.ChatMemberStatus creator(boolean inside) {
        TdApi.ChatMemberStatusCreator status = new TdApi.ChatMemberStatusCreator();
        status.isMember = inside;
        return status;
    }

    private static TdApi.User person(long id) {
        TdApi.User user = new TdApi.User();
        user.id = id;
        user.type = new TdApi.UserTypeRegular();
        return user;
    }

    @Test public void ownershipExistsWhereTheSchemaSaysItExists() {
        assertTrue(ChatOwnership.applicable(basic()));
        assertTrue(ChatOwnership.applicable(supergroup(false)));
        assertTrue(ChatOwnership.applicable(supergroup(true)));
        assertFalse(ChatOwnership.applicable(of(new TdApi.ChatTypePrivate())));
        assertFalse(ChatOwnership.applicable(of(new TdApi.ChatTypeSecret())));
        assertFalse(ChatOwnership.applicable(of(null)));
        assertFalse(ChatOwnership.applicable(null));
    }

    @Test public void theHeirIsImmediateInABasicGroupAndDelayedInAChannel() {
        assertEquals(ChatOwnership.IMMEDIATE, ChatOwnership.moment(basic()));
        assertEquals(ChatOwnership.SEVEN_DAYS, ChatOwnership.moment(supergroup(false)));
        assertEquals(ChatOwnership.SEVEN_DAYS, ChatOwnership.moment(supergroup(true)));
    }

    @Test public void onlyAMemberCreatorHasOwnershipToLeaveOrTransfer() {
        assertTrue(ChatOwnership.creator(creator(true)));
        // La creadora que ya se fue no tiene propiedad que ceder: no hay herencia que prometer.
        assertFalse(ChatOwnership.creator(creator(false)));
        assertFalse(ChatOwnership.creator(new TdApi.ChatMemberStatusAdministrator()));
        assertFalse(ChatOwnership.creator(new TdApi.ChatMemberStatusMember()));
        assertFalse(ChatOwnership.creator(new TdApi.ChatMemberStatusBanned()));
        assertFalse(ChatOwnership.creator(null));
    }

    @Test public void botsAndDeletedAccountsNeverReceiveTheOwnership() {
        assertTrue(ChatOwnership.recipient(person(502L), 1L));
        TdApi.User bot = new TdApi.User();
        bot.id = 504L;
        bot.type = new TdApi.UserTypeBot();
        assertFalse(ChatOwnership.recipient(bot, 1L));
        TdApi.User deleted = new TdApi.User();
        deleted.id = 507L;
        deleted.type = new TdApi.UserTypeDeleted();
        assertFalse(ChatOwnership.recipient(deleted, 1L));
        assertFalse(ChatOwnership.recipient(person(1L), 1L));
        assertFalse(ChatOwnership.recipient(person(0L), 1L));
        assertFalse(ChatOwnership.recipient(null, 1L));
    }

    @Test public void theHeirIdentifierComesFromTheAnswerItself() {
        assertEquals(502L, ChatOwnership.successor(person(502L)));
        assertEquals(0L, ChatOwnership.successor(null));
    }

    @Test public void aBasicGroupExitNamesTheHeirAndSaysItIsImmediate() {
        String text = ChatOwnership.exitMessage("Ideas & café", "Álex Moreno", basic());
        assertTrue(text.contains("Ideas & café"));
        assertTrue(text.contains("Álex Moreno"));
        assertTrue(text.contains("grupo básico"));
        assertTrue(text.contains("en cuanto sales"));
        assertFalse(text.contains("7 días"));
    }

    @Test public void aSupergroupExitKeepsTheSevenDayRuleAndOffersTheTransfer() {
        String text = ChatOwnership.exitMessage("WRGram · Comunidad", "María Fernández", supergroup(false));
        assertTrue(text.contains("María Fernández"));
        assertTrue(text.contains("7 días"));
        assertTrue(text.contains("transferírsela ahora"));
        assertFalse(text.contains("grupo básico"));
    }

    @Test public void anUnknownHeirIsAdmittedInsteadOfInvented() {
        for (String missing : new String[] { null, "", "   " }) {
            String text = ChatOwnership.exitMessage("Ideas & café", missing, basic());
            assertTrue(text.contains(ChatOwnership.NO_SUCCESSOR));
            assertFalse(text.contains("Álex"));
        }
    }

    @Test public void noMessageIsLeftWithoutABodyOrWithTheRawTitleUntouched() {
        String unnamed = ChatOwnership.exitMessage(null, "Álex Moreno", basic());
        assertTrue(unnamed.contains("esta comunidad"));
        assertTrue(ChatOwnership.exitMessage("  Con espacio  ", "Álex Moreno", basic()).contains("«Con espacio»"));
        for (String sentence : new String[] {
            ChatOwnership.UNSUPPORTED, ChatOwnership.BAD_RECIPIENT, ChatOwnership.SELF_RECIPIENT, ChatOwnership.NO_SUCCESSOR,
        }) {
            assertFalse(sentence.isEmpty());
            assertTrue(sentence, sentence.endsWith("."));
        }
    }

    @Test public void theFourSentencesSayFourDifferentThings() {
        assertEquals(4, java.util.Set.of(
            ChatOwnership.UNSUPPORTED, ChatOwnership.BAD_RECIPIENT, ChatOwnership.SELF_RECIPIENT, ChatOwnership.NO_SUCCESSOR).size());
        // El chat privado se nombra con las dos verbos: no hay nada que transferir ni que heredar.
        assertTrue(ChatOwnership.UNSUPPORTED.contains("transferir"));
        assertTrue(ChatOwnership.UNSUPPORTED.contains("heredar"));
        assertTrue(ChatOwnership.BAD_RECIPIENT.contains("bot"));
        assertTrue(ChatOwnership.BAD_RECIPIENT.contains("eliminada"));
    }

    @Test public void theTransferAnswerHasItsOwnKeyAndNeitherOfTheTwoMoments() {
        assertEquals("transfer", ChatOwnership.TRANSFER);
        assertNotEquals(ChatOwnership.IMMEDIATE, ChatOwnership.SEVEN_DAYS);
        assertNotEquals(ChatOwnership.TRANSFER, ChatMembership.LEFT);
    }
}
