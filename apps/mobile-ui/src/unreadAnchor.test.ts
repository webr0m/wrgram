import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Message } from './contract';
import { dividerIndex, incomingAfter, isNewMessage, newestIncomingId, scrollMarkToTop, shouldMarkRead, unreadAnchor, visibleReadBoundary } from './unread';

const source=(path:string)=>readFileSync(new URL(path,import.meta.url),'utf8');
const message=(id:number|string,outgoing=false):Message=>({id:String(id),chatId:'1',sender:outgoing?'Tú':'Ana',text:`m${id}`,date:Number(id),outgoing,status:'',edited:false,reactions:[]});
/** 'i' = incoming, 'o' = outgoing; ids start at 1 in order. */
const page=(spec:string)=>[...spec].map((flag,index)=>message(index+1,flag==='o'));

describe('ancla del primer mensaje no leído',()=>{
  it('acepta el ancla que entrega TDLib',()=>{
    expect(unreadAnchor({messages:page('iiiii'),anchor:'4',readInbox:'1',unread:2})).toBe(4);
  });

  it('ignora un ancla que ya quedó dentro de lo leído',()=>{
    expect(unreadAnchor({messages:page('iiiiii'),anchor:'2',readInbox:'4',unread:1})).toBe(5);
  });

  it('deriva el ancla de la frontera de lectura sin depender de TDLib',()=>{
    const messages=[message(101),message(102,true),message(103),message(104,true),message(105)];
    expect(incomingAfter(messages,'103')).toEqual([105]);
    expect(unreadAnchor({messages,anchor:'0',readInbox:'103',unread:0})).toBe(105);
    expect(unreadAnchor({messages,anchor:'',readInbox:'105',unread:0})).toBe(0);
  });

  it('cuenta desde el final cuando la frontera de lectura es desconocida',()=>{
    const messages=page('ioioii');
    expect(unreadAnchor({messages,anchor:'0',readInbox:'0',unread:2})).toBe(5);
    expect(unreadAnchor({messages,anchor:'0',readInbox:'0',unread:99})).toBe(1);
  });

  it('no inventa un ancla sin mensajes entrantes',()=>{
    expect(unreadAnchor({messages:page('oooo'),anchor:'0',readInbox:'0',unread:3})).toBe(0);
    expect(unreadAnchor({messages:[],anchor:'0',readInbox:'0',unread:3})).toBe(0);
    expect(unreadAnchor({messages:page('iii'),anchor:'0',readInbox:'3',unread:3})).toBe(0);
  });
});

describe('divisor y resaltado de mensajes nuevos',()=>{
  it('coloca el divisor en el primer entrante desde el ancla',()=>{
    expect(dividerIndex(page('oioii'),2)).toBe(1);
    expect(dividerIndex(page('iio'),3)).toBe(-1);
    expect(dividerIndex(page('iii'),0)).toBe(-1);
  });

  it('resalta desde el ancla y respeta la frontera cuando no hay ancla',()=>{
    expect(isNewMessage(message(4),4,0)).toBe(true);
    expect(isNewMessage(message(3),4,0)).toBe(false);
    expect(isNewMessage(message(4,true),4,0)).toBe(false);
    expect(isNewMessage(message(106),0,105)).toBe(true);
    expect(isNewMessage(message(105),0,105)).toBe(false);
    expect(isNewMessage(message(106),0,0)).toBe(false);
  });

  it('solo cuenta mensajes entrantes para el último nuevo',()=>{
    expect(newestIncomingId(page('ioio'))).toBe(3);
    expect(newestIncomingId([])).toBe(0);
  });
});

describe('marcar leído solo después de ver todos los nuevos',()=>{
  const base={latest:true,atBottom:true,newestIncoming:110,readInbox:105};

  it('no marca mientras falte historial o el usuario no llegue al final',()=>{
    expect(shouldMarkRead({...base,latest:false})).toBe(false);
    expect(shouldMarkRead({...base,atBottom:false})).toBe(false);
  });

  it('no marca si no hay nada nuevo',()=>{
    expect(shouldMarkRead({...base,newestIncoming:0})).toBe(false);
    expect(shouldMarkRead({...base,newestIncoming:105})).toBe(false);
  });

  it('marca cuando la ventana llega al final, está abajo y hay nuevos',()=>{
    expect(shouldMarkRead(base)).toBe(true);
  });
});

describe('avance por los mensajes visibles',()=>{
  const rows=[{id:'20',top:5,bottom:55},{id:'21',top:60,bottom:110},{id:'22',top:115,bottom:160}];
  it('avanza por los mensajes visibles sin marcar el que queda fuera',()=>{
    expect(visibleReadBoundary(rows,20,0,122)).toBe('21');
  });
  it('no marca un tramo anterior después de un salto a otro mensaje',()=>{
    expect(visibleReadBoundary(rows,19,0,160)).toBeUndefined();
    expect(visibleReadBoundary(rows,20,60,160)).toBeUndefined();
  });
});

describe('desplazamiento al ancla sin scrollIntoView',()=>{
  it('usa scrollTop directo y restaura el comportamiento suave',()=>{
    const style={scrollBehavior:'smooth'};
    let top=0;
    const host={style,get scrollTop(){return top;},set scrollTop(value:number){top=value;},getBoundingClientRect:()=>({top:100})} as unknown as HTMLElement;
    const mark={getBoundingClientRect:()=>({top:400})} as unknown as Element;
    scrollMarkToTop(host,mark);
    expect(top).toBe(300);
    expect(style.scrollBehavior).toBe('smooth');
  });

  it('no produce posiciones negativas',()=>{
    let top=0;
    const host={style:{scrollBehavior:''},get scrollTop(){return top;},set scrollTop(value:number){top=value;},getBoundingClientRect:()=>({top:100})} as unknown as HTMLElement;
    const mark={getBoundingClientRect:()=>({top:40})} as unknown as Element;
    scrollMarkToTop(host,mark);
    expect(top).toBe(0);
  });
});

describe('la interfaz y Android usan las mismas reglas',()=>{
  const app=source('./App.tsx');
  const session=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/TdSession.java');
  const legacy=source('../../mobile/android/app/src/main/java/cc/webrom/wrgram/MainActivity.java');
  const desktopState=source('../../desktop/src/WRGram.Desktop/DesktopState.cs');
  const desktopService=source('../../desktop/src/WRGram.Desktop/TelegramService.cs');

  it('App importa las decisiones y no vuelve a anclar con scrollIntoView',()=>{
    expect(app).toContain("from './unread'");
    expect(app).not.toContain('mark.scrollIntoView');
    expect(app).toContain('scrollMarkToTop(host,mark)');
    expect(app).toContain('dividerIndex(displayed,anchor)');
    expect(app).toContain('firstUnreadId({messages:state.messages');
    expect(app).toContain('shouldMarkRead({latest:state.history.latest');
  });

  it('TDLib calcula el ancla sin depender del orden de la página',()=>{
    expect(session).toContain('static long firstUnreadFromEnd');
    expect(session).toContain('java.util.TreeSet<Long> incoming');
  });

  it('la interfaz nativa abre en el ancla y limpia el marcador por chat',()=>{
    expect(legacy).toContain('long unreadAnchor = firstChat && opened != null ? opened.anchor : 0');
    expect(legacy).toContain('rows.get(i).id >= unreadAnchor');
    expect(legacy).toContain('if (firstChat) readAnchor = 0;');
  });

  it('el escritorio expone el ancla y también la calcula sin frontera de lectura',()=>{
    expect(desktopState).toContain('public string Anchor');
    expect(desktopService).toContain('FirstAfter(messages, entry.ReadInbox)');
    expect(desktopService).toContain('UnreadFromEnd(messages, entry.Unread)');
    expect(desktopService).toContain('_state.History.Anchor = "0"');
  });
});
