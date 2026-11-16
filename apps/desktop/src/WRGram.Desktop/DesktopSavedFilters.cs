namespace WRGram.Desktop;

using System;
using System.Collections.Generic;

/// <summary>
/// Los filtros de búsqueda guardados: una lista pequeña que vive en este dispositivo, igual que en
/// Android, donde `NativeBridge.searchFilters` la escribe en `SharedPreferences("search_filters")` bajo
/// la clave de la sesión. No hay objeto de Telegram para esto —los `DialogFilter` de MTProto son carpetas,
/// otra cosa—, así que lo que sí puede compartirse es la ley: las cinco frases de rechazo, los seis topes
/// y el orden en que se consultan. Las pruebas `rondaT.test.ts` los comparan carácter a carácter con la
/// copia Java, y esa es la razón de que esta clase sea pura: sin sesión, sin disco y sin red se puede
/// leer la regla entera de una vez.
/// <para>
/// Dos condiciones se escriben aquí en español donde Android lanza `Invalid text` / `Invalid identifier`.
/// No es una diferencia de criterio, sino de pantalla: en Android esas dos cadenas técnicas también llegan
/// al usuario tal cual, y en escritorio se prefirió la frase comprensible. Lo que no cambia es cuándo se
/// dispara cada descarte.
/// </para>
/// </summary>
public static class DesktopSavedFilters
{
    /// El tope es nuestro, no de Telegram: veinte filtros por cuenta y sesión.
    public const int Max = 20;
    public const int NameLimit = 32;
    public const int QueryLimit = 100;
    public const int FilterLimit = 16;
    public const int ModeLimit = 8;
    public const int IdLimit = 24;
    public const int MinQuery = 2;

    public const string TooMany = "Puedes guardar hasta 20 filtros de búsqueda.";
    public const string NoName = "Escribe un nombre para el filtro.";
    public const string BadMode = "El modo del filtro no es válido.";
    public const string NeedsText = "La búsqueda necesita texto o un filtro.";
    public const string BadFilter = "Filtro de búsqueda no válido.";
    public const string BadText = "Alguno de los datos del filtro no es de texto o pasa de su límite.";
    public const string BadChat = "El identificador del chat no es un identificador de escritorio válido.";

    public const string Chat = "chat";
    public const string Global = "global";

    /// Las doce claves que `DesktopParity.SearchFilter` sabe traducir a un `MessagesFilter` de MTProto; la
    /// cadena vacía significa «cualquier mensaje». Que sean las mismas se comprueba en `rondaT.test.ts`.
    public static readonly string[] Keys =
    {
        "", "photos", "videos", "photoVideo", "documents", "audio", "voice", "videoNotes",
        "animations", "links", "polls", "mentions",
    };

    /// Los cinco campos crudos, como llegaron del puente: `null` es «no venía», que no es lo mismo que «vacío».
    public readonly struct Values
    {
        public Values(string? name = null, string? query = null, string? filter = null,
                      string? mode = null, string? chatId = null, string? id = null)
        {
            Name = name; Query = query; Filter = filter; Mode = mode; ChatId = chatId; Id = id;
        }

        public string? Name { get; }
        public string? Query { get; }
        public string? Filter { get; }
        public string? Mode { get; }
        public string? ChatId { get; }
        public string? Id { get; }
    }

    public sealed class Entry
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Query { get; set; } = "";
        public string Filter { get; set; } = "";
        public string Mode { get; set; } = Chat;
        public string ChatId { get; set; } = "";
    }

    /// Lo mismo que `BridgePolicy.text`: el campo tiene que venir y caber; `null` es «no vino», y eso
    /// Android lo rechaza igual que un texto largo.
    public static bool Fits(string? value, int maximum) => value != null && value.Length <= maximum;

    /// El identificador de chat de escritorio: `u`, `g` o `c` y detrás un número mayor que cero.
    /// Es la misma forma que ya sabe leer `TelegramService.FindEntry`.
    public static bool ChatToken(string value)
    {
        if (value.Length is < 2 or > 20) return false;
        if (value[0] is not ('u' or 'g' or 'c')) return false;
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

    /// Null cuando el puente puede guardar; si no, el motivo, en el orden exacto de Android.
    public static string? SaveProblem(Values values, int count)
    {
        if (count >= Max) return TooMany;
        if (!Fits(values.Name, NameLimit)) return BadText;
        if (values.Name!.Trim().Length == 0) return NoName;
        if (!Fits(values.Query, QueryLimit)) return BadText;
        if (!Fits(values.Filter, FilterLimit)) return BadText;
        if (Array.IndexOf(Keys, values.Filter!) < 0) return BadFilter;
        if (!Fits(values.Mode, ModeLimit)) return BadText;
        if (values.Mode != Chat && values.Mode != Global) return BadMode;
        if (values.Query!.Trim().Length < MinQuery && values.Filter!.Length == 0) return NeedsText;
        if (values.ChatId is { Length: > 0 } && !ChatToken(values.ChatId)) return BadChat;
        return null;
    }

    /// El descarte de `search.filters.delete`: solo se pide el identificador, y borrar lo que no está no es un error.
    public static string? DeleteProblem(Values values) => Fits(values.Id, IdLimit) ? null : BadText;

    /// La entrada ya validada, con el nombre y la consulta recortados como los guarda Android.
    public static Entry Create(Values values, IEnumerable<Entry> list)
    {
        var entry = new Entry
        {
            Id = NextId(list),
            Name = values.Name!.Trim(),
            Query = values.Query!.Trim(),
            Filter = values.Filter!,
            Mode = values.Mode!,
            ChatId = values.ChatId ?? ""
        };
        return entry;
    }

    /// `f1, f2, …`: el siguiente número sobre los identificadores con forma, ignorando lo que no la tenga.
    public static string NextId(IEnumerable<Entry> list)
    {
        int max = 0;
        foreach (var entry in list)
        {
            var id = entry.Id;
            if (!Shaped(id)) continue;
            if (int.TryParse(id.AsSpan(1), out var number) && number > max) max = number;
        }
        return "f" + (max + 1);
    }

    /// `f[0-9]{1,6}`, la expresión que Java usa para decidir qué identificadores cuentan al buscar el siguiente.
    private static bool Shaped(string id)
    {
        if (id.Length is < 2 or > 7 || id[0] != 'f') return false;
        for (var index = 1; index < id.Length; index++) if (id[index] < '0' || id[index] > '9') return false;
        return true;
    }
}
