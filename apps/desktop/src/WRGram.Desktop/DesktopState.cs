using System.Text.Json;
using System.Text.Json.Serialization;

namespace WRGram.Desktop;

public sealed class DesktopState
{
    public bool Ready { get; set; }
    public string Auth { get; set; } = "welcome";
    public bool Consent { get; set; }
    public bool Busy { get; set; }
    public string Connection { get; set; } = "Sin conectar";
    public bool Online { get; set; }
    public string Error { get; set; } = "";
    public string Notice { get; set; } = "";
    public string Version { get; set; } = DesktopInfo.Version;
    public string SelfId { get; set; } = "0";
    public string Name { get; set; } = "";
    public string Active { get; set; } = "0";
    public bool CanSend { get; set; }
    public bool Sending { get; set; }
    public bool Uncertain { get; set; }
    public bool ChatsBusy { get; set; }
    public bool ChatsEnd { get; set; }
    public List<ChatDto> Chats { get; set; } = new();
    public List<MessageDto> Messages { get; set; } = new();
    public List<FolderDto> Folders { get; set; } = new();
    public HistoryDto History { get; set; } = new();
    public string Typing { get; set; } = "";
    public AppearanceDto Appearance { get; set; } = new();
    public PermissionsDto Permissions { get; set; } = new();
    public SecurityDto Security { get; set; } = new();
    public AssistantDto Assistant { get; set; } = new();
    public AccessDto Access { get; set; } = new() { Checked = true, Allowed = true };
    public UpdateDto Update { get; set; } = new();
    public List<long> MediaReady { get; set; } = new();
    public List<long> MediaLoading { get; set; } = new();
    public List<long> MediaFailed { get; set; } = new();
    public MediaDto? ProfilePhoto { get; set; }
    public string? QrImage { get; set; }
    public string? AuthEmailPattern { get; set; }
    public int? AuthCodeLength { get; set; }
    public string? AuthHint { get; set; }
    public bool? AuthRecoveryAvailable { get; set; }
    public string? AuthRecoveryPattern { get; set; }
    public string? AuthTerms { get; set; }
    public int? AuthMinAge { get; set; }
    public string Platform { get; set; } = "desktop";

    public void ResetSession()
    {
        Ready = false;
        Auth = "welcome";
        Consent = false;
        Busy = false;
        Connection = "Sin conectar";
        Online = false;
        Error = "";
        Notice = "";
        SelfId = "0";
        Name = "";
        Active = "0";
        CanSend = false;
        Sending = false;
        Uncertain = false;
        ChatsBusy = false;
        ChatsEnd = false;
        Chats = new();
        Messages = new();
        Folders = new();
        History = new();
        Typing = "";
        ProfilePhoto = null;
        MediaReady = new();
        MediaLoading = new();
        MediaFailed = new();
        QrImage = null;
        AuthEmailPattern = null;
        AuthCodeLength = null;
        AuthHint = null;
        AuthRecoveryAvailable = null;
        AuthRecoveryPattern = null;
        AuthTerms = null;
        AuthMinAge = null;
    }
}

public sealed class ChatDto
{
    public bool InList { get; set; } = true;
    public string Id { get; set; } = "";
    public string Title { get; set; } = "";
    public string Preview { get; set; } = "";
    public long Date { get; set; }
    public int Unread { get; set; }
    public string ReadInbox { get; set; } = "0";
    public bool Marked { get; set; }
    public bool Bot { get; set; }
    public string Type { get; set; } = "private";
    public bool Pinned { get; set; }
    public bool Muted { get; set; }
    public bool Archived { get; set; }
    public MediaDto? Photo { get; set; }
    public bool Supported { get; set; } = true;
    public int? ActiveStories { get; set; }
    public bool? IsContact { get; set; }
    public bool? Supergroup { get; set; }
    public bool? IsForum { get; set; }
    public string? SecretState { get; set; }
    public string? Fingerprint { get; set; }
    public string? Username { get; set; }
    public string? Draft { get; set; }
}

public sealed class MessageDto
{
    public string Id { get; set; } = "0";
    public string ChatId { get; set; } = "0";
    public string Sender { get; set; } = "";
    public string? AuthorId { get; set; }
    public string? AuthorKind { get; set; }
    public string Text { get; set; } = "";
    public long Date { get; set; }
    public bool Outgoing { get; set; }
    public string Status { get; set; } = "";
    public bool Edited { get; set; }
    public string? Reply { get; set; }
    public ReplyTargetDto? ReplyTo { get; set; }
    public MediaDto? Media { get; set; }
    public bool Transcribable { get; set; }
    public List<ReactionDto> Reactions { get; set; } = new();
    public List<EntityDto>? Entities { get; set; }
    public string? AlbumId { get; set; }
    public double? ScheduledAt { get; set; }

    /// Si la fila programada se repite. TDLib lo guarda en su estado de planificación y MTProto en
    /// `schedule_repeat_period`, medido en segundos y detrás de una bandera; la pantalla lo necesita porque con
    /// él oculta «Enviar ya» y «Cambiar hora», que en las dos capas están negadas para un recurrente.
    public bool ScheduledRepeat { get; set; }

    /// El periodo en segundos, o `null` cuando el mensaje se envía una sola vez.
    public int? RepeatPeriod { get; set; }
    public string? ChatTitle { get; set; }
    public ForwardDto? Forward { get; set; }

    /// Lo que Telegram dijo de esta fila con sus dos banderas de protección (`Message.Flags.noforwards` y
    /// `Chat/Channel.Flags.noforwards`). Sale en `false` por defecto, que es lo que son los mensajes de
    /// servicio: no hay petición que los reenvíe.
    public bool CanForward { get; set; }

    /// La tarjeta rica que la pantalla pinta encima de la burbuja. <c>null</c> es la norma: solo las tarjetas de
    /// contacto se publican hoy, y es así porque la ronda AP es la primera orden que <b>escribe</b> uno de esos
    /// contenidos desde Windows —<c>InputMediaContact</c>— y quien escribe tiene que poder leer lo que escribió. Las
    /// demás tarjetas de Android (ubicación, lugar, dado, sticker animado) siguen sin puente y sin lectura, y
    /// publicar <c>kind</c> vacíos por encima habría llenado la pantalla de tarjetas sin contenido.
    public MessageExtraDto? Extra { get; set; }

    /// Si la fila es un aviso del sistema —«María añadió a Sofía», «Se fijó un mensaje»— y no un mensaje. Solo
    /// lo sabe la conversión, que es donde se ve la clase real del objeto de Telegram, y hace falta porque
    /// ninguna de las otras señales lo distingue: un aviso tiene texto, autor y hora como los demás. Los
    /// clientes de Telegram no ofrecen fijar un aviso, y TDLib tampoco (`canBePinned`).
    public bool ServiceNotice { get; set; }

    /// Si la fila lleva un archivo sobre el que se puede escribir un pie —foto, vídeo, animación, documento o
    /// audio, pero ni sticker ni nota de voz ni mensaje redondo—. Solo la conversión lo sabe, porque hace falta
    /// mirar la clase real del adjunto; el `Kind` que ve la pantalla viene del mime y un sticker llega como
    /// imagen igual que una foto. TDLib lo calcula con `messageMedia.photo/video/animation/document/audio` y
    /// WTelegram lo exige al editar: cambiar el pie obliga a volver a mandar el archivo.
    public bool HasCaption { get; set; }

    /// La encuesta cuando la fila es una. Se pone a null en el resto, que es lo que la pantalla mira para
    /// pintar o no la tarjeta: en Android el campo también es opcional (`contract.ts:135`).
    public PollDto? Poll { get; set; }

    /// La tarjeta del enlace que va en el texto, o `null`. Es la norma no tenerla: solo la trae una fila cuyo
    /// adjunto es una página que Telegram ya resolvió (`MessageMediaWebPage` con `WebPage`), que es lo que en TDLib
    /// es `MessageText.linkPreview`. Reglas y recortes, en <see cref="DesktopLinkPreview"/>; y sin `url`, porque
    /// Android tampoco la publica y el botón la pide por el número del mensaje.
    public LinkPreviewDto? Preview { get; set; }
}

/// <summary>
/// La tarjeta de vista previa tal y como la ve la pantalla. Las cuatro claves copian campo a campo
/// `preview` de `contract.ts:83` y la escritura de `NativeSnapshot.java:218`, y salen en camelCase por la
/// política de `DesktopBridge.cs:18`. La quinta clave que Android tiene en mano —la dirección de la página— no
/// está aquí a propósito: ver <see cref="DesktopLinkPreview"/>.
/// </summary>
public sealed class LinkPreviewDto
{
    public string Title { get; set; } = "";
    public string Site { get; set; } = "";
    public string Description { get; set; } = "";
    public MediaDto? Photo { get; set; }
}

/// <summary>
/// Una encuesta ya convertida para la pantalla. Los nombres salen en camelCase por la política de
/// <c>DesktopBridge.cs:18</c>, y coinciden campo a campo con <c>Poll</c> de <c>contract.ts:119</c>; el orden no
/// importa pero la ausencia sí, así que los cuatro que Android rellena con estado del cliente —los dos
/// <c>can*</c>, <c>closed</c> y <c>chosen</c> de cada opción— llevan aquí su comentario cuando no son lo que
/// parecen.
/// </summary>
public sealed class PollDto
{
    /// El identificador que Telegram da a la encuesta —los mismos <c>long</c> que esta capa sorteó al enviarla—.
    /// La pantalla no lo mira nunca; hace falta porque <c>updateMessagePoll</c> puede venir sin peer y el único
    /// modo de saber a qué burbuja pertenece el recuento nuevo es este número.
    public long PollId { get; set; }

    public string Question { get; set; } = "";
    public string Description { get; set; } = "";
    public int TotalVoters { get; set; }
    public bool Anonymous { get; set; }
    public bool Multiple { get; set; }
    public bool Revoting { get; set; }
    public bool Closed { get; set; }

    /// Si se pueden ver los resultados ahora mismo. Android lo lee de TDLib; aquí se calcula con la fórmula que
    /// el propio TDLib documenta: un cuestionario y una encuesta cerrada siempre los muestran, una abierta
    /// cuando no se eligió ocultarlos —ver <see cref="DesktopPoll.CanSeeResults"/>—.
    public bool CanSeeResults { get; set; }

    /// Si pedir la lista de quién votó. Es la bandera <c>public_voters</c> leída de verdad; la petición existe en
    /// MTProto (<c>messages.getPollVotes</c>) pero este puente todavía no la llama, y decir la verdad aquí es lo
    /// que hace que la pantalla muestre el botón y se niegue con la frase del cable.
    public bool CanGetVoters { get; set; }

    /// Siempre <c>false</c> en Windows, y no es un hueco por rellenar: <c>messages</c> de WTelegramClient 4.4.10
    /// no tiene ninguna petición para cerrar una encuesta, así que no hay nada que prometer. La pantalla deja de
    /// ofrecer «Cerrar encuesta» con este solo campo.
    public bool CanStop { get; set; }

    public bool Quiz { get; set; }
    public string? Explanation { get; set; }
    public string? Restriction { get; set; }
    public List<PollOptionDto> Options { get; set; } = new();
}

public sealed class PollOptionDto
{
    public int Index { get; set; }
    public string Text { get; set; } = "";
    public int Votes { get; set; }

    /// Redondeo del tanto por ciento, calculado aquí porque MTProto solo publica el recuento; Android recibe el
    /// porcentaje ya hecho por TDLib.
    public int Percentage { get; set; }

    /// Si esta cuenta votó esta opción. Es la marca <c>chosen</c> que el propio servidor pone en
    /// <c>PollAnswerVoters</c> —documentada como «whether we have chosen this answer»—, así que esta capa no recuerda
    /// votos por su cuenta: el <c>updateMessagePoll</c> que responde al voto propio trae la marca puesta.
    public bool Chosen { get; set; }

    /// <c>choosing</c> en <c>contract.ts:118</c> es <c>PollOption.is_being_chosen</c> de TDLib: un voto de esta
    /// cuenta que todavía no ha confirmado. MTProto no conoce ese estado por opción —el aviso llega con el recuento
    /// ya definitivo—, así que aquí sale siempre en falso. No es una plaza vacía ni una memoria que falta: la
    /// pantalla hoy no lee el campo, y mientras no lo lea, mentir con un «de camino» sería peor que decir nada.
    public bool Choosing { get; set; }
}

/// <summary>
/// La lista de votantes de una opción, con los dos campos que <c>pollVoters</c> de Android siempre devolvió:
/// <c>total</c> y <c>items</c>. Son literalmente <c>object("total",result.totalCount,"items",items)</c>, y cada
/// ítem es <c>object("name",…,"date",…)</c>. La <c>date</c> viaja en segundos de Unix porque así la multiplica la
/// pantalla por 1000 (<c>BatchPanels.tsx:56</c>); mandarla como <c>DateTime</c> serializado habría dado una tarjeta
/// con fecha en 1970.
/// </summary>
public sealed class PollVotersDto
{
    /// Cuántos votos tiene la opción. Es <c>votesList.count</c> de MTProto, no el tamaño de esta página: de ahí que
    /// la pantalla pueda escribir «Se muestran X de Y votantes» con los dos números que ya tiene.
    public int Total { get; set; }
    public List<PollVoterDto> Items { get; set; } = new();
}

public sealed class PollVoterDto
{
    public string Name { get; set; } = "";
    public long Date { get; set; }
}

/// <summary>
/// Una fila de la agenda, con los cuatro campos que <c>contacts</c> de Android arma en
/// <c>object("id",…,"name",…,"username",…,"bot",…)</c> (<c>NativeBridge.java:1767</c>). El <c>id</c> es texto porque
/// Android lo pasa con <c>Long.toString</c> y la pantalla lo devuelve tal cual a <c>share.contact</c>.
/// <para>
/// Falta el quinto campo de Android, <c>photo</c>, y falta a propósito: la orden de TDLib ya traía las miniaturas
/// descargadas y esta capa tendría que pedir cada una por su cuenta para una lista de hasta 50 personas. La
/// pantalla tiene respaldo con iniciales (<c>ContactAvatar</c>, <c>App.tsx:95</c>), así que lo que se pierde es un
/// retrato y no información.
/// </para>
/// </summary>
public sealed class ContactDto
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string Username { get; set; } = "";

    /// La marca de bot viaja aunque esta orden no niegue nada con ella: es con lo que la pantalla filtra, y sin el
    /// campo las dos capas filtrarían cosas distintas.
    public bool Bot { get; set; }
}

/// <summary>
/// La tarjeta rica de un mensaje. Android las arma todas en <c>MessageExtras.card</c>; esta capa solo publica la de
/// contacto, que es la que la ronda AP sabe escribir y por lo tanto tiene que saber leer. Los cuatro campos son el
/// molde de <c>contract.ts:161</c> —<c>kind</c>, <c>name</c>, <c>phone</c>, <c>userId</c>, <c>canCopy</c>—.
/// </summary>
public sealed class MessageExtraDto
{
    public string Kind { get; set; } = "contact";

    /// Los dos nombres de la tarjeta ya unidos, como los lee la persona. Es <c>contactName</c> de Android.
    public string Name { get; set; } = "";

    /// El número tal cual viene en el mensaje, en un campo que la pantalla pinta con dirección izquierda-derecha.
    public string Phone { get; set; } = "";

    /// A quién pertenece. Viaja <b>texto</b> y vacío cuando Telegram no lo dice, porque la pantalla solo muestra
    /// «Abrir chat» si hay algo que abrir. Es el <c>user_id</c> de <c>MessageMediaContact</c>; nótese que la
    /// escritura no lo manda —<c>InputMediaContact</c> ya no lo tiene— y la lectura sí lo recibe.
    public string? UserId { get; set; }

    /// Si se puede copiar el número. Es <c>!protect</c> de Android: el mismo <c>noforwards</c> que quita el botón de
    /// reenviar.
    public bool CanCopy { get; set; }

    /// Nombre de la tarjeta de ubicación: «Ubicación», «Ubicación en vivo» o el título del lugar.
    public string? Title { get; set; }

    /// La dirección escrita del lugar, vacía cuando Telegram no la trae. Una ubicación suelta no tiene dirección y
    /// la pantalla no pinta la línea.
    public string? Address { get; set; }

    /// Los dos números, y <b>omitidos</b> cuando no vienen o no valen. El atributo no es decoración: el contrato de
    /// la pantalla distingue «no hay coordenadas» de «coordenada cero», y un <c>null</c> escrito se leería como un
    /// número y la tarjeta llamaría a <c>toFixed</c> sobre la nada.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Latitude { get; set; }

    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public double? Longitude { get; set; }

    /// Si sigue actualizándose. Solo las filas vivas la escriben; en una fija el campo no viaja, como en Android.
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? Live { get; set; }

    /// Segundo de epoch en el que la cuenta atrás se apaga, o cero si el periodo no vale. Cero significa «no hay
    /// cuenta atrás», no «caducó en 1970».
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public long? ExpiresAt { get; set; }

    /// Si el puente deja abrir el mapa. Es el <c>!protect</c> de la tarjeta de ubicación, y manda sobre el botón
    /// aunque las coordenadas estén puestas.
    public bool CanOpen { get; set; }
}

public sealed class ForwardDto
{
    public string Kind { get; set; } = "user";
    public string Name { get; set; } = "";
    public string? Signature { get; set; }
    public long Date { get; set; }
    public string? ChatId { get; set; }
    public string? MessageId { get; set; }
    public string? UserId { get; set; }
}

public sealed class ReplyTargetDto
{
    public string ChatId { get; set; } = "";
    public string MessageId { get; set; } = "";
}

/// Lo que vive en `search-filters.json`: la cuenta que escribió los filtros y su lista, sin objeto de
/// Telegram detrás. `Account` cambia cuando inicia otra cuenta, y entonces la lista se empieza de cero.
public sealed class SavedFilterFileDto
{
    public string Account { get; set; } = "";
    public List<DesktopSavedFilters.Entry> Filters { get; set; } = new();
}

public sealed class ReactionDto
{
    public string Emoji { get; set; } = "";
    public int Count { get; set; }
    public bool Chosen { get; set; }
    public string? Kind { get; set; }
    public string? CustomEmojiId { get; set; }
}

public sealed class EntityDto
{
    public string Type { get; set; } = "";
    public int Offset { get; set; }
    public int Length { get; set; }
    public string? Url { get; set; }
}

public sealed class MediaDto
{
    public long Id { get; set; }
    public bool Ready { get; set; }
    public string Mime { get; set; } = "application/octet-stream";
    public string Kind { get; set; } = "file";
    public string Name { get; set; } = "Archivo";
    public long Size { get; set; }
    public long? DownloadLimit { get; set; }
    public MediaDto? Thumbnail { get; set; }
    public string? Minithumbnail { get; set; }
    public bool? Exportable { get; set; }
}

/// Lo que responde el puente al elegir un archivo, antes de que nadie lo suba: los mismos tres campos que
/// <c>NativeBridge.picked</c> manda a la pantalla —el vale con el que se enviará, el nombre saneado y lo que
/// ocupa la copia—, que son justo los que la confirmación pinta en el recuadro.
public sealed class AttachmentDto
{
    public string Token { get; set; } = "";
    public string Name { get; set; } = "";
    public long Size { get; set; }
}

/// <summary>
/// Una pieza del álbum con el texto que tiene puesto, que es lo que la pantalla lista en «Editar textos del
/// álbum» y lo que vuelve al puente por <c>message.edit.caption</c> con su propio id. El pie viaja como texto
/// plano por la misma razón que en Android (<c>dto.caption(item)</c>): el cuadro de la pantalla reinterpreta el
/// formato al leerlo y manda sus <c>entities</c> al guardar.
/// </summary>
public sealed class AlbumCaptionDto
{
    public string Id { get; set; } = "";
    public string Text { get; set; } = "";
}

public sealed class HistoryDto
{
    public bool Loading { get; set; }
    public string Error { get; set; } = "";
    public bool End { get; set; }
    public bool Latest { get; set; } = true;
    public string Anchor { get; set; } = "0";
}

public sealed class AppearanceDto
{
    public string Theme { get; set; } = "gold";
    public int Font { get; set; } = 16;
    public bool Compact { get; set; }
    public bool Typing { get; set; } = true;
    public bool Enter { get; set; }
    public bool Auto { get; set; }
    public string FontFamily { get; set; } = "system";
    public string Wallpaper { get; set; } = "none";
    public JsonElement? Custom { get; set; }
    public JsonElement? CustomThemes { get; set; }
    public JsonElement? ChatThemes { get; set; }
    public JsonElement? Gestures { get; set; }
    public string Navigation { get; set; } = "bar";
    public ChromeDto? Chrome { get; set; }
}

public sealed class ChromeDto
{
    public string Canvas { get; set; } = "#0f1012";
    public string Surface { get; set; } = "#17181b";
    public string Text { get; set; } = "#ecece9";
    public string Muted { get; set; } = "#9d9eaa";
    public string Accent { get; set; } = "#dfbd78";
    public bool Dark { get; set; } = true;
}

public sealed class PermissionsDto
{
    public bool Notes { get; set; }
    public bool Replies { get; set; }
}

public sealed class SecurityDto
{
    public bool Enabled { get; set; }
    public bool Available { get; set; }
    public bool Biometric { get; set; }
    public int LockAfter { get; set; }
}

public sealed class AssistantDto
{
    public string State { get; set; } = "No disponible en escritorio";
    public bool Ready { get; set; }
    public bool Busy { get; set; }
    public bool Consent { get; set; }
    public string Error { get; set; } = "";
    public List<object> Turns { get; set; } = new();
}

public sealed class AccessDto
{
    [JsonPropertyName("checked")]
    public bool Checked { get; set; }
    public bool Allowed { get; set; }
    public bool Blocked { get; set; }
    public long ExpiresAt { get; set; }
    public List<object> Countries { get; set; } = new();
}

public sealed class UpdateDto
{
    public bool Supported { get; set; }
    public bool Checking { get; set; }
    public bool Available { get; set; }
    public bool Downloaded { get; set; }
    public int CurrentVersionCode { get; set; }
    public int AvailableVersionCode { get; set; }
    public int Priority { get; set; }
    public string Error { get; set; } = "";
    public string? Notes { get; set; }
}

public sealed class FolderDto
{
    public int Id { get; set; }
    public string Title { get; set; } = "";
}

public static class DesktopInfo
{
    public const string Version = "0.1.0-desktop2";
}
