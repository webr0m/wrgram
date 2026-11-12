import { useEffect, useRef, useState } from 'react';
import { Copy, LoaderCircle, Pencil, Plus, RefreshCw, Search, Send, Trash2, X } from 'lucide-react';
import type { AccountBusiness, BusinessBotState, BusinessGreetingInfo, BusinessAwayInfo, BusinessLinkInfo, BusinessRecipientsInfo, Chat, QuickReplyShortcutInfo } from './contract';

export type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

const RECIPIENTS:[keyof BusinessRecipientsInfo,string][]=[['existing','Chats existentes'],['newChats','Chats nuevos'],['contacts','Contactos'],['nonContacts','No contactos']];
const INACTIVITY:[number,string][]=[[7,'7 días'],[14,'14 días'],[21,'21 días'],[28,'28 días']];
const RIGHTS:[string,string][]=[['canReply','Responder mensajes'],['canReadMessages','Leer mensajes'],['canDeleteSentMessages','Borrar sus mensajes enviados'],['canDeleteAllMessages','Borrar todos los mensajes'],['canEditName','Editar nombre'],['canEditBio','Editar biografía'],['canEditProfilePhoto','Editar foto de perfil'],['canEditUsername','Editar usuario'],['canViewGiftsAndStars','Ver regalos y Stars'],['canSellGifts','Vender regalos'],['canChangeGiftSettings','Cambiar ajustes de regalos'],['canTransferAndUpgradeGifts','Mejorar y transferir regalos'],['canTransferStars','Transferir Stars'],['canManageStories','Administrar historias']];
const DAY_LABELS=['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'];
const failure=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const clock=(minute:number)=>`${String(Math.floor(minute/60)%24).padStart(2,'0')}:${String(minute%60).padStart(2,'0')}`;
const parseClock=(value:string)=>{const match=/^(\d{1,2}):(\d{2})$/.exec(value.trim());if(!match)return null;const hour=Number(match[1]),minute=Number(match[2]);if(hour>23||minute>59)return null;return hour*60+minute;};

function Note({text,error,status}:{text?:string;error?:string;status?:string}){
  if(error)return <p className="settings-note settings-error" role="alert">{error}</p>;
  if(status)return <p className="settings-note" role="status">{status}</p>;
  if(text)return <p className="settings-note">{text}</p>;
  return null;
}

function RecipientChecks({value,change}:{value:BusinessRecipientsInfo;change(next:BusinessRecipientsInfo):void}){
  return <div className="business-checks">{RECIPIENTS.map(([key,label])=><label key={key} className="folder-toggle"><input type="checkbox" checked={!!value[key]} onChange={event=>change({...value,[key]:event.target.checked})}/><span>{label}</span></label>)}</div>;
}

function ShortcutSelect({shortcuts,value,change,label}:{shortcuts:QuickReplyShortcutInfo[];value:string;change(value:string):void;label:string}){
  return <select aria-label={label} value={value} onChange={event=>change(event.target.value)}>
    <option value="" disabled>Elige una respuesta rápida</option>
    {shortcuts.map(shortcut=><option key={shortcut.id} value={shortcut.id}>{shortcut.name}</option>)}
  </select>;
}

export function QuickReplySend({run,done}:{run:Run;done():void}){
  const [shortcuts,setShortcuts]=useState<QuickReplyShortcutInfo[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sent,setSent]=useState('');
  const alive=useRef(true);
  useEffect(()=>{
    alive.current=true;
    let attempts=0;
    const pull=()=>void run<{shortcuts:QuickReplyShortcutInfo[]}>('business.quick.list').then(value=>{
      if(!alive.current)return;
      const list=value?.shortcuts||[];
      setShortcuts(list);
      if(!list.length&&attempts<3){attempts++;window.setTimeout(()=>{if(alive.current)pull();},1200);}
    }).catch(()=>{});
    pull();
    return()=>{alive.current=false;};
  },[]);
  async function send(id:number){
    setBusy(true);setError('');
    try{
      const ok=await run<boolean>('business.quick.send',{id});
      if(ok){setSent('Respuesta rápida enviada a esta conversación.');window.setTimeout(done,900);}
    }catch(caught){setError(failure(caught,'Telegram no pudo enviar la respuesta rápida.'));}
    finally{setBusy(false);}
  }
  if(!shortcuts.length&&!error)return <p className="settings-note">Cargando tus respuestas rápidas de Telegram…</p>;
  return <div className="action-list">
    {shortcuts.map(shortcut=><button key={shortcut.id} className="menu-item" disabled={busy} onClick={()=>void send(shortcut.id)}><Send size={18}/><span><strong>{shortcut.name}</strong><small>{shortcut.first||`${shortcut.count} mensaje(s)`}</small></span></button>)}
    {!shortcuts.length&&<p className="settings-note">Crea respuestas rápidas en Ajustes · Telegram Business.</p>}
    {error&&<p className="settings-note settings-error" role="alert">{error}</p>}
    {sent&&<p className="settings-note" role="status">{sent}</p>}
  </div>;
}

type QuickMessage = { id: string; text: string; editable?: boolean };

function QuickReplyAdmin({run,shortcuts,reload}:{run:Run;shortcuts:QuickReplyShortcutInfo[];reload():void}){
  const [name,setName]=useState(''),[text,setText]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const [openId,setOpenId]=useState(0),[messages,setMessages]=useState<QuickMessage[]>([]),[rename,setRename]=useState('');
  const [editing,setEditing]=useState<QuickMessage>();
  const version=useRef(0);
  useEffect(()=>()=>{version.current++;},[]);
  function toggle(shortcut:QuickReplyShortcutInfo){
    const current=++version.current;
    setEditing(undefined);
    if(openId===shortcut.id){setOpenId(0);setMessages([]);return;}
    setOpenId(shortcut.id);setRename(shortcut.name);setMessages([]);
    const fill=(retry:number)=>{
      if(current!==version.current)return;
      void run<{messages:QuickMessage[]}>('business.quick.messages',{id:shortcut.id}).then(value=>{
        if(current!==version.current)return;
        const list=value?.messages||[];
        setMessages(list);
        if(!list.length&&retry>0)window.setTimeout(()=>fill(retry-1),1200);
      }).catch(()=>{});
    };
    fill(2);
  }
  async function editMessage(shortcutId:number){
    if(!editing?.text.trim()||busy)return;
    setBusy(true);setError('');setStatus('');
    try{
      const done=await run<boolean>('business.quick.edit',{id:shortcutId,messageId:editing.id,text:editing.text});
      if(!done){setError('Telegram no confirmó la edición.');return;}
      setMessages(items=>items.map(item=>item.id===editing.id?editing:item));
      setEditing(undefined);
      setStatus('Respuesta rápida actualizada.');
      reload();
    }catch(caught){setError(failure(caught,'No se pudo editar la respuesta rápida.'));}
    finally{setBusy(false);}
  }
  function add(){
    if(!name.trim()||!text.trim())return;
    setBusy(true);setError('');
    void run<boolean>('business.quick.add',{name:name.trim(),text}).then(done=>{
      if(done){setName('');setText('');setStatus('Respuesta rápida enviada a Telegram; aparecerá al sincronizarse.');reload();}
    }).catch(caught=>setError(failure(caught,'Telegram no pudo crear la respuesta rápida.'))).finally(()=>setBusy(false));
  }
  function applyRename(id:number){
    if(!rename.trim())return;
    setBusy(true);
    void run<boolean>('business.quick.name',{id,name:rename.trim()}).then(done=>{if(done)reload();}).catch(caught=>setError(failure(caught,'No se pudo renombrar en Telegram.'))).finally(()=>setBusy(false));
  }
  function remove(id:number){
    setBusy(true);
    void run<boolean>('business.quick.delete',{id}).then(done=>{if(done){setOpenId(0);setStatus('Respuesta rápida eliminada de Telegram.');reload();}}).catch(caught=>setError(failure(caught,'No se pudo eliminar en Telegram.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Respuestas rápidas</h4>
    <Note error={error} status={status}/>
    {shortcuts.length>0&&<ul className="business-list">{shortcuts.map(shortcut=><li key={shortcut.id} className="business-row">
      <button type="button" className="business-row-main" disabled={busy} onClick={()=>toggle(shortcut)}>
        <strong>{shortcut.name}</strong>
        <small>{shortcut.first||`${shortcut.count} mensaje(s)`}</small>
      </button>
      <span className="business-row-actions">
        <button type="button" className="secondary" disabled={busy} aria-label={`Eliminar ${shortcut.name}`} onClick={()=>remove(shortcut.id)}><Trash2 size={15}/></button>
      </span>
      {openId===shortcut.id&&<div className="business-row-detail">
        <label className="field-label">Nombre<input maxLength={32} value={rename} onChange={event=>setRename(event.target.value)}/></label>
        <div className="settings-actions"><button className="secondary" disabled={busy||!rename.trim()} onClick={()=>applyRename(shortcut.id)}>Guardar nombre</button></div>
        <ul className="business-messages">{messages.map(message=><li key={message.id}>
          {editing?.id===message.id?<form onSubmit={event=>{event.preventDefault();void editMessage(shortcut.id);}}>
            <label className="field-label">Texto de la respuesta<textarea value={editing.text} maxLength={4096} disabled={busy} onChange={event=>setEditing({...editing,text:event.target.value})}/></label>
            <div className="settings-actions"><button type="submit" className="primary" disabled={busy||!editing.text.trim()}>Guardar texto</button><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing(undefined)}>Cancelar</button></div>
          </form>:<>{message.text}{message.editable&&<button type="button" className="text-button" disabled={busy} onClick={()=>setEditing(message)}><Pencil size={15}/>Editar texto</button>}</>}
        </li>)}</ul>
        {!messages.length&&<p className="settings-note">Los mensajes de esta respuesta llegan por actualización de Telegram; pulsa de nuevo en unos segundos.</p>}
      </div>}
    </li>)}</ul>}
    {!shortcuts.length&&<p className="settings-note">Aún no hay respuestas rápidas en esta cuenta de Telegram.</p>}
    <label className="field-label">Nombre (máx. 32)<input maxLength={32} value={name} onChange={event=>setName(event.target.value)}/></label>
    <label className="field-label">Texto del primer mensaje<input maxLength={4096} value={text} onChange={event=>setText(event.target.value)}/></label>
    <div className="settings-actions"><button className="secondary" disabled={busy||!name.trim()||!text.trim()} onClick={add}>{busy?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>}Crear respuesta rápida</button><button type="button" className="text-button" disabled={busy} onClick={reload}><RefreshCw size={16}/>Actualizar</button></div>
    <p className="settings-note">Las respuestas rápidas las guarda Telegram, no WRGram. La lista llega por actualizaciones y puede tardar unos segundos tras crear o borrar.</p>
  </div>;
}

function GreetingForm({run,shortcuts,prefill}:{run:Run;shortcuts:QuickReplyShortcutInfo[];prefill?:BusinessGreetingInfo}){
  const [shortcutId,setShortcutId]=useState(prefill&&prefill.shortcutId!=='0'?prefill.shortcutId:'');
  const [days,setDays]=useState(prefill?.inactivityDays||14);
  const [recipients,setRecipients]=useState<BusinessRecipientsInfo>(prefill?.recipients||{existing:true});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function save(){
    if(!shortcutId)return;
    setBusy(true);setError('');
    void run<boolean>('business.greeting',{shortcutId,inactivityDays:days,recipients}).then(done=>{
      if(done)setStatus('Saludo guardado en tu cuenta de Telegram.');
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar el saludo.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Saludo a nuevos clientes</h4>
    <Note error={error} status={status}/>
    <ShortcutSelect shortcuts={shortcuts} value={shortcutId} change={setShortcutId} label="Respuesta rápida del saludo"/>
    <label className="field-label">Enviar tras
      <select aria-label="Días de inactividad" value={days} onChange={event=>setDays(Number(event.target.value))}>
        {INACTIVITY.map(([value,label])=><option key={value} value={value}>{label} sin escribir</option>)}
      </select>
    </label>
    <RecipientChecks value={recipients} change={setRecipients}/>
    <div className="settings-actions"><button className="primary" disabled={busy||!shortcutId} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar saludo</button></div>
    <p className="settings-note">{prefill?`Telegram tiene un saludo tras ${prefill.inactivityDays} días de inactividad.`:'Telegram no tiene saludo configurado; crea una respuesta rápida arriba y guárdalo aquí.'} Para quitarlo por completo, Telegram oficial sigue siendo el camino; aquí puedes reemplazar sus valores.</p>
  </div>;
}

function AwayForm({run,shortcuts,prefill}:{run:Run;shortcuts:QuickReplyShortcutInfo[];prefill?:BusinessAwayInfo}){
  const [shortcutId,setShortcutId]=useState(prefill&&prefill.shortcutId!=='0'?prefill.shortcutId:'');
  const [kind,setKind]=useState<BusinessAwayInfo['schedule']['type']>(prefill?.schedule.type||'always');
  const [start,setStart]=useState(prefill?.schedule.startDate?toLocal(prefill.schedule.startDate):'');
  const [end,setEnd]=useState(prefill?.schedule.endDate?toLocal(prefill.schedule.endDate):'');
  const [offlineOnly,setOfflineOnly]=useState(prefill?.offlineOnly||false);
  const [recipients,setRecipients]=useState<BusinessRecipientsInfo>(prefill?.recipients||{existing:true});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function save(){
    if(!shortcutId)return;
    const params:Record<string,unknown>={shortcutId,schedule:kind,offlineOnly,recipients};
    if(kind==='custom'){
      const from=start?Math.floor(Date.parse(start)/1000):0,to=end?Math.floor(Date.parse(end)/1000):0;
      if(!from||!to||to<=from){setError('Elige inicio y fin válidos para el periodo personalizado.');return;}
      params.startDate=from;params.endDate=to;
    }
    setBusy(true);setError('');
    void run<boolean>('business.away',params).then(done=>{
      if(done)setStatus('Mensaje de ausencia guardado en tu cuenta de Telegram.');
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar el mensaje de ausencia.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Mensaje de ausencia</h4>
    <Note error={error} status={status}/>
    <ShortcutSelect shortcuts={shortcuts} value={shortcutId} change={setShortcutId} label="Respuesta rápida de ausencia"/>
    <label className="field-label">Cuándo enviar
      <select aria-label="Programación de la ausencia" value={kind} onChange={event=>setKind(event.target.value as BusinessAwayInfo['schedule']['type'])}>
        <option value="always">Siempre que esté fuera de horario</option>
        <option value="outside">Fuera del horario de apertura</option>
        <option value="custom">Solo en un periodo concreto</option>
      </select>
    </label>
    {kind==='always'&&<p className="settings-note">«Siempre» envía la ausencia a cualquier hora; úsalo solo si no publicas horario.</p>}
    {kind==='outside'&&<p className="settings-note">Requiere un horario de apertura guardado más abajo.</p>}
    {kind==='custom'&&<div className="business-times">
      <label className="field-label">Desde<input type="datetime-local" value={start} onChange={event=>setStart(event.target.value)}/></label>
      <label className="field-label">Hasta<input type="datetime-local" value={end} onChange={event=>setEnd(event.target.value)}/></label>
    </div>}
    <RecipientChecks value={recipients} change={setRecipients}/>
    <label className="toggle-row"><span><strong>Solo con la app cerrada</strong><small>Telegram envía la ausencia únicamente cuando no hay sesión activa.</small></span><input type="checkbox" checked={offlineOnly} onChange={event=>setOfflineOnly(event.target.checked)}/><span className="switch" aria-hidden="true"/></label>
    <div className="settings-actions"><button className="primary" disabled={busy||!shortcutId} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar ausencia</button></div>
    <p className="settings-note">Reemplaza los valores en Telegram; para desactivarlo del todo, Telegram oficial sigue siendo el camino.</p>
  </div>;
}

function toLocal(seconds:number){const value=new Date(seconds*1000);const pad=(input:number)=>String(input).padStart(2,'0');return `${value.getFullYear()}-${pad(value.getMonth()+1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;}

function HoursForm({run,prefill}:{run:Run;prefill?:AccountBusiness}){
  const build=()=>{
    const rows=DAY_LABELS.map(()=>({enabled:false,open:'09:00',close:'18:00'}));
    for(const interval of prefill?.hours||[]){
      const day=Math.min(6,Math.floor(interval.startMinute/1440));
      const endOfDay=interval.endMinute-day*1440;
      if(endOfDay<=0||endOfDay>1440)continue;
      rows[day]={enabled:true,open:clock(interval.startMinute%1440),close:clock(endOfDay)};
    }
    return rows;
  };
  const [zone,setZone]=useState(prefill?.timeZoneId&&prefill.timeZoneId.trim()?prefill.timeZoneId:'');
  const [rows,setRows]=useState(build);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function save(){
    const intervals:{startMinute:number;endMinute:number}[]=[];
    rows.forEach((row,day)=>{
      const open=parseClock(row.open),close=parseClock(row.close);
      if(!row.enabled||open==null||close==null)return;
      if(close<=open){setError(`El ${DAY_LABELS[day].toLowerCase()} debe cerrar después de abrir.`);return;}
      intervals.push({startMinute:day*1440+open,endMinute:day*1440+close});
    });
    setBusy(true);setError('');
    void run<boolean>('business.hours',{timeZoneId:zone.trim(),intervals}).then(done=>{
      if(done)setStatus('Horario guardado en tu cuenta de Telegram.');
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar el horario.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Horario de apertura</h4>
    <Note error={error} status={status}/>
    <label className="field-label">Zona horaria (IANA, por ejemplo Europe/Madrid)<input maxLength={64} value={zone} onChange={event=>setZone(event.target.value)}/></label>
    <div className="business-hours">{rows.map((row,day)=><div className="business-hours-row" key={day}>
      <label className="folder-toggle"><input type="checkbox" checked={row.enabled} onChange={event=>setRows(list=>list.map((item,index)=>index===day?{...item,enabled:event.target.checked}:item))}/><span>{DAY_LABELS[day]}</span></label>
      <input type="time" aria-label={`Apertura del ${DAY_LABELS[day].toLowerCase()}`} value={row.open} disabled={!row.enabled} onChange={event=>setRows(list=>list.map((item,index)=>index===day?{...item,open:event.target.value}:item))}/>
      <input type="time" aria-label={`Cierre del ${DAY_LABELS[day].toLowerCase()}`} value={row.close} disabled={!row.enabled} onChange={event=>setRows(list=>list.map((item,index)=>index===day?{...item,close:event.target.value}:item))}/>
    </div>)}</div>
    <div className="settings-actions"><button className="primary" disabled={busy||!zone.trim()} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar horario</button></div>
    <p className="settings-note">Este panel guarda una franja por día; los tramos más finos se editan en Telegram oficial. Telegram divide y guarda el horario por semana completa.</p>
  </div>;
}

function LocationForm({run,prefill}:{run:Run;prefill?:string}){
  const [address,setAddress]=useState(prefill||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function save(){
    setBusy(true);setError('');
    void run<boolean>('business.location',{address:address.trim()}).then(done=>{
      if(done)setStatus('Ubicación guardada en tu cuenta de Telegram.');
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar la ubicación.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Ubicación</h4>
    <Note error={error} status={status}/>
    <label className="field-label">Dirección visible en tu perfil<input maxLength={64} value={address} onChange={event=>setAddress(event.target.value)}/></label>
    <div className="settings-actions"><button className="primary" disabled={busy||!address.trim()} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar ubicación</button></div>
    <p className="settings-note">La dirección se muestra en tu perfil de Telegram Business. La coordenada exacta la fija Telegram oficial.</p>
  </div>;
}

function StartPageForm({run,prefill}:{run:Run;prefill?:{title:string;message:string}}){
  const [title,setTitle]=useState(prefill?.title||'');
  const [message,setMessage]=useState(prefill?.message||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function save(){
    setBusy(true);setError('');
    void run<boolean>('business.start',{title:title.trim(),message}).then(done=>{
      if(done)setStatus('Página de inicio guardada en tu cuenta de Telegram.');
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar la página de inicio.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Página de inicio</h4>
    <Note error={error} status={status}/>
    <label className="field-label">Título (máx. 64)<input maxLength={64} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label className="field-label">Mensaje de bienvenida<input maxLength={4096} value={message} onChange={event=>setMessage(event.target.value)}/></label>
    <div className="settings-actions"><button className="primary" disabled={busy||!title.trim()} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar página de inicio</button></div>
    <p className="settings-note">Se muestra al abrir el chat contigo en Telegram Business. El sticker decorativo no se elige desde aquí.</p>
  </div>;
}

function LinksAdmin({run}:{run:Run}){
  const [links,setLinks]=useState<BusinessLinkInfo[]>([]);
  const [editing,setEditing]=useState('');
  const [title,setTitle]=useState(''),[text,setText]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  const load=()=>void run<{links:BusinessLinkInfo[]}>('business.links.list').then(value=>{if(value)setLinks(value.links||[]);}).catch(caught=>setError(failure(caught,'No se pudieron leer los enlaces.')));
  useEffect(()=>{load();},[]);
  function save(){
    setBusy(true);setError('');
    void run<BusinessLinkInfo>('business.links.save',{link:editing,title:title.trim(),text}).then(saved=>{
      if(saved){setEditing('');setTitle('');setText('');setStatus('Enlace guardado en Telegram.');load();}
    }).catch(caught=>setError(failure(caught,'Telegram no pudo guardar el enlace.'))).finally(()=>setBusy(false));
  }
  function remove(link:string){
    setBusy(true);
    void run<boolean>('business.links.delete',{link}).then(done=>{if(done){setStatus('Enlace eliminado en Telegram.');load();}}).catch(caught=>setError(failure(caught,'No se pudo eliminar el enlace.'))).finally(()=>setBusy(false));
  }
  function copy(link:string){void run<boolean>('clipboard.copy',{text:link}).then(done=>{if(done)setStatus('Enlace copiado al portapapeles.');});}
  return <div className="business-block">
    <h4>Enlaces de chat</h4>
    <Note error={error} status={status}/>
    {links.length>0&&<ul className="business-list">{links.map(item=><li key={item.link} className="business-row">
      <button type="button" className="business-row-main" onClick={()=>{setEditing(item.link);setTitle(item.title);setText(item.text);}}>
        <strong>{item.title||'Enlace sin título'}</strong>
        <small>{item.text||'Sin texto'} · {item.views} vista(s)</small>
        <small className="business-link-url">{item.link}</small>
      </button>
      <span className="business-row-actions">
        <button type="button" className="secondary" disabled={busy} aria-label={`Copiar ${item.title||'enlace'}`} onClick={()=>copy(item.link)}><Copy size={15}/></button>
        <button type="button" className="secondary" disabled={busy} aria-label={`Eliminar ${item.title||'enlace'}`} onClick={()=>remove(item.link)}><Trash2 size={15}/></button>
      </span>
    </li>)}</ul>}
    {!links.length&&<p className="settings-note">Aún no hay enlaces de chat en tu cuenta.</p>}
    <label className="field-label">{editing?'Editar enlace':'Título del enlace nuevo'} (máx. 64)<input maxLength={64} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label className="field-label">Texto que verá quien abra el enlace<input maxLength={4096} value={text} onChange={event=>setText(event.target.value)}/></label>
    <div className="settings-actions">
      <button className="primary" disabled={busy||!title.trim()} onClick={save}>{busy?<LoaderCircle className="spin" size={16}/>:<Plus size={16}/>}{editing?'Guardar cambios':'Crear enlace'}</button>
      {editing&&<button className="secondary" disabled={busy} onClick={()=>{setEditing('');setTitle('');setText('');}}><X size={16}/>Cancelar edición</button>}
    </div>
    <p className="settings-note">Un enlace de chat abre una conversación privada contigo con un texto de bienvenida; WRGram muestra las vistas que informa Telegram.</p>
  </div>;
}

function BotAdmin({run}:{run:Run}){
  const [bot,setBot]=useState<BusinessBotState>();
  const [query,setQuery]=useState(''),[found,setFound]=useState<Chat[]>([]);
  const [recipients,setRecipients]=useState<BusinessRecipientsInfo>({existing:true});
  const [rights,setRights]=useState<Record<string,boolean>>({});
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState('');
  function apply(value?:BusinessBotState){
    if(!value)return;
    setBot(value);
    if(value.configured&&value.recipients)setRecipients(value.recipients);
    if(value.configured&&value.rights)setRights(value.rights);
  }
  const load=()=>void run<BusinessBotState>('business.bot.get').then(value=>apply(value)).catch(caught=>setError(failure(caught,'No se pudo leer el bot conectado.')));
  useEffect(()=>{load();},[]);
  function search(){
    if(query.trim().length<3)return;
    setBusy(true);setError('');
    void run<Chat[]>('chats.search',{query:query.trim(),scope:'public'}).then(value=>{if(value)setFound(value.filter(chat=>chat.bot));}).catch(caught=>setError(failure(caught,'No se pudo buscar el bot.'))).finally(()=>setBusy(false));
  }
  function save(botUserId:string){
    setBusy(true);setError('');
    void run<BusinessBotState>('business.bot.set',{botUserId,recipients,rights}).then(value=>{if(value){apply(value);setStatus('Bot conectado en Telegram.');setFound([]);setQuery('');}}).catch(caught=>setError(failure(caught,'Telegram no pudo conectar el bot.'))).finally(()=>setBusy(false));
  }
  function remove(){
    if(!bot?.botUserId)return;
    setBusy(true);
    void run<boolean>('business.bot.delete',{botUserId:bot.botUserId}).then(done=>{if(done){setStatus('Bot desconectado en Telegram.');load();}}).catch(caught=>setError(failure(caught,'No se pudo desconectar el bot.'))).finally(()=>setBusy(false));
  }
  return <div className="business-block">
    <h4>Bot conectado</h4>
    <Note error={error} status={status}/>
    {bot?.configured&&<div className="business-bot">
      <p className="settings-note">{bot.name?`Conectado: ${bot.name}.`:`Conectado: bot ${bot.botUserId}.`}{bot.connectionDate?` Desde ${new Date(bot.connectionDate*1000).toLocaleDateString('es')}.`:''}{bot.deviceModel?` Último uso: ${bot.deviceModel}.`:''}</p>
      <RecipientChecks value={recipients} change={setRecipients}/>
      <div className="business-rights">{RIGHTS.map(([key,label])=><label key={key} className="folder-toggle"><input type="checkbox" checked={!!rights[key]} onChange={event=>setRights(current=>({...current,[key]:event.target.checked}))}/><span>{label}</span></label>)}</div>
      <div className="settings-actions"><button className="primary" disabled={busy} onClick={()=>save(bot.botUserId||'0')}>{busy?<LoaderCircle className="spin" size={16}/>:null}Guardar permisos</button><button className="secondary" disabled={busy} onClick={remove}>Desconectar bot</button></div>
      <p className="settings-note">El bot podrá actuar en los chats privados que marques. Pausarlo por conversación se hace desde el chat, en Telegram oficial.</p>
    </div>}
    {!bot?.configured&&<>
      <p className="settings-note">{bot?'No hay bot conectado a esta cuenta.':'Consultando el estado del bot conectado…'}</p>
      <label className="chat-search"><Search size={16}/><input aria-label="Buscar bot por usuario" placeholder="@usuario del bot" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter')search();}}/></label>
      <div className="settings-actions"><button className="secondary" disabled={busy||query.trim().length<3} onClick={search}>Buscar bot</button></div>
      {found.length>0&&<div className="settings-options">{found.map(chat=><button key={chat.id} className="settings-option" disabled={busy} onClick={()=>save(chat.id)}><span className="settings-option-icon"><Pencil size={16}/></span><span><strong>{chat.title}</strong><small>Conectar este bot con los permisos marcados</small></span></button>)}</div>}
    </>}
  </div>;
}

export function BusinessSettings({run,ready}:{run:Run;ready:boolean}){
  const [profile,setProfile]=useState<{business?:AccountBusiness}>();
  const [shortcuts,setShortcuts]=useState<QuickReplyShortcutInfo[]>([]);
  const alive=useRef(true);
  const reloadShortcuts=()=>{
    const pull=()=>void run<{shortcuts:QuickReplyShortcutInfo[]}>('business.quick.list').then(value=>{if(alive.current&&value)setShortcuts(value.shortcuts||[]);}).catch(()=>{});
    pull();
    window.setTimeout(()=>{if(alive.current)pull();},1500);
    window.setTimeout(()=>{if(alive.current)pull();},3500);
  };
  useEffect(()=>{
    alive.current=true;
    if(!ready)return;
    void run<{business?:AccountBusiness}>('account.profile').then(value=>{if(alive.current&&value)setProfile(value);}).catch(()=>{});
    reloadShortcuts();
    return()=>{alive.current=false;};
  },[ready]);
  if(!ready)return <p className="settings-note">Inicia sesión para administrar Telegram Business con tu cuenta real.</p>;
  return <div className="business-admin">
    <QuickReplyAdmin run={run} shortcuts={shortcuts} reload={reloadShortcuts}/>
    <GreetingForm run={run} shortcuts={shortcuts} prefill={profile?.business?.greeting}/>
    <AwayForm run={run} shortcuts={shortcuts} prefill={profile?.business?.away}/>
    <HoursForm run={run} prefill={profile?.business}/>
    <LocationForm run={run} prefill={profile?.business?.address}/>
    <StartPageForm run={run} prefill={profile?.business?.startPage}/>
    <LinksAdmin run={run}/>
    <BotAdmin run={run}/>
    <p className="settings-note">Todo lo que veas aquí se aplica en tu cuenta real de Telegram mediante TDLib: los cambios se ven también en Telegram oficial y al revés.</p>
  </div>;
}
