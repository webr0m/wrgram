import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const policy = java('GiftsPolicy');
const panel = ui('GiftsPanel.tsx');
const model = ui('giftModel.ts');
const contract = ui('contract.ts');
const app = ui('App.tsx');
const profile = ui('PeerProfile.tsx');
const settings = ui('SettingsPage.tsx');

const METHODS = ['gifts.catalog', 'gifts.received', 'gifts.canSend', 'gifts.options', 'gifts.send', 'gifts.save',
  'gifts.pin', 'gifts.sell', 'gifts.delete', 'gifts.upgrade.preview', 'gifts.upgrade', 'gifts.transfer'];

const DISPATCH: [string, string][] = [
  ['gifts.catalog', 'giftsCatalog(a)'],
  ['gifts.received', 'giftsReceived(p,a)'],
  ['gifts.canSend', 'giftsCanSend(p,a)'],
  ['gifts.options', 'giftsOptions(p,a)'],
  ['gifts.send', 'giftsSend(p,a)'],
  ['gifts.save', 'giftsSave(p,a)'],
  ['gifts.pin', 'giftsPin(p,a)'],
  ['gifts.sell', 'giftsSell(p,a)'],
  ['gifts.delete', 'giftsDelete(p,a)'],
  ['gifts.upgrade.preview', 'giftsUpgradePreview(p,a)'],
  ['gifts.upgrade', 'giftsUpgrade(p,a)'],
  ['gifts.transfer', 'giftsTransfer(p,a)'],
];

const giftRegion = () => bridge.slice(bridge.indexOf('private TdApi.Chat giftChat'), bridge.indexOf('private static boolean hasCaption'));
const method = (name: string) => {
  const region = giftRegion();
  const rest = region.slice(region.indexOf(` ${name}(`));
  const next = rest.indexOf('\n    private ', 1);
  return next < 0 ? rest : rest.slice(0, next);
};

const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of java('BridgePolicy').split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

const userDriven = () => {
  const source = ui('bridge.ts');
  const block = source.slice(source.indexOf('const USER_DRIVEN'), source.indexOf('export const requestTimeoutMs'));
  return new Set([...block.matchAll(/'([^']+)'/g)].map(match => match[1]));
};

describe('regalos en el puente nativo', () => {
  it('registra los doce métodos y empareja cada uno con su manejador', () => {
    const allowed = allowedMethods();
    expect(DISPATCH.map(([name]) => name)).toEqual(METHODS);
    for (const [name, call] of DISPATCH) {
      expect(allowed.has(name), name).toBe(true);
      expect(bridge.includes(`case "${name}":${call};break;`), name).toBe(true);
    }
  });

  it('llama a las funciones TDLib reales de regalos', () => {
    expect(policy).toContain('new TdApi.GetReceivedGifts()');
    expect(bridge).toContain('new TdApi.GetAvailableGifts()');
    expect(bridge).toContain('new TdApi.CanSendGift(giftId)');
    expect(bridge).toContain('new TdApi.GetStarGiftPaymentOptions(userId)');
    expect(bridge).toContain('new TdApi.SendGift(gift.id,recipient,new TdApi.FormattedText(text,new TdApi.TextEntity[0]),isPrivate,payForUpgrade)');
    expect(bridge).toContain('new TdApi.ToggleGiftIsSaved(GiftsPolicy.receivedId(p,"id"),GiftsPolicy.flag(p,"value"))');
    expect(bridge).toContain('new TdApi.SetPinnedGifts(giftOwner(p),GiftsPolicy.receivedIds(p,"ids"))');
    expect(bridge).toContain('new TdApi.SellGift("",id)');
    expect(bridge).toContain('new TdApi.DeleteGift("",id)');
    expect(bridge).toContain('new TdApi.GetGiftUpgradePreview(giftId)');
    expect(bridge).toContain('new TdApi.UpgradeGift("",id,keep,cost)');
    expect(bridge).toContain('new TdApi.TransferGift("",id,recipient,stars)');
  });

  it('no expone subastas, reventas, fabricación ni compra de mejoras que TDLib no resuelve aquí', () => {
    const allowed = allowedMethods();
    for (const dead of ['gifts.auction', 'gifts.resale', 'gifts.buy', 'gifts.buyUpgrade', 'gifts.craft', 'gifts.collections', 'gifts.export', 'gifts.host']) {
      expect(allowed.has(dead), dead).toBe(false);
      expect(bridge.includes(`case "${dead}"`), dead).toBe(false);
      expect(giftRegion().includes(dead), dead).toBe(false);
    }
    expect(giftRegion()).not.toContain('TdApi.StartGiftConversion');
    expect(giftRegion()).not.toContain('TdApi.TransferGiftOwnership');
  });

  it('separa el dueño del regalo del destinatario y rechaza grupos y chats secretos', () => {
    const region = giftRegion();
    expect(region).toContain('if(!(chat.type instanceof TdApi.ChatTypeSupergroup)||!((TdApi.ChatTypeSupergroup)chat.type).isChannel)throw new IllegalArgumentException("Solo tu cuenta y tus canales guardan regalos.");');
    expect(region).toContain('throw new IllegalArgumentException("Los regalos se envían a una persona o a un canal.");');
    expect(region).toContain('if(!p.has("id"))return new TdApi.MessageSenderUser(session.selfId);');
    expect(method('giftsSend')).toContain('giftRecipient(p,"id")');
    expect(method('giftsTransfer')).toContain('giftRecipient(p,"to")');
    expect((region.match(/giftOwner\(p\)/g) || []).length).toBe(2);
  });

  it('vuelve a preguntar el precio a Telegram antes de cada diálogo que gasta Stars', () => {
    expect(method('giftsSend')).toContain('session.perform(new TdApi.GetAvailableGifts(),value->{');
    expect(method('giftsSend')).toContain('if(chosen==null){a.fail("Telegram ya no ofrece ese regalo.");return;}');
    expect(method('giftsSell')).toContain('session.perform(new TdApi.GetReceivedGift(id),value->{');
    expect(method('giftsSell')).toContain('if(value.sellStarCount<=0){a.fail("Este regalo no puede cambiarse por Stars.");return;}');
    expect(method('giftsUpgrade')).toContain('if(!value.canBeUpgraded){a.fail("Telegram no permite mejorar este regalo.");return;}');
    expect(method('giftsUpgrade')).toContain('boolean prepaid=value.prepaidUpgradeStarCount>0;');
    expect(method('giftsUpgrade')).toContain('long cost=prepaid?0:gift.upgradeStarCount;');
    expect(method('giftsTransfer')).toContain('if(!value.canBeTransferred){a.fail("Este regalo no se puede transferir; solo las versiones mejoradas cambian de dueño.");return;}');
    expect(method('giftsTransfer')).toContain('if(value.nextTransferDate>now){a.fail("Telegram permitirá transferir este regalo el "+giftDate(value.nextTransferDate)+".");return;}');
  });

  it('los cinco gastos de Stars piden diálogo nativo, cancelan sin gastar y blindan la cuenta', () => {
    const region = giftRegion();
    expect((region.match(/Dialogs\.builder\(activity\)/g) || []).length).toBe(5);
    expect((region.match(/setNegativeButton\("Cancelar",\(d,w\)->a\.ok\(false\)\)/g) || []).length).toBe(5);
    expect((region.match(/setOnCancelListener\(d->a\.ok\(false\)\)\.show\(\)/g) || []).length).toBe(5);
    expect((region.match(/if\(!currentAccount\(\)\|\|session\.selfId!=ownerId\)\{a\.fail\("La cuenta cambió\./g) || []).length).toBe(5);
    expect(region).toContain('Telegram descuenta los Stars ahora y un regalo enviado no se puede devolver');
    expect(region).toContain('La mejora no se puede deshacer');
    expect(region).toContain('y no se puede deshacer');
  });

  it('refresca el saldo tras cada movimiento real de Stars', () => {
    const region = giftRegion();
    expect((region.match(/schedule\(\);/g) || []).length).toBe(4);
    expect(method('giftsDelete')).not.toContain('schedule()');
    expect(method('giftsSave')).not.toContain('schedule()');
  });

  it('limita texto, página y fijados a lo que TDLib acepta', () => {
    expect(policy).toContain('static final int MAX_PAGE=100;');
    expect(policy).toContain('static final int MAX_PINNED=64;');
    expect(policy).toContain('static final int MAX_TEXT=500;');
    expect(policy).toContain('if(!(value instanceof String)||((String)value).isEmpty()||((String)value).length()>64||!((String)value).matches("[A-Za-z0-9_-]{1,64}"))throw new IllegalArgumentException("Identificador de regalo no válido.");');
    expect(policy).toContain('else if(!view.equals("all"))throw new IllegalArgumentException("Ese filtro de regalos no existe en Telegram.");');
    expect(method('giftsSave')).toContain('requireAccount()');
    expect(method('giftsPin')).toContain('requireAccount()');
  });
});

describe('regalos en la interfaz', () => {
  it('usa solo métodos declarados en la allowlist nativa', () => {
    const calls = [...panel.matchAll(/request<[^>]*>\('([^']+)'|request\('([^']+)'/g)].map(match => match[1] || match[2]);
    const spent = [...panel.matchAll(/call\('(gifts\.[a-z.]+)'/g)].map(match => match[1]);
    const all = [...calls, ...spent];
    expect(all.length).toBeGreaterThan(8);
    const allowed = allowedMethods();
    for (const name of all) expect(allowed.has(name), name).toBe(true);
    expect(panel.includes('run(')).toBe(false);
    expect(userDriven().has('gifts.send')).toBe(true);
    expect(userDriven().has('gifts.delete')).toBe(true);
    expect(userDriven().has('gifts.catalog')).toBe(false);
    expect(userDriven().has('gifts.received')).toBe(false);
  });

  it('lee catálogo, filtros, opciones de recarga y vista previa en Telegram', () => {
    expect(panel).toContain("request<GiftCatalog>('gifts.catalog')");
    expect(panel).toContain("request<CanSendGiftResult>('gifts.canSend', { gift: gift.id })");
    expect(panel).toContain("request<StarPaymentOptions>('gifts.options', { id: chat.id })");
    expect(panel).toContain("request<ReceivedGiftCatalog>('gifts.received', { ...scope, view: filter, limit: 40, offset: reset ? '' : (next ? offset : '') })");
    expect(panel).toContain("request<GiftUpgradePreview>('gifts.upgrade.preview', { gift: item.giftId })");
    expect(panel).toContain('request(\'gifts.pin\', { ...scope, ids })');
    expect(model).toContain('export const GIFT_VIEWS');
    expect(panel).toContain('{GIFT_VIEWS.map(([key, label]) =>');
  });

  it('envía con el coste real y avisa de lo irreversible', () => {
    expect(panel).toContain("request<boolean>('gifts.send', { id: chat.id, gift: chosen.id, text, private: isPrivate, upgrade })");
    expect(panel).toContain("'Cancelado. No se gastó ningún Star.'");
    expect(panel).toContain('El precio real lo vuelve a consultar Telegram antes de abrir el diálogo de confirmación');
    expect(panel).toContain('disabled={working || !!blocked || !!check && !check.allowed}');
    expect(panel).toContain('maxLength={500}');
  });

  it('no ofrece una mejora sin el identificador del regalo base', () => {
    expect(panel).toContain('disabled={!!busy || !item.giftId}');
    expect(panel).toContain('Telegram no identificó el regalo base, así que no puede mostrar sus versiones mejoradas.');
    expect(panel).toContain('const price = currentUpgradePrice(preview);');
    expect(panel).toContain('const upcoming = upcomingUpgradePrices(preview);');
    expect(panel).toContain('es el precio de la mejora en Telegram hoy.');
  });

  it('deja claro que la transferencia necesita abrir el chat del nuevo dueño', () => {
    expect(panel).toContain('{item.canTransfer && !!recipient && <button');
    expect(panel).toContain('Para transferirlo ábrelo desde la conversación de quien será el nuevo dueño');
    expect(panel).toContain("call('gifts.transfer', 'Transferencia', { to: recipient.id })");
    expect(panel).toContain('{item.sellStarCount > 0 && <button');
    expect(panel).toContain("call('gifts.sell', 'Cambio por Stars')");
  });

  it('no confunde el dueño de los regalos con el chat abierto', () => {
    expect(panel).toContain("const owner = chat?.type === 'channel' ? chat : undefined;");
    expect(panel).toContain("const recipient = chat && chat.type !== 'secret' && !chat.bot ? chat : undefined;");
    expect(panel).toContain('const scope = owner ? { id: owner.id } : {};');
    expect(panel).toContain('{chat && !chat.supported && <p className="settings-note">');
  });

  it('avisa del límite de fijados de Telegram en lugar de recortarlo', () => {
    expect(panel).toContain('`Telegram fija como mucho ${MAX_PINNED} regalos.`');
    expect(model).toContain('if (ids.length >= MAX_PINNED) return undefined;');
  });

  it('ancla el panel a la cuenta, al chat y a los ajustes', () => {
    expect(app).toContain("import { GiftsPanel } from './GiftsPanel';");
    expect(app).toContain('function openGifts(chat:Chat){setDialog({title:`Regalos · ${chat.title}`,body:<GiftsPanel chat={chat} initial="send"/>});}');
    expect(app).toContain('gifts={openGifts}');
    expect(app).toContain('{active.type!=="secret"&&!active.bot&&<MenuItem icon={<Gift/>} label="Regalos de Stars" onClick={()=>openGifts(active)}/>}');
    expect(profile).toContain('gifts(chat: Chat): void;');
    expect(profile).toContain("<button type=\"button\" onClick={() => gifts(chat)}><Gift size={16}/>Regalos de Stars</button>");
    expect(settings).toContain('<GiftsPanel/>');
    expect(settings).toContain('Regalos de Stars');
  });

  it('mantiene el contrato exacto que serializa GiftsPolicy', () => {
    for (const name of ['GiftAttribute', 'GiftBackdropColors', 'GiftBackdrop', 'GiftUnique', 'CatalogGift', 'GiftCatalog',
      'ReceivedGiftItem', 'ReceivedGiftCatalog', 'CanSendGiftResult', 'GiftUpgradePrice', 'GiftUpgradePreview', 'GiftUpgradeResult']) {
      expect(new RegExp(`export interface ${name} \\{`).test(contract), name).toBe(true);
    }
    expect(contract).toContain("export type GiftView = 'all'|'saved'|'unsaved'|'upgradable'|'upgraded'|'colors'");
    expect(contract).toContain('giftId?:string');
    expect(contract).toContain('canUpgrade:boolean');
    expect(contract).toContain('prepaidUpgradeStarCount:number');
  });

  it('no deja regalos falsos en el modo diseño', () => {
    expect(ui('preview.ts').includes('gifts.')).toBe(false);
  });
});
