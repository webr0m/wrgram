import { EMPTY, type AddResult, type BlockedSender, type Chat, type ChatMembership, type CallLogEntry, type CallLogPage, type CommunityStats, type Contact, type ForumTopicInfo, type GlobalSearch, type GroupAdminRights, type GroupMember, type GroupPermissions, type InviteLink, type JoinRequest, type Media, type Message, type PhoneCodeInfo, type Poll, type ReactionOption, type RosterMember, type SafetyNotice, type SafetySignal, type SavedFilter, type ScopePatch, type ScopeSettings, type State, type StoryAlbum, type TextEntity } from './contract';
import { acceptState, snapshot } from './bridge'; import { previewDeviceGallery } from './previewDeviceGallery';
import { normalizeSearch } from './inboxModel';
import { CHAT_SENDER, REJECTIONS, hasBand, problem } from './messageSearch';
import { effective, patchProblem, pendingChanges } from './scopeSettings';
import { LIMITS, changedNotice, noRightNotice, prepared, unreadableNotice, unsupportedNotice, problem as communityProblem, type CommunityField } from './communityInfo';
import { ADD_REJECTIONS, batchProblem, fitsLong, forwardProblem, positiveId } from './memberAdditions';
import { MEMBERSHIP_UNSUPPORTED } from './membership';
import { BAN_ACTIONS, ROSTER_NOTES, ROSTER_STATUS, ROSTER_UNKNOWN_NAME, banishProblem, rosterInvitedName, rosterManage, rosterMatches, rosterNote, rosterQueryProblem, rosterRemaining } from './groupRoster';
import { BAD_RECIPIENT, MOMENTS, SELF_RECIPIENT, UNSUPPORTED, community, eligible } from './chatOwnership';
import { DESKTOP_MEMBER_REFUSALS, desktopMemberFilterProblem, desktopMemberQueryProblem, isSupergroupOrChannel } from './desktopMembers';import { STATS_REFUSALS } from './groupStats';
import { CHAT_USERNAME_REFUSALS, type ChatUsernameFixture } from './chatUsernames';
import { GROUP_PERMISSION_KEYS, GROUP_PERMISSION_REFUSALS, allowedPermissions, applyPermissions, completePermissions, permissionsDto, type GroupPermissionsFixture } from './groupPermissions';
import { PRIVACY_KEYS, PRIVACY_MAX_KEY, PRIVACY_MAX_VALUE, PRIVACY_REFUSALS, mergePrivacy, privacyIds, privacyProblem, projectPrivacy, shapedIds, shapedText, type PrivacyRule } from './privacySettings';
import { BLOCKED_REFUSALS, blockedLimit, blockedOffset, blockedOffsetProblem, blockedPage, blockedSender } from './blockedSenders';
import { AUTO_DELETE_DAY, AUTO_DELETE_REFUSALS, autoDeleteOwned, autoDeleteProblem, canChangeAutoDelete, type AutoDeleteFixture } from './autoDelete';
import { PEER_PAGE, PEER_REFUSALS, activeUsernames, peerCursor, peerMemberRow, peerOffset, peerPresence, peerRole, peerRow } from './peerCard';
import { ADMIN_RIGHT_RULES, NO_ADMIN_RIGHTS, SANCTION_DURATION, SANCTION_REFUSALS, demotePreProblem, demoteRightProblem, demoteTargetProblem, liftPreProblem, liftRightProblem, liftTargetProblem, promotePreProblem, promoteRightProblem, promoteTargetProblem, requestedRights, sanctionPreProblem, sanctionRightProblem, sanctionTargetProblem } from './memberSanctions';
import { desktopGapRefusal } from './desktopGap'; import { LIVE_DURATIONS, LIVE_REFUSALS, type LiveStart } from './liveLocation'; import { CALL_LOG_REFUSALS, callLogOffsetProblem, callLogPage, callRowLabel, type CallReason } from './callLogModel';
import { type CloudBackground } from './cloud-backgrounds';
const ownBio='Construyendo WRGram, un cliente de Telegram propio. Novedades en https://wrgram.app y dudas por @rodrigo_web';
const mariaBio='Diseñadora de producto. Portfolio en https://maria.design · escríbeme por @maria_fdz';
const communityBio='Un espacio para construir juntos. Guía y descargas en https://wrgram.app';
// Cola sintética de solicitudes de ingreso: 25 entradas para ver las dos páginas del marcador.
const joinNames=['Nuria Sala','Iván Pacheco','Lucía Ferrer','Marcos Gil','Ane Etxebarria','Diego Rojo','Clara Vidal','Toni Sastre','Bea Nan','Rubén Casas','Olga Prieto','Jairo Luna','Vera Colom','Pau Ferrán','Sara Miralles','Ivo Blasco','Nadia Ortiz','Leo Sanz','Gala Riera','Hugo Prats','Mireia Font','Ciro Delgado','Ines Vall','Bruno Camps','Elia Martos'];
const joinQueue: JoinRequest[]=joinNames.map((name,index)=>({userId:String(4101+index),name,date:Math.floor(Date.now()/1000)-index*2220,bio:index%4===0?'Escribo en el canal de novedades y me gustaría aportar ideas.':index%7===0?'':'Conozco el proyecto desde la primera beta.'}));
const linkLabels=['Prensa','Vecinos de Gràcia','Beta testers','Canal de novedades','Equipo de diseño','Comunidad hispana','Soporte rápido','Alianzas','Traductores','Moderación','Eventos','Reuniones','Clientes','Proveedores','Facilitadores','Escuela','Barrio Nord','Sindicato','Colectivo 26','Radio libre','Podcast','Voluntariado'];
let linkSequence=0;
const nowLink=Math.floor(Date.now()/1000);
const activeLinks: InviteLink[]=linkLabels.map((name,index)=>({
  link:`https://t.me/+link${100+index}`,
  name:index===0?'':name,
  creator:'1001',
  created:nowLink-index*5400,
  edited:index%5===0?nowLink-index*1800:0,
  expires:index%3===0?0:nowLink+(index+1)*86400,
  memberLimit:index%4===0?0:25+index,
  memberCount:index*3,
  pending:index===2?4:0,
  approval:index===2,
  primary:index===0,
  revoked:false,
  paid:index===1,
}));
const revokedLinks: InviteLink[]=[
  {link:'https://t.me/+old701',name:'Enlace filtrado',creator:'1001',created:nowLink-900000,edited:0,expires:0,memberLimit:0,memberCount:64,pending:0,approval:false,primary:false,revoked:true,paid:false},
  {link:'https://t.me/+old702',name:'Sorteo de 2025',creator:'1001',created:nowLink-1400000,edited:nowLink-1200000,expires:0,memberLimit:50,memberCount:48,pending:0,approval:false,primary:false,revoked:true,paid:false},
];
type SafetyFixture = { notice?: SafetyNotice; signals: SafetySignal[]; canReport: boolean; dismissible: boolean };
// Señales sintéticas: cada chat reproduce una barra de Telegram distinta, sin inventar reputación.
const safetyFixtures: Record<string, SafetyFixture> = {
  '11': { signals: [{ id: 'notContact', tone: 'warn' }, { id: 'privateForwards', tone: 'info' }, { id: 'commonGroups', tone: 'info', value: '2' }], canReport: true, dismissible: false },
  '14': { notice: { kind: 'invite', tone: 'info' }, signals: [{ id: 'verified', tone: 'good' }, { id: 'joinByRequest', tone: 'info' }, { id: 'protectedContent', tone: 'info' }], canReport: false, dismissible: false },
  '21': { notice: { kind: 'unknown', tone: 'warn', registered: '2024-03' }, signals: [{ id: 'unofficialApp', tone: 'warn' }, { id: 'notContact', tone: 'warn' }, { id: 'restrictsNewChats', tone: 'warn' }], canReport: true, dismissible: true },
  '22': { notice: { kind: 'spam', tone: 'warn', canUnarchive: true }, signals: [{ id: 'anonymousSenders', tone: 'info' }, { id: 'signMessages', tone: 'info' }], canReport: true, dismissible: true },
  '24': { notice: { kind: 'join', tone: 'info', channel: false, title: 'WRGram · Colaboración', date: Math.floor(Date.now() / 1000) - 93_600 }, signals: [{ id: 'joinByRequest', tone: 'info' }], canReport: false, dismissible: false },
};
const noticeFor = (id: string): SafetyNotice | undefined => safetyFixtures[id]?.notice;
// Ajustes de notificación por alcance, con sonidos guardados por Telegram para poder nombrarlos.
const INDEFINITE = 2_147_483_647;
const savedSounds = [{ id: '777', title: 'Tinta', duration: 2 }, { id: '888', title: 'Burbuja', duration: 1 }];
const scopeFixtures: Record<string, ScopeSettings> = {
  private: { scope: 'private', muted: false, muteFor: 0, sound: '-1', preview: true, muteStories: false, storyDefault: false, storySound: '-1', storyPoster: true, quietPinned: false, quietMentions: false },
  group: { scope: 'group', muted: true, muteFor: 28_800, sound: '777', preview: true, muteStories: false, storyDefault: false, storySound: '0', storyPoster: true, quietPinned: false, quietMentions: true },
  channel: { scope: 'channel', muted: true, muteFor: INDEFINITE, sound: '0', preview: false, muteStories: true, storyDefault: true, storySound: '-1', storyPoster: false, quietPinned: true, quietMentions: true },
};
// Nombre y descripción sintéticos por comunidad. Cada fila enseña un estado distinto del puente:
// editable, sin permiso, con la descripción ilegible y un canal donde esta cuenta sí manda.
type CommunityFixture = { title:string; description:string; descriptionKnown:boolean; canChange:boolean };
const communityFixtures: Record<string, CommunityFixture> = {
  '12': { title:'Equipo de diseño', description:'Bocetos, prototipos y revisiones de la interfaz.', descriptionKnown:true, canChange:true },
  '14': { title:'WRGram · Comunidad', description:communityBio, descriptionKnown:true, canChange:true },
  '18': { title:'Ideas & café', description:'Charla suelta sobre producto.', descriptionKnown:true, canChange:false },
  '22': { title:'WRGram · Novedades', description:'Avisos de cada versión.', descriptionKnown:true, canChange:true },
  '23': { title:'Comentarios · WRGram', description:'', descriptionKnown:true, canChange:true },
  '24': { title:'WRGram · Colaboración', description:'', descriptionKnown:false, canChange:true },
};
function entitiesOf(text:string,items:[('link'|'mention'),string][]):TextEntity[]{return items.flatMap(([type,value])=>{const offset=text.indexOf(value);return offset<0?[]:[{type,offset,length:value.length,...(type==='link'?{url:value}:{})}];});}
/** La ficha de la vista de diseño es mutable a propósito: un guardado se lee igual al reabrir el panel. */
function communityEntry(id:string,chats:Chat[]):CommunityFixture {
  const known = communityFixtures[id];
  if (known) return known;
  const chat = chats.find(item => item.id === id);
  return communityFixtures[id] = { title:chat?.title ?? 'Comunidad', description:'', descriptionKnown:true, canChange:true };
}
/**
 * Los nombres públicos sintéticos por comunidad (ronda BC). Son las dos claves de `sendChatUsername`
 * (`NativeBridge.java:1914`) y cada fila enseña un estado distinto del puente: un foro con un solo nombre, un
 * supergrupo con dos activos donde el editable es uno de ellos —el caso del vector con nombres secundarios—, un
 * canal con su enlace, y en «Colaboración» el chat sin enlace público, que es lo que la pantalla traduce por
 * «Sin nombre público activo» y lo que deja la caja de texto en blanco.
 *
 * Las cuatro tienen derecho a escribir (`communityFixtures` las cuatro con `canChange:true`), y por eso las cuatro
 * lo dicen con su `editable`: en MTProto la marca `editable` la pone Telegram justo sobre el nombre principal de
 * quien puede cambiarlo, así que un activo sin editable en un chat que esta cuenta administra sería un estado que
 * el servidor nunca manda. El brazo del `noRight` existe en las tres capas y aquí se sujeta por aguja en el
 * código, no por caso de diseño, y así se declara en la auditoría.
 */
const chatUsernameFixtures: Record<string, ChatUsernameFixture> = {
  '12': { editable:'wrgram_equipo', active:['wrgram_equipo'] },
  '14': { editable:'wrgram_community', active:['wrgram_community','wrgram_comunidad'] },
  '22': { editable:'wrgram_novedades', active:['wrgram_novedades'] },
  '24': { editable:'', active:[] },
};
function chatUsernameEntry(id:string,chats:Chat[]):ChatUsernameFixture {
  const known = chatUsernameFixtures[id];
  if (known) return known;
  const name = chats.find(item => item.id === id)?.username ?? '';
  return chatUsernameFixtures[id] = { editable:name, active:activeUsernames(name ? [{ username:name, active:true }] : []) };
}
/**
 * El espejo local de `channels.updateUsername`, que es lo que hace `DesktopChatUsernames.Apply` en el host: la
 * respuesta de Telegram no dice el nombre nuevo, así que quien lo guarda es la propia capa. Escribir nombre mueve
 * el editable al frente de la lista y deja los demás activos donde estaban; escribir vacío quita el editable sin
 * tocar los secundarios, que es exactamente lo que `channels.updateUsername` puede hacer con el principal.
 */
function applyChatUsername(entry:ChatUsernameFixture, username:string) {
  const rest = entry.active.filter(name => name !== entry.editable && name !== username);
  entry.editable = username;
  entry.active = username.length > 0 ? [username, ...rest] : rest;
}
/**
 * El temporizador que el andamio tiene guardado por conversación (ronda BN): el espejo de los `ttl_period` que el
 * puente de Windows lee de `users.getFullUser`, `messages.getFullChat` y `channels.getFullChannel`, y del
 * `messageAutoDeleteTime` con el que TDLib contesta `NativeBridge.java:1360`. Cada fila enseña un estado distinto del
 * ajuste: «Equipo de diseño» con el día, «Comunidad» con la semana, «Ideas & café» con el mes y —porque es la única
 * comunidad administrada por otra persona— el caso por el que se ve trabajar el `noRight`; «María» y el canal de
 * «Novedades» sin temporizador, que es de donde sale el «Borrado automático desactivado.» del panel. Lo que no está
 * en la tabla se arranca en cero, igual que un chat recién creado.
 *
 * Los chats secretos no tienen fila aquí, y no hace falta: la pantalla no abre el ajuste sobre uno en ninguna de las
 * dos capas (`App.tsx:904` y `:988`), así que las dos frases con las que Android los niega (`:1364` y `:1388`) no
 * tienen por dónde alcanzarse. Es el mismo motivo por el que la ronda AN dejó fuera del andamio la de las encuestas.
 */
const autoDeleteFixtures: Record<string, number> = { '12': AUTO_DELETE_DAY, '14': 7 * AUTO_DELETE_DAY, '18': 30 * AUTO_DELETE_DAY };
/** El `getDefaultHistoryTTL` sintético: el predeterminado con el que nacen los chats nuevos. */
const autoDeleteDefault = { seconds: 0 };
/**
 * `AutoDeleteStateAsync` (`DesktopAutoDeleteFlow.cs`), y la suya es la única regla que decide aquí el derecho: la
 * forma del chat. En una comunidad es el mismo testigo que leen `chat.info.set` y `chat.username.set` —en MTProto el
 * `canChangeInfo` del participante y en TDLib la respuesta de `GetChatMember`—; en un particular no hay derecho que
 * consultar, hay dos filas que Telegram no admite, la cuenta propia (Mensajes guardados) y el usuario de avisos.
 */
function autoDeleteRight(chat: Chat, state: State): AutoDeleteFixture {
  const seconds = autoDeleteFixtures[chat.id] ?? 0;
  if (community(chat)) return { seconds, canChange: communityEntry(chat.id, state.chats).canChange };
  return { seconds, canChange: canChangeAutoDelete(Number(chat.id), Number(state.selfId)) };
}
/**
 * Las dos lecturas (`:1337`). El orden es el de los dos puentes: primero la cuenta, porque en Android
 * `AccountSafetyPolicy.owner` va delante de cualquier petición, y después la fila.
 */
function designAutoDeleteGet(params: Record<string, unknown>, state: State, chatMode: boolean): AutoDeleteFixture {
  if (!autoDeleteOwned(params.accountId, state.selfId)) throw new Error(AUTO_DELETE_REFUSALS.wrongAccount);
  if (!chatMode) return { seconds: autoDeleteDefault.seconds, canChange: true };
  const chat = state.chats.find(item => item.id === String(params.id));
  if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
  return autoDeleteRight(chat, state);
}
/**
 * Las dos escrituras (`:1352`), con el orden medido de `autoDeleteSet`: la cuenta, la duración y solo entonces la
 * conversación, porque adelantar la forma haría que un «400 días» escrito en un chat ajeno oyera el permiso en lugar
 * del rango. Después viene el derecho —que en las dos capas se distingue por la forma del chat y no por lo que la
 * pantalla quiera mostrar— y la escritura. Las cuatro negaciones que no están aquí son las que no tienen con qué
 * cumplirse en una vista sintética: el `false` con el que se cancela la ventana de confirmar (ronda BE), la cuenta que
 * cambia mientras la ventana está abierta (`:1392`), y las dos guardas contra el otro dispositivo (`:1359` y `:1381`),
 * que aquí no tienen a nadie con quien pelear porque no hay segunda sesión. El `canChange` de la respuesta es `true`
 * en las dos capas porque los dos puentes lo devuelven fijo después de aplicar, y no es un descuido: quien acaba de
 * escribir ya tiene el derecho demostrado.
 */
function designAutoDeleteSet(params: Record<string, unknown>, state: State, chatMode: boolean): AutoDeleteFixture {
  if (!autoDeleteOwned(params.accountId, state.selfId)) throw new Error(AUTO_DELETE_REFUSALS.wrongAccount);
  const bad = autoDeleteProblem(params.seconds);
  if (bad) throw new Error(bad);
  const seconds = params.seconds as number;
  if (!chatMode) {
    autoDeleteDefault.seconds = seconds;
    return { seconds, canChange: true };
  }
  const chat = state.chats.find(item => item.id === String(params.id));
  if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
  if (!autoDeleteRight(chat, state).canChange)
    throw new Error(community(chat) ? AUTO_DELETE_REFUSALS.noRight : AUTO_DELETE_REFUSALS.notAllowedHere);
  autoDeleteFixtures[chat.id] = seconds;
  return { seconds, canChange: true };
}
/**
 * Las tablas de permisos predeterminados por comunidad (ronda BE, espejo de `DesktopGroupPermissions.Stored`). Cada
 * fila enseña un estado distinto del puente: «Equipo de diseño» tiene la tabla entera encendida —el grupo recién
 * creado, sin ninguna prohibición—, «Comunidad» apaga los stickers y las invitaciones, el canal de «Novedades» apaga
 * las dieciséis casillas porque en un canal los miembros no escriben, y «Colaboración» es la fila cuya tabla Telegram
 * aún no cargó, que es el caso por el que Android tiene el `chat.permissions == null` de `:1868` y Windows el
 * `has_default_banned_rights` apagado de `DesktopGroupPermissions.Stored`.
 *
 * Lo que aquí no tiene caso de diseño es la negativa del derecho: la cuenta de esta vista es administradora en todas
 * las comunidades —`availableRights` es el mismo testigo que usa el panel de miembros de la ronda AZ—, así que el
 * brazo del `noRight` se sujeta por aguja en el código, no por fila, y así se declara en la auditoría.
 */
const groupPermissionFixtures: Record<string, GroupPermissionsFixture> = {
  '12': { rights:allowedPermissions(), known:true },
  '14': { rights:{ ...allowedPermissions(), canSendOtherMessages:false, canInviteUsers:false }, known:true },
  '22': { rights:GROUP_PERMISSION_KEYS.reduce((rights,key)=>({ ...rights, [key]:false }), {} as GroupPermissions), known:true },
  '24': { rights:allowedPermissions(), known:false },
};
function groupPermissionsEntry(id:string):GroupPermissionsFixture {
  const known = groupPermissionFixtures[id];
  if (known) return known;
  return groupPermissionFixtures[id] = { rights:allowedPermissions(), known:true };
}
/**
 * El tope con el que `BridgePolicy.text` recibe los dos textos en `setChatInfo` (`NativeBridge.java:1967` y
 * `:1946`), que es menor que el límite de Telegram y por eso se comprueba antes: un texto de 2000 caracteres se
 * anuncia como lo que es (demasiado largo para el puente) y no como el cambio que la interfaz creía estar
 * guardando. Las dos negativas de aquí no las produce la pantalla nunca —solo el puente—, así que viven en el
 * espejo y no en `communityInfo.ts`.
 */
const COMMUNITY_BRIDGE_MAXIMUM = 1024;
const COMMUNITY_REFUSALS = {
  tooLong: 'Ese texto es demasiado largo para enviarlo a Telegram.',
  unknownField: 'Ese campo no se puede cambiar desde WRGram.',
};
// Las cuatro respuestas de `JoinChat`, una por fila, para poder leer las cuatro frases sin cuenta:
// el canal público entra directo, el club de lectura queda como solicitud, la comunidad con bot de
// seguridad manda abrir su chat (y la variante sin bot, ilegible) y la restringida rechaza el ingreso.
const membershipOutcomes: Record<string, ChatMembership> = {
  '992': { state:'joined', opened:false },
  '991': { state:'request', opened:false },
  '993': { state:'guard', opened:true },
  '994': { state:'guard', opened:false },
  '995': { state:'declined', opened:false },
};
// La propiedad que `GetChatOwnerAfterLeaving` devolvería: en un grupo básico cambia en cuanto sales y
// en un supergrupo, a los 7 días de no volver. Dos filas bastan para leer las dos frases del aviso.
const ownedChats: Record<string, { heir: string; basic: boolean }> = {
  '14': { heir:'502', basic:false },
  '18': { heir:'501', basic:true },
};
// Destinatarios posibles del traspaso, dicho por `GetUser` y no por la fila pintada: `504` es un bot y
// `507` una cuenta eliminada, y la schema excluye los dos. `509` no existe en la tabla: sin persona, sin propiedad.
const recipientFixtures: Record<string, { name: string; bot?: boolean; deleted?: boolean }> = {
  '500': { name:'Rosa Ibarra' }, '501': { name:'Álex Moreno' }, '502': { name:'María Fernández' },
  '503': { name:'Sofía López' }, '504': { name:'Bot de moderación', bot:true },
  '507': { name:'Cuenta eliminada', deleted:true },
};
const discoveredChat = (id:string, title:string, type:'group'|'channel'): Chat => ({
  id, title, preview:'', date:0, unread:0, marked:false, bot:false, type, pinned:false, muted:false,
  archived:false, supported:true, inList:false,
});
const lookupFixtures: Chat[] = [
  discoveredChat('993','Guardería de la comunidad','group'),
  discoveredChat('994','Refugio sin bot accesible','group'),
  discoveredChat('995','Sólo por invitación','group'),
];
// Las dos negaciones del puente, copiadas literalmente: si el puente cambia de frase, la guarda lo ve.
const INSIDE_NOTICE = 'Esta cuenta ya es miembro de esa comunidad en Telegram.';
const OUTSIDE_NOTICE = 'Esta cuenta ya no es miembro de esa comunidad en Telegram.';
// Las cuatro negaciones del enlace de invitación en Windows, copiadas carácter a carácter de
// `DesktopInviteLinks.cs`. No tienen gemelo en Android porque allí las resuelve TDLib o un cuadro nativo.
const INVITE_EXPIRED = 'El enlace de invitación caducó o lo revocaron sus administradores; Telegram no dejó entrar a esta cuenta.';
const INVITE_WEB_GUARD = 'Esta comunidad valida a quien entra desde una página del bot de seguridad, y WRGram en Windows no abre esa página. Termina el ingreso desde Telegram o desde la app de Android.';
const INVITE_PAID = 'Esta invitación cobra una suscripción con Telegram Stars y WRGram en Windows no pasa por ese cobro. Ábrela desde la app de Android para suscribirte.';
const INVITE_BAD_HASH = 'Ese enlace de invitación no trae un código reconocible.';
// Cinco enlaces, uno por cada cosa que `messages.checkChatInvite` puede decir antes de escribir: entra,
// pide aprobación, caducó, exige la página del bot y cobra con Stars. El sexto no es un enlace de
// invitación y se va al navegador, que es lo que este host hacía antes de la ronda AB.
// La tabla se indexó por `hash` y no por la url, porque el puente lee los tres formatos: la misma
// invitación llega como `t.me/+x`, `t.me/joinchat/x` o `tg://join?invite=x`.
const inviteFixtures: Record<string, { title?: string; members?: number; approval?: boolean; state?: string; refuses?: string }> = {
  Abierto92: { title:'Astronomía en Chile', members:1204, state:'joined' },
  Aprobada91: { title:'Club de lectura', members:38, approval:true, state:'request' },
  Caducada95: { refuses: INVITE_EXPIRED },
  BotValida94: { refuses: INVITE_WEB_GUARD },
  DePago93: { refuses: INVITE_PAID },
  'no.vale': { refuses: INVITE_BAD_HASH },
};
// Copia de las dos preguntas que separa `DesktopInviteLinks`: primero si el enlace *es* de invitación y
// después si su código es utilizable. Sin eso, un `tg://join` caería al navegador como un enlace web.
const INVITE_HOSTS = ['t.me', 'telegram.me', 'telegram.dog'];
const inviteShaped = (url: URL) => url.protocol === 'tg:'
  ? url.hostname.toLowerCase() === 'join'
  : url.protocol === 'https:' && INVITE_HOSTS.includes(url.hostname.toLowerCase())
    && (url.pathname.startsWith('/+') || url.pathname.startsWith('/joinchat/'));
const inviteHash = (url: URL) => {
  if (url.username || url.password || url.port) return '';
  if (url.protocol === 'tg:') return url.searchParams.get('invite') ?? '';
  if (url.protocol !== 'https:' || !INVITE_HOSTS.includes(url.hostname.toLowerCase())) return '';
  return url.pathname.startsWith('/+') ? url.pathname.slice(2) : url.pathname.slice('/joinchat/'.length);
};
const usable = (candidate: string) => /^[A-Za-z0-9_-]{1,128}$/.test(candidate) ? candidate : '';
function inviteOf(raw: string): { shaped: boolean; hash: string } {
  let url: URL;
  try { url = new URL((raw || '').trim()); } catch { return { shaped: false, hash: '' }; }
  if (!inviteShaped(url)) return { shaped: false, hash: '' };
  return { shaped: true, hash: usable(inviteHash(url)) };
}
// Un código bien formado pero sin modelo en esta vista: se lo dice en vez de fingir que se abrió en el navegador.
const INVITE_UNMODELED = 'La vista de diseño no tiene modelo para ese código de invitación; en Windows lo resuelve messages.checkChatInvite.';
// La frase con la que Android cierra un brazo que se niega a sí mismo: el envoltorio (`NativeBridge.java:167`) no
// distingue causas, así que sin fila, con temporizador o sin tarjeta suenan todas igual. Copiada carácter a carácter
// de `DesktopBridge.InvalidRequest`, que es donde vive en la capa nueva.
const INVALID_REQUEST = 'Solicitud no válida o función no disponible.';
// El embudo que en las dos capas comparten `link.open` y `message.link` —`openLinkOrTelegram` de
// `NativeBridge.java:892` y `LinkFromUrlAsync` del host—: si la forma es de invitación se pregunta antes de escribir,
// y si no se va al navegador. Está fuera de las dos ramas de abajo para que las dos lo digan una sola vez.
function openLinkedUrl(url: string, confirmed: boolean) {
  const link = inviteOf(url);
  // Sin invitación reconocida el enlace se va al navegador, igual que hacía este host antes de la ronda AB.
  if (!link.shaped) return { action: 'link' };
  if (!link.hash) throw new Error(INVITE_BAD_HASH);
  const invite = inviteFixtures[link.hash];
  if (!invite) throw new Error(INVITE_UNMODELED);
  // Las negaciones se dicen antes de escribir: `messages.checkChatInvite` las ve en la lectura.
  if (invite.refuses) throw new Error(invite.refuses);
  if (!confirmed) return { action:'invite_preview', title: invite.title || 'este chat', members: invite.members || 0, approval: invite.approval === true };
  // El host real relee los diálogos después de escribir, y ahí aparece la fila nueva. La bandeja de
  // diseño tiene su lista fija, así que aquí solo se devuelve lo que Telegram contestó.
  return { action:'membership', state: invite.state };
}
// Las direcciones de las tarjetas del muestrario, guardadas aparte de la fila publicada y no dentro de ella: en el
// host tampoco viajan a la pantalla (`NativeSnapshot.java:227` escribe cuatro claves y ninguna es la URL) y el botón
// las pide por el número del mensaje. `ephemeral` es el temporizador de la segunda guarda de `NativeBridge.java:786`;
// viaja aquí y no en la fila por el mismo motivo que en Windows: el DTO no lo publica, y la fila que lo tiene se queda
// además sin tarjeta, porque la proyección de Java lo mira antes de escribir las cuatro claves.
const linkUrls: Record<string, { url: string; ephemeral?: boolean }> = {
  '201': { url: 'https://wrgram.app' },
  '206': { url: 'https://t.me/+Abierto92' },
  '207': { url: 'https://wrgram.app/caduca', ephemeral: true },
};
/**
 * El borrado de Windows, modelado en la vista de diseño. En el host decide la clave de la conversación —`u`
 * para uno a uno y bots, `g` para básico, `c` para canal o supergrupo— y aquí decide la forma de la fila, que
 * es el mismo dato: `type` y la marca `supergroup`. Lo que tiene que cuadrar son las dos reglas de MTProto,
 * no el prefijo: `messages.deleteMessages` admite «solo para mí» y no llega a las comunidades, y
 * `channels.deleteMessages` llega a las comunidades pero borra siempre para todos.
 *
 * `DELETE_RIGHTS` son los canales donde Telegram dijo que esta cuenta puede borrar mensajes ajenos. Con la
 * fila recortada (`min`) el host responde «no lo sé» y aquí pasa lo mismo: solo el autor ve la opción.
 */
const DELETE_RIGHTS = new Set(['14']);
const DELETE_REFUSALS = {
  self: 'En un canal o supergrupo Telegram solo conoce la petición que borra para todos; aquí no hay un «solo para mí» que enviar.',
  yours: 'Solo puedes eliminar para todos los mensajes que enviaste tú desde esta cuenta.',
  loaded: 'Algún mensaje de la selección ya no está cargado. Actualiza la conversación e inténtalo de nuevo.',
  batch: 'Selecciona entre 1 y 100 mensajes.',
  range: 'El identificador del mensaje no cabe en la petición de Telegram.',
  stale: 'La conversación cambió de forma en esta sesión. Actualiza la lista e inténtalo de nuevo.',
};
function deleteKind(chat?: Chat): 'private' | 'basic' | 'channel' | 'unknown' {
  if (!chat) return 'unknown';
  if (chat.type === 'private' || chat.type === 'bot') return 'private';
  if (chat.type === 'channel' || chat.supergroup) return 'channel';
  if (chat.type === 'group') return 'basic';
  return 'unknown';
}
/** Las banderas que `message.properties` del host de Windows publica para esta fila. */
function desktopProperties(id: string, state: State) {
  const message = state.messages.find(item => item.id === id);
  const chat = state.chats.find(item => item.id === message?.chatId);
  const kind = deleteKind(chat);
  const can = forwardable(message);
  const caption = desktopCaptionable(message, chat);
  return {
    reply: true, copy: can && !!message?.text, copyContent: can, edit: desktopEditable(message, chat),
    deleteSelf: kind === 'private' || kind === 'basic',
    deleteAll: (message?.outgoing ?? false) || (kind === 'channel' && DELETE_RIGHTS.has(chat?.id ?? '')),
    forward: can, pin: desktopPinnable(message, chat), editCaption: caption, caption: caption ? message?.text ?? '' : '',
    // Desde la ronda BX la banda también sale en Windows: el host la arma en `ReactionBandAsync` con la lista que
    // Telegram autoriza en el chat menos las fichas ya puestas. La de pago sigue apagada porque
    // `messages.sendPaidReaction` existe pero gasta Stars sin cartera conectada, y la ✨ lee desde la ronda CD la misma
    // bandera que lee el host —la marca Premium de la sesión—, que en el andamio es la marca de la cartera mockeada.
    reactions: desktopReactionBand(message), paid: false, allowCustom: state.wallet?.premium === true,
  };
}
/**
 * Las dieciséis fichas que el andamio ofrece para reaccionar en Android. `rowSize=8` es lo que `NativeBridge.java`
 * pide a `GetMessageAvailableReactions`, y esa es la banda; «Ver todas» muestra el resto del muestrario, que desde
 * la ronda BV viaja con su `kind` y su marca de Premium igual que lo devuelve TDLib. Aquí no se transcribe la lista
 * de Telegram —esa la decide la cuenta real—; en Windows la banda no se pinta y más arriba está la razón.
 */
const DESIGN_REACTIONS: ReactionOption[] = ['👍', '❤️', '🔥', '👏', '🎉', '✅', '👀', '🙏', '🤔', '🤯', '😍', '😂', '😢', '🙌'].map<ReactionOption>(emoji => ({ kind: 'emoji', emoji })).concat([{ kind: 'emoji', emoji: '🫶', needsPremium: true }, { kind: 'custom', customEmojiId: '544028896108879570', needsPremium: true }]);
/**
 * Lo que responde el puente de Android, que en un teléfono real sale de `GetMessageProperties` y de
 * `GetMessageAvailableReactions` y no de estas líneas. Hasta la ronda AG el espejo no contestaba fuera de
 * Windows, así que `messageMenu` se salía en su propia guarda (`if(!props…)return;`) y la banda de reacciones
 * —la mitad del flujo que Windows no tiene— no se había visto nunca en la vista de diseño.
 */
function designProperties(id: string, state: State) {
  const message = state.messages.find(item => item.id === id);
  const chat = state.chats.find(item => item.id === message?.chatId);
  const can = forwardable(message);
  // `canBeEdited` en Android solo es cierto sobre lo propio, y encima pide que el contenido sea de texto: por
  // eso la otra cara, `editCaption`, es la lista de adjuntos que llevan pie (`hasCaption`). El espejo no tiene
  // TDLib detrás, así que las dos las decide la forma de la fila. La tercera —`editMedia`— es en Android
  // `canEditMedia`, que lo decide Telegram en tiempo de ejecución; aquí solo puede ser la forma de la fila, y el
  // puente sigue negando con su frase si la cuenta real no concede el cambio.
  const own = message?.outgoing ?? false;
  const caption = own && captionable(message);
  return {
    reply: true, copy: can && !!message?.text, copyContent: can, edit: own && !message?.media && !message?.extra,
    deleteSelf: true, deleteAll: message?.outgoing ?? false,
    forward: can, pin: desktopPinnable(message, chat), editCaption: caption, caption: caption ? message?.text ?? '' : '',
    editMedia: own && !!message?.media,
    reactions: DESIGN_REACTIONS, paid: false, allowCustom: false,
  };
}
/**
 * Espejo de las dos banderas `noforwards` del host: la de la fila y la del chat. Un mensaje de servicio
 * devuelve `false` porque no existe petición que lo reenvíe, igual que en `MessageDto.CanForward`, que solo
 * se rellena en la rama de `TL.Message`.
 */
function forwardable(message?: Message): boolean {
  if (!message || message.service) return false;
  return !PROTECTED_CHATS.has(message.chatId);
}
/**
 * El reenvío de Windows: una sola petición para todas las formas de chat, con las cinco negaciones del host
 * en el mismo orden —lote, id, fila cargada, protección del origen, destino y hora—. El destino se copia con
 * una fila nueva en la conversación de llegada; `sendCopy` se comporta como `drop_author`: la copia no lleva
 * procedencia, que es lo que la pantalla prometió al marcarlo.
 */
function desktopForward(raw: unknown[], params: Record<string, unknown>, state: State) {
  const ids = raw.map(String);
  if (ids.length === 0 || ids.length > 100) throw new Error(DELETE_REFUSALS.batch);
  if (ids.some(id => !/^[1-9]\d*$/.test(id))) throw new Error(DELETE_REFUSALS.range);
  const source = state.chats.find(chat => chat.id === state.active);
  if (!source) throw new Error('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
  const wanted = new Set(ids);
  const rows = state.messages.filter(message => message.chatId === state.active && wanted.has(message.id));
  if (rows.length !== wanted.size) throw new Error(DELETE_REFUSALS.loaded);
  if (rows.some(message => !forwardable(message))) throw new Error(FORWARD_REFUSALS.content);
  const target = state.chats.find(chat => chat.id === String(params.to));
  if (!target || !target.supported) throw new Error(FORWARD_REFUSALS.target);
  const when = params.schedule === 'online' ? 'online' : String(params.schedule ?? '');
  if (when === 'online') throw new Error(FORWARD_REFUSALS.online);
  const epoch = /^\d+$/.test(when) ? Number(when) : 0;
  const now = Math.floor(Date.now() / 1000);
  if (epoch && (epoch < now + 5 || epoch > now + 367 * 86400)) throw new Error(FORWARD_REFUSALS.range);
  const copy = params.sendCopy === true;
  let next = Math.max(0, ...poolOf(target.id).map(message => Number(message.id) || 0)) + 1;
  const clones = rows.map((message, index) => ({
    ...message,
    id: String(next++),
    chatId: target.id,
    sender: 'Tú',
    outgoing: true,
    status: 'sent' as const,
    date: now + index,
    edited: false,
    albumId: undefined,
    thread: undefined,
    reply: undefined,
    replyTo: undefined,
    unsent: undefined,
    checklist: undefined,
    paidMedia: undefined,
    reactions: [],
    forward: copy || message.outgoing ? undefined : { kind: 'user' as const, name: message.sender, date: message.date },
  }));
  // Las copias van al historial del destino y no a la ventana que se está mirando. En Telegram el reenvío
  // escribe en otra conversación: meter aquí las filas nuevas pintaría un mensaje en el chat del que se
  // copió, que es justo lo que nadie vio nunca en la app real.
  forwardedCopies.push(...clones);
  return true;
}
/**
 * Copias que el reenvío de escritorio dejó en otros chats. Viven aparte de `fixture.messages` porque el
 * espejo del puente tiene que crecer en el destino y no en la ventana abierta, y `poolOf` las añade para
 * que abrirlas después las muestre.
 */
const forwardedCopies: Message[] = [];
/**
 * El fijado de Windows, modelado con las mismas cuatro negaciones del host en el mismo orden —id, conversación
 * cargada, fila en la ventana y derechos—. La regla no la dicta el contenido de la fila sino la forma del
 * chat: en un uno a uno y en un básico la petición existe para cualquiera, y en un canal solo para quien tiene
 * derechos, que aquí es el mismo canal administrador que `DELETE_RIGHTS` (`14`).
 *
 * `PIN_RIGHTS` copia la lectura de `ChatAdminRights.Flags` del `.cs`, con su hueco dicho: en un supergrupo que
 * abra el fijado a todos los miembros, Android lo ofrece y esta vista —igual que el host— no lo sabe, porque el
 * esquema de escritorio no publica los derechos por defecto.
 */
const PIN_RIGHTS = new Set(['14']);
/** Lo que decide `messages.updatePinnedMessage` en cada forma de chat, con las banderas que manda el host. */
function pinKind(chat: Chat | undefined): 'private' | 'basic' | 'channel' | 'unknown' {
  return deleteKind(chat);
}
function desktopPinnable(message: Message | undefined, chat: Chat | undefined): boolean {
  if (!message || message.service) return false;
  const kind = pinKind(chat);
  if (kind === 'private' || kind === 'basic') return true;
  return kind === 'channel' && PIN_RIGHTS.has(chat?.id ?? '');
}
/** El ancla que la vista de diseño tiene por conversación. */
const pinnedByChat = new Map<string, string>();
function pinnedIdOf(chatId: string): string {
  if (pinnedByChat.has(chatId)) return pinnedByChat.get(chatId) ?? '';
  // Vacío = «no hay», como el `0` del host: se deja el ancla de siempre en el chat del que son las filas.
  return chatId === BOOT_CHAT ? '102' : '';
}
function desktopPin(params: Record<string, unknown>, state: State) {
  const id = String(params.id);
  if (!/^[1-9]\d*$/.test(id)) throw new Error(DELETE_REFUSALS.range);
  const chat = state.chats.find(item => item.id === state.active);
  if (!chat) throw new Error('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
  const kind = pinKind(chat);
  if (kind === 'unknown') throw new Error(DELETE_REFUSALS.stale);
  const row = state.messages.find(message => message.chatId === state.active && message.id === id);
  if (!row) throw new Error(DELETE_REFUSALS.loaded);
  if (!desktopPinnable(row, chat)) throw new Error(PIN_REFUSALS.rights);
  // `value:false` es el X de la barra: quita el ancla; sin la bandera, el id pedido pasa a ser el ancla, que
  // es lo que el host escribe en su caché después de que Telegram confirme.
  pinnedByChat.set(state.active, params.value === false ? '' : id);
  return true;
}
/**
 * Las seis frases de la escritura de reacción en Windows (ronda BX), copiadas carácter a carácter de
 * `DesktopMessageReact.cs`. Ya no hay una negativa general: `messages.sendReaction` existe en la librería, así que
 * el espejo reproduce el orden de comprobación del host —id, conversación, forma, fila, Premium, lista ofrecida— y
 * el efecto de la escritura, que es el conjunto completo con el que Telegram se queda.
 */
const REACT_REFUSALS = {
  noEmoji: 'Elige un emoji para reaccionar.',
  notOffered: 'Telegram no ofrece esa reacción en este chat.',
  needsPremium: 'Esa reacción necesita Telegram Premium.',
  noCustom: 'Emoji personalizado no válido.',
  notPremium: 'Necesitas Telegram Premium para reaccionar con emojis personalizados.',
  paid: 'La reacción de pago gasta Stars de tu saldo y el escritorio todavía no tiene la cartera de Stars conectada, así que aquí no se ofrece.',
};
/**
 * La cuenta del andamio no es Premium en ninguna de las dos capas: en Windows la clave que informa el estado de la
 * suscripción sigue pendiente de cable, y en la vista de diseño de Android cae en la negativa sintética de siempre.
 * Por eso la rama de Premium se recorre de verdad sin amañar el estado: la constante es `false`.
 */
const DESIGN_PREMIUM_ACCOUNT = false;
function reactionKey(option: { kind?: string; emoji?: string; customEmojiId?: string }): string {
  return option.kind === 'custom' ? `c:${option.customEmojiId}` : `e:${option.emoji}`;
}
/**
 * La bandeja que el host arma en `ReactionBandAsync`: las ofrecidas menos las que esta cuenta ya tiene puestas. La
 * lista personalizada del chat no se puede simular —detrás no hay ningún `channels.getFullChannel`—, así que el
 * andamio usa la general, que es justo en lo que cae el host cuando Telegram no la personaliza.
 */
function desktopReactionBand(message?: Message): ReactionOption[] {
  const taken = new Set((message?.reactions ?? []).filter(reaction => reaction.chosen).map(reactionKey));
  return DESIGN_REACTIONS.filter(option => !taken.has(reactionKey(option)));
}
/**
 * El vector completo que `<c>messages.sendReaction</c>` mandaría, con las dos reglas de
 * `DesktopMessageReact.Request`: lo que no va en el conjunto se quita, y poner una segunda emoji no borra la
 * primera. Las cuentas suben y bajan solo con la ficha propia, que es lo único que el andamio puede saber.
 */
function applyReaction(rows: Message['reactions'], target: ReactionOption, remove: boolean): Message['reactions'] {
  const key = reactionKey(target);
  const chosen = new Set(rows.filter(row => row.chosen).map(reactionKey));
  if (remove) chosen.delete(key); else chosen.add(key);
  const updated = rows.map(row => {
    const next = chosen.has(reactionKey(row));
    return { ...row, chosen: next, count: Math.max(0, row.count + (next === row.chosen ? 0 : next ? 1 : -1)) };
  });
  if (!remove && !updated.some(row => reactionKey(row) === key)) updated.push({
    emoji: target.kind === 'custom' ? '' : target.emoji ?? '', count: 1, chosen: true,
    ...(target.kind === 'custom' ? { kind: 'custom' as const, customEmojiId: target.customEmojiId } : {}),
  });
  return updated;
}
/** `message.react` y `message.react.custom` en Windows, con las guardas del host en su orden y sus mismas frases. */
function desktopReact(params: Record<string, unknown>, state: State, custom: boolean) {
  const id = String(params.id ?? '');
  if (!/^[1-9]\d*$/.test(id)) throw new Error(DELETE_REFUSALS.range);
  const chat = state.chats.find(item => item.id === state.active);
  if (!chat) throw new Error('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
  if (deleteKind(chat) === 'unknown') throw new Error(DELETE_REFUSALS.stale);
  const index = state.messages.findIndex(message => message.chatId === state.active && message.id === id);
  if (index < 0) throw new Error(DELETE_REFUSALS.loaded);
  const remove = Boolean(params.remove);
  const raw = String(params.emoji ?? '').trim();
  let target: ReactionOption;
  if (custom) {
    if (!/^[1-9]\d*$/.test(raw)) throw new Error(REACT_REFUSALS.noCustom);
    if (!DESIGN_PREMIUM_ACCOUNT) throw new Error(REACT_REFUSALS.notPremium);
    target = { kind: 'custom', customEmojiId: raw, needsPremium: true };
  } else {
    if (raw.length === 0) throw new Error(REACT_REFUSALS.noEmoji);
    // Al quitar, la lista no se pregunta: es lo que Android hace en `NativeBridge.java:4381` y lo que el host
    // reproduce, porque la ficha que ya está puesta se quitó aunque el chat hubiera dejado de ofrecerla.
    const match = DESIGN_REACTIONS.find(option => option.kind === 'emoji' && option.emoji === raw);
    if (!remove) {
      if (!match) throw new Error(REACT_REFUSALS.notOffered);
      if (match.needsPremium && !DESIGN_PREMIUM_ACCOUNT) throw new Error(REACT_REFUSALS.needsPremium);
    }
    target = match ?? { kind: 'emoji', emoji: raw };
  }
  const messages = [...state.messages];
  messages[index] = { ...messages[index], reactions: applyReaction(messages[index].reactions, target, remove) };
  acceptState({ ...state, messages });
  return true;
}
/**
 * La edición de Windows, con las seis negaciones del host en su orden —id, conversación, forma, fila, derecho,
 * longitud y vacío—. Las tres frases que nacen de volver a leer la fila en Telegram (`Gone`, `NotRead`,
 * `Changed`) no se lanzan aquí a propósito: el andamio no tiene servidor detrás, y fingirlas con un azar
 * pintaría un fallo que nadie puede reproducir. Lo que sí se copia es el efecto de la confirmación.
 */
function desktopEdit(params: Record<string, unknown>, state: State, caption: boolean) {
  const id = String(params.id);
  if (!/^[1-9]\d*$/.test(id)) throw new Error(DELETE_REFUSALS.range);
  const chat = state.chats.find(item => item.id === state.active);
  if (!chat) throw new Error('La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.');
  if (deleteKind(chat) === 'unknown') throw new Error(DELETE_REFUSALS.stale);
  const row = state.messages.find(message => message.chatId === state.active && message.id === id);
  if (!row) throw new Error(DELETE_REFUSALS.loaded);
  if (!(caption ? desktopCaptionable(row, chat) : desktopEditable(row, chat))) throw new Error(EDIT_REFUSALS.rights);
  const maximum = caption ? EDIT_MAX.caption : EDIT_MAX.text;
  const value = String((caption ? params.caption : params.text) ?? '');
  if (value.length > maximum) throw new Error(EDIT_REFUSALS.tooLong(maximum));
  if (value.length === 0 && !caption) throw new Error(EDIT_REFUSALS.blank);
  row.text = value;
  row.entities = Array.isArray(params.entities) ? params.entities as TextEntity[] : undefined;
  row.edited = true;
  return true;
}
/** Los dos topes que el puente impone antes de mandar, los mismos de `BridgePolicy.text` en Android. */
const EDIT_MAX = { text: 4096, caption: 1024 };
/** Las frases de `DesktopMessageEdit.cs`, copiadas carácter a carácter. */
const EDIT_REFUSALS = {
  rights: 'Telegram no permite esta acción sobre el mensaje.',
  blank: 'Un mensaje de texto no puede quedarse vacío; escríbele algo o bórralo.',
  gone: 'El mensaje ya no está en Telegram, así que no se editó nada.',
  notRead: 'No se pudo leer el mensaje en Telegram antes de editarlo, así que no se cambió nada.',
  changed: 'El mensaje cambió en Telegram desde que lo ves, así que no se editó. Vuelve a intentarlo.',
  tooLong: (maximum: number) => `El texto supera los ${maximum} caracteres que acepta Telegram.`,
};
/** El derecho de las dos caras: autoría, o los permisos del canal —el mismo `14` que borra y fija—. */
function editRights(message: Message | undefined, chat: Chat | undefined): boolean {
  if (!message || message.service) return false;
  return message.outgoing || (deleteKind(chat) === 'channel' && DELETE_RIGHTS.has(chat?.id ?? ''));
}
/** `DesktopMessageEdit.CanEditText`: mensaje de texto, sin adjunto y con derechos sobre la fila. */
function desktopEditable(message: Message | undefined, chat: Chat | undefined): boolean {
  if (message?.media) return false;
  return editRights(message, chat);
}
/** `DesktopMessageEdit.CanEditCaption`: los mismos derechos y un adjunto que de verdad lleve pie. */
function desktopCaptionable(message: Message | undefined, chat: Chat | undefined): boolean {
  if (!captionable(message)) return false;
  return editRights(message, chat);
}
/**
 * `DesktopMessageEdit.HasCaption` mira la clase real del adjunto; aquí solo existe el `kind` que salió del mime,
 * y un sticker también llega como imagen. Se deja fuera el sticker —que es el caso que la pantalla puede
 * mostrar— y se dice el hueco: una nota de voz y un archivo de audio con pie comparten `kind` en esta vista,
 * así que el espejo ofrece la opción donde el host la negaría.
 */
function captionable(message: Message | undefined): boolean {
  const kind = message?.media?.kind;
  return kind === 'image' || kind === 'video' || kind === 'file' || kind === 'audio';
}
/**
 * Las dos banderas `noforwards` que el host de Windows lee de la fila y del chat. Aquí solo se simula la del
 * chat, y el elegido es el canal de novedades: Telegram permite al administrador quitar el reenvío y el
 * guardado de un canal entero, que es el caso real más frecuente.
 */
const PROTECTED_CHATS = new Set(['22']);
/** Cuatro negaciones que solo existen en el camino de Windows, copiadas del `.cs`. */
const FORWARD_REFUSALS = {
  target: 'El destino ya no está cargado en esta sesión. Ábrelo e inténtalo de nuevo.',
  content: 'Telegram protege este contenido.',
  online: 'Telegram no tiene una petición que espere a «estar en línea»: solo acepta una hora concreta.',
  range: 'Elige una hora entre ahora y los próximos 367 días.',
};
/** Las dos frases del fijado, copiadas carácter a carácter de `DesktopMessagePin.cs`. */
const PIN_REFUSALS = {
  rights: 'Telegram no permite esta acción sobre el mensaje.',
  list: 'El protocolo de escritorio no tiene petición para listar los mensajes fijados; aquí se puede consultar y quitar el fijado de esta conversación.',
};
/**
 * Las dos frases del menú de conversación sobre su lista y su marca: la primera es la de `RequireEntry` en
 * `TelegramService.cs` y la segunda, la de `DesktopChatFolders.NotResolved`. La de la pareja sin resolver no la
 * lanza este andamio a propósito —ninguna fila de diseño llega a ese estado, que en el puente es un `min` al que
 * Telegram no dio `access_hash`—, pero está copiada igual: si algún día se pierde, la guarda la echa en falta.
 */
const FOLDER_REFUSALS = {
  loaded: 'La conversación no está cargada. Actualiza la lista e inténtalo de nuevo.',
  resolved: 'La conversación todavía no está resuelta en Telegram, así que no se cambió ni su lista ni su marca.',
};
/**
 * Archivar (`chat.archive`) y marcar como no leído (`chat.unread`) en Windows. Son dos escrituras de una marca
 * sobre la fila, sin nada que negociar con el servidor antes, así que la única negación alcanzable es que la
 * fila no esté. El efecto copiado es el del puente: `archived` saca la fila de cualquier pestaña que no sea la
 * de archivo (`inboxModel.ts`) y `marked` le pinta el punto sin tocar el contador.
 */
function desktopList(params: Record<string, unknown>, state: State, field: 'archived' | 'marked') {
  const id = String(params.id);
  if (!state.chats.some(chat => chat.id === id)) throw new Error(FOLDER_REFUSALS.loaded);
  const value = params.value === true;
  acceptState({ ...state, chats: state.chats.map(chat => chat.id === id ? { ...chat, [field]: value } : chat) });
  return true;
}
/**
 * Las cuatro negaciones de la bandeja de programados en Windows, copiadas carácter a carácter de
 * `DesktopScheduled.cs`. Las dos primeras las sacan las guardas que se hacen antes de leer nada: otra
 * conversación abierta y una fila que ya no está en la bandeja. La de los recurrentes y la del contenido que
 * no se puede reconstruir las decide el puente después de volver a leer la fila, que es el orden que se
 * reproduce abajo. `prepare` no la lanza este esqueleto —aquí la lectura no falla nunca—, pero está escrita por
 * lo mismo que `FOLDER_REFUSALS.resolved`: si algún día se pierde, la guarda la echa en falta.
 */
const SCHEDULED_REFUSALS = {
  changed: 'La conversación cambió.',
  gone: 'Ese mensaje ya no está programado. Actualiza la lista de envíos.',
  recurring: 'Gestiona la fecha o el envío inmediato de los mensajes recurrentes en Telegram.',
  unsupported: 'Este cliente no sabe volver a mandar ese contenido, así que no le cambia la hora. Hazlo desde otro dispositivo.',
  prepare: 'No se pudieron preparar los mensajes programados.',
};
/** Las cuatro órdenes empiezan igual que en el host: la conversación tiene que estar cargada y ser la abierta. */
function desktopScheduledTarget(params: Record<string, unknown>, state: State) {
  const id = String(params.id);
  if (!state.chats.some(chat => chat.id === id)) throw new Error(FOLDER_REFUSALS.loaded);
  if (id !== state.active) throw new Error(SCHEDULED_REFUSALS.changed);
  return id;
}
/** El id de la fila programada, con la misma lectura entera que ya usaban el borrado y la edición. */
function desktopScheduledId(params: Record<string, unknown>) {
  const id = String(params.messageId);
  if (!/^[1-9]\d*$/.test(id)) throw new Error(DELETE_REFUSALS.range);
  return id;
}
/**
 * `scheduled.list`. El host convierte cada fila con `scheduled: true` precisamente porque los ids programados
 * son de otro namespace al del historial; aquí las filas ya viven aparte, en `scheduledTray`.
 */
function desktopScheduledList(params: Record<string, unknown>, state: State) {
  desktopScheduledTarget(params, state);
  return scheduledTray.map(message => ({ ...message, reactions: [...message.reactions] }));
}
/**
 * Las tres escrituras de la bandeja, con las negaciones del host en su orden. `now` y `drop` leen la fila antes
 * de decidir; `at` primero corta la hora —la de «cuando se conecte» y la ventana de 367 días, las dos antes de
 * pedir nada, igual que `ScheduledRescheduleAsync`— y después lee. Al enviar ya la fila no se borra: pasa al
 * historial con un id nuevo del chat, que es lo que hace Telegram y lo que `poolOf` refleja.
 */
function desktopScheduledWrite(params: Record<string, unknown>, state: State, kind: 'now' | 'at' | 'drop') {
  desktopScheduledTarget(params, state);
  const id = desktopScheduledId(params);
  let epoch = 0;
  if (kind === 'at') {
    if (params.online === true) throw new Error(FORWARD_REFUSALS.online);
    epoch = Number(params.at) || 0;
    const now = Math.floor(Date.now() / 1000);
    if (epoch === 0 || epoch < now + 5 || epoch > now + 367 * 86400) throw new Error(FORWARD_REFUSALS.range);
  }
  const index = scheduledTray.findIndex(message => message.id === id);
  if (index < 0) throw new Error(SCHEDULED_REFUSALS.gone);
  if (kind !== 'drop' && scheduledTray[index].scheduledRepeat) throw new Error(SCHEDULED_REFUSALS.recurring);
  if (kind === 'at' && scheduledTray[index].checklist) throw new Error(SCHEDULED_REFUSALS.unsupported);
  const row = scheduledTray[index];
  if (kind === 'at') {
    scheduledTray.splice(index, 1, { ...row, scheduledAt: epoch, scheduledOnline: undefined });
    return true;
  }
  scheduledTray.splice(index, 1);
  if (kind === 'drop') return true;
  const now = Math.floor(Date.now() / 1000);
  const sent: Message = { ...row, id: String(Math.max(0, ...poolOf(row.chatId).map(message => Number(message.id) || 0)) + 1),
    date: now, scheduledAt: undefined, scheduledOnline: undefined, scheduledRepeat: undefined, repeatPeriod: undefined,
    checklist: undefined, status: 'sent', edited: false, reactions: [] };
  scheduledSent.push(sent);
  acceptState({ ...state, messages: [...state.messages, sent] });
  return true;
}
/**
 * Las cinco negaciones del adjunto en Windows, copiadas carácter a carácter de `DesktopAttachment.cs`. Cuatro son
 * las que Android ya dice en `NativeBridge` —el selector que falta, el tope de la cuenta, la conversación cambiada y
 * el envío sin confirmar—; `notPrepared` es la única que añade este puente, porque allí un vale que no está en el
 * mapa lanza una excepción sin mensaje. `picker` no la lanza el esqueleto —aquí el selector nunca falla, porque no
 * hay selector—, igual que `SCHEDULED_REFUSALS.prepare`.
 */
const ATTACH_REFUSALS = {
  picker: 'No hay un selector de archivos disponible.',
  tooBig: 'No se pudo importar el archivo. Límite: 2 GB.', tooBigPremium: 'No se pudo importar el archivo. Límite: 4 GB.',
  changed: 'La cuenta o conversación cambió.',
  uncertain: 'Revisa el envío anterior en el historial antes de enviar otro archivo.',
  notPrepared: 'Ese archivo ya no está preparado para enviar. Vuelve a elegirlo.',
};
/**
 * Las negaciones del álbum, copiadas carácter a carácter de `DesktopAlbum.cs`. Once son literales de Android —de
 * `pickedAlbum` (`NativeBridge.java:5121-5139`), de `sendAlbum` (`:5075-5078`) y de `album` (`:4066-4071`)— y
 * `notPhoto` la añade este puente, porque el selector de Windows admite «Todos los archivos» y el de Android no
 * puede devolver otra cosa que `image/*`. No hay `changed` aquí aunque en Android sí exista una frase de cuenta
 * cambiada en la elección: el puente de Windows sella cada vale con la conversación en la que se abrió el selector,
 * así que lo que nota un salto de pestaña es el envío, y lo niega con `changedPieces`, la misma frase del lote que
 * usa el host. Tampoco está la cuarta frase de `album`, «No se pudo consultar el álbum.», que en Android cubre el
 * fallo al montar el JSON a mano: este puente devuelve un array de objetos y la serialización no es suya.
 */
const ALBUM_REFUSALS = {
  picker: 'No hay un selector de fotos disponible.',
  tooFew: 'Elige al menos 2 fotos para crear un álbum.',
  tooMany: 'Puedes elegir hasta 10 fotos por álbum.',
  importFailed: 'No se pudieron importar las fotos. Límite: 10 imágenes de 2 GB.', importFailedPremium: 'No se pudieron importar las fotos. Límite: 10 imágenes de 4 GB.',
  prepare: 'No se pudo preparar el álbum.',
  batch: 'Elige entre 2 y 10 fotos.',
  uncertain: 'Revisa el envío anterior en el historial antes de enviar un álbum.',
  changedPieces: 'El álbum cambió de conversación.',
  notPhoto: 'Un álbum de Telegram admite fotos: JPG, PNG o WEBP.',
  gone: 'El mensaje ya no está disponible.',
  noAlbum: 'Este mensaje no pertenece a un álbum.',
  noItems: 'No se encontraron los elementos del álbum.',
};
/** Las dos orillas de `DesktopAlbum.Min` y `DesktopAlbum.Max`. */
const ALBUM_MIN = 2;
const ALBUM_MAX = 10;
/** Las dos orillas de `UploadPolicy.maxBytes`, que `NativeBridge.picked` pregunta con la cuenta que eligió. */
const attachMaxBytes = (premium: boolean) => premium ? 4 * 1024 * 1024 * 1024 : 2 * 1024 * 1024 * 1024;
/** La tabla extensión → MIME de `DesktopAttachment.MimeOf`, pareja por pareja. */
const ATTACH_TYPES: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
  bmp: 'image/bmp', tif: 'image/tiff', tiff: 'image/tiff', heic: 'image/heic', heif: 'image/heif',
  svg: 'image/svg+xml', mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime',
  mkv: 'video/x-matroska', webm: 'video/webm', avi: 'video/x-msvideo', '3gp': 'video/3gpp',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', flac: 'audio/flac',
  ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/opus', pdf: 'application/pdf',
  epub: 'application/epub+zip', zip: 'application/zip', rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed', tar: 'application/x-tar', gz: 'application/gzip',
  apk: 'application/vnd.android.package-archive', txt: 'text/plain', md: 'text/markdown',
  csv: 'text/csv', json: 'application/json', doc: 'application/msword', dot: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const ATTACH_FALLBACK = 'application/octet-stream';
/** La norma de nombre de `NativeBridge.picked`: caracteres válidos, últimos 90 si pasa, y el respaldo que toque si queda vacío o empieza por punto. */
function attachmentNameOf(raw: string, fallback = 'archivo'): string {
  let name = raw.replace(/[^\p{L}\p{N}._ -]/gu, '_');
  if (name.length > 90) name = name.slice(name.length - 90);
  if (name.trim() === '' || name.startsWith('.')) name = fallback;
  return name;
}
function attachmentMimeOf(name: string): string {
  const dot = name.lastIndexOf('.');
  if (dot < 0 || dot === name.length - 1) return ATTACH_FALLBACK;
  return ATTACH_TYPES[name.slice(dot + 1).toLowerCase()] ?? ATTACH_FALLBACK;
}
/** La terna de `NativeBridge.sendAttachment` que decide foto o archivo. */
function attachmentIsPhoto(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}
/** El icono con el que la pantalla pinta la pieza, que es la regla con la que `MediaRegistry.KindOf` la registra cuando Telegram la devuelve. */
function attachmentKindOf(mime: string): 'image' | 'video' | 'audio' | 'file' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'file';
}
/** El archivo elegido y todavía no enviado, con la cuenta y la conversación del momento de elegir. */
type DesktopOutbox = { token: string; name: string; mime: string; size: number; account: string; chat: string };
const desktopOutbox: DesktopOutbox[] = [];
let desktopAttachSeq = 0;
/**
 * `attachment.pick`. El andamio no puede abrir el selector de Windows, así que lo que se reproduce aquí son las
 * tres normas que el puente aplica sobre lo que la persona elija: el saneado del nombre, el tope de la cuenta y el
 * MIME por extensión. El archivo se le dice al espejo por parámetros —nombre y tamaño— y, cuando la pantalla lo
 * pide sin decir nada, se usa un sustituto fijo. Lo que no se puede simular es cancelar: el puente devuelve
 * `null` y la pantalla no abre la confirmación.
 */
function desktopAttachmentPick(params: Record<string, unknown>, state: State) {
  // `kind` llegó con la ronda BU: en Windows el diálogo se filtra por GIF y en Android el selector recibe
  // `image/gif`, así que un nombre que no lo es no lo habría devuelto el selector. Se descarta y se usa el
  // sustituto de la fila, que es lo que la persona vería en el diálogo real.
  const gif = String(params.kind ?? '') === 'gif';
  const named = typeof params.name === 'string' && (!gif || params.name.toLowerCase().endsWith('.gif'));
  const raw = named ? String(params.name) : (gif ? 'Animacion de la barra.gif' : 'Informe mensual de la barra.pdf');
  const size = Number(params.size ?? 512 * 1024); const premium = state.wallet?.premium === true;
  // El nombre se sana antes de mirar el tamaño, que es el orden del puente: la copia se hace con el nombre ya
  // decidido y el tope se comprueba mientras se escribe, no después.
  const name = attachmentNameOf(raw);
  if (size > attachMaxBytes(premium)) throw new Error(premium ? ATTACH_REFUSALS.tooBigPremium : ATTACH_REFUSALS.tooBig);
  const token = `a${++desktopAttachSeq}`;
  desktopOutbox.push({ token, name, mime: attachmentMimeOf(name), size, account: state.selfId, chat: state.active });
  return { token, name, size };
}
/** `attachment.discard`: Android responde `true` aunque el token no estuviera, porque la pantalla lo llama al cerrar un panel cuyo archivo ya se envió. */
function desktopAttachmentDiscard(params: Record<string, unknown>) {
  const index = desktopOutbox.findIndex(item => item.token === String(params.token));
  if (index >= 0) desktopOutbox.splice(index, 1);
  return true;
}
/**
 * `send.attachment`, con las negaciones del puente en su orden: el vale, la cuenta y la conversación, el historial
 * sin confirmar y solo entonces la conversación cargada. Después se envía como foto o como archivo según la terna
 * de MIMEs, y el vale se tira —en Android y aquí el archivo deja de estar disponible en cuanto cuaja el envío.
 */
function desktopAttachmentSend(params: Record<string, unknown>, state: State) {
  const index = desktopOutbox.findIndex(item => item.token === String(params.token));
  if (index < 0) throw new Error(ATTACH_REFUSALS.notPrepared);
  const file = desktopOutbox[index];
  if (file.account !== state.selfId || file.chat !== state.active) {
    desktopOutbox.splice(index, 1);
    throw new Error(ATTACH_REFUSALS.changed);
  }
  if (state.uncertain) throw new Error(ATTACH_REFUSALS.uncertain);
  if (!state.chats.some(chat => chat.id === state.active)) throw new Error(FOLDER_REFUSALS.loaded);
  desktopOutbox.splice(index, 1);
  const photo = attachmentIsPhoto(file.mime);
  const sent: Message = {
    id: String(Math.max(0, ...poolOf(state.active).map(message => Number(message.id) || 0)) + 1),
    chatId: state.active, sender: 'Tú', text: '', date: Math.floor(Date.now() / 1000),
    outgoing: true, status: 'sent', edited: false, reactions: [],
    // El nombre solo sobrevive cuando la pieza viaja como documento: `MediaRegistry.RegisterPhoto` no recibe
    // nombre y le queda el «Foto» con el que está declarado, mientras `RegisterDocument` lo saca del
    // `DocumentAttributeFilename` que el puente manda. Lo que decide cuál de los dos es la terna de MIMEs.
    media: { id: 0, ready: false, kind: attachmentKindOf(file.mime), mime: file.mime, name: photo ? 'Foto' : file.name, size: file.size },
  };
  sentAttachments.push(sent);
  acceptState({ ...state, messages: [...state.messages, sent] });
  return true;
}
/** El número de fotos fuera de las dos orillas, con la frase que toca: en la elección son dos negativas distintas. */
function albumCountError(count: number): string | undefined {
  if (count < ALBUM_MIN) return ALBUM_REFUSALS.tooFew;
  if (count > ALBUM_MAX) return ALBUM_REFUSALS.tooMany;
  return undefined;
}
let desktopAlbumSeq = 0;
/**
 * `attachment.album`, el espejo de `NativeBridge.pickedAlbum`. Como el andamio no tiene selector, las fotos se le
 * dicen por parámetros —`names` y un `size` común para todas— y sin parámetros se reproduce un lote fijo de tres.
 * Volver con las manos vacías es cancelar y responde `undefined`, igual que el `answer.ok(null)` de Android.
 * El orden es el del puente: primero las dos orillas del recuento, después el tipo de cada pieza y al final el
 * tope, todo antes de reservar un solo vale —una foto que pasa del tope de la cuenta no deja seis mitades en el outbox—.
 */
function desktopAttachmentAlbum(params: Record<string, unknown>, state: State) {
  const raw = Array.isArray(params.names) ? (params.names as unknown[]).map(String) : ['verano-01.jpg', 'verano-02.png', 'verano-03.webp'];
  if (raw.length === 0) return undefined;
  const refusal = albumCountError(raw.length);
  if (refusal) throw new Error(refusal);
  const size = Number(params.size ?? 640 * 1024); const premium = state.wallet?.premium === true;
  const names = raw.map(name => attachmentNameOf(name, 'foto'));
  const mimes = names.map(attachmentMimeOf);
  if (mimes.some(mime => !attachmentIsPhoto(mime))) throw new Error(ALBUM_REFUSALS.notPhoto);
  if (size > attachMaxBytes(premium)) throw new Error(premium ? ALBUM_REFUSALS.importFailedPremium : ALBUM_REFUSALS.importFailed);
  return names.map((name, index) => {
    const token = `a${++desktopAttachSeq}`;
    desktopOutbox.push({ token, name, mime: mimes[index], size, account: state.selfId, chat: state.active });
    return { token, name, size };
  });
}
/**
 * `send.album`, con las negaciones de `NativeBridge.sendAlbum` en su orden: el lote, el historial sin confirmar,
 * la conversación cargada y solo entonces pieza por pieza. Un vale que falta o que es de otra parte niega el
 * álbum entero y no borra nada: Android lo niega con su propia frase sin retirar los demás vales, y una negativa
 * que destruye el trabajo de la persona sería peor que la frase. Al final de la lista, y solo aquí, se
 * vuelve a mirar el tipo de cada pieza: el puente de Windows no puede dejar que un vale de documento suelto entre en
 * el lote, porque en MTProto el tipo lo elige el puente y no el motor.
 */
function desktopAlbumSend(params: Record<string, unknown>, state: State) {
  const tokens = Array.isArray(params.tokens) ? (params.tokens as unknown[]).map(String) : [];
  if (tokens.length < ALBUM_MIN || tokens.length > ALBUM_MAX) throw new Error(ALBUM_REFUSALS.batch);
  if (state.uncertain) throw new Error(ALBUM_REFUSALS.uncertain);
  if (!state.chats.some(chat => chat.id === state.active)) throw new Error(FOLDER_REFUSALS.loaded);
  const files = tokens.map(token => {
    const file = desktopOutbox.find(item => item.token === token);
    if (!file || file.account !== state.selfId || file.chat !== state.active) throw new Error(ALBUM_REFUSALS.changedPieces);
    return file;
  });
  if (files.some(file => !attachmentIsPhoto(file.mime))) throw new Error(ALBUM_REFUSALS.notPhoto);
  const albumId = `al${++desktopAlbumSeq}`;
  const date = Math.floor(Date.now() / 1000);
  let next = Math.max(0, ...poolOf(state.active).map(message => Number(message.id) || 0));
  const sent: Message[] = files.map(file => ({
    id: String(++next), chatId: state.active, sender: 'Tú', text: '', date,
    outgoing: true, status: 'sent', edited: false, reactions: [], albumId,
    media: { id: 0, ready: false, kind: 'image', mime: file.mime, name: 'Foto', size: file.size },
  }));
  for (const token of tokens) {
    const index = desktopOutbox.findIndex(item => item.token === token);
    if (index >= 0) desktopOutbox.splice(index, 1);
  }
  sentAttachments.push(...sent);
  acceptState({ ...state, messages: [...state.messages, ...sent] });
  return true;
}
/**
 * `message.album`, la lectura con la que se rellena «Editar textos del álbum». Las tres negativas van en el orden
 * del puente: primero si el mensaje tocado está, después si es de un álbum y al final si quedan al menos dos piezas;
 * la cuarta de Android es un fallo de red y aquí no hay red. El texto viaja plano, igual que `dto.caption(item)`
 * allá: la pantalla reimplementa el formato al leer y manda `entities` al guardar, así que un espejo con entidades
 * sería una segunda fuente de verdad.
 *
 * Lo único que no reproduce es la banda: el host lee diez mensajes por cada lado del ancla porque `grouped_id` no
 * garantiza continuidad, y el andamio no tiene banda que leer —la conversación cabe entera en su índice—, así que
 * recorre la conversación cargada. Es una divergencia del espejo, no del puente.
 */
function desktopMessageAlbum(params: Record<string, unknown>, state: State) {
  const id = String(params.id ?? '');
  const rows = state.messages
    .filter(message => message.chatId === state.active)
    .sort((a, b) => Number(a.id) - Number(b.id));
  const anchor = rows.find(message => message.id === id);
  if (!anchor) throw new Error(ALBUM_REFUSALS.gone);
  const album = anchor.albumId;
  if (!album) throw new Error(ALBUM_REFUSALS.noAlbum);
  const items = rows.filter(message => message.albumId === album).map(message => ({ id: message.id, text: message.text }));
  if (items.length < ALBUM_MIN) throw new Error(ALBUM_REFUSALS.noItems);
  return items;
}

function designReadReceipts(params: Record<string, unknown>, state: State, viewers: boolean) {
  const id = String(params.id ?? '');
  const message = state.messages.find(item => item.chatId === state.active && item.id === id);
  if (!message || !message.outgoing) throw new Error('Solo puedes consultar la lectura de tus propios mensajes.');
  const chat = state.chats.find(item => item.id === state.active);
  if (viewers) {
    if (chat?.type !== 'group') throw new Error('Los lectores solo se consultan en grupos.');
    return { viewers: [
      { id: '5101', name: 'Ada', date: message.date + 60 },
      { id: '5102', name: 'Lin', date: message.date + 180 },
    ] };
  }
  if (chat?.type !== 'private') throw new Error('La hora de lectura solo se consulta en chats privados.');
  return { state: 'read', date: message.date + 120 };
}

/**
 * Las diecinueve negaciones de la encuesta en Windows, copiadas carácter a carácter de `DesktopPoll.cs`. Once son
 * literales de Android —nueve de `sendPoll`, uno que comparten `answerPoll`, `stopPoll` y `pollVoters`, y la razón
 * de cierre de `NativeSnapshot.pollRestriction`—; `tooLong` es la traducción al español del «Invalid text» con el
 * que Android rechaza un texto pasado de largo, igual que hizo la ronda AH con el de la edición. `noVote`, `stale`
 * y `noOption` son las que Android lanza sin mensaje, y por eso llevan frase propia. Dos nombran un hueco de la
 * librería: `noStop`, porque cerrar una encuesta no existe en WTelegramClient, y `noDescription`, porque ni `TL.Poll`
 * ni `TL.InputMediaPoll` traen campo donde escribir la descripción que Android sí manda. Las dos restantes son reglas
 * de Telegram dichas por su nombre: el anonimato y la página en la que cabe la lista. La frase de los chats secretos
 * no está, y no es un olvido: este andamio no tiene por dónde alcanzarla porque el puente de Windows no lista chats
 * secretos.
 */
const POLL_REFUSALS = {
  sending: 'No puedes enviar mensajes en este chat.',
  private: 'Las encuestas solo pueden enviarse a bots o a Mensajes guardados en chats privados.',
  notAllowed: 'Este chat no permite encuestas.',
  noQuestion: 'Escribe una pregunta.',
  tooLong: 'La pregunta admite hasta 255 caracteres.',
  batch: 'Escribe entre 2 y 12 opciones.',
  // Las tres negativas de la ronda CN-B, en el sitio que les toca: cada vale —con su MIME— se comprueba antes que
  // el lote, y el lote antes que el texto de las opciones. Son los mismos literales de `DesktopPoll` y de
  // `NativeBridge.sendPoll`.
  changedPhotos: 'La conversación cambió. Vuelve a elegir las imágenes de las opciones.',
  notPhoto: 'Cada opción admite una foto JPG, PNG o WebP.',
  unevenPhotos: 'Una encuesta con imágenes lleva una imagen en cada opción.',
  option: 'Cada opción debe tener entre 1 y 100 caracteres.',
  repeated: 'Las opciones no pueden repetirse.',
  noCorrect: 'Elige una respuesta correcta.',
  // La negativa que la ronda CF añadió a las nueve de siempre: el cierre se pide en segundos y Telegram publica la
  // franja —de 5 a 2.628.000—. El cero se acepta aparte porque en la pantalla significa «sin cierre».
  closeRange: 'La encuesta debe cerrarse entre 5 segundos y 30 días y 1 hora después de enviarse.',
  noPoll: 'Este mensaje no contiene una encuesta.',
  // La misma negativa de la ronda AM y del álbum: «la fila que tocaste ya no está». En C# son dos constantes con el
  // mismo literal —cada clase se lee sola— y aquí una referencia, para que el espejo no tenga dos frases que
  // defender. Una prueba exige que las dos capas sigan diciendo lo mismo.
  gone: ALBUM_REFUSALS.gone,
  noVote: 'Marca entre una y doce opciones de esta encuesta.',
  stale: 'Alguna de las opciones ya no está en la encuesta.',
  closed: 'La encuesta está cerrada.',
  noStop: 'La biblioteca de escritorio no tiene petición para cerrar una encuesta, así que aquí se puede enviar y votar, pero no cerrarla.',
  // El segundo hueco de la librería, medido sobre el ensamblado: `TL.Poll` y `TL.InputMediaPoll` no traen dónde poner
  // la descripción, así que el andamio la niega en vez de mandar una encuesta sin lo que se le pidió.
  noDescription: 'La biblioteca de escritorio no tiene campo para la descripción de la encuesta, así que aquí la encuesta se envía y se vota sin descripción.',
  noOption: 'Elige de qué opción quieres ver los votantes.',
  anonymousVoters: 'En una encuesta anónima Telegram no dice quién votó cada opción.',
  firstPage: 'La lista de votantes de escritorio solo da la primera página: el seguimiento de Telegram no es un número.',
};
/** Los topes de `DesktopPoll`: los de escribir arriba y los de leer abajo, que son distintos a propósito. */
const POLL_MAX_QUESTION = 255, POLL_MIN_OPTIONS = 2, POLL_MAX_OPTIONS = 12, POLL_MAX_OPTION = 100;
const POLL_MAX_EXPLANATION = 200, POLL_MIN_VOTES = 1, POLL_MAX_VOTES = 12, POLL_MAX_VOTERS = 50;
// La franja del cierre temporizado, con el cero como «sin cierre» —los mismos números de `DesktopPoll.MinClose` y
// `MaxClose`, que a su vez son los que Telegram publica para `open_period` y `close_date`.
const POLL_MIN_CLOSE = 5, POLL_MAX_CLOSE = 2628000;
const POLL_SHOWN_QUESTION = 300, POLL_SHOWN_OPTION = 100, POLL_SHOWN_EXPLANATION = 300;
// El nombre con el que se pinta la foto de una opción. Son las tres capas escribiendo la misma palabra:
// `DesktopPoll.OptionPhotoName`, el literal de `NativeSnapshot.pollMedia` y aquí.
const OPTION_PHOTO_NAME = 'Foto de la opción';
/**
 * La primera de las tres salidas de `TdSession.senderName`, que es a lo que llama `pollVoters` en vez de formatear
 * nombres: la lista de votantes es la misma tabla en los dos dispositivos y una persona que vote desde ambos tiene
 * que leerse a sí mismo igual. Las otras dos («Usuario de Telegram» y «Conversación») no están aquí, y no es un
 * olvido: en este andamio nadie vota por otra persona, así que no hay fila a la que ponerle ese nombre.
 */
const VOTER_SELF = 'Tú';
/** `poll.send`, con las diez negaciones de `NativeBridge.sendPoll` en su orden exacto y la undécima que solo dice Windows. */
function desktopPollSend(params: Record<string, unknown>, state: State) {
  const chat = state.chats.find(item => item.id === state.active);
  if (!state.canSend) throw new Error(POLL_REFUSALS.sending);
  if (chat?.type === 'private' && !chat.bot && chat.id !== state.selfId) throw new Error(POLL_REFUSALS.private);
  if (chat?.noPolls === true) throw new Error(POLL_REFUSALS.notAllowed);
  // La longitud se mide sobre el texto sin recortar: Android la comprueba dentro de `BridgePolicy.text`, antes del
  // `trim()` y antes de mirar si la pregunta está vacía.
  const raw = String(params.question ?? '');
  if (raw.length > POLL_MAX_QUESTION) throw new Error(POLL_REFUSALS.tooLong);
  const question = raw.trim();
  if (!question) throw new Error(POLL_REFUSALS.noQuestion);
  const options = (Array.isArray(params.options) ? params.options : []).map(option => String(option).trim());
  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) throw new Error(POLL_REFUSALS.batch);
  // Las tres negativas de las fotos, en el orden del puente: primero cada vale —que siga siendo de esta cuenta y de
  // esta conversación, y que el MIME sea uno de los tres de foto—, después el lote. Van antes del texto de las
  // opciones porque en el cable la foto viaja por posición, igual que en `NativeBridge.sendPoll`.
  const pictures = (Array.isArray(params.media) ? params.media : []).map(String).filter(token => token.length > 0);
  const files = pictures.map(token => {
    const file = desktopOutbox.find(item => item.token === token);
    if (!file || file.account !== state.selfId || file.chat !== state.active) throw new Error(POLL_REFUSALS.changedPhotos);
    if (!attachmentIsPhoto(file.mime)) throw new Error(POLL_REFUSALS.notPhoto);
    return file;
  });
  if (files.length > 0 && files.length !== options.length) throw new Error(POLL_REFUSALS.unevenPhotos);
  if (options.some(option => option.length === 0 || option.length > POLL_MAX_OPTION)) throw new Error(POLL_REFUSALS.option);
  if (new Set(options.map(option => option.toLowerCase())).size !== options.length) throw new Error(POLL_REFUSALS.repeated);
  const quiz = params.quiz === true;
  const correct = Number(params.correct ?? -1);
  if (quiz && !(Number.isInteger(correct) && correct >= 0 && correct < options.length)) throw new Error(POLL_REFUSALS.noCorrect);
  // La décima negación es la del cierre, y va la última en Android porque es la que se añadió después de las nueve de
  // siempre. El cero es «sin cierre»; lo demás tiene que caer dentro de la franja publicada.
  const duration = Number(params.duration ?? 0);
  if (duration !== 0 && !(Number.isInteger(duration) && duration >= POLL_MIN_CLOSE && duration <= POLL_MAX_CLOSE)) throw new Error(POLL_REFUSALS.closeRange);
  // La undécima la dice solo Windows, y va detrás de todas las compartidas porque en Android no existe: allí la
  // descripción se escribe y aquí no hay campo donde escribirla.
  if (String(params.description ?? '').trim()) throw new Error(POLL_REFUSALS.noDescription);
  const anonymous = params.anonymous !== false;
  const hide = params.hide === true;
  const explanation = String(params.explanation ?? '').trim().slice(0, POLL_MAX_EXPLANATION);
  const poll: Poll = {
    // El identificador lo sortea el cliente, igual que `DesktopPoll.NewPollId`: la pantalla no lo mira nunca, pero
    // el puente lo necesita para encontrar la fila cuando un aviso de Telegram llega sin decir en qué chat cayó.
    pollId: Math.floor(Math.random() * 0x7fffffff) + 1,
    // Sale vacía siempre, y ya no es un hueco sin decir: la negación de arriba no deja pasar una descripción, y al
    // leer, `TL.Poll` tampoco la trae. En Android sí la escribe `NativeSnapshot` desde el contenedor del mensaje.
    question: question.slice(0, POLL_SHOWN_QUESTION), description: '', totalVoters: 0, anonymous,
    multiple: !quiz && params.multiple === true, revoting: params.revoting === true, closed: false,
    // Las dos banderas que Android lee de TDLib se calculan aquí, con la fórmula que el propio TDLib documenta.
    canSeeResults: quiz || !hide, canGetVoters: !anonymous,
    // Siempre falso, y no es un hueco: cerrar una encuesta no tiene petición en la librería de escritorio.
    canStop: false, quiz, ...(explanation ? { explanation: explanation.slice(0, POLL_SHOWN_EXPLANATION) } : {}),
    // La fecha de cierre, absoluta, igual que la guarda de Windows: aquí se suma al reloj de la simulación porque el
    // espejo no tiene mensaje con fecha todavía —la fila `sent` se construye dos líneas más abajo.
    ...(duration ? { closesAt: Math.floor(Date.now() / 1000) + duration } : {}),
    options: options.map((text, index) => ({ index, text: text.slice(0, POLL_SHOWN_OPTION), votes: 0, percentage: 0, chosen: false, choosing: false,
      // La foto por opción, que desde la ronda CN-B también se envía desde Windows. El nombre es el que le pone la
      // lectura —`DesktopPoll.OptionPhotoName`, el mismo de `NativeSnapshot.pollMedia`— y no el del archivo elegido.
      media: files.length === 0 ? undefined : { id: 0, ready: false, kind: 'image', mime: files[index].mime, name: OPTION_PHOTO_NAME, size: files[index].size } })),
  };
  const sent: Message = {
    id: String(Math.max(0, ...poolOf(state.active).map(message => Number(message.id) || 0)) + 1),
    chatId: state.active, sender: 'Tú', text: '', date: Math.floor(Date.now() / 1000),
    outgoing: true, status: 'sent', edited: false, reactions: [], poll,
  };
  sentPolls.push(sent);
  // El vale se tira en cuanto cuaja el envío, como en las dos capas: `DropOutbox` en Windows y
  // `attachments.remove` en Android. Lo que la persona ya envió no puede volver a enviarse.
  for (const token of pictures) {
    const index = desktopOutbox.findIndex(item => item.token === token);
    if (index >= 0) desktopOutbox.splice(index, 1);
  }
  acceptState({ ...state, messages: [...state.messages, sent] });
  return true;
}
/**
 * El recuento que `updateMessagePoll` deja en la burbuja después de votar. MTProto no manda deltas: manda la
 * encuesta entera con sus totales, así que aquí se vuelve a calcular todo, incluido el porcentaje —que en Android
 * da TDLib hecho y aquí no da nadie—. La cuenta sube una sola vez por persona: cambiar el voto no es votar dos veces.
 */
function applyPollVote(poll: Poll, chosen: number[]): Poll {
  const before = new Set(poll.options.filter(option => option.chosen).map(option => option.index));
  const next = new Set(chosen);
  const total = poll.totalVoters + (before.size === 0 ? 1 : 0);
  return {
    ...poll, totalVoters: total,
    options: poll.options.map(option => {
      const votes = Math.max(0, option.votes + (next.has(option.index) ? 1 : 0) - (before.has(option.index) ? 1 : 0));
      return { ...option, votes, percentage: pollPercentage(votes, total), chosen: next.has(option.index), choosing: false };
    }),
  };
}
/** El entero de `DesktopPoll.Percentage`: redondeo alejado del cero y recorte a la franja que la pantalla pinta. */
function pollPercentage(votes: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((votes * 100) / total)));
}
/**
 * `poll.answer`. Escribe, y por la regla de la ronda AH primero lee: el host vuelve a pedir la fila para sacar de
 * ella las claves opacas de las opciones, así que lo que la pantalla toca es un índice y lo que se manda no. En el
 * andamio el índice es todo lo que hay, y por eso las dos negaciones de Android que allá van sin mensaje —el lote
 * fuera de 1..12 y el índice negativo— tienen aquí su frase, igual que en el puente.
 */
function desktopPollAnswer(params: Record<string, unknown>, state: State) {
  const id = String(params.id ?? '');
  const index = state.messages.findIndex(message => message.chatId === state.active && message.id === id);
  if (index < 0) throw new Error(POLL_REFUSALS.gone);
  const poll = state.messages[index].poll;
  if (!poll) throw new Error(POLL_REFUSALS.noPoll);
  const raw = Array.isArray(params.options) ? (params.options as unknown[]).map(String) : [];
  if (raw.length < POLL_MIN_VOTES || raw.length > POLL_MAX_VOTES) throw new Error(POLL_REFUSALS.noVote);
  const chosen = raw.map(value => Number(value));
  if (chosen.some(value => !Number.isInteger(value) || value < 0)) throw new Error(POLL_REFUSALS.noVote);
  if (chosen.some(value => value >= poll.options.length)) throw new Error(POLL_REFUSALS.stale);
  const before = poll.options.filter(option => option.chosen).map(option => option.index);
  const moment = Math.floor(Date.now() / 1000);
  for (const position of before) pollVoteMoments.delete(voterKey(state.active, id, position));
  for (const position of chosen) pollVoteMoments.set(voterKey(state.active, id, position), moment);
  const updated: Message = { ...state.messages[index], poll: applyPollVote(poll, chosen) };
  const messages = [...state.messages];
  messages[index] = updated;
  acceptState({ ...state, messages });
  const stored = sentPolls.find(item => item.id === id && item.chatId === state.active);
  if (stored) stored.poll = updated.poll;
  return true;
}
/**
 * Cuándo votamos cada opción, y solo eso. El andamio no ha visto votar a nadie más —detrás no hay ningún
 * `messages.getPollVotes`, sino una lista de mensajes inventada para enseñar la interfaz—, así que la única fila de
 * votantes que puede dar con verdad es la nuestra, con la hora en que el propio `poll.answer` la dejó puesta.
 * Cambiar el voto borra la marca anterior: dos horas para la misma persona sería inventarse una segunda votación.
 */
const pollVoteMoments = new Map<string, number>();
const voterKey = (chatId: string, id: string, option: number) => chatId + ':' + id + ':' + option;
/**
 * `poll.voters`. Lee y no toca nada más. Las negativas van en el orden del puente —¿está la fila?, ¿es una
 * encuesta?, ¿vale el índice?, ¿es anónima?, ¿pide otra página?, ¿sigue existiendo la opción?— y la lista que
 * devuelve es lo único que este andamio ha visto nunca. El `total` sí es el recuento que la tarjeta tenía
 * pintado, así que cuando hubiera más votantes que los conocidos, la línea «Se muestran X de Y» de la pantalla se
 * escribe sola: es justo el sitio donde la honestidad de esta capa se ve.
 */
function desktopPollVoters(params: Record<string, unknown>, state: State) {
  const id = String(params.id ?? '');
  const index = state.messages.findIndex(message => message.chatId === state.active && message.id === id);
  if (index < 0) throw new Error(POLL_REFUSALS.gone);
  const poll = state.messages[index].poll;
  if (!poll) throw new Error(POLL_REFUSALS.noPoll);
  const option = Number(params.option);
  if (!Number.isInteger(option) || option < 0) throw new Error(POLL_REFUSALS.noOption);
  if (poll.anonymous) throw new Error(POLL_REFUSALS.anonymousVoters);
  if (Number(params.offset) > 0) throw new Error(POLL_REFUSALS.firstPage);
  const target = poll.options.find(item => item.index === option);
  if (!target) throw new Error(POLL_REFUSALS.stale);
  // El tope de `DesktopPoll.VoterLimit`, con la misma orilla: 1..50 y cualquier cosa que no sea un entero se va al
  // valor con el que la pantalla llama, que es 50.
  const requested = Number(params.limit);
  const limit = Number.isInteger(requested) ? Math.max(1, Math.min(POLL_MAX_VOTERS, requested)) : POLL_MAX_VOTERS;
  const moment = pollVoteMoments.get(voterKey(state.active, id, option));
  const items = moment === undefined ? [] : [{ name: VOTER_SELF, date: moment }];
  return { total: target.votes, items: items.slice(0, limit) };
}
/**
 * Las cinco negaciones de «compartir un contacto», copiadas carácter a carácter de `DesktopContact.cs`. La primera es
 * una referencia y no una copia, igual que en C#, donde `CannotSend` es el mismo `const` que `DesktopPoll.Sending`:
 * dos capas que dicen la frase de Android y una sola que defender. `notListed` no existe en el puente de Android —
 * TDLib puede pedir cualquier usuario por su id y MTProto necesita el `access_hash` que solo trae la lista—, así que
 * es la única que este espejo no puede sacar del teléfono. `prepare` tampoco está, y no es un olvido: en el puente
 * envuelve armar la tabla y aquí la tabla son seis filas escritas a mano, sin caché ninguna que se tuerza.
 */
const CONTACT_REFUSALS = {
  cannotSend: POLL_REFUSALS.sending,
  notAllowed: 'Este chat no permite compartir contactos.',
  notListed: 'Ese contacto ya no está en la lista que Telegram acaba de dar. Vuelve a abrirla e inténtalo.',
  noPhone: 'Telegram no comparte el número de teléfono de este usuario. Solo puedes compartir contactos cuyo número ya está visible.',
  longQuery: 'La búsqueda de contactos admite hasta 80 caracteres.',
};
/** El tope de `DesktopContact.MaxQuery`, que en la búsqueda se niega y no se recorta. */
const CONTACT_MAX_QUERY = 80;
/**
 * Los números que `contacts.getContacts` traería junto a cada persona de `designContacts`. No van dentro de la lista
 * porque el DTO de Android no publica campo de número ninguno —`NativeBridge.contacts` da id, nombre, usuario
 * público, bot y retrato— y la pantalla no lo muestra nunca: es el puente el que lo busca por id al montar la
 * tarjeta, así que el andamio lo guarda al lado, igual que lo guarda TDLib. Héctor Vidal se queda sin número a
 * propósito: es la única manera de que la negativa de Telegram («el número no está expuesto») sea alcanzable con el
 * ratón. Los demás son números de muestra, no de personas reales.
 */
const designPhones: Record<string, string> = {
  '502': '+34 600 11 22 33',
  '503': '+34 600 22 33 44',
  '707': '+34 600 33 44 55',
  '712': '+34 600 44 55 66',
  '721': '+34 600 55 66 77',
};
// La otra cara del botón «Copiar número»: el tope que `DesktopClipboard.cs` copia del `BridgePolicy.text` de Android.
const CLIPBOARD_MAX_TEXT = 4096, CLIPBOARD_REFUSAL = 'El portapapeles admite hasta 4096 caracteres.';
/**
 * Las conversaciones que el andamio tiene montadas para cada persona de `designContacts`: solo dos, porque solo
 * María y Sofía tienen su propio hilo privado en la lista de muestra. El puente real no necesita mapa parecido —a
 * él le basta el `access_hash` de la caché y, si no hay hilo, `chat.open` monta la fila vacía—, así que esta tabla
 * es el hueco del andamio, no del flujo.
 */
const designUserChats: Record<string, string> = { '502': '11', '503': '15' };
/** Las dos frases de `DesktopPrivateChat`, carácter a carácter, y la tercera solo de este andamio. */
const CONTACT_OPEN_REFUSALS = {
  badId: 'El identificador de la persona no es un identificador válido.',
  unknown: 'Esa persona todavía no está entre las que este dispositivo conoce.',
  noThread: 'La vista de diseño no abre una conversación que no existe todavía.',
};
/**
 * `contacts.open`, en el mismo orden que el brazo: forma del identificador, persona conocida y conversación
 * montada. La primera negativa es la de `BridgePolicy.id` de Android dicho en español; la segunda es la diferencia
 * de protocolo —MTProto no fabrica un `InputPeerUser` con solo el número—; la tercera es del andamio, que no sabe
 * inventar una fila de chats, y es la única que el puente de verdad no pronuncia nunca. El tipo se escribe a mano
 * porque la función y `designRequest` se llaman la una a la otra y TypeScript no deduce devoluciones recíprocas.
 */
function desktopOpenContact(params: Record<string, unknown>, state: State): Promise<unknown> {
  const id = String(params.id ?? '').trim();
  if (!/^[1-9][0-9]{0,18}$/.test(id)) throw new Error(CONTACT_OPEN_REFUSALS.badId);
  if (!designContacts.some(contact => contact.id === id)) throw new Error(CONTACT_OPEN_REFUSALS.unknown);
  const chat = designUserChats[id];
  if (!chat || !state.chats.some(item => item.id === chat)) throw new Error(CONTACT_OPEN_REFUSALS.noThread);
  return designRequest('chat.open', { id: chat });
}
/**
 * Las dos negaciones de `contactAction` (`NativeBridge.java:1883`), carácter a carácter. Son también las dos que
 * pronuncia `DesktopContactWrite` en Windows, y las únicas que este andamio puede reproducir: las otras dos salidas
 * de ese método no son frases, son un `false`.
 */
const CONTACT_WRITE_REFUSALS = {
  notPrivate: 'Solo se pueden administrar contactos en conversaciones privadas.',
  notAddable: 'Esta cuenta no se puede agregar como contacto.',
};
/**
 * `contacts.add` y `contacts.remove` (`:1839`, un solo método de Android para las dos claves), modeladas como lo que
 * son: tres guardas y un cambio de marca. El orden es el del brazo de Windows, que a su vez es el de Java —la
 * conversación cargada, la forma del chat, la persona con su bot y su cuenta propia— y detrás los dos «no hace nada»
 * que la pantalla ya sabe leer: quitar a quien no está y añadir a quien ya está devuelven `false` sin tocar el
 * estado, y `App.tsx:761` no repinta la ficha con un `false`. El cuadro de confirmar no está aquí porque el andamio
 * no abre ventanas, igual que `designUnblockSender` declaró lo mismo para el desbloqueo: cancelar responde `false`,
 * así que la vista queda idéntica al camino corto.
 */
function designContactWrite(method: string, params: Record<string, unknown>, state: State): boolean {
  const id = String(params.id ?? '');
  const chat = state.chats.find(item => item.id === id);
  if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
  if (chat.type !== 'private') throw new Error(CONTACT_WRITE_REFUSALS.notPrivate);
  if (chat.bot || id === state.selfId || designSenderId(id) === state.selfId) throw new Error(CONTACT_WRITE_REFUSALS.notAddable);
  const adding = method === 'contacts.add';
  if (!!chat.isContact === adding) return false;
  acceptState({ ...state, chats: state.chats.map(item => item.id === id ? { ...item, isContact: adding } : item) });
  return true;
}
/**
 * `share.contact`, con las cuatro negaciones del puente en su orden exacto —puede escribir la cuenta, admite la
 * conversación una tarjeta, tiene esta sesión a la persona, expone Telegram su número—. Las dos primeras van juntas
 * porque en C# el chat desconocido responde «no puedes enviar», no «no está cargado»: `DesktopContact` se escribe
 * sobre `FindEntry`, que devuelve nulo, y Android comprueba `session.canSend()` antes de mirar el chat. La tarjeta
 * que se añade es la que el host lee del eco de Telegram, no la que armó al escribir: por eso el nombre
 * es el de la fila que se pulsó, que es la misma cadena que el puente arma al unir los dos campos, el número
 * sale de la tabla aparte y `canCopy` sigue a `exportable`, que en el andamio es el
 * canal protegido. El `userId` viaja porque es lo que lee el botón «Abrir chat» de la tarjeta: en Windows lo atiende
 * el brazo que le puso la ronda AQ, y en Android el `CreatePrivateChat` de siempre.
 */
function desktopShareContact(params: Record<string, unknown>, state: State) {
  const chat = state.chats.find(item => item.id === state.active);
  if (!state.canSend || !chat) throw new Error(CONTACT_REFUSALS.cannotSend);
  if (chat.noContacts === true) throw new Error(CONTACT_REFUSALS.notAllowed);
  const id = String(params.id ?? '');
  const contact = designContacts.find(item => item.id === id);
  if (!contact) throw new Error(CONTACT_REFUSALS.notListed);
  const phone = (designPhones[id] ?? '').trim();
  if (!phone) throw new Error(CONTACT_REFUSALS.noPhone);
  const sent: Message = {
    id: String(Math.max(0, ...poolOf(state.active).map(message => Number(message.id) || 0)) + 1),
    chatId: state.active, sender: 'Tú', text: '', date: Math.floor(Date.now() / 1000),
    outgoing: true, status: 'sent', edited: false, reactions: [],
    // El nombre de la tarjeta es el de la fila que se pulsó, porque es el mismo que el puente arma uniendo los dos
    // campos al escribir y al leer; el recorte de 64 con el punto suspensivo de `NativeSnapshot.limit` queda en el
    // puente, y aquí ninguna muestra lo alcanza.
    extra: { kind: 'contact', name: contact.name, phone, userId: id, canCopy: !PROTECTED_CHATS.has(state.active) },
  };
  sentContacts.push(sent);
  acceptState({ ...state, messages: [...state.messages, sent] });
  return true;
}
/** Las dos negativas de `openMessageLocation` (`NativeBridge.java:416` y `:421`), carácter a carácter. */
const LOCATION_REFUSALS = {
  protected: 'Esta ubicación solo se puede ver dentro de este chat.',
  gone: 'La ubicación ya no está disponible.',
};
/**
 * `message.location.open`, con las tres negaciones del brazo en su orden —fila, protección, coordenadas—. La de la
 * fila ausente es la misma frase que la bandeja de álbumes y de encuestas, así que se referencia en lugar de
 * copiarla. El andamio no abre el navegador, igual que no lo abre `link.open`: contesta `true` y se acabó su parte,
 * que es enseñar que la fila tenía coordenadas y permiso.
 * <para>
 * Dos cosas no se pueden espejar con las señales que el andamio publica, y están dichas en su sitio: la negativa de
 * `BridgePolicy.id` de Android no existe aquí porque el brazo lee el número con respaldo a cero y un cero no
 * devuelve fila, así que acaba en la frase de arriba igual que en el host; y la de «no es una ubicación» se adelanta
 * a la comprobación de la fila porque una fila que no publicó tarjeta no publica `canOpen`. Lo único donde las dos
 * órdenes dan frases distintas es pedir el mapa de una foto de un chat protegido —cosas que la interfaz no ofrece—.
 * </para>
 */
function desktopOpenLocation(params: Record<string, unknown>, state: State): boolean {
  const row = state.messages.find(message => message.id === String(params.id ?? ''));
  if (!row) throw new Error(POLL_REFUSALS.gone);
  // Primero el chat, que es `ProtectedChat(entry)` del brazo y la misma señal que usa `desktopShareContact`.
  if (PROTECTED_CHATS.has(state.active)) throw new Error(LOCATION_REFUSALS.protected);
  const extra = row.extra;
  if (!extra || extra.kind !== 'location') throw new Error(LOCATION_REFUSALS.gone);
  // `canOpen` es lo que el puente publicó para `!protect`: si no está, manda la protección aunque las coordenadas
  // estén puestas, porque el mapa de fuera sigue siendo una salida del chat.
  if (extra.canOpen !== true) throw new Error(LOCATION_REFUSALS.protected);
  const latitude = extra.latitude, longitude = extra.longitude;
  const valid = latitude !== undefined && longitude !== undefined &&
    Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
  if (!valid) throw new Error(LOCATION_REFUSALS.gone);
  return true;
}
const HISTORY_DATE_REFUSALS = {
  history: 'Este historial no admite saltos por fecha.',
  range: 'Fecha fuera de rango.',
};
/** El mismo techo de `at` que en las otras dos capas: el entero con el que TDLib guarda la hora. */
const HISTORY_DATE_MAX = 2147483647;
/**
 * `history.byDate`, con las dos negaciones del brazo en su orden —primero la conversación, luego la hora—. La
 * tercera frase de Android (`NativeBridge.java:3432`) no se espeja a propósito: nace de un callback que llega
 * tarde, y aquí —como en el puente de C#— la respuesta sale del mismo hilo que leyó el estado, así que ninguna
 * pantalla la pronuncia.
 *
 * La negación del futuro tampoco la pronuncia esta pantalla, y se queda escrita porque es la guarda del puente:
 * `endOfLocalDate` (`inboxModel.ts:53-61`) ya corta su frontera a «ahora» con un `Math.min` propio y el campo no
 * deja elegir mañana, así que ninguna fecha que el formulario pueda producir cae aquí. Esta ronda entró a cambiar
 * esa aritmética creyendo que «hoy» se negaba siempre; medida, resultó que no, y lo único que se ha movido es de
 * dónde sale la frase.
 */
function designHistoryDate(params: Record<string, unknown>, state: State): string | null {
  if (String(params.id ?? '') !== state.active) throw new Error(HISTORY_DATE_REFUSALS.history);
  const at = Number(params.at ?? 0);
  if (!(at > 0 && at <= HISTORY_DATE_MAX && at <= Math.floor(Date.now() / 1000))) throw new Error(HISTORY_DATE_REFUSALS.range);
  return state.messages.filter(message => message.date <= at).at(-1)?.id ?? null;
}
/**
 * El perfil propio del andamio, ya mutable: `account.name`, `account.bio` y `account.username` escriben aquí y
 * `account.profile` vuelve a leer de aquí, que es lo que hacen las dos capas de puente cuando la pantalla abre el
 * diálogo otra vez. Antes de la ronda AT era una literal dentro de `designRequest`, así que un cambio escrito se
 * veía guardado en la pantalla y perdido en la siguiente lectura.
 */
let previewAccount = {
  id: '1', firstName: 'Rodrigo', lastName: '', username: 'rodrigo', usernames: ['rodrigo'], editableUsername: 'rodrigo',
  bio: ownBio, bioEntities: entitiesOf(ownBio, [['link', 'https://wrgram.app'], ['mention', '@rodrigo_web']]),
  photoId: '0', phoneNumber: '+34600111222', birthday: { day: 14, month: 6, year: 1994 },
  business: { address: 'Calle Mayor 1, Madrid', timeZoneId: 'Europe/Madrid', nextOpenIn: 0, nextCloseIn: 5400, hours: [{ startMinute: 540, endMinute: 1080 }, { startMinute: 1980, endMinute: 2520 }, { startMinute: 3420, endMinute: 3960 }, { startMinute: 4860, endMinute: 5400 }, { startMinute: 6300, endMinute: 6840 }] },
};
/** Los tres topes de `DesktopAccountProfile`, que son los de `BridgePolicy.text` en Android. */
const ACCOUNT_MAX = { name: 64, bio: 140, username: 32 };
/** Las frases de `DesktopAccountProfile.cs`, copiadas carácter a carácter; el tope usa la plantilla de la ronda AH. */
const ACCOUNT_REFUSALS = {
  missing: 'Falta el texto que hay que guardar en Telegram.',
  noName: 'El nombre no puede quedar vacío.',
  badUsername: 'El nombre público debe tener de 5 a 32 caracteres y empezar con una letra.',
};
/** `[A-Za-z][A-Za-z0-9_]{4,31}` de `account.username` con `matches` de Java; en JS `$` ya ancla el final del todo. */
const ACCOUNT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;
/** `NameProblem`: formato, tope sobre la cadena sin recortar y el vacío después del `trim`, en ese orden. */
function profileNameProblem(first: unknown, last: unknown): string | undefined {
  if (typeof first !== 'string' || typeof last !== 'string') return ACCOUNT_REFUSALS.missing;
  if (first.length > ACCOUNT_MAX.name || last.length > ACCOUNT_MAX.name) return EDIT_REFUSALS.tooLong(ACCOUNT_MAX.name);
  return first.trim().length === 0 ? ACCOUNT_REFUSALS.noName : undefined;
}
function profileBioProblem(bio: unknown): string | undefined {
  if (typeof bio !== 'string') return ACCOUNT_REFUSALS.missing;
  return bio.length > ACCOUNT_MAX.bio ? EDIT_REFUSALS.tooLong(ACCOUNT_MAX.bio) : undefined;
}
/** `UsernameProblem`: la cadena vacía es legítima, porque es la forma de quitar el nombre público. */
function profileUsernameProblem(value: unknown): string | undefined {
  if (typeof value !== 'string') return ACCOUNT_REFUSALS.missing;
  if (value.length > ACCOUNT_MAX.username) return EDIT_REFUSALS.tooLong(ACCOUNT_MAX.username);
  const trimmed = value.trim();
  return trimmed.length > 0 && !ACCOUNT_USERNAME.test(trimmed) ? ACCOUNT_REFUSALS.badUsername : undefined;
}
/**
 * El `schedule()` de Android después de escribir (`NativeBridge.java:548-550`): que la interfaz vuelva a pedir lo
 * suyo. Aquí eso es refrescar el `name` del estado, que es el rótulo del avatar y del menú de cuenta, y es también
 * lo que hace `RefreshSelf` en el puente de C#.
 */
function designAccountRefresh() {
  acceptState({ ...snapshot(), name: [previewAccount.firstName, previewAccount.lastName].filter(part => part.length > 0).join(' ').trim() });
}
/**
 * `account.profile` en el andamio. En Android viaja entero; en Windows se quitan las dos claves que el puente de
 * C# no manda —MTProto publica `about` como cadena sola, sin la lista paralela de entidades, y los datos de
 * empresa viven en otros campos que esta ronda no traduce—. Sin este recorte la vista de diseño de escritorio se
 * acostumbraría a enlaces en la bio y a un bloque de empresa que el host real no pinta, que es justo la clase de
 * pantalla falsa que estas rondas vienen a cerrar.
 */
function designAccountProfile(platform?: string): Record<string, unknown> {
  if (platform !== 'desktop') return { ...previewAccount };
  const windows: Record<string, unknown> = { ...previewAccount };
  delete windows.bioEntities;
  delete windows.business;
  return windows;
}
function designAccountName(params: Record<string, unknown>): boolean {
  const problem = profileNameProblem(params.firstName, params.lastName);
  if (problem) throw new Error(problem);
  previewAccount = { ...previewAccount, firstName: (params.firstName as string).trim(), lastName: (params.lastName as string).trim() };
  designAccountRefresh();
  return true;
}
/** La bio normalizada igual que en las dos capas: los saltos se vuelven espacios y luego se recorta. */
function designAccountBio(params: Record<string, unknown>): boolean {
  const problem = profileBioProblem(params.bio);
  if (problem) throw new Error(problem);
  const bio = (params.bio as string).replace(/\n/g, ' ').trim();
  // Una bio recién escrita no trae entidades: en Android las calcularía TDLib sobre el texto nuevo y en Windows
  // no las pide nadie porque MTProto manda `about` como cadena sola. Las del andamio eran del texto viejo.
  previewAccount = { ...previewAccount, bio, bioEntities: [] };
  return true;
}
function designAccountUsername(params: Record<string, unknown>): boolean {
  const problem = profileUsernameProblem(params.username);
  if (problem) throw new Error(problem);
  const username = (params.username as string).trim();
  previewAccount = { ...previewAccount, username, usernames: username ? [username] : [], editableUsername: username };
  return true;
}
const PROFILE_PHOTO = {
  /** `DesktopProfilePhoto.Extensions`, medidas con los códecs de PresentationCore; sin `webp`, que WPF no trae. */
  extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tif', 'tiff'],
  /** `NoImage`, la frase con la que Android despacha las cinco negaciones del descarte. */
  noImage: 'No se pudo preparar la imagen. Elige una foto válida de hasta 20 MB.',
  /** `NotFound`: la foto que la cuenta dice tener no aparecía en `photos.getUserPhotos`. */
  notFound: 'Telegram no devolvió tu foto actual; vuelve a abrir el perfil e inténtalo otra vez.',
};
/** Los dos topes de `DesktopProfilePhoto.Problem`, que son los de `NativeBridge.java:1717-1718`. */
const PROFILE_PHOTO_MAX = { bytes: 20 * 1024 * 1024, pixels: 12000 };
/** `IsImage`: el selector de Windows no da el tipo de contenido, así que el MIME se decide por extensión. */
function profilePhotoIsImage(name: string): boolean {
  const dot = name.lastIndexOf('.');
  return dot >= 0 && PROFILE_PHOTO.extensions.includes(name.slice(dot + 1).toLowerCase());
}
/** `Problem`, en el orden en que Android comprueba: tipo, peso y dimensiones almacenadas. */
function profilePhotoProblem(name: string, bytes: number, width: number, height: number): string | undefined {
  if (!profilePhotoIsImage(name)) return PROFILE_PHOTO.noImage;
  if (bytes > PROFILE_PHOTO_MAX.bytes) return PROFILE_PHOTO.noImage;
  if (width <= 0 || height <= 0 || width > PROFILE_PHOTO_MAX.pixels || height > PROFILE_PHOTO_MAX.pixels) return PROFILE_PHOTO.noImage;
  return undefined;
}
/**
 * Lo que `photos.getUserPhotos` devolvería: las fotos que este andamio ha publicado. Es una lista aparte del
 * `photoId` de la cuenta por el mismo motivo por el que en Windows son dos lecturas distintas.
 */
let publishedPhotos: string[] = [];
let profilePhotoSeq = 0;
/**
 * `account.photo.pick` (ronda AU). El andamio no puede abrir ni el selector de Windows ni el diálogo de confirmar,
 * así que lo que la persona elige se le dice por parámetros —nombre, peso, ancho y alto— y lo que se reproduce aquí
 * es la decisión del puente: qué se niega y con qué palabra, y qué queda publicado después. La geometría del recorte
 * (giro EXIF, recuadro al centro, 640 y calidad 88) no se copia: sin imagen real delante sería una cifra falsa, y
 * vive medida en `DesktopProfilePhoto` y en la tubería de `PreparePhoto`.
 */
function designAccountPhotoPick(params: Record<string, unknown>): boolean {
  const name = typeof params.name === 'string' ? params.name : 'Foto de perfil.jpg';
  const bytes = Number(params.size ?? 1800000);
  const width = Number(params.width ?? 2400);
  const height = Number(params.height ?? 1600);
  const problem = profilePhotoProblem(name, bytes, width, height);
  if (problem) throw new Error(problem);
  profilePhotoSeq += 1;
  const id = String(7000000000000 + profilePhotoSeq);
  publishedPhotos = [...publishedPhotos, id];
  previewAccount = { ...previewAccount, photoId: id };
  // El avatar que deja `RefreshSelfPhotoAsync`: una foto recién publicada todavía no está bajada, así que el
  // puente la registra con `ready:false` y tamaño 0. El identificador, en cambio, no puede copiarse: en Windows
  // es un id de archivo con bytes detrás que la pantalla pide con `media.load`, y el andamio no sirve bytes —usa
  // la misma convención que las fotos de los mensajes de muestra (`id:0` con una miniatura local), que es como
  // `MediaView` pinta una foto sin tubería de descarga.
  acceptState({ ...snapshot(), profilePhoto: { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name: 'Foto de perfil', size: 0, minithumbnail: '/bots/snake.jpg' } });
  return true;
}
/**
 * `account.photo.delete` (ronda AU). Sin foto no hay diálogo ni error: Android responde `false` cuando `GetMe` no
 * trae perfil (`NativeBridge.java:1689`) y la pantalla ya sabe que `false` es «no cambió nada».
 */
function designAccountPhotoDelete(): boolean {
  if (previewAccount.photoId === '0') return false;
  // En Windows la foto hay que localizarla antes de preguntar, porque `photos.deletePhotos` pide el `InputPhoto`
  // entero y no el identificador. Aquí las dos lecturas son la misma variable, así que esta negativa solo se
  // alcanza en el host real; se copia igualmente para que el espejo no prometa un borrado sin foto detrás.
  if (!publishedPhotos.includes(previewAccount.photoId)) throw new Error(PROFILE_PHOTO.notFound);
  publishedPhotos = publishedPhotos.filter(id => id !== previewAccount.photoId);
  previewAccount = { ...previewAccount, photoId: '0' };
  acceptState({ ...snapshot(), profilePhoto: null });
  return true;
}
/**
 * Las frases propias de la foto de la comunidad (ronda BD), copiadas de `DesktopChatPhoto`. Las tres que esta capa
 * no repite no están aquí: el derecho se dice con `noRightNotice` de la ronda M y el descarte de la imagen con
 * `PROFILE_PHOTO.noImage` de la AU, porque en Android, en Windows y en el andamio son las mismas dos cadenas, y
 * una frase que vive tres veces en la misma capa se separa la primera vez que alguien cambia una. Y falta
 * `CHAT_PHOTO_CHANGED` por la misma razón por la que falta la versión de perfil en la ronda AU: el andamio no abre
 * ventana modal, así que no hay ningún hueco donde la cuenta pueda cambiar a mitad de la petición.
 */
const CHAT_PHOTO = {
  /** `CHAT_PHOTO_UNSUPPORTED` (`NativeBridge.java:1746`), el noun cambiado de la frase de la ronda M. */
  unsupported: 'La foto solo se edita en grupos, supergrupos y canales.',
  /** La negativa que solo existe en Windows: la librería no genera el vacío con el que se borra la foto. */
  noDelete: 'Windows no puede quitar la foto de la comunidad: la librería no trae el vacío con el que Telegram borra la imagen. Hazlo desde Telegram.',
};
/**
 * `chat.photo.pick`. Como en `account.photo.pick`, el andamio no abre ni selector ni diálogo: la persona dice qué
 * archivo eligió por parámetros y aquí se reproduce la decisión del puente —forma, derecho, descarte— y lo que
 * queda publicado. La geometría del recorte no se copia porque sin imagen real sería una cifra falsa.
 *
 * El orden es el de `NativeBridge.chatPhotoPick` (`:1716-1724`): la forma y el derecho se comprueban antes de
 * abrir la galería, y el descarte de la imagen después. adelantar el descarte haría que un chat que esta cuenta no
 * administra oyera «no se pudo preparar la imagen» en lugar del permiso que le falta.
 */
function designChatPhotoPick(params: Record<string, unknown>): boolean {
  const id = String(params.id);
  const chat = snapshot().chats.find(item => item.id === id);
  if (chat && !community(chat)) throw new Error(CHAT_PHOTO.unsupported);
  if (!communityEntry(id, snapshot().chats).canChange) throw new Error(noRightNotice);
  const name = typeof params.name === 'string' ? params.name : 'Foto de la comunidad.jpg';
  const problem = profilePhotoProblem(name, Number(params.size ?? 1800000), Number(params.width ?? 2400), Number(params.height ?? 1600));
  if (problem) throw new Error(problem);
  acceptState({ ...snapshot(), chats: snapshot().chats.map(other => other.id === id ? { ...other, photo: chatPhotoMedia(name) } : other) });
  return true;
}
/**
 * `chat.photo.delete`. En Android es el mismo `SetChatPhoto` con el foto vacío (`:1762`); en Windows no hay objeto
 * que mandar, así que el espejo dice la causa en la plataforma que la tiene en vez de fingir el borrado. Sin foto
 * tampoco hay diálogo: `false`, que la pantalla ya traduce por «no cambió nada» (`:1757`).
 */
function designChatPhotoDelete(params: Record<string, unknown>, platform?: string): boolean {
  const id = String(params.id);
  const state = snapshot();
  const chat = state.chats.find(item => item.id === id);
  if (platform === 'desktop') throw new Error(CHAT_PHOTO.noDelete);
  if (chat && !community(chat)) throw new Error(CHAT_PHOTO.unsupported);
  if (!chat?.photo) return false;
  if (!communityEntry(id, state.chats).canChange) throw new Error(noRightNotice);
  acceptState({ ...state, chats: state.chats.map(other => other.id === id ? { ...other, photo: undefined } : other) });
  return true;
}
/**
 * La forma en que el puente publica una foto recién escrita: `ready:false` y tamaño 0, porque el archivo todavía
 * no está bajado en este dispositivo. El identificador, en cambio, no se copia: `MediaView` pinta una foto sin
 * tubería de descarga con `id:0` y una miniatura local, que es la misma convención que las fotos de los mensajes
 * de muestra.
 */
function chatPhotoMedia(name: string): Media {
  return { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name, size: 0, minithumbnail: '/bots/snake.jpg' };
}
/**
 * Las sesiones del andamio, mutables por la misma razón por la que lo es `previewAccount`: la pantalla relee la
 * lista justo después de cerrar una sesión, y un espejo que responde `true` y sigue enseñando la fila cerrada
 * enseña una pantalla falsa. Las tres filas no son tres dispositivos al azar: cada una ejerce una de las tres
 * traducciones de `DesktopSessions` —la actual, con todo relleno; una remota sin `device_model`, que es la que
 * tiene que leerse como el respaldo «Dispositivo» de `NativeBridge.java:1809`, y una sin `app_version` ni
 * procedencia, que es la que en TDLib dejaría una coma suelta y en Windows no—.
 */
let previewSessions: { id: string; current: boolean; device: string; platform: string; version: string; location: string; ip: string; lastActive: number }[] = [
  { id: '7400000000000000001', current: true, device: 'WRGram Desktop', platform: 'Windows 11', version: 'WRGram 1.0.49', location: 'Madrid, España', ip: '88.12.34.56', lastActive: 1763186400 },
  { id: '7400000000000000002', current: false, device: 'Dispositivo', platform: 'Android', version: 'WRGram 1.0.48', location: 'Buenos Aires, Argentina', ip: '190.15.66.7', lastActive: 1763100000 },
  { id: '7400000000000000003', current: false, device: 'iPhone', platform: 'iOS', version: 'WRGram ', location: '', ip: '', lastActive: 1762400000 },
];
/**
 * La fila «esta sesión» se rellena con el aparato desde el que se mira. No es cosmético: quien abre el andamio en
 * `platform=android` está viendo la pantalla del teléfono, y dejarle leer «WRGram Desktop · Este dispositivo»
 * acostumbraría la vista a una fila que su aparato no produce. Lo que Telegram da aquí es el `device_model` y la
 * `platform` de la sesión que está contestando, que son el modelo del teléfono y Android.
 */
const SESSION_SELF = {
  desktop: { device: 'WRGram Desktop', platform: 'Windows 11' },
  android: { device: 'POCO X5 Pro', platform: 'Android 13' },
};
function designSessions(platform?: string): typeof previewSessions {
  const self = platform === 'desktop' ? SESSION_SELF.desktop : SESSION_SELF.android;
  return previewSessions.map(session => session.current ? { ...session, ...self } : session);
}
/**
 * `DesktopSessions.BadId`, copiada carácter a carácter. La otra frase de esa clase —`NotRead`, la respuesta sin
 * lista— no está aquí y no es un olvido: en Windows la produce un `authorizations` nulo, y un andamio que siempre
 * tiene su lista montada en el módulo no puede dejar de tenerla.
 */
const SESSION_REFUSALS = { badId: 'El identificador de la sesión no es un identificador válido.' };
/**
 * `DesktopSessions.ValidId`, que es el `-?(0|[1-9][0-9]{0,18})` de `BridgePolicy.id` (`BridgePolicy.java:59`). El
 * ancla de Java y la de JavaScript caen solas; en C# son `\A` y `\z` por el salto de línea que `$` deja pasar.
 */
const SESSION_ID = /^-?(0|[1-9][0-9]{0,18})$/;
/** El rango que en C# mide `long.TryParse` (`HashOf`): diecinueve nueves pasan el patrón y no caben en un `long`. */
const SESSION_HASH_MAX = BigInt('9223372036854775807');
const SESSION_HASH_MIN = BigInt('-9223372036854775808');
function sessionHash(id: string): bigint | undefined {
  if (!SESSION_ID.test(id)) return undefined;
  const value = BigInt(id);
  return value >= SESSION_HASH_MIN && value <= SESSION_HASH_MAX ? value : undefined;
}
/** `account.session.revoke` (ronda AV). La guarda de identificador es la del puente de C#. */
function designSessionRevoke(params: Record<string, unknown>, platform?: string): boolean {
  const id = typeof params.id === 'string' ? params.id : undefined;
  if (platform === 'desktop' && (id === undefined || sessionHash(id) === undefined)) throw new Error(SESSION_REFUSALS.badId);
  previewSessions = previewSessions.filter(session => session.id !== id);
  return true;
}
/**
 * El asistente de cambio de número (ronda A02) en el andamio. `previewPhoneCode` es lo que Telegram contestó:
 * las seis claves que `PhoneChange.project` (`PhoneChange.java:74-84`) manda al puente, con el medio por donde
 * llegó y el siguiente que ofrece. En la vista de diseño nadie envía un código de verdad, así que `check` solo
 * comprueba la forma que exige el nativo y da el número por confirmado, igual que `AccountSafetyPolicy.phoneCode`
 * (`AccountSafetyPolicy.java:35-39`) antes de mandarlo.
 */
let previewPhoneCode: PhoneCodeInfo | undefined;
const PHONE_INTERNATIONAL = /^\+[1-9][0-9]{6,14}$/;
function designPhoneCodeInfo(phone: string, failed: boolean): PhoneCodeInfo {
  return failed
    ? { phone, sent: 'una llamada que tienes que descolgar', next: 'un SMS', length: 5, hint: '', timeout: 0 }
    : { phone, sent: 'un SMS', next: 'una llamada que tienes que descolgar', length: 5, hint: '', timeout: 60 };
}
/** `PhoneChange.number` (`PhoneChange.java:22-26`): espacios, guiones y paréntesis fuera, y el patrón internacional. */
function designPhoneNumber(raw: unknown): string | undefined {
  const value = String(raw ?? '').replaceAll(/[\s()-]/g, '');
  return PHONE_INTERNATIONAL.test(value) ? value : undefined;
}
function designPhoneChange(params: Record<string, unknown>): PhoneCodeInfo {
  const phone = designPhoneNumber(params.phone);
  if (!phone) throw new Error('Escribe el número nuevo en formato internacional, con el signo + al principio.');
  previewPhoneCode = designPhoneCodeInfo(phone, false);
  return previewPhoneCode;
}
function designPhoneCheck(params: Record<string, unknown>): { verified: boolean } {
  const code = String(params.code ?? '').trim();
  if (!code) throw new Error('Escribe el código que llegó a tu teléfono.');
  if (previewPhoneCode) previewAccount = { ...previewAccount, phoneNumber: previewPhoneCode.phone };
  previewPhoneCode = undefined;
  return { verified: true };
}
function designPhoneResend(params: Record<string, unknown>): PhoneCodeInfo {
  previewPhoneCode = designPhoneCodeInfo(previewPhoneCode?.phone ?? previewAccount.phoneNumber, params.verificationFailed === true);
  return previewPhoneCode;
}
/** Uno o muchos ids, con las mismas cuatro negaciones del host antes de tocar nada. */
function desktopDelete(raw: unknown[], revoke: boolean, state: State) {
  const ids = raw.map(String);
  if (ids.length === 0 || ids.length > 100) throw new Error(DELETE_REFUSALS.batch);
  if (ids.some(id => !/^[1-9]\d*$/.test(id))) throw new Error(DELETE_REFUSALS.range);
  const kind = deleteKind(state.chats.find(chat => chat.id === state.active));
  if (kind === 'unknown') throw new Error(DELETE_REFUSALS.stale);
  if (!revoke && kind === 'channel') throw new Error(DELETE_REFUSALS.self);
  const wanted = new Set(ids);
  const rows = state.messages.filter(message => message.chatId === state.active && wanted.has(message.id));
  if (rows.length !== wanted.size) throw new Error(DELETE_REFUSALS.loaded);
  if (revoke && rows.some(message => !(message.outgoing || (kind === 'channel' && DELETE_RIGHTS.has(message.chatId))))) throw new Error(DELETE_REFUSALS.yours);
  acceptState({ ...state, messages: state.messages.filter(message => !(message.chatId === state.active && wanted.has(message.id))) });
  return true;
}
/**
 * Las seis negaciones de la cola, copiadas carácter a carácter de `DesktopJoinRequests.cs`. Cuatro son las que
 * Android ya pronunciaba en español (`NativeBridge.java:3562`, `:3514`, `:3567` y `JoinRequests.java:51`); las dos
 * de la forma estricta del `userId` y de la decisión salen en inglés por allá (`BridgePolicy.java:59`,
 * `NativeBridge.java:2810`) y Windows las dice en español, que es la norma fijada por la ronda AT.
 */
const JOIN_REFUSALS = {
  unsupported: 'Las solicitudes de ingreso solo existen en grupos y canales.',
  cursor: 'El marcador de solicitudes no es válido.',
  gone: 'Vuelve a abrir las solicitudes para continuar.',
  self: 'Esa solicitud no se puede responder desde aquí.',
  badId: 'El identificador de la solicitud no es válido.',
  missingApprove: 'La respuesta debe decir si se aprueba o se rechaza la solicitud.',
};
/** La lectura estricta de `BridgePolicy.id`: dígitos con su techo de `long`, nada de números sueltos ni comas. */
const JOIN_ID = /^-?(0|[1-9][0-9]{0,18})$/;
/** Los dos tramos del marcador que exige `JoinRequests.token` (`:44`). */
const JOIN_DIGITS = /^[0-9]+$/;
/** Los dos techos de `JoinRequests.offset` (`:56-57`): `long.parseLong` para la persona, `int.parseInt` para la fecha. */
const JOIN_USER_MAX = BigInt('9223372036854775807'), JOIN_DATE_MAX = 2_147_483_647;

/** La guarda de forma de `:3510` y `:3560`, la misma pregunta que hace la puerta del menú en `App.tsx`. */
function joinCommunity(params: Record<string, unknown>, state: State) {
  const chat = state.chats.find(item => item.id === String(params.id));
  if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
  if (!(chat.supergroup === true || chat.type === 'group' || chat.type === 'channel')) throw new Error(JOIN_REFUSALS.unsupported);
}

/** `JoinRequests.offset` (`:47-63`) hecho negación: vacío es «desde el principio»; si hay marcador, valen sus dos posiciones. */
function joinCursorProblem(marker: string): boolean {
  if (marker === '') return false;
  const parts = marker.split(':');
  if (parts.length !== 2 || !JOIN_DIGITS.test(parts[0]) || !JOIN_DIGITS.test(parts[1])) return true;
  const userId = BigInt(parts[0]);
  if (userId === 0n || userId > JOIN_USER_MAX) return true;
  const date = Number(parts[1]);
  return date < 1 || date > JOIN_DATE_MAX;
}
// Development only; Vite removes this branch and module from the Android production assets.
export async function designRequest(method: string, params: Record<string, unknown>) { if(['attachment.recents','attachment.recents.close','attachment.photos.permission','attachment.photo','composer.focus'].includes(method))return previewDeviceGallery(method,params,snapshot(),p=>desktopAttachmentPick(p,snapshot()));
  const state = snapshot();
  if (method === 'bot.commands') { const chat=state.chats.find(item=>item.id===state.active); const bots=chat?.bot?[chat]:chat?.type==='group'?state.chats.filter(item=>item.bot):[]; return {chatId:state.active,commands:bots.flatMap(bot=>['start','help','settings'].map(name=>({name,description:name==='help'?'Ayuda del bot':name==='settings'?'Configurar el bot':'Iniciar el bot',botId:bot.id,botName:bot.title,username:bot.username||'sample_bot'}))),...(chat?.bot?{menu:{text:'Abrir Mini App',kind:'main'}}:{})}; }
  if (method === 'bot.menu.open') return true;
  // La puerta de la ronda BK, delante de todo lo demás: en `platform=desktop` el andamio no modela una clave que el
  // host de Windows no atiende, porque un dato sintético encima de una pantalla de escritorio es exactamente la
  // mentira que el aviso «ALCANCE DE ESTA BETA» lleva rondas negando. Las seis claves que ya se niegan por su nombre
  // la saltan y siguen diciendo su frase, que explica qué petición falta.
  if (state.platform === 'desktop') { const gap = desktopGapRefusal(method); if (gap) throw new Error(gap); }
  if (method === 'appearance') { acceptState({ ...state, appearance: { ...state.appearance, ...params } }); return true; }
  // El perfil propio se lee del estado mutable de arriba, porque es el mismo que escriben las tres órdenes de
  // debajo: un andamio que responde `true` a un cambio y luego muestra el valor viejo enseña una pantalla falsa.
  if (method === 'account.profile') return designAccountProfile(state.platform);
  if (method === 'account.name') return designAccountName(params);
  if (method === 'account.bio') return designAccountBio(params);
  if (method === 'account.username') return designAccountUsername(params);
  if (method === 'account.photo.pick') return designAccountPhotoPick(params);
  if (method === 'account.photo.delete') return designAccountPhotoDelete();
  // Las dos de la foto de la comunidad (ronda BD). La segunda solo se atiende como se atiende en el host: en
  // escritorio no hay petición que mandar, y el espejo lo dice en lugar de devolver `true`.
  if (method === 'chat.photo.pick') return designChatPhotoPick(params);
  if (method === 'chat.photo.delete') return designChatPhotoDelete(params, state.platform);
  // Las dos sesiones de la ronda AV: la lectura da la lista mutable de arriba y el cierre quita la fila, que es lo
  // que hace Telegram y luego repite la pantalla al reabrir el diálogo.
  if (method === 'account.sessions') return designSessions(state.platform);
  if (method === 'account.session.revoke') return designSessionRevoke(params, state.platform);
  // Las tres del asistente de número (ronda A02). En escritorio la puerta de arriba las niega antes de llegar aquí:
  // el puente de C# no tiene brazo para `SendPhoneNumberCode` con `PhoneNumberCodeTypeChange`, y el andamio no modela
  // lo que el host no puede contestar.
  if (method === 'account.phone.change') return designPhoneChange(params);
  if (method === 'account.phone.check') return designPhoneCheck(params);
  if (method === 'account.phone.resend') return designPhoneResend(params);
  if (method === 'chat.profile') {
    const id = String(params.id);
    if (id === '11') return { id:'501', title:'María Fernández', username:'maria_fdz', usernames:activeUsernames([{ username:'maria_fdz', active:true }]), bio:mariaBio, bioEntities:entitiesOf(mariaBio,[['link','https://maria.design'],['mention','@maria_fdz']]), bot:false, groupCount:2, phone:'+34 600 111 222', premium:false, verified:false, blocked:designIsBlocked(id), presence:peerPresence({ kind:'online', expires:Math.floor(Date.now()/1000)+600 }, Math.floor(Date.now()/1000)) };
    // `canViewMembers` y `canManageMembers` son las dos banderas que Android saca del participante propio
    // (`NativeBridge.java:1282-1288`). Sin ellas, la ficha de la comunidad no ofrecería nunca «Administrar
    // miembros» en la vista de diseño y el panel se quedaría sin puerta que enseñar.
    if (id === '14') return { id:'-1001', title:'WRGram · Comunidad', username:'wrgram_community', usernames:['wrgram_community'], bio:communityBio, bioEntities:entitiesOf(communityBio,[['link','https://wrgram.app']]), bot:false, memberCount:groupMembers.length, administratorCount:1, canViewMembers:true, canManageMembers:true };
    // Los demás chats, con las mismas claves que el host de Windows responde desde la ronda BA: una comunidad
    // siempre dice cuántos están dentro y si se pueden ver, y una persona siempre dice con cuántas comunidades
    // comparte. Sin estas dos claves la pestaña no aparece, y la puerta la decide el puente, no la pantalla.
    const chat = state.chats.find(item => item.id === id);
    if (chat && (chat.type === 'group' || chat.type === 'channel')) {
      const inside = rosterRows(state).filter(row => row.inside).length;
      return { id, title: chat.title, username: chat.username ?? '', usernames: activeUsernames(chat.username ? [{ username: chat.username, active: true }] : []), bio: chat.type === 'channel' ? 'Avisos del proyecto.' : '', bioEntities: [], bot: false, memberCount: inside, administratorCount: id === '24' ? 1 : 0, canViewMembers: true, canManageMembers: false, isForum: chat.isForum === true, verified: false, linkedChatId: '0' };
    }
    if (chat && chat.type === 'private') {
      const known = rosterRows(state).some(row => row.id === id || row.username === chat.username);
      return { id, title: chat.title, username: chat.username ?? '', usernames: activeUsernames(chat.username ? [{ username: chat.username, active: true }] : []), bio: known ? 'Diseño y documentación.' : '', bioEntities: [], bot: !!chat.bot, groupCount: known ? 2 : 0, phone: '', premium: false, verified: false, blocked: designIsBlocked(id), presence: peerPresence(known ? { kind: 'recently' } : undefined, Math.floor(Date.now() / 1000)) };
    }
    // La persona que llegó por una fila de la lista (`profile.contact`) no es un chat del muestrario: el host la
    // reconstruye con la caché que la propia lista llenó, y aquí se nombra con esa misma fila.
    const person = rosterRows(state).find(row => row.id === id);
    if (person) return { id, title: person.name, username: person.username, usernames: activeUsernames(person.username ? [{ username: person.username, active: true }] : []), bio: '', bioEntities: [], bot: person.bot, groupCount: 2, phone: '', premium: false, verified: false, blocked: false, presence: peerPresence({ kind: 'recently' }, Math.floor(Date.now() / 1000)) };
    return { id, title:'', username:'', usernames:[], bio:'', bioEntities:[], bot:false };
  }
  // Las cinco de la ficha de perfil (rondas BA y BP). En Android las atiende `NativeBridge.java:535-542`; en
  // Windows tienen brazo desde `TelegramService.cs`; aquí se modelan las tres respuestas que la pantalla lee, con las
  // reglas de `peerCard.ts` y sin frase propia.
  if (method === 'profile.related') return designRelated(params, state);
  if (method === 'profile.peer') return designPeer(params, state);
  if (method === 'profile.contact') return designContact(params, state);
  if (method === 'profile.sender') return designSender(params, state);
  if (method === 'clipboard.copy') {
    // El tope de `DesktopClipboard`, que es el de Android (`BridgePolicy.text(p,"text",4096)`): se niega por encima y
    // no se recorta, porque una copia recortada en silencio no es la copia que la persona pidió. La otra frase de esa
    // clase —sin portapapeles— no está aquí, y no es un olvido: al andamio nunca le falta.
    if (state.platform === 'desktop' && String(params.text ?? '').length > CLIPBOARD_MAX_TEXT) throw new Error(CLIPBOARD_REFUSAL);
    return true;
  }
  // En Windows la orden tiene brazo desde la ronda AQ; en Android la atiende TDLib y aquí solo se finge el
  // regreso, que es lo que siempre se hizo.
  if (method === 'contacts.open' && state.platform === 'desktop') return desktopOpenContact(params, state);
  if (method === 'contacts.open') return String(params.id);
  // Las dos escribientes de la ronda BL. Android las atiende en un solo método y Windows en dos brazos; el andamio
  // las modela las dos para las dos plataformas, que es lo que son: las dos capas ya las contestan.
  if (method === 'contacts.add' || method === 'contacts.remove') return designContactWrite(method, params, state);
  // Las dos de la privacidad de la cuenta (ronda BH). El andamio ya no pinta el valor que le mandan: modela la
  // lista de reglas de Telegram, así que `custom` sale de que haya dos bases y `preserved` de las reglas que la
  // interfaz no sabe expresar, igual que en las dos capas. Y niega con las frases de las dos capas.
  if (method === 'privacy.get') return designPrivacyGet();
  if (method === 'privacy.set') return designPrivacySet(params);
  // Las tres del mismo hueco (ronda BI): la lista con su marcador, el desbloqueo que la relee y el bloqueo desde la
  // ficha. El andamio no finge el resultado —quita y pone filas de verdad—, así que «Cargar más bloqueados» y el
  // botón de la ficha se ven trabajar sobre los mismos datos que lee el panel.
  if (method === 'privacy.blocked') return designBlockedPage(params);
  if (method === 'privacy.unblock') return designUnblockSender(params, state);
  if (method === 'profile.block') return designProfileBlock(params, state);
  // Las cuatro del borrado automático (ronda BN). Android las atiende en dos métodos con un booleano y Windows en
  // cuatro brazos, y aquí se modelan las dos lecturas y las dos escrituras sobre una sola tabla mutable: el panel se
  // ve cambiar al releer, que es lo que hace la pantalla después de aplicar.
  if (method === 'privacy.autoDelete') return designAutoDeleteGet(params, state, false);
  if (method === 'chat.autoDelete') return designAutoDeleteGet(params, state, true);
  if (method === 'privacy.autoDelete.set') return designAutoDeleteSet(params, state, false);
  if (method === 'chat.autoDelete.set') return designAutoDeleteSet(params, state, true);
  if (method === 'history.byDate') return designHistoryDate(params, state);
  if (method === 'chat.saved') return designRequest('chat.open', { id:'1' });
  if (method === 'chats.search') {
    const scope = params.scope === 'public' ? 1 : 0;
    const query = normalizeSearch(String(params.query || ''));
    // Las dos filas de siempre siguen filtrando por alcance; las tres de resultados de ingreso se
    // encuentran por título, que es como una persona llega a ellas desde la barra de búsqueda.
    const pool = [...lookupChats, ...lookupFixtures];
    return pool.filter((chat, index) => (index > 1 || index === scope) && normalizeSearch(chat.title + ' ' + (chat.username ?? '')).includes(query));
  }
  if (method === 'saved.sources') return designPage([
    { id: '14', title: 'WRGram · Comunidad', preview: 'Ideas para la siguiente edición', date: serviceSeed, pinned: true },
    { id: '1', title: 'Mis notas', preview: 'Revisar el prototipo', date: serviceSeed - 1800, pinned: false },
    { id: '-24', title: 'Autor oculto', preview: 'Mensaje reenviado', date: serviceSeed - 7200, pinned: false },
  ], params.cursor);
  if (method === 'saved.history') return designPage(savedItems.filter(item => item.origin === params.id), params.cursor);
  if (method === 'gallery.list') {
    const from = Number(params.from) || 0, until = Number(params.until) || Infinity;
    return designPage(galleryItems.filter(item => item.chatId === params.id && item.date >= from && item.date < until &&
      (item.filter === params.filter || (params.filter === 'photoVideo' && ['photos', 'videos'].includes(item.filter)))), params.cursor);
  }
  if (method === 'chats.more') { acceptState({ ...state, chatsEnd:true }); return true; }
  if (method === 'thread.load') {
    const root = String(params.messageId), before = String(params.before ?? '0');
    const all = threadComments[root] || [];
    const older = (a: string, b: string) => a.length - b.length || (a < b ? -1 : 1);
    return { chatId: '23', threadId: '9001', comments: all.length, unread: 0, messages: before === '0' ? all : all.filter(message => older(message.id, before) < 0), next: false };
  }
  if (method === 'chat.requests') {
    joinCommunity(params, state);
    const marker = String(params.cursor ?? '');
    if (joinCursorProblem(marker)) throw new Error(JOIN_REFUSALS.cursor);
    // En Android la posición se compara con la memoria de la sesión (`:3513-3517`); en Windows viaja como
    // argumento y lo único que puede faltar es el `access_hash` de esa persona, que solo llega con la página que
    // la pantalla ya vio. Las dos pérdidas se dicen con la misma frase, y aquí la cola hace de esa caché.
    let start = 0;
    if (marker !== '') {
      const index = joinQueue.findIndex(item => `${item.userId}:${item.date}` === marker);
      if (index < 0) throw new Error(JOIN_REFUSALS.gone);
      start = index + 1;
    }
    const slice = joinQueue.slice(start, start + 20);
    const last = slice[slice.length - 1];
    // «Hay más» es la página llena (`JoinRequests.page:35`, `values.length() >= PAGE`), no el cálculo de lo que
    // queda: ninguna de las dos capas sabe cuántas solicitudes hay detrás de la última fila que trajo.
    const next = slice.length >= 20;
    return { total: joinQueue.length, requests: slice, next, cursor: next && last ? `${last.userId}:${last.date}` : '' };
  }
  if (method === 'chat.request.answer') {
    joinCommunity(params, state);
    // `:3563`: la cuenta que contesta ya no es la que abrió la cola → `false` y la pantalla no oye un error.
    if (typeof params.accountId === 'string' && params.accountId !== state.selfId) return false;
    const desktop = state.platform === 'desktop';
    const userId = typeof params.userId === 'string' ? params.userId : '';
    const strict = JOIN_ID.test(userId);
    const approve = typeof params.approve === 'boolean' ? params.approve : null;
    if (desktop && !strict) throw new Error(JOIN_REFUSALS.badId);
    if (desktop && approve === null) throw new Error(JOIN_REFUSALS.missingApprove);
    if (strict && (userId === '0' || userId === state.selfId)) throw new Error(JOIN_REFUSALS.self);
    const index = joinQueue.findIndex(item => item.userId === userId);
    // Sin fila no hay hash, y sin hash el cable de Windows no puede armar el `InputUser`: es la negación que la
    // ronda AZ ya pronuncia para las cuatro escrituras de miembro. En Android esta causa no existe —TDLib no
    // pierde ningún hash— y el fallo lo daría Telegram con su propio mensaje, que este andamio no inventa.
    if (index < 0) {
      if (desktop) throw new Error(SANCTION_REFUSALS.needsHash);
      return true;
    }
    joinQueue.splice(index, 1);
    return true;
  }
  if (method === 'chat.invite') {
    // `createInviteLink` (`NativeBridge.java:1907`) hecho andamio: sin formulario, con el nombre fijo, siete días y
    // sin límite, y la respuesta `true` de siempre —el enlace no viaja a la pantalla, que en Windows lo ve en la caja
    // de la ventana del host y en Android en su hoja de compartir. La negativa de forma es la frase de Java, dicha
    // aquí aunque la puerta del menú ya la filtre: es lo único que se puede afirmar sin red. Del derecho no hay fila
    // que lo niegue, por la misma razón que en `groupPermissionFixtures` —esta cuenta es administradora en todas las
    // comunidades de la vista—, así que ese cortafuegos se sujeta por aguja en el código, no por fila.
    const chat = state.chats.find(item => item.id === String(params.id));
    if (!chat || !(chat.supergroup === true || chat.type === 'group' || chat.type === 'channel'))
      throw new Error('Los enlaces de invitación solo se crean para grupos y canales.');
    const now = Math.floor(Date.now() / 1000);
    activeLinks.unshift({ link: `https://t.me/+quick${++linkSequence}`, name: 'WRGram', creator: '1001', created: now, edited: 0, expires: now + 7 * 24 * 60 * 60, memberLimit: 0, memberCount: 0, pending: 0, approval: false, primary: false, revoked: false, paid: false });
    return true;
  }
  if (method === 'chat.invitelinks') {
    const pool = params.revoked ? revokedLinks : activeLinks;
    const marker = String(params.cursor ?? '');
    const start = marker ? Math.max(0, pool.findIndex(item => `${item.created}:${item.link}` === marker) + 1) : 0;
    const slice = pool.slice(start, start + 20);
    const more = slice.length === 20 && start + slice.length < pool.length;
    const last = slice[slice.length - 1];
    return { total: pool.length, links: slice, revoked: !!params.revoked, cursor: more && last ? `${last.created}:${last.link}` : undefined, next: more };
  }
  if (method === 'chat.invitelink.create') {
    const now = Math.floor(Date.now() / 1000);
    activeLinks.unshift({ link: `https://t.me/+new${++linkSequence}`, name: String(params.name ?? ''), creator: '1001', created: now, edited: 0, expires: Number(params.expiresIn ?? 0) ? now + Number(params.expiresIn) : 0, memberLimit: Number(params.memberLimit ?? 0), memberCount: 0, pending: 0, approval: !!params.approval, primary: false, revoked: false, paid: false });
    return true;
  }
  if (method === 'chat.invitelink.edit') {
    const index = activeLinks.findIndex(item => item.link === String(params.link));
    if (index < 0) throw new Error('Telegram ya no reconoce ese enlace en este chat.');
    if (activeLinks[index].primary) throw new Error('El enlace principal no admite nombre, caducidad ni límite: revócalo y Telegram creará uno nuevo.');
    if (activeLinks[index].paid) throw new Error('Los enlaces de suscripción se administran desde Stars.');
    const now = Math.floor(Date.now() / 1000);
    activeLinks[index] = { ...activeLinks[index], name: String(params.name ?? ''), edited: now, expires: Number(params.expiresIn ?? 0) ? now + Number(params.expiresIn) : 0, memberLimit: Number(params.memberLimit ?? 0), approval: !!params.approval };
    return true;
  }
  if (method === 'chat.invitelink.revoke') {
    const index = activeLinks.findIndex(item => item.link === String(params.link));
    if (index < 0) throw new Error('Telegram ya no reconoce ese enlace en este chat.');
    const [gone] = activeLinks.splice(index, 1);
    revokedLinks.unshift({ ...gone, revoked: true });
    return true;
  }
  if (method === 'chat.safety') {
    const key = String(params.id);
    const data = safetyFixtures[key];
    return data ? { id: key, ...data } : { id: key, signals: [], canReport: false, dismissible: false };
  }
  if (method === 'chat.safety.dismiss') {
    const key = String(params.id);
    const data = safetyFixtures[key];
    if (!data?.dismissible) throw new Error('Telegram ya no muestra ningún aviso en este chat.');
    // El puente nativo responde false cuando la cuenta cambió o se canceló el diálogo: la barra sigue ahí.
    if (String(params.accountId ?? '') !== state.selfId) return false;
    delete data.notice;
    data.dismissible = false;
    acceptState({ ...state, chats: state.chats.map(chat => chat.id === key ? { ...chat, notice: undefined } : chat) });
    return true;
  }
  if (method === 'notify.scopes') {
    return { scopes: Object.values(scopeFixtures).map(item => ({ ...item })), sounds: savedSounds.map(sound => ({ ...sound })) };
  }
  if (method === 'notify.scope.save') {
    const key = String(params.scope ?? '');
    const current = scopeFixtures[key];
    if (!current) throw new Error('Ese tipo de chat no corresponde a ninguno de los ajustes de Telegram.');
    // El puente nativo responde false al cambiar de cuenta o cancelar el diálogo: no es un error.
    if (String(params.accountId ?? '') !== state.selfId) return false;
    const patch = (params.patch ?? {}) as ScopePatch;
    const problem = patchProblem(patch, savedSounds);
    if (problem) throw new Error(problem);
    if (!pendingChanges(current, patch, savedSounds).length) throw new Error('No hay ningún ajuste que cambiar.');
    // La fusión es la misma que hace Java: se parte de lo leído y solo viaja lo tocado.
    const next = effective(current, patch);
    scopeFixtures[key] = next;
    return next;
  }
  if (method === 'chats.list') {
    const archive=params.list==='archive';
    // Windows vuelve a pedir los diálogos a Telegram, donde la escritura que hizo el menú ya quedó
    // registrada; el andamio no tiene servidor, así que parte de las filas que ya conoce —con sus
    // marcas vivas— y solo del fixture toma las que nunca se tocaron en esta sesión.
    const known = new Map(state.chats.map(chat => [chat.id, chat]));
    acceptState({ ...state, chatsEnd:archive, chats:fixture.chats.map(source => {
      const chat = known.get(source.id) ?? source;
      return { ...chat, inList:chat.archived===archive, ...(chat.id==='24'?{requests:joinQueue.length}:{}) };
    }) });
    return true;
  }
  if (method === 'chat.open') {
    const id = String(params.id);
    const existing = state.chats.find(item => item.id === id);
    const discovered = [...lookupChats, ...lookupFixtures].find(item => item.id === id);
    const base = poolOf(id);
    const at=params.messageId?base.findIndex(message=>message.id===params.messageId):-1;
    const firstUnread=id==='21'&&existing?.unread?base.findIndex(message=>Number(message.id)>Number(existing.readInbox)): -1;
    const from=at>=0?Math.max(0,at-4):firstUnread>=0?Math.max(0,firstUnread-4):0;
    const end=at>=0?Math.min(base.length,at+5):firstUnread>=0?Math.min(base.length,firstUnread+14):base.length;
    acceptState({
      ...state, active: id, canSend: id === '11' || id === '1',
      chats: !existing && discovered ? [...state.chats, discovered] : state.chats,
      topic: { id: 0, name: '', closed: false },
      messages:base.slice(from,end),
      history:{loading:false,error:'',end:from===0,latest:end===base.length,anchor:'0'},
    });
    return true;
  }
  if (method === 'chat.read') {
    const id=state.active;
    const seen=Number(params.messageId)||Math.max(0,...state.messages.filter(message=>!message.outgoing).map(message=>Number(message.id)));
    if(id==='0'||!seen)return false;
    const count=(id==='21'?longHistory:state.messages).filter(message=>!message.outgoing&&Number(message.id)>seen).length;
    if(state.topic?.id)acceptState({...state,topic:{...state.topic,readInbox:String(seen),unread:count}});
    else acceptState({...state,chats:state.chats.map(chat=>chat.id===id?{...chat,readInbox:String(seen),unread:count}:chat)});
    return true;
  }
  if(method==='history.newer'&&state.active==='21'){
    const last=Number(state.messages.at(-1)?.id);
    const next=longHistory.filter(message=>Number(message.id)>last).slice(0,18);
    acceptState({...state,messages:[...state.messages,...next],history:{...state.history,latest:next.at(-1)?.id===longHistory.at(-1)?.id}});
    return true;
  }
  if(method==='history.older')return false;
  if (method === 'chat.close') { acceptState({ ...state, active: '0', topic: { id: 0, name: '', closed: false }, messages: [] }); return true; }
  // `messages.search` reproduce el marcador del puente: resultados del historial completo, de más nuevo
  // a más viejo, en páginas cortas, y con las mismas negaciones de `MessageSearch.java` porque las
  // evalúa la misma capa TypeScript que lee Android. Cambiar cualquier criterio descarta el cursor,
  // igual que hace el puente cuando `MessageSearch.same` detecta que ya es otra búsqueda.
  if (method === 'messages.search' || method === 'messages.search.more') {
    const text = normalizeSearch(String(params.query ?? '').trim());
    const filter = String(params.filter ?? '');
    const sender = String(params.sender ?? '').trim();
    const from = Number(params.from ?? 0) || 0;
    const until = Number(params.until ?? 0) || 0;
    if (filter !== '' && !(filter in SEARCH_MEDIA)) throw new Error('Filtro de búsqueda no válido.');
    if (params.global) {
      if (hasBand(sender, from, until)) throw new Error(REJECTIONS.globalBand);
      const hits = globalPool().filter(message => !message.service && matchesSearch(message, text, filter));
      const offset = Math.max(0, Number(params.offset ?? 0) || 0);
      const page = hits.slice(offset, offset + SEARCH_PAGE);
      return { messages: page, nextOffset: offset + page.length < hits.length ? String(offset + page.length) : '', total: hits.length } satisfies GlobalSearch;
    }
    const verdict = problem(sender, from, until, state.chats.find(item => item.id === state.active));
    if (verdict) throw new Error(verdict);
    const hits = poolOf(state.active)
      .filter(message => !message.service && matchesSearch(message, text, filter) && matchesAuthor(message, sender))
      .filter(message => (from === 0 || message.date >= from) && (until === 0 || message.date < until))
      .reverse();
    const key = [state.active, text, sender, filter, from, until].join('¦');
    if (method === 'messages.search') designSearch = { key, next: 0 };
    const cursor = designSearch;
    if (!cursor || cursor.key !== key) throw new Error('Vuelve a buscar para continuar.');
    const page = hits.slice(cursor.next, cursor.next + SEARCH_PAGE);
    designSearch = { key, next: cursor.next + page.length };
    return method === 'messages.search.more' || params.page ? { messages: page, next: designSearch.next < hits.length } : page;
  }
  // Las búsquedas guardadas viven en memoria de la pestaña con las mismas reglas y las mismas frases
  // del puente, incluido el tope de 20 filtros por cuenta.
  if (method === 'search.filters.list') return savedSearches;
  if (method === 'search.filters.delete') { savedSearches = savedSearches.filter(item => item.id !== bridgeText(params.id, 24)); return savedSearches; }
  if (method === 'search.filters.save') {
    if (savedSearches.length >= 20) throw new Error('Puedes guardar hasta 20 filtros de búsqueda.');
    const name = bridgeText(params.name, 32).trim();
    if (name === '') throw new Error('Escribe un nombre para el filtro.');
    const query = bridgeText(params.query, 100).trim();
    const filter = bridgeText(params.filter, 16);
    if (filter !== '' && !(filter in SEARCH_MEDIA)) throw new Error('Filtro de búsqueda no válido.');
    const mode = bridgeText(params.mode, 8);
    if (mode !== 'chat' && mode !== 'global') throw new Error('El modo del filtro no es válido.');
    if (query.length < 2 && filter === '') throw new Error('La búsqueda necesita texto o un filtro.');
    const chatId = params.chatId === undefined ? '' : bridgeText(params.chatId, 24);
    const max = savedSearches.reduce((best, item) => (/^f[0-9]{1,6}$/.test(item.id) ? Math.max(best, Number(item.id.slice(1))) : best), 0);
    savedSearches = [...savedSearches, { id: `f${max + 1}`, name, query, filter, mode, ...(chatId === '' ? {} : { chatId }) }];
    return savedSearches;
  }
  // Un envío sin confirmar se reintentar y se quita como en el puente: el estado lo decide el propio
  // fixture, así que la vista de diseño recorre las mismas cuatro salidas (hecho, cancelado, rechazado).
  if (method === 'message.retry') {
    const item = state.messages.find(message => message.id === String(params.id));
    if (!item?.unsent) throw new Error('El mensaje ya no está cargado. Vuelve a abrir la conversación.');
    if (item.unsent.pending) throw new Error('Telegram sigue intentando enviar este mensaje. Espera a que termine antes de repetirlo.');
    if (!item.unsent.canRetry) throw new Error('Telegram no admite reintentar este mensaje.');
    acceptState({ ...state, messages: state.messages.map(message => message.id === item.id ? { ...message, status: 'pending', unsent: { ...message.unsent!, pending: true, telegram: '', canRetry: false, wait: 0 } } : message) });
    return true;
  }
  if (method === 'message.unsent.delete') {
    const item = state.messages.find(message => message.id === String(params.id));
    if (!item?.unsent) throw new Error('Este mensaje ya está en Telegram; usa sus opciones para borrarlo.');
    acceptState({ ...state, messages: state.messages.filter(message => message.id !== item.id) });
    return true;
  }
  // Las tres ramas de borrado y las dos de reenvío solo existen cuando la pantalla simula Windows; en Android
  // y en la web siguen cayendo al final, donde se dice que hace falta una cuenta real. Así el andamio no se
  // inventa un puente que el teléfono todavía resuelve por TDLib.
  if (method === 'message.properties' && state.platform === 'desktop') return desktopProperties(String(params.id), state);
  // Fuera de Windows el espejo también contesta, pero con la lista de fichas: es lo que el puente de Android
  // saca de TDLib, y sin él el menú del andamio no se abría.
  if (method === 'message.properties') return designProperties(String(params.id), state);
  if (method === 'message.delete' && state.platform === 'desktop') return desktopDelete([String(params.id)], params.revoke === true, state);
  if (method === 'messages.delete' && state.platform === 'desktop') return desktopDelete(Array.isArray(params.ids) ? params.ids : [], params.revoke === true, state);
  if (method === 'message.forward' && state.platform === 'desktop') return desktopForward([String(params.id)], params, state);
  if (method === 'messages.forward' && state.platform === 'desktop') return desktopForward(Array.isArray(params.ids) ? params.ids : [], params, state);
  // El fijado entra por la misma puerta: la rama solo existe cuando la pantalla simula Windows, donde el host
  // decide con la forma del chat; en Android la decide TDLib con `canBePinned` y aquí seguiría cayendo abajo.
  if (method === 'message.pin' && state.platform === 'desktop') return desktopPin(params, state);
  // Las dos caras de la edición entran por la misma puerta que el fijado: la rama solo existe en Windows, donde
  // el puente decide con la autoría y los derechos del canal.
  if (method === 'message.edit' && state.platform === 'desktop') return desktopEdit(params, state, false);
  if (method === 'message.edit.caption' && state.platform === 'desktop') return desktopEdit(params, state, true);
  // Abrir el mapa también entra por la puerta de Windows: en Android lo resuelve la activity con el intent de
  // `openMessageLocation`, y aquí solo hay espejo del host.
  if (method === 'message.location.open' && state.platform === 'desktop') return desktopOpenLocation(params, state);
  // Las dos escrituras de reacción entran por la puerta de Windows con el orden del host. En Android las atiende
  // TDLib y el espejo no tiene con qué, así que siguen cayendo en la negativa del final.
  if (method === 'message.react' && state.platform === 'desktop') return desktopReact(params, state, false);
  if (method === 'message.react.custom' && state.platform === 'desktop') return desktopReact(params, state, true);
  // La de pago sí se niega, y no por la biblioteca: la petición está, el gasto también, y en Windows no hay
  // saldo que leer ni cargo reversible que ofrecer. Es la frase del host, no un hueco del espejo.
  if (method === 'message.react.paid' && state.platform === 'desktop') throw new Error(REACT_REFUSALS.paid);
  if (method === 'message.react' && !params.remove && !DESIGN_REACTIONS.some(option => option.kind === 'emoji' && option.emoji === String(params.emoji ?? ''))) throw new Error('Telegram no ofrece esa reacción en este chat.');
  // El borrador se guarda como en el puente: texto, formato y cita en el mismo objeto. Si el fixture
  // no conoce el mensaje citado, se guarda solo el texto y se devuelve la misma `note` de Telegram.
  // Escribir en la vista de diseño también avisa a Telegram: aquí se responde sin simular presencia.
  if (method === 'typing') return true;
  if (method === 'draft.set') {
    const text = String(params.text ?? '');
    const entities = Array.isArray(params.entities) ? params.entities as TextEntity[] : [];
    const cited = params.reply === undefined || params.reply === '0' ? '' : String(params.reply);
    const topicId = Number(params.topicId ?? 0);
    const known = cited === '' || state.messages.some(message => message.id === cited);
    const kept = known ? cited : '';
    if (topicId) acceptState({ ...state, topic: { ...(state.topic ?? { id: topicId, name: 'Tema', closed: false }), draft: text, draftEntities: entities, draftReply: kept || undefined } });
    else acceptState({ ...state, chats: state.chats.map(chat => chat.id === String(params.chatId) ? { ...chat, draft: text || undefined, draftEntities: entities.length ? entities : undefined, draftReply: kept || undefined } : chat) });
    return known ? { reply: kept } : { reply: '', note: 'Telegram no aceptó la respuesta citada. El borrador se guardó sin ella.' };
  }
  if (method === 'contacts.sync.status') return syncState;
  if (method === 'contacts.sync.set') { syncState = { ...syncState, enabled: Boolean(params.value) }; return syncState; }
  if (method === 'contacts.sync.now') { syncState = { ...syncState, last: Math.floor(Date.now()/1000), matched: 12, imported: 24, skipped: false, error: '' }; return syncState; }
  let offered: GroupAdminRights | undefined;
  if (method === 'groups.members' || method === 'groups.members.page') {
    // El espejo de `DesktopGroupMembers` con el orden de su cable (`DesktopGroupRosterFlow.GroupMembersAsync`):
    // forma del chat, largo de la búsqueda y validez del filtro. Android hace las mismas tres comprobaciones dentro
    // de `NativeBridge.groupMembers` y el andamio ya las modela con sus propias frases; estas solo caen en
    // escritorio, que es donde el puente las dice con palabras distintas.
    if (state.platform === 'desktop') {
      const chat = state.chats.find(item => item.id === String(params.id));
      if (!isSupergroupOrChannel(chat)) throw new Error(DESKTOP_MEMBER_REFUSALS.notCommunity);
      const tooLong = desktopMemberQueryProblem(String(params.query ?? ''));
      if (tooLong) throw new Error(tooLong);
      if (method === 'groups.members.page') {
        const badFilter = desktopMemberFilterProblem(String(params.filter || 'recent'));
        if (badFilter) throw new Error(badFilter);
      }
      // Y la lista de casillas que la pantalla va a ofrecer, que en Windows es `Actor.Available` sobre este mismo
      // chat: la puerta del tipo de chat ya aplicada. Sin esto el andamio enseñaría «Administrar temas del foro»
      // en un grupo que no es foro y el puente lo rechazaría con la frase de la ronda AZ.
      offered = availableRights(chat?.type === 'channel', chat?.isForum === true);
    }
  }
  if (method === 'groups.members') return offered ? groupMembers.map(row => ({ ...row, adminRights: offered })) : groupMembers;
  if (method === 'groups.members.page') { const filter = String(params.filter || 'recent'); const query = String(params.query || '').toLowerCase(); const members = groupMembers.filter(member => (!query || member.name.toLowerCase().includes(query)) && (filter === 'recent' || (filter === 'administrators' ? member.status === 'Administrador' : filter === 'banned' ? member.banned : filter === 'restricted' ? member.restricted : filter === 'bots' ? member.bot : true))).map(row => (offered ? { ...row, adminRights: offered } : row)); return { members, nextOffset: members.length, hasMore: false }; }
  if (method === 'groups.member.ban') {
    // Un básico se modela aquí mismo: sin plazo, con la lista cambiando de estado y con los mismos
    // descartes que hace el puente antes de escribir (`banishProblem`), no con un `true` cómodo.
    const chat = state.chats.find(item => item.id === String(params.id));
    if (!chat || chat.type !== 'group' || chat.supergroup === true) {
      // Fuera del básico manda `DesktopMemberSanctionFlow`, conectado en Windows por la ronda AZ: la pantalla
      // vuelve a pintar sus botones y el andamio reproduce las tres fases con las mismas frases del puente.
      if (state.platform === 'desktop') return desktopSanction(params, state, false);
      return true;
    }
    if (Number(params.duration ?? 0) !== 0) throw new Error(BAN_ACTIONS.noDuration);
    const userId = String(params.userId);
    const row = rosterRows(state).find(item => item.id === userId);
    const problem = row ? banishProblem(row) : BAN_ACTIONS.outside;
    if (problem) throw new Error(problem);
    if (!rosterManage(rosterRows(state))) throw new Error(BAN_ACTIONS.noRight);
    banished.add(userId);
    return true;
  }
  if (method === 'groups.member.restrict' || method === 'groups.member.promote' || method === 'groups.member.demote') {
    const chat = state.chats.find(item => item.id === String(params.id));
    if (chat && chat.type === 'group' && chat.supergroup !== true) {
      // En un básico la negación es de Telegram, no de WRGram: es la misma frase en las dos capas.
      throw new Error(method === 'groups.member.restrict' ? BAN_ACTIONS.noRestrict : BAN_ACTIONS.noPromote);
    }
    // Y fuera de él la comunidad, que desde la ronda AZ se escribe en Windows por las mismas tres fases
    // (`DesktopMemberSanctionFlow`), cada una con su frase.
    if (state.platform === 'desktop') {
      if (method === 'groups.member.restrict') return desktopSanction(params, state, true);
      if (method === 'groups.member.promote') return desktopPromote(params, state);
      return desktopDemote(params, state);
    }
    return true;
  }
  if (method === 'groups.member.unban') {
    const chat = state.chats.find(item => item.id === String(params.id));
    if (chat && chat.type === 'group' && chat.supergroup !== true) throw new Error(BAN_ACTIONS.unban);
    if (state.platform === 'desktop') return desktopLift(params, state);
    return true;
  }
  if (method === 'contacts.list') return designContacts;
  if (method === 'contacts.search') {
    // El largo se mide sobre el texto sin recortar, como en `DesktopContact.MaxQuery`: Android lo comprueba dentro de
    // `BridgePolicy.text` antes de mirar si la búsqueda está vacía. Solo atañe al puente de Windows, que es el que lo
    // dice en español; en Android la pantalla ya corta el campo antes de preguntar.
    if (state.platform === 'desktop' && String(params.query ?? '').length > CONTACT_MAX_QUERY) throw new Error(CONTACT_REFUSALS.longQuery);
    const needle = String(params.query || '').toLowerCase();
    return designContacts.filter(item => item.name.toLowerCase().includes(needle) || item.username.toLowerCase().includes(needle));
  }
  if (method === 'groups.add.info') return addPermission(String(params.id), state);
  if (method === 'groups.member.add') {
    // El orden de cortafuegos de `addMembers` (`NativeBridge.java:2199-2215`): el identificador inválido se descarta
    // antes de contar el lote, y el margen se valida escrito o numérico. Al revés, veinticinco personas con un
    // identificador mal escrito oirían «selecciona hasta 20» cuando lo que está mal es un identificador.
    const raw = Array.isArray(params.userIds) ? params.userIds.map(String) : null;
    if (raw === null) throw new Error(ADD_REJECTIONS.empty);
    for (const id of raw) if (!positiveId(id) || !fitsLong(id)) throw new Error(ADD_REJECTIONS.badId);
    const ids = [...new Set(raw)].filter(id => id !== state.selfId);
    const wrong = batchProblem(ids.length);
    if (wrong) throw new Error(wrong);
    const asked = params.forwardLimit === undefined || params.forwardLimit === null ? '' : String(params.forwardLimit);
    if (asked !== '' && !/^[0-9]{1,3}$/.test(asked)) throw new Error(ADD_REJECTIONS.badForward);
    const limit = asked === '' ? 0 : Number(asked);
    const badLimit = forwardProblem(limit);
    if (badLimit) throw new Error(badLimit);
    const permission = addPermission(String(params.id), state);
    if (!permission.allowed) throw new Error(permission.reason || ADD_REJECTIONS.noRight);
    // `forward_limit` «is ignored for supergroups and channels»: fuera de un grupo básico no se promete.
    const results: AddResult[] = [];
    for (const id of ids) {
      const name = designContacts.find(item => item.id === id)?.name ?? `Usuario ${id}`;
      if (groupMembers.some(item => item.id === id)) { results.push({ id, name, state: 'rejected', reason: ADD_REJECTIONS.failed }); continue; }
      // Nuria está en la lista de personas que solo entran con Premium: es el único motivo que la
      // schema sabe decir con palabras, y aquí se ve cómo se lee.
      if (id === '707') { results.push({ id, name, state: 'rejected', reason: ADD_REJECTIONS.premiumWouldAllow }); continue; }
      results.push({ id, name, state: 'added', reason: '' });
      groupMembers.push({ id, name, status: 'Miembro', canBan: true, canRestrict: true, canPromote: true, canDemote: false });
    }
    return { results, stopped: '' };
  }
  if (method === 'groups.createSuper') return { id: '99' };
  if (method === 'groups.members.basic') {
    // La lista entera de un grupo básico: Telegram conserva a quien se fue, así que `listed` e `inside`
    // son dos cifras distintas y el puente las dice separadas en lugar de dar un total optimista.
    const chat = state.chats.find(item => item.id === String(params.id));
    if (!chat || chat.type !== 'group' || chat.supergroup === true) throw new Error(ROSTER_NOTES.unsupported);
    const query = String(params.query ?? '');
    const badQuery = rosterQueryProblem(query);
    if (badQuery) throw new Error(badQuery);
    const rows: RosterMember[] = rosterRows(state);
    const rank = (row: RosterMember) => row.status === ROSTER_STATUS.creator ? 0 : row.status === ROSTER_STATUS.admin ? 1 : row.inside ? 2 : 3;
    const ordered = [...rows].sort((a, b) => rank(a) - rank(b) || Number(a.id) - Number(b.id));
    const inside = ordered.filter(row => row.inside).length;
    const shown = ordered.filter(row => rosterMatches(query, row.name, row.username));
    return {
      members: shown, shown: shown.length, listed: ordered.length, inside, creator: '500',
      note: rosterNote('500', ordered.length, inside), remaining: rosterRemaining(inside), order: ROSTER_NOTES.order,
      manage: rosterManage(rows), scope: BAN_ACTIONS.scope,
    };
  }
  if (method === 'chat.username') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    // El orden es el de `chatUsername` (`:1784`): la fila tiene que existir —en Windows lo decide `RequireEntry`—
    // y después manda la forma, porque en MTProto el nombre público vive en el peer de canal y un grupo básico no
    // tiene de dónde leerlo.
    if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
    if (!isSupergroupOrChannel(chat)) throw new Error(CHAT_USERNAME_REFUSALS.unsupported);
    return { ...chatUsernameEntry(id, state.chats) };
  }
  if (method === 'chat.username.set') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    // El orden de `setChatUsername` (`:1786`), que no es cosmético: forma, tope y patrón del texto y, solo después,
    // el permiso. Adelantar el permiso haría que un nombre de cuarenta caracteres en un chat administrado por otra
    // persona oyera «no tienes permiso» en lugar del exceso que la persona acaba de escribir.
    if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
    if (!isSupergroupOrChannel(chat)) throw new Error(CHAT_USERNAME_REFUSALS.unsupported);
    const malformed = profileUsernameProblem(params.username);
    if (malformed) throw new Error(malformed);
    // Solo el `trim()` del puente: la `@` la quita la pantalla antes de llamar (`App.tsx:386`), así que un
    // «@nombre» que llega hasta aquí —una llamada hecha a mano, otra pantalla— es el nombre malo, igual que en
    // Windows. Aflojarlo en el andamio sería entrenar una vista de diseño que el host real rechaza.
    const username = String(params.username).trim();
    if (!communityEntry(id, state.chats).canChange) throw new Error(CHAT_USERNAME_REFUSALS.noRight);
    applyChatUsername(chatUsernameEntry(id, state.chats), username);
    // El `schedule()` de `:1786`: la bandeja lleva el enlace del chat en su fila, así que el nombre nuevo tiene que
    // verse ahí sin recargar la lista, igual que la ronda AW mueve el título al renombrar.
    acceptState({ ...state, chats: state.chats.map(other => other.id === id ? { ...other, username } : other) });
    return true;
  }
  if (method === 'groups.stats') {
    const chat = state.chats.find(item => item.id === String(params.id));
    // El orden es el de `groups.stats` (`NativeBridge.java:887`) y el de `DesktopGroupStatsFlow.GroupStatsAsync`:
    // primero la fila, luego la forma, y solo entonces la lectura. Lo que se devuelve es el muestrario con los mismos
    // `id` que las dos bibliotecas contestan; la pantalla no sabe de qué capa viene.
    if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
    if (!isSupergroupOrChannel(chat)) throw new Error(STATS_REFUSALS.notCommunity);
    return statsSample(chat.type === 'channel');
  }
  if (method === 'groups.permissions.get') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    // El orden es el de `groupPermissions` (`NativeBridge.java:1912`) y el de `DesktopGroupPermissionsFlow.GroupPermissionsAsync`:
    // la fila, la forma, el derecho propio y la tabla. Cada paso tiene su frase, y adelantar el derecho haría que un
    // grupo básico oyera «no tienes permiso» cuando lo que no tiene es permisos que editar.
    if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
    if (!isSupergroupOrChannel(chat)) throw new Error(GROUP_PERMISSION_REFUSALS.unsupported);
    if (!availableRights(chat.type === 'channel', chat.isForum === true).canRestrictMembers) throw new Error(GROUP_PERMISSION_REFUSALS.noRight);
    const dto = permissionsDto(groupPermissionsEntry(id));
    if (!dto) throw new Error(GROUP_PERMISSION_REFUSALS.unreadable);
    return dto;
  }
  if (method === 'groups.permissions.set') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    // El orden de `setGroupPermissions` (`:2376`): la forma con su frase de escritura, los dieciséis `requiredBool`
    // y el derecho, en ese orden y no en otro. La ventana de confirmar es nativa en las dos capas —`Dialogs.builder`
    // allá, la `MessageBox` del host aquí— y el `false` de cancelarla no existe en la vista sintética, que no tiene
    // ventana que cancelar.
    if (!chat) throw new Error(FOLDER_REFUSALS.loaded);
    if (!isSupergroupOrChannel(chat)) throw new Error(GROUP_PERMISSION_REFUSALS.required);
    const values = completePermissions((params.permissions ?? {}) as Record<string, unknown>);
    if (!values) throw new Error(GROUP_PERMISSION_REFUSALS.incomplete);
    if (!availableRights(chat.type === 'channel', chat.isForum === true).canRestrictMembers) throw new Error(GROUP_PERMISSION_REFUSALS.noRight);
    applyPermissions(groupPermissionsEntry(id), values);
    return true;
  }
  if (method === 'chat.info') {
    const chat = state.chats.find(item => item.id === String(params.id));
    if (chat && !community(chat)) throw new Error(unsupportedNotice);
    return { ...communityEntry(String(params.id), state.chats), maxTitle:LIMITS.title.max, maxDescription:LIMITS.description.max };
  }
  if (method === 'chat.info.set') {
    const chat = state.chats.find(item => item.id === String(params.id));
    if (chat && !community(chat)) throw new Error(unsupportedNotice);
    // El orden es el de `setChatInfo`: los dos topes del puente, luego la validación del campo, luego el permiso,
    // y al final la comparación con lo que Telegram guarda. Inventar otro orden repartiría otras frases.
    if (typeof params.value !== 'string' || params.value.length > COMMUNITY_BRIDGE_MAXIMUM) throw new Error(COMMUNITY_REFUSALS.tooLong);
    if (typeof params.previous !== 'string' || params.previous.length > COMMUNITY_BRIDGE_MAXIMUM) throw new Error(changedNotice);
    const field = String(params.field ?? '');
    if (field !== 'title' && field !== 'description') throw new Error(COMMUNITY_REFUSALS.unknownField);
    const entry = communityEntry(String(params.id), state.chats);
    const value = prepared(params.value), previous = prepared(params.previous);
    const reason = communityProblem(field as CommunityField, value);
    if (reason) throw new Error(reason);
    if (!entry.canChange) throw new Error(noRightNotice);
    if (field === 'description' && !entry.descriptionKnown) throw new Error(unreadableNotice);
    if (previous !== entry[field]) throw new Error(changedNotice);
    entry[field] = value;
    // Renombrar también se ve en la bandeja: Telegram actualiza el título del chat, no solo la ficha.
    if (field === 'title') acceptState({ ...state, chats: state.chats.map(other => other.id === String(params.id) ? { ...other, title: value } : other) });
    return true;
  }
  if (method === 'chat.join') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    // «Private and secret chats can't be joined using this method»: la negación la pone Telegram, no la pantalla.
    if (chat && !community(chat)) throw new Error(MEMBERSHIP_UNSUPPORTED);
    if (chat && chat.inList !== false) throw new Error(INSIDE_NOTICE);
    const answer = membershipOutcomes[id] ?? { state: 'joined', opened: false };
    // Entrar de verdad mueve la fila a la lista, que es lo que vuelve a ofrecer «Salir» al reabrir el menú.
    if (answer.state === 'joined') acceptState({ ...state, chats: state.chats.map(item => item.id === id ? { ...item, inList: true } : item) });
    return answer;
  }
  if (method === 'chat.leave') {
    const id = String(params.id);
    const chat = state.chats.find(item => item.id === id);
    if (chat && !community(chat)) throw new Error(MEMBERSHIP_UNSUPPORTED);
    if (!chat || chat.inList === false) throw new Error(OUTSIDE_NOTICE);
    acceptState({ ...state, chats: state.chats.map(item => item.id === id ? { ...item, inList: false } : item) });
    const owned = ownedChats[id];
    if (!owned) return { state: 'left', opened: false } satisfies ChatMembership;
    // El puente lo confirma con el heredero delante; lo que se ve aquí es el resultado de esa salida.
    return {
      state:'left', opened:false, owner:true,
      when: owned.basic ? MOMENTS.immediate : MOMENTS.sevenDays,
      successor: recipientFixtures[owned.heir]?.name ?? '',
    } satisfies ChatMembership;
  }
  if (method === 'message.link') {
    const id = String(params.id);
    // Las tres guardas, en el orden medido de `NativeBridge.java:786`: la fila del chat abierto, el temporizador y la
    // tarjeta. En Java son cuatro porque el tipo de contenido y la vista previa se comprueban aparte; aquí es la misma
    // mirada a la clase del adjunto, que es lo que hace `DesktopLinkPreview.PageOf`.
    const row = poolOf(state.active).find(item => item.id === id);
    if (!row) throw new Error(INVALID_REQUEST);
    const seen = linkUrls[id];
    if (seen?.ephemeral) throw new Error(INVALID_REQUEST);
    if (!row.preview) throw new Error(INVALID_REQUEST);
    return openLinkedUrl(seen?.url ?? '', !!params.confirmed);
  }
  if (method === 'telegram.link' || method === 'link.open') return openLinkedUrl(String(params.url || ''), !!params.confirmed);
  if (method === 'story.albums.list') return storyAlbums;
  if (method === 'story.albums.create') return { id: 3, name: String(params.name || 'Nuevo álbum') };
  if (method === 'story.albums.rename') return { ...storyAlbums[1], name: String(params.name || storyAlbums[1].name) };
  if (method === 'story.albums.add' || method === 'story.albums.remove' || method === 'story.albums.story.order') return storyAlbums[1];
  if (method === 'story.albums.delete' || method === 'story.albums.order') return true;
  if (method === 'story.albums.stories') return { stories: [], nextOffset: 0, hasMore: false };
  if (method === 'chat.transfer.check' || method === 'chat.transfer') {
    const chat = state.chats.find(item => item.id === String(params.id));
    if (!chat || !community(chat)) throw new Error(UNSUPPORTED);
    if (method === 'chat.transfer.check') return { state:'password', retryAfter:0 };
    const id = String(params.userId);
    if (id === state.selfId) throw new Error(SELF_RECIPIENT);
    const recipient = recipientFixtures[id];
    if (!recipient || !eligible({ ...recipient, self: id === state.selfId })) throw new Error(BAD_RECIPIENT);
    // Entregar la propiedad es lo que devuelve la salida normal: la fila deja de ser de propietaria.
    delete ownedChats[String(params.id)];
    return true;
  }
  if (method === 'forum.topics') return topics;
  if (method === 'forum.open') { const topic = topics.find(item => item.id === Number(params.topicId)); if (!topic) throw new Error('Tema no disponible en la vista sintética.'); acceptState({ ...state, active: String(params.id), topic: { id: topic.id, name: topic.name, closed: topic.closed, unread:topic.unread,readInbox:topic.unread?'103':'112' }, messages: fixture.messages.map(message => ({ ...message, chatId: String(params.id) })) }); return true; }
  if (method === 'forum.close') { acceptState({ ...state, topic: { id: 0, name: '', closed: false }, messages: [] }); return true; }
  if (method === 'forum.create') return { ...topics[1], id: 9, name: String(params.name || 'Nuevo tema'), general: false };
  if (method === 'forum.rename' || method === 'forum.closed' || method === 'forum.delete') return true;
  // El mensaje fijado existe donde existe su fila. La vista de diseño reutiliza las mismas frases en los
  // chats que comparten historial, así que el anclaje se pregunta al pool del chat abierto, no a una lista
  // escrita a mano que se queda desfasada en cuanto cambia el chat de arranque. Desde la ronda AF el id lo
  // guarda `pinnedByChat`, que es lo que el host anota después de fijar y de que Telegram avise.
  if (method === 'chat.pinned') { const anchor = pinnedIdOf(state.active); return anchor ? poolOf(state.active).find(message => message.id === anchor) ?? null : null; }
  // Fijar la conversación en la lista es una orden que las dos capas tienen y no necesita negaciones propias:
  // se escribe la marca en la fila, como hace el host con `Dialog.Flags.pinned` y su respuesta.
  if (method === 'chat.pin') { const value = params.value === true; acceptState({ ...state, chats: state.chats.map(chat => chat.id === String(params.id) ? { ...chat, pinned: value } : chat) }); return true; }
  // Las dos escrituras de lista de la ronda AI, solo en la capa que las escribe aquí: en Android las hace TDLib
  // en el dispositivo y el espejo no tiene con qué, así que se queda con su negativa de siempre.
  if (method === 'chat.archive' && state.platform === 'desktop') return desktopList(params, state, 'archived');
  if (method === 'chat.unread' && state.platform === 'desktop') return desktopList(params, state, 'marked');
  // La lista de fijados no la sabe este esquema, ni el espejo ni el puente: la pantalla la esconde en
  // escritorio, y si alguien la pregunta igualmente se lleva la razón por escrito.
  if (method === 'pinned.list' && state.platform === 'desktop') throw new Error(PIN_REFUSALS.list);
  // La bandeja de programados vuelve a Windows con sus cuatro peticiones conectadas. En Android las resuelve
  // TDLib en el dispositivo y el espejo no tiene con qué, así que se queda con la negativa de siempre.
  if (method === 'scheduled.list' && state.platform === 'desktop') return desktopScheduledList(params, state);
  if (method === 'scheduled.sendNow' && state.platform === 'desktop') return desktopScheduledWrite(params, state, 'now');
  if (method === 'scheduled.reschedule' && state.platform === 'desktop') return desktopScheduledWrite(params, state, 'at');
  if (method === 'scheduled.delete' && state.platform === 'desktop') return desktopScheduledWrite(params, state, 'drop');
  // Elegir un archivo, enviarlo y descartarlo vuelve a Windows con sus tres brazos. En Android los resuelve
  // TDLib contra el selector del sistema y el espejo no tiene con qué elegir, así que se queda con la negativa
  // de siempre.
  if (method === 'attachment.pick' && state.platform === 'desktop') return desktopAttachmentPick(params, state); if (method === 'share.import' && state.platform === 'desktop') return desktopShareImport(params, state);
  if (method === 'attachment.discard' && state.platform === 'desktop') return desktopAttachmentDiscard(params);
  if (method === 'send.attachment' && state.platform === 'desktop') return desktopAttachmentSend(params, state);
  // El álbum es la misma pareja de órdenes con lote: `attachment.album` devuelve un vale por foto y `send.album`
  // los gasta todos de una vez. Aquí también se espejan; solo el selector sigue siendo imposible de simular.
  if (method === 'attachment.album' && state.platform === 'desktop') return desktopAttachmentAlbum(params, state);
  if (method === 'send.album' && state.platform === 'desktop') return desktopAlbumSend(params, state);
  // Leer los textos de cada pieza es una lectura del historial, así que también tiene espejo; en Android la hace
  // TDLib y aquí no hay con qué.
  if (method === 'message.album' && state.platform === 'desktop') return desktopMessageAlbum(params, state);
  // La ronda CT lee la fecha de un mensaje propio en privados y los lectores de un grupo. El andamio no toca
  // Telegram: devuelve la misma forma que las dos capas para que el diálogo se pueda recorrer sin cuenta.
  if (method === 'message.readDate') return designReadReceipts(params, state, false);
  if (method === 'message.viewers') return designReadReceipts(params, state, true);
  // La encuesta son las dos escrituras del mismo subsistema que Windows ya podía hacer con un archivo: mandar un
  // contenido que no es un archivo y votarlo después. En Android las atiende TDLib y el espejo no tiene motor, así
  // que aquí se reproduce la regla, que es lo que hace falta para ver el porcentaje moverse.
  if (method === 'poll.send' && state.platform === 'desktop') return desktopPollSend(params, state);
  if (method === 'poll.answer' && state.platform === 'desktop') return desktopPollAnswer(params, state);
  // Cerrar una encuesta sigue negándose con la causa —la petición no existe en la librería de escritorio— y en
  // Android las atiende TDLib, así que solo se espeja la plataforma de escritorio. Listar votantes ya tiene espejo:
  // lee, y lo que lee el andamio es su propia lista.
  if (method === 'poll.stop' && state.platform === 'desktop') throw new Error(POLL_REFUSALS.noStop);
  if (method === 'poll.voters' && state.platform === 'desktop') return desktopPollVoters(params, state);
  // Compartir un contacto es la escritura de la ronda AP. En el puente de Windows es un adjunto más —
  // `messages.sendMedia` con `InputMediaContact`—, y el espejo añade la misma tarjeta que la sesión lee del eco.
  if (method === 'share.contact' && state.platform === 'desktop') return desktopShareContact(params, state);
  // La ubicación en directo (ronda CB) se parte en dos. Empezar a compartir solo existe en Android: el puente de
  // Windows lee la coordenada de un sensor que su TFM no proyecta, así que el andamio dice su frase con nombre
  // (`DesktopLiveLocation.NoSensor`) en vez de dejarla caer en la puerta genérica de BK —la misma razón por la que
  // `poll.stop` o `chat.photo.delete` tampoco pasan por ella. Detener sí lo hacen las dos capas.
  if (method === 'location.live.start') {
    if (state.platform === 'desktop') throw new Error(LIVE_REFUSALS.noSensor);
    return designLiveLocationStart(params, state);
  }
  if (method === 'location.live.stop') return designLiveLocationStop(params, state);
  // Los fondos de la cuenta (ronda CH-B). La lectura publica los dos huecos del modo, que es lo que hacen las dos
  // capas: Android los saca de su tienda del aviso `UpdateDefaultBackground` y Windows del bit `default_` de la
  // propia lista, y en el andamio salen de la lista mutable de abajo.
  if (method === 'backgrounds.list') return designBackgrounds(params, state);
  // Poner por identificador lo modelan las dos capas. Crear por color solo la escribe el puente de Android —en
  // Windows es la negativa con nombre del host, `DesktopBackgrounds.NoCreate`— y el andamio no calcula el CSS que
  // TDLib devuelve de esa escritura, así que se queda en el rechazo sintético de abajo.
  if (method === 'background.set' && !designCloudColors(params)) return designBackgroundSet(params, state);
  if (method === 'background.set' && state.platform === 'desktop') throw new Error(CLOUD_REFUSALS.noCreate);
  if (method === 'calls.list') return designCallPage(params, state);
  if (method === 'chats.list' || method === 'error.clear') return true;
  throw new Error('Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.');
}

/**
 * La lista de la cuenta con la que trabaja el andamio. Cuatro filas y las cuatro formas que las dos capas saben
 * producir: dos rellenos —uno por modo, cada uno con su marca de elegido—, un estampado con relleno pintable y una
 * imagen sin nada que pintar. Los identificadores son números largos porque así viajan en las dos capas: Android los
 * saca de `String.valueOf(background.id)` y Windows de `DesktopBackgrounds.IdOf`, y la pantalla los devuelve como
 * texto para que JavaScript no los redondee.
 */
let previewBackgrounds: CloudBackground[] = [
  { id: '7080000000000101', name: 'Degradado de serie', dark: false, stock: true, selected: true, kind: 'fill', css: 'linear-gradient(180deg, #f3ead9, #d8c7a3)' },
  { id: '7080000000000102', name: 'Estampado claro', dark: false, stock: true, selected: false, kind: 'pattern', css: '#f6f1e8' },
  { id: '7080000000000103', name: 'Noche lisa', dark: true, stock: true, selected: true, kind: 'fill', css: '#0f1519' },
  { id: '7080000000000104', name: 'Foto de la cuenta', dark: true, stock: false, selected: false, kind: 'wallpaper', css: null },
];

/**
 * Las cinco negativas del host de Windows, copiadas carácter a carácter de `DesktopBackgrounds`. No son invenciones
 * del andamio: las cuatro primeras miden lo que el puente MTProto dice de su propia lista, y `noCreate` es la que
 * nombra el hueco de la librería —la única escritura de un fondo nuevo es `account.uploadWallPaper` y pide un
 * archivo—. La de `NotConfirmed` no está porque es la respuesta `false` de una petición que aquí no se envía.
 */
const CLOUD_REFUSALS = {
  nothing: 'Hay que decir qué fondo elegir o qué colores ponerle.',
  badId: 'El identificador del fondo no vale.',
  noCreate: 'Windows no puede crear un fondo de color: la única forma de escribir uno nuevo es subir una imagen, y aquí no hay imagen que subir.',
  gone: 'Ese fondo ya no está en la cuenta. Vuelve a leer la lista.',
  modeChanged: 'Ese fondo es del otro modo. Vuelve a leer la lista.',
};

/** La forma que el cable de Windows manda de verdad: sin nombre y sin marca de serie, porque MTProto no los tiene. */
function cloudRowsOf(platform?: string): CloudBackground[] {
  return platform === 'desktop' ? previewBackgrounds.map(row => ({ ...row, name: '', stock: null })) : previewBackgrounds;
}

/**
 * Los dos huecos del estado, escritos con la lista tal cual está: `DesktopBackgroundsFlow.cs:88-91` y el almacén de
 * Android publican lo mismo, y la raíz de `App.tsx` solo pinta el del modo resuelto.
 */
function publishCloudSlots(state: State, platform?: string) {
  const rows = cloudRowsOf(platform);
  acceptState({
    ...state,
    appearance: {
      ...state.appearance,
      accountBackgrounds: { light: rows.find(row => row.selected && !row.dark), dark: rows.find(row => row.selected && row.dark) },
    },
  });
}

/** `backgrounds.list` en las dos capas: primero publica los huecos y después contesta solo el modo pedido. */
function designBackgrounds(params: Record<string, unknown>, state: State): { rows: CloudBackground[] } {
  const dark = params.dark === true;
  publishCloudSlots(state, state.platform);
  return { rows: cloudRowsOf(state.platform).filter(row => row.dark === dark) };
}

/**
 * La rama de colores de `background.set`: la que en Windows se niega por su nombre y la que en Android escribe un
 * fondo nuevo que el andamio no sabe pintar, porque el CSS lo devuelve TDLib en la fila.
 */
function designCloudColors(params: Record<string, unknown>) {
  return String(params.id ?? '').trim().length === 0 && String(params.top ?? '').trim().length > 0;
}

/**
 * El orden es el del host (`DesktopBackgroundsFlow.cs:70-85`), no el de la conveniencia: la ausencia de las dos
 * cosas, el identificador que no es número, el fondo que ya no está y el que es del otro modo. La confirmación de
 * `account.installWallPaper` se salta porque aquí no hay petición que pueda devolver `false`.
 */
function designBackgroundSet(params: Record<string, unknown>, state: State): CloudBackground {
  const raw = String(params.id ?? '').trim();
  if (raw.length === 0) throw new Error(CLOUD_REFUSALS.nothing);
  if (!/^\d+$/.test(raw)) throw new Error(CLOUD_REFUSALS.badId);
  const dark = params.dark === true;
  const found = cloudRowsOf(state.platform).find(row => row.id === raw);
  if (found === undefined) throw new Error(CLOUD_REFUSALS.gone);
  if (found.dark !== dark) throw new Error(CLOUD_REFUSALS.modeChanged);
  previewBackgrounds = previewBackgrounds.map(row =>
    row.dark === found.dark ? { ...row, selected: row.id === raw } : row);
  publishCloudSlots(state, state.platform);
  return cloudRowsOf(state.platform).find(row => row.id === raw) as CloudBackground;
}

/** La compartida abierta que ve el andamio: una fila propia, viva y con cuenta atrás sin gastar. */
function liveShareOf(state: State) {
  return state.messages.find(message => {
    const card = message.extra;
    return message.outgoing && card?.kind === 'location' && card.live === true && (card.expiresAt ?? 0) > 0;
  });
}

/**
 * Lo que `startLiveLocation` contesta desde `livePermissionResult` (`NativeBridge.java:4867`): la fila escrita con su
 * `id`, su `chatId` y el instante en que deja de renovarse, en segundos de epoch como `LiveLocationPolicy.expiresAt` (`LiveLocationPolicy.java:87-90`). El andamio
 * no simula el sensor ni el diálogo nativo de confirmación; pinta la tarjeta que queda después de aceptar, que es lo
 * que la pantalla necesita para enseñar el botón «Dejar de compartir».
 */
function designLiveLocationStart(params: Record<string, unknown>, state: State): LiveStart {
  const period = Number(params.period);
  // El orden es el del puente, no el de la conveniencia: `NativeBridge.java:4829` niega la compartida que ya está
  // abierta antes de que `NativeBridge.java:4831` mire el periodo, así que con las dos cosas malas a la vez la
  // pantalla tiene que oír «Ya estás compartiendo…» y no la cota de duración.
  if (liveShareOf(state)) throw new Error(LIVE_REFUSALS.already);
  if (!LIVE_DURATIONS.some(item => item.period === period)) throw new Error(LIVE_REFUSALS.badPeriod);
  const now = Math.floor(Date.now() / 1000);
  const sent: Message = {
    id: String(Math.max(0, ...poolOf(state.active).map(message => Number(message.id) || 0)) + 1),
    chatId: state.active, sender: 'Tú', text: '', date: now,
    outgoing: true, status: 'sent', edited: false, reactions: [],
    extra: { kind: 'location', title: 'Ubicación en vivo', address: '', latitude: 40.416775, longitude: -3.70379,
      live: true, expiresAt: now + period, canOpen: true, canStop: true },
  };
  sentLive.push(sent);
  acceptState({ ...state, messages: [...state.messages, sent] });
  const card = sent.extra as { kind: 'location'; expiresAt: number };
  return { id: sent.id, chatId: sent.chatId, expiresAt: card.expiresAt };
}

/**
 * El `EditMessageLiveLocation` sin punto (`stopLiveLocation`, `NativeBridge.java:4922`, y en Windows el bit `stopped` de
 * `DesktopLiveLocation.Stopped`): la tarjeta sigue ahí, pero la cuenta atrás se apaga y el botón desaparece. El orden
 * de las dos negativas es el del puente, no un capricho: primero si la fila es una compartida propia y abierta en el
 * chat leído, y solo después si todavía le quedaba tiempo.
 */
function designLiveLocationStop(params: Record<string, unknown>, state: State): boolean {
  const id = String(params.id ?? '');
  const row = state.messages.find(message => message.id === id);
  const card = row?.extra;
  if (!row || card?.kind !== 'location' || card.live !== true || !row.outgoing || row.chatId !== state.active) {
    throw new Error(LIVE_REFUSALS.notSharing);
  }
  if (!card.expiresAt) throw new Error(LIVE_REFUSALS.gone);
  // La copia del historial se apaga a la vez que la fila en pantalla: si no, al volver a abrir el chat la tarjeta
  // reviviría con su cuenta atrás y el botón de dejar de compartir volvería sobre una ubicación ya parada.
  const stored = sentLive.find(item => item.id === id && item.chatId === state.active);
  if (stored?.extra) stored.extra = { ...card, expiresAt: 0, canStop: false };
  acceptState({
    ...state,
    messages: state.messages.map(message =>
      message.id === id ? { ...message, extra: { ...card, expiresAt: 0, canStop: false } } : message),
  });
  return true;
}
const adminRights: GroupAdminRights = { canChangeInfo:true, canPostMessages:false, canEditMessages:true, canDeleteMessages:true, canInviteUsers:true, canRestrictMembers:true, canPinMessages:true, canManageTopics:true, canPromoteMembers:false, canManageVideoChats:false, canPostStories:true, canEditStories:false, canDeleteStories:false, canManageDirectMessages:false, canManageTags:false, canSendWelcomeMessages:false };
const groupMembers: GroupMember[] = [
  { id: '501', name: 'Álex Moreno', status: 'Administrador', canBan: false, canPromote: false, canDemote: true, canEditRights: true, currentRights: adminRights, adminRights },
  { id: '502', name: 'María Fernández', status: 'Miembro', canBan: true, canRestrict: true, canPromote: true, canDemote: false, adminRights },
  { id: '503', name: 'Sofía López', status: 'Restringido', canBan: true, canUnban: true, canRestrict: true, canPromote: false, canDemote: false, restricted: true, until: Math.floor(Date.now()/1000)+86400, adminRights },
  { id: '504', name: 'Bot de moderación', status: 'Miembro', bot: true, canBan: true, canRestrict: true, canPromote: false, canDemote: false },
];
// Personas que la cuenta podría añadir. Dos de ellas ya están dentro del grupo, y una solo entra con
// Premium: la tanda devuelve los tres estados que Telegram puede dar, no un «todo bien».
const designContacts: Contact[] = [
  { id: '502', name: 'María Fernández', username: 'maria_fdz', bot: false },
  { id: '503', name: 'Sofía López', username: 'sofialopez', bot: false },
  { id: '707', name: 'Nuria Cabrera', username: 'nuria_c', bot: false },
  { id: '712', name: 'Iván Sotelo', username: 'ivansi', bot: false },
  { id: '718', name: 'Héctor Vidal', username: '', bot: false },
  { id: '721', name: 'Ariadna Sol', username: 'ariadna_sol', bot: false },
];
const banished = new Set<string>();
/**
 * La lista entera que `GetBasicGroupFullInfo` devolvería para el único grupo básico del muestrario.
 * Los huecos se cuentan aquí y no sobre `groupMembers.length`: en Telegram un básico conserva a quien
 * se fue, así que `inside` es la cifra que `BasicGroup.memberCount` reporta y la que `groups.add.info`
 * usa para repartir sitio; si cada flujo contase aparte, dirían dos números distintos en la misma pantalla.
 */
/**
 * `profileRelated` (`NativeBridge.java:1597-1636`). Los tres caminos, con las mismas dos cifras que allá: la
 * ventana de desplazamiento y las treinta filas. Un privado da comunidades en común; un básico se corta en casa
 * porque su tabla llega entera; una comunidad se paga de treinta en treinta.
 */
function designRelated(params: Record<string, unknown>, state: State) {
  const id = String(params.id);
  const chat = state.chats.find(item => item.id === id);
  // La persona que vino de una fila de la lista no tiene entrada en el muestrario: `profile.contact` la nombró con
  // su identificador suelto, y el host la reconstruyó como una entrada privada. Aquí se la trata igual que allá.
  const person = rosterRows(state).some(row => row.id === id);
  if (!chat && !person) throw new Error(PEER_REFUSALS.noList);
  if (chat?.type === 'secret') throw new Error(PEER_REFUSALS.secret);
  const offset = peerOffset(Number(params.offset ?? 0));
  if (!chat || chat.type === 'private') {
    const pool = state.chats.filter(item => item.id !== id && (item.type === 'group' || item.type === 'channel'));
    const page = pool.slice(offset, offset + PEER_PAGE);
    return { chats: page.map(item => peerRow(item)), nextCursor: peerCursor(page.map(item => item.id), page.length) };
  }
  const rows = rosterRows(state).filter(row => row.inside);
  const members = (list: typeof rows) => list.map(row => peerMemberRow(row.id, row.name, peerRole(row.status)));
  if (!isSupergroupOrChannel(chat)) {
    const start = Math.min(offset, rows.length);
    const end = Math.min(rows.length, start + PEER_PAGE);
    return { members: members(rows.slice(start, end)), nextOffset: end, hasMore: end < rows.length };
  }
  const page = rows.slice(offset, offset + PEER_PAGE);
  return { members: members(page), nextOffset: offset + page.length, hasMore: page.length === PEER_PAGE };
}

/** `profile.peer` (`:524`): la comunidad que la pestaña ya tenía delante. */
function designPeer(params: Record<string, unknown>, state: State) {
  const chat = state.chats.find(item => item.id === String(params.id));
  if (!chat) throw new Error(PEER_REFUSALS.noHash);
  return peerRow(chat);
}

/**
 * `profile.contact` (`:527`): en TDLib es `CreatePrivateChat`, que no habla con Telegram. Aquí la persona solo se
 * puede abrir si la lista ya la trajo —el espejo exacto del `access_hash` de Windows—, y si no, se dice.
 */
function designContact(params: Record<string, unknown>, state: State) {
  const row = rosterRows(state).find(item => item.id === String(params.id));
  if (!row) throw new Error(PEER_REFUSALS.noHash);
  return peerRow({ id: row.id, title: row.name, type: 'private', username: row.username, bot: row.bot });
}

/**
 * `profile.sender` (`:528`): se lee la fila por su número dentro de su chat y se devuelve el peer de su autor. Las
 * seis negaciones agrupadas de `:1600` caben en una sola frase, y de ellas el andamio representa las tres que puede
 * saber: el chat no existe, la fila no está en ese chat —que es como se traduce aquí el «es de otro número de
 * conversación» de `:1600`, porque se busca dentro del chat—, y el chat es secreto. El temporizador de
 * autodestrucción no lo representa porque el muestrario no tiene ninguna fila con temporizador —y decirlo con la
 * frase de siempre sería mentir sobre el motivo—. La persona que la lista no conoce se niega con el `access_hash` de
 * Windows, igual que `profile.contact`, y el autor que la fila no trae es la otra frase de `senderProfile` (`:1611`).
 */
function designSender(params: Record<string, unknown>, state: State) {
  const chatId = String(params.chatId);
  const chat = state.chats.find(item => item.id === chatId);
  const row = poolOf(chatId).find(item => item.id === String(params.id));
  if (!chat || !row || chat.type === 'secret') throw new Error(PEER_REFUSALS.secret);
  if (!row.authorKind || !row.authorId) throw new Error(PEER_REFUSALS.noSender);
  if (row.authorKind === 'chat') {
    const channel = state.chats.find(item => item.id === row.authorId);
    if (!channel) throw new Error(PEER_REFUSALS.noSender);
    return peerRow(channel);
  }
  const person = rosterRows(state).find(item => item.id === row.authorId);
  if (!person) throw new Error(PEER_REFUSALS.noHash);
  return peerRow({ id: person.id, title: person.name, type: 'private', username: person.username, bot: person.bot });
}

function rosterRows(state: State): RosterMember[] {
  // Quien fue expulsado en esta sesión sigue apareciendo: Telegram conserva la fila y la marca fuera.
  const listed: RosterMember[] = [
    { id: '500', name: 'Rosa Ibarra', username: 'rosa_ibarra', status: ROSTER_STATUS.creator, inside: true, self: false, bot: false, since: serviceSeed - 4_000_000, invitedBy: '0', invitedByName: '', tag: '' },
    { id: state.selfId, name: state.name || 'Tú', username: 'rodrigo_web', status: ROSTER_STATUS.admin, inside: true, self: true, bot: false, since: serviceSeed - 3_500_000, invitedBy: '500', invitedByName: '', tag: 'setup' },
    ...groupMembers.map(item => ({
      id: item.id, name: item.name,
      username: designContacts.find(contact => contact.id === item.id)?.username ?? '',
      status: item.bot ? ROSTER_STATUS.member : item.status === 'Restringido' ? ROSTER_STATUS.restricted : item.status === 'Administrador' ? ROSTER_STATUS.admin : ROSTER_STATUS.member,
      inside: true, self: false, bot: Boolean(item.bot), since: serviceSeed - 200_000, invitedBy: '500', invitedByName: '', tag: '',
    })),
    { id: '509', name: 'Rubén Alcaraz', username: 'ruben_a', status: ROSTER_STATUS.left, inside: false, self: false, bot: false, since: serviceSeed - 900_000, invitedBy: '500', invitedByName: '', tag: '' },
    { id: '510', name: 'Nadia Ortiz', username: 'nadia_ortiz', status: ROSTER_STATUS.banned, inside: false, self: false, bot: false, since: serviceSeed - 1_600_000, invitedBy: '501', invitedByName: '', tag: '' },
  ].map(row => (banished.has(row.id) ? { ...row, inside: false, status: ROSTER_STATUS.banned } : row));
  // La firma de la invitación se resuelve contra la propia lista, que es lo que hacen los dos puentes con la
  // caché de personas que la misma respuesta trae. El respaldo es el mismo con el que una fila se nombra a sí
  // misma cuando nadie la describe (`rosterName` en Java, `Name(null)` en C#), no una frase nueva.
  return listed.map(row => ({
    ...row,
    invitedByName: rosterInvitedName(row.invitedBy, listed.find(person => person.id === row.invitedBy)?.name ?? ROSTER_UNKNOWN_NAME),
  }));
}
/**
 * Lo que `DesktopGroupMembers.SelfParticipantAsync` daría en Windows: la cuenta con la que se mira la lista, que
 * el muestrario administra (`chat.profile` de '14' dice `canManageMembers:true`). `adminRights` es otra cosa —la
 * tabla que `Row` repite en cada fila para decir qué casillas se pueden *delegar*— y en el fixture puede tener
 * apagada una bandera que la cuenta sí tiene, así que el actor se escribe aparte.
 */
const selfRights: GroupAdminRights = { ...adminRights, canPromoteMembers: true };

/**
 * `DesktopGroupMembers.Actor.Available`: las dieciséis casillas con la puerta del tipo de chat aplicada sobre lo
 * que la propia cuenta tiene. La pantalla filtra por este valor y el puente vuelve a consultarlo al escribir, así
 * que ofrecer `canManageTopics` en un grupo que no es foro sería enseñar una casilla que la escritura rechaza con
 * «Uno de los permisos no es compatible con este tipo de chat.».
 */
function availableRights(channel: boolean, forum: boolean): GroupAdminRights {
  const value = { ...NO_ADMIN_RIGHTS };
  for (const entry of ADMIN_RIGHT_RULES) {
    const allowed = entry.gate === 'channel' ? channel : entry.gate === 'community' ? !channel : entry.gate === 'forum' ? forum : true;
    value[entry.key] = !!selfRights[entry.key] && allowed;
  }
  return value;
}

/**
 * La forma que en MTProto da el tipo de participante (`IsNormal`, `IsRestricted`, `IsBanned`,
 * `IsEditableAdmin`), leída aquí sobre lo que la fila guarda: el `status` que escribe `Row` y las dos banderas
 * que lo motivan. Un baneo nunca es una restricción, y toda administración del muestrario es editable porque su
 * único creador ('500') vive en la lista del básico y no en la de la comunidad.
 */
function memberShape(row: GroupMember) {
  const banned = row.banned === true;
  return {
    normal: !banned && row.restricted !== true && row.status === ROSTER_STATUS.member,
    restricted: row.restricted === true && !banned,
    banned,
    editable: row.status === ROSTER_STATUS.admin,
  };
}

/**
 * Las seis banderas de `DesktopGroupMembers.Row` recalculadas sobre la fila, que es lo que la pantalla ve al
 * releer la lista después de escribir. `!row.bot` es la salvedad con la que Android deja a un bot sin promote.
 */
function reshapeMember(row: GroupMember, channel: boolean): void {
  const shape = memberShape(row);
  row.canBan = selfRights.canRestrictMembers && (shape.normal || shape.restricted);
  row.canUnban = selfRights.canRestrictMembers && (shape.banned || shape.restricted);
  row.canRestrict = selfRights.canRestrictMembers && !channel && (shape.normal || shape.restricted);
  row.canPromote = selfRights.canPromoteMembers && shape.normal && !row.bot;
  row.canDemote = selfRights.canPromoteMembers && shape.editable;
  row.canEditRights = selfRights.canPromoteMembers && shape.editable;
}

/** La fila de la lista sobre la que se va a escribir, con la ausencia nombrada como el hash que no llegó. */
function memberRow(userId: string): GroupMember {
  const row = groupMembers.find(item => item.id === userId);
  if (!row) throw new Error(SANCTION_REFUSALS.needsHash);
  return row;
}

/** El chat de la escritura, con la forma que `DesktopMembership` exige para una comunidad. */
function communityChat(params: Record<string, unknown>, state: State): { channel: boolean; forum: boolean } {
  const chat = state.chats.find(item => item.id === String(params.id));
  if (!isSupergroupOrChannel(chat)) throw new Error(SANCTION_REFUSALS.requiresSupergroup);
  return { channel: chat?.type === 'channel', forum: chat?.isForum === true };
}

/**
 * `DesktopMemberSanctionFlow.SanctionAsync` (ronda AZ) espejado sobre la fila: las tres fases en el orden del
 * cable —plazo y canal, luego el derecho propio, luego el estado de la persona— y la mutación solo al final, que
 * es el orden con el que Windows gasta sus dos peticiones a Telegram.
 */
function desktopSanction(params: Record<string, unknown>, state: State, restrict: boolean): true {
  const { channel } = communityChat(params, state);
  const userId = String(params.userId);
  const duration = Number(params.duration ?? SANCTION_DURATION.default);
  const deleteMessages = Boolean(params.deleteMessages);
  const pre = sanctionPreProblem(userId === state.selfId, duration, restrict, channel);
  if (pre) throw new Error(pre);
  const right = sanctionRightProblem(selfRights.canRestrictMembers, selfRights.canDeleteMessages, channel, deleteMessages);
  if (right) throw new Error(right);
  const row = memberRow(userId);
  const shape = memberShape(row);
  const target = sanctionTargetProblem(shape.normal, shape.restricted);
  if (target) throw new Error(target);
  row.banned = !restrict;
  row.restricted = restrict;
  row.status = restrict ? ROSTER_STATUS.restricted : ROSTER_STATUS.banned;
  // `BanRights`: un cero en `until_date` es «para siempre», y `Until` lo devuelve tal cual a la pantalla.
  row.until = duration === 0 ? 0 : Math.floor(Date.now() / 1000) + duration;
  row.currentRights = undefined;
  reshapeMember(row, channel);
  return true;
}

/** `LiftMemberAsync`: levantar la sanción escribe `LiftRights()`, que en la fila es volver a ser miembro normal. */
function desktopLift(params: Record<string, unknown>, state: State): true {
  const { channel } = communityChat(params, state);
  const userId = String(params.userId);
  const pre = liftPreProblem(userId === state.selfId);
  if (pre) throw new Error(pre);
  const right = liftRightProblem(selfRights.canRestrictMembers);
  if (right) throw new Error(right);
  const row = memberRow(userId);
  const shape = memberShape(row);
  const target = liftTargetProblem(shape.banned, shape.restricted);
  if (target) throw new Error(target);
  row.banned = false;
  row.restricted = false;
  row.status = ROSTER_STATUS.member;
  row.until = 0;
  reshapeMember(row, channel);
  return true;
}

/**
 * `PromoteMemberAsync`, promote y edición de permisos en el mismo brazo. Las dieciséis casillas llegan como
 * paraderas de la llamada (`App.tsx` extiende el objeto de derechos), y `currentRights` es la fila tal como
 * Telegram la tenía: sin ella, quitar una casilla que la pantalla no enseñaba borraría un permiso.
 */
function desktopPromote(params: Record<string, unknown>, state: State): true {
  const { channel, forum } = communityChat(params, state);
  const userId = String(params.userId);
  const pre = promotePreProblem(userId === state.selfId);
  if (pre) throw new Error(pre);
  const right = promoteRightProblem(selfRights.canPromoteMembers);
  if (right) throw new Error(right);
  const row = memberRow(userId);
  const shape = memberShape(row);
  const target = promoteTargetProblem(shape.normal, shape.editable);
  if (target) throw new Error(target);
  const editing = shape.editable;
  const asked: Partial<GroupAdminRights> = {};
  for (const { key } of ADMIN_RIGHT_RULES) asked[key] = params[key] === true;
  const chosen = requestedRights(asked, selfRights, editing ? row.currentRights ?? null : null, channel, forum);
  if (!chosen.ok) throw new Error(chosen.problem);
  row.status = ROSTER_STATUS.admin;
  row.admin = true;
  row.currentRights = chosen.rights;
  row.restricted = false;
  row.banned = false;
  row.until = 0;
  reshapeMember(row, channel);
  return true;
}

/** `DemoteMemberAsync`: `channels.editAdmin` con los derechos vacíos, que deja la fila como miembro normal. */
function desktopDemote(params: Record<string, unknown>, state: State): true {
  const { channel } = communityChat(params, state);
  const userId = String(params.userId);
  const pre = demotePreProblem(userId === state.selfId);
  if (pre) throw new Error(pre);
  const right = demoteRightProblem(selfRights.canPromoteMembers);
  if (right) throw new Error(right);
  const row = memberRow(userId);
  const target = demoteTargetProblem(memberShape(row).editable);
  if (target) throw new Error(target);
  row.status = ROSTER_STATUS.member;
  row.admin = false;
  row.currentRights = undefined;
  reshapeMember(row, channel);
  return true;
}

/**
 * Lo que el puente contesta con `GetBasicGroup`/`GetSupergroup` más el estado propio. En el contrato de
 * la interfaz, un grupo básico es `type:'group'` sin la marca `supergroup`; con ella —y en un canal—
 * `forward_limit` se ignora y los 200 miembros no aplican, igual que en `MemberAdditions`.
 */
function addPermission(id: string, state: State) {
  const chat = state.chats.find(item => item.id === id);
  if (!chat || chat.type === 'private' || chat.type === 'secret' || chat.type === 'bot') {
    return { allowed: false, reason: ADD_REJECTIONS.unsupported, forward: false, remaining: -1 };
  }
  if (chat.type !== 'group' || chat.supergroup === true) return { allowed: true, reason: '', forward: false, remaining: -1 };
  const remaining = rosterRemaining(rosterRows(state).filter(row => row.inside).length);
  if (remaining <= 0) return { allowed: false, reason: ADD_REJECTIONS.full, forward: true, remaining: 0 };
  return { allowed: true, reason: '', forward: true, remaining };
}
const storyAlbums: StoryAlbum[] = [
  { id: 1, name: 'Archivo' },
  { id: 2, name: 'Viajes' },
];
const topics: ForumTopicInfo[] = [
  { id: 1, name: 'General', closed: false, general: true, pinned: true, unread: 4, lastText: 'Álex: Ya dejé los nuevos bocetos', date: Math.floor(Date.now()/1000)-600 },
  { id: 2, name: 'Diseño', closed: false, general: false, unread: 2, lastText: 'María: Me encanta cómo está quedando', date: Math.floor(Date.now()/1000)-1800 },
  { id: 3, name: 'Anuncios', closed: true, general: false, lastText: 'Rodrigo: Versión beta disponible', date: Math.floor(Date.now()/1000)-86400 },
  { id: 4, name: 'Soporte', closed: false, general: false, unread: 1, lastText: 'Sofía: ¿Cómo adjunto un álbum?', date: Math.floor(Date.now()/1000)-7200 },
];
let syncState = { enabled: false, running: false, last: 0, matched: 0, imported: 0, skipped: false, error: '' };
// El estado de la privacidad es la lista de reglas que Telegram tendría guardadas por ajuste, no la fila que ve la
// pantalla (ronda BH). Así `custom` sale de que haya dos bases en la lista y `preserved` de las reglas que la
// interfaz no sabe expresar, en lugar de ser un texto escrito a mano. `voiceMessages` es el caso que la pantalla
// deja intacto, y `calls` enseña que una regla de bots sobrevive a un cambio de base.
let previewPrivacyRules: Record<string, PrivacyRule[]> = {
  status: [{ kind: 'allowContacts' }],
  profilePhoto: [{ kind: 'allowAll' }],
  phone: [{ kind: 'allowContacts' }],
  bio: [{ kind: 'allowAll' }],
  birthdate: [{ kind: 'disallowAll' }],
  forwards: [{ kind: 'allowAll' }],
  calls: [{ kind: 'allowContacts' }, { kind: 'disallowBots' }],
  voiceMessages: [{ kind: 'allowAll' }, { kind: 'disallowAll' }, { kind: 'allowPremium' }, { kind: 'disallowChatMembers', chats: [] }],
  invites: [{ kind: 'allowAll' }],
  findPhone: [{ kind: 'allowContacts' }], p2p: [{ kind: 'allowContacts' }, { kind: 'disallowBots' }], noPaidMessages: [{ kind: 'allowAll' }], savedMusic: [{ kind: 'allowAll' }], starGiftsAutoSave: [{ kind: 'allowAll' }],
};

/** `privacyGet` (`NativeBridge.java:3900-3911`): las catorce claves proyectadas, en el orden de `PRIVACY_KEYS`. */
function designPrivacyGet() {
  return PRIVACY_KEYS.map(key => projectPrivacy(key, previewPrivacyRules[key] ?? []));
}

/**
 * `privacySet` (`:3860-3874`) con su orden: la forma de las dos cadenas, la de las dos listas, la clave y solo
 * entonces la norma de las excepciones. Las reglas que la pantalla no sabe expresar se conservan llamando al mismo
 * `mergePrivacy` que prueba el espejo, no simulando el resultado. Dos negaciones no se alcanzan aquí y no es un
 * olvido: `missingUser` es del `access_hash` que solo pide MTProto y `untranslatable`, de una regla que ninguna de
 * las dos capas produce hoy.
 */
function designPrivacySet(params: Record<string, unknown>): boolean {
  if (!shapedText(params.key, PRIVACY_MAX_KEY) || !shapedText(params.value, PRIVACY_MAX_VALUE)) throw new Error(PRIVACY_REFUSALS.badText);
  if (!shapedIds(params.allowUsers) || !shapedIds(params.restrictUsers)) throw new Error(PRIVACY_REFUSALS.badList);
  const key = String(params.key);
  if (!(PRIVACY_KEYS as readonly string[]).includes(key)) throw new Error(PRIVACY_REFUSALS.unknownSetting);
  const allow = privacyIds(params.allowUsers), restrict = privacyIds(params.restrictUsers);
  const refusal = privacyProblem(String(params.value), allow, restrict);
  if (refusal) throw new Error(refusal);
  previewPrivacyRules[key] = mergePrivacy(previewPrivacyRules[key] ?? [], String(params.value), allow, restrict);
  return true;
}
/**
 * Los bloqueos de la cuenta en el andamio (ronda BI), en una sola lista: la que lee `privacy.blocked` es también la
 * que `profile.block` escribe y de la que `chat.profile` saca su `blocked`. Dos fuentes enseñarían dos verdades
 * distintas en la misma pantalla. Las filas llevan `kind` e `id` tal y como los devuelve el puente —el id del
 * remitente, no el del chat—, y la ficha de una persona va por chats, así que hace falta un puente para las dos
 * personas del muestrario que son ficha y fila a la vez. No es una regla de ninguna capa: `NativeBridge.java:1307`
 * también saca el id de usuario del `ChatTypePrivate` antes de bloquear a nadie.
 */
const designSenderIds: Record<string, string> = { '11': '501' };
const designSenderId = (id: string) => designSenderIds[id] ?? id;
const designIsBlocked = (id: string) => designBlockedRows.some(row => row.kind === 'user' && row.id === designSenderId(id));
// La página del andamio es de tres, no de las cincuenta que manda el puente (`BLOCKED_PAGE_SIZE`), por el mismo
// motivo por el que la búsqueda corta en ocho: con cincuenta y seis filas el marcador nunca se vería trabajar aquí.
// Todo lo demás sale de `blockedPage`, o sea de la fórmula de `:1528`, no de una cuenta aproximada.
const BLOCKED_DESIGN_PAGE = 3;
const designBlockedRows: BlockedSender[] = [
  { kind: 'user', id: '501', name: blockedLimit('María Fernández') },
  { kind: 'user', id: '8102', name: blockedLimit('Bot de recordatorios') },
  { kind: 'chat', id: '-1002', name: blockedLimit('Tablón de avisos del barrio') },
  { kind: 'user', id: '8104', name: blockedLimit('María Fernanda de los Ángeles Bustamante y Valdivielso, que escribió un nombre larguísimo en su perfil de Telegram para ver qué hace el puente con él') },
  { kind: 'user', id: '8105', name: blockedLimit('Braulio Sanmartín') },
  { kind: 'chat', id: '-1003', name: blockedLimit('Chat de la escalera') },
];

/** `blockedSenders` (`NativeBridge.java:1550-1573`): el marcador se niega y la página se arma con la fórmula medida. */
function designBlockedPage(params: Record<string, unknown>) {
  const refusal = blockedOffsetProblem(params.offset);
  if (refusal) throw new Error(refusal);
  const offset = blockedOffset(params.offset);
  return blockedPage(designBlockedRows.slice(offset, offset + BLOCKED_DESIGN_PAGE), offset, designBlockedRows.length);
}

/**
 * `unblockSender` (`:1531-1542`) menos el diálogo, que en el andamio no hay quién lo abra. Las dos negativas del
 * camino largo son de Windows: la pantalla reenvía el `kind` y el número que leyó, y el cable tiene que volver a
 * pedir la lista para saber de qué par se trata y con qué hash (`DesktopBlockedFlow.BlockedPeerAsync`). Aquí se
 * modela igual: primero la forma, luego la búsqueda, y solo entonces la fila desaparece.
 */
function designUnblockSender(params: Record<string, unknown>, state: State): boolean {
  const sender = blockedSender(params, state.selfId);
  if (!sender) throw new Error(BLOCKED_REFUSALS.badSender);
  const at = designBlockedRows.findIndex(row => row.kind === sender.kind && row.id === sender.id);
  if (at < 0) throw new Error(BLOCKED_REFUSALS.notInList);
  designBlockedRows.splice(at, 1);
  return true;
}

/**
 * `profileBlock` (`NativeBridge.java:1303-1310`), que es la otra mitad del mismo hueco: la ficha ya publicaba `blocked`
 * desde la ronda BA y su botón seguía sin puente. Aquí están las tres guardas de Java en su orden —forma del chat,
 * cuenta propia, valor— y ninguna ventana de confirmar, porque la abre la pantalla (`App.tsx:761-764`) y no el puente.
 */
function designProfileBlock(params: Record<string, unknown>, state: State): boolean {
  const id = String(params.id ?? '');
  const chat = state.chats.find(item => item.id === id);
  if (!chat || chat.type !== 'private') throw new Error(BLOCKED_REFUSALS.notPrivate);
  if (designSenderId(id) === state.selfId || id === state.selfId) throw new Error(BLOCKED_REFUSALS.selfBlock);
  if (params.value === undefined) throw new Error(BLOCKED_REFUSALS.missingValue);
  if (typeof params.value !== 'boolean') throw new Error(BLOCKED_REFUSALS.badValue);
  const sender = designSenderId(id), at = designBlockedRows.findIndex(row => row.kind === 'user' && row.id === sender);
  if (params.value && at < 0) designBlockedRows.push({ kind: 'user', id: sender, name: blockedLimit(chat.title) });
  if (!params.value && at >= 0) designBlockedRows.splice(at, 1);
  return true;
}
const serviceSeed=Math.floor(Date.now()/1000);
const lookupChats: Chat[] = [
  { id: '991', title: 'Club de lectura', username: 'club_lectura', type: 'group' },
  { id: '992', title: 'Astronomía en Chile', username: 'astronomia_cl', type: 'channel' },
].map(chat => ({ ...chat, preview: '', date: 0, unread: 0, marked: false, bot: false, pinned: false, muted: false, archived: false, supported: true, inList: false }));
const longHistory:Message[]=Array.from({length:42},(_,index)=>({id:String(1001+index),chatId:'21',sender:'Vista de diseño',text:'Mensaje de seguimiento '+(index+1),date:serviceSeed-(42-index)*300,outgoing:false,status:'',edited:false,reactions:[]}));
// Canal con discusión activada: un post con comentarios y otro sin ellos, para ver los dos estados.
const plain={outgoing:false,status:'' as const,edited:false,reactions:[]};
const channelPosts:Message[]=[
  {id:'401',chatId:'22',sender:'WRGram · Novedades',text:'Nueva barra inferior y temas del sistema',date:serviceSeed-5400,...plain,authorKind:'chat',authorId:'22',thread:{comments:3,canOpen:true}},
  {id:'402',chatId:'22',sender:'WRGram · Novedades',text:'Registro de cambios de la beta',date:serviceSeed-1800,...plain,authorKind:'chat',authorId:'22',thread:{comments:0}},
];
// Las tres voces del hilo son las tres personas de la lista con ese número: desde la ronda BP `profile.sender`
// nombra al autor por su `authorId`, así que una fila que se firma con un nombre y lleva el número de otra se
// desmentiría a sí misma en cuanto se pulsa.
const threadComments:Record<string,Message[]>={
  '401':[
    {id:'503',chatId:'23',sender:'Sofía López',text:'La barra se siente mucho más clara 👏',date:serviceSeed-2400,...plain,authorKind:'user',authorId:'503'},
    {id:'502',chatId:'23',sender:'María Fernández',text:'',date:serviceSeed-3000,...plain,authorKind:'user',authorId:'502',reply:'Nueva barra inferior y temas del sistema',replyQuote:{text:'temas del sistema',position:23},media:{id:0,ready:true,kind:'image',mime:'image/jpeg',name:'Boceto',size:0,minithumbnail:'/bots/snake.jpg'}},
    {id:'501',chatId:'23',sender:'Álex Moreno',text:'El contraste nocturno quedó perfecto.',date:serviceSeed-3600,...plain,authorKind:'user',authorId:'501'},
  ],
};
// Conversación privada con dos voces y un mensaje por día: es el historial con el que se puede ver
// de verdad un filtro combinado (autor + rango), algo imposible con una sola firma repetida.
const privateDays:Message[]=Array.from({length:42},(_,index)=>{
  const mine=index%3===0;
  const text=index%7===3?`Enlace guardado https://wrgram.app/nota${index}`:index%5===2?'¿Lo revisas, @rodrigo_web?':index%4===0?`Boceto ${index/4+1} de la barra inferior`:`Apunte ${index+1} del día`;
  return {id:String(1001+index),chatId:'17',sender:mine?'Tú':'Javier Morales',text,date:serviceSeed-(41-index)*86400,outgoing:mine,status:mine?'read':'',edited:false,reactions:[],authorKind:'user' as const,authorId:mine?'1':'1017',...(index%9===4?{media:{id:0,ready:true,kind:'image' as const,mime:'image/jpeg',name:'Apunte',size:0,minithumbnail:'/bots/snake.jpg'}}:{})};
});
// Chat secreto: solo texto, como lo indexa TDLib, para ver el rechazo del filtro por autor y fechas.
const secretNotes:Message[]=['El acuerdo es provisional','Nos reunimos el jueves','Aquí no hay nube','Te leo en el andén','Reviso el contrato mañana'].map((text,index)=>({id:String(2601+index),chatId:'26',sender:index%2===1?'Tú':'Irene Català',text,date:serviceSeed-(5-index)*1800,outgoing:index%2===1,status:'',edited:false,reactions:[],authorKind:'user' as const,authorId:index%2===1?'1':'526'}));
// El puente pide 50 mensajes por página; aquí se cortan en 8 para poder ver el marcador trabajar.
const SEARCH_PAGE = 8;
// Qué significa cada filtro de Telegram sobre los tipos de `Media` que existen en la vista de diseño.
// Las voces vacías son honestas: sin fixture de nota de voz, videomensaje o encuesta, no hay resultados.
const SEARCH_MEDIA: Record<string, ('image'|'video'|'audio'|'file'|'sticker')[]> = {
  photos:['image'], videos:['video'], photoVideo:['image','video'], documents:['file'], audio:['audio'],
  voice:[], videoNotes:[], animations:['sticker'], links:[], polls:[], mentions:[],
};
const matchesSearch = (message: Message, text: string, filter: string): boolean => {
  if (text && !normalizeSearch(message.text).includes(text)) return false;
  if (filter === '') return true;
  if (filter === 'links') return /https?:\/\//.test(message.text);
  if (filter === 'mentions') return message.text.includes('@');
  const kind = message.media?.kind;
  return !!kind && SEARCH_MEDIA[filter].includes(kind);
};
const matchesAuthor = (message: Message, sender: string): boolean => sender === ''
  || (sender === CHAT_SENDER ? message.authorKind === 'chat' : message.authorId === sender);
// Marcador de la última búsqueda en curso, con los criterios que lo generaron.
let designSearch: { key: string; next: number } | null = null;
// Espejo de `BridgePolicy.text`: si la clave falta o pasa del tope, el puente rechaza el parámetro.
const bridgeText = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || value.length > max) throw new Error('Invalid text');
  return value;
};
// Un filtro guardado de serie para ver la chip sin tener que crearla a mano.
let savedSearches: SavedFilter[] = [{ id: 'f1', name: 'Bocetos de la barra', query: 'boceto', filter: '', mode: 'chat', chatId: '17' }];
// Todo lo que Telegram tendría indexado de esta conversación, se haya cargado o no en pantalla: la
// búsqueda del puente recorre el historial completo, así que la vista de diseño no puede mirar solo
// la ventana visible. `chat.open` y `messages.search` comparten esta fuente para no divergir.
const poolOf=(id:string):Message[]=>{
  const base=id==='21'?longHistory:id==='17'?privateDays:id==='22'?channelPosts:id==='23'?(threadComments['401']||[]):id==='26'?secretNotes:id==='11'||id==='14'||id==='24'?fixture.messages.map(message=>({...message,chatId:id})):[];
  return [...base,...[...galleryItems,...savedItems].filter(item=>item.chatId===id),...locationItems.filter(item=>item.chatId===id),...forwardedCopies.filter(item=>item.chatId===id),...scheduledSent.filter(item=>item.chatId===id),...sentAttachments.filter(item=>item.chatId===id),...sentPolls.filter(item=>item.chatId===id),...sentContacts.filter(item=>item.chatId===id),...sentLive.filter(item=>item.chatId===id)].sort((a,b)=>a.date-b.date||Number(a.id)-Number(b.id));
};
// Lo que recorre la búsqueda global: el historial de cada chat, etiquetado con su título.
const globalPool=():Message[]=>fixture.chats.flatMap(chat=>poolOf(chat.id).map(message=>({...message,chatTitle:chat.title})));
const collectionMessage = { sender: 'Vista de diseño', outgoing: false, status: '' as const, edited: false, reactions: [] };
const savedItems: (Message & { origin: string })[] = [
  { ...collectionMessage, id: '301', chatId: '1', origin: '14', text: 'Ideas para la siguiente edición', date: serviceSeed },
  { ...collectionMessage, id: '302', chatId: '1', origin: '1', text: 'Revisar el prototipo', date: serviceSeed - 1800 },
  { ...collectionMessage, id: '303', chatId: '1', origin: '-24', text: 'Mensaje reenviado', date: serviceSeed - 7200 },
];
// Las cinco piezas del muestrario de multimedia caen en el chat de la comunidad, que es un grupo, y en un
// grupo la interfaz pinta el nombre del remitente como botón de ficha. Antes se firmaban con «Vista de
// diseño» —una etiqueta de serie que no es miembro de ningún chat— y desde la ronda BP ese botón pregunta
// `profile.sender`, que resuelve al autor por su número: sin número en la fila habría contestado la frase
// de `senderProfile` (`:1611`), reservada en el puente para una fila que de verdad llega sin remitente.
// Aquí la negación sería mentira, así que firman a María Fernández (`502`), que sí está dentro. La firma
// de la serie se queda en `savedItems`, cuyo chat es de uno mismo y nunca pinta el botón.
const galleryBase = { ...collectionMessage, sender: 'María Fernández', authorKind: 'user' as const, authorId: '502' };
const galleryItems: (Message & { filter: string })[] = [
  { ...galleryBase, id: '205', chatId: '14', filter: 'photos', text: 'Foto de la última reunión', date: serviceSeed, media: { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name: 'Foto de la reunión', size: 0, minithumbnail: '/bots/snake.jpg' } },
  { ...galleryBase, id: '204', chatId: '14', filter: 'videos', text: 'Vídeo de presentación', date: serviceSeed - 2400, media: { id: 0, ready: false, kind: 'video', mime: 'video/mp4', name: 'Vídeo de presentación', size: 0, minithumbnail: '/bots/snake.jpg' } },
  { ...galleryBase, id: '203', chatId: '14', filter: 'photos', text: 'Foto del primer boceto', date: Math.floor(new Date(2024, 1, 29, 16).getTime() / 1000), media: { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name: 'Primer boceto', size: 0, minithumbnail: '/bots/snake.jpg' } },
  { ...galleryBase, id: '202', chatId: '14', filter: 'documents', text: 'Guía del proyecto', date: serviceSeed - 3600, media: { id: 0, ready: false, kind: 'file', mime: 'application/pdf', name: 'Guía del proyecto.pdf', size: 0 } },
  { ...galleryBase, id: '201', chatId: '14', filter: 'links', text: 'Sitio del proyecto https://wrgram.app', date: serviceSeed - 3700, preview: { title: 'WRGram — un espacio para construir juntos', site: 'wrgram.app', description: 'Cliente de Telegram propio para Android y Windows: conversaciones, comunidades, complementos y la misma interfaz en las dos casas.', photo: { id: 0, ready: false, kind: 'image' as const, mime: 'image/jpeg', name: 'Vista previa del enlace', size: 0, minithumbnail: '/bots/snake.jpg' } } },
  // Las otras dos filas son los dos caminos que el botón tiene además del artículo. La de la invitación pregunta antes
  // de escribir. La del temporizador no lleva `preview` a propósito: `NativeSnapshot.java:227` exige `!temporary` para
  // pintar la tarjeta, y el host hace lo mismo con `DesktopSenderProfile.IsEphemeral`, así que en las dos capas esa
  // fila se niega por el temporizador y por la ausencia de tarjeta con la misma frase.
  { ...galleryBase, id: '206', chatId: '14', filter: 'links', text: 'Entramos por este enlace https://t.me/+Abierto92', date: serviceSeed - 3800, preview: { title: 'Telegram: Únete a un grupo', site: 't.me', description: 'Astronomía en Chile — un espacio para mirar el cielo del sur.' } },
  { ...galleryBase, id: '207', chatId: '14', filter: 'links', text: 'Apunte que caduca https://wrgram.app/caduca', date: serviceSeed - 3900 },
];
function designPage<T extends { id: string }>(items: T[], cursor: unknown) {
  const start = cursor ? items.findIndex(item => item.id === cursor) + 1 : 0;
  const page = items.slice(start, start + 2);
  return { items: page, next: start + page.length < items.length ? page.at(-1)?.id || '' : '' };
}
// Las filas de servicio y las de envío pendiente se pintan en el chat de arranque a propósito: son el
// muestrario de burbujas, no la historia de esta conversación. Por eso comparten el `chatId` de la cabecera
// —si vivieran en otro chat, la guarda del menú de escritorio las descartaría como ajenas y dejarían de
// verse—, y por eso `poolOf` los reetiqueta al abrir los chats 14 y 24, que montan las mismas frases.
const serviceBase={chatId:'11',sender:'María Fernández',status:'' as const,edited:false,reactions:[]};
const serviceMessages: Message[]=[
  {...serviceBase,id:'106',text:'María Fernández añadió a Sofía López y Álex Moreno',date:serviceSeed-2400,outgoing:false,service:{kind:'members',text:'María Fernández añadió a Sofía López y Álex Moreno'}},
  {...serviceBase,id:'107',text:'Fijaste un mensaje',sender:'Tú',date:serviceSeed-2200,outgoing:true,service:{kind:'pin',text:'Fijaste un mensaje',messageId:'102'}},
  {...serviceBase,id:'108',text:'El título del chat cambió a «Viajes»',date:serviceSeed-2000,outgoing:false,service:{kind:'title',text:'El título del chat cambió a «Viajes»'}},
  {...serviceBase,id:'109',text:'Se activó la protección de contenido del chat',date:serviceSeed-1800,outgoing:false,service:{kind:'security',text:'Se activó la protección de contenido del chat'}},
  {...serviceBase,id:'110',text:'Llamada finalizada · 4 min 12 s',date:serviceSeed-1600,outgoing:true,sender:'Tú',service:{kind:'call',text:'Llamada finalizada · 4 min 12 s',duration:252}},
  {...serviceBase,id:'111',text:'Álex Moreno regaló Telegram Premium a María Fernández · 3 meses',date:serviceSeed-1400,outgoing:false,service:{kind:'gift',text:'Álex Moreno regaló Telegram Premium a María Fernández · 3 meses'}},
  {...serviceBase,id:'112',text:'Videollamada programada · 9 nov, 18:30',date:serviceSeed-1200,outgoing:true,sender:'Tú',service:{kind:'call',text:'Videollamada programada · 9 nov, 18:30',date:serviceSeed+3600}},
];
// Los tres estados de un envío propio que Telegram todavía no tiene, con la forma exacta que proyecta
// `UnsentMessages.reason`: saliendo, rechazado y con reintento posible, y rechazado sin vía de vuelta
// (el código 406 llega con el texto suprimido, igual que en el puente).
const unsentBase = { chatId: '11', sender: 'Tú', outgoing: true, edited: false, reactions: [] };
const cleanUnsent = { pending: false, code: 0, telegram: '', canRetry: false, anotherSender: false, otherQuote: false, dropsReply: false, stars: '0', wait: 0 };
const unsentFixtures: Message[] = [
  { ...unsentBase, id: '113', text: 'Te paso el boceto en un minuto', date: Math.floor(Date.now() / 1000) - 120, status: 'pending', unsent: { ...cleanUnsent, pending: true } },
  { ...unsentBase, id: '114', text: 'Ahí va, a ver qué te parece', date: Math.floor(Date.now() / 1000) - 90, status: 'failed', unsent: { ...cleanUnsent, code: 429, telegram: 'Too many requests, please try again later.', canRetry: true, wait: 12 } },
  { ...unsentBase, id: '115', text: 'Y el PDF con las medidas', date: Math.floor(Date.now() / 1000) - 60, status: 'failed', unsent: { ...cleanUnsent, code: 406 } },
];
const designProvenance:Record<string,Partial<Message>>={
  '103':{reply:'¡Mucho mejor! Estamos cuidando cada detalle. Que se sienta sencillo, pero que tenga todo a mano.',replyTo:{chatId:'11',messageId:'102'}},
  '104':{forward:{kind:'hidden',name:'Ana R.',date:serviceSeed-3100}},
  '105':{forward:{kind:'channel',name:'WRGram · Comunidad',signature:'Equipo de diseño',chatId:'14',messageId:'103',date:serviceSeed-6400}},
};
// El chat en el que arranca la vista de diseño y hasta dónde lo deja leído. No son cifras sueltas: el chat
// tiene que ser cuyas filas son las de abajo en `messages`, porque la guarda del menú de escritorio —la misma
// que hace el puente— descarta una fila de otro chat, y la frontera tiene que ser la fila recibida más nueva
// de esa ventana, porque `chat.read` pone el recuento a cero en cuanto se entra y arrancar con otra cifra
// sería pintar un divisor que la propia app desmiente al segundo y medio.
const BOOT_CHAT = '11';
const BOOT_READ_INBOX = '111';
/**
 * Las fichas que ya llevan reacción en el chat de arranque. Un `UpdateMessageReactions` del host las reescribe
 * completas, y aquí existen por una razón práctica: sin ellas no hay nada que tocar con el ratón, y la negativa
 * de `message.react` en Windows sería solo contrato. Una sin elegir, para ponerla, y otra ya elegida, para quitarla.
 */
const BOOT_REACTIONS: Message['reactions'] = [
  { emoji: '👍', count: 3, chosen: false },
  { emoji: '❤️', count: 1, chosen: true },
];
/**
 * El adjunto del chat de arranque. Existe por lo mismo que las fichas de arriba: sin una fila propia con foto
 * no hay pie que editar con el ratón, y la segunda cara de `messages.editMessage` —la que obliga a volver a
 * mandar el archivo— se quedaría solo en contrato.
 */
const BOOT_PHOTO: Message['media'] = { id: 0, ready: true, kind: 'image', mime: 'image/jpeg', name: 'Boceto de la barra', size: 0, minithumbnail: '/bots/snake.jpg' };
/**
 * La bandeja de programados del chat de arranque y lo que ya salió de ella. Tres filas, cada una para tocar con
 * el ratón una cara distinta del puente: la primera se reprograma y se envía ya; la segunda es recurrente —la
 * única que Telegram no deja reprogramar desde aquí, y por eso la pantalla le quita los dos botones—; la tercera
 * lleva una lista de tareas, que en MTProto viaja como encuesta y `DesktopScheduled.KeepsContent` se niega a
 * volver a mandarla porque cambiar la hora sin el archivo lo borraría. Los ids son de otro namespace al del
 * historial a propósito: enviar uno ya le asigna el siguiente libre del chat, que es lo que hace el servidor.
 */
const traySeed = Math.floor(Date.now() / 1000);
const scheduledTray: Message[] = [
  { id: '9001', chatId: BOOT_CHAT, sender: 'Tú', text: 'Recordad la revisión de la barra a las diez.', date: traySeed + 3600, outgoing: true, status: '', edited: false, reactions: [], scheduledAt: traySeed + 3600 },
  { id: '9002', chatId: BOOT_CHAT, sender: 'Tú', text: 'Resumen semanal del proyecto.', date: traySeed + 7200, outgoing: true, status: '', edited: false, reactions: [], scheduledAt: traySeed + 7200, scheduledRepeat: true, repeatPeriod: 604800 },
  { id: '9003', chatId: BOOT_CHAT, sender: 'Tú', text: '', date: traySeed + 10800, outgoing: true, status: '', edited: false, reactions: [], scheduledAt: traySeed + 10800,
    checklist: { title: 'Preparativos', tasks: [{ id: 1, text: 'Cerrar el diseño de la barra', done: false }, { id: 2, text: 'Probar el arranque en Windows', done: false }], othersCanAdd: false, othersCanMark: true, canAdd: false, canMark: false } },
];
const scheduledSent: Message[] = [];
// Lo que se envió por la vía del adjunto. Vive aparte, como las copias de reenvío y los programados que ya
// salieron, para que la búsqueda y el «salta al mensaje» lo encuentren en el historial completo del chat.
const sentAttachments: Message[] = [];
// Las encuestas enviadas, en el mismo cajón aparte que los archivos: `poll.answer` las busca por id en la
// conversación activa, y si no estuvieran en `poolOf` al volver a abrir el chat la respuesta sería «el mensaje ya
// no está disponible» sobre una encuesta que sí se envió.
const sentPolls: Message[] = [];
// Las tarjetas de contacto compartidas, en el mismo cajón aparte y por el mismo motivo: `poolOf` es lo que mira el
// andamio para dar id nuevo, así que una fila que solo vive en `state.messages` se escribiría dos veces con el mismo
// identificador si se comparten dos personas seguidas.
const sentContacts: Message[] = [];
// Las ubicaciones en directo empezadas desde el andamio, en el mismo cajón aparte y por la misma razón: `poolOf` es
// lo que mira el andamio para dar el id nuevo, así que una compartida que solo viviera en `state.messages` escribiría
// dos filas con el mismo identificador al dejar de compartir y volver a empezar.
const sentLive: Message[] = [];
/**
 * Las ubicaciones que el host de Windows sabe leer, una por cada forma que produce `ConvertMessage` y sus dos
 * negativas: la fija, la en vivo (con `live` y `expiresAt`, como `MessageMediaGeoLive`), el lugar (título y dirección
 * aparte, como `MessageMediaVenue`) y las dos filas que el puente publica a medias —una sin coordenadas porque
 * `DesktopLocation.Valid` la descartó, otra con `canOpen:false` porque `exportable` valía falso en un chat protegido
 * o con `noforwards`—. No son adornos: las dos últimas son las que enseñan que el botón de abrir el mapa no aparece,
 * y sin ellas la interfaz no tendría forma de decir «coordenadas no disponibles». Viven en el chat de la comunidad
 * porque es el único que abre el andamio con historial propio, y `poolOf` las mete para que el «salta al mensaje» y
 * la búsqueda las vea igual que los álbumes. El autor es real —Álex Moreno, `501`, que es miembro del grupo—
 * porque en un grupo el nombre del remitente es botón de ficha y `profile.sender` lo resuelve por su número:
 * una fila sin `authorId` se negaría con la frase de `senderProfile` (`:1611`), que el puente solo pronuncia
 * cuando la fila de verdad no trae remitente.
 */
const locationBase = { chatId: '14', sender: 'Álex Moreno', outgoing: false, status: '' as const, edited: false, reactions: [], authorKind: 'user' as const, authorId: '501' };
const locationItems: Message[] = [
  { ...locationBase, id: '211', text: '', date: serviceSeed - 900,
    extra: { kind: 'location', title: 'Ubicación', address: '', latitude: 40.416775, longitude: -3.70379, canOpen: true } },
  { ...locationBase, id: '212', text: '', date: serviceSeed - 600,
    extra: { kind: 'location', title: 'Ubicación en vivo', address: '', latitude: 41.89193, longitude: 12.51133, live: true, expiresAt: serviceSeed + 3600, canOpen: true } },
  { ...locationBase, id: '213', text: 'Aquí es la quedada', date: serviceSeed - 300,
    extra: { kind: 'location', title: 'Sede de WRGram', address: 'Calle Mayor 1, Madrid', latitude: 40.41612, longitude: -3.70602, canOpen: true } },
  { ...locationBase, id: '214', text: '', date: serviceSeed - 150,
    extra: { kind: 'location', title: 'Ubicación', address: '', canOpen: true } },
  { ...locationBase, id: '215', text: '', date: serviceSeed - 60,
    extra: { kind: 'location', title: 'Ubicación', address: '', latitude: 43.26122, longitude: -2.9524, canOpen: false } },
];
// El arranque de diseño es exactamente lo que produce `chat.open` sobre el chat de sus filas. Antes ponía
// `active:'14'` encima de unas filas que son del 11, y eso tenía dos consecuencias reales: la rama de
// Windows del menú de mensaje —que se niega a actuar sobre una fila de otro chat, igual que hace el
// puente— no era alcanzable más que después de abrir una conversación, y el lector marcaba el chat como
// leído a los dos segundos de entrar, así que el marcador de arranque era una cifra que la propia app
// desmentía. Las filas de abajo llevan `chatId:'11'`, así que aquí se arranca en el 11.
export const fixture: State = { ...EMPTY, contactsSync: syncState, ready: true, name: 'Rodrigo', selfId: '1', online: true, connection: 'Vista de diseño · datos sintéticos', active: BOOT_CHAT, canSend: true, history:{ loading:false,error:'',end:true,latest:true,anchor:'0' },
  chats: [
    ['11','María Fernández','Me encanta cómo está quedando ✨',0,'private'],['12','Equipo de diseño','Álex: Ya dejé los nuevos bocetos',7,'group'],['13','Daniel Ruiz','Foto',0,'private'],['14','WRGram · Comunidad','Un espacio para construir juntos',3,'group'],['15','Sofía López','¡Nos vemos mañana! 👋',0,'private'],['16','Productividad','Recordatorio de tu próximo evento',1,'bot'],['17','Javier Morales','Gracias, lo reviso esta tarde',0,'private'],['18','Ideas & café','Lucía: ¿Qué opinan de esta idea?',0,'group'],['19','Viaje a Valparaíso','Fotos del viaje',0,'private'],['1','Mensajes guardados','Notas y enlaces',0,'private'],['21','Seguimiento','Mensaje de seguimiento 42',32,'private'],['22','WRGram · Novedades','Nueva barra inferior y temas del sistema',0,'channel'],['23','Comentarios · WRGram','Sofía: La barra se siente mucho más clara',0,'group'],['24','WRGram · Colaboración','Nuria: Os paso el avance mañana',5,'group'],['26','Irene Català','Aquí no hay nube',0,'secret'],
  ].map(([id,title,preview,unread,type],i)=>({id:String(id),title:String(title),preview:String(preview),date:Math.floor(Date.now()/1000)-i*2200,unread:Number(unread),marked:false,bot:type==='bot',type:String(type),pinned:i<2,muted:i===3,archived:String(id)==='19',inList:String(id)!=='19',supported:true,notice:noticeFor(String(id)),...(String(id)==='13'?{draft:'Te envío la foto después',draftReply:'907'}:String(id)==='11'?{draft:'El resumen queda listo hoy',draftReply:'101'}:{}),supergroup:String(id)==='12'||String(id)==='14'||String(id)==='24',isForum:String(id)==='12',...(String(id)==='22'?{noPolls:true}:{}),...(String(id)==='23'?{noContacts:true}:{}),...(String(id)==='15'?{isContact:true}:{}),...(String(id)==='24'?{requests:joinQueue.length}:{}),...(String(id)==='21'?{readInbox:'1010'}:String(id)==='17'?{readInbox:'1042'}:String(id)===BOOT_CHAT?{readInbox:BOOT_READ_INBOX}:String(id)==='14'?{readInbox:'103',photo:chatPhotoMedia('Logo de WRGram')}:{})})),
  messages: [
    ['101',false,'Hola 👋 ¿Cómo va la nueva versión de WRGram? @rodrigo #WRGram',-90000],['102',true,'¡Mucho mejor! Estamos cuidando cada detalle. Que se sienta sencillo, pero que tenga todo a mano.',-3400],['103',false,'Justo eso. Una interfaz que te deje conversar sin distraerte.',-3200],['104',true,'Un espacio más limpio. Y los complementos tendrán su propio lugar, sin mezclarse con tus chats.',-3000],['105',false,'Me encanta cómo está quedando ✨',-2800],
  ].map(([id,outgoing,text,time]):Message=>({id:String(id),chatId:'11',sender:outgoing?'Tú':'María Fernández',authorKind:'user' as const,authorId:outgoing?'1':'502',text:String(text),date:Math.floor(Date.now()/1000)+Number(time),outgoing:Boolean(outgoing),status:outgoing?'read':'',edited:false,reactions:[],...designProvenance[String(id)],...(String(id)==='101'?{entities:[{type:'bold' as const,offset:0,length:4},{type:'mention' as const,offset:45,length:8},{type:'hashtag' as const,offset:54,length:7}],reactions:BOOT_REACTIONS}:{}),...(String(id)==='104'?{media:BOOT_PHOTO}:{})})).concat(serviceMessages, unsentFixtures),
};

/**
 * El muestrario de `groups.stats` (ronda CA) con los `id` que de verdad contestan las dos capas, medidos en
 * `TdApi.ChatStatisticsChannel` / `ChatStatisticsSupergroup` y en `TL.Stats_BroadcastStats` / `TL.Stats_MegagroupStats`.
 * Todas las fichas llevan su periodo anterior porque las dos bibliotecas lo guardan junto al valor
 * (`StatisticalValue.previousValue` allá, `StatsAbsValueAndPrev.previous` aquí), salvo `notifications`, que en TDLib es
 * un `double` suelto y en MTProto un `StatsPercentValue{part,total}` sin pasado: sin dato anterior no se pinta flecha,
 * y esa es la razón por la que la vista también la muestra sola. Los grupos traen además la tabla de los que más
 * escriben, que es lo único que un supergrupo sabe de sus personas.
 */
function statsSample(channel: boolean): CommunityStats {
  if (channel) return {
    kind: 'channel', from: '2026-10-20', to: '2026-11-19',
    values: [
      { id: 'members', value: 1200, previous: 1000 },
      { id: 'viewsPerPost', value: 430, previous: 400 },
      { id: 'sharesPerPost', value: 12, previous: 9 },
      { id: 'reactionsPerPost', value: 30, previous: 25 },
      { id: 'viewsPerStory', value: 210, previous: 186 },
      { id: 'sharesPerStory', value: 8, previous: 11 },
      { id: 'reactionsPerStory', value: 22, previous: 22 },
      { id: 'notifications', value: 64.5 },
    ],
    top: [],
  };
  return {
    kind: 'group', from: '2026-10-20', to: '2026-11-19',
    values: [
      { id: 'members', value: 80, previous: 74 },
      { id: 'messages', value: 1400, previous: 1200 },
      { id: 'viewers', value: 55, previous: 50 },
      { id: 'senders', value: 9, previous: 6 },
    ],
    top: [
      { name: 'María Fernández', messages: 40, avgChars: 120 },
      { name: 'Diego Salaverría', messages: 27, avgChars: 96 },
      { name: ROSTER_UNKNOWN_NAME, messages: 12, avgChars: 60 },
    ],
  };
}

// Las filas del registro de llamadas (ronda CL). `fetched` es lo que la página traía antes de recortar por nombre y
// `shown` lo que sobrevive: la pantalla tiene que poder decir las dos cifras porque el servidor no sabe de nombres.
const CALL_LOG_DESIGN_PAGE = 5;
const designCallRows: Array<{ chat: string; reason: CallReason; video: boolean; group: boolean; missed: boolean; ongoing?: boolean; seconds: number }> = [
  { chat: '11', reason: 'missed', video: false, group: false, missed: true, seconds: 0 },
  { chat: '17', reason: 'ended', video: false, group: false, missed: false, seconds: 95 },
  { chat: '15', reason: 'ended', video: true, group: false, missed: false, seconds: 3840 },
  { chat: '12', reason: 'ended', video: true, group: true, missed: false, ongoing: true, seconds: 0 },
  { chat: '13', reason: 'declined', video: false, group: false, missed: true, seconds: 0 },
  { chat: '26', reason: 'missed', video: true, group: false, missed: true, seconds: 0 },
  { chat: '14', reason: 'ended', video: true, group: true, missed: false, seconds: 1250 },
  { chat: '18', reason: 'disconnected', video: false, group: false, missed: false, seconds: 30 },
  { chat: '19', reason: 'ended', video: true, group: false, missed: false, seconds: 210 },
  { chat: '1', reason: 'missed', video: false, group: false, missed: true, seconds: 0 },
  { chat: '22', reason: 'declined', video: true, group: false, missed: true, seconds: 0 },
  { chat: '24', reason: 'missed', video: true, group: true, missed: true, seconds: 0 },
  { chat: '17', reason: 'ended', video: false, group: false, missed: false, seconds: 45 },
  { chat: '15', reason: 'ended', video: false, group: false, missed: false, seconds: 600 },
  { chat: '24', reason: 'missed', video: false, group: true, missed: true, seconds: 0 },
];
// El puente recuerda el cursor que repartió (`NativeBridge.java:5354`); aquí lo recuerda esta variable, y con ella la
// pantalla puede comprobar de verdad que un cursor viejo se niega en vez de devolver otra página.
let designCalls: { owner: string; onlyMissed: boolean; cursor: string } | null = null;

/**
 * `callLog` (`NativeBridge.java:5406-5435`): primero el cursor, luego la guarda de que siga el recorrido de esta
 * pantalla, y solo después el recorte por nombre —que es local, porque `SearchCallMessages` no tiene `query`—. El
 * título lo pone la lista de chats real, así que una fila no puede prometer un nombre que la bandeja no muestre.
 */
function designCallPage(params: Record<string, unknown>, state: State): CallLogPage {
  const refusal = callLogOffsetProblem(params.offset);
  if (refusal) throw new Error(refusal);
  const onlyMissed = params.onlyMissed === true;
  const query = typeof params.query === 'string' ? params.query.trim() : '';
  const cursor = typeof params.offset === 'string' ? params.offset : '';
  if (cursor !== '' && (!designCalls || designCalls.owner !== state.selfId || designCalls.onlyMissed !== onlyMissed || designCalls.cursor !== cursor)) {
    throw new Error(CALL_LOG_REFUSALS.staleCursor);
  }
  const start = cursor === '' ? 0 : Number(cursor);
  const pool: CallLogEntry[] = designCallRows.map((row, index) => ({
    chatId: row.chat, messageId: String(7001 + index), title: state.chats.find(chat => chat.id === row.chat)?.title ?? '',
    label: callRowLabel(row.reason, row.video, row.group, row.seconds, row.ongoing === true),
    date: serviceSeed - index * 5400, missed: row.missed, video: row.video, group: row.group,
    duration: row.ongoing ? 0 : row.seconds,
  }));
  const page = callLogPage(pool, start, query, onlyMissed, pool.length, CALL_LOG_DESIGN_PAGE);
  designCalls = { owner: state.selfId, onlyMissed, cursor: page.nextOffset };
  return page;
}
/**
 * `share.import`. El puente Android mueve lo ya copiado en `share-inbox` al outbox de la cuenta y la
 * conversación elegidas; el andamio no recibe intents de Android, así que reproduce las normas del brazo:
 * entre 1 y 10 piezas, conversación existente, nombre saneado, MIME acotado y el tope de la cuenta por
 * pieza. El contenido se dice por parámetros —nombre, tamaño, mime— igual que en `attachment.pick`; si una
 * pieza falla no se registra ninguna, que es el retroceso del brazo real.
 */
function desktopShareImport(params: Record<string, unknown>, state: State) {
  const chat = String(params.chat ?? '');
  if (!state.chats.some(entry => entry.id === chat)) throw new Error('La conversación ya no está disponible.');
  const items = Array.isArray(params.items) ? params.items : [];
  if (items.length < 1 || items.length > 10) throw new Error('Comparte entre 1 y 10 archivos.');
  const premium = state.wallet?.premium === true;
  const staged: DesktopOutbox[] = [];
  for (const raw of items) {
    const entry = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const fromPath = typeof entry.path === 'string' ? entry.path.split(/[\/]/).pop() ?? '' : '';
    const name = attachmentNameOf(typeof entry.name === 'string' ? entry.name : fromPath);
    const size = Number(entry.size ?? 512 * 1024);
    if (size > attachMaxBytes(premium)) throw new Error(premium ? ATTACH_REFUSALS.tooBigPremium : ATTACH_REFUSALS.tooBig);
    const declared = typeof entry.mime === 'string' ? entry.mime : '';
    if (declared.length > 100) throw new Error('El tipo del archivo compartido no es válido.');
    const mime = declared === '' ? attachmentMimeOf(name) : declared;
    staged.push({ token: `a${++desktopAttachSeq}`, name, mime, size, account: state.selfId, chat });
  }
  desktopOutbox.push(...staged);
  return staged.map(item => ({ token: item.token, name: item.name, size: item.size, mime: item.mime }));
}
