namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;
using TL;

/// <summary>
/// Las reglas de la familia del emoji en Windows (ronda BY): estado emoji, packs de emojis personalizados y packs
/// de stickers. Aquí vive lo que se puede decidir sin red —qué frase corta cada intento, con qué forma y con qué
/// tope—; el orden de las peticiones y sus cachés están en `DesktopEmojiCatalogFlow.cs`, y el cable del despacho en
/// `TelegramService.cs`.
/// <para>
/// El orden de las comprobaciones es el de Android, copiado de `NativeBridge.java:307` (`emojiStatusState`),
/// `:318-346` (`emojiStatusOptions` y sus dos pasos), `:347-362` (`emojiStatusSet`), `:4340` (`customEmoji`),
/// `:4341` (`customEmojiSearch`), `:4900-4921` (`stickerInfo` y `emojiPackList`), `:4922-4952` (`emojiPacks`),
/// `:4953-4971` (`emojiPack`) y `:4972-4975` (las cuatro de stickers). Las frases van carácter a carácter, incluidas
/// las tres que en Android lanza <c>BridgePolicy</c> en inglés y que las rondas anteriores ya tradujeron.
/// </para>
/// <para>
/// <b>Lo que la biblioteca no da.</b> La sonda compilada contra WTelegramClient 4.4.10 midió tres huecos que Android
/// no tiene. El primero: <c>Account_GetThemedEmojiStatuses</c> <b>NO EXISTE</b>, así que la bandeja de estados sale de
/// dos listas fijas en vez de las tres de TDLib (<c>:323-325</c>). El segundo: MTProto abre y guarda un pack por
/// número con <c>InputStickerSetID</c>, que pide la firma de acceso (<c>access_hash</c>) que solo viene en la
/// respuesta de una lista, mientras TDLib guarda el catálogo entero y le basta el número; de ahí
/// <see cref="NoAccessHash"/>, con nombre y con su motivo. El tercero: <c>messages.searchCustomEmoji</c> toma
/// <c>emoticon</c> —un emoji suelto— y <c>:4341</c> pregunta a TDLib por texto libre, así que en Windows el buscador
/// del selector de reacción solo encuentra lo que Telegram indexa por emoji.
/// </para>
/// <para>
/// Dos diferencias de forma, medidas y dichas: donde Android <b>omite</b> una clave cuando no hay dato
/// (<c>:4914</c> y <c>:4965</c>), aquí se escribe <c>null</c>, porque la pantalla solo mira si el valor es verdad —
/// <c>EmojiStatusSettings.tsx:180</c> cae en <c>✨</c> igual con las dos formas—; y donde Android vuelve a leer la
/// cuenta en la red para saber si es Premium (<c>:309</c> y <c>:358</c>, un <c>GetUser</c>), aquí se lee la bandera
/// <c>User.Flags.premium</c> de la sesión ya conectada, que es el mismo dato sin ida y vuelta.
/// </para>
/// </summary>
public static class DesktopEmojiCatalog
{
    // ----- Las frases, con la línea de Android que las escribió por primera vez -----

    /// La puerta de la sesión, dicha como la dice <c>DesktopMessageReactFlow.cs:60</c>.
    public const string NoAccount = "La cuenta no está conectada.";

    /// `NativeBridge.java:315`.
    public const string StatusUnread = "No se pudo leer el estado emoji.";

    /// `NativeBridge.java:335` y `:336`, las dos salidas del mismo intento.
    public const string StatusesUnprepared = "No se pudieron preparar los estados emoji.";

    /// `NativeBridge.java:350`: el parámetro `id` no tiene la forma `0|[1-9][0-9]{0,18}`.
    public const string BadStatusId = "Estado emoji no válido.";

    /// `NativeBridge.java:354`.
    public const string BadExpiry = "La caducidad debe estar entre un minuto y 367 días.";

    /// `NativeBridge.java:359`: la comprobación va después de las dos de arriba, también para `id` cero.
    public const string StatusNeedsPremium = "Necesitas Telegram Premium para cambiar el estado emoji.";

    /// `NativeBridge.java:4340`: el parámetro `id` de `customEmoji`, con la misma frase que
    /// `NativeBridge.java:4339` usa para el parámetro `emoji` de una reacción.
    public const string BadCustomEmoji = "Emoji personalizado no válido.";

    /// `NativeBridge.java:4340`: Telegram devolvió la lista sin ese documento.
    public const string CustomEmojiMissing = "Ese emoji personalizado no está disponible.";

    /// `NativeBridge.java:4340`: no hay medio que pintar.
    public const string CustomEmojiUnloaded = "No se pudo cargar el emoji personalizado.";

    /// `NativeBridge.java:4341`.
    public const string CustomEmojiUnsearched = "No se pudieron cargar emojis personalizados.";

    /// `NativeBridge.java:4934`: la sección de búsqueda sin texto.
    public const string NeedPackName = "Escribe el nombre de un pack.";

    /// `NativeBridge.java:4941`.
    public const string BadPage = "Página no válida.";

    /// `NativeBridge.java:4950`, la rama `default` del `kind`.
    public const string BadSection = "Sección de emojis no válida.";

    /// `NativeBridge.java:4929`, `:4933` y `:4944`, una por sección.
    public const string SavedUnread = "No se pudieron leer los packs guardados.";
    public const string ResultsUnread = "No se pudieron leer los resultados.";
    public const string FeaturedUnread = "No se pudieron leer los packs destacados.";

    /// `NativeBridge.java:4957`: el pack existe pero no es de emojis personalizados.
    public const string NotEmojiPack = "Este pack no contiene emojis personalizados.";

    /// `NativeBridge.java:4969`.
    public const string PackUnopened = "No se pudo abrir el pack de emojis.";

    /// `NativeBridge.java:4972`.
    public const string PacksUnprepared = "No se pudieron preparar los packs de stickers.";

    /// `NativeBridge.java:4973`: la forma corta que acepta Telegram, con el ejemplo que trae la frase.
    public const string NeedShortName = "Escribe el nombre corto del pack (por ejemplo, Animals).";

    /// `NativeBridge.java:4973`: la búsqueda por nombre corto no devolvió ese pack.
    public const string PackUnprepared = "No se pudo preparar el pack.";

    /// `NativeBridge.java:4974`.
    public const string PackUnloaded = "No se pudo cargar el pack de stickers.";

    /// `NativeBridge.java:4975` lee `installed` con `JSONObject.getBoolean`, que en Android revienta cuando la
    /// pantalla no manda la clave. Aquí se niega con causa escrita: adivinar entre guardar y quitar escribes en la
    /// cuenta del usuario, y es lo único de la familia que no se puede corregir después.
    public const string NeedDecision = "Hay que decir si el pack se guarda o se quita.";

    /// Hueco propio de Windows, con nombre, y es el único de la familia que no se arregla cableando: `:347-362`
    /// entiende <c>id</c> cero como «quitar el estado» y lo hace con <c>SetEmojiStatus(null)</c>. En MTProto eso es
    /// <c>account.clearEmojiStatus</c> o el constructor <c>EmojiStatusEmpty</c>; los dos se buscaron en
    /// WTelegramClient 4.4.10 por reflexión sobre el ensamblado y no están. Poner el estado sí tiene petición
    /// (<c>account.updateEmojiStatus</c>), así que se deja la escritura conectada y se niega la quita con causa.
    public const string NoRemoval =
        "El escritorio puede poner un estado emoji, pero no puede quitarlo: la librería de Windows no trae la orden de borrar.";

    /// Hueco propio de Windows, con nombre: <c>InputStickerSetID</c> pide <c>access_hash</c> y esa firma solo llega
    /// en la respuesta de una lista de packs. La caché de la sesión la rellena cada lista leída y el brazo la vuelve
    /// a pedir una vez a <c>messages.getAllStickers</c> antes de negarse.
    public const string NoAccessHash =
        "Telegram todavía no dio en esta sesión la firma de acceso de ese pack, y sin ella el escritorio no puede abrirlo ni guardarlo.";

    /// El envolvimiento de la escritura, en la forma de <c>DesktopMessageReactFlow.cs:104</c>: la causa de la
    /// biblioteca va detrás, separada, porque aquí sí importa cuál.
    public const string WriteFailed = "No se confirmó el pack en el Telegram de tu cuenta. ";

    /// Como <c>DesktopPrivateChat.BadId</c> y <c>DesktopSessions.BadId</c>: el <c>Invalid identifier</c> de
    /// <c>BridgePolicy.id</c> (<c>BridgePolicy.java:57</c>) dicho en español.
    public const string BadId = "El identificador del pack no es un identificador válido.";

    // ----- Los topes, medidos en el puente de Android -----

    public const int StatusCap = 200;      // `:329` y `:333`
    public const int PackLimit = 24;       // `:4942`, la ventana de trending de Android
    public const long MaxOffset = 10000;   // `:4940` y `:4941`
    public const int StickersShown = 24;   // `:4974`
    public const int TitleCap = 128;       // `:4900`, `NativeSnapshot.limit(set.title,128)`
    public const int QueryCap = 64;        // `:4933`, el corte de `BridgePolicy.text`
    public const int ShortNameCap = 80;    // `:4973`
    public const int SearchCap = 48;       // `:4341`, el límite de la búsqueda de TDLib

    // ----- Guardas -----

    private static readonly Regex StatusPattern = new(@"\A(0|[1-9][0-9]{0,18})\z", RegexOptions.CultureInvariant);
    private static readonly Regex PositivePattern = new(@"\A[1-9][0-9]{0,18}\z", RegexOptions.CultureInvariant);
    private static readonly Regex ShortNamePattern = new(@"\A[A-Za-z0-9_]{1,64}\z", RegexOptions.CultureInvariant);

    /// La forma que acepta `BridgePolicy.id`: entero positivo de hasta diecinueve dígitos.
    public static bool PositiveId(string? raw, out long id)
    {
        id = 0;
        var value = (raw ?? "").Trim();
        if (!PositivePattern.IsMatch(value)) return false;
        return long.TryParse(value, out id) && id > 0;
    }

    /// `:350`, con la lección de la ronda AT de fondo: ancla con <c>\A</c> y <c>\z</c>, no con <c>$</c>, que en
    /// .NET deja pasar un salto de línea final. Aquí el cero sí vale: es «quitar el estado».
    public static bool StatusId(string? raw, out long id)
    {
        id = 0;
        var value = (raw ?? "").Trim();
        if (!StatusPattern.IsMatch(value)) return false;
        return long.TryParse(value, out id);
    }

    /// `:354`: la caducidad es cero —sin caducidad— o un instante absoluto entre un minuto y trescientos sesenta y
    /// siete días a partir de ahora. No se permite un pasado, y Android tampoco.
    public static bool ExpiryAllowed(long expiration, long now) =>
        expiration == 0 || expiration >= now + 60 && expiration <= now + 367L * 86400L;

    /// `:4933`, recorte de <c>BridgePolicy.text</c> a sesenta y cuatro caracteres antes del <c>trim</c>.
    public static string QueryOf(string? raw)
    {
        var value = raw ?? "";
        return (value.Length > QueryCap ? value[..QueryCap] : value).Trim();
    }

    /// `:4973` entero: corte a ochenta, <c>trim</c>, se quita todo hasta el último <c>/</c> y queda la forma corta.
    public static bool ShortNameOf(string? raw, out string name)
    {
        var value = raw ?? "";
        value = (value.Length > ShortNameCap ? value[..ShortNameCap] : value).Trim();
        var cut = value.LastIndexOf('/');
        if (cut >= 0) value = value[(cut + 1)..];
        name = value;
        return ShortNamePattern.IsMatch(value);
    }

    /// `:4925-4950`: primero la sección y solo después lo que cada sección mira; una sección desconocida se niega
    /// aunque el resto de los argumentos sea correcto.
    public static bool IsKnownSection(string? kind) => kind is "installed" or "search" or "featured";

    /// `:4941`: la página se acepta entre cero y diez mil, con la misma frase para los dos extremos. Lo que no existe
    /// es la paginación: <c>messages.getFeaturedStickers</c> no toma desplazamiento —medido, su única firma es
    /// <c>(Client client, Int64 hash)</c>—, así que <c>nextOffset</c> sale siempre cero y <c>App.tsx</c> no ofrece
    /// más abajo. Se deja el tope de <see cref="PackLimit"/> para que la ventana que se ve sea la de Android.
    public static bool PageAllowed(long offset) => offset >= 0 && offset <= MaxOffset;

    // ----- La marca y la bandera de Premium -----

    /// La marca tal como la publica <c>NativeSnapshot.java:51-60</c>: sin Premium no hay marca, y una caducada
    /// tampoco. `Expiration` son segundos absolutos; cero es «sin caducidad».
    public readonly record struct Mark(string CustomEmojiId, long Expiration);

    public static bool IsPremium(User user) => (user.flags & User.Flags.premium) != 0;

    /// <c>User.emoji_status</c> llega en dos formas: la ficha normal y la de regalo coleccionable
    /// (<c>EmojiStatusCollectible</c>), que es el equivalente de <c>EmojiStatusTypeUpgradedGift</c> con el que
    /// Android también pinta la marca. La MTProto de WTelegramClient 4.4.10 no trae <c>EmojiStatusEmpty</c>: la
    /// ausencia se lee como «sin marca», igual que en <c>NativeSnapshot.java:52</c>.
    public static Mark? MarkOf(User user, long now)
    {
        if (!IsPremium(user)) return null;
        foreach (var (id, expiration) in StatusIds([user.emoji_status], keepExpiration: true))
            return expiration != 0 && expiration <= now ? null : new Mark(id.ToString(), expiration);
        return null;
    }

    /// Los identificadores de una lista de estados, en el orden en que Telegram los devolvió, sin los ceros que
    /// <c>:329</c> descarta. `keepExpiration` es la diferencia entre los dos pasos de <c>:323-325</c>: las listas
    /// fijas van con cero porque TDLib solo devuelve identificadores, y la de recientes lleva la fecha real. La
    /// comparación de la fecha es con la fecha por defecto y no con la bandera <c>has_until</c>, porque
    /// <c>EmojiStatusCollectible</c> la declara sin tener campo de bandera propio en esta versión.
    public static List<(long Id, long Expiration)> StatusIds(IEnumerable<EmojiStatusBase?>? statuses, bool keepExpiration)
    {
        var list = new List<(long, long)>();
        foreach (var status in statuses ?? [])
        {
            var (document, until) = status switch
            {
                EmojiStatus one => (one.document_id, one.until),
                EmojiStatusCollectible gift => (gift.document_id, gift.until),
                _ => (0L, default),
            };
            if (document <= 0) continue;
            list.Add((document, keepExpiration && until != default ? Second(until) : 0));
        }
        return list;
    }

    /// El instante con el que <c>emojiStatus.set</c> escribe <c>EmojiStatus.until</c>: cero es «sin caducidad» y se
    /// deja la fecha por defecto, como hace <c>DesktopMemberSanctions.BanRights</c> con <c>until_date</c>.
    public static DateTime ExpiryOf(long expiration) =>
        expiration == 0 ? default : DateTimeOffset.FromUnixTimeSeconds(expiration).UtcDateTime;

    private static long Second(DateTime value) => TelegramService.Unix(value);

    // ----- Las filas de pack y de emoji -----

    /// Una fila de <c>stickerInfo</c> (`:4900` y `:4901`) más la portada que <c>emojiPackList</c> saca del primer
    /// <c>covers</c> cuando el pack no trajo miniatura (`:4910-4915`). <c>Cover</c> es el documento tal cual: la
    /// pantalla necesita un <c>Media</c>, y eso solo lo sabe fabricar el registro de medios.
    public readonly record struct Row(
        long Id,
        long AccessHash,
        string Title,
        string Name,
        int Size,
        bool Installed,
        bool Archived,
        bool Official,
        Document? Cover);

    /// Un emoji dentro de un pack: su documento, el caracter que lleva como alternativa y el número de la fila.
    public readonly record struct Item(long Id, string Emoji, Document? Media);

    /// La fila de <c>stickerInfo</c> que devuelve el puente (`:4900`), ya en la forma del contrato
    /// <c>StickerPack</c>. La portada y la lista de dentro las pone el cable, que es quien tiene el registro de
    /// medios y la respuesta completa del pack.
    public static StickerPackDto Dto(Row row) => new()
    {
        Id = row.Id.ToString(),
        Title = row.Title,
        Name = row.Name,
        Size = row.Size,
        Installed = row.Installed,
        Archived = row.Archived,
        Official = row.Official,
    };

    /// La portada con la que se pinta la fila: documento o <c>null</c>. En <c>emojiPackList</c> es el primer
    /// <c>covers</c> cuando la lista no trajo miniatura (`:4910`); en un pack abierto es su primer documento, porque
    /// <c>StickerSet.thumbs</c> son <c>PhotoSize</c> sueltos y el registro de medios del escritorio solo sirve
    /// documentos. Es la diferencia de forma que queda por no tener miniaturas de pack en MTProto, y está medida.
    public static Document? CoverOf(IEnumerable<DocumentBase>? documents) => documents?.OfType<Document>().FirstOrDefault();

    public static List<Row> Rows(IEnumerable<StickerSetCoveredBase>? sets)
    {
        var list = new List<Row>();
        foreach (var covered in sets ?? [])
        {
            // Los cuatro subtipos de <c>StickerSetCoveredBase</c> declaran su <c>set</c> propio y la base no lo
            // expone, así que la fila y la portada se leen juntas en el mismo <c>switch</c>.
            (StickerSet? set, DocumentBase? raw) = covered switch
            {
                StickerSetCovered one => (one.set, one.cover),
                StickerSetMultiCovered many => (many.set, many.covers?.FirstOrDefault()),
                StickerSetFullCovered full => (full.set, full.documents?.FirstOrDefault()),
                StickerSetNoCovered plain => (plain.set, null),
                _ => (null, null),
            };
            var row = RowOf(set, raw as Document);
            if (row != null) list.Add(row.Value);
        }
        return list;
    }

    /// Las listas sin portada —<c>messages.getAllStickers</c> y <c>messages.getEmojiStickers</c>— solo traen el
    /// <c>StickerSet</c>, y ahí no hay documento de portada que mostrar.
    public static List<Row> Rows(IEnumerable<StickerSet>? sets)
    {
        var list = new List<Row>();
        foreach (var row in sets?.Select(set => RowOf(set, null)).OfType<Row>() ?? []) list.Add(row);
        return list;
    }

    /// La fila de un pack tal cual, con su firma de acceso —que hace falta para volver a abrirlo o guardarlo— y sin
    /// portada si la lista no la trajo. Un número de pack cero no es un pack: se descarta, guarda que en Android no hace falta
    /// porque <c>emojiPackList</c> (`:4906`) itera los packs que TDLib ya leyó.
    public static Row? RowOf(StickerSet? set, Document? cover)
    {
        if (set == null || set.id <= 0) return null;
        return new Row(set.id, set.access_hash, Limited(set.title, TitleCap), set.short_name ?? "",
            set.count, Installed(set), Archived(set), Official(set), cover);
    }

    /// Los emojis de un pack abierto (`:4960-4966`): solo cuentan los documentos que traen el atributo de emoji
    /// personalizado, y su número es el propio número del documento.
    public static List<Item> EmojiItems(IEnumerable<DocumentBase>? documents)
    {
        var list = new List<Item>();
        foreach (var document in (documents ?? []).OfType<Document>())
        {
            var emoji = EmojiOf(document);
            if (emoji == null) continue;
            list.Add(new Item(document.id, emoji, document));
        }
        return list;
    }

    /// Hasta <see cref="StickersShown"/> stickers de un pack, en el orden en que Telegram los devolvió (`:4974`).
    public static List<Document> PackDocuments(IEnumerable<DocumentBase>? documents, int limit = StickersShown) =>
        (documents ?? []).OfType<Document>().Take(limit).ToList();

    public static string? EmojiOf(Document document) => document.attributes
        ?.OfType<DocumentAttributeCustomEmoji>().Select(item => item.alt).FirstOrDefault();

    public static bool Installed(StickerSet set) => (set.flags & StickerSet.Flags.has_installed_date) != 0;

    public static bool Archived(StickerSet set) => (set.flags & StickerSet.Flags.archived) != 0;

    public static bool Official(StickerSet set) => (set.flags & StickerSet.Flags.official) != 0;

    /// La marca de <c>StickerTypeCustomEmoji</c> que Android lee del tipo del pack (`:4957`); en MTProto es la
    /// bandera <c>emojis</c> de <c>StickerSet</c>.
    public static bool IsEmojiPack(StickerSet set) => (set.flags & StickerSet.Flags.emojis) != 0;

    /// Lo que separa <c>stickers.installed</c> (:4972, tipo <c>regular</c>) de <c>emojiPacks.list</c>
    /// (:4924, tipo <c>customEmoji</c>) cuando una sola petición de MTProto trae los dos montones mezclados:
    /// regulares son los que no son emojis ni máscaras.
    public static bool IsRegularPack(StickerSet set) => !IsEmojiPack(set) && (set.flags & StickerSet.Flags.masks) == 0;

    /// El <c>NativeSnapshot.limit(set.title,128)</c> de `:4900`.
    private static string Limited(string? value, int cap)
    {
        var text = value ?? "";
        return text.Length > cap ? text[..cap] : text;
    }
}
