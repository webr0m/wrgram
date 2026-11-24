namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using TL;

/// <summary>
/// El nombre público de una comunidad en Windows. En Android son dos métodos seguidos —<c>chatUsername</c>
/// (<c>NativeBridge.java:1891</c>) lee y <c>setChatUsername</c> (<c>:1893</c>) escribe— y todo lo que deciden cabe
/// en cinco líneas: la forma del chat, el tope del puente, el patrón del nombre, el derecho propio y la petición.
/// Aquí está escrito una vez, con las frases copiadas carácter a carácter y el mismo orden, y el cable solo pide.
/// <para>
/// La medida, hecha por reflexión sobre WTelegramClient 4.4.10: un <c>TL.Channel</c> trae el nombre público por
/// <b>dos</b> caminos que no son el mismo. El moderno es <c>usernames</c> (<c>Username[]</c>, presente con la bandera
/// <c>flags2.has_usernames</c>), donde cada entrada lleva sus propias marcas —<c>editable</c>=1, <c>active</c>=2,
/// <c>deletable</c>=4, <c>expired</c>=8— y es lo que TDLib traduce como <c>Usernames.activeUsernames</c> y
/// <c>Usernames.editableUsername</c> (<c>TdApi.java:106245-106257</c>). El legado es el campo suelto <c>username</c>,
/// que solo vale con <c>flags.has_username</c> y que es justamente lo que ya usa este host al construir la fila de la
/// bandeja (<c>TelegramService.cs:3834</c>, <c>Username = channel.MainUsername</c>). Cuando viene el vector manda el
/// vector; cuando no viene, no hay otro dato que el campo suelto, y <see cref="Active"/> y <see cref="Editable"/> lo
/// dicen en lugar de responder un vacío que la pantalla leería como «sin nombre público».
/// </para>
/// <para>
/// Escribir es una sola petición —<c>Channels_UpdateUsername(Client, InputChannelBase, string) -&gt;
/// Task&lt;Boolean&gt;</c>— y su respuesta no dice nombre: en esta capa no existe ningún <c>channels.ChannelLink</c>,
/// así que el host no puede aprender de la respuesta cómo quedó el chat y refresca su propio espejo
/// (<see cref="Apply"/>) después del <c>true</c>. Eso es lo que Android hace con <c>schedule()</c> en
/// <c>NativeBridge.java:1893</c> por otra vía: TDLib recibe el update de Telegram y la interfaz vuelve a pedir lo
/// suyo. La cadena vacía quita el nombre, que es lo que promete <c>SetSupergroupUsername</c>
/// (<c>TdApi.java:155934-155940</c>, «use an empty string to remove the username») y lo que la pantalla ya avisa
/// antes de confirmar.
/// </para>
/// <para>
/// Dos palabras que en las dos librerías no son la misma y aquí se dicen, no se disimulan. TDLib llama <i>editable</i>
/// al nombre que <c>SetSupergroupUsername</c> puede cambiar; MTProto llama <i>main</i> al que cambia
/// <c>channels.updateUsername</c>. Para un canal los dos coinciden en la práctica —la marca <c>editable</c> está
/// puesta sobre el nombre principal—, y Windows enseña el <c>editable</c> del vector porque es lo que Android enseña,
/// aunque escriba por la vía del principal. Los nombres <b>secundarios</b> de un canal (encenderlos, apagarlos,
/// reordenarlos: <c>channels.toggleUsername</c>, <c>channels.reorderUsernames</c>) no son este flujo y no se tocan:
/// TDLib los atiende con otros métodos que este puente todavía no tiene.
/// </para>
/// <para>
/// Y una diferencia de capas que ya decidió la ronda AT en lugar de improvisarla aquí. En Android,
/// <c>setChatUsername</c> comunica el formato malo y el chat que no es comunidad con <c>throw</c>, y el
/// <c>catch</c> genérico del despacho (<c>NativeBridge.java:167</c>) convierte cualquier <c>Exception</c> en «Solicitud
/// no válida o función no disponible.», así que esas dos frases están escritas en Java pero no llegan a la pantalla.
/// Windows y el andamio dicen la causa con la cadena concreta, igual que dijeron <c>account.username</c> cuando
/// Android respondía <c>Invalid text</c>. Lo que no cambia es la norma ni la frase: solo el camino por el que llega.
/// </para>
/// </summary>
public static class DesktopChatUsernames
{
    /// <c>chatUsername</c> (<c>NativeBridge.java:1891</c>) y <c>setChatUsername</c> (<c>:1893</c>) dicen la misma
    /// cadena, y por el mismo motivo: en MTProto el nombre público vive en <c>TL.Channel</c>, así que un grupo básico
    /// no tiene de dónde leerlo ni petición con la que escribirlo. La negación la pone la forma de la clave de la
    /// fila, igual que en Android la pone <c>chat.type instanceof ChatTypeSupergroup</c>.
    public const string Unsupported = "Los nombres públicos solo están disponibles en supergrupos y canales.";

    /// El <c>answer.fail</c> de <c>setChatUsername</c> (<c>NativeBridge.java:1893</c>) cuando
    /// <c>grantedAdminRight(actor,"canChangeInfo")</c> sale en falso.
    public const string NoRight = "Telegram no concede a esta cuenta permiso para cambiar el nombre público.";

    /// El guardaje con el que Android envuelve <b>todo</b> paso asíncrono: <c>perform</c>
    /// (<c>NativeBridge.java:488</c>) compara <c>answer.owner</c> con <c>session.selfId</c> antes de entregar el
    /// resultado y responde esta cadena. En el resto de los flujos de comunidad hay guardas propias
    /// (<c>DesktopCommunityInfo.ChangedAccount</c>) porque Android las escribe en el sitio; aquí Android no escribe
    /// ninguna, y la que aplica es la genérica del <c>perform</c>, que es la que la persona vería.
    public const string ChangedAccount = "La cuenta cambió. Vuelve a abrir la conversación.";

    /// <c>chat.type instanceof ChatTypeSupergroup</c> de los dos métodos (<c>NativeBridge.java:1891</c> y
    /// <c>:1892</c>). En Windows el canal y el supergrupo comparten la forma <c>Kind.Channel</c> —TDLib guarda el
    /// canal dentro de <c>ChatTypeSupergroup</c> con <c>isChannel</c>— y el básico y el uno a uno se niegan, que es
    /// justo al revés que en <c>chat.info</c>, donde un básico sí tiene nombre que editar.
    public static bool Supported(DesktopMembership.Kind kind) => kind == DesktopMembership.Kind.Channel;

    /// <c>grantedAdminRight(actor,"canChangeInfo")</c> (<c>NativeBridge.java:1893</c>), leído con la tabla que ya
    /// pintó los derechos de la lista de miembros: creador o administrador con la bandera <c>change_info</c>. No se
    /// añade ningún derecho propio: el que faltaba aquí es el que Telegram no da, y eso se dice, no se escribe.
    public static bool CanChange(DesktopGroupMembers.Actor actor) => actor.Granted("change_info");

    /// <c>session.supergroup(id)</c> de <c>NativeBridge.java:1891</c>: si el objeto cacheado ya trae nombres, Android
    /// responde sin preguntar; si no los trae, hace un <c>GetSupergroup</c>. Aquí es la misma decisión y la misma
    /// causa: un peer recortado (<c>flags.min</c>) no sabe nada de nombres, y un peer sin ninguna de las dos banderas
    /// tampoco.
    public static bool Known(ChatBase? peer) => peer is Channel channel
        && (channel.flags & Channel.Flags.min) == 0
        && ((Has(channel.flags2, Channel.Flags2.has_usernames) && channel.usernames != null)
            || Has(channel.flags, Channel.Flags.has_username));

    /// La lista <c>active</c> del DTO: los nombres marcados como activos, en el orden en que Telegram los devolvió
    /// (<c>sendChatUsername</c>, <c>NativeBridge.java:1892</c>, recorre <c>names.activeUsernames</c> sin reordenar). Con
    /// vector, esa es la respuesta y el campo suelto no se consulta; sin vector, el nombre principal es el único que
    /// hay.
    public static string[] Active(ChatBase? peer)
    {
        if (peer is not Channel channel) return Array.Empty<string>();
        if (Has(channel.flags2, Channel.Flags2.has_usernames)) return DesktopAccountProfile.ActiveUsernames(channel.usernames);
        return Legacy(peer);
    }

    /// La clave <c>editable</c> del DTO: <c>names.editableUsername</c> de <c>sendChatUsername</c>
    /// (<c>NativeBridge.java:1892</c>), que es la marca <c>editable</c> del vector. Sin vector, lo editable es el
    /// nombre principal, porque <c>channels.updateUsername</c> cambia exactamente ese —y lo que la pantalla prellena
    /// con <c>initial</c> es el nombre que se está reemplazando, no un adorno—.
    public static string Editable(ChatBase? peer)
    {
        if (peer is not Channel channel) return "";
        if (Has(channel.flags2, Channel.Flags2.has_usernames)) return DesktopAccountProfile.EditableUsername(channel.usernames);
        return Legacy(peer).FirstOrDefault() ?? "";
    }

    /// Las dos caras de la misma cadena vacía: <c>MainUsername</c> puede venir nula, y el puente de Android convierte
    /// el nulo en <c>""</c> antes de meterlo en el JSON (<c>NativeBridge.java:1892</c>).
    private static string[] Legacy(ChatBase? peer)
    {
        var main = peer?.MainUsername;
        return string.IsNullOrEmpty(main) ? Array.Empty<string>() : new[] { main };
    }

    /// <summary>
    /// El espejo local de lo que Telegram acaba de aceptar, para que la siguiente lectura y la ficha digan lo mismo
    /// que el botón que se acaba de pulsar. Escribes sobre lo que la respuesta prometió: con vector se mueve la
    /// entrada marcada como <c>editable</c> —o se añade, si el canal no tenía ninguna— y sin vector se mueve el campo
    /// suelto con su bandera, que es la forma de decir «ya no hay enlace público» sin dejar un texto huérfano.
    /// </summary>
    /// <remarks>
    /// Los dos campos se mueven siempre juntos, y la medida lo exige: sobre WTelegramClient 4.4.10,
    /// <c>Channel.MainUsername</c> lee el <b>legado</b> (<c>username</c> con <c>has_username</c>) haga lo que haga el
    /// vector, y es ese valor —no el del DTO— el que la bandeja ya usa para la fila
    /// (<c>TelegramService.cs:3834</c>) y para el rótulo «@nombre» (<c>TelegramService.cs:3874</c>). Actualizar solo el vector dejaría
    /// la pantalla del chat con el nombre viejo mientras la pregunta de <c>chat.username</c> respondería el nuevo,
    /// que es justo la incoherencia que la ronda AE decidió no dejar nunca más en el andamio.
    /// </remarks>
    public static void Apply(ChatBase? peer, string username)
    {
        if (peer is not Channel channel) return;
        var value = username ?? "";
        channel.username = value;
        channel.flags = value.Length == 0
            ? channel.flags & ~Channel.Flags.has_username
            : channel.flags | Channel.Flags.has_username;
        if (!Has(channel.flags2, Channel.Flags2.has_usernames)) return;
        var names = (channel.usernames ?? Array.Empty<Username>()).Where(name => name != null).ToList();
        var target = names.FirstOrDefault(name => (name.flags & Username.Flags.editable) != 0);
        if (target is not null)
        {
            // TDLib lo advierte en el propio campo (`TdApi.java:155940`): el nombre no se puede quitar del todo si
            // queda otro activo o apagado. Quién lo dice es Telegram, no este espejo; aquí solo se aplica lo que ya
            // pasó, y si la lista se queda vacía es porque Telegram lo consintió.
            if (value.Length == 0) names.Remove(target);
            else target.username = value;
        }
        else if (value.Length > 0)
        {
            names.Add(new Username { flags = Username.Flags.editable | Username.Flags.active, username = value });
        }
        channel.usernames = names.ToArray();
    }

    /// La marca de presencia de un campo: en MTProto un nombre público existe si el peer avisa de que lo trae.
    private static bool Has(Chat.Flags flags, Chat.Flags present) => (flags & present) != 0;

    private static bool Has(Channel.Flags flags, Channel.Flags present) => (flags & present) != 0;

    private static bool Has(Channel.Flags2 flags, Channel.Flags2 present) => (flags & present) != 0;

    /// Las dos claves del DTO de Android, en el orden de <c>sendChatUsername</c> (<c>NativeBridge.java:1892</c>):
    /// primero <c>editable</c> y después <c>active</c>.
    public static object Dto(ChatBase? peer) => new
    {
        editable = Editable(peer),
        active = Active(peer)
    };

    /// El rechazo que Telegram dijo con una palabra que este flujo sí conoce, o <c>null</c> para que viajee su texto.
    public static string? Refusal(string? error) => DesktopAccountProfile.UsernameRefusal(error);
}
