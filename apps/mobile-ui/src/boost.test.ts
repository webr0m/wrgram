import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');
const javaDir = new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/', import.meta.url);

const bridge = java('NativeBridge');
const panel = ui('BoostsPanel.tsx');
const model = ui('boostModel.ts');
const contract = ui('contract.ts');
const app = ui('App.tsx');
const profile = ui('PeerProfile.tsx');

const METHODS = ['chat.boost.status', 'chat.boost.slots', 'chat.boost.features', 'chat.boost.level', 'chat.boost.link', 'chat.boost.apply'];

const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of java('BridgePolicy').split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

const userDriven = () => {
  const block = bridgeUi().slice(bridgeUi().indexOf('const USER_DRIVEN'), bridgeUi().indexOf('export const requestTimeoutMs'));
  return new Set([...block.matchAll(/'([^']+)'/g)].map(match => match[1]));
};
const bridgeUi = () => ui('bridge.ts');

describe('impulsos en el puente nativo', () => {
  it('registra los seis métodos y empareja cada uno con su manejador', () => {
    const allowed = allowedMethods();
    for (const method of METHODS) {
      expect(allowed.has(method), method).toBe(true);
      expect(new RegExp(`case "${method}":[a-zA-Z]+\\((p,)?a\\);break;`).test(bridge), method).toBe(true);
    }
  });

  it('llama a las funciones TDLib reales de impulsos', () => {
    expect(bridge).toContain('new TdApi.GetChatBoostStatus(chat.id)');
    expect(bridge).toContain('new TdApi.GetAvailableChatBoostSlots()');
    expect(bridge).toContain('new TdApi.GetChatBoostFeatures(channel)');
    expect(bridge).toContain('new TdApi.GetChatBoostLevelFeatures(channel,level)');
    expect(bridge).toContain('new TdApi.GetChatBoostLink(chat.id)');
    expect(bridge).toContain('new TdApi.BoostChat(chat.id,slots)');
  });

  it('no deja ningún método que solo TDLib para bots pueda resolver', () => {
    for (const file of readdirSync(javaDir)) {
      const text = readFileSync(new URL(file, javaDir), 'utf8');
      expect(text.includes('GetUserChatBoosts'), file).toBe(false);
    }
    const allowed = allowedMethods();
    for (const dead of ['chat.boost.mine', 'chat.boost.link.info', 'chat.boost.list']) {
      expect(allowed.has(dead), dead).toBe(false);
      expect(bridge.includes(`case "${dead}"`), dead).toBe(false);
    }
  });

  it('limita los impulsos a supergrupos y canales antes de tocar Telegram', () => {
    expect(bridge).toMatch(/private TdApi\.Chat boostChat\(JSONObject p\)throws Exception\{[^}]*target\(p\)/);
    expect(bridge).toContain('if(!(chat.type instanceof TdApi.ChatTypeSupergroup))throw new IllegalArgumentException("Los impulsos solo existen en supergrupos y canales.");');
    expect((bridge.match(/boostChat\(p\)/g) || []).length).toBe(3);
  });

  it('exige confirmación nativa y protege el cambio de cuenta al impulsar', () => {
    const apply = bridge.slice(bridge.indexOf('private void chatBoostApply'));
    expect(apply.slice(0, 1200)).toContain('Dialogs.builder(activity)');
    expect(apply).toContain('Telegram mantiene el impulso durante un mes');
    expect(apply).toContain('setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(apply).toContain('setOnCancelListener(d->a.ok(false))');
    expect(apply).toContain('if(!currentAccount()||session.selfId!=a.owner){a.fail("La cuenta cambió. No se aplicó ningún impulso.");return;}');
    expect(apply).toContain('BoostsPolicy.slotIds(p,"slots")');
  });

  it('aplica el límite de espacios y responde con los espacios que devuelve Telegram', () => {
    const policy = java('BoostsPolicy');
    expect(policy).toContain('static final int MAX_SLOTS=64;');
    expect(policy).toContain('if(!seen.add(slot))throw new IllegalArgumentException("Hay espacios de boost repetidos.");');
    expect(bridge).toContain('a.ok(BoostsPolicy.slots(value,(int)(System.currentTimeMillis()/1000)));');
  });

  it('mantiene los espacios y el estado ligados a la cuenta real', () => {
    expect(bridge).toMatch(/private void chatBoostSlots\(Answer a\)\{requireAccount\(\);/);
    expect(bridge).toMatch(/private void chatBoostFeatures\(JSONObject p,Answer a\)throws Exception\{requireAccount\(\);/);
    expect(bridge).toMatch(/private void chatBoostStatus\(JSONObject p,Answer a\)throws Exception\{TdApi\.Chat chat=boostChat\(p\);/);
  });
});

describe('enlaces de impulso', () => {
  it('resuelve t.me/+… con TDLib y abre el panel del chat destino', () => {
    expect(bridge).toContain('if(type instanceof TdApi.InternalLinkTypeChatBoost){openBoostLink(((TdApi.InternalLinkTypeChatBoost)type).url,sink);return;}');
    const resolver = bridge.slice(bridge.indexOf('private void openBoostLink'));
    expect(resolver.slice(0, 2600)).toContain('BoostsPolicy.boostUrl(raw)');
    expect(resolver).toContain('new TdApi.GetChatBoostLinkInfo(url)');
    expect(resolver).toContain('session.loadChat(value.chatId');
    expect(resolver).toContain('session.open(chat.id)');
    expect(resolver).toContain('"action","boost"');
    expect(resolver).toContain('object("action","boost","chatId",Long.toString(chat.id)');
  });

  it('jamás descarga un enlace de impulso: solo se lo pasa a TDLib', () => {
    const resolver = bridge.slice(bridge.indexOf('private void openBoostLink'), bridge.indexOf('private void openBoostLink') + 2600);
    for (const network of ['HttpURLConnection', 'openConnection', 'java.net.URI', 'fetch(', 'WebView']) {
      expect(resolver.includes(network), network).toBe(false);
    }
    expect(java('BoostsPolicy')).toMatch(/static String boostUrl\(String raw\)\{[^}]*startsWith\("https:\/\/"\)/);
  });
});

describe('impulsos en la interfaz', () => {
  it('usa solo métodos declarados en la allowlist nativa', () => {
    const calls = [...panel.matchAll(/request<[^>]*>\('([^']+)'|request\('([^']+)'/g)].map(match => match[1] || match[2]);
    expect(calls.length).toBeGreaterThan(4);
    const allowed = allowedMethods();
    for (const call of calls) expect(allowed.has(call), call).toBe(true);
    expect(panel.includes('run(')).toBe(false);
  });

  it('no fuerza el plazo de 35 s porque impulsar abre un diálogo nativo', () => {
    expect(userDriven().has('chat.boost.apply')).toBe(true);
    expect(userDriven().has('chat.boost.status')).toBe(false);
    expect(allowedMethods().has('chat.boost.apply')).toBe(true);
    expect(panel).toContain("request<BoostSlots | false>('chat.boost.apply', { id: chat.id, slots })");
  });

  it('no inventa datos: cada pestaña pide su estado a Telegram', () => {
    expect(panel).toContain("request<BoostStatus>('chat.boost.status', { id: chat.id })");
    expect(panel).toContain("request<BoostSlots>('chat.boost.slots')");
    expect(panel).toContain("request<BoostLink>('chat.boost.link', { id: chat.id })");
    expect(panel).toContain("request<BoostFeatures>('chat.boost.features', { channel })");
    expect(panel).toContain("request<BoostLevelFeatures>('chat.boost.level', { channel, level })");
    expect(panel).toContain('await request(\'clipboard.copy\', { text: link.link })');
  });

  it('encadena el estado y el enlace sin bloquear el panel si Telegram no da enlace', () => {
    expect(model).toContain('export function boostProgress');
    expect(panel).toContain('boostProgress(value)');
    expect(panel).toContain(".catch(() => undefined)");
    expect(panel).toContain('{link?.link &&');
  });

  it('ancla el panel al chat desde el menú y desde la ficha de perfil', () => {
    expect(app).toContain("import { BoostsPanel } from './BoostsPanel';");
    expect(app).toContain('function openBoosts(chat:Chat){setDialog({title:`Impulsos · ${chat.title}`,body:<BoostsPanel chat={chat} chats={state.chats}/>});}');
    expect(app).toContain('{(active.supergroup===true||active.type==="channel")&&<MenuItem icon={<Rocket/>} label="Impulsos del chat" onClick={()=>openBoosts(active)}/>}');
    expect(app).toMatch(/case 'boost':\s+if\(result\.chatId\)\{[^}]*openBoosts\(boostTarget\(result\.chatId,result\.title\|\|'',result\.channel===true\)\)/);
    expect(app).toContain("'link.open',{url}).then(handleTelegramLinkResult)");
    expect(profile).toContain('boosts(chat: Chat): void;');
    expect(profile).toContain('<button type="button" onClick={() => boosts(chat)}><Rocket size={16}/>Impulsos del chat</button>');
  });

  it('reconstruye el chat del enlace sin fingir que es uno propio', () => {
    expect(app).toContain("function boostTarget(chatId:string,title:string,channel:boolean):Chat{return state.chats.find(other=>other.id===chatId)??{id:chatId,");
    expect(app).toContain('supported:false}');
    expect(panel).toContain('WRGram no abre este chat, pero Telegram sí informa sus impulsos.');
  });

  it('muestra el ingreso del canal con el mismo chatId que usan los métodos de Stars', () => {
    expect(panel).toContain('<StarsRevenue chatId={chat.id}/>');
    expect(ui('StarsPanels.tsx')).toContain('export function StarsRevenue({chatId}:{chatId?:string}){');
    expect(ui('StarsPanels.tsx')).toContain('const owner=chatId?{id:chatId}:{};');
    expect(panel).toContain("chat.type === 'channel'");
  });

  it('mantiene el contrato exacto que serializa BoostsPolicy', () => {
    for (const name of ['BoostSlot', 'BoostSlots', 'BoostStatus', 'BoostLevelFeatures', 'BoostFeatures', 'BoostLink']) {
      expect(new RegExp(`export interface ${name} \\{`).test(contract), name).toBe(true);
    }
    for (const gone of ['BoostLinkInfo', 'BoostList']) {
      expect(new RegExp(`export interface ${gone} \\{`).test(contract), gone).toBe(false);
    }
    expect(contract).toContain('appliedSlotIds:number[]');
    expect(contract).toContain('premiumMemberPercentage:number');
    expect(contract).toContain('channel?:boolean');
  });

  it('no deja estados falsos en el modo diseño', () => {
    expect(ui('preview.ts').includes('chat.boost.')).toBe(false);
  });
});
