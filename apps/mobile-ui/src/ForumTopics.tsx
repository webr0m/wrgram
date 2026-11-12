import { useEffect, useState } from 'react';
import { ChevronRight, Hash, LoaderCircle, LockKeyhole, MessageCircle, MoreHorizontal, Pencil, Pin, Search } from 'lucide-react';
import type { Chat, ForumTopicInfo } from './contract';
import { CustomEmoji } from './CustomEmoji';
import './forum-topics.css';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

const dateText=(date:number)=>{
  const value=new Date(date*1000);
  const today=new Date();
  return value.toDateString()===today.toDateString()?new Intl.DateTimeFormat('es',{hour:'2-digit',minute:'2-digit'}).format(value):new Intl.DateTimeFormat('es',{day:'2-digit',month:'2-digit'}).format(value);
};

export function ForumTopics({chat,run,version,manage,create}:{chat:Chat;run:Run;version:number;manage():void;create():void}){
  const [topics,setTopics]=useState<ForumTopicInfo[]>([]),[query,setQuery]=useState(''),[busy,setBusy]=useState(true),[opening,setOpening]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    setBusy(true);
    void run<ForumTopicInfo[]>('forum.topics',{id:chat.id}).then(value=>{if(!cancelled)setTopics(value??[]);}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[chat.id,version]);
  async function open(topic:ForumTopicInfo){
    if(opening)return;
    setOpening(topic.id);
    try{await run('forum.open',{id:chat.id,topicId:topic.id});}finally{setOpening(0);}
  }
  // Telegram returns pinned topics first; keep that order inside each group.
  const ordered=[...topics].sort((a,b)=>Number(!!b.pinned)-Number(!!a.pinned));
  const needle=query.trim().toLocaleLowerCase();
  const filtered=needle?ordered.filter(topic=>`${topic.name} ${topic.lastText??''}`.toLocaleLowerCase().includes(needle)):ordered;
  const unread=topics.reduce((total,topic)=>total+(topic.unread??0),0);
  return <><section className="forum-topics" aria-label={`Temas de ${chat.title}`}>
    <header className="forum-topics-head"><div><strong>Temas</strong><small>{topics.length===1?'1 tema':`${topics.length} temas`}{unread>0?` · ${unread} sin leer`:''}</small></div><div className="forum-topics-tools"><button type="button" className="icon-button" aria-label="Administrar temas" title="Administrar temas" onClick={manage}><MoreHorizontal size={19}/></button></div></header>
    <label className="forum-topics-search"><Search size={16}/><input aria-label="Buscar temas del foro" placeholder="Buscar temas" value={query} maxLength={100} onChange={event=>setQuery(event.target.value)}/>{busy&&<LoaderCircle className="spin" size={15}/>}</label>
    <div className="forum-topic-list" role="list">
      {filtered.map(topic=>{
        const color=topic.iconColor?`#${topic.iconColor.toString(16).padStart(6,'0')}`:undefined;
        const count=topic.unread??0;
        return <button type="button" role="listitem" key={topic.id} className={`forum-topic-row ${topic.closed?'closed':''} ${count>0?'unread':''}`} disabled={opening===topic.id} onClick={()=>void open(topic)}>
          <span className={`forum-topic-icon ${color?'colored':''}`} style={color?{background:color}:undefined} aria-hidden="true">{topic.iconEmoji?<CustomEmoji id={topic.iconEmoji} size={22} alt={topic.name}/>:<Hash size={19}/>}</span>
          <span className="forum-topic-body"><span className="forum-topic-title"><strong>{topic.name}</strong>{topic.pinned&&<Pin size={12} className="forum-topic-pin" aria-label="Fijado"/>}{topic.closed&&<LockKeyhole size={12} className="forum-topic-lock" aria-label="Cerrado"/>}</span><small>{topic.lastSender?`${topic.lastSender}: `:''}{topic.lastText||(topic.closed?'Tema cerrado':'Sin mensajes todavía')}</small></span>
          <span className="forum-topic-side">{opening===topic.id?<LoaderCircle className="spin" size={15}/>:<>{topic.date?<time dateTime={new Date(topic.date*1000).toISOString()}>{dateText(topic.date)}</time>:null}{count>0?<b>{count>99?'99+':count}</b>:<ChevronRight size={14}/>}</>}</span>
        </button>;
      })}
    </div>
    {!busy&&filtered.length===0&&<div className="forum-topics-empty"><MessageCircle size={28}/><h4>{query.trim()?'Sin coincidencias':'Sin temas todavía'}</h4><p>{query.trim()?'Prueba otro nombre o revisa la búsqueda.':'Crea el primer tema para organizar este foro.'}</p></div>}
    <p className="forum-topics-note">Temas reales de Telegram. Los temas fijados aparecen primero.</p>
  </section>
  <button type="button" className="forum-topics-fab" aria-label="Crear tema" title="Crear tema" onClick={create}><Pencil size={21}/></button>
  </>;
}
