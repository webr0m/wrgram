namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la familia del emoji en Windows (ronda BY): las once claves que Android atiende en
/// <c>NativeBridge.java:307-362</c> (estado), <c>:4340-4341</c> (emoji personalizado) y <c>:4900-4975</c> (packs y
/// stickers). Frases, guardas, topes y la forma de cada fila están en <see cref="DesktopEmojiCatalog"/>; aquí solo
/// el orden de las peticiones y las dos cachés que la librería obliga a tener.
/// <para>
/// El orden de las guardas es el de Android en cada brazo: primero la sesión, después la forma del argumento, luego
/// la sección o la página, y al final la red. Las tres frases que <c>BridgePolicy</c> lanza en inglés se mantienen
/// traducidas como en las rondas anteriores.
/// </para>
/// <para>
/// <b>La firma de acceso.</b> MTProto abre y guarda un pack con <c>InputStickerSetID</c>, que lleva
/// <c>id</c> y <c>access_hash</c>; la segunda solo aparece en la respuesta de una lista, y TDLib no la necesita
/// porque guarda el catálogo entero. <c>_packKeys</c> la va apuntando cada vez que la pantalla lee una lista —los
/// tres montones de <c>emojiPacks.list</c>, las dos aperturas por número, la búsqueda por nombre y
/// <c>stickers.installed</c>— y, si el pack pedido no está, el brazo vuelve a pedir <c>messages.getAllStickers</c>
/// una sola vez por sesión. Ahí salen todos los packs guardados, sean del tipo que sean; uno que no esté en esa
/// lista y que nunca se leyó se niega con <see cref="DesktopEmojiCatalog.NoAccessHash"/>, con nombre y con su
/// motivo. Es el hueco real de la familia en Windows: la pantalla que lo pregunta es la que abre un pack por número
/// sin haberlo listado antes.
/// </para>
/// <para>
/// <b>Dos listas de estados en vez de tres.</b> <c>:323-325</c> encadena fijos → temas → recientes y cada error pasa
/// al siguiente paso. <c>account.getThemedEmojiStatuses</c> no está en WTelegramClient 4.4.10 —medido por reflexión
/// sobre el ensamblado—, así que la cadena es fijos → recientes con el mismo descarte de duplicados, el mismo tope
/// de doscientos y la misma tolerancia al error. Lo que falta son los estados de tema.
/// </para>
/// <para>
/// <b>La quita del estado, negada.</b> <c>:347-362</c> entiende <c>id</c> cero como «quitar el estado» y lo hace con
/// <c>setEmojiStatus(null)</c>. En MTProto eso es <c>account.clearEmojiStatus</c> o el constructor
/// <c>EmojiStatusEmpty</c>, y los dos faltan en la biblioteca; escribir <c>document_id</c> cero sería inventarse una
/// orden, así que ese argumento se niega con <see cref="DesktopEmojiCatalog.NoRemoval"/>. Poner el estado sí tiene
/// petición y está cableado. El <c>schedule()</c> de <c>:362</c>, que en Android vuelve a leer la cuenta, aquí es un
/// eco local: la bandera <c>emoji_status</c> de la sesión conectada se actualiza con lo que Telegram acaba de
/// aceptar y la marca sale en el estado, sin ida y vuelta.
/// </para>
/// <para>
/// <b>La animación, medida y no prometida.</b> Un emoji personalizado es un documento <c>video/webm</c>, y el
/// <c>MediaDto</c> del escritorio no lleva ni <c>animated</c> ni tamaño, así que en Windows se pinta como fotograma
/// quieto donde Android lo mueve. El camino del archivo existe —<c>media.load</c> lo descarga y lo sirve—, lo que no
/// existe es el aviso de que hay que reproducirlo. Queda dicho en la hoja de validación y en el mapa de flujos.
/// </para>
/// <para>
/// Dos diferencias de forma, medidas: donde Android <b>omite</b> una clave si no hay dato (<c>:4914</c> y
/// <c>:4965</c>), aquí se escribe <c>null</c>, que la pantalla trata igual porque solo mira si el valor es verdad
/// (<c>BatchPanels.tsx:198</c> y <c>EmojiStatusSettings.tsx:180</c>); y donde <c>:4942</c> pide una ventana de
/// veinticuatro con desplazamiento, <c>messages.getFeaturedStickers</c> no tiene parámetro de desplazamiento —medido,
/// su firma es <c>(Client client, Int64 hash)</c>—, así que la ventana se recorta a <c>PackLimit</c> y
/// <c>nextOffset</c> sale siempre cero: la pantalla no ofrece más abajo.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// Número de pack → firma de acceso, apuntada cada vez que una lista pasa por aquí.
    private readonly Dictionary<long, long> _packKeys = new();

    /// Si ya se agotó el reintento frío de <c>messages.getAllStickers</c> por sesión.
    private bool _packKeysRefreshed;

    /// La sesión conectada con su cuenta: la misma puerta de <c>DesktopMessageReactFlow.cs:60</c>, dicha una vez para
    /// que las once ramas de la familia no puedan separarse.
    private (Client Client, User Self) Connected()
    {
        if (_client is not Client client || client.User is not { } user)
            throw new BridgeException(DesktopEmojiCatalog.NoAccount);
        return (client, user);
    }

    /// La red de la familia, con la frase del paso que falla. Una negativa ya con nombre —la de la firma de
    /// acceso— no se reenvuelve: su causa es la respuesta, no el transporte.
    private static async Task<T> FamilyAsync<T>(Func<Task<T>> request, string failure)
    {
        try { return await request(); }
        catch (BridgeException) { throw; }
        catch (Exception ex) { throw new BridgeException(failure, ex); }
    }

    /// `emojiStatusState` (`NativeBridge.java:307-317`): la marca propia, con ceros cuando no hay estado, leída de la
    /// cuenta conectada en vez de volverla a pedir con `GetUser` (`:309`).
    private Task<object?> EmojiStatusStateAsync()
    {
        var (_, user) = Connected();
        try
        {
            var mark = DesktopEmojiCatalog.MarkOf(user, Unix(DateTime.UtcNow));
            return Task.FromResult<object?>(new
            {
                premium = DesktopEmojiCatalog.IsPremium(user),
                customEmojiId = mark?.CustomEmojiId ?? "0",
                expiration = mark?.Expiration ?? 0L,
            });
        }
        catch (Exception ex) { throw new BridgeException(DesktopEmojiCatalog.StatusUnread, ex); }
    }

    /// `emojiStatusOptions` (`:318-346`): las dos listas que hay, deduplicadas con tope de doscientos, y después una
    /// sola lectura de documentos para ponerles medio y emoji.
    private async Task<object?> EmojiStatusOptionsAsync()
    {
        var client = Connected().Client;
        var ids = new List<(long Id, long Expiration)>();
        var seen = new HashSet<long>();
        var steps = new (Func<Task<Account_EmojiStatuses?>> Fetch, bool KeepExpiration)[]
        {
            (() => client.Account_GetDefaultEmojiStatuses(hash: 0), false),
            (() => client.Account_GetRecentEmojiStatuses(hash: 0), true),
        };
        foreach (var (fetch, keepExpiration) in steps)
        {
            // `:323-325`: si una lista falla se pasa a la siguiente sin decir nada, porque la bandeja sale igual.
            try
            {
                var answer = await fetch();
                foreach (var pair in DesktopEmojiCatalog.StatusIds(answer?.statuses, keepExpiration))
                    if (seen.Add(pair.Id) && ids.Count < DesktopEmojiCatalog.StatusCap) ids.Add(pair);
            }
            catch { }
        }
        if (ids.Count == 0) return new List<object>();
        var resolved = new Dictionary<long, Document>();
        try
        {
            // `:335-336`: si la lectura de medios falla, la lista sale sin ellos; solo el montaje de las filas puede
            // negar la bandeja entera.
            var documents = await client.Messages_GetCustomEmojiDocuments([.. ids.Select(pair => pair.Id)]);
            foreach (var document in documents.OfType<Document>())
                if (DesktopEmojiCatalog.EmojiOf(document) != null) resolved[document.id] = document;
        }
        catch { }
        try
        {
            return ids.Select(pair =>
            {
                object? file = null;
                string? emoji = null;
                if (resolved.TryGetValue(pair.Id, out var document))
                {
                    file = _media.RegisterDocument(document);
                    emoji = DesktopEmojiCatalog.EmojiOf(document);
                }
                return (object)new { id = pair.Id.ToString(), expiration = pair.Expiration, media = file, emoji };
            }).ToList();
        }
        catch (Exception ex) { throw new BridgeException(DesktopEmojiCatalog.StatusesUnprepared, ex); }
    }

    /// `emojiStatusSet` (`:347-362`): forma, caducidad, Premium y después la escritura. Los tres avisos van en el
    /// mismo orden que en Android, incluido el de Premium cuando `id` es cero.
    private async Task<object?> EmojiStatusSetAsync(JsonElement args)
    {
        var (client, user) = Connected();
        var now = Unix(DateTime.UtcNow);
        if (!DesktopEmojiCatalog.StatusId(Str(args, "id"), out var id)) throw new BridgeException(DesktopEmojiCatalog.BadStatusId);
        var expiration = Long(args, "expiration");
        if (id != 0 && !DesktopEmojiCatalog.ExpiryAllowed(expiration, now)) throw new BridgeException(DesktopEmojiCatalog.BadExpiry);
        if (!DesktopEmojiCatalog.IsPremium(user)) throw new BridgeException(DesktopEmojiCatalog.StatusNeedsPremium);
        if (id == 0) throw new BridgeException(DesktopEmojiCatalog.NoRemoval);
        var status = new EmojiStatus { document_id = id, until = DesktopEmojiCatalog.ExpiryOf(expiration) };
        try
        {
            await client.Account_UpdateEmojiStatus(status);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException(DesktopEmojiCatalog.WriteFailed + message, ex);
        }
        // El eco de `schedule()` (`:360`), local: la cuenta de la sesión no se vuelve a leer por red.
        user.emoji_status = status;
        _state.EmojiStatus = EmojiStatusDto.Of(DesktopEmojiCatalog.MarkOf(user, now));
        Push();
        return true;
    }

    /// `customEmoji.get` (`:4340`): un número, su documento y el caracter que lleva como alternativa.
    private async Task<object?> CustomEmojiAsync(JsonElement args)
    {
        var client = Connected().Client;
        if (!DesktopEmojiCatalog.PositiveId(Str(args, "id"), out var id)) throw new BridgeException(DesktopEmojiCatalog.BadCustomEmoji);
        var answer = await FamilyAsync(() => client.Messages_GetCustomEmojiDocuments([id]), DesktopEmojiCatalog.CustomEmojiUnloaded);
        var document = answer?.OfType<Document>().FirstOrDefault(item => item.id == id)
            ?? throw new BridgeException(DesktopEmojiCatalog.CustomEmojiMissing);
        var media = _media.RegisterDocument(document);
        if (media == null) throw new BridgeException(DesktopEmojiCatalog.CustomEmojiUnloaded);
        return new { id = id.ToString(), media, emoji = DesktopEmojiCatalog.EmojiOf(document) ?? "" };
    }

    /// `customEmoji.search` (`:4341`). Donde TDLib buscaba texto libre, MTProto pregunta por un emoji suelto
    /// (<c>messages.searchCustomEmoji</c>, con <c>emoticon</c>): el buscador del selector de reacción solo encuentra
    /// lo que Telegram indexa bajo el caracter escrito. Es la diferencia de la petición, no de la pantalla, y se dice.
    private async Task<object?> CustomEmojiSearchAsync(JsonElement args)
    {
        var client = Connected().Client;
        var found = await FamilyAsync(() => client.Messages_SearchCustomEmoji(emoticon: DesktopEmojiCatalog.QueryOf(Str(args, "query")), hash: 0),
            DesktopEmojiCatalog.CustomEmojiUnsearched);
        var ids = (found?.document_id ?? []).Take(DesktopEmojiCatalog.SearchCap).ToArray();
        var documents = ids.Length == 0 ? [] : await FamilyAsync(() => client.Messages_GetCustomEmojiDocuments(ids), DesktopEmojiCatalog.CustomEmojiUnsearched);
        return documents.OfType<Document>().Select(document => (object)new
        {
            id = document.id.ToString(),
            emoji = DesktopEmojiCatalog.EmojiOf(document) ?? "",
            media = _media.RegisterDocument(document),
        }).ToList();
    }

    /// `emojiPacks.list` (`:4922-4952`): sección, forma y red, con la frase de fallo propia de cada sección.
    private async Task<object?> EmojiPacksListAsync(JsonElement args)
    {
        var client = Connected().Client;
        var kind = Str(args, "kind");
        if (!DesktopEmojiCatalog.IsKnownSection(kind)) throw new BridgeException(DesktopEmojiCatalog.BadSection);
        var query = DesktopEmojiCatalog.QueryOf(Str(args, "query"));
        if (kind == "search" && query.Length == 0) throw new BridgeException(DesktopEmojiCatalog.NeedPackName);
        var offset = Long(args, "offset");
        if (kind == "featured" && !DesktopEmojiCatalog.PageAllowed(offset)) throw new BridgeException(DesktopEmojiCatalog.BadPage);
        var failure = kind switch
        {
            "installed" => DesktopEmojiCatalog.SavedUnread,
            "search" => DesktopEmojiCatalog.ResultsUnread,
            _ => DesktopEmojiCatalog.FeaturedUnread,
        };
        List<DesktopEmojiCatalog.Row> rows;
        if (kind == "installed")
            rows = DesktopEmojiCatalog.Rows((await FamilyAsync(() => client.Messages_GetEmojiStickers(hash: 0), failure))?.sets);
        else if (kind == "search")
            rows = DesktopEmojiCatalog.Rows((await FamilyAsync(() => client.Messages_SearchEmojiStickerSets(query, hash: 0, exclude_featured: false), failure))?.sets);
        else
        {
            var answer = await FamilyAsync(() => client.Messages_GetFeaturedStickers(hash: 0), failure);
            rows = DesktopEmojiCatalog.Rows((answer as Messages_FeaturedStickers)?.sets)
                .Take(DesktopEmojiCatalog.PackLimit).ToList();
        }
        Remember(rows);
        return new { items = rows.Select(PackDto).ToList(), nextOffset = 0L };
    }

    /// `emojiPacks.get` (`:4953-4971`): abre el pack, comprueba que es de emojis personalizados y saca la lista con
    /// su medio. La comprobación del tipo va antes del montaje de las filas, igual que en Android.
    private async Task<object?> EmojiPackAsync(JsonElement args)
    {
        var client = Connected().Client;
        if (!DesktopEmojiCatalog.PositiveId(Str(args, "id"), out var id)) throw new BridgeException(DesktopEmojiCatalog.BadId);
        var answer = await OpenPackAsync(id, client, DesktopEmojiCatalog.PackUnopened);
        if (answer?.set is not { } set || !DesktopEmojiCatalog.IsEmojiPack(set))
            throw new BridgeException(DesktopEmojiCatalog.NotEmojiPack);
        var dto = OpenedDto(set, answer.documents);
        dto.Items = DesktopEmojiCatalog.EmojiItems(answer.documents).Select(item => (object)new
        {
            id = item.Id.ToString(),
            emoji = item.Emoji,
            media = item.Media == null ? null : _media.RegisterDocument(item.Media),
        }).ToList();
        return dto;
    }

    /// `stickers.installed` (`:4972`): la lista plana de packs guardados que no son de emojis ni de máscaras, porque
    /// TDLib los separa por tipo y <c>messages.getAllStickers</c> los trae juntas.
    private async Task<object?> InstalledStickersAsync()
    {
        var client = Connected().Client;
        var answer = await FamilyAsync(() => client.Messages_GetAllStickers(hash: 0), DesktopEmojiCatalog.PacksUnprepared);
        var rows = DesktopEmojiCatalog.Rows((answer?.sets ?? []).Where(DesktopEmojiCatalog.IsRegularPack));
        Remember(rows);
        return rows.Select(PackDto).ToList();
    }

    /// `stickers.search` (`:4973`): nombre corto y apertura directa por <c>InputStickerSetShortName</c>, que no
    /// necesita firma de acceso; es la única de las tres puertas que puede abrir un pack nunca leído.
    private async Task<object?> SearchStickersAsync(JsonElement args)
    {
        var client = Connected().Client;
        if (!DesktopEmojiCatalog.ShortNameOf(Str(args, "name"), out var name))
            throw new BridgeException(DesktopEmojiCatalog.NeedShortName);
        var answer = await FamilyAsync(() => client.Messages_GetStickerSet(new InputStickerSetShortName { short_name = name }, hash: 0),
            DesktopEmojiCatalog.PackUnprepared);
        if (answer?.set is not { } set) throw new BridgeException(DesktopEmojiCatalog.PackUnprepared);
        return OpenedDto(set, answer.documents);
    }

    /// `stickers.get` (`:4974`): la fila del pack más hasta veinticuatro stickers ya registrados.
    private async Task<object?> StickerSetAsync(JsonElement args)
    {
        var client = Connected().Client;
        if (!DesktopEmojiCatalog.PositiveId(Str(args, "id"), out var id)) throw new BridgeException(DesktopEmojiCatalog.BadId);
        var answer = await OpenPackAsync(id, client, DesktopEmojiCatalog.PackUnloaded);
        if (answer?.set is not { } set) throw new BridgeException(DesktopEmojiCatalog.PackUnloaded);
        var dto = OpenedDto(set, answer.documents);
        var shown = new List<object>();
        foreach (var document in DesktopEmojiCatalog.PackDocuments(answer.documents))
            if (_media.RegisterDocument(document) is MediaDto media) shown.Add(media);
        dto.Stickers = shown;
        return dto;
    }

    /// `stickers.install` (`:4975`): guarda o quita según la bandera que manda la pantalla. Es la única escritura de
    /// la familia que cambia el estado de la cuenta, así que la bandera no se puede suponer y el fallo se devuelve
    /// con la causa de Telegram detrás, como en <c>DesktopMessageReactFlow.cs:104</c>.
    private async Task<object?> ChangeStickerSetAsync(JsonElement args)
    {
        var client = Connected().Client;
        if (!DesktopEmojiCatalog.PositiveId(Str(args, "id"), out var id)) throw new BridgeException(DesktopEmojiCatalog.BadId);
        if (!HasDecision(args, out var installed)) throw new BridgeException(DesktopEmojiCatalog.NeedDecision);
        var pack = await FamilyAsync(() => PackKeyAsync(id, client), DesktopEmojiCatalog.NoAccessHash);
        try
        {
            if (installed) await client.Messages_InstallStickerSet(pack, archived: false);
            else await client.Messages_UninstallStickerSet(pack);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException(DesktopEmojiCatalog.WriteFailed + message, ex);
        }
        return true;
    }

    // ----- Las piezas que comparten las ramas -----

    /// La fila de <c>stickerInfo</c> (`:4900`) con su portada: la que traía la lista, o la que saca del primer
    /// <c>covers</c> cuando no vino (`:4910-4915`).
    private StickerPackDto PackDto(DesktopEmojiCatalog.Row row)
    {
        var dto = DesktopEmojiCatalog.Dto(row);
        if (row.Cover != null)
        {
            dto.Thumbnail = _media.RegisterDocument(row.Cover);
            dto.Emoji = DesktopEmojiCatalog.EmojiOf(row.Cover);
        }
        return dto;
    }

    /// La fila de un pack abierto, con su firma apuntada y el primer documento del pack como portada:
    /// <c>StickerSet.thumbs</c> son <c>PhotoSize</c> sueltos y el registro de medios del escritorio solo sirve
    /// documentos, así que la miniatura de lista no existe aquí.
    private StickerPackDto OpenedDto(StickerSet set, IEnumerable<DocumentBase>? documents)
    {
        var row = DesktopEmojiCatalog.Rows(new[] { set })[0];
        Remember([row]);
        return PackDto(row with { Cover = DesktopEmojiCatalog.CoverOf(documents) });
    }

    /// <c>messages.getStickerSet</c> por número, con la firma de acceso buscada en la caché de la sesión.
    private async Task<Messages_StickerSet?> OpenPackAsync(long id, Client client, string failure) =>
        await FamilyAsync(async () => await client.Messages_GetStickerSet(await PackKeyAsync(id, client), hash: 0), failure);

    /// El número de pack convertido en <c>InputStickerSet</c>. Primero la caché de lo ya leído; si falta, una sola vez
    /// por sesión la lista completa de guardados, que trae la firma de todos ellos; y si sigue sin estar, la negativa
    /// con causa.
    private async Task<InputStickerSet> PackKeyAsync(long id, Client client)
    {
        if (_packKeys.TryGetValue(id, out var known)) return new InputStickerSetID { id = id, access_hash = known };
        if (!_packKeysRefreshed)
        {
            _packKeysRefreshed = true;
            var answer = await client.Messages_GetAllStickers(hash: 0);
            Remember(DesktopEmojiCatalog.Rows(answer?.sets));
            if (_packKeys.TryGetValue(id, out known)) return new InputStickerSetID { id = id, access_hash = known };
        }
        throw new BridgeException(DesktopEmojiCatalog.NoAccessHash);
    }

    private void Remember(IEnumerable<DesktopEmojiCatalog.Row> rows)
    {
        foreach (var row in rows) _packKeys[row.Id] = row.AccessHash;
    }

    /// <c>NativeBridge.java:4975</c> usa <c>getBoolean</c>, que lanza si la clave no viene. Aquí se distingue «viene a
    /// false» de «no viene», porque la segunda no se puede adivinar: es una orden sobre la cuenta del usuario.
    private static bool HasDecision(JsonElement args, out bool installed)
    {
        installed = false;
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("installed", out var value)) return false;
        if (value.ValueKind is not (JsonValueKind.True or JsonValueKind.False)) return false;
        installed = value.ValueKind == JsonValueKind.True;
        return true;
    }
}
