import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Ronda CE — la entidad de emoji personalizado de ida y vuelta en Windows.
 *
 * El compositor rico escribe diez tipos de entidad y los manda con el mensaje (ronda BT). Android los conocía todos:
 * `NativeBridge.textEntities` arma el `TextEntityType` y `NativeSnapshot.entities` lo devuelve con su cifra. El puente
 * de Windows no: su `ParseEntities` leía el `url` a medias, no tenía brazo para `customEmoji` y —lo que más dolía—
 * una entidad que no entendía se quedaba fuera en silencio, así que un mensaje con una ficha personalizada salía con el
 * glifo escrito y sin cara, y al volver no traía la cifra para que `CustomEmoji.tsx` pidiera la imagen. Tampoco
 * comprobaba el rango, y un desplazamiento fuera de texto hace que Telegram descarte el formato entero del mensaje.
 *
 * Este archivo mide, siempre sobre el texto de las capas y sin copiar una cifra de la hoja de ronda:
 *
 * 1. Que las reglas viven en `DesktopTextEntities.cs` y que las diez claves que el despacho sabe mandar son las diez
 *    que arma Android, dichas una sola vez y sin literales en el despacho.
 * 2. Que el orden de las negativas es el de Android: techo, números, rango, y el tipo al final.
 * 3. Que la ida arma el documento del emoji sin tocar el texto, ordena por desplazamiento y decide el formato antes de
 *    marcar el envío como en curso.
 * 4. Que la vuelta devuelve la cifra como texto —la única forma de que llegue entera a JavaScript— y que la dirección
 *    de un enlace detectado por Telegram es su propio trozo de texto.
 * 5. Que el andamio no tira la entidad al editar, medido con una llamada de verdad.
 * 6. El cortafuegos de las citas: todo `Archivo:NNN` de lo escrito en la ronda tiene su ancla y señala hoy la línea que
 *    afirma, como hacen BM, BY y CD.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);
const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const rules = rows(`${host}DesktopTextEntities.cs`);
const rulesText = rules.join('\n');
const service = rows(`${host}TelegramService.cs`);
const serviceText = service.join('\n');
const stateCs = text(`${host}DesktopState.cs`);
const catalog = text(`${host}DesktopEmojiCatalog.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const model = text('./richDraft.ts');
const contract = text('./contract.ts');
const preview = text('./preview.ts');

/** La única línea —1-based— que dice la aguja. */
function en(needle: string, body: string[], where: string): number {
  const hits = body.map((row, i) => (row.includes(needle) ? i + 1 : 0)).filter(Boolean);
  if (hits.length !== 1) throw new Error(`${where} dice «${needle}» en ${hits.join(', ') || 'ninguna línea'}`);
  return hits[0];
}
const veces = (needle: string, source: string) => source.split(needle).length - 1;
const fila = (n: number, body: string[]) => body[n - 1];
/** El miembro C# con cuerpo de llaves, de su firma a la llave que lo cierra (cuatro espacios y `}`). */
function miembro(marker: string): string {
  const start = en(marker, service, 'TelegramService.cs');
  let index = start;
  while (service[index] !== '    }') index += 1;
  return service.slice(start - 1, index + 1).join('\n');
}
/** Las líneas de un miembro C# expresado en una o dos líneas (`=>` al final de la firma). */
function dicho(marker: string, lineas: number): string {
  return service.slice(en(marker, service, 'TelegramService.cs') - 1, en(marker, service, 'TelegramService.cs') - 1 + lineas).join('\n');
}
/** El cuerpo de una clase de DTO del estado, de su firma a la llave que la cierra en la columna cero. */
function clase(name: string): string {
  const start = stateCs.indexOf(`public sealed class ${name}`);
  if (start < 0) throw new Error(`Falta la clase ${name} en DesktopState.cs`);
  const end = stateCs.indexOf('\n}', start);
  if (end < 0) throw new Error(`${name} no cierra la llave`);
  return stateCs.slice(start, end + 2);
}

const IR = miembro('private static MessageEntity[]? ParseEntities(');
const VUELTA = miembro('private static List<EntityDto>? ConvertEntities(');
const ENLACE = miembro('private static string LinkUrlOf(');
const CIFRA = dicho('private static long FaceIdOf(JsonElement item) =>', 2);

const TECHO = en('var ceiling = DesktopTextEntities.TooManyProblem(array.GetArrayLength());', service, 'TelegramService.cs');
const NUMEROS = en('if (!item.TryGetProperty("offset", out var offsetElement)', service, 'TelegramService.cs');
const RANGO = en('var range = DesktopTextEntities.OffsetProblem(offset, length, text);', service, 'TelegramService.cs');
const BRAZO = en('MessageEntity entity = type switch', service, 'TelegramService.cs');
const NEGADA = en('_ => throw new BridgeException(DesktopTextEntities.UnknownTypeProblem(type)!),', service, 'TelegramService.cs');

const IDA_TECHO = en('if(values.length()>100)throw new IllegalArgumentException();', java, 'NativeBridge.java');
const IDA_NUMEROS = en('int offset=value.getInt("offset"),size=value.getInt("length");', java, 'NativeBridge.java');
const IDA_RANGO = en('if(offset<0||offset>length||size<1||size>length-offset)throw new IllegalArgumentException();', java, 'NativeBridge.java');
const IDA_BOLD = en('case "bold":kind=new TdApi.TextEntityTypeBold();break;', java, 'NativeBridge.java');
// El `switch` de tipos se mide por la primera clave que arma, porque la forma `switch(type){` se repite en el puente.
const IDA_TIPO = IDA_BOLD - 1;
const IDA_ARMADAS = en('entities.add(new TdApi.TextEntity(offset,size,kind));', java, 'NativeBridge.java');
const IDA_ORDEN = en('entities.sort(java.util.Comparator.comparingInt(entity->entity.offset));', java, 'NativeBridge.java');
const VUELTA_URL = en('else if(kind instanceof TdApi.TextEntityTypeUrl&&formatted.text!=null', snapshot, 'NativeSnapshot.java');
const VUELTA_CIFRA = en('else if(kind instanceof TdApi.TextEntityTypeCustomEmoji)item.put("customEmojiId"', snapshot, 'NativeSnapshot.java');

describe('ronda CE · la clase pura con las reglas', () => {
  it('las diez claves que sabe mandar el despacho son las diez que arma Android', () => {
    const declaradas = [...fila(en('public static readonly string[] KnownTypes =', rules, 'DesktopTextEntities.cs') + 1, rules)
      .matchAll(/"(\w+)"/g)].map(match => match[1]);
    const brazos = [...IR.matchAll(/^ {16}"(\w+)" =>/gm)].map(match => match[1]);
    expect(brazos).toEqual(declaradas);
    expect(declaradas).toHaveLength(10);
    const delPuenteAndroid = [...java.slice(IDA_TIPO - 1, IDA_ARMADAS - 1).join('\n').matchAll(/case "(\w+)":/g)].map(match => match[1]);
    expect(fila(IDA_TIPO, java)).toContain('switch(type){');
    expect(new Set(brazos)).toEqual(new Set(delPuenteAndroid));
  });

  it('el techo de cien se dice una sola vez y las otras capas lo repiten por su nombre', () => {
    expect(en('public const int MaxEntities = 100;', rules, 'DesktopTextEntities.cs')).toBeGreaterThan(0);
    expect(veces('100', rulesText)).toBe(1);
    expect(fila(en('public static string? TooManyProblem(int count) =>', rules, 'DesktopTextEntities.cs') + 2, rules))
      .toContain('Telegram admite {MaxEntities}');
    expect(model).toContain('export const MAX_ENTITIES=100;');
    expect(fila(IDA_TECHO, java)).toContain('values.length()>100');
  });

  it('ninguna negativa del parseo se escribe con un literal en el despacho', () => {
    const trecho = [IR, ENLACE, CIFRA].join('\n');
    expect(veces('throw new BridgeException', trecho)).toBe(7);
    expect([...trecho.matchAll(/throw new BridgeException\("/g)]).toHaveLength(0);
    for (const frase of [
      'El mensaje trae ', 'no trae su {property}', 'no cubre ningún carácter', 'no sabe enviar una entidad de tipo',
      'necesita una dirección que empiece por', 'Una entidad de formato no trae su tipo.',
    ]) expect(rulesText, `«${frase}» se dice en la clase`).toContain(frase);
    // La del emoji personalizado no se duplica: es la frase que ya tenía el catálogo para la cara sin cifra.
    expect(veces('Emoji personalizado no válido.', catalog)).toBe(1);
  });
});

describe('ronda CE · el orden de las negativas', () => {
  it('techo, números, rango y por último el tipo: el mismo orden de Android', () => {
    expect(TECHO).toBeLessThan(NUMEROS);
    expect(NUMEROS).toBeLessThan(RANGO);
    expect(RANGO).toBeLessThan(BRAZO);
    expect(BRAZO).toBeLessThan(NEGADA);
    expect(IDA_TECHO).toBeLessThan(IDA_NUMEROS);
    expect(IDA_NUMEROS).toBeLessThan(IDA_RANGO);
    expect(IDA_RANGO).toBeLessThan(IDA_TIPO);
  });

  it('el rango se comprueba principio, longitud que cubra y final que no rebase, en ese orden', () => {
    const principio = en('if (offset < 0 || offset > text.Length)', rules, 'DesktopTextEntities.cs');
    const cubre = en('if (length < 1)', rules, 'DesktopTextEntities.cs');
    const rebase = en('if (length > text.Length - offset)', rules, 'DesktopTextEntities.cs');
    expect(principio).toBeLessThan(cubre);
    expect(cubre).toBeLessThan(rebase);
    expect(fila(principio + 1, rules)).toContain('empieza en {offset} y el mensaje tiene {text.Length}');
    expect(fila(cubre, rules)).toContain('no cubre ningún carácter');
    expect(fila(rebase + 1, rules)).toContain('termina en {offset + length}');
    // Android lo hace en una sola condición, con las mismas comparaciones.
    expect(fila(IDA_RANGO, java)).toContain('offset<0');
    expect(fila(IDA_RANGO, java)).toContain('size>length-offset');
  });

  it('la cifra que no llega se niega por su nombre, no se convierte en cero', () => {
    expect(veces('DesktopTextEntities.MissingNumberProblem(type, "desplazamiento")', IR)).toBe(1);
    expect(veces('DesktopTextEntities.MissingNumberProblem(type, "longitud")', IR)).toBe(1);
    expect(fila(en('public static string MissingNumberProblem(string? type, string property) =>', rules, 'DesktopTextEntities.cs') + 1, rules))
      .toContain('no trae su {property}');
  });
});

describe('ronda CE · la ida', () => {
  it('la ficha personalizada se arma con su documento y sin tocar el texto', () => {
    expect(veces('"customEmoji" => new MessageEntityCustomEmoji { document_id = FaceIdOf(item) },', IR)).toBe(1);
    expect(veces('entity.offset = offset;', IR)).toBe(1);
    expect(veces('entity.length = length;', IR)).toBe(1);
    // Nada del texto se reescribe: la longitud la manda el compositor, que cuenta unidades UTF-16.
    expect(IR).not.toContain('text.Replace');
    expect(CIFRA).toContain('DesktopTextEntities.CustomEmojiId(item, out var error)');
    expect(fila(en('var value = ReadId(entity, "customEmojiId");', rules, 'DesktopTextEntities.cs'), rules)).toContain('ReadId');
  });

  it('la cifra del emoji se lee con la gramática de Android, y el cero y el negativo tampoco valen', () => {
    const leida = en('var value = ReadId(entity, "customEmojiId");', rules, 'DesktopTextEntities.cs');
    const negada = en('if (value is null or <= 0)', rules, 'DesktopTextEntities.cs');
    expect(fila(negada, rules)).toContain('or <= 0');
    expect(leida).toBeLessThan(negada);
    expect(en('error = DesktopEmojiCatalog.BadCustomEmoji;', rules, 'DesktopTextEntities.cs')).toBeGreaterThan(negada);
    expect(catalog).toContain('public const string BadCustomEmoji = "Emoji personalizado no válido.";');
    // Android repite la frase en dos brazos, así que la medida es el `switch` de la ida, no el archivo entero.
    expect(java.slice(IDA_TIPO - 1, IDA_ARMADAS - 1).join('\n'))
      .toContain('if(id<=0)throw new IllegalArgumentException("Emoji personalizado no válido.");');
    // La gramática de la clave: hasta diecinueve dígitos y sin ceros delante.
    expect(fila(en('if (digits.Length == 0 || digits.Length > 19) return null;', rules, 'DesktopTextEntities.cs'), rules)).toContain('> 19');
    expect(veces('if (digits.Length > 1 && digits[0] == \'0\') return null;', rulesText)).toBe(1);
    expect(policy).toContain('matches("-?(0|[1-9][0-9]{0,18})")');
  });

  it('el enlace lleva la dirección que manda el compositor, y si Telegram no la admite se niega', () => {
    expect(veces('"link" => new MessageEntityTextUrl { url = LinkUrlOf(item) },', IR)).toBe(1);
    expect(ENLACE).toContain('DesktopTextEntities.UrlProblem(url)');
    expect(fila(en('private static readonly Regex SendableUrl = new(', rules, 'DesktopTextEntities.cs'), rules))
      .toContain('^(?:https?://|tg://).+');
    expect(fila(en('case "link":{String url=BridgePolicy.text(value,"url",2048);', java, 'NativeBridge.java'), java))
      .toContain('(?i)^(https?://|tg://).+');
  });

  it('salen ordenadas por desplazamiento, como las de Android', () => {
    expect(fila(en('return list.Count > 0 ? [.. list.OrderBy(entity => entity.offset)] : null;', service, 'TelegramService.cs'), service))
      .toContain('OrderBy(entity => entity.offset)');
    expect(fila(IDA_ORDEN, java)).toContain('comparingInt(entity->entity.offset)');
    expect(IDA_ORDEN).toBeGreaterThan(IDA_ARMADAS);
  });

  it('el formato se decide antes de marcar el envío como en curso', () => {
    const parseado = en('var entities = ParseEntities(args, text);', service, 'TelegramService.cs');
    expect(fila(parseado + 1, service)).toContain('_state.Sending = true;');
    expect(fila(parseado - 2, service)).toContain('antes de marcar el envío como en curso');
    expect(fila(parseado - 1, service)).toContain('Android la niega también antes de tocar la red');
  });

  it('la edición pasa el texto a las dos llamadas', () => {
    const parseado = en('var entities = ParseEntities(args, value);', service, 'TelegramService.cs');
    expect(fila(parseado, service)).toContain('ParseEntities(args, value)');
    expect(en('row.Entities = ConvertEntities(entities, value);', service, 'TelegramService.cs')).toBeGreaterThan(parseado);
    expect(veces('ParseEntities(args,', serviceText)).toBe(2);
    expect(veces('ConvertEntities(', serviceText)).toBe(3);
  });
});

describe('ronda CE · la vuelta', () => {
  it('la ficha devuelve su tipo y su cifra, y la cifra viaja en texto', () => {
    expect(veces('MessageEntityCustomEmoji => "customEmoji",', VUELTA)).toBe(1);
    expect(VUELTA).toContain('CustomEmojiId = entity is MessageEntityCustomEmoji face ? face.document_id.ToString() : null');
    // La clave viaja en texto dentro de `EntityDto`; `ReactionDto` tiene una del mismo nombre y no es lo que se
    // comprueba aquí, así que la aguja nombra la clase en vez de conformarse con la declaración suelta.
    expect(clase('EntityDto')).toContain('public string? CustomEmojiId { get; set; }');
    expect(clase('EntityDto')).toContain('La cifra del emoji personalizado, en texto para que JavaScript no la redondee.');
    expect(contract).toContain('customEmojiId?:string');
    expect(fila(VUELTA_CIFRA, snapshot)).toContain('String.valueOf');
    // La cifra se ancla en el comentario del despacho, que es donde la ronda la escribió.
    expect(fila(en('`NativeSnapshot.java:525`: el id viaja como texto', service, 'TelegramService.cs'), service)).toContain('NativeSnapshot.java:525');
  });

  it('un enlace detectado por Telegram trae su dirección copiada del texto', () => {
    const materializada = en('MessageEntityUrl => DesktopTextEntities.TextAsUrl(text, entity.offset, entity.length),', service, 'TelegramService.cs');
    expect(en('MessageEntityTextUrl link => link.url,', service, 'TelegramService.cs')).toBeLessThan(materializada);
    expect(veces('MessageEntityUrl => "link",', VUELTA)).toBe(1);
    expect(fila(en('public static string? TextAsUrl(string text, int offset, int length) =>', rules, 'DesktopTextEntities.cs') + 1, rules))
      .toContain('text.Substring(offset, length)');
    expect(fila(VUELTA_URL, snapshot)).toContain('formatted.text.substring(entity.offset,entity.offset+entity.length)');
  });

  it('lo que la vuelta no conoce se deja fuera sin frase, igual que Android, porque no es culpa del borrador', () => {
    expect(VUELTA).toContain('if (type == null) continue;');
    expect(fila(en('if(type==null)continue;', snapshot, 'NativeSnapshot.java'), snapshot)).toContain('continue');
    // Dos `_ => null` hay en la vuelta: el del tipo y el de la dirección, cada uno en su `switch`.
    expect(veces('_ => null', VUELTA)).toBe(2);
  });

  it('y llamada de verdad, el andamio no tira la entidad al editar', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: 'desktop' });
    const call = designRequest as (method: string, params?: Record<string, unknown>) => Promise<unknown>;
    expect(await call('message.edit', {
      id: '102',
      text: 'Queda lista la ficha',
      entities: [{ type: 'customEmoji', offset: 0, length: 6, customEmojiId: '544028896108879570' }],
    })).toBe(true);
    const row = (transport.snapshot() as { messages: { id: string; entities?: unknown[] }[] })
      .messages.find(item => item.id === '102')!;
    expect(row.entities).toEqual([{ type: 'customEmoji', offset: 0, length: 6, customEmojiId: '544028896108879570' }]);
    // El andamio pasa el arreglo tal cual: lo que aquí se prueba es que no lo filtra, no que el host lo materialice.
    expect(veces('row.entities = Array.isArray(params.entities)', preview)).toBe(1);
  });
});

describe('ronda CE · las citas escritas', () => {
  const anchors: Record<string, string> = {
    'NativeBridge.java:4606': 'if(values.length()>100)',
    'NativeBridge.java:4612': 'if(offset<0||offset>length||size<1||size>length-offset)',
    'NativeBridge.java:4625': 'Emoji personalizado no válido.',
    'NativeBridge.java:4629': 'case "link":',
    'NativeSnapshot.java:523': 'kind instanceof TdApi.TextEntityTypeUrl&&formatted.text',
    'NativeSnapshot.java:525': 'item.put("customEmojiId",String.valueOf',
    'BridgePolicy.java:59': 'static long id(JSONObject params,String key)',
  };

  const lineOf = (file: string, n: number) => {
    const body = file.endsWith('.java') ? rows(`${javaDir}${file}`) : rows(`${host}${file}`);
    const row = body[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  /** Lo que la ronda escribió: la clase nueva y los tres miembros del despacho que la usan. */
  const watched: [string, string][] = [
    ['DesktopTextEntities.cs', rulesText],
    ['TelegramService.cs (ida y vuelta)', [VUELTA, IR, ENLACE, CIFRA].join('\n')],
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

describe('ronda CE · las agujas de las capas tocadas', () => {
  it('las longitudes medidas hoy, con lo que sumó la ronda', () => {
    // Las longitudes se miden hoy sobre los archivos en disco, después de CT y de las rondas posteriores. Los
    // incrementos históricos se explican en sus propias pruebas; aquí solo se fija el tamaño actual de cada capa.
    expect(rules).toHaveLength(134);
    expect(service).toHaveLength(4312);
    expect(stateCs.split(/\r?\n/)).toHaveLength(760);
    expect(java).toHaveLength(5602);
    expect(snapshot).toHaveLength(554);
    expect(policy.split(/\r?\n/)).toHaveLength(63);
    expect(model.split(/\r?\n/)).toHaveLength(202);
    expect(contract.split(/\r?\n/)).toHaveLength(251);
  });
});
