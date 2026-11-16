namespace WRGram.Desktop;

using TL;

/// <summary>
/// Las reglas de la tarjeta que la pantalla pinta debajo de un mensaje con enlace: título, sitio, descripción y,
/// cuando la página trae foto, esa foto. Android la escribe en <c>NativeSnapshot.java:218</c> y la niega en
/// <c>NativeBridge.java:766</c>; aquí viven las mismas cuatro claves y los dos recortes, medidos línea a línea y
/// copiados carácter a carácter, con una diferencia de protocolo por delante.
/// <para>
/// La diferencia: en TDLib la tarjeta es un campo del contenido de texto (<c>MessageText.linkPreview</c>), y en
/// MTProto es un adjunto (<c>Message.media</c> de clase <c>MessageMediaWebPage</c>). Por eso las dos guardas de Java
/// que preguntan «¿esto es texto?» y «¿tiene tarjeta?» son aquí una sola mirada a la clase de <c>media</c>: un
/// <c>MessageMediaWebPage</c> con <c>WebPage</c> dentro es, a la vez, la señal de que la fila es de texto con enlace
/// y la tarjeta misma. Las <c>WebPageEmpty</c>, <c>WebPagePending</c> y <c>WebPageNotModified</c> que la librería
/// también declara no lo son: ninguna trae título ni descripción que pintar, y fingir una tarjeta con ellas habría
/// llenado la pantalla de cuadros vacíos.
/// </para>
/// <para>
/// Las dos condiciones con las que Java decide si la tarjeta existe en absoluto, en su misma línea:
/// <c>!temporary</c> y «no es un chat secreto». La primera es <c>MessageExtras.temporary</c>, el mismo predicado con
/// el que <c>NativeBridge.java:766</c> cierra el brazo, y su espejo aquí es <c>DesktopSenderProfile.IsEphemeral</c>,
/// que <c>ConvertMessage</c> pide antes de escribir <c>Preview</c>: una fila con temporizador no pinta tarjeta y, si
/// alguien la pide por su número, se niega con la frase del envoltorio. La segunda no tiene traducción posible: este
/// host no modela los chats secretos, que es la forma <c>ChatTypeSecret</c> que TDLib usa para negarlos y que ya se
/// declaró inalcanzable en la ronda BN.
/// </para>
/// <para>
/// Y la razón de que el <c>url</c> no esté en el DTO: Android tampoco lo publica (<c>NativeSnapshot.java:218</c>
/// escribe cuatro claves y ninguna es la dirección). La dirección vive en la fila de Telegram, y el botón «Abrir
/// enlace externo» la pide por el número del mensaje (<c>message.link</c>, <c>NativeBridge.java:766</c>), que es justo
/// lo que hace <see cref="TelegramService.MessageLinkAsync"/> volviendo a leer la fila. Publicarla habría puesto en la
/// página una dirección que la persona no pidió ver.
/// </para>
/// </summary>
public static class DesktopLinkPreview
{
    /// Los dos recortes de <c>NativeSnapshot.java:218</c>, que llama a <c>limit(…,240)</c> con el título y a
    /// <c>limit(…,700)</c> con la descripción. El sitio va sin recortar, igual que allá.
    public const int TitleLimit = 240;
    public const int DescriptionLimit = 700;

    /// El nombre con el que Android registra la foto de la tarjeta (<c>NativeSnapshot.java:441</c>).
    public const string PhotoName = "Vista previa del enlace";

    /// La página ya resuelta de esa fila, o <c>null</c>. Es la guarda con la que <c>NativeBridge.java:766</c> decide
    /// si hay tarjeta: en Java es <c>link==null</c> después de comprobar el tipo de contenido.
    public static WebPage? PageOf(MessageBase? row) => row switch
    {
        Message { media: MessageMediaWebPage page } => page.webpage as WebPage,
        _ => null,
    };

    /// La foto de la página. Android la saca de <c>LinkPreviewType</c> —artículo, foto y reproductor de vídeo
    /// incrustado traen <c>Photo</c>— y aquí <c>WebPage.photo</c> es lo mismo declarado como <c>PhotoBase</c>, así que
    /// solo el <c>Photo</c> real se registra. La otra familia de Android (la miniatura del vídeo, animación,
    /// documento o audio que la página enlaza) no tiene traducción honesta aquí: en MTProto ese campo sería
    /// <c>WebPage.document</c>, que es el archivo que hay detrás de la URL y no la ilustración de la tarjeta.
    public static Photo? PhotoOf(WebPage page) => page.photo as Photo;

    public static string Title(WebPage page) => DesktopContact.Limit(page.title ?? "", TitleLimit);

    public static string Site(WebPage page) => page.site_name ?? "";

    public static string Description(WebPage page) => DesktopContact.Limit(page.description ?? "", DescriptionLimit);

    /// La dirección de la página. No sale hacia la pantalla: solo la usa el brazo de <c>message.link</c> para
    /// encauzarla por el mismo camino que <c>link.open</c> (<c>NativeBridge.java:868</c>).
    public static string Url(WebPage page) => page.url ?? "";

    /// La tarjeta ya convertida, con la foto puesta solo cuando la hay. <c>media</c> llega registrado por quien llama
    /// y con su <c>exportable</c>: Android protege la miniatura cuando el chat no deja exportar nada (la rama
    /// <c>restricted</c> de <c>NativeSnapshot.java:218</c>), y aquí lo decide <c>ConvertMessage</c> con las dos
    /// mismas banderas de MTProto.
    public static LinkPreviewDto Card(WebPage page, MediaDto? media)
    {
        var card = new LinkPreviewDto { Title = Title(page), Site = Site(page), Description = Description(page) };
        if (media != null) card.Photo = media;
        return card;
    }
}
