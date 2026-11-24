namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Las reglas de la firma de invitación: <c>groups.add.info</c> (<c>NativeBridge.java:744</c>) y
/// <c>groups.member.add</c> (<c>:745</c>). Viven aquí, y no dentro del cable, por la misma razón por la que
/// <c>MemberAdditions.java</c> existe al otro lado: son reglas de Telegram, no de la librería. Las catorce frases
/// están copiadas carácter a carácter de <c>MemberAdditions.java:24-37</c> y de su espejo
/// <c>memberAdditions.ts:9-25</c>, y <c>rondaBB.test.ts</c> las compara con las dos.
/// <para>
/// Lo que la ronda P hizo en Android y esta ronda hace en Windows no es lo mismo ni en el doble de llamadas. TDLib
/// expone <c>AddChatMember(chatId, userId, forwardLimit)</c> para básico y supergrupo por igual; MTProto tiene dos
/// peticiones distintas y ninguna viene en el envoltorio cómodo de la librería: <c>messages.addChatUser</c> existe
/// como <see cref="WTelegram.Client.AddChatUser(InputPeer,InputUserBase)"/>, pero **sin el campo de historial**, así
/// que se manda la petición a mano sobre <c>TL.Methods.Messages_AddChatUser</c>, que sí trae <c>fwd_limit</c>
/// (medido con la sonda); y para el canal no hay envoltorio ninguno —<c>channels.inviteToChannel</c> solo aparece
/// como clase de petición <c>TL.Methods.Channels_InviteToChannel</c>, despachada con <c>Client.Invoke</c>—.
/// </para>
/// <para>
/// Las dos responden lo mismo: <see cref="Messages_InvitedUsers"/>, que trae <c>missing_invitees</c> y
/// <c>updates</c>. <c>missing_invitees</c> es el gemelo de <c>FailedToAddMembers</c> de TDLib, y con las mismas dos
/// señales legibles: <c>MissingInvitee.Flags.premium_would_allow_invite</c> y
/// <c>premium_required_for_pm</c> (<c>MemberAdditions.reason</c>, <c>:157</c>). Nada más sabe decir Telegram, y
/// nada más se dice aquí.
/// </para>
/// <para>
/// La confirmación sigue siendo una pregunta aparte, como en Android. La respuesta buena de una firma no nombra a
/// quien entró: solo a quien no entró. Por eso, tras cada intento se vuelve a leer el estado de la persona
/// (<c>GetChatMember</c> allá, <c>AddedAsync</c> aquí) y solo se dice <see cref="Added"/> si la fila aparece
/// dentro. <c>updates</c> trae a veces la fila nueva (<c>updateChatParticipant</c>), pero usarla en lugar de
/// preguntar sería cambiar la promesa de una capa por la de otra, y la promesa es la de Android.
/// </para>
/// </summary>
public static class DesktopMemberAdditions
{
    /// <c>MemberAdditions.BASIC_LIMIT</c> (<c>:18</c>): la schema describe el básico como «0-200 users».
    public const int BasicLimit = 200;

    /// <c>MAX_BATCH</c> (<c>:20</c>): <c>addChatUser</c> es de una en una, y la tanda se hace en serie.
    public const int MaxBatch = 20;

    /// <c>MAX_FORWARD</c> (<c>:22</c>): <c>forward_limit</c> está acotado por la propia schema.
    public const int MaxForward = 100;

    /// <c>addResult</c> (<c>:2149</c>) recorta el nombre a sesenta; el de la lista de miembros noventa.
    public const int NameShown = 60;

    /// <c>confirmAdd</c> (<c>:2102</c>) recorta a cuarenta los nombres que se enseñan en el cuadro, que no son los
    /// de la lista ni los del informe: tres frases en una ventana no admiten nombres enteros.
    public const int NameInDialog = 40;

    /// El título y el botón derecho del cuadro, los dos de <c>confirmAdd</c> (<c>:2109-2112</c>).
    public const string DialogTitle = "Añadir en Telegram";

    public const string Unsupported = "Solo en grupos se añade a otras personas; en un privado o un secreto Telegram decide quién está.";
    public const string Migrated = "Ese grupo se convirtió en supergrupo; añade a las personas desde el chat nuevo.";
    public const string Banned = "Telegram tiene bloqueada esta cuenta en el grupo: no puede invitar a nadie.";
    public const string Outside = "Primero tienes que estar dentro del grupo para invitar a alguien.";
    public const string NoRight = "Telegram no concede a esta cuenta permiso para invitar en este grupo.";
    public const string Full = "Un grupo básico llega hasta 200 miembros y ya está lleno; Telegram lo convierte en supergrupo antes de admitir más.";
    public const string Empty = "Elige al menos una persona para añadir.";
    public const string TooMany = "Telegram añade de una en una: selecciona hasta 20 personas por vez.";
    public const string BadId = "Alguna de las personas elegidas no tiene un identificador de Telegram válido.";
    public const string BadForward = "Los mensajes que ve al entrar tienen que ser entre 0 y 100.";
    public const string PremiumWouldAllow = "Telegram solo permite invitar a esta persona con una cuenta con Telegram Premium.";
    public const string PremiumRequired = "Este chat exige Telegram Premium para enviar el enlace a esta persona.";
    public const string Failed = "Telegram no añadió a esta persona.";
    public const string Unconfirmed = "Telegram respondió pero no confirmó la membresía; revisa la lista antes de repetir.";

    /// <c>CANCELLED_NOTICE</c> (<c>:38</c>): la frase que la pantalla arma cuando <c>stopped</c> vale el marcador.
    public const string CancelledNotice = "Cancelado: nadie fue añadido.";

    /// Los cuatro marcadores de <c>:41-47</c>. <see cref="Cancelled"/> es un marcador de <c>stopped</c>, no un estado de
    /// fila: la persona cerró el cuadro y a nadie se le preguntó, así que la tanda viene vacía.
    public const string Added = "added";
    public const string Rejected = "rejected";
    public const string Unclear = "unclear";
    public const string Cancelled = "cancelled";

    /// Las dos guardas de cuenta de <c>:2122</c> y <c>:2131</c>, que caen en medio de la tanda.
    public const string ChangedAccount = "La cuenta cambió. Revisa el grupo antes de repetir.";

    /// Cuestión de Windows y solo de Windows: TDLib guarda los <c>access_hash</c> en su base de datos y
    /// <c>AddChatMember</c> pide un número suelto; MTProto exige el par identificador + <c>access_hash</c> en cada
    /// firma y ese par solo lo tiene la caché que las respuestas van llenando. La persona sin par no se manda a
    /// medias: se nombra en el informe con su estado <see cref="Unclear"/>, porque a ella no se le preguntó a Telegram.
    public const string NeedsHash = "Telegram no dio los datos necesarios para invitar a esta persona. Ábrela desde la lista de miembros e inténtalo otra vez.";

    /// <c>MemberAdditions.applicable</c> (<c>:60</c>) y <c>forwardsHistory</c> (<c>:65</c>): la forma del chat ya la
    /// dijo <see cref="DesktopMembership.Of"/>, y el historial solo viaja en el básico porque
    /// <c>forward_limit</c> «is ignored for supergroups and channels».
    public static bool Applicable(DesktopMembership.Kind kind) => kind != DesktopMembership.Kind.Unsupported;

    public static bool ForwardsHistory(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Basic;

    /// <c>forward</c> (<c>:135</c>): fuera del básico se manda cero, y dentro se recorta a cien.
    public static int ForwardLimit(DesktopMembership.Kind kind, int requested) =>
        !ForwardsHistory(kind) || requested <= 0 ? 0 : Math.Min(requested, MaxForward);

    /// <c>forwardProblem</c> (<c>:140</c>).
    public static string? ForwardProblem(int requested) =>
        requested < 0 || requested > MaxForward ? BadForward : null;

    /// <c>batch</c> (<c>:112</c>): cadena vacía nunca; <c>null</c> significa «el lote cabe».
    public static string? Batch(int count) => count <= 0 ? Empty : count > MaxBatch ? TooMany : null;

    /// <c>positive</c> (<c>:119</c>): dígitos sueltos, como mucho diecinueve, y el número mayor que cero.
    public static bool Positive(string? value)
    {
        if (string.IsNullOrEmpty(value) || value.Length > 19) return false;
        long parsed = 0;
        foreach (var digit in value)
        {
            if (digit < '0' || digit > '9') return false;
            parsed = parsed * 10 + (digit - '0');
            if (parsed <= 0) return false;
        }
        return true;
    }

    /// <c>addMembers</c> (<c>:2073-2079</c>): se descarta al propio usuario y se conserva el orden de la primera
    /// aparición, que es el orden en que la tanda se ejecuta y el orden del informe.
    public static List<string> Unique(IEnumerable<string> raw, long selfId)
    {
        var seen = new List<string>();
        foreach (var value in raw)
        {
            if (!long.TryParse(value, out var id) || id == selfId) continue;
            if (!seen.Contains(value)) seen.Add(value);
        }
        return seen;
    }

    /// <c>inside</c> (<c>:69</c>) sobre la tabla de un básico: <c>messages.getFullChat</c> solo enumera a los que
    /// están dentro, así que tener fila es estar. Quien se fue no tiene fila y quien fue expulsado desaparece de la
    /// tabla —no existe el <c>ChatMemberStatusLeft</c> de TDLib en un básico—, y las dos cosas se cuentan igual: fuera.
    public static bool Inside(ChatParticipantBase? self) => self != null;

    /// <c>inside</c> sobre la página de un canal: las cuatro filas de dentro y ninguna de las dos de fuera.
    public static bool Inside(ChannelParticipantBase? self) =>
        self is ChannelParticipantCreator or ChannelParticipantAdmin or ChannelParticipant or ChannelParticipantSelf;

    /// <c>blocked</c> (<c>:71</c>): en un canal es la fila de sanción con la lectura cortada, que es exactamente lo
    /// que ya sabe decir <see cref="DesktopGroupMembers.IsBanned"/>. No hay una segunda definición de «baneado».
    public static bool Blocked(ChannelParticipantBase? self) => self != null && DesktopGroupMembers.IsBanned(self);

    /// <c>mayInvite</c> (<c>:84</c>) en el básico: cualquier fila de la tabla puede invitar. La bandera
    /// <c>can_invite</c> ya no existe en <c>TL.ChatParticipant</c> —lo mide la sonda sobre 4.4.10: su único flag es
    /// <c>has_rank</c>—, y TDLib tampoco la pide: el creador, el admin y el miembro valen por igual.
    public static bool MayInvite(ChatParticipantBase? self) => self != null;

    /// <c>mayInvite</c> en el canal (<c>:84-95</c>): creador, o administrador con <c>canInviteUsers</c>, que en
    /// MTProto es <c>ChatAdminRights.Flags.invite_users</c> —la tercera bandera del enum, medida con la sonda—. Un
    /// miembro normal de un supergrupo no puede, igual que en Android: no se le busca un permiso que la schema no le da.
    public static bool MayInvite(ChannelParticipantBase? self) => self switch
    {
        ChannelParticipantCreator => true,
        ChannelParticipantAdmin admin => admin.admin_rights != null
            && (admin.admin_rights.flags & ChatAdminRights.Flags.invite_users) != 0,
        _ => false,
    };

    /// <c>problem</c> (<c>:101-109</c>), con su orden: forma, migración, bloqueo, pertenencia, permiso y lleno. El
    /// orden es la prueba: <c>indexOf</c> sobre el cuerpo del cable, no una afirmación sobre él.
    public static string? Problem(DesktopMembership.Kind kind, bool migrated, int memberCount, bool inside, bool blocked, bool mayInvite)
    {
        if (!Applicable(kind)) return Unsupported;
        if (kind == DesktopMembership.Kind.Basic && migrated) return Migrated;
        if (blocked) return Banned;
        if (!inside) return Outside;
        if (!mayInvite) return NoRight;
        if (kind == DesktopMembership.Kind.Basic && memberCount >= BasicLimit) return Full;
        return null;
    }

    /// <c>named</c> (<c>:148</c>): la respuesta nombra a los que NO entraron, y solo a ellos.
    public static MissingInvitee? Named(Messages_InvitedUsers? answer, long userId) =>
        answer?.missing_invitees?.FirstOrDefault(item => item != null && item.user_id == userId);

    /// <c>reason</c> (<c>:157</c>): las dos únicas razones que la schema sabe decir; si no, el rechazo sin adornos.
    public static string Reason(MissingInvitee? failed) => failed switch
    {
        null => Failed,
        _ when (failed.flags & MissingInvitee.Flags.premium_required_for_pm) != 0 => PremiumRequired,
        _ when (failed.flags & MissingInvitee.Flags.premium_would_allow_invite) != 0 => PremiumWouldAllow,
        _ => Failed,
    };

    /// <c>outcome</c> (<c>:168</c>): rechazada si Telegram la nombró, añadida solo si la relectura la muestra dentro
    /// y sin confirmar en cualquier otro caso. No hay cuarta salida ni optimismo.
    public static string Outcome(MissingInvitee? failed, bool insideAfter) =>
        failed != null ? Rejected : insideAfter ? Added : Unclear;

    /// <c>addInfo</c> (<c>:2057</c>): <c>remaining</c> solo se sabe en un básico con cifra leída; todo lo demás es
    /// «no lo sé» y la pantalla lo traduce por su frase general de reparto.
    public static int Remaining(DesktopMembership.Kind kind, int memberCount) =>
        kind == DesktopMembership.Kind.Basic && memberCount >= 0 ? BasicLimit - memberCount : -1;

    /// El cuerpo de <c>addInfo</c> (<c>:2055-2058</c>): las cuatro claves, en el orden de Android.
    public static object Info(bool allowed, string reason, bool forward, int remaining) =>
        new { allowed, reason, forward, remaining };

    /// Una fila de <c>addResult</c> (<c>:2146-2151</c>): identificador como texto, nombre recortado, estado y motivo.
    public static object Row(long id, string name, string state, string reason) =>
        new { id = id.ToString(System.Globalization.CultureInfo.InvariantCulture), name, state, reason = reason ?? "" };

    /// El cierre de <c>answerAdd</c> (<c>:2166-2168</c>): la tanda y, si se cortó, por qué.
    public static object Answer(IEnumerable<object> rows, string stopped) =>
        new { results = rows.ToArray(), stopped = stopped ?? "" };

    /// <c>confirmAdd</c> (<c>:2100-2104</c>): los tres primeros nombres, y «y N más» con el resto.
    public static string Names(IEnumerable<string> names)
    {
        var list = names.ToList();
        var shown = string.Join(", ", list.Take(3));
        return list.Count > 3 ? shown + " y " + (list.Count - 3) + " más" : shown;
    }

    /// El mensaje del cuadro, con la frase de historial solo cuando el historial viaja (<c>:2106-2108</c>).
    public static string Body(string names, string title, int forward) =>
        "WRGram añadirá a " + names + " en «" + title + "». Telegram decide una por una y puede negarse sin dar motivo; cada respuesta aparece al terminar." +
        (forward > 0 ? " Verá los " + forward + " mensajes anteriores." : "");

    /// El título recortado a sesenta y cuatro, como <c>NativeSnapshot.limit(chat.title, 64)</c> (<c>:2105</c>).
    public static string DialogBody(IEnumerable<string> names, string title, int forward) =>
        Body(Names(names), DesktopContact.Limit(title ?? "", 64), forward);

    /// El nombre de la fila, con el mismo respaldo que la lista de miembros y el recorte de <c>:2149</c>.
    public static string Name(User? user) => DesktopContact.Limit(DesktopGroupMembers.Name(user), NameShown);

    /// El mismo nombre con el recorte del cuadro (<c>:2102</c>): los dos recortes son distintos a propósito, y
    /// <c>DesktopGroupMembers.Name</c> ya puso el respaldo «Usuario de Telegram» cuando la persona no está.
    public static string DialogName(User? user) => DesktopContact.Limit(DesktopGroupMembers.Name(user), NameInDialog);
}
