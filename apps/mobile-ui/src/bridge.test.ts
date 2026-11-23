import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const post = vi.fn();
const loadBridge = async () => { vi.resetModules(); return import('./bridge'); };
const source = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const android = (name: string) => source(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);

// La lista real vive en bridge.ts; se lee para que la prueba cubra siempre lo que se empaqueta.
const userDriven = () => {
  const literal = source('./bridge.ts').split('const USER_DRIVEN = new Set([')[1].split(']);')[0];
  return [...literal.matchAll(/'([^']+)'/g)].map(match => match[1]);
};
const lastId = () => JSON.parse(post.mock.calls[post.mock.calls.length - 1][0] as string).id as string;
const reply = (value: unknown) => {
  const port = (window as unknown as { WRGramNative: { onmessage: (event: { data: string }) => void } }).WRGramNative;
  port.onmessage({ data: JSON.stringify(value) });
};

beforeEach(() => {
  vi.useFakeTimers();
  post.mockClear();
  vi.stubGlobal('window', { WRGramNative: { postMessage: post, onmessage: null } });
});

describe('recuperación del estado inicial', () => {
  const allowed = { checked: true, allowed: true, blocked: false, expiresAt: 0 };

  it('permite reintentar cuando Android no entrega el estado inicial', async () => {
    const bridge = await loadBridge();
    const lateId = lastId();
    await vi.advanceTimersByTimeAsync(8000);
    expect(bridge.snapshot().startupError).toContain('Vuelve a intentarlo');
    const retry = bridge.refreshInitialState();
    expect(bridge.refreshInitialState()).toBe(retry);
    reply({ id: lateId, result: { access: allowed, name: 'Respuesta caducada' } });
    expect(bridge.snapshot().access.checked).toBe(false);
    reply({ id: lastId(), result: { access: allowed, selfId: '42', name: 'Cuenta actual' } });
    await retry;
    expect(bridge.snapshot()).toMatchObject({ access: allowed, name: 'Cuenta actual', startupError: undefined });
  });

  it('conserva la actualización más reciente si la respuesta inicial llega después', async () => {
    const bridge = await loadBridge();
    const initialId = lastId();
    reply({ event: 'state', state: { access: allowed, selfId: '42', name: 'Actualizada' } });
    reply({ id: initialId, result: { access: allowed, selfId: '42', name: 'Anterior' } });
    await bridge.refreshInitialState();
    expect(bridge.snapshot().name).toBe('Actualizada');
  });

  it('retira la solicitud si Android rechaza el envío de forma síncrona', async () => {
    const bridge = await loadBridge();
    post.mockImplementationOnce(() => { throw new Error('Puente cerrado'); });
    await expect(bridge.request('chats.list')).rejects.toThrow('Puente cerrado');
    expect(vi.getTimerCount()).toBe(1);
    reply({ id: '1', result: { access: allowed, selfId: '42' } });
    await bridge.refreshInitialState();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retira la cuenta y sus datos cuando se revoca el acceso durante el arranque', async () => {
    const bridge = await loadBridge();
    const initialId = lastId();
    reply({ event: 'state', state: { access: allowed, selfId: '42', ready: true, emojiStatus: { customEmojiId: '7', expiration: 0 }, chats: [{ id: '42' }] } });
    reply({ event: 'state', state: { access: { ...allowed, allowed: false }, chats: [{ id: '42' }] } });
    reply({ id: initialId, result: { access: allowed, selfId: '42', ready: true } });
    await bridge.refreshInitialState();
    expect(bridge.snapshot()).toMatchObject({ selfId: '0', auth: 'age', ready: false, chats: [] });
    expect(bridge.snapshot().emojiStatus).toBeUndefined();
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('contenido del teclado',()=>{
  it('hands GIFs to the confirmation subscriber without sending a message',async()=>{
    const bridge=await loadBridge(),listener=vi.fn();const off=bridge.subscribeKeyboardContent(listener);
    const value={owner:'42',chat:'11',topic:0,item:{token:'gif-token',name:'teclado.gif',size:1024,mime:'image/gif'}};
    reply({event:'keyboard.attachment',...value});expect(listener).toHaveBeenCalledExactlyOnceWith({event:'keyboard.attachment',...value});
    expect(post.mock.calls.some(([raw])=>JSON.parse(raw).method.startsWith('send.'))).toBe(false);off();
  });
  it('discards an incoming attachment when its UI has unmounted',async()=>{
    await loadBridge();reply({event:'keyboard.attachment',owner:'42',chat:'11',item:{token:'late',name:'emoji.webp',size:300}});
    expect(JSON.parse(post.mock.calls.at(-1)![0])).toMatchObject({method:'attachment.discard',params:{token:'late'}});
  });
  it('ignores malformed attachment events',async()=>{
    const bridge=await loadBridge(),listener=vi.fn();bridge.subscribeKeyboardContent(listener);
    reply({event:'keyboard.attachment',owner:'42',chat:'11',item:{token:10,name:'bad',size:300}});expect(listener).not.toHaveBeenCalled();
  });
});

describe('plazos del puente con la interfaz nativa', () => {
  it('deja que Telegram detecte los comandos y conserva las entidades manuales del borrador', async () => {
    const bridge = await loadBridge();
    const entities = [{ type: 'botCommand', offset: 0, length: 5 }, { type: 'bold', offset: 6, length: 4 }];
    const sending = bridge.request('send.text', { text: '/help hola', entities });
    const message = JSON.parse(post.mock.calls.at(-1)![0]);
    expect(message.params.entities).toEqual([{ type: 'bold', offset: 6, length: 4 }]);
    expect(entities).toHaveLength(2);
    reply({ id: message.id, result: true });
    await sending;
  });
  it('da cinco minutos a quien está en un selector, la cámara o un diálogo, y 35 s al resto', async () => {
    const { requestTimeoutMs } = await loadBridge();
    const methods = userDriven();
    expect(methods.length).toBeGreaterThan(20);
    for (const method of methods) expect(requestTimeoutMs(method)).toBe(300000);
    for (const method of ['state', 'chats.list', 'send.text', 'history.older', 'media.load', 'media.play', 'contacts.remove', 'apps.open']) {
      expect(requestTimeoutMs(method)).toBe(35000);
    }
  });

  it('no corta un selector del sistema a los 35 s y acepta la respuesta cuando la persona vuelve', async () => {
    const bridge = await loadBridge();
    const pending = bridge.request('attachment.pick');
    const id = lastId();
    let settled = false;
    void pending.then(() => { settled = true; }, () => { settled = true; });
    await vi.advanceTimersByTimeAsync(120000);
    expect(settled).toBe(false);
    reply({ id, result: { token: 'abc' } });
    await expect(pending).resolves.toEqual({ token: 'abc' });
  });

  it('conserva un plazo de seguridad de cinco minutos aunque el nativo no responda', async () => {
    const bridge = await loadBridge();
    const pending = bridge.request('media.export');
    const rejected = expect(pending).rejects.toThrow('No se confirmó la operación');
    await vi.advanceTimersByTimeAsync(300000);
    await rejected;
  });

  it('sigue cortando a los 35 s una consulta que no espera interacción', async () => {
    const bridge = await loadBridge();
    const pending = bridge.request('chats.list');
    const rejected = expect(pending).rejects.toThrow('No se confirmó la operación');
    await vi.advanceTimersByTimeAsync(35000);
    await rejected;
  });

  it('exime solo métodos permitidos por el nativo y responde también al cancelar un enlace externo', () => {
    const policy = android('BridgePolicy');
    const allowed = new Set<string>();
    for (const line of policy.split(/\r?\n/)) {
      if (!line.includes('METHODS') || line.includes('static void envelope')) continue;
      for (const match of line.matchAll(/"([^"]+)"/g)) allowed.add(match[1]);
    }
    expect(allowed.size).toBeGreaterThan(200);
    for (const method of userDriven()) expect(allowed.has(method)).toBe(true);
    const links = android('ExternalLinks');
    expect(links).toContain('Runnable opened,Runnable cancelled');
    expect(links).toContain('setNegativeButton("Cancelar",(dialog,which)->cancelled.run())');
    expect(links).toContain('setOnCancelListener(dialog->cancelled.run())');
    expect(links).not.toContain('setNegativeButton("Cancelar",null)');
    expect(android('NativeBridge')).toContain('ExternalLinks.open(activity,url,()->answer.ok(true),()->answer.ok(false))');
  });
});
