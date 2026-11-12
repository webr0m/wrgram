package cc.webrom.wrgram;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertThrows;
import static org.junit.Assert.assertTrue;

import org.drinkless.tdlib.TdApi;
import org.junit.Test;

public class CachePolicyTest {
    @Test public void cleanupCannotSelectSecretsOrNonRedownloadableMedia() {
        TdApi.OptimizeStorage sweep = CachePolicy.optimize(0, CachePolicy.NO_AGE_LIMIT, 0, "all", new long[0], new long[0]);
        assertEquals(8, sweep.fileTypes.length);
        for (TdApi.FileType file : sweep.fileTypes) assertTrue(CachePolicy.category(file) != null);
        assertNull(CachePolicy.category(new TdApi.FileTypeSecret()));
        assertNull(CachePolicy.category(new TdApi.FileTypeSelfDestructingVideo()));
        assertNull(CachePolicy.category(new TdApi.FileTypePhotoStory()));
        assertThrows(IllegalArgumentException.class, () ->
                CachePolicy.optimize(0, 0, 0, "unknown", new long[0], new long[0]));
    }

    @Test public void retentionCanDistinguishChannelsFromGroupsAndSecretChats() {
        assertEquals("channel", CachePolicy.chatKind(new TdApi.ChatTypeSupergroup(1, true)));
        assertEquals("group", CachePolicy.chatKind(new TdApi.ChatTypeSupergroup(1, false)));
        assertEquals("private", CachePolicy.chatKind(new TdApi.ChatTypePrivate(1)));
        assertNull(CachePolicy.chatKind(new TdApi.ChatTypeSecret(1, 1)));
    }
}
