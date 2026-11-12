import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const app = ui('App.tsx');
const bridge = java('NativeBridge');
const policy = java('BridgePolicy');
const snapshot = java('NativeSnapshot');
const session = java('TdSession');

const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of policy.split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

describe('selector de remitente en chats', () => {
  it('registra los dos métodos nuevos en la allowlist nativa', () => {
    const allowed = allowedMethods();
    expect(allowed.has('chat.senders.get')).toBe(true);
    expect(allowed.has('chat.senders.set')).toBe(true);
  });

  it('emparela cada método del puente con su manejador y con la llamada TDLib real', () => {
    expect(bridge).toMatch(/case "chat\.senders\.get":chatSenders\(p,a\);break;/);
    expect(bridge).toMatch(/case "chat\.senders\.set":setChatSender\(p,a\);break;/);
    expect(bridge).toMatch(/private void chatSenders[\s\S]*?new TdApi\.GetChatAvailableMessageSenders\(chat\.id\)/);
    expect(bridge).toMatch(/private void setChatSender[\s\S]*?new TdApi\.SetChatMessageSender\(chat\.id,chosen\.sender\)/);
    expect(bridge).toContain('answer.fail("Telegram no ofrece esa identidad para escribir en este chat.")');
  });

  it('no ofrece una identidad que Telegram no haya puesto en la lista del chat', () => {
    const helper = bridge.split('static TdApi.ChatMessageSender allowedSender').pop()?.split('\n    private void setChatSender')[0] || '';
    expect(helper).toContain('if(senders==null')
    expect(helper).toContain('if("user".equals(kind)&&senderId!=selfId)return null;');
    expect(helper).toContain('kind.equals(TdSession.senderKind(item.sender))');
    expect(helper).toContain('senderId==TdSession.senderId(item.sender)');
  });

  it('solo publica campos de remitente cuando TDLib dice que el chat permite cambiarlo', () => {
    expect(snapshot).toMatch(/if\(chat\.messageSenderId!=null\)data\.put\("senderKind"/);
    expect(snapshot).toContain('.put("senderName",session.senderName(chat.messageSenderId))');
    const guarded = snapshot.split('if(chat.messageSenderId!=null)')[1]?.split('\n')[0] || '';
    expect(guarded).toContain('senderId');
    expect(guarded).toContain('senderKind');
  });

  it('aplica UpdateChatMessageSender al chat en caché para que el chip no se quede viejo', () => {
    expect(session).toMatch(/object instanceof TdApi\.UpdateChatMessageSender/);
    expect(session).toMatch(/chats\.get\(value\.chatId\)\.messageSenderId = value\.messageSenderId/);
  });

  it('pinta el chip solo con datos reales del chat y abre el selector por la pila de diálogos', () => {
    const chip = app.split('{active.senderKind&&')[1]?.split('<div className="composer">')[0] || '';
    expect(chip).toContain('openSenders(active)');
    expect(chip).toContain('active.senderName');
    expect(app).toMatch(/function openSenders\(chat:Chat\)\{setDialog\(\{title:'Escribir como',body:<p>Consultando/);
    expect(app).toMatch(/void run<ChatSenders>\('chat\.senders\.get',\{id:chat\.id\}\)/);
    expect(app).toContain("run<boolean>('chat.senders.set',{id:chat.id,kind:sender.kind,senderId:sender.id})");
    expect(app).not.toMatch(/openSenders[\s\S]{0,400}createPortal/);
  });

  it('advierte cuando Telegram no ofrece más identidad que la cuenta conectada', () => {
    expect(app).toContain('if(!value.canChoose||value.senders.length===0)');
    expect(app).toContain('Telegram no ofrece en este chat más identidad que la cuenta conectada');
  });

  it('mantiene bloqueados los remitentes que exigen Premium en lugar de simular el cambio', () => {
    const panel = app.split('function ChatSenderList').pop()?.split('\nfunction ')[0] || '';
    expect(panel).toContain('disabled={sender.premium||!!busy}');
    expect(panel).toContain('Requiere Premium');
    expect(bridge).toMatch(/if\(chosen\.needsPremium\)\{answer\.fail\("Telegram requiere Premium/);
  });

  it('declara los tipos compartidos que la interfaz lee del nativo', () => {
    expect(ui('contract.ts')).toMatch(/senderKind\?:'user'\|'chat'; senderId\?:string; senderName\?:string/);
    expect(ui('contract.ts')).toMatch(/export interface ChatSender \{ kind:'user'\|'chat'; id:string; name:string; premium:boolean \}/);
    expect(ui('contract.ts')).toContain('export interface ChatSenders { canChoose:boolean; senders:ChatSender[]; current?:ChatSender }');
  });
});
