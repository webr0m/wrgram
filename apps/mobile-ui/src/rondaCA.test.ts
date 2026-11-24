import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (url: string) => readFileSync(new URL(url, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const java = (name: string) => read(`../../mobile/android/app/src/main/java/cc/webrom/wrgram/${name}.java`);
const cs = (name: string) => read(`../../desktop/src/WRGram.Desktop/${name}.cs`);
const line = (source: string, at: number) => {
  const entry = source.split('\n')[at - 1];
  if (entry === undefined) throw new Error(`La línea ${at} no existe`);
  return entry;
};

/** El cuerpo de un método Java: desde la firma hasta la llave que lo cierra al mismo nivel. */
const body = (source: string, start: string) => {
  const open = source.indexOf(start);
  if (open < 0) throw new Error(`No se encuentra ${start}`);
  const brace = source.indexOf('{', open);
  let depth = 0;
  for (const [index, character] of source.slice(brace).split('').entries()) {
    if (character === '{') depth++;
    if (character === '}' && --depth === 0) return source.slice(brace, brace + index + 1);
  }
  throw new Error(`Llave sin cerrar tras ${start}`);
};

/** El trozo de un archivo entre dos anclas, para mirar un solo método o una sola rama de una muestra. */
const slice = (source: string, from: string, to: string) => {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`No se cierra ${from}`);
  return source.slice(start, end);
};

const CHANNEL_IDS = ['members', 'viewsPerPost', 'sharesPerPost', 'reactionsPerPost', 'viewsPerStory', 'sharesPerStory', 'reactionsPerStory', 'notifications'];
const GROUP_IDS = ['members', 'messages', 'viewers', 'senders'];

describe('ronda CA · las estadísticas de una comunidad las dice una sola vez el mismo contrato', () => {
  const shared = java('GroupChatStats');
  const bridge = java('NativeBridge');
  const policy = java('BridgePolicy');
  const flow = cs('DesktopGroupStatsFlow');
  const stats = cs('DesktopGroupStats');
  const catalog = read('./groupStats.ts');
  const sample = read('./preview.ts');

  it('las tres capas se reparten el cable: orden en la lista, brazo en cada host, entrada en la pantalla', () => {
    expect(policy).toContain('"groups.stats"');
    expect(line(bridge, 887)).toContain('case "groups.stats":');
    expect(line(bridge, 887)).toContain('new TdApi.GetChatStatistics(statsChat.id,false)');
    expect(line(bridge, 887)).toContain('GroupChatStats.dto(stats,');
    expect(read('./desktopScope.ts')).toContain("'groups.stats'");
    expect(cs('TelegramService')).toContain('"groups.stats" => await GroupStatsAsync(args)');
    // La entrada que la pide, sin guarda de plataforma: las dos capas contestan.
    const app = read('./App.tsx');
    expect(line(app, 945)).toContain("chat.supergroup===true||chat.type==='channel'");
    expect(line(app, 945)).toContain('label="Estadísticas"');
    expect(line(app, 945)).toContain('setStatsChat(chat)');
    expect(line(app, 1277)).toContain('<GroupStatsPanel chat={statsChat}');
    // Y ningún archivo se movió de su aguja sin que la ronda lo sepa. Las longitudes se miden hoy sobre el texto
    // en disco, incluidos los desplazamientos que acumularon CH-A, CH-A2 y CT.
    expect(bridge.split('\n').length - 1).toBe(5601);
    expect(policy.split('\n').length - 1).toBe(62);
    expect(app.split('\n').length - 1).toBe(1592);
    expect(read('./contract.ts').split('\n').length - 1).toBe(250);
  });

  it('las fichas de cada forma son las del catálogo, en su orden y en las dos bibliotecas', () => {
    const dto = body(shared, 'public static JSONObject dto(TdApi.ChatStatistics value');
    const javaChannel = [...slice(dto, 'TdApi.ChatStatisticsChannel channel =', 'TdApi.ChatStatisticsSupergroup group =')
      .matchAll(/put\(cards, "([A-Za-z]+)"/g)].map(hit => hit[1]);
    expect(javaChannel).toEqual(CHANNEL_IDS.slice(0, 7));
    expect(shared).toContain('cards.put(new JSONObject().put("id", "notifications").put("value"');
    const javaGroup = [...slice(dto, 'TdApi.ChatStatisticsSupergroup group =', 'out.put("values"').matchAll(/put\(cards, "([A-Za-z]+)"/g)].map(hit => hit[1]);
    expect(javaGroup).toEqual(GROUP_IDS);

    const channelCs = [...slice(stats, 'Dto(Stats_BroadcastStats stats)', 'Dto(Stats_MegagroupStats')
      .matchAll(/Card\("([A-Za-z]+)"/g)].map(hit => hit[1]);
    expect(channelCs).toEqual(CHANNEL_IDS);
    const groupCs = [...slice(stats, 'Dto(Stats_MegagroupStats stats', 'private static Dictionary<string, object?> Build')
      .matchAll(/Card\("([A-Za-z]+)"/g)].map(hit => hit[1]);
    expect(groupCs).toEqual(GROUP_IDS);

    // El catálogo español es la misma lista, y es el único sitio donde vive una etiqueta.
    expect(catalog).toContain(`export const CHANNEL_STAT_IDS = ['${CHANNEL_IDS.join("', '")}'];`);
    expect(catalog).toContain(`export const GROUP_STAT_IDS = ['${GROUP_IDS.join("', '")}'];`);
    // Windows no puede llamarse a sí mismo con otra lista: la clave de MTProto va nombrada junto a su ficha.
    for (const key of ['followers', 'views_per_post', 'shares_per_post', 'reactions_per_post', 'views_per_story',
      'shares_per_story', 'reactions_per_story', 'enabled_notifications', 'posters', 'top_posters', 'avg_chars']) {
      expect(stats).toContain(key);
    }
  });

  it('lo que Telegram no contesta se omite, y el periodo anterior solo viaja si la biblioteca lo sabe', () => {
    const put = body(shared, 'private static void put(JSONArray cards');
    expect(put).toContain('if (value == null || !Double.isFinite(value.value)) return;');
    expect(put).toContain('if (Double.isFinite(value.previousValue)) card.put("previous", value.previousValue);');
    const card = slice(stats, 'public static Dictionary<string, object?>? Card(string id', 'public static Dictionary<string, object?>? PercentCard');
    expect(card).toContain('if (value == null || !double.IsFinite(value.current)) return null;');
    expect(card).toContain('if (double.IsFinite(value.previous)) card["previous"] = value.previous;');
    // El porcentaje no tiene pasado en ninguna de las dos capas: aquí es un ratio y allá un double suelto.
    const percent = slice(stats, 'public static Dictionary<string, object?>? PercentCard', 'public static void Period');
    expect(percent).toContain('ratio.part / ratio.total * 100');
    expect(percent).not.toContain('previous');
    expect(line(shared, 62)).toContain('cards.put(new JSONObject().put("id", "notifications").put("value"');
    // Y la muestra de diseño repite la regla: siete fichas con su anterior y las notificaciones solas.
    const channelSample = slice(sample, "kind: 'channel'", "kind: 'group'");
    expect([...channelSample.matchAll(/\{ id: '([A-Za-z]+)'/g)].map(hit => hit[1])).toEqual(CHANNEL_IDS);
    expect(channelSample).toContain("{ id: 'notifications', value: 64.5 }");
    expect([...channelSample.matchAll(/previous:/g)].length).toBe(7);
    const groupSample = sample.slice(sample.indexOf("kind: 'group'"));
    expect([...groupSample.matchAll(/\{ id: '([A-Za-z]+)'/g)].map(hit => hit[1])).toEqual(GROUP_IDS);
    expect([...groupSample.matchAll(/\{ name: /g)].length).toBe(3);
    expect(groupSample).toContain('name: ROSTER_UNKNOWN_NAME');
  });

  it('el periodo se escribe como fecha y con ceros no hay fecha que escribir', () => {
    const range = body(shared, 'private static void putRange');
    expect(range).toContain('if (period.startDate <= 0 || period.endDate <= 0) return;');
    expect(body(shared, 'private static String day')).toContain('"%04d-%02d-%02d"');
    const period = body(stats, 'public static void Period');
    expect(period).toContain('if (period == null || period.min_date == default || period.max_date == default) return;');
    expect(period).toContain('"yyyy-MM-dd"');
    // Y la pantalla formatea la fecha ella sola, sin preguntar en qué capa se fabricó.
    expect(body(catalog, 'export function statDate')).toContain("`${parts[3]}/${parts[2]}/${parts[1]}`");
  });

  it('los nombres salen por la regla de la casa y el derecho lo decide Telegram en las dos capas', () => {
    expect(line(bridge, 887)).toContain('String statsName=PersonName.of(statsUser)');
    expect(line(bridge, 887)).toContain('return statsName==null?"Usuario de Telegram":statsName;');
    expect(line(bridge, 887)).toContain('session.requestUser(id)');
    expect(flow).toContain('user => DesktopGroupRoster.Name(user as User)');
    // Ninguna de las dos capas pregunta el derecho antes de ir a la red: el rechazo lo da Telegram, en el mismo viaje.
    expect(line(bridge, 885)).not.toContain('GetChatMember');
    expect(flow).not.toContain('SelfParticipantAsync');
    expect(body(shared, 'public static String explain')).toContain('if (error.contains("(403)")) return NO_RIGHT;');
    expect(stats).toContain('_ when Starts(error, "CHAT_ADMIN_REQUIRED") => NoRight');
  });

  it('las frases compartidas son idénticas carácter a carácter y el rechazo sin medida viaja tal cual', () => {
    for (const [literal, key] of [
      ['Las estadísticas solo existen en supergrupos y canales.', 'notCommunity'],
      ['Telegram no concede a esta cuenta el permiso para ver las estadísticas de la comunidad.', 'noRight'],
    ] as const) {
      expect(catalog).toContain(`${key}: '${literal}',`);
      expect(shared).toContain(`"${literal}"`);
      expect(stats).toContain(`"${literal}"`);
    }
    expect(shared).toContain('"La cuenta cambió. Vuelve a abrir la conversación."');
    expect(flow).toContain('DesktopGroupStats.ChangedAccount');
    expect(shared).toContain('return error;'); // Lo que no se midió no se reescribe.
    expect(flow).toContain('if (refusal == null) throw;');
    expect(stats).toContain('public const string WrongShape');
    // Y el paracaídas de Android tiene su prueba JVM, no solo su frase.
    const junit = read('../../mobile/android/app/src/test/java/cc/webrom/wrgram/GroupChatStatsTest.java');
    expect(junit.split('\n').filter(entry => entry.trim() === '@Test').length).toBe(4);
    expect(junit).toContain('aNumberTelegramDidNotAnswerIsOmittedInsteadOfZero');
    expect(junit).toContain('theRefusalKeepsItsOwnWords');
  });
});
