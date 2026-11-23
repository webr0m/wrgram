import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

/**
 * El cortafuegos del cable de Android, hecho a imagen de la ronda BM, que es el del host de Windows.
 *
 * El barrido del 20 de noviembre midió 414 números de `NativeBridge.java` citados en los tres documentos de registro,
 * en los comentarios de las clases del despacho Windows y en la interfaz compartida, y encontró ramas del `switch`
 * atribuidas a una línea que ya no era la suya: el número se quedó donde lo escribió la ronda de turno y las líneas
 * de encima habían crecido desde entonces. Las doce tandas de re-anclaje —`.tools/c315-fija.mjs` a
 * `.tools/c315-fija12.mjs`, ciento setenta y ocho citas contadas sobre noventa y cuatro filas— y las cuatro que se
 * midieron a mano el mismo 20, cuando el cribado de cuerpos exigió el nombre delante del rango, dejaron la tabla como
 * está hoy.
 * Este archivo congela las citas que caen sobre una línea
 * `case "clave":`, que son las únicas comprobables sin interpretar la prosa: la línea despacha esa clave o no la
 * despacha. Lo demás lo miden los dos cribados de la tanda —`.tools/c315-cables.mjs`, que empareja cada número de
 * rama con el manejador que la propia línea escribe, y `.tools/c315-cuerpos.mjs`, que cuenta cada rango de cuerpo de
 * la firma a la llave—; las que escriben las propias pruebas de ronda quedan fuera a propósito, porque cada una
 * se mide sus números.
 *
 * La tabla se reimprime con `.tools/c315-tabla.mjs` y se injerta con `.tools/c315-injerta.mjs --aplicar` después de
 * cualquier tanda que mueva líneas del puente; el injertador es el que ajusta las tres agujas de cuenta de abajo.
 *
 * El enlace con número en la etiqueta es la otra clase que ningún cribado de palabras ve: `[App.tsx:1232](#L572)`
 * dice dos cosas distintas y las dos salen bien en cualquier búsqueda. La última comprobación obliga a que la
 * etiqueta y la ancla coincidan, a que la ruta exista y a que el número quepa en el archivo apuntado.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java').replace(/\r\n/g, '\n').split('\n');

/** Todo archivo que puede citar al puente: los documentos, el despacho Windows y la interfaz compartida. */
const hosts: [string, string][] = [
  ['docs/validation.md', text('../../../docs/validation.md')],
  ['docs/telegram-flow-audit-2026-11-13.md', text('../../../docs/telegram-flow-audit-2026-11-13.md')],
  ['docs/android-play.md', text('../../../docs/android-play.md')],
  ...readdirSync(new URL('../../desktop/src/WRGram.Desktop/', import.meta.url))
    .filter(name => name.endsWith('.cs'))
    .map((name): [string, string] => [`desktop/${name}`, text(`../../desktop/src/WRGram.Desktop/${name}`)]),
  ...readdirSync(new URL('.', import.meta.url))
    .filter(name => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
    .map((name): [string, string] => [`ui/${name}`, text(`./${name}`)]),
];

/** Las claves que despacha la línea citada, medidas el 20 de noviembre de 2026, línea por línea. */
const cables: Record<number, string[]> = {
  525: ['app.background'],
  534: ['account.profile'],
  535: ['chat.profile'],
  538: ['profile.related'],
  539: ['profile.peer'],
  541: ['profile.sender'],
  542: ['profile.contact'],
  543: ['clipboard.copy'],
  544: ['account.photo.pick'],
  545: ['account.photo.delete'],
  546: ['chat.photo.pick'],
  548: ['account.name'],
  549: ['account.bio'],
  550: ['account.username'],
  551: ['account.sessions'],
  552: ['privacy.get'],
  553: ['privacy.blocked'],
  556: ['password.state'],
  562: ['privacy.autoDelete'],
  564: ['privacy.autoDelete.set'],
  565: ['chat.autoDelete.set'],
  566: ['account.session.revoke'],
  570: ['contacts.list'],
  571: ['contacts.search'],
  576: ['contacts.add', 'contacts.remove'],
  577: ['contacts.open'],
  580: ['groups.members'],
  581: ['groups.members.page'],
  584: ['groups.member.ban'],
  585: ['groups.member.restrict'],
  587: ['groups.member.promote'],
  588: ['groups.member.demote'],
  589: ['groups.permissions.get'],
  593: ['chat.senders.get'],
  594: ['chat.senders.set'],
  595: ['chat.username'],
  597: ['chat.info'],
  598: ['chat.info.set'],
  606: ['folders.link'],
  607: ['folders.links.list'],
  608: ['folders.links.edit'],
  693: ['chat.stories'],
  694: ['chat.invite'],
  696: ['story.open'],
  697: ['message.story.open'],
  699: ['message.location.open'],
  700: ['story.close'],
  724: ['chat.find'],
  725: ['telegram.link'],
  729: ['chat.archive'],
  730: ['chat.unread'],
  732: ['chat.defaultSilent'],
  741: ['groups.add.info'],
  743: ['history.byDate'],
  749: ['messages.forward'],
  753: ['calls.list'],
  754: ['backgrounds.list'],
  755: ['background.set'],
  757: ['chat.requests'],
  758: ['chat.invitelinks'],
  761: ['chat.invitelink.revoke'],
  764: ['chat.request.answer'],
  765: ['scheduled.list'],
  768: ['scheduled.delete'],
  782: ['message.properties'],
  783: ['message.link'],
  784: ['link.open'],
  785: ['message.react'],
  787: ['message.react.custom'],
  797: ['emojiStatus.state'],
  799: ['emojiStatus.set'],
  808: ['bot.status'],
  820: ['bot.posts'],
  828: ['chat.bot.remove'],
  830: ['message.edit', 'message.edit.caption', 'message.delete', 'message.copy', 'message.forward'],
  831: ['message.edit.media'],
  835: ['catalog'],
  844: ['attachment.pick'],
  847: ['send.attachment'],
  848: ['attachment.album'],
  857: ['location.live.start'],
  858: ['location.live.stop'],
  882: ['native.assistant'],
  883: ['attachment.recents', 'attachment.photos.permission', 'attachment.photo', 'attachment.recents.close', 'composer.focus', 'groups.stats'],
  4527: ['underline'],
  4539: ['link'],
};

/** Las claves que hoy abre la línea `NNN` del puente. */
function caseKeys(at: number): string[] {
  return [...(java[at - 1] ?? '').matchAll(/case "([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
}

/** Todo número citado en los archivos vigilados, con cuántas veces lo cita cada uno. */
const cited = new Map<number, number>();
for (const [, body] of hosts) for (const match of body.matchAll(/NativeBridge\.java:(\d{2,6})(?:-(\d{2,6}))?/g)) {
  for (const at of [Number(match[1]), match[2] ? Number(match[2]) : 0]) {
    if (!at) continue;
    cited.set(at, (cited.get(at) ?? 0) + 1);
  }
}

/** Un enlace de documento con número en la etiqueta y ancla en el destino. */
const LINK =
  /\[([A-Za-z][\w.]*\.(?:tsx|ts|java|cs)):(\d{2,6})(?:-(\d{2,6}))?\]\((\.\.?\/[^)#]+)(?:#L(\d{2,6})(?:-(\d{2,6}))?)?\)/g;

describe('citas nativas · el despacho de Android, medido por línea', () => {
  it('cada fila de la tabla sigue abriendo las mismas claves', () => {
    for (const [at, keys] of Object.entries(cables)) {
      expect(caseKeys(Number(at)), `NativeBridge.java:${at}`).toEqual(keys);
    }
  });

  it('ninguna línea de la tabla dejó de ser una rama del `switch`', () => {
    for (const at of Object.keys(cables).map(Number)) {
      expect(java[at - 1], `NativeBridge.java:${at} no existe`).toBeDefined();
      expect(caseKeys(at).length, `NativeBridge.java:${at} ya no despacha`).toBeGreaterThan(0);
    }
  });

  it('todo número que cae sobre una rama está registrado en la tabla', () => {
    const huerfanas = [...cited.keys()]
      .filter(at => java[at - 1] !== undefined && caseKeys(at).length > 0 && cables[at] === undefined)
      .sort((a, b) => a - b);
    expect(huerfanas, 'citas nuevas sobre el despacho: re-ancla o reimprime la tabla').toEqual([]);
  });

  it('la tabla tiene sus ochenta y seis filas medidas', () => {
    expect(Object.keys(cables).length).toBe(86);
    expect(cited.size).toBeGreaterThanOrEqual(414);
  });

  it('ninguna cita señala fuera del archivo', () => {
    const fuera = [...cited.keys()].filter(at => at > java.length || at < 1).sort((a, b) => a - b);
    expect(fuera, `${java.length} líneas tiene hoy el puente`).toEqual([]);
  });

  it('la tabla tiene sus ochenta y seis filas medidas', () => {
    expect(Object.keys(cables).length).toBe(86);
    expect(cited.size).toBeGreaterThanOrEqual(414);
  });

  it('todo enlace etiquetado con número de línea apunta a la línea que dice', () => {
    const podridas: string[] = [];
    let enlaces = 0;
    for (const [doc, body] of hosts) {
      if (!doc.startsWith('docs/')) continue;
      const base = new URL(`../../../${doc}`, import.meta.url);
      body.replace(/\r\n/g, '\n').split('\n').forEach((line, idx) => {
        for (const match of line.matchAll(LINK)) {
          enlaces++;
          const [, etiqueta, desde, hasta, ruta, ancla, anclaHasta] = match;
          const donde = `${doc}:${idx + 1}`;
          const destino = new URL(ruta, base);
          if (!existsSync(destino)) { podridas.push(`${donde} · ${etiqueta}:${desde} → ${ruta} no existe`); continue; }
          if (!ancla) { podridas.push(`${donde} · ${etiqueta}:${desde} → el enlace a ${ruta} no lleva ancla`); continue; }
          if (ancla !== desde) { podridas.push(`${donde} · la etiqueta dice ${etiqueta}:${desde} y el enlace apunta a #L${ancla}`); continue; }
          const filas = readFileSync(destino, 'utf8').replace(/\r\n/g, '\n').split('\n').length;
          if (Number(desde) > filas) { podridas.push(`${donde} · ${etiqueta}:${desde} fuera de las ${filas} líneas del archivo`); continue; }
          if (hasta && (Number(hasta) > filas || Number(hasta) < Number(desde))) podridas.push(`${donde} · ${etiqueta}:${desde}-${hasta} es un rango imposible`);
          if (anclaHasta && Number(anclaHasta) < Number(ancla)) podridas.push(`${donde} · #L${ancla}-${anclaHasta} es un rango imposible`);
        }
      });
    }
    expect(podridas).toEqual([]);
    expect(enlaces).toBeGreaterThanOrEqual(14);
  });
});
