import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const allowed = java('BridgePolicy');
const snapshot = java('NativeSnapshot');
const filters = ui('chatFilters.ts');
const inboxTabs = ui('InboxTabs.tsx');
const inboxTabBar = ui('InboxTabBar.tsx');
const appearance = ui('AppearanceSettings.tsx');
const feed = ui('ChannelFeed.tsx');
const app = ui('App.tsx');
const contract = ui('contract.ts');
const styles = ui('visual-polish.css');
const tabsStyles = ui('inbox-tabs.css');
const feedStyles = ui('channel-feed.css');

const METHODS = ['feed.channels', 'search.filters.list', 'search.filters.save', 'search.filters.delete'];

describe('Ronda E en el puente', () => {
  it('los métodos nuevos están en la lista de permitidos del puente', () => {
    expect(allowed).toContain('"feed.channels","search.filters.list","search.filters.save","search.filters.delete"');
    for (const method of METHODS) expect(allowed).toContain(`"${method}"`);
  });

  it('cada método tiene un caso en el despachador nativo', () => {
    expect(bridge).toContain('case "feed.channels":feedChannels(a);break;');
    expect(bridge).toContain('case "search.filters.list":searchFilters(p,a,false,false);break;');
    expect(bridge).toContain('case "search.filters.save":searchFilters(p,a,true,false);break;');
    expect(bridge).toContain('case "search.filters.delete":searchFilters(p,a,false,true);break;');
  });

  it('el feed usa la búsqueda real de TDLib por canal y limita el resultado', () => {
    expect(bridge).toContain('new TdApi.SearchChatMessages(channels.get(index).id,null,"",null,0,0,3,new TdApi.SearchMessagesFilterEmpty())');
    expect(bridge).toContain('if(channels.size()>=25)break;');
    expect(bridge).toContain('if(merged.size()>80)merged.subList(80,merged.size()).clear();');
    expect(bridge).toContain('"text",NativeSnapshot.limit(TdSession.text(message),300)');
  });

  it('los filtros guardados se persisten por cuenta con validación', () => {
    expect(bridge).toContain('SharedPreferences store=activity.getSharedPreferences("search_filters",0);');
    expect(bridge).toContain('String key=session.slot+"."+session.selfId;');
    expect(bridge).toContain('if(list.length()>=20)throw new IllegalArgumentException("Puedes guardar hasta 20 filtros de búsqueda.");');
    expect(bridge).toContain('messageFilter(filter);');
    expect(bridge).toContain('if(query.length()<2&&filter.isEmpty())throw new IllegalArgumentException("La búsqueda necesita texto o un filtro.");');
    expect(bridge).toContain('if(!chatId.isEmpty())chatId=Long.toString(BridgePolicy.id(params,"chatId"));');
  });

  it('el icono de pestaña se valida contra una lista cerrada y se persiste', () => {
    expect(bridge).toContain('static final Set<String> TAB_ICON_KEYS=Set.of("hash","bookmark","star","megaphone","users","send","bot","lock","pin","archive","image","heart","globe","bell","flame");');
    expect(bridge).toContain('if(!icon.matches("[a-z]{1,16}")||!TAB_ICON_KEYS.contains(icon))throw new IllegalArgumentException("El icono de la pestaña no es válido.");');
    expect(bridge).toContain('value.put("icon",icon);');
  });

  it('los gestos se validan por lado y acción y vuelven en el estado de apariencia', () => {
    expect(bridge).toContain('if(!side.matches("left|right")||!gestures.optString(side,"").matches("none|reply|copy|forward|select"))throw new IllegalArgumentException();');
    expect(bridge).toContain('edit.putString("gestures",gestures.toString());');
    expect(snapshot).toContain('value.put("gestures",new JSONObject().put("left",parsed.optString("left","none")).put("right",parsed.optString("right","none")));');
    expect(contract).toContain('gestures?: { left:string; right:string }');
  });
});

describe('Ronda E en la interfaz', () => {
  it('el tipo de pestaña acepta icono y la lista está cerrada', () => {
    expect(filters).toMatch(/export type InboxTab = .*icon\?:string/);
    expect(filters).toContain("['hash','Etiqueta'],['bookmark','Marcador'],['star','Estrella']");
    expect(inboxTabs).toContain('aria-pressed={(item.icon||\'\')===key}');
    expect(inboxTabs).toContain('update({icon:key||undefined})');
  });

  it('la barra de pestañas pinta el icono guardado', () => {
    expect(inboxTabs).toContain('const TAB_ICON_PARTS:Record<string,LucideIcon>');
    expect(inboxTabBar).toContain('<InboxTabIcon icon={tab.icon}/>');
    expect(app).toContain('<InboxTabBar tabs={visibleTabs}');
    expect(tabsStyles).toContain('.tabs-icon-picker button');
  });

  it('el feed de canales es un panel que abre el mensaje original', () => {
    expect(feed).toContain("request.current<FeedEntry[]>('feed.channels')");
    expect(feed).toContain('open(entry)');
    expect(app).toContain('<ChannelFeed key={state.selfId} owner={state.selfId} run={run}');
    expect(app).toContain('label="Feed de canales"');
    expect(app).toContain('void openSearchResult({id:entry.messageId,chatId:entry.chatId})');
    expect(contract).toContain('export type FeedEntry = { chatId:string; messageId:string; title:string; text:string; date:number }');
    expect(feedStyles).toContain('.channel-feed-row');
  });

  it('la búsqueda guarda y aplica filtros con la barra existente', () => {
    expect(app).toContain("request<SavedFilter[]>('search.filters.list')");
    expect(app).toContain("run<SavedFilter[]>('search.filters.save',{name:clean,query:searchQuery.trim(),filter:searchFilter,mode:searchMode");
    expect(app).toContain("run<SavedFilter[]>('search.filters.delete',{id:item.id})");
    expect(app).toContain('className="search-filter search-filter-save"');
    expect(app).toContain('aria-label="Filtros de búsqueda guardados"');
    expect(contract).toContain("export type SavedFilter = { id:string; name:string; query:string; filter:string; mode:'chat'|'global'; chatId?:string }");
    expect(styles).toContain('.saved-filter-chip');
  });

  it('los gestos de burbuja leen la apariencia y ejecutan acciones reales', () => {
    expect(appearance).toContain("['none', 'Nada'], ['reply', 'Responder'], ['copy', 'Copiar texto'], ['forward', 'Reenviar'], ['select', 'Seleccionar']");
    expect(appearance).toContain("run('appearance', { gestures: { left: state.appearance.gestures?.left || 'none', right: event.target.value } })");
    expect(app).toContain('function bubbleSwipeStart(event:TouchEvent)');
    expect(app).toContain('if(Math.abs(dx)<72||Math.abs(dx)<Math.abs(dy)*1.8)return;');
    expect(app).toContain("dx>0?state.appearance.gestures?.right||'none':state.appearance.gestures?.left||'none'");
    expect(app).toContain('onTouchStart={bubbleSwipeStart} onTouchEnd={event=>bubbleSwipeEnd(message,event)}');
    expect(app).toContain("void run('message.copy',{id:message.id})");
    expect(styles).toContain('.gesture-selects');
  });

  it('el encabezado ofrece volver al chat anterior', () => {
    expect(app).toContain('const lastActive=useRef(state.active);const [previousChatId,setPreviousChatId]=useState(\'\');');
    expect(app).toContain('label="Volver al chat anterior"');
    expect(app).toContain("void run('chat.open',{id:previousChatId})");
  });
});
