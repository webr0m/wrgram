import { type ReactNode, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Download, FileText, Image, LoaderCircle, Maximize2, Play, Video, X } from 'lucide-react';
import type { Media } from './contract';
import { mediaUrl, native, request, snapshot, subscribe } from './bridge';
import { useDialog } from './dialogs';
import { loadMedia } from './mediaQueue';
import { imageTargetWidth, largestImageVariant, pickImageVariant } from './mediaSizes';
import { DocumentViewer, documentFormat } from './DocumentViewer';
import { TgsSticker } from './TgsSticker';
import './media-viewer.css';

const bytes=(size:number)=>size<1048576?`${Math.ceil(size/1024)} KB`:`${(size/1048576).toFixed(1)} MB`;
const density=()=>typeof window==='undefined'?1:window.devicePixelRatio||1;

export function MediaView({media,auto=false,eager=false,fallback,passive=false,fileControls=false,playInView=false}:{media:Media;auto?:boolean;eager?:boolean;fallback?:ReactNode;passive?:boolean;fileControls?:boolean;playInView?:boolean}){
  const state=useSyncExternalStore(subscribe,snapshot);
  const trackVisibility=playInView||!!media.animated;
  const animate=trackVisibility&&(media.kind!=='image'||media.mime==='image/gif');
  const previewLimit=media.animated?24*1024*1024:8*1024*1024;
  const ref=useRef<HTMLSpanElement>(null);
  const wasOnline=useRef(state.online);
  const [boxWidth,setBoxWidth]=useState(0);
  const [visible,setVisible]=useState(false),[thumbVisible,setThumbVisible]=useState(false),[load,setLoad]=useState(false),[error,setError]=useState(false),[thumbError,setThumbError]=useState(false),[retry,setRetry]=useState(0),[autoAttempts,setAutoAttempts]=useState(0),[thumbAttempts,setThumbAttempts]=useState(0);
  const [viewerOpen,setViewerOpen]=useState(false),[viewerError,setViewerError]=useState(false),[pendingPlayer,setPendingPlayer]=useState(false),[nativePlayback,setNativePlayback]=useState(false);
  const [fileError,setFileError]=useState('');
  const [documentOpen,setDocumentOpen]=useState(false);
  const format=media.kind==='file'?documentFormat(media):undefined;
  const [fileBusy,setFileBusy]=useState(false);
  const stickerError=useCallback(()=>setError(true),[]);
  // Only message photos carry variants; avatars, stickers and previews keep using `media.id`.
  const variants=media.variants&&media.variants.length>0?media.variants:undefined;
  const chosen=variants?pickImageVariant(variants,imageTargetWidth(boxWidth,density())):undefined;
  const loadId=chosen?.id??media.id;
  const resourceKey=state.selfId+':'+loadId;
  const lastReady=useRef<string|undefined>(undefined);
  const [manualRequest,setManualRequest]=useState<string>();
  const loadSize=chosen?.size??media.size;
  const viewerVariant=largestImageVariant(variants);
  const viewerId=viewerVariant?.id??loadId;
  const readyOf=(id:number,known:boolean)=>state.mediaReady?state.mediaReady.includes(id):id===media.id&&known;
  const ready=readyOf(loadId,media.ready);
  const evicted=!ready&&lastReady.current===resourceKey;
  const canFetch=!evicted||manualRequest===resourceKey;
  const viewerReady=readyOf(viewerId,media.ready);
  const thumb=media.thumbnail;
  const thumbReady=!!thumb&&(state.mediaReady?state.mediaReady.includes(thumb.id):thumb.ready);
  const downloading=!!state.mediaLoading?.includes(loadId)||!!state.mediaLoading?.includes(media.id);
  const nativeFailed=!ready&&!!state.mediaFailed?.includes(loadId);
  const failed=error||nativeFailed;
  const tooLarge=!ready&&!!media.downloadLimit&&loadSize>media.downloadLimit;
  const expandable=media.kind==='image'&&!passive&&(!!variants||fileControls);

  useEffect(()=>{
    if(!ready)return;
    lastReady.current=resourceKey;
    setManualRequest(previous=>previous===resourceKey?undefined:previous);
  },[ready,resourceKey]);
  useEffect(()=>{setLoad(false);setError(false);setNativePlayback(false);setFileError('');setDocumentOpen(false);setFileBusy(false);setThumbError(false);setVisible(false);setThumbVisible(false);setViewerOpen(false);setViewerError(false);setPendingPlayer(false);setBoxWidth(0);setRetry(0);setAutoAttempts(0);setThumbAttempts(0);},[media.id]);
  useEffect(()=>{setThumbError(false);setThumbAttempts(0);},[thumb?.id]);
  // IntersectionObserver is the fast path; the timer is a fallback for WebViews
  // that do not fire it inside virtualized lists. Avatars and small previews are eager.
  useEffect(()=>{
    const element=ref.current;
    if(!element||typeof IntersectionObserver==='undefined'){setVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>{
      setVisible(entry.isIntersecting);
      if(entry.isIntersecting&&!trackVisibility)observer.disconnect();
    });
    observer.observe(element);
    return()=>observer.disconnect();
  },[media.id,trackVisibility]);
  useEffect(()=>{if(eager)setVisible(true);},[eager,media.id]);
  useEffect(()=>{if(thumbVisible||eager){setThumbVisible(true);return;}if(!thumb||thumb.id<=0)return;const timer=setTimeout(()=>setThumbVisible(true),350);return()=>clearTimeout(timer);},[thumbVisible,eager,thumb?.id,media.id]);

  // The bubble width decides which Telegram photo size is worth downloading.
  useEffect(()=>{
    if(!variants)return;
    const element=ref.current;if(!element)return;
    // Swapping variants collapses the box until the new image decodes, so only
    // growing widths are kept; shrinking would bounce the chooser to a smaller size.
    const measure=()=>{const width=element.clientWidth||element.getBoundingClientRect().width||0;if(width>0)setBoxWidth(current=>width>current+4?width:current);};
    measure();
    if(typeof ResizeObserver==='undefined'){const timer=setTimeout(measure,80);return()=>clearTimeout(timer);}
    const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[media.id,variants?.length]);

  useEffect(()=>{
    if(media.id>0&&thumbVisible&&(!playInView||visible)&&thumb&&thumb.id>0&&!thumbReady&&!thumbError&&native)void loadMedia(thumb.id).catch(()=>setThumbError(true));
  },[media.id,thumbVisible,thumb?.id,thumbReady,thumbError,playInView,visible]);
  useEffect(()=>{
    if(media.id>0&&auto&&visible&&!ready&&!evicted&&!failed&&!tooLarge&&native&&loadSize<=previewLimit&&(!variants||boxWidth>0))setLoad(true);
  },[auto,visible,ready,evicted,failed,tooLarge,media.id,loadSize,native,boxWidth,variants?.length,previewLimit]);
  useEffect(()=>{
    if(media.id<=0||!load||ready||!canFetch||tooLarge||!native)return;
    let current=true;
    void loadMedia(loadId).catch(()=>{if(current)setError(true);});
    return()=>{current=false;};
  },[load,ready,loadId,canFetch,tooLarge,retry]);

  // A downloaded video opens in the native Media3 player once the file is on disk.
  useEffect(()=>{
    if(!pendingPlayer||!native||!ready)return;
    setPendingPlayer(false);
    void request('media.play',{id:media.id,title:media.name}).catch(()=>setNativePlayback(true));
  },[pendingPlayer,native,ready,media.id,media.name]);

  // Recover visible photos and previews after Telegram returns from a network outage.
  useEffect(()=>{
    const restored=state.online&&!wasOnline.current;
    wasOnline.current=state.online;
    if(!restored||!visible)return;
    if(thumb&&thumb.id>0&&!thumbReady){setThumbAttempts(0);setThumbError(false);}
    if(auto&&media.id>0&&!ready&&!evicted&&!tooLarge&&native&&loadSize<=previewLimit&&(!variants||boxWidth>0)){setAutoAttempts(0);setError(false);setLoad(true);setRetry(value=>value+1);void loadMedia(loadId).catch(()=>setError(true));}
  },[state.online,visible,auto,media.id,ready,evicted,tooLarge,thumb?.id,thumbReady,loadId,native,boxWidth,variants?.length,loadSize,previewLimit]);

  // A transient TDLib/WebView failure should not leave a thumbnail blank forever.
  useEffect(()=>{
    if(!thumbError||!state.online||!visible||!thumb||thumb.id<=0||!native||thumbAttempts>=2)return;
    const timer=setTimeout(()=>{setThumbAttempts(value=>value+1);setThumbError(false);},1200*(thumbAttempts+1));
    return()=>clearTimeout(timer);
  },[thumbError,state.online,visible,thumb?.id,thumbReady,thumbAttempts]);
  // Native failures arrive through mediaFailed without rejecting the bridge request,
  // so auto media must retry them too or an avatar could stay blank for the whole session.
  useEffect(()=>{
    if(!(error||nativeFailed)||!auto||!state.online||!visible||!native||!canFetch||tooLarge||loadSize>previewLimit||autoAttempts>=2)return;
    const timer=setTimeout(()=>{setAutoAttempts(value=>value+1);setError(false);setLoad(true);setRetry(value=>value+1);void loadMedia(loadId).catch(()=>setError(true));},1200*(autoAttempts+1));
    return()=>clearTimeout(timer);
  },[error,nativeFailed,auto,state.online,visible,media.id,loadId,canFetch,tooLarge,loadSize,previewLimit,autoAttempts]);
  useEffect(()=>{if(thumbReady){setThumbError(false);setThumbAttempts(0);}},[thumbReady]);

  // El visor a pantalla completa se bloquea a sí mismo, cierra con Escape, con atrás y con un toque
  // en el fondo; el bloqueo recae en el contenedor que realmente desplaza.
  const viewerHost=useRef<HTMLElement|null>(null);

  const placeholder=!thumbError&&thumbReady?mediaUrl(thumb!.id):media.minithumbnail?.startsWith('data:image/jpeg;base64,')?media.minithumbnail:undefined;
  const thumbnailVideo=!thumbError&&!!thumbReady&&!!thumb?.mime?.startsWith('video/');
  const thumbnailSticker=!thumbError&&!!thumbReady&&thumb?.mime==='application/x-tgsticker';
  const beginLoad=()=>{
    if(tooLarge)return;
    setManualRequest(resourceKey);
    setError(false);setThumbError(false);setAutoAttempts(0);setThumbAttempts(0);setLoad(true);setRetry(value=>value+1);
    if(native)void loadMedia(loadId).catch(()=>setError(true));
    if(thumb&&thumb.id>0&&!thumbReady)void loadMedia(thumb.id).catch(()=>setThumbError(true));
  };
  const startVideo=()=>{
    if(tooLarge)return;
    setError(false);setNativePlayback(false);setRetry(value=>value+1);
    if(!ready){setManualRequest(resourceKey);setLoad(true);}
    if(!native)return;
    if(ready)void request('media.play',{id:media.id,title:media.name}).catch(()=>setNativePlayback(true));
    else setPendingPlayer(true);
  };
  const openViewer=()=>{if(!ready)return;setViewerError(false);viewerHost.current=scrollParentOf(ref.current);setViewerOpen(true);if(native&&!viewerReady)void loadMedia(viewerId).catch(()=>{});};
  async function fileAction(action:'media.open'|'media.export'|'media.play',id:number){
    setFileBusy(true);
    setFileError('');
    try{
      await request(action,{id,title:media.name});
    }catch(reason){setFileError(reason instanceof Error?reason.message:'No se pudo abrir el archivo.');}
    finally{setFileBusy(false);}
  }
  if(media.id===0&&media.kind==='image'&&media.minithumbnail)return <span className="media-view image"><img src={media.minithumbnail} alt={media.name||'Miniatura del chat'} loading="lazy"/></span>;
  if(failed&&fallback&&!passive)return <span className="media-view image" ref={ref}><button type="button" className="media-fallback" aria-label={`Reintentar foto de ${media.name}`} onClick={beginLoad} disabled={tooLarge}>{fallback}</button></span>;
  const spinner=downloading||load&&!ready&&!failed&&native&&canFetch;
  const animationFrame=!!media.animated&&!passive;
  const aspectRatio=animationFrame&&media.width&&media.height
    ? `${Math.max(.8,Math.min(2.4,media.width/media.height))}`
    : undefined;
  function renderVideo(){
    if(passive||media.animated){
      const video=<video key={`${media.id}:${retry}`} src={mediaUrl(media.id)} poster={thumbnailVideo?undefined:placeholder} muted autoPlay loop playsInline preload="metadata" onError={()=>setError(true)}/>;
      return !passive&&native?<span className="animation-player">{video}<button type="button" className="animation-enlarge" aria-label="Abrir animación a pantalla completa" onClick={startVideo}><Maximize2 size={16}/></button></span>:video;
    }
    if(!native||nativePlayback)return <video key={`${media.id}:${retry}`} src={mediaUrl(media.id)} poster={thumbnailVideo?undefined:placeholder} controls playsInline preload="metadata" onError={()=>setError(true)}/>;
    return <span className="media-player"><video src={mediaUrl(media.id)} poster={thumbnailVideo?undefined:placeholder} muted playsInline preload="metadata" onError={()=>setNativePlayback(true)}/><button type="button" className="media-play" aria-label={`Reproducir ${media.name||'vídeo'} a pantalla completa`} onClick={startVideo}><span><Play size={26} fill="currentColor"/></span></button></span>;
  }
  const presentation=ready&&!error&&(!animate||visible)?media.kind==='video'?renderVideo():media.kind==='audio'?<><span className="audio-cover">{placeholder&&<img src={placeholder} alt="Portada del audio" loading="eager" decoding="async" onError={()=>setThumbError(true)}/>}</span><audio key={`${media.id}:${retry}`} src={mediaUrl(media.id)} controls preload="metadata" onError={()=>setError(true)}/></>:media.kind==='sticker'?<TgsSticker key={`${media.id}:${retry}`} id={media.id} onError={stickerError}/>:media.kind==='image'?expandable?<span className="media-shot"><img key={`${loadId}:${retry}`} src={mediaUrl(loadId)} alt={media.name||'Imagen de Telegram'} loading={eager?'eager':'lazy'} decoding="async" onClick={openViewer} onError={()=>setError(true)}/><button type="button" className="media-expand" aria-label={`Ampliar ${media.name||'foto'}`} onClick={openViewer}><Maximize2 size={14}/></button></span>:<img key={`${loadId}:${retry}`} src={mediaUrl(loadId)} alt={media.name||'Imagen de Telegram'} loading={eager?'eager':'lazy'} decoding="async" onError={()=>setError(true)}/>:<span className="file-ready">{thumbnailVideo?<video className="document-thumb" src={mediaUrl(thumb!.id)} muted autoPlay loop playsInline preload="metadata" aria-label="Vista previa animada" onError={()=>setThumbError(true)}/>:thumbnailSticker?<TgsSticker id={thumb!.id} onError={()=>setThumbError(true)}/>:placeholder?<img className="document-thumb" src={placeholder} alt="Miniatura del documento" loading="eager" decoding="async" onError={()=>setThumbError(true)}/>:<FileText/>}{media.name}</span>
      :passive||(media.animated&&ready&&!failed)?<span className="media-passive" aria-hidden="true">{fallback&&!placeholder?fallback:thumbnailVideo&&(!trackVisibility||visible)?<video className="media-thumbnail" src={mediaUrl(thumb!.id)} muted autoPlay loop playsInline preload="metadata"/>:thumbnailSticker&&(!trackVisibility||visible)?<TgsSticker id={thumb!.id} onError={()=>setThumbError(true)}/>:placeholder&&!thumbnailVideo&&!thumbnailSticker?<img src={placeholder} alt="" loading="eager" decoding="async"/>:spinner?<LoaderCircle className="spin" size={18}/>:media.kind==='video'?<Video size={18}/>:media.kind==='image'?<Image size={18}/>:<FileText size={18}/>}</span>
      :<button className="media-load" disabled={tooLarge||spinner} title={tooLarge?`Límite de descarga: ${bytes(media.downloadLimit||0)}`:undefined} onClick={media.kind==='video'&&native?startVideo:beginLoad} aria-label={tooLarge?`Archivo demasiado grande: ${media.name}`:`Descargar ${media.name}`}>{thumbnailVideo?<video className="media-thumbnail" src={mediaUrl(thumb!.id)} muted autoPlay loop playsInline preload="metadata" aria-label={`Vista previa de ${media.name||'archivo'}`} onError={()=>setThumbError(true)}/>:thumbnailSticker?<TgsSticker id={thumb!.id} onError={()=>setThumbError(true)}/>:placeholder&&<img className="media-thumbnail" src={placeholder} alt={`Miniatura de ${media.name||'archivo'}`} loading="eager" decoding="async" onError={()=>setThumbError(true)}/>}<span>{media.kind==='video'?<Video/>:media.kind==='image'?<Image/>:<FileText/>}</span>{spinner?<LoaderCircle className="spin" size={18}/>:<Download size={18}/>}<small>{tooLarge?`Límite ${bytes(media.downloadLimit||0)}`:failed?'No se pudo cargar · toca para reintentar':bytes(media.size)}</small></button>;
  return <span className={`media-view ${media.kind}${animationFrame?" media-animated":""}`} ref={ref}>
    {animationFrame?<span className="animation-frame" style={{aspectRatio}}>{presentation}</span>:presentation}
    {ready&&native&&fileControls&&<span className="file-actions">
      {format&&<button type="button" disabled={fileBusy} onClick={()=>format==='video'?void fileAction('media.play',loadId):setDocumentOpen(true)}>{format==='video'?<Play size={14}/>:<FileText size={14}/>} {format==='video'?'Reproducir':'Vista previa'}</button>}
      {media.exportable!==false&&<>
        {media.kind!=='sticker'&&<button type="button" disabled={fileBusy} onClick={()=>void fileAction('media.open',loadId)}>Abrir con…</button>}
        <button type="button" disabled={fileBusy} onClick={()=>void fileAction('media.export',viewerReady?viewerId:loadId)}><Download size={14}/> Guardar</button>
      </>}
      {fileError&&<small role="status">{fileError}</small>}
    </span>}
    {documentOpen&&format&&format!=='video'&&createPortal(<DocumentViewer key={loadId} media={{...media,id:loadId}} format={format} close={()=>setDocumentOpen(false)}/>,document.body)}
    {media.kind==='image'&&expandable&&viewerOpen&&createPortal(<PhotoViewer name={media.name} host={viewerHost.current} imageId={viewerReady&&!viewerError?viewerId:loadId} placeholder={placeholder} fail={()=>setViewerError(true)} close={()=>setViewerOpen(false)}/>,document.body)}
  </span>;
}

function scrollParentOf(from:HTMLElement|null):HTMLElement|null{
  let node=from?.parentElement||null;
  while(node){if(/(auto|scroll|hidden)/.test(getComputedStyle(node).overflowY))return node;node=node.parentElement;}
  return null;
}

function PhotoViewer({name,host,imageId,placeholder,fail,close}:{name?:string;host:HTMLElement|null;imageId:number;placeholder?:string;fail():void;close():void}){
  const ref=useRef<HTMLDivElement>(null);
  useDialog(ref,close);
  useEffect(()=>{
    // body no es quien desplaza aquí: bloquear el contenedor real es lo que impide que el
    // historial se mueva bajo el visor a pantalla completa.
    if(!host)return;
    const previous=host.style.overflow;
    host.style.overflow='hidden';
    return()=>{host.style.overflow=previous;};
  },[host]);
  return <div ref={ref} tabIndex={-1} className="media-viewer" role="dialog" aria-modal="true" aria-label={`Foto: ${name||'Telegram'}`} onClick={close}>{placeholder&&<span className="media-viewer-backdrop" style={{backgroundImage:`url(${placeholder})`}} aria-hidden="true"/>}<img className="media-viewer-image" src={mediaUrl(imageId)} alt={name||'Imagen de Telegram'} onClick={event=>event.stopPropagation()} onError={fail}/><button type="button" className="media-viewer-close" onClick={close} aria-label="Cerrar visor"><X size={20}/></button><small className="media-viewer-caption">{name||'Foto'}</small></div>;
}
