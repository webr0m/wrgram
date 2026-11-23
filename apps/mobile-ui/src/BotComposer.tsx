import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { Bot, ChevronRight, Grid2X2, List, LoaderCircle } from 'lucide-react';
import { request, snapshot } from './bridge';
import type { State, TextEntity } from './contract';
import type { RichEditor } from './RichComposer';
import { MAX_ENTITIES, MAX_LENGTH } from './richDraft';
import { commandQuery, commandText, insertCommand, matchingCommands, type BotCommand, type BotCommandInfo } from './botCommands';
import './bot-composer.css';

export function useBotComposer({state,text,entities,editor,change}:{
  state:State;text:string;entities:TextEntity[];editor:RefObject<RichEditor|null>;
  change(text:string,entities:TextEntity[],start:number,end?:number):void;
}) {
  const chat=state.chats.find(item=>item.id===state.active);
  const group=chat?.type==='group';
  const scope=state.selfId+':'+state.active;
  const enabled=state.ready&&state.canSend&&!!chat&&(chat.bot||group)&&chat.type!=='secret';
  const [result,setResult]=useState<{scope:string;info?:BotCommandInfo;error?:string}>();
  const [attempt,setAttempt]=useState(0);
  const [opened,setOpened]=useState('');
  const [dismissed,setDismissed]=useState('');
  const [selected,setSelected]=useState({key:'',index:0});
  const [launching,setLaunching]=useState('');
  const [launchError,setLaunchError]=useState<{scope:string;text:string}>();
  const list=useRef<HTMLDivElement>(null);
  const liveScope=useRef(scope);liveScope.current=scope;
  useEffect(()=>{
    if(!enabled)return;
    let current=true;
    setOpened('');setDismissed('');setLaunchError(undefined);
    setResult(undefined);
    void request<BotCommandInfo>('bot.commands',{id:state.active}).then(info=>{
      if(current&&info?.chatId===state.active)setResult({scope,info});
    }).catch(()=>{if(current)setResult({scope,error:'No se pudieron cargar los comandos del chat.'});});
    return()=>{current=false;};
  },[scope,enabled,attempt]);

  const info=enabled&&result?.scope===scope?result.info:undefined;
  const {start,end}=editor.current?.selection()??{start:text.length,end:text.length};
  const query=commandQuery(text,start,end,entities);
  const lookup=scope+':'+text+':'+start+':'+end;
  const expanded=opened===scope||!!query&&dismissed!==lookup;
  const choices=info&&expanded?matchingCommands(info.commands,query,group):[];
  const index=selected.key===lookup?Math.min(selected.index,Math.max(0,choices.length-1)):0;
  useEffect(()=>{list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'nearest'});},[lookup,index]);

  function choose(command:BotCommand){
    if(!enabled||liveScope.current!==scope)return;
    const next=insertCommand(text,entities,command,group,query,start);
    if(next.text.length>MAX_LENGTH||next.entities.length>MAX_ENTITIES)return;
    change(next.text,next.entities,next.caret);
    setOpened('');
    requestAnimationFrame(()=>{
      const now=snapshot();
      if(now.selfId+':'+now.active!==scope)return;
      editor.current?.focus();editor.current?.select(next.caret,next.caret);
    });
  }

  function onKeyDown(event:KeyboardEvent<HTMLElement>){
    if(!choices.length||event.nativeEvent.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();setOpened('');setDismissed(lookup);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();setSelected({key:lookup,index:(index+(event.key==='ArrowDown'?1:-1)+choices.length)%choices.length});return;
    }
    if((event.key==='Enter'&&!event.shiftKey&&!event.ctrlKey&&!event.metaKey)||event.key==='Tab'){
      event.preventDefault();choose(choices[index]);
    }
  }

  async function openApp(){
    if(launching===scope||!info?.menu)return;
    setLaunching(scope);setLaunchError(undefined);
    try{await request('bot.menu.open',{id:state.active});}
    catch(error){if(liveScope.current===scope)setLaunchError({scope,text:error instanceof Error?error.message:'No se pudo abrir la Mini App.'});}
    finally{setLaunching(previous=>previous===scope?'':previous);}
  }

  const error=enabled&&result?.scope===scope?result.error:undefined;
  const tools=<>
    {choices.length>0&&<div ref={list} className="bot-command-list" role="listbox" aria-label="Comandos del chat">
      {choices.map((command,position)=><button type="button" role="option" aria-selected={index===position}
        className={index===position?'selected':''} key={command.botId+':'+command.name}
        onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setSelected({key:lookup,index:position})} onClick={()=>choose(command)}>
        <span className="bot-command-icon"><Bot size={18}/></span><span className="bot-command-copy">
          <strong>{commandText(command,group,query?.addressed)}</strong><small>{command.description}</small>
          {group&&<small className="bot-command-author">{command.botName}</small>}
        </span><ChevronRight size={15}/>
      </button>)}
    </div>}
    {info&&(info.commands.length>0||info.menu&&state.platform==='android')&&<div className="bot-composer-tools">
      {info.menu&&state.platform==='android'&&<button type="button" className="bot-miniapp-button" disabled={launching===scope}
        onClick={()=>void openApp()}>{launching===scope?<LoaderCircle size={16} className="spin"/>:<Grid2X2 size={16}/>}<span>{info.menu.text||'Abrir Mini App'}</span></button>}
      {info.commands.length>0&&<button type="button" aria-label="Comandos del bot" aria-expanded={expanded}
        onMouseDown={event=>event.preventDefault()} onClick={()=>{setOpened(expanded?'':scope);setDismissed(expanded?lookup:'');}}><List size={16}/><span>Comandos</span></button>}
    </div>}
    {error&&<div className="bot-composer-error" role="status">{error}<button type="button" onClick={()=>setAttempt(value=>value+1)}>Reintentar</button></div>}
    {launchError?.scope===scope&&<p className="bot-composer-error" role="alert">{launchError.text}</p>}
  </>;
  return {tools,onKeyDown};
}
