import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');
const csharp = (name: string) => readFileSync(new URL(`../../desktop/src/WRGram.Desktop/${name}.cs`, import.meta.url), 'utf8');

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

const lineWith = (source: string, needle: string) => {
  const line = source.split('\n').find(entry => entry.includes(needle));
  if (!line) throw new Error(`Ninguna línea contiene ${needle}`);
  return line;
};

describe('ronda C: la procedencia de un mensaje llega completa a la interfaz', () => {
  const snapshot = java('NativeSnapshot');
  const forward = java('ForwardOrigin');
  const contract = ui('contract.ts');
  const app = ui('App.tsx');

  it('el DTO del mensaje proyecta forwardInfo y el destino de la cita', () => {
    expect(snapshot).toContain('if(!temporary&&message.forwardInfo!=null){JSONObject forward=ForwardOrigin.project(message.forwardInfo,forwardNames())');
    expect(snapshot).toContain('data.put("forward",forward)');
    expect(snapshot).toContain('data.put("replyTo",new JSONObject().put("chatId",String.valueOf(target)).put("messageId",String.valueOf(reply.messageId)))');
    expect(snapshot).toContain('data.put("replyAuthor",limit(session.senderName(original.senderId),80))');
    // La cita de otro chat no se resuelve contra la ventana cargada: solo se ofrece el destino.
    expect(snapshot).toMatch(/long target=reply\.chatId==0\?message\.chatId:reply\.chatId;TdApi\.Message original=target==message\.chatId\?session\.message/);
  });
  it('pintar la procedencia nunca consulta a Telegram', () => {
    const names = body(snapshot, 'private ForwardOrigin.Names forwardNames()');
    expect(names).toContain('session.user(id)');
    expect(names).toContain('session.chat(id)');
    for (const forbidden of ['new TdApi.GetUser(', 'new TdApi.GetChat(', 'perform(', 'request(']) expect(names).not.toContain(forbidden);
  });
  it('ForwardOrigin es puro y respeta lo que Telegram oculta', () => {
    expect(forward).not.toMatch(/TdSession|session\.|new TdApi\.Get/);
    expect(lineWith(forward, '"kind", "user"')).toContain('"userId"');
    expect(lineWith(forward, '"kind", "user"')).not.toContain('chatId');
    expect(lineWith(forward, '"kind", "hidden"')).not.toMatch(/userId|chatId|messageId/);
    expect(forward).toContain('if (source.chatId != 0 && source.messageId != 0) data.put("messageId"');
    expect(forward).toContain('Long.toString(source.senderChatId)');
    expect(forward).toContain('Long.toString(source.messageId)');
  });
  it('el contrato expone el origen y la cita navegables', () => {
    expect(contract).toContain("export interface ForwardOrigin { kind:'user'|'hidden'|'chat'|'channel'");
    expect(contract).toContain('export interface Message { forward?:ForwardOrigin; replyAuthor?:string; replyTo?:{chatId:string;messageId:string} }');
  });
  it('la burbuja usa la procedencia y salta por la misma ruta que la búsqueda', () => {
    expect(app).toContain('{message.forward&&<ForwardOriginTag origin={message.forward} open={target=>void openOrigin(target)}/>}');
    expect(app).toContain('jump={target=>void openOrigin(target)}');
    expect(app).toContain('{time(bubbleDate(message))}');
    const jump = body(app, 'async function openOrigin(target:JumpTarget)');
    expect(jump).toContain('openSearchResult({chatId:target.chatId,id:target.messageId})');
    expect(jump).toContain("run<boolean>('chat.open',{id:target.chatId})");
    // Sin destino no hay botón: un origen anónimo o de usuario nunca se finge navegable.
    expect(app).toContain('function ForwardOriginTag({origin,open}');
    expect(body(app, 'function ForwardOriginTag')).toMatch(/target\s*\?[\s\S]*is-navigable[\s\S]*:\s*<div className="forward-origin">/);
  });
  it('la vista de diseño muestra los tres estados', () => {
    const preview = ui('preview.ts');
    expect(preview).toContain("const designProvenance:Record<string,Partial<Message>>=");
    expect(preview).toContain("kind:'hidden'");
    expect(preview).toContain("kind:'channel'");
    expect(preview).toContain('...designProvenance[String(id)]');
    expect(ui('style.css')).toContain('.forward-origin');
  });
  it('Windows proyecta la misma procedencia con sus propios identificadores', () => {
    const service = csharp('TelegramService');
    const state = csharp('DesktopState');
    expect(service).toContain('if (message.fwd_from is { } forwarded) dto.Forward = ConvertForward(forwarded);');
    expect(service).toContain('case PeerUser user when user.user_id != 0');
    expect(service).toContain('data.Kind = "hidden"');
    expect(service).toContain('data.ChatId = "c" + channel.channel_id');
    expect(service).toContain('data.ChatId = "g" + chat.chat_id');
    // En Windows un origen anónimo solo se pinta si Telegram ya dio un nombre público.
    expect(service).toMatch(/default:\s*if \(string\.IsNullOrWhiteSpace\(header\.from_name\)\) return null;/);
    expect(state).toContain('public ForwardDto? Forward { get; set; }');
    expect(state).toContain('public string? MessageId { get; set; }');
  });
});
