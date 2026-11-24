import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * Cada vez que una ronda mete o quita líneas en el despacho de Windows, se desplazan todas las citas que otras
 * rondas dejaron escritas con número de línea. Las agujas no se rompen porque miran contenido, pero el número que
 * va en un comentario o en un documento sí se pudre en silencio. Este archivo es el cortafuegos de esa clase de
 * pudrición, para el sitio donde más cita se ha escrito: los números de las tablas de abajo están medidos hoy,
 * línea por línea, y no hay ninguna tabla intermedia que los lleve a otro sitio.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const serviceLines = service.split(/\r?\n/);

/** Todo archivo que puede citar al host: las dos orillas del cable y los tres documentos de registro. */
const hosts: [string, string][] = [
  ...readdirSync(new URL('../../desktop/src/WRGram.Desktop/', import.meta.url))
    .filter(name => name.endsWith('.cs'))
    .map((name): [string, string] => [`desktop/${name}`, text(`../../desktop/src/WRGram.Desktop/${name}`)]),
  ...readdirSync(new URL('.', import.meta.url))
    .filter(name => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
    .map((name): [string, string] => [`ui/${name}`, text(`./${name}`)]),
  ['docs/validation.md', text('../../../docs/validation.md')],
  ['docs/telegram-flow-audit-2026-11-13.md', text('../../../docs/telegram-flow-audit-2026-11-13.md')],
  ['docs/android-play.md', text('../../../docs/android-play.md')],
];

/** Lo que tiene que decir la línea citada. Una fila por número, medida hoy, línea por línea. */
const anchors: Record<number, string> = {
  112: 'if (method == "media.load")',
  117: 'if (method == "media.retry")',
  122: 'object? result = method switch',
  // La negativa por su nombre de la familia del teléfono (ronda A02), citada en el bullet del 24.
  154: '"account.phone.change" or "account.phone.check" or "account.phone.resend" => throw',
  178: '"privacy.autoDelete" =>',
  // El brazo de silencio por defecto que la ronda CJ cita en la fila X06 del mapa.
  224: '"chat.defaultSilent" => SetDefaultSilent(args),',
  226: '"chat.join" =>',
  259: '"profile.sender" =>',
  276: '"groups.permissions.get" =>',
  284: '"groups.stats" =>',
  290: '"chat.invite" =>',
  314: '"history.byDate" =>',
  322: '"message.forward" =>',
  // El brazo de sustituir el archivo de un mensaje enviado (ronda CK-B), citado en la hoja de validación y en la
  // fila F04 del mapa.
  330: '"message.edit.media" => await EditMessageMediaAsync(args),',
  // La barrida reescribió el punto 7 de la ronda AD, que decía en presente que `scheduled.list` no tenía brazo.
  340: '"scheduled.list" => await ScheduledListAsync(args),',
  348: '"attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),',
  // La barrida de citas reancló la fila X06 del mapa, que decía en presente que `message.album` seguía sin brazo:
  // hoy lo tiene, y es la línea que lo prueba.
  359: '"message.album" => await AlbumItemsAsync(args),',
  // La negativa con nombre de cerrar una encuesta, que la ronda CF cita dos veces para decir que sigue sin cubrirse.
  373: '"poll.stop" => throw new BridgeException(DesktopPoll.NoStop)',
  379: '"message.react" or "message.react.custom" => await ReactAsync(args, method == "message.react.custom"),',
  // La negativa con nombre que la ronda BX dejó como única de las tres claves de reacción, citada en el mapa.
  380: '"message.react.paid" => throw new BridgeException(DesktopMessageReact.PaidRefused),',
  // Los once brazos de la familia del emoji (ronda BY), citados como rango en la hoja de validación.
  389: '"emojiStatus.state" => await EmojiStatusStateAsync(),',
  // La última rama de la familia del emoji, que la CD cita como el borde por delante del suyo.
  399: '"stickers.install" => await ChangeStickerSetAsync(args),',
  // El brazo de la marca de Premium (ronda CD), citado en la hoja de validación y en la fila X06 del mapa.
  404: '"premium.state" => await PremiumStateAsync(),',
  409: '"app.background" => true',
  410: '"native.settings" => OpenDataFolder()',
  415: '"message.link" =>',
  416: '"link.open" =>',
  422: '"message.readDate" => await ReadDateAsync(args),',
  // La visera de las cuatro lectoras de historias y su primer brazo (ronda BZ), citados en la hoja de validación y en
  // la fila T05 del mapa.
  426: '// Las cuatro lectoras de la ronda BZ',
  430: '"chat.stories" =>',
  // El brazo de crear el enlace y la primera línea de los tres pegados de la ronda CI, citados en su bullet.
  448: '"folders.link" => await FolderLinkAsync(args),',
  450: '"folders.links.list" => await FolderLinksListAsync(args),',
  477: '"contacts.list" =>',
  483: '"contacts.open" =>',
  487: '"contacts.add" =>',
  // Los dos brazos de la ubicación en directo (ronda CB), citados como rango en la fila F09 del mapa.
  499: '"location.live.start" => throw new BridgeException(DesktopLiveLocation.NoSensor)',
  500: '"location.live.stop" => await StopLiveLocationAsync(args),',
  // Los dos brazos de los fondos de la cuenta (ronda CH-B), citados en la fila A06 del mapa, y la lectura de
  // arranque que los pinta antes de que nadie abra el panel.
  507: '"backgrounds.list" => await BackgroundsListAsync(args),',
  508: '"background.set" => await BackgroundSetAsync(args),',
  513: '_ => throw new BridgeException',
  // La línea que la visera de historias (ronda BZ) cita para decir que `selfId` viaja sin prefijo, que es la forma
  // con la que la pantalla reconoce al autor de la propia historia.
  603: '_state.SelfId = user.id.ToString();',
  605: '_state.ProfilePhoto = _media.RegisterProfile(',
  // La siembra de la marca Premium en el estado del escritorio, que la CD cita al corregir la nota que dejó la BY.
  610: '_state.Wallet = new WalletDto { Premium = DesktopEmojiCatalog.IsPremium(user) };',
  // La lectura de los fondos de la cuenta al entrar (ronda CH-B), citada en la fila A06 del mapa: es la única forma
  // que tiene este host de saber qué está puesto, porque Telegram no lo avisa por el cable.
  625: 'await RefreshCloudSlotsAsync();',
  // Las dos marcas del silencio por defecto (ronda CJ), citadas en su bullet y en la fila X06 del mapa.
  851: 'DefaultSilent = DefaultSilentMark(entry.Id)',
  916: 'DefaultSilent = DefaultSilentMark(entry.Id)',
  1003: 'private async Task<object?> OpenContactAsync(',
  1079: 'private async Task<object?> JoinChatAsync(',
  1130: 'private async Task<object?> MessageLinkAsync(',
  1150: 'private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(',
  1165: 'private async Task<object?> LinkFromUrlAsync(',
  1209: 'private static string LinkRefusal(',
  1246: 'private async Task<object?> HistoryDateAsync(',
  1616: 'private async Task<object?> ForwardAsync(',
  // Las nueve líneas del reenvío que la ronda AD citó sin nombre de archivo delante, medidas hoy una a una.
  1621: 'var ids = DesktopMessageDelete.Ids(requested)',
  1623: 'var rows = DesktopMessageDelete.Loaded(_state.Messages, source.Id, ids);',
  1626: 'var target = FindEntry(Str(args, "to"))',
  1627: 'var when = Str(args, "schedule");',
  1640: 'var random = ids.Select(_ => Random.Shared.NextInt64(1, long.MaxValue)).ToArray();',
  1641: 'await _client.Messages_ForwardMessages(source.Input, ids, random, target.Input,',
  1646: 'if (target.Id == source.Id) await RefreshHistoryLocked();',
  1651: '_state.Uncertain = true;',
  2070: 'private async Task<object?> AttachmentPickAsync(string kind)',
  2208: 'attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)',
  // Las cuatro líneas del tope real de la copia privada (ronda CP), citadas en la fila F01 del mapa y en la hoja
  // de validación: las dos copias con la bandera de la cuenta, la firma que recibe esa bandera y el corte durante
  // la copia, no después.
  2102: 'size = await ImportCopyAsync(target, chosen, DesktopEmojiCatalog.IsPremium(client.User!));',
  2122: 'private static async Task<long> ImportCopyAsync(string target, string source, bool premium)',
  2132: 'if (DesktopAttachment.Exceeds(written, premium)) throw new BridgeException(DesktopAttachment.TooBigOf(premium));',
  2309: 'size = await ImportCopyAsync(target, source, DesktopEmojiCatalog.IsPremium(client.User!));',
  // Las nueve citas de la ronda CN-B: la hoja de validación y la fila P01 del mapa señalan la subida de la foto por
  // opción, la clave que ya no se inventa y el registro de la lectura.
  2510: 'var pictures = DesktopPoll.Photos(Arr(args, "media"));',
  2516: 'throw new BridgeException(DesktopPoll.ChangedPhotos);',
  2517: 'if (!DesktopAttachment.IsPhoto(picked.Mime))',
  2520: 'if (!DesktopPoll.PhotosMatch(pictures.Length, options.Length))',
  2537: 'var keys = pictures.Length > 0 ? null',
  2589: 'var uploaded = await client.UploadFileAsync(photos[position].Path, null);',
  2590: 'var stored = await client.Messages_UploadMedia(',
  2607: 'foreach (var token in pictures) DropOutbox(token);',
  2984: 'Media = DesktopPoll.PhotoOf(answers[position]) is { } picture',
  // Los seis números del cierre temporizado (ronda CF): la hoja de validación los cuenta uno a uno y la fila P01 del
  // mapa cita la guarda, la bandera y la fecha.
  2529: 'var duration = (int)Long(args, "duration", 0)',
  2530: 'if (!DesktopPoll.ClosesInRange(duration))',
  // La última negación del envío, la de la descripción (ronda CM), citada en la hoja de validación y en la fila P01 del mapa.
  2533: 'if (DesktopPoll.HasDescription(Str(args, "description")))',
  2550: 'var media = new InputMediaPoll { poll = poll }',
  2554: 'if (duration > 0)',
  2556: 'poll.flags |= TL.Poll.Flags.has_close_date',
  2557: 'poll.close_date = DesktopPoll.CloseDate(',
  // Los seis envíos a los que la ronda CJ aplica el silencio por defecto: la hoja de validación los cuenta uno a
  // uno y la fila X06 del mapa cita el de texto y el de reenvío a un chat reenumerado.
  1461: 'var silent = SilentFor(entry.Id, args);',
  // La otra media pareja del `DesktopSchedule` que la ronda AD citó por vecindad: el flujo de texto.
  1465: 'var when = Str(args, "schedule");',
  1634: 'var silent = SilentFor(target.Id, args);',
  2196: 'var silent = SilentFor(entry.Id, args);',
  2371: 'var silent = SilentFor(entry.Id, args);',
  2575: 'var silent = SilentFor(entry.Id, args);',
  // La lectura de la agenda, que la ronda AQ citaba con un número pelado que heredaba `NativeBridge.java`: el
  // `MergePeers` que alimenta `_users` con los usuarios que trae `contacts.getContacts`.
  2758: 'MergePeers(page.users?.Values, null);',
  2853: 'var silent = SilentFor(entry.Id, args);',
  2895: 'dispatcher.Invoke(() => Clipboard.SetText(text))',
  // El comentario que la ronda CF cita para decir que `canStop` sale en falso, y la línea que lee el cierre al volver.
  2929: 'El <c>canStop</c> sale en <c>false</c>',
  // La fila del mapa cita hoy la asignación, no el comentario que la explica: la ronda CN la midió por contenido.
  2963: 'CanStop = false,',
  // La línea con la que la ronda CM declara el hueco al leer: la librería de escritorio no trae descripción nunca.
  2955: 'Description = "",',
  2971: 'if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt',
  // Las diez líneas del cuerpo del brazo de sustituir el archivo (ronda CK-B): la hoja de validación cita la
  // cabecera, las tres guardas en el orden en que caen, la lectura del mensaje fresco, la comprobación con el
  // espejo, la subida, la llamada con el `media`, el pie forzado del `catch` y la salida del índice de descartes.
  1820: 'private async Task<object?> EditMessageMediaAsync(JsonElement args)',
  1822: 'if (_client == null) throw new BridgeException(',
  1828: 'if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)',
  1835: 'if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);',
  1842: 'var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });',
  1856: 'var problem = DesktopMessageEditMedia.Problem(DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed),',
  1862: 'var uploaded = await client.UploadFileAsync(file.Path, null);',
  1865: 'await client.Messages_EditMessage(entry.Input, ids[0],',
  1866: 'message: DesktopMessageEditMedia.CaptionOf(fresh),',
  1877: 'DropOutbox(token);',
  3184: 'private async Task<object> PropertiesAsync(string id)',
  3195: 'var forwardable = message?.CanForward',
  // La bandera que ofrece la opción (ronda CK-B), medida en la propiedad de `message.properties`.
  3206: 'var canEditMedia = DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,',
  // La bandera de la cuenta que decide el botón ✨ (ronda CD), medida sobre la sesión conectada sin pasar por la red.
  3216: 'var customReaction = _client is Client session && session.User is { } self && DesktopEmojiCatalog.IsPremium(self);',
  3223: 'deleteSelf = DesktopMessageDelete.CanDeleteSelf(kind)',
  3228: 'editMedia = canEditMedia,',
  3234: 'reactions = band,',
  // La cara de Stars, que sigue apagada y la CD cita por su línea.
  3235: 'paid = false,',
  // La cara que el host manda desde la ronda CD, y la que el andamio espeja en lugar de apagar.
  3236: 'allowCustom = customReaction',
  // La cadena con la que el host ya negaba guardar, que la ronda AD puso como la misma del reenvío protegido.
  3254: 'if (!_media.CanExport(id)) throw new BridgeException(',
  3258: 'var name = DesktopDocuments.DownloadName(',
  3349: 'private bool OpenLink(',
  3377: 'private async Task<object?> OpenLocationAsync(',
  3384: 'ProtectedChat(entry)) throw new BridgeException',
  3388: 'MessageMediaGeoLive live => live.geo',
  // La línea que `DesktopLiveLocation.cs` cita para decir que el viajero de la ubicación en directo sabe quién la
  // escribió: sin `Outgoing` no hay botón de «Dejar de compartir».
  3418: 'Outgoing = (message.flags & TL.Message.Flags.out_) != 0',
  3420: 'AlbumId = DesktopAlbum.AlbumIdOf(message)',
  // La barrida de citas escritas de oído reancló el `exportable` que la hoja cita al explicar las dos filas de
  // ubicación a medias: estaba dicho sin archivo.
  3440: 'var exportable = (message.flags & TL.Message.Flags.noforwards) == 0',
  3446: 'dto.CanForward = exportable',
  // La línea del DTO que la ronda CK-B cita por la bandera leída del medio.
  3450: 'dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);',
  3467: 'case MessageMediaContact card:',
  3486: 'case MessageMediaGeoLive live:',
  3510: 'case MessageMediaGeo fixedGeo:',
  3524: 'case MessageMediaVenue venue:',
  3538: 'case MessageMediaWebPage { webpage: WebPage page }:',
  3655: 'private string ServiceText(MessageService service, string actor = "") => service.action switch',
  // Los cinco brazos de llamada que la ronda CW-B pegó bajo la cabecera, y el paraguas al que ya no caen.
  3665: 'MessageActionPhoneCall call => DesktopServiceCalls.PhoneCall(call),',
  3670: '_ => "Mensaje de servicio de Telegram"',
  3702: 'MessageEntityUnderline => "underline"',
  3766: '"blockquote" => new MessageEntityBlockquote()',
  // Las tres cadenas con prefijo que `DesktopStories.cs` cita para explicar por qué `chatId` del DTO no es un número
  // de TDLib: son la clave con la que `RequireEntry` reencuentra la fila.
  3798: 'var id = "u" + user.id;',
  3815: 'var id = "g" + chat.ID;',
  3828: 'var id = "c" + channel.ID;',
  3839: 'Username = channel.MainUsername',
  3873: 'private ChatEntry RequireEntry(string id)',
  3879: 'return "@" + user.MainUsername',
  3898: 'MessageMediaGeoLive => DesktopLocation.Live',
  // Las cinco citas que escribió la ronda CW-D al bajar el actor hasta el despacho: las dos llamadas que pasan de
  // acción pelada a mensaje entero, la firma de instancia de `PreviewOf` y los dos ayudantes dueños de la caché.
  3584: 'Text = ServiceText(service, ActorOf(service)),',
  3883: 'private string PreviewOf(MessageBase? message)',
  3913: 'if (message is MessageService service) return ServiceText(service, ActorOf(service));',
  3920: 'private string ActorOf(MessageBase message) =>',
  3924: 'que es lo que dice <c>TdSession.java:1313</c>',
  3926: 'private string UserName(long id) =>',
  // La firma de `Describe`, que `DesktopGroupStats.cs` cita para decir que el rechazo de sesión ya lo traduce el host.
  3980: 'private static string Describe(Exception exception)',
  3991: 'if (code.StartsWith("AUTH_KEY_UNREGISTERED")',
  // Las veinte líneas de las entidades de formato (ronda CE): la hoja de validación cita la firma de los dos
  // miembros, las cuatro guardas en el orden en que caen, el brazo del emoji personalizado y su negativa nombrada,
  // la ordenación, los dos ayudantes de la cifra y la dirección, las tres caras de la vuelta y sus dos llamadas.
  392: '"customEmoji.get" => await CustomEmojiAsync(args),',
  3692: 'private static List<EntityDto>? ConvertEntities(MessageEntity[]? entities, string text)',
  3710: 'MessageEntityCustomEmoji => "customEmoji",',
  3721: 'MessageEntityTextUrl link => link.url,',
  3723: 'MessageEntityUrl => DesktopTextEntities.TextAsUrl(text, entity.offset, entity.length),',
  3728: 'CustomEmojiId = entity is MessageEntityCustomEmoji face ? face.document_id.ToString() : null',
  3741: 'private static MessageEntity[]? ParseEntities(JsonElement args, string text)',
  3744: 'var ceiling = DesktopTextEntities.TooManyProblem(array.GetArrayLength());',
  3750: 'if (!item.TryGetProperty("offset", out var offsetElement)',
  3752: 'if (!item.TryGetProperty("length", out var lengthElement)',
  3754: 'var range = DesktopTextEntities.OffsetProblem(offset, length, text);',
  3768: '"customEmoji" => new MessageEntityCustomEmoji { document_id = FaceIdOf(item) },',
  3769: '_ => throw new BridgeException(DesktopTextEntities.UnknownTypeProblem(type)!),',
  3776: 'return list.Count > 0 ? [.. list.OrderBy(entity => entity.offset)] : null;',
  3780: 'private static string LinkUrlOf(JsonElement item)',
  3789: 'private static long FaceIdOf(JsonElement item) =>',
  3428: 'dto.Entities = ConvertEntities(message.entities, dto.Text);',
  3436: 'dto.ReplyQuote = DesktopReplyQuote.Receive(header, ConvertEntities);',
  1472: 'var entities = ParseEntities(args, text);',
  1781: 'var entities = ParseEntities(args, value);',
  1793: 'row.Entities = ConvertEntities(entities, value);',
};


/** La última línea de cada rango citado; la primera la lleva la tabla de arriba. */
const rangeEnds = new Map<number, number>([
  [178, 181], [276, 277], [322, 323], [389, 399],
  [416, 417], [422, 423], [426, 429], [430, 433], [450, 452],
  [477, 479], [487, 488], [1246, 1261], [1465, 1469],
  [1627, 1631], [1651, 1654], [3195, 3225], [3388, 3390],
  [3665, 3669], [3898, 3900],
]);

const ends: Record<number, string> = {
  181: '"chat.autoDelete.set" =>',
  277: '"groups.permissions.set" =>',
  323: '"messages.forward" =>',
  399: '"stickers.install" =>',
  417: '"telegram.link" =>',
  423: '"message.viewers" => await MessageViewersAsync(args),',
  429: 'sigue sin brazo',
  433: '"story.close" =>',
  452: '"folders.links.delete" => await FolderLinkChangeAsync(args, delete: true),',
  479: '"share.contact" =>',
  488: '"contacts.remove" =>',
  1261: '}',
  3225: 'forward = forwardable',
  3390: 'MessageMediaVenue venue => venue.geo',
  3900: 'MessageMediaVenue venue => DesktopLocation.Title(',
  1469: 'if (scheduleProblem != null) throw new BridgeException(scheduleProblem);',
  1631: 'if (problem != null) throw new BridgeException(problem);',
  1654: 'Revisa el historial del destino antes de repetirlo',
  3669: 'MessageActionInviteToGroupCall call => DesktopServiceCalls.Invitation(call, actor, UserName, _client?.User?.id ?? 0, (service.flags & MessageService.Flags.out_) != 0),',
};

/** Las citas escritas, con su rango: `TelegramService.cs:NNN` o `TelegramService.cs:NNN-MMM`. */
function cited(from: string): [number, number][] {
  return [...from.matchAll(/TelegramService\.cs:(\d+)(?:-(\d+))?/g)]
    .map(match => [Number(match[1]), match[2] ? Number(match[2]) : 0]);
}
const written = new Map<number, number>();
for (const [, body] of hosts) for (const [start, end] of cited(body)) {
  if (!written.has(start) || (written.get(start) ?? 0) < end) written.set(start, end);
}

/** El despacho medido, con el mismo recorte que usan BK y BJ: brazos vivos, brazos que se niegan y su línea. */
function dispatch() {
  const start = serviceLines.findIndex(row => row.includes('object? result = method switch'));
  const generic = serviceLines.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  const arms = new Map<string, number>();
  serviceLines.slice(start, generic + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    for (const match of row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)) arms.set(match[1], start + offset + 1);
  });
  serviceLines.slice(0, start).forEach((row, index) => {
    const key = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (key) arms.set(key, index + 1);
  });
  return { start: start + 1, generic: generic + 1, arms };
}
const cable = dispatch();

const line = (at: number) => {
  const row = serviceLines[at - 1];
  if (row === undefined) throw new Error(`Falta la línea ${at} de TelegramService.cs`);
  return row;
};

describe('ronda BM · las citas del host, medida por línea', () => {
  it('cada cita escrita lleva hoy a la línea que la frase afirma', () => {
    for (const [at, needle] of Object.entries(anchors)) {
      expect(line(Number(at)), `TelegramService.cs:${at}`).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [start, end] of rangeEnds) {
      expect(anchors[start], `rango que empieza en ${start}`).toBeDefined();
      expect(line(end), `TelegramService.cs:${start}-${end}`).toContain(ends[end]);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort((a, b) => a - b)).toEqual(Object.keys(anchors).map(Number).sort((a, b) => a - b));
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    // Una cifra suelta `:414` atribuida al host por vecindad es una cita que se pudre en silencio: el día que
    // alguien meta líneas arriba, la aguja no existe. La casa exige el nombre completo en cada cita de este archivo.
    const loose = hosts
      .map(([name, body]) => [...body.matchAll(/TelegramService\.cs:[\d-]+[^)]{0,80}?`:(\d+)/g)].map(m => `${name}:${m[1]}`))
      .flat();
    expect(loose).toEqual([]);
  });

  it('las anclas que caen dentro del despacho son exactamente las líneas que mide el cable', () => {
    const mismatched: string[] = [];
    for (const at of Object.keys(anchors).map(Number)) {
      if (at < cable.start || at > cable.generic) continue;
      const key = /"([a-z][a-zA-Z0-9._]*)"/.exec(line(at))?.[1];
      if (!key) continue;
      if (cable.arms.get(key) !== at) mismatched.push(`${key}: cita ${at}, cable ${cable.arms.get(key)}`);
    }
    expect(mismatched).toEqual([]);
  });

  it('el rechazo genérico y la cabecera del `switch` están anclados por su línea medida', () => {
    expect(anchors[cable.generic]).toContain('_ => throw new BridgeException');
    expect(anchors[cable.start]).toContain('object? result = method switch');
  });

  it('las dos cifras que los documentos recuerdan del despacho están medidas, no copiadas', () => {
    const answered = new Set<string>();
    const refused = new Set<string>();
    const start = cable.start - 1;
    serviceLines.slice(start, cable.generic).forEach(row => {
      const arrow = row.indexOf('=>');
      if (arrow < 0) return;
      const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
      const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
      for (const key of keys) (negative ? refused : answered).add(key);
    });
    serviceLines.slice(0, start).forEach(row => {
      const key = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
      if (key) answered.add(key);
    });
    const map = hosts.find(([name]) => name.startsWith('docs/telegram-flow'))?.[1] ?? '';
    const notes = hosts.find(([name]) => name === 'docs/validation.md')?.[1] ?? '';
    expect(map).toContain(`lo que da hoy **${answered.size}** claves contestadas`);
    expect(notes).toContain(`Cifras: **${answered.size}** brazos vivos`);
    expect(notes).toContain(`**${refused.size}** brazos que se niegan`);
  });
});
