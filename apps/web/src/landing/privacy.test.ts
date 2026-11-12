import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const policy = readFileSync(new URL('../../public/android/privacy/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../public/android/privacy/privacy.css', import.meta.url), 'utf8');
const props = readFileSync(new URL('../../../mobile/android/version.properties', import.meta.url), 'utf8');
const versionName = /versionName=(.+)/.exec(props)?.[1].trim() ?? '';
const versionCode = /versionCode=(.+)/.exec(props)?.[1].trim() ?? '';

describe('política pública de Android aprobada', () => {
  it('identifica la app, responsable y contacto aprobados sin campos pendientes', () => {
    expect(policy).toContain('cc.webrom.wrgram');
    expect(policy).toContain('Rodrigo Olmos, Chile');
    expect(policy).toContain('mailto:ridrogo@gmail.com');
    expect(policy).not.toMatch(/PENDIENTE|\[TODO\]|BORRADOR/);
  });
  it('distingue el control local, Telegram y la generación deshabilitada', () => {
    expect(policy).toContain('no se guarda ni se envía');
    expect(policy).toContain('cuatro campos');
    expect(policy).toContain('autodeclaración, no verificación');
    expect(policy).toContain('no tienen cifrado de extremo a extremo');
    expect(policy).toContain('La generación pública está deshabilitada');
  });
  it('ofrece instrucciones de eliminación sin confundirlas con borrar Telegram', () => {
    expect(policy).toContain('id="eliminar-datos"');
    expect(policy).toContain('90 días');
    expect(policy).toContain('Desinstalar no garantiza revocar la sesión remota');
    expect(policy).toContain('WRGram no permite crear ni eliminar una cuenta de Telegram');
    expect(policy).toContain('No se promete un plazo contractual');
  });
  it('no añade JavaScript ni rastreadores y respeta la CSP existente', () => {
    expect(policy).not.toMatch(/<script|<iframe|<form|style=/i);
    expect(policy).toContain('href="/android/privacy/privacy.css"');
    expect(policy).toContain('lang="es"');
    expect(css).toContain('focus-visible');
    expect(css).toContain('@media');
  });
  it('describe las funciones que la app sí tiene: chats secretos, agenda opt-in y grabación', () => {
    expect(policy).not.toContain('no implementa chats secretos');
    expect(policy).not.toContain('no sube la agenda');
    expect(policy).not.toContain('no hay grabación propia');
    expect(policy).toContain('sí permite crear chats secretos');
    expect(policy).toContain('Sincronización automática');
    expect(policy).toContain('hasta 200 contactos');
    expect(policy).toContain('nota de voz');
    expect(policy).toContain('videomensaje');
    expect(policy).toContain('última ubicación conocida');
    expect(policy).toContain('Mini Apps y reproductor de vídeo');
    expect(policy).not.toContain('Limitación conocida de esta versión');
  });
  it('cubre el transporte nuevo de la Bot API: host directo, token local y guarda previa', () => {
    expect(policy).toContain('Bot API de Telegram');
    expect(policy).toContain('api.telegram.org');
    expect(policy).toContain('@BotFather');
    expect(policy).toContain('sellado además contra tu cuenta');
    expect(policy).toContain('se elimina al cerrar sesión');
    expect(policy).toContain('Olvidar este bot');
    expect(policy).toContain('no vuelve a mostrarse en pantalla');
    expect(policy).toContain('comprueba con Telegram que ese bot sea administrador');
    expect(policy).toContain('WRGram no intermedia esa conexión');
  });
  it('cubre editar, borrar y fijar lo publicado sin vender borrado de historial', () => {
    expect(policy).toContain('si editas, borras, fijas o desfijas un mensaje ya publicado, el identificador de ese mensaje');
    expect(policy).toContain('no usa la Bot API');
    expect(policy).toContain('el conjunto de permisos que eliges');
    expect(policy).toContain('Sacar al bot del chat no borra lo que ya publicó');
    expect(policy).toContain('no guarda el texto que publicas');
    expect(policy).not.toContain('sacarlo del chat borra');
  });
  it('anuncia la versión de Android que está empaquetada ahora mismo', () => {
    expect(versionName).toMatch(/^\d+\.\d+\.\d+/);
    expect(policy).toContain(`${versionName} (código ${versionCode})`);
    expect(policy).not.toMatch(/código (?:[12]?\d|3[0-3])\)/);
  });
  it('no vende la pantalla de Complementos como un cartel sin función', () => {
    expect(policy).toContain('abre Mini Apps reales');
    expect(policy).not.toContain('es una propuesta');
    expect(policy).not.toContain('no descarga código externo');
  });
});
