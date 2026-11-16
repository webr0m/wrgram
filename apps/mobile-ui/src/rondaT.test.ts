import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SavedFilter } from './contract';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');
const rules = text('../../desktop/src/WRGram.Desktop/DesktopSavedFilters.cs');
const parity = text('../../desktop/src/WRGram.Desktop/DesktopParity.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const state = text('../../desktop/src/WRGram.Desktop/DesktopState.cs');
const preview = text('./preview.ts');
const app = text('./App.tsx');

/** Las cinco frases del flujo, tal como las dice Android y tal como las repite el host de Windows. */
const SENTENCES: [string, string][] = [
  ['TooMany', 'Puedes guardar hasta 20 filtros de búsqueda.'],
  ['NoName', 'Escribe un nombre para el filtro.'],
  ['BadFilter', 'Filtro de búsqueda no válido.'],
  ['BadMode', 'El modo del filtro no es válido.'],
  ['NeedsText', 'La búsqueda necesita texto o un filtro.'],
];

/** Cuerpo de un método de C#, desde su firma hasta la llave que lo cierra. */
function csBody(name: string, from = rules): string {
  const start = from.search(new RegExp(`(?:private|public|internal|static)[^\\n;=]*\\b${name}\\(`));
  expect(start, `${name} existe`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = from.indexOf('{', start); i < from.length; i++) {
    if (from[i] === '{') depth++;
    else if (from[i] === '}' && --depth === 0) return from.slice(start, i + 1);
  }
  throw new Error(`Sin cierre para ${name}`);
}

/** Las claves de un `switch` de cadenas —en Java con `case`, en C# también como expresión con `=>`. */
function caseKeys(source: string, from: string): string[] {
  const start = source.indexOf(from);
  expect(start, from).toBeGreaterThan(-1);
  const body = source.slice(start, source.indexOf('}', start));
  return [...body.matchAll(/case "([^"]*)"|"([^"]*)"\s*=>/g)].map(match => match[1] ?? match[2] ?? '');
}

describe('ronda T · guardar un filtro dice lo mismo en Android y en Windows', () => {
  it.each(SENTENCES)('%s: la frase literal de Android está escrita en el puente de escritorio', (key, sentence) => {
    expect(java, `Java lanza "${sentence}"`).toContain(`IllegalArgumentException("${sentence}")`);
    expect(rules, `C# declara ${key}`).toContain(`public const string ${key} = "${sentence}";`);
  });

  it('el tipo de medio inválido se rechaza con una sola frase, no con dos', () => {
    expect(parity).toContain('_ => throw new BridgeException(DesktopSavedFilters.BadFilter)');
    expect(parity.includes('El filtro de búsqueda no es válido.')).toBe(false);
    expect(service.includes('El filtro de búsqueda no es válido.')).toBe(false);
  });

  it('los topes son los de Android, letra a letra', () => {
    expect(java).toContain('if(list.length()>=20)');
    expect(java).toContain('BridgePolicy.text(params,"name",32)');
    expect(java).toContain('BridgePolicy.text(params,"query",100)');
    expect(java).toContain('BridgePolicy.text(params,"filter",16)');
    expect(java).toContain('BridgePolicy.text(params,"mode",8)');
    expect(java).toContain('BridgePolicy.text(params,"id",24)');
    expect(java).toContain('if(query.length()<2&&filter.isEmpty())');
    expect(rules).toContain('public const int Max = 20;');
    expect(rules).toContain('public const int NameLimit = 32;');
    expect(rules).toContain('public const int QueryLimit = 100;');
    expect(rules).toContain('public const int FilterLimit = 16;');
    expect(rules).toContain('public const int ModeLimit = 8;');
    expect(rules).toContain('public const int IdLimit = 24;');
    expect(rules).toContain('public const int MinQuery = 2;');
  });

  it('el orden de los descartes es el de Android', () => {
    const body = java.slice(java.indexOf('private void searchFilters'), java.indexOf('private void checklistSend'));
    const throws = [...body.matchAll(/throw new IllegalArgumentException\("([^"]+)"\)/g)].map(match => match[1]);
    expect(throws).toEqual([
      'Puedes guardar hasta 20 filtros de búsqueda.',
      'Escribe un nombre para el filtro.',
      'El modo del filtro no es válido.',
      'La búsqueda necesita texto o un filtro.',
    ]);
    // Las otras dos condenas viven en métodos propios de Android, en la misma posición de la secuencia.
    expect(body).toContain('messageFilter(filter);');
    expect(body.indexOf('messageFilter(filter);')).toBeLessThan(body.indexOf('String mode=BridgePolicy.text(params,"mode",8);'));
    expect(body).toContain('if(!chatId.isEmpty())chatId=Long.toString(BridgePolicy.id(params,"chatId"));');
    expect(body.indexOf('if(!chatId.isEmpty())chatId=Long.toString')).toBeGreaterThan(body.indexOf('if(query.length()<2'));
    expect([...csBody('SaveProblem').matchAll(/return ([A-Za-z]+);/g)].map(match => match[1])).toEqual([
      'TooMany', 'BadText', 'NoName', 'BadText', 'BadText', 'BadFilter', 'BadText', 'BadMode', 'NeedsText', 'BadChat', 'null',
    ]);
  });

  it('las doce claves de medio son las mismas en las tres capas', () => {
    const expected = ['', 'photos', 'videos', 'photoVideo', 'documents', 'audio', 'voice', 'videoNotes',
      'animations', 'links', 'polls', 'mentions'];
    expect(caseKeys(java, 'private static TdApi.SearchMessagesFilter messageFilter')).toEqual(expected);
    expect(caseKeys(parity, 'private static MessagesFilter? SearchFilter(string key)')).toEqual(expected);
    const declared = rules.slice(rules.indexOf('public static readonly string[] Keys'));
    expect([...declared.slice(0, declared.indexOf('};')).matchAll(/"([^"]*)"/g)].map(match => match[1])).toEqual(expected);
    const media = preview.slice(preview.indexOf('const SEARCH_MEDIA'), preview.indexOf('};', preview.indexOf('const SEARCH_MEDIA')));
    for (const key of expected.slice(1)) expect(media, `la vista de diseño conoce "${key}"`).toContain(`${key}:`);
    expect(preview).toContain("if (filter !== '' && !(filter in SEARCH_MEDIA)) throw new Error('Filtro de búsqueda no válido.');");
  });

  it('los tres caminos del flujo están despachados en escritorio', () => {
    expect(service).toContain('"search.filters.list" => SavedFilters(args, save: false, delete: false),');
    expect(service).toContain('"search.filters.save" => SavedFilters(args, save: true, delete: false),');
    expect(service).toContain('"search.filters.delete" => SavedFilters(args, save: false, delete: true),');
    expect(rules).toContain('public static string? DeleteProblem(Values values)');
  });

  it('la lista vive en este dispositivo y no se mezcla entre cuentas', () => {
    expect(java).toContain('SharedPreferences store=activity.getSharedPreferences("search_filters",0);');
    expect(java).toContain('String key=session.slot+"."+session.selfId;');
    expect(parity).toContain('Path.Combine(_store.Root, "search-filters.json")');
    expect(parity).toContain('var account = "u" + CollectionClient().User!.id;');
    expect(parity).toContain('if (file == null || file.Account != account) return [];');
    expect(parity).toContain('System.IO.File.Move(temp, SavedFiltersPath, overwrite: true);');
    expect(state).toContain('public sealed class SavedFilterFileDto');
    expect(state).toContain('public List<DesktopSavedFilters.Entry> Filters { get; set; } = new();');
  });

  it('el identificador siguiente sale de la misma cuenta que en Android', () => {
    expect(java).toContain('if(id.matches("f[0-9]{1,6}"))max=Math.max(max,Integer.parseInt(id.substring(1)));');
    expect(java).toContain('JSONObject item=object("id","f"+(max+1)');
    const next = csBody('NextId');
    expect(next).toContain('return "f" + (max + 1);');
    expect(csBody('Shaped')).toContain('id.Length is < 2 or > 7 || id[0] != \'f\'');
  });

  it('la interfaz sigue usando un solo contrato para las dos capas', () => {
    expect(app).toContain("request<SavedFilter[]>('search.filters.list')");
    expect(app).toContain("run<SavedFilter[]>('search.filters.save',{name:clean,query:searchQuery.trim(),filter:searchFilter,mode:searchMode");
    expect(app).toContain("run<SavedFilter[]>('search.filters.delete',{id:item.id})");
    expect(parity).toContain('chatId = entry.ChatId');
  });
});

type DesignCall = (method: string, params?: Record<string, unknown>) => Promise<unknown>;

// `preview.ts` arrastra `bridge.ts`, que vive del `window` del navegador; se le da un window vacío y se
// recarga el módulo con el estado de serie plantado, igual que hace `main.tsx` al arrancar la vista.
let call: DesignCall = async () => undefined;
beforeEach(async () => {
  vi.stubGlobal('window', {});
  vi.resetModules();
  const { fixture, designRequest } = await import('./preview');
  (await import('./bridge')).acceptState(fixture);
  call = designRequest as DesignCall;
});

const filters = async (params: Record<string, unknown> = {}) => (await call('search.filters.list', params)) as SavedFilter[];
const save = (params: Record<string, unknown>) => call('search.filters.save', params) as Promise<SavedFilter[]>;

describe('ronda T · la vista de diseño guarda, lista y borra con las frases del puente', () => {
  it('la ronda entera: lista de serie, guardar, reaparecer y borrar', async () => {
    const seed = await filters();
    expect(seed).toHaveLength(1);
    expect(seed[0]).toMatchObject({ id: 'f1', name: 'Bocetos de la barra', query: 'boceto', mode: 'chat', chatId: '17' });
    const saved = await save({ name: 'Enlaces del canal', query: 'https://', filter: 'links', mode: 'global' });
    expect(saved).toHaveLength(2);
    expect(saved[1]).toMatchObject({ id: 'f2', name: 'Enlaces del canal', filter: 'links', mode: 'global' });
    expect(saved[1].chatId).toBeUndefined();
    expect(await filters()).toHaveLength(2);
    const kept = (await call('search.filters.delete', { id: 'f1' })) as SavedFilter[];
    expect(kept.map(item => item.id)).toEqual(['f2']);
    // Borrar algo que no está no es un error: Android simplemente devuelve la lista tal cual.
    expect(await call('search.filters.delete', { id: 'f99' })).toHaveLength(1);
  });

  it('los seis descartes salen con la frase que también usa Windows', async () => {
    await expect(save({ name: '', query: 'boceto', filter: '', mode: 'chat' })).rejects.toThrow('Escribe un nombre para el filtro.');
    await expect(save({ name: '   ', query: 'boceto', filter: '', mode: 'chat' })).rejects.toThrow('Escribe un nombre para el filtro.');
    await expect(save({ name: 'x'.repeat(33), query: 'boceto', filter: '', mode: 'chat' })).rejects.toThrow('Invalid text');
    await expect(save({ name: 'Sin nada', query: '', filter: '', mode: 'chat' })).rejects.toThrow('La búsqueda necesita texto o un filtro.');
    await expect(save({ name: 'Mal tipo', query: 'boceto', filter: 'stickers', mode: 'chat' })).rejects.toThrow('Filtro de búsqueda no válido.');
    await expect(save({ name: 'Mal modo', query: 'boceto', filter: '', mode: 'band' })).rejects.toThrow('El modo del filtro no es válido.');
    // Una consulta de un solo carácter vale con filtro de medio, pero no sin él: el orden manda.
    expect(await save({ name: 'Corto con filtro', query: 'a', filter: 'links', mode: 'chat' })).toHaveLength(2);
  });

  it('el tope de veinte se corta antes de preguntar y numera seguidos', async () => {
    for (let index = 0; index < 19; index++) await save({ name: `Filtro ${index}`, query: 'boceto', filter: '', mode: 'chat' });
    expect((await filters()).map(item => item.id).at(-1)).toBe('f20');
    await expect(save({ name: 'El veintiuno', query: 'boceto', filter: '', mode: 'chat' }))
      .rejects.toThrow('Puedes guardar hasta 20 filtros de búsqueda.');
  });

  it('lo que no es texto no se acepta, aunque quepa', async () => {
    await expect(save({ name: 42, query: 'boceto', filter: '', mode: 'chat' })).rejects.toThrow('Invalid text');
    await expect(save({ query: 'boceto', filter: '', mode: 'chat' })).rejects.toThrow('Invalid text');
    await expect(call('search.filters.delete', {})).rejects.toThrow('Invalid text');
  });

  it('el filtro guardado recuerda texto, tipo y alcance, y nada de autor ni fechas', async () => {
    await save({ name: 'Con banda', query: 'boceto', filter: '', mode: 'chat', chatId: '17' });
    const stored = (await call('search.filters.list')) as (SavedFilter & Record<string, unknown>)[];
    expect(Object.keys(stored[1]).sort()).toEqual(['chatId', 'filter', 'id', 'mode', 'name', 'query']);
    // La interfaz limpia autor y fechas al reaplicar: el nombre del filtro no promete esos criterios.
    expect(app).toContain("setSearchSender('');setSince('');setUntilDay('');");
  });
});
