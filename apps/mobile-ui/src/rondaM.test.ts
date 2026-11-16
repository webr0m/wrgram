import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DURATIONS, advanceCursor, canEdit, canRevoke, cursorFor, durationFor, emptyForm, formOf, formProblem,
  linkCountLabel, linkSummary, linkTitle, mergeLinks,
} from './inviteLinkModel';
import type { InviteLink, InviteLinkPage } from './contract';

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

const link = (over: Partial<InviteLink> = {}): InviteLink => ({
  link: 'https://t.me/+abcDEF', name: 'Prensa', creator: '1001', created: 1_700_000_000, edited: 0,
  expires: 0, memberLimit: 0, memberCount: 4, pending: 0, approval: false, primary: false, revoked: false, paid: false, ...over,
});
const page = (links: InviteLink[], total: number, cursor?: string, next = false, revoked = false): InviteLinkPage => ({ total, links, revoked, cursor, next });

const WRITE = 'CreateChatInviteLink|EditChatInviteLink|RevokeChatInviteLink|SendMessage|SendChatMessage|DeleteChatMessages|SetChatMemberStatus|ProcessChatJoinRequest|JoinChatByInviteLink';

describe('ronda G (C03): los enlaces de invitación se listan, se ajustan y se revocan con permiso de Telegram', () => {
  const pure = java('InviteLinks');
  const bridge = java('NativeBridge');
  const policy = java('BridgePolicy');
  const panel = ui('InviteLinksPanel.tsx');
  const app = ui('App.tsx');
  const preview = ui('preview.ts');

  it('la proyección vive sola: sin sesión, sin red y sin TDLib improvisado', () => {
    expect(pure).not.toMatch(/TdSession|session\.|perform\(|request\(/);
    expect(pure).toMatch('static final int PAGE = 20');
    expect(pure).toMatch('static final int MAX_MEMBERS = 99_999');
    expect(pure).toMatch('static final int MAX_SPAN = 31_536_000');
  });

  it('una fila sin url no existe y el creador viaja en texto', () => {
    expect(pure).toMatch('link.inviteLink == null || link.inviteLink.isEmpty() || link.inviteLink.length() > MAX_URL) return null');
    expect(pure).toMatch('Long.toString(Math.max(0L, link.creatorUserId))');
    expect(pure).toMatch(/put\("paid", link\.subscriptionPricing != null\)/);
    expect(pure).toMatch(/put\("pending", Math\.max\(0, link\.pendingJoinRequestCount\)\)/);
  });

  it('el marcador se corta en el primer dos puntos, porque la url también lleva', () => {
    expect(pure).toMatch('int split = value.indexOf(');
    expect(pure).toMatch('value.substring(split + 1)');
    expect(pure).toMatch('head.matches("[0-9]{1,10}")');
  });

  it('solo se envían al puente de escritura las formas de enlace de Telegram', () => {
    const validator = method(pure, 'static boolean validUrl');
    expect(validator).toMatch('t\\\\.me|telegram\\\\.me|telegram\\\\.dog');
    expect(validator).toMatch('tg://join');
    expect(validator).toMatch('value.matches(".*\\\\s.*")');
    expect(validator).toMatch('value.length() > MAX_URL');
  });

  it('los ajustes imposibles se rechazan antes de llegar a Telegram', () => {
    expect(pure).toMatch('name.length() > MAX_NAME');
    expect(pure).toMatch('expiresIn > MAX_SPAN');
    expect(pure).toMatch('memberLimit < 0 || memberLimit > MAX_MEMBERS');
    expect(pure).toMatch('approval && memberLimit > 0');
    expect(pure).toMatch('return (int) value');
  });

  it('principal, de suscripción y revocado no son editables', () => {
    expect(method(pure, 'static boolean editable'))
      .toMatch('!link.isPrimary && link.subscriptionPricing == null && !link.isRevoked');
  });

  it('los cuatro métodos están permitidos y despachados', () => {
    for (const name of ['chat.invitelinks', 'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke']) {
      expect(policy, name).toContain(`"${name}"`);
      expect(bridge, name).toContain(`case "${name}"`);
    }
    // El formulario lanza comprobaciones, así que el dispatch tiene que traducir el fallo en aviso.
    expect(bridge).toContain('case "chat.invitelink.create":try{inviteLinkForm(p,a,true);}catch(Exception invalid){a.fail(invalid.getMessage());}break;');
    expect(bridge).toContain('case "chat.invitelink.edit":try{inviteLinkForm(p,a,false);}catch(Exception invalid){a.fail(invalid.getMessage());}break;');
  });

  it('listar enlaces solo existe en grupos y canales y pide permiso en cada viaje', () => {
    const list = method(bridge, 'private void inviteLinks(');
    expect(list).toMatch('TdApi.ChatTypeBasicGroup||chat.type instanceof TdApi.ChatTypeSupergroup');
    expect(list).toMatch('Los enlaces de invitación solo existen en grupos y canales.');
    expect(list).toMatch('new TdApi.GetChatMember(chat.id,new TdApi.MessageSenderUser(session.selfId))');
    expect(list).toMatch('if(!canInviteMembers(actor))');
    expect(list).toMatch('clearLinkCursor();');
    // El cursor solo se acepta si lo dio esta cuenta, en este chat y para esta misma lista.
    expect(list).toMatch('linkOwner!=session.selfId||linkChat!=chat.id||linkRevoked!=revoked');
    expect(list).toMatch('Vuelve a abrir los enlaces para continuar.');
  });

  it('leer la lista no escribe nada en Telegram', () => {
    for (const signature of ['private void inviteLinks(', 'private void loadInviteLinks(', 'private void finishInviteLinks(']) {
      expect(method(bridge, signature), signature).not.toMatch(new RegExp(WRITE));
    }
    expect(bridge).toMatch('new TdApi.GetChatInviteLinks(chat.id,session.selfId,revoked,0,"",InviteLinks.PAGE)');
    expect(bridge).toMatch('InviteLinks.page(rows,result.totalCount,revoked)');
  });

  it('se lista lo propio: WRGram no finge poder leer los enlaces de otros administradores', () => {
    expect(bridge).toMatch('GetChatInviteLinks(chat.id,session.selfId');
    expect(panel).toContain('WRGram solo lista los enlaces creados por esta cuenta');
  });

  it('editar empieza leyendo el enlace real en Telegram', () => {
    const form = method(bridge, 'private void inviteLinkForm(');
    expect(form).toMatch('new TdApi.GetChatInviteLink(chat.id,linkUrl)');
    expect(form).toMatch('!current.inviteLink.equals(linkUrl)');
    expect(form).toMatch('if(!InviteLinks.editable(current))');
    expect(form).toMatch('Los enlaces de suscripción se administran desde Stars.');
    expect(form).toMatch('El enlace principal no admite nombre, caducidad ni límite');
    expect(form).toMatch('current.creatorUserId!=0&&current.creatorUserId!=session.selfId');
    expect(form).toMatch('new TdApi.EditChatInviteLink(chat.id,linkUrl,name,expiration,memberLimit,approval)');
    expect(form).toMatch('new TdApi.CreateChatInviteLink(chat.id,label,expiration,memberLimit,approval)');
  });

  it('toda escritura pasa por una confirmación nativa y la cancelación no es un error', () => {
    const confirm = method(bridge, 'private void confirmLink(');
    expect(confirm).toMatch('Dialogs.builder(activity)');
    expect(confirm).toMatch('.setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(confirm).toMatch('.setOnCancelListener(d->a.ok(false))');
    expect(confirm).toMatch('if(!currentAccount()||session.selfId!=a.owner)');
    // Sin confirmación no hay escritura: las tres llamadas de TDLib viven dentro del callback aceptado.
    expect(bridge).toMatch(/confirmLink\(a,"Crear enlace de invitación",linkDescription\([^)]*\),\(\)->\{\s*perform\(new TdApi\.CreateChatInviteLink/);
    expect(bridge).toMatch(/confirmLink\(a,"Cambiar enlace de invitación",linkDescription\([^)]*\),\(\)->\{\s*perform\(new TdApi\.EditChatInviteLink/);
    expect(bridge).toMatch(/confirmLink\(a,"Revocar enlace de invitación",[\s\S]{0,320}\),\(\)->\{\s*perform\(new TdApi\.RevokeChatInviteLink/);
  });

  it('la cuenta, el permiso y la validez del formulario se comprueban antes de preguntar', () => {
    const form = method(bridge, 'private void inviteLinkForm(');
    expect(form).toMatch('if(p.has("accountId")&&BridgePolicy.id(p,"accountId")!=session.selfId){a.ok(false);return;}');
    expect(form).toMatch('InviteLinks.validUrl(url)');
    expect(form).toMatch('String problem=InviteLinks.problem(name,expiresIn,memberLimit,approval)');
    expect(form).toMatch('if(problem!=null){a.fail(problem);return;}');
    expect(form).toMatch('boolean approval=requiredBool(p,"approval")');
    expect(form).toMatch('if(!canInviteMembers(actor)){a.fail("Telegram no concede a esta cuenta permiso para crear enlaces de invitación.");return;}');
    expect(form).toMatch('permiso para editar sus enlaces de invitación');
  });

  it('revocar avisa del enlace principal y de quien ya entró, y no repite una revocación', () => {
    const revoke = method(bridge, 'private void revokeInviteLink(');
    expect(revoke).toMatch('new TdApi.GetChatInviteLink(chat.id,linkUrl)');
    expect(revoke).toMatch('if(current.isRevoked){a.ok(false);return;}');
    expect(revoke).toMatch('que además es el enlace principal: Telegram creará uno nuevo');
    expect(revoke).toMatch('personas que ya entraron seguirán en el chat');
    expect(revoke).toMatch('if(!canInviteMembers(actor))');
    expect(revoke).toMatch('if(p.has("accountId")&&BridgePolicy.id(p,"accountId")!=session.selfId){a.ok(false);return;}');
  });

  it('tras escribir se invalidan los dos marcadores y se refresca el estado', () => {
    const writes = [method(bridge, 'private void inviteLinkForm('), method(bridge, 'private void revokeInviteLink(')];
    for (const body of writes) {
      expect(body).toMatch('clearLinkCursor();requestOwner=0;requestChat=0;requestCursorUser=0;requestCursorDate=0;');
      expect(body).toMatch('schedule();a.ok(true);');
    }
    expect(bridge).toMatch('private void clearLinkCursor(){linkOwner=0;linkChat=0;linkRevoked=false;linkOffsetDate=0;linkOffsetLink="";}');
  });

  it('el contrato y la interfaz viajan con ids y fechas en texto/número, sin tocar teclados ajenos', () => {
    const contract = ui('contract.ts');
    expect(contract).toMatch(/export interface InviteLink \{ link:string; name:string; creator:string;/);
    expect(contract).toMatch('export interface InviteLinkPage { total:number; links:InviteLink[]; revoked:boolean; cursor?:string; next:boolean }');
    expect(contract).toMatch('export interface LinkForm { name:string; expiresIn:number; memberLimit:number; approval:boolean }');
    expect(panel).toMatch("import { Modal } from './dialogs'");
    expect(panel).not.toMatch(/addEventListener\(/);
  });

  it('la entrada solo se ofrece donde hay transporte', () => {
    expect(app).toContain("{!desktop&&(chat.supergroup===true||chat.type==='group'||chat.type==='channel')&&<MenuItem icon={<KeyRound/>} label=\"Mis enlaces de invitación\"");
    expect(app).toContain('{!desktop&&(active.supergroup===true||active.type==="group"||active.type==="channel")&&<MenuItem icon={<KeyRound/>} label="Mis enlaces de invitación"');
    expect(app).toContain('{links&&<InviteLinksPanel chat={links} accountId={state.selfId} close={()=>setLinks(undefined)}/>}');
  });

  it('la interfaz reinicia la lista tras escribir y nunca reutiliza un marcador viejo', () => {
    expect(panel).toMatch("request<InviteLinkPage>('chat.invitelinks'");
    expect(panel).toMatch('await load(\'\', revoked)');
    expect(panel).toMatch('setCursor(marker ? advanceCursor(marker, page) : cursorFor(page))');
    expect(panel).toMatch('if (!applied) return;');
    expect(panel).toMatch('form.approval ? 0 : form.memberLimit');
    expect(panel).toMatch("{ id: chat.id, accountId, ...params }");
  });

  it('el transporte de diseño reproduce páginas, errores y revocaciones', () => {
    for (const name of ['chat.invitelinks', 'chat.invitelink.create', 'chat.invitelink.edit', 'chat.invitelink.revoke']) {
      expect(preview, name).toContain(`method === '${name}'`);
    }
    expect(preview).toContain('const pool = params.revoked ? revokedLinks : activeLinks;');
    expect(preview).toContain('Telegram ya no reconoce ese enlace en este chat.');
    expect(preview).toContain('revokedLinks.unshift({ ...gone, revoked: true })');
    expect(preview).toContain('if (activeLinks[index].primary) throw new Error(');
    expect(preview).toContain('if (activeLinks[index].paid) throw new Error(');
  });

  it('un marcador solo se ofrece si Telegram anunció más páginas y la url conserva sus dos puntos', () => {
    expect(cursorFor(page([link()], 5))).toBe('');
    expect(cursorFor(page([link()], 5, '1700000000', true))).toBe('');
    expect(cursorFor(page([link()], 5, '1700000000:https://t.me/+abc', true))).toBe('1700000000:https://t.me/+abc');
    expect(advanceCursor('1700000000:https://t.me/+abc', page([link()], 21, '1700000000:https://t.me/+abc', true))).toBe('');
    expect(advanceCursor('1700000000:https://t.me/+abc', page([link()], 21, '1699900000:https://t.me/+def', true))).toBe('1699900000:https://t.me/+def');
  });

  it('paginar no duplica y la lista se mantiene en el orden de Telegram', () => {
    const first = [link({ link: 'https://t.me/+a' }), link({ link: 'https://t.me/+b' })];
    const second = [link({ link: 'https://t.me/+b' }), link({ link: 'https://t.me/+c' })];
    expect(mergeLinks(first, [])).toBe(first);
    expect(mergeLinks(first, second).map(item => item.link)).toEqual(['https://t.me/+a', 'https://t.me/+b', 'https://t.me/+c']);
    expect(mergeLinks(first, [link({ link: 'https://t.me/+a' })])).toBe(first);
  });

  it('editar parte de lo que Telegram dice ahora, porque la edición sustituye todo', () => {
    const day = 86_400;
    expect(durationFor(0, 1_700_000_000)).toBe(0);
    expect(durationFor(1_700_000_000 + 2 * day, 1_700_000_000)).toBe(day);
    expect(durationFor(1_700_000_000 + 8 * day, 1_700_000_000)).toBe(604_800);
    expect(durationFor(1_700_000_000 + 20 * day, 1_700_000_000)).toBe(2_592_000);
    expect(durationFor(1_699_000_000, 1_700_000_000)).toBe(day);
    expect(DURATIONS.some(option => option.seconds === 0)).toBe(true);
    expect(formOf(link({ name: 'Prensa', expires: 1_700_000_000 + 2 * day, memberLimit: 30, approval: false }), 1_700_000_000))
      .toEqual({ name: 'Prensa', expiresIn: day, memberLimit: 30, approval: false });
    expect(formOf(link({ name: '', expires: 0 }), 1_700_000_000)).toEqual({ name: '', expiresIn: 0, memberLimit: 0, approval: false });
    expect(emptyForm()).toEqual({ name: '', expiresIn: 604_800, memberLimit: 0, approval: false });
  });

  it('el formulario avisa de lo mismo que rechazaría el nativo', () => {
    expect(formProblem({ name: 'ok', expiresIn: 86_400, memberLimit: 10, approval: false })).toBe('');
    expect(formProblem({ name: 'x'.repeat(33), expiresIn: 0, memberLimit: 0, approval: false })).toContain('32 caracteres');
    expect(formProblem({ name: '', expiresIn: 40_000_000, memberLimit: 0, approval: false })).toContain('un año');
    expect(formProblem({ name: '', expiresIn: 1.5, memberLimit: 0, approval: false })).toContain('no es válida');
    expect(formProblem({ name: '', expiresIn: 0, memberLimit: 100_000, approval: false })).toContain('99.999');
    expect(formProblem({ name: '', expiresIn: 0, memberLimit: 5, approval: true })).toContain('aprobación');
  });

  it('las acciones solo se ofrecen donde tienen sentido y el resumen dice lo que Telegram sabe', () => {
    expect(canEdit(link())).toBe(true);
    expect(canEdit(link({ primary: true }))).toBe(false);
    expect(canEdit(link({ paid: true }))).toBe(false);
    expect(canEdit(link({ revoked: true }))).toBe(false);
    expect(canRevoke(link({ revoked: true }))).toBe(false);
    expect(linkTitle(link({ name: '', primary: true }))).toBe('Enlace principal');
    expect(linkTitle(link({ name: '', primary: false }))).toBe('Enlace sin nombre');
    const summary = linkSummary(link({ memberCount: 12, memberLimit: 50, expires: 1_700_000_000 + 3 * 86_400, pending: 2, approval: true }), 1_700_000_000);
    expect(summary).toContain('12/50 miembros');
    expect(summary).toContain('exige aprobación');
    expect(summary).toContain('caduca en 3 d');
    expect(summary).toContain('creado hace un momento');
    // El plural se escribe a mano en tres bandas distintas: un «1 meses» se vería como un defecto de traducción.
    expect(linkSummary(link({ expires: 1_700_000_000 + 31 * 86_400 }), 1_700_000_000)).toContain('caduca en 1 mes ·');
    expect(linkSummary(link({ expires: 1_700_000_000 + 95 * 86_400 }), 1_700_000_000)).toContain('caduca en 3 meses');
    expect(linkSummary(link({ expires: 1_699_000_000 }), 1_700_000_000)).toContain('caducado');
    expect(summary).toContain('2 solicitudes pendientes');
    expect(linkSummary(link({ paid: true }), 1_700_100_000)).toContain('enlace de suscripción');
    expect(linkCountLabel(41, 20, false)).toBe('≈ 41 enlaces activos');
    expect(linkCountLabel(1, 1, true)).toBe('≈ 1 enlace revocado');
    expect(linkCountLabel(2, 5, false)).toBe('≈ 2 enlaces activos · 5 cargados');
    expect(linkCountLabel(0, 0, false)).toBe('0 enlaces activos');
    expect(linkCountLabel(0, 1, false)).toBe('1 enlace activo');
  });
});
