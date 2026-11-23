using System.Text.Json;
using System.Text.RegularExpressions;
using TL;

namespace WRGram.Desktop;

public sealed partial class TelegramService
{
    private sealed record BotCommandRow(string Name, string Description, string BotId, string BotName, string Username);

    private async Task<object> BotCommandsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Id != _active) throw new BridgeException("La conversación cambió.");
        var commands = new List<BotCommandRow>();
        if (entry.Input is InputPeerUser person && entry.Bot)
        {
            var page = await client.Users_GetFullUser(new InputUser(person.user_id, person.access_hash));
            MergePeers(page.users?.Values, page.chats?.Values);
            AppendBotCommands(commands, page.full_user?.bot_info, person.user_id);
        }
        else if (entry.Type == "group")
        {
            var page = entry.Input switch
            {
                InputPeerChat basic => await client.Messages_GetFullChat(basic.chat_id),
                InputPeerChannel channel => await client.Channels_GetFullChannel(new InputChannel(channel.channel_id, channel.access_hash)),
                _ => null
            };
            if (page != null)
            {
                MergePeers(page.users?.Values, page.chats?.Values);
                var bots = page.full_chat switch
                {
                    ChatFull basic => basic.bot_info,
                    ChannelFull community => community.bot_info,
                    _ => null
                };
                if (bots != null) foreach (var bot in bots) AppendBotCommands(commands, bot, 0);
            }
        }
        return new { chatId = entry.Id, commands };
    }

    private void AppendBotCommands(List<BotCommandRow> rows, BotInfo? bot, long fallbackId)
    {
        if (bot?.commands == null) return;
        var id = bot.user_id != 0 ? bot.user_id : fallbackId;
        if (!_users.TryGetValue(id, out var user)) return;
        foreach (var command in bot.commands)
        {
            if (command == null || !Regex.IsMatch(command.command ?? "", "^[a-zA-Z0-9_]{1,32}$")) continue;
            rows.Add(new(command.command!, command.description ?? "", id.ToString(), FullName(user), user.MainUsername ?? ""));
        }
    }
}
