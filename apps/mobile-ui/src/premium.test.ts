import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');
const javaDir = new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/', import.meta.url);

const bridge = java('NativeBridge');
const panels = ui('PremiumPanels.tsx');
const settings = ui('SettingsPage.tsx');

const METHODS = ['premium.state', 'premium.features', 'premium.limit', 'premium.stickers', 'premium.gift.options', 'premium.gift.check', 'premium.gift.apply'];
const READ_ONLY = ['premium.state', 'premium.features', 'premium.limit', 'premium.stickers', 'premium.gift.options', 'premium.gift.check'];
const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of java('BridgePolicy').split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

describe('Telegram Premium en el puente nativo', () => {
  it('registra los siete métodos en la allowlist y empareja cada uno con su manejador', () => {
    const allowed = allowedMethods();
    for (const method of METHODS) {
      expect(allowed.has(method), method).toBe(true);
      expect(new RegExp(`case "${method.replace(/\./g, '\\.')}":[a-zA-Z]+\\((p,)?a\\);break;`).test(bridge), method).toBe(true);
    }
  });

  it('llama a las funciones TDLib reales de Premium', () => {
    expect(bridge).toContain('new TdApi.GetPremiumState()');
    expect(bridge).toContain('new TdApi.GetPremiumFeatures(new TdApi.PremiumSourceSettings())');
    expect(bridge).toContain('new TdApi.GetPremiumLimit(type)');
    expect(bridge).toContain('new TdApi.GetPremiumStickers(24)');
    expect(bridge).toContain('new TdApi.GetPremiumGiftPaymentOptions()');
    expect(bridge).toContain('new TdApi.CheckPremiumGiftCode(code)');
    expect(bridge).toContain('new TdApi.ApplyPremiumGiftCode(code)');
  });

  it('lee el estado Premium de la cuenta real y no de un valor inventado', () => {
    expect(bridge).toMatch(/private void premiumState\(Answer a\)\{requireAccount\(\);perform\(new TdApi\.GetUser\(session\.selfId\)/);
    expect(bridge).toContain('object("premium",user.isPremium,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE');
    expect(bridge).toContain('NativeSnapshot.limit(state.state.text,600)');
  });

  it('mantiene el contrato completo aunque GetPremiumState falle', () => {
    expect(bridge).toContain('"state","","paymentOptions",new JSONArray()');
    expect(bridge).toMatch(/failure->\{try\{a\.ok\(result\);\}catch\(Exception ignored\)\{a\.fail\("No se pudo leer el estado Premium\."\);\}\}/);
  });

  it('valida el código de regalo antes de enviarlo a Telegram', () => {
    expect(bridge).toContain('StarsPolicy.giftCode(BridgePolicy.text(p,"code",2048))');
    expect(java('StarsPolicy')).toContain('[A-Za-z0-9_-]{12,64}');
  });

  it('resuelve el nombre del creador con una consulta real y no con el marcador de la caché', () => {
    expect(bridge).toContain('session.perform(new TdApi.GetUser(((TdApi.MessageSenderUser)value.creatorId).userId)');
    expect(bridge).toContain('error->answerGiftCode(value,"",a)');
    expect(bridge).toContain('session.senderName(value.creatorId)');
  });
});

describe('canje del código de regalo', () => {
  it('exige un diálogo nativo de confirmación que explica el uso único', () => {
    expect(bridge).toContain('Dialogs.builder(activity).setTitle("Canjear código de Premium")');
    expect(bridge).toContain('Es de un solo uso: al confirmarlo queda vinculado a tu cuenta');
    expect(bridge).toContain('setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(bridge).toContain('setOnCancelListener(d->a.ok(false))');
  });

  it('no canjea si la cuenta cambió mientras el diálogo estaba abierto', () => {
    const apply = bridge.slice(bridge.indexOf('private void premiumGiftApply('), bridge.indexOf('private static boolean hasCaption('));
    expect(apply).toContain('if(!currentAccount()||session.selfId!=a.owner){a.fail("La cuenta cambió. No se canjeó el código.");return;}');
    expect(apply).toContain('perform(new TdApi.ApplyPremiumGiftCode(code),a,ignored->{schedule();a.ok(true);})');
  });

  it('espera la confirmación humana con el plazo largo del puente', () => {
    const source = ui('bridge.ts');
    const literal = /const USER_DRIVEN = new Set\(\[([\s\S]*?)\]\);/.exec(source)?.[1] ?? '';
    const driven = new Set([...literal.matchAll(/'([^']+)'/g)].map(match => match[1]));
    expect(driven.has('premium.gift.apply')).toBe(true);
    for (const method of READ_ONLY) expect(driven.has(method), method).toBe(false);
    const allowed = allowedMethods();
    for (const method of driven) expect(allowed.has(method), method).toBe(true);
  });
});

describe('frontera de compra de Premium', () => {
  it('no inicia ninguna de las compras que TDLib reserva a Telegram oficial o a los bots', () => {
    const banned = ['GiftPremiumWithStars', 'CanPurchaseFromStore', 'ClickPremiumSubscriptionButton', 'GetPremiumGiveawayPaymentOptions', 'CheckAuthenticationPremiumPurchase', 'SetAuthenticationPremiumPurchaseTransaction'];
    for (const name of readdirSync(javaDir).filter(file => file.endsWith('.java'))) {
      const source = readFileSync(new URL(name, javaDir), 'utf8');
      for (const api of banned) expect(source.includes(`new TdApi.${api}`), `${name}: ${api}`).toBe(false);
    }
  });

  it('explica la frontera en el estado y en los paquetes de regalo', () => {
    expect(bridge).toContain('object("options",items,"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE)');
    expect(java('StarsPolicy')).toContain('Compra Stars o Premium en Telegram oficial y gástalos aquí.');
    expect(panels).toContain('<Notice text={value?.notice}/>');
    expect(panels).toContain('<Notice text={options?.notice}/>');
  });

  it('no filtra el identificador de producto de la tienda ni el enlace de pago', () => {
    const policy = java('StarsPolicy');
    const option = policy.slice(policy.indexOf('static JSONObject premiumPaymentOption('), policy.indexOf('static JSONObject giftCodeInfo('));
    expect(option).not.toContain('storeProductId');
    expect(option).not.toContain('paymentLink');
    expect(option).not.toContain('lastTransactionId');
    expect(option).toContain('option.amount');
  });
});

describe('panel de Premium en la interfaz', () => {
  it('solo pide los métodos Premium que existen en el puente', () => {
    const asked = [...panels.matchAll(/request<[^>]*>\('([^']+)'/g)].map(match => match[1]);
    expect(asked.length).toBeGreaterThan(0);
    for (const method of asked) expect(METHODS, method).toContain(method);
    expect(new Set(asked).size).toBe(METHODS.length);
    expect(panels).not.toContain('run(');
  });

  it('convierte los importes desde la unidad mínima que informa TDLib', () => {
    expect(panels).toContain('money(current.amount,current.currency)');
    expect(panels).toContain('money(plan.amount,plan.currency)');
    expect(panels).toContain('money(option.amount,option.currency)');
    expect(panels).toContain("import { money, starCount } from './starsModel';");
  });

  it('descarta el código inspeccionado si la persona edita el campo', () => {
    expect(panels).toContain("setCode(event.target.value);setInfo(undefined);setDone('')");
    expect(panels).toContain("if(!info||info.used||working)return;");
    expect(panels).toContain("request<boolean>('premium.gift.apply',{code:code.trim()})");
  });

  it('no muestra un fallo de stickers mientras todavía están cargando ni oculta las ventajas', () => {
    expect(panels).toContain("request<PremiumStickers>('premium.stickers').catch(()=>undefined)");
    expect(panels).toContain('{value&&!busy&&!stickers?.stickers.length&&');
    expect(panels).toContain("setBusy(true);setError('');setLive({});");
  });

  it('no ofrece un botón de compra ni de regalo cobrado', () => {
    expect(panels).not.toMatch(/Comprar|Suscribirse|Pagar|premium\.buy|premium\.purchase|payments\./);
    expect(panels).toContain('WRGram no puede cobrarlos');
    expect(panels).toContain('WRGram no inicia el cobro de un regalo');
  });

  it('se abre desde Ajustes como categoría propia y no como consulta suelta en Cuenta', () => {
    expect(settings).toContain("import { PremiumPanel } from './PremiumPanels';");
    expect(settings).toContain("{id:'premium',title:'Telegram Premium'");
    expect(settings).toContain('<PremiumPanel state={state}/>');
    expect(settings).not.toContain('PremiumSettings');
    expect(settings).not.toContain('Estado de tu suscripción');
    expect(settings).toContain('Telegram Premium se consulta y permite canjear códigos de regalo');
  });

  it('no simula Premium en la vista previa sin cuenta', () => {
    const preview = ui('preview.ts');
    expect(preview).not.toContain('premium.');
    expect(panels).toContain('Inicia sesión para consultar tu Telegram Premium real.');
  });

  it('declara los tipos Premium en el contrato compartido', () => {
    const contract = ui('contract.ts');
    for (const name of ['PremiumPlan', 'PremiumStatus', 'PremiumFeature', 'PremiumLimit', 'PremiumFeatures', 'PremiumGiftOption', 'PremiumGiftOptions', 'PremiumGiftCode', 'PremiumStickers']) {
      expect(contract, name).toContain(`export interface ${name} `);
    }
    expect(contract).toContain('paymentOptions:PremiumPlan[]');
  });

  it('no confunde el WRGram Premium de los temas con la suscripción real de Telegram', () => {
    expect(ui('themes.ts')).toContain('un producto propio distinto de Telegram Premium');
    expect(ui('themes.ts')).toContain('no hay cobro');
  });
});

describe('política pública de Stars y Premium', () => {
  const policy = readFileSync(new URL('../../web/public/android/privacy/index.html', import.meta.url), 'utf8');

  it('declara qué se lee, qué se puede gastar y qué no se puede cobrar', () => {
    expect(policy).toContain('Telegram Stars y Telegram Premium');
    expect(policy).toContain('WRGram no vende Stars ni Premium');
    expect(policy).toContain('no inicia cobros con tarjeta ni compras de tienda');
    expect(policy).toContain('canjear un código de regalo de Premium');
    expect(policy).toContain('diálogo nativo de confirmación');
  });

  it('describe la retirada a Fragment y la contraseña que no se guarda', () => {
    expect(policy).toContain('fragment.com');
    expect(policy).toContain('ads.telegram.org');
    expect(policy).toContain('se borra al continuar o cancelar');
    expect(policy).toContain('WRGram no la conserva ni la registra');
  });

  it('no sigue negando los pagos con Stars que la app sí hace', () => {
    expect(policy).not.toContain('No activa compras, cobros ni suscripciones');
    expect(policy).toContain('los pagos con Stars se gestionan en el chat del bot o en Ajustes');
  });
});