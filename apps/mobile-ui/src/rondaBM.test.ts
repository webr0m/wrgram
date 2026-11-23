import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * La ronda BL metió cinco líneas en el despacho de Windows y, con ellas, desplazó todas las citas que otras rondas
 * habían dejado escritas con número de línea. Ninguna aguja se rompió: las pruebas miran contenido, no el número que
 * va en un comentario o en un documento. Este archivo es el cortafuegos de esa clase de pudrición, para el sitio
 * donde más cita se ha escrito.
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
  173: '"privacy.autoDelete" =>',
  // El brazo de silencio por defecto que la ronda CJ cita en la fila X06 del mapa.
  219: '"chat.defaultSilent" => SetDefaultSilent(args),',
  221: '"chat.join" =>',
  254: '"profile.sender" =>',
  271: '"groups.permissions.get" =>',
  279: '"groups.stats" =>',
  285: '"chat.invite" =>',
  309: '"history.byDate" =>',
  317: '"message.forward" =>',
  // El brazo de sustituir el archivo de un mensaje enviado (ronda CK-B), citado en la hoja de validación y en la
  // fila F04 del mapa.
  325: '"message.edit.media" => await EditMessageMediaAsync(args),',
  // La barrida reescribió el punto 7 de la ronda AD, que decía en presente que `scheduled.list` no tenía brazo.
  335: '"scheduled.list" => await ScheduledListAsync(args),',
  343: '"attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),',
  // La barrida de citas reancló la fila X06 del mapa, que decía en presente que `message.album` seguía sin brazo:
  // hoy lo tiene, y es la línea que lo prueba.
  354: '"message.album" => await AlbumItemsAsync(args),',
  // La negativa con nombre de cerrar una encuesta, que la ronda CF cita dos veces para decir que sigue sin cubrirse.
  368: '"poll.stop" => throw new BridgeException(DesktopPoll.NoStop)',
  374: '"message.react" or "message.react.custom" => await ReactAsync(args, method == "message.react.custom"),',
  // La negativa con nombre que la ronda BX dejó como única de las tres claves de reacción, citada en el mapa.
  375: '"message.react.paid" => throw new BridgeException(DesktopMessageReact.PaidRefused),',
  // Los once brazos de la familia del emoji (ronda BY), citados como rango en la hoja de validación.
  384: '"emojiStatus.state" => await EmojiStatusStateAsync(),',
  // La última rama de la familia del emoji, que la CD cita como el borde por delante del suyo.
  394: '"stickers.install" => await ChangeStickerSetAsync(args),',
  // El brazo de la marca de Premium (ronda CD), citado en la hoja de validación y en la fila X06 del mapa.
  399: '"premium.state" => await PremiumStateAsync(),',
  404: '"app.background" => true',
  405: '"native.settings" => OpenDataFolder()',
  410: '"message.link" =>',
  411: '"link.open" =>',
  // La visera de las cuatro lectoras de historias y su primer brazo (ronda BZ), citados en la hoja de validación y en
  // la fila T05 del mapa.
  419: '// Las cuatro lectoras de la ronda BZ',
  423: '"chat.stories" =>',
  // El brazo de crear el enlace y la primera línea de los tres pegados de la ronda CI, citados en su bullet.
  441: '"folders.link" => await FolderLinkAsync(args),',
  443: '"folders.links.list" => await FolderLinksListAsync(args),',
  470: '"contacts.list" =>',
  476: '"contacts.open" =>',
  480: '"contacts.add" =>',
  // Los dos brazos de la ubicación en directo (ronda CB), citados como rango en la fila F09 del mapa.
  492: '"location.live.start" => throw new BridgeException(DesktopLiveLocation.NoSensor)',
  493: '"location.live.stop" => await StopLiveLocationAsync(args),',
  // Los dos brazos de los fondos de la cuenta (ronda CH-B), citados en la fila A06 del mapa, y la lectura de
  // arranque que los pinta antes de que nadie abra el panel.
  500: '"backgrounds.list" => await BackgroundsListAsync(args),',
  501: '"background.set" => await BackgroundSetAsync(args),',
  506: '_ => throw new BridgeException',
  // La línea que la visera de historias (ronda BZ) cita para decir que `selfId` viaja sin prefijo, que es la forma
  // con la que la pantalla reconoce al autor de la propia historia.
  596: '_state.SelfId = user.id.ToString();',
  598: '_state.ProfilePhoto = _media.RegisterProfile(',
  // La siembra de la marca Premium en el estado del escritorio, que la CD cita al corregir la nota que dejó la BY.
  603: '_state.Wallet = new WalletDto { Premium = DesktopEmojiCatalog.IsPremium(user) };',
  // La lectura de los fondos de la cuenta al entrar (ronda CH-B), citada en la fila A06 del mapa: es la única forma
  // que tiene este host de saber qué está puesto, porque Telegram no lo avisa por el cable.
  618: 'await RefreshCloudSlotsAsync();',
  // Las dos marcas del silencio por defecto (ronda CJ), citadas en su bullet y en la fila X06 del mapa.
  844: 'DefaultSilent = DefaultSilentMark(entry.Id)',
  909: 'DefaultSilent = DefaultSilentMark(entry.Id)',
  996: 'private async Task<object?> OpenContactAsync(',
  1072: 'private async Task<object?> JoinChatAsync(',
  1123: 'private async Task<object?> MessageLinkAsync(',
  1143: 'private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(',
  1158: 'private async Task<object?> LinkFromUrlAsync(',
  1202: 'private static string LinkRefusal(',
  1239: 'private async Task<object?> HistoryDateAsync(',
  1617: 'private async Task<object?> ForwardAsync(',
  // Las nueve líneas del reenvío que la ronda AD citó sin nombre de archivo delante, medidas hoy una a una.
  1622: 'var ids = DesktopMessageDelete.Ids(requested)',
  1624: 'var rows = DesktopMessageDelete.Loaded(_state.Messages, source.Id, ids);',
  1627: 'var target = FindEntry(Str(args, "to"))',
  1628: 'var when = Str(args, "schedule");',
  1641: 'var random = ids.Select(_ => Random.Shared.NextInt64(1, long.MaxValue)).ToArray();',
  1642: 'await _client.Messages_ForwardMessages(source.Input, ids, random, target.Input,',
  1647: 'if (target.Id == source.Id) await RefreshHistoryLocked();',
  1652: '_state.Uncertain = true;',
  2071: 'private async Task<object?> AttachmentPickAsync(string kind)',
  2209: 'attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)',
  // Las nueve citas de la ronda CN-B: la hoja de validación y la fila P01 del mapa señalan la subida de la foto por
  // opción, la clave que ya no se inventa y el registro de la lectura.
  2511: 'var pictures = DesktopPoll.Photos(Arr(args, "media"));',
  2517: 'throw new BridgeException(DesktopPoll.ChangedPhotos);',
  2518: 'if (!DesktopAttachment.IsPhoto(picked.Mime))',
  2521: 'if (!DesktopPoll.PhotosMatch(pictures.Length, options.Length))',
  2538: 'var keys = pictures.Length > 0 ? null',
  2590: 'var uploaded = await client.UploadFileAsync(photos[position].Path, null);',
  2591: 'var stored = await client.Messages_UploadMedia(',
  2608: 'foreach (var token in pictures) DropOutbox(token);',
  2985: 'Media = DesktopPoll.PhotoOf(answers[position]) is { } picture',
  // Los seis números del cierre temporizado (ronda CF): la hoja de validación los cuenta uno a uno y la fila P01 del
  // mapa cita la guarda, la bandera y la fecha.
  2530: 'var duration = (int)Long(args, "duration", 0)',
  2531: 'if (!DesktopPoll.ClosesInRange(duration))',
  // La última negación del envío, la de la descripción (ronda CM), citada en la hoja de validación y en la fila P01 del mapa.
  2534: 'if (DesktopPoll.HasDescription(Str(args, "description")))',
  2551: 'var media = new InputMediaPoll { poll = poll }',
  2555: 'if (duration > 0)',
  2557: 'poll.flags |= TL.Poll.Flags.has_close_date',
  2558: 'poll.close_date = DesktopPoll.CloseDate(',
  // Los seis envíos a los que la ronda CJ aplica el silencio por defecto: la hoja de validación los cuenta uno a
  // uno y la fila X06 del mapa cita el de texto y el de reenvío a un chat reenumerado.
  1462: 'var silent = SilentFor(entry.Id, args);',
  // La otra media pareja del `DesktopSchedule` que la ronda AD citó por vecindad: el flujo de texto.
  1466: 'var when = Str(args, "schedule");',
  1635: 'var silent = SilentFor(target.Id, args);',
  2197: 'var silent = SilentFor(entry.Id, args);',
  2372: 'var silent = SilentFor(entry.Id, args);',
  2576: 'var silent = SilentFor(entry.Id, args);',
  // La lectura de la agenda, que la ronda AQ citaba con un número pelado que heredaba `NativeBridge.java`: el
  // `MergePeers` que alimenta `_users` con los usuarios que trae `contacts.getContacts`.
  2759: 'MergePeers(page.users?.Values, null);',
  2854: 'var silent = SilentFor(entry.Id, args);',
  2896: 'dispatcher.Invoke(() => Clipboard.SetText(text))',
  // El comentario que la ronda CF cita para decir que `canStop` sale en falso, y la línea que lee el cierre al volver.
  2930: 'El <c>canStop</c> sale en <c>false</c>',
  // La fila del mapa cita hoy la asignación, no el comentario que la explica: la ronda CN la midió por contenido.
  2964: 'CanStop = false,',
  // La línea con la que la ronda CM declara el hueco al leer: la librería de escritorio no trae descripción nunca.
  2956: 'Description = "",',
  2972: 'if (DesktopPoll.HasCloseDate(poll)) dto.ClosesAt',
  // Las diez líneas del cuerpo del brazo de sustituir el archivo (ronda CK-B): la hoja de validación cita la
  // cabecera, las tres guardas en el orden en que caen, la lectura del mensaje fresco, la comprobación con el
  // espejo, la subida, la llamada con el `media`, el pie forzado del `catch` y la salida del índice de descartes.
  1821: 'private async Task<object?> EditMessageMediaAsync(JsonElement args)',
  1823: 'if (_client == null) throw new BridgeException(',
  1829: 'if (!_outbox.TryGetValue(token, out var file) || file.Account != client.User!.id || file.Chat != _active)',
  1836: 'if (!File.Exists(file.Path)) throw new BridgeException(DesktopAttachment.NotPrepared);',
  1843: 'var found = await client.GetMessages(entry.Input, new InputMessageID { id = ids[0] });',
  1857: 'var problem = DesktopMessageEditMedia.Problem(DesktopMessageEditMedia.CanEditMedia(fresh, channelAllowed),',
  1863: 'var uploaded = await client.UploadFileAsync(file.Path, null);',
  1866: 'await client.Messages_EditMessage(entry.Input, ids[0],',
  1867: 'message: DesktopMessageEditMedia.CaptionOf(fresh),',
  1878: 'DropOutbox(token);',
  3185: 'private async Task<object> PropertiesAsync(string id)',
  3196: 'var forwardable = message?.CanForward',
  // La bandera que ofrece la opción (ronda CK-B), medida en la propiedad de `message.properties`.
  3207: 'var canEditMedia = DesktopMessageEditMedia.Offered(message?.Outgoing ?? false,',
  // La bandera de la cuenta que decide el botón ✨ (ronda CD), medida sobre la sesión conectada sin pasar por la red.
  3217: 'var customReaction = _client is Client session && session.User is { } self && DesktopEmojiCatalog.IsPremium(self);',
  3224: 'deleteSelf = DesktopMessageDelete.CanDeleteSelf(kind)',
  3229: 'editMedia = canEditMedia,',
  3235: 'reactions = band,',
  // La cara de Stars, que sigue apagada y la CD cita por su línea.
  3236: 'paid = false,',
  // La cara que el host manda desde la ronda CD, y la que el andamio espeja en lugar de apagar.
  3237: 'allowCustom = customReaction',
  // La cadena con la que el host ya negaba guardar, que la ronda AD puso como la misma del reenvío protegido.
  3255: 'if (!_media.CanExport(id)) throw new BridgeException(',
  3259: 'var name = DesktopDocuments.DownloadName(',
  3350: 'private bool OpenLink(',
  3378: 'private async Task<object?> OpenLocationAsync(',
  3385: 'ProtectedChat(entry)) throw new BridgeException',
  3389: 'MessageMediaGeoLive live => live.geo',
  // La línea que `DesktopLiveLocation.cs` cita para decir que el viajero de la ubicación en directo sabe quién la
  // escribió: sin `Outgoing` no hay botón de «Dejar de compartir».
  3419: 'Outgoing = (message.flags & TL.Message.Flags.out_) != 0',
  3421: 'AlbumId = DesktopAlbum.AlbumIdOf(message)',
  // La barrida de citas escritas de oído reancló el `exportable` que la hoja cita al explicar las dos filas de
  // ubicación a medias: estaba dicho sin archivo.
  3441: 'var exportable = (message.flags & TL.Message.Flags.noforwards) == 0',
  3447: 'dto.CanForward = exportable',
  // La línea del DTO que la ronda CK-B cita por la bandera leída del medio.
  3451: 'dto.MediaKind = DesktopMessageEditMedia.CurrentKind(message.media);',
  3468: 'case MessageMediaContact card:',
  3487: 'case MessageMediaGeoLive live:',
  3511: 'case MessageMediaGeo fixedGeo:',
  3525: 'case MessageMediaVenue venue:',
  3539: 'case MessageMediaWebPage { webpage: WebPage page }:',
  3656: 'private string ServiceText(MessageService service, string actor = "") => service.action switch',
  // Los cinco brazos de llamada que la ronda CW-B pegó bajo la cabecera, y el paraguas al que ya no caen.
  3666: 'MessageActionPhoneCall call => DesktopServiceCalls.PhoneCall(call),',
  3671: '_ => "Mensaje de servicio de Telegram"',
  3703: 'MessageEntityUnderline => "underline"',
  3767: '"blockquote" => new MessageEntityBlockquote()',
  // Las tres cadenas con prefijo que `DesktopStories.cs` cita para explicar por qué `chatId` del DTO no es un número
  // de TDLib: son la clave con la que `RequireEntry` reencuentra la fila.
  3799: 'var id = "u" + user.id;',
  3816: 'var id = "g" + chat.ID;',
  3829: 'var id = "c" + channel.ID;',
  3840: 'Username = channel.MainUsername',
  3874: 'private ChatEntry RequireEntry(string id)',
  3880: 'return "@" + user.MainUsername',
  3899: 'MessageMediaGeoLive => DesktopLocation.Live',
  // Las cinco citas que escribió la ronda CW-D al bajar el actor hasta el despacho: las dos llamadas que pasan de
  // acción pelada a mensaje entero, la firma de instancia de `PreviewOf` y los dos ayudantes dueños de la caché.
  3585: 'Text = ServiceText(service, ActorOf(service)),',
  3884: 'private string PreviewOf(MessageBase? message)',
  3914: 'if (message is MessageService service) return ServiceText(service, ActorOf(service));',
  3921: 'private string ActorOf(MessageBase message) =>',
  3925: 'que es lo que dice <c>TdSession.java:1309</c>',
  3927: 'private string UserName(long id) =>',
  // La firma de `Describe`, que `DesktopGroupStats.cs` cita para decir que el rechazo de sesión ya lo traduce el host.
  3981: 'private static string Describe(Exception exception)',
  3992: 'if (code.StartsWith("AUTH_KEY_UNREGISTERED")',
  // Las veinte líneas de las entidades de formato (ronda CE): la hoja de validación cita la firma de los dos
  // miembros, las cuatro guardas en el orden en que caen, el brazo del emoji personalizado y su negativa nombrada,
  // la ordenación, los dos ayudantes de la cifra y la dirección, las tres caras de la vuelta y sus dos llamadas.
  387: '"customEmoji.get" => await CustomEmojiAsync(args),',
  3693: 'private static List<EntityDto>? ConvertEntities(MessageEntity[]? entities, string text)',
  3711: 'MessageEntityCustomEmoji => "customEmoji",',
  3722: 'MessageEntityTextUrl link => link.url,',
  3724: 'MessageEntityUrl => DesktopTextEntities.TextAsUrl(text, entity.offset, entity.length),',
  3729: 'CustomEmojiId = entity is MessageEntityCustomEmoji face ? face.document_id.ToString() : null',
  3742: 'private static MessageEntity[]? ParseEntities(JsonElement args, string text)',
  3745: 'var ceiling = DesktopTextEntities.TooManyProblem(array.GetArrayLength());',
  3751: 'if (!item.TryGetProperty("offset", out var offsetElement)',
  3753: 'if (!item.TryGetProperty("length", out var lengthElement)',
  3755: 'var range = DesktopTextEntities.OffsetProblem(offset, length, text);',
  3769: '"customEmoji" => new MessageEntityCustomEmoji { document_id = FaceIdOf(item) },',
  3770: '_ => throw new BridgeException(DesktopTextEntities.UnknownTypeProblem(type)!),',
  3777: 'return list.Count > 0 ? [.. list.OrderBy(entity => entity.offset)] : null;',
  3781: 'private static string LinkUrlOf(JsonElement item)',
  3790: 'private static long FaceIdOf(JsonElement item) =>',
  3429: 'dto.Entities = ConvertEntities(message.entities, dto.Text);',
  1473: 'var entities = ParseEntities(args, text);',
  1782: 'var entities = ParseEntities(args, value);',
  1794: 'row.Entities = ConvertEntities(entities, value);',
};

/** La última línea de cada rango citado; la primera la lleva la tabla de arriba. */
const rangeEnds = new Map<number, number>([
  [173, 176], [271, 272], [317, 318], [384, 394],
  [411, 412], [419, 422], [423, 426], [443, 445],
  [470, 472], [480, 481], [1239, 1254], [3196, 3226],
  [3389, 3391], [3899, 3901], [1466, 1470], [1628, 1632], [1652, 1655],
  [3666, 3670],
]);

const ends: Record<number, string> = {
  176: '"chat.autoDelete.set" =>',
  272: '"groups.permissions.set" =>',
  318: '"messages.forward" =>',
  394: '"stickers.install" =>',
  412: '"telegram.link" =>',
  422: 'sigue sin brazo',
  426: '"story.close" =>',
  445: '"folders.links.delete" => await FolderLinkChangeAsync(args, delete: true),',
  472: '"share.contact" =>',
  481: '"contacts.remove" =>',
  1254: '}',
  3226: 'forward = forwardable',
  3391: 'MessageMediaVenue venue => venue.geo',
  3901: 'MessageMediaVenue venue => DesktopLocation.Title(',
  1470: 'if (scheduleProblem != null) throw new BridgeException(scheduleProblem);',
  1632: 'if (problem != null) throw new BridgeException(problem);',
  1655: 'Revisa el historial del destino antes de repetirlo',
  3670: 'MessageActionInviteToGroupCall call => DesktopServiceCalls.Invitation(call, actor, UserName, _client?.User?.id ?? 0, (service.flags & MessageService.Flags.out_) != 0),',
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
  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [at, needle] of Object.entries(anchors)) expect(line(Number(at)), `TelegramService.cs:${at}`).toContain(needle);
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [, end] of rangeEnds) {
      expect(end, `rango que termina en ${end}`).toBeGreaterThan(0);
      expect(line(end), `TelegramService.cs:${end}`).toContain(ends[end]);
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
