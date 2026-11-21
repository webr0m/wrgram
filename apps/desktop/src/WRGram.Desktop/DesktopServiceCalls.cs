using System.Globalization;
using TL;

namespace WRGram.Desktop;

/// <summary>
/// Nombres de las llamadas que Telegram deja escritas en el historial. Android los saca de los dos brazos
/// de llamada de <c>ServiceMessages.java</c> y lee <c>isVideo</c> de la propia acción; el host no puede
/// copiar el sustantivo a pelo porque en MTProto solo <c>MessageActionPhoneCall</c> y
/// <c>MessageActionConferenceCall</c> traen el bit de vídeo, y afirmar «videollamada» donde el esquema no
/// lo dice es el defecto contrario del que arregló la ronda CW.
/// </summary>
internal static class DesktopServiceCalls
{
    /// La misma cultura con la que Android compone la hora programada: <c>new Locale("es","ES")</c>.
    private static readonly CultureInfo Espanol = new("es-ES");

    /// El sustantivo que admite el bit: la pareja exacta de <c>ServiceMessages.java:125</c>.
    public static string KindOf(bool video) => video ? "Videollamada" : "Llamada";

    /// La pareja de <c>ServiceMessages.java:126</c>, la que usa <c>MessageActionConferenceCall</c> con su bit.
    public static string ConferenceKindOf(bool video) => video ? "Videollamada" : "Llamada de voz";

    /// El nombre de los chats de grupo que el esquema no clasifica: ni «voz» ni «vídeo», porque no hay bit que lo sostenga.
    public const string GroupNoun = "Llamada de grupo";

    /// La duración de <c>ServiceMessages.java:186</c>, con sus tres formas y su recorte en cero.
    public static string Length(int seconds)
    {
        int total = Math.Max(0, seconds);
        int hours = total / 3600;
        int minutes = total % 3600 / 60;
        return hours > 0 ? hours + " h " + minutes + " min"
            : minutes > 0 ? minutes + " min " + total % 60 + " s"
            : total % 60 + " s";
    }

    /// El detalle « · duración» que Android añade solo cuando la cifra trae algo.
    public static string Detail(int seconds) => seconds > 0 ? " · " + Length(seconds) : "";

    /// La hora programada, en la zona local como la saca Android del epoch; la ausencia se queda sin texto.
    public static string Date(DateTime value) =>
        value == default ? "" : DateTime.SpecifyKind(value, DateTimeKind.Utc).ToLocalTime().ToString("d MMM, HH:mm", Espanol);

    /// Llamada de uno a uno. El razonamiento de los estados es el de <c>ServiceMessages.java:125</c>, menos
    /// «rechazada»: MTProto no tiene <c>phoneCallDiscardReasonDeclined</c>, y lo que Android deja caer en
    /// «finalizada» —busy y hangup— cae aquí igual.
    public static string PhoneCall(MessageActionPhoneCall call) => KindOf((call.flags & MessageActionPhoneCall.Flags.video) != 0) +
        call.reason switch
        {
            PhoneCallDiscardReasonMissed => " perdida",
            PhoneCallDiscardReasonDisconnect => " interrumpida",
            _ => " finalizada" + Detail(call.duration),
        };

    /// Conferencia antigua, la que sí trae a la vez el bit de vídeo y el de «en curso»: es el brazo de grupo de Android.
    public static string ConferenceCall(MessageActionConferenceCall call)
    {
        string kind = ConferenceKindOf((call.flags & MessageActionConferenceCall.Flags.video) != 0);
        if ((call.flags & MessageActionConferenceCall.Flags.missed) != 0) return kind + " perdida";
        if ((call.flags & MessageActionConferenceCall.Flags.active) != 0) return kind + " en curso";
        return kind + " finalizada" + Detail(call.duration);
    }

    /// Chat de grupo actual. Sin cifra de duración no se afirma tampoco que terminara.
    public static string GroupCall(MessageActionGroupCall call) =>
        (call.flags & MessageActionGroupCall.Flags.has_duration) != 0 ? GroupNoun + " finalizada" + Detail(call.duration) : GroupNoun;

    public static string GroupCallScheduled(MessageActionGroupCallScheduled call)
    {
        string when = Date(call.schedule_date);
        return GroupNoun + " programada" + (when.Length == 0 ? "" : " · " + when);
    }

    /// La invitación nombrada, el espejo de la rama <c>ServiceMessages.java:130</c> que la CW-D abre, con sus cuatro
    /// formas en el mismo orden: la propia, la de uno entre invitados, la que no trae lista y la que la trae. El actor
    /// solo va delante cuando el host lo conoce; sin actor la frase se dice en pasiva —«Se invitó a…»— en vez de
    /// soltar un nombre inventado, y eso es lo que pasa en la fila de la lista de chats, donde nadie sacó el remitente.
    public static string Invitation(MessageActionInviteToGroupCall call, string actor, Func<long, string> nameOf, long selfId, bool outgoing)
    {
        long[] ids = call.users ?? new long[0];
        string noun = GroupNoun.ToLower(Espanol);
        string invitados = ids.Length == 0 ? "" : Invitees(ids, nameOf);
        if (outgoing) return (invitados.Length == 0 ? "Invitaste a la " : "Invitaste a " + invitados + " a la ") + noun;
        if (selfId != 0 && ids.Contains(selfId)) return (actor.Length == 0 ? "Se te invitó" : actor + " te invitó") + " a la " + noun;
        if (invitados.Length == 0) return (actor.Length == 0 ? "Se invitó" : actor + " invitó") + " a la " + noun;
        return (actor.Length == 0 ? "Se invitó a " : actor + " invitó a ") + invitados + " a la " + noun;
    }

    /// Los tres primeros nombres y la cuenta del resto, la misma aritmética de `names` en Android. Aquí el «y N más»
    /// sí se puede afirmar: `MessageActionInviteToGroupCall.users` es la lista entera de invitados, no un puñado.
    public static string Invitees(long[] ids, Func<long, string> nameOf)
    {
        List<string> valores = ids.Where(id => id != 0).Select(nameOf).ToList();
        if (valores.Count == 0) return "un miembro";
        if (valores.Count == 1) return valores[0];
        if (valores.Count > 3) return string.Join(", ", valores.Take(3)) + " y " + (valores.Count - 3) + " más";
        return string.Join(", ", valores.Take(valores.Count - 1)) + " y " + valores[^1];
    }
}
