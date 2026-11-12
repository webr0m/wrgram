import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, FileText, LoaderCircle, ShieldCheck, X, Zap } from 'lucide-react';
import { native, request } from './bridge';
import { useDialog } from './dialogs';
import type { Media, State } from './contract';
import { BUILT_IN_APPS } from './builtInApps';
import { MediaView } from './MediaView';
import './own-apps.css';

function AppDetail({app,busy,error,back,launch}:{app:{name:string};busy:boolean;error:string;back():void;launch(chat?:boolean):void}){
  const ref=useRef<HTMLElement>(null);
  useDialog(ref,()=>{if(!busy)back();});
  return <div className="modal-backdrop" onMouseDown={event=>{if(event.target===event.currentTarget&&!busy)back();}}>
    <section ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={`Abrir ${app.name}`}><header><h2>{app.name}</h2><button className="icon-button" aria-label="Cancelar" onClick={back} disabled={busy}><X/></button></header><p>Telegram entregará a esta Mini App los datos de lanzamiento de tu cuenta (por ejemplo, identificador, nombre e idioma) y la infraestructura recibirá tu IP. No se adjunta tu historial, teléfono, otras cuentas ni notas.</p><p>Los administradores de grupos solo actúan donde los autorices. Usa las descargas únicamente con permiso del titular. Cámara, micrófono, ubicación y portapapeles solo se activan tras tu confirmación y el permiso de Android; la ubicación queda recordada para esta Mini App y se revoca desde los ajustes de Android. Ningún dato se envía al bot sin que lo confirmes en pantalla.</p><p className="privacy-copy">Si aceptas compartir tu teléfono, se envía al bot como un contacto en el chat de Telegram, nunca al sitio web. El almacenamiento de la Mini App es persistente y está separado por cuenta y bot; el almacenamiento web del navegador sigue desactivado.</p><p className="privacy-copy">Sin pagos con factura ni exportación de descargas blob. Puedes abrir el chat si la Mini App necesita una función todavía no soportada.</p>{error&&<p className="auth-error" role="alert">{error}</p>}<div className="modal-actions"><button className="secondary" disabled={busy} onClick={()=>void launch(true)}>Abrir chat del bot</button><button className="primary" disabled={busy} onClick={()=>void launch()}>{busy?<LoaderCircle className="spin"/>:'Abrir con mi cuenta'}</button></div></section>
  </div>;
}

export function Plugins({state,grant,openBot}:{state:State;grant(plugin:string,value:boolean):void;openBot():void}){
  const [selected,setSelected]=useState<string>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [photos,setPhotos]=useState<Record<string,Media>>({});
  const app=BUILT_IN_APPS.find(item=>item.id===selected);
  useEffect(()=>{setPhotos({});if(!state.ready||!native)return;let cancelled=false;for(const item of BUILT_IN_APPS)void request<{photo?:Media}>('apps.profile',{app:item.id}).then(profile=>{if(!cancelled&&profile.photo)setPhotos(old=>({...old,[item.id]:profile.photo!}));}).catch(()=>{});return()=>{cancelled=true;};},[state.selfId,state.ready]);
  async function launch(chat=false){if(!app||busy)return;setBusy(true);setError('');try{await request(chat?'apps.chat':'apps.open',{app:app.id});setSelected(undefined);}catch(reason){setError(reason instanceof Error?reason.message:'No se pudo abrir la app.');}finally{setBusy(false);}}
     return <main className="feature-page own-apps"><header className="page-heading"><span className="section-icon"><Bot/></span><div><span className="eyebrow">APPS PROPIAS · INCLUIDAS</span><h1>Tus herramientas.<br/><em>Dentro de WRGram.</em></h1><p>Las seis apps del desarrollador vienen de fábrica. Sin instalación adicional ni WRGram Premium.</p></div><span className="pill">{state.version}</span></header>
    <div className="feature-content"><section className="premium-banner"><ShieldCheck size={32}/><div><h2>Permisos bajo tu control.</h2><p>No se comparten otros chats ni se añaden bots a grupos automáticamente.</p></div></section><div className="plugin-grid">{BUILT_IN_APPS.map(item=><article className="plugin-card" key={item.id}><div className="plugin-card-top"><span className="plugin-icon">{photos[item.id]?<MediaView media={photos[item.id]} auto/>:<img src={`./bots/${item.id}.jpg`} alt={`Foto pública de ${item.name}`} width={48} height={48}/>}</span><span className="status-pill enabled">Incluida</span></div><h3>{item.name}</h3><p>{item.description}</p><small>@{item.username}</small><button className="secondary" disabled={!state.ready||!native} onClick={()=>{setSelected(item.id);setError('');}}>Abrir Mini App<ArrowRight size={15}/></button></article>)}</div>
     <div className="honest-note"><ShieldCheck size={18}/><p>Apps propias incluidas por defecto. No hay conectores premium operativos ni cobros de WRGram. Sus servicios se ejecutan en sus servidores; para abrir una Mini App, Telegram debe ofrecerla en el perfil, el menú o un botón de ese bot. Sin permisos administrativos automáticos.</p></div>
    <h2>Herramientas locales</h2><div className="plugin-grid">{[{id:'notes',name:'Notas privadas',description:'Cifradas en tu dispositivo, separadas por cuenta y conversación.',icon:<FileText/>},{id:'replies',name:'Respuestas rápidas',description:'Solo preparan un borrador. Tú confirmas el envío.',icon:<Zap/>}].map(item=><article className="plugin-card" key={item.id}><span className="plugin-icon">{item.icon}</span><h3>{item.name}</h3><p>{item.description}</p><button className="secondary" disabled={!state.ready} onClick={()=>grant(item.id,!state.permissions[item.id as 'notes'|'replies'])}>{state.permissions[item.id as 'notes'|'replies']?'Revocar permiso':'Activar con permisos'}</button></article>)}</div><button className="text-button" onClick={openBot}>Abrir otro bot por @usuario<ArrowRight size={16}/></button></div>
    {app&&<AppDetail app={app} busy={busy} error={error} back={()=>setSelected(undefined)} launch={launch}/>}
  </main>;
}

