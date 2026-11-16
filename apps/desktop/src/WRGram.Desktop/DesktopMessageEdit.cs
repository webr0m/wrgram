namespace WRGram.Desktop;

using System.Linq;
using TL;

/// <summary>
/// Editar el texto de un mensaje propio en Windows. TDLib decide con una bandera que él mismo calcula,
/// <c>messageProperties.canBeEdited</c>, y la pantalla la pregunta dos veces: <c>edit</c> —texto de un mensaje
/// de texto— y <c>editCaption</c> —el texto pegado a una foto, un vídeo o un archivo—. MTProto reparte lo
/// mismo en <c>messages.editMessage</c>, que es **una** petición con dos caras: si solo cambia el texto se deja
/// <c>media</c> vacío, y si cambia el texto del archivo hay que volver a mandarle el archivo entero.
/// <para>
/// Esta clase decide la cara y si es honesto ofrecerla. Hasta la ronda AH, <c>Properties</c> publicaba
/// <c>edit:false</c> y <c>editCaption:false</c> a secas: la misma mentira de la matriz de capacidades que la
/// ronda AC destapó con el borrado, por la que la pantalla de escritorio nunca ofrecía editar un mensaje
/// propio aunque la petición exista y sea la más corriente del protocolo.
/// </para>
/// <para>
/// La segunda cara es la que obliga a leer el mensaje otra vez antes de escribir. <c>messages.editMessage</c>
/// no hace un parcheo: lo que no se manda se pierde, así que editar el pie de una foto sin llevar la foto
/// borraría la foto. De ahí que el puente pida la fila a Telegram (<c>GetMessages</c>) y construya el
/// <c>InputMedia</c> con el objeto que el propio Telegram devolvió —con su <c>access_hash</c> y su
/// <c>file_ref</c> actuales— en vez de reconstruirlo desde lo que la interfaz pintó hace un rato.
/// </para>
/// <para>
/// El derecho no lo dice el contenido sino la autoría y, en un canal, lo que Telegram dio: <c>edit_messages</c>.
/// Es la misma lectura de banderas que hacen <see cref="DesktopMessageDelete"/> y
/// <see cref="DesktopMessagePin"/>, con el nombre que la documentación de MTProto usa para esta petición. En
/// privado y en grupo básico no hay derecho que pedir: quien escribió puede con lo suyo y con nada más.
/// </para>
/// <para>
/// La frase con la que se niega la acción está copiada carácter a carácter del <c>else</c> de
/// <c>NativeBridge.messageAction</c>, que es lo que Android responde cuando <c>canBeEdited</c> falló o la
/// clase del contenido no era la que la petición esperaba.
/// </para>
/// </summary>
public static class DesktopMessageEdit
{
    public const string Refused = "Telegram no permite esta acción sobre el mensaje.";

    /// Los dos topes que <c>BridgePolicy.text</c> impone en Android: 4096 para el texto y 1024 para el pie.
    public const int MaxText = 4096;
    public const int MaxCaption = 1024;

    /// Android lanza <c>Invalid text</c> al pasarse del tope; aquí se dice en español, como hizo la ronda T
    /// con las otras dos condiciones que el puente java comunicaba en inglés.
    public static string TooLong(int maximum) => $"El texto supera los {maximum} caracteres que acepta Telegram.";

    /// Vaciar el pie de un archivo sí cabe: <c>TextEntry</c> lo ofrece con <c>allowEmpty</c> y Telegram deja un
    /// adjunto sin texto. Vaciar el mensaje de un mensaje de texto no: no queda nada en la fila y el servidor
    /// responde con un 400. La pantalla deja pulsar «Guardar en Telegram» con la casilla limpia en los dos
    /// casos —el campo es multilínea y <c>TextEntry</c> solo bloquea el vacío en los de una línea—, así que el
    /// no lo dice el puente, en español y antes de mandar nada.
    public static bool AllowsBlank(bool caption) => caption;

    public const string Blank = "Un mensaje de texto no puede quedarse vacío; escríbele algo o bórralo.";

    /// Las tres faltas que solo se descubren leyendo la fila, que es lo que obliga a pedir el mensaje antes de
    /// escribir: <c>messages.editMessage</c> reemplaza, no parchea, y mandar a ciegas lo que la pantalla pintó
    /// hace un rato es la forma más limpia de perder un archivo.
    public const string Gone = "El mensaje ya no está en Telegram, así que no se editó nada.";
    public const string NotRead = "No se pudo leer el mensaje en Telegram antes de editarlo, así que no se cambió nada.";
    public const string Changed = "El mensaje cambió en Telegram desde que lo ves, así que no se editó. Vuelve a intentarlo.";

    /// El archivo que hay que volver a mandar para cambiar solo su pie. <c>ToInputMedia()</c> lo construye con
    /// el <c>access_hash</c> y el <c>file_ref</c> de la fila que Telegram acaba de devolver, que es la única
    /// forma válida: los que llegaron con el historial de hace un rato ya pueden estar caducados.
    public static InputMedia? MediaOf(MessageMedia? media) => media switch
    {
        MessageMediaPhoto photo => photo.ToInputMedia(),
        MessageMediaDocument document => document.ToInputMedia(),
        _ => null,
    };

    /// El exceso de caracteres lo rechazaría Telegram con un 400 genérico; aquí se corta antes de mandar.
    public static bool Fits(string value, int maximum) => value.Length <= maximum;

    /// Texto de un mensaje de texto: con derechos sobre la fila y sin archivo pegado. Un aviso del sistema no
    /// se edita, y en un canal la autoría no basta —ahí manda <c>edit_messages</c>—.
    public static bool CanEditText(MessageDto? row, DesktopMessageDelete.Kind kind, Channel? channel)
    {
        if (row == null || row.ServiceNotice || row.Media != null) return false;
        return row.Outgoing || (kind == DesktopMessageDelete.Kind.Channel && ChannelRightsToEdit(channel));
    }

    /// El texto de un archivo: los mismos derechos y, encima, una fila que de verdad lleve pie. Lo decide la
    /// conversión (<see cref="MessageDto.HasCaption"/>), que es donde se ve la clase real del objeto de
    /// Telegram; aquí no se adivina por el mime.
    public static bool CanEditCaption(MessageDto? row, DesktopMessageDelete.Kind kind, Channel? channel)
    {
        if (row == null || row.ServiceNotice || !row.HasCaption) return false;
        return row.Outgoing || (kind == DesktopMessageDelete.Kind.Channel && ChannelRightsToEdit(channel));
    }

    /// En un canal, la cuenta puede editar mensajes ajenos si Telegram dijo <c>edit_messages</c>; la creadora
    /// puede siempre. Sin fila de canal —recortada por <c>min</c>, o con la cuenta ya fuera— no se promete
    /// nada que el servidor vaya a rechazar.
    public static bool ChannelRightsToEdit(Channel? channel)
    {
        if (channel == null) return false;
        if ((channel.flags & Channel.Flags.left) != 0) return false;
        if ((channel.flags & Channel.Flags.creator) != 0) return true;
        if ((channel.flags & Channel.Flags.min) != 0) return false;
        if ((channel.flags & Channel.Flags.has_admin_rights) == 0) return false;
        return (channel.admin_rights!.flags & ChatAdminRights.Flags.edit_messages) != 0;
    }

    /// Los dos tipos de archivo que admiten pie, dichos por la lista de clases que usa <c>hasCaption</c> en
    /// Android —foto, vídeo, animación, documento y audio— y por lo que MTProto devuelve realmente: un sticker
    /// y una nota de voz llegan también como documento, y los dos se quedan fuera.
    public static bool HasCaption(MessageMedia? media) => media switch
    {
        MessageMediaPhoto => true,
        MessageMediaDocument { document: Document document } => !Uncaptioned(document),
        _ => false,
    };

    private static bool Uncaptioned(Document document)
    {
        var attributes = document.attributes ?? [];
        if (attributes.Any(attribute => attribute is DocumentAttributeSticker)) return true;
        return attributes.Any(attribute => attribute is DocumentAttributeAudio audio &&
                                           (audio.flags & DocumentAttributeAudio.Flags.voice) != 0) ||
               attributes.Any(attribute => attribute is DocumentAttributeVideo video &&
                                           (video.flags & DocumentAttributeVideo.Flags.round_message) != 0);
    }
}
