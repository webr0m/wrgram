package cc.webrom.wrgram;

import static org.junit.Assert.*;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

/** Las reglas de `BasicGroupRoster`, medidas contra la schema de TDLib y no contra la costumbre. */
public class BasicGroupRosterPolicyTest {
    private static TdApi.Chat chat(TdApi.ChatType type) {
        TdApi.Chat value = new TdApi.Chat();
        value.type = type;
        return value;
    }

    private static TdApi.Chat basic(long id) {
        return chat(new TdApi.ChatTypeBasicGroup(id));
    }

    private static TdApi.Chat supergroup(boolean channel) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = channel;
        return chat(type);
    }

    private static TdApi.ChatMemberStatus member() {
        return new TdApi.ChatMemberStatusMember(0);
    }

    private static TdApi.ChatMemberStatus creator(boolean inside) {
        return new TdApi.ChatMemberStatusCreator(false, inside);
    }

    private static TdApi.ChatMemberStatus admin() {
        return new TdApi.ChatMemberStatusAdministrator(false, new TdApi.ChatAdministratorRights());
    }

    private static TdApi.ChatMemberStatus restricted(boolean inside) {
        return new TdApi.ChatMemberStatusRestricted(inside, 0, new TdApi.ChatPermissions());
    }

    private static TdApi.ChatMember row(long userId, TdApi.ChatMemberStatus status) {
        return new TdApi.ChatMember(new TdApi.MessageSenderUser(userId), "", 0L, 0, status);
    }

    @Test public void onlyBasicGroupsAreListableInOneAnswer() {
        assertTrue(BasicGroupRoster.applicable(basic(7L)));
        assertFalse(BasicGroupRoster.applicable(supergroup(false)));
        assertFalse(BasicGroupRoster.applicable(supergroup(true)));
        assertFalse(BasicGroupRoster.applicable(chat(new TdApi.ChatTypePrivate())));
        assertFalse(BasicGroupRoster.applicable(chat(new TdApi.ChatTypeSecret())));
        assertFalse(BasicGroupRoster.applicable(null));
    }

    @Test public void theIdentifierComesFromTheChatTypeAndNothingElse() {
        assertEquals(7L, BasicGroupRoster.groupId(basic(7L)));
        assertEquals(0L, BasicGroupRoster.groupId(supergroup(false)));
        assertEquals(0L, BasicGroupRoster.groupId(null));
    }

    @Test public void theCapIsTheNumberTheSchemaGivesToBasicGroups() {
        assertEquals(200, BasicGroupRoster.MAX);
        assertEquals(MemberAdditions.BASIC_LIMIT, BasicGroupRoster.MAX);
    }

    @Test public void onlyPersonsAreListed() {
        TdApi.ChatMember other = new TdApi.ChatMember(new TdApi.MessageSenderChat(11L), "", 0L, 0, member());
        assertFalse(BasicGroupRoster.visible(other));
        assertEquals(0L, BasicGroupRoster.userId(other));
        assertTrue(BasicGroupRoster.visible(row(5L, member())));
        assertEquals(5L, BasicGroupRoster.userId(row(5L, member())));
        assertFalse(BasicGroupRoster.visible(null));
    }

    @Test public void theSixStatusesHaveSixDifferentNames() {
        assertEquals(BasicGroupRoster.CREATOR, BasicGroupRoster.status(creator(true)));
        assertEquals(BasicGroupRoster.ADMIN, BasicGroupRoster.status(admin()));
        assertEquals(BasicGroupRoster.MEMBER, BasicGroupRoster.status(member()));
        assertEquals(BasicGroupRoster.RESTRICTED, BasicGroupRoster.status(restricted(true)));
        assertEquals(BasicGroupRoster.LEFT, BasicGroupRoster.status(new TdApi.ChatMemberStatusLeft()));
        assertEquals(BasicGroupRoster.BANNED, BasicGroupRoster.status(new TdApi.ChatMemberStatusBanned(0)));
    }

    @Test public void anUnknownStatusIsNotQuietlyCalledMember() {
        assertEquals(BasicGroupRoster.UNKNOWN, BasicGroupRoster.status(null));
        assertNotEquals(BasicGroupRoster.MEMBER, BasicGroupRoster.status(null));
        assertEquals(4, BasicGroupRoster.rank(null));
    }

    @Test public void someoneWhoLeftIsNotTheSameAsSomeoneInside() {
        assertEquals(3, BasicGroupRoster.rank(new TdApi.ChatMemberStatusLeft()));
        assertEquals(3, BasicGroupRoster.rank(new TdApi.ChatMemberStatusBanned(0)));
        assertEquals(2, BasicGroupRoster.rank(member()));
        assertEquals(2, BasicGroupRoster.rank(restricted(true)));
        assertEquals(3, BasicGroupRoster.rank(restricted(false)));
        assertEquals(0, BasicGroupRoster.rank(creator(true)));
        assertEquals(3, BasicGroupRoster.rank(creator(false)));
        assertEquals(1, BasicGroupRoster.rank(admin()));
    }

    @Test public void theOrderIsOursAndItDoesNotTouchWhatTdlibReturned() {
        TdApi.ChatMember[] input = {
            row(30L, new TdApi.ChatMemberStatusLeft()),
            row(20L, admin()),
            row(40L, member()),
            row(10L, creator(true)),
        };
        TdApi.ChatMember[] before = input.clone();
        TdApi.ChatMember[] ordered = BasicGroupRoster.order(input);
        assertArrayEquals(before, input);
        assertEquals(10L, BasicGroupRoster.userId(ordered[0]));
        assertEquals(20L, BasicGroupRoster.userId(ordered[1]));
        assertEquals(40L, BasicGroupRoster.userId(ordered[2]));
        assertEquals(30L, BasicGroupRoster.userId(ordered[3]));
        assertEquals(0, BasicGroupRoster.order(null).length);
    }

    @Test public void peopleWhoLeftDoNotCountAsMembers() {
        TdApi.ChatMember[] rows = {
            row(1L, creator(true)), row(2L, member()), row(3L, new TdApi.ChatMemberStatusLeft()),
            row(4L, new TdApi.ChatMemberStatusBanned(0)), row(5L, restricted(false)),
            new TdApi.ChatMember(new TdApi.MessageSenderChat(9L), "", 0L, 0, member()),
        };
        assertEquals(2, BasicGroupRoster.inside(rows));
        assertEquals(0, BasicGroupRoster.inside(null));
        assertEquals(0, BasicGroupRoster.inside(new TdApi.ChatMember[0]));
    }

    @Test public void theFreeSeatsAreCountedFromTheRealList() {
        assertEquals(188, BasicGroupRoster.remaining(12));
        assertEquals(0, BasicGroupRoster.remaining(200));
        assertEquals(0, BasicGroupRoster.remaining(240));
        assertEquals(BasicGroupRoster.MAX, BasicGroupRoster.remaining(0));
    }

    @Test public void theSearchIsLocalCaseInsensitiveAndOverNameOrUsername() {
        assertTrue(BasicGroupRoster.matches("", "María Fernández", "maria_f"));
        assertTrue(BasicGroupRoster.matches("   ", "María Fernández", "maria_f"));
        assertTrue(BasicGroupRoster.matches("fer", "María Fernández", null));
        assertTrue(BasicGroupRoster.matches("MARIA_", "nada", "maria_f"));
        assertFalse(BasicGroupRoster.matches("zzz", "María Fernández", "maria_f"));
        assertTrue(BasicGroupRoster.matches("maria", null, "maria_f"));
        assertFalse(BasicGroupRoster.matches("a", null, null));
    }

    @Test public void aLongQueryIsRefusedBeforeTheBridgeRuns() {
        assertFalse(BasicGroupRoster.tooLong(null));
        assertFalse(BasicGroupRoster.tooLong("  diseño  "));
        assertTrue(BasicGroupRoster.tooLong("x".repeat(81)));
        assertFalse(BasicGroupRoster.tooLong("x".repeat(80)));
        assertEquals(80, BasicGroupRoster.MAX_QUERY);
    }

    @Test public void theNoteSeparatesTheTotalFromThePeopleStillInside() {
        assertEquals(BasicGroupRoster.EMPTY, BasicGroupRoster.note(5L, 0, 0));
        assertTrue(BasicGroupRoster.note(5L, 1, 1).contains("1 persona"));
        assertTrue(BasicGroupRoster.note(5L, 1, 1).contains("sigue dentro."));
        assertTrue(BasicGroupRoster.note(5L, 12, 12).contains("todas siguen dentro."));
        assertTrue(BasicGroupRoster.note(5L, 12, 10).contains("10 siguen dentro"));
        assertTrue(BasicGroupRoster.note(5L, 12, 10).contains("2 se fueron o fueron expulsados."));
        assertTrue(BasicGroupRoster.note(5L, 4, 0).contains("ninguna sigue dentro"));
        assertNotEquals(BasicGroupRoster.note(5L, 12, 10), BasicGroupRoster.note(5L, 12, 12));
    }

    @Test public void aMissingCreatorIsSaidAndNotHidden() {
        assertTrue(BasicGroupRoster.note(0L, 6, 6).endsWith(BasicGroupRoster.NO_CREATOR));
        assertFalse(BasicGroupRoster.note(9L, 6, 6).contains(BasicGroupRoster.NO_CREATOR));
    }

    /** La firma de la invitación es un nombre o no es; un identificador pintado es el defecto que cierra esta regla. */
    @Test public void theInviterIsNamedOrAbsentAndNeverANumber() {
        assertEquals("", BasicGroupRoster.invitedName(0L, "Usuario de Telegram"));
        assertEquals("Rosa Ibarra", BasicGroupRoster.invitedName(500L, "Rosa Ibarra"));
        assertEquals("Usuario de Telegram", BasicGroupRoster.invitedName(501L, "Usuario de Telegram"));
        assertNotEquals("501", BasicGroupRoster.invitedName(501L, "Usuario de Telegram"));
    }

    @Test public void theRejectionPhrasesAreAllDifferentAndNoneReusesAnotherRound() {
        String[] phrases = {BasicGroupRoster.UNSUPPORTED, BasicGroupRoster.EMPTY, BasicGroupRoster.NO_CREATOR,
            BasicGroupRoster.ORDER, BasicGroupRoster.TOO_LONG, BasicGroupRoster.CREATOR, BasicGroupRoster.ADMIN,
            BasicGroupRoster.MEMBER, BasicGroupRoster.RESTRICTED, BasicGroupRoster.LEFT, BasicGroupRoster.BANNED,
            BasicGroupRoster.UNKNOWN};
        for (int i = 0; i < phrases.length; i++) {
            assertFalse(falsy(phrases[i]));
            for (int j = i + 1; j < phrases.length; j++) assertNotEquals(phrases[i], phrases[j]);
        }
        assertNotEquals(MemberAdditions.FULL, BasicGroupRoster.EMPTY);
    }

    private static boolean falsy(String value) {
        return value == null || value.trim().isEmpty();
    }
}
