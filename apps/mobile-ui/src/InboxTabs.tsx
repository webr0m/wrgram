import { useState, useSyncExternalStore } from 'react';
import { Archive, ArrowDown, ArrowUp, Ban, Bell, Bookmark, Bot, Eye, EyeOff, Flame, Globe, Hash, Heart, Image, LockKeyhole, Megaphone, Pencil, Pin, Plus, Send, Star, Trash2, Users, type LucideIcon } from 'lucide-react';
import { snapshot, subscribe } from './bridge';
import { arrangeTabs, defaultRules, TAB_EMOJIS, TAB_ICONS, type InboxTab, type TabEmoji, type TabRules } from './chatFilters';
import type { State } from './contract';
import { CustomEmoji } from './CustomEmoji';
import { PremiumEmojiPicker } from './EmojiStatusSettings';
import './inbox-tabs.css';

const TYPES = [['any','Todos'],['private','Personas'],['group','Grupos y foros'],['channel','Canales'],['bot','Bots'],['secret','Chats secretos']] as const;

const TAB_ICON_PARTS:Record<string,LucideIcon>={hash:Hash,bookmark:Bookmark,star:Star,megaphone:Megaphone,users:Users,send:Send,bot:Bot,lock:LockKeyhole,pin:Pin,archive:Archive,image:Image,heart:Heart,globe:Globe,bell:Bell,flame:Flame};

export function InboxTabIcon({icon,placeholder=false}:{icon?:string;placeholder?:boolean}) {
  const Icon=icon ? TAB_ICON_PARTS[icon] : undefined;
  return Icon ? <Icon size={15} aria-hidden="true"/> : placeholder ? <Ban size={14} aria-hidden="true"/> : null;
}

export function InboxTabEmoji({emoji}:{emoji:TabEmoji}) {
  return <span className="inbox-tab-emoji" aria-hidden="true">
    {emoji.kind==='preset' ? TAB_EMOJIS[emoji.id] ?? '✨'
      : <CustomEmoji id={emoji.id} emoji={emoji.emoji} size={23}/>}
  </span>;
}

export function InboxTabs({ initial, folders, save }: {
  initial:InboxTab[]; folders:State['folders']; save(tabs:InboxTab[]):Promise<boolean>;
}) {
  const [draft,setDraft]=useState(initial);
  const [selected,select]=useState(initial[0]?.id ?? '');
  const [busy,setBusy]=useState(false);
  const [picker,setPicker]=useState<'preset'|'premium'>();
  const premium=useSyncExternalStore(subscribe,()=>snapshot().wallet?.premium===true);
  const item=draft.find(tab=>tab.id===selected);
  const source=item?.rules?.source;
  const missingFolder=source?.startsWith('folder:')&&!folders.some(folder=>'folder:'+folder.id===source);
  const canSave=draft.some(tab=>!tab.hidden)&&draft.every(tab=>tab.name.trim());
  function update(change:Partial<InboxTab>) {
    setDraft(tabs=>tabs.map(tab=>tab.id===selected?{...tab,...change}:tab));
  }
  function chooseTab(id:string) {
    select(id);
    setPicker(undefined);
  }
  function chooseEmoji(emoji?:TabEmoji) {
    update({emoji});
    setPicker(undefined);
  }
  function rule<K extends keyof TabRules>(key:K,value:TabRules[K]) {
    if(item?.rules)update({rules:{...item.rules,[key]:value}});
  }
  function move(index:number,direction:number) {
    setDraft(tabs=>{
      const copy=[...tabs],target=index+direction;
      [copy[index],copy[target]]=[copy[target],copy[index]];
      return copy;
    });
  }
  function add() {
    const id='custom:'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
    setDraft(tabs=>[...tabs,{id,name:'Nueva pestaña',rules:{...defaultRules}}]);chooseTab(id);
  }
  function remove() {
    const remaining=draft.filter(tab=>tab.id!==selected);
    setDraft(remaining);chooseTab(remaining[0]?.id??'');
  }
  return <div className="tabs-manager">
    <p className="settings-note tabs-manager-note">Los cambios se guardan en WRGram para esta cuenta.</p>
    <div className="tabs-manager-list">
      {draft.map((tab,index)=><div className="tabs-manager-row" key={tab.id}>
        <button type="button" className="tabs-select" aria-pressed={selected===tab.id} disabled={busy} onClick={()=>chooseTab(tab.id)}>{tab.emoji?<InboxTabEmoji emoji={tab.emoji}/>:<Pencil size={15}/>}<span className="tabs-select-name">{tab.name||'Sin nombre'}</span>{tab.hidden&&<EyeOff size={15}/>}</button>
        <button type="button" aria-label={'Subir '+tab.name} disabled={busy||index===0} onClick={()=>move(index,-1)}><ArrowUp size={17}/></button>
        <button type="button" aria-label={'Bajar '+tab.name} disabled={busy||index===draft.length-1} onClick={()=>move(index,1)}><ArrowDown size={17}/></button>
      </div>)}
    </div>
    {item&&<div className="tabs-editor" key={item.id}>
      <label>Nombre<input value={item.name} maxLength={28} disabled={busy} onChange={event=>update({name:event.target.value})}/></label>
      <fieldset className="tabs-appearance" disabled={busy}>
        <legend>Etiqueta visible</legend>
        <div className="tabs-appearance-options" role="group" aria-label="Formato de la pestaña">
          <button type="button" className="secondary" aria-pressed={!picker&&!item.emoji} onClick={()=>chooseEmoji()}>Nombre</button>
          <button type="button" className="secondary" aria-expanded={picker==='preset'} onClick={()=>setPicker(picker==='preset'?undefined:'preset')}>Emojis de WRGram</button>
          <button type="button" className="secondary" aria-expanded={picker==='premium'} onClick={()=>setPicker(picker==='premium'?undefined:'premium')}>Emojis Premium</button>
        </div>
        {item.emoji&&<p className="tabs-label-preview"><InboxTabEmoji emoji={item.emoji}/><span>{item.emoji.kind==='premium'?'Emoji de Telegram Premium':'Emoji de WRGram'}</span></p>}
        {picker==='preset'&&<div className="tabs-icon-picker tabs-preset-picker" role="group" aria-label="Emojis de WRGram">
          {TAB_ICONS.filter(([key])=>key).map(([id,label])=><button key={id} type="button" aria-label={label} title={label}
            aria-pressed={item.emoji?.kind==='preset'&&item.emoji.id===id} onClick={()=>chooseEmoji({kind:'preset',id})}>
            <span aria-hidden="true">{TAB_EMOJIS[id]}</span>
          </button>)}
        </div>}
        {picker==='premium'&&(premium
          ? <PremiumEmojiPicker pick={({id,emoji})=>chooseEmoji({kind:'premium',id,emoji})}/>
          : <p className="settings-note">Los packs de Telegram están disponibles con Premium.</p>)}
      </fieldset>
      {!item.emoji&&!picker&&<div className="tabs-icon-picker" role="group" aria-label="Icono de la pestaña">
        {TAB_ICONS.map(([key,label])=><button key={key||'none'} type="button" title={label} aria-label={label}
          aria-pressed={(item.icon||'')===key} disabled={busy} onClick={()=>update({icon:key||undefined})}>
          <InboxTabIcon icon={key} placeholder/>
        </button>)}
      </div>}
      {item.rules&&<div className="tabs-rules">
        <label>Origen<select value={item.rules.source} disabled={busy} onChange={event=>rule('source',event.target.value)}><option value="main">Bandeja principal</option><option value="archive">Archivados</option>{folders.map(folder=><option key={folder.id} value={'folder:'+folder.id}>{folder.title}</option>)}{missingFolder&&<option value={source} disabled>Carpeta no disponible · se usa Bandeja principal</option>}</select></label>
        <label>Tipo<select value={item.rules.type} disabled={busy} onChange={event=>rule('type',event.target.value as TabRules['type'])}>{TYPES.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label>Lectura<select value={item.rules.read} disabled={busy} onChange={event=>rule('read',event.target.value as TabRules['read'])}><option value="any">Todos</option><option value="unread">No leídos</option><option value="read">Leídos</option></select></label>
        <label>Notificaciones<select value={item.rules.muted} disabled={busy} onChange={event=>rule('muted',event.target.value as TabRules['muted'])}><option value="any">Todas</option><option value="muted">Silenciados</option><option value="unmuted">Con avisos</option></select></label>
        <label className="tabs-check"><input type="checkbox" checked={item.rules.pinned} disabled={busy} onChange={event=>rule('pinned',event.target.checked)}/>Solo fijados</label>
      </div>}
      <div className="settings-actions">
        <button type="button" className="secondary" disabled={busy} onClick={()=>update({hidden:!item.hidden})}>{item.hidden?<Eye size={16}/>:<EyeOff size={16}/>} {item.hidden?'Mostrar':'Ocultar'}</button>
        {item.rules&&<button type="button" className="secondary" disabled={busy} onClick={remove}><Trash2 size={16}/> Quitar pestaña</button>}
      </div>
    </div>}
    <div className="settings-actions">
      <button type="button" className="secondary" onClick={add} disabled={busy||draft.length>=36}><Plus size={16}/> Pestaña personalizada</button>
      <button type="button" className="secondary" disabled={busy} onClick={()=>{const defaults=arrangeTabs(folders,[]);setDraft(defaults);chooseTab(defaults[0].id);}}>Restaurar orden</button>
    </div>
    <div className="tabs-manager-save">
      {!canSave&&<p className="settings-note" role="status">Deja al menos una pestaña visible y escribe un nombre para cada una.</p>}
      <button type="button" className="primary" disabled={busy||!canSave} onClick={()=>{setBusy(true);void save(draft.map(tab=>({...tab,name:tab.name.trim()}))).finally(()=>setBusy(false));}}>Guardar pestañas</button>
    </div>
  </div>;
}
