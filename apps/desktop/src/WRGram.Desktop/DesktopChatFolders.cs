namespace WRGram.Desktop;

using TL;

/// <summary>
/// Archivar y marcar como no leído en Windows. Android lo hace con dos funciones de TDLib que actúan sobre una
/// conversación suelta —<c>AddChatToList</c> con <c>ChatListArchive</c>/<c>ChatListMain</c> y
/// <c>ToggleChatIsMarkedAsUnread</c>—; MTProto reparte lo mismo en dos peticiones que no se parecen en nada:
/// <c>folders.editPeerFolders</c> y <c>messages.markDialogUnread</c>. Esta clase guarda lo que las dos
/// peticiones necesitan saber y que ningún otro sitio dice.
/// <para>
/// La de archivar es la que obliga a escribir algo: en este esquema el archivo <b>no es una lista aparte</b>,
/// es la carpeta de pares con id <b>1</b>. Las dos pruebas más cercanas están en la propia librería —<c>Dialog</c>
/// publica un <c>folder_id</c> y <c>updateFolderPeers</c> anuncia los cambios como pares <c>(peer, folder_id)</c>—
/// y el host ya las leía: pintaba la fila archivada comparando <c>dialog.folder_id == 1</c> mucho antes de saber
/// escribirlo. Volver a la lista general es id <b>0</b>, porque un diálogo pertenece a una sola carpeta: archivar
/// saca de la principal y desarchivar devuelve.
/// </para>
/// <para>
/// Lo que esta versión de la librería no deja hacer, dicho para que nadie lo reintente: fijar una conversación
/// <b>dentro</b> de una carpeta. <c>messages.toggleDialogPin</c> pide un <c>InputDialogPeerBase</c> y las tres
/// formas del unón son <c>InputDialogPeer{peer}</c>, <c>InputDialogPeerFolder{folder_id}</c> —la carpeta entera,
/// para fijarla en la barra— y <c>InputDialogPeerCommunity{community_id}</c>; ninguna lleva un par
/// (diálogo, carpeta) y <c>messages.updatePinnedDialogs</c> no está generado. Esta es la razón real del hueco que
/// la ronda AF escribió como «el host no tiene lista activa que mandar»: la lista activa sí existe
/// (<c>_mode</c>), lo que no existe es la forma de nombrarla en la petición.
/// </para>
/// <para>
/// Queda una duda razonable y está dicha también en <c>docs/validation.md</c>: la documentación del parámetro de
/// <c>folders.editPeerFolders</c> dice <c>New peer list</c>, que admite la lectura «la lista nueva de la carpeta»
/// además de «la pareja nueva de este par». Se manda una sola pareja por escritura porque ese es el modelo de un
/// diálogo con una carpeta, porque <c>updateFolderPeers</c> responde por parejas y porque así archiva TDLib una
/// conversación suelta. Lo primero que hay que comprobar contra una cuenta real es que archivar una deja intactas
/// las demás.
/// </para>
/// <para>
/// Y lo que <c>messages.markDialogUnread</c> pide y aquí no se manda: <c>parent_peer</c>, que solo sirve para un
/// tema de un monoforo. Ninguna capa de este host maneja temas, así que la marca siempre es sobre la
/// conversación completa.
/// </para>
/// </summary>
public static class DesktopChatFolders
{
    /// La lista general. En MTProto no es una carpeta que se pueda crear ni renombrar: es «sin carpeta», y por
    /// eso desarchivar escribe este id y no un `null`.
    public const int Main = 0;

    /// El archivo, reservado por el esquema con este id. Las carpetas que crea la persona empiezan después, y
    /// ninguna de ellas hace que una fila se pinte archivada.
    public const int Archive = 1;

    /// Dirección de la escritura: el `value` que manda la pantalla —el mismo `true`/`false` de Android—
    /// traducido al id que pide la petición.
    public static int FolderOf(bool archived) => archived ? Archive : Main;

    /// Las dos fuentes que dicen si una fila está archivada: la lista que se pidió y la bandera de la propia
    /// fila. Las dos comparaciones estaban escritas a mano (`folder == 1 || dialog.folder_id == 1`) en la carga
    /// inicial y en la de paginación, que es la forma habitual de que se separen.
    public static bool IsArchived(int listFolder, int dialogFolder) => listFolder == Archive || dialogFolder == Archive;

    /// La marca de «no leído» la trae el diálogo como bandera, y es lo único que la distingue del contador de
    /// mensajes sin leer: una fila puede tener `unread_count` a cero y seguir marcada.
    public static bool IsMarked(Dialog dialog) => (dialog.flags & Dialog.Flags.unread_mark) != 0;

    /// <c>updateDialogUnreadMark</c> nombra el diálogo con el mismo unón de tres formas. Solo <c>dialogPeer</c>
    /// describe una fila de esta lista; la carpeta y la comunidad se ignoran en vez de adivinar a qué chat
    /// pertenecen.
    public static Peer? PeerOf(DialogPeerBase? peer) => peer switch
    {
        DialogPeer dialog => dialog.peer,
        _ => null,
    };

    /// El puente necesita el `InputPeer` para las dos peticiones, y una fila de la lista puede no tenerlo si la
    /// conversación llegó recortada y nunca se resolvió. Se niega con la causa en lugar de dejar que la librería
    /// lance con un `null` dentro.
    public const string NotResolved =
        "La conversación todavía no está resuelta en Telegram, así que no se cambió ni su lista ni su marca.";
}
