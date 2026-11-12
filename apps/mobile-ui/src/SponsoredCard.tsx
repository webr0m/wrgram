import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Sponsored } from './contract';
import { native, request, snapshot, subscribe } from './bridge';
import { MediaView } from './MediaView';

export function SponsoredCard({ad}:{ad:Sponsored}){
  const state=useSyncExternalStore(subscribe,snapshot);const ref=useRef<HTMLElement>(null);const [error,setError]=useState('');const viewed=useRef(false);
  const ready=!ad.media||ad.media.ready||state.mediaReady?.includes(ad.media.id);const loading=!!ad.media&&!!state.mediaLoading?.includes(ad.media.id);const failed=!!ad.media&&!!state.mediaFailed?.includes(ad.media.id);
  useEffect(()=>{if(native&&ad.media&&!ready&&!loading&&!failed)void request('media.load',{id:ad.media.id}).catch(reason=>setError(reason instanceof Error?reason.message:'No se pudo cargar la imagen patrocinada.'));},[ad.id,ad.chatId,ready,loading,failed]);
  useEffect(()=>{if(!ready||!ref.current||!native)return;let fullyVisible=false;const mark=()=>{if(!fullyVisible||viewed.current||document.visibilityState!=='visible')return;viewed.current=true;void request('sponsored.view',{id:ad.id,chat:ad.chatId}).catch(()=>{viewed.current=false;});};const observer=new IntersectionObserver(entries=>{fullyVisible=entries.some(entry=>entry.intersectionRatio>=1);mark();},{threshold:1});observer.observe(ref.current);document.addEventListener('visibilitychange',mark);return()=>{observer.disconnect();document.removeEventListener('visibilitychange',mark);};},[ad.id,ad.chatId,ready]);
  if(!ready)return <aside className="sponsored-card"><small>{ad.label} · Telegram</small><p>{error||(failed?'La imagen patrocinada no está disponible.':'Descargando contenido patrocinado…')}</p>{failed&&<button className="secondary" onClick={()=>{setError('');void request('media.load',{id:ad.media!.id}).catch(reason=>setError(reason instanceof Error?reason.message:'No se pudo cargar el contenido patrocinado.'));}}>Reintentar descarga</button>}</aside>;
  return <aside className="sponsored-card" ref={ref} aria-label={`${ad.label} de Telegram`}><small>{ad.label} · Telegram</small><h3>{ad.title}</h3>{ad.media&&<MediaView media={ad.media}/>}<p>{ad.text}</p>{ad.sponsor&&<p>{ad.sponsor}</p>}{ad.info&&<small>{ad.info}</small>}<button className="secondary" onClick={()=>void request('sponsored.open',{id:ad.id,chat:ad.chatId}).catch(reason=>setError(reason.message))}>{ad.button||'Ver anuncio'}</button>{error&&<p role="alert">{error}</p>}</aside>;
}
