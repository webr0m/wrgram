using TL;

namespace WRGram.Desktop;

/// <summary>
/// Reglas de «añadir» y «quitar» una persona de la agenda propia en Windows. Android atiende las dos en el mismo
/// método, <c>contactAction</c> (<c>NativeBridge.java:1859</c>), con las dos claves del puente juntas en un solo
/// <c>case</c> (<c>:563</c>), y este archivo es su traducción: las dos frases que se ven cuando algo no puede ser,
/// las dos que se ven cuando sí puede pero no hace falta, el cuadro de confirmar con sus tres rótulos, la regla de
/// los dos nombres y el orden exacto en que todo eso ocurre. El hilo está en <see cref="DesktopContactWriteFlow"/>.
/// <para>
/// <b>Las cuatro salidas de Android, que son cuatro y no dos.</b> La pantalla solo sabe preguntar
/// (<c>App.tsx:750</c>) y mirar el <c>boolean</c> que vuelve (<c>PeerProfile.tsx:97</c> es el botón que lo pide), y
/// <c>:1839</c> tiene cuatro caminos: negar con frase, decir «no hace nada» porque la persona ya está en el estado
/// que se pedía, abrir el cuadro y escribir, o cerrarse sin escribir. Los dos del medio son los que se olvidan:
/// <c>contacts.remove</c> sobre alguien que no es contacto responde <c>ok(false)</c> sin tocar Telegram, y
/// <c>contacts.add</c> sobre alguien que ya lo es responde <c>ok(false)</c> igual. Ninguno de los dos es un error, y
/// por eso no tienen frase: son el <c>false</c> que la pantalla ya sabe leer.
/// </para>
/// <para>
/// <b>La primera negación es la forma del chat y la segunda es la persona.</b> Allá
/// <c>!(chat.type instanceof TdApi.ChatTypePrivate)</c> corta con <see cref="NotPrivate"/> y
/// <c>user==null || user.type instanceof UserTypeBot || userId==session.selfId</c> corta con <see cref="NotAddable"/>
/// (<c>:1839</c>). Aquí la primera es un <c>Peer</c> que no es <c>PeerUser</c> y la segunda se mira sobre el
/// <c>TL.User</c> de la caché con las dos banderas medidas de WTelegramClient 4.4.10 (<c>bot</c> y <c>self</c>). La
/// frase habla de «agregar» aunque corte también los dos <c>contacts.remove</c>: es literal de Java, no una
/// aproximación nuestra, y se queda como está.
/// </para>
/// <para>
/// <b>La diferencia de protocolo que obliga a una negación nueva.</b> TDLib escribe la agenda con números sueltos
/// (<c>RemoveContacts(new long[]{userId})</c> y <c>AddContact(userId,…)</c>) porque su base de datos guarda los
/// <c>access_hash</c>; MTProto pide <c>InputUserBase</c> en las dos —medido sobre 4.4.10:
/// <c>Contacts_AddContact(Client,InputUserBase,String,String,String,TextWithEntities,Boolean)</c> y
/// <c>Contacts_DeleteContacts(Client,InputUserBase[])</c>— y el hash solo viaja en las respuestas que la sesión ya
/// recibió. Es la misma asimetría que la ronda BH encontró en las excepciones de privacidad
/// (<c>DesktopPrivacy.MissingUser</c>) y la BI en los desbloqueos (<c>DesktopBlocked.NeedsHash</c>): sin hash se
/// aborta la escritura y no se manda un cero. <see cref="NeedsHash"/> es esa negación, y solo existe aquí.
/// </para>
/// <para>
/// <b>Lo que viaja en la tarjeta.</b> Android arma <c>new TdApi.ImportedContact("",first,last,null)</c> —número
/// vacío y sin libreta— y <c>add_phone_privacy_exception</c> vale el <c>false</c> del tercer argumento de su
/// <c>AddContact</c>. La traducción literal son las tres constantes de abajo: <see cref="NoPhone"/>, ninguna nota y
/// ninguna excepción de privacidad. Es la parte que el cuadro promete con su segunda frase («No se compartirá tu
/// número») y la que la cumple.
/// </para>
/// <para>
/// <b>Los nombres tienen dos reglas, no una.</b> Los dos que se <em>escriben</em> salen de
/// <c>NativeSnapshot.limit</c> con el relleno de Android: el primero en blanco se convierte en «Contacto» y los dos
/// se recortan a 64. El que se <em>lee en el cuadro</em> es otro: <c>user.firstName==null?chat.title:user.firstName</c>
/// sin recortar, porque el diálogo habla de la persona por como TDLib la llama y la ficha ya la había nombrado antes.
/// Se mantienen separados —<see cref="First"/> frente a <see cref="DialogName"/>— por el mismo motivo por el que la
/// ronda BI dejó <c>NameShown</c> y <c>NameInDialog</c> en la clase de miembros: dos recortes distintos a propósito
/// no se funden en una función.
/// </para>
/// <para>
/// Una divergencia dicha: Java comprueba <c>firstName==null</c> y deja pasar la cadena vacía, que en TDLib es un
/// caso casi imposible; MTProto sí la devuelve, y en WTelegramClient <c>first_name</c> es un <c>string</c> que vale
/// <c>""</c> cuando el esquema trae un usuario mínimo. Aquí los dos casos se tratan igual, porque mandar una tarjeta
/// de contacto sin ningún nombre legible no es lo que Android quiso decir con esa línea, y el nombre que se escribe
/// es el mismo que después se lee en la agenda.
/// </para>
/// <para>
/// <b>Y una cosa que aquí no se copia.</b> Android llama a <c>schedule()</c> después de las dos escrituras
/// (<c>:1839</c>, dentro de los dos <c>perform</c>) para que su lazo de listas vuelva a pedir los chats. Windows no
/// tiene ese lazo que empujar: lo que se ve afectado es la marca de contacto de una sola fila, así que el cable la
/// cambia en su caché y en la fila empujada, que es exactamente lo que la siguiente lectura de Telegram confirmará.
/// </para>
/// </summary>
public static class DesktopContactWrite
{
    /// <summary>
    /// El <c>answer.fail</c> de la primera guarda de <c>:1839</c>, literal. Es la frase con la que Android dice que
    /// la agenda solo se escribe desde una conversación con una persona; un grupo, un canal o un secreto no tienen a
    /// quién añadir.
    /// </summary>
    public const string NotPrivate = "Solo se pueden administrar contactos en conversaciones privadas.";

    /// <summary>
    /// El <c>answer.fail</c> de la segunda guarda (<c>:1839</c>): la sesión no conoce a la persona, es un bot o es la
    /// propia cuenta. Literales las tres causas bajo una sola frase, que es como Java la escribió.
    /// </summary>
    public const string NotAddable = "Esta cuenta no se puede agregar como contacto.";

    /// <summary>
    /// El <c>answer.fail("La cuenta cambió.")</c> del botón positivo (<c>:1839</c>), y es la única de la casa que se
    /// queda sin complemento: las demás —<c>DesktopBlocked.ChangedAccount</c>, <c>DesktopCommunityInfo.ChangedAccount</c>—
    /// dicen además qué no se tocó, y Android aquí no lo dice.
    /// </summary>
    public const string ChangedAccount = "La cuenta cambió.";

    /// <summary>
    /// La negación que solo existe en Windows, con el consejo de la misma forma que las dos hermanas de arriba:
    /// <c>contacts.addContact</c> y <c>contacts.deleteContacts</c> piden <c>InputUserBase</c> con su
    /// <c>access_hash</c>, y cero no se manda nunca. El molde es <c>DesktopPrivacy.MissingUser</c>.
    /// </summary>
    public const string NeedsHash =
        "Telegram no dio los datos necesarios para cambiar la agenda con esta persona. Vuelve a abrir su ficha desde la conversación e inténtalo de nuevo.";

    /// <summary>El <c>setTitle("Añadir contacto")</c> del <c>Dialogs.builder</c> de <c>:1839</c>.</summary>
    public const string DialogTitle = "Añadir contacto";

    /// <summary>El <c>setPositiveButton("Añadir",…)</c>, y el rótulo del botón que la pantalla ya no tiene.</summary>
    public const string DialogAccept = "Añadir";

    /// <summary>
    /// El <c>ImportedContact</c> de Android lleva <c>""</c> como número y <c>add_phone_privacy_exception</c> en
    /// falso: la tarjeta se escribe sin número y sin abrir la propia. Es lo que la segunda frase del cuadro promete.
    /// </summary>
    public const string NoPhone = "";

    /// <summary>El cuerpo de <c>:1839</c>, con el nombre en el hueco y sin recorte, tal como lo escribe Java.</summary>
    public static string DialogBody(string name) =>
        "Se añadirá " + name + " a tus contactos de Telegram. No se compartirá tu número.";

    /// <summary>
    /// La bandera con la que las dos capas saben si la persona ya está en la agenda. TDLib la llama
    /// <c>user.isContact</c>; MTProto la publica como <c>User.Flags.contact</c>, medida en 4.4.10 con valor 2048, y
    /// <c>mutual_contact</c> (4096) es otra cosa —que el otro también te tenga—, así que no entra en la cuenta.
    /// </summary>
    public static bool IsContact(User user) => (user.flags & User.Flags.contact) != 0;

    /// <summary>La bandera de bot con la que la segunda guarda niega, medida: <c>User.Flags.bot</c> vale 16384.</summary>
    public static bool IsBot(User user) => (user.flags & User.Flags.bot) != 0;

    /// <summary>La bandera de la propia cuenta (<c>User.Flags.self</c>, 1024), el tercer caso de la misma guarda.</summary>
    public static bool IsSelf(User user, long owner) =>
        (user.flags & User.Flags.self) != 0 || user.id == owner;

    /// <summary>
    /// El primer nombre que se escribe: <c>user.firstName==null||isBlank()?"Contacto":limit(firstName,64)</c>. El
    /// relleno y el recorte son los que ya están en <see cref="DesktopContact"/>, y aquí no se repiten.
    /// </summary>
    public static string First(User user) => string.IsNullOrWhiteSpace(user.first_name)
        ? DesktopContact.FallbackFirst
        : DesktopContact.Limit(user.first_name, DesktopContact.MaxName);

    /// <summary>
    /// El segundo nombre: <c>limit(lastName==null?"":lastName,64)</c>. Sin relleno ninguno, porque Android tampoco
    /// se lo inventa y un apellido vacío es una tarjeta perfectamente válida.
    /// </summary>
    public static string Last(User user) => DesktopContact.Limit(user.last_name ?? "", DesktopContact.MaxName);

    /// <summary>
    /// El nombre que se lee en el cuadro, que no es el que se escribe. Java pone <c>chat.title</c> cuando el nombre
    /// nombre de pila no está; el título de la conversación privada en Windows lo arma <c>ChatEntry.Title</c> con
    /// <c>FullName</c>, y es el mismo dato por otro camino. No se recorta: el cuadro habla de la persona, la tarjeta
    /// es lo que se ajusta a 64.
    /// </summary>
    public static string DialogName(User user, string title) =>
        string.IsNullOrEmpty(user.first_name) ? title : user.first_name;
}
