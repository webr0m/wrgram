using System.Text.Json;
using TL;
using WTelegram;

namespace WRGram.Desktop;

/// <summary>
/// La cita de texto de M02 (ronda CS), espejo de <c>ReplyQuote.java</c>: el trozo seleccionado del
/// mensaje original viaja como quote_text/quote_entities/quote_offset con su posición en unidades
/// UTF-16 y solo las entidades que Telegram admite en una cita, recortadas y desplazadas al trozo.
/// La ida lee el original con GetMessages porque la caché del host guarda solo texto, sin entidades;
/// la vuelta proyecta el quote del MessageReplyHeader hacia el DTO. Las negativas son las mismas
/// frases que Android y la interfaz. Windows no tiene chats secretos, así que no hay descarte aquí.
/// </summary>
internal static class DesktopReplyQuote
{
    public const string NotText = "Solo se puede citar el texto de un mensaje.";
    public const string Empty = "La cita no puede estar vacía.";
    public const string Mismatch = "La cita no coincide con el texto del mensaje.";

    public static string? Problem(string original, string quote, int position)
    {
        if (string.IsNullOrEmpty(quote)) return Empty;
        if (position < 0 || position + quote.Length > original.Length || original.Substring(position, quote.Length) != quote) return Mismatch;
        return null;
    }

    public static MessageEntity[]? Clip(MessageEntity[]? entities, int position, int length)
    {
        if (entities == null) return null;
        var kept = new List<MessageEntity>();
        foreach (var entity in entities)
        {
            if (entity is not (MessageEntityBold or MessageEntityItalic or MessageEntityUnderline or MessageEntityStrike
                or MessageEntitySpoiler or MessageEntityCustomEmoji or MessageEntityFormattedDate)) continue;
            var from = Math.Max(entity.offset, position);
            var to = Math.Min(entity.offset + entity.length, position + length);
            if (to <= from) continue;
            entity.offset = from - position;
            entity.length = to - from;
            kept.Add(entity);
        }
        return kept.Count == 0 ? null : kept.ToArray();
    }

    public static async Task<InputReplyTo?> ForAsync(Client client, InputPeer peer, int replyId, JsonElement args)
    {
        if (replyId <= 0) return null;
        if (!args.TryGetProperty("quote", out var quote) || quote.ValueKind != JsonValueKind.Object)
            return new InputReplyToMessage { reply_to_msg_id = replyId };
        var text = quote.TryGetProperty("text", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() ?? "" : "";
        var position = quote.TryGetProperty("position", out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt32(out var n) ? n : -1;
        var page = await client.GetMessages(peer, new InputMessageID { id = replyId });
        var original = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == replyId);
        if (original == null || string.IsNullOrEmpty(original.message)) throw new BridgeException(NotText);
        var problem = Problem(original.message, text, position);
        if (problem != null) throw new BridgeException(problem);
        return new InputReplyToMessage { reply_to_msg_id = replyId, quote_text = text, quote_entities = Clip(original.entities, position, text.Length), quote_offset = position };
    }

    public static ReplyQuoteDto? Receive(MessageReplyHeader header, Func<MessageEntity[]?, string, List<EntityDto>?> convert)
    {
        if (string.IsNullOrEmpty(header.quote_text)) return null;
        return new ReplyQuoteDto { Text = header.quote_text, Position = header.quote_offset, Entities = convert(header.quote_entities, header.quote_text) };
    }
}

public sealed class ReplyQuoteDto
{
    public string Text { get; set; } = "";
    public int Position { get; set; }
    public List<EntityDto>? Entities { get; set; }
}