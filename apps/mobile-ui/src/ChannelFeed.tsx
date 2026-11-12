import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Megaphone, RefreshCw, Rss } from 'lucide-react';
import { messageTime as time } from './inboxModel';
import type { FeedEntry } from './contract';
import { readPreference, writePreference } from './devicePreferences';
import './channel-feed.css';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
const errorText=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

const blankFilter = { word: '', chat: '' };

export function ChannelFeed({owner,run,open}:{owner:string;run:Run;open(entry:FeedEntry):void}){
  const [rows,setRows]=useState<FeedEntry[]|undefined>(undefined);
  const [busy,setBusy]=useState(true);
  const [error,setError]=useState('');
  const [epoch,setEpoch]=useState(0);
  const [filter,setFilter]=useState(blankFilter);
  const [saved,setSaved]=useState(blankFilter);
  const [loadingFilter,setLoadingFilter]=useState(true);
  const [filterError,setFilterError]=useState(false);
  const request=useRef(run);
  request.current=run;
  const filterKey='wrgram.channel-filter.'+owner;
  useEffect(()=>{
    let active=true;
    void readPreference<typeof blankFilter>(filterKey).then(value=>{
      if(active&&typeof value?.word==='string'&&typeof value?.chat==='string'){setFilter(value);setSaved(value);}
    }).catch(()=>{}).finally(()=>{if(active)setLoadingFilter(false);});
    return()=>{active=false;};
  },[filterKey]);
  useEffect(()=>{
    let cancelled=false;
    setBusy(true);setError('');
    void request.current<FeedEntry[]>('feed.channels').then(value=>{
      if(cancelled)return;
      setRows(value??[]);
      if(value===undefined)setError('No se pudo cargar el feed de canales.');
    }).catch(caught=>{if(!cancelled)setError(errorText(caught,'No se pudo cargar el feed de canales.'));}).finally(()=>{if(!cancelled)setBusy(false);});
    return()=>{cancelled=true;};
  },[epoch]);
  const channels=new Map(rows?.map(row=>[row.chatId,row.title]));
  const word=filter.word.trim().toLocaleLowerCase();
  const visible=rows?.filter(row=>(!filter.chat||row.chatId===filter.chat)&&(!word||row.text.toLocaleLowerCase().includes(word)));
  async function saveFilter(value: typeof blankFilter) {
    try {
      await writePreference(filterKey,value.word||value.chat?value:undefined);
      setSaved(value);
      setFilterError(false);
    } catch { setFilterError(true); }
  }
  return <section className="channel-feed" aria-label="Feed de canales">
    <header className="channel-feed-head">
      <span><Rss size={16}/><strong>Últimas publicaciones</strong><small>{rows?`${rows.length} de tus canales`:''}</small></span>
      <button type="button" className="icon-button" aria-label="Actualizar feed" disabled={busy} onClick={()=>setEpoch(value=>value+1)}>{busy?<LoaderCircle className="spin" size={16}/>:<RefreshCw size={16}/>}</button>
    </header>
    <fieldset className="settings-actions channel-feed-filters" disabled={loadingFilter}>
      <label className="field-label">Palabra o frase<input maxLength={120} value={filter.word} onChange={event=>setFilter({...filter,word:event.target.value})}/></label>
      <label className="field-label">Canal<select value={filter.chat} onChange={event=>setFilter({...filter,chat:event.target.value})}>
        <option value="">Todos los canales</option>
        {filter.chat&&!channels.has(filter.chat)&&<option value={filter.chat}>Canal guardado</option>}
        {[...channels].map(([id,title])=><option key={id} value={id}>{title}</option>)}
      </select></label>
      <button type="button" className="secondary" disabled={filter.word===saved.word&&filter.chat===saved.chat} onClick={()=>saveFilter(filter)}>Guardar filtro</button>
      {(filter.word||filter.chat||saved.word||saved.chat)&&<button type="button" className="text-button" onClick={()=>{setFilter(blankFilter);saveFilter(blankFilter);}}>Limpiar filtro</button>}
    </fieldset>
    {filterError&&<p className="settings-note" role="alert">No se pudo guardar el filtro.</p>}
    {error&&<p className="settings-note" role="alert">{error}</p>}
    <div className="channel-feed-list">
      {visible?.map(entry=><button type="button" className="channel-feed-row" key={`${entry.chatId}:${entry.messageId}`} onClick={()=>open(entry)}>
        <span className="channel-feed-head-row"><strong>{entry.title}</strong><time dateTime={new Date(entry.date*1000).toISOString()}>{time(entry.date)}</time></span>
        <span className="channel-feed-text">{entry.text||'Publicación sin texto'}</span>
      </button>)}
    </div>
    {!busy&&!error&&rows?.length===0&&<div className="channel-feed-empty"><Megaphone size={28}/><h4>Sin publicaciones todavía</h4><p>Abre algunos canales y vuelve: aquí verás sus últimas publicaciones juntas.</p></div>}
    {!busy&&!error&&!!rows?.length&&visible?.length===0&&<p className="settings-note">No hay publicaciones que coincidan con el filtro.</p>}
    {!busy&&rows&&rows.length>0&&<p className="settings-note">Cronológico de tus canales. Toca una publicación para abrir el mensaje original.</p>}
  </section>;
}
