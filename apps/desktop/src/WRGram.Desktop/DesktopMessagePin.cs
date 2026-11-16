namespace WRGram.Desktop;

using System.Linq;
using TL;

/// <summary>
/// Fijar un mensaje en Windows. TDLib lo hace con dos funciones —<c>pinChatMessage</c> y
/// <c>unpinChatMessage</c>— y una bandera por fila que él mismo calcula, <c>messageProperties.canBePinned</c>.
/// MTProto reparte lo mismo en una sola petición, <c>messages.updatePinnedMessage</c>, que lleva tres banderas:
/// <c>unpin</c> (fijar o desfijar), <c>silent</c> (sin aviso) y <c>pm_oneside</c> (solo en mi lado de un uno a
/// uno). Lo que esta clase decide es qué es honesto ofrecer antes de escribir, porque aquí no hay ninguna
/// bandera del servidor que lo diga por nosotros.
/// <para>
/// La regla de TDLib está escrita en la documentación de sus dos funciones: para un grupo básico o un
/// supergrupo hace falta el derecho de miembro <c>canPinMessages</c>, y para un canal el de administrador
/// <c>canEditMessages</c>. En el esquema de esta librería esos derechos llegan como <c>ChatAdminRights</c> en la
/// fila del canal —<c>pin_messages</c>, que es el que nombra MTProto, y <c>edit_messages</c>, que es el que
/// nombra TDLib— así que se admite cualquiera de los dos, y el creador puede siempre.
/// </para>
/// <para>
/// En un supergrupo Telegram también deja que el dueño abra el fijado a todos los miembros, y eso se sabe por
/// <c>chatDefaultBannedRights</c>. <b>Esta versión del esquema no publica ese campo</b> en <c>ChannelFull</c>,
/// así que Windows no puede saberlo y no lo promete: un miembro de un supergrupo abierto a fijar verá la
/// opción en Android y no la verá aquí. Es el lado seguro de la duda, que es el que han elegido también las
/// rondas AC y AD con los permisos de borrado.
/// </para>
/// <para>
/// Un uno a uno y un grupo básico no necesitan derecho ninguno: en el primero <c>pm_oneside</c> hace que el
/// fijado sea solo de esta cuenta —que es exactamente lo que dice la etiqueta de la pantalla, «Fijar mensaje
/// para mí», y lo que Android manda con <c>onlyForSelf:true</c>— y en el segundo la petición existe para
/// cualquier miembro. Un aviso del sistema («María añadió a Sofía») no se fija: los clientes de Telegram no lo
/// ofrecen, así que se descarta con la marca que <c>ConvertMessage</c> pone en esas filas.
/// </para>
/// <para>
/// Queda fuera, dicho en voz alta: <c>messages.getPinnedMessages</c> no existe en este esquema —solo está la
/// bandera <c>Message.Flags.pinned</c> y el <c>pinned_msg_id</c> de la información completa—, así que aquí
/// <b>un mensaje fijado por conversación</b>, no una lista. La pantalla no pregunta <c>pinned.list</c> en
/// escritorio porque <c>rondaAF.test.ts</c> lo comprueba.
/// </para>
/// <para>
/// La frase con la que se niega la acción está copiada carácter a carácter de <c>NativeBridge.java</c>, que es
/// donde Android la escribe en su <c>Toast</c>.
/// </para>
/// </summary>
public static class DesktopMessagePin
{
    /// Copiada de <c>NativeBridge.java</c> (el <c>else</c> de <c>messageAction</c>), que es lo que Android
    /// responde cuando <c>canBePinned</c> es falso: la petición existe, pero Telegram no la admite aquí.
    public const string Refused = "Telegram no permite esta acción sobre el mensaje.";

    /// Lo que responde el puente cuando la pantalla pide la lista de fijados. No es un «todavía no está
    /// conectado»: en este esquema no hay petición, y inventar la lista con el mensaje del ancla sería decir
    /// que no hay más de los que en realidad hay.
    public const string NoList =
        "El protocolo de escritorio no tiene petición para listar los mensajes fijados; aquí se puede consultar y quitar el fijado de esta conversación.";

    /// Un uno a uno y un básico admiten el fijado con la misma petición; un canal, solo con los derechos que
    /// Telegram dio. Sin fila de canal —recortada por <c>min</c>, o con la cuenta ya fuera— no se promete nada
    /// que el servidor vaya a rechazar.
    public static bool CanPin(DesktopMessageDelete.Kind kind, MessageDto? row, Channel? channel)
    {
        if (row == null || row.ServiceNotice) return false;
        return kind switch
        {
            DesktopMessageDelete.Kind.Private or DesktopMessageDelete.Kind.Basic => true,
            DesktopMessageDelete.Kind.Channel => ChannelRightsToPin(channel),
            _ => false,
        };
    }

    /// El creador de un canal puede con todo; un administrador, solo si Telegram dijo que puede fijar. Es la
    /// misma lectura de <c>Channel.Flags</c> y <c>ChatAdminRights.Flags</c> que hace
    /// <see cref="DesktopMessageDelete.ChannelRightsToDelete"/>, con los dos derechos que las dos
    /// documentaciones nombran para esta petición.
    public static bool ChannelRightsToPin(Channel? channel)
    {
        if (channel == null) return false;
        if ((channel.flags & Channel.Flags.left) != 0) return false;
        if ((channel.flags & Channel.Flags.creator) != 0) return true;
        if ((channel.flags & Channel.Flags.min) != 0) return false;
        if ((channel.flags & Channel.Flags.has_admin_rights) == 0) return false;
        var rights = channel.admin_rights!.flags;
        return (rights & ChatAdminRights.Flags.pin_messages) != 0 || (rights & ChatAdminRights.Flags.edit_messages) != 0;
    }

    /// Las banderas que siempre manda el puente, en las dos direcciones. <c>silent</c> y <c>pm_oneside</c> son
    /// las dos <c>true</c> de <c>PinChatMessage(chatId, messageId, true, true)</c> en Android, y en MTProto la
    /// segunda no tiene efecto fuera de un uno a uno, igual que <c>onlyForSelf</c> en TDLib.
    public const bool Silent = true;
    public const bool OneSide = true;
}
