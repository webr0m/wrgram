import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Message } from './contract';
import { chipTitle, citedMessage, draftPayload, keepsText, keptReply, lostReplyNotice, remoteReply, sameDraft, unloadedCitation } from './draftReply';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const java = (name: string) => source(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const bridge = java('NativeBridge');
const pure = java('Drafts');
const app = source('./App.tsx');
const model = source('./draftReply.ts');
const preview = source('./preview.ts');
const contract = source('./contract.ts');

/** El cuerpo de un método del puente o de la interfaz, desde su firma hasta la llave que lo cierra. */
function body(name: string, from = bridge): string {
  const start = from.search(new RegExp(`^[ \\t]*(?:(?:private|public|protected)[^{;\\n]*?|function[ \\t]+)\\b${name}\\(`, 'm'));
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`${name} no cierra`);
}

const message = (over: Partial<Message> = {}): Message => ({ id: '77', chatId: '11', sender: 'María Fernández', text: 'hola', date: 1, outgoing: false, status: '', edited: false, reactions: [], ...over });

/** Un trozo de fuente desde un marcador, para pinar una región sin leer el fichero entero. */
function region(text: string, marker: string, length: number): string {
  const start = text.indexOf(marker);
  expect(start, marker).toBeGreaterThan(-1);
  return text.slice(start, start + length);
}

const NOTE = 'Telegram no aceptó la respuesta citada. El borrador se guardó sin ella.';

describe('ronda L (M01): el borrador se guarda con su respuesta y su formato', () => {
  it('la clase pura no escribe en Telegram ni toca la sesión', () => {
    expect(pure).not.toMatch(/session\.|perform\(|Answer\s+\w|Dialogs/);
    for (const write of ['SetChatDraftMessage', 'GetMessage', 'SendMessage']) expect(pure, write).not.toContain(`new TdApi.${write}`);
  });

  it('el puente ya no construye el DraftMessage a mano', () => {
    expect(bridge).not.toContain('new TdApi.DraftMessage(null,0,new TdApi.DraftMessageContentText');
    expect(body('saveDraft')).toContain('TdApi.DraftMessage draft=Drafts.build(text,entities,reply)');
    expect(body('saveDraft')).toContain('Drafts.build(text,entities,0L)');
    expect(body('setDraft')).toMatch(/if\(p\.has\("reply"\)\)\{try\{reply=BridgePolicy\.id\(p,"reply"\);\}catch\(Exception invalid\)\{a\.fail\("La respuesta del borrador no corresponde a un mensaje de esta conversación."\);return;\}\}/);
    // El id inválido se responde en español: `throw` lo convertiría en el aviso genérico del puente.
    expect(body('setDraft')).not.toMatch(/reply=BridgePolicy\.id\(p,"reply"\);(?!\})/);
    expect(body('setDraft')).toContain('text.trim().isEmpty()?0L:reply');
  });

  it('sin texto no hay borrador y el reintento pierde solo la cita', () => {
    const save = body('saveDraft');
    expect(save).toContain('if(reply==0L){a.fail(failure==null?"No se pudo guardar el borrador en Telegram.":failure);return;}');
    expect(save).toContain(`object("reply","","note","${NOTE}")`);
    expect(save).toContain('result->a.ok(object("reply",Drafts.replyId(draft)))');
    expect(pure).toMatch(/if \(text == null \|\| text\.trim\(\)\.isEmpty\(\)\) return null;/);
  });

  it('guardar un borrador sigue sin abrir ningún diálogo', () => {
    expect(body('setDraft')).not.toContain('Dialogs');
    expect(body('saveDraft')).not.toContain('Dialogs');
    // ...así que no necesita plazo de persona: sigue siendo una escritura que responde sola.
    expect(bridge).toContain('case "draft.set":setDraft(p,a);break;');
    expect(java('BridgePolicy')).toContain('"draft.set"');
  });

  it('la cita del borrador llega al snapshot en texto, en chat y en tema', () => {
    expect(java('NativeSnapshot')).toContain('String cited=Drafts.replyId(chat.draftMessage);if(!cited.isEmpty())data.put("draftReply",cited);');
    expect(java('TdSession')).toContain('activeTopicDraftReply=Drafts.replyId(topic.draftMessage);');
    expect(java('TdSession')).toContain('if(!cited.isEmpty())value.put("draftReply",cited)');
    expect(pure).toMatch(/return id == 0L \? "" : Long\.toString\(id\);/);
    expect(contract).toContain('draft?:string; draftEntities?:TextEntity[]; draftReply?:string;');
    expect(contract).toMatch(/topic\?: \{[^}]*draftReply\?:string\}/);
  });

  it('solo se reproduce la variante de respuesta que TDLib admite en borradores', () => {
    expect(pure).toContain('new TdApi.InputMessageReplyToMessage(replyTo, null, 0, "")');
    expect(pure).toMatch(/if \(draft == null \|\| !\(draft\.replyTo instanceof TdApi\.InputMessageReplyToMessage\)\) return 0L;/);
    // `replyToStory` está declarado como no soportado y la cita de texto (M02) todavía no existe.
    expect(pure).not.toContain('InputMessageReplyToStory');
    expect(pure).not.toContain('InputTextQuote');
  });

  it('la interfaz guarda la cita como id y saca el mensaje de la ventana cargada', () => {
    expect(app).toContain("const [replyId,setReplyId]=useState('');");
    expect(app).toContain('const draftReplies=useRef(new Map<string,string>());');
    expect(app).toContain("const remoteCited=active?.type==='secret'?'':remoteReply(draftScope.topicId?state.topic:active);");
    expect(app).toContain('const reply=citedMessage(replyId,state.messages);');
    // La chapa ya no es un estado suelto que se tira al cambiar de chat.
    expect(app).not.toContain('setReply(');
    expect(app).not.toMatch(/const \[reply,setReply\]=useState<Message>\(\)/);
    for (const site of ['chooseReply(message)', 'consumeReply()', 'chooseReply(undefined)']) expect(app, site).toContain(site);
    expect(app).toContain('draftTimers.current.clear();drafts.current.clear();draftFormats.current.clear();draftReplies.current.clear();');
  });

  it('la copia local solo se descarta cuando Telegram confirma las tres partes', () => {
    const effect = region(app, 'const local=drafts.current.get(draftKey);', 800);
    expect(effect).toContain('sameDraft(');
    expect(effect).toContain('reply:localReply');
    expect(effect).toContain('reply:remoteCited');
    expect(effect).toContain('draftReplies.current.delete(draftKey);');
    expect(effect).toContain("if(!draftReplies.current.has(draftKey))setReplyId(remoteCited);");
    // La ausencia de intención local es «manda Telegram», no «no hay cita».
    expect(effect).toContain("draftReplies.current.has(draftKey)?draftReplies.current.get(draftKey)??'':remoteCited");
    expect(app).toContain('setReplyId(draftReplies.current.get(draftKey)??remoteCited)');
  });

  it('el guardado manda las tres claves y obedece lo que Telegram dejó', () => {
    const persist = body('persistDraft', app);
    expect(persist).toContain("void request<DraftSaved>('draft.set',{...scope,...draftPayload(value,entities,cited)})");
    expect(persist).toContain("if(!note||keptReply(answer)!=='')return;");
    expect(persist).toContain("draftReplies.current.set(key,'');");
    expect(persist).toContain('.catch(()=>{});');
    expect(draftPayload('hola', [], '')).toEqual({ text: 'hola', entities: [], reply: '0' });
    expect(draftPayload('hola', [], '9007199254740993').reply).toBe('9007199254740993');
    expect(Object.keys(draftPayload('hola', [], '5'))).toEqual(['text', 'entities', 'reply']);
  });

  it('elegir o quitar la cita reescribe el borrador; un envío solo la consume', () => {
    const choose = body('chooseReply', app);
    const consume = body('consumeReply', app);
    expect(choose).toContain("draftReplies.current.set(draftKey,target?.id??'');");
    expect(choose).toContain("if(keepsText(draft)&&active&&active.type!=='secret')persistDraft(draftScope,draft,draftEntities,target?.id??'');");
    expect(consume).toContain("draftReplies.current.set(draftKey,'');");
    expect(consume).not.toContain('persistDraft');
    // Escribir en el campo reescribe el borrador con la cita que sigue en pie.
    expect(app).toContain("if(active.type!=='secret')persistDraft(draftScope,value,entities,replyId);");
    // La vista de diseño también escribe: sin puente real el transportista es `designTransport`, y
    // quedarse fuera dejaría el handler de `draft.set` sin camino posible.
    expect(app).toContain("if((!native&&!import.meta.env.DEV)||!state.ready||!active)return;");
    expect(preview).toContain("if (method === 'typing') return true;");
  });

  it('las frases del puente y del modelo son las mismas', () => {
    // «Telegram» solo puede nombrarse en un comentario: la clase pura no escribe textos a la persona.
    const pureCode = pure.split('\n').filter(line => !/^\s*(?:package|import)\b/.test(line)).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(pureCode).not.toMatch(/"[^"\n]+"/);
    expect(bridge).toContain(`"${NOTE}"`);
    expect(model).toContain(`export const lostReplyNotice = (answer: DraftSaved): string => answer.note ?? '';`);
    expect(preview).toContain(`note: '${NOTE}'`);
    expect(model).toContain(unloadedCitation);
    expect(lostReplyNotice({ note: NOTE })).toBe(NOTE);
    expect(lostReplyNotice({ reply: '7' })).toBe('');
    expect(keptReply(undefined)).toBe('');
    expect(keptReply({ reply: '7' })).toBe('7');
    expect(keptReply({})).toBe('');
  });

  it('el modelo no decide nada sobre un mensaje que no está cargado', () => {
    const loaded = [message(), message({ id: '78', sender: 'Tú', outgoing: true })];
    expect(citedMessage('', loaded)).toBeUndefined();
    expect(citedMessage('907', loaded)).toBeUndefined();
    expect(citedMessage('78', loaded)?.sender).toBe('Tú');
    expect(chipTitle(loaded[0])).toBe('Responder a María Fernández');
    expect(chipTitle(undefined)).toBe(unloadedCitation);
    expect(remoteReply()).toBe('');
    expect(remoteReply({})).toBe('');
    expect(remoteReply({ draftReply: '907' })).toBe('907');
    expect(keepsText('   ')).toBe(false);
    expect(keepsText('hola')).toBe(true);
  });

  it('la comparación del borrador no deja una cita vieja pegada para siempre', () => {
    const remote = { text: 'hola', format: '0:4', reply: '77' };
    expect(sameDraft({ text: 'hola', format: '0:4', reply: '77' }, remote)).toBe(true);
    expect(sameDraft({ text: 'hola', format: '0:4', reply: '' }, remote)).toBe(false);
    expect(sameDraft({ text: 'hola', format: '', reply: '77' }, remote)).toBe(false);
    expect(sameDraft({ text: 'chau', format: '0:4', reply: '77' }, remote)).toBe(false);
  });

  it('la vista de diseño recorre el ciclo del borrador con respuesta', () => {
    const handler = region(preview, "if (method === 'draft.set') {", 1400);
    expect(handler).toContain("const known = cited === '' || state.messages.some(message => message.id === cited);");
    expect(handler).toContain('if (topicId) acceptState(');
    expect(handler).toContain('draftReply: kept || undefined');
    expect(handler).toContain('draft: text || undefined');
    // Los dos fixtures: una cita cargable (101) y una que no está en la ventana (907).
    expect(preview).toContain("draft:'El resumen queda listo hoy',draftReply:'101'");
    expect(preview).toContain("draft:'Te envío la foto después',draftReply:'907'");
    expect(preview).toMatch(/String\(id\)==='11'/);
  });
});
