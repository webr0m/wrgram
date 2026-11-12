import type { Chat, State } from './contract';

export type TabRules = {
  source:string; type:'any'|'private'|'group'|'channel'|'bot'|'secret';
  read:'any'|'read'|'unread'; muted:'any'|'muted'|'unmuted'; pinned:boolean;
};
export type TabEmoji =
  | { kind:'preset'; id:string }
  | { kind:'premium'; id:string; emoji?:string };
export type InboxTab = { id:string; name:string; hidden?:boolean; icon?:string; emoji?:TabEmoji; rules?:TabRules };
export const TAB_ICONS:[string,string][]=[['','Sin icono'],['hash','Etiqueta'],['bookmark','Marcador'],['star','Estrella'],['megaphone','Megáfono'],['users','Personas'],['send','Enviar'],['bot','Bot'],['lock','Candado'],['pin','Fijado'],['archive','Archivados'],['image','Multimedia'],['heart','Favorito'],['globe','Público'],['bell','Avisos'],['flame','Tendencia']];
export const TAB_EMOJIS: Readonly<Record<string, string>> = {
  hash:'💬', bookmark:'🔖', star:'⭐', megaphone:'📣', users:'👥',
  send:'✈️', bot:'🤖', lock:'🔒', pin:'📌', archive:'📦',
  image:'🖼️', heart:'❤️', globe:'🌐', bell:'🔔', flame:'🔥',
};
export const defaultRules:TabRules={source:'main',type:'any',read:'any',muted:'any',pinned:false};

export function arrangeTabs(folders:State['folders'], saved:InboxTab[]):InboxTab[] {
  const defaults=chatFilters(folders).map(([id,name]):InboxTab=>({id,name}));
  const ids=new Set([...defaults.map(tab=>tab.id),...folders.map(folder=>'folder:'+folder.id)]);
  const included=saved.filter(tab=>tab.id.startsWith('custom:')?!!tab.rules:ids.has(tab.id));
  const present=new Set(included.map(tab=>tab.id));
  return [...included,...defaults.filter(tab=>!present.has(tab.id))];
}

export function visibleTabId(id:string,tabs:readonly InboxTab[]):string {
  if(id==='archive'||tabs.some(tab=>tab.id===id&&!tab.hidden))return id;
  return tabs.find(tab=>!tab.hidden)?.id??'all';
}

export function tabSource(id:string,tabs:InboxTab[],folders:State['folders']):string {
  const source=tabs.find(tab=>tab.id===id)?.rules?.source ?? (id==='archive'||id.startsWith('folder:')?id:'main');
  return source.startsWith('folder:')&&!folders.some(folder=>source==='folder:'+folder.id)?'main':source;
}

export function matchesTab(chat:Chat,rules:TabRules):boolean {
  const unread=chat.unread>0||chat.marked;
  return (rules.type==='any'||(rules.type==='bot'?chat.bot:chat.type===rules.type&&!(rules.type==='private'&&chat.bot)))
    && (rules.read==='any'||(rules.read==='unread')===unread)
    && (rules.muted==='any'||(rules.muted==='muted')===chat.muted)
    && (!rules.pinned||chat.pinned);
}

export const CHAT_FILTERS:[string,string][]=[['all','Todos'],['unread','No leídos'],['channels','Canales'],['secret','Secretos'],['groups','Grupos'],['bots','Bots']];

const keyOf=(title:string)=>title.trim().toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ');

/** Plural form of a filter title; only used to drop a folder that repeats another one. */
const singular=(key:string)=>key.endsWith('es')?key.slice(0,-2):key.endsWith('s')?key.slice(0,-1):key;

/**
 * Built-in filters followed by the account's Telegram folders, hiding folders whose
 * title repeats a built-in filter (a server folder called "No leídos") or the singular
 * of another folder ("Personales" next to "Personal"). The folders stay in Telegram.
 */
export function chatFilters(folders:State['folders']):[string,string][]{
  const names=new Map<string,string>();
  for(const [,label] of CHAT_FILTERS)names.set(keyOf(label),label);
  for(const folder of folders){const label=(folder.title||'').trim();if(label)names.set(keyOf(label),label);}
  const seen=new Set(CHAT_FILTERS.map(([,label])=>keyOf(label)));
  const items:[string,string][]=CHAT_FILTERS.map(([key,label])=>[key,label]);
  for(const folder of folders){
    const label=(folder.title||'').trim(),key=keyOf(label);
    if(!label||seen.has(key))continue;
    if(singular(key)!==key&&names.has(singular(key)))continue;
    seen.add(key);items.push([`folder:${folder.id}`,label]);
  }
  return items;
}
