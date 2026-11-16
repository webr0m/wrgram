import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellOff, ChevronRight, LoaderCircle } from 'lucide-react';
import { Modal } from './dialogs';
import { snapshot } from './bridge';
import type { Chat } from './contract';
import { MUTE_OPTIONS } from './privacyFlows';
import './privacy-flows.css';

type Run = <T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function ChatMuteControl({chat,run,menu=false,changed}:{chat:Pick<Chat,'id'|'title'|'muted'>;run:Run;menu?:boolean;changed?(muted:boolean):void}) {
  const [open,setOpen]=useState(false);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const owner=useRef('');
  const mounted=useRef(true);
  const pending=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function apply(seconds:number) {
    if(pending.current)return;
    if(snapshot().selfId!==owner.current){setError('La cuenta cambió. Vuelve a abrir las opciones del chat.');return;}
    pending.current=true;setBusy(true);setError('');
    try {
      const result=await run<boolean>('chat.mute',{id:chat.id,value:seconds>0,muteFor:seconds});
      if(!mounted.current||snapshot().selfId!==owner.current)return;
      if(result!==true)throw new Error('Telegram no confirmó el cambio. Comprueba su estado antes de repetirlo.');
      setOpen(false);changed?.(seconds>0);
    } catch(reason) {
      if(mounted.current)setError(reason instanceof Error?reason.message:'No se pudieron cambiar las notificaciones.');
    } finally {
      pending.current=false;
      if(mounted.current)setBusy(false);
    }
  }
  const label=chat.muted?'Activar notificaciones':'Silenciar notificaciones';
  return <><button type="button" className={menu?'menu-item':undefined} onClick={()=>{owner.current=snapshot().selfId;setError('');setOpen(true);}}>
    {chat.muted?<BellOff size={menu?20:24}/>:<Bell size={menu?20:24}/>}<span>{label}</span>{menu&&<ChevronRight size={15}/>}
  </button>{open&&createPortal(<Modal title={'Notificaciones de '+chat.title} close={()=>{if(!pending.current)setOpen(false);}}>
    <p className="settings-note">El cambio se guarda en Telegram para este chat. No afecta a las otras conversaciones.</p>
    <div className="action-list mute-options">
      <button type="button" className="menu-item" disabled={busy} onClick={()=>void apply(0)}><Bell size={18}/><span>Activar notificaciones</span></button>
      {MUTE_OPTIONS.filter(option=>snapshot().platform!=='desktop'||option.seconds===2147483647).map(option=><button type="button" className="menu-item" key={option.seconds} disabled={busy} onClick={()=>void apply(option.seconds)}><BellOff size={18}/><span>{option.label}</span></button>)}
    </div>
    {busy&&<p className="settings-note" role="status"><LoaderCircle size={15} className="spin"/>Guardando en Telegram…</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
  </Modal>,document.body)}</>;
}
