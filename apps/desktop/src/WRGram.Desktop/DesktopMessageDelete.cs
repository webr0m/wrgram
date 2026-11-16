namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using TL;

/// <summary>
/// Borrar mensajes en Windows. TDLib tiene un solo <c>DeleteMessages</c> que sirve para privado, grupo
/// básico, supergrupo y canal, y una bandera <c>revoke</c> que significa «también para los demás» en todos
/// ellos. MTProto reparte eso en dos peticiones que no son simétricas: <c>messages.deleteMessages</c> admite
/// <c>revoke</c> pero solo llega a chats privados y grupos básicos, y <c>channels.deleteMessages</c> llega a
/// canal y supergrupo <b>sin ninguna bandera</b> —borra siempre para todos—. De ahí salen las dos reglas de
/// esta clase: a qué petición va cada clave, y qué es honesto ofrecer en cada forma de chat.
/// <para>
/// Nada de lo que aquí se niega se disimula con la otra petición. Un «solo para mí» en un canal habría tenido
/// que mandarse como <c>channels.deleteMessages</c>, es decir, borrar el mensaje para toda la comunidad: lo
/// contrario de lo que la persona acaba de pedir. Se responde la negativa y la pantalla no pinta el botón.
/// </para>
/// <para>
/// Los códigos de error no se traducen aquí. La documentación de la librería promete para estas dos peticiones
/// un <c>RpcException</c> con los números 400, 403, 406 y 420 y ningún nombre; inventarse una causa propia
/// para un error que no se ha visto sería tapar la culpa, así que el texto de Telegram sube tal cual, como lo
/// hace <c>Describe</c> en las rondas Z, AA y AB.
/// </para>
/// <para>
/// Las cuatro frases de aviso están copiadas carácter a carácter de <c>TdSession.java</c>, que es donde Android
/// las escribe en su <c>Toast</c>, y <c>rondaAC.test.ts</c> lo comprueba leyendo los dos textos y el de la
/// interfaz.
/// </para>
/// </summary>
public static class DesktopMessageDelete
{
    /// El mismo tope que <c>TdSession.deleteMessages</c>: ni cero ni cien y uno.
    public const int MaxBatch = 100;

    /// Copiada de <c>TdSession.java</c> («Selecciona entre 1 y 100 mensajes.»).
    public const string BatchSize = "Selecciona entre 1 y 100 mensajes.";

    /// `channels.deleteMessages` no lleva bandera de revocación: en una comunidad de tipo canal la única
    /// petición que existe borra para todos, así que «solo para mí» no es que no esté conectado, es que no
    /// hay forma de pedirlo.
    public const string NoSelfInChannel =
        "En un canal o supergrupo Telegram solo conoce la petición que borra para todos; aquí no hay un «solo para mí» que enviar.";

    /// `messages.deleteMessages` con `revoke` sobre un mensaje recibido: Telegram lo rechaza, porque en un
    /// uno a uno o en un básico solo se retira para todos lo que enviaste tú.
    public const string NotYours = "Solo puedes eliminar para todos los mensajes que enviaste tú desde esta cuenta.";

    /// Los ids viajan como enteros de 32 bits en las dos peticiones. Un id que no cabe no se recorta: se
    /// diría que borró otra cosa.
    public const string OutOfRange = "El identificador del mensaje no cabe en la petición de Telegram.";

    /// La fila ya no está en la ventana cargada, o está en otra conversación. Android lanza «Unknown
    /// message» desde <c>NativeBridge.message</c> en el caso unitario; aquí se dice en español y se aplica
    /// igual al lote, porque borrar media selección en silencio es peor que no borrar.
    public const string NotLoaded = "Algún mensaje de la selección ya no está cargado. Actualiza la conversación e inténtalo de nuevo.";

    /// Mismo caso que en <c>DesktopMembership.Stale</c>: la clave prometía una forma y la caché tiene otra.
    public const string Stale = DesktopMembership.Stale;

    /// Las cuatro frases con las que Android avisa al confirmar, copiadas de <c>TdSession.java</c>. La pantalla
    /// de escritorio las pinta porque en Windows el puente no tiene canal de <c>Toast</c>: sin esto, borrar
    /// saldría bien y no se vería nada.
    public const string OneAll = "Mensaje eliminado para todos.";
    public const string OneSelf = "Mensaje eliminado para ti.";
    public const string ManyAll = "Mensajes eliminados para todos.";
    public const string ManySelf = "Mensajes eliminados para ti.";

    public enum Kind
    {
        /// Chat uno a uno (`u`+id): `messages.deleteMessages`, con o sin `revoke`.
        Private,

        /// Grupo básico (`g`+id): la misma petición, porque un básico no es un canal.
        Basic,

        /// Canal o supergrupo (`c`+id): `channels.deleteMessages`, sin opción de borrar solo para mí.
        Channel,

        /// Cualquier otra clave. En escritorio no hay chats secretos, así que esto es una fila vieja o un id
        /// mal formado, y ninguna de las dos se resuelve mandando una petición a ciegas.
        Unknown,
    }

    /// La forma de la clave decide la petición, igual que en la pertenencia. `u` y `g` comparten
    /// `messages.deleteMessages` —que en MTProto no lleva destinatario: el servidor saca el chat de los ids—
    /// y `c` va a `channels.deleteMessages`, que sí lleva el canal.
    public static Kind Of(string? id)
    {
        if (string.IsNullOrEmpty(id) || id.Length < 2) return Kind.Unknown;
        if (!id.AsSpan(1).ToString().All(char.IsAsciiDigit)) return Kind.Unknown;
        return id[0] switch
        {
            'u' => Kind.Private,
            'g' => Kind.Basic,
            'c' => Kind.Channel,
            _ => Kind.Unknown,
        };
    }

    /// ¿Existe petición para «solo para mí»? En canal no, y la respuesta tiene que ser falsa antes de que la
    /// pantalla pregunte, porque el contrato de <c>Properties</c> es el único sitio donde la interfaz decide
    /// qué botón pinta. En un uno a uno y en un básico la hay, y sirve igual con un mensaje propio que con uno
    /// recibido: por ese camino solo desaparece de esta cuenta.
    public static bool CanDeleteSelf(Kind kind) => kind is Kind.Private or Kind.Basic;

    /// ¿Existe petición para «para todos»? En privado y en básico, solo con lo que esta cuenta escribió:
    /// retirar un mensaje ajeno por ese camino no es borrarlo para todos, es que Telegram lo rechace. En un
    /// canal la única petición borra siempre para todos, así que lo que decide son los permisos que Telegram
    /// dio aquí, y el autor puede con el suyo.
    public static bool CanDeleteAll(Kind kind, bool outgoing, Channel? channel) => kind switch
    {
        Kind.Private or Kind.Basic => outgoing,
        Kind.Channel => outgoing || ChannelRightsToDelete(channel),
        _ => false,
    };

    /// Un canal solo admite borrar mensajes ajenos si Telegram dijo que esta cuenta puede. Sin bandera de
    /// administración en la fila —o con la fila recortada por <c>min</c>, que no dice nada, o con la cuenta ya
    /// fuera— se promete solo lo que el autor siempre tiene.
    public static bool ChannelRightsToDelete(Channel? channel)
    {
        if (channel == null) return false;
        if ((channel.flags & Channel.Flags.min) != 0) return false;
        if ((channel.flags & Channel.Flags.left) != 0) return false;
        if ((channel.flags & Channel.Flags.has_admin_rights) == 0) return false;
        return (channel.admin_rights!.flags & ChatAdminRights.Flags.delete_messages) != 0;
    }

    /// Los ids de la petición: enteros de 32 bits, en el mismo orden en que llegaron y sin repetir. Un lote
    /// con un id ilegible o con uno que no cabe en <c>int</c> no se envía a medias.
    public static int[]? Ids(IEnumerable<string> raw)
    {
        var ids = new List<int>();
        foreach (var value in raw)
        {
            if (!int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id) || id <= 0)
                return null;
            if (!ids.Contains(id)) ids.Add(id);
        }
        return ids.Count == 0 ? null : ids.ToArray();
    }

    /// Las filas pedidas que están cargadas en esta ventana y en esta conversación. Lo que Telegram quizá
    /// conoce pero aquí no aparece —la pantalla arrastra cuarenta mensajes— queda fuera y se comprueba antes
    /// de escribir: borrar media selección y avisar con el plural diría que borró la entera.
    public static List<MessageDto> Loaded(IEnumerable<MessageDto> loaded, string chatId, IEnumerable<int> ids)
    {
        var wanted = new HashSet<int>(ids);
        return loaded
            .Where(message => message.ChatId == chatId && int.TryParse(message.Id, out var id) && wanted.Contains(id))
            .ToList();
    }

    /// El aviso que la pantalla escribe después de confirmar, con las cuatro frases de Android.
    public static string Notice(int count, bool revoke)
    {
        if (count == 1) return revoke ? OneAll : OneSelf;
        return revoke ? ManyAll : ManySelf;
    }

    /// La fila sale de la ventana cargada en cuanto Telegram confirma, igual que hace Android con
    /// <c>window.remove(id)</c>. Dejarla pintada enseñaría un mensaje que ya no existe; recargar el historial
    /// entero sería inventarse qué respondió Telegram.
    public static List<MessageDto> Without(IEnumerable<MessageDto> loaded, IEnumerable<int> ids)
    {
        var doomed = new HashSet<int>(ids);
        return loaded.Where(message => !int.TryParse(message.Id, out var id) || !doomed.Contains(id)).ToList();
    }
}
