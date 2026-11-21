namespace WRGram.Desktop;

using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text.Json;
using TL;
using WTelegram;

/// <summary>
/// El cable de los bloqueos en Windows: <c>privacy.blocked</c> (<c>NativeBridge.java:553</c> →
/// <c>blockedSenders</c>, <c>:1507-1530</c>), <c>privacy.unblock</c> (<c>:541</c> → <c>unblockSender</c>,
/// <c>:1531-1542</c>) y <c>profile.block</c> (<c>:527</c> → <c>profileBlock</c>, <c>:1280-1287</c>). Las claves, los
/// techos, las frases y el cuadro de confirmar están en <see cref="DesktopBlocked"/>; aquí está el hilo, que es lo que
/// faltaba: las tres órdenes están en la lista del puente desde hace rondas (<c>BridgePolicy.java:42</c> y <c>:30</c>),
/// las tres pantallas las piden desde entonces (<c>BlockedSettings.tsx:25</c> y <c>:48</c>, <c>PeerProfile.tsx:98</c>
/// a través de <c>App.tsx:751</c>) y en Windows caían en el <c>_ =&gt; throw</c> genérico. La tercera era la más
/// callada: la ficha de una persona sí mostraba el botón de «Bloquear» porque <c>chat.profile</c> publica
/// <c>blocked</c> desde la ronda BA, y pulsarlo devolvía la frase del beta.
/// <para>
/// La lectura es la parte fácil y sale línea por línea: el marcador, la página de cincuenta, la cuenta mirada
/// después de la ida, los dos diccionarios de la respuesta volcados en la caché de pares y las filas armadas con el
/// nombre y la foto que esa misma respuesta trae. Lo que Android hace con la memoria de TDLib (<c>senderName</c> y
/// <c>senderPhoto</c>, <c>TdSession.java:1306-1314</c>) aquí lo hace <c>EntryFromPeer</c> sobre los
/// <c>users</c>/<c>chats</c> del <c>contacts.getBlocked</c>, así que no hay ninguna ida extra que fingir.
/// </para>
/// <para>
/// La escritura es la que obliga a releer. Android pasa el remitente tal cual a
/// <c>SetMessageSenderBlockList(sender,null)</c> (<c>:1556</c>) porque su capa de abajo resuelve ids sueltos; MTProto
/// pide un <c>InputPeer</c> —persona y canal con su <c>access_hash</c>— y la pantalla solo devuelve el <c>kind</c> y
/// el número que leyó, con lo que dos problemas: el número no distingue un <c>PeerChat</c> de un <c>PeerChannel</c>
/// del mismo id y el hash no viaja en la orden. La respuesta son dos lecturas: el cable recorre la lista de verdad,
/// busca el <see cref="Peer"/> cuyo subtipo y número coincidan y saca de ahí el hash del diccionario que esa misma
/// página trae. Cuesta una ida por cada cincuenta bloqueados en el peor de los casos y ninguna en la pantalla; a
/// cambio, desbloquear nunca le manda a Telegram un número que pueda pertenecer a dos sitios.
/// </para>
/// <para>
/// El orden de guardas es el de <c>:1531-1541</c> con una diferencia dicha: allá el nombre se resuelve del aire (la
/// memoria de la sesión) y aquí de la relectura, así que la primera ida a Telegram va antes del diálogo; lo que no
/// cambia es que la única escritura quede detrás de la confirmación, de la cuenta y del hash. Si la lista ya no trae
/// al remitente se niega con <see cref="DesktopBlocked.NotInList"/> y si lo trae sin hash con
/// <see cref="DesktopBlocked.NeedsHash"/>; las dos antes de preguntar, porque un cuadro de confirmar que no puede
/// cumplirse es peor que un aviso.
/// </para>
/// <para>
/// <c>profile.block</c> es la misma escritura por la puerta de la ficha, y no necesita ninguna de las dos idas: la
/// entrada que <see cref="RequireEntry"/> reconstruye ya trae su <c>InputPeerUser</c> con hash. Lo que conserva es el
/// orden de <c>:1282-1285</c> —forma del chat, cuenta propia, valor— y el silencio ante la cuenta: allá no hay
/// <c>currentAccount()</c> porque no hay diálogo nativo que pueda cruzarse; aquí tampoco, por el mismo motivo, y la
/// confirmación la hace la pantalla en su propio cuadro (<c>App.tsx:750</c>), no el host. Bloquear y desbloquear son
/// las dos peticiones medidas con el nombre simétrico, <c>Contacts_Block</c> y <c>Contacts_Unblock</c>, ambas con
/// <c>my_stories_from</c> en falso.
/// </para>
/// <para>
/// Y una cosa que aquí no se copia: el <c>schedule()</c> de <c>:1540</c>. Android lo llama para que su lazo de
/// notificaciones vuelva a pedir las listas; en Windows el <c>contacts.unblockPeer</c> responde un <c>Bool</c>
/// (medido) y la pantalla vuelve a cargar ella sola —<c>BlockedSettings.tsx:53-56</c> reinicia la página tras el
/// desbloqueo porque los marcadores del servidor se desplazan—, así que no hay nada que empujar.
/// </para>
/// </summary>
public sealed partial class TelegramService
{
    /// <summary>
    /// <c>blockedSenders</c> (<c>:1507-1530</c>). La página se pide con <c>limit</c> = <c>PAGE_SIZE</c> y
    /// <c>my_stories_from</c> en falso, que es la traducción de pedir <c>BlockListMain</c> (<c>:1510</c>): la lista de
    /// historias no la ofrece ninguna pantalla. El total sale de <see cref="DesktopBlocked.Total"/> porque en MTProto
    /// la cifra no siempre viene, y el <c>catch</c> de <c>:1526</c> se convierte en la fila que no se puede armar:
    /// allá también se cae cuando el par no está en la memoria de la sesión.
    /// </summary>
    private async Task<object?> BlockedAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var offset = DesktopBlocked.Offset(args);
        var answer = await client.Contacts_GetBlocked(offset, DesktopBlocked.PageSize, false);
        if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);
        MergePeers(answer.users?.Values, answer.chats?.Values);
        var rows = new List<object>();
        foreach (var blocked in answer.blocked ?? Array.Empty<PeerBlocked>())
        {
            var entry = EntryFromPeer(blocked.peer_id) ?? throw new BridgeException(DesktopBlocked.ListFailed);
            rows.Add(DesktopBlocked.Row(blocked.peer_id,
                DesktopContact.Limit(entry.Title, DesktopBlocked.NameShown), entry.Photo));
        }
        return DesktopBlocked.Page(rows, offset, DesktopBlocked.Total(answer, rows.Count));
    }

    /// <summary>
    /// <c>unblockSender</c> (<c>:1531-1542</c>): el remitente se corta antes de tocar nada
    /// (<see cref="DesktopBlocked.Requested"/> es <c>BlockedSendersPolicy.sender</c>, <c>:18-24</c>), la fila se busca
    /// releyendo, el cuadro de confirmar es el de Android con sus cuatro rótulos y el <c>contacts.unblockPeer</c> va
    /// después de la última mirada a la cuenta. Cancelar responde <c>false</c>, igual que los tres caminos de
    /// <c>:1537</c>, <c>:1541</c> y el <c>setOnCancelListener</c>.
    /// </summary>
    private async Task<object?> UnblockSenderAsync(JsonElement args)
    {
        var client = CollectionClient();
        var owner = client.User?.id ?? 0;
        var (kind, id) = DesktopBlocked.Requested(args, owner);
        var peer = await BlockedPeerAsync(client, kind, id, owner) ?? throw new BridgeException(DesktopBlocked.NotInList);
        var target = UnblockTarget(peer);
        var name = DesktopContact.Limit(
            EntryFromPeer(peer)?.Title ?? throw new BridgeException(DesktopBlocked.ListFailed), DesktopBlocked.NameShown);
        if (!ConfirmPhoto(DesktopBlocked.Title(name), DesktopBlocked.Body, DesktopBlocked.Accept, null)) return false;
        if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);
        await client.Contacts_Unblock(target, false);
        if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);
        return true;
    }

    /// <summary>
    /// <c>profileBlock</c> (<c>:1280-1287</c>): las dos guardas de Java en su orden y, según el valor, una de las dos
    /// peticiones simétricas. No abre ventana ninguna porque Android tampoco: el cuadro de confirmar es el de la
    /// pantalla (<c>App.tsx:748-751</c>) y la orden ya llega decidida. El <c>ok(true)</c> de <c>:1286</c> responde lo
    /// que TDLib aceptó sin mirar el <c>updates</c>; aquí se responde <c>true</c> cuando la librería no lanza, que es
    /// el mismo contrato.
    /// </summary>
    private async Task<object?> SetBlockProfileAsync(JsonElement args)
    {
        var client = CollectionClient();
        var entry = RequireEntry(Str(args, "id"));
        if (entry.Peer is not PeerUser person) throw new BridgeException(DesktopBlocked.NotPrivate);
        if (person.user_id == (client.User?.id ?? 0)) throw new BridgeException(DesktopBlocked.SelfBlock);
        var block = DesktopBlocked.BlockValue(args);
        if (entry.Input is not InputPeerUser target || target.access_hash == 0)
            throw new BridgeException(DesktopBlocked.NoProfileHash);
        if (block) await client.Contacts_Block(target, false);
        else await client.Contacts_Unblock(target, false);
        return true;
    }

    /// <summary>
    /// El par de verdad del remitente que la pantalla nombró, buscado página a página por <c>contacts.getBlocked</c>
    /// y no en la caché: el <c>kind</c> que devuelve la pantalla vale para grupos básicos y canales a la vez, así que
    /// el número suelto no dice cuál de los dos es. Cada pasada vuelca sus diccionarios, que son los que después dan
    /// el <c>access_hash</c>. Se para en la página corta —el final de la lista— y en el techo del marcador, que es el
    /// único techo que existe: no hay una cuenta que pueda decir «busca solo hasta aquí».
    /// </summary>
    private async Task<TL.Peer?> BlockedPeerAsync(Client client, string kind, long id, long owner)
    {
        for (var offset = 0; offset <= DesktopBlocked.MaxOffset; offset += DesktopBlocked.PageSize)
        {
            var answer = await client.Contacts_GetBlocked(offset, DesktopBlocked.PageSize, false);
            if (client.User?.id != owner) throw new BridgeException(DesktopBlocked.ChangedAccount);
            MergePeers(answer.users?.Values, answer.chats?.Values);
            var rows = answer.blocked ?? Array.Empty<PeerBlocked>();
            if (rows.FirstOrDefault(row => SameSender(row.peer_id, kind, id)) is { } found) return found.peer_id;
            if (rows.Length < DesktopBlocked.PageSize) return null;
        }
        return null;
    }

    /// <summary>
    /// La comparación que la pantalla no puede hacer por sí sola: subtipo y número. El <c>kind</c> ya viene cortado
    /// por <see cref="DesktopBlocked.Requested"/>, así que los dos ramales son los únicos posibles y un
    /// <c>PeerEmpty</c> —el cuarto subtipo medido en la base— no coincide con nada.
    /// </summary>
    private static bool SameSender(TL.Peer peer, string kind, long id) => kind switch
    {
        DesktopBlocked.UserKind => peer is PeerUser user && user.user_id == id,
        DesktopBlocked.ChatKind => (peer is PeerChat chat && chat.chat_id == id)
                                   || (peer is PeerChannel channel && channel.channel_id == id),
        _ => false
    };

    /// <summary>
    /// El <c>InputPeer</c> que acepta <c>contacts.unblockPeer</c>. El grupo básico es el único de los tres que se arma
    /// sin <c>access_hash</c> (medido: <c>InputPeerChat(chat_id)</c>); en los otros dos el hash se toma del
    /// diccionario de la última página leída, y cero no se manda nunca: <see cref="DesktopBlocked.NeedsHash"/> corta
    /// la orden antes de preguntar, que es el mismo criterio con el que la ronda AZ negó las cuatro escrituras de
    /// miembro (<c>DesktopMemberSanctionFlow.cs:210</c>).
    /// </summary>
    private InputPeer UnblockTarget(TL.Peer peer) => peer switch
    {
        PeerChat chat => new InputPeerChat(chat.chat_id),
        PeerUser user when _users.GetValueOrDefault(user.user_id) is { access_hash: > 0 } known
            => new InputPeerUser(user.user_id, known.access_hash),
        PeerChannel channel when _chats.GetValueOrDefault(channel.channel_id) is Channel full && full.access_hash > 0
            => new InputPeerChannel(full.id, full.access_hash),
        _ => throw new BridgeException(DesktopBlocked.NeedsHash)
    };
}
