namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using TL;

/// <summary>
/// La lista de miembros de un supergrupo o de un canal en Windows. En Android es un solo método
/// (<c>NativeBridge.groupMembers</c>, <c>NativeBridge.java:2828-2844</c>) que atiende las dos órdenes —la array
/// simple de <c>groups.members</c> y la página de <c>groups.members.page</c>— y que toma cinco decisiones: a qué
/// chats deja listar, cuánto puede medir la búsqueda, cómo se aprietan el desplazamiento y el tamaño, qué permiso
/// propio hace falta y cómo se traduce cada fila. Las cinco están aquí escritas una vez, con las frases copiadas
/// carácter a carácter, y el cable solo pide, ordena y responde.
/// <para>
/// Lo que midió la reflexión sobre WTelegramClient 4.4.10 (<c>.tools/membersprobe</c>) y cambió el plan:
/// <list type="bullet">
/// <item><description>TDLib tiene dos preguntas —<c>GetSupergroupMembers</c> con filtros
/// <c>SupergroupMembersFilter*</c> y <c>SearchChatMembers</c> con <c>ChatMembersFilter*</c>— y MTProto una sola,
/// <c>Channels_GetParticipants(Client, InputChannelBase, ChannelParticipantsFilter, int offset, int limit, long
/// hash)</c>, con siete formas de filtro. Los seis filtros de la pantalla caben en las siete, pero no los seis con
/// texto: <c>ChannelParticipantsAdmins</c>, <c>ChannelParticipantsBots</c> y <c>ChannelParticipantsRecent</c> no
/// tienen campo <c>q</c>. Ver <see cref="Request"/>.</description></item>
/// <item><description>Una fila no es un estado: son seis constructores distintos
/// (<c>ChannelParticipant</c>, <c>…Self</c>, <c>…Admin</c>, <c>…Banned</c>, <c>…Creator</c>, <c>…Left</c>) y los
/// dos últimos no traen <c>user_id</c> sino <c>peer</c>, que puede ser un canal hablando como identidad. Esas
/// filas se descartan igual que allá se descarta todo lo que no sea <c>MessageSenderUser</c>
/// (<c>:2815</c>).</description></item>
/// <item><description>El baneo y la restricción son el mismo constructor
/// (<c>ChannelParticipantBanned</c> + <c>ChatBannedRights</c>); lo que los separa es la bandera
/// <c>view_messages</c>. TDLib lo separa en dos estados.</description></item>
/// <item><description>Las fechas de Telegram son <c>DateTime</c>, no enteros Unix: el <c>until</c> del contrato
/// vuelve a segundos aquí (<see cref="Until"/>).</description></item>
/// <item><description>Y las dos familias de filas no están emparentadas: <c>ChannelParticipantBase</c> y
/// <c>ChatParticipantBase</c> son dos raíces distintas en WTelegramClient 4.4.10 —ninguna de las dos hereda de la
/// otra, aunque los seis <c>channelParticipant*</c> sean en la schema constructores de <c>ChatParticipant</c>—. Por
/// eso esta clase y <see cref="DesktopGroupRoster"/> no pueden compartir un solo traductor de filas: sería un
/// genérico sobre nada.</description></item>
/// </list>
/// </para>
/// <para>
/// Dos divergencias, escritas en lugar de imitadas. La primera es el orden del permiso: Android comprueba el
/// derecho <b>antes</b> de construir la petición, así que un filtro malo con una cuenta sin derechos oye
/// <see cref="NoRight"/> y no <see cref="BadFilter"/> (<c>:2798-2800</c>); el cable respeta ese orden. La segunda
/// es de dónde sale el perfil: <c>memberDto</c> (<c>:2815-2825</c>) vuelve a Telegram a por la gente que no tiene
/// en su memoria, que es un LRU de 2000 y de la que un nombre salido no regresa solo; MTProto trae a las personas
/// dentro de la propia respuesta, así que Windows lee lo que llegó y no abre una petición aparte. La regla del
/// nombre ya no diverge: las dos capas dicen primero nombre y apellido, luego el <c>@usuario</c> público y solo al
/// final <see cref="UnknownPerson"/>.
/// </para>
/// </summary>
public static class DesktopGroupMembers
{
    /// El tope de <c>params.optString("query","")</c> en <c>:2795</c>. Se mide sobre el texto sin recortar —la
    /// comparación va antes del <c>trim()</c> de <c>:2800</c>—, igual que allá.
    public const int MaxQuery = 80;

    /// Los dos apretones apretes de <c>:2796</c>: <c>Math.max(0,Math.min(5000,offset))</c> y
    /// <c>Math.max(1,Math.min(50,limit))</c>.
    public const int MaxOffset = 5000;
    public const int MaxLimit = 50;
    public const int MinLimit = 1;

    /// El <c>NativeSnapshot.limit(...,90)</c> de <c>PersonName.java:21</c> y <c>PersonName.java:24</c>, invocado en <c>NativeBridge.java:2818</c>.
    public const int NameShown = 90;

    /// El respaldo de <c>:2783</c> cuando Telegram no dio nombre y no hay usuario que poner.
    public const string UnknownPerson = "Usuario de Telegram";

    /// Las cinco negaciones del puente, con su línea. <see cref="TooLongQuery"/> es la misma cadena que
    /// <c>BasicGroupRoster.TOO_LONG</c> (<c>BasicGroupRoster.java:29</c>): dos caminos distintos del mismo tope.
    public const string Unsupported = "La administración solo está disponible en supergrupos y canales.";
    public const string TooLongQuery = "La búsqueda de miembros admite hasta 80 caracteres.";
    public const string NoRight = "Telegram no concede a esta cuenta permisos para administrar miembros.";
    public const string BadFilter = "Filtro de miembros no válido.";
    public const string Unreadable = "No se pudo preparar la lista de miembros.";

    /// Los cinco estados que <c>memberDto</c> sabe decir (<c>:2785</c>) más el sexto que solo existe en MTProto.
    public const string StatusCreator = "Propietario";
    public const string StatusAdmin = "Administrador";
    public const string StatusMember = "Miembro";
    public const string StatusRestricted = "Restringido";
    public const string StatusBanned = "Baneado";

    /// <c>channelParticipantLeft</c> no tiene equivalente exacto en TDLib: un <c>ChatMemberStatusLeft</c> cae allí
    /// en el <c>else</c> de <c>:2785</c> y se lee «Miembro», que es falso. Windows usa la palabra que el propio
    /// contrato ya tiene para el básico (<c>BasicGroupRoster.LEFT</c>, <c>BasicGroupRoster.java:35</c>) y Android
    /// debería seguirle; la corrección de aquella fila es una ronda de Android con la pantalla delante.
    public const string StatusLeft = "Salió";

    /// Las seis teclas que la pantalla manda (<c>apps/mobile-ui/src/App.tsx:1344</c>, <c>MEMBER_FILTERS</c>).
    public static readonly string[] FilterKeys =
        { "recent", "administrators", "restricted", "banned", "bots", "contacts" };

    /// <c>chat.type instanceof TdApi.ChatTypeSupergroup</c> (<c>:2793</c>): básico, uno a uno y Guardados quedan
    /// fuera. En Windows la forma del peer ya la separó <c>DesktopMembership.Of</c> —<c>g</c> es básico y <c>c</c>
    /// es canal o supergrupo—, así que un solo caso cubre la guarda.
    public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Channel;

    public static bool TooLong(string? query) => (query ?? "").Length > MaxQuery;

    /// Los dos apretones apretes de <c>:2796</c>, dicho en una función para que el cable no invente su propio margen.
    public static int Offset(long raw) => (int)Math.Clamp(raw, 0, MaxOffset);

    public static int Limit(long raw) => (int)Math.Clamp(raw, MinLimit, MaxLimit);

    /// Qué se le pide a Telegram y si la búsqueda viaja o se hace en casa.
    /// <para>
    /// Con texto: <c>recent</c> pasa a <c>channelParticipantsSearch</c> —que es exactamente lo que allá es
    /// <c>SearchChatMembers</c> con <c>ChatMembersFilterMembers</c> (<c>:2800</c>)—, y <c>restricted</c>,
    /// <c>banned</c> y <c>contacts</c> llevan su <c>q</c> propio. Sin texto, cada filtro con su constructor.
    /// </para>
    /// <para>
    /// <c>administrators</c> y <c>bots</c> no admiten <c>q</c> en MTProto, y TDLib sí los busca en el servidor. La
    /// respuesta sigue siendo la lista de ese filtro, pero el texto se aplica sobre la página devuelta: por eso el
    /// par trae <c>ServerSearch=false</c> y el cable responde la página sin paginar, que es justo la forma que
    /// Android elige cuando busca (<c>nextOffset=0</c> y <c>hasMore=false</c> en <c>:2803</c>). Devolver
    /// <c>hasMore=true</c> aquí prometería más resultados de los que hay.
    /// </para>
    public static (ChannelParticipantsFilter Filter, bool ServerSearch) Request(string? key, string query)
    {
        var needle = query.Trim();
        var searching = needle.Length > 0;
        ChannelParticipantsFilter filter = (key ?? "recent") switch
        {
            "recent" => searching ? new ChannelParticipantsSearch { q = needle } : new ChannelParticipantsRecent(),
            "administrators" => new ChannelParticipantsAdmins(),
            "restricted" => new ChannelParticipantsBanned { q = needle },
            "banned" => new ChannelParticipantsKicked { q = needle },
            "bots" => new ChannelParticipantsBots(),
            "contacts" => new ChannelParticipantsContacts { q = needle },
            // La cadena de <c>supergroupMembersFilter</c>/<c>chatMembersFilter</c> (<c>:2776</c> y <c>:2777</c>),
            // que Android lanza y el puente atrapa para devolverla tal cual.
            _ => throw new BridgeException(BadFilter)
        };
        return (filter, !(searching && (key is "administrators" or "bots")));
    }

    /// La fila es una persona solo si trae un <c>PeerUser</c> o un <c>user_id</c>. Un canal que habla con su
    /// identidad propia aparece en <c>channelParticipantBanned.peer</c> y en <c>channelParticipantLeft.peer</c>;
    /// allá se descarta por no ser <c>MessageSenderUser</c> (<c>:2802</c>) y aquí por no ser usuario.
    public static long? Person(ChannelParticipantBase? part) => part switch
    {
        ChannelParticipant p => p.user_id,
        ChannelParticipantSelf p => p.user_id,
        ChannelParticipantAdmin p => p.user_id,
        ChannelParticipantCreator p => p.user_id,
        ChannelParticipantBanned b => UserId(b.peer),
        ChannelParticipantLeft l => UserId(l.peer),
        _ => null
    };

    private static long? UserId(Peer? peer) => peer is PeerUser user ? user.user_id : null;

    public static bool IsNormal(ChannelParticipantBase part) => part is ChannelParticipant or ChannelParticipantSelf;

    public static bool IsAdmin(ChannelParticipantBase part) => part is ChannelParticipantAdmin;

    /// <c>canBeEdited</c> de TDLib es la bandera <c>can_edit</c> de <c>channelParticipantAdmin</c>: solo una
    /// administración que la propia cuenta puede tocar se ofrece a editar o a quitar.
    public static bool IsEditableAdmin(ChannelParticipantBase part) =>
        part is ChannelParticipantAdmin a && (a.flags & ChannelParticipantAdmin.Flags.can_edit) != 0;

    /// El baneo es la restricción que además quita la lectura. Sin <c>view_messages</c> la persona sigue dentro
    /// leyendo y TDLib lo llamaría <c>ChatMemberStatusRestricted</c>.
    public static bool IsBanned(ChannelParticipantBase part) =>
        part is ChannelParticipantBanned b && Bars(b.banned_rights, ChatBannedRights.Flags.view_messages);

    public static bool IsRestricted(ChannelParticipantBase part) =>
        part is ChannelParticipantBanned r && r.banned_rights != null
            && !Bars(r.banned_rights, ChatBannedRights.Flags.view_messages);

    /// Los cinco estados de <c>:2785</c> con su mismo orden de comprobación, más <see cref="StatusLeft"/>.
    public static string Status(ChannelParticipantBase part) => part switch
    {
        ChannelParticipantAdmin => StatusAdmin,
        ChannelParticipantCreator => StatusCreator,
        ChannelParticipantLeft => StatusLeft,
        ChannelParticipantBanned banned => IsBanned(banned) ? StatusBanned : StatusRestricted,
        _ => StatusMember
    };

    /// El plazo del <c>:2786</c>: <c>bannedUntilDate</c> o <c>restrictedUntilDate</c> según el estado, cero para el
    /// resto. En MTProto los dos viven en el mismo sitio —<c>ChatBannedRights.until_date</c>— y un cero allí ya
    /// significa «sin levantamiento», igual que allá.
    public static long Until(ChannelParticipantBase part) =>
        part is ChannelParticipantBanned b && b.banned_rights != null
            ? TelegramService.Unix(b.banned_rights.until_date)
            : 0L;

    private static bool Bars(ChatBannedRights? rights, ChatBannedRights.Flags flag) =>
        rights != null && (rights.flags & flag) != 0;

    /// El nombre de la fila: las dos ramas de <c>:2782</c> y <c>:2783</c> recortadas a noventa. El recorte lo hace
    /// <c>DesktopContact.Limit</c>, que es el <c>NativeSnapshot.limit</c> con su punto suspensivo.
    public static string Name(User? user)
    {
        if (user == null) return UnknownPerson;
        var name = DesktopCommunityInfo.Prepared((user.first_name ?? "") + " " + (user.last_name ?? ""));
        if (name.Length > 0) return DesktopContact.Limit(name, NameShown);
        var handle = user.MainUsername ?? user.ActiveUsernames?.FirstOrDefault();
        return string.IsNullOrEmpty(handle) ? UnknownPerson : DesktopContact.Limit("@" + handle, NameShown);
    }

    /// El filtro local de las dos filas que Telegram no busca en el servidor. Mismas reglas que
    /// <c>BasicGroupRoster.matches</c> (<c>BasicGroupRoster.java:101-106</c>): minúsculas sobre nombre o usuario,
    /// y la persona puede escribir el <c>@</c> o no.
    public static bool Matches(User? user, string query)
    {
        var needle = query.Trim().ToLowerInvariant();
        if (needle.Length == 0) return true;
        var name = Name(user).ToLowerInvariant();
        if (name.Contains(needle, StringComparison.Ordinal)) return true;
        var handle = user?.MainUsername ?? user?.ActiveUsernames?.FirstOrDefault() ?? "";
        return handle.ToLowerInvariant().Contains(needle.TrimStart('@'), StringComparison.Ordinal);
    }

    /// Lo que Telegram dice de la propia cuenta, que en Android es un <c>GetChatMember</c> sobre uno mismo
    /// (<c>:2797</c>). Las dos preguntas del puente son las dos de <c>:1882</c> y <c>:1884</c>: el creador puede
    /// con todo y el administrador, solo con lo que trae escrito.
    public sealed class Actor
    {
        private readonly ChatAdminRights? _rights;

        public Actor(bool creator, ChatAdminRights? rights)
        {
            Creator = creator;
            _rights = rights;
        }

        /// El <c>canRestrictMembers</c> de <c>:1882</c>: <c>ban_users</c> de la tabla de MTProto.
        public bool CanRestrict => Granted("ban_users");

        /// El <c>canPromoteMembers</c> de <c>:1884</c>: <c>add_admins</c>.
        public bool CanPromote => Granted("add_admins");

        public bool Creator { get; }

        /// <c>grantedAdminRight</c> (<c>:2865</c>): el creador lo tiene todo y el resto lee su bandera.
        public bool Granted(string right) =>
            Creator || (_rights != null && Enum.TryParse<ChatAdminRights.Flags>(right, out var flag)
                && (_rights.flags & flag) != 0);

        /// La cuenta propia vista desde la fila que Telegram devolvió para ella
        /// (<c>channels.getParticipant</c> con <c>InputPeerSelf</c>). Creador es el estado, no un derecho; los
        /// derechos solo cuentan en un administrador, que es lo que <c>:1884</c> hace con
        /// <c>administratorRights</c>.
        public static Actor From(ChannelParticipantBase? self) => self switch
        {
            ChannelParticipantCreator => new Actor(true, null),
            ChannelParticipantAdmin admin => new Actor(false, admin.admin_rights),
            _ => new Actor(false, null)
        };

        /// <c>administratorRightsDto</c> (<c>:2778</c>): las dieciséis claves de TDLib, en su orden, cada una con su
        /// bandera de MTProto. <c>anonymous</c> y <c>other</c> no viajan porque la pantalla no las pregunta.
        public static Dictionary<string, bool> Current(ChatAdminRights? rights) => Delegable.ToDictionary(
            entry => entry.Key, entry => rights != null && Enum.TryParse<ChatAdminRights.Flags>(entry.Right, out var flag)
                && (rights.flags & flag) != 0);

        /// <c>availableAdminRights</c> (<c>:1885</c>): lo mismo, pero pasado por la puerta del tipo de chat. Hay
        /// derechos que solo tienen sentido en un canal, otros que solo existen fuera de él y uno reservado a los
        /// foros.
        public Dictionary<string, bool> Available(bool channel, bool forum) => Delegable.ToDictionary(
            entry => entry.Key,
            entry => Granted(entry.Right) && entry.Gate switch
            {
                Gate.Channel => channel,
                Gate.Community => !channel,
                Gate.Forum => forum,
                _ => true
            });

        /// Los tres casos de la puerta, que son las tres cosas que <c>:1885</c> distingue. <c>internal</c> desde la
        /// ronda AZ: la promoción vuelve a pasar por esta misma tabla para no aceptar un permiso que la pantalla no
        /// podía ofrecer, y dos listas de puertas en una misma sesión son dos listas que se van a desfasar.
        internal enum Gate { Any, Channel, Community, Forum }

        /// <c>internal</c> por el mismo motivo: es la única lista que sabe qué bandera de MTProto corresponde a cada
        /// clave de TDLib, y la ronda AZ la necesita entera para escribir derechos, no solo para enseñarlos.
        internal static readonly (string Key, string Right, Gate Gate)[] Delegable =
        {
            ("canChangeInfo", "change_info", Gate.Any),
            ("canPostMessages", "post_messages", Gate.Channel),
            ("canEditMessages", "edit_messages", Gate.Channel),
            ("canDeleteMessages", "delete_messages", Gate.Any),
            ("canInviteUsers", "invite_users", Gate.Any),
            ("canRestrictMembers", "ban_users", Gate.Any),
            ("canPinMessages", "pin_messages", Gate.Community),
            ("canManageTopics", "manage_topics", Gate.Forum),
            ("canPromoteMembers", "add_admins", Gate.Any),
            ("canManageVideoChats", "manage_call", Gate.Any),
            ("canPostStories", "post_stories", Gate.Any),
            ("canEditStories", "edit_stories", Gate.Any),
            ("canDeleteStories", "delete_stories", Gate.Any),
            ("canManageDirectMessages", "manage_direct_messages", Gate.Channel),
            ("canManageTags", "manage_ranks", Gate.Community),
            ("canSendWelcomeMessages", "manage_welcome_messages", Gate.Any)
        };
    }

    /// La fila que ve la pantalla. Las dieciséis claves son las de <c>memberDto</c> (<c>:2788</c>) en su orden, y
    /// las seis de acción son sus seis fórmulas: el derecho propio y el estado de la fila, sin más.
    public static object Row(ChannelParticipantBase part, User? user, Actor actor, bool channel, bool forum)
    {
        var normal = IsNormal(part);
        var restricted = IsRestricted(part);
        var banned = IsBanned(part);
        var editable = IsEditableAdmin(part);
        return new
        {
            id = (Person(part) ?? 0L).ToString(CultureInfo.InvariantCulture),
            name = Name(user),
            status = Status(part),
            admin = IsAdmin(part),
            bot = user?.IsBot ?? false,
            canBan = actor.CanRestrict && (normal || restricted),
            canUnban = actor.CanRestrict && (banned || restricted),
            canRestrict = actor.CanRestrict && !channel && (normal || restricted),
            canPromote = actor.CanPromote && normal,
            canDemote = actor.CanPromote && editable,
            canEditRights = actor.CanPromote && editable,
            restricted,
            banned,
            until = Until(part),
            currentRights = part is ChannelParticipantAdmin admin && admin.admin_rights != null
                ? Actor.Current(admin.admin_rights)
                : null,
            adminRights = actor.CanPromote ? actor.Available(channel, forum) : null
        };
    }

    /// El envoltorio de <c>groups.members.page</c> (<c>:2803</c>). <c>received</c> es lo que Telegram devolvió, no
    /// lo que queda tras quitar las filas que no son personas ni la propia: Android cuenta
    /// <c>result.members.length</c> antes del bucle, y desplazarse de menos mezclaría dos páginas.
    public static object Page(IEnumerable<object> rows, int total, int offset, int received, bool searching)
    {
        var next = searching ? 0 : offset + received;
        return new { members = rows.ToArray(), nextOffset = next, hasMore = !searching && next < total };
    }
}
