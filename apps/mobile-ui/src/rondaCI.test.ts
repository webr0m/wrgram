import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';

/**
 * Ronda CI — los tres enlaces de una lista colaborativa en Windows: listar, renombrar y revocar.
 *
 * La CG midió por reflexión que WTelegramClient 4.4.10 tiene con qué (`Chatlists_GetExportedInvites`,
 * `Chatlists_EditExportedInvite`, `Chatlists_DeleteExportedInvite`), así que estas tres claves no estaban pendientes
 * por falta de biblioteca sino por falta de brazo: `desktopScope.ts:24` las llevaba en «pendiente» junto a las notas,
 * que ésas sí siguen sin con qué (`desktopScope.ts:102`). Android las atiende desde hace rondas —listar en
 * `NativeBridge.java:3955`, editar y borrar en la misma función `NativeBridge.java:3966`— y la pantalla ya tenía su
 * panel, que en Windows solo podía leer el vacío porque ningún brazo contestaba.
 *
 * **Los tres brazos van pegados.** `TelegramService.cs:443` lista, `TelegramService.cs:444` renombra y
 * `TelegramService.cs:445` revoca, en ese orden y detrás de `folders.join`, como las tres claves del puente de Android.
 * Detrás hay dos cuerpos: `DesktopParity.cs:712` para la lectura, que arma el DTO que la pantalla consume, y
 * `DesktopParity.cs:728` para las dos escrituras, que comparten cuerpo y se separan por la bandera `delete` —la misma
 * pareja que en Java— porque las dos necesitan la comprobación de carpeta que hace `DesktopParity.cs:703`.
 *
 * **El enlace se nombra de dos formas distintas y ahí está toda la traducción.** TDLib lo nombra por su URL entera
 * (`NativeBridge.java:3969`), MTProto por un `slug` suelto. La regla sale de una sola función,
 * `DesktopFolderLinks.cs:95`, y acepta las dos escrituras que `ExportedChatlistInvite.url` puede traer porque ninguna
 * capa ha preguntado nunca a una cuenta real cuál es la suya; lo que sí corta es la mitad con barra, que no es un
 * `slug` sino media URL. Buscar el enlace vivo se hace con esa misma regla (`DesktopFolderLinks.cs:107`), y la guarda
 * que lo declara muerto está en `DesktopParity.cs:738`. El mismo `SlugOf` lo usa ahora el `folders.join` de la ronda G
 * (`DesktopParity.cs:671`), que aceptaba esa mitad con barra dentro y la mandaba a la red.
 *
 * **Renombrar no es reenviar los chats.** MTProto trae banderas `has_title` y `has_peers` para decir «ese campo no lo
 * toco»; TDLib no, y por eso su edición reenvía los ids que acaba de leer (`NativeBridge.java:3980`). Aquí se manda
 * solo el título. Y cambiar los chats de un enlace ya creado es en Android un selector nativo
 * (`NativeBridge.java:4005`) que este host no tiene con qué mandar: se niega por su nombre (`DesktopFolderLinks.cs:84`,
 * llamado en `DesktopParity.cs:746`) y la pantalla deja de ofrecer el botón (`FolderLinks.tsx:55`), la misma norma con la
 * que la BY quitó el «Quitar» del estado emoji; la bandera de plataforma la lee el panel en `FolderLinks.tsx:8`.
 *
 * Las frases de la ronda están escritas una sola vez en toda la capa: la del enlace muerto vive en
 * `DesktopFolderLinks.cs:58` y la cota del nombre en `DesktopFolderLinks.cs:116`, que es el mismo 32 con el que Android
 * recorta el suyo (`NativeBridge.java:3970`).
 *
 * Como en CF, CM, CN, CB, BM y BY: la última prueba mide las citas. Todo `Archivo:NNN` escrito por la ronda tiene que
 * estar en la tabla y señalar hoy la línea que la frase afirma, incluidas las que la propia clase escribe para
 * explicar de dónde sacó cada regla.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const service = rows(`${host}TelegramService.cs`);
const parity = rows(`${host}DesktopParity.cs`);
const links = rows(`${host}DesktopFolderLinks.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const panel = rows('./FolderLinks.tsx');
const scope = rows('./desktopScope.ts');
const bridge = rows('./bridge.ts');
const emoji = rows('./EmojiStatusSettings.tsx');

const en = (needle: string, body: string[], where: string) => {
  const index = body.findIndex(row => row.includes(needle));
  if (index < 0) throw new Error(`Ninguna línea de ${where} dice ${needle}`);
  return index + 1;
};
const atServ = (n: string) => en(n, service, 'TelegramService.cs');
const atPar = (n: string) => en(n, parity, 'DesktopParity.cs');
const atLink = (n: string) => en(n, links, 'DesktopFolderLinks.cs');
const atJava = (n: string) => en(n, java, 'NativeBridge.java');
const atPanel = (n: string) => en(n, panel, 'FolderLinks.tsx');
const atScope = (n: string) => en(n, scope, 'desktopScope.ts');

/** El cuerpo de un método C#, delgado por balance de llaves a partir de su firma. */
function body(lines: string[], signature: string, where: string) {
  const start = lines.findIndex(row => row.includes(signature));
  if (start < 0) throw new Error(`Falta ${signature} en ${where}`);
  let depth = 0;
  for (let index = start; index < lines.length; index++) {
    for (const char of lines[index]) {
      if (char === '{') depth++;
      else if (char === '}' && --depth === 0) return lines.slice(start, index + 1).join('\n');
    }
  }
  throw new Error(`${signature} no cierra su llave en ${where}`);
}

/** El literal C# de una constante de `DesktopFolderLinks`, buscado por nombre y no por número de línea. */
function csLiteral(name: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(links.join('\n'));
  if (match) return match[1].replace(/\\"/g, '"');
  const wrapped = new RegExp(`\\b${name}\\s*=\\s*\\n\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(links.join('\n'));
  if (!wrapped) throw new Error(`Falta la constante ${name} en DesktopFolderLinks.cs`);
  return wrapped[1].replace(/\\"/g, '"');
}
const csNumber = (name: string) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(links.join('\n'))?.[1]);
/** La frase que Android pronuncia en su `answer.fail`, medida dentro de la línea que se le diga. */
function javaFail(at: number) {
  const match = /answer\.fail\("((?:[^"\\]|\\.)*)"\)/.exec(java[at - 1] ?? '');
  if (!match) throw new Error(`La línea ${at} de NativeBridge.java no falla con frase propia`);
  return match[1];
}

/** El despacho recortado como lo recortan BJ, BK y BM: brazos vivos, brazos que se niegan y su línea. */
function dispatch() {
  const start = service.findIndex(row => row.includes('object? result = method switch'));
  const generic = service.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  const arms = new Map<string, number>();
  service.slice(start, generic + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    for (const match of row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)) arms.set(match[1], start + offset + 1);
  });
  return { start: start + 1, generic: generic + 1, arms };
}
const cable = dispatch();
const denied = (method: string) => /=>\s*throw\b/.test(service[(cable.arms.get(method) ?? 1) - 1] ?? '');

/** Las frases de esta ronda, contadas en toda la capa de escritorio: cada una tiene que decirse una sola vez. */
const desktopSources = readdirSync(new URL(host, import.meta.url))
  .filter(name => name.endsWith('.cs'))
  .map(name => text(`${host}${name}`));
const veces = (phrase: string) => desktopSources.join('\n').split(phrase).length - 1;

const LINKS = ['folders.links.list', 'folders.links.edit', 'folders.links.delete'] as const;

describe('ronda CI · el cable de los tres enlaces en Windows', () => {
  it('las tres claves tienen brazo, van pegadas y cada una llama a su método', () => {
    const first = cable.arms.get('folders.links.list');
    expect(first, 'folders.links.list sigue sin brazo').toBeTypeOf('number');
    LINKS.forEach((key, index) => {
      expect(cable.arms.has(key), `${key} no tiene brazo`).toBe(true);
      expect(denied(key), `${key} se niega a sí misma`).toBe(false);
      expect(cable.arms.get(key), `${key} no va pegada a la anterior`).toBe(first! + index);
    });
    expect(service[first! - 1]).toContain('"folders.links.list" => await FolderLinksListAsync(args),');
    expect(service[first!]).toContain('"folders.links.edit" => await FolderLinkChangeAsync(args, delete: false),');
    expect(service[first! + 1]).toContain('"folders.links.delete" => await FolderLinkChangeAsync(args, delete: true),');
    // Las dos escrituras comparten manejador y lo que las separa es la bandera, igual que en Android.
    expect(atServ('"folders.link" =>')).toBeLessThan(first!);
    expect(atServ('"folders.join" =>')).toBeLessThan(first!);
  });

  it('la misma pareja clave→método, medida en el puente de Android', () => {
    const cases = LINKS.map(key => atJava(`case "${key}":`));
    expect(cases).toEqual([...cases].sort((a, b) => a - b));
    expect(java[cases[0] - 1]).toContain('case "folders.links.list":folderLinks(p,a);break;');
    expect(java[cases[1] - 1]).toContain('case "folders.links.edit":folderLinkChange(p,a,false);break;');
    expect(java[cases[2] - 1]).toContain('case "folders.links.delete":folderLinkChange(p,a,true);break;');
    // Las tres están declaradas en la lista del puente: afirmar sobre una clave que ninguna capa conoce es una promesa vacía.
    for (const key of LINKS) expect(policy).toContain(`"${key}"`);
    // Y el `delete:` de C# es el booleano que Java pasa por posición, no una cifra copiada.
    expect(atPar('private async Task<object> FolderLinkChangeAsync(JsonElement args, bool delete)'))
      .toBeTypeOf('number');
    expect(body(parity, 'private async Task<object> FolderLinkChangeAsync', 'DesktopParity.cs'))
      .toContain('if (delete)');
  });

  it('el brazo de listar contesta las tres claves que la pantalla lee', () => {
    const listed = body(parity, 'private async Task<object> FolderLinksListAsync', 'DesktopParity.cs');
    expect(listed).toContain('Chatlists_GetExportedInvites');
    // El DTO que arma es el que la pantalla consume, clave por clave.
    for (const key of ['link = invite.url', 'name = invite.title', 'chatIds =']) expect(listed).toContain(key);
    expect(atPanel("await run<Invite[]>('folders.links.list', { id })")).toBeGreaterThan(0);
  });

  it('el slug se saca, no se supone: las dos escrituras valen y la mitad con barra no', () => {
    const slug = body(links, 'public static string? SlugOf', 'DesktopFolderLinks.cs');
    expect(slug).toContain('(?:t\\.me|telegram\\.me)/addlist/([A-Za-z0-9_\\-]+)');
    expect(slug).toContain('match.Success ? match.Groups[1].Value : value.TrimStart(\'/\')');
    expect(slug).toContain('slug.Contains(\'/\')');
    expect(csNumber('MaxSlug')).toBe(64);
    // El techo del identificador es el mismo que la ronda G ya cortaba, ahora escrito una sola vez.
    expect(slug).toContain('slug.Length is < 1 or > MaxSlug');
    // `folders.join` dejó de aceptar la mitad sin dominio: llama a la misma función.
    const join = body(parity, 'private async Task<object> FolderJoinAsync', 'DesktopParity.cs');
    expect(join).toContain('DesktopFolderLinks.SlugOf(Str(args, "link"))');
    expect(join).not.toContain('Regex');
    // Y la comparación del cambio de enlace también se hace por slug, no por cadena entera.
    expect(body(links, 'public static ExportedChatlistInvite? Find', 'DesktopFolderLinks.cs'))
      .toContain('SlugOf(invite.url) == slug');
  });

  it('renombrar no es reenviar los chats, y cambiarlos se niega por su nombre', () => {
    const change = body(parity, 'private async Task<object> FolderLinkChangeAsync', 'DesktopParity.cs');
    expect(change).toContain('Chatlists_EditExportedInvite(input, slug, title: name)');
    // `peers` viaja en su defecto: es la bandera `has_peers` de MTProto diciendo «ese campo no lo toco».
    expect(change).not.toContain(', peers:');
    expect(change).toContain('if (Bool(args, "chooseChats")) throw new BridgeException(DesktopFolderLinks.NoPicker);');
    // En Android la misma orden abre un selector nativo; aquí no hay con qué mandarlo, así que se niega.
    expect(atJava('private void chooseFolderChats(String title,String description,String action,long[] ids,long[] included,Answer answer,')).toBeGreaterThan(0);
    expect(csLiteral('NoPicker')).toContain('no tiene selector para cambiar los chats de un enlace ya creado');
  });

  it('el orden de las guardas, medido dentro del cuerpo y no de memoria', () => {
    const change = body(parity, 'private async Task<object> FolderLinkChangeAsync', 'DesktopParity.cs');
    const steps: [string, string][] = [
      ['sesión', 'var client = CollectionClient();'],
      ['enlace', 'DesktopFolderLinks.SlugOf(Str(args, "link"))'],
      ['nombre', 'DesktopFolderLinks.NameAllowed(name)'],
      ['carpeta', 'await RequireChatlistAsync((int)Long(args, "id"));'],
      ['lectura', 'Chatlists_GetExportedInvites(input)'],
      ['enlace vivo', 'DesktopFolderLinks.Find(listed.invites, slug)'],
      ['escritura', 'Chatlists_DeleteExportedInvite'],
      ['selector', 'if (Bool(args, "chooseChats"))'],
      ['renombrar', 'Chatlists_EditExportedInvite'],
    ];
    const at = steps.map(([label, needle]) => {
      const index = change.indexOf(needle);
      if (index < 0) throw new Error(`${label} no está en FolderLinkChangeAsync`);
      return index;
    });
    // Todo lo que se puede negar sin red cae antes de la red, y escribir es lo último.
    expect(at[0]).toBeLessThan(at[4]);
    expect(at[1]).toBeLessThan(at[4]);
    expect(at[2]).toBeLessThan(at[4]);
    expect(at[3]).toBeLessThan(at[4]);
    expect(at[4]).toBeLessThan(at[5]);
    expect(at[5]).toBeLessThan(at[6]);
    expect(at[5]).toBeLessThan(at[7]);
    expect(at[5]).toBeLessThan(at[8]);
  });

  it('la carpeta se valida una sola vez, y distingue la lista colaborativa de la carpeta normal', () => {
    const require = body(parity, 'private async Task<TL.DialogFilterChatlist> RequireChatlistAsync', 'DesktopParity.cs');
    const order = ['LoadFiltersAsync()', 'DesktopFolderLinks.NoFolder', 'not TL.DialogFilterChatlist', 'DesktopFolderLinks.NotChatlist']
      .map(needle => {
        const index = require.indexOf(needle);
        if (index < 0) throw new Error(`RequireChatlistAsync no dice ${needle}`);
        return index;
      });
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThan(order[i - 1]);
    // Los cuatro brazos que necesitan la lista la piden por el mismo sitio: ningún literal de «no es una lista» suelto.
    expect(veces(csLiteral('NotChatlist'))).toBe(1);
    expect(atPar('var chatlist = await RequireChatlistAsync(id);')).toBeGreaterThan(0);
  });

  it('lo que Telegram no confirma no se contesta como si hubiera pasado', () => {
    const change = body(parity, 'private async Task<object> FolderLinkChangeAsync', 'DesktopParity.cs');
    expect(change).toContain('if (!await client.Chatlists_DeleteExportedInvite(input, slug)) throw new BridgeException(DesktopFolderLinks.NotConfirmed);');
    expect(change).toContain('if (edited == null) throw new BridgeException(DesktopFolderLinks.NotConfirmed);');
    // En Android esto no es posible: sus dos peticiones devuelven `Ok`, así que ninguna de sus líneas de escritura
    // pronuncia una negativa —un error ahí es una excepción, no un `answer.fail` que este host sí puede recibir.
    for (const escritura of ['if(delete)perform(new TdApi.DeleteChatFolderInviteLink(id,url),answer,ok->answer.ok(true));',
      '}else perform(new TdApi.EditChatFolderInviteLink(id,url,name,link.chatIds),answer,edited->answer.ok(true));'])
      expect(java[atJava(escritura) - 1]).not.toContain('answer.fail(');
  });
});

describe('ronda CI · la frase una sola vez en cada capa', () => {
  it('cada negativa de la ronda está escrita una vez en todo el escritorio', () => {
    for (const name of ['Gone', 'BadLink', 'NotChatlist', 'NoFolder', 'BadLinkName', 'NoChatsYet', 'NoPicker', 'NotConfirmed']) {
      const phrase = csLiteral(name);
      expect(veces(phrase), `${name} se repite en la capa de escritorio`).toBe(1);
      expect(links[atLink(`public const string ${name}`) - 1]).toContain(`public const string ${name}`);
    }
    // La regla del nombre, antes escrita a mano en la creación, vive ahora en la clase: los dos cuerpos de enlace ya
    // no repiten la cota, la piden. La que queda a mano es la de las respuestas rápidas, que es otro aviso y otra ronda.
    for (const firma of ['private async Task<object> FolderLinkAsync', 'private async Task<object> FolderLinkChangeAsync'])
      expect(body(parity, firma, 'DesktopParity.cs'), `${firma} repite la cota del nombre`).not.toContain('name.Length is < 1 or > 32');
    expect(links.join('\n')).toContain('name.Length is >= 1 and <= 32');
    expect(parity.filter(row => row.includes('DesktopFolderLinks.NameAllowed('))).toHaveLength(2);
  });

  it('«este enlace ya no está» es carácter a carácter la negativa de Android', () => {
    expect(csLiteral('Gone')).toBe(javaFail(atJava('answer.fail("Este enlace ya no pertenece a la carpeta.");')));
    // Y la cota del nombre es la misma con la que Android recorta el suyo.
    const name = java[atJava('String name=delete?"":BridgePolicy.text(params,"name",32).trim();') - 1];
    expect(name).toContain('BridgePolicy.text(params,"name",32)');
    expect(links[atLink('public static bool NameAllowed') - 1]).toContain('<= 32');
  });

  it('el cuaderno de «con enlaces» lo manda la lectura, no el recuerdo de la sesión', () => {
    const listed = body(parity, 'private async Task<object> FolderLinksListAsync', 'DesktopParity.cs');
    expect(listed).toContain('if (rows.Length == 0) _folderLinks.Remove(folder.ID); else _folderLinks.Add(folder.ID);');
    const change = body(parity, 'private async Task<object> FolderLinkChangeAsync', 'DesktopParity.cs');
    expect(change).toContain('if ((listed.invites?.Length ?? 0) <= 1) _folderLinks.Remove(folder.ID);');
    // La marca la consume la lista de carpetas, que es donde la pantalla decide si ofrece el panel.
    expect(atPar('|| _folderLinks.Contains(item.ID)')).toBeGreaterThan(0);
  });
});

describe('ronda CI · el aviso y la pantalla', () => {
  it('las tres claves pasan de pendientes a disponibles, con folders.link', () => {
    const available = DESKTOP_AVAILABLE.find(claim => claim.methods.includes('folders.links.list'));
    expect(available?.label).toBe('lista de chats, carpetas con sus enlaces e historial');
    for (const key of [...LINKS, 'folders.link']) {
      expect(DESKTOP_PENDING.some(claim => claim.methods.includes(key)), `${key} sigue en pendiente`).toBe(false);
      // La compuerta BJ: una línea solo es «disponible» si todas sus claves tienen brazo que no se niega.
      expect(cable.arms.has(key), `${key} no tiene brazo`).toBe(true);
      expect(denied(key), `${key} se niega a sí misma`).toBe(false);
    }
    expect(available?.methods).toContain('history.byDate');
    expect(DESKTOP_AVAILABLE.flatMap(claim => claim.methods).filter(key => DESKTOP_PENDING.flatMap(claim => claim.methods).includes(key))).toEqual([]);
  });

  it('lo que queda de esa línea son las notas, y esas sí siguen sin con qué', () => {
    const notes = DESKTOP_PENDING.find(claim => claim.methods.includes('notes.write'));
    expect(notes?.methods).toEqual(['notes.write', 'notes.read', 'notes.clear']);
    for (const key of notes!.methods) expect(cable.arms.has(key), `${key} tiene brazo y no debería estar en pendiente`).toBe(false);
    expect(scope[atScope("{ label: 'notas privadas por chat'") - 1])
      .toContain("methods: ['notes.write', 'notes.read', 'notes.clear']");
    expect(scope[atScope("{ label: 'lista de chats, carpetas con sus enlaces e historial'") - 1])
      .toContain("'folders.links.list', 'folders.links.edit', 'folders.links.delete'");
  });

  it('el botón que el host niega no se ofrece en Windows', () => {
    const flag = atPanel('chooseChats: true');
    expect(panel[flag - 1]).toContain('{!desktop && <button');
    expect(panel[flag - 1]).toContain('Cambiar chats incluidos');
    expect(panel[atPanel("const desktop = useSyncExternalStore(subscribe, () => snapshot().platform === 'desktop');") - 1])
      .toContain("snapshot().platform === 'desktop'");
    // La norma no es nueva: la BY hizo lo mismo con el «Quitar» del estado emoji, y la línea sigue siendo esa.
    const quitar = en("{status && !desktop && <button", emoji, 'EmojiStatusSettings.tsx');
    expect(quitar).toBe(156);
    expect(atPanel('El brazo de Windows niega `chooseChats` por su nombre')).toBe(flag - 1);
  });

  it('las dos escrituras siguen exentas del plazo corto, porque Android abre un selector', () => {
    const exempted = (key: string) => bridge.some(row => row.includes(`'${key}'`));
    expect(exempted('folders.links.edit')).toBe(true);
    expect(exempted('folders.links.delete')).toBe(true);
    // Leer no abre nada: la lista no necesita el plazo largo.
    expect(bridge.slice(17, 54).join('\n')).not.toContain('folders.links.list');
  });
});

describe('ronda CI · las citas de los archivos de la ronda', () => {
  /** Lo que tiene que decir la línea citada, medido hoy una por una. */
  const anchors: Record<string, string> = {
    'TelegramService.cs:443': '"folders.links.list" => await FolderLinksListAsync(args),',
    'TelegramService.cs:444': '"folders.links.edit" => await FolderLinkChangeAsync(args, delete: false),',
    'TelegramService.cs:445': '"folders.links.delete" => await FolderLinkChangeAsync(args, delete: true),',
    'DesktopParity.cs:671': 'var slug = DesktopFolderLinks.SlugOf(Str(args, "link"))',
    'DesktopParity.cs:703': 'private async Task<TL.DialogFilterChatlist> RequireChatlistAsync(int id)',
    'DesktopParity.cs:712': 'private async Task<object> FolderLinksListAsync(JsonElement args)',
    'DesktopParity.cs:728': 'private async Task<object> FolderLinkChangeAsync(JsonElement args, bool delete)',
    'DesktopParity.cs:738': 'if (DesktopFolderLinks.Find(listed.invites, slug) == null) throw new BridgeException',
    'DesktopParity.cs:746': 'if (Bool(args, "chooseChats")) throw new BridgeException(DesktopFolderLinks.NoPicker);',
    'DesktopFolderLinks.cs:58': 'public const string Gone = "Este enlace ya no pertenece a la carpeta.";',
    'DesktopFolderLinks.cs:84': 'public const string NoPicker =',
    'DesktopFolderLinks.cs:95': 'public static string? SlugOf(string? link)',
    'DesktopFolderLinks.cs:107': 'public static ExportedChatlistInvite? Find(ExportedChatlistInvite[]? invites, string slug)',
    'DesktopFolderLinks.cs:116': 'public static bool NameAllowed(string name) => name.Length is >= 1 and <= 32;',
    'FolderLinks.tsx:8': "const desktop = useSyncExternalStore(subscribe, () => snapshot().platform === 'desktop');",
    'FolderLinks.tsx:55': '{!desktop && <button type="button" className="secondary" disabled={busy} onClick={() => void update(',
    'desktopScope.ts:24': "{ label: 'lista de chats, carpetas con sus enlaces e historial'",
    'desktopScope.ts:102': "{ label: 'notas privadas por chat', methods: ['notes.write', 'notes.read', 'notes.clear'] },",
    'NativeBridge.java:3955': 'private void folderLinks(JSONObject params,Answer answer){',
    'NativeBridge.java:3958': 'perform(new TdApi.GetChatFolderInviteLinks(id),answer,result->{',
    'NativeBridge.java:3966': 'private void folderLinkChange(JSONObject params,Answer answer,boolean delete){',
    'NativeBridge.java:3969': 'String url=BridgePolicy.text(params,"link",512).trim();',
    'NativeBridge.java:3970': 'String name=delete?"":BridgePolicy.text(params,"name",32).trim();',
    'NativeBridge.java:3974': 'if(delete)perform(new TdApi.DeleteChatFolderInviteLink(id,url),answer,ok->answer.ok(true));',
    'NativeBridge.java:3979': 'perform(new TdApi.EditChatFolderInviteLink(id,url,name,selected),answer,edited->answer.ok(true))));',
    'NativeBridge.java:3980': '}else perform(new TdApi.EditChatFolderInviteLink(id,url,name,link.chatIds),answer,edited->answer.ok(true));',
    'NativeBridge.java:3983': 'answer.fail("Este enlace ya no pertenece a la carpeta.");',
    'NativeBridge.java:3895': 'private static JSONArray idList(long[] values)',
    'NativeBridge.java:4005': 'private void chooseFolderChats(String title,String description,String action,long[] ids,long[] included,',
    'EmojiStatusSettings.tsx:156': '{status && !desktop && <button',
  };

  /** Los trozos que la ronda tocó, con el mismo recorte que usan CF, CM, CN y CB. */
  const watched: [string, string][] = [
    ['rondaCI.test.ts', text('./rondaCI.test.ts').split('const text =')[0]],
    ['DesktopFolderLinks.cs', links.join('\n')],
    ['DesktopParity.cs (comentario CI)', parity.slice(atPar('private async Task<TL.DialogFilterChatlist> RequireChatlistAsync') - 8, atPar('private async Task<TL.DialogFilterChatlist> RequireChatlistAsync') - 1).join('\n')],
    ['DesktopParity.cs (cuerpos)', parity.slice(atPar('private async Task<TL.DialogFilterChatlist> RequireChatlistAsync') - 1, atPar('private async Task<object> FolderTagsAsync')).join('\n')],
    ['NativeBridge.java (carpetas)', java.slice(3937, 3996).join('\n')],
    ['FolderLinks.tsx', panel.join('\n')],
    ['desktopScope.ts (fila de carpetas)', scope[atScope("{ label: 'lista de chats, carpetas") - 1]],
    ['desktopScope.ts (notas)', scope.slice(atScope("{ label: 'notas privadas por chat'") - 3, atScope("{ label: 'notas privadas por chat'")).join('\n')],
  ];

  const lineOf = (file: string, n: number) => {
    const bodyOf = file === 'NativeBridge.java' ? java
      : file === 'TelegramService.cs' ? service
        : file === 'DesktopParity.cs' ? parity
          : file === 'DesktopFolderLinks.cs' ? links
            : rows(`./${file}`);
    const row = bodyOf[n - 1];
    if (row === undefined) throw new Error(`Falta la línea ${n} de ${file}`);
    return row;
  };

  const written = new Map<string, number>();
  for (const [, chunk] of watched) {
    for (const match of chunk.matchAll(/([A-Za-z][\w.]*\.(?:tsx|ts|java|cs|csproj)):(\d+)(?:-(\d+))?/g)) {
      written.set(`${match[1]}:${match[2]}`, Math.max(written.get(`${match[1]}:${match[2]}`) ?? 0, match[3] ? Number(match[3]) : 0));
    }
  }

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, n] = citation.split(':');
      expect(lineOf(file, Number(n)), citation).toContain(needle);
    }
  });

  it('ninguna ancla se cita dos veces con cifras que no coinciden, y ninguna cifra se cita sin ancla', () => {
    for (const [citation] of written) expect(anchors[citation], `${citation} no está en la tabla de anclas`).toBeTypeOf('string');
    for (const citation of Object.keys(anchors)) expect(written.has(citation), `${citation} no lo cita nadie`).toBe(true);
    expect([...written.keys()]).toHaveLength(30);
  });

  it('las agujas de las capas tocadas no se movieron sin que la ronda lo sepa', () => {
    // Medido hoy con `split(/\r?\n/).length`: `NativeBridge.java` creció con la tanda CK y `desktopScope.ts` con su
    // fila nueva de `message.edit.media`. Las tres cifras del panel y del puente siguen siendo las de la CI. La CK-B
    // escribió el brazo en el despacho —noventa y siete líneas— y volvió a redactar la fila del aviso en dos líneas
    // menos, así que `desktopScope.ts` pasa de 108 a 106. La ronda CD sumó diez líneas al despacho —el brazo de
    // `premium.state` con su comentario, la bandera `customReaction` con el suyo y el comentario que dice las dos caras
    // de `allowCustom`— y en `desktopScope.ts` la fila de la marca con su comentario, seis más: pasa de 106 a 112. La
    // ronda CE sumó treinta y siete líneas al despacho —el `ParseEntities` reescrito con el techo de cien y sus dos
    // ayudantes de negativa, la vuelta de la entidad con la cifra del emoji y la dirección materializada, y el parseo
    // por delante de la marca de envío— y no tocó ninguna otra capa de esta hoja; doce líneas más subió después el despacho con los dos ayudantes de la ronda CW-D.
    // Veinticuatro más, repartidas entre los fondos de la CH-A y el aviso `UpdateDefaultBackground` de la CH-A2, que
    // además sumó nueve a la sesión y cuatro a la instantánea.
    expect(service).toHaveLength(4301);
    expect(parity).toHaveLength(1217);
    expect(links).toHaveLength(118);
    expect(java).toHaveLength(5425);
    expect(panel).toHaveLength(68);
    expect(scope).toHaveLength(113);
  });
});
