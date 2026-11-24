namespace WRGram.Desktop;

/// <summary>
/// La foto de una comunidad en Windows: sus frases y las dos reglas que deciden si el host llega a escribirla.
/// Todo lo que aquí se copia viene de <c>NativeBridge.chatPhotoPick</c> (<c>NativeBridge.java:1737-1745</c>), de su
/// continuación <c>pickedChatPhoto</c> (<c>:1743-1751</c>), del diálogo de confirmar (<c>:1751-1761</c>) y del de
/// borrar (<c>:1771-1782</c>).
/// <para>
/// Las cuatro negaciones y las cuatro cadenas del diálogo son literales de Android, carácter por carácter. La forma
/// y el derecho no se vuelven a escribir aquí: son las mismas dos reglas con las que la ronda AW decide el nombre y
/// la descripción de la comunidad (<see cref="DesktopCommunityInfo.Supported"/> y
/// <see cref="DesktopCommunityInfo.CanChange"/>), porque Android también las comparte —<c>ChatEditing.supported</c>
/// y <c>ChatEditing.canChange</c>, con las mismas dos constantes <c>COMMUNITY_UNSUPPORTED</c>
/// (<c>NativeBridge.java:1894</c>) y <c>COMMUNITY_NO_RIGHT</c> (<c>:1895</c>)— y una norma que vive dos veces en la
/// misma capa se pudre la primera vez que cambia. Lo mismo con el descarte de la imagen y con «Cancelar»: son
/// <see cref="DesktopProfilePhoto.NoImage"/> y <see cref="DesktopProfilePhoto.Cancel"/>.
/// </para>
/// <para>
/// Y hay una orden que no se copia, dicho en lugar de fingido. Android borra la foto con el mismo método con que la
/// pone: <c>SetChatPhoto(chat.id,null)</c> (<c>NativeBridge.java:1783</c>), porque TDLib documenta que un
/// <c>photo</c> vacío deja la comunidad sin imagen. MTProto no expresa ese vacío: medido por reflexión sobre
/// WTelegramClient 4.4.10, <c>TL.InputChatPhotoBase</c> tiene dos derivados —<c>TL.InputChatUploadedPhoto</c> y
/// <c>TL.InputChatPhoto</c>— y el constructor <c>inputChatPhotoEmpty</c> no está generado, así que no hay objeto
/// que meter en el campo <c>photo</c> de <c>TL.Methods.Channels_EditPhoto</c>. Tampoco vale construir un
/// <c>InputChatPhoto</c> a partir de lo que la fila trae: <c>TL.ChatPhoto</c> solo tiene <c>photo_id</c>,
/// <c>stripped_thumb</c> y <c>dc_id</c>, sin <c>access_hash</c> ni <c>file_reference</c>. Windows entonces escribe
/// la foto nueva y no la quita, la pantalla de escritorio no ofrece la segunda entrada, y quien pregunte de todos
/// modos recibe <see cref="NoDelete"/>.
/// </para>
/// <para>
/// La otra diferencia es de gesto, no de norma. Android deja la petición abierta mientras la galería y el
/// <c>AlertDialog</c> están delante (<c>chatPhotoPicking</c> se asigna en <c>NativeBridge.java:1743</c>) y por eso
/// necesita la negativa «Ya hay un selector de imagen abierto» (<c>PHOTO_BUSY</c>, <c>:1722</c>); aquí las dos
/// ventanas son modales del propio proceso y no se abultan, así que esa frase no tiene dónde aparecer. Lo que sí se
/// conserva es el orden: <c>ChatEditing.supported</c> (<c>:1739</c>) y <c>ChatEditing.canChange</c> (<c>:1741</c>) se
/// comprueban <b>antes</b> de abrir el selector, porque pedirle a la persona que busque una foto para luego decirle
/// que no puede usarla es hacerle un trabajo que no era suyo.
/// </para>
/// </summary>
public static class DesktopChatPhoto
{
    /// <c>CHAT_PHOTO_UNSUPPORTED</c> (<c>NativeBridge.java:1723</c>). Es la misma negación de forma que la del
    /// nombre, con el noun cambiado: <c>SetChatPhoto</c> de TDLib documenta básicos, supergrupos y canales, y el
    /// uno a uno, el secreto y Guardados siguen fuera.
    public const string Unsupported = "La foto solo se edita en grupos, supergrupos y canales.";

    /// <c>CHAT_PHOTO_CHANGED</c> (<c>NativeBridge.java:1724</c>), que Android repite en los dos guardajes —el de
    /// después de preparar (<c>:1748</c>) y el del botón positivo (<c>:1757</c>)— igual que el de perfil.
    public const string ChangedAccount = "La cuenta cambió. No se cambió la foto de la comunidad.";

    /// <c>CHAT_PHOTO_PICK_TITLE</c> (<c>NativeBridge.java:1725</c>).
    public const string PickTitle = "Confirmar foto de la comunidad";

    /// <c>CHAT_PHOTO_PICK_BODY</c> (<c>NativeBridge.java:1726</c>). A diferencia del de perfil, que promete
    /// privacidad, este promete visibilidad: la foto de una comunidad la ven todas las personas que están dentro.
    public const string PickBody =
        "Esta foto se establecerá en Telegram como imagen de la comunidad. Todas las personas que estén dentro la verán y WRGram no la envía a sus servidores.";

    /// <c>setPositiveButton("Establecer foto",…)</c> del mismo diálogo (<c>NativeBridge.java:1757</c>).
    public const string PickAccept = "Establecer foto";

    /// <c>CHAT_PHOTO_DELETE_TITLE</c> (<c>NativeBridge.java:1727</c>). Vive aquí aunque Windows no lo muestre, porque
    /// el andamio sí lo pinta y la frase tiene que existir una sola vez por capa.
    public const string DeleteTitle = "Quitar foto de la comunidad";

    /// <c>CHAT_PHOTO_DELETE_BODY</c> (<c>NativeBridge.java:1728</c>).
    public const string DeleteBody = "La imagen actual se quitará de la comunidad en Telegram. WRGram no conserva una copia.";

    /// <c>setPositiveButton("Quitar foto",…)</c> del diálogo de borrar (<c>NativeBridge.java:1781</c>).
    public const string DeleteAccept = "Quitar foto";

    /// El título del selector de Windows, que es el del propio diálogo; en Android se lo pone el sistema y por eso
    /// <c>chooseChatPhoto</c> no tiene frase (<c>ShellActivity.java</c>, <c>chatPhotoPicker.launch("image/*")</c>).
    public const string PickFile = "Elegir la foto de la comunidad";

    /// <summary>
    /// La única frase de esta clase que no está en Android, y la que explica por qué falta el brazo: la librería no
    /// genera el vacío con el que MTProto deja una comunidad sin imagen. Dicho así, en lugar de un
    /// «No disponible en escritorio (beta)» que dejaría entender que falta tiempo y no una petición.
    /// </summary>
    public const string NoDelete =
        "Windows no puede quitar la foto de la comunidad: la librería no trae el vacío con el que Telegram borra la imagen. Hazlo desde Telegram.";

}
