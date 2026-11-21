import { useEffect, useState, type ReactNode } from 'react';
import { CircleAlert, ContactRound, Gamepad2, MapPin, Play, Radio } from 'lucide-react';
import type { Media, Message } from './contract';
import { MediaView } from './MediaView';
import './message-extras.css';

type Run = <T=unknown>(method:string,params?:Record<string,unknown>)=>Promise<T|undefined>;

function formatGram(value:string) {
  return value.padStart(10,'0').replace(/^(\d+)(\d{9})$/, '$1,$2').replace(/,?0+$/, '')+' TON';
}

function Card({icon,title,children}:{icon:ReactNode;title:string;children?:ReactNode}) {
  return <section className="message-extra">
    <div className="message-extra-heading">{icon}<strong dir="auto">{title}</strong></div>
    {children}
  </section>;
}

function useLiveLocation(expiresAt:number) {
  const [endedAt,setEndedAt]=useState(0);
  useEffect(()=>{
    if(!expiresAt)return;
    const remaining=expiresAt*1000-Date.now();
    if(remaining<=0||remaining>2_147_483_647)return;
    const timer=setTimeout(()=>setEndedAt(expiresAt),remaining);
    return ()=>clearTimeout(timer);
  },[expiresAt]);
  return expiresAt>0&&endedAt!==expiresAt&&expiresAt*1000>Date.now();
}

function LocationCard({message,run}:{message:Message;run?:Run}) {
  const location=message.extra;
  const live=useLiveLocation(location?.kind==='location'?location.expiresAt??0:0);
  const [stopping,setStopping]=useState(false);
  if(location?.kind!=='location')return null;
  const hasPoint=location.latitude!==undefined&&location.longitude!==undefined;
  // La orden existe en las dos capas, pero lo que hace no es lo mismo: el teléfono apaga su rastreador y escribe el
  // final; Windows solo escribe el final porque no tuvo rastreador. La pantalla no lo distingue —lo que ve es la
  // bandera `canStop` que cada capa calcula con la misma regla.
  const stop=async()=>{setStopping(true);try{await run?.('location.live.stop',{id:message.id});}finally{setStopping(false);}};
  return <Card icon={live?<Radio size={19}/>:<MapPin size={19}/>} title={location.title}>
    {location.address&&<p dir="auto">{location.address}</p>}
    {location.latitude!==undefined&&location.longitude!==undefined&&<small dir="ltr">{location.latitude.toFixed(5)}, {location.longitude.toFixed(5)}</small>}
    {location.live&&<small role="status">{live?'Ubicación en vivo activa':'La ubicación dejó de actualizarse'}</small>}
    {!hasPoint&&<small>Coordenadas no disponibles.</small>}
    {hasPoint&&location.canOpen&&run&&<button type="button" className="text-button" onClick={()=>void run('message.location.open',{id:message.id})}>Abrir en el mapa</button>}
    {location.canStop&&run&&<button type="button" className="text-button" disabled={stopping} onClick={()=>void stop()}>{stopping?'Dejando de compartir…':'Dejar de compartir'}</button>}
  </Card>;
}

function ContactCard({message,run,openUser}:{message:Message;run?:Run;openUser?(id:string):void}) {
  const extra=message.extra;
  const [copied,setCopied]=useState(false);
  if(extra?.kind!=='contact')return null;
  // El botón se queda con las dos palabras de siempre si el puente negó la copia; lo que dice el motivo ya lo
  // cuenta el aviso del error, y prometer «copiado» sin que el portapapeles lo sea sería peor que callar.
  const copy=async()=>{setCopied((await run?.<boolean>('clipboard.copy',{text:extra.phone??''}))===true);};
  return <Card icon={<ContactRound size={19}/>} title={extra.name}>
    {extra.phone&&<p dir="ltr">{extra.phone}</p>}
    <div className="message-extra-actions">
      {extra.userId&&openUser&&<button type="button" className="text-button" onClick={()=>openUser(extra.userId)}>Abrir chat</button>}
      {extra.canCopy&&extra.phone&&run&&<button type="button" className="text-button" onClick={()=>void copy()}>{copied?'Número copiado':'Copiar número'}</button>}
    </div>
  </Card>;
}

function AnimatedEmoji({message,run}:{message:Message;run?:Run}) {
  const [effect,setEffect]=useState<Media>();
  const [cycle,replay]=useState(0);
  const extra=message.extra;
  if(extra?.kind!=='animatedEmoji')return null;
  const art=(effect??extra.media);
  const content=art?<MediaView key={cycle} media={art} auto passive playInView fallback={extra.emoji}/>:extra.emoji;
  const play=async()=>{
    replay(value=>value+1);
    const animation=await run?.<Media>('message.emoji.play',{id:message.id});
    if(animation?.id){setEffect(animation);replay(value=>value+1);}
  };
  return extra.interactive&&run
    ? <button type="button" className="message-emoji-art" aria-label={'Reproducir '+extra.emoji} onClick={()=>void play()}>{content}</button>
    : <span className="message-emoji-art" role="img" aria-label={extra.emoji}>{content}</span>;
}

export function MessageExtraCard({message,run,openUser,openStory,text}:{message:Message;run?:Run;openUser?(id:string):void;openStory?():void;text:ReactNode}) {
  const extra=message.extra;
  if(!extra)return null;
  switch(extra.kind){
    case 'location':return <LocationCard message={message} run={run}/>;
    case 'contact':return <ContactCard message={message} run={run} openUser={openUser}/>;
    case 'animatedEmoji':return <AnimatedEmoji message={message} run={run}/>;
    case 'dice':return <Card icon={<span aria-hidden="true">{extra.emoji}</span>} title={extra.stake?'Dado con apuesta':'Lanzamiento'}>
      {extra.media&&<span className="message-emoji-art"><MediaView media={extra.media} auto passive playInView fallback={extra.emoji}/></span>}
      <strong>{extra.value>0?'Resultado: '+extra.value:'Lanzamiento en curso'}</strong>
      {extra.stake&&/^\d+$/.test(extra.stake)&&<small>Apuesta: {formatGram(extra.stake)}</small>}
      {extra.prize&&/^\d+$/.test(extra.prize)&&<small>Premio: {formatGram(extra.prize)}</small>}
    </Card>;
    case 'game':return <Card icon={<Gamepad2 size={19}/>} title={extra.title}>
      {extra.media&&<div className="message-game-art"><MediaView media={extra.media} auto passive playInView/></div>}
      {message.text.trim()&&message.text!==extra.title?text:extra.description&&<p dir="auto">{extra.description}</p>}
    </Card>;
    case 'story':return <Card icon={<Play size={19}/>} title={extra.mention?'Mención en una historia':'Historia compartida'}>
      {openStory&&<button type="button" className="text-button" onClick={openStory}>Ver historia</button>}
    </Card>;
    case 'unsupported':return <Card icon={<CircleAlert size={19}/>} title="Contenido no disponible"><small>{message.text}</small></Card>;
  }
}
