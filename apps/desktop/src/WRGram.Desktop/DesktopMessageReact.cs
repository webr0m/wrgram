namespace WRGram.Desktop;

using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Reaccionar a un mensaje desde Windows.
/// <para>
/// <b>La negativa que estaba escrita aquí era falsa.</b> Esta clase negó las tres órdenes desde la ronda AG
/// alegando que «la biblioteca de escritorio no incluye la petición para enviar reacciones». La sonda de la
/// ronda BX, compilada contra WTelegramClient 4.4.10, dice otra cosa: lo que no existe son los nombres viejos
/// que se buscaron —<c>messages.setChatReactions</c>, <c>messages.setReactions</c> y la unión
/// <c>TypeReaction</c>—, porque Telegram los jubiló. La petición actual es <c>messages.sendReaction</c>, y en
/// la librería está: <c>Client.Messages_SendReaction(InputPeer peer, int msg_id, Reaction[] reaction, bool big,
/// bool add_to_recent)</c>, con <c>TL.ReactionEmoji.emoticon</c> y
/// <c>TL.ReactionCustomEmoji.document_id</c> como las dos formas de <c>TL.Reaction</c>. Se compró de las dos
/// maneras: por reflexión sobre el ensamblado y compilando la llamada. La escritura existe, así que el brazo se
/// conecta y las dos claves dejan la lista de pendientes.
/// </para>
/// <para>
/// La diferencia de semántica entre los dos protocolos es lo único que hay que traducir de verdad. TDLib tiene
/// dos órdenes independientes —<c>addMessageReaction</c> y <c>removeMessageReaction</c>, una reacción cada una—
/// y MTProto tiene una sola que manda el conjunto completo: lo que no va en el vector se quita, y un vector
/// vacío limpia el mensaje. Por eso <see cref="Request"/> no devuelve «la reacción pedida», sino el conjunto
/// entero con el que hay que llamar a <c>sendReaction</c>: las que esta cuenta ya tenía puestas, más la nueva
/// o menos la que se quita. Enviar solo la nueva borraría la otra, que es el error que esta forma de la
/// petición invita a cometer.
/// </para>
/// <para>
/// Las dos comprobaciones antes de escribir son las de Android, copiadas carácter a carácter de
/// <c>NativeBridge.java:4401</c> (<c>react</c>), <c>NativeBridge.java:4406</c> (<c>reactCustom</c>) y
/// <c>NativeBridge.java:5350</c> (<c>reactOffered</c>): un emoji vacío no es una orden, una reacción que el
/// chat no ofrece se rechaza con la misma frase, y un emoji personalizado sin Premium se rechaza con la suya.
/// Donde Android pregunta <c>GetUser(selfId).isPremium</c>, el escritorio lee la bandera
/// <c>User.Flags.premium</c> de la cuenta ya conectada —<c>268435456</c>, medida en el ensamblado—, que es el
/// mismo dato sin una ida y vuelta.
/// </para>
/// <para>
/// Lo que sigue negado, y por un motivo distinto: <c>message.react.paid</c>. La petición
/// (<c>Messages_SendPaidReaction</c>) también existe, pero gasta Stars de saldo real, el cargo no se puede
/// deshacer y en Windows no está conectada la lectura de saldo ni de límites
/// (<c>WalletDto</c> del escritorio solo lleva la marca de Premium, y <c>premium.limit</c> sigue pendiente). Android además pregunta antes de
/// gastar; aquí no habría con qué comprobar el saldo. Es una decisión de producto, no un hueco de la
/// biblioteca, y la frase lo dice.
/// </para>
/// <para>
/// Queda fuera, medido y dicho: la lista de reacciones que el chat ofrece no viene en la fila del historial,
/// sino en la información completa del chat (<c>ChannelFull.available_reactions</c> y
/// <c>ChatFull.available_reactions</c>, con <c>reactions_limit</c>), y para un uno a uno <c>UserFull</c> no
/// trae ninguno de los dos campos —medido: <c>TL.UserFull</c> tiene treinta y tres campos y ninguno se llama
/// <c>available_reactions</c>—. En un uno a uno, entonces, la bandeja sale de la lista general
/// (<c>messages.getAvailableReactions</c>), que es lo que Telegram usa cuando el chat no la personaliza.
/// </para>
/// </summary>
public static class DesktopMessageReact
{
    /// Copiada de <c>NativeBridge.java:4363</c>: el puente Android la lanza cuando el parámetro `emoji` llega
    /// vacío, antes de preguntar nada.
    public const string NoEmoji = "Elige un emoji para reaccionar.";

    /// Copiada de <c>NativeBridge.java:5316</c>: el emoji no está entre los que el chat ofrece.
    public const string NotOffered = "Telegram no ofrece esa reacción en este chat.";

    /// Copiada de <c>NativeBridge.java:5318</c>: la reacción está marcada como propia de Premium y la cuenta no
    /// lo es.
    public const string NeedsPremium = "Esa reacción necesita Telegram Premium.";

    /// Copiada de <c>NativeBridge.java:4368</c>: el identificador del emoji personalizado no es un número.
    public const string NoCustomEmoji = "Emoji personalizado no válido.";

    /// Copiada de <c>NativeBridge.java:4368</c>: la cuenta no tiene Premium y se pide un emoji personalizado.
    public const string NotPremiumAccount = "Necesitas Telegram Premium para reaccionar con emojis personalizados.";

    /// Lo que responde <c>message.react.paid</c>. Ya no niega la petición —existe—, sino el gasto: sin saldo a
    /// la vista y sin cargo reversible, el escritorio no ofrece la bandeja de Stars.
    public const string PaidRefused =
        "La reacción de pago gasta Stars de tu saldo y el escritorio todavía no tiene la cartera de Stars conectada, así que aquí no se ofrece.";

    /// La marca con la que la pantalla distingue una ficha de emoji personalizado; es la misma cadena que
    /// <c>ConvertReactions</c> escribe en <c>ReactionDto.Kind</c> y la que <c>App.tsx</c> compara.
    public const string CustomKind = "custom";

    /// Una oferta de la bandeja: qué se manda si se toca. <c>Emoji</c> es el caracter para las normales y
    /// <c>CustomEmojiId</c> el documento para las de Premium; <c>NeedsPremium</c> es la marca que la lista
    /// general de Telegram trae en <c>AvailableReaction.Flags.premium</c>.
    public readonly record struct Offer(string Emoji, string? CustomEmojiId, bool NeedsPremium)
    {
        /// La clave con la que la fila ya puesta se compara con la oferta.
        public string Key => CustomEmojiId is null ? "e:" + Emoji : "c:" + CustomEmojiId;
    }

    /// El par (tipo de reacción, clave) con el que una ficha ya pintada se reconoce a sí misma en la bandeja.
    public static string KeyOf(ReactionDto row) =>
        row.Kind == CustomKind ? "c:" + row.CustomEmojiId : "e:" + row.Emoji;

    /// La lista que la pantalla ofrece: las reacciones del chat menos las que esta cuenta ya tiene puestas, que
    /// es lo que Android devuelve en la primera fila del menú.
    public static List<Offer> Offers(IEnumerable<Offer> available, IEnumerable<ReactionDto> chosen)
    {
        var taken = new HashSet<string>(chosen.Select(KeyOf));
        var list = new List<Offer>();
        foreach (var offer in available)
            if (!taken.Contains(offer.Key)) list.Add(offer);
        return list;
    }

    /// El vector completo que hay que mandar a <c>messages.sendReaction</c>. Las reacciones que se conservan
    /// salen de la propia fila, con su cuenta y su marca de elegida; sin eso, reaccionar con una segunda emoji
    /// borraría la primera.
    public static Reaction[] Request(IEnumerable<ReactionDto> chosen, Offer target, bool remove)
    {
        var set = new List<Reaction>();
        foreach (var row in chosen)
        {
            if (!row.Chosen) continue;
            var key = KeyOf(row);
            if (remove && key == target.Key) continue;
            set.Add(Build(row.Kind, row.Emoji, row.CustomEmojiId));
        }
        if (!remove && !set.Any(item => KeyOf(item) == target.Key)) set.Add(Build(target));
        return [.. set];
    }

    /// Lo que la cuenta ya tiene puesto en el mensaje, en el orden en que la fila lo trajo.
    public static IEnumerable<ReactionDto> Chosen(MessageDto? row) =>
        row?.Reactions?.Where(reaction => reaction.Chosen) ?? [];

    /// La prueba de que la reacción está entre las que el chat ofrece, con el aviso de Premium si hace falta.
    public static string? Refusal(Offer? offered, bool premium)
    {
        if (offered == null) return NotOffered;
        if (offered.Value.NeedsPremium && !premium) return NeedsPremium;
        return null;
    }

    private static Reaction Build(Offer offer) => Build(offer.CustomEmojiId is null ? null : CustomKind, offer.Emoji, offer.CustomEmojiId);

    private static Reaction Build(string? kind, string emoji, string? customEmojiId) =>
        kind == CustomKind && long.TryParse(customEmojiId, out var document)
            ? new ReactionCustomEmoji { document_id = document }
            : new ReactionEmoji { emoticon = emoji };

    private static string KeyOf(Reaction reaction) => reaction switch
    {
        ReactionCustomEmoji custom => "c:" + custom.document_id,
        ReactionEmoji emoji => "e:" + emoji.emoticon,
        _ => "",
    };
}
