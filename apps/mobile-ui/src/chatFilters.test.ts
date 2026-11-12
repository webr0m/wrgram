import { describe, expect, it } from 'vitest';
import { CHAT_FILTERS, arrangeTabs, chatFilters, defaultRules, matchesTab, tabSource, type InboxTab } from './chatFilters';
import type { Chat } from './contract';

const labels=(folders:{id:number;title:string}[])=>chatFilters(folders).map(([,label])=>label);

describe('pestañas de chats',()=>{
  it('oculta una carpeta de Telegram que repite un filtro integrado',()=>{
    expect(labels([{id:2,title:'No leídos'}])).toEqual(['Todos','No leídos','Canales','Secretos','Grupos','Bots']);
  });

  it('oculta el plural de una carpeta que ya existe en singular',()=>{
    expect(labels([{id:3,title:'Personal'},{id:5,title:'Personales'}])).toEqual(['Todos','No leídos','Canales','Secretos','Grupos','Bots','Personal']);
    expect(labels([{id:5,title:'Personales'},{id:3,title:'Personal'}])).not.toContain('Personales');
  });

  it('ignora mayúsculas, tildes y espacios sobrantes al comparar',()=>{
    expect(labels([{id:7,title:'  NO LEIDOS '},{id:8,title:'personal '},{id:9,title:'PERSONALES'}])).toEqual(['Todos','No leídos','Canales','Secretos','Grupos','Bots','personal']);
  });

  it('mantiene las carpetas distintas en orden y con su clave',()=>{
    const filters=chatFilters([{id:11,title:'Trabajo'},{id:12,title:'Familia'}]);
    expect(filters.slice(CHAT_FILTERS.length)).toEqual([['folder:11','Trabajo'],['folder:12','Familia']]);
  });

  it('descarta títulos vacíos',()=>{
    expect(labels([{id:13,title:'   '}])).toHaveLength(CHAT_FILTERS.length);
  });
});

describe('personalización de la bandeja',()=>{
  it('conserva las preferencias y muestra las carpetas nuevas sin resucitar carpetas eliminadas',()=>{
    const rules={...defaultRules,source:'folder:11'};
    const saved:InboxTab[]=[{id:'custom:work',name:'Trabajo pendiente',rules},{id:'all',name:'Bandeja',hidden:true},{id:'folder:11',name:'Mi oficina'}];
    const folders=[{id:12,title:'Familia'}];
    const tabs=arrangeTabs(folders,saved);
    expect(tabs.slice(0,2)).toEqual(saved.slice(0,2));
    expect(tabs.some(tab=>tab.id==='folder:11')).toBe(false);
    expect(tabs.some(tab=>tab.id==='folder:12')).toBe(true);
    expect(tabSource('custom:work',tabs,folders)).toBe('main');
    expect(tabSource('custom:work',tabs,[{id:11,title:'Trabajo'}])).toBe('folder:11');
  });
  it('combina clase de chat, marca de lectura, avisos y fijación',()=>{
    const chat:Chat={id:'1',title:'Soporte',preview:'',date:0,unread:0,marked:true,bot:true,type:'private',pinned:true,muted:true,archived:false,supported:true};
    const rules={...defaultRules,type:'bot',read:'unread',muted:'muted',pinned:true} as const;
    expect(matchesTab(chat,rules)).toBe(true);
    expect(matchesTab({...chat,marked:false},rules)).toBe(false);
    expect(matchesTab({...chat,marked:false,unread:2},rules)).toBe(true);
    expect(matchesTab({...chat,pinned:false},rules)).toBe(false);
    expect(matchesTab({...chat,muted:false},rules)).toBe(false);
    expect(matchesTab(chat,{...rules,type:'private'})).toBe(false);
  });
});
