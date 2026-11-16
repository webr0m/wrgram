namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using TL;

/// <summary>
/// La gestión de los enlaces de invitación de una comunidad en Windows. En Android son dos archivos:
/// <c>InviteLinks.java</c> pone los cinco techos, valida el marcador, proyecta la fila y decide qué se puede
/// cambiar; <c>NativeBridge.java</c> reparte el orden de los guardajes en cuatro métodos —<c>inviteLinks</c>
/// (<c>:3587</c>), <c>inviteLinkForm</c> (<c>:3623</c>) para crear y editar, y <c>revokeInviteLink</c>
/// (<c>:3681</c>), despachados en <c>:741-744</c>— más un quinto anterior, <c>createInviteLink</c>
/// (<c>:1863</c>, despachado en <c>:681</c>), que crea un enlace sin preguntar nombre, caducidad ni límite. Aquí esas
/// piezas están escritas una vez, con las frases copiadas carácter a carácter y el mismo orden, y el cable solo pide.
/// <para>
/// La medida, hecha por reflexión sobre WTelegramClient 4.4.10 y por el esquema MTProto de la capa 232 que trae el
/// paquete <c>@mtcute/core</c> del propio repositorio. Las dos librerías no guardan el mismo objeto: TDLib tiene
/// <c>ChatInviteLink</c> con <c>isPrimary</c>, <c>memberCount</c> y <c>pendingJoinRequestCount</c>, y MTProto tiene
/// <c>chatInviteExported</c> —el único <c>ExportedChatInvite</c> con datos; el otro derivado,
/// <c>chatInvitePublicJoinRequests</c>, no trae ni <c>link</c>—, con <c>usage</c> («How many users joined using this
/// link»), <c>requested</c> («Number of users that have already used this link to join»), <c>date</c> («When was this
/// chat invite created»), <c>start_date</c> («When was this chat invite last modified»), <c>title</c> («Custom
/// description for the invite link, visible only to admins») y <c>admin_id</c>. Las cuatro peticiones medidas son
/// <c>messages.getExportedChatInvites</c> (con <c>admin_id</c>, que es exactamente el <c>creator_user_id</c> con el
/// que Android llama), <c>messages.getExportedChatInvite</c>, <c>messages.exportChatInvite</c> y
/// <c>messages.editExportedChatInvite</c>.
/// </para>
/// <para>
/// Dos decisiones que el cable no puede improvisar y por eso viven aquí. La primera: en MTProto no hay una bandera
/// «principal» en la fila, así que la primacía se saca de comparar el enlace con el <c>exported_invite</c> del
/// <c>full info</c> del chat —<see cref="PrimaryOf"/>—, que es una ida a la red más por página, no un dato inventado;
/// sin esa comparación el panel ofrecería «Editar» en el enlace principal y el puente lo negaría con la frase de
/// Android. La segunda: no hay <c>RevokeChatInviteLink</c> que mandar. Lo que existe es
/// <c>editExportedChatInvite</c> con la bandera <c>revoked</c>, y es la misma escritura con la que Telegram deja de
/// aceptar el enlace; <c>deleteExportedChatInvite</c> queda fuera porque borra la fila en lugar de revocarla, y la
/// pestaña «Revocados» del panel no tiene nada que mostrar si la fila desaparece.
/// </para>
/// <para>
/// Y lo que no se copia, dicho en lugar de fingido. Android guarda el marcador que repartió
/// (<c>linkOwner</c>, <c>linkChat</c>, <c>linkRevoked</c>, <c>linkOffsetDate</c>, <c>linkOffsetLink</c>, <c>:3594</c>)
/// y niega cualquier marcador que no sea el último que él dio, con «Vuelve a abrir los enlaces para continuar.». En
/// MTProto la posición es un argumento de la petición (<c>offset_date</c> + <c>offset_link</c>), no un estado del
/// cliente, así que no hay memoria que pueda estar vieja ni frase que decir: se valida la forma del marcador
/// (<see cref="CursorProblem"/>) y se manda. También queda fuera la segunda parte del <c>expiration</c> de Android
/// (<c>InviteLinks.java:93</c>, «la caducidad no es válida» por desbordar un entero de 32 bits): aquí el cálculo viaja
/// en <c>long</c> y esa rama no puede ocurrir; la frase sí sigue viva, pero por el único camino que la alcanza, el
/// <c>expiresIn</c> negativo de <see cref="Problem"/>.
/// </para>
/// </summary>
public static class DesktopLinkManager
{
    // ---- los techos (`InviteLinks.java:12-16`) ----

    /// <c>InviteLinks.PAGE</c>: veinte enlaces por viaje, los mismos que la pantalla acumula con «Cargar más».
    public const int PageSize = 20;

    /// <c>InviteLinks.MAX_URL</c>, el tope con el que el puente java recibe el enlace y con el que se descarta una
    /// fila que no lo quepa.
    public const int MaxUrl = 512;

    /// <c>InviteLinks.MAX_NAME</c>, el techo del nombre que la persona escribe y de la fila que Telegram devuelve.
    public const int MaxName = 32;

    /// <c>InviteLinks.MAX_MEMBERS</c>.
    public const long MaxMembers = 99_999;

    /// <c>InviteLinks.MAX_SPAN</c>: un año en segundos, el margen máximo que Telegram admite antes de la caducidad.
    public const long MaxSpan = 31_536_000;

    /// El <c>NativeSnapshot.limit(chat.title,80)</c> que Android aplica al título de la comunidad en los tres
    /// cuerpos de diálogo (<c>NativeBridge.java:3639</c> y <c>:3690</c>).
    public const int ChatShown = 80;

    // ---- las frases ----

    /// Las tres veces que <c>:3589</c>, <c>:3625</c> y <c>:3683</c> niegan la forma, con la cadena exacta.
    public const string Unsupported = "Los enlaces de invitación solo existen en grupos y canales.";

    /// <c>InviteLinks.cursor</c> (<c>InviteLinks.java:32</c>, <c>:34</c> y <c>:36</c>), donde las cuatro negaciones del
    /// marcador son la misma frase.
    public const string CursorProblem = "El marcador de enlaces no es válido.";

    /// Los cuatro permisos negados de <c>inviteLinks</c>/<c>inviteLinkForm</c>/<c>revokeInviteLink</c>
    /// (<c>:3599</c>, <c>:3643</c>, <c>:3663</c> y <c>:3695</c>): la misma frase con cuatro verbos.
    public const string NoRightReview = "Telegram no concede a esta cuenta permiso para revisar sus enlaces de invitación.";
    public const string NoRightCreate = "Telegram no concede a esta cuenta permiso para crear enlaces de invitación.";
    public const string NoRightEdit = "Telegram no concede a esta cuenta permiso para editar sus enlaces de invitación.";
    public const string NoRightRevoke = "Telegram no concede a esta cuenta permiso para revocar sus enlaces de invitación.";

    /// <c>NativeBridge.java:3630</c>, cuando el enlace llega pero no tiene ninguna de las formas que Telegram produce.
    public const string InvalidLink = "El enlace no es válido.";

    /// <c>Indica qué enlace quieres revocar.</c> de <c>:3689</c>.
    public const string EmptyRevoke = "Indica qué enlace quieres revocar.";

    /// Las cinco frases de <c>InviteLinks.problem</c> (<c>InviteLinks.java:78-86</c>), en su orden de comprobación.
    public const string BadName = "El nombre del enlace no es válido.";
    public const string NameTooLong = "El nombre del enlace no puede superar 32 caracteres.";
    public const string BadExpiry = "La caducidad del enlace no es válida.";
    public const string TooFar = "Telegram no permite enlaces que caduquen más allá de un año.";
    public const string BadLimit = "El límite de miembros debe estar entre 0 y 99.999.";
    public const string ApprovalLimit = "Un enlace que exige aprobación no puede limitar además el número de miembros.";

    /// El <c>Telegram ya no reconoce ese enlace en este chat.</c> de las dos lecturas previas
    /// (<c>:3655</c> y <c>:3692</c>).
    public const string NotRecognised = "Telegram ya no reconoce ese enlace en este chat.";

    /// Las tres cadenas del <c>InviteLinks.editable</c> negado (<c>:3657-3659</c>), en el orden en que Android las
    /// prueba: pago, primacía y revocación.
    public const string PaidLinks = "Los enlaces de suscripción se administran desde Stars.";
    public const string PrimaryEdit = "El enlace principal no admite nombre, caducidad ni límite: revócalo y Telegram creará uno nuevo.";
    public const string AlreadyRevoked = "Ese enlace ya está revocado y no se puede editar.";

    /// Las dos frases de creador distinto (<c>:3664</c> y <c>:3696</c>), que en Android solo alcanzan al enlace
    /// principal: la tabla que se lista está filtrada por esta cuenta, así que <c>admin_id</c> de las demás filas ya
    /// es el propio.
    public const string OtherCreatorEdit = "Solo el propietario puede cambiar un enlace creado por otra persona.";
    public const string OtherCreatorRevoke = "Solo el propietario puede revocar un enlace creado por otra persona.";

    /// <c>confirmLink</c> (<c>:3713</c>), la guarda de cuenta dentro del botón positivo de los tres diálogos.
    public const string ChangedAccount = "La cuenta cambió. No se modificó ningún enlace.";

    /// Los tres rótulos de <c>Dialogs.builder</c> de <c>:3644</c>, <c>:3666</c> y <c>:3698</c>. El botón positivo es
    /// <see cref="DesktopCommunityInfo.DialogAccept"/> y el negativo <see cref="DesktopProfilePhoto.Cancel"/>: son las
    /// mismas dos cadenas que ya viven en la capa, y repetirlas aquí sería tener dos verdades para un mismo botón.
    public const string DialogCreate = "Crear enlace de invitación";
    public const string DialogEdit = "Cambiar enlace de invitación";
    public const string DialogRevoke = "Revocar enlace de invitación";

    /// Los dos rótulos con los que Android nombra el enlace en el diálogo: el del nombre que va a escribirse
    /// (<c>:3641</c>) y el del nombre que ya no está (<c>:3665</c> y <c>:3697</c>).
    public const string DefaultLabel = "WRGram";
    public const string NoLabel = "sin nombre";

    // ---- el enlace suelto, sin formulario (`chat.invite`) ----

    /// La forma que acepta <c>createInviteLink</c> (<c>NativeBridge.java:1863</c>) es la misma pareja de
    /// <see cref="Supported"/>, pero su negativa es otra letra: allá «solo se crean», aquí «solo existen». Las dos se
    /// copian cada una desde su línea; igualarlas sería borrar una de las dos frases de Android. El canal entra en la
    /// pareja aunque Java no lo nombre: en TDLib un canal es un <c>ChatTypeSupergroup</c> con <c>is_channel</c>, así
    /// que su guarda ya lo estaba aceptando.
    public const string NotCreatable = "Los enlaces de invitación solo se crean para grupos y canales.";

    /// El <c>setMessage</c> del diálogo de <c>:1863</c>, palabra por palabra. No es el de
    /// <see cref="FormBody"/>: aquí no hay nombre, caducidad ni límite que la persona haya elegido, así que no hay
    /// resumen que leer —lo que se le dice es lo que Telegram va a hacer por su cuenta.
    public const string QuickBody =
        "Telegram creará un enlace que cualquiera podrá reenviar. Caduca en 7 días y no limita el número de participantes. El enlace solo se comparte si luego eliges una aplicación.";

    /// El <c>setPositiveButton</c> de <c>:1863</c>. Android no usa en este diálogo el «Aplicar en Telegram» de
    /// <c>confirmLink</c> (<c>:3712</c>) con el que el formulario pregunta las otras tres escrituras: son dos
    /// <c>AlertDialog</c> distintos y cada uno lleva su rótulo, así que Windows también. El negativo sigue siendo
    /// <see cref="DesktopProfilePhoto.Cancel"/>, que es el «Cancelar» de los dos.
    public const string QuickAccept = "Crear enlace";

    /// Los <c>7L*24*60*60</c> de <c>:1863</c>. Es lo único que este flujo fija sin preguntar, y viaja por la misma
    /// regla de caducidad que el formulario (<see cref="Expires"/>).
    public const long QuickSpan = 7L * 24 * 60 * 60;

    /// Las dos cadenas con las que Android enseña el enlace cuando no hay ninguna aplicación a la que pasárselo
    /// (<c>:1863</c>): el título y el mensaje del <c>AlertDialog</c> que lleva la caja seleccionable. Windows toma
    /// ese camino siempre, porque no tiene <c>Intent.ACTION_SEND</c>.
    public const string DialogCreated = "Enlace creado";
    public const string CreatedBody = "Cópialo y compártelo solo con las personas que quieres invitar.";

    /// El <c>setPositiveButton("Cerrar",null)</c> del mismo diálogo: el único botón que tiene. Las negaciones del
    /// puente java lo usan también para los fallos, pero en esta capa solo vivía «Cancelar»
    /// (<see cref="DesktopProfilePhoto.Cancel"/>), que es otra cosa: aquí no se cancela nada, se cierra lo que ya
    /// está hecho.
    public const string DialogClose = "Cerrar";

    // ---- las frases que solo existen en Windows ----

    /// <c>requiredBool(p,"approval")</c> (<c>:3635</c>) es un fallo de programación en Java: su mensaje, «Missing
    /// permission: approval», llega a la pantalla en inglés porque el despacho de <c>:742</c> reenvía el
    /// <c>getMessage()</c> del <c>catch</c>. Aquí es la causa concreta en español, que es la norma de la casa desde la
    /// ronda AT.
    public const string IncompleteApproval =
        "La aprobación del enlace no llegó marcada como verdadera o falsa. Vuelve a abrir los enlaces e inténtalo otra vez.";

    /// La lectura del <c>full info</c> falla y con ella la única forma que hay en MTProto de saber si un enlace es el
    /// principal. Android no tiene este caso: <c>GetChatInviteLink</c> le devuelve <c>isPrimary</c> dentro de la misma
    /// fila. Negar la escritura es la única respuesta honesta, porque sin primacía no se puede afirmar que el enlace
    /// admite nombre ni que no es el principal.
    public const string PrimaryUnknown =
        "Telegram no devolvió el enlace principal de esta comunidad, así que WRGram no puede comprobar qué se puede cambiar de este enlace.";

    // ---- la forma ----

    /// <c>chat.type instanceof ChatTypeBasicGroup || chat.type instanceof ChatTypeSupergroup</c> (<c>:3589</c>,
    /// <c>:3625</c>, <c>:3683</c>): los cuatro flujos aceptan las dos formas, y en TDLib el canal <i>es</i> un
    /// supergrupo con <c>isChannel</c>. Es la misma pareja que aceptan <see cref="DesktopCommunityInfo.Supported"/> y
    /// el puente de Android, y la que pone la puerta del menú en la pantalla.
    public static bool Supported(DesktopMembership.Kind kind) => kind != DesktopMembership.Kind.Unsupported;

    /// <c>InviteLinks.validUrl</c> (<c>InviteLinks.java:72-75</c>) copiada entera, con sus dos guardas previas y la
    /// misma expresión: Java ancla <c>matches</c> por dentro, así que aquí la ancla se escribe.
    private static readonly Regex Shape = new(
        @"^(?i)(?:https://(?:t\.me|telegram\.me|telegram\.dog)/(?:join\?invite=\S+|joinchat/\S+|\+\S+|[A-Za-z][A-Za-z0-9_]{3,31})|tg://join\?invite=\S+)$",
        RegexOptions.CultureInvariant);

    private static readonly Regex Spaces = new(@".*\s.*", RegexOptions.CultureInvariant);
    private static readonly Regex Head = new("[0-9]{1,10}", RegexOptions.CultureInvariant);

    public static bool ValidUrl(string value) =>
        value.Length != 0 && value.Length <= MaxUrl && !Spaces.IsMatch(value) && Shape.IsMatch(value);

    // ---- el marcador ----

    /// <c>InviteLinks.token</c> (<c>InviteLinks.java:26</c>): <c>max(0,date) + ':' + link</c>, con el enlace tal cual.
    public static string Token(long created, string link) =>
        Math.Max(0L, created).ToString(CultureInfo.InvariantCulture) + ":" + link;

    /// La misma comprobación que <c>InviteLinks.cursor</c> (<c>InviteLinks.java:29-38</c>) y su misma frase, pero sin
    /// el <c>throw</c>: devuelve la causa o <c>null</c> cuando el marcador se puede mandar. Vacío es válido y significa
    /// «desde el principio», igual que allá.
    public static string? CursorIssue(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        var split = value.IndexOf(':');
        if (split <= 0 || split == value.Length - 1) return CursorProblem;
        var head = value[..split];
        if (!Head.IsMatch(head)) return CursorProblem;
        var link = value[(split + 1)..];
        if (link.Length > MaxUrl || Spaces.IsMatch(link)) return CursorProblem;
        return null;
    }

    /// Lo que ese marcador le pide a Telegram: la fecha y el enlace con los que <c>messages.getExportedChatInvites</c>
    /// corta la página. <c>null</c> es el principio de la lista. Solo se llama con un marcador ya validado por
    /// <see cref="CursorIssue"/>; el <c>long</c> del encabezado no puede desbordar, que es la diferencia de medida
    /// con el <c>Integer.parseInt</c> de <c>InviteLinks.java:37</c>.
    public static (long Date, string Link)? CursorOf(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        var split = value.IndexOf(':');
        return (long.Parse(value[..split], CultureInfo.InvariantCulture), value[(split + 1)..]);
    }

    // ---- la fila ----

    /// <c>InviteLinks.cut</c> (<c>InviteLinks.java:102</c>): recorte seco, sin puntos suspensivos. No es
    /// <see cref="DesktopContact.Limit"/>, que añade «…», y los dos conviven en Android: el primero para el nombre de
    /// la fila y el segundo para el nombre del diálogo de revocar.
    public static string Cut(string value, int size) => value.Length > size ? value[..size] : value;

    /// <c>InviteLinks.row</c> (<c>InviteLinks.java:40-56</c>) con las trece claves y en su orden. La firma cambia en un
    /// punto y es la diferencia de capas: allá <c>isPrimary</c> viene en la fila, aquí hay que habérselo preguntado al
    /// <c>full info</c> y traerlo como argumento.
    /// <list type="bullet">
    /// <item><description><c>memberCount</c> es <c>usage</c> y <c>pending</c> es <c>requested</c>, que es la pareja con
    /// la que TDLib arma sus <c>member_count</c> y <c>pending_join_request_count</c> a partir del mismo
    /// <c>chatInviteExported</c>.</description></item>
    /// <item><description>Las fechas vienen en <c>DateTime</c> por WTelegramClient y viajan en segundo de epoch, la
    /// unidad de Android: <see cref="TelegramService.Unix"/> ya devuelve cero para las que no están, que es exactamente
    /// lo que valen los <c>has_*</c> no puestos.</description></item>
    /// <item><description><c>approval</c> es la bandera <c>request_needed</c> y <c>revoked</c> la del mismo nombre;
    /// <c>paid</c> es que venga <c>subscription_pricing</c>.</description></item>
    /// </list>
    /// <c>null</c> cuando el enlace no sirve para nada: vacío, ausente o más largo que el techo del puente, igual que
    /// <c>InviteLinks.row</c>, y también cuando la fila no es un <c>chatInviteExported</c>.
    public static Entry? Row(ExportedChatInvite? invite, string primary)
    {
        if (invite is not ChatInviteExported link) return null;
        var url = link.link ?? "";
        if (url.Length == 0 || url.Length > MaxUrl) return null;
        var created = Math.Max(0L, TelegramService.Unix(link.date));
        return new Entry(
            new
            {
                link = url,
                name = Cut(link.title ?? "", MaxName),
                creator = Math.Max(0L, link.admin_id).ToString(CultureInfo.InvariantCulture),
                created,
                edited = Math.Max(0L, TelegramService.Unix(link.start_date)),
                expires = Math.Max(0L, TelegramService.Unix(link.expire_date)),
                memberLimit = Math.Max(0, link.usage_limit),
                memberCount = Math.Max(0, link.usage),
                pending = Math.Max(0, link.requested),
                approval = On(link.flags, ChatInviteExported.Flags.request_needed),
                primary = IsPrimary(link, primary),
                revoked = Revoked(link),
                paid = link.subscription_pricing != null
            },
            created,
            url);
    }

    /// La fila ya armada junto a las dos cosas que <c>InviteLinks.page</c> relee de ella para fabricar el marcador de
    /// la página siguiente. Se traen aparte en lugar de leer el objeto por reflexión, que es lo que el JSON de Android
    /// sí hace porque su fila es un <c>JSONObject</c>.
    public readonly record struct Entry(object Row, long Created, string Link);

    private static bool On(ChatInviteExported.Flags flags, ChatInviteExported.Flags flag) => (flags & flag) != 0;

    /// La bandera <c>revoked</c> leída una sola vez. Android la trae como campo (<c>isRevoked</c>) y la usa en los tres
    /// sitios: la fila (<c>InviteLinks.java:54</c>), la negación de editar (<c>:3659</c>) y el <c>false</c> de revocar
    /// dos veces (<c>:3693</c>). Aquí es la misma lectura, escrita una vez.
    public static bool Revoked(ChatInviteExported link) => On(link.flags, ChatInviteExported.Flags.revoked);

    /// <c>InviteLinks.page</c> (<c>InviteLinks.java:58-69</c>): <c>total</c>, las filas, la pestaña, si hay más y el
    /// marcador para seguir. El marcador va siempre, vacío cuando no hay más página: <c>cursorFor</c> del modelo
    /// compartido trata igual «no viene» que «viene vacío», así que la clave de más no cambia lo que ve la pantalla y
    /// ahorra construir dos objetos distintas.
    public static object Page(IReadOnlyList<Entry> rows, long total, bool revoked)
    {
        var next = rows.Count >= PageSize;
        return new
        {
            total = Math.Max(0L, total),
            links = rows.Select(row => row.Row).ToList(),
            revoked,
            next,
            cursor = next ? Token(rows[^1].Created, rows[^1].Link) : ""
        };
    }

    // ---- el formulario ----

    /// <c>InviteLinks.problem</c> (<c>InviteLinks.java:78-86</c>) entero, en su orden. La primera rama —nombre
    /// ausente— la deja Android por si acaso, y aquí también está: el cable ya la cubre con el techo de texto de la
    /// casa, así que en la práctica no se alcanza, pero la regla es la de <c>InviteLinks</c>, no la del cable.
    public static string? Problem(string? name, long expiresIn, long memberLimit, bool approval)
    {
        if (name is null) return BadName;
        if (name.Length > MaxName) return NameTooLong;
        if (expiresIn < 0) return BadExpiry;
        if (expiresIn > MaxSpan) return TooFar;
        if (memberLimit < 0 || memberLimit > MaxMembers) return BadLimit;
        if (approval && memberLimit > 0) return ApprovalLimit;
        return null;
    }

    /// <c>InviteLinks.expiration</c> (<c>InviteLinks.java:89-95</c>): el segundo absoluto al que Telegram corta el
    /// enlace, o <c>null</c> cuando no caduca. Las dos frases que allá se lanzan desde dentro ya las dijo
    /// <see cref="Problem"/> en el orden de la casa, y la tercera es la del desbordamiento de <c>int</c> que aquí no
    /// puede ocurrir.
    public static long? Expires(long now, long expiresIn) => expiresIn <= 0 ? null : now + expiresIn;

    /// El <c>name.isEmpty()?"WRGram":name</c> del crear (<c>:3641</c>). Es lo que se escribe en Telegram y lo que se
    /// lee en el diálogo.
    public static string CreateLabel(string name) => name.Length == 0 ? DefaultLabel : name;

    /// El <c>name.isEmpty()?"sin nombre":name</c> del editar (<c>:3665</c>): el diálogo nombra la ausencia, pero a
    /// Telegram no llega «sin nombre» sino el vacío, que es como MTProto borra un título.
    public static string EditLabel(string name) => name.Length == 0 ? NoLabel : name;

    /// <c>InviteLinks.editable</c> (<c>InviteLinks.java:98-100</c>) y las tres negaciones de <c>:3657-3659</c> en su
    /// orden: pago, primacía y revocación. Devuelve la frase o <c>null</c> cuando el enlace sí se puede cambiar.
    public static string? NotEditable(ChatInviteExported link, bool primary)
    {
        if (link.subscription_pricing != null) return PaidLinks;
        if (primary) return PrimaryEdit;
        if (Revoked(link)) return AlreadyRevoked;
        return null;
    }

    /// Lo que Android lee de <c>link.isPrimary</c>: la fila coincide con el <c>exported_invite</c> del
    /// <c>full info</c>. El string vacío es «no hay enlace conocido que mandar», y un
    /// <c>chatInvitePublicJoinRequests</c> —que no trae <c>link</c>— cae ahí en lugar de marcar nada.
    public static bool IsPrimary(ChatInviteExported link, string primary) =>
        primary.Length != 0 && link.link == primary;

    /// <c>ChannelFull.exported_invite</c> y <c>ChatFull.exported_invite</c>: las dos formas medidas del
    /// <c>ChatFullBase</c> que publican el enlace principal. <c>TL.CommunityFull</c> no lo trae, y <c>null</c> significa
    /// que la lectura no llegó, no que no haya principal; esa diferencia la usa el cable.
    public static string? PrimaryOf(ChatFullBase? full) => full switch
    {
        ChannelFull channel => channel.exported_invite is ChatInviteExported link ? link.link ?? "" : "",
        ChatFull basic => basic.exported_invite is ChatInviteExported link ? link.link ?? "" : "",
        null => null,
        _ => ""
    };

    /// <c>InviteLinks.canInviteMembers</c> (<c>NativeBridge.java:1843</c>) leído en la tabla de un grupo básico:
    /// creador o administrador. <c>chatParticipantAdmin</c> de MTProto no trae tabla de derechos, y TDLib tampoco
    /// consulta uno por uno en un básico: el estado es el testigo. No es
    /// <see cref="DesktopMemberAdditions.MayInvite(ChatParticipantBase?)"/>, que vale para «añadir» personas —donde
    /// cualquier miembro de un básico puede— y es otra norma.
    public static bool MayManageLinks(ChatParticipantBase? self) =>
        self is ChatParticipantCreator or ChatParticipantAdmin;

    // ---- los tres cuerpos de diálogo ----

    /// <c>NativeBridge.linkDescription</c> (<c>:3675-3680</c>) palabra por palabra: la validez, la capacidad y la
    /// frase de cierre. La fecha sale en ISO porque Android usa <c>LocalDate</c> con la zona del sistema, y
    /// <c>toString()</c> de esa clase es <c>yyyy-MM-dd</c>.
    public static string FormBody(string label, long? expiration, long memberLimit, bool approval, string title)
    {
        var validity = expiration is null ? "no caduca" : "caduca el " + DateOf(expiration.Value);
        var capacity = approval
            ? "los nuevos tendrán que aprobarse"
            : memberLimit > 0 ? "hasta " + memberLimit.ToString(CultureInfo.InvariantCulture) + " miembros a la vez" : "sin límite de miembros";
        return "Enlace «" + label + "» en «" + title + "»: " + validity + " y " + capacity
            + ". Telegram aplica estos ajustes en cuanto lo confirmes; nadie se une por sí solo.";
    }

    private static string DateOf(long epoch) =>
        DateTimeOffset.FromUnixTimeSeconds(epoch).ToLocalTime().ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// El mensaje de <c>:3698-3700</c>, con sus dos sufijos condicionales: el del enlace principal y el de la gente
    /// que ya entró. Revocar no expulsa a nadie, y eso es lo único que la frase dice sobre el pasado.
    public static string RevokeBody(string name, string title, bool primary, long memberCount) =>
        "Dejará de funcionar el enlace «" + name + "» de «" + title + "»"
        + (primary ? ", que además es el enlace principal: Telegram creará uno nuevo." : ".")
        + (memberCount > 0
            ? " Las " + memberCount.ToString(CultureInfo.InvariantCulture) + " personas que ya entraron seguirán en el chat."
            : "");

    /// El <c>current.name==null||current.name.isBlank()?"sin nombre":NativeSnapshot.limit(current.name,32)</c> de
    /// <c>:3697</c>, con el recorte que sí lleva puntos suspensivos.
    public static string RevokeName(string? title) =>
        string.IsNullOrEmpty(DesktopCommunityInfo.Prepared(title ?? "")) ? NoLabel : DesktopContact.Limit(title ?? "", MaxName);
}
