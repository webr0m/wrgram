import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const app = ui('App.tsx');
const bridge = ui('bridge.ts');
const contract = ui('contract.ts');
const css = ui('visual-polish.css');
const native = java('NativeBridge');
const api = java('BotApi');
const store = java('BotAccounts');
const policy = java('BridgePolicy');
const session = java('TdSession');

const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of policy.split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

describe('publicar en chats con un bot propio', () => {
  it('expone cuatro métodos y deja cerrado cualquier getter del token', () => {
    const allowed = allowedMethods();
    for (const method of ['bot.status', 'bot.save', 'bot.forget', 'bot.publish']) expect(allowed.has(method), method).toBe(true);
    expect(allowed.has('bot.token')).toBe(false);
  });

  it('emparela cada método con su manejador y con la llamada real de la Bot API', () => {
    expect(native).toMatch(/case "bot\.status":botStatus\(a\);break;/);
    expect(native).toMatch(/case "bot\.save":botTokenSet\(p,a\);break;/);
    expect(native).toMatch(/case "bot\.forget":botForget\(a\);break;/);
    expect(native).toMatch(/case "bot\.publish":botPublish\(p,a\);break;/);
    expect(native).toMatch(/BotApi\.call\(token,"getMe",null\)/);
    expect(native).toMatch(/BotApi\.call\(token,method,payload\)/);
    expect(native).toMatch(/botApiCall\(stored\.optString\("token",""\),"sendMessage",payload,answer/);
    expect(native).toMatch(/payload\.put\("chat_id",Long\.toString\(chatId\)\)/);
  });

  it('registra los nueve métodos del flujo de administración y los empareja con su manejador', () => {
    const allowed = allowedMethods();
    const handlers: Record<string, string> = {
      'bot.posts': 'botPosts(p,a)',
      'bot.edit': 'botMessageAction(p,a,"editar")',
      'bot.delete': 'botMessageAction(p,a,"borrar")',
      'bot.pin': 'botMessageAction(p,a,"fijar")',
      'bot.unpin': 'botMessageAction(p,a,"desfijar")',
      'chat.bot.owned': 'ownedBots(a)',
      'chat.bot.defaults': 'botDefaultRights(p,a)',
      'chat.bot.add': 'addBotToChat(p,a)',
      'chat.bot.remove': 'removeBotFromChat(p,a)',
    };
    for (const [method, handler] of Object.entries(handlers)) {
      expect(allowed.has(method), method).toBe(true);
      expect(native, method).toContain(`case "${method}":${handler};break;`);
    }
    for (const method of ['bot.upload', 'bot.media', 'bot.button.publish', 'bot.raw', 'chat.bot.token'])
      expect(allowed.has(method), method).toBe(false);
  });

  it('solo deja publicar donde Telegram admite la identidad de un bot', () => {
    expect(native).toMatch(/if\(!\(chat\.type instanceof TdApi\.ChatTypeSupergroup\)\)\{answer\.fail\("Un bot publica en grupos y canales, no en chats privados\."\)/);
    expect(native).toContain('perform(new TdApi.GetChatMember(chatId,new TdApi.MessageSenderUser(stored.optLong("botUserId")))');
    expect(native).toMatch(/String problem=botPublishProblem\(member\.status,channel\);if\(problem!=null\)\{answer\.fail\(problem\);return;\}/);
    expect(native).toMatch(/if\(!BotApi\.validToken\(token\)\)\{answer\.fail\("El token no tiene el formato que entrega @BotFather\."\)/);
    expect(native).toMatch(/if\(!\(user\.type instanceof TdApi\.UserTypeBot\)\)/);
  });

  it('fija el host, la ruta y el transporte dentro de una sola clase', () => {
    expect(api).toMatch(/static final String HOST = "api\.telegram\.org"/);
    expect(api).toMatch(/Pattern\.compile\("\[0-9\]\{1,20\}:\[A-Za-z0-9_-\]\{25,80\}"/);
    expect(api).toMatch(/new URL\("https:\/\/" \+ HOST \+ path\(token, method\)\)/);
    expect(api).toMatch(/connection\.setInstanceFollowRedirects\(false\)/);
    expect(api).toMatch(/new PublicOnlySocketFactory\(CONNECT_TIMEOUT_MS\)/);
    expect(api).toMatch(/setFixedLengthStreamingMode/);
    expect(api).toMatch(/MAX_RESPONSE_BYTES/);
    expect(api).toMatch(/catch \(java\.net\.SocketTimeoutException/);
    expect(api).toMatch(/finally \{\s*if \(connection != null\) connection\.disconnect\(\)/);
  });

  it('no devuelve nunca el token en un mensaje de error ni en un DTO del puente', () => {
    expect(api).toMatch(/if \(token != null && trimmed\.contains\(token\)\) return "La Bot API rechazó el token del bot\."/);
    const dto = native.split('static JSONObject botRecordDto').pop()?.split('\n    private void ')[0] || '';
    expect(dto).not.toContain('"token"');
    expect(native).not.toMatch(/answer\.ok\(record\)/);
    expect(native).toMatch(/else answer\.ok\(botRecordDto\(record\)\)/);
  });

  it('cifra el registro con la clave de la ranura y lo sella contra su cuenta dueña', () => {
    expect(store).toMatch(/new File\(context\.getNoBackupFilesDir\(\), "bot-" \+ AccountSlot\.validate\(slot\) \+ "\.v1"\)/);
    expect(store).toMatch(/return \("bot:" \+ owner\)\.getBytes\(StandardCharsets\.UTF_8\)/);
    expect(store).toMatch(/if\(owner <= 0\)throw|if \(owner <= 0\) throw new IllegalArgumentException\("Account required"\)/);
    expect(store).toContain('SessionKey.load(context, slot)');
    expect(store).toContain('cipher.updateAAD(aad(owner))');
    expect((store.match(/cipher\.updateAAD\(aad\(owner\)\)/g) || []).length).toBe(2);
    expect(store).toContain('Cipher.getInstance("AES/GCM/NoPadding")');
    expect(store).toMatch(/new GCMParameterSpec\(128, Arrays\.copyOfRange\(data, 0, 12\)\)/);
    expect(store).toMatch(/Files\.move\(temporary\.toPath\(\), file\.toPath\(\), StandardCopyOption\.REPLACE_EXISTING\)/);
  });

  it('olvida el token al cerrar sesión y al descartar la ranura', () => {
    const discard = session.split('void discard()')[1]?.split('void logOut')[0] || '';
    const logOut = session.split('void logOut()')[1] || '';
    expect(discard).toContain('BotAccounts.clear(context, slot);');
    expect(logOut).toContain('BotAccounts.clear(context, slot);');
  });

  it('mantiene el transporte solo en nativo: la interfaz no llama a la Bot API', () => {
    expect(app).not.toContain('api.telegram.org/bot');
    expect(bridge).not.toMatch(/telegram\.org/);
    expect(app).toMatch(/run<BotAccount>\('bot\.status'\)/);
    expect(app).toMatch(/run<BotAccount>\('bot\.save',\{botUserId:picked\.id,token:value\}\)/);
    expect(app).toMatch(/run<BotPublished>\('bot\.publish',\{id:chat\.id,text:formatted\.text,entities:formatted\.entities,silent,preview\}\)/);
    expect(app).toMatch(/run<boolean>\('bot\.edit',\{id:chat\.id,messageId:editing\.id,text:formatted\.text,entities:formatted\.entities,preview\}\)/);
    expect(app).toMatch(/run<boolean>\('bot\.pin',\{id:chat\.id,messageId:post\.id,silent\}\)/);
    expect(app).toMatch(/run<boolean>\('bot\.unpin',\{id:chat\.id,messageId:post\.id\}\)/);
    expect(app).toMatch(/run<boolean>\('bot\.delete',\{id:chat\.id,messageId:post\.id\}\)/);
    expect(app).toMatch(/run<boolean>\('chat\.bot\.remove',\{id:chat\.id,botUserId:account\.botUserId\}\)/);
    expect(app).toMatch(/run<boolean>\('bot\.forget'\)/);
    for (const literal of ["'bot.posts'", "'chat.bot.owned'", "'chat.bot.defaults'", "'chat.bot.add'"]) expect(app).toContain(literal);
    expect(bridge).toMatch(/'chat\.bot\.add', 'chat\.bot\.remove', 'bot\.delete',/);
    const preview = ui('preview.ts');
    for (const method of ['bot.publish', 'bot.edit', 'bot.delete', 'bot.posts', 'chat.bot.add']) expect(preview, method).not.toContain(method);
  });

  it('ofrece el chip únicamente donde el nativo puede publicar y sin portales paralelos', () => {
    const bar = app.split('{(active.senderKind||canPublishAsBot)&&<div className="sender-bar">')[1]?.split('<div className="composer">')[0] || '';
    expect(bar).toContain('{canPublishAsBot&&<button type="button" className="sender-chip" onClick={()=>openBotChat(active)}>');
    expect(bar).toContain('<Bot size={13}/>');
    expect(bar).toContain('Publicar con un bot');
    const availability=native.split('private void botPublishAvailable(')[1]?.split('\n    private void ')[0] || '';
    expect(availability).toContain('session.activeTopic!=0');
    expect(availability).toContain('new TdApi.MessageSenderUser(bot)');
    expect(availability).toContain('botPublishProblem(member.status,channel)');
    expect(app).toContain("request<{publish:boolean;configure:boolean;invite:boolean}>('bot.publish.available'");
    expect(app).toContain('if(!access?.publish||!value?.configured||!value.botUserId)');
    expect(app).not.toMatch(/ChatBotPicker[\s\S]{0,600}createPortal/);
  });

  it('recoge el token en un campo cerrado que luego no vuelve a mostrarse', () => {
    const picker = app.split('function ChatBotPicker').pop()?.split('\nfunction ')[0] || '';
    expect(picker).toContain('type="password"');
    expect(picker).toContain('maxLength={128}');
    expect(picker).toContain('WRGram lo cifra con la clave de esta cuenta en tu teléfono, no lo vuelve a mostrar y solo lo envía a api.telegram.org');
    expect(picker).toContain("run<GroupMember[]>('groups.members',{id:chat.id})");
    expect(picker).toContain('value.filter(member=>member.bot)');
    expect(picker).toContain('Requiere ser administrador');
    expect(picker).toContain('value={token}');
    expect(contract).not.toMatch(/BotAccount \{[^}]*token/);
  });

  it('advierte con honestidad cuando Telegram o la Bot API no confirman', () => {
    const picker = app.split('function ChatBotPicker').pop()?.split('\nfunction ')[0] || '';
    const panel = app.split('function ChatBotPanel').pop()?.split('\nfunction ')[0] || '';
    expect(picker).toContain('Telegram no confirmó que ese token pertenezca a este bot. No se guardó nada y puedes reintentar con otro token.');
    expect(picker).toContain('Telegram solo lista los bots de un grupo o canal si tu cuenta es administradora allí');
    expect(panel).toContain('La Bot API no confirmó la publicación. Revisa el chat antes de reintentar: el texto podría haberse enviado igual.');
    expect(panel).toContain('maxLength={4096}');
    expect(panel).toContain('El mensaje lo firma el bot, no tu cuenta');
  });

  it('añade el bot solo donde TDLib puede promoverlo y con los permisos que se pueden delegar', () => {
    const adder = app.split('function ChatBotAdder').pop()?.split('\nfunction ')[0] || '';
    expect(adder).toContain("run<OwnedBot[]>('chat.bot.owned')");
    expect(adder).toContain("run<BotDefaultRights>('chat.bot.defaults',{botUserId:picked.id,channel})");
    expect(adder).toContain("run<boolean>('chat.bot.add',{id:chat.id,botUserId:picked.id,...rights})");
    expect(adder).toContain('<AdminRightsEditor available={available}');
    expect(adder).toContain('value.filter(bot=>bot.canJoinGroups)');
    expect(adder).toContain('Cancelaste la confirmación nativa. No se cambió nada en Telegram.');
    expect(adder).toContain('Telegram no confirmó el cambio. Revisa la lista de miembros antes de repetirlo.');
    expect(native).toContain('El bot tiene bloqueada la entrada en grupos y canales. Actívala con @BotFather y vuelve a intentarlo.');
    expect(native).toMatch(/if\(!canInviteMembers\(actor\)\)/);
    expect(native).toMatch(/if\(!canPromoteMembers\(actor\)\)/);
    expect(native).toMatch(/new TdApi\.AddChatMember\(chatId,botUserId,0\)/);
    expect(native).toMatch(/new TdApi\.ChatMemberStatusAdministrator\(false,rights\)/);
  });

  it('saca al bot sin borrarle lo publicado y confirma antes de tocar el chat', () => {
    expect(native).toMatch(/new TdApi\.ChatMemberStatusLeft\(\)/);
    expect(native).not.toMatch(/new TdApi\.BanChatMember\(chatId,new TdApi\.MessageSenderUser\(botUserId\)/);
    expect(native).toContain('Quítale el baneo antes de añadirlo');
    expect(native).toContain('Conserva los mensajes ya publicados y podrá volver a añadirse; para borrarle todo su historial usa Banear en Miembros.');
    const panel = app.split('function ChatBotPanel').pop()?.split('\nfunction ')[0] || '';
    expect(panel).toContain('Banear en Miembros es lo que borra su historial');
    expect(panel).toContain('Telegram no confirmó la salida del bot. Revisa la lista de miembros antes de repetirla.');
  });

  it('actúa solo sobre mensajes que el bot escribió y confirma los destructivos', () => {
    expect(native).toMatch(/perform\(new TdApi\.GetMessage\(chatId,messageId\),answer/);
    expect(native).toContain('WRGram solo actúa sobre sus propias publicaciones');
    expect(native).toContain('El bot solo puede editar mensajes de texto');
    expect(native).toContain('Telegram no permite modificar mensajes con autodestrucción.');
    expect(native).toMatch(/method="editMessageText"/);
    expect(native).toMatch(/method="deleteMessage"/);
    expect(native).toMatch(/method="pinChatMessage"/);
    expect(native).toMatch(/method="unpinChatMessage"/);
    expect(native).toContain('"Borrar publicación del bot"');
    expect(native).toMatch(/perform\(new TdApi\.SearchChatMessages\(chatId,null,"",new TdApi\.MessageSenderUser/);
  });

  it('nombra los límites reales del flujo en lugar de simularlos', () => {
    expect(native).toContain('la Bot API pide un identificador de hilo que este binding de TDLib no expone');
    expect(native).toContain('WRGram administra al bot desde el chat, no dentro de un tema del foro.');
    expect(native).toMatch(/if\(text\.isBlank\(\)\)\{answer\.fail\("Escribe algo antes de publicar\."\)/);
    expect(native).toMatch(/static String botEntityType\(String type\)/);
    expect(native).toMatch(/throw new IllegalArgumentException\("Ese formato no está disponible al publicar con un bot\."\)/);
    const panel = app.split('function ChatBotPanel').pop()?.split('\nfunction ')[0] || '';
    expect(panel).toContain('el formato anterior no se copia al campo');
    expect(panel).toContain('La Bot API no admite cambiar el aviso al editar una publicación');
    expect(panel).toContain('run<BotPost[]>');
  });

  it('declara los tipos compartidos y el estilo del panel', () => {
    expect(contract).toMatch(/export interface BotAccount \{ configured:boolean; botUserId\?:string; username\?:string; name\?:string \}/);
    expect(contract).toMatch(/export interface OwnedBot \{ id:string; name\?:string; username\?:string; owned:boolean; canJoinGroups:boolean \}/);
    expect(contract).toMatch(/export interface BotDefaultRights \{ known:boolean; group\?:GroupAdminRights; channel\?:GroupAdminRights \}/);
    expect(contract).toMatch(/export interface BotPost \{ id:string; text:string; entities\?:TextEntity\[\]; pinned:boolean; date:number \}/);
    expect(contract).toMatch(/export interface BotPublished \{ messageId:string; username:string \}/);
    expect(contract).toMatch(/admin\?:boolean/);
    expect(css).toMatch(/\.bot-token-form,\.bot-panel\{/);
    expect(css).toMatch(/\.bot-token-form \.field-label textarea,\.bot-panel \.field-label textarea\{/);
    for (const selector of ['.bot-editing', '.bot-tuning-actions', '.bot-posts', '.bot-post-text', '.bot-post-flag']) expect(css, selector).toContain(selector);
  });
});
