import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
const nativeBridge = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const forwardRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageForward.cs');
const scheduleRules = text('../../desktop/src/WRGram.Desktop/DesktopSchedule.cs');
const deleteRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageDelete.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');

/** El literal que una capa asigna a una constante en C# (`const string`). */
function sentence(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una propiedad dentro de un objeto de TypeScript (`target: '...'`). */
function property(source: string, name: string): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(source);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** El texto de un objeto de negaciones, para no confundir dos claves homónimas (`range` la usan dos). */
function refusals(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el objeto ${name}`);
  return preview.slice(start, preview.indexOf('};', start));
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

function forward(): string {
  const body = csBody('ForwardAsync');
  expect(body).toContain('if (_client == null)');
  return body;
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
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

describe('ronda AD · una sola petición para todas las formas de chat', () => {
  it('el dispatch tiene las dos ramas y la de lote lee el array', () => {
    expect(service).toContain('"message.forward" => await ForwardAsync(args, batch: false)');
    expect(service).toContain('"messages.forward" => await ForwardAsync(args, batch: true)');
    expect(forward()).toContain('batch ? Arr(args, "ids") : new[] { Str(args, "id") }');
  });

  it('es messages.forwardMessages, con origen y destino como InputPeer en la misma petición', () => {
    // A la diferencia del borrado (ronda AC), aquí no se elige el camino por la forma de la clave: `from_peer`
    // y `to_peer` viajan juntos, así que privado, básico, supergrupo y canal van por la misma llamada.
    expect(forward()).toContain('Messages_ForwardMessages(source.Input, ids, random, target.Input,');
    expect(forward()).not.toContain('Channels_ForwardMessages');
    expect(forward()).not.toContain('PeerChat');
  });

  it('y no se usó el atajo de la librería porque no sabe decir «silent»', () => {
    // `Client.ForwardMessagesAsync` es más cómodo, pero su firma no expone `silent`: reenviar en silencio
    // habría dejado de ser silencioso sin decirlo en ninguna parte.
    expect(service).not.toContain('ForwardMessagesAsync');
    expect(forward()).toContain('schedule_date: DesktopSchedule.Date(epoch), silent: silent,');
    expect(forward()).toContain('drop_author: copy, drop_media_captions: captions);');
  });

  it('los random_id acompañan a los ids, uno por mensaje', () => {
    expect(forward()).toContain('ids.Select(_ => Random.Shared.NextInt64(1, long.MaxValue)).ToArray()');
    expect(forward()).toContain('Messages_ForwardMessages(source.Input, ids, random, target.Input');
  });

  it('el par de banderas de la copia es el mismo que aplica TDLib', () => {
    const drop = csBody('DropCaptions', forwardRules);
    expect(drop).toContain('copy && removeCaption');
    expect(java).toContain('forward.removeCaption = removeCaption && sendCopy;');
    expect(forward()).toContain('DesktopMessageForward.DropCaptions(copy, Bool(args, "removeCaption"))');
  });

  it('el tema de foro no se usa en ninguna capa, y está dicho en voz alta', () => {
    // `top_msg_id` existe en MTProto y `topicId` en `TdApi.ForwardMessages`, pero la pantalla no manda el tema
    // en este flujo en ninguna de las dos capas.
    expect(forward()).not.toContain('top_msg_id');
    expect(forwardRules).toContain('top_msg_id');
    expect(nativeBridge).not.toContain('forward.topicId');
  });
});

describe('ronda AD · lo que la petición no puede decir se niega, no se disimula', () => {
  it('«cuando se conecte» no tiene campo en MTProto, en el envío y en el reenvío', () => {
    expect(scheduleRules).toContain('public const string WhenOnline =');
    expect(forward()).toContain('if (DesktopSchedule.IsOnline(when)) throw new BridgeException(DesktopSchedule.WhenOnline);');
    expect(csBody('SendAsync')).toContain('if (DesktopSchedule.IsOnline(when)) throw new BridgeException(DesktopSchedule.WhenOnline);');
    // El defecto que había: `Long` leía «online» como 0 y el mensaje salía en el momento.
    expect(csBody('SendAsync')).not.toContain('var schedule = Long(args,');
    expect(nativeBridge).toContain('if(raw.equals("online"))options.schedulingState=new TdApi.MessageSchedulingStateSendWhenOnline();');
  });

  it('la ventana de la hora son la misma frase y los mismos topes que en Android', () => {
    expect(sentence(scheduleRules, 'Range')).toBe('Elige una hora entre ahora y los próximos 367 días.');
    expect(nativeBridge).toContain(`"${sentence(scheduleRules, 'Range')}"`);
    expect(nativeBridge).toContain('if(schedule<now+5||schedule>now+367L*86400L)');
    const problem = csBody('Problem', scheduleRules);
    expect(problem).toContain('epoch < now + 5 || epoch > now + 367L * 86400L');
    expect(forward()).toContain('DesktopSchedule.Problem(epoch, DateTimeOffset.UtcNow.ToUnixTimeSeconds())');
    expect(csBody('Date', scheduleRules)).toContain('DateTimeOffset.FromUnixTimeSeconds(epoch).UtcDateTime');
  });

  it('el lote fuera de 1..100 y el id que no cabe no se envían a medias', () => {
    // Las cuatro reglas del borrado son literalmente las mismas, así que aquí no hay una segunda copia.
    expect(forwardRules).toContain('public const int MaxBatch = DesktopMessageDelete.MaxBatch;');
    expect(forwardRules).toContain('public const string BatchSize = DesktopMessageDelete.BatchSize;');
    expect(forwardRules).toContain('public const string OutOfRange = DesktopMessageDelete.OutOfRange;');
    expect(forwardRules).toContain('public const string NotLoaded = DesktopMessageDelete.NotLoaded;');
    expect(forward()).toContain('if (requested.Length == 0 || requested.Length > DesktopMessageForward.MaxBatch) throw new BridgeException(DesktopMessageForward.BatchSize);');
    expect(forward()).toContain('DesktopMessageDelete.Ids(requested) ?? throw new BridgeException(DesktopMessageForward.OutOfRange)');
    expect(csBody('Ids', deleteRules)).toContain('int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id)');
    expect(nativeBridge).toContain('long[] ids=BridgePolicy.ids(p,"ids",100);');
  });

  it('la ventana cargada es el único testigo, y el destino no se adivina', () => {
    expect(forward()).toContain('DesktopMessageDelete.Loaded(_state.Messages, source.Id, ids)');
    expect(forward()).toContain('if (rows.Count != ids.Length) throw new BridgeException(DesktopMessageForward.NotLoaded)');
    expect(forward()).toContain('var target = FindEntry(Str(args, "to")) ?? throw new BridgeException(DesktopMessageForward.NoTarget)');
    expect(sentence(forwardRules, 'NoTarget')).toBe('El destino ya no está cargado en esta sesión. Ábrelo e inténtalo de nuevo.');
  });

  it('el contenido protegido se mira antes de escribir, con la frase con la que este host ya negaba guardar', () => {
    expect(forward()).toContain('if (rows.Any(row => !row.CanForward)) throw new BridgeException(DesktopMessageForward.Protected);');
    expect(sentence(forwardRules, 'Protected')).toBe('Telegram protege este contenido.');
    expect(service).toContain('if (!_media.CanExport(id)) throw new BridgeException("Telegram protege este contenido.");');
    expect(nativeBridge).toContain('media.protectedFile(p.getInt("id"))');
  });

  it('la protección la dicen la fila y el chat, no una regla inventada sobre el destino', () => {
    expect(forwardRules).toContain('Message.Flags.noforwards');
    expect(forwardRules).toContain('Chat.Flags.noforwards');
    expect(forwardRules).toContain('Channel.Flags.noforwards');
    expect(csBody('ProtectedChat', service)).toContain('(channel.flags & Channel.Flags.noforwards) != 0');
    expect(csBody('ProtectedChat', service)).toContain('(chat.flags & Chat.Flags.noforwards) != 0');
    // Ninguna regla propia sobre el chat de llegada: la librería solo habla del origen en las tres banderas.
    expect(forwardRules).toContain('ninguna del destino');
    expect(forward()).not.toContain('ProtectedChat(target');
  });

  it('un fallo de red no dice que reenvió: la cuenta queda en incierto y el historial manda', () => {
    expect(forward()).toContain('_state.Uncertain = true;');
    expect(forward()).toContain('No se confirmó el reenvío. Revisa el historial del destino antes de repetirlo.');
    expect(forward()).toContain('_dialogsDirty = true;');
    expect(forward()).toContain('if (target.Id == source.Id) await RefreshHistoryLocked();');
  });
});

describe('ronda AD · el contrato decide qué botón se pinta', () => {
  it('Properties dejó de publicar copy, copyContent y forward en verdadero a secas', () => {
    const body = csBody('Properties');
    expect(body).toContain('var forwardable = message?.CanForward ?? false;');
    expect(body).toContain('copy = forwardable && !string.IsNullOrWhiteSpace(message?.Text)');
    expect(body).toContain('copyContent = forwardable');
    expect(body).toContain('forward = forwardable');
    expect(body).not.toContain('forward = true');
    expect(body).not.toContain('copyContent = true');
  });

  it('la bandera la pone Telegram en la fila, y una fila de servicio no la tiene', () => {
    expect(state).toContain('public bool CanForward { get; set; }');
    expect(service).toContain('dto.CanForward = exportable;');
    expect(service).toContain('var exportable = (message.flags & TL.Message.Flags.noforwards) == 0 && !ProtectedChat(entry);');
  });

  it('copiar el texto pasa por la misma bandera que reenviar', () => {
    expect(csBody('CopyMessage')).toContain('if (!message.CanForward) throw new BridgeException(DesktopMessageForward.Protected);');
  });

  it('Android decide con canBeForwarded y con el lote entero', () => {
    expect(nativeBridge).toContain('"forward",props.canBeForwarded');
    expect(nativeBridge).toContain('if(sendCopy?!props.canBeCopied:!props.canBeForwarded)throw new IllegalArgumentException();');
  });
});

describe('ronda AD · la interfaz comparte las palabras con las dos capas', () => {
  it('la vista de diseño lleva copiadas las cuatro negaciones del reenvío de Windows', () => {
    const mirrored = refusals('FORWARD_REFUSALS');
    expect(property(mirrored, 'target')).toBe(sentence(forwardRules, 'NoTarget'));
    expect(property(mirrored, 'content')).toBe(sentence(forwardRules, 'Protected'));
    expect(property(mirrored, 'online')).toBe(sentence(scheduleRules, 'WhenOnline'));
    expect(property(mirrored, 'range')).toBe(sentence(scheduleRules, 'Range'));
    expect(property(preview, 'loaded')).toBe(sentence(deleteRules, 'NotLoaded'));
    expect(property(preview, 'batch')).toBe(sentence(deleteRules, 'BatchSize'));
  });

  it('y modela el reenvío con el mismo orden de negaciones que el host', () => {
    expect(preview).toContain("if (method === 'message.forward' && state.platform === 'desktop') return desktopForward([String(params.id)], params, state);");
    expect(preview).toContain("if (method === 'messages.forward' && state.platform === 'desktop') return desktopForward(Array.isArray(params.ids) ? params.ids : [], params, state);");
    const body = tsBody('desktopForward');
    expect(body).toContain('if (rows.length !== wanted.size) throw new Error(DELETE_REFUSALS.loaded)');
    expect(body).toContain('if (rows.some(message => !forwardable(message))) throw new Error(FORWARD_REFUSALS.content)');
    expect(body).toContain('if (!target || !target.supported) throw new Error(FORWARD_REFUSALS.target)');
    expect(body).toContain("if (when === 'online') throw new Error(FORWARD_REFUSALS.online)");
    expect(body).toContain('if (epoch && (epoch < now + 5 || epoch > now + 367 * 86400)) throw new Error(FORWARD_REFUSALS.range)');
    expect(body).toContain('forward: copy || message.outgoing ? undefined : {');
    expect(body).toContain('chatId: target.id');
  });

  it('la propiedad espejada de la fila decide el menú también en el andamio', () => {
    expect(preview).toContain('const can = forwardable(message)');
    expect(preview).toContain('forward: can,');
    const mirrored = tsBody('forwardable');
    expect(mirrored).toContain('if (!message || message.service) return false;');
    expect(mirrored).toContain('return !PROTECTED_CHATS.has(message.chatId)');
    expect(preview).toContain("const PROTECTED_CHATS = new Set(['22']);");
  });

  it('el reenvío es un único trozo de menú para las dos plataformas', () => {
    expect(app.match(/forwardItem\(message,props\)/g)?.length).toBe(2);
    expect(app.match(/label="Reenviar a…"/g)?.length).toBe(1);
    expect(tsBody('messageMenu', app)).toContain('{props&&forwardItem(message,props)}');
    const item = tsBody('forwardItem', app);
    expect(item).toContain('return props.forward&&');
    expect(item).toContain('copyable={props.copyContent}');
  });

  it('copiar se pinta con la misma bandera en las dos ramas del menú', () => {
    // La rama de escritorio escribía el botón sin mirar el contrato, así que en un canal protegido ofrecía un
    // «Copiar texto» que el puente rechazaba en cuanto se pulsaba.
    expect(app.match(/\{props\.copy&&<MenuItem icon=\{<Copy\/>\} label="Copiar texto"/g)?.length).toBe(2);
    expect((app.match(/\n +<MenuItem icon=\{<Copy\/>\} label="Copiar texto"/g) || []).length).toBe(0);
  });

  it('el lote filtra por la bandera y avisa cuando ninguna fila la tiene', () => {
    expect(app).toContain('.filter(entry=>entry.properties?.forward);');
    expect(app).toContain("if(!props?.forward){setToast('Telegram no permite reenviar este mensaje.');return;}");
    expect(app).toContain("setToast('Telegram no permite reenviar los mensajes seleccionados.');");
    expect(app).toContain('mensaje(s) reenviados.');
  });

  it('el «cuando se conecte» no se pinta donde la petición no lo expresa', () => {
    expect(app.match(/whenOnline=\{!desktop\}/g)?.length).toBe(3);
    expect(app).toContain('whenOnline={active?.type===\'private\'&&!desktop}');
    expect(app).toContain('whenOnline={target.type===\'private\'&&whenOnline}');
    expect(app).toContain('function ForwardDialog({chats,ids,single,copyable,whenOnline,run,close,done}');
    expect(app).toContain("{chat.id===state.active&&!desktop&&chat.type!=='secret'&&<MenuItem icon={<Clock/>}");
  });

  it('la pantalla de programados existe en las dos capas desde la ronda AJ', () => {
    expect(app).toContain('label="Mensajes programados"');
    expect(service).toContain('"scheduled.list" => await ScheduledListAsync(args),');
    // Lo que esta ronda permitía programar desde Windows ya se puede administrar: la bandeja tiene sus cuatro
    // brazos desde la ronda AJ, así que la pantalla ofrece la entrada en las dos capas.
    expect(nativeBridge).toContain('case "scheduled.list"');
  });
});
