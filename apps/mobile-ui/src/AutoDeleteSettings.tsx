import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, RefreshCw } from 'lucide-react';
import type { AutoDeleteSettings as Settings } from './contract';
import { snapshot } from './bridge';
import { AUTO_DELETE_DAY, AUTO_DELETE_MAX_DAYS } from './autoDelete';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
export function AutoDeleteSettings({run,ready,chatId}:{run:Run;ready:boolean;chatId?:string}) {
  const [value,setValue]=useState<Settings>(),[days,setDays]=useState('0');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const generation=useRef(0),pending=useRef(false);
  const owner=useRef(snapshot().selfId);
  const count=Number(days);
  const valid=days.trim()!==''&&Number.isInteger(count)&&count>=0&&count<=AUTO_DELETE_MAX_DAYS;
  async function load(seconds?:number) {
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);setError('');setNotice('');
    const attempt=++generation.current;
    try {
      const method=(chatId?'chat.autoDelete':'privacy.autoDelete')+(seconds===undefined?'':'.set');
      const result=await run<Settings|false>(method,{accountId:owner.current,...(chatId?{id:chatId}:{}),...(seconds===undefined?{}:{seconds})});
      if(attempt!==generation.current||result===false)return;
      if(!result)throw new Error('Telegram no confirmó el temporizador. Actualiza el estado antes de repetirlo.');
      setValue(result);setDays(String(result.seconds/AUTO_DELETE_DAY));
      if(seconds!==undefined)setNotice('Temporizador actualizado en Telegram.');
    } catch(reason) {
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo leer el temporizador.');
    } finally {
      if(attempt===generation.current){pending.current=false;setBusy(false);}
    }
  }
  useEffect(()=>{setValue(undefined);void load();return()=>{generation.current++;pending.current=false;};},[ready,chatId]);
  if(!ready)return <p className="settings-note">Inicia sesión para administrar el borrado automático.</p>;
  return <div className="auto-delete-settings">
    <p className="settings-note">{chatId?'Afecta a los mensajes futuros de este chat y los elimina para todos los participantes.':'Valor predeterminado de los chats nuevos que crees. No cambia los chats existentes.'} No borra ahora el historial ni recupera mensajes eliminados. Se pedirá confirmar antes de aplicar el cambio.</p>
    {value&&<p className="settings-note" role="status">{value.seconds===0?'Borrado automático desactivado.':`Temporizador actual: ${value.seconds/AUTO_DELETE_DAY} días.`}{!value.canChange?' Tu cuenta no puede cambiarlo en este chat.':''}</p>}
    <div className="settings-actions">{[0,1,7,30].map(day=><button type="button" className={days===String(day)?'primary':'secondary'} key={day} disabled={busy||!value?.canChange} aria-pressed={days===String(day)} onClick={()=>setDays(String(day))}>{day===0?'Desactivado':day===1?'24 horas':day+' días'}</button>)}</div>
    <label className="field-label">{`Días (0–${AUTO_DELETE_MAX_DAYS})`}<input type="number" min={0} max={AUTO_DELETE_MAX_DAYS} step={1} value={days} disabled={busy||!value?.canChange} onChange={event=>setDays(event.target.value)}/></label>
    <div className="settings-actions"><button type="button" className="primary" disabled={busy||!value?.canChange||!valid||count*AUTO_DELETE_DAY===value.seconds} onClick={()=>void load(count*AUTO_DELETE_DAY)}>Revisar cambio</button><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Actualizar estado</button></div>
    {busy&&<p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/>Consultando Telegram…</p>}
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
  </div>;
}
