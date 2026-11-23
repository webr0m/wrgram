namespace WRGram.Desktop;

using System.Linq;
using TL;

/// <summary>
/// Reglas de «compartir un contacto» en Windows. Android arma un <c>TdApi.Contact</c> y lo mete en
/// <c>InputMessageContact</c> (<c>NativeBridge.java:4725</c>); en MTProto el contacto viaja como adjunto —
/// <c>InputMediaContact</c> dentro de la misma <c>messages.sendMedia</c> que ya usa el archivo suelto—, así que el
/// puente no necesita el <c>access_hash</c> de la persona compartida: solo su número y sus dos nombres. Las cuatro
/// frases que se ven cuando algo falla son literales copiados carácter a carácter de <c>shareContact</c> y de
/// <c>contacts</c> (<c>NativeBridge.java:1787</c>), y una prueba las cruza capa por capa.
/// <para>
/// Lo que MTProto **no** da es el identificador de la persona dentro del contacto: <c>InputMediaContact</c> en
/// WTelegramClient 4.4.10 tiene <c>phone_number</c>, <c>first_name</c>, <c>last_name</c> y <c>vcard</c>, y el
/// <c>user_id</c> que Android rellena con <c>user.id</c> desapareció del esquema. La consecuencia es lectura, no
/// escritura: cuando esta cuenta recibe una tarjeta de contacto, <c>MessageMediaContact</c> sí publica
/// <c>user_id</c>, y es por eso que el botón «Abrir chat» puede existir en las dos capas.
/// </para>
/// <para>
/// El derecho también cambia de nombre entre protocolos. TDLib agrupa la tarjeta de contacto en
/// <c>canSendOtherMessages</c>; MTProto no tiene ese bit, pero su <c>ChatBannedRights.send_docs</c> ata exactamente
/// lo que el contacto es —un documento con atributo de contacto—, así que es el que se mira. Es una traducción, y
/// está escrita como tal: si Telegram algún día separa el contacto de los documentos, aquí hará falta otra línea.
/// </para>
/// </summary>
public static class DesktopContact
{
    /// Literal de <c>session.canSend()</c> en <c>shareContact</c> (<c>NativeBridge.java:4721-4722</c>). Es la misma frase
    /// que la encuesta ya decía para el mismo comprobante de Android, así que se referencia y no se copia: si
    /// cambia, cambia en las dos capas a la vez.
    public const string CannotSend = DesktopPoll.Sending;

    /// Literal de <c>chat.permissions.canSendOtherMessages</c> (<c>NativeBridge.java:4724</c>).
    public const string NotAllowed = "Este chat no permite compartir contactos.";

    /// Literal del <c>a.fail</c> cuando <c>user.phoneNumber</c> sale vacío
    /// (<c>NativeBridge.java:4725</c>). Es la única de las cuatro que no es un permiso: es la privacidad de Telegram
    /// diciendo que el número no está expuesto, y no hay forma de rodearla.
    public const string NoPhone =
        "Telegram no comparte el número de teléfono de este usuario. Solo puedes compartir contactos cuyo número ya está visible.";

    /// Literal del <c>answer.fail</c> de <c>contacts</c> (<c>NativeBridge.java:1787</c>), la lista y la búsqueda.
    public const string Prepare = "No se pudieron preparar los contactos.";

    /// Lo que <c>BridgePolicy.text(params,"query",80)</c> lanza cuando el texto no cabe: «Invalid text» en inglés.
    /// Aquí se dice en español, que es la divergencia ya escrita en la ronda AN para la pregunta de la encuesta.
    public const string LongQuery = "La búsqueda de contactos admite hasta 80 caracteres.";

    /// Respaldo literal del campo <c>name</c> en el DTO de Android: <c>name.isEmpty()?"Usuario":name</c>. Es otra
    /// frase que el nombre del puente (<c>FullName</c>, que cae en «Usuario &lt;id&gt;»), y se mantiene separada a
    /// propósito: aquí lo que se copia es la tabla que la pantalla consume.
    public const string NoName = "Usuario";

    /// Relleno de <c>first</c> cuando la persona no tiene ni nombre ni apellidos
    /// (<c>if(first.isEmpty()&&last.isEmpty())first="Contacto"</c>). Sin él, Telegram recibiría una tarjeta sin
    /// ningún nombre legible.
    public const string FallbackFirst = "Contacto";

    /// El <c>vcard</c> de Android es una cadena vacía (<c>new TdApi.Contact(phone, ..., "", user.id)</c>) y el campo
    /// sigue existiendo en MTProto: se manda vacío por el mismo motivo, porque la tarjeta no lleva libreta.
    public const string Vcard = "";

    /// <c>NativeSnapshot.limit(first,64)</c> y <c>limit(last,64)</c>: el recorte con el que se escribe la tarjeta.
    public const int MaxName = 64;

    /// <c>BridgePolicy.text(p,"query",80)</c> en <c>contacts.search</c>: se niega por encima, no se recorta.
    public const int MaxQuery = 80;

    /// Divergencia de protocolo, no hueco de este cable: TDLib puede pedir cualquier usuario por su id
    /// (<c>TdApi.GetUser</c>), y MTProto necesita el <c>access_hash</c>, que solo viaja en la respuesta de
    /// <c>contacts.getContacts</c> o <c>contacts.search</c>. Si la lista ya no está en la caché de la sesión, no hay
    /// a quién preguntar el número, y abrir la agenda de nuevo es la única salida real.
    public const string NotListed =
        "Ese contacto ya no está en la lista que Telegram acaba de dar. Vuelve a abrirla e inténtalo.";

    /// <c>new TdApi.SearchContacts(query,50)</c>: el tope de resultados de la búsqueda.
    public const int MaxResults = 50;

    /// Copia de <c>NativeSnapshot.limit</c> (<c>NativeSnapshot.java:552</c>) incluido el punto suspensivo:
    /// <c>text.length()>size ? text.substring(0,size)+"…" : text</c>. No es el <c>Clip</c> del host, que corta sin
    /// nada; usar el equivocado cambiaría el nombre que la otra persona lee.
    public static string Limit(string value, int maximum) => value.Length > maximum ? value[..maximum] + "…" : value;

    /// El número que se comparte: el de <c>user.phoneNumber</c> recortado, la misma variable que Android mira antes
    /// de decidir si la tarjeta es posible.
    public static string Phone(User user) => (user.phone ?? "").Trim();

    /// Si el número está expuesto. <c>has_phone</c> es la bandera del esquema y el recorte es la regla de Android:
    /// un espacio también cuenta como «no lo tiene».
    public static bool HasPhone(User user) =>
        (user.flags & User.Flags.has_phone) != 0 && Phone(user).Length > 0;

    /// Nombre para la lista, con la regla de Android: primera + segunda unidas y recortadas; si sale vacío,
    /// <see cref="NoName"/> —no el «Usuario &lt;id&gt;» del puente, que es de otra capa.
    public static string DisplayName(User user)
    {
        var name = string.Join(" ", new[] { user.first_name, user.last_name }
            .Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        return name.Length == 0 ? NoName : name;
    }

    /// Nombre público de la lista. TDLib da <c>usernames.activeUsernames[0]</c>; el esquema de MTProto ya tiene
    /// <c>MainUsername</c>, que es lo mismo dicho por la librería, y va vacío cuando no hay ninguno.
    public static string Username(User user) => user.MainUsername ?? "";

    /// La marca de bot del DTO (<c>user.type instanceof TdApi.UserTypeBot</c>). La pantalla filtra con ella, así que
    /// tiene que viajar aunque esta capa no la use para negar nada.
    public static bool IsBot(User user) => (user.flags & User.Flags.bot) != 0;

    /// Los dos campos con los que Telegram monta la tarjeta, con el relleno de Android cuando no hay ningún nombre.
    /// Se recortan con <see cref="Limit"/>, que es lo que hace <c>NativeSnapshot.limit(first,64)</c>.
    public static (string First, string Last) Parts(User user)
    {
        var first = user.first_name ?? "";
        var last = user.last_name ?? "";
        if (first.Length == 0 && last.Length == 0) first = FallbackFirst;
        return (Limit(first, MaxName), Limit(last, MaxName));
    }

    /// El nombre que se lee en la tarjeta <b>recibida</b>: los dos campos unidos, y el mismo relleno cuando no hay
    /// ninguno. Es <c>MessageExtras.contactName</c> (<c>MessageExtras.java:137</c>), y aquí no hay recorte de 64:
    /// lo que Telegram ya escribió en el mensaje no se puede acortar en la pantalla sin decirlo.
    public static string CardName(string first, string last)
    {
        var name = string.Join(" ", new[] { first, last }
            .Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        return name.Length == 0 ? FallbackFirst : name;
    }

    /// La búsqueda de MTProto devuelve dos listas de pares —<c>my_results</c>, contactos propios, y <c>results</c>,
    /// otros hallados— y la de Android es una sola de identificadores. Se recorren en ese orden, se quedan solo con
    /// los usuarios y se deduplica: la pantalla monta cada fila con el id como clave de React, y un id repetido dos
    /// veces en la misma lista sería una alerta de claves duplicadas encima de un resultado correcto.
    public static long[] UserIds(Peer[]? mine, Peer[]? others)
    {
        var seen = new HashSet<long>();
        var ids = new List<long>();
        foreach (var peer in (mine ?? new Peer[0]).Concat(others ?? new Peer[0]))
            if (peer is PeerUser user && seen.Add(user.user_id)) ids.Add(user.user_id);
        return ids.ToArray();
    }

    /// El derecho del que depende la tarjeta. TDLib lo llama <c>canSendOtherMessages</c> y MTProto no tiene ese bit;
    /// <c>send_docs</c> es el que ata lo que un contacto es —un documento con atributo de contacto—. La lectura de
    /// los tres campos y el orden de prioridad son los de <see cref="DesktopPoll.Free"/>, sin copia.
    public static bool CanShare(DesktopPoll.Rights rights) =>
        DesktopPoll.Free(rights, ChatBannedRights.Flags.send_docs);
}
