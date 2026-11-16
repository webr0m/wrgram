import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const androidLinks = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/InviteLinks.java');
const telegramLinks = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TelegramLinks.java');
const membership = text('../../desktop/src/WRGram.Desktop/DesktopMembership.cs');
const links = text('../../desktop/src/WRGram.Desktop/DesktopInviteLinks.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const app = text('./App.tsx');
const userMenu = text('./UserMenu.tsx');
const preview = text('./preview.ts');

/** El literal que una capa asigna a una constante, en Java (`static final String`) o en C# (`const string`). */
function sentence(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|protected)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** El literal de una constante de TypeScript, que escribe las frases entre comillas simples. */
function literal(source: string, name: string): string {
  const match = new RegExp(`${name}\\s*=\\s*'((?:[^'\\\\]|\\\\.)*)'`).exec(source);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El embudo de enlaces (`LinkFromUrlAsync`): la única parte del handler que decide qué se escribe y qué no. */
function linkHandler(): string {
  const body = csBody('LinkFromUrlAsync');
  const start = body.indexOf('ChatInviteBase seen;');
  if (start < 0) throw new Error('LinkFromUrlAsync no empieza por la lectura');
  return body.slice(start);
}

describe('ronda AB · las tres formas de un enlace de invitación y ninguna más', () => {
  it('el parseador reconoce el enlace nuevo, el legado y el de esquema `tg://`', () => {
    const parser = csBody('HashOf', links);
    expect(parser).toContain('path.StartsWith("/+", StringComparison.Ordinal)');
    expect(parser).toContain('path.StartsWith("/joinchat/", StringComparison.Ordinal)');
    expect(parser).toContain('uri.Host.Equals("join", StringComparison.OrdinalIgnoreCase)');
    expect(parser).toContain('FromQuery(uri.Query)');
  });

  it('y los tres hosts de Telegram, con el mismo techo de longitud que el puente de Android', () => {
    expect(links).toContain('private static readonly string[] Hosts = { "t.me", "telegram.me", "telegram.dog" };');
    expect(links).toContain('if (value.Length == 0 || value.Length > MaxUrl) return null;');
    expect(links).toContain('public const int MaxUrl = 2048;');
    expect(telegramLinks).toContain('value.length() > 2048');
  });

  it('un usuario público no es una invitación: el navegador lo sigue siendo todo lo demás', () => {
    const parser = csBody('HashOf', links);
    expect(parser.includes('/joinchat/')).toBe(true);
    expect(links.includes('"/username"')).toBe(false);
    expect(csBody('IsInviteLink', links)).toContain('path.StartsWith("/+", StringComparison.Ordinal) || path.StartsWith("/joinchat/", StringComparison.Ordinal)');
  });

  it('el hash se acepta por caracteres, no decodificado: ni `+`, ni `/`, ni `%` llegan al puente', () => {
    const hash = csBody('Hash', links);
    expect(hash).toContain("if (char.IsAsciiLetterOrDigit(c) || c is '-' or '_') continue;");
    expect(links.includes('Uri.UnescapeDataString')).toBe(false);
    expect(links.includes('HttpUtility')).toBe(false);
  });

  it('los dos filtros que la sonda encontró rotos: el puerto por defecto y el esquema suelto', () => {
    // `Uri.Port` responde 443 aunque el enlace no lleve puerto, y con `!= -1` ningún `https://t.me/+…`
    // pasaba. Y `http://` no es un enlace de Telegram: `TelegramLinks.normalize` tampoco lo admite.
    const parser = csBody('HashOf', links);
    expect(parser).toContain('if (uri.UserInfo.Length != 0 || !uri.IsDefaultPort) return null;');
    expect(parser).toContain('if (scheme != "https") return null;');
  });

  it('Android, en cambio, valida el enlace completo con su tabla de formas', () => {
    expect(androidLinks).toContain('static final int MAX_URL = 512;');
    expect(androidLinks).toContain('tg://join\\\\?invite=');
    expect(androidLinks).toContain('joinchat/');
    expect(androidLinks).toContain('\\\\+');
  });
});

describe('ronda AB · Windows lee antes de escribir y niega lo que no puede cumplir', () => {
  it('el despacho pone los dos caminos en la misma ruta', () => {
    expect(service.includes('"link.open" => await TelegramLinkAsync(args),')).toBe(true);
    expect(service.includes('"telegram.link" => await TelegramLinkAsync(args),')).toBe(true);
    expect(csBody('LinkFromUrlAsync')).toContain('return OpenLink(url) ? new { action = "link" }');
  });

  it('la lectura es `checkChatInvite` y la escritura `importChatInvite`, en ese orden y no al revés', () => {
    const handler = linkHandler();
    const read = handler.indexOf('Messages_CheckChatInvite(hash)');
    const write = handler.indexOf('Messages_ImportChatInvite(hash)');
    expect(read).toBeGreaterThan(0);
    expect(write).toBeGreaterThan(read);
  });

  it('sin `confirmed` el método sale antes de tocar Telegram', () => {
    const handler = linkHandler();
    const readPreview = handler.indexOf('DesktopInviteLinks.Preview(');
    // La ronda BR subió la bandera de `args` a un parámetro del embudo, porque la confirmación ya no llega solo de
    // la pantalla: `message.link` la trae del toque con el que se vuelve a pedir la tarjeta. La regla es la misma y
    // se comprueba en los dos extremos: la bandera sale siempre de `args` y nada escribe antes del cuadro.
    expect(handler).toContain('if (!confirmed)');
    expect(service).toContain('private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(Str(args, "url"), Bool(args, "confirmed"));');
    expect(csBody('MessageLinkAsync')).toContain('return await LinkFromUrlAsync(DesktopLinkPreview.Url(web), Bool(args, "confirmed"));');
    expect(readPreview).toBeGreaterThan(0);
    expect(readPreview).toBeLessThan(handler.indexOf('Messages_ImportChatInvite(hash)'));
  });

  it('la página del bot de seguridad se niega sin fingir que el ingreso quedó hecho', () => {
    const handler = linkHandler();
    expect(handler).toContain('if (answer is Messages_ChatInviteJoinResultWebView) throw new BridgeException(DesktopInviteLinks.WebGuard);');
    expect(handler).toContain('if (answer is not Messages_ChatInviteJoinResultOk) throw new BridgeException(DesktopInviteLinks.Unknown);');
    expect(handler.indexOf('Messages_ChatInviteJoinResultWebView')).toBeLessThan(handler.indexOf('Messages_ChatInviteJoinResultOk'));
  });

  it('los dos resultados que sí traen chat se leen como pertenencia, no como invitación nueva', () => {
    expect(linkHandler()).toContain('if (seen is ChatInviteAlready or ChatInvitePeek) throw new BridgeException(DesktopInviteLinks.Inside);');
    expect(membership).not.toContain('ChatInvitePeek');
  });

  it('el enlace de pago se rechaza antes de confirmar, salvo que la suscripción ya permita volver', () => {
    const handler = linkHandler();
    expect(handler).toContain('if ((flags & ChatInvite.Flags.has_subscription_pricing) != 0 && (flags & ChatInvite.Flags.can_refulfill_subscription) == 0)');
    expect(handler).toContain('throw new BridgeException(DesktopInviteLinks.Paid);');
    expect(handler).toContain('if ((flags & ChatInvite.Flags.has_bot_verification) != 0) throw new BridgeException(DesktopInviteLinks.WebGuard);');
  });

  it('y el puente de Android también distingue el reingreso sin cargo de la suscripción nueva', () => {
    expect(java).toContain('if(sub!=null&&!sub.canReuse)');
    expect(java).toContain('Telegram no permite pagar esta suscripción en este momento.');
  });

  it('el éxito y la solicitud pendiente usan las claves que la interfaz ya traduce', () => {
    const handler = linkHandler();
    expect(handler).toContain('if (DesktopInviteLinks.RequestSent(error)) return DesktopInviteLinks.Membership(DesktopMembership.Requested);');
    expect(handler).toContain('return DesktopInviteLinks.Membership(DesktopMembership.Joined);');
    expect(csBody('Membership', links)).toContain('action = "membership"');
    expect(csBody('Membership', links)).not.toContain('opened');
  });

  it('ninguna respuesta del enlace promete un chatId que `importChatInvite` no devuelve', () => {
    const previewShape = csBody('Preview', links);
    expect(previewShape).toContain('action = "invite_preview"');
    expect(previewShape.includes('chatId')).toBe(false);
    expect(links.includes('chatId')).toBe(false);
  });

  it('los cuatro códigos de Telegram con nombre propio, y lo demás sube con su texto', () => {
    expect(links).toContain('Starts(error, "INVITE_HASH_EXPIRED")');
    expect(links).toContain('Starts(error, "INVITE_REQUEST_SENT")');
    expect(links).toContain('Starts(error, "USER_BANNED_IN_CHANNEL")');
    expect(links).toContain('Starts(error, "USER_ALREADY_PARTICIPANT")');
    expect(csBody('LinkRefusal')).toContain('return error.Length == 0 ? DesktopInviteLinks.Unknown : error;');
  });
});

describe('ronda AB · las frases, compartidas donde hay gemelo y propias donde no lo hay', () => {
  it('el miembro que ya está dentro y la respuesta ilegible son las mismas palabras que en Android', () => {
    expect(sentence(java, 'MEMBERSHIP_INSIDE')).toBe(sentence(links, 'Inside'));
    expect(sentence(java, 'MEMBERSHIP_UNKNOWN')).toBe(sentence(links, 'Unknown'));
  });

  it('las otras tres no tienen gemelo: las resuelve TDLib o un cuadro nativo de Android', () => {
    // `checkChatInvite`/`joinChatByInviteLink` en TDLib traen la caducidad y el bot dentro de su propio
    // error, y el cobro con Stars sale por `SendPaymentForm`. Ninguna de las tres frases existe en Java.
    expect(java.includes(sentence(links, 'Expired'))).toBe(false);
    expect(java.includes(sentence(links, 'WebGuard'))).toBe(false);
    expect(java.includes(sentence(links, 'Paid'))).toBe(false);
    expect(sentence(links, 'Expired')).toContain('caducó');
    expect(sentence(links, 'Paid')).toContain('Stars');
    expect(sentence(links, 'BadLink')).toContain('código reconocible');
  });

  it('la vista de diseño lleva copiadas las cuatro frases del enlace', () => {
    expect(literal(preview, 'INVITE_EXPIRED')).toBe(sentence(links, 'Expired'));
    expect(literal(preview, 'INVITE_WEB_GUARD')).toBe(sentence(links, 'WebGuard'));
    expect(literal(preview, 'INVITE_PAID')).toBe(sentence(links, 'Paid'));
    expect(literal(preview, 'INVITE_BAD_HASH')).toBe(sentence(links, 'BadLink'));
  });

  it('y conoce los mismos tres host que el puente, porque el diseño tiene que decir lo mismo que Windows', () => {
    expect(preview).toContain("const INVITE_HOSTS = ['t.me', 'telegram.me', 'telegram.dog'];");
    expect(links).toContain('private static readonly string[] Hosts = { "t.me", "telegram.me", "telegram.dog" };');
  });

  it('el nombre que falta se dice como lo dice Android, no se inventa', () => {
    expect(csBody('TitleOf', links)).toContain('"este chat"');
    expect(java).toContain('"este chat"');
  });
});

describe('ronda AB · la pantalla de Windows pregunta con el nombre que dio Telegram', () => {
  it('la invitación se confirma en el mismo sitio donde Android pone su cuadro nativo', () => {
    expect(app).toContain("case 'invite_preview': {");
    expect(app).toContain("confirm('Invitación a Telegram'");
    expect(app).toContain("approval?'Solicitar unirme':'Unirme'");
    expect(app).toContain("'telegram.link',{url,confirmed:true}");
    // La ronda BR añade la otra puerta: la tarjeta de un mensaje también sabe que es una invitación, y el host no
    // le manda la dirección a la pantalla —es la regla de `DesktopLinkPreview`—, así que la hoja no se abre por
    // `url` sino por el `again` con el que se vuelve a pedir esa fila. Con las dos vacías, el cuadro sigue sin salir.
    expect(app).toContain("if(!url&&!again)return;");
    expect(app).toContain("()=>{if(again)again(true);else void run<TelegramLinkResult>('telegram.link',{url,confirmed:true})");
  });

  it('las dos preguntas son las mismas frases del cuadro de Android', () => {
    expect(app).toContain('Se enviará una solicitud de ingreso; los administradores deben aprobarla.');
    expect(app).toContain('Telegram registrará tu ingreso al confirmar.');
    expect(java).toContain('Se enviará una solicitud de ingreso; los administradores deben aprobarla.');
    expect(java).toContain('Telegram registrará tu ingreso al confirmar.');
  });

  it('y el resultado del enlace se traduce con el aviso que ya usa el botón del menú', () => {
    expect(app).toContain("case 'membership': setToast(membershipNotice(result.state||'unknown',result.opened===true));return;");
    expect(app).toContain("function handleTelegramLinkResult(result:TelegramLinkResult|boolean|undefined,url='',again?:(confirmed:boolean)=>void){");
    // Lo que Windows entrega al navegador lo dice en pantalla: sin este aviso el cuadro de enlace se
    // quedaría abierto sin explicación, porque el `true` de Android no llegaba a decir nada.
    expect(app).toContain("case 'link': setToast('Enlace abierto en el navegador.');return;");
  });

  it('el enlace del mensaje también lleva su url, que es el otro camino de entrada', () => {
    expect(app).toContain("'link.open',{url}).then(result=>handleTelegramLinkResult(result,url))");
    expect(app).toContain("'telegram.link',{url}).then(result=>handleTelegramLinkResult(result,url))");
  });

  it('y Windows ofrece el cuadro de enlace, que hasta ahora solo existía en Android', () => {
    const start = userMenu.indexOf('if(desktop) return');
    const desktopBody = userMenu.slice(start, userMenu.indexOf('\n  return <div className="account-menu">', start));
    expect(desktopBody).toContain('<Row icon={<Link2/>} label="Abrir enlace de Telegram" detail="Las invitaciones entran aquí; lo demás, en el navegador" onClick={openLink}/>');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

describe('ronda AB · la vista de diseño recorre los seis enlaces', () => {
  let call: DesignCall = async () => undefined;

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState(fixture);
    call = designRequest as DesignCall;
  });

  it('un enlace que no es invitación se va al navegador y lo dice', async () => {
    expect(await call('link.open', { url: 'https://example.com/nota' })).toEqual({ action: 'link' });
    expect(await call('telegram.link', { url: 'https://t.me/astronomia_cl' })).toEqual({ action: 'link' });
  });

  it('la lectura dice nombre, cifra de miembros y si hace falta aprobación', async () => {
    expect(await call('telegram.link', { url: 'https://t.me/+Aprobada91' }))
      .toEqual({ action: 'invite_preview', title: 'Club de lectura', members: 38, approval: true });
  });

  it('confirmar el enlace escribe el ingreso y dice qué pasó', async () => {
    expect(await call('telegram.link', { url: 'https://t.me/+Abierto92', confirmed: true }))
      .toEqual({ action: 'membership', state: 'joined' });
  });

  it('las cuatro formas de escribir el mismo código llegan al mismo resultado', async () => {
    // El puente de Windows lee las cuatro; si el diseño solo admitiera la forma corta, el walkthrough
    // pasaría sobre un enlace que el host real está resolviendo por otra ruta.
    for (const url of ['https://t.me/+Abierto92', 'https://telegram.dog/+Abierto92', 'https://t.me/joinchat/Abierto92', 'tg://join?invite=Abierto92']) {
      expect(await call('telegram.link', { url, confirmed: true })).toEqual({ action: 'membership', state: 'joined' });
    }
  });

  it('y un código bien formado que el diseño no modela lo dice, en vez de fingir que abrió el navegador', async () => {
    await expect(call('telegram.link', { url: 'https://t.me/+SinModelo90' })).rejects.toThrow('no tiene modelo para ese código de invitación');
  });

  it('la solicitud pendiente se dice como solicitud, no como ingreso', async () => {
    expect(await call('telegram.link', { url: 'https://t.me/+Aprobada91', confirmed: true }))
      .toEqual({ action: 'membership', state: 'request' });
  });

  it('las cuatro negaciones se dicen antes de escribir y ninguna se disimula de éxito', async () => {
    await expect(call('telegram.link', { url: 'https://t.me/+Caducada95' })).rejects.toThrow(sentence(links, 'Expired'));
    await expect(call('telegram.link', { url: 'https://t.me/+BotValida94' })).rejects.toThrow(sentence(links, 'WebGuard'));
    await expect(call('telegram.link', { url: 'https://t.me/+DePago93' })).rejects.toThrow(sentence(links, 'Paid'));
    await expect(call('telegram.link', { url: 'https://t.me/+no.vale' })).rejects.toThrow(sentence(links, 'BadLink'));
  });

  it('y el enlace mal formado se niega también desde el toque de un mensaje', async () => {
    await expect(call('link.open', { url: 'https://t.me/+no.vale' })).rejects.toThrow(sentence(links, 'BadLink'));
  });
});
