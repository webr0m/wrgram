import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopLocation.cs');
const pollRules = text('../../desktop/src/WRGram.Desktop/DesktopPoll.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const dto = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const preview = text('./preview.ts');
const card = text('./MessageExtraCard.tsx');
const contract = text('./contract.ts');
const extras = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MessageExtras.java');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');

/** El literal que la clase de reglas asigna a una constante de C#. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** El literal de una clave de objeto en TypeScript, dentro del bloque que se le dé. */
function tsProperty(name: string, from = preview): string {
  const match = new RegExp(`\\b${name}: '((?:[^'\\\\]|\\\\.)*)'`).exec(from);
  if (!match) throw new Error(`Falta la propiedad ${name}`);
  return match[1];
}

/** Un bloque de constantes del espejo, desde su declaración hasta la llave que lo cierra. */
function tsBlock(name: string): string {
  const start = preview.indexOf(`const ${name} = {`);
  if (start < 0) throw new Error(`Falta el bloque ${name}`);
  const end = preview.indexOf('};', start);
  if (end < 0) throw new Error(`Sin cierre para ${name}`);
  return preview.slice(start, end);
}

/** El literal numérico que la clase de reglas asigna a una constante de C#. */
function csNumber(name: string, from = rules): string {
  const match = new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1];
}

/** Cuerpo de un miembro de C#, desde su firma hasta la siguiente declaración de la clase. */
function csMember(name: string, from = rules): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el miembro ${name}`);
  const next = from.slice(start + 1).search(/\n *public /);
  return from.slice(start, next < 0 ? from.length : start + 1 + next);
}

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = service): string {
  const start = from.search(new RegExp(`\\b(?:private|public|internal)[^\\n;=]*\\b${name}\\(`));
  if (start < 0) throw new Error(`Falta el método ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Cuerpo de una función de TypeScript, desde su firma hasta la llave que la cierra. */
function tsBody(name: string, from = preview): string {
  const start = from.search(new RegExp(`function ${name}\\(`));
  if (start < 0) throw new Error(`Falta la función ${name}`);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

const count = (needle: string, from: string) => from.split(needle).length - 1;
const at = (needle: string, from: string) => {
  const index = from.indexOf(needle);
  if (index < 0) throw new Error(`Falta la aguja ${needle}`);
  return index;
};

describe('ronda AR · el puente, medido con la vista de diseño', () => {
  it('los tres títulos de la tarjeta son los de Android, carácter a carácter', () => {
    // `MessageExtras.summary` es la única fuente: el mismo mensaje recibido en los dos aparatos dice lo mismo.
    expect(extras).toContain(`"${csSentence('Fixed')}"`);
    expect(extras).toContain(`"${csSentence('Live')}"`);
    expect(extras).toContain(`"${csSentence('Venue')}"`);
    expect(service).toContain('Title = DesktopLocation.Live,');
    expect(service).toContain('Title = DesktopLocation.Fixed,');
    // Y el vivo se llama igual en el espejo que en el brazo, porque la fila 212 lo pinta por su cuenta.
    expect(rules).toContain(`public const string Live = "${csSentence('Live')}";`);
  });

  it('las dos negativas viajan del brazo al espejo sin cambiar una letra', () => {
    const mirror = tsBlock('LOCATION_REFUSALS');
    expect(tsProperty('protected', mirror)).toBe(csSentence('Protected'));
    expect(tsProperty('gone', mirror)).toBe(csSentence('Gone'));
    // Las dos salen de `openMessageLocation`, así que se cruzan también con el archivo Java.
    expect(java).toContain(`answer.fail("${csSentence('Protected')}");`);
    expect(java).toContain(`answer.fail("${csSentence('Gone')}");`);
    // La frase de la fila ausente no se vuelve a inventar: es la de siempre, la de encuestas y álbumes, que en el
    // espejo viaja referida y en C# repetida en dos clases.
    expect(tsProperty('gone', tsBlock('ALBUM_REFUSALS'))).toBe(csSentence('Gone', pollRules));
    expect(tsBody('desktopOpenLocation')).toContain('throw new Error(POLL_REFUSALS.gone)');
    expect(csBody('OpenLocationAsync')).toContain('throw new BridgeException(DesktopPoll.Gone)');
  });

  it('el enlace del mapa es el de Android, con latitud antes que longitud', () => {
    const url = /"([^"]*api=1&query=)"\+point/.exec(java);
    if (!url) throw new Error('Falta el enlace de Google maps en Java');
    expect(csSentence('MapBase')).toBe(url[1]);
    const link = csMember('Link');
    expect(at('point.lat', link)).toBeLessThan(at('point.lon', link));
    expect(link).toContain('+ "," +');
    expect(java).toContain('location.latitude+","+location.longitude');
    // El cultivo invariable no es manía: con la regional en español la coma sería un separador decimal y Google
    // recibiría cuatro números en lugar de dos.
    expect(count('CultureInfo.InvariantCulture', link)).toBe(2);
    expect(rules).not.toMatch(/point\.(lat|lon)\.ToString\(\)/);
  });

  it('el caso vivo va antes que el fijo en los tres sitios que los miran', () => {
    // `MessageMediaGeoLive` deriva de `MessageMediaGeo`: escrito al revés, el fijo se traga al vivo y la tarjeta
    // sale sin cuenta atrás. La aguja con espacio al final es lo que impide medir contra la propia viva.
    for (const body of [csBody('ConvertMessage'), csBody('OpenLocationAsync'), csBody('PreviewOf')]) {
      expect(at('MessageMediaGeoLive', body)).toBeLessThan(at('MessageMediaGeo ', body));
      expect(at('MessageMediaGeo ', body)).toBeLessThan(at('MessageMediaVenue', body));
    }
    // Y los tres casos existen antes del aviso de «contenido no compatible», que es de donde venían.
    const converted = csBody('ConvertMessage');
    expect(at('case MessageMediaGeoLive', converted)).toBeLessThan(at('"Contenido no compatible con esta beta."', converted));
  });

  it('la regla de las coordenadas es `validLocation`, no «trae algo»', () => {
    const valid = csMember('Valid');
    expect(valid).toContain('<= 90');
    expect(valid).toContain('<= 180');
    expect(valid).toContain('double.IsNaN');
    expect(valid).toContain('double.IsInfinity');
    // El nulo del esquema vale lo mismo que el rango roto, igual que en Java.
    expect(rules).toContain('public static bool Valid(GeoPoint? point) => point != null && Valid(point.lat, point.lon);');
    expect(extras).toContain('Double.isFinite(value.latitude)');
    expect(extras).toContain('Math.abs(value.latitude) <= 90');
    expect(extras).toContain('Math.abs(value.longitude) <= 180');
    // El espejo repite la misma aritmética, no una parecida.
    const mirror = tsBody('desktopOpenLocation');
    expect(mirror).toContain('Number.isFinite(latitude)');
    expect(mirror).toContain('Math.abs(latitude) <= 90');
    expect(mirror).toContain('Math.abs(longitude) <= 180');
  });

  it('título y dirección de un lugar se recortan con el tope de Android', () => {
    expect(csMember('Title')).toContain('string.IsNullOrWhiteSpace(value) ? Venue');
    expect(csMember('Address')).toContain('? ""');
    expect(extras).toContain('text(venue.title, "Lugar")');
    expect(extras).toContain('text(venue.address, "")');
    expect(csMember('Title')).toContain('DesktopContact.Limit(value!, TextLimit)');
    expect(csMember('Address')).toContain('DesktopContact.Limit(value!, TextLimit)');
    // El tope es el mismo número escrito en Java, así que no puede subir por su cuenta.
    expect(extras).toContain(`NativeSnapshot.limit(value, ${csNumber('TextLimit')})`);
  });

  it('la cuenta atrás se apaga con el mismo criterio que Android', () => {
    // `MessageExtras.java:42` deja cero cuando el tiempo no vale, y también cuando no hay punto: las dos mitades.
    expect(extras).toContain('long expiresAt = live.expiresIn <= 0 || live.location == null ? 0 : (long) message.date + live.location.livePeriod;');
    expect(csMember('ExpiresAt')).toContain('period <= 0 ? 0 : date + period');
    expect(csBody('ConvertMessage')).toContain('ExpiresAt = visible ? DesktopLocation.ExpiresAt(Unix(message.Date), live.period) : 0,');
  });

  it('el DTO calla las coordenadas que no valen, y la pantalla lo necesita', () => {
    // `DesktopBridge` serializa con `JsonSerializerDefaults.Web` y no ignora nulos: un `null` escrito se leería
    // como un número y la tarjeta llamaría a `toFixed` sobre la nada.
    expect(dto).toMatch(/\[JsonIgnore\(Condition = JsonIgnoreCondition\.WhenWritingNull\)\]\s*\n\s*public double\? Latitude/);
    expect(dto).toMatch(/\[JsonIgnore\(Condition = JsonIgnoreCondition\.WhenWritingNull\)\]\s*\n\s*public double\? Longitude/);
    expect(card).toContain('location.latitude!==undefined&&location.longitude!==undefined&&<small dir="ltr">{location.latitude.toFixed(5)');
    // El contrato ya distinguía «no hay punto» de «punto en cero»: aquí solo se cumple.
    expect(contract).toContain("{kind:'location';title:string;address:string;latitude?:number;longitude?:number;live?:boolean;expiresAt?:number;canOpen:boolean}");
  });

  it('la pantalla solo ofrece el mapa con punto y permiso', () => {
    expect(count('{hasPoint&&location.canOpen&&run&&<button', card)).toBe(1);
    expect(count('>Abrir en el mapa</button>', card)).toBe(1);
    expect(count('{!hasPoint&&<small>Coordenadas no disponibles.</small>}', card)).toBe(1);
    expect(card).toContain("const hasPoint=location.latitude!==undefined&&location.longitude!==undefined;");
  });

  it('el brazo y el espejo entran por su nombre, una sola vez', () => {
    expect(count('"message.location.open" => await OpenLocationAsync(Long(args, "id")),', service)).toBe(1);
    expect(count("if (method === 'message.location.open' && state.platform === 'desktop') return desktopOpenLocation(params, state);", preview)).toBe(1);
    // El identificador se lee con el respaldo a cero de siempre, así que una forma rara no tiene negativa propia:
    // cae en la fila ausente. Es la diferencia con `BridgePolicy.id` de Android, que diría «Invalid identifier».
    expect(csBody('OpenLocationAsync')).not.toContain('BadId');
    expect(policy).toContain('"message.location.open"');
    expect(java).toContain('case "message.location.open":openMessageLocation(p,a);break;');
  });

  it('las filas del muestreo llegan al historial del chat, que es donde el andamio las busca', () => {
    // La lección de la ronda AP: una fila que no pasa por `poolOf` es invisible para todo lo que no sea el estado
    // del momento, incluido el «salta al mensaje» y la búsqueda.
    expect(count('...locationItems.filter(item=>item.chatId===id),', preview)).toBe(1);
    expect(count("const locationItems: Message[] = [", preview)).toBe(1);
    // Cuatro formas de publicar: fija, viva, lugar y las dos medias que apagan el botón.
    expect(count("kind: 'location'", preview)).toBe(5);
  });

  it('Android no se tocó: sigue negando por su cuenta y abriendo el intent', () => {
    const body = java.slice(at('private void openMessageLocation', java));
    expect(body).toContain('MessageExtras.temporary(source)||!source.canBeSaved');
    expect(body).toContain('chat.hasProtectedContent||chat.type instanceof TdApi.ChatTypeSecret');
    expect(body).toContain('if(!MessageExtras.validLocation(location))');
    expect(body).toContain('ExternalLinks.open(activity,');
    // El puente de Android excluye las filas temporales; MTProto no tiene esa bandera en una ubicación y el brazo
    // tampoco la inventa. Queda dicho en la documentación del método, no en el código.
    expect(service).toContain('los chats secretos no existen en este host');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;
type Row = { id: string };
type Snap = { active: string; platform: string; messages: Row[] };
const SYNTHETIC = 'Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.';

describe('ronda AR · medido con las manos, no con agujas', () => {
  let call: DesignCall = async () => undefined;
  let transport: typeof import('./bridge');
  let snap: () => Snap = () => ({ active: '', platform: 'desktop', messages: [] });

  beforeEach(async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    call = designRequest as DesignCall;
    snap = () => transport.snapshot() as unknown as Snap;
  });

  /** Entra en la conversación de las ubicaciones y deja la pantalla allí. */
  const enter = async (id: string) => {
    await call('chat.open', { id });
    return snap().active;
  };

  /** Pide el mapa y devuelve la frase con la que cayó, o `true` si lo abrió. */
  const opened = async (id: unknown) => call('message.location.open', { id: String(id) }).catch((caught: Error) => caught.message);

  /** Mete una fila con la tarjeta que se le diga y pide su mapa, para probar la aritmética sin fixture. */
  const openWith = async (extra: Record<string, unknown>) => {
    const state = transport.snapshot();
    transport.acceptState({
      ...state,
      messages: [...state.messages, {
        id: '777', chatId: snap().active, sender: 'Álex Moreno', text: '', date: 0, outgoing: false,
        status: '', edited: false, reactions: [], extra,
      } as never],
    });
    return opened('777');
  };

  it('el chat de la comunidad trae las cinco formas de leer una ubicación', async () => {
    expect(await enter('14')).toBe('14');
    const rows = snap().messages.filter(row => ['211', '212', '213', '214', '215'].includes(row.id)).map(row => row.id);
    expect(rows).toEqual(['211', '212', '213', '214', '215']);
  });

  it('la fija, la viva y el lugar abren el mapa', async () => {
    await enter('14');
    for (const id of ['211', '212', '213']) expect(await opened(id), id).toBe(true);
  });

  it('sin coordenadas no hay mapa, y la fila lo dice con la suya', async () => {
    await enter('14');
    expect(await opened('214')).toBe(csSentence('Gone'));
  });

  it('y una fila sin permiso de exportar se queda dentro del chat', async () => {
    await enter('14');
    expect(await opened('215')).toBe(csSentence('Protected'));
  });

  it('en un chat protegido la negativa llega antes de mirar la fila', async () => {
    await enter('22');
    // Ni siquiera es una ubicación: el brazo tampoco pasaría de la comprobación del chat.
    expect(await opened('401')).toBe(csSentence('Protected'));
  });

  it('lo que no es una ubicación cae en la frase de siempre', async () => {
    await enter('14');
    expect(await opened('101')).toBe(csSentence('Gone'));
  });

  it('una fila que no existe y un identificador que el host vuelve cero son la misma negativa', async () => {
    await enter('14');
    for (const id of ['999999', '0', '-3', 'abc', '']) expect(await opened(id), id).toBe(csSentence('Gone', pollRules));
  });

  it('el cero es una coordenada legítima: el golfo de Guinea existe', async () => {
    await enter('14');
    expect(await openWith({ kind: 'location', title: 'Ubicación', address: '', latitude: 0, longitude: 0, canOpen: true })).toBe(true);
  });

  it('fuera de rango, no: la regla es la de `validLocation`', async () => {
    await enter('14');
    const card = { kind: 'location', title: 'Ubicación', address: '', canOpen: true };
    for (const [latitude, longitude] of [[91, 0], [-91, 0], [0, 181], [0, -181], [Number.NaN, 0], [Number.POSITIVE_INFINITY, 0]]) {
      const verdict = await openWith({ ...card, latitude, longitude });
      expect(verdict, `${latitude},${longitude}`).toBe(csSentence('Gone'));
    }
  });

  it('el permiso manda sobre las coordenadas puestas', async () => {
    await enter('14');
    // Una fila con el punto perfecto y `canOpen:false` es exactamente lo que publica el host en un chat protegido.
    expect(await openWith({ kind: 'location', title: 'Ubicación', address: '', latitude: 40.4, longitude: -3.7, canOpen: false }))
      .toBe(csSentence('Protected'));
  });

  it('una tarjeta que no es de ubicación no ofrece mapa, aunque la pidan', async () => {
    await enter('14');
    expect(await openWith({ kind: 'contact', name: 'Sofía López', phone: '+34600111222', userId: '503', canCopy: true }))
      .toBe(csSentence('Gone'));
  });

  it('en Android el espejo no abre mapa ninguno: cae en la cuenta real', async () => {
    transport.acceptState({ ...transport.snapshot(), platform: 'android' });
    await enter('14');
    expect(await opened('211')).toBe(SYNTHETIC);
  });
});
