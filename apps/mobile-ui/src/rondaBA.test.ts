import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PEER_MAX_OFFSET, PEER_PAGE, PEER_PRESENCE, PEER_REFUSALS, PEER_ROLE, activeUsernames, peerCursor, peerOffset, peerPresence, peerRole } from './peerCard';

const text = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const rules = text('../../desktop/src/WRGram.Desktop/DesktopPeerProfile.cs');
const cable = text('../../desktop/src/WRGram.Desktop/DesktopPeerProfileFlow.cs');
const service = text('../../desktop/src/WRGram.Desktop/TelegramService.cs');
const preview = text('./preview.ts');
const mirror = text('./peerCard.ts');
const java = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/NativeBridge.java');

const lines = java.split('\n');

/** Una línea de Android, contada desde 1. Sin aguja no hay prueba: se falla. */
function line(number: number): string {
  const value = lines[number - 1];
  if (!value) throw new Error(`Falta la línea ${number} de NativeBridge`);
  return value;
}

/** El literal que la clase de reglas de C# asigna a una constante de texto. */
function csSentence(name: string, from = rules): string {
  const match = new RegExp(`public const string ${name} =\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(from);
  if (!match) throw new Error(`Falta la constante ${name}`);
  return match[1].replace(/\\"/g, '"');
}

/** Si la línea de Android lleva esa frase escrita como literal entero. */
const says = (number: number, phrase: string) => line(number).includes(`"${phrase}"`);

/** Y si la lleva partida por una concatenación, se comprueban los pedazos en orden. */
function saysInParts(number: number, ...parts: string[]): void {
  const row = line(number);
  let cursor = 0;
  for (const part of parts) {
    const at = row.indexOf(`"${part}"`, cursor);
    if (at < 0) throw new Error(`La línea ${number} de Android no dice "${part}"`);
    cursor = at + part.length;
  }
}

const count = (needle: string, from: string) => from.split(needle).length - 1;

type DesignCall = (method: string, params: Record<string, unknown>) => Promise<unknown>;
type Peer = { id: string; title: string; type: string; username: string; bot: boolean; supported: boolean };
type Related = { chats?: Peer[]; members?: { id: string; name: string; role: string }[]; nextCursor?: string; nextOffset?: number; hasMore?: boolean };

describe('ronda BA · la ficha de perfil y su pestaña, cruzadas con las tres capas', () => {
  it('las cuatro órdenes de la ficha tienen brazo en el host y nombre en el puente', () => {
    for (const needle of ['"chat.profile" => await ChatProfileAsync(args),', '"profile.related" => await RelatedAsync(args),',
      '"profile.peer" => ProfilePeerAsync(args),', '"profile.contact" => ProfileContactAsync(args),']) {
      expect(service).toContain(needle);
    }
    // Y las cuatro ya estaban en la lista de métodos de Android: aquí no se añadió ninguna.
    const policy = text('../../mobile/android/app/src/main/java/cc/webrom/wrgram/BridgePolicy.java');
    for (const method of ['chat.profile', 'profile.related', 'profile.peer', 'profile.contact']) expect(policy).toContain(`"${method}"`);
  });

  it('las tres negaciones con gemelo son la palabra de Android en su línea', () => {
    expect(PEER_REFUSALS.noList).toBe(csSentence('NoList'));
    expect(says(1620, PEER_REFUSALS.noList)).toBe(true);
    expect(PEER_REFUSALS.secret).toBe(csSentence('Secret'));
    expect(says(1645, PEER_REFUSALS.secret)).toBe(true);
    expect(PEER_REFUSALS.loadFailed).toBe(csSentence('LoadFailed'));
    expect(says(1256, PEER_REFUSALS.loadFailed)).toBe(true);
    expect(says(1294, PEER_REFUSALS.loadFailed)).toBe(true);
  });

  it('la cuarta es propia de Windows y lo dice una sola vez en cada capa', () => {
    expect(PEER_REFUSALS.noHash).toBe(csSentence('NoHash'));
    // Sin gemelo en Java: TDLib guarda el access_hash en casa y esa situación no existe en Android.
    expect(java).not.toContain(PEER_REFUSALS.noHash);
    expect(count(`"${PEER_REFUSALS.noHash}"`, rules)).toBe(1);
    expect(count('DesktopPeerProfile.NoHash', cable)).toBe(3);
  });

  it('el andamio no escribe ni una de esas cuatro frases: las pregunta', () => {
    for (const phrase of Object.values(PEER_REFUSALS)) {
      expect(count(phrase, preview)).toBe(0);
      expect(count(phrase, mirror)).toBe(1);
    }
  });

  it('las cinco cadenas de presencia son las de presence() y viven una vez en el espejo', () => {
    expect(PEER_PRESENCE.online).toBe(csSentence('Online'));
    expect(says(1588, PEER_PRESENCE.online)).toBe(true);
    expect(PEER_PRESENCE.offline).toBe(csSentence('OfflinePrefix'));
    saysInParts(1591, PEER_PRESENCE.offline);
    expect(PEER_PRESENCE.recently).toBe(csSentence('Recently'));
    expect(says(1593, PEER_PRESENCE.recently)).toBe(true);
    expect(PEER_PRESENCE.week).toBe(csSentence('LastWeek'));
    expect(says(1594, PEER_PRESENCE.week)).toBe(true);
    expect(PEER_PRESENCE.month).toBe(csSentence('LastMonth'));
    expect(says(1595, PEER_PRESENCE.month)).toBe(true);
    // Cada una, una sola vez en la clase de reglas: el cable pregunta, no repite.
    for (const phrase of Object.values(PEER_PRESENCE)) expect(count(`"${phrase}"`, rules)).toBe(1);
    // Y el cable no escribe español suyo: usa la función.
    expect(cable).toContain('DesktopPeerProfile.Presence(user?.status, DateTime.Now)');
  });

  it('la ventana de treinta y el recorte de cinco mil, con su línea', () => {
    expect(PEER_PAGE).toBe(30);
    expect(PEER_MAX_OFFSET).toBe(5000);
    // Medido hoy en NativeBridge: el recorte vive en la línea del `Math.min`, las dos ventanas de treinta
    // son llamadas distintas (`GetGroupsInCommon` y `GetSupergroupMembers`) y el 30 del cursor está en la
    // comparación que arma `nextCursor`.
    expect(line(1600)).toContain('5000');
    expect(line(1604)).toContain(',30)');
    expect(line(1618)).toContain(',30)');
    expect(line(1611)).toContain('count==30');
    expect(cable).toContain('DesktopPeerProfile.Offset(Long(args, "offset"))');
    expect(cable).toContain('DesktopPeerProfile.Page');
  });

  it('el puesto de la fila es el de profileMembers, en las dos familias de participantes', () => {
    saysInParts(1631, 'Creador', 'Administrador');
    expect(PEER_ROLE.creator).toBe('Creador');
    expect(PEER_ROLE.admin).toBe('Administrador');
    expect(PEER_ROLE.none).toBe('');
    // Las dos sobrecargas: el básico trae `ChatParticipant*` y la comunidad `ChannelParticipant*`.
    expect(rules).toContain('public static string Role(ChatParticipantBase? part) => part switch');
    expect(rules).toContain('public static string Role(ChannelParticipantBase? part) => part switch');
    expect(peerRole('Creador')).toBe(PEER_ROLE.creator);
    expect(peerRole('Miembro')).toBe(PEER_ROLE.none);
  });

  it('la comunidad no inventa lo que la librería no da, y pregunta la administración', () => {
    // La puerta de ver la lista es una bandera de `TL.ChannelFull`, medida por reflexión.
    expect(cable).toContain('ChannelFull.Flags.can_view_participants');
    // La administración no está en el full: se pregunta al participante propio, como antes de listar.
    expect(cable).toContain('DesktopGroupMembers.Actor.From(await SelfParticipantAsync(client, channel))');
    expect(cable).toContain('var admin = actor.Creator || actor.CanRestrict || actor.CanPromote;');
    // Y `hasStories` se queda fuera: TDLib publica un booleano y MTProto manda `PeerStories` entero.
    expect(cable).not.toContain('hasStories');
    // La bio viaja sin entidades: `about` es una cadena.
    expect(count('bioEntities = Array.Empty<object>()', cable)).toBe(3);
  });

  it('el básico no abre la puerta si la tabla no vino, y el privado exige el par de identificador', () => {
    expect(cable).toContain('canViewMembers = table != null && listed > 0');
    expect(cable).toContain('if (peer.access_hash == 0) throw new BridgeException(DesktopPeerProfile.NoHash);');
    // La fila que no es comunidad ni básico no se finge: se niega con la palabra de Android.
    expect(cable).toContain('default: throw new BridgeException(DesktopPeerProfile.NoList);');
  });

  it('el andamio modela las cuatro con las reglas del espejo y ninguna frase propia', () => {
    for (const needle of ['if (method === \'profile.related\') return designRelated(params, state);',
      'if (method === \'profile.peer\') return designPeer(params, state);',
      'if (method === \'profile.contact\') return designContact(params, state);']) {
      expect(preview).toContain(needle);
    }
    for (const name of ['designRelated', 'designPeer', 'designContact']) expect(count(`function ${name}(`, preview)).toBe(1);
    expect(preview).toContain("import { PEER_PAGE, PEER_REFUSALS, activeUsernames, peerCursor, peerMemberRow, peerOffset, peerPresence, peerRole, peerRow } from './peerCard';");
  });
});

describe('ronda BA · las manos sobre el andamio', () => {
  let call: DesignCall;

  async function use(target: 'desktop' | 'android') {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { fixture, designRequest } = await import('./preview');
    const transport = await import('./bridge');
    transport.acceptState({ ...fixture, platform: target, ready: true, name: 'Rodrigo' });
    call = designRequest as DesignCall;
  }

  const ask = async (method: string, params: Record<string, unknown>) =>
    call(method, params).catch((caught: Error) => caught.message);

  beforeEach(async () => { await use('desktop'); });

  it('la pestaña de un privado trae comunidades y su cursor se corta con la página', async () => {
    const value = await call('profile.related', { id: '11', offset: 0, cursor: '0' }) as Related;
    expect(Array.isArray(value.chats)).toBe(true);
    expect(value.chats!.length).toBeGreaterThan(0);
    expect(value.chats!.every(chat => chat.type === 'group' || chat.type === 'channel')).toBe(true);
    expect(Object.keys(value.chats![0])).toEqual(['id', 'title', 'type', 'username', 'bot', 'supported']);
    // Menos de treinta: la lista terminó, y el cursor vuelve a «0» como en `:1584`.
    expect(value.nextCursor).toBe('0');
    expect(peerCursor(['9', '10'], 2)).toBe('0');
  });

  it('la pestaña de una comunidad pregunta de treinta en treinta y la del básico se corta en casa', async () => {
    const community = await call('profile.related', { id: '14', offset: 0 }) as Related;
    expect(Object.keys(community.members![0])).toEqual(['id', 'name', 'role']);
    expect(community.members!.some(row => row.role === PEER_ROLE.admin)).toBe(true);
    expect(community.hasMore).toBe(false);
    expect(community.nextOffset).toBe(community.members!.length);
    // El básico: fuera de la tabla no hay fila, y el desplazamiento se queda donde terminó la lista.
    const basic = await call('profile.related', { id: '18', offset: 4000 }) as Related;
    expect(basic.members).toEqual([]);
    expect(basic.hasMore).toBe(false);
    expect(typeof basic.nextOffset).toBe('number');
  });

  it('el desplazamiento entra recortado, igual que en el puente', () => {
    expect(peerOffset(9_999)).toBe(PEER_MAX_OFFSET);
    expect(peerOffset(-7)).toBe(0);
    expect(peerOffset(Number.NaN)).toBe(0);
    expect(peerOffset(12)).toBe(12);
  });

  it('tocar una fila abre su ficha, y una persona que la lista no trajo se niega', async () => {
    const community = await call('profile.peer', { id: '14' }) as Peer;
    expect(community.id).toBe('14');
    expect(community.supported).toBe(true);
    const member = await call('profile.contact', { id: '502' }) as Peer;
    expect(member.type).toBe('private');
    expect(member.title).toBe('María Fernández');
    expect(await ask('profile.contact', { id: '9999' })).toBe(PEER_REFUSALS.noHash);
    expect(await ask('profile.peer', { id: '9999' })).toBe(PEER_REFUSALS.noHash);
  });

  it('un chat sin lista de participantes se niega con la palabra de Android', async () => {
    expect(await ask('profile.related', { id: '9999' })).toBe(PEER_REFUSALS.noList);
  });

  it('la persona que trajo la lista abre su ficha y su pestaña, con el identificador que devolvió el puente', async () => {
    // `profile.contact` responde con el identificador suelto, sin entrada en el muestrario: las dos preguntas que la
    // pantalla hace después —la ficha y «En común»— tienen que atender ese identificador, no solo los de los chats.
    const member = await call('profile.contact', { id: '502' }) as Peer;
    const profile = await call('chat.profile', { id: member.id }) as { title: string; groupCount: number; presence: string };
    expect(profile.title).toBe('María Fernández');
    expect(profile.groupCount).toBe(2);
    expect(profile.presence).toBe(PEER_PRESENCE.recently);
    const related = await call('profile.related', { id: member.id, offset: 0 }) as Related;
    expect(related.chats!.length).toBeGreaterThan(0);
    expect(related.chats!.every(chat => chat.type === 'group' || chat.type === 'channel')).toBe(true);
    expect(related.nextCursor).toBe('0');
  });

  it('la ficha del privado ya trae lo que la pantalla lee, con la presencia del espejo', async () => {
    const profile = await call('chat.profile', { id: '11' }) as { groupCount: number; presence: string; usernames: string[]; phone: string; blocked: boolean };
    expect(profile.groupCount).toBe(2);
    expect(profile.presence).toBe(PEER_PRESENCE.online);
    expect(profile.usernames).toEqual(['maria_fdz']);
    // La ronda BI puso a María en la lista de bloqueados del andamio, y la ficha lee esa misma lista: el campo dejó
    // de ser un `false` de relleno para ser la fila que el panel de Ajustes puede quitar.
    expect(profile.blocked).toBe(true);
    expect(activeUsernames([{ username: 'a', active: false }, { username: 'b', active: true }, { username: '', active: true }])).toEqual(['b']);
  });

  it('las cinco cadenas de presencia se deciden igual en las dos capas', () => {
    const now = 1_700_000_000;
    expect(peerPresence({ kind: 'online', expires: now + 5 }, now)).toBe(PEER_PRESENCE.online);
    // Un `expires` ya pasado no dice «En línea», como en `:1561`.
    expect(peerPresence({ kind: 'online', expires: now - 5 }, now)).toBe('');
    expect(peerPresence({ kind: 'recently' }, now)).toBe(PEER_PRESENCE.recently);
    expect(peerPresence({ kind: 'week' }, now)).toBe(PEER_PRESENCE.week);
    expect(peerPresence({ kind: 'month' }, now)).toBe(PEER_PRESENCE.month);
    // Y el «fuera» sin marca no dice nada, que es el `at>0` de allá.
    expect(peerPresence({ kind: 'offline', was: 0 }, now)).toBe('');
    expect(peerPresence(undefined, now)).toBe('');
    expect(peerPresence({ kind: 'offline', was: now }, now)).toContain(PEER_PRESENCE.offline);
  });

  it('en la vista de Android la pestaña se modela igual: la pantalla no sabe de transportes', async () => {
    await use('android');
    const value = await call('profile.related', { id: '14', offset: 0 }) as Related;
    expect(value.members!.length).toBeGreaterThan(0);
    expect(value.members!.every(row => ['Creador', 'Administrador', ''].includes(row.role))).toBe(true);
  });
});
