import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

/**
 * La ronda BL metió cinco líneas en el despacho de Windows y, con ellas, desplazó todas las citas que otras rondas
 * habían dejado escritas con número de línea. Ninguna aguja se rompió: las pruebas miran contenido, no el número que
 * va en un comentario o en un documento. Este archivo es el cortafuegos de esa clase de pudrición, para el sitio
 * donde más cita se ha escrito.
 */
const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const serviceLines = service.split(/\r?\n/);

/** Todo archivo que puede citar al host: las dos orillas del cable y los tres documentos de registro. */
const hosts: [string, string][] = [
  ...readdirSync(new URL('../../desktop/src/WRGram.Desktop/', import.meta.url))
    .filter(name => name.endsWith('.cs'))
    .map((name): [string, string] => [`desktop/${name}`, text(`../../desktop/src/WRGram.Desktop/${name}`)]),
  ...readdirSync(new URL('.', import.meta.url))
    .filter(name => /\.(ts|tsx)$/.test(name) && !name.includes('.test.'))
    .map((name): [string, string] => [`ui/${name}`, text(`./${name}`)]),
  ['docs/validation.md', text('../../../docs/validation.md')],
  ['docs/telegram-flow-audit-2026-11-13.md', text('../../../docs/telegram-flow-audit-2026-11-13.md')],
  ['docs/android-play.md', text('../../../docs/android-play.md')],
];

/** Lo que tiene que decir la línea citada. Una fila por número, medida hoy, línea por línea. */
const anchors: Record<number, string> = {
  112: 'if (method == "media.load")',
  117: 'if (method == "media.retry")',
  122: 'object? result = method switch',
  173: '"privacy.autoDelete" =>',
  220: '"chat.join" =>',
  253: '"profile.sender" =>',
  270: '"groups.permissions.get" =>',
  277: '"chat.invite" =>',
  301: '"history.byDate" =>',
  309: '"message.forward" =>',
  331: '"attachment.pick" => await AttachmentPickAsync(Str(args, "kind")),',
  364: '"app.background" => true',
  365: '"native.settings" => OpenDataFolder()',
  370: '"message.link" =>',
  371: '"link.open" =>',
  419: '"contacts.list" =>',
  425: '"contacts.open" =>',
  429: '"contacts.add" =>',
  440: '_ => throw new BridgeException',
  532: '_state.ProfilePhoto = _media.RegisterProfile(',
  919: 'private async Task<object?> OpenContactAsync(',
  995: 'private async Task<object?> JoinChatAsync(',
  1046: 'private async Task<object?> MessageLinkAsync(',
  1066: 'private async Task<object?> TelegramLinkAsync(JsonElement args) => await LinkFromUrlAsync(',
  1081: 'private async Task<object?> LinkFromUrlAsync(',
  1125: 'private static string LinkRefusal(',
  1162: 'private async Task<object?> HistoryDateAsync(',
  1538: 'private async Task<object?> ForwardAsync(',
  1907: 'private async Task<object?> AttachmentPickAsync(string kind)',
  2045: 'attributes = DesktopAttachment.AttributesFor(file.Name, file.Mime)',
  2670: 'dispatcher.Invoke(() => Clipboard.SetText(text))',
  2926: 'private object Properties(',
  2937: 'var forwardable = message?.CanForward',
  2951: 'deleteSelf = DesktopMessageDelete.CanDeleteSelf(kind)',
  2984: 'var name = DesktopDocuments.DownloadName(',
  3075: 'private bool OpenLink(',
  3103: 'private async Task<object?> OpenLocationAsync(',
  3110: 'ProtectedChat(entry)) throw new BridgeException',
  3114: 'MessageMediaGeoLive live => live.geo',
  3146: 'AlbumId = DesktopAlbum.AlbumIdOf(message)',
  3172: 'dto.CanForward = exportable',
  3192: 'case MessageMediaContact card:',
  3211: 'case MessageMediaGeoLive live:',
  3230: 'case MessageMediaGeo fixedGeo:',
  3244: 'case MessageMediaVenue venue:',
  3258: 'case MessageMediaWebPage { webpage: WebPage page }:',
  3410: 'MessageEntityUnderline => "underline"',
  3451: '"blockquote" => new MessageEntityBlockquote()',
  3512: 'Username = channel.MainUsername',
  3552: 'return "@" + user.MainUsername',
  3571: 'MessageMediaGeoLive => DesktopLocation.Live',
};

/** La última línea de cada rango citado; la primera la lleva la tabla de arriba. */
const rangeEnds = new Map<number, number>([
  [173, 176], [270, 271], [309, 310], [371, 372], [419, 421], [429, 430], [1162, 1177],
  [2937, 2953], [3114, 3116], [3571, 3573],
]);

const ends: Record<number, string> = {
  176: '"chat.autoDelete.set" =>',
  271: '"groups.permissions.set" =>',
  310: '"messages.forward" =>',
  372: '"telegram.link" =>',
  421: '"share.contact" =>',
  430: '"contacts.remove" =>',
  1177: '}',
  2953: 'forward = forwardable',
  3116: 'MessageMediaVenue venue => venue.geo',
  3573: 'MessageMediaVenue venue => DesktopLocation.Title(',
};

/** Las citas escritas, con su rango: `TelegramService.cs:NNN` o `TelegramService.cs:NNN-MMM`. */
function cited(from: string): [number, number][] {
  return [...from.matchAll(/TelegramService\.cs:(\d+)(?:-(\d+))?/g)]
    .map(match => [Number(match[1]), match[2] ? Number(match[2]) : 0]);
}
const written = new Map<number, number>();
for (const [, body] of hosts) for (const [start, end] of cited(body)) {
  if (!written.has(start) || (written.get(start) ?? 0) < end) written.set(start, end);
}

/** El despacho medido, con el mismo recorte que usan BK y BJ: brazos vivos, brazos que se niegan y su línea. */
function dispatch() {
  const start = serviceLines.findIndex(row => row.includes('object? result = method switch'));
  const generic = serviceLines.findIndex(row => row.includes('No disponible en escritorio (beta): {method}'));
  const arms = new Map<string, number>();
  serviceLines.slice(start, generic + 1).forEach((row, offset) => {
    const arrow = row.indexOf('=>');
    if (arrow < 0) return;
    for (const match of row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)) arms.set(match[1], start + offset + 1);
  });
  serviceLines.slice(0, start).forEach((row, index) => {
    const key = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
    if (key) arms.set(key, index + 1);
  });
  return { start: start + 1, generic: generic + 1, arms };
}
const cable = dispatch();

const line = (at: number) => {
  const row = serviceLines[at - 1];
  if (row === undefined) throw new Error(`Falta la línea ${at} de TelegramService.cs`);
  return row;
};

describe('ronda BM · las citas del host, medida por línea', () => {
  it('cada número citado señala hoy la línea que la frase afirma', () => {
    for (const [at, needle] of Object.entries(anchors)) expect(line(Number(at)), `TelegramService.cs:${at}`).toContain(needle);
  });

  it('el final de cada rango citado también dice lo suyo', () => {
    for (const [, end] of rangeEnds) {
      expect(end, `rango que termina en ${end}`).toBeGreaterThan(0);
      expect(line(end), `TelegramService.cs:${end}`).toContain(ends[end]);
    }
  });

  it('toda cita escrita tiene su ancla y toda ancla está citada en algún lado', () => {
    expect([...written.keys()].sort((a, b) => a - b)).toEqual(Object.keys(anchors).map(Number).sort((a, b) => a - b));
  });

  it('ninguna cita se queda sin el nombre del archivo delante', () => {
    // Una cifra suelta `:414` atribuida al host por vecindad es una cita que se pudre en silencio: el día que
    // alguien meta líneas arriba, la aguja no existe. La casa exige el nombre completo en cada cita de este archivo.
    const loose = hosts
      .map(([name, body]) => [...body.matchAll(/TelegramService\.cs:[\d-]+[^)]{0,80}?`:(\d+)/g)].map(m => `${name}:${m[1]}`))
      .flat();
    expect(loose).toEqual([]);
  });

  it('las anclas que caen dentro del despacho son exactamente las líneas que mide el cable', () => {
    const mismatched: string[] = [];
    for (const at of Object.keys(anchors).map(Number)) {
      if (at < cable.start || at > cable.generic) continue;
      const key = /"([a-z][a-zA-Z0-9._]*)"/.exec(line(at))?.[1];
      if (!key) continue;
      if (cable.arms.get(key) !== at) mismatched.push(`${key}: cita ${at}, cable ${cable.arms.get(key)}`);
    }
    expect(mismatched).toEqual([]);
  });

  it('el rechazo genérico y la cabecera del `switch` están anclados por su línea medida', () => {
    expect(anchors[cable.generic]).toContain('_ => throw new BridgeException');
    expect(anchors[cable.start]).toContain('object? result = method switch');
  });

  it('las dos cifras que los documentos recuerdan del despacho están medidas, no copiadas', () => {
    const answered = new Set<string>();
    const refused = new Set<string>();
    const start = cable.start - 1;
    serviceLines.slice(start, cable.generic).forEach(row => {
      const arrow = row.indexOf('=>');
      if (arrow < 0) return;
      const keys = [...row.slice(0, arrow).matchAll(/"([a-z][a-zA-Z0-9._]*)"/g)].map(match => match[1]);
      const negative = /=>\s*throw\b/.test(row) || row.includes('No disponible en escritorio');
      for (const key of keys) (negative ? refused : answered).add(key);
    });
    serviceLines.slice(0, start).forEach(row => {
      const key = /if \(method == "([a-z][a-zA-Z0-9._]*)"\)/.exec(row)?.[1];
      if (key) answered.add(key);
    });
    const map = hosts.find(([name]) => name.startsWith('docs/telegram-flow'))?.[1] ?? '';
    const notes = hosts.find(([name]) => name === 'docs/validation.md')?.[1] ?? '';
    expect(map).toContain(`lo que da hoy **${answered.size}** claves contestadas`);
    expect(notes).toContain(`Cifras: **${answered.size}** brazos vivos`);
    expect(notes).toContain(`**${refused.size}** brazos que se niegan`);
  });
});
