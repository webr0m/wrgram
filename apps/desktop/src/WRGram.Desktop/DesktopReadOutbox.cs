using TL;

namespace WRGram.Desktop;

/// Projectión pura del único acuse que confirma la lectura de un saliente: diálogo y update, nunca la página.
internal static class DesktopReadOutbox
{
    internal static int AfterHistoryPage(int confirmedReadOutboxMaxId, IReadOnlyList<MessageBase> history) =>
        confirmedReadOutboxMaxId;

    internal static int ApplyUpdate(int confirmedReadOutboxMaxId, int maxId) => Math.Max(confirmedReadOutboxMaxId, maxId);

    internal static string Status(int confirmedReadOutboxMaxId, int messageId, bool outgoing, bool scheduled) =>
        scheduled ? "" : outgoing ? confirmedReadOutboxMaxId >= messageId ? "read" : "sent" : "";
}
