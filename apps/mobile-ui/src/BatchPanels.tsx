import { useEffect, useState, type CSSProperties } from 'react';
import { Activity, ArrowRight, Check, ListChecks, LoaderCircle, Plus, RefreshCw, Search, Send, ShieldCheck, Smile, Trash2, UserRound, X } from 'lucide-react';
import type { CacheCategory, CacheDetails, CachePolicy, ChecklistInfo, Contact, Poll, ProxyEntry, StickerPack, StorageStatus } from './contract';
import { MediaView } from './MediaView';
import './batch.css';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;
type Close=()=>void;

const errorText=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const clock=(seconds:number)=>`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
const sizeText=(value:number)=>value<=0?'0 MB':value<1048576?`${Math.ceil(value/1024)} KB`:`${(value/1048576).toFixed(1)} MB`;

export function PollCard({messageId,poll,run}:{messageId:string;poll:Poll;run:Run}){
  const chosenKey=poll.options.filter(option=>option.chosen).map(option=>option.index).join(',');
  const [choices,setChoices]=useState<Set<number>>(()=>new Set(chosenKey?chosenKey.split(',').map(Number):[]));
  const [pending,setPending]=useState(false),[error,setError]=useState(''),[stopAsk,setStopAsk]=useState(false);
  const [voters,setVoters]=useState<{option:number;total:number;items:{name:string;date:number}[]}>();
  useEffect(()=>{setChoices(new Set(chosenKey?chosenKey.split(',').map(Number):[]));},[chosenKey]);
  const closed=poll.closed||!!poll.restriction;
  const showResults=poll.closed||poll.canSeeResults;
  async function submit(values:number[]){
    if(pending||closed||!values.length)return;
    setPending(true);setError('');
    try{const sent=await run<boolean>('poll.answer',{id:messageId,options:values});if(!sent)setError('Telegram no confirmó el voto.');}
    catch(caught){setError(errorText(caught,'No se pudo registrar el voto.'));}
    finally{setPending(false);}
  }
  function tap(index:number){
    if(closed||pending)return;
    if(!poll.multiple){setChoices(new Set([index]));void submit([index]);return;}
    setChoices(previous=>{const next=new Set(previous);if(next.has(index))next.delete(index);else if(next.size<10)next.add(index);return next;});
  }
  async function stop(){setPending(true);setError('');try{await run('poll.stop',{id:messageId});}catch(caught){setError(errorText(caught,'Telegram no permitió cerrar la encuesta.'));}finally{setPending(false);setStopAsk(false);}}
  async function loadVoters(option:number){setPending(true);setError('');try{const result=await run<{total:number;items:{name:string;date:number}[]}>('poll.voters',{id:messageId,option,limit:50});if(result)setVoters({option,total:result.total,items:result.items});}catch(caught){setError(errorText(caught,'No se pudo consultar la lista de votantes.'));}finally{setPending(false);}}
  return <section className="poll-card" aria-label="Encuesta">
    <header><ListChecks size={16}/><strong>{poll.question}</strong>{poll.closed&&<span className="poll-badge">Cerrada</span>}{poll.quiz&&<span className="poll-badge">Cuestionario</span>}</header>
    {poll.description&&<p className="poll-description">{poll.description}</p>}
    <div className="poll-options">{poll.options.map(option=>{
      const chosen=choices.has(option.index);
      return <div className="poll-option-row" key={option.index}>
        <button type="button" className={`poll-option ${chosen?'is-chosen':''}`} aria-pressed={chosen} disabled={closed||pending||(!poll.multiple&&chosen)} onClick={()=>tap(option.index)}>
          {showResults&&<span className="poll-fill" style={{width:`${Math.max(0,Math.min(100,option.percentage))}%`} as CSSProperties}/>}
          <span className="poll-check">{chosen?<Check size={13}/>:poll.quiz?String.fromCharCode(65+option.index):null}</span>
          <span className="poll-label">{option.text}</span>
          {showResults&&<span className="poll-percentage">{option.percentage}%</span>}
        </button>
        {showResults&&<button type="button" className="poll-votes" disabled={pending||!poll.canGetVoters} title={poll.canGetVoters?'Ver votantes':undefined} onClick={()=>void loadVoters(option.index)}>{option.votes}</button>}
      </div>;
    })}</div>
    {poll.multiple&&!closed&&<button className="primary full" disabled={!choices.size||pending} onClick={()=>void submit([...choices])}>{pending?<LoaderCircle className="spin" size={16}/>:<Check size={16}/>}Votar</button>}
    <footer><span>{poll.totalVoters} voto(s) · {poll.anonymous?'Anónima':'Visible'}{poll.multiple?' · Varias respuestas':''}{poll.revoting?' · Se puede cambiar':''}</span>{poll.canStop&&<button type="button" className="text-button" onClick={()=>setStopAsk(true)}>Cerrar encuesta</button>}</footer>
    {poll.restriction&&<p className="poll-note" role="status">{poll.restriction}</p>}
    {poll.explanation&&<p className="poll-explanation"><strong>Explicación:</strong> {poll.explanation}</p>}
    {stopAsk&&<div className="poll-confirm"><p>¿Cerrar esta encuesta? No se admitirán más votos.</p><div><button type="button" className="secondary" onClick={()=>setStopAsk(false)}>Cancelar</button><button type="button" className="danger" disabled={pending} onClick={()=>void stop()}>Cerrar encuesta</button></div></div>}
    {voters&&<div className="poll-voters-list"><header><strong>Votantes: {poll.options.find(option=>option.index===voters.option)?.text||''}</strong><button type="button" className="icon-button" aria-label="Cerrar votantes" onClick={()=>setVoters(undefined)}><X size={15}/></button></header>{voters.items.length===0?<small>Telegram no devolvió nombres de votantes.</small>:<ul>{voters.items.map((voter,index)=><li key={`${voter.date}:${index}`}><UserRound size={13}/><span>{voter.name||'Usuario'}</span><small>{new Date(voter.date*1000).toLocaleString('es',{dateStyle:'short',timeStyle:'short'})}</small></li>)}</ul>}{voters.total>voters.items.length&&<small>Se muestran {voters.items.length} de {voters.total} votantes.</small>}</div>}
    {error&&<p className="poll-note" role="alert">{error}</p>}
  </section>;
}

export interface PollDraft {question:string;options:string[];quiz:boolean;multiple:boolean;anonymous:boolean;revoting:boolean;hide:boolean;explanation:string;correct:number}

export function PollComposer({send,close}:{send(draft:PollDraft):Promise<boolean|undefined>;close:Close}){
  const [question,setQuestion]=useState('');
  const [options,setOptions]=useState<string[]>(['','']);
  const [quiz,setQuiz]=useState(false),[multiple,setMultiple]=useState(false),[anonymous,setAnonymous]=useState(true),[revoting,setRevoting]=useState(false),[hide,setHide]=useState(false);
  const [correct,setCorrect]=useState(0),[explanation,setExplanation]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  function update(index:number,value:string){setOptions(previous=>previous.map((item,position)=>position===index?value:item));}
  async function submit(){
    const clean=options.map(option=>option.trim());
    if(!question.trim())return setError('Escribe una pregunta.');
    if(question.trim().length>255)return setError('La pregunta admite hasta 255 caracteres.');
    if(clean.length<2||clean.length>10)return setError('Añade entre 2 y 10 opciones.');
    if(clean.some(option=>!option))return setError('Completa todas las opciones o elimina las que sobren.');
    if(clean.some(option=>option.length>100))return setError('Cada opción admite hasta 100 caracteres.');
    if(new Set(clean.map(option=>option.toLocaleLowerCase())).size!==clean.length)return setError('Las opciones no pueden repetirse.');
    if(quiz&&(correct<0||correct>=clean.length))return setError('Elige la respuesta correcta.');
    setBusy(true);setError('');
    try{const sent=await send({question:question.trim(),options:clean,quiz,multiple:!quiz&&multiple,anonymous,revoting,hide,explanation:explanation.trim(),correct:quiz?correct:-1});if(sent)close();}catch(caught){setError(errorText(caught,'No se pudo enviar la encuesta.'));}
    finally{setBusy(false);}
  }
  return <form className="poll-composer" onSubmit={event=>{event.preventDefault();void submit();}}>
    <label className="field-label">Pregunta<input autoFocus value={question} maxLength={255} placeholder="¿Qué quieres preguntar?" onChange={event=>setQuestion(event.target.value)}/></label>
    <fieldset><legend>Opciones ({options.length}/10)</legend>{options.map((option,index)=><div className="poll-composer-option" key={index}>{quiz?<input type="radio" aria-label={`Respuesta correcta ${index+1}`} checked={correct===index} onChange={()=>setCorrect(index)}/>:<span className="poll-option-number">{index+1}</span>}<input value={option} maxLength={100} placeholder={`Opción ${index+1}`} onChange={event=>update(index,event.target.value)}/>{options.length>2&&<button type="button" className="icon-button" aria-label={`Quitar opción ${index+1}`} onClick={()=>{setOptions(previous=>previous.filter((_,position)=>position!==index));if(correct>=options.length-1)setCorrect(0);}}><X size={15}/></button>}</div>)}{options.length<10&&<button type="button" className="text-button" onClick={()=>setOptions(previous=>[...previous,''])}><Plus size={15}/>Añadir opción</button>}</fieldset>
    <div className="poll-composer-toggles">
      <label><input type="checkbox" checked={quiz} onChange={event=>{setQuiz(event.target.checked);if(event.target.checked)setMultiple(false);}}/>Cuestionario con una respuesta correcta</label>
      <label><input type="checkbox" checked={quiz?false:multiple} disabled={quiz} onChange={event=>setMultiple(event.target.checked)}/>Permitir varias respuestas</label>
      <label><input type="checkbox" checked={anonymous} onChange={event=>setAnonymous(event.target.checked)}/>Votos anónimos</label>
      <label><input type="checkbox" checked={revoting} onChange={event=>setRevoting(event.target.checked)}/>Permitir cambiar el voto</label>
      <label><input type="checkbox" checked={hide} onChange={event=>setHide(event.target.checked)}/>Ocultar resultados hasta cerrar</label>
    </div>
    <label className="field-label">Explicación (opcional, solo cuestionarios)<textarea className="large-input" value={explanation} maxLength={200} disabled={!quiz} onChange={event=>setExplanation(event.target.value)}/></label>
    <p className="settings-note">La encuesta se envía a Telegram solo al pulsar el botón. Las encuestas anónimas no revelan quién votó qué.</p>
    {error&&<p className="poll-note" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<ListChecks size={17}/>}Enviar encuesta</button>
  </form>;
}

export interface ChecklistDraft {title:string;tasks:{id:number;text:string}[];othersCanAdd:boolean;othersCanDone:boolean}

export function ChecklistComposer({send,close,initial,action='Enviar lista de tareas',adding=false}:{send(draft:ChecklistDraft):Promise<boolean|undefined>;close:Close;initial?:ChecklistInfo;action?:string;adding?:boolean}){
  const [title,setTitle]=useState(initial?.title??'');
  const [rows,setRows]=useState<{id:number;text:string}[]>(adding||!initial?[{id:0,text:''},{id:0,text:''}]:initial.tasks.map(task=>({id:task.id,text:task.text})));
  const [othersCanAdd,setOthersCanAdd]=useState(initial?.othersCanAdd??false),[othersCanDone,setOthersCanDone]=useState(initial?.othersCanMark??false);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  function update(index:number,value:string){setRows(previous=>previous.map((row,position)=>position===index?{...row,text:value}:row));}
  async function submit(){
    const clean=rows.map(row=>({...row,text:row.text.replace(/\s*\n\s*/g,' ').trim()}));
    if(!title.trim())return setError('Escribe un título para la lista.');
    if(title.trim().length>2000)return setError('El título admite hasta 2000 caracteres.');
    const filled=clean.filter(row=>row.text);
    if(filled.length<1)return setError('Añade al menos una tarea.');
    if(filled.length>100)return setError('Una lista lleva hasta 100 tareas.');
    if(filled.some(row=>row.text.length>2000))return setError('Cada tarea admite hasta 2000 caracteres.');
    if(new Set(filled.map(row=>row.text.toLocaleLowerCase())).size!==filled.length)return setError('No repitas la misma tarea.');
    setBusy(true);setError('');
    try{const sent=await send({title:title.trim(),tasks:filled,othersCanAdd,othersCanDone});if(sent)close();}catch(caught){setError(errorText(caught,'No se pudo enviar la lista de tareas.'));}
    finally{setBusy(false);}
  }
  return <form className="poll-composer checklist-composer" onSubmit={event=>{event.preventDefault();void submit();}}>
    <label className="field-label">Título de la lista<input autoFocus={!adding} disabled={adding} value={title} maxLength={2000} placeholder="Pendientes de la semana" onChange={event=>setTitle(event.target.value)}/></label>
    <fieldset><legend>Tareas ({rows.filter(row=>row.text.trim()).length}/100)</legend>{rows.map((row,index)=><div className="poll-composer-option" key={index}><span className="poll-option-number">{row.id&&initial?<Check size={13}/>:index+1}</span><input value={row.text} maxLength={2000} placeholder={`Tarea ${index+1}`} onChange={event=>update(index,event.target.value)}/>{rows.length>1&&<button type="button" className="icon-button" aria-label={`Quitar tarea ${index+1}`} onClick={()=>setRows(previous=>previous.filter((_,position)=>position!==index))}><X size={15}/></button>}</div>)}{rows.length<100&&<button type="button" className="text-button" onClick={()=>setRows(previous=>[...previous,{id:0,text:''}])}><Plus size={15}/>Añadir tarea</button>}</fieldset>
    {!adding&&<div className="poll-composer-toggles">
      <label><input type="checkbox" checked={othersCanAdd} onChange={event=>setOthersCanAdd(event.target.checked)}/>Permitir que otras personas añadan tareas</label>
      <label><input type="checkbox" checked={othersCanDone} onChange={event=>setOthersCanDone(event.target.checked)}/>Permitir que otras personas marquen tareas</label>
    </div>}
    <p className="settings-note">{adding?'Se añadirán solo las tareas nuevas escritas aquí; el título y el resto de la lista no cambian.':'Las listas de tareas requieren Telegram Premium y no se envían a canales ni a chats secretos. Se envía a Telegram solo al pulsar el botón. Al editar, Telegram conserva qué tareas ya estaban hechas.'}</p>
    {error&&<p className="poll-note" role="alert">{error}</p>}
    <button className="primary full" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<ListChecks size={17}/>}<span>{action}</span></button>
  </form>;
}

export function ShareContactPicker({run,close,pick}:{run:Run;close:Close;pick(contact:Contact):void}){
  const [query,setQuery]=useState(''),[items,setItems]=useState<Contact[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{
    let current=true;setBusy(true);setError('');
    const timer=setTimeout(()=>{void (async()=>{
      try{const result=query.trim()?await run<Contact[]>('contacts.search',{query:query.trim()}):await run<Contact[]>('contacts.list');if(current&&result)setItems(result.filter(contact=>!contact.bot));}
      catch(caught){if(current)setError(errorText(caught,'No se pudieron cargar tus contactos de Telegram.'));}
      finally{if(current)setBusy(false);}
    })();},query.trim()?250:0);
    return()=>{current=false;clearTimeout(timer);};
  },[query]);
  return <div className="contact-share">
    <label className="chat-search"><Search size={17}/><input autoFocus aria-label="Buscar contacto para compartir" placeholder="Buscar en contactos de Telegram" value={query} onChange={event=>setQuery(event.target.value)}/></label>
    <p className="settings-note">Solo se comparte el número de teléfono que Telegram ya expone en tus contactos. Se envía en esta conversación después de confirmar.</p>
    {busy?<p className="settings-note" role="status"><LoaderCircle className="spin" size={15}/> Consultando contactos…</p>:items.length===0?<p className="settings-note">No hay contactos disponibles. La búsqueda no consulta la agenda del teléfono.</p>:<div className="contact-results">{items.map(contact=><button type="button" className="contact-row contact-share-item" key={contact.id} onClick={()=>pick(contact)}><UserRound size={17}/><span><strong>{contact.name}</strong><small>{contact.username?`@${contact.username}`:'Contacto de Telegram'}</small></span><ArrowRight size={15}/></button>)}</div>}
    {error&&<p className="poll-note" role="alert">{error}</p>}
    <button className="secondary full" onClick={close}>Cancelar</button>
  </div>;
}

export function VoiceRecorder({run,replyId,silent,autoStopped,done}:{run:Run;replyId:string;silent:boolean;autoStopped:boolean;done:Close}){
  const [elapsed,setElapsed]=useState(0),[busy,setBusy]=useState(false);
  useEffect(()=>{if(autoStopped){setElapsed(60);return;}const started=Date.now();const timer=setInterval(()=>setElapsed(Math.min(60,Math.floor((Date.now()-started)/1000))),250);return()=>clearInterval(timer);},[autoStopped]);
  async function finish(){
    if(busy)return;setBusy(true);
    const item=await run<{token:string}>('voice.finish');
    if(!item){done();return;}
    const sent=await run<boolean>('send.attachment',{token:item.token,reply:replyId,silent});
    if(!sent)await run('attachment.discard',{token:item.token});
    done();
  }
  async function cancel(){if(busy)return;setBusy(true);await run('voice.cancel');done();}
  return <div className={autoStopped?'voice-recorder stopped':'voice-recorder'} role="status" aria-label={autoStopped?'Nota de voz detenida en el máximo':'Grabando nota de voz'}>
    <span className="voice-dot" aria-hidden="true"/>
    <strong>{autoStopped?`Detenida · ${clock(60)}`:`Grabando… ${clock(elapsed)}`}</strong>
    <small>{autoStopped?'La grabación se detuvo sola al llegar a 1:00. Envíala o descártala.':'Máximo 1:00. La nota se envía solo al tocar Enviar.'}</small>
    <div><button type="button" className="secondary" disabled={busy} onClick={()=>void cancel()}><Trash2 size={16}/>Cancelar</button><button type="button" className="primary" disabled={busy} onClick={()=>void finish()}>{busy?<LoaderCircle className="spin" size={16}/>:<Send size={16}/>}Enviar nota</button></div>
  </div>;
}

export function StickerPacks({run}:{run:Run}){
  const [installed,setInstalled]=useState<StickerPack[]>([]),[query,setQuery]=useState(''),[found,setFound]=useState<StickerPack>(),[open,setOpen]=useState<StickerPack>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const load=async()=>{setBusy(true);setError('');try{const sets=await run<StickerPack[]>('stickers.installed');if(sets)setInstalled(sets);}catch(caught){setError(errorText(caught,'No se pudieron cargar los packs de stickers.'));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  async function search(){if(!query.trim()||busy)return;setBusy(true);setError('');setFound(undefined);try{const pack=await run<StickerPack>('stickers.search',{name:query.trim()});if(pack)setFound(pack);}catch(caught){setError(errorText(caught,'No se encontró el pack indicado.'));}finally{setBusy(false);}}
  async function inspect(pack:StickerPack){setBusy(true);setError('');try{const detail=await run<StickerPack>('stickers.get',{id:pack.id});if(detail)setOpen(detail);}catch(caught){setError(errorText(caught,'No se pudo abrir el pack.'));}finally{setBusy(false);}}
  async function toggle(pack:StickerPack){setBusy(true);setError('');try{const changed=await run<boolean>('stickers.install',{id:pack.id,installed:!pack.installed});if(changed){await load();setOpen(previous=>previous?{...previous,installed:!pack.installed}:previous);setFound(previous=>previous?{...previous,installed:!pack.installed}:previous);}}catch(caught){setError(errorText(caught,'No se pudo cambiar el pack.'));}finally{setBusy(false);}}
  if(open)return <div className="sticker-detail">
    <header>{open.thumbnail&&<MediaView media={open.thumbnail} auto/>}<span><strong>{open.title}</strong><small>{open.name} · {open.size} stickers{open.official?' · Oficial':''}</small></span></header>
    <div className="sticker-grid">{open.stickers?.map(sticker=><MediaView key={sticker.id} media={sticker} auto={!sticker.thumbnail} passive/>)}</div>
    {!open.stickers?.length&&<p className="settings-note">Telegram no devolvió la vista previa de este pack.</p>}
    <div className="settings-actions"><button className="secondary" onClick={()=>setOpen(undefined)}>Volver</button><button className="primary" disabled={busy} onClick={()=>void toggle(open)}>{busy?<LoaderCircle className="spin" size={16}/>:<Smile size={16}/>}{open.installed?'Quitar pack':'Añadir pack'}</button></div>
    {error&&<p className="poll-note" role="alert">{error}</p>}
  </div>;
  return <div className="sticker-manager">
    <div className="sticker-search"><input aria-label="Nombre corto del pack de stickers" placeholder="Nombre corto, por ejemplo Animals" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')void search();}}/><button className="secondary" disabled={busy||!query.trim()} onClick={()=>void search()}>{busy?<LoaderCircle className="spin" size={16}/>:<Search size={16}/>}Buscar</button></div>
    {found&&<button type="button" className="sticker-pack" disabled={busy} onClick={()=>void inspect(found)}>{found.thumbnail?<MediaView media={found.thumbnail} auto/>:<Smile size={22}/>}<span><strong>{found.title}</strong><small>{found.name} · {found.size} stickers</small></span><em>{found.installed?'Instalado':'Añadir'}</em></button>}
    <p className="settings-note">Packs instalados ({installed.length})</p>
    {installed.length===0?<p className="settings-note">No hay packs de stickers instalados en esta cuenta.</p>:<div className="sticker-packs">{installed.map(pack=><button type="button" className="sticker-pack" key={pack.id} disabled={busy} onClick={()=>void inspect(pack)}>{pack.thumbnail?<MediaView media={pack.thumbnail} auto/>:<Smile size={22}/>}<span><strong>{pack.title}</strong><small>{pack.name} · {pack.size} stickers</small></span><ArrowRight size={15}/></button>)}</div>}
    {error&&<p className="poll-note" role="alert">{error}</p>}
  </div>;
}

export function ProxySettings({run}:{run:Run}){
  const [items,setItems]=useState<ProxyEntry[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const [type,setType]=useState('socks5'),[server,setServer]=useState(''),[port,setPort]=useState('1080'),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[secret,setSecret]=useState(''),[comment,setComment]=useState(''),[removing,setRemoving]=useState(0);
  const load=async()=>{setBusy(true);setError('');try{const result=await run<ProxyEntry[]>('proxy.list');if(result)setItems(result);}catch(caught){setError(errorText(caught,'No se pudieron cargar los proxies.'));}finally{setBusy(false);}};
  useEffect(()=>{void load();},[]);
  async function add(){if(busy)return;setBusy(true);setError('');setNotice('');try{const result=await run<ProxyEntry>('proxy.add',{type,server:server.trim(),port:Number(port),username,password,secret,comment,enable:true});if(result){setNotice('Proxy añadido. Las credenciales solo se envían a Telegram y no se muestran de nuevo.');setServer('');setUsername('');setPassword('');setSecret('');setComment('');await load();}}catch(caught){setError(errorText(caught,'No se pudo añadir el proxy.'));}finally{setBusy(false);}}
  async function action(method:'proxy.enable'|'proxy.disable'|'proxy.remove',id:number){if(busy)return;setBusy(true);setError('');setNotice('');try{await run(method,{id});setRemoving(0);await load();}catch(caught){setError(errorText(caught,'No se pudo cambiar el proxy.'));}finally{setBusy(false);}}
  async function ping(id:number){if(busy)return;setBusy(true);setError('');setNotice('');try{const seconds=await run<number>('proxy.ping',{id});if(seconds!==undefined)setNotice(`El proxy respondió en ${(seconds*1000).toLocaleString('es')} ms.`);}catch(caught){setError(errorText(caught,'El proxy no respondió.'));}finally{setBusy(false);}}
  return <div className="proxy-settings">
    {items.length===0?<p className="settings-note">No hay proxies configurados. Telegram conecta directamente.</p>:<div className="proxy-list">{items.map(entry=><div className={`proxy-item ${entry.enabled?'is-enabled':''}`} key={entry.id}><span><strong>{entry.server}:{entry.port}</strong><small>{entry.type.toUpperCase()}{entry.comment?` · ${entry.comment}`:''}{entry.enabled?' · Activo':''}</small></span><div><button type="button" className="icon-button" aria-label="Probar proxy" title="Probar proxy" disabled={busy} onClick={()=>void ping(entry.id)}><Activity size={15}/></button><button type="button" className="icon-button" aria-label={entry.enabled?'Desactivar proxy':'Activar proxy'} title={entry.enabled?'Desactivar':'Activar'} disabled={busy} onClick={()=>void action(entry.enabled?'proxy.disable':'proxy.enable',entry.id)}>{entry.enabled?<X size={15}/>:<Check size={15}/>}</button><button type="button" className="icon-button" aria-label="Quitar proxy" title="Quitar proxy" disabled={busy} onClick={()=>setRemoving(entry.id)}><Trash2 size={15}/></button></div>{removing===entry.id&&<div className="proxy-confirm"><span>¿Quitar este proxy?</span><button type="button" className="danger" disabled={busy} onClick={()=>void action('proxy.remove',entry.id)}>Quitar</button><button type="button" className="secondary" onClick={()=>setRemoving(0)}>Cancelar</button></div>}</div>)}</div>}
    <div className="proxy-form">
      <label className="field-label">Tipo<select value={type} onChange={event=>setType(event.target.value)}><option value="socks5">SOCKS5</option><option value="mtproto">MTProto</option><option value="http">HTTP</option><option value="web">Web (solo enlaces)</option></select></label>
      <div className="proxy-inline"><label className="field-label">Servidor<input value={server} placeholder="proxy.ejemplo.com" maxLength={255} onChange={event=>setServer(event.target.value)}/></label><label className="field-label">Puerto<input value={port} inputMode="numeric" maxLength={5} onChange={event=>setPort(event.target.value.replace(/\D/g,''))}/></label></div>
      {(type==='socks5'||type==='http')&&<><label className="field-label">Usuario (opcional)<input value={username} maxLength={128} autoComplete="off" onChange={event=>setUsername(event.target.value)}/></label><label className="field-label">Contraseña (opcional)<input type="password" value={password} maxLength={128} autoComplete="new-password" onChange={event=>setPassword(event.target.value)}/></label></>}
      {type==='mtproto'&&<label className="field-label">Secreto MTProto<input type="password" value={secret} maxLength={256} autoComplete="off" placeholder="dd + 32–256 caracteres hex" onChange={event=>setSecret(event.target.value)}/></label>}
      <label className="field-label">Comentario (opcional)<input value={comment} maxLength={64} onChange={event=>setComment(event.target.value)}/></label>
      <p className="settings-note">Las credenciales se envían solo a TDLib y nunca se devuelven a la interfaz. Un proxy no oculta que usas Telegram.</p>
      <button className="primary full" disabled={busy||!server.trim()||!port} onClick={()=>void add()}>{busy?<LoaderCircle className="spin" size={16}/>:<ShieldCheck size={16}/>}Añadir y activar</button>
    </div>
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="poll-note" role="alert">{error}</p>}
    <button className="text-button" disabled={busy} onClick={()=>void load()}><RefreshCw size={15}/>Actualizar proxies</button>
  </div>;
}

const CACHE_TYPES = [['photos','Fotos'],['videos','Vídeos y GIF'],['audio','Música y voz'],['files','Archivos']] as const;
const CACHE_DAYS = [[3,'3 días'],[7,'1 semana'],[30,'1 mes'],[90,'3 meses'],[0,'Siempre']] as const;
const RETENTION = [['privateDays','Chats privados'],['groupDays','Grupos'],['channelDays','Canales']] as const;

export function StorageSettings({run,ready}:{run:Run;ready:boolean}) {
  const [status,setStatus]=useState<StorageStatus>();
  const [details,setDetails]=useState<CacheDetails>();
  const [policy,setPolicy]=useState<CachePolicy>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [chatId,selectChat]=useState('');
  const [category,selectCategory]=useState<CacheCategory|'all'>('all');
  const [confirm,setConfirm]=useState(false);

  async function load(resetPolicy=false) {
    const result=await run<StorageStatus>('storage.status');
    if(result){
      setStatus(result);
      if(resetPolicy)setPolicy(result.policy);
    }else setError('No se pudo consultar el uso de almacenamiento.');
    const breakdown=await run<CacheDetails>('storage.details');
    setDetails(breakdown);
    selectChat(current=>breakdown?.chats.some(chat=>chat.id===current)?current:'');
    if(!breakdown)setError('No se pudo consultar el detalle. Puedes reintentar o limpiar toda la caché multimedia.');
  }

  useEffect(()=>{
    if(!ready)return;
    setBusy(true);
    void load(true).finally(()=>setBusy(false));
  },[ready]);

  async function savePolicy() {
    if(!policy||busy)return;
    setBusy(true);
    setNotice('');
    setError('');
    try{
      const result=await run<CachePolicy>('storage.settings',{...policy});
      if(!result){setError('No se pudo guardar la configuración de caché.');return;}
      setPolicy(result);
      setStatus(current=>current?{...current,policy:result}:current);
      setNotice('Configuración guardada para esta cuenta.');
    }finally{setBusy(false);}
  }

  async function clear() {
    if(busy)return;
    setBusy(true);
    setNotice('');
    setError('');
    setConfirm(false);
    try{
      const result=await run<{size:number;count:number}>('storage.optimize',{category,...(chatId?{chatId}:{})});
      if(!result){setError('No se pudo limpiar la caché. Vuelve a intentarlo en un momento.');return;}
      setNotice(result.count?`Se liberaron ${sizeText(result.size)} en ${result.count} archivos.`:'No hay archivos que se puedan liberar con esta selección.');
      selectChat('');
      await load();
    }finally{setBusy(false);}
  }

  function toggleException(id:string) {
    setPolicy(current=>{
      if(!current)return current;
      const keep=current.keepChats;
      return {...current,keepChats:keep.includes(id)?keep.filter(chat=>chat!==id):[...keep,id].slice(0,100)};
    });
  }

  if(!ready)return <p className="settings-note">Abre tu cuenta en WRGram para gestionar su caché.</p>;
  const selected=details?.chats.find(chat=>chat.id===chatId);
  const sizes=selected?.categories??details?.categories;
  const eligible=CACHE_TYPES.reduce((total,[id])=>total+(details?.categories[id]??0),0);
  const changed=policy&&status&&JSON.stringify(policy)!==JSON.stringify(status.policy);
  const availableChats=details?.chats??[];
  return <div className="storage-settings cache-settings">
    <div className="cache-summary">
      <div><span>Caché de archivos</span><strong>{status?sizeText(status.filesSize):'—'}</strong></div>
      <div><span>Base de datos</span><strong>{status?sizeText(status.databaseSize):'—'}</strong></div>
      <div><span>Total local</span><strong>{status?sizeText(status.total):'—'}</strong></div>
    </div>
    {details&&<div className="cache-breakdown" aria-label="Uso por tipo de archivo">
      {CACHE_TYPES.map(([id,label])=>{
        const size=details.categories[id]??0;
        return <div key={id}><span>{label}</span><strong>{sizeText(size)}</strong><progress max={eligible||1} value={size} aria-label={label}/></div>;
      })}
    </div>}
    {policy&&<fieldset className="cache-controls" disabled={busy}>
      <legend>Limpieza automática</legend>
      <label>Límite de caché multimedia<select aria-label="Límite de caché multimedia" value={policy.maxGiB} onChange={event=>setPolicy({...policy,maxGiB:Number(event.target.value)})}>{[1,2,5,10,20,0].map(size=><option key={size} value={size}>{size?size+' GB':'Sin límite'}</option>)}</select></label>
      <p className="settings-note">Al superar el límite, se liberan primero los archivos usados hace más tiempo. Los chats secretos y la base de datos quedan fuera de la limpieza.</p>
      {RETENTION.map(([id,label])=><label key={id}>{label}<select aria-label={label} value={policy[id]} onChange={event=>setPolicy({...policy,[id]:Number(event.target.value)})}>{CACHE_DAYS.map(([days,label])=><option key={days} value={days}>{label}</option>)}</select></label>)}
      <details className="cache-exceptions">
        <summary>Excepciones por chat{policy.keepChats.length?' · '+policy.keepChats.length:''}</summary>
        <p className="settings-note">Conserva el contenido de chats concretos durante más tiempo. El límite de tamaño sigue aplicándose.</p>
        {availableChats.map(chat=><label className="cache-exception" key={chat.id}><span>{chat.title}</span><input type="checkbox" aria-label={`Conservar ${chat.title}`} checked={policy.keepChats.includes(chat.id)} onChange={()=>toggleException(chat.id)}/></label>)}
        {policy.keepChats.filter(id=>!availableChats.some(chat=>chat.id===id)).map(id=><label className="cache-exception" key={id}><span>Chat guardado fuera del listado</span><input type="checkbox" aria-label={`Quitar excepción del chat ${id}`} checked onChange={()=>toggleException(id)}/></label>)}
        {!availableChats.length&&!policy.keepChats.length&&<p className="settings-note">Aquí aparecen las conversaciones con más archivos guardados.</p>}
      </details>
      <button type="button" className="primary" disabled={!changed} onClick={()=>void savePolicy()}>Guardar configuración</button>
    </fieldset>}
    <fieldset className="cache-controls" disabled={busy||!status}>
      <legend>Limpiar caché local</legend>
      <label>Conversación<select aria-label="Conversación" value={chatId} onChange={event=>{selectChat(event.target.value);setConfirm(false);}}><option value="">Todos los chats</option>{availableChats.map(chat=><option value={chat.id} key={chat.id}>{chat.title} · {sizeText(chat.size)}</option>)}</select></label>
      <label>Tipo de archivo<select aria-label="Tipo de archivo" value={category} onChange={event=>{selectCategory(event.target.value as CacheCategory|'all');setConfirm(false);}}><option value="all">Todos los tipos</option>{CACHE_TYPES.map(([id,label])=><option value={id} key={id}>{label}{sizes?' · '+sizeText(sizes[id]??0):''}</option>)}</select></label>
      {confirm?<div className="poll-confirm"><p>Los archivos se quitarán de este dispositivo. Podrás volver a descargarlos desde Telegram.</p><div><button type="button" className="secondary" onClick={()=>setConfirm(false)}>Cancelar</button><button type="button" className="danger" onClick={()=>void clear()}>Limpiar</button></div></div>:<button type="button" className="secondary" onClick={()=>setConfirm(true)}><Trash2 size={16}/> Limpiar caché</button>}
    </fieldset>
    {notice&&<p className="settings-note" role="status">{notice}</p>}
    {error&&<p className="poll-note" role="alert">{error}</p>}
    <button type="button" className="text-button" disabled={busy} onClick={()=>{setError('');setBusy(true);void load(!policy).finally(()=>setBusy(false));}}>{busy?<LoaderCircle size={15} className="spin"/>:<RefreshCw size={15}/>} {busy?'Consultando almacenamiento…':'Actualizar almacenamiento'}</button>
  </div>;
}
