using System.Linq;
using TL;

namespace WRGram.Desktop;

/// <summary>
/// El nombre y la descripción de una comunidad en Windows. En Android son tres decisiones repartidas: la longitud la
/// fija <c>ChatEditing</c> (`ChatEditing.java:11-13`, 128 y 255), quién puede escribirlas la decide
/// <c>ChatEditing.canChange</c> (`:35-56`, tres caminos que no se parecen entre sí) y el orden de los guardajes vive en
/// <c>NativeBridge.setChatInfo</c> (<c>NativeBridge.java:1963-1987</c>). Aquí esas tres decisiones están escritas una
/// vez, con las frases copiadas carácter a carácter, y el cable solo pide y compara.
/// <para>
/// La medida, hecha por reflexión sobre WTelegramClient 4.4.10: la descripción no está en el chat sino en el
/// <c>full info</c>, y esa respuesta tiene <b>tres</b> formas —<c>Messages_ChatFull.full_chat</c> es
/// <c>ChatFullBase</c>, que en la librería se materializa en <c>TL.ChatFull</c> (el básico, con <c>about</c> y con su
/// tabla de participantes), en <c>TL.ChannelFull</c> (canal y supergrupo, con <c>about</c>) o en
/// <c>TL.CommunityFull</c> (la comunidad ya migrada, también con <c>about</c> pero sin tabla)—. Escribir el nombre son
/// <b>dos</b> peticiones según la forma del peer —<c>Channels_EditTitle(Client, InputChannelBase, string)</c> y
/// <c>Messages_EditChatTitle(Client, long, string)</c>— mientras la descripción es una sola para los dos mundos
/// (<c>Messages_EditChatAbout(Client, InputPeer, string)</c>). TDLib, en cambio, sirve <c>SetChatTitle</c> y
/// <c>SetChatDescription</c> para todo. Esa asimetría es lo único que el cable decide; todo lo demás está abajo.
/// </para>
/// <para>
/// Y una divergencia entre capas, escrita en lugar de fingida. Android comprueba el permiso con un
/// <c>GetChatMember</c> vivo (<c>:1951</c>) antes de escribir; MTProto no tiene una petición que pregunte «qué puedo
/// hacer yo en este chat», y el testigo son las banderas que Telegram manda con el peer:
/// <c>Channel.admin_rights</c> y <c>Chat.admin_rights</c> con su <c>flags.change_info</c>, más <c>creator</c>,
/// <c>left</c> y <c>default_banned_rights</c>. En la descripción ese testigo llega fresco, porque la lectura que hay
/// que hacer de todos modos (<c>Messages_ChatFull.chats</c>) trae el peer renovado; en el título no hay otra lectura
/// que la que ya trajo la lista de conversaciones, así que Windows responde con lo que Telegram dijo la última vez
/// que la refrescó. La consecuencia es una ida a la red de menos, no un permiso inventado: si la bandera estuviera
/// vieja, quien escribe sin derecho recibe el rechazo de Telegram, no un falso <see cref="NoRight"/>.
/// </para>
/// </summary>
public static class DesktopCommunityInfo
{
    /// <c>ChatEditing.MAX_TITLE</c> (`ChatEditing.java:12`).
    public const int MaxTitle = 128;

    /// <c>ChatEditing.MAX_DESCRIPTION</c> (`ChatEditing.java:13`).
    public const int MaxDescription = 255;

    /// El tope con el que <c>BridgePolicy.text</c> recibe los dos campos en <c>setChatInfo</c>
    /// (<c>NativeBridge.java:1968</c> y <c>:1947</c>). El límite de Telegram es menor, pero el puente java rechaza
    /// antes, y ese rechazo es la frase <see cref="TooLong"/>.
    public const int BridgeMaximum = 1024;

    /// Los dos topes con los que Android corta los textos del diálogo (<c>NativeBridge.java:2014</c> y <c>:1994</c>);
    /// <c>NativeSnapshot.limit</c> está definido en <c>NativeSnapshot.java:552</c>.
    public const int TitleShown = 64;
    public const int DescriptionShown = 96;

    /// <c>COMMUNITY_UNSUPPORTED</c> (<c>NativeBridge.java:1917</c>).
    public const string Unsupported = "El nombre y la descripción solo se editan en grupos, supergrupos y canales.";

    /// <c>COMMUNITY_NO_RIGHT</c> (<c>NativeBridge.java:1918</c>).
    public const string NoRight =
        "Telegram no concede a esta cuenta permiso para cambiar la información de la comunidad.";

    /// <c>COMMUNITY_CHANGED</c> (<c>NativeBridge.java:1919</c>).
    public const string Changed = "La información cambió en otro dispositivo. Vuelve a abrirla antes de guardar.";

    /// <c>COMMUNITY_UNREADABLE</c> (<c>NativeBridge.java:1920</c>).
    public const string Unreadable = "Telegram no devolvió la descripción actual de la comunidad. Vuelve a intentarlo.";

    /// El <c>catch</c> que sigue a <c>BridgePolicy.text</c> del campo nuevo (<c>NativeBridge.java:1968-1969</c>). Es
    /// la frase con la que Android cubre las dos causas —que el texto no quepa y que la clave no sea una cadena—, así
    /// que aquí tampoco se separan.
    public const string TooLong = "Ese texto es demasiado largo para enviarlo a Telegram.";

    /// Las cuatro cadenas de <c>ChatEditing.problem</c> (`ChatEditing.java:64-76`), en el mismo orden de comprobación.
    public const string EmptyTitle = "Telegram no guarda comunidades sin nombre: escribe un título de al menos un carácter.";
    public const string TitleTooLong = "Telegram admite nombres de hasta 128 caracteres.";
    public const string DescriptionTooLong = "Telegram admite descripciones de hasta 255 caracteres.";
    public const string UnknownField = "Ese campo no se puede cambiar desde WRGram.";

    /// El <c>La cuenta cambió. No se modificó la comunidad.</c> de los dos guardadores del diálogo
    /// (<c>NativeBridge.java:2006</c> y <c>:2022</c>).
    public const string ChangedAccount = "La cuenta cambió. No se modificó la comunidad.";

    /// Las tres palabras del <c>AlertDialog</c> de Android (<c>NativeBridge.java:2018-2021</c>) y el sufijo que
    /// Android pega al cuerpo en los dos casos.
    public const string DialogTitle = "Guardar en Telegram";
    public const string DialogAccept = "Aplicar en Telegram";
    public const string DialogCancel = "Cancelar";
    public const string DialogSuffix = " El cambio se envía a Telegram.";

    /// <c>ChatEditing.supported</c> (`ChatEditing.java:22`): básico y supergrupo —con canal dentro, porque TDLib
    /// guarda el canal como un supergrupo con <c>isChannel</c>—. No lo están el uno a uno, el secreto ni Guardados,
    /// y esa es la única negación de este flujo que el puente decide sin preguntarle a Telegram.
    public static bool Supported(DesktopMembership.Kind kind) => kind != DesktopMembership.Kind.Unsupported;

    /// <c>ChatEditing.prepared</c> (`ChatEditing.java:80`), que es <c>String.trim()</c> de Java: recorta solo los
    /// caracteres con código menor o igual que el espacio. <c>string.Trim()</c> de C# recorta además los espacios
    /// Unicode —un título con un separador de no salto por delante sobraba allí y sobraría aquí—, así que la regla
    /// se escribe a mano para que el texto que guarda Telegram sea el mismo en las dos capas.
    public static string Prepared(string value)
    {
        var start = 0;
        var end = value.Length;
        while (start < end && value[start] <= ' ') start++;
        while (end > start && value[end - 1] <= ' ') end--;
        return value[start..end];
    }

    /// <c>text.codePointCount(0, text.length())</c> de `ChatEditing.java:66`: Telegram cuenta caracteres, no
    /// unidades UTF-16, así que un emoji vale uno aquí y vale uno allí. <c>string.Length</c> daría dos.
    public static int Characters(string value) => value.EnumerateRunes().Count();

    /// <c>ChatEditing.problem</c> (`:64-76`). Se comprueba el texto ya recortado, bordes fuera, y el campo
    /// desconocido se niega al final, igual que allá.
    public static string? Problem(string field, string value)
    {
        var text = Prepared(value);
        var length = Characters(text);
        if (field == "title")
        {
            if (length == 0) return EmptyTitle;
            return length > MaxTitle ? TitleTooLong : null;
        }
        if (field == "description")
        {
            return length > MaxDescription ? DescriptionTooLong : null;
        }
        return UnknownField;
    }

    /// La descripción que Telegram guarda en el <c>full info</c>. Las tres formas medidas del <c>ChatFullBase</c>
    /// traen <c>about</c>; una respuesta que no sea ninguna de las tres no dice nada, y <see cref="Readable"/> es la
    /// que lo advierte. Sin el brazo del canal —el más común de los tres— la ficha de un supergrupo se cerraba con
    /// <c>descriptionKnown=false</c> y cualquier escritura se negaba con <see cref="Changed"/>.
    public static string Description(ChatFullBase? full) => full switch
    {
        ChatFull basic => basic.about ?? "",
        ChannelFull channel => channel.about ?? "",
        CommunityFull forum => forum.about ?? "",
        _ => ""
    };

    /// Si la descripción que llega es la de Telegram o no llegó ninguna de las tres formas. En Android es el
    /// <c>known</c> de <c>sendCommunity</c> (<c>NativeBridge.java:1950</c> y <c>:1918</c>): la lectura falla y el
    /// campo se cierra con <c>descriptionKnown=false</c> en vez de ofrecer un vacío que borraría lo que la persona no
    /// llegó a ver.
    public static bool Readable(ChatFullBase? full) => full is ChatFull or ChannelFull or CommunityFull;

    /// <c>ChatEditing.canChange</c> (`:35-56`) traducido a las banderas que MTProto manda con el peer.
    /// <list type="number">
    /// <item><description>El creador mientras siga dentro: TDLib lo dice con <c>ChatMemberStatusCreator.isMember</c>;
    /// MTProto con <c>creator</c> sin <c>left</c> —y, en un básico, sin <c>deactivated</c>, que es la otra forma de
    /// estar fuera.</description></item>
    /// <item><description>El administrador con el derecho explícito: el <c>rights.canChangeInfo</c> de TDLib es el
    /// <c>ChatAdminRights.flags.change_info</c> de MTProto, y el objeto solo cuenta si el peer trae además la bandera
    /// <c>has_admin_rights</c>.</description></item>
    /// <item><description>El miembro ordinario de un <b>básico</b>: allá es <c>chat.permissions.canChangeInfo</c>,
    /// que calcula el servidor; aquí no hay permisos por fila y lo que hay es el revés —la tabla de lo que el grupo
    /// quita a todo el que no sea administrador, <c>Chat.default_banned_rights</c>—. Sin esa prohibición, un miembro
    /// de un básico puede renombrar. En un canal o supergrupo la respuesta es falsa, que es lo mismo que deciden
    /// `ChatEditing.java:47` y <c>:52</c>.</description></item>
    /// </list>
    /// <para>
    /// Queda fuera, dicho en vez de imitado: el tercer camino de Android mira además el permiso propio de un miembro
    /// <b>restringido</b> de un básico (`ChatEditing.java:43-49`). En MTProto la restricción por persona no existe en
    /// los básicos —<c>TL.Chat</c> no trae <c>banned_rights</c>, y la lista de participantes del básico solo conoce
    /// creador, administrador y miembro—, así que no hay dato que leer y el caso cae en la regla general.
    /// </para>
    /// <para>
    /// Tampoco hay derechos que leer en <c>ChannelForbidden</c> ni en <c>ChatForbidden</c>, las formas recortadas con
    /// que Telegram responde cuando el chat no se puede abrir: falsa es la única respuesta honesta, y la pantalla
    /// cierra los dos campos con <see cref="NoRight"/>.
    /// </para>
    public static bool CanChange(ChatBase? entity) => entity switch
    {
        Channel channel => (channel.flags & Channel.Flags.left) == 0
            && ((channel.flags & Channel.Flags.creator) != 0
                || HasRights(channel.flags, Channel.Flags.has_admin_rights) && ChangeInfo(channel.admin_rights)),
        Chat basic => !Outside(basic) && ((basic.flags & Chat.Flags.creator) != 0
            || HasRights(basic.flags, Chat.Flags.has_admin_rights) && ChangeInfo(basic.admin_rights)
            // El tercer camino, y el único que necesita una regla aparte: en un básico el miembro ordinario puede
            // renombrar salvo que el grupo lo prohíba por defecto. Que el peer sea un `TL.Chat` es la prueba de que
            // esto es un básico —allá lo es `chat.type instanceof ChatTypeBasicGroup`—, así que la forma del entity
            // sustituye a la del chat y la tabla de prohibiciones es la de MTProto, no la de TDLib.
            || !BarsChangeInfo(basic)),
        _ => false
    };

    private static bool Outside(Chat basic) =>
        (basic.flags & Chat.Flags.left) != 0 || (basic.flags & Chat.Flags.deactivated) != 0;

    private static bool ChangeInfo(ChatAdminRights? rights) =>
        rights != null && (rights.flags & ChatAdminRights.Flags.change_info) != 0;

    /// La prohibición por defecto del básico, leída del revés que en Android: MTProto guarda lo prohibido y TDLib
    /// lo permitido (`ChatEditing.java:46`). Sin la bandera <c>has_default_banned_rights</c> no hay tabla, y sin
    /// tabla el miembro ordinario sí puede.
    private static bool BarsChangeInfo(Chat basic) =>
        (basic.flags & Chat.Flags.has_default_banned_rights) != 0
        && basic.default_banned_rights != null
        && (basic.default_banned_rights.flags & ChatBannedRights.Flags.change_info) != 0;

    /// La bandera de presencia de un campo: en MTProto los derechos del propio usuario solo valen si el peer avisa
    /// de que los trae.
    private static bool HasRights(Channel.Flags flags, Channel.Flags present) => (flags & present) != 0;

    private static bool HasRights(Chat.Flags flags, Chat.Flags present) => (flags & present) != 0;

    /// El cuerpo del diálogo cuando lo que cambia es el nombre (<c>NativeBridge.java:2014</c>).
    public static string TitleBody(string current, string prepared) =>
        $"El nombre de la comunidad pasará de «{DesktopContact.Limit(current, TitleShown)}» a "
        + $"«{DesktopContact.Limit(prepared, TitleShown)}». Todas las personas que estén dentro verán el nombre nuevo."
        + DialogSuffix;

    /// Y cuando cambia la descripción: las dos caras del ternario de <c>NativeBridge.java:2013-2017</c>, que avisa
    /// distinto según el texto nuevo borre o escriba. Allá el cuerpo no menciona la descripción vieja, así que
    /// aquí tampoco se le añade una que nadie lee.
    public static string DescriptionBody(string prepared) =>
        (prepared.Length == 0
            ? "Se quitará la descripción que Telegram muestra en la información de la comunidad."
            : $"La descripción que Telegram muestra en la información de la comunidad pasará a ser "
              + $"«{DesktopContact.Limit(prepared, DescriptionShown)}».")
        + DialogSuffix;
}
