namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using TL;

/// <summary>
/// Las reglas de la ficha de perfil en Windows: <c>chat.profile</c> (<c>NativeBridge.java:535</c> →
/// <c>chatProfile</c>, <c>:1219-1266</c>), <c>profile.related</c> (<c>:525</c> → <c>profileRelated</c>,
/// <c>:1570-1593</c> y <c>profileMembers</c>, <c>:1594-1609</c>) y las dos filas que esa pestaña abre,
/// <c>profile.peer</c> (<c>:524</c>) y <c>profile.contact</c> (<c>:527</c>), todas ellas terminando en
/// <c>respondProfilePeer</c> (<c>:1629-1632</c>).
/// <para>
/// La medida, hecha por reflexión sobre WTelegramClient 4.4.10, es la que parte el trabajo en tres y no en dos:
/// TDLib sirve <c>GetUserFullInfo</c>, <c>GetSupergroupFullInfo</c> y <c>GetBasicGroupFullInfo</c> con los mismos
/// nombres de campo; MTProto reparte lo mismo entre cuatro respuestas distintas —<c>Users_GetFullUser</c> devuelve
/// <c>users.UserFull</c> (con <c>about</c>, <c>bot_info</c>, <c>common_chats_count</c>, <c>settings</c> y
/// <c>birthday</c>), <c>Channels_GetFullChannel</c> devuelve <c>messages.chatFull</c> cuyo <c>full_chat</c> es
/// <c>TL.ChannelFull</c> (<c>about</c>, <c>participants_count</c>, <c>admins_count</c>, la bandera
/// <c>can_view_participants</c> y <c>linked_chat_id</c>), y <c>Messages_GetFullChat</c> para el básico puede
/// materializar <c>TL.ChatFull</c> —el legado, con su <c>participants: ChatParticipants</c>— o
/// <c>TL.CommunityFull</c>, que describe la comunidad migrada y no trae tabla—. Las cifras del básico salen por lo
/// tanto de la tabla cuando existe, y de <c>TL.Chat.participants_count</c> cuando Telegram ya la borró del full.
/// </para>
/// <para>
/// Y una cosa que la librería <b>no</b> da, escrita en lugar de perseguida: TDLib publica
/// <c>hasPostedToProfileStories</c> y MTProto manda <c>PeerStories</c> entero, así que la bandera de «historias del
/// perfil» no se inventa aquí y la pantalla simplemente no la ofrece. Lo mismo con las entidades de la biografía:
/// <c>about</c> es una cadena sin <c>MessageEntity</c> ninguno, de modo que <c>bioEntities</c> sale vacío en los
/// tres tipos de chat y <c>bio</c> se pinta como texto.
/// </para>
/// </summary>
public static class DesktopPeerProfile
{
    /// <c>profileRelated</c> (<c>NativeBridge.java:1574</c>) cierra así el tipo de chat que no tiene lista.
    public const string NoList = "No hay una lista de participantes para este chat.";

    /// <c>senderProfile</c> (<c>NativeBridge.java:1614</c>): un chat secreto no tiene ficha que abrir.
    public const string Secret = "Este perfil no está disponible.";

    /// <c>chatProfile</c>/<c>sendPublicChatProfile</c> (<c>:1248</c> y <c>:1286</c>) cuando armar el objeto falla.
    public const string LoadFailed = "No se pudo cargar el perfil público.";

    /// La negación propia de Windows, como la de la ronda AZ: en MTProto cada escritura y cada ficha de persona
    /// necesitan el <c>access_hash</c> que TDLib guarda en casa. Un peer recortado (<c>min</c>) no lo trae, y
    /// mandar un cero es recibir un <c>USERNAME_INVALID</c>/<c>PEER_ID_INVALID</c> que la pantalla no sabría
    /// traducir. No tiene gemelo en Java porque en Android la situación no existe.
    public const string NoHash =
        "Telegram no dio los datos necesarios para abrir esta ficha. Vuelve a abrirla desde la conversación e inténtalo de nuevo.";

    /// Las cinco cadenas de <c>presence</c> (<c>NativeBridge.java:1563-1573</c>), copiadas carácter a carácter.
    public const string Online = "En línea";
    public const string OfflinePrefix = "Última vez ";
    public const string Recently = "Últ. vez recientemente";
    public const string LastWeek = "Últ. vez esta semana";
    public const string LastMonth = "Últ. vez este mes";

    /// <c>profileRelated</c> recorta el desplazamiento a <c>[0, 5000]</c> (<c>:1572</c>) y las dos listas piden
    /// treinta filas: <c>GetGroupsInCommon(…, 30)</c> (<c>:1576</c>) y <c>SupergroupMembersFilterRecent</c> con
    /// <c>30</c> (<c>:1590</c>).
    public const int MaxOffset = 5000;
    public const int Page = 30;

    /// El cursor con el que <c>profileRelated</c> sigue las conversaciones en común: Android manda el identificador
    /// del último chat devuelto y <c>"0"</c> cuando la página vino corta (<c>:1583</c>). Aquí el identificador es el
    /// peer de Telegram, que llega recortado (<see cref="NoHash"/>), así que el cursor es numérico y en cadena.
    public static string Cursor(IEnumerable<ChatBase> chats, int count)
    {
        long last = 0;
        foreach (var chat in chats) last = chat.ID;
        return count == Page ? last.ToString() : "0";
    }

    /// <c>Math.max(0, Math.min(5000, offset))</c> de <c>:1572</c>.
    public static int Offset(long value) => (int)Math.Clamp(value, 0, MaxOffset);

    /// Los usuarios públicos activos, que es lo que Android saca de <c>usernames.activeUsernames</c>
    /// (<c>:1227</c> y <c>:1270</c>). En MTProto la misma selección es la bandera <c>active</c> de cada
    /// <c>TL.Username</c>; el primero de la lista es el primario, igual que allá.
    public static List<string> ActiveUsernames(Username[]? values)
    {
        var list = new List<string>();
        if (values == null) return list;
        foreach (var value in values)
            if (value != null && (value.flags & Username.Flags.active) != 0 && value.username.Length > 0) list.Add(value.username);
        return list;
    }

    /// <c>presence</c> (<c>NativeBridge.java:1563-1573</c>). Android compara segundos de época contra
    /// <c>System.currentTimeMillis()/1000</c>; MTProto entrega <c>DateTime</c> en las dos marcas, así que el reloj
    /// entra igual de fresco y un <c>UserStatusOnline</c> ya caducado no dice «En línea». La condición de «hay
    /// momento» es la misma de allá (<c>at&gt;0</c>): el reloj de Unix.
    /// <para>
    /// La única libertad que aquí se toma es el molde de la fecha. Android usa el <c>DateFormat.SHORT</c> del
    /// idioma del sistema; Windows fija <c>d/M/yyyy, HH:mm</c>, que es el mismo molde corto en español sin depender
    /// de la cultura instalada. El prefijo «Última vez » y las otras cuatro cadenas sí son idénticas.
    /// </para>
    /// </summary>
    public static string Presence(UserStatus? status, DateTime now)
    {
        switch (status)
        {
            case UserStatusOnline online when online.expires > now: return Online;
            case UserStatusOffline offline when offline.was_online > DateTime.UnixEpoch:
                return OfflinePrefix + offline.was_online.ToString("d/M/yyyy, HH:mm");
            case UserStatusRecently: return Recently;
            case UserStatusLastWeek: return LastWeek;
            case UserStatusLastMonth: return LastMonth;
            default: return "";
        }
    }

    /// El puesto que <c>profileMembers</c> publica en la fila: «Creador», «Administrador» o la cadena vacía para
    /// quien no administra (<c>NativeBridge.java:1607</c>). Los bots se cuelan igual que allá: Android no los mira
    /// en esta lista y aquí tampoco se filtran, porque la pestaña es «quién está dentro», no «quién puede administrar».
    public static string Role(ChatParticipantBase? part) => part switch
    {
        ChatParticipantCreator => "Creador",
        ChatParticipantAdmin => "Administrador",
        _ => ""
    };

    /// <c>role</c> para una fila de supergrupo, que llega como <c>ChannelParticipantBase</c> y no como
    /// <c>ChatParticipantBase</c>: las dos familias tienen creador y administrador propios y la regla es la misma.
    public static string Role(ChannelParticipantBase? part) => part switch
    {
        ChannelParticipantCreator => "Creador",
        ChannelParticipantAdmin => "Administrador",
        _ => ""
    };

    /// La fila de <c>profileMembers</c> (<c>NativeBridge.java:1598</c>): cuatro claves, con el identificador en
    /// cadena decimal y el puesto tal cual. La miniatura se deja fuera: Android la saca de <c>dto.userPhoto</c> y
    /// el host no registra la foto de cada persona en esta lectura, así que la pantalla pinta las iniciales.
    public static object MemberRow(long id, string name, string role) => new { id = id.ToString(), name, role };

    /// La fila de <c>chat</c> que <c>respondProfilePeer</c> devuelve por tres caminos distintos
    /// (<c>:1629-1632</c>, y las dos pestañas saltan aquí desde <c>App.tsx:740</c>). <c>type</c> manda en la
    /// pantalla: <c>private</c> abre ficha de persona, <c>group</c> y <c>channel</c> abren ficha de comunidad.
    public static object PeerRow(string id, string title, string type, string username, bool bot) =>
        new { id, title, type, username, bot, supported = true };
}
