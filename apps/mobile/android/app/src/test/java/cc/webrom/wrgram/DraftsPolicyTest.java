package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class DraftsPolicyTest {
    private static TdApi.TextEntity[] bold(int offset, int length) {
        return new TdApi.TextEntity[] {new TdApi.TextEntity(offset, length, new TdApi.TextEntityTypeBold())};
    }

    private static TdApi.DraftMessage saved(long replyTo) {
        return new TdApi.DraftMessage(Drafts.target(replyTo), 0,
            new TdApi.DraftMessageContentText(new TdApi.FormattedText("texto", new TdApi.TextEntity[0]), null), 0L, null);
    }

    @Test public void blankTextLeavesNoDraftToSave() {
        assertNull(Drafts.build("", new TdApi.TextEntity[0], 0L));
        assertNull(Drafts.build("   ", bold(0, 3), 42L));
        assertNull(Drafts.build(null, null, 7L));
    }

    @Test public void theTextAndItsFormattingStayInsideTheDraft() {
        TdApi.DraftMessage draft = Drafts.build("hola", bold(0, 4), 0L);
        assertTrue(draft.content instanceof TdApi.DraftMessageContentText);
        TdApi.FormattedText body = ((TdApi.DraftMessageContentText) draft.content).text;
        assertEquals("hola", body.text);
        assertEquals(1, body.entities.length);
        assertEquals(0, body.entities[0].offset);
        assertTrue(body.entities[0].type instanceof TdApi.TextEntityTypeBold);
    }

    @Test public void theReplyIsTheMessageOfThisChatAndNothingElse() {
        TdApi.DraftMessage draft = Drafts.build("hola", new TdApi.TextEntity[0], 42L);
        assertTrue(draft.replyTo instanceof TdApi.InputMessageReplyToMessage);
        assertEquals(42L, ((TdApi.InputMessageReplyToMessage) draft.replyTo).messageId);
        assertNull(((TdApi.InputMessageReplyToMessage) draft.replyTo).quote);
        assertEquals(0, ((TdApi.InputMessageReplyToMessage) draft.replyTo).checklistTaskId);
        assertEquals("", ((TdApi.InputMessageReplyToMessage) draft.replyTo).pollOptionId);
        assertNull(Drafts.target(0L));
    }

    @Test public void nothingIsInventedAroundTheDraft() {
        TdApi.DraftMessage draft = Drafts.build("hola", new TdApi.TextEntity[0], 9L);
        assertEquals(0L, draft.effectId);
        assertNull(draft.suggestedPostInfo);
        assertEquals(0, draft.date);
        assertNull(((TdApi.DraftMessageContentText) draft.content).linkPreviewOptions);
    }

    @Test public void entitiesSurviveTogetherWithTheReply() {
        TdApi.DraftMessage draft = Drafts.build("negrita y código", new TdApi.TextEntity[] {
            new TdApi.TextEntity(0, 7, new TdApi.TextEntityTypeBold()),
            new TdApi.TextEntity(12, 6, new TdApi.TextEntityTypeCode())}, 501L);
        TdApi.FormattedText body = ((TdApi.DraftMessageContentText) draft.content).text;
        assertEquals(2, body.entities.length);
        assertEquals(501L, Drafts.replyOf(draft));
    }

    @Test public void theCitedIdTravelsAsTextBecauseSixtyFourBitsDoNotFitADouble() {
        assertEquals("", Drafts.replyId(saved(0L)));
        assertEquals("42", Drafts.replyId(saved(42L)));
        assertEquals("9007199254740993", Drafts.replyId(saved(9007199254740993L)));
        assertEquals(Long.toString(Long.MAX_VALUE), Drafts.replyId(saved(Long.MAX_VALUE)));
    }

    @Test public void variantsWeDoNotUnderstandProjectNothingInsteadOfGuessing() {
        TdApi.DraftMessage external = new TdApi.DraftMessage(
            new TdApi.InputMessageReplyToExternalMessage(8, 42L, null, 0, ""), 0,
            new TdApi.DraftMessageContentText(new TdApi.FormattedText("texto", new TdApi.TextEntity[0]), null), 0L, null);
        TdApi.DraftMessage story = new TdApi.DraftMessage(
            new TdApi.InputMessageReplyToStory(8, 3), 0,
            new TdApi.DraftMessageContentText(new TdApi.FormattedText("texto", new TdApi.TextEntity[0]), null), 0L, null);
        TdApi.DraftMessage ephemeral = new TdApi.DraftMessage(
            new TdApi.InputMessageReplyToEphemeralMessage(4), 0,
            new TdApi.DraftMessageContentText(new TdApi.FormattedText("texto", new TdApi.TextEntity[0]), null), 0L, null);
        for (TdApi.DraftMessage draft : new TdApi.DraftMessage[] {external, story, ephemeral}) {
            assertEquals(0L, Drafts.replyOf(draft));
            assertEquals("", Drafts.replyId(draft));
        }
        assertEquals(0L, Drafts.replyOf(null));
        assertEquals("", Drafts.replyId(null));
    }

    @Test public void theSameCitationTwiceIsTheSameDraft() {
        assertEquals(Drafts.replyOf(saved(7L)), Drafts.replyOf(saved(7L)));
        assertEquals(0L, Drafts.replyOf(saved(0L)));
        assertEquals(0L, Drafts.replyOf(new TdApi.DraftMessage(new TdApi.InputMessageReplyToStory(8, 3), 0,
            new TdApi.DraftMessageContentText(new TdApi.FormattedText("texto", new TdApi.TextEntity[0]), null), 0L, null)));
    }
}
