namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// Unirse y salir de una comunidad en Windows. TDLib tiene un solo par de métodos —`JoinChat` y `LeaveChat`,
/// ambos sirven para básico, supergrupo y canal—; MTProto reparte esa misma pareja en cuatro peticiones
/// (`channels.joinChannel`/`channels.leaveChannel` y `messages.importChatInvite`/`messages.deleteChatUser`),
/// así que la decisión de a cuál ir vive aquí y nadie más arriba la improvisa. Las frases están copiadas
/// carácter a carácter de `NativeBridge.java` y de `ChatMembership.java`: la misma fila abierta en Android y
/// en Windows tiene que decir lo mismo, y `rondaZ.test.ts` y `rondaAA.test.ts` lo comprueban leyendo los dos
/// textos.
/// <para>
/// Dos cosas no se pueden prometer en escritorio. La primera es la heredad: el puente de Android, antes de
/// salir, pregunta a `GetChatOwnerAfterLeaving` quién hereda el chat y ofrece traspasar; el equivalente de
/// MTProto (`messages.getFutureChatCreatorAfterLeave`) existe en la librería, pero ninguna de sus respuestas
/// se ha visto desde este host con una cuenta real, así que Windows responde la salida a secas y la interfaz
/// traduce `left` con su aviso normal. La segunda es el grupo básico por usuario público:
/// `channels.joinChannel` solo admite canal o supergrupo, y entrar en un básico exige el `hash` de su enlace
/// de invitación (`messages.importChatInvite`), que la pantalla no tiene. Se dice, en lugar de mandar la
/// petición a ciegas.
/// </para>
/// </summary>
public static class DesktopMembership
{
    /// Las dos claves que `membership.ts` ya sabe traducir. Son las mismas palabras que usa Android.
    public const string Left = "left";
    public const string Joined = "joined";

    /// `channels.joinChannel` responde esto como error cuando la comunidad pide aprobación de un administrador.
    public const string Requested = "request";

    /// En TDLib, `JoinChat` y `LeaveChat` documentan que los chats privados y secretos no se abandonan por
    /// ese camino; en MTProto tampoco existe «salir» de un uno a uno —se borra el historial, que es otra
    /// cosa—, así que ofrecer la acción ahí es prometer un método que no hay.
    public const string Unsupported = "Unirse y salir solo existen para grupos, supergrupos y canales.";

    /// La clave de la fila prometía una forma y la caché de la sesión tiene otra: el peer se quedó viejo
    /// mientras la pantalla seguía pintando. Se dice, en lugar de mandar la petición a medias.
    public const string Stale = "La conversación cambió de forma en esta sesión. Actualiza la lista e inténtalo de nuevo.";

    /// Las dos negaciones previas de Android, copiadas literal: `MEMBERSHIP_INSIDE` y `MEMBERSHIP_BLOCKED`.
    public const string Inside = "Esta cuenta ya es miembro de esa comunidad en Telegram.";
    public const string Blocked = "Telegram bloqueó esta cuenta en esa comunidad: no puede unirse desde WRGram.";

    /// En TDLib `JoinChat` entra en un básico por su id; en MTProto `channels.joinChannel` rechaza los
    /// `PeerChat` y la única puerta de un básico es el `hash` de su enlace (`messages.importChatInvite`).
    /// La fila descubierta por usuario público no trae hash, así que aquí eso no se improvisa.
    public const string BasicNeedsLink = "En Windows un grupo básico necesita su enlace de invitación para entrar; los canales y supergrupos sí se unen por su usuario público.";

    public enum Kind
    {
        Unsupported,
        Basic,
        Channel,
    }

    /// `g`+id es un grupo básico (`PeerChat`), `c`+id es canal o supergrupo (`PeerChannel`) y todo lo demás,
    /// incluido `u`+id, no es una comunidad. Las dos formas comparten la salida y no comparten la entrada:
    /// el básico se abandona con `messages.deleteChatUser` y no se une por usuario público (`BasicNeedsLink`),
    /// mientras el canal hace las dos cosas con `channels.leaveChannel` y `channels.joinChannel`.
    public static Kind Of(string? id)
    {
        if (string.IsNullOrEmpty(id) || id.Length < 2) return Kind.Unsupported;
        if (!id.AsSpan(1).ToString().All(char.IsAsciiDigit)) return Kind.Unsupported;
        return id[0] switch
        {
            'g' => Kind.Basic,
            'c' => Kind.Channel,
            _ => Kind.Unsupported,
        };
    }

    /// `channels.leaveChannel` no tiene ni opción de borrar. `messages.deleteChatUser` sí: con
    /// `revoke_messages` en verdadero el chat desaparece **para todos**, que no es salir, es borrar el
    /// grupo. TDLib `LeaveChat` no toca el historial, así que el espejo honesto es falso en los dos caminos.
    public static bool DeletesHistory(Kind kind) => false;

    /// Lo que la caché del host dice sobre la pertenencia. `Unknown` es una respuesta legítima: un
    /// `Channel` con `min` viene recortado y su bandera `left` no significa nada, así que no sirve para
    /// negar un ingreso. Android pregunta el estado con `GetChatMember`; aquí el único testigo es la
    /// bandera que Telegram mandó con la fila.
    public enum Standing
    {
        Unknown,
        Inside,
        Outside,
    }

    public static Standing StandingOf(Channel? channel)
    {
        if (channel == null) return Standing.Unknown;
        if ((channel.flags & Channel.Flags.min) != 0) return Standing.Unknown;
        return (channel.flags & Channel.Flags.left) != 0 ? Standing.Outside : Standing.Inside;
    }

    /// Las dos banderas de `channels.joinChannel` que tienen traducción en el contrato. Todo lo demás
    /// sube tal cual: el texto de Telegram, no una frase nuestra.
    public static bool RequestSent(string? error) => Starts(error, "INVITE_REQUEST_SENT");

    public static bool Banned(string? error) => Starts(error, "USER_BANNED_IN_CHANNEL");

    private static bool Starts(string? error, string code) =>
        !string.IsNullOrEmpty(error) && error.StartsWith(code, StringComparison.Ordinal);

    /// El cuerpo de la respuesta. `owner`, `when` y `successor` son opcionales en el contrato y aquí se
    /// dejan fuera: Windows no ha preguntado a Telegram quién hereda.
    public static object Outcome(string state) => new { state, opened = false };

    /// La fila sale de la lista en cuanto Telegram confirma, sin esperar al próximo `chats.list`: dejarla
    /// pintada sería enseñar un chat del que ya se ha salido.
    public static List<ChatDto> Without(IEnumerable<ChatDto> chats, string id) =>
        chats.Where(chat => chat.Id != id).ToList();

    /// Y la fila contraria entra: con la solicitud pendiente no se marca nada, porque todavía no se está
    /// dentro. La relectura de diálogos lo confirmará o lo desmentirá.
    public static void MarkInside(IEnumerable<ChatDto> chats, string id)
    {
        if (chats.FirstOrDefault(chat => chat.Id == id) is { } row) row.InList = true;
    }
}
