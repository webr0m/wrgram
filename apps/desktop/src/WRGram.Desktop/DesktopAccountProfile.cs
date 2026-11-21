namespace WRGram.Desktop;

using System;
using System.Linq;
using System.Text.RegularExpressions;

/// <summary>
/// Reglas del perfil de la propia cuenta en Windows. Son las cuatro órdenes que Android atiende desde hace rondas
/// —<c>account.profile</c>, <c>account.name</c>, <c>account.bio</c> y <c>account.username</c>
/// (<c>NativeBridge.java:534</c> y <c>:548-550</c>)— y que aquí caían en el <c>_ =&gt; throw</c> genérico: la
/// pantalla de «Mi perfil de Telegram» existía, pero en el menú de escritorio ni se llegaba a ella, porque su
/// entrada estaba en la rama móvil de <c>UserMenu.tsx</c>.
/// <para>
/// Las dos frases que el puente de Android dice en español están copiadas carácter a carácter
/// (<see cref="NoName"/> y <see cref="BadUsername"/>). Las otras dos condiciones que Android comunica en inglés
/// —el <c>Invalid text</c> de <c>BridgePolicy.text</c> (<c>BridgePolicy.java:59</c>)— se dicen aquí en español por
/// la misma razón por la que las dijeron la ronda T con los filtros guardados y la AH con la encuesta: una cadena
/// técnica en inglés no le dice a nadie qué arreglar. Se desglosa en las dos causas de verdad, que en Android son
/// una sola palabra: <see cref="Missing"/> cuando la clave no viene o no es una cadena, y el tope de
/// <see cref="TooLong"/> cuando sí lo es pero se pasa.
/// </para>
/// <para>
/// El orden es el de Android, y no es cosmético: <c>BridgePolicy.text</c> mide la cadena <b>sin recortar</c> y el
/// <c>trim()</c> llega después, en la misma línea del <c>case</c>. Un nombre de 65 caracteres con un espacio
/// sobrante es demasiado largo en las dos capas, y «<c> ana </c>» es <c>ana</c> en las dos.
/// </para>
/// <para>
/// La parte que no se parece en nada es la escritura. TDLib tiene una petición por campo (<c>SetName</c>,
/// <c>SetBio</c>, <c>SetUsername</c>); MTProto reparte lo mismo en <c>account.updateProfile</c>, que es
/// <b>una</b> petición con tres huecos opcionales, y en <c>account.updateUsername</c>. Los huecos opcionales se
/// eligen con <c>null</c>, no con cadena vacía: la librería arma la marca de bits comprobando si el argumento es
/// <c>null</c>, así que <c>about: null</c> significa «la biografía no se toca» y <c>about: ""</c> significa
/// «deja la biografía vacía». De ahí que los brazos manden siempre la cadena normalizada y jamás un <c>null</c>
/// donde el puente promete escribir: <c>account.name</c> con el apellido borrado tiene que borrar el apellido, y
/// con <c>null</c> el servidor lo conservaría mientras la pantalla ya lo enseña vacío.
/// </para>
/// <para>
/// Lo que MTProto no tiene tampoco se finge. <c>UserFull</c> publica <c>about</c> como cadena sola, sin la lista
/// de entidades que TDLib sí da, así que la biografía propia llega en Windows como texto plano. Los datos de
/// empresa (<c>business</c>) viven en otros campos y no se traducen en esta ronda: el panel simplemente no se
/// pinta. La foto —<c>account.photo.pick</c> y <c>account.photo.delete</c>— se conectó después, en la ronda AU,
/// con sus propias reglas en <see cref="DesktopProfilePhoto"/>. Las sesiones (<c>account.sessions</c> y
/// <c>account.session.revoke</c>) llegaron en la ronda AV, con las suyas en <see cref="DesktopSessions"/>: con las
/// tres ramas ya escritas, el menú de escritorio no deja ningún botón que caiga en «No disponible en escritorio
/// (beta)», que era la norma que fijó la ronda AK.
/// </para>
/// </summary>
public static class DesktopAccountProfile
{
    /// Literal de <c>account.name</c> (<c>NativeBridge.java:548</c>) cuando el nombre queda vacío tras recortarlo.
    public const string NoName = "El nombre no puede quedar vacío.";

    /// Literal de <c>account.username</c> (<c>NativeBridge.java:550</c>) para un nombre público que no es válido.
    public const string BadUsername = "El nombre público debe tener de 5 a 32 caracteres y empezar con una letra.";

    /// La otra cara del <c>Invalid text</c> de <c>BridgePolicy.text</c> (<c>BridgePolicy.java:59</c>): la clave que
    /// no viene o que no es una cadena. En Android las dos causas comparten palabra; aquí se separan porque una
    /// llamada sin el campo no es texto largo, es una pantalla que no mandó nada, y sin esta guarda
    /// <c>account.username</c> sin parámetro borraría el nombre público de la cuenta.
    public const string Missing = "Falta el texto que hay que guardar en Telegram.";

    /// <c>account.profile</c> no puede pintarse con mitades: si <c>users.getFullUser</c> no devuelve el
    /// <c>full_user</c> no hay biografía que leer, y responder con la bio vacía sería enseñar un perfil sin bio.
    public const string NotRead = "Telegram no devolvió los datos de tu perfil.";

    /// <c>BridgePolicy.text(p,"firstName",64)</c> y <c>("lastName",64)</c> en <c>account.name</c>.
    public const int MaxName = 64;

    /// <c>BridgePolicy.text(p,"bio",140)</c> en <c>account.bio</c>.
    public const int MaxBio = 140;

    /// <c>BridgePolicy.text(p,"username",32)</c> en <c>account.username</c>.
    public const int MaxUsername = 32;

    /// La misma expresión de <c>account.username</c> (<c>NativeBridge.java:550</c>) con <c>matches</c> de Java.
    /// Java ancla los dos extremos él solo; en .NET <c>$</c> además deja pasar un salto de línea final, así que se
    /// escriben <c>\A</c> y <c>\z</c> para que las tres capas rechacen exactamente lo mismo.
    public const string UsernamePattern = @"\A[A-Za-z][A-Za-z0-9_]{4,31}\z";

    /// El tope dicho en español, con la frase que ya usan los mensajes y los pies editados: una sola norma de
    /// «esto no cabe» para todo el puente, en vez de una por pantalla.
    public static string TooLong(int maximum) => DesktopMessageEdit.TooLong(maximum);

    /// Nombre: la guarda de formato, el tope y el vacío, en el orden del <c>case</c> de Android.
    public static string? NameProblem(string? first, string? last)
    {
        if (first is null || last is null) return Missing;
        if (first.Length > MaxName || last.Length > MaxName) return TooLong(MaxName);
        return Trim(first).Length == 0 ? NoName : null;
    }

    /// Biografía: formato y tope. Vacía sí es válido, y significa borrarla, igual que en <c>SetBio("")</c>.
    public static string? BioProblem(string? bio)
    {
        if (bio is null) return Missing;
        return bio.Length > MaxBio ? TooLong(MaxBio) : null;
    }

    /// Nombre público: formato, tope sobre la cadena sin recortar y el patrón solo cuando algo queda después de
    /// recortar. La cadena vacía es legítima: es la forma de quitar el nombre, y Android la deja pasar.
    public static string? UsernameProblem(string? username)
    {
        if (username is null) return Missing;
        if (username.Length > MaxUsername) return TooLong(MaxUsername);
        var value = Trim(username);
        return value.Length > 0 && !Regex.IsMatch(value, UsernamePattern) ? BadUsername : null;
    }

    public static string FirstName(string first) => Trim(first);

    public static string LastName(string last) => Trim(last);

    /// El <c>replace('\n',' ').trim()</c> de <c>account.bio</c> (<c>NativeBridge.java:549</c>): los saltos se
    /// vuelven espacios, no se quitan, para que «línea1\nlínea2» no salga pegado.
    public static string Bio(string bio) => bio.Replace('\n', ' ').Trim();

    public static string Username(string username) => Trim(username);

    /// <summary>
    /// El nombre público que se enseña: el primero marcado como activo, que es como <c>accountProfile</c> lo arma
    /// (<c>NativeBridge.java:1642</c>, <c>if(username.isEmpty())username=value</c> sobre <c>activeUsernames</c>).
    /// El campo suelto <c>username</c> que MTProto sigue trayendo por compatibilidad no se usa: en Android tampoco,
    /// y puede apuntar a un nombre ya apagado.
    /// </summary>
    public static string ShownUsername(TL.Username[]? usernames) => Active(usernames).FirstOrDefault() ?? "";

    /// La lista <c>usernames</c> del DTO de Android: todos los activos, en el orden en que Telegram los devolvió.
    public static string[] ActiveUsernames(TL.Username[]? usernames) => Active(usernames).ToArray();

    /// <c>editableUsername</c>: el primero que la cuenta puede cambiar por sí misma. TDLib lo da como campo suelto y
    /// MTProto como una marca más, así que se elige aquí con el mismo criterio que <see cref="ShownUsername"/>.
    public static string EditableUsername(TL.Username[]? usernames) => usernames is null ? "" :
        (usernames.FirstOrDefault(name => name != null && !string.IsNullOrEmpty(name.username) &&
            (name.flags & TL.Username.Flags.editable) != 0)?.username ?? "");

    private static System.Collections.Generic.IEnumerable<string> Active(TL.Username[]? usernames) =>
        usernames is null
            ? Array.Empty<string>()
            : usernames.Where(name => name != null && !string.IsNullOrEmpty(name.username) &&
                (name.flags & TL.Username.Flags.active) != 0).Select(name => name.username);

    /// El <c>photoId</c> del DTO: <c>"0"</c> cuando no hay foto, que es literal de
    /// <c>user.profilePhoto==null?"0":Long.toString(...)</c> (<c>NativeBridge.java:1643</c>) y lo que la pantalla
    /// usa para decidir si ofrece borrarla.
    public static string PhotoId(TL.UserProfilePhoto? photo) => photo is null ? "0" : photo.photo_id.ToString();

    /// <summary>
    /// El cumpleaños dicho con las tres claves de Android (<c>NativeBridge.java:1644</c>). Sin <c>birthday</c> en la
    /// respuesta no hay clave, y la pantalla escribe «Sin fecha configurada». El año es el único que en MTProto es
    /// opcional por marca: sin <c>has_year</c> sale cero, que es el valor con el que TDLib avisa de lo mismo y el
    /// que <c>birthdayLabel</c> (<c>UserMenu.tsx:28</c>) ya sabe callar.
    /// </summary>
    public static object? Birthday(TL.Birthday? birthday)
    {
        if (birthday is null) return null;
        var year = (birthday.flags & TL.Birthday.Flags.has_year) != 0 ? birthday.year : 0;
        return new { day = birthday.day, month = birthday.month, year };
    }

    /// <summary>
    /// Los cuatro rechazos que <c>account.updateUsername</c> puede devolver con nombre propio y este flujo puede
    /// provocar. El resto viaja tal cual lo dijo Telegram: inventar una causa para un código que no se ha medido
    /// es peor que enseñar el código.
    /// </summary>
    public static string? UsernameRefusal(string? error) => error switch
    {
        _ when Starts(error, "USERNAME_OCCUPIED") => "Ese nombre público ya lo tiene otra cuenta de Telegram.",
        _ when Starts(error, "USERNAME_INVALID") => "Telegram no acepta ese nombre público.",
        _ when Starts(error, "USERNAME_NOT_MODIFIED") => "La cuenta ya tiene ese nombre público.",
        _ when Starts(error, "USERNAME_MISSING") => "Tu cuenta no tiene ningún nombre público que quitar.",
        _ => null
    };

    /// Como en el resto del puente: el mensaje de un <c>RpcException</c> trae el código seguido del detalle, así
    /// que se compara por prefijo y no por igualdad.
    private static bool Starts(string? error, string code) =>
        !string.IsNullOrEmpty(error) && error.StartsWith(code, StringComparison.Ordinal);

    private static string Trim(string value) => value.Trim();
}
