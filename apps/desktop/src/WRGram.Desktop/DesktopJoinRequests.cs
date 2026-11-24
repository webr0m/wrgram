namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using TL;

/// <summary>
/// Las solicitudes de ingreso de una comunidad en Windows. En Android son dos archivos: `JoinRequests.java`,
/// que es puro (fila, página y marcador, sin sesión ni red), y las dos órdenes del puente —`chat.requests`
/// (`NativeBridge.java:760` → `joinRequests` `:3551-3566` con su carga `requestJoinPage` `:3567-3581`, su
/// abanico de nombres `joinResolve` `:3593-3597` y su cierre `finishJoinPage` `:3598-3610`) y
/// `chat.request.answer` (`:767` → `answerJoinRequest` `:3600-3627`)—. Aquí están las mismas reglas y las
/// mismas frases, y el cable está en `DesktopJoinRequestsFlow.cs`.
/// <para>
/// La diferencia de capas que manda todo lo demás: TDLib tiene un método para la cola
/// (`GetChatJoinRequests`, «Returns pending join requests in a chat») y otro para responder
/// (`ProcessChatJoinRequest`, «Pass true to approve the request; pass false to decline it»), mientras MTProto
/// reparte la cola en banderas de una sola petición —`messages.getChatInviteImporters` con `requested` en
/// verdadero, medido como «If set, only returns info about users with pending join requests»— y la respuesta en
/// `messages.hideChatJoinRequest(peer, user_id, approved)`, que es «descartar o aprobar» y no lleva enlace ni
/// mensaje. La marca `about` de la fila es, según el mismo esquema medido, «For users with pending requests,
/// contains bio of the user that requested to join»: la misma clave que TDLib llama `bio`.
/// </para>
/// <para>
/// Dos cosas que Android guarda en memoria y aquí no existen. La primera es el marcador: allá `requestOwner`,
/// `requestChat`, `requestCursorUser` y `requestCursorDate` (`:3567`) hacen que un cursor devuelto por otra
/// sesión, otro chat o una página distinta se niegue con «Vuelve a abrir las solicitudes para continuar.»
/// (`:3533`); aquí la posición es un par de argumentos de la petición, así que no hay memoria que pueda estar
/// vieja. Esa frase no se copia como negación de memoria, sino como lo que en Windows produce el mismo
/// consejo: perder de la caché a la persona que el marcador nombra (<see cref="CursorGone"/>). La segunda es el
/// `access_hash`: TDLib lo tiene en casa y MTProto lo exige en cada escritura, así que el offset y la respuesta
/// solo son posibles si la persona vino con la página (`DesktopMemberSanctions.NeedsHash`).
/// </para>
/// <para>
/// Y un dato que Windows no puede publicar en la bandeja: el contador. `TL.Chat` y `TL.Channel` no traen
/// ninguna cifra de solicitudes pendientes —medido sobre WTelegramClient 4.4.10—; `requests_pending` y
/// `recent_requesters` viven solo en `ChatFull`/`ChannelFull`. Android la lee de `chat.pendingJoinRequests`, que
/// TDLib sí mantiene en la fila del diálogo. Aquí la insignia de la lista se queda sin número y el total real lo
/// dice la propia cola (`count` de la respuesta), que es lo que la pantalla muestra con `requestCountLabel`.
/// </para>
/// </summary>
public static class DesktopJoinRequests
{
    /// `JoinRequests.PAGE` (`JoinRequests.java:12`).
    public const int PageSize = 20;

    /// `NativeSnapshot.limit(...,80)` en las dos lecturas del nombre (`:3568` y `:3588`).
    public const int NameShown = 80;

    /// `NativeSnapshot.limit(chat.title,80)` antes de meter el título en el cuerpo del diálogo (`:3587`). Vale
    /// lo mismo que <see cref="NameShown"/> y es otra cosa: es el nombre de la comunidad, no el de la persona, y
    /// la aguja lo mide aparte para que nadie lo cambie a posteriori.
    public const int ChatShown = 80;

    /// `JoinRequests.limit(request.bio,140)` (`JoinRequests.java:27`).
    public const int BioShown = 140;

    /// `BridgePolicy.id` acepta hasta diecinueve dígitos con signo (`BridgePolicy.java:59`); ese techo es el de
    /// un `long`, no un invento de aquí.
    private static readonly Regex Identifier = new(@"^-?(0|[1-9][0-9]{0,18})$", RegexOptions.CultureInvariant);

    /// El par `identificador:fecha` del marcador, en la forma que `JoinRequests.offset` acepta (`JoinRequests.java:47-63`).
    private static readonly Regex Digits = new(@"^[0-9]+$", RegexOptions.CultureInvariant);

    // ---- las seis negaciones y las cuatro literales del diálogo ----

    /// `NativeBridge.java:3563` y `:3580`, palabra por palabra. En TDLib la guarda es `ChatTypeBasicGroup || ChatTypeSupergroup`
    /// —y un canal es un supergrupo—, que es exactamente las dos formas que `DesktopMembership.Of` reconoce.
    public const string Unsupported = "Las solicitudes de ingreso solo existen en grupos y canales.";

    /// `JoinRequests.offset` lanza esto tres veces por el mismo motivo (`JoinRequests.java:51`, `:59`, `:61`):
    /// dos puntos mal puestos, un tramo que no es número o un cero donde tiene que haber posición.
    public const string CursorIssue = "El marcador de solicitudes no es válido.";

    /// La frase de `NativeBridge.java:3567`, copiada porque el consejo es el mismo aunque la causa no: allá el cursor no
    /// coincide con la memoria de la sesión; aquí la caché ya no conoce a la persona que el marcador nombra y
    /// sin ella no hay `offset_user` posible.
    public const string CursorGone = "Vuelve a abrir las solicitudes para continuar.";

    /// `NativeBridge.java:3573` y `:3591`. Las dos son necesarias: Telegram comprueba el derecho al listar y lo vuelve a
    /// comprobar al decidir, y Android las escribe con palabras distintas según qué de las dos falló.
    public const string NoRightReview = "Telegram no concede a esta cuenta permiso para revisar solicitudes de ingreso.";
    public const string NoRightAnswer = "Telegram no concede a esta cuenta permiso para decidir solicitudes de ingreso.";

    /// `NativeBridge.java:3620`, la rama que junta el identificador cero y el de la propia cuenta: una solicitud de uno mismo no
    /// existe y responderla desde aquí no tiene sentido.
    public const string SelfAnswer = "Esa solicitud no se puede responder desde aquí.";

    /// `NativeBridge.java:3630`, la guarda que el botón positivo escribe antes de tocar Telegram.
    public const string ChangedAccount = "La cuenta cambió. No se respondió a la solicitud.";

    /// Las dos causas que en Android salen en inglés: `BridgePolicy.id` lanza «Invalid identifier» (`BridgePolicy.java:59`) y
    /// `requiredBool` «Missing permission: approve» (`NativeBridge.java:2811`), y el `catch` de `:3586` reenvía el mensaje tal cual
    /// con `a.fail(invalid.getMessage())`, que es lo que la pantalla lee. Windows las dice en español con la causa
    /// concreta, que es la norma fijada por la ronda AT y la misma decisión que tomó la ronda BF con la aprobación
    /// de los enlaces (`NativeBridge.java:3684`, cuyo `catch` también reenvía).
    public const string BadUserId = "El identificador de la solicitud no es válido.";
    public const string MissingApprove = "La respuesta debe decir si se aprueba o se rechaza la solicitud.";

    /// Los cuatro rótulos del `Dialogs.builder` de `NativeBridge.java:3625-3636`, en sus dos formas.
    public const string ApproveTitle = "Aprobar solicitud";
    public const string RejectTitle = "Rechazar solicitud";
    public const string ApproveAccept = "Aprobar en Telegram";
    public const string RejectAccept = "Rechazar en Telegram";

    /// El cuerpo de aprobar, tal cual lo escribe `NativeBridge.java:3626` con el nombre y el título ya recortados.
    public static string ApproveBody(string name, string title) =>
        "«" + name + "» entrará en «" + title + "» en cuanto Telegram lo confirme. Podrás retirarlo después desde Miembros.";

    /// Y el de rechazar, `NativeBridge.java:3627`: descarta la solicitud, no a la persona.
    public static string RejectBody(string name, string title) =>
        "Se descartará la solicitud de «" + name + "» para «" + title + "». La persona podrá enviar otra si sigue teniendo un enlace válido.";

    /// Título y botón según la decisión que la pantalla ya tomó; una sola rama en lugar de dos copias.
    public static string Title(bool approve) => approve ? ApproveTitle : RejectTitle;
    public static string Accept(bool approve) => approve ? ApproveAccept : RejectAccept;
    public static string Body(bool approve, string name, string title) => approve ? ApproveBody(name, title) : RejectBody(name, title);

    /// La forma de la fila, la misma decisión de `NativeBridge.java:3563` y `:3580`.
    public static bool Supported(DesktopMembership.Kind kind) =>
        kind is DesktopMembership.Kind.Basic or DesktopMembership.Kind.Channel;

    // ---- el marcador ----

    /// `JoinRequests.offset` (`JoinRequests.java:47-63`) hecho negación en lugar de excepción: vacío es
    /// «desde el principio» y no cuesta nada; si trae forma de marcador, tiene que ser dos tramos de dígitos
    /// separados por un solo dos puntos, ninguno vacío y ninguno cero.
    public static string? CursorProblem(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        var split = value.IndexOf(':');
        if (split <= 0 || split != value.LastIndexOf(':') || split == value.Length - 1) return CursorIssue;
        if (!Digits.IsMatch(value[..split]) || !Digits.IsMatch(value[(split + 1)..])) return CursorIssue;
        return Offset(value) is null ? CursorIssue : null;
    }

    /// Las dos posiciones que `messages.getChatInviteImporters` pide como `offset_date` y `offset_user`. El
    /// <c>long</c> de Android no puede desbordar aquí porque el tramo ya pasó el techo de diecinueve dígitos de
    /// <see cref="Identifier"/> y el de fecha cabe en un `int`, que es lo que `Integer.parseInt` exige (`JoinRequests.java:58`).
    public static (long UserId, int Date)? Offset(string? value)
    {
        if (string.IsNullOrEmpty(value)) return null;
        var split = value.IndexOf(':');
        if (!long.TryParse(value[..split], NumberStyles.None, CultureInfo.InvariantCulture, out var userId)) return null;
        if (!int.TryParse(value[(split + 1)..], NumberStyles.None, CultureInfo.InvariantCulture, out var date)) return null;
        if (userId <= 0 || date <= 0) return null;
        return (userId, date);
    }

    /// `JoinRequests.token` (`JoinRequests.java:44`): identificador, dos puntos, fecha. La fecha viaja en
    /// segundos de epoch, la unidad de Android, aunque MTProto la devuelva como `DateTime`.
    public static string Token(long userId, long date) =>
        userId.ToString(CultureInfo.InvariantCulture) + ":" + date.ToString(CultureInfo.InvariantCulture);

    /// La lectura estricta del `userId` que manda la pantalla, espejo de `BridgePolicy.id` (`BridgePolicy.java:59`): solo
    /// cadenas de dígitos con su techo, nada de números sueltos ni de comas.
    public static string? UserIdProblem(string? value) =>
        value is null || !Identifier.IsMatch(value) ? BadUserId : null;

    // ---- la fila y la página ----

    /// La fila de <c>JoinRequests.row</c> (<c>JoinRequests.java:23-28</c>) con sus cuatro claves y en su orden.
    /// Android reparte la tercera y la cuarta entre dos pasos (`row` pone `bio` y `finishJoinPage` añade
    /// `name`, `NativeBridge.java:3602`) porque su nombre sale de un abanico de `GetUser`; aquí la respuesta ya trae el diccionario
    /// de personas y las cuatro se escriben juntas, en el mismo orden que sale por el puente.
    /// <c>null</c> cuando la fila no sirve, que es lo que <c>row</c> devuelve con `userId == 0`.
    public static Entry? Row(ChatInviteImporter? importer, string name)
    {
        if (importer == null || importer.user_id == 0) return null;
        var date = Math.Max(0L, TelegramService.Unix(importer.date));
        return new Entry(
            new
            {
                userId = importer.user_id.ToString(CultureInfo.InvariantCulture),
                date,
                bio = DesktopContact.Limit(importer.about ?? "", BioShown),
                name = DesktopContact.Limit(name, NameShown),
            },
            importer.user_id,
            date);
    }

    /// La fila ya armada junto a las dos claves con las que <c>JoinRequests.page</c> fabrica el marcador de la
    /// página siguiente (<c>JoinRequests.java:34-40</c>).
    public readonly record struct Entry(object Row, long UserId, long Date);

    /// <c>JoinRequests.page</c>: el total de Telegram, las filas, si hay más y el marcador para seguir.
    /// «Hay más» es la página llena, igual que allá (<c>values.length() >= PAGE</c>), y el marcador solo se
    /// ofrece con ella. La clave `cursor` viaja siempre, vacía cuando no hay más: `cursorFor` del modelo
    /// compartido trata igual «no viene» que «viene vacío», así que la pantalla no ve la diferencia.
    public static object Page(IReadOnlyList<Entry> rows, long total)
    {
        var next = rows.Count >= PageSize;
        return new
        {
            total = Math.Max(0L, total),
            requests = rows.Select(row => row.Row).ToList(),
            next,
            cursor = next ? Token(rows[^1].UserId, rows[^1].Date) : "",
        };
    }
}
