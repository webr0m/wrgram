package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

/**
 * Thread of comments of a channel post.
 * TDLib decides which chat holds the thread (the channel's linked discussion group), so the
 * target is taken from the server answer and never guessed by the client.
 */
final class MessageThread {
    private MessageThread() {}

    /**
     * Counter shown on the bubble, built only from what the cached message already says:
     * projecting history must never ask Telegram for anything.
     */
    static JSONObject badge(TdApi.Message message) throws Exception {
        if (message == null || message.interactionInfo == null) return null;
        // Telegram only delivers replyInfo in channels with a discussion supergroup and inside those groups.
        TdApi.MessageReplyInfo replies = message.interactionInfo.replyInfo;
        if (replies == null) return null;
        int count = Math.max(0, replies.replyCount);
        JSONObject data = new JSONObject().put("comments", count);
        if (count > 0) data.put("canOpen", true);
        return data;
    }

    /** Header of an opened thread: identifiers travel as text because a chat id passes 2^53. */
    static JSONObject summary(TdApi.MessageThreadInfo info) throws Exception {
        if (info == null || info.chatId == 0 || info.messageThreadId == 0) return null;
        TdApi.MessageReplyInfo replies = info.replyInfo;
        return new JSONObject()
                .put("chatId", Long.toString(info.chatId))
                .put("threadId", Long.toString(info.messageThreadId))
                .put("comments", replies == null ? 0 : Math.max(0, replies.replyCount))
                .put("unread", Math.max(0, info.unreadMessageCount));
    }

    /**
     * Identificador más antiguo de la página, que es el cursor hacia atrás: TDLib devuelve el hilo
     * del más nuevo al más antiguo y no avisa el final, así que el puente se detiene cuando una
     * página deja de retroceder.
     */
    static long cursor(TdApi.Message[] messages, long previous) {
        long oldest = 0;
        if (messages != null) for (TdApi.Message message : messages) if (message != null && (oldest == 0 || message.id < oldest)) oldest = message.id;
        // 0 corta la paginación: también cuando la página no retrocedió, señal de que el hilo se agotó.
        return oldest > 0 && (previous == 0 || oldest < previous) ? oldest : 0;
    }
}
