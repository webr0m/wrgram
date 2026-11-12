package cc.webrom.wrgram;

import java.util.Arrays;
import org.drinkless.tdlib.TdApi;

/** Only cloud media that can be downloaded again is eligible for cache cleanup. */
final class CachePolicy {
    static final int DAY = 86400;
    static final int DEFAULT_DAYS = 30;
    static final int DEFAULT_GIB = 5;
    static final long GIB = 1024L * 1024L * 1024L;
    static final long NO_SIZE_LIMIT = (1L << 52) - 1;
    static final int NO_AGE_LIMIT = Integer.MAX_VALUE;

    private CachePolicy() {}

    static int days(int value) {
        return value == 0 || value == 3 || value == 7 || value == 30 || value == 90 ? value : DEFAULT_DAYS;
    }

    static int gib(int value) {
        return value == 0 || value == 1 || value == 2 || value == 5 || value == 10 || value == 20 ? value : DEFAULT_GIB;
    }

    static String chatKind(TdApi.ChatType type) {
        if (type instanceof TdApi.ChatTypePrivate) return "private";
        if (type instanceof TdApi.ChatTypeBasicGroup) return "group";
        if (type instanceof TdApi.ChatTypeSupergroup) {
            return ((TdApi.ChatTypeSupergroup) type).isChannel ? "channel" : "group";
        }
        return null;
    }

    static String category(TdApi.FileType type) {
        if (type instanceof TdApi.FileTypePhoto) return "photos";
        if (type instanceof TdApi.FileTypeVideo || type instanceof TdApi.FileTypeAnimation
                || type instanceof TdApi.FileTypeVideoNote || type instanceof TdApi.FileTypeLivePhotoVideo) return "videos";
        if (type instanceof TdApi.FileTypeAudio || type instanceof TdApi.FileTypeVoiceNote) return "audio";
        if (type instanceof TdApi.FileTypeDocument) return "files";
        return null;
    }

    static TdApi.OptimizeStorage optimize(long bytes, int ttl, int immunity, String category, long[] chats, long[] excluded) {
        TdApi.FileType[] eligible = {
            new TdApi.FileTypePhoto(), new TdApi.FileTypeVideo(), new TdApi.FileTypeAnimation(),
            new TdApi.FileTypeVideoNote(), new TdApi.FileTypeLivePhotoVideo(),
            new TdApi.FileTypeAudio(), new TdApi.FileTypeVoiceNote(), new TdApi.FileTypeDocument()
        };
        if (!"all".equals(category)) {
            eligible = Arrays.stream(eligible).filter(type -> category.equals(category(type))).toArray(TdApi.FileType[]::new);
        }
        // An empty fileTypes or chatIds filter is interpreted as "all" by TDLib.
        if (eligible.length == 0) throw new IllegalArgumentException("Tipo de archivo no válido.");
        return new TdApi.OptimizeStorage(bytes, ttl, Integer.MAX_VALUE, immunity, eligible, chats, excluded, true, 0);
    }
}
