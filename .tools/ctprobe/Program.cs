using System.Text.Json;
using TL;
using WRGram.Desktop;

namespace WRGram.Desktop;

public sealed partial class TelegramService
{
    internal static long Unix(DateTime date) =>
        date.Year < 1970 ? 0 : new DateTimeOffset(DateTime.SpecifyKind(date, DateTimeKind.Utc)).ToUnixTimeSeconds();
}

static class Program
{
    internal static int casos;
    internal static int fallos;

    internal static void Caso(string nombre, string obtenido, string esperado)
    {
        casos++;
        bool ok = obtenido == esperado;
        if (!ok) fallos++;
        Console.WriteLine((ok ? "VERDE  " : "ROJO   ") + nombre + " :: «" + obtenido + "»" + (ok ? "" : "  esperado «" + esperado + "»"));
    }

    internal static async Task CasoAsync(string nombre, Func<Task<string>> obtenido, string esperado)
    {
        casos++;
        string valor;
        try
        {
            valor = await obtenido();
        }
        catch (Exception ex)
        {
            valor = "EXCEPCIÓN " + ex.GetType().Name + ": " + ex.Message;
        }
        bool ok = valor == esperado;
        if (!ok) fallos++;
        Console.WriteLine((ok ? "VERDE  " : "ROJO   ") + nombre + " :: «" + valor + "»" + (ok ? "" : "  esperado «" + esperado + "»"));
    }

    static string Json(object? value) => JsonSerializer.Serialize(value);

    static async Task<int> Main()
    {
        foreach (var (value, esperado) in new (long Value, string Id)[]
        {
            (1, "1"),
            (int.MaxValue, "2147483647"),
            (0, "inválido"),
            (-1, "inválido"),
            ((long)int.MaxValue + 1, "inválido"),
            (long.MaxValue, "inválido"),
        })
        {
            Caso($"id {value} {(esperado == "inválido" ? "se rechaza" : "se conserva")}",
                DesktopReadReceipts.TryMessageId(value, out var id) ? id.ToString() : "inválido", esperado);
        }

        Caso("la fecha privada leída viaja como epoch",
            Json(DesktopReadReceipts.Date(new OutboxReadDate { date = new DateTime(2023, 11, 14, 22, 13, 20, DateTimeKind.Utc) })),
            "{\"state\":\"read\",\"date\":1700000000}");

        Caso("MESSAGE_NOT_READ_YET es unread", Json(DesktopReadReceipts.Error(new RpcException(400, "MESSAGE_NOT_READ_YET"))), "{\"state\":\"unread\"}");
        Caso("MESSAGE_TOO_OLD es tooOld", Json(DesktopReadReceipts.Error(new RpcException(400, "MESSAGE_TOO_OLD"))), "{\"state\":\"tooOld\"}");
        Caso("USER_PRIVACY_RESTRICTED es userRestricted", Json(DesktopReadReceipts.Error(new RpcException(400, "USER_PRIVACY_RESTRICTED"))), "{\"state\":\"userRestricted\"}");
        Caso("YOUR_PRIVACY_RESTRICTED es myRestricted", Json(DesktopReadReceipts.Error(new RpcException(400, "YOUR_PRIVACY_RESTRICTED"))), "{\"state\":\"myRestricted\"}");
        Caso("el detalle después de dos puntos no cambia el estado",
            Json(DesktopReadReceipts.Error(new RpcException(400, "MESSAGE_TOO_OLD: 172800"))), "{\"state\":\"tooOld\"}");

        Caso("un error desconocido sigue siendo error", Json(DesktopReadReceipts.Error(new RpcException(420, "FLOOD_WAIT_5"))), "null");
        Caso("un prefijo parecido no se convierte en estado",
            Json(DesktopReadReceipts.Error(new RpcException(400, "MESSAGE_NOT_READ_YET_EXTRA"))), "null");
        Caso("un mensaje vacío sigue siendo error", Json(DesktopReadReceipts.Error(new RpcException(500, ""))), "null");

        Caso("MESSAGE_NOT_READ_YET de lectores devuelve una lista vacía",
            Json(DesktopReadReceipts.ViewersError(new RpcException(400, "MESSAGE_NOT_READ_YET"))), "{\"viewers\":[]}");
        Caso("el detalle de MESSAGE_NOT_READ_YET no cambia la lista de lectores",
            Json(DesktopReadReceipts.ViewersError(new RpcException(400, "MESSAGE_NOT_READ_YET: 42"))), "{\"viewers\":[]}");
        Caso("un error de lectores parecido no se convierte en lista vacía",
            Json(DesktopReadReceipts.ViewersError(new RpcException(400, "MESSAGE_NOT_READ_YET_EXTRA"))), "null");
        Caso("un error de lectores desconocido sigue propagándose",
            Json(DesktopReadReceipts.ViewersError(new RpcException(420, "FLOOD_WAIT_5"))), "null");
        Caso("MESSAGE_TOO_OLD no se convierte en lista de lectores",
            Json(DesktopReadReceipts.ViewersError(new RpcException(400, "MESSAGE_TOO_OLD"))), "null");

        Caso("los lectores conservan id, nombre y epoch",
            Json(DesktopReadReceipts.Viewers([
                new ReadParticipantDate { user_id = 42, date = new DateTime(2023, 11, 14, 22, 13, 20, DateTimeKind.Utc) },
                new ReadParticipantDate { user_id = 7, date = new DateTime(2023, 11, 14, 22, 15, 0, DateTimeKind.Utc) },
            ], id => id == 42 ? "Ada" : "")),
            "{\"viewers\":[{\"id\":\"42\",\"name\":\"Ada\",\"date\":1700000000},{\"id\":\"7\",\"name\":\"Usuario de Telegram\",\"date\":1700000100}]}");
        Caso("una lista vacía no inventa lectores", Json(DesktopReadReceipts.Viewers([], _ => "x")), "{\"viewers\":[]}");
        Caso("una lista nula no inventa lectores", Json(DesktopReadReceipts.Viewers(null!, _ => "x")), "{\"viewers\":[]}");

        await ReadOutboxCases.RunAsync();
        await ReadReceiptFlowCases.RunAsync();

        Console.WriteLine($"casos = {casos}, fallos = {fallos}");
        return fallos == 0 ? 0 : 1;
    }
}
