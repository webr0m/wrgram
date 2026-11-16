import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noticeActions, noticeCopy, registeredLabel, requestAgo, safetyDigest, signalList } from './safetySignals';
import type { SafetyInfo, SafetyNotice, SafetySignal } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

// Cuerpo de un método cuya firma puede terminar en `throws Exception`.
const method = (source: string, signature: string) => {
  const open = source.indexOf(signature);
  if (open < 0) throw new Error(`No se encuentra ${signature}`);
  const brace = source.indexOf('{', open + signature.length);
  if (brace < 0) throw new Error(`Sin cuerpo tras ${signature}`);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(brace, i + 1);
  }
  throw new Error(`Llave sin cerrar tras ${signature}`);
};

const WRITE = 'RemoveChatActionBar|ReportChat|SendMessage|SendChatMessage|DeleteChatMessages|SetChatMemberStatus|ProcessChatJoinRequest|CreateChatInviteLink|EditChatInviteLink|RevokeChatInviteLink|LeaveChat|JoinChatByInviteLink';

const signal = (id: string, tone: SafetySignal['tone'], value?: string): SafetySignal => ({ id, tone, value });
const notice = (over: Partial<SafetyNotice> = {}): SafetyNotice => ({ kind: 'unknown', tone: 'warn', ...over });
const info = (over: Partial<SafetyInfo> = {}): SafetyInfo => ({ id: '21', signals: [], canReport: true, dismissible: true, ...over });

describe('ronda H (S05): Telegram pone las señales y WRGram solo las traduce', () => {
  const pure = java('SafetySignals');
  const bridge = java('NativeBridge');
  const policy = java('BridgePolicy');
  const session = java('TdSession');
  const snapshot = java('NativeSnapshot');
  const panel = ui('SafetyNotice.tsx');
  const app = ui('App.tsx');
  const preview = ui('preview.ts');

  it('la proyección vive sola: ni sesión, ni red, ni TDLib improvisado', () => {
    expect(pure).not.toMatch(/TdSession|session\.|perform\(/);
    expect(pure).toMatch('static final int MAX_SIGNALS = 12');
    expect(pure).toMatch('static final int MAX_TITLE = 80');
    expect(pure).toMatch('static final int MAX_REASON = 140');
  });

  it('sin barra de Telegram no hay aviso, y una barra desconocida tampoco se adivina', () => {
    const body = method(pure, 'static JSONObject notice');
    expect(body).toMatch('if (chat == null || chat.actionBar == null) return null;');
    expect(body).toMatch(/return null;\s*\}\s*$/);
    expect(body).toMatch('instanceof TdApi.ChatActionBarJoinRequest');
    expect(body).toMatch('limit(value.title, MAX_TITLE)');
    expect(body).toMatch('Math.max(0, value.requestDate)');
  });

  it('el aviso no decide permisos: la denuncia pertenece al chat', () => {
    const body = method(pure, 'static JSONObject notice');
    expect(body).not.toMatch('canReport');
    expect(body).toMatch('put("canUnarchive"');
  });

  it('solo se pueden descartar las dos barras de aviso, nunca la de solicitud pendiente', () => {
    const body = method(pure, 'static boolean dismissible(TdApi.ChatActionBar bar)');
    expect(body).toMatch('TdApi.ChatActionBarReportSpam');
    expect(body).toMatch('TdApi.ChatActionBarReportAddBlock');
    expect(body).not.toMatch('JoinRequest');
  });

  it('la fecha de registro solo existe si Telegram mandó un mes real', () => {
    const body = method(pure, 'static String registered');
    expect(body).toMatch('info.registrationYear < 1970');
    expect(body).toMatch('info.registrationMonth < 1 || info.registrationMonth > 12');
    expect(body).toMatch('"%04d-%02d"');
  });

  it('las señales van de lo más grave a lo más informativo y se cortan en doce', () => {
    const body = method(pure, 'static JSONArray signals');
    expect(body).toMatch('if (status.isScam) add(list, "scam", "bad")');
    expect(body.indexOf('"scam"')).toBeLessThan(body.indexOf('"verified"'));
    expect(body.indexOf('"restricted"')).toBeLessThan(body.indexOf('"notContact"'));
    expect(body.indexOf('"notContact"')).toBeLessThan(body.indexOf('"commonGroups"'));
    expect(method(pure, 'private static void add(JSONArray list, String id, String tone, String value)'))
      .toMatch('if (list.length() >= MAX_SIGNALS) return;');
    expect(body).not.toMatch(/reputation|confidence|score/);
  });

  it('un contacto no despierta sospecha y un motivo de restricción se cita recortado', () => {
    const body = method(pure, 'static JSONArray signals');
    expect(body).toMatch('if (!user.isContact && !user.isMutualContact)');
    expect(body).toMatch('!restriction.restrictionReason.isBlank()');
    expect(body).toMatch('limit(restriction.restrictionReason.trim(), MAX_REASON)');
    expect(body).toMatch('user.restrictsNewChats');
    expect(body).toMatch('fullInfo.usesUnofficialApp');
  });

  it('la barra llega a la interfaz en cuanto Telegram la cambia, sin reabrir el chat', () => {
    const handler = session.match(/else if \(object instanceof TdApi\.UpdateChatActionBar\)[\s\S]*?emit\("chats"\);/);
    expect(handler).toBeTruthy();
    expect(handler![0]).toMatch('chats.get(value.chatId).actionBar = value.actionBar');
    expect(snapshot).toMatch('JSONObject notice=SafetySignals.notice(chat);if(notice!=null)data.put("notice",notice);');
  });

  it('leer señales no escribe nada en Telegram', () => {
    for (const signature of ['private void safety(', 'private void safetyPeer(', 'private void respondSafety(']) {
      expect(method(bridge, signature)).not.toMatch(new RegExp(WRITE));
    }
    expect(method(bridge, 'private void safety(')).toMatch('a.fail("Los chats secretos ya cifran de extremo a extremo');
    expect(method(bridge, 'private void safety(')).toMatch('BridgePolicy.id(p,"accountId")!=session.selfId');
  });

  it('el recorrido de lectura está acotado: un viaje al par y uno al perfil completo', () => {
    const body = method(bridge, 'private void safety(');
    expect(body).toMatch('new TdApi.GetUser(userId)');
    expect(body).toMatch('new TdApi.GetSupergroup(groupId)');
    expect(body.match(/new TdApi\.Get/g)!.length).toBeLessThanOrEqual(3);
    expect(method(bridge, 'private void safetyPeer(')).toMatch('new TdApi.GetUserFullInfo(user.id)');
  });

  it('si el perfil completo falla se responden las señales que Telegram ya dio', () => {
    const body = method(bridge, 'private void safetyPeer(');
    expect(body).toMatch('ignored->respondSafety(a,chat,user,null,null)');
    expect(body).toMatch('a.owner!=session.selfId');
  });

  it('descartar el aviso pasa por el diálogo nativo y no toca otra cosa', () => {
    const dismiss = method(bridge, 'private void dismissSafety(');
    expect(dismiss).toMatch('a.ok(false)');
    expect(dismiss).toMatch('SafetySignals.dismissible(chat)');
    expect(dismiss).toMatch('new TdApi.RemoveChatActionBar(chat.id)');
    expect(dismiss).toMatch('schedule();a.ok(true)');
    expect(dismiss).not.toMatch(new RegExp(WRITE.replace('RemoveChatActionBar|', '')));
    const dialog = method(bridge, 'private void confirmSafety(');
    expect(dialog).toMatch('setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(dialog).toMatch('setOnCancelListener(d->a.ok(false))');
    expect(dialog).toMatch('session.selfId!=a.owner');
    expect(dialog).toMatch('No se descartó ningún aviso');
  });

  it('el puente relee la barra antes de escribir: pudo cambiar mientras se confirmaba', () => {
    expect(bridge).toMatch('if(!SafetySignals.dismissible(session.chat(chat.id))){a.fail("Telegram ya no muestra ningún aviso en este chat.");return;}');
  });

  it('los dos métodos están permitidos y despachados', () => {
    expect(policy).toMatch('"chat.safety","chat.safety.dismiss"');
    expect(bridge).toMatch('case "chat.safety":safety(p,a);break;');
    expect(bridge).toMatch('case "chat.safety.dismiss":dismissSafety(p,a);break;');
  });

  it('la barra solo aparece cuando Telegram la pidió y deriva al panel', () => {
    expect(panel).toMatch('const notice = chat.notice;');
    expect(panel).toMatch('if (!notice) return null;');
    expect(panel).toMatch('noticeCopy(notice)');
    expect(panel).not.toMatch(/Telegram (permite|marca)/);
    expect(panel).toMatch("role=\"status\"");
  });

  it('el aviso se escribe una sola vez: el componente no añade su propia traducción', () => {
    // El mes de registro y la antigüedad de la solicitud ya van dentro de `noticeCopy`; repetirlos
    // aquí producía «…registró en marzo de 2024.» seguido de un suelto «marzo de 2024».
    expect(panel).not.toMatch(/registeredLabel|requestAgo/);
    expect(panel).toMatch('<p dir="auto">{noticeCopy(notice)}</p>');
    expect(panel).not.toMatch(/<small>\{details\}/);
  });

  it('el panel lee una vez por chat y solo escribe al descartar', () => {
    expect(panel).toMatch("request<SafetyInfo>('chat.safety', { id: chat.id, accountId: account.current })");
    expect(panel).toMatch("request<boolean>('chat.safety.dismiss', { id: chat.id, accountId: account.current })");
    expect(panel).toMatch('if (!alive.current || !applied) return;');
    expect(panel).toMatch('snapshot().selfId !== account.current');
    expect(panel).toMatch('disabled={working}');
    expect(panel.match(/await request</g)!.length).toBe(2);
    expect(panel).toMatch('const canReport = info?.canReport === true && chat.type !== \'secret\'');
    // Descartar deja el chat sin aviso: una vez leída la respuesta manda Telegram, no el objeto abierto.
    expect(panel).toMatch('const notice: SafetyNotice | undefined = info ? info.notice : chat.notice;');
    expect(panel).toMatch('{!notice && info && !busy && <p className="safety-quiet">');
  });

  it('la barra y el menú cuelgan de la conversación, sin oferta en Windows ni en chats secretos', () => {
    expect(app).toMatch('{active.notice&&<SafetyBar chat={active} open={()=>setSafety(active)}/>}');
    expect(app).toMatch("{!desktop&&chat.type!=='secret'&&<MenuItem icon={<ShieldQuestion/>} label=\"Señales de seguridad\"");
    expect(app).toMatch('{!desktop&&active.type!=="secret"&&<MenuItem icon={<ShieldQuestion/>} label="Señales de seguridad"');
    expect(app).toMatch('<SafetyPanel chat={safety} accountId={state.selfId} run={run} close={()=>setSafety(undefined)}/>');
  });

  it('la maqueta enseña las cuatro barras y el descarte obedece a Telegram', () => {
    expect(preview).toMatch("kind: 'unknown', tone: 'warn', registered: '2024-03'");
    expect(preview).toMatch("kind: 'spam', tone: 'warn', canUnarchive: true");
    expect(preview).toMatch("kind: 'invite', tone: 'info'");
    expect(preview).toMatch("kind: 'join', tone: 'info'");
    expect(preview).toMatch("if (!data?.dismissible) throw new Error('Telegram ya no muestra ningún aviso en este chat.')");
    expect(preview).toMatch("if (String(params.accountId ?? '') !== state.selfId) return false");
    expect(preview).toMatch('notice:noticeFor(String(id))');
  });
});

describe('el modelo de señales no traduce lo que Telegram no dijo', () => {
  it('una señal desconocida se descarta antes que inventarle una frase', () => {
    expect(signalList([signal('scam', 'bad'), signal('futuro', 'bad')])).toHaveLength(1);
    expect(signalList(undefined)).toEqual([]);
    expect(signalList([signal('scam', 'bad'), signal('scam', 'bad')])).toHaveLength(1);
  });

  it('el orden pone lo grave delante, aunque Telegram lo mande al revés', () => {
    const list = signalList([signal('commonGroups', 'info', '4'), signal('verified', 'good'), signal('notContact', 'warn'), signal('fake', 'bad')]);
    expect(list.map(item => item.id)).toEqual(['fake', 'notContact', 'verified', 'commonGroups']);
    expect(list[3].text).toBe('Tienen 4 grupos y canales en común.');
    expect(list[1].text).toBe('No está entre tus contactos de Telegram.');
  });

  it('cada barra se describe con su hecho, sin adjetivos', () => {
    expect(noticeCopy(notice())).toBe('Esta cuenta no está entre tus contactos de Telegram.');
    expect(noticeCopy(notice({ registered: '2024-03' }))).toBe('Esta cuenta no está entre tus contactos; Telegram la registró en marzo de 2024.');
    expect(noticeCopy(notice({ registered: '2024-13' }))).toBe('Esta cuenta no está entre tus contactos de Telegram.');
    expect(noticeCopy(notice({ kind: 'spam' }))).toBe('Telegram permite denunciar este chat si te parece spam. La denuncia llega a Telegram, no a la otra persona.');
    expect(noticeCopy(notice({ kind: 'phone' }))).toContain('si tú lo decides');
    expect(noticeCopy(notice({ kind: 'join', title: 'WRGram', date: 1_700_000_000 }))).toContain('«WRGram»');
    expect(noticeCopy(notice({ kind: 'join', title: '', channel: true }))).toContain('el canal');
    expect(noticeCopy(notice({ kind: 'join', title: '', channel: false }))).toContain('el grupo');
    expect(noticeCopy(notice({ kind: 'inventado' as SafetyNotice['kind'] }))).toBe('');
  });

  it('el registro y la antigüedad se leen solo si son datos válidos', () => {
    expect(registeredLabel('2024-01')).toBe('enero de 2024');
    expect(registeredLabel('2024-12')).toBe('diciembre de 2024');
    for (const bad of ['', '2024-00', '2024-13', '24-03', '2024-3', '2024_03']) expect(registeredLabel(bad as string)).toBe('');
    expect(registeredLabel(undefined)).toBe('');
    const now = 2_000_000_000;
    expect(requestAgo(undefined, now)).toBe('');
    expect(requestAgo(0, now)).toBe('');
    expect(requestAgo(now - 120, now)).toBe(' hace menos de una hora');
    expect(requestAgo(now - 7_200, now)).toBe(' hace 2 h');
    expect(requestAgo(now - 3 * 86_400, now)).toBe(' hace 3 d');
    expect(requestAgo(now - 90 * 86_400, now)).toBe(' hace 3 meses');
    expect(requestAgo(now + 500, now)).toBe(' hace menos de una hora');
  });

  it('las acciones de la barra no se ofrecen en una barra informativa', () => {
    expect(noticeActions(notice(), true)).toEqual({ dismiss: true, unarchive: false });
    expect(noticeActions(notice({ kind: 'unknown', canUnarchive: true }), true).unarchive).toBe(true);
    expect(noticeActions(notice({ kind: 'invite' }), true)).toEqual({ dismiss: false, unarchive: false });
    expect(noticeActions(notice({ kind: 'join' }), true)).toEqual({ dismiss: false, unarchive: false });
    expect(noticeActions(undefined, true)).toEqual({ dismiss: false, unarchive: false });
    expect(noticeActions(notice(), undefined)).toEqual({ dismiss: false, unarchive: false });
  });

  it('el resumen cuenta señales sin prometer seguridad', () => {
    expect(safetyDigest(info())).toBe('Telegram no ha añadido ninguna señal sobre este chat.');
    expect(safetyDigest(info({ signals: [signal('verified', 'good')] }))).toBe('1 señal de Telegram');
    expect(safetyDigest(info({ signals: [signal('scam', 'bad'), signal('notContact', 'warn'), signal('verified', 'good')] })))
      .toBe('3 señales de Telegram · 2 para revisar');
    expect(safetyDigest(info({ signals: [signal('futuro', 'bad')] }))).toBe('Telegram no ha añadido ninguna señal sobre este chat.');
  });
});
