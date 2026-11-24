namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.RegularExpressions;
using TL;

/// <summary>
/// Las reglas de la privacidad de la cuenta: las diez claves que Android define en
/// <c>NativeBridge.java:3882</c> (<c>PRIVACY_KEYS</c>) y traduce a un ajuste de TDLib en
/// <c>privacySetting</c> (<c>:3872-3886</c>), la proyección de sus reglas (<c>PrivacyRules.project</c>,
/// <c>PrivacyRules.java:33-49</c>) y la reconstrucción que se envía (<c>PrivacyRules.merge</c>,
/// <c>:56-70</c>). No hay aquí ninguna norma nueva: hay la misma norma escrita una vez en la capa de Windows.
/// <para>
/// <b>Por qué la lectura son diez peticiones.</b> MTProto no tiene un «todas mis reglas»:
/// <c>account.getPrivacy</c> pide <b>una</b> <c>InputPrivacyKey</c> y contesta <c>account.privacyRules</c>.
/// TDLib tampoco tiene una lectura global, y Android lo resuelve con una recursión que va de clave en clave
/// (<c>privacyGet(result,index,a)</c>, <c>NativeBridge.java:3905-3911</c>). Windows recorre la misma tabla en el
/// mismo orden, así que el array que ve la pantalla sale con las diez claves en el mismo orden que desde Android.
/// </para>
/// <para>
/// <b>El orden de las reglas importa, y por eso no se reescribe todo.</b> Telegram aplica la primera regla que
/// encaje. La pantalla solo sabe expresar la base (todos / contactos / nadie) y las excepciones por persona, así
/// que reescribir la lista desde cero cambiaría de golpe cosas que nadie tocó: bots permitidos o restringidos,
/// suscriptores de Premium, contactos restringidos, miembros de chats concretos y el círculo de amigos cercanos.
/// Esas reglas viajan <b>literalmente en su hueco</b> (<c>PrivacyRules.java:12-18</c> lo dice con esas palabras y
/// <c>:59-69</c> lo implementa): lo que estaba antes del bloque modelado sigue antes, y lo que estaba después
/// sigue después. La proyección devuelve además una descripción legible de lo que se conservó, nunca un valor
/// inventado (<c>label</c>, <c>:99-107</c>).
/// </para>
/// <para>
/// <b>La asimetría que cambia el escribir, medida por reflexión sobre WTelegramClient 4.4.10.</b> Leer es barato:
/// <c>PrivacyValueAllowUsers.users</c> es un <c>Int64[]</c> de identificadores y la propia respuesta trae el
/// diccionario <c>users</c> con cada <c>TL.User</c> entero. Escribir no: <c>InputPrivacyValueAllowUsers.users</c>
/// es un <c>InputUserBase[]</c>, y un <c>InputUser</c> sin <c>access_hash</c> es una respuesta de Telegram que
/// ninguna pantalla sabe traducir. El hash sale del dichoso diccionario de la lectura que se acaba de hacer —o de
/// la caché, que <see cref="TelegramService"/> rellena con <c>MergePeers</c>—; si en ninguno de los dos está, la
/// orden se corta con <see cref="MissingUser"/> en lugar de mandar un cero.
/// </para>
/// <para>
/// <b>Tres techos, y el tercero no se alcanza.</b> <c>BridgePolicy.text(p,"key",20)</c> y <c>.text(p,"value",12</c>)
/// (<c>NativeBridge.java:3915</c>), <c>optionalIds(…,"allowUsers",100)</c> y su hermana <c>restrictUsers</c> (los
/// dos techos por lista, <c>:3882</c> más <c>:3894</c>) y el tope conjunto de
/// <c>PrivacyRules.MAX_USER_EXCEPTIONS</c> (<c>PrivacyRules.java:20</c>). Escrito el tercero, hecha la cuenta: por
/// lista entran como mucho cien permitidas y cien restringidas, o sea doscientas excepciones, y el
/// <c>validate</c> de <c>PrivacyRules.java:88-92</c> niega <b>más</b> de doscientas. Con los topes de
/// <c>NativeBridge.java:3916</c> delante, esa negación no puede ocurrir por el puente en ninguna de las dos capas
/// —medido, no supuesto: la prueba de la ronda pasa las dos listas llenas y devuelve <c>true</c>—. Se conserva
/// igual, por dos motivos: es la norma que Java escribe y la frase que la pantalla promete en
/// <c>SettingsPage.tsx:123</c>, y si algún día el tope por lista subiera, la suma sigue cortada. Lo que sí corta es
/// el de cien por lista, y lo hace antes que la clave: <c>NativeBridge.java:3916</c> va delante de <c>:3884</c>.
/// </para>
/// <para>
/// <b>La ronda CR cerró el hueco de las cuatro claves.</b> El enum medido de <c>InputPrivacyKey</c> trae catorce
/// claves y esta tabla ya usa las catorce: <c>PhoneP2P</c> (llamadas entre iguales), <c>NoPaidMessages</c>,
/// <c>SavedMusic</c> y <c>StarGiftsAutoSave</c> tienen fila en <c>SettingsPage.tsx:77</c> y se leen y se escriben
/// igual que las diez de BH. Lo que sigue sin tocarse es <c>account.getGlobalPrivacySettings</c> y
/// <c>account.setGlobalPrivacySettings</c>: esa es otra superficie —el bloqueo por historias y los regalos— que
/// ninguna pantalla de la app ofrece hoy.
/// </para>
/// </summary>
public static class DesktopPrivacy
{
    /// <summary>
    /// Las catorce claves de <c>PRIVACY_KEYS</c> (<c>NativeBridge.java:3882</c>) en el orden de esa tabla, cada una con
    /// su <c>InputPrivacyKey</c>. El orden no es cosmético: es del array que la pantalla recorre y el de la
    /// recursión de <c>:3871-3877</c>. El emparejamiento sale de los catorce <c>case</c> de
    /// <c>privacySetting</c> (<c>:3874-3883</c>): <c>ShowStatus</c> es la marca de estar en línea,
    /// <c>ShowProfilePhoto</c> la foto, <c>ShowPhoneNumber</c> el número, <c>ShowBio</c> el «About» de MTProto,
    /// <c>ShowBirthdate</c> el «Birthday», <c>ShowLinkInForwardedMessages</c> los reenvíos, <c>AllowCalls</c> la
    /// llamada, <c>AllowPrivateVoiceAndVideoNoteMessages</c> la nota de voz y de vídeo, <c>AllowChatInvites</c> la
    /// invitación a grupos y <c>AllowFindingByPhoneNumber</c> el «AddedByPhone» de MTProto. Las cuatro de CR:
    /// <c>AllowPeerToPeerCalls</c> la conexión directa en llamadas, <c>AllowUnpaidMessages</c> los mensajes sin
    /// pago, <c>ShowProfileAudio</c> la música del perfil y <c>AutosaveGifts</c> el guardado de regalos.
    /// </summary>
    public static readonly (string Key, InputPrivacyKey Setting)[] Keys =
    [
        ("status", InputPrivacyKey.StatusTimestamp),
        ("profilePhoto", InputPrivacyKey.ProfilePhoto),
        ("phone", InputPrivacyKey.PhoneNumber),
        ("bio", InputPrivacyKey.About),
        ("birthdate", InputPrivacyKey.Birthday),
        ("forwards", InputPrivacyKey.Forwards),
        ("calls", InputPrivacyKey.PhoneCall),
        ("voiceMessages", InputPrivacyKey.VoiceMessages),
        ("invites", InputPrivacyKey.ChatInvite),
        ("findPhone", InputPrivacyKey.AddedByPhone),
        ("p2p", InputPrivacyKey.PhoneP2P),
        ("noPaidMessages", InputPrivacyKey.NoPaidMessages),
        ("savedMusic", InputPrivacyKey.SavedMusic),
        ("starGiftsAutoSave", InputPrivacyKey.StarGiftsAutoSave),
    ];

    /// <summary>
    /// <c>privacySetting</c> (<c>NativeBridge.java:3883-3897</c>): la tabla de arriba leída por nombre, con el
    /// <c>default</c> de <c>:3861</c> dicho con su causa. Busca exacto, sin recortar ni ignorar mayúsculas, porque la
    /// pantalla manda las claves del propio <c>PRIVACY_KEYS</c> y cualquier otra cosa es una llamada que no se sabe
    /// qué pide.
    /// </summary>
    public static InputPrivacyKey Setting(string key)
    {
        foreach (var entry in Keys) if (entry.Key == key) return entry.Setting;
        throw new BridgeException(UnknownSetting);
    }

    /// <summary>Las tres bases que la pantalla sabe elegir, literales de <c>SettingsPage.tsx:123</c> y de
    /// <c>PrivacyRules.base</c> (<c>PrivacyRules.java:72-86</c>).</summary>
    public const string Everyone = "everyone";
    public const string ContactsValue = "contacts";
    public const string Nobody = "nobody";

    /// <summary>El <c>custom</c> de <c>PrivacyRules.java:47</c>: más de una base en la lista, o ninguna, y no se puede reescribir.</summary>
    public const string Custom = "custom";

    /// <summary>Los topes de <c>BridgePolicy.text</c> sobre las dos cadenas del argumento
    /// (<c>NativeBridge.java:3915</c>).</summary>
    public const int MaxKey = 20;

    /// <summary>El mismo tope para el valor elegido.</summary>
    public const int MaxValue = 12;

    /// <summary>El tope por lista de <c>optionalIds(p,"allowUsers",100)</c> y su hermana, llamado en
    /// <c>NativeBridge.java:3916</c> y definido en <c>:3895</c>.</summary>
    public const int MaxPerList = 100;

    /// <summary>El tope conjunto de <c>PrivacyRules.MAX_USER_EXCEPTIONS</c> (<c>PrivacyRules.java:20</c>), que la pantalla anuncia en <c>SettingsPage.tsx:123</c>.</summary>
    public const int MaxExceptions = 200;

    // ---- las negaciones, una por fuente, con la cadena de Java delante ----

    /// <summary>El <c>default</c> de <c>privacySetting</c> (<c>NativeBridge.java:3883-3897</c>). Allá ese
    /// <c>throw</c> lo convierte el <c>catch</c> del despacho genérico (<c>:167</c>) en un «función no disponible»;
    /// aquí es la causa concreta.</summary>
    public const string UnknownSetting = "Ajuste de privacidad no válido.";

    /// <summary>El primer <c>throw</c> de <c>PrivacyRules.validate</c> (<c>PrivacyRules.java:90</c>), que en Android
    /// sí llega a la pantalla porque el <c>catch</c> de <c>NativeBridge.java:3922</c> lo reenvía.</summary>
    public const string BadValue = "Valor de privacidad no válido.";

    /// <summary>El segundo <c>throw</c> de <c>validate</c> (<c>PrivacyRules.java:92</c>), escrito con el número en la
    /// frase, igual que allá. Por el puente no se alcanza: cien permitidas más cien restringidas son doscientas y la
    /// negación pide <b>más</b> de doscientas.</summary>
    public const string TooMany = "Máximo 200 excepciones por ajuste.";

    /// <summary>El tercero (<c>:94</c>): la misma persona dos veces en el lado de permitir.</summary>
    public const string Duplicated = "Hay usuarios duplicados en las excepciones.";

    /// <summary>El cuarto (<c>:95</c>): la misma persona permitida y restringida a la vez.</summary>
    public const string BothWays = "Un usuario no puede estar permitido y restringido a la vez.";

    /// <summary>La guarda de <c>NativeBridge.java:3924</c>, entre la lectura y la escritura. Allá, a mitad de las
    /// diez lecturas de <c>privacy.get</c> lo que corta es la frase genérica del <c>perform</c> (<c>:488</c>); aquí
    /// la causa se dice concreta en las dos órdenes, que es la norma que fijó la ronda AT.</summary>
    public const string ChangedAccount = "La cuenta cambió; no se modificó la privacidad.";

    /// <summary>
    /// Las dos negaciones que en Android no existen. La primera porque TDLib no pide <c>access_hash</c> al escribir:
    /// si la persona no está en la caché, aquí se aborta en lugar de mandar un cero. La segunda es la promesa del
    /// documento de <c>PrivacyRules.java:12-18</c> hecha comprobación: una regla que la librería devuelva y esta
    /// tabla aún no sepa reconvertir corta la escritura en lugar de dejarla fuera en silencio.
    /// </summary>
    public const string MissingUser =
        "Telegram no dio los datos necesarios para incluir a esa persona en la lista. Vuelve a abrir la lista de contactos e inténtalo de nuevo.";

    /// <summary>La regla que la respuesta trae y esta tabla no sabe reconvertir. No se descarta: se aborta.</summary>
    public const string Untranslatable =
        "Hay una regla de Telegram que WRGram no sabe reescribir. El ajuste queda intacto.";

    /// <summary>El <c>Invalid text</c> de <c>BridgePolicy.text</c> (<c>BridgePolicy.java:61</c>) sobre la clave o el valor.</summary>
    public const string BadText = "El ajuste y el valor de privacidad tienen que llegar como texto corto.";

    /// <summary>El <c>Invalid identifier list</c> de <c>BridgePolicy.ids</c> (<c>BridgePolicy.java:60</c>): lista de más de 100, o con elementos que no son identificadores.</summary>
    public const string BadList = "La lista de excepciones de privacidad no está bien formada.";

    // ---- las siete etiquetas de lo que se conserva, una por regla no modelada ----

    public const string AllowBots = "bots permitidos";
    public const string DisallowBots = "bots restringidos";
    public const string AllowPremium = "suscriptores de Premium permitidos";
    public const string DisallowContacts = "contactos restringidos";
    public const string AllowChatMembers = "miembros de chats permitidos";
    public const string DisallowChatMembers = "miembros de chats restringidos";

    /// <summary>El <c>default</c> de <c>PrivacyRules.label</c> (<c>PrivacyRules.java:106</c>). En TDLib es inalcanzable porque la lista está cerrada; se conserva por paridad.</summary>
    public const string OtherRules = "otras reglas de Telegram";

    /// <summary>
    /// La séptima regla no modelada, que TDLib no tiene y MTProto sí: <c>PrivacyValueAllowCloseFriends</c>. En
    /// Android esa regla nunca aparece, así que la frase es propia de Windows. No se traduce por
    /// <see cref="OtherRules"/> porque la pantalla anuncia lo que conserva y decir «otras reglas» de algo que se
    /// puede nombrar sería menos claro que el nombre suyo.
    /// </summary>
    public const string AllowCloseFriends = "amigos cercanos permitidos";

    /// <summary>
    /// Las cinco reglas que la interfaz sabe expresar: las tres bases y las dos listas de personas
    /// (<c>PrivacyRules.modeled</c>, <c>:25-31</c>). Todo lo demás viaja intacto.
    /// </summary>
    public static bool Modeled(PrivacyRule rule) =>
        rule is PrivacyValueAllowAll or PrivacyValueAllowContacts or PrivacyValueDisallowAll
            or PrivacyValueAllowUsers or PrivacyValueDisallowUsers;

    /// <summary>La etiqueta de una regla no modelada, o <see langword="null"/> si es de las cinco de arriba.</summary>
    public static string? Label(PrivacyRule rule) => rule switch
    {
        PrivacyValueAllowBots => AllowBots,
        PrivacyValueDisallowBots => DisallowBots,
        PrivacyValueAllowPremium => AllowPremium,
        PrivacyValueDisallowContacts => DisallowContacts,
        PrivacyValueAllowChatParticipants => AllowChatMembers,
        PrivacyValueDisallowChatParticipants => DisallowChatMembers,
        PrivacyValueAllowCloseFriends => AllowCloseFriends,
        _ when Modeled(rule) => null,
        _ => OtherRules,
    };

    /// <summary>
    /// <c>PrivacyRules.project</c> (<c>:33-49</c>). Las bases se juntan todas y solo vale una si hay
    /// <b>exactamente una</b> (<c>:47</c>): dos bases en la lista de Telegram es un estado que la pantalla no
    /// puede elegir ni reescribir, y decir «personalizado» sin tocarlo es la única respuesta honesta. Las
    /// etiquetas conservadas se deduplican con <c>contains</c> (<c>:44</c> y <c>:109-112</c>), así que tres reglas
    /// de bots no salen como tres líneas.
    /// </summary>
    public static object Row(string key, PrivacyRule[]? rules)
    {
        var allow = new List<string>();
        var restrict = new List<string>();
        var preserved = new List<string>();
        var bases = new List<string>();
        foreach (var rule in rules ?? [])
        {
            switch (rule)
            {
                case PrivacyValueAllowAll: bases.Add(Everyone); break;
                case PrivacyValueDisallowAll: bases.Add(Nobody); break;
                case PrivacyValueAllowContacts: bases.Add(ContactsValue); break;
                case PrivacyValueAllowUsers users:
                    foreach (var id in users.users ?? []) allow.Add(id.ToString());
                    break;
                case PrivacyValueDisallowUsers people:
                    foreach (var id in people.users ?? []) restrict.Add(id.ToString());
                    break;
                default:
                    var label = Label(rule);
                    if (label != null && !preserved.Contains(label)) preserved.Add(label);
                    break;
            }
        }
        return new
        {
            value = bases.Count == 1 ? bases[0] : Custom,
            allowUsers = allow,
            restrictUsers = restrict,
            preserved,
            key,
        };
    }

    /// <summary>
    /// <c>PrivacyRules.merge</c> (<c>:56-70</c>) hecho en dos tiempos, que es como lo pide MTProto: primero
    /// <see cref="Problem"/>, que es <c>validate</c> (<c>:88-96</c>) sin lanzar, y luego la reconstrucción. El
    /// <paramref name="hash"/> es la pregunta por el <c>access_hash</c> de una persona, y solo se hace por las dos
    /// listas de excepciones: las reglas conservadas no llevan usuarios, llevan identificadores de chat
    /// (<c>InputPrivacyValueAllowChatParticipants.chats</c> es <c>Int64[]</c>, medido).
    /// </summary>
    public static InputPrivacyRule[] Merge(PrivacyRule[]? previous, string value, long[] allow, long[] restrict, Func<long, InputUserBase> hash)
    {
        var refusal = Problem(value, allow, restrict);
        if (refusal != null) throw new BridgeException(refusal);
        var baseRules = new List<InputPrivacyRule> { value switch
        {
            Everyone => new InputPrivacyValueAllowAll(),
            ContactsValue => new InputPrivacyValueAllowContacts(),
            _ => new InputPrivacyValueDisallowAll(),
        } };
        // El orden de `PrivacyRules.base` (`:74-84`): el permiso va delante de la restricción, y en «todos» no
        // hay permiso posible porque ya está permitido por la base.
        if (value != Everyone && allow.Length > 0)
            baseRules.Add(new InputPrivacyValueAllowUsers { users = allow.Select(hash).ToArray() });
        if (value != Nobody && restrict.Length > 0)
            baseRules.Add(new InputPrivacyValueDisallowUsers { users = restrict.Select(hash).ToArray() });
        var before = new List<InputPrivacyRule>();
        var after = new List<InputPrivacyRule>();
        var inBlock = false;
        foreach (var rule in previous ?? [])
        {
            if (Modeled(rule)) { inBlock = true; continue; }
            var carried = Carried(rule, hash);
            if (inBlock) after.Add(carried); else before.Add(carried);
        }
        before.AddRange(baseRules);
        before.AddRange(after);
        return [.. before];
    }

    /// <summary>
    /// La reconversión de una regla conservada. El <c>chats</c> viaja tal cual porque son identificadores sueltos
    /// y no hace falta ningún hash; una regla que esta tabla no conociera corta la escritura con
    /// <see cref="Untranslatable"/> en lugar de dejarla fuera, que es la promesa del documento de
    /// <c>PrivacyRules.java:12-18</c>.
    /// </summary>
    public static InputPrivacyRule Carried(PrivacyRule rule, Func<long, InputUserBase> hash) => rule switch
    {
        PrivacyValueAllowBots => new InputPrivacyValueAllowBots(),
        PrivacyValueDisallowBots => new InputPrivacyValueDisallowBots(),
        PrivacyValueAllowPremium => new InputPrivacyValueAllowPremium(),
        PrivacyValueDisallowContacts => new InputPrivacyValueDisallowContacts(),
        PrivacyValueAllowCloseFriends => new InputPrivacyValueAllowCloseFriends(),
        PrivacyValueAllowChatParticipants chats => new InputPrivacyValueAllowChatParticipants { chats = chats.chats ?? [] },
        PrivacyValueDisallowChatParticipants people => new InputPrivacyValueDisallowChatParticipants { chats = people.chats ?? [] },
        _ => throw new BridgeException(Untranslatable),
    };

    /// <summary>
    /// <c>PrivacyRules.validate</c> (<c>:88-96</c>) en el mismo orden: la base, la suma, y luego los duplicados
    /// sobre un <c>HashSet</c> compartido por las dos listas —de ahí que «permitido y restringido a la vez» sea
    /// otro mensaje y no el mismo—. Devuelve la frase o <see langword="null"/> si todo vale.
    /// </summary>
    public static string? Problem(string value, long[] allow, long[] restrict)
    {
        if (value != Everyone && value != ContactsValue && value != Nobody) return BadValue;
        if (allow.Length + restrict.Length > MaxExceptions) return TooMany;
        var seen = new HashSet<long>();
        if (allow.Any(id => !seen.Add(id))) return Duplicated;
        if (restrict.Any(id => !seen.Add(id))) return BothWays;
        return null;
    }

    /// <summary>
    /// La forma de las dos cadenas del argumento: <c>BridgePolicy.text</c> (<c>BridgePolicy.java:61</c>) niega el
    /// <see langword="null"/> y lo que pase del tope. Es <see cref="BadText"/> y no la causa concreta inglesa
    /// porque allá ese <c>throw</c> lo traga el <c>catch</c> del despacho genérico (<c>NativeBridge.java:167</c>);
    /// aquí se dice.
    /// </summary>
    public static bool Shaped(string? raw, int maximum) => raw != null && raw.Length <= maximum;

    /// <summary>
    /// <c>optionalIds</c> (<c>NativeBridge.java:3928</c>): ausencia o array vacío es la lista vacía, y lo demás pasa
    /// por la regla de <c>BridgePolicy.ids</c> (<c>BridgePolicy.java:60</c>) —como mucho 100 elementos, todos cadenas con la
    /// forma de un entero firmado de hasta diecinueve dígitos—. El desbordamiento no es un caso aparte: la propia
    /// expresión lo acota, y <c>long.TryParse</c> hace el resto, que es lo que allá hace <c>Long.parseLong</c>
    /// cuando el número pasa de <c>9223372036854775807</c>.
    /// </summary>
    public static long[] Ids(string?[]? raw, out string? refusal)
    {
        refusal = null;
        if (raw == null || raw.Length == 0) return [];
        if (raw.Length > MaxPerList)
        {
            refusal = BadList;
            return [];
        }
        var result = new long[raw.Length];
        for (var i = 0; i < raw.Length; i++)
        {
            if (raw[i] is not { Length: > 0 } text || !Identifier.IsMatch(text)
                || !long.TryParse(text, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture, out var id))
            {
                refusal = BadList;
                return [];
            }
            result[i] = id;
        }
        return result;
    }

    /// <summary>
    /// La expresión de <c>BridgePolicy.java:60</c>. Java ancla los dos extremos él solo con <c>matches</c>; en .NET
    /// <c>$</c> además deja pasar un salto de línea final, así que van <c>\A</c> y <c>\z</c> —lo mismo que ya se
    /// midió para los nombres públicos en <see cref="DesktopAccountProfile.UsernamePattern"/>— para que las dos
    /// capas rechacen exactamente las mismas cadenas.
    /// </summary>
    private static readonly Regex Identifier = new(@"\A-?(0|[1-9][0-9]{0,18})\z", RegexOptions.Compiled | RegexOptions.CultureInvariant);
}
