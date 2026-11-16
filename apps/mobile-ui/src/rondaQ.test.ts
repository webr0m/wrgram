import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Message, UnsentInfo } from './contract';
import { canDelete, canRetry, deleteProblem, noticeOf, retryProblem, waiting } from './unsentMessages';

const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const java = (name: string) => source(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const bridge = java('NativeBridge');
const pure = java('UnsentMessages');
const component = source('./UnsentActions.tsx');
const model = source('./unsentMessages.ts');

const userDriven = (): string[] => [...source('./bridge.ts').split('const USER_DRIVEN = new Set([')[1].split(']);')[0].matchAll(/'([^']+)'/g)].map(match => match[1]);

/** El cuerpo de un método del puente, desde su firma —`void` o el tipo que devuelva— hasta la llave que lo cierra. */
function body(name: string): string {
  const start = bridge.search(new RegExp(`^[ \\t]*(?:private|public|protected)[^{;\\n]*?\\b${name}\\(`, 'm'));
  expect(start, name).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = bridge.indexOf('{', start); i < bridge.length; i++) {
    if (bridge[i] === '{') depth++;
    if (bridge[i] === '}' && --depth === 0) return bridge.slice(start, i + 1);
  }
  throw new Error(`${name} no cierra`);
}

const row = (over: Partial<UnsentInfo> = {}): UnsentInfo => ({ pending: false, code: 0, telegram: '', canRetry: true, anotherSender: false, otherQuote: false, dropsReply: false, stars: '0', wait: 0, ...over });
const message = (over: Partial<Message> = {}): Message => ({ id: '42', chatId: '11', sender: 'Tú', text: 'hola', date: 1, outgoing: true, status: 'failed', edited: false, reactions: [], unsent: row(), ...over });

describe('ronda K (M10): un mensaje sin enviar se puede reintentar o quitar', () => {
  it('la clase pura no toca Telegram ni conoce la sesión', () => {
    // Todo lo que habla con TDLib está en el puente; aquí solo hay proyección y reglas.
    expect(pure).not.toMatch(/session\.|perform\(|Answer\s+\w/);
    for (const write of ['ResendMessages', 'DeleteMessages', 'GetMessageProperties', 'sendMessage']) expect(pure, write).not.toContain(`new TdApi.${write}`);
    expect(pure).not.toMatch(/Dialogs/);
  });

  it('la proyección solo existe para un propio que sigue esperando', () => {
    expect(java('NativeSnapshot')).toMatch('if(UnsentMessages.waiting(message))data.put("unsent",UnsentMessages.reason(message));');
    expect(pure).toMatch('message.sendingState != null');
    // Un mensaje recibido nunca puede estar «sin enviar», por mucho que traiga estado de envío.
    expect(pure).toMatch(/static boolean waiting\(TdApi.Message message\) \{\n\s+return message != null && message.isOutgoing/);
  });

  it('el reintento usa ResendMessages con un solo id y sin cita ni Stars inventadas', () => {
    const retry = body('retryUnsent');
    expect(retry).toContain('new TdApi.ResendMessages(chatId,new long[]{messageId},null,0L)');
    expect(retry).toMatch('schedule();a.ok(true);');
    // Sin condición nueva no se pregunta: el botón ya dice lo que hace.
    expect(retry).toMatch('if(!UnsentMessages.dropsReply(message)&&wait<=0){send.run();return;}');
  });

  it('quitar pide permiso a Telegram antes de preguntar y borra solo para mí', () => {
    const del = body('deleteUnsent');
    const properties = del.indexOf('GetMessageProperties');
    const dialog = del.indexOf('confirmUnsent');
    const remove = del.indexOf('DeleteMessages');
    expect(properties).toBeGreaterThan(-1);
    expect(properties).toBeLessThan(dialog);
    expect(dialog).toBeLessThan(remove);
    expect(del).toContain('new TdApi.DeleteMessages(chatId,new long[]{messageId},false)');
    expect(del).toMatch('!props.canBeDeletedOnlyForSelf&&!props.canBeDeletedForAllUsers');
    expect(del).toMatch('a.fail("Telegram no permite quitar este mensaje.")');
  });

  it('los dos diálogos cancelan sin error y revalidan cuenta y conversación', () => {
    const confirm = body('confirmUnsent');
    expect(confirm).toMatch('setNegativeButton("Cancelar",(d,w)->a.ok(false))');
    expect(confirm).toMatch('setOnCancelListener(d->a.ok(false))');
    expect(confirm).not.toMatch('a.fail');
    for (const name of ['retryUnsent', 'deleteUnsent']) {
      expect(body(name)).toMatch('session.selfId!=a.owner||session.activeChat!=chatId');
      expect(body(name)).toMatch('La conversación cambió.');
    }
  });

  it('la cuenta desajustada responde «no hecho» y el mensaje se busca en el chat abierto', () => {
    const lookup = body('unsentMessage');
    expect(lookup).toMatch('if(p.has("accountId"))');
    expect(lookup).toMatch('{a.ok(false);return null;}');
    expect(lookup).toMatch('message.chatId!=session.activeChat');
    // `message(p)` lanza «Unknown message» y el puente lo convertiría en el aviso genérico.
    expect(lookup).not.toMatch('return message(p)');
    for (const name of ['retryUnsent', 'deleteUnsent']) expect(body(name)).toMatch('unsentMessage(p,a)');
  });

  it('el despacho, la lista blanca y el plazo de persona van juntos', () => {
    expect(bridge).toMatch('case "message.retry":retryUnsent(p,a);break;');
    expect(bridge).toMatch('case "message.unsent.delete":deleteUnsent(p,a);break;');
    for (const method of ['message.retry', 'message.unsent.delete']) {
      expect(java('BridgePolicy')).toContain(`"${method}"`);
      expect(userDriven(), method).toContain(method);
    }
  });

  it('el puente rechaza con la frase del modelo, nunca con un código propio', () => {
    for (const name of ['retryUnsent', 'deleteUnsent']) {
      expect(body(name)).toMatch('String problem=UnsentMessages.');
      expect(body(name)).toMatch('if(problem!=null){a.fail(problem);return;}');
    }
  });

  it('la interfaz no añade métodos que el puente no conoce', () => {
    for (const match of component.matchAll(/'((?:message|chat|notify)\.[\w.]+)'/g)) expect(java('BridgePolicy'), match[1]).toContain(`"${match[1]}"`);
    expect(component).toMatch("'message.retry' : 'message.unsent.delete'");
  });

  it('Windows se queda fuera hasta que tenga transporte', () => {
    expect(source('./App.tsx')).toMatch('{!desktop&&message.unsent&&<UnsentActions message={message} accountId={state.selfId}/>}');
    expect(source('../../desktop/src/WRGram.Desktop/TelegramService.cs')).not.toMatch('message.retry');
  });

  it('el modelo solo actúa sobre un propio sin confirmar', () => {
    expect(waiting(message())).toBe(true);
    expect(waiting(message({ status: 'pending' }))).toBe(true);
    expect(waiting(message({ status: 'sent', unsent: undefined }))).toBe(false);
    expect(waiting(message({ outgoing: false, status: '' }))).toBe(false);
    // Aunque el puente mandara `unsent` en un mensaje ya entregado, la interfaz no ofrece nada.
    expect(waiting(message({ status: 'read' }))).toBe(false);
  });

  it('las frases de rechazo son las mismas en los dos idiomas del puente', () => {
    for (const phrase of [
      'Solo puedes reintentar mensajes que enviaste tú.',
      'Telegram sigue intentando enviar este mensaje. Espera a que termine antes de repetirlo.',
      'Telegram no admite reintentar este mensaje.',
      'para enviar este mensaje otra vez; hazlo desde el propio mensaje, donde puedes revisar el coste.',
      'Telegram solo permite enviarlo otra vez a nombre de otro remitente del chat.',
      'Telegram solo permite enviarlo otra vez con una cita distinta, y la cita todavía no se edita desde WRGram.',
      'Solo puedes quitar mensajes que enviaste tú.',
      'Este mensaje ya está en Telegram; usa sus opciones para borrarlo.',
    ]) expect(pure, phrase).toContain(phrase);
    expect(model).toMatch('Este mensaje ya está en Telegram.');
    // «Ya no está cargado» solo puede ocurrir en el nativo: la interfaz pinta el botón sobre el
    // mensaje que tiene delante, así que la frase vive en Java y viaja como error del puente.
    for (const side of [pure, bridge]) expect(side, 'cargo').toContain('El mensaje ya no está cargado. Vuelve a abrir la conversación.');
    expect(model).not.toContain('El mensaje ya no está cargado');
  });

  it('el modelo reproduce las condiciones de Telegram en el mismo orden', () => {
    expect(retryProblem(message())).toBeUndefined();
    expect(canRetry(message())).toBe(true);
    expect(retryProblem(message({ outgoing: false }))).toBe('Solo puedes reintentar mensajes que enviaste tú.');
    expect(retryProblem(message({ unsent: undefined }))).toBe('Este mensaje ya está en Telegram.');
    expect(retryProblem(message({ unsent: row({ pending: true }) }))).toContain('Espera a que termine antes de repetirlo.');
    expect(retryProblem(message({ unsent: row({ canRetry: false }) }))).toBe('Telegram no admite reintentar este mensaje.');
    expect(retryProblem(message({ unsent: row({ stars: '250' }) }))).toBe('Telegram pide 250 Stars para enviar este mensaje otra vez; hazlo desde el propio mensaje, donde puedes revisar el coste.');
    expect(retryProblem(message({ unsent: row({ anotherSender: true }) }))).toContain('otro remitente del chat');
    expect(retryProblem(message({ unsent: row({ otherQuote: true }) }))).toContain('la cita todavía no se edita');
    // Pagar y cambiar de remitente a la vez: gana la Stars, como en Java.
    expect(retryProblem(message({ unsent: row({ stars: '5', anotherSender: true }) }))).toContain('5 Stars');
    // La espera avisa pero no quita el botón.
    expect(retryProblem(message({ unsent: row({ wait: 31 }) }))).toBeUndefined();
  });

  it('quitar está disponible también mientras el mensaje todavía sale', () => {
    const pending = message({ status: 'pending', unsent: row({ pending: true, canRetry: false }) });
    expect(canDelete(pending)).toBe(true);
    expect(deleteProblem(pending)).toBeUndefined();
    expect(canRetry(pending)).toBe(false);
    expect(canDelete(message({ unsent: undefined, status: 'sent' }))).toBe(false);
    expect(canDelete(message({ outgoing: false }))).toBe(false);
  });

  it('la línea que se muestra son las palabras de Telegram, sin adornos', () => {
    expect(noticeOf(message({ unsent: row({ telegram: 'Too many requests' }) }))).toBe('Telegram dijo: «Too many requests»');
    expect(noticeOf(message({ unsent: row({ telegram: '' }) }))).toBe('Telegram no aceptó el mensaje.');
    expect(noticeOf(message({ status: 'pending', unsent: row({ pending: true }) }))).toBe('Enviando a Telegram…');
    expect(noticeOf(message({ unsent: undefined }))).toBe('');
  });

  it('el texto del código 406 llega vacío hasta la interfaz', () => {
    // Java suprime el mensaje; el fixture de diseño respeta la misma regla para no entrenar lo contrario.
    expect(pure).toMatch('UNDISPLAYABLE_CODE = 406');
    expect(pure).toMatch('error.code == UNDISPLAYABLE_CODE) return ""');
    const fixtures = source('./preview.ts');
    const forbidden = [...fixtures.matchAll(/code: 406, telegram: '([^']*)'/g)];
    expect(forbidden).toHaveLength(0);
    expect(fixtures).toMatch("code: 406 }");
  });

  it('el componente ofrece acción o explicación, nunca las dos a la vez', () => {
    expect(component).toMatch('{!pending && canRetry(message) &&');
    expect(component).toMatch('{!pending && blocked &&');
    expect(component).toMatch('{canDelete(message) &&');
    expect(component).toMatch('disabled={working !== \'\'}');
    expect(component).toMatch('if (!waiting(message) || !message.unsent) return null;');
    // Cancelar en el diálogo nativo no pinta un aviso de error.
    expect(component).toMatch("if (applied === true)");
    expect(component).not.toMatch('if (applied === false) setNote');
  });

  it('la vista de diseño recorre el ciclo completo', () => {
    const preview = source('./preview.ts');
    expect(preview).toMatch("if (method === 'message.retry')");
    expect(preview).toMatch("if (method === 'message.unsent.delete')");
    expect(preview).toMatch("status: 'pending', unsent: { ...message.unsent!, pending: true, telegram: '', canRetry: false, wait: 0 }");
    expect(preview).toMatch('messages: state.messages.filter(message => message.id !== item.id)');
    // Tres estados distintos para poder verlos sin cuenta real.
    expect(preview).toMatch("id: '113'");
    expect(preview).toMatch("id: '114'");
    expect(preview).toMatch("id: '115'");
  });
});
