import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ui = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const java = (name: string) => readFileSync(new URL(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`, import.meta.url), 'utf8');
const csharp = (name: string) => readFileSync(new URL(`../../desktop/src/WRGram.Desktop/${name}.cs`, import.meta.url), 'utf8');

const block = (source: string, start: string) => {
  const open = source.indexOf(start);
  if (open < 0) throw new Error(`No se encuentra ${start}`);
  // The body is the first `{` that closes a parameter list; destructured parameters open braces earlier.
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

// `void x().catch(() => {})` is how a failed Telegram call disappears without a trace.
const swallowed = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/;

const bridge = java('NativeBridge');
const session = java('TdSession');
const pending = java('PendingRequests');
const settings = ui('SettingsPage.tsx');
const collections = ui('Collections.tsx');

describe('el puente no puede quedarse con solicitudes zombis', () => {
  it('libera el identificador al responder y al destruir la vista', () => {
    expect(block(bridge, 'void finish(Object result,String error)')).toContain('pending.release(id)');
    expect(block(bridge, 'void destroy()')).toContain('pending.clear()');
  });
  it('registra el identificador al aceptar y responde cuando lo rechaza', () => {
    const receive = block(bridge, 'void receive(String raw,JavaScriptReplyProxy proxy)');
    expect(receive).toContain('pending.admit(id,SystemClock.elapsedRealtime())');
    expect(receive).toContain('reject(proxy,id,');
    expect(bridge).toContain('private static void reject(JavaScriptReplyProxy proxy,String id,String error)');
    expect(receive).not.toMatch(/if\(pending\.contains\(id\)\)return;/);
  });
  it('reclama las entradas abandonadas por encima de cualquier plazo de la interfaz', () => {
    const stale = Number(pending.match(/STALE_MS = (\d+)_000L/)?.[1]) * 1_000;
    const cap = Number(pending.match(/CAP = (\d+)/)?.[1]);
    expect(stale).toBeGreaterThan(120_000);
    expect(cap).toBeGreaterThanOrEqual(32);
    expect(pending).toContain('boolean admit(String id, long now)');
    expect(pending).toContain('private void expire(long now)');
  });
});

describe('TdSession nunca abandona una respuesta', () => {
  it('entrega un fallo cuando la sesión cambió o cerró la puerta de edad', () => {
    const request = block(session, 'void request(String key, long timeout,');
    expect(request).not.toMatch(/ticket\.complete\(\);\s*return;/);
    expect(request).toContain('WRGRAM_SESSION_CHANGED');
    expect(request).toContain('WRGRAM_AGE_GATE');
  });
  it('traduce los centinelas internos a texto comprensible', () => {
    const safe = block(session, 'static String safeError(TdApi.Error value)');
    expect(safe).toMatch(/WRGRAM_SESSION_CHANGED[^;]*antes de repetirlo/);
    expect(safe).toMatch(/WRGRAM_AGE_GATE[^;]*edad/);
  });
});

describe('los paneles avisan cuando Telegram no responde', () => {
  it('privacidad ofrece reintentar en lugar de quedarse consultando', () => {
    const panel = block(settings, 'function PrivacySettings(');
    expect(panel).toContain('setFailed(true)');
    expect(panel).toContain('onClick={load}');
    expect(panel).toMatch(/if\(!items\.length\)return failed\?/);
    expect(panel).not.toMatch(swallowed);
  });
  it('cambiar un ajuste o sus excepciones informa del fallo', () => {
    const panel = block(settings, 'function PrivacySettings(');
    expect(block(panel, 'function change(')).toContain('else setError(');
    expect(block(panel, 'function save(')).toContain('else setError(');
  });
  it('fijar un origen guardado y renombrar una etiqueta no se tragan el error', () => {
    const sources = block(collections, 'function SavedSources(');
    expect(sources).toMatch(/saved\.topics\.pin[\s\S]*?\.catch\(/);
    const rename = block(collections, 'function saveLabel(');
    expect(rename).toMatch(/saved\.tag\.label[\s\S]*?\.catch\(/);
    expect(collections).not.toMatch(swallowed);
  });
});

describe('Windows guarda la navegación elegida', () => {
  it('el puente C# persiste la clave navigation', () => {
    expect(csharp('TelegramService')).toMatch(/args\.TryGetProperty\("navigation",/);
    expect(csharp('DesktopState')).toMatch(/public string Navigation \{ get; set; \} = "bar";/);
  });
});
