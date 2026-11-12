import { useLayoutEffect, useRef } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { InboxTab } from './chatFilters';
import { InboxTabEmoji, InboxTabIcon } from './InboxTabs';
import { useLanguage } from './language';

export function InboxTabBar({tabs, active, unread, choose, manage}:{
  tabs:readonly InboxTab[]; active:string; unread:number; choose(id:string):void; manage():void;
}) {
  const {t}=useLanguage();
  const strip=useRef<HTMLDivElement>(null);
  const track=useRef<HTMLDivElement>(null);
  const selected=useRef<HTMLButtonElement>(null);
  const indicator=useRef<HTMLSpanElement>(null);

  useLayoutEffect(()=>{
    const button=selected.current;
    const pill=indicator.current;
    const row=track.current;
    const viewport=strip.current;
    if(!button||!pill||!row||!viewport)return;
    const measure=()=>{
      const width=button.offsetWidth;
      if(!width){pill.hidden=true;return;}
      const left=button.offsetLeft;
      const bounds=viewport.getBoundingClientRect();
      const current=button.getBoundingClientRect();
      pill.style.width=width+'px';
      pill.style.transform=`translateX(${left}px)`;
      pill.hidden=false;
      if(current.right>bounds.right)viewport.scrollLeft+=current.right-bounds.right;
      else if(current.left<bounds.left)viewport.scrollLeft-=bounds.left-current.left;
    };
    measure();
    const observer=new ResizeObserver(measure);
    observer.observe(button);
    observer.observe(row);
    observer.observe(viewport);
    return ()=>observer.disconnect();
  },[active,tabs]);

  return <div className="chat-tabs" role="group" aria-label={t('Filtrar chats')}>
    <div className="inbox-tab-scroll" ref={strip}>
      <div className="inbox-tab-track" ref={track}>
        <span className="inbox-tab-indicator" ref={indicator} aria-hidden="true" hidden/>
        {tabs.map(tab=>{
          const isActive=active===tab.id;
          const count=tab.id==='unread'?unread:0;
          return <button type="button" className="inbox-tab" key={tab.id} ref={isActive?selected:undefined}
            aria-pressed={isActive} aria-label={tab.emoji?tab.name+(count?' · '+count:''):undefined}
            title={tab.emoji?tab.name:undefined} onClick={()=>choose(tab.id)}>
            {tab.emoji?<InboxTabEmoji emoji={tab.emoji}/>:<><InboxTabIcon icon={tab.icon}/>{tab.name}</>}
            {count>0&&<span className="chat-tab-unread">{count}</span>}
          </button>;
        })}
      </div>
    </div>
    <button type="button" className="tabs-manage-button" aria-label={t('Administrar pestañas')} onClick={manage}>
      <SlidersHorizontal size={17} aria-hidden="true"/>
    </button>
  </div>;
}
