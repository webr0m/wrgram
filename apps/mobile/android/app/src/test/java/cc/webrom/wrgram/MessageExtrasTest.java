package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;
import org.junit.Test;

public class MessageExtrasTest {
    private static TdApi.Message message(TdApi.MessageContent content) {
        TdApi.Message message = new TdApi.Message();
        message.content = content;
        return message;
    }

    @Test public void liveLocationsExposeCurrentCoordinatesAndKeepTheirOriginalExpiry() throws Exception {
        TdApi.LiveLocation live = new TdApi.LiveLocation(new TdApi.Location(0, -70.6, 20), 900, 0, 0);
        TdApi.Message message = message(new TdApi.MessageLiveLocation(live, 30));
        message.date = 1000;
        JSONObject card = MessageExtras.card(message, null, false);
        assertEquals(0.0, card.getDouble("latitude"), 0.0);
        assertEquals(-70.6, card.getDouble("longitude"), 0.0);
        assertEquals(1900, card.getLong("expiresAt"));
        assertTrue(card.getBoolean("canOpen"));
        assertFalse(MessageExtras.card(message, null, true).getBoolean("canOpen"));
        ((TdApi.MessageLiveLocation) message.content).expiresIn = 0;
        assertEquals(0, MessageExtras.card(message, null, false).getLong("expiresAt"));
        message.isOutgoing = true;
        assertFalse("Sin tiempo que renovar no hay nada que dejar de compartir.",
                MessageExtras.card(message, null, false).getBoolean("canStop"));
        ((TdApi.MessageLiveLocation) message.content).expiresIn = 30;
        assertTrue(MessageExtras.card(message, null, false).getBoolean("canStop"));
        message.isOutgoing = false;
        assertFalse(MessageExtras.card(message, null, false).getBoolean("canStop"));
    }

    @Test public void temporaryMessagesDoNotExposeCardPayloads() throws Exception {
        TdApi.Message message = message(new TdApi.MessageLocation(new TdApi.Location(1, 2, 0)));
        message.selfDestructType = new TdApi.MessageSelfDestructTypeImmediately();
        assertNull(MessageExtras.card(message, null, false));
        assertFalse(MessageExtras.validLocation(new TdApi.Location(0, Double.NaN, 0)));
    }

    @Test public void contactsAndDiceKeepExactDataAndUnsupportedIsExplicit() throws Exception {
        TdApi.Contact contact = new TdApi.Contact("+56912345678", "Ana", "Pérez", "", 9007199254740993L);
        JSONObject card = MessageExtras.card(message(new TdApi.MessageContact(contact)), null, true);
        assertEquals("Ana Pérez", card.getString("name"));
        assertEquals("9007199254740993", card.getString("userId"));
        assertFalse(card.getBoolean("canCopy"));
        TdApi.MessageDice dice = new TdApi.MessageDice();
        dice.emoji = "🎯";
        dice.value = 6;
        assertEquals(6, MessageExtras.card(message(dice), null, false).getInt("value"));
        assertEquals("unsupported", MessageExtras.card(message(new TdApi.MessageUnsupported()), null, false).getString("kind"));
    }
}
