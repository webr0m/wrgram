import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DESKTOP_PENDING } from './desktopScope';
import { desktopGapRefusal } from './desktopGap';

/**
 * Ronda BO — la interfaz de escritorio deja de ofrecer lo que el cable de Windows no contesta.
 *
 * BJ midió qué claves tienen brazo en `TelegramService.cs` y BK convirtió esa medida en una puerta del andamio. Quedaba
 * la otra mitad de la norma de la casa (AK): *ninguna opción que la pantalla ofrece puede caer en el aviso de beta*.
 * Mientras el aviso y el andamio se portaran bien, la propia UI seguía ofreciendo puertas que en Windows se niegan —o
 * se quedan sin hacer nada—: las fichas que abren historias, regalos o temas de foro, la pestaña de niveles de
 * impulso, las etiquetas de Guardados, la paleta dinámica, el reproductor nativo, los chips de reacción y el nombre
 * del remitente de un grupo.
 *
 * Este archivo mide dos cosas. La primera es cada puerta cerrada: su guarda tiene que estar escrita en el archivo
 * correspondiente, la clave que protegía no puede tener brazo vivo en el host (si lo tuviera, la guarda sería un
 * apagón gratuito) y tiene que estar declarada en `DESKTOP_PENDING` (si no lo estuviera, el aviso seguiría mintiendo
 * por omisión y el andamio de BK la fingiría). La segunda es el barrido por archivo: la lista de claves sin brazo que
 * cada pantalla tocada sigue llamando es exactamente la que sus puertas cubren; si alguien añade una llamada nueva
 * sin guarda, la lista crece y el test lo dice con nombre y con línea.
 */

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

// El extractor del despacho es el de BJ: el recorte entre el `switch` y el rechazo genérico, más las dos órdenes
// atendidas antes del `switch`. Leer el archivo entero daría por vivas claves de otros `switch` (los de entidades).
function dispatch(from: string[]) {
  const start = from.findIndex(row => row.includes('object? result = method switch'));
  const end = from.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  if (start < 0 || end < 0) throw new Error('No se encuentra el despacho de Windows');
  const answered = new Map<string, number>();
  const refused = new Map<string, number>();
  from.slice(start, end + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
    if (!keys.length) return;
    const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
    for (const key of keys) (negative ? refused : answered).set(key, start + offset + 1);
  });
  from.slice(0, start).forEach((row, index) => {
    const pre = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (pre) answered.set(pre, index + 1);
  });
  return { answered, refused };
}

const cable = dispatch(text('../../desktop/src/WRGram.Desktop/TelegramService.cs').split('\n'));
const liveInHost = (method: string) => cable.answered.has(method) && !cable.refused.has(method);
const declared = new Set(DESKTOP_PENDING.flatMap(claim => claim.methods));

// `usePages('…')` también es una llamada al puente: Collections.tsx carga sus páginas así y un barrido que solo
// mirara `run(` y `request(` dejaría `saved.search` fuera de la lista, fingiendo que la pantalla no la usa.
const CALL = /\b(?:run|request)(?:<[^<>()]*>)?\(\s*'([a-z][a-zA-Z0-9._]*)'|usePages<[^>]*>\(\s*'([a-z][a-zA-Z0-9._]*)'/g;
const callsOf = (file: string) => new Set([...text(`./${file}`).matchAll(CALL)].map(match => match[1] ?? match[2]));

type Door = { file: string; methods: string[]; guards: string[] };

const DOORS: Door[] = [
  {
    // BZ abrió las tres puertas de historias de esta pantalla, y la deuda que queda es la de siempre: regalos y
    // temas de foro. Las dos entradas de historia que dependen de un contador —`activeStories` en la cabecera y
    // `hasStories` en el menú— siguen sin enseñarse en Windows, pero ya no por una guarda de plataforma: el host no
    // publica ninguno de los dos (`DesktopState.cs:107` declara el entero y nadie lo escribe; la ronda BA dejó
    // medido que `hasStories` no sale del cable). Quitar el `!desktop` no enciende nada: apaga una promesa falsa.
    file: 'PeerProfile.tsx',
    methods: ['gifts.catalog', 'gifts.received', 'gifts.send', 'forum.topics'],
    guards: [
      "const desktop = snapshot().platform === 'desktop';",
      "{!desktop && chat.type !== 'secret' && !chat.bot && <button type=\"button\" onClick={() => gifts(chat)}",
      "{!desktop && isForum && <button type=\"button\" onClick={() => forum(chat)}",
    ],
  },
  {
    // BP volvió a abrir la puerta de `profile.sender`: la orden ya tiene brazo en Windows, así que el nombre del
    // remitente otra vez es botón y no texto suelto. Aquí queda constado porque las otras once claves de esta
    // pantalla sí siguen sin brazo; si alguien las tapara de más, este lista lo diría.
    // Las tres claves de reacción dejaron esta lista en la BX: Windows ya escribe `messages.sendReaction`, así que
    // la puerta no tapaba un hueco sino una mentira antigua. `message.react.paid` tampoco vuelve: no la tapa una
    // guarda de plataforma, la niega el host por su nombre con `DesktopMessageReact.PaidRefused`, y eso lo compuerta
    // la ronda BJ. Aquí queda lo demás: los once nombres que Windows aún no contesta.
    file: 'App.tsx',
    methods: ['forum.topics',
      // Las tres claves de emojis salieron de esta lista en la BY: ya tienen brazo en el host, así que la puerta de
      // plataforma que las tapaba se quitó de `App.tsx` y del menú de cuenta del escritorio.
      'bot.inline.query', 'bot.inline.more', 'bot.inline.send',
      // La BZ abrió el visor de historias en Windows y el visor pedía las reacciones siempre, con o sin brazo: la
      // guarda quita el aviso del host de la pantalla y deja el pie y el archivo, que sí viajan medidos.
      'story.reactions'],
    guards: [
      'const forumView=!desktop&&!!active?.isForum&&!state.topic?.id;',
      '{forumView&&!search?<ForumTopics',
      "void Promise.all([desktop?Promise.resolve(undefined):run<StoryReactions>('story.reactions'),",
      // La historia de un enlace t.me ya no se niega en Windows: la BZ cableó las cuatro lectoras, así que la
      // pantalla llama a `showStory` en las dos capas. Lo que sigue siendo hueco —y está anotado para la CG— es que
      // el `telegram.link` de este host solo devuelve `action:"link"`, `invite_preview` o `membership`, de modo que
      // el `case 'story'` de `App.tsx:419` no se alcanza todavía en Windows: rama muerta, no función tapada.
      'navigate(\'chats\');setMobileChat(true);showStory(owner,result.storyId);return;',
      "{!desktop&&inlineMatch&&<div className=\"inline-hint\">",
    ],
  },
  {
    file: 'Collections.tsx',
    methods: ['saved.topics.pin', 'saved.tags', 'saved.tag.label', 'saved.search'],
    guards: [
      'pin={desktop ? undefined : pin}',
      '{pin && <button type="button" className="collection-row-pin"',
      "if (snapshot().platform === 'desktop') return;",
    ],
  },
  {
    file: 'AppearanceSettings.tsx',
    methods: ['appearance.systemPalette'],
    guards: [
      "{state.platform!=='desktop'&&<div className=\"setting-row\"><span>Color dinámico del sistema</span>",
      "{state.platform!=='desktop'&&<p className=\"settings-note\">Toma la paleta Material You",
    ],
  },
  {
    file: 'BoostsPanel.tsx',
    methods: ['chat.boost.features', 'chat.boost.level'],
    guards: [
      "const tabs = snapshot().platform === 'desktop' ? allTabs.filter(([id]) => id !== 'levels') : allTabs;",
    ],
  },
  {
    // `media.open` no aparece como literal: viaja por el parámetro `action` de `fileAction`. La guarda se mide en la
    // línea que decide ofrecer el botón, que es donde vive la promesa.
    file: 'MediaView.tsx',
    methods: ['media.play', 'media.open'],
    guards: [
      "const nativePlayer=native&&state.platform!=='desktop';",
      "{media.kind!=='sticker'&&nativePlayer&&<button type=\"button\" disabled={fileBusy} onClick={()=>void fileAction('media.open',loadId)}",
      "{format&&(format!=='video'||nativePlayer)&&<button",
    ],
  },
];

describe('ronda BO · las puertas de escritorio cerradas y medidas', () => {
  it.each(DOORS.map(door => [door.file, door] as const))('%s: cada puerta cerrada tiene su guarda escrita', (_file, door) => {
    const source = text(`./${door.file}`);
    for (const guard of door.guards) expect(source, `guarda ausente en ${door.file}: ${guard}`).toContain(guard);
  });

  it.each(DOORS.map(door => [door.file, door] as const))('%s: lo que se tapó no tenía brazo en Windows', (_file, door) => {
    for (const method of door.methods) expect(liveInHost(method), `${method} sí tiene brazo: la guarda apaga una función viva`).toBe(false);
  });

  it.each(DOORS.map(door => [door.file, door] as const))('%s: lo que se tapó está declarado en el aviso', (_file, door) => {
    for (const method of door.methods) expect(declared.has(method), `${method} no aparece en DESKTOP_PENDING`).toBe(true);
  });

  it('el andamio de BK se niega en las claves que BO añadió al aviso, no las inventa', () => {
    for (const method of ['saved.search', 'appearance.systemPalette', 'media.play', 'media.open', 'chat.boost.features', 'chat.boost.level', 'bot.inline.query']) {
      expect(desktopGapRefusal(method), `${method} debería negarse en el andamio de escritorio`).toBe(`No disponible en escritorio (beta): ${method}`);
    }
  });

  // El barrido por archivo: la deuda que queda en cada pantalla tocada es exactamente la listada aquí. Los nombres
  // fuera de la lista serían una llamada nueva sin puerta; la lista vacía sería que algo se tapó de más.
  it.each([
    ['Collections.tsx', ['saved.search', 'saved.tag.label', 'saved.tags', 'saved.topics.pin']],
    ['AppearanceSettings.tsx', ['appearance.systemPalette']],
    ['BoostsPanel.tsx', ['chat.boost.features', 'chat.boost.level']],
    ['MediaView.tsx', ['media.play']],
  ] as const)('%s: sin brazo vivo solo quedan %s', (file, expected) => {
    const pending = [...callsOf(file)].filter(method => !liveInHost(method)).sort();
    expect(pending).toEqual([...expected].sort());
  });

  it('PeerProfile.tsx: desde la ronda BP ya no queda ninguna llamada sin brazo', () => {
    // Era la pantalla con la deuda más incómoda: `profile.sender` (la ficha del remitente) era su única llamada
    // huérfana y BO la tapó cerrando el botón de App.tsx. BP escribió el brazo, la guarda de App.tsx se fue y la
    // pantalla vuelve a preguntar solo por cosas que Windows contesta.
    expect([...callsOf('PeerProfile.tsx')].filter(method => !liveInHost(method))).toEqual([]);
  });

  it('App.tsx: el tablero de foros ya no decide nada con el antiguo predicado suelto', () => {
    const source = text('./App.tsx');
    // Cuatro sitios dependían de `active.isForum&&!state.topic?.id`; los cuatro pasan ahora por `forumView`, que en
    // Windows es falso y deja el historial y el compositor donde siempre debieron estar.
    expect(source.match(/forumView/g)).toHaveLength(5);
    expect(source).not.toContain('active.isForum&&!state.topic?.id');
  });

  it('el chip de reacción es botón en las dos capas, y la clase quieta ya no existe', () => {
    // La ronda BX comprobó que la escrita existe, así que el chip dejó de ser texto suelto en Windows: una sola
    // fila de `<button>` sirve a las dos plataformas y cada toque manda la orden que el host contesta. La clase
    // que pintaba la versión inerte se borró del CSS junto con su única uso.
    const source = text('./App.tsx');
    expect(source).toContain('return <button key={key} className={look}');
    expect(source).toContain("onClick={()=>{if(reaction.kind==='paid'){paidReaction(message);return;}if(reaction.kind==='custom')void run('message.react.custom',{id:message.id,emoji:reaction.customEmojiId,remove:reaction.chosen});else void run('message.react',{id:message.id,emoji:reaction.emoji,remove:reaction.chosen});}}>");
    expect(source).not.toContain('reaction-quiet');
    expect(text('./style.css')).not.toContain('.reactions .reaction-quiet{');
  });
});
