import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, ChevronDown, Image, RefreshCw } from 'lucide-react';
import { request, snapshot, subscribe } from './bridge';
import { optionSections } from './ChatOptions';
import { useDialogNavigation } from './dialogs';
import { useLanguage } from './language';
import './attachments.css';

export interface PickedAttachment {token:string;name:string;size:number;mime?:string;thumbnail?:string}
export interface RecentPhotos {batch:string;access:'full'|'limited'|'denied';items:{id:string;name:string;thumbnail:string}[]}
type Props={desktop:boolean;children:ReactNode;camera():void;picker():void;prepared(item:PickedAttachment):void;close():void};

/** No file leaves the device while browsing; a selected photo still needs the send confirmation. */
export function AttachmentPanel({desktop,children,camera,picker,prepared,close}:Props){
  const {t}=useLanguage();
  const [selected,setSelected]=useState('gallery'),[photos,setPhotos]=useState<RecentPhotos>(),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const alive=useRef(false),scope=useRef(crypto.randomUUID()),origin=useRef({owner:snapshot().selfId,chat:snapshot().active,topic:snapshot().topic?.id||0});
  const latest=useRef({prepared,close});latest.current={prepared,close};
  const sections=optionSections(children),section=sections.find(item=>item.id===selected);
  const heading=useRef<HTMLHeadingElement>(null),galleryButton=useRef<HTMLButtonElement>(null);
  const current=()=>alive.current&&snapshot().selfId===origin.current.owner&&snapshot().active===origin.current.chat&&(snapshot().topic?.id||0)===origin.current.topic;
  async function load(permission=false){
    setBusy(true);setError('');
    try{const value=await request<RecentPhotos|null>(permission?'attachment.photos.permission':'attachment.recents',{scope:scope.current});if(current()&&value)setPhotos(value);}
    catch(failure){if(current())setError(failure instanceof Error?failure.message:'No se pudo abrir la galería.');}
    finally{if(current())setBusy(false);}
  }
  useEffect(()=>{
    alive.current=true;if(!desktop)void load();
    const unsubscribe=subscribe(()=>{if(!current())latest.current.close();});
    return()=>{alive.current=false;unsubscribe();if(!desktop)void request('attachment.recents.close',{scope:scope.current}).catch(()=>{});};
  },[]);
  useDialogNavigation(selected!=='gallery',()=>{setSelected('gallery');galleryButton.current?.focus();});
  async function pick(id:string){
    if(busy||!photos)return;setBusy(true);setError('');
    try{
      const item=await request<PickedAttachment>('attachment.photo',{scope:scope.current,batch:photos.batch,id});
      if(current()&&item)latest.current.prepared({...item,thumbnail:photos.items.find(photo=>photo.id===id)?.thumbnail});
      else if(item)void request('attachment.discard',{token:item.token}).catch(()=>{});
    }catch(failure){if(current())setError(failure instanceof Error?failure.message:'No se pudo preparar la foto.');}
    finally{if(current())setBusy(false);}
  }
  async function systemPhotos(){
    if(desktop){picker();return;}if(busy)return;setBusy(true);setError('');
    try{const item=await request<PickedAttachment|null>('attachment.pick',{kind:'photo'});if(current()&&item)latest.current.prepared(item);else if(item)void request('attachment.discard',{token:item.token}).catch(()=>{});}
    catch(failure){if(current())setError(failure instanceof Error?failure.message:'No se pudo abrir el selector de fotos.');}
    finally{if(current())setBusy(false);}
  }
  return <div className="attachment-panel">
    <section aria-label={t(section?.title??'Galería')}>
      {section?<><div className="chat-options-heading"><span aria-hidden="true">{section.icon}</span><div><h3 ref={heading} tabIndex={-1}>{t(section.title)}</h3><p>{t(section.description)}</p></div></div><div className="action-list chat-options-actions">{section.children}</div></>:<>
        <div className="attachment-gallery-heading"><h3>{t('Galería')} <ChevronDown size={15}/></h3><button type="button" className="text-button" disabled={busy} onClick={()=>desktop?picker():void load()}><RefreshCw size={14}/>{t('Recientes')}</button><button type="button" className="text-button" disabled={busy} onClick={()=>void systemPhotos()}>{t('Ver todas')}</button></div>
        {busy&&<p role="status">{t('Preparando fotos…')}</p>}
        <div className="attachment-gallery-grid" aria-busy={busy}>
          {!desktop&&<button type="button" className="attachment-camera" disabled={busy} onClick={camera}><Camera size={32}/><strong>{t('Cámara')}</strong></button>}
          {photos?.items.map(photo=><button type="button" key={photo.id} className="attachment-photo" disabled={busy} aria-label={`${t('Seleccionar foto')}: ${photo.name}`} onClick={()=>void pick(photo.id)}><img src={photo.thumbnail} alt="" loading="lazy"/></button>)}
          {(desktop||!photos?.items.length)&&<button type="button" className="attachment-camera" disabled={busy} onClick={()=>void systemPhotos()}><Image size={30}/><strong>{t('Elegir fotos')}</strong></button>}
        </div>
        {!desktop&&photos?.access==='denied'&&<div className="attachment-access"><p>{t('Permite el acceso para ver tus fotos recientes aquí, o elige fotos con el selector del sistema.')}</p><button type="button" className="secondary" disabled={busy} onClick={()=>void load(true)}>{t('Permitir fotos')}</button></div>}
        {!desktop&&photos?.access==='limited'&&<div className="attachment-access"><p>{t('Solo se muestran las fotos que has autorizado.')}</p><button type="button" className="text-button" disabled={busy} onClick={()=>void load(true)}>{t('Elegir más fotos')}</button></div>}
        {photos?.access==='full'&&!photos.items.length&&!busy&&<p>{t('No hay fotos recientes disponibles. Puedes usar el selector del sistema.')}</p>}
        <small>{t('Selecciona una foto para revisarla antes de enviar. Para varias fotos, usa Álbum de fotos.')}</small>
      </>}
      {error&&<p role="alert">{error} <button type="button" className="text-button" disabled={busy} onClick={()=>void load()}>{t('Reintentar')}</button></p>}
    </section>
    <div className="attachment-banner" role="group" aria-label={t('Secciones de adjuntos')}>
      <button ref={galleryButton} type="button" disabled={busy} aria-pressed={selected==='gallery'} onClick={()=>setSelected('gallery')}><span><Image/></span><strong>{t('Galería')}</strong></button>
      {sections.map(item=><button type="button" key={item.id} disabled={busy} aria-pressed={selected===item.id} onClick={()=>{setSelected(item.id);requestAnimationFrame(()=>heading.current?.focus());}}><span>{item.icon}</span><strong>{t(item.title)}</strong></button>)}
    </div>
  </div>;
}
