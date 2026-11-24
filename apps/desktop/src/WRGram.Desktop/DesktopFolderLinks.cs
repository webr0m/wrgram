namespace WRGram.Desktop;

using System.Text.RegularExpressions;
using TL;

/// <summary>
/// Reglas de los enlaces de una lista colaborativa en Windows (ronda CI). Android administra esos enlaces con tres
/// funciones de TDLib —<c>GetChatFolderInviteLinks</c> (<c>NativeBridge.java:3992</c>),
/// <c>EditChatFolderInviteLink</c> (<c>NativeBridge.java:4013</c> y <c>:3978</c>) y
/// <c>DeleteChatFolderInviteLink</c> (<c>NativeBridge.java:4008</c>)— y las tres nombran el enlace con su URL
/// entera. MTProto usa la familia <c>chatlists.*</c>, medida por reflexión sobre WTelegramClient 4.4.10, y ahí el
/// enlace se nombra con un <c>slug</c> suelto: <c>Chatlists_GetExportedInvites(InputChatlist)</c>,
/// <c>Chatlists_EditExportedInvite(InputChatlist, slug, title, peers)</c> y
/// <c>Chatlists_DeleteExportedInvite(InputChatlist, slug)</c>. Toda la traducción entre las dos formas vive aquí.
/// <para>
/// <b>El <c>slug</c> se saca, no se supone.</b> <c>TL.ExportedChatlistInvite.url</c> no documenta si Telegram lo
/// devuelve entero («https://t.me/addlist/XXXX») o recortado, y ninguna de las dos capas lo ha preguntado nunca a
/// una cuenta real. El brazo acepta las dos: si la cadena trae el dominio, se saca lo que va detrás de
/// <c>addlist/</c>; si no lo trae, se usa la cadena tal cual. Lo mismo se hace con el enlace que la pantalla
/// devuelve, así que la comparación de la ronda no depende de qué forma elija el servidor. Lo que sí se corta: una
/// vez quitado el dominio no puede quedar una barra, porque «addlist/XXXX» sin dominio no es un slug sino media
/// URL. El <c>folders.join</c> de la ronda G usaba esta misma regla sin cortarla por ahí; ahora la comparten los
/// cuatro brazos y el join dejó de aceptar esa mitad, que Telegram rechazaba en su sitio.
/// </para>
/// <para>
/// <b>Renombrar no es reenviar los chats.</b> <c>Chatlists_EditExportedInvite</c> trae dos banderas,
/// <c>has_title</c> y <c>has_peers</c>, que es la forma que tiene MTProto de decir «ese campo no lo toco». Android
/// no tiene esa opción —<c>EditChatFolderInviteLink(folder_id, invite_link, name, chat_ids)</c> lleva los chats
/// obligatorios— y por eso su relectura reenvía <c>link.chatIds</c>, los que acaba de leer. Aquí se manda solo el
/// título y <c>peers</c> viaja en su defecto: es la misma intención expresada por el protocolo, no un atajo.
/// </para>
/// <para>
/// <b>Lo que esta capa no puede, dicho por su nombre.</b> Android cambia los chats de un enlace ya creado abriendo
/// un selector nativo (<c>chooseFolderChats</c>, <c>NativeBridge.java:4039</c>) y el host no tiene ningún selector
/// que mandar: los <c>InputPeer</c> con acceso escrito solo los sabe la pantalla de la carpeta, y el enlace lleva
/// su propia lista, independiente de la de la lista colaborativa. Así que <c>chooseChats</c> se niega con
/// <see cref="NoPicker"/> en vez de contestar <c>true</c> habiendo renombrado a medias, y la pantalla deja de
/// ofrecer el botón en Windows —la misma norma con la que la ronda BY quitó el «Quitar» del estado emoji en
/// <c>EmojiStatusSettings.tsx:156</c>—.
/// </para>
/// <para>
/// <b>Una forma de chat que no es la de Android.</b> <c>TL.ExportedChatlistInvite</c> publica <c>Peer[] peers</c>,
/// sin <c>access_hash</c>, y las claves que este host reparte por el puente llevan prefijo de forma
/// (<c>u</c>/<c>g</c>/<c>c</c>, la regla única de <c>ChatIdOf</c>); Android repone el número de chat de TDLib
/// pelado (<c>idList</c>, <c>NativeBridge.java:3929</c>). Ninguna de las dos capas usa la clave para nada más que
/// contar: la pantalla pinta <c>invite.chatIds.length</c> y el botón de elegir chats de Android viaja con ids
/// numéricos propios. La diferencia queda escrita aquí porque es la que alguien intentará «arreglar» algún día.
/// </para>
/// </summary>
public static class DesktopFolderLinks
{
    /// Techo del identificador opaco con que MTProto nombra el enlace, el mismo con el que la ronda G ya cortaba
    /// <c>folders.join</c>.
    public const int MaxSlug = 64;

    /// Gemelo carácter a carácter de <c>NativeBridge.java:4017</c>, la única negativa que Android pronuncia en
    /// <c>folderLinkChange</c>: la lista que la pantalla enseñaba ya no contiene ese enlace.
    public const string Gone = "Este enlace ya no pertenece a la carpeta.";

    /// La de la ronda G, movida aquí para que los cuatro brazos del enlace la digan una sola vez: antes estaba
    /// escrita como literal dentro de <c>FolderJoinAsync</c>.
    public const string BadLink = "El enlace de la lista no es válido.";

    /// La de la ronda G, misma razón: era literal dentro de <c>FolderLinkAsync</c>. Un <c>DialogFilter</c> normal
    /// no es una lista colaborativa y no tiene con qué exportar nada.
    public const string NotChatlist = "Solo se pueden compartir las listas colaborativas, no las carpetas normales.";

    /// Cuatro brazos la decían como literal suelto (<c>FolderGetAsync</c>, <c>FolderSaveAsync</c>,
    /// <c>FolderDeleteAsync</c> y <c>FolderLinkAsync</c>) y ahora la piden por alias: cuatro literales iguales son
    /// cuatro verdades que se pudren por separado.
    public const string NoFolder = "Esta carpeta ya no existe.";

    /// El mismo corte con el que <c>FolderLinkAsync</c> ya negaba el nombre al crear, escrito una vez. Es un
    /// límite de esta capa: Android recorta a 32 con <c>BridgePolicy.text</c> pero no exige ninguno, así que allí
    /// un enlace puede quedarse sin nombre y aquí no.
    public const string BadLinkName = "El nombre del enlace debe tener entre 1 y 32 caracteres.";

    /// La lista sin chats no se puede compartir: la petición pide <c>InputPeer[]</c> y MTProto no admite la
    /// exporting con el array vacío. Era literal de <c>FolderLinkAsync</c>.
    public const string NoChatsYet = "Añade chats a la lista antes de compartirla.";

    /// La negativa sin gemelo en Android, y por eso está explicada arriba: aquí se renombra y se revoca, pero los
    /// chats de un enlace ya creado no se eligen en este aparato.
    public const string NoPicker =
        "El equipo renombra y revoca el enlace, pero no tiene selector para cambiar los chats de un enlace ya creado.";

    /// Las dos escrituras de MTProto devuelven un <c>Boolean</c> —la revocación— y el enlace ya cambiado —la
    /// edición—, así que un <c>boolFalse</c> o un vacío es una respuesta de Telegram que dice «no pasó nada».
    /// Android no puede decir esto: sus dos peticiones devuelven <c>Ok</c> y un error es una excepción. Aquí
    /// contestar <c>true</c> con esa respuesta sería afirmar un cambio que el servidor negó.
    public const string NotConfirmed = "Telegram no confirmó el cambio del enlace.";

    /// El <c>slug</c> con el que MTProto nombra el enlace, o <c>null</c> si la cadena no lo trae. Acepta las dos
    /// formas en que <c>url</c> puede llegar y la que la pantalla devuelve tal cual.
    public static string? SlugOf(string? link)
    {
        var value = (link ?? "").Trim();
        var match = Regex.Match(value, @"(?:t\.me|telegram\.me)/addlist/([A-Za-z0-9_\-]+)", RegexOptions.IgnoreCase);
        var slug = match.Success ? match.Groups[1].Value : value.TrimStart('/');
        if (slug.Length is < 1 or > MaxSlug || slug.Contains('/')) return null;
        return slug;
    }

    /// El enlace de la lista que ya tiene ese <c>slug</c>, comparado por slug y no por cadena entera: la que
    /// devuelve la lectura y la que devuelve la pantalla pueden no traer el mismo prefijo. Sin coincidencia no hay
    /// nada que escribir, y eso es <see cref="Gone"/>.
    public static ExportedChatlistInvite? Find(ExportedChatlistInvite[]? invites, string slug)
    {
        foreach (var invite in invites ?? Array.Empty<ExportedChatlistInvite>())
            if (SlugOf(invite.url) == slug) return invite;
        return null;
    }

    /// Nombre ya recortado como lo recorta Android (<c>BridgePolicy.text(params,"name",32).trim()</c> en
    /// <c>NativeBridge.java:4003</c>), con el corte de esta capa en el largo.
    public static bool NameAllowed(string name) => name.Length is >= 1 and <= 32;
}
