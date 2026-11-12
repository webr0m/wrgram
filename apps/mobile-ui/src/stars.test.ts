import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

const bridge = java('NativeBridge');
const policy = java('StarsPolicy');
const session = java('TdSession');
const snapshot = java('NativeSnapshot');
const panels = ui('StarsPanels.tsx');

const METHODS = ['stars.transactions', 'stars.subscriptions', 'stars.subscription.cancel', 'stars.subscription.resume', 'stars.subscription.reuse', 'stars.options', 'stars.revenue', 'stars.ads.url', 'stars.withdraw'];
const allowedMethods = () => {
  const found = new Set<string>();
  for (const line of java('BridgePolicy').split(/\r?\n/)) {
    if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
    for (const match of line.matchAll(/"([^"]+)"/g)) found.add(match[1]);
  }
  return found;
};

describe('cartera de Stars en el puente nativo', () => {
  it('registra los nueve métodos en la allowlist y empareja cada uno con su manejador', () => {
    const allowed = allowedMethods();
    for (const method of METHODS) {
      expect(allowed.has(method), method).toBe(true);
      expect(new RegExp(`case "${method.replace(/\./g, '\\.')}":[a-zA-Z]+\\((p,)?a\\);break;`).test(bridge), method).toBe(true);
    }
  });

  it('llama a las funciones TDLib reales de la cartera, no a un sustituto', () => {
    expect(bridge).toMatch(/new TdApi\.GetStarTransactions\(owner,subscription,direction,offset,limit\)/);
    expect(bridge).toMatch(/new TdApi\.GetStarSubscriptions\(expiring,offset\)/);
    expect(bridge).toContain('new TdApi.EditStarSubscription(id,true)');
    expect(bridge).toContain('new TdApi.EditStarSubscription(id,false)');
    expect(bridge).toContain('new TdApi.ReuseStarSubscription(id)');
    expect(bridge).toContain('new TdApi.GetStarPaymentOptions()');
    expect(bridge).toContain('new TdApi.GetStarRevenueStatistics(owner,false)');
    expect(bridge).toContain('new TdApi.GetStarAdAccountUrl(owner)');
    expect(bridge).toContain('new TdApi.GetStarWithdrawalUrl(owner,amount,secret)');
  });

  it('respeta el límite duro de TDLib y Play: nada de cobros con dinero real desde la tienda', () => {
    const dir = new URL('../../mobile/android/app/src/main/java/cc/webrom/wrgram/', import.meta.url);
    const sources = readdirSync(dir).filter(name => name.endsWith('.java')).map(name => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));
    expect(sources.length).toBeGreaterThan(10);
    for (const banned of ['new TdApi.CanPurchaseFromStore', 'new TdApi.GiftPremiumWithStars', 'new TdApi.RefundStarPayment']) {
      for (const source of sources) expect(source.text.includes(banned), `${source.name}: ${banned}`).toBe(false);
    }
    // A channel subscription spends existing Stars. Any other Telegram invoice purpose remains excluded.
    for (const source of sources) {
      const withoutJoin=source.text.replaceAll('new TdApi.InputInvoiceTelegram(new TdApi.TelegramPaymentPurposeJoinChat(link.inviteLink))','');
      expect(withoutJoin).not.toMatch(/new\s+TdApi\.InputInvoiceTelegram\s*\(/);
    }
    expect(policy).toContain('STORE_PURCHASE_UNAVAILABLE');
    expect(policy).toMatch(/InputInvoiceTelegram[\s\S]{0,400}CanPurchaseFromStore/);
    expect(bridge).toContain('"notice",StarsPolicy.STORE_PURCHASE_UNAVAILABLE');
    expect(panels).toContain('{value.notice}');
    expect(panels).not.toMatch(/stars\.(buy|purchase|topup\.pay)/);
  });

  it('lee el identificador de suscripción desde la clave que la interfaz envía', () => {
    expect(policy).toContain('static String subscriptionId(JSONObject params,String key)');
    expect(policy).toContain('String value=params.optString(key,"");');
    expect(bridge).toContain('StarsPolicy.subscriptionId(params,"subscriptionId")');
    for (const method of ['starsSubscriptionCancel', 'starsSubscriptionResume', 'starsSubscriptionReuse']) {
      const body = bridge.split(`private void ${method}(`)[1]?.split('\n    private void ')[0] || '';
      expect(body, method).toContain('StarsPolicy.subscriptionId(params,"id")');
    }
    expect(panels).toContain("request<boolean>(method,{id:item.id})");
  });

  it('confirma en un diálogo nativo antes de tocar el saldo y avisa de lo que no se reembolsa', () => {
    for (const [method, title] of [['starsSubscriptionCancel', 'Cancelar suscripción de Stars'], ['starsSubscriptionResume', 'Reanudar renovación'], ['starsSubscriptionReuse', 'Volver a unirte al canal']]) {
      const body = bridge.split(`private void ${method}(`)[1]?.split('\n    private void ')[0] || '';
      expect(body, method).toContain('Dialogs.builder(activity)');
      expect(body, method).toContain(`setTitle("${title}")`);
      expect(body, method).toContain('setOnCancelListener(d->answer.ok(false))');
      expect(body, method).toContain('session.selfId!=answer.owner');
    }
    expect(bridge).toContain('el periodo en curso no se reembolsa');
    expect(bridge).toContain('No se cobra un importe nuevo ni se reinicia el periodo.');
    expect(bridge).toContain('Si el saldo no alcanza, Telegram la cancelará.');
  });

  it('no guarda ni autocompleta la contraseña de la retirada a Fragment', () => {
    const body = bridge.split('private void starsWithdraw(')[1]?.split('\n    private void ')[0] || '';
    expect(body).toContain('password.setSaveEnabled(false)');
    expect(body).toContain('IMPORTANT_FOR_AUTOFILL_NO');
    expect(body).toContain('TYPE_TEXT_VARIATION_PASSWORD');
    expect(body).toContain('String secret=password.getText().toString();password.setText("");');
    expect(body).toContain('setNegativeButton("Cancelar",(d,w)->{password.setText("");answer.ok(false);})');
    expect(body).toContain('setOnCancelListener(ignored->{password.setText("");answer.ok(false);})');
    expect(body).not.toMatch(/putString\([^)]*secret/);
    expect(body).not.toContain('Log.');
  });

  it('limita la retirada a un canal o a la cuenta y a importes enteros acotados', () => {
    const owner = bridge.split('private TdApi.MessageSender starsOwner(')[1]?.split('\n    private void ')[0] || '';
    expect(owner).toContain('Solo tu cuenta o un canal pueden tener cartera de Stars.');
    expect(owner).toContain('isChannel');
    expect(bridge).toContain('StarsPolicy.stars(params,"amount",StarsPolicy.MAX_STARS)');
    expect(policy).toContain('static final long MAX_STARS');
    expect(panels).toContain('Number.isInteger(parsed)&&parsed>=1&&parsed<=available');
    expect(panels).toContain('!value.withdrawalEnabled||value.nextWithdrawalIn>0');
  });

  it('refleja el saldo real que llega por actualización de TDLib y lo limpia al cerrar sesión', () => {
    expect(session).toMatch(/object instanceof TdApi\.UpdateOwnedStarCount/);
    expect(session).toContain('emit("stars")');
    expect(session).toContain('void rememberStars(TdApi.StarAmount value)');
    expect(session).toContain('starAmount = null;');
    expect(snapshot).toContain('JSONObject wallet()throws Exception');
    expect(snapshot).toContain('.put("premium",self!=null&&self.isPremium)');
    expect(snapshot).toContain('data.put("wallet",wallet())');
    expect(bridge).toContain('"wallet",object("stars",0,"nanostars",0,"premium",false))');
    expect(bridge).toContain('session.rememberStars(value.starAmount)');
  });
});

describe('cartera de Stars en la interfaz', () => {
  it('cuelga la cartera de Ajustes y exige una sesión real antes de mostrar datos', () => {
    const settings = ui('SettingsPage.tsx');
    expect(settings).toContain("import { StarsWallet } from './StarsPanels';");
    expect(settings).toContain('<StarsWallet state={state}/>');
    expect(settings).toContain("{id:'stars',title:'Telegram Stars'");
    expect(panels).toContain('if(!state.ready)return');
    expect(panels).toContain('Inicia sesión para consultar tu cartera real de Telegram Stars.');
    expect(panels).toContain('starCount(wallet?.stars||0)');
  });

  it('da cinco minutos a las acciones que abren un diálogo nativo o un enlace externo', () => {
    const literal = ui('bridge.ts').split('const USER_DRIVEN = new Set([')[1].split(']);')[0];
    const driven = new Set([...literal.matchAll(/'([^']+)'/g)].map(match => match[1]));
    for (const method of ['stars.subscription.cancel', 'stars.subscription.resume', 'stars.subscription.reuse', 'stars.withdraw', 'stars.ads.url', 'link.open']) {
      expect(driven.has(method), method).toBe(true);
    }
    for (const method of ['stars.transactions', 'stars.subscriptions', 'stars.options', 'stars.revenue']) expect(driven.has(method), method).toBe(false);
  });

  it('muestra el error real de Telegram dentro del panel en vez de tragárselo', () => {
    expect(panels).toMatch(/import \{[^}]*\brequest\b[^}]*\} from '\.\/bridge';/);
    expect(panels).toContain('error instanceof Error?error.message:fallback');
    expect(panels).toContain('role="alert"');
    expect(panels).not.toMatch(/\brun[<(]/);
  });

  it('no inventa movimientos financieros en la vista sintética', () => {
    const preview = ui('preview.ts');
    expect(preview).not.toContain('stars.');
    expect(preview).toContain('Vista sintética: esta acción requiere una cuenta real en Android.');
    expect(preview).not.toMatch(/wallet\s*:/);
  });

  it('avisa en el diálogo de factura del saldo y del cargo recurrente antes de confirmar', () => {
    const app = ui('App.tsx');
    expect(app).toContain('Saldo de tu cuenta: ');
    expect(app).toContain('Este importe supera tu saldo');
    expect(app).toContain('Es una suscripción recurrente');
    expect(app).toContain('starPeriod(payment.period)');
    expect(app).toContain('Ajustes · Telegram Stars · Suscripciones');
    expect(ui('contract.ts')).toContain('subscription:boolean;period:number;balance:number}');
  });

  it('no ofrece reembolsar ni volver a unirte cuando TDLib no lo permite', () => {
    expect(panels).toContain('WRGram no puede reembolsar operaciones');
    expect(panels).toContain('subscriptionActions(item,now)');
    expect(ui('starsModel.ts')).toContain("if (item.kind === 'channel' && item.canReuse) actions.push('reuse');");
    expect(ui('starsModel.ts')).toContain("if (expired && item.kind === 'channel' && item.inviteLink) actions.push('renew');");
  });

  it('enlaza el botón de la factura con el mensaje que se ve, sin eventos globales', () => {
    const app = ui('App.tsx');
    expect(app).toContain('payStars={()=>startStarsPayment(message)}');
    expect(app).not.toContain('wrgram:pay-stars');
    const content = ui('MessageContent.tsx');
    expect(content).toContain('payStars:()=>void');
    expect(content).not.toContain('dispatchEvent');
  });

  it('aplica la reacción de pago en Telegram y la deja visible en la burbuja', () => {
    expect(bridge).toContain('new TdApi.CommitPendingPaidMessageReactions(message.chatId,message.id)');
    const app = ui('App.tsx');
    expect(app).toContain("if(reaction.kind==='paid'){paidReaction(message);return;}");
    expect(app).toContain("run('message.react.paid',{id:message.id,count:String(count)})");
  });

  it('no gasta Stars si la cuenta cambia mientras el diálogo de pago está abierto', () => {
    const dialog = bridge.slice(bridge.indexOf('private void reactPaid'), bridge.indexOf('private void reactPaid') + 1800);
    expect(dialog).toContain('long ownerId=session.selfId;');
    expect(dialog).toContain('if(!currentAccount()||session.selfId!=ownerId)');
    expect(dialog).toContain('new TdApi.AddPendingPaidMessageReaction(message.chatId,message.id,count,null)');
  });
});