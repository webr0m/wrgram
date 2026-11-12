import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const policy = java('BusinessPolicy');
const session = java('TdSession');
const snapshot = java('NativeSnapshot');
const allowed = java('BridgePolicy');
const panels = ui('BusinessPanels.tsx');
const settings = ui('SettingsPage.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const styles = ui('settings-tgx.css');

const QUICK = ['business.quick.list', 'business.quick.messages', 'business.quick.add', 'business.quick.name', 'business.quick.delete', 'business.quick.send'];
const SETTINGS = ['business.greeting', 'business.away', 'business.hours', 'business.location', 'business.start'];
const LINKS = ['business.links.list', 'business.links.save', 'business.links.delete'];
const BOT = ['business.bot.get', 'business.bot.set', 'business.bot.delete', 'business.bot.pause', 'business.bot.remove'];
const METHODS = [...QUICK, ...SETTINGS, ...LINKS, ...BOT];

describe('Telegram Business en el puente', () => {
  it('los diecinueve métodos de Business están en la lista de permitidos del puente', () => {
    for (const method of METHODS) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "business.quick.list":requireAccount();session.loadQuickReplies();a.ok(dto.quickRepliesDto());break;');
    expect(bridge).toContain('case "business.quick.messages":requireAccount();session.loadQuickReplyMessages((int)BridgePolicy.id(p,"id"));a.ok(quickMessages((int)BridgePolicy.id(p,"id")));break;');
    expect(bridge).toContain('case "business.quick.add":requireAccount();businessQuickAdd(p,a);break;');
    expect(bridge).toContain('case "business.quick.name":requireAccount();perform(new TdApi.SetQuickReplyShortcutName((int)BridgePolicy.id(p,"id"),BusinessPolicy.name(p,"name")),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.quick.delete":requireAccount();perform(new TdApi.DeleteQuickReplyShortcut((int)BridgePolicy.id(p,"id")),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.quick.send":requireAccount();perform(new TdApi.SendQuickReplyShortcutMessages(session.activeChat,(int)BridgePolicy.id(p,"id"),0),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.greeting":requireAccount();perform(new TdApi.SetBusinessGreetingMessageSettings(new TdApi.BusinessGreetingMessageSettings((int)BridgePolicy.id(p,"shortcutId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.inactivityDays(p))),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.away":requireAccount();perform(new TdApi.SetBusinessAwayMessageSettings(new TdApi.BusinessAwayMessageSettings((int)BridgePolicy.id(p,"shortcutId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.schedule(p),p.optBoolean("offlineOnly",false))),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.hours":requireAccount();perform(new TdApi.SetBusinessOpeningHours(new TdApi.BusinessOpeningHours(BusinessPolicy.text(p,"timeZoneId",BusinessPolicy.MAX_ZONE,"La zona horaria"),BusinessPolicy.intervals(p,"intervals"))),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.location":requireAccount();perform(new TdApi.SetBusinessLocation(new TdApi.BusinessLocation(null,BusinessPolicy.text(p,"address",64,"La dirección"))),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.start":requireAccount();perform(new TdApi.SetBusinessStartPage(new TdApi.InputBusinessStartPage(BusinessPolicy.text(p,"title",BusinessPolicy.MAX_TITLE,"El título"),BusinessPolicy.text(p,"message",BusinessPolicy.MAX_TEXT,"El mensaje"),null)),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.links.list":requireAccount();perform(new TdApi.GetBusinessChatLinks(),a,value->{try{businessLinksDto(a,value);}catch(Exception ignored){a.fail("No se pudieron cargar los enlaces.");}});break;');
    expect(bridge).toContain('case "business.links.save":businessLinkSave(p,a);break;');
    expect(bridge).toContain('case "business.links.delete":requireAccount();perform(new TdApi.DeleteBusinessChatLink(BridgePolicy.text(p,"link",256)),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.bot.get":requireAccount();perform(new TdApi.GetBusinessConnectedBot(),a,value->{try{businessBotDto(a,value);}catch(Exception ignored){a.fail("No se pudo cargar el bot de negocios.");}});break;');
    expect(bridge).toContain('case "business.bot.set":requireAccount();perform(new TdApi.SetBusinessConnectedBot(new TdApi.BusinessConnectedBot(BridgePolicy.id(p,"botUserId"),BusinessPolicy.recipients(p,"recipients"),BusinessPolicy.botRights(p,"rights"))),a,value->{try{businessBotDto(a,null);}catch(Exception ignored){a.fail("No se pudo aplicar el bot de negocios.");}});break;');
    expect(bridge).toContain('case "business.bot.delete":requireAccount();perform(new TdApi.DeleteBusinessConnectedBot(BridgePolicy.id(p,"botUserId")),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.bot.pause":requireAccount();perform(new TdApi.ToggleBusinessConnectedBotChatIsPaused(BridgePolicy.id(p,"chatId"),p.getBoolean("value")),a,value->a.ok(true));break;');
    expect(bridge).toContain('case "business.bot.remove":requireAccount();perform(new TdApi.RemoveBusinessConnectedBotFromChat(BridgePolicy.id(p,"chatId")),a,value->a.ok(true));break;');
  });

  it('las funciones de Telegram Business son las reales del binding', () => {
    expect(bridge).toContain('new TdApi.AddQuickReplyShortcutMessage(name,0,new TdApi.InputMessageText(new TdApi.FormattedText(text,new TdApi.TextEntity[0]),null,false))');
    expect(bridge).toContain('new TdApi.SendQuickReplyShortcutMessages(session.activeChat');
    expect(bridge).toContain('new TdApi.SetBusinessGreetingMessageSettings');
    expect(bridge).toContain('new TdApi.SetBusinessAwayMessageSettings');
    expect(bridge).toContain('new TdApi.SetBusinessOpeningHours');
    expect(bridge).toContain('new TdApi.SetBusinessLocation');
    expect(bridge).toContain('new TdApi.SetBusinessStartPage');
    expect(bridge).toContain('new TdApi.GetBusinessChatLinks()');
    expect(bridge).toContain('new TdApi.CreateBusinessChatLink(info)');
    expect(bridge).toContain('new TdApi.EditBusinessChatLink(link,info)');
    expect(bridge).toContain('new TdApi.DeleteBusinessChatLink');
    expect(bridge).toContain('new TdApi.GetBusinessConnectedBot()');
    expect(bridge).toContain('new TdApi.SetBusinessConnectedBot');
    expect(bridge).toContain('new TdApi.DeleteBusinessConnectedBot');
  });

  it('la política valida nombres, días de inactividad, recipientes, horarios y permisos', () => {
    expect(policy).toContain('static final Set<Integer> INACTIVITY_DAYS = new HashSet<>(Arrays.asList(7, 14, 21, 28));');
    expect(policy).toContain('if (!INACTIVITY_DAYS.contains(days)) throw new IllegalArgumentException("Telegram solo acepta 7, 14, 21 o 28 días de inactividad.");');
    expect(policy).toContain('new TdApi.BusinessRecipients(null, null, value.optBoolean("existing", false), value.optBoolean("newChats", false),');
    expect(policy).toContain('if (start < 0 || end < 0 || end <= start) throw new IllegalArgumentException("La fecha de fin debe ser posterior a la de inicio.");');
    expect(policy).toContain('if (start < 0 || end <= start || end > 10080) throw new IllegalArgumentException("Cada tramo debe tener inicio y fin dentro de la semana y duración mayor que cero.");');
    expect(policy).toContain('value.optBoolean("canTransferStars"), value.optBoolean("canManageStories"));');
  });

  it('la sesión guarda las respuestas rápidas desde las actualizaciones de Telegram', () => {
    expect(session).toContain('UpdateQuickReplyShortcuts');
    expect(session).toContain('UpdateQuickReplyShortcutDeleted');
    expect(session).toContain('UpdateQuickReplyShortcutMessages');
    expect(session).toContain('new TdApi.LoadQuickReplyShortcuts()');
    expect(session).toContain('new TdApi.LoadQuickReplyShortcutMessages(shortcutId)');
  });

  it('el estado publica la lista de respuestas rápidas', () => {
    expect(snapshot).toContain('data.put("quickReplies",quickRepliesDto());');
    expect(snapshot).toContain('"shortcuts",shortcuts).put("messages",messages');
    expect(snapshot).toContain('contentCaption(shortcut.firstMessage.content)');
  });

  it('el perfil precarga saludo, ausencia y página de inicio', () => {
    expect(bridge).toContain('value.put("greeting",object("shortcutId",String.valueOf(business.greetingMessageSettings.shortcutId),"inactivityDays",business.greetingMessageSettings.inactivityDays,"recipients",recipientsDto(business.greetingMessageSettings.recipients)));');
    expect(bridge).toContain('value.put("away",object("shortcutId",String.valueOf(away.shortcutId),"offlineOnly",away.offlineOnly,"schedule",schedule,"recipients",recipientsDto(away.recipients)));');
    expect(bridge).toContain('value.put("startPage",object("title",business.startPage.title==null?"":business.startPage.title,"message",business.startPage.message==null?"":business.startPage.message));');
  });
});

describe('Telegram Business en la interfaz', () => {
  it('el panel completo vive en Ajustes como sección propia', () => {
    expect(settings).toContain("import { BusinessSettings } from './BusinessPanels'");
    expect(settings).toContain("id:'business',title:'Telegram Business'");
    expect(settings).toContain('<BusinessSettings run={run} ready={state.ready}/>');
  });

  it('el menú del mensaje envía respuestas rápidas reales en lugar de borradores falsos', () => {
    expect(app).toContain("import { QuickReplySend } from './BusinessPanels'");
    expect(app).toContain('label="Respuestas rápidas"');
    expect(app).toContain('<QuickReplySend run={run}');
    expect(app).not.toContain('Preparar respuesta rápida');
    expect(app).not.toContain('Activa el permiso composer:write en Complementos. Solo prepara borradores.');
  });

  it('los formularios usan los métodos reales de Business', () => {
    for (const method of ['business.greeting', 'business.away', 'business.hours', 'business.location', 'business.start', 'business.links.list', 'business.links.save', 'business.links.delete', 'business.bot.get', 'business.bot.set', 'business.bot.delete']) {
      expect(panels).toContain(`'${method}'`);
    }
    expect(panels).toContain("run<boolean>('business.quick.send',{id})");
    expect(panels).toContain("run<boolean>('business.quick.add',{name:name.trim(),text})");
    expect(panels).toContain("run<Chat[]>('chats.search',{query:query.trim(),scope:'public'})");
    expect(panels).toContain("'business.quick.edit',{id:shortcutId,messageId:editing.id,text:editing.text}");
    expect(panels).not.toMatch(/business\.hoursOff|business\.greeting\.off/);
  });

  it('los tipos del contrato describen las respuestas rápidas y los ajustes de Business', () => {
    expect(contract).toContain('export interface QuickReplyShortcutInfo { id:number; name:string; count:number; first?:string }');
    expect(contract).toContain('export interface QuickRepliesState { shortcuts:QuickReplyShortcutInfo[]; messages:Record<string,string[]> }');
    expect(contract).toContain('export interface State { quickReplies?:QuickRepliesState }');
    expect(contract).toContain('greeting?:BusinessGreetingInfo;away?:BusinessAwayInfo;startPage?:{title:string;message:string}');
  });

  it('los estilos del panel existen', () => {
    expect(styles).toContain('.business-block');
    expect(styles).toContain('.business-hours-row');
    expect(styles).toContain('.business-row-detail');
  });

  it('no se inventan métodos que no cruzan el puente', () => {
    const invented = panels.match(/run[<(]'(business|quick)[^']*'/g) || [];
    for (const call of invented) {
      const method = call.slice(call.indexOf("'") + 1, call.lastIndexOf("'"));
      expect(METHODS).toContain(method);
    }
  });
});
