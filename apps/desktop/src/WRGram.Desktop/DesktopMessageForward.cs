namespace WRGram.Desktop;

/// <summary>
/// Reenviar mensajes en Windows. A la diferencia que trajo la ronda AC —borrar son dos peticiones y no son
/// simétricas— aquí le toca lo contrario: <c>messages.forwardMessages</c> es <b>una sola</b> petición y sirve
/// para privado, grupo básico, supergrupo y canal, porque el origen viaja como <c>from_peer</c> y el destino
/// como <c>to_peer</c>, ambos <c>InputPeer</c>, y los ids como enteros acompañados de <c>random_id</c>. No hay
/// que adivinar la forma de la clave para elegir el camino.
/// <para>
/// Lo que sí decide esta clase es lo que la petición puede decir y lo que no. La firma verificada contra
/// WTelegramClient 4.4.10 admite <c>silent</c>, <c>drop_author</c>, <c>drop_media_captions</c>,
/// <c>schedule_date</c> y <c>top_msg_id</c>. La programación de la hora —incluida la negativa a «cuando esté
/// en línea», que es un estado de TDLib sin campo en MTProto— vive en <see cref="DesktopSchedule"/> y es la
/// misma para <c>send.text</c> que para el reenvío, como es la misma función <c>sendOptions</c> en Android.
/// </para>
/// <para>
/// La protección de contenido se mira antes de escribir porque la librería la documenta en los tres sitios
/// donde vive: <c>Message.Flags.noforwards</c> («this message is protected and thus cannot be forwarded»),
/// <c>Chat.Flags.noforwards</c> y <c>Channel.Flags.noforwards</c> («does not allow forwarding messages from
/// it»). Las tres hablan del origen, ninguna del destino, así que el destino se deja a criterio de Telegram y
/// su error sube tal cual —inventarse una regla propia sobre el chat de llegada sería tapar la causa, como en
/// las rondas AA y AB—.
/// </para>
/// <para>
/// Queda fuera, dicho en voz alta y no callado: <c>top_msg_id</c> (reenviar a un tema de foro) existe en la
/// petición de MTProto y <c>topicId</c> existe en <c>TdApi.ForwardMessages</c>, pero la pantalla no manda el
/// tema en este flujo, así que ninguna de las dos capas lo usa. No es limitación de Telegram.
/// </para>
/// </summary>
public static class DesktopMessageForward
{
    /// El mismo tope de lote que en el borrado: <c>BridgePolicy.ids(…, 100)</c> en Android y los 100 de
    /// <c>TdSession.forwardMessages</c>. Vive una sola vez.
    public const int MaxBatch = DesktopMessageDelete.MaxBatch;

    /// Compartida con el borrado: es la frase con la que Android rechaza un lote fuera de 1..100 en los dos
    /// flujos, así que aquí tampoco hay dos copias.
    public const string BatchSize = DesktopMessageDelete.BatchSize;

    /// Copiada de <c>DesktopMessageDelete</c> por el mismo motivo: la forma del id es idéntica en las dos
    /// peticiones (enteros de 32 bits) y un id ilegible o que no cabe no se recorta en ninguna de las dos.
    public const string OutOfRange = DesktopMessageDelete.OutOfRange;
    public const string NotLoaded = DesktopMessageDelete.NotLoaded;

    /// La misma cadena con la que este host ya niega <c>media.export</c> («Telegram protege este contenido.»),
    /// porque es la misma verdad de Telegram dicha en dos botones distintos.
    public const string Protected = "Telegram protege este contenido.";

    /// Android rechaza el destino desconocido sin frase (<c>session.chat(to)==null</c> →
    /// <c>IllegalArgumentException</c> a secas), así que esta es nuestra. No se resuelve con un
    /// <c>GetDialogs</c> improvisado: sin peer no hay <c>InputPeer</c> que mandar.
    public const string NoTarget = "El destino ya no está cargado en esta sesión. Ábrelo e inténtalo de nuevo.";

    /// <c>drop_media_captions</c> solo significa algo con <c>drop_author</c>: la documentación de la petición
    /// los lista como dos banderas independientes, pero TDLib hace lo mismo (<c>removeCaption && sendCopy</c>
    /// en <c>TdSession.forwardMessages</c>), y quitar el pie a una copia que conserva al autor no es lo que la
    /// pantalla ofreció.
    public static bool DropCaptions(bool copy, bool removeCaption) => copy && removeCaption;
}
