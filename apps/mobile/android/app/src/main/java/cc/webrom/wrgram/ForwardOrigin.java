package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/**
 * Provenance of a forwarded message, exactly as Telegram supplies it.
 * Names come from the local cache: projecting a bubble must never make a new request to Telegram.
 */
final class ForwardOrigin {
    interface Names {
        String user(long id);
        String chat(long id);
    }

    private ForwardOrigin() {}

    static JSONObject project(TdApi.MessageForwardInfo info, Names names) throws Exception {
        if (info == null || info.origin == null || names == null) return null;
        TdApi.MessageOrigin origin = info.origin;
        JSONObject data = new JSONObject();
        if (origin instanceof TdApi.MessageOriginUser) {
            long id = ((TdApi.MessageOriginUser) origin).senderUserId;
            if (id == 0) return null;
            data.put("kind", "user").put("name", text(names.user(id), "un usuario")).put("userId", Long.toString(id));
        } else if (origin instanceof TdApi.MessageOriginHiddenUser) {
            // Telegram already hid this author on purpose: only the name it chose to show is copied.
            String value = ((TdApi.MessageOriginHiddenUser) origin).senderName;
            data.put("kind", "hidden").put("name", text(value, "un usuario anónimo"));
        } else if (origin instanceof TdApi.MessageOriginChat) {
            TdApi.MessageOriginChat source = (TdApi.MessageOriginChat) origin;
            data.put("kind", "chat").put("name", text(source.senderChatId == 0 ? null : names.chat(source.senderChatId), "una conversación"));
            if (source.senderChatId != 0) data.put("chatId", Long.toString(source.senderChatId));
            signature(data, source.authorSignature);
        } else if (origin instanceof TdApi.MessageOriginChannel) {
            TdApi.MessageOriginChannel source = (TdApi.MessageOriginChannel) origin;
            data.put("kind", "channel").put("name", text(source.chatId == 0 ? null : names.chat(source.chatId), "un canal"));
            if (source.chatId != 0) data.put("chatId", Long.toString(source.chatId));
            // Only a channel post has an addressable original message; a chat or a user never does.
            if (source.chatId != 0 && source.messageId != 0) data.put("messageId", Long.toString(source.messageId));
            signature(data, source.authorSignature);
        } else return null;
        if (info.date > 0) data.put("date", info.date);
        return data;
    }

    private static void signature(JSONObject data, String value) throws Exception {
        if (value != null && !value.isBlank()) data.put("signature", limit(value.trim(), 80));
    }

    private static String text(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : limit(value.trim(), 120);
    }

    private static String limit(String value, int maximum) {
        return value.length() <= maximum ? value : value.substring(0, maximum);
    }
}
