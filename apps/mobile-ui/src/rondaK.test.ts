import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { chronological, mediaLabel, mergeThread } from './commentThreadModel';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const body = (source: string, start: string) => {
  const open = source.indexOf(start);
  if (open < 0) throw new Error(`No se encuentra ${start}`);
  let brace = -1;
  for (let i = open + start.length; i < source.length; i++) {
    if (source[i] !== '{') continue;
    let back = i - 1;
    while (back > open && /\s/.test(source[back])) back--;
    if (source[back] === ')') { brace = i; break; }
  }
  if (brace < 0) throw new Error(`No se encuentra el cuerpo de ${start}`);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(brace, i + 1);
  }
  throw new Error(`Llave sin cerrar tras ${start}`);
};

const row = (id: string, date: number, extra: Record<string, unknown> = {}) => ({ id, chatId: '22', sender: 'Prueba', text: id, date, outgoing: false, status: '', edited: false, reactions: [], ...extra }) as never;

describe('ronda D: los comentarios de un canal se leen sin tocar nada', () => {
  const bridge = java('NativeBridge');
  const thread = java('MessageThread');
  const snapshot = java('NativeSnapshot');
  const policy = java('BridgePolicy');

  it('MessageThread es puro: no pide nada a la sesión', () => {
    expect(thread).not.toMatch(/TdSession|session\.|new TdApi\.Get/);
    expect(thread).toContain('if (replies == null) return null;');
    expect(thread).toContain('if (count > 0) data.put("canOpen", true);');
    expect(thread).toContain('Long.toString(info.chatId)');
  });
  it('la burbuja proyecta el contador solo cuando Telegram dio replyInfo', () => {
    expect(snapshot).toContain('if(!temporary){JSONObject thread=MessageThread.badge(message);if(thread!=null)data.put("thread",thread);}');
  });
  it('thread.load está permitido y despachado', () => {
    expect(policy).toContain('METHODS.add("thread.load")');
    expect(bridge).toContain('case "thread.load":threadLoad(p,a);break;');
  });
  it('la primera página pregunta a Telegram dónde vive el hilo', () => {
    const load = body(bridge, 'private void threadLoad(JSONObject p,Answer a)');
    expect(load).toContain('new TdApi.GetMessageThread(chat,root)');
    expect(load).toContain('threadOwner=0;threadNext=0;threadSummary=null;');
    // El chat de discusión nunca se deduce en el cliente: se usa lo que devolvió TDLib.
    expect(load).not.toMatch(/activeChat|linkedChatId/);
  });
  it('abrir comentarios no escribe en la cuenta', () => {
    const load = body(bridge, 'private void threadLoad(JSONObject p,Answer a)');
    const page = body(bridge, 'private void threadHistory(long chat,long root,long cursor,JSONObject head,Answer a)');
    for (const write of ['SendMessage', 'SendPhoto', 'Delete', 'SetChat', 'Read', 'NewDraftMessage']) {
      expect(load + page).not.toContain(write);
    }
    expect(page).toContain('new TdApi.GetMessageThreadHistory(chat,root,cursor,0,40)');
  });
  it('el cursor paginado exige cuenta, post y cursor intactos', () => {
    const load = body(bridge, 'private void threadLoad(JSONObject p,Answer a)');
    expect(load).toMatch(/if\(threadOwner!=session\.selfId\|\|threadRootChat!=chat\|\|threadRootId!=root\|\|threadNext!=cursor\)/);
    const page = body(bridge, 'private void threadHistory(long chat,long root,long cursor,JSONObject head,Answer a)');
    expect(page).toContain('if(threadOwner!=session.selfId||threadOwner==0||threadRootChat!=chat||threadRootId!=root)');
  });
  it('el contrato describe la insignia y la página', () => {
    const contract = ui('contract.ts');
    expect(contract).toContain('export interface MessageThreadBadge { comments:number; canOpen?:boolean }');
    expect(contract).toContain('export interface Message { thread?:MessageThreadBadge }');
    expect(contract).toContain('export interface ThreadPage { chatId:string; threadId:string; comments:number; unread:number; messages:Message[]; next:boolean }');
  });
  it('la interfaz solo ofrece el hilo cuando se puede abrir', () => {
    const app = ui('App.tsx');
    expect(app).toContain('{message.thread?.canOpen&&<button type="button" className="thread-chip"');
    expect(app).toContain("{message.thread.comments===1?t('1 comentario')");
    expect(app).toContain('{thread&&<CommentThread root={thread} close={()=>setThread(undefined)}');
    // El salto reutiliza la ruta ya probada: ningún método nuevo para abrir la discusión.
    expect(app).toContain('openMessage={(chatId,messageId)=>{setThread(undefined);void openOrigin({chatId,messageId});}}');
    expect(ui('CommentThread.tsx')).toContain("request<ThreadPage>('thread.load'");
  });
  it('la vista de diseño trae canal con comentarios y canal sin ellos', () => {
    const preview = ui('preview.ts');
    expect(preview).toContain("if (method === 'thread.load')");
    expect(preview).toContain("thread:{comments:3,canOpen:true}");
    expect(preview).toContain("thread:{comments:0}");
    expect(preview).toContain("'22','WRGram · Novedades'");
    expect(ui('style.css')).toContain('.thread-chip');
  });
});

describe('ronda D: orden y fusión de las páginas del hilo', () => {  it('lee el hilo en orden cronológico', () => {
    const order = chronological([row('503', 300), row('501', 100), row('502', 200)]).map(item => item.id);
    expect(order).toEqual(['501', '502', '503']);
  });
  it('desempata por id exacto, sin pasar por un número de doble precisión', () => {
    const same = chronological([row('9007199254740995', 100), row('9007199254740993', 100), row('100', 100)]).map(item => item.id);
    expect(same).toEqual(['100', '9007199254740993', '9007199254740995']);
  });
  it('une una página más antigua sin repetir ni desordenar', () => {
    const shown = chronological([row('503', 300), row('502', 200)]);
    const merged = mergeThread(shown, [row('501', 100), row('503', 300), row('501', 100)]);
    expect(merged.map(item => item.id)).toEqual(['501', '502', '503']);
  });
  it('etiqueta el medio de un comentario', () => {
    const media = (kind: string) => ({ id: 1, ready: true, mime: 'x', kind, name: '', size: 0 }) as never;
    expect(mediaLabel(media('image'))).toBe('Foto');
    expect(mediaLabel(media('video'))).toBe('Vídeo');
    expect(mediaLabel(media('audio'))).toBe('Audio');
    expect(mediaLabel(media('rarísimo' as never))).toBe('Adjunto');
    expect(mediaLabel(undefined)).toBe('');
  });
});

describe('ronda E: Windows cita y salta igual que Android', () => {
  const service = readFileSync(new URL('../../desktop/src/WRGram.Desktop/TelegramService.cs', import.meta.url), 'utf8');
  const state = readFileSync(new URL('../../desktop/src/WRGram.Desktop/DesktopState.cs', import.meta.url), 'utf8');

  it('la cita lleva destino y usa el peer real cuando es de otro chat', () => {
    expect(service).toContain('var originChat = PeerKey(header.reply_to_peer_id) ?? entry.Id;');
    expect(service).toContain('CachedText(originChat, header.reply_to_msg_id)');
    expect(service).toContain('dto.ReplyTo = new ReplyTargetDto { ChatId = originChat, MessageId = header.reply_to_msg_id.ToString() }');
    expect(state).toContain('public ReplyTargetDto? ReplyTo { get; set; }');
    expect(state).toMatch(/public sealed class ReplyTargetDto\s*{\s*public string ChatId/s);
  });
  it('el destino habla el mismo idioma de ids que FindEntry', () => {
    expect(service).toContain('"u" + user.user_id');
    expect(service).toContain('"g" + chat.chat_id');
    expect(service).toContain('"c" + channel.channel_id');
    // El usuario 0 no es un chat: sin clave no hay destino, y la interfaz no pinta botón.
    expect(service).toMatch(/PeerUser user when user\.user_id != 0/);
    expect(service).toContain('private async Task<object?> OpenChatAsync(string id, int messageId = 0)');
  });
});
