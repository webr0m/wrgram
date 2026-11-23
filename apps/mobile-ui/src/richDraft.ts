import type { TextEntity, TextEntityType } from './contract';

/**
 * Modelo del compositor WYSIWYG. La única verdad es lo que también viaja por el puente: una cadena y
 * sus entidades con offsets en unidades UTF-16, que son las mismas que usa Telegram y las mismas que
 * miden `String.length` y los offsets de un `Range` del DOM. El HTML no es nunca el estado: se pinta
 * desde aquí y se descarta al leer el texto.
 */
export interface Draft { text:string; entities:TextEntity[]; caret:number }

export const MAX_ENTITIES=100;
export const MAX_LENGTH=4096;

const MARKS=new Set<TextEntityType>(['bold','italic','underline','strikethrough','spoiler','code','pre','blockquote']);
const LINES=new Set<TextEntityType>(['blockquote','pre']);
const LINKISH=new Set<TextEntityType>(['link']);
/** Lo único que el compositor escribe en el borrador: sirve para comparar el borrador local con el de Telegram. */
export const COMPOSER_TYPES=new Set<TextEntityType>([...MARKS,'link','customEmoji','botCommand']);
/** Tipos que pueden fusionarse cuando quedan pegados; un emoji personalizado nunca se fusiona. */
const MERGEABLE=new Set<TextEntityType>([...MARKS,'link']);
const SAFE_URL=/^(https?:\/\/|tg:\/\/)/i;

/** De fuera a dentro, igual que `ORDER` de formatting.tsx, para que el compositor y la burbuja se parezcan. */
const NESTED: TextEntityType[]=['blockquote','pre','link','bold','italic','underline','strikethrough','spoiler','code','preCode'];
const rank=(type:TextEntityType)=>{const index=NESTED.indexOf(type);return type==='customEmoji'?NESTED.length+1:index<0?NESTED.length:index;};

const same=(a:TextEntity,b:TextEntity)=>a.url===b.url&&a.customEmojiId===b.customEmojiId;

/** Ordena, recorta al texto, quita lo vacío o fuera de rango y fusiona lo del mismo tipo que se toca. */
export function normalize(text:string,entities:TextEntity[]):TextEntity[] {
  const clean=entities
    .filter(item=>item&&Number.isInteger(item.offset)&&Number.isInteger(item.length)&&item.length>0&&item.offset>=0&&item.offset+item.length<=text.length)
    .slice()
    .sort((a,b)=>a.offset-b.offset||rank(a.type)-rank(b.type));
  const out:TextEntity[]=[];
  for(const item of clean) {
    const last=out[out.length-1];
    if(last&&last.type===item.type&&MERGEABLE.has(item.type)&&same(last,item)&&last.offset+last.length>=item.offset) {
      last.length=Math.max(last.offset+last.length,item.offset+item.length)-last.offset;
      continue;
    }
    out.push({...item});
  }
  return out;
}

export interface Segment { start:number; end:number; marks:TextEntityType[] }

/** Cortes en cada frontera de entidad: la lista plana que el DOM tiene que representar. */
export function segments(text:string,entities:TextEntity[]):Segment[] {
  const bounds=new Set<number>([0,text.length]);
  for(const item of entities) if(item.length>0&&item.offset>=0&&item.offset+item.length<=text.length) {bounds.add(item.offset);bounds.add(item.offset+item.length);}
  const points=[...bounds].sort((a,b)=>a-b);
  const out:Segment[]=[];
  for(let index=0;index<points.length-1;index++) {
    const start=points[index],end=points[index+1];
    out.push({start,end,marks:entities.filter(item=>item.offset<=start&&item.offset+item.length>=end).map(item=>item.type).sort((a,b)=>rank(a)-rank(b))});
  }
  return out;
}

/** Las marcas que cubren por completo la selección: lo que va a estar pulsado en la barra. */
export function activeMarks(entities:TextEntity[],start:number,end:number):Set<TextEntityType> {
  const from=Math.min(start,end),to=Math.max(start,end);
  return new Set(entities.filter(item=>item.offset<=from&&item.offset+item.length>=to).map(item=>item.type));
}

/** Las citas y los bloques de código ocupan líneas enteras, como las trata Telegram. */
export function lineSpan(text:string,start:number,end:number):[number,number] {
  const from=text.lastIndexOf('\n',Math.max(0,start)-1)+1;
  let to=text.indexOf('\n',Math.max(start,end));
  if(to<0)to=text.length;
  return [from,to];
}

function subtract(entities:TextEntity[],type:TextEntityType,from:number,to:number):TextEntity[] {
  const out:TextEntity[]=[];
  for(const item of entities) {
    const begin=item.offset,finish=item.offset+item.length;
    if(item.type!==type||finish<=from||begin>=to) {out.push(item);continue;}
    if(begin<from)out.push({...item,length:from-begin});
    if(finish>to)out.push({...item,offset:to,length:finish-to});
  }
  return out;
}

/** Aplicar una marca une; quitarla donde ya cubre todo el rango la sustrae, partiendo la entidad si hace falta. */
export function toggleMark(text:string,entities:TextEntity[],type:TextEntityType,start:number,end:number):TextEntity[] {
  const [from,to]=LINES.has(type)?lineSpan(text,start,end):[Math.min(start,end),Math.max(start,end)];
  const covered=to>from&&entities.some(item=>item.type===type&&item.offset<=from&&item.offset+item.length>=to);
  const base=subtract(entities,type,from,to);
  return covered?normalize(text,base):normalize(text,base.concat([{type,offset:from,length:to-from}]));
}

/** Un enlace no puede solaparse con otro enlace: el nuevo reemplaza a los que toque. */
export function setLink(text:string,entities:TextEntity[],start:number,end:number,url:string):TextEntity[] {
  const from=Math.min(start,end),to=Math.max(start,end);
  const trimmed=url.trim();
  if(to<=from||trimmed.length>2048||!SAFE_URL.test(trimmed))return normalize(text,entities);
  const base=entities.filter(item=>!(LINKISH.has(item.type)&&item.offset+item.length>from&&item.offset<to));
  return normalize(text,base.concat([{type:'link',offset:from,length:to-from,url:trimmed}]));
}

export const removeLink=(entities:TextEntity[],start:number,end:number):TextEntity[] =>
  subtract(entities,'link',Math.min(start,end),Math.max(start,end));

export interface Region { start:number; end:number; inserted:number }

/**
 * Región cambiada entre dos cadenas. El caret desempata repeticiones: sin él, borrar uno de dos emojis
 * idénticos no dice cuál se fue. Es el mismo escaneo en tres pasadas que ya usaba el borrador de emoji.
 */
export function editRegion(before:string,after:string,caret=after.length):Region {
  if(before===after)return{start:caret,end:caret,inserted:0};
  let oldEnd=before.length,newEnd=after.length,start=0;
  while(oldEnd>0&&newEnd>caret&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  while(start<oldEnd&&start<newEnd&&before[start]===after[start])start++;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  return{start,end:oldEnd,inserted:newEnd-start};
}

/**
 * Reanclaje tras editar texto. Tres comportamientos, y los tres son los que se ven en el DOM:
 * lo anterior a la edición no se mueve, lo posterior se desplaza, y lo que la edición atraviesa se
 * recorta. En una inserción limpia solo se hereda la marca si el caret cae **dentro** del rango: al
 * escribir pegado al borde de una palabra en negrita, el carácter nuevo no sale en negrita.
 */
export function applyEdit(entities:TextEntity[],region:Region):TextEntity[] {
  const {start,end,inserted}=region,delta=inserted-(end-start);
  const map=(point:number)=>point<=start?point:point>=end?point+delta:start+inserted;
  const out:TextEntity[]=[];
  for(const item of entities) {
    const begin=item.offset,finish=item.offset+item.length;
    let offset:number,length:number;
    if(start===end&&inserted>0) {
      if(finish<=start){offset=begin;length=finish-begin;}
      else if(begin>=start){offset=begin+inserted;length=finish-begin;}
      else{offset=begin;length=finish-begin+inserted;}
    } else {offset=map(begin);length=map(finish)-map(begin);}
    if(length>0)out.push({...item,offset,length});
  }
  return out;
}

/** El paso que da el compositor en cada pulsación: texto nuevo dentro, entidades reancladas fuera. */
export function editDraft(before:string,after:string,entities:TextEntity[],caret?:number):TextEntity[] {
  return normalize(after,applyEdit(entities,editRegion(before,after,caret)));
}

/** Insertar un glifo (emoji normal o personalizado) sobre la selección, con las marcas del entorno intactas. */
export function insertAt(entities:TextEntity[],start:number,end:number,inserted:number,customEmojiId?:string):TextEntity[] {
  const base=applyEdit(entities,{start,end,inserted});
  if(!customEmojiId)return base;
  return base.concat([{type:'customEmoji',offset:start,length:inserted,customEmojiId}]);
}

const TYPED:[string,TextEntityType][]=[['```','pre'],['**','bold'],['__','italic'],['~~','strikethrough'],['||','spoiler'],['`','code']];

function closeTyped(text:string,entities:TextEntity[],caret:number,open:number,marker:string,type:TextEntityType,body:string):Draft {
  const size=marker.length;
  const tail=text.slice(0,caret-size)+text.slice(caret);
  const tailEntities=applyEdit(entities,{start:caret-size,end:caret,inserted:0});
  const next=tail.slice(0,open)+tail.slice(open+size);
  const moved=normalize(next,applyEdit(tailEntities,{start:open,end:open+size,inserted:0}).concat([
    (()=>{const [from,to]=LINES.has(type)?lineSpan(next,open,open+body.length):[open,open+body.length];return{type,offset:from,length:to-from};})(),
  ]));
  return {text:next,entities:moved,caret:open+body.length};
}

function closeLink(text:string,entities:TextEntity[],caret:number):Draft|undefined {
  const head=text.slice(0,caret);
  if(!head.endsWith(')'))return undefined;
  const middle=head.lastIndexOf('](');
  const open=middle<0?-1:head.lastIndexOf('[',middle);
  if(open<0||open>middle)return undefined;
  const label=head.slice(open+1,middle),url=head.slice(middle+2,caret-1);
  if(!label||label.includes('[')||label.includes(']')||url.length>2048||!SAFE_URL.test(url))return undefined;
  const next=text.slice(0,open)+label+text.slice(caret);
  return {text:next,
    entities:normalize(next,applyEdit(entities,{start:open,end:caret,inserted:label.length}).concat([{type:'link',offset:open,length:label.length,url}])),
    caret:open+label.length};
}

/**
 * El marcador cerrado justo antes del caret se convierte en entidad y desaparece del texto: se escribe
 * markdown y se ve el resultado, que es lo que hace Telegram cuando tecreas. Solo una conversión por
 * pulsación, y nunca dentro de un escape (`\**`) ni con un cuerpo que vuelva a llevar el marcador.
 */
export function matchTypedMarkdown(text:string,entities:TextEntity[],caret:number):Draft|undefined {
  if(caret<2||caret>text.length)return undefined;
  const head=text.slice(0,caret);
  for(const [marker,type] of TYPED) {
    if(!head.endsWith(marker))continue;
    const open=head.lastIndexOf(marker,head.length-marker.length-1);
    if(open<0||(open>0&&head[open-1]==='\\'))continue;
    const body=head.slice(open+marker.length,head.length-marker.length);
    if(!body||body.includes(marker)||(!LINES.has(type)&&/[\r\n]/.test(body)))continue;
    return closeTyped(text,entities,caret,open,marker,type,body);
  }
  return closeLink(text,entities,caret);
}
