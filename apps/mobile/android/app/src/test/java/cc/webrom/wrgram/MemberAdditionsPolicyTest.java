package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/** Las reglas de `MemberAdditions`, medidas contra la schema de TDLib y no contra la intuición. */
public class MemberAdditionsPolicyTest {
    private static TdApi.Chat chat(TdApi.ChatType type) {
        TdApi.Chat value = new TdApi.Chat();
        value.type = type;
        return value;
    }

    private static TdApi.Chat basicGroup() {
        return chat(new TdApi.ChatTypeBasicGroup());
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        return chat(type);
    }

    private static TdApi.ChatMemberStatus member() {
        return new TdApi.ChatMemberStatusMember();
    }

    private static TdApi.ChatMemberStatus creator(boolean inside) {
        return new TdApi.ChatMemberStatusCreator(false, inside);
    }

    private static TdApi.ChatMemberStatus admin(boolean invite) {
        TdApi.ChatAdministratorRights rights = new TdApi.ChatAdministratorRights();
        rights.canInviteUsers = invite;
        return new TdApi.ChatMemberStatusAdministrator(false, rights);
    }

    private static TdApi.ChatMemberStatus restricted(boolean inside, boolean invite) {
        TdApi.ChatPermissions permissions = new TdApi.ChatPermissions();
        permissions.canInviteUsers = invite;
        return new TdApi.ChatMemberStatusRestricted(inside, 0, permissions);
    }

    /** Sin obstáculo conocido: dentro, con permiso y hueco libre. */
    private static String clear(TdApi.Chat chat, TdApi.ChatMemberStatus self) {
        return MemberAdditions.problem(chat, 0, 12, self);
    }

    @Test public void privateAndSecretChatsAreNotOfferedAtAll() {
        assertNotNull(MemberAdditions.problem(chat(new TdApi.ChatTypePrivate()), 0, 0, member()));
        assertNotNull(MemberAdditions.problem(chat(new TdApi.ChatTypeSecret()), 0, 0, member()));
        assertNull(clear(basicGroup(), member()));
        assertNull(clear(supergroup(false), admin(true)));
        assertNull(clear(supergroup(true), creator(true)));
    }

    @Test public void aMigratedBasicGroupMustBeReachedThroughItsSupergroup() {
        assertEquals(MemberAdditions.MIGRATED,
            MemberAdditions.problem(basicGroup(), 987654321L, 12, member()));
    }

    @Test public void beingOutsideOrBannedIsToldBeforeAskingTelegram() {
        assertEquals(MemberAdditions.BANNED,
            MemberAdditions.problem(basicGroup(), 0, 12, new TdApi.ChatMemberStatusBanned(0)));
        assertEquals(MemberAdditions.OUTSIDE,
            MemberAdditions.problem(basicGroup(), 0, 12, new TdApi.ChatMemberStatusLeft()));
        // Restringida pero fuera de la lista: no invita.
        assertEquals(MemberAdditions.OUTSIDE,
            MemberAdditions.problem(basicGroup(), 0, 12, restricted(false, true)));
    }

    @Test public void theInvitingRightComesFromTheStatusAndNotFromWishfulThinking() {
        assertEquals(MemberAdditions.NO_RIGHT, clear(supergroup(false), admin(false)));
        assertEquals(MemberAdditions.NO_RIGHT, clear(supergroup(true), restricted(true, false)));
        assertNull(clear(supergroup(true), restricted(true, true)));
        // Una cuenta que se fue de la comunidad no es creadora: `isMember` manda.
        assertEquals(MemberAdditions.OUTSIDE,
            MemberAdditions.problem(supergroup(true), 0, 12, creator(false)));
    }

    @Test public void anyMemberOfABasicGroupInvitesButPlainMembersOfASupergroupDoNot() {
        assertNull(clear(basicGroup(), member()));
        assertEquals(MemberAdditions.NO_RIGHT, clear(supergroup(false), member()));
    }

    @Test public void aFullBasicGroupIsRejectedWithTheSchemaNumberNotAGuess() {
        assertEquals(200, MemberAdditions.BASIC_LIMIT);
        assertEquals(MemberAdditions.FULL, MemberAdditions.problem(basicGroup(), 0, 200, member()));
        assertNull(MemberAdditions.problem(basicGroup(), 0, 199, member()));
        // En supergrupo el tope no lo impone esta regla: lo impone Telegram.
        assertNull(MemberAdditions.problem(supergroup(false), 0, 5000, admin(true)));
    }

    @Test public void anEmptyOrHugeBatchIsRefusedBeforeTheFirstRequest() {
        assertEquals(MemberAdditions.EMPTY, MemberAdditions.batch(0));
        assertEquals(MemberAdditions.EMPTY, MemberAdditions.batch(-3));
        assertNull(MemberAdditions.batch(1));
        assertNull(MemberAdditions.batch(MemberAdditions.MAX_BATCH));
        assertEquals(MemberAdditions.TOO_MANY, MemberAdditions.batch(21));
    }

    @Test public void identifiersAreDigitsGreaterThanZeroAndNothingElse() {
        assertTrue(MemberAdditions.positive("7"));
        assertTrue(MemberAdditions.positive("1234567890123"));
        assertFalse(MemberAdditions.positive(""));
        assertFalse(MemberAdditions.positive(" 7"));
        assertFalse(MemberAdditions.positive("0"));
        assertFalse(MemberAdditions.positive("-4"));
        assertFalse(MemberAdditions.positive("7a"));
        assertFalse(MemberAdditions.positive("12345678901234567890123"));
        assertFalse(MemberAdditions.positive(null));
    }

    @Test public void theForwardLimitOnlyTravelsInBasicGroups() {
        assertEquals(30, MemberAdditions.forward(basicGroup(), 30));
        assertEquals(100, MemberAdditions.forward(basicGroup(), 250));
        assertEquals(0, MemberAdditions.forward(basicGroup(), 0));
        // «Ignored for supergroups and channels»: mandarlo lleno sería prometer historial de más.
        assertEquals(0, MemberAdditions.forward(supergroup(false), 30));
        assertEquals(0, MemberAdditions.forward(supergroup(true), 30));
        assertEquals(0, MemberAdditions.forward(chat(new TdApi.ChatTypePrivate()), 30));
        assertTrue(MemberAdditions.forwardsHistory(basicGroup()));
        assertFalse(MemberAdditions.forwardsHistory(supergroup(false)));
    }

    @Test public void aForwardLimitOutsideTheSchemaRangeIsRefused() {
        assertNull(MemberAdditions.forwardProblem(0));
        assertNull(MemberAdditions.forwardProblem(100));
        assertEquals(MemberAdditions.BAD_FORWARD, MemberAdditions.forwardProblem(101));
        assertEquals(MemberAdditions.BAD_FORWARD, MemberAdditions.forwardProblem(-1));
    }

    @Test public void onlyTheTwoPremiumSignalsCanBeNamedFromFailedToAddMembers() {
        TdApi.FailedToAddMember plain = new TdApi.FailedToAddMember(7, false, false);
        assertEquals(MemberAdditions.FAILED, MemberAdditions.reason(plain));
        assertEquals(MemberAdditions.PREMIUM_WOULD_ALLOW,
            MemberAdditions.reason(new TdApi.FailedToAddMember(7, true, false)));
        assertEquals(MemberAdditions.PREMIUM_REQUIRED,
            MemberAdditions.reason(new TdApi.FailedToAddMember(7, true, true)));
        assertEquals(MemberAdditions.FAILED, MemberAdditions.reason(null));
    }

    @Test public void theRejectionListIsSearchedByUserAndStaysSilentWhenAbsent() {
        TdApi.FailedToAddMember first = new TdApi.FailedToAddMember(11, false, false);
        TdApi.FailedToAddMember second = new TdApi.FailedToAddMember(22, true, false);
        TdApi.FailedToAddMembers list = new TdApi.FailedToAddMembers(new TdApi.FailedToAddMember[]{first, second});
        assertSame(first, MemberAdditions.named(list, 11));
        assertSame(second, MemberAdditions.named(list, 22));
        assertNull(MemberAdditions.named(list, 33));
        assertNull(MemberAdditions.named(new TdApi.FailedToAddMembers(new TdApi.FailedToAddMember[0]), 11));
        assertNull(MemberAdditions.named(null, 11));
    }

    @Test public void addedNeedsConfirmationAndANamedRejectionAlwaysWins() {
        assertEquals(MemberAdditions.REJECTED,
            MemberAdditions.outcome(new TdApi.FailedToAddMember(7, false, false), member()));
        assertEquals(MemberAdditions.ADDED, MemberAdditions.outcome(null, member()));
        assertEquals(MemberAdditions.ADDED, MemberAdditions.outcome(null, admin(true)));
        assertEquals(MemberAdditions.ADDED, MemberAdditions.outcome(null, creator(true)));
        // Respondió y no nombró a nadie, pero la membresía sigue sin confirmarse.
        assertEquals(MemberAdditions.UNCLEAR, MemberAdditions.outcome(null, new TdApi.ChatMemberStatusLeft()));
        assertEquals(MemberAdditions.UNCLEAR, MemberAdditions.outcome(null, null));
        assertEquals(MemberAdditions.UNCLEAR,
            MemberAdditions.outcome(null, restricted(false, false)));
    }

    @Test public void everyRejectionSaysSomethingDifferentAndNoneIsAnEmptyString() {
        String[] phrases = {MemberAdditions.UNSUPPORTED, MemberAdditions.MIGRATED, MemberAdditions.BANNED,
            MemberAdditions.OUTSIDE, MemberAdditions.NO_RIGHT, MemberAdditions.FULL, MemberAdditions.EMPTY,
            MemberAdditions.TOO_MANY, MemberAdditions.BAD_ID, MemberAdditions.BAD_FORWARD, MemberAdditions.CANCELLED_NOTICE};
        for (String phrase : phrases) {
            assertNotNull(phrase);
            assertTrue(phrase.length() > 20);
            assertTrue(phrase.endsWith("."));
        }
        assertEquals(phrases.length, java.util.Arrays.stream(phrases).distinct().count());
    }
}
