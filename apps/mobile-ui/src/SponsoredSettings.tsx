import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { SponsoredSettings as Settings } from './contract';
import { snapshot } from './bridge';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function SponsoredSettings({run,ready}:{run:Run;ready:boolean}) {
  const [value,setValue]=useState<Settings>();
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const generation=useRef(0),pending=useRef(false);
  const owner=useRef(snapshot().selfId);
  async function load(enabled?:boolean) {
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    const attempt=++generation.current;
    try {
      const result=await run<Settings>(enabled===undefined?'sponsored.settings':'sponsored.settings.set',{accountId:owner.current,...(enabled===undefined?{}:{enabled})});
      if(attempt!==generation.current)return;
      if(!result)throw new Error('Telegram no confirmó el estado de los mensajes patrocinados.');
      setValue(result);
      if(enabled!==undefined)setNotice(result.enabled?'Mensajes patrocinados activados en Telegram.':'Mensajes patrocinados desactivados en Telegram.');
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo consultar la publicidad.');
    } finally {
      if(attempt===generation.current){pending.current=false;setBusy(false);}
    }
  }
  useEffect(()=>{void load();return()=>{generation.current++;pending.current=false;};},[ready]);
  if(!ready)return <p className="settings-note">Inicia sesión para consultar este ajuste de Telegram.</p>;
  return <div>
    <label className={'toggle-row '+(!value?.canDisable||busy?'is-disabled':'')}>
      <span><strong>Desactivar mensajes patrocinados</strong><small>{value?.canDisable?'Usa el ajuste oficial de tu cuenta Premium.':'Telegram exige Premium para desactivar los patrocinados.'}</small></span>
      <input type="checkbox" checked={!!value&&!value.enabled} disabled={!value?.canDisable||busy} onChange={event=>void load(!event.target.checked)}/><span className="switch" aria-hidden="true"/>
    </label>
    <p className="settings-note">Este ajuste se guarda en Telegram, no es un filtro local. No bloquea las publicaciones comerciales que envían los propios canales ni los anuncios dentro de Mini Apps. WRGram no activa ni cobra Premium.</p>
    {busy&&<p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/>Consultando Telegram…</p>}
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Actualizar estado</button></div>
  </div>;
}
