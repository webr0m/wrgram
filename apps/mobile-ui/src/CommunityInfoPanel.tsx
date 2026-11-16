import { useEffect, useRef, useState } from 'react';
import { Check, LoaderCircle, RefreshCw } from 'lucide-react';
import { snapshot } from './bridge';
import type { CommunityInfo } from './contract';
import type { CommunityField } from './communityInfo';
import { cancelledNotice, characters, lock, prepared, problem, savedNotice, unchanged } from './communityInfo';
import './community-info.css';

type Run = <T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

const LABELS: Record<CommunityField,string> = { title:'Nombre', description:'Descripción' };

/**
 * Nombre y descripción de un grupo, supergrupo o canal. La descripción vive en el *full info* de
 * Telegram, no en el chat, así que puede no haber llegado nunca: en ese caso el campo se cierra en
 * lugar de ofrecer un vacío que borraría lo que la persona no llegó a leer. Al escribir se manda
 * también lo que se creía que había; si Telegram ya guarda otra cosa, el nativo para antes de preguntar.
 */
export function CommunityInfoPanel({ run, chatId, ready }: { run:Run; chatId:string; ready:boolean }) {
  const [info,setInfo]=useState<CommunityInfo>();
  const [draft,setDraft]=useState<Record<CommunityField,string>>({title:'',description:''});
  const [field,setField]=useState<CommunityField>();
  const [busy,setBusy]=useState(true);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  const owner=useRef(snapshot().selfId);
  const generation=useRef(0),pending=useRef(false);

  async function load() {
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    const attempt=++generation.current;
    try {
      const value=await run<CommunityInfo>('chat.info',{accountId:owner.current,id:chatId});
      if(attempt!==generation.current)return;
      if(!value)throw new Error('No se pudo leer la información de la comunidad.');
      setInfo(value);setDraft({title:value.title,description:value.description});
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error&&reason.message?reason.message:'No se pudo leer la información de la comunidad.');
    } finally {
      if(attempt===generation.current){pending.current=false;setBusy(false);}
    }
  }

  useEffect(()=>{setInfo(undefined);void load();return()=>{generation.current++;pending.current=false;};},[ready,chatId]);

  async function save(current:CommunityField) {
    if(busy)return;
    const value=prepared(draft[current]);
    const reason=problem(current,value);
    if(reason||!info){setError(reason||'Vuelve a leer la información antes de guardar.');return;}
    setBusy(true);setError('');setNotice('');setField(current);
    try {
      const applied=await run<boolean>('chat.info.set',{accountId:owner.current,id:chatId,field:current,value,previous:current==='title'?info.title:info.description});
      // false es el «Cancelar» nativo: en Telegram no se ha escrito nada.
      if(applied===false){setNotice(cancelledNotice);setDraft(entry=>({...entry,[current]:current==='title'?info.title:info.description}));return;}
      if(!applied)return;
      setInfo(entry=>entry?{...entry,[current]:value}:entry);
      setDraft(entry=>({...entry,[current]:value}));
      setNotice(savedNotice(current));
    } catch(reason2) {
      setError(reason2 instanceof Error&&reason2.message?reason2.message:'Telegram no confirmó el cambio.');
    } finally {
      setBusy(false);setField(undefined);
    }
  }

  if(!ready)return <p className="settings-note">Inicia sesión para editar el nombre y la descripción de la comunidad.</p>;
  return <div className="community-info">
    <p className="settings-note">El nombre lo ven todas las personas dentro del chat y la descripción aparece en su información. Se pedirá confirmar antes de aplicar el cambio.</p>
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
    {(['title','description'] as CommunityField[]).map(current=>{
      const limit=current==='title'?(info?.maxTitle??128):(info?.maxDescription??255);
      const value=draft[current],closed=lock(info,current),tooLong=closed?'':problem(current,value);
      const base=current==='title'?info?.title:info?.description;
      return <div className="community-field" key={current}>
        <label className="field-label">{LABELS[current]}
          {current==='title'
            ? <input value={value} dir="auto" readOnly={!!closed} disabled={busy} placeholder={closed?'':'Nombre de la comunidad'} onChange={event=>setDraft(entry=>({...entry,title:event.target.value}))}/>
            : <textarea value={value} dir="auto" rows={3} readOnly={!!closed} disabled={busy} placeholder={closed?'':'Qué es esta comunidad'} onChange={event=>setDraft(entry=>({...entry,description:event.target.value}))}/>}
        </label>
        <div className="community-field-foot">
          <small className={characters(prepared(value))>limit?'community-over':''}>{characters(prepared(value))}/{limit} caracteres.</small>
          <button type="button" className="primary" disabled={!!closed||busy||!!tooLong||unchanged(value,base??'')} onClick={()=>void save(current)}>
            {busy&&field===current?<LoaderCircle size={15} className="spin"/>:<Check size={15}/>}Guardar {LABELS[current].toLowerCase()}
          </button>
        </div>
        {closed&&<p className="settings-note" role="status">{closed}</p>}
        {tooLong&&<p className="settings-note settings-error" role="alert">{tooLong}</p>}
      </div>;
    })}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Volver a leer de Telegram</button></div>
    {busy&&!info&&<p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/>Consultando Telegram…</p>}
    {notice&&<p className="settings-note" role="status">{notice}</p>}
  </div>;
}
