namespace WRGram.Desktop;

using System.Text.Json;
using TL;

/// <summary>
/// El cable de la agenda escribiente en Windows: <c>contacts.add</c> y <c>contacts.remove</c>, que Android atiende
/// las dos en <c>contactAction</c> (<c>NativeBridge.java:1860</c>) desde un mismo <c>case</c> del despacho
/// (<c>:563</c>). Las claves estaban en la lista del puente (<c>BridgePolicy.java</c>) y la pantalla las pide desde
/// la ficha de la persona (<c>PeerProfile.tsx:97</c> a través de <c>App.tsx:760</c>); en Windows caían en el
/// <c>_ =&gt; throw</c> genérico de <c>TelegramService.cs:508</c>, así que el botón de «Añadir a contactos» existía y
/// devolvía la frase del beta. Las reglas, las frases y su orden están en <see cref="DesktopContactWrite"/>; aquí
/// está el hilo.
/// <para>
/// Los dos caminos salen del mismo principio dicho por la ronda BI con los bloqueos: la lectura de la marca de
/// contacto es la caché que las propias respuestas de Telegram van llenando, y la escritura necesita el
/// <c>access_hash</c> que esa caché guarda. De ahí el orden de las guardas, que no es capricho: forma del chat,
/// persona conocida, bot, cuenta propia, estado ya pedido y hash —y solo entonces— el cuadro. Un cuadro de confirmar
/// que no se puede cumplir es peor que un aviso, y por eso <see cref="DesktopContactWrite.NeedsHash"/> corta antes
/// de preguntar, igual que <c>DesktopBlocked.NeedsHash</c>.
/// </para>
/// <para>
/// Los dos «no hace nada» de Android se conservan tal cual: quitar a quien no está y añadir a quien ya está
/// responden <c>false</c> sin abrir ventana y sin tocar Telegram (<c>:1839</c>, los dos <c>answer.ok(false)</c>
/// delante del diálogo y del <c>perform</c>). La pantalla lo lee bien —<c>App.tsx:760</c> solo repinta la ficha si el
/// valor es <c>true</c>—, así que no hay frase que decir: no pasó nada y la persona no perdió ningún botón.
/// </para>
/// <para>
/// La cuenta propia se mira dos veces en el añadir, las dos con el <c>La cuenta cambió.</c> de Java: la primera es la
/// de <c>:1839</c> dentro del botón positivo, recién salida de la ventana modal, y es la que impide escribir sobre
/// una sesión que se cambió mientras la persona leía el cuadro. La segunda no la tiene Android porque su
/// <c>perform</c> ya nació con el <c>session</c> en la mano; aquí la petición es <c>await</c> y la sesión puede
/// moverse durante la espera, que es el mismo motivo por el que la ronda BI dejó una guarda después del
/// <c>contacts.unblockPeer</c>. Es una guarda de más, y está dicha aquí en vez de en el espejo de TypeScript: no hay
/// frase que la pantalla distinga, las dos devuelven la misma cadena.
/// </para>
/// <para>
/// Queda una cosa que Android hace y este cable no puede copiar: el <c>schedule()</c> de los dos <c>perform</c>. En
/// Windows no hay lazo de listas que empujar, así que se cambia la marca en los tres sitios donde esta capa la tiene
/// —el <c>TL.User</c> de la caché, la entrada de la conversación y la fila empujada— y el <c>Push()</c> que ya cierra
/// el despacho se encarga del resto. Es menos que volver a pedir la agenda, y es lo que la siguiente lectura de
/// Telegram va a confirmar.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>contacts.add</c> (<c>:1839</c>, el camino que va del <c>if (user.isContact)</c> hasta el
    /// <c>TdApi.AddContact</c>). Los dos nombres se arman antes de preguntar, porque el cuadro tiene que hablar de la
    /// persona con el mismo nombre que después se escribe en la tarjeta, y el <c>InputUser</c> se resuelve antes
    /// también: si Telegram no dio el hash, no hay escritura posible que prometer.
    /// </summary>
    private async Task<object?> AddContactAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var (entry, person) = ContactTarget(args, owner);
        if (DesktopContactWrite.IsContact(person)) return false;
        var first = DesktopContactWrite.First(person);
        var last = DesktopContactWrite.Last(person);
        var target = ContactInput(person);
        if (!ConfirmPhoto(DesktopContactWrite.DialogTitle,
                DesktopContactWrite.DialogBody(DesktopContactWrite.DialogName(person, entry.Title)),
                DesktopContactWrite.DialogAccept, null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopContactWrite.ChangedAccount);
        await client.Contacts_AddContact(target, first, last, DesktopContactWrite.NoPhone, null, false);
        if (client.User?.id != owner) throw new BridgeException(DesktopContactWrite.ChangedAccount);
        MarkContact(entry, person, true);
        return true;
    }

    /// <summary>
    /// <c>contacts.remove</c> (<c>:1839</c>): sin cuadro y sin guarda de cuenta, porque Android tampoco tiene ninguna
    /// de las dos —la orden ya viene decidida por el <c>confirm()</c> de la propia pantalla (<c>App.tsx:761</c>) y el
    /// <c>RemoveContacts</c> no espera a nadie—. Lo único que se añade es el identificador con hash que MTProto pide
    /// y TDLib resuelve solo.
    /// </summary>
    private async Task<object?> RemoveContactAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var (entry, person) = ContactTarget(args, owner);
        if (!DesktopContactWrite.IsContact(person)) return false;
        await client.Contacts_DeleteContacts(new InputUserBase[] { ContactInput(person) });
        MarkContact(entry, person, false);
        return true;
    }

    /// <summary>
    /// Las dos guardas de <c>:1839</c> sobre la entrada que la pantalla nombró: primero la forma del chat y después
    /// la persona. El <c>user==null</c> de Java es aquí la caché que no tiene al par, y cae en la misma frase que el
    /// bot y la cuenta propia porque Java los metió a los tres en una sola condición.
    /// </summary>
    private (ChatEntry Entry, User Person) ContactTarget(JsonElement args, long owner)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Peer is not PeerUser person) throw new BridgeException(DesktopContactWrite.NotPrivate);
        var user = _users.GetValueOrDefault(person.user_id);
        if (user == null || DesktopContactWrite.IsBot(user) || DesktopContactWrite.IsSelf(user, owner))
            throw new BridgeException(DesktopContactWrite.NotAddable);
        return (entry, user);
    }

    /// <summary>
    /// El <c>InputUserBase</c> que aceptan las dos peticiones. Cero no se manda nunca: un identificador sin hash es
    /// una respuesta de Telegram que ninguna pantalla sabe traducir, y la salida honesta es decirlo antes de escribir.
    /// </summary>
    private static InputUserBase ContactInput(User user) => user.access_hash == 0
        ? throw new BridgeException(DesktopContactWrite.NeedsHash)
        : new InputUser(user.id, user.access_hash);

    /// <summary>
    /// La marca de contacto, puesta en los tres sitios donde esta capa la tiene. Sin tocar el <c>TL.User</c> la
    /// entrada se reconstruiría con el valor viejo en cuanto la conversación saliera de la caché de chats, y la
    /// agenda volvería a listar a alguien que ya no está.
    /// </summary>
    private void MarkContact(ChatEntry entry, User person, bool value)
    {
        person.flags = value ? person.flags | User.Flags.contact : person.flags & ~User.Flags.contact;
        entry.IsContact = value;
        foreach (var chat in _state.Chats) if (chat.Id == entry.Id) chat.IsContact = value;
    }
}
