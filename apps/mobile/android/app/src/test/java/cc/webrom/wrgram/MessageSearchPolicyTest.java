package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class MessageSearchPolicyTest {
    private static final long NOW = 1_770_000_000L;

    private static TdApi.Chat of(long id, TdApi.ChatType type) {
        TdApi.Chat chat = new TdApi.Chat();
        chat.id = id;
        chat.type = type;
        return chat;
    }

    private static TdApi.Chat channel(long id) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = true;
        return of(id, type);
    }

    private static TdApi.Chat group(long id) {
        TdApi.ChatTypeSupergroup type = new TdApi.ChatTypeSupergroup();
        type.isChannel = false;
        return of(id, type);
    }

    private static TdApi.Chat privateChat(long id) {
        return of(id, new TdApi.ChatTypePrivate());
    }

    private static TdApi.Chat secret(long id) {
        return of(id, new TdApi.ChatTypeSecret());
    }

    @Test public void onlySecretChatsNeedTheOtherFunction() {
        assertTrue(MessageSearch.secret(secret(7)));
        assertFalse(MessageSearch.secret(group(7)));
        assertFalse(MessageSearch.secret(privateChat(7)));
        assertFalse(MessageSearch.secret(null));
    }

    @Test public void onlyChannelsPostUnderTheirOwnName() {
        assertTrue(MessageSearch.selfPosting(channel(9)));
        assertFalse(MessageSearch.selfPosting(group(9)));
        assertFalse(MessageSearch.selfPosting(of(9, new TdApi.ChatTypeBasicGroup())));
        assertFalse(MessageSearch.selfPosting(privateChat(9)));
        assertFalse(MessageSearch.selfPosting(secret(9)));
    }

    @Test public void aSecretChatAcceptsTextAndFilterButNoSenderOrDates() {
        assertNull(MessageSearch.problem("", 0, 0, NOW, secret(7)));
        assertEquals(MessageSearch.SECRET_BAND, MessageSearch.problem("730", 0, 0, NOW, secret(7)));
        assertEquals(MessageSearch.SECRET_BAND, MessageSearch.problem("", NOW - 3600, NOW - 60, NOW, secret(7)));
        assertEquals(MessageSearch.SECRET_BAND, MessageSearch.problem(MessageSearch.CHAT, 0, 0, NOW, secret(7)));
    }

    @Test public void aSenderIsEitherADecimalTelegramIdOrTheChatItself() {
        assertTrue(MessageSearch.positive("730"));
        assertTrue(MessageSearch.positive("9007199254740993"));
        assertFalse(MessageSearch.positive(""));
        assertFalse(MessageSearch.positive("0"));
        assertFalse(MessageSearch.positive("-730"));
        assertFalse(MessageSearch.positive("730x"));
        assertFalse(MessageSearch.positive(" 730"));
        assertFalse(MessageSearch.positive("00000000000000000001"));
        assertFalse(MessageSearch.positive(null));
        assertEquals(MessageSearch.BAD_SENDER, MessageSearch.problem("hola", 0, 0, NOW, group(7)));
        assertNull(MessageSearch.problem("730", 0, 0, NOW, group(7)));
        assertNull(MessageSearch.problem(" 730 ", 0, 0, NOW, group(7)));
    }

    @Test public void theChannelItselfIsOnlyAFiltersOptionWhereItCanPost() {
        assertNull(MessageSearch.problem(MessageSearch.CHAT, 0, 0, NOW, channel(7)));
        assertEquals(MessageSearch.CHAT_SENDER_ONLY, MessageSearch.problem(MessageSearch.CHAT, 0, 0, NOW, group(7)));
        assertEquals(MessageSearch.CHAT_SENDER_ONLY, MessageSearch.problem(MessageSearch.CHAT, 0, 0, NOW, privateChat(7)));
    }

    @Test public void theBandHasToBeOrderedAndInsideTheHistory() {
        assertEquals(MessageSearch.BAD_DATE, MessageSearch.problem("", -1, 0, NOW, group(7)));
        assertEquals(MessageSearch.BAD_DATE, MessageSearch.problem("", 0, -5, NOW, group(7)));
        assertEquals(MessageSearch.BAD_DATE, MessageSearch.problem("", 0, Integer.MAX_VALUE + 1L, NOW, group(7)));
        assertEquals(MessageSearch.REVERSED_BAND, MessageSearch.problem("", NOW, NOW, NOW, group(7)));
        assertEquals(MessageSearch.REVERSED_BAND, MessageSearch.problem("", NOW, NOW - 10, NOW, group(7)));
        assertEquals(MessageSearch.FUTURE_BAND, MessageSearch.problem("", NOW + 10, NOW + 86400, NOW, group(7)));
        assertNull(MessageSearch.problem("", NOW - 3600, NOW + 86400, NOW, group(7)));
    }

    @Test public void theEndOfTodayIsInTheFutureAndStillASearchableUpperBound() {
        // `dayBounds` devuelve la medianoche siguiente: rechazarla sería no poder buscar «hoy».
        assertNull(MessageSearch.problem("730", NOW - 60, NOW + 43200, NOW, group(7)));
    }

    @Test public void theWindowIsCappedBecauseTheBandIsCutOnThisSide() {
        long start = NOW - MessageSearch.MAX_WINDOW;
        assertNull(MessageSearch.problem("", start, NOW, NOW, group(7)));
        assertEquals(MessageSearch.WIDE_BAND, MessageSearch.problem("", start, NOW + 1, NOW, group(7)));
        // Sin tope de arriba no hay ventana que acotar: se pagina hasta el principio de la banda.
        assertNull(MessageSearch.problem("", start, 0, NOW, group(7)));
    }

    @Test public void theSenderObjectIsTheVariantTelegramExpects() {
        assertNull(MessageSearch.sender("", group(7)));
        TdApi.MessageSender chat = MessageSearch.sender(" " + MessageSearch.CHAT + " ", channel(41));
        assertTrue(chat instanceof TdApi.MessageSenderChat);
        assertEquals(41L, ((TdApi.MessageSenderChat) chat).chatId);
        TdApi.MessageSender user = MessageSearch.sender("730", group(7));
        assertTrue(user instanceof TdApi.MessageSenderUser);
        assertEquals(730L, ((TdApi.MessageSenderUser) user).userId);
    }

    @Test public void theUpperBoundBecomesTheMessageJustBeforeIt() {
        assertEquals(0L, MessageSearch.seed(0));
        assertEquals(999L, MessageSearch.seed(1000));
    }

    @Test public void theLowerBoundIsACutNotASeedBecauseResultsArriveNewestFirst() {
        assertTrue(MessageSearch.keep(NOW, NOW - 10, NOW + 10));
        assertFalse(MessageSearch.keep(NOW - 11, NOW - 10, NOW + 10));
        // El tope de arriba es exclusivo: la medianoche del día siguiente no entra en ese día.
        assertFalse(MessageSearch.keep(NOW + 10, NOW - 10, NOW + 10));
        assertTrue(MessageSearch.keep(NOW - 10, NOW - 10, 0));
        assertTrue(MessageSearch.keep(1, 0, 0));
    }

    @Test public void passingTheLowerBoundEndsTheCursor() {
        assertTrue(MessageSearch.older(NOW - 1, NOW));
        assertFalse(MessageSearch.older(NOW, NOW));
        assertFalse(MessageSearch.older(1, 0));
    }

    @Test public void onlyAuthorAndDatesAreThePartsGlobalAndSecretSearchNeverSee() {
        assertFalse(MessageSearch.band("", 0, 0));
        assertFalse(MessageSearch.band(null, 0, 0));
        assertFalse(MessageSearch.band("   ", 0, 0));
        assertTrue(MessageSearch.band("730", 0, 0));
        assertTrue(MessageSearch.band(" ", NOW - 60, 0));
        assertTrue(MessageSearch.band(" ", 0, NOW));
        assertEquals(MessageSearch.SECRET_BAND, MessageSearch.problem(" ", 0, NOW, NOW, secret(7)));
        assertNull(MessageSearch.problem(" ", 0, NOW, NOW, group(7)));
    }

    @Test public void everyPartOfTheCriteriaHasToSurviveTheCursor() {
        assertTrue(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "hola", "730", "photos", NOW - 10, NOW));
        assertTrue(MessageSearch.same(null, null, null, 0, 0, "", "", "", 0, 0));
        assertFalse(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "chao", "730", "photos", NOW - 10, NOW));
        assertFalse(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "hola", "", "photos", NOW - 10, NOW));
        assertFalse(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "hola", "730", "videos", NOW - 10, NOW));
        assertFalse(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "hola", "730", "photos", NOW - 11, NOW));
        assertFalse(MessageSearch.same("hola", "730", "photos", NOW - 10, NOW, "hola", "730", "photos", NOW - 10, 0));
    }
}
