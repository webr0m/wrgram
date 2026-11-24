import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const scheduled = text('../../desktop/src/WRGram.Desktop/DesktopScheduled.cs');
const schedule = text('../../desktop/src/WRGram.Desktop/DesktopSchedule.cs');
const deletes = text('../../desktop/src/WRGram.Desktop/DesktopMessageDelete.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const outbox = text('../../desktop/src/WRGram.Desktop/DesktopReadOutbox.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

/** El literal que una capa asigna a una constante de C#. */
function csSentence(name: string, from = scheduled): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El literal de una cadena de Java. */
function javaSentence(needle: string): string {
  const match = new RegExp(`"((?:[^"\\\\]|\\\\.)*${needle}(?:[^"\\\\]|\\\\.)*)"`).exec(java);
  if (!match) throw new Error(`Falta la frase ${needle} en el puente`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La prosa que precede a un método del host, fuera del cuerpo. */
function csDoc(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  return from.slice(from.lastIndexOf('/// <summary>', start), start);
}

/** Cuerpo de una función del espejo, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** La posición de una aguja, con la garantía de que la aguja está. */
function at(needle: string, source: string): number {
  const index = source.indexOf(needle);
  if (index < 0) throw new Error(`Falta ${needle}`);
  return index;
}

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** El bloque de las cinco frases del espejo, para no confundirlas con las homónimas de otros bloques. */
const scheduledRefusals = /const SCHEDULED_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';
const folderRefusals = /const FOLDER_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';
const forwardRefusals = /const FORWARD_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';
const deleteRefusals = /const DELETE_REFUSALS = \{([\s\S]*?)\};/.exec(preview)?.[1] ?? '';

const GENERIC = 'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.';

describe('ronda AJ · la bandeja de programados tiene puente en Windows', () => {
  it('las cuatro órdenes entran por su brazo, antes del genérico', () => {
    for (const arm of [
      '"scheduled.list" => await ScheduledListAsync(args),',
      '"scheduled.sendNow" => await ScheduledSendAsync(args),',
      '"scheduled.reschedule" => await ScheduledRescheduleAsync(args),',
      '"scheduled.delete" => await ScheduledDeleteAsync(args),',
    ]) {
      expect(count(arm, service)).toBe(1);
      expect(service.indexOf(arm)).toBeLessThan(service.indexOf('_ => throw new BridgeException($"No disponible en escritorio (beta)'));
    }
  });

  it('son métodos que el puente ya conocía, así que no nacen huérfanos', () => {
    for (const method of ['scheduled.list', 'scheduled.reschedule', 'scheduled.sendNow', 'scheduled.delete']) {
      expect(policy).toContain(`"${method}"`);
      expect(java).toContain(`case "${method}":`);
    }
  });

  it('cada petición es la que la librería publicó para esta bandeja', () => {
    expect(csBody('ScheduledListAsync')).toContain('Messages_GetScheduledMessages(entry.Input, [])');
    expect(csBody('ScheduledSendAsync')).toContain('Messages_SendScheduledMessages(entry.Input, new[] { id })');
    expect(csBody('ScheduledDeleteAsync')).toContain('Messages_DeleteScheduledMessages(entry.Input, new[] { id })');
    // Reponer la hora no es un parcheo: vuelve a mandar la fila entera con su `schedule_date`.
    expect(csBody('ScheduledRescheduleAsync')).toContain('Messages_EditMessage(entry.Input, id, message: fresh.message, media: media,');
    expect(csBody('ScheduledRescheduleAsync')).toContain('schedule_date: DesktopSchedule.Date(epoch)');
  });

  it('la bandeja se lee con la prueba de tipo que cubre las dos formas de la respuesta', () => {
    expect(count('as Messages_Messages', service)).toBeGreaterThanOrEqual(2);
    expect(csBody('ScheduledListAsync')).toContain('(found as Messages_Messages)?.messages ?? []');
    expect(csBody('ScheduledRowAsync')).toContain('DesktopScheduled.Find((found as Messages_Messages)?.messages, id)');
  });

  it('las tres escrituras vuelven a leer la fila antes de tocar nada', () => {
    for (const [name, request] of [['ScheduledSendAsync', 'Messages_SendScheduledMessages'], ['ScheduledRescheduleAsync', 'Messages_EditMessage'], ['ScheduledDeleteAsync', 'Messages_DeleteScheduledMessages']] as const) {
      const body = csBody(name);
      expect(at('ScheduledRowAsync', body)).toBeLessThan(at(request, body));
    }
  });

  it('ninguna orden actúa sobre una conversación que ya no está abierta', () => {
    const target = csBody('ScheduledTarget');
    expect(target).toContain('RequireEntry(Str(args, "id"))');
    expect(target).toContain('if (entry.Id != _active) throw new BridgeException(DesktopScheduled.ChangedChat);');
    // Las cuatro la llaman, y todas por delante de cualquier petición.
    for (const name of ['ScheduledListAsync', 'ScheduledSendAsync', 'ScheduledRescheduleAsync', 'ScheduledDeleteAsync']) {
      expect(csBody(name)).toContain('ScheduledTarget(args)');
    }
  });

  it('la recurrente no se reprograma ni se vacía, pero sí se borra', () => {
    expect(scheduled).toContain('public static bool IsRecurring(Message message) =>');
    expect(scheduled).toContain('(message.flags2 & Message.Flags2.has_schedule_repeat_period) != 0 && message.schedule_repeat_period > 0');
    expect(count('DesktopScheduled.IsRecurring(fresh)', service)).toBe(2);
    expect(csBody('ScheduledDeleteAsync')).not.toContain('IsRecurring');
    // Y el periodo viaja hasta la interfaz para que la pantalla le quite los dos botones.
    expect(state).toContain('public bool ScheduledRepeat { get; set; }');
    expect(state).toContain('public int? RepeatPeriod { get; set; }');
    expect(csBody('ConvertMessage')).toContain('ScheduledRepeat = scheduled && DesktopScheduled.IsRecurring(message),');
    expect(csBody('ConvertMessage')).toContain('RepeatPeriod = scheduled ? DesktopScheduled.RepeatPeriod(message) : null');
  });

  it('reprogramar sin saber volver a mandar el contenido se niega con nombre', () => {
    expect(scheduled).toContain('public static bool KeepsContent(Message message) => message.media is null or MessageMediaPhoto or MessageMediaDocument');
    expect(csBody('ScheduledRescheduleAsync')).toContain('if (!DesktopScheduled.KeepsContent(fresh)) throw new BridgeException(DesktopScheduled.Unsupported);');
    // La frase dice lo que hay que hacer, que es lo que faltaba en las negaciones secas.
    expect(csSentence('Unsupported')).toContain('Hazlo desde otro dispositivo.');
    expect(csDoc('ScheduledRescheduleAsync')).toContain('reemplaza en vez de parchear');
  });

  it('la hora se corta antes de leer la bandeja, con las dos reglas de la ronda AD', () => {
    const body = csBody('ScheduledRescheduleAsync');
    expect(body).toContain('if (Bool(args, "online")) throw new BridgeException(DesktopSchedule.WhenOnline);');
    expect(at('WhenOnline', body)).toBeLessThan(at('ScheduledRowAsync', body));
    expect(at('DesktopSchedule.Range', body)).toBeLessThan(at('ScheduledRowAsync', body));
    // El cero también cae: en Android `at < segundos + 5` lo rechaza, y aquí se dice igual.
    expect(body).toContain('if (problem != null || epoch == 0) throw new BridgeException(DesktopSchedule.Range);');
  });

  it('las tres frases que vienen de Android son las de Android, letra por letra', () => {
    expect(csSentence('ChangedChat')).toBe(javaSentence('La conversación cambió'));
    expect(csSentence('Recurring')).toBe(javaSentence('mensajes recurrentes en Telegram'));
    expect(csSentence('NotScheduled')).toBe(javaSentence('ya no está programado'));
    // Y el id que no cabe se corta con la misma frase con la que ya se cortaba en el borrado.
    expect(tsProperty('range', deleteRefusals)).toBe(csSentence('OutOfRange', deletes));
  });
});

describe('ronda AJ · una fila programada no es una fila del historial', () => {
  it('la conversión se pide con la bandera en las dos cargas', () => {
    expect(service).toContain('private MessageDto? ConvertMessage(MessageBase source, ChatEntry entry, bool scheduled = false)');
    expect(count('ConvertMessage(message, entry, scheduled: true)', service)).toBe(1);
    expect(csBody('ConvertMessage')).toContain('ScheduledAt = scheduled ? Unix(message.Date) : null,');
    // El tick de «leído» se mide con ids del historial: una fila que aún no salió no puede estar leída.
    expect(csBody('ConvertMessage')).toContain('dto.Status = DesktopReadOutbox.Status(entry.ReadOutbox, message.ID, dto.Outgoing, scheduled);');
    expect(outbox).toContain('scheduled ? "" : outgoing ? confirmedReadOutboxMaxId >= messageId ? "read" : "sent" : ""');
  });

  it('la bandeja no ensucia el ancla de fijados ni la caché de textos', () => {
    // Los ids programados son de otro namespace: anotarlos los dos sitios es pintarlos encima de otro mensaje.
    expect(csBody('ConvertMessage')).toContain('if (!scheduled && (message.flags & TL.Message.Flags.pinned) != 0) _pins[entry.Id] = message.ID;');
    expect(csBody('ConvertMessage')).toContain('if (!scheduled)');
    expect(csDoc('ConvertMessage')).toContain('namespace');
  });

  it('la pantalla de Windows por fin tiene a dónde ir', () => {
    const desktop = app.slice(app.indexOf('function chatMenu'), app.indexOf('const action=(method:string,value:boolean)'));
    expect(desktop).toContain(`{chat.id===state.active&&chat.type!=='secret'&&<MenuItem icon={<Clock/>} label="Mensajes programados" onClick={()=>openScheduled(chat)}/>`);
    // La rama de Android sigue ofreciéndola con su guarda de siempre, así que las dos capas llegan al puente.
    expect(app).toContain(`!desktop&&chat.type!=='secret'&&<MenuItem icon={<Clock/>} label="Mensajes programados"`);
    // Y el espejo contesta a las cuatro solo en la capa que las implementa aquí.
    for (const [method, tail] of [['scheduled.list', 'return desktopScheduledList(params, state);'], ['scheduled.sendNow', "return desktopScheduledWrite(params, state, 'now');"], ['scheduled.reschedule', "return desktopScheduledWrite(params, state, 'at');"], ['scheduled.delete', "return desktopScheduledWrite(params, state, 'drop');"]] as const) {
      expect(count(`if (method === '${method}' && state.platform === 'desktop') ${tail}`, preview)).toBe(1);
    }
  });

  it('en Windows la banda de «cuando se conecte» no se ofrece', () => {
    expect(count('whenOnline={!desktop&&chat.type===\'private\'}', app)).toBe(1);
    expect(app).toContain('function openSchedule(){if(!draft.trim()');
    // Y el desplegable de la repetición tampoco se ofrece en la mesa: el host no tiene
    // <c>schedule_repeat_period</c> en su <c>send.text</c>, así que un recurrente solo se puede borrar, que es
    // justo lo que la bandeja admite. Prometer el desplegable sería crear filas que luego no se sabe reprogramar.
    expect(app).toContain('allowRepeat={!desktop&&state.wallet?.premium===true}');
    expect(csBody('SendAsync')).not.toContain('schedule_repeat_period');
  });

  it('la nota del diálogo no explica una opción que la mesa no ofrece', () => {
    // Medido con el ratón: en Windows el cartel decía dónde funcionaba «Cuando se conecte» sobre un botón que
    // no estaba en la pantalla. La frase cuelga ahora de la misma bandera que el botón.
    expect(app).toContain(`{whenOnline&&' «Cuando se conecte» solo funciona con chats privados.'}`);
    expect(app).toContain(`{whenOnline&&!repeat&&<button type="button" className="menu-item" onClick={()=>send('online')}`);
  });
});

describe('ronda AJ · el espejo reproduce el orden del puente', () => {
  it('las cinco frases están copiadas, incluidas las dos inalcanzables', () => {
    expect(scheduledRefusals).not.toBe('');
    expect(tsProperty('changed', scheduledRefusals)).toBe(csSentence('ChangedChat'));
    expect(tsProperty('gone', scheduledRefusals)).toBe(csSentence('NotScheduled'));
    expect(tsProperty('recurring', scheduledRefusals)).toBe(csSentence('Recurring'));
    expect(tsProperty('unsupported', scheduledRefusals)).toBe(csSentence('Unsupported'));
    expect(tsProperty('prepare', scheduledRefusals)).toBe(csSentence('Prepare'));
  });

  it('la mira de la conversación es la misma guarda que escribió la ronda AI', () => {
    const target = tsBody('desktopScheduledTarget');
    expect(target).toContain('throw new Error(FOLDER_REFUSALS.loaded)');
    expect(target).toContain('throw new Error(SCHEDULED_REFUSALS.changed)');
    expect(tsProperty('loaded', folderRefusals))
      .toBe(/"((?:[^"\\]|\\.)*)"/.exec(service.split('\n').find(line => line.includes('RequireEntry(string id)')) ?? '')?.[1]);
  });

  it('las cuatro negaciones del espejo salen en el orden del host', () => {
    const write = tsBody('desktopScheduledWrite');
    expect(at('FORWARD_REFUSALS.online', write)).toBeLessThan(at('SCHEDULED_REFUSALS.gone', write));
    expect(at('FORWARD_REFUSALS.range', write)).toBeLessThan(at('SCHEDULED_REFUSALS.gone', write));
    expect(at('SCHEDULED_REFUSALS.gone', write)).toBeLessThan(at('SCHEDULED_REFUSALS.recurring', write));
    expect(at('scheduledTray[index].scheduledRepeat', write)).toBeLessThan(at('SCHEDULED_REFUSALS.unsupported', write));
    // El borrado no pregunta si es recurrente, igual que el puente.
    expect(write).toContain("if (kind !== 'drop' && scheduledTray[index].scheduledRepeat)");
  });

  it('la ventana de la hora es la del puente, con los topes de siempre', () => {
    expect(tsBody('desktopScheduledWrite')).toContain('epoch === 0 || epoch < now + 5 || epoch > now + 367 * 86400');
    expect(tsProperty('range', forwardRefusals)).toBe(csSentence('Range', schedule));
    expect(tsProperty('online', forwardRefusals)).toBe(csSentence('WhenOnline', schedule));
    expect(tsProperty('range', deleteRefusals)).toBe(csSentence('OutOfRange', deletes));
  });

  it('enviar ya escribe en el historial con un id del chat, no con el de la bandeja', () => {
    const write = tsBody('desktopScheduledWrite');
    expect(write).toContain('scheduledSent.push(sent)');
    expect(write).toContain('Math.max(0, ...poolOf(row.chatId).map(message => Number(message.id) || 0)) + 1');
    expect(preview).toContain('...scheduledSent.filter(item=>item.chatId===id)');
    expect(write).toContain('scheduledAt: undefined');
  });

  it('el muestrario tiene las tres filas que el puente decide de tres maneras', () => {
    expect(count('const scheduledTray: Message[] = [', preview)).toBe(1);
    expect(preview).toContain("id: '9001'");
    expect(preview).toContain('scheduledRepeat: true, repeatPeriod: 604800');
    expect(preview).toContain('checklist: { title:');
    expect(preview).toContain('chatId: BOOT_CHAT');
  });
});

type Row = { id: string; text: string; chatId: string; scheduledAt?: number; scheduledRepeat?: boolean; repeatPeriod?: number; checklist?: unknown };
type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Snap = { active: string; chats: { id: string }[]; messages: Row[] };

describe('ronda AJ · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let snap: () => Snap = () => ({ active: '', chats: [], messages: [] });

  const tray = async () => (await call('scheduled.list', { id: '11' })) as Row[];
  const inTray = async (id: string) => (await tray()).some(row => row.id === id);

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  it('la bandeja del chat abierto son tres filas, cada una con su hora', async () => {
    const rows = await tray();
    expect(rows.map(row => row.id)).toEqual(['9001', '9002', '9003']);
    expect(rows.every(row => row.chatId === '11')).toBe(true);
    expect(rows.every(row => typeof row.scheduledAt === 'number')).toBe(true);
  });

  it('una fila recurrente lleva el periodo que la pantalla traduce', async () => {
    const recurring = (await tray()).find(row => row.id === '9002')!;
    expect(recurring.scheduledRepeat).toBe(true);
    expect(recurring.repeatPeriod).toBe(604800);
  });

  it('preguntar por otra conversación se niega sin leer la bandeja', async () => {
    await expect(call('scheduled.list', { id: '13' })).rejects.toThrow(tsProperty('changed', scheduledRefusals));
    await expect(call('scheduled.list', { id: '999' })).rejects.toThrow(tsProperty('loaded', folderRefusals));
    expect((await tray()).length).toBe(3);
  });

  it('enviar ya saca la fila de la bandeja y la deja en el historial', async () => {
    const row = (await tray()).find(item => item.id === '9001')!;
    expect(await call('scheduled.sendNow', { id: '11', messageId: '9001' })).toBe(true);
    expect(await inTray('9001')).toBe(false);
    expect((await tray()).length).toBe(2);
    const sent = snap().messages.filter(item => item.text === row.text);
    expect(sent.length).toBe(1);
    // Otro namespace: la fila del historial no conserva el id de la bandeja, ni su hora de salida.
    expect(sent[0].id).not.toBe('9001');
    expect(sent[0].scheduledAt).toBeUndefined();
  });

  it('el mensaje enviado ya se queda en el historial al volver a abrir el chat', async () => {
    await call('scheduled.sendNow', { id: '11', messageId: '9001' });
    await call('chat.open', { id: '14' });
    await call('chat.open', { id: '11' });
    expect(snap().messages.some(item => item.text === 'Recordad la revisión de la barra a las diez.')).toBe(true);
  });

  it('reprogramar escribe la hora nueva y deja la fila en su sitio', async () => {
    const at = Math.floor(Date.now() / 1000) + 7200;
    expect(await call('scheduled.reschedule', { id: '11', messageId: '9001', at })).toBe(true);
    const row = (await tray()).find(item => item.id === '9001')!;
    expect(row.scheduledAt).toBe(at);
    expect(row.scheduledRepeat).toBeUndefined();
  });

  it('borrar tira la fila sin enviarla y sin tocar el historial', async () => {
    const before = snap().messages.length;
    expect(await call('scheduled.delete', { id: '11', messageId: '9003' })).toBe(true);
    expect(await inTray('9003')).toBe(false);
    expect(snap().messages.length).toBe(before);
  });

  it('el recurrente no se envía ni se reprograma, pero sí se borra', async () => {
    const phrase = tsProperty('recurring', scheduledRefusals);
    await expect(call('scheduled.sendNow', { id: '11', messageId: '9002' })).rejects.toThrow(phrase);
    await expect(call('scheduled.reschedule', { id: '11', messageId: '9002', at: Math.floor(Date.now() / 1000) + 600 })).rejects.toThrow(phrase);
    expect(await inTray('9002')).toBe(true);
    expect(await call('scheduled.delete', { id: '11', messageId: '9002' })).toBe(true);
    expect(await inTray('9002')).toBe(false);
  });

  it('la lista de tareas no se reprograma porque no se sabe volver a mandar', async () => {
    await expect(call('scheduled.reschedule', { id: '11', messageId: '9003', at: Math.floor(Date.now() / 1000) + 600 }))
      .rejects.toThrow(tsProperty('unsupported', scheduledRefusals));
    expect(await inTray('9003')).toBe(true);
    // Enviar ya y borrar no reescriben la fila, así que esas dos sí pasan.
    expect(await call('scheduled.delete', { id: '11', messageId: '9003' })).toBe(true);
  });

  it('en Windows no hay envío «cuando se conecte», ni para reprogramar', async () => {
    await expect(call('scheduled.reschedule', { id: '11', messageId: '9001', online: true }))
      .rejects.toThrow(tsProperty('online', forwardRefusals));
  });

  it('la hora se corta antes de mirar la bandeja, con las tres salidas malas', async () => {
    const range = tsProperty('range', forwardRefusals);
    const now = Math.floor(Date.now() / 1000);
    for (const at of [0, now + 2, now + 400 * 86400]) {
      await expect(call('scheduled.reschedule', { id: '11', messageId: '9999', at })).rejects.toThrow(range);
    }
  });

  it('una fila que ya no está en la bandeja se dice con la frase de Android', async () => {
    await expect(call('scheduled.sendNow', { id: '11', messageId: '9999' })).rejects.toThrow(tsProperty('gone', scheduledRefusals));
    await expect(call('scheduled.delete', { id: '11', messageId: '9999' })).rejects.toThrow(tsProperty('gone', scheduledRefusals));
  });

  it('un id que no cabe en la petición se corta antes de leer', async () => {
    for (const messageId of ['0', '-3', 'abc', '']) {
      await expect(call('scheduled.sendNow', { id: '11', messageId })).rejects.toThrow(tsProperty('range', deleteRefusals));
      await expect(call('scheduled.delete', { id: '11', messageId })).rejects.toThrow(tsProperty('range', deleteRefusals));
    }
    expect((await tray()).length).toBe(3);
  });

  it('vaciar la bandeja deja la pantalla con su nota de ninguna fila', async () => {
    for (const id of ['9001', '9002', '9003']) await call('scheduled.delete', { id: '11', messageId: id });
    expect(await tray()).toEqual([]);
  });

  it('fuera de Windows las cuatro órdenes caen en la negativa de siempre', async () => {
    const transport = await import('./bridge');
    const { fixture } = await import('./preview');
    transport.acceptState({ ...fixture, platform: 'android' });
    for (const [method, params] of [['scheduled.list', { id: '11' }], ['scheduled.sendNow', { id: '11', messageId: '9001' }],
      ['scheduled.reschedule', { id: '11', messageId: '9001', at: Math.floor(Date.now() / 1000) + 600 }], ['scheduled.delete', { id: '11', messageId: '9001' }]] as const) {
      await expect(call(method, params)).rejects.toThrow(GENERIC);
    }
    // TDLib lo hace en el teléfono con otras tres peticiones; aquí no se le presta el modelo ni se escribe.
    expect(snap().messages.some(item => item.text === 'Recordad la revisión de la barra a las diez.')).toBe(false);
  });
});
