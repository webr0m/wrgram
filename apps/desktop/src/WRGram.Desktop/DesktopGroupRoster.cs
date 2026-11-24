namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using TL;

/// <summary>
/// La lista entera de un grupo básico en Windows, y lo que esa lista admite hacer. En Android vive repartida en dos
/// clases puras —<c>BasicGroupRoster</c> para el orden, los estados y las cifras, y <c>BasicGroupMemberAction</c>
/// para lo que se puede prometer de cada fila— más el cable <c>NativeBridge.basicRoster</c>/<c>writeRoster</c>
/// (<c>NativeBridge.java:2828-2863</c>). Aquí están las dos clases juntas, porque en Windows no hay TDLib que
/// ordene ni traduzca: la pregunta es una (<c>messages.getFullChat</c>) y la respuesta trae los participantes sin
/// orden ni palabras.
/// <para>
/// Lo que midió la reflexión sobre WTelegramClient 4.4.10 (<c>.tools/membersprobe</c>):
/// <list type="bullet">
/// <item><description>La lista del básico viene dentro del <c>full info</c> —<c>Messages_GetFullChat(Client, long)
/// </c> → <c>Messages_ChatFull.full_chat</c> es <c>ChatFull</c>, y su campo <c>participants</c> es
/// <c>ChatParticipantsBase</c>, que se materializa en <c>TL.ChatParticipants {chat_id, participants[], version}</c>
/// o en <c>TL.ChatParticipantsForbidden {chat_id, self_participant, version}</c>—. Cabe entera: la propia schema
/// limita el básico a <see cref="Max"/>, igual que allá.</description></item>
/// <item><description>El estado es el constructor, no una bandera: <c>chatParticipantCreator</c>,
/// <c>chatParticipantAdmin</c> (que <b>deriva</b> de <c>chatParticipant</c>, así que el orden de la comprobación
/// importa) y <c>chatParticipant</c>. <c>ChatParticipant.Flags</c> solo tiene <c>has_rank</c>: no existe bandera de
/// «salió» ni de «baneado». Consecuencia escrita —</description></item>
/// <item><description>En Windows las tres palabras <see cref="Restringido"/>, <see cref="Salio"/> y
/// <see cref="Baneado"/> no pueden salir de esta lista, porque Telegram no las publica para un básico por este
/// camino. Android las puede tener porque TDLib conserva a quien se fue. No es una cifra maquillada: los dos
/// recuentos —devueltos y dentro— salen de las filas que hay, y cuando todas están dentro la frase que se lee es
/// «todas siguen dentro», que es cierta.</description></item>
/// <item><description>El creador no se lee de un campo del chat: <c>TL.Chat</c> no tiene <c>creator_user_id</c>. Lo
/// dice la fila <c>chatParticipantCreator</c>, así que <see cref="Creator"/> la busca y, si no está, responde
/// <see cref="NoCreator"/> igual que Android responde <c>creatorUserId == 0</c>.</description></item>
/// </list>
/// </para>
/// <para>
/// Y una regla que no se pudo copiar carácter a carácter. <c>BasicGroupMemberAction.mayRemove</c>
/// (<c>BasicGroupMemberAction.java:44-51</c>) admite al administrador solo si su <c>rights.canRestrictMembers</c>
/// está escrito; en un básico de MTProto la fila de administración no trae tabla de derechos, porque un básico no
/// los reparte —es la misma razón por la que <c>promoteProblem</c> niega la promoción aquí—. Toda administración de
/// un básico puede expulsar, y así está puesto.
/// </para>
/// </summary>
public static class DesktopGroupRoster
{
    /// <c>BasicGroupRoster.MAX</c>, que es <c>MemberAdditions.BASIC_LIMIT</c> (<c>MemberAdditions.java:18</c>).
    public const int Max = 200;

    /// <c>BasicGroupRoster.MAX_QUERY</c> (<c>:23</c>). En esta lista el largo se mide recortado
    /// (<c>tooLong</c>, <c>:97</c>); en la de supergrupos se mide sin recortar. Son dos caminos distintos y cada
    /// uno reproduce el suyo.
    public const int MaxQuery = 80;

    /// Las cinco frases de <c>BasicGroupRoster.java:25-29</c>, copiadas carácter a carácter.
    public const string Unsupported =
        "La lista entera de un chat solo la da Telegram en los grupos básicos; en supergrupos y canales se pide por páginas.";
    public const string Empty = "Telegram no devolvió ninguna persona en la lista de este grupo básico.";
    public const string NoCreator = "Telegram no dice quién creó este grupo.";
    /// <c>BasicGroupRoster.ORDER</c> (<c>:28</c>). Se llama <see cref="OrderNote"/> y no <c>Order</c> porque
    /// el orden de verdad es el método <see cref="Order"/>, y en C# un campo y un método no comparten nombre.
    public const string OrderNote =
        "Primero van quien creó el grupo y la administración; el resto se ordena por identificador, no por actividad reciente.";
    public const string TooLongQuery = "La búsqueda de miembros admite hasta 80 caracteres.";

    /// El <c>catch</c> de <c>writeRoster</c> (<c>NativeBridge.java:2840</c>).
    public const string Unreadable = "No se pudo preparar la lista del grupo.";

    /// Una negación que en Android no existe. Allá el <c>access_hash</c> lo guarda TDLib y el puente solo
    /// <c>new TdApi.InputMessageUser(userId)</c>; aquí la escritura de <c>messages.deleteChatUser</c> pide un
    /// <c>InputUser(id, access_hash)</c> y el hash solo viene en las respuestas que lo traen enteras. Un
    /// <c>chatParticipant</c> cuya persona llegue recortada (<c>min</c>, sin hash) no se puede expulsar, y se dice
    /// en vez de mandar un cero que Telegram rechazaría con un código que la pantalla no sabría traducir.
    public const string NoHash =
        "Telegram no dio los datos necesarios para expulsar a esta persona. Vuelve a abrir la lista e inténtalo de nuevo.";

    /// Los siete estados de <c>BasicGroupRoster.java:31-37</c>.
    public const string Propietario = "Propietario";
    public const string Administrador = "Administrador";
    public const string Miembro = "Miembro";
    public const string Restringido = "Restringido";
    public const string Salio = "Salió";
    public const string Baneado = "Baneado";
    public const string SinEstado = "Sin estado";

    /// Las ocho frases de <c>BasicGroupMemberAction.java:20-30</c> que este flujo puede llegar a decir.
    public const string NoRight = "Telegram no concede a esta cuenta permiso para expulsar personas del grupo.";
    public const string Self = "No te expulses a ti mismo desde la lista: para salir usa «Salir del grupo».";
    public const string CreatorProblem = "Al creador del grupo no se le expulsa: solo puede salir él.";
    public const string Outside = "Esta persona ya no está dentro del grupo: no hay nada que expulsar.";
    public const string NoDuration = "La expulsión de un grupo básico no tiene plazo: siempre es definitiva.";
    public const string RevokeOn = "También se borrarán los mensajes que esta persona envió en el grupo.";
    public const string RevokeOff = "Sus mensajes se quedan en el grupo.";
    public const string Scope =
        "En un grupo básico Telegram solo permite expulsar o invitar: no hay permisos parciales ni administración a la carta.";
    public const string NoRestrict =
        "En un grupo básico Telegram no admite restricciones parciales: o expulsa o no hace nada.";
    public const string NoPromote =
        "En un grupo básico la administración no se reparte en permisos: Telegram solo permite elegirlos en supergrupos y canales.";
    public const string UnbanHint =
        "Para que vuelva, invítalo de nuevo desde la tanda: en un grupo básico no hay baneo que levantar.";

    /// El título y los dos botones del <c>Dialogs</c> de <c>banBasicMember</c> (<c>NativeBridge.java:2902-2904</c>)
    /// y las dos frases de guarda (<c>:2890</c> la cuenta, <c>:2884-2885</c> el estado).
    public const string DialogAccept = "Expulsar";
    public const string ChangedAccount = "La conversación cambió. No se expulsó a nadie.";

    /// La lista entera solo se puede mirar si la fila es un básico (<c>BasicGroupRoster.applicable</c>,
    /// <c>:42-44</c>) y si Telegram devolvió una tabla de participantes y no la forma prohibida.
    public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Basic;

    /// <c>BasicGroupRoster.tooLong</c> (<c>:96-98</c>): se recorta antes de medir.
    public static bool TooLong(string? query) => (query ?? "").Trim().Length > MaxQuery;

    /// <c>BasicGroupRoster.status</c> (<c>:60-68</c>). Los tres que MTProto sabe decir, y <see cref="SinEstado"/>
    /// para una forma que no se esperaba: un estado nuevo no se disfraza de miembro.
    public static string Status(ChatParticipantBase? part) => part switch
    {
        ChatParticipantCreator => Propietario,
        ChatParticipantAdmin => Administrador,
        ChatParticipant => Miembro,
        _ => SinEstado
    };

    /// <c>ChatMembership.inside</c> aplicado a lo que esta lista sabe traer (<c>ChatMembership.java:56-60</c>): las
    /// tres formas conocidas están dentro y una forma rara no cuenta, igual que allá no cuenta un <c>Left</c> o un
    /// <c>Banned</c>.
    public static bool Inside(ChatParticipantBase? part) =>
        part is ChatParticipantCreator or ChatParticipantAdmin or ChatParticipant;

    /// <c>BasicGroupRoster.rank</c> (<c>:71-76</c>) con las mismas cuatro salidas: creador dentro, administración,
    /// el resto dentro, fuera y lo desconocido.
    public static int Rank(ChatParticipantBase? part) => part switch
    {
        ChatParticipantCreator creator => Inside(creator) ? 0 : 3,
        ChatParticipantAdmin => 1,
        _ => Inside(part) ? 2 : (part == null ? 4 : 3)
    };

    /// <c>BasicGroupRoster.userId</c> (<c>:55-57</c>): cero para lo que no sea una persona.
    public static long Person(ChatParticipantBase? part) => part switch
    {
        ChatParticipant p => p.user_id,
        ChatParticipantCreator p => p.user_id,
        _ => 0L
    };

    /// <c>BasicGroupRoster.visible</c> (<c>:51-53</c>): aquí toda forma conocida es una persona, así que se descarta
    /// lo que no traiga identificador.
    public static bool Visible(ChatParticipantBase? part) => part != null && Person(part) != 0L;

    /// <c>BasicGroupRoster.order</c> (<c>:79-86</c>): orden nuevo sin tocar el array de Telegram, por rango y luego
    /// por identificador. <c>OrderBy</c> de LINQ es estable, como <c>Arrays.sort</c> sobre una copia.
    public static List<ChatParticipantBase> Order(IEnumerable<ChatParticipantBase> parts) =>
        parts.Where(Visible).OrderBy(Rank).ThenBy(Person).ToList();

    /// <c>BasicGroupRoster.inside</c> (<c>:89-94</c>).
    public static int InsideCount(IEnumerable<ChatParticipantBase> parts) => parts.Count(Inside);

    /// <c>BasicGroupRoster.remaining</c> (<c>:109-111</c>): nunca un negativo, aunque la lista sorprenda.
    public static int Remaining(int inside) => Math.Max(0, Max - inside);

    /// <c>BasicGroupRoster.matches</c> (<c>:101-106</c>): minúsculas sobre nombre o usuario. Allá se usa
    /// <c>toLowerCase(Locale.ROOT)</c> para que un turco no escriba «I» en vez de «i»; aquí
    /// <c>ToLowerInvariant</c> es ese mismo idioma sin cultura.
    public static bool Matches(string? query, string name, string username)
    {
        var needle = (query ?? "").Trim().ToLowerInvariant();
        if (needle.Length == 0) return true;
        if (name.ToLowerInvariant().Contains(needle, StringComparison.Ordinal)) return true;
        return username.ToLowerInvariant().Contains(needle, StringComparison.Ordinal);
    }

    /// <c>BasicGroupRoster.note</c> (<c>:118-128</c>) palabra por palabra, incluidas las dos comas y los dos puntos
    /// de las frases de recuento. La última parte es la que Android solo añade cuando el creador vale cero.
    public static string Note(long creatorId, int listed, int inside)
    {
        if (listed <= 0) return Empty;
        var head = listed == 1
            ? "Telegram devolvió 1 persona de la lista completa del grupo; "
            : "Telegram devolvió " + listed + " personas de la lista completa del grupo; ";
        var rest = inside == listed
            ? inside == 1 ? "sigue dentro." : "todas siguen dentro."
            : inside == 0
                ? "ninguna sigue dentro: los demás se fueron o fueron expulsados."
                : inside + " siguen dentro y " + (listed - inside)
                  + (listed - inside == 1 ? " se fue o fue expulsada." : " se fueron o fueron expulsados.");
        return head + rest + (creatorId == 0 ? " " + NoCreator : "");
    }

    /// <c>BasicGroupRoster.status</c> necesita el identificador del creador, que en TDLib es un campo del
    /// <c>BasicGroupFullInfo</c> y aquí es la fila <c>chatParticipantCreator</c>.
    public static long Creator(IEnumerable<ChatParticipantBase> parts) =>
        parts.OfType<ChatParticipantCreator>().Select(part => part.user_id).FirstOrDefault();

    /// El nombre de <c>rosterName</c> (<c>NativeBridge.java:2864-2870</c>), que desde la ronda BW pide a
    /// <c>PersonName.java</c> la regla: los dos nombres unidos, el usuario con arroba si no hay nombre, y
    /// «Usuario de Telegram» si no hay nada. Recortado a noventa en los dos primeros casos.
    public static string Name(User? user)
    {
        if (user == null) return DesktopGroupMembers.UnknownPerson;
        var name = DesktopCommunityInfo.Prepared((user.first_name ?? "") + " " + (user.last_name ?? ""));
        if (name.Length > 0) return DesktopContact.Limit(name, DesktopGroupMembers.NameShown);
        var handle = Username(user);
        return handle == null ? DesktopGroupMembers.UnknownPerson : DesktopContact.Limit("@" + handle, DesktopGroupMembers.NameShown);
    }

    /// <c>rosterUsername</c> (<c>:2856-2860</c>): el usuario editable primero y, si no, el activo. En TDLib el
    /// editable solo viene relleno para la propia cuenta; MTProto publica el activo de cualquiera, así que la
    /// primera rama es la que se usa y la segunda queda de respaldo.
    public static string? Username(User? user)
    {
        if (user == null) return null;
        var main = user.MainUsername;
        if (!string.IsNullOrEmpty(main)) return main;
        return user.ActiveUsernames?.FirstOrDefault();
    }

    /// <c>BasicGroupRoster.invitedName</c>: sin invitador no hay firma que decir, y un «0» pintado en la
    /// lista sería exactamente el defecto que esta regla cierra. La pantalla mira la cadena vacía.
    public static string InvitedName(long inviterId, string name) => inviterId == 0 ? "" : name;

    /// El <c>inviter_id</c> de <c>TL.ChatParticipant</c>. Solo la fila ordinaria lo trae: la creadora y la
    /// administración entraron sin invitador, y un número suelto no es un nombre.
    public static long InviterId(ChatParticipantBase? part) => part is ChatParticipant inviter ? inviter.inviter_id : 0L;

    /// La fila de <c>writeRoster</c> (<c>NativeBridge.java:2840-2845</c>): las once claves, en su orden.
    /// <list type="bullet">
    /// <item><description><c>since</c> es <c>joinedChatDate</c> en segundos; la fila del creador no trae fecha en
    /// MTProto y responde cero, que la pantalla ya lee como «sin fecha» (<c>groupRoster.ts:61</c>).</description>
    /// </item>
    /// <item><description><c>invitedBy</c> es <c>inviterUserId</c> como cadena, con el «0» de Android cuando no hay
    /// quien invitó.</description></item>
    /// <item><description><c>invitedByName</c> es ese invitador resuelto contra la caché de peers que la misma
    /// respuesta ya trajo: vacío cuando no hay invitador y «Usuario de Telegram» cuando Telegram no describe a
    /// la persona, que es el mismo respaldo con el que la fila se nombra a sí misma.</description></item>
    /// <item><description><c>tag</c> va vacío: <c>TL.ChatParticipant</c> no publica ninguna etiqueta —su único
    /// campo opcional es <c>rank</c>, el título del administrador, que TDLib trae aparte y esta fila no pedía—.
    /// Poner el <c>rank</c> aquí sería cambiar lo que significa la clave.</description></item>
    /// </list>
    public static object Row(ChatParticipantBase part, User? user, long selfId, User? inviter)
    {
        var id = Person(part);
        var who = InviterId(part);
        return new
        {
            id = id.ToString(CultureInfo.InvariantCulture),
            name = Name(user),
            username = Username(user) is { Length: > 0 } handle ? "@" + handle : "",
            status = Status(part),
            inside = Inside(part),
            self = id == selfId,
            bot = user?.IsBot ?? false,
            since = part is ChatParticipant member ? TelegramService.Unix(member.date) : 0L,
            invitedBy = who.ToString(CultureInfo.InvariantCulture),
            invitedByName = InvitedName(who, Name(inviter)),
            tag = ""
        };
    }

    /// <c>BasicGroupMemberAction.mayRemove</c> (<c>:44-51</c>) con la salvedad escrita arriba: en un básico la
    /// administración no tiene tabla de derechos que consultar, así que toda administración puede expulsar.
    public static bool MayRemove(ChatParticipantBase? self) =>
        self is ChatParticipantCreator or ChatParticipantAdmin;

    /// <c>BasicGroupMemberAction.banProblem</c> (<c>:57-63</c>) en su orden exacto: uno mismo, el creador, el que ya
    /// no está, y el derecho propio. Los tres primeros se deciden con la lista en la mano; el cuarto, con la fila
    /// propia.
    public static string? BanProblem(ChatParticipantBase? self, ChatParticipantBase? target, long selfId, long targetId)
    {
        if (targetId == selfId) return Self;
        if (target is ChatParticipantCreator) return CreatorProblem;
        if (target is not ChatParticipant and not ChatParticipantAdmin) return Outside;
        if (!MayRemove(self)) return NoRight;
        return null;
    }

    /// <c>BasicGroupMemberAction.durationProblem</c> (<c>:79-81</c>): un plazo en un básico es una promesa vacía.
    public static string? DurationProblem(long requested) => requested != 0 ? NoDuration : null;

    /// <c>BasicGroupMemberAction.confirm</c> (<c>:98-100</c>): la línea del diálogo, que dice qué pasa con los
    /// mensajes sin rodeos. El espacio del final es el que Java pega antes de la segunda frase.
    public static string Confirm(string name, bool revoke) =>
        "Se expulsará a " + name + " del grupo de forma definitiva. " + (revoke ? RevokeOn : RevokeOff);

    /// El título del diálogo: <c>"Expulsar de " + chat.title</c> (<c>NativeBridge.java:2902</c>).
    public static string DialogTitle(string chatTitle) => "Expulsar de " + chatTitle;

    /// <summary>
    /// Qué se responde cuando la pantalla pide restringir, promover, despromover o levantar un baneo sobre una fila
    /// que no es un supergrupo ni un canal. Es el orden de <c>banGroupMember</c>
    /// (<c>NativeBridge.java:2910</c>), que entra en <c>banBasicMember</c> cuando el chat es un básico y ese método
    /// contesta primero <c>restrictProblem</c> (<c>:2892</c>): dentro de un básico la negación es de protocolo
    /// —Telegram no admite restricciones parciales, ni permisos a la carta, ni baneo que levantar—, y para las formas
    /// que <c>applicable</c> niega en <c>:2899</c> Android tiene una sola frase. Desde la ronda AZ las cuatro
    /// cuatro escrituras sí están conectadas en un supergrupo y en un canal, así que aquí no se decide ningún hueco
    /// de esta aplicación: solo la forma de la fila.
    /// </summary>
    public static string WriteProblem(DesktopMembership.Kind kind, string basicProblem) =>
        kind == DesktopMembership.Kind.Basic ? basicProblem : DesktopMemberSanctions.RequiresSupergroup;
}
