using TL;

namespace WRGram.Desktop;

internal static class ReadOutboxCases
{
    internal static Task RunAsync()
    {
        var outgoing100 = new Message { id = 100, flags = Message.Flags.out_ };
        var incoming101 = new Message { id = 101 };
        var outgoing102 = new Message { id = 102, flags = Message.Flags.out_ };
        MessageBase[] incomingPage = [outgoing100, incoming101];
        MessageBase[] outgoingPage = [outgoing100, outgoing102];

        var afterIncoming = DesktopReadOutbox.AfterHistoryPage(99, incomingPage);
        Program.Caso("cargar un entrante 101 no confirma el saliente 100", afterIncoming.ToString(), "99");
        Program.Caso("el saliente 100 sigue enviado tras cargar el entrante 101",
            DesktopReadOutbox.Status(afterIncoming, 100, outgoing: true, scheduled: false), "sent");
        Program.Caso("un entrante nunca recibe estado de lectura",
            DesktopReadOutbox.Status(afterIncoming, 101, outgoing: false, scheduled: false), "");

        var afterOutgoing = DesktopReadOutbox.AfterHistoryPage(99, outgoingPage);
        Program.Caso("cargar un saliente 102 sin acuse no confirma ni 100 ni 102", afterOutgoing.ToString(), "99");
        Program.Caso("el saliente 100 sigue enviado aunque la página llegue a 102",
            DesktopReadOutbox.Status(afterOutgoing, 100, outgoing: true, scheduled: false), "sent");
        Program.Caso("el saliente 102 sigue enviado sin update ni diálogo",
            DesktopReadOutbox.Status(afterOutgoing, 102, outgoing: true, scheduled: false), "sent");

        Program.Caso("updateReadHistoryOutbox confirma hasta su máximo",
            DesktopReadOutbox.ApplyUpdate(100, 101).ToString(), "101");
        Program.Caso("un update viejo no retrocede la confirmación",
            DesktopReadOutbox.ApplyUpdate(101, 99).ToString(), "101");
        Program.Caso("el saliente cubierto por el update se marca leído",
            DesktopReadOutbox.Status(DesktopReadOutbox.ApplyUpdate(100, 101), 101, outgoing: true, scheduled: false), "read");
        Program.Caso("una página vacía no altera la confirmación del diálogo",
            DesktopReadOutbox.AfterHistoryPage(99, []).ToString(), "99");
        Program.Caso("un programado nunca se marca leído",
            DesktopReadOutbox.Status(101, 101, outgoing: true, scheduled: true), "");

        return Task.CompletedTask;
    }
}
