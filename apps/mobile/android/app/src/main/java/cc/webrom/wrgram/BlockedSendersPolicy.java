package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

final class BlockedSendersPolicy {
    static final int PAGE_SIZE = 50;

    static int offset(JSONObject params) {
        Object value = params.opt("offset");
        if (value == null) return 0;
        if (!(value instanceof Integer) && !(value instanceof Long)) throw new IllegalArgumentException("Paginación no válida.");
        long offset = ((Number) value).longValue();
        if (offset < 0 || offset > Integer.MAX_VALUE - PAGE_SIZE) throw new IllegalArgumentException("Paginación no válida.");
        return (int) offset;
    }

    static TdApi.MessageSender sender(JSONObject params, long selfId) {
        long id = BridgePolicy.id(params, "id");
        String kind = params.optString("kind");
        if ("user".equals(kind) && id > 0 && id != selfId) return new TdApi.MessageSenderUser(id);
        if ("chat".equals(kind) && id != 0) return new TdApi.MessageSenderChat(id);
        throw new IllegalArgumentException("Remitente no válido.");
    }

    static String kind(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) return "user";
        if (sender instanceof TdApi.MessageSenderChat) return "chat";
        throw new IllegalArgumentException("Remitente no compatible.");
    }

    static long id(TdApi.MessageSender sender) {
        if (sender instanceof TdApi.MessageSenderUser) return ((TdApi.MessageSenderUser) sender).userId;
        if (sender instanceof TdApi.MessageSenderChat) return ((TdApi.MessageSenderChat) sender).chatId;
        throw new IllegalArgumentException("Remitente no compatible.");
    }
}
