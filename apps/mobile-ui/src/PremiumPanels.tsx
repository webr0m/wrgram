import { useEffect, useState } from 'react';
import { BadgeCheck, Check, Crown, Gift, LoaderCircle, RefreshCw, Sparkles, TriangleAlert } from 'lucide-react';
import { request } from './bridge';
import { EmojiStatusSettings } from './EmojiStatusSettings';
import { MediaView } from './MediaView';
import type { PremiumFeatures, PremiumGiftCode, PremiumGiftOptions, PremiumLimit, PremiumStatus, PremiumStickers, State } from './contract';
import { money, starCount } from './starsModel';
import './premium.css';

type Tab='status'|'features'|'emoji'|'gift'|'plans';
const TABS:[Tab,string][]=[['status','Estado'],['features','Ventajas'],['emoji','Emojis'],['gift','Código de regalo'],['plans','Planes']];
const failure=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;
const date=(seconds:number)=>seconds>0?new Date(seconds*1000).toLocaleString('es',{dateStyle:'medium'}):'Sin fecha';
const months=(count:number)=>`${count} ${count===1?'mes':'meses'}`;
const duration=(code:PremiumGiftCode)=>code.monthCount>0?months(code.monthCount):`${code.dayCount} ${code.dayCount===1?'día':'días'}`;

function ErrorNote({text}:{text:string}){return text?<p className="settings-note settings-error" role="alert">{text}</p>:null;}
function Notice({text}:{text?:string}){return text?<p className="premium-notice" role="status"><TriangleAlert size={16}/>{text}</p>:null;}

function useStatus(){
  const [value,setValue]=useState<PremiumStatus>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{setValue(await request<PremiumStatus>('premium.state'));}catch(caught){setError(failure(caught,'No se pudo leer el estado Premium.'));}finally{setBusy(false);}}
  useEffect(()=>{void load();},[]);
  return {value,busy,error,load};
}

function PremiumStatusTab(){
  const {value,busy,error,load}=useStatus();
  const current=value?.paymentOptions.find(plan=>plan.current);
  return <div className="premium-tab">
    <ErrorNote text={error}/>
    {value&&<div className="premium-state">
      <span className={`premium-badge ${value.premium?'is-active':''}`}>{value.premium?<BadgeCheck size={14}/>:<Crown size={14}/>} {value.premium?'Premium activo':'Sin Premium'}</span>
      {value.state&&<p>{value.state}</p>}
      {current&&<small>Tu plan: {months(current.monthCount)} · {money(current.amount,current.currency)}{current.upgrade?' · hay una mejora disponible':''}</small>}
    </div>}
    {!value&&!error&&<p className="settings-note">{busy?'Consultando Telegram…':'Sin datos de Telegram Premium.'}</p>}
    <Notice text={value?.notice}/>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar estado</button></div>
    <p className="settings-note">WRGram no vende ni renueva Telegram Premium: la compra y los cobros se hacen en Telegram oficial. Aquí consultas tu estado real, las ventajas y los límites de tu cuenta, y canjeas un código de regalo o de sorteo.</p>
  </div>;
}

function PremiumFeaturesTab(){
  const [value,setValue]=useState<PremiumFeatures>(),[stickers,setStickers]=useState<PremiumStickers>();
  const [live,setLive]=useState<Record<string,PremiumLimit>>({}),[busy,setBusy]=useState(false),[checking,setChecking]=useState(''),[error,setError]=useState('');
  async function load(){
    setBusy(true);setError('');setLive({});
    try{
      setValue(await request<PremiumFeatures>('premium.features'));
      setStickers(await request<PremiumStickers>('premium.stickers').catch(()=>undefined));
    }catch(caught){setError(failure(caught,'No se pudieron leer las ventajas de Premium.'));}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load();},[]);
  async function refreshLimit(key:string){
    setChecking(key);setError('');
    try{const result=await request<PremiumLimit>('premium.limit',{key});setLive(current=>({...current,[key]:result}));}
    catch(caught){setError(failure(caught,'No se pudo consultar ese límite.'));}
    finally{setChecking('');}
  }
  return <div className="premium-tab">
    <ErrorNote text={error}/>
    {value&&value.features.length>0&&<ul className="premium-features">{value.features.map(feature=><li key={feature.key}><Check size={15}/><span>{feature.label}</span></li>)}</ul>}
    {value&&value.limits.length>0&&<>
      <p className="settings-note premium-subtitle">Límites de tu cuenta · toca para volver a consultarlos en Telegram</p>
      <ul className="premium-limits">{value.limits.map(limit=>{const item=live[limit.key]||limit;return <li className="premium-limit" key={limit.key}>
        <span><strong>{limit.label}</strong><small>{item.defaultValue.toLocaleString('es')} sin Premium · <em>{item.premiumValue.toLocaleString('es')}</em> con Premium</small></span>
        <button type="button" className="secondary" disabled={busy||checking!==''} onClick={()=>void refreshLimit(limit.key)} aria-label={`Consultar ${limit.label}`}>{checking===limit.key?<LoaderCircle className="spin" size={14}/>:<RefreshCw size={14}/>}</button>
      </li>;})}</ul>
    </>}
    {value&&!value.features.length&&!value.limits.length&&<p className="settings-note">Telegram no devolvió ventajas ni límites para esta cuenta.</p>}
    {!value&&!error&&<p className="settings-note">{busy?'Consultando las ventajas en Telegram…':'Sin ventajas cargadas.'}</p>}
    {stickers&&stickers.stickers.length>0&&<>
      <p className="settings-note premium-subtitle">Stickers exclusivos de Premium</p>
      <div className="sticker-grid premium-stickers">{stickers.stickers.map(sticker=><MediaView key={sticker.id} media={sticker} auto={!sticker.thumbnail} passive/>)}</div>
    </>}
    {value&&!busy&&!stickers?.stickers.length&&<p className="settings-note">Telegram no devolvió la vista previa de los stickers de Premium.</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy||checking!==''} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar ventajas</button></div>
    <p className="settings-note">Las ventajas y los límites son los que Telegram informa para esta cuenta, no una lista genérica. Los que esta versión no reconoce se muestran como no reconocidos en lugar de inventar una descripción.</p>
  </div>;
}

function PremiumGiftTab(){
  const [code,setCode]=useState(''),[info,setInfo]=useState<PremiumGiftCode>(),[options,setOptions]=useState<PremiumGiftOptions>();
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[done,setDone]=useState('');
  async function loadOptions(){setLoading(true);setError('');try{setOptions(await request<PremiumGiftOptions>('premium.gift.options'));}catch(caught){setError(failure(caught,'No se pudieron leer las opciones de regalo.'));}finally{setLoading(false);}}
  useEffect(()=>{void loadOptions();},[]);
  async function check(){
    const raw=code.trim();if(!raw||busy||working)return;
    setBusy(true);setError('');setDone('');setInfo(undefined);
    try{setInfo(await request<PremiumGiftCode>('premium.gift.check',{code:raw}));}
    catch(caught){setError(failure(caught,'Telegram no reconoció ese código.'));}
    finally{setBusy(false);}
  }
  async function apply(){
    if(!info||info.used||working)return;
    setWorking(true);setError('');
    try{
      if(await request<boolean>('premium.gift.apply',{code:code.trim()})){setDone('Código canjeado: Telegram Premium queda activo en esta cuenta.');setInfo(undefined);setCode('');}
    }catch(caught){setError(failure(caught,'Telegram no canjeó el código.'));}
    finally{setWorking(false);}
  }
  return <div className="premium-tab">
    <ErrorNote text={error}/>
    {done&&<p className="premium-done" role="status"><BadgeCheck size={16}/>{done}</p>}
    <label className="field-label premium-code-input">Código o enlace de regalo<input value={code} maxLength={2048} placeholder="https://t.me/premium/…" disabled={busy||working} onChange={event=>{setCode(event.target.value);setInfo(undefined);setDone('');}} onKeyDown={event=>{if(event.key==='Enter')void check();}}/></label>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy||working||!code.trim()} onClick={()=>void check()}>{busy?<LoaderCircle className="spin" size={16}/>:<Gift size={16}/>}Comprobar código</button></div>
    {info&&<article className="premium-code">
      <header><strong>{duration(info)} de Telegram Premium</strong><span className={`premium-badge ${info.used?'':'is-active'}`}>{info.used?'Ya canjeado':'Disponible'}</span></header>
      <small>{info.creator?`Regalo de ${info.creator}`:'Telegram no identificó al creador'}{info.fromGiveaway?' · Sorteo de un canal':''}</small>
      <small>Creado el {date(info.creationDate)}</small>
      {info.used&&<small>Canjeado el {date(info.useDate)}{info.userId!=='0'?` por la cuenta ${info.userId}`:''}.</small>}
      {!info.used&&<div className="settings-actions"><button type="button" className="primary" disabled={working||busy} onClick={()=>void apply()}>{working?<LoaderCircle className="spin" size={16}/>:<Sparkles size={16}/>}Canjear en mi cuenta</button></div>}
    </article>}
    <p className="settings-note">El canje es de un solo uso y vincula el Premium a esta cuenta. WRGram pide la confirmación nativa antes de aplicarlo. Los códigos de sorteo se canjean igual que los regalos personales.</p>
    <Notice text={options?.notice}/>
    {options&&options.options.length>0&&<>
      <p className="settings-note premium-subtitle">Regalar Premium a otra cuenta · paquetes que publica Telegram</p>
      <div className="premium-plans">{options.options.map((option,index)=><div className="premium-plan" key={`${option.currency}:${option.amount}:${index}`}>
        <strong>{months(option.monthCount)}</strong>
        <small>{money(option.amount,option.currency)}</small>
        <small>{starCount(option.starCount)} Stars</small>
        {option.discountPercentage>0&&<span className="premium-badge is-active">−{option.discountPercentage}%</span>}
      </div>)}</div>
    </>}
    {options&&!options.options.length&&<p className="settings-note">Telegram no ofrece paquetes de regalo de Premium para esta cuenta ahora mismo.</p>}
    {!options&&!error&&<p className="settings-note">{loading?'Consultando los paquetes de regalo…':'Sin paquetes cargados.'}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={loading||busy||working} onClick={()=>void loadOptions()}><RefreshCw size={16}/>Actualizar paquetes</button></div>
    <p className="settings-note">WRGram no inicia el cobro de un regalo: TDLib reserva esa compra a Telegram oficial y el regalo con Stars a los bots. Los paquetes se muestran como referencia; el regalo se compra en Telegram y el código resultante se canjea aquí.</p>
  </div>;
}

function PremiumPlansTab(){
  const {value,busy,error,load}=useStatus();
  return <div className="premium-tab">
    <ErrorNote text={error}/>
    <Notice text={value?.notice}/>
    {value&&value.paymentOptions.length>0&&<div className="premium-plans">{value.paymentOptions.map((plan,index)=><div className={`premium-plan ${plan.current?'is-current':''}`} key={`${plan.currency}:${plan.amount}:${index}`}>
      <strong>{months(plan.monthCount)}</strong>
      <small>{money(plan.amount,plan.currency)}</small>
      {plan.discountPercentage>0&&<small>−{plan.discountPercentage}% de descuento</small>}
      {plan.current&&<span className="premium-badge is-active"><BadgeCheck size={12}/>Tu plan actual</span>}
      {plan.upgrade&&!plan.current&&<span className="premium-badge">Mejora disponible</span>}
    </div>)}</div>}
    {value&&!value.paymentOptions.length&&<p className="settings-note">Telegram no publicó planes de suscripción para esta cuenta.</p>}
    {!value&&!error&&<p className="settings-note">{busy?'Consultando los planes de Telegram…':'Sin planes cargados.'}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar planes</button></div>
    <p className="settings-note">Precios que Telegram publica para tu región, convertidos desde la unidad mínima que informa TDLib. WRGram no puede cobrarlos: la suscripción se contrata y se gestiona en Telegram oficial, y el estado resultante aparece en la pestaña Estado.</p>
  </div>;
}

export function PremiumPanel({state}:{state:State}){
  const [tab,setTab]=useState<Tab>('status');
  if(!state.ready)return <p className="settings-note">Inicia sesión para consultar tu Telegram Premium real.</p>;
  const premium=state.wallet?.premium;
  return <div className="premium-panel">
    <header className="premium-head"><span className="premium-head-icon"><Crown/></span><div><strong>Telegram Premium</strong><small>{premium===undefined?'Consultando el estado de tu cuenta…':premium?'Suscripción activa en esta cuenta':'Esta cuenta no tiene Premium activo'}</small></div>{premium?<BadgeCheck size={20}/>:null}</header>
    <nav className="settings-subnav" aria-label="Telegram Premium">{TABS.map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='status'?<PremiumStatusTab/>:tab==='features'?<PremiumFeaturesTab/>:tab==='emoji'?<EmojiStatusSettings initial="featured"/>:tab==='gift'?<PremiumGiftTab/>:<PremiumPlansTab/>}
  </div>;
}