package cc.webrom.wrgram;

import org.drinkless.tdlib.TdApi;

/**
 * Un borrador de Telegram es texto, formato y **a quién responde**. `DraftMessage` guarda las tres
 * cosas en la nube de la cuenta, así que lo que aquí no se escriba se pierde en los cuatro
 * dispositivos del mismo usuario. Esta clase no habla con TDLib: construye el objeto, lo lee de
 * vuelta y dice si hace falta preguntarle a Telegram qué mensaje se está citando.
 */
final class Drafts {
    private Drafts() {}

    /**
     * El borrador solo cita un mensaje del mismo chat. TDLib declara `inputMessageReplyToStory`
     * como no soportado en borradores y la cita de texto (M02) no viaja en el borrador: se decide
     * al enviar, así que `quote` va a null y el efecto y el post sugerido no se rellenan nunca por nuestra cuenta.
     */
    static TdApi.InputMessageReplyTo target(long replyTo) {
        return replyTo == 0L ? null : new TdApi.InputMessageReplyToMessage(replyTo, null, 0, "");
    }

    /** Texto en blanco: no hay nada que guardar, y TDLib entiende `null` como «borrar el borrador». */
    static TdApi.DraftMessage build(String text, TdApi.TextEntity[] entities, long replyTo) {
        if (text == null || text.trim().isEmpty()) return null;
        TdApi.FormattedText body = new TdApi.FormattedText(text, entities == null ? new TdApi.TextEntity[0] : entities);
        return new TdApi.DraftMessage(target(replyTo), 0, new TdApi.DraftMessageContentText(body, null), 0L, null);
    }

    /** El id que el borrador guarda hoy; 0 cuando no cita nada o guarda una variante no reconocida. */
    static long replyOf(TdApi.DraftMessage draft) {
        if (draft == null || !(draft.replyTo instanceof TdApi.InputMessageReplyToMessage)) return 0L;
        return ((TdApi.InputMessageReplyToMessage) draft.replyTo).messageId;
    }

    /** Para el snapshot el id viaja **en texto**: un id de 64 bits no sobrevive a un `double` de JSON. */
    static String replyId(TdApi.DraftMessage draft) {
        long id = replyOf(draft);
        return id == 0L ? "" : Long.toString(id);
    }
}
