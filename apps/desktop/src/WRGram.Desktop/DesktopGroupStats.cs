namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using TL;

/// <summary>
/// Las estadísticas de una comunidad convertidas al contrato que comparten Android y Windows (ronda CA). El otro lado
/// es <c>GroupChatStats.java</c>, que aplana <c>TdApi.ChatStatisticsChannel</c> (<c>GroupChatStats.java:50</c>) y
/// <c>TdApi.ChatStatisticsSupergroup</c> (<c>GroupChatStats.java:63</c>) desde el brazo <c>groups.stats</c>
/// (<c>NativeBridge.java:883</c>); aquí se aplanan <c>TL.Stats_BroadcastStats</c> y <c>TL.Stats_MegagroupStats</c>, y
/// las dos capas escupen el mismo JSON: <c>kind</c>, el periodo, las fichas <c>{id, value, previous}</c> y, solo en los
/// grupos, la tabla de los que más escriben. Las etiquetas en español no viven en ninguna de las dos: las pone la
/// pantalla desde el catálogo <c>STATS_LABELS</c> (<c>groupStats.ts:15-27</c>), indexado por el <c>id</c> que manda
/// cada capa, así que un número que aquí se llama <c>viewers</c> no puede llamarse de otra manera allá.
/// <para>
/// El emparejamiento es uno a uno, medido por reflexión sobre WTelegramClient 4.4.10. En el canal,
/// <c>followers</c>→<c>members</c>, <c>views_per_post</c>→<c>viewsPerPost</c>, <c>shares_per_post</c>→
/// <c>sharesPerPost</c>, <c>reactions_per_post</c>→<c>reactionsPerPost</c>, <c>views_per_story</c>→
/// <c>viewsPerStory</c>, <c>shares_per_story</c>→<c>sharesPerStory</c>, <c>reactions_per_story</c>→
/// <c>reactionsPerStory</c> y <c>enabled_notifications</c>→<c>notifications</c>; los seis primeros son
/// <c>StatsAbsValueAndPrev{current,previous}</c>, que es la pareja exacta de <c>TdApi.StatisticalValue</c>
/// <c>{value,previousValue}</c>. En el grupo, <c>members</c>, <c>messages</c>, <c>viewers</c> y <c>posters</c> son las
/// cuatro fichas —<c>posters</c> es el <c>senderCount</c> de TDLib, que la pantalla llama «escribieron en el grupo»—
/// y <c>top_posters</c> trae <c>user_id</c>, <c>messages</c> y <c>avg_chars</c> exactamente como
/// <c>ChatStatisticsMessageSenderInfo</c> trae <c>userId</c>, <c>sentMessageCount</c> y
/// <c>averageCharacterCount</c>. Las gráficas —<c>growth_graph</c>, <c>top_hours_graph</c>, los ocho
/// <c>StatsGraphBase</c> del canal— viajan en la misma respuesta y aquí, como en Android, no se dibujan todavía; la
/// pantalla lo dice en lugar de callarlo.
/// </para>
/// <para>
/// Dos reglas de honestidad, y son las mismas que las de <c>GroupChatStats.java</c>. Un valor que no sea un número
/// acabado se <b>omite</b> en vez de mandarse a cero: MTProto contesta los medios de las historias aunque el canal no
/// tenga, y un cero pintado como dato es una afirmación falsa. Y <c>previous</c> solo viaja si también es un número
/// acabado, porque con él calcula la pantalla el crecimiento. La única ficha que aquí nunca lo tiene es
/// <c>notifications</c>: <c>StatsPercentValue{part,total}</c> es un ratio sin pasado, igual que el
/// <c>enabledNotificationsPercentage</c> de TDLib es un <c>double</c> suelto —de ahí que se multiplique por cien y se
/// muestre solo, sin flecha, en las dos capas—.
/// </para>
/// </summary>
public static class DesktopGroupStats
{
    // ---- las frases ----

    /// <c>GroupChatStats.NOT_A_COMMUNITY</c>, carácter a carácter. Es la única negación que este flujo decide sin
    /// preguntarle a Telegram, y dice «supergrupos y canales» porque en MTProto los dos son un canal con formas
    /// distintas —un grupo básico no tiene estadísticas que pedir, y no hay método al que mandarlo—.
    public const string NotCommunity = "Las estadísticas solo existen en supergrupos y canales.";

    /// <c>GroupChatStats.NO_RIGHT</c>. Allá es un 403 que <c>explain()</c> traduce; aquí es
    /// <c>CHAT_ADMIN_REQUIRED</c>, que el esquema de la capa 232 apunta en las <c>throws</c> de los dos métodos.
    public const string NoRight = "Telegram no concede a esta cuenta el permiso para ver las estadísticas de la comunidad.";

    /// <c>GroupChatStats.CHANGED</c>: las pasadas del <c>perform</c> de <c>:475</c> envueltas a cada respuesta.
    public const string ChangedAccount = "La cuenta cambió. Vuelve a abrir la conversación.";

    /// <c>GroupChatStats.BROKEN</c>, el paracaídas de Android para una respuesta que no es ni canal ni grupo. Aquí no
    /// hay armar JSON que pueda romperse —las fichas se construyen contra tipos ya validados—, así que esta frase
    /// queda para lo que sí es simétrico: una respuesta de Telegram que llega sin cuerpo.
    public const string Broken = "No se pudieron preparar las estadísticas.";

    /// <c>CHANNEL_PRIVATE</c>, en las <c>throws</c> de los dos métodos: la cuenta salió de la comunidad entre la lista
    /// y la pregunta. Es la misma situación que <c>DesktopGroupPermissions</c> ya dice con estas palabras.
    public const string Outside = "Esta cuenta ya no está dentro de la comunidad.";

    /// <c>CHANNEL_INVALID</c>, y el mismo texto que el host usa cuando la fila pedida no está en la caché
    /// (<c>TelegramService.cs:3874</c>).
    public const string Stale = "La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.";

    /// <c>BROADCAST_REQUIRED</c> / <c>MEGAGROUP_REQUIRED</c>: Telegram contradice la forma que la caché tenía. No es
    /// un gusto de la persona —la pantalla no elige método—, es la fila vieja, y así se dice.
    public const string WrongShape = "Telegram no reconoce esta comunidad como el tipo del que pidió estadísticas. Actualiza la lista e inténtalo de nuevo.";

    // ---- el contrato ----

    /// La forma se pregunta igual que en los permisos: en TDLib el canal <i>es</i> un supergrupo con <c>isChannel</c>,
    /// y en MTProto un grupo básico tampoco tiene <c>stats.getMegagroupStats</c>.
    public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Channel;

    /// La ficha de <c>:863</c>: <c>id</c>, <c>value</c> y <c>previous</c> solo si la biblioteca lo sabe. Devuelve
    /// <c>null</c> cuando Telegram no contestó el número, y el llamador la descarta —no se manda a cero—.
    public static Dictionary<string, object?>? Card(string id, StatsAbsValueAndPrev? value)
    {
        if (value == null || !double.IsFinite(value.current)) return null;
        var card = new Dictionary<string, object?> { ["id"] = id, ["value"] = value.current };
        if (double.IsFinite(value.previous)) card["previous"] = value.previous;
        return card;
    }

    /// El porcentaje de las notificaciones activadas: <c>part/total</c> hecho porcentaje, que es lo que TDLib ya da
    /// hecho. Con <c>total</c> cero no hay ratio que calcular, y una división inventada no se manda.
    public static Dictionary<string, object?>? PercentCard(string id, StatsPercentValue? ratio)
    {
        if (ratio == null || ratio.total <= 0 || !double.IsFinite(ratio.part) || !double.IsFinite(ratio.total)) return null;
        var value = ratio.part / ratio.total * 100;
        return double.IsFinite(value)
            ? new Dictionary<string, object?> { ["id"] = id, ["value"] = value }
            : null;
    }

    /// <c>putRange</c> de <c>:863</c> sobre <c>StatsDateRangeDays{min_date,max_date}</c>, que son fechas y no los
    /// <c>yyyymmdd</c> de TDLib. Sin fecha real no se escribe la clave: la pantalla omite el periodo, igual que allá.
    public static void Period(Dictionary<string, object?> dto, StatsDateRangeDays? period)
    {
        if (period == null || period.min_date == default || period.max_date == default) return;
        dto["from"] = period.min_date.ToString("yyyy-MM-dd");
        dto["to"] = period.max_date.ToString("yyyy-MM-dd");
    }

    /// El DTO de un canal: las ocho fichas en el orden de <c>GroupChatStats.dto</c>, y <c>top</c> vacío porque en un
    /// canal no hay quién escriba —solo quién lee—.
    public static Dictionary<string, object?> Dto(Stats_BroadcastStats stats)
    {
        var values = new List<Dictionary<string, object?>>();
        Add(values, Card("members", stats.followers));
        Add(values, Card("viewsPerPost", stats.views_per_post));
        Add(values, Card("sharesPerPost", stats.shares_per_post));
        Add(values, Card("reactionsPerPost", stats.reactions_per_post));
        Add(values, Card("viewsPerStory", stats.views_per_story));
        Add(values, Card("sharesPerStory", stats.shares_per_story));
        Add(values, Card("reactionsPerStory", stats.reactions_per_story));
        Add(values, PercentCard("notifications", stats.enabled_notifications));
        return Build("channel", stats.period, values, new List<Dictionary<string, object?>>());
    }

    /// El DTO de un supergrupo: las cuatro fichas y la tabla de los que más escriben. Los nombres salen de la regla de
    /// la casa —<c>DesktopGroupRoster.Name</c> desde la ronda BW, con su respaldo «Usuario de Telegram»— y no de una
    /// cuarta manera de llamar a la gente; la respuesta ya trae el mapa <c>users</c>, así que no hay segundo viaje.
    public static Dictionary<string, object?> Dto(Stats_MegagroupStats stats, Func<UserBase?, string> names)
    {
        var values = new List<Dictionary<string, object?>>();
        Add(values, Card("members", stats.members));
        Add(values, Card("messages", stats.messages));
        Add(values, Card("viewers", stats.viewers));
        Add(values, Card("senders", stats.posters));
        var top = new List<Dictionary<string, object?>>();
        foreach (var poster in stats.top_posters ?? Array.Empty<StatsGroupTopPoster>())
        {
            if (poster == null) continue;
            top.Add(new Dictionary<string, object?>
            {
                ["name"] = names(stats.users?.GetValueOrDefault(poster.user_id)),
                ["messages"] = poster.messages,
                ["avgChars"] = poster.avg_chars,
            });
        }
        return Build("group", stats.period, values, top);
    }

    private static Dictionary<string, object?> Build(string kind, StatsDateRangeDays? period,
        List<Dictionary<string, object?>> values, List<Dictionary<string, object?>> top)
    {
        var dto = new Dictionary<string, object?> { ["kind"] = kind };
        Period(dto, period);
        dto["values"] = values;
        dto["top"] = top;
        return dto;
    }

    private static void Add(List<Dictionary<string, object?>> values, Dictionary<string, object?>? card)
    {
        if (card != null) values.Add(card);
    }

    /// Los rechazos que estos dos métodos pueden devolver con nombre propio, medidos en las <c>throws</c> de
    /// <c>stats.getBroadcastStats</c> y <c>stats.getMegagroupStats</c> del esquema de la capa 232
    /// (<c>@mtcute/core/tl/raw-errors.json</c>). <c>AUTH_KEY_UNREGISTERED</c> viaja aparte porque el host ya lo
    /// traduce en <c>Describe</c> (<c>TelegramService.cs:3981</c>) para todas las peticiones, y lo que no está medido
    /// se queda con el código de Telegram: ponerle una causa inventada engaña más que enseñarlo.
    public static string? Refusal(string? error) => error switch
    {
        _ when Starts(error, "CHAT_ADMIN_REQUIRED") => NoRight,
        _ when Starts(error, "CHANNEL_PRIVATE") => Outside,
        _ when Starts(error, "CHANNEL_INVALID") => Stale,
        _ when Starts(error, "BROADCAST_REQUIRED") || Starts(error, "MEGAGROUP_REQUIRED") => WrongShape,
        _ => null
    };

    private static bool Starts(string? error, string code) =>
        !string.IsNullOrEmpty(error) && error.StartsWith(code, StringComparison.Ordinal);
}
