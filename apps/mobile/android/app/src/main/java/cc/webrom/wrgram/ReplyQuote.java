package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * La cita de texto de M02 (ronda CS): el trozo seleccionado del mensaje original viaja como
 * {@link TdApi.InputTextQuote} con su posición en unidades UTF-16 y solo las entidades que
 * Telegram admite en una cita, recortadas y desplazadas al trozo. Las negativas son las mismas
 * frases que Windows y la interfaz; el chat secreto descarta la cita en TdSession porque TDLib
 * exige quote null ahí. La cita entre chats distintos y los richTexts quedan para CS-B.
 */
final class ReplyQuote {
    static final String NOT_TEXT = "Solo se puede citar el texto de un mensaje.";
    static final String EMPTY = "La cita no puede estar vacía.";
    static final String MISMATCH = "La cita no coincide con el texto del mensaje.";

    private ReplyQuote() {}

    static TdApi.InputTextQuote of(TdApi.Message original, JSONObject quote) {
        TdApi.FormattedText source = source(original);
        if (source == null || source.text == null || source.text.isEmpty()) throw new IllegalArgumentException(NOT_TEXT);
        String text = quote.optString("text", "");
        int position = quote.optInt("position", -1);
        String problem = problem(source.text, text, position);
        if (problem != null) throw new IllegalArgumentException(problem);
        return new TdApi.InputTextQuote(new TdApi.FormattedText(text, clip(source.entities, position, text.length())), new TdApi.RichText[0], position);
    }

    static String problem(String original, String quote, int position) {
        if (quote == null || quote.isEmpty()) return EMPTY;
        if (position < 0 || position + quote.length() > original.length() || !original.substring(position, position + quote.length()).equals(quote)) return MISMATCH;
        return null;
    }

    static TdApi.TextEntity[] clip(TdApi.TextEntity[] entities, int position, int length) {
        List<TdApi.TextEntity> kept = new ArrayList<>();
        if (entities == null) return new TdApi.TextEntity[0];
        for (TdApi.TextEntity entity : entities) {
            if (entity == null || !allowed(entity.type)) continue;
            int from = Math.max(entity.offset, position), to = Math.min(entity.offset + entity.length, position + length);
            if (to <= from) continue;
            kept.add(new TdApi.TextEntity(from - position, to - from, entity.type));
        }
        return kept.toArray(new TdApi.TextEntity[0]);
    }

    static boolean allowed(TdApi.TextEntityType type) {
        return type instanceof TdApi.TextEntityTypeBold || type instanceof TdApi.TextEntityTypeItalic
            || type instanceof TdApi.TextEntityTypeUnderline || type instanceof TdApi.TextEntityTypeStrikethrough
            || type instanceof TdApi.TextEntityTypeSpoiler || type instanceof TdApi.TextEntityTypeCustomEmoji
            || type instanceof TdApi.TextEntityTypeDateTime;
    }

    private static TdApi.FormattedText source(TdApi.Message message) {
        if (message == null || message.selfDestructType != null) return null;
        return NativeSnapshot.formatted(message.content);
    }
}