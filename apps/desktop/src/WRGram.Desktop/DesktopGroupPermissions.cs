namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Los permisos predeterminados de una comunidad en Windows: las dieciséis reglas que Telegram aplica a quien es
/// miembro normal de un supergrupo o de un canal. En Android son dos métodos —<c>groupPermissions</c>
/// (<c>NativeBridge.java:1888</c>) lee y <c>setGroupPermissions</c> (<c>:2396</c>) escribe, despachados uno tras otro
/// en <c>:589-590</c>— y todo lo que deciden cabe en cinco líneas: la forma del chat, el derecho propio, la
/// tabla de lo que hay, la ventana de confirmar y la escritura. Aquí eso está escrito una vez, con las frases copiadas
/// carácter a carácter y el mismo orden, y el cable solo pide.
/// <para>
/// La medida, hecha por reflexión sobre WTelegramClient 4.4.10 y por el esquema MTProto de la capa 232 que trae el
/// paquete <c>@mtcute/core</c> del propio repositorio. Las dos librerías no guardan lo mismo: TDLib guarda lo
/// permitido (<c>ChatPermissions</c>, <c>TdApi.java:17659-17723</c>, dieciséis campos cuyo orden de constructor
/// es el de <c>:17751</c> y el del DTO de Android) y MTProto guarda lo <b>prohibido</b> (<c>TL.ChatBannedRights</c>,
/// un solo constructor con veintitrés banderas y un <c>until_date</c>). El esquema lo dice con todas sus letras:
/// «In this case, the flags are inverted: if set, a flag does not allow a user to do X». Todo este archivo es esa
/// inversión, tabla por tabla, y por eso cada clave lleva escrita al lado la bandera que la niega.
/// </para>
/// <para>
/// Y la inversión no es biyectiva, que es lo único que este flujo no puede resolver. MTProto tiene dos banderas
/// paraguas —<c>send_messages</c>, que prohíbe escribir cualquier cosa, y <c>send_media</c>, que prohíbe todo medio
/// — a las que TDLib no tiene una clave propia que corresponda. La decisión está en <see cref="Fields"/>: se
/// <b>leen</b> los dos paraguas, porque un miembro bloqueado por ellos no puede ni con la bandera suya, y se
/// <b>escriben</b> solo las banderas propias, porque levantar un paraguas ajeno cambiaría de golpe permisos que la
/// persona no tocó. Lo que queda dicho en lugar de disimulado: un grupo bloqueado por paraguas se lee todo apagado,
/// y apagando interruptores uno a uno no se enciende; eso lo despega Telegram, que es quien puso el paraguas.
/// </para>
/// <para>
/// Tampoco hay tres banderas que el panel no modela y que viajan intactas: <c>view_messages</c> (prohibir ver el
/// historial, que en TDLib es una sanción por persona y no un permiso del grupo), <c>manage_linked_peers</c> y el
/// <c>until_date</c> de la tabla, que es un plazo y no una casilla. <see cref="Written"/> arranca de la tabla que
/// Telegram ya tenía y solo mueve las dieciséis casillas del panel; la pantalla no ofrece nada más, así que nada más
/// se toca.
/// </para>
/// <para>
/// Las dos peticiones medidas: leer no cuesta red —<c>TL.Channel.default_banned_rights</c> viene con el peer, presente
/// con <c>flags.has_default_banned_rights</c> (262144)— y escribir es una sola,
/// <c>Messages_EditChatDefaultBannedRights(Client, InputPeer, ChatBannedRights) -&gt; Task&lt;UpdatesBase&gt;</c>, que
/// es la que Android no tiene: TDLib usa <c>SetChatPermissions</c> sobre el chat. La respuesta de MTProto es un
/// <c>Updates</c> que puede no traer lista de chats, así que el espejo local se mueve a mano
/// (<see cref="Apply"/>), que es la misma decisión que ya tomaron la ronda BC con el nombre público y la AU con la
/// foto de la cuenta.
/// </para>
/// <para>
/// Última diferencia de capas, y es la que fijó la ronda AT. En Android el <c>throw</c> de la forma
/// (<c>NativeBridge.java:2396</c>) y el de <c>requiredBool</c> (<c>:2777</c>, «Missing permission: X», en inglés) nunca
/// llegan a la pantalla: el <c>catch</c> del despacho genérico (<c>:167</c>) convierte cualquier fallo en «Solicitud no
/// válida o función no disponible.». Windows
/// dice la causa en español, que es la norma de la casa para lo que en Java es un fallo de programación y no un aviso.
/// La norma y el orden no cambian; solo el camino por el que llegan.
/// </para>
/// </summary>
public static class DesktopGroupPermissions
{
    // ---- las frases ----

    /// El <c>answer.fail</c> de <c>groupPermissions</c> (<c>NativeBridge.java:1888</c>) cuando el chat no es un
    /// supergrupo. Es la única negación que este flujo decide sin preguntarle a Telegram, y dice «supergrupos y
    /// canales» porque en TDLib el canal <i>es</i> un supergrupo con <c>isChannel</c>.
    public const string Unsupported = "La edición de permisos solo está disponible en supergrupos y canales.";

    /// El <c>IllegalArgumentException</c> de <c>setGroupPermissions</c> (<c>:2394</c>): la misma norma dicho con otras
    /// palabras, porque allá la escritura no usa el <c>answer.fail</c> de la lectura.
    public const string Required = "Se requiere un supergrupo o canal.";

    /// Las dos veces que Android niega el derecho, en <c>:1885</c> y en <c>:2393</c>, con la cadena exacta. El testigo
    /// es <c>canRestrictMembers</c>, que en MTProto es <c>ChatAdminRights.Flags.ban_users</c> y ya lo sabe
    /// <see cref="DesktopGroupMembers.Actor.CanRestrict"/>; aquí solo vive la frase.
    public const string NoRight = "Telegram no concede a esta cuenta el permiso para cambiar permisos del grupo.";

    /// El <c>answer.fail</c> de <c>:1886</c> cuando <c>chat.permissions</c> vale <c>null</c>: TDLib aún no había
    /// cargado la tabla. Sin dato no se pinta un panel en blanco que invite a escribir encima.
    public const string Unreadable = "Telegram aún no cargó los permisos predeterminados.";

    /// Lo que <c>requiredBool</c> (<c>:2775</c>) provoca en Android cuando una de las dieciséis claves no llega o no es
    /// booleano. Allá es un <c>throw</c> en inglés que el despacho genérico convierte en el aviso genérico; aquí es la
    /// causa concreta, en español y sin número de clave, que es lo único que la persona puede comprobar.
    public const string Incomplete = "Algún permiso no llegó marcado como verdadero o falso. Vuelve a abrir el panel y guárdalos otra vez.";

    /// El <c>answer.fail</c> del botón positivo de <c>:2394</c>, la guarda de cuenta antes de escribir.
    public const string ChangedAccount = "La cuenta cambió. No se cambiaron permisos.";

    /// Las tres palabras del <c>Dialogs.builder</c> de <c>:2394</c>. El <c>Cancelar</c> no se vuelve a declarar: es
    /// <see cref="DesktopProfilePhoto.Cancel"/>, la misma cadena que ya usan los diálogos de la foto desde la AU.
    public const string DialogTitle = "Cambiar permisos predeterminados";
    public const string DialogBody =
        "Se aplicarán a los miembros del grupo. No cambian los permisos de administradores ni se enviarán mensajes.";
    public const string DialogAccept = "Guardar permisos";

    // ---- la tabla ----

    private const ChatBannedRights.Flags Messages = ChatBannedRights.Flags.send_messages;
    private const ChatBannedRights.Flags Media = ChatBannedRights.Flags.send_media;

    /// <summary>
    /// Las dieciséis claves del DTO de Android, en el orden exacto de su <c>object(...)</c>
    /// (<c>NativeBridge.java:1888</c>) y del constructor de <c>TdApi.ChatPermissions</c> (<c>TdApi.java:17751</c>).
    /// <c>Denied</c> son las banderas que este panel escribe; <c>Covers</c> son las que no escribe pero que también
    /// prohíben lo mismo, y por eso entran en la lectura. Cada emparejamiento está sacado de la glosa del campo de
    /// TDLib y del comentario de la bandera en el esquema de la capa 232, que son las dos únicas fuentes que hay en
    /// el repositorio.
    /// </summary>
    public static readonly (string Key, ChatBannedRights.Flags Denied, ChatBannedRights.Flags Covers)[] Fields =
    {
        // «text messages, rich messages, contacts, giveaways, invoices, locations, and venues» contra «does not allow
        // a user to send text messages»: la bandera que nombra el texto es `send_plain`, y `send_messages` es el
        // paraguas de todo envío, así que la casilla se apaga por cualquiera de las dos y se escribe solo por la suya.
        ("canSendBasicMessages", ChatBannedRights.Flags.send_plain, Messages),
        ("canSendAudios", ChatBannedRights.Flags.send_audios, Messages | Media),
        ("canSendDocuments", ChatBannedRights.Flags.send_docs, Messages | Media),
        ("canSendPhotos", ChatBannedRights.Flags.send_photos, Messages | Media),
        ("canSendVideos", ChatBannedRights.Flags.send_videos, Messages | Media),
        // El vídeo circular es la nota de vídeo de TDLib: `send_roundvideos` lo llama el esquema, `video notes` lo
        // llama la glosa de `TdApi.java:17681`.
        ("canSendVideoNotes", ChatBannedRights.Flags.send_roundvideos, Messages | Media),
        ("canSendVoiceNotes", ChatBannedRights.Flags.send_voices, Messages | Media),
        // Una encuesta no es «medio» en MTProto —el esquema lo separa—, así que solo le cubre el paraguas de envío.
        ("canSendPolls", ChatBannedRights.Flags.send_polls, Messages),
        // La clave de TDLib agrupa cuatro banderas: «animations, games, stickers, and dice and use inline bots».
        ("canSendOtherMessages",
            ChatBannedRights.Flags.send_stickers | ChatBannedRights.Flags.send_gifs
            | ChatBannedRights.Flags.send_games | ChatBannedRights.Flags.send_inline,
            Messages | Media),
        ("canAddLinkPreviews", ChatBannedRights.Flags.embed_links, Messages),
        // Lo que viene no es enviar: reaccionar, cambiar la etiqueta propia, editar el grupo, invitar, fijar y crear
        // temas. Cada uno tiene su bandera y ningún paraguas los toca.
        ("canReactToMessages", ChatBannedRights.Flags.send_reactions, 0),
        ("canEditTag", ChatBannedRights.Flags.edit_rank, 0),
        ("canChangeInfo", ChatBannedRights.Flags.change_info, 0),
        ("canInviteUsers", ChatBannedRights.Flags.invite_users, 0),
        ("canPinMessages", ChatBannedRights.Flags.pin_messages, 0),
        ("canCreateTopics", ChatBannedRights.Flags.manage_topics, 0),
    };

    /// `chat.type instanceof ChatTypeSupergroup` (`:1868` y el throw de `:2376`). En MTProto la forma del peer es la
    /// que dice si es básico o canal, y un básico se niega: la tabla de permisos por defecto de un grupo básico no la
    /// edita este puente, que es lo mismo que decide Android.
    public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Channel;

    /// La tabla que Telegram mandó con el peer, si la mandó. Con la bandera apagada no hay dato, y adivinarlo
    /// pintando todo encendido sería ofrecer un panel que miente.
    public static ChatBannedRights? Stored(ChatBase? entity) => entity switch
    {
        Channel channel when (channel.flags & Channel.Flags.has_default_banned_rights) != 0 => channel.default_banned_rights,
        _ => null
    };

    /// El DTO de <c>:1885</c>: las dieciséis claves, en su orden, cada una en verdadero solo si ni su bandera ni
    /// ninguno de sus paraguas está puesto. La inversión es la del esquema, no una decisión de aquí.
    public static Dictionary<string, bool> Dto(ChatBannedRights rights) => Fields.ToDictionary(
        field => field.Key,
        field => (rights.flags & (field.Denied | field.Covers)) == 0);

    /// Si las dieciséis claves están todas presentes. Es el <c>requiredBool</c> de <c>:2394</c> hecho pregunta: la
    /// pantalla siempre las manda todas, así que faltar una es un mensaje mal formado, no un gusto del usuario.
    public static bool Complete(IReadOnlyDictionary<string, bool> values) =>
        Fields.All(field => values.ContainsKey(field.Key));

    /// La tabla nueva, arrancando de la que ya había. Las banderas que este panel no modela —los dos paraguas,
    /// <c>view_messages</c>, <c>manage_linked_peers</c> y el <c>until_date</c>— se copian sin tocarlas: una casilla
    /// del panel no puede levantar una prohibición que la persona no tocó. Sin tabla anterior se parte de cero, que es
    /// lo que Telegram entiende por «todo permitido».
    public static ChatBannedRights Written(ChatBannedRights? current, IReadOnlyDictionary<string, bool> values)
    {
        var rights = new ChatBannedRights
        {
            flags = current?.flags ?? default,
            until_date = current?.until_date ?? default
        };
        foreach (var field in Fields)
            rights.flags = values[field.Key] ? rights.flags & ~field.Denied : rights.flags | field.Denied;
        return rights;
    }

    /// Mover el espejo local después del <c>true</c>, porque <c>messages.editChatDefaultBannedRights</c> responde un
    /// <c>Updates</c> que puede no traer la lista de chats. Es la misma <c>Apply</c> de la ronda BC con el nombre
    /// público, y cumple la norma de la ronda AE: la lectura siguiente tiene que decir lo que Telegram acaba de
    /// aceptar.
    public static void Apply(ChatBase? entity, ChatBannedRights rights)
    {
        if (entity is not Channel channel) return;
        channel.default_banned_rights = rights;
        channel.flags |= Channel.Flags.has_default_banned_rights;
    }

    /// Los cinco rechazos que <c>messages.editChatDefaultBannedRights</c> puede devolver con nombre propio y este
    /// flujo puede provocar —los cinco medidos en el esquema de la capa 232 para el método—. El resto viaja tal cual
    /// lo dijo Telegram, por la misma razón que en la ronda BC: inventar una causa para un código no medido engaña más
    /// que enseñar el código.
    public static string? Refusal(string? error) => error switch
    {
        _ when Starts(error, "CHAT_NOT_MODIFIED") => "Esos ya son los permisos que Telegram tiene guardados.",
        _ when Starts(error, "CHAT_ADMIN_REQUIRED") => NoRight,
        _ when Starts(error, "BANNED_RIGHTS_INVALID") => "Telegram no acepta esa combinación de permisos.",
        _ when Starts(error, "CHANNEL_PRIVATE") => "Esta cuenta ya no está dentro de la comunidad.",
        _ when Starts(error, "PEER_ID_INVALID") || Starts(error, "CHAT_ID_INVALID")
            || Starts(error, "CHANNEL_INVALID") => "La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.",
        _ => null
    };

    /// Como en el resto del puente: el mensaje de un <c>RpcException</c> trae el código seguido del detalle, así que se
    /// compara por prefijo y no por igualdad.
    private static bool Starts(string? error, string code) =>
        !string.IsNullOrEmpty(error) && error.StartsWith(code, StringComparison.Ordinal);
}
