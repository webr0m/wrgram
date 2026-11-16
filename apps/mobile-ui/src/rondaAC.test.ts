import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
const nativeBridge = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const membership = text('../../desktop/src/WRGram.Desktop/DesktopMembership.cs');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopMessageDelete.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const preview = text('./preview.ts');

/** El literal que una capa asigna a una constante en C# (`const string`). */
function sentence(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una constante de TypeScript, que escribe las frases entre comillas simples. */
function literal(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una propiedad dentro de un objeto de TypeScript (`self: '...'`). */
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
function tsBody(name: string, from: string): string {
  const start = from.search(new RegExp(`(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

function handler(): string {
  const body = csBody('DeleteMessagesAsync');
  expect(body).toContain('if (_client == null)');
  return body;
}

describe('ronda AC · dos peticiones que no son simétricas', () => {
  it('la clave de la conversación decide a cuál va', () => {
    const parser = csBody('Of', rules);
    expect(parser).toContain("'u' => Kind.Private");
    expect(parser).toContain("'g' => Kind.Basic");
    expect(parser).toContain("'c' => Kind.Channel");
    expect(parser).toContain('char.IsAsciiDigit');
  });

  it('el-handler manda el privado y el básico a messages.deleteMessages, y el canal a channels.deleteMessages', () => {
    const body = handler();
    expect(body).toContain('await _client.Messages_DeleteMessages(ids, revoke)');
    expect(body).toContain('await _client.Channels_DeleteMessages(new InputChannel(peer.channel_id, peer.access_hash), ids)');
    expect(body).toContain('if (entry.Input is not InputPeerChannel peer) throw new BridgeException(DesktopMessageDelete.Stale)');
  });

  it('y la bandera de revocación solo existe en el primer camino', () => {
    // `channels.deleteMessages` no lleva `revoke` en ninguna capa del esquema: escribir `revoke` junto a esa
    // petición sería prometer una segunda petición que no hay.
    expect(handler()).not.toContain('Channels_DeleteMessages(new InputChannel(peer.channel_id, peer.access_hash), ids, revoke');
    expect(handler()).toContain('var revoke = Bool(args, "revoke");');
    expect(handler()).toContain('if (!revoke && !DesktopMessageDelete.CanDeleteSelf(kind))');
    expect(rules).toContain('public static bool CanDeleteSelf(Kind kind) => kind is Kind.Private or Kind.Basic;');
  });

  it('un «solo para mí» en canal se niega en lugar de colarse por la petición que borra para todos', () => {
    expect(handler()).toContain('throw new BridgeException(DesktopMessageDelete.NoSelfInChannel)');
    expect(sentence(rules, 'NoSelfInChannel')).toContain('no hay un «solo para mí» que enviar');
  });

  it('los permisos del canal se leen de la bandera que la librería tiene, no de una inventada', () => {
    const rights = csBody('ChannelRightsToDelete', rules);
    expect(rights).toContain('Channel.Flags.has_admin_rights');
    expect(rights).toContain('ChatAdminRights.Flags.delete_messages');
    expect(rights).toContain('Channel.Flags.min');
    expect(rights).toContain('Channel.Flags.left');
    expect(rules).not.toContain('can_delete_messages');
    expect(rules).not.toContain('Channel.Flags.admin_rights');
  });

  it('en privado y en básico, «para todos» solo con lo que esta cuenta escribió', () => {
    const all = csBody('CanDeleteAll', rules);
    expect(all).toContain('Kind.Private or Kind.Basic => outgoing');
    expect(all).toContain('Kind.Channel => outgoing || ChannelRightsToDelete(channel)');
    expect(sentence(rules, 'NotYours')).toBe('Solo puedes eliminar para todos los mensajes que enviaste tú desde esta cuenta.');
  });
});

describe('ronda AC · nada se borra a medias', () => {
  it('los ids viajan como enteros de 32 bits y un lote vacío o de más de cien no se envía', () => {
    const ids = csBody('Ids', rules);
    expect(ids).toContain('int.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var id)');
    expect(ids).toContain('id <= 0');
    expect(ids).toContain('if (!ids.Contains(id)) ids.Add(id);');
    expect(ids).toContain('return ids.Count == 0 ? null : ids.ToArray();');
    expect(rules).toContain('public const int MaxBatch = 100;');
    expect(handler()).toContain('requested.Length == 0 || requested.Length > DesktopMessageDelete.MaxBatch');
    expect(handler()).toContain('?? throw new BridgeException(DesktopMessageDelete.OutOfRange)');
  });

  it('el mismo tope que el puente de Android, con la misma frase', () => {
    expect(java).toContain('ids.length == 0 || ids.length > 100');
    expect(java).toContain(`"${sentence(rules, 'BatchSize')}"`);
    expect(sentence(rules, 'BatchSize')).toBe('Selecciona entre 1 y 100 mensajes.');
  });

  it('la ventana cargada es el único testigo: un id que no está en esta conversación no se manda', () => {
    // `messages.deleteMessages` no lleva destinatario —el servidor saca el chat del id—, así que un id de otra
    // conversación borraría lo que el servidor asocie a ese número.
    const kept = csBody('Loaded', rules);
    expect(kept).toContain('message.ChatId == chatId');
    expect(kept).toContain('wanted.Contains(id)');
    expect(handler()).toContain('DesktopMessageDelete.Loaded(_state.Messages, entry.Id, ids)');
    expect(handler()).toContain('if (rows.Count != ids.Length) throw new BridgeException(DesktopMessageDelete.NotLoaded)');
    expect(nativeBridge).toContain('Unknown message');
  });

  it('Telegram confirma, y la fila sale de la pantalla como sale en Android', () => {
    expect(handler()).toContain('_state.Messages = DesktopMessageDelete.Without(_state.Messages, ids)');
    expect(csBody('Without', rules)).toContain('doomed.Contains(id)');
    expect(java).toContain('window.remove(message.id)');
    expect(java).toContain('for (long id : ids) { HistoryWindow window = messageWindow(chatId,id); if (window != null) window.remove(id); }');
  });

  it('y los códigos de error de Telegram no se tradujeron con nombres que la librería no documenta', () => {
    expect(rules).not.toContain('MESSAGE_ID_INVALID');
    expect(rules).not.toContain('MSG_IDS_INVALID');
    expect(rules).not.toContain('FORBIDDEN');
  });
});

describe('ronda AC · el contrato que decide qué botón se pinta', () => {
  it('las dos ramas del dispatch existen y una lee el lote', () => {
    expect(service).toContain('"message.delete" => await DeleteMessagesAsync(args, batch: false)');
    expect(service).toContain('"messages.delete" => await DeleteMessagesAsync(args, batch: true)');
    expect(csBody('Arr', service)).toContain('JsonValueKind.Array');
  });

  it('Properties dejó de publicar las banderas en falso', () => {
    const body = csBody('Properties');
    expect(body).toContain('deleteSelf = DesktopMessageDelete.CanDeleteSelf(kind)');
    expect(body).toContain('deleteAll = DesktopMessageDelete.CanDeleteAll(kind, message?.Outgoing ?? false, channel)');
    expect(body).not.toContain('deleteSelf = false');
    expect(body).not.toContain('deleteAll = false');
  });

  it('el uno a uno, el bot y el básico ofrecen las dos opciones; el canal solo una', () => {
    const self = csBody('CanDeleteSelf', rules);
    expect(self).toContain('kind is Kind.Private or Kind.Basic');
    expect(csBody('Of', rules)).toContain("'u' => Kind.Private");
    expect(csBody('Properties')).toContain('ChannelOf(entry)');
    expect(csBody('ChannelOf', service)).toContain('_chats.GetValueOrDefault(peer.channel_id) as Channel');
  });
});

describe('ronda AC · la interfaz comparte las palabras con las dos capas', () => {
  it('los cuatro avisos son los mismos caracteres que escribe TdSession', () => {
    for (const name of ['OneAll', 'OneSelf', 'ManyAll', 'ManySelf']) {
      expect(java).toContain(`"${sentence(rules, name)}"`);
      expect(sentence(rules, name)).not.toBe('');
    }
    expect(sentence(rules, 'OneAll')).toBe('Mensaje eliminado para todos.');
    expect(sentence(rules, 'OneSelf')).toBe('Mensaje eliminado para ti.');
    expect(sentence(rules, 'ManyAll')).toBe('Mensajes eliminados para todos.');
    expect(sentence(rules, 'ManySelf')).toBe('Mensajes eliminados para ti.');
    const notice = csBody('Notice', rules);
    expect(notice).toContain('revoke ? OneAll : OneSelf');
    expect(notice).toContain('revoke ? ManyAll : ManySelf');
  });

  it('y la vista de diseño lleva copiadas las seis negaciones del host', () => {
    expect(property(preview, 'self')).toBe(sentence(rules, 'NoSelfInChannel'));
    expect(property(preview, 'yours')).toBe(sentence(rules, 'NotYours'));
    expect(property(preview, 'loaded')).toBe(sentence(rules, 'NotLoaded'));
    expect(property(preview, 'batch')).toBe(sentence(rules, 'BatchSize'));
    expect(property(preview, 'range')).toBe(sentence(rules, 'OutOfRange'));
    expect(property(preview, 'stale')).toBe(sentence(membership, 'Stale'));
  });

  it('las dos opciones de borrado son un único trozo de interfaz para las dos plataformas', () => {
    expect(literal(app, 'DELETED_ONE_ALL')).toBe(sentence(rules, 'OneAll'));
    expect(literal(app, 'DELETED_ONE_SELF')).toBe(sentence(rules, 'OneSelf'));
    expect(literal(app, 'DELETED_MANY_ALL')).toBe(sentence(rules, 'ManyAll'));
    expect(literal(app, 'DELETED_MANY_SELF')).toBe(sentence(rules, 'ManySelf'));
    expect(app.match(/deleteItems\(message,props\)/g)?.length).toBe(2);
    expect(app.match(/label="Eliminar solo para mí"/g)?.length).toBe(1);
    expect(app.match(/label="Eliminar para todos"/g)?.length).toBe(1);
  });

  it('el aviso lo pinta la interfaz solo donde el puente no tiene Toast', () => {
    expect(tsBody('deleteMessage', app)).toContain('if(deleted&&desktop)setToast(deletedNotice(1,revoke));');
    expect(app).toContain('deletedNotice(items.length,revoke)');
    expect(literal(app, 'DELETE_SELF_WARNING')).toContain('No se elimina para la otra persona.');
    expect(literal(app, 'DELETE_ALL_WARNING')).toContain('También se eliminará para las demás personas.');
  });

  it('la selección ya no descarta lo que solo se puede borrar para todos', () => {
    // En Windows un canal publica `deleteSelf` en falso si se filtra por esa bandera: la fila desaparecía del
    // lote aunque existiera petición para «para todos».
    expect(app).toContain('item.props?.deleteSelf||item.props?.deleteAll');
    expect(app).toContain('const self=items.every(item=>item.props?.deleteSelf)');
    expect(app).toContain('{self&&<button className="danger" onClick={()=>remove(false)}>Solo para mí</button>}');
  });

  it('la rama de escritorio pide el contrato antes de pintar, y se cae si la conversación cambió', () => {
    const menu = tsBody('messageMenu', app);
    expect(menu).toContain("const props=await run<Properties>('message.properties',{id:message.id})");
    expect(menu).toContain('if(!props||snapshot().active!==message.chatId)return;');
    expect(menu).toContain('{props&&deleteItems(message,props)}');
  });

  it('la selección arranca también desde la fila de escritorio, que es el único camino al lote', () => {
    expect(app.match(/label="Seleccionar mensajes"/g)?.length).toBe(1);
    expect(app.match(/\{selectItem\(message\)\}/g)?.length).toBe(2);
  });

  it('y la vista de diseño solo modela el borrado de Windows, sin inventarse el puente de Android', () => {
    expect(preview).toContain("if (method === 'message.properties' && state.platform === 'desktop')");
    expect(preview).toContain("if (method === 'messages.delete' && state.platform === 'desktop')");
    expect(preview).toContain('if (!revoke && kind === \'channel\') throw new Error(DELETE_REFUSALS.self)');
    expect(preview).toContain('if (rows.length !== wanted.size) throw new Error(DELETE_REFUSALS.loaded)');
    expect(preview).toContain('messages: state.messages.filter(message => !(message.chatId === state.active && wanted.has(message.id)))');
    expect(preview).toContain("if (chat.type === 'channel' || chat.supergroup) return 'channel'");
  });
});
