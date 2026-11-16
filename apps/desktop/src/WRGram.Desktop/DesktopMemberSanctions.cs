namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Las reglas de las cinco escrituras sobre una fila de supergrupo o canal: <c>groups.member.ban</c> y
/// <c>groups.member.restrict</c> (<c>NativeBridge.java:2879</c>), <c>groups.member.unban</c> (<c>:2846</c>),
/// <c>groups.member.promote</c> (<c>:2851</c>) y <c>groups.member.demote</c> (<c>:2852</c>). Cada frase está copiada
/// carácter a carácter de esas cinco líneas, incluidos los tres rótulos del cuadro de confirmación y el remate de
/// cada cuerpo; y cada guarda se comprueba en el mismo orden en que las comprueba Android, que no es un orden
/// arbitrario: va pegado a las dos peticiones que las separan (<c>GetChatMember</c> sobre uno mismo y
/// <c>GetChatMember</c> sobre la objetivo).
/// <para>
/// De ahí sale la forma de esta clase. Tres fases por escritura —<c>…Pre</c> sin red, <c>…Right</c> después de la
/// lectura propia y <c>…Target</c> después de la ajena— en lugar de una sola función que lo compruebe todo: una sola
/// función obligaría a pedir la fila objetivo antes de saber si el plazo era malo, y eso es mandar dos peticiones
/// cuando Telegram ya iba a rechazar la operación. Cada fase devuelve la frase o <c>null</c>, y el cable lanza la
/// primera que reciba.
/// </para>
/// <para>
/// Las dos traducciones de protocolo, ambas medidas sobre WTelegramClient 4.4.10 con <c>.tools/api-dump</c>:
/// <list type="bullet">
/// <item><description>TDLib usa un solo <c>SetChatMemberStatus</c> con seis estados; MTProto reparte eso en dos
/// peticiones —<c>channels.editBanned</c> para sancionar y levantar la sanción, <c>channels.editAdmin</c> para
/// poner y quitar el rol— y la diferencia entre banear y restringir son las banderas de <c>ChatBannedRights</c>
/// (<see cref="BanRights"/>).</description></item>
/// <item><description>El borrado del historial de una persona no es un argumento de la sanción: es su propia
/// petición, <c>channels.deleteParticipantHistory</c>, que es el equivalente exacto del
/// <c>DeleteChatMessagesBySender</c> de <c>:2793</c>. Viaja después, y si falla la sanción queda aplicada —así lo
/// dice Android y así lo dice aquí—.</description></item>
/// </list>
/// </para>
/// <para>
/// Tres huecos honestos, dichos en lugar de disimulados. El primero: Android distingue «restringido que ya se fue»
/// porque <c>ChatMemberStatusRestricted.is_member</c> se lo cuenta, y en MTProto <c>channelParticipantBanned</c> no
/// trae esa bandera —una persona que se fue tras ser restringida llega como <c>channelParticipantLeft**—, así que la
/// segunda frase del cuadro de <c>:2760</c> no tiene camino aquí y no se copia; esa fila se niega con la frase de
/// siempre. El segundo: el <c>access_hash</c> que <c>InputPeerUser</c> y <c>InputUser</c> piden solo viene en las
/// respuestas que traen a la persona entera, y una fila recortada lo deja a cero (<see cref="NeedsHash"/>). El
/// tercero: Android comprueba además <c>session.activeChat==chat.id</c> después del cuadro, y el host no tiene
/// conversación activa —la pantalla es la que decide a qué chat escribe—, así que esa parte de la guarda se queda en
/// lo que sí se puede comprobar, que es la cuenta (<c>answer.owner</c>).
/// </para>
/// </summary>
public static class DesktopMemberSanctions
{
    /// El <c>params.optLong("duration",3600)</c> de <c>:2793</c>: cuando la pantalla no manda plazo, Telegram lo
    /// entiende como una hora, y el andamio y <c>MemberSanctionDialog</c> arrancan en esa misma opción.
    public const long DefaultDuration = 3600;

    /// Los dos bordes de <c>:2793</c> —<c>duration&lt;60 || duration&gt;366L*86400</c>— y el cero que significa
    /// permanente. Cero no entra en la compara: es el tercer caso, no un exceso del primero.
    public const long MinDuration = 60;
    public const long MaxDuration = 366L * 86400;

    // ---- las tres negaciones de forma y de plazo ----

    /// La guarda de <c>:2793</c>, <c>:2760</c>, <c>:2765</c> y <c>:2766</c> cuando la fila no es ni un básico ni un
    /// supergrupo: un uno a uno, un secreto o Guardados. Es la misma cadena en los cuatro caminos.
    public const string RequiresSupergroup = "Esta acción requiere un supergrupo o canal.";
    public const string BadDuration = "La duración debe ser permanente o estar entre 1 minuto y 366 días.";
    public const string ChannelNoRestrict =
        "Los canales no admiten restricciones de miembros; usa Banear para expulsar del canal.";

    // ---- las cinco negaciones de permiso propio ----

    public const string NoRestrictRight = "Telegram no concede permiso para restringir miembros.";
    public const string NoDeleteRight =
        "Telegram no permite borrar mensajes de un miembro desde este tipo de chat o tu cuenta no tiene ese permiso.";
    public const string NoLiftRight = "Telegram no concede permiso para quitar restricciones.";
    public const string NoPromoteRight = "Telegram no concede a esta cuenta permiso para administrar roles.";
    public const string NoDemoteRight = "Telegram no concede a esta cuenta permiso para quitar roles de administrador.";

    // ---- las cuatro negaciones sobre la propia cuenta, cada una con su palabras ----

    public const string SelfMenu = "No puedes cambiar tu propio estado desde este menú.";
    public const string SelfList = "No puedes cambiar tu propio estado desde esta lista.";
    public const string SelfRole = "No puedes cambiar tu propio rol desde aquí.";
    public const string SelfDemote = "No puedes quitarte el rol desde este menú.";

    // ---- las cuatro negaciones sobre la fila objetivo ----

    public const string NotSanctionable =
        "Telegram solo permite aplicar esta acción a un miembro normal o ya restringido. Los administradores deben perder su rol primero.";
    public const string NotLiftable = "Este usuario ya no figura como baneado o restringido.";
    public const string NotPromotable =
        "Telegram solo permite promover a un miembro normal o editar un administrador que puedas modificar.";
    public const string NotEditableAdmin = "Telegram no permite editar este rol de administrador.";

    // ---- las tres negaciones del reparto de permisos (`requestedAdminRights`, `:2763`) ----

    public const string NoDelegation = "No puedes delegar un permiso que no tienes en Telegram.";
    public const string IncompatibleRight = "Uno de los permisos no es compatible con este tipo de chat.";
    public const string NoRightSelected = "Selecciona al menos un permiso administrativo.";

    // ---- las cuatro frases de cuenta cambiada, una por escritura ----

    public const string ChangedSanction = "La conversación cambió. No se aplicó la restricción.";
    public const string ChangedUnban = "La conversación cambió. No se cambió el estado del usuario.";
    public const string ChangedPromote = "La cuenta cambió. No se cambió el rol.";
    public const string ChangedDemote = "La conversación cambió. No se quitó el rol.";

    /// El <c>answer.fail("La restricción se aplicó, pero Telegram no permitió borrar los mensajes: "+error)</c> de
    /// <c>:2793</c>. Lleva el espacio y los dos puntos al final porque lo que sigue es el texto del error, no una
    /// frase propia: la sanción ya está puesta y decirlo a medias sería peor que decirlo entero.
    public const string RevokeFailed = "La restricción se aplicó, pero Telegram no permitió borrar los mensajes: ";

    /// La negación que en Android no existe, porque TDLib guarda el <c>access_hash</c> en casa y MTProto lo pide en
    /// cada escritura. Vale para las cuatro acciones, así que no repite la palabra «expulsar» de
    /// <see cref="DesktopGroupRoster.NoHash"/>, que es el camino del básico y sigue diciendo lo que dice.
    public const string NeedsHash =
        "Telegram no dio los datos necesarios para cambiar el estado de esta persona. Vuelve a abrir la lista e inténtalo de nuevo.";

    // ---- los rótulos de los cuatro cuadros ----

    public const string Restrict = "Restringir";
    public const string Ban = "Banear";
    public const string LiftBan = "Quitar baneo";
    public const string LiftRestriction = "Quitar restricción";
    public const string Promote = "Promover";
    public const string SaveRights = "Guardar permisos";
    public const string NameAdmin = "Promover a administrador";
    public const string EditRightsTitle = "Editar permisos de administrador";
    public const string DemoteTitle = "Quitar administración";
    public const string RemoveRole = "Quitar rol";

    /// El título de <c>:2793</c>: <c>action+" a "+name</c>, con la acción en minúscula solo cuando va en el cuerpo.
    public static string BanTitle(bool restrict, string name) => BanAction(restrict) + " a " + name;

    /// El botón derecho, que es la misma palabra que el título: <c>action</c> en <c>:2793</c>.
    public static string BanAction(bool restrict) => restrict ? Restrict : Ban;

    /// El cuerpo de <c>:2793</c>, con sus cuatro piezas en el orden exacto: la frase de qué va a pasar, el nombre,
    /// el plazo, y el «También se borrarán…» o el «No se borrarán mensajes.» antes del remate.
    public static string BanBody(bool restrict, string name, long duration, bool deleteMessages) =>
        (restrict ? "Se quitarán los permisos de envío a " : "Se expulsará a ") + name + " " +
        DurationLabel(duration) + ". " +
        (deleteMessages ? "También se borrarán todos los mensajes que envió en este chat. " : "No se borrarán mensajes. ") +
        "Telegram validará el cambio en la cuenta.";

    /// <c>banDurationLabel</c> (<c>:2767</c>) entero: primero el cero, luego días, luego horas y al final minutos,
    /// y los tres con la forma <c>N unidad(s)</c> que Android no pluraliza.
    public static string DurationLabel(long seconds)
    {
        if (seconds == 0) return "de forma permanente";
        if (seconds % 86400 == 0) return "durante " + (seconds / 86400) + " día(s)";
        if (seconds % 3600 == 0) return "durante " + (seconds / 3600) + " hora(s)";
        return "durante " + (seconds / 60) + " minuto(s)";
    }

    /// El título y el botón de <c>:2760</c>, que son la misma cadena: <c>banned?"Quitar baneo":"Quitar
    /// restricción"</c>.
    public static string LiftTitle(bool banned) => banned ? LiftBan : LiftRestriction;

    /// El cuerpo de <c>:2760</c> para el caso que Windows sabe ver. La otra rama —la del restringido que ya se
    /// fue— necesita <c>is_member</c> y se explica al principio de esta clase.
    public static string LiftBody(string name) =>
        "Se restaurará el acceso completo de " + name + " a este grupo o canal. No se enviará una invitación.";

    /// El título de <c>:2765</c> y el de <c>:2766</c> según se edite o se nombre, y los dos botones con ellos.
    public static string PromoteTitle(bool editing) => editing ? EditRightsTitle : NameAdmin;
    public static string PromoteAction(bool editing) => editing ? SaveRights : Promote;

    /// El cuerpo de <c>:2765</c>: a quién, con qué palabras y qué permisos concretos, terminando en que Telegram
    /// vuelve a validar la autoridad de quien escribe.
    public static string PromoteBody(bool editing, string name, ChatAdminRights rights) =>
        (editing ? "Se actualizarán los permisos de " : "Se otorgarán a ") + name + ": " +
        Summary(rights) + ". Telegram volverá a validar tu autoridad.";

    /// El cuerpo de <c>:2766</c>. Android lo escribe con un <c>""+name+"</c> delante; aquí el nombre ya es texto.
    public static string DemoteBody(string name) =>
        name + " dejará de ser administrador y conservará su membresía normal.";

    /// Las dieciséis etiquetas de <c>adminRightsSummary</c> (<c>:2664</c>), en el orden de <c>:2763</c> y en
    /// minúsculas, que es como Android las suelta en la frase.
    private static readonly (string Key, string Label)[] Labels =
    {
        ("canChangeInfo", "editar información"),
        ("canPostMessages", "publicar en canales"),
        ("canEditMessages", "editar mensajes"),
        ("canDeleteMessages", "borrar mensajes"),
        ("canInviteUsers", "invitar miembros"),
        ("canRestrictMembers", "restringir miembros"),
        ("canPinMessages", "fijar mensajes"),
        ("canManageTopics", "gestionar temas"),
        ("canPromoteMembers", "promover administradores"),
        ("canManageVideoChats", "gestionar videollamadas"),
        ("canPostStories", "publicar historias"),
        ("canEditStories", "editar historias"),
        ("canDeleteStories", "eliminar historias"),
        ("canManageDirectMessages", "gestionar mensajes directos"),
        ("canManageTags", "gestionar etiquetas"),
        ("canSendWelcomeMessages", "enviar bienvenidas")
    };

    /// El resumen del cuadro de promoción: las etiquetas de lo que queda concedido, unidas con coma y espacio, igual
    /// que el <c>String.join(", ",labels)</c> de <c>:2664</c>.
    public static string Summary(ChatAdminRights? rights) => rights == null ? "" : string.Join(", ", Labels
        .Where(entry => Granted(rights, entry.Key))
        .Select(entry => entry.Label));

    /// Si una de las dieciséis claves está puesta en estas derechos. La tabla de <see
    /// cref="DesktopGroupMembers.Actor"/> es la única que sabe qué bandera de MTProto corresponde a cada clave, así
    /// que la pregunta se la hace a ella y no repite la lista.
    /// <c>grantedAdminRight</c> (<c>:1778</c>) con la clave que habla la pantalla, no con el nombre de la bandera:
    /// Android hace esa conversión dentro de su <c>switch</c> y aquí la hace la misma tabla de la lista, que es la
    /// única que sabe que <c>canRestrictMembers</c> se llama <c>ban_users</c> en MTProto.
    public static bool Granted(DesktopGroupMembers.Actor actor, string key) =>
        DesktopGroupMembers.Actor.Delegable.Any(entry => entry.Key == key && actor.Granted(entry.Right));

    public static bool Granted(ChatAdminRights? rights, string key) =>
        rights != null && DesktopGroupMembers.Actor.Delegable.Any(entry =>
            entry.Key == key && (rights.flags & Parse(entry.Right)) != 0);

    private static ChatAdminRights.Flags Parse(string right) =>
        Enum.Parse<ChatAdminRights.Flags>(right, true);

    // ---- las tres fases de cada escritura ----

    /// Lo que <c>:2793</c> decide sin mirar a Telegram: la cuenta sobre sí misma, el plazo y el canal que no admite
    /// restricciones.
    public static string? BanPreProblem(bool self, long duration, bool restrict, bool channel)
    {
        if (self) return SelfMenu;
        if (duration != 0 && (duration < MinDuration || duration > MaxDuration)) return BadDuration;
        if (restrict && channel) return ChannelNoRestrict;
        return null;
    }

    /// La segunda fase de <c>:2793</c>, ya con la fila propia leída: el derecho de sancionar y el de borrar
    /// mensajes, que solo vale fuera de un canal.
    public static string? BanRightProblem(DesktopGroupMembers.Actor actor, bool channel, bool deleteMessages)
    {
        if (!actor.CanRestrict) return NoRestrictRight;
        if (deleteMessages && (!Granted(actor, "canDeleteMessages") || channel)) return NoDeleteRight;
        return null;
    }

    /// La tercera fase de <c>:2793</c>: solo un miembro normal o ya restringido se sanciona. Un administrador
    /// primero pierde el rol, y un creador no se sanciona.
    public static string? BanTargetProblem(ChannelParticipantBase? part) =>
        part != null && (DesktopGroupMembers.IsNormal(part) || DesktopGroupMembers.IsRestricted(part))
            ? null : NotSanctionable;

    /// Si la sanción que se va a escribir es un baneo, para el rótulo del cuadro de <c>:2760</c>.
    public static bool IsBanned(ChannelParticipantBase? part) =>
        part != null && DesktopGroupMembers.IsBanned(part);

    /// Lo único que <c>:2760</c> sabe antes de preguntar a Telegram: que no se levante el baneo propio.
    public static string? LiftPreProblem(bool self) => self ? SelfList : null;

    public static string? LiftRightProblem(DesktopGroupMembers.Actor actor) =>
        actor.CanRestrict ? null : NoLiftRight;

    /// Baneado o restringido; lo demás —incluida la fila de quien ya se fue— no tiene sanción que levantar.
    public static string? LiftTargetProblem(ChannelParticipantBase? part) =>
        part != null && (DesktopGroupMembers.IsBanned(part) || DesktopGroupMembers.IsRestricted(part))
            ? null : NotLiftable;

    public static string? PromotePreProblem(bool self) => self ? SelfRole : null;

    public static string? PromoteRightProblem(DesktopGroupMembers.Actor actor) =>
        actor.CanPromote ? null : NoPromoteRight;

    /// Miembro normal o administrador que la propia cuenta puede editar (<c>can_edit</c>), que es justo la pareja
    /// <c>normal||editable</c> de <c>:2765</c>.
    /// Si la fila es una administración que la propia cuenta puede tocar. La pregunta es la de
    /// <c>IsEditableAdmin</c>, pero con la fila sin leer contada como lo que es: nada editable.
    public static bool IsEditable(ChannelParticipantBase? part) =>
        part != null && DesktopGroupMembers.IsEditableAdmin(part);

    public static string? PromoteTargetProblem(ChannelParticipantBase? part) =>
        part != null && (DesktopGroupMembers.IsNormal(part) || DesktopGroupMembers.IsEditableAdmin(part))
            ? null : NotPromotable;

    public static string? DemotePreProblem(bool self) => self ? SelfDemote : null;

    public static string? DemoteRightProblem(DesktopGroupMembers.Actor actor) =>
        actor.CanPromote ? null : NoDemoteRight;

    public static string? DemoteTargetProblem(ChannelParticipantBase? part) =>
        part != null && DesktopGroupMembers.IsEditableAdmin(part) ? null : NotEditableAdmin;

    /// <c>requestedAdminRights</c> (<c>:2763</c>) entero: las dieciséis claves en su orden, la regla de delegación
    /// sobre cada una, la puerta de tipo de chat sobre el resultado y el veto a la administración vacía.
    /// <para>
    /// La delegación es lo que hace que esta función reciba tres cosas además de lo pedido: lo que la propia cuenta
    /// tiene (<c>actor</c>), lo que ya tenía la fila cuando se está editando (<c>current</c>, que puede ser un
    /// permiso encendido que nadie pidió ahora) y si el chat es canal o foro. Sin <c>current</c>, editar a un
    /// administrador quitándole una casilla que no se puede delegar le borraría un permiso que la pantalla no le
    /// enseñaba; con él, ese permiso se conserva tal cual lo devolvió Telegram.
    /// </para>
    /// <para>
    /// La puerta la aplica la misma tabla de <see cref="DesktopGroupMembers.Actor"/> que pintó los
    /// <c>availableAdminRights</c> de la lista, así que lo que la pantalla ofrecía marcar y lo que el puente acepta
    /// son dos lecturas de una sola lista. Android la escribe por índices (<c>values[6]||values[7]||values[14]</c>);
    /// aquí se lee por nombre, que es lo que son esos tres: <c>canPinMessages</c> y <c>canManageTags</c> solo fuera
    /// de un canal, y <c>canManageTopics</c> solo en un foro.
    /// </para>
    public static (ChatAdminRights? Rights, string? Problem) RequestedRights(
        DesktopGroupMembers.Actor actor, bool channel, bool forum,
        IReadOnlyDictionary<string, bool> requested, IReadOnlyDictionary<string, bool>? current, bool anonymous)
    {
        var flags = default(ChatAdminRights.Flags);
        var any = false;
        foreach (var entry in DesktopGroupMembers.Actor.Delegable)
        {
            var asked = requested.TryGetValue(entry.Key, out var wanted) && wanted;
            bool picked;
            if (actor.Granted(entry.Key)) picked = asked;
            else if (current != null) picked = current.TryGetValue(entry.Key, out var had) && had;
            else if (asked) return (null, NoDelegation);
            else picked = false;
            if (!picked) continue;
            // Y ahora la puerta: un permiso que sí se puede delegar pero no existe en este tipo de chat.
            var allowed = entry.Gate switch
            {
                DesktopGroupMembers.Actor.Gate.Channel => channel,
                DesktopGroupMembers.Actor.Gate.Community => !channel,
                DesktopGroupMembers.Actor.Gate.Forum => forum,
                _ => true
            };
            if (!allowed) return (null, IncompatibleRight);
            flags |= Parse(entry.Right);
            any = true;
        }
        if (!any) return (null, NoRightSelected);
        // <c>current!=null&amp;&amp;!channel&amp;&amp;current.isAnonymous</c>: el anonimato no lo pide la pantalla, se
        // hereda de lo que Telegram dijo de ese administrador, y solo fuera de un canal.
        if (anonymous && !channel) flags |= ChatAdminRights.Flags.anonymous;
        return (new ChatAdminRights { flags = flags }, null);
    }

    /// Las banderas de <c>ChatBannedRights</c> que escriben la sanción de <c>:2793</c>.
    /// <para>
    /// Android manda <c>ChatPermissions(false,false,…)</c> —los diecisiete permisos de escribir apagados— y MTProto
    /// los reparte en veintiuna banderas de barrer. Se barren todas menos dos: <c>view_messages</c>, que es justo lo
    /// que separa el baneo de la restricción (<see cref="DesktopGroupMembers.IsBanned"/>), y
    /// <c>manage_linked_peers</c>, que no está en la lista de permisos de <c>ChatPermissions</c> y en un canal
    /// gobierna chats vinculados, no el envío de una persona.
    /// </para>
    /// <para>
    /// El plazo llega como <c>DateTime</c>, no como entero: <c>until_date</c> en la schema es una fecha, y cero —que
    /// es lo que vale «permanente»— se escribe con la fecha por defecto, que es lo que <c>DateTime</c> por defecto
    /// es. <see cref="DesktopGroupMembers.Until"/> hace la conversión inversa al leer la fila.
    /// </para>
    public static ChatBannedRights BanRights(bool restrict, long duration) => new()
    {
        flags = restrict ? Bars : Bars | ChatBannedRights.Flags.view_messages,
        until_date = duration == 0
            ? default
            : DateTimeOffset.FromUnixTimeSeconds(DateTimeOffset.UtcNow.ToUnixTimeSeconds() + duration).UtcDateTime
    };

    /// El levantamiento de <c>:2760</c>: sin bandera alguna y sin fecha, que en MTProto es «esta persona no tiene
    /// ninguna restricción». TDLib llega al mismo sitio con <c>ChatMemberStatusMember</c>.
    public static ChatBannedRights LiftRights() => new() { flags = default, until_date = default };

    /// Los dieciocho permisos de escribir que <c>:2793</c> apaga, contados de la lista de banderas que devolvió la
    /// reflexión sobre <c>TL.ChatBannedRights+Flags</c>.
    private const ChatBannedRights.Flags Bars =
        ChatBannedRights.Flags.send_messages | ChatBannedRights.Flags.send_media |
        ChatBannedRights.Flags.send_stickers | ChatBannedRights.Flags.send_gifs |
        ChatBannedRights.Flags.send_games | ChatBannedRights.Flags.send_inline |
        ChatBannedRights.Flags.embed_links | ChatBannedRights.Flags.send_polls |
        ChatBannedRights.Flags.change_info | ChatBannedRights.Flags.invite_users |
        ChatBannedRights.Flags.pin_messages | ChatBannedRights.Flags.manage_topics |
        ChatBannedRights.Flags.send_photos | ChatBannedRights.Flags.send_videos |
        ChatBannedRights.Flags.send_roundvideos | ChatBannedRights.Flags.send_audios |
        ChatBannedRights.Flags.send_voices | ChatBannedRights.Flags.send_docs |
        ChatBannedRights.Flags.send_plain | ChatBannedRights.Flags.edit_rank |
        ChatBannedRights.Flags.send_reactions;

    /// El <c>ChatAdminRights</c> vacío con el que <c>:2766</c> quita el rol: en MTProto levantar una administración
    /// es <c>channels.editAdmin</c> sin ninguna bandera, no una petición de despromover.
    public static ChatAdminRights NoRights() => new() { flags = default };
}
