import type { Message } from './contract';
import { MediaView } from './MediaView';
import { Bot, ChevronRight, Coins, Contact, Gift, Image, Info, ListChecks, MessageSquare, MoreHorizontal, Palette, PartyPopper, Pencil, Phone, Pin, Rocket, Send, Shield, Sparkles, Timer, Trophy, Users, Wallet } from 'lucide-react';
import './service-message.css';

const icons:Record<string,typeof Info>={members:Users,title:Pencil,photo:Image,security:Shield,pin:Pin,call:Phone,gift:Gift,payment:Wallet,giveaway:PartyPopper,ton:Coins,topic:MessageSquare,poll:ListChecks,webapp:Sparkles,contact:Contact,boost:Rocket,background:Palette,theme:Palette,timer:Timer,game:Trophy,checklist:ListChecks,post:Send,bot:Bot,community:Users};

export function ServiceMessage({message,time,jump,menu,highlighted}:{message:Message;time:string;jump?():void;menu?():void;highlighted?:boolean}){
  const service=message.service;
  if(!service)return null;
  const Icon=icons[service.kind]??Info;
  return <div data-history-incoming={message.outgoing?undefined:message.id} className={`service-row service-${service.kind} ${highlighted?'highlight':''}`} onContextMenu={menu?event=>{event.preventDefault();menu();}:undefined}>
    <div className="service-pill">
      {service.photo?<span className="service-photo"><MediaView media={service.photo} auto/></span>:<Icon size={13} aria-hidden/>}
      <span className="service-text">{service.text}</span>
      {service.messageId&&jump&&<button type="button" className="service-jump" onClick={jump} aria-label="Ver el mensaje relacionado" title="Ver el mensaje relacionado"><ChevronRight size={13}/></button>}
      <time>{time}</time>
      {menu&&<button type="button" className="service-menu" onClick={menu} aria-label="Opciones del mensaje" title="Opciones del mensaje"><MoreHorizontal size={13}/></button>}
    </div>
  </div>;
}
