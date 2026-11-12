import { useLanguage } from './language';
import { useEffect, useState } from 'react';
import { Archive, AtSign, Bookmark, Cake, Check, ChevronRight, Clock, Copy, FileText, Film, Globe, Image, Link2, LogOut, MapPin, Pencil, Phone, Plus, Puzzle, Settings, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { MediaView } from './MediaView';
import { AccountAvatarStatus } from './PremiumMark';
import { FormattedText } from './formatting';
import type { AccountBirthday, AccountBusiness, AccountBusinessHours, AccountProfile, PrivacySetting, State } from './contract';
import './account-menu.css';

type Run=<T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

export function ProfileCopy({run,value,label}:{run:Run;value:string;label:string}){
  const [done,setDone]=useState(false);
  if(!value)return null;
  const finish=()=>{setDone(true);setTimeout(()=>setDone(false),1500);};
  const copy=()=>{
    const fallback=()=>{void run<boolean>('clipboard.copy',{text:value}).then(copied=>{if(copied)finish();});};
    if(navigator.clipboard?.writeText)void navigator.clipboard.writeText(value).then(finish,fallback);
    else fallback();
  };
  return <button type="button" className="account-profile-copy" aria-label={`Copiar ${label}`} title={done?'Copiado':`Copiar ${label}`} onClick={copy}>{done?<Check size={14}/>:<Copy size={14}/>}</button>;
}

const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DAYS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function phoneLabel(phone:string){return phone.startsWith('+')?phone:`+${phone}`;}
function birthdayLabel(birthday:AccountBirthday){return `${birthday.day} de ${MONTHS[birthday.month-1]||birthday.month}${birthday.year>0?` de ${birthday.year}`:''}`;}
function clock(minute:number){const value=((minute%1440)+1440)%1440;return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;}
function duration(seconds:number){if(seconds>=86400){const days=Math.max(1,Math.round(seconds/86400));return days===1?'1 día':`${days} días`;}if(seconds>=3600){const hours=Math.max(1,Math.round(seconds/3600));return hours===1?'1 hora':`${hours} h`;}return `${Math.max(1,Math.round(seconds/60))} min`;}
function businessStatus(business:AccountBusiness){if(business.nextCloseIn&&business.nextCloseIn>0)return`Abierto · cierra en ${duration(business.nextCloseIn)}`;if(business.nextOpenIn&&business.nextOpenIn>0)return`Cerrado · abre en ${duration(business.nextOpenIn)}`;return'Horario publicado';}
function hourRows(hours?:AccountBusinessHours[]){if(!hours?.length)return[];return hours.map(interval=>({day:DAYS[Math.min(6,Math.floor(interval.startMinute/1440))]||'',text:`${clock(interval.startMinute)}–${clock(interval.endMinute)}`}));}

function ShareSelect({value,busy,change}:{value:string;busy:boolean;change(value:string):void}){
  return <select className="account-privacy-select" aria-label="Visibilidad" value={value} disabled={busy} onChange={event=>{if(event.target.value&&event.target.value!=='custom')change(event.target.value);}}>
    {value==='custom'&&<option value="custom" disabled>Personalizado</option>}
    <option value="everyone">Todos</option>
    <option value="contacts">Mis contactos</option>
    <option value="nobody">Nadie</option>
  </select>;
}

function ProfileSummary({run,state,openProfile,openUrl,openUser}:{run:Run;state:State;openProfile():void;openUrl?(url:string):void;openUser?(userId:string):void}){
  const [profile,setProfile]=useState<AccountProfile>();
  const [privacy,setPrivacy]=useState<PrivacySetting[]>([]);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    let cancelled=false;
    void Promise.allSettled([run<AccountProfile>('account.profile'),run<PrivacySetting[]>('privacy.get')]).then(([account,rules])=>{
      if(cancelled)return;
      if(account.status==='fulfilled'&&account.value)setProfile(account.value);
      if(rules.status==='fulfilled'&&rules.value)setPrivacy(rules.value);
      setLoaded(true);
    });
    return()=>{cancelled=true;};
  },[]);
  function share(key:string,value:string){
    const item=privacy.find(entry=>entry.key===key);if(!item)return;
    const allow=value==='everyone'?[]:item.allowUsers||[],restrict=value==='nobody'?[]:item.restrictUsers||[];
    setBusy(true);
    void run<boolean>('privacy.set',{key,value,allowUsers:allow,restrictUsers:restrict}).then(done=>{if(done)setPrivacy(list=>list.map(entry=>entry.key===key?{...entry,value,allowUsers:allow,restrictUsers:restrict}:entry));}).finally(()=>setBusy(false));
  }
  function control(key:string){
    const item=privacy.find(entry=>entry.key===key);
    if(!item)return <span className="account-privacy-fixed">…</span>;
    return <ShareSelect value={item.value} busy={busy} change={next=>share(key,next)}/>;
  }
  if(!state.ready)return <p className="settings-note account-profile-note">Inicia sesión para ver tu móvil, biografía y cumpleaños de Telegram.</p>;
  if(!loaded)return <p className="settings-note account-profile-note">Consultando los datos de tu perfil en Telegram…</p>;
  if(!profile)return <p className="settings-note account-profile-note">No se pudieron leer los datos del perfil. Vuelve a abrir el menú.</p>;
  const phone=profile.phoneNumber||'',username=profile.username||profile.editableUsername||'',birthday=profile.birthday,business=profile.business;
  const hours=hourRows(business?.hours);
  return <section className="account-profile">
    <div className="account-profile-head"><span>DATOS DEL PERFIL</span><button type="button" className="text-button" onClick={openProfile}><Pencil size={13}/>Editar</button></div>
    <div className="account-profile-row">
      <span className="account-profile-icon"><Phone size={15}/></span>
      <span className="account-profile-value"><small>Móvil</small><strong>{phone?phoneLabel(phone):'No disponible'}</strong></span>
      <span className="account-profile-actions"><ProfileCopy run={run} value={phone} label="el móvil"/>{control('phone')}</span>
    </div>
    <div className="account-profile-row">
      <span className="account-profile-icon"><FileText size={15}/></span>
      <span className="account-profile-value"><small>Biografía</small>{profile.bio?<strong className="account-profile-bio"><FormattedText text={profile.bio} entities={profile.bioEntities} openUrl={openUrl} openUser={openUser}/></strong>:<strong className="is-empty">Sin biografía</strong>}</span>
      <span className="account-profile-actions"><ProfileCopy run={run} value={profile.bio} label="la biografía"/>{control('bio')}</span>
    </div>
    <div className="account-profile-row">
      <span className="account-profile-icon"><AtSign size={15}/></span>
      <span className="account-profile-value"><small>Nombre de usuario</small><strong className={username?'':'is-empty'}>{username?<a className="text-link text-mention" href={`https://t.me/${username}`} onClick={event=>{event.preventDefault();openUrl?.(`https://t.me/${username}`);}}>@{username}</a>:'Sin nombre de usuario'}</strong></span>
      <span className="account-profile-actions"><ProfileCopy run={run} value={username?`@${username}`:''} label="el nombre de usuario"/><span className="account-privacy-fixed"><Globe size={12}/>Público</span></span>
    </div>
    <div className="account-profile-row">
      <span className="account-profile-icon"><Cake size={15}/></span>
      <span className="account-profile-value"><small>Cumpleaños</small><strong className={birthday?'':'is-empty'}>{birthday?birthdayLabel(birthday):'Sin fecha configurada'}</strong></span>
      <span className="account-profile-actions"><ProfileCopy run={run} value={birthday?birthdayLabel(birthday):''} label="el cumpleaños"/>{control('birthdate')}</span>
    </div>
    {business&&<div className="account-profile-business">
      <div className="account-profile-row">
        <span className="account-profile-icon"><Clock size={15}/></span>
        <span className="account-profile-value"><small>Telegram Business</small><strong>{businessStatus(business)}</strong></span>
        <span className="account-privacy-fixed"><Globe size={12}/>Público</span>
      </div>
      {business.address&&<div className="account-profile-row">
        <span className="account-profile-icon"><MapPin size={15}/></span>
        <span className="account-profile-value"><small>Dirección</small><strong>{business.address}</strong></span>
        <span className="account-profile-actions"><ProfileCopy run={run} value={business.address} label="la dirección"/></span>
      </div>}
      {hours.length>0&&<details className="account-profile-hours">
        <summary>Horario de apertura{business.timeZoneId?` · ${business.timeZoneId}`:''}</summary>
        {hours.map((item,index)=><div className="account-hours-row" key={`${item.day}-${item.text}-${index}`}><span>{item.day}</span><strong>{item.text}</strong></div>)}
      </details>}
    </div>}
  </section>;
}

function Row({icon,label,detail,onClick,danger=false}:{icon:React.ReactNode;label:string;detail?:string;onClick():void;danger?:boolean}){
  const {t}=useLanguage();
  return <button className={`account-menu-row ${danger?'is-danger':''}`} onClick={onClick}><span className="account-menu-icon">{icon}</span><span><strong>{t(label)}</strong>{detail&&<small>{t(detail)}</small>}</span><ChevronRight size={16}/></button>;
}

export function UserMenu({state,run,desktop=false,openDataFolder,openProfile,openEmoji,openContacts,openStory,openArchive,openSessions,openSettings,openPlugins,openAssistant,openSaved,addAccount,openLink,openUrl,openUser,logout}:{
  state:State;run:Run;desktop?:boolean;openDataFolder?():void;openProfile():void;openEmoji():void;openContacts():void;openStory(kind:'photo'|'video'):void;openArchive():void;openSessions():void;openSettings():void;openPlugins():void;openAssistant():void;openSaved():void;addAccount():void;openLink():void;openUrl?(url:string):void;openUser?(userId:string):void;logout():void;
}){
  if(desktop) return <div className="account-menu">
    <button className="user-menu-profile" onClick={openSettings}>
      <AccountAvatarStatus><span className="settings-header-avatar">{state.profilePhoto?<MediaView media={state.profilePhoto} auto eager passive/>:(state.name||'W').slice(0,1).toUpperCase()}</span></AccountAvatarStatus>
      <span><strong>{state.name||'Cuenta de Telegram'}</strong><small>{state.ready?'WRGram Desktop · sesión local cifrada':'Todavía no has iniciado sesión'}</small></span>
      <ChevronRight size={17}/>
    </button>

    <section className="account-menu-section">
      <div className="account-menu-heading"><span>ESCRITORIO</span></div>
      <Row icon={<Bookmark/>} label="Mensajes guardados" detail="Tus notas y mensajes privados" onClick={openSaved}/>
      <Row icon={<Settings/>} label="Ajustes y apariencia" detail="Tema, tipografía y fondo del chat" onClick={openSettings}/>
      {openDataFolder&&<Row icon={<Link2/>} label="Abrir carpeta de datos" detail="Sesión, ajustes y multimedia local" onClick={openDataFolder}/>}
    </section>

    <div className="account-menu-footer">
      <button className="account-menu-row is-danger" onClick={logout}><span className="account-menu-icon"><LogOut size={18}/></span><span><strong>Cerrar sesión de Telegram</strong><small>Solo esta cuenta, en este equipo</small></span></button>
    </div>
  </div>;
  return <div className="account-menu">
    <button className="user-menu-profile" onClick={openProfile}>
      <AccountAvatarStatus><span className="settings-header-avatar">{state.profilePhoto?<MediaView media={state.profilePhoto} auto eager passive/>:(state.name||'W').slice(0,1).toUpperCase()}</span></AccountAvatarStatus>
      <span><strong>{state.name||'Mi perfil'}</strong><small>{state.ready?'Cuenta conectada · sesión cifrada':'Todavía no has iniciado sesión'}</small></span>
      <ChevronRight size={17}/>
    </button>

    <ProfileSummary run={run} state={state} openProfile={openProfile} openUrl={openUrl} openUser={openUser}/>

    <section className="account-menu-section">
      <div className="account-menu-heading"><span>CUENTA</span></div>
      <Row icon={<Bookmark/>} label="Mensajes guardados" detail="Tus notas y mensajes privados" onClick={openSaved}/>
      {state.ready&&<Row icon={<Sparkles/>} label={state.wallet?.premium?'Cambiar estado emoji':'Packs de emojis'} onClick={openEmoji}/>}
      <Row icon={<Users/>} label="Contactos y grupos" detail="Contactos de Telegram y agenda opcional" onClick={openContacts}/>
      <Row icon={<Image/>} label="Crear historia de foto" detail="Revisa la audiencia antes de publicar" onClick={()=>openStory('photo')}/>
      <Row icon={<Film/>} label="Crear historia de vídeo" detail="MP4 de 1 a 60 segundos, hasta 20 MB" onClick={()=>openStory('video')}/>
      <Row icon={<Archive/>} label="Álbumes de historias" detail="Crea, ordena y administra historias guardadas" onClick={openArchive}/>
      <Row icon={<ShieldCheck/>} label="Sesiones activas" detail="Dispositivos conectados a tu cuenta" onClick={openSessions}/>
      <Row icon={<Plus/>} label="Añadir cuenta" detail="Hasta tres cuentas en este dispositivo" onClick={addAccount}/>
    </section>

    <section className="account-menu-section">
      <div className="account-menu-heading"><span>APLICACIONES</span></div>
      <Row icon={<Puzzle/>} label="Complementos" detail="Herramientas locales y permisos" onClick={openPlugins}/>
      <Row icon={<Sparkles/>} label="WR IA" detail="Asistente independiente de Telegram" onClick={openAssistant}/>
      <Row icon={<Settings/>} label="Ajustes y privacidad" detail="Todos los ajustes de WRGram" onClick={openSettings}/>
      <Row icon={<Link2/>} label="Abrir enlace de Telegram" detail="t.me, telegram.me o tg:// dentro de WRGram" onClick={openLink}/>
    </section>

    <div className="account-menu-footer">
      <button className="account-menu-row is-danger" onClick={logout}><span className="account-menu-icon"><LogOut size={18}/></span><span><strong>Cerrar sesión de Telegram</strong><small>Solo esta cuenta, en este dispositivo</small></span></button>
    </div>
  </div>;
}
