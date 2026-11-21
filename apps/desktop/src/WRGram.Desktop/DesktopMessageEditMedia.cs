namespace WRGram.Desktop;

using System.Linq;
using TL;

/// <summary>
/// Sustituir el medio de un mensaje que ya salió, en Windows. Las reglas son las de la ronda CK, dichas una
/// sola vez en <c>MessageMediaEdit.java:28</c>, y aquí se vuelven a escribir sobre los objetos que la librería
/// de este host devuelve, porque las dos capas preguntan la misma cosa por caminos distintos.
/// <para>
/// Lo que TDLib hace con una función —<c>EditMessageMedia</c>— MTProto lo hace con un argumento:
/// <c>messages.editMessage</c> lleva <c>media</c>, y <c>TL.SchemaExtensions.Messages_EditMessage</c> lo recibe
/// como <c>InputMedia</c>. De ahí las dos diferencias que hay que dejar escritas. La primera: no hay
/// <c>GetMessageProperties</c> que consulte <c>canEditMedia</c>, así que el derecho lo decide el host con las
/// mismas dos miradas que usan <c>message.edit</c> y <c>message.edit.caption</c> —autoría de la fila recién
/// leída y <c>edit_messages</c> en un canal—. La segunda: el pie no viaja dentro del <c>InputMedia</c>, que en
/// esta versión no tiene campo de caption, sino en el argumento <c>message</c> de la petición; conservarlo aquí
/// es volver a mandar el texto y las entidades que Telegram acaba de devolver.
/// </para>
/// <para>
/// Las cuatro frases están copiadas carácter a carácter de las constantes de <c>MessageMediaEdit.java</c> —la de
/// arriba, la de <c>MessageMediaEdit.java:43</c>, la del álbum de <c>MessageMediaEdit.java:45</c> y la del vale
/// de <c>MessageMediaEdit.java:47</c>— y <c>rondaCKB.test.ts</c> las compara con el Java: si una capa cambia de
/// palabra sin la otra, la prueba falla. El orden de las negativas tampoco es decorativo y es el mismo
/// (<c>MessageMediaEdit.java:81</c>): primero la forma del mensaje, después lo que Telegram concede, y al final
/// la restricción del álbum.
/// </para>
/// <para>
/// Lo que Android mide y este host no puede medir se queda dicho, no imitado: el <c>supportsStreaming</c> de
/// <c>MessageMediaEdit.java:131</c> sale de leer el contenedor con el extractor del sistema, y en Windows el
/// archivo se manda con las mismas dos cosas con las que lo manda <c>send.attachment</c> —su nombre y, si es
/// GIF, su marca de animación—. El servidor rellena lo demás.
/// </para>
/// </summary>
public static class DesktopMessageEditMedia
{
    /// Los cinco tipos que admite la edición de medio, con las mismas cinco palabras de
    /// <c>MessageMediaEdit.java:32-36</c>.
    public const string Photo = "photo";
    public const string Video = "video";
    public const string Animation = "animation";
    public const string Audio = "audio";
    public const string Document = "document";

    /// El vacío del <c>NONE</c> de <c>MessageMediaEdit.java:38</c>: el mensaje no es de los cinco.
    public const string None = "";

    public const string Refused = "Telegram no permite cambiar el medio de este mensaje.";
    public const string NotMedia = "Este mensaje no tiene un medio que se pueda sustituir.";
    public const string AlbumType = "Dentro de un álbum solo se puede cambiar una foto por un vídeo, o un vídeo por una foto.";
    public const string Changed = "La conversación cambió. Vuelve a elegir el archivo.";

    /// Qué medio guarda ahora el mensaje. En TDLib se mira la clase del contenido; aquí la foto es una clase
    /// propia y los otros cuatro tipos salen de los atributos del documento, que es también lo que hace
    /// <see cref="DesktopMessageEdit.HasCaption"/>. Un sticker, una nota de voz y un videomensaje salen vacíos
    /// porque los tres llegan como documento y ninguno de los tres está entre los cinco: es la misma lista que
    /// Android lee en <c>MessageMediaEdit.java:53</c>.
    public static string CurrentKind(MessageMedia? media) => media switch
    {
        MessageMediaPhoto => Photo,
        MessageMediaDocument { document: Document document } => KindOf(document),
        _ => None,
    };

    private static string KindOf(Document document)
    {
        var attributes = document.attributes ?? [];
        if (attributes.Any(attribute => attribute is DocumentAttributeSticker)) return None;
        if (attributes.Any(attribute => attribute is DocumentAttributeVideo video &&
                                        (video.flags & DocumentAttributeVideo.Flags.round_message) != 0)) return None;
        if (attributes.Any(attribute => attribute is DocumentAttributeAudio audio &&
                                         (audio.flags & DocumentAttributeAudio.Flags.voice) != 0)) return None;
        if (attributes.Any(attribute => attribute is DocumentAttributeAnimated)) return Animation;
        if (attributes.Any(attribute => attribute is DocumentAttributeVideo)) return Video;
        if (attributes.Any(attribute => attribute is DocumentAttributeAudio)) return Audio;
        return Document;
    }

    /// Qué va a salir del archivo recién elegido: la clasificación de <c>MessageMediaEdit.java:67</c> tal cual,
    /// sobre el MIME que ya calcula <see cref="DesktopAttachment.MimeOf"/>. Las tres fotos de siempre son foto,
    /// el GIF es animación, cualquier <c>video/*</c> es vídeo, cualquier <c>audio/*</c> es audio y el resto es
    /// documento; ningún archivo se queda sin tipo.
    public static string WantedKind(string? mime)
    {
        var value = (mime ?? "").ToLowerInvariant();
        if (value == "image/gif") return Animation;
        if (value is "image/jpeg" or "image/png" or "image/webp") return Photo;
        if (value.StartsWith("video/", StringComparison.Ordinal)) return Video;
        if (value.StartsWith("audio/", StringComparison.Ordinal)) return Audio;
        return Document;
    }

    /// El motivo por el que el cambio no puede mandarse, o <c>null</c> si puede —el orden de
    /// <c>MessageMediaEdit.java:81</c>—. <c>canEditMedia</c> es aquí la decisión del host, no una bandera de
    /// Telegram, y <c>groupedId</c> es el álbum MTProto, que se mide igual que en <see cref="DesktopAlbum"/>.
    public static string? Problem(bool canEditMedia, string current, string wanted, long groupedId)
    {
        if (current == None) return NotMedia;
        if (!canEditMedia) return Refused;
        if (groupedId != 0 && !ExchangeableInAlbum(current, wanted)) return AlbumType;
        return null;
    }

    /// La única pareja que puede intercambiarse dentro de un álbum: foto y vídeo en los dos sentidos.
    public static bool ExchangeableInAlbum(string current, string wanted) =>
        (current == Photo || current == Video) && (wanted == Photo || wanted == Video);

    public static long GroupedId(Message message) =>
        (message.flags & Message.Flags.has_grouped_id) != 0 ? message.grouped_id : 0L;

    /// El derecho, en las dos miradas que ya usan las otras dos caras de editar: autoría de la fila recién leída
    /// o <c>edit_messages</c> en un canal. Lo dice la fila que Telegram acaba de devolver y no la que pintó la
    /// pantalla hace un rato, porque entre una y otra el mensaje puede haber sido borrado o puede haber salido
    /// del canal.
    public static bool CanEditMedia(Message fresh, bool channelAllowed) =>
        (fresh.flags & Message.Flags.out_) != 0 || channelAllowed;

    /// La bandera que la pantalla pregunta antes de ofrecer la entrada del menú, espejo de la línea de Android
    /// (`NativeBridge.java:4326`): derecho y un medio de los cinco. Sin la segunda mitad la entrada aparecería
    /// sobre un sticker o una nota de voz, que son justo los dos casos en los que la petición de abajo va a
    /// negarse; con la primera mitad fuera, Windows ofrecería cambiar el archivo de un mensaje ajeno.
    public static bool Offered(bool outgoing, bool channelAllowed, string current) =>
        (outgoing || channelAllowed) && current != None;

    /// El pie que ya trae la fila, para volver a mandarlo sin tocarlo. En MTProto son dos cosas del mensaje —el
    /// texto y sus entidades—, y las dos se conservan: cambiar el medio no es borrar lo escrito, y editarlo por
    /// aquí pisaría el camino que ya tiene su propio <c>message.edit.caption</c>.
    public static string CaptionOf(Message message) => message.message ?? "";

    public static MessageEntity[] CaptionEntitiesOf(Message message) => message.entities ?? [];

    /// La bandera de poner el pie encima del medio. En TDLib vive dentro del contenido; en MTProto es
    /// <c>Message.Flags.invert_media</c>, y la petición la recibe como su propio parámetro.
    public static bool ShowsCaptionAboveMedia(Message message) =>
        (message.flags & Message.Flags.invert_media) != 0;

    /// El aviso de contenido sensible, en las dos clases que lo llevan. Un documento que no es foto ni vídeo
    /// tampoco tiene dónde guardarlo, así que sale en falso igual que en <c>MessageMediaEdit.java:119</c>.
    public static bool HasSpoiler(MessageMedia? media) => media switch
    {
        MessageMediaPhoto photo => (photo.flags & MessageMediaPhoto.Flags.spoiler) != 0,
        MessageMediaDocument document => (document.flags & MessageMediaDocument.Flags.spoiler) != 0,
        _ => false,
    };

    /// El medio nuevo, armado como lo arma <c>send.attachment</c>: la foto por su vía —que es lo que hace que
    /// salga con miniatura— y todo lo demás como documento con su MIME y sus atributos. Aquí no se añade nada
    /// que el envío suelto no añada, y esa es la razón: lo que salga tiene que parecerse a lo que se manda.
    public static InputMedia MediaFor(string wanted, string name, string mime, InputFileBase file, bool spoiler)
    {
        if (wanted == Photo)
            return new InputMediaUploadedPhoto
            {
                file = file,
                flags = spoiler ? InputMediaUploadedPhoto.Flags.spoiler : default
            };
        return new InputMediaUploadedDocument
        {
            file = file,
            mime_type = mime,
            attributes = DesktopAttachment.AttributesFor(name, mime),
            flags = spoiler ? InputMediaUploadedDocument.Flags.spoiler : default
        };
    }
}
