using System.Text.Json;
using TL;

namespace WRGram.Desktop;

/// <summary>
/// Reglas puras de la lista de remitentes bloqueados de esta cuenta. Son la traducción medida de
/// <c>BlockedSendersPolicy.java</c> y de los dos brazos que la usan en <c>NativeBridge.java</c>, y no saben nada
/// de red: el cable (<see cref="DesktopBlockedFlow"/>)) les lleva lo que Telegram contestó y se lleva lo que hay
/// que mandar.
/// <para>
/// <b>Qué hay al otro lado.</b> Android atiende <c>privacy.blocked</c> en <c>:540</c> → <c>blockedSenders</c>
/// (<c>:1507-1530</c>) y <c>privacy.unblock</c> en <c>:541</c> → <c>unblockSender</c> (<c>:1531-1542</c>), y las
/// dos órdenes están en la lista del puente desde hace rondas (<c>BridgePolicy.java:42</c>). La de desbloquear
/// además está en la de las que esperan a la persona (<c>bridge.ts:41</c>), y con razón: abre un cuadro nativo de
/// confirmar (<c>:1535-1541</c>) antes de escribir. La de leer no espera a nadie.
/// </para>
/// <para>
/// <b>Las dos bibliotecas bloquean cosas distintas, y esa diferencia es media ronda.</b> TDLib bloquea un
/// <c>MessageSender</c>: o una persona (<c>MessageSenderUser</c>) o un chat (<c>MessageSenderChat</c>), y desbloquear
/// es <c>SetMessageSenderBlockList(sender,null)</c> (<c>:1540</c>) —la lista se quita, no se manda nada a Telegram
/// por otro camino—. MTProto bloquea <b>pares</b> (<c>PeerUser</c>, <c>PeerChat</c>, <c>PeerChannel</c>) y desbloquear
/// es <c>contacts.unblockPeer</c> con un <c>InputPeer</c>, medido por reflexión sobre WTelegramClient 4.4.10. De ahí
/// salen tres consecuencias que están todas en este archivo:
/// (a) los tres subtipos de <c>Peer</c> caben en los dos <c>kind</c> que la pantalla conoce —<c>user</c> y
/// <c>chat</c>—, así que <see cref="Kind"/> funde canal y grupo básico en <c>chat</c>, exactamente como
/// <c>BlockedSendersPolicy.kind</c> (<c>:26-30</c>) funda en una sola palabra lo que TDLib también tiene en dos;
/// (b) el número suelto no basta, porque un <c>chat_id</c> de grupo básico y un <c>channel_id</c> viven en
/// namespaces distintos y pueden coincidir: <c>PeerChat(5)</c> y <c>PeerChannel(5)</c> son dos personas diferentes y
/// la pantalla no tiene ninguna campo para decir cuál de los dos es. Por eso el cable relee la lista y busca el
/// <c>TL.Peer</c> de verdad en lugar de reconstruirlo desde el número que la pantalla devuelve;
/// (c) <c>PeerBlocked.peer_id</c> no trae <c>access_hash</c> —medido: la clase son dos campos, <c>peer_id</c> y
/// <c>date</c>— y <c>contacts.unblockPeer</c> lo exige, salvo en el grupo básico, que es el único
/// <c>InputPeerChat(chat_id)</c> sin hash. El hash sí llega, pero en otro sitio: <c>Contacts_Blocked</c> trae además
/// <c>users</c> y <c>chats</c> (medido: dos <c>Dictionary&lt;long,…&gt;</c> junto al <c>blocked</c>), así que la
/// respuesta que nombra al remitente es la misma que lo describe y el cable la aprovecha. <see cref="NeedsHash"/> es
/// para cuando ese dictcionario no está o su hash vale cero, y es la misma asimetría que la ronda BH midió para las
/// excepciones de privacidad.
/// </para>
/// <para>
/// <b>El total solo viene en la página corta.</b> Medido: <c>Contacts_Blocked</c> trae
/// <c>blocked</c>, <c>chats</c> y <c>users</c>, y su subclase <c>Contacts_BlockedSlice</c> añade <c>count</c>. O sea
/// que el total que la pantalla pinta (<c>BlockedSettings.tsx:69</c>, «N bloqueados en Telegram · M cargados») no
/// siempre viene: con <c>limit</c> pedido Telegram puede contestar la plana sin cifra. <see cref="Total"/> lo resuelve
/// como lo resuelve el puente cuando la cifra no está —los propios <c>blocked.Length</c>—, y <see cref="HasMore"/> es
/// la fórmula de <c>:1528</c> carácter a carácter, no una aproximación.
/// </para>
/// <para>
/// <b>Lo que la pantalla no ofrece no se toca.</b> <c>:1510</c> pide <c>BlockListMain</c>, la lista principal. TDLib
/// tiene además <c>BlockListStories</c>, y MTProto lo dice con la bandera <c>my_stories_from</c> de las tres llamadas
/// medidas (<c>Contacts_GetBlocked</c>, <c>Contacts_Block</c> y <c>Contacts_Unblock</c>, las tres con esa bandera en
/// su firma). Ninguna pantalla de WRGram ofrece la lista de historias, así que el cable manda <c>false</c> siempre
/// y la otra lista no se lee ni se escribe. El <b>bloqueo</b>, en cambio, sí vive aquí aunque la orden sea de otra
/// puerta: Android lo atiende desde la ficha de la persona (<c>profile.block</c>, <c>:527</c> → <c>:1280</c>) y la
/// pantalla lo pide con su propio cuadro de confirmar dentro de la interfaz (<c>App.tsx:744-747</c>), por eso
/// <c>profile.block</c> no está en las órdenes que esperan a un diálogo nativo (<c>bridge.ts</c>) y por eso el cable
/// de Windows no abre ventana ninguna: confirma la pantalla, escribe el host.
/// </para>
/// <para>
/// <b>Tres techos, y uno es una resta.</b> <c>PAGE_SIZE</c> 50 (<c>BlockedSendersPolicy.java:7</c>); el marcador
/// tiene que caber entre 0 y <c>int.MaxValue - 50</c> (<c>:14</c>), que no es un tope redondo sino el sitio donde
/// <c>offset+count</c> de <c>:1528</c> dejaría de caber en un <c>int</c> —de ahí que la guarda se escribiera como
/// resta y no como un número mayor—; y el nombre se recorta a 120 (<c>:1517</c> y <c>:1534</c>, las dos con el mismo
/// <c>NativeSnapshot.limit(…,120)</c>), que es más ancho que los 80 de las listas de comunidad porque aquí la fila
/// entera es el nombre.
/// </para>
/// </summary>
public static class DesktopBlocked
{
    /// <summary>El <c>PAGE_SIZE</c> de <c>BlockedSendersPolicy.java:7</c>, y el divisor de <see cref="MaxOffset"/>.</summary>
    public const int PageSize = 50;

    /// La cota alta de <c>BlockedSendersPolicy.java:14</c>, escrita como resta porque eso es lo que es en Java.
    public const int MaxOffset = int.MaxValue - PageSize;

    /// El recorte de <c>:1517</c> (la fila) y de <c>:1534</c> (el cuadro de confirmar): el mismo número en las dos.
    public const int NameShown = 120;

    /// Las dos palabras que la pantalla sabe leer, son las de <c>BlockedSendersPolicy.kind</c> (<c>:27-28</c>).
    public const string UserKind = "user";
    public const string ChatKind = "chat";

    /// <summary>
    /// El <c>"Paginación no válida."</c> de <c>BlockedSendersPolicy.java:12</c> y <c>:14</c>, dicho en los dos
    /// casos que Java dice igual: que el <c>offset</c> no sea un número y que se salga de su hueco.
    /// </summary>
    public const string BadOffset = "Paginación no válida.";

    /// <summary>
    /// El <c>"Remitente no válido."</c> de <c>BlockedSendersPolicy.java:23</c>: el <c>kind</c> no es de los dos, el
    /// id no es un identificador, una persona es cero o es uno mismo, o un chat es cero.
    /// </summary>
    public const string BadSender = "Remitente no válido.";

    /// <summary>
    /// El <c>"Remitente no compatible."</c> de <c>:29</c> y <c>:35</c>, que en Java solo puede salir de un
    /// <c>MessageSender</c> desconocido y aquí de un cuarto subtipo de <c>Peer</c> que el esquema no tenía cuando se
    /// midió. Allá la frase no llega a la pantalla: el <c>catch</c> de <c>NativeBridge.java:1526</c> la dobla en
    /// <see cref="ListFailed"/>; acá se deja la original, porque un tipo que ninguna de las dos capas sabe nombrar no
    /// es la misma noticia que un par que la respuesta no trae, y la diferencia se puede arreglar.
    /// </summary>
    public const string IncompatiblePeer = "Remitente no compatible.";

    /// <summary>
    /// El <c>"No se pudo preparar la lista de bloqueados."</c> de <c>:1526</c>. Allá lo dispara un <c>catch</c> sobre
    /// cada fila; acá lo dispara una fila que no se puede armar porque el par contestado no está en los diccionarios
    /// de la misma respuesta. Es el mismo aviso y el mismo momento, y por eso se reutiliza la cadena en lugar de
    /// escribir una parecida.
    /// </summary>
    public const string ListFailed = "No se pudo preparar la lista de bloqueados.";

    /// <summary>El <c>"La cuenta cambió. No se modificó el bloqueo."</c> de <c>:1539</c>, carácter a carácter.</summary>
    public const string ChangedAccount = "La cuenta cambió. No se modificó el bloqueo.";

    /// <summary>
    /// Negación que en Android no existe: su <c>SetMessageSenderBlockList</c> recibe el remitente tal cual y Telegram
    /// le responde; aquí hace falta encontrar el par dentro de la lista para saber qué <c>InputPeer</c> mandar, y si
    /// la lista ya no lo tiene no hay escritura posible. La frase sigue el consejo de <c>CursorGone</c> de la ronda
    /// BG (<c>DesktopJoinRequests.cs:81</c>): volver a abrir.
    /// </summary>
    public const string NotInList = "Ese remitente ya no está en la lista de bloqueados. Vuelve a abrirla antes de repetirlo.";

    /// <summary>
    /// La otra negación propia de Windows, y la tercera vez que aparece en la casa: <c>contacts.unblockPeer</c> pide
    /// <c>InputPeerUser</c> o <c>InputPeerChannel</c> con su hash, y ese hash solo está en los diccionarios
    /// <c>users</c>/<c>chats</c> de la respuesta. Si la lista ya no trae al remitente, o lo trae y su <c>User</c> o su
    /// <c>Channel</c> vienen con <c>access_hash</c> cero, no hay escritura posible. Cero no se manda: un identificador
    /// sin hash es una respuesta de Telegram que ninguna pantalla sabe traducir.
    /// </summary>
    public const string NeedsHash = "Telegram no dio los datos necesarios para desbloquear a este remitente. Vuelve a abrir la lista de bloqueados e inténtalo de nuevo.";

    /// <summary>
    /// La misma falta de hash dicha desde la otra puerta, con su consejo propio: la ficha de la persona no se abre
    /// releyendo una lista, se abre desde la conversación. El molde es el de <c>DesktopPeerProfile.NoHash</c>, que la
    /// ronda BA escribió para exactamente esta situación con otras dos palabras en el medio.
    /// </summary>
    public const string NoProfileHash = "Telegram no dio los datos necesarios para cambiar el bloqueo de esta persona. Vuelve a abrir su ficha desde la conversación e inténtalo de nuevo.";

    /// <summary>
    /// Las dos negaciones de <c>profileBlock</c> (<c>NativeBridge.java:1282-1285</c>), que son las que ponen el
    /// «Bloquear» de la ficha de la persona también en Windows. Allá son <c>IllegalArgumentException</c> con su
    /// cadena en español y viajan tal cual hasta la pantalla, así que se copian literales: la primera niega el
    /// bloqueo de una comunidad (<c>chat.type instanceof TdApi.ChatTypePrivate</c>, <c>:1282</c>) y la segunda el de
    /// la propia cuenta (<c>userId==session.selfId</c>, <c>:1284</c>). En Windows la primera es un <c>Peer</c> que no
    /// es <c>PeerUser</c> y la segunda se mira contra la cuenta conectada, que es el <c>selfId</c> de allá.
    /// </summary>
    public const string NotPrivate = "Esta acción solo está disponible para usuarios y bots.";
    public const string SelfBlock = "Esta es tu propia cuenta.";

    /// <summary>
    /// El <c>params.getBoolean("value")</c> de <c>:1285</c>. Allá la ausencia lanza un <c>JSONException</c> que sube
    /// al <c>catch</c> general de <c>NativeBridge.java:154</c> y la pantalla lee la frase genérica de siempre; aquí el
    /// motivo se dice en concreto desde la ronda AT, y es el mismo criterio con el que la ronda BF negó la
    /// aprobación que no venía (<c>DesktopJoinRequests.MissingApprove</c>).
    /// </summary>
    public static bool BlockValue(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("value", out var value))
            throw new BridgeException("Falta el valor de bloqueo. Vuelve a intentarlo desde la ficha de la persona.");
        if (value.ValueKind == JsonValueKind.True) return true;
        if (value.ValueKind == JsonValueKind.False) return false;
        throw new BridgeException("El valor de bloqueo no es verdadero ni falso.");
    }

    /// <summary>El título de <c>:1535</c>, <c>"Desbloquear a "+name</c>.</summary>
    public static string Title(string name) => "Desbloquear a " + name;

    /// <summary>
    /// El cuerpo de <c>:1536</c>, literal. Dice lo que no pasa —no se envía ningún mensaje ni se añade a contactos—,
    /// que es la parte que la persona no puede deducir del botón.
    /// </summary>
    public const string Body =
        "Se quitará el bloqueo de esta cuenta de Telegram. Podrá volver a contactarte según tus ajustes de privacidad. No se envía ningún mensaje ni se añade a contactos.";

    /// <summary>El botón de <c>:1538</c>.</summary>
    public const string Accept = "Desbloquear";

    /// <summary>
    /// El marcador de <c>BlockedSendersPolicy.offset</c> (<c>:9-16</c>) en las tres capas de decisión: ausencia vale
    /// cero, lo que no es número se niega, y lo que se sale del hueco se niega igual. La pantalla manda siempre un
    /// número entero (<c>BlockedSettings.tsx:25</c> y <c>:79</c>), así que las dos negaciones son para lo que no sea
    /// la pantalla.
    /// </summary>
    public static int Offset(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("offset", out var node)
            || node.ValueKind == JsonValueKind.Null) return 0;
        if (node.ValueKind != JsonValueKind.Number || !node.TryGetInt64(out var raw)) throw new BridgeException(BadOffset);
        if (raw < 0 || raw > MaxOffset) throw new BridgeException(BadOffset);
        return (int)raw;
    }

    /// El <c>kind</c> de <c>BlockedSendersPolicy.kind</c> (<c>:26-30</c>): tres subtipos de par, dos palabras.
    public static string Kind(Peer peer) => peer switch
    {
        PeerUser => UserKind,
        PeerChat or PeerChannel => ChatKind,
        _ => throw new BridgeException(IncompatiblePeer)
    };

    /// El <c>id</c> de <c>BlockedSendersPolicy.id</c> (<c>:32-36</c>), ya en texto porque el DTO lo quiere en texto.
    public static string Id(Peer peer) => peer switch
    {
        PeerUser user => user.user_id.ToString(System.Globalization.CultureInfo.InvariantCulture),
        PeerChat chat => chat.chat_id.ToString(System.Globalization.CultureInfo.InvariantCulture),
        PeerChannel channel => channel.channel_id.ToString(System.Globalization.CultureInfo.InvariantCulture),
        _ => throw new BridgeException(IncompatiblePeer)
    };

    /// <summary>
    /// Las cuatro claves de la fila de <c>:1517-1524</c>, en el orden en que el puente las escribe: <c>kind</c>,
    /// <c>id</c>, <c>name</c> y <c>photo</c> solo cuando la hay, que es lo que <c>item.put("photo",photo)</c> hace
    /// bajo su <c>if (photo!=null)</c>. El nombre ya llega recortado por el cable, con <see cref="NameShown"/>.
    /// </summary>
    public static object Row(Peer peer, string name, MediaDto? photo)
    {
        var row = new Dictionary<string, object> { ["kind"] = Kind(peer), ["id"] = Id(peer), ["name"] = name };
        if (photo != null) row["photo"] = photo;
        return row;
    }

    /// <summary>
    /// El total de <c>:1528</c> es <c>result.totalCount</c>, y TDLib siempre lo tiene. MTProto no: la cifra vive
    /// solo en <c>Contacts_BlockedSlice</c> (medido: <c>count</c> es de la subclase). Cuando la respuesta llega plana,
    /// el total de la página es lo que hay, que es la única afirmación honesta posible sin inventar un viaje más.
    /// </summary>
    public static int Total(Contacts_Blocked answer, int rows) => answer is Contacts_BlockedSlice slice ? slice.count : rows;

    /// <summary>La fórmula de <c>:1528</c>, sin tocar: <c>count&gt;0 &amp;&amp; (count&gt;=PAGE_SIZE || offset+count&lt;total)</c>.</summary>
    public static bool HasMore(int rows, int offset, int total) =>
        rows > 0 && (rows >= PageSize || offset + rows < total);

    /// <summary>
    /// La página de <c>:1528</c> con sus cuatro claves y en su orden: <c>items</c>, <c>total</c>, <c>nextOffset</c>
    /// (<c>offset+count</c>, no el tamaño de la lista mergeada que la pantalla arma por su cuenta) y <c>hasMore</c>.
    /// </summary>
    public static object Page(List<object> items, int offset, int total) => new
    {
        items,
        total,
        nextOffset = offset + items.Count,
        hasMore = HasMore(items.Count, offset, total)
    };

    /// <summary>
    /// El <c>sender</c> de <c>BlockedSendersPolicy</c> (<c>:18-24</c>): primero el identificador por la regla de
    /// <c>BridgePolicy.id</c> (<c>:53</c>, cadena con forma de entero largo), luego el <c>kind</c>, y las dos
    /// guardas de cada tipo —persona: mayor que cero y distinta de uno mismo; chat: distinto de cero—. Aquí la orden
    /// ya está cortada antes de leer nada, así que el <c>selfId</c> lo presta el cable, que es quien lo tiene.
    /// </summary>
    public static (string Kind, long Id) Requested(JsonElement args, long selfId)
    {
        var id = RequestedId(args);
        var kind = Str(args, "kind");
        if (kind == UserKind && id > 0 && id != selfId) return (UserKind, id);
        if (kind == ChatKind && id != 0) return (ChatKind, id);
        throw new BridgeException(BadSender);
    }

    private const string Identifier = @"^-?(0|[1-9][0-9]{0,18})$";

    /// El <c>BridgePolicy.id(params,"id")</c> de <c>:19</c> contra la litera de <c>BridgePolicy.java:53</c>:
    /// tiene que llegar como cadena y con forma de entero largo, y un número sin comas se niega igual que allí.
    private static long RequestedId(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("id", out var node)
            || node.ValueKind != JsonValueKind.String) throw new BridgeException(BadSender);
        var text = node.GetString()!;
        if (!System.Text.RegularExpressions.Regex.IsMatch(text, Identifier)) throw new BridgeException(BadSender);
        return long.Parse(text, System.Globalization.NumberStyles.AllowLeadingSign, System.Globalization.CultureInfo.InvariantCulture);
    }

    private static string? Str(JsonElement args, string name) =>
        args.ValueKind == JsonValueKind.Object && args.TryGetProperty(name, out var node) && node.ValueKind == JsonValueKind.String
            ? node.GetString()
            : null;
}
