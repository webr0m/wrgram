import { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Ban, Coins, ExternalLink, Landmark, LoaderCircle, Megaphone, RefreshCw, RotateCcw, Star, TriangleAlert } from 'lucide-react';
import { request, snapshot } from './bridge';
import type { StarPaymentOptions, StarRevenue, StarSubscription, StarSubscriptions, StarTransaction, StarTransactions, State } from './contract';
import { mergeTransactions, money, revenueUsd, starAmountText, starCount, starDate, starPeriod, subscriptionActions, transactionAmount, type SubscriptionAction } from './starsModel';
import './stars.css';

type Tab='movements'|'subscriptions'|'topup'|'revenue';
const TABS:[Tab,string][]=[['movements','Movimientos'],['subscriptions','Suscripciones'],['topup','Recargar'],['revenue','Ingresos']];
const DIRECTIONS:[string,string][]=[['all','Todos'],['in','Entradas'],['out','Salidas']];
const ACTION_LABEL:Record<SubscriptionAction,string>={cancel:'Cancelar renovación',resume:'Reanudar renovación',reuse:'Volver a unirme',renew:'Renovar con Stars'};
const failure=(error:unknown,fallback:string)=>error instanceof Error?error.message:fallback;

function ErrorNote({text}:{text:string}){return text?<p className="settings-note settings-error" role="alert">{text}</p>:null;}
function Busy({busy,label}:{busy:boolean;label:string}){return <>{busy?<LoaderCircle className="spin" size={16}/>:null}{label}</>;}
function More({offset,busy,load}:{offset:string;busy:boolean;load():void}){return offset?<div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={load}><Busy busy={busy} label="Cargar más"/> <ArrowRight size={15}/></button></div>:null;}

function StarsMovements(){
  const [items,setItems]=useState<StarTransaction[]>([]),[offset,setOffset]=useState(''),[direction,setDirection]=useState('all');
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  async function load(reset:boolean,filter=direction){
    setBusy(true);setError('');
    try{
      const page=await request<StarTransactions>('stars.transactions',{direction:filter,offset:reset?'':offset,limit:50});
      setItems(current=>reset?page.transactions:mergeTransactions(current,page.transactions));
      setOffset(page.nextOffset);setLoaded(true);
    }catch(caught){setError(failure(caught,'No se pudo leer el historial de Stars.'));}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load(true);},[]);
  return <div className="stars-tab">
    <div className="segmented stars-filter" role="group" aria-label="Dirección de los movimientos">{DIRECTIONS.map(([key,label])=><button type="button" key={key} className={direction===key?'selected':''} disabled={busy} aria-pressed={direction===key} onClick={()=>{setDirection(key);void load(true,key);}}>{label}</button>)}</div>
    <ErrorNote text={error}/>
    {items.length>0&&<ol className="stars-list">{items.map((item,index)=><li className={`stars-row ${item.starCount<0?'is-out':'is-in'}`} key={item.id||`${item.date}:${index}`}>
      <span className="stars-row-icon">{item.starCount<0?<ArrowUpRight size={16}/>:<ArrowDownLeft size={16}/>}</span>
      <span className="stars-row-body"><strong>{item.label}</strong><small>{[item.title,item.period?`cada ${starPeriod(item.period)}`:'',item.refund?'Reembolso de una operación anterior':''].filter(Boolean).join(' · ')}</small><small>{starDate(item.date)}</small></span>
      <span className="stars-row-amount">{transactionAmount(item)}<Star size={12}/></span>
    </li>)}</ol>}
    {loaded&&!items.length&&!error&&<p className="settings-note">Telegram no registró movimientos con este filtro.</p>}
    {!loaded&&!error&&<p className="settings-note">{busy?'Consultando tu historial en Telegram…':'Sin movimientos cargados.'}</p>}
    <More offset={offset} busy={busy} load={()=>void load(false)}/>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load(true)}><RefreshCw size={16}/>Actualizar</button></div>
    <p className="settings-note">Importes con signo: Telegram resta Stars en las salidas y los suma en las entradas. WRGram no puede reembolsar operaciones; los reembolsos los emite el vendedor o Telegram.</p>
  </div>;
}

function StarsSubscriptions(){
  const [items,setItems]=useState<StarSubscription[]>([]),[required,setRequired]=useState(0),[offset,setOffset]=useState(''),[expiring,setExpiring]=useState(false);
  const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[acting,setActing]=useState('');
  async function load(reset:boolean,onlyExpiring=expiring){
    setBusy(true);setError('');
    try{
      const page=await request<StarSubscriptions>('stars.subscriptions',{offset:reset?'':offset,expiring:onlyExpiring});
      setItems(current=>reset?page.subscriptions:[...current,...page.subscriptions.filter(item=>!current.some(existing=>existing.id===item.id))]);
      setRequired(page.requiredStarCount);setOffset(page.nextOffset);setLoaded(true);
    }catch(caught){setError(failure(caught,'No se pudieron leer las suscripciones de Stars.'));}
    finally{setBusy(false);}
  }
  useEffect(()=>{void load(true);},[]);
  async function act(item:StarSubscription,action:SubscriptionAction){
    setActing(item.id);setError('');
    try{
      if(action==='renew'){if(item.inviteLink)await request<boolean>('link.open',{url:item.inviteLink});return;}
      const method=action==='cancel'?'stars.subscription.cancel':action==='resume'?'stars.subscription.resume':'stars.subscription.reuse';
      if(await request<boolean>(method,{id:item.id}))await load(true);
    }catch(caught){setError(failure(caught,'Telegram no completó el cambio.'));}
    finally{setActing('');}
  }
  const now=Math.floor(Date.now()/1000);
  return <div className="stars-tab">
    <label className="toggle-row stars-expiring"><span><strong>Solo las que vencen pronto</strong><small>Muestra únicamente las suscripciones sin Stars suficientes para renovarse.</small></span><input type="checkbox" checked={expiring} disabled={busy} onChange={event=>{setExpiring(event.target.checked);void load(true,event.target.checked);}}/><span className="switch" aria-hidden="true"/></label>
    <ErrorNote text={error}/>
    {required>0&&<p className="stars-warning" role="status"><TriangleAlert size={16}/>Telegram necesita {starCount(required)} Stars más para renovar las suscripciones que vencen pronto.</p>}
    {items.length>0&&<div className="stars-subscriptions">{items.map(item=>{
      const expired=item.expirationDate>0&&item.expirationDate<=now;
      const actions=subscriptionActions(item,now);
      return <article className="stars-subscription" key={item.id}>
        <header><strong>{item.title}</strong><span className={`stars-badge ${expired?'is-expired':item.canceled?'is-canceled':'is-active'}`}>{expired?'Vencida':item.canceled?'Renovación cancelada':'Activa'}</span></header>
        <small>{item.kind==='channel'?'Canal':item.kind==='bot'?'Bot':'Tipo no reconocido por esta versión'} · {starCount(item.starCount)} Stars cada {starPeriod(item.period)}</small>
        <small>{expired?'Venció el':'Renueva o vence el'} {starDate(item.expirationDate)}</small>
        {item.expiring&&!expired&&<small className="stars-expiring-note">Vence pronto y el saldo actual no alcanza para renovarla.</small>}
        {item.canceledByBot&&<small>El bot canceló esta suscripción; no se puede reanudar desde WRGram.</small>}
        {item.canceled&&!expired&&<small>Conservas el acceso hasta la fecha pagada. El periodo en curso no se reembolsa.</small>}
        {actions.length>0&&<div className="settings-actions">{actions.map(action=><button type="button" key={action} className={action==='cancel'?'secondary':'primary'} disabled={busy||acting!==''} onClick={()=>void act(item,action)}>{acting===item.id?<LoaderCircle className="spin" size={15}/>:action==='cancel'?<Ban size={15}/>:action==='resume'?<RotateCcw size={15}/>:<ArrowRight size={15}/>} {ACTION_LABEL[action]}</button>)}</div>}
        {expired&&item.kind==='bot'&&<p className="settings-note">Esta suscripción de bot se renueva desde el propio bot en Telegram.</p>}
      </article>;
    })}</div>}
    {loaded&&!items.length&&!error&&<p className="settings-note">{expiring?'Ninguna suscripción vence pronto sin saldo suficiente.':'Esta cuenta no tiene suscripciones pagadas con Stars.'}</p>}
    {!loaded&&!error&&<p className="settings-note">{busy?'Consultando tus suscripciones en Telegram…':'Sin suscripciones cargadas.'}</p>}
    <More offset={offset} busy={busy} load={()=>void load(false)}/>
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load(true)}><RefreshCw size={16}/>Actualizar</button></div>
    <p className="settings-note">Cancelar deja de renovar y conserva el acceso ya pagado. Reanudar vuelve a cobrar con tu saldo en cada renovación. «Volver a unirme» reutiliza una suscripción de canal activa para entrar otra vez al canal, sin cargo nuevo.</p>
  </div>;
}

function StarsTopUp(){
  const [value,setValue]=useState<StarPaymentOptions>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{setValue(await request<StarPaymentOptions>('stars.options'));}catch(caught){setError(failure(caught,'No se pudieron leer las opciones de recarga.'));}finally{setBusy(false);}}
  useEffect(()=>{void load();},[]);
  return <div className="stars-tab">
    <ErrorNote text={error}/>
    {value?.notice&&<p className="stars-warning" role="status"><TriangleAlert size={16}/>{value.notice}</p>}
    {value&&value.options.length>0&&<div className="stars-prices">{value.options.map((option,index)=><div className="stars-price" key={`${option.currency}:${option.amount}:${index}`}><strong>{starCount(option.starCount)}<Star size={13}/></strong><small>{money(option.amount,option.currency)}</small>{option.additional&&<small className="stars-badge is-active">Bonificación incluida</small>}</div>)}</div>}
    {value&&!value.options.length&&<p className="settings-note">Telegram no ofrece paquetes de recarga para esta cuenta en este momento.</p>}
    {!value&&!error&&<p className="settings-note">{busy?'Consultando los paquetes de Telegram…':'Sin paquetes cargados.'}</p>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar paquetes</button></div>
    <p className="settings-note">Lista informativa de los paquetes que Telegram publica para tu cuenta. WRGram no inicia cobros con dinero real: la compra se hace en Telegram oficial y el saldo llega aquí solo. Sí puedes usar ese saldo para facturas, suscripciones de canales, reacciones y regalos en WRGram.</p>
  </div>;
}

/** Sin chatId la cartera es la de la cuenta; con chatId es la del canal, el otro titular de Stars que admite TDLib. */
export function StarsRevenue({chatId}:{chatId?:string}){
  const owner=chatId?{id:chatId}:{};
  const desktop=snapshot().platform==='desktop';
  const [value,setValue]=useState<StarRevenue>(),[amount,setAmount]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState('');
  async function load(){setBusy(true);setError('');try{const result=await request<StarRevenue>('stars.revenue',owner);setValue(result);setAmount(current=>current||String(result.available?.starCount||''));}catch(caught){setError(failure(caught,'No se pudieron leer los ingresos de Stars.'));}finally{setBusy(false);}}
  useEffect(()=>{void load();},[]);
  const available=value?.available?.starCount||0;
  const totalUsd=value?revenueUsd(value.total,value.usdRate):'';
  const parsed=Number(amount);
  const valid=Number.isInteger(parsed)&&parsed>=1&&parsed<=available;
  async function withdraw(){
    if(!valid||working)return;
    setWorking(true);setError('');
    try{if(await request<boolean>('stars.withdraw',desktop?{...owner,amount:parsed,password}:{...owner,amount:parsed})){setAmount('');setPassword('');await load();}}
    catch(caught){setError(failure(caught,'Telegram no aceptó la retirada.'));}
    finally{setWorking(false);}
  }
  async function ads(){setWorking(true);setError('');try{await request<boolean>('stars.ads.url',owner);}catch(caught){setError(failure(caught,'No se pudo abrir la cuenta de anuncios.'));}finally{setWorking(false);}}
  return <div className="stars-tab">
    <ErrorNote text={error}/>
    {value&&<div className="settings-data-grid stars-revenue-grid">
      <div><strong>Total ganado</strong><small>{starAmountText(value.total)} Stars{totalUsd?` · ≈ ${totalUsd}`:''}</small></div>
      <div><strong>Sin retirar</strong><small>{starAmountText(value.current)} Stars</small></div>
      <div><strong>Disponible para retirar</strong><small>{starAmountText(value.available)} Stars</small></div>
      <div><strong>Próxima retirada</strong><small>{!value.withdrawalEnabled?'No disponible para esta cuenta':value.nextWithdrawalIn>0?`En ${starPeriod(value.nextWithdrawalIn)}`:'Disponible ahora'}</small></div>
    </div>}
    {!value&&!error&&<p className="settings-note">{busy?'Consultando tus ingresos en Telegram…':'Sin datos de ingresos.'}</p>}
    {value&&<div className="stars-withdraw">
      <label className="field-label">Stars a retirar<input type="number" inputMode="numeric" min={1} max={available} step={1} value={amount} disabled={working||available<1} onChange={event=>setAmount(event.target.value)}/></label>
      {desktop&&<label className="field-label">Contraseña de dos pasos<input type="password" autoComplete="off" value={password} disabled={working||!value.withdrawalEnabled} onChange={event=>setPassword(event.target.value)}/></label>}
      <div className="settings-actions"><button type="button" className="primary" disabled={!valid||working||!value.withdrawalEnabled||value.nextWithdrawalIn>0||(desktop&&!password)} onClick={()=>void withdraw()}>{working?<LoaderCircle className="spin" size={16}/>:<Landmark size={16}/>}Retirar a Fragment</button><button type="button" className="secondary" disabled={working} onClick={()=>void ads()}><Megaphone size={16}/>Cuenta de anuncios</button></div>
      {amount!==''&&!valid&&available>0&&<p className="settings-note settings-error" role="alert">El importe debe ser un número entero entre 1 y {starCount(available)} Stars.</p>}
    </div>}
    <div className="settings-actions"><button type="button" className="secondary" disabled={busy||working} onClick={()=>void load()}><RefreshCw size={16}/>Actualizar ingresos</button></div>
    <p className="settings-note">{desktop?'La retirada exige la contraseña de verificación en dos pasos de tu cuenta de Telegram: escríbela aquí, WRGram la entrega a Telegram solo para esta operación y no la guarda.':'La retirada abre Fragment con tu cuenta y exige la contraseña de verificación en dos pasos en un diálogo nativo: WRGram la entrega a TDLib y no la guarda.'} El tipo de cambio a dólares es el que publica Telegram y solo se muestra como referencia.</p>
    <p className="settings-note"><ExternalLink size={13}/> Fragment y la cuenta de anuncios se abren fuera de WRGram, tras la confirmación nativa de enlace.</p>
  </div>;
}

export function StarsWallet({state}:{state:State}){
  const [tab,setTab]=useState<Tab>('movements');
  if(!state.ready)return <p className="settings-note">Inicia sesión para consultar tu cartera real de Telegram Stars.</p>;
  const wallet=state.wallet;
  return <div className="stars-wallet">
    <header className="stars-balance"><span className="stars-balance-icon"><Star/></span><div><strong>{starCount(wallet?.stars||0)} Stars</strong><small>Saldo de tu cuenta de Telegram{wallet?.premium?' · Telegram Premium activo':''}</small></div><Coins size={20}/></header>
    <nav className="settings-subnav" aria-label="Cartera de Stars">{TABS.map(([id,label])=><button type="button" key={id} aria-pressed={tab===id} onClick={()=>setTab(id)}>{label}</button>)}</nav>
    {tab==='movements'?<StarsMovements/>:tab==='subscriptions'?<StarsSubscriptions/>:tab==='topup'?<StarsTopUp/>:<StarsRevenue/>}
  </div>;
}
