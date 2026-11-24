using TL;

namespace WRGram.Desktop;

/// MTProto expresa la privacidad y la antigüedad de la fecha privada como errores RPC nombrados.
internal static class DesktopReadReceipts
{
    internal const string NotOutgoing = "Solo puedes consultar la lectura de tus propios mensajes.";
    internal const string NotPrivate = "La hora de lectura solo se consulta en chats privados.";
    internal const string NotGroup = "Los lectores solo se consultan en grupos.";
    internal const string NotBasicGroup = "Windows solo puede consultar los lectores de grupos básicos; los supergrupos no tienen esta petición en su librería.";
    internal const string InvalidMessageId = "El identificador del mensaje no es válido: debe estar entre 1 y 2147483647.";
    internal const string UnknownUser = "Usuario de Telegram";

    internal static bool TryMessageId(long value, out int id)
    {
        if (value < 1 || value > int.MaxValue)
        {
            id = 0;
            return false;
        }
        id = (int)value;
        return true;
    }

    internal static object Date(OutboxReadDate value) => new { state = "read", date = TelegramService.Unix(value.date) };

    internal static object? Error(RpcException error)
    {
        return ErrorCode(error) switch
        {
            "MESSAGE_NOT_READ_YET" => new { state = "unread" },
            "MESSAGE_TOO_OLD" => new { state = "tooOld" },
            "USER_PRIVACY_RESTRICTED" => new { state = "userRestricted" },
            "YOUR_PRIVACY_RESTRICTED" => new { state = "myRestricted" },
            _ => null,
        };
    }

    internal static object? ViewersError(RpcException error) =>
        ErrorCode(error) == "MESSAGE_NOT_READ_YET" ? new { viewers = Array.Empty<object>() } : null;

    private static string ErrorCode(RpcException error) => (error.Message ?? "").Split(':', 2)[0].Trim();

    internal static object Viewers(ReadParticipantDate[]? parts, Func<long, string> names)
    {
        var rows = (parts ?? Array.Empty<ReadParticipantDate>())
            .Select(part => new
            {
                id = part.user_id.ToString(),
                name = string.IsNullOrWhiteSpace(names(part.user_id)) ? UnknownUser : names(part.user_id),
                date = TelegramService.Unix(part.date),
            })
            .ToArray();
        return new { viewers = rows };
    }
}