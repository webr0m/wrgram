import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda CD — la marca de Premium en Windows.
 *
 * Dos sitios de la pantalla dependen de una sola respuesta: el botón ✨ del menú del mensaje, que se pinta con
 * `props.allowCustom` de `message.properties`, y el selector de emojis personalizados, que pregunta `premium.state`
 * antes de dejar elegir para avisar de que Telegram rechazará la ficha. Android contesta la clave con dos peticiones
 * —la bandera de la cuenta y el estado del plan—; en Windows la bandera ya viaja en el `User` de la sesión y la usan
 * tres sitios (el aviso antes de guardar un estado emoji, la guarda antes de mandar una ficha personalizada y la
 * cartera del estado global), pero la clave no tenía brazo: el despacho la mandaba al `_ => throw` genérico y
 * `PropertiesAsync` devolvía un `false` a secas. A eso se sumaba la compuerta BJ, que no admite una línea de
 * «Disponible» a medias y por eso dejaba las ocho claves de Premium, regalos y pagos todas en «Pendiente» aunque una
 * de ellas sí se pudiera cablear hoy.
 *
 * Este archivo mide, siempre sobre el texto de las capas y sin copiar una cifra de la hoja de ronda:
 *
 * 1. Que `premium.state` tiene brazo vivo, que va pegada al bloque contiguo que midió BY y que no se niega a sí misma.
 * 2. Que la marca sale de la sesión conectada sin ida a la red, y que el payload tiene las cuatro claves que espera el
 *    contrato —con los dos huecos vacíos y su razón escrita—.
 * 3. Que la forma del payload no es un invento del escritorio: es la que Android usa como respuesta de reserva cuando
 *    su segunda petición no contesta.
 * 4. Que el aviso del escritorio no copia el de Android, que nombra dos cosas falsas aquí.
 * 5. Que `message.properties` manda la bandera real y que la cara de Stars sigue apagada por su razón.
 * 6. Que el aviso de alcance parte la línea, que la puerta BK ya no niega la clave y que el andamio espeja la bandera.
 * 7. El cortafuegos de las citas: todo `Archivo:NNN` de lo escrito en la ronda tiene su ancla y señala hoy la línea
 *    que afirma, como hacen BM, BZ y BY.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const rules = rows(`${host}DesktopPremiumState.cs`);
const rulesText = rules.join('\n');
const service = rows(`${host}TelegramService.cs`);
const flow = text(`${host}DesktopMessageReactFlow.cs`);
const catalogFlow = text(`${host}DesktopEmojiCatalogFlow.cs`);
const catalog = text(`${host}DesktopEmojiCatalog.cs`);
const reactRules = text(`${host}DesktopMessageReact.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const stars = text(`${javaDir}StarsPolicy.java`);
const contract = text('./contract.ts');
const app = text('./App.tsx');
const preview = text('./preview.ts');
const scope = text('./desktopScope.ts');

/** El despacho de Windows, con el mismo recorte que usan BJ, BK, BY y BM. */
function dispatch() {
  const start = service.findIndex(row => row.includes('object? result = method switch'));
  const end = service.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  if (start < 0 || end < 0) throw new Error('No se encuentra el despacho de Windows');
  const answered = new Map<string, number>();
  const refused = new Map<string, number>();
  service.slice(start, end + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
    if (!keys.length) return;
    const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
    for (const key of keys) (negative ? refused : answered).set(key, start + offset + 1);
  });
  return { answered, refused };
}

const cable = dispatch();

type Call = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

/** El andamio arrancado en la plataforma pedida, con el estado parcheado si la prueba lo necesita. */
async function boot(platform: 'android' | 'web' | 'desktop', patch: Record<string, unknown> = {}): Promise<{ call: Call }> {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  const transport = await import('./bridge');
  transport.acceptState({ ...fixture, ...patch, platform });
  return { call: designRequest as Call };
}

/** Una línea C# sin literales ni comentarios de final de línea, para poder contar llaves. */
function bare(row: string) {
  let out = '';
  for (let i = 0; i < row.length; i++) {
    const ch = row[i], next = row[i + 1];
    if (ch === '/' && next === '/') break;
    if (ch === '\\') { i++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      i++;
      while (i < row.length) {
        if (row[i] === '\\') { i++; continue; }
        if (row[i] === quote) break;
        i++;
      }
      continue;
    }
    out += ch;
  }
  return out;
}

/** El cuerpo de un método C#, de su firma a la llave que lo cierra, medida por balance. */
function csBody(name: string, body: string[]) {
  const signature = new RegExp(`^\\s*(?:private|public|internal|protected)[^\\n]*\\b${name}\\(`);
  const start = body.findIndex(row => signature.test(row));
  if (start < 0) throw new Error(`Falta la firma de ${name}`);
  let depth = 0, opened = false;
  for (let n = start + 1; n <= body.length; n++) {
    for (const ch of bare(body[n - 1] ?? '')) {
      if (ch === '{') { depth++; opened = true; } else if (ch === '}') depth--;
    }
    if (opened && depth === 0) return body.slice(start, n).join('\n');
  }
  throw new Error(`${name} no cierra la llave`);
}

describe('ronda CD · el brazo y su marca', () => {
  it('premium.state tiene brazo vivo y va pegado al bloque contiguo que midió BY', () => {
    const at = cable.answered.get('premium.state');
    expect(at, 'el despacho sigue mandando premium.state al throw genérico').toBeTypeOf('number');
    expect(cable.refused.has('premium.state'), 'la rama se niega a sí misma').toBe(false);
    // BY mide su familia como un bloque contiguo que termina en `stickers.install`; la CD no lo parte: deja entre la
    // última rama ajena y la suya solo líneas de comentario.
    const tail = cable.answered.get('stickers.install');
    expect(tail, 'la familia del emoji ya no termina donde BY la midió').toBeTypeOf('number');
    expect(at!).toBeGreaterThan(tail!);
    const between = service.slice(tail!, at! - 1);
    expect(between.length).toBeGreaterThan(0);
    expect(between.every(row => row.trim().startsWith('//')), 'entre las dos ramas hay código').toBe(true);
    expect(service[at! - 1]).toContain('"premium.state" => await PremiumStateAsync(),');
  });

  it('el comentario del despacho dice por qué la rama va sola', () => {
    const at = cable.answered.get('premium.state')!;
    const comment = service.slice(at - 5, at - 1).join('\n');
    expect(comment).toContain('ronda CD');
    expect(comment).toContain('BY');
    expect(comment).toContain('contiguo');
  });

  it('la marca sale de la sesión conectada, sin ida a la red', () => {
    const body = csBody('PremiumStateAsync', rules);
    expect(body).toContain('var (_, user) = Connected();');
    expect(body).toContain('DesktopPremiumState.Of(DesktopEmojiCatalog.IsPremium(user))');
    expect(body).not.toContain('await ');
    expect(bare(body).match(/client/gi) ?? []).toHaveLength(0);
    // La misma puerta que usa la familia del emoji y la misma bandera que leen los sitios que ya la comprobaban.
    expect(catalogFlow).toContain('private (Client Client, User Self) Connected()');
    expect(catalog).toContain('public static bool IsPremium(User user) => (user.flags & User.Flags.premium) != 0;');
  });

  it('el payload lleva las cuatro claves del contrato y los dos huecos van dichos', () => {
    const declared = /export interface PremiumStatus \{([^}]*)\}/.exec(contract);
    if (!declared) throw new Error('Falta PremiumStatus en el contrato');
    const keys = declared[1].split(';').filter(Boolean).map(field => field.split(':')[0].trim()).sort();
    expect(keys).toEqual(['notice', 'paymentOptions', 'premium', 'state']);
    const payload = /=> new\s*\{([\s\S]*?)\n\s*\};/.exec(rulesText);
    if (!payload) throw new Error('Falta la forma del payload en DesktopPremiumState');
    keys.forEach(key => expect(payload[1], `${key} no viaja`).toContain(key));
    expect(payload[1]).toContain('premium,');
    expect(payload[1]).toContain('state = ""');
    expect(payload[1]).toContain('paymentOptions = Array.Empty<object>()');
    // Y la razón del hueco está escrita, no solo el hueco: la petición de TDLib no está en la librería.
    expect(rulesText).toContain('help.getUserPremiumPromo');
    expect(rulesText).toContain('no está en WTelegramClient');
  });

  it('la forma no es un invento del escritorio: es la reserva que usa Android cuando su segunda petición falla', () => {
    const android = java.find(row => row.includes('private void premiumState(Answer a){'));
    if (!android) throw new Error('Falta premiumState en el puente de Android');
    // Android abre el objeto con las cuatro claves y los dos huecos vacíos, y solo los rellena si `GetPremiumState` contesta.
    expect(android).toContain('object("premium",user.isPremium,"notice",');
    expect(android).toContain('"state","","paymentOptions",new JSONArray()');
    expect(android).toContain('new TdApi.GetPremiumState()');
    // Aquí falta exactamente lo que esa segunda petición llena, y lo que la librería ofrece no es lo mismo.
    expect(rulesText).toContain('Help_GetPremiumPromo');
  });

  it('el aviso del escritorio no copia el de Android, que nombra dos cosas que aquí no existen', () => {
    const notice = /public const string Notice = "([^"]*)"/.exec(rulesText);
    if (!notice) throw new Error('Falta la constante Notice');
    const android = /STORE_PURCHASE_UNAVAILABLE="([^"]*)"/.exec(stars);
    if (!android) throw new Error('Falta STORE_PURCHASE_UNAVAILABLE en StarsPolicy');
    expect(android[1]).toContain('Google Play');
    expect(android[1]).toContain('TDLib');
    expect(notice[1]).not.toContain('Google Play');
    expect(notice[1]).not.toContain('TDLib');
    expect(notice[1]).not.toBe(android[1]);
    expect(rulesText).toContain('notice = Notice');
  });
});

describe('ronda CD · lo que la marca abre', () => {
  it('message.properties manda la bandera real y sigue negando la cara de Stars', () => {
    const props = csBody('PropertiesAsync', service);
    expect(props).toContain('var customReaction = _client is Client session && session.User is { } self && DesktopEmojiCatalog.IsPremium(self);');
    expect(props).toContain('allowCustom = customReaction');
    expect(props).toContain('paid = false,');
    // La escritura ya comprobaba esa misma bandera antes de mandar la ficha; lo que faltaba era que la pantalla la supiera.
    expect(flow).toContain('if (!premium) throw new BridgeException(DesktopMessageReact.NotPremiumAccount);');
    expect(reactRules).toContain('public const string NotPremiumAccount = "Necesitas Telegram Premium para reaccionar con emojis personalizados.";');
    // Y la cartera del estado global se sembraba con la misma bandera desde antes de la ronda.
    expect(service.join('\n')).toContain('_state.Wallet = new WalletDto { Premium = DesktopEmojiCatalog.IsPremium(user) };');
  });

  it('el párrafo del flujo ya no niega el botón y dice las dos claves que lo abren', () => {
    const lines = flow.split(/\r?\n/);
    const start = lines.findIndex(row => row.includes('El botón de emoji personalizado'));
    expect(start, 'el párrafo del ✨ no empieza donde estaba').toBeGreaterThan(-1);
    const paragraph = lines.slice(start, lines.findIndex((row, index) => index > start && row.includes('</para>'))).join('\n');
    expect(paragraph).toContain('ronda CD');
    expect(paragraph).toContain('DesktopPremiumState');
    expect(paragraph).toContain('CustomEmojiSearchAsync');
    expect(paragraph).toContain('message.react.paid');
    expect(paragraph).not.toContain('no tiene brazo');
  });

  it('la pantalla pinta el botón con la bandera que manda el host', () => {
    expect(app).toContain('{props.allowCustom&&<button className="reaction-all"');
    expect(app).toContain("request<{premium:boolean}>('premium.state')");
  });
});

describe('ronda CD · el aviso de alcance y el andamio', () => {
  it('premium.state sale de la línea pendiente y tiene la suya propia en el aviso', () => {
    expect(DESKTOP_PENDING.flatMap(claim => claim.methods)).not.toContain('premium.state');
    const owners = DESKTOP_AVAILABLE.filter(claim => claim.methods.includes('premium.state'));
    expect(owners).toHaveLength(1);
    expect(owners[0].methods).toEqual(['premium.state']);
    expect(owners[0].label).toBe('marca de Premium de la cuenta');
    // Lo que queda de la familia sigue pendiente, y sin brazo: por eso la línea no se parte más.
    const rest = DESKTOP_PENDING.find(claim => claim.methods.includes('premium.features'));
    if (!rest) throw new Error('La línea de ventajas y límites de Premium ha desaparecido del aviso');
    expect(rest.methods).toEqual(['premium.features', 'premium.limit', 'gifts.catalog', 'gifts.send', 'gifts.received',
      'payments.stars.prepare', 'payments.stars.confirm']);
    rest.methods.forEach(key => expect(cable.answered.has(key), `${key} tiene brazo y sigue en «Pendiente»`).toBe(false));
    expect(scope).toContain('La ronda CD');
  });

  it('la puerta BK deja de negar la clave y sigue negando las siete que quedan', () => {
    expect(desktopGapRefusal('premium.state')).toBeUndefined();
    ['premium.features', 'premium.limit', 'gifts.catalog', 'gifts.send', 'gifts.received',
      'payments.stars.prepare', 'payments.stars.confirm'].forEach(key =>
      expect(desktopGapRefusal(key), `${key} ya no se niega por la puerta genérica`).toBe(`No disponible en escritorio (beta): ${key}`));
  });

  it('el andamio espeja la bandera en lugar de apagarla, y su comentario ya no promete lo contrario', () => {
    const block = /function desktopProperties[\s\S]*?\n}/.exec(preview);
    if (!block) throw new Error('Falta desktopProperties en el andamio');
    expect(block[0]).toContain('allowCustom: state.wallet?.premium === true,');
    expect(block[0]).toContain('paid: false,');
    expect(block[0]).not.toContain('siguen pendientes');
  });

  it('y llamadas de verdad, la bandera manda en el botón: apagada con la cartera mockeada, encendida si es Premium', async () => {
    const empty = await boot('desktop');
    const props = await empty.call('message.properties', { id: '101' }) as { paid: boolean; allowCustom: boolean };
    expect(props).toMatchObject({ paid: false, allowCustom: false });
    const premium = await boot('desktop', { wallet: { stars: 100, nanostars: 0, premium: true } });
    const on = await premium.call('message.properties', { id: '101' }) as { allowCustom: boolean };
    expect(on.allowCustom).toBe(true);
  });

  it('la clave ya no pasa por la negativa de escritorio: en el andamio cae en su aviso de vista sintética', async () => {
    const desktop = await boot('desktop');
    await expect(desktop.call('premium.state', {})).rejects.toThrow('Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.');
  });
});

describe('ronda CD · las citas escritas', () => {
  const anchors: Record<string, string> = {
    'App.tsx:1086': '{props.allowCustom&&<button className="reaction-all"',
    'App.tsx:1267': "request<{premium:boolean}>('premium.state')",
    'NativeBridge.java:4342': 'private void premiumState(Answer a){',
    'NativeBridge.java:4329': 'result.put("allowCustom',
    'contract.ts:102': 'export interface PremiumStatus',
    'StarsPolicy.java:14': 'STORE_PURCHASE_UNAVAILABLE',
    'DesktopMessageReactFlow.cs:75': 'if (!premium) throw new BridgeException(DesktopMessageReact.NotPremiumAccount);',
  };

  const lineOf = (file: string, n: number) => {
    const body = file === 'NativeBridge.java' || file === 'StarsPolicy.java'
      ? rows(`${javaDir}${file}`)
      : file === 'DesktopMessageReactFlow.cs'
        ? rows(`${host}${file}`)
        : rows(`./${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  /** Lo que la ronda escribió: su archivo, el comentario del despacho y el cuerpo que manda la bandera. */
  const arm = cable.answered.get('premium.state')!;
  const watched: [string, string][] = [
    ['DesktopPremiumState.cs', rulesText],
    ['TelegramService.cs (comentario CD)', service.slice(arm - 5, arm - 1).join('\n')],
    ['TelegramService.cs (PropertiesAsync)', csBody('PropertiesAsync', service)],
  ];

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    const cited = watched.map(([, source]) => [...source.matchAll(/`?([A-Za-z][\w.]*\.(?:cs|java|ts|tsx)):(\d+)`?/g)]
      .map(([, file, n]) => [file, n] as const)).flat();
    expect(cited.length, 'la ronda no ha dejado ninguna cita que comprobar').toBeGreaterThan(0);
    for (const [file, n] of cited) {
      const key = `${file}:${n}`;
      expect(anchors[key], `la cita ${key} no tiene ancla`).toBeTruthy();
      expect(lineOf(file, Number(n)), `${key} no dice lo que la cita afirma`).toContain(anchors[key]);
    }
  });

  it('toda ancla está citada en algún lado', () => {
    const written = watched.map(([, source]) => [...source.matchAll(/`?([A-Za-z][\w.]*\.(?:cs|java|ts|tsx)):(\d+)`?/g)]
      .map(([, file, n]) => `${file}:${n}`)).flat();
    Object.keys(anchors).forEach(key => expect(written, `${key} es una ancla muerta`).toContain(key));
  });
});
