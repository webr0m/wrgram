import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { readDateLabel } from './readReceipts';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const desktopDir = '../../desktop/src/WRGram.Desktop/';
const receipts = text(`${javaDir}ReadReceipts.java`);
const bridge = text(`${javaDir}NativeBridge.java`);
const tdSession = text(`${javaDir}TdSession.java`);
const bridgeSource = text('./bridge.ts');
const policy = text(`${javaDir}BridgePolicy.java`);
const service = text(`${desktopDir}TelegramService.cs`);
const readOutbox = text(`${desktopDir}DesktopReadOutbox.cs`);
const projection = text(`${desktopDir}DesktopReadReceipts.cs`);
const flow = text(`${desktopDir}DesktopReadReceiptsFlow.cs`);
const launcher = text('../../../scripts/desktop.ps1');
const probeProject = text('../../../.tools/ctprobe/CtProbe.csproj');
const probe = text('../../../.tools/ctprobe/Program.cs');
const app = text('./App.tsx');
const styles = text('./style.css');
const preview = text('./preview.ts');
const scope = text('./desktopScope.ts');

describe('ronda CT · M05: fecha de lectura y lectores', () => {
  it('la interfaz nombra las cinco respuestas de lectura sin inventar una fecha', () => {
    const format = (seconds: number) => `fecha ${seconds}`;
    expect(readDateLabel({ state: 'read', date: 1700000000 }, format)).toBe('Leído el fecha 1700000000.');
    expect(readDateLabel({ state: 'unread' }, format)).toBe('Aún no lo ha leído.');
    expect(readDateLabel({ state: 'tooOld' }, format)).toBe('El mensaje es demasiado antiguo para consultar su lectura.');
    expect(readDateLabel({ state: 'userRestricted' }, format)).toBe('La otra persona oculta su hora de lectura.');
    expect(readDateLabel({ state: 'myRestricted' }, format)).toBe('Tu ajuste de privacidad impide consultar esta hora de lectura.');
  });

  it('las cuatro negativas que comparten Android y Windows son las mismas', () => {
    const java = [...receipts.matchAll(/static final String \w+ = "([^"]+)";/g)].map(match => match[1]);
    const desktop = [...projection.matchAll(/internal const string \w+ = "([^"]+)";/g)].map(match => match[1]);
    for (const phrase of [
      'Solo puedes consultar la lectura de tus propios mensajes.',
      'La hora de lectura solo se consulta en chats privados.',
      'Los lectores solo se consultan en grupos.',
      'Usuario de Telegram',
    ]) {
      expect(java).toContain(phrase);
      expect(desktop).toContain(phrase);
    }
  });

  it('Android consulta las propiedades antes de pedir lectura o lectores', () => {
    expect(bridge).toContain('case "message.readDate":readDate(message(p),a);break;');
    expect(bridge).toContain('case "message.viewers":messageViewers(message(p),a);break;');
    expect(bridge).toContain('new TdApi.GetMessageProperties(message.chatId,message.id)');
    expect(bridge).toContain('if(!properties.canGetReadDate)');
    expect(bridge).toContain('new TdApi.GetMessageReadDate(message.chatId,message.id)');
    expect(bridge).toContain('if(!properties.canGetViewers)');
    expect(bridge).toContain('new TdApi.GetMessageViewers(message.chatId,message.id)');
    expect(bridge).toContain('if(chat==null||!(chat.type instanceof TdApi.ChatTypePrivate)){a.fail(ReadReceipts.NOT_PRIVATE);return;}');
    expect(bridge).toContain('if(chat==null||!(chat.type instanceof TdApi.ChatTypeBasicGroup||chat.type instanceof TdApi.ChatTypeSupergroup)){a.fail(ReadReceipts.NOT_GROUP);return;}');
    expect(policy).toContain('METHODS.addAll(Arrays.asList("message.readDate","message.viewers"))');
    expect(bridge.match(/ReadReceipts\.sameScope\(session\.activeChat,session\.activeTopic,message\.chatId,topic\)/g)).toHaveLength(2);
  });

  it('Android revalida el alcance al responder y conserva los errores nativos de lectura', () => {
    expect(tdSession).toContain('<T extends TdApi.Object> void performRaw(TdApi.Function<T> function, Consumer<T> success, Consumer<TdApi.Error> failure)');
    expect(tdSession).toContain('request("ui:" + (++requestSerial), 25_000, function, success, failure, null);');
    expect(bridge).toContain('session.performRaw(function,value->{');
    expect(bridge).toContain('JSONObject result=ReadReceipts.error(error,viewers);');
    expect(bridge).toContain('if(result!=null)a.ok(result);else a.fail(TdSession.safeError(error));');
    expect(bridge.match(/if\(!receiptScopeReady\(a,chatId,topicId\)\)return;/g)).toHaveLength(3);
    expect(bridge.match(/if\(receiptScopeReady\(a,message\.chatId,topic\)\)/g)).toHaveLength(3);
  });

  it('Android hidrata los nombres ausentes en paralelo y cierra una sola vez', () => {
    expect(bridge).toContain('long[] missing=ReadReceipts.missingViewerIds(value,id->{');
    expect(bridge).toContain('ReadReceipts.hydrateViewerNames(missing');
    expect(bridge).toContain('session.performRaw(new TdApi.GetUser(id)');
    expect(bridge).toContain('if(receiptScopeReady(a,message.chatId,topic))ok.accept(user);');
    expect(bridge).toContain('if(receiptScopeReady(a,message.chatId,topic))bad.accept(error);');
    expect(bridge).toContain('()->finishViewerNames(value,names,a,message.chatId,topic)');
    expect(receipts).toContain('AtomicInteger remaining = new AtomicInteger(ids.length);');
    expect(receipts).toContain('for (long id : ids)');
    expect(receipts).toContain('remaining.decrementAndGet() == 0 && settled.compareAndSet(false, true)');
    expect(receipts).toContain('if (settled.compareAndSet(false, true)) failed.accept(error);');
    expect(bridge.indexOf('new TdApi.GetUser(id)')).toBeLessThan(bridge.indexOf('a.ok(ReadReceipts.viewers(value'));
  });

  it('el puente reserva 120 s para propiedades, consulta e hidratación de CT', () => {
    expect(bridgeSource).toContain("const READ_RECEIPT = new Set(['message.readDate', 'message.viewers']);");
    expect(bridgeSource).toContain('READ_RECEIPT.has(method) ? 120000');
  });

  it('Windows valida los ids, hidrata el grupo básico y conserva el no leído', () => {
    expect(flow.match(/DesktopReadReceipts\.TryMessageId\(Long\(args, "id"\), out var id\)/g)).toHaveLength(2);
    expect(flow).toContain('if (chat.Input is not InputPeerChat basic)');
    expect(flow).toContain('client.Messages_GetFullChat(basic.chat_id)');
    expect(flow).toContain('MergePeers(page.users?.Values, page.chats?.Values)');
    expect(flow).toContain('DesktopReadReceipts.ViewersError(rpc)');
    expect(flow.indexOf('Messages_GetFullChat(basic.chat_id)')).toBeLessThan(flow.indexOf('MergePeers(page.users?.Values, page.chats?.Values)'));
    expect(flow.indexOf('MergePeers(page.users?.Values, page.chats?.Values)')).toBeLessThan(flow.indexOf('Messages_GetMessageReadParticipants'));
    expect(flow.indexOf('MergePeers(page.users?.Values, page.chats?.Values)')).toBeLessThan(flow.indexOf('DesktopReadReceipts.Viewers(parts, UserName)'));
  });

  it('Windows no convierte la página de historial en un acuse de lectura', () => {
    expect(service).toContain('entry.ReadOutbox = DesktopReadOutbox.AfterHistoryPage(entry.ReadOutbox, messages);');
    expect(service).not.toContain('_entryReadOutbox');
    expect(service).toContain('dto.Status = DesktopReadOutbox.Status(entry.ReadOutbox, message.ID, dto.Outgoing, scheduled);');
    expect(service).toContain('entry.ReadOutbox = DesktopReadOutbox.ApplyUpdate(entry.ReadOutbox, maxId);');
    expect(readOutbox).toContain('AfterHistoryPage(int confirmedReadOutboxMaxId');
    expect(readOutbox).toContain('internal static int ApplyUpdate');
    expect(readOutbox).toContain('internal static string Status');
  });

  it('Windows usa la fecha privada, conserva los lectores del grupo y no inventa estados', () => {
    expect(service).toContain('"message.readDate" => await ReadDateAsync(args),');
    expect(service).toContain('"message.viewers" => await MessageViewersAsync(args),');
    expect(flow).toContain('chat.Peer is not PeerUser');
    expect(flow).toContain('chat.Peer is PeerChannel');
    expect(flow).toContain('chat.Peer is not PeerChat');
    expect(flow).toContain('client.Messages_GetOutboxReadDate(chat.Input, id)');
    expect(flow).toContain('Messages_GetMessageReadParticipants');
    expect(flow).toContain('DesktopReadReceipts.Error(rpc)');
    expect(flow).toContain('throw;');
    expect(flow).toContain('message == null || !message.Outgoing');
    expect(projection).toContain('Date(OutboxReadDate value)');
    expect(projection).toContain('"MESSAGE_NOT_READ_YET" => new { state = "unread" }');
    expect(projection).toContain('"MESSAGE_TOO_OLD" => new { state = "tooOld" }');
    expect(projection).toContain('"USER_PRIVACY_RESTRICTED" => new { state = "userRestricted" }');
    expect(projection).toContain('"YOUR_PRIVACY_RESTRICTED" => new { state = "myRestricted" }');
    expect(projection).toContain('UnknownUser');
    expect(flow).toContain('DesktopReadReceipts.Viewers(parts, UserName)');
  });

  it('los dos menús ofrecen la consulta solo para mensajes propios del chat adecuado', () => {
    expect(app.match(/label="Hora de lectura"/g)).toHaveLength(2);
    expect(app.match(/label="Lectores"/g)).toHaveLength(2);
    expect(app.match(/message\.outgoing&&active\?\.type==='private'/g)).toHaveLength(2);
    expect(app).toContain("import { canShowMessageReaders, completeInboxTabsSave } from './inboxUiPolicy';");
    expect(app.match(/canShowMessageReaders\(message\.outgoing,active,desktop\)/g)).toHaveLength(1);
    expect(app.match(/canShowMessageReaders\(message\.outgoing,active,false\)/g)).toHaveLength(1);
    expect(app).not.toContain("message.outgoing&&active?.type==='group'");
    expect(app).toContain("run<ReadDateResult>('message.readDate'");
    expect(app).toContain("run<MessageViewersResult>('message.viewers'");
    expect(app).toContain('Nadie ha abierto el mensaje todavía.');
    expect(app).toContain('readDateLabel(result,readReceiptTime)');
    expect(app).toContain('createReadReceiptFlow<ReadDateResult|MessageViewersResult,Dialog>');
    expect(app).toContain('current:()=>dialogRef.current');
    expect(app).toContain("if(!props||snapshot().selfId!==owner||snapshot().active!==message.chatId||(snapshot().topic?.id||0)!==topic)return;");
  });

  it('la lista de lectores se puede enfocar y el resultado se anuncia sin desbordar', () => {
    expect(app).toContain('className="read-receipt-list" tabIndex={0} role="list" aria-label="Lectores del mensaje"');
    expect(app).toContain('className="read-receipt-row" role="listitem"');
    expect(app).toContain('role="status" aria-live="polite"');
    expect(styles).toContain('.read-receipt-row{display:flex;flex-wrap:wrap;');
    expect(styles).toContain('.read-receipt-row>time{flex:0 1 auto;max-width:100%;');
    expect(styles).toContain('white-space:normal;overflow-wrap:anywhere');
  });

  it('la sonda CT ejecuta los flujos reales y puede detener la compuerta de escritorio', () => {
    expect(probeProject).toContain('Compile Include="..\\..\\apps\\desktop\\src\\WRGram.Desktop\\DesktopReadReceipts.cs"');
    expect(probeProject).toContain('Compile Include="..\\..\\apps\\desktop\\src\\WRGram.Desktop\\DesktopReadReceiptsFlow.cs"');
    expect(probeProject).toContain('Compile Include="..\\..\\apps\\desktop\\src\\WRGram.Desktop\\DesktopReadOutbox.cs"');
    expect(probe).toContain('await ReadOutboxCases.RunAsync();');
    expect(probe).toContain('await ReadReceiptFlowCases.RunAsync();');
    expect(probe).toContain('Console.WriteLine($"casos = {casos}, fallos = {fallos}");');
    expect(probe).toContain('return fallos == 0 ? 0 : 1;');
    expect(launcher).toContain("$probe = Join-Path $root '.tools\\ctprobe\\CtProbe.csproj'");
    expect(launcher).toContain('& $dotnet run --project $probe -c $Configuration');
    expect(launcher).toContain("if ($LASTEXITCODE -ne 0) { throw 'La sonda CT de escritorio falló.' }");
  });

  it('el andamio y el aviso de escritorio conocen las dos claves', () => {
    expect(preview).toContain("method === 'message.readDate'");
    expect(preview).toContain("method === 'message.viewers'");
    expect(scope).toContain("'message.readDate', 'message.viewers'");
  });
});
