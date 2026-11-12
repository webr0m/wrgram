import { useEffect, useRef } from 'react';
import { mediaUrl } from './bridge';
import { readTgs } from './tgs';

export function TgsSticker({id,onError}:{id:number;onError():void}){
  const host=useRef<HTMLSpanElement>(null);
  useEffect(()=>{let disposed=false;let animation:{destroy():void}|undefined;const controller=new AbortController();void fetch(mediaUrl(id),{signal:controller.signal}).then(response=>{if(!response.ok)throw new Error('No se pudo leer la animación');return response.arrayBuffer();}).then(buffer=>readTgs(new Uint8Array(buffer))).then(data=>import('lottie-web/build/player/lottie_light').then(({default:lottie})=>{if(disposed||!host.current)return;animation=lottie.loadAnimation({container:host.current,renderer:'svg',loop:true,autoplay:true,animationData:data});})).catch(()=>{if(!disposed)onError();});return()=>{disposed=true;controller.abort();animation?.destroy();if(host.current)host.current.replaceChildren();};},[id,onError]);
  return <span className="tgs-sticker-animation" ref={host} role="img" aria-label="Sticker animado de Telegram"/>;
}
