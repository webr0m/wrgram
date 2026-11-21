import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle, Phone, PhoneMissed, RefreshCw, Search, Video, X } from 'lucide-react';
import type { CallLogEntry, CallLogPage } from './contract';
import { callLogOffsetProblem, matchesCallName } from './callLogModel';
import './call-log.css';

type Run = <T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

/** Lo que el puente devuelve por página y lo que la pantalla conserva: las filas descargadas, antes del recorte local. */
interface Register {rows: CallLogEntry[]; fetched: number; total: number; nextOffset: string; more: boolean}

/**
 * El registro de llamadas (ronda CL). Las dos cifras de arriba son el corazón de la pantalla: `fetched` es lo que
 * Telegram devolvió y `shown` lo que el nombre deja ver, y la diferencia no es un detalle —`SearchCallMessages` no
 * tiene `query`, así que escribir un nombre solo puede recortar lo que ya bajó—. Por eso el cuadro avisa en vez de
 * prometer «sin resultados».
 */
export function CallLogPanel({run,ready}:{run:Run;ready:boolean}) {
  const [register,setRegister]=useState<Register>();
  const [onlyMissed,setOnlyMissed]=useState(false);
  const [typed,setTyped]=useState('');
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const generation=useRef(0);
  const working=useRef(false);

  async function load(cursor:string,missed:boolean,restart:boolean) {
    if(!ready||working.current)return;
    const refusal=callLogOffsetProblem(cursor);
    if(refusal){setError(refusal);return;}
    working.current=true;
    const attempt=++generation.current;
    setBusy(true);setError('');
    try {
      const page=await run<CallLogPage>('calls.list',{offset:cursor,query:'',onlyMissed:missed});
      if(attempt!==generation.current)return;
      if(!page)throw new Error('No se pudo consultar el registro de llamadas.');
      setRegister(previous=>{
        const kept=restart||!previous?page.rows:[...previous.rows,...page.rows];
        return {rows:kept,fetched:page.fetched,total:page.total,nextOffset:page.nextOffset,more:page.more};
      });
    } catch(reason) {
      // El cursor viejo se niega con nombre propio, y la pantalla lo dice: lo que hay que hacer es volver a empezar.
      if(attempt===generation.current)setError(reason instanceof Error?reason.message:'No se pudo cargar el registro de llamadas.');
    } finally {
      if(attempt===generation.current){working.current=false;setBusy(false);}
    }
  }

  useEffect(()=>{
    setRegister(undefined);setError('');
    void load('',onlyMissed,true);
    return()=>{generation.current++;working.current=false;};
  },[ready,onlyMissed]);

  // El nombre se aplica aquí, en memoria, con la misma regla que usa el puente: cambiarlo no vuelve a preguntar.
  useEffect(()=>{const timer=setTimeout(()=>setQuery(typed.trim()),250);return()=>clearTimeout(timer);},[typed]);
  const visible=useMemo(()=>(register?.rows??[]).filter(row=>matchesCallName(row.title,query)),[register,query]);

  if(!ready)return <p className="settings-note">Inicia sesión para ver tu registro de llamadas.</p>;
  return <div className="call-log">
    <p className="settings-note">Las llamadas y videollamadas que Telegram guarda en tu cuenta, de la más reciente a la más antigua. El registro es solo lectura: desde aquí no se llama a nadie.</p>
    <div className="call-log-tools">
      <label className="call-log-search"><Search size={15}/>
        <input value={typed} onChange={event=>setTyped(event.target.value)} placeholder="Buscar por nombre de chat" aria-label="Buscar por nombre de chat"/>
        {typed&&<button type="button" className="text-button" aria-label="Quitar el nombre escrito" onClick={()=>setTyped('')}><X size={14}/></button>}
      </label>
      <button type="button" className="secondary" disabled={busy} aria-pressed={onlyMissed} onClick={()=>setOnlyMissed(value=>!value)}>{onlyMissed?'Solo no contestadas':'Todas'}</button>
      <button type="button" className="secondary" disabled={busy} onClick={()=>void load('',onlyMissed,true)}><RefreshCw size={16}/>Actualizar</button>
    </div>
    {register&&<p className="settings-note" role="status">
      Telegram devolvió {register.fetched} fila{register.fetched===1?'':'s'} en la última página
      {query!==''?` · ${visible.length} coinciden con «${query}»`:''}
      {' · '}{register.total>0?`${register.total} en total, aproximado`:'Telegram no informa cuántas hay en total'}
    </p>}
    {query!==''&&<p className="settings-note settings-unavailable">El nombre solo recorta lo que ya se descargó: Telegram no permite buscar llamadas por nombre, así que una fila que aún no está aquí no puede aparecer.</p>}
    <ul className="call-log-list" aria-label="Registro de llamadas">
      {visible.map(row=><li className="call-log-row" key={row.chatId+':'+row.messageId}>
        <span className="call-log-icon" aria-hidden="true">{row.missed?<PhoneMissed size={17}/>:(row.video||row.group)?<Video size={17}/>:<Phone size={17}/>}</span>
        <span className="call-log-body"><strong dir="auto">{row.title||'Chat de Telegram'}</strong><small dir="auto">{row.label}</small></span>
        <time className="call-log-date" dateTime={new Date(row.date*1000).toISOString()}>{new Date(row.date*1000).toLocaleString('es',{dateStyle:'medium',timeStyle:'short'})}</time>
      </li>)}
    </ul>
    {busy&&<p className="settings-note" role="status"><LoaderCircle size={15} className="spin"/>Consultando Telegram…</p>}
    {!busy&&error&&<p className="settings-note settings-error" role="alert">{error}</p>}
    {!busy&&!error&&register&&visible.length===0&&<p className="settings-note">{query!==''?'Ninguna de las filas descargadas coincide con ese nombre.':'Aún no hay llamadas registradas en esta cuenta.'}</p>}
    {!busy&&!error&&register?.more&&<button type="button" className="secondary" onClick={()=>void load(register.nextOffset,onlyMissed,false)}>Cargar más llamadas</button>}
  </div>;
}
