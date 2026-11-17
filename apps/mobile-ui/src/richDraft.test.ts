import { describe, expect, it } from 'vitest';
import {
  COMPOSER_TYPES, MAX_ENTITIES, MAX_LENGTH, activeMarks, applyEdit, editDraft, editRegion,
  insertAt, lineSpan, matchTypedMarkdown, normalize, removeLink, segments, setLink, toggleMark,
} from './richDraft';
import type { TextEntity } from './contract';

const bold=(offset:number,length:number):TextEntity=>({type:'bold',offset,length});
const id='8765432109876543210';
const emoji=(offset:number):TextEntity=>({type:'customEmoji',offset,length:2,customEmojiId:id});
const typed=(text:string,caret:number,entities:TextEntity[]=[])=>matchTypedMarkdown(text,entities,caret);

describe('richDraft · normalizar y leer el modelo',()=>{
  it('ordena por posición, descarta lo que no cabe y suelda lo pegado del mismo tipo',()=>{
    expect(normalize('hola mundo',[bold(5,5),bold(0,4)])).toEqual([bold(0,4),bold(5,5)]);
    expect(normalize('hola',[bold(2,9),{type:'italic',offset:0,length:0}])).toEqual([]);
    expect(normalize('hola',[bold(0,2),bold(2,2)])).toEqual([bold(0,4)]);
    expect(normalize('🦆🦆',[emoji(0),emoji(2)])).toEqual([emoji(0),emoji(2)]);
  });

  it('corta en cada frontera de entidad y ordena las marcas de fuera a dentro',()=>{
    expect(segments('abcdef',[bold(0,3),{type:'italic',offset:1,length:4}])).toEqual([
      {start:0,end:1,marks:['bold']},
      {start:1,end:3,marks:['bold','italic']},
      {start:3,end:5,marks:['italic']},
      {start:5,end:6,marks:[]},
    ]);
  });

  it('una marca solo está activa si cubre toda la selección',()=>{
    expect([...activeMarks([bold(0,4)],1,4)]).toEqual(['bold']);
    expect([...activeMarks([bold(0,4)],0,5)]).toEqual([]);
    expect([...activeMarks([bold(0,4)],3,2)]).toEqual(['bold']);
  });

  it('lo que el compositor puede escribir es lo que los dos puentes aceptan',()=>{
    expect([...COMPOSER_TYPES]).toEqual(['bold','italic','underline','strikethrough','spoiler','code','pre','blockquote','link','customEmoji']);
    expect(MAX_LENGTH).toBe(4096);
    expect(MAX_ENTITIES).toBe(100);
  });
});

describe('richDraft · marcar y desmarcar',()=>{
  it('aplicar cubre el rango y quitarlo por dentro parte la entidad',()=>{
    const all=toggleMark('hola mundo',[],'bold',0,10);
    expect(all).toEqual([bold(0,10)]);
    expect(toggleMark('hola mundo',all,'bold',5,10)).toEqual([bold(0,5)]);
    expect(toggleMark('hola mundo',all,'bold',0,4)).toEqual([bold(4,6)]);
    expect(toggleMark('hola mundo',[bold(0,4)],'bold',2,6)).toEqual([bold(0,6)]);
    expect(toggleMark('hola mundo',toggleMark('hola mundo',[],'bold',0,4),'bold',0,4)).toEqual([]);
  });

  it('la cita ocupa líneas enteras, se escriba donde se escriba',()=>{
    const text='uno\ndos\ntres';
    expect(lineSpan(text,5,7)).toEqual([4,7]);
    const quoted=toggleMark(text,[],'blockquote',5,5);
    expect(quoted).toEqual([{type:'blockquote',offset:4,length:3}]);
    expect(toggleMark(text,quoted,'blockquote',6,6)).toEqual([]);
  });

  it('el enlace nuevo reemplaza a los que toca y ningún esquema raro entra',()=>{
    const first=setLink('hola mundo',[],5,10,'https://t.me');
    expect(first).toEqual([{type:'link',offset:5,length:5,url:'https://t.me'}]);
    expect(setLink('hola mundo',first,0,10,'tg://x')).toEqual([{type:'link',offset:0,length:10,url:'tg://x'}]);
    expect(setLink('hola mundo',first,5,10,'javascript:alert(1)')).toEqual(first);
    expect(setLink('hola mundo',first,5,10,`https://${'a'.repeat(2048)}`)).toEqual(first);
    expect(removeLink(first,5,10)).toEqual([]);
    expect(removeLink(first,6,8)).toEqual([
      {type:'link',offset:5,length:1,url:'https://t.me'},
      {type:'link',offset:8,length:2,url:'https://t.me'},
    ]);
  });
});

describe('richDraft · reanclar al teclear',()=>{
  it('dentro de la marca se hereda; en el borde y fuera, no',()=>{
    expect(applyEdit([bold(0,4)],{start:2,end:2,inserted:1})).toEqual([bold(0,5)]);
    expect(applyEdit([bold(0,4)],{start:4,end:4,inserted:1})).toEqual([bold(0,4)]);
    expect(applyEdit([bold(5,4)],{start:4,end:4,inserted:1})).toEqual([bold(6,4)]);
  });

  it('borrar dentro recorta, borrar por fuera desplaza',()=>{
    expect(applyEdit([bold(0,4)],{start:1,end:3,inserted:0})).toEqual([bold(0,2)]);
    expect(applyEdit([bold(4,4)],{start:0,end:2,inserted:0})).toEqual([bold(2,4)]);
    expect(editRegion('hola','hola')).toEqual({start:4,end:4,inserted:0});
  });

  it('el texto que llega del compositor deja intacto lo de antes',()=>{
    expect(editDraft('hola','holaaa',[bold(0,4)],4)).toEqual([bold(0,6)]);
    expect(editDraft('hola','la',[bold(0,4)],0)).toEqual([bold(0,2)]);
  });

  it('conserva el segundo emoji al borrar el primero de dos glifos idénticos',()=>{
    expect(editDraft('🦆🦆','🦆',[emoji(2)],0)).toEqual([emoji(0)]);
    expect(editDraft('🦆🦆','🦆',[emoji(0)],0)).toEqual([]);
  });

  it('insertar un glifo deja una entidad con su id exacto',()=>{
    expect(insertAt([],1,3,2,id)).toEqual([emoji(1)]);
    expect(insertAt([bold(0,4)],4,4,2)).toEqual([bold(0,4)]);
  });
});

describe('richDraft · markdown escrito a mano',()=>{
  it('el marcador cerrado antes del caret se vuelve entidad y desaparece',()=>{
    expect(typed('**hola**',8)).toEqual({text:'hola',entities:[bold(0,4)],caret:4});
    expect(typed('~~tachado~~',11)).toEqual({text:'tachado',entities:[{type:'strikethrough',offset:0,length:7}],caret:7});
    expect(typed('`código`',8)).toEqual({text:'código',entities:[{type:'code',offset:0,length:6}],caret:6});
    expect(typed('```var a```',11)).toEqual({text:'var a',entities:[{type:'pre',offset:0,length:5}],caret:5});
  });

  it('la conversión deja el caret donde estaba el texto, no al final',()=>{
    expect(typed('escribe **negra** aqui',17)).toEqual({
      text:'escribe negra aqui',
      entities:[{type:'bold',offset:8,length:5}],
      caret:13,
    });
  });

  it('el enlace escrito a mano se convierte con su url',()=>{
    expect(typed('[hola](https://t.me)',20)).toEqual({
      text:'hola',
      entities:[{type:'link',offset:0,length:4,url:'https://t.me'}],
      caret:4,
    });
    expect(typed('[x](javascript:alert(1))',24)).toBeUndefined();
  });

  it('nada de lo que no está cerrado, escapado o roto se convierte',()=>{
    expect(typed('**hola',6)).toBeUndefined();
    expect(typed('\\**hola**',9)).toBeUndefined();
    expect(typed('****',4)).toBeUndefined();
    expect(typed('**a\nb**',7)).toBeUndefined();
    expect(typed('',0)).toBeUndefined();
  });

  it('una marca que ya estaba no se duplica al cerrar el marcador',()=>{
    expect(typed('**hola**',8,[bold(0,4)])?.entities).toEqual([bold(0,4)]);
  });
});
