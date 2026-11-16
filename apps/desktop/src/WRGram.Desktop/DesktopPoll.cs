namespace WRGram.Desktop;

using System.Globalization;
using System.Linq;
using TL;

/// <summary>
/// Reglas de las encuestas en Windows. Android manda la encuesta como un contenido de TDLib
/// (<c>InputMessagePoll</c> con su <c>question</c>, sus <c>options</c> y su <c>type</c>) y el motor traduce; en
/// MTProto la encuesta viaja como <b>adjunto</b> —<c>InputMediaPoll</c> dentro de la misma
/// <c>messages.sendMedia</c> que ya usa el archivo suelto— y el voto es una petición propia,
/// <c>messages.sendVote</c>. Casi todo lo que hay aquí son literales copiados carácter a carácter de
/// <c>NativeBridge</c>: <c>sendPoll</c>, <c>answerPoll</c>, <c>stopPoll</c>, <c>pollVoters</c> y
/// <c>NativeSnapshot.pollRestriction</c>, para que las dos capas digan lo mismo sin abrir una cuenta.
/// <para>
/// Lo primero que sorprende es que <b>el identificador de la encuesta y las claves de cada opción los inventa el
/// cliente</b> (<see cref="NewPollId"/> y <see cref="OptionKeys"/>). TDLib hace lo mismo por dentro al montar el
/// <c>InputPoll</c>, y es lo que permite que <c>messages.sendVote</c> pida <c>String[] options</c> en vez de
/// índices: la clave opaca viaja en <c>PollAnswer.option</c> y el número de opción es solo de la pantalla. De ahí
/// que votar tenga que leer la encuesta recién escrita antes de nada —la regla de la ronda AH, escribir obliga a
/// leer—, porque las claves están en la fila de Telegram, no en el índice que tocó la persona.
/// </para>
/// <para>
/// Dos cosas que este esquema no puede hacer y se dicen con su nombre en vez de taparse con el «No disponible en
/// escritorio (beta)» de siempre. <see cref="NoStop"/>: <b>no existe petición para cerrar una encuesta</b> —no está
/// <c>TL.Methods.Messages_StopPoll</c> ni su extensión, y el puente no tiene manera de escribirla a mano—, así que
/// <c>canStop</c> sale en <c>false</c> y la pantalla no pinta el botón: es un hueco de la librería, no una plaza sin
/// ocupar. Lo contrario pasó con la lista de votantes: <c>messages.getPollVotes</c> siempre existió y desde la ronda
/// AO está conectada, de modo que <see cref="CanGetVoters"/> manda sola y el botón de la pantalla funciona. Las tres
/// frases que quedan por debajo son reglas de Telegram y no huecos: <see cref="NoOption"/> es el
/// <c>IllegalArgumentException()</c> sin mensaje con el que Android despacha un índice ausente o negativo,
/// <see cref="AnonymousVoters"/> es el anonimato, y <see cref="OnlyFirstPage"/> la única divergencia de protocolo que
/// hay aquí dentro —TDLib pagina saltando un número de votantes; MTProto espera el cursor opaco que él mismo devolvió
/// en <c>next_offset</c>, y este puente no le entrega ese cursor a nadie: lo honesto es negarse antes que devolver la
/// primera página haciéndola pasar por otra—.
/// </para>
/// <para>
/// Y tres palabras que no son de esta capa. <c>pollVoters</c> no formatea nombres: llama a
/// <c>TdSession.senderName</c>, y ese método tiene tres salidas literales que son justo las que la lista puede pintar
/// —<see cref="VoterSelf"/>, <see cref="VoterUnknown"/> y <see cref="VoterUnknownChat"/>—. Se copian de ahí, y una
/// prueba lo vigila: quien vote desde los dos dispositivos tiene que leerse a sí mismo igual.
/// </para>
/// <para>
/// Una cifra no sale de ninguna parte en MTProto y hay que fabricarla con criterio: el porcentaje. TDLib publica
/// <c>vote_percentage</c> por opción y la pantalla lo pinta tal cual; la librería solo da
/// <c>PollAnswerVoters.voters</c> y <c>PollResults.total_voters</c>, así que <see cref="Percentage"/> lo calcula y
/// redondea a entero, que es lo que muestra Telegram en todas sus capas. Lo que sí viene del servidor es la marca
/// de «esta la votaste tú» (<c>PollAnswerVoters.Flags.chosen</c>, documentado como «whether we have chosen this
/// answer»), y de ahí que esta capa no recuerde votos por su cuenta: el aviso <c>updateMessagePoll</c> que responde
/// al propio voto trae la marca puesta y la burbuja se actualiza sola. Lo que el servidor <b>no</b> dice nunca es
/// por qué opciones votaron los demás en una encuesta anónima —eso es el anonimato—, y por eso
/// <see cref="CanGetVoters"/> es la bandera negativa de <see cref="IsAnonymous"/> y no un permiso.
/// </para>
/// <para>
/// Y unas ausencias contadas para que no se lean como olvido. Android niega la encuesta en chat secreto con
/// «Telegram no permite encuestas en chats secretos.». Este host no lista chats secretos —sus entradas salen de
/// <c>PeerUser</c>, <c>PeerChat</c> y <c>PeerChannel</c>, y no hay ninguna fila <c>EncryptedChat</c> por la que
/// pasar—, así que esa negación no es alcanzable y no se copia. Tampoco se copian cinco de las seis razones de
/// <c>NativeSnapshot.pollRestriction</c>: «aún no se ha enviado», «está programada» y «llevas menos de un día en el
/// chat» son estados de la tubería de TDLib y de los datos del sesión (días de pertenencia), y «tu país no puede
/// participar» necesitaría saber el país de esta cuenta, que la librería no publica; <c>TL.Poll</c> trae la lista
/// de países admitidos, pero nadie dice desde dónde se conecta una sesión de escritorio. Queda
/// <see cref="ClosedReason"/>, que sí se lee en la bandera <c>closed</c>, y la razón de relleno («No puedes votar en
/// esta encuesta.») tampoco tiene traducible: aquí no hay ninguna de las cinco causas que la producen.
/// </para>
/// </summary>
public static class DesktopPoll
{
    /// Las cuatro cifras de <c>BridgePolicy.text(p,"question",255)</c> y de <c>sendPoll</c>: la pregunta corta en
    /// 255, las opciones son dos orillas —2 y 10— y cada una mide entre 1 y 100. La explicación del cuestionario
    /// son los 200 de <c>NativeSnapshot.limit(explanation,200)</c>.
    public const int MaxQuestion = 255;
    public const int MinOptions = 2;
    public const int MaxOptions = 10;
    public const int MaxOption = 100;
    public const int MaxExplanation = 200;

    /// Lo que <c>answerPoll</c> admite en su lista: de una a diez opciones, y un índice negativo es un error de
    /// pantalla, no una voto.
    public const int MinVotes = 1;
    public const int MaxVotes = 10;

    /// Cuántos votantes caben en una página. Es literal de <c>pollVoters</c> —<c>Math.max(1,Math.min(50,…))</c>— y no
    /// un tope inventado aquí: TDLib no devuelve más de cincuenta, y la pantalla lo sabe porque manda
    /// <c>limit: 50</c> desde <c>BatchPanels.tsx:35</c>.
    public const int MaxVoters = 50;

    /// Los recortes con los que <c>NativeSnapshot</c> pinta una encuesta ya leída: 300 para la pregunta, 100 para
    /// cada opción y 300 para la explicación. Son distintas de las de arriba a propósito —se escribe un máximo y se
    /// lee otro, porque Telegram puede tener filas más largas que lo que este cliente deja crear— y por eso viven
    /// separadas.
    public const int ShownQuestion = 300;
    public const int ShownOption = 100;
    public const int ShownExplanation = 300;

    /// Literal de la primera línea de <c>sendPoll</c>, la que Android comprueba antes incluso de mirar la
    /// conversación. En MTProto la dice <see cref="CanSendText"/>, que lee el derecho <c>send_messages</c> de la
    /// fila del chat: TDLib mantiene los permisos al día, aquí hay que pedirlos a la fila que ya se tiene.
    public const string Sending = "No puedes enviar mensajes en este chat.";

    /// Literal de <c>sendPoll</c> para un uno a uno que no es un bot ni «Mensajes guardados». Es la regla de
    /// Telegram, no una preferencia del cliente.
    public const string Private =
        "Las encuestas solo pueden enviarse a bots o a Mensajes guardados en chats privados.";

    /// Literal de <c>sendPoll</c> cuando <c>chat.permissions.canSendPolls</c> es falso; aquí lo decide
    /// <see cref="CanSendPolls"/> con el derecho <c>send_polls</c>.
    public const string NotAllowed = "Este chat no permite encuestas.";

    /// Literal de <c>sendPoll</c> con la pregunta vacía.
    public const string NoQuestion = "Escribe una pregunta.";

    /// La pantalla la tiene escrita desde siempre —<c>PollComposer</c>— y es la que Android responde en inglés por
    /// <c>BridgePolicy.text</c> («Invalid text») cuando el texto pasa del máximo. Se copia la de la pantalla, que
    /// es la misma norma dicha en español; la ronda AH traducía ese mismo literal por la misma razón. Es la
    /// <b>primera</b> de las dos y no la segunda: Android mide la longitud dentro de <c>text()</c>, antes del
    /// <c>trim()</c> y antes de mirar si la pregunta está vacía, así que una pregunta de 300 espacios se niega por
    /// larga y no por vacía. Ahí hay una divergencia contada: <c>text()</c> también lanza cuando la clave no viene
    /// o no es texto, y entonces Android dice «Invalid text» en inglés mientras que aquí una pregunta que falta es
    /// una pregunta vacía. La pantalla siempre manda la clave, y responder en español a una persona que no escribió
    /// nada es mejor que responder en inglés.
    public const string TooLong = "La pregunta admite hasta 255 caracteres.";

    /// Literal de <c>sendPoll</c> para el tamaño del lote de opciones. La pantalla avisa con otra frase más
    /// amable («Añade entre 2 y 10 opciones.») antes de llegar al puente; esta es la que queda cuando el lote llega
    /// mal formado desde cualquier otra parte.
    public const string Batch = "Escribe entre 2 y 10 opciones.";

    /// Literal de <c>sendPoll</c> para una opción vacía o de más de cien caracteres: Android mete las dos
    /// condiciones en una sola frase y aquí se conserva esa forma.
    public const string Option = "Cada opción debe tener entre 1 y 100 caracteres.";

    /// Literal de <c>sendPoll</c> cuando dos opciones se repiten. Android compara en minúsculas con
    /// <c>Locale.ROOT</c>; aquí lo hace <see cref="Repeats"/> con <c>ToLowerInvariant</c>, que es el mismo criterio.
    public const string Repeated = "Las opciones no pueden repetirse.";

    /// Literal de <c>sendPoll</c> cuando se marca cuestionario sin respuesta correcta o con una que se sale.
    public const string NoCorrect = "Elige una respuesta correcta.";

    /// Literal que <c>answerPoll</c>, <c>stopPoll</c> y <c>pollVoters</c> comparten en Android cuando la fila no
    /// es una encuesta.
    public const string NoPoll = "Este mensaje no contiene una encuesta.";

    /// La misma frase con la que el puente de la ronda AM niega un mensaje que ya no está; se repite el literal y
    /// una prueba exige que las dos clases no se separen.
    public const string Gone = "El mensaje ya no está disponible.";

    /// Android no tiene frase para esto: su <c>answerPoll</c> lanza <c>IllegalArgumentException()</c> sin mensaje
    /// si la lista se sale de 1..10 o trae un índice negativo. Como en español no había nada que copiar, la frase
    /// es de esta capa.
    public const string NoVote = "Marca entre una y diez opciones de esta encuesta.";

    /// También propia. Android deja que sea TDLib quien responda con su error cuando el índice no corresponde a
    /// ninguna opción; aquí la lista de claves se arma contra la encuesta recién leída y se puede nombrar la causa
    /// mejor: la pantalla se quedó atrás.
    public const string Stale = "Alguna de las opciones ya no está en la encuesta.";

    /// Primera rama de <c>NativeSnapshot.pollRestriction</c>, la única de sus seis razones que se puede leer en
    /// este esquema.
    public const string ClosedReason = "La encuesta está cerrada.";

    /// Hueco de la librería, dicho con su nombre: cerrar una encuesta no es que no esté conectado, es que no hay
    /// petición. Es el mismo caso de <see cref="DesktopMessageReact.Refused"/>.
    public const string NoStop =
        "La biblioteca de escritorio no tiene petición para cerrar una encuesta, así que aquí se puede enviar y votar, pero no cerrarla.";

    /// <c>pollVoters</c> lanza <c>IllegalArgumentException()</c> sin mensaje cuando el índice de la opción no viene o
    /// es negativo. Es el mismo caso de <see cref="NoVote"/> en el voto: en Android no había literal que copiar, así
    /// que la frase es de aquí.
    public const string NoOption = "Elige de qué opción quieres ver los votantes.";

    /// El anonimato dicho por lo que es: una regla de Telegram y no un hueco del puente. Es la cara de
    /// <see cref="CanGetVoters"/> —la bandera que apaga el botón— repetida en la frontera, porque la orden se puede
    /// invocar sin pasar por la pantalla.
    public const string AnonymousVoters = "En una encuesta anónima Telegram no dice quién votó cada opción.";

    /// La divergencia de protocolo, contada sin eufemismos: el desplazamiento de TDLib es un número de votantes y el
    /// de MTProto es un cursor opaco que aquí nadie devuelve. Ver el resumen de la clase.
    public const string OnlyFirstPage =
        "La lista de votantes de escritorio solo da la primera página: el seguimiento de Telegram no es un número.";

    /// Las tres salidas literales de <c>TdSession.senderName</c>, copiadas carácter a carácter: son lo que la
    /// columna de nombres de la pantalla pinta en Android, y una prueba lo comprueba en los dos archivos.
    public const string VoterSelf = "Tú";
    public const string VoterUnknown = "Usuario de Telegram";
    public const string VoterUnknownChat = "Conversación";

    /// Los tres derechos que se pueden leer <b>sin petición extra</b> en la fila de Telegram que el host ya tiene
    /// cacheada. Un canal publica los propios (<c>banned_rights</c>) y los por defecto; un grupo básico solo los
    /// por defecto, y ahí es donde un administrador puede más que la norma —de ahí <c>Privileged</c>—.
    public readonly record struct Rights(ChatBannedRights? Own, ChatBannedRights? Standard, bool Privileged);

    /// La lectura de esas tres banderas, en un solo sitio, igual que <see cref="DesktopAlbum.AlbumIdOf"/> hace con
    /// el <c>grouped_id</c>. Cada derecho solo vale si su bandera está: sin <c>has_banned_rights</c> el campo no
    /// existe, y tratar un objeto nulo como «bloqueado» sería negar votos que Telegram sí admite.
    public static Rights Of(ChatBase? row) => row switch
    {
        Channel channel => new Rights(
            (channel.flags & Channel.Flags.has_banned_rights) != 0 ? channel.banned_rights : null,
            (channel.flags & Channel.Flags.has_default_banned_rights) != 0 ? channel.default_banned_rights : null,
            (channel.flags & Channel.Flags.creator) != 0 || (channel.flags & Channel.Flags.has_admin_rights) != 0),
        Chat basic => new Rights(
            null,
            (basic.flags & Chat.Flags.has_default_banned_rights) != 0 ? basic.default_banned_rights : null,
            (basic.flags & Chat.Flags.creator) != 0 || (basic.flags & Chat.Flags.has_admin_rights) != 0),
        _ => new Rights(null, null, false),
    };

    /// <c>send_messages</c> es el permiso general del que depende todo lo demás, incluido mandar una encuesta; es
    /// lo más parecido a <c>session.canSend()</c> de Android que este esquema publica en la fila.
    public static bool CanSendText(Rights rights) => Free(rights, ChatBannedRights.Flags.send_messages);

    /// <c>send_polls</c>, el derecho propio de la encuesta. Son dos comprobaciones distintas en Android
    /// (<c>canSend()</c> y <c>permissions.canSendPolls</c>) y dos frases distintas aquí.
    public static bool CanSendPolls(Rights rights) => Free(rights, ChatBannedRights.Flags.send_polls);

    /// <summary>
    /// Los derechos por defecto solo atan a quien no es creador ni administrador; los propios atan a cualquiera, y
    /// por eso se miran primero. Sin fila —o con una fila recortada por <c>min</c>, que no publica derechos— se
    /// deja pasar y decide Telegram: negar por no saber sería peor que el error que devuelve el servidor.
    /// <para>
    /// La ronda AP lo hizo público: compartir un contacto se rige por <c>send_docs</c>, y negarlo con una copia de
    /// esta regla en otra clase sería tener dos maneras de leer el mismo bit.
    /// </para>
    /// </summary>
    public static bool Free(Rights rights, ChatBannedRights.Flags bit)
    {
        if (Set(rights.Own, bit)) return false;
        if (rights.Privileged) return true;
        return !Set(rights.Standard, bit);
    }

    private static bool Set(ChatBannedRights? rights, ChatBannedRights.Flags bit) =>
        rights != null && (rights.flags & bit) != 0;

    /// Un uno a uno admite encuesta solo si es un bot o la propia cuenta («Mensajes guardados»). El host ya trae la
    /// marca de bot en la entrada de la conversación, leída del <c>User</c> vivo al construir la lista.
    public static bool PrivateOk(bool bot, bool self) => bot || self;

    /// La pregunta que llega a Telegram: recortada por los dos lados, vacía incluida porque el propio puente
    /// Android hace <c>.trim()</c> antes de comparar.
    public static string Trim(string? raw) => (raw ?? "").Trim();

    public static bool HasQuestion(string question) => question.Length > 0;

    public static bool WithinQuestion(string question) => question.Length <= MaxQuestion;

    public static bool Fits(int count) => count is >= MinOptions and <= MaxOptions;

    public static bool FitsOption(string option) => option.Length is > 0 and <= MaxOption;

    /// Como el <c>HashSet</c> de <c>sendPoll</c>: dos opciones que solo se diferencian en mayúsculas son la misma.
    public static bool Repeats(string[] options) =>
        options.Select(option => option.ToLowerInvariant()).Distinct().Count() != options.Length;

    /// La misma doble orilla de <c>sendPoll</c>: <c>correct &lt; 0 || correct &gt;= options.length</c>.
    public static bool AllowsCorrect(int correct, int count) => correct >= 0 && correct < count;

    /// El explicación del cuestionario viaja en <c>solution</c>, y TDLib solo pone <c>has_solution</c> si hay texto.
    public static bool HasSolution(string explanation) => explanation.Length > 0;

    /// Las cinco banderas del borrador traducidas a las de <c>TL.Poll</c>. Dos cosas hay que mirar:
    /// <c>public_voters</c> es la <b>invertida</b> de «Votos anónimos» y <c>revoting_disabled</c> la invertida de
    /// «Permitir cambiar el voto», que es justo donde una traducción distraida deja una encuesta pública creyéndose
    /// anónima. Y <c>multiple_choice</c> solo vale si no es cuestionario, que es la misma guarda de
    /// <c>boolean multiple=!quiz&amp;&amp;p.optBoolean("multiple")</c> en Android.
    public static TL.Poll.Flags FlagsFor(bool quiz, bool anonymous, bool multiple, bool revoting, bool hide)
    {
        var flags = (TL.Poll.Flags)0;
        if (quiz) flags |= TL.Poll.Flags.quiz;
        if (!anonymous) flags |= TL.Poll.Flags.public_voters;
        if (multiple && !quiz) flags |= TL.Poll.Flags.multiple_choice;
        if (!revoting) flags |= TL.Poll.Flags.revoting_disabled;
        if (hide) flags |= TL.Poll.Flags.hide_results_until_close;
        return flags;
    }

    /// El identificador que la pantalla no ve y Telegram sí. TDLib lo sortea al montar la encuesta; aquí se sortea
    /// igual y se guarda en la fila que se manda.
    public static long NewPollId() => Random.Shared.NextInt64(1, long.MaxValue);

    /// Una clave opaca por opción, distinta entre sí. Son lo que <c>messages.sendVote</c> pide de vuelta, así que
    /// dos iguales fundirían dos opciones en un solo voto; el bucle <c>do/while</c> no es paranoia, es la única
    /// manera de prometerlo sin mirar la tabla.
    public static string[] OptionKeys(int count)
    {
        var keys = new string[count];
        var seen = new HashSet<string>(StringComparer.Ordinal);
        for (var position = 0; position < count; position++)
        {
            string key;
            do { key = Random.Shared.NextInt64(1, long.MaxValue).ToString(CultureInfo.InvariantCulture); }
            while (!seen.Add(key));
            keys[position] = key;
        }
        return keys;
    }

    /// Los índices que llegan de la pantalla, ya como enteros. El puente Android acepta el array tal cual porque
    /// JSON se lo da numérico; aquí <c>Arr</c> convierte lo que sea a texto, así que hay que volver a leerlos y
    /// negar lo que no sea un índice válido.
    public static int[]? Indices(string[] raw)
    {
        if (raw.Length < MinVotes || raw.Length > MaxVotes) return null;
        var indices = new int[raw.Length];
        for (var position = 0; position < raw.Length; position++)
            if (!int.TryParse(raw[position], NumberStyles.Integer, CultureInfo.InvariantCulture, out indices[position])
                || indices[position] < 0) return null;
        return indices;
    }

    /// Índice → clave opaca, sobre la encuesta que Telegram acaba de devolver. Devuelve <c>null</c> si algún índice
    /// se sale, que es <see cref="Stale"/>: la pantalla mostraba una encuesta que ya cambió.
    public static string[]? KeysFor(TL.Poll? poll, int[] indices)
    {
        if (poll == null) return null;
        var answers = Options(poll);
        if (indices.Any(index => index >= answers.Length)) return null;
        return indices.Select(index => answers[index].option).ToArray();
    }

    /// Las opciones como las ve la pantalla. <c>TL.Poll.answers</c> es un <c>PollAnswerBase[]</c> y el campo
    /// <c>option</c> solo está en <c>PollAnswer</c>, así que el filtro va antes de cualquier índice: es la misma
    /// lección que la ronda AM aprendió con <c>MessageBase[]</c>.
    public static PollAnswer[] Options(TL.Poll poll) => poll.answers.OfType<PollAnswer>().ToArray();

    public static bool IsQuiz(TL.Poll poll) => Has(poll.flags, TL.Poll.Flags.quiz);
    public static bool IsAnonymous(TL.Poll poll) => !Has(poll.flags, TL.Poll.Flags.public_voters);
    public static bool AllowsMultiple(TL.Poll poll) => Has(poll.flags, TL.Poll.Flags.multiple_choice);
    public static bool AllowsRevoting(TL.Poll poll) => !Has(poll.flags, TL.Poll.Flags.revoting_disabled);
    public static bool IsClosed(TL.Poll poll) => Has(poll.flags, TL.Poll.Flags.closed);
    public static bool HidesResults(TL.Poll poll) => Has(poll.flags, TL.Poll.Flags.hide_results_until_close);

    private static bool Has(TL.Poll.Flags flags, TL.Poll.Flags bit) => (flags & bit) != 0;

    /// TDLib dice «puedes ver resultados» como un dato; aquí se deduce. Un cuestionario siempre enseña si acertaste
    /// —por eso la pantalla puede pintar el porcentaje nada más votar—, una encuesta normal no enseña nada hasta
    /// cerrar si <c>hide_results_until_close</c> está puesta, y una cerrada ya lo enseña todo.
    public static bool CanSeeResults(TL.Poll poll) => IsQuiz(poll) || IsClosed(poll) || !HidesResults(poll);

    /// La lista de votantes solo existe donde los votos son públicos; en una anónima no la da ni el servidor, así
    /// que negarla aquí no es tapar un hueco del puente.
    public static bool CanGetVoters(TL.Poll poll) => !IsAnonymous(poll);

    /// La orilla de <c>pollVoters</c> pasada a entero: <c>Math.max(1,Math.min(50,limit))</c>. El cero y los negativos
    /// caen a uno y no a cero, porque un límite de cero significaría «no preguntes nada» justo cuando la persona
    /// pidió ver la lista.
    public static int VoterLimit(int limit) => Math.Clamp(limit, 1, MaxVoters);

    /// Quién votó y cuándo en cada uno de los tres subtipos que puede traer una lista de votos. Hace falta esta
    /// traducción porque <c>MessagePeerVoteBase</c> —el tipo con el que <c>votesList.votes</c> llega— <b>no publica ni
    /// <c>peer</c> ni <c>date</c></b>: los declaran los subtipos por su cuenta, así que el filtro va antes de mirar
    /// nada. Es la misma lección que la ronda AM aprendió con <c>MessageBase[]</c>, y el descarte final es un
    /// subtipo que esta versión de la librería no conoce: sin nombre ni fecha no hay fila que pintar.
    /// <para>
    /// Los tres subtipos se tratan igual a propósito. <c>MessagePeerVote</c> trae la clave de la opción;
    /// <c>MessagePeerVoteMultiple</c> trae varias, porque la persona votó en una de respuestas múltiples; y
    /// <c>MessagePeerVoteInputOption</c> no trae ninguna, porque ese voto se guardó como opción de entrada y no como
    /// clave opaca. A esta lista le da igual: el filtrado por opción ya lo hizo el parámetro <c>option</c> de la
    /// petición, y lo que la pantalla pinta son dos columnas —nombre y hora—.
    /// </para>
    public static (Peer? Peer, DateTime Date) VoterOf(MessagePeerVoteBase? vote) => vote switch
    {
        MessagePeerVote single => (single.peer, single.date),
        MessagePeerVoteMultiple many => (many.peer, many.date),
        MessagePeerVoteInputOption legacy => (legacy.peer, legacy.date),
        _ => (null, default),
    };

    /// El entero que la pantalla pinta como porcentaje. Redondeo alejado del cero, que es lo que hace Telegram; con
    /// total cero sale cero en vez de una división rara.
    public static int Percentage(int votes, int total) =>
        total <= 0 ? 0 : Math.Clamp((int)Math.Round(votes * 100.0 / total, MidpointRounding.AwayFromZero), 0, 100);

    /// La llave con la que esta capa recuerda qué votó la cuenta. Va por conversación y mensaje, no por
    /// <c>poll.id</c>, porque el mismo identificador viaja en un reenvío y dos burbujas distintas no pueden compartir
    /// su marca.
    public static string VoteKey(string chatId, int messageId) => chatId + ":" + messageId;
}
