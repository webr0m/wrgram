import { useEffect, useState } from 'react';
import { ChevronRight, FileText, Film, Image, LoaderCircle, Music, Search, Send } from 'lucide-react';
import { snapshot } from './bridge';
import { Avatar } from './Inbox';
import type { Chat } from './contract';

export interface ShareInItem { path: string; name: string; size: number; mime: string }
export interface ShareInPayload { text: string; items: ShareInItem[] }
type Run = <T=unknown>(method: string, params?: Record<string, unknown>) => Promise<T | undefined>;
type Account = { slot: string; name: string; ready: boolean; active: boolean };

const sizeLabel = (size: number) => size < 1048576 ? `${Math.ceil(size / 1024)} KB` : `${(size / 1048576).toFixed(1)} MB`;
const itemIcon = (mime: string) => mime.startsWith('image/') ? <Image size={20}/> : mime.startsWith('video/') ? <Film size={20}/> : mime.startsWith('audio/') ? <Music size={20}/> : <FileText size={20}/>;

/**
 * Recepción de `ACTION_SEND`/`SEND_MULTIPLE`: ShellActivity ya copió lo compartido al almacén privado
 * y este panel solo elige cuenta y conversación. Nada se envía hasta confirmar; el texto que acompaña
 * a los archivos sale como mensaje aparte antes que ellos, y un compartir de solo texto queda como
 * borrador para revisarlo. Los chats secretos no admiten esta vía de importación.
 */
export function ShareInboxPanel({payload,run,close,done,prefill}:{payload:ShareInPayload;run:Run;close():void;done(message:string):void;prefill(text:string):void}){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [target,setTarget]=useState<Chat>();
  const [filter,setFilter]=useState('');
  const [busy,setBusy]=useState(false);
  const [,setTick]=useState(0);
  useEffect(()=>{void run<Account[]>('accounts.list').then(list=>{if(list)setAccounts(list);});},[]);
  // Tras cambiar de cuenta la lista llega por eventos del puente: el tick vuelve a leer el snapshot.
  useEffect(()=>{const timer=setInterval(()=>setTick(value=>value+1),500);return()=>clearInterval(timer);},[]);
  const state=snapshot();
  const activeAccount=accounts.find(account=>account.active);
  const ready=accounts.filter(account=>account.ready);
  const chats=state.chats.filter(chat=>chat.type!=='secret'&&(!filter.trim()||chat.title.toLowerCase().includes(filter.trim().toLowerCase())));
  async function chooseAccount(next:Account){
    if(busy||next.active)return;
    setBusy(true);setTarget(undefined);
    try{
      const switched=await run('accounts.switch',{slot:next.slot});
      if(switched===undefined)return;
      await run('chats.list',{list:'main'});
      setAccounts(list=>list.map(account=>({...account,active:account.slot===next.slot})));
    }finally{setBusy(false);}
  }
  async function confirm(){
    if(busy||!target)return;
    setBusy(true);
    try{
      const opened=await run('chat.open',{id:target.id});
      if(opened===undefined)return;
      if(payload.items.length===0){
        prefill(payload.text);
        done('El texto compartido quedó como borrador en la conversación. Revísalo y envíalo cuando quieras.');
        return;
      }
      if(payload.text){
        const sent=await run<boolean>('send.text',{text:payload.text});
        if(!sent)return;
      }
      const imported=await run<{token:string;name:string;size:number;mime:string}[]>('share.import',{chat:target.id,items:payload.items.map(item=>({path:item.path,mime:item.mime}))});
      if(!imported?.length)return;
      let sent=0;
      for(const item of imported){
        const ok=await run<boolean>('send.attachment',{token:item.token,reply:'0'});
        if(!ok)break;
        sent++;
      }
      if(sent>0)done(sent===imported.length?(sent===1?`Archivo enviado a ${target.title}.`:`${sent} archivos enviados a ${target.title}.`):`Se enviaron ${sent} de ${imported.length} archivos; el resto quedó sin enviar.`);
    }finally{setBusy(false);}
  }
  return <div className="share-inbox">
    <div className="share-in-preview">
      {payload.text&&<p className="share-in-text">{payload.text}</p>}
      {payload.items.map(item=><div className="share-in-item" key={item.path}>{itemIcon(item.mime)}<span>{item.name}</span><small>{sizeLabel(item.size)}</small></div>)}
    </div>
    {ready.length>1&&<div className="share-in-accounts">{ready.map(account=><button type="button" key={account.slot} className={account.active?'selected':'secondary'} disabled={busy} onClick={()=>void chooseAccount(account)}>{account.name||'Cuenta'}</button>)}</div>}
    {!target?<>
      <label className="chat-search"><Search size={16}/><input aria-label="Filtrar conversaciones" placeholder="Filtrar conversaciones" value={filter} onChange={event=>setFilter(event.target.value)}/></label>
      <div className="forward-list share-in-chats">{chats.map(chat=><button key={chat.id} disabled={busy} onClick={()=>setTarget(chat)}><Avatar chat={chat}/>{chat.title}<ChevronRight size={16}/></button>)}{!chats.length&&<p className="settings-note">{busy?'Cargando las conversaciones de la cuenta…':'No hay conversaciones disponibles.'}</p>}</div>
    </>:<>
      <p>Destino: <strong>{target.title}</strong>{activeAccount?` · ${activeAccount.name||'tu cuenta'}`:''}</p>
      <p className="settings-note">{payload.items.length===0?'El texto quedará como borrador para que lo revises; no se envía solo.':'Nada se envía hasta confirmar.'}{payload.items.length>0&&payload.text?' El texto se envía como mensaje aparte antes que los archivos.':''}{payload.items.length>0?` Límite por archivo: ${state.wallet?.premium?'4 GB':'2 GB'}.`:''}</p>
      <div className="modal-actions"><button className="secondary" disabled={busy} onClick={close}>Cancelar</button><button className="secondary" disabled={busy} onClick={()=>setTarget(undefined)}>Cambiar destino</button><button className="primary" disabled={busy} onClick={()=>void confirm()}>{busy?<LoaderCircle className="spin" size={16}/>:payload.items.length===0?'Usar como borrador':<>Compartir<Send size={16}/></>}</button></div>
    </>}
  </div>;
}