using System.IO;
using System.Text.Json;
using TL;
using WTelegram;

namespace WRGram.Desktop;

/// <summary>
/// El cable de <c>chat.photo.pick</c> en Windows: selector, recorte, ventana de confirmar y escritura por MTProto.
/// Las reglas y las frases están en <see cref="DesktopChatPhoto"/>; aquí no se vuelve a escribir ninguna.
/// <para>
/// El orden es el de <c>chatPhotoPick</c> (<c>NativeBridge.java:1737-1745</c>) y su continuación
/// <c>pickedChatPhoto</c> (<c>:1745-1753</c>): forma, derecho, selector, preparación, mirada de cuenta, confirmar,
/// mirada de cuenta otra vez y escritura. Las dos son las de <c>currentAccount</c> en <c>:1751</c> y <c>:1760</c>, y
/// hacen el mismo trabajo que en Android: entre elegir el archivo y pulsar «Establecer foto» puede haber cambiado la
/// sesión, y la foto no debe escribirse nunca en una comunidad que la persona no tenía delante.
/// </para>
/// <para>
/// El descarte de la imagen, el recorte de 640 y el JPEG a calidad 88 son los de la foto de perfil, sin una línea
/// nueva: <see cref="PreparePhoto"/> es el <c>preparePhoto</c> de Android (<c>:1690-1707</c>) y la única diferencia
/// entre las dos carpetas temporales que allá se separan es que aquí no hay archivo temporal que separar.
/// </para>
/// <para>
/// Lo que cambia es la escritura. TDLib tiene un solo <c>SetChatPhoto</c> para las tres formas; MTProto tiene dos
/// peticiones —<c>channels.editPhoto</c> y <c>messages.editChatPhoto</c>— y la forma del peer decide cuál, igual que
/// en el título de la comunidad. Y hay una tercera posibilidad que no existe aquí: borrar. <c>TL.InputChatPhotoBase</c>
/// no tiene vacío, así que <c>chat.photo.delete</c> se niega con la causa concreta en el despacho, no en este cable.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>chat.photo.pick</c> (<c>NativeBridge.java:546</c>). Cancelar en el selector responde <c>false</c>, como
    /// Android (<c>:1746</c>); establecerla responde <c>true</c>, y ninguna de las dos cosas es un error.
    /// </summary>
    private async Task<object?> ChatPhotoPickAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User!.id;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopCommunityInfo.Supported(kind)) throw new BridgeException(DesktopChatPhoto.Unsupported);
        if (!DesktopCommunityInfo.CanChange(_chats.GetValueOrDefault(Number(entry))))
            throw new BridgeException(DesktopCommunityInfo.NoRight);
        var chosen = ChoosePhoto(DesktopChatPhoto.PickFile);
        if (chosen == null) return false;
        var prepared = PreparePhoto(chosen);
        if (CollectionClient().User!.id != owner) throw new BridgeException(DesktopChatPhoto.ChangedAccount);
        if (!ConfirmPhoto(DesktopChatPhoto.PickTitle, DesktopChatPhoto.PickBody, DesktopChatPhoto.PickAccept, prepared.Preview)) return false;
        if (CollectionClient().User!.id != owner) throw new BridgeException(DesktopChatPhoto.ChangedAccount);
        var uploaded = await client.UploadFileAsync(new MemoryStream(prepared.Jpeg), "comunidad.jpg");
        var photo = new InputChatUploadedPhoto { flags = InputChatUploadedPhoto.Flags.has_file, file = uploaded };
        if (kind == DesktopMembership.Kind.Basic)
            await client.Invoke(new TL.Methods.Messages_EditChatPhoto { chat_id = BasicId(entry), photo = photo });
        else
            await client.Invoke(new TL.Methods.Channels_EditPhoto { channel = ChannelInput(entry), photo = photo });
        await RefreshChatPhotoAsync(client, entry, kind);
        return true;
    }

    /// <summary>
    /// Renueva la foto de la fila. Después de escribir, la caché del host sigue diciendo la imagen vieja, y el
    /// archivo cacheado en disco vive bajo una clave que no cambia (<c>photo:g&lt;id&gt;</c> en
    /// <c>MediaRegistry.cs</c>), así que hay que olvidar el bytes viejo antes de volver a registrar: sin el
    /// <c>Forget</c> la pantalla seguiría enseñando la foto anterior para siempre, que es exactamente lo que la
    /// ronda AU descubrió con la foto de la cuenta.
    /// <para>
    /// La lectura es <c>getFullChannel</c>/<c>getFullChat</c>, la misma que ya usaba la ronda AW y que trae el peer
    /// renovado dentro de su propia respuesta; no se confía en el <c>Updates</c> que contesta la escritura, porque
    /// Telegram puede responder <c>updateShort</c>, que no lleva lista de chats.
    /// </para>
    /// </summary>
    private async Task RefreshChatPhotoAsync(Client client, ChatEntry entry, DesktopMembership.Kind kind)
    {
        var page = await ReadFullAsync(client, entry, kind);
        if (page?.chats != null) MergePeers(null, page.chats.Values);
        var peer = Renewed(page, entry) ?? _chats.GetValueOrDefault(Number(entry));
        _media.Forget(entry.Id);
        var photo = peer == null ? null : _media.RegisterProfile(peer, peer.Photo != null, entry.Id, entry.Title);
        entry.Photo = photo;
        foreach (var row in _state.Chats)
            if (row.Id == entry.Id) row.Photo = photo;
        Push();
    }
}
