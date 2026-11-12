import { useEffect, useRef, useState } from 'react';
import { Ban, Check, Download, LoaderCircle, Pause, Play, RefreshCw, Search, X } from 'lucide-react';

export type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

export interface DownloadCounts {active:number;paused:number;completed:number}
export interface DownloadEntry {
  fileId:string;name:string;kind:string;size:number;downloaded:number;progress:number;
  state:'downloading'|'paused'|'completed'|'stopped';date:number;completeDate:number;
  chatId:string;messageId:string;chatTitle:string;canPause:boolean;canCancel:boolean;canRetry:boolean;
}
export interface DownloadQueue {counts:DownloadCounts;items:DownloadEntry[];nextOffset:string}
export interface DownloadSettings {enabled:boolean;photoLimit:number;videoLimit:number;otherLimit:number;bitrate:number;preloadVideos:boolean;preloadAudio:boolean;preloadStories:boolean;lessDataForCalls:boolean}
export interface DownloadPreset {label:string;settings:DownloadSettings}
export interface DownloadRule {network:string;level:string}

const TABS:[string,string][]=[['all','Todo'],['active','En curso'],['completed','Completados']];
const NETWORKS:[string,string][]=[['wifi','Wi-Fi'],['mobile','Datos móviles'],['roaming','Itinerancia'],['other','Otras redes']];
const LEVELS:[string,string][]=[['off','Sin descarga automática'],['low','Bajo'],['medium','Medio'],['high','Alto']];
const STATE_LABEL:Record<DownloadEntry['state'],string>={downloading:'Descargando',paused:'En pausa',completed:'Completado',stopped:'Detenido'};
const failure=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const sizeText=(value:number)=>value<=0?'0 B':value<1048576?`${Math.ceil(value/1024)} KB`:`${(value/1048576).toFixed(1)} MB`;

function ErrorNote({text}:{text:string}){return text?<p className="settings-note settings-error" role="alert">{text}</p>:null;}

export function DownloadsQueue({run,ready}:{run:Run;ready:boolean}){
  const [items,setItems]=useState<DownloadEntry[]>([]),[counts,setCounts]=useState<DownloadCounts|undefined>(),[nextOffset,setNextOffset]=useState('');
  const [tab,setTab]=useState('all'),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [appliedQuery,setAppliedQuery]=useState(''),[paged,setPaged]=useState(false);
  const pending=useRef(false);
  async function read(reset:boolean,scope:string,search:string,offset:string){
    const page=await run<DownloadQueue>('downloads.queue',{query:search,active:scope==='active',completed:scope==='completed',offset,limit:50});
    if(!page){setError('No se pudo leer la cola de descargas. Vuelve a intentarlo.');return;}
    setItems(current=>reset?page.items:[...current,...page.items.filter(item=>!current.some(prior=>prior.fileId===item.fileId))]);
    setCounts(page.counts);setNextOffset(page.nextOffset);setLoaded(true);setPaged(!reset);
  }
  async function load(reset:boolean,scope=tab,search=appliedQuery,quiet=false){
    if(pending.current)return;
    pending.current=true;
    setBusy(true);
    if(!quiet)setError('');
    if(scope!==tab||search!==appliedQuery){
      setTab(scope);setAppliedQuery(search);setItems([]);setNextOffset('');setLoaded(false);setPaged(false);setStatus('');
    }
    try{
      await read(reset,scope,search,reset?'':nextOffset);
    }catch(caught){setError(failure(caught,'No se pudo leer la cola de descargas.'));}
    finally{pending.current=false;setBusy(false);}
  }
  useEffect(()=>{if(ready)void load(true);},[ready]);
  const watching=ready&&!paged&&!error&&items.some(item=>item.state==='downloading');
  useEffect(()=>{
    if(!watching)return;
    const timer=window.setInterval(()=>{if(!document.hidden)void load(true,tab,appliedQuery,true);},2500);
    return()=>window.clearInterval(timer);
  },[watching,tab,appliedQuery]);
  async function act(method:string,params:Record<string,unknown>,message:string){
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');setStatus('');
    try{
      const done=await run<boolean>(method,params);
      if(done!==true){setError('La acción de descarga no se pudo aplicar.');return;}
      await read(true,tab,appliedQuery,'');
      setStatus(message);
    }
    catch(caught){setError(failure(caught,'La acción de descarga no se pudo aplicar.'));}
    finally{pending.current=false;setBusy(false);}
  }
  if(!ready)return <p className="settings-note">Inicia sesión para ver la cola real de descargas de Telegram.</p>;
  return <div className="downloads-queue">
    <div className="segmented downloads-filter" role="group" aria-label="Alcance de la cola">{TABS.map(([key,label])=><button type="button" key={key} className={tab===key?'selected':''} disabled={busy} aria-pressed={tab===key} onClick={()=>void load(true,key)}>{label}</button>)}</div>
    <div className="downloads-search"><Search size={15}/><input type="search" placeholder="Buscar archivo en la cola" aria-label="Buscar archivo en la cola" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void load(true,tab,query);}} maxLength={128}/><button type="button" className="secondary" disabled={busy} onClick={()=>void load(true,tab,query)}>Buscar</button></div>
    <ErrorNote text={error}/>
    {status&&!error&&<p className="settings-note" role="status">{status}</p>}
    {counts&&<p className="settings-note">{`En curso ${counts.active} · En pausa ${counts.paused} · Completados ${counts.completed}`}</p>}
    {items.length>0&&<ul className="downloads-list">
      {items.map(item=><li className="downloads-row" key={item.fileId}>
        <span className="downloads-row-body">
          <strong>{item.name||`Archivo de ${item.kind}`}</strong>
          <small>{[item.chatTitle||'Sin chat',item.kind,sizeText(item.size),STATE_LABEL[item.state]].filter(Boolean).join(' · ')}</small>
          {(item.state==='downloading'||item.state==='paused')&&<span className="downloads-progress" aria-hidden="true"><span style={{width:`${item.progress}%`}}/></span>}
          {item.state==='downloading'&&<small>{`${sizeText(item.downloaded)} de ${sizeText(item.size)} · ${item.progress}%`}</small>}
        </span>
        <span className="downloads-row-actions">
          {item.canPause&&<button type="button" className="secondary" disabled={busy} aria-label={item.state==='paused'?`Reanudar ${item.name||item.kind}`:`Pausar ${item.name||item.kind}`} onClick={()=>void act('downloads.item.pause',{fileId:item.fileId,value:item.state!=='paused'},'')}>{item.state==='paused'?<Play size={15}/>:<Pause size={15}/>}</button>}
          {item.canCancel&&<button type="button" className="secondary" disabled={busy} aria-label={`Cancelar ${item.name||item.kind}`} onClick={()=>void act('downloads.item.cancel',{fileId:item.fileId},'Descarga cancelada.')}><X size={15}/></button>}
          {item.canRetry&&<button type="button" className="secondary" disabled={busy} aria-label={`Descargar ${item.name||item.kind}`} onClick={()=>void act('downloads.item.add',{fileId:item.fileId,chatId:item.chatId,messageId:item.messageId},'Descarga puesta en cola.')}><Download size={15}/></button>}
          {item.state==='completed'&&<button type="button" className="secondary" disabled={busy} aria-label={`Quitar ${item.name||item.kind} de la cola`} onClick={()=>void act('downloads.item.remove',{fileId:item.fileId},'Archivo quitado de la cola.')}><Ban size={15}/></button>}
        </span>
      </li>)}
    </ul>}
    {loaded&&!items.length&&!error&&<p className="settings-note">Telegram no tiene descargas con este filtro.</p>}
    {!loaded&&!error&&<p className="settings-note">{busy?'Consultando la cola de descargas…':'Sin descargas cargadas.'}</p>}
    <div className="settings-actions">{nextOffset&&<button type="button" className="secondary" disabled={busy} onClick={()=>void load(false)}>Cargar más</button>}{(paged||error)&&<button type="button" className="text-button" disabled={busy} onClick={()=>void load(true)}><RefreshCw size={16}/>Actualizar cola</button>}</div>
    <p className="settings-note">La cola la mantiene Telegram: la pausa y la cancelación sobreviven al cierre de la app. «Quitar» saca el archivo de la lista sin borrar la copia ya descargada.</p>
  </div>;
}

export function DownloadRules({run,ready}:{run:Run;ready:boolean}){
  const [presets,setPresets]=useState<Record<string,DownloadPreset>>(),[rules,setRules]=useState<DownloadRule[]>([]),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  async function refresh(){
    setBusy(true);setError('');
    try{
      const [presetList,stored]=await Promise.all([
        run<Record<string,DownloadPreset>>('downloads.presets'),
        run<{networks:DownloadRule[]}>('downloads.rules'),
      ]);
      if(presetList)setPresets(presetList);
      if(stored){setRules(stored.networks);setLoaded(true);}
      if(!presetList||!stored)setError('No se pudieron leer todas las reglas de descarga automática.');
    }catch(caught){setError(failure(caught,'No se pudieron leer las reglas de descarga automática.'));}
    finally{setBusy(false);}
  }
  useEffect(()=>{if(ready)void refresh();},[ready]);
  async function choose(network:string,level:string){
    setBusy(true);setError('');
    try{
      const stored=await run<{networks:DownloadRule[]}>('downloads.rules.set',{network,level});
      if(stored)setRules(stored.networks);
      else setError('La regla de descarga no se pudo aplicar.');
    }catch(caught){setError(failure(caught,'La regla de descarga no se pudo aplicar.'));}
    finally{setBusy(false);}
  }
  if(!ready)return null;
  const presetText=(level:string)=>{
    if(!presets)return 'Nivel de Telegram';
    const preset=presets[level];
    if(!preset)return 'Nivel de Telegram';
    const settings=preset.settings;
    return `${preset.label} · fotos hasta ${sizeText(settings.photoLimit)}, vídeos hasta ${sizeText(settings.videoLimit)}, otros hasta ${sizeText(settings.otherLimit)}`;
  };
  return <div className="download-rules">
    <ErrorNote text={error}/>
    {NETWORKS.map(([network,label])=>{
      const rule=rules.find(value=>value.network===network);
      return <div className="download-rule" key={network}>
        <span className="download-rule-body"><strong>{label}</strong><small>{rule&&rule.level?presetText(rule.level):'Sin establecer en esta app'}</small></span>
        <select aria-label={`Descarga automática en ${label}`} disabled={busy||!loaded} value={rule&&rule.level?rule.level:''} onChange={event=>{const level=event.target.value;if(level)void choose(network,level);}}>
          <option value="" disabled>Sin establecer en esta app</option>
          {LEVELS.map(([key,name])=><option key={key} value={key}>{name}</option>)}
        </select>
      </div>;
    })}
    <div className="settings-actions"><button type="button" className="text-button" disabled={busy} onClick={()=>void refresh()}>{busy?<LoaderCircle className="spin" size={16}/>:<RefreshCw size={16}/>}Actualizar</button></div>
    <p className="settings-note"><Check size={13}/> Telegram no deja leer estas reglas una vez fijadas, así que WRGram recuerda aquí la última opción que guardaste desde esta app. Cada nivel copia los límites que define Telegram para esa red.</p>
  </div>;
}
