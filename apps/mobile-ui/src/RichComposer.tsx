import { forwardRef, useEffect, useImperativeHandle, useRef, type KeyboardEvent } from 'react';
import type { TextEntity, TextEntityType } from './contract';
import { activeMarks, MAX_LENGTH, segments } from './richDraft'; import { native, request } from './bridge';

/**
 * Compositor WYSIWYG. El estado vive fuera: `text` y `entities` son las entidades de Telegram, y este
 * componente solo pinta el DOM desde ellas y devuelve la cadena que el navegador escribió. No se usa
 * `execCommand` ni se interpreta HTML pegado: lo único que se lee del DOM es el texto, y las marcas se
 * reanclan por diferencia contra el modelo. Como el DOM es una función del modelo, se puede repintar
 * sin perder el cursor, y como no se repinta cuando la firma ya coincide, teclear no corta el teclado.
 */
export interface RichEditor {
  focus():void;
  blur():void;
  selection():{start:number;end:number};
  select(start:number,end:number):void;
}

interface Props {
  text:string;
  entities:TextEntity[];
  placeholder:string;
  label:string;
  enterSends:boolean;
  onEdit(text:string,caret:number):void;
  onSend():void;
  onSelection(marks:Set<TextEntityType>):void;
  onBlur():void;
  onKeyDown?(event:KeyboardEvent<HTMLElement>):void;
}

const BLOCK=new Set(['DIV','P','LI','BLOCKQUOTE','PRE']);
const filler=(node:Node)=>node instanceof HTMLElement&&node.dataset.fill==='1';
const markOf=(node:HTMLElement)=>/^text-[a-zA-Z]+$/.test(node.className)?node.className.slice(5):'';

interface Leaf { node:Text; start:number; end:number }
interface Layout { text:string; leaves:Leaf[]; spans:Map<Node,[number,number]> }

/** Cadena tal como está escrita en el DOM: saltos de línea por `<br>`, bloques con salto propio, sin relleno. */
function layout(root:HTMLElement):Layout {
  const leaves:Leaf[]=[];
  const spans=new Map<Node,[number,number]>();
  let out='';
  const visit=(node:Node,inside:boolean)=>{
    if(node.nodeType===3) {
      const leaf=node as Text,start=out.length;
      out+=leaf.data;
      spans.set(node,[start,out.length]);
      leaves.push({node:leaf,start,end:out.length});
      return;
    }
    if(filler(node)){spans.set(node,[out.length,out.length]);return;}
    if(node instanceof HTMLBRElement){const start=out.length;out+='\n';spans.set(node,[start,out.length]);return;}
    if(!(node instanceof HTMLElement))return;
    if(BLOCK.has(node.tagName)&&inside&&out&&!out.endsWith('\n'))out+='\n';
    const start=out.length;
    for(const child of Array.from(node.childNodes))visit(child,true);
    spans.set(node,[start,out.length]);
  };
  for(const child of Array.from(root.childNodes))visit(child,false);
  return {text:out,leaves,spans};
}

/** Posición del caret en offsets del modelo: unidades UTF-16, las mismas que mide Telegram. */
function offsetOf(root:HTMLElement,anchor:Node|null,position:number):number {
  const map=layout(root);
  const span=anchor?map.spans.get(anchor):undefined;
  if(!anchor||!span)return map.text.length;
  if(anchor.nodeType===3)return span[0]+Math.min(Math.max(position,0),span[1]-span[0]);
  if(anchor instanceof HTMLBRElement)return span[0]+(position>0?1:0);
  let offset=span[0];
  for(const child of Array.from(anchor.childNodes).slice(0,position)) {
    const inner=map.spans.get(child);
    if(inner)offset+=inner[1]-inner[0];
  }
  return Math.min(offset,span[1]);
}

function locate(root:HTMLElement,offset:number):{node:Node;position:number} {
  const map=layout(root);
  const target=Math.max(0,Math.min(offset,map.text.length));
  for(const leaf of map.leaves) if(target>=leaf.start&&target<=leaf.end) return {node:leaf.node,position:target-leaf.start};
  return {node:root,position:root.childNodes.length};
}

function marksOf(root:HTMLElement,node:Node|null):string {
  const chain:string[]=[];
  for(let current:Node|null|undefined=node;current&&current!==root;current=current.parentElement) {
    const mark=current instanceof HTMLElement?markOf(current):'';
    if(mark)chain.push(mark);
  }
  return chain.reverse().join('/');
}

/** Lo que hay escrito, hoja por hoja: texto y, de cada nodo, su largo y cadena de marcas o un salto de línea. */
function domState(root:HTMLElement):{text:string;shape:string} {
  const parts:string[]=[];
  let text='';
  const walk=(node:Node)=>{
    if(filler(node))return;
    if(node instanceof HTMLBRElement){text+='\n';parts.push('b');return;}
    if(node.nodeType===3){const leaf=node as Text;text+=leaf.data;parts.push(`t${leaf.data.length}:${marksOf(root,leaf)}`);return;}
    if(node instanceof HTMLElement&&BLOCK.has(node.tagName))parts.push('B');
    for(const child of Array.from(node.childNodes))walk(child);
  };
  for(const child of Array.from(root.childNodes))walk(child);
  return {text,shape:parts.join('|')};
}

/** Lo que el modelo exige, en el mismo formato, para poder comparar sin repintar a ciegas. */
function modelSignature(text:string,entities:TextEntity[]):string {
  const parts:string[]=[];
  for(const segment of segments(text,entities)) {
    const marks=segment.marks.join('/');
    text.slice(segment.start,segment.end).split('\n').forEach((line,index)=>{
      if(index>0)parts.push('b');
      if(line)parts.push(`t${line.length}:${marks}`);
    });
  }
  return parts.join('|');
}

function wrap(node:Node,marks:TextEntityType[]):Node {
  let current=node;
  for(const type of [...marks].reverse()) {
    const span=document.createElement('span');
    span.className=`text-${type}`;
    span.appendChild(current);
    current=span;
  }
  return current;
}

function paint(root:HTMLElement,text:string,entities:TextEntity[]):void {
  const fragment=document.createDocumentFragment();
  for(const segment of segments(text,entities)) {
    text.slice(segment.start,segment.end).split('\n').forEach((line,index)=>{
      if(index>0)fragment.appendChild(document.createElement('br'));
      if(line)fragment.appendChild(wrap(document.createTextNode(line),segment.marks));
    });
  }
  if(!text||text.endsWith('\n')) {
    const br=document.createElement('br');
    br.dataset.fill='1';
    fragment.appendChild(br);
  }
  root.textContent='';
  root.appendChild(fragment);
}

export const RichComposer=forwardRef<RichEditor,Props>((props,ref)=>{
  const field=useRef<HTMLDivElement>(null);
  const composing=useRef(false);
  const caret=useRef({start:0,end:0});
  const pending=useRef<number|null>(null);
  const latest=useRef(props);
  latest.current=props;

  function selection(){
    const root=field.current;
    if(!root)return{start:0,end:0};
    const active=document.getSelection();
    if(!active||active.rangeCount===0||!root.contains(active.anchorNode))return caret.current;
    const start=offsetOf(root,active.anchorNode,active.anchorOffset);
    const end=offsetOf(root,active.focusNode,active.focusOffset);
    caret.current={start,end};
    return caret.current;
  }

  function select(start:number,end:number){
    const root=field.current;
    const active=document.getSelection();
    if(!root||!active)return;
    const from=locate(root,start),to=locate(root,end);
    const range=document.createRange();
    try {
      range.setStart(from.node,from.position);
      range.setEnd(to.node,to.position);
    }
    catch {return;}
    active.removeAllRanges();
    active.addRange(range);
    caret.current={start,end};
  }

  /** Dónde está el caret después de que el navegador haya escrito: el lado del foco, no el ancla. */
  function caretOffset(root:HTMLElement){
    const active=document.getSelection();
    return offsetOf(root,active?.focusNode??null,active?.focusOffset??0);
  }

  /** Entrega el texto nuevo y dónde quedó el caret, para que el padre reancle con desambiguación. */
  function submit(text:string,caretAt:number){
    pending.current=caretAt;
    props.onEdit(text.length>MAX_LENGTH?text.slice(0,MAX_LENGTH):text,Math.min(caretAt,MAX_LENGTH));
  }

  useImperativeHandle(ref,()=>({
    focus:()=>field.current?.focus(),
    blur:()=>field.current?.blur(),
    selection,
    select,
  }));

  useEffect(()=>{
    const root=field.current;
    if(!root||composing.current)return;
    const painted=domState(root);
    const wanted=pending.current;
    pending.current=null;
    if(root.childNodes.length&&painted.text===props.text&&painted.shape===modelSignature(props.text,props.entities))return;
    const before=wanted===null?selection():{start:wanted,end:wanted};
    paint(root,props.text,props.entities);
    select(before.start,before.end);
    props.onSelection(activeMarks(props.entities,before.start,before.end));
  });

  useEffect(()=>{
    const root=field.current;
    if(!root)return;
    const onMove=()=>{
      const active=document.getSelection();
      if(!active||!root.contains(active.anchorNode))return;
      const {start,end}=selection();
      latest.current.onSelection(activeMarks(latest.current.entities,start,end));
    };
    document.addEventListener('selectionchange',onMove);
    return()=>{document.removeEventListener('selectionchange',onMove);if(native)void request('composer.focus',{active:false}).catch(()=>{});};
  },[]);

  return <div
    ref={field}
    className="rich-field"
    contentEditable
    suppressContentEditableWarning
    role="textbox"
    aria-multiline="true"
    aria-label={props.label}
    data-placeholder={props.placeholder}
    data-empty={props.text.length?'false':'true'}
    onInput={()=>{
      if(composing.current)return;
      const root=field.current;
      if(!root)return;
      const read=layout(root).text;
      if(read!==props.text)submit(read,caretOffset(root));
    }}
    onCompositionStart={()=>{composing.current=true;}}
    onCompositionEnd={()=>{
      composing.current=false;
      const root=field.current;
      if(!root)return;
      submit(layout(root).text,caretOffset(root));
    }}
    onPaste={event=>{
      event.preventDefault();
      const value=event.clipboardData.getData('text/plain');
      if(!value)return;
      const {start,end}=selection();
      submit(props.text.slice(0,start)+value+props.text.slice(end),start+value.length);
    }}
    onKeyDown={event=>{
      props.onKeyDown?.(event);
      if(event.defaultPrevented)return;
      if(event.key!=='Enter'||event.nativeEvent.isComposing)return;
      if(!event.shiftKey&&(props.enterSends||event.ctrlKey||event.metaKey)){event.preventDefault();props.onSend();return;}
      event.preventDefault();
      const {start,end}=selection();
      submit(props.text.slice(0,start)+'\n'+props.text.slice(end),start+1);
    }}
    onFocus={()=>{if(native)void request('composer.focus',{active:true}).catch(()=>{});}} onBlur={()=>{if(native)void request('composer.focus',{active:false}).catch(()=>{});props.onBlur();}}/>;
});
