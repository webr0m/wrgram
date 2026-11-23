package cc.webrom.wrgram;

import java.util.function.Consumer;
import org.drinkless.tdlib.TdApi;
import org.json.JSONArray;
import org.json.JSONObject;

/** Comandos que Telegram publica para el chat, incluidos sus ámbitos de grupo. */
final class NativeBotCommands {
    static void load(TdSession session, TdApi.Chat chat, Consumer<JSONObject> done, Consumer<String> fail) {
        if (chat.type instanceof TdApi.ChatTypePrivate) {
            long id = ((TdApi.ChatTypePrivate) chat.type).userId;
            session.perform(new TdApi.GetUser(id), user -> {
                if (!(user.type instanceof TdApi.UserTypeBot)) { reply(chat.id, new JSONArray(), null, done, fail); return; }
                session.perform(new TdApi.GetUserFullInfo(id), full -> {
                    JSONArray commands = new JSONArray();
                    append(commands, user, full.botInfo == null ? null : full.botInfo.commands);
                    JSONObject menu = null;
                    try {
                        TdApi.BotMenuButton button = full.botInfo == null ? null : full.botInfo.menuButton;
                        if (button != null && button.url != null && !button.url.isBlank())
                            menu = new JSONObject().put("text", button.text).put("kind", "webapp");
                        else if (((TdApi.UserTypeBot) user.type).hasMainWebApp)
                            menu = new JSONObject().put("text", "Abrir Mini App").put("kind", "main");
                    } catch (Exception error) { fail.accept("No se pudo preparar el menú del bot."); return; }
                    reply(chat.id, commands, menu, done, fail);
                }, fail);
            }, fail);
        } else if (chat.type instanceof TdApi.ChatTypeBasicGroup) {
            session.perform(new TdApi.GetBasicGroupFullInfo(((TdApi.ChatTypeBasicGroup) chat.type).basicGroupId),
                full -> group(session, chat.id, full.botCommands, 0, new JSONArray(), done, fail), fail);
        } else if (chat.type instanceof TdApi.ChatTypeSupergroup && !((TdApi.ChatTypeSupergroup) chat.type).isChannel) {
            session.perform(new TdApi.GetSupergroupFullInfo(((TdApi.ChatTypeSupergroup) chat.type).supergroupId),
                full -> group(session, chat.id, full.botCommands, 0, new JSONArray(), done, fail), fail);
        } else reply(chat.id, new JSONArray(), null, done, fail);
    }

    private static void group(TdSession session, long chatId, TdApi.BotCommands[] bots, int index,
                              JSONArray commands, Consumer<JSONObject> done, Consumer<String> fail) {
        if (session.activeChat != chatId) { fail.accept("La conversación cambió."); return; }
        if (bots == null || index >= bots.length) { reply(chatId, commands, null, done, fail); return; }
        TdApi.BotCommands bot = bots[index];
        if (bot == null) { group(session, chatId, bots, index + 1, commands, done, fail); return; }
        TdApi.User cached = session.user(bot.botUserId);
        if (cached != null) {
            if (cached.type instanceof TdApi.UserTypeBot) append(commands, cached, bot.commands);
            group(session, chatId, bots, index + 1, commands, done, fail); return;
        }
        session.perform(new TdApi.GetUser(bot.botUserId), user -> {
            if (user.type instanceof TdApi.UserTypeBot) append(commands, user, bot.commands);
            group(session, chatId, bots, index + 1, commands, done, fail);
        }, fail);
    }

    private static void append(JSONArray rows, TdApi.User bot, TdApi.BotCommand[] commands) {
        if (commands == null) return;
        String username = bot.usernames != null && bot.usernames.activeUsernames != null && bot.usernames.activeUsernames.length > 0
            ? bot.usernames.activeUsernames[0] : "";
        for (TdApi.BotCommand command : commands) {
            if (command == null || command.command == null || !command.command.matches("[A-Za-z0-9_]{1,32}")) continue;
            try {
                rows.put(new JSONObject().put("name", command.command).put("description", command.description == null ? "" : command.description)
                    .put("botId", Long.toString(bot.id)).put("botName", PersonName.of(bot)).put("username", username));
            } catch (Exception error) { throw new IllegalArgumentException("No se pudo preparar el comando.", error); }
        }
    }

    private static void reply(long chatId, JSONArray commands, JSONObject menu, Consumer<JSONObject> done, Consumer<String> fail) {
        try { done.accept(new JSONObject().put("chatId", Long.toString(chatId)).put("commands", commands).put("menu", menu)); }
        catch (Exception error) { fail.accept("No se pudieron preparar los comandos."); }
    }
}
