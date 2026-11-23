namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de las historias en Windows (ronda BZ): <c>chat.stories</c> y <c>story.open</c> para leer,
/// <c>message.story.open</c> para la que llega compartida en un mensaje y <c>story.close</c> para cerrar el visor.
/// Las cuatro llevaban en el puente de Android desde <c>BridgePolicy.java</c> y se atienden en
/// <c>NativeBridge.java:693</c>, <c>NativeBridge.java:696</c>, <c>NativeBridge.java:697</c> y
/// <c>NativeBridge.java:700</c>; en este host las cuatro caían en el
/// <c>_ =&gt; throw</c> genérico del despacho, que dice «no disponible en escritorio (beta)» de algo que la librería
/// tiene resuelto: la bandeja es <c>stories.getPeerStories</c> (o <c>stories.getPinnedStories</c> cuando la pantalla
/// pide las del perfil), abrir es <c>stories.getStoriesByID</c> con <c>stories.incrementStoryViews</c>, y cerrar es
/// <c>stories.readStories</c>. Reglas, banderas, nombres y frases, en <see cref="DesktopStories"/>; aquí solo el
/// orden de las peticiones.
/// <para>
/// El orden es el de Android línea por línea donde las dos capas tienen con qué. En <c>NativeBridge.java:428-429</c> es leer la
/// historia, sacar el archivo, recortar el pie y marcarla vista —y por eso aquí la media se registra <b>antes</b> de
/// avisar a Telegram: si el formato no se pinta, la respuesta es <c>NoMedia</c> y la cuenta no queda con una vista
/// contada sobre una historia que no se enseñó—. En <c>NativeBridge.java:366-372</c> es resolver la fila, mirar la forma y una sola
/// petición. Y en <c>NativeBridge.java:382-393</c> es releer el mensaje, comprobar que sigue siendo una historia compartida, sacar el
/// autor y abrir esa y no otra.
/// </para>
/// <para>
/// Tres cosas de Android se quedan fuera, dichas en vez de imitadas. La primera es la guarda del <b>chat secreto</b>
/// (<c>NativeBridge.java:366</c> y <c>NativeBridge.java:378</c>): TDLib los conoce y MTProto no, así que la
/// negativa no tiene dónde caer —aquí un secreto no existe ni en la lista de chats—. La segunda es el
/// <c>openStoryViews</c> de <c>NativeBridge.java:430</c>, el cuaderno local con el que Android devuelve
/// <c>false</c> si se cierra una historia que no se había abierto: la pantalla solo llama
/// a <c>story.close</c> (<c>App.tsx:257</c>) con la respuesta que le dio <c>story.open</c>
/// (<c>App.tsx:268</c>), así que el cuaderno aquí no guarda nada y la orden se contesta con lo que diga Telegram. La
/// tercera es la marca de <b>directa</b>: en
/// <c>StoryItem</c> no hay bandera que la diga y <c>live</c> sale en falso, que es la limitación escrita en
/// <see cref="DesktopStories"/> y en el registro, no un estado inventado para que la pantalla pinte su adorno.
/// </para>
/// <para>
/// Queda una diferencia de fondo que no se puede cerrar con más peticiones: los <b>grupos básicos</b>. MTProto no
/// tiene con qué preguntarle a un <c>InputPeerChat</c> por sus historias —<c>stories.getPeerStories</c> pide usuario o
/// canal—, mientras TDLib contesta cualquier chat no secreto. Aquí la lista de un básico sale vacía, que es lo que la
/// pantalla muestra cuando Telegram no tiene nada que enseñar («{título} no tiene historias visibles para esta
/// cuenta»), y abrir o cerrar una historia de un básico se niega con la frase de la historia que ya no está. Decirlo
/// con un error raro o mandarlo a la red para recibir el rechazo de Telegram sería enseñar un código que no explica
/// nada.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>chatStories</c> (<c>NativeBridge.java:366-372</c>). Las dos ramas son las dos preguntas: <c>posted</c> vale
    /// por las historias fijadas al perfil, con el mismo tope de treinta de <c>NativeBridge.java:367</c>, y lo
    /// contrario por las activas de la bandeja. La guarda de la fila es la de <c>target(p)</c>
    /// (<c>NativeBridge.java:363</c>): si la conversación no está cargada, la orden se niega antes de ir a la red.
    /// Android contesta a las fijadas solo con número y fecha (<c>NativeBridge.java:369</c>); aquí viaja además la
    /// bandera de mejores amigos, que en <c>StoryItem</c> sí está medida —la de directa, no, por lo dicho arriba—, y
    /// la pantalla usa la primera en las dos listas, así que en Windows el escudo aparece también bajo el perfil.
    /// </summary>
    private async Task<object?> ChatStoriesAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Input is InputPeerChat) return new List<ActiveStoryDto>();
        var peer = StoryPeer(entry);
        if (Bool(args, "posted"))
        {
            var pinned = await client.Stories_GetPinnedStories(peer, 0, 30);
            MergePeers(pinned.users?.Values, pinned.chats?.Values);
            return DesktopStories.Active(pinned.stories);
        }
        var page = await client.Stories_GetPeerStories(peer);
        MergePeers(page.users?.Values, page.chats?.Values);
        return DesktopStories.Active(page.stories?.stories);
    }

    /// <summary>
    /// <c>openStory(p, answer)</c> (<c>NativeBridge.java:373-380</c>): la fila, el número de historia y la guarda de que exista. El
    /// <c>storyId&lt;=0</c> de <c>NativeBridge.java:378</c> Android lo tira como <c>IllegalArgumentException</c> sin mensaje; aquí lleva
    /// la frase de la historia que no está, que es lo mismo dicho de una vez.
    /// </summary>
    private async Task<object?> StoryOpenAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        return await OpenStoryAsync(client, entry, StoryId(args));
    }

    /// <summary>
    /// <c>openSharedStory</c> (<c>NativeBridge.java:382-394</c>). Las dos negaciones de Android caen en la misma frase
    /// (<c>NativeBridge.java:385</c> y <c>NativeBridge.java:390</c>): la fila que dejó de ser una historia
    /// compartida y la historia sin autor o sin número. La fila se relee en la red porque este host no guarda
    /// los adjuntos en memoria, igual que en
    /// <see cref="OpenLocationAsync"/>, y el autor se resuelve con los pares que la propia respuesta trae
    /// (<see cref="MergePeers"/>), no con una búsqueda: en MTProto el que publicó viaja dentro del mensaje.
    /// </summary>
    private async Task<object?> SharedStoryOpenAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)Long(args, "id") });
        var row = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == Long(args, "id"));
        if (row?.media is not MessageMediaStory shared || shared.id <= 0 || shared.peer is null)
            throw new BridgeException(DesktopStories.Gone);
        var poster = EntryFromPeer(shared.peer) ?? throw new BridgeException(DesktopStories.Gone);
        return await OpenStoryAsync(client, poster, shared.id);
    }

    /// <summary>
    /// <c>closeStory</c> (<c>NativeBridge.java:430</c>). En TDLib es <c>CloseStory</c>, que deja de contar la visita; en MTProto el
    /// hecho equivalente es <c>stories.readStories</c> con el id de la historia como tope, que es lo que la pantalla
    /// está diciendo cuando cierra el visor.
    /// </summary>
    private async Task<object?> CloseStoryAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Input is InputPeerChat) throw new BridgeException(DesktopStories.Gone);
        await client.Stories_ReadStories(StoryPeer(entry), StoryId(args));
        return true;
    }

    /// <summary>
    /// El cuerpo de <c>openStory(chatId, storyId, answer)</c> (<c>NativeBridge.java:428-429</c>): leer la historia por su número, sacar
    /// el archivo, recortar el pie y marcarla vista. El orden importa por lo dicho arriba —la media antes de la
    /// vista—, y el <c>GetStory(..., false)</c> de <c>NativeBridge.java:429</c> tiene su pareja en <c>stories.getStoriesByID</c>: la
    /// misma historia leída de nuevo en vez de fiarse de la que trajo la lista, porque entre las dos el autor pudo
    /// borrarla.
    /// <para>
    /// Las cuatro marcas de escritura que Android saca de <c>TdApi.Story</c> (<c>canBeEdited</c>, <c>canBeDeleted</c>,
    /// <c>canToggleIsPostedToChatPage</c>, <c>canBeAddedToAlbum</c>) salen en falso: sus brazos
    /// (<c>story.edit.caption</c>, <c>story.delete</c>, <c>story.profile.toggle</c>, <c>story.albums.add</c>) siguen sin
    /// cable aquí y la pantalla gatingea cada botón por una de ellas (<c>App.tsx:294</c>). La que sí está medida es la
    /// publicada en el perfil, bandera <c>pinned</c> del propio <c>StoryItem</c>.
    /// </para>
    /// </summary>
    private async Task<object?> OpenStoryAsync(Client client, ChatEntry entry, int storyId)
    {
        if (entry.Input is InputPeerChat) throw new BridgeException(DesktopStories.Gone);
        var peer = StoryPeer(entry);
        var page = await client.Stories_GetStoriesByID(peer, new[] { storyId });
        MergePeers(page.users?.Values, page.chats?.Values);
        if (page.stories?.FirstOrDefault() is not StoryItem item) throw new BridgeException(DesktopStories.Gone);
        // La misma `noforwards` con la que el host quita el reenvío en las filas del historial, leída ahora del
        // StoryItem: manda sobre «guardar archivo» y no sobre ver la historia.
        var exportable = !DesktopStories.ForbidsExport(item) && !ProtectedChat(entry);
        var media = DesktopStories.MediaOf(item, _media, exportable) ?? throw new BridgeException(DesktopStories.NoMedia);
        await client.Stories_IncrementStoryViews(peer, new[] { storyId });
        return DesktopStories.Open(item, media, entry.Id, DesktopStories.IdOf(item.from_id ?? entry.Peer));
    }

    /// El número de historia, con la guarda de <c>NativeBridge.java:378</c> y la de
    /// <c>NativeBridge.java:389</c>: sin número no hay historia que abrir.
    private static int StoryId(JsonElement args)
    {
        var storyId = Long(args, "storyId");
        if (storyId <= 0 || storyId > int.MaxValue) throw new BridgeException(DesktopStories.Gone);
        return (int)storyId;
    }

    /// El par con el que las tres peticiones de la familia preguntan por una conversación. No hay guarda que inventar:
    /// <see cref="RequireEntry"/> solo devuelve filas que <see cref="EntryFromPeer"/> armó con su <c>Input</c> puesto.
    private static InputPeer StoryPeer(ChatEntry entry) => entry.Input;
}
