namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de la cola de solicitudes de ingreso: las dos órdenes que Android despacha en
/// `NativeBridge.java:757` y `:747`. Reglas, techos, frases y cuerpos están en <see cref="DesktopJoinRequests"/>;
/// aquí está el cable, que es lo que faltaba: las dos llevan desde la ronda F en la lista del puente
/// (`BridgePolicy.java:48`, donde `chat.request.answer` está además en la de las que esperan a la persona,
/// `bridge.ts:31`) y la pantalla las pide desde esa misma ronda. Pero en Windows la hoja de opciones no tenía
/// ninguna entrada —la única puerta era el panel lateral, tapado con `!desktop` en `App.tsx:1241`— y, de
/// haberse abierto, la primera pregunta habría caído en el `_ =&gt; throw` genérico dando a entender que faltaba
/// una petición cuando las dos existen.
/// <para>
/// El orden de guardas es el del puente y es la prueba de que este archivo existe. Leer: forma, marcador,
/// permiso, cuenta, posición, la tabla y la cuenta otra vez. Responder: forma, cuenta pedida, identificador,
/// decisión, la propia solicitud descartada, permiso, confirmar, cuenta, escritura y cuenta. Android comprueba
/// el derecho después de leer el nombre (`answerJoinRequest`, `NativeBridge.java:3588` → `:3590`) y no antes: adelantar el permiso haría que un
/// formulario mal escrito en un chat que sí se administrara oyera primero «no tienes permiso», y retrasar la
/// resolución del nombre haría que el cuadro de confirmar se llenara de identificadores.
/// </para>
/// <para>
/// Dos cosas que el puente de Android hace con memoria y aquí se hacen con el cable. La primera es la posición
/// de la página: allá `requestOwner`/`requestChat`/`requestCursorUser`/`requestCursorDate` (`NativeBridge.java:60`,
    /// negados en `:3533`),
/// niegan cualquier marcador que no sea el último repartido; aquí la posición viaja como `offset_date` y
/// `offset_user` de `messages.getChatInviteImporters`, así que no hay estado que pueda estar viejo. Lo que sí se
/// pierde es la caché: el `offset_user` de MTProto exige `access_hash`, y ese hash solo llega con la página que
/// la pantalla ya vio. Si se fue, la negación es la misma frase con la que Android manda a reabrir
/// (<see cref="DesktopJoinRequests.CursorGone"/>), porque el consejo para la persona es idéntico. La segunda es
/// el nombre: Android hace un abanico de `GetUser` por página (`joinResolve`, `NativeBridge.java:3559-3563`) porque su petición
/// solo da identificadores; la respuesta de MTProto trae el diccionario `users` dentro, así que aquí no hay
/// ninguna ida extra que fingir ni ninguna espera que simular.
/// </para>
/// <para>
/// Y una diferencia de estado, dicha: Android limpia su memoria de cursor y llama a `schedule()` tras responder
/// (`schedule()`, `NativeBridge.java:3598-3599`) para que la interfaz vuelva a pedir lo suyo; aquí no hay memoria que limpiar y la escritura
/// responde `UpdatesBase`, que puede venir sin ninguna lista de chats. El panel vuelve a pedir la primera página
/// él solo (`JoinRequestsPanel.tsx:65`), y la insignia de la bandeja no se mueve a mano: en Windows el contador
/// pendiente vive solo en el `full info` (`ChatFull`/`ChannelFull.requests_pending`, medido), no en la fila del
/// diálogo, y mover la bandeja con una cifra que la lista no tiene sería peor que dejarla sin número.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>joinRequests</c> (<c>:3525-3540</c>) más <c>requestJoinPage</c> (<c>:3541-3555</c>) más
    /// <c>finishJoinPage</c> (<c>:3562-3574</c>). Las veinte filas se piden con <c>requested</c> en verdadero,
    /// que es la bandera que el esquema mide como «only returns info about users with pending join requests» y
    /// la traducción exacta del «Returns pending join requests in a chat» de TDLib; el filtro de enlace y la
    /// búsqueda por nombre que TDLib admite (<c>GetChatJoinRequests.inviteLink</c> y <c>.query</c>) viajan vacíos
    /// porque la pantalla no ofrece ninguno de los dos.
    /// </summary>
    private async Task<object?> JoinRequestsAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopJoinRequests.Supported(kind)) throw new BridgeException(DesktopJoinRequests.Unsupported);
        var marker = Raw(args, "cursor");
        if (DesktopJoinRequests.CursorProblem(marker) is { } issue) throw new BridgeException(issue);
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopJoinRequests.NoRightReview);
        if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);
        // La posición de la página anterior: `JoinRequests.offset` la lee del marcador y aquí viaja en dos
        // argumentos. El hash de esa persona es lo único que puede faltar, y falta se dice con su consejo.
        // `offset_date` es un `DateTime` normal en la firma medida, y la librería corta la marca cuando vale
        // `default`, que es lo que significa «desde el principio» en esta petición.
        DateTime offsetDate = default;
        InputUserBase? offsetUser = null;
        if (DesktopJoinRequests.Offset(marker) is { } want)
        {
            if (!_users.TryGetValue(want.UserId, out var known) || known.access_hash == 0)
                throw new BridgeException(DesktopJoinRequests.CursorGone);
            offsetUser = new InputUser(want.UserId, known.access_hash);
            offsetDate = Moment(want.Date) ?? default;
        }
        if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);
        var table = await client.Messages_GetChatInviteImporters(
            entry.Input, offsetDate, offsetUser, DesktopJoinRequests.PageSize, null, null, true, false);
        MergePeers(table.users?.Values, null);
        var rows = (table.importers ?? Array.Empty<ChatInviteImporter>())
            .Select(importer => DesktopJoinRequests.Row(importer, PersonName(importer.user_id, table.users)))
            .Where(row => row != null)
            .Select(row => row!.Value)
            .ToList();
        return DesktopJoinRequests.Page(rows, table.count);
    }

    /// <summary>
    /// <c>answerJoinRequest</c> (<c>:3575-3602</c>). Aprobar y rechazar son la misma escritura con la bandera
    /// contraria —<c>messages.hideChatJoinRequest(peer, user_id, approved)</c>—, que es exactamente el par
    /// <c>ProcessChatJoinRequest(chatId, userId, approve)</c> de TDLib, y el cuadro de confirmar es el de Android
    /// con sus cuatro rótulos y sus dos cuerpos, no una paráfrasis.
    /// </summary>
    private async Task<object?> AnswerJoinRequestAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var entry = RequireEntry(Str(args, "id"));
        var kind = DesktopMembership.Of(entry.Id);
        if (!DesktopJoinRequests.Supported(kind)) throw new BridgeException(DesktopJoinRequests.Unsupported);
        // `:3578`: la cuenta ya no es la que abrió la cola, así que no se toca nada y la pantalla no oye nada.
        if (Raw(args, "accountId") is { } asked && asked != _state.SelfId) return false;
        if (DesktopJoinRequests.UserIdProblem(Raw(args, "userId")) is { } bad) throw new BridgeException(bad);
        var userId = long.Parse(Raw(args, "userId")!, NumberStyles.None, CultureInfo.InvariantCulture);
        var approve = ApproveValue(args);
        if (userId == 0 || userId == owner) throw new BridgeException(DesktopJoinRequests.SelfAnswer);
        var title = DesktopContact.Limit(entry.Title, DesktopJoinRequests.ChatShown);
        var name = DesktopContact.Limit(PersonName(userId, null), DesktopJoinRequests.NameShown);
        if (!await MayManageLinksAsync(client, entry, kind)) throw new BridgeException(DesktopJoinRequests.NoRightAnswer);
        if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);
        if (!ConfirmPhoto(DesktopJoinRequests.Title(approve), DesktopJoinRequests.Body(approve, name, title),
                DesktopJoinRequests.Accept(approve), null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);
        // El `access_hash` lo trae la página que la pantalla está viendo; sin él no hay `InputUser` posible y
        // mandar un cero sería una respuesta de Telegram que ninguna pantalla sabe traducir. La negación es la de
        // la ronda AZ, que ya dice exactamente eso para las cuatro escrituras de miembro.
        var hash = TargetHash(userId);
        await client.Messages_HideChatJoinRequest(entry.Input, new InputUser(userId, hash), approve);
        if (client.User?.id != owner) throw new BridgeException(DesktopJoinRequests.ChangedAccount);
        return true;
    }

    /// `requiredBool(p,"approve")` (`:3580`). Allá es un `throw` en inglés —«Missing permission: approve»,
    /// `:2773`— que el `catch` de `:3582` reenvía tal cual, así que la pantalla de Android lo lee en ese idioma.
    /// Aquí es la causa concreta en español, que es la norma fijada por la ronda AT y la misma decisión que la
    /// ronda BF tomó con la aprobación de los enlaces (`:742`, cuyo `catch` también reenvía el mensaje).
    private static bool ApproveValue(JsonElement args)
    {
        if (args.ValueKind != JsonValueKind.Object || !args.TryGetProperty("approve", out var value))
            throw new BridgeException(DesktopJoinRequests.MissingApprove);
        if (value.ValueKind == JsonValueKind.True) return true;
        if (value.ValueKind == JsonValueKind.False) return false;
        throw new BridgeException(DesktopJoinRequests.MissingApprove);
    }

    /// <c>session.senderName(new MessageSenderUser(id))</c> (<c>TdSession.java:1306-1309</c>) traducido a lo que
    /// MTProto trae: el diccionario <c>users</c> de la propia respuesta, la caché del host como segunda vuelta, el
    /// usuario con arroba cuando solo dio el handle, y el mismo respaldo de Android —«Usuario de Telegram»,
    /// <c>DesktopGroupMembers.UnknownPerson</c>— cuando nadie describe a la persona. A diferencia de Android, este
    /// camino no vuelve a Telegram a por el perfil: se conforma con lo que la respuesta ya trajo. No es
    /// <see cref="FullName"/> a secas, que inventa un «Usuario 4102» cuando no hay nombre y esa frase no la
    /// pronuncia Android por este camino.
    private string PersonName(long userId, IDictionary<long, User>? page)
    {
        var person = (page != null && page.TryGetValue(userId, out var fresh) ? fresh : null)
            ?? _users.GetValueOrDefault(userId);
        if (person == null) return DesktopGroupMembers.UnknownPerson;
        var name = string.Join(" ", new[] { person.first_name, person.last_name }
            .Where(part => !string.IsNullOrWhiteSpace(part))).Trim();
        if (name.Length > 0) return name;
        var handle = DesktopContact.Username(person);
        return handle.Length == 0 ? DesktopGroupMembers.UnknownPerson : "@" + handle;
    }
}
