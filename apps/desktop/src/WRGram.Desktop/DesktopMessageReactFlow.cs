namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de las reacciones en Windows (ronda BX): <c>message.react</c> y <c>message.react.custom</c>, las dos
/// escrituras, y la bandeja que alimenta <c>message.properties</c> para que el menú del mensaje tenga qué ofrecer.
/// En Android se atienden en <c>NativeBridge.java:4334</c> (<c>react</c>) y <c>NativeBridge.java:4339</c>
/// (<c>reactCustom</c>) con <c>AddMessageReaction</c> y <c>RemoveMessageReaction</c>; aquí es una sola petición,
/// <c>messages.sendReaction</c>, que manda el conjunto completo. Reglas, frases y la forma del conjunto, en
/// <see cref="DesktopMessageReact"/>; aquí solo el orden de las peticiones y su caché.
/// <para>
/// El orden reproduce al de Android en lo que se parece: primero la guarda de la fila —<c>message(p)</c> es
/// <c>NativeBridge.java:364</c> leyendo el mensaje, y aquí es <c>DesktopMessageDelete.Loaded</c>, que exige que
/// la fila esté cargada en la conversación activa antes de ir a la red—, después la forma del argumento, después
/// la comprobación de Premium, y al final la escritura. La comprobación de la lista ofrecida va en medio, y se
/// salta en dos casos por los mismos motivos que Android: al quitar una reacción, porque <c>react</c>
/// (<c>NativeBridge.java:4334</c>) manda la quitada sin preguntar, y cuando la lista no se pudo leer, porque en
/// <c>reactOffered</c> (<c>NativeBridge.java:5283</c>) la consulta fallida manda la orden igual.
/// </para>
/// <para>
/// La bandeja se lee de la información completa del chat, que es donde MTProto pone lo que Telegram autoriza en
/// ese chat: <c>ChannelFull.available_reactions</c> y <c>ChatFull.available_reactions</c>, detrás de su bandera
/// <c>has_available_reactions</c>. Cuando el chat no la personaliza —<c>ChatReactionsAll</c>— o cuando es un uno a
/// uno, cuyo <c>UserFull</c> no trae el campo, la lista es la general de
/// <c>messages.getAvailableReactions</c>. Cada lista se pide una vez por sesión y se guarda por chat; la caché no
/// se tira cuando un administrador cambia los emojis, así que en Windows el menú puede seguir ofreciendo la lista
/// vieja hasta reiniciar. Es el hueco que queda por no preguntar en cada apertura, y está dicho.
/// </para>
/// <para>
/// El botón de emoji personalizado (✨) se ofrece desde la ronda CD: <c>message.properties</c> manda ya en
/// <c>allowCustom</c> la bandera de la cuenta, y el selector pregunta <c>premium.state</c> a
/// <see cref="DesktopPremiumState"/>, que contesta la marca sin ida y vuelta y deja vacíos el texto del plan y sus
/// opciones de pago —la razón, escrita allí—. Las dos claves que el selector necesita tienen brazo: la de la búsqueda
/// la puso la ronda BY (<see cref="CustomEmojiSearchAsync"/>), así que una cuenta Premium reacciona ahora desde el
/// cajón del «+» y no solo con la ficha que ya trajo el mensaje. Lo que sigue sin hacerse es gastar Stars:
/// <c>message.react.paid</c> se niega con su nombre porque aquí no hay cartera, y esa negativa no depende de la marca
/// de Premium sino del saldo.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// La lista ofrecida por chat, leída una vez. <c>null</c> en la caché significa «no se pudo saber», y entonces
    /// el brazo no valida: manda la orden y deja que Telegram la rechace, que es lo que hace Android.
    private readonly Dictionary<string, DesktopMessageReact.Offer[]?> _reactionOffers = new();

    /// La lista general de emojis de reacción, con su marca de Premium. Una sola vez por sesión.
    private DesktopMessageReact.Offer[]? _reactionDefaults;

    /// <c>message.react</c> y <c>message.react.custom</c> (<c>NativeBridge.java:785</c> y
    /// <c>NativeBridge.java:787</c>). El parámetro se llama `emoji` en las dos claves, como en Android, y para la
    /// personalizada es el identificador del documento.
    private async Task<object?> ReactAsync(JsonElement args, bool custom)
    {
        if (_client is not Client client || client.User == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = RequireEntry(_active);
        var kind = DesktopMessageDelete.Of(entry.Id);
        if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);
        var ids = DesktopMessageDelete.Ids(new[] { Str(args, "id") }) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);
        var rows = DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids);
        if (rows.Count != 1) throw new BridgeException(DesktopMessageDelete.NotLoaded);
        var premium = (client.User.flags & User.Flags.premium) != 0;
        var remove = Bool(args, "remove");

        DesktopMessageReact.Offer target;
        if (custom)
        {
            if (!long.TryParse(Str(args, "emoji").Trim(), out var document) || document <= 0)
                throw new BridgeException(DesktopMessageReact.NoCustomEmoji);
            if (!premium) throw new BridgeException(DesktopMessageReact.NotPremiumAccount);
            target = new DesktopMessageReact.Offer("", document.ToString(), true);
        }
        else
        {
            var emoji = Str(args, "emoji").Trim();
            if (emoji.Length == 0) throw new BridgeException(DesktopMessageReact.NoEmoji);
            var available = await OffersAsync(entry, client);
            DesktopMessageReact.Offer? match = null;
            if (available != null)
                foreach (var candidate in available)
                    if (candidate.CustomEmojiId == null && candidate.Emoji == emoji) { match = candidate; break; }
            if (!remove && available != null)
            {
                var refusal = DesktopMessageReact.Refusal(match, premium);
                if (refusal != null) throw new BridgeException(refusal);
            }
            target = match ?? new DesktopMessageReact.Offer(emoji, null, false);
        }

        var set = DesktopMessageReact.Request(DesktopMessageReact.Chosen(rows[0]), target, remove);
        try
        {
            await client.Messages_SendReaction(entry.Input, ids[0], set, big: false, add_to_recent: true);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la reacción en el mensaje. " + message, ex);
        }
        return true;
    }

    /// Las ofertas del menú, con las que esta cuenta ya tiene puestas fuera —es la lista que <c>App.tsx</c> pinta
    /// en la banda de ocho y en el cajón del «+»—.
    private async Task<List<object>> ReactionBandAsync(ChatEntry entry, Client client, MessageDto? row)
    {
        var available = await OffersAsync(entry, client);
        if (available == null) return [];
        return DesktopMessageReact.Offers(available, DesktopMessageReact.Chosen(row))
            .Select(option => (object)new
            {
                kind = option.CustomEmojiId is null ? "emoji" : DesktopMessageReact.CustomKind,
                emoji = option.Emoji,
                customEmojiId = option.CustomEmojiId,
                needsPremium = option.NeedsPremium,
            })
            .ToList();
    }

    /// Lo que el chat autoriza, con la caché por conversación. <c>null</c> es «no lo sabemos», y el llamador decide
    /// si eso le importa.
    private async Task<DesktopMessageReact.Offer[]?> OffersAsync(ChatEntry entry, Client client)
    {
        if (_reactionOffers.TryGetValue(entry.Id, out var cached)) return cached;
        var list = await ChatOffersAsync(client, entry) ?? await DefaultOffersAsync(client);
        _reactionOffers[entry.Id] = list;
        return list;
    }

    /// <c>channels.getFullChannel</c> o <c>messages.getFullChat</c>, según la forma del peer; la librería llama a
    /// las dos desde <c>GetFullChat</c>. Solo interesa aquí la lista personalizada: si el chat admite todas, devuelve
    /// <c>null</c> y el llamador cae en la lista general.
    private static async Task<DesktopMessageReact.Offer[]?> ChatOffersAsync(Client client, ChatEntry entry)
    {
        try
        {
            var answer = await client.GetFullChat(entry.Input);
            var available = answer?.full_chat switch
            {
                ChannelFull channel when (channel.flags & ChannelFull.Flags.has_available_reactions) != 0 => channel.available_reactions,
                ChatFull chat when (chat.flags & ChatFull.Flags.has_available_reactions) != 0 => chat.available_reactions,
                _ => null,
            };
            if (available is not ChatReactionsSome some) return null;
            return [.. (some.reactions ?? []).Select(FromReaction).OfType<DesktopMessageReact.Offer>()];
        }
        catch { return null; }
    }

    /// <c>messages.getAvailableReactions</c> sin hash, que es como se pide la lista fresca. La marca de Premium sale
    /// de <c>AvailableReaction.Flags.premium</c>.
    private async Task<DesktopMessageReact.Offer[]?> DefaultOffersAsync(Client client)
    {
        if (_reactionDefaults != null) return _reactionDefaults;
        try
        {
            var answer = await client.Messages_GetAvailableReactions(hash: 0);
            _reactionDefaults = [.. (answer?.reactions ?? []).Select(item =>
                new DesktopMessageReact.Offer(item.reaction, null, (item.flags & AvailableReaction.Flags.premium) != 0))];
            return _reactionDefaults;
        }
        catch { return null; }
    }

    private static DesktopMessageReact.Offer? FromReaction(Reaction? reaction) => reaction switch
    {
        ReactionEmoji emoji => new DesktopMessageReact.Offer(emoji.emoticon, null, false),
        ReactionCustomEmoji custom => new DesktopMessageReact.Offer("", custom.document_id.ToString(), true),
        _ => null,
    };
}
