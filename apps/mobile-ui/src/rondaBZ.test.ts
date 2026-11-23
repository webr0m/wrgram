import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_AVAILABLE, DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda BZ — las historias de Windows, medidas en las dos orillas del cable.
 *
 * El hueco era de transporte, no de pantalla: <c>chat.stories</c>, <c>story.open</c>, <c>message.story.open</c> y
 * <c>story.close</c> llevaban desde el puente de Android en <c>BridgePolicy.java</c>, la interfaz las llama desde
 * <c>App.tsx</c> y WTelegramClient tiene las cuatro peticiones. En Windows caían en el <c>_ =&gt; throw</c> genérico
 * del despacho, que anuncia «no disponible en escritorio (beta)» de algo que la librería sabe hacer.
 *
 * Este archivo mide cinco cosas, todas sobre el texto de las cuatro capas y sin copiar una cifra de la hoja de ronda:
 *
 * 1. Qué claves del cable quedaron vivas y cuáles siguen negadas, y que las negadas son exactamente las que el aviso
 *    declara pendientes. Así la familia de historias no puede volver a partirse en dos listas que se contradicen.
 * 2. Que las frases con las que el host se niega son las de Android, carácter a carácter, y con el mismo recorte del
 *    pie y los mismos dos nombres de archivo. La pantalla es la misma en las dos capas: si la frase difiere, la
 *    diferencia la ve el usuario.
 * 3. Que el contrato de salida no ganó ni perdió una clave. El andamio de diseño finge lo que no está cableado, así
 *    que la comprobación tiene que hacerse sobre las interfaces, no sobre la prosa.
 * 4. Que <c>live</c> y los cuatro mandos de escritura salen en falso porque no hay bandera ni brazo que los sostenga,
 *    y que la pantalla gatingea cada mando uno a uno. Un <c>true</c> aquí sería un botón estrellado contra el aviso.
 * 5. Que el orden de las peticiones respeta al de Android: la media se registra antes de contar la vista.
 *
 * La última prueba es el cortafuegos de las citas: todo <c>NativeBridge.java:NNN</c>, <c>App.tsx:NNN</c> o
 * <c>contract.ts:NNN</c> escrito en los dos archivos nuevos tiene que existir en la tabla y señalar hoy la línea que
 * la frase afirma —y ninguna línea de la tabla puede haber dejado de estar citada—, igual que hace BM con el host.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rows = (path: string) => text(path).split(/\r?\n/);

const host = '../../desktop/src/WRGram.Desktop/';
const javaDir = '../../mobile/android/app/src/main/java/cc/webrom/wrgram/';
const flowLines = rows(`${host}DesktopStoriesFlow.cs`);
const flow = flowLines.join('\n');
const rules = text(`${host}DesktopStories.cs`);
const state = text(`${host}DesktopState.cs`);
const service = rows(`${host}TelegramService.cs`);
const java = rows(`${javaDir}NativeBridge.java`);
const snapshot = rows(`${javaDir}NativeSnapshot.java`);
const extras = text(`${javaDir}MessageExtras.java`);
const policy = text(`${javaDir}BridgePolicy.java`);
const app = text('./App.tsx');
const contract = rows('./contract.ts');

/** El despacho de Windows, con el mismo recorte que usan BJ, BK y BO. */
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
  service.slice(0, start).forEach((row, index) => {
    const pre = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (pre) answered.set(pre, index + 1);
  });
  return { answered, refused };
}
const cable = dispatch();

/** El literal de texto que C# asigna a una constante. */
function csLiteral(name: string, from: string): string {
  const match = new RegExp(`${name}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}
const csNumber = (name: string, from: string) => Number(new RegExp(`${name}\\s*=\\s*(\\d+)`).exec(from)?.[1]);

/** La primera frase con la que Android rechaza una petición, leída de su propia línea medida. */
const failOf = (at: number) => {
  const match = /answer\.fail\("([^"]*)"\)/.exec(java[at - 1] ?? '');
  if (!match) throw new Error(`La línea ${at} de NativeBridge.java no se niega con ninguna frase`);
  return match[1];
};

const READERS = ['chat.stories', 'story.open', 'message.story.open', 'story.close'];
const WRITERS = ['story.create.photo', 'story.create.video', 'story.reactions', 'story.react', 'story.interactions',
  'story.edit.caption', 'story.profile.toggle', 'story.delete', 'story.albums.list', 'story.albums.create',
  'story.albums.rename', 'story.albums.delete', 'story.albums.order', 'story.albums.add', 'story.albums.remove',
  'story.albums.story.order', 'story.albums.stories'];

describe('ronda BZ · el cable de historias de Windows', () => {
  it('las cuatro lectoras tienen brazo y cada una llama al suyo', () => {
    const arms: [string, string][] = [
      ['chat.stories', 'ChatStoriesAsync'], ['story.open', 'StoryOpenAsync'],
      ['message.story.open', 'SharedStoryOpenAsync'], ['story.close', 'CloseStoryAsync'],
    ];
    arms.forEach(([key, method], index) => {
      expect(cable.answered.has(key), `${key} sigue sin brazo`).toBe(true);
      expect(cable.refused.has(key), `${key} se niega a sí misma`).toBe(false);
      const at = cable.answered.get(key)!;
      expect(service[at - 1], `${key} no llama a ${method}`).toContain(`=> await ${method}(args),`);
      expect(flow).toContain(`private async Task<object?> ${method}(`);
      // Las cuatro van juntas, en el orden en que las nombra la visera del cable.
      expect(at).toBe(cable.answered.get('chat.stories')! + index);
    });
    expect(service[cable.answered.get('chat.stories')! - 2]).toContain(
      'sigue sin brazo —`story.create.photo` y `story.create.video` caen en el rechazo genérico del final—.');
  });

  it('lo que sigue sin brazo es exactamente lo que el aviso declara pendiente', () => {
    // La familia entera, leída de la lista que filtra el puente de Android: las diecinueve `story.*`, la bandeja y
    // la compartida en un mensaje.
    const family = [...new Set([...policy.matchAll(/"(story\.[a-z._]+|chat\.stories|message\.story\.open)"/g)].map(m => m[1]))];
    expect(family.length).toBe(21);
    expect([...WRITERS, ...READERS].sort()).toEqual(family.sort());
    const unwired = family.filter(key => !cable.answered.has(key)).sort();
    const declared = [...new Set(DESKTOP_PENDING.flatMap(claim => claim.methods))]
      .filter(key => key.startsWith('story.') || key === 'chat.stories' || key === 'message.story.open').sort();
    expect(unwired).toEqual(declared);
    for (const key of READERS) expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes(key))).toBe(true);
    for (const key of WRITERS) expect(DESKTOP_AVAILABLE.some(claim => claim.methods.includes(key))).toBe(false);
  });

  it('el andamio de diseño se niega en las diecisiete escrituras y calla en las cuatro lectoras', () => {
    for (const key of READERS) expect(desktopGapRefusal(key)).toBeUndefined();
    for (const key of WRITERS) {
      expect(desktopGapRefusal(key), `${key} pasaría por viva en el andamio`).toBe(`No disponible en escritorio (beta): ${key}`);
    }
  });

  it('el visor ya no pregunta por las reacciones que el host no tiene', () => {
    // Sin esta guarda, abrir cualquier historia en Windows sacaba un aviso en pantalla: era la única llamada del
    // visor que no estaba detrás de un mando, y su respuesta solo servía para enseñar o no la fila de chips.
    expect(app).toContain("void Promise.all([desktop?Promise.resolve(undefined):run<StoryReactions>('story.reactions'),");
    expect(app).toContain('{reactions&&<div className="story-reactions">');
    // La otra la sigue decidiendo el mando, no la plataforma: en Android se pregunta, en Windows el mando es falso.
    expect(app).toContain("story.canEdit?run<StoryInteractions>('story.interactions'");
  });

  it('la bandeja y el perfil preguntan cada una con su petición, con el tope de treinta de Android', () => {
    expect(flow).toContain('await client.Stories_GetPinnedStories(peer, 0, 30)');
    expect(flow).toContain('await client.Stories_GetPeerStories(peer)');
    expect(java[365]).toContain('if(p.optBoolean("posted"))');
  });

  it('el orden es el de Android: la media se prepara antes de contar la vista', () => {
    const body = flow.slice(flow.indexOf('private async Task<object?> OpenStoryAsync('));
    const read = body.indexOf('Stories_GetStoriesByID');
    const media = body.indexOf('DesktopStories.MediaOf(item, _media, exportable)');
    const views = body.indexOf('Stories_IncrementStoryViews');
    expect(read).toBeGreaterThan(-1);
    expect(media, 'la media no se registra').toBeGreaterThan(read);
    expect(views, 'la vista no se cuenta').toBeGreaterThan(media);
    // Y en Android es exactamente la misma pareja: primero el archivo, después `OpenStory`.
    expect(java[428].indexOf('dto.storyMedia(story)')).toBeLessThan(java[428].indexOf('new TdApi.OpenStory('));
  });

  it('cerrar es la pareja de la orden de Android: allí CloseStory, aquí readStories con el número', () => {
    expect(java[429]).toContain('perform(new TdApi.CloseStory(chatId,storyId)');
    expect(flow).toContain('await client.Stories_ReadStories(StoryPeer(entry), StoryId(args))');
    // El cuaderno local de Android no se imita: la pantalla solo cierra con la respuesta que le dio `story.open`.
    // Aquí el nombre solo aparece una vez, y es dentro del párrafo que explica por qué no se copia.
    expect(java[429]).toContain('if(!openStoryViews.remove(key)){answer.ok(false);return;}');
    expect(flow.match(/openStoryViews/g)).toHaveLength(1);
    expect(flow).toContain('<c>openStoryViews</c> de <c>NativeBridge.java:430</c>');
  });

  it('los grupos básicos se niegan antes de ir a la red, en los tres sitios que los tocan', () => {
    const guards = flowLines.filter(row => row.includes('entry.Input is InputPeerChat'));
    expect(guards).toHaveLength(3);
    expect(guards[0]).toContain('return new List<ActiveStoryDto>();');
    expect(guards[1]).toContain('throw new BridgeException(DesktopStories.Gone)');
    expect(guards[2]).toContain('throw new BridgeException(DesktopStories.Gone)');
  });
});

describe('ronda BZ · las frases, los nombres y el recorte, carácter a carácter', () => {
  it('el formato que no se pinta se niega con la frase de Android', () => {
    expect(csLiteral('NoMedia', rules)).toBe(failOf(429));
    expect(csLiteral('NoMedia', rules)).toBe('Este formato de historia todavía no está disponible.');
  });

  it('la historia que ya no está usa la misma frase en las dos negaciones de Android', () => {
    expect(failOf(385)).toBe(failOf(390));
    expect(csLiteral('Gone', rules)).toBe(failOf(385));
    // Y aquí la dicen seis sitios: las dos guardas del compartido, el número sin valor, la fila que dejó de ser
    // historia, la lectura que viene vacía y la negativa de un grupo básico.
    expect(flowLines.filter(row => row.includes('DesktopStories.Gone'))).toHaveLength(6);
  });

  it('el pie se recorta con el mismo tope y el archivo se llama como en Android', () => {
    expect(csNumber('CaptionLimit', rules)).toBe(Number(/NativeSnapshot\.limit\(story\.caption\.text,(\d+)\)/.exec(java[428])?.[1]));
    expect(snapshot[424]).toContain('media.register(best.photo,"image/jpeg","image","Historia")');
    expect(snapshot[425]).toContain('media.register(video.video,"video/mp4","video","Video de historia")');
    expect(csLiteral('PhotoName', rules)).toBe('Historia');
    expect(csLiteral('VideoName', rules)).toBe('Video de historia');
  });

  it('la tarjeta de la historia compartida publica las dos marcas que publica Android', () => {
    expect(extras).toContain('return kind("story").put("mention", ((TdApi.MessageStory) content).viaMention)');
    expect(service.join('\n')).toContain('dto.Extra = new MessageExtraDto { Kind = "story", Mention = DesktopStories.Mention(story) };');
    expect(contract[167]).toContain("{kind:'story';mention:boolean}");
    expect(rules).toContain('public static bool Mention(MessageMediaStory story) => (story.flags & MessageMediaStory.Flags.via_mention) != 0;');
  });
});

describe('ronda BZ · el contrato de salida, clave por clave', () => {
  const keysOf = (line: string) => [...line.matchAll(/[{;](\w+):/g)].map(match => match[1]);
  const csKeys = (className: string) => {
    const start = state.indexOf(`public sealed class ${className}`);
    const body = state.slice(start, state.indexOf('\n}', start));
    return [...body.matchAll(/public [\w?<>]+ (\w+) \{ get; set; }/g)].map(match => match[1][0].toLowerCase() + match[1].slice(1));
  };

  it('ActiveStoryDto es exactamente ActiveStory', () => {
    expect(keysOf(contract[57])).toEqual(['id', 'date', 'closeFriends', 'live']);
    expect(csKeys('ActiveStoryDto')).toEqual(['id', 'date', 'closeFriends', 'live']);
  });

  it('OpenStoryDto es exactamente OpenStory, con sus diez claves en el mismo orden', () => {
    expect(keysOf(contract[58])).toEqual(['id', 'chatId', 'posterChatId', 'caption', 'media', 'canEdit',
      'canDelete', 'canToggleProfile', 'isPostedToChatPage', 'canArchive']);
    expect(csKeys('OpenStoryDto')).toEqual(keysOf(contract[58]));
  });

  it('las cuatro marcas de escritura salen en falso y la pantalla las gatingea una a una', () => {
    const open = rules.slice(rules.indexOf('public static OpenStoryDto Open('), rules.indexOf('public static string IdOf('));
    for (const key of ['CanEdit', 'CanDelete', 'CanToggleProfile', 'CanArchive']) {
      expect(open, `${key} se atreve a prometer`).toContain(`${key} = false,`);
      expect(app).toContain(`story.${key[0].toLowerCase()}${key.slice(1)}&&`);
    }
    // Y no hay un brazo que las obedezca: los cuatro siguen sin cable.
    for (const key of ['story.edit.caption', 'story.delete', 'story.profile.toggle', 'story.albums.add']) {
      expect(cable.answered.has(key)).toBe(false);
    }
    // La única de las cuatro que viaja medida es la publicada en el perfil: sale de la bandera, no de un brazo.
    expect(open).toContain('IsPostedToChatPage = Posted(item),');
    expect(rules).toContain('(item.flags & StoryItem.Flags.pinned) != 0');
  });

  it('la directa no se inventa: la lista no escribe nunca la marca', () => {
    const active = rules.slice(rules.indexOf('public static List<ActiveStoryDto> Active('), rules.indexOf('public static OpenStoryDto Open('));
    expect(active).not.toContain('Live');
    expect(state).toContain('public bool Live { get; set; }');
    // Medido sobre la librería: ninguno de los nombres que WTelegramClient genera para el flags dice «emitiendo».
    expect(rules).toContain('contacts, selected_contacts, has_media_areas, has_sent_reaction, out_, has_fwd_from, has_from_id, has_albums,');
    // La marca de no-exportar manda sobre guardar el archivo, no sobre ver la historia.
    expect(rules).toContain('(item.flags & StoryItem.Flags.noforwards) != 0');
    expect(flow).toContain('var exportable = !DesktopStories.ForbidsExport(item) && !ProtectedChat(entry);');
  });
});

describe('ronda BZ · las citas de los dos archivos nuevos', () => {
  /** Lo que tiene que decir la primera línea de cada cita. Medida hoy, línea por línea. */
  const anchors: Record<string, string> = {
    'App.tsx:251': 'function showStory(',
    'App.tsx:257': "await run('story.close',{id:story.chatId,storyId:story.id})",
    'App.tsx:268': "await run<OpenStory>('story.open',{id:chat.id,storyId})",
    'App.tsx:294': 'story.canEdit&&',
    'contract.ts:58': 'export interface ActiveStory {',
    'MessageExtras.java:85': 'kind("story").put("mention"',
    'NativeBridge.java:363': 'private TdApi.Chat target(JSONObject p)',
    'NativeBridge.java:366': 'private void chatStories(JSONObject p,Answer answer)',
    'NativeBridge.java:367': 'TdApi.GetChatPostedToChatPageStories(chat.id,0,30)',
    'NativeBridge.java:369': 'items.put(object("id",story.id,"date",story.date))',
    'NativeBridge.java:373': 'private void openStory(JSONObject p,Answer answer)',
    'NativeBridge.java:378': 'throw new IllegalArgumentException()',
    'NativeBridge.java:382': 'private void openSharedStory(JSONObject params,Answer answer)',
    'NativeBridge.java:385': 'answer.fail("Esta historia ya no está disponible.")',
    'NativeBridge.java:389': 'if(story.storyPosterChatId==0||story.storyId<=0)',
    'NativeBridge.java:390': 'answer.fail("Esta historia ya no está disponible.")',
    'NativeBridge.java:428': 'private void openStory(long chatId,int storyId,Answer answer)',
    'NativeBridge.java:429': 'new TdApi.GetStory(chatId,storyId,false)',
    'NativeBridge.java:430': 'private void closeStory(JSONObject p,Answer answer)',
    'NativeBridge.java:693': 'case "chat.stories":chatStories(p,a);break;',
    'NativeBridge.java:696': 'case "story.open":openStory(p,a);break;',
    'NativeBridge.java:697': 'case "message.story.open":openSharedStory(p,a);break;',
    'NativeBridge.java:700': 'case "story.close":closeStory(p,a);break;',
    'NativeSnapshot.java:423': 'JSONObject storyMedia(TdApi.Story story)',
    'NativeSnapshot.java:425': '"Historia"',
    'NativeSnapshot.java:426': '"Video de historia"',
    'TelegramService.cs:596': '_state.SelfId = user.id.ToString();',
    'TelegramService.cs:3799': 'var id = "u" + user.id;',
    'TelegramService.cs:3816': 'var id = "g" + chat.ID;',
    'TelegramService.cs:3829': 'var id = "c" + channel.ID;',
  };

  /** La última línea de cada rango citado, con lo que dice. Las dos de cierre de bloque se compratan solas. */
  const ends: Record<string, [number, string]> = {
    'App.tsx:251': [298, 'function openStories('],
    'contract.ts:58': [59, 'export interface OpenStory {'],
    'NativeBridge.java:366': [372, 'TdApi.GetChatActiveStories(chat.id)'],
    'NativeBridge.java:373': [380, '}'],
    'NativeBridge.java:382': [394, '}'],
    'NativeBridge.java:428': [429, 'new TdApi.GetStory(chatId,storyId,false)'],
    'NativeSnapshot.java:423': [427, 'media.protect(value.getInt("id"))'],
  };

  const files = [`${host}DesktopStories.cs`, `${host}DesktopStoriesFlow.cs`];
  const written = new Map<string, number>();
  for (const path of files) for (const row of rows(path)) {
    for (const match of row.matchAll(/([A-Za-z]+(?:\.tsx|\.ts|\.java|\.cs)):(\d+)(?:-(\d+))?/g)) {
      const start = `${match[1]}:${match[2]}`;
      const end = match[3] ? Number(match[3]) : 0;
      written.set(start, Math.max(written.get(start) ?? 0, end));
    }
  }

  const lineOf = (file: string, at: number) => {
    const body = file === 'TelegramService.cs' ? rows(`${host}${file}`)
      : file === 'App.tsx' || file === 'contract.ts' ? rows(`./${file}`)
        : rows(`${javaDir}${file}`);
    const row = body[at - 1];
    if (row === undefined) throw new Error(`Falta la línea ${at} de ${file}`);
    return row;
  };

  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [citation, needle] of Object.entries(anchors)) {
      const [file, at] = citation.split(':');
      expect(lineOf(file, Number(at)), citation).toContain(needle);
    }
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [citation, [at, needle]] of Object.entries(ends)) {
      expect(written.get(citation), `${citation} dejó de citarse como rango`).toBe(at);
      const [file] = citation.split(':');
      expect(lineOf(file, at), `${citation} termina en ${at}`).toContain(needle);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort()).toEqual(Object.keys(anchors).sort());
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    // Una cifra suelta atribuida por vecindad es una cita que se pudre en silencio: el día que alguien meta líneas
    // arriba, la aguja no existe. La casa exige el nombre completo en cada una.
    const loose: string[] = [];
    for (const path of files) rows(path).forEach((row, index) => {
      if (/(?:\(|, )<c>:\d+/.test(row)) loose.push(`${path.split('/').pop()}:${index + 1}`);
    });
    expect(loose).toEqual([]);
  });

  it('el host no deja de nombrar la bandera de mejores amigos con la que Android empareja', () => {
    expect(rules).toContain('(item.flags & StoryItem.Flags.close_friends) != 0');
    expect(java[371]).toContain('"closeFriends",info.isForCloseFriends');
  });
});
