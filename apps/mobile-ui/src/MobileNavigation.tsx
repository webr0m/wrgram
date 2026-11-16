import type { CSSProperties, ReactNode } from 'react';
import { MessageCircle, Puzzle, Sparkles } from 'lucide-react';

export type NavigationPage='chats'|'plugins'|'assistant'|'settings';
const DESTINATIONS=[
  {id:'chats',label:'Chats',icon:MessageCircle},
  {id:'plugins',label:'Apps',accessible:'Complementos',icon:Puzzle},
  {id:'assistant',label:'WR IA',icon:Sparkles},
] as const;

/** Telegram-style glass capsule; WRGram's existing destinations remain connected. */
export function MobileNavigation({page,side=false,unread=0,accountOpen=false,account,navigate,openAccount,t}:{
  page:NavigationPage;side?:boolean;unread?:number;accountOpen?:boolean;account:ReactNode;
  navigate(page:NavigationPage):void;openAccount():void;t(text:string):string;
}) {
  const index=accountOpen||page==='settings'?3:DESTINATIONS.findIndex(item=>item.id===page);
  return <nav className={side?'mobile-nav mobile-nav-side':'mobile-nav'} aria-label={t('Secciones')} style={{'--nav-index':index} as CSSProperties}>
    <span className="mobile-nav-indicator" aria-hidden="true"/>
    {DESTINATIONS.map(({id,label,icon:Icon,...item},position)=>{
      const accessible=t('accessible' in item?item.accessible:label);
      return <button type="button" className={`mobile-nav-item ${index===position?'selected':''}`} key={id}
        aria-label={id==='chats'&&unread>0?`${accessible} (${unread})`:accessible}
        aria-current={page===id?'page':undefined} title={accessible} onClick={()=>navigate(id)}>
        <span className="mobile-nav-icon" aria-hidden="true"><Icon/>{id==='chats'&&unread>0&&<span className="mobile-nav-badge">{unread>99?'99+':unread}</span>}</span>
        <span className="mobile-nav-label">{t(label)}</span>
      </button>;
    })}
    <button type="button" className={`mobile-nav-item mobile-nav-account ${index===3?'selected':''}`}
      aria-label={t('Abrir menú de usuario')} aria-haspopup="dialog" aria-expanded={accountOpen}
      aria-current={page==='settings'?'page':undefined} onClick={openAccount}>
      <span className="mobile-nav-icon" aria-hidden="true">{account}</span><span className="mobile-nav-label">{t('Cuenta')}</span>
    </button>
  </nav>;
}
