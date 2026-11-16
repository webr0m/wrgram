namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de los permisos predeterminados de una comunidad: <c>groups.permissions.get</c>
/// (<c>NativeBridge.java:576</c> → <c>groupPermissions</c>, <c>:1868</c>) y <c>groups.permissions.set</c>
/// (<c>:577</c> → <c>setGroupPermissions</c>, <c>:2376</c>). Las reglas, la tabla de banderas y las frases están en
/// <see cref="DesktopGroupPermissions"/>; aquí está el cable, que era lo que faltaba: las dos órdenes llevan desde la
/// ronda A en la lista del puente (<c>BridgePolicy.java:25</c>) y la pantalla las pide desde la ronda Q —la entrada
/// «Permisos predeterminados» del panel lateral (<c>App.tsx:1164</c>, sin guarda de plataforma)—, pero en Windows
/// caían en el <c>_ =&gt; throw</c> genérico dando a entender que faltaba una petición cuando las dos existen.
/// <para>
/// El orden de la escritura es el de <c>:2376</c> línea por línea: la forma, las dieciséis casillas, la pregunta por
/// el propio participante, el derecho, la ventana de confirmar, la mirada de cuenta y solo entonces la tabla nueva.
/// No es cosmético: si el derecho se mirara antes que el mensaje, un panel mal formado en un chat que no se
/// administraría enseñaría el «no tienes permiso» en lugar del fallo que acaba de ocurrir.
/// </para>
/// <para>
/// La lectura sí necesita una ida a la red que Android no hace, y es la única diferencia de verdad entre las dos
/// capas. Allá la tabla vive en el <c>TdApi.Chat</c> que TDLib ya tiene, y el único viaje es el
/// <c>GetChatMember</c> de la guarda (<c>:1868</c>). Aquí la tabla viene con el <c>TL.Channel</c>, y la lista de
/// conversaciones no siempre lo trae con <c>has_default_banned_rights</c>: si la caché no la trae, se pide el
/// <c>full info</c> una vez, se fusiona el peer y se vuelve a mirar. Fallar con la frase de Android —«Telegram aún no
/// cargó los permisos predeterminados.»— sigue siendo la última palabra, igual que allá, pero después de intentarlo,
/// no antes.
/// </para>
/// <para>
/// Las guardas de cuenta son las pasadas del <c>perform</c> de <c>:475</c> envueltas alrededor de cada respuesta, más
/// la que el propio handler del botón escribe antes de tocar Telegram. Después del <c>Updates</c> no queda más que
/// mover el espejo (<see cref="DesktopGroupPermissions.Apply"/>): la respuesta puede ser un <c>updateShort</c> sin
/// lista de chats, así que aprender el estado nuevo de la respuesta no es una opción en esta capa.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>groupPermissions</c> (<c>:1868</c>). La forma se niega con <see cref="DesktopGroupPermissions.Unsupported"/>,
    /// el derecho se pregunta vivo como allá y la tabla se lee del peer, de la caché si viene y del
    /// <c>full info</c> si no. El <c>catch</c> de Android (<c>:1868</c>, «No se pudieron cargar los permisos
    /// actuales.») cubre un fallo armando el JSON, y aquí el JSON se arma desde un diccionario ya validado: no hay
    /// nada que atrapar, así que esa frase no se copia.
    /// </summary>
    private async Task<object?> GroupPermissionsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopGroupPermissions.Supported(kind)) throw new BridgeException(DesktopGroupPermissions.Unsupported);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, ChannelInput(entry)));
        // La pasada del `perform` de `:1868` sobre el `GetChatMember`: la respuesta es de la sesión que la pidió.
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);
        if (!actor.CanRestrict) throw new BridgeException(DesktopGroupPermissions.NoRight);
        var id = Number(entry);
        var rights = DesktopGroupPermissions.Stored(_chats.GetValueOrDefault(id));
        if (rights is null)
        {
            var page = await ReadFullAsync(client, entry, kind);
            MergePeers(page?.users?.Values, page?.chats?.Values);
            if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);
            rights = DesktopGroupPermissions.Stored(Renewed(page, entry) ?? _chats.GetValueOrDefault(id));
        }
        if (rights is null) throw new BridgeException(DesktopGroupPermissions.Unreadable);
        return DesktopGroupPermissions.Dto(rights);
    }

    /// <summary>
    /// <c>setGroupPermissions</c> (<c>:2376</c>). <c>false</c> es el <c>answer.ok(false)</c> del botón
    /// <c>Cancelar</c> y del <c>setOnCancelListener</c> de Android: la pantalla ya sabe traducirlo por «en Telegram no
    /// ha cambiado nada», así que cancelar no es un error aquí tampoco.
    /// </summary>
    private async Task<object?> SetGroupPermissionsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopGroupPermissions.Supported(kind)) throw new BridgeException(DesktopGroupPermissions.Required);
        var values = PermissionValues(args);
        if (!DesktopGroupPermissions.Complete(values)) throw new BridgeException(DesktopGroupPermissions.Incomplete);
        var actor = DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, ChannelInput(entry)));
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);
        if (!actor.CanRestrict) throw new BridgeException(DesktopGroupPermissions.NoRight);
        if (!ConfirmPermissions()) return false;
        // La guarda que el propio handler del botón positivo escribe en `:2376` antes de tocar TDLib: entre la
        // ventana y la escritura la persona pudo cambiar de cuenta, y escribir los permisos de la cuenta anterior
        // desde la sesión nueva es justo lo que esa frase promete impedir.
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);
        var id = Number(entry);
        var rights = DesktopGroupPermissions.Written(DesktopGroupPermissions.Stored(_chats.GetValueOrDefault(id)), values);
        try
        {
            await client.Messages_EditChatDefaultBannedRights(entry.Input, rights);
        }
        catch (RpcException rpc)
        {
            var refusal = DesktopGroupPermissions.Refusal(rpc.Message);
            if (refusal == null) throw;
            throw new BridgeException(refusal);
        }
        // La segunda pasada del `perform`, la que envuelve la escritura: Android la aplica antes del `schedule()` y
        // del `answer.ok(true)`, así que el espejo local tampoco se mueve si la sesión cambió a mitad del viaje.
        if (client.User?.id != owner) throw new BridgeException(DesktopGroupPermissions.ChangedAccount);
        DesktopGroupPermissions.Apply(_chats.GetValueOrDefault(id), rights);
        return true;
    }

    /// Los dieciséis <c>requiredBool</c> de <c>:2376</c> sobre el objeto <c>permissions</c>. Una clave que no viene, o
    /// que viene con otro tipo, no se convierte en <c>false</c>: se queda fuera del diccionario y la
    /// <see cref="DesktopGroupPermissions.Complete"/> lo nota. Es lo que Android hace cuando el <c>opt</c> no devuelve
    /// un <c>Boolean</c>; lo que cambia es que aquí el hueco se dice en español y no por el despacho genérico.
    private static Dictionary<string, bool> PermissionValues(JsonElement args)
    {
        var values = new Dictionary<string, bool>();
        if (args.ValueKind != JsonValueKind.Object
            || !args.TryGetProperty("permissions", out var block)
            || block.ValueKind != JsonValueKind.Object)
            return values;
        foreach (var field in DesktopGroupPermissions.Fields)
        {
            if (!block.TryGetProperty(field.Key, out var raw)) continue;
            if (raw.ValueKind is JsonValueKind.True or JsonValueKind.False) values[field.Key] = raw.GetBoolean();
        }
        return values;
    }

    /// El <c>Dialogs.builder</c> de <c>:2376</c>, hecho con la ventana que el host ya levanta para los otros dos
    /// guardados: el preview nulo porque aquí no hay imagen que mostrar, el rótulo de «Cancelar» es el de la propia
    /// ventana compartida y el cierre por la equis vale lo mismo que el <c>setOnCancelListener</c> de Android. No se
    /// escribe una segunda ventana porque no hay nada que cambiarle salvo el texto y el botón positivo.
    private static bool ConfirmPermissions() =>
        ConfirmPhoto(DesktopGroupPermissions.DialogTitle, DesktopGroupPermissions.DialogBody,
            DesktopGroupPermissions.DialogAccept, null);
}
