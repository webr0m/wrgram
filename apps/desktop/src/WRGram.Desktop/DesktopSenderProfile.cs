namespace WRGram.Desktop;

using System;
using TL;

/// <summary>
/// Las reglas de «ver la ficha de quien envió un mensaje», que en Android son <c>senderProfile</c>
/// (<c>NativeBridge.java:1594-1612</c>) y <c>respondProfilePeer</c> (<c>:1613-1616</c>). Aquí vive lo que se puede
/// afirmar sin conexión; el cable está en <c>DesktopSenderProfileFlow.cs</c>.
/// <para>
/// Las dos frases negativas vienen de Java. La del paquete que Android agrupa —no hay fila, la fila es de otro chat,
/// el chat no está, es secreto, o el mensaje lleva temporizador— es la misma que ya escribía la ronda BA en
/// <see cref="DesktopPeerProfile.Secret"/> (<c>NativeBridge.java:1601</c>), así que se llama y no se copia. La del
/// remitente que Telegram no identificó (<c>NativeBridge.java:1611</c>) sí se copia carácter a carácter. La tercera
/// negación que la pantalla puede llegar a leer es la del <c>access_hash</c>
/// (<see cref="DesktopPeerProfile.NoHash"/>), y es propia de Windows por la misma razón que la escribió la ronda BA:
/// TDLib guarda los hashes en casa y MTProto los manda en las respuestas.
/// </para>
/// <para>
/// Tres diferencias de protocolo, medidas antes de escribir esta clase y ninguna imitada. La primera: Android lee la
/// fila de su almacén de TDLib y, si no está, de la última búsqueda; este host no guarda las filas crudas —solo los
/// DTO que ya pintó—, así que la petición <c>messages.getMessages</c> no es un lujo, es la única fuente. La segunda:
/// la guarda <c>message.chatId!=chatId</c> (<c>:1600</c>) aquí se cumple por construcción, porque la propia petición va
/// dirigida al peer del chat. La tercera: los chats secretos no existen en MTProto, así que la rama de <c>:1600</c> que
/// los niega no tiene quién la diga, igual que declaró la ronda BN.
/// </para>
/// </summary>
public static class DesktopSenderProfile
{
    /// <c>NativeBridge.java:1601</c>, con el mismo texto para las seis guardas que Android agrupa en un <c>if</c>. La
    /// literal ya vivía en <see cref="DesktopPeerProfile.Secret"/>, que la tomó de esa misma línea: se llama, no se
    /// vuelve a escribir.
    public const string NoProfile = DesktopPeerProfile.Secret;

    /// <c>NativeBridge.java:1611</c>: la fila no trae <c>from_id</c>, o trae una forma de peer que este host no sabe
    /// traducir a ficha. En MTProto el emisor anónimo de un canal sí viene identificado (es el propio canal), así que
    /// esta negativa es para una fila a la que Telegram no le puso autor.
    public const string UnknownSender = "Telegram no identificó al remitente.";

    /// El <c>from_id</c> de la fila. MTProto lo declara por separado en <see cref="Message"/> y en
    /// <see cref="MessageService"/> —los dos descienden de <see cref="MessageBase"/>, que no lo tiene—, y la ficha del
    /// remitente tiene que poder leer a una persona que hizo una acción de servicio, que es justo lo que Android hace
    /// al no filtrar el tipo de fila en <c>:1597</c>.
    public static TL.Peer? SenderOf(MessageBase? row) => row switch
    {
        Message message => message.from_id,
        MessageService service => service.from_id,
        _ => null,
    };

    /// El efímero que Android ve como <c>selfDestructType</c> o <c>ephemeralContent</c> (<c>:1600</c>) llega a MTProto
    /// como <c>ttl_period</c>: el temporizador que Telegram asignó a esa fila, en segundos, y que solo está cuando la
    /// bandera <c>has_ttl_period</c> está puesta. Se comprueba el número y no la bandera por la misma razón que la
    /// ronda AS comprueba los ceros: un <c>0</c> aquí significa «sin temporizador», no «con temporizador de cero».
    public static bool IsEphemeral(MessageBase? row) => row switch
    {
        Message message => message.ttl_period > 0,
        MessageService service => service.ttl_period > 0,
        _ => false,
    };

    /// La fila con ese número dentro de lo que Telegram respondió, o <c>null</c>. Android compara el identificador
    /// después de leer (<c>:1600</c>); aquí la comparación es la misma, y no sobra: un <c>getMessages</c> de un id
    /// borrado responde una lista vacía, y eso no es un perfil.
    public static MessageBase? Row(MessageBase[]? rows, long id)
    {
        if (rows == null) return null;
        foreach (var row in rows)
            if (row != null && row.ID == id) return row;
        return null;
    }
}
