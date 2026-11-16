import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const pinRules = text('../../desktop/src/WRGram.Desktop/DesktopMessagePin.cs');
const deleteRules = text('../../desktop/src/WRGram.Desktop/DesktopMessageDelete.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const dto = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const contract = text('./contract.ts');

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

/** Texto entre dos agujas del mismo archivo, para leer un comentario sin leer todo el fichero. */
function slice(from: string, to: string, source: string): string {
  const start = source.indexOf(from);
  if (start < 0) throw new Error(`Falta el principio: ${from}`);
  const end = source.indexOf(to, start);
  if (end < 0) throw new Error(`Falta el final: ${to}`);
  return source.slice(start, end);
}

/** Cuántas veces aparece un texto exacto. */
function count(needle: string, source: string): number {
  return source.split(needle).length - 1;
}

/** El objeto de negaciones del andamio, para no confundir claves homónimas entre los tres objetos. */
function refusals(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el objeto ${name}`);
  return preview.slice(start, preview.indexOf('};', start));
}

describe('ronda AF · las reglas del fijado viven en un archivo que se puede leer', () => {
  it('la forma del chat decide, y un aviso del sistema no se fija', () => {
    const can = csBody('CanPin', pinRules);
    expect(can).toContain('if (row == null || row.ServiceNotice) return false;');
    expect(can).toContain('DesktopMessageDelete.Kind.Private or DesktopMessageDelete.Kind.Basic => true');
    expect(can).toContain('DesktopMessageDelete.Kind.Channel => ChannelRightsToPin(channel)');
  });

  it('los derechos del canal se leen igual que los de borrado, con los dos nombres de la documentación', () => {
    const rights = csBody('ChannelRightsToPin', pinRules);
    expect(rights).toContain('(channel.flags & Channel.Flags.left) != 0) return false');
    expect(rights).toContain('(channel.flags & Channel.Flags.creator) != 0) return true');
    expect(rights).toContain('(channel.flags & Channel.Flags.min) != 0) return false');
    expect(rights).toContain('(channel.flags & Channel.Flags.has_admin_rights) == 0) return false');
    expect(rights).toContain('ChatAdminRights.Flags.pin_messages');
    expect(rights).toContain('ChatAdminRights.Flags.edit_messages');
    // La reutilización del tipo es lo que evita que el fijado y el borrado se cuenten formas distintas del mismo chat.
    expect(pinRules).toContain('DesktopMessageDelete.Kind');
    expect(deleteRules).toContain('public enum Kind');
  });

  it('la negación dice lo mismo que Android, carácter a carácter', () => {
    expect(sentence(pinRules, 'Refused')).toBe('Telegram no permite esta acción sobre el mensaje.');
    expect(java).toContain(`a.fail("Telegram no permite esta acción sobre el mensaje.")`);
  });

  it('las dos banderas viajan como las dos `true` de TDLib', () => {
    expect(pinRules).toContain('public const bool Silent = true;');
    expect(pinRules).toContain('public const bool OneSide = true;');
    expect(java).toContain('new TdApi.PinChatMessage(message.chatId,message.id,true,true)');
    expect(java).toContain('else if(method.equals("message.pin")&&props.canBePinned)');
  });

  it('el hueco del esquema está escrito donde se lee el código', () => {
    expect(pinRules).toContain('messages.getPinnedMessages');
    expect(pinRules).toContain('chatDefaultBannedRights');
    expect(pinRules).toContain('pinned.list');
    expect(sentence(pinRules, 'NoList')).toBe(property(refusals('PIN_REFUSALS'), 'list'));
  });
});

describe('ronda AF · el puente de Windows contesta a lo que la pantalla pregunta', () => {
  it('las cuatro ramas existen, y la que no se puede servir se niega con su razón', () => {
    expect(service).toContain('"message.pin" => await PinMessageAsync(args),');
    expect(service).toContain('"chat.pinned" => await PinnedMessageAsync(),');
    expect(service).toContain('"chat.pin" => await PinDialogAsync(args),');
    expect(service).toContain('"pinned.list" => throw new BridgeException(DesktopMessagePin.NoList),');
    expect(service).not.toContain('"chat.pinned" => null,');
  });

  it('el contrato ya no promete un `pin` falso a pelo', () => {
    expect(service).toContain('pin = DesktopMessagePin.CanPin(kind, message, channel),');
    expect(service).not.toContain('pin = false,');
  });

  it('fijar empieza por las cuatro negaciones, en el orden de siempre', () => {
    const pin = csBody('PinMessageAsync');
    expect(pin.indexOf('DesktopMessageDelete.OutOfRange')).toBeLessThan(pin.indexOf('RequireEntry(_active)'));
    expect(pin.indexOf('DesktopMessageDelete.Stale')).toBeLessThan(pin.indexOf('DesktopMessageDelete.NotLoaded'));
    expect(pin.indexOf('DesktopMessageDelete.NotLoaded')).toBeLessThan(pin.indexOf('DesktopMessagePin.Refused'));
    expect(pin).toContain('var unpin = !Bool(args, "value", true);');
    expect(pin).toContain('silent: DesktopMessagePin.Silent, unpin: unpin, pm_oneside: DesktopMessagePin.OneSide');
    expect(pin).toContain('_pins[entry.Id] = unpin ? 0 : ids[0];');
    // Un rechazo del servidor no deja la cuenta en «incierto»: repetir el toque es inofensivo.
    expect(pin).not.toContain('_state.Uncertain = true');
  });

  it('leer el ancla es una consulta de fondo: no levanta un aviso rojo', () => {
    const read = csBody('PinnedMessageAsync');
    expect(read).not.toContain('_state.Error');
    expect(read).toContain('if (_pinProbed.Contains(entry.Id)) return null;');
    expect(read).toContain('var probe = await ProbePinnedAsync(client, entry);');
    expect(read).toContain('_state.Messages.FirstOrDefault(message => message.Id == key)');
    expect(read).toContain('client.GetMessages(entry.Input, new InputMessageID { id = id })');
    expect(read).toContain('ConvertMessage(found, entry)');
  });

  it('el sondeo lee el único campo que este esquema publica', () => {
    const probe = csBody('ProbePinnedAsync');
    expect(probe).toContain('client.GetFullChat(entry.Input)');
    expect(probe).toContain('ChannelFull.Flags.has_pinned_msg_id');
    expect(probe).toContain('ChatFull.Flags.has_pinned_msg_id');
    expect(probe).toContain('UserFull.Flags.has_pinned_msg_id');
    expect(probe).toContain('catch { return null; }');
  });

  it('fijar la conversación escribe la marca que la lista lee', () => {
    const dialog = csBody('PinDialogAsync');
    expect(dialog).toContain('Messages_ToggleDialogPin(new InputDialogPeer { peer = entry.Input }, value)');
    expect(dialog).toContain('entry.Pinned = value;');
    expect(dialog).toContain('if (chat.Id == entry.Id) chat.Pinned = value;');
    expect(dialog).toContain('_dialogsDirty = true;');
    // El hueco de la carpeta activa va escrito junto al código, no guardado en la cabeza de quien lo escribió.
    expect(slice('Hueco dicho: esta petición fija', '</para>', service)).toContain('session.selectedList()');
  });

  it('la ventana rellena el ancla gratis y el aviso del sistema se marca', () => {
    const convert = csBody('ConvertMessage');
    // Desde la ronda AJ la bandera tiene guarda: una fila de la bandeja comparte namespace de ids con el
    // historial, y anotar su fijado pintaría una chincheta encima de otro mensaje.
    expect(convert).toContain('if (!scheduled && (message.flags & TL.Message.Flags.pinned) != 0) _pins[entry.Id] = message.ID;');
    expect(convert).toContain('ServiceNotice = true,');
    expect(dto).toContain('public bool ServiceNotice { get; set; }');
    // `service` en la interfaz es un objeto (`ServiceInfo`); una bandera con ese nombre se pintaría como aviso.
    expect(contract).toContain('service?:ServiceInfo');
    expect(dto).not.toContain('public bool Service { get; set; }');
  });

  it('Telegram manda cuando cambia el ancla, y la sesión nueva no hereda la barra', () => {
    const updates = csBody('HandleUpdate');
    expect(updates).toContain('case UpdatePinnedMessages pinned:');
    expect(updates).toContain('case UpdatePinnedChannelMessages pinned:');
    expect(updates).toContain('case UpdatePinnedDialogs:');
    expect(updates).toContain('case UpdatePinnedSavedDialogs:');
    expect(csBody('OnPinned')).toContain('_pinProbed.Remove(chatId);');
    expect(csBody('OnDeleted')).toContain('_pins.TryGetValue(_state.Active, out var anchor)');
    const dispose = csBody('DisposeClientLocked');
    expect(dispose).toContain('_pins.Clear();');
    expect(dispose).toContain('_pinProbed.Clear();');
  });
});

describe('ronda AF · la pantalla ofrece la misma orden en las dos capas', () => {
  const item = `{props.pin&&<MenuItem icon={<Pin/>} label="Fijar mensaje para mí" onClick={()=>void run('message.pin',{id:message.id}).then(done=>{if(done){refreshPinned();setDialog(undefined);}})}/>}`;

  it('el item de fijar es idéntico en Android y en Windows', () => {
    expect(count(item, app)).toBe(2);
  });

  it('y lo que el puente no puede servir no se pinta', () => {
    // La barra sale en las dos capas; el botón que lanza `pinned.list` solo existe donde la petición existe.
    expect(app).toContain('{!desktop&&<IconButton label="Ver todos los mensajes fijados" onClick={openPinned}>');
  });

  it('fijar la conversación es la misma orden en las dos capas', () => {
    expect(count("{chat.pinned?'Desfijar conversación':'Fijar conversación'}", app)).toBe(2);
    expect(count("onClick={()=>act('chat.pin',!chat.pinned)}", app)).toBe(1);
    expect(count("onClick={()=>action('chat.pin',!chat.pinned)}", app)).toBe(1);
  });

  it('la lista de fijados solo la pregunta la capa que tiene petición', () => {
    // Un solo sitio la lanza (`PinnedList`), y los dos accesos de escritorio están cortados antes de abrirla.
    expect(count("runRef.current<Message[]>('pinned.list')", app)).toBe(1);
    expect(count('onClick={openPinned}', app)).toBe(2);
    // La rama de escritorio del menú de chat no llega al diálogo: sin `messages.getPinnedMessages` no hay nada que listar.
    expect(tsBody('chatMenu', app).split('return;')[0]).not.toContain('openPinned');
  });
});

describe('ronda AF · el andamio juega con las mismas negaciones', () => {
  it('la regla espeja los derechos del canal y descarta los avisos', () => {
    const can = tsBody('desktopPinnable');
    expect(can).toContain('if (!message || message.service) return false;');
    expect(can).toContain("if (kind === 'private' || kind === 'basic') return true;");
    expect(can).toContain("return kind === 'channel' && PIN_RIGHTS.has(chat?.id ?? '')");
    expect(preview).toContain("const PIN_RIGHTS = new Set(['14']);");
  });

  it('el espejo niega con las frases del `.cs`, no con las suyas', () => {
    expect(property(refusals('PIN_REFUSALS'), 'rights')).toBe(sentence(pinRules, 'Refused'));
    expect(property(refusals('PIN_REFUSALS'), 'list')).toBe(sentence(pinRules, 'NoList'));
    const body = tsBody('desktopPin');
    expect(body.indexOf('DELETE_REFUSALS.range')).toBeLessThan(body.indexOf('pinKind(chat)'));
    expect(body.indexOf('DELETE_REFUSALS.stale')).toBeLessThan(body.indexOf('DELETE_REFUSALS.loaded'));
    expect(body.indexOf('DELETE_REFUSALS.loaded')).toBeLessThan(body.indexOf('PIN_REFUSALS.rights'));
    expect(body).toContain("pinnedByChat.set(state.active, params.value === false ? '' : id);");
  });

  it('la rama de escritorio entra por la puerta de la plataforma', () => {
    expect(preview).toContain("if (method === 'message.pin' && state.platform === 'desktop') return desktopPin(params, state);");
    expect(preview).toContain("if (method === 'pinned.list' && state.platform === 'desktop') throw new Error(PIN_REFUSALS.list);");
    expect(preview).toContain("if (method === 'chat.pin') {");
    expect(preview).toContain('pin: desktopPinnable(message, chat),');
  });

  it('el ancla del arranque sigue saliendo del pool del chat abierto', () => {
    expect(preview).toContain('const anchor = pinnedIdOf(state.active);');
    expect(preview).toContain('poolOf(state.active).find(message => message.id === anchor) ?? null');
    expect(tsBody('pinnedIdOf')).toContain("return chatId === BOOT_CHAT ? '102' : '';");
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AF · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let chats: () => { id: string; pinned: boolean }[] = () => [];

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    chats = () => (transport.snapshot() as { chats: { id: string; pinned: boolean }[] }).chats;
  });

  it('en un uno a uno la fila se puede fijar y el aviso del sistema no', async () => {
    expect(await call('message.properties', { id: '101' })).toMatchObject({ pin: true });
    expect(await call('message.properties', { id: '107' })).toMatchObject({ pin: false });
  });

  it('en un canal donde esta cuenta no manda, tampoco', async () => {
    await call('chat.open', { id: '22' });
    expect(await call('message.properties', { id: '401' })).toMatchObject({ pin: false });
    await expect(call('message.pin', { id: '401' })).rejects.toThrow('Telegram no permite esta acción sobre el mensaje.');
  });

  it('en un supergrupo con derechos, sí', async () => {
    await call('chat.open', { id: '14' });
    expect(await call('message.properties', { id: '101' })).toMatchObject({ pin: true });
    expect(await call('message.pin', { id: '101' })).toBe(true);
    expect(await call('chat.pinned')).toMatchObject({ id: '101' });
  });

  it('fijar y desfijar mueven la barra, y la fila tiene que estar cargada', async () => {
    expect(await call('chat.pinned')).toMatchObject({ id: '102' });
    expect(await call('message.pin', { id: '105' })).toBe(true);
    expect(await call('chat.pinned')).toMatchObject({ id: '105' });
    expect(await call('message.pin', { id: '105', value: false })).toBe(true);
    expect(await call('chat.pinned')).toBeNull();
    await expect(call('message.pin', { id: '999999' })).rejects.toThrow(
      'Algún mensaje de la selección ya no está cargado. Actualiza la conversación e inténtalo de nuevo.',
    );
  });

  it('fijar la conversación cambia la fila de la lista, que es lo que lee su menú', async () => {
    expect(chats().find(chat => chat.id === '13')?.pinned).toBe(false);
    expect(await call('chat.pin', { id: '13', value: true })).toBe(true);
    expect(chats().find(chat => chat.id === '13')?.pinned).toBe(true);
    expect(await call('chat.pin', { id: '13', value: false })).toBe(true);
    expect(chats().find(chat => chat.id === '13')?.pinned).toBe(false);
  });

  it('la lista de fijados se niega con la razón, no con un silencio', async () => {
    await expect(call('pinned.list')).rejects.toThrow(
      'El protocolo de escritorio no tiene petición para listar los mensajes fijados; aquí se puede consultar y quitar el fijado de esta conversación.',
    );
  });

  it('un id ilegible no llega a la regla de derechos', async () => {
    await expect(call('message.pin', { id: 'c11' })).rejects.toThrow(
      'El identificador del mensaje no cabe en la petición de Telegram.',
    );
  });
});
