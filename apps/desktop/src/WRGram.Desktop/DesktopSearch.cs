namespace WRGram.Desktop;

/// <summary>
/// Las reglas de la búsqueda dentro de una conversación, escritas una sola vez. La copia de Android es
/// `MessageSearch.java`, y esta es su homóloga de escritorio: el escritorio no habla TDLib sino MTProto,
/// así que no puede reutilizar esa clase, pero tampoco puede decir frases distintas sobre lo mismo. De
/// ahí las dos condiciones que las pruebas vigilan: las seis oraciones de rechazo son idénticas carácter
/// a carácter, y el orden en que se consultan también.
/// <para>
/// Lo que aquí falta respecto a Android son dos reglas que no tienen camino posible: la de los chats
/// secretos, que en escritorio no existen porque el cifrado de extremo a extremo vive en el dispositivo,
/// y la de la búsqueda global con banda, porque la interfaz solo manda autor y fechas modo por chat.
/// </para>
/// <para>
/// La forma del identificador de autor sí cambia: TDLib usa números sueltos y MTProto usa los pares
/// `u123` / `c456` que el propio puente ya reparte en `MessageDto.AuthorId`. Un `123` a secas aquí sería
/// ambiguo entre un usuario y un canal, así que se rechaza con la misma frase que Android usa para un
/// identificador inválido.
/// </para>
/// </summary>
public static class DesktopSearch
{
    /// La página de siempre: Telegram devuelve como mucho 200, y aquí se piden 50 como en Android.
    public const int Limit = 50;

    /// Un año de margen: la banda se corta antes de preguntar, no después de leer mil mensajes.
    public const long MaxWindow = 31622400L;

    /// El token con el que la interfaz pide «las publicaciones del propio canal», no una persona.
    public const string Chat = "chat";

    /// El mismo techo que Android: por encima, el entero de la API de Telegram se desborda y la fecha deja de significar nada.
    public const long IntLimit = 2147483646L;

    public const string BadSender = "El autor del filtro no es un identificador de Telegram válido.";
    public const string ChatSenderOnly = "Solo los canales publican a su nombre; en un grupo o conversación privada elige a una persona.";
    public const string ReversedBand = "El rango de fechas termina antes de empezar.";
    public const string FutureBand = "El filtro apunta a una fecha futura.";
    public const string WideBand = "El rango de fechas es demasiado amplio; Telegram busca en periodos de hasta un año.";
    public const string BadDate = "La fecha del filtro no es válida.";
    public const string AuthorUnknown = "No tenemos guardada a esa persona en esta sesión. Abre de nuevo la conversación y repite la búsqueda.";

    /// Autor o fechas: lo que la búsqueda global no admite, igual que en Android.
    public static bool Band(string sender, long from, long until) =>
        sender.Trim().Length > 0 || from != 0 || until != 0;

    /// Un identificador de peer de escritorio: `u` o `c` y después entre 1 y 19 dígitos, mayor que cero.
    public static bool Token(string sender)
    {
        var value = sender.Trim();
        if (value.Length is < 2 or > 20) return false;
        if (value[0] is not ('u' or 'c')) return false;
        long parsed = 0;
        for (var index = 1; index < value.Length; index++)
        {
            var digit = value[index];
            if (digit < '0' || digit > '9') return false;
            parsed = parsed * 10 + (digit - '0');
            if (parsed <= 0) return false;
        }
        return true;
    }

    /// Null si Telegram admite esta combinación en este chat; si no, el motivo exacto, en el mismo orden que Android.
    public static string? Problem(string sender, long from, long until, long now, bool isChannel)
    {
        var who = sender.Trim();
        if (from < 0 || until < 0) return BadDate;
        if (from > IntLimit || until > IntLimit) return BadDate;
        if (until > 0 && from > 0 && until <= from) return ReversedBand;
        if (from > now) return FutureBand;
        if (from > 0 && until > 0 && until - from > MaxWindow) return WideBand;
        if (who.Length == 0) return null;
        if (who == Chat) return isChannel ? null : ChatSenderOnly;
        return Token(who) ? null : BadSender;
    }

    /// El principio de la banda, o `default` cuando la búsqueda no recorta por abajo.
    public static System.DateTime MinDate(long from) =>
        from == 0 ? default : System.DateTimeOffset.FromUnixTimeSeconds(from).UtcDateTime;

    /// El tope exclusivo de la banda. La interfaz manda la medianoche del día siguiente, que es lo que MTProto espera.
    public static System.DateTime MaxDate(long until) =>
        until == 0 ? default : System.DateTimeOffset.FromUnixTimeSeconds(until).UtcDateTime;

    /// Si un mensaje de esa fecha entra en la banda pedida: el servidor recorta, pero aquí se confirma.
    public static bool Keep(long date, long from, long until) =>
        (from == 0 || date >= from) && (until == 0 || date < until);

    /// Los criterios que produjeron un cursor tienen que ser los mismos cinco que lo siguen usando.
    public static bool Same(string query, string sender, string filter, long from, long until,
                            string otherQuery, string otherSender, string otherFilter, long otherFrom, long otherUntil) =>
        Text(query) == Text(otherQuery) && Text(sender) == Text(otherSender) && Text(filter) == Text(otherFilter)
        && from == otherFrom && until == otherUntil;

    private static string Text(string value) => (value ?? "").Trim();
}
