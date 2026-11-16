import { useEffect, useRef, useState } from 'react';
import { Ban, LoaderCircle, RefreshCw } from 'lucide-react';
import type { BlockedSender, BlockedSenders } from './contract';
import { MediaView } from './MediaView';
import { blockedSenderKey, mergeBlockedSenders } from './privacyFlows';
import { BLOCKED_DIALOG } from './blockedSenders';
import './privacy-flows.css';

type Run = <T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function BlockedSettings({run,ready}:{run:Run;ready:boolean}) {
  const [page,setPage]=useState<BlockedSenders>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const generation=useRef(0);
  const working=useRef(false);
  const retryOffset=useRef(0);

  async function load(offset=0) {
    if(!ready||working.current)return;
    working.current=true;
    retryOffset.current=offset;
    const attempt=++generation.current;
    setBusy(true);setError('');
    try {
      const result=await run<BlockedSenders>('privacy.blocked',{offset});
      if(attempt!==generation.current)return;
      if(!result)throw new Error('No se pudo consultar la lista de bloqueados.');
      setPage(previous=>({...result,items:mergeBlockedSenders(offset?previous?.items??[]:[],result.items)}));
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo cargar la lista.');
    } finally {
      if(attempt===generation.current){working.current=false;setBusy(false);}
    }
  }
  useEffect(()=>{
    setPage(undefined);setNotice('');
    void load();
    return ()=>{generation.current++;working.current=false;};
  },[ready]);

  async function unblock(sender:BlockedSender) {
    if(working.current)return;
    working.current=true;
    retryOffset.current=0;
    const attempt=++generation.current;
    setBusy(true);setError('');setNotice('');
    try {
      const result=await run<boolean>('privacy.unblock',{kind:sender.kind,id:sender.id});
      if(attempt!==generation.current)return;
      if(result===undefined)throw new Error('No se confirmó el cambio. Actualiza la lista antes de repetirlo.');
      if(result){
        setNotice(sender.name+' se ha desbloqueado en Telegram.');
        // Removing a sender shifts all server offsets: restart, never append at the old offset.
        setPage(undefined);
        working.current=false;
        await load();
      }
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo quitar el bloqueo.');
    } finally {
      if(attempt===generation.current){working.current=false;setBusy(false);}
    }
  }

  if(!ready)return <p className="settings-note">Inicia sesión para administrar los bloqueos de Telegram.</p>;
  return <div className="blocked-settings">
    <p className="settings-note">Personas, bots y chats bloqueados en esta cuenta. Desbloquear requiere confirmación y no envía mensajes. Puedes añadir bloqueos desde el perfil de una persona o bot.</p>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar lista</button></div>
    {page&&<p className="settings-note">{page.total} bloqueados en Telegram · {page.items.length} cargados</p>}
    <ul className="blocked-list" aria-label="Remitentes bloqueados">{page?.items.map(sender=><li key={blockedSenderKey(sender)}>
      <span className="blocked-avatar" aria-hidden="true">{sender.photo?<MediaView media={sender.photo} auto passive/>:<Ban size={18}/>}</span>
      <span className="blocked-name"><strong dir="auto">{sender.name||'Remitente de Telegram'}</strong><small>{sender.kind==='user'?'Persona o bot':'Chat o canal'}</small></span>
      <button type="button" className="text-button" disabled={busy} aria-label={BLOCKED_DIALOG.title(sender.name)} onClick={()=>void unblock(sender)}>{BLOCKED_DIALOG.accept}</button>
    </li>)}</ul>
    {busy&&<p className="settings-note" role="status"><LoaderCircle size={15} className="spin"/>Consultando Telegram…</p>}
    {!busy&&!error&&page?.items.length===0&&<p className="settings-note">No hay remitentes bloqueados.</p>}
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error} <button type="button" className="text-button" disabled={busy} onClick={()=>void load(retryOffset.current)}>Reintentar</button></p>}
    {page?.hasMore&&!error&&<button type="button" className="secondary" disabled={busy} onClick={()=>void load(page.nextOffset)}>Cargar más bloqueados</button>}
  </div>;
}
