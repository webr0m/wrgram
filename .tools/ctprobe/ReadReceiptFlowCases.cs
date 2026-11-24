using System.Text.Json;
using TL;

namespace WRGram.Desktop;

internal static class ReadReceiptFlowCases
{
    private static readonly JsonElement Id9 = JsonSerializer.SerializeToElement(new { id = 9 });
    private static readonly ProbeMessage Outgoing9 = new() { Id = "9", Outgoing = true };
    private static readonly ProbeMessage Incoming9 = new() { Id = "9", Outgoing = false };

    private static TelegramService Private(OfflineReadReceiptRpc rpc, params ProbeMessage[] messages) =>
        new(rpc, new PeerUser { user_id = 7 }, new InputPeerUser(7, 99), messages);

    private static TelegramService Group(OfflineReadReceiptRpc rpc, params ProbeMessage[] messages) =>
        new(rpc, new PeerChat { chat_id = 77 }, new InputPeerChat(77), messages);

    private static async Task<(string Outcome, Exception? Error)> Capture(Func<Task<object>> run)
    {
        try
        {
            return ("ok:" + JsonSerializer.Serialize(await run()), null);
        }
        catch (Exception ex)
        {
            return ((ex is BridgeException ? "bridge:" : "rpc:") + ex.Message, ex);
        }
    }

    internal static async Task RunAsync()
    {
        foreach (var (name, run) in new (string Name, Func<OfflineReadReceiptRpc, TelegramService, JsonElement, Task<object>> Run)[]
        {
            ("fecha", (rpc, service, args) => service.ReadDateForProbe(args)),
            ("lectores", (rpc, service, args) => service.MessageViewersForProbe(args))
        })
        {
            var invalidRpc = new OfflineReadReceiptRpc();
            var invalid = await Capture(() => run(invalidRpc, Private(invalidRpc, Outgoing9), JsonSerializer.SerializeToElement(new { id = 0L })));
            Program.Caso($"{name}: id inválido se rechaza antes del RPC", invalid.Outcome, "bridge:" + DesktopReadReceipts.InvalidMessageId);
            Program.Caso($"{name}: id inválido no hace red", string.Join(',', invalidRpc.Calls), "");

            var missingRpc = new OfflineReadReceiptRpc();
            var missing = await Capture(() => run(missingRpc, Private(missingRpc), Id9));
            Program.Caso($"{name}: mensaje ausente se rechaza", missing.Outcome, "bridge:" + DesktopReadReceipts.NotOutgoing);
            Program.Caso($"{name}: mensaje ausente no hace RPC", string.Join(',', missingRpc.Calls), "");

            var incomingRpc = new OfflineReadReceiptRpc();
            var incoming = await Capture(() => run(incomingRpc, Private(incomingRpc, Incoming9), Id9));
            Program.Caso($"{name}: mensaje entrante se rechaza", incoming.Outcome, "bridge:" + DesktopReadReceipts.NotOutgoing);
            Program.Caso($"{name}: mensaje entrante no hace RPC", string.Join(',', incomingRpc.Calls), "");
        }

        var dateRpc = new OfflineReadReceiptRpc();
        var dateService = Private(dateRpc, Outgoing9);
        var date = await Capture(() => dateService.ReadDateForProbe(Id9));
        Program.Caso("fecha privada: usa peer, id y fecha reales", date.Outcome, "ok:{\"state\":\"read\",\"date\":1700000000}");
        Program.Caso("fecha privada: RPC dirigido al privado", string.Join(',', dateRpc.Calls), "outboxDate(peer=u7:99,msg=9)");

        var wrongPeerRpc = new OfflineReadReceiptRpc();
        var wrongPeer = await Capture(() => Group(wrongPeerRpc, Outgoing9).ReadDateForProbe(Id9));
        Program.Caso("fecha privada: un grupo no es peer privado", wrongPeer.Outcome, "bridge:" + DesktopReadReceipts.NotPrivate);
        Program.Caso("fecha privada: el rechazo no hace RPC", string.Join(',', wrongPeerRpc.Calls), "");

        var channelRpc = new OfflineReadReceiptRpc();
        var channelService = new TelegramService(channelRpc, new PeerChannel { channel_id = 88 },
            new InputPeerChannel(88, 123), Outgoing9);
        var channel = await Capture(() => channelService.MessageViewersForProbe(Id9));
        Program.Caso("lectores: supergrupo/canal se rechaza", channel.Outcome, "bridge:" + DesktopReadReceipts.NotBasicGroup);
        Program.Caso("lectores: el rechazo no hace RPC", string.Join(',', channelRpc.Calls), "");

        var privateViewersRpc = new OfflineReadReceiptRpc();
        var privateViewers = await Capture(() => Private(privateViewersRpc, Outgoing9).MessageViewersForProbe(Id9));
        Program.Caso("lectores: un privado no es grupo", privateViewers.Outcome, "bridge:" + DesktopReadReceipts.NotGroup);
        Program.Caso("lectores: el privado no hace RPC", string.Join(',', privateViewersRpc.Calls), "");

        var groupRpc = new OfflineReadReceiptRpc();
        var groupService = Group(groupRpc, Outgoing9);
        groupRpc.CachedUserCount = () => groupService.CachedUserCount;
        var group = await Capture(() => groupService.MessageViewersForProbe(Id9));
        Program.Caso("grupo básico: fusiona peers y proyecta lectores", group.Outcome,
            "ok:{\"viewers\":[{\"id\":\"42\",\"name\":\"Ada\",\"date\":1700000000},{\"id\":\"7\",\"name\":\"Usuario de Telegram\",\"date\":1700000100}]}");
        Program.Caso("grupo básico: orden GetFullChat→MergePeers→viewers", string.Join(',', groupRpc.Calls),
            "GetFullChat(77),viewers(cache=1,peer=g77,msg=9)");

        var notReadRpc = new OfflineReadReceiptRpc();
        notReadRpc.OnViewers = _ => throw new RpcException(400, "MESSAGE_NOT_READ_YET: 42");
        var notRead = await Capture(() => Group(notReadRpc, Outgoing9).MessageViewersForProbe(Id9));
        Program.Caso("grupo básico: MESSAGE_NOT_READ_YET viaja como lista vacía", notRead.Outcome, "ok:{\"viewers\":[]}");

        var unknownDateRpc = new OfflineReadReceiptRpc();
        var unknownDateError = new RpcException(420, "FLOOD_WAIT_5");
        unknownDateRpc.OnDate = (_, _) => throw unknownDateError;
        var unknownDateService = Private(unknownDateRpc, Outgoing9);
        var unknownDate = await Capture(() => unknownDateService.ReadDateForProbe(Id9));
        Program.Caso("fecha privada: error desconocido conserva tipo y mensaje", unknownDate.Outcome, "rpc:FLOOD_WAIT_5");
        Program.Caso("fecha privada: error desconocido es la misma excepción", ReferenceEquals(unknownDate.Error, unknownDateError).ToString(), "True");

        var unknownViewersRpc = new OfflineReadReceiptRpc();
        var unknownViewersError = new RpcException(500, "UNKNOWN_VIEWERS");
        unknownViewersRpc.OnViewers = _ => throw unknownViewersError;
        var unknownViewersService = Group(unknownViewersRpc, Outgoing9);
        var unknownViewers = await Capture(() => unknownViewersService.MessageViewersForProbe(Id9));
        Program.Caso("lectores: error desconocido conserva tipo y mensaje", unknownViewers.Outcome, "rpc:UNKNOWN_VIEWERS");
        Program.Caso("lectores: error desconocido es la misma excepción", ReferenceEquals(unknownViewers.Error, unknownViewersError).ToString(), "True");
    }
}
