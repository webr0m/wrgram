using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using TL;
using WTelegram;

namespace WRGram.Desktop;

public sealed partial class TelegramService : IAsyncDisposable
{
    private sealed class ChatEntry
    {
        public string Id = "";
        public TL.Peer Peer = null!;
        public TL.InputPeer Input = null!;
        public string Title = "";
        public string Type = "private";
        public bool Bot;
        public bool Pinned;
        public bool Archived;
        public bool Marked;
        public bool Muted;
        public int Unread;
        public int ReadInbox;
        public int ReadOutbox;
        public int TopMessage;
        public long Date;
        public bool? Supergroup;
        public bool? IsForum;
        public bool? IsContact;
        public string? Username;
        public string? Draft;
        public MediaDto? Photo;
    }

    private readonly DesktopStore _store;
    private readonly MediaRegistry _media;
    private readonly DesktopState _state;
    private readonly Action _push;
    private readonly Action _appearanceChanged;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly CancellationTokenSource _dispose = new();
    private readonly ConcurrentQueue<UpdatesBase> _updates = new();
    private readonly ConcurrentQueue<Update> _others = new();
    private readonly Dictionary<long, User> _users = new();
    private readonly Dictionary<long, ChatBase> _chats = new();
    private readonly Dictionary<string, ChatEntry> _entries = new();
    private readonly Dictionary<string, Dictionary<int, string>> _textCache = new();

    private Client? _client;
    private string _active = "0";
    private string _mode = "main";
    private int _oldestId;
    private int _newestId;
    private bool _latest;
    private bool _historyEnd;
    private bool _historyDirty;
    private bool _dialogsDirty;
    private DateTime _lastHistoryLoad;
    private DateTime _lastDialogsLoad;

    /// Chat → mensaje fijado que ya confirmamos; `0` es «Telegram dijo que no hay ninguno». Es un caché y no
    /// una lectura: la pantalla pregunta `chat.pinned` cada vez que cambia la ventana, y la petición real
    /// (`getFullChat`) pesa más que la respuesta. La ventana de historial también lo rellena gratis, porque
    /// `Message.Flags.pinned` llega con cada fila.
    private readonly Dictionary<string, int> _pins = new();

    /// Conversaciones de las que ya pedimos la información completa sin encontrar fijado. Sirve para no repetir
    /// el sondeo en cada cambio de ventana cuando la respuesta fue «no hay»; se olvida al fijar, al recibir el
    /// aviso de Telegram y al cerrar la sesión.
    private readonly HashSet<string> _pinProbed = new();

    public TelegramService(DesktopStore store, MediaRegistry media, DesktopState state, Action push, Action appearanceChanged)
    {
        _store = store;
        _media = media;
        _state = state;
        _push = push;
        _appearanceChanged = appearanceChanged;
        _state.Appearance = store.Appearance;
        _state.Consent = store.Consent;
        _media.Changed += Push;
        _ = PumpLoopAsync();
    }

    public Client? Client => _client;

    public async Task InitializeAsync()
    {
        await _gate.WaitAsync();
        try
        {
            if (_store.HasSession)
            {
                try { await ConnectCoreLocked(quiet: true); }
                catch
                {
                    DisposeClientLocked();
                    _state.Ready = false;
                    _state.Auth = "welcome";
                }
            }
            Push();
        }
        finally { _gate.Release(); }
    }

    public async Task<object?> HandleAsync(string method, JsonElement args)
    {
        if (method == "media.load")
        {
            _ = LoadMediaAsync(Long(args, "id"));
            return true;
        }
        if (method == "media.retry") return _media.RetryFailed();

        await _gate.WaitAsync();
        try
        {
            object? result = method switch
            {
                "connect" => await ConnectAsync(),
                "authenticate" => await AuthenticateAsync(Str(args, "value")),
                "auth.register" => await RegisterAsync(args),
                "auth.resend" => throw new BridgeException("El reenvío de código no está disponible en esta beta de escritorio."),
                "authenticate.qr" => throw new BridgeException("El acceso por QR no está disponible en esta beta de escritorio. Usa tu número y el código."),
                "auth.recover.request" or "auth.recover.reset" => throw new BridgeException("La recuperación de la contraseña de dos pasos no está disponible en escritorio."),
                "logout" => await LogoutAsync(),
                "accounts.list" => Accounts(),
                "accounts.add" or "accounts.switch" or "accounts.remove" => throw new BridgeException("La multitarea de cuentas no está disponible en escritorio (beta)."),
                // Las cuatro del perfil propio. Android las atiende desde <c>NativeBridge.java:534</c> y <c>:535-537</c>;
                // aquí las cuatro caían en el <c>_ =&gt; throw</c> genérico y la pantalla de «Mi perfil de Telegram» no
                // tenía ni entrada en el menú de escritorio. Reglas y frases, en <see cref="DesktopAccountProfile"/>.
                "account.profile" => await AccountProfileAsync(),
                "account.name" => await AccountNameAsync(args),
                "account.bio" => await AccountBioAsync(args),
                "account.username" => await AccountUsernameAsync(args),
                // Las dos fotos del mismo menú, ya conectadas en la ronda AU: selector nativo, recorte cuadrado,
                // confirmación con vista previa y escritura por MTProto. Reglas y frases, en
                // <see cref="DesktopProfilePhoto"/>; el cable, en <see cref="AccountPhotoPickAsync"/>.
                "account.photo.pick" => await AccountPhotoPickAsync(),
                "account.photo.delete" => await AccountPhotoDeleteAsync(),
                // Las dos sesiones del mismo menú, ya conectadas en la ronda AV: lectura con
                // <c>account.getAuthorizations</c> y cierre con <c>account.resetAuthorization</c>. Reglas y frases,
                // en <see cref="DesktopSessions"/>; el cable, en <see cref="SessionsAsync"/>.
                "account.sessions" => await SessionsAsync(),
                "account.session.revoke" => await RevokeSessionAsync(args),
                // Las dos de la privacidad de la cuenta, conectadas en la ronda BH. Llevan en la lista del puente
                // Android desde la ronda B (<c>BridgePolicy.java:23</c>) y la pantalla las pide desde entonces, pero
                // en Windows caían en el genérico: en los ajustes el <c>Promise.all</c> de <c>SettingsPage.tsx:109</c>
                // negaba el panel entero con la frase del beta, y el desplegable de <c>UserMenu.tsx:50</c> se quedaba
                // en «…». MTProto no tiene una lectura global —son diez <c>account.getPrivacy</c>— y pide
                // <c>InputUser</c> con hash al escribir. Reglas y frases, en <see cref="DesktopPrivacy"/>; el cable,
                // en <see cref="PrivacyAsync"/>.
                "privacy.get" => await PrivacyAsync(),
                "privacy.set" => await SetPrivacyAsync(args),
                // Las dos de la lista de bloqueados, conectadas en la ronda BI. Están en la lista del puente desde
                // la ronda que abrió el panel (<c>BridgePolicy.java:42</c>) y la pantalla las pide desde entonces,
                // pero en Windows la lectura caía en el genérico y el desbloqueo —que sí abre un cuadro de
                // confirmar, <c>bridge.ts:41</c>— se quedaba con la frase del beta por delante. MTProto nombra pares
                // con <c>access_hash</c> y TDLib nombres sueltos, de ahí que el cable relea la lista antes de escribir.
                // Reglas y frases, en <see cref="DesktopBlocked"/>; el cable, en <see cref="BlockedAsync"/>.
                "privacy.blocked" => await BlockedAsync(args),
                "privacy.unblock" => await UnblockSenderAsync(args),
                // Las cuatro del borrado automático, conectadas en la ronda BN: el temporizador de una conversación y
                // el predeterminado de las que se creen, que son la misma pantalla con dos orígenes
                // (<c>AutoDeleteSettings.tsx:20</c>). Están en la lista del puente desde <c>BridgePolicy.java:44</c> y
                // se atienden en <c>NativeBridge.java:562-565</c>, pero en Windows las cuatro caían en el genérico
                // mientras las seis peticiones de MTProto que necesita la familia llevaban existiendo todo ese tiempo.
                // Reglas y frases, en <see cref="DesktopAutoDelete"/>; el cable, en <see cref="AutoDeleteReadAsync"/>.
                "privacy.autoDelete" => await AutoDeleteReadAsync(args, false),
                "chat.autoDelete" => await AutoDeleteReadAsync(args, true),
                "privacy.autoDelete.set" => await AutoDeleteWriteAsync(args, false),
                "chat.autoDelete.set" => await AutoDeleteWriteAsync(args, true),
                "appearance" => Appearance(args),
                "chats.list" => await LoadDialogsAsync(Str(args, "list", "main")),
                "chats.more" => await LoadMoreDialogsAsync(),
                "chats.search" => await SearchChatsAsync(args),
                "saved.sources" => await SavedSourcesAsync(args),
                "saved.history" => await SavedHistoryAsync(args),
                "gallery.list" => await GalleryAsync(args),
                "chat.open" => await OpenChatAsync(Str(args, "id"), checked((int)Long(args, "messageId"))),
                "chat.close" => true,
                "chat.saved" => await OpenSavedAsync(),
                "chat.read" => await ReadActiveAsync(),
                "chat.pinned" => await PinnedMessageAsync(),
                "chat.pin" => await PinDialogAsync(args),
                // Las dos escrituras de lista del menú de conversación. Caían en el `_ => throw` genérico, que
                // decía «No disponible en escritorio (beta)» dando a entender que faltaba el cable: lo que
                // faltaba era el brazo, porque las dos peticiones existen en la librería.
                "chat.archive" => await ArchiveDialogAsync(args),
                "chat.unread" => await MarkUnreadAsync(args),
                "pinned.list" => throw new BridgeException(DesktopMessagePin.NoList),
                // Los dos de la ficha de la comunidad, ya conectados en la ronda AW: leer nombre y descripción y
                // escribir uno de los dos, con la ventana de confirmar antes de tocar Telegram. Reglas y frases, en
                // <see cref="DesktopCommunityInfo"/>; el cable, en <see cref="CommunityInfoAsync"/>.
                "chat.info" => await CommunityInfoAsync(args),
                "chat.info.set" => await SetCommunityInfoAsync(args),
                // La foto de la comunidad, tercera escritura de la ficha (ronda BD). El selector, el recorte y la
                // ventana ya estaban hechos para la foto de la cuenta; lo que se añade aquí es la bifurcación de
                // MTProto —<c>channels.editPhoto</c> o <c>messages.editChatPhoto</c>— y el refresco de la fila.
                // Reglas y frases, en <see cref="DesktopChatPhoto"/>; el cable, en <see cref="ChatPhotoPickAsync"/>.
                "chat.photo.pick" => await ChatPhotoPickAsync(args),
                // Y la negativa, escrita con su causa en lugar de caer en el genérico de abajo. Android la atiende
                // con el mismo <c>SetChatPhoto</c> al que le manda el foto vacío (<c>NativeBridge.java:1781</c>);
                // WTelegramClient 4.4.10 no genera <c>inputChatPhotoEmpty</c> —medido: <c>TL.InputChatPhotoBase</c>
                // tiene dos derivados y ninguno es el vacío—, así que aquí no hay petición que construir. La
                // pantalla de escritorio no ofrece la entrada; esta rama es para quien la pregunte de todos modos.
                "chat.photo.delete" => throw new BridgeException(DesktopChatPhoto.NoDelete),
                // El nombre público de la comunidad, conectado en la ronda BC. Las dos órdenes llevaban desde el
                // principio en la lista del puente Android y aquí caían en el genérico, mientras la pantalla ya tenía
                // la caja de texto y el cuadro de confirmar hechos para Android. Reglas y frases, en
                // <see cref="DesktopChatUsernames"/>; el cable, en <see cref="ChatUsernameAsync"/>.
                "chat.username" => await ChatUsernameAsync(args),
                "chat.username.set" => await SetChatUsernameAsync(args),
                "chat.mute" => await MuteAsync(args),
                "chat.defaultSilent" => SetDefaultSilent(args),
                "chat.leave" => await LeaveChatAsync(args),
                "chat.join" => await JoinChatAsync(args),
                // Las cuatro listas de miembros de la ronda AX. Hasta aquí `grep groups\. apps/desktop` no
                // devolvía ni una línea: las tres lecturas caían en el `_ => throw` genérico, «Ver miembros»
                // enseñaba esa frase y «Administrar miembros» no enseñaba nada —el panel no captura el rechazo y
                // se queda en «Sin miembros para este filtro o búsqueda»—. Reglas y frases, en
                // <see cref="DesktopGroupMembers"/> y <see cref="DesktopGroupRoster"/>; el cable, en
                // <see cref="GroupMembersAsync"/>.
                "groups.members" => await GroupMembersAsync(args, page: false),
                "groups.members.page" => await GroupMembersAsync(args, page: true),
                "groups.members.basic" => await BasicRosterAsync(args),
                // Las cinco escrituras sobre una fila están conectadas desde la ronda AZ, cada una con su brazo y su
                // orden de guardas. La expulsión es la única que tiene dos caminos: en un básico va por
                // <c>messages.deleteChatUser</c> y en un canal o supergrupo por <c>channels.editBanned</c>, que es
                // justo la bifurcación con la que abre <c>banGroupMember</c> (<c>NativeBridge.java:2899</c>). En las
                // otras cuatro, un básico no es un camino posible: es la negación de Telegram, y la frase la da
                // <c>DesktopGroupRoster.WriteProblem</c> mirando la forma de la fila.
                "groups.member.ban" => await BanMemberAsync(args),
                "groups.member.restrict" => await RestrictMemberAsync(args),
                "groups.member.promote" => await PromoteMemberAsync(args),
                "groups.member.demote" => await DemoteMemberAsync(args),
                "groups.member.unban" => await LiftMemberAsync(args),
                // Comandos del chat y fichas de perfil de Telegram.
                "bot.commands" => await BotCommandsAsync(args),
                // Reglas de las fichas en <see cref="DesktopPeerProfile"/>.
                // La lectura completa se implementa en <see cref="ChatProfileAsync"/>.
                "chat.profile" => await ChatProfileAsync(args),
                "profile.related" => await RelatedAsync(args),
                "profile.peer" => ProfilePeerAsync(args),
                "profile.contact" => ProfileContactAsync(args),
                // La sexta puerta del mismo hueco, cableada en la ronda BP. La pantalla ya ofrecía el nombre del
                // remitente como botón, pero en Windows la orden caía en el genérico y la ronda BO lo bajó a texto.
                // Reglas y frases, en <see cref="DesktopSenderProfile"/>; el cable, en
                // <see cref="SenderProfileAsync"/>.
                "profile.sender" => await SenderProfileAsync(args),
                // La quinta puerta del mismo hueco, cableada en la ronda BI junto a las dos de la lista. La ficha ya
                // publicaba <c>blocked</c> desde la ronda BA, así que en Windows el botón de «Bloquear» se veía y al
                // pulsar caía en el genérico. Acá no hay cuadro nativo: lo abre la pantalla (<c>App.tsx:754</c>).
                // Reglas y frases, en <see cref="DesktopBlocked"/>; el cable, en <see cref="SetBlockProfileAsync"/>.
                "profile.block" => await SetBlockProfileAsync(args),
                // La firma de invitación, conectada en la ronda BB. El menú «Añadir personas» de la pantalla
                // (<c>App.tsx:928</c>) nunca llevó guarda de plataforma, así que en Windows el panel se abría y su
                // primera pregunta caía en el `_ => throw` genérico. Reglas y frases, en
                // <see cref="DesktopMemberAdditions"/>; el cable, en <see cref="AddInfoAsync"/>.
                "groups.add.info" => await AddInfoAsync(args),
                "groups.member.add" => await AddMembersAsync(args),
                // Los permisos predeterminados de la comunidad, conectados en la ronda BE. Las dos órdenes estaban en
                // la lista del puente desde la ronda A y la pantalla las pide desde la Q por la entrada «Permisos
                // predeterminados» del panel lateral (<c>App.tsx:1241</c>, sin guarda de plataforma), pero en Windows
                // caían en el genérico. Reglas, tabla de banderas y frases, en <see cref="DesktopGroupPermissions"/>;
                // el cable, en <see cref="GroupPermissionsAsync"/>.
                "groups.permissions.get" => await GroupPermissionsAsync(args),
                "groups.permissions.set" => await SetGroupPermissionsAsync(args),
                // Las estadísticas de la comunidad, conectadas en la ronda CA por la misma razón que las dos de
                // arriba: la orden estaba en la lista del puente (<c>BridgePolicy.java:25</c>) y la pantalla la pide
                // sin guarda de plataforma, pero en Windows caía en el genérico. Reglas, fichas y frases, en
                // <see cref="DesktopGroupStats"/>; el cable, en <see cref="GroupStatsAsync"/>. Es la única lectura de
                // estadísticas que las dos capas tienen: los números sueltos de un mensaje no los contesta ni una ni
                // otra, como midió la ronda antes de escribir este brazo.
                "groups.stats" => await GroupStatsAsync(args),
                // El enlace suelto, conectado en la ronda BQ. Está en la lista del puente desde la ronda A
                // (<c>BridgePolicy.java:25</c>) y la pantalla lo pide desde siempre, pero en Windows no tenía brazo y
                // caía en el genérico. Reglas y frases, en <see cref="DesktopLinkManager"/>; el cable, en
                // <see cref="CreateInviteAsync"/>. No hay hoja de compartir en WPF, así que el enlace se muestra en la
                // caja de lectura con la que Android se queda cuando ninguna aplicación le acepta el <c>ACTION_SEND</c>.
                "chat.invite" => await CreateInviteAsync(args),
                // La gestión de los enlaces de invitación, conectada en la ronda BF. Las cuatro llevaban desde la
                // ronda A en la lista del puente Android (<c>BridgePolicy.java:49</c>) y la pantalla las pide desde la
                // G, pero en Windows la entrada estaba tapada con <c>!desktop</c>; sin ella, pegar un enlace para entrar
                // (ronda AB) era la única mitad del flujo que funcionaba. Reglas, techos y frases, en
                // <see cref="DesktopLinkManager"/>; el cable, en <see cref="InviteLinksAsync"/>.
                "chat.invitelinks" => await InviteLinksAsync(args),
                "chat.invitelink.create" => await InviteLinkFormAsync(args, create: true),
                "chat.invitelink.edit" => await InviteLinkFormAsync(args, create: false),
                "chat.invitelink.revoke" => await RevokeInviteLinkAsync(args),
                // La cola de solicitudes de ingreso, conectada en la ronda BG. Las dos órdenes están en la lista del
                // puente Android desde la ronda F (<c>BridgePolicy.java:48</c>) y la pantalla las pide desde entonces,
                // pero en Windows la entrada estaba tapada con <c>!desktop</c> y habrían caído en el genérico. TDLib
                // tiene un método para la cola y otro para responder; MTProto usa banderas de
                // <c>messages.getChatInviteImporters</c> y un <c>messages.hideChatJoinRequest</c> que aprueba o descarta.
                // Reglas, marcador y frases, en <see cref="DesktopJoinRequests"/>; el cable, en
                // <see cref="JoinRequestsAsync"/>.
                "chat.requests" => await JoinRequestsAsync(args),
                "chat.request.answer" => await AnswerJoinRequestAsync(args),
                "history.older" => await LoadOlderAsync(),
                "history.newer" => await LoadNewerAsync(),
                "history.refresh" => await RefreshHistoryAsync(),
                // El salto por fecha de la cabecera. La orden ya estaba en la lista del puente Android y la
                // pantalla la llamaba, pero el botón estaba tapado con `!desktop` y aquí caía en el genérico.
                "history.byDate" => await HistoryDateAsync(args),
                "typing" => await TypingAsync(args),
                "draft.set" => await DraftAsync(args),
                "send.text" => await SendAsync(args),
                "message.copy" => CopyMessage(Str(args, "id")),
                "message.properties" => await PropertiesAsync(Str(args, "id")),
                "message.delete" => await DeleteMessagesAsync(args, batch: false),
                "messages.delete" => await DeleteMessagesAsync(args, batch: true),
                "message.forward" => await ForwardAsync(args, batch: false),
                "messages.forward" => await ForwardAsync(args, batch: true),
                "message.pin" => await PinMessageAsync(args),
                "message.edit" => await EditMessageAsync(args, caption: false),
                "message.edit.caption" => await EditMessageAsync(args, caption: true),
                // La tercera cara de editar: cambiar el archivo sin tocar el texto. La petición es la misma
                // `messages.editMessage` y el parámetro `media` ya se usaba arriba para conservar la foto al
                // cambiar su pie; lo que faltaba era subir el archivo nuevo y negar lo que Telegram no concede.
                "message.edit.media" => await EditMessageMediaAsync(args),
                // El botón «Abrir en el mapa» de la tarjeta de ubicación. No hay petición que hacer: Android tampoco
                // la hace, lo que hace es sacar las coordenadas de la fila y entregarle la URL al navegador. Aquí la
                // fila hay que releerla (`messages.getMessages`) porque el host no guarda los adjuntos en memoria.
                "message.location.open" => await OpenLocationAsync(Long(args, "id")),
                // La bandeja de programados. Windows ya podía crear un mensaje con hora —la ronda AD le dio
                // `schedule_date` a `send.text` y al reenvío— pero no podía verla, vaciarla ni corregirla: lo
                // escrito quedaba fuera de alcance. Las cuatro peticiones existen en la librería; caían en el
                // `_ => throw` genérico, que dice «No disponible en escritorio (beta)» dando a entender que
                // falta el cable.
                "scheduled.list" => await ScheduledListAsync(args),
                "scheduled.sendNow" => await ScheduledSendAsync(args),
                "scheduled.reschedule" => await ScheduledRescheduleAsync(args),
                "scheduled.delete" => await ScheduledDeleteAsync(args),
                // Elegir un archivo, enviarlo y descartarlo. Las tres estaban en la lista de métodos del puente
                // Android y en ninguna de las dos capas de escritorio: el botón «Archivo o foto» existía, avisaba
                // del límite de 32 MB y al confirmar caía en el «No disponible en escritorio (beta)». La librería
                // tiene todo lo que hace falta —`UploadFileAsync` y `sendMedia`—; lo que faltaba era el cable.
                "attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),
                "attachment.discard" => AttachmentDiscardAsync(args),
                "send.attachment" => await SendAttachmentAsync(args),
                // El álbum son las dos órdenes que faltaban del mismo subsistema: elegir varias fotos y mandarlas
                // juntas. La librería tiene `messages.sendMultiMedia`, que recibe un `InputSingleMedia` por pieza
                // —cada una con su `random_id`—, así que el lote viaja en una sola petición como en TDLib.
                "attachment.album" => await AttachmentAlbumAsync(),
                "send.album" => await SendAlbumAsync(args),
                // Y la tercera orden del álbum, la que lee las piezas para poder escribirles un texto suelto. En
                // Android es `NativeBridge.album` (`:4027-4032`), que barre dos ventanas de diez mensajes alrededor
                // del ancla y devuelve `id` + pie por pieza; aquí basta una lectura, ver `DesktopAlbum.Window`.
                "message.album" => await AlbumItemsAsync(args),
                // La encuesta son las dos órdenes del mismo subsistema que Android ya tenía y Windows no: armar el
                // borrador y votarlo. En MTProto una encuesta no es un contenido propio, es un <b>adjunto</b>
                // (<c>InputMediaPoll</c> dentro de la <c>sendMedia</c> que ya usa el archivo suelto) y el voto es
                // petición propia (<c>messages.sendVote</c>). Las reglas y las frases están en
                // <see cref="DesktopPoll"/>.
                "poll.send" => await SendPollAsync(args),
                "poll.answer" => await AnswerPollAsync(args),
                // De las otras dos, una se niega con su causa nombrada y la otra ya funciona. Cerrar una encuesta no
                // está conectado: <b>no existe la petición</b> en WTelegramClient 4.4.10, y por eso mismo
                // <c>canStop</c> sale en falso y la pantalla ni pinta el botón. Listar votantes sí existía
                // (<c>messages.getPollVotes</c>) y desde la ronda AO está cableado: la tarjeta pregunta, el host lee
                // la fila, traduce la clave opaca de la opción y responde nombre y fecha de cada votante, que es
                // exactamente el par que Android ya daba.
                "poll.stop" => throw new BridgeException(DesktopPoll.NoStop),
                "poll.voters" => await PollVotersAsync(args),
                // Las dos escrituras, conectadas en la ronda BX: la sonda midió que la petición existe con su nombre
                // actual —<c>messages.sendReaction</c>— y lo que no existe son los nombres viejos que se buscaron
                // cuando se escribió la negativa. El orden, en <see cref="DesktopMessageReactFlow"/>; la de pago sigue
                // negada, y por saldo, no por biblioteca.
                "message.react" or "message.react.custom" => await ReactAsync(args, method == "message.react.custom"),
                "message.react.paid" => throw new BridgeException(DesktopMessageReact.PaidRefused),
                // Las once de emojis y stickers, conectadas en la ronda BY. Van en el mismo orden en que las nombra
                // el puente de Android: primero el estado (`NativeBridge.java:307`, con sus brazos en `:315`, `:335`
                // y `:350`), luego los documentos sueltos (`:4340`, `:4341`) y al final los packs y los stickers
                // (`:4922`, `:4953`, `:4972`, `:4973`, `:4974`, `:4975`). Cada brazo está en
                // <see cref="DesktopEmojiCatalogFlow"/> y las reglas puras, con las frases copiadas carácter a
                // carácter y los topes medidos, en <c>DesktopEmojiCatalog</c>. Dos cosas se niegan por biblioteca y
                // no por decisión: quitar el estado puesto (no hay <c>account.clearEmojiStatus</c>) y las miniaturas
                // de <c>PhotoSize</c> de un pack (el registro de medios del escritorio solo sirve documentos).
                "emojiStatus.state" => await EmojiStatusStateAsync(),
                "emojiStatus.options" => await EmojiStatusOptionsAsync(),
                "emojiStatus.set" => await EmojiStatusSetAsync(args),
                "customEmoji.get" => await CustomEmojiAsync(args),
                "customEmoji.search" => await CustomEmojiSearchAsync(args),
                "emojiPacks.list" => await EmojiPacksListAsync(args),
                "emojiPacks.get" => await EmojiPackAsync(args),
                "stickers.installed" => await InstalledStickersAsync(),
                "stickers.search" => await SearchStickersAsync(args),
                "stickers.get" => await StickerSetAsync(args),
                "stickers.install" => await ChangeStickerSetAsync(args),
                // La marca de Premium, ronda CD. La pregunta el selector de emojis personalizados antes de dejar
                // elegir y la lee el menú del mensaje a través de `message.properties`; sin ella el botón ✨ no salía
                // porque no había manera de saber si la cuenta tiene Premium. Detrás de las once ramas del emoji
                // porque la ronda BY las mide como un bloque contiguo, y en vez de partirlo esta va suelta.
                "premium.state" => await PremiumStateAsync(),
                "media.export" => await ExportMediaAsync(Long(args, "id")),
                "media.text" or "media.archive" => await PreviewMediaAsync(Long(args, "id"), method == "media.archive"),
                "retry" => await RetryAsync(),
                "error.clear" => ClearError(),
                "app.background" => true,
                "native.settings" => OpenDataFolder(),
                // Las tres del enlace, en el orden del puente de Android: `message.link` (`NativeBridge.java:783`)
                // antes que `link.open` (`:784`). Las dos primeras acaban en el mismo embudo; la diferencia es de
                // dónde sale la dirección, y por eso una la trae la pantalla en el argumento y la otra la vuelve a
                // leer en la fila. Reglas de la tarjeta, en <see cref="DesktopLinkPreview"/>.
                "message.link" => await MessageLinkAsync(args),
                "link.open" => await TelegramLinkAsync(args),
                "telegram.link" => await TelegramLinkAsync(args),
                "notifications.status" => new { configured = false, enabled = false, permission = false, registered = false, status = "No disponible en escritorio" },
                "messages.search" => await MessagesSearchAsync(args),
                "messages.search.more" => await MessagesSearchMoreAsync(args),
                "message.translate" => await TranslateMessageAsync(args),
                "message.transcribe" => await TranscribeAsync(args),
                "message.transcribe.rate" => await TranscribeRateAsync(args),
                // Las cuatro lectoras de la ronda BZ: la bandeja es `stories.getPeerStories`, las del perfil son
                // `stories.getPinnedStories`, abrir es `stories.getStoriesByID` con su `incrementStoryViews` y cerrar es
                // `stories.readStories`. El orden de cada una, en <see cref="DesktopStoriesFlow"/>. Crear una historia
                // sigue sin brazo —`story.create.photo` y `story.create.video` caen en el rechazo genérico del final—.
                "chat.stories" => await ChatStoriesAsync(args),
                "story.open" => await StoryOpenAsync(args),
                "message.story.open" => await SharedStoryOpenAsync(args),
                "story.close" => await CloseStoryAsync(args),
                "business.quick.list" => await QuickListAsync(),
                "business.quick.messages" => await QuickMessagesAsync(args),
                "business.quick.add" => await QuickAddAsync(args),
                "business.quick.name" => await QuickNameAsync(args),
                "business.quick.edit" => await QuickEditAsync(args),
                "business.quick.delete" => await QuickDeleteAsync(args),
                "business.quick.send" => await QuickSendAsync(args),
                "search.filters.list" => SavedFilters(args, save: false, delete: false),
                "search.filters.save" => SavedFilters(args, save: true, delete: false),
                "search.filters.delete" => SavedFilters(args, save: false, delete: true),
                "folders.list" => await FoldersListAsync(),
                "folders.get" => await FolderGetAsync(args),
                "folders.save" => await FolderSaveAsync(args),
                "folders.delete" => await FolderDeleteAsync(args),
                "folders.link" => await FolderLinkAsync(args),
                "folders.join" => await FolderJoinAsync(args),
                "folders.links.list" => await FolderLinksListAsync(args),
                "folders.links.edit" => await FolderLinkChangeAsync(args, delete: false),
                "folders.links.delete" => await FolderLinkChangeAsync(args, delete: true),
                "chat.folderTags" => await FolderTagsAsync(args),
                "chat.boost.status" => await BoostStatusAsync(args),
                "chat.boost.link" => await BoostLinkAsync(args),
                "chat.boost.slots" => await BoostSlotsAsync(),
                "chat.boost.apply" => await BoostApplyAsync(args),
                "stars.transactions" => await StarsTransactionsAsync(args),
                "stars.subscriptions" => await StarsSubscriptionsAsync(args),
                "stars.subscription.cancel" => await StarsSubscriptionCancelAsync(args, canceled: true),
                "stars.subscription.resume" => await StarsSubscriptionCancelAsync(args, canceled: false),
                "stars.subscription.reuse" => await StarsSubscriptionReuseAsync(args),
                "stars.options" => await StarsOptionsAsync(),
                "stars.revenue" => await StarsRevenueAsync(args),
                "stars.withdraw" => await StarsWithdrawAsync(args),
                "stars.ads.url" => await StarsAdsUrlAsync(args),
                "downloads.status" => await DownloadsStatusAsync(),
                "downloads.pause" => await DownloadsPauseAsync(args),
                "downloads.queue" => await DownloadsQueueAsync(args),
                "downloads.item.pause" => await DownloadItemPauseAsync(args),
                "downloads.item.cancel" => await DownloadItemCancelAsync(args),
                "downloads.item.add" => await DownloadItemAddAsync(args),
                "downloads.item.remove" => await DownloadItemRemoveAsync(args),
                // Las tres de la ronda AP. Las dos lecturas son caras de la misma petición de Telegram y la escritura
                // es un adjunto más: `messages.sendMedia` con `InputMediaContact`, que no necesita el access_hash de
                // la persona compartida porque el destino es la conversación abierta.
                "contacts.list" => await ListContactsAsync(),
                "contacts.search" => await SearchContactsAsync(args),
                "share.contact" => await ShareContactAsync(args),
                // La cuarta de la familia, y la que la ronda AP dejó a medias: la tarjeta sale con su «Abrir chat»
                // porque `MessageMediaContact` sí publica `user_id`, pero el botón no se pintaba en Windows hasta
                // que el brazo existiera. Aquí se abre la conversación, no se crea: ver `DesktopPrivateChat`.
                "contacts.open" => await OpenContactAsync(Str(args, "id")),
                // Las dos escribientes de la ronda BL. Son el mismo <c>case</c> de Android partido en dos brazos, y
                // la ficha de la persona las llevaba pidiendo desde que existe el botón: sin brazo, el
                // «Añadir a contactos» de <c>PeerProfile.tsx:97</c> contestaba la frase del beta.
                "contacts.add" => await AddContactAsync(args),
                "contacts.remove" => await RemoveContactAsync(args),
                "contacts.sync.status" => new { enabled = false, running = false, last = 0L, matched = 0, imported = 0, skipped = false, error = "No disponible en escritorio" },
                // Copiar al portapapeles no es un flujo de Telegram, pero la ronda AP lo encontró vacío: el botón
                // «Copiar número» de una tarjeta de contacto —y todos los «Copiar enlace» de la interfaz— devolvían
                // «No disponible en escritorio (beta)» porque ningún brazo lo atendía.
                "clipboard.copy" => ClipboardCopy(Str(args, "text")),
                // Las dos de la ubicación en directo, llegadas en la ronda CB. Empezar a compartirla se niega por su
                // nombre —en este host no hay de dónde sacar una coordenada, dice <see cref="DesktopLiveLocation"/>—
                // y dejar de compartirla sí funciona, con la única petición que la librería tiene para eso: un
                // <c>messages.editMessage</c> cuyo adjunto lleva su bit <c>stopped</c>. El orden, en
                // <see cref="StopLiveLocationAsync"/>.
                "location.live.start" => throw new BridgeException(DesktopLiveLocation.NoSensor),
                "location.live.stop" => await StopLiveLocationAsync(args),
                // Los fondos de la cuenta, los dos brazos que en Android son <c>backgroundsList</c>
                // (<c>NativeBridge.java:754</c>) y <c>backgroundSet</c> (<c>NativeBridge.java:755</c>). Aquí la
                // pantalla es la misma y el dibujo también: <see cref="DesktopBackgrounds"/> pinta el relleno con la
                // misma fórmula que el método <c>css</c> de <c>AccountBackgrounds.java:51</c>. Lo único
                // que no llega es crear un fondo de color —no hay imagen que subir—, y eso lo dice por su nombre
                // <see cref="DesktopBackgrounds.NoCreate"/> dentro de <see cref="BackgroundSetAsync"/>.
                "backgrounds.list" => await BackgroundsListAsync(args),
                "background.set" => await BackgroundSetAsync(args),
                "updates.check" => _state.Update,
                "sponsored.retry" => null,
                "access.declare" or "access.privacy" or "access.terms" => true,
                "state" => _state,
                _ => throw new BridgeException($"No disponible en escritorio (beta): {method}")
            };
            Push();
            return result;
        }
        finally { _gate.Release(); }
    }

    public void Push()
    {
        _state.MediaReady = _media.ReadyIds();
        _state.MediaLoading = _media.LoadingIds();
        _state.MediaFailed = _media.FailedIds();
        _push();
    }

    // ---- connection and login -------------------------------------------------

    private async Task<object?> ConnectAsync()
    {
        _state.Busy = true;
        _state.Error = "";
        Push();
        try
        {
            _state.Consent = true;
            _store.SetConsent(true);
            await ConnectCoreLocked(quiet: false);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.Busy = false;
            Push();
        }
    }

    private async Task ConnectCoreLocked(bool quiet)
    {
        if (_client?.User != null)
        {
            if (!_state.Ready) await CompleteLoginLocked();
            return;
        }

        var (apiId, apiHash) = _store.LoadCredentials();
        DisposeClientLocked();
        _client = new Client(apiId, apiHash, _store.SessionPath)
        {
            PingInterval = 60
        };
        _client.OnUpdates += QueueUpdates;
        _client.OnOther += QueueOther;

        try
        {
            await _client.ConnectAsync();
        }
        catch (Exception ex)
        {
            DisposeClientLocked();
            if (quiet) throw;
            throw new BridgeException("No se pudo conectar con Telegram. Revisa la red e inténtalo de nuevo.", ex);
        }

        _state.Online = !_client.Disconnected;
        _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
        if (_client.User != null)
        {
            await CompleteLoginLocked();
            return;
        }
        _state.Ready = false;
        _state.Auth = "phone";
        _state.Busy = false;
        if (!quiet) Push();
    }

    private async Task CompleteLoginLocked()
    {
        var user = _client?.User ?? throw new BridgeException("Telegram no confirmó la sesión.");
        _state.Ready = true;
        _state.Auth = "closed";
        _state.Consent = true;
        _state.Busy = false;
        _state.SelfId = user.id.ToString();
        _state.Name = FullName(user);
        _state.ProfilePhoto = _media.RegisterProfile(user, user.photo != null, "self:" + user.id, _state.Name);
        // Las dos marcas que la UI de escritorio pregunta sin pedir nada por la red: la estrella de Premium
        // (<c>PremiumMark.tsx:37</c>) y el emoji del estado (<c>PremiumMark.tsx:36</c>). Salen del propio objeto
        // <c>User</c> de la sesión, como en <c>NativeSnapshot.java:51-60</c>, y se vuelven a escribir aquí cada vez
        // que se reanuda la cuenta, que es el único momento en que MTProto refresca la bandera.
        _state.Wallet = new WalletDto { Premium = DesktopEmojiCatalog.IsPremium(user) };
        _state.EmojiStatus = EmojiStatusDto.Of(DesktopEmojiCatalog.MarkOf(user, Unix(DateTime.UtcNow)));
        _state.CanSend = true;
        _state.Online = !(_client?.Disconnected ?? true);
        _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
        _state.Error = "";
        _state.Notice = "";
        _state.ChatsBusy = true;
        Push();

        await LoadFoldersLocked();
        await LoadDialogsLocked(_mode, quiet: true);
        _state.ChatsBusy = false;
        // Los dos huecos del fondo de la cuenta no los avisa Telegram por el cable en este host: la única forma de
        // saber qué está puesto es leer la lista, así que se lee al entrar, como en <c>LoadFoldersLocked</c>.
        await RefreshCloudSlotsAsync();
        Push();
    }

    private async Task<object?> AuthenticateAsync(string value)
    {
        if (_client == null) throw new BridgeException("Pulsa Continuar con Telegram para iniciar la conexión.");
        if (string.IsNullOrWhiteSpace(value)) throw new BridgeException("Escribe el dato que pide Telegram.");
        _state.Busy = true;
        _state.Error = "";
        Push();
        try
        {
            var next = await _client.Login(value.Trim());
            await AfterLoginStepLocked(next);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.Busy = false;
            Push();
        }
    }

    private async Task<object?> RegisterAsync(JsonElement args)
    {
        var first = Str(args, "firstName").Trim();
        var last = Str(args, "lastName").Trim();
        if (first.Length == 0) throw new BridgeException("Escribe tu nombre para crear la cuenta.");
        return await AuthenticateAsync((first + " " + last).Trim());
    }

    private async Task AfterLoginStepLocked(string? next)
    {
        if (_client?.User != null)
        {
            await CompleteLoginLocked();
            return;
        }

        switch (next)
        {
            case "verification_code":
                _state.Auth = "code";
                break;
            case "password":
                _state.Auth = "password";
                await LoadPasswordHintLocked();
                break;
            case "name":
                _state.Auth = "registration";
                break;
            case "email":
                _state.Auth = "email";
                break;
            case "email_verification_code":
                _state.Auth = "emailCode";
                break;
            case "phone_number":
                _state.Auth = "phone";
                break;
            default:
                if (_client?.User != null) await CompleteLoginLocked();
                else if (string.IsNullOrEmpty(next)) throw new BridgeException("Telegram no completó el inicio de sesión. Inténtalo de nuevo.");
                else _state.Auth = "phone";
                break;
        }
    }

    private async Task LoadPasswordHintLocked()
    {
        try
        {
            var password = await _client!.Account_GetPassword();
            _state.AuthHint = string.IsNullOrWhiteSpace(password.hint) ? null : password.hint;
        }
        catch
        {
            _state.AuthHint = null;
        }
    }

    private async Task<object?> LogoutAsync()
    {
        try
        {
            if (_client?.User != null) await _client.Auth_LogOut();
        }
        catch { }
        DisposeClientLocked();
        try { if (File.Exists(_store.SessionPath)) File.Delete(_store.SessionPath); } catch { }

        _users.Clear();
        _chats.Clear();
        _entries.Clear();
        _textCache.Clear();
        _savedOrigins.Clear();
        _active = "0";
        _mode = "main";
        _state.ResetSession();
        _state.Consent = false;
        _store.SetConsent(false);
        return true;
    }

    private async Task<object?> RetryAsync()
    {
        if (_client == null)
        {
            await ConnectCoreLocked(quiet: false);
            return true;
        }
        try
        {
            await _client.ConnectAsync();
            _state.Online = !_client.Disconnected;
            _state.Connection = _state.Online ? "Conectado" : "Sin conectar";
            if (_client.User != null && !_state.Ready) await CompleteLoginLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    // ---- dialogs and chats ----------------------------------------------------

    private async Task<object?> LoadDialogsAsync(string list, bool quiet = false)
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para cargar las conversaciones.");
        if (!quiet)
        {
            _state.ChatsBusy = true;
            Push();
        }
        try
        {
            await LoadDialogsLocked(list, quiet);
            return true;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.ChatsBusy = false;
            Push();
        }
    }

    private async Task LoadDialogsLocked(string list, bool quiet = false)
    {
        if (_client?.User == null) return;
        _mode = list;
        var folder = list == "archive" ? 1 : list.StartsWith("folder:") && int.TryParse(list[7..], out var id) ? id : 0;
        if (folder > 1 && _chatlistIds.Contains(folder))
            throw new BridgeException("Las listas colaborativas todavía no se abren como pestaña en esta versión de escritorio.");

        var result = await _client.Messages_GetDialogs(limit: 60, folder_id: folder);
        if (result is Messages_Dialogs page)
        {
            MergePeers(page.users.Values, page.chats.Values);
            BuildChats(page.Dialogs, page.Messages, folder);
            _state.ChatsEnd = result is not Messages_DialogsSlice;
        }

        _lastDialogsLoad = DateTime.UtcNow;
        _dialogsDirty = false;
        if (!quiet) Push();
    }

    private void BuildChats(DialogBase[] dialogs, MessageBase[] messages, int folder)
    {
        _entries.Clear();
        var chats = new List<ChatDto>();
        foreach (var dialog in dialogs.OfType<TL.Dialog>())
        {
            var entry = EntryFromPeer(dialog.peer);
            if (entry == null) continue;

            entry.Pinned = (dialog.flags & TL.Dialog.Flags.pinned) != 0;
            // Las dos reglas de lista viven en `DesktopChatFolders`: aquí se escribieron a mano en las dos
            // cargas de la lista, que es la forma estándar de que el id del archivo se separe de su lectura.
            entry.Archived = DesktopChatFolders.IsArchived(folder, dialog.folder_id);
            entry.Marked = DesktopChatFolders.IsMarked(dialog);
            entry.Muted = dialog.notify_settings?.mute_until > DateTime.UtcNow;
            entry.Unread = dialog.unread_count;
            entry.ReadInbox = dialog.read_inbox_max_id;
            entry.ReadOutbox = dialog.read_outbox_max_id;
            entry.TopMessage = dialog.top_message;
            if (dialog.draft is DraftMessage draft) entry.Draft = draft.message;

            var top = messages.FirstOrDefault(message => message.ID == dialog.top_message);
            entry.Date = top != null ? Unix(top.Date) : 0;
            _entries[entry.Id] = entry;

            chats.Add(new ChatDto
            {
                Id = entry.Id,
                Title = entry.Title,
                Preview = PreviewOf(top),
                Date = entry.Date,
                Unread = entry.Unread,
                ReadInbox = entry.ReadInbox.ToString(),
                Marked = entry.Marked,
                Bot = entry.Bot,
                Type = entry.Type,
                Pinned = entry.Pinned,
                Muted = entry.Muted,
                Archived = entry.Archived,
                Photo = entry.Photo,
                Supported = true,
                Username = entry.Username,
                Draft = entry.Draft,
                IsContact = entry.IsContact,
                Supergroup = entry.Supergroup,
                IsForum = entry.IsForum,
                DefaultSilent = DefaultSilentMark(entry.Id)
            });
        }
        if (_active != "0" && chats.All(chat => chat.Id != _active) && FindEntry(_active) is { } active)
            chats.Add(LookupDto(active));
        _state.Chats = chats;
    }

    private async Task<object?> LoadMoreDialogsAsync()
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para cargar más conversaciones.");
        if (_state.ChatsEnd) return false;
        var lastDto = _state.Chats.LastOrDefault(chat => chat.InList);
        if (lastDto == null) return await LoadDialogsAsync(_mode);
        if (_state.ChatsBusy) return true;

        _state.ChatsBusy = true;
        Push();
        try
        {
            if (!_entries.TryGetValue(lastDto.Id, out var last) || last.Input == null) return false;
            var folder = _mode == "archive" ? 1 : _mode.StartsWith("folder:") && int.TryParse(_mode[7..], out var id) ? id : 0;
            var offsetDate = last.Date > 0 ? DateTimeOffset.FromUnixTimeSeconds(last.Date).UtcDateTime : default;
            var result = await _client.Messages_GetDialogs(offset_date: offsetDate, offset_id: last.TopMessage, offset_peer: last.Input, limit: 60, folder_id: folder);
            if (result is not Messages_Dialogs page) return false;

            MergePeers(page.users.Values, page.chats.Values);
            var known = _state.Chats.Where(chat => chat.InList).Select(chat => chat.Id).ToHashSet();
            var added = 0;
            foreach (var dialog in page.Dialogs.OfType<TL.Dialog>())
            {
                var entry = EntryFromPeer(dialog.peer);
                if (entry == null || !known.Add(entry.Id)) continue;
                entry.Pinned = (dialog.flags & TL.Dialog.Flags.pinned) != 0;
                entry.Archived = DesktopChatFolders.IsArchived(folder, dialog.folder_id);
                entry.Marked = DesktopChatFolders.IsMarked(dialog);
                entry.Muted = dialog.notify_settings?.mute_until > DateTime.UtcNow;
                entry.Unread = dialog.unread_count;
                entry.ReadInbox = dialog.read_inbox_max_id;
                entry.ReadOutbox = dialog.read_outbox_max_id;
                entry.TopMessage = dialog.top_message;
                var top = page.Messages.FirstOrDefault(message => message.ID == dialog.top_message);
                entry.Date = top != null ? Unix(top.Date) : 0;
                _entries[entry.Id] = entry;
                _state.Chats.RemoveAll(chat => chat.Id == entry.Id && !chat.InList);
                _state.Chats.Add(new ChatDto
                {
                    Id = entry.Id,
                    Title = entry.Title,
                    Preview = PreviewOf(top),
                    Date = entry.Date,
                    Unread = entry.Unread,
                    ReadInbox = entry.ReadInbox.ToString(),
                    Marked = entry.Marked,
                    Bot = entry.Bot,
                    Type = entry.Type,
                    Pinned = entry.Pinned,
                    Muted = entry.Muted,
                    Archived = entry.Archived,
                    Photo = entry.Photo,
                    Supported = true,
                    Username = entry.Username,
                    IsContact = entry.IsContact,
                    Supergroup = entry.Supergroup,
                    IsForum = entry.IsForum,
                    DefaultSilent = DefaultSilentMark(entry.Id)
                });
                added++;
            }
            _state.ChatsEnd = result is not Messages_DialogsSlice || added == 0;
            _lastDialogsLoad = DateTime.UtcNow;
            _dialogsDirty = false;
            return added > 0;
        }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
        finally
        {
            _state.ChatsBusy = false;
            Push();
        }
    }

    private async Task LoadFoldersLocked()
    {
        try
        {
            var filters = await _client!.Messages_GetDialogFilters();
            var folders = new List<FolderDto>();
            _chatlistIds.Clear();
            if (filters.filters != null)
                foreach (var filter in filters.filters)
                {
                    if (filter is DialogFilter item && item.id > 0)
                        folders.Add(new FolderDto { Id = item.id, Title = item.title?.text ?? $"Carpeta {item.id}" });
                    else if (filter is DialogFilterChatlist list && list.id > 0)
                    {
                        _chatlistIds.Add(list.id);
                        folders.Add(new FolderDto { Id = list.id, Title = list.title?.text ?? $"Lista {list.id}" });
                    }
                }
            _state.Folders = folders;
        }
        catch
        {
            _state.Folders = new List<FolderDto>();
        }
    }

    private async Task<object?> OpenChatAsync(string id, int messageId = 0)
    {
        if (_client?.User == null) throw new BridgeException(DesktopPrivateChat.NoAccount);
        var entry = FindEntry(id);
        if (entry == null)
        {
            await LoadDialogsLocked(_mode, quiet: true);
            entry = FindEntry(id);
        }
        if (entry == null) throw new BridgeException("La conversación no está en la lista cargada. Actualiza la lista e inténtalo de nuevo.");

        _entries.TryAdd(id, entry);
        if (_state.Chats.All(chat => chat.Id != id)) _state.Chats.Add(LookupDto(entry));
        _active = id;
        _state.Active = id;
        _state.Typing = "";
        _state.Messages = new List<MessageDto>();
        _state.History = new HistoryDto { Loading = true };
        Push();
        await RefreshHistoryLocked(anchorUnread: messageId == 0, messageId: messageId);
        return true;
    }

    /// <summary>
    /// Abrir la conversación privada con una persona por su número de usuario, que es lo que trae la tarjeta de
    /// contacto (<c>MessageMediaContact.user_id</c>) y lo que publican las filas de la agenda. Android lo hace con
    /// <c>TdApi.CreatePrivateChat(userId)</c> y <c>session.open(chat.id)</c> (<c>NativeBridge.java:577</c>): TDLib
    /// inventa el chat vacío si no existe, porque el <c>access_hash</c> lo guarda él. Aquí no hay nada que crear —
    /// la conversación es el propio par— y el camino ya está escrito: la clave <c>u</c> + número es la forma que
    /// <see cref="FindEntry"/> sabe leer y <see cref="OpenChatAsync"/> es la que monta la fila, la pone activa y
    /// trae su historial, vacío o no.
    /// <para>
    /// Lo que sí comprueba este brazo antes de llamar es que la sesión conozca a la persona, que es la diferencia
    /// de protocolo dicha con nombre: sin <c>access_hash</c> no hay <c>InputPeerUser</c>, y el hash solo llega en
    /// las listas que Telegram ya mandó. Las dos entradas del botón —la agenda de <c>contacts.list</c> y cualquier
    /// mensaje suyo— rellenan esa caché, así que la negativa queda para un identificador inventado fuera de la app.
    /// La otra divergencia es el regreso: Android devuelve el identificador de chat y aquí se devuelve <c>true</c>,
    /// como en <c>chat.open</c>; ninguna capa mira el valor, la pantalla se entera por el empujón de estado.
    /// </para>
    /// </summary>
    private async Task<object?> OpenContactAsync(string userId)
    {
        var key = DesktopPrivateChat.KeyOf(userId);
        var person = DesktopPrivateChat.UserIdOf(userId);
        if (key == null || person == 0) throw new BridgeException(DesktopPrivateChat.BadId);
        if (_client?.User == null) throw new BridgeException(DesktopPrivateChat.NoAccount);
        if (person != _client.User.id && !_users.ContainsKey(person)) throw new BridgeException(DesktopPrivateChat.Unknown);
        return await OpenChatAsync(key);
    }

    private async Task<object?> OpenSavedAsync()
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para abrir los mensajes guardados.");
        var self = SavedEntry(_client.User.id);
        _entries.TryAdd(self.Id, self);
        return await OpenChatAsync(self.Id);
    }

    private async Task<object?> MuteAsync(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var value = Bool(args, "value");
        await _client.Account_UpdateNotifySettings(new InputNotifyPeer { peer = entry.Input }, new InputPeerNotifySettings
        {
            mute_until = value ? DateTime.UtcNow.AddYears(20) : DateTime.UtcNow.AddMinutes(-1)
        });
        entry.Muted = value;
        foreach (var chat in _state.Chats) if (chat.Id == entry.Id) chat.Muted = value;
        return true;
    }

    /// <summary>
    /// Salir de una comunidad. MTProto no tiene un `LeaveChat` único: el grupo básico se abandona
    /// poniéndose una misma como destinataria de `messages.deleteChatUser` y el canal o supergrupo con
    /// `channels.leaveChannel`. Se relee la lista después, porque la fila tiene que desaparecer y no
    /// quedarse enseñando un chat al que ya no se entra.
    /// </summary>
    private async Task<object?> LeaveChatAsync(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Unsupported) throw new BridgeException(DesktopMembership.Unsupported);
        if (kind == DesktopMembership.Kind.Basic)
        {
            if (entry.Input is not InputPeerChat basic) throw new BridgeException(DesktopMembership.Stale);
            await _client.Messages_DeleteChatUser(basic.chat_id, new InputUserSelf(), DesktopMembership.DeletesHistory(kind));
        }
        else
        {
            if (entry.Input is not InputPeerChannel peer) throw new BridgeException(DesktopMembership.Stale);
            await _client.Channels_LeaveChannel(new InputChannel(peer.channel_id, peer.access_hash));
        }
        _entries.Remove(entry.Id);
        _state.Chats = DesktopMembership.Without(_state.Chats, entry.Id);
        if (_active == entry.Id)
        {
            _active = "0";
            _state.Active = "0";
            _state.Messages = new List<MessageDto>();
            _state.History = new HistoryDto { Latest = true };
        }
        await LoadDialogsLocked(_mode, quiet: true);
        return DesktopMembership.Outcome(DesktopMembership.Left);
    }

    /// <summary>
    /// Entrar en una comunidad descubierta por su usuario público. MTProto lo hace con
    /// `channels.joinChannel`, que solo admite canal o supergrupo: el grupo básico exige el `hash` de un
    /// enlace de invitación y la fila no lo trae, así que se niega con su frase en lugar de mandar una
    /// petición que Telegram no acepta. La pertenencia se mira antes de escribir en la bandera `left` del
    /// `Channel` que el propio Telegram devolvió con la fila —el equivalente al `GetChatMember` de Android—,
    /// y una respuesta que pide aprobación de un administrador llega como error `INVITE_REQUEST_SENT`: es
    /// el estado `request`, no un fracaso, y la fila se queda fuera de la lista porque todavía no se está dentro.
    /// </summary>
    private async Task<object?> JoinChatAsync(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var kind = DesktopMembership.Of(entry.Id);
        if (kind == DesktopMembership.Kind.Unsupported) throw new BridgeException(DesktopMembership.Unsupported);
        if (kind == DesktopMembership.Kind.Basic) throw new BridgeException(DesktopMembership.BasicNeedsLink);
        if (entry.Input is not InputPeerChannel peer) throw new BridgeException(DesktopMembership.Stale);
        if (DesktopMembership.StandingOf(_chats.GetValueOrDefault(peer.channel_id) as Channel) == DesktopMembership.Standing.Inside)
            throw new BridgeException(DesktopMembership.Inside);
        var channel = new InputChannel(peer.channel_id, peer.access_hash);
        try
        {
            await _client.Channels_JoinChannel(channel);
        }
        catch (RpcException rpc)
        {
            var error = rpc.Message ?? "";
            if (DesktopMembership.Banned(error)) throw new BridgeException(DesktopMembership.Blocked);
            if (!DesktopMembership.RequestSent(error)) throw;
            return DesktopMembership.Outcome(DesktopMembership.Requested);
        }
        DesktopMembership.MarkInside(_state.Chats, entry.Id);
        await LoadDialogsLocked(_mode, quiet: true);
        return DesktopMembership.Outcome(DesktopMembership.Joined);
    }

    /// <summary>
    /// El brazo de la tarjeta de enlace. Android lo tiene desde siempre (<c>message.link</c>,
    /// <c>NativeBridge.java:783</c>) y la pantalla lo llama con solo el número del mensaje; en Windows caía en el
    /// rechazo genérico del despacho porque la fila no llegaba a tener dónde mirar: el DTO no publicaba
    /// <c>preview</c>, así que el botón «Abrir enlace externo» no se pintaba nunca. Desde esta ronda el DTO lo
    /// publica <see cref="ConvertMessage"/> y aquí se lee la fila otra vez para sacarle la dirección.
    /// <para>
    /// La lectura es una petición nueva por clic y no un fallo de diseño, por el mismo motivo que declaró la ronda BP
    /// en <c>DesktopSenderProfileFlow.cs</c>: este host no conserva las filas crudas, conserva los DTO que pintó, y en
    /// el DTO no está la dirección —ni puede estar, que es la regla de <see cref="DesktopLinkPreview"/>. La otra
    /// mitad del motivo es el orden: la guarda de la fila tiene que decirse antes que las demás, igual que en Java,
    /// donde <c>message(p)</c> (<c>NativeBridge.java:783</c>) abre el brazo.
    /// </para>
    /// <para>
    /// Tres guardas, en el orden medido en <c>NativeBridge.java:783</c> y todas con la única frase que Android deja
    /// oír cuando un brazo se niega así (<c>DesktopBridge.InvalidRequest</c>, el envoltorio de <c>NativeBridge.java:167</c>):
    /// sin fila en la conversación abierta, con temporizador, y sin tarjeta. La cuarta y la quinta guardas de Java
    /// —«el contenido es texto» y «el texto trae vista previa»— son aquí una sola porque en MTProto el tipo de
    /// contenido no es un campo aparte: es la clase de <c>media</c>. Y la segunda es el mismo predicado con el que
    /// <c>ConvertMessage</c> decide pintar la tarjeta, igual que en Android, donde las dos mitades comparten
    /// <c>MessageExtras.temporary</c>; la guarda se queda aunque la proyección ya la haya hecho, porque el brazo
    /// vuelve a leer la fila y el temporizador puede haber llegado después.
    /// </para>
    /// </summary>
    private async Task<object?> MessageLinkAsync(JsonElement args)
    {
        var client = CollectionClient();
        // `message(p)` de `NativeBridge.java:783`, que dentro es `session.message(id)` con la fila atada al chat
        // activo (`:364`): sin fila no hay dirección que abrir, y Android lo dice con la frase del envoltorio, no con
        // la de «conversación no cargada». Aquí la comparación se cumple por construcción, porque la petición va
        // dirigida al peer activo.
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException(DesktopBridge.InvalidRequest);
        var id = Long(args, "id");
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        var row = DesktopSenderProfile.Row(page.Messages, id);
        if (row == null) throw new BridgeException(DesktopBridge.InvalidRequest);
        if (DesktopSenderProfile.IsEphemeral(row)) throw new BridgeException(DesktopBridge.InvalidRequest);
        var web = DesktopLinkPreview.PageOf(row);
        if (web == null) throw new BridgeException(DesktopBridge.InvalidRequest);
        // El mismo embudo de `link.open` (`:784`), con la dirección sacada de la fila y no del argumento.
        return await LinkFromUrlAsync(DesktopLinkPreview.Url(web), Bool(args, "confirmed"));
    }

    private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(Str(args, "url"), Bool(args, "confirmed"));

    /// <summary>
    /// El router de enlaces de Telegram del host. TDLib lo trae hecho —`getInternalLinkType` dice qué forma
    /// es y `joinChatByInviteLink` entra— y por eso Android resuelve cualquier `t.me/…`. En MTProto ese
    /// router no existe: Windows reconoce la única forma que sí puede cumplir aquí, la invitación a una
    /// comunidad, y entrega al navegador todo lo demás (usuario público, mensaje concreto, historia), que
    /// necesitaría `contacts.resolveUsername` y aperturas que este host aún no ha escrito.
    /// <para>
    /// La invitación se hace en dos tiempos, igual que en Telegram: primero `messages.checkChatInvite`, que
    /// es de lectura y devuelve el nombre y si hace falta aprobación; la pantalla lo confirma con la
    /// persona; y solo entonces `messages.importChatInvite` escribe el ingreso. Sin la confirmación por
    /// delante nada toca Telegram.
    /// </para>
    /// </summary>
    private async Task<object?> LinkFromUrlAsync(string url, bool confirmed)
    {
        if (!DesktopInviteLinks.IsInviteLink(url)) return OpenLink(url) ? new { action = "link" } : throw new BridgeException("El navegador no pudo abrir ese enlace.");
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var hash = DesktopInviteLinks.HashOf(url) ?? throw new BridgeException(DesktopInviteLinks.BadLink);
        ChatInviteBase seen;
        try
        {
            seen = await _client.Messages_CheckChatInvite(hash);
        }
        catch (RpcException rpc)
        {
            throw new BridgeException(LinkRefusal(rpc));
        }
        if (seen is ChatInviteAlready or ChatInvitePeek) throw new BridgeException(DesktopInviteLinks.Inside);
        if (seen is not ChatInvite invite) throw new BridgeException(DesktopInviteLinks.Unknown);
        var flags = invite.flags;
        if ((flags & ChatInvite.Flags.has_subscription_pricing) != 0 && (flags & ChatInvite.Flags.can_refulfill_subscription) == 0)
            throw new BridgeException(DesktopInviteLinks.Paid);
        if ((flags & ChatInvite.Flags.has_bot_verification) != 0) throw new BridgeException(DesktopInviteLinks.WebGuard);
        if (!confirmed)
            return DesktopInviteLinks.Preview(
                DesktopInviteLinks.TitleOf(invite.title),
                invite.participants_count,
                (flags & ChatInvite.Flags.request_needed) != 0);
        Messages_ChatInviteJoinResult answer;
        try
        {
            answer = await _client.Messages_ImportChatInvite(hash);
        }
        catch (RpcException rpc)
        {
            var error = rpc.Message ?? "";
            if (DesktopInviteLinks.RequestSent(error)) return DesktopInviteLinks.Membership(DesktopMembership.Requested);
            throw new BridgeException(LinkRefusal(rpc));
        }
        if (answer is Messages_ChatInviteJoinResultWebView) throw new BridgeException(DesktopInviteLinks.WebGuard);
        if (answer is not Messages_ChatInviteJoinResultOk) throw new BridgeException(DesktopInviteLinks.Unknown);
        await LoadDialogsLocked(_mode, quiet: true);
        return DesktopInviteLinks.Membership(DesktopMembership.Joined);
    }

    /// Los cuatro códigos de Telegram que tienen traducción a una frase de WRGram. Lo demás sube con el
    /// texto de Telegram: inventar una causa propia para un error que no se ha visto sería peor que copiarlo.
    private static string LinkRefusal(RpcException rpc)
    {
        var error = rpc.Message ?? "";
        if (DesktopInviteLinks.ExpiredHash(error)) return DesktopInviteLinks.Expired;
        if (DesktopInviteLinks.Banned(error)) return DesktopMembership.Blocked;
        if (DesktopInviteLinks.AlreadyInside(error)) return DesktopInviteLinks.Inside;
        return error.Length == 0 ? DesktopInviteLinks.Unknown : error;
    }

    // ---- history and messages -------------------------------------------------

    private async Task<object?> RefreshHistoryAsync()
    {
        if (_state.Active != "0") await RefreshHistoryLocked();
        return true;
    }

    /// <summary>
    /// «Ir a una fecha»: el identificador del último mensaje enviado hasta la hora pedida, o <c>null</c> cuando la
    /// franja leída no llega tan lejos —y la pantalla lo traduce sola en «No hay mensajes hasta el final de ese
    /// día.», frase de la interfaz, no del puente.
    /// <para>
    /// Android resuelve la hora con <c>GetChatMessageByDate</c> y su ventana en memoria; aquí la ancla viaja en
    /// <c>messages.getHistory</c> con <c>offset_date</c> y sin <c>offset_id</c>, porque no hay base de datos local
    /// a la que preguntar. La franja de <see cref="DesktopHistoryDate.Page"/> mensajes y la selección local
    /// (<see cref="DesktopHistoryDate.Pick"/>) existen para que la respuesta no dependa de dónde ancló el servidor
    /// la página: lo que se promete es «el más reciente sin pasarse de la frontera», y eso lo decide esta casa.
    /// </para>
    /// <para>
    /// El orden de las negativas es el de <c>messageByDate</c> (<c>NativeBridge.java:3388-3402</c>): primero la
    /// conversación y solo entonces la hora. Dos causas de su primera frase no son traducibles y se dicen en lugar
    /// de fingirse —los chats secretos no existen en este host y no hay temas de foro, así que
    /// <c>session.activeTopic != 0</c> no tiene con qué—; <see cref="DesktopHistoryDate.Changed"/> tampoco es
    /// alcanzable con el ratón, porque en Android nace de un callback que llega tarde y este puente responde en el
    /// mismo hilo en el que leyó el estado. Viaja escrita y probada como contrato, no como gesto.
    /// </para>
    /// </summary>
    private async Task<object?> HistoryDateAsync(JsonElement args)
    {
        var client = CollectionClient();
        var requested = Str(args, "id");
        var entry = FindEntry(requested);
        if (entry == null || requested != _active || entry.Input == null) throw new BridgeException(DesktopHistoryDate.History);
        var at = Long(args, "at");
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        if (!DesktopHistoryDate.Acceptable(at, now)) throw new BridgeException(DesktopHistoryDate.Range);
        var page = await client.Messages_GetHistory(entry.Input, offset_date: DesktopHistoryDate.Anchor(at),
            limit: DesktopHistoryDate.Page);
        var found = DesktopHistoryDate.Pick(page.Messages
            .OfType<TL.Message>()
            .Select(message => ((long)message.ID, Unix(message.date))), at);
        return found?.ToString();
    }

    private async Task RefreshHistoryLocked(bool anchorUnread = false, int messageId = 0)
    {
        if (_client?.User == null) return;
        var entry = FindEntry(_active);
        if (entry == null) return;

        var wantsUnread = anchorUnread && entry.Unread > 0 && entry.TopMessage > entry.ReadInbox;
        var boundary = wantsUnread && entry.ReadInbox > 0;
        var limit = boundary ? 100 : wantsUnread ? Math.Clamp(entry.Unread + 20, 40, 100) : 40;
        _state.History.Loading = true;
        Push();
        try
        {
            var result = messageId > 0
                ? await _client.Messages_GetHistory(entry.Input, offset_id: messageId, add_offset: -15, limit: limit)
                : boundary
                    ? await _client.Messages_GetHistory(entry.Input, offset_id: entry.ReadInbox, add_offset: -100, limit: limit)
                    : await _client.Messages_GetHistory(entry.Input, limit: limit);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var messages = result.Messages
                .Where(message => message.ID > 0)
                .OrderBy(message => message.ID)
                .ToList();

            var anchorId = boundary ? FirstAfter(messages, entry.ReadInbox) : wantsUnread ? UnreadFromEnd(messages, entry.Unread) : 0;
            _state.Messages = messages.Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>().ToList();
            _oldestId = messages.Count > 0 ? messages[0].ID : 0;
            _newestId = messages.Count > 0 ? messages[^1].ID : 0;
            _latest = messageId > 0 ? entry.TopMessage > 0 && _newestId >= entry.TopMessage
                : !boundary || entry.TopMessage <= 0 || _newestId >= entry.TopMessage;
            _historyEnd = _latest && result.Messages.Length < limit;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = _latest, Anchor = anchorId.ToString() };
            _entryReadOutbox(entry, messages.Count > 0 ? messages[^1].ID : 0);
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
        }
        catch (Exception ex)
        {
            _state.History = new HistoryDto { Loading = false, Error = Describe(ex), End = false, Latest = true };
            _state.Error = Describe(ex);
            Push();
        }
    }

    private void _entryReadOutbox(ChatEntry entry, int latest)
    {
        if (latest <= 0) return;
        foreach (var chat in _state.Chats)
        {
            if (chat.Id != entry.Id) continue;
            entry.ReadOutbox = Math.Max(entry.ReadOutbox, latest);
        }
    }

    private static int FirstAfter(List<MessageBase> page, int boundary)
    {
        var first = 0;
        foreach (var message in page)
            if (message.ID > boundary && (first == 0 || message.ID < first)) first = message.ID;
        return first;
    }

    private static int UnreadFromEnd(List<MessageBase> page, int unread)
    {
        var incoming = page
            .Where(message => message is TL.Message item && (item.flags & TL.Message.Flags.out_) == 0)
            .Select(message => message.ID)
            .OrderByDescending(id => id)
            .ToList();
        if (incoming.Count == 0) return 0;
        return incoming[Math.Min(Math.Max(unread, 1), incoming.Count) - 1];
    }

    private async Task<object?> LoadOlderAsync()
    {
        if (_client?.User == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación para cargar su historial.");
        if (_historyEnd) return true;

        _state.History.Loading = true;
        Push();
        try
        {
            var result = await _client.Messages_GetHistory(entry.Input, offset_id: _oldestId, limit: 40);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var older = result.Messages
                .Where(message => message.ID > 0 && message.ID < _oldestId)
                .OrderBy(message => message.ID)
                .ToList();

            if (older.Count > 0)
            {
                var converted = older.Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>();
                _state.Messages.InsertRange(0, converted);
                _oldestId = older[0].ID;
            }
            _historyEnd = result.Messages.Length < 40 || older.Count == 0;
            _latest = false;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = false, Anchor = _state.History.Anchor };
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
            return true;
        }
        catch (Exception ex)
        {
            _state.History.Loading = false;
            _state.History.Error = Describe(ex);
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    private async Task<object?> LoadNewerAsync()
    {
        if (_client?.User == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación para cargar su historial.");
        if (_latest) return true;

        _state.History.Loading = true;
        Push();
        try
        {
            var result = await _client.Messages_GetHistory(entry.Input, offset_id: _newestId, add_offset: -40, limit: 40);
            if (result is Messages_Messages page)
                MergePeers(page.users.Values, page.chats.Values);

            var newer = result.Messages
                .Where(message => message.ID > _newestId)
                .OrderBy(message => message.ID)
                .ToList();

            if (newer.Count > 0)
            {
                var known = _state.Messages.Select(message => message.Id).ToHashSet();
                var converted = newer.Where(message => !known.Contains(message.ID.ToString()))
                    .Select(message => ConvertMessage(message, entry)).Where(message => message != null).Cast<MessageDto>();
                _state.Messages.AddRange(converted);
                _newestId = newer[^1].ID;
            }
            _latest = newer.Count == 0 || entry.TopMessage <= 0 || _newestId >= entry.TopMessage;
            _state.History = new HistoryDto { Loading = false, Error = "", End = _historyEnd, Latest = _latest, Anchor = _state.History.Anchor };
            _lastHistoryLoad = DateTime.UtcNow;
            _historyDirty = false;
            Push();
            return true;
        }
        catch (Exception ex)
        {
            _state.History.Loading = false;
            _state.History.Error = Describe(ex);
            _state.Error = Describe(ex);
            throw new BridgeException(_state.Error, ex);
        }
    }

    private async Task<object?> ReadActiveAsync()
    {
        var entry = FindEntry(_active);
        if (entry == null) return true;
        await ReadHistoryLocked(entry);
        return true;
    }

    private async Task ReadHistoryLocked(ChatEntry entry)
    {
        if (_client == null) return;
        var latest = entry.TopMessage > 0 ? entry.TopMessage : _state.Messages.LastOrDefault()?.Id is { } id && int.TryParse(id, out var value) ? value : 0;
        var confirmed = false;
        try
        {
            if (latest > 0) { await _client.Messages_ReadHistory(entry.Input, latest); confirmed = true; }
        }
        catch { }
        entry.Unread = 0;
        var floor = confirmed ? Math.Max(entry.ReadInbox, latest) : entry.ReadInbox;
        entry.ReadInbox = floor;
        foreach (var chat in _state.Chats)
            if (chat.Id == entry.Id)
            {
                chat.Unread = 0;
                chat.ReadInbox = floor.ToString();
            }
        _state.History.Anchor = "0";
        Push();
    }

    private async Task<object?> SendAsync(JsonElement args)
    {
        if (_client?.User == null) throw new BridgeException("Inicia sesión para enviar mensajes.");
        if (args.TryGetProperty("accountId", out _) &&
            (Str(args, "accountId") != _state.SelfId || Str(args, "chatId") != _active))
            throw new BridgeException("La conversación cambió. No se envió el mensaje.");
        var entry = FindEntry(_active);
        if (entry == null) throw new BridgeException("Abre una conversación antes de enviar.");
        var text = Str(args, "text");
        if (string.IsNullOrWhiteSpace(text)) throw new BridgeException("El mensaje está vacío.");

        var replyId = (int)Long(args, "reply", 0);
        var silent = SilentFor(entry.Id, args);
        // La ventana de la hora y el «cuando esté en línea» se deciden en un solo sitio, compartido con el
        // reenvío. Antes `Long(args, "schedule", 0)` leía el texto `"online"` como 0 y el mensaje salía en el
        // momento: la pantalla creía haber programado una espera que nunca existió.
        var when = Str(args, "schedule");
        if (DesktopSchedule.IsOnline(when)) throw new BridgeException(DesktopSchedule.WhenOnline);
        var schedule = DesktopSchedule.Epoch(when);
        var scheduleProblem = DesktopSchedule.Problem(schedule, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        if (scheduleProblem != null) throw new BridgeException(scheduleProblem);
        // El formato se decide antes de marcar el envío como en curso: una entidad que no pasa no es un
        // mensaje que pueda haber salido, y Android la niega también antes de tocar la red.
        var entities = ParseEntities(args, text);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            InputReplyTo? reply = replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null;
            DateTime? scheduleDate = DesktopSchedule.Date(schedule);
            await _client.Messages_SendMessage(entry.Input, text, Random.Shared.NextInt64(1, long.MaxValue),
                reply_to: reply, entities: entities, schedule_date: scheduleDate, silent: silent, clear_draft: true);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            if (schedule <= 0)
            {
                await RefreshHistoryLocked();
                _dialogsDirty = true;
            }
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    private async Task<object?> TypingAsync(JsonElement args)
    {
        if (_client?.User == null || !_state.Appearance.Typing) return true;
        var entry = FindEntry(_active);
        if (entry == null) return true;
        try
        {
            await _client.Messages_SetTyping(entry.Input, Bool(args, "active") ? new SendMessageTypingAction() : new SendMessageCancelAction());
        }
        catch { }
        return true;
    }

    private async Task<object?> DraftAsync(JsonElement args)
    {
        if (_client?.User == null || Str(args, "accountId", _state.SelfId) != _state.SelfId) return false;
        var entry = FindEntry(Str(args, "chatId", _active));
        if (entry == null) return false;
        return await _client.Messages_SaveDraft(entry.Input, Str(args, "text"));
    }

    private bool CopyMessage(string id)
    {
        var message = _state.Messages.FirstOrDefault(item => item.Id == id);
        if (message == null || string.IsNullOrEmpty(message.Text)) return false;
        // La bandera `noforwards` de Telegram no es solo «no se puede reenviar»: la documentación de la librería
        // dice que el cliente debe impedir también guardar el contenido. Android hace lo mismo con
        // `canBeCopied`, y lo hace lanzando en lugar de devolver `false`, porque un copia-y-pega que no copia
        // y no dice nada se lee como un fallo de la interfaz.
        if (!message.CanForward) throw new BridgeException(DesktopMessageForward.Protected);
        try
        {
            Application.Current.Dispatcher.Invoke(() => Clipboard.SetText(message.Text));
            return true;
        }
        catch
        {
            return false;
        }
    }

    /// <summary>
    /// Borrar uno o varios mensajes de la conversación abierta. TDLib lo hace con un único `DeleteMessages` y
    /// una bandera `revoke`; en MTProto hay dos peticiones y no son simétricas: `messages.deleteMessages`
    /// admite `revoke` pero solo llega a privados y grupos básicos, y `channels.deleteMessages` llega al canal
    /// y borra siempre para toda la comunidad. La elección de petición y las negaciones honestas viven en
    /// <see cref="DesktopMessageDelete"/>; aquí solo se mira la ventana cargada antes de escribir.
    /// <para>
    /// Se exige que todos los ids pedidos estén en la pantalla y en esta conversación. Android hace lo mismo a
    /// su manera —<c>NativeBridge.message</c> lanza «Unknown message» si el mensaje no es del chat activo—, y
    /// en MTProto la razón es peor: los ids de <c>messages.deleteMessages</c> viajan sin destinatario, así que
    /// un id de otra conversación borraría lo que el servidor asocie a ese número.
    /// </para>
    /// </summary>
    private async Task<object?> DeleteMessagesAsync(JsonElement args, bool batch)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var requested = batch ? Arr(args, "ids") : new[] { Str(args, "id") };
        if (requested.Length == 0 || requested.Length > DesktopMessageDelete.MaxBatch) throw new BridgeException(DesktopMessageDelete.BatchSize);
        var ids = DesktopMessageDelete.Ids(requested) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);
        var entry = RequireEntry(_active);
        var kind = DesktopMessageDelete.Of(entry.Id);
        if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);
        var revoke = Bool(args, "revoke");
        if (!revoke && !DesktopMessageDelete.CanDeleteSelf(kind)) throw new BridgeException(DesktopMessageDelete.NoSelfInChannel);
        var rows = DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids);
        if (rows.Count != ids.Length) throw new BridgeException(DesktopMessageDelete.NotLoaded);
        var channel = kind == DesktopMessageDelete.Kind.Channel ? ChannelOf(entry) : null;
        if (revoke && rows.Any(row => !DesktopMessageDelete.CanDeleteAll(kind, row.Outgoing, channel))) throw new BridgeException(DesktopMessageDelete.NotYours);
        if (kind == DesktopMessageDelete.Kind.Channel)
        {
            if (entry.Input is not InputPeerChannel peer) throw new BridgeException(DesktopMessageDelete.Stale);
            await _client.Channels_DeleteMessages(new InputChannel(peer.channel_id, peer.access_hash), ids);
        }
        else
        {
            await _client.Messages_DeleteMessages(ids, revoke);
        }
        _state.Messages = DesktopMessageDelete.Without(_state.Messages, ids);
        Push();
        return true;
    }

    /// La fila de canal que la sesión tiene en caché, o null si la conversación no es un canal. Es el único
    /// testigo de los permisos que Telegram mandó, igual que en <c>ProtectedChat</c>.
    private Channel? ChannelOf(ChatEntry entry) => entry.Peer switch
    {
        PeerChannel peer => _chats.GetValueOrDefault(peer.channel_id) as Channel,
        _ => null
    };

    /// <summary>
    /// Reenviar uno o varios mensajes de la conversación abierta a la que la pantalla eligió como destino. A
    /// diferencia del borrado, MTProto tiene <b>una sola</b> petición para todas las formas de chat, así que
    /// aquí no se elige camino por la clave: <c>from_peer</c> es la conversación activa, <c>to_peer</c> el
    /// destino, y los ids viajan con su <c>random_id</c> (el campo que la librería documenta como
    /// «prevención de reenvíos duplicados», y que ya se genera igual en <c>SendAsync</c>).
    /// <para>
    /// Se exige que las filas estén cargadas en esta conversación antes que nada: sin ese requisito, un id de
    /// otra chats se resolvería contra <c>from_peer</c> y Telegram copiaría otro mensaje o devolvería
    /// <c>MESSAGE_ID_INVALID</c>, y ninguna de las dos cosas es lo que se pidió. La protección de contenido se
    /// mira en la propia fila, igual que hace Android con <c>canBeForwarded</c> antes de escribir. La hora
    /// «cuando esté en línea» no existe en esta petición y se dice; no se envía ahora en silencio.
    /// </para>
    /// <para>
    /// El fallo se trata como en <c>SendAsync</c>: un <c>messages.forwardMessages</c> que tira puede haber
    /// escrito medio lote, así que queda marcado como incierto y se nombra el destino en la frase, porque es
    /// donde hay que mirar antes de repetir.
    /// </para>
    /// </summary>
    private async Task<object?> ForwardAsync(JsonElement args, bool batch)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var requested = batch ? Arr(args, "ids") : new[] { Str(args, "id") };
        if (requested.Length == 0 || requested.Length > DesktopMessageForward.MaxBatch) throw new BridgeException(DesktopMessageForward.BatchSize);
        var ids = DesktopMessageDelete.Ids(requested) ?? throw new BridgeException(DesktopMessageForward.OutOfRange);
        var source = RequireEntry(_active);
        var rows = DesktopMessageDelete.Loaded(_state.Messages, source.Id, ids);
        if (rows.Count != ids.Length) throw new BridgeException(DesktopMessageForward.NotLoaded);
        if (rows.Any(row => !row.CanForward)) throw new BridgeException(DesktopMessageForward.Protected);
        var target = FindEntry(Str(args, "to")) ?? throw new BridgeException(DesktopMessageForward.NoTarget);
        var when = Str(args, "schedule");
        if (DesktopSchedule.IsOnline(when)) throw new BridgeException(DesktopSchedule.WhenOnline);
        var epoch = DesktopSchedule.Epoch(when);
        var problem = DesktopSchedule.Problem(epoch, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        if (problem != null) throw new BridgeException(problem);
        var copy = Bool(args, "sendCopy");
        var captions = DesktopMessageForward.DropCaptions(copy, Bool(args, "removeCaption"));
        var silent = SilentFor(target.Id, args);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            var random = ids.Select(_ => Random.Shared.NextInt64(1, long.MaxValue)).ToArray();
            await _client.Messages_ForwardMessages(source.Input, ids, random, target.Input,
                schedule_date: DesktopSchedule.Date(epoch), silent: silent,
                drop_author: copy, drop_media_captions: captions);
            _state.Uncertain = false;
            _dialogsDirty = true;
            if (target.Id == source.Id) await RefreshHistoryLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el reenvío. Revisa el historial del destino antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    /// <summary>
    /// Fijar o desfijar un mensaje de la conversación abierta. A diferencia del borrado, aquí MTProto tiene
    /// <b>una sola</b> petición para las cuatro formas de chat —<c>messages.updatePinnedMessage</c>— y TDLib
    /// también una por dirección, así que no hay camino que elegir: lo que se decide es si la cuenta puede
    /// pedirla, y eso lo dice <see cref="DesktopMessagePin"/>. Las dos banderas van fijas como en Android:
    /// sin aviso y, en un uno a uno, solo en mi lado, que es lo que la pantalla promete con su etiqueta.
    /// <para>
    /// Se exige la fila cargada en esta conversación antes que nada, igual que en el borrado y el reenvío: la
    /// petición no lleva destinatario implícito por id, pero un id de otro chat fijaría el mensaje que el
    /// servidor asocie a ese número <b>aquí</b>, que es el peer que se manda.
    /// </para>
    /// <para>
    /// El fallo no se marca como incierto: un <c>updatePinnedMessage</c> que tira no cambió nada, y repetir el
    /// toque es inofensivo. Lo que sí se escribe es la respuesta buena en el caché del ancla, para que la barra
    /// aparezca sin esperar a que Telegram mande su aviso.
    /// </para>
    /// </summary>
    private async Task<object?> PinMessageAsync(JsonElement args)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var ids = DesktopMessageDelete.Ids(new[] { Str(args, "id") }) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);
        var entry = RequireEntry(_active);
        var kind = DesktopMessageDelete.Of(entry.Id);
        if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);
        var rows = DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids);
        if (rows.Count != 1) throw new BridgeException(DesktopMessageDelete.NotLoaded);
        var unpin = !Bool(args, "value", true);
        var channel = kind == DesktopMessageDelete.Kind.Channel ? ChannelOf(entry) : null;
        if (!DesktopMessagePin.CanPin(kind, rows[0], channel)) throw new BridgeException(DesktopMessagePin.Refused);
        try
        {
            await _client.Messages_UpdatePinnedMessage(entry.Input, ids[0],
                silent: DesktopMessagePin.Silent, unpin: unpin, pm_oneside: DesktopMessagePin.OneSide);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el cambio en el mensaje fijado. " + message, ex);
        }
        _pins[entry.Id] = unpin ? 0 : ids[0];
        _pinProbed.Remove(entry.Id);
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// Editar el texto propio de un mensaje, o el pie de su archivo, con <c>messages.editMessage</c>. La
    /// pantalla llama a las dos caras por métodos y parámetros distintos —<c>text</c> y <c>caption</c>—, pero la
    /// petición es una sola: lo que cambia es si hay que volver a mandar el adjunto.
    /// <para>
    /// Se lee la fila en Telegram antes de escribir, y no es un lujo. <c>messages.editMessage</c> reemplaza el
    /// mensaje en vez de parchearlo: cambiar el pie de una foto sin llevar la foto borraría la foto, y el único
    /// <c>access_hash</c> válido para volver a mandarla es el que el servidor acaba de dar, no el que trajo el
    /// historial de hace un rato. De ahí también los dos avisos de fila cambiada: si el adjunto apareció o
    /// desapareció entre la pintura y el toque, lo que hay delante no es lo que la persona quiere editar.
    /// </para>
    /// <para>
    /// El pie viaja en el argumento <c>message</c>, no dentro del <c>InputMedia</c>: en esta versión de la
    /// librería las clases <c>InputMediaPhoto</c> e <c>InputMediaDocument</c> no tienen campo de caption, que es
    /// como <c>messages.sendMedia</c> también lo recibe. Por eso la misma llamada sirve para las dos caras.
    /// </para>
    /// <para>
    /// El derecho lo dice <see cref="DesktopMessageEdit"/> antes de nada: autoría, o <c>edit_messages</c> en un
    /// canal. Un fallo de red no se marca como incierto —la edición no se aplicó si la petición tiró—, y el
    /// bueno se escribe en la fila cargada para que la ventana cambie sin esperar al <c>updateEditMessage</c>,
    /// que <see cref="HandleUpdate"/> ya sabe aplicar por su cuenta.
    /// </para>
    /// </summary>
    private async Task<object?> EditMessageAsync(JsonElement args, bool caption)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var ids = DesktopMessageDelete.Ids(new[] { Str(args, "id") }) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);
        var entry = RequireEntry(_active);
        var kind = DesktopMessageDelete.Of(entry.Id);
        if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);
        var rows = DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids);
        if (rows.Count != 1) throw new BridgeException(DesktopMessageDelete.NotLoaded);
        var row = rows[0];
        var channel = kind == DesktopMessageDelete.Kind.Channel ? ChannelOf(entry) : null;
        var allowed = caption
            ? DesktopMessageEdit.CanEditCaption(row, kind, channel)
            : DesktopMessageEdit.CanEditText(row, kind, channel);
        if (!allowed) throw new BridgeException(DesktopMessageEdit.Refused);
        var value = Str(args, caption ? "caption" : "text");
        var maximum = caption ? DesktopMessageEdit.MaxCaption : DesktopMessageEdit.MaxText;
        if (!DesktopMessageEdit.Fits(value, maximum)) throw new BridgeException(DesktopMessageEdit.TooLong(maximum));
        if (value.Length == 0 && !DesktopMessageEdit.AllowsBlank(caption)) throw new BridgeException(DesktopMessageEdit.Blank);

        var client = _client;
        TL.Message fresh;
        try
        {
            var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });
            fresh = found.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == ids[0])
                ?? throw new BridgeException(DesktopMessageEdit.Gone);
        }
        catch (BridgeException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopMessageEdit.NotRead, ex);
        }

        InputMedia? media = null;
        if (caption)
        {
            if (DesktopMessageEdit.HasCaption(fresh.media) != row.HasCaption) throw new BridgeException(DesktopMessageEdit.Changed);
            media = DesktopMessageEdit.MediaOf(fresh.media) ?? throw new BridgeException(DesktopMessageEdit.Changed);
        }
        else if (fresh.media != null)
        {
            throw new BridgeException(DesktopMessageEdit.Changed);
        }

        var entities = ParseEntities(args, value);
        try
        {
            await client.Messages_EditMessage(entry.Input, ids[0], message: value, media: media, entities: entities);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la edición en Telegram. " + message, ex);
        }
        row.Text = value;
        row.Entities = ConvertEntities(entities, value);
        row.Edited = true;
        if (_textCache.TryGetValue(entry.Id, out var texts)) texts[ids[0]] = value;
        Push();
        return true;
    }

    /// <summary>
    /// Sustituir el archivo de un mensaje que ya salió, sin tocar el texto que lo acompaña. La orden es de la
    /// ronda CK en Android (<c>NativeBridge.editMessageMedia</c>) y las reglas están en
    /// <see cref="DesktopMessageEditMedia"/>.
    /// <para>
    /// El orden de las negativas es el de Android con una adaptación que obliga el cable: aquí negar es gratis y
    /// subir cuesta, así que todo lo que se puede decidir sin escribir se decide antes de la
    /// <c>upload.saveFilePart</c>. Android arma el contenido en su hilo y pregunta con
    /// <c>GetMessageProperties</c>; en MTProto no hay propiedad que consultar, así que la pregunta se contesta con
    /// la fila que <c>messages.getMessages</c> acaba de devolver —la misma lectura que obliga la otra cara de
    /// editar: <c>messages.editMessage</c> reemplaza, no parchea—.
    /// </para>
    /// <para>
    /// El pie viaja de vuelta tal cual, con sus entidades y con la bandera de ponerlo encima del medio, porque
    /// la petición reescribe el texto junto al archivo. Si la petición falla, el archivo elegido se queda en el
    /// outbox: no se tiró nada y la persona puede reintentar sin volver al selector. Si cuaja, se tira la copia
    /// —Android la borra en el mismo momento— y el historial se releé, porque la fila vieja apunta al archivo que
    /// ya no está.
    /// </para>
    /// </summary>
    private async Task<object?> EditMessageMediaAsync(JsonElement args)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var client = _client;
        var ids = DesktopMessageDelete.Ids(new[] { Str(args, "id") }) ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);
        var token = Str(args, "token");
        // La misma guarda de `send.attachment` y la misma frase de Android: un vale que no es de esta cuenta o de
        // esta conversación no es un archivo, es equipaje de otra ventana.
        if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)
            throw new BridgeException(DesktopMessageEditMedia.Changed);
        var entry = RequireEntry(_active);
        var kind = DesktopMessageDelete.Of(entry.Id);
        if (kind == DesktopMessageDelete.Kind.Unknown) throw new BridgeException(DesktopMessageDelete.Stale);
        if (DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids).Count != 1)
            throw new BridgeException(DesktopMessageDelete.NotLoaded);
        if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);
        var wanted = DesktopMessageEditMedia.WantedKind(file.Mime);
        var channelAllowed = kind == DesktopMessageDelete.Kind.Channel && DesktopMessageEdit.ChannelRightsToEdit(ChannelOf(entry));

        TL.Message fresh;
        try
        {
            var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });
            fresh = found.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == ids[0])
                ?? throw new BridgeException(DesktopMessageEdit.Gone);
        }
        catch (BridgeException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopMessageEdit.NotRead, ex);
        }

        var current = DesktopMessageEditMedia.CurrentKind(fresh.media);
        var problem = DesktopMessageEditMedia.Problem(DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed),
            current, wanted, DesktopMessageEditMedia.GroupedId(fresh));
        if (problem != null) throw new BridgeException(problem);

        try
        {
            var uploaded = await client.UploadFileAsync(file.Path, null);
            var media = DesktopMessageEditMedia.MediaFor(wanted, file.Name, file.Mime, uploaded,
                DesktopMessageEditMedia.HasSpoiler(fresh.media));
            await client.Messages_EditMessage(entry.Input, ids[0],
                message: DesktopMessageEditMedia.CaptionOf(fresh),
                media: media,
                entities: DesktopMessageEditMedia.CaptionEntitiesOf(fresh),
                invert_media: DesktopMessageEditMedia.ShowsCaptionAboveMedia(fresh));
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la edición en Telegram. " + message, ex);
        }
        DropOutbox(token);
        _historyDirty = true;
        _dialogsDirty = true;
        await RefreshHistoryLocked();
        Push();
        return true;
    }

    /// <summary>
    /// La bandeja de programados de una conversación. <c>messages.getScheduledMessages</c> con la lista de ids
    /// vacía devuelve la bandeja entera, y la respuesta es <c>messages.messages</c> —que es la base de
    /// <c>messages.messagesSlice</c>, así que una sola prueba de tipo cubre las dos formas—. La conversión se
    /// hace con <c>scheduled: true</c>: en una fila programada el campo <c>date</c> es la hora a la que saldrá,
    /// y sus ids viven en un namespace aparte que puede coincidir con el de un mensaje ya enviado, así que no se
    /// anotan ni en las citas ni en el ancla de fijados.
    /// </summary>
    private async Task<object?> ScheduledListAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = ScheduledTarget(args);
        MessageBase[] rows;
        try
        {
            var found = await client.Messages_GetScheduledMessages(entry.Input, []);
            rows = (found as Messages_Messages)?.messages ?? [];
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException(DesktopScheduled.Prepare + " " + message, ex);
        }
        return rows.OfType<TL.Message>()
            .Select(message => ConvertMessage(message, entry, scheduled: true))
            .OfType<MessageDto>()
            .ToArray();
    }

    /// Las cuatro órdenes empiezan igual que en <c>NativeBridge</c>: la conversación tiene que seguir siendo la
    /// abierta —Android descarta la respuesta si cambió mientras el puente trabajaba— y la fila tiene que estar
    /// cargada en el puente.
    private ChatEntry ScheduledTarget(JsonElement args)
    {
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Id != _active) throw new BridgeException(DesktopScheduled.ChangedChat);
        return entry;
    }

    /// El id de la fila programada, con la misma lectura de enteros que ya usaban la edición y el borrado.
    private static int ScheduledMessageId(JsonElement args) =>
        DesktopMessageDelete.Ids(new[] { Str(args, "messageId") })?[0] ?? throw new BridgeException(DesktopMessageDelete.OutOfRange);

    /// La mira de <c>NativeBridge.withScheduledMessage</c>: antes de tocar nada se vuelve a leer la bandeja y se
    /// busca la fila. Lo que ya no está se dice con la frase de Android, y lo que no se pudo leer con la suya,
    /// porque ninguna de las tres escrituras se lanza sobre lo que la pantalla pintó hace un rato.
    private static async Task<TL.Message> ScheduledRowAsync(Client client, ChatEntry entry, int id)
    {
        try
        {
            var found = await client.Messages_GetScheduledMessages(entry.Input, []);
            return DesktopScheduled.Find((found as Messages_Messages)?.messages, id)
                ?? throw new BridgeException(DesktopScheduled.NotScheduled);
        }
        catch (BridgeException)
        {
            throw;
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopScheduled.Prepare + " " + Describe(ex), ex);
        }
    }

    /// <summary>
    /// Vaciar la bandeja antes de hora: <c>messages.sendScheduledMessages</c>, que es la única petición que
    /// manda ya una fila programada. Un recurrente se niega con la frase de Android, y el aviso de que la fila
    /// pasó al historial lo trae el propio <c>HandleUpdate</c> por su camino de siempre.
    /// </summary>
    private async Task<object?> ScheduledSendAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = ScheduledTarget(args);
        var id = ScheduledMessageId(args);
        var fresh = await ScheduledRowAsync(client, entry, id);
        if (DesktopScheduled.IsRecurring(fresh)) throw new BridgeException(DesktopScheduled.Recurring);
        try
        {
            await client.Messages_SendScheduledMessages(entry.Input, new[] { id });
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se envió el mensaje programado. " + message, ex);
        }
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// Cambiar la hora de un programado. Aquí no hay <c>EditMessageSchedulingState</c>: la hora nueva se escribe
    /// con <c>messages.editMessage</c> y su <c>schedule_date</c>, y esa petición reemplaza en vez de parchear,
    /// así que la fila se vuelve a mandar entera —texto, <c>entities</c> y archivo— tal como Telegram la acaba
    /// de devolver. Lo que <see cref="DesktopMessageEdit.MediaOf"/> no sabe reconstruir se niega con nombre:
    /// dejar la fila sin contenido sería peor que no cambiar la hora.
    /// <para>
    /// «Cuando el destinatario se conecte» se niega con la misma frase con la que la ronda AD lo cortaba en
    /// <c>send.text</c> y en el reenvío, y la ventana de la hora es la de <see cref="DesktopSchedule"/>. Un cero
    /// también cae fuera: en Android la comprobación <c>at &lt; segundos + 5</c> lo rechaza, y aquí se rechaza
    /// igual para que las dos capas digan lo mismo con el mismo argumento.
    /// </para>
    /// </summary>
    private async Task<object?> ScheduledRescheduleAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = ScheduledTarget(args);
        var id = ScheduledMessageId(args);
        if (Bool(args, "online")) throw new BridgeException(DesktopSchedule.WhenOnline);
        var epoch = Long(args, "at");
        var problem = DesktopSchedule.Problem(epoch, DateTimeOffset.UtcNow.ToUnixTimeSeconds());
        if (problem != null || epoch == 0) throw new BridgeException(DesktopSchedule.Range);
        var fresh = await ScheduledRowAsync(client, entry, id);
        if (DesktopScheduled.IsRecurring(fresh)) throw new BridgeException(DesktopScheduled.Recurring);
        if (!DesktopScheduled.KeepsContent(fresh)) throw new BridgeException(DesktopScheduled.Unsupported);
        var media = DesktopMessageEdit.MediaOf(fresh.media);
        try
        {
            await client.Messages_EditMessage(entry.Input, id, message: fresh.message, media: media,
                entities: fresh.entities, schedule_date: DesktopSchedule.Date(epoch));
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la nueva hora en Telegram. " + message, ex);
        }
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// Quitar un programado sin enviarlo: <c>messages.deleteScheduledMessages</c>, que es la petición propia —no
    /// <c>messages.deleteMessages</c>, que es del historial y ni siquiera ve la bandeja—. A diferencia de las
    /// otras dos escrituras, un recurrente sí se puede borrar: aquí no se reescribe nada, se tira.
    /// </summary>
    private async Task<object?> ScheduledDeleteAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = ScheduledTarget(args);
        var id = ScheduledMessageId(args);
        await ScheduledRowAsync(client, entry, id);
        try
        {
            await client.Messages_DeleteScheduledMessages(entry.Input, new[] { id });
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la eliminación del mensaje programado. " + message, ex);
        }
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// El archivo que la persona eligió y que todavía no se envió. Android guarda lo mismo en su mapa
    /// <c>attachments</c>: la ruta de la copia, el nombre, el tipo y —esto es lo que hace que un vale no sirva
    /// para otra cosa— la cuenta y la conversación que estaban abiertas al elegir.
    /// </summary>
    private sealed record OutboxFile(string Path, string Name, string Mime, long Account, string Chat);

    /// Los vales vivos, indexados por el token que la pantalla devuelve después en <c>send.attachment</c>. El
    /// token no es una clave de Telegram: es el modo de decir «esto lo elegiste aquí», igual que en Android.
    private readonly Dictionary<string, OutboxFile> _outbox = new();

    /// <summary>
    /// Abrir el selector de Windows y quedarse con una copia propia del archivo.
    /// <para>
    /// Por qué una copia: el <c>OpenFileDialog</c> devuelve una ruta del disco de la persona y, entre elegirla y
    /// confirmar el envío, esa ruta puede cambiar —la app que la creó la mueve, alguien la renombra, un antivirus
    /// la deja escrita a medias—. Android copia por el mismo motivo en <c>NativeBridge.picked</c>, con el tope de
    /// 32 MB comprobado mientras se escribe y no después; aquí se hace lo mismo sobre <c>outbox</c> de la carpeta
    /// de datos de la aplicación.
    /// </para>
    /// <para>
    /// Cancelar no es un error: Android responde <c>null</c> y la pantalla no abre la confirmación. El diálogo se
    /// muestra en el hilo de la interfaz, como ya hace «Guardar como…» de <c>media.export</c>.
    /// </para>
    /// </summary>
    private async Task<object?> AttachmentPickAsync(string kind)
    {
        var client = CollectionClient();
        string? chosen;
        try
        {
            chosen = Application.Current.Dispatcher.Invoke(() =>
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Title = DesktopAttachment.PickerTitle(kind),
                    Filter = DesktopAttachment.PickerFilter(kind),
                    CheckFileExists = true,
                    Multiselect = false
                };
                return dialog.ShowDialog() == true ? dialog.FileName : null;
            });
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopAttachment.NoPicker, ex);
        }
        if (chosen == null) return null;
        // El nombre se guarda saneado y en una carpeta con un guid, así que dos «factura.pdf» elegidas el mismo
        // día no se pisan entre sí ni heredan la ruta de la otra.
        var name = DesktopAttachment.NameOf(Path.GetFileName(chosen));
        var folder = Path.Combine(_store.OutboxDirectory, Guid.NewGuid().ToString("N"));
        var target = Path.Combine(folder, name);
        long size;
        try
        {
            Directory.CreateDirectory(folder);
            size = await ImportCopyAsync(target, chosen);
        }
        catch (BridgeException)
        {
            DeleteFolder(folder);
            throw;
        }
        catch (Exception ex)
        {
            DeleteFolder(folder);
            throw new BridgeException(DesktopAttachment.TooBig, ex);
        }
        var token = Guid.NewGuid().ToString("N");
        _outbox[token] = new OutboxFile(target, name, DesktopAttachment.MimeOf(name), client.User!.id, _active);
        return new AttachmentDto { Token = token, Name = name, Size = size };
    }

    /// Copiar con el corte de Android: se cuenta cada bloque y en cuanto se pasa del tope se deja de escribir y
    /// se lanza, porque un vídeo de 4 GB no tiene por qué caber dos veces en el disco antes de saber que no cabe.
    /// Va en asincronía porque el hilo del puente es el de la interfaz y una unidad de red puede tardar.
    private static async Task<long> ImportCopyAsync(string target, string source)
    {
        var written = 0L;
        await using var input = File.OpenRead(source);
        await using var output = File.Create(target);
        var buffer = new byte[DesktopAttachment.BufferBytes];
        int read;
        while ((read = await input.ReadAsync(buffer)) > 0)
        {
            written += read;
            if (DesktopAttachment.Exceeds(written)) throw new BridgeException(DesktopAttachment.TooBig);
            await output.WriteAsync(buffer.AsMemory(0, read));
        }
        return written;
    }

    /// Tirar la copia y su carpeta. Se traga cualquier fallo: un problema al borrar el equipaje de un envío que
    /// no cuajó no puede convertirse en una excepción de disco por encima de la negativa que sí importa.
    private static void DeleteFolder(string folder)
    {
        try { if (Directory.Exists(folder)) Directory.Delete(folder, true); } catch { }
    }

    private void DropOutbox(string token)
    {
        if (!_outbox.TryGetValue(token, out var file)) return;
        _outbox.Remove(token);
        var folder = Path.GetDirectoryName(file.Path);
        if (folder != null) DeleteFolder(folder);
    }

    /// <c>NativeBridge.clearUnsent</c>: al cerrar sesión o apagar la app no pueden quedar copias de archivos que
    /// ya no se van a enviar nunca. Android lo hace además al cambiar de cuenta; aquí <c>DisposeClientLocked</c>
    /// solo se ejecuta con la sesión ya cerrada, que es el mismo momento.
    private void ClearOutbox()
    {
        foreach (var token in _outbox.Keys.ToArray()) DropOutbox(token);
    }

    /// <summary>
    /// Subir y enviar el archivo elegido. La subida (<c>upload.saveFilePart</c> dentro de
    /// <c>Client.UploadFileAsync</c>) la hace la librería; lo que añade el puente es la decisión de
    /// <c>NativeBridge.sendAttachment</c>: con los tres MIME de foto se manda <c>inputMediaUploadedPhoto</c>, que
    /// es lo que hace que la pieza salga con miniatura y se abra al tocarla; con cualquier otro se manda
    /// <c>inputMediaUploadedDocument</c> con su <c>mime_type</c> y su <c>DocumentAttributeFilename</c>, que es de
    /// donde Telegram saca el nombre que se ve en la burbuja.
    /// <para>
    /// El orden de las negativas es el de Android: primero el vale —que exista y que sea de esta cuenta y de esta
    /// conversación—, después el historial sin confirmar, y solo entonces se comprueba el archivo y se sube.
    /// Subir antes de mirar el destino sería pagar una subida de 30 MB por un mensaje que no se iba a enviar.
    /// </para>
    /// <para>
    /// No hay caption: la pantalla no manda texto con el adjunto, el hueco del pie de foto es de la ronda que
    /// conecte la leyenda junto al archivo.
    /// </para>
    /// </summary>
    private async Task<object?> SendAttachmentAsync(JsonElement args)
    {
        var client = CollectionClient();
        var token = Str(args, "token");
        if (!_outbox.TryGetValue(token, out var file)) throw new BridgeException(DesktopAttachment.NotPrepared);
        if (file.Account != client.User!.id || file.Chat != _active)
        {
            DropOutbox(token);
            throw new BridgeException(DesktopAttachment.ChangedChat);
        }
        if (_state.Uncertain) throw new BridgeException(DesktopAttachment.Uncertain);
        var entry = RequireEntry(_active);
        if (!File.Exists(file.Path))
        {
            DropOutbox(token);
            throw new BridgeException(DesktopAttachment.NotPrepared);
        }
        var replyId = (int)Long(args, "reply", 0);
        var silent = SilentFor(entry.Id, args);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            var uploaded = await client.UploadFileAsync(file.Path, null);
            InputMedia media = DesktopAttachment.IsPhoto(file.Mime)
                ? new InputMediaUploadedPhoto { file = uploaded }
                : new InputMediaUploadedDocument
                {
                    file = uploaded, mime_type = file.Mime,
                    attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)
                };
            await client.Messages_SendMedia(entry.Input, media, "", Random.Shared.NextInt64(1, long.MaxValue),
                reply_to: replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null,
                silent: silent, clear_draft: true);
            DropOutbox(token);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            await RefreshHistoryLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    /// Quitar el vale y su copia antes de enviar. Android lo hace en <c>attachment.discard</c> y responde
    /// <c>true</c> aunque el token no estuviera —la pantalla lo llama al cerrar un panel cuyo archivo ya se
    /// envió—, así que aquí tampoco hay nada que negar.
    private object? AttachmentDiscardAsync(JsonElement args)
    {
        DropOutbox(Str(args, "token"));
        return true;
    }

    /// <summary>
    /// Elegir de dos a diez fotos para un álbum. Es <c>NativeBridge.pickedAlbum</c> con el selector de Windows:
    /// cancelar responde <c>null</c>, volver con una sola foto o con once se niega con la frase de Android y, si
    /// alguna pieza no es de las tres que este host sabe mandar como foto, se niega <b>antes</b> de copiar nada.
    /// <para>
    /// Android descubre el tipo con <c>ContentResolver.getType</c> y además no puede traer otra cosa porque abre
    /// el selector con <c>image/*</c>; aquí la extensión es lo único que hay y el diálogo ofrece «Todos los
    /// archivos», así que la comprobación va delante de la copia para no dejar en el disco siete fotos de un lote
    /// que se iba a rechazar por la octava. Lo mismo aplica al tope: si una pasa de 32 MB se tira el lote entero,
    /// que es lo que hace el <c>catch</c> de <c>pickedAlbum</c> con su frase de las diez imágenes.
    /// </para>
    /// <para>
    /// Cada foto va a su propia carpeta con GUID en vez de compartir la del álbum como en Android, y no por
    /// capricho: <see cref="DropOutbox"/> se lleva por delante la carpeta entera, y en un álbum eso borraría las
    /// hermanas cuando la pantalla descarta una sola pieza. El resultado visible es el mismo —un vale por foto,
    /// con su nombre y su tamaño—.
    /// </para>
    /// </summary>
    private async Task<object?> AttachmentAlbumAsync()
    {
        var client = CollectionClient();
        string[] chosen;
        try
        {
            chosen = Application.Current.Dispatcher.Invoke(() =>
            {
                var dialog = new Microsoft.Win32.OpenFileDialog
                {
                    Title = "Enviar un álbum de fotos",
                    Filter = "Imágenes|*.jpg;*.jpeg;*.png;*.webp|Todos los archivos|*.*",
                    CheckFileExists = true,
                    Multiselect = true
                };
                return dialog.ShowDialog() == true ? dialog.FileNames : Array.Empty<string>();
            });
        }
        catch (Exception ex)
        {
            throw new BridgeException(DesktopAlbum.NoPicker, ex);
        }
        // Vacío es cancelar, no un error: Android responde lo mismo y la pantalla cierra el panel sin más.
        if (chosen.Length == 0) return null;
        var refusal = DesktopAlbum.CountError(chosen.Length);
        if (refusal != null) throw new BridgeException(refusal);
        var planned = new List<(string Source, string Name, string Mime)>(chosen.Length);
        foreach (var source in chosen)
        {
            var name = DesktopAttachment.NameOf(Path.GetFileName(source), "foto");
            var mime = DesktopAttachment.MimeOf(name);
            if (!DesktopAttachment.IsPhoto(mime)) throw new BridgeException(DesktopAlbum.NotPhoto);
            planned.Add((source, name, mime));
        }
        var account = client.User!.id;
        var chat = _active;
        var issued = new List<string>(planned.Count);
        var result = new List<AttachmentDto>(planned.Count);
        try
        {
            foreach (var (source, name, mime) in planned)
            {
                var folder = Path.Combine(_store.OutboxDirectory, Guid.NewGuid().ToString("N"));
                var target = Path.Combine(folder, name);
                long size;
                try
                {
                    Directory.CreateDirectory(folder);
                    size = await ImportCopyAsync(target, source);
                }
                catch (Exception ex)
                {
                    DeleteFolder(folder);
                    throw new BridgeException(DesktopAlbum.ImportFailed, ex);
                }
                var token = Guid.NewGuid().ToString("N");
                _outbox[token] = new OutboxFile(target, name, mime, account, chat);
                issued.Add(token);
                result.Add(new AttachmentDto { Token = token, Name = name, Size = size });
            }
        }
        catch
        {
            // Un lote a medias no existe: lo que ya estaba copiado se tira antes de decir que no.
            foreach (var token in issued) DropOutbox(token);
            throw;
        }
        return result.ToArray();
    }

    /// <summary>
    /// Mandar el álbum. En MTProto es una sola petición —<c>messages.sendMultiMedia</c> con un
    /// <c>InputSingleMedia</c> por foto, cada uno con su <c>random_id</c>— y eso es lo que hace que Telegram las
    /// agrupe en una burbuja con su contador, igual que el <c>sendAlbum</c> de TDLib en Android.
    /// <para>
    /// El orden de las negativas es el de <c>NativeBridge.sendAlbum</c>: primero el tamaño del lote, después el
    /// historial sin confirmar y solo entonces pieza por pieza —que el vale exista y sea de esta cuenta y de esta
    /// conversación, con la frase del álbum, que la copia siga en disco y que sea una foto de las tres que esta vía
    /// admite—. Subir todas las fotos antes de mirar el destino sería pagar diez subidas por un mensaje que no se
    /// iba a enviar.
    /// </para>
    /// <para>
    /// La última comprobación es la que Android no puede hacer: allí <c>photoContent</c> entrega la ruta a TDLib y
    /// el propio motor decide qué es el archivo, mientras que aquí el tipo se elige en el puente y un vale de
    /// documento suelto colado en la lista del álbum se subiría entero para que Telegram lo rechazara después. La
    /// pantalla nunca manda esa mezcla, pero el puente no la admite tampoco.
    /// </para>
    /// <para>
    /// No hay pie de foto por pieza: <c>InputSingleMedia</c> admite <c>message</c> y <c>entities</c>, pero la
    /// pantalla no manda texto junto al adjunto en ninguna de las dos capas y el hueco es de la ronda que conecte
    /// la leyenda. Lo mismo con <c>thumb</c>, que se deja vacío a propósito.
    /// </para>
    /// </summary>
    private async Task<object?> SendAlbumAsync(JsonElement args)
    {
        var client = CollectionClient();
        var tokens = Arr(args, "tokens");
        if (!DesktopAlbum.Fits(tokens.Length)) throw new BridgeException(DesktopAlbum.Batch);
        if (_state.Uncertain) throw new BridgeException(DesktopAlbum.Uncertain);
        var entry = RequireEntry(_active);
        var files = new List<OutboxFile>(tokens.Length);
        foreach (var token in tokens)
        {
            if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)
                throw new BridgeException(DesktopAlbum.ChangedPieces);
            if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);
            if (!DesktopAttachment.IsPhoto(file.Mime)) throw new BridgeException(DesktopAlbum.NotPhoto);
            files.Add(file);
        }
        var replyId = (int)Long(args, "reply", 0);
        var silent = SilentFor(entry.Id, args);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            var media = new InputSingleMedia[files.Count];
            for (var i = 0; i < files.Count; i++)
            {
                var uploaded = await client.UploadFileAsync(files[i].Path, null);
                media[i] = new InputSingleMedia
                {
                    media = new InputMediaUploadedPhoto { file = uploaded },
                    random_id = Random.Shared.NextInt64(1, long.MaxValue)
                };
            }
            await client.Messages_SendMultiMedia(entry.Input, media,
                reply_to: replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null,
                silent: silent, clear_draft: true);
            foreach (var token in tokens) DropOutbox(token);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            await RefreshHistoryLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    /// <summary>
    /// Los textos de las piezas de un álbum, la lectura que necesita «Editar textos del álbum». En Android es
    /// <c>album</c> (<c>NativeBridge.java:4029-4035</c>); aquí <see cref="DesktopAlbum"/> pone la ventana y las
    /// tres negativas.
    /// <para>
    /// Android hace dos lecturas de diez mensajes ancladas en el mensaje tocado —<c>GetChatHistory(chat,id,-9,10)</c>
    /// y <c>GetChatHistory(chat,id,0,10)</c>— porque los identificadores locales de TDLib no garantizan que las
    /// piezas de un álbum estén contiguas. Aquí basta una: <c>offset_id</c> en el ancla, <c>add_offset</c> de
    /// <c>-Window</c> para empezar la franja diez mensajes más abajo y <c>limit</c> de <c>Window * 3</c>, que deja
    /// esa cola de diez anteriores y diecinueve posteriores. Sobra para las diez piezas que
    /// <see cref="DesktopAlbum.Max"/> permite, porque un álbum se envía de una vez y sus identificadores van
    /// seguidos.
    /// </para>
    /// <para>
    /// El orden de las negativas es el del puente, y responde a las tres preguntas en el mismo orden: ¿está el
    /// mensaje que toqué?, ¿es de un álbum?, ¿hay al menos dos piezas?. Las frases son las de Android copiadas
    /// carácter a carácter, menos la cuarta («No se pudo consultar el álbum.»), que es de un fallo de red y en
    /// C# la atiende el <c>catch</c> genérico del puente.
    /// </para>
    /// <para>
    /// Es una lectura de pantalla: no marca leído, no ensucia el historial ni deja nada que deshacer. Podría
    /// haberse pedido el álbum entero a Telegram, pero eso es una petición más cara por algo que la ventana ya
    /// tiene.
    /// </para>
    /// </summary>
    private async Task<object?> AlbumItemsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var id = Long(args, "id");
        if (id <= 0) throw new BridgeException(DesktopAlbum.Gone);
        var page = await client.Messages_GetHistory(entry.Input, offset_id: (int)id,
            add_offset: -DesktopAlbum.Window, limit: DesktopAlbum.Window * 3);
        var rows = page.Messages.OfType<TL.Message>().Where(message => message.ID > 0).ToList();
        var anchor = rows.FirstOrDefault(message => message.ID == id);
        if (anchor == null) throw new BridgeException(DesktopAlbum.Gone);
        var grouped = DesktopAlbum.AlbumIdOf(anchor);
        if (grouped == null) throw new BridgeException(DesktopAlbum.NoAlbum);
        var items = rows
            .Where(message => DesktopAlbum.AlbumIdOf(message) == grouped)
            .OrderBy(message => message.ID)
            .Select(message => new AlbumCaptionDto { Id = message.ID.ToString(), Text = message.message ?? "" })
            .ToArray();
        if (items.Length < DesktopAlbum.Min) throw new BridgeException(DesktopAlbum.NoItems);
        return items;
    }

    /// <summary>
    /// Enviar una encuesta, la segunda escritura del adjunto que no es un archivo. En Android es
    /// <c>NativeBridge.sendPoll</c>, que monta un <c>InputMessagePoll</c> y lo deja en manos de TDLib; aquí el
    /// mismo contenido viaja como <c>InputMediaPoll</c> por la <c>messages.sendMedia</c> que ya conoce la ronda AK.
    /// <para>
    /// El orden de las quince negativas es el del puente, línea a línea, con dos excepciones contadas en
    /// <see cref="DesktopPoll"/>: la de los chats secretos no es alcanzable en este host y la del largo de la
    /// pregunta se dice en español con la frase que la propia pantalla ya escribe. Las dos primeras comprobaciones
    /// —puede escribir la cuenta, admite encuesta la conversación— se leen de la fila de Telegram que la sesión ya
    /// tiene cacheada, sin petición extra: TDLib mantiene los permisos al día por dentro y aquí no hay a quién
    /// preguntárselos, así que <see cref="DesktopPoll.Of"/> lee los <c>ChatBannedRights</c> que la fila publica.
    /// </para>
    /// <para>
    /// Lo que no se ve desde la pantalla: <c>poll.id</c> y las claves de cada opción <b>los sortea esta capa</b>,
    /// porque el esquema de MTProto los pide y no hay servidor que los dé antes de enviar. De ahí que
    /// <see cref="DesktopPoll.OptionKeys"/> prometa claves distintas: son lo único que <see cref="AnswerPollAsync"/>
    /// podrá volver a pedir. Solo cuando la encuesta no lleva fotos; con ellas la forma del cable es
    /// <see cref="InputPollAnswer"/>, que no declara <c>option</c> —ver <see cref="DesktopPoll.Answer"/>—.
    /// </para>
    /// <para>
    /// Las tres negativas de las fotos —el vale, el MIME y el lote— van entre el tamaño del lote de opciones y el
    /// texto de cada opción, que es el sitio que les corresponde en <c>sendPoll</c>. La subida, en cambio, no: esa
    /// se hace dentro del <c>try</c>, cuando ya nada rechaza la encuesta. Si alguna foto se queda a medio subir,
    /// <see cref="DesktopAttachment.Uncertain"/> no tiene por qué aparecer: no se mandó nada, así que el aviso que
    /// sale es el de la propia excepción de la librería, traducido por <c>Describe</c>.
    /// </para>
    /// </summary>
    private async Task<object?> SendPollAsync(JsonElement args)
    {
        var client = CollectionClient();
        if (_state.Uncertain) throw new BridgeException(DesktopAttachment.Uncertain);
        var entry = RequireEntry(_active);
        var rights = DesktopPoll.Of(ChatRow(entry));
        if (!DesktopPoll.CanSendText(rights)) throw new BridgeException(DesktopPoll.Sending);
        // Un uno a uno solo admite encuesta si es un bot o la propia cuenta. Es la regla de Telegram, no del
        // cliente, y el host ya trae la marca de bot leída del `User` vivo al construir la lista.
        if (entry.Type == "private" &&
            !DesktopPoll.PrivateOk(entry.Bot, entry.Peer is PeerUser self && self.user_id == client.User!.id))
            throw new BridgeException(DesktopPoll.Private);
        if (!DesktopPoll.CanSendPolls(rights)) throw new BridgeException(DesktopPoll.NotAllowed);
        // La longitud se mide sobre el texto sin recortar, que es como Android la comprueba dentro de
        // `BridgePolicy.text` antes de hacer el `trim()`.
        var raw = Str(args, "question");
        if (!DesktopPoll.WithinQuestion(raw)) throw new BridgeException(DesktopPoll.TooLong);
        var question = DesktopPoll.Trim(raw);
        if (!DesktopPoll.HasQuestion(question)) throw new BridgeException(DesktopPoll.NoQuestion);
        var options = Arr(args, "options").Select(DesktopPoll.Trim).ToArray();
        if (!DesktopPoll.Fits(options.Length)) throw new BridgeException(DesktopPoll.Batch);
        // Las dos negativas de las fotos van justo aquí, que es donde las tiene <c>sendPoll</c>: primero se comprueba
        // cada vale —que siga siendo de esta cuenta y de esta conversación, que sea una de las tres MIME de foto— y
        // después el lote, porque en el cable la foto viaja por posición. Se comprueban antes de mirar el texto de
        // las opciones, igual que Android.
        var pictures = DesktopPoll.Photos(Arr(args, "media"));
        var photos = new OutboxFile[pictures.Length];
        for (var position = 0; position < pictures.Length; position++)
        {
            if (!_outbox.TryGetValue(pictures[position], out var picked) ||
                picked.Account != client.User!.id || picked.Chat != _active)
                throw new BridgeException(DesktopPoll.ChangedPhotos);
            if (!DesktopAttachment.IsPhoto(picked.Mime)) throw new BridgeException(DesktopPoll.NotPhoto);
            photos[position] = picked;
        }
        if (!DesktopPoll.PhotosMatch(pictures.Length, options.Length))
            throw new BridgeException(DesktopPoll.UnevenPhotos);
        if (options.Any(option => !DesktopPoll.FitsOption(option))) throw new BridgeException(DesktopPoll.Option);
        if (DesktopPoll.Repeats(options)) throw new BridgeException(DesktopPoll.Repeated);
        var quiz = Bool(args, "quiz");
        var correct = (int)Long(args, "correct", -1);
        if (quiz && !DesktopPoll.AllowsCorrect(correct, options.Length)) throw new BridgeException(DesktopPoll.NoCorrect);
        // La penúltima negación del envío es la del cierre, y era la última hasta la ronda CM: la franja va de 5
        // segundos a 2.628.000, y el cero significa «sin cierre».
        var duration = (int)Long(args, "duration", 0);
        if (!DesktopPoll.ClosesInRange(duration)) throw new BridgeException(DesktopPoll.CloseRange);
        // La última es la de la descripción, que solo existe en Android: aquí no hay campo de la librería donde
        // meterla, así que se niega antes de montar una petición que no la puede llevar.
        if (DesktopPoll.HasDescription(Str(args, "description"))) throw new BridgeException(DesktopPoll.NoDescription);
        // Con fotos no hay clave que inventar: `inputPollAnswer` no declara campo `option`, así que la clave opaca
        // la pone Telegram en la fila que devuelve —que es justo la que lee `AnswerPollAsync`—. Sin fotos sigue
        // viajando `pollAnswer` con la clave sorteada aquí, como desde la ronda AN.
        var keys = pictures.Length > 0 ? null : DesktopPoll.OptionKeys(options.Length);
        var answers = new PollAnswerBase[options.Length];
        for (var position = 0; position < options.Length; position++)
            answers[position] = DesktopPoll.Answer(options[position], keys?[position]);
        var poll = new TL.Poll
        {
            id = DesktopPoll.NewPollId(),
            hash = DesktopPoll.NewPollId(),
            flags = DesktopPoll.FlagsFor(quiz, Bool(args, "anonymous", true), Bool(args, "multiple"),
                Bool(args, "revoting"), Bool(args, "hide")),
            question = new TextWithEntities { text = question, entities = new MessageEntity[0] },
            answers = answers
        };
        var media = new InputMediaPoll { poll = poll };
        // Android escribe el periodo en `poll.openPeriod` y deja que TDLib saque la fecha; MTProto pide la fecha
        // absoluta dentro del propio `TL.Poll`, así que se calcula contra el reloj de esta petición. La bandera va
        // puesta con el campo: un `close_date` sin `has_close_date` sería una petición mal formada.
        if (duration > 0)
        {
            poll.flags |= TL.Poll.Flags.has_close_date;
            poll.close_date = DesktopPoll.CloseDate(Unix(DateTime.UtcNow), duration);
        }
        // Las dos banderas del cuestionario se ponen a la vez que su campo: `has_correct_answers` con un array
        // vacío y `has_solution` sin texto serían una petición mal formada, y el error llegaría de Telegram.
        if (quiz)
        {
            media.flags |= InputMediaPoll.Flags.has_correct_answers;
            media.correct_answers = new[] { correct };
            var explanation = DesktopPoll.Trim(Str(args, "explanation"));
            if (DesktopPoll.HasSolution(explanation))
            {
                media.flags |= InputMediaPoll.Flags.has_solution;
                media.solution = explanation.Length > DesktopPoll.MaxExplanation
                    ? explanation[..DesktopPoll.MaxExplanation]
                    : explanation;
            }
        }
        var replyId = (int)Long(args, "reply", 0);
        var silent = SilentFor(entry.Id, args);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            // Cada foto cuesta dos peticiones: el archivo subido a los servidores (`upload.saveFilePart` dentro de
            // <c>UploadFileAsync</c>) y ese mismo archivo convertido en medio de la conversación con
            // `messages.uploadMedia`, que es la que devuelve el `photo` con su <c>access_hash</c> y su
            // <c>file_reference</c> —los tres campos del <c>inputPhoto</c> que la encuesta cita—. Se hace aquí, y no
            // antes de las negativas, para no pagar una subida por una encuesta ya rechazada: el mismo orden que el
            // álbum de la ronda AL.
            for (var position = 0; position < photos.Length; position++)
            {
                var uploaded = await client.UploadFileAsync(photos[position].Path, null);
                var stored = await client.Messages_UploadMedia(
                    entry.Input, new InputMediaUploadedPhoto { file = uploaded });
                if (stored is not MessageMediaPhoto { photo: Photo picture })
                    throw new BridgeException(DesktopPoll.NotPhoto);
                var answer = (InputPollAnswer)answers[position];
                answer.flags |= InputPollAnswer.Flags.has_media;
                answer.media = new InputMediaPhoto
                {
                    id = new InputPhoto
                    {
                        id = picture.id, access_hash = picture.access_hash, file_reference = picture.file_reference
                    }
                };
            }
            await client.Messages_SendMedia(entry.Input, media, "", Random.Shared.NextInt64(1, long.MaxValue),
                reply_to: replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null,
                silent: silent, clear_draft: true);
            foreach (var token in pictures) DropOutbox(token);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            await RefreshHistoryLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    /// <summary>
    /// Votar una encuesta. Escribe, y por la regla de la ronda AH primero lee: las claves que
    /// <c>messages.sendVote</c> pide no son los índices que la pantalla toca, son los strings opacos que
    /// <see cref="DesktopPoll.OptionKeys"/> sorteó al enviar y que solo están en la fila de Telegram. Sin esa
    /// lectura, un voto en la opción 2 de una encuesta con las respuestas barajadas caería en otra opción.
    /// <para>
    /// Las cuatro negativas siguen el orden de <c>answerPoll</c>: ¿está la fila?, ¿es una encuesta?, ¿el lote de
    /// índices es de una a diez y ninguno negativo?, ¿existe esa opción?. Android lanza en las dos últimas un
    /// <c>IllegalArgumentException()</c> sin mensaje; aquí cada una tiene el suyo, y la última nombra la causa
    /// real —la pantalla se quedó atrás— en vez de dejar que TDLib responda por nosotros.
    /// </para>
    /// <para>
    /// No se comprueba si la encuesta está cerrada ni si ya se votó: <c>answerPoll</c> tampoco lo hace, y las dos
    /// señales ya están en la tarjeta (<c>poll.closed</c>, <c>poll.restriction</c> y la marca de la opción), que es
    /// donde la pantalla deshabilita los botones. Lo que sí hace falta es que el recuento vuelva, y eso lo trae el
    /// <c>updateMessagePoll</c> que responde la propia petición —ver <see cref="OnPoll"/>—.
    /// </para>
    /// </summary>
    private async Task<object?> AnswerPollAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var id = Long(args, "id");
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        var row = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == id);
        if (row == null) throw new BridgeException(DesktopPoll.Gone);
        if (row.media is not MessageMediaPoll { poll: { } poll }) throw new BridgeException(DesktopPoll.NoPoll);
        // El lote se niega después de la fila y no antes, que es el orden de Android. Cuesta una lectura que con
        // un lote mal formado sobraba, y se paga: dos capas que responden cosas distintas a la misma petición
        // malformada son dos capas que se van a desfasar.
        var indices = DesktopPoll.Indices(Arr(args, "options"));
        if (indices == null) throw new BridgeException(DesktopPoll.NoVote);
        var keys = DesktopPoll.KeysFor(poll, indices);
        if (keys == null) throw new BridgeException(DesktopPoll.Stale);
        await client.Messages_SendVote(entry.Input, (int)id, keys);
        Push();
        return true;
    }

    /// <summary>
    /// Ver quién votó una opción. Es lectura pura: no marca nada como leído, no sube nada y no gasta vales, y por eso
    /// este método no toca <c>_state.Sending</c> ni ensucia el historial. En Android es <c>NativeBridge.pollVoters</c>
    /// (<c>:4638</c>), que le da a TDLib un índice de opción, un número de votantes saltados y un tope; aquí la
    /// petición es <c>messages.getPollVotes</c> y pide la <b>clave opaca</b> de la opción, la misma que
    /// <see cref="AnswerPollAsync"/> tuvo que leer antes de votar. De ahí que se vuelva a leer la fila: no es un lujo,
    /// es de donde sale esa clave, y de paso es donde se puede negar «esto no es una encuesta» sin engañar a nadie.
    /// <para>
    /// El orden de las negativas es el de <c>pollVoters</c> —¿está la fila?, ¿es una encuesta?, ¿el índice de opción
    /// vale?— y después van dos comprobaciones que en Android hacía TDLib por dentro y que aquí se ven en el dato:
    /// el anonimato y que la opción siga existiendo. Las tres frases están razonadas en <see cref="DesktopPoll"/>; la
    /// de la paginación es la única divergencia real entre los dos protocolos, porque el desplazamiento de MTProto es
    /// un cursor opaco y este puente no reparte cursores.
    /// </para>
    /// <para>
    /// Lo que devuelve son los dos campos de siempre: <c>total</c> —los votos que tiene la opción, que Telegram cuenta
    /// aunque esta página no los traiga todos— y <c>items</c> con el nombre y la fecha en segundos de cada votante.
    /// La fecha la multiplica la pantalla por 1000 (<c>BatchPanels.tsx:58</c>), así que viaja en segundos de Unix, no
    /// como un <c>DateTime</c> serializado.
    /// </para>
    /// </summary>
    private async Task<object?> PollVotersAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var id = Long(args, "id");
        var option = (int)Long(args, "option", -1);
        var limit = DesktopPoll.VoterLimit((int)Long(args, "limit", DesktopPoll.MaxVoters));
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        var row = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == id);
        if (row == null) throw new BridgeException(DesktopPoll.Gone);
        if (row.media is not MessageMediaPoll { poll: { } poll }) throw new BridgeException(DesktopPoll.NoPoll);
        if (option < 0) throw new BridgeException(DesktopPoll.NoOption);
        // El anonimato se niega antes de preguntar: no es que Telegram fuera a contestar mal, es que no tiene nada
        // que contestar, y una lectura que se sabe vacía no se manda.
        if (DesktopPoll.IsAnonymous(poll)) throw new BridgeException(DesktopPoll.AnonymousVoters);
        // Un desplazamiento negativo Android lo aplana a cero con su <c>Math.max(0,…)</c>, así que solo el positivo
        // es un pedido de otra página —y esa página no existe mientras no se entregue el cursor.
        if (Long(args, "offset") > 0) throw new BridgeException(DesktopPoll.OnlyFirstPage);
        var keys = DesktopPoll.KeysFor(poll, new[] { option });
        if (keys == null) throw new BridgeException(DesktopPoll.Stale);
        var votes = await client.Messages_GetPollVotes(entry.Input, (int)id, limit, option: keys[0]);
        // Quien votó puede no estar en la cache de la conversación: la respuesta trae sus propias tablas de `users`
        // y `chats`, y <see cref="MergePeers"/> es lo que permite ponerles nombre sin una petición extra por persona.
        MergePeers(votes.users?.Values, votes.chats?.Values);
        var self = client.User!.id;
        var items = new List<PollVoterDto>();
        foreach (var vote in votes.votes ?? new MessagePeerVoteBase[0])
        {
            // La clase base no publica ni quién ni cuándo: <see cref="DesktopPoll.VoterOf"/> saca el par del subtipo
            // que sea, y lo que no tenga subtipo conocido se descarta en vez de inventarle una fila vacía.
            var (peer, date) = DesktopPoll.VoterOf(vote);
            if (peer == null) continue;
            items.Add(new PollVoterDto { Name = VoterName(peer, self), Date = Unix(date) });
        }
        return new PollVotersDto { Total = votes.count, Items = items };
    }

    /// El nombre de un votante, con las tres salidas literales de <c>TdSession.senderName</c> para que la misma
    /// persona se lea igual desde los dos dispositivos: uno mismo es «Tú», quien no está cacheado es «Usuario de
    /// Telegram» y una conversación sin título conocido, «Conversación». El recorte por 120 sí es de este host, y por
    /// la misma razón que en <c>SenderData</c>: un título de canal no tiene longitud prometida por nadie.
    private string VoterName(Peer? peer, long self) => peer switch
    {
        PeerUser user when user.user_id == self => DesktopPoll.VoterSelf,
        PeerUser user when _users.TryGetValue(user.user_id, out var voter) => Clip(FullName(voter), 120),
        PeerUser => DesktopPoll.VoterUnknown,
        PeerChat chat when _chats.TryGetValue(chat.chat_id, out var group) && !string.IsNullOrWhiteSpace(group.Title) => Clip(group.Title, 120),
        PeerChannel channel when _chats.TryGetValue(channel.channel_id, out var community) && !string.IsNullOrWhiteSpace(community.Title) => Clip(community.Title, 120),
        _ => DesktopPoll.VoterUnknownChat
    };

    /// <summary>
    /// La agenda entera, la primera de las dos lecturas de la ronda AP. <c>contacts.getContacts</c> trae en el mismo
    /// cuerpo los identificadores y los <c>User</c> completos, así que la lista se arma sin una petición por persona
    /// —a diferencia de la de votantes, donde cada nombre dependía de la caché—. Las tres columnas que ve la
    /// pantalla (nombre, usuario público y marca de bot) se traducen con las reglas de <see cref="DesktopContact"/>,
    /// que son las de <c>NativeBridge.contacts</c> y no las de <see cref="FullName"/>: la tabla que consume la
    /// interfaz tiene que ser la misma en los dos dispositivos, y «Usuario» no es «Usuario 4567891».
    /// <para>
    /// El <c>catch</c> solo abraza la proyección, porque eso es lo que Android envuelve: si falla la petición sube
    /// el error de Telegram tal cual; si falla armar la tabla sube «No se pudieron preparar los contactos.». El
    /// orden de salida es el de Telegram, sin reordenar: TDLib tampoco promete uno.
    /// </para>
    /// </summary>
    private async Task<List<ContactDto>> ListContactsAsync()
    {
        var client = CollectionClient();
        var page = await client.Contacts_GetContacts();
        try
        {
            MergePeers(page.users?.Values, null);
            var rows = new List<ContactDto>();
            foreach (var contact in page.contacts ?? new TL.Contact[0])
                if (_users.TryGetValue(contact.user_id, out var person)) rows.Add(ContactRow(person));
            return rows;
        }
        catch (Exception ex) when (ex is not BridgeException)
        {
            throw new BridgeException(DesktopContact.Prepare, ex);
        }
    }

    /// <summary>
    /// La búsqueda de la agenda. El largo se mide <b>antes</b> del <c>trim()</c>, como la pregunta de la encuesta:
    /// <c>BridgePolicy.text(p,"query",80)</c> corta por arriba dentro de <c>contacts.search</c> y solo después
    /// recorta, así que 100 espacios se niegan por largos y no por vacíos.
    /// <para>
    /// <c>bots: true</c> no es un descuido: la pantalla filtra con la marca que el DTO lleva
    /// (<c>BatchPanels.tsx:147</c>, <c>App.tsx:1446</c>), y con los bots excluidos en el puente las dos capas
    /// responderían listas distintas a la misma palabra. <c>my_results</c> va delante de <c>results</c> porque lo
    /// propio pesa más, y la deduplicación es de <see cref="DesktopContact.UserIds"/>: la pantalla usa el id como
    /// clave de React y un id repetido sería un aviso encima de un resultado correcto.
    /// </para>
    /// </summary>
    private async Task<List<ContactDto>> SearchContactsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var raw = Str(args, "query");
        if (raw.Length > DesktopContact.MaxQuery) throw new BridgeException(DesktopContact.LongQuery);
        var found = await client.Contacts_Search(raw.Trim(), DesktopContact.MaxResults, broadcasts: false, bots: true);
        try
        {
            MergePeers(found.users?.Values, found.chats?.Values);
            var rows = new List<ContactDto>();
            foreach (var id in DesktopContact.UserIds(found.my_results, found.results))
                if (_users.TryGetValue(id, out var person)) rows.Add(ContactRow(person));
            return rows;
        }
        catch (Exception ex) when (ex is not BridgeException)
        {
            throw new BridgeException(DesktopContact.Prepare, ex);
        }
    }

    /// Las cuatro columnas del DTO, sin petición extra. El retrato de Android no viaja en esta ronda —la lista de
    /// hasta 50 personas costaría una descarga por fila— y la pantalla lo sustituye con iniciales
    /// (<c>ContactAvatar</c>, <c>App.tsx:98</c>), así que lo que falta es un dibujo y no un dato.
    private static ContactDto ContactRow(User person) => new()
    {
        Id = person.id.ToString(),
        Name = DesktopContact.DisplayName(person),
        Username = DesktopContact.Username(person),
        Bot = DesktopContact.IsBot(person)
    };

    /// <summary>
    /// Compartir un contacto, la escritura de la ronda AP. En Android es un <c>TdApi.Contact</c> dentro de
    /// <c>InputMessageContact</c>; aquí es <c>InputMediaContact</c> por la misma <c>messages.sendMedia</c> de la
    /// ronda AK. No hay subida: la tarjeta no tiene cuerpo binario, así que tampoco hay outbox que limpiar ni vale
    /// que caduque, y el equipaje de la persona compartida son cuatro campos de texto.
    /// <para>
    /// El orden de las negativas es el de <c>shareContact</c> línea a línea: puede escribir la cuenta —con la misma
    /// frase de la encuesta, referenciada y no copiada—, admite la conversación una tarjeta, tiene esta sesión a la
    /// persona y expone Telegram su número. La primera guarda junta las dos primeras líneas de Android: allí
    /// <c>session.canSend()</c> responde antes de mirar el chat, y un chat desconocido responde «no puedes enviar»,
    /// no «no está cargado». La de los derechos es una traducción contada en <see cref="DesktopContact"/>: el bit
    /// que ata una tarjeta de contacto en MTProto es <c>send_docs</c>.
    /// </para>
    /// <para>
    /// La tercera no existe en Android, porque TDLib puede pedir cualquier usuario por su id y MTProto necesita el
    /// <c>access_hash</c> que solo viene en la lista. No es un hueco de este cable: sin la agenda abierta en la
    /// sesión no hay a quién preguntar el número, y la salida real es volver a abrirla. El número se comprueba
    /// <b>antes</b> de armar la tarjeta porque es la privacidad de la persona compartida —mandar una tarjeta sin
    /// número sería escribir en el chat algo que nadie autorizó—.
    /// </para>
    /// </summary>
    private async Task<bool> ShareContactAsync(JsonElement args)
    {
        var client = CollectionClient();
        if (_state.Uncertain) throw new BridgeException(DesktopAttachment.Uncertain);
        var entry = FindEntry(_active);
        var rights = entry == null ? default : DesktopPoll.Of(ChatRow(entry));
        if (entry == null || !DesktopPoll.CanSendText(rights)) throw new BridgeException(DesktopContact.CannotSend);
        if (!DesktopContact.CanShare(rights)) throw new BridgeException(DesktopContact.NotAllowed);
        if (!_users.TryGetValue(Long(args, "id"), out var person)) throw new BridgeException(DesktopContact.NotListed);
        if (!DesktopContact.HasPhone(person)) throw new BridgeException(DesktopContact.NoPhone);
        var (first, last) = DesktopContact.Parts(person);
        InputMedia media = new InputMediaContact
        {
            phone_number = DesktopContact.Phone(person),
            first_name = first,
            last_name = last,
            vcard = DesktopContact.Vcard
        };
        var replyId = (int)Long(args, "reply", 0);
        var silent = SilentFor(entry.Id, args);
        _state.Sending = true;
        _state.Uncertain = false;
        Push();
        try
        {
            await client.Messages_SendMedia(entry.Input, media, "", Random.Shared.NextInt64(1, long.MaxValue),
                reply_to: replyId > 0 ? new InputReplyToMessage { reply_to_msg_id = replyId } : null,
                silent: silent, clear_draft: true);
            _state.Uncertain = false;
            _historyDirty = true;
            _dialogsDirty = true;
            await RefreshHistoryLocked();
            return true;
        }
        catch (Exception ex)
        {
            _state.Uncertain = true;
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el envío. Revisa el historial antes de repetirlo. " + message, ex);
        }
        finally
        {
            _state.Sending = false;
            Push();
        }
    }

    /// <summary>
    /// Copiar al portapapeles de Windows. No hay petición de Telegram de por medio, así que las dos negaciones son
    /// de esta capa: el tope de Android y el portapapeles ocupado. Se escribe desde el hilo de la ventana porque WPF
    /// solo permite tocar el portapapeles en el hilo STA, y el puente puede llegar de otro; si no hay ventana, no hay
    /// dónde escribirse y la frase es la misma que Android guarda para su <c>ClipboardManager</c> nulo.
    /// </summary>
    private static bool ClipboardCopy(string text)
    {
        if (text.Length > DesktopClipboard.MaxText) throw new BridgeException(DesktopClipboard.TooLong);
        var dispatcher = Application.Current?.Dispatcher;
        if (dispatcher == null) throw new BridgeException(DesktopClipboard.Unavailable);
        try
        {
            dispatcher.Invoke(() => Clipboard.SetText(text));
            return true;
        }
        catch (Exception ex) when (ex is not BridgeException)
        {
            throw new BridgeException(DesktopClipboard.Unavailable, ex);
        }
    }

    /// La fila de conversación que la sesión tiene cacheada, canal o grupo básico. Es la única testigo de los
    /// derechos que Telegram publicó, y hace falta una lectura distinta de <see cref="ChannelOf"/>: un grupo
    /// básico también tiene <c>default_banned_rights</c>, y es justo donde un administrador puede más que la norma.
    private ChatBase? ChatRow(ChatEntry entry) => entry.Peer switch
    {
        PeerChannel peer => _chats.GetValueOrDefault(peer.channel_id),
        PeerChat peer => _chats.GetValueOrDefault(peer.chat_id),
        _ => null
    };

    /// <summary>
    /// La encuesta de Telegram convertida a la que ve la pantalla, campo a campo de
    /// <c>NativeSnapshot</c> (<c>:188-206</c>). Cuatro cosas hay que saber de esta traducción.
    /// <para>
    /// El <c>description</c> queda vacío siempre, y no es un hueco: en TDLib es un texto propio del contenedor
    /// <c>MessagePoll</c> y en MTProto la encuesta solo tiene pregunta. Lo mismo con la explicación, que aquí no
    /// vive en el cuestionario sino en los resultados (<c>PollResults.solution</c>).
    /// </para>
    /// <para>
    /// Los recortes son los de la lectura, no los de la escritura: 300 para la pregunta y la explicación, 100 por
    /// opción. Se escribe un máximo y se lee otro porque Telegram puede tener filas más largas de lo que este
    /// cliente deja crear —una encuesta hecha desde otro dispositivo—, y cortar por 255 truncaría una pregunta que
    /// existe.
    /// </para>
    /// <para>
    /// El <c>canStop</c> sale en <c>false</c> sin mirar nada, y es la única bandera de este objeto que no viene de
    /// Telegram: Android lo calcula como «es mío y no está cerrada», y aquí la petición para cerrarla no existe.
    /// Decirlo en falso sería pintar un botón que no puede funcionar.
    /// </para>
    /// <para>
    /// Los votos se buscan por la clave opaca, no por el orden: <c>PollResults.results</c> no promete venir en el
    /// mismo orden que <c>Poll.answers</c>, y emparejarlos por índice daría porcentajes cruzados. Sin resultados —
    /// un <c>PollResults</c> recortado por <c>min</c> o una encuesta que nadie ha votado— todo sale a cero, que es
    /// la verdad y no un fallo.
    /// </para>
    /// <para>
    /// La foto por opción se registra aquí, en la lectura, con el <c>exportable</c> de la fila que la contiene: una
    /// encuesta con <c>noforwards</c> no deja sacar sus imágenes y no hay motivo para prometerlo. Por eso el método
    /// dejó de ser estático —necesita el registro— y por eso <see cref="OnPoll"/> reescribe la tarjeta con el
    /// <c>CanForward</c> de la burbuja que estaba pintando, que es justo el valor del que salieron sus medios.
    /// </para>
    /// </summary>
    private PollDto ConvertPoll(TL.Poll poll, PollResults? results, bool exportable)
    {
        var total = results != null && (results.flags & PollResults.Flags.has_total_voters) != 0 ? results.total_voters : 0;
        var voters = results?.results ?? new PollAnswerVoters[0];
        var closed = DesktopPoll.IsClosed(poll);
        var dto = new PollDto
        {
            PollId = poll.id,
            Question = Clip(DesktopPoll.Trim(poll.question?.text), DesktopPoll.ShownQuestion),
            Description = "",
            TotalVoters = total,
            Anonymous = DesktopPoll.IsAnonymous(poll),
            Multiple = DesktopPoll.AllowsMultiple(poll),
            Revoting = DesktopPoll.AllowsRevoting(poll),
            Closed = closed,
            CanSeeResults = DesktopPoll.CanSeeResults(poll),
            CanGetVoters = DesktopPoll.CanGetVoters(poll),
            CanStop = false,
            Quiz = DesktopPoll.IsQuiz(poll),
            Restriction = closed ? DesktopPoll.ClosedReason : null
        };
        if (results != null && (results.flags & PollResults.Flags.has_solution) != 0 && results.solution != null)
            dto.Explanation = Clip(DesktopPoll.Trim(results.solution), DesktopPoll.ShownExplanation);
        // El instante del cierre, cuando la encuesta lo trae. Es la única de las dos formas de MTProto que se puede
        // pintar sin saber la fecha del mensaje; ver el resumen de DesktopPoll.HasCloseDate.
        if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt = Unix(poll.close_date);
        var answers = DesktopPoll.Options(poll);
        for (var position = 0; position < answers.Length; position++)
        {
            var match = voters.FirstOrDefault(voter => voter.option == answers[position].option);
            var votes = match != null && (match.flags & PollAnswerVoters.Flags.has_voters) != 0 ? match.voters : 0;
            dto.Options.Add(new PollOptionDto
            {
                Index = position,
                Text = Clip(DesktopPoll.Trim(answers[position].text?.text), DesktopPoll.ShownOption),
                Votes = votes,
                Percentage = DesktopPoll.Percentage(votes, total),
                Chosen = match != null && (match.flags & PollAnswerVoters.Flags.chosen) != 0,
                Media = DesktopPoll.PhotoOf(answers[position]) is { } picture
                    ? _media.RegisterPhoto(picture, DesktopPoll.OptionPhotoName, exportable)
                    : null
            });
        }
        return dto;
    }

    /// <summary>
    /// El mensaje fijado de la conversación abierta, que es lo que pinta la barra «Mensaje fijado». Antes el
    /// puente respondía <c>null</c> a secas —la barra no existía en Windows ni cuando Telegram tenía el ancla
    /// puesta—, y eso era una mentira más barata que una falta: la pantalla no preguntaba por ella.
    /// <para>
    /// Dos fuentes, en el orden más barato. La ventana de historial trae la bandera <c>Message.Flags.pinned</c>
    /// en cada fila y <c>ConvertMessage</c> la anota, así que un fijado reciente se resuelve sin pedir nada. Lo
    /// que no está en la ventana lo dice <c>pinned_msg_id</c> de la información completa, una vez por
    /// conversación: la pantalla vuelve a preguntar con cada cambio de ventana y un <c>getFullChat</c> por
    /// aviso recibido no se lo pide nadie a Telegram.
    /// </para>
    /// <para>
    /// Un fallo aquí no se cuenta como error. La lectura es de fondo —<c>request</c> la lanza sin que la persona
    /// la haya pedido— y la interfaz descarta la respuesta; levantar un aviso rojo por una barra que no aparece
    /// sería peor que la barra. Lo que sí se escribe en voz alta es el fallo del fijado, que es una orden.
    /// </para>
    /// </summary>
    private async Task<object?> PinnedMessageAsync()
    {
        if (_client is Client client && _client.User != null)
        {
            var entry = FindEntry(_active);
            if (entry == null) return null;
            if (!_pins.TryGetValue(entry.Id, out var id))
            {
                if (_pinProbed.Contains(entry.Id)) return null;
                var probe = await ProbePinnedAsync(client, entry);
                if (probe == null) return null;
                _pins[entry.Id] = probe.Value;
                _pinProbed.Add(entry.Id);
                id = probe.Value;
            }
            if (id <= 0) return null;
            var key = id.ToString();
            var row = _state.Messages.FirstOrDefault(message => message.Id == key);
            if (row != null) return row;
            // El ancla está fuera de la ventana leída: se pide su fila, y si Telegram ya no la tiene la barra
            // se queda sin contenido, que es la verdad de ese momento.
            try
            {
                var fetched = await client.GetMessages(entry.Input, new InputMessageID { id = id });
                var found = fetched.Messages?.FirstOrDefault(message => message != null && message.ID == id);
                return found == null ? null : ConvertMessage(found, entry);
            }
            catch { return null; }
        }
        return null;
    }

    /// El ancla que la información completa del chat declara, o <c>null</c> si la petición no respondió. En
    /// este esquema <c>pinned_msg_id</c> es un solo entero por conversación —no hay lista—, y ahí está la razón
    /// de negar <c>pinned.list</c> en lugar de inventarla.
    /// <para>
    /// La ronda BX encontró el fallo que había debajo: <c>GetFullChat</c> no devuelve la información del chat
    /// directamente sino envuelta en <c>Messages_ChatFull</c>, y aquí se cambiaba el envoltorio por
    /// <c>ChannelFull</c>, <c>ChatFull</c> o <c>UserFull</c>. Los tres casos de un <c>switch</c> sobre el
    /// envoltorio son imposibles —medido: de <c>ChatFullBase</c> descienden <c>ChatFull</c>,
    /// <c>ChannelFull</c> y <c>CommunityFull</c>, y <c>UserFull</c> no es uno de ellos—, así que la sonda
    /// contestaba <c>0</c> siempre y la barra del fijado no aparecía hasta que se fijaba desde el propio
    /// Windows. Ahora se lee primero <c>full_chat</c>, y el uno a uno tiene su propia rama.
    /// </para>
    /// <para>
    /// La rama privada es la misma que ya usa <see cref="AutoDeleteStateAsync"/>: <c>users.getFullUser</c> con
    /// <c>PrivateInput</c>, cuyo <c>UserFull</c> declara <c>has_pinned_msg_id</c> (=64) y
    /// <c>pinned_msg_id</c>. Sin ella, un fijado «solo para mí» de uno a uno no tenía forma de asomarse, que era
    /// lo que <c>DesktopMessagePin</c> prometía ofrecer en esa conversación.
    /// </para>
    private static async Task<int?> ProbePinnedAsync(Client client, ChatEntry entry)
    {
        try
        {
            if (entry.Peer is PeerUser)
            {
                var person = (await client.Users_GetFullUser(PrivateInput(entry)))?.full_user;
                return person == null || (person.flags & UserFull.Flags.has_pinned_msg_id) == 0
                    ? 0
                    : person.pinned_msg_id;
            }
            ChatFullBase? full = (await client.GetFullChat(entry.Input))?.full_chat;
            return full switch
            {
                ChannelFull channel => (channel.flags & ChannelFull.Flags.has_pinned_msg_id) != 0 ? channel.pinned_msg_id : 0,
                ChatFull chat => (chat.flags & ChatFull.Flags.has_pinned_msg_id) != 0 ? chat.pinned_msg_id : 0,
                _ => 0,
            };
        }
        catch { return null; }
    }

    /// <summary>
    /// Fijar o desfijar una conversación en la lista —la orden del menú «Fijar conversación», que es otra
    /// petición distinta de la del mensaje: <c>messages.toggleDialogPin</c> sobre el peer, como el
    /// <c>ToggleChatIsPinned</c> de Android—. La marca que la pantalla lee venía de <c>Dialog.Flags.pinned</c>,
    /// así que la respuesta se escribe también en la fila cargada: sin eso, el menú volvería a ofrecer lo mismo
    /// hasta que la lista se recargue.
    /// <para>
    /// Hueco dicho: esta petición fija en la lista general. Android pasa además la carpeta activa
    /// (<c>session.selectedList()</c>). La ronda AF escribió que aquí no había lista activa que consultar, y la
    /// corrección es otra: la lista activa sí se conoce (<c>_mode</c>), lo que no existe en esta versión de la
    /// librería es la forma de nombrarla —<c>InputDialogPeerBase</c> admite el diálogo suelto, la carpeta entera
    /// o una comunidad, pero nunca un par (diálogo, carpeta)—. Véase <see cref="DesktopChatFolders"/>.
    /// </para>
    /// </summary>
    private async Task<object?> PinDialogAsync(JsonElement args)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = RequireEntry(Str(args, "id"));
        var value = Bool(args, "value");
        try
        {
            await _client.Messages_ToggleDialogPin(new InputDialogPeer { peer = entry.Input }, value);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó el fijado de la conversación. " + message, ex);
        }
        entry.Pinned = value;
        foreach (var chat in _state.Chats)
            if (chat.Id == entry.Id) chat.Pinned = value;
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// Archivar o devolver a la lista general —la orden del menú «Archivar conversación», que en Android es
    /// <c>AddChatToList</c> con <c>ChatListArchive</c>/<c>ChatListMain</c> y aquí es
    /// <c>folders.editPeerFolders</c> con una sola pareja, porque en este esquema el archivo es la carpeta de
    /// pares con id 1 y no una lista aparte (<see cref="DesktopChatFolders"/>). Se escribe la marca en la fila
    /// cargada y se marca la lista como sucia: la pantalla descarta las archivadas de cualquier pestaña que no
    /// sea la de archivo, así que la fila se va sola en cuanto se pinta el estado nuevo, y la próxima carga de
    /// la otra lista trae el par que Telegram asignó.
    /// </summary>
    private async Task<object?> ArchiveDialogAsync(JsonElement args)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = RequireEntry(Str(args, "id"));
        var value = Bool(args, "value");
        if (entry.Input == null) throw new BridgeException(DesktopChatFolders.NotResolved);
        try
        {
            await _client.Folders_EditPeerFolders(new[]
            {
                new InputFolderPeer { peer = entry.Input, folder_id = DesktopChatFolders.FolderOf(value) },
            });
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la lista de la conversación. " + message, ex);
        }
        entry.Archived = value;
        foreach (var chat in _state.Chats)
            if (chat.Id == entry.Id) chat.Archived = value;
        _dialogsDirty = true;
        Push();
        return true;
    }

    /// <summary>
    /// Poner o quitar la marca de no leído —<c>messages.markDialogUnread</c>, el equivalente del
    /// <c>ToggleChatIsMarkedAsUnread</c> de Android—. Es una marca aparte del contador: una fila puede tener
    /// cero mensajes sin leer y seguir enseñando el punto, y por eso aquí no se toca <c>Unread</c>, que lo sigue
    /// mandando Telegram. El argumento <c>unread</c> va nombrado porque delante suyo hay otro opcional
    /// (<c>parent_peer</c>, el tema de un monoforo) y pasarle la posición a ese sería escribir sobre otra cosa.
    /// </summary>
    private async Task<object?> MarkUnreadAsync(JsonElement args)
    {
        if (_client == null) throw new BridgeException("La cuenta no está conectada.");
        var entry = RequireEntry(Str(args, "id"));
        var value = Bool(args, "value");
        if (entry.Input == null) throw new BridgeException(DesktopChatFolders.NotResolved);
        try
        {
            await _client.Messages_MarkDialogUnread(new InputDialogPeer { peer = entry.Input }, unread: value);
        }
        catch (Exception ex)
        {
            var message = Describe(ex);
            _state.Error = message;
            throw new BridgeException("No se confirmó la marca de no leído. " + message, ex);
        }
        entry.Marked = value;
        foreach (var chat in _state.Chats)
            if (chat.Id == entry.Id) chat.Marked = value;
        Push();
        return true;
    }

    private async Task<object> PropertiesAsync(string id)
    {
        var message = _state.Messages.FirstOrDefault(item => item.Id == id);
        var entry = message == null ? null : FindEntry(message.ChatId);
        var kind = DesktopMessageDelete.Of(entry?.Id);
        var channel = kind == DesktopMessageDelete.Kind.Channel && entry != null ? ChannelOf(entry) : null;
        // La protección de contenido la dice la propia fila (`Message.Flags.noforwards`) y el chat
        // (`Chat/Channel.Flags.noforwards`), y la documentación de la bandera añade que el cliente «debe
        // impedir también guardar los archivos adjuntos»: es la misma verdad para reenviar, copiar sin autor y
        // copiar el texto. Antes los tres salían en `true` a secas, que es lo que hacía que la pantalla de
        // escritorio no ofreciera nunca el reenvío (la ronda AC contó el borrado con el mismo criterio).
        var forwardable = message?.CanForward ?? false;
        // El fijado no lo decide el contenido sino la forma del chat y los derechos que Telegram dio en él.
        // Hasta la ronda AF esta línea era un `false` a secas: no una regla, la ausencia del transporte.
        // Las dos ediciones, igual: hasta la ronda AH eran dos `false` y la pantalla nunca ofrecía cambiar el
        // texto propio, aunque `messages.editMessage` sea de las peticiones más corrientes del protocolo. El
        // `caption` lleva el pie actual porque la pantalla lo usa para rellenar la casilla antes de escribir.
        var canEdit = DesktopMessageEdit.CanEditText(message, kind, channel);
        var canEditCaption = DesktopMessageEdit.CanEditCaption(message, kind, channel);
        // La tercera cara, la de cambiar el archivo. No pregunta la red: sale de la clase real del adjunto, que
        // anotó la conversión, y de los mismos dos derechos de arriba. Con `desktopScope.ts` llamándola
        // «disponible» y la pantalla sin el `!desktop`, esta línea es lo que hace que la entrada exista o no.
        var canEditMedia = DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,
            kind == DesktopMessageDelete.Kind.Channel && DesktopMessageEdit.ChannelRightsToEdit(channel),
            message?.MediaKind ?? DesktopMessageEditMedia.None);
        // La bandeja de reacciones se lee en la red —información completa del chat, o la lista general cuando el
        // chat no la personaliza—, y por eso este método pasó a esperar: hasta la ronda BX devolvía una lista vacía
        // porque la escritura no estaba conectada.
        var band = entry == null || _client is not Client client ? new List<object>() : await ReactionBandAsync(entry, client, message);
        // La marca que decide el botón ✨ es la bandera de la sesión, sin petición: lo que TDLib contesta en Android por
        // `allowCustomEmoji` (`NativeBridge.java:4329`) y lo que aquí comprueba la escritura antes de mandar la ficha
        // personalizada, la guarda `NotPremiumAccount`. Hasta la ronda CD esta línea era un `false` a secas.
        var customReaction = _client is Client session && session.User is { } self && DesktopEmojiCatalog.IsPremium(self);
        return new
        {
            reply = true,
            copy = forwardable && !string.IsNullOrWhiteSpace(message?.Text),
            copyContent = forwardable,
            edit = canEdit,
            deleteSelf = DesktopMessageDelete.CanDeleteSelf(kind),
            deleteAll = DesktopMessageDelete.CanDeleteAll(kind, message?.Outgoing ?? false, channel),
            forward = forwardable,
            pin = DesktopMessagePin.CanPin(kind, message, channel),
            editCaption = canEditCaption,
            editMedia = canEditMedia,
            caption = canEditCaption ? message?.Text ?? "" : "",
            // Las dos caras que quedan por debajo van dichas, pero ya no son las dos mismas: `paid` sigue apagada
            // porque la reacción de Stars gasta saldo y aquí no está la cartera; `allowCustom` es desde la ronda CD la
            // bandera real de la cuenta, la que el selector pregunta por `premium.state` y la escritura por la guarda
            // `NotPremiumAccount` de `DesktopMessageReactFlow.cs`. La bandeja ya es la lista del chat.
            reactions = band,
            paid = false,
            allowCustom = customReaction
        };
    }

    private async Task LoadMediaAsync(long id)
    {
        TrackDownload(id);
        if (_downloadsPausedAll || _downloadPaused.Contains(id)) { Push(); return; }
        try { await _media.EnsureFileAsync(id); }
        catch (Exception ex)
        {
            _state.Error = Describe(ex);
        }
        Push();
    }

    private async Task<object?> ExportMediaAsync(long id)
    {
        if (!_media.CanExport(id)) throw new BridgeException("Telegram protege este contenido.");
        var path = await _media.EnsureFileAsync(id);
        if (path == null || !_media.TryGetFile(id, out var file, out var mime))
            throw new BridgeException("El archivo todavía no está disponible. Espera a que termine la descarga.");
        var name = DesktopDocuments.DownloadName(_media.NameOf(id) ?? "archivo", mime);
        var target = Application.Current.Dispatcher.Invoke(() =>
        {
            var dialog = new Microsoft.Win32.SaveFileDialog
            {
                FileName = Path.GetFileName(name),
                Filter = "Todos los archivos|*.*"
            };
            return dialog.ShowDialog() == true ? dialog.FileName : null;
        });
        if (target == null) return false;
        File.Copy(file, target, overwrite: true);
        return true;
    }

    private object? Appearance(JsonElement args)
    {
        var appearance = _state.Appearance;
        if (args.TryGetProperty("theme", out var theme) && theme.ValueKind == JsonValueKind.String) appearance.Theme = theme.GetString()!;
        if (args.TryGetProperty("font", out var font) && font.TryGetInt32(out var size)) appearance.Font = size;
        if (args.TryGetProperty("compact", out var compact) && compact.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Compact = compact.GetBoolean();
        if (args.TryGetProperty("typing", out var typing) && typing.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Typing = typing.GetBoolean();
        if (args.TryGetProperty("enter", out var enter) && enter.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Enter = enter.GetBoolean();
        if (args.TryGetProperty("auto", out var auto) && auto.ValueKind is JsonValueKind.True or JsonValueKind.False) appearance.Auto = auto.GetBoolean();
        if (args.TryGetProperty("fontFamily", out var family) && family.ValueKind == JsonValueKind.String) appearance.FontFamily = family.GetString()!;
        if (args.TryGetProperty("wallpaper", out var wallpaper) && wallpaper.ValueKind == JsonValueKind.String) appearance.Wallpaper = wallpaper.GetString()!;
        if (args.TryGetProperty("custom", out var custom)) appearance.Custom = custom.ValueKind == JsonValueKind.Null ? null : custom.Clone();
        if (args.TryGetProperty("customThemes", out var customThemes)) appearance.CustomThemes = customThemes.ValueKind == JsonValueKind.Null ? null : customThemes.Clone();
        if (args.TryGetProperty("chatThemes", out var chatThemes)) appearance.ChatThemes = chatThemes.ValueKind == JsonValueKind.Null ? null : chatThemes.Clone();
        if (args.TryGetProperty("gestures", out var gestures))
        {
            if (gestures.ValueKind is JsonValueKind.Null) appearance.Gestures = null;
            else if (gestures.ValueKind == JsonValueKind.Object && ValidGestures(gestures)) appearance.Gestures = gestures.Clone();
        }
        if (args.TryGetProperty("navigation", out var navigation) && navigation.ValueKind == JsonValueKind.String
            && (navigation.GetString() == "bar" || navigation.GetString() == "side")) appearance.Navigation = navigation.GetString()!;
        if (args.TryGetProperty("chrome", out var chrome) && chrome.ValueKind == JsonValueKind.Object)
        {
            var canvas = ChromeColor(chrome, "canvas");
            var surface = ChromeColor(chrome, "surface");
            var text = ChromeColor(chrome, "text");
            var muted = ChromeColor(chrome, "muted");
            var accent = ChromeColor(chrome, "accent");
            if (canvas != null && surface != null && text != null && muted != null && accent != null)
                appearance.Chrome = new ChromeDto
                {
                    Canvas = canvas, Surface = surface, Text = text, Muted = muted, Accent = accent,
                    Dark = !chrome.TryGetProperty("dark", out var dark) || dark.ValueKind != JsonValueKind.False
                };
        }
        _store.Save();
        _appearanceChanged();
        return true;
    }

    private static readonly string[] GestureSides = { "left", "right" };
    private static readonly string[] GestureActions = { "none", "reply", "menu", "copy", "forward", "select" };

    private static bool ValidGestures(JsonElement gestures)
    {
        var count = 0;
        foreach (var property in gestures.EnumerateObject())
        {
            if (++count > 2) return false;
            if (!GestureSides.Contains(property.Name)) return false;
            if (property.Value.ValueKind != JsonValueKind.String) return false;
            if (!GestureActions.Contains(property.Value.GetString())) return false;
        }
        return count > 0;
    }

    private static string? ChromeColor(JsonElement chrome, string key)
    {
        if (!chrome.TryGetProperty(key, out var value) || value.ValueKind != JsonValueKind.String) return null;
        var text = value.GetString() ?? "";
        return DesktopPalette.IsHex(text) ? text.ToLowerInvariant() : null;
    }

    private object Accounts()
    {
        return new[] { new { slot = "main", name = _state.Name, ready = _state.Ready, active = true } };
    }

    private bool ClearError() { _state.Error = ""; return true; }

    private bool OpenDataFolder()
    {
        try { Process.Start(new ProcessStartInfo("explorer.exe", $"\"{_store.Root}\"") { UseShellExecute = true }); return true; }
        catch { return false; }
    }

    private bool OpenLink(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || (uri.Scheme != "http" && uri.Scheme != "https"))
            throw new BridgeException("Solo se abren enlaces web http o https en esta beta.");
        try { Process.Start(new ProcessStartInfo(uri.AbsoluteUri) { UseShellExecute = true }); return true; }
        catch { return false; }
    }

    /// <summary>
    /// Abre en el navegador la ubicación de un mensaje, que es exactamente lo que hace `openMessageLocation`
    /// (<c>NativeBridge.java:411</c>): las dos comprobaciones de Android en su orden —primero la protección, después
    /// las coordenadas— y la misma URL de Google maps, construida en <see cref="DesktopLocation.Link"/>.
    /// <para>
    /// La diferencia es de transporte, no de regla. TDLib tiene la fila en memoria; aquí hay que releerla con
    /// `messages.getMessages`, y como esa lectura va dirigida al chat abierto, un identificador de otra conversación
    /// no vuelve y sale con la frase de siempre —Android lo decide comparando `message.chatId != session.activeChat`,
    /// y el resultado es la misma negativa por otro camino—. La protección tampoco es la misma bandera: Android mira
    /// `canBeSaved`, `hasProtectedContent` y la clase del chat; MTProto dice `noforwards` en la fila y en el chat,
    /// que es la pareja que ya usan el reenvío y la copia sin autor, y los chats secretos no existen en este host.
    /// </para>
    /// <para>
    /// Queda una tercera negativa de Android que aquí no tiene traducción posible: <c>answer.ok(false)</c> cuando el
    /// navegador no arranca (<c>NativeBridge.java:425</c>). TDLib puede preguntar si el intent se abrió; este host
    /// devuelve lo que devuelva <see cref="OpenLink"/>, que es el mismo <c>true</c>/<c>false</c> por otro camino, así
    /// que se contesta sin inventarse un estado que la interfaz no pide. La fila desconocida tampoco es de este brazo:
    /// <c>RequireEntry</c> ya niega que haya conversación abierta, y sin conversación no hay a qué chat pedir el mensaje.
    /// </para>
    /// </summary>
    private async Task<object?> OpenLocationAsync(long id)
    {
        var client = CollectionClient();
        var entry = RequireEntry(_active);
        var page = await client.GetMessages(entry.Input, new InputMessageID { id = (int)id });
        var row = page.Messages?.OfType<TL.Message>().FirstOrDefault(message => message.ID == id);
        if (row == null) throw new BridgeException(DesktopPoll.Gone);
        if ((row.flags & TL.Message.Flags.noforwards) != 0 || ProtectedChat(entry)) throw new BridgeException(DesktopLocation.Protected);
        // De nuevo la viva antes que la fija, por la herencia de la librería.
        var point = row.media switch
        {
            MessageMediaGeoLive live => live.geo,
            MessageMediaGeo geo => geo.geo,
            MessageMediaVenue venue => venue.geo,
            _ => null
        };
        if (!DesktopLocation.Valid(point)) throw new BridgeException(DesktopLocation.Gone);
        return OpenLink(DesktopLocation.Link(point!));
    }

    // ---- conversion helpers ---------------------------------------------------

    /// <summary>
    /// La fila de Telegram convertida al contrato que ve la interfaz. `scheduled` vale cuando la fila salió de
    /// la bandeja de programados y no del historial: su `date` es la hora a la que saldrá, y sus ids pertenecen
    /// a un namespace aparte que puede coincidir con el de un mensaje ya enviado —por eso una fila programada no
    /// entra ni en `_textCache`, que alimenta las citas, ni en `_pins`.
    /// </summary>
    private MessageDto? ConvertMessage(MessageBase source, ChatEntry entry, bool scheduled = false)
    {
        if (source is TL.Message message)
        {
            var dto = new MessageDto
            {
                Id = message.ID.ToString(),
                ChatId = entry.Id,
                Sender = SenderName(message, entry),
                AuthorId = PeerKey(message.From),
                AuthorKind = message.From is TL.PeerChannel ? "chat" : message.From is TL.PeerUser ? "user" : null,
                Text = message.message ?? "",
                Date = Unix(message.Date),
                Outgoing = (message.flags & TL.Message.Flags.out_) != 0,
                Edited = (message.flags & TL.Message.Flags.has_edit_date) != 0,
                AlbumId = DesktopAlbum.AlbumIdOf(message),
                ScheduledAt = scheduled ? Unix(message.Date) : null,
                ScheduledRepeat = scheduled && DesktopScheduled.IsRecurring(message),
                RepeatPeriod = scheduled ? DesktopScheduled.RepeatPeriod(message) : null
            };
            // Una fila de la bandeja todavía no se envió, así que no puede estar leída: el `ReadOutbox` del
            // historial se mide en ids del historial y comparar contra un id programado daría un tick al azar.
            dto.Status = scheduled ? "" : dto.Outgoing ? (entry.ReadOutbox >= message.ID ? "read" : "sent") : "";
            dto.Entities = ConvertEntities(message.entities, dto.Text);
            dto.Reactions = ConvertReactions(message.reactions);
            if (message.fwd_from is { } forwarded) dto.Forward = ConvertForward(forwarded);

            if (message.reply_to is MessageReplyHeader header && header.reply_to_msg_id > 0)
            {
                // Una cita puede venir de otro chat: el destino se resuelve con su propio peer, no con el chat actual.
                var originChat = PeerKey(header.reply_to_peer_id) ?? entry.Id;
                dto.Reply = CachedText(originChat, header.reply_to_msg_id) ?? "Mensaje anterior";
                dto.ReplyTo = new ReplyTargetDto { ChatId = originChat, MessageId = header.reply_to_msg_id.ToString() };
            }

            var exportable = (message.flags & TL.Message.Flags.noforwards) == 0 && !ProtectedChat(entry);
            // La bandera `pinned` viene en la propia fila, así que la ventana ya dice dónde está el ancla sin
            // pedir la información completa del chat. Es gratis y por eso se anota aquí.
            if (!scheduled && (message.flags & TL.Message.Flags.pinned) != 0) _pins[entry.Id] = message.ID;
            // La misma bandera decide las tres cosas que la pantalla pregunta por `message.properties`: si se
            // puede reenviar, si se puede copiar sin autor y si se puede copiar el texto.
            dto.CanForward = exportable;
            // Y si lleva pie. Se anota aquí y no en `Properties` porque es la única mirada que ve la clase real
            // del adjunto: un sticker llega como documento y una nota de voz también, y los dos se quedan fuera.
            dto.HasCaption = DesktopMessageEdit.HasCaption(message.media);
            dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);
            switch (message.media)
            {
                case MessageMediaPhoto { photo: Photo photo }:
                    dto.Media = _media.RegisterPhoto(photo, exportable: exportable);
                    break;
                case MessageMediaDocument { document: Document document }:
                    dto.Media = _media.RegisterDocument(document, exportable: exportable);
                    dto.Transcribable = document.attributes.Any(attribute =>
                        attribute is DocumentAttributeAudio audio && (audio.flags & DocumentAttributeAudio.Flags.voice) != 0 ||
                        attribute is DocumentAttributeVideo video && (video.flags & DocumentAttributeVideo.Flags.round_message) != 0);
                    break;
                case MessageMediaPoll { poll: { } poll }:
                    // La encuesta no se escribe en `dto.Text`: la pantalla tiene su propia tarjeta y el contrato
                    // la lee de `message.poll`. Dejar el texto vacío es lo que hace que no se duplique la pregunta.
                    dto.Poll = ConvertPoll(poll, message.media is MessageMediaPoll mediaPoll ? mediaPoll.results : null, exportable);
                    break;
                case MessageMediaContact card:
                    // La ronda AP escribe tarjetas de contacto, así que también tiene que leerlas: es la primera
                    // `extra` que publica este host, y el motivo es la regla de siempre —quien escribe tiene que
                    // poder leer lo que escribió—, no un catálogo por rellenar. El dado sigue sin puente y,
                    // coherente con eso, sin tarjeta; la ubicación y el lugar lo tenían en Android desde siempre
                    // y aquí caían en el aviso de abajo hasta la ronda AR.
                    dto.Extra = new MessageExtraDto
                    {
                        Kind = "contact",
                        Name = DesktopContact.CardName(card.first_name ?? "", card.last_name ?? ""),
                        Phone = card.phone_number ?? "",
                        UserId = card.user_id > 0 ? card.user_id.ToString() : "",
                        CanCopy = exportable
                    };
                    break;
                // Las tres familias geográficas, en este orden y no en otro: `MessageMediaGeoLive` **deriva** de
                // `MessageMediaGeo` en la librería, así que el caso fijo escrito primero se tragaría el vivo y la
                // tarjeta saldría sin cuenta atrás. Ninguno de los tres escribe `dto.Text`: la pantalla tiene su
                // propia tarjeta y el pie iría duplicado.
                case MessageMediaGeoLive live:
                {
                    var point = live.geo;
                    var visible = DesktopLocation.Valid(point);
                    dto.Extra = new MessageExtraDto
                    {
                        Kind = "location",
                        Title = DesktopLocation.Live,
                        Address = "",
                        Latitude = visible ? point!.lat : null,
                        Longitude = visible ? point!.lon : null,
                        Live = true,
                        // Android pone cero en las dos mitades de su ternario —sin periodo y sin punto—, así que la
                        // cuenta atrás solo existe cuando la tarjeta también tiene coordenadas.
                        ExpiresAt = visible ? DesktopLocation.ExpiresAt(Unix(message.Date), live.period) : 0,
                        CanOpen = exportable,
                        // La misma regla de la capa de Android (<c>MessageExtras.java:44</c>): el botón solo pinta
                        // sobre una ubicación propia y mientras le queda tiempo. Aquí no hay rastreador que apagar,
                        // así que «Dejar de compartir» es literalmente la última renovación que Telegram va a
                        // aceptar de esta fila, ni una más.
                        CanStop = DesktopLiveLocation.CanStop(DesktopLiveLocation.IsOutgoing(message), live.period)
                    };
                    break;
                }
                case MessageMediaGeo fixedGeo:
                {
                    var visible = DesktopLocation.Valid(fixedGeo.geo);
                    dto.Extra = new MessageExtraDto
                    {
                        Kind = "location",
                        Title = DesktopLocation.Fixed,
                        Address = "",
                        Latitude = visible ? fixedGeo.geo!.lat : null,
                        Longitude = visible ? fixedGeo.geo!.lon : null,
                        CanOpen = exportable
                    };
                    break;
                }
                case MessageMediaVenue venue:
                {
                    var visible = DesktopLocation.Valid(venue.geo);
                    dto.Extra = new MessageExtraDto
                    {
                        Kind = "location",
                        Title = DesktopLocation.Title(venue.title),
                        Address = DesktopLocation.Address(venue.address),
                        Latitude = visible ? venue.geo!.lat : null,
                        Longitude = visible ? venue.geo!.lon : null,
                        CanOpen = exportable
                    };
                    break;
                }
                case MessageMediaWebPage { webpage: WebPage page }:
                {
                    // La tarjeta del enlace, que es el adjunto con el que MTProto dice lo que TDLib guarda dentro del
                    // texto (`MessageText.linkPreview`, proyectado en `NativeSnapshot.java:227`). No escribe
                    // `dto.Text`: el texto ya viene arriba, en `message.message`, y la pantalla pinta la tarjeta debajo.
                    // La foto se registra con la `exportable` de la fila porque Android hace lo mismo con la suya
                    // cuando el chat está protegido, y sin dirección: ver <see cref="DesktopLinkPreview"/>.
                    // La guarda de arriba es la misma `!temporary` de esa línea de Java, leída con el espejo que
                    // BP dejó en `DesktopSenderProfile.IsEphemeral`: una fila con temporizador no pinta tarjeta.
                    if (!DesktopSenderProfile.IsEphemeral(message))
                    {
                        var shot = DesktopLinkPreview.PhotoOf(page);
                        dto.Preview = DesktopLinkPreview.Card(
                            page, shot == null ? null : _media.RegisterPhoto(shot, DesktopLinkPreview.PhotoName, exportable: exportable));
                    }
                    break;
                }
                case MessageMediaStory story:
                    // La tarjeta de la historia compartida, que es la única marca que Android publica de ella
                    // (<c>MessageExtras.java:85</c>: <c>kind("story")</c> con <c>mention</c>). Con esta fila y el brazo de
                    // <c>message.story.open</c> la tarjeta deja de ser adorno: «Ver historia» pregunta al autor que trae
                    // el propio adjunto, no al chat abierto. El pie no va en <c>dto.Text</c>: lo lleva la pantalla.
                    dto.Extra = new MessageExtraDto { Kind = "story", Mention = DesktopStories.Mention(story) };
                    break;
                case null:
                    break;
                default:
                    if (string.IsNullOrWhiteSpace(dto.Text)) dto.Text = "Contenido no compatible con esta beta.";
                    break;
            }

            if (!scheduled)
            {
                if (!_textCache.TryGetValue(entry.Id, out var texts)) _textCache[entry.Id] = texts = new Dictionary<int, string>();
                texts[message.ID] = dto.Text;
            }
            return dto;
        }

        if (source is MessageService service)
        {
            return new MessageDto
            {
                Id = service.ID.ToString(),
                ChatId = entry.Id,
                Sender = SenderName(service, entry),
                Text = ServiceText(service, ActorOf(service)),
                Date = Unix(service.Date),
                Outgoing = (service.flags & MessageService.Flags.out_) != 0,
                Status = "",
                ServiceNotice = true,
                Reactions = new List<ReactionDto>()
            };
        }

        return null;
    }

    /// <summary>
    /// Identificador de chat en la forma que ya entiende <see cref="FindEntry"/>: u/g/c + id.
    /// </summary>
    private static string? PeerKey(TL.Peer? peer) => peer switch
    {
        PeerUser user when user.user_id != 0 => "u" + user.user_id,
        PeerChat chat => "g" + chat.chat_id,
        PeerChannel channel => "c" + channel.channel_id,
        _ => null,
    };

    /// <summary>
    /// Procedencia real de un reenvío. Los nombres salen solo de la caché local y una identidad que
    /// Telegram oculta se muestra con el nombre público que el propio Telegram decidió revelar.
    /// </summary>
    private ForwardDto? ConvertForward(MessageFwdHeader header)
    {
        var data = new ForwardDto { Date = Unix(header.date) };
        switch (header.from_id)
        {
            case PeerChannel channel:
                data.Kind = "channel";
                data.ChatId = "c" + channel.channel_id;
                data.Name = _chats.TryGetValue(channel.channel_id, out var channelChat) && !string.IsNullOrWhiteSpace(channelChat.Title) ? Clip(channelChat.Title, 120) : "un canal";
                if (header.channel_post > 0) data.MessageId = header.channel_post.ToString();
                break;
            case PeerChat chat:
                data.Kind = "chat";
                data.ChatId = "g" + chat.chat_id;
                data.Name = _chats.TryGetValue(chat.chat_id, out var group) && !string.IsNullOrWhiteSpace(group.Title) ? Clip(group.Title, 120) : "una conversación";
                break;
            case PeerUser user when user.user_id != 0:
                data.Kind = "user";
                data.UserId = user.user_id.ToString();
                data.Name = _users.TryGetValue(user.user_id, out var author) ? Clip(FullName(author), 120) : "un usuario";
                break;
            default:
                if (string.IsNullOrWhiteSpace(header.from_name)) return null;
                data.Kind = "hidden";
                data.Name = Clip(header.from_name.Trim(), 120);
                break;
        }
        if (!string.IsNullOrWhiteSpace(header.post_author)) data.Signature = Clip(header.post_author.Trim(), 80);
        return data;
    }

    private static string Clip(string value, int maximum) => value.Length <= maximum ? value : value[..maximum];

    private string SenderName(MessageBase message, ChatEntry entry)
    {
        if (message.From is PeerUser user && _users.TryGetValue(user.user_id, out var info)) return FullName(info);
        if (message.From is PeerChannel channel && _chats.TryGetValue(channel.channel_id, out var chat)) return chat.Title;
        if (entry.Type == "channel") return entry.Title;
        return "Telegram";
    }

    private string? CachedText(string chatId, int messageId) =>
        _textCache.TryGetValue(chatId, out var texts) && texts.TryGetValue(messageId, out var text) ? text : null;

    private string ServiceText(MessageService service, string actor = "") => service.action switch
    {
        MessageActionChatCreate => "Se creó el grupo",
        MessageActionChatEditTitle => "Se cambió el título del grupo",
        MessageActionChannelCreate => "Se creó el canal",
        MessageActionChatJoinedByLink => "Alguien se unió mediante un enlace",
        MessageActionPinMessage => "Se fijó un mensaje",
        MessageActionHistoryClear => "Se borró el historial",
        MessageActionScreenshotTaken => "Se tomó una captura de pantalla",
        MessageActionChatDeletePhoto => "Se eliminó la foto del grupo",
        MessageActionPhoneCall call => DesktopServiceCalls.PhoneCall(call),
        MessageActionConferenceCall call => DesktopServiceCalls.ConferenceCall(call),
        MessageActionGroupCall call => DesktopServiceCalls.GroupCall(call),
        MessageActionGroupCallScheduled call => DesktopServiceCalls.GroupCallScheduled(call),
        MessageActionInviteToGroupCall call => DesktopServiceCalls.Invitation(call, actor, UserName, _client?.User?.id ?? 0, (service.flags & MessageService.Flags.out_) != 0),
        _ => "Mensaje de servicio de Telegram"
    };

    private static List<ReactionDto> ConvertReactions(MessageReactions? reactions)
    {
        var list = new List<ReactionDto>();
        if (reactions?.results == null) return list;
        foreach (var result in reactions.results)
        {
            switch (result.reaction)
            {
                case ReactionEmoji emoji:
                    list.Add(new ReactionDto { Emoji = emoji.emoticon, Count = result.count, Chosen = result.chosen_order != 0 });
                    break;
                case ReactionCustomEmoji custom:
                    list.Add(new ReactionDto { Emoji = "", Count = result.count, Chosen = result.chosen_order != 0, Kind = "custom", CustomEmojiId = custom.document_id.ToString() });
                    break;
            }
        }
        return list;
    }

    private static List<EntityDto>? ConvertEntities(MessageEntity[]? entities, string text)
    {
        if (entities == null || entities.Length == 0) return null;
        var list = new List<EntityDto>();
        foreach (var entity in entities)
        {
            var type = entity switch
            {
                MessageEntityBold => "bold",
                MessageEntityItalic => "italic",
                MessageEntityUnderline => "underline",
                MessageEntityStrike => "strikethrough",
                MessageEntitySpoiler => "spoiler",
                MessageEntityCode => "code",
                MessageEntityPre => "pre",
                MessageEntityBlockquote => "blockquote",
                MessageEntityTextUrl => "link",
                MessageEntityUrl => "link",
                MessageEntityCustomEmoji => "customEmoji",
                _ => null
            };
            if (type == null) continue;
            list.Add(new EntityDto
            {
                Type = type,
                Offset = entity.offset,
                Length = entity.length,
                Url = entity switch
                {
                    MessageEntityTextUrl link => link.url,
                    // El enlace que Telegram detectó solo no trae dirección: la dirección es su propio texto.
                    MessageEntityUrl => DesktopTextEntities.TextAsUrl(text, entity.offset, entity.length),
                    _ => null
                },
                // `NativeSnapshot.java:525`: el id viaja como texto, que es la única forma de que la cifra
                // llegue entera a JavaScript.
                CustomEmojiId = entity is MessageEntityCustomEmoji face ? face.document_id.ToString() : null
            });
        }
        return list.Count > 0 ? list : null;
    }

    /// <summary>
    /// Traduce las entidades del borrador a MTProto. Las negativas viven todas en
    /// <see cref="DesktopTextEntities"/> y aquí solo se escribe cada tipo una vez. El orden de las
    /// comprobaciones es el de <c>NativeBridge.textEntities</c>, que mide el rango antes de mirar el tipo;
    /// ninguna de ellas descarta en silencio, porque una entidad que el servidor no entiende se lleva por
    /// delante el formato de todo el mensaje.
    /// </summary>
    private static MessageEntity[]? ParseEntities(JsonElement args, string text)
    {
        if (!args.TryGetProperty("entities", out var array) || array.ValueKind != JsonValueKind.Array) return null;
        var ceiling = DesktopTextEntities.TooManyProblem(array.GetArrayLength());
        if (ceiling != null) throw new BridgeException(ceiling);
        var list = new List<MessageEntity>();
        foreach (var item in array.EnumerateArray())
        {
            var type = DesktopTextEntities.TypeOf(item);
            if (!item.TryGetProperty("offset", out var offsetElement) || !offsetElement.TryGetInt32(out var offset))
                throw new BridgeException(DesktopTextEntities.MissingNumberProblem(type, "desplazamiento"));
            if (!item.TryGetProperty("length", out var lengthElement) || !lengthElement.TryGetInt32(out var length))
                throw new BridgeException(DesktopTextEntities.MissingNumberProblem(type, "longitud"));
            var range = DesktopTextEntities.OffsetProblem(offset, length, text);
            if (range != null) throw new BridgeException(range);

            MessageEntity entity = type switch
            {
                "bold" => new MessageEntityBold(),
                "italic" => new MessageEntityItalic(),
                "underline" => new MessageEntityUnderline(),
                "strikethrough" => new MessageEntityStrike(),
                "spoiler" => new MessageEntitySpoiler(),
                "code" => new MessageEntityCode(),
                "pre" => new MessageEntityPre(),
                "blockquote" => new MessageEntityBlockquote(),
                "link" => new MessageEntityTextUrl { url = LinkUrlOf(item) },
                "customEmoji" => new MessageEntityCustomEmoji { document_id = FaceIdOf(item) },
                _ => throw new BridgeException(DesktopTextEntities.UnknownTypeProblem(type)!),
            };
            entity.offset = offset;
            entity.length = length;
            list.Add(entity);
        }
        // El orden lo pide el esquema: Android ordena por desplazamiento antes de armar su `FormattedText`.
        return list.Count > 0 ? [.. list.OrderBy(entity => entity.offset)] : null;
    }

    /// <summary>Dirección de un enlace del borrador, con la negativa que da Android si Telegram no la admite.</summary>
    private static string LinkUrlOf(JsonElement item)
    {
        var url = DesktopTextEntities.UrlOf(item);
        var problem = DesktopTextEntities.UrlProblem(url);
        if (problem != null) throw new BridgeException(problem);
        return url!;
    }

    /// <summary>El <c>document_id</c> de la ficha personalizada; sin cifra no hay emoji Premium que valga.</summary>
    private static long FaceIdOf(JsonElement item) =>
        DesktopTextEntities.CustomEmojiId(item, out var error) ?? throw new BridgeException(error!);

    private ChatEntry? EntryFromPeer(TL.Peer peer)
    {
        switch (peer)
        {
            case PeerUser userPeer when _users.TryGetValue(userPeer.user_id, out var user):
            {
                var id = "u" + user.id;
                var title = user.id == _client?.User?.id ? "Mensajes guardados" : FullName(user);
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = user.id == _client?.User?.id ? new InputPeerSelf() : new InputPeerUser(user.id, user.access_hash),
                    Title = title,
                    Type = "private",
                    Bot = (user.flags & User.Flags.bot) != 0,
                    IsContact = (user.flags & User.Flags.contact) != 0,
                    Username = user.MainUsername,
                    Photo = _media.RegisterProfile(user, user.photo != null, id, title)
                };
            }
            case PeerChat chatPeer when _chats.TryGetValue(chatPeer.chat_id, out var chat):
            {
                var id = "g" + chat.ID;
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = new InputPeerChat(chat.ID),
                    Title = chat.Title,
                    Type = "group",
                    Photo = _media.RegisterProfile(chat, chat.Photo != null, id, chat.Title)
                };
            }
            case PeerChannel channelPeer when _chats.TryGetValue(channelPeer.channel_id, out var channelBase) && channelBase is Channel channel:
            {
                var id = "c" + channel.ID;
                var supergroup = (channel.flags & Channel.Flags.megagroup) != 0;
                return new ChatEntry
                {
                    Id = id,
                    Peer = peer,
                    Input = new InputPeerChannel(channel.id, channel.access_hash),
                    Title = channel.Title,
                    Type = supergroup ? "group" : "channel",
                    Supergroup = supergroup,
                    IsForum = (channel.flags & Channel.Flags.forum) != 0,
                    Username = channel.MainUsername,
                    Photo = _media.RegisterProfile(channel, channel.Photo != null, id, channel.Title)
                };
            }
            default:
                return null;
        }
    }

    private ChatEntry? FindEntry(string id)
    {
        if (_entries.TryGetValue(id, out var entry)) return entry;
        if (id.Length < 2 || !long.TryParse(id.AsSpan(1), out var peerId) || peerId <= 0) return null;
        if (id[0] == 'u' && peerId == _client?.User?.id) return SavedEntry(peerId);
        TL.Peer? peer = id[0] switch
        {
            'u' => new PeerUser { user_id = peerId },
            'g' => new PeerChat { chat_id = peerId },
            'c' => new PeerChannel { channel_id = peerId },
            _ => null
        };
        return peer == null ? null : EntryFromPeer(peer);
    }

    private bool ProtectedChat(ChatEntry entry)
    {
        return entry.Peer switch
        {
            PeerChannel peer when _chats.GetValueOrDefault(peer.channel_id) is Channel channel => (channel.flags & Channel.Flags.noforwards) != 0,
            PeerChat peer when _chats.GetValueOrDefault(peer.chat_id) is Chat chat => (chat.flags & Chat.Flags.noforwards) != 0,
            _ => false
        };
    }

    private ChatEntry RequireEntry(string id) => FindEntry(id) ?? throw new BridgeException("La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.");

    private static string FullName(User user)
    {
        var name = string.Join(" ", new[] { user.first_name, user.last_name }.Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        if (name.Length > 0) return name;
        if (!string.IsNullOrWhiteSpace(user.MainUsername)) return "@" + user.MainUsername;
        return "Usuario " + user.id;
    }

    private string PreviewOf(MessageBase? message)
    {
        if (message is TL.Message text && !string.IsNullOrWhiteSpace(text.message))
        {
            var value = text.message.Replace('\n', ' ').Trim();
            return value.Length > 90 ? value[..90] + "…" : value;
        }
        if (message is TL.Message media)
        {
            return media.media switch
            {
                MessageMediaPhoto => "Foto",
                // Las tres, otra vez con la viva delante de la fija por la herencia de la librería. Son los mismos
                // tres literales que devuelve `MessageExtras.summary` en Android, y por eso viven en
                // `DesktopLocation` y no escritos aquí: la fila de la lista y la tarjeta tienen que decir lo mismo.
                MessageMediaGeoLive => DesktopLocation.Live,
                MessageMediaGeo => DesktopLocation.Fixed,
                MessageMediaVenue venue => DesktopLocation.Title(venue.title),
                MessageMediaDocument { document: Document document } => document.mime_type switch
                {
                    "application/x-tgsticker" => "Sticker",
                    _ when document.mime_type.StartsWith("video/") => "Vídeo",
                    _ when document.mime_type.StartsWith("audio/") => "Audio",
                    _ when document.mime_type.StartsWith("image/") => "Imagen",
                    _ => string.IsNullOrWhiteSpace(document.Filename) ? "Archivo" : document.Filename!
                },
                null => "",
                _ => "Contenido multimedia"
            };
        }
        if (message is MessageService service) return ServiceText(service, ActorOf(service));
        return "";
    }

    /// El nombre del autor de un mensaje de servicio, o cadena vacía cuando el host no lo conoce: sin nombre la
    /// invitación se dice en pasiva («Se invitó a…») en vez de soltar el relleno como si fuera quien fue. Es el
    /// mismo par de recorte que ya usan la firma de la encuesta y los votantes.
    private string ActorOf(MessageBase message) =>
        message.From is PeerUser autor && _users.TryGetValue(autor.user_id, out var invitante) ? Clip(FullName(invitante), 120) : "";

    /// El nombre de un identificador que ya está en la caché, con el relleno de Android cuando el perfil no ha
    /// llegado —«Usuario de Telegram», que es lo que dice <c>TdSession.java:1309</c>—: ni un número suelto ni un
    /// seudónimo inventado.
    private string UserName(long id) =>
        _users.TryGetValue(id, out var invitado) ? Clip(FullName(invitado), 120) : DesktopPoll.VoterUnknown;

    /// Segundo de epoch para las tres listas de miembros (<see cref="DesktopGroupMembers.Until"/> y las filas del
    /// roster), que viajan en la misma unidad que Android saca de <c>joinedChatDate</c> y de <c>bannedUntilDate</c>.
    internal static long Unix(DateTime date) =>
        date.Year < 1970 ? 0 : new DateTimeOffset(DateTime.SpecifyKind(date, DateTimeKind.Utc)).ToUnixTimeSeconds();

    private static string Str(JsonElement element, string name, string fallback = "")
    {
        if (element.ValueKind == JsonValueKind.Object && element.TryGetProperty(name, out var value))
        {
            if (value.ValueKind == JsonValueKind.String) return value.GetString() ?? fallback;
            if (value.ValueKind == JsonValueKind.Number) return value.ToString();
            if (value.ValueKind == JsonValueKind.True) return "true";
            if (value.ValueKind == JsonValueKind.False) return "false";
        }
        return fallback;
    }

    private static string[] Arr(JsonElement element, string name)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value) || value.ValueKind != JsonValueKind.Array)
            return Array.Empty<string>();
        return value.EnumerateArray().Select(item => item.ValueKind switch
        {
            JsonValueKind.String => item.GetString() ?? "",
            JsonValueKind.Number => item.ToString(),
            _ => ""
        }).ToArray();
    }

    private static long Long(JsonElement element, string name, long fallback = 0)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.Number when value.TryGetInt64(out var number) => number,
            JsonValueKind.String when long.TryParse(value.GetString(), out var number) => number,
            _ => fallback
        };
    }

    private static bool Bool(JsonElement element, string name, bool fallback = false)
    {
        if (element.ValueKind != JsonValueKind.Object || !element.TryGetProperty(name, out var value)) return fallback;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => fallback
        };
    }

    private static string Describe(Exception exception)
    {
        if (exception is BridgeException bridge) return bridge.Message;
        if (exception is RpcException rpc)
        {
            var code = rpc.Message ?? "";
            if (code.StartsWith("PHONE_NUMBER_INVALID")) return "El número de teléfono no es válido. Usa el prefijo internacional.";
            if (code.StartsWith("PHONE_CODE_INVALID") || code.StartsWith("PHONE_CODE_EXPIRED")) return "El código no es válido o caducó.";
            if (code.StartsWith("PASSWORD_HASH_INVALID")) return "La contraseña de dos pasos no es correcta.";
            if (code.StartsWith("SESSION_PASSWORD_NEEDED")) return "La cuenta requiere la contraseña de dos pasos.";
            if (code.StartsWith("FLOOD_WAIT")) return "Telegram pidió esperar antes de reintentar.";
            if (code.StartsWith("AUTH_KEY_UNREGISTERED") || code.StartsWith("AUTH_KEY_INVALID") || code.StartsWith("SESSION_REVOKED")) return "La sesión ya no es válida. Inicia sesión de nuevo.";
            if (code.StartsWith("API_ID_INVALID") || code.StartsWith("API_ID_PUBLISHED_FLOOD")) return "Las credenciales de API no son válidas para esta aplicación.";
            return code;
        }
        return string.IsNullOrWhiteSpace(exception.Message) ? "No se pudo completar la operación." : exception.Message;
    }

    // ---- updates --------------------------------------------------------------

    private Task QueueUpdates(UpdatesBase updates)
    {
        _updates.Enqueue(updates);
        return Task.CompletedTask;
    }

    private Task QueueOther(IObject other)
    {
        if (other is Update update) _others.Enqueue(update);
        return Task.CompletedTask;
    }

    private async Task PumpLoopAsync()
    {
        while (!_dispose.IsCancellationRequested)
        {
            try { await Task.Delay(900, _dispose.Token); }
            catch { break; }
            if (!_historyDirty && !_dialogsDirty && _updates.IsEmpty && _others.IsEmpty) continue;

            try
            {
                await _gate.WaitAsync(_dispose.Token);
                try
                {
                    ProcessUpdatesLocked();
                    var now = DateTime.UtcNow;
                    if (_historyDirty && (now - _lastHistoryLoad).TotalMilliseconds > 1200 && _state.Ready && _state.Active != "0")
                        await RefreshHistoryLocked();
                    if (_dialogsDirty && (now - _lastDialogsLoad).TotalMilliseconds > 4000 && _state.Ready)
                        await LoadDialogsLocked(_mode, quiet: true);
                    Push();
                }
                finally { _gate.Release(); }
            }
            catch { }
        }
    }

    private void ProcessUpdatesLocked()
    {
        while (_updates.TryDequeue(out var updates))
        {
            try
            {
                switch (updates)
                {
                    case TL.Updates combined:
                        MergePeers(combined.users?.Values, combined.chats?.Values);
                        foreach (var update in combined.updates ?? Array.Empty<Update>()) HandleUpdate(update);
                        break;
                    case TL.UpdatesCombined combined:
                        MergePeers(combined.users?.Values, combined.chats?.Values);
                        foreach (var update in combined.updates ?? Array.Empty<Update>()) HandleUpdate(update);
                        break;
                    case UpdatesTooLong:
                        _historyDirty = true;
                        _dialogsDirty = true;
                        break;
                }
            }
            catch { }
        }
        while (_others.TryDequeue(out var update)) HandleUpdate(update);
    }

    private void HandleUpdate(Update update)
    {
        switch (update)
        {
            case UpdateNewMessage news:
                OnIncoming(news.message);
                break;
            case UpdateEditMessage edit:
                OnIncoming(edit.message);
                break;
            case UpdateDeleteMessages deleted:
                OnDeleted(deleted.messages);
                break;
            case UpdateReadHistoryOutbox read:
                OnReadOutbox(read.peer, read.max_id);
                break;
            case UpdateReadHistoryInbox read:
                OnReadInbox(read.peer, read.max_id, read.still_unread_count);
                break;
            case UpdatePinnedMessages pinned:
                OnPinned(ChatIdOf(pinned.peer), pinned.messages, (pinned.flags & UpdatePinnedMessages.Flags.pinned) != 0);
                break;
            case UpdatePinnedChannelMessages pinned:
                // El aviso de canal no trae peer: trae el id suelto, y la clave de conversación es la misma
                // forma que produce `ChatIdOf`, con su `c`.
                OnPinned("c" + pinned.channel_id, pinned.messages, (pinned.flags & UpdatePinnedChannelMessages.Flags.pinned) != 0);
                break;
            case UpdatePinnedDialogs:
            case UpdatePinnedSavedDialogs:
                // El orden de la lista cambia y aquí no se calcula: se marca la lista como sucia para que el
                // siguiente cargado traiga de nuevo `Dialog.Flags.pinned`.
                _dialogsDirty = true;
                break;
            case UpdateMessageReactions reactions:
                OnReactions(reactions);
                break;
            case UpdateMessagePoll poll:
                OnPoll(poll);
                break;
            case UpdateFolderPeers folders:
                OnFolderPeers(folders);
                break;
            case UpdateDialogUnreadMark mark:
                OnUnreadMark(mark);
                break;
        }
    }

    /// <summary>
    /// Telegram avisa de un fijado o un desfijado con la lista de ids y una bandera de dirección. Se anota el
    /// primero cuando fija, y se olvida lo que sabíamos cuando desfija: en este esquema hay un ancla por
    /// conversación, pero si el servidor dejó otra detrás, la única forma de saberlo es volver a preguntar.
    /// Con esto la barra deja de mentir aunque la persona no haya tocado nada.
    /// </summary>
    private void OnPinned(string? chatId, int[]? messages, bool pinned)
    {
        if (chatId == null) return;
        var first = messages != null && messages.Length > 0 ? messages[0] : 0;
        if (pinned && first > 0) _pins[chatId] = first;
        else _pins.Remove(chatId);
        _pinProbed.Remove(chatId);
    }

    /// <summary>
    /// Telegram manda los contadores de una fila cada vez que alguien reacciona, y es lo único que llega por
    /// este camino: la lista «quién reaccionó» vive en <c>messages.getMessageReactionsList</c> y aquí no se
    /// pide. Se reescribe la fila entera con <see cref="ConvertReactions"/> en vez de parchear un emoji,
    /// porque el aviso trae la cuenta total y no el delta, así que cualquier otro orden dejaría el chip con
    /// dos contadores distintos. <c>top_msg_id</c> se mira sin caso: es el tema de un foro, y ninguna capa de
    /// este host lo usa todavía.
    /// </summary>
    private void OnReactions(UpdateMessageReactions update)
    {
        var chatId = ChatIdOf(update.peer);
        if (chatId == null) return;
        foreach (var message in _state.Messages)
            if (message.ChatId == chatId && message.Id == update.msg_id.ToString())
                message.Reactions = ConvertReactions(update.reactions);
    }

    /// <summary>
    /// Telegram manda el recuento de una encuesta cada vez que alguien vota, y es lo único que llega por este
    /// camino. Sin este caso, votar en Windows dejaba la tarjeta con el porcentaje de antes y la marca de la opción
    /// sin poner hasta la siguiente recarga del historial: la persona pulsaba y no pasaba nada visible.
    /// <para>
    /// Se reescribe la encuesta entera con <see cref="ConvertPoll"/> en vez de parchear un contador, por la misma
    /// razón que <see cref="OnReactions"/>: el aviso trae la cuenta total y no el delta, y cualquier otro orden
    /// dejaría dos porcentajes distintos en la misma burbuja.
    /// </para>
    /// <para>
    /// Se empareja por <c>poll_id</c> y no por el peer, aunque el aviso lo lleve, porque <c>has_peer</c> es una
    /// bandera: hay avisos que dicen el identificador de la encuesta y nada más. Tampoco se mira
    /// <c>top_msg_id</c> —es el tema de un foro, y ninguna capa de este host lo usa todavía—. Cuando el aviso viene
    /// sin la encuesta dentro (<c>has_poll</c>) solo se puede reescribir el recuento, y para eso hace falta el
    /// orden de las opciones, que vive en el <c>Poll</c>: se deja la fila como estaba y la corrige la próxima
    /// lectura, que es menos que perder un voto pero más que inventarse un orden.
    /// </para>
    /// </summary>
    private void OnPoll(UpdateMessagePoll update)
    {
        if (update.poll == null) return;
        foreach (var message in _state.Messages)
            if (message.Poll != null && message.Poll.PollId == update.poll_id)
                message.Poll = ConvertPoll(update.poll, update.results, message.CanForward);
    }

    /// <summary>
    /// Telegram anuncia cada pareja (diálogo, carpeta) que cambia, y con eso llega el archivo hecho desde otro
    /// dispositivo. Hasta ahora el aviso llegaba al <c>switch</c> sin caso, igual que <c>UpdateMessageReactions</c>
    /// antes de la ronda AG: la fila seguía en la lista en la que la dejó la última carga y la pantalla mentía.
    /// Se escribe la bandera sobre la fila cargada y se marca la lista como sucia, porque archivar también mueve
    /// la fila de pestaña. Un id de carpeta distinto de <see cref="DesktopChatFolders.Archive"/> no es el archivo:
    /// es una carpeta creada por la persona, y con esa la fila sigue sin estar archivada.
    /// </summary>
    private void OnFolderPeers(UpdateFolderPeers update)
    {
        var changed = false;
        foreach (var pair in update.folder_peers ?? [])
        {
            var chatId = ChatIdOf(pair.peer);
            if (chatId == null) continue;
            var archived = pair.folder_id == DesktopChatFolders.Archive;
            if (_entries.TryGetValue(chatId, out var entry)) entry.Archived = archived;
            foreach (var chat in _state.Chats)
                if (chat.Id == chatId) chat.Archived = archived;
            changed = true;
        }
        if (changed) _dialogsDirty = true;
    }

    /// <summary>
    /// La marca de no leído también la mueve otro dispositivo. El aviso nombra el diálogo con el unón de tres
    /// formas que ya recorta <see cref="DesktopChatFolders.PeerOf"/>: una carpeta o una comunidad no describen
    /// una fila de esta lista y se ignoran. Aquí la lista no se marca como sucia —la marca no mueve la fila de
    /// pestaña, solo le pinta el punto—, y no se toca el contador: <c>unread_count</c> lo sigue mandando
    /// Telegram y una fila puede estar marcada con cero sin leer.
    /// </summary>
    private void OnUnreadMark(UpdateDialogUnreadMark update)
    {
        var chatId = ChatIdOf(DesktopChatFolders.PeerOf(update.peer));
        if (chatId == null) return;
        var value = (update.flags & UpdateDialogUnreadMark.Flags.unread) != 0;
        if (_entries.TryGetValue(chatId, out var entry)) entry.Marked = value;
        foreach (var chat in _state.Chats)
            if (chat.Id == chatId) chat.Marked = value;
    }

    private void OnIncoming(MessageBase message)
    {
        var chatId = ChatIdOf(message.Peer);
        if (chatId == null) return;
        // While an unread-anchored window is open, new messages wait for history.newer
        // so the gap between the anchor and the live message is never skipped.
        if (chatId == _active && _latest) _historyDirty = true;
        _dialogsDirty = true;
    }

    private void OnDeleted(int[] ids)
    {
        if (ids == null || ids.Length == 0) return;
        var set = ids.ToHashSet();
        if (_state.Active != "0")
        {
            _state.Messages.RemoveAll(message => int.TryParse(message.Id, out var id) && set.Contains(id));
            if (_latest) _historyDirty = true;
        }
        // Un ancla borrada deja de ser ancla: se quita la anotación para que la próxima lectura vuelva a
        // preguntar, porque Telegram pudo haber dejado otra detrás y aquí no hay petición que la liste.
        if (_pins.TryGetValue(_state.Active, out var anchor) && anchor > 0 && set.Contains(anchor))
        {
            _pins.Remove(_state.Active);
            _pinProbed.Remove(_state.Active);
        }
        _dialogsDirty = true;
    }

    private void OnReadOutbox(TL.Peer peer, int maxId)
    {
        var chatId = ChatIdOf(peer);
        if (chatId == null || !_entries.TryGetValue(chatId, out var entry)) return;
        entry.ReadOutbox = Math.Max(entry.ReadOutbox, maxId);
        if (chatId == _active)
        {
            foreach (var message in _state.Messages)
                if (message.Outgoing && int.TryParse(message.Id, out var id) && id <= maxId)
                    message.Status = "read";
        }
    }

    private void OnReadInbox(TL.Peer peer, int maxId, int stillUnread)
    {
        var chatId = ChatIdOf(peer);
        if (chatId == null) return;
        if (_entries.TryGetValue(chatId, out var entry))
        {
            entry.ReadInbox = Math.Max(entry.ReadInbox, maxId);
            entry.Unread = Math.Max(0, stillUnread);
        }
        foreach (var chat in _state.Chats)
            if (chat.Id == chatId)
            {
                chat.ReadInbox = Math.Max(int.TryParse(chat.ReadInbox, out var read) ? read : 0, maxId).ToString();
                chat.Unread = Math.Max(0, stillUnread);
            }
        if (chatId == _state.Active && int.TryParse(_state.History.Anchor, out var anchor) && anchor > 0 && maxId >= anchor)
            _state.History.Anchor = "0";
    }

    private static string? ChatIdOf(TL.Peer? peer) => peer switch
    {
        PeerUser user => "u" + user.user_id,
        PeerChat chat => "g" + chat.chat_id,
        PeerChannel channel => "c" + channel.channel_id,
        _ => null
    };

    private void MergePeers(IEnumerable<User>? users, IEnumerable<ChatBase>? chats)
    {
        if (users != null) foreach (var user in users) _users[user.id] = user;
        if (chats != null) foreach (var chat in chats) _chats[chat.ID] = chat;
    }

    private void DisposeClientLocked()
    {
        try { _client?.Dispose(); } catch { }
        _client = null;
        _media.Reset();
        // Lo que Telegram dijo de los fijados es de la sesión que lo dijo: al cambiar de cuenta, una
        // conversación con el mismo id no puede heredar la barra de la anterior.
        _pins.Clear();
        _pinProbed.Clear();
        // Y lo mismo con las copias de los archivos elegidos: un vale de la sesión anterior no puede enviar
        // nada en la siguiente, y dejar el archivo de la persona tirado en %APPDATA% no es opcional.
        ClearOutbox();
    }

    public async ValueTask DisposeAsync()
    {
        _dispose.Cancel();
        await _gate.WaitAsync();
        try { DisposeClientLocked(); }
        finally { _gate.Release(); }
        _dispose.Dispose();
        _gate.Dispose();
    }
}
