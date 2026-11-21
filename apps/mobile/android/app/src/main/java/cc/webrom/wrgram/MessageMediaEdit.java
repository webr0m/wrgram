package cc.webrom.wrgram;

import java.util.Locale;
import org.drinkless.tdlib.TdApi;

/**
 * Las reglas de sustituir el medio de un mensaje que ya salió, medidas sobre la TDLib empaquetada.
 *
 * <p>
 * La librería cambia el contenido de un mensaje con <c>EditMessageMedia</c> (<c>TdApi.java:120729</c>) y admite
 * <b>cinco</b> tipos, ni uno más: animación, audio, documento, foto o vídeo (<c>TdApi.java:120743</c>). La nota de
 * voz y el videomensaje no están ahí, y no es un descuido de esta función: las otras dos que editan medio —
 * <c>EditBusinessMessageMedia</c> (<c>TdApi.java:119451</c>) y <c>EditInlineMessageMedia</c>
 * (<c>TdApi.java:120385</c>)— repiten la misma lista de cinco. Editar un mensaje propio no puede convertirlo en
 * nota de voz ni dejarlo en una. La pregunta de si el mensaje admite el cambio la decide Telegram con
 * <c>MessageProperties.canEditMedia</c> (<c>TdApi.java:54711</c>), y la restricción del álbum está escrita en la
 * propia documentación de la función: «The type of message content in an album can't be changed with exception
 * of replacing a photo with a video or vice versa» (<c>TdApi.java:120725</c>).
 * </p>
 *
 * <p>
 * Lo que <c>EditMessageMedia</c> hace con el pie es otra consecuencia de la misma línea: la función edita «including
 * message caption» (<c>TdApi.java:120725</c>), así que el contenido nuevo lleva el pie consigo. Mandarlo vacío borraría el
 * texto que la persona escribió, y mandarlo editado por aquí sería pisar el camino que ya tiene su propio
 * <c>message.edit.caption</c>. Esta clase conserva el pie y las dos banderas de presentación del contenido viejo.
 * </p>
 */
final class MessageMediaEdit {
    private MessageMediaEdit() {}

    /** Los cinco tipos que admite <c>EditMessageMedia</c>, medidos en <c>TdApi.java:120743</c>. */
    static final String PHOTO = "photo";
    static final String VIDEO = "video";
    static final String ANIMATION = "animation";
    static final String AUDIO = "audio";
    static final String DOCUMENT = "document";
    /** El vacío de {@link #currentKind}: el mensaje no es de los cinco, así que aquí no hay nada que sustituir. */
    static final String NONE = "";

    /** La negativa cuando Telegram no concede el cambio —la decide <c>canEditMedia</c>, no esta clase. */
    static final String REFUSED = "Telegram no permite cambiar el medio de este mensaje.";
    /** La negativa cuando el contenido no es uno de los cinco tipos que admite la función. */
    static final String NOT_MEDIA = "Este mensaje no tiene un medio que se pueda sustituir.";
    /** La restricción del álbum, traducida de la frase que <c>TdApi.java:120725</c> escribe en inglés. */
    static final String ALBUM_TYPE = "Dentro de un álbum solo se puede cambiar una foto por un vídeo, o un vídeo por una foto.";
    /** El archivo elegido ya no es de esta conversación: la misma guarda que tiene el envío suelto. */
    static final String CHANGED = "La conversación cambió. Vuelve a elegir el archivo.";

    /**
     * Qué medio guarda ahora el mensaje, de los cinco tipos de <c>EditMessageMedia</c>. Todo lo demás —texto, nota de
     * voz, videomensaje, sticker, encuesta, contacto, ubicación o historia compartida— sale como {@link #NONE}.
     */
    static String currentKind(TdApi.MessageContent content) {
        if (content instanceof TdApi.MessagePhoto) return PHOTO;
        if (content instanceof TdApi.MessageVideo) return VIDEO;
        if (content instanceof TdApi.MessageAnimation) return ANIMATION;
        if (content instanceof TdApi.MessageAudio) return AUDIO;
        if (content instanceof TdApi.MessageDocument) return DOCUMENT;
        return NONE;
    }

    /**
     * Qué va a construir el puente para el archivo recién elegido. La clasificación es la misma que usa el envío
     * suelto: las tres fotos de siempre son foto, el GIF es animación, cualquier <c>video/*</c> es vídeo, cualquier
     * <c>audio/*</c> es audio y el resto es documento. Ningún archivo se queda sin tipo.
     */
    static String wantedKind(String mime) {
        String value = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        if (value.equals("image/gif")) return ANIMATION;
        if (value.equals("image/jpeg") || value.equals("image/png") || value.equals("image/webp")) return PHOTO;
        if (value.startsWith("video/")) return VIDEO;
        if (value.startsWith("audio/")) return AUDIO;
        return DOCUMENT;
    }

    /**
     * El motivo por el que el cambio no puede mandarse, o <c>null</c> si puede. El orden no es decorativo: primero la
     * forma del mensaje (sin medio de los cinco no hay nada que preguntar), después lo que Telegram concede, y al
     * final la restricción del álbum, que solo tiene sentido sobre un mensaje que ya admite el cambio.
     */
    static String problem(boolean canEditMedia, String current, String wanted, long mediaAlbumId) {
        if (current.equals(NONE)) return NOT_MEDIA;
        if (!canEditMedia) return REFUSED;
        if (mediaAlbumId != 0 && !exchangeableInAlbum(current, wanted)) return ALBUM_TYPE;
        return null;
    }

    /** La única pareja que puede intercambiarse dentro de un álbum: foto y vídeo, en los dos sentidos y sin cambiar de tipo. */
    static boolean exchangeableInAlbum(String current, String wanted) {
        return (current.equals(PHOTO) || current.equals(VIDEO)) && (wanted.equals(PHOTO) || wanted.equals(VIDEO));
    }

    /**
     * El pie que ya trae el mensaje, o un pie vacío cuando no trae. Se conserva tal cual, con sus entidades, porque
     * la función escribe el pie junto al medio (<c>TdApi.java:120725</c>).
     */
    static TdApi.FormattedText captionOf(TdApi.MessageContent content) {
        TdApi.FormattedText caption = null;
        if (content instanceof TdApi.MessagePhoto) caption = ((TdApi.MessagePhoto) content).caption;
        else if (content instanceof TdApi.MessageVideo) caption = ((TdApi.MessageVideo) content).caption;
        else if (content instanceof TdApi.MessageAnimation) caption = ((TdApi.MessageAnimation) content).caption;
        else if (content instanceof TdApi.MessageAudio) caption = ((TdApi.MessageAudio) content).caption;
        else if (content instanceof TdApi.MessageDocument) caption = ((TdApi.MessageDocument) content).caption;
        return caption == null ? new TdApi.FormattedText("", new TdApi.TextEntity[0]) : caption;
    }

    /**
     * La bandera de poner el pie encima del medio. Solo la llevan la foto, el vídeo y la animación; en documento y
     * audio la librería no tiene dónde guardarla, así que sale en falso y el contenido nuevo se arma sin ella.
     */
    static boolean showsCaptionAboveMedia(TdApi.MessageContent content) {
        if (content instanceof TdApi.MessagePhoto) return ((TdApi.MessagePhoto) content).showCaptionAboveMedia;
        if (content instanceof TdApi.MessageVideo) return ((TdApi.MessageVideo) content).showCaptionAboveMedia;
        if (content instanceof TdApi.MessageAnimation) return ((TdApi.MessageAnimation) content).showCaptionAboveMedia;
        return false;
    }

    /** El aviso de contenido sensible, en los tres mismos sitios que la bandera de arriba. */
    static boolean hasSpoiler(TdApi.MessageContent content) {
        if (content instanceof TdApi.MessagePhoto) return ((TdApi.MessagePhoto) content).hasSpoiler;
        if (content instanceof TdApi.MessageVideo) return ((TdApi.MessageVideo) content).hasSpoiler;
        if (content instanceof TdApi.MessageAnimation) return ((TdApi.MessageAnimation) content).hasSpoiler;
        return false;
    }

    /**
     * Si el vídeo nuevo puede pedirse como emisión continua. La contenedora que Telegram reproduce en flujo es MP4 —
     * y MOV es su misma familia—; dar <c>true</c> a un WebM o un MKV sería prometer una reproducción que el archivo
     * no puede dar.
     */
    static boolean streams(String mime) {
        String value = mime == null ? "" : mime.toLowerCase(Locale.ROOT);
        return value.equals("video/mp4") || value.equals("video/quicktime");
    }
}
