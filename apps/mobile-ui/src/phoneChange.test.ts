import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import { canResend, codeSentence, countdownFrom, waitLabel } from './phoneChange';
import { DESKTOP_PENDING } from './desktopScope';
import type { PhoneCodeInfo } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const info = (over: Partial<PhoneCodeInfo> = {}): PhoneCodeInfo => ({
  phone: '+34600123456', sent: 'un SMS', next: '', length: 5, hint: '', timeout: 0, ...over,
});

describe('A02 · el asistente de código, medido en la pantalla', () => {
  it('la frase del código cambia de forma según lo que Telegram dijo', () => {
    expect(codeSentence(info())).toBe('Telegram te envía el código por un SMS. Son 5 caracteres.');
    expect(codeSentence(info({ sent: 'un mensaje de Telegram', length: 0 }))).toBe('Telegram te envía el código por un mensaje de Telegram. Escribe el código que recibas.');
    expect(codeSentence(info({ sent: 'una llamada perdida', length: 0, hint: '+346001' }))).toBe('Telegram te envía el código por una llamada perdida. La pista que da Telegram es «+346001».');
  });

  it('el medio siguiente se promete solo cuando existe y es otro', () => {
    expect(codeSentence(info({ next: 'una llamada' }))).toContain('Si no te llega, Telegram puede enviarlo por una llamada.');
    expect(codeSentence(info())).not.toContain('Si no te llega');
    expect(codeSentence(info({ next: 'un SMS' }))).toBe('Telegram te envía el código por un SMS. Son 5 caracteres.');
  });

  it('reenviar solo con medio siguiente y cuenta atrás agotada', () => {
    expect(canResend(info({ next: 'una llamada', timeout: 30 }), 0)).toBe(true);
    expect(canResend(info({ next: 'una llamada', timeout: 30 }), 7)).toBe(false);
    expect(canResend(info({ timeout: 30 }), 0)).toBe(false);
    expect(canResend(info({ next: 'una llamada' }), -5)).toBe(true);
  });

  it('la cuenta atrás nace del timeout de Telegram y nunca es negativa', () => {
    expect(countdownFrom(info({ timeout: 60 }))).toBe(60);
    expect(countdownFrom(info({ timeout: 0 }))).toBe(0);
    expect(countdownFrom(info({ timeout: -3 }))).toBe(0);
    expect(waitLabel(90)).toBe('1:30');
    expect(waitLabel(45)).toBe('0:45');
    expect(waitLabel(0)).toBe('');
  });
});

describe('A02 · el cable y el alcance, leídos del árbol', () => {
  it('las tres órdenes viajan por el puente con la cuenta abierta', () => {
    const panel = text('./PhoneChangeSettings.tsx');
    for (const method of ['account.phone.change', 'account.phone.check', 'account.phone.resend']) {
      expect(panel, method).toContain(`'${method}'`);
    }
    // Una por línea y las tres con la cuenta: si una se queda sin `accountId`, el puente contestaría con la que estuviera
    // abierta en ese momento, que puede ya no ser la que la persona estaba mirando.
    const calls = panel.split('\n').filter(row => row.includes('await run<') && row.includes('account.phone.'));
    expect(calls).toHaveLength(3);
    for (const call of calls) expect(call, call.trim()).toContain('accountId:owner.current');
  });

  it('el código no se queda en ninguna parte', () => {
    const panel = text('./PhoneChangeSettings.tsx');
    expect(panel).not.toMatch(/localStorage|sessionStorage/);
    expect(panel).not.toMatch(/autoComplete="one-time-code"|autoComplete="tel-national"/);
    expect(panel).toContain('autoComplete="off"');
    // Se limpia antes de viajar: ni en el estado ni en el historial del campo queda el código. Se mide dentro de
    // `verify`, porque el panel limpia el campo en otros sitios y una búsqueda por todo el archivo taparía el orden.
    const verify = panel.slice(panel.indexOf('async function verify()'), panel.indexOf('async function resend()'));
    const cleared = verify.indexOf("setCode('')");
    expect(cleared, 'el panel no limpia el código').toBeGreaterThan(-1);
    expect(cleared, 'el código viaja antes de borrarse del campo').toBeLessThan(verify.indexOf("'account.phone.check'"));
  });

  it('el asistente entra desde el perfil y avisa de que Telegram lo reserva para apps oficiales', () => {
    const app = text('./App.tsx');
    expect(app).toContain('Cambiar número de teléfono');
    expect(app).toContain('<PhoneChangeSettings');
    const panel = text('./PhoneChangeSettings.tsx');
    expect(panel).toContain('aplicaciones oficiales de Android e iOS');
  });

  it('Windows la niega por su nombre y el aviso lo dice', () => {
    const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
    const refusal = service.split('\n').find(row => row.includes('"account.phone.change" or "account.phone.check" or "account.phone.resend"'));
    expect(refusal, 'el despacho de Windows no niega las tres órdenes por su nombre').toMatch(/=>\s*throw new BridgeException/);
    const claim = DESKTOP_PENDING.find(item => item.methods.includes('account.phone.change'));
    expect(claim?.methods).toEqual(['account.phone.change', 'account.phone.check', 'account.phone.resend']);
  });

  it('el andamio de vista previa responde lo mismo que el nativo y se niega en escritorio', () => {
    const preview = text('./preview.ts');
    expect(preview).toContain("if (method === 'account.phone.change')");
    expect(preview).toContain("if (method === 'account.phone.check')");
    expect(preview).toContain("if (method === 'account.phone.resend')");
    const at = preview.indexOf('function designPhoneCodeInfo');
    expect(at).toBeGreaterThan(-1);
    const body = preview.slice(at, at + 700);
    for (const key of ['phone', 'sent', 'next', 'length', 'hint', 'timeout']) expect(body, key).toContain(`${key}:`);
  });

  it('el andamio y el nativo usan la misma medida del número y la misma negación del código', () => {
    const preview = text('./preview.ts');
    const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/PhoneChange.java');
    const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/AccountSafetyPolicy.java');
    // El patrón y la frase se comparten porque el andamio modela al nativo: si uno cambia de medida, la pantalla
    // acepta en el diseño un número que luego Telegram rechaza.
    expect(preview).toContain('/^\\+[1-9][0-9]{6,14}$/');
    expect(java).toContain('"\\\\+[1-9][0-9]{6,14}"');
    const refusal = 'Escribe el código que llegó a tu teléfono.';
    expect(preview).toContain(refusal);
    expect(policy).toContain(refusal);
  });

  it('el puente de Android conoce las tres y ninguna guarda número ni código', () => {
    const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
    for (const method of ['account.phone.change', 'account.phone.check', 'account.phone.resend']) {
      expect(java, method).toContain(`case "${method}":`);
    }
    expect(java).not.toMatch(/SharedPreferences[^;]*phone/i);
    const rules = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/PhoneChange.java');
    expect(rules).toContain('static JSONObject project');
    expect(rules).not.toMatch(/SharedPreferences|File|writeText/);
  });
});
