package cc.webrom.wrgram;

import static org.junit.Assert.*;
import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class EmojiStatusTest {
    @Test public void serializesOnlyAnActiveStatusFromAPremiumAccount() throws Exception {
        TdApi.User user = new TdApi.User();
        user.isPremium = true;
        user.emojiStatus = new TdApi.EmojiStatus(new TdApi.EmojiStatusTypeCustomEmoji(8_765_432_109_876_543_210L), 0);
        assertEquals("8765432109876543210", NativeSnapshot.emojiStatus(user).getString("customEmojiId"));
        user.emojiStatus.expirationDate = 1;
        assertNull(NativeSnapshot.emojiStatus(user));
        user.emojiStatus.expirationDate = 0;
        user.isPremium = false;
        assertNull(NativeSnapshot.emojiStatus(user));
    }

    @Test public void usesTheGiftModelAsItsVisibleEmoji() throws Exception {
        TdApi.User user = new TdApi.User();
        user.isPremium = true;
        TdApi.EmojiStatusTypeUpgradedGift gift = new TdApi.EmojiStatusTypeUpgradedGift();
        gift.modelCustomEmojiId = 123;
        gift.symbolCustomEmojiId = 456;
        user.emojiStatus = new TdApi.EmojiStatus(gift, 0);
        assertEquals("123", NativeSnapshot.emojiStatus(user).getString("customEmojiId"));
    }
}
