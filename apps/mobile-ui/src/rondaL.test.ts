import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { advanceCursor, cursorFor, mergeRequests, requestCountLabel, requestedAgo } from './joinRequestModel';
import type { JoinRequest, JoinRequestPage } from './contract';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');

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

const entry = (userId: string, date: number, name = 'Prueba'): JoinRequest => ({ userId, name, date, bio: '' });

// JoinRequests declara `throws Exception`, así que su cuerpo empieza tras la firma y no tras un `)`.
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
const page = (requests: JoinRequest[], total: number, cursor?: string, next = false): JoinRequestPage => ({ total, requests, cursor, next });

describe('ronda F (C04): la cola de solicitudes de ingreso llega al puente sin escribir nada', () => {
  const bridge = java('NativeBridge');
  const policy = java('JoinRequests');
  const snapshot = java('NativeSnapshot');
  const session = java('TdSession');
  const bridgePolicy = java('BridgePolicy');

  it('la proyección es pura: ni sesión, ni peticiones, ni funciones de Telegram', () => {
    expect(policy).not.toMatch(/TdSession|session\.|perform\(|new TdApi\.Get/);
    expect(method(policy, 'static int count(TdApi.Chat chat)')).toContain('Math.max(0, chat.pendingJoinRequests.totalCount)');
    expect(method(policy, 'static JSONObject row(TdApi.ChatJoinRequest request)')).toContain('"userId", Long.toString(request.userId)');
    // El nombre lo resuelve el puente: esta clase no decide a quién se llama Usuario de Telegram.
    expect(method(policy, 'static JSONObject row(TdApi.ChatJoinRequest request)')).not.toMatch(/name|senderName/);
    expect(method(policy, 'static JSONObject row(TdApi.ChatJoinRequest request)')).toContain('request.userId == 0) return null');
  });

  it('el marcador es opaco, redondo y rechaza cualquier forma extraña', () => {
    const token = method(policy, 'static String token(long userId, int date)');
    expect(token).toContain('Long.toString(userId)');
    const offset = method(policy, 'static TdApi.ChatJoinRequest offset(String value)');
    expect(offset).toContain('if (value == null || value.isEmpty()) return null');
    expect(offset).toContain('split != value.lastIndexOf(');
    expect(offset).toContain('if (userId <= 0 || date <= 0)');
    expect(offset).toMatch(/throw new IllegalArgumentException\("El marcador de solicitudes no es válido\."\)/);
  });

  it('una página solo ofrece marcador cuando viene llena', () => {
    const built = method(policy, 'static JSONObject page(JSONArray rows, int total)');
    expect(built).toContain('values.length() >= PAGE');
    expect(built).toContain('if (values.length() == 0) return data.put("next", false)');
    expect(built).toContain('Math.max(0, total)');
    expect(bridge).toContain('new TdApi.GetChatJoinRequests(chat.id,"","",offset,JoinRequests.PAGE)');
  });

  it('el aviso del chat llega con el snapshot y se mantiene vivo con su actualización', () => {
    expect(snapshot).toContain('int requests=JoinRequests.count(chat);if(requests>0)data.put("requests",requests)');
    expect(session).toContain('TdApi.UpdateChatPendingJoinRequests value = (TdApi.UpdateChatPendingJoinRequests) object;');
    expect(session).toContain('chats.get(value.chatId).pendingJoinRequests = value.pendingJoinRequests; emit("chats")');
  });

  it('el puente declara y enruta los dos métodos', () => {
    expect(bridgePolicy).toContain('"chat.requests","chat.request.answer"');
    expect(bridge).toContain('case "chat.requests":joinRequests(p,a);break;');
    expect(bridge).toContain('case "chat.request.answer":answerJoinRequest(p,a);break;');
  });

  it('listar exige grupo o canal, el permiso de Telegram y un marcador coherente', () => {
    const list = body(bridge, 'private void joinRequests(JSONObject p,Answer a)');
    expect(list).toContain('chat.type instanceof TdApi.ChatTypeBasicGroup||chat.type instanceof TdApi.ChatTypeSupergroup');
    expect(list).toContain('if(!canInviteMembers(actor)){a.fail(');
    expect(list).toContain('a.fail("Vuelve a abrir las solicitudes para continuar.")');
    expect(list).toContain('requestOwner=0;requestChat=0;requestCursorUser=0;requestCursorDate=0;');
    // Resetear el estado antes de la primera página impide heredar el marcador de otro chat.
    expect(list.indexOf('requestOwner=0;requestChat=0')).toBeLessThan(list.indexOf('new TdApi.GetChatMember'));
  });

  it('leer solicitudes nunca escribe en Telegram ni aprueba en lote', () => {
    for (const start of ['private void joinRequests(JSONObject p,Answer a)', 'private void requestJoinPage(TdApi.Chat chat,TdApi.ChatJoinRequest offset,Answer a)', 'private void joinResolve(Answer a,TdApi.Chat chat,JSONArray rows,java.util.List<Long> missing,int index,int total)', 'private void finishJoinPage(Answer a,TdApi.Chat chat,JSONArray rows,int total)']) {
      const code = body(bridge, start);
      for (const forbidden of ['ProcessChatJoinRequest', 'SetChatMemberStatus', 'SendChatMessage', 'DeleteChatMessages', 'ImportChatInvite', 'LeaveChat']) {
        expect(code, `${start} no debe contener ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it('los identificadores sueltos se resuelven con la caché y un máximo de una página', () => {
    const list = body(bridge, 'private void requestJoinPage(TdApi.Chat chat,TdApi.ChatJoinRequest offset,Answer a)');
    expect(list).toContain('if(session.user(request.userId)==null&&!missing.contains(request.userId))missing.add(request.userId)');
    const resolve = body(bridge, 'private void joinResolve(Answer a,TdApi.Chat chat,JSONArray rows,java.util.List<Long> missing,int index,int total)');
    expect(resolve).toContain('if(index>=missing.size()){finishJoinPage');
    expect(resolve).toContain('session.perform(new TdApi.GetUser(id)');
    // GetUser también se acepta cuando falla: una persona desconocida no puede bloquear la cola.
    expect(resolve).toMatch(/ignored->joinResolve\(a,chat,rows,missing,index\+1,total\)/);
    const names = body(bridge, 'private void finishJoinPage(Answer a,TdApi.Chat chat,JSONArray rows,int total)');
    expect(names).toContain('session.senderName(new TdApi.MessageSenderUser(Long.parseLong(row.getString("userId"))))');
    expect(names).toContain('requestOwner=session.selfId;requestChat=chat.id;requestCursorUser=next.userId;requestCursorDate=next.date;');
  });

  it('decidir pasa por la confirmación nativa, revisa cuenta y permiso, y caduca el marcador', () => {
    const answer = body(bridge, 'private void answerJoinRequest(JSONObject p,Answer a)');
    expect(answer).toContain('if(p.has("accountId")&&BridgePolicy.id(p,"accountId")!=session.selfId){a.ok(false);return;}');
    expect(answer).toContain('if(!canInviteMembers(actor)){a.fail(');
    expect(answer).toContain('Dialogs.builder(activity).setTitle(approve?"Aprobar solicitud":"Rechazar solicitud")');
    expect(answer).toContain('new TdApi.ProcessChatJoinRequest(chat.id,userId,approve)');
    expect(answer).toContain('.setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(answer).toContain('.setOnCancelListener(d->a.ok(false)).show()');
    expect(answer).toContain('if(!currentAccount()||session.selfId!=a.owner){a.fail("La cuenta cambió. No se respondió a la solicitud.");return;}');
    expect(answer).toContain('requestOwner=0;requestChat=0;requestCursorUser=0;requestCursorDate=0;');
    expect(answer).toMatch(/requestOwner=0;requestChat=0;requestCursorUser=0;requestCursorDate=0;\s*schedule\(\);/);
    // La cola se abre desde la lista de chats: decidir no depende de qué ventana esté activa.
    expect(answer).not.toMatch(/session\.activeChat/);
    expect(answer).toContain('if(userId==0||userId==session.selfId){a.fail("Esa solicitud no se puede responder desde aquí.")');
  });

  it('el lote de aprobaciones masivas sigue desconectado a propósito', () => {
    expect(bridge).not.toContain('new TdApi.ProcessChatJoinRequests(');
    expect(ui('JoinRequestsPanel.tsx')).not.toMatch(/Aprobar todas|aprobar todas/);
  });

  it('la interfaz expone la cola, la pagina y no finge cobertura en Windows', () => {
    const contract = ui('contract.ts');
    expect(contract).toContain("export interface JoinRequest { userId:string; name:string; date:number; bio:string }");
    expect(contract).toContain('export interface JoinRequestPage { total:number; requests:JoinRequest[]; cursor?:string; next:boolean }');
    expect(contract).toContain('export interface Chat { requests?:number }');
    const app = ui('App.tsx');
    expect(app).toContain('{requests&&<JoinRequestsPanel chat={requests} accountId={state.selfId} close={()=>setRequests(undefined)}/>}');
    expect(app).toContain('label={active.requests?`Solicitudes de ingreso (${active.requests})`');
    expect(app).toContain('!desktop&&(active.requests||active.supergroup===true||active.type==="channel")');
    const panel = ui('JoinRequestsPanel.tsx');
    expect(panel).toContain("request<JoinRequestPage>('chat.requests'");
    expect(panel).toContain("'chat.request.answer', { id: chat.id, userId: item.userId, approve, accountId }");
    // Un fallo de Telegram se muestra con su texto y con reintento explícito; cancelado no es error.
    expect(panel).toContain('if (!done) return;');
    expect(panel).toContain('setError(reason instanceof Error && reason.message ? reason.message');
    expect(ui('join-requests.css')).toContain('.join-row');
  });

  it('la vista de diseño deja ver dos páginas y una decisión', () => {
    const preview = ui('preview.ts');
    expect(preview).toContain("if (method === 'chat.requests')");
    // La ronda BG movió las dos agujas de abajo. «Hay más» ya no se calcula restando lo que queda —ninguna de las
    // dos capas lo sabe—, sino que es la página llena, igual que `JoinRequests.page`; y la frase que aquí se
    // inventaba para una fila ausente se fue con ella: en Windows una fila que ya no está es un `access_hash`
    // perdido, y eso lo dice la ronda AZ con su propia cadena.
    expect(preview).toContain('const next = slice.length >= 20;');
    expect(preview).toContain("if (method === 'chat.request.answer')");
    expect(preview).toContain('if (desktop) throw new Error(SANCTION_REFUSALS.needsHash);');
    expect(preview).not.toContain('Esa solicitud ya no está en la cola.');
    expect(preview).toContain("...(chat.id==='24'?{requests:joinQueue.length}:{})");
  });
});

describe('ronda F: el modelo de la cola no inventa marcadores ni duplica filas', () => {
  it('un marcador solo se ofrece si Telegram anunció más páginas y tiene forma válida', () => {
    expect(cursorFor(page([entry('7', 100)], 1, undefined, false))).toBe('');
    expect(cursorFor(page([entry('7', 100)], 21, '7:100', true))).toBe('7:100');
    expect(cursorFor(page([entry('7', 100)], 21, '7', true))).toBe('');
    expect(cursorFor(page([entry('7', 100)], 21, '7:100:2', true))).toBe('');
    expect(cursorFor(page([entry('7', 100)], 21, '-7:100', true))).toBe('');
    expect(cursorFor(undefined)).toBe('');
    expect(cursorFor(page([entry('7', 100)], 21, '7:100', undefined as never))).toBe('');
  });

  it('un marcador que no avanza se descarta en lugar de repetir la página', () => {
    expect(advanceCursor('7:100', page([entry('8', 90)], 25, '8:90', true))).toBe('8:90');
    expect(advanceCursor('7:100', page([entry('7', 100)], 25, '7:100', true))).toBe('');
    expect(advanceCursor('7:100', page([entry('8', 90)], 25, undefined, false))).toBe('');
  });

  it('las páginas se añaden al final sin duplicar la fila ya vista', () => {
    const first = [entry('9', 300), entry('8', 200)];
    expect(mergeRequests(first, [entry('8', 200), entry('7', 100)])).toEqual([first[0], first[1], entry('7', 100)]);
    expect(mergeRequests(first, [])).toBe(first);
    // La misma persona puede reaparecer con otra solicitud: la clave es identificador y fecha.
    expect(mergeRequests(first, [entry('9', 301)])).toHaveLength(3);
  });

  it('el antedato nunca cuenta hacia atrás con una fecha futura', () => {
    expect(requestedAgo(1000, 1000)).toBe('hace un momento');
    expect(requestedAgo(1000, 1300)).toBe('hace 5 min');
    expect(requestedAgo(1000, 8200)).toBe('hace 2 h');
    expect(requestedAgo(1000, 1000000)).toBe('hace 11 d');
    expect(requestedAgo(1000, 1000 + 40 * 86400)).toBe('hace 1 mes');
    expect(requestedAgo(1000, 1000 + 80 * 86400)).toBe('hace 2 meses');
    expect(requestedAgo(1000, 1000 + 400 * 86400)).toBe('hace 1 año');
    expect(requestedAgo(9999, 1000)).toBe('hace un momento');
    expect(requestedAgo(-5, 1000)).toBe('hace 16 min');
  });

  it('el total aproximado de Telegram se anuncia como aproximado', () => {
    expect(requestCountLabel(41, 20)).toBe('≈ 41 solicitantes pendientes');
    expect(requestCountLabel(1, 1)).toBe('≈ 1 solicitante pendiente');
    expect(requestCountLabel(-3, 0)).toBe('0 solicitudes pendientes');
    expect(requestCountLabel(0, 1)).toBe('1 solicitud pendiente');
  });
});
