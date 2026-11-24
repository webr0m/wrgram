namespace WRGram.Desktop;

using System;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable del nombre público de una comunidad: <c>chatUsername</c> (<c>NativeBridge.java:1914</c>, despachado en
/// <c>:595</c>) y <c>setChatUsername</c> (<c>:1916</c>, despachado en <c>:596</c>).
/// Las reglas y las frases están en <see cref="DesktopChatUsernames"/>; aquí solo está el cable, que era lo que
/// faltaba: las dos órdenes llevaban desde la ronda A cayendo en el <c>_ =&gt; throw</c> genérico del host
/// (<c>TelegramService.cs:513</c>, «No disponible en escritorio (beta): chat.username»), mientras las dos peticiones
/// de MTProto —<c>channels.getChannels</c> y <c>channels.updateUsername</c>— llevan todo ese tiempo existiendo en la
/// librería. La pantalla tampoco llegaba: la entrada vive en <c>chatInfo</c> de Android (<c>App.tsx:808</c> y
/// <c>:1146</c>) y la hoja de opciones de escritorio se corta antes, así que esta ronda añade también el botón, que
/// es la norma que fijó la ronda AK —ninguna opción que la interfaz ofrece puede caer en el aviso de beta—.
/// <para>
/// El orden de la escritura es el de <c>setChatUsername</c> (<c>NativeBridge.java:1916</c>) línea por línea: la forma
/// del chat, el tope y la forma del texto, el recorte, la pregunta por el propio participante, el derecho
/// <c>canChangeInfo</c> y solo entonces la escritura.
/// No es cosmético: si el derecho se mirara antes que el texto, escribir un nombre de cuarenta caracteres en un chat
/// que no se administra enseñaría el «no tienes permiso» en lugar del exceso que la persona acaba de cometer, y las
/// dos cosas se arreglan de otra manera.
/// </para>
/// <para>
/// La lectura replica la decisión de caché de <c>chatUsername</c> (<c>NativeBridge.java:1914</c>)
/// —<c>session.supergroup(id)</c> y, si no sabe nombres, <c>GetSupergroup</c>— con la diferencia de petición, no de
/// norma: MTProto no tiene una pregunta por un peer suelto, y lo que existe es <c>channels.getChannels</c> con un
/// vector de un solo elemento, que responde <c>Messages_Chats</c> con el <c>TL.Channel</c> completo. La respuesta se
/// fusiona en la caché del host antes de responder, para que la ficha del chat y la bandeja vean el mismo peer que
/// acaba de ver este flujo.
/// </para>
/// <para>
/// Los dos <c>perform</c> de Android (<c>NativeBridge.java:488</c>) envuelven cada paso asíncrono con la guarda de
/// cuenta, y aquí esa
/// guarda tiene el mismo sitio: se compara el identificador de la sesión antes de preguntar y después de cada
/// respuesta. No es un adorno: entre la pregunta por el participante y <c>channels.updateUsername</c> el host puede
/// haber cambiado de cuenta, y escribir el nombre de un canal de la cuenta anterior desde la sesión nueva es justo
/// lo que esa frase de Android promete impedir. Después del <c>true</c> de Telegram no queda más que mover el
/// espejo local (<see cref="DesktopChatUsernames.Apply"/>) y la fila de la bandeja, porque la respuesta de
/// <c>channels.updateUsername</c> es un <c>Bool</c> y en esta capa no existe ningún <c>channels.ChannelLink</c> del
/// que aprender el nombre nuevo.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>chatUsername</c> (<c>NativeBridge.java:1914-1915</c>): la forma del chat se niega con
    /// <see cref="DesktopChatUsernames.Unsupported"/>, el resto es leer el peer —de la caché si sabe nombres, de
    /// <c>channels.getChannels</c> si no— y pasarlo por <see cref="DesktopChatUsernames.Dto"/>, que arma las dos claves
    /// del DTO de Android en su orden.
    /// </summary>
    private async Task<object?> ChatUsernameAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopChatUsernames.Supported(kind)) throw new BridgeException(DesktopChatUsernames.Unsupported);
        var id = Number(entry);
        var cached = _chats.GetValueOrDefault(id);
        if (DesktopChatUsernames.Known(cached)) return DesktopChatUsernames.Dto(cached);
        var answer = await client.Channels_GetChannels(new InputChannelBase[] { ChannelInput(entry) });
        MergePeers(null, answer.chats?.Values);
        // El `perform` de `NativeBridge.java:1914`: la respuesta es de la sesión que la pidió, y si la sesión ya no es
        // esa, el dato
        // tampoco sirve. Android lo dice con esta misma cadena antes de meter el resultado en el JSON.
        if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);
        return DesktopChatUsernames.Dto(_chats.GetValueOrDefault(id));
    }

    /// <summary>
    /// <c>setChatUsername</c> (<c>NativeBridge.java:1916</c>). Los dos guardajes de formato son los mismos que ya
    /// midieron la ronda AT
    /// con <c>account.username</c> —<see cref="DesktopAccountProfile.UsernameProblem"/> y su
    /// <see cref="DesktopAccountProfile.Username"/>—, porque <c>BridgePolicy.text(p,"username",32)</c> más el
    /// <c>matches("[A-Za-z][A-Za-z0-9_]{4,31}")</c> son idénticos en los dos flujos y una norma no se declara dos
    /// veces. La cadena vacía sigue siendo legítima: es la forma de quitar el nombre.
    /// </summary>
    private async Task<object?> SetChatUsernameAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopChatUsernames.Supported(kind)) throw new BridgeException(DesktopChatUsernames.Unsupported);
        var raw = Raw(args, "username");
        var problem = DesktopAccountProfile.UsernameProblem(raw);
        if (problem != null) throw new BridgeException(problem);
        var username = DesktopAccountProfile.Username(raw!);
        var input = ChannelInput(entry);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, input));
        if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);
        if (!DesktopChatUsernames.CanChange(actor)) throw new BridgeException(DesktopChatUsernames.NoRight);
        try
        {
            await client.Channels_UpdateUsername(input, username);
        }
        catch (RpcException rpc)
        {
            // Los cuatro rechazos que Telegram dice con nombre propio se traducen; el resto viaja tal cual, por la
            // misma razón que en `account.username`: una causa inventada para un código no medido engaña más.
            var refusal = DesktopChatUsernames.Refusal(rpc.Message);
            if (refusal == null) throw;
            throw new BridgeException(refusal);
        }
        // La segunda pasada del `perform` de `NativeBridge.java:1916`, la que envuelve el `SetSupergroupUsername`:
        // Android la aplica
        // antes de hacer el `schedule()` y el `answer.ok(true)`, así que el espejo local tampoco se mueve si la
        // sesión cambió a mitad de la escritura.
        if (client.User?.id != owner) throw new BridgeException(DesktopChatUsernames.ChangedAccount);
        var id = Number(entry);
        DesktopChatUsernames.Apply(_chats.GetValueOrDefault(id), username);
        entry.Username = username.Length == 0 ? null : username;
        foreach (var row in _state.Chats) if (row.Id == entry.Id) row.Username = username.Length == 0 ? null : username;
        return true;
    }
}
