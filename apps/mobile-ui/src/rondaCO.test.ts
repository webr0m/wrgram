import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CO: compartir hacia WRGram. El manifiesto registra `ACTION_SEND`/`ACTION_SEND_MULTIPLE`,
 * `ShellActivity` copia lo recibido al almacén privado en el momento de la recepción —la cesión de la URI
 * muere con la tarea— y el brazo `share.import` mueve lo ya copiado al outbox de la cuenta y la conversación
 * elegidas, re-comprobando el tope de `UploadPolicy`. El envío reutiliza `send.attachment`: no hay código
 * nuevo que escriba en Telegram, y nada sale sin la confirmación del panel. Un compartir de solo texto no
 * se envía: queda como borrador para revisarlo.
 *
 * Lo que no se puede probar sin cuenta queda dicho: la recepción real de un intent de otra app, el barrido
 * de carpetas huérfanas tras una hora y el envío contra Telegram solo se prueban en el dispositivo del
 * propietario. Aquí se mide el contrato de las tres piezas y el espejo del andamio con las manos.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const policy = text(`${javaDir}BridgePolicy.java`);
const bridgeJava = text(`${javaDir}NativeBridge.java`);
const shell = text(`${javaDir}ShellActivity.java`);
const inbox = text(`${javaDir}ShareInbox.java`);
const manifest = text('../../mobile/android/app/src/main/AndroidManifest.xml');
const bridgeTs = text('./bridge.ts');
const app = text('./App.tsx');
const panel = text('./ShareInboxPanel.tsx');
const preview = text('./preview.ts');

const count = (needle: string, source: string) => source.split(needle).length - 1;

/** La línea —1-based— de la primera fila que dice la aguja. Medida, nunca copiada de la hoja de ronda. */
function en(needle: string, body: string[], where: string): number {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
}

/** El literal de una clave de objeto en TypeScript. */
function tsProperty(name: string, key: string): string {
  const match = new RegExp(`${name}[\\s\\S]*?\\b${key}: '((?:[^'\\\\]|\\\\.)*)'`).exec(preview);
  if (!match) throw new Error(`Falta ${name}.${key}`);
  return match[1];
}

describe('ronda CO · la recepción vive en el manifiesto y en la actividad', () => {
  it('el manifiesto registra las dos acciones de compartir, no solo las de abrir enlaces', () => {
    expect(manifest).toContain('<action android:name="android.intent.action.SEND" />');
    expect(manifest).toContain('<action android:name="android.intent.action.SEND_MULTIPLE" />');
  });

  it('ShareInbox acota lo que puede llegar: diez archivos y el texto del mensaje', () => {
    expect(inbox).toContain('static final int MAX_ITEMS=10;');
    expect(inbox).toContain('static final int MAX_TEXT=4096;');
    expect(inbox).toContain('if(!SEND.equals(action)&&!SEND_MULTIPLE.equals(action))return null;');
  });

  it('la copia privada se hace al recibir, en las dos puertas de la actividad', () => {
    expect(count('captureShare(getIntent());', shell)).toBe(1);
    expect(count('captureShare(intent);', shell)).toBe(1);
    expect(shell).toContain('new File(getNoBackupFilesDir(),"share-inbox")');
    // La cesión de lectura de la URI es transitoria: por eso se copia antes de que la persona elija chat.
    expect(en('getContentResolver().openInputStream(uri)', rows(`${javaDir}ShellActivity.java`), 'ShellActivity.java')).toBeGreaterThan(0);
  });

  it('el tope de la copia es el de UploadPolicy y las carpetas huérfanas se barren tras una hora', () => {
    expect(count('UploadPolicy.maxBytes(premium)', shell)).toBeGreaterThanOrEqual(1);
    expect(shell).toContain('System.currentTimeMillis()-3600000L');
  });

  it('el aviso a la interfaz espera el desbloqueo y no se pierde si la pantalla aún no está', () => {
    expect(shell).toContain("window.dispatchEvent(new CustomEvent('wrgram:share-in',{detail:\"+payload+\"}))");
    const dispatch = shell.slice(shell.indexOf('private void dispatchPendingShare()'));
    expect(dispatch.slice(0, 200)).toContain('AppLock.isUnlocked()');
    expect(count('dispatchPendingShare();', shell)).toBeGreaterThanOrEqual(4);
  });
});

describe('ronda CO · el brazo share.import mueve, no envía', () => {
  it('el método está en la lista blanca y tiene su rama en el despacho', () => {
    expect(policy).toContain('"share.import"');
    expect(count('case "share.import":shareImport(p,a);break;', bridgeJava)).toBe(1);
    expect(count('private void shareImport(JSONObject p,Answer a)', bridgeJava)).toBe(1);
  });

  it('solo acepta rutas dentro de share-inbox y re-comprueba el tope de la cuenta', () => {
    const body = bridgeJava.slice(bridgeJava.indexOf('private void shareImport('));
    const method = body.slice(0, body.indexOf('\n'));
    expect(method).toContain('source.getCanonicalPath().startsWith(root)');
    expect(method).toContain('UploadPolicy.maxBytes(premium)');
    expect(method).toContain('values.length()>ShareInbox.MAX_ITEMS');
    expect(method).toContain('Files.move(source.toPath(),output.toPath())');
  });

  it('si una pieza falla, las ya movidas se deshacen: ni vale ni archivo', () => {
    const body = bridgeJava.slice(bridgeJava.indexOf('private void shareImport('));
    const method = body.slice(0, body.indexOf('\n'));
    expect(method).toContain('attachments.values().remove(item)');
    expect(method).toContain('Files.deleteIfExists(item.path.toPath())');
  });

  it('copiar gigas tiene el plazo largo, no el del diálogo', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { requestTimeoutMs } = await import('./bridge');
    expect(requestTimeoutMs('share.import')).toBe(900000);
    expect(bridgeTs).toContain("'attachment.pick', 'attachment.album', 'share.import'");
  });
});

describe('ronda CO · el panel elige y confirma; el texto solo queda de borrador', () => {
  it('App escucha el aviso y abre el panel con el prefill vivo', () => {
    expect(count("window.addEventListener('wrgram:share-in',onShareIn)", app)).toBe(1);
    expect(app).toContain('<ShareInboxPanel payload={detail} run={run}');
    expect(app).toContain('sharePrefill.current=text=>{navigate(\'chats\');setMobileChat(true);applyDraft(text,[],text.length);};');
  });

  it('el panel excluye los chats secretos y no envía nada sin confirmar', () => {
    expect(panel).toContain("chat.type!=='secret'");
    expect(panel).toContain('Nada se envía hasta confirmar.');
    expect(panel).toContain("if(payload.items.length===0){");
    expect(panel).toContain('prefill(payload.text);');
  });

  it('el envío reutiliza el camino confirmado: chat.open, send.text y send.attachment', () => {
    expect(panel).toContain("await run('chat.open',{id:target.id})");
    expect(panel).toContain("await run<boolean>('send.text',{text:payload.text})");
    expect(panel).toContain("await run<boolean>('send.attachment',{token:item.token,reply:'0'})");
    expect(count('share.import', panel)).toBe(1);
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda CO · el espejo del andamio, medido con las manos', () => {
  let call: DesignCall = async () => undefined;
  let active = '';

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    active = fixture.active;
  });

  it('importar una pieza la deja lista para el envío confirmado de siempre', async () => {
    const imported = await call('share.import', { chat: active, items: [{ path: 'share-inbox/x/informe.pdf', name: 'Informe.pdf', size: 2048, mime: 'application/pdf' }] }) as { token: string; name: string; size: number; mime: string }[];
    expect(imported).toHaveLength(1);
    expect(imported[0]).toMatchObject({ name: 'Informe.pdf', size: 2048, mime: 'application/pdf' });
    expect(await call('send.attachment', { token: imported[0].token })).toBe(true);
  });

  it('el nombre se sana igual que en el selector y el MIME sale de la extensión si no se dice', async () => {
    const imported = await call('share.import', { chat: active, items: [{ path: 'share-inbox/x/a<b>.pdf', size: 10 }] }) as { name: string; mime: string }[];
    expect(imported[0].name).toBe('a_b_.pdf');
    expect(imported[0].mime).toBe('application/pdf');
  });

  it('una conversación que no existe se niega con su causa', async () => {
    await expect(call('share.import', { chat: '999999', items: [{ path: 'x', name: 'a.pdf', size: 1 }] })).rejects.toThrow('La conversación ya no está disponible.');
  });

  it('fuera de 1 a 10 piezas no hay importación', async () => {
    await expect(call('share.import', { chat: active, items: [] })).rejects.toThrow('Comparte entre 1 y 10 archivos.');
    const once = Array.from({ length: 11 }, (_, i) => ({ path: `x/${i}.pdf`, name: `${i}.pdf`, size: 1 }));
    await expect(call('share.import', { chat: active, items: once })).rejects.toThrow('Comparte entre 1 y 10 archivos.');
  });

  it('el tope de la cuenta se rechaza con la frase de UploadPolicy, no con un número suelto', async () => {
    await expect(call('share.import', { chat: active, items: [{ path: 'x', name: 'gordo.bin', size: 3 * 1024 * 1024 * 1024 }] })).rejects.toThrow(tsProperty('ATTACH_REFUSALS', 'tooBig'));
  });

  it('si una pieza del lote falla no se registra ninguna: el vale de la buena tampoco existe', async () => {
    const items = [{ path: 'x/buena.pdf', name: 'buena.pdf', size: 10 }, { path: 'x/gorda.bin', name: 'gorda.bin', size: 3 * 1024 * 1024 * 1024 }];
    await expect(call('share.import', { chat: active, items })).rejects.toThrow(tsProperty('ATTACH_REFUSALS', 'tooBig'));
    // El espejo numera los vales en orden: el primero del lote fallido sería `a1` y no debe existir.
    await expect(call('send.attachment', { token: 'a1' })).rejects.toThrow(tsProperty('ATTACH_REFUSALS', 'notPrepared'));
  });

  it('el aviso del andamio está cableado una sola vez', () => {
    expect(count("if (method === 'share.import' && state.platform === 'desktop') return desktopShareImport(params, state);", preview)).toBe(1);
  });
});