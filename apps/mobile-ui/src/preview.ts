import { EMPTY, type Chat, type ForumTopicInfo, type GroupAdminRights, type GroupMember, type Message, type State, type StoryAlbum, type TextEntity } from './contract';
import { acceptState, snapshot } from './bridge';
import { normalizeSearch } from './inboxModel';
const ownBio='Construyendo WRGram, un cliente de Telegram propio. Novedades en https://wrgram.app y dudas por @rodrigo_web';
const mariaBio='Diseñadora de producto. Portfolio en https://maria.design · escríbeme por @maria_fdz';
const communityBio='Un espacio para construir juntos. Guía y descargas en https://wrgram.app';
function entitiesOf(text:string,items:[('link'|'mention'),string][]):TextEntity[]{return items.flatMap(([type,value])=>{const offset=text.indexOf(value);return offset<0?[]:[{type,offset,length:value.length,...(type==='link'?{url:value}:{})}];});}
// Development only; Vite removes this branch and module from the Android production assets.
export async function designRequest(method: string, params: Record<string, unknown>) {
  const state = snapshot();
  if (method === 'appearance') { acceptState({ ...state, appearance: { ...state.appearance, ...params } }); return true; }
  if (method === 'account.profile') return { id:'1', firstName:'Rodrigo', lastName:'', username:'rodrigo', usernames:['rodrigo'], editableUsername:'rodrigo', bio:ownBio, bioEntities:entitiesOf(ownBio,[['link','https://wrgram.app'],['mention','@rodrigo_web']]), photoId:'0', phoneNumber:'+34600111222', birthday:{ day:14, month:6, year:1994 }, business:{ address:'Calle Mayor 1, Madrid', timeZoneId:'Europe/Madrid', nextOpenIn:0, nextCloseIn:5400, hours:[{startMinute:540,endMinute:1080},{startMinute:1980,endMinute:2520},{startMinute:3420,endMinute:3960},{startMinute:4860,endMinute:5400},{startMinute:6300,endMinute:6840}] } };
  if (method === 'chat.profile') {
    const id = String(params.id);
    if (id === '11') return { id:'501', title:'María Fernández', username:'maria_fdz', usernames:['maria_fdz'], bio:mariaBio, bioEntities:entitiesOf(mariaBio,[['link','https://maria.design'],['mention','@maria_fdz']]), bot:false };
    if (id === '14') return { id:'-1001', title:'WRGram · Comunidad', username:'wrgram_community', usernames:['wrgram_community'], bio:communityBio, bioEntities:entitiesOf(communityBio,[['link','https://wrgram.app']]), bot:false };
    return { id, title:'', username:'', usernames:[], bio:'', bioEntities:[], bot:false };
  }
  if (method === 'clipboard.copy') return true;
  if (method === 'contacts.open') return String(params.id);
  if (method === 'privacy.get') return previewPrivacy;
  if (method === 'privacy.set') { previewPrivacy = previewPrivacy.map(item => item.key === params.key ? { ...item, value:String(params.value||''), allowUsers:(params.allowUsers as string[])||[], restrictUsers:(params.restrictUsers as string[])||[] } : item); return true; }
  if (method === 'history.byDate') {
    return state.messages.filter(message => message.date <= Number(params.at)).at(-1)?.id ?? null;
  }
  if (method === 'chat.saved') return designRequest('chat.open', { id:'1' });
  if (method === 'chats.search') {
    const scope = params.scope === 'public' ? 1 : 0;
    const query = normalizeSearch(String(params.query || ''));
    return lookupChats.filter((chat, index) => index === scope && normalizeSearch(chat.title + ' ' + chat.username).includes(query));
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
  if (method === 'chats.list') {
    const archive=params.list==='archive';
    acceptState({ ...state, chatsEnd:archive, chats:fixture.chats.map(chat => ({ ...chat, inList:chat.archived===archive })) });
    return true;
  }
  if (method === 'chat.open') {
    const id = String(params.id);
    const existing = state.chats.find(item => item.id === id);
    const discovered = lookupChats.find(item => item.id === id);
    const base = id === '21' ? longHistory : id === '17' ? longHistory.map((message,index)=>({...message,chatId:id,date:serviceSeed-(41-index)*86400})) : id === '11' || id === '14' ? fixture.messages.map(message => ({ ...message, chatId: id })) : [];
    const extra = [...galleryItems, ...savedItems].filter(item => item.chatId === id);
    const sorted=[...base,...extra].sort((a,b)=>a.date-b.date||Number(a.id)-Number(b.id));
    const at=params.messageId?sorted.findIndex(message=>message.id===params.messageId):-1;
    const firstUnread=id==='21'&&existing?.unread?sorted.findIndex(message=>Number(message.id)>Number(existing.readInbox)): -1;
    const from=at>=0?Math.max(0,at-4):firstUnread>=0?Math.max(0,firstUnread-4):0;
    const end=at>=0?Math.min(sorted.length,at+5):firstUnread>=0?Math.min(sorted.length,firstUnread+14):sorted.length;
    acceptState({
      ...state, active: id, canSend: id === '11' || id === '1',
      chats: !existing && discovered ? [...state.chats, discovered] : state.chats,
      topic: { id: 0, name: '', closed: false },
      messages:sorted.slice(from,end),
      history:{loading:false,error:'',end:from===0,latest:end===sorted.length,anchor:'0'},
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
  if (method === 'contacts.sync.status') return syncState;
  if (method === 'contacts.sync.set') { syncState = { ...syncState, enabled: Boolean(params.value) }; return syncState; }
  if (method === 'contacts.sync.now') { syncState = { ...syncState, last: Math.floor(Date.now()/1000), matched: 12, imported: 24, skipped: false, error: '' }; return syncState; }
  if (method === 'groups.members') return groupMembers;
  if (method === 'groups.members.page') { const filter = String(params.filter || 'recent'); const query = String(params.query || '').toLowerCase(); const members = groupMembers.filter(member => (!query || member.name.toLowerCase().includes(query)) && (filter === 'recent' || (filter === 'administrators' ? member.status === 'Administrador' : filter === 'banned' ? member.banned : filter === 'restricted' ? member.restricted : filter === 'bots' ? member.bot : true))); return { members, nextOffset: members.length, hasMore: false }; }
  if (method === 'groups.member.ban' || method === 'groups.member.restrict' || method === 'groups.member.promote' || method === 'groups.member.demote' || method === 'groups.member.unban') return true;
  if (method === 'groups.createSuper') return { id: '99' };
  if (method === 'chat.username') return { editable: '', active: [] };
  if (method === 'chat.username.set') return true;
  if (method === 'story.albums.list') return storyAlbums;
  if (method === 'story.albums.create') return { id: 3, name: String(params.name || 'Nuevo álbum') };
  if (method === 'story.albums.rename') return { ...storyAlbums[1], name: String(params.name || storyAlbums[1].name) };
  if (method === 'story.albums.add' || method === 'story.albums.remove' || method === 'story.albums.story.order') return storyAlbums[1];
  if (method === 'story.albums.delete' || method === 'story.albums.order') return true;
  if (method === 'story.albums.stories') return { stories: [], nextOffset: 0, hasMore: false };
  if (method === 'chat.transfer.check') return { state: 'password', retryAfter: 0 };
  if (method === 'chat.transfer') return true;
  if (method === 'forum.topics') return topics;
  if (method === 'forum.open') { const topic = topics.find(item => item.id === Number(params.topicId)); if (!topic) throw new Error('Tema no disponible en la vista sintética.'); acceptState({ ...state, active: String(params.id), topic: { id: topic.id, name: topic.name, closed: topic.closed, unread:topic.unread,readInbox:topic.unread?'103':'112' }, messages: fixture.messages.map(message => ({ ...message, chatId: String(params.id) })) }); return true; }
  if (method === 'forum.close') { acceptState({ ...state, topic: { id: 0, name: '', closed: false }, messages: [] }); return true; }
  if (method === 'forum.create') return { ...topics[1], id: 9, name: String(params.name || 'Nuevo tema'), general: false };
  if (method === 'forum.rename' || method === 'forum.closed' || method === 'forum.delete') return true;
  if (method === 'chat.pinned') return state.active === '14' ? fixture.messages[1] : null;
  if (method === 'chats.list' || method === 'error.clear') return true;
  throw new Error('Vista sintética: esta acción requiere una cuenta real en Android. No se ha enviado nada.');
}
const adminRights: GroupAdminRights = { canChangeInfo:true, canPostMessages:false, canEditMessages:true, canDeleteMessages:true, canInviteUsers:true, canRestrictMembers:true, canPinMessages:true, canManageTopics:true, canPromoteMembers:false, canManageVideoChats:false, canPostStories:true, canEditStories:false, canDeleteStories:false, canManageDirectMessages:false, canManageTags:false, canSendWelcomeMessages:false };
const groupMembers: GroupMember[] = [
  { id: '501', name: 'Álex Moreno', status: 'Administrador', canBan: false, canPromote: false, canDemote: true, canEditRights: true, currentRights: adminRights, adminRights },
  { id: '502', name: 'María Fernández', status: 'Miembro', canBan: true, canRestrict: true, canPromote: true, canDemote: false, adminRights },
  { id: '503', name: 'Sofía López', status: 'Restringido', canBan: true, canUnban: true, canRestrict: true, canPromote: false, canDemote: false, restricted: true, until: Math.floor(Date.now()/1000)+86400, adminRights },
  { id: '504', name: 'Bot de moderación', status: 'Miembro', bot: true, canBan: true, canRestrict: true, canPromote: false, canDemote: false },
];
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
let previewPrivacy:{ key:string; value:string; allowUsers:string[]; restrictUsers:string[] }[] = [
  { key:'status', value:'contacts', allowUsers:[], restrictUsers:[] },
  { key:'profilePhoto', value:'everyone', allowUsers:[], restrictUsers:[] },
  { key:'phone', value:'contacts', allowUsers:[], restrictUsers:[] },
  { key:'bio', value:'everyone', allowUsers:[], restrictUsers:[] },
  { key:'birthdate', value:'nobody', allowUsers:[], restrictUsers:[] },
  { key:'forwards', value:'everyone', allowUsers:[], restrictUsers:[] },
  { key:'calls', value:'contacts', allowUsers:[], restrictUsers:[] },
  { key:'voiceMessages', value:'contacts', allowUsers:[], restrictUsers:[] },
  { key:'invites', value:'everyone', allowUsers:[], restrictUsers:[] },
  { key:'findPhone', value:'contacts', allowUsers:[], restrictUsers:[] },
];
const serviceSeed=Math.floor(Date.now()/1000);
const lookupChats: Chat[] = [
  { id: '991', title: 'Club de lectura', username: 'club_lectura', type: 'group' },
  { id: '992', title: 'Astronomía en Chile', username: 'astronomia_cl', type: 'channel' },
].map(chat => ({ ...chat, preview: '', date: 0, unread: 0, marked: false, bot: false, pinned: false, muted: false, archived: false, supported: true, inList: false }));
const longHistory:Message[]=Array.from({length:42},(_,index)=>({id:String(1001+index),chatId:'21',sender:'Vista de diseño',text:'Mensaje de seguimiento '+(index+1),date:serviceSeed-(42-index)*300,outgoing:false,status:'',edited:false,reactions:[]}));
const collectionMessage = { sender: 'Vista de diseño', outgoing: false, status: '' as const, edited: false, reactions: [] };
const savedItems: (Message & { origin: string })[] = [
  { ...collectionMessage, id: '301', chatId: '1', origin: '14', text: 'Ideas para la siguiente edición', date: serviceSeed },
  { ...collectionMessage, id: '302', chatId: '1', origin: '1', text: 'Revisar el prototipo', date: serviceSeed - 1800 },
  { ...collectionMessage, id: '303', chatId: '1', origin: '-24', text: 'Mensaje reenviado', date: serviceSeed - 7200 },
];
const galleryItems: (Message & { filter: string })[] = [
  { ...collectionMessage, id: '205', chatId: '14', filter: 'photos', text: 'Foto de la última reunión', date: serviceSeed, media: { id: 0, ready: false, kind: 'image', mime: 'image/jpeg', name: 'Foto de la reunión', size: 0, minithumbnail: '/bots/snake.jpg' } },
  { ...collectionMessage, id: '204', chatId: '14', filter: 'videos', text: 'Vídeo de presentación', date: serviceSeed - 2400 },
  { ...collectionMessage, id: '203', chatId: '14', filter: 'photos', text: 'Foto del primer boceto', date: Math.floor(new Date(2024, 1, 29, 16).getTime() / 1000) },
  { ...collectionMessage, id: '202', chatId: '14', filter: 'documents', text: 'Guía del proyecto', date: serviceSeed - 3600 },
  { ...collectionMessage, id: '201', chatId: '14', filter: 'links', text: 'Sitio del proyecto https://wrgram.app', date: serviceSeed - 3700 },
];
function designPage<T extends { id: string }>(items: T[], cursor: unknown) {
  const start = cursor ? items.findIndex(item => item.id === cursor) + 1 : 0;
  const page = items.slice(start, start + 2);
  return { items: page, next: start + page.length < items.length ? page.at(-1)?.id || '' : '' };
}
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
export const fixture: State = { ...EMPTY, contactsSync: syncState, ready: true, name: 'Rodrigo', selfId: '1', online: true, connection: 'Vista de diseño · datos sintéticos', active: '14', canSend: false, history:{ loading:false,error:'',end:true,latest:true },
  chats: [
    ['11','María Fernández','Me encanta cómo está quedando ✨',2,'private'],['12','Equipo de diseño','Álex: Ya dejé los nuevos bocetos',7,'group'],['13','Daniel Ruiz','Foto',0,'private'],['14','WRGram · Comunidad','Un espacio para construir juntos',3,'group'],['15','Sofía López','¡Nos vemos mañana! 👋',0,'private'],['16','Productividad','Recordatorio de tu próximo evento',1,'bot'],['17','Javier Morales','Gracias, lo reviso esta tarde',0,'private'],['18','Ideas & café','Lucía: ¿Qué opinan de esta idea?',0,'group'],['19','Viaje a Valparaíso','Fotos del viaje',0,'private'],['1','Mensajes guardados','Notas y enlaces',0,'private'],['21','Seguimiento','Mensaje de seguimiento 42',32,'private'],
  ].map(([id,title,preview,unread,type],i)=>({id:String(id),title:String(title),preview:String(preview),date:Math.floor(Date.now()/1000)-i*2200,unread:Number(unread),marked:false,bot:type==='bot',type:String(type),pinned:i<2,muted:i===3,archived:String(id)==='19',inList:String(id)!=='19',supported:true,...(String(id)==='13'?{draft:'Te envío la foto después'}:{}),supergroup:String(id)==='12'||String(id)==='14',isForum:String(id)==='12',...(String(id)==='21'?{readInbox:'1010'}:String(id)==='17'?{readInbox:'1042'}:String(id)==='11'||String(id)==='14'?{readInbox:'103'}:{})})),
  messages: [
    ['101',false,'Hola 👋 ¿Cómo va la nueva versión de WRGram? @rodrigo #WRGram',-90000],['102',true,'¡Mucho mejor! Estamos cuidando cada detalle. Que se sienta sencillo, pero que tenga todo a mano.',-3400],['103',false,'Justo eso. Una interfaz que te deje conversar sin distraerte.',-3200],['104',true,'Un espacio más limpio. Y los complementos tendrán su propio lugar, sin mezclarse con tus chats.',-3000],['105',false,'Me encanta cómo está quedando ✨',-2800],
  ].map(([id,outgoing,text,time]):Message=>({id:String(id),chatId:'11',sender:outgoing?'Tú':'María Fernández',text:String(text),date:Math.floor(Date.now()/1000)+Number(time),outgoing:Boolean(outgoing),status:outgoing?'read':'',edited:false,reactions:[],...(String(id)==='101'?{entities:[{type:'bold' as const,offset:0,length:4},{type:'mention' as const,offset:45,length:8},{type:'hashtag' as const,offset:54,length:7}]}:{})})).concat(serviceMessages),
};

