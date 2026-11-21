namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using TL;

/// <summary>
/// Las historias convertidas al contrato que ya usa Android (ronda BZ). El otro lado es
/// <c>NativeBridge.chatStories</c> (<c>NativeBridge.java:366-372</c>), <c>NativeBridge.openStory</c>
/// (<c>NativeBridge.java:428-429</c>) y <c>NativeBridge.openSharedStory</c> (<c>NativeBridge.java:382-393</c>); la
/// pantalla es la misma en las dos capas (<c>App.tsx:248-295</c>), así que las claves que salen de aquí son exactamente
/// las de <c>ActiveStory</c> y <c>OpenStory</c> en <c>contract.ts:58-59</c>, sin añadir ninguna y sin quitar ninguna.
/// <para>
/// El emparejamiento está medido sobre WTelegramClient 4.4.10 por reflexión. TDLib da por cada historia activa un
/// <c>StoryInfo{id,date,isForCloseFriends,isLive}</c>; MTProto da un <c>StoryItem</c> con <c>id</c>, <c>date</c> y la
/// bandera <c>close_friends</c> (valor 256 de <c>StoryItem.Flags</c>). <b>No hay bandera de directa</b> en
/// <c>StoryItem</c>: los diecisiete nombres que la librería genera para ese flags son
/// <c>has_caption, has_entities, has_privacy, has_views, pinned, public_, close_friends, min, noforwards, edited,
/// contacts, selected_contacts, has_media_areas, has_sent_reaction, out_, has_fwd_from, has_from_id, has_albums,
/// has_music</c>, y ninguna dice «está emitiendo ahora». Por eso <c>live</c> sale siempre en falso: es la única forma
/// de cumplir el contrato sin inventar un estado, y la limitación va escrita en el registro en lugar de callada.
/// </para>
/// <para>
/// De las diez claves de <c>OpenStory</c>, cuatro son mandos de escritura —<c>canEdit</c>, <c>canDelete</c>,
/// <c>canToggleProfile</c>, <c>canArchive</c>— y las cuatro salen en falso. No es que Telegram no las permita: es que
/// los brazos que las obedecen (<c>story.edit.caption</c>, <c>story.delete</c>, <c>story.profile.toggle</c>,
/// <c>story.albums.add</c>) siguen sin cable en este host, y un <c>true</c> aquí pintaría en la pantalla un botón que
/// se estrellaría contra el rechazo genérico. La pantalla los gatingea uno a uno
/// (<c>App.tsx:291</c>, <c>{story.canEdit&&…}</c>), así que el falso es la respuesta honesta: enseña solo lo que de
/// verdad funciona. Las otras seis sí viajan medidas: <c>id</c>, <c>chatId</c>, <c>posterChatId</c>, <c>caption</c>,
/// <c>media</c> e <c>isPostedToChatPage</c>, esta última sacada de la bandera <c>pinned</c> del propio
/// <c>StoryItem</c> —que en el esquema de MTProto es «fijada a la página del perfil», el mismo hecho que TDLib llama
/// <c>isPostedToChatPage</c>—.
/// </para>
/// <para>
/// Los ids de chat no son la misma cadena en las dos capas y no hace falta que lo sean: Android escribe ids numéricos
/// de TDLib, este host escribe los suyos con prefijo —<c>TelegramService.cs:3788</c> para <c>u</c>,
/// <c>TelegramService.cs:3805</c> para <c>g</c>, <c>TelegramService.cs:3818</c> para <c>c</c>— porque es la clave con
/// la que <c>RequireEntry</c> los vuelve a encontrar. Por eso
/// <c>chatId</c> lleva el id de la fila tal como lo conoce este puente, y <c>posterChatId</c> el número suelto del
/// peer, que es lo que la pantalla compara con <c>selfId</c> para decidir si la historia es de quien escribe.
/// </para>
/// </summary>
public static class DesktopStories
{
    /// <c>NativeBridge.java:429</c>, carácter a carácter: la respuesta de Telegram que este host no sabe pintar.
    public const string NoMedia = "Este formato de historia todavía no está disponible.";

    /// <c>NativeBridge.java:385</c> y <c>NativeBridge.java:390</c>: la historia que ya no está, sea porque el mensaje
    /// dejó de ser una historia compartida, sea porque <c>stories.getStoriesByID</c> contesta sin fila.
    public const string Gone = "Esta historia ya no está disponible.";

    /// El techo con el que Android recorta el pie al abrirla (<c>NativeSnapshot.limit(story.caption.text,1000)</c>
    /// en <c>NativeBridge.java:429</c>), y el mismo recorte con puntos suspensivos que usa el resto del host.
    public const int CaptionLimit = 1000;

    /// Los dos nombres que <c>NativeSnapshot.storyMedia</c> pone al archivo (<c>NativeSnapshot.java:425</c> y
    /// <c>NativeSnapshot.java:426</c>). No son decoración: entran en la lista de descargas y en el nombre que se guarda.
    public const string PhotoName = "Historia";
    public const string VideoName = "Video de historia";

    /// La bandera <c>close_friends</c> de <c>StoryItem</c>, que es el <c>isForCloseFriends</c> de TDLib.
    public static bool CloseFriends(StoryItem item) => (item.flags & StoryItem.Flags.close_friends) != 0;

    /// La bandera <c>pinned</c>: fijada a la página del perfil. Es el <c>isPostedToChatPage</c> de
    /// <c>TdApi.Story</c>, no un invento de esta capa.
    public static bool Posted(StoryItem item) => (item.flags & StoryItem.Flags.pinned) != 0;

    /// La bandera <c>noforwards</c> de <c>StoryItem</c>, la misma contra la que el host apaga el reenvío en las filas
    /// del historial. Aquí manda solo sobre «guardar archivo»: la historia se ve igual.
    public static bool ForbidsExport(StoryItem item) => (item.flags & StoryItem.Flags.noforwards) != 0;

    /// La bandera <c>viaMention</c> de <c>MessageExtras.java:85</c> —<c>put("kind","story").put("mention", …)</c>— es
    /// la <c>via_mention</c> de <c>MessageMediaStory</c>: la historia no la compartió quien escribe, es que lo
    /// mencionaron en ella.
    public static bool Mention(MessageMediaStory story) => (story.flags & MessageMediaStory.Flags.via_mention) != 0;

    public static string Caption(StoryItem item) => DesktopContact.Limit(item.caption ?? "", CaptionLimit);

    /// La lista de la bandeja. Las tres variantes que MTProto puede meter en <c>PeerStories.stories</c> se tratan
    /// distinto y por escrito: <c>StoryItem</c> trae todo, <c>StoryItemSkipped</c> solo <c>id</c> y <c>date</c>
    /// —Telegram la reserva para huecos cuya media no se manda a esta cuenta— y <c>StoryItemDeleted</c> no entra:
    /// Android tampoco lista una historia que el propio servidor dice que ya no existe, y una fila que se niega al
    /// pincharla es justo lo que esta casa llama control muerto.
    public static List<ActiveStoryDto> Active(StoryItemBase[]? stories)
    {
        var rows = new List<ActiveStoryDto>();
        if (stories == null) return rows;
        foreach (var entry in stories)
        {
            switch (entry)
            {
                case StoryItem item:
                    rows.Add(new ActiveStoryDto
                    {
                        Id = item.id,
                        Date = TelegramService.Unix(item.date),
                        CloseFriends = CloseFriends(item),
                    });
                    break;
                case StoryItemSkipped skipped:
                    rows.Add(new ActiveStoryDto { Id = skipped.id, Date = TelegramService.Unix(skipped.date) });
                    break;
            }
        }
        return rows;
    }

    /// La respuesta de <c>story.open</c>, con las seis claves medidas y los cuatro mandos de escritura en falso.
    public static OpenStoryDto Open(StoryItem item, MediaDto media, string chatId, string posterChatId) => new()
    {
        Id = item.id,
        ChatId = chatId,
        PosterChatId = posterChatId,
        Caption = Caption(item),
        Media = media,
        IsPostedToChatPage = Posted(item),
        CanEdit = false,
        CanDelete = false,
        CanToggleProfile = false,
        CanArchive = false,
    };

    /// El número suelto del peer, sin el prefijo con el que este puente nombra sus chats: es la forma con la que la
    /// pantalla puede comparar con <c>selfId</c>, que también va sin prefijo (<c>TelegramService.cs:588</c>).
    public static string IdOf(Peer? peer) => peer switch
    {
        PeerUser user => user.user_id.ToString(),
        PeerChat chat => chat.chat_id.ToString(),
        PeerChannel channel => channel.channel_id.ToString(),
        _ => "",
    };

    /// La media de una historia, en las tres formas en que MTProto la manda. <c>null</c> es «formato que este host no
    /// pinta», y el brazo lo traduce por <see cref="NoMedia"/> —la misma salida que Android saca cuando el contenido
    /// no es ni foto ni vídeo (<c>NativeSnapshot.java:423-427</c>). Los dos nombres son los de esas dos líneas de
    /// Android, y el archivo entra en el registro con la <c>exportable</c> que decidió el brazo: en las historias de
    /// MTProto el nombre no lo lleva el documento, lo lleva la capa.
    public static MediaDto? MediaOf(StoryItem item, MediaRegistry media, bool exportable) => item.media switch
    {
        MessageMediaPhoto { photo: Photo photo } => media.RegisterPhoto(photo, PhotoName, exportable),
        MessageMediaPhoto { video: Document video } => media.RegisterDocument(video, exportable, VideoName),
        MessageMediaDocument { document: Document document } => media.RegisterDocument(document, exportable, VideoName),
        _ => null,
    };
}
